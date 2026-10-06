import Foundation
import Darwin
import FamilyControls
import DeviceActivity
import ManagedSettings

enum ScreenTimeIDs {
    static let groupID = "group.com.northstar.planner"
    static let storeName = ManagedSettingsStore.Name("northstar")
    static let dailyActivity = DeviceActivityName("northstar.daily")
    static let gracePrefix = "northstar.access-break."
}

enum ResumePolicy: String, Codable, CaseIterable, Identifiable {
    case tenMinuteBreak
    case untilTomorrow
    case restOfDay
    var id: String { rawValue }
    var title: String {
        switch self {
        case .tenMinuteBreak: return "10-minute access break"
        case .untilTomorrow: return "Stay limited until tomorrow"
        case .restOfDay: return "Unlock limited apps today"
        }
    }
}

struct ScreenTimeSettings: Codable {
    var enabled = false
    var warningMinutes = 30
    var limitMinutes = 60
    var resumePolicy: ResumePolicy = .tenMinuteBreak
}

/// Tokens are opaque Apple identifiers. Never log them or transmit them.
struct AppLimitEvent: Codable {
    let application: ApplicationToken
    let warningName: String
    let limitName: String
}

/// Selection, settings, and events are always committed as one configuration.
struct ScreenTimeConfiguration: Codable {
    let generation: String
    var selection: FamilyActivitySelection
    var settings: ScreenTimeSettings
    var events: [AppLimitEvent]
    var registrationCommitted = false
}

struct ScreenTimeAccessBreak: Codable {
    let activityName: String
    let tokens: Set<ApplicationToken>
    let deadline: Date
    var isCommitted = false
}

struct ScreenTimeState: Codable {
    var configuration: ScreenTimeConfiguration?
    var day = ""
    var limitedTokens: Set<ApplicationToken> = []
    var exemptTokens: Set<ApplicationToken> = []
    var accessBreak: ScreenTimeAccessBreak?
    var reflectionPauseEnd: Date?
    var reflectedAt: Date?
    var notifiedEvents: Set<String> = []

    mutating func resetDayIfNeeded(at date: Date) {
        let today = ScreenTimeShared.dayKey(for: date)
        guard day != today else { return }
        day = today
        limitedTokens = []
        exemptTokens = []
        accessBreak = nil
        notifiedEvents = []
    }

    func shieldTokens(at date: Date) -> Set<ApplicationToken> {
        guard day == ScreenTimeShared.dayKey(for: date),
              let configuration, configuration.settings.enabled,
              configuration.registrationCommitted else { return [] }
        var effective = limitedTokens.intersection(configuration.selection.applicationTokens)
        effective.subtract(exemptTokens)
        if let accessBreak, accessBreak.isCommitted, accessBreak.deadline > date {
            effective.subtract(accessBreak.tokens)
        }
        return effective
    }
}

struct ScreenTimeWarning {
    let event: String
    let day: String
    let minutes: Int
}

enum ScreenTimeSetupError: LocalizedError {
    case sharedContainerUnavailable
    case authorizationRequired
    case selectApplications
    case applicationsOnly
    case missingConfiguration
    case reflectionPauseRequired
    case accessBreakInProgress
    case limitsChangeDuringBreak
    var errorDescription: String? {
        switch self {
        case .sharedContainerUnavailable:
            return "The shared App Group is unavailable. Check signing and group.com.northstar.planner for every target."
        case .authorizationRequired:
            return "Allow Screen Time access before enabling app limits."
        case .selectApplications:
            return "Choose individual apps such as TikTok, Instagram, or Snapchat before enabling limits."
        case .applicationsOnly:
            return "Choose individual apps only. Whole categories and websites are not supported by these per-app limits."
        case .missingConfiguration:
            return "Screen Time settings could not be read. Open Northstar and configure your limits again."
        case .reflectionPauseRequired:
            return "Finish the ten-second pause and your reflection before requesting access."
        case .accessBreakInProgress:
            return "An access break is already running. Wait for it to end before requesting another break."
        case .limitsChangeDuringBreak:
            return "Finish your current access break before changing app limits."
        }
    }
}

/// Every app/extension access uses the same process-safe lock and fresh file data.
/// A separate lock inode remains stable when the JSON snapshot is atomically replaced.
final class ScreenTimeShared {
    private let stateURL: URL
    private let lockURL: URL

    init() throws {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: ScreenTimeIDs.groupID
        ) else { throw ScreenTimeSetupError.sharedContainerUnavailable }
        stateURL = container.appendingPathComponent("northstar-screen-time.json")
        lockURL = container.appendingPathComponent("northstar-screen-time.lock")
    }

    static func dayKey(for date: Date = Date()) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    private func withExclusiveLock<T>(_ operation: () throws -> T) throws -> T {
        let descriptor = Darwin.open(lockURL.path, O_CREAT | O_RDWR, mode_t(S_IRUSR | S_IWUSR))
        guard descriptor >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        defer { Darwin.close(descriptor) }
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: lockURL.path)
        guard Darwin.flock(descriptor, LOCK_EX) == 0 else {
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
        }
        defer { _ = Darwin.flock(descriptor, LOCK_UN) }
        return try operation()
    }

    private func loadLocked() throws -> ScreenTimeState {
        guard FileManager.default.fileExists(atPath: stateURL.path) else { return ScreenTimeState() }
        // Read from disk on every operation: no UserDefaults or process-local cached snapshot.
        return try JSONDecoder().decode(ScreenTimeState.self, from: Data(contentsOf: stateURL))
    }

    private func saveLocked(_ state: ScreenTimeState) throws {
        try JSONEncoder().encode(state).write(
            to: stateURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private func applyShieldsLocked(_ state: ScreenTimeState, at date: Date) {
        guard let configuration = state.configuration else { return }
        let store = ManagedSettingsStore(named: ScreenTimeIDs.storeName)
        if !configuration.settings.enabled {
            // Recover an interrupted disable after its authoritative state was persisted.
            store.clearAllSettings()
            return
        }
        // Interrupted registration never clears shields that were already applied.
        guard configuration.registrationCommitted else { return }
        let effective = state.shieldTokens(at: date)
        store.shield.applications = effective.isEmpty ? nil : effective
        store.shield.applicationCategories = nil
        store.shield.webDomains = nil
        store.shield.webDomainCategories = nil
    }

    /// Monitoring and configuration commit share the lock. A failed monitor start
    /// rolls back the whole value before any threshold callback can read it.
    func configure(_ configuration: ScreenTimeConfiguration,
                   startMonitoring: () throws -> Void) throws {
        try withExclusiveLock {
            var state = try loadLocked()
            let now = Date()
            state.resetDayIfNeeded(at: now)
            if let accessBreak = state.accessBreak, accessBreak.isCommitted, accessBreak.deadline > now {
                throw ScreenTimeSetupError.limitsChangeDuringBreak
            }
            state.accessBreak = nil
            // Restore any expired break before a new registration becomes provisional.
            try saveLocked(state)
            applyShieldsLocked(state, at: now)
            let previous = state
            state.configuration = configuration
            state.configuration?.registrationCommitted = false
            try saveLocked(state)
            do { try startMonitoring() }
            catch {
                try saveLocked(previous)
                throw error
            }
            state.configuration?.registrationCommitted = true
            state.resetDayIfNeeded(at: Date())
            // Merge/prune the latest state under the same lock as extension unions.
            state.limitedTokens.formIntersection(configuration.selection.applicationTokens)
            state.exemptTokens.formIntersection(configuration.selection.applicationTokens)
            try saveLocked(state)
            applyShieldsLocked(state, at: Date())
        }
    }

    func disable(stopMonitoring: () -> Void) throws {
        try withExclusiveLock {
            var state = try loadLocked()
            state.configuration?.settings.enabled = false
            state.limitedTokens = []
            state.exemptTokens = []
            state.accessBreak = nil
            state.reflectionPauseEnd = nil
            state.notifiedEvents = []
            try saveLocked(state)
            stopMonitoring()
            ManagedSettingsStore(named: ScreenTimeIDs.storeName).clearAllSettings()
        }
    }

    func reconcile(authorized: Bool = true) throws -> ScreenTimeState {
        try withExclusiveLock {
            var state = try loadLocked()
            let now = Date()
            state.resetDayIfNeeded(at: now)
            if let accessBreak = state.accessBreak, !accessBreak.isCommitted || accessBreak.deadline <= now {
                state.accessBreak = nil
            }
            try saveLocked(state)
            if authorized { applyShieldsLocked(state, at: now) }
            return state
        }
    }

    /// Event lookup and the per-app shield union use one configuration and transaction.
    func processThreshold(event: String) throws -> ScreenTimeWarning? {
        try withExclusiveLock {
            var state = try loadLocked()
            let now = Date()
            state.resetDayIfNeeded(at: now)
            guard let configuration = state.configuration else { return nil }
            guard configuration.settings.enabled else {
                applyShieldsLocked(state, at: now)
                return nil
            }
            guard configuration.registrationCommitted else { return nil }
            guard let entry = configuration.events.first(where: { $0.warningName == event || $0.limitName == event }) else { return nil }
            var warning: ScreenTimeWarning?
            if event == entry.warningName {
                if !state.notifiedEvents.contains(event) {
                    // Reserve one notification attempt; denied permission never disables shields.
                    state.notifiedEvents.insert(event)
                    warning = ScreenTimeWarning(event: event, day: state.day,
                                                minutes: configuration.settings.warningMinutes)
                }
            } else {
                state.limitedTokens.insert(entry.application)
            }
            try saveLocked(state)
            applyShieldsLocked(state, at: now)
            return warning
        }
    }

    func beginReflectionPause() throws -> Date {
        try withExclusiveLock {
            var state = try loadLocked()
            let now = Date()
            state.resetDayIfNeeded(at: now)
            if let existing = state.reflectionPauseEnd, existing > now.addingTimeInterval(-30 * 60) { return existing }
            let end = now.addingTimeInterval(10)
            state.reflectionPauseEnd = end
            try saveLocked(state)
            return end
        }
    }

    /// The host records the actual reflection in its planner store first.
    /// Only this explicit operation can grant access; a reflection save alone cannot.
    func completeReflection(unlock: Bool, policy: ResumePolicy,
                            startAccessBreak: (ScreenTimeAccessBreak) throws -> Void) throws {
        try withExclusiveLock {
            var state = try loadLocked()
            let now = Date()
            state.resetDayIfNeeded(at: now)
            if unlock {
                guard let end = state.reflectionPauseEnd, end <= now,
                      end > now.addingTimeInterval(-30 * 60) else { throw ScreenTimeSetupError.reflectionPauseRequired }
                guard state.configuration?.settings.enabled == true,
                      state.configuration?.registrationCommitted == true else {
                    throw ScreenTimeSetupError.missingConfiguration
                }
                let tokens = state.shieldTokens(at: now)
                if !tokens.isEmpty {
                    switch policy {
                    case .untilTomorrow: break
                    case .restOfDay: state.exemptTokens.formUnion(tokens)
                    case .tenMinuteBreak:
                        if let existing = state.accessBreak, existing.deadline > now {
                            throw ScreenTimeSetupError.accessBreakInProgress
                        }
                        let previous = state
                        let accessBreak = ScreenTimeAccessBreak(
                            activityName: ScreenTimeIDs.gracePrefix + UUID().uuidString,
                            tokens: tokens, deadline: now.addingTimeInterval(10 * 60))
                        state.accessBreak = accessBreak
                        // The provisional value never grants access; commit only after registration.
                        try saveLocked(state)
                        do { try startAccessBreak(accessBreak) }
                        catch { try saveLocked(previous); throw error }
                        state.accessBreak?.isCommitted = true
                    }
                }
            }
            state.reflectedAt = now
            state.reflectionPauseEnd = nil
            state.configuration?.settings.resumePolicy = policy
            try saveLocked(state)
            applyShieldsLocked(state, at: now)
        }
    }

    func restoreAccessBreak(activityName: String) throws {
        try withExclusiveLock {
            var state = try loadLocked()
            // Generation-specific schedule names reject callbacks from replaced/older breaks.
            guard let configuration = state.configuration else { return }
            if !configuration.settings.enabled {
                applyShieldsLocked(state, at: Date())
                return
            }
            guard configuration.registrationCommitted else { return }
            guard let accessBreak = state.accessBreak, accessBreak.activityName == activityName else { return }
            let now = Date()
            // Components have second precision. Avoid ending an unexpired break on an early callback.
            guard accessBreak.deadline.timeIntervalSince(now) <= 1 else { return }
            state.accessBreak = nil
            state.resetDayIfNeeded(at: now)
            try saveLocked(state)
            applyShieldsLocked(state, at: now)
        }
    }
}

import Foundation
import Combine
import FamilyControls
import DeviceActivity
import ManagedSettings
import UserNotifications

@MainActor
final class ScreenTimeController: ObservableObject {
    @Published var selection = FamilyActivitySelection()
    @Published var resumePolicy: ResumePolicy = .tenMinuteBreak
    @Published private(set) var enabled = false
    @Published private(set) var isBlocked = false
    @Published private(set) var blockedAppCount = 0
    @Published private(set) var accessBreakEndsAt: Date?
    @Published private(set) var error: String?
    @Published private(set) var notificationDenied = false
    @Published private(set) var registrationInterrupted = false
    @Published private(set) var authorizationStatus: AuthorizationStatus = AuthorizationCenter.shared.authorizationStatus

    private let center = DeviceActivityCenter()
    var isAuthorized: Bool { authorizationStatus == .approved }
    var selectedAppCount: Int { selection.applicationTokens.count }
    var legacyUsageCountingNote: String? {
        if #available(iOS 17.4, *) { return nil }
        return "On iOS 17.0–17.3, usage before limits are enabled or reconfigured may not be counted. Upgrade to iOS 17.4 or later for explicit counting of earlier usage in today's interval."
    }

    init() { refreshStatus() }

    func requestAuthorization() async {
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            authorizationStatus = AuthorizationCenter.shared.authorizationStatus
            if isAuthorized {
                let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
                notificationDenied = !granted
            }
            error = nil
        } catch { self.error = error.localizedDescription }
        refreshStatus()
    }

    /// Each selected application gets its own 30-minute warning and 60-minute limit.
    func configureLimits() throws {
        do {
            authorizationStatus = AuthorizationCenter.shared.authorizationStatus
            guard isAuthorized else { throw ScreenTimeSetupError.authorizationRequired }
            guard selection.categoryTokens.isEmpty, selection.webDomainTokens.isEmpty else {
                throw ScreenTimeSetupError.applicationsOnly
            }
            guard !selection.applicationTokens.isEmpty else { throw ScreenTimeSetupError.selectApplications }
            var settings = ScreenTimeSettings()
            settings.enabled = true
            settings.resumePolicy = resumePolicy
            let generation = UUID().uuidString
            let tokens = try selection.applicationTokens.sorted {
                try JSONEncoder().encode($0).base64EncodedString() < JSONEncoder().encode($1).base64EncodedString()
            }
            let map = tokens.enumerated().map { index, token in
                AppLimitEvent(application: token,
                              warningName: "northstar.warning.\(generation).\(index)",
                              limitName: "northstar.limit.\(generation).\(index)")
            }
            var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
            for entry in map {
                events[DeviceActivityEvent.Name(entry.warningName)] = makeEvent(
                    application: entry.application, minutes: settings.warningMinutes)
                events[DeviceActivityEvent.Name(entry.limitName)] = makeEvent(
                    application: entry.application, minutes: settings.limitMinutes)
            }
            let schedule = DeviceActivitySchedule(
                intervalStart: DateComponents(hour: 0, minute: 0, second: 0),
                intervalEnd: DateComponents(hour: 23, minute: 59, second: 59), repeats: true)
            let configuration = ScreenTimeConfiguration(
                generation: generation, selection: selection, settings: settings, events: map)
            try ScreenTimeShared().configure(configuration) {
                try self.center.startMonitoring(ScreenTimeIDs.dailyActivity, during: schedule, events: events)
            }
            error = nil
            refreshStatus(reloadSelection: false)
        } catch { self.error = error.localizedDescription; throw error }
    }

    private func makeEvent(application: ApplicationToken, minutes: Int) -> DeviceActivityEvent {
        if #available(iOS 17.4, *) {
            return DeviceActivityEvent(applications: [application], threshold: DateComponents(minute: minutes),
                                       includesPastActivity: true)
        }
        return DeviceActivityEvent(applications: [application], threshold: DateComponents(minute: minutes))
    }

    func disableLimits() {
        do {
            try ScreenTimeShared().disable {
                let activities = self.center.activities.filter {
                    $0 == ScreenTimeIDs.dailyActivity || $0.rawValue.hasPrefix(ScreenTimeIDs.gracePrefix)
                }
                if !activities.isEmpty { self.center.stopMonitoring(activities) }
            }
            error = nil
            refreshStatus(reloadSelection: false)
        } catch { self.error = error.localizedDescription }
    }

    func refreshStatus(reloadSelection: Bool = true) {
        authorizationStatus = AuthorizationCenter.shared.authorizationStatus
        Task {
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            notificationDenied = settings.authorizationStatus == .denied
        }
        do {
            let state = try ScreenTimeShared().reconcile(authorized: isAuthorized)
            if reloadSelection {
                selection = state.configuration?.selection ?? FamilyActivitySelection()
                resumePolicy = state.configuration?.settings.resumePolicy ?? .tenMinuteBreak
            }
            let activeBreakName = state.accessBreak?.activityName
            let oldBreaks = center.activities.filter {
                $0.rawValue.hasPrefix(ScreenTimeIDs.gracePrefix) && $0.rawValue != activeBreakName
            }
            if !oldBreaks.isEmpty { center.stopMonitoring(oldBreaks) }
            let configured = state.configuration?.settings.enabled == true
            let committed = state.configuration?.registrationCommitted == true
            registrationInterrupted = configured && !committed
            if registrationInterrupted {
                error = "App-limit setup was interrupted. Previously applied limits may remain. Save your app limits again to restore monitoring."
            }
            enabled = configured && committed && isAuthorized && center.activities.contains(ScreenTimeIDs.dailyActivity)
            let shielded = state.shieldTokens(at: Date())
            isBlocked = configured && isAuthorized && !shielded.isEmpty
            blockedAppCount = isBlocked ? shielded.count : 0
            accessBreakEndsAt = state.accessBreak?.deadline
        } catch {
            enabled = false
            self.error = error.localizedDescription
            // Do not clear any existing shields when shared configuration is inaccessible.
        }
    }

    /// Persist the pause so dismissing or restarting the app cannot bypass it.
    func beginReflectionPause() -> Date {
        do { return try ScreenTimeShared().beginReflectionPause() }
        catch { self.error = error.localizedDescription; return Date().addingTimeInterval(10) }
    }

    /// Saving reflection alone never unlocks an app. A deliberate unlock action is required.
    func completeReflection(unlock: Bool = false) throws {
        do {
            authorizationStatus = AuthorizationCenter.shared.authorizationStatus
            if unlock && !isAuthorized { throw ScreenTimeSetupError.authorizationRequired }
            try ScreenTimeShared().completeReflection(unlock: unlock, policy: resumePolicy) { accessBreak in
                let keys: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
                // Minimum 15-minute interval; its five-minute end warning requests
                // restoration after ten minutes. iOS controls actual callback timing.
                let schedule = DeviceActivitySchedule(
                    intervalStart: Calendar.current.dateComponents(keys, from: accessBreak.deadline.addingTimeInterval(-10 * 60)),
                    intervalEnd: Calendar.current.dateComponents(keys, from: accessBreak.deadline.addingTimeInterval(5 * 60)),
                    repeats: false, warningTime: DateComponents(minute: 5))
                let oldBreaks = self.center.activities.filter { $0.rawValue.hasPrefix(ScreenTimeIDs.gracePrefix) }
                if !oldBreaks.isEmpty { self.center.stopMonitoring(oldBreaks) }
                try self.center.startMonitoring(DeviceActivityName(accessBreak.activityName), during: schedule)
            }
            error = nil
            refreshStatus(reloadSelection: false)
        } catch { self.error = error.localizedDescription; throw error }
    }
}

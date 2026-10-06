import Combine
import Foundation

@MainActor
final class PlannerStore: ObservableObject {
    @Published private(set) var snapshot: PlannerSnapshot
    @Published private(set) var persistenceError: String?

    private let directory: URL
    private let fileURL: URL
    private let fileManager: FileManager
    private var writesAllowed = true

    init(storageDirectory: URL? = nil, fileManager: FileManager = .default) {
        self.fileManager = fileManager
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        directory = storageDirectory ?? support.appendingPathComponent("Northstar", isDirectory: true)
        fileURL = directory.appendingPathComponent("planner.json")
        snapshot = PlannerSnapshot()
        persistenceError = nil
        load()
    }

    func generateToday(date: Date = Date()) {
        let next = PlannerLogic.makeDailyPlan(snapshot: snapshot, date: date)
        guard next != snapshot else { return }
        commit(next)
    }

    func addTask(title: String, category: PlanCategory, date: Date = Date(), minutes: Int = 15) {
        var next = snapshot
        next.tasks.append(PlanTask(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            category: category,
            date: Calendar.current.startOfDay(for: date),
            minutes: minutes
        ))
        commit(next)
    }

    func toggleTask(id: UUID, now: Date = Date()) {
        guard let index = snapshot.tasks.firstIndex(where: { $0.id == id }) else { return }
        var next = snapshot
        next.tasks[index].completedAt = next.tasks[index].isCompleted ? nil : now
        commit(next)
    }

    func removeTask(id: UUID) {
        guard snapshot.tasks.contains(where: { $0.id == id }) else { return }
        var next = snapshot
        next.tasks.removeAll { $0.id == id }
        commit(next)
    }

    func saveProfile(_ profile: PlannerProfile) {
        var next = snapshot
        next.profile = profile
        commit(next)
    }

    func saveReflection(achieved: String, next: String, intention: String, date: Date = Date()) {
        var result = snapshot
        let id = PlannerLogic.dayKey(date)
        result.reflections.removeAll { $0.id == id }
        result.reflections.append(ReflectionEntry(
            id: id,
            date: Calendar.current.startOfDay(for: date),
            achieved: achieved.trimmingCharacters(in: .whitespacesAndNewlines),
            next: next.trimmingCharacters(in: .whitespacesAndNewlines),
            intention: intention.trimmingCharacters(in: .whitespacesAndNewlines)
        ))
        result.reflections.sort { $0.date > $1.date }
        commit(result)
    }

    func toggleMilestone(id: String) {
        guard let index = snapshot.milestones.firstIndex(where: { $0.id == id }) else { return }
        var next = snapshot
        next.milestones[index].completed.toggle()
        commit(next)
    }

    func addGrade(subject: String, points: Double, note: String = "", date: Date = Date()) {
        var next = snapshot
        next.grades.append(GradeEntry(
            subject: subject.trimmingCharacters(in: .whitespacesAndNewlines),
            points: points,
            date: date,
            note: note.trimmingCharacters(in: .whitespacesAndNewlines)
        ))
        next.grades.sort { $0.date > $1.date }
        commit(next)
    }

    func exportData() throws -> Data {
        try PlannerLogic.validate(snapshot: snapshot)
        return try Self.encoded(snapshot)
    }

    func importData(_ data: Data) throws {
        guard data.count <= 20 * 1024 * 1024 else {
            throw PlannerDataError.invalidData("the backup is larger than 20 MB.")
        }
        let imported = try Self.decoder().decode(PlannerSnapshot.self, from: data)
        try PlannerLogic.validate(snapshot: imported)
        // Persist first so a failed import does not replace the current in-memory planner.
        try write(imported)
        snapshot = imported
        persistenceError = nil
    }

    private func commit(_ next: PlannerSnapshot) {
        do {
            try PlannerLogic.validate(snapshot: next)
            snapshot = next
            try write(next)
            persistenceError = nil
        } catch {
            // Keep valid work available in memory if writing fails, and surface the failure.
            persistenceError = error.localizedDescription
        }
    }

    private func load() {
        do {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            writesAllowed = false
            persistenceError = "Planner storage is unavailable: \(error.localizedDescription)"
            return
        }
        guard fileManager.fileExists(atPath: fileURL.path) else { return }
        do {
            let data = try Data(contentsOf: fileURL)
            guard data.count <= 20 * 1024 * 1024 else {
                throw PlannerDataError.invalidData("the saved planner is larger than 20 MB.")
            }
            let loaded = try Self.decoder().decode(PlannerSnapshot.self, from: data)
            try PlannerLogic.validate(snapshot: loaded)
            snapshot = loaded
        } catch {
            let recovery = directory.appendingPathComponent("planner.recovery-\(UUID().uuidString).json")
            do {
                try fileManager.moveItem(at: fileURL, to: recovery)
                persistenceError = "Saved data could not be read. Your original file was preserved as \(recovery.lastPathComponent). A new planner is ready."
            } catch {
                // Never overwrite a corrupt or unreadable original if preserving it failed.
                writesAllowed = false
                persistenceError = "Saved data could not be read or moved. The original file is preserved; saving is disabled for this session."
            }
        }
    }

    private func write(_ value: PlannerSnapshot) throws {
        guard writesAllowed else { throw PlannerDataError.writeBlocked }
        let data = try Self.encoded(value)
        #if os(iOS)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: fileURL, options: .atomic)
        #endif
    }

    private static func encoded(_ value: PlannerSnapshot) throws -> Data {
        let data = try encoder().encode(value)
        guard data.count <= 20 * 1024 * 1024 else {
            throw PlannerDataError.invalidData("the planner exceeds the 20 MB storage limit.")
        }
        return data
    }

    private static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }

    private static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

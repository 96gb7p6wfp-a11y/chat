import XCTest
@testable import Northstar

final class PlannerTests: XCTestCase {
    private func day(_ year: Int, _ month: Int, _ day: Int, hour: Int = 12) -> Date {
        Calendar.current.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
    }

    func testDailyPlanUsesEveryCategoryAndExactlyFitsBudget() {
        for budget in [30, 45, 60, 90, 180, 360] {
            var profile = PlannerProfile()
            profile.dailyMinutes = budget
            let tasks = PlannerLogic.dailyPlan(profile: profile, date: day(2026, 10, 6))
            XCTAssertEqual(tasks.count, 6)
            XCTAssertEqual(Set(tasks.map(\.category)), Set(PlanCategory.allCases))
            XCTAssertEqual(tasks.map(\.minutes).reduce(0, +), budget)
            XCTAssertTrue(tasks.allSatisfy { $0.minutes > 0 && !$0.isCompleted })
        }
    }

    func testInitialProfileMatchesUserAndHasNoInventedProgress() {
        let state = PlannerSnapshot()
        XCTAssertEqual(state.profile.schoolYear, "Grade 12")
        XCTAssertEqual(state.profile.schoolSystem, "Germany · public Gymnasium")
        XCTAssertEqual(state.profile.graduationYear, 2028)
        XCTAssertNil(state.profile.applicationYear)
        XCTAssertEqual(state.profile.dailyMinutes, 60)
        XCTAssertEqual(state.profile.subjects, "English, German")
        XCTAssertEqual(state.profile.major, "")
        XCTAssertTrue(state.tasks.isEmpty)
        XCTAssertTrue(state.grades.isEmpty)
        XCTAssertTrue(state.milestones.allSatisfy { !$0.completed })
    }

    func testLanguagePracticeAlternatesEnglishGermanIndependentlyOfSchoolSubjects() {
        var profile = PlannerProfile()
        profile.subjects = "English, German, Math"
        let first = PlannerLogic.dailyPlan(profile: profile, date: day(2026, 10, 6))
        let second = PlannerLogic.dailyPlan(profile: profile, date: day(2026, 10, 7))
        let language = first.first { $0.category == .languages }!
        let nextLanguage = second.first { $0.category == .languages }!
        XCTAssertFalse(language.title.contains("Math"))
        XCTAssertTrue(language.title.contains("English") || language.title.contains("German"))
        XCTAssertNotEqual(language.title.contains("English"), nextLanguage.title.contains("English"))
        XCTAssertTrue(first.first { $0.category == .academics }!.title.contains("Math"))
        XCTAssertNoThrow(try PlannerLogic.validate(snapshot: PlannerSnapshot()))
    }

    func testPlanGenerationIsIdempotentIncludingAfterDeletion() {
        let date = day(2026, 10, 6)
        let initial = PlannerSnapshot()
        var planned = PlannerLogic.makeDailyPlan(snapshot: initial, date: date)
        XCTAssertEqual(initial.tasks.count, 0)
        XCTAssertEqual(planned.tasks.count, 6)
        XCTAssertEqual(PlannerLogic.makeDailyPlan(snapshot: planned, date: date), planned)
        planned.tasks.removeFirst()
        XCTAssertEqual(PlannerLogic.makeDailyPlan(snapshot: planned, date: date), planned)
        XCTAssertEqual(PlannerLogic.makeDailyPlan(snapshot: planned, date: day(2026, 10, 7)).tasks.count, 11)
    }

    func testAchievementsUseActualCompletionMonthRatherThanScheduledMonth() {
        var state = PlannerSnapshot()
        state.tasks = [
            PlanTask(title: "Overdue task", category: .academics, date: day(2026, 9, 30), minutes: 20, completedAt: day(2026, 10, 1)),
            PlanTask(title: "Earlier work", category: .reflection, date: day(2026, 10, 1), minutes: 5, completedAt: day(2026, 9, 30)),
            PlanTask(title: "Still pending", category: .languages, date: day(2026, 10, 1), minutes: 15),
        ]
        let october = PlannerLogic.stats(snapshot: state, date: day(2026, 10, 1))
        XCTAssertEqual(october.todayCompleted, 1)
        XCTAssertEqual(october.todayTotal, 2)
        XCTAssertEqual(october.todayScheduledCompleted, 1)
        XCTAssertEqual(october.monthCompleted, 1)
        XCTAssertEqual(october.categoryCounts[.academics], 1)
        XCTAssertEqual(october.categoryCounts[.reflection], 0)
        XCTAssertEqual(october.overallCompleted, 2)
        XCTAssertEqual(october.week.count, 7)
        XCTAssertEqual(october.week.last?.completed, 1)
        XCTAssertEqual(PlannerLogic.stats(snapshot: state, date: day(2026, 9, 30)).monthCompleted, 1)
    }

    func testStreakAllowsUnfinishedTodayAndBreaksAfterMissingDay() {
        var state = PlannerSnapshot()
        state.tasks = (2...5).map { number in
            PlanTask(title: "Real work", category: .academics, date: day(2026, 10, number), minutes: 15, completedAt: day(2026, 10, number))
        }
        XCTAssertEqual(PlannerLogic.stats(snapshot: state, date: day(2026, 10, 6)).streak, 4)
        XCTAssertEqual(PlannerLogic.stats(snapshot: state, date: day(2026, 10, 7)).streak, 0)
    }

    func testDayKeyUsesProvidedLocalCalendarRatherThanUTC() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: -7 * 3600)!
        let date = ISO8601DateFormatter().date(from: "2026-10-01T00:30:00Z")!
        XCTAssertEqual(PlannerLogic.dayKey(date, calendar: calendar), "2026-09-30")
    }

    @MainActor
    func testPersistenceRestoresCompletionAndPreventsDuplicatePlans() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = PlannerStore(storageDirectory: directory)
        let date = day(2026, 10, 6)
        store.generateToday(date: date)
        store.toggleTask(id: store.snapshot.tasks[0].id, now: date)
        store.saveReflection(achieved: "Practiced English", next: "Review my essay", intention: "Ask a question", date: date)
        XCTAssertNil(store.persistenceError)
        let restored = PlannerStore(storageDirectory: directory)
        XCTAssertNil(restored.persistenceError)
        XCTAssertEqual(restored.snapshot.tasks.count, 6)
        XCTAssertEqual(restored.snapshot.tasks.filter(\.isCompleted).count, 1)
        XCTAssertEqual(restored.snapshot.reflections.first?.achieved, "Practiced English")
        restored.generateToday(date: date)
        XCTAssertEqual(restored.snapshot.tasks.count, 6)
        XCTAssertEqual(PlannerLogic.stats(snapshot: restored.snapshot, date: date).monthCompleted, 1)
    }

    @MainActor
    func testGradeValidationRejectsOutOfRangeAndNonfinitePoints() {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = PlannerStore(storageDirectory: directory)
        store.addGrade(subject: "English", points: 16, note: "Invalid")
        XCTAssertTrue(store.snapshot.grades.isEmpty)
        XCTAssertNotNil(store.persistenceError)
        store.addGrade(subject: "English", points: .nan)
        XCTAssertTrue(store.snapshot.grades.isEmpty)
        store.addGrade(subject: "English", points: 12, note: "Essay")
        XCTAssertEqual(store.snapshot.grades.first?.points, 12)
        XCTAssertNil(store.persistenceError)
    }

    @MainActor
    func testCorruptOriginalIsPreservedBeforeNewDataCanBeSaved() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let corrupt = Data("not valid JSON".utf8)
        try corrupt.write(to: directory.appendingPathComponent("planner.json"))
        let store = PlannerStore(storageDirectory: directory)
        XCTAssertNotNil(store.persistenceError)
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        let recovery = try XCTUnwrap(files.first { $0.lastPathComponent.hasPrefix("planner.recovery-") })
        XCTAssertEqual(try Data(contentsOf: recovery), corrupt)
        store.addTask(title: "Start again safely", category: .academics)
        XCTAssertNil(store.persistenceError)
        XCTAssertEqual(try Data(contentsOf: recovery), corrupt)
        XCTAssertEqual(PlannerStore(storageDirectory: directory).snapshot.tasks.count, 1)
    }

    @MainActor
    func testImportRejectsUnknownVersionWithoutReplacingCurrentState() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = PlannerStore(storageDirectory: directory)
        store.addTask(title: "Keep my work", category: .academics)
        let exported = try store.exportData()
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: exported) as? [String: Any])
        object["version"] = 99
        let invalid = try JSONSerialization.data(withJSONObject: object)
        XCTAssertThrowsError(try store.importData(invalid))
        XCTAssertEqual(store.snapshot.tasks.first?.title, "Keep my work")
        try store.importData(exported)
        XCTAssertEqual(store.snapshot.tasks.count, 1)
    }
}

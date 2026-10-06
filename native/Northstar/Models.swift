import Foundation

enum PlanCategory: String, Codable, CaseIterable, Identifiable, Hashable {
    case academics, languages, confidence, wellbeing, activities, reflection

    var id: String { rawValue }

    var title: String {
        switch self {
        case .academics: return "Grades"
        case .languages: return "Languages"
        case .confidence: return "Confidence"
        case .wellbeing: return "Wellbeing"
        case .activities: return "Exploration"
        case .reflection: return "Reflection"
        }
    }

    var symbol: String {
        switch self {
        case .academics: return "book.closed.fill"
        case .languages: return "bubble.left.and.bubble.right.fill"
        case .confidence: return "person.fill.checkmark"
        case .wellbeing: return "leaf.fill"
        case .activities: return "sparkles"
        case .reflection: return "pencil.and.list.clipboard"
        }
    }
}

struct PlannerProfile: Codable, Equatable {
    var name = ""
    var schoolYear = "Grade 12"
    var schoolSystem = "Germany · public Gymnasium"
    var graduationYear = 2028
    var applicationYear: Int? = nil
    var major = ""
    var dailyMinutes = 60
    var subjects = "English, German"
    var gradeGoal = ""
    var language = "English"
}

struct PlanTask: Identifiable, Codable, Equatable {
    var id = UUID()
    var title: String
    var category: PlanCategory
    var date: Date
    var minutes: Int
    var completedAt: Date? = nil
    var evidence = ""

    var isCompleted: Bool { completedAt != nil }
}

struct ReflectionEntry: Identifiable, Codable, Equatable {
    var id: String
    var date: Date
    var achieved: String
    var next: String
    var intention: String
}

struct Milestone: Identifiable, Codable, Equatable {
    var id: String
    var title: String
    var detail: String
    var category: PlanCategory
    var completed = false

    static var defaults: [Milestone] {
        [
            Milestone(id: "starting-point", title: "Know your starting point", detail: "Record your current upper-secondary points and choose one subject to improve. Compare progress with your own baseline.", category: .academics),
            Milestone(id: "feedback-habit", title: "Build a study and feedback habit", detail: "Use active recall and practice questions. Ask a teacher what would improve your next assessment and review your mistakes each week.", category: .academics),
            Milestone(id: "language-routine", title: "Practice English and German regularly", detail: "Read, write, listen, and speak in short sessions. Ask for specific feedback and keep examples that show your improvement.", category: .languages),
            Milestone(id: "confidence-routine", title: "Practice small acts of confidence", detail: "Choose manageable steps such as asking a question or sharing an idea. Notice effort and learning without judging your worth.", category: .confidence),
            Milestone(id: "explore-interests", title: "Explore what you enjoy", detail: "Try a small project or activity before choosing a major. Keep notes on the subjects and kinds of work that interest you.", category: .activities),
            Milestone(id: "contribute", title: "Make a useful, sustainable contribution", detail: "Find a realistic way to help at school or in your community. Record your actual role, responsibilities, effort, and impact.", category: .activities),
            Milestone(id: "uc-requirements", title: "Check UC requirements for Germany", detail: "Use current official UC guidance to verify your applicant category, German coursework and qualifications, English proficiency, documents, and costs.", category: .academics),
            Milestone(id: "personal-stories", title: "Collect your own personal insight stories", detail: "Read the current UC personal insight questions. Keep truthful examples of challenges, interests, initiative, and what you learned; draft in your own voice.", category: .reflection),
            Milestone(id: "application-calendar", title: "Confirm your application timeline", detail: "Check the official deadlines for your intended entry year, including UCLA and UC Berkeley. Build a balanced college list and a cost plan. Admission is never guaranteed.", category: .academics),
        ]
    }
}

struct GradeEntry: Identifiable, Codable, Equatable {
    var id = UUID()
    var subject: String
    var points: Double
    var date: Date
    var note: String
}

struct PlannerSnapshot: Codable, Equatable {
    var version = 1
    var profile = PlannerProfile()
    var tasks: [PlanTask] = []
    var reflections: [ReflectionEntry] = []
    var milestones = Milestone.defaults
    var grades: [GradeEntry] = []
    var plannedDays: Set<String> = []
}

struct DayProgress: Identifiable, Equatable {
    var date: Date
    var completed: Int
    var id: String { PlannerLogic.dayKey(date) }
}

struct PlannerStats: Equatable {
    var todayCompleted: Int
    var todayTotal: Int
    var todayScheduledCompleted: Int
    var monthCompleted: Int
    var overallCompleted: Int
    var streak: Int
    var week: [DayProgress]
    var categoryCounts: [PlanCategory: Int]
}

enum PlannerDataError: LocalizedError {
    case unsupportedVersion(Int)
    case invalidData(String)
    case writeBlocked

    var errorDescription: String? {
        switch self {
        case .unsupportedVersion(let version):
            return "This backup uses unsupported planner version \(version)."
        case .invalidData(let reason):
            return "The planner data is invalid: \(reason)"
        case .writeBlocked:
            return "Your existing planner file is preserved, but this storage location cannot be written to."
        }
    }
}

enum PlannerLogic {
    static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func dailyPlan(profile: PlannerProfile, date: Date = Date()) -> [PlanTask] {
        let calendar = Calendar.current
        let day = calendar.startOfDay(for: date)
        let ordinal = calendar.ordinality(of: .day, in: .era, for: day) ?? 0
        let variation = ordinal % 3
        let subjects = profile.subjects
            .split(whereSeparator: { $0 == "," || $0 == ";" || $0 == "\n" })
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let language = ordinal % 2 == 0 ? "English" : "German"
        let academicSubject = subjects.first { subject in
            !["english", "englisch", "german", "deutsch"].contains(subject.lowercased())
        } ?? "your hardest school topic"
        let major = profile.major.trimmingCharacters(in: .whitespacesAndNewlines)
        let academics = [
            "Practice \(academicSubject); check and correct each mistake",
            "Recall \(academicSubject) without notes, then check what you missed",
            "Prepare for your next \(academicSubject) assessment with a short practice set",
        ]
        let languageTasks = [
            "Read a short text in \(language) and summarize it in your own words",
            "Write a short paragraph in \(language); revise three sentences",
            "Explain an idea aloud in \(language) and note one thing to improve",
        ]
        let confidence = [
            "Ask one useful question or share one idea with someone",
            "Practice a short introduction or explanation aloud",
            "Choose one small, manageable step you have been putting off",
        ]
        let wellbeing = [
            "Take a movement break and choose a realistic bedtime",
            "Take a screen-free break, stretch, and prepare your workspace",
            "Walk or move gently, then plan time to rest this evening",
        ]
        let exploration = major.isEmpty
            ? "Explore a subject or project that interests you; record one question"
            : "Take one small step on a \(major) project or learn about the field"
        let titles = [academics[variation], languageTasks[variation], confidence[variation], wellbeing[variation], exploration, "Reflect on what you achieved and choose your next step"]
        let categories = PlanCategory.allCases
        let budget = max(30, min(360, profile.dailyMinutes))
        let weights: [Double] = [0.34, 0.24, 0.10, 0.16, 0.10, 0.06]
        let exact = weights.map { Double(budget) * $0 }
        var minutes = exact.map { max(1, Int($0.rounded(.down))) }
        let allocationOrder = exact.indices.sorted { first, second in
            let firstFraction = exact[first] - Double(minutes[first])
            let secondFraction = exact[second] - Double(minutes[second])
            return firstFraction == secondFraction ? first < second : firstFraction > secondFraction
        }
        var remainder = budget - minutes.reduce(0, +)
        var index = 0
        while remainder > 0 {
            minutes[allocationOrder[index % allocationOrder.count]] += 1
            remainder -= 1
            index += 1
        }
        return categories.indices.map {
            PlanTask(title: titles[$0], category: categories[$0], date: day, minutes: minutes[$0])
        }
    }

    static func makeDailyPlan(snapshot: PlannerSnapshot, date: Date = Date()) -> PlannerSnapshot {
        let key = dayKey(date)
        guard !snapshot.plannedDays.contains(key) else { return snapshot }
        var result = snapshot
        result.tasks.append(contentsOf: dailyPlan(profile: result.profile, date: date))
        result.plannedDays.insert(key)
        return result
    }

    static func stats(snapshot: PlannerSnapshot, date: Date = Date()) -> PlannerStats {
        let calendar = Calendar.current
        let day = calendar.startOfDay(for: date)
        let completed = snapshot.tasks.filter { $0.completedAt != nil }
        let scheduledToday = snapshot.tasks.filter { calendar.isDate($0.date, inSameDayAs: day) }
        let completedToday = completed.filter { task in
            guard let at = task.completedAt else { return false }
            return calendar.isDate(at, inSameDayAs: day)
        }
        let monthInterval = calendar.dateInterval(of: .month, for: day)
        let monthTasks = completed.filter { task in
            guard let at = task.completedAt, let interval = monthInterval else { return false }
            return at >= interval.start && at < interval.end
        }
        var counts = Dictionary(uniqueKeysWithValues: PlanCategory.allCases.map { ($0, 0) })
        for task in monthTasks { counts[task.category, default: 0] += 1 }
        let completionDays = Set(completed.compactMap { $0.completedAt }.map { dayKey($0, calendar: calendar) })
        var cursor = completionDays.contains(dayKey(day, calendar: calendar))
            ? day
            : calendar.date(byAdding: .day, value: -1, to: day) ?? day
        var streak = 0
        while completionDays.contains(dayKey(cursor, calendar: calendar)) {
            streak += 1
            guard let previous = calendar.date(byAdding: .day, value: -1, to: cursor) else { break }
            cursor = previous
        }
        let week: [DayProgress] = (-6...0).map { offset in
            let weekDay = calendar.date(byAdding: .day, value: offset, to: day) ?? day
            let count = completed.filter { task in
                guard let at = task.completedAt else { return false }
                return calendar.isDate(at, inSameDayAs: weekDay)
            }.count
            return DayProgress(date: weekDay, completed: count)
        }
        return PlannerStats(
            todayCompleted: completedToday.count,
            todayTotal: scheduledToday.count,
            todayScheduledCompleted: scheduledToday.filter(\.isCompleted).count,
            monthCompleted: monthTasks.count,
            overallCompleted: completed.count,
            streak: streak,
            week: week,
            categoryCounts: counts
        )
    }

    static func validate(snapshot: PlannerSnapshot) throws {
        guard snapshot.version == 1 else { throw PlannerDataError.unsupportedVersion(snapshot.version) }
        let profile = snapshot.profile
        guard (30...360).contains(profile.dailyMinutes), (2000...2200).contains(profile.graduationYear),
              profile.applicationYear.map({ (2000...2200).contains($0) }) ?? true else {
            throw PlannerDataError.invalidData("the daily time budget, graduation year, or application year is out of range.")
        }
        guard profile.name.count <= 150, profile.schoolYear.count <= 150, profile.schoolSystem.count <= 200,
              profile.major.count <= 200, profile.subjects.count <= 1000, profile.gradeGoal.count <= 1000,
              profile.language.count <= 40 else {
            throw PlannerDataError.invalidData("a profile field is too long.")
        }
        guard snapshot.tasks.count <= 10000, snapshot.reflections.count <= 10000,
              snapshot.grades.count <= 10000, snapshot.milestones.count <= 200,
              snapshot.plannedDays.count <= 10000 else {
            throw PlannerDataError.invalidData("the backup exceeds the supported record count.")
        }
        guard Set(snapshot.tasks.map(\.id)).count == snapshot.tasks.count,
              Set(snapshot.grades.map(\.id)).count == snapshot.grades.count,
              Set(snapshot.reflections.map(\.id)).count == snapshot.reflections.count,
              Set(snapshot.milestones.map(\.id)).count == snapshot.milestones.count else {
            throw PlannerDataError.invalidData("duplicate record identifiers were found.")
        }
        for task in snapshot.tasks {
            guard !task.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  task.title.count <= 1200, (1...480).contains(task.minutes), task.evidence.count <= 3000,
                  isReasonableDate(task.date), task.completedAt.map(isReasonableDate) ?? true else {
                throw PlannerDataError.invalidData("a task has an empty title, invalid duration, or invalid date.")
            }
        }
        for reflection in snapshot.reflections {
            guard isDayKey(reflection.id), isReasonableDate(reflection.date),
                  reflection.achieved.count <= 5000, reflection.next.count <= 5000, reflection.intention.count <= 5000 else {
                throw PlannerDataError.invalidData("a reflection has an invalid day or is too long.")
            }
        }
        for milestone in snapshot.milestones {
            guard !milestone.id.isEmpty, milestone.id.count <= 150,
                  !milestone.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  milestone.title.count <= 500, milestone.detail.count <= 3000 else {
                throw PlannerDataError.invalidData("a milestone has invalid text.")
            }
        }
        for grade in snapshot.grades {
            guard !grade.subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  grade.subject.count <= 150, grade.points.isFinite, (0...15).contains(grade.points),
                  grade.note.count <= 3000, isReasonableDate(grade.date) else {
                throw PlannerDataError.invalidData("grade points must be between 0 and 15, with a subject and valid date.")
            }
        }
        guard snapshot.plannedDays.allSatisfy(isDayKey) else {
            throw PlannerDataError.invalidData("a generated-plan day is invalid.")
        }
    }

    private static func isReasonableDate(_ date: Date) -> Bool {
        guard date.timeIntervalSince1970.isFinite else { return false }
        let calendar = Calendar(identifier: .gregorian)
        return (1900...2200).contains(calendar.component(.year, from: date))
    }

    private static func isDayKey(_ key: String) -> Bool {
        let parts = key.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]) else { return false }
        let calendar = Calendar.current
        guard let date = calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12)) else { return false }
        return dayKey(date, calendar: calendar) == key
    }
}

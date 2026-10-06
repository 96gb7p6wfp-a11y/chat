import SwiftUI
import Charts
import FamilyControls
import UniformTypeIdentifiers

enum NorthstarStyle {
    static let paper = Color(red: 0.97, green: 0.96, blue: 0.95)
    static let ink = Color(red: 0.09, green: 0.16, blue: 0.20)
    static let muted = Color(red: 0.43, green: 0.47, blue: 0.47)
    static let mint = Color(red: 0.81, green: 0.91, blue: 0.86)
    static let lavender = Color(red: 0.88, green: 0.85, blue: 0.97)
    static let peach = Color(red: 0.98, green: 0.88, blue: 0.81)

    static func color(for category: PlanCategory) -> Color {
        switch category {
        case .academics: return lavender
        case .languages: return Color(red: 0.83, green: 0.90, blue: 0.97)
        case .confidence: return peach
        case .activities: return Color(red: 0.98, green: 0.93, blue: 0.77)
        case .wellbeing: return mint
        case .reflection: return Color(red: 0.93, green: 0.86, blue: 0.93)
        }
    }
}

private struct PaperCard: ViewModifier {
    var color: Color = .white
    func body(content: Content) -> some View {
        content.padding(20).frame(maxWidth: .infinity, alignment: .leading)
            .background(color, in: RoundedRectangle(cornerRadius: 24))
    }
}
extension View {
    fileprivate func paperCard(_ color: Color = .white) -> some View { modifier(PaperCard(color: color)) }
}
struct NorthstarButtonStyle: ButtonStyle {
    var secondary = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(.subheadline, design: .rounded, weight: .semibold))
            .frame(maxWidth: .infinity).padding(.vertical, 15).padding(.horizontal, 18)
            .foregroundStyle(secondary ? NorthstarStyle.ink : .white)
            .background(secondary ? NorthstarStyle.paper : NorthstarStyle.ink, in: RoundedRectangle(cornerRadius: 14))
            .opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
    }
}

struct NorthstarRootView: View {
    @EnvironmentObject private var planner: PlannerStore
    @EnvironmentObject private var screenTime: ScreenTimeController
    @State private var selectedTab = 0
    @State private var showProfile = false

    var body: some View {
        TabView(selection: $selectedTab) {
            page { TodayView(openFocus: { selectedTab = 3 }) }
                .tabItem { Label("Today", systemImage: "square.grid.2x2") }.tag(0)
            page { PathwayView() }
                .tabItem { Label("Pathway", systemImage: "map") }.tag(1)
            page { ProgressView() }
                .tabItem { Label("Progress", systemImage: "chart.bar") }.tag(2)
            page { FocusSpaceView() }
                .tabItem { Label("Focus", systemImage: "scope") }.tag(3)
        }
        .tint(NorthstarStyle.ink)
        .sheet(isPresented: $showProfile) { ProfileView() }
        .task {
            planner.generateToday()
            screenTime.refreshStatus()
        }
    }

    private func page<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        NavigationStack {
            content()
                .background(NorthstarStyle.paper)
                .foregroundStyle(NorthstarStyle.ink)
                .navigationTitle("northstar. ✦")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showProfile = true } label: {
                            Image(systemName: "person.crop.circle").font(.title3)
                        }.accessibilityLabel("Edit profile and back up data")
                    }
                }
                .safeAreaInset(edge: .top, spacing: 0) {
                    if let error = planner.persistenceError {
                        Text(error).font(.caption).padding(12).frame(maxWidth: .infinity)
                            .background(NorthstarStyle.peach).accessibilityAddTraits(.updatesFrequently)
                    }
                }
        }
    }
}

private struct PageIntro: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("✦  \(eyebrow.uppercased())").font(.system(size: 10, weight: .semibold)).tracking(1.5)
                .foregroundStyle(NorthstarStyle.muted)
            Text(title).font(.system(size: 33, weight: .medium, design: .serif)).fixedSize(horizontal: false, vertical: true)
            Text(subtitle).font(.subheadline).foregroundStyle(NorthstarStyle.muted).lineSpacing(4)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct TodayView: View {
    @EnvironmentObject private var planner: PlannerStore
    @EnvironmentObject private var screenTime: ScreenTimeController
    let openFocus: () -> Void
    @State private var selectedDate = Date()
    @State private var showTask = false
    @State private var pendingRemoval: PlanTask?

    private var tasks: [PlanTask] {
        planner.snapshot.tasks.filter { Calendar.current.isDate($0.date, inSameDayAs: selectedDate) }
    }
    private var stats: PlannerStats { PlannerLogic.stats(snapshot: planner.snapshot, date: Date()) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageIntro(eyebrow: Date().formatted(.dateTime.weekday(.wide).month(.wide).day()),
                          title: "A little better,\nevery day.",
                          subtitle: "A clearer plan. Stronger habits. A future that feels like you.")
                hero
                if screenTime.isBlocked {
                    Button(action: openFocus) {
                        HStack(spacing: 12) {
                            Image(systemName: "pause.circle.fill").font(.title2)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("A social app is taking a pause.").font(.subheadline.bold())
                                Text("Open your check-in and choose your next step.").font(.caption)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "arrow.right")
                        }.paperCard(NorthstarStyle.lavender)
                    }.buttonStyle(.plain)
                }
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Your daily plan").font(.title3.bold())
                            Text("Small steps, big direction.").font(.caption).foregroundStyle(NorthstarStyle.muted)
                        }
                        Spacer()
                        Button { showTask = true } label: { Image(systemName: "plus").padding(12).background(.white, in: Circle()) }
                            .accessibilityLabel("Add a task")
                    }
                    HStack {
                        DatePicker("Plan for", selection: $selectedDate, displayedComponents: .date)
                            .font(.subheadline).datePickerStyle(.compact)
                    }
                    if tasks.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "leaf").font(.title2)
                            Text("A fresh page for this day.").font(.headline)
                            Text("Add a step that fits your life.").font(.subheadline).foregroundStyle(NorthstarStyle.muted)
                            Button("Add a small step") { showTask = true }.buttonStyle(NorthstarButtonStyle(secondary: true))
                        }.paperCard()
                    } else {
                        VStack(spacing: 0) {
                            ForEach(tasks) { task in
                                taskRow(task)
                                if task.id != tasks.last?.id { Divider().padding(.leading, 42) }
                            }
                        }.paperCard()
                    }
                    Label("Progress over perfection. A little counts.", systemImage: "leaf")
                        .font(.caption).foregroundStyle(NorthstarStyle.muted)
                }
                DailyReflectionView()
                Button(action: openFocus) {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("PROTECT YOUR ATTENTION", systemImage: "scope").font(.caption.weight(.semibold))
                        Text("Less scrolling.\nMore room for your life.").font(.system(size: 25, design: .serif))
                        HStack { Text("Enter focus space").font(.subheadline.bold()); Spacer(); Image(systemName: "arrow.up.right") }
                    }.paperCard(NorthstarStyle.mint.opacity(0.6))
                }.buttonStyle(.plain)
                BrandFooter()
            }.padding(20).frame(maxWidth: 740).frame(maxWidth: .infinity)
        }
        .sheet(isPresented: $showTask) { AddTaskView(date: selectedDate) }
        .confirmationDialog("Remove this task and its completion record?", isPresented: Binding(get: { pendingRemoval != nil }, set: { if !$0 { pendingRemoval = nil } }), titleVisibility: .visible) {
            Button("Remove task", role: .destructive) {
                if let task = pendingRemoval { planner.removeTask(id: task.id) }
                pendingRemoval = nil
            }
        }
    }

    private var hero: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 12) {
                Label("TODAY’S NORTH STAR", systemImage: "sparkle").font(.system(size: 9, weight: .bold)).tracking(1)
                Text("Show up for\nyour future self.").font(.system(size: 25, weight: .medium, design: .serif))
                Text("\(stats.todayTotal - stats.todayScheduledCompleted) steps left today")
                    .font(.caption).foregroundStyle(NorthstarStyle.muted)
            }
            Spacer(minLength: 0)
            ZStack {
                Circle().stroke(.white.opacity(0.6), lineWidth: 9)
                Circle().trim(from: 0, to: stats.todayTotal == 0 ? 0 : CGFloat(stats.todayScheduledCompleted) / CGFloat(stats.todayTotal))
                    .stroke(NorthstarStyle.ink, style: StrokeStyle(lineWidth: 9, lineCap: .round)).rotationEffect(.degrees(-90))
                VStack(spacing: 3) {
                    Text("\(stats.todayScheduledCompleted)/\(stats.todayTotal)").font(.system(size: 26, weight: .medium, design: .rounded))
                    Text("steps complete").font(.system(size: 9))
                }
            }.frame(width: 104, height: 104)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(stats.todayScheduledCompleted) of \(stats.todayTotal) planned steps complete")
        }.paperCard(NorthstarStyle.mint)
    }

    private func taskRow(_ task: PlanTask) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Button { planner.toggleTask(id: task.id) } label: {
                Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 23)).foregroundStyle(task.isCompleted ? NorthstarStyle.ink : NorthstarStyle.muted.opacity(0.5))
                    .frame(width: 30, height: 44)
            }.accessibilityLabel("\(task.isCompleted ? "Mark incomplete" : "Complete"): \(task.title)")
            VStack(alignment: .leading, spacing: 8) {
                Text(task.title).font(.subheadline.weight(.medium)).strikethrough(task.isCompleted)
                    .foregroundStyle(task.isCompleted ? NorthstarStyle.muted : NorthstarStyle.ink)
                HStack(spacing: 8) {
                    Label(task.category.title, systemImage: task.category.symbol)
                        .font(.system(size: 10, weight: .medium)).padding(.horizontal, 8).padding(.vertical, 4)
                        .background(NorthstarStyle.color(for: task.category), in: Capsule())
                    Text("\(task.minutes) min").font(.caption2).foregroundStyle(NorthstarStyle.muted)
                }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
            Button { pendingRemoval = task } label: {
                Image(systemName: "ellipsis").foregroundStyle(NorthstarStyle.muted).frame(width: 30, height: 44)
            }.accessibilityLabel("Remove task: \(task.title)")
        }.padding(.vertical, 5)
    }
}

struct DailyReflectionView: View {
    @EnvironmentObject private var planner: PlannerStore
    @State private var achieved = ""
    @State private var next = ""
    @State private var intention = ""
    @State private var saved = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("PAUSE. NOTICE. GROW.", systemImage: "sparkles").font(.system(size: 10, weight: .semibold)).tracking(1)
            Text("Your daily check-in").font(.title3.bold())
            Text("A minute to see what mattered today.").font(.subheadline).foregroundStyle(NorthstarStyle.muted)
            JournalField(title: "What did you do or achieve today?", prompt: "A small win counts, too…", text: $achieved)
            JournalField(title: "What’s your next small step?", prompt: "Something you can actually do…", text: $next)
            JournalField(title: "What helped you feel confident?", prompt: "Notice a moment of courage…", text: $intention)
            Button {
                planner.saveReflection(achieved: achieved, next: next, intention: intention, date: Date())
                saved = planner.persistenceError == nil
            } label: { Label(saved ? "Reflection saved" : "Save reflection", systemImage: saved ? "checkmark" : "arrow.right") }
                .buttonStyle(NorthstarButtonStyle(secondary: true))
                .disabled(achieved.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }.paperCard()
        .onAppear {
            if let entry = planner.snapshot.reflections.first(where: { Calendar.current.isDate($0.date, inSameDayAs: Date()) }) {
                achieved = entry.achieved; next = entry.next; intention = entry.intention
            }
        }
        .onChange(of: achieved) { _, _ in saved = false }
        .onChange(of: next) { _, _ in saved = false }
        .onChange(of: intention) { _, _ in saved = false }
    }
}

private struct JournalField: View {
    let title: String
    let prompt: String
    @Binding var text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title).font(.caption.weight(.semibold))
            TextField(prompt, text: $text, axis: .vertical).lineLimit(2...4)
                .font(.subheadline).padding(12).background(NorthstarStyle.paper, in: RoundedRectangle(cornerRadius: 12))
                .accessibilityLabel(title)
                .onChange(of: text) { _, value in if value.count > 3000 { text = String(value.prefix(3000)) } }
        }
    }
}

struct AddTaskView: View {
    @EnvironmentObject private var planner: PlannerStore
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var category = PlanCategory.academics
    @State private var minutes = 20
    @State var date: Date

    var body: some View {
        NavigationStack {
            Form {
                Section("Keep it specific. Keep it doable.") {
                    TextField("What will you do?", text: $title, axis: .vertical).lineLimit(1...3)
                    Picker("Area of life", selection: $category) {
                        ForEach(PlanCategory.allCases, id: \.self) { item in Label(item.title, systemImage: item.symbol).tag(item) }
                    }
                    Stepper("\(minutes) minutes", value: $minutes, in: 5...240, step: 5)
                    DatePicker("Plan for", selection: $date, displayedComponents: .date)
                }
                Section {
                    Button("Add to my plan") {
                        planner.addTask(title: title, category: category, date: date, minutes: minutes)
                        if planner.persistenceError == nil { dismiss() }
                    }.disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }.navigationTitle("One small step.").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}

struct PathwayView: View {
    @EnvironmentObject private var planner: PlannerStore
    @State private var added = ""
    private var completed: Int { planner.snapshot.milestones.filter(\.completed).count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageIntro(eyebrow: "YOUR NEXT CHAPTER", title: "Big dreams.\nClear direction.", subtitle: "UCLA. UC Berkeley. A life you’re proud of along the way.")
                VStack(alignment: .leading, spacing: 12) {
                    Label("YOUR STARTING POINT", systemImage: "graduationcap").font(.caption.weight(.semibold))
                    Text("\(planner.snapshot.profile.schoolYear) → your next chapter").font(.title3.bold())
                    Text("\(planner.snapshot.profile.schoolSystem) · \(planner.snapshot.profile.major.isEmpty ? "Major still open" : planner.snapshot.profile.major)").font(.subheadline)
                    Text("Abitur / graduation: \(String(planner.snapshot.profile.graduationYear))\(planner.snapshot.profile.applicationYear.map { " · Applying \($0)" } ?? " · Application year to confirm")").font(.caption)
                    Text("\(completed) of \(planner.snapshot.milestones.count) milestones complete").font(.caption)
                    SwiftUI.ProgressView(value: Double(completed), total: Double(max(1, planner.snapshot.milestones.count))).tint(NorthstarStyle.ink)
                }.paperCard(NorthstarStyle.lavender)
                ForEach(planner.snapshot.milestones) { milestone in
                    HStack(alignment: .top, spacing: 13) {
                        Button { planner.toggleMilestone(id: milestone.id) } label: {
                            Image(systemName: milestone.completed ? "checkmark.circle.fill" : "circle").font(.title2).frame(width: 28, height: 44)
                        }.accessibilityLabel("\(milestone.completed ? "Uncomplete" : "Complete") milestone: \(milestone.title)")
                        VStack(alignment: .leading, spacing: 10) {
                            Label(milestone.category.title.uppercased(), systemImage: milestone.category.symbol).font(.system(size: 9, weight: .semibold)).tracking(1)
                            Text(milestone.title).font(.headline)
                            Text(milestone.detail).font(.subheadline).foregroundStyle(NorthstarStyle.muted).lineSpacing(3)
                            Button {
                                planner.addTask(title: milestone.title, category: milestone.category, date: Date(), minutes: 20)
                                added = milestone.id
                            } label: { Label(added == milestone.id ? "Added to today" : "Add a step to today", systemImage: added == milestone.id ? "checkmark" : "plus") }
                                .font(.caption.weight(.semibold)).padding(.vertical, 7)
                        }
                    }.paperCard()
                }
                VStack(alignment: .leading, spacing: 14) {
                    Label("Go to the source.", systemImage: "book.closed").font(.headline)
                    Text("Use the pathway to build skills and experiences. Check requirements, costs, and dates for your applicant type with the universities and your school counselor. Completing this plan does not guarantee admission.")
                        .font(.subheadline).foregroundStyle(NorthstarStyle.muted)
                    Link(destination: URL(string: "https://admission.ucla.edu/apply")!) { Label("UCLA admissions", systemImage: "arrow.up.right") }
                    Link(destination: URL(string: "https://admissions.berkeley.edu/apply-to-berkeley/")!) { Label("UC Berkeley admissions", systemImage: "arrow.up.right") }
                    Link(destination: URL(string: "https://admission.universityofcalifornia.edu/admission-requirements/international-applicants/")!) { Label("UC international applicants", systemImage: "arrow.up.right") }
                }.paperCard(NorthstarStyle.mint.opacity(0.6))
                BrandFooter()
            }.padding(20).frame(maxWidth: 740).frame(maxWidth: .infinity)
        }
    }
}

struct ProgressView: View {
    @EnvironmentObject private var planner: PlannerStore
    @State private var showGrade = false
    private var stats: PlannerStats { PlannerLogic.stats(snapshot: planner.snapshot, date: Date()) }
    private var reflections: [ReflectionEntry] { planner.snapshot.reflections.sorted { $0.date > $1.date } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageIntro(eyebrow: "THE BIG PICTURE", title: "Look how far\nyou’re going.", subtitle: "Real steps. Real reflections. Progress you can see.")
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    StatTile(number: stats.todayCompleted, title: "Today", icon: "checkmark", color: NorthstarStyle.mint)
                    StatTile(number: stats.monthCompleted, title: "This month", icon: "flag", color: NorthstarStyle.lavender)
                    StatTile(number: stats.streak, title: "Day streak", icon: "flame", color: NorthstarStyle.peach)
                    StatTile(number: stats.overallCompleted, title: "All-time steps", icon: "sparkle", color: NorthstarStyle.mint.opacity(0.6))
                }
                VStack(alignment: .leading, spacing: 16) {
                    Text("A week of showing up.").font(.title3.bold())
                    Text("Completed steps, counted on the day you did them.").font(.caption).foregroundStyle(NorthstarStyle.muted)
                    Chart {
                        ForEach(stats.week, id: \.date) { day in
                            BarMark(x: .value("Day", day.date, unit: .day), y: .value("Steps", day.completed))
                                .foregroundStyle(NorthstarStyle.mint).cornerRadius(5)
                        }
                    }.frame(height: 160).chartYScale(domain: 0...max(4, stats.week.map(\.completed).max() ?? 0))
                        .chartXAxis { AxisMarks(values: .stride(by: .day)) { _ in AxisValueLabel(format: .dateTime.weekday(.abbreviated)) } }
                    Label("Some days are quieter. That’s part of life.", systemImage: "leaf").font(.caption).foregroundStyle(NorthstarStyle.muted)
                }.paperCard()
                VStack(alignment: .leading, spacing: 16) {
                    Text("Your month, in balance.").font(.title3.bold())
                    ForEach(PlanCategory.allCases, id: \.self) { category in
                        HStack {
                            Label(category.title, systemImage: category.symbol).font(.subheadline)
                            Spacer()
                            Text("\(stats.categoryCounts[category, default: 0])").font(.subheadline.bold())
                        }
                    }
                }.paperCard()
                gradeSection
                VStack(alignment: .leading, spacing: 16) {
                    Text("Your reflection journal").font(.title3.bold())
                    if reflections.isEmpty {
                        Text("Save a daily check-in on Today. Your story will grow here.").font(.subheadline).foregroundStyle(NorthstarStyle.muted)
                    }
                    ForEach(reflections) { entry in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(entry.date.formatted(date: .abbreviated, time: .omitted)).font(.caption.weight(.semibold)).foregroundStyle(NorthstarStyle.muted)
                            Text(entry.achieved).font(.subheadline)
                            if !entry.next.isEmpty { Text("Next: \(entry.next)").font(.caption).foregroundStyle(NorthstarStyle.muted) }
                            if !entry.intention.isEmpty { Text("My intention: \(entry.intention)").font(.caption).foregroundStyle(NorthstarStyle.muted) }
                            Divider().padding(.top, 8)
                        }
                    }
                }.paperCard()
                BrandFooter()
            }.padding(20).frame(maxWidth: 740).frame(maxWidth: .infinity)
        }.sheet(isPresented: $showGrade) { AddGradeView() }
    }

    private var gradeSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Learn from your grades.").font(.title3.bold())
                    Text("German upper-secondary points · 0–15").font(.caption).foregroundStyle(NorthstarStyle.muted)
                }
                Spacer()
                Button { showGrade = true } label: { Image(systemName: "plus").frame(width: 44, height: 44) }.accessibilityLabel("Record a grade")
            }
            if planner.snapshot.grades.isEmpty {
                Text("Record an honest starting point. Look for improvement, and ask teachers for feedback.").font(.subheadline).foregroundStyle(NorthstarStyle.muted)
                Button("Record my first grade") { showGrade = true }.buttonStyle(NorthstarButtonStyle(secondary: true))
            } else {
                Chart {
                    ForEach(planner.snapshot.grades.sorted { $0.date < $1.date }) { grade in
                        LineMark(x: .value("Date", grade.date), y: .value("Points", grade.points))
                            .foregroundStyle(by: .value("Subject", grade.subject))
                        PointMark(x: .value("Date", grade.date), y: .value("Points", grade.points))
                            .foregroundStyle(by: .value("Subject", grade.subject))
                    }
                }.frame(height: 150).chartYScale(domain: 0...15)
                ForEach(planner.snapshot.grades.sorted { $0.date > $1.date }.prefix(8)) { grade in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(grade.subject).font(.subheadline.weight(.medium))
                            Text(grade.note.isEmpty ? grade.date.formatted(date: .abbreviated, time: .omitted) : grade.note).font(.caption).foregroundStyle(NorthstarStyle.muted)
                        }
                        Spacer()
                        Text("\(grade.points, specifier: "%.1f") / 15").font(.subheadline.bold())
                    }
                }
            }
        }.paperCard()
    }
}

private struct StatTile: View {
    let number: Int
    let title: String
    let icon: String
    let color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: icon).padding(10).background(color, in: Circle())
            Text("\(number)").font(.system(size: 35, weight: .medium, design: .rounded))
            Text(title).font(.caption.weight(.medium))
        }.paperCard()
    }
}

struct AddGradeView: View {
    @EnvironmentObject private var planner: PlannerStore
    @Environment(\.dismiss) private var dismiss
    @State private var subject = ""
    @State private var points = 10.0
    @State private var note = ""
    @State private var date = Date()

    var body: some View {
        NavigationStack {
            Form {
                Section("German upper-secondary grading") {
                    TextField("Subject", text: $subject)
                    Stepper("\(points, specifier: "%.1f") of 15 points", value: $points, in: 0...15, step: 0.5)
                    DatePicker("Assessment date", selection: $date, in: ...Date(), displayedComponents: .date)
                    TextField("What went well? What needs practice?", text: $note, axis: .vertical).lineLimit(2...4)
                }
                Section {
                    Button("Save grade") {
                        planner.addGrade(subject: subject, points: points, note: note, date: date)
                        if planner.persistenceError == nil { dismiss() }
                    }.disabled(subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }.navigationTitle("A starting point.").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}

struct FocusSpaceView: View {
    @EnvironmentObject private var screenTime: ScreenTimeController
    @State private var showPicker = false
    @State private var showCheckin = false
    @State private var authorizing = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageIntro(eyebrow: "PROTECT YOUR ATTENTION", title: "Less scrolling.\nMore living.", subtitle: "A separate daily allowance for every selected social app.")
                VStack(alignment: .leading, spacing: 16) {
                    Label(screenTime.isAuthorized ? "SCREEN TIME AUTHORIZED" : "YOUR PERMISSION COMES FIRST", systemImage: "hand.raised")
                        .font(.caption.weight(.semibold))
                    Text(screenTime.isBlocked ? "Time for a reset." : "Make a little room for your life.")
                        .font(.system(size: 26, weight: .medium, design: .serif))
                    Text("At 30 minutes in an app: a reminder. At 60 minutes: that app is shielded. Open Northstar for a 10-second pause and a check-in.")
                        .font(.subheadline).lineSpacing(4)
                    if !screenTime.isAuthorized {
                        Button {
                            authorizing = true
                            Task { await screenTime.requestAuthorization(); authorizing = false }
                        } label: { Label(authorizing ? "Requesting permission…" : "Authorize Screen Time", systemImage: "lock.shield") }
                            .buttonStyle(NorthstarButtonStyle()).disabled(authorizing)
                    } else if screenTime.isBlocked {
                        Button { showCheckin = true } label: { Label("Take my reflection break", systemImage: "leaf") }
                            .buttonStyle(NorthstarButtonStyle())
                    }
                }.paperCard(NorthstarStyle.mint)
                if let error = screenTime.error { Text(error).font(.subheadline).foregroundStyle(.red).paperCard() }
                if screenTime.notificationDenied {
                    Label("30-minute reminders are off. Allow notifications in iPhone Settings → Northstar. App limits can still work.", systemImage: "bell.slash")
                        .font(.caption).paperCard(NorthstarStyle.peach)
                }
                if let deadline = screenTime.accessBreakEndsAt, deadline > Date() {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Your deliberate access break", systemImage: "timer").font(.subheadline.bold())
                        Text(deadline, style: .timer).font(.system(size: 28, design: .rounded))
                        Text("Limited apps pause again after the break. iOS callback timing can vary.").font(.caption).foregroundStyle(NorthstarStyle.muted)
                    }.paperCard(NorthstarStyle.lavender)
                        .task(id: deadline) {
                            let delay = max(0, deadline.timeIntervalSinceNow)
                            try? await Task.sleep(for: .seconds(delay))
                            guard !Task.isCancelled else { return }
                            screenTime.refreshStatus(reloadSelection: false)
                        }
                }
                if screenTime.isAuthorized {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Your social apps").font(.title3.bold())
                        Text("Choose TikTok, Instagram, Snapchat, or other apps in Apple’s picker. Select individual apps, not whole categories or websites.")
                            .font(.subheadline).foregroundStyle(NorthstarStyle.muted)
                        Button { showPicker = true } label: {
                            HStack { Label("\(screenTime.selection.applicationTokens.count) apps selected", systemImage: "apps.iphone"); Spacer(); Image(systemName: "chevron.right") }
                        }.buttonStyle(NorthstarButtonStyle(secondary: true))
                        Text("After the reflection break").font(.caption.weight(.semibold))
                        Picker("After reflection", selection: $screenTime.resumePolicy) {
                            Text("A deliberate 10-minute break").tag(ResumePolicy.tenMinuteBreak)
                            Text("Stay limited until tomorrow").tag(ResumePolicy.untilTomorrow)
                            Text("Allow access for the rest of today").tag(ResumePolicy.restOfDay)
                        }.pickerStyle(.menu)
                        Button {
                            do { try screenTime.configureLimits() } catch { /* The controller presents the specific configuration error. */ }
                        } label: { Label(screenTime.enabled ? "Save app limits" : "Enable my app limits", systemImage: "shield") }
                            .buttonStyle(NorthstarButtonStyle())
                            .disabled(screenTime.selection.applicationTokens.isEmpty)
                        if screenTime.enabled {
                            Text("Limits are on. They reset daily in your device’s local time.").font(.caption).foregroundStyle(NorthstarStyle.muted)
                        }
                        if screenTime.enabled || screenTime.registrationInterrupted {
                            Button("Turn off my limits", role: .destructive) { screenTime.disableLimits() }.font(.caption).padding(.vertical, 8)
                        }
                        if let note = screenTime.legacyUsageCountingNote {
                            Text(note).font(.caption).foregroundStyle(NorthstarStyle.muted)
                        }
                    }.paperCard()
                }
                VStack(alignment: .leading, spacing: 14) {
                    Label("A kinder kind of limit.", systemImage: "leaf").font(.title3.bold())
                    FocusRule(minutes: "30", title: "A gentle reminder.", detail: "You choose whether scrolling is still worth your attention. Allow notifications for this nudge.")
                    FocusRule(minutes: "60", title: "A moment to reset.", detail: "The app that reached its limit pauses. Open Northstar yourself to reflect; Apple controls the system shield screen.")
                    Text("iOS decides when usage-threshold callbacks arrive. This is a habit tool, not a precise stopwatch or a restriction you cannot revoke.")
                        .font(.caption).foregroundStyle(NorthstarStyle.muted)
                }.paperCard()
                BrandFooter()
            }.padding(20).frame(maxWidth: 740).frame(maxWidth: .infinity)
        }
        .familyActivityPicker(isPresented: $showPicker, selection: $screenTime.selection)
        .sheet(isPresented: $showCheckin) { ScreenTimeReflectionView() }
        .onAppear { screenTime.refreshStatus() }
    }
}

private struct FocusRule: View {
    let minutes: String
    let title: String
    let detail: String
    var body: some View {
        HStack(alignment: .top, spacing: 18) {
            VStack(spacing: 2) { Text(minutes).font(.system(size: 25, design: .rounded)); Text("MIN").font(.system(size: 9)).tracking(1) }.frame(width: 40)
            VStack(alignment: .leading, spacing: 5) { Text(title).font(.subheadline.bold()); Text(detail).font(.caption).foregroundStyle(NorthstarStyle.muted).lineSpacing(3) }
        }
    }
}

struct ScreenTimeReflectionView: View {
    @EnvironmentObject private var planner: PlannerStore
    @EnvironmentObject private var screenTime: ScreenTimeController
    @Environment(\.dismiss) private var dismiss
    @State private var pauseEnds = Date.distantFuture
    @State private var achieved = ""
    @State private var next = ""
    @State private var intention = ""
    @State private var reflectionError: String?

    private var valid: Bool {
        [achieved, next, intention].allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    PageIntro(eyebrow: "PAUSE. BREATHE. CHOOSE.", title: "Come back\nto yourself.", subtitle: "Ten seconds to step out of the scroll. Then a moment to notice your day.")
                    TimelineView(.periodic(from: .now, by: 0.25)) { context in
                        let remaining = max(0, Int(ceil(pauseEnds.timeIntervalSince(context.date))))
                        VStack(spacing: 12) {
                            ZStack {
                                Circle().fill(NorthstarStyle.mint).frame(width: 110, height: 110)
                                if remaining > 0 { Text("\(remaining)").font(.system(size: 40, weight: .medium, design: .rounded)) }
                                else { Image(systemName: "leaf").font(.system(size: 32)) }
                            }.frame(maxWidth: .infinity)
                            Text(remaining > 0 ? "Breathe in. Breathe out." : "Now choose your next step with intention.")
                                .font(.subheadline).foregroundStyle(NorthstarStyle.muted)
                        }
                    }
                    JournalField(title: "What have you done or achieved today?", prompt: "Notice one thing, however small…", text: $achieved)
                    JournalField(title: "What do you still need to do now?", prompt: "Name your next small step…", text: $next)
                    JournalField(title: "What will help you put your phone down?", prompt: "A walk, some water, a change of room…", text: $intention)
                    if let error = reflectionError { Text(error).font(.caption).foregroundStyle(.red) }
                    TimelineView(.periodic(from: .now, by: 0.25)) { context in
                        Button {
                            planner.saveReflection(achieved: achieved, next: next, intention: intention, date: Date())
                            guard planner.persistenceError == nil else { reflectionError = planner.persistenceError; return }
                            do {
                                try screenTime.completeReflection(unlock: true)
                                dismiss()
                            } catch { reflectionError = error.localizedDescription }
                        } label: { Label(screenTime.resumePolicy == .untilTomorrow ? "Save check-in & stay limited" : "Save check-in & take my break", systemImage: "arrow.right") }
                            .buttonStyle(NorthstarButtonStyle())
                            .disabled(!valid || context.date < pauseEnds)
                    }
                    Text("You can leave this check-in; selected apps remain shielded until your chosen policy allows access.")
                        .font(.caption).foregroundStyle(NorthstarStyle.muted)
                }.padding(24)
            }.background(NorthstarStyle.paper)
                .navigationTitle("A moment to reset.").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Stay limited") { dismiss() } } }
                .onAppear { pauseEnds = screenTime.beginReflectionPause() }
        }
    }
}

struct BackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        self.data = data
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct ProfileView: View {
    @EnvironmentObject private var planner: PlannerStore
    @Environment(\.dismiss) private var dismiss
    @State private var profile = PlannerProfile()
    @State private var showExporter = false
    @State private var showImporter = false
    @State private var document: BackupDocument?
    @State private var pendingImport: Data?
    @State private var backupMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Your starting point") {
                    TextField("Your name", text: $profile.name)
                    TextField("School year", text: $profile.schoolYear)
                    TextField("Country and school system", text: $profile.schoolSystem)
                    Stepper("Abitur / graduation: \(String(profile.graduationYear))", value: $profile.graduationYear, in: 2026...2040)
                    Picker("Application year", selection: Binding<Int>(get: { profile.applicationYear ?? 0 }, set: { profile.applicationYear = $0 == 0 ? nil : $0 })) {
                        Text("To be confirmed").tag(0)
                        ForEach(2026...2040, id: \.self) { year in Text(String(year)).tag(year) }
                    }
                }
                Section("Where you want to grow") {
                    TextField("Major or interests · still deciding is okay", text: $profile.major)
                    TextField("Subjects needing attention", text: $profile.subjects)
                    TextField("My grade goal", text: $profile.gradeGoal)
                    Picker("Daily planning budget", selection: $profile.dailyMinutes) {
                        ForEach([30,45,60,90,120], id: \.self) { minutes in Text("\(minutes) minutes").tag(minutes) }
                    }
                    Text("Daily plans balance studying, English/German practice, confidence, wellbeing, activities, and reflection. Adjust them to your actual school day.")
                        .font(.caption).foregroundStyle(NorthstarStyle.muted)
                }
                Section {
                    Button("Save my profile") {
                        planner.saveProfile(profile)
                        if planner.persistenceError == nil { dismiss() }
                    }
                }
                Section("Your data belongs to you") {
                    Text("Stored locally on this iPhone. There is no account or cloud sync. Export backups before deleting the app. Screen Time permissions and app selections aren’t included in a planning backup.")
                        .font(.caption).foregroundStyle(NorthstarStyle.muted)
                    Button { do { document = BackupDocument(data: try planner.exportData()); showExporter = true } catch { backupMessage = error.localizedDescription } } label: { Label("Export a backup", systemImage: "square.and.arrow.up") }
                    Button { showImporter = true } label: { Label("Restore a backup", systemImage: "square.and.arrow.down") }
                    if let message = backupMessage { Text(message).font(.caption) }
                }
                Section("What this app can help with") {
                    Text("Build stronger grades, language skills, confidence, and structure. The college pathway helps you prepare; it cannot predict or guarantee UCLA or UC Berkeley admission.").font(.caption)
                }
            }.navigationTitle("A plan that’s yours.").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
                .onAppear { profile = planner.snapshot.profile }
                .fileExporter(isPresented: $showExporter, document: document, contentType: .json, defaultFilename: "northstar-backup") { result in
                    switch result { case .success: backupMessage = "Your backup is saved."; case .failure(let error): backupMessage = error.localizedDescription }
                }
                .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in
                    do {
                        let url = try result.get()
                        let access = url.startAccessingSecurityScopedResource()
                        defer { if access { url.stopAccessingSecurityScopedResource() } }
                        let values = try url.resourceValues(forKeys: [.fileSizeKey])
                        guard (values.fileSize ?? 0) <= 20 * 1024 * 1024 else { throw CocoaError(.fileReadTooLarge) }
                        pendingImport = try Data(contentsOf: url)
                    } catch { backupMessage = error.localizedDescription }
                }
                .confirmationDialog("Restoring replaces your current tasks, grades, and journal. Export a backup first if you want to keep them.", isPresented: Binding(get: { pendingImport != nil }, set: { if !$0 { pendingImport = nil } }), titleVisibility: .visible) {
                    Button("Restore backup", role: .destructive) {
                        guard let data = pendingImport else { return }
                        do { try planner.importData(data); profile = planner.snapshot.profile; backupMessage = "Your backup is restored." }
                        catch { backupMessage = error.localizedDescription }
                        pendingImport = nil
                    }
                }
        }
    }
}

private struct BrandFooter: View {
    var body: some View {
        VStack(spacing: 8) {
            Text("✦").font(.title3)
            Text("Made for your life, not just your application.").font(.caption)
            Label("Private by default", systemImage: "lock").font(.caption2)
        }.foregroundStyle(NorthstarStyle.muted).frame(maxWidth: .infinity).padding(.vertical, 16)
    }
}

import SwiftUI

@main
struct NorthstarApp: App {
    @StateObject private var planner = PlannerStore()
    @StateObject private var screenTime = ScreenTimeController()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            NorthstarRootView()
                .environmentObject(planner)
                .environmentObject(screenTime)
                .preferredColorScheme(.light)
                .task {
                    while !Task.isCancelled {
                        planner.generateToday()
                        screenTime.refreshStatus(reloadSelection: false)
                        try? await Task.sleep(for: .seconds(15))
                    }
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active {
                        planner.generateToday()
                        screenTime.refreshStatus()
                    }
                }
        }
    }
}

import Foundation
import DeviceActivity
import ManagedSettings
import UserNotifications

final class NorthstarDeviceActivityMonitor: DeviceActivityMonitor {
    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        guard activity == ScreenTimeIDs.dailyActivity else { return }
        // Shared state operations coordinate across all processes, not just this extension.
        do { _ = try ScreenTimeShared().reconcile() } catch { }
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        if activity.rawValue.hasPrefix(ScreenTimeIDs.gracePrefix) { restoreAfterBreak(activity) }
        // Daily shields remain through the final second until the next interval begins.
    }

    override func intervalWillEndWarning(for activity: DeviceActivityName) {
        super.intervalWillEndWarning(for: activity)
        if activity.rawValue.hasPrefix(ScreenTimeIDs.gracePrefix) { restoreAfterBreak(activity) }
    }

    override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
        super.eventDidReachThreshold(event, activity: activity)
        guard activity == ScreenTimeIDs.dailyActivity else { return }
        do {
            if let warning = try ScreenTimeShared().processThreshold(event: event.rawValue) { sendWarning(warning) }
        } catch {
            // Missing or corrupt state never clears previously enforced limits.
        }
    }

    private func restoreAfterBreak(_ activity: DeviceActivityName) {
        do { try ScreenTimeShared().restoreAccessBreak(activityName: activity.rawValue) } catch { }
    }

    private func sendWarning(_ warning: ScreenTimeWarning) {
        let notifications = UNUserNotificationCenter.current()
        notifications.getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
            let content = UNMutableNotificationContent()
            content.title = "A moment to check in"
            content.body = "One of your selected apps reached \(warning.minutes) minutes today. What would help you move toward your goals now?"
            content.sound = .default
            notifications.add(UNNotificationRequest(
                identifier: "\(warning.day).\(warning.event)", content: content, trigger: nil))
        }
    }
}

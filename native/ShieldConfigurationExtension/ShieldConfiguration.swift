import ManagedSettings
import ManagedSettingsUI
import UIKit

final class NorthstarShieldConfiguration: ShieldConfigurationDataSource {
    override func configuration(shielding application: Application) -> ShieldConfiguration {
        makeConfiguration()
    }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        makeConfiguration()
    }

    private func makeConfiguration() -> ShieldConfiguration {
        ShieldConfiguration(
            backgroundBlurStyle: .systemMaterial,
            backgroundColor: UIColor(red: 0.95, green: 0.94, blue: 0.90, alpha: 1),
            icon: UIImage(systemName: "sparkle"),
            title: ShieldConfiguration.Label(text: "Time for a reset", color: .label),
            subtitle: ShieldConfiguration.Label(
                text: "This app reached its one-hour allowance today. Close it and open Northstar yourself for a ten-second pause and reflection.",
                color: .secondaryLabel),
            primaryButtonLabel: ShieldConfiguration.Label(text: "Close this app", color: .white),
            primaryButtonBackgroundColor: UIColor(red: 0.12, green: 0.25, blue: 0.20, alpha: 1),
            secondaryButtonLabel: ShieldConfiguration.Label(text: "Stay limited", color: .secondaryLabel))
    }
}

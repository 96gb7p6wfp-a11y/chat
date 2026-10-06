import ManagedSettings

final class NorthstarShieldAction: ShieldActionDelegate {
    override func handle(action: ShieldAction, for application: ApplicationToken,
                         completionHandler: @escaping (ShieldActionResponse) -> Void) {
        switch action {
        case .primaryButtonPressed: completionHandler(.close)
        case .secondaryButtonPressed: completionHandler(.defer)
        @unknown default: completionHandler(.none)
        }
    }
}

# Northstar for iPhone

This folder contains the native SwiftUI app, a daily planner, and Apple's
Screen Time extension targets. It targets **iOS 17 or later**. The project
requires **macOS and Xcode 16 or later** to compile, sign, and run. Xcode uses
Swift 5 language mode with its bundled compiler, which supports the Swift 5.9
APIs used here. There are no third-party application packages.

Running on a physical iPhone also requires an Xcode version with SDK and
device support for the iOS version installed on that phone. The project's
Xcode 16 baseline does not establish support for an iPhone running iOS 27;
use a compatible current Xcode release for that device.

The Linux cloud workspace can validate the source layout, property lists,
entitlements, and image assets. It cannot compile against Apple's iOS SDK,
run XCTest in an iOS simulator, sign the app, or prove Screen Time behavior.
Passing the source validator is not an iOS build result.

Without a Mac, use the web prototype to try the planner and reflection flow.
The native source and the unsigned CI checks below do not provide an
installable iPhone app. Native device testing still needs a compatible
Mac/Xcode setup and signing, or a separately configured signed distribution
route such as TestFlight.

## Generate and open the project

Install Xcode from Apple's Mac App Store or Apple Developer Downloads. Open
it once and finish the requested component installation. Install XcodeGen
from its maintained Homebrew formula using Homebrew's normal verification:

```sh
brew install xcodegen
```

From this repository's `native` folder, run:

```sh
python3 scripts/validate-project.py
xcodegen generate --spec project.yml
open Northstar.xcodeproj
```

`project.yml` uses JSON-compatible YAML, so the validation script needs only
Python's standard library. XcodeGen 2.42.0 or later is required. Generated
Xcode projects are local output; the reusable source is `project.yml`.

If command-line tools point to a different Xcode installation, select the
installed Xcode in **Xcode → Settings → Locations → Command Line Tools**.

## Sign and run on your iPhone

Select the **Northstar** scheme. In **Signing & Capabilities**, choose your
Apple development team for all four signed targets:

- `Northstar`
- `MonitorExtension`
- `ShieldConfigurationExtension`
- `ShieldActionExtension`

Use the same team for every target. Register the four bundle IDs and the
shared App Group `group.com.northstar.planner` with that team. Every target
needs the **App Groups** and **Family Controls** capabilities. If the sample
bundle IDs are already registered elsewhere, choose your own IDs and App
Group consistently in the project, entitlements, and
`Shared/ScreenTimeShared.swift` before generating the project again. Update
the corresponding expected IDs in `scripts/validate-project.py` as well.

Family Controls requires a signing configuration that supports that
capability. Apple Developer membership and any required entitlement access
must be available; this repository does not supply a development team or
provisioning profiles. Connect your iPhone, enable Developer Mode if iOS
requests it, select it as the destination, and run the app.

The planner works without Screen Time permission. Request Screen Time access
inside the app only when you want app limits, then select apps in Apple's
picker. If permission is declined or unavailable, leave limits disabled and
continue using the planner. If notification permission is declined, a
notification cannot serve as the 30-minute reminder. Neither permission
should be treated as a prerequisite for planning your day.

## Build and test on a Mac

List the destinations available in your installation:

```sh
xcodebuild -project Northstar.xcodeproj -scheme Northstar -showdestinations
```

Replace `YOUR_SIMULATOR_UDID` below with one listed iOS simulator identifier:

```sh
xcodebuild -project Northstar.xcodeproj -scheme Northstar \
  -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_UDID' \
  CODE_SIGNING_ALLOWED=NO test
```

The scheme builds the host, all three extensions, and the `NorthstarTests`
target, which includes `PlannerTests`. Simulator tests validate planner
logic; they do not establish that Screen Time authorization, usage
thresholds, notifications, or shield extensions work on a physical device.

## Optional GitHub Actions simulator checks

The repository includes `.github/workflows/ios.yml`, which runs on GitHub's
`macos-latest` runner when native files change in a push or pull request, or
when started manually through **Actions → Native iOS build and tests → Run
workflow**. It installs XcodeGen from Homebrew, validates the source inputs,
generates the project, selects an actually available iPhone simulator, and
runs an unsigned build and XCTest. Test results and the build log are saved
as an Actions artifact when they are produced, including on a failed test
run.

This workflow has been added locally and has **not been executed from this
Linux workspace**. Its YAML and commands can be checked here; the first
macOS run must establish whether the native project compiles and its tests
pass. No GitHub workflow has been triggered or source pushed as part of
creating this file. Running the workflow may use your account's Actions
allowance.

The CI result is a simulator test bundle and log. It has no distribution
signing, provisioning profile, or deployment step, and its unsigned outputs
cannot be installed on your iPhone. It also cannot test real app-usage
thresholds or grant Apple's Family Controls distribution entitlement.

## Device checks before relying on limits

Use a physical iPhone to check granting and declining Family Controls
authorization; selected-app tokens and thresholds; notification permission;
30-minute reminders; 60-minute shields; and the daily reset. Check with the
host app closed, after a device restart, and after authorization is revoked.
Check every selected app separately because these are per-app daily limits.
Allow for iOS delivery timing rather than assuming an exact threshold alarm.

Also check that removing or disabling limits restores access, that the
reflection flow preserves work, and that the planner remains usable without
permissions. Screen Time APIs determine what an extension may display or
launch. A shield cannot act as an arbitrary full-screen mini-app or display
a continuously updating custom ten-second countdown. The source documents
the supported interruption and reflection behavior; test that behavior on
device before describing it as enforced.

## Distribution and privacy

Before TestFlight or App Store distribution, request Apple's **Family
Controls distribution entitlement** for the host and every relevant
extension bundle ID, configure the shared App Group, and use matching
distribution provisioning profiles. Distribution depends on Apple's
approval and signing requirements. A development build or successful
simulator test does not provide that approval.

The planner stores its data on the device; the Screen Time targets share
only their necessary state through the declared App Group. Selected apps
are represented by Apple's private tokens, not names recovered by this
app. No cloud account or analytics service is configured. Back up any
exported planning data somewhere you control before deleting the app or
changing devices. Choose your own privacy policy and complete Apple's
privacy disclosures before distribution, based on the shipped behavior.

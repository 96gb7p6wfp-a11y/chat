# Native iPhone Screen Time implementation and validation

The native source in `native/` implements the planner's Screen Time integration using Apple's frameworks. Xcode project generation, an unsigned iPhone simulator build, and XCTest passed in [GitHub macOS CI](https://github.com/96gb7p6wfp-a11y/chat/actions/runs/37534343286) on commit `32351ac`. Signing and physical-iPhone Screen Time validation remain outstanding. The separate web companion cannot measure time spent in TikTok, Instagram, or Snapchat, restrict those apps, or place a countdown over them; its focus timer measures only a session started inside the planner.

For immediate limits, configure the iPhone's built-in **Settings → Screen Time → App Limits**. Apple support: <https://support.apple.com/guide/iphone/set-up-screen-time-for-yourself-iphb0c7313c9/ios>. Screen Time and this planner can be used together.

## Native implementation path

The relevant APIs are linked below; their current pages could not be fetched in this cloud environment because the network proxy returned HTTP 403. Source implementation and static project checks do not establish that runtime limits work.

1. Build a SwiftUI iPhone app using Xcode on macOS. Plan for iOS 16 or later for individual, self-management authorization. Request `FamilyControls` authorization and let the user select apps through `FamilyActivityPicker`; do not assume access to arbitrary installed-app identifiers.
2. Configure the Family Controls capability for the app and required extensions. Distribution requires Apple's approval for the Family Controls entitlement. Confirm provisioning for each target before promising TestFlight or App Store availability.
3. The user chose **separate allowances per app**. The Device Activity Monitor extension uses one daily repeating `DeviceActivitySchedule` with separate 30- and 60-minute events for each selected app. Selection, settings, and the private token-event map form one Codable configuration inside an atomically written App Group JSON snapshot. Every app/extension operation acquires the same POSIX file lock, reads current data from disk, and keeps mutations and shield writes inside that lock. The lock file remains separate from the replaced snapshot. Configuration is persisted provisionally before monitoring registration, marked committed only after registration succeeds, and restored as a whole if registration throws; callbacks cannot read a mixed configuration. If the host terminates during registration, the app reports interrupted setup and requires saving limits again, preserving previously applied shields in the meantime. Configuration-specific event IDs reject callbacks from an older configuration. Selecting categories or websites produces a setup error: choose individual applications only. On iOS 17.4 and later, events explicitly include usage earlier in today's interval; on 17.0–17.3 that option is unavailable, so earlier usage after setup or reconfiguration may not be counted.
4. At the lower threshold, deliver a reminder using supported notification APIs and the required notification authorization. At the upper threshold, apply a `ManagedSettingsStore` shield to the selected applications. A threshold callback is not a guarantee of an exact, second-by-second wall-clock trigger; measure behavior on a real iPhone.
5. The native host app handles the three reflection questions and ten-second pause. The pause end time is persisted in the App Group, and unlocking is rejected until it has elapsed. Saving a reflection alone does not unlock apps. The selectable policies are a ten-minute access break, remaining limited until tomorrow, or explicitly exempting currently limited apps for today. The user's preferred policy is a deliberate ten-minute access break, followed by restrictions again. A ten-minute break is implemented with a nonrepeating 15-minute activity interval and a five-minute end warning requesting re-shielding; the end callback at 15 minutes and app-open reconciliation are fallbacks. The break is provisional until its restore schedule registers successfully, and an uncommitted break never unlocks apps. Callback timing is controlled by iOS, so exact restoration timing requires device validation. Only currently limited apps receive the break; another app reaching its own limit is still shielded. Only one access break can run at a time, so a second request cannot replace its tokens or extend its deadline. Changes to app limits must wait for an active access break to finish.
6. Prototype shield interactions on a physical device before fixing the final flow. Apple's shield UI uses constrained configuration and action APIs. Do not promise an arbitrary live countdown, text fields directly over another app, or an automatic transition into the planner. A practical first prototype keeps selected apps shielded until the user voluntarily opens the planner, finishes the pause and reflection, and requests a defined access window.

Self-management authorization can be revoked by the user. This should help form habits; it should not be described as impossible to bypass. Test timezone changes, day boundaries, app removal, denied permissions, app restarts, and real usage against the final agreed limits.

## Required physical-iPhone checks

- Build all four targets with Xcode, correct signing, the shared App Group, and approved Family Controls entitlements. Check the monitor, shield configuration, and shield action extensions actually load.
- Allow individual Screen Time authorization, select two individual apps, and verify separate counters: one app reaching its warning or limit must not consume the other app's allowance. The 60-minute callback adds only the matching app to the persisted limited-token set.
- Check the 30-minute reminder with notifications allowed, denied, and Focus enabled. The notification uses generic wording because application tokens are private, and denied notification permission does not disable the 60-minute shield.
- Close the shield using its primary button; manually open Northstar. Verify both shield buttons leave the limits intact and never claim to open Northstar automatically.
- Confirm unlocking is rejected before the persisted ten-second pause ends, including after app dismissal and restart. Complete the reflection, then deliberately request access.
- Test each unlock policy. For the ten-minute break, measure warning and end callbacks while Northstar is closed; verify limited apps are shielded again and a different app hitting its limit during the break remains restricted. Treat delayed callbacks as an OS limitation and adjust the design after real measurements.
- Test midnight, timezone changes, phone reboot, reconfiguration during the same day, deselected apps, revoked authorization, and missing/corrupt shared configuration. Daily exemptions must expire on the next day, and a configuration failure must not silently clear existing shields.
- Check near-simultaneous threshold callbacks for two apps while the host saves app selection. App and extensions coordinate read/union/prune/write operations with a shared file lock; physical-device testing must verify both per-app shields remain present after concurrent callbacks. Interrupt processes during a transaction and confirm automatic lock release and intact JSON state.
- Terminate the host during daily-monitor registration and during access-break registration. Interrupted daily setup must be disclosed and require saving limits again; an uncommitted access break must preserve shields. Terminate after saving disabled settings and confirm host or monitor reconciliation clears this app's named store. Also test start/stop registration while threshold callbacks are waiting for the shared lock, because iOS controls those framework interactions.

The source safeguards can be checked on Linux with `python native/scripts/validate-screen-time.py`. This checks locking/configuration contracts, per-app merge operations, rollback, generation-specific break callbacks, persisted pause validation, and version-gated past usage. It does not compile Swift or execute the iOS frameworks.

Official Apple references:

- [Family Controls](https://developer.apple.com/documentation/familycontrols)
- [Device Activity](https://developer.apple.com/documentation/deviceactivity)
- [Managed Settings](https://developer.apple.com/documentation/managedsettings)
- [Managed Settings UI](https://developer.apple.com/documentation/managedsettingsui)
- [Family Controls entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.family-controls)
- [What's new in the Screen Time API, WWDC22](https://developer.apple.com/videos/play/wwdc2022/110336/)

## College planning scope

Use the planner to help maintain grades, prepare suitable coursework, develop sustained interests, record meaningful contributions, and track application work. It should not present a checklist as a guarantee of admission or predict an admissions probability from task completion.

Before personalizing admissions milestones, establish the student's country and school system, school year and expected application year, first-year versus transfer route, intended subject, current grades and courses, and weekly available time. Requirements depend on that context. Review official deadlines and requirements for the relevant cycle instead of copying stale dates into the app.

Official planning references:

- [UCLA application information](https://admission.ucla.edu/apply)
- [UC Berkeley application information](https://admissions.berkeley.edu/apply-to-berkeley/)
- [University of California admission requirements](https://admission.universityofcalifornia.edu/admission-requirements/)
- [University of California application information](https://admission.universityofcalifornia.edu/how-to-apply/)

These official domains were also blocked by the current proxy. No current application deadline, grade threshold, or cycle-specific requirement was verified during this implementation.

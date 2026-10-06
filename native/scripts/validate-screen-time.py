#!/usr/bin/env python3
"""Check Screen Time source invariants; this does not compile or execute Swift."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def function(source, name):
    match = re.search(r"\bfunc\s+" + re.escape(name) + r"\b[^\{]*\{", source)
    require(match is not None, f"Missing function {name}")
    start = match.end()
    depth = 1
    for offset, character in enumerate(source[start:], start):
        depth += (character == "{") - (character == "}")
        if depth == 0:
            return source[start:offset]
    raise ValueError(f"Unbalanced function {name}")


def main():
    shared = (ROOT / "Shared/ScreenTimeShared.swift").read_text()
    host = (ROOT / "Northstar/ScreenTimeController.swift").read_text()
    monitor = (ROOT / "MonitorExtension/ActivityMonitor.swift").read_text()
    require("UserDefaults" not in re.sub(r"//[^\n]*", "", shared + host + monitor),
            "Screen Time must not use process-local preference caches")
    require("northstar-screen-time.lock" in shared and "northstar-screen-time.json" in shared,
            "A stable lock file must be separate from the atomically replaced state file")
    locking = function(shared, "withExclusiveLock")
    require("Darwin.flock(descriptor, LOCK_EX)" in locking, "Missing process-safe exclusive lock")
    require("Darwin.flock(descriptor, LOCK_UN)" in locking and "Darwin.close(descriptor)" in locking,
            "Lock and descriptor must be released")
    require(locking.index("LOCK_EX") < locking.index("operation()"), "State operation must follow lock acquisition")
    require("Data(contentsOf: stateURL)" in function(shared, "loadLocked"), "Read current persisted data per operation")
    require(".atomic" in function(shared, "saveLocked"), "Persist whole state using atomic replacement")
    configuration = re.search(r"struct ScreenTimeConfiguration: Codable\s*\{([^}]+)\}", shared)
    require(configuration is not None, "Configuration must be one Codable value")
    require(all(field in configuration.group(1) for field in ("selection:", "settings:", "events:", "generation:")),
            "Selection, settings, event map, and generation must be in the same configuration")
    for name in ("configure", "disable", "reconcile", "processThreshold", "beginReflectionPause", "completeReflection", "restoreAccessBreak"):
        require("withExclusiveLock {" in function(shared, name), f"{name} must share the cross-process transaction lock")
    configure = function(shared, "configure")
    require(configure.index("saveLocked(state)") < configure.index("try startMonitoring()"),
            "Commit coherent configuration before monitoring registration")
    require("saveLocked(previous)" in configure, "Monitoring failure must restore previous whole snapshot")
    require("state.configuration?.registrationCommitted = false" in configure and
            configure.index("try startMonitoring()") < configure.index("state.configuration?.registrationCommitted = true"),
            "Configuration must be committed only after monitor registration succeeds")
    require("guard configuration.registrationCommitted else { return }" in function(shared, "applyShieldsLocked"),
            "Interrupted configuration must not clear previously applied limits")
    require("state.limitedTokens.formIntersection" in configure, "Selection pruning must merge latest locked state")
    threshold = function(shared, "processThreshold")
    require("configuration.events.first" in threshold and "state.limitedTokens.insert(entry.application)" in threshold,
            "Threshold lookup and per-app token union must use the same locked configuration")
    require(threshold.index("saveLocked(state)") < threshold.rindex("applyShieldsLocked"),
            "Persist threshold union before applying shields")
    restoration = function(shared, "restoreAccessBreak")
    require("accessBreak.activityName == activityName" in restoration, "Old break callbacks must not restore a new generation")
    require("accessBreak.deadline.timeIntervalSince(now) <= 1" in restoration,
            "Early callbacks must not clear unexpired access breaks")
    reflection = function(shared, "completeReflection")
    require("ScreenTimeIDs.gracePrefix + UUID().uuidString" in reflection,
            "Every break needs a distinct Device Activity name")
    require("end <= now" in reflection and "reflectionPauseRequired" in reflection,
            "Explicit unlock must require the persisted pause to have elapsed")
    require("var isCommitted = false" in shared and "accessBreak.isCommitted" in function(shared, "shieldTokens"),
            "A provisional break must not unlock apps")
    require(reflection.index("try startAccessBreak(accessBreak)") < reflection.index("state.accessBreak?.isCommitted = true"),
            "Only successful schedule registration may commit an access break")
    require("!accessBreak.isCommitted" in function(shared, "reconcile"),
            "Interrupted break registration must be discarded on reconciliation")
    require("!configuration.settings.enabled" in function(shared, "applyShieldsLocked") and
            "store.clearAllSettings()" in function(shared, "applyShieldsLocked"),
            "Successfully decoded disabled state must recover an interrupted shield-clear")
    require("#available(iOS 17.4, *)" in host and "includesPastActivity: true" in function(host, "makeEvent"),
            "Use explicit past-usage counting only on its supported iOS version")
    require("legacyUsageCountingNote" in host, "Older iOS usage-counting behavior needs an advisory")
    require("registrationInterrupted" in host and "configured && committed && isAuthorized" in host,
            "Host must disclose interrupted registration instead of reporting active monitoring")
    require("ScreenTimeShared().processThreshold" in monitor and "restoreAccessBreak(activityName: activity.rawValue)" in monitor,
            "Monitor callbacks must use the shared locked operations")
    require(".defaults" not in host, "Host must not bypass coordinated state access")
    print("Screen Time source safeguards passed: locked fresh snapshots, atomic configuration, per-app merges, rollback, committed registrations, break generations, pause validation, and version-gated past usage.")
    print("Static inspection only: not an iOS compile, runtime concurrency test, or physical-device Screen Time validation.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        print(f"Screen Time source safeguards failed: {error}", file=sys.stderr)
        sys.exit(1)

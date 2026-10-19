# Academic coach validation

Use a production build for offline and final mobile-layout checks. Test
records must stay in an isolated browser profile; example marks, mock scores,
dates and achievements are test scenarios, not application defaults.

## Verified run — 19 October 2026

- Node.js 24.19.0; npm 11.9.0; frozen dependencies installed with `npm ci`.
- `npm test`: **254 passed, 0 failed, 0 skipped**.
- Production build: passed; application and stable vendor assets split without a bundle warning.
- Production browser suite: **25 passed, 0 failed**, including both pathways,
  preserved missed-task history, grade scenarios, IELTS cadence, all main screens,
  320/390/430 px widths, 200% text, shortened keyboard viewports and offline reload.
- No uncaught browser errors or console errors across those scenarios.
- The maintained suite is also reachable through the previous
  `tests/browser_smoke.py --url … --production` command.
- Interactive browser walkthroughs covered grade entry/weights/impossible targets,
  school lessons and A/B conflicts, IELTS setup/mock results, evidence CRUD and
  guided draft/reflection/reload. Test screenshots are in ignored `test-results/`.

Physical iPhone Safari and installed Home Screen acceptance remain unverified.
These results validate the local production build. Publication is verified
separately through the existing Pages workflow and the public website.

## Repeatable checks

```sh
npm ci --no-audit --no-fund
npm test
npm run build
npm run preview -- --port 4176 --strictPort
```

With the preview running, use another terminal:

```sh
python3 tests/coach_upgrade_browser.py --url http://127.0.0.1:4176
```

The current academic-upgrade suite includes onboarding, fresh unknown data,
simple/weighted grades, missing weights, semesters, impossible scenarios,
exam urgency, lesson conflicts/A-B weeks, IELTS evidence, application profile,
guided reflection, task preservation/movement, focus time, reviews, backups,
recovery, empty states, keyboard-height changes, phone sizes, 200% text,
themes and offline reload. Its actual result is written to
`test-results/coach-upgrade/results.json`; do not infer a pass from the
existence of this checklist. `--case NAME` runs a named scenario and its
required UI setup. The script has no `--production` flag.

Domain tests cover grade arithmetic and forecasts, priority changes,
availability, revisions, task lifecycle, timetable conflicts, IELTS scoring
and evidence, learning reviews, profile evidence and storage compatibility.
No separate lint/type-check commands are configured in `package.json`.

## Real-device acceptance

Chromium's mobile viewport is useful regression coverage, not a physical
Safari certification. On a real iPhone:

1. Export a backup from any existing installation before testing an upgrade.
2. Open the HTTPS app in Safari. Confirm your existing records survive;
   separately test first launch with unknown grades in a clean test profile.
3. Complete optional setup, review the mission, enter a current dated grade
   and check the new average/target explanation. Switch semesters and test
   missing weights plus an impossible future-grade scenario.
4. Add a real lesson/commitment, including an A/B week if needed, and verify
   Today avoids it. Enter an exam with known topics and review the generated
   preparation. Keep study allowances realistic rather than filling all
   unscheduled time.
5. Start a task, open its materials, save a draft and reflection, pause/resume
   focus, complete one action and skip/move another. Reload and verify notes,
   measured time and completion remain intact.
6. Enter IELTS targets and a test/mock result with the correct provenance.
   Check the four skills and that task completion does not invent a band.
7. Add a real activity/project with an evidence note. Check planned,
   self-reported and user-supported records remain distinguishable.
8. Review the week and ensure the next plan responds to its chosen focus.
9. Test light/dark modes, large system/browser text, long task names,
   safe-area spacing, all bottom tabs and empty states. Open every form with
   the keyboard visible; make sure fields and Save/Close remain reachable.
10. Add to the Home Screen, reopen, background/resume an active focus
    session, then test offline after a successful online visit. Export and
    restore a backup in an isolated profile.

Do not mark physical-device acceptance complete until these checks have
actually run on that device. App updates should not erase local storage on
the same origin; browser eviction, clearing data and switching origins are
separate risks addressed by backups.

## Publication

The existing Pages workflow remains the publication route. After review,
commit and push app changes to `main`; GitHub Pages must use **GitHub
Actions** as its source. A local production build or QA run does not publish
anything. Verify the new Actions run and final HTTPS site before asking the
user to replace an installed copy.

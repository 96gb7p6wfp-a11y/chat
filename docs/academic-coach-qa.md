# Academic coach validation

Use a production build for offline and final mobile-layout checks. Test
records must stay in an isolated browser profile; example marks, mock scores,
dates and achievements are test scenarios, not application defaults.

## Verified release checks — 19–20 October 2026

- Node.js 24.19.0 and npm 11.9.0; frozen dependency lock preserved.
- `npm test`: **289 passed, 0 failed, 0 skipped** in `/tmp/ux-unit-publish.log`.
- Root and `/chat/` production builds passed. Vite reports a main-chunk size
  advisory (approximately 558 kB minified / 166 kB gzip); this is not a build
  failure or a claim of a completed performance optimization.
- Maintained academic browser suite: **25 passed, 0 failed** against the
  production snapshot, including both pathways, preserved missed-task history,
  grades, IELTS, focus time, backup/recovery and offline reload.
- New Q1 repair browser suite: **8 passed, 0 failed**, covering reviewed imports
  of exactly nine examinations and 19 lesson blocks, corrected-record re-import,
  the unconfirmed German 4/15 draft, preservation after correcting its grade,
  missing forecast assumptions, achievable
  and impossible targets, completion/skip/review, IELTS/SAT setup, evidence,
  changed dates, official-link actions and backup restoration. An explicit
  08:00–17:00 study window verifies lessons remove conflicting session times.
- No uncaught page errors or application console errors in these journeys.
- Hosting browser suite: **5 passed**, covering both root and `/chat/` paths,
  manifest resolution, cache isolation/cleanup, real interface font bytes,
  offline reload and exclusion of authenticated, private, no-store,
  query-bearing and outside-scope requests.
- Responsive audit script covers 320/360/375/390/430/768/1280 px, light/dark and
  100%/200% text with populated forms: **28 configurations passed**.
  It includes the IELTS and SAT goals/results, reviewed school imports,
  grade analysis, task editing/movement, guided learning, focus timer, every
  secondary screen, and a reduced keyboard viewport with reachable actions.
- Interactive screenshot inspection found and repaired the overlapping form
  grid, toast-over-modal obstruction, tiny schedule inputs and focus-clock
  wrapping under enlarged text. Screenshots remain in ignored `test-results/`.

Physical iPhone Safari, the native iOS keyboard/date picker and installed Home
Screen acceptance remain unverified. Official provider pages could not be
retrieved through this environment's network policy; current prices, available
places/dates and document rules are linked but not claimed to be live verified.
The final eight-case repair journey also passed on the exact `/chat/` release
build after the corrected-grade regression fix. These results validate local
production builds. Publication must be verified
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
python3 tests/ux_repair_browser.py --url http://127.0.0.1:4176
python3 tests/responsive_browser.py --url http://127.0.0.1:4176
python3 tests/hosting_smoke.py
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
and evidence, SAT scores and shared test budgets, reviewed school imports,
learning reviews, profile evidence and storage compatibility.
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

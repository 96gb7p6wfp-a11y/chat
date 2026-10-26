# Academic coach validation

Use a production build for offline and final mobile-layout checks. Test
records must stay in an isolated browser profile; example marks, mock scores,
dates and achievements are test scenarios, not application defaults.

## Verified release checks — 26 October 2026

- Node.js 24.19.0, npm 11.9.0; frozen dependency lock retained.
- `npm test`: **319 passed, 0 failed, 0 skipped** (`/tmp/tutor-release-unit.log`).
- Production root and `/chat/` builds passed. Practice content, roadmap and vendor
  assets are separate static chunks discoverable by the offline shell. Main app
  chunk is approximately 482 kB minified / 137 kB gzip; no bundle-size warning.
- Existing browser regression: **25/25 passed**. Q1 document repair regression:
  **8/8 passed**. New personal-tutor browser journeys: **8/8 passed**.
- Critical flows include confirmed 8/9-point records with explicit weights,
  target 13, a next-score threshold of 14.8 (15 whole points), an impossible
  22-point scenario, multiple remaining unknowns, comparison scenarios and reload.
  These are isolated test assumptions, not the user's required school result.
- Baseline 8.5 remains unconfirmed and cannot generate a fictitious exact forecast.
  Home improvement opens the relevant subject directly. Unknown/unsupported
  examination topics require a choice or explicitly show incomplete coverage.
- Authored Civil Rights material was exercised through learning, all three
  questions, answer input/reload, solutions, self-checks, mandatory retry,
  saved mistake, completion and a later review. Older notes and attempts survive.
- Responsive audit: **28/28 configurations passed** across 320/360/375/390/430/
  768/1280 px, both themes and 100%/200% text. Populated forms, target calculation,
  actual exercise/solution views and shortened keyboard viewports are covered.
- Four additional targeted browser checks passed: actual exam-preview material,
  opening the matching scheduled tutor, separate explanation paragraphs, and
  Listening question preview with the transcript hidden before checking.
- Hosting suite: **5/5 passed** for root and `/chat/` manifest resolution, cache
  isolation/cleanup, offline content and bundled font fallback, authenticated/
  private/no-store/query exclusions and base-path validation.
- No uncaught page errors or application console errors in the tested journeys.
  Fresh 320/390 px light/dark screenshots were inspected; artifacts remain in
  ignored `test-results/` and execution logs under `/tmp/`.

Physical iPhone Safari, its native keyboard/date picker and installed Home Screen
acceptance remain unverified. Headless Chromium has no English speech voice, so
Listening's honest unavailable-voice fallback was checked; audible playback needs
a supported device. Authored content covers 17 modules, not the entire curriculum.
Writing and confidence checks are self-assessments, not automatic school grades,
IELTS bands or a qualified tutor's correction. Unsupported content says so.

Official provider prices, dates and document rules remain linked rather than
claimed live-verified. Publication is verified separately through the existing
Pages workflow and public release bytes/browser flow.

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
python3 tests/personal_tutor_browser.py --url http://127.0.0.1:4176
python3 tests/responsive_browser.py --url http://127.0.0.1:4176
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
6. Start a specific tutor module, answer, compare and retry a question. Close
   and reopen mid-session to check answers persist. Confirm an unsupported topic
   is clearly unavailable. On a device with an English voice, try the original
   Listening exercise before revealing its transcript. Enter IELTS targets and a test/mock result with the correct provenance.
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

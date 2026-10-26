# Academic coach validation

Use a production build for offline and final mobile-layout checks. Test
records must stay in an isolated browser profile; example marks, mock scores,
dates and achievements are test scenarios, not application defaults.

## Verified release checks — 26 October 2026

- Node.js 24, npm 11; dependency lock and existing Pages workflow retained.
- `npm test`: **464 passed, 0 failed, 0 skipped**. New coverage includes
  university provenance, SAT relevance, informal diagnostic feedback, backward
  Abitur scenarios, official conversion boundaries, legal rule risks and
  additive-data preservation.
- Production root and `/chat/` builds pass. Main application is approximately
  584 kB minified / 166 kB gzip and emits Vite's 500 kB size advisory. An attempted
  extra manual chunk caused a production initialization cycle; it was removed,
  and browser startup was tested. Stable vendor/domain assets remain cached.
- Browser journeys: maintained coach **25/25**, Q1 UX **8/8**, personal tutor
  **8/8**, Hessen **8/8**, new growth coach **7/7**. Core flows include first
  launch, three-area navigation, UCL versus UCLA, provisional 2027 references,
  source verification, SAT diagnostic and real Bluebook input, dated provider
  comparisons, personal Abitur target, reversible Q1–Q4 scenarios, poor-exam
  diagnosis, real exercises, self-checks and retained drafts.
- Mobile regression: **28/28** width/theme/text configurations at
  320/360/375/390/430/768/1280 px and 100%/200% text. New populated goal,
  requirement-source, SAT/IELTS, diagnostic, provider-date and Abitur forms pass
  **16/16** configurations. References are expanded during checks.
- Actual defects found and fixed: production chunk initialization, a missing
  recovery-view import, inaccessible skipped drafts, a rotated disclosure
  arrow extending 2 px outside the viewport, and overly large narrow headings.
  No global horizontal-overflow hiding was added.
- Hosting suite **5/5**: root and project-path manifests, scoped cache cleanup,
  offline shell/fonts, private/authenticated/no-store/query exclusions and
  valid base paths. Worker generation is `v10`; data remains in the existing
  `northstar.coach.v2` local storage key.
- No uncaught page errors or application console errors in passing journeys.
  Screenshots of actual exercises, populated IELTS forms, source references,
  target scenarios and phone layouts were inspected.

The official consolidated Hessen OAVO, current through the June 2026 amendment,
and the published 2028 written dates were inspected. Full attendance/special-case
eligibility and the complete official subject curriculum remain incomplete.
UCL's 2027 source is explicitly provisional for 2028. SAT dates/fees and British
Council guidance are dated source snapshots; IELTS price and all seat availability
remain unverified. See the separate source audits.

Physical iPhone Safari, native date pickers/keyboards, audible speech synthesis
and installed Home Screen acceptance still need a real device. Writing checks
are self-assessments, not official marks or reliable machine essay correction.
Publication is verified separately against the actual deployed release bytes.

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
python3 tests/hessen_browser.py --url http://127.0.0.1:4176
python3 tests/growth_coach_browser.py --url http://127.0.0.1:4176
python3 tests/growth_forms_browser.py --url http://127.0.0.1:4176
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

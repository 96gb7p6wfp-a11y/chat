# Northstar

An iPhone-first academic and university preparation coach, built as a local
React PWA. **Heute** explains your academic situation, the most useful next
step, and how to carry it out. Four primary screens keep daily learning,
school planning, progress and university preparation together.

The starting context is a Gymnasium in Hessen, Q1, Mathematics and Physics
Leistungskurse, Abitur 2028, and USA/Germany pathways. All values are editable.
A new profile does **not** prefill historical grades as current results:
current grades, overall target average, test scores, examination dates,
school lessons and exact volleyball hours remain unknown until entered.
Tuesday/Friday evening volleyball is noted without inventing clock times.
Existing saved profiles keep their actual grades, timetable and history.

## The experience

- **Heute:** a compact charcoal mission, one academic priority, a distinct next-exam
  countdown and grade-improvement opportunity, then three actionable task rows.
  Unfinished work comes first. More tasks, history and daily context remain
  available behind disclosures. Subject averages and target calculations live
  in Fortschritt; tapping an improvement opportunity opens that subject directly.
- **Lernplan:** weekly priorities, school lessons, study allowances and fixed
  commitments, exams, a shared deadlines timeline and separate USA/Germany
  university roadmaps. Lessons support rooms, teachers and alternating A/B
  weeks. Entering an exam creates an adaptive preparation sequence.
- **Fortschritt:** fast grade entry, editable assessment history, semester
  comparisons, transparent averages and future-grade scenarios. Weekly
  completion, estimated task time, separately measured focus time, reviews,
  IELTS evidence, exam preparation and roadmap progress remain available.
- **Profil:** academic background, goals, subjects, university shortlist,
  activities, projects and work experience, evidence and specific next
  development actions. IELTS and SAT share a secondary preparation section.
  Study windows, commitments, theme and portable JSON backups are editable here.

Four optional setup steps create a first plan without requiring every field.
Blank grades and missing examination dates stay blank. The initial study
allowances and windows are editable planning preferences, not a claim about
known school hours or actual free time.

## Review your Q1 documents

Open **Profil → Deine Q1-Unterlagen**, or **Lernplan → Prüfungen / Stundenplan →
Import prüfen**. The supplied 2026/2027 document pack contains only the nine
personally confirmed examinations and 19 extracted timetable blocks. Review and
correct the timetable before saving. Double periods, course codes, teacher
abbreviations and rooms remain editable. The Tuesday sport room stays unknown.

Imports merge by stable provenance and existing subject/date or lesson identity;
repeating them preserves later corrections. Overlaps are flagged instead of
silently replacing lessons. The exam review explicitly controls whether imported
exam subjects are enabled for planning. No exam topics, times or rooms are invented.
The supplied German 4/15 result is an unconfirmed grade-entry draft until its
assessment type, date and weight have been supplied. It is not a final course grade.

## Hessen 2028 scenarios and post-exam recovery

Open **Fortschritt → Mein Abitur 2028** for separate semester results and selected
Block I/II scenarios. Course-hour assessment plans, explicit classroom-performance
scenarios, current Q1/Q2 topic selection and post-exam recovery are integrated
with the same daily study allowance. See [the implementation and source status](docs/hessen-2028.md).

**Official verification remains incomplete:** the managed network blocks the
mandatory Hessen sources. The supplied topic fields and general count rules are
labelled provisional. This release cannot certify official course inclusion,
examination eligibility or passing, and does not claim the complete ten-subject
official Q1/Q2 catalogue or verified 2028 examination dates.

## Academic intelligence

Grades use the German upper-secondary **0–15 point** scale; zero is valid.
Each assessment can include its category, date, Q1–Q4 semester, note and
explicit relative weight. Supported categories are written assessments,
oral results, participation, presentations and other work.

Choose the calculation for each subject:

- **Simple mean:** all recorded assessments count equally.
- **Individual weights:** every assessment needs an explicit weight.
- **Category weights:** category means receive the weights you enter;
  results within each category count equally. Missing categories or
  unconfigured weights keep the weighted result open rather than silently
  changing the rule.

Course weights for the overall average are also editable. An LK is not
silently counted twice. These are transparent course estimates, **not an
official Hessen course or final Abitur calculation**.

Assigned assessments default to the current school semester. Q1 results are
not presented as Q2 performance when Q2 is still empty. Older unassigned
records and original undated starting values remain available as clearly
labelled orientation; they are not invented assessments or silently mixed
with dated results.

Subject details immediately show **the minimum next score**, target, current
calculated average and next saved exam. Configure the remaining assessments and
actual weighting once; the hypothetical setup persists by semester. An undated
starting estimate never supplies fictional assessment data. Missing records,
weights or later-result assumptions keep the answer open.

Choose the next unknown result or the mean required across remaining unknown
results. Detailed arithmetic, best-case outcomes and a user-entered comparison
stay expandable. Requirements above 15 are explicitly impossible under those
assumptions. Future scenarios never become actual grades or change study priorities.

An explainable priority engine combines actual target gaps, approaching
assessments and deadlines, LK study importance, recent results, practice
history, difficulty, personal preferences and available time. Manual subject
priorities can override the normal emphasis. A grade or timetable change
updates the plan without deleting saved work or rewriting previous days.

## Interactive learning

Opening a task initially shows its topic, duration and first actual exercise.
**Lernen starten** opens a sequence: short explanation → one question at a time →
model answer and checking criteria → a second attempt on uncertain questions →
a saved mistake and completion. Answers and position autosave independently of
older notes. Reviewing or changing priorities does not discard started work.
Existing reflections remain accessible in a collapsed history.

Twenty-five authored modules cover four English topics (including Brown v. Board
of Education), seven English recovery/diagnostic units, three Mathematics topics,
three German writing/interpretation tasks with original practice texts, two
Physics topics, all four IELTS skills, and two SAT skills. Each has
actual questions, solutions, explanations and a review. Short sessions reduce
quantity; they do not falsely claim a full exam. IELTS Listening uses a device
English speech voice, is labelled synthetic practice, and explains when audio is
unavailable. Full digital SAT simulations continue in official Bluebook material.

Known examination topics guide selection. Missing topics require a simple choice;
unsupported topics explicitly say the interactive lesson is incomplete. The app
does not silently substitute unrelated exercises, invent textbook pages or claim
coverage of the complete Hessen curriculum. Extra resources remain optional.

Self-checks are **not automatic correction, school marks or IELTS bands**.
Mistakes schedule earlier reviews of the same module and prioritize uncertain
questions. Repeated difficulty can prompt targeted teacher feedback. No paid AI
API, sign-in or admissions prediction is required.

## University preparation

USA and Germany retain distinct long-term roadmaps and year → semester →
month → week → daily links. Estimated planning phases and actual user-entered
deadlines are distinguished. Requirements and institutional dates need
checking against the relevant official programme source.

The application profile separates plans, self-reported experience and
records **you have supported with evidence**. Store real responsibilities,
dates, hours, achievements, impact, repository/project links and evidence
notes. This is documentation quality, not external verification, an
admissions probability or an unsupported profile-strength percentage.
Recommendations favour documenting existing contributions and protecting
academic priorities over continually adding extracurricular commitments.

## Coordinated IELTS and SAT preparation

Both test coaches support editable goals, planned versus personally booked dates,
mock/official/self-assessed results, skill-specific errors, guided practice and
conditional preparation windows. Date-derived milestones are planning proposals,
not bookable provider dates. All school, test and profile work draws from the same
daily allowance; at most one standardized-test action is generated each day.
School examinations reduce test practice to short maintenance sessions. A full
SAT Bluebook simulation requires an uninterrupted 144-minute block including its
break; it is never squeezed into a shortened full-test claim.

Official registration and practice resources are linked. Live retrieval of the
provider pages was blocked by this environment's network policy, so the app does
not quote unverified current fees, available test dates, places or document rules.
UCLA and UC Berkeley SAT relevance is distinguished from other university targets;
check the official policy for the actual application year.

## Run and verify

Use Node.js 24 from the repository root:

```sh
npm ci --no-audit --no-fund
npm test
npm run build
npm run dev -- --port 5173 --strictPort
```

To test the production app, run this in one terminal:

```sh
npm run preview -- --port 4176 --strictPort
```

Then run the current browser suite in another terminal:

```sh
python3 tests/coach_upgrade_browser.py --url http://127.0.0.1:4176
python3 tests/ux_repair_browser.py --url http://127.0.0.1:4176
python3 tests/personal_tutor_browser.py --url http://127.0.0.1:4176
python3 tests/hessen_browser.py --url http://127.0.0.1:4176
python3 tests/responsive_browser.py --url http://127.0.0.1:4176
```

The browser suite needs Python Playwright and `/usr/bin/chromium`. It covers
onboarding, grades and scenarios, planning, A/B lessons, exams, IELTS,
evidence, guided learning, tasks, reviews, backup/recovery, phone layouts,
large text, themes, keyboard-height changes and the production offline shell.
It writes results and screenshots to ignored `test-results/coach-upgrade/`.
Use `--case NAME` for a targeted case; the script includes its prerequisites.
The original `tests/browser_smoke.py --url … --production` entry point forwards
to this maintained German-interface suite. There are no separate lint or
type-check scripts in this JavaScript project.
See [the implementation model](docs/coaching-engine.md) and
[the device QA checklist](docs/academic-coach-qa.md).

## Data, offline use and deployment

User data stays in local browser storage without an account or paid API.
Existing records migrate safely; malformed data is preserved for recovery,
and invalid imports do not replace the current plan. Export a JSON backup
before clearing browser data, changing devices or changing the app's origin.
An update on the same origin retains browser data; asset caching is separate
from personal records.

The production PWA includes self-hosted fonts, dark/light/device themes,
safe-area spacing and an offline shell. Visit online once before relying on
offline use. Stable vendor assets are split for caching. Service-worker and
layout checks in Chromium do not replace a real iPhone Safari/Home Screen
test.

The existing GitHub Pages Actions workflow is unchanged. After reviewing the
upgrade, committing and pushing app changes to `main` triggers it. GitHub
Pages must use **Source: GitHub Actions**. The workflow installs dependencies,
runs unit tests, builds with the configured Pages base path and publishes
`dist/`. This upgrade has not been published merely by building or previewing
it. For a manual project-path build, use:

```sh
NORTHSTAR_BASE_PATH=/chat/ npm run build
```

An official Abitur eligibility/final-grade calculator, admissions prediction,
automatic essay correction, account sync, calendar import/export and
cross-app Screen Time restrictions are not implemented. The web app cannot
monitor or block TikTok, Instagram or Snapchat. `native/` retains the earlier
independent SwiftUI experiment; this coaching upgrade has not been ported to
it. Physical-iPhone Safari and Home Screen testing still need a real device.

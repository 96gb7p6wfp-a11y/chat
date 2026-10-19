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

- **Heute:** a personal daily mission, estimated course average and target,
  biggest improvement opportunity, usually 3–5 concrete actions, and the next
  relevant dates. Task cards show an objective, duration and expected result;
  detailed reasons, learning steps and materials open on demand. Short days
  have fewer tasks and zero-minute days can remain free.
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
  development actions. IELTS has its own secondary section. Study windows,
  commitments, theme and portable JSON backups are editable here.

Four optional setup steps create a first plan without requiring every field.
Blank grades and missing examination dates stay blank. The initial study
allowances and windows are editable planning preferences, not a claim about
known school hours or actual free time.

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

Subject details answer **“Was brauche ich noch?”** using the number, kind and
weight of future assessments you select. Explore the next result, multiple
remaining results or an additional oral what-if result. Assumptions and the
calculation are visible. Requirements above 15 points are explained as
unachievable in that scenario; hypothetical results never become real grades.

An explainable priority engine combines actual target gaps, approaching
assessments and deadlines, LK study importance, recent results, practice
history, difficulty, personal preferences and available time. Manual subject
priorities can override the normal emphasis. A grade or timetable change
updates the plan without deleting saved work or rewriting previous days.

## Learning and IELTS

Opening a learning task shows what to learn, why, the first step, timed
phases, expected result, materials and answer-checking guidance. Selected
original practice covers exponential functions, RC discharge and language
writing; other topics use current course material and relevant educational
sources. Missing exam topics are explicitly provisional. The app never
invents textbook page numbers or claims its practice matches an unknown
school paper.

Save an answer, a mistake and a confidence reflection to schedule a review.
A short session is described as partial practice, not a completed full exam.
Solutions and writing rubrics support self-checking; the app does not assign
an automatic school grade or IELTS band. Repeated difficulty can prompt a
specific teacher-feedback recommendation rather than an automatic tutoring
purchase suggestion.

**IELTS Academic** supports an optional examination date, overall and
four-skill targets, estimated starting levels, weekly preparation allowance,
recurring mistakes and dated results. Official scores, mock tests and
self-assessments are distinct. A complete four-skill result uses IELTS overall
half-band rounding; completing preparation tasks does not create a band
score or prove proficiency. Tasks address skill gaps and time remaining
within the same school workload budget. SAT and Cambridge remain editable
test plans and preparation decisions, not equally comprehensive test courses.

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

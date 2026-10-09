# Northstar

An iPhone-first academic and university preparation coach. Open **Today** to
see a small set of concrete actions, why they matter, and how they fit your
available time. The starting direction is Q1 at a Gymnasium in Hessen,
Mathematics and Physics Leistungskurse, Abitur in 2028, and parallel USA and
Germany university pathways.

The current product is the React web app. This development pass focuses on
the complete local planning workflow; publishing and native distribution
are outside its scope.

## Use the app

The four main screens are:

- **Today:** usually 3–5 priorities with an exact action, estimated minutes,
  a short reason and completion controls. Tap a task for its linked goal,
  study blocks, saved work and optional focus session. Skip for today keeps
  your notes and lets the planner reconsider what fits.
  Very short days have fewer actions; zero-minute days can be rest days.
- **Plan:** the week ahead, year/semester/month/week priorities, subject-specific
  exam revision, a shared events and deadlines timeline, USA/Germany roadmaps,
  and editable study allowances and fixed activities.
- **Progress:** weekly completion, estimated task time, separately measured
  focus time and session history, consistency, written/oral grades, exam
  revision progress, linked roadmap action progress, confirmed milestones,
  and saved weekly reviews.
- **Profile:** editable goals, subjects and grades, activities, universities,
  a Timetable tab for study allowances and commitments, and settings with
  theme and JSON backups.

A four-step setup asks for direction, starting grades and language levels,
weekly availability and activities, then upcoming exams. Steps can be skipped
and edited later. A fresh start uses the supplied Q1 profile: Mathematics
written 6/oral 11, English oral 7, History oral 8, Computer Science oral 10,
and Politics/Economics oral 9. Other grades and language levels remain unknown.
Volleyball, restaurant management, marketing and internships have editable
activity records without invented achievements, dates or hours. No exams or
completed history are added. Tuesday/Friday volleyball times of 18:30–20:30
and the weekly study allowances are editable starting estimates.

The core is a personal university roadmap with concrete next actions. The app
connects the long-term direction to year, semester, month and week priorities,
then selects today's actions using approaching exams, written/oral grade gaps,
weekly review focus, language goals, saved deadlines and roadmap milestones.
USA and Germany have distinct requirements and timelines; the default US
application season begins before summer 2028 Abitur. Preparing a milestone
and confirming that it was actually achieved are tracked separately. Known
grades, weak topics, language baselines and activity details satisfy their
matching setup actions so the planner does not repeatedly ask for data
already entered.

The planner fits actions into free study windows around fixed activities.
It gives short days a smaller plan and longer days deeper work while keeping
at most five actions. Missed generated tasks are reconsidered rather than
copied into a growing backlog. Skipped actions remain available under
**Skipped today**, including saved drafts. A shorter day resizes started work;
drafts that cannot fit stay under **Saved for later** and return when there is
room. Started work is retained when
priorities change.
Completed work stays recorded and completing an action does not refill
today with more work. Previous days preserve their saved tasks; changes
to grades or availability do not rewrite your history. A weekly review can
reserve a 20% time buffer or use spare capacity for deeper practice next week.
See [the coaching model](docs/coaching-engine.md) for
the rules and data architecture.

Plan → **Events** combines school exams, saved test dates, university deadlines,
internships, projects and other milestones. Exams, test plans and universities
keep their original records; custom events can be added and edited in the
timeline. Each dated preparation plan uses the event type and time remaining.
Tests under consideration create a requirements decision rather than assuming
you need to prepare or book a test. Occasional activity reminders help you
record new responsibilities and real impact.

Task details offer optional writing and vocabulary practice, automatically
saved drafts and self-review checks. These aids support the daily plan;
they do not assess your work. Use teacher feedback and current class or
official test materials for exam-specific preparation.

Open a task and start a **5–180 minute focus session** when you want to measure
time. Pause before a break, resume later, and finish to save the elapsed work.
The active session survives a reload and uses timestamps rather than counting
browser ticks. It keeps running while the app is closed or the phone sleeps,
up to the chosen session limit; the app saves a finished session when it is
active again. Saving time does not mark a task complete. Progress keeps timed
study separate from task estimates and lets you remove an accidental log
without undoing the task.

## Develop and verify

Use Node.js 24. From this repository root:

```sh
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
npm test
npm run build
npm run dev -- --port 5173 --strictPort
```

For the production browser checks, start the built app in one terminal:

```sh
npm run preview -- --port 4175 --strictPort
```

Then run the suite in another terminal:

```sh
python3 tests/browser_smoke.py --url http://127.0.0.1:4175 --production
```

The suite requires Python Playwright and Chromium. It exercises real setup,
plan generation, task completion and notes, exam creation, grades,
weekly reviews, linked roadmaps, unified events and profile editing, backups,
persistence, mobile layout, dark mode, focus sessions and self-review, and the
production offline shell. Generated results and screenshots are written to
the ignored `test-results/` directory. Chromium
with a mobile viewport does not replace testing on an actual iPhone in
Mobile Safari or Home Screen mode.

## Data and limits

The app works without an account or paid backend. Data is saved in this
browser's local storage; export a JSON backup before moving devices or
clearing browser data. The storage adapter migrates the previous Northstar
format, validates backups before replacing data, and preserves an untouched
recovery copy when saved data cannot be read. If browser storage is
unavailable, the app shows a warning rather than claiming changes are saved.
The recovery notice lets you download the original data. An unexpected screen
error offers a reload and a saved-data download without clearing your plan.

Recommendations are explainable rules, not an LLM or an admissions
prediction. Estimated study time sums the durations of completed tasks;
timed study sums saved focus intervals and excludes pauses. The timer records
elapsed time you choose to track, not attention or learning quality. Revision
progress still uses completed preparation estimates, not timer logs or
measured mastery. Subject averages guide planning and are not an official
Hessen course grade or final Abitur calculation.

Roadmap dates are planning estimates; overlapping school and application
phases are shown in date order. Saved deadlines are supplied by the user,
not verified automatically by Northstar. University requirements, accepted
English certificates, costs, application routes and deadlines need
programme-specific verification from official sources. UCLA and UC Berkeley
currently do not consider SAT/ACT for admission; other universities can have
different policies. Graduation in 2028 does not establish your application
or entry year.

Light, dark and device themes, safe-area spacing, touch navigation, local
fonts and a production offline app shell are included. Account sync,
external calendar integration, automatic admissions-data updates, essay
grading and cross-app Screen Time controls are not implemented in this web
coach. A browser cannot observe or block TikTok, Instagram or Snapchat.

## Retained native source

`native/` contains the earlier independent SwiftUI planner and Screen Time
extension project. Its unsigned simulator build and tests previously passed
in macOS CI. The new coaching engine, onboarding and four-tab web experience
have not been ported to that project, and physical-iPhone Screen Time
behaviour has not been verified. Native work is not part of this development
pass.

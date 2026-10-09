# Northstar coaching model

Northstar turns a student's academic and university preparation context into
a small daily plan. The implementation is local and deterministic: the same
state and date produce the same recommendations. Every generated task has
a reason, an estimated duration, a category, a linked long-term goal and a
concrete next action. The roadmap and daily planner are the core; practice
material is an optional aid for completing those actions.

## The main workflow

1. Complete or skip the four-step onboarding. Both routes use the supplied
   personal starting point: Q1, Hessen, Mathematics and Physics LKs, Abitur
   2028, and USA/Germany university research. Mathematics starts at written
   6/oral 11; English oral 7, History oral 8, Computer Science oral 10 and
   Politics/Economics oral 9. Unreported grades and language levels remain
   unknown. Four activity records have no invented dates, hours, achievements
   or impact. There are no sample exams or completed tasks. Tuesday/Friday
   volleyball hours of 18:30–20:30 and study allowances are editable estimates.
2. Use the generated roadmap to see year, semester, month and week priorities.
   Open Today for available time, one focus and a manageable set of actions
   with short reasons. Planned/remaining time and the bigger picture are
   expandable. Tap a task for its linked long-term goal, study blocks,
   instructions, saved work, optional practice and self-review checks.
   Optionally start a focus session to track elapsed study time.
3. Complete an action. The completion timestamp updates progress immediately
   and is persisted locally. A linked roadmap action also gains preparation
   credit. Today keeps a stable workload instead of adding a replacement every
   time an action is finished; the next day can select the next unfinished step.
4. Skip an action when it does not fit today. It leaves the active plan but
   stays under Skipped today with its notes and self-review. The planner
   recalculates priorities without building an overdue list.
5. Add an exam in Plan. The app creates revision milestones using its subject,
   format, topics, date and the time remaining, then brings appropriate
   revision actions into daily priorities.
6. Add other dates in Plan → Events. School exams, test plans and university
   deadlines appear there from their existing records. Custom internships,
   projects and milestones have their own preparation sequences.
7. Use Plan for the week and USA/Germany roadmap. Use Progress to review the
   week and choose a focus that affects the next week. Profile holds editable
   goals, subjects, activities, universities, a Timetable tab and settings.

Future days are previews. Completion controls are disabled until the day
arrives. Dates use local calendar days rather than UTC midnight; calendar
arithmetic avoids daylight-saving shifts changing revision milestones.
Past days show the tasks actually saved for that date. Later changes to
grades, exam dates or the timetable cannot rewrite missed work. A date
with no saved plan stays empty; the app does not invent a personal history.
Historical screens show recorded actions and completed estimated minutes,
not an availability budget reconstructed from the current timetable.

## How daily priorities are selected

`src/coach.js` owns the planning model. `ensureDailyPlan(state, date, referenceDate)` returns
a new state only when the plan needs to change. The UI supplies today's
local date as the reference, protecting earlier dates from regeneration.
`getDailyPlan` accepts the same reference and provides the
screen model, including tasks, availability, the day's goal, explanations,
and the long-term → year → semester → month → week → today chain.
`src/roadmap.js` provides dated pathway milestones and actionable steps;
`src/events.js` combines dated sources and supplies non-exam preparation
candidates. Neither module reads browser storage.

Candidates include:

- The next useful exam preparation stage, with higher urgency as the exam
  approaches and extra weight for a larger subject grade gap.
- Weak-topic practice for enabled subjects. Mathematics and Physics receive
  LK priority; a subject selected in the previous weekly review receives
  extra attention through a smaller focused session.
- English and German writing or vocabulary, with exercise size and material
  adapted to the recorded language level.
- Official-format practice for a test marked preparing or booked with a
  target date. Tests still under consideration produce policy research
  rather than an assumed preparation obligation.
- The next unfinished roadmap action in an active or approaching phase,
  including programme research, requirements, activities, documents and essays.
- Type-specific preparation for saved application deadlines, internships,
  projects and other dated milestones. The latest relevant phase is selected
  without creating a list of every missed earlier preparation step.
- A periodic activity contribution reminder when an activity has not been
  updated recently and completed activity work has not already covered that
  maintenance need.
- A short Sunday review.

Urgency and grade gaps determine the first priorities. When immediate
pressure permits, later actions keep breadth across school, languages and
university preparation. A normal day has at most five generated or committed
actions. Short days can have fewer. Task durations shrink when necessary,
and the instructions identify partial work rather than treating a five-minute
session as a full paper. Days with at least 150 available minutes can use
longer subject sessions without increasing the five-action limit. The planner
does not fill spare time by endlessly extending a short roadmap step.

Custom actions, completed work, drafts, self-review and an active focus task
are retained when plans change. Unfinished generated drafts shrink to the
remaining allowance. When they cannot fit, they stay under **Saved for later**
and return when the day has enough time, with their notes and stable IDs intact.
A lighter week still allows one five-minute action on a five-minute day. The UI
rejects a sixth committed action or a new custom action exceeding the time
left after committed work. If an existing plan becomes oversized after a
timetable change, the app explains that a saved custom task must be moved
or removed. It does not silently delete completed work.

Generated tasks use stable IDs derived from their date and recommendation.
A deterministic plan signature covers relevant academic, profile, schedule
and prior-completion inputs. Today's completions do not trigger additional
revision stages; future days can use them. Removing or skipping a generated
task records its dismissal for that date so the next recalculation does not
recreate it. Skipping preserves the task record and its saved work; completion
later clears the skip. Skipped tasks count as planned but unfinished work in
the weekly review.

Missed work remains in history. The next date receives a fresh plan based
on the current exam stages, event phases and roadmap priorities, without
copying every unfinished task. Previous-week consistency can increase attention to a subject that
received too little completed practice.

## Timetable and availability

Each weekday has a study allowance and a start/end study window. Recurring
fixed activities and dated appointments are placed first. Overlapping busy
intervals are merged, and only the free intervals inside the study window
are usable.

Available time is the smaller of the day's allowance and those free minutes.
A date override replaces the weekday allowance without bypassing actual
free time. An override of zero creates a rest day. Suggested task sessions
are allocated to the free windows and can be split around activities; task
details show the separate blocks. Profile → Timetable links to editable study
allowances, windows and recurring commitments.

These are suggested allocations, not live calendar reservations. The app
does not import a school timetable or external calendar automatically.
Optional focus sessions measure elapsed time separately; they do not change
the timetable budget or turn suggested blocks into booked events.

## Focus sessions and measured time

`src/study.js` owns an optional `study` record containing one active session
and saved sessions. A session snapshots its task ID, title, subject, category,
chosen duration and local time zone. It keeps closed work intervals and a
running timestamp. Elapsed time is calculated from timestamps, not interval
ticks, so reloads and browser throttling do not reset the timer.

Sessions last five to 180 minutes. Pausing closes the current work interval;
resuming starts another and never adds the break to the total. A running
session continues while the app is backgrounded, closed or the phone sleeps,
but its recorded time is capped at the chosen goal. Pause before a break.
When the UI next observes an expired session, it saves the capped time.
There is no background notification or proof that the student was working.

Finishing saves whole elapsed seconds without marking the task complete.
Completing or removing a task first saves its active session; saved time stays
recorded if the task is later removed. Only one session can run at a time.
Switching tasks requires saving the current session first. Discarding an
active session loses only that unsaved time. Removing a saved log updates
measured totals without changing task completion or exam preparation credit.

`getStudyStats` groups saved work intervals by the session's recorded local
calendar days, including time crossing midnight and daylight-saving changes.
Weekly totals include only the seconds that occurred within that week.
They exclude paused intervals and unfinished sessions. Timed study is elapsed
time deliberately recorded by the user, not measured attention or mastery.

## Practice library and self-review

`src/practice-bank.js` contains eight original English passages and six German
contexts, with beginner variants, plus 48 academic and 24 beginner vocabulary
entries for each language. `src/exercises.js` selects material deterministically
from task date, subject and practice type. English selection also considers
topics such as the American Dream, civil rights, history, technology and
leadership that were captured in the task, rather than a subsequently edited
exam. Vocabulary rotates through the relevant bank in manageable sets.

Summary, analysis and comment practice includes specific prompts, drafting
steps and self-review criteria. Some exercises offer a collapsed example
response to compare after the student writes their own answer. Vocabulary
meanings can be hidden for retrieval practice. Criterion IDs are saved in
the task's optional `selfReview` array alongside its notes and survive reloads,
recalculation and backups. They record checks the student reports carrying
out, not criteria assessed by software.

The library is finite original practice material, not an official exam bank,
an adaptive vocabulary mastery system or an automated assessment. Stage-specific
revision still directs the student to appropriate class or official materials.
Teacher feedback is needed to judge the student's own writing or subject work.

## Exams and revision

`getExamPlan` uses different stages for written languages, mathematics and
science, other written subjects, oral exams and practical assessments.
For example, language preparation includes summary and analysis practice;
science preparation includes worked problems and mixed problem selection;
oral preparation includes explanations and follow-up questions.

Stages normally progress from understanding through practice, timed work,
mistake review and light revision. Short tests reduce the sequence. An exam
added at short notice compresses dates and removes less useful stages,
without assigning new work before it was added. The final day emphasises
light revision and rest instead of a rushed full paper.

Preparation credit comes from completed tasks linked to that exam and stage.
Non-timed stages accumulate completed estimated minutes. Partial sessions
do not complete a milestone until its required duration is covered. A full
timed rehearsal needs one uninterrupted session of the required duration;
several short or interrupted sections remain useful practice but do not
claim completion of that rehearsal.

In this completion model, an uninterrupted session means one suggested study
block on the completed task. Focus logs are reported separately and do not
verify rehearsal conditions or replace the task's preparation credit.

Exam progress is the proportion of revision milestones completed. It is not
a predicted exam mark, mastery score or teacher assessment. Built-in
practice passages are original material. Official-format preparation directs
the student to class materials or the current official test material;
Northstar does not generate an official IELTS, Cambridge or SAT score.

## One events and deadlines system

`getUpcomingEvents` derives a date-sorted timeline from school exams, dated
test plans, saved university deadlines and optional custom events. Namespaced
IDs such as `exam:<id>`, `test:<id>`, `university:<id>` and `custom:<id>` keep
different sources distinct. Derived events are edited in their original
screen so there is one source of truth. Past and completed entries can be
included when reviewing history.

Custom events store a title, type, date, optional end date, date meaning
(deadline, start or milestone), USA/Germany/Both pathway, priority, status,
preparation-block duration, notes and an optional official link. An internship
start is treated differently from an application deadline. Fixed activities
still belong to Schedule: an event's preparation minutes are not its duration
or a calendar reservation.

`getEventPlan` exposes dated preparation stages. Applications progress through
requirements, documents, review and submission checks; internships through
arrangements, preparation and start-day planning; projects through scope,
building and deliverable review; booked or preparing tests through baseline,
practice and test-day checks. Stages respect a custom event's creation date
when compressing a short-notice plan. School exams use `getExamPlan` instead.

Completed estimated minutes linked to the event and stage provide preparation
credit. A timed test rehearsal requires one completed task with a full,
uninterrupted suggested study block of the required duration. Shorter or split
work remains visible as practice but does not complete that rehearsal. As
with school exams, suggested blocks and task completion are user-reported;
the optional focus timer does not verify test conditions or provide stage
credit. Completing a preparation task does not automatically mark the event
achieved, the test taken or an application submitted. Tests under consideration
create policy-research candidates and a dated decision reminder, not test
practice. Non-exam candidates are selected for active pathways; the timeline
can still show a saved event from an inactive pathway with an explanation.

## Goals, roadmap and application profile

`getGoals` connects the long-term direction to yearly and semester priorities,
then monthly and weekly academic, language, university, activity and review
goals. Each period includes dates and linked roadmap milestone IDs. The daily
goal chain uses the parent milestone of the day's highest-priority action
when selecting the relevant monthly and weekly goal.

Year and semester progress counts the roadmap's completed action steps.
Monthly and weekly academic and language goals count completed sessions in
their categories, with targets adjusted to usable days. University and activity
goals count work linked to their roadmap milestones or related event goal IDs,
so an unrelated task in a broad category does not advance those goals. Period
goals retain milestone links and earned credit after its final action is
completed or the whole milestone is confirmed, respecting the selected
pathways. These metrics measure recorded effort and preparation, not verified
skill growth or a strict prerequisite tree in which every school exercise
completes a milestone. Yearly labels change with the active school,
application, admission or university-transition stage.

USA and Germany have distinct milestones from Today through Q1–Q4, university
preparation, Abitur preparation, Abitur, applications, admission and university.
Phases are ordered by start date and can overlap: with the default 2028 entry
direction, US applications start in 2027, before summer 2028 Abitur. They
include grades, languages, testing decisions, sustained activities, internships,
programme research, essays, recommendation policies, documents and applications
where relevant.

Each milestone contains a small sequence of concrete actions, a preparation
target and a next unfinished step. Generated tasks retain the milestone and
step IDs. Completed estimated task minutes accumulate toward the step's
planned duration; partial work advances its action-progress bar. Exact saved
setup data can also satisfy matching entry actions: recorded written/oral
grades, targets and weak topics, a language level with a writing weakness,
or the requested activity responsibilities, achievements and time commitment.
Those actions are marked `completedFromData`; the app does not invent a
completed task or study time for them. Completing all preparation actions
does not assert that the real milestone happened.
The milestone checkbox is a separate user confirmation for an actual result,
such as receiving a certificate, submitting an application or obtaining an
offer. Confirming it removes its remaining actions from recommendations while
preserving recorded action history.

Dates are estimates derived from graduation and optional application and
university entry years. An explicit application year moves that cycle;
otherwise a chosen entry year suggests the preceding year for US applications
and the entry year for Germany. Without either, graduation supplies a
provisional planning cycle. Displayed phase ranges are clamped so incomplete
or unusual year edits cannot produce an end before the start. Saved university deadlines influence the relevant
submission milestone and its daily urgency as well as the shared event plan.
The engine's saved-deadline flag distinguishes a supplied date from an
estimated preparation target; it does not mean Northstar has verified the
date against an official source. Current UC guidance is that
SAT/ACT are not considered for admission, English proficiency is separate,
and recommendation requirements differ from other US universities. Germany
requires checking programme-specific admission, NC or aptitude rules and
whether Hochschulstart applies. Official links support research; the app
does not automatically verify an institution's future policy or deadline.

University records store programme, country, research status, optional
user-supplied deadline, requirements, notes and an official link. Activity records
store start and optional end dates, hours per week, weeks per year,
responsibilities, description, achievements, measurable impact, notes and
the last update date. That date and recent completed activity tasks help
space achievement reminders. The app supports an honest evidence record, not
fabricated achievements or an automatic Common App submission.

## Progress and weekly review

Progress reports weekly task completion, estimated minutes completed and
days with either a completed action or positive saved focus time. Consistency
and streaks count each such local day once; an active unsaved timer does not
count yet. When saved focus sessions exist, a separate timed-study section
shows measured seconds, session count and expandable session history for the
selected week. Weekly reviews show both time measures without combining them.
Progress
also shows subject grade development, exam preparation, linked roadmap action
progress and separately confirmed milestones. Sunday highlights a review,
and earlier weeks can be reviewed later.

The review includes strengths, attention areas, university preparation steps,
a saved reflection and a next-week focus subject. Next-week recommendations
use the saved focus or previous practice consistency. Choosing a lighter
load reduces the planning budget; choosing more increases planned work
within the actual allowance and free study windows. It does not create
additional time or bypass fixed activities. Unfinished tasks are reconsidered
rather than bulk carried over.

Grades use Hessen upper-secondary points from 0 to 15; zero is valid.
Written and oral records are averaged separately. If the last record of a
type is deleted, the original starting grade is restored instead of losing
the baseline. The combined current value is a simple planning estimate,
not the official written/oral weighting or final Abitur calculation.

## State, persistence and future sync

The version-2 state separates profile, subjects, exams, optional custom events,
tasks, grades, activities, universities, schedule, weekly reviews, reflections, roadmap
completion and optional study sessions. The coaching and study functions do
not read browser storage or call a server. Mutations such as `saveExam`,
`addGrade`, `toggleTask` and `pauseStudy` return state, and React renders that
state through the four screen components.

`src/storage.js` is the persistence boundary. It uses
`northstar.coach.v2`, migrates the earlier `northstar.data.v1` format, and
provides validated portable JSON import/export. Restore requires explicit
confirmation before replacing the current plan. Invalid versions, duplicate
IDs, malformed dates, unsupported records and data that normalization would
silently lose are rejected. Backups are limited to 20 MB.

The optional `events` and `study` records, task goal/roadmap/event links,
`selfReview` arrays and `skipped` flag, and extended activity fields preserve
compatibility with earlier version-2 backups. Events validate dates, type, pathway, date meaning,
duration, status and safe HTTP(S) links; an end date cannot precede the start.
Task links preserve stage-specific preparation credit across reloads and
backups. Study validation checks timestamp time zones,
interval order, duration caps, exact saved seconds and overlapping session
spans before restore. Task IDs in session snapshots can outlive the original
task so removing a task does not erase study history.

When saved data cannot be read, the adapter first preserves the raw original
in a timestamped recovery key. If it cannot save that recovery copy,
automatic saving is paused to protect the original. Unavailable or full
storage is surfaced with a normal user-facing message. The recovery notice
offers a download of the untouched original. A React error boundary offers
a reload and saved-data download if a screen fails, without deleting data.
A backup remains the practical transfer mechanism. Data is local to the
browser and device, with no account, analytics or paid service dependency.

A future backend can be added behind this boundary, but synchronisation is
not implemented. It will need account authentication, explicit privacy and
retention choices, record revisions or conflict resolution, and a tested
migration strategy. Stable IDs and pure state functions make that possible;
they do not by themselves solve conflicts between devices.

## Interface and current boundaries

The web shell has four bottom tabs, touch-sized controls, safe-area insets,
light/dark/device themes, scalable typography, reduced-motion support,
self-hosted fonts and a production service worker for the offline shell.
Modal height follows the visible viewport when the keyboard opens. Empty
states offer a single useful next action. Local data is separate from the
public asset cache.

The core flow is tested through the real Chromium UI as well as unit tests.
Physical-iPhone Mobile Safari, Home Screen keyboard behaviour and system
accessibility checks still require device validation. No essay grading,
live admissions feed, external calendar integration, account sync or cross-app
Screen Time restriction is provided by this web coach. The retained native
source is an earlier independent app and has not received the new coaching
engine.

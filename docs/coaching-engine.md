# Northstar academic coaching model

Northstar keeps its existing local React architecture and upgrades the
academic decision-making around it. The core is an explainable chain from
school and university goals to a realistic daily action. Preparation effort,
recorded performance, self-assessment and actual milestones remain different
kinds of evidence.

## Starting state and saved data

A fresh profile supplies editable context: Gymnasium in Hessen, Q1, Abitur
2028, Mathematics and Physics LK, USA/Germany pathways, university and
study-field interests, and known activity areas. It does not restore old
approximate grades as if they were current. Grades, target overall average,
test scores, exam dates, lessons and exact recurring activity hours start
unknown. Tuesday/Friday evening volleyball can be documented without
inventing a clock-time block. Weekly study budgets are editable preferences.
No completed study history or achievements are fabricated.

Existing profiles are not replaced with these defaults. Their actual grades,
original baselines, custom subjects, timetable, projects, tasks, notes,
reviews and roadmap history remain intact. Older fields without semester,
weight, evidence or IELTS information continue to load without pretending
that the missing information is known.

## Domain boundaries

Business logic does not read local storage or call a paid AI service:

| Module | Responsibility |
| --- | --- |
| `src/coach.js` | State normalization, mutations, daily plans, goals and reviews |
| `src/grades.js` | Subject/course estimates, explicit weighting, semester scope and future-grade scenarios |
| `src/recommendations.js` | Explainable subject priorities and next-action recommendations |
| `src/timetable.js` | Lessons, A/B weeks, conflicts and lesson busy intervals |
| `src/ielts.js` | IELTS setup, evidence provenance, scoring summary and preparation candidates |
| `src/sat.js` | SAT sections, evidence, practice and full-simulation candidates |
| `src/test-preparation.js` | Shared school-aware test budgets and conditional preparation horizons |
| `src/school-import.js` | Reviewed, idempotent school-document merges and unconfirmed German-grade draft |
| `src/guided-learning.js` | Learning phases, practice selection, reflections and review scheduling |
| `src/roadmap.js` | USA/Germany phases, milestone actions and goal links |
| `src/events.js` | Unified dated sources and type-specific preparation |
| `src/profile-evidence.js` | Activity evidence status and profile-development recommendations |
| `src/study.js` | Focus intervals and measured study-time summaries |
| `src/storage.js` | Persistence, validation, migration and backup/recovery |

React components render and edit this state. Stable record IDs preserve task
notes, preparation links and historical evidence across changes.

## Transparent grades and scenarios

Every assessment stores points from 0 to 15, subject, performance category,
date, optional semester, optional individual weight and a note. Zero is a
valid result. The categories are written, oral, participation, presentation
and other. Changing a record's category recalculates the relevant values;
editing and deleting individual records are supported.

Each subject chooses one calculation:

1. **Simple:** arithmetic mean of the selected actual assessment records.
2. **Weighted:** `sum(points × weight) / sum(weights)`. Every included record
   needs a positive explicit weight; there is no fallback weight hidden in
   the result.
3. **Category:** average records within each performance category equally,
   then apply the configured category weights. A missing included category
   or an unconfigured recorded category makes the overall result unknown.
   The engine does not silently renormalize the remaining categories.

`calculateSubject(data, subjectId, semester?)` returns the average, target
gap, method, completeness, selected records, trend, semester summaries and
source. If the subject has assigned semester records, the default scope is
the profile's current Q1–Q4 semester. A current semester with no results stays
unknown even when earlier semester records exist. An explicit semester
filters strictly; `'all'` deliberately aggregates all recorded semesters.
Records with no assigned semester remain labelled **Ohne Halbjahr ·
Orientierung**. They are preserved, not automatically reassigned.

Original undated written/oral starting values remain a separate rough
orientation when no actual assessments exist and the simple method applies.
They are not extra assessments and are never mixed into the dated grade
history. Weighting them as fictional Klausuren would be misleading.

`getAcademicOverview(data)` averages known course estimates with editable
course weights. Course weights default to equal counting. LK status affects
study priority, not an assumed statistical or legal double weighting.
Missing course values remain excluded and the interface shows how many
courses are known. The overall target remains unknown until entered.
Neither the course estimate nor its target gap is an official Abitur result.

A trend needs at least four usable assessment results. It compares the older
and newer halves within the selected scope using the chosen calculation;
missing category/individual weights can leave the comparison unknown. This
is a recorded-results comparison, not a prediction of future performance.

`requiredFutureGrades({ records, target, future, grading })` handles explicit
what-if assumptions. The UI exposes the number and kind of remaining
assessments, their required individual weights where relevant, and an
optional fixed oral result. Unknown future results share a common mean
value; the function solves for that value using the selected grade model.
It reports the required mean, minimum whole-point result, attainable range,
assumptions and explanation. Requirements above 15 are impossible for that
scenario. Missing weights or categories produce an incomplete explanation,
not an invented precise forecast. Hypothetical results never enter the real
assessment history or create exams.

## Priority selection and recommendations

`getSubjectPriorities` combines target gaps, upcoming exams and deadlines,
LK study importance, recent results, time since completed practice,
difficulty, personal preferences, manual overrides and usable study time.
An approaching Mathematics LK exam can temporarily outrank an ongoing
German weakness. German can remain a personal focus even when its current
points are unknown; the engine does not invent a low grade to justify it.

Internal scores order work. The interface shows a short reason and simple
priority wording rather than a numeric score. Recommendations include why,
a concrete action, how to perform it, time and expected benefit. The
highest-value recommendation appears on Heute; other recommendations stay
in the relevant subject/profile context. Repeated below-target results and
repeated practice can trigger a specific teacher-feedback suggestion.
One disappointing grade alone is not evidence that paid tutoring is needed.

Daily candidates include the next useful exam stage, targeted school and
language practice, IELTS work, due learning reviews, unfinished roadmap
actions, relevant dated events, occasional evidence updates and a Sunday
review. The signature for a plan covers relevant academic, timetable,
profile, performance and preparation inputs so changing them recalculates
current/future priorities.

## Availability, lessons and events

A weekday has a study allowance and start/end study window. A dated override
can change the allowance, including zero for a rest day. Free time is found
inside that window after merging school lessons, fixed commitments and
relevant timed appointments. Available study time is the smaller of the
allowance and those free intervals: the app does not treat every free hour
as a study obligation.

Lessons store weekday, subject or title, start/end, optional room/teacher
and an all-weeks/A/B cycle. The user supplies a known A-week anchor; week
parity does not guess it. With no anchor, alternating classes are labelled
uncertain and both possible intervals are cautiously reserved. Overlapping
lessons in the same applicable cycle are detected; adjacent lessons and
opposite A/B alternatives are permitted. The daily and weekly views share
the same lesson data used by the planner.

`src/events.js` presents school exams, test plans, university deadlines,
IELTS and custom events together. Original records remain canonical.
Events support relevant subjects, topics, importance, optional exact time,
notes and required preparation. Custom work can represent homework,
presentations, projects, internships, submissions or appointments.

School exam preparation uses its known date, subject, format, topics and
remaining time. Revision stages cover understanding, active practice,
format-specific work, timed practice, mistakes and lighter final review
where appropriate. Missing topics are explicitly provisional. Short sessions
are partial practice; a full timed paper is not falsely credited from a
small fragmented block. Other event types receive their own preparation
sequence rather than an identical exam template.

## Task lifecycle and daily workload

`ensureDailyPlan(state, date, referenceDate)` recalculates only when needed;
`getDailyPlan` supplies the screen model. Generated and committed work
normally stays within five actions and the available minutes. Short days
can contain fewer than three actions. Longer days deepen useful work
without endlessly extending a small administrative step.

Completion is timestamped and persists immediately. It contributes to
recorded effort, linked preparation and reviews, but does not prove mastery.
Finishing an action does not refill today with an unlimited stream of tasks.

Tasks support opening instructions, focus start/pause, completion, editing,
replacement and deliberate rescheduling. Skipping preserves the record,
notes and self-review while freeing today's active plan for recalculation.
Moving an action checks the destination capacity. Started work that no
longer fits remains saved for later; user writing is not discarded by a
change of priorities. Replacements and moved tasks do not create an
unbounded overdue list.

Missed actions stay in history. The next date chooses current useful work
rather than copying every missed task. Prior dates show saved records and
are protected from regeneration; the app does not invent a historical plan
for a date with none. Date arithmetic uses calendar-day components to avoid
daylight-saving changes shifting revision stages.

## Guided learning and reflection

`getGuidedSession` returns an objective, why, first step, expected result,
method, timed phases, practice, resources and self-check guidance. Phase
durations fit the actual task budget. Subject-specific methods include
retrieval, worked practice, writing rubrics, error analysis, timed work and
review; non-academic roadmap tasks instead guide the concrete next action.

Selected original exercises cover exponential functions and RC discharge.
German literary analysis includes a short original passage, paragraph
structure, criteria and a non-binding comparison answer. Existing English
and German writing/vocabulary material remains available. Other topics use
relevant current course material and links such as Serlo, LEIFIphysik and
official language-test preparation. No specific textbook page or unknown
Klausur requirement is invented. Material that is provisional is labelled.

A learner can save an answer, an error/insight and confidence of uncertain,
effortful or independent. The latest topic evidence drives a review date;
due reviews become workload candidates rather than an additional unlimited
list. Reflections can be edited/deleted. Persistent difficulty can recommend
asking a teacher about a specific concept. These are self-checks, not
reliable automatic correction, teacher assessment or an official IELTS band.

## IELTS evidence and workload

The optional IELTS record includes Academic exam date, overall/skill targets,
estimates, preparation allowance, recurring mistakes and dated results.
An unknown date stays unknown. Listening, Reading, Writing and Speaking
have separate recent values, sources, targets and trends.

Results distinguish official-test entries, mock results and informal
self-assessment. “Official” describes how the user entered the result; the
app does not independently authenticate a certificate. A complete four-skill
result uses the IELTS overall half-band rounding rule, including quarter-band
rounding upward. There is no unsupported raw-score conversion for every test
version and no guaranteed band outcome from task counts.

Weak skill gaps and the time remaining select practice, error analysis,
timed sections or later simulations. Candidates share the school's actual
availability and priority budget. A major school exam can reduce or defer
IELTS work. Completed practice measures preparation, not proficiency;
readiness summaries explain their evidence and missing information.

## University roadmap and application evidence

`getGoals` connects the roadmap to year, semester, month, week and daily
priorities. USA and Germany have distinct overlapping phases from Q1–Q4
through preparation, Abitur, applications, admission and university. Dates
are planning estimates derived from graduation and optional application /
entry years. Actual saved deadlines influence urgency and submission steps
without being represented as automatically verified institutional dates.

Task minutes and exact relevant profile data can advance preparation
steps. Actual milestone confirmation remains separate: completing practice
does not claim a certificate, submitted application or admission offer.
The roadmap preserves earned links and history when a phase or action is
completed or the user changes the active pathway.

Universities hold country, programme, research status, requirements,
source/verification notes, documents, links and supplied deadlines. The app
helps research policies but does not automatically establish future NC
cutoffs, certificate acceptance, admissions odds or recommendation rules.

Activities and projects store real dates/time commitments, role,
responsibilities, achievements, measurable impact, notes, project/repository
links and evidence. Status distinguishes plans, self-report and **Von dir
belegt**; the latter needs an attached evidence note/link and remains the
user's assertion, not an external verification service. Profile development
shows documentation gaps without an arbitrary overall admissions score.
Suggested steps document restaurant contributions, technical work,
volleyball progression or actual leadership, and can put academic recovery
before starting another activity.

## Measured time and weekly review

Focus sessions retain their existing timestamp-based intervals. A running
session survives reloads and backgrounding up to its chosen limit; pausing
excludes the break. Saving measured time does not mark a task complete.
Removing a saved log changes measured totals without undoing task history.
Time is grouped by the recorded local day, including midnight and daylight
saving transitions. It is elapsed time deliberately tracked, not observed
attention.

Fortschritt keeps estimated completed-task minutes separate from saved
focus intervals. Consistency counts days with completed work or positive
saved focus time. Weekly reviews retain strengths, attention areas, academic
results, university preparation, reflection and the next focus. A lighter
week reserves a buffer; more ambitious work remains inside real available
time. Unfinished tasks are reconsidered, not bulk carried over.

## Persistence, offline use and limitations

The `northstar.coach.v2` storage boundary preserves prior version-2 fields
and migrates the earlier version-1 format. Added grades/weighting, IELTS,
lessons, learning and evidence are optional for older backups. Import
validates supported structure, dates, record IDs and values before replacing
state. Invalid backups do not erase the current plan. Malformed saved data
is archived untouched for recovery; if recovery storage is unavailable,
automatic writes pause to protect the original.

JSON export/restore is the current device-transfer mechanism. Changing
browser origin or clearing site storage requires a backup. A future sync
backend needs explicit identity, revisions/conflict handling and tested
migrations; stable IDs alone do not supply account synchronisation.

The production shell retains self-hosted fonts, theme modes, safe areas,
visible-viewport-aware sheets and offline assets. Vendor code is split into
a cacheable chunk; the service worker discovers production entry assets and
fonts. Personal records stay in local storage, separate from asset caches.
Chromium tests cannot establish physical-iPhone Safari behaviour.

Not implemented: an official Hessen Abitur eligibility/final-grade
calculator, admissions probabilities, automatic essay/exam grading, account
sync, calendar import/export, native Screen Time blocking or automatic live
institutional verification. `native/` remains a separate earlier experiment.

## Reviewed Q1 import and coordinated test scheduling

The supplied document pack is a review source, not an automatic replacement for
saved state. Nine exam dates come from the user's authoritative list. Nineteen
lessons preserve merged periods and original course codes, including sport PF.
Unknown exam times/rooms/topics and the Tuesday sport room remain unknown.
Provenance keys make re-import idempotent even after edits; matching existing
records receives a provenance key without overwriting their personal details.
Overlapping lessons require correction or exclusion in the review UI.

The undated German 4/15 statement never enters weighted history automatically.
Confirmation requires category, real date, explicit weight and acknowledgement
of the selected calculation rule. Existing 4-point German records prevent a
second insertion through this draft.

IELTS and SAT use the same school-aware preparation context, weekly request caps
and one joint test action per day. Their tasks compete with school and profile
work within the existing daily planner; no independent workload is added after
planning. A school exam within two days limits test work to 15 minutes, within
seven days to 25 minutes. Completion and mock evidence remain separate. A full
Bluebook simulation requires a continuous 144-minute window; short or fragmented
availability excludes it. A manual move to an unsuitable day or shortening a full
simulation produces a clear validation message.

Both domains preserve planned/booked provenance, unknown targets and partial
results through additive v2 normalization and strict backup round trips. The
storage key, browser origin and Pages configuration are unchanged.

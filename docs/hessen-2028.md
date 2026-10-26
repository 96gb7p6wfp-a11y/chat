# Hessen 2028: scenarios, verified standard rules and remaining gaps

Source audit updated 26 October 2026. The official Hessen sources became
reachable after the initial release. Current consolidated OAVO text (including
the June 2026 amendment), the June 2025 amendment and published dates in the
2028 decree have now been inspected. See the exact citations, versions,
source links and scope in [hessen-sources.md](hessen-sources.md).

## Working functionality

- Separate Q1–Q4 semester results, confirmed or hypothetical, explicitly
  selected or excluded. Single assessment marks and old starting estimates
  never become semester grades or Abitur contributions automatically.
- Eight LK results weighted twice and 24 selected GK results weighted once
  (Block I, maximum 600); five examination results weighted fourfold
  (Block II, maximum 300). Missing values remain unknown. Duplicates and
  incomplete selections prevent a complete arithmetic total.
- Source-checked standard inclusion, exam-field, insufficient-result and
  minimum-point checks. Risks are distinct from incomplete attendance and
  special-case evidence; the calculator never certifies admission or passing.
- Official Annex 10b grade conversion and backward target scenarios. Own
  what-if assumptions do not replace confirmed semester records.
- Examination choices 3–5 remain undecided until selected. Published 2028
  written main dates are shown only for selected written subjects. School
  examination records, including known 2026 dates, remain unchanged.
- Assessment-count planning uses course hours, merged lessons and A/B weeks.
  Semester-specific teacher-confirmed exceptions and replacements remain
  editable. Sport and mandatory Q3 language communication assessments are
  distinguished from written Klausuren. Undated assessments stay undated.
- Explicit semester scenarios combine a written pool and continuous classroom
  performance. Weights require an action. One-third orientation follows
  § 9(2), remains approximate and does not guarantee the teacher's final mark.
  Required next written result, remaining mean, classroom performance and
  user-defined ranges are calculated from selected assumptions.
- Topic selection for all ten subjects supports multiple current topics,
  practice status, exam relevance and custom teacher/personal topics.
  Existing referenced fields are visibly pending full curriculum verification.
- Post-exam reflection, observed causes, teacher feedback and actual returned
  grades create a recovery workflow without inventing a second examination.
  English and German have authored diagnostic practice and follow-up content;
  other unsupported subjects/causes require selection of available material.
- LK importance, selected exam subjects, inclusion and actual upcoming exams
  affect priorities separately. Future hypothetical results never change the
  daily priority score.

## Remaining regulatory and curriculum work

The full E-phase/Q-phase attendance history, second-language evidence,
repeats, special learning achievements and school-authorised exceptions are
not modeled completely. These gaps keep full eligibility validation open.

The complete official Q1/Q2 topic/subtopic/skill catalogue for every subject,
its mandatory/optional classification, all 2028 prescribed texts/films and
examination priorities remain unfinished. Existing topics are not presented
as an authoritative complete official curriculum.

## Data compatibility and validation

The storage key stays `northstar.coach.v2`, schema version 2. Additive Hessen,
curriculum, semester scenario, recovery, university-goal and test-journey
records preserve existing grades, timetable, exams and preferences. Backup
and restore include the new fields; malformed imports are rejected before
replacing saved data. Cache updates do not clear local storage.

Meaningful tests cover official conversion boundaries, LK/GK contribution,
mandatory inclusion, zero/insufficient-result limits, exam field rules,
minimum exam outcomes, Q1–Q4 assessment counts and subject-specific
assessment types. Final release-wide test and browser results are recorded
in the release report. Physical iPhone Safari keyboard/date-picker behavior
still requires a device check.

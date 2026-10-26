# Hessen 2028: implemented scenarios and pending source review

Research attempted 26 October 2026. The managed environment returned
`CONNECT tunnel failed, response 403` for the official Abiturerlass PDF. This
is a destination-policy denial, not evidence about the contents or validity of
the PDF. The four mandatory official sources have **not** been read. No
consolidated OAVO or later amendment has been verified. The network draft adds
the Hessen source domains while preserving the existing GitHub destinations.

This release is therefore **not a verified official Hessen Abitur system**.
Every source has `verifiedAt: null`. A learner's checkbox cannot make the
regulatory engine verified.

## Working functionality

- Explicit, separate semester results: Q1–Q4, confirmed or scenario, selected
  or excluded. Individual assessment marks and old starting estimates never
  automatically become semester grades or Block I points.
- Arithmetic using the user's supplied model: eight LK semester results
  weighted twice plus 24 selected GK results weighted once (maximum 600),
  and five examination results weighted fourfold (maximum 300). Missing
  results, wrong counts and duplicate selections leave full totals open.
- Examination subjects 3–5 stay undecided until chosen. Known school
  examinations retain their saved dates; no Abitur examination dates are
  invented.
- Provisional assessment counts based on the user's supplied general rules,
  course hours, merged timetable periods and A/B cycles. Teacher-confirmed
  exceptions and replacement assessments are semester-specific. Unassigned
  legacy exceptions are retained but not applied automatically.
- Explicit semester scenarios combining a written pool and continuous
  classroom performance. Weights are never silently selected. A one-third
  written-share suggestion requires a user action, remains provisional and
  does not guarantee a school grade. Next written score, remaining mean,
  required classroom performance, best case and user-defined ranges are
  calculated from the selected assumptions.
- Q1/Q2 topic selection for all ten subjects, including multiple current
  topics, practice status, exam relevance and editable teacher/personal
  additions. The initial referenced fields contain only topics supplied by
  the user, visibly pending official verification. Active child topics take
  precedence over broad selected parents.
- Post-exam mood, observed causes, teacher feedback, explicit returned-grade
  entry and duplicate linking. A recovery plan uses the shared daily budget
  and does not create an extra examination. Seven authored English recovery
  units provide actual diagnostics and practice. Other subjects require an
  explicit supported error topic; automatic cause-specific diagnosis there
  remains incomplete.
- A new self-authored German Humanitätsideal analysis exercise. It is not a
  prescribed Abitur text, a historical quotation or an official model answer.
- Real LK importance, selected examination subjects, user-marked inclusion,
  low known scores and actual examination urgency affect priorities
  separately. Hypothetical future Abitur scores do not change today's plan.

## Regulatory work still required

1. Read the consolidated OAVO applicable to this cohort, the June 2025
   amendment and any later relevant changes. Record exact sections,
   effective dates and cohort applicability.
2. Verify mandatory subject/semester inclusion, permissible examination
   combinations, minimum passing points, insufficient-result limits and
   special examination weighting rules. Until then the calculator cannot
   certify admission to the examination or passing.
3. Verify course-hour assessment counts, permitted replacements, practical
   and language exceptions, and the significance of continuous performance.
4. Import the complete official Q1/Q2 topic/subtopic/skill catalogue for all
   ten subjects with curriculum versions and mandatory/optional status.
5. Read the actual 2028 priorities, English prescribed texts/films (including
   checking The Vanishing Half), and published examination dates. No older
   year's list may substitute for this review.

Official links are stored in `src/hessen.js` and `src/curriculum.js`. These
links are provenance targets, not a claim that their contents were verified.

## Data compatibility

The storage key remains `northstar.coach.v2`, schema version 2. New additive
fields are `hessen`, `curriculum`, `semesterGrading` and `recovery`. Existing
records and preferences are retained. Backups round-trip all new fields;
malformed new fields are rejected before replacing saved data. Offline shell
cache changes do not erase local storage. All QA records use isolated browser
contexts and are never inserted into user defaults.

## Release checks

26 October 2026: 390 JavaScript unit/integration tests pass. Production builds
pass for both `/` and `/chat/`. Maintained browser suites exercise the original
coaching flow, Q1 document import, interactive tutoring and eight new Hessen
scenario/recovery journeys. Twenty-eight width/theme/text-size configurations
pass, as do five hosting/offline checks. New populated forms were also inspected
at 320px with 200% text in both themes. No configured lint or type-check command
exists in this JavaScript repository.

These checks validate the implemented arithmetic, data handling and UI. They
do not validate the blocked legal/curriculum sources. Physical iPhone Safari,
its keyboard/date picker and audible device speech remain device checks.

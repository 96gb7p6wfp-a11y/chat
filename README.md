# Northstar

An iPhone-first academic and university growth coach, built as a local React
PWA. Three primary areas turn goals and actual evidence into a realistic next
action: **Heute**, **Lernen**, **Zukunft**.

The editable starting context is Gymnasium in Hessen, Q1, Mathematics and Physics
Leistungskurse and Abitur 2028. A new installation does not invent current grades,
exam results, IELTS/SAT scores, school lessons or exact volleyball times. Existing
saved grades, timetable entries, achievements and task history remain intact.

## The experience

- **Heute:** one destination and primary action, the next saved examination or
  verified university deadline, two further tasks and a small completion bar.
  Additional tasks, daily history, availability and review stay behind
  **Tagesplan & Verlauf**.
- **Lernen:** a vertical menu for weekly planning, daily/weekly school lessons,
  examinations, grades, backward Abitur planning and current topics.
  **Rückblick & Organisation** contains weekly review, other deadlines and study
  allowances. Lessons, exams and commitments share one time budget.
- **Zukunft:** programme-specific university goals, IELTS/SAT journeys,
  application roadmaps, activities, projects and personal background. The gear
  opens settings and JSON backup/restore. Existing university notes and profile
  editors remain accessible without adding bottom-navigation tabs.

Four optional onboarding steps create the first plan. All setup can be edited
later. Initial study allowances are editable planning preferences, not a claim
about known school hours or actual free time.

## University goals and reliable requirements

Choose UCL, UCLA, UC Berkeley or a custom university, programme, country, entry
year and priority. UCL and UCLA are separate institutions. Multiple UK, US and
German goals can remain active together.

Requirements retain an official source URL, institution, programme, entry year,
source reference year, verification date and confirmed/provisional/unpublished
status. Manual verification also requires a concrete source note. An older
entry year's rule does not silently become a confirmed 2028 requirement.

The comparison distinguishes unknown information, missing evidence and actual
recorded results. A starting estimate or individual school exam is not accepted
as a confirmed semester result. Verified subject requirements can influence
planning; adopting a verified university Abitur target requires an explicit
button and never overwrites existing grades. Programme-specific roadmaps sit
above the retained general USA/Germany planning routes.

Official UCL, UCLA, Berkeley, College Board and British Council pages were
retrieved on 26 October 2026. Read-only, sourced references distinguish UCL's
published 2027 Computer Science requirements from unconfirmed 2028 requirements.
Published SAT dates are compared with school exams; choosing one creates only a
personal planned date. Current international SAT fees and provider guidance are
cited; IELTS prices and seats remain unverified. Saved requirements are never
overwritten by a reference update. See [university sources](docs/university-sources.md)
and [provider sources](docs/test-provider-sources.md). Meeting a minimum does not
guarantee admission; the app does not calculate admissions probabilities.

See [the growth-coach model and limitations](docs/growth-coach.md).

## Grades, Abitur and recovery

**Lernen → Noten** supports 0–15 points, written/oral/participation/presentation
and other assessments, dates, Q1–Q4, notes and explicit weighting. Zero is valid.
Simple, individual-weighted and category-weighted means remain distinct. Missing
weights keep a weighted calculation open. An undated starting estimate is
labelled and is not converted into an assessment.

Subject details calculate the minimum next result or required average across
remaining assessments when the selected data and assumptions are sufficient.
Scenarios expose written/oral contributions, best achievable outcomes and
impossible targets. Hypothetical results never become actual grades.

**Lernen → Abiturziel** works backward from a target grade or total points using
selected 8 LK semester results weighted twice, 24 GK results weighted once and
five examinations weighted fourfold. Confirmed results stay fixed; Q1–Q4,
subject targets and reversible what-if overrides show alternative outcomes.
The official OAVO Annex 10b conversion and published 2028 written examination
schedule have been checked against current official sources. Arithmetic does
not certify that a particular course selection is legally eligible or passed:
attendance, missing course metadata and special cases still require school
confirmation. See [Hessen source status](docs/hessen-2028.md).

After an exam, record how it went without inventing a grade. Add the returned
result only with its actual date, category, semester and explicit weight, or
link an existing matching record. English/German diagnostics use actual
questions and self-check criteria to choose practice. Teacher comments and
later comparable results inform recovery. A poor score alone does not establish
the cause of a weakness or prove that a particular study method works.

## Interactive learning and shared planning

Starting a learning task opens an actual question and answer input. Short
explanations, solutions, checking criteria and a second attempt remain close to
the question. Draft answers, progress and mistakes persist independently of
older task notes. Known topics select relevant authored material. A missing
topic prompts a choice; unsupported content is explicitly marked incomplete.

Original modules cover English, German, Mathematics, Physics and selected
IELTS/SAT skills. This is not a complete official curriculum or automatic essay
grading. Written answers use model solutions and self-check criteria, not
invented school grades or IELTS bands. Synthetic listening practice is labelled;
without a suitable device voice, the listening assessment remains open.

The priority engine combines real performance, target gaps, imminent exams,
LK importance, university relevance, practice history and manual priorities.
School lessons and fixed commitments reduce usable study windows. Completing,
skipping, changing a deadline or entering a grade recalculates the plan while
preserving started work and historical records.

## IELTS and SAT journeys

In **Zukunft → IELTS & SAT**, move through need → assessment → preparation →
registration. SAT is not automatically recommended for prestige. Current UC
non-use of SAT/ACT is distinguished from yet-unverified 2028 programme rules;
a deliberate personal preparation override remains available.

Short original diagnostics identify exercise domains without awarding an
SAT score or IELTS band. Enter real Bluebook/mock/official results separately.
Complete actual official results take priority as a planning baseline; conflicting
section and total scores leave the gap open. Preparation hours are an explicit
user-selected scenario, not a promised score-gain formula. The app converts that
scenario into weeks/minutes within the shared timetable-aware budget.

Official registration, practice, test-centre, device and identification resources
are linked. User-entered official provider dates can be compared with school
exams and selected as a planned date. No booking, fee or free seat is claimed.
School examinations reduce test workload; full Bluebook simulations require a
sufficient uninterrupted block. At most one automatically generated standardized-
test task is added to a daily plan.

## Review the supplied Q1 documents

Open **Zukunft → Mein Profil → Deine Q1-Unterlagen**, or
**Lernen → Prüfungen / Stundenplan → Import prüfen**. The supplied document pack
contains only the nine personally confirmed 2026 examinations and 19 extracted
timetable blocks. Review and correct the timetable before saving. Double periods,
course names, room and teacher abbreviations remain editable. The Tuesday sport
room remains unknown. Imports merge idempotently and preserve later corrections.

The supplied German 4/15 assessment stays an unconfirmed entry draft until the
missing type, date and weight are supplied. It is not a confirmed semester grade.

## Run and verify

Use Node.js 24 from the repository root:

```sh
npm ci --no-audit --no-fund
npm test
npm run build
npm run preview -- --port 4176 --strictPort
```

With the production preview running, execute browser checks:

```sh
python3 tests/growth_coach_browser.py --url http://127.0.0.1:4176
python3 tests/coach_upgrade_browser.py --url http://127.0.0.1:4176
python3 tests/ux_repair_browser.py --url http://127.0.0.1:4176
python3 tests/personal_tutor_browser.py --url http://127.0.0.1:4176
python3 tests/hessen_browser.py --url http://127.0.0.1:4176
python3 tests/responsive_browser.py --url http://127.0.0.1:4176
```

The suites use Python Playwright and `/usr/bin/chromium`. They exercise the new
university/SAT/Abitur/recovery journeys and retained onboarding, grade, task,
timetable, import and storage flows. Responsive checks include narrow phones,
light/dark mode and enlarged text. Screenshots and results go to ignored
`test-results/`. `npm run dev -- --port 5173 --strictPort` starts development.
There are no separate lint or type-check scripts in this JavaScript project.

## Data, offline use and deployment

Data stays under the existing `northstar.coach.v2` local-storage key and schema
version 2. New goal, diagnostic and scenario fields are additive. Malformed
saved data is retained for recovery; invalid imports cannot silently replace
records. Export a JSON backup before clearing browser storage, switching devices
or changing the origin. Same-origin updates retain personal records; service-
worker assets are cached separately.

Self-hosted fonts, themes, safe areas and the offline shell remain supported.
Visit online once before relying on offline use. Chromium tests cannot replace
physical iPhone Safari and Home Screen testing.

The existing GitHub Pages Actions workflow and site configuration are unchanged.
A reviewed commit pushed to `main` triggers its tests, project-path build and
publication. Verify the workflow and public version before claiming deployment.
The project-path build is:

```sh
NORTHSTAR_BASE_PATH=/chat/ npm run build
```

Account sync, automatic official essay grading, a complete ten-subject official
Q1/Q2 content catalogue, calendar import/export and cross-app Screen Time controls
remain outside the completed functionality. The PWA cannot monitor or block
TikTok, Instagram or Snapchat. The independent older SwiftUI experiment remains
in `native/`.

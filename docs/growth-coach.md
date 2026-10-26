# Personal growth coach: implementation model

The product now uses three primary routes: `today`, `learn`, `future`.
Legacy `plan`/`progress` hashes route into Lernen and legacy `profile`/`pathway`
hashes into Zukunft. Detailed editors remain available through vertical menus,
native selects and disclosures. Ordinary screens do not require horizontal
carousels. The timetable defaults to a daily list.

## Destination → evidence → next action

`university-goals.js` owns normalized programme goals, source-aware requirements,
comparisons, subject relevance, SAT decisions and programme-specific roadmap
stages. UCL, UCLA and UC Berkeley have different identities. Custom goals support
UK, US and German programmes without assigning generic prestige requirements.

A requirement is confirmed only when its official host, institution, programme
(or institution-wide scope), entry year, reference year, non-future check date,
explicit user confirmation and nonempty source note match. Earlier-year data is
a provisional reference. The app does not fetch or certify a rule merely because
its URL exists. Read-only official source snapshots were researched separately:
UCL's published 2027 Computer Science requirements and current UC policies are
explicitly provisional for 2028. They do not overwrite saved requirements or create
2028 deadlines. Users can verify the actual entry-year sources and save them.
See [the source audit](university-sources.md).

Subject comparisons require the selected confirmed semester or Abitur-exam
result. Individual assessment averages and undated baseline values do not meet
that evidence requirement. IELTS comparison checks recorded official Overall
results; per-skill minima, accepted test forms and validity remain separately
reviewable. Documentary, programme and attendance conditions can remain unknown.

Programme goals contribute bounded subject-relevance boosts, not an unlimited
priority override. Imminent examinations, current target gaps and user priorities
still matter. Verified university Abitur requirements are offered as an explicit
apply action; existing marks and personal subject targets are not overwritten.
Only confirmed matching-year university deadlines enter the deadline system.

## Test decision and assessment

`test-journeys.js` separates informal exercise evidence from real SAT/IELTS
results. The SAT diagnostic has seven original questions across Mathematics and
Reading and Writing domains. Objective checking returns question-level feedback,
never an SAT score. IELTS diagnostics cover four skills with self-check criteria;
synthetic listening is labelled and can be left unassessed if audio is unavailable.
Typed speaking reflection does not measure pronunciation.

A planning baseline prefers a complete recorded official result, then a complete
scored mock result. Informal diagnostics and self-estimates cannot become measured
scores. Contradictory section/overall values leave the computed gap open.

An explicit user-entered study-hour range supports workload arithmetic: hours ÷
timetable-aware weekly allowance → weeks. This does not estimate a causal score
gain or promise readiness. New mock evidence should reassess the plan. The
registration journey links official sources and compares published or manually
entered provider dates with actual school exams. Dated official source snapshots
remain separate from personal bookings; prices and availability need rechecking. Source confirmation establishes what the
user checked, not a seat reservation. The real booking occurs with the provider.

For selected university goals, automatic SAT tasks require a confirmed need or a
deliberate `prepareAnyway` override. Existing SAT plans without new structured
goals remain usable. UC's current non-use policy is described as provisional for
2028. An unknown UCL admissions-test rule is not treated as a SAT requirement.

## Backward Abitur scenarios

`abitur-target.js` uses the shared `hessen.js` official conversion metadata and
Annex 10b thresholds. A target 1.5, for example, corresponds to at least 733 total
points. This table is distinct from eligibility or passing checks.

The user selects eight LK semester results (factor 2), twenty-four GK results
(factor 1) and five examination subjects (factor 4). A complete structural
selection is required before exact total scenarios are shown. Confirmed results
are fixed contributions; saved scenario values and reversible what-if overrides
are clearly identified as assumptions. Remaining weighted contributions, block
scenarios, Q1–Q4 contributions and subject-specific conditional averages update
without modifying the underlying records.

Subject calculations hold other open course results at the user's own subject
targets; these are not presented as institutional requirements. An outcome beyond
15 in open results is impossible under those assumptions. Fractional projected
totals do not receive an official final grade conversion. Neither a mathematically
sufficient total nor a verified table certifies complete legal course eligibility.
See [the Hessen implementation](hessen-2028.md) and its source audit for rule
coverage and outstanding school-specific information.

## Practice → feedback → reassessment

`recovery.js` stores post-exam impressions separately from grades. Returned grades
need the real performance date, category, semester and explicit relative weight.
Possible existing matches require linking or confirmation before a new record is
created. A poor mark alone does not identify vocabulary, grammar or analysis as
the cause.

English/German recovery starts with original diagnostic questions or explicit
teacher feedback. Completed self-checks may select a provisional follow-up skill;
explicit recorded causes take precedence. Only the next due recovery action
enters the shared allocator, avoiding a five-task overdue queue. Later actual
same-category, same-semester results can show a change, with a clear warning that
different tasks and other causes limit interpretation.

Guided sessions open a real question, not a method article. Drafts, checks,
solutions and reviews persist. Unsupported topics remain visibly incomplete.
The finite authored bank is not a complete official curriculum or reliable
machine grading for essays.

## Persistence and verification

The existing `northstar.coach.v2` key and schema version 2 are preserved.
`universityGoals`, `testJourney` and `abiturTarget` are additive normalized fields.
Backup validation checks retention instead of silently discarding malformed new
records. Actual assessments, lessons, activities and prior task history remain
separate from hypothetical comparisons.

Unit tests cover arithmetic, provenance and data retention. The browser suite
`tests/growth_coach_browser.py` covers programme goals, the SAT journey, backward
Abitur scenarios, post-exam recovery and the three-route mobile interface.
Existing maintained suites exercise retained functionality. Test screenshots,
production/offline builds and real browser interaction are necessary because a
passing JavaScript unit suite alone does not prove that a bundled app starts.
Physical iPhone Safari keyboard and Home Screen behavior still need device QA.


## Design references inspected

The [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/),
[Things](https://culturedcode.com/things/), [Structured](https://structured.app/)
and [Todoist](https://www.todoist.com/) were consulted on 26 October 2026.
The applied patterns are a focused Today action, three stable destinations,
compact task rows, a daily timetable before its weekly overview, and details
revealed on request. No branding or visual assets were copied. Khan Academy's
public landing page returned a client challenge and was not treated as inspected
learning content. Original exercises, answers and self-checks remain clearly
separate from official tests and teacher assessment.

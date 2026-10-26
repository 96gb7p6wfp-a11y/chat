# Hessen source audit — 26 October 2026

The official Hessen hosts became reachable during this release. This supersedes
the earlier blocked-source report. Scope is the ordinary gymnasiale Oberstufe
at a general Gymnasium, with five examinations, for a learner entering Q1 in
2026/27 and expecting Abitur in 2028. It is not a replacement for the school's
admission decision or assessment judgement.

## Sources actually inspected

| Official source | Verified scope |
| --- | --- |
| [Consolidated OAVO](https://www.rv.hessenrecht.hessen.de/bshe/document/hevr-OSt_AbiVHErahmen/part/X) | Current full text, §§ 9, 13, 24, 26, 52 and Annex 10b. The site reports its latest available version on 26 October 2026: § 9 last amended by Art. 5 of the law of 22 June 2026, GVBl. 2026 Nr. 38. Applicable version from 1 August 2026. |
| [Abiturerlass 2028](https://kultus.hessen.de/sites/kultus.hessen.de/files/2026-07/abiturerlass_2028.pdf) | Decree of 28 May 2026; pages 1–3 for legal basis and published written examination schedule. The document itself cites the December 2025 OAVO amendment; the later June 2026 consolidated version was checked separately. |
| [OAVO amendment 4 June 2025](https://verkuendung.hessen.de/sites/verkuendung.hessen.de/files/veroeffentlichungsplattform_plugin/published/933/GVBl_2025_Nr_32_Regelungstext.pdf) | Official GVBl. Nr. 32, published 10 June 2025; compared with current consolidated text rather than treated as the final legal version. |
| [Hessen school law directory](https://kultus.hessen.de/schulsystem/schulrecht) | Official entry point linking regulations and the 2028 decree. |

The [KCGO directory](https://kultus.hessen.de/unterricht/kerncurricula-und-lehrplaene/kerncurricula/kerncurricula-fuer-die-gymnasiale-oberstufe-kcgo)
is retained as an official source target. **The complete subject-by-subject
Q1/Q2 catalogue and 2028 prescribed texts have not been verified or imported.**
Existing referenced topics therefore keep their unverified provenance. The
2021 Abitur guide is not used for current rules.

## Rules integrated into calculations

- § 26(1–2): eight included LK results count twice; 24 selected GK results
  count once. Block I max 600. No included zero; at most six results below
  five, including at most two LK results.
- § 26(4–6): four semesters of examination subjects, Deutsch, Mathematik,
  one continued foreign language and one science; at least two arts courses,
  six social-science courses including two History and two Politics/Economics
  (or Geography subject to E-phase continuity); two additional courses in
  another language, another science or Informatik. Sport has a three-course
  cap unless it is an examination subject requiring all four semesters.
- § 24: five distinct subjects covering all three Aufgabenfelder; two LK and
  one GK written, spanning at least two fields; Deutsch and Mathematik
  mandatory, plus language/science/Informatik. Sport and Darstellendes Spiel
  GK cannot be third written subjects. The fifth exam's special-learning
  alternative is outside the ordinary modeled case.
- § 26(13–14): five examinations count fourfold (max 300), at least three
  results of five or higher including one LK, no final zero. LK contribution
  at least 80, GK at least 120, Block II at least 100; total at least 300.
- § 9(2): continuous classroom performance is at least as important as formal
  assessments. One Klausur contributes approximately one third. The app
  offers this as an explicit scenario; it does not silently select weights
  or turn an approximate rule into a guaranteed semester mark.
- § 9(6–6b): Q1–Q3 LK/four-hour GK generally two Klausuren; two/three-hour GK
  one; Q4 one. Sport special practical assessments and the mandated Q3
  language communication replacements are represented by assessment type.
  Teacher-confirmed replacements remain editable and semester-specific.
  Art/Music LK practical replacement timing and additional arts assessments
  require school confirmation.
- § 52 transitional provisions were checked: the old assessment rules for
  pupils already in Q3/Q4 in 2025/26 do not describe this Q1 2026/27 cohort.
- Annex 10b: ordinary 900-point grade conversion. Minimums include 823 for
  1.0, 769 for 1.3, 733 for 1.5, 697 for 1.7, and 643 for 2.0. Grade conversion
  is only applied to integer totals of 300–900. A numerical grade is a
  scenario, not proof that all passing conditions are met.

## Published dates

Q4 ends 31 March 2028. The written window is 20 April–11 May 2028.
Deutsch: 26 April; Englisch: 28 April; Mathematik: 3 May; Physik: 10 May.
The learner's other listed GK subjects have their written main date on
24 April, only relevant if chosen as the third written subject. Oral exams,
presentations and special-learning colloquia cannot start before 15 May;
practical exams not before 17 March. Exact school oral appointments remain
unknown. Existing 2026 school examination records are never overwritten.

## Deliberately incomplete validation

`regulatoryValidation.sourcesVerified` records that standard source rules were
checked. `complete` remains false: the current schema does not contain the
full E-phase/Q-phase attendance history, continued-language evidence,
second-language obligation, repeats, authorised exceptions or special
learning achievements. Own custom subjects can also have unknown task-field
classification. A personal checkbox does not bypass these missing records.
The app exposes detected rule risks and missing information separately.

For reproducibility, source artifacts used in this session had SHA-256:

- Abiturerlass PDF: `5b0bc0aa6268f8b056acab68f195c057b9fec7e00eab6d71c5553d58f395987f`
- June 2025 amendment PDF: `2fe5c184a7030bfd0ee29e22a39b466fdab75362dde1d08228108ae24cbe0e4f`
- Extracted consolidated visible text: `1ebf050d87eefb5ba8832f824a84eb5cc21b5572021ad4cefd3a603edb458c41`

No complete official PDFs or copyrighted exam questions are bundled in the app.

/** Read-only official references. A checked older source is not a confirmed 2028 rule. */
export const UNIVERSITY_REFERENCE_VERIFIED_AT = '2026-10-26';
const uclCourse = 'https://www.ucl.ac.uk/study/prospective-students/undergraduate/courses/computer-science-bsc';
const uclGermany = 'https://www.ucl.ac.uk/study/prospectus/international-equivalency/undergraduate/2027/a_star_a_star_a/DE';
const uclEnglish = 'https://www.ucl.ac.uk/study/prospective-students/undergraduate/how-apply/english-language-requirements';
const uclaInternational = 'https://admission.ucla.edu/apply/international-applicants';
const berkeleyPolicy = 'https://admissions.berkeley.edu/apply-to-berkeley/first-year-applicants-uc-berkeley/first-year-policy-changes/';
const berkeleyInternational = 'https://admissions.berkeley.edu/apply-to-berkeley/international-students/requirements-for-international-students/';
const fact = (kind, label, text, sourceUrl, extra = {}) => ({ kind, label, text, sourceUrl, verifiedAt: UNIVERSITY_REFERENCE_VERIFIED_AT, status: 'provisional', ...extra });
const references = {
  ucl: {
    institutionId: 'ucl', institution: 'University College London', programme: 'Computer Science BSc', programmeSpecific: true, referenceYear: 2027, sourceUrl: uclCourse,
    note: 'Offiziell geprüft für Studienbeginn 2027. Für 2028 nur eine vorläufige Orientierung; keine bestätigte 2028-Vorgabe und keine Zulassungszusage.',
    facts: [
      fact('qualification', 'Deutsches Abitur', 'Die Deutschland-Äquivalenz zum geforderten A*A*A nennt das Abitur mit 1,4 insgesamt und zwei Fachnoten von 14 Punkten. Das ist keine Garantie auf einen Studienplatz.', uclGermany, { maxAbiturGrade: 1.4 }),
      fact('subject', 'Mathematik', 'Der Studiengang verlangt A* in Mathematics oder Further Mathematics. Die Deutschland-Äquivalenz ordnet einem verlangten A* 14 Punkte im betreffenden Fach zu; LK/Advanced Level wird bevorzugt, wenn angeboten. Die genaue Nachweisart mit UCL klären.', uclCourse, { supplementarySourceUrl: uclGermany, subjectId: 'mathematics', minPoints: 14, evidenceScope: 'unknown' }),
      fact('admissions-test', 'TARA', 'Für 2027/28 müssen alle Bewerber den Test of Academic Reasoning for Admissions (TARA) zusätzlich zur UCAS-Bewerbung absolvieren. Termine und Registrierung beim offiziellen Testanbieter prüfen. Für 2028 ist diese Regel noch nicht bestätigt.', uclCourse),
      fact('english', 'Englisch · Level 1', 'Der Studiengang nennt Level 1. UCL nennt dafür IELTS Academic 6,5 insgesamt und mindestens 6,0 in jedem Bereich. Andere akzeptierte Nachweise und deren Bedingungen direkt prüfen.', uclEnglish, { supplementarySourceUrl: uclCourse, minimumBand: 6.5, minimumComponentBand: 6 }),
      fact('route', 'Bewerbung über UCAS', 'Bewerbung über UCAS, Studiengangscode G400. Fachspezifische Kriterien, persönliche Angaben und benötigte Nachweise für dein tatsächliches Eintrittsjahr prüfen.', uclCourse),
      fact('deadline', 'Referenzfrist · nur 2027', 'Die Programmseite nennt 13. Januar 2027, 18:00 Uhr britischer Zeit, für Studienbeginn 2027. Diese Frist wird nicht als Bewerbungstermin für 2028 übernommen.', uclCourse, { referenceDeadline: '2027-01-13', referenceTime: '18:00 Europe/London' }),
      fact('cost', 'Gebühren · nur 2027/28', 'Veröffentlichte internationale Studiengebühr für Studienbeginn 2027/28: £48.600 pro Jahr. Lebenshaltungskosten kommen hinzu. Gebührenstatus, spätere Jahre und 2028-Betrag separat prüfen.', uclCourse, { annualTuitionGBP: 48600 }),
    ],
  },
  ucla: {
    institutionId: 'ucla', institution: 'University of California, Los Angeles', programme: '', programmeSpecific: false, referenceYear: null, sourceUrl: uclaInternational,
    note: 'Aktuelle allgemeine Regeln für internationale Bewerber, geprüft am 26.10.2026. Keine gesonderte Bestätigung für Studienbeginn 2028 oder einen bestimmten Studiengang.',
    facts: [
      fact('sat', 'SAT / ACT · nicht berücksichtigt', 'UCLA berücksichtigt SAT/ACT weder für die Zulassung noch für Stipendien. Die aktuelle Seite empfiehlt SAT/ACT auch nicht als Englischnachweis. Für den tatsächlichen Bewerbungsjahrgang erneut prüfen.', uclaInternational, { testPolicy: 'not-used' }),
      fact('english', 'Englisch · Wettbewerbsorientierung', 'UCLA nennt IELTS 7,5 oder höher als konkurrenzfähigen Wert. Das ist eine Empfehlung, keine alleinige Zulassungsschwelle. Ob ein Englischnachweis nötig ist, hängt unter anderem von der bisherigen Unterrichtssprache ab.', uclaInternational, { recommendedBand: 7.5 }),
      fact('qualification', 'Schulabschluss & Länderregeln', 'UCLA verweist internationale Bewerber auf die UC-Länderanforderungen und verlangt eine vollständige, korrekte Schulbiografie. Hier ist keine feste deutsche Abiturnotengrenze für 2028 belegt; UC-GPA nicht selbst aus 15-Punkte-Noten ableiten.', uclaInternational),
    ],
  },
  berkeley: {
    institutionId: 'berkeley', institution: 'University of California, Berkeley', programme: '', programmeSpecific: false, referenceYear: null, sourceUrl: berkeleyPolicy,
    note: 'Aktuelle allgemeine Hochschulregeln, geprüft am 26.10.2026. Für Studienbeginn 2028 und die genaue Fakultät erneut prüfen.',
    facts: [
      fact('sat', 'SAT / ACT · test-free', 'UC Berkeley verwendet SAT/ACT nicht im Zulassungsverfahren. Eingereichte Ergebnisse können nach einer Zulassung für Einstufung oder Anrechnung genutzt werden; das macht SAT nicht zum Zulassungstest.', berkeleyPolicy, { testPolicy: 'not-used' }),
      fact('english', 'Englisch · veröffentlichter Mindestwert', 'Die aktuelle internationale Zulassungsseite nennt IELTS mindestens 6,5 als eine mögliche Form des Englischnachweises. Andere akzeptierte Nachweise und Befreiungen sind gesondert zu prüfen. Dies garantiert keine Zulassung.', berkeleyInternational, { minimumBand: 6.5 }),
      fact('documents', 'Empfehlungen nur nach Einladung', 'Nur ausgewählte Bewerber werden gebeten, zwei Empfehlungsschreiben einzureichen. Berkeley akzeptiert keine unaufgefordert eingesandten Empfehlungsschreiben; die konkrete Einladung beachten.', berkeleyPolicy),
    ],
  },
};

/** Fresh copy so UI edits cannot mutate published reference facts. */
export function getOfficialUniversityReference(institutionId) {
  const source = references[institutionId];
  return source ? structuredClone({ ...source, verifiedAt: UNIVERSITY_REFERENCE_VERIFIED_AT, status: 'provisional' }) : null;
}

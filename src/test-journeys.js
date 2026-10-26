/** Original short diagnostics and explicit preparation scenarios, never official scores. */
import { getSATSummary, normalizeSAT } from './sat.js';
import { getIELTSSummary, normalizeIELTS } from './ielts.js';
import { getPreparationContext, getInformalPracticeNeeds, validPreparationDate, preparationDay } from './test-preparation.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value, max = 5000) => typeof value === 'string' ? value.slice(0, max) : '';
const number = (value, min, max) => value !== '' && value !== null && value !== undefined && typeof value !== 'boolean' && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const date = value => validPreparationDate(value) ? value : '';
const url = value => { try { const parsed = new URL(value); return parsed.protocol === 'https:' ? parsed.href : ''; } catch { return ''; } };
const maps = (value, max = 5000) => Object.fromEntries(Object.entries(object(value)).slice(0, 100).filter(([key, value]) => key && key.length <= 150 && typeof value === 'string').map(([key, value]) => [key, text(value, max)]));
const question = (id, skill, domain, prompt, solution, explanation, extra = {}) => ({ id, skill, domain, prompt, solution, explanation, ...extra });
export const DIAGNOSTIC_QUESTIONS = {
  sat: [
    question('sat-diag-algebra', 'math', 'Algebra', 'Löse 3(2x − 5) = 21. Gib nur x an.', 'x = 6.', 'Ausmultiplizieren: 6x − 15 = 21. Dann 6x = 36 und x = 6. Einsetzen prüft das Ergebnis.', { accepted: ['6', 'x=6'] }),
    question('sat-diag-function', 'math', 'Funktionen', 'Für f(x) = x² − 4x gilt f(5) = ? Gib nur die Zahl an.', '5.', 'f(5) = 25 − 20 = 5. Setze den gesamten Wert für x ein; f(x) ist keine Multiplikation mit f.', { accepted: ['5'] }),
    question('sat-diag-data', 'math', 'Daten und Prozentrechnung', 'Ein Preis steigt von 80 € auf 100 €. Um wie viel Prozent steigt er? Gib die Prozentzahl an.', '25 %.', '(100 − 80) / 80 = 0,25. Die prozentuale Änderung bezieht sich auf den Ausgangswert 80, nicht auf den neuen Preis.', { accepted: ['25', '25%', '25prozent'] }),
    question('sat-diag-geometry', 'math', 'Geometrie', 'Ein rechtwinkliges Dreieck hat Katheten von 6 cm und 8 cm. Wie lang ist die Hypotenuse? Gib nur die Zahl in cm an.', '10 cm.', 'Nach dem Satz des Pythagoras ist c² = 6² + 8² = 100; daher c = 10 cm. Die Hypotenuse liegt gegenüber dem rechten Winkel.', { accepted: ['10', '10cm'] }),
    question('sat-diag-evidence', 'readingWriting', 'Textbelege', 'Which conclusion is supported? A: The project improved every student’s grades. B: Some surveyed students reported better concentration. C: All libraries should follow the same policy. Enter A, B or C.', 'B.', 'The survey records opinions from some respondents. It does not measure grades or support a claim about every student.', { passage: 'A library opened silent study rooms. In a voluntary survey, 18 of 30 respondents said the rooms helped them concentrate. The study did not measure examination results.', accepted: ['b'] }),
    question('sat-diag-boundary', 'readingWriting', 'Satzgrenzen', 'Choose the correct sentence. A: The sample was small, the team repeated the study. B: The sample was small; the team repeated the study. C: The sample was small the team repeated the study. Enter A, B or C.', 'B.', 'Two independent clauses can be separated by a semicolon. A comma alone creates a comma splice; C has no boundary.', { accepted: ['b'] }),
    question('sat-diag-transition', 'readingWriting', 'Logische Übergänge', 'Choose the transition: “The new method reduced energy use. ___, it required more maintenance.” A: However B: Therefore C: For example. Enter A, B or C.', 'A: However.', 'A contrast connects a benefit with a drawback. “Therefore” would express a result; “For example” would introduce an example.', { accepted: ['a', 'however'] }),
  ],
  ielts: [
    question('ielts-diag-listening', 'listening', 'Hördetails', 'At what time does the workshop begin, and what should participants bring? Answer in English.', 'It begins at 10:30. Participants should bring a notebook.', 'The message corrects the original time from ten to half past ten. The laptop is not required. Compare both details; this original synthetic exercise is not an IELTS Listening score.', { audioText: 'The workshop was originally planned for ten o’clock, but it will now start at half past ten. Please bring a notebook. You do not need a laptop.', requiresAudio: true, criteria: ['10:30 / half past ten correctly identified.', 'A notebook is required; a laptop is not.'] }),
    question('ielts-diag-reading', 'reading', 'True / False / Not Given', '“Students achieved higher examination scores after using the quiet rooms.” True, False or Not Given? Give the supporting phrase.', 'Not Given. The report did not collect examination scores.', 'The text gives self-reported concentration, not measured examination achievement. Missing evidence is not the same as contradiction.', { passage: 'A college introduced quiet rooms in September. Students can reserve one room for up to two hours. Most surveyed users reported better concentration. The report did not collect examination scores.', criteria: ['Not Given selected.', 'Distinguish concentration reports from examination results.'] }),
    question('ielts-diag-writing', 'writing', 'Argumentaufbau', 'Write 80–120 words in English: Should schools protect some lesson time from phone notifications? State a position, explain one reason and address one limitation.', 'Protected lesson time can help students follow demanding arguments because notifications interrupt attention. A class analysing a speech, for example, needs time to connect evidence and interpretation. However, a complete ban on digital tools could also limit useful research. Schools could therefore establish short phone-free intervals while allowing devices for a clearly defined task. The rule should explain its purpose and be applied consistently.', 'This is a short original diagnostic paragraph, not a complete 250-word IELTS Task 2 response. Compare argument, coherence, vocabulary and grammar. The app cannot award an official Writing band.', { criteria: ['A position and relevant reason are clear.', 'The example supports the reason.', 'One limitation is considered.', 'Sentences connect logically; check recurring grammar errors.'] }),
    question('ielts-diag-speaking', 'speaking', 'Strukturiert sprechen', 'Speak for 60–90 seconds about a skill you recently tried to improve. Explain what you did, what was difficult and what changed. Then type a short reflection on your answer.', 'A possible structure: name the skill → describe one practice attempt → explain a difficulty → give evidence of change → identify your next step. Your experience and details must be your own.', 'Use a timer and listen to a recording if you choose to make one outside the app. Assess relevance, fluency, vocabulary, grammar and intelligibility. This written reflection does not measure pronunciation or create a Speaking band.', { criteria: ['The answer stays on the prompt.', 'A concrete example supports the account.', 'Review pauses and sentence structure.', 'Pronunciation requires listening and human feedback.'] }),
  ],
};
export const JOURNEY_RESOURCES = {
  sat: [
    { title: 'Bluebook · vollständiger Probetest', url: 'https://bluebook.collegeboard.org/students/practice', detail: 'Ausgewertetes Ergebnis anschließend als Probeprüfung übernehmen.' },
    { title: 'College Board · Anmeldung', url: 'https://satsuite.collegeboard.org/sat/registration', detail: 'College-Board-Konto anlegen; echte Buchung beim Anbieter durchführen.' },
    { title: 'Termine und Fristen', url: 'https://satsuite.collegeboard.org/sat/dates-deadlines', detail: 'Aktuelle Termine, Anmeldefristen und Gebühren selbst prüfen.' },
    { title: 'Testzentrum suchen', url: 'https://satsuite.collegeboard.org/sat/test-center-search', detail: 'Zuerst Wiesbaden / Frankfurt suchen, danach den Suchbereich erweitern. Keine freien Plätze bestätigt.' },
    { title: 'Ausweis und Prüfungsregeln', url: 'https://satsuite.collegeboard.org/sat/what-to-bring-do/id-requirements', detail: 'Anforderungen für deinen Standort und Ausweis prüfen.' },
    { title: 'Gerät und Bluebook vorbereiten', url: 'https://bluebook.collegeboard.org/students', detail: 'Unterstütztes Gerät, Installation und Exam Setup beim Anbieter prüfen.' },
  ],
  ielts: [
    { title: 'IELTS · offizielle Vorbereitung', url: 'https://ielts.org/take-a-test/preparation-resources', detail: 'Originalmaterial und fachkundige Bewertung für Schreiben / Sprechen nutzen.' },
    { title: 'British Council · IELTS in Deutschland', url: 'https://www.britishcouncil.de/en/exam/ielts', detail: 'Academic-Test, Anbieterbedingungen und erforderliche Ausweisdokumente prüfen.' },
    { title: 'British Council · Orte, Termine und Gebühren', url: 'https://www.britishcouncil.de/en/exam/ielts/dates-fees-locations', detail: 'Aktuelle Preise und tatsächliche Verfügbarkeit direkt beim Anbieter prüfen.' },
    { title: 'IDP · IELTS Deutschland', url: 'https://ielts.idp.com/germany', detail: 'Standort und Buchungsinformationen vergleichen. Keine Verfügbarkeit bestätigt.' },
  ],
};
const officialSource = (test, value) => { try { const parsed = new URL(value); return parsed.protocol === 'https:' && (test === 'sat' ? /(^|\.)collegeboard\.org$/.test(parsed.hostname) : /(^|\.)(ielts\.org|britishcouncil\.de|idp\.com)$/.test(parsed.hostname)); } catch { return false; } };
const normalizePart = (value, test) => {
  const input = object(value), seen = new Set();
  const diagnostics = (Array.isArray(input.diagnostics) ? input.diagnostics : []).slice(0, 1000).flatMap(raw => {
    const entry = object(raw), id = text(entry.id, 150), day = date(entry.date);
    if (!id || !day || seen.has(id)) return [];
    seen.add(id);
    return [{ id, date: day, answers: maps(entry.answers), checks: Object.fromEntries(Object.entries(object(entry.checks)).slice(0, 100).filter(([key, check]) => key && key.length <= 150 && ['correct', 'review'].includes(check))), completed: entry.completed === true }];
  });
  const datesSeen = new Set();
  const candidateDates = (Array.isArray(input.candidateDates) ? input.candidateDates : []).slice(0, 200).flatMap(raw => {
    const entry = object(raw), id = text(entry.id, 150), day = date(entry.date);
    if (!id || !day || datesSeen.has(id)) return [];
    datesSeen.add(id);
    const sourceUrl = url(entry.sourceUrl), verifiedAt = date(entry.verifiedAt), deadline = date(entry.deadline);
    return [{ id, date: day, deadline, sourceUrl, verifiedAt, status: entry.status === 'confirmed' && officialSource(test, sourceUrl) && verifiedAt ? 'confirmed' : 'provisional' }];
  });
  return { prepareAnyway: input.prepareAnyway === true, diagnostics, hours: { min: number(input.hours?.min, 0, 10000), max: number(input.hours?.max, 0, 10000) }, candidateDates, registration: { checkedDate: date(input.registration?.checkedDate), notes: text(input.registration?.notes, 3000) }, skillConfidence: Object.fromEntries(['listening', 'reading', 'writing', 'speaking'].map(skill => [skill, ['practice', 'secure'].includes(input.skillConfidence?.[skill]) ? input.skillConfidence[skill] : 'unknown'])) };
};
export function normalizeTestJourney(value = {}) { return { sat: normalizePart(object(value).sat, 'sat'), ielts: normalizePart(object(value).ielts, 'ielts') }; }
export function saveJourneyPart(data, test, patch) {
  if (!['sat', 'ielts'].includes(test)) throw new TypeError('Wähle SAT oder IELTS.');
  const current = normalizeTestJourney(data.testJourney);
  return { ...data, testJourney: normalizeTestJourney({ ...current, [test]: { ...current[test], ...patch } }) };
}
export function saveDiagnosticAttempt(data, test, input) {
  if (!['sat', 'ielts'].includes(test) || !input?.id || !validPreparationDate(input.date)) throw new TypeError('Eine Diagnose braucht Kennung und Datum.');
  const part = normalizeTestJourney(data.testJourney)[test];
  return saveJourneyPart(data, test, { diagnostics: [...part.diagnostics.filter(entry => entry.id !== input.id), input] });
}
const comparable = value => { const raw = String(value || '').toLocaleLowerCase('en').replace(/\s/g, '').replace(/\.$/, '').replace(',', '.'); const numeric = raw.replace(/^x=/, '').replace(/(?:%|prozent)$/, ''); return /^[-+]?\d+(?:\.\d+)?$/.test(numeric) ? String(Number(numeric)) : raw; };
export function checkDiagnosticAnswer(test, questionId, answer) {
  const item = DIAGNOSTIC_QUESTIONS[test]?.find(question => question.id === questionId);
  if (!item) throw new TypeError('Diese Diagnosefrage ist nicht hinterlegt.');
  const correct = item.accepted ? item.accepted.some(value => comparable(value) === comparable(answer)) : null;
  return { correct, solution: item.solution, explanation: item.explanation, criteria: item.criteria || [], officialScore: null };
}
export function getDiagnosticSummary(data, test) {
  const part = normalizeTestJourney(data.testJourney)[test], questions = DIAGNOSTIC_QUESTIONS[test] || [];
  const latest = [...part.diagnostics].reverse().sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  const attempted = latest ? questions.filter(item => latest.answers[item.id]?.trim()).length : 0;
  const checked = latest ? questions.filter(item => latest.answers[item.id]?.trim() && latest.checks[item.id]).length : 0;
  const needsPractice = latest ? [...new Set(questions.filter(item => latest.checks[item.id] === 'review').map(item => item.domain))] : [];
  return { latest, questions, attempted, checked, total: questions.length, completed: checked === questions.length && questions.length > 0, needsPractice, officialScore: null };
}
export function getJourneyPreparation(data, test, today) {
  const sat = test === 'sat';
  const summary = sat ? getSATSummary(data, today) : getIELTSSummary(data, today);
  const settings = sat ? normalizeSAT(data.sat) : normalizeIELTS(data.ielts);
  const part = normalizeTestJourney(data.testJourney)[test];
  const context = getPreparationContext(data, today, test, settings.weeklyMinutes);
  const records = (summary.scores || []).filter(record => record.source === 'official' || record.source === 'mock');
  const official = records.filter(record => record.source === 'official');
  // Prefer a complete official result, then a complete scored mock; self estimates are never evidence.
  const complete = record => record.overall !== null || (sat ? record.skills.math !== null && record.skills.readingWriting !== null : ['listening', 'reading', 'writing', 'speaking'].every(skill => record.skills[skill] !== null));
  const baseline = official.find(complete) || records.find(complete) || null;
  const computed = baseline ? sat ? baseline.skills.math !== null && baseline.skills.readingWriting !== null ? baseline.skills.math + baseline.skills.readingWriting : null : ['listening', 'reading', 'writing', 'speaking'].every(skill => baseline.skills[skill] !== null) ? Math.round(['listening', 'reading', 'writing', 'speaking'].reduce((sum, skill) => sum + baseline.skills[skill], 0) / 4 * 2) / 2 : null : null;
  const conflictingResult = baseline && baseline.overall !== null && computed !== null && baseline.overall !== computed;
  const measured = conflictingResult ? null : computed ?? baseline?.overall ?? null;
  const target = sat ? settings.targetTotal : settings.targetOverall;
  const gap = measured !== null && target !== null ? Math.max(0, target - measured) : null;
  const hours = part.hours.min !== null && part.hours.max !== null && part.hours.min <= part.hours.max ? part.hours : null;
  const weeks = hours && context.allowance > 0 ? { min: Math.ceil(hours.min * 60 / context.allowance), max: Math.ceil(hours.max * 60 / context.allowance) } : null;
  const days = settings.examDate && validPreparationDate(today) ? preparationDay(settings.examDate) - preparationDay(today) : null;
  const calendarWeeks = days !== null && days >= 0 ? days / 7 : null;
  const deadlineAssessment = !settings.examDate ? 'Termin noch offen.' : days < 0 ? 'Der eingetragene Termin liegt in der Vergangenheit.' : !hours ? 'Für eine Belastungsrechnung fehlt dein eigener Aufwandsszenariobereich. Ein Score lässt sich daraus nicht versprechen.' : !weeks ? 'Im gewählten Wochenbudget ist keine Vorbereitung möglich.' : weeks.min > calendarWeeks ? 'Selbst dein kleineres Aufwandsszenario passt nicht bis zum Termin.' : weeks.max > calendarWeeks ? 'Nur dein kleineres Aufwandsszenario passt bis zum Termin; plane Puffer oder prüfe einen späteren Termin.' : 'Dein Aufwandsszenario passt zeitlich. Ob die Leistung reicht, zeigt eine neue ausgewertete Probeprüfung.';
  const daysPerWeek = (data.schedule?.weekly || []).filter(day => Number(day.minutes) >= 10).length || 1;
  const dailyMinutes = Math.min(context.schoolCap, Math.ceil(context.allowance / daysPerWeek));
  return { baseline, measured, conflictingResult, target, gap, hours, weeks, context, dailyMinutes, daysUntil: days, deadlineAssessment, diagnostic: getDiagnosticSummary(data, test), informalNeeds: getInformalPracticeNeeds(data, test, today), nextCheckDate: validPreparationDate(today) ? new Date((preparationDay(today) + 14) * 86400000).toISOString().slice(0, 10) : '', scorePromise: false };
}
export function rankCandidateTestDates(data, test, today) {
  if (!validPreparationDate(today)) return [];
  const preparation = getJourneyPreparation(data, test, today);
  return normalizeTestJourney(data.testJourney)[test].candidateDates.filter(item => item.date >= today && (!item.deadline || item.deadline >= today)).map(item => {
    const days = preparationDay(item.date) - preparationDay(today);
    const schoolConflicts = (data.exams || []).filter(exam => validPreparationDate(exam.date) && Math.abs(preparationDay(exam.date) - preparationDay(item.date)) <= 7);
    const closeExam = schoolConflicts.some(exam => Math.abs(preparationDay(exam.date) - preparationDay(item.date)) <= 2);
    const insufficientTime = preparation.weeks !== null && preparation.weeks.min * 7 > days;
    const penalty = (closeExam ? 100 : schoolConflicts.length ? 30 : 0) + (insufficientTime ? 60 : 0) + (item.status !== 'confirmed' ? 10 : 0);
    return { ...item, daysUntil: days, schoolConflicts, insufficientTime, penalty, reason: closeExam ? 'Direkt neben einer Schulklausur: möglichst einen anderen Anbietertermin prüfen.' : schoolConflicts.length ? 'Schulklausur in derselben Woche; nur mit ausreichend Puffer wählen.' : insufficientTime ? 'Dein kleineres Aufwandsszenario braucht mehr Zeit.' : 'Keine eingetragene Schulklausur in der Woche davor oder danach. Verfügbarkeit und Leistungsstand trotzdem prüfen.' };
  }).sort((a, b) => a.penalty - b.penalty || a.date.localeCompare(b.date));
}

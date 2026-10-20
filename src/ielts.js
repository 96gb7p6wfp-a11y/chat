import { getPreparationContext, getPreparationHorizon, getPreparationMilestones } from './test-preparation.js';

// IELTS evidence and preparation are separate: completing work never creates a band score.
export const IELTS_SKILLS = ['listening', 'reading', 'writing', 'speaking'];
export const IELTS_LABELS = { listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking' };
export const IELTS_SOURCES = { official: 'Offizielles Ergebnis', mock: 'Probeprüfung', self: 'Selbsteinschätzung' };

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value, max = 2000) => typeof value === 'string' ? value.slice(0, max) : '';
const dateNumber = value => validDate(value) ? Math.floor(Date.parse(`${value}T12:00:00Z`) / 86400000) : null;
export function validIELTSDate(value) { return validDate(value); }
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function band(value) {
  if (value == null || !['string', 'number'].includes(typeof value) || (typeof value === 'string' && value.trim() === '')) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 9 && Number.isInteger(number * 2) ? number : null;
}
export function calculateIELTSOverall(skills) {
  const values = IELTS_SKILLS.map(skill => band(skills?.[skill]));
  if (values.some(value => value === null)) return null;
  // IELTS rounds the four skill average to the nearest half band, with .25/.75 rounded up.
  return Math.round(values.reduce((sum, value) => sum + value, 0) / 4 * 2) / 2;
}
const skillBands = value => Object.fromEntries(IELTS_SKILLS.map(skill => [skill, band(object(value)[skill])]));

export function normalizeIELTS(value) {
  const input = object(value);
  const seen = new Set();
  const scores = (Array.isArray(input.scores) ? input.scores : []).flatMap((record, index) => {
    const item = object(record);
    if (!validDate(item.date) || !['official', 'mock', 'self'].includes(item.source)) return [];
    const skills = skillBands(item.skills);
    const overall = band(item.overall);
    if (overall === null && IELTS_SKILLS.every(skill => skills[skill] === null)) return [];
    const id = text(item.id, 120) || `ielts-score-${item.date}-${index}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, date: item.date, source: item.source, skills, overall, notes: text(item.notes) }];
  });
  const minutes = Number(input.weeklyMinutes);
  return {
    enabled: input.enabled !== false,
    examDate: validDate(input.examDate) ? input.examDate : '',
    dateStatus: input.dateStatus === 'booked' ? 'booked' : 'planned',
    targetOverall: band(input.targetOverall),
    targets: skillBands(input.targets),
    estimates: skillBands(input.estimates),
    weeklyMinutes: input.weeklyMinutes !== '' && input.weeklyMinutes != null && Number.isFinite(minutes) ? Math.min(840, Math.max(0, Math.round(minutes))) : 90,
    scores,
    mistakes: Object.fromEntries(IELTS_SKILLS.map(skill => [skill, text(object(input.mistakes)[skill])])),
  };
}

export function getIELTSSummary(state, today) {
  const data = normalizeIELTS(state?.ielts);
  const scores = [...data.scores].reverse().filter(record => !validDate(today) || record.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  const measured = scores.filter(record => record.source !== 'self');
  const skills = IELTS_SKILLS.map(skill => {
    const evidence = measured.filter(record => record.skills[skill] !== null);
    const self = scores.find(record => record.source === 'self' && record.skills[skill] !== null);
    const latest = evidence[0] || self;
    const current = latest ? latest.skills[skill] : data.estimates[skill];
    const source = latest?.source || (current !== null ? 'estimate' : null);
    const target = data.targets[skill] ?? data.targetOverall;
    return { skill, label: IELTS_LABELS[skill], current, target, gap: current !== null && target !== null ? Math.max(0, target - current) : null,
      source, date: latest?.date || '', trend: evidence.length >= 2 ? evidence[0].skills[skill] - evidence[1].skills[skill] : null,
      trendSources: evidence.slice(0, 2).map(record => record.source), mistakes: data.mistakes[skill], evidenceCount: evidence.length };
  });
  const withEvidence = skills.filter(skill => skill.current !== null && skill.gap !== null);
  const weakest = [...withEvidence].sort((a, b) => b.gap - a.gap || (a.current ?? 9) - (b.current ?? 9))[0] || null;
  const complete = measured.find(record => calculateIELTSOverall(record.skills) !== null);
  const overall = complete ? calculateIELTSOverall(complete.skills) : null;
  const reportedOverall = measured.find(record => record.overall !== null);
  const allTargetsKnown = data.targetOverall !== null && skills.every(skill => skill.target !== null);
  const targetMet = !!complete && allTargetsKnown && overall >= data.targetOverall && skills.every(skill => complete.skills[skill.skill] >= skill.target);
  const daysUntil = data.examDate && validDate(today) ? dateNumber(data.examDate) - dateNumber(today) : null;
  const configured = data.examDate !== '' || data.targetOverall !== null || skills.some(skill => skill.target !== null || skill.current !== null) || data.scores.length > 0;
  const context = getPreparationContext(state, today, 'ielts', data.weeklyMinutes);
  const overallGap = overall !== null && data.targetOverall !== null ? Math.max(0, data.targetOverall - overall) : null;
  const horizon = getPreparationHorizon(state, today, { measuredCount: complete ? measured.length : 0, gap: overallGap, test: 'IELTS' });
  return { data, scores, skills, weakest, complete, overall, reportedOverall, daysUntil, targetMet, configured, context, horizon, milestones: getPreparationMilestones(state, today, data.examDate, { measured: !!complete }),
    readiness: !complete ? 'Noch keine vollständige Probeprüfung erfasst.' : targetMet ? 'Deine Ziele wurden in diesem Ergebnis erreicht. Eine Prüfung bleibt eine neue Leistung.' : !allTargetsKnown ? 'Zielwerte fehlen noch für einen vollständigen Vergleich.' : 'Das letzte vollständige Ergebnis liegt noch nicht in allen Bereichen am Ziel.' };
}

export function getIELTSPractice(skill, { days = null, minutes = 30, mistakes = '' } = {}) {
  const short = days !== null && days >= 0 && days <= 1;
  const timed = days !== null && days >= 2 && days <= 28;
  const introductions = {
    listening: { title: 'IELTS Listening: einen Abschnitt hören und Fehler erklären', result: 'Ein ausgewerteter Listening-Abschnitt mit begründeten Korrekturen.', url: 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions/academic-test', task: 'Wähle einen Listening-Abschnitt aus den offiziellen kostenlosen Beispielaufgaben. Lies die Fragen, höre ohne Unterbrechung und notiere Antworten.', check: 'Prüfe mit dem bereitgestellten Lösungsschlüssel. Höre jede falsche Stelle erneut. War der Grund Ablenkung, Schreibweise, Wortschatz oder fehlendes Verständnis?', method: 'Gezieltes Hören und Fehleranalyse' },
    reading: { title: 'IELTS Reading: Textbelege für deine Antworten finden', result: 'Bearbeitete Reading-Aufgaben mit markiertem Beleg für jede Antwort.', url: 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions/academic-test', task: 'Wähle einen Academic-Reading-Text mit Aufgaben. Überfliege den Aufbau, beantworte eine Aufgabengruppe und markiere für jede Antwort den Textbeleg.', check: 'Nutze den offiziellen Lösungsschlüssel. Unterscheide bei True/False/Not Given: widersprochen, bestätigt oder im Text nicht belegt. Notiere die konkrete Ursache jedes Fehlers.', method: 'Textbelege und gezielte Fehleranalyse' },
    writing: { title: 'IELTS Writing Task 2: eine klare Argumentation entwickeln', result: 'Ein strukturierter Absatz oder Aufsatz mit eigener Überarbeitung nach vier Kriterien.', url: 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions/academic-test', task: 'Wähle eine offizielle Academic-Writing-Task-2-Frage. Bestimme alle Teile der Frage, beziehe klar Position und plane zwei begründete Argumente. Schreibe bei kurzer Zeit einen vollständigen Hauptteilabsatz.', check: 'Prüfe Task Response, Coherence and Cohesion, Lexical Resource sowie Grammatical Range and Accuracy. Beantwortest du jeden Fragenteil? Ist jede Aussage erklärt und belegt? Markiere Wiederholungen und zwei konkrete Sprachfehler. Diese Selbstprüfung ist keine Bandbewertung.', method: 'Geplantes Schreiben mit Rubrik' },
    speaking: { title: 'IELTS Speaking: aufnehmen, anhören und gezielt verbessern', result: 'Eine Aufnahme mit zwei konkreten Verbesserungen und einer zweiten Version.', url: 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions/academic-test', task: 'Wähle eine Speaking-Part-2-Beispielfrage. Plane eine Minute und sprich anschließend bis zu zwei Minuten. Nimm dich lokal mit einer eigenen Aufnahme-App auf; eine Aufnahme wird hier nicht hochgeladen.', check: 'Höre auf Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy und Pronunciation. Notiere eine unnötige Pause und eine unklare Formulierung. Wiederhole die Antwort mit diesen zwei Verbesserungen. Ohne qualifizierte Rückmeldung ist das keine Bandbewertung.', method: 'Sprechaufnahme und gezielte Wiederholung' },
  };
  const item = introductions[skill] || introductions.writing;
  const duration = Math.max(5, Math.round(minutes));
  const fullWriting = skill === 'writing' && duration >= 45 && !short;
  const first = fullWriting ? 3 : Math.max(1, Math.round(duration * .15));
  const review = fullWriting ? duration - 41 : Math.max(1, Math.round(duration * .3));
  const record = fullWriting ? 1 : Math.max(1, Math.round(duration * .1));
  const practice = Math.max(1, duration - first - review - record);
  const title = short ? `IELTS ${IELTS_LABELS[skill] || 'Writing'}: bekannte Fehler ruhig wiederholen` : item.title;
  return {
    title, method: short ? 'Leichte Wiederholung' : timed ? `${item.method} · mit Zeitlimit` : item.method,
    expectedResult: short ? 'Eine kurze Fehlerliste und ein klarer Plan für den Prüfungstag.' : item.result,
    steps: [
      { title: 'Erinnern', minutes: first, instruction: mistakes ? `Lies deine letzte Fehlernotiz: „${mistakes.trim()}“ Erkläre ohne Material, wie du diesen Fehler heute vermeidest.` : 'Erinnere dich ohne Notizen an die Aufgabe und typische Schwierigkeiten. Wähle ein konkretes Lernziel.' },
      { title: short ? 'Bekanntes wiederholen' : 'Üben', minutes: practice, instruction: short ? 'Bearbeite zwei bereits korrigierte Beispiele erneut. Beginne heute keinen vollständigen neuen Mock-Test. Prüfe danach die Prüfungsunterlagen und bewahre Erholungszeit.' : fullWriting ? 'Schreibe zur offiziellen Beispielfrage einen vollständigen Task-2-Aufsatz mit mindestens 250 Wörtern. Die drei Minuten Planung und 37 Minuten Schreiben ergeben zusammen die 40 Minuten für diese Aufgabe.' : `${item.task}${timed ? ' Nutze für diesen Abschnitt ein angemessenes Zeitlimit und beende ihn anschließend, statt die ganze Sitzung zu überziehen.' : ''}` },
      { title: 'Prüfen', minutes: review, instruction: item.check },
      { title: 'Fehler sichern', minutes: record, instruction: 'Notiere den wichtigsten wiederkehrenden Fehler und eine bessere Lösung. Wiederhole genau diesen Punkt in zwei Tagen; am Tag vor der Prüfung nur kurz.' },
    ],
    resource: { title: 'IELTS · offizielle Academic-Beispielaufgaben', url: item.url },
    reviewAfterDays: short ? 1 : 2,
    assessmentNote: 'Aufgabenfortschritt ist kein Nachweis eines IELTS-Bands. Für Writing und Speaking ist qualifiziertes Feedback besonders hilfreich.',
  };
}

export function getIELTSCandidates(state, today) {
  const summary = getIELTSSummary(state, today);
  const { data, daysUntil } = summary;
  if (!data.enabled || !summary.configured || !validDate(today) || (daysUntil !== null && daysUntil < 0) || data.weeklyMinutes === 0) return [];
  const { completed, remaining, schoolCap } = summary.context;
  if (remaining < 10) return [];
  const minutes = Math.min(remaining, schoolCap, daysUntil !== null && daysUntil <= 1 ? 15 : daysUntil !== null && daysUntil <= 28 ? 45 : 30);
  return summary.skills.map((item, index) => {
    const practice = getIELTSPractice(item.skill, { days: daysUntil, minutes, mistakes: item.mistakes });
    const urgent = daysUntil !== null && daysUntil <= 21;
    const lastPractice = completed.filter(task => task.ieltsSkill === item.skill).map(task => task.date).sort().at(-1);
    const sincePractice = lastPractice ? dateNumber(today) - dateNumber(lastPractice) : null;
    const practicePenalty = sincePractice === null ? 0 : sincePractice === 0 ? 30 : sincePractice <= 2 ? 20 : sincePractice <= 4 ? 8 : 0;
    const reason = item.gap > 0 ? `${item.label}: ${item.current.toFixed(1)} (${item.source === 'official' ? 'offiziell' : item.source === 'mock' ? 'Probeprüfung' : 'selbst eingeschätzt'}) → Ziel ${item.target.toFixed(1)}.` : item.current === null ? `Für ${item.label} fehlt noch ein Ergebnis. Beginne mit einer kurzen Standortbestimmung.` : `Halte ${item.label} durch gezielte Übung stabil.`;
    return { key: `ielts-${item.skill}`, category: 'Language', skill: item.skill, ieltsSkill: item.skill, title: practice.title, minutes,
      score: 40 + (item.gap || 0) * 8 + (urgent ? 14 : 0) + (item.current === null ? 3 : 0) - practicePenalty - index * .01,
      reason: `${reason}${daysUntil !== null ? ` ${data.dateStatus === 'booked' ? 'Gebuchte Prüfung' : 'Geplanter Termin'} ${daysUntil === 0 ? 'heute' : `in ${daysUntil} Tagen`}.` : ''}`,
      ...practice, goalId: 'english', expectedResult: practice.expectedResult, workloadReason: summary.context.reason };
  }).sort((a, b) => b.score - a.score);
}

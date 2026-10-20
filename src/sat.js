import { TEST_SOURCES, getPreparationContext, getPreparationHorizon, getPreparationMilestones, preparationDay, validPreparationDate } from './test-preparation.js';

export const SAT_SKILLS = ['readingWriting', 'math'];
export const SAT_LABELS = { readingWriting: 'Reading and Writing', math: 'Mathematics', full: 'Bluebook-Probetest' };
export const SAT_SOURCES = TEST_SOURCES;
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const clean = (value, max = 2000) => typeof value === 'string' ? value.slice(0, max) : '';
export function satScore(value, total = false) {
  if (value == null || !['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= (total ? 400 : 200) && number <= (total ? 1600 : 800) && number % 10 === 0 ? number : null;
}
const skills = value => Object.fromEntries(SAT_SKILLS.map(skill => [skill, satScore(object(value)[skill])]));
export function calculateSATTotal(value) {
  const scores = skills(value);
  return SAT_SKILLS.every(skill => scores[skill] !== null) ? scores.readingWriting + scores.math : null;
}
export function normalizeSAT(value) {
  const input = object(value);
  const seen = new Set();
  const scores = (Array.isArray(input.scores) ? input.scores : []).slice(0, 5000).flatMap((record, index) => {
    const item = object(record);
    if (!validPreparationDate(item.date) || !Object.hasOwn(TEST_SOURCES, item.source)) return [];
    const sections = skills(item.skills), overall = satScore(item.overall, true);
    if (overall === null && SAT_SKILLS.every(skill => sections[skill] === null)) return [];
    const id = clean(item.id, 120) || `sat-score-${item.date}-${index}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, date: item.date, source: item.source, skills: sections, overall, notes: clean(item.notes) }];
  });
  const weeklyMinutes = Number(input.weeklyMinutes);
  return {
    enabled: input.enabled === true,
    examDate: validPreparationDate(input.examDate) ? input.examDate : '',
    dateStatus: input.dateStatus === 'booked' ? 'booked' : 'planned',
    targetTotal: satScore(input.targetTotal, true), targets: skills(input.targets), estimates: skills(input.estimates),
    weeklyMinutes: input.weeklyMinutes !== '' && input.weeklyMinutes != null && Number.isFinite(weeklyMinutes) ? Math.max(0, Math.min(840, Math.round(weeklyMinutes))) : 60,
    scores, mistakes: Object.fromEntries(SAT_SKILLS.map(skill => [skill, clean(object(input.mistakes)[skill])])),
  };
}
export function getSATSummary(state, today) {
  const data = normalizeSAT(state?.sat);
  const scores = [...data.scores].reverse().filter(record => !validPreparationDate(today) || record.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  const measured = scores.filter(record => record.source !== 'self');
  const sections = SAT_SKILLS.map(skill => {
    const evidence = measured.filter(record => record.skills[skill] !== null);
    const self = scores.find(record => record.source === 'self' && record.skills[skill] !== null);
    const latest = evidence[0] || self;
    const current = latest ? latest.skills[skill] : data.estimates[skill];
    const target = data.targets[skill];
    return { skill, label: SAT_LABELS[skill], current, target, gap: current !== null && target !== null ? Math.max(0, target - current) : null, source: latest?.source || (current !== null ? 'estimate' : null), date: latest?.date || '', evidenceCount: evidence.length, trend: evidence.length > 1 ? evidence[0].skills[skill] - evidence[1].skills[skill] : null, mistakes: data.mistakes[skill] };
  });
  const complete = measured.find(record => calculateSATTotal(record.skills) !== null) || null;
  const overall = complete ? calculateSATTotal(complete.skills) : null;
  const reportedOverall = measured.find(record => record.overall !== null) || null;
  const weakest = [...sections].filter(section => section.current !== null).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0) || a.current - b.current)[0] || null;
  const targetMet = !!complete && data.targetTotal !== null && overall >= data.targetTotal && sections.every(section => section.target === null || complete.skills[section.skill] >= section.target);
  const configured = !!(data.examDate || data.targetTotal !== null || sections.some(section => section.current !== null || section.target !== null) || scores.length);
  const daysUntil = data.examDate && validPreparationDate(today) ? preparationDay(data.examDate) - preparationDay(today) : null;
  const context = getPreparationContext(state, today, 'sat', data.weeklyMinutes);
  const gap = overall !== null && data.targetTotal !== null ? Math.max(0, data.targetTotal - overall) : null;
  return { data, scores, sections, complete, overall, reportedOverall, weakest, targetMet, configured, daysUntil, context, gap, milestones: getPreparationMilestones(state, today, data.examDate, { measured: !!complete, test: 'SAT' }),
    horizon: getPreparationHorizon(state, today, { measuredCount: complete ? measured.length : 0, gap, test: 'SAT' }),
    readiness: !complete ? 'Noch kein vollständiger ausgewerteter Test erfasst.' : data.targetTotal === null ? 'Lege dein Ziel fest, um dein Ergebnis einzuordnen.' : targetMet ? 'Das Ziel wurde in diesem Ergebnis erreicht. Ein weiterer Test bleibt eine neue Leistung.' : 'Das letzte vollständige Ergebnis liegt noch unter deinem Ziel.',
  };
}

export function getSATPractice(skill, { days = null, minutes = 30, mistakes = '' } = {}) {
  const short = days !== null && days >= 0 && days <= 1;
  const duration = Math.max(5, Math.floor(Number(minutes) || 30));
  const reading = skill === 'readingWriting';
  const result = reading ? 'Bearbeitete Fragen mit Textbelegen und einer erklärten Fehlerursache.' : 'Gelöste Aufgaben mit Rechenweg und einer geprüften Korrektur.';
  const title = short ? `SAT ${reading ? 'Reading and Writing' : 'Math'}: bekannte Fehler wiederholen` : reading ? 'SAT Reading and Writing: 5 Fragen mit Belegen lösen' : 'SAT Math: 4 Aufgaben lösen und Rechenwege prüfen';
  if (skill === 'full') return {
    title: 'SAT: vollständige Bluebook-Diagnose durchführen', method: 'Realistische digitale Probeprüfung', expectedResult: 'Ein Bluebook-Ergebnis mit beiden Bereichen als neue Ausgangsbasis.',
    steps: [{ title: 'Reading and Writing', minutes: 64, instruction: 'Öffne einen vollständigen adaptiven SAT-Probetest in der offiziellen Bluebook-App. Bearbeite beide Module mit den dort vorgegebenen Zeiten ohne zusätzliche Hilfen.' }, { title: 'Pause', minutes: 10, instruction: 'Nutze die vorgesehene Pause. Deine Lernzeitplanung hält auch diese Pause frei.' }, { title: 'Mathematics', minutes: 70, instruction: 'Bearbeite beide Mathematikmodule in Bluebook. Übertrage danach das tatsächliche Ergebnis in deinen SAT-Verlauf. Plane die ausführliche Fehlerauswertung als eigene folgende Einheit.' }],
    resource: { title: 'College Board · Bluebook-Probetests', url: 'https://satsuite.collegeboard.org/practice/practice-tests/bluebook' }, reviewAfterDays: 1, assessmentNote: 'Ein Probetest ist kein offizielles Ergebnis. Der adaptive SAT lässt sich nicht seriös aus einer einfachen Zahl richtiger Antworten hochrechnen.',
  };
  const recall = Math.max(1, Math.floor(duration * .15)), review = Math.max(1, Math.floor(duration * .3)), record = Math.max(1, Math.floor(duration * .1));
  const count = duration < 15 ? 1 : reading ? 5 : 4;
  return {
    title: short ? title : `SAT ${reading ? 'Reading and Writing' : 'Math'}: ${count} ${reading ? 'Fragen mit Belegen lösen' : 'Aufgaben mit Rechenweg prüfen'}`, method: short ? 'Leichte Wiederholung' : reading ? 'Textbelege und Ausschlussverfahren' : 'Rechnen, prüfen und Fehler erklären', expectedResult: result,
    steps: [
      { title: 'Ziel klären', minutes: recall, instruction: mistakes ? `Prüfe deine letzte Fehlernotiz: „${mistakes.trim()}“. Lege fest, woran du heute eine Verbesserung erkennst.` : `Wähle ${reading ? 'einen Fragetyp, etwa Textbelege, Satzgrenzen oder logische Übergänge' : 'einen Aufgabentyp, etwa lineare Gleichungen, Funktionen oder Prozentrechnung'}. Nutze deine Diagnose als Grundlage; ohne Diagnose beginne mit einer kurzen gemischten Auswahl.` },
      { title: short ? 'Bekanntes wiederholen' : 'Selbst lösen', minutes: duration - recall - review - record, instruction: short ? 'Löse zwei bereits korrigierte Aufgaben erneut. Beginne unmittelbar vor der Prüfung keinen neuen vollständigen Probetest.' : `Wähle ${count} passende Aufgaben aus der offiziellen Student Question Bank. Bearbeite sie zuerst ohne Lösungen. ${reading ? 'Begründe jede Antwort mit einer Textstelle oder Grammatikregel und erläutere, warum andere Optionen ausscheiden.' : 'Schreibe die gegebenen Größen und jeden Rechenschritt auf. Nutze nur Hilfsmittel, die zum digitalen SAT passen.'}` },
      { title: 'Lösungen prüfen', minutes: review, instruction: 'Vergleiche mit den offiziellen Erklärungen. Markiere die erste falsche Entscheidung und ordne sie ein: Wissenslücke, Frage missverstanden, Rechenfehler oder Zeitproblem. Eine richtige geratene Antwort zählt dabei als unsicher.' },
      { title: 'Fehler sichern', minutes: record, instruction: 'Notiere eine konkrete Korrektur und löse eine falsche Aufgabe erneut. Plane die Wiederholung in zwei Tagen; unmittelbar vor der Prüfung nur kurz.' },
    ], resource: { title: 'College Board · Student Question Bank', url: 'https://satsuite.collegeboard.org/practice/student-question-bank' }, reviewAfterDays: short ? 1 : 2,
    assessmentNote: 'Diese Übung erzeugt keinen SAT-Score. Nutze ausgewertete Bluebook-Tests oder echte Ergebnisse als Leistungsnachweis.',
  };
}

export function getSATCandidates(state, today) {
  const summary = getSATSummary(state, today), { data, daysUntil, context } = summary;
  if (!data.enabled || !summary.configured || !validPreparationDate(today) || (daysUntil !== null && daysUntil < 0) || context.remaining < 10) return [];
  const minutes = Math.min(context.remaining, context.schoolCap, daysUntil !== null && daysUntil <= 1 ? 15 : daysUntil !== null && daysUntil <= 28 ? 45 : 30);
  const completed = context.completed;
  const candidates = summary.sections.map((section, index) => {
    const last = completed.filter(task => task.satSkill === section.skill).map(task => task.date).sort().at(-1);
    const ago = last ? preparationDay(today) - preparationDay(last) : null;
    const practice = getSATPractice(section.skill, { days: daysUntil, minutes, mistakes: section.mistakes });
    const reason = section.gap > 0 ? `${section.label}: ${section.current} (${section.source === 'official' ? 'offiziell' : section.source === 'mock' ? 'Probeprüfung' : 'selbst eingeschätzt'}) → Ziel ${section.target}.` : section.current === null ? `Für ${section.label} fehlt noch eine ausgewertete Diagnose.` : `Festige ${section.label} anhand deiner letzten Fehler.`;
    return { key: `sat-${section.skill}`, category: 'Language', satSkill: section.skill, title: practice.title, minutes, score: 40 + Math.min(24, (section.gap || 0) / 10) + (daysUntil !== null && daysUntil <= 21 ? 14 : 0) + (section.current === null ? 3 : 0) - (ago === null ? 0 : ago === 0 ? 30 : ago <= 2 ? 20 : ago <= 4 ? 8 : 0) - index * .01, reason: `${reason}${daysUntil !== null ? ` ${data.dateStatus === 'booked' ? 'Gebuchte Prüfung' : 'Geplanter Termin'} ${daysUntil === 0 ? 'heute' : `in ${daysUntil} Tagen`}.` : ''} ${context.reason}`, ...practice, goalId: 'tests' };
  });
  const lastMock = summary.scores.find(score => score.source === 'mock' && calculateSATTotal(score.skills) !== null);
  const dailyBudget = (state.schedule?.timeOverrides || []).find(item => item.date === today)?.minutes ?? (state.schedule?.weekly || []).find(item => Number(item.day) === new Date(`${today}T12:00:00Z`).getUTCDay())?.minutes ?? 0;
  if (context.remaining >= 144 && dailyBudget >= 144 && (context.daysToSchoolExam === null || context.daysToSchoolExam > 7) && (daysUntil === null || daysUntil > 2) && (!lastMock || preparationDay(today) - preparationDay(lastMock.date) >= 14)) {
    const practice = getSATPractice('full');
    candidates.push({ key: 'sat-full', category: 'Language', satSkill: 'full', title: practice.title, minutes: 144, score: summary.complete ? 48 : 65, reason: 'Eine vollständige Diagnose liefert belastbarere Hinweise als einzelne Übungsaufgaben. Für heute ist genügend Zeit eingetragen; die Auswertung folgt separat.', ...practice, goalId: 'tests' });
  }
  return candidates.sort((a, b) => b.score - a.score);
}

/** Hessen Gymnasium scenarios. Statutory checks are separated from arithmetic. */
export const HESSEN_SEMESTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
export const HESSEN_VERIFIED_AT = '2026-10-26';
export const HESSEN_OAVO_URL = 'https://www.rv.hessenrecht.hessen.de/bshe/document/hevr-OSt_AbiVHErahmen/part/X';
export const HESSEN_GRADE_CONVERSION = { status: 'confirmed', verifiedAt: HESSEN_VERIFIED_AT, citation: 'OAVO Anlage 10b zu § 38 Abs. 1', url: HESSEN_OAVO_URL, version: 'Geltende Fassung ab 01.08.2026; letzte Änderung § 9 durch Art. 5 Gesetz vom 22.06.2026, GVBl. 2026 Nr. 38' };
export const HESSEN_SOURCES = [
  { id: 'school-law', title: 'Hessen · Schulrecht', url: 'https://kultus.hessen.de/schulsystem/schulrecht', status: 'verified', verifiedAt: HESSEN_VERIFIED_AT, scope: 'Amtliches Verzeichnis; verlinkt OAVO und Abiturerlass 2028.' },
  { id: 'oavo-current', title: 'Geltende OAVO · Fassung ab 01.08.2026', url: HESSEN_OAVO_URL, status: 'verified', verifiedAt: HESSEN_VERIFIED_AT, scope: '§§ 9, 24, 26, Übergangsregel § 52 und Anlage 10b; allgemeine gymnasiale Oberstufe, gewöhnlicher Fünf-Prüfungen-Fall.' },
  { id: 'abitur-2028', title: 'Abiturerlass 2028 · 28.05.2026', url: 'https://kultus.hessen.de/sites/kultus.hessen.de/files/2026-07/abiturerlass_2028.pdf', status: 'verified', verifiedAt: HESSEN_VERIFIED_AT, scope: 'S. 1–3: Rechtsgrundlage und zentrale schriftliche Prüfungstermine; keine Bestätigung aller Fachlehrpläne.' },
  { id: 'oavo-2025', title: 'OAVO-Änderung · 04.06.2025', url: 'https://verkuendung.hessen.de/sites/verkuendung.hessen.de/files/veroeffentlichungsplattform_plugin/published/933/GVBl_2025_Nr_32_Regelungstext.pdf', status: 'verified', verifiedAt: HESSEN_VERIFIED_AT, scope: 'Änderungsfassung im geltenden Gesamttext abgeglichen; spätere Änderungen berücksichtigt.' },
  { id: 'kcgo', title: 'Hessen · Kerncurricula', url: 'https://kultus.hessen.de/unterricht/kerncurricula-und-lehrplaene/kerncurricula/kerncurricula-fuer-die-gymnasiale-oberstufe-kcgo', status: 'unverified', verifiedAt: null, scope: 'Vollständiger Fachkatalog noch nicht geprüft.' },
];
export const HESSEN_EXAM_SCHEDULE = { sourceUrl: HESSEN_SOURCES[2].url, verifiedAt: HESSEN_VERIFIED_AT, citation: 'Abiturerlass 2028, II.1 und II.2.1, S. 1–2', q4Ends: '2028-03-31', writtenFrom: '2028-04-20', writtenUntil: '2028-05-11', oralEarliest: '2028-05-15', practicalEarliest: '2028-03-17', exams: [
  { subjectId: 'mathematics', level: 'LK', date: '2028-05-03' }, { subjectId: 'physics', level: 'LK', date: '2028-05-10' },
  { subjectId: 'german', level: 'GK', date: '2028-04-26' }, { subjectId: 'english', level: 'GK', date: '2028-04-28' },
  ...['history', 'politics', 'computer-science', 'art', 'religion'].map(subjectId => ({ subjectId, level: 'GK', date: '2028-04-24' })),
] };
export function getAbiturTargetPoints(grade) {
  if (grade === '' || grade === null || grade === undefined || typeof grade === 'boolean') return null;
  const value = Number(grade);
  if (!Number.isFinite(value) || value < 1 || value > 4 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-8) return null;
  return value === 1 ? 823 : value === 4 ? 300 : Math.round(1003 - value * 180);
}
export function getAbiturGrade(points) {
  if (typeof points !== 'number' || !Number.isInteger(points) || points < 300 || points > 900) return null;
  for (let tenth = 10; tenth <= 40; tenth++) if (points >= getAbiturTargetPoints(tenth / 10)) return tenth / 10;
  return null;
}
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = (value, min, max, integer = false) => value !== '' && value !== null && value !== undefined && typeof value !== 'boolean' && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max && (!integer || Number.isInteger(Number(value))) ? Number(value) : null;
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
};
const records = (value, convert, max = 1000) => {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).slice(0, max).flatMap((entry, index) => {
    const result = convert(object(entry), index);
    if (!result || seen.has(result.id)) return [];
    seen.add(result.id);
    return [result];
  });
};

export function normalizeHessen(value = {}) {
  const input = object(value);
  const seenCourses = new Set();
  const courseSettings = (Array.isArray(input.courseSettings) ? input.courseSettings : []).slice(0, 100).flatMap(raw => {
    const entry = object(raw), subjectId = text(entry.subjectId, 150), semester = HESSEN_SEMESTERS.includes(entry.semester) ? entry.semester : '';
    const key = `${subjectId}-${semester}`;
    if (!subjectId || seenCourses.has(key)) return [];
    seenCourses.add(key);
    return [{ subjectId, semester, weeklyHours: number(entry.weeklyHours, 1, 10), countOverride: number(entry.countOverride, 0, 10, true), teacherConfirmed: entry.teacherConfirmed === true,
      replacements: records(entry.replacements, (replacement, index) => ({ id: text(replacement.id, 150) || `replacement-${index}`, kind: ['presentation', 'oral-communication', 'practical', 'other'].includes(replacement.kind) ? replacement.kind : 'other', count: number(replacement.count, 1, 10, true) || 1, note: text(replacement.note, 2000) }), 20), note: text(entry.note, 3000) }];
  });
  const semesterResults = records(input.semesterResults, entry => {
    const id = text(entry.id, 150), subjectId = text(entry.subjectId, 150);
    if (!id || !subjectId || !HESSEN_SEMESTERS.includes(entry.semester)) return null;
    const status = entry.status === 'confirmed' ? 'confirmed' : 'scenario';
    const inclusion = ['mandatory', 'optional', 'excluded'].includes(entry.inclusion) ? entry.inclusion : 'optional';
    return { id, subjectId, semester: entry.semester, points: number(entry.points, 0, 15, status === 'confirmed'), status, inclusion, included: inclusion === 'mandatory' || (inclusion !== 'excluded' && entry.included === true) };
  });
  const examinationSubjects = [1, 2, 3, 4, 5].map(slot => {
    const entry = object((Array.isArray(input.examinationSubjects) ? input.examinationSubjects : []).find(item => item?.slot === slot));
    const status = entry.status === 'confirmed' ? 'confirmed' : 'scenario';
    return { slot, subjectId: Object.hasOwn(entry, 'subjectId') ? text(entry.subjectId, 150) : slot === 1 ? 'mathematics' : slot === 2 ? 'physics' : '', points: number(entry.points, 0, 15, status === 'confirmed'), status, mode: ['written', 'oral', 'presentation'].includes(entry.mode) ? entry.mode : slot <= 3 ? 'written' : 'oral' };
  });
  const review = object(input.regulatoryReview);
  return { courseSettings, semesterResults, examinationSubjects, targetPoints: number(input.targetPoints, 0, 900), regulatoryReview: { confirmed: review.confirmed === true, checkedDate: date(review.checkedDate), note: text(review.note, 4000) } };
}

/** Arithmetic and data consistency only. No automatic mandatory-course choice. */
export function calculateAbitur(data = {}) {
  const config = normalizeHessen(data.hessen), subjects = data.subjects || [];
  const byId = new Map(subjects.map(subject => [subject.id, subject]));
  const issues = [], seenTerms = new Set();
  const included = config.semesterResults.filter(result => result.included);
  const valid = [];
  for (const result of included) {
    const subject = byId.get(result.subjectId);
    if (!subject) { issues.push({ code: 'unknown-subject', subjectId: result.subjectId, message: 'Eine eingebrachte Halbjahresnote verweist auf ein unbekanntes Fach.' }); continue; }
    const key = `${result.subjectId}-${result.semester}`;
    if (seenTerms.has(key)) { issues.push({ code: 'duplicate-semester', subjectId: result.subjectId, semester: result.semester, message: 'Für ein Fach und Halbjahr sind mehrere eingebrachte Ergebnisse ausgewählt. Wähle genau eines.' }); continue; }
    seenTerms.add(key);
    valid.push({ ...result, level: subject.level === 'LK' ? 'LK' : 'GK', factor: subject.level === 'LK' ? 2 : 1 });
  }
  const lk = valid.filter(result => result.level === 'LK'), gk = valid.filter(result => result.level === 'GK');
  const knownPoints = valid.reduce((sum, result) => sum + (result.points ?? 0) * result.factor, 0);
  const missingPointsCount = valid.filter(result => result.points === null).length;
  if (lk.length !== 8) issues.push({ code: 'lk-count', message: `${lk.length} von 8 vorgesehenen LK-Halbjahresergebnissen ausgewählt.` });
  if (gk.length !== 24) issues.push({ code: 'gk-count', message: `${gk.length} von 24 vorgesehenen GK-Halbjahresergebnissen ausgewählt. Nicht jeder besuchte Kurs wird automatisch eingebracht.` });
  if (missingPointsCount) issues.push({ code: 'semester-points-missing', message: `${missingPointsCount} ausgewählte Halbjahresergebnisse sind noch offen.` });
  const lkSubjects = subjects.filter(subject => subject.level === 'LK');
  if (lkSubjects.length !== 2) issues.push({ code: 'lk-subject-count', message: 'Für dieses 8-LK-Szenario werden zwei Leistungskurse benötigt.' });
  for (const subject of lkSubjects) for (const semester of HESSEN_SEMESTERS) if (!lk.some(result => result.subjectId === subject.id && result.semester === semester)) issues.push({ code: 'lk-semester-missing', subjectId: subject.id, semester, message: `${subject.name || subject.id} · ${semester}: LK-Ergebnis noch nicht eingebracht.` });
  const chosen = config.examinationSubjects.filter(exam => exam.subjectId);
  const examIds = new Set();
  for (const exam of chosen) {
    if (!byId.has(exam.subjectId)) issues.push({ code: 'unknown-exam-subject', slot: exam.slot, message: `Prüfungsfach ${exam.slot} ist im Fachprofil nicht vorhanden.` });
    if (examIds.has(exam.subjectId)) issues.push({ code: 'duplicate-exam-subject', slot: exam.slot, message: 'Ein Fach ist mehrfach als Abiturprüfungsfach ausgewählt.' });
    examIds.add(exam.subjectId);
    if (exam.slot <= 2 && byId.get(exam.subjectId)?.level !== 'LK') issues.push({ code: 'lk-exam-subject', slot: exam.slot, message: 'Die ersten beiden Prüfungsplätze sind in diesem Szenario für die Leistungskurse vorgesehen.' });
  }
  if (chosen.length !== 5) issues.push({ code: 'exam-subjects-open', message: 'Dein drittes, viertes und fünftes Prüfungsfach bleiben offen, bis du sie auswählst.' });
  if (chosen.some(exam => exam.points === null)) issues.push({ code: 'exam-points-missing', message: 'Für ausgewählte Prüfungsfächer fehlen noch Ergebnisse oder ausdrückliche Szenariowerte.' });
  const examKnownPoints = chosen.reduce((sum, exam) => sum + (exam.points ?? 0) * 4, 0);
  const blockIInvalid = issues.some(issue => ['unknown-subject', 'duplicate-semester', 'lk-count', 'gk-count', 'semester-points-missing', 'lk-subject-count', 'lk-semester-missing'].includes(issue.code));
  const blockIIInvalid = issues.some(issue => ['unknown-exam-subject', 'duplicate-exam-subject', 'lk-exam-subject', 'exam-subjects-open', 'exam-points-missing'].includes(issue.code));
  const blockI = { points: blockIInvalid ? null : knownPoints, knownPoints, maxPoints: 600, lkCount: lk.length, gkCount: gk.length, confirmedCount: valid.filter(result => result.status === 'confirmed' && result.points !== null).length, scenarioCount: valid.filter(result => result.status === 'scenario' && result.points !== null).length, missingPointsCount, included: valid };
  const blockII = { points: blockIIInvalid ? null : examKnownPoints, knownPoints: examKnownPoints, maxPoints: 300, count: chosen.length, confirmedCount: chosen.filter(exam => exam.status === 'confirmed' && exam.points !== null).length, scenarioCount: chosen.filter(exam => exam.status === 'scenario' && exam.points !== null).length };
  const totalPoints = blockI.points === null || blockII.points === null ? null : blockI.points + blockII.points;
  const timeline = HESSEN_SEMESTERS.map(semester => { const results = valid.filter(result => result.semester === semester); return { semester, confirmed: results.filter(result => result.status === 'confirmed' && result.points !== null).length, scenarios: results.filter(result => result.status === 'scenario' && result.points !== null).length, included: results.length, contribution: results.reduce((sum, result) => sum + (result.points ?? 0) * result.factor, 0) }; });
  return { config, blockI, blockII, totalPoints, targetPoints: config.targetPoints, targetGap: totalPoints !== null && config.targetPoints !== null ? config.targetPoints - totalPoints : null, issues,
    regulatoryValidation: validateHessenRules(data, { config, blockI, blockII, included: valid, chosen, subjects }), timeline, sources: HESSEN_SOURCES, verifiedAt: HESSEN_VERIFIED_AT, examSchedule: HESSEN_EXAM_SCHEDULE, conversion: HESSEN_GRADE_CONVERSION, scenarioGrade: getAbiturGrade(totalPoints) };
}

function timetableHours(data, subjectId, semester) {
  const lessons = (data.schedule?.lessons || []).filter(lesson => lesson.subjectId === subjectId && (!lesson.term || lesson.term.includes(semester)));
  if (!lessons.length || lessons.some(lesson => !Number.isInteger(lesson.periodStart) || !Number.isInteger(lesson.periodEnd))) return null;
  // A/B alternatives represent the weekly load in each cycle, never their sum.
  const sum = cycle => lessons.filter(lesson => !lesson.cycle || lesson.cycle === 'all' || lesson.cycle === cycle).reduce((total, lesson) => total + lesson.periodEnd - lesson.periodStart + 1, 0);
  const a = sum('A'), b = sum('B');
  return a === b && a >= 1 && a <= 10 ? a : null;
}

/** OAVO § 9 Abs. 6–6b, checked in the current consolidated text. No dates are invented. */
export function courseAssessmentPlan(data = {}, subjectId, semester = data.profile?.schoolYear || 'Q1') {
  const subject = (data.subjects || []).find(item => item.id === subjectId);
  const settings = normalizeHessen(data.hessen).courseSettings;
  const config = settings.find(item => item.subjectId === subjectId && item.semester === semester);
  const general = settings.find(item => item.subjectId === subjectId && !item.semester);
  const measuredHours = timetableHours(data, subjectId, semester);
  const contextHours = subjectId === 'english' ? 3 : subjectId === 'german' ? 4 : null;
  const hourSetting = config?.weeklyHours !== null && config?.weeklyHours !== undefined ? config : general?.weeklyHours !== null && general?.weeklyHours !== undefined ? general : null;
  const weeklyHours = hourSetting?.weeklyHours ?? measuredHours ?? contextHours;
  const hoursSource = hourSetting ? hourSetting.teacherConfirmed ? 'teacher' : 'user' : measuredHours !== null ? 'timetable' : contextHours !== null ? 'user-context' : 'unknown';
  const level = subject?.level === 'LK' ? 'LK' : 'GK';
  let expected = !HESSEN_SEMESTERS.includes(semester) || !subject ? null : semester === 'Q4' ? 1 : level === 'LK' ? 2 : weeklyHours === 4 ? 2 : weeklyHours === 2 || weeklyHours === 3 ? 1 : null;
  const exceptionApplied = config?.teacherConfirmed === true && config?.countOverride !== null && config?.countOverride !== undefined;
  if (exceptionApplied) expected = config.countOverride;
  // Fachregeln change the assessment type, not the number of assessment dates.
  const modernLanguage = ['english', 'french', 'spanish', 'italian', 'russian', 'chinese'].includes(subjectId);
  const selectedThird = normalizeHessen(data.hessen).examinationSubjects.some(exam => exam.slot === 3 && exam.subjectId === subjectId);
  const requiredKinds = expected === null ? [] : Array.from({ length: expected }, () => 'written');
  if (!exceptionApplied && subjectId === 'sport') requiredKinds.fill('practical');
  else if (!exceptionApplied && modernLanguage && semester === 'Q3' && (level === 'LK' || selectedThird) && requiredKinds.length) requiredKinds[requiredKinds.length - 1] = 'oral';
  const scheduled = (data.exams || []).filter(exam => {
    if (exam.subjectId !== subjectId || !requiredKinds.includes(exam.format || 'written')) return false;
    // An explicitly assigned semester takes precedence over legacy labels.
    if (HESSEN_SEMESTERS.includes(exam.semester)) return exam.semester === semester;
    return new RegExp(`\\b${semester}\\b`, 'i').test(exam.title || '') || (semester === 'Q1' && /^q1-hessen-2026/.test(exam.importKey || ''));
  });
  const replacementCount = config?.teacherConfirmed === true ? (config.replacements || []).reduce((sum, entry) => sum + entry.count, 0) : 0;
  // An extra event of one kind cannot stand in for a required different kind.
  const remainingKinds = [...requiredKinds];
  for (const exam of scheduled) { const index = remainingKinds.indexOf(exam.format || 'written'); if (index !== -1) remainingKinds.splice(index, 1); }
  for (let i = 0; i < replacementCount && remainingKinds.length; i++) remainingKinds.shift();
  const unscheduledCount = expected === null ? null : remainingKinds.length;
  let additionalMessage = unscheduledCount === 1 ? 'Eine weitere Klausur vorgesehen — Termin noch offen.' : unscheduledCount > 1 ? `${unscheduledCount} weitere Klausuren vorgesehen — Termine noch offen.` : expected === null ? 'Kursstunden und Leistungsnachweise mit der Lehrkraft klären.' : '';
  if (unscheduledCount && remainingKinds.some(kind => kind !== 'written')) additionalMessage = remainingKinds.map(kind => kind === 'oral' ? 'Mündliche Kommunikationsprüfung' : kind === 'practical' ? 'Besondere Fachprüfung' : 'Klausur').join(' + ') + ' vorgesehen — Termin noch offen.';
  return { subjectId, semester, level, weeklyHours, hoursSource, expected, requiredKinds, remainingKinds, scheduled, scheduledCount: scheduled.length, replacementCount, unscheduledCount, additionalMessage, provisional: expected === null || hoursSource === 'user-context', exceptionApplied,
    note: config?.note || general?.note || '', sourceStatus: 'verified', verifiedAt: HESSEN_VERIFIED_AT, sourceUrl: HESSEN_OAVO_URL, citation: 'OAVO § 9 Abs. 2, 6, 6a und 6b', continuousRule: 'Kontinuierliche Leistung ist mindestens so bedeutsam wie Leistungsnachweise. Bei einer Klausur zählt diese etwa ein Drittel; keine starre Notengarantie.', ruleNote: 'Allgemeine Anzahl nach geltender OAVO § 9. Ersatzleistungen, Vergleichsarbeit und Abiturklausur mit der Lehrkraft abgleichen. Sport und Fremdsprachen haben Fachregeln.', replacements: config?.replacements || [], unassignedException: !!general && (general.countOverride !== null || general.replacements.length > 0) };
}

/** Importance stays separate from urgency and never changes a school average. */
export function getHessenImportance(data = {}, subjectId) {
  const config = normalizeHessen(data.hessen), subject = (data.subjects || []).find(item => item.id === subjectId);
  const factor = subject?.level === 'LK' ? 2 : 1;
  const selectedExam = config.examinationSubjects.some(exam => exam.subjectId === subjectId);
  const included = config.semesterResults.filter(result => result.subjectId === subjectId && result.included);
  const mandatoryCount = included.filter(result => result.inclusion === 'mandatory').length;
  return { factor, selectedExam, includedCount: included.length, mandatoryCount, longTermLabel: factor === 2 ? 'Langfristig wichtig · LK' : selectedExam ? 'Gewähltes Abiturprüfungsfach' : mandatoryCount ? 'Von dir als einzubringen markiert' : 'Einbringung noch prüfen',
    reason: factor === 2 ? 'Deine eingebrachten LK-Halbjahresnoten zählen im gewählten Block-I-Szenario doppelt; eine nahe Prüfung kann trotzdem ein anderes Fach dringender machen.' : selectedExam ? 'Dieses Fach ist in deinem Abiturprüfungsszenario ausgewählt.' : mandatoryCount ? 'Du hast Halbjahresergebnisse dieses Fachs als verpflichtend markiert; die gesetzlichen Pflichten werden zusätzlich geprüft.' : 'Einbringung und Prüfungsfachwahl hängen von deiner tatsächlichen Kursbelegung ab.', verified: true };
}


/** Known subject IDs are classified explicitly; custom subjects stay unknown. */
const SUBJECT_KIND = {
  mathematics: ['III', 'math'], physics: ['III', 'science'], biology: ['III', 'science'], chemistry: ['III', 'science'],
  'computer-science': ['III', 'informatics'], german: ['I', 'german'], english: ['I', 'language'], french: ['I', 'language'], latin: ['I', 'language'], spanish: ['I', 'language'],
  history: ['II', 'history'], politics: ['II', 'politics'], economics: ['II', 'politics'], geography: ['II', 'geography'], religion: ['II', 'social'], ethics: ['II', 'social'],
  art: ['I', 'arts'], music: ['I', 'arts'], drama: ['I', 'arts'], sport: ['', 'sport'],
};
function validateHessenRules(data, { config, blockI, blockII, included, chosen, subjects }) {
  const checks = [], pending = [];
  const kind = id => SUBJECT_KIND[id];
  const add = (code, met, message, citation) => checks.push({ code, status: met === null ? 'pending' : met ? 'met' : 'risk', message, citation, sourceUrl: HESSEN_OAVO_URL });
  const count = predicate => included.filter(item => predicate(item.subjectId)).length;
  const subjectCount = id => count(subjectId => subjectId === id);
  const familyCount = family => count(id => kind(id)?.[1] === family);
  const selectedIds = new Set(chosen.map(exam => exam.subjectId));
  const knownSubjects = subjects.filter(subject => kind(subject.id));
  const qualifyingFour = family => knownSubjects.filter(subject => kind(subject.id)?.[1] === family && subjectCount(subject.id) === 4);
  const completeSelection = blockI.lkCount === 8 && blockI.gkCount === 24;
  const fullKnown = completeSelection && included.length === 32 && included.every(item => item.points !== null);
  add('included-zero', included.some(item => item.points === 0) ? false : fullKnown ? true : null, 'Kein eingebrachtes Kursergebnis darf 0 Punkte haben.', '§ 26 Abs. 2');
  const insufficient = included.filter(item => item.points !== null && item.points < 5), insufficientLK = insufficient.filter(item => item.level === 'LK');
  add('insufficient-courses', insufficient.length > 6 || insufficientLK.length > 2 ? false : fullKnown ? true : null, `${insufficient.length} Unterkurse, davon ${insufficientLK.length} LK; höchstens 6 insgesamt und 2 LK.`, '§ 26 Abs. 2');
  for (const exam of chosen) add(`exam-courses-${exam.slot}`, subjectCount(exam.subjectId) === 4 ? true : completeSelection ? false : null, `${exam.slot}. Prüfungsfach: alle vier Q-Halbjahre müssen eingebracht werden.`, '§ 26 Abs. 4 Nr. 1');
  add('german-inclusion', subjectCount('german') === 4 ? true : completeSelection ? false : null, 'Vier Deutschkurse einbringen.', '§ 26 Abs. 6 Nr. 1a');
  add('math-inclusion', subjectCount('mathematics') === 4 ? true : completeSelection ? false : null, 'Vier Mathematikkurse einbringen.', '§ 26 Abs. 6 Nr. 3a');
  add('foreign-language-inclusion', qualifyingFour('language').length ? true : completeSelection ? false : null, 'Vier Kurse in einer fortgeführten Fremdsprache; Fortführung gesondert bestätigen.', '§ 26 Abs. 6 Nr. 1a');
  add('arts-inclusion', familyCount('arts') >= 2 ? true : completeSelection ? false : null, 'Mindestens zwei Kurse in Kunst, Musik oder Darstellendem Spiel.', '§ 26 Abs. 6 Nr. 1b');
  add('social-inclusion', count(id => kind(id)?.[0] === 'II') >= 6 ? true : completeSelection ? false : null, 'Mindestens sechs Kurse im gesellschaftswissenschaftlichen Aufgabenfeld.', '§ 26 Abs. 6 Nr. 2');
  add('history-inclusion', subjectCount('history') >= 2 ? true : completeSelection ? false : null, 'Mindestens zwei Geschichtskurse.', '§ 26 Abs. 6 Nr. 2a');
  add('politics-inclusion', familyCount('politics') >= 2 ? true : familyCount('geography') >= 2 ? null : completeSelection ? false : null, 'Zwei Kurse Politik und Wirtschaft oder Wirtschaftswissenschaften; Geographie nur bei durchgängiger Belegung seit E1.', '§ 26 Abs. 6 Nr. 2b');
  const sciences = qualifyingFour('science');
  add('science-inclusion', sciences.length ? true : completeSelection ? false : null, 'Vier Kurse in einer Naturwissenschaft.', '§ 26 Abs. 6 Nr. 3b');
  const secondScience = sciences.length ? knownSubjects.some(subject => kind(subject.id)?.[1] === 'science' && subject.id !== sciences[0].id && subjectCount(subject.id) >= 2) : false;
  const secondLanguage = knownSubjects.filter(subject => kind(subject.id)?.[1] === 'language' && subjectCount(subject.id) >= 2).length >= 2;
  add('additional-subject-inclusion', secondScience || familyCount('informatics') >= 2 || secondLanguage ? true : completeSelection ? false : null, 'Zwei Kurse in einer weiteren Naturwissenschaft, Informatik oder einer zweiten Fremdsprache.', '§ 26 Abs. 6 Nr. 1c und 3c');
  add('sport-cap', subjectCount('sport') > 3 ? false : true, 'Sport höchstens drei Kurse, sofern Sport kein Prüfungsfach ist.', '§ 26 Abs. 4 und 5 Nr. 1');
  if (selectedIds.has('sport') && subjectCount('sport') === 4) checks[checks.length - 1].status = 'met';
  const examComplete = chosen.length === 5;
  add('mandatory-exam-subjects', selectedIds.has('german') && selectedIds.has('mathematics') && chosen.some(exam => ['language', 'science', 'informatics'].includes(kind(exam.subjectId)?.[1])) ? true : examComplete ? false : null, 'Deutsch und Mathematik sowie Fremdsprache, Naturwissenschaft oder Informatik müssen Prüfungsfächer sein.', '§ 24 Abs. 6');
  const examFields = new Set(chosen.map(exam => kind(exam.subjectId)?.[0]).filter(Boolean));
  add('exam-fields', examFields.size === 3 ? true : examComplete ? false : null, 'Die fünf Prüfungsfächer müssen alle drei Aufgabenfelder abdecken.', '§ 24 Abs. 1');
  const written = chosen.filter(exam => exam.slot <= 3), writtenFields = new Set(written.map(exam => kind(exam.subjectId)?.[0]).filter(Boolean));
  add('written-fields', writtenFields.size >= 2 ? true : written.length === 3 ? false : null, 'Die drei schriftlichen Prüfungen müssen mindestens zwei Aufgabenfelder abdecken.', '§ 24 Abs. 2');
  add('third-exam-eligibility', chosen.some(exam => exam.slot === 3 && ['sport', 'drama'].includes(exam.subjectId)) ? false : true, 'Sport und Darstellendes Spiel als GK sind nur als viertes oder fünftes Prüfungsfach zulässig.', '§ 24 Abs. 4');
  add('exam-modes', chosen.every(exam => exam.slot <= 3 ? exam.mode === 'written' : exam.slot === 4 ? exam.mode === 'oral' : ['oral', 'presentation'].includes(exam.mode)) ? true : false, 'Prüfungen 1–3 schriftlich, Prüfung 4 mündlich; Prüfung 5 mündlich oder Präsentation im modellierten Fall.', '§ 24 Abs. 1');
  const examKnown = examComplete && chosen.every(exam => exam.points !== null);
  add('exam-zero', chosen.some(exam => exam.points === 0) ? false : examKnown ? true : null, 'Kein endgültiges Prüfungsergebnis darf 0 Punkte haben; nötige Zusatzprüfungen gesondert beachten.', '§ 26 Abs. 13 Nr. 3–5');
  const passed = chosen.filter(exam => exam.points !== null && exam.points >= 5);
  add('exam-minimum-subjects', passed.length >= 3 && passed.some(exam => exam.slot <= 2) ? true : examKnown ? false : null, 'Mindestens drei Prüfungen mit 5 Punkten, darunter ein LK.', '§ 26 Abs. 13 Nr. 2');
  const lkPoints = included.filter(item => item.level === 'LK').reduce((sum, item) => sum + (item.points ?? 0) * 2, 0), gkPoints = included.filter(item => item.level === 'GK').reduce((sum, item) => sum + (item.points ?? 0), 0);
  add('block-minima', fullKnown && blockII.points !== null ? lkPoints >= 80 && gkPoints >= 120 && blockII.points >= 100 : null, `Mindestpunkte: LK 80, GK 120, Block II 100. Bekannt: LK ${lkPoints}, GK ${gkPoints}, Block II ${blockII.points ?? 'offen'}.`, '§ 26 Abs. 14');
  if (included.some(item => !kind(item.subjectId)) || chosen.some(exam => !kind(exam.subjectId))) pending.push('Aufgabenfeld und Fachgruppe eigener Fächer mit der Schule prüfen.');
  pending.push('Durchgehende Belegung der Prüfungsfächer in E-Phase und Q1–Q4 sowie Fortführung der Fremdsprache sind noch nicht vollständig dokumentiert (§ 24 Abs. 5, § 26 Abs. 6).');
  pending.push('Zweite-Fremdsprachenpflicht, Wiederholungen, besondere Lernleistung und schulisch genehmigte Sonderfälle müssen gesondert geprüft werden (§§ 14, 26).');
  const risks = checks.filter(check => check.status === 'risk');
  return { status: risks.length ? 'risk' : 'data-incomplete', sourcesVerified: true, ruleCoverage: ['§ 9 Abs. 2, 6–6b', '§ 24 Abs. 1–6', '§ 26 Abs. 1–6, 13–14', '§ 52', 'Anlage 10b'], complete: false, verifiedAt: HESSEN_VERIFIED_AT, checks, risks, pending, message: risks.length ? `${risks.length} Regelrisiken in deiner Auswahl. Offene Beleg- und Sonderfallangaben zusätzlich mit der Schule prüfen. Keine amtliche Zulassungs- oder Bestehensbestätigung.` : 'Geprüfte Standardregeln sind hinterlegt. Fehlende Beleg- und Sonderfallangaben verhindern noch eine vollständige Zulassungs- oder Bestehensprüfung.' };
}

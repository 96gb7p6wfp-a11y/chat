/** Programme goals and source-aware decisions. Unknown requirements remain unknown. */
import { calculateSubject } from './grades.js';

export const UNIVERSITY_PRESETS = [
  { id: 'ucl', name: 'University College London', shortName: 'UCL', country: 'UK', programme: 'Computer Science BSc', url: 'https://www.ucl.ac.uk/study/prospective-students/undergraduate/courses/computer-science-bsc' },
  { id: 'ucla', name: 'University of California, Los Angeles', shortName: 'UCLA', country: 'USA', programme: 'Computer Science', url: 'https://admission.ucla.edu/apply/international-applicants' },
  { id: 'berkeley', name: 'University of California, Berkeley', shortName: 'UC Berkeley', country: 'USA', programme: 'Computer Science', url: 'https://admissions.berkeley.edu/apply-to-berkeley/international-students/' },
];
export const REQUIREMENT_KINDS = ['qualification', 'overall', 'subject', 'english', 'sat', 'admissions-test', 'route', 'deadline', 'documents', 'cost', 'profile'];
export const REQUIREMENT_LABELS = { qualification: 'Qualifikation', overall: 'Abiturziel / Gesamtnote', subject: 'Fachvoraussetzung', english: 'Englischnachweis', sat: 'SAT / ACT', 'admissions-test': 'Weitere Zulassungstests', route: 'Bewerbungsweg', deadline: 'Bewerbungsfrist', documents: 'Unterlagen', cost: 'Gebühren & Kosten', profile: 'Fachliches Profil' };
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value, max = 300) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = (value, min, max, integer = false) => value !== '' && value !== null && value !== undefined && typeof value !== 'boolean' && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max && (!integer || Number.isInteger(Number(value))) ? Number(value) : null;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value ? value : '';
const safeURL = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
const sameText = (a, b) => text(a).toLocaleLowerCase('de-DE') === text(b).toLocaleLowerCase('de-DE');
const pointLabel = value => value.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const unique = (entries, convert, max = 100) => {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : []).slice(0, max).flatMap(entry => {
    const value = convert(object(entry));
    if (!value?.id || seen.has(value.id)) return [];
    seen.add(value.id); return [value];
  });
};

export function normalizeUniversityRequirement(value = {}) {
  const input = object(value);
  return { id: text(input.id, 150), kind: REQUIREMENT_KINDS.includes(input.kind) ? input.kind : 'profile', label: text(input.label, 200), text: text(input.text, 3000), subjectId: text(input.subjectId, 150), minPoints: number(input.minPoints, 0, 15), maxAbiturGrade: number(input.maxAbiturGrade, 1, 4), minimumBand: number(input.minimumBand, 0, 9),
    testPolicy: ['required', 'optional', 'not-used', 'not-required'].includes(input.testPolicy) ? input.testPolicy : 'unknown', sourceUrl: safeURL(input.sourceUrl), sourceInstitution: text(input.sourceInstitution), sourceProgramme: text(input.sourceProgramme), sourceScope: input.sourceScope === 'institution' ? 'institution' : 'programme', entryYear: number(input.entryYear, 2020, 2100, true), referenceYear: number(input.referenceYear, 2020, 2100, true), verifiedAt: date(input.verifiedAt), status: ['confirmed', 'not-published'].includes(input.status) ? input.status : 'provisional', manualChecked: input.manualChecked === true, manualNote: text(input.manualNote, 3000), deadlineDate: date(input.deadlineDate), evidenceScope: ['semester', 'abitur-exam'].includes(input.evidenceScope) ? input.evidenceScope : 'unknown', semester: ['Q1', 'Q2', 'Q3', 'Q4'].includes(input.semester) ? input.semester : '' };
}

export function normalizeUniversityGoals(value = {}) {
  const input = object(value);
  return { version: 1, goals: unique(input.goals, goal => {
    const id = text(goal.id, 150), name = text(goal.name), programme = text(goal.programme);
    if (!id || !name || !programme) return null;
    return { id, institutionId: ['ucl', 'ucla', 'berkeley'].includes(goal.institutionId) ? goal.institutionId : 'custom', name, country: ['UK', 'USA', 'Germany'].includes(goal.country) ? goal.country : 'Germany', programme, entryYear: number(goal.entryYear, 2020, 2100, true) ?? 2028, priority: ['high', 'low'].includes(goal.priority) ? goal.priority : 'normal', active: goal.active !== false, notes: text(goal.notes, 3000), sourceUrl: safeURL(goal.sourceUrl), requirements: unique(goal.requirements, normalizeUniversityRequirement, 100) };
  }) };
}

export function createUniversityGoal(presetId, options = {}) {
  const preset = UNIVERSITY_PRESETS.find(item => item.id === presetId);
  const name = preset?.name || text(options.name), programme = text(options.programme) || preset?.programme || '';
  const entryYear = number(options.entryYear, 2020, 2100, true) ?? 2028;
  const goal = { id: text(options.id, 150) || `university-goal-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`, institutionId: preset?.id || 'custom', name, country: options.country || preset?.country || 'Germany', programme, entryYear, priority: options.priority || 'normal', active: true, notes: '', sourceUrl: preset?.url || safeURL(options.sourceUrl), requirements: [] };
  goal.requirements = REQUIREMENT_KINDS.map(kind => normalizeUniversityRequirement({ id: `requirement-${kind}`, kind, label: REQUIREMENT_LABELS[kind], text: kind === 'sat' && ['ucla', 'berkeley'].includes(preset?.id) ? 'Nach deinem bisherigen Stand berücksichtigt die UC SAT/ACT nicht für Zulassungsentscheidungen. Für dein Eintrittsjahr noch offiziell prüfen.' : 'Offizielle Anforderung für dieses Programm und Eintrittsjahr noch prüfen.', sourceUrl: goal.sourceUrl, sourceInstitution: name, sourceProgramme: programme, entryYear, testPolicy: kind === 'sat' && ['ucla', 'berkeley'].includes(preset?.id) ? 'not-used' : 'unknown' }));
  return normalizeUniversityGoals({ goals: [goal] }).goals[0] || null;
}

export function saveUniversityGoal(data, value) {
  const current = normalizeUniversityGoals(data.universityGoals);
  const old = current.goals.find(goal => goal.id === value.id);
  let goal = normalizeUniversityGoals({ goals: [{ ...old, ...value }] }).goals[0];
  if (!goal) throw new TypeError('Trage Hochschule und Studiengang ein.');
  if (!old && !goal.requirements.length) goal = { ...goal, requirements: createUniversityGoal(goal.institutionId, goal)?.requirements || [] };
  const duplicate = current.goals.find(item => item.id !== goal.id && sameText(item.name, goal.name) && sameText(item.programme, goal.programme) && item.entryYear === goal.entryYear);
  if (duplicate) throw new TypeError('Dieses Studienziel für dieses Eintrittsjahr ist bereits gespeichert.');
  return { ...data, universityGoals: { version: 1, goals: old ? current.goals.map(item => item.id === goal.id ? goal : item) : [...current.goals, goal] } };
}
export function removeUniversityGoal(data, id) { return { ...data, universityGoals: { ...normalizeUniversityGoals(data.universityGoals), goals: normalizeUniversityGoals(data.universityGoals).goals.filter(goal => goal.id !== id) } }; }

function officialSource(goal, source) {
  let host; try { host = new URL(source).hostname; } catch { return false; }
  const under = domain => host === domain || host.endsWith(`.${domain}`);
  return goal.institutionId === 'ucl' ? under('ucl.ac.uk') : goal.institutionId === 'ucla' ? under('ucla.edu') || under('universityofcalifornia.edu') : goal.institutionId === 'berkeley' ? under('berkeley.edu') || under('universityofcalifornia.edu') : !!goal.sourceUrl && host === new URL(goal.sourceUrl).hostname;
}

/** User-recorded verification is explicit; a URL or checkbox alone proves nothing. */
export function getRequirementReliability(goal, requirement, today) {
  const sourceMatches = officialSource(goal, requirement.sourceUrl) && sameText(requirement.sourceInstitution, goal.name) && (requirement.sourceScope === 'institution' || sameText(requirement.sourceProgramme, goal.programme));
  const checked = sourceMatches && requirement.manualChecked && !!requirement.manualNote && !!requirement.verifiedAt && (!date(today) || requirement.verifiedAt <= today) && requirement.entryYear === goal.entryYear;
  const confirmed = checked && requirement.status === 'confirmed' && requirement.referenceYear === goal.entryYear;
  const unpublished = checked && requirement.status === 'not-published';
  return { status: confirmed ? 'confirmed' : unpublished ? 'not-published' : 'provisional', confirmed, sourceMatches, verifiedAt: checked ? requirement.verifiedAt : '', reason: confirmed ? `Von dir anhand der offiziellen Quelle für ${goal.entryYear} geprüft.` : unpublished ? `Von dir geprüft: für ${goal.entryYear} noch nicht veröffentlicht.` : requirement.referenceYear && requirement.referenceYear !== goal.entryYear ? `Referenz ${requirement.referenceYear}; für ${goal.entryYear} nicht bestätigt.` : `Für ${goal.entryYear} noch nicht anhand der offiziellen Quelle geprüft.` };
}

export function saveUniversityRequirement(data, goalId, value, today) {
  const goal = normalizeUniversityGoals(data.universityGoals).goals.find(item => item.id === goalId);
  if (!goal) throw new TypeError('Wähle zuerst ein Studienziel.');
  const requirement = normalizeUniversityRequirement(value);
  if (!requirement.id || !requirement.label) throw new TypeError('Ergänze die Bezeichnung der Anforderung.');
  if (requirement.status !== 'provisional' && getRequirementReliability(goal, requirement, today).status !== requirement.status) throw new TypeError('Für eine Bestätigung fehlen die passende offizielle Quelle, Eintritts-/Referenzjahr, Prüfdatum oder deine konkrete Quellennotiz.');
  return saveUniversityGoal(data, { ...goal, requirements: goal.requirements.some(item => item.id === requirement.id) ? goal.requirements.map(item => item.id === requirement.id ? requirement : item) : [...goal.requirements, requirement] });
}

export function compareUniversityRequirement(data, goal, requirement, today) {
  const reliability = getRequirementReliability(goal, requirement, today);
  const base = { ...requirement, reliability, confirmed: reliability.confirmed, current: null, status: 'information-pending', statusLabel: 'Information offen', nextAction: 'Offizielle Anforderung prüfen' };
  if (!reliability.confirmed) return { ...base, explanation: reliability.reason };
  if (requirement.kind === 'sat' && ['not-used', 'not-required'].includes(requirement.testPolicy)) return { ...base, status: 'not-applicable', statusLabel: 'Nicht erforderlich', explanation: 'Die von dir bestätigte Regel verlangt diesen Test für dieses Ziel nicht.', nextAction: 'Zeit für relevante Schul- und Sprachziele nutzen' };
  if (requirement.kind === 'subject' && requirement.minPoints !== null) {
    if (requirement.evidenceScope === 'unknown' || (requirement.evidenceScope === 'semester' && !requirement.semester)) return { ...base, status: 'not-assessed', statusLabel: 'Nachweisart klären', explanation: 'Die Schwelle ist erfasst. Ob sie für eine bestimmte Halbjahresnote oder die Abiturprüfung gilt, muss ausdrücklich zugeordnet werden.', nextAction: 'Verlangten Nachweis in der Quelle prüfen' };
    const results = (requirement.evidenceScope === 'abitur-exam' ? data.hessen?.examinationSubjects || [] : data.hessen?.semesterResults || []).filter(result => result.subjectId === requirement.subjectId && result.status === 'confirmed' && Number.isInteger(result.points) && result.points >= 0 && result.points <= 15 && (requirement.evidenceScope !== 'semester' || result.semester === requirement.semester));
    const latest = [...results].sort((a, b) => String(b.semester || '').localeCompare(String(a.semester || '')))[0];
    if (!latest) return { ...base, status: 'not-assessed', statusLabel: 'Noch nicht belegt', explanation: 'Einzelnoten und Ausgangsschätzungen sind kein bestätigter Halbjahresnachweis.', nextAction: 'Bestätigtes Halbjahresergebnis erfassen' };
    const met = latest.points >= requirement.minPoints;
    return { ...base, current: latest.points, status: met ? 'met' : 'improvement-needed', statusLabel: met ? 'Erfasster Wert erreicht die Schwelle' : 'Verbesserung nötig', explanation: `${latest.semester || 'Abiturprüfung'}: ${pointLabel(latest.points)} / 15; eingetragene Schwelle ${pointLabel(requirement.minPoints)}. Andere Programmvorgaben bleiben separat zu prüfen.`, nextAction: met ? 'Weitere Anforderungen prüfen' : 'Gezielte Fachübung und Halbjahresszenario prüfen' };
  }
  if (requirement.kind === 'english' && requirement.minimumBand !== null) {
    const official = (data.ielts?.scores || []).filter(score => (score.source === 'official' || score.type === 'official') && date(score.date) && (!date(today) || score.date <= today));
    const latest = [...official].filter(score => typeof score.overall === 'number').sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    if (latest) { const met = latest.overall >= requirement.minimumBand; return { ...base, current: latest.overall, status: met ? 'met' : 'improvement-needed', statusLabel: met ? 'Erfasster Overall-Wert erreicht die Schwelle' : 'Verbesserung nötig', explanation: 'Nur Overall verglichen. Einzelbandvorgaben, Gültigkeit und akzeptierte Testform gesondert prüfen.', nextAction: met ? 'Einzelbandvorgaben und Gültigkeit prüfen' : 'Schwächste belegte IELTS-Fähigkeit trainieren' }; }
  }
  return { ...base, status: 'not-assessed', statusLabel: 'Noch nicht abgeglichen', explanation: 'Quelle erfasst. Für eine belastbare Erfüllung fehlen geeignete Nachweise oder genaue Anwendungsbedingungen.', nextAction: requirement.kind === 'overall' ? 'Abiturszenario mit bestätigtem Hochschulziel vergleichen' : 'Benötigten Nachweis ergänzen' };
}

const priorityOrder = { high: 0, normal: 1, low: 2 };
const activeGoals = data => normalizeUniversityGoals(data.universityGoals).goals.filter(goal => goal.active).sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.id.localeCompare(b.id));
const computerScience = goal => /computer science|informatik|\bai\b|artificial intelligence|data science|computing|wirtschaftsinformatik/i.test(goal.programme);

export function getUniversitySubjectBoost(data, subjectId, today) {
  const goals = activeGoals(data);
  const linked = goals.filter(goal => computerScience(goal) && subjectId === 'mathematics');
  const confirmed = goals.flatMap(goal => goal.requirements.filter(requirement => requirement.kind === 'subject' && requirement.subjectId === subjectId && requirement.minPoints !== null && getRequirementReliability(goal, requirement, today).confirmed).map(requirement => ({ goal, requirement })));
  const highest = confirmed.sort((a, b) => b.requirement.minPoints - a.requirement.minPoints)[0];
  return { boost: highest ? highest.goal.priority === 'high' ? 12 : 9 : linked.length ? linked.some(goal => goal.priority === 'high') ? 8 : 5 : 0, goalIds: [...new Set([...linked.map(goal => goal.id), ...confirmed.map(item => item.goal.id)])], targetPoints: highest?.requirement.minPoints ?? null, reason: highest ? `${highest.goal.name} · ${highest.goal.programme}: von dir quellengeprüftes Fachziel ${pointLabel(highest.requirement.minPoints)} Punkte.` : linked.length ? 'Mathematik unterstützt dein gewähltes Informatikziel. Eine konkrete Hochschulvorgabe ist damit noch nicht bestätigt.' : '' };
}

export function getUniversityGoalSummary(data, today) {
  const goals = activeGoals(data).map(goal => ({ ...goal, label: `${UNIVERSITY_PRESETS.find(item => item.id === goal.institutionId)?.shortName || goal.name} · ${goal.programme}`, comparisons: goal.requirements.map(requirement => compareUniversityRequirement(data, goal, requirement, today)) }));
  const primary = goals[0] || null;
  if (!primary) return { goals, primary: null, destination: 'Dein Studienziel', gap: 'Noch kein Studiengang ausgewählt.', nextAction: { type: 'goal-setup', title: 'Ein konkretes Studienziel wählen', why: 'Mit Studiengang und Eintrittsjahr lässt sich prüfen, welche Anforderungen wirklich zählen.', minutes: 10, subjectId: '' } };
  const academic = computerScience(primary) ? calculateSubject(data, 'mathematics') : null;
  const relevant = primary.comparisons.find(item => item.status === 'improvement-needed');
  const target = relevant?.minPoints ?? academic?.target ?? null;
  const actual = relevant?.current ?? (academic?.source === 'assessments' ? academic.average : null);
  const subjectGap = actual !== null && target !== null && actual < target;
  const nextSubjectId = relevant?.kind === 'english' ? 'english' : relevant?.subjectId || 'mathematics';
  const nextSubject = (data.subjects || []).find(item => item.id === nextSubjectId);
  const subjectName = { mathematics: 'Mathematik', english: 'Englisch', german: 'Deutsch', physics: 'Physik' }[nextSubjectId] || nextSubject?.name || 'Fach';
  const nextAction = relevant || subjectGap ? { type: 'academic', subjectId: nextSubjectId, title: `${subjectName}: eine gezielte Aufgabe lösen`, why: relevant ? relevant.explanation : 'Dein berechneter Mathematikstand liegt unter deinem eigenen Fachziel. Das ist noch keine bestätigte Zulassungslücke.', minutes: 25 } : { type: 'requirements', subjectId: '', title: `${primary.name === 'University College London' ? 'UCL' : primary.name}: Anforderung für ${primary.entryYear} prüfen`, why: 'Bestätige zuerst, welche Noten und Tests dein konkreter Studiengang tatsächlich verlangt.', minutes: 10 };
  return { goals, primary, destination: primary.label, gap: relevant ? `${relevant.label}: ${relevant.statusLabel.toLocaleLowerCase('de-DE')}.` : subjectGap ? `Mathematik: ${pointLabel(actual)} → eigenes Ziel ${pointLabel(target)} Punkte.` : 'Anforderungen und geeignete Nachweise noch abgleichen.', nextAction, abiturTarget: getVerifiedUniversityAbiturTarget(data, today), deadlines: getUniversityGoalDeadlines(data, today) };
}

/** An explicit apply action is required elsewhere; never overwrite the learner's goal. */
export function getVerifiedUniversityAbiturTarget(data, today) {
  const matches = activeGoals(data).flatMap(goal => goal.requirements.filter(requirement => requirement.kind === 'overall' && requirement.maxAbiturGrade !== null && getRequirementReliability(goal, requirement, today).confirmed).map(requirement => ({ grade: requirement.maxAbiturGrade, goalId: goal.id, label: `${UNIVERSITY_PRESETS.find(item => item.id === goal.institutionId)?.shortName || goal.name} · ${goal.programme}`, requirementId: requirement.id, sourceUrl: requirement.sourceUrl, entryYear: goal.entryYear, verifiedAt: requirement.verifiedAt })));
  return matches.sort((a, b) => a.grade - b.grade)[0] || null;
}

export function getUniversityGoalDeadlines(data, today) {
  return activeGoals(data).flatMap(goal => goal.requirements.filter(requirement => requirement.kind === 'deadline' && requirement.deadlineDate && getRequirementReliability(goal, requirement, today).confirmed).map(requirement => ({ id: `university-goal:${goal.id}:${requirement.id}`, date: requirement.deadlineDate, title: `${UNIVERSITY_PRESETS.find(item => item.id === goal.institutionId)?.shortName || goal.name} · ${requirement.label}`, subjectId: '', source: 'university', goalId: goal.id, sourceUrl: requirement.sourceUrl, daysUntil: date(today) ? Math.round((Date.parse(`${requirement.deadlineDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000) : null, dateVerified: true })));
}

/** Programme-specific evidence steps, not promised admission outcomes. */
export function getUniversityGoalRoadmap(data, goalId, today) {
  const goal=activeGoals(data).find(item=>item.id===goalId);
  if(!goal)return null;
  const stages=[['academic','Schulische Voraussetzungen',['qualification','overall','subject']],['tests','Sprache & Zulassungstests',['english','sat','admissions-test']],['evidence','Fachliches Profil & Nachweise',['profile','documents']],['application','Bewerbung vorbereiten',['route','deadline','cost']]];
  return {goal,stages:stages.map(([id,title,kinds])=>{const requirements=goal.requirements.filter(requirement=>kinds.includes(requirement.kind)).map(requirement=>compareUniversityRequirement(data,goal,requirement,today));return {id,title,requirements,checked:requirements.filter(requirement=>requirement.reliability.confirmed).length,total:requirements.length,next:requirements.find(requirement=>!['met','not-applicable'].includes(requirement.status))||null};})};
}

export function getSATRelevance(data, today) {
  const goals = activeGoals(data);
  const items = goals.map(goal => {
    const requirement = goal.requirements.find(item => item.kind === 'sat');
    const reliability = requirement ? getRequirementReliability(goal, requirement, today) : { confirmed: false, reason: 'SAT-Regel für dieses Programm noch prüfen.' };
    const policy = requirement?.testPolicy || 'unknown';
    const currentUCPolicy = ['ucla', 'berkeley'].includes(goal.institutionId) && policy === 'not-used';
    const status = reliability.confirmed ? ['not-used', 'not-required'].includes(policy) ? 'not-needed' : policy === 'required' ? 'required' : policy === 'optional' ? 'optional' : 'unknown' : currentUCPolicy ? 'not-needed' : 'unknown';
    return { id: goal.id, label: `${UNIVERSITY_PRESETS.find(item => item.id === goal.institutionId)?.shortName || goal.name} · ${goal.programme}`, status, reason: reliability.confirmed ? requirement.text : currentUCPolicy ? `Bisheriger Stand: UC berücksichtigt SAT/ACT nicht für die Zulassung. Für ${goal.entryYear} noch zu prüfen.` : 'Keine bestätigte SAT-Pflicht. Fachspezifische Zulassungstests getrennt prüfen.', sourceUrl: requirement?.sourceUrl || goal.sourceUrl, provisional: !reliability.confirmed };
  });
  const recommendPreparation = items.some(item => item.status === 'required' && !item.provisional);
  const allNotNeeded = items.length > 0 && items.every(item => item.status === 'not-needed');
  const decision = recommendPreparation ? 'required' : allNotNeeded ? 'not-needed' : items.some(item => item.status === 'optional' && !item.provisional) ? 'optional' : 'verify';
  const needsVerification = !items.length || items.some(item => item.provisional || item.status === 'unknown');
  const headline = recommendPreparation ? 'Mindestens ein bestätigtes Studienziel verlangt SAT.' : allNotNeeded ? 'SAT ist für deine aktuellen UC-Ziele kein Schwerpunkt.' : items.length ? 'SAT nicht automatisch einplanen. Zuerst die konkrete Studiengangsregel prüfen.' : 'Wähle zuerst deine Studienziele. SAT ist kein pauschaler Zulassungsschritt.';
  return { items, recommendPreparation, shouldPrepare: recommendPreparation, decision, status: decision, headline, needsVerification };
}

export function getUniversityGoalCandidates(data, today) {
  const summary = getUniversityGoalSummary(data, today);
  if (!summary.primary) return [];
  const deadline = getUniversityGoalDeadlines(data, today).filter(item => item.daysUntil >= 0 && item.daysUntil <= 30).sort((a, b) => a.daysUntil - b.daysUntil)[0];
  if (summary.nextAction.type === 'academic' && !deadline) return [];
  const goal = deadline ? activeGoals(data).find(goal => goal.id === deadline.goalId) || summary.primary : summary.primary;
  const checked = goal.requirements.every(requirement => getRequirementReliability(goal, requirement, today).confirmed);
  if (checked && !deadline) return [];
  const missing = goal.requirements.find(requirement => !getRequirementReliability(goal, requirement, today).confirmed);
  return [{ key: `university-goal-${goal.id}-${missing?.id || 'requirements'}`, title: `${UNIVERSITY_PRESETS.find(item => item.id === goal.institutionId)?.shortName || goal.name}: ${deadline ? 'Unterlagen für die Bewerbungsfrist prüfen' : 'eine Studienanforderung klären'}`, category: 'university', minutes: 10, score: deadline ? deadline.daysUntil <= 7 ? 150 : 100 : goal.priority === 'high' ? 55 : 45, priority: deadline?.daysUntil <= 7 ? 'high' : 'medium', reason: deadline ? `Bestätigte Bewerbungsfrist in ${deadline.daysUntil} Tagen. Prüfe den nächsten erforderlichen Schritt.` : `Für ${goal.programme} · Eintritt ${goal.entryYear} fehlen noch bestätigte Angaben. So vermeidest du unnötige Testvorbereitung.`, goalId: 'university', subjectId: '', learningTopic: '', objective: 'Eine offizielle Anforderung mit Eintrittsjahr und Quelle speichern.', expectedResult: 'Ein belegbarer nächster Bewerbungsschritt statt einer unbegründeten Annahme.', steps: ['Öffne Zukunft → Studienziele und die offizielle Programmseite.', 'Prüfe genau eine Anforderung für dein Eintrittsjahr.', 'Speichere den Wortlaut, das Bezugsjahr und das Prüfdatum.'], resource: goal.sourceUrl, universityGoalId: goal.id }];
}

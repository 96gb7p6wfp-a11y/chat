/** Backward scenarios never turn assumptions into school results. */
import { calculateAbitur, HESSEN_SEMESTERS, HESSEN_GRADE_CONVERSION, getAbiturTargetPoints, getAbiturGrade } from './hessen.js';
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const number = (value, min, max) => value !== '' && value !== null && value !== undefined && typeof value !== 'boolean' && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const points = value => number(value, 0, 15);
const clean = value => typeof value === 'string' ? value.trim().slice(0, 150) : '';
export const ABITUR_GRADE_REFERENCE = { ...HESSEN_GRADE_CONVERSION, applicableFrom: '2026-08-01', note: 'Amtliche 900-Punkte-Umrechnung. Die Note allein bestätigt weder eine zulässige Einbringung noch das Bestehen.' };
export const ABITUR_GRADE_CHOICES = [1, 1.3, 1.5, 1.7, 2];
export function gradeTargetPoints(grade) {
  const value = number(grade, 1, 4);
  if (value === null || Math.abs(value * 10 - Math.round(value * 10)) > 1e-8) return null;
  return getAbiturTargetPoints(value);
}
export function pointsToReferenceGrade(value) {
  const total = number(value, 300, 900);
  if (total === null || !Number.isInteger(total)) return null;
  return getAbiturGrade(total);
}
export function normalizeAbiturTarget(value = {}) {
  const input = object(value), seenResults = new Set(), seenExams = new Set();
  const grade = number(input.targetGrade, 1, 4);
  return { mode: input.mode === 'points' ? 'points' : 'grade', targetGrade: grade !== null && Math.abs(grade * 10 - Math.round(grade * 10)) < 1e-8 ? grade : null,
    targetPoints: number(input.targetPoints, 0, 900), allowReferenceConversion: input.allowReferenceConversion === true, useSavedScenarios: input.useSavedScenarios !== false,
    examAverage: points(input.examAverage), semesterAverage: points(input.semesterAverage),
    semesterOverrides: (Array.isArray(input.semesterOverrides) ? input.semesterOverrides : []).slice(0, 100).flatMap(raw => { const entry = object(raw), resultId = clean(entry.resultId); if (!resultId || seenResults.has(resultId)) return []; seenResults.add(resultId); return [{ resultId, points: points(entry.points) }]; }),
    examOverrides: (Array.isArray(input.examOverrides) ? input.examOverrides : []).slice(0, 5).flatMap(raw => { const entry = object(raw), slot = number(entry.slot, 1, 5); if (!Number.isInteger(slot) || seenExams.has(slot)) return []; seenExams.add(slot); return [{ slot, points: points(entry.points) }]; }) };
}
const sum = (entries, fn) => entries.reduce((total, entry) => total + fn(entry), 0);
function requirement(target, fixed, weight) {
  if (target === null) return { status: 'missing-data', requiredAverage: null, minimumWholePoints: null, achievable: null };
  if (!weight) return { status: fixed + 1e-8 >= target ? 'already-met' : 'impossible', requiredAverage: null, minimumWholePoints: null, achievable: fixed + 1e-8 >= target, fixedPoints: fixed, remainingWeight: weight };
  const requiredAverage = Math.max(0, (target - fixed) / weight);
  return { status: requiredAverage <= 15 + 1e-8 ? 'achievable' : 'impossible', requiredAverage, minimumWholePoints: Math.ceil(requiredAverage - 1e-8), achievable: requiredAverage <= 15 + 1e-8, fixedPoints: fixed, remainingWeight: weight };
}
export function getAbiturTargetPlan(data = {}) {
  const config = normalizeAbiturTarget(data.abiturTarget), analysis = calculateAbitur(data);
  const targetPoints = config.mode === 'points' ? config.targetPoints : config.allowReferenceConversion || ABITUR_GRADE_REFERENCE.status === 'confirmed' ? gradeTargetPoints(config.targetGrade) : null;
  const target = { grade: config.mode === 'grade' ? config.targetGrade : null, points: targetPoints, conversionStatus: ABITUR_GRADE_REFERENCE.status, source: ABITUR_GRADE_REFERENCE };
  const structuralCodes = new Set(['unknown-subject', 'duplicate-semester', 'lk-count', 'gk-count', 'lk-subject-count', 'lk-semester-missing', 'unknown-exam-subject', 'duplicate-exam-subject', 'lk-exam-subject', 'exam-subjects-open']);
  const issues = analysis.issues.filter(issue => structuralCodes.has(issue.code));
  const selectionComplete = issues.length === 0;
  const subjects = new Map((data.subjects || []).map(subject => [subject.id, subject]));
  const semesters = analysis.blockI.included.map(entry => {
    const override = config.semesterOverrides.find(item => item.resultId === entry.id);
    const value = override ? override.points : entry.status === 'confirmed' || config.useSavedScenarios ? entry.points : null;
    return { ...entry, originalPoints: entry.points, value, overridden: !!override, actualConfirmed: entry.status === 'confirmed' && entry.points !== null && !override };
  });
  const exams = analysis.config.examinationSubjects.filter(entry => entry.subjectId).map(entry => {
    const override = config.examOverrides.find(item => item.slot === entry.slot);
    const value = override ? override.points : entry.status === 'confirmed' || config.useSavedScenarios ? entry.points : null;
    return { ...entry, factor: 4, originalPoints: entry.points, value, overridden: !!override, actualConfirmed: entry.status === 'confirmed' && entry.points !== null && !override };
  });
  const knownSemesters = semesters.filter(entry => entry.value !== null), unknownSemesters = semesters.filter(entry => entry.value === null);
  const knownExams = exams.filter(entry => entry.value !== null), unknownExams = exams.filter(entry => entry.value === null);
  const fixedSemesterPoints = sum(knownSemesters, entry => entry.value * entry.factor), fixedExamPoints = sum(knownExams, entry => entry.value * 4);
  const semesterWeight = sum(unknownSemesters, entry => entry.factor), examWeight = unknownExams.length * 4;
  const assumedSemesterPoints = config.semesterAverage === null && semesterWeight ? null : fixedSemesterPoints + semesterWeight * (config.semesterAverage ?? 0);
  const assumedExamPoints = config.examAverage === null && examWeight ? null : fixedExamPoints + examWeight * (config.examAverage ?? 0);
  const empty = { status: 'missing-data', requiredAverage: null, minimumWholePoints: null, achievable: null };
  const requiredSemesters = selectionComplete && assumedExamPoints !== null ? requirement(targetPoints, fixedSemesterPoints + assumedExamPoints, semesterWeight) : { ...empty, explanation: !selectionComplete ? 'Wähle zuerst deine vollständige Einbringung und fünf Prüfungsfächer.' : 'Lege eine ausdrückliche Annahme für die offenen Abiturprüfungen fest.' };
  const requiredExams = selectionComplete && assumedSemesterPoints !== null ? requirement(targetPoints, assumedSemesterPoints + fixedExamPoints, examWeight) : { ...empty, explanation: !selectionComplete ? 'Deine Einbringung oder Prüfungsfachwahl ist noch unvollständig.' : 'Lege eine Annahme für die offenen Halbjahre fest.' };
  const combined = selectionComplete ? requirement(targetPoints, fixedSemesterPoints + fixedExamPoints, semesterWeight + examWeight) : empty;
  const maxPoints = selectionComplete ? fixedSemesterPoints + fixedExamPoints + (semesterWeight + examWeight) * 15 : null;
  const projectedTotal = selectionComplete && assumedSemesterPoints !== null && assumedExamPoints !== null ? assumedSemesterPoints + assumedExamPoints : null;
  const timeline = HESSEN_SEMESTERS.map(semester => {
    const entries = semesters.filter(entry => entry.semester === semester), open = entries.filter(entry => entry.value === null);
    const weight = sum(open, entry => entry.factor), fixed = sum(entries.filter(entry => entry.value !== null), entry => entry.value * entry.factor);
    return { semester, includedCount: entries.length, confirmedCount: entries.filter(entry => entry.actualConfirmed).length, openCount: open.length, remainingWeight: weight, fixedPoints: fixed, scenarioPoints: config.semesterAverage !== null ? fixed + weight * config.semesterAverage : weight ? null : fixed,
      requiredContribution: requiredSemesters.requiredAverage !== null ? weight * requiredSemesters.requiredAverage : null };
  });
  const subjectScenarios = [...subjects.values()].flatMap(subject => {
    const own = unknownSemesters.filter(entry => entry.subjectId === subject.id);
    if (!own.length) return [];
    const others = unknownSemesters.filter(entry => entry.subjectId !== subject.id);
    const otherValues = others.map(entry => ({ ...entry, assumed: points(subjects.get(entry.subjectId)?.target) }));
    const ownWeight = sum(own, entry => entry.factor);
    const result = selectionComplete && assumedExamPoints !== null && otherValues.every(entry => entry.assumed !== null) ? requirement(targetPoints, fixedSemesterPoints + assumedExamPoints + sum(otherValues, entry => entry.assumed * entry.factor), ownWeight) : empty;
    return [{ subjectId: subject.id, name: subject.name, level: subject.level, count: own.length, remainingWeight: ownWeight, enteredTarget: points(subject.target), ...result, assumption: 'Alle anderen offenen Halbjahre erreichen die von dir eingetragenen Fachziele; die Prüfungsannahme bleibt fest.' }];
  });
  const status = !selectionComplete ? 'selection-incomplete' : targetPoints === null ? 'target-incomplete' : maxPoints < targetPoints - 1e-8 ? 'impossible' : 'scenario';
  return { config, target, status, selectionComplete, issues, semesters, exams, timeline, subjectScenarios, fixedSemesterPoints, fixedExamPoints, semesterWeight, examWeight,
    confirmedSemesterPoints: sum(semesters.filter(entry => entry.actualConfirmed), entry => entry.value * entry.factor), confirmedExamPoints: sum(exams.filter(entry => entry.actualConfirmed), entry => entry.value * 4),
    requiredSemesters, requiredExams, combined, maxPoints, projected: { blockI: selectionComplete ? assumedSemesterPoints : null, blockII: selectionComplete ? assumedExamPoints : null, total: projectedTotal, grade: projectedTotal !== null && (config.allowReferenceConversion || ABITUR_GRADE_REFERENCE.status === 'confirmed') ? pointsToReferenceGrade(projectedTotal) : null },
    regulatoryValidation: analysis.regulatoryValidation, explanation: status === 'selection-incomplete' ? 'Wähle 8 LK-Halbjahre, 24 GK-Halbjahre und fünf unterschiedliche Prüfungsfächer. Fehlende Pflichtzuordnungen werden nicht geraten.' : status === 'target-incomplete' ? 'Wähle deine gewünschte Abiturnote oder ein Gesamtpunkte-Ziel.' : status === 'impossible' ? 'Das Ziel ist selbst mit 15 Punkten in allen offenen Ergebnissen in diesem Szenario nicht mehr erreichbar.' : 'Die Rechnung zeigt Möglichkeiten unter deinen Annahmen, keine Vorhersage und keine Bestehensbestätigung.' };
}

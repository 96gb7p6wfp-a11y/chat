/**
 * Explicit semester scenarios. These calculations are not a mechanical official
 * semester grade and never convert an individual assessment into an Abitur result.
 * School-specific weights must be supplied by the learner/teacher.
 */
import { SEMESTERS } from './grades.js';

const numeric = value => value !== '' && value !== null && value !== undefined && typeof value !== 'boolean' && Number.isFinite(Number(value)) ? Number(value) : null;
const bounded = (value, min, max) => { const number = numeric(value); return number !== null && number >= min && number <= max ? number : null; };
const points = value => bounded(value, 0, 15);
const weight = value => { const number = bounded(value, 0, 100000); return number !== null && number > 0 ? number : null; };
const short = value => typeof value === 'string' ? value.trim().slice(0, 150) : '';
const dateIsValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T12:00:00Z`).getTime()) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const display = value => value.toLocaleString('de-DE', { maximumFractionDigits: 1 });

export function normalizeSemesterConfig(value = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const seen = new Set();
  const futureWritten = (Array.isArray(input.futureWritten) ? input.futureWritten : []).slice(0, 8).map((entry, index) => {
    const raw = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    let id = short(raw.id);
    if (!id || seen.has(id)) id = `semester-future-${index}`;
    seen.add(id);
    return { id, points: points(raw.points), weight: weight(raw.weight) };
  });
  const rangeMin = points(input.continuousRange?.min);
  const rangeMax = points(input.continuousRange?.max);
  return {
    subjectId: short(input.subjectId),
    semester: SEMESTERS.includes(input.semester) ? input.semester : 'Q1',
    writtenShare: bounded(input.writtenShare, 0, 1),
    continuousPoints: points(input.continuousPoints),
    continuousStatus: input.continuousStatus === 'confirmed' ? 'confirmed' : 'estimate',
    teacherConfirmed: input.teacherConfirmed === true,
    writtenMode: ['equal', 'weighted'].includes(input.writtenMode) ? input.writtenMode : 'unset',
    futureWritten,
    replacementGradeIds: [...new Set((Array.isArray(input.replacementGradeIds) ? input.replacementGradeIds : []).filter(value => typeof value === 'string' && value.trim()).map(short))].slice(0, 100),
    continuousRange: { min: rangeMin, max: rangeMax },
  };
}

export function normalizeSemesterGrading(value = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const configs = new Map();
  for (const value of (Array.isArray(input.configs) ? input.configs : []).slice(0, 500)) {
    const config = normalizeSemesterConfig(value);
    if (config.subjectId) configs.set(`${config.subjectId}:${config.semester}`, config);
  }
  return { configs: [...configs.values()] };
}

export function saveSemesterConfig(data, config) {
  const next = normalizeSemesterConfig(config);
  const current = normalizeSemesterGrading(data.semesterGrading);
  return { ...data, semesterGrading: normalizeSemesterGrading({ configs: [...current.configs.filter(entry => entry.subjectId !== next.subjectId || entry.semester !== next.semester), next] }) };
}

function solve(constant, coefficient, target) {
  if (target === null || !Number.isFinite(constant) || !Number.isFinite(coefficient)) return { status: 'missing-data', requiredScore: null, minimumWholePoints: null, achievable: null };
  const minPossible = constant;
  const maxPossible = constant + coefficient * 15;
  if (coefficient === 0) return { status: constant + 1e-9 >= target ? 'already-met' : 'impossible', requiredScore: null, minimumWholePoints: null, achievable: constant + 1e-9 >= target, minPossible, maxPossible, constant, coefficient };
  const requiredScore = Math.max(0, (target - constant) / coefficient);
  const achievable = requiredScore <= 15 + 1e-9;
  return { status: achievable ? 'achievable' : 'impossible', requiredScore, minimumWholePoints: Math.ceil(requiredScore - 1e-9), achievable, minPossible, maxPossible, constant, coefficient };
}

/** Only actual dated semester assessments enter the written pool. */
export function getSemesterEstimate(data, subjectId, semester = 'Q1') {
  const subject = (data.subjects || []).find(entry => entry.id === subjectId);
  const scope = SEMESTERS.includes(semester) ? semester : 'Q1';
  const config = normalizeSemesterGrading(data.semesterGrading).configs.find(entry => entry.subjectId === subjectId && entry.semester === scope) || normalizeSemesterConfig({ subjectId, semester: scope });
  const target = points(subject?.target);
  const records = (data.grades || []).filter(record => record.subjectId === subjectId && record.semester === scope && dateIsValid(record.date) && points(record.points) !== null);
  const writtenRecords = records.filter(record => record.type === 'written' || config.replacementGradeIds.includes(record.id));
  const otherRecords = records.filter(record => !writtenRecords.includes(record));
  const missing = [];
  if (config.writtenShare === null) missing.push('Gewicht des Klausurbereichs');
  if (config.writtenShare !== 0 && config.writtenMode === 'unset') missing.push('Gewichtung der Klausuren untereinander');
  const weighted = config.writtenMode === 'weighted';
  const known = writtenRecords.map(record => ({ ...record, points: Number(record.points), scenarioWeight: weighted ? weight(record.weight) : 1 }));
  const future = config.futureWritten.map(record => ({ ...record, scenarioWeight: weighted ? record.weight : 1 }));
  if (config.writtenShare !== 0 && weighted && [...known, ...future].some(record => record.scenarioWeight === null)) missing.push('Einzelgewicht jeder Klausur');
  const all = [...known, ...future];
  if (config.writtenShare !== 0 && !all.length) missing.push('Klausurergebnis oder geplante Klausur');
  const totalWeight = all.reduce((sum, record) => sum + (record.scenarioWeight || 0), 0);
  const knownWeight = known.reduce((sum, record) => sum + (record.scenarioWeight || 0), 0);
  const knownSum = known.reduce((sum, record) => sum + record.points * (record.scenarioWeight || 0), 0);
  const knownWrittenAverage = knownWeight && config.writtenMode !== 'unset' && !known.some(record => record.scenarioWeight === null) ? knownSum / knownWeight : null;
  const base = { subject, subjectId, semester: scope, config, target, records, writtenRecords, otherRecords, knownWrittenAverage, source: 'selected-scenario', officialSemesterGrade: false };
  const missingResult = explanation => ({ status: 'missing-data', requiredScore: null, minimumWholePoints: null, achievable: null, explanation });
  const noCalculation = explanation => ({ ...base, status: 'missing-data', missing, estimatedPoints: null, projectedWrittenAverage: null, requiredNext: missingResult(explanation), requiredRemaining: missingResult(explanation), requiredContinuous: missingResult(explanation), nextRange: null, outcomeRange: null, explanation });
  if (missing.length) return noCalculation(`Ergänze: ${missing.join(', ')}. Es wird keine Gewichtung angenommen.`);
  if (target === null) return noCalculation('Lege zuerst dein Fachziel fest.');

  const share = config.writtenShare;
  const denominator = share === 0 ? 1 : totalWeight;
  const weightedValue = record => record.points * record.scenarioWeight;
  const fixedFuture = future.filter(record => record.points !== null);
  const unknownFuture = future.filter(record => record.points === null);
  const fixedWrittenSum = knownSum + fixedFuture.reduce((sum, record) => sum + weightedValue(record), 0);
  const unknownWeight = unknownFuture.reduce((sum, record) => sum + record.scenarioWeight, 0);
  // A zero share removes the written pool's influence, not its denominator.
  // Its descriptive average still needs explicit, complete internal weights.
  const writtenWeightsComplete = config.writtenMode !== 'unset' && all.every(record => record.scenarioWeight !== null);
  const projectedWrittenAverage = unknownFuture.length || !all.length || !totalWeight || !writtenWeightsComplete ? null : fixedWrittenSum / totalWeight;
  const continuousKnown = config.continuousPoints !== null || share === 1;
  const continuous = config.continuousPoints ?? 0;
  const fixedContribution = share * fixedWrittenSum / denominator + (1 - share) * continuous;
  const estimatedPoints = continuousKnown && (!unknownFuture.length || share === 0) ? fixedContribution : null;
  const requiredRemaining = continuousKnown && unknownFuture.length ? { ...solve(fixedContribution, share * unknownWeight / denominator, target), explanation: 'Gesucht ist derselbe Mittelwert für alle noch unbewerteten Klausuren. Bereits angenommene Ergebnisse bleiben fest.' } : missingResult(!continuousKnown ? 'Für einen eindeutigen Klausurwert fehlt die angenommene Mitarbeit.' : 'Markiere mindestens eine zukünftige Klausur als offen.');

  const next = future[0];
  const laterUnknown = future.slice(1).filter(record => record.points === null);
  let requiredNext = missingResult('Trage die nächste Klausur als Szenario ein.');
  let nextRange = null;
  if (next) {
    const laterFixedSum = future.slice(1).filter(record => record.points !== null).reduce((sum, record) => sum + weightedValue(record), 0);
    const laterUnknownWeight = laterUnknown.reduce((sum, record) => sum + record.scenarioWeight, 0);
    const nextCoefficient = share * next.scenarioWeight / denominator;
    const nextConstant = share * (knownSum + laterFixedSum) / denominator + (1 - share) * continuous;
    if (continuousKnown && !laterUnknown.length) requiredNext = { ...solve(nextConstant, nextCoefficient, target), explanation: 'Nur die nächste Klausur wird gesucht. Die Mitarbeit und spätere Klausurergebnisse bleiben deine festen Annahmen.' };
    else requiredNext = missingResult(!continuousKnown ? 'Für eine eindeutige nächste Note fehlt die Mitarbeit. Lege einen Wert oder deinen eigenen Szenariobereich fest.' : 'Für eine eindeutige nächste Note fehlen angenommene spätere Klausurergebnisse. Der nötige Mittelwert aller offenen Klausuren ist separat berechenbar.');
    const range = config.continuousRange;
    const continuousLow = continuousKnown ? continuous : range.min;
    const continuousHigh = continuousKnown ? continuous : range.max;
    if (nextCoefficient > 0 && continuousLow !== null && continuousHigh !== null && continuousLow <= continuousHigh && (!continuousKnown || laterUnknown.length)) {
      const minimumConstant = share * (knownSum + laterFixedSum) / denominator + (1 - share) * continuousLow;
      const maximumConstant = share * (knownSum + laterFixedSum + laterUnknownWeight * 15) / denominator + (1 - share) * continuousHigh;
      const easiest = solve(maximumConstant, nextCoefficient, target);
      const hardest = solve(minimumConstant, nextCoefficient, target);
      nextRange = { minRequired: easiest.requiredScore, maxRequired: hardest.requiredScore, minWholePoints: easiest.minimumWholePoints, maxWholePoints: hardest.minimumWholePoints, continuousMin: continuousLow, continuousMax: continuousHigh, laterScoresMin: 0, laterScoresMax: 15, explanation: laterUnknown.length ? 'Szenariospanne: Spätere offene Klausuren werden zwischen 0 und 15 angesetzt. Das ist keine Leistungsprognose.' : 'Szenariospanne für deinen eingegebenen Mitarbeitbereich, keine garantierte Kursnote.' };
    }
  }
  const allFutureFixed = future.every(record => record.points !== null);
  const requiredContinuous = allFutureFixed || share === 0 ? { ...solve(share * fixedWrittenSum / denominator, 1 - share, target), explanation: 'Die angenommenen Klausurergebnisse bleiben fest. Gesucht wird die Mitarbeit für dein Ziel.' } : missingResult('Für die nötige Mitarbeit fehlen feste Annahmen für die offenen Klausuren.');
  const minContinuous = continuousKnown ? continuous : config.continuousRange.min;
  const maxContinuous = continuousKnown ? continuous : config.continuousRange.max;
  const outcomeRange = minContinuous !== null && maxContinuous !== null && minContinuous <= maxContinuous ? { min: share * fixedWrittenSum / denominator + (1 - share) * minContinuous, max: share * (fixedWrittenSum + unknownWeight * 15) / denominator + (1 - share) * maxContinuous } : null;
  const explanation = estimatedPoints === null ? 'Einzelleistungen, Mitarbeit und offene Annahmen bleiben getrennt. Fehlende Angaben ergeben keine bestätigte Halbjahresnote.' : `Dein gewähltes Modell ergibt ${display(estimatedPoints)} Punkte. Die Halbjahresnote wird von deiner Lehrkraft festgelegt; die App bestätigt sie nicht.`;
  return { ...base, status: 'scenario', missing: [], estimatedPoints, projectedWrittenAverage, requiredNext, requiredRemaining, requiredContinuous, nextRange, outcomeRange, writtenShare: share, explanation, assumptions: [config.teacherConfirmed ? 'Die Gewichtung wurde von dir als lehrkraftbestätigt markiert.' : 'Vorläufige Gewichtung von dir gewählt; noch nicht durch die Lehrkraft bestätigt.', config.writtenMode === 'equal' ? 'Du hast gleiche Gewichte für alle einbezogenen Klausuren gewählt.' : 'Du hast Einzelgewichte für die einbezogenen Klausuren gewählt.', config.continuousStatus === 'confirmed' ? 'Die Mitarbeit wurde von dir als mitgeteilt markiert.' : 'Die Mitarbeit ist deine eigene Annahme.', 'Präsentationen und andere Leistungen gehen nur mit deiner ausdrücklichen Zuordnung als Klausurersatz in den Klausurbereich ein.'] };
}

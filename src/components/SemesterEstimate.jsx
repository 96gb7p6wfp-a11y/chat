import React from 'react';
import { Button, Field } from './UI.jsx';
import { getSemesterEstimate, saveSemesterConfig } from '../semester-grades.js';
import { GRADE_LABELS } from '../grades.js';
import { HESSEN_OAVO_URL } from '../hessen.js';
import './semester-estimate.css';

const number = value => value === '' ? null : Number(value);
const points = value => value === null || value === undefined ? 'Offen' : Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 });

function RequiredResult({ title, result }) {
  const score = result.minimumWholePoints;
  return <div className={`semester-required ${result.status === 'impossible' ? 'is-impossible' : ''}`}>
    <span>{title}</span>
    <strong>{result.status === 'missing-data' ? 'Angaben fehlen' : result.status === 'impossible' ? 'So nicht erreichbar' : score !== null ? `${score} / 15` : 'Ziel bereits erreicht'}</strong>
    <p>{result.explanation}</p>
    {result.requiredScore !== null && <small>Rechnerische Grenze: {points(result.requiredScore)} Punkte{result.requiredScore > 15 ? ' · mehr als 15 nicht möglich' : ' · auf ganze Punkte aufgerundet'}</small>}
  </div>;
}

/** Embedded detail panel; the caller owns the subject modal and disclosure. */
export default function SemesterEstimate({ data, subjectId, semester = 'Q1', onChange }) {
  const result = getSemesterEstimate(data, subjectId, semester);
  const config = result.config;
  const patch = change => {
    const weightChanged = (Object.hasOwn(change, 'writtenShare') && change.writtenShare !== config.writtenShare)
      || (Object.hasOwn(change, 'writtenMode') && change.writtenMode !== config.writtenMode)
      || (Object.hasOwn(change, 'replacementGradeIds') && JSON.stringify(change.replacementGradeIds) !== JSON.stringify(config.replacementGradeIds))
      || (Object.hasOwn(change, 'futureWritten') && JSON.stringify(change.futureWritten.map(entry => [entry.id, entry.weight])) !== JSON.stringify(config.futureWritten.map(entry => [entry.id, entry.weight])));
    const continuousChanged = Object.hasOwn(change, 'continuousPoints') && change.continuousPoints !== config.continuousPoints;
    onChange(current => saveSemesterConfig(current, { ...config, ...(weightChanged ? { teacherConfirmed: false } : {}), ...(continuousChanged ? { continuousStatus: 'estimate' } : {}), ...change }));
  };
  const changeFutureCount = count => patch({ futureWritten: Array.from({ length: Number(count) }, (_, index) => config.futureWritten[index] || { id: `semester-future-${index}`, points: null, weight: null }) });
  const patchFuture = (index, change) => patch({ futureWritten: config.futureWritten.map((entry, row) => row === index ? { ...entry, ...change } : entry) });
  const otherRecords = result.records.filter(record => record.type !== 'written');
  return <div className="semester-estimate stack compact" data-testid="semester-estimate">
    <div className="semester-estimate-summary"><div><span>Klausurbereich · {result.semester}</span><strong>{points(result.knownWrittenAverage)}</strong></div><div><span>Mitarbeit</span><strong>{points(config.continuousPoints)}</strong></div><div><span>Gewähltes Szenario</span><strong>{points(result.estimatedPoints)}</strong></div></div>
    <p className="field-help">{result.explanation}</p>
    <div className="semester-model-fields">
      <Field label="Klausurbereich · Anteil in %" help="Von der Lehrkraft bestätigten Anteil oder bewusst ein vorläufiges Szenario eingeben."><input type="number" min="0" max="100" step="any" inputMode="decimal" value={config.writtenShare === null ? '' : Math.round(config.writtenShare * 100000) / 1000} onChange={event => patch({ writtenShare: event.target.value === '' ? null : Number(event.target.value) / 100 })} placeholder="Gewicht festlegen" /></Field>
      <Field label="Klausuren untereinander"><select value={config.writtenMode} onChange={event => patch({ writtenMode: event.target.value })}><option value="unset">Noch nicht festgelegt</option><option value="equal">Gleiche Gewichte wählen</option><option value="weighted">Einzelgewichte verwenden</option></select></Field>
      <Field label="Mitarbeit · Punkte"><input type="number" min="0" max="15" step="0.1" inputMode="decimal" value={config.continuousPoints ?? ''} onChange={event => patch({ continuousPoints: number(event.target.value) })} placeholder="Noch offen" /></Field>
      <Field label="Mitarbeit · Herkunft"><select value={config.continuousStatus} onChange={event => patch({ continuousStatus: event.target.value })}><option value="estimate">Meine Einschätzung</option><option value="confirmed">Von der Lehrkraft mitgeteilt</option></select></Field>
    </div>
    {config.writtenShare > 0.5 && <p className="field-error" role="alert">Dieses Szenario gewichtet den Klausurbereich stärker als die Mitarbeit. Nach OAVO § 9 Abs. 2 müssen kontinuierliche Leistungen mindestens ebenso bedeutsam sein. Kläre die Zuordnung der Leistungsbereiche mit deiner Lehrkraft.</p>}
    <label className="semester-check"><input type="checkbox" checked={config.teacherConfirmed} onChange={event => patch({ teacherConfirmed: event.target.checked })}/><span>Gewichtung durch Lehrkraft bestätigt</span></label>
    <details className="product-details"><summary>Orientierung bei nur einer Klausur</summary><div className="stack compact"><p className="field-help">Nach OAVO § 9 Abs. 2 zählt eine einzelne Klausur etwa ein Drittel. Kontinuierliche Leistungen sind mindestens so bedeutsam wie Leistungsnachweise. Das ist keine starre Notenformel: Leistungsentwicklung und die Beurteilung der Lehrkraft bleiben entscheidend.</p><a href={HESSEN_OAVO_URL} target="_blank" rel="noreferrer">Geltende OAVO § 9</a><Button variant="secondary" onClick={() => patch({ writtenShare: 1 / 3, teacherConfirmed: false })}>Szenario 1/3 wählen</Button></div></details>
    {!!otherRecords.length && <details className="product-details"><summary>Andere Leistungen zuordnen</summary><div className="stack compact"><p className="field-help">Mündliche und andere Einzelergebnisse ersetzen nicht automatisch eine durchgehende Mitarbeitsbewertung. Ordne nur tatsächlich vereinbarte Klausurersatzleistungen dem Klausurbereich zu.</p>{otherRecords.map(record => <label className="semester-check" key={record.id}><input type="checkbox" checked={config.replacementGradeIds.includes(record.id)} onChange={event => patch({ replacementGradeIds: event.target.checked ? [...config.replacementGradeIds, record.id] : config.replacementGradeIds.filter(id => id !== record.id) })}/><span>{GRADE_LABELS[record.type] || 'Weitere Leistung'} · {points(record.points)} Punkte · {record.date}<small>Als vereinbarten Klausurersatz einbeziehen</small></span></label>)}</div></details>}
    <Field label="Weitere Klausuren / vereinbarte Ersatzleistungen" help="Nur tatsächlich noch vorgesehene Leistungen. Ein späteres Datum wird nicht erfunden."><select value={config.futureWritten.length} onChange={event => changeFutureCount(event.target.value)}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map(count => <option key={count} value={count}>{count === 0 ? 'Keine weitere vorgesehen' : count}</option>)}</select></Field>
    {config.futureWritten.map((entry, index) => <fieldset key={entry.id} className="semester-future"><legend>{index === 0 ? 'Nächste Klausur / Ersatzleistung' : `Spätere Leistung ${index + 1}`}</legend><div className="semester-model-fields"><Field label={index === 0 ? 'Punkte für Vergleichsszenario' : `Angenommene Punkte ${index + 1}`} help={index === 0 ? 'Für „nächste Klausur“ wird dieser Wert gesucht. Für die Mitarbeitsrechnung kannst du eine Annahme eingeben.' : 'Leer lassen: Der notwendige Durchschnitt wird berechnet.'}><input type="number" min="0" max="15" step="0.1" inputMode="decimal" value={entry.points ?? ''} onChange={event => patchFuture(index, { points: number(event.target.value) })} placeholder="Noch offen" /></Field>{config.writtenMode === 'weighted' && <Field label={`Einzelgewicht ${index + 1}`}><input type="number" min="0.01" max="100000" step="any" inputMode="decimal" value={entry.weight ?? ''} onChange={event => patchFuture(index, { weight: number(event.target.value) })} placeholder="Gewicht festlegen" /></Field>}</div></fieldset>)}
    <div className="semester-results" aria-live="polite"><RequiredResult title="Nötige nächste Klausur" result={result.requiredNext}/><RequiredResult title="Nötiger Schnitt der offenen Klausuren" result={result.requiredRemaining}/><RequiredResult title="Nötige Mitarbeit" result={result.requiredContinuous}/></div>
    {result.outcomeRange && <p className="semester-range">Möglicher Szenariobereich: <strong>{points(result.outcomeRange.min)}–{points(result.outcomeRange.max)} Punkte</strong><span>Offene Klausuren zwischen 0 und 15; bekannte Werte bleiben fest. Keine Leistungsprognose.</span></p>}
    {config.continuousPoints === null && <details className="product-details"><summary>Eigenen Mitarbeitbereich vergleichen</summary><div className="stack compact"><p className="field-help">Gib selbst eine begründete Unter- und Obergrenze ein. Die App nimmt keinen erreichbaren Wert an.</p><div className="semester-model-fields"><Field label="Mitarbeit · untere Annahme"><input type="number" min="0" max="15" step="0.1" value={config.continuousRange.min ?? ''} onChange={event => patch({ continuousRange: { ...config.continuousRange, min: number(event.target.value) } })} /></Field><Field label="Mitarbeit · obere Annahme"><input type="number" min="0" max="15" step="0.1" value={config.continuousRange.max ?? ''} onChange={event => patch({ continuousRange: { ...config.continuousRange, max: number(event.target.value) } })} /></Field></div>{config.continuousRange.min !== null && config.continuousRange.max !== null && config.continuousRange.min > config.continuousRange.max && <p role="alert" className="field-error">Die untere Annahme darf nicht größer als die obere sein.</p>}{result.nextRange && <p>Nächste Klausur: rechnerisch {points(result.nextRange.minRequired)}–{points(result.nextRange.maxRequired)} Punkte nötig. {result.nextRange.explanation}</p>}</div></details>}
    <details className="product-details"><summary>Rechnung und Annahmen</summary><div className="stack compact"><p className="semester-equation">Halbjahrsszenario = Klausurmittel × {config.writtenShare === null ? '?' : points(config.writtenShare * 100)} % + Mitarbeit × {config.writtenShare === null ? '?' : points((1 - config.writtenShare) * 100)} %</p><p className="field-help">{result.writtenRecords.length} datierte Klausur-/Ersatzleistungen in {result.semester}. Undatierte Ausgangswerte gehen nicht ein. Andere Leistungen bleiben bis zu deiner Zuordnung getrennt.</p>{result.assumptions?.map((text, index) => <p className="field-help" key={index}>{text}</p>)}<p className="field-help">Diese Rechnung erzeugt keine bestätigte Halbjahresnote und wird nicht automatisch in Block I übernommen.</p></div></details>
  </div>;
}

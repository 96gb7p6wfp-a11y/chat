import React, { useState } from 'react';
import { ArrowRight, ChevronRight, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { Button, EmptyState, Field, Modal, SectionHeading } from './UI.jsx';
import { addGrade, removeGrade } from '../coach.js';
import { calculateSubject, GRADE_LABELS, GRADE_TYPES, getAcademicOverview, normalizeGrading, requiredFutureGrades, SEMESTERS } from '../grades.js';
import './academic-grades.css';
import { subjectLabel } from '../i18n.js';

const points = value => value === null || value === undefined || value === '' ? '—' : Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 });
const dateLabel = value => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
const optionalNumber = value => value === '' ? null : Number(value);
const trendLabel = trend => trend.direction === 'unknown' ? 'Trend noch offen' : trend.direction === 'steady' ? 'Zuletzt stabil' : `${trend.direction === 'up' ? '↑' : '↓'} ${points(Math.abs(trend.difference))} Punkte im Vergleich`;

function GradeEntry({ data, today, subjectId, record, onClose, onSave }) {
  const [form, setForm] = useState(record || { subjectId: subjectId || data.subjects.find(subject => subject.enabled !== false)?.id || '', points: '', type: 'written', date: today, semester: SEMESTERS.includes(data.profile.schoolYear) ? data.profile.schoolYear : '', weight: '', note: '' });
  const [error, setError] = useState('');
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const subject = data.subjects.find(entry => entry.id === form.subjectId);
  const grading = normalizeGrading(subject?.grading);
  return <Modal title={record ? 'Note bearbeiten' : 'Note eintragen'} onClose={onClose}><form className="stack academic-grade-form" onSubmit={event => {
    event.preventDefault();
    if (form.points === '' || form.points == null || !Number.isFinite(Number(form.points)) || Number(form.points) < 0 || Number(form.points) > 15) { setError('Gib 0 bis 15 Punkte ein. Auch 0 ist ein gültiges Ergebnis.'); return; }
    if (!form.subjectId || !form.date || form.date > today) { setError('Wähle ein Fach und ein Datum bis heute.'); return; }
    if (grading.mode === 'weighted' && (!(Number(form.weight) > 0) || !Number.isFinite(Number(form.weight)))) { setError('Trage für diese Leistung ein positives Gewicht ein.'); return; }
    onSave({ ...form, points: Number(form.points), weight: optionalNumber(form.weight ?? ''), note: form.note.trim() });
  }}>
    <Field label="Fach"><select value={form.subjectId} onChange={set('subjectId')} required>{data.subjects.map(entry => <option key={entry.id} value={entry.id}>{subjectLabel(entry)}{entry.level === 'LK' ? ' · LK' : ''}</option>)}</select></Field>
    <div className="form-grid"><Field label="Punkte (0–15)"><input autoFocus inputMode="decimal" type="number" min="0" max="15" step="0.1" required value={form.points} onChange={set('points')} placeholder="z. B. 10" /></Field><Field label="Leistungsart"><select value={form.type} onChange={set('type')}>{GRADE_TYPES.map(type => <option key={type} value={type}>{GRADE_LABELS[type]}</option>)}</select></Field></div>
    <div className="form-grid"><Field label="Datum"><input type="date" max={today} required value={form.date} onChange={set('date')} /></Field><Field label="Halbjahr"><select value={form.semester || ''} onChange={set('semester')}><option value="">Nicht zugeordnet</option>{SEMESTERS.map(semester => <option key={semester}>{semester}</option>)}</select></Field></div>
    {grading.mode === 'weighted' && <Field label="Gewicht dieser Leistung" help="Relativ: Gewicht 2 zählt doppelt so stark wie Gewicht 1."><input inputMode="decimal" type="number" min="0.01" max="100000" step="any" required value={form.weight ?? ''} onChange={set('weight')} placeholder="Gewicht laut deiner Regelung" /></Field>}
    {grading.mode === 'category' && <p className="field-help">Es gilt deine Gewichtung nach Leistungsarten. Innerhalb einer Art zählt jede Leistung gleich.</p>}
    <Field label="Notiz · optional"><textarea rows="2" maxLength="3000" value={form.note} onChange={set('note')} placeholder="Thema oder konkretes Feedback" /></Field>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Note speichern</Button></div>
  </form></Modal>;
}

function GradeSettings({ subject, overallTarget, onClose, onSave }) {
  const grading = normalizeGrading(subject.grading);
  const [form, setForm] = useState({ ...grading, target: subject.target ?? '', level: subject.level || 'GK', overallTarget: overallTarget ?? '' });
  const [error, setError] = useState('');
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  return <Modal title="Noten und Ziele" onClose={onClose}><form className="stack" onSubmit={event => {
    event.preventDefault();
    const target = optionalNumber(form.target);
    const overall = optionalNumber(form.overallTarget);
    if ([target, overall].some(value => value !== null && (!Number.isFinite(value) || value < 0 || value > 15))) { setError('Zielwerte müssen zwischen 0 und 15 Punkten liegen.'); return; }
    if (!(Number(form.courseWeight) > 0)) { setError('Das Kursgewicht muss positiv sein.'); return; }
    const weights = Object.fromEntries(GRADE_TYPES.map(type => [type, optionalNumber(form.weights[type] ?? '')]));
    if (Object.values(weights).some(value => value !== null && (!Number.isFinite(value) || value <= 0))) { setError('Verwendete Gewichte müssen positiv sein. Nicht benötigte Leistungsarten bleiben leer.'); return; }
    if (form.mode === 'category' && !Object.values(weights).some(value => value > 0)) { setError('Lege mindestens ein Gewicht für eine Leistungsart fest.'); return; }
    onSave({ target, level: form.level, grading: normalizeGrading({ ...form, weights }) }, overall);
  }}>
    <p className="muted small">{subjectLabel(subject)} · Verwende die Regelung deiner Schule. Die App setzt keine schulrechtliche Gewichtung voraus.</p>
    <div className="form-grid"><Field label="Mein Fachziel · Punkte"><input type="number" min="0" max="15" step="0.1" value={form.target} onChange={set('target')} /></Field><Field label="Kursart"><select value={form.level} onChange={set('level')}><option value="GK">Grundkurs</option><option value="LK">Leistungskurs</option></select></Field></div>
    <Field label="Berechnung"><select value={form.mode} onChange={set('mode')}><option value="simple">Einfacher Mittelwert</option><option value="weighted">Gewicht je Einzelleistung</option><option value="category">Gewicht je Leistungsart</option></select></Field>
    {form.mode === 'simple' && <p className="field-help">Alle eingetragenen Leistungen zählen gleich. Das ist eine Orientierung, keine bestätigte offizielle Kursnote.</p>}
    {form.mode === 'weighted' && <p className="field-help">Bei jeder Note und jedem Zukunftsszenario trägst du ein relatives Gewicht ein. Ohne Gewicht bleibt der Schnitt offen.</p>}
    {form.mode === 'category' && <div className="stack compact"><p className="field-help">Zum Beispiel schriftlich 2 und mündlich 1, falls das deiner Regelung entspricht. Nicht verwendete Arten bleiben leer. Fehlende Ergebnisse werden nicht stillschweigend umgewichtet.</p>{GRADE_TYPES.map(type => <Field key={type} label={`${GRADE_LABELS[type]} · Gewicht`}><input type="number" min="0.01" step="any" inputMode="decimal" value={form.weights[type] ?? ''} onChange={event => setForm(current => ({ ...current, weights: { ...current.weights, [type]: event.target.value } }))} placeholder="Nicht verwendet" /></Field>)}</div>}
    <details className="product-details"><summary>Gesamtschnitt und Gesamtziel</summary><div className="stack compact"><Field label="Gewicht dieses Kurses im Gesamtschnitt" help="Standard: 1 für jeden Kurs. Ein LK wird nicht automatisch doppelt gezählt."><input type="number" min="0.01" max="100000" step="any" required value={form.courseWeight} onChange={set('courseWeight')} /></Field><Field label="Mein Ziel für den Kursschnitt · optional"><input type="number" min="0" max="15" step="0.1" value={form.overallTarget} onChange={set('overallTarget')} placeholder="Noch offen" /></Field></div></details>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Einstellungen speichern</Button></div>
  </form></Modal>;
}

function Forecast({ analysis }) {
  const [count, setCount] = useState(1);
  const [type, setType] = useState('written');
  const [weight, setWeight] = useState('');
  const [oral, setOral] = useState('');
  const [oralWeight, setOralWeight] = useState('');
  const [scenarioTarget, setScenarioTarget] = useState(analysis.target ?? '');
  const future = Array.from({ length: count }, () => ({ type, weight: optionalNumber(weight) }));
  if (oral !== '') future.push({ type: 'oral', points: Number(oral), weight: optionalNumber(oralWeight) });
  const result = requiredFutureGrades({ records: analysis.records, target: scenarioTarget, future, grading: analysis.grading });
  return <section className="grade-forecast" aria-label="Zielnoten berechnen"><h3>Was brauche ich noch?</h3><p className="muted small">Ein Rechenszenario mit deinen Annahmen. Es plant keine zusätzlichen Prüfungen.</p>
    {!analysis.records.length && <p className="grade-caution">Es fehlen datierte Einzelleistungen. Undatierte Ausgangswerte werden nicht als Klausuren erfunden. Das Szenario zeigt deshalb nur deine angenommenen zukünftigen Ergebnisse.</p>}
    <div className="form-grid"><Field label="Ziel im Szenario"><input type="number" min="0" max="15" step="0.1" value={scenarioTarget} onChange={event => setScenarioTarget(event.target.value)} /></Field><Field label="Offene Leistungen"><select value={count} onChange={event => setCount(Number(event.target.value))}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}</select></Field></div>
    <Field label="Art der offenen Leistungen"><select value={type} onChange={event => setType(event.target.value)}>{GRADE_TYPES.map(value => <option key={value} value={value}>{GRADE_LABELS[value]}</option>)}</select></Field>
    {analysis.mode === 'weighted' && <Field label="Gewicht jeder offenen Leistung"><input type="number" min="0.01" step="any" value={weight} onChange={event => setWeight(event.target.value)} placeholder="Bitte festlegen" /></Field>}
    <details className="product-details"><summary>Zusätzliches mündliches Ergebnis annehmen</summary><div className="stack compact"><Field label="Angenommene mündliche Punkte · optional"><input type="number" min="0" max="15" step="0.1" value={oral} onChange={event => setOral(event.target.value)} placeholder="z. B. 12" /></Field>{analysis.mode === 'weighted' && <Field label="Gewicht des angenommenen Ergebnisses"><input type="number" min="0.01" step="any" value={oralWeight} onChange={event => setOralWeight(event.target.value)} /></Field>}</div></details>
    <div className={`forecast-result ${result.status === 'impossible' ? 'forecast-impossible' : ''}`} aria-live="polite"><span className="field-help">{result.status === 'missing-data' ? 'ANGABEN ERGÄNZEN' : result.status === 'impossible' ? 'SO NICHT ERREICHBAR' : 'DEIN SZENARIO'}</span><p>{result.explanation}</p></div>
    {!!result.assumptions.length && <details className="product-details"><summary>So wurde gerechnet</summary><ul className="grade-assumptions">{result.assumptions.map(item => <li key={item}>{item}</li>)}</ul><p className="field-help">Gewichteter Schnitt = Summe aus Punkten × Gewicht ÷ Summe der Gewichte. Bei Leistungsarten werden zuerst deren Mittelwerte berechnet. Das Ergebnis ist keine Notengarantie.</p></details>}
  </section>;
}

function SubjectDetail({ data, subjectId, onClose, onGrade, onSettings, onDelete }) {
  const [semester, setSemester] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const analysis = calculateSubject(data, subjectId, semester);
  const subject = analysis.subject;
  const sorted = [...analysis.records].sort((a, b) => b.date.localeCompare(a.date));
  return <Modal title={subjectLabel(subject)} onClose={onClose}><div className="stack academic-subject-detail">
    <div className="academic-subject-score"><div><span className="field-help">{analysis.periodLabel}</span><strong>{points(analysis.average)}<small> / 15</small></strong></div><div><span className="field-help">Mein Ziel</span><strong>{points(analysis.target)}</strong></div><Button variant="secondary" onClick={onSettings} aria-label={`Noten und Ziele für ${subjectLabel(subject)} einstellen`}><Settings2 size={17} /></Button></div>
    <p className="field-help">{analysis.methodLabel}{analysis.source === 'assessments' && ` · ${analysis.reason}`}</p>
    <Field label="Halbjahr anzeigen"><select value={semester} onChange={event => setSemester(event.target.value)}><option value="">Aktuelles Halbjahr</option><option value="all">Alle Halbjahre</option>{SEMESTERS.map(value => <option key={value}>{value}</option>)}</select></Field>
    {analysis.average === null && analysis.records.length > 0 && <p className="grade-caution">{analysis.reason} Öffne die Einstellungen oder ergänze die fehlenden Ergebnisse.</p>}
    <div className="academic-trend"><span>{trendLabel(analysis.trend)}</span>{analysis.gap !== null && analysis.gap > 0 && <span>{points(analysis.gap)} Punkte bis zum Ziel</span>}</div>
    {analysis.semesterAverages.some(entry => entry.average !== null) && <div className="semester-comparison" aria-label="Schnitt je Halbjahr">{analysis.semesterAverages.map(entry => <div key={entry.semester}><span className="field-help">{entry.semester}</span><strong>{points(entry.average)}</strong></div>)}</div>}
    <SectionHeading title="Einzelleistungen" action={<Button onClick={() => onGrade(null)}><Plus size={16} /> Note</Button>} />
    {sorted.length ? <div className="grade-records">{sorted.map(record => <div className="academic-grade-record" key={record.id}><span className="grade-pill">{points(record.points)}</span><div className="grow"><strong>{GRADE_LABELS[record.type] || 'Leistung'}</strong><p className="muted small">{dateLabel(record.date)} · {record.semester || 'Halbjahr offen'}{analysis.mode === 'weighted' ? ` · Gewicht ${points(record.weight)}` : ''}</p>{record.note && <p className="muted small">{record.note}</p>}</div><button type="button" className="icon-button" aria-label={`Note ${points(record.points)} vom ${record.date} bearbeiten`} onClick={() => onGrade(record)}><Pencil size={16} /></button><button type="button" className="icon-button" aria-label={`Note ${points(record.points)} vom ${record.date} löschen`} onClick={() => setPendingDelete(record)}><Trash2 size={16} /></button></div>)}</div> : <EmptyState title="Noch keine Einzelleistungen" description={analysis.semester ? 'In diesem Halbjahr ist noch keine Note gespeichert.' : 'Deine bisherigen Ausgangswerte bleiben erhalten. Trage dein nächstes Ergebnis mit Datum ein.'} action={<Button variant="secondary" onClick={() => onGrade(null)}>Erste Note eintragen</Button>} />}
    {analysis.unassignedCount > 0 && <p className="field-help">{analysis.unassignedCount} ältere Ergebnisse haben noch kein Halbjahr. Du kannst sie einzeln zuordnen.</p>}
    {pendingDelete && <div className="grade-delete-confirm" role="alert"><p>{points(pendingDelete.points)} Punkte wirklich löschen?</p><div className="row"><Button variant="secondary" onClick={() => setPendingDelete(null)}>Behalten</Button><Button onClick={() => { onDelete(pendingDelete); setPendingDelete(null); }}>Löschen</Button></div></div>}
    <details className="product-details grade-forecast-details"><summary>Zielnote berechnen <ArrowRight size={16} /></summary><Forecast key={`${subjectId}-${semester}`} analysis={analysis} /></details>
  </div></Modal>;
}

export default function AcademicGrades({ data, today, onChange, notify, onOpenProfile }) {
  const [selected, setSelected] = useState(null);
  const [entry, setEntry] = useState(null);
  const [settings, setSettings] = useState(false);
  const overview = getAcademicOverview(data);
  const subjects = data.subjects.filter(subject => subject.enabled !== false);
  const subject = data.subjects.find(value => value.id === selected);
  const save = grade => {
    try { onChange(current => addGrade(current, grade)); setEntry(null); notify?.('Note gespeichert. Dein Lernplan wird angepasst.'); }
    catch { notify?.('Die Note konnte nicht gespeichert werden. Prüfe Fach, Datum und Punkte.'); }
  };
  return <section className="card academic-grades"><SectionHeading title="Meine Noten" subtitle="0–15 Punkte · echte Ergebnisse" action={subjects.length ? <Button onClick={() => setEntry({ subjectId: selected })}><Plus size={17} /> Note</Button> : undefined} />
    <div className="academic-overview"><div><span className="field-help">Mein Kursschnitt</span><strong>{points(overview.average)}<small> / 15</small></strong></div><div><span className="field-help">Mein Ziel</span><strong>{points(overview.target)}</strong></div>{overview.gap !== null && <p className="muted small">{overview.gap > 0 ? `${points(overview.gap)} Punkte bis zu deinem Ziel` : 'Aktueller Schnitt auf Zielniveau'}</p>}</div>
    <p className="field-help">{overview.subjectCount} von {overview.totalSubjects} Fächern mit bekannten Werten. {overview.weighted ? 'Deine Kursgewichte gelten.' : 'Alle Kurse zählen gleich.'}{overview.includesBaselines ? ' Enthält undatierte Ausgangswerte.' : ''} Keine offizielle Abiturnote.</p>
    {subjects.length ? <div className="academic-subjects">{subjects.map(value => { const analysis = calculateSubject(data, value.id); return <button className="academic-subject-row" type="button" key={value.id} onClick={() => setSelected(value.id)} aria-label={`${subjectLabel(value)}: Noten und Ziel berechnen`}><div className="grow"><strong>{subjectLabel(value)}{value.level === 'LK' && <span className="academic-lk">LK</span>}</strong><p>{analysis.source === 'baseline' ? 'Ausgangswerte · Datum offen' : analysis.average === null ? analysis.records.length ? 'Gewichtung ergänzen' : 'Noch keine Ergebnisse' : `${analysis.records.length} ${analysis.records.length === 1 ? 'Ergebnis' : 'Ergebnisse'} · ${trendLabel(analysis.trend)}`}</p></div><div className="academic-row-points"><strong>{points(analysis.average)}</strong><span>Ziel {points(analysis.target)}</span></div><ChevronRight size={16} /></button>; })}</div> : <EmptyState title="Deine Fächer fehlen noch" description="Ergänze deine Fächer, damit dein Lernplan gezielt auf deine Ziele eingehen kann." action={onOpenProfile && <Button onClick={() => onOpenProfile('Subjects')}>Fächer hinzufügen</Button>} />}
    {selected && subject && !entry && !settings && <SubjectDetail data={data} subjectId={selected} onClose={() => setSelected(null)} onGrade={record => setEntry({ subjectId: selected, record })} onSettings={() => setSettings(true)} onDelete={record => { onChange(current => removeGrade(current, record.id)); notify?.('Note gelöscht. Deine übrigen Ergebnisse bleiben erhalten.'); }} />}
    {entry && <GradeEntry data={data} today={today} subjectId={entry.subjectId} record={entry.record} onClose={() => setEntry(null)} onSave={save} />}
    {settings && subject && <GradeSettings subject={subject} overallTarget={data.profile.targetAverage} onClose={() => setSettings(false)} onSave={(patch, targetAverage) => { onChange(current => ({ ...current, subjects: current.subjects.map(value => value.id === subject.id ? { ...value, ...patch } : value), profile: { ...current.profile, targetAverage } })); setSettings(false); notify?.('Notenberechnung und Ziele gespeichert.'); }} />}
  </section>;
}

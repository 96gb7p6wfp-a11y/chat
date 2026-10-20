import React, { useState } from 'react';
import { Edit3, Plus, Trash2, ArrowUpRight } from 'lucide-react';
import { Button, Field, Modal, SectionHeading } from './UI.jsx';
import { SAT_SKILLS, SAT_LABELS, SAT_SOURCES, normalizeSAT, satScore, calculateSATTotal, getSATSummary, getSATPractice } from '../sat.js';
import TestPreparationGuide from './TestPreparationGuide.jsx';
import '../ielts.css';

const fmt = value => value == null ? 'Offen' : value;
const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Datum offen';
const sourceLabel = source => source === 'estimate' ? 'Selbsteinschätzung' : SAT_SOURCES[source] || 'Noch kein Ergebnis';
const id = () => globalThis.crypto?.randomUUID?.() || `sat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function ScoreField({ label, value, onChange, total = false }) {
  return <Field label={label}><input type="number" inputMode="numeric" min={total ? 400 : 200} max={total ? 1600 : 800} step="10" value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder="Offen" /></Field>;
}
function Setup({ data, onSave, onClose }) {
  const [form, setForm] = useState(() => normalizeSAT(data));
  const [error, setError] = useState('');
  const patch = (key, value) => setForm(current => ({ ...current, [key]: value }));
  function submit(event) {
    event.preventDefault();
    if (form.targetTotal !== '' && form.targetTotal !== null && satScore(form.targetTotal, true) === null) { setError('Der Gesamtwert liegt zwischen 400 und 1600, in Zehnerschritten.'); return; }
    if ([...Object.values(form.targets), ...Object.values(form.estimates)].some(value => value !== '' && value !== null && satScore(value) === null)) { setError('Bereichswerte liegen zwischen 200 und 800, in Zehnerschritten.'); return; }
    if (!Number.isInteger(Number(form.weeklyMinutes)) || Number(form.weeklyMinutes) < 0 || Number(form.weeklyMinutes) > 840) { setError('Plane zwischen 0 und 840 Minuten pro Woche.'); return; }
    onSave(normalizeSAT(form));
  }
  return <Modal title="Dein SAT-Ziel" onClose={onClose}><form className="stack ielts-form" onSubmit={submit}>
    <p className="muted">Plane nur, wenn der SAT zu deiner Hochschulliste passt. Alle Angaben bleiben änderbar.</p>
    <div className="form-grid preparation-fields"><Field label="Prüfungsdatum (optional)"><input type="date" value={form.examDate} onChange={event => patch('examDate', event.target.value)} /></Field><ScoreField label="Ziel · Gesamtwert" value={form.targetTotal} total onChange={value => patch('targetTotal', value)} /></div>
    {form.examDate && <Field label="Status des Termins"><select value={form.dateStatus} onChange={event => patch('dateStatus', event.target.value)}><option value="planned">Geplant · noch nicht gebucht</option><option value="booked">Von mir gebucht</option></select></Field>}
    <fieldset className="stack compact"><legend className="ielts-legend">Ziele je Bereich · optional</legend><div className="form-grid preparation-fields">{SAT_SKILLS.map(skill => <ScoreField key={skill} label={`${SAT_LABELS[skill]} · Ziel`} value={form.targets[skill]} onChange={value => patch('targets', { ...form.targets, [skill]: value })} />)}</div><p className="field-help">Ein Gesamtziel wird nicht automatisch halbiert. Bereichsziele bestimmst du selbst.</p></fieldset>
    <Field label="SAT-Zeit pro Woche · Minuten" help="Obergrenze innerhalb deiner gesamten Lernzeit. IELTS und Schule teilen sich dasselbe Zeitbudget."><input type="number" min="0" max="840" step="1" required value={form.weeklyMinutes} onChange={event => patch('weeklyMinutes', event.target.value)} /></Field>
    <details className="product-details"><summary>Aktuelle Selbsteinschätzung</summary><div className="form-grid preparation-fields">{SAT_SKILLS.map(skill => <ScoreField key={skill} label={`${SAT_LABELS[skill]} · geschätzt`} value={form.estimates[skill]} onChange={value => patch('estimates', { ...form.estimates, [skill]: value })} />)}</div><p className="field-help">Eine Einschätzung ist kein ausgewerteter Test.</p></details>
    <label className="checkbox-row"><input type="checkbox" checked={form.enabled} onChange={event => patch('enabled', event.target.checked)} />SAT in meinem Tagesplan berücksichtigen</label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">SAT-Ziel speichern</Button></div>
  </form></Modal>;
}
function ScoreForm({ record, today, onSave, onClose }) {
  const [form, setForm] = useState(() => record || { id: id(), date: today, source: 'mock', skills: { readingWriting: null, math: null }, overall: null, notes: '' });
  const [error, setError] = useState('');
  const total = calculateSATTotal(form.skills);
  const patch = (key, value) => setForm(current => ({ ...current, [key]: value }));
  function submit(event) {
    event.preventDefault();
    if (!form.date || form.date > today) { setError('Wähle das tatsächliche Datum. Künftige Ergebnisse bleiben offen.'); return; }
    if (SAT_SKILLS.some(skill => form.skills[skill] !== '' && form.skills[skill] !== null && satScore(form.skills[skill]) === null) || (form.overall !== '' && form.overall !== null && satScore(form.overall, true) === null)) { setError('Prüfe Wertebereich und Zehnerschritte deiner Ergebnisse.'); return; }
    if (total === null && satScore(form.overall, true) === null && SAT_SKILLS.every(skill => satScore(form.skills[skill]) === null)) { setError('Trage mindestens ein tatsächliches Ergebnis ein.'); return; }
    onSave(form);
  }
  return <Modal title={record ? 'SAT-Ergebnis bearbeiten' : 'SAT-Ergebnis erfassen'} onClose={onClose}><form className="stack ielts-form" onSubmit={submit}>
    <div className="form-grid preparation-fields"><Field label="Ergebnisart"><select value={form.source} onChange={event => patch('source', event.target.value)}>{Object.entries(SAT_SOURCES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="Datum"><input type="date" value={form.date} max={today} required onChange={event => patch('date', event.target.value)} /></Field></div>
    <p className="field-help">Übertrage ausgewertete Scores aus Bluebook oder deinem Ergebnisbericht. Aus einer Zahl richtiger Antworten wird hier kein Score geschätzt.</p>
    <div className="form-grid preparation-fields">{SAT_SKILLS.map(skill => <ScoreField key={skill} label={`${SAT_LABELS[skill]} · Score`} value={form.skills[skill]} onChange={value => patch('skills', { ...form.skills, [skill]: value })} />)}</div>
    {total !== null && <p className="ielts-calculated"><strong>Gesamt aus beiden Bereichen: {total}</strong></p>}
    <details className="product-details"><summary>Gesamtwert separat übernehmen</summary><ScoreField label="Berichteter Gesamtwert (optional)" total value={form.overall} onChange={value => patch('overall', value)} /></details>
    {total !== null && satScore(form.overall, true) !== null && Number(form.overall) !== total && <p className="field-help">Dein berichteter Gesamtwert weicht von der Summe ab. Prüfe die Angaben; beide bleiben getrennt erhalten.</p>}
    <Field label="Notiz (optional)"><textarea rows="3" maxLength="2000" value={form.notes} onChange={event => patch('notes', event.target.value)} placeholder="Testname, Bedingungen oder Rückmeldung" /></Field>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">SAT-Ergebnis speichern</Button></div>
  </form></Modal>;
}
function MistakeForm({ skill, value, onSave, onClose }) {
  const [note, setNote] = useState(value);
  return <Modal title={`${SAT_LABELS[skill]} · Fehlernotizen`} onClose={onClose}><form className="stack" onSubmit={event => { event.preventDefault(); onSave(note); }}><Field label="Welcher Fehler wiederholt sich?"><textarea autoFocus rows="5" maxLength="2000" value={note} onChange={event => setNote(event.target.value)} /></Field><div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Notiz speichern</Button></div></form></Modal>;
}
export default function SAT({ data, today, onChange, notify }) {
  const [modal, setModal] = useState(null);
  const summary = getSATSummary(data, today), settings = summary.data;
  const best = summary.sections.find(skill => skill.current === null) || summary.weakest || summary.sections[0];
  const practice = getSATPractice(best.skill, { days: summary.daysUntil, minutes: Math.max(10, Math.min(30, summary.context.schoolCap, summary.context.remaining || 30)), mistakes: best.mistakes });
  function change(transform, message) { onChange(current => ({ ...current, sat: normalizeSAT(transform(normalizeSAT(current.sat))) })); setModal(null); notify?.(message); }
  return <section className="ielts-coach stack" aria-label="SAT-Vorbereitung">
    <section className="card stack"><SectionHeading title="SAT" action={<Button variant="secondary" onClick={() => setModal({ type: 'setup' })}>{summary.configured ? 'SAT-Ziel bearbeiten' : 'SAT-Ziel festlegen'}</Button>} />
      {!summary.configured ? <p className="muted">Für UCLA und UC Berkeley zählt der SAT nicht zur Zulassungsentscheidung. Prüfe weitere Hochschulen, bevor du Vorbereitungszeit einplanst.</p> : <><div className="ielts-overview"><div><span className="field-help">{settings.dateStatus === 'booked' ? 'Gebuchte Prüfung' : 'Geplanter Termin'}</span><strong>{summary.daysUntil === null ? 'Datum offen' : summary.daysUntil < 0 ? 'Datum liegt zurück' : summary.daysUntil === 0 ? 'Heute' : `In ${summary.daysUntil} Tagen`}</strong>{settings.examDate && <span className="field-help">{dateLabel(settings.examDate)}</span>}</div><div><span className="field-help">Gesamtziel</span><strong>{fmt(settings.targetTotal)}</strong><span className="field-help">{settings.weeklyMinutes} min / Woche{!settings.enabled ? ' · pausiert' : ''}</span></div></div><p className="small muted">{summary.readiness}</p>{summary.complete && <p className="ielts-evidence"><strong>{summary.overall} Punkte</strong><span>{SAT_SOURCES[summary.complete.source]} · {dateLabel(summary.complete.date)}</span></p>}{summary.reportedOverall && summary.reportedOverall.id !== summary.complete?.id && (!summary.complete || summary.reportedOverall.date >= summary.complete.date) && <p className="ielts-evidence"><strong>Berichtet: {summary.reportedOverall.overall} Punkte</strong><span>{SAT_SOURCES[summary.reportedOverall.source]} · {dateLabel(summary.reportedOverall.date)} · Bereiche unvollständig</span></p>}</>}
      <Button icon={Plus} onClick={() => setModal({ type: 'score', record: null })}>SAT-Ergebnis erfassen</Button>
    </section>
    {summary.configured && <>
      <section className="card"><h3>Deine zwei Bereiche</h3>{summary.sections.map(skill => <details className="product-details ielts-skill" key={skill.skill}><summary><span>{skill.label}</span><span className="ielts-skill-bands">{fmt(skill.current)} <span className="muted">→ {fmt(skill.target)}</span></span></summary><div className="stack compact ielts-skill-content"><p className="field-help">{sourceLabel(skill.source)}{skill.date ? ` · ${dateLabel(skill.date)}` : ''}{skill.gap !== null ? ` · ${skill.gap} Punkte bis zum Bereichsziel` : ' · Bereichsziel offen'}</p>{skill.trend !== null && <p className="small">Letzte zwei ausgewertete Ergebnisse: {skill.trend > 0 ? '+' : ''}{skill.trend} Punkte. Verschiedene Tests sind nur eingeschränkt vergleichbar.</p>}{skill.mistakes && <p className="ielts-mistake">{skill.mistakes}</p>}<Button variant="ghost" onClick={() => setModal({ type: 'mistake', skill: skill.skill })}>{skill.mistakes ? 'Fehlernotiz bearbeiten' : 'Fehlernotiz hinzufügen'}</Button></div></details>)}</section>
      {summary.context.remaining >= 10 ? <section className="card stack ielts-next"><span className="page-kicker">NÄCHSTER SCHRITT</span><h3>{practice.title}</h3><p className="small muted">{summary.context.reason}</p><details className="product-details"><summary>So übst du</summary><ol>{practice.steps.map(step => <li key={step.title}><strong>{step.title} · {step.minutes} min</strong><p>{step.instruction}</p></li>)}</ol><p className="field-help">{practice.assessmentNote}</p></details><a className="text-link" href={practice.resource.url} target="_blank" rel="noreferrer">Offizielle Übungsaufgaben<ArrowUpRight size={15} /></a></section> : <section className="card"><h3>Wochenbudget erreicht</h3><p className="small muted">Für SAT ist diese Woche keine weitere Einheit eingeplant. Schule und Erholung behalten ihren Platz.</p></section>}
      <section className="card"><details className="product-details preparation-plan"><summary>Vorbereitungsplan & Terminwahl</summary><div className="stack compact"><h3>{summary.horizon.headline}</h3><p className="small muted">{summary.horizon.explanation}</p>{!settings.examDate && summary.horizon.window && <p className="small">Mögliches Planungsfenster: {dateLabel(summary.horizon.window.start)} – {dateLabel(summary.horizon.window.end)}. Das ist kein angebotener oder gebuchter Prüfungstermin.</p>}<p className="field-help">{summary.horizon.note}</p>{summary.milestones.length > 0 && <div className="preparation-milestones"><p className="field-help">Vorschläge für deinen gewählten Termin. Der Tagesplan berücksichtigt freie Zeit und Schulbelastung.</p>{summary.milestones.map(item => <div key={`${item.date}-${item.title}`}><span className="field-help">{dateLabel(item.date)}</span><strong>{item.title}</strong><p className="field-help">{item.detail}</p></div>)}</div>}<p className="small"><strong>Diese Woche:</strong> höchstens {summary.context.allowance} min SAT innerhalb deiner gesamten Lernzeit; davon noch {summary.context.remaining} min offen. {best.current === null ? 'Beginne mit einer Diagnose beider Bereiche.' : `${best.label} erhält zuerst Aufmerksamkeit; danach den anderen Bereich festigen.`}</p><ol className="preparation-checklist"><li>Jetzt: Diagnose auswerten und ein konkretes Fehlermuster auswählen.</li><li>Wöchentlich: beide Bereiche üben, schwächere Fähigkeiten häufiger; jede Einheit endet mit Fehleranalyse.</li><li>Nach zwei Wochen: neue Ergebnisse vergleichen und Ziel, Umfang oder Termin prüfen.</li><li>Für einen vollständigen Bluebook-Test 144 Minuten einschließlich Pause freihalten; die Fehlerauswertung bekommt eine eigene Einheit. Ohne passenden freien Block wird keine vollständige Simulation eingeplant.</li><li>{summary.daysUntil !== null && summary.daysUntil <= 14 ? 'In der letzten Phase: passende zeitgebundene Module, Fehler wiederholen und Erholung einplanen.' : 'Vor der Prüfung: realistische Tests mit Zeitlimit, anschließend gezielte Korrektur. Am Vortag nur Bekanntes wiederholen.'}</li></ol></div></details></section>
    </>}
    <section className="card"><TestPreparationGuide test="SAT" /></section>
    {!!summary.scores.length && <section className="card"><details className="product-details ielts-history"><summary>SAT-Ergebnisse ({summary.scores.length})</summary>{summary.scores.map(record => <div className="list-row" key={record.id}><div className="grow"><strong>{SAT_SOURCES[record.source]}</strong><p className="field-help">{dateLabel(record.date)}{calculateSATTotal(record.skills) !== null ? ` · ${calculateSATTotal(record.skills)} Punkte aus beiden Bereichen` : record.overall !== null ? ` · berichtet ${record.overall}` : ''}</p><p className="small muted">{SAT_SKILLS.filter(skill => record.skills[skill] !== null).map(skill => `${SAT_LABELS[skill]} ${record.skills[skill]}`).join(' · ')}</p>{record.notes && <p className="small muted">{record.notes}</p>}</div><button className="icon-button" aria-label={`SAT-Ergebnis vom ${record.date} bearbeiten`} onClick={() => setModal({ type: 'score', record })}><Edit3 size={17} /></button><button className="icon-button" aria-label={`SAT-Ergebnis vom ${record.date} löschen`} onClick={() => setModal({ type: 'delete', record })}><Trash2 size={17} /></button></div>)}</details></section>}
    {modal?.type === 'setup' && <Setup data={settings} onClose={() => setModal(null)} onSave={value => change(() => value, 'SAT-Ziel gespeichert. Dein Lernplan wird angepasst.')} />}
    {modal?.type === 'score' && <ScoreForm record={modal.record} today={today} onClose={() => setModal(null)} onSave={record => change(value => ({ ...value, scores: [...value.scores.filter(score => score.id !== record.id), record] }), 'SAT-Ergebnis gespeichert.')} />}
    {modal?.type === 'mistake' && <MistakeForm skill={modal.skill} value={settings.mistakes[modal.skill]} onClose={() => setModal(null)} onSave={note => change(value => ({ ...value, mistakes: { ...value.mistakes, [modal.skill]: note } }), 'Fehlernotiz gespeichert.')} />}
    {modal?.type === 'delete' && <Modal title="SAT-Ergebnis löschen?" onClose={() => setModal(null)}><div className="stack"><p>{SAT_SOURCES[modal.record.source]} vom {dateLabel(modal.record.date)} wird aus deinem Verlauf entfernt.</p><div className="sheet-footer"><Button variant="secondary" onClick={() => setModal(null)}>Behalten</Button><Button variant="danger" onClick={() => change(value => ({ ...value, scores: value.scores.filter(score => score.id !== modal.record.id) }), 'SAT-Ergebnis gelöscht.')}>Löschen</Button></div></div></Modal>}
  </section>;
}

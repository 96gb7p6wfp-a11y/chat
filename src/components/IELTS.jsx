import React, { useState } from 'react';
import { Edit3, Plus, Trash2, ArrowUpRight } from 'lucide-react';
import { Button, Field, Modal, SectionHeading } from './UI.jsx';
import { IELTS_SKILLS, IELTS_LABELS, IELTS_SOURCES, normalizeIELTS, calculateIELTSOverall, getIELTSSummary, getIELTSPractice, band } from '../ielts.js';
import '../ielts.css';

const fmt = value => value === null || value === undefined ? 'Offen' : Number(value).toFixed(1);
const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Noch kein Datum';
const sourceLabel = value => value === 'estimate' ? 'Selbsteinschätzung' : IELTS_SOURCES[value] || 'Noch kein Ergebnis';
const id = () => globalThis.crypto?.randomUUID?.() || `ielts-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const bandValue = value => value ?? '';

function BandField({ label, value, onChange, help }) {
  return <Field label={label} help={help}><input type="number" inputMode="decimal" min="0" max="9" step="0.5" value={bandValue(value)} onChange={event => onChange(event.target.value)} placeholder="Offen" /></Field>;
}

function Setup({ data, onSave, onClose }) {
  const [form, setForm] = useState(() => normalizeIELTS(data));
  const [error, setError] = useState('');
  const patch = (key, value) => setForm(current => ({ ...current, [key]: value }));
  function submit(event) {
    event.preventDefault();
    const values = [form.targetOverall, ...Object.values(form.targets), ...Object.values(form.estimates)];
    if (values.some(value => value !== '' && value !== null && band(value) === null)) { setError('Bitte trage Bands von 0 bis 9 in halben Schritten ein.'); return; }
    if (!Number.isInteger(Number(form.weeklyMinutes)) || Number(form.weeklyMinutes) < 0 || Number(form.weeklyMinutes) > 840) { setError('Plane zwischen 0 und 840 Minuten pro Woche.'); return; }
    onSave(normalizeIELTS(form));
  }
  return <Modal title="Dein IELTS-Ziel" onClose={onClose}><form className="stack ielts-form" onSubmit={submit}>
    <p className="muted">IELTS Academic. Trage nur ein, was du schon weißt. Alle Ziele bleiben änderbar.</p>
    <div className="form-grid"><Field label="Prüfungsdatum (optional)"><input type="date" value={form.examDate} onChange={event => patch('examDate', event.target.value)} /></Field><BandField label="Ziel · Overall Band" value={form.targetOverall} onChange={value => patch('targetOverall', value)} /></div>
    <fieldset className="stack compact"><legend className="ielts-legend">Ziele je Bereich</legend><p className="field-help">Ohne eigenes Bereichsziel dient dein Overall-Ziel als Planungsziel. Das ist keine Hochschulvorgabe.</p><div className="form-grid">{IELTS_SKILLS.map(skill => <BandField key={skill} label={`${IELTS_LABELS[skill]} · Ziel`} value={form.targets[skill]} onChange={value => patch('targets', { ...form.targets, [skill]: value })} />)}</div></fieldset>
    <Field label="IELTS-Zeit pro Woche · Minuten" help="Obergrenze für deinen Lernplan. Schule und Erholung haben weiterhin Platz."><input type="number" min="0" max="840" step="1" value={form.weeklyMinutes} onChange={event => patch('weeklyMinutes', event.target.value)} required /></Field>
    <details className="product-details"><summary>Aktuelle Selbsteinschätzung</summary><p className="field-help">Optional. Ein Gefühl für deinen Stand ist noch kein nachgewiesenes Band.</p><div className="form-grid">{IELTS_SKILLS.map(skill => <BandField key={skill} label={`${IELTS_LABELS[skill]} · geschätzt`} value={form.estimates[skill]} onChange={value => patch('estimates', { ...form.estimates, [skill]: value })} />)}</div></details>
    <label className="checkbox-row"><input type="checkbox" checked={form.enabled} onChange={event => patch('enabled', event.target.checked)} />IELTS in meinem Tagesplan berücksichtigen</label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Ziel speichern</Button></div>
  </form></Modal>;
}

function ScoreForm({ record, today, onSave, onClose }) {
  const [form, setForm] = useState(() => record || { id: id(), date: today, source: 'mock', skills: Object.fromEntries(IELTS_SKILLS.map(skill => [skill, null])), overall: null, notes: '' });
  const [error, setError] = useState('');
  const calculated = calculateIELTSOverall(form.skills);
  const patch = (key, value) => setForm(current => ({ ...current, [key]: value }));
  function submit(event) {
    event.preventDefault();
    if (!form.date || form.date > today) { setError('Wähle das tatsächliche Datum. Künftige Ergebnisse bleiben offen.'); return; }
    const values = [...IELTS_SKILLS.map(skill => form.skills[skill]), form.overall];
    if (values.some(value => value !== '' && value !== null && band(value) === null)) { setError('Bands müssen zwischen 0 und 9 liegen, in halben Schritten.'); return; }
    if (values.every(value => band(value) === null)) { setError('Trage mindestens ein Ergebnis ein. Unbekannte Bereiche bleiben leer.'); return; }
    onSave(form);
  }
  return <Modal title={record ? 'IELTS-Ergebnis bearbeiten' : 'IELTS-Ergebnis erfassen'} onClose={onClose}><form className="stack ielts-form" onSubmit={submit}>
    <div className="form-grid"><Field label="Ergebnisart"><select value={form.source} onChange={event => patch('source', event.target.value)}>{Object.entries(IELTS_SOURCES).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field><Field label="Datum"><input type="date" value={form.date} max={today} required onChange={event => patch('date', event.target.value)} /></Field></div>
    <p className="field-help">Übernimm vorhandene Bands aus deinem Ergebnis oder einer ausgewerteten Probeprüfung. Freies Schreiben und Sprechen werden hier nicht automatisch bewertet.</p>
    <div className="form-grid">{IELTS_SKILLS.map(skill => <BandField key={skill} label={`${IELTS_LABELS[skill]} · Band`} value={form.skills[skill]} onChange={value => patch('skills', { ...form.skills, [skill]: value })} />)}</div>
    {calculated !== null && <p className="ielts-calculated"><strong>Overall aus vier Bereichen: {fmt(calculated)}</strong><span className="field-help">Arithmetisches Mittel, nach IELTS-Regel auf ein halbes Band gerundet.</span></p>}
    <details className="product-details"><summary>Overall separat übernehmen</summary><BandField label="Berichtetes Overall Band (optional)" value={form.overall} onChange={value => patch('overall', value)} help="Nur eintragen, wenn dieses Ergebnis auf deinem Bericht steht. Es ersetzt keine unbekannten Einzelbereiche." /></details>
    {calculated !== null && band(form.overall) !== null && band(form.overall) !== calculated && <p className="field-help" role="status">Das berichtete Overall weicht von der Berechnung ab. Prüfe die Einträge; beide Angaben bleiben getrennt erhalten.</p>}
    <Field label="Notiz (optional)"><textarea rows="3" value={form.notes} maxLength="2000" onChange={event => patch('notes', event.target.value)} placeholder="Material, Testbedingungen oder Rückmeldung" /></Field>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Ergebnis speichern</Button></div>
  </form></Modal>;
}

function MistakeForm({ skill, value, onSave, onClose }) {
  const [note, setNote] = useState(value);
  return <Modal title={`${IELTS_LABELS[skill]} · Fehlernotizen`} onClose={onClose}><form className="stack" onSubmit={event => { event.preventDefault(); onSave(note); }}><Field label="Was passiert wiederholt?" help="Beschreibe einen konkreten Fehler und wie du ihn prüfen kannst."><textarea rows="5" autoFocus maxLength="2000" value={note} onChange={event => setNote(event.target.value)} placeholder="Zum Beispiel: Ich vergesse bei Task 2 den zweiten Teil der Frage." /></Field><div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Notiz speichern</Button></div></form></Modal>;
}

export default function IELTS({ data, today, onChange, notify }) {
  const [modal, setModal] = useState(null);
  const summary = getIELTSSummary(data, today);
  const settings = summary.data;
  function change(transform, message) {
    onChange(current => ({ ...current, ielts: normalizeIELTS(transform(normalizeIELTS(current.ielts))) }));
    setModal(null);
    notify?.(message);
  }
  const bestNext = summary.weakest || summary.skills.find(skill => skill.current === null) || summary.skills[0];
  const practice = getIELTSPractice(bestNext.skill, { days: summary.daysUntil, mistakes: bestNext.mistakes });
  return <section className="ielts-coach stack" aria-label="IELTS Academic">
    <section className="card stack"><SectionHeading title="IELTS Academic" action={<Button variant="secondary" onClick={() => setModal({ type: 'setup' })}>{summary.configured ? 'Ziel bearbeiten' : 'Ziel festlegen'}</Button>} />
      {!summary.configured ? <p className="muted">Lege dein Ziel fest oder erfasse eine Probeprüfung. Dein Lernplan berücksichtigt danach IELTS gemeinsam mit der Schule.</p> : <>
        <div className="ielts-overview"><div><span className="field-help">Nächste Prüfung</span><strong>{summary.daysUntil === null ? 'Datum offen' : summary.daysUntil < 0 ? 'Datum liegt zurück' : summary.daysUntil === 0 ? 'Heute' : `In ${summary.daysUntil} Tagen`}</strong>{settings.examDate && <span className="field-help">{dateLabel(settings.examDate)}</span>}</div><div><span className="field-help">Overall-Ziel</span><strong>{fmt(settings.targetOverall)}</strong><span className="field-help">{settings.weeklyMinutes} min / Woche{!settings.enabled ? ' · pausiert' : ''}</span></div></div>
        <p className="muted small">{summary.readiness}</p>
        {summary.complete && <p className="ielts-evidence"><strong>Overall {fmt(summary.overall)}</strong><span>{IELTS_SOURCES[summary.complete.source]} · {dateLabel(summary.complete.date)}</span></p>}
        {summary.reportedOverall && summary.reportedOverall.id !== summary.complete?.id && (!summary.complete || summary.reportedOverall.date >= summary.complete.date) && <p className="ielts-evidence"><strong>Berichtetes Overall {fmt(summary.reportedOverall.overall)}</strong><span>{IELTS_SOURCES[summary.reportedOverall.source]} · {dateLabel(summary.reportedOverall.date)} · Einzelbereiche unvollständig</span></p>}
      </>}
      <Button icon={Plus} onClick={() => setModal({ type: 'score', record: null })}>Ergebnis erfassen</Button>
    </section>

    {summary.configured && <section className="card ielts-skills"><h3>Deine vier Bereiche</h3>{summary.skills.map(skill => <details className="product-details ielts-skill" key={skill.skill}><summary><span>{skill.label}</span><span className="ielts-skill-bands">{fmt(skill.current)} <span className="muted">→ {fmt(skill.target)}</span></span></summary><div className="stack compact ielts-skill-content"><p className="field-help">{sourceLabel(skill.source)}{skill.date ? ` · ${dateLabel(skill.date)}` : ''}{skill.gap !== null ? ` · ${skill.gap > 0 ? `${fmt(skill.gap)} Bands bis zum Planungsziel` : 'Planungsziel in dieser Angabe erreicht'}` : ''}</p>{skill.trend !== null && <p className="small">Letzte zwei ausgewertete Ergebnisse: {skill.trend > 0 ? '+' : ''}{fmt(skill.trend)} Bands. {skill.trendSources[0] !== skill.trendSources[1] ? 'Unterschiedliche Ergebnisarten; nur eingeschränkt vergleichbar.' : 'Testbedingungen können unterschiedlich sein.'}</p>}<p>{getIELTSPractice(skill.skill, { days: summary.daysUntil }).title}</p>{skill.mistakes && <p className="ielts-mistake">{skill.mistakes}</p>}<Button variant="ghost" onClick={() => setModal({ type: 'mistake', skill: skill.skill })}>{skill.mistakes ? 'Fehlernotiz bearbeiten' : 'Fehlernotiz hinzufügen'}</Button></div></details>)}</section>}

    {summary.configured && <section className="card stack ielts-next"><span className="page-kicker">DEIN NÄCHSTER SCHRITT</span><h3>{practice.title}</h3><p className="muted small">{bestNext.gap > 0 ? `${bestNext.label} hat aktuell den größten bekannten Abstand zum Ziel.` : bestNext.current === null ? 'Hier fehlt noch eine Standortbestimmung.' : 'Halte deine Fähigkeiten mit gezielter Übung stabil.'} Dein Tagesplan lässt dafür Platz, wenn es zu deiner Schulbelastung passt.</p><details className="product-details"><summary>So übst du</summary><ol>{practice.steps.map(step => <li key={step.title}><strong>{step.title} · {step.minutes} min</strong><p>{step.instruction}</p></li>)}</ol><p className="field-help">{practice.assessmentNote}</p></details><a className="text-link" href={practice.resource.url} target="_blank" rel="noreferrer">Offizielle Beispielaufgaben<ArrowUpRight size={15} /></a></section>}

    {!!summary.scores.length && <section className="card"><details className="product-details ielts-history"><summary>Ergebnisse ({summary.scores.length})</summary>{summary.scores.map(record => { const overall = calculateIELTSOverall(record.skills); return <div className="list-row" key={record.id}><div className="grow"><strong>{IELTS_SOURCES[record.source]}</strong><p className="field-help">{dateLabel(record.date)}{overall !== null ? ` · Overall ${fmt(overall)} aus vier Bereichen` : record.overall !== null ? ` · berichtet ${fmt(record.overall)}` : ''}</p><p className="small muted">{IELTS_SKILLS.filter(skill => record.skills[skill] !== null).map(skill => `${IELTS_LABELS[skill]} ${fmt(record.skills[skill])}`).join(' · ')}</p>{record.notes && <p className="small muted">{record.notes}</p>}</div><button className="icon-button" aria-label={`IELTS-Ergebnis vom ${record.date} bearbeiten`} onClick={() => setModal({ type: 'score', record })}><Edit3 size={17} /></button><button className="icon-button" aria-label={`IELTS-Ergebnis vom ${record.date} löschen`} onClick={() => setModal({ type: 'delete', record })}><Trash2 size={17} /></button></div>; })}</details></section>}

    {modal?.type === 'setup' && <Setup data={settings} onClose={() => setModal(null)} onSave={value => change(() => value, 'IELTS-Ziel gespeichert. Dein Lernplan wird angepasst.')} />}
    {modal?.type === 'score' && <ScoreForm record={modal.record} today={today} onClose={() => setModal(null)} onSave={record => change(value => ({ ...value, scores: [...value.scores.filter(score => score.id !== record.id), record] }), 'Ergebnis gespeichert. Dein nächster Lernschritt wird angepasst.')} />}
    {modal?.type === 'mistake' && <MistakeForm skill={modal.skill} value={settings.mistakes[modal.skill]} onClose={() => setModal(null)} onSave={note => change(value => ({ ...value, mistakes: { ...value.mistakes, [modal.skill]: note } }), 'Fehlernotiz gespeichert.')} />}
    {modal?.type === 'delete' && <Modal title="Dieses Ergebnis löschen?" onClose={() => setModal(null)}><div className="stack"><p>{IELTS_SOURCES[modal.record.source]} vom {dateLabel(modal.record.date)} wird aus deinem Verlauf entfernt.</p><div className="sheet-footer"><Button variant="secondary" onClick={() => setModal(null)}>Behalten</Button><Button variant="danger" onClick={() => change(value => ({ ...value, scores: value.scores.filter(score => score.id !== modal.record.id) }), 'Ergebnis gelöscht.')}>Löschen</Button></div></div></Modal>}
  </section>;
}

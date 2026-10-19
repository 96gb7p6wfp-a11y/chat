import React, { useState } from 'react';
import { ArrowRight, CalendarDays, Check, Edit3, Plus, Trash2 } from 'lucide-react';
import { Button, EmptyState, Field, Modal, SectionHeading, formatDate } from './UI.jsx';
import { EVENT_TYPES, getUpcomingEvents, getEventPlan, saveEvent, removeEvent } from '../events.js';

const TYPE_LABELS = { exam: 'Klausur', internship: 'Praktikum', project: 'Projekt', application: 'Bewerbungsfrist', university: 'Hochschulfrist', test: 'Sprachtest / standardisierter Test', appointment: 'Termin', oral: 'Mündliche Leistung', presentation: 'Präsentation', homework: 'Hausaufgabe / Abgabe' };
const intentFor = (type) => type === 'internship' ? 'start' : ['application', 'university', 'project', 'homework'].includes(type) ? 'deadline' : 'milestone';
const dateLabel = (event) => `${formatDate(event.date, { day: 'numeric', month: 'short', year: 'numeric' })}${event.endDate ? ` – ${formatDate(event.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`;
const timeLabel = (event) => event.daysUntil === 0 ? 'Heute' : event.daysUntil === 1 ? 'Morgen' : event.daysUntil < 0 ? `${Math.abs(event.daysUntil)} Tagen her` : `In ${event.daysUntil} Tagen`;

export function UpcomingEvents({ data, today, onOpenEvents }) {
  const events = getUpcomingEvents(data, today).slice(0, 3);
  return <section className="card upcoming-events"><SectionHeading title="Nächste Termine" action={<Button variant="ghost" onClick={onOpenEvents}>Alle Termine <ArrowRight size={15} /></Button>} />
    {events.length ? <div className="stack compact">{events.map((event) => <button className="list-row upcoming-event" key={event.id} onClick={onOpenEvents} aria-label={`Termin öffnen ${event.title}`}><div className="grow"><strong>{event.title}</strong><p className="muted small">{TYPE_LABELS[event.type] || 'Meilenstein'} · {formatDate(event.date, { day: 'numeric', month: 'short' })}</p></div><span className="field-help nowrap">{timeLabel(event)}</span></button>)}</div> : <p className="muted small">Noch kein Termin. Trage deine nächste Prüfung oder Frist ein.</p>}
  </section>;
}

function EventForm({ data, event, today, onSave, onClose }) {
  const [form, setForm] = useState({ title: '', type: 'project', date: '', time: '', subjectId: '', preparation: '', endDate: '', intent: 'deadline', pathway: 'Both', minutes: 20, priority: 'medium', status: 'planned', notes: '', resource: '', createdDate: today, ...event, topics: (event?.topics || []).join('\n') });
  const [error, setError] = useState('');
  const patch = (key) => (e) => setForm((current) => ({ ...current, [key]: e.target.value }));
  function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Gib dem Termin einen Titel.'); return; }
    if (!form.date) { setError('Trage das tatsächliche Datum ein.'); return; }
    if (form.endDate && form.endDate < form.date) { setError('Das Ende darf nicht vor dem Beginn liegen.'); return; }
    if (!Number.isFinite(Number(form.minutes)) || form.minutes === '' || Number(form.minutes) < 5 || Number(form.minutes) > 120) { setError('Wähle 5–120 Minuten pro Vorbereitungsschritt.'); return; }
    try { onSave({ ...form, title: form.title.trim(), minutes: Number(form.minutes), topics: [...new Set(form.topics.split(/\n|,/).map(value => value.trim()).filter(Boolean))] }); } catch (failure) { setError(failure.message || 'Prüfe die Angaben zum Termin.'); }
  }
  return <Modal title={event ? 'Termin bearbeiten' : 'Termin hinzufügen'} onClose={onClose}><form className="stack" onSubmit={submit}>
    <Field label="Titel"><input value={form.title} onChange={patch('title')} placeholder="Marketingprojekt" maxLength={300} required /></Field>
    <Field label="Terminart"><select value={form.type} onChange={(e) => { const type = e.target.value; setForm((current) => ({ ...current, type, intent: intentFor(type) })); }}>{EVENT_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</select></Field>
    <div className="form-grid"><Field label="Datum"><input type="date" value={form.date} onChange={patch('date')} required /></Field><Field label="Enddatum · optional"><input type="date" value={form.endDate} onChange={patch('endDate')} min={form.date} /></Field></div>
    <div className="form-grid"><Field label="Uhrzeit · optional"><input type="time" value={form.time} onChange={patch('time')} /></Field><Field label="Fach · optional"><select value={form.subjectId} onChange={patch('subjectId')}><option value="">Kein bestimmtes Fach</option>{data.subjects.map(subject => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></Field></div>
    <Field label="Das Datum bezeichnet"><select value={form.intent} onChange={patch('intent')}><option value="deadline">Eine Abgabefrist</option><option value="start">Den Beginn</option><option value="milestone">Einen Prüfungs- oder Terminzeitpunkt</option></select></Field>
    <Field label="Lernzeit pro Schritt" help="Wie lange soll ein Vorbereitungsschritt dauern?"><input type="number" value={form.minutes} onChange={patch('minutes')} min={5} max={120} required /></Field>
    <div className="form-grid"><Field label="Studienweg"><select value={form.pathway} onChange={patch('pathway')}><option value="Both">Beide Studienwege</option><option value="USA">USA</option><option value="Germany">Deutschland</option></select></Field><Field label="Bedeutung"><select value={form.priority} onChange={patch('priority')}><option value="high">Hoch</option><option value="medium">Normal</option><option value="low">Gering</option></select></Field></div>
    <Field label="Status"><select value={form.status} onChange={patch('status')}><option value="planned">Geplant</option><option value="completed">Erledigt</option></select></Field>
    <Field label="Themen · optional"><textarea rows={3} value={form.topics} onChange={patch('topics')} maxLength={2500} /></Field>
    <Field label="Benötigte Vorbereitung"><textarea rows={3} value={form.preparation} onChange={patch('preparation')} maxLength={2500} /></Field>
    <Field label="Notizen" help="Weitere Hinweise zum Termin."><textarea rows={4} value={form.notes} onChange={patch('notes')} maxLength={4000} /></Field>
    <Field label="Offizieller Link · optional"><input type="url" value={form.resource} onChange={patch('resource')} placeholder="https://…" maxLength={1000} /></Field>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">{event ? 'Termin speichern' : 'Termin hinzufügen'}</Button></div>
  </form></Modal>;
}

export default function Events({ data, today, onChange, notify, onEditExam, onAddExam, onOpenProfile }) {
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const events = getUpcomingEvents(data, today, { includePast: showHistory, includeCompleted: showHistory });
  function edit(event) {
    if (event.source === 'custom') setEditing(data.events?.find((item) => item.id === event.sourceId) || null);
    else if (event.source === 'exam') onEditExam?.(event.sourceId);
    else onOpenProfile?.(event.source === 'ielts' ? 'IELTS' : event.source === 'university' ? 'Universities' : 'Goals');
  }
  function save(event) {
    // Validate synchronously so any rejected details remain in the form.
    saveEvent(data, event);
    onChange((current) => saveEvent(current, event));
    setEditing(null); notify?.('Termin gespeichert. Dein Lernplan wurde angepasst.');
  }
  return <div className="stack events-view"><SectionHeading title="Termine und Fristen" action={events.length ? <Button onClick={() => setEditing({})}><Plus size={17} /> Termin hinzufügen</Button> : undefined} />
    <div className="row spread wrap"><Button variant="ghost" onClick={onAddExam}>Prüfung hinzufügen <Plus size={15} /></Button><label className="checkbox-row small"><input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} /> Vergangene und erledigte anzeigen</label></div>
    {!events.length && <EmptyState icon={CalendarDays} title={showHistory ? 'Noch keine gespeicherten Termine' : 'Keine anstehenden Termine'} description="Trage eine Abgabe, ein Praktikum oder eine Bewerbungsfrist ein." action={<Button onClick={() => setEditing({})}><Plus size={17} /> Termin hinzufügen</Button>} />}
    {events.map((event) => {
      const stages = getEventPlan(data, event.id, today);
      return <section className="card event-card" key={event.id} data-event-id={event.id} data-event-source={event.source}><div className="row align-start"><div className="grow"><span className="chip event-type">{TYPE_LABELS[event.type] || 'Meilenstein'}{event.pathway !== 'Both' ? ` · ${event.pathway}` : ''}</span><h2>{event.title}</h2><p className="muted">{dateLabel(event)}{event.time ? ` · ${event.time}` : ''} · {event.intent === 'start' ? 'Beginn' : event.intent === 'deadline' ? 'Frist' : 'Meilenstein'} · {timeLabel(event)}</p>{event.status === 'completed' && <span className="chip">Erledigt</span>}</div><button className="icon-button" aria-label={`${event.title} bearbeiten`} onClick={() => edit(event)}><Edit3 size={17} /></button>{event.source === 'custom' && <button className="icon-button" aria-label={`${event.title} löschen`} onClick={() => setDeleting(event)}><Trash2 size={17} /></button>}</div>
        {event.preparation && <p className="muted small">{event.preparation}</p>}
        {event.notes && <p className="muted small">{event.notes}</p>}
        {event.pathway !== 'Both' && !data.profile.pathways.includes(event.pathway) && <p className="field-help">Dieser Studienweg ist derzeit inaktiv. Wähle {event.pathway} unter Profil → Ziele, damit die Vorbereitung im Tagesplan erscheint.</p>}
        {!!stages.length && <details className="revision-details"><summary>Vorbereitungsplan · {stages.filter((stage) => stage.completed).length}/{stages.length} Schritte erledigt</summary><div className="revision-timeline">{stages.map((stage) => <div className={`revision-stage ${stage.completed ? 'completed' : ''}`} key={stage.id}><span className="timeline-dot">{stage.completed && <Check size={12} />}</span><div><span className="field-help">{formatDate(stage.date, { day: 'numeric', month: 'short' })} · {stage.minutes} min</span><strong>{stage.title}</strong><p className="muted small">{stage.steps?.join(' ')}</p>{!stage.completed && stage.requiresContiguous && stage.practiceMinutes > 0 ? <span className="field-help">{stage.practiceMinutes} Minuten Teilübung erfasst. Für den Probelauf fehlen noch {stage.requiredMinutes} Minuten am Stück.</span> : stage.completedMinutes > 0 && !stage.completed && <span className="field-help">{stage.completedMinutes} / {stage.minutes} Minuten erledigt</span>}</div></div>)}</div></details>}
        {event.resource && <a className="text-link" href={event.resource} target="_blank" rel="noreferrer">Offizielle Informationen <ArrowRight size={13} /></a>}
      </section>;
    })}
    {editing !== null && <EventForm data={data} key={editing.id || 'new'} event={editing.id ? editing : null} today={today} onSave={save} onClose={() => setEditing(null)} />}
    {deleting && <Modal title="Termin entfernen?" onClose={() => setDeleting(null)}><p className="muted">Künftige Vorbereitung entfällt. Deine erledigten Aufgaben bleiben erhalten.</p><div className="sheet-footer"><Button variant="secondary" onClick={() => setDeleting(null)}>Behalten</Button><Button onClick={() => { onChange((current) => removeEvent(current, deleting.sourceId)); setDeleting(null); notify?.('Termin entfernt.'); }}>Termin entfernen</Button></div></Modal>}
  </div>;
}

import React, { useState } from 'react';
import { ArrowRight, CalendarDays, Check, Edit3, Plus, Trash2 } from 'lucide-react';
import { Button, EmptyState, Field, Modal, SectionHeading, formatDate } from './UI.jsx';
import { EVENT_TYPES, getUpcomingEvents, getEventPlan, saveEvent, removeEvent } from '../events.js';
import { shiftDate } from '../coach.js';

const TYPE_LABELS = { exam: 'School exam', internship: 'Internship', project: 'Project', application: 'Application deadline', university: 'University deadline', test: 'Language / standardized test', appointment: 'Other milestone' };
const intentFor = (type) => type === 'internship' ? 'start' : ['application', 'university', 'project'].includes(type) ? 'deadline' : 'milestone';
const dateLabel = (event) => `${formatDate(event.date, { day: 'numeric', month: 'short', year: 'numeric' })}${event.endDate ? ` – ${formatDate(event.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`;
const timeLabel = (event) => event.daysUntil === 0 ? 'Today' : event.daysUntil === 1 ? 'Tomorrow' : event.daysUntil < 0 ? `${Math.abs(event.daysUntil)} days ago` : `In ${event.daysUntil} days`;

export function UpcomingEvents({ data, today, onOpenEvents }) {
  const events = getUpcomingEvents(data, today).slice(0, 3);
  return <section className="card upcoming-events"><SectionHeading title="Upcoming events" action={<Button variant="ghost" onClick={onOpenEvents}>All events <ArrowRight size={15} /></Button>} />
    {events.length ? <div className="stack compact">{events.map((event) => <button className="list-row upcoming-event" key={event.id} onClick={onOpenEvents} aria-label={`View event ${event.title}`}><div className="grow"><strong>{event.title}</strong><p className="muted small">{TYPE_LABELS[event.type] || 'Milestone'} · {formatDate(event.date, { day: 'numeric', month: 'short' })}</p></div><span className="field-help nowrap">{timeLabel(event)}</span></button>)}</div> : <p className="muted small">No upcoming dates. Add your next exam or deadline in Events.</p>}
  </section>;
}

function EventForm({ event, today, onSave, onClose }) {
  const [form, setForm] = useState({ title: '', type: 'project', date: shiftDate(today, 14), endDate: '', intent: 'deadline', pathway: 'Both', minutes: 20, priority: 'medium', status: 'planned', notes: '', resource: '', createdDate: today, ...event });
  const [error, setError] = useState('');
  const patch = (key) => (e) => setForm((current) => ({ ...current, [key]: e.target.value }));
  function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Give the event a title.'); return; }
    if (!form.date) { setError('Choose a date.'); return; }
    if (form.endDate && form.endDate < form.date) { setError('The end date must be on or after the event date.'); return; }
    if (!Number.isFinite(Number(form.minutes)) || form.minutes === '' || Number(form.minutes) < 5 || Number(form.minutes) > 120) { setError('Choose 5–120 minutes for a preparation action.'); return; }
    try { onSave({ ...form, title: form.title.trim(), minutes: Number(form.minutes) }); } catch (failure) { setError(failure.message || 'Check the event details.'); }
  }
  return <Modal title={event ? 'Edit event' : 'Add an event'} onClose={onClose}><form className="stack" onSubmit={submit}>
    <Field label="Event title"><input value={form.title} onChange={patch('title')} placeholder="Restaurant marketing project" maxLength={300} required /></Field>
    <Field label="Event type"><select value={form.type} onChange={(e) => { const type = e.target.value; setForm((current) => ({ ...current, type, intent: intentFor(type) })); }}>{EVENT_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</select></Field>
    <div className="form-grid"><Field label="Date"><input type="date" value={form.date} onChange={patch('date')} required /></Field><Field label="End date (optional)"><input type="date" value={form.endDate} onChange={patch('endDate')} min={form.date} /></Field></div>
    <Field label="Date means"><select value={form.intent} onChange={patch('intent')}><option value="deadline">A deadline to meet</option><option value="start">The event starts</option><option value="milestone">A milestone or test date</option></select></Field>
    <Field label="Preparation minutes" help="How long should each preparation task take?"><input type="number" value={form.minutes} onChange={patch('minutes')} min={5} max={120} required /></Field>
    <div className="form-grid"><Field label="Pathway"><select value={form.pathway} onChange={patch('pathway')}><option value="Both">Both pathways</option><option value="USA">USA</option><option value="Germany">Germany</option></select></Field><Field label="Priority"><select value={form.priority} onChange={patch('priority')}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field></div>
    <Field label="Status"><select value={form.status} onChange={patch('status')}><option value="planned">Planned</option><option value="completed">Completed</option></select></Field>
    <Field label="Notes" help="What do you need to prepare?"><textarea rows={4} value={form.notes} onChange={patch('notes')} maxLength={4000} /></Field>
    <Field label="Official link (optional)"><input type="url" value={form.resource} onChange={patch('resource')} placeholder="https://…" maxLength={1000} /></Field>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">{event ? 'Save event' : 'Add event'}</Button></div>
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
    else onOpenProfile?.(event.source === 'university' ? 'Universities' : 'Goals');
  }
  function save(event) {
    // Validate synchronously so any rejected details remain in the form.
    saveEvent(data, event);
    onChange((current) => saveEvent(current, event));
    setEditing(null); notify?.('Event saved. Your plan is updated.');
  }
  return <div className="stack events-view"><SectionHeading title="Events & deadlines" action={events.length ? <Button onClick={() => setEditing({})}><Plus size={17} /> Add event</Button> : undefined} />
    <div className="row spread wrap"><Button variant="ghost" onClick={onAddExam}>Add exam <Plus size={15} /></Button><label className="checkbox-row small"><input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} /> Include past and completed</label></div>
    {!events.length && <EmptyState icon={CalendarDays} title={showHistory ? 'No saved events' : 'No upcoming events'} description="Add a project, internship or application date to plan ahead." action={<Button onClick={() => setEditing({})}><Plus size={17} /> Add event</Button>} />}
    {events.map((event) => {
      const stages = getEventPlan(data, event.id, today);
      return <section className="card event-card" key={event.id} data-event-id={event.id} data-event-source={event.source}><div className="row align-start"><div className="grow"><span className="chip event-type">{TYPE_LABELS[event.type] || 'Milestone'}{event.pathway !== 'Both' ? ` · ${event.pathway}` : ''}</span><h2>{event.title}</h2><p className="muted">{dateLabel(event)} · {event.intent === 'start' ? 'Starts' : event.intent === 'deadline' ? 'Deadline' : 'Milestone'} · {timeLabel(event)}</p>{event.status === 'completed' && <span className="chip">Completed</span>}</div><button className="icon-button" aria-label={`Edit ${event.title}`} onClick={() => edit(event)}><Edit3 size={17} /></button>{event.source === 'custom' && <button className="icon-button" aria-label={`Delete ${event.title}`} onClick={() => setDeleting(event)}><Trash2 size={17} /></button>}</div>
        {event.notes && <p className="muted small">{event.notes}</p>}
        {event.pathway !== 'Both' && !data.profile.pathways.includes(event.pathway) && <p className="field-help">This pathway is currently inactive. Select {event.pathway} in Profile → Goals for its preparation to enter your daily plan.</p>}
        {!!stages.length && <details className="revision-details"><summary>Preparation plan · {stages.filter((stage) => stage.completed).length}/{stages.length} steps complete</summary><div className="revision-timeline">{stages.map((stage) => <div className={`revision-stage ${stage.completed ? 'completed' : ''}`} key={stage.id}><span className="timeline-dot">{stage.completed && <Check size={12} />}</span><div><span className="field-help">{formatDate(stage.date, { day: 'numeric', month: 'short' })} · {stage.minutes} min</span><strong>{stage.title}</strong><p className="muted small">{stage.steps?.join(' ')}</p>{!stage.completed && stage.requiresContiguous && stage.practiceMinutes > 0 ? <span className="field-help">{stage.practiceMinutes} min of section practice recorded. One uninterrupted {stage.requiredMinutes}-minute rehearsal is still needed.</span> : stage.completedMinutes > 0 && !stage.completed && <span className="field-help">{stage.completedMinutes} / {stage.minutes} min completed</span>}</div></div>)}</div></details>}
        {event.resource && <a className="text-link" href={event.resource} target="_blank" rel="noreferrer">Official information <ArrowRight size={13} /></a>}
      </section>;
    })}
    {editing !== null && <EventForm key={editing.id || 'new'} event={editing.id ? editing : null} today={today} onSave={save} onClose={() => setEditing(null)} />}
    {deleting && <Modal title="Remove this event?" onClose={() => setDeleting(null)}><p className="muted">Its date and future preparation are removed. Your completed task history remains.</p><div className="sheet-footer"><Button variant="secondary" onClick={() => setDeleting(null)}>Keep event</Button><Button onClick={() => { onChange((current) => removeEvent(current, deleting.sourceId)); setDeleting(null); notify?.('Event removed.'); }}>Remove event</Button></div></Modal>}
  </div>;
}

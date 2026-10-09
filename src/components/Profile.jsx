import React, { useId, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronRight, Edit3, Globe2, GraduationCap, Layers3, Plus, Settings2, Trash2, Upload } from 'lucide-react';
import { saveProfile, saveSubject, saveActivity, saveUniversity, removeActivity, removeUniversity } from '../coach.js';
import { Modal } from './UI.jsx';

const FIELDS = ['Business Informatics', 'Data / Computer Science', 'Business', 'Engineering / Technology'];
const LEVELS = ['Not sure yet', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native / fluent', 'Native / near-native'];
const TABS = ['Goals', 'Subjects', 'Activities', 'Universities', 'Timetable', 'Settings'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function studyTime(minutes) { return minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes} min`; }
const emptyActivity = { name: '', type: 'Project', startDate: '', endDate: '', hoursPerWeek: '', weeksPerYear: '', description: '', responsibilities: '', achievements: '', impact: '', notes: '' };
const emptyUniversity = { name: '', country: 'USA', program: '', deadline: '', requirements: '', notes: '', url: '', status: 'researching' };
const id = () => globalThis.crypto?.randomUUID?.() || `record-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const splitTopics = value => value.split(/[\n,]/).map(s => s.trim()).filter(Boolean);

function FormField({ label, help, children }) { const generatedId = useId(); const fieldId = children.props.id || generatedId; return <div className="field"><label className="field-label" htmlFor={fieldId}>{label}</label>{React.cloneElement(children, { id: fieldId, 'aria-describedby': help ? `${fieldId}-help` : children.props['aria-describedby'] })}{help && <span id={`${fieldId}-help`} className="field-help">{help}</span>}</div>; }
function ErrorNote({ error }) { return error ? <p className="form-error" role="alert">{error}</p> : null; }
function Actions({ onCancel, label = 'Save changes' }) { return <div className="sheet-footer"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><button type="submit" className="button button-primary"><Check size={16}/>{label}</button></div>; }
function safeLink(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
function dateLabel(value) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No deadline saved'; }
function SampleNote({ data }) { return data.demo || data.demoData || data.isDemo ? <p className="sample-note">Sample data is here to help you try the app. Replace it with your own information.</p> : null; }

export default function Profile({ data, today, onChange, notify, onRestartSetup, onExport, onImport, onOpenSchedule, initialSection = 'Goals' }) {
  const [tab, setTab] = useState(TABS.includes(initialSection) ? initialSection : 'Goals');
  const [modal, setModal] = useState(null);
  const [pathway, setPathway] = useState('All');
  const tabKey = event => {
    const index = TABS.indexOf(tab);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault(); setTab(TABS[next]); document.getElementById(`tab-${TABS[next].toLowerCase()}`)?.focus();
  };
  const change = (updater, message) => { onChange(updater); if (message) notify?.(message); };
  const remove = () => {
    if (modal.kind === 'activity') change(s => removeActivity(s, modal.record.id), 'Activity removed.');
    else if (modal.kind === 'university') change(s => removeUniversity(s, modal.record.id), 'University removed.');
    else if (modal.kind === 'test') change(s => saveProfile(s, { testPlans: (s.profile.testPlans || []).filter(t => t.id !== modal.record.id) }), 'Test plan removed.');
    else change(s => ({ ...s, subjects: s.subjects.map(subject => subject.id === modal.record.id ? { ...subject, enabled: false } : subject) }), 'Subject archived. Its past tasks are kept.');
    setModal(null);
  };
  return <div className="profile-page stack">
    <header className="page-header"><div className="page-kicker">YOUR DIRECTION</div><h1 className="page-title">Profile</h1><p className="muted">Goals, grades and the time you have.</p></header>
    <div className="tabs-scroll" role="tablist" aria-label="Profile sections" onKeyDown={tabKey}>{TABS.map(name => <button type="button" role="tab" tabIndex={tab === name ? 0 : -1} aria-selected={tab === name} aria-controls={`profile-${name.toLowerCase()}`} id={`tab-${name.toLowerCase()}`} key={name} onClick={() => setTab(name)} className={tab === name ? 'active' : ''}>{name}</button>)}</div>
    <SampleNote data={data}/>
    <section id={`profile-${tab.toLowerCase()}`} role="tabpanel" aria-labelledby={`tab-${tab.toLowerCase()}`} className="stack">
      {tab === 'Goals' && <>
        <section className="card stack"><div className="section-heading"><div><p className="page-kicker">THE LONG VIEW</p><h2>{data.profile.name ? `${data.profile.name}’s next chapter` : 'Your next chapter'}</h2></div><button className="icon-button" aria-label="Edit goals" onClick={() => setModal({ type: 'goals' })}><Edit3 size={18}/></button></div>
          <div className="stats-grid"><div className="stat"><span className="muted">School year</span><strong className="metric">{data.profile.schoolYear || 'Q1'}</strong></div><div className="stat"><span className="muted">Abitur</span><strong className="metric">{data.profile.graduationYear}</strong></div></div>
          <p className="muted">{data.profile.schoolSystem || 'Gymnasium · Hessen'}</p>
          <div className="row wrap">{(data.profile.pathways || ['USA', 'Germany']).map(item => <span className="chip" key={item}><Globe2 size={14}/>{item}</span>)}</div>
          <div><span className="field-label">Study interests</span><p>{data.profile.targetFields?.length ? data.profile.targetFields.join(' · ') : 'Still exploring'}</p></div>
          <div className="row wrap"><span className="chip">English · {data.profile.englishLevel || 'Not set yet'}</span><span className="chip">German · {data.profile.germanLevel || 'Not set yet'}</span></div>

          {(data.profile.applicationYear || data.profile.universityStartYear) && <p className="muted">{data.profile.applicationYear && `Application year: ${data.profile.applicationYear}`}{data.profile.applicationYear && data.profile.universityStartYear ? ' · ' : ''}{data.profile.universityStartYear && `University entry: ${data.profile.universityStartYear}`}</p>}
        </section>
        <section className="card stack"><div className="section-heading"><div><h2>Language & tests</h2><p className="muted">Choose tests when you know what you need.</p></div>{!!data.profile.testPlans?.length && <button className="icon-button" aria-label="Add test plan" onClick={() => setModal({ type: 'test', record: null })}><Plus size={19}/></button>}</div>
          {(data.profile.testPlans || []).length ? data.profile.testPlans.map(test => <div className="list-row" key={test.id}><div><strong>{test.name}</strong><p className="muted">{test.status || 'Researching'}{test.targetScore ? ` · Target ${test.targetScore}` : ''}{test.targetDate ? ` · ${dateLabel(test.targetDate)}` : ''}</p>{test.notes && <p className="field-help">{test.notes}</p>}</div><div className="row"><button className="icon-button" aria-label={`Edit ${test.name} plan`} onClick={() => setModal({ type: 'test', record: test })}><Edit3 size={17}/></button><button className="icon-button" aria-label={`Remove ${test.name} plan`} onClick={() => setModal({ type: 'delete', kind: 'test', record: test })}><Trash2 size={17}/></button></div></div>) : <div className="empty-state"><h3>No test planned</h3><p className="muted">Add one when you have checked your university requirements.</p><button className="button button-secondary" onClick={() => setModal({ type: 'test', record: null })}>Add test plan</button></div>}
          <details className="profile-details"><summary>Which tests do I need?</summary><div className="stack"><p className="muted">Tests marked Preparing or Booked guide your daily plan. A Considering date is a reminder to decide.</p><p className="muted">UCLA and UC Berkeley currently do not use SAT / ACT scores for admission or scholarships. Check English requirements for your entry year.</p><a className="button button-ghost" href="https://admission.universityofcalifornia.edu/admission-requirements/freshman-requirements/" target="_blank" rel="noreferrer">Check UC requirements <ArrowUpRight size={15}/></a></div></details>
        </section>
      </>}
      {tab === 'Subjects' && <><div className="section-heading"><div><h2>Your subjects</h2><p className="muted">Current and target grades · 0–15 points</p></div>{data.subjects.some(subject => subject.enabled !== false) && <button className="button button-secondary" onClick={() => setModal({ type: 'subject', record: null })}><Plus size={16}/>Add</button>}</div>
        {data.subjects.filter(s => s.enabled !== false).map(subject => <section className="card stack" key={subject.id}><div className="section-heading"><div className="row"><span className="subject-icon"><BookOpen size={18}/></span><div><h3>{subject.name}</h3><span className="muted">{subject.level === 'LK' ? 'Leistungskurs' : 'Grundkurs'}</span></div></div><div className="row"><button className="icon-button" aria-label={`Edit ${subject.name}`} onClick={() => setModal({ type: 'subject', record: subject })}><Edit3 size={18}/></button><button className="icon-button" aria-label={`Archive ${subject.name}`} onClick={() => setModal({ type: 'delete', kind: 'subject', record: subject })}><Trash2 size={17}/></button></div></div>
          <div className="stats-grid"><div className="stat"><span className="muted">Written</span><strong>{subject.written ?? '—'}<small> / 15</small></strong></div><div className="stat"><span className="muted">Oral</span><strong>{subject.oral ?? '—'}<small> / 15</small></strong></div><div className="stat"><span className="muted">Target</span><strong>{subject.target ?? '—'}<small> / 15</small></strong></div></div>
          {!!subject.weakTopics?.length && <div className="row wrap">{subject.weakTopics.map((topic, i) => <span className="chip" key={`${topic}-${i}`}>{topic}</span>)}</div>}
          {data.exams?.filter(e => e.subjectId === subject.id && e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 1).map(exam => <p className="field-help" key={exam.id}>Next exam · {exam.title} · {dateLabel(exam.date)}</p>)}
        </section>)}
        {!data.subjects.some(s => s.enabled !== false) && <section className="card empty-state"><BookOpen size={24}/><h3>Add your first subject</h3><p className="muted">Your grades help choose what to focus on.</p><button className="button button-primary" onClick={() => setModal({ type: 'subject', record: null })}>Add subject</button></section>}
      </>}
      {tab === 'Activities' && <><div className="section-heading"><div><h2>Application profile</h2><p className="muted">Your experience, responsibilities and achievements.</p></div>{!!data.activities.length && <button className="button button-secondary" onClick={() => setModal({ type: 'activity', record: null })}><Plus size={16}/>Add</button>}</div>
        {data.activities.length ? data.activities.map(activity => <section className="card stack" key={activity.id}><div className="section-heading"><div><span className="chip">{activity.type || 'Activity'}</span><h3>{activity.name}</h3></div><div className="row"><button className="icon-button" aria-label={`Edit ${activity.name}`} onClick={() => setModal({ type: 'activity', record: activity })}><Edit3 size={18}/></button><button className="icon-button" aria-label={`Remove ${activity.name}`} onClick={() => setModal({ type: 'delete', kind: 'activity', record: activity })}><Trash2 size={17}/></button></div></div>
          {activity.description && <p>{activity.description}</p>}{!activity.description && !activity.responsibilities && !activity.achievements && !activity.impact && <p className="muted">Add your role and what you have achieved.</p>}<div className="row wrap">{activity.hoursPerWeek != null && activity.hoursPerWeek !== '' && <span className="chip">{activity.hoursPerWeek} h / week</span>}{activity.weeksPerYear != null && activity.weeksPerYear !== '' && <span className="chip">{activity.weeksPerYear} weeks / year</span>}</div>
          {(activity.startDate || activity.endDate) && <p className="field-help">{activity.startDate ? dateLabel(activity.startDate) : 'Start not recorded'} → {activity.endDate ? dateLabel(activity.endDate) : 'Ongoing'}</p>}
          {activity.responsibilities && <div><span className="field-label">Responsibilities</span><p>{activity.responsibilities}</p></div>}{activity.achievements && <div><span className="field-label">Achievements</span><p>{activity.achievements}</p></div>}{activity.impact && <div><span className="field-label">Measurable impact</span><p>{activity.impact}</p></div>}
          {activity.notes && <details><summary>Personal notes</summary><p className="muted">{activity.notes}</p></details>}
        </section>) : <section className="card empty-state"><Layers3 size={25}/><h3>No activities yet</h3><p className="muted">Add a sport, work experience, internship or project.</p><button className="button button-primary" onClick={() => setModal({ type: 'activity', record: null })}>Add an activity</button></section>}

      </>}
      {tab === 'Universities' && <><div className="section-heading"><div><h2>Your shortlist</h2><p className="muted">Explore both routes before choosing.</p></div>{data.universities.some(university => pathway === 'All' || university.country === pathway) && <button className="button button-secondary" onClick={() => setModal({ type: 'university', record: null })}><Plus size={16}/>Add</button>}</div>
        <div className="segmented" role="group" aria-label="Filter universities">{['All', 'USA', 'Germany'].map(value => <button key={value} aria-pressed={pathway === value} className={pathway === value ? 'active' : ''} onClick={() => setPathway(value)}>{value}</button>)}</div>
        {data.universities.filter(u => pathway === 'All' || u.country === pathway).map(university => <section className="card stack" key={university.id}><div className="section-heading"><div><span className="chip">{university.country} · {university.status || 'researching'}</span><h3>{university.name}</h3>{university.program && <p className="muted">{university.program}</p>}</div><div className="row"><button className="icon-button" aria-label={`Edit ${university.name}`} onClick={() => setModal({ type: 'university', record: university })}><Edit3 size={18}/></button><button className="icon-button" aria-label={`Remove ${university.name}`} onClick={() => setModal({ type: 'delete', kind: 'university', record: university })}><Trash2 size={17}/></button></div></div>
          <p className="field-help">{university.deadline ? `Deadline · ${dateLabel(university.deadline)}` : 'No deadline saved'}</p>{university.requirements && <div><span className="field-label">Requirements / NC notes</span><p>{university.requirements}</p></div>}{university.notes && <p className="muted">{university.notes}</p>}{safeLink(university.url) && <a className="button button-ghost" href={safeLink(university.url)} target="_blank" rel="noreferrer">Official information <ArrowUpRight size={15}/></a>}
        </section>)}
        {!data.universities.some(u => pathway === 'All' || u.country === pathway) && <section className="card empty-state"><GraduationCap size={25}/><h3>Save a university to explore</h3><p className="muted">Keep programs, requirements and deadlines together.</p><button className="button button-primary" onClick={() => setModal({ type: 'university', record: null })}>Save a university</button></section>}

      </>}
      {tab === 'Timetable' && <>
        <section className="card stack"><div className="section-heading"><div><h2>Weekly study time</h2><p className="muted">A realistic limit for each day.</p></div><CalendarDays size={20}/></div>
          {[1, 2, 3, 4, 5, 6, 0].map(day => { const available = data.schedule.weekly.find(item => item.day === day); return <div className="list-row" key={day}><span>{DAYS[day]}</span><strong>{studyTime(available?.minutes || 0)}</strong></div>; })}
          <button className="button button-secondary" onClick={onOpenSchedule}>Edit study time <ChevronRight size={17}/></button>
        </section>
        <section className="card stack"><h2>Recurring commitments</h2>{data.schedule.fixedActivities.length ? data.schedule.fixedActivities.map(activity => <div className="list-row" key={activity.id}><div><strong>{activity.title}</strong><p className="muted">{activity.date ? dateLabel(activity.date) : activity.days.map(day => DAYS[day].slice(0, 3)).join(', ')} · {activity.start}–{activity.end}</p></div></div>) : <p className="muted">No commitments added yet.</p>}<button className="button button-secondary" onClick={onOpenSchedule}>{data.schedule.fixedActivities.length ? 'Edit commitments' : 'Add a commitment'}<ChevronRight size={17}/></button></section>
      </>}
      {tab === 'Settings' && <>
        <section className="card stack"><div className="section-heading"><h2>Appearance</h2><Settings2 size={19}/></div><FormField label="Theme"><select value={data.profile.theme || 'system'} onChange={event => change(s => saveProfile(s, { theme: event.target.value }))}><option value="system">Match device</option><option value="light">Light</option><option value="dark">Dark</option></select></FormField></section>
        <section className="card stack"><h2>Your data</h2><p className="muted">Your plan is saved on this device. Keep a backup before clearing browser data or changing devices.</p><div className="row wrap"><button className="button button-secondary" onClick={onExport}><ArrowDownToLine size={17}/>Export backup</button><button className="button button-secondary" onClick={onImport}><Upload size={17}/>Restore backup</button></div><p className="field-help">Backups include your grades and personal notes.</p></section>
        <section className="card stack"><h2>Make the plan yours</h2><p className="muted">Review your goals, grades and weekly availability.</p><button className="button button-secondary" onClick={onRestartSetup}>Revisit guided setup <ChevronRight size={17}/></button></section>
      </>}
    </section>
    {modal?.type === 'goals' && <GoalsForm profile={data.profile} onClose={() => setModal(null)} onSave={patch => { change(s => saveProfile(s, patch), 'Goals saved.'); setModal(null); }}/>}
    {modal?.type === 'subject' && <SubjectForm subject={modal.record} onClose={() => setModal(null)} onSave={record => { change(s => saveSubject(s, record), 'Subject saved.'); setModal(null); }}/>}
    {modal?.type === 'activity' && <ActivityForm activity={modal.record} onClose={() => setModal(null)} onSave={record => { change(s => saveActivity(s, { ...record, updatedDate: today }), 'Activity saved.'); setModal(null); }}/>}
    {modal?.type === 'university' && <UniversityForm university={modal.record} defaultCountry={pathway === 'Germany' ? 'Germany' : 'USA'} onClose={() => setModal(null)} onSave={record => { change(s => saveUniversity(s, record), 'University saved.'); setModal(null); }}/>}
    {modal?.type === 'test' && <TestForm test={modal.record} onClose={() => setModal(null)} onSave={record => { change(s => saveProfile(s, { testPlans: [...(s.profile.testPlans || []).filter(t => t.id !== record.id), record] }), 'Test plan saved.'); setModal(null); }}/>}
    {modal?.type === 'delete' && <Modal title={modal.kind === 'subject' ? 'Archive this subject?' : `Remove this ${modal.kind}?`} onClose={() => setModal(null)}><div className="stack"><p>{modal.record.name}{modal.kind === 'subject' ? ' will stop appearing in future study plans. Past completion records are kept.' : ' will be removed from your profile. Past task completion records are kept.'}</p><div className="sheet-footer"><button className="button button-secondary" onClick={() => setModal(null)}>Keep it</button><button className="button button-danger" onClick={remove}>{modal.kind === 'subject' ? 'Archive subject' : 'Remove'}</button></div></div></Modal>}
  </div>;
}

function GoalsForm({ profile, onClose, onSave }) {
  const [form, setForm] = useState({ ...profile, name: profile.name || '', applicationYear: profile.applicationYear || '', universityStartYear: profile.universityStartYear || '', targetFields: profile.targetFields || [], pathways: profile.pathways || ['USA', 'Germany'] });
  const [otherFields, setOtherFields] = useState((profile.targetFields || []).filter(f => !FIELDS.includes(f)).join(', '));
  const [error, setError] = useState('');
  const patch = (key, value) => setForm(s => ({ ...s, [key]: value }));
  function submit(event) { event.preventDefault(); if (!form.pathways.length) return setError('Choose at least one university pathway.'); const graduation = Number(form.graduationYear); if (!Number.isInteger(graduation) || graduation < 2026 || graduation > 2040) return setError('Choose a graduation year between 2026 and 2040.'); for (const key of ['applicationYear', 'universityStartYear']) if (form[key] && (!Number.isInteger(Number(form[key])) || Number(form[key]) < 2026 || Number(form[key]) > 2042)) return setError('Use a year between 2026 and 2042, or leave it undecided.'); onSave({ ...form, targetFields: [...new Set([...form.targetFields.filter(f => FIELDS.includes(f)), ...splitTopics(otherFields)])], graduationYear: graduation, applicationYear: form.applicationYear ? Number(form.applicationYear) : null, universityStartYear: form.universityStartYear ? Number(form.universityStartYear) : null }); }
  return <Modal title="Your goals" onClose={onClose}><form className="stack" onSubmit={submit}>
    <FormField label="Your name (optional)"><input value={form.name} onChange={e => patch('name', e.target.value)} maxLength={80} autoComplete="given-name"/></FormField>
    <div className="form-grid"><FormField label="Current school year"><select value={form.schoolYear || 'Q1'} onChange={e => patch('schoolYear', e.target.value)}>{['E1', 'E2', 'Q1', 'Q2', 'Q3', 'Q4', 'Graduated'].map(s => <option key={s}>{s}</option>)}</select></FormField><FormField label="Expected Abitur year"><input type="number" min="2026" max="2040" required value={form.graduationYear} onChange={e => patch('graduationYear', e.target.value)}/></FormField></div>
    <FormField label="School system"><input value={form.schoolSystem || ''} onChange={e => patch('schoolSystem', e.target.value)} maxLength={120}/></FormField>
    <fieldset className="field"><legend className="field-label">University pathways</legend><div className="row wrap">{['USA', 'Germany'].map(value => <label className="checkbox-label" key={value}><input type="checkbox" checked={form.pathways.includes(value)} onChange={e => patch('pathways', e.target.checked ? [...form.pathways, value] : form.pathways.filter(p => p !== value))}/>{value}</label>)}</div></fieldset>
    <fieldset className="field"><legend className="field-label">Study interests</legend><div className="stack">{FIELDS.map(value => <label className="checkbox-label" key={value}><input type="checkbox" checked={form.targetFields.includes(value)} onChange={e => patch('targetFields', e.target.checked ? [...form.targetFields, value] : form.targetFields.filter(p => p !== value))}/>{value}</label>)}</div></fieldset>
    <FormField label="Other interests (comma separated)"><input value={otherFields} onChange={e => setOtherFields(e.target.value)} maxLength={300}/></FormField>
    <div className="form-grid"><FormField label="English level"><select value={form.englishLevel || 'Not sure yet'} onChange={e => patch('englishLevel', e.target.value)}>{LEVELS.map(v => <option key={v}>{v}</option>)}</select></FormField><FormField label="German level"><select value={form.germanLevel || 'Not sure yet'} onChange={e => patch('germanLevel', e.target.value)}>{LEVELS.map(v => <option key={v}>{v}</option>)}</select></FormField></div>
    <div className="form-grid"><FormField label="Application year (optional)" help="The year you begin the US application cycle, or the year you apply in Germany."><input type="number" min="2026" max="2042" placeholder="Undecided" value={form.applicationYear} onChange={e => patch('applicationYear', e.target.value)}/></FormField><FormField label="University entry year (optional)"><input type="number" min="2026" max="2042" placeholder="Undecided" value={form.universityStartYear} onChange={e => patch('universityStartYear', e.target.value)}/></FormField></div>
    <ErrorNote error={error}/><Actions onCancel={onClose}/>
  </form></Modal>;
}

function SubjectForm({ subject, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', level: 'GK', target: 10, enabled: true, ...subject, written: subject?.written ?? '', oral: subject?.oral ?? '', topicsText: subject?.weakTopics?.join('\n') || '' });
  const [error, setError] = useState(''); const patch = (k, v) => setForm(s => ({ ...s, [k]: v }));
  function submit(event) { event.preventDefault(); if (!form.name.trim()) return setError('Enter a subject name.'); for (const field of ['written', 'oral', 'target']) if (form[field] !== '' && (!Number.isFinite(Number(form[field])) || Number(form[field]) < 0 || Number(form[field]) > 15)) return setError('Grades must be between 0 and 15 points.'); const { topicsText, ...record } = form; onSave({ ...record, name: form.name.trim(), written: form.written === '' ? null : Number(form.written), oral: form.oral === '' ? null : Number(form.oral), target: form.target === '' ? null : Number(form.target), weakTopics: splitTopics(topicsText), enabled: true }); }
  return <Modal title={subject ? 'Edit subject' : 'Add subject'} onClose={onClose}><form className="stack" onSubmit={submit}><FormField label="Subject name"><input required value={form.name} onChange={e => patch('name', e.target.value)} maxLength={80}/></FormField><FormField label="Course"><select value={form.level} onChange={e => patch('level', e.target.value)}><option value="GK">Grundkurs</option><option value="LK">Leistungskurs</option></select></FormField><div className="form-grid">{[['written', 'Written points'], ['oral', 'Oral points'], ['target', 'Target points']].map(([key, label]) => <FormField label={label} key={key}><input type="number" min="0" max="15" step="0.5" placeholder="Not recorded" value={form[key]} onChange={e => patch(key, e.target.value)}/></FormField>)}</div><FormField label="Weak topics" help="One topic per line, or separate with commas."><textarea rows="4" value={form.topicsText} onChange={e => patch('topicsText', e.target.value)} maxLength={1500} placeholder="e.g. derivatives, vectors, probability"/></FormField><ErrorNote error={error}/><Actions onCancel={onClose}/></form></Modal>;
}

function ActivityForm({ activity, onClose, onSave }) {
  const [form, setForm] = useState({ ...emptyActivity, ...activity, hoursPerWeek: activity?.hoursPerWeek ?? '', weeksPerYear: activity?.weeksPerYear ?? '' });
  const [error, setError] = useState('');
  const patch = (key, value) => setForm(current => ({ ...current, [key]: value }));
  function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Give this activity a name.');
    if (form.endDate && form.startDate && form.endDate < form.startDate) return setError('The end date must be on or after the start date. Leave it blank for an ongoing activity.');
    if (form.hoursPerWeek !== '' && (!Number.isFinite(Number(form.hoursPerWeek)) || Number(form.hoursPerWeek) < 0 || Number(form.hoursPerWeek) > 168)) return setError('Hours per week must be between 0 and 168.');
    if (form.weeksPerYear !== '' && (!Number.isFinite(Number(form.weeksPerYear)) || Number(form.weeksPerYear) < 0 || Number(form.weeksPerYear) > 52)) return setError('Weeks per year must be between 0 and 52.');
    onSave({ ...form, name: form.name.trim(), hoursPerWeek: form.hoursPerWeek === '' ? null : Number(form.hoursPerWeek), weeksPerYear: form.weeksPerYear === '' ? null : Number(form.weeksPerYear) });
  }
  return <Modal title={activity ? 'Edit activity' : 'Add an activity'} onClose={onClose}><form className="stack" onSubmit={submit}>
    <FormField label="Activity name"><input required value={form.name} onChange={event => patch('name', event.target.value)} maxLength={120} placeholder="e.g. Competitive volleyball"/></FormField>
    <FormField label="Type"><select value={form.type} onChange={event => patch('type', event.target.value)}>{['Sport', 'Work / Entrepreneurship', 'Leadership', 'Volunteering', 'Internship', 'Project', 'Competition', 'Marketing', 'Other'].map(type => <option key={type}>{type}</option>)}</select></FormField>
    <div className="form-grid">
      <FormField label="Start date (optional)"><input type="date" value={form.startDate} onChange={event => patch('startDate', event.target.value)}/></FormField>
      <FormField label="End date (optional)" help="Leave blank if you are still involved."><input type="date" value={form.endDate || ''} onChange={event => patch('endDate', event.target.value)}/></FormField>
    </div>
    <div className="form-grid">
      <FormField label="Hours per week"><input type="number" min="0" max="168" step="0.5" placeholder="Not recorded" value={form.hoursPerWeek} onChange={event => patch('hoursPerWeek', event.target.value)}/></FormField>
      <FormField label="Weeks per year"><input type="number" min="0" max="52" placeholder="Not recorded" value={form.weeksPerYear} onChange={event => patch('weeksPerYear', event.target.value)}/></FormField>
    </div>
    <FormField label="What you do"><textarea rows="3" value={form.description} onChange={event => patch('description', event.target.value)} maxLength={3000} placeholder="Your role and what the activity involves"/></FormField>
    <FormField label="Responsibilities"><textarea rows="3" value={form.responsibilities || ''} onChange={event => patch('responsibilities', event.target.value)} maxLength={4000} placeholder="What you own: training, managing shifts, creating campaigns…"/></FormField>
    <FormField label="Achievements"><textarea rows="3" value={form.achievements} onChange={event => patch('achievements', event.target.value)} maxLength={3000} placeholder="Verified results, growth or recognition"/></FormField>
    <FormField label="Measurable impact"><textarea rows="2" value={form.impact} onChange={event => patch('impact', event.target.value)} maxLength={2000} placeholder="e.g. people served, events organised, audience growth"/></FormField>
    <FormField label="Personal notes"><textarea rows="2" value={form.notes || ''} onChange={event => patch('notes', event.target.value)} maxLength={4000} placeholder="What you learned, evidence to keep, or a future essay idea"/></FormField>
    <ErrorNote error={error}/><Actions onCancel={onClose} label="Save activity"/>
  </form></Modal>;
}

function UniversityForm({ university, defaultCountry = 'USA', onClose, onSave }) {
  const [form, setForm] = useState({ ...emptyUniversity, country: defaultCountry, ...university }); const [error, setError] = useState(''); const patch = (k, v) => setForm(s => ({ ...s, [k]: v }));
  function submit(event) { event.preventDefault(); if (!form.name.trim()) return setError('Enter a university name.'); if (form.url && !safeLink(form.url)) return setError('Use a complete https:// or http:// information link.'); onSave({ ...form, name: form.name.trim() }); }
  return <Modal title={university ? 'Edit university' : 'Save a university'} onClose={onClose}><form className="stack" onSubmit={submit}><FormField label="University name"><input required value={form.name} onChange={e => patch('name', e.target.value)} maxLength={160}/></FormField><div className="form-grid"><FormField label="Pathway"><select value={form.country} onChange={e => patch('country', e.target.value)}><option>USA</option><option>Germany</option></select></FormField><FormField label="Status"><select value={form.status} onChange={e => patch('status', e.target.value)}><option value="researching">Researching</option><option value="shortlisted">Shortlisted</option><option value="applied">Applied</option></select></FormField></div><FormField label="Degree / program"><input value={form.program} onChange={e => patch('program', e.target.value)} maxLength={200}/></FormField><FormField label="Verified deadline (optional)" help="Use the date for your specific application cycle. Leave blank if unknown."><input type="date" value={form.deadline} onChange={e => patch('deadline', e.target.value)}/></FormField><FormField label={form.country === 'Germany' ? 'Requirements, NC & application route' : 'Entry requirements & application route'}><textarea rows="3" value={form.requirements} onChange={e => patch('requirements', e.target.value)} maxLength={3000} placeholder={form.country === 'Germany' ? 'NC / open admission, Hochschulstart, documents…' : 'English proficiency, essays, documents, financial planning…'}/></FormField><FormField label="Official information link"><input type="url" value={form.url} onChange={e => patch('url', e.target.value)} maxLength={1200} placeholder="https://…"/></FormField><FormField label="Your research notes"><textarea rows="3" value={form.notes} onChange={e => patch('notes', e.target.value)} maxLength={3000}/></FormField><ErrorNote error={error}/><Actions onCancel={onClose} label="Save university"/></form></Modal>;
}

function TestForm({ test, onClose, onSave }) {
  const [form, setForm] = useState({ name: 'IELTS', status: 'Researching requirements', targetDate: '', targetScore: '', notes: '', ...test }); const patch = (k, v) => setForm(s => ({ ...s, [k]: v }));
  return <Modal title={test ? 'Edit test plan' : 'Add an optional test plan'} onClose={onClose}><form className="stack" onSubmit={event => { event.preventDefault(); onSave({ ...form, id: form.id || id() }); }}><FormField label="Test"><select value={form.name} onChange={e => patch('name', e.target.value)}>{['IELTS', 'TOEFL', 'Cambridge English', 'SAT', 'Other'].map(v => <option key={v}>{v}</option>)}</select></FormField><FormField label="Status"><select value={form.status} onChange={e => patch('status', e.target.value)}>{['Researching requirements', 'Considering', 'Preparing', 'Booked', 'Completed', 'Not needed'].map(v => <option key={v}>{v}</option>)}</select></FormField><div className="form-grid"><FormField label="Target date (optional)"><input type="date" value={form.targetDate} onChange={e => patch('targetDate', e.target.value)}/></FormField><FormField label="Target score (optional)"><input value={form.targetScore} onChange={e => patch('targetScore', e.target.value)} maxLength={60}/></FormField></div><FormField label="Requirement / preparation notes"><textarea rows="3" value={form.notes} onChange={e => patch('notes', e.target.value)} maxLength={2000}/></FormField>{form.name === 'SAT' && <p className="field-help">UC currently does not consider SAT / ACT scores for admission. Only schedule SAT preparation if another target program needs or benefits from it.</p>}<Actions onCancel={onClose} label="Save test plan"/></form></Modal>;
}

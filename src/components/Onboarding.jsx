import React, { useId, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Plus, Trash2 } from 'lucide-react';
import { createPersonalProfile, ensureDailyPlan, saveExam } from '../coach.js';
import { Modal } from './UI.jsx';

const FIELDS = ['Business Informatics', 'Data / Computer Science', 'Business', 'Engineering / Technology'];
const LEVELS = ['Not sure yet', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native / fluent', 'Native / near-native'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STEP_TITLES = ['Choose your direction', 'Set your starting point', 'Make room for progress', 'What is coming up?'];
const split = text => text.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
const id = () => globalThis.crypto?.randomUUID?.() || `setup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function Field({ label, help, children }) { const generatedId = useId(); const fieldId = children.props.id || generatedId; return <div className="field"><label className="field-label" htmlFor={fieldId}>{label}</label>{React.cloneElement(children, { id: fieldId, 'aria-describedby': help ? `${fieldId}-help` : children.props['aria-describedby'] })}{help && <span id={`${fieldId}-help`} className="field-help">{help}</span>}</div>; }

export default function Onboarding({ data, today, onFinish, onClose }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [state, setState] = useState(() => {
    const clean = createPersonalProfile({ today });
    // Fresh storage already carries the starting profile. Reopening setup must
    // preserve personal edits even if setup has not yet been marked complete.
    const source = data && !data.demo && !data.demoData && !data.isDemo ? data : clean;
    return { ...source, profile: { ...source.profile }, subjects: source.subjects.map(subject => ({ ...subject, weakTopics: [...(subject.weakTopics || [])] })), schedule: { ...source.schedule, weekly: source.schedule.weekly.map(day => ({ ...day })), fixedActivities: source.schedule.fixedActivities.map(activity => ({ ...activity, days: [...(activity.days || [])] })) } };
  });
  const [examDraft, setExamDraft] = useState({ subjectId: '', title: '', date: '', topics: '', format: 'written' });
  const [fixedDraft, setFixedDraft] = useState({ title: '', days: [1], start: '16:00', end: '17:00', category: 'activity' });
  const [fixedOpen, setFixedOpen] = useState(false);
  const [examOpen, setExamOpen] = useState(false);
  const [otherFields, setOtherFields] = useState(() => (state.profile.targetFields || []).filter(field => !FIELDS.includes(field)).join(', '));
  const [universityDrafts, setUniversityDrafts] = useState(() => ({ USA: state.universities.filter(u => u.country === 'USA').map(u => u.name).join('\n'), Germany: state.universities.filter(u => u.country === 'Germany').map(u => u.name).join('\n') }));
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  const [topicDrafts, setTopicDrafts] = useState({});
  const patchProfile = patch => setState(s => ({ ...s, profile: { ...s.profile, ...patch } }));
  const patchSubject = (subjectId, patch) => setState(s => ({ ...s, subjects: s.subjects.map(subject => subject.id === subjectId ? { ...subject, ...patch } : subject) }));
  const patchWeekly = (day, key, value) => setState(s => ({ ...s, schedule: { ...s.schedule, weekly: s.schedule.weekly.map(item => item.day === day ? { ...item, [key]: value } : item) } }));
  const enabledSubjects = state.subjects.filter(s => s.enabled !== false);

  function next(event) {
    event.preventDefault(); setError('');
    if (step === 0) {
      if (!state.profile.pathways?.length) return setError('Choose at least one pathway. You can keep both.');
      if (!Number.isInteger(Number(state.profile.graduationYear)) || Number(state.profile.graduationYear) < 2026 || Number(state.profile.graduationYear) > 2040) return setError('Choose a graduation year between 2026 and 2040.');
      for (const key of ['applicationYear', 'universityStartYear']) if (state.profile[key] && (!Number.isInteger(Number(state.profile[key])) || Number(state.profile[key]) < 2026 || Number(state.profile[key]) > 2042)) return setError('Use an application or university entry year between 2026 and 2042, or leave it undecided.');
    }
    if (step === 1) {
      const invalid = enabledSubjects.some(subject => ['written', 'oral', 'target'].some(key => subject[key] != null && subject[key] !== '' && (!Number.isFinite(Number(subject[key])) || Number(subject[key]) < 0 || Number(subject[key]) > 15)));
      if (invalid) return setError('Use grades between 0 and 15 points. Blank means not recorded.');
    }
    if (step === 2 && state.schedule.weekly.some(day => day.minutes < 0 || day.minutes > 720 || (day.windowStart && day.windowEnd && day.windowEnd <= day.windowStart))) return setError('Use 0–720 minutes per day and a study window that ends after it starts.');
    if (step === 2 && fixedOpen && fixedDraft.title.trim()) return setError('Save the fixed activity below before continuing.');
    if (step === 3 && examOpen && (examDraft.title.trim() || examDraft.date || examDraft.topics.trim())) return setError('Save the exam below before creating your plan.');
    if (step < 3) { setStep(step + 1); return; }
    finish();
  }
  function finish() {
    const universities = ['USA', 'Germany'].flatMap(country => [...new Set(split(universityDrafts[country]))].map(name => state.universities.find(u => u.name.toLowerCase() === name.toLowerCase() && u.country === country) || { id: id(), name, country, program: '', deadline: '', requirements: '', notes: '', url: '', status: 'researching' }));
    const personal = { ...state, universities, onboardingCompleted: true, demo: false, demoData: false, isDemo: false, profile: { ...state.profile, graduationYear: Number(state.profile.graduationYear), applicationYear: state.profile.applicationYear ? Number(state.profile.applicationYear) : '', universityStartYear: state.profile.universityStartYear ? Number(state.profile.universityStartYear) : '', targetFields: [...new Set([...state.profile.targetFields.filter(field => FIELDS.includes(field)), ...split(otherFields)])] }, subjects: state.subjects.map(subject => {
      const grade = value => value === '' || value == null ? null : Number(value);
      const written = grade(subject.written), oral = grade(subject.oral);
      const existing = data && !data.demo && !data.demoData && !data.isDemo ? data.subjects.find(item => item.id === subject.id) : null;
      return { ...subject, written, oral, target: grade(subject.target),
        baselineWritten: existing && written === existing.written ? (existing.baselineWritten === undefined ? existing.written : existing.baselineWritten) : written,
        baselineOral: existing && oral === existing.oral ? (existing.baselineOral === undefined ? existing.oral : existing.baselineOral) : oral };
    }) };
    onFinish(ensureDailyPlan(personal, today));
  }
  function skip() {
    if (data?.onboardingCompleted && !data.demo && !data.demoData && !data.isDemo) {
      onFinish(ensureDailyPlan({ ...data, onboardingCompleted: true }, today));
      return;
    }
    if (!state.profile.pathways?.length || !Number.isInteger(Number(state.profile.graduationYear)) || Number(state.profile.graduationYear) < 2026 || Number(state.profile.graduationYear) > 2040) {
      setStep(0); setError('Choose a graduation year and at least one pathway to create your plan.'); return;
    }
    if (['applicationYear', 'universityStartYear'].some(key => state.profile[key] && (!Number.isInteger(Number(state.profile[key])) || Number(state.profile[key]) < 2026 || Number(state.profile[key]) > 2042))) {
      setStep(0); setError('Check your application and university entry years, or leave them blank.'); return;
    }
    if (enabledSubjects.some(subject => ['written', 'oral', 'target'].some(key => subject[key] != null && subject[key] !== '' && (!Number.isFinite(Number(subject[key])) || Number(subject[key]) < 0 || Number(subject[key]) > 15)))) {
      setStep(1); setError('Use grades between 0 and 15 points, or leave them blank.'); return;
    }
    if (state.schedule.weekly.some(day => day.minutes < 0 || day.minutes > 720 || (day.windowStart && day.windowEnd && day.windowEnd <= day.windowStart))) {
      setStep(2); setError('Check your available minutes and study times.'); return;
    }
    finish();
  }
  function addFixed() {
    if (!fixedDraft.title.trim()) return setError('Enter an activity name.');
    if (!fixedDraft.days.length || fixedDraft.end <= fixedDraft.start) return setError('Select its days and a time that ends after it starts.');
    setState(s => ({ ...s, schedule: { ...s.schedule, fixedActivities: [...s.schedule.fixedActivities, { ...fixedDraft, id: id(), title: fixedDraft.title.trim() }] } }));
    setFixedOpen(false); setFixedDraft({ title: '', days: [1], start: '16:00', end: '17:00', category: 'activity' }); setError('');
  }
  function addExam() {
    if (!examDraft.subjectId || !examDraft.title.trim() || !examDraft.date) return setError('Choose the subject and enter an exam title and date.');
    if (examDraft.date < today) return setError('Choose today or a future date.');
    setState(s => saveExam(s, { ...examDraft, createdDate: today, topics: split(examDraft.topics), target: s.subjects.find(item => item.id === examDraft.subjectId)?.target ?? 10 }));
    setExamOpen(false); setExamDraft({ subjectId: '', title: '', date: '', topics: '', format: 'written' }); setError('');
  }

  return <Modal title="Make Northstar yours" onClose={onClose} wide>
    <form className="onboarding stack" onSubmit={next}>
      <div className="onboarding-progress" aria-label={`Setup step ${step + 1} of 4`}>{STEP_TITLES.map((title, i) => <span className={i <= step ? 'active' : ''} key={title}/>)}</div>
      <div><p className="page-kicker">STEP {step + 1} OF 4</p><h2 className="onboarding-title">{STEP_TITLES[step]}</h2><p className="muted">{step === 0 ? 'Start with your goals. You can change everything later.' : step === 1 ? 'Check your grades. Leave anything unknown blank.' : step === 2 ? 'Choose a realistic amount of study time.' : 'Add your next exam, or continue without one.'}</p></div>
      {step === 0 && <div className="stack">
        <Field label="Your name (optional)"><input value={state.profile.name || ''} onChange={e => patchProfile({ name: e.target.value })} maxLength={80} autoComplete="given-name" placeholder="What should we call you?"/></Field>
        <div className="form-grid"><Field label="Current school year"><select value={state.profile.schoolYear || 'Q1'} onChange={e => patchProfile({ schoolYear: e.target.value })}>{['E1', 'E2', 'Q1', 'Q2', 'Q3', 'Q4', 'Graduated'].map(value => <option key={value}>{value}</option>)}</select></Field><Field label="Expected Abitur year"><input type="number" min="2026" max="2040" required value={state.profile.graduationYear} onChange={e => patchProfile({ graduationYear: e.target.value })}/></Field></div>
        <Field label="School system"><input value={state.profile.schoolSystem || 'Gymnasium · Hessen'} onChange={e => patchProfile({ schoolSystem: e.target.value })} maxLength={120}/></Field>
        <fieldset className="field"><legend className="field-label">University pathways</legend><div className="row wrap">{['USA', 'Germany'].map(value => <label key={value} className="checkbox-label"><input type="checkbox" checked={state.profile.pathways.includes(value)} onChange={e => patchProfile({ pathways: e.target.checked ? [...state.profile.pathways, value] : state.profile.pathways.filter(p => p !== value) })}/>{value}</label>)}</div></fieldset>
        <div className="form-grid">{['USA', 'Germany'].map(country => <Field label={`${country} target universities (optional)`} help="One per line." key={country}><textarea rows="2" value={universityDrafts[country]} onChange={e => { const value = e.target.value; setUniversityDrafts(s => ({ ...s, [country]: value })); }} maxLength={1000} placeholder={country === 'USA' ? 'UCLA\nUC Berkeley' : 'Still exploring'}/></Field>)}</div>
        <fieldset className="field"><legend className="field-label">Fields you would like to explore</legend><div className="stack">{FIELDS.map(value => <label className="checkbox-label" key={value}><input type="checkbox" checked={state.profile.targetFields.includes(value)} onChange={e => patchProfile({ targetFields: e.target.checked ? [...state.profile.targetFields, value] : state.profile.targetFields.filter(p => p !== value) })}/>{value}</label>)}</div></fieldset>
        <Field label="Other fields (optional)"><input value={otherFields} onChange={e => setOtherFields(e.target.value)} maxLength={300} placeholder="Separate with commas"/></Field>
        <details><summary>Application timing (optional)</summary><div className="stack"><p className="field-help">Leave these blank while you are deciding.</p><div className="form-grid"><Field label="Application year (optional)"><input type="number" min="2026" max="2042" value={state.profile.applicationYear || ''} placeholder="Undecided" onChange={e => patchProfile({ applicationYear: e.target.value })}/></Field><Field label="University entry year (optional)"><input type="number" min="2026" max="2042" value={state.profile.universityStartYear || ''} placeholder="Undecided" onChange={e => patchProfile({ universityStartYear: e.target.value })}/></Field></div></div></details>
      </div>}
      {step === 1 && <div className="stack">
        <div className="form-grid"><Field label="English level"><select value={state.profile.englishLevel || 'Not sure yet'} onChange={e => patchProfile({ englishLevel: e.target.value })}>{LEVELS.map(level => <option key={level}>{level}</option>)}</select></Field><Field label="German level"><select value={state.profile.germanLevel || 'Not sure yet'} onChange={e => patchProfile({ germanLevel: e.target.value })}>{LEVELS.map(level => <option key={level}>{level}</option>)}</select></Field></div>
        <div className="setup-subjects">{enabledSubjects.filter(subject => showAllSubjects || ['Mathematics', 'Physics', 'English', 'German'].includes(subject.name)).map(subject => <div className="setup-subject" key={subject.id}><div className="section-heading"><strong>{subject.name}</strong><span className="chip">{subject.level || 'GK'}</span></div><Field label={`${subject.name} course`}><select value={subject.level || 'GK'} onChange={e => patchSubject(subject.id, { level: e.target.value })}><option value="GK">Grundkurs</option><option value="LK">Leistungskurs</option></select></Field><div className="form-grid">{[['written', 'Written'], ['oral', 'Oral'], ['target', 'Target']].map(([key, label]) => <Field label={`${subject.name} ${label.toLowerCase()} points`} key={key}><input type="number" min="0" max="15" step="0.5" value={subject[key] ?? ''} placeholder="—" onChange={e => patchSubject(subject.id, { [key]: e.target.value })}/></Field>)}</div><Field label={`${subject.name} weak topics`}><input value={topicDrafts[subject.id] ?? (subject.weakTopics || []).join(', ')} onChange={e => { const value = e.target.value; setTopicDrafts(s => ({ ...s, [subject.id]: value })); patchSubject(subject.id, { weakTopics: split(value) }); }} maxLength={600} placeholder="Separate topics with commas"/></Field></div>)}</div>
        <button type="button" className="button button-ghost" onClick={() => setShowAllSubjects(!showAllSubjects)}>{showAllSubjects ? 'Show main subjects only' : 'Show other subjects (optional)'}</button>
        <p className="field-help">Targets are starting goals. Adjust them to suit you.</p>
      </div>}
      {step === 2 && <div className="stack">
        <p className="field-help">Study times and volleyball hours are starting suggestions. Adjust them to your actual week.</p>
        <div className="setup-week">{[1, 2, 3, 4, 5, 6, 0].map(day => { const item = state.schedule.weekly.find(d => d.day === day) || { minutes: 60, windowStart: '16:00', windowEnd: '20:00' }; return <div key={day} className="setup-day"><strong>{DAYS[day]}</strong><div className="form-grid"><Field label={`${DAYS[day]} available study minutes`}><input type="number" min="0" max="720" step="5" value={item.minutes} onChange={e => patchWeekly(day, 'minutes', Number(e.target.value))}/></Field><Field label={`${DAYS[day]} study starts`}><input type="time" value={item.windowStart || '16:00'} onChange={e => patchWeekly(day, 'windowStart', e.target.value)}/></Field><Field label={`${DAYS[day]} study ends`}><input type="time" value={item.windowEnd || '20:00'} onChange={e => patchWeekly(day, 'windowEnd', e.target.value)}/></Field></div></div>; })}</div>
        <div className="section-heading"><h3>Fixed weekly activities</h3><button type="button" className="button button-secondary" onClick={() => { setFixedOpen(!fixedOpen); setError(''); }}><Plus size={16}/>Add</button></div>
        {state.schedule.fixedActivities.map(activity => <div className="list-row" key={activity.id}><div><strong>{activity.title}</strong><p className="muted">{activity.days.map(d => DAYS[d].slice(0, 3)).join(', ')} · {activity.start}–{activity.end}</p></div><button type="button" className="icon-button" aria-label={`Remove ${activity.title}`} onClick={() => setState(s => ({ ...s, schedule: { ...s.schedule, fixedActivities: s.schedule.fixedActivities.filter(a => a.id !== activity.id) } }))}><Trash2 size={17}/></button></div>)}
        {fixedOpen && <div className="card stack"><Field label="Activity name"><input value={fixedDraft.title} onChange={e => setFixedDraft(s => ({ ...s, title: e.target.value }))} maxLength={100} placeholder="School, volleyball, gym, work…"/></Field><fieldset className="field"><legend className="field-label">Days</legend><div className="row wrap">{DAYS.map((day, index) => <label className="checkbox-label" key={day}><input type="checkbox" checked={fixedDraft.days.includes(index)} onChange={e => setFixedDraft(s => ({ ...s, days: e.target.checked ? [...s.days, index] : s.days.filter(d => d !== index) }))}/>{day.slice(0, 3)}</label>)}</div></fieldset><div className="form-grid"><Field label="Activity start"><input type="time" value={fixedDraft.start} onChange={e => setFixedDraft(s => ({ ...s, start: e.target.value }))}/></Field><Field label="Activity end"><input type="time" value={fixedDraft.end} onChange={e => setFixedDraft(s => ({ ...s, end: e.target.value }))}/></Field></div><button type="button" className="button button-secondary" onClick={addFixed}>Save fixed activity</button></div>}
      </div>}
      {step === 3 && <div className="stack">
        <div className="section-heading"><h3>Upcoming exams</h3><button type="button" className="button button-secondary" onClick={() => { setExamOpen(!examOpen); setError(''); }}><Plus size={16}/>Add exam</button></div>
        {state.exams.filter(e => e.date >= today).map(exam => <div className="list-row" key={exam.id}><div><strong>{exam.title}</strong><p className="muted">{state.subjects.find(s => s.id === exam.subjectId)?.name} · {new Date(`${exam.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</p><p className="field-help">{exam.topics?.join(' · ')}</p></div><button type="button" className="icon-button" aria-label={`Remove ${exam.title}`} onClick={() => setState(s => ({ ...s, exams: s.exams.filter(e => e.id !== exam.id) }))}><Trash2 size={17}/></button></div>)}
        {!state.exams.length && !examOpen && <div className="empty-state"><CalendarDays size={25}/><h3>No exam date yet?</h3><p className="muted">You can add it later in Plan.</p></div>}
        {examOpen && <div className="card stack"><Field label="Exam subject"><select value={examDraft.subjectId} onChange={e => setExamDraft(s => ({ ...s, subjectId: e.target.value }))}><option value="">Choose subject</option>{enabledSubjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></Field><Field label="Exam title"><input value={examDraft.title} onChange={e => setExamDraft(s => ({ ...s, title: e.target.value }))} maxLength={160} placeholder="e.g. English Klausur"/></Field><div className="form-grid"><Field label="Exam date"><input type="date" min={today} value={examDraft.date} onChange={e => setExamDraft(s => ({ ...s, date: e.target.value }))}/></Field><Field label="Exam format"><select value={examDraft.format} onChange={e => setExamDraft(s => ({ ...s, format: e.target.value }))}><option value="written">Written / Klausur</option><option value="oral">Oral</option><option value="test">Short test</option></select></Field></div><Field label="Exam topics" help="One per line or comma separated. Specific topics make revision more useful."><textarea rows="4" maxLength={1500} value={examDraft.topics} onChange={e => setExamDraft(s => ({ ...s, topics: e.target.value }))} placeholder="American Dream, summary, analysis, comment…"/></Field><button type="button" className="button button-secondary" onClick={addExam}>Save exam</button></div>}
        <div className="setup-summary"><Check size={18}/><p>Your plan is ready to fit your goals and available time.</p></div>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="sheet-footer onboarding-footer">{step > 0 ? <button type="button" className="button button-secondary" onClick={() => { setStep(step - 1); setError(''); }}><ArrowLeft size={16}/>Back</button> : <button type="button" className="button button-ghost" onClick={skip}>Skip for now</button>}<button type="submit" className="button button-primary">{step === 3 ? 'Create my plan' : 'Continue'}{step === 3 ? <Check size={16}/> : <ArrowRight size={16}/>}</button></div>
      {step > 0 && <button type="button" className="button button-ghost setup-skip" onClick={skip}>Skip for now and {data?.onboardingCompleted && !data.demo && !data.demoData && !data.isDemo ? 'keep my current plan' : 'start my plan'}</button>}
      <p className="field-help setup-privacy">Saved on this device. No account needed.</p>
    </form>
  </Modal>;
}

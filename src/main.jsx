import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, ChevronRight, Clock3, Compass, GraduationCap, ListChecks, Moon, Plus, Sparkles, Sun, Target, TrendingUp, UserRound, X } from 'lucide-react';
import { addTask, ensureDailyPlan, getDailyPlan, getWeeklyReview, localDateKey, normalizeData, removeTask, saveSchedule, saveTaskNotes, saveTaskReview, shiftDate, skipTask, toggleTask } from './coach.js';
import { shortTaskReason, todayFocus } from './presentation.js';
import { loadData, MAX_BACKUP_BYTES, parseBackup, saveData, serializeBackup, STORAGE_KEY } from './storage.js';
import { getExercise } from './exercises.js';
import Plan from './components/Plan.jsx';
import Progress from './components/Progress.jsx';
import Profile from './components/Profile.jsx';
import Onboarding from './components/Onboarding.jsx';
import { StudyDialog, StudyDock, StudyLauncher, StudySaved } from './components/StudyTimer.jsx';
import { discardStudy, finishStudy, getStudyTimer, pauseStudy, resumeStudy, startStudy } from './study.js';
import { Button, EmptyState, Field, Modal, formatDate, formatMinutes } from './components/UI.jsx';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import './styles.css';

const NAV = [{ id:'today', label:'Today', icon:Sun }, { id:'plan', label:'Plan', icon:CalendarDays }, { id:'progress', label:'Progress', icon:TrendingUp }, { id:'profile', label:'Profile', icon:UserRound }];
const CATEGORIES = { academics:'School', language:'Language', languages:'Language', university:'University', activity:'Profile', activities:'Profile', review:'Review', confidence:'Confidence', reflection:'Reflection', wellbeing:'Wellbeing' };
const iconFor = task => task.category === 'university' || task.category === 'activity' ? GraduationCap : task.category === 'review' ? ListChecks : BookOpen;
const goalLabel = task => task.linkedGoal || ({academics:'Stronger grades for Abitur',language:'Language readiness for university',university:'Prepare a university application',activity:'Build an evidence-based application profile',review:'Keep your university plan realistic'}[task.category] || 'Your university pathway');
function browserStorage() { try { return window.localStorage; } catch { return null; } }
function safeResource(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
function activeTab() { const hash = location.hash.slice(1); return NAV.some(item => item.id === hash) ? hash : hash === 'pathway' ? 'plan' : 'today'; }
function downloadOriginal(key = STORAGE_KEY) {
  const original = browserStorage()?.getItem(key);
  if (!original) return;
  const url = URL.createObjectURL(new Blob([original],{type:'application/json'}));
  const link = document.createElement('a');link.href = url;link.download = 'northstar-original.json';link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}

class AppRecovery extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    let saved = false;
    try { saved = Boolean(browserStorage()?.getItem(STORAGE_KEY)); } catch {}
    return <main className="main-content recovery-screen"><div className="brand"><Compass size={24}/><span>Northstar</span></div><section className="card stack"><h1>Let’s reopen your plan</h1><p>Something went wrong opening this screen. Reload to try again, or download a copy of your saved data.</p><Button onClick={() => location.reload()}>Reload app</Button>{saved && <Button variant="secondary" onClick={() => downloadOriginal()}>Download saved data</Button>}</section></main>;
  }
}

function App() {
  const [clock, setClock] = useState(() => new Date());
  const today = localDateKey(clock);
  const [boot] = useState(() => loadData(browserStorage(), today));
  const [data, setData] = useState(() => ensureDailyPlan(boot.data, today));
  const [tab, setTab] = useState(activeTab);
  const [profileSection, setProfileSection] = useState('Goals');
  const [planView, setPlanView] = useState('week');
  const [planPathway, setPlanPathway] = useState(null);
  const [selectedDay, setSelectedDay] = useState(today);
  const previousToday = useRef(today);
  const [setupOpen, setSetupOpen] = useState(!boot.data.onboardingCompleted && !boot.warning);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [storageMessage, setStorageMessage] = useState(boot.warning || '');
  const [recoveryNotice, setRecoveryNotice] = useState(boot.warning || '');
  const [canPersist, setCanPersist] = useState(boot.writable);
  const importRef = useRef(null);
  const dailyPlan = getDailyPlan(data, selectedDay, today);
  const isHistory = dailyPlan.isHistory || selectedDay < today;
  const tasks = dailyPlan.tasks || [];
  const done = tasks.filter(task => task.completed).length;
  const completedMinutes = tasks.filter(task => task.completed).reduce((total,task) => total + task.minutes,0);
  const review = getWeeklyReview(data, today);
  const taskModal = modal?.type === 'task' ? data.tasks.find(task => task.id === modal.id) : null;
  const activeStudy = data.study?.active;
  const savedForLater = task => task.origin === 'generated' && !data.dismissedTaskIds.includes(task.id);
  const skippedTasks = data.tasks.filter(task => task.date === selectedDay && task.skipped && !savedForLater(task));
  const parkedTasks = data.tasks.filter(task => task.date === selectedDay && task.skipped && savedForLater(task));
  const greeting = clock.getHours() < 12 ? 'Good morning' : clock.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 30000); const resume = () => setClock(new Date()); window.addEventListener('focus', resume); return () => { clearInterval(timer); window.removeEventListener('focus',resume); }; }, []);
  useEffect(() => { const oldToday = previousToday.current; previousToday.current = today; setSelectedDay(current => current === oldToday ? today : current); setData(current => ensureDailyPlan(current,today)); }, [today]);
  useEffect(() => { if (!canPersist) return; const result = saveData(data,browserStorage()); setStorageMessage(result.ok ? recoveryNotice : 'Your latest changes could not be saved. Download a backup before closing.'); }, [data,canPersist,recoveryNotice]);
  useEffect(() => { document.documentElement.dataset.theme = data.profile.theme || 'system'; const media = matchMedia('(prefers-color-scheme: dark)'); const update = () => { const dark = data.profile.theme === 'dark' || (data.profile.theme !== 'light' && media.matches); document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark ? '#111317' : '#f8f9fb'); }; update(); media.addEventListener('change',update); return () => media.removeEventListener('change',update); }, [data.profile.theme]);
  useEffect(() => { const handle = () => setTab(activeTab()); window.addEventListener('hashchange',handle); return () => window.removeEventListener('hashchange',handle); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''),4000); return () => clearTimeout(timer); }, [toast]);

  function notify(message) { setToast(message); }
  function update(updater) { setData(current => ensureDailyPlan(typeof updater === 'function' ? updater(current) : updater,selectedDay,today)); }
  function navigate(next) { setTab(next); location.hash = next; window.scrollTo({top:0,behavior:'instant'}); }
  function chooseDay(date) { setSelectedDay(date); setData(current => ensureDailyPlan(current,date,today)); navigate('today'); }
  function completeTask(task) { if (task.date > today) { notify('Future tasks are previews. Complete them when the day arrives.'); return; } const now = new Date(); update(current => toggleTask(current.study?.active?.taskId === task.id ? finishStudy(current,now) : current,task.id,now)); if (!task.completed) notify('One step closer. Your progress is saved.'); }
  function finishSetup(next) { setData(ensureDailyPlan(normalizeData(next,today),today)); setSelectedDay(today); setSetupOpen(false); navigate('today'); notify(next.demo ? 'Sample plan ready. You can make it yours at any time.' : 'Your first plan is ready. Start with one small step.'); }
  function exportData() {
    try { const blob = new Blob([serializeBackup(data)],{type:'application/json'}); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `northstar-${today}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); notify('Backup downloaded.'); } catch (error) { notify(error.message); }
  }
  async function importData(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try { if (file.size > MAX_BACKUP_BYTES) {notify('Choose a backup smaller than 20 MB.');event.target.value = '';return;} const next = parseBackup(await file.text(),today); setModal({type:'import',data:next}); } catch { notify('This backup could not be opened. Your current plan is unchanged.'); }
    event.target.value = '';
  }
  function restoreBackup() { const next = ensureDailyPlan(modal.data,today); const result = saveData(next,browserStorage()); if (!result.ok) { notify(result.error || 'Restore could not be saved. Your current plan is unchanged.'); return; } setCanPersist(true); setData(next); setStorageMessage(''); setRecoveryNotice(''); setModal(null); setSetupOpen(false); notify('Backup restored.'); }
  function showPlan(view = 'week') { setPlanView(typeof view === 'string' ? view : 'week');navigate('plan'); }
  function skipToday(task) { update(current => skipTask(current.study?.active?.taskId === task.id ? finishStudy(current,new Date()) : current,task.id));setModal(null);notify('Skipped for today. Your plan is updated.'); }
  function showLinkedGoal(task) { setPlanPathway(task.roadmapItemId?.startsWith('Germany-') ? 'Germany' : task.roadmapItemId?.startsWith('USA-') ? 'USA' : data.profile.pathways[0] || 'USA');setPlanView('roadmap');setModal(null);navigate('plan'); }
  function showEvents() { setPlanView('events');setModal(null);navigate('plan'); }
  function openProfile(section) { setProfileSection(section);setModal(null);navigate('profile'); }
  function openFocus() { setModal({type:'focus'}); }
  function openFocusTask() { if (activeStudy && data.tasks.some(task => task.id === activeStudy.taskId)) setModal({type:'task',id:activeStudy.taskId}); else { setModal(null);notify('Your study time stays recorded even when a task is removed.'); } }
  function beginFocus(task,minutes) {
    if (task.date > today) { notify('Start this session when the day arrives.'); return; }
    if (activeStudy && activeStudy.taskId !== task.id) { setModal({type:'switchFocus',id:task.id,minutes}); return; }
    update(current => startStudy(current,task,new Date(),minutes)); openFocus();
  }
  function endFocus(automatic = false) {
    const timer = getStudyTimer(data,new Date());
    if (!timer.active) return;
    update(current => finishStudy(current,new Date()));
    if (!automatic || modal?.type === 'focus' || modal?.type === 'discardFocus') setModal({type:'focusSaved',id:timer.active.taskId,title:timer.active.taskTitle,seconds:timer.elapsedSeconds});
    else notify('Focus session saved. Review your work before completing the task.');
  }
  function switchFocus() {
    const task = data.tasks.find(item => item.id === modal.id);
    if (!task) { setModal(null);notify('Choose a task from your current plan.');return; }
    const now = new Date();
    update(current => startStudy(finishStudy(current,now),task,now,modal.minutes));openFocus();
  }

  return <div className={`app-shell ${activeStudy ? 'has-active-study' : ''}`}>
    <aside className="desktop-sidebar"><a className="brand" href="#today" onClick={() => navigate('today')}><Compass size={25} strokeWidth={1.6}/><span>Northstar</span></a><p className="sidebar-caption">A clear next step.</p><nav aria-label="Main navigation">{NAV.map(({id,label,icon:Icon}) => <button key={id} onClick={() => navigate(id)} aria-current={tab === id ? 'page' : undefined} className={`nav-item ${tab === id ? 'active' : ''}`}><Icon size={19}/>{label}</button>)}</nav><div className="sidebar-footer"><span className="sidebar-stage">{data.profile.schoolYear} · Hessen</span><p>Small steps.<br/>A bigger future.</p><span className="local-caption">{storageMessage ? 'Backup recommended' : 'Saved on this device'}</span></div></aside>
    <main className="main-content" id="main-content">
      <header className="mobile-brand"><a className="brand" href="#today" onClick={() => navigate('today')}><Compass size={21} strokeWidth={1.7}/><span>Northstar</span></a><span>{data.profile.schoolYear} · Abitur {data.profile.graduationYear}</span></header>
      {storageMessage && <div className="storage-notice" role="alert"><p>{storageMessage}</p><button onClick={exportData}>Export a backup</button>{boot.recoveryKey && <button onClick={() => downloadOriginal(boot.recoveryKey)}>Download original data</button>}</div>}
      {data.demo && !setupOpen && <div className="demo-banner"><span>Sample plan · make it yours</span><button onClick={() => setSetupOpen(true)}>Set up <ArrowRight size={14}/></button></div>}
      {tab === 'today' && <section className="today-page stack">
        <header className="page-header today-header"><div>{selectedDay === today ? <p className="today-greeting">{greeting}{data.profile.name ? `, ${data.profile.name}` : ''}</p> : <p className="page-kicker">{selectedDay > today ? 'PLAN PREVIEW' : 'YOUR HISTORY'}</p>}<h1 className="page-title">{selectedDay === today ? 'Today' : formatDate(selectedDay,{weekday:'long'})}</h1><p className="today-date">{formatDate(selectedDay,{weekday:'long',day:'numeric',month:'long'})}</p></div><button className="icon-button calendar-button" aria-label="View weekly plan" onClick={showPlan}><CalendarDays size={21}/></button></header>
        {selectedDay !== today && <button className="text-button" onClick={() => chooseDay(today)}><ArrowLeft size={15}/>Back to today</button>}
        {isHistory ? <section className="time-budget" aria-label="Study history"><div><span>Saved tasks</span><strong>{tasks.length}</strong></div><div><span>Completed</span><strong>{done}</strong></div><div><span>Estimated study</span><strong>{formatMinutes(completedMinutes)}</strong></div></section> : <section className="time-budget today-availability" aria-label="Study time budget"><div className="availability-summary"><strong>{formatMinutes(dailyPlan.availableMinutes)}</strong><span>available today</span></div><button className="icon-button" aria-label="Adjust available time" onClick={() => setModal({type:'time'})}><Clock3 size={19}/></button><details className="product-details time-details"><summary>Today’s time</summary><div className="time-detail-values"><div><span>Planned</span><strong>{formatMinutes(dailyPlan.plannedMinutes)}</strong></div><div><span>Remaining</span><strong>{formatMinutes(dailyPlan.remainingMinutes)}</strong></div></div></details></section>}
        <section className="daily-goal"><div className="goal-label"><Target size={15}/><span>{isHistory ? 'Saved history' : 'Today’s focus'}</span></div><h2>{isHistory ? dailyPlan.goal : todayFocus(tasks.find(task => !task.completed) || tasks[0],data)}</h2>{!isHistory && <details className="product-details focus-details"><summary>How this fits your day</summary>{dailyPlan.adjustment && <p className="muted small">{dailyPlan.adjustment}</p>}<button className="text-button" onClick={() => setModal({type:'purpose'})}>How this fits your goals <ChevronRight size={15}/></button></details>}</section>
        <div className="daily-task-heading"><h2>{isHistory ? 'Your recorded tasks' : done === tasks.length && tasks.length ? 'A good day’s work' : 'Your priorities'}</h2><span>{done} of {tasks.length} complete</span></div>
        <div className="daily-tasks" data-testid="daily-tasks">{tasks.map(task => <TaskCard key={task.id} task={task} data={data} today={today} onOpen={() => setModal({type:'task',id:task.id})} onComplete={() => completeTask(task)}/>)}</div>
        {!tasks.length && (isHistory ? <EmptyState icon={CalendarDays} title="No recorded plan" description="Choose another day to see your saved work." action={<Button variant="secondary" onClick={() => chooseDay(today)}>Back to today</Button>}/> : dailyPlan.availableMinutes === 0 ? <EmptyState icon={Moon} title="Room to rest" description="Keep today free, or make time for one small step." action={<Button variant="secondary" onClick={() => setModal({type:'time'})}>Adjust today’s time</Button>}/> : <EmptyState title="Nothing else planned" description="Your day is clear. Add a priority if you need one." action={<Button variant="secondary" onClick={() => setModal({type:'addTask'})}>Add a task</Button>}/>)}
        {!isHistory && skippedTasks.length > 0 && <details className="product-details skipped-tasks"><summary>Skipped today ({skippedTasks.length})</summary>{skippedTasks.map(task => <button className="list-row skipped-task" key={task.id} onClick={() => setModal({type:'task',id:task.id})}><span>{task.title}</span><ChevronRight size={16}/></button>)}</details>}
        {!isHistory && parkedTasks.length > 0 && <details className="product-details skipped-tasks"><summary>Saved for later ({parkedTasks.length})</summary><p className="field-help">Your drafts will return when there is room in today’s plan.</p>{parkedTasks.map(task => <button className="list-row skipped-task" key={task.id} onClick={() => setModal({type:'task',id:task.id})}><span>{task.title}</span><ChevronRight size={16}/></button>)}</details>}
        {selectedDay === today && done === tasks.length && tasks.length > 0 && <div className="day-complete"><Check size={18}/><div><strong>You showed up. That matters.</strong><p>Keep your remaining time for rest. Tomorrow’s plan will build on today.</p></div></div>}
        {!isHistory && tasks.length > 0 && <div className="today-footer"><button className="text-button" onClick={() => setModal({type:'addTask'})}><Plus size={16}/>Add an important task</button></div>}
        {selectedDay === today && new Date(`${today}T12:00:00`).getDay() === 0 && <button className="sunday-review" onClick={() => navigate('progress')}><ListChecks size={22}/><span><strong>Your Sunday review</strong><small>{review.completed} {review.completed === 1 ? 'task' : 'tasks'} completed · {formatMinutes(review.minutes)} of estimated study work</small></span><ChevronRight size={19}/></button>}
      </section>}
      {tab === 'plan' && <Plan data={data} today={today} initialView={planView} initialPathway={planPathway || data.profile.pathways[0]} onChange={update} notify={notify} onSelectDay={chooseDay} onOpenProfile={openProfile}/>}
      {tab === 'progress' && <Progress data={data} today={today} onChange={update} notify={notify} onOpenPlan={showPlan} onOpenProfile={openProfile}/>}
      {tab === 'profile' && <Profile key={profileSection} initialSection={profileSection} data={data} today={today} onChange={update} notify={notify} onRestartSetup={() => setSetupOpen(true)} onExport={exportData} onImport={() => importRef.current?.click()} onOpenSchedule={() => showPlan('schedule')}/>}
    </main>
    <nav className="bottom-nav" aria-label="Mobile navigation">{NAV.map(({id,label,icon:Icon}) => <button key={id} onClick={() => navigate(id)} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'active' : ''}><Icon size={22} strokeWidth={tab === id ? 2 : 1.6}/><span>{label}</span></button>)}</nav>
    <input type="file" ref={importRef} accept="application/json,.json" aria-label="Import Northstar backup" className="visually-hidden" onChange={importData}/>
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {setupOpen && <Onboarding data={data} today={today} onFinish={finishSetup} onClose={() => { if (!data.onboardingCompleted) update(current => ({...current,onboardingCompleted:true})); setSetupOpen(false); }}/>}
    {taskModal && !setupOpen && <TaskDetail key={taskModal.id} task={taskModal} data={data} today={today} onClose={() => setModal(null)} onSave={(notes,review) => update(current => saveTaskReview(saveTaskNotes(current,taskModal.id,notes),taskModal.id,review))} onComplete={() => completeTask(taskModal)} onSkip={() => skipToday(taskModal)} onRemove={() => setModal({type:'removeTask',id:taskModal.id})} onOpenProfile={openProfile} onStartStudy={minutes => beginFocus(taskModal,minutes)} onOpenStudy={openFocus} onGoal={() => showLinkedGoal(taskModal)} onEvents={showEvents} onProgress={() => {setModal(null);navigate('progress');}}/>}
    <StudyDock data={data} onOpen={openFocus} onPause={() => update(current => pauseStudy(current,new Date()))} onResume={() => update(current => resumeStudy(current,new Date()))} onFinish={() => endFocus()} onExpire={() => endFocus(true)}/>
    {modal?.type === 'focus' && activeStudy && <StudyDialog data={data} onClose={() => setModal(null)} onPause={() => update(current => pauseStudy(current,new Date()))} onResume={() => update(current => resumeStudy(current,new Date()))} onFinish={() => endFocus()} onDiscard={() => setModal({type:'discardFocus'})} onTask={openFocusTask}/>}
    {modal?.type === 'focusSaved' && <StudySaved task={data.tasks.find(task => task.id === modal.id)} seconds={modal.seconds} onClose={() => setModal(null)} onTask={() => setModal({type:'task',id:modal.id})} onComplete={() => {const task = data.tasks.find(item => item.id === modal.id);if(task)completeTask(task);setModal(null);}}/>}
    {modal?.type === 'switchFocus' && <Modal title="One focus session at a time" onClose={openFocus}><div className="stack"><p>Save the time spent on your current task before starting this one. Only one session can run at a time.</p><div className="sheet-footer"><Button variant="secondary" onClick={openFocus}>Keep current session</Button><Button onClick={switchFocus}>Save & switch tasks</Button></div></div></Modal>}
    {modal?.type === 'discardFocus' && <Modal title="Discard this focus session?" onClose={openFocus}><div className="stack"><p>The time in this session will not be saved. Your task and notes remain.</p><div className="sheet-footer"><Button variant="secondary" onClick={openFocus}>Keep session</Button><Button variant="danger" onClick={() => {update(discardStudy);setModal(null);notify('Session discarded.');}}>Discard session</Button></div></div></Modal>}
    {modal?.type === 'purpose' && <GoalPurpose plan={dailyPlan} onClose={() => setModal(null)} onPlan={() => {setModal(null);showPlan();}}/>}
    {modal?.type === 'time' && <TimeForm data={data} date={selectedDay} plan={dailyPlan} onClose={() => setModal(null)} onSave={minutes => { update(current => saveSchedule(current,{...current.schedule,timeOverrides:[...current.schedule.timeOverrides.filter(item => item.date !== selectedDay),{date:selectedDay,minutes}]})); setModal(null);notify('Time updated. Your priorities have been recalculated.'); }}/ >}
    {modal?.type === 'addTask' && <TaskForm data={data} date={selectedDay} today={today} onClose={() => setModal(null)} onSave={task => { update(current => addTask(current,task)); setModal(null);notify('Task added. Your plan has been balanced around it.'); }}/ >}
    {modal?.type === 'removeTask' && <Modal title="Remove this task?" onClose={() => setModal(null)}><div className="stack"><p>The task will be removed from this day. If completed, it will also be removed from your progress history. Timed sessions stay recorded; an active session for this task is saved first.</p><div className="sheet-footer"><Button variant="secondary" onClick={() => setModal(null)}>Keep task</Button><Button variant="danger" onClick={() => {update(current => removeTask(current.study?.active?.taskId === modal.id ? finishStudy(current,new Date()) : current,modal.id));setModal(null);notify('Task removed.');}}>Remove task</Button></div></div></Modal>}
    {modal?.type === 'import' && <Modal title="Restore your backup?" onClose={() => setModal(null)}><div className="stack"><p>This replaces the current plan on this device with the selected backup. Export your current data first if you want to keep it.</p><div className="sheet-footer"><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button onClick={restoreBackup}>Restore backup</Button></div></div></Modal>}
  </div>;
}

function TaskCard({task,data,today,onOpen,onComplete}) {
  const Icon = iconFor(task);
  const subject = data.subjects.find(item => item.id === task.subjectId);
  const action = subject && task.title.startsWith(`${subject.name}: `) ? task.title.slice(subject.name.length + 2) : task.title;
  const title = action.charAt(0).toUpperCase() + action.slice(1);
  return <article className={`task-card ${task.completed ? 'is-complete' : ''}`} data-roadmap-id={task.roadmapItemId || undefined} data-event-id={task.eventId || undefined}>
    <div className="task-main"><button className="task-content" onClick={onOpen} aria-label={`Open ${task.title}`}><div className="task-meta"><span><Icon size={14}/>{subject?.name || CATEGORIES[task.category] || 'School'}</span><span>{task.minutes} min</span></div><h3>{title}</h3><p>{task.skipped ? task.origin === 'generated' && !data.dismissedTaskIds.includes(task.id) ? 'Saved for later · your notes are safe' : 'Skipped · your notes are saved' : shortTaskReason(task,data)}</p></button></div>
    <button className="task-complete" aria-label={`${task.completed ? 'Undo' : 'Complete'} ${task.title}`} aria-pressed={task.completed} disabled={task.date > today} onClick={onComplete}><Check size={20} strokeWidth={2}/></button>
  </article>;
}

function GoalPurpose({plan,onClose,onPlan}) {
  const chain = plan.goalChain || {};
  const levels = [['LONG-TERM',chain.longTerm],['THIS YEAR',chain.yearly || chain.year],['THIS SEMESTER',chain.semester],['THIS MONTH',chain.monthly],['THIS WEEK',chain.weekly],['TODAY',plan.goal]];
  return <Modal title="From your goal to today" onClose={onClose}><div className="purpose-ladder">{levels.map(([label,value]) => <div className="purpose-step" key={label}><span>{label}</span><h3>{typeof value === 'object' ? value?.title : value || 'Build a strong foundation for university'}</h3></div>)}</div><p className="field-help">Your priorities connect the next useful roadmap step with exams, grades, deadlines and the time you have. Recorded actions update your preparation progress.</p><Button onClick={onPlan}>See your full plan <ArrowRight size={16}/></Button></Modal>;
}

function TaskDetail({task,data,today,onClose,onSave,onComplete,onSkip,onRemove,onOpenProfile,onStartStudy,onOpenStudy,onGoal,onEvents,onProgress}) {
  const [notes,setNotes] = useState(task.notes || '');
  const [review,setReview] = useState(task.selfReview || []);
  const [showMeanings,setShowMeanings] = useState(true);
  const exercise = getExercise(task,data);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  useEffect(() => {
    if (notes === (task.notes || '')) return;
    const timer = setTimeout(() => saveRef.current(notes,review),500);
    return () => clearTimeout(timer);
  }, [notes,review,task.notes]);
  const save = () => onSave(notes,review);
  function close() { if (notes !== (task.notes || '') || JSON.stringify(review) !== JSON.stringify(task.selfReview || [])) save(); onClose(); }
  function checkCriterion(id,checked) {
    const next = checked ? [...new Set([...review,id])] : review.filter(item => item !== id);
    setReview(next);onSave(notes,next);
  }
  return <Modal title="Your next step" onClose={close}><div className="task-detail stack">
    <div><p className="page-kicker">{CATEGORIES[task.category] || 'SCHOOL'} · {task.minutes} MIN{task.priority === 'high' ? ' · HIGH PRIORITY' : ''}</p><h2 className="task-detail-title">{task.title}</h2><p className="muted">{task.skipped ? task.origin === 'generated' && !data.dismissedTaskIds.includes(task.id) ? 'Saved for later. Make room in today’s plan to continue.' : 'Skipped for today. Your notes are saved.' : shortTaskReason(task,data)}</p></div>
    <details className="task-purpose product-details"><summary>Why this task</summary><section className="stack compact" aria-label="Linked long-term goal"><p className="muted small">{task.reason}</p><span className="field-help">LONG-TERM GOAL</span><strong>{goalLabel(task)}</strong><button className="task-linked-goal text-button" onClick={() => {save();onGoal();}}>View university roadmap <ArrowRight size={14}/></button>{task.eventId && <button className="text-button" onClick={() => {save();onEvents();}}>View linked event <CalendarDays size={14}/></button>}</section></details>
    {!task.skipped && <StudyLauncher task={task} today={today} active={data.study?.active} onStart={minutes => {save();onStartStudy(minutes);}} onOpen={() => {save();onOpenStudy();}}/>}
    <div className="exercise-prompt"><span className="field-label">{exercise.label}</span><p>{exercise.prompt}</p></div>
    {task.sessions?.length > 0 && <p className="field-help">Suggested study blocks · {task.sessions.map(session => `${session.start}–${session.end}`).join(' · ')}</p>}
    {exercise.passage && <details className="practice-passage" open><summary>Practice passage · original text</summary>{exercise.materialTitle && <h3>{exercise.materialTitle}</h3>}<p>{exercise.passage}</p></details>}
    {exercise.words && <div className="vocabulary"><div className="section-heading"><h3>{exercise.words.length} useful words</h3><button className="text-button" onClick={() => setShowMeanings(current => !current)}>{showMeanings ? 'Hide meanings' : 'Show meanings'}</button></div>{exercise.words.map(word => <div className="vocabulary-word" key={word.word}><strong>{word.word}</strong>{showMeanings && <><span>{word.meaning}</span>{word.example && <small>{word.example}</small>}</>}</div>)}</div>}
    <div className="practice-steps"><h3>Work through it</h3>{exercise.checklist?.map((step,index) => <div className="practice-step" key={index}><span>{index+1}</span><p>{step}</p></div>)}</div>
    {exercise.recentNotes?.length > 0 && <div className="stack"><h3>Your earlier work</h3>{exercise.recentNotes.map((entry,index) => <div className="exercise-prompt" key={index}><strong className="field-label">{entry.title}</strong><p>{entry.notes}</p></div>)}</div>}
    {exercise.answer && <details className="practice-passage"><summary>Check your solution</summary><p>{exercise.answer}</p></details>}
    <Field label="Your work & notes" help="Keep a draft, one mistake you noticed, or a next step. Your draft saves automatically as you write."><textarea rows="6" maxLength={5000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Write your response or what you learned…"/></Field>
    {!!exercise.reviewCriteria?.length && <fieldset className="self-review stack compact" aria-label="Self-review"><legend>Review your draft</legend><p className="field-help">Use these checks to revise your own work. They do not assign a grade.</p>{exercise.reviewCriteria.map(criterion => <label className="self-review-criterion" key={criterion.id}><input type="checkbox" aria-label={`I checked: ${criterion.label}`} checked={review.includes(criterion.id)} onChange={event => checkCriterion(criterion.id,event.target.checked)}/><span><strong>{criterion.label}</strong><small>{criterion.hint}</small></span></label>)}</fieldset>}
    {exercise.sampleAnswer && <details className="practice-passage example-response"><summary>See an example response</summary><p>{exercise.sampleAnswer}</p><small>Compare its structure and evidence with your draft. Ask a teacher for feedback on your own response.</small></details>}
    {(task.category === 'activity' || task.category === 'university' || task.roadmapStepId) && <Button variant="secondary" onClick={() => {save();onOpenProfile(task.category === 'activity' ? 'Activities' : task.goalId === 'grades' ? 'Subjects' : ['language','tests'].includes(task.goalId) ? 'Goals' : 'Universities');}}>Update my {task.category === 'activity' ? 'activity profile' : task.goalId === 'grades' ? 'subjects' : ['language','tests'].includes(task.goalId) ? 'language & test goals' : 'university notes'} <ArrowRight size={16}/></Button>}
    {task.category === 'review' && <Button variant="secondary" onClick={() => {save();onProgress();}}>Open weekly review <ArrowRight size={16}/></Button>}
    {safeResource(task.resource) && <a className="button button-secondary" href={safeResource(task.resource)} target="_blank" rel="noreferrer">Open official resource <ArrowRight size={16}/></a>}
    {exercise.guidance && <p className="field-help">{exercise.guidance}</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={save}>Save notes</Button><Button disabled={task.date > today} onClick={() => {save();onComplete();onClose();}}><Check size={17}/>{task.completed ? 'Mark incomplete' : 'Complete task'}</Button></div>
    {!task.completed && !task.skipped && task.date === today && <Button variant="ghost" onClick={() => {save();onSkip();}}>Skip for today</Button>}
    <button className="text-button remove-task" onClick={() => {save();onRemove();}}>Remove from plan</button>
  </div></Modal>;
}

function TimeForm({data,date,plan,onClose,onSave}) {
  const override = data.schedule.timeOverrides.find(item => item.date === date);
  const weekly = data.schedule.weekly.find(item => item.day === new Date(`${date}T12:00:00`).getDay());
  const [minutes,setMinutes] = useState(override?.minutes ?? weekly?.minutes ?? plan.availableMinutes);
  return <Modal title="Make today realistic" onClose={onClose}><form className="stack" onSubmit={event => { event.preventDefault();onSave(Number(minutes)); }}><p>Choose a study allowance for {formatDate(date,{weekday:'long',day:'numeric',month:'long'})}. A lighter day is part of a sustainable plan.</p><Field label="Study allowance (minutes)" help="Your actual available time is capped by free windows around fixed activities. Edit your weekly timetable in Plan."><input type="number" min="0" max="720" step="5" value={minutes} required onChange={event => setMinutes(event.target.value)}/></Field><div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Recalculate my day</Button></div></form></Modal>;
}

function TaskForm({data,date,today,onClose,onSave}) {
  const [form,setForm] = useState({title:'',date,minutes:15,category:'academics',subjectId:data.subjects.find(item => item.enabled)?.id || '',priority:'high'});
  const [error,setError] = useState('');
  const set = key => event => setForm(current => ({...current,[key]:event.target.value}));
  function submit(event) {
    event.preventDefault();
    if(form.date < today) {setError('Choose today or a future date. Previous days show your saved history.');return;}
    const committedTasks = data.tasks.filter(task => task.date === form.date && !task.skipped && (task.completed || task.origin === 'custom' || task.notes?.trim() || task.selfReview?.length || task.id === data.study?.active?.taskId));
    if (committedTasks.length >= 5) {setError('This day already has five committed tasks. Choose another date to keep your plan manageable.');return;}
    const capacity = getDailyPlan(data,form.date,today).availableMinutes;
    const committed = committedTasks.reduce((total,task) => total + task.minutes,0);
    if(Number(form.minutes)>Math.max(0,capacity-committed)) {setError('This task exceeds the time left after completed work and your chosen priorities. Choose a shorter task or another date.');return;}
    onSave({...form,minutes:Number(form.minutes),reason:'A priority you chose for this day.',steps:['Decide what a useful finished result looks like.','Work on one concrete part.','Save what you learned and the next step.']});
  }
  return <Modal title="Add an important task" onClose={onClose}><form className="stack" onSubmit={submit}><Field label="Task name"><input value={form.title} onChange={set('title')} required maxLength={180} placeholder="One specific action"/></Field><div className="form-grid"><Field label="Date"><input type="date" min={today} value={form.date} onChange={set('date')} required/></Field><Field label="Estimated minutes"><input type="number" min="5" max="180" value={form.minutes} onChange={set('minutes')} required/></Field></div><Field label="Category"><select value={form.category} onChange={set('category')}><option value="academics">School</option><option value="language">Language</option><option value="university">University</option><option value="activity">Application profile</option></select></Field>{form.category === 'academics' && <Field label="Subject"><select value={form.subjectId} onChange={set('subjectId')}>{data.subjects.filter(item=>item.enabled).map(subject=><option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></Field>}{error && <p className="form-error" role="alert">{error}</p>}<div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Add to plan</Button></div></form></Modal>;
}

createRoot(document.getElementById('root')).render(<AppRecovery><App/></AppRecovery>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load',()=>{ navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(()=>{}); });
}

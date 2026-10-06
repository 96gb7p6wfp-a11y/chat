import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, BookOpen,
  Check, CheckCheck, ChevronLeft, ChevronRight, CircleHelp, Compass, Flag,
  Flame, Focus as FocusIcon, GraduationCap, Heart, LayoutDashboard, Leaf, MessageCircle,
  ListChecks, LoaderCircle, LockKeyhole, Map, MoreHorizontal, Plus, Settings2,
  Shield, Sparkles, Star, Target, Timer, Trash2, Upload, X,
} from 'lucide-react';
import {
  localDateKey, createInitialState, normalizeState, makeDailyPlan, addTask,
  toggleTask, deleteTask, saveProfile, saveReflection, toggleMilestone, getStats, addGrade,
} from './planner.js';
import { FOCUS_KEY, elapsedSeconds, focusStage, formatTimer, normalizeSession } from './focus.js';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/libre-caslon-display/latin-400.css';
import './styles.css';

const DATA_KEY = 'northstar.data.v1';
const CATEGORIES = {
  academics: { label: 'Academics', icon: BookOpen, color: 'purple' },
  languages: { label: 'Languages', icon: MessageCircle, color: 'blue' },
  confidence: { label: 'Confidence', icon: Target, color: 'peach' },
  activities: { label: 'Activities', icon: Flag, color: 'peach' },
  wellbeing: { label: 'Wellbeing', icon: Heart, color: 'mint' },
  reflection: { label: 'Reflection', icon: Sparkles, color: 'blue' },
};
const NAV = [
  { id: 'today', label: 'Today', icon: LayoutDashboard },
  { id: 'pathway', label: 'My pathway', icon: Map },
  { id: 'progress', label: 'My progress', icon: BarChart3 },
  { id: 'focus', label: 'Focus space', icon: FocusIcon },
];

function initialData() {
  let saved;
  try {
    saved = localStorage.getItem(DATA_KEY);
    return makeDailyPlan(saved ? normalizeState(JSON.parse(saved)) : createInitialState(), localDateKey());
  } catch {
    if (saved) {
      try { localStorage.setItem(`${DATA_KEY}.recovery.${Date.now()}`,saved); } catch { /* Storage errors are surfaced by the app. */ }
    }
    return makeDailyPlan(createInitialState(), localDateKey());
  }
}
function readSession() {
  try { return normalizeSession(JSON.parse(localStorage.getItem(FOCUS_KEY))); } catch { return null; }
}
function dateFromKey(key) { return new Date(`${key}T12:00:00`); }
function niceDate(key, options = { month: 'long', day: 'numeric' }) {
  return dateFromKey(key).toLocaleDateString('en-US', options);
}
function dateOffset(key, offset) {
  const date = dateFromKey(key); date.setDate(date.getDate() + offset); return localDateKey(date);
}
function Badge({ category }) {
  const info = CATEGORIES[category] || CATEGORIES.academics;
  return <span className={`badge ${info.color}`}>{info.label}</span>;
}
function StarMark({ className = '' }) {
  return <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 1L24.8 15.2L39 20L24.8 24.8L20 39L15.2 24.8L1 20L15.2 15.2L20 1Z" fill="currentColor"/><path d="M20 10L22.5 17.5L30 20L22.5 22.5L20 30L17.5 22.5L10 20L17.5 17.5L20 10Z" fill="var(--paper)"/></svg>;
}
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const keyHandler = (event) => {
      if (event.key === 'Escape' && onClose) onClose();
      if (event.key === 'Tab') {
        const targets = ref.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]');
        if (!targets?.length) return;
        const first = targets[0], last = targets[targets.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keyHandler);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyHandler); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onClick={onClose}><section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
    <div className="modal-heading"><h2>{title}</h2>{onClose && <button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button>}</div>{children}
  </section></div>;
}

function App() {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState(() => NAV.some(x => x.id === location.hash.slice(1)) ? location.hash.slice(1) : 'today');
  const [now, setNow] = useState(Date.now());
  const today = localDateKey(new Date(now));
  const [selectedDay, setSelectedDay] = useState(today);
  const [category, setCategory] = useState('all');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [session, setSession] = useState(readSession);
  const [gateStarted, setGateStarted] = useState(null);
  const importRef = useRef(null);
  const stats = getStats(data, today);
  const dayTasks = data.tasks.filter(task => task.date === selectedDay);
  const dailyCompleted = data.tasks.filter(task => task.date === today && task.completed).length;
  const dailyTotal = data.tasks.filter(task => task.date === today).length;
  const seconds = elapsedSeconds(session, now);
  const stage = focusStage(seconds);
  const isRunning = !!session && !session.stoppedAt;
  const countdown = gateStarted == null ? 10 : Math.min(10, Math.max(0, 10 - Math.floor((now - gateStarted) / 1000)));

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); setStorageError(false); } catch { setStorageError(true); }
  }, [data]);
  useEffect(() => {
    try { if (session) localStorage.setItem(FOCUS_KEY, JSON.stringify(session)); else localStorage.removeItem(FOCUS_KEY); } catch { setStorageError(true); }
  }, [session]);
  useEffect(() => {
    if (isRunning && stage === 'reflect' && gateStarted == null) setGateStarted(Date.now());
    if (!isRunning && gateStarted != null) setGateStarted(null);
  }, [isRunning, stage, gateStarted]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { setData(state => makeDailyPlan(state, today)); }, [today]);
  useEffect(() => {
    const handler = () => { const id = location.hash.slice(1); if (NAV.some(item => item.id === id)) setTab(id); };
    window.addEventListener('hashchange', handler); return () => window.removeEventListener('hashchange', handler);
  }, []);

  function navigate(next) { setTab(next); location.hash = next; window.scrollTo({top:0, behavior:'smooth'}); }
  function notify(message) { setToast(message); }
  function exportData() {
    const blob = new Blob([JSON.stringify({...data, exportedAt:new Date().toISOString()}, null, 2)], {type:'application/json'});
    if (blob.size > 20 * 1024 * 1024) { notify('This backup exceeds the supported 20 MB size.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `northstar-${today}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Your backup is downloaded.');
  }
  async function importData(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('too large');
      const value = JSON.parse(await file.text());
      if (value.version !== 1 || !Array.isArray(value.tasks) || !Array.isArray(value.reflections) || !Array.isArray(value.milestones) || !value.profile || typeof value.profile !== 'object' || Array.isArray(value.profile)) throw new Error('format');
      if (value.grades != null && !Array.isArray(value.grades)) throw new Error('grades');
      const normalized = normalizeState(value);
      if (normalized.tasks.length !== value.tasks.length || normalized.reflections.length !== value.reflections.length || normalized.grades.length !== (value.grades?.length || 0)) throw new Error('invalid records');
      const knownMilestones = new Set(normalized.milestones.map(item => item.id));
      if (new Set(value.milestones.map(item => item?.id)).size !== value.milestones.length || value.milestones.some(item => !item || !knownMilestones.has(item.id) || typeof item.completed !== 'boolean')) throw new Error('milestones');
      if (value.tasks.some(task => typeof task.completed !== 'boolean' || task.completed !== normalized.tasks.find(item => item.id === task.id)?.completed)) throw new Error('completion');
      if (value.profile.dailyMinutes != null && (!Number.isFinite(value.profile.dailyMinutes) || value.profile.dailyMinutes < 20 || value.profile.dailyMinutes > 240)) throw new Error('profile');
      setModal({type:'import', data:normalized});
    } catch { notify('Please choose a valid Northstar JSON backup under 20 MB.'); }
    event.target.value = '';
  }
  function finishBreak(fields) {
    setData(state => saveReflection(state, {...fields, date:today}));
    setSession(current => current ? {...current, stoppedAt:Date.now()} : null);
    notify('Check-in saved. Choose your next step with intention.');
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a href="#today" className="brand" onClick={() => navigate('today')}><StarMark className="brand-star"/><span>northstar<span className="brand-dot">.</span></span></a>
      <div className="sidebar-label">YOUR PERSONAL COMPASS</div>
      <nav className="desktop-nav" aria-label="Main navigation">{NAV.map(item => <button key={item.id} className={`nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)} aria-current={tab === item.id ? 'page' : undefined}><item.icon size={19}/>{item.label}{tab === item.id && <span className="nav-dot"/>}</button>)}</nav>
      <div className="destination-card"><div className="destination-heading"><GraduationCap size={18}/><span>THE BIG PICTURE</span></div><h3>A future you’re<br/>excited about.</h3><div className="college-row"><span className="college-dot"/>UCLA</div><div className="college-row"><span className="college-dot gold"/>UC Berkeley</div><p>Small steps. Real growth.<br/>Your own path.</p><button onClick={() => navigate('pathway')}>Explore your pathway <ArrowUpRight size={16}/></button></div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setModal({type:'help'})}><CircleHelp size={18}/>How Northstar works</button><button className="profile-button" onClick={() => setModal({type:'profile'})}><span className="avatar">{data.profile.name ? data.profile.name.slice(0,1).toUpperCase() : <Leaf size={18}/>}</span><span><strong>{data.profile.name || 'Your space'}</strong><small>Make it yours</small></span><Settings2 size={17}/></button></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><span className="topbar-label">Your overview</span><span className="topbar-divider">/</span><span>{NAV.find(item => item.id === tab).label}</span></div><div className="topbar-actions"><span className="local-badge"><span/>Saved on your device</span><button className="icon-button export-button" aria-label="Export backup" title="Export backup" onClick={exportData}><ArrowDownToLine size={18}/></button><button className="avatar small" aria-label="Edit your profile" onClick={() => setModal({type:'profile'})}>{data.profile.name ? data.profile.name.slice(0,1).toUpperCase() : <Leaf size={16}/>}</button></div></header>
      {storageError && <div className="storage-warning" role="alert">This browser cannot save your changes. Export a backup before closing the app. <button onClick={exportData}>Export now</button></div>}
      <div className="page-heading"><div><div className="eyebrow"><span className="tiny-star">✦</span>{tab === 'today' ? niceDate(today, {weekday:'long', month:'long', day:'numeric'}) : 'A LITTLE INTENTION GOES A LONG WAY'}</div><h1>{tab === 'today' ? <>A little better, <em>every day.</em></> : tab === 'pathway' ? <>Big dreams. <em>Clear direction.</em></> : tab === 'progress' ? <>Look how far <em>you’re going.</em></> : <>Less scrolling. <em>More living.</em></>}</h1><p>{tab === 'today' ? `${data.profile.name ? `${data.profile.name}, here’s` : 'Here’s'} your next step toward the life you want. You don’t have to do it all today.` : tab === 'pathway' ? 'Build a profile that reflects who you are—and who you’re becoming.' : tab === 'progress' ? 'Every completed step counts. This is your progress, in perspective.' : 'Make a little room for the things that matter to you.'}</p></div>{tab === 'today' && <button className="outline-button heading-button" onClick={() => setModal({type:'task', date:selectedDay})}><Plus size={17}/>Add a task</button>}</div>

      {tab === 'today' && <>
        <div className="overview-grid">
          <section className="daily-hero"><div className="hero-copy"><div className="hero-tag"><Sparkles size={14}/>TODAY’S NORTH STAR</div><h2>Show up for<br/>your future self.</h2><p>A focused study session. One meaningful step.<br className="desktop-break"/> A little time to recharge. That’s a good day.</p><div className="hero-bottom"><span><span className="hero-mini-icon"><ListChecks size={14}/></span>{dailyTotal - dailyCompleted} steps left today</span><span className="hero-dot">·</span><span><Timer size={15}/>{data.tasks.filter(t => t.date === today && !t.completed).reduce((sum,t) => sum+t.minutes,0)} min planned</span></div></div><div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><StarMark className="hero-star star-one"/><StarMark className="hero-star star-two"/><div className="daily-ring" style={{'--progress':`${dailyTotal ? dailyCompleted/dailyTotal*360 : 0}deg`}}><div><strong>{dailyCompleted}<span>/{dailyTotal}</span></strong><small>steps complete</small><span className="ring-caption">YOU’VE GOT THIS</span></div></div></div></section>
          <section className="focus-teaser"><div className="card-topline"><span className="round-icon"><FocusIcon size={19}/></span><span className="mini-label">A LITTLE BREATHING ROOM</span></div><h2>Protect your attention.</h2><p>Your next chapter deserves<br/>a little less screen time.</p><button className="dark-button" onClick={() => navigate('focus')}>{isRunning ? 'Return to your timer' : 'Enter focus space'}<ArrowUpRight size={17}/></button><div className="teaser-note"><Shield size={13}/>Intentional breaks, at your pace</div></section>
        </div>
        <div className="dashboard-grid">
          <section className="task-section"><div className="section-heading"><div><h2>Your daily plan <span className="count-bubble">{dayTasks.length}</span></h2><p>Small steps, big direction.</p></div><button className="text-button" onClick={() => setModal({type:'task',date:selectedDay})}><Plus size={16}/>Add task</button></div><WeekStrip today={today} selected={selectedDay} setSelected={setSelectedDay}/><div className="task-tabs" aria-label="Filter tasks">{['all',...Object.keys(CATEGORIES)].map(id => <button key={id} className={category === id ? 'selected' : ''} onClick={() => setCategory(id)}>{id === 'all' ? 'All tasks' : CATEGORIES[id].label}</button>)}</div><div className="task-list">{dayTasks.filter(task => category === 'all' || task.category === category).map(task => <TaskRow key={task.id} task={task} onToggle={() => {setData(state => toggleTask(state,task.id)); if (!task.completed) notify('One step closer. Nice work.');}} onDelete={() => setModal({type:'delete',task})}/>)}{!dayTasks.filter(task => category === 'all' || task.category === category).length && <div className="empty-state"><Leaf size={24}/><h3>{dayTasks.length ? 'A little breathing room.' : 'A fresh page for your day.'}</h3><p>{dayTasks.length ? 'No tasks in this category yet.' : 'Create a balanced plan or add a step of your own.'}</p>{!dayTasks.length && <button className="outline-button" onClick={() => {setData(state => makeDailyPlan(state,selectedDay)); notify('A balanced plan is ready for this day.');}}><Sparkles size={16}/>Plan this day</button>}</div>}</div><button className="add-task-row" onClick={() => setModal({type:'task',date:selectedDay})}><Plus size={17}/>Add one small step</button><div className="gentle-note"><Leaf size={14}/>{dailyCompleted === dailyTotal && dailyTotal > 0 ? 'Your plan is complete. Leave some room to rest.' : 'Progress over perfection. A little is better than nothing.'}</div></section>
          <div className="right-column"><ReflectionCard key={today} data={data} today={today} onSave={fields => {setData(state => saveReflection(state,{...fields,date:today})); notify('Your daily reflection is saved.');}}/><section className="pathway-preview"><div className="mini-label"><Compass size={15}/>YOUR NEXT CHAPTER</div><h3>Build depth,<br/>not just a checklist.</h3><p>Follow your curiosity. Keep showing up. Document what you learn.</p><button className="text-button" onClick={() => navigate('pathway')}>See your pathway<ArrowRight size={16}/></button><div className="pathway-lines"><span/><span/><span/><StarMark/></div></section></div>
        </div>
      </>}
      {tab === 'pathway' && <Pathway data={data} onToggle={id => setData(state => toggleMilestone(state,id))} onPlan={milestone => {setData(state => addTask(state,{title:milestone.title,category:milestone.category,date:today,minutes:20})); notify('Added to today’s plan.');}} onProfile={() => setModal({type:'profile'})}/>}
      {tab === 'progress' && <Progress data={data} stats={stats} today={today} onGrade={() => setModal({type:'grade'})} onDeleteGrade={grade => setModal({type:'delete-grade',grade})}/>}
      {tab === 'focus' && <FocusSpace session={session} seconds={seconds} stage={stage} onStart={app => {setSession({startedAt:Date.now(),app}); setNow(Date.now());}} onStop={() => setSession(current => current ? {...current,stoppedAt:Date.now()} : null)} onReset={() => setSession(null)} onDemo={() => setModal({type:'demo'})}/>}
      <footer className="page-footer"><StarMark/><span>Made for your life, not just your application.</span><span className="footer-private"><LockKeyhole size={12}/>Private by default</span></footer>
    </main>
    <nav className="mobile-nav" aria-label="Mobile navigation">{NAV.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={21}/><span>{item.id === 'pathway' ? 'Pathway' : item.id === 'progress' ? 'Progress' : item.id === 'focus' ? 'Focus' : 'Today'}</span></button>)}</nav>
    <input className="visually-hidden" type="file" accept=".json,application/json" ref={importRef} onChange={importData} tabIndex={-1}/>
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {modal?.type === 'task' && <TaskModal date={modal.date} onClose={() => setModal(null)} onSave={fields => {setData(state => addTask(state,fields)); setModal(null); notify('Your new step is on the plan.');}}/>}
    {modal?.type === 'grade' && <GradeModal today={today} onClose={() => setModal(null)} onSave={fields => {setData(state => addGrade(state,fields)); setModal(null); notify('Your grade is recorded. One starting point for growth.');}}/>}
    {modal?.type === 'delete-grade' && <Modal title="Remove this grade?" onClose={() => setModal(null)}><p className="modal-intro">{modal.grade.subject}: {modal.grade.points} / 15 points. This record will be removed.</p><div className="form-actions"><button className="outline-button" onClick={() => setModal(null)}>Keep it</button><button className="dark-button" onClick={() => {setData(state => ({...state,grades:state.grades.filter(grade => grade.id !== modal.grade.id)})); setModal(null);}}>Remove grade</button></div></Modal>}
    {modal?.type === 'profile' && <ProfileModal profile={data.profile} onClose={() => setModal(null)} onSave={patch => {setData(state => saveProfile(state,patch)); setModal(null); notify('Your profile is saved. Future daily plans will adapt to it.');}} onExport={exportData} onImport={() => importRef.current?.click()}/>}
    {modal?.type === 'delete' && <Modal title="Remove this step?" onClose={() => setModal(null)}><p className="modal-intro">“{modal.task.title}” will be removed, including its completion record.</p><div className="form-actions"><button className="outline-button" onClick={() => setModal(null)}>Keep it</button><button className="dark-button" onClick={() => {setData(state => deleteTask(state,modal.task.id)); setModal(null);}}>Remove step</button></div></Modal>}
    {modal?.type === 'import' && <Modal title="Restore your backup?" onClose={() => setModal(null)}><p className="modal-intro">This backup contains {modal.data.tasks.length} tasks and {modal.data.reflections.length} reflections. Restoring replaces the data currently on this device.</p><button className="text-button" onClick={exportData}><ArrowDownToLine size={15}/>Back up current data first</button><div className="form-actions"><button className="outline-button" onClick={() => setModal(null)}>Cancel</button><button className="dark-button" onClick={() => {setData(makeDailyPlan(modal.data,today)); setModal(null); notify('Your backup is restored.');}}>Restore backup</button></div></Modal>}
    {modal?.type === 'help' && <Modal title="Your compass, not a pressure machine." onClose={() => setModal(null)}><div className="help-content"><p>Northstar turns your goals into small daily actions. Complete a step, reflect on your day, and see your real progress over time.</p><h3>Start with your profile</h3><p>Add your school year, interests, and available time. Your future daily plans use these details. Keep the plan realistic and adapt it yourself.</p><h3>Keep your data safe</h3><p>Your tasks and journal stay in this browser. There is no account or cloud sync. Clearing browser data can remove them; download backups from the profile menu.</p><h3>Use it on your iPhone</h3><p>Open a hosted HTTPS version in Safari, then tap Share → Add to Home Screen. After your first visit, previously loaded screens work offline.</p><h3>Focus without false promises</h3><p>The timer tracks a break you start here. It cannot observe, notify over, or block other iPhone apps. Configure iPhone Settings → Screen Time → App Limits for actual app limits.</p><h3>Your college pathway</h3><p>The pathway is a planning guide, not a prediction of admission. Verify current requirements and dates with UCLA, UC Berkeley, and your school counselor.</p></div><button className="dark-button full-width" onClick={() => {setModal({type:'profile'});}}>Personalize my plan<ArrowRight size={17}/></button></Modal>}
    {modal?.type === 'demo' && <BreakModal demo countdownSeconds={10} onComplete={() => {setModal(null); notify('Preview complete. No reflection or timer data was changed.');}}/>}
    {gateStarted != null && isRunning && <BreakModal countdownSeconds={countdown} onComplete={finishBreak}/>}
  </div>;
}

function WeekStrip({today, selected, setSelected}) {
  const monday = dateFromKey(selected); monday.setDate(monday.getDate() - ((monday.getDay()+6)%7));
  return <div className="week-strip"><button className="week-arrow icon-button" aria-label="Previous week" onClick={() => setSelected(dateOffset(selected,-7))}><ChevronLeft size={18}/></button>{Array.from({length:7},(_,i) => { const key = dateOffset(localDateKey(monday),i); return <button key={key} className={`day-button ${selected === key ? 'active' : ''} ${today === key ? 'is-today' : ''}`} onClick={() => setSelected(key)} aria-label={niceDate(key,{weekday:'long',month:'long',day:'numeric'})} aria-pressed={selected === key}><span>{niceDate(key,{weekday:'short'}).slice(0,3)}</span><strong>{dateFromKey(key).getDate()}</strong><i/></button>; })}<button className="week-arrow icon-button" aria-label="Next week" onClick={() => setSelected(dateOffset(selected,7))}><ChevronRight size={18}/></button></div>;
}
function TaskRow({task,onToggle,onDelete}) {
  const CategoryIcon = (CATEGORIES[task.category] || CATEGORIES.academics).icon;
  return <div className={`task-row ${task.completed ? 'completed' : ''}`}><button className="task-check" aria-label={`${task.completed ? 'Mark incomplete' : 'Complete'}: ${task.title}`} aria-pressed={task.completed} onClick={onToggle}>{task.completed && <Check size={15}/>}</button><div className="task-details"><span className="task-title">{task.title}</span><div className="task-meta"><Badge category={task.category}/><span><Timer size={12}/>{task.minutes} min</span></div></div><span className={`task-category-icon ${CATEGORIES[task.category]?.color}`}><CategoryIcon size={18}/></span><button className="icon-button delete-task" aria-label={`Remove: ${task.title}`} onClick={onDelete}><Trash2 size={15}/></button></div>;
}
function ReflectionCard({data,today,onSave}) {
  const entry = data.reflections.find(item => item.date === today);
  const [achieved,setAchieved] = useState(entry?.achieved || '');
  const [next,setNext] = useState(entry?.next || '');
  const [gratitude,setGratitude] = useState(entry?.gratitude || '');
  return <section className="reflection-card"><div className="reflection-top"><span className="round-icon lavender"><Sparkles size={18}/></span><span className="mini-label">PAUSE. NOTICE. GROW.</span></div><h2>Your daily check-in</h2><p>A minute to see what mattered today.</p><form onSubmit={e => {e.preventDefault(); onSave({achieved,next,gratitude});}}><label htmlFor="reflection-achieved">What are you proud of today?</label><textarea id="reflection-achieved" maxLength={2000} rows={2} value={achieved} onChange={e => setAchieved(e.target.value)} placeholder="A small win counts, too…" required/><label htmlFor="reflection-next">What’s your next small step?</label><textarea id="reflection-next" maxLength={2000} rows={2} value={next} onChange={e => setNext(e.target.value)} placeholder="Something you can actually do…"/><details><summary>Make room for gratitude <Heart size={13}/></summary><textarea aria-label="What are you grateful for?" maxLength={2000} rows={2} value={gratitude} onChange={e => setGratitude(e.target.value)} placeholder="Something you’re grateful for…"/></details><button className="outline-button full-width" type="submit">{entry ? 'Update reflection' : 'Save reflection'}<ArrowRight size={15}/></button></form></section>;
}
function TaskModal({date,onClose,onSave}) {
  return <Modal title="One small step." onClose={onClose}><p className="modal-intro">Keep it specific. Keep it doable.</p><form onSubmit={e => {e.preventDefault(); const fields = new FormData(e.currentTarget); const title = fields.get('title').trim(); if (!title) return; onSave({title,category:fields.get('category'),date:fields.get('date'),minutes:Number(fields.get('minutes'))});}}><label htmlFor="task-title">What will you do?</label><input id="task-title" name="title" maxLength={180} placeholder="e.g. Review my chemistry mistakes" required autoFocus/><div className="form-grid"><div><label htmlFor="task-category">Area of your life</label><select id="task-category" name="category">{Object.entries(CATEGORIES).map(([id,item]) => <option key={id} value={id}>{item.label}</option>)}</select></div><div><label htmlFor="task-minutes">Minutes</label><input id="task-minutes" name="minutes" type="number" min={1} max={480} defaultValue={20} required/></div></div><label htmlFor="task-date">Plan for</label><input id="task-date" name="date" type="date" defaultValue={date} required/><div className="form-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="dark-button" type="submit">Add to my plan<Plus size={16}/></button></div></form></Modal>;
}
function GradeModal({today,onClose,onSave}) {
  return <Modal title="A starting point for growth." onClose={onClose}>
    <p className="modal-intro">Record an assessment using German upper-secondary points (0–15). These records are not a calculated Abitur grade.</p>
    <form onSubmit={e => {e.preventDefault(); const f = new FormData(e.currentTarget); const raw = f.get('points'); const subject = f.get('subject').trim(); const points = Number(raw); if (!subject || raw === '' || !Number.isFinite(points) || points < 0 || points > 15) return; onSave({subject,points,date:f.get('date'),note:f.get('note')});}}>
      <label htmlFor="grade-subject">Subject</label><input id="grade-subject" name="subject" maxLength={100} placeholder="e.g. English" required autoFocus/>
      <div className="form-grid"><div><label htmlFor="grade-points">Points (0–15)</label><input id="grade-points" name="points" type="number" min="0" max="15" step="0.5" required placeholder="e.g. 11"/></div><div><label htmlFor="grade-date">Assessment date</label><input id="grade-date" name="date" type="date" defaultValue={today} max={today} required/></div></div>
      <label htmlFor="grade-note">What did you learn?</label><textarea id="grade-note" name="note" maxLength={1000} rows={3} placeholder="What went well? What will you practice next?"/>
      <div className="form-actions"><button className="outline-button" type="button" onClick={onClose}>Cancel</button><button className="dark-button" type="submit">Save grade<Check size={16}/></button></div>
    </form>
  </Modal>;
}
function ProfileModal({profile,onSave,onClose,onExport,onImport}) {
  return <Modal title="A plan that feels like you." onClose={onClose} wide>
    <p className="modal-intro">Your Abitur finishes in summer 2028. Your application and university entry dates can stay open while you decide.</p>
    <form onSubmit={e => {e.preventDefault(); const fields = Object.fromEntries(new FormData(e.currentTarget)); fields.dailyMinutes = Number(fields.dailyMinutes); onSave(fields);}}>
      <div className="form-grid"><div><label htmlFor="profile-name">Your first name</label><input id="profile-name" name="name" defaultValue={profile.name} maxLength={50} placeholder="What should we call you?"/></div><div><label htmlFor="profile-year">School year / grade</label><input id="profile-year" name="schoolYear" defaultValue={profile.schoolYear} maxLength={60}/></div></div>
      <label htmlFor="profile-school">Country & school system</label><input id="profile-school" name="schoolSystem" defaultValue={profile.schoolSystem} maxLength={100}/>
      <div className="form-grid"><div><label htmlFor="profile-graduation">Abitur / graduation year</label><input id="profile-graduation" name="graduationYear" type="number" min="2026" max="2040" defaultValue={profile.graduationYear}/></div><div><label htmlFor="profile-application">Intended application year</label><input id="profile-application" name="applicationYear" type="number" min="2026" max="2040" defaultValue={profile.applicationYear} placeholder="To be confirmed"/></div></div>
      <label htmlFor="profile-time">Daily planning budget</label><select id="profile-time" name="dailyMinutes" defaultValue={profile.dailyMinutes}>{[30,45,60,90,120].map(n => <option key={n} value={n}>{n} minutes</option>)}</select>
      <label htmlFor="profile-major">Interests or possible major</label><input id="profile-major" name="major" defaultValue={profile.major} maxLength={100} placeholder="Still deciding is okay"/>
      <label htmlFor="profile-subjects">Subjects that need attention</label><input id="profile-subjects" name="subjects" defaultValue={profile.subjects} maxLength={180} placeholder="e.g. math, English, chemistry"/>
      <label htmlFor="profile-grade-goal">Your grade goal</label><input id="profile-grade-goal" name="gradeGoal" defaultValue={profile.gradeGoal} maxLength={180} placeholder="e.g. Improve English from 9 to 11 points"/>
      <div className="profile-info"><Leaf size={17}/><p>Your daily plan balances grades, English/German, confidence, interests, rest, and reflection. Your future plans adapt to your available time.</p></div>
      <div className="form-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="dark-button" type="submit">Save my profile<Check size={16}/></button></div>
    </form>
    <div className="backup-section"><div><strong>Your data belongs to you.</strong><p>Local storage only. Back it up regularly.</p></div><div><button className="text-button" onClick={onExport}><ArrowDownToLine size={15}/>Export</button><button className="text-button" onClick={onImport}><Upload size={15}/>Restore</button></div></div>
  </Modal>;
}

function Pathway({data,onToggle,onPlan,onProfile}) {
  const done = data.milestones.filter(item => item.completed).length;
  const pillars = [
    {id:'academics',number:'01',title:'Make learning your foundation.',description:'Build consistent study habits. Understand your school’s requirements and work on your weakest subjects.',icon:BookOpen},
    {id:'languages',number:'02',title:'Find your voice, in both languages.',description:'Practice reading, writing, listening, and speaking in English and German. Keep feedback and examples of improvement.',icon:MessageCircle},
    {id:'confidence',number:'03',title:'Confidence grows through small acts.',description:'Ask a question. Share an idea. Try one manageable thing that feels a little outside your comfort zone.',icon:Target},
    {id:'activities',number:'04',title:'Find something worth showing up for.',description:'Choose interests you care about. Depth, contribution, and growth matter more than collecting titles.',icon:Flag},
    {id:'reflection',number:'05',title:'Know your story. Prepare your next step.',description:'Keep a record of what you learn and contribute. Check current application requirements with your counselor.',icon:Sparkles},
  ];
  return <><section className="pathway-banner"><div><div className="hero-tag"><Compass size={15}/>YOUR PERSONAL ROADMAP</div><h2>Become someone you’re proud of.</h2><p>Strong grades. Meaningful experiences. A story that’s yours.</p></div><div className="pathway-completion"><strong>{done}<span>/{data.milestones.length}</span></strong><span>milestones completed</span></div></section><div className="pathway-personalize"><span><Settings2 size={17}/>{data.profile.schoolYear ? `${data.profile.schoolYear}${data.profile.graduationYear ? ` · Abitur ${data.profile.graduationYear}` : ''}${data.profile.applicationYear ? ` · Applying ${data.profile.applicationYear}` : ''}` : 'Add your school year and interests for a more personal daily plan.'}</span><button className="text-button" onClick={onProfile}>Edit profile<ArrowRight size={15}/></button></div><div className="pillar-list">{pillars.map(pillar => <section className="pillar-card" key={pillar.id}><div className="pillar-intro"><span className={`pillar-number ${CATEGORIES[pillar.id].color}`}>{pillar.number}</span><div><h2>{pillar.title}</h2><p>{pillar.description}</p></div><pillar.icon size={25}/></div><div className="milestone-list">{data.milestones.filter(item => item.category === pillar.id).map(item => <div className={`milestone ${item.completed ? 'done' : ''}`} key={item.id}><button className="task-check" aria-label={`${item.completed ? 'Uncomplete' : 'Complete'} milestone: ${item.title}`} aria-pressed={item.completed} onClick={() => onToggle(item.id)}>{item.completed && <Check size={14}/>}</button><div><h3>{item.title}</h3><p>{item.description}</p></div><button className="icon-button" title="Add milestone to today’s plan" aria-label={`Add to today: ${item.title}`} onClick={() => onPlan(item)}><Plus size={18}/></button></div>)}</div></section>)}</div><section className="official-resources"><div><GraduationCap size={23}/><h3>Keep the official guidance close.</h3><p>Your pathway supports growth. University requirements, deadlines, and decisions come from the universities.</p></div><div className="resource-links"><a href="https://admission.ucla.edu/apply/freshman" target="_blank" rel="noreferrer">UCLA admissions<ArrowUpRight size={16}/></a><a href="https://admissions.berkeley.edu/apply-to-berkeley/" target="_blank" rel="noreferrer">UC Berkeley admissions<ArrowUpRight size={16}/></a><a href="https://admission.universityofcalifornia.edu/how-to-apply/" target="_blank" rel="noreferrer">UC application guide<ArrowUpRight size={16}/></a></div></section></>;
}
function Progress({data,stats,today,onGrade,onDeleteGrade}) {
  const [month,setMonth] = useState(today.slice(0,7));
  const periodStats = getStats(data,`${month}-15`);
  const max = Math.max(4,...stats.weekly7.map(item => item.completed));
  const monthlyReflections = data.reflections.filter(item => item.date.startsWith(month)).sort((a,b) => b.date.localeCompare(a.date));
  const grades = [...data.grades].sort((a,b) => b.date.localeCompare(a.date));
  return <>
    <div className="month-filter"><label htmlFor="progress-month">Explore a month</label><input id="progress-month" type="month" value={month} max={today.slice(0,7)} min="1900-01" onChange={e => {if(e.target.value) setMonth(e.target.value);}}/></div>
    <div className="stats-grid">
      <StatCard icon={CheckCheck} color="mint" number={stats.today.completed} label="Steps taken today" note={`${stats.today.completedMinutes} minutes of completed work`}/>
      <StatCard icon={Flag} color="purple" number={periodStats.month.completed} label="Steps this month" note={niceDate(`${month}-15`,{month:'long',year:'numeric'})}/>
      <StatCard icon={Flame} color="peach" number={stats.streak} label="Day streak" note="Days with completed steps"/>
      <StatCard icon={Star} color="blue" number={stats.overall.completed} label="Steps, all time" note="Every small step counts"/>
    </div>
    <div className="progress-grid">
      <section className="chart-card"><div className="section-heading"><div><h2>A week of showing up.</h2><p>Tasks you actually completed each day.</p></div><span className="badge mint">Last 7 days</span></div><div className="bar-chart">{stats.weekly7.map(item => <div className={`bar-column ${item.date === today ? 'current' : ''}`} key={item.date}><strong>{item.completed}</strong><div className="bar-track"><div className="bar-fill" style={{height:`${item.completed/max*100}%`,minHeight:item.completed ? 8 : 3}}/></div><span>{niceDate(item.date,{weekday:'short'})}</span></div>)}</div><div className="chart-note"><Leaf size={15}/>Some days are quieter. Progress doesn’t have to be a straight line.</div></section>
      <section className="balance-card"><h2>Your month, in balance.</h2><p>Where your completed steps went.</p><div className="balance-list">{Object.entries(CATEGORIES).map(([id,info]) => <div key={id}><span className={`round-icon ${info.color}`}><info.icon size={17}/></span><div><strong>{info.label}</strong><div className="balance-track"><i className={info.color} style={{width:`${periodStats.month.completed ? periodStats.month.categories[id]/periodStats.month.completed*100 : 0}%`}}/></div></div><b>{periodStats.month.categories[id] || 0}</b></div>)}</div></section>
    </div>
    <section className="grades-section"><div className="section-heading"><div><h2>Learn from your grades.</h2><p>German upper-secondary points · 0–15. Recorded assessments, without assumed weights.</p></div><button className="outline-button" onClick={onGrade}><Plus size={16}/>Record a grade</button></div>
      {grades.length ? <><div className="grade-subjects">{stats.grades.bySubject.map(item => <div className="grade-subject" key={item.subject}><BookOpen size={18}/><h3>{item.subject}</h3><strong>{item.latestPoints}<span> / 15</span></strong><p>Latest assessment · {niceDate(item.latestDate,{month:'short',day:'numeric'})}</p><small>Recorded average: {item.average.toFixed(1)} points</small></div>)}</div><div className="grade-records">{grades.map(grade => <div className="grade-record" key={grade.id}><div><strong>{grade.subject}</strong><p>{grade.note || niceDate(grade.date,{month:'short',day:'numeric',year:'numeric'})}</p></div><span>{grade.points} / 15</span><button className="icon-button" aria-label={`Remove grade: ${grade.subject}`} onClick={() => onDeleteGrade(grade)}><Trash2 size={15}/></button></div>)}</div></> : <div className="empty-state"><BookOpen size={26}/><h3>Your starting point is yours.</h3><p>Record your current assessments. Track improvement and ask teachers for specific feedback.</p></div>}
    </section>
    <section className="journal-section"><div className="section-heading"><div><h2>Your reflection journal</h2><p>{monthlyReflections.length} {monthlyReflections.length === 1 ? 'check-in' : 'check-ins'} this month. A record of your growth.</p></div><Sparkles size={23}/></div>{monthlyReflections.length ? <div className="journal-grid">{monthlyReflections.map(entry => <article className="journal-entry" key={entry.date}><span className="mini-label">{niceDate(entry.date,{weekday:'short',month:'short',day:'numeric'})}</span><h3>A moment worth keeping.</h3><p>{entry.achieved}</p>{entry.next && <div><strong>My next step</strong><p>{entry.next}</p></div>}{entry.gratitude && <div><strong>I’m grateful for</strong><p>{entry.gratitude}</p></div>}{entry.intention && <div><strong>My intention</strong><p>{entry.intention}</p></div>}</article>)}</div> : <div className="empty-state journal-empty"><Sparkles size={28}/><h3>Your story starts with a moment.</h3><p>Save a daily check-in on the Today page. Your reflections will appear here.</p></div>}</section>
  </>;
}

function StatCard({icon:Icon,color,number,label,note}) { return <section className="stat-card"><span className={`round-icon ${color}`}><Icon size={19}/></span><strong className="stat-number">{number}</strong><h3>{label}</h3><p>{note}</p></section>; }

function FocusSpace({session,seconds,stage,onStart,onStop,onReset,onDemo}) {
  const [app,setApp] = useState('TikTok');
  const running = session && !session.stoppedAt;
  return <><div className="focus-grid"><section className="focus-timer-card"><div className="hero-tag"><FocusIcon size={15}/>AN INTENTIONAL SOCIAL BREAK</div><h2>You choose when<br/>to put the phone down.</h2><p>Start a timer before a social break. Come back here for a nudge and a moment to reflect.</p><div className="social-selector" aria-label="Choose app for your timer">{['TikTok','Instagram','Snapchat','Other'].map(name => <button className={(running ? session.app : app) === name ? 'selected' : ''} key={name} disabled={!!running} onClick={() => setApp(name)}>{name}</button>)}</div><div className={`big-timer ${stage === 'reminder' && running ? 'reminder' : ''}`} aria-label={`${formatTimer(seconds)} elapsed`}>{formatTimer(seconds)}</div><div className="timer-status">{running ? <>Tracking your {session.app} break here</> : session ? 'Your break is finished. Welcome back.' : 'Ready when you are. No pressure.'}</div>{running && stage === 'reminder' && <div className="focus-reminder" role="status"><Leaf size={18}/><span>30 minutes have passed. Is scrolling still how you want to spend this moment?</span></div>}<div className="timer-actions">{running ? <button className="dark-button" onClick={onStop}><Check size={17}/>Finish my break</button> : <button className="dark-button" onClick={() => onStart(app)}><Timer size={17}/>{session ? 'Start a new break' : 'Start my break'}</button>}{session && !running && <button className="outline-button" onClick={onReset}>Reset timer</button>}</div><div className="timer-footnote"><LockKeyhole size={13}/>This timer measures elapsed time, not activity in other apps.</div></section><div className="focus-information"><section className="focus-rules-card"><span className="round-icon mint"><Leaf size={20}/></span><h2>A kinder kind of limit.</h2><div className="focus-rule"><span>30<span>min</span></span><div><h3>A gentle reminder.</h3><p>When you return here, pause and decide whether you want to keep scrolling.</p></div></div><div className="focus-rule"><span>60<span>min</span></span><div><h3>A moment to reset.</h3><p>In this app, take a 10-second pause and answer three reflection questions.</p></div></div><button className="text-button" onClick={onDemo}>Try the 10-second check-in<ArrowRight size={16}/></button></section><section className="screen-time-card"><Shield size={22}/><h3>Want actual app limits?</h3><p>An iPhone web app can’t monitor or block TikTok, Instagram, or Snapchat, or send an alert over them. For limits on those apps:</p><ol><li>Open iPhone <strong>Settings → Screen Time</strong>.</li><li>Choose <strong>App Limits → Add Limit</strong>.</li><li>Select your social apps and set a daily limit. Enable <strong>Block at End of Limit</strong> if available.</li></ol><p className="small-note">Options vary by iOS version. A native Northstar app would need Apple Screen Time authorization and entitlements.</p></section></div></div></>;
}
function BreakModal({demo=false,countdownSeconds,onComplete}) {
  const [remaining,setRemaining] = useState(countdownSeconds);
  const [achieved,setAchieved] = useState('');
  const [next,setNext] = useState('');
  const [intention,setIntention] = useState('');
  useEffect(() => {
    if (!demo) {setRemaining(countdownSeconds); return;}
    const start = Date.now(); const timer = setInterval(() => setRemaining(Math.max(0,10-Math.floor((Date.now()-start)/1000))),250);
    return () => clearInterval(timer);
  }, [demo,countdownSeconds]);
  return <Modal title={demo ? 'A moment to reset. · Preview' : 'A moment to reset.'}><div className="break-visual"><span className="break-circle">{remaining > 0 ? remaining : <Leaf size={30}/>}</span><p>{remaining > 0 ? 'Breathe in. Breathe out. Give yourself a little space.' : 'Now choose your next step with intention.'}</p></div><p className="modal-intro">{demo ? 'This is a preview. Nothing you write here will be saved.' : 'Your timer reached an hour. Check in with yourself before continuing in Northstar.'}</p><form onSubmit={e => {e.preventDefault(); if (remaining > 0) return; onComplete({achieved,next,intention});}}><label htmlFor="break-achieved">What have you done or achieved today?</label><textarea id="break-achieved" maxLength={2000} rows={2} required value={achieved} onChange={e => setAchieved(e.target.value)} placeholder="Notice one thing, however small…"/><label htmlFor="break-next">What do you still need to do now?</label><textarea id="break-next" maxLength={2000} rows={2} required value={next} onChange={e => setNext(e.target.value)} placeholder="Name your next small step…"/><label htmlFor="break-intention">What will help you put your phone down?</label><textarea id="break-intention" maxLength={2000} rows={2} required value={intention} onChange={e => setIntention(e.target.value)} placeholder="A change of room, some water, a short walk…"/><button className="dark-button full-width" disabled={remaining > 0} type="submit">{remaining > 0 ? `Take ${remaining} more ${remaining === 1 ? 'second' : 'seconds'}` : demo ? 'Finish preview' : 'Save check-in & reset'}{remaining > 0 ? <Timer size={16}/> : <ArrowRight size={16}/>}</button></form></Modal>;
}

createRoot(document.getElementById('root')).render(<App/>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => { /* Online use remains available if offline setup is unsupported. */ }); });
}

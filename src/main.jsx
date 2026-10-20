import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, CalendarDays, Check, Compass, Plus, Sun, TrendingUp, UserRound } from 'lucide-react';
import { addTask, ensureDailyPlan, getDailyPlan, localDateKey, normalizeData, removeTask, saveSchedule, saveTaskNotes, saveTaskReview, shiftDate, skipTask, toggleTask, moveTask, editTask, replaceTask } from './coach.js';
import Today from './components/Today.jsx';
import GuidedLearning from './components/GuidedLearning.jsx';
import { getGuidedSession } from './guided-learning.js';
import { subjectLabel, categoryLabel } from './i18n.js';
import { loadData, MAX_BACKUP_BYTES, parseBackup, saveData, serializeBackup, STORAGE_KEY } from './storage.js';
import Plan from './components/Plan.jsx';
import Progress from './components/Progress.jsx';
import Profile from './components/Profile.jsx';
import Onboarding from './components/Onboarding.jsx';
import SchoolImport from './components/SchoolImport.jsx';
import { StudyDialog, StudyDock, StudyLauncher, StudySaved } from './components/StudyTimer.jsx';
import { discardStudy, finishStudy, getStudyTimer, pauseStudy, resumeStudy, startStudy } from './study.js';
import { Button, EmptyState, Field, Modal, formatDate, formatMinutes } from './components/UI.jsx';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import './styles.css';
import './semantic.css';

const NAV = [{ id:'today', label:'Heute', icon:Sun }, { id:'plan', label:'Lernplan', icon:CalendarDays }, { id:'progress', label:'Fortschritt', icon:TrendingUp }, { id:'profile', label:'Profil', icon:UserRound }];
const goalLabel = task => task.linkedGoal || ({academics:'Stärkere Noten für das Abitur',language:'Sprachlich auf das Studium vorbereiten',university:'Bewerbungen gezielt vorbereiten',activity:'Ein belegbares Bewerbungsprofil aufbauen',review:'Deinen Weg zum Studium realistisch gestalten'}[task.category] || 'Dein Studienweg');
function browserStorage() { try { return window.localStorage; } catch { return null; } }
function safeResource(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
function storageWarning(message) {
  if (!message) return '';
  if (/upgraded|previous Northstar/i.test(message)) return 'Deine bisherigen Daten wurden übernommen. Das Original bleibt auf diesem Gerät gespeichert.';
  if (/preserved/i.test(message)) return 'Dein gespeicherter Plan konnte nicht gelesen werden. Das Original wurde gesichert; du kannst es herunterladen.';
  return 'Der Gerätespeicher ist nicht verfügbar. Sichere deine Daten, bevor du die App schließt.';
}
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
    return <main className="main-content recovery-screen"><div className="brand"><Compass size={24}/><span>Northstar</span></div><section className="card stack"><h1>Deinen Plan wieder öffnen</h1><p>Diese Ansicht konnte nicht geöffnet werden. Lade die App neu oder sichere deine gespeicherten Daten.</p><Button onClick={() => location.reload()}>App neu laden</Button>{saved && <Button variant="secondary" onClick={() => downloadOriginal()}>Gespeicherte Daten herunterladen</Button>}</section></main>;
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
  const [storageMessage, setStorageMessage] = useState(storageWarning(boot.warning));
  const [recoveryNotice, setRecoveryNotice] = useState(storageWarning(boot.warning));
  const [canPersist, setCanPersist] = useState(boot.writable);
  const importRef = useRef(null);
  const dailyPlan = getDailyPlan(data, selectedDay, today);
  const taskModal = modal?.type === 'task' ? data.tasks.find(task => task.id === modal.id) : null;
  const activeStudy = data.study?.active;

  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 30000); const resume = () => setClock(new Date()); window.addEventListener('focus', resume); return () => { clearInterval(timer); window.removeEventListener('focus',resume); }; }, []);
  useEffect(() => { const oldToday = previousToday.current; previousToday.current = today; setSelectedDay(current => current === oldToday ? today : current); setData(current => ensureDailyPlan(current,today)); }, [today]);
  useEffect(() => { if (!canPersist) return; const result = saveData(data,browserStorage()); setStorageMessage(result.ok ? recoveryNotice : 'Deine letzten Änderungen konnten nicht gespeichert werden. Lade vor dem Schließen eine Sicherung herunter.'); }, [data,canPersist,recoveryNotice]);
  useEffect(() => { document.documentElement.dataset.theme = data.profile.theme || 'system'; const media = matchMedia('(prefers-color-scheme: dark)'); const update = () => { const dark = data.profile.theme === 'dark' || (data.profile.theme !== 'light' && media.matches); document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark ? '#111317' : '#f8f9fb'); }; update(); media.addEventListener('change',update); return () => media.removeEventListener('change',update); }, [data.profile.theme]);
  useEffect(() => { const handle = () => setTab(activeTab()); window.addEventListener('hashchange',handle); return () => window.removeEventListener('hashchange',handle); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''),4000); return () => clearTimeout(timer); }, [toast]);

  function notify(message) { setToast(message); }
  function update(updater) { setData(current => ensureDailyPlan(typeof updater === 'function' ? updater(current) : updater,selectedDay,today)); }
  function navigate(next) { setTab(next); location.hash = next; window.scrollTo({top:0,behavior:'instant'}); }
  function chooseDay(date) { setSelectedDay(date); setData(current => ensureDailyPlan(current,date,today)); navigate('today'); }
  function completeTask(task) { if (task.date > today) { notify('Künftige Aufgaben sind eine Vorschau. Schließe sie am jeweiligen Tag ab.'); return; } const now = new Date(); update(current => toggleTask(current.study?.active?.taskId === task.id ? finishStudy(current,now) : current,task.id,now)); if (!task.completed) notify('Geschafft. Dein Fortschritt ist gespeichert.'); }
  function finishSetup(next) { setData(ensureDailyPlan(normalizeData(next,today),today)); setSelectedDay(today); setSetupOpen(false); navigate('today'); notify(next.demo ? 'Der Beispielplan ist bereit. Du kannst jederzeit eigene Angaben eintragen.' : 'Dein Lernplan ist bereit. Beginne mit dem ersten Schritt.'); }
  function exportData() {
    try { const blob = new Blob([serializeBackup(data)],{type:'application/json'}); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `northstar-${today}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); notify('Sicherung heruntergeladen.'); } catch { notify('Die Sicherung konnte nicht erstellt werden. Deine gespeicherten Daten bleiben erhalten.'); }
  }
  async function importData(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try { if (file.size > MAX_BACKUP_BYTES) {notify('Wähle eine Sicherung unter 20 MB.');event.target.value = '';return;} const next = parseBackup(await file.text(),today); setModal({type:'import',data:next}); } catch { notify('Diese Sicherung konnte nicht geöffnet werden. Dein aktueller Plan bleibt erhalten.'); }
    event.target.value = '';
  }
  function restoreBackup() { const next = ensureDailyPlan(modal.data,today); const result = saveData(next,browserStorage()); if (!result.ok) { notify(result.error || 'Die Wiederherstellung konnte nicht gespeichert werden. Dein aktueller Plan bleibt erhalten.'); return; } setCanPersist(true); setData(next); setStorageMessage(''); setRecoveryNotice(''); setModal(null); setSetupOpen(false); notify('Sicherung wiederhergestellt.'); }
  function showPlan(view = 'week') { setPlanView(typeof view === 'string' ? view : 'week');navigate('plan'); }
  function skipToday(task) { update(current => skipTask(current.study?.active?.taskId === task.id ? finishStudy(current,new Date()) : current,task.id));setModal(null);notify('Für heute ausgelassen. Dein Lernplan ist angepasst.'); }
  function showLinkedGoal(task) { setPlanPathway(task.roadmapItemId?.startsWith('Germany-') ? 'Germany' : task.roadmapItemId?.startsWith('USA-') ? 'USA' : data.profile.pathways[0] || 'USA');setPlanView('roadmap');setModal(null);navigate('plan'); }
  function showEvents() { setPlanView('events');setModal(null);navigate('plan'); }
  function openProfile(section) { setProfileSection(section);setModal(null);navigate('profile'); }
  function openFocus() { setModal({type:'focus'}); }
  function openFocusTask() { if (activeStudy && data.tasks.some(task => task.id === activeStudy.taskId)) setModal({type:'task',id:activeStudy.taskId}); else { setModal(null);notify('Deine erfasste Lernzeit bleibt auch erhalten, wenn eine Aufgabe entfernt wird.'); } }
  function beginFocus(task,minutes) {
    if (task.date > today) { notify('Starte diese Einheit am vorgesehenen Tag.'); return; }
    if (activeStudy && activeStudy.taskId !== task.id) { setModal({type:'switchFocus',id:task.id,minutes}); return; }
    update(current => startStudy(current,task,new Date(),minutes)); openFocus();
  }
  function endFocus(automatic = false) {
    const timer = getStudyTimer(data,new Date());
    if (!timer.active) return;
    update(current => finishStudy(current,new Date()));
    if (!automatic || modal?.type === 'focus' || modal?.type === 'discardFocus') setModal({type:'focusSaved',id:timer.active.taskId,title:timer.active.taskTitle,seconds:timer.elapsedSeconds});
    else notify('Lernzeit gespeichert. Prüfe dein Ergebnis, bevor du die Aufgabe abschließt.');
  }
  function switchFocus() {
    const task = data.tasks.find(item => item.id === modal.id);
    if (!task) { setModal(null);notify('Wähle eine Aufgabe aus deinem aktuellen Lernplan.');return; }
    const now = new Date();
    update(current => startStudy(finishStudy(current,now),task,now,modal.minutes));openFocus();
  }

  return <div className={`app-shell ${activeStudy ? 'has-active-study' : ''}`}>
    <aside className="desktop-sidebar"><a className="brand" href="#today" onClick={() => navigate('today')}><Compass size={25} strokeWidth={1.6}/><span>Northstar</span></a><p className="sidebar-caption">Dein nächster guter Schritt.</p><nav aria-label="Hauptnavigation">{NAV.map(({id,label,icon:Icon}) => <button key={id} onClick={() => navigate(id)} aria-current={tab === id ? 'page' : undefined} className={`nav-item ${tab === id ? 'active' : ''}`}><Icon size={19}/>{label}</button>)}</nav><div className="sidebar-footer"><span className="sidebar-stage">{data.profile.schoolYear} · Hessen</span><p>Kleine Schritte.<br/>Mehr Möglichkeiten.</p><span className="local-caption">{storageMessage ? 'Sicherung empfohlen' : 'Auf diesem Gerät gespeichert'}</span></div></aside>
    <main className="main-content" id="main-content">
      <header className="mobile-brand"><a className="brand" href="#today" onClick={() => navigate('today')}><Compass size={21} strokeWidth={1.7}/><span>Northstar</span></a><span>{data.profile.schoolYear} · Abitur {data.profile.graduationYear}</span></header>
      {storageMessage && <div className="storage-notice" role="alert"><p>{storageMessage}</p><button onClick={exportData}>Sicherung exportieren</button>{boot.recoveryKey && <button onClick={() => downloadOriginal(boot.recoveryKey)}>Originaldaten herunterladen</button>}</div>}
      {data.demo && !setupOpen && <div className="demo-banner"><span>Beispielplan · eigene Angaben eintragen</span><button onClick={() => setSetupOpen(true)}>Einrichten <ArrowRight size={14}/></button></div>}
      {tab === 'today' && <Today data={data} today={today} date={selectedDay} plan={dailyPlan}
        onOpenTask={task => setModal({type:'task',id:task.id})} onComplete={completeTask}
        onTime={() => setModal({type:'time'})} onAdd={() => setModal({type:'addTask'})}
        onPlan={showPlan} onProgress={() => navigate('progress')} onProfile={openProfile}
        onPurpose={() => setModal({type:'purpose'})} onChooseDay={chooseDay}/>}
      {tab === 'plan' && <Plan data={data} today={today} initialView={planView} initialPathway={planPathway || data.profile.pathways[0]} onChange={update} notify={notify} onSelectDay={chooseDay} onOpenProfile={openProfile} onOpenSchoolImport={(section = 'overview') => setModal({type:'schoolImport',section})}/>}
      {tab === 'progress' && <Progress data={data} today={today} onChange={update} notify={notify} onOpenPlan={showPlan} onOpenProfile={openProfile} onOpenSchoolImport={(section = 'overview') => setModal({type:'schoolImport',section})}/>}
      {tab === 'profile' && <Profile key={profileSection} initialSection={profileSection} data={data} today={today} onChange={update} notify={notify} onRestartSetup={() => setSetupOpen(true)} onExport={exportData} onImport={() => importRef.current?.click()} onOpenSchedule={() => showPlan('schedule')} onOpenProgress={() => navigate('progress')} onOpenSchoolImport={(section = 'overview') => setModal({type:'schoolImport',section})}/>}
    </main>
    <nav className="bottom-nav" aria-label="Hauptnavigation mobil">{NAV.map(({id,label,icon:Icon}) => <button key={id} onClick={() => navigate(id)} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'active' : ''}><Icon size={22} strokeWidth={tab === id ? 2 : 1.6}/><span>{label}</span></button>)}</nav>
    <input type="file" ref={importRef} accept="application/json,.json" aria-label="Northstar-Sicherung importieren" className="visually-hidden" onChange={importData}/>
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {setupOpen && <Onboarding data={data} today={today} onFinish={finishSetup} onClose={() => { if (!data.onboardingCompleted) update(current => ({...current,onboardingCompleted:true})); setSetupOpen(false); }}/>}
    {taskModal && !setupOpen && <TaskDetail key={taskModal.id} task={taskModal} data={data} today={today} onClose={() => setModal(null)} onSave={(notes,review) => update(current => saveTaskReview(saveTaskNotes(current,taskModal.id,notes),taskModal.id,review))} onComplete={() => completeTask(taskModal)} onSkip={() => skipToday(taskModal)} onRemove={() => setModal({type:'removeTask',id:taskModal.id})} onOpenProfile={openProfile} onStartStudy={minutes => beginFocus(taskModal,minutes)} onOpenStudy={openFocus} onGoal={() => showLinkedGoal(taskModal)} onEvents={showEvents} onProgress={() => {setModal(null);navigate('progress');}} onChange={update} onEdit={() => setModal({type:'editTask',id:taskModal.id})} onReschedule={() => setModal({type:'moveTask',id:taskModal.id})} onReplace={() => {try {update(replaceTask(data,taskModal.id));setModal(null);notify('Eine passende Alternative ist eingeplant. Deine bisherigen Notizen bleiben erhalten.');} catch(error) {notify(error.message);}}}/>}
    <StudyDock data={data} onOpen={openFocus} onPause={() => update(current => pauseStudy(current,new Date()))} onResume={() => update(current => resumeStudy(current,new Date()))} onFinish={() => endFocus()} onExpire={() => endFocus(true)}/>
    {modal?.type === 'focus' && activeStudy && <StudyDialog data={data} onClose={() => setModal(null)} onPause={() => update(current => pauseStudy(current,new Date()))} onResume={() => update(current => resumeStudy(current,new Date()))} onFinish={() => endFocus()} onDiscard={() => setModal({type:'discardFocus'})} onTask={openFocusTask}/>}
    {modal?.type === 'focusSaved' && <StudySaved task={data.tasks.find(task => task.id === modal.id)} seconds={modal.seconds} onClose={() => setModal(null)} onTask={() => setModal({type:'task',id:modal.id})} onComplete={() => {const task = data.tasks.find(item => item.id === modal.id);if(task)completeTask(task);setModal(null);}}/>}
    {modal?.type === 'switchFocus' && <Modal title="Eine Lerneinheit zur Zeit" onClose={openFocus}><div className="stack"><p>Speichere zuerst deine aktuelle Lernzeit, bevor du die nächste Einheit startest.</p><div className="sheet-footer"><Button variant="secondary" onClick={openFocus}>Aktuelle Einheit fortsetzen</Button><Button onClick={switchFocus}>Speichern und wechseln</Button></div></div></Modal>}
    {modal?.type === 'discardFocus' && <Modal title="Diese Lerneinheit verwerfen?" onClose={openFocus}><div className="stack"><p>Die Zeit dieser Einheit wird verworfen. Aufgabe und Notizen bleiben erhalten.</p><div className="sheet-footer"><Button variant="secondary" onClick={openFocus}>Einheit behalten</Button><Button variant="danger" onClick={() => {update(discardStudy);setModal(null);notify('Einheit verworfen.');}}>Einheit verwerfen</Button></div></div></Modal>}
    {modal?.type === 'purpose' && <GoalPurpose plan={dailyPlan} onClose={() => setModal(null)} onPlan={() => {setModal(null);showPlan();}}/>}
    {modal?.type === 'time' && <TimeForm data={data} date={selectedDay} plan={dailyPlan} onClose={() => setModal(null)} onSave={minutes => { update(current => saveSchedule(current,{...current.schedule,timeOverrides:[...current.schedule.timeOverrides.filter(item => item.date !== selectedDay),{date:selectedDay,minutes}]})); setModal(null);notify('Lernzeit gespeichert. Deine Prioritäten sind angepasst.'); }}/ >}
    {modal?.type === 'addTask' && <TaskForm data={data} date={selectedDay} today={today} onClose={() => setModal(null)} onSave={task => { update(current => addTask(current,task)); setModal(null);notify('Aufgabe ergänzt. Dein Lernplan berücksichtigt sie jetzt.'); }}/ >}
    {['editTask','moveTask'].includes(modal?.type) && data.tasks.find(task => task.id === modal.id) && <TaskAdjustForm data={data} task={data.tasks.find(task => task.id === modal.id)} mode={modal.type} today={today} onClose={() => setModal(null)} onSave={patch => {
      const next = modal.type === 'moveTask' ? moveTask(data,modal.id,patch.date) : editTask(data,modal.id,patch);
      setData(ensureDailyPlan(next,patch.date || selectedDay,today));setModal(null);notify('Aufgabe angepasst. Dein Entwurf bleibt erhalten.');
    }}/>}
    {modal?.type === 'removeTask' && <Modal title="Diese Aufgabe entfernen?" onClose={() => setModal(null)}><div className="stack"><p>Die Aufgabe wird aus diesem Tag und gegebenenfalls aus deinem Fortschritt entfernt. Erfasste Lernzeit bleibt erhalten. Eine aktive Einheit wird zuerst gespeichert.</p><div className="sheet-footer"><Button variant="secondary" onClick={() => setModal(null)}>Aufgabe behalten</Button><Button variant="danger" onClick={() => {update(current => removeTask(current.study?.active?.taskId === modal.id ? finishStudy(current,new Date()) : current,modal.id));setModal(null);notify('Aufgabe entfernt.');}}>Aufgabe entfernen</Button></div></div></Modal>}
    {modal?.type === 'schoolImport' && <SchoolImport data={data} today={today} onChange={update} notify={notify} initialSection={modal.section} onClose={() => setModal(null)}/>}
    {modal?.type === 'import' && <Modal title="Sicherung wiederherstellen?" onClose={() => setModal(null)}><div className="stack"><p>Die Sicherung ersetzt den aktuellen Plan auf diesem Gerät. Exportiere vorher eine Sicherung, wenn du diesen Stand behalten möchtest.</p><div className="sheet-footer"><Button variant="secondary" onClick={() => setModal(null)}>Abbrechen</Button><Button onClick={restoreBackup}>Wiederherstellen</Button></div></div></Modal>}
  </div>;
}

function GoalPurpose({plan,onClose,onPlan}) {
  const chain = plan.goalChain || {};
  const levels = [['LANGFRISTIG',chain.longTerm],['DIESES JAHR',chain.yearly || chain.year],['DIESES HALBJAHR',chain.semester],['DIESEN MONAT',chain.monthly],['DIESE WOCHE',chain.weekly],['HEUTE',plan.goal]];
  return <Modal title="Von deinem Ziel zu heute" onClose={onClose}><div className="purpose-ladder">{levels.map(([label,value]) => <div className="purpose-step" key={label}><span>{label}</span><h3>{typeof value === 'object' ? value?.title : value || 'Eine gute Grundlage für dein Studium aufbauen'}</h3></div>)}</div><p className="field-help">Dein Lernplan verbindet deine Studienziele mit Prüfungen, Noten, Terminen und deiner verfügbaren Zeit.</p><Button onClick={onPlan}>Zum vollständigen Lernplan <ArrowRight size={16}/></Button></Modal>;
}

function TaskDetail({task,data,today,onClose,onSave,onComplete,onSkip,onRemove,onOpenProfile,onStartStudy,onOpenStudy,onGoal,onEvents,onProgress,onChange,onEdit,onReschedule,onReplace}) {
  const [notes,setNotes] = useState(task.notes || '');
  const review = task.selfReview || [];
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  useEffect(() => {
    if (notes === (task.notes || '')) return;
    const timer = setTimeout(() => saveRef.current(notes,review),500);
    return () => clearTimeout(timer);
  }, [notes,review,task.notes]);
  const save = () => onSave(notes,review);
  function close() { if (notes !== (task.notes || '')) save(); onClose(); }
  const session = getGuidedSession(data,task,today);
  return <Modal title="So lernst du" onClose={close}><div className="task-detail stack">
    <div><p className="page-kicker">{categoryLabel(task.category)} · {task.minutes} MIN{task.priority === 'high' ? ' · PRIORITÄT' : ''}</p><h2 className="task-detail-title">{task.origin === 'custom' ? task.title : session.objective}</h2>{task.skipped && <p className="muted">Für später gespeichert. Deine bisherigen Notizen bleiben erhalten.</p>}</div>
    {!task.skipped && <details className="product-details task-timer"><summary>Fokustimer</summary><StudyLauncher task={task} today={today} active={data.study?.active} onStart={minutes => {save();onStartStudy(minutes);}} onOpen={() => {save();onOpenStudy();}}/></details>}
    <GuidedLearning data={data} task={task} today={today} onChange={onChange} draft={notes} onDraftChange={setNotes} showObjective={false}/>
    {safeResource(task.resource) && <a className="text-button" href={safeResource(task.resource)} target="_blank" rel="noopener noreferrer">Gespeichertes Material öffnen <ArrowRight size={14}/></a>}
    <details className="task-purpose product-details"><summary>Dein langfristiges Ziel</summary><section className="stack compact" aria-label="Verknüpftes Ziel"><p className="muted small">{goalLabel(task)}</p><button className="text-button" onClick={() => {save();onGoal();}}>Zum Studienweg <ArrowRight size={14}/></button>{task.eventId && <button className="text-button" onClick={() => {save();onEvents();}}>Verknüpften Termin ansehen <CalendarDays size={14}/></button>}</section></details>
    {task.sessions?.length > 0 && <p className="field-help">Vorgesehene Lernzeit · {task.sessions.map(session => `${session.start}–${session.end}`).join(' · ')}</p>}
    {(task.category === 'activity' || task.category === 'university' || task.roadmapStepId) && <Button variant="secondary" onClick={() => {save();onOpenProfile(task.category === 'activity' ? 'Activities' : task.goalId === 'grades' ? 'Fachs' : ['language','tests'].includes(task.goalId) ? 'Goals' : 'Universities');}}>Passenden Profileintrag öffnen <ArrowRight size={16}/></Button>}
    {task.category === 'review' && <Button variant="secondary" onClick={() => {save();onProgress();}}>Wochenrückblick öffnen <ArrowRight size={16}/></Button>}
    <div className="sheet-footer"><Button variant="secondary" onClick={() => {save();onClose();}}>Notiz speichern</Button><Button disabled={task.date > today} onClick={() => {save();onComplete();onClose();}}><Check size={17}/>{task.completed ? 'Als offen markieren' : 'Aufgabe abschließen'}</Button></div>
    <details className="product-details"><summary>Aufgabe anpassen</summary><div className="task-actions">{!task.completed && <><Button variant="secondary" onClick={() => {save();onEdit();}}>Bearbeiten</Button><Button variant="secondary" onClick={() => {save();onReschedule();}}>Verschieben</Button>{task.date === today && !task.skipped && <Button variant="ghost" onClick={() => {save();onSkip();}}>Heute auslassen</Button>}{task.origin === 'generated' && <Button variant="ghost" onClick={() => {save();onReplace();}}>Andere Aufgabe wählen</Button>}</>}<button className="text-button" onClick={() => {save();onRemove();}}>Aus dem Plan entfernen</button></div></details>
  </div></Modal>;
}

function TimeForm({data,date,plan,onClose,onSave}) {
  const override = data.schedule.timeOverrides.find(item => item.date === date);
  const weekly = data.schedule.weekly.find(item => item.day === new Date(`${date}T12:00:00`).getDay());
  const [minutes,setMinutes] = useState(override?.minutes ?? weekly?.minutes ?? plan.availableMinutes);
  return <Modal title="Lernzeit für heute" onClose={onClose}><form className="stack" onSubmit={event => { event.preventDefault();onSave(Number(minutes)); }}><p>Wie viel Lernzeit ist realistisch für {formatDate(date,{weekday:'long',day:'numeric',month:'long'})}? Auch ein leichter Tag gehört zu einem guten Plan.</p><Field label="Lernzeit (Minuten)" help="Unterricht, Training und andere feste Termine begrenzen deine Lernfenster. Deinen Wochenrhythmus bearbeitest du im Lernplan."><input type="number" min="0" max="720" step="5" value={minutes} required onChange={event => setMinutes(event.target.value)}/></Field><div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Tag neu planen</Button></div></form></Modal>;
}

function TaskForm({data,date,today,onClose,onSave}) {
  const [form,setForm] = useState({title:'',date,minutes:15,category:'academics',subjectId:data.subjects.find(item => item.enabled)?.id || '',priority:'high'});
  const [error,setError] = useState('');
  const set = key => event => setForm(current => ({...current,[key]:event.target.value}));
  function submit(event) {
    event.preventDefault();
    if(form.date < today) {setError('Wähle heute oder einen zukünftigen Tag. Vergangene Tage bleiben im Verlauf erhalten.');return;}
    const committedTasks = data.tasks.filter(task => task.date === form.date && !task.skipped && (task.completed || task.origin === 'custom' || task.notes?.trim() || task.selfReview?.length || task.id === data.study?.active?.taskId));
    if (committedTasks.length >= 5) {setError('An diesem Tag sind schon fünf feste Aufgaben. Wähle einen anderen Tag.');return;}
    const capacity = getDailyPlan(data,form.date,today).availableMinutes;
    const committed = committedTasks.reduce((total,task) => total + task.minutes,0);
    if(Number(form.minutes)>Math.max(0,capacity-committed)) {setError('Diese Aufgabe passt nicht mehr in die freie Lernzeit. Wähle eine kürzere Dauer oder einen anderen Tag.');return;}
    onSave({...form,minutes:Number(form.minutes),reason:'Eine von dir gewählte Priorität.',steps:['Lege ein konkretes Ergebnis fest.','Bearbeite einen klar begrenzten Teil.','Halte dein Ergebnis und den nächsten Schritt fest.']});
  }
  return <Modal title="Eigene Priorität ergänzen" onClose={onClose}><form className="stack" onSubmit={submit}><Field label="Aufgabe"><input value={form.title} onChange={set('title')} required maxLength={180} placeholder="Ein konkreter nächster Schritt"/></Field><div className="form-grid"><Field label="Datum"><input type="date" min={today} value={form.date} onChange={set('date')} required/></Field><Field label="Dauer (Minuten)"><input type="number" min="5" max="180" value={form.minutes} onChange={set('minutes')} required/></Field></div><Field label="Bereich"><select value={form.category} onChange={set('category')}><option value="academics">Schule</option><option value="language">Sprache</option><option value="university">Studium</option><option value="activity">Bewerbungsprofil</option></select></Field>{form.category === 'academics' && <Field label="Fach"><select value={form.subjectId} onChange={set('subjectId')}>{data.subjects.filter(item=>item.enabled).map(subject=><option value={subject.id} key={subject.id}>{subjectLabel(subject)}</option>)}</select></Field>}{error && <p className="form-error" role="alert">{error}</p>}<div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Zum Plan hinzufügen</Button></div></form></Modal>;
}

function TaskAdjustForm({data,task,mode,today,onSave,onClose}) {
  const moving = mode === 'moveTask';
  const [form,setForm] = useState({title:task.title,objective:task.objective,expectedResult:task.expectedResult || '',date:moving ? shiftDate(today,1) : task.date,minutes:task.minutes,priority:task.priority});
  const [error,setError] = useState('');
  const set = key => event => setForm(value => ({...value,[key]:event.target.value}));
  function submit(event) {
    event.preventDefault();setError('');
    if(form.date < today) return setError('Wähle heute oder einen zukünftigen Tag.');
    if(data.study?.active?.taskId === task.id) return setError('Beende zuerst die aktive Lerneinheit.');
    const available = getDailyPlan(data,form.date,today).availableMinutes;
    const committed = data.tasks.filter(item => item.id !== task.id && item.date === form.date && !item.skipped && (item.completed || item.origin === 'custom' || item.notes?.trim() || item.selfReview?.length));
    if(committed.length >= 5 || Number(form.minutes) > Math.max(0,available-committed.reduce((sum,item) => sum+item.minutes,0))) return setError('Diese Aufgabe passt nicht in die verbleibende Lernzeit. Wähle einen anderen Tag oder eine kürzere Dauer.');
    try { onSave({...form,minutes:Number(form.minutes),objective:moving ? task.objective : form.title}); } catch(error) { setError(error.message || 'Die Aufgabe konnte nicht angepasst werden.'); }
  }
  return <Modal title={moving ? 'Aufgabe verschieben' : 'Aufgabe bearbeiten'} onClose={onClose}><form className="stack" onSubmit={submit}>
    {moving ? <><p>Dein Entwurf und das verknüpfte Ziel bleiben erhalten.</p><Field label="Neuer Tag"><input type="date" min={today} required value={form.date} onChange={set('date')}/></Field></> : <><Field label="Aufgabe"><input required value={form.title} onChange={set('title')} maxLength={180}/></Field><Field label="Dauer (Minuten)"><input type="number" min="5" max="180" required value={form.minutes} onChange={set('minutes')}/></Field><Field label="Erwartetes Ergebnis"><textarea maxLength={700} value={form.expectedResult} onChange={set('expectedResult')} rows={2}/></Field><Field label="Priorität"><select value={form.priority} onChange={set('priority')}><option value="high">Hoch</option><option value="medium">Normal</option><option value="low">Niedrig</option></select></Field></>}
    {error && <p className="form-error" role="alert">{error}</p>}<div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">{moving ? 'Verschieben' : 'Änderungen speichern'}</Button></div>
  </form></Modal>;
}

createRoot(document.getElementById('root')).render(<AppRecovery><App/></AppRecovery>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load',()=>{ navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(()=>{}); });
}

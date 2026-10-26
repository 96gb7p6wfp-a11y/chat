import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalProfile, ensureDailyPlan, normalizeData, saveExam, saveSchedule } from './coach.js';
import { normalizeLearning, saveLearningAttempt, removeLearningAttempt } from './guided-learning.js';
import { parseBackup, serializeBackup, loadData, saveData, STORAGE_KEY } from './storage.js';
const TODAY='2026-10-25';
const STAMP='2026-10-25T08:00:00.000Z';
function base() { return createPersonalProfile({today:TODAY}); }
function session(taskId) { return {id:taskId,taskId,unitId:'en-civil-rights',stage:'practice',questionIndex:1,answers:{'brown-decision':'  My own answer\nwith an unfinished sentence.  '},reviewAnswers:{},revealed:['brown-decision'],checks:{'brown-decision':'hard'},mistakes:{'brown-decision':'I confused the ruling with later legislation.'},startedAt:STAMP,completedAt:null,updatedAt:STAMP}; }
function memory() { const entries=new Map();return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)}; }

test('old notes, confirmed grades and learning evidence survive the additive tutor migration',()=>{
 const data=base();
 delete data.learning.sessions;
 data.grades=[{id:'real',subjectId:'mathematics',points:8.5,type:'written',date:'2026-10-20',semester:'Q1',weight:2,note:'Eigener bereits erfasster Stand'}];
 const normalized=normalizeData(data,TODAY);
 assert.deepEqual(normalized.grades,data.grades);
 assert.deepEqual(normalized.learning.sessions,[]);
 assert.equal(normalized.subjects.find(s=>s.id==='mathematics').forecast.future.length,0,'missing scenarios stay unconfigured');
});

test('per-question answers, self-checks and conditional forecast assumptions survive backup and local reload',()=>{
 const data=ensureDailyPlan(base(),TODAY);
 const task=data.tasks[0]; task.notes='Mein alter Entwurf bleibt separat.';
 data.learning.sessions=[session(task.id)];
 const math=data.subjects.find(s=>s.id==='mathematics');
 math.forecast={semester:'Q1',mode:'next',future:[{id:'next',type:'written',weight:5,points:null},{id:'oral',type:'oral',weight:1,points:0}],comparisonScore:12};
 const restored=parseBackup(serializeBackup(data),TODAY);
 assert.deepEqual(restored.learning.sessions,data.learning.sessions);
 assert.deepEqual(restored.subjects.find(s=>s.id==='mathematics').forecast,math.forecast);
 assert.equal(restored.tasks.find(t=>t.id===task.id).notes,task.notes);
 const storage=memory();assert.equal(saveData(restored,storage).ok,true);
 const loaded=loadData(storage,TODAY);assert.equal(loaded.warning,'');
 assert.deepEqual(loaded.data.learning.sessions,data.learning.sessions);
});

test('saving or removing a review keeps every in-progress question response intact',()=>{
 const data=base(); data.learning.sessions=[session('actual-task')];
 const saved=saveLearningAttempt(data,{id:'reflection',taskId:'actual-task',subjectId:'english',topic:'en-civil-rights',questionId:'brown-decision',answer:'My answer',date:TODAY,rating:'hard',mistake:'Name the legal principle.'});
 assert.deepEqual(saved.learning.sessions,data.learning.sessions);
 const removed=removeLearningAttempt(saved,'reflection');
 assert.equal(removed.learning.attempts.length,0);
 assert.deepEqual(removed.learning.sessions,data.learning.sessions);
});

test('answer autosaves and hypothetical future grades do not recalculate a real daily plan',()=>{
 const planned=ensureDailyPlan(base(),TODAY);
 const data={...planned,learning:{...planned.learning,sessions:[session(planned.tasks[0].id)]},subjects:planned.subjects.map(subject=>subject.id==='mathematics'?{...subject,forecast:{semester:'Q1',mode:'next',future:[{id:'hypothesis',type:'written',weight:5,points:null}],comparisonScore:15}}:subject)};
 const next=ensureDailyPlan(data,TODAY);
 assert.strictEqual(next.tasks,planned.tasks);
});

test('a timetable or exam replan cannot discard started tutor work, even when temporarily parked',()=>{
 let data=ensureDailyPlan(base(),TODAY);
 const task=data.tasks.find(item=>item.origin==='generated');
 data={...data,learning:{...data.learning,sessions:[session(task.id)]}};
 data=saveExam(data,{id:'urgent',subjectId:'physics',title:'Neue bekannte Klausur',date:'2026-10-26',topics:['RC-Entladung'],format:'written',target:null,importance:'high'});
 data=ensureDailyPlan(data,TODAY);
 assert.ok(data.tasks.some(item=>item.id===task.id),'started exercise survives new priorities');
 data=ensureDailyPlan(saveSchedule(data,{...data.schedule,timeOverrides:[{date:TODAY,minutes:0}]}),TODAY);
 assert.ok(data.tasks.some(item=>item.id===task.id&&item.skipped),'work is parked when the day becomes unavailable');
 assert.equal(data.learning.sessions[0].answers['brown-decision'],session(task.id).answers['brown-decision']);
 data=ensureDailyPlan(saveSchedule(data,{...data.schedule,timeOverrides:[{date:TODAY,minutes:120}]}),TODAY);
 assert.equal(data.tasks.filter(item=>item.id===task.id).length,1);
 assert.ok(data.tasks.some(item=>item.id===task.id&&!item.skipped));
});

test('malformed tutor state is rejected before it can replace a saved profile',()=>{
 const data=base(); data.learning.sessions=[{...session('task'),checks:{question:'official-grade-13'}}];
 assert.throws(()=>parseBackup(JSON.stringify(data),TODAY),/supported value/);
 const valid=base();const storage=memory();assert.equal(saveData(valid,storage).ok,true);
 const raw=storage.getItem(STORAGE_KEY);
 assert.throws(()=>serializeBackup(data),/supported value/);
 assert.equal(storage.getItem(STORAGE_KEY),raw);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData, getDailyPlan, getRoadmap, saveProfile, saveSubject, saveUniversity } from './coach.js';
import { getRoadmapPriorities } from './roadmap.js';

const TODAY = '2026-10-09';
const personal = () => createInitialData({ today: TODAY, demo: false });

test('US applications overlap Q3 and precede Abitur; German applications use the graduation summer', () => {
  const state = personal();
  const usa = getRoadmap(state, 'USA', TODAY);
  const germany = getRoadmap(state, 'Germany', TODAY);
  const phase = (roadmap, label) => roadmap.find(item => item.label === label);
  assert.equal(phase(usa, 'Applications').start, '2027-08-01');
  assert.ok(phase(usa, 'Applications').start < phase(usa, 'Abitur').start);
  assert.ok(phase(usa, 'Admission').start < phase(usa, 'Abitur').end);
  assert.equal(phase(germany, 'Applications').start, '2028-05-01');
  assert.equal(phase(germany, 'Admission').start, '2028-08-01');
  for (const roadmap of [usa, germany]) {
    assert.equal(roadmap[0].label, 'Today');
    assert.ok(roadmap.some(item => item.label === 'Abitur preparation'));
    assert.ok(roadmap.some(item => item.label === 'University preparation'));
    assert.ok(roadmap.some(item => item.label === 'Admission'));
    for (let i = 2; i < roadmap.length; i++) assert.ok(roadmap[i - 1].start <= roadmap[i].start);
  }
});

test('selected pathways control priorities while both roadmaps remain inspectable', () => {
  const state = saveProfile(personal(), { pathways: ['Germany'] });
  const priorities = getRoadmapPriorities(state, TODAY);
  assert.ok(priorities.length > 0);
  assert.ok(priorities.every(item => item.pathway === 'Germany'));
  assert.ok(getRoadmap(state, 'USA', TODAY).length > 0);
  assert.ok(priorities.every(item => item.planningStart <= TODAY && item.nextStep && !item.completed));
  assert.ok(priorities.every(item => !['Admission', 'University', 'Applications'].includes(item.phaseLabel)));
});

test('a saved official application date replaces a preparation target without inventing dates', () => {
  const base = personal();
  const before = getRoadmap(base, 'USA', '2027-10-20').flatMap(phase => phase.items).find(item => item.id === 'USA-applications-submit');
  assert.equal(before.dateVerified, false);
  const saved = saveUniversity(base, { id: 'ucla', deadline: '2027-11-30' });
  const after = getRoadmap(saved, 'USA', '2027-10-20').flatMap(phase => phase.items).find(item => item.id === before.id);
  assert.equal(after.dueDate, '2027-11-30');
  assert.equal(after.dateVerified, true);
  assert.equal(after.confirmed, false);
  assert.equal(after.nextStep.id, before.nextStep.id);
});

test('school year influences preparation choices without changing the calendar or assuming admission', () => {
  const state = saveProfile(personal(), { schoolYear: 'Q2', pathways: ['USA'] });
  const roadmap = getRoadmap(state, 'USA', TODAY);
  assert.equal(roadmap.find(phase => phase.label === 'Q1').status, 'current');
  assert.equal(roadmap.find(phase => phase.label === 'Q2').status, 'upcoming');
  assert.ok(getRoadmapPriorities(state, TODAY).some(item => item.phaseLabel === 'Q2'));
  assert.ok(getRoadmapPriorities(state, TODAY).every(item => item.phaseLabel !== 'Admission'));
  assert.ok(roadmap.flatMap(phase => phase.items).every(item => !item.completed));
});

test('completed actions require their full estimated work and never confirm an admission milestone', () => {
  let state = personal();
  const item = getRoadmap(state, 'USA', '2028-04-01').find(phase => phase.label === 'Admission').items[0];
  state.tasks = [{ id: 'partial', title: item.nextStep.title, date: '2028-04-01', completed: true, completedAt: '2028-04-01T12:00:00Z', minutes: 5, roadmapItemId: item.id, roadmapStepId: item.nextStep.id }];
  let after = getRoadmap(state, 'USA', '2028-04-01').find(phase => phase.label === 'Admission').items[0];
  assert.equal(after.completedSteps, 0);
  assert.equal(after.steps[0].remainingMinutes, 10);
  assert.ok(after.actionProgress > 0);
  state.tasks.push({ ...state.tasks[0], id: 'finish', minutes: 10 });
  after = getRoadmap(state, 'USA', '2028-04-02').find(phase => phase.label === 'Admission').items[0];
  assert.equal(after.completedSteps, 1);
  assert.notEqual(after.nextStep.id, item.nextStep.id);
  assert.equal(after.completed, false);
  assert.equal(after.confirmed, false);
});

test('real profile setup fulfils exactly the recorded setup actions without claiming an achieved grade or admission', () => {
  let state = saveProfile(personal(), { englishLevel: 'B2', germanLevel: 'Native / fluent' });
  for (const subject of state.subjects.filter(item => item.enabled)) state = saveSubject(state, { id: subject.id, written: 7, oral: 10, target: 11, weakTopics: ['Teacher feedback topic'] });
  const milestones = getRoadmap(state, 'USA', TODAY).flatMap(phase => phase.items);
  const baseline = milestones.find(item => item.id === 'USA-now-baseline');
  assert.equal(baseline.completedSteps, baseline.totalSteps);
  assert.ok(baseline.steps.every(action => action.completedFromData));
  assert.equal(baseline.confirmed, false);
  const english = milestones.find(item => item.id === 'USA-q1-english');
  assert.equal(english.steps[0].completedFromData, true);
  assert.equal(english.steps[1].completed, false, 'Knowing a language level is not evidence that teacher feedback was received');
  assert.equal(state.subjects.find(subject => subject.id === 'mathematics').written, 7);
  assert.ok(getDailyPlan(state, TODAY).tasks.every(task => task.roadmapStepId !== 'USA-now-baseline-grades' && task.roadmapStepId !== 'USA-q1-english-baseline'));
  assert.ok(milestones.filter(item => item.phaseId.includes('admission')).every(item => !item.completed && item.completedSteps === 0));
});

test('partial edits to an earlier application cycle never reverse a displayed phase interval', () => {
  const state = saveProfile(personal(), { applicationYear: '2020', universityStartYear: '2021' });
  for (const path of ['USA', 'Germany']) for (const phase of getRoadmap(state, path, TODAY)) assert.ok(phase.start <= phase.end);
});

test('without a saved activity the next action asks for a real choice rather than inventing an activity name', () => {
  const activities = getRoadmap(personal(), 'USA', TODAY).flatMap(phase => phase.items).find(item => item.id === 'USA-q1-activities');
  assert.equal(activities.nextStep.title, 'Choose one activity and record your responsibilities');
});

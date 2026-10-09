import test from 'node:test';
import assert from 'node:assert/strict';
import { getExercise } from './exercises.js';
import { ENGLISH_WORDS, GERMAN_WORDS, BASIC_ENGLISH_WORDS, BASIC_GERMAN_WORDS } from './practice-bank.js';

const data = { profile: { englishLevel: 'B2', germanLevel: 'C1' }, subjects: [{id:'english',name:'English'},{id:'mathematics',name:'Mathematics'}], tasks: [] };
test('roadmap setup and event preparation preserve their exact actions instead of producing subject exercises', () => {
  for (const task of [
    { title:'Record written and oral points for Mathematics and English',category:'academics',roadmapStepId:'USA-now-baseline-grades',steps:['Open Subjects and record actual grades.'] },
    { title:'IELTS: check the registration and official format',category:'language',eventStage:'scope',steps:['Check the official test format and booking requirements.'] },
  ]) {
    const action = getExercise(task,data);
    assert.equal(action.prompt,task.title);
    assert.deepEqual(action.checklist,task.steps);
    assert.equal(action.passage,undefined);
    assert.equal(action.words,undefined);
    assert.equal(action.answer,undefined);
  }
});
test('vocabulary exercises match the planned load and give beginners accessible words', () => {
  for (const [level,count] of [['A2',4],['B2',8],['C1',12]]) {
    const exercise = getExercise({ title:`English: use ${count} words`, subjectId:'english', steps:[] }, {...data,profile:{...data.profile,englishLevel:level}});
    assert.equal(exercise.words.length,count);
    if (level === 'A2') assert.equal(exercise.words[0].word,'goal');
  }
});
test('summary, analysis and comment tasks produce different writing instructions', () => {
  const responses = ['summary','analysis','comment'].map(kind => getExercise({title:`English ${kind}`,subjectId:'english'},data));
  assert.equal(new Set(responses.map(item=>item.prompt)).size,3);
  assert.ok(responses.every(item=>item.passage && item.checklist.length===3));
  const beginner = getExercise({title:'English analysis',subjectId:'english'}, {...data,profile:{englishLevel:'A2'}});
  assert.ok(beginner.passage.length < responses[0].passage.length);
});
test('revision purpose takes precedence over a generic subject exercise and reuses earlier notes', () => {
  const previous = {id:'old',subjectId:'mathematics',examId:'exam',date:'2026-10-07',notes:'Forgot the chain rule.',title:'Derivatives'};
  const review = getExercise({id:'new',title:'Mathematics derivatives',subjectId:'mathematics',examId:'exam',revisionStage:'mistakes',minutes:20,steps:[]},{...data,tasks:[previous]});
  assert.match(review.prompt,/errors/);
  assert.equal(review.recentNotes[0].notes,previous.notes);
  const timed = getExercise({title:'Mathematics timed section',subjectId:'mathematics',revisionStage:'timed',minutes:10},data);
  assert.match(timed.prompt,/10 minutes/);
  assert.match(timed.prompt,/complete timed rehearsal needs the full/);
});
test('certificate tasks use their official test format and math practice includes a checkable solution', () => {
  const ielts = getExercise({title:'IELTS: practise one weak section'},data);
  assert.match(ielts.prompt,/official materials/);
  assert.equal(ielts.passage,undefined);
  const mathematics = getExercise({title:'Review derivatives',subjectId:'mathematics'},data);
  assert.match(mathematics.answer,/local maximum/);
});
test('language policy research and activities keep their actual action instead of becoming English practice', () => {
  const research = { title:'Verify accepted English-test policies', category:'university', reason:'IELTS is still under consideration.', steps:['Check the accepted certificates for one target programme.', 'Update the test plan.'] };
  const policy = getExercise(research,data);
  assert.deepEqual(policy.checklist,research.steps);
  assert.equal(policy.prompt,research.reason);
  assert.equal(policy.passage,undefined);
  const activity = getExercise({title:'English tutoring: record one contribution',category:'activity',steps:['Record one student outcome.']},data);
  assert.deepEqual(activity.checklist,['Record one student outcome.']);
  assert.equal(activity.passage,undefined);
  const sat = getExercise({title:'SAT: practise one weak section',category:'university',steps:['Complete a short official practice task.']},data);
  assert.match(sat.checklist[0],/official practice/);
});
test('TOEFL preparation follows official format instead of a generic writing exercise', () => {
  const toefl = getExercise({title:'TOEFL: practise one weak section',category:'language'},data);
  assert.match(toefl.label,/official-format/);
  assert.match(toefl.prompt,/official materials/);
  assert.equal(toefl.passage,undefined);
});

test('daily writing material rotates on successive dates and stays identical on reload', () => {
  const task = {id:'daily-analysis',title:'English analysis',subjectId:'english',date:'2026-10-08',steps:[]};
  const first = getExercise(task,data);
  assert.deepEqual(getExercise({...task},JSON.parse(JSON.stringify(data))),first);
  const next = getExercise({...task,id:'tomorrow-analysis',date:'2026-10-09'},data);
  assert.notEqual(first.materialId,next.materialId);
  assert.notEqual(first.passage,next.passage);
  assert.notEqual(first.prompt,next.prompt);
  assert.match(first.guidance,/original practice material/);
});

test('saved topic context selects American Dream, Civil Rights and history material', () => {
  const task = {title:'English analysis',subjectId:'english',date:'2026-10-08',steps:[]};
  const dream = getExercise({...task,steps:['Practise the course context: American Dream.']},data);
  const dreamNext = getExercise({...task,date:'2026-10-09',reason:'Prepare the American Dream topic.'},data);
  assert.match(dream.materialId,/^dream-/);
  assert.match(dream.passage,/American Dream/);
  assert.notEqual(dream.materialId,dreamNext.materialId);
  const rights = getExercise({...task,reason:'Prepare Civil Rights.'},data);
  const rightsNext = getExercise({...task,date:'2026-10-09',reason:'Prepare Civil Rights.'},data);
  assert.match(rights.materialId,/^rights-/);
  assert.match(rights.passage,/civil.rights/);
  assert.notEqual(rights.materialId,rightsNext.materialId);
  const history = getExercise({...task,title:'English: analyse US history sources'},data);
  assert.match(history.materialId,/^rights-|^history-/);
  // Revising a later exam's topics cannot rewrite an already stored task.
  assert.deepEqual(getExercise({...task,reason:'Prepare Civil Rights.'},{...data,exams:[{id:'exam',topics:['Technology']}]}),rights);
});

test('summary wording and analytical wording do not misclassify writing as vocabulary', () => {
  const summary = getExercise({title:'English: write a summary paragraph',subjectId:'english',date:'2026-10-08',steps:['Summarise in your own words.'],revisionStage:'summary'},data);
  const analysis = getExercise({title:'English: build an analysis paragraph',subjectId:'english',reason:'Explain the effect of the wording.',steps:['Choose words carefully.'],revisionStage:'analysis'},data);
  assert.ok(summary.passage);
  assert.equal(summary.words,undefined);
  assert.match(summary.prompt,/summary/);
  assert.ok(analysis.passage);
  assert.equal(analysis.words,undefined);
  assert.match(analysis.prompt,/analytical paragraph/);
});

test('word banks provide varied original examples and level-aware daily retrieval', () => {
  for (const bank of [ENGLISH_WORDS,GERMAN_WORDS]) {
    assert.ok(bank.length >= 40);
    assert.equal(new Set(bank.map(item=>item[0])).size,bank.length);
    assert.ok(bank.every(item=>item[0] && item[1]));
  }
  for (const [language,subjectId,bank] of [['English','english',BASIC_ENGLISH_WORDS],['German','german',BASIC_GERMAN_WORDS]]) {
    const beginnerData = {...data,profile:{englishLevel:'A2',germanLevel:'A2'},subjects:[...data.subjects,{id:'german',name:'German'}]};
    const task = {title:`${language}: use 4 words`,subjectId,date:'2026-10-08'};
    const first = getExercise(task,beginnerData);
    const next = getExercise({...task,date:'2026-10-09'},beginnerData);
    assert.equal(first.words.length,4);
    assert.ok(first.words.every(item=>bank.some(entry=>entry[0] === item.word)));
    assert.notDeepEqual(first.words.map(item=>item.word),next.words.map(item=>item.word));
    assert.deepEqual(first,getExercise(task,beginnerData));
  }
});

test('writing self-review has specific stable criteria and genre-appropriate examples', () => {
  const tasks = ['summary','analysis','comment'].map(kind=>({title:`English ${kind}`,subjectId:'english',date:'2026-10-08'}));
  const exercises = tasks.map(task=>getExercise(task,data));
  exercises.forEach((exercise,index)=>{
    assert.ok(exercise.reviewCriteria.length >= 3 && exercise.reviewCriteria.length <= 4);
    assert.equal(new Set(exercise.reviewCriteria.map(item=>item.id)).size,exercise.reviewCriteria.length);
    assert.ok(exercise.reviewCriteria.every(item=>item.label && item.hint));
    assert.ok(exercise.sampleAnswer.length > 100);
    assert.deepEqual(exercise.reviewCriteria,getExercise({...tasks[index],date:'2026-10-09'},data).reviewCriteria);
  });
  assert.match(exercises[0].sampleAnswer,/^The passage describes/);
  assert.match(exercises[1].sampleAnswer,/writer/);
  assert.match(exercises[2].sampleAnswer,/Admittedly/);
  assert.ok(exercises[0].reviewCriteria.some(item=>item.id === 'summary-ownwords'));
  assert.ok(exercises[1].reviewCriteria.some(item=>item.id === 'analysis-evidence'));
  assert.ok(exercises[2].reviewCriteria.some(item=>item.id === 'comment-counterargument'));
});

test('German original contexts rotate and use genre-specific German instructions', () => {
  const germanData = {...data,subjects:[...data.subjects,{id:'german',name:'German'}]};
  const task = {title:'German writing practice',subjectId:'german',date:'2026-10-08'};
  const first = getExercise(task,germanData);
  assert.ok(first.passage);
  assert.match(first.prompt,/Schreibe einen argumentativen Absatz/);
  assert.notEqual(first.materialId,getExercise({...task,date:'2026-10-09'},germanData).materialId);
  assert.deepEqual(first,getExercise(task,germanData));
  const summary = getExercise({...task,title:'Deutsch Zusammenfassung'},germanData);
  const analysis = getExercise({...task,title:'Deutsch Analyse'},germanData);
  assert.match(summary.prompt,/Inhaltsangabe/);
  assert.match(analysis.prompt,/Analyseabsatz/);
  assert.ok(analysis.reviewCriteria.some(item=>item.id === 'de-analysis-evidence'));
  assert.match(first.sampleAnswer,/./);
  const beginner = getExercise({...task,title:'Deutsch Zusammenfassung'},{...germanData,profile:{germanLevel:'A2'}});
  assert.ok(beginner.passage.length < summary.passage.length);
  assert.match(beginner.prompt,/drei Sätze/);
  assert.ok(beginner.reviewCriteria.some(item=>item.id === 'de-basic-neutral'));
});

test('official certificates and real application actions do not receive invented model answers', () => {
  for (const title of ['IELTS: practise one weak section','TOEFL: practise one weak section','Cambridge English: practise one weak section']) {
    const exercise = getExercise({title,date:'2026-10-08',category:'language'},data);
    assert.match(exercise.prompt,/official materials/);
    assert.equal(exercise.passage,undefined);
    assert.equal(exercise.sampleAnswer,undefined);
  }
  for (const category of ['university','activity']) {
    const exercise = getExercise({title:'English analysis for my application',category,date:'2026-10-08'},data);
    assert.equal(exercise.passage,undefined);
    assert.equal(exercise.sampleAnswer,undefined);
    assert.equal(exercise.words,undefined);
  }
});

test('German exam revision gives German instructions without replacing real exam material', () => {
  const germanData = {...data,subjects:[...data.subjects,{id:'german',name:'German'}]};
  const timed = getExercise({title:'German timed exam',subjectId:'german',revisionStage:'timed',minutes:15},germanData);
  assert.match(timed.prompt,/15 Minuten/);
  assert.match(timed.prompt,/Unterricht/);
  assert.equal(timed.passage,undefined);
  const mistakes = getExercise({title:'Deutsch Fehler überprüfen',subjectId:'german',revisionStage:'mistakes'},germanData);
  assert.match(mistakes.prompt,/zwei Fehler/);
  assert.ok(mistakes.checklist.every(item=>!item.startsWith('Use ')));
});

test('all original English summary and comment examples satisfy their own practice word ranges', () => {
  const materials = new Set();
  for (const kind of ['summary','comment']) {
    for (const reason of ['', 'American Dream', 'Civil Rights', 'US history']) {
      for (const date of ['2026-10-08','2026-10-09','2026-10-10']) {
        const exercise = getExercise({title:`English ${kind}`,subjectId:'english',date,reason},data);
        materials.add(exercise.materialId);
        const words = exercise.sampleAnswer.trim().split(/\s+/).length;
        const [minimum,maximum] = kind === 'summary' ? [90,110] : [140,160];
        assert.ok(words >= minimum && words <= maximum,`${kind} ${exercise.materialId}: ${words} words`);
      }
    }
  }
  assert.equal(materials.size,8);
});

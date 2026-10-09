/** Calendar-aware university milestones. Planned dates are preparation targets,
 * never invented university deadlines or evidence of an admission decision. */
const dayMs = 86_400_000;
const key = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
const calendar = value => new Date(`${value}T12:00:00Z`);
const shift = (value, days) => key(new Date(calendar(value).getTime() + days * dayMs));
const difference = (a, b) => Math.round((calendar(b) - calendar(a)) / dayMs);
const yearNumber = (value, fallback) => /^\d{4}$/.test(String(value)) && Number(value) >= 2020 && Number(value) <= 2198 ? Number(value) : fallback;
const step = (id, title, minutes, ...instructions) => ({ id, title, minutes, instructions });
const entry = (key, title, description, category, steps) => ({ key, title, description, category, steps });

function programme(state, pathway) {
  return state.universities.find(university => university.country === pathway && university.status !== 'applied') || state.universities.find(university => university.country === pathway);
}

function observedSetup(state, phaseKey, itemKey, actionKey) {
  const core = state.subjects.filter(subject => subject.enabled && /mathemat|physic|physik|english|englisch|german|deutsch/i.test(subject.name));
  const known = value => typeof value === 'number' && Number.isFinite(value);
  const languageKnown = value => Boolean(value && !/not sure|unknown|unsure/i.test(value));
  if (phaseKey === 'now' && itemKey === 'baseline') {
    if (actionKey === 'grades') return core.length > 0 && core.every(subject => known(subject.written) && known(subject.oral));
    if (actionKey === 'targets') return core.length > 0 && core.every(subject => known(subject.target) && subject.weakTopics.length > 0);
  }
  if (phaseKey === 'q1' && itemKey === 'english' && actionKey === 'baseline') return languageKnown(state.profile.englishLevel) && state.subjects.some(subject => /english|englisch/i.test(subject.name) && subject.weakTopics.length);
  if (phaseKey === 'q1' && ['language', 'german'].includes(itemKey) && actionKey === 'baseline') return languageKnown(state.profile.germanLevel) && state.subjects.some(subject => /german|deutsch/i.test(subject.name) && subject.weakTopics.length);
  if (phaseKey === 'q1' && ['routine', 'grades'].includes(itemKey) && actionKey === 'topic') return core.some(subject => subject.level === 'LK' && known(subject.written) && subject.weakTopics.length > 0);
  if (phaseKey === 'q1' && itemKey === 'activities') {
    const activity = state.activities.find(item => !item.impact) || state.activities[0];
    if (actionKey === 'role') return Boolean(activity?.responsibilities);
    if (actionKey === 'impact') return Boolean(activity?.achievements && activity?.impact);
    if (actionKey === 'hours') return Boolean(activity?.startDate && known(activity?.hoursPerWeek) && known(activity?.weeksPerYear));
  }
  return false;
}

function definitions(state, pathway) {
  const university = programme(state, pathway);
  const target = university?.name || (pathway === 'USA' ? 'one US university' : 'one German university');
  const fields = state.profile.targetFields.slice(0, 2).join(' / ') || 'a study field that interests you';
  const activity = state.activities.find(item => !item.impact) || state.activities[0];
  const experience = activity?.name || 'volleyball, restaurant work or a project';
  const usa = pathway === 'USA';
  const common = {
    baseline: entry('baseline', usa ? 'Record grades and weak topics' : 'Record Abitur subjects and grade goals', 'Accurate current grades, target grades and weak topics drive the daily plan. Your German points are not a US GPA or a final Abitur score.', 'grades', [
      step('grades', 'Record written and oral points for your core subjects', 15, 'Open Subjects and enter your real Mathematics, Physics, English and German results.', 'Keep unknown results blank; do not estimate a US GPA.'),
      step('targets', 'Choose one weak topic and a realistic target per subject', 15, 'Add the topic that caused your last lost points.', 'Set a target you can discuss with your teacher.'),
    ]),
    grades: entry('grades', 'Improve written Mathematics and Physics grades', 'Turn weak written LK topics, assessment feedback and target grades into sustained practice; actual new results measure grade improvement.', 'grades', [
      step('topic', 'Choose one written LK weakness to improve this semester', 15, 'Use your actual recent written result and teacher feedback.', 'Update the weak topic and realistic target in Subjects.'),
      step('feedback', 'Ask your LK teacher for feedback on one attempted problem', 20, 'Bring your own attempted solution and a precise question.', 'Record the method to practise next; completion does not award a higher grade.'),
    ]),
    german: entry('german', 'Improve German writing and school performance', 'Strengthen argumentation, clarity and grammar using current school feedback; actual assessments measure improvement.', 'german', [
      step('baseline', 'Record one specific German writing weakness', 10, 'Use your latest teacher feedback.', 'Update German weak topics and your language level.'),
      step('feedback', 'Get feedback on one German argument paragraph', 25, 'Use current school material and the assessment criteria.', 'Record one concrete revision for the next week.'),
    ]),
    english: entry('english', 'Improve English writing and exam performance', 'Use school writing, analysis and an honest language baseline to strengthen grades and future university preparation.', 'english', [
      step('baseline', 'Record your English level and one writing weakness', 10, 'Set your language level in Profile; unknown is a valid starting point.', 'Ask your English teacher which writing skill costs the most points.'),
      step('feedback', 'Get feedback on one school analysis paragraph', 25, 'Use your current school task and the teacher’s criteria.', 'Record one specific change to practise next week.'),
    ]),
    internship: entry(usa ? 'internship' : 'experience', usa ? 'Plan a meaningful internship or project' : 'Arrange a relevant internship or project', 'Explore a field through practical work, solve a real problem and record your own contribution.', 'internships', [
      step('scope', `Define a small project in ${fields}`, 20, 'Write the problem, the person it helps and one deliverable.', 'Choose a feasible two-to-four-week first version.'),
      step('contact', 'Contact one internship host or project mentor', 25, 'Identify a real contact and prepare a specific request.', 'Record a project or internship deadline under Events.'),
      step('evidence', 'Record what you learned and your measurable contribution', 15, 'Add the experience to Activities with dates, responsibilities and evidence.', 'Avoid claiming results that have not happened.'),
    ]),
    documents: entry('documents', 'Prepare application documents', 'Check each programme’s current checklist and request official school documents early.', 'documents', [
      step('checklist', `Save the official document checklist for ${target}`, 20, 'Check transcript, final certificate, identity and translation requirements.', 'Save the official link and any missing document in university notes.'),
      step('request', 'Request one missing school document', 20, 'Ask the school about the correct official issue and translation process.', 'Record when it will be ready and how the university accepts it.'),
    ]),
    transition: entry('transition', usa ? 'Prepare the transition to university' : 'Plan housing, funding and first semester', 'Confirm enrolment, funding, housing and a realistic first-term learning plan using official information.', 'documents', [
      step('enrolment', 'Check the enrolment and acceptance checklist', 20, 'Use your actual offer and official portal.', 'Record the acceptance deadline and conditions; do not assume admission.'),
      step('budget', 'Write a first-semester housing and funding plan', 25, 'List confirmed tuition, living costs and funding sources.', 'Check housing and orientation dates.'),
    ]),
  };
  if (usa) return [
    ['now', 'Today', [common.baseline, entry('list', 'Start a balanced US university list', 'Include aspirational and practical options with official requirements and a feasible cost plan.', 'research', [step('compare', `Compare ${target} with one additional US option`, 20, `Read the official programme page for ${fields}.`, 'Save one reason it fits, one prerequisite and one question.'), step('balance', 'Add one realistic alternative and a cost note', 20, 'Include academic fit, admission requirements and the full cost.', 'Keep Germany available as a parallel option if selected.')])]],
    ['q1', 'Q1', [common.grades, common.english, common.german, entry('activities', 'Document sustained activities', 'Record volleyball, work, leadership and projects with your own role, dates and measurable contribution.', 'extracurriculars', [step('role', activity ? `${experience}: record your responsibilities` : 'Choose one activity and record your responsibilities', 15, 'Open Activities and describe what you personally do.', 'Use concrete responsibilities rather than a broad title.'), step('impact', activity ? `${experience}: add one achievement with evidence` : 'Record one real activity achievement with evidence', 20, 'Write what changed because of your work, and when.', 'Use a real number or specific outcome; leave unknown numbers blank.'), step('hours', 'Check activity dates and realistic time commitments', 10, 'Record start/end dates, hours per week and weeks per year.', 'Keep notes that will help you describe the experience later.')]), entry('requirements', 'Verify international entry requirements', 'Check recognised school qualifications, course prerequisites and international applicant requirements for each target.', 'documents', [step('qualification', `Check how ${target} accepts the German Abitur`, 20, 'Read the official international-applicant policy.', 'Save prerequisite subjects and document requirements.'), step('english-policy', `Record ${target}’s English-proficiency policy`, 15, 'Check accepted qualifications, tests and possible exemptions.', 'Record an official link and the date you checked it.')])]],
    ['q2', 'Q2', [common.grades, entry('tests', 'Decide which English test is accepted', 'Check IELTS / TOEFL / Cambridge policies at every target. SAT/ACT are not considered for UC admission; research other universities separately.', 'tests', [step('policy', 'Compare accepted English tests for your shortlist', 20, 'Check accepted tests, minimum scores, exemptions and validity.', 'Do not book a test before checking the official requirements.'), step('decision', 'Choose a required test and a feasible target date', 15, 'Add a test plan only if it is useful for your actual targets.', 'For SAT/ACT, check non-UC universities separately; UC is test-free.')]), common.internship, entry('finances', 'Compare programmes, costs and funding', 'Build a financially feasible shortlist alongside Germany; international aid varies.', 'research', [step('cost', `Record the full annual cost for ${target}`, 20, 'Include tuition, living costs, insurance and travel.', 'Use official published figures and record the source.'), step('funding', 'Identify one verified funding option', 20, 'Check eligibility for international applicants.', 'Record deadlines, conditions and any funding gap honestly.')])]],
    ['preparation', 'University preparation', [entry('leadership', 'Build evidence of responsibility and leadership', 'Develop sustained responsibility through real work, sport or a project rather than collecting titles.', 'extracurriculars', [step('contribution', `Choose one useful improvement in ${experience}`, 25, 'Define the problem and a small improvement you can deliver.', 'Record an owner, next action and a way to measure the outcome.'), step('reflection', 'Record the result and what you learned', 15, 'Use real evidence and describe your own part.', 'Update Activities; unfinished work can be recorded as ongoing.')])]],
    ['q3', 'Q3', [common.grades, entry('essays', 'Draft personal insight / application essays', 'Use true, specific experiences in your own voice. UC and Common App have different prompts.', 'essays', [step('prompts', `Save the current essay prompts for ${target}`, 15, 'Read the official application instructions for your entry cycle.', 'Record word limits and choose one suitable prompt.'), step('story', `Outline one story from ${experience}`, 25, 'Describe a situation, your action, the result and what changed in your thinking.', 'Use concrete details and your own voice.'), step('draft', 'Draft and get feedback on one application response', 40, 'Write from the outline and check the actual word limit.', 'Ask a trusted reader for feedback; retain authorship and honest facts.')]), entry('recommendations', 'Check recommendation policies', 'Request letters only where required. UC generally does not request them with the initial application; verify each target.', 'recommendations', [step('policy', 'Check which shortlisted universities require recommendations', 15, 'Record required number, type and submission process.', 'Do not assume the UC application requires a teacher letter.'), step('request', 'Prepare a recommendation request where required', 20, 'Ask early with the verified deadline and your own activity summary.', 'Record who agreed and the submission status.')]), entry('calendar', 'Verify deadlines for your entry year', 'US applications may be due before your Abitur. Confirm your entry year and save official university deadlines.', 'applications', [step('entry', 'Confirm your university entry year and application cycle', 15, 'Check whether you aim to start immediately after Abitur or after a gap year.', 'Update application and entry years in Profile if needed.'), step('deadlines', 'Save verified deadlines for every shortlisted US university', 20, 'Read the official admissions page for your actual cycle.', 'Add deadlines to Universities or Events; preparation targets are not official deadlines.')])]],
    ['q4', 'Q4', [entry('grades', 'Keep final-year grades strong', 'Maintain subject-specific revision and check any conditions attached to real offers.', 'grades', [step('weak-topics', 'Choose the highest-impact final-year weak topic', 20, 'Use recent assessment feedback and your next exam date.', 'Update Subjects so Today targets the right skill.'), step('conditions', 'Check academic conditions in any actual offers', 15, 'Use only offers you actually received.', 'Record required final documents and any grade conditions.')]), common.documents]],
    ['abitur-preparation', 'Abitur preparation', [entry('revision', 'Build a realistic final-exam revision plan', 'Schedule actual Abitur exams and prioritise weak LK topics without removing rest or fixed activities.', 'grades', [step('dates', 'Add your confirmed Abitur exam dates and topics', 20, 'Use the school’s confirmed schedule.', 'Enter actual exams so Today creates subject-specific preparation.'), step('review', 'Review one recent paper and update weak topics', 30, 'Identify the errors that cost the most points.', 'Choose one method to improve before the next rehearsal.')])]],
    ['abitur', 'Abitur', [entry('final', 'Complete your Abitur and final documents', 'Arrange your actual final results and send them through each university’s official process.', 'grades', [step('results', 'Record your actual final results and qualification', 15, 'Wait for the official certificate before marking the qualification complete.', 'Keep the final score separate from simple subject averages.'), step('send', 'Check how each university receives final school results', 20, 'Use the official accepted document process.', 'Record submission and receipt status.')])]],
    ['applications', 'Applications', [entry('submit', 'Submit and track each application', 'US applications can be due before Abitur. Follow your actual entry cycle and verified deadlines.', 'applications', [step('audit', `Check ${target}’s application against the official checklist`, 25, 'Review programme choice, activities, essays and required documents.', 'Keep a short list of unfinished requirements.'), step('submit', 'Complete one missing application section', 35, 'Use your own verified facts and the current application portal.', 'Submit deliberately when ready and record confirmation in Universities.'), step('receipt', 'Check application receipt and portal requests', 15, 'Use the university’s official portal.', 'Record missing requests and their real deadlines.')]), entry('decisions', 'Compare offers and practical requirements', 'Review real decisions, cost, conditions, housing and visa requirements using official sources.', 'applications', [step('offers', 'Create a comparison of the offers actually received', 20, 'Include conditions, cost, academic fit and response deadlines.', 'Leave offers unknown until an official decision arrives.'), step('decision', 'Record a deliberate choice and the acceptance deadline', 20, 'Check funding and official acceptance conditions.', 'Do not mark admission complete before an actual offer.')])]],
    ['admission', 'Admission', [entry('offer', 'Confirm an admission offer and its conditions', 'Track actual official decisions and conditions; completed preparation is not an admission prediction.', 'applications', [step('portal', 'Check official decisions and any outstanding requests', 15, 'Use the official applicant portal.', 'Record the actual decision and respond to genuine requests.'), step('acceptance', 'Check funding and acceptance conditions for your chosen offer', 20, 'Verify response deadline, deposit and conditions.', 'Confirm the milestone only after a real admission decision.')])]],
    ['university', 'University', [common.transition]],
  ];
  return [
    ['now', 'Today', [common.baseline, entry('fields', 'Explore German degree programmes', 'Compare Wirtschaftsinformatik, Informatik, business and engineering using actual programmes.', 'research', [step('compare', `Compare two German programmes in ${fields}`, 20, 'Use Hochschulkompass and official programme pages.', 'Record curriculum, location and one requirement for each.'), step('save', 'Save one German university with its programme', 15, 'Record why the degree fits your interests.', 'Keep the official programme link and open questions.')])]],
    ['q1', 'Q1', [entry('routine', 'Build an LK revision routine', 'Prioritise written Mathematics and Physics weaknesses alongside other subjects.', 'grades', [step('topic', 'Identify one written LK topic that needs improvement', 15, 'Use real written feedback rather than your oral grade alone.', 'Update weak topics and targets in Subjects.'), step('teacher', 'Ask your LK teacher what to improve next', 15, 'Bring one attempted question and a precise difficulty.', 'Save the feedback as the next practice priority.')]), { ...common.german, key: 'language', title: 'Improve academic German writing' }, common.english]],
    ['q2', 'Q2', [common.grades, entry('programmes', 'Build a German university shortlist', 'Use Hochschulkompass and official programme pages to compare real degree choices.', 'research', [step('shortlist', 'Save three German programmes that fit your interests', 25, 'Compare module content and academic requirements.', 'Include realistic alternatives as well as preferred options.'), step('fit', `Record one programme-fit question for ${target}`, 15, 'Check compulsory modules, practical work and career options.', 'Save your question and an official information contact.')]), common.internship]],
    ['preparation', 'University preparation', [entry('orientation', 'Make a deliberate study-field choice', 'Compare study content and use practical experience to reduce uncertainty about your degree.', 'research', [step('compare', 'Compare modules in two possible study fields', 25, 'Choose programmes in your saved interests.', 'Record which modules you would actually enjoy and where you need preparation.'), step('visit', 'Plan one information session or university visit', 15, 'Check official open-day or advice appointments.', 'Add a confirmed date under Events when available.')])]],
    ['q3', 'Q3', [common.grades, entry('admission', 'Check NC, aptitude and admission routes', 'NC values vary by cycle and are not guaranteed cut-offs. Check each specific programme.', 'applications', [step('requirements', `Check ${target}’s programme admission requirements`, 20, 'Record unrestricted/NC/aptitude status and required prerequisites.', 'Use the current official programme page, not a predicted cut-off.'), step('route', 'Record the correct application route for your shortlist', 15, 'Check university portal, uni-assist or Hochschulstart where relevant.', 'Save the official route and documents per programme.')]), entry('calendar', 'Verify deadlines and application portals', 'Use university applications or Hochschulstart where the programme requires it.', 'applications', [step('cycle', 'Confirm the semester and year you will apply for', 10, 'Check your graduation and intended university entry year.', 'Update Profile if you plan a gap year.'), step('deadlines', 'Save verified German programme deadlines', 20, 'Check programme-specific deadlines and exceptions.', 'Add actual dates to Universities or Events.')])]],
    ['q4', 'Q4', [entry('revision', 'Prepare systematically for Abitur', 'Use subject-specific practice and error review while protecting sleep and fixed commitments.', 'grades', [step('dates', 'Add confirmed Abitur dates and revision topics', 20, 'Use the school’s confirmed schedule.', 'Enter actual Mathematics, Physics and other exams.'), step('errors', 'Update your two most important Abitur weak topics', 20, 'Use a recent paper or teacher feedback.', 'Today will prioritise the next concrete preparation step.')]), common.documents]],
    ['abitur-preparation', 'Abitur preparation', [entry('readiness', 'Turn weak topics into final-exam priorities', 'Actual exam dates and attempted papers guide preparation; completed tasks do not guarantee a result.', 'grades', [step('paper', 'Review a recent LK paper and identify lost points', 30, 'Separate knowledge gaps from method and time-management errors.', 'Update the relevant weak topics in Subjects.'), step('plan', 'Check the final two-week exam and rest schedule', 15, 'Verify dates, free windows and fixed commitments.', 'Keep light revision before the actual exam.')])]],
    ['abitur', 'Abitur', [entry('complete', 'Complete Abitur and receive your certificate', 'Check your actual final qualification and any subject-specific entry requirements.', 'grades', [step('certificate', 'Check your official Abitur certificate details', 15, 'Use the actual issued certificate.', 'Keep final qualification separate from planning averages.'), step('copies', 'Prepare accepted certificate copies for your applications', 15, 'Check the required upload or certification process.', 'Record which programmes have received the document.')])]],
    ['applications', 'Applications', [entry('submit', 'Submit German applications', 'Follow verified programme deadlines; many winter-semester deadlines occur in summer, with exceptions.', 'applications', [step('checklist', `Check ${target}’s application documents and portal`, 20, 'Use your verified application route and current checklist.', 'Record missing items and the real deadline.'), step('application', 'Complete one missing German application section', 30, 'Use your actual qualification and programme choice.', 'Record submission confirmation in Universities when submitted.')]), entry('offers', 'Track offers and enrolment deadlines', 'Accept and enrol through the official portal; follow Hochschulstart coordination rules where relevant.', 'applications', [step('portal', 'Check official application status and genuine offers', 15, 'Record decisions and any missing-document requests.', 'Do not assume an offer from completing preparation.'), step('response', 'Record the acceptance and enrolment deadline', 15, 'Check coordination rules and conditions.', 'Use the official portal for the deliberate acceptance.')])]],
    ['admission', 'Admission', [entry('offer', 'Confirm admission and enrolment requirements', 'Track actual offers, qualification conditions and official enrolment deadlines.', 'applications', [step('decision', 'Record the official admission decision', 15, 'Use your actual university or Hochschulstart notification.', 'Keep unknown decisions pending.'), step('enrol', 'Check the enrolment checklist for your chosen place', 20, 'Check documents, insurance, semester fee and deadlines.', 'Confirm the milestone only after an actual decision.')])]],
    ['university', 'University', [common.transition]],
  ];
}

export function getRoadmap(state, pathway = 'USA', date) {
  const path = pathway === 'Germany' ? 'Germany' : 'USA';
  const graduation = yearNumber(state.profile.graduationYear, Number(date.slice(0, 4)) + 2);
  const first = graduation - 2;
  const explicitEntry = yearNumber(state.profile.universityStartYear, null);
  const applicationYear = yearNumber(state.profile.applicationYear, null) ?? (explicitEntry ?? graduation) - (path === 'USA' ? 1 : 0);
  const entryYear = explicitEntry ?? applicationYear + (path === 'USA' ? 1 : 0);
  const periods = {
    now: [state.createdDate || date, shift(state.createdDate || date, 14)],
    q1: [`${first}-08-01`, `${first + 1}-01-31`], q2: [`${first + 1}-02-01`, `${first + 1}-07-31`],
    q3: [`${first + 1}-08-01`, `${graduation}-01-31`], q4: [`${graduation}-02-01`, `${graduation}-04-30`],
    preparation: [`${first + 1}-02-01`, `${path === 'USA' ? applicationYear : entryYear}-07-31`],
    'abitur-preparation': [`${graduation}-03-01`, `${graduation}-05-31`],
    abitur: [`${graduation}-05-01`, `${graduation}-07-31`],
    applications: path === 'USA' ? [`${applicationYear}-08-01`, `${applicationYear + 1}-07-31`] : [`${applicationYear}-05-01`, `${applicationYear}-09-30`],
    admission: path === 'USA' ? [`${entryYear}-03-01`, `${entryYear}-08-31`] : [`${entryYear}-08-01`, `${entryYear}-09-30`],
    university: [`${entryYear}-09-01`, `${entryYear + 1}-07-31`],
  };
  // An imported or incompletely edited entry cycle can be earlier than school
  // graduation. Keep every displayed preparation range valid while the user
  // finishes editing the cycle; never reverse a timeline interval.
  for (const period of Object.values(periods)) if (period[1] < period[0]) period[1] = period[0];
  const official = path === 'USA' ? 'https://admission.universityofcalifornia.edu/admission-requirements/international-applicants/' : 'https://www.hochschulkompass.de/en/degree-programmes.html';
  const confirmed = new Set(state.roadmapCompleted || []);
  const universities = state.universities.filter(item => item.country === path && item.status !== 'applied');
  // Official saved deadlines override preparation targets; no default deadline
  // is presented as verified. The selected application cycle remains explicit.
  const deadlines = universities.map(item => item.deadline).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= periods.applications[0] && value <= periods.applications[1]).sort();
  const phases = definitions(state, path).map(([phaseKey, label, entries]) => {
    const [start, end] = periods[phaseKey];
    const items = entries.map(definition => {
      const id = `${path}-${phaseKey}-${definition.key}`;
      const steps = definition.steps.map(action => {
        const actionId = `${id}-${action.id}`;
        const recorded = observedSetup(state, phaseKey, definition.key, action.id);
        const taskMinutes = state.tasks.filter(task => task.completed && task.roadmapItemId === id && task.roadmapStepId === actionId).reduce((sum, task) => sum + task.minutes, 0);
        const minutes = recorded ? Math.max(action.minutes, taskMinutes) : taskMinutes;
        return { ...action, id: actionId, completed: recorded || minutes >= action.minutes, completedFromData: recorded, completedMinutes: minutes, remainingMinutes: Math.max(0, action.minutes - minutes) };
      });
      const completedSteps = steps.filter(action => action.completed).length;
      const nextStep = confirmed.has(id) ? null : steps.find(action => !action.completed) || null;
      const isSubmission = phaseKey === 'applications' && definition.key === 'submit';
      return { id, title: definition.title, description: definition.description, category: definition.category, completed: confirmed.has(id), confirmed: confirmed.has(id),
        pathway: path, phaseId: `${path}-${phaseKey}`, goalId: goalForCategory(definition.category), planningStart: start,
        dueDate: isSubmission && deadlines[0] ? deadlines[0] : end, dateVerified: Boolean(isSubmission && deadlines[0]),
        completedSteps, totalSteps: steps.length, actionProgress: Math.round(steps.reduce((sum, action) => sum + Math.min(action.minutes, action.completedMinutes), 0) / Math.max(1, steps.reduce((sum, action) => sum + action.minutes, 0)) * 100), steps, nextStep,
        link: path === 'Germany' && definition.key === 'calendar' ? 'https://www.hochschulstart.de/' : programme(state, path)?.url || official,
      };
    });
    const dateStatus = date < start ? 'upcoming' : date > end ? 'past' : 'current';
    return { id: `${path}-${phaseKey}`, key: phaseKey, label, start, end, status: items.every(item => item.completed) ? 'complete' : dateStatus, items };
  });
  return phases.sort((a, b) => a.key === 'now' ? -1 : b.key === 'now' ? 1 : a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

export function goalForCategory(category) {
  return ({ grades: 'grades', english: 'language', german: 'language', extracurriculars: 'activities', internships: 'activities', research: 'research', tests: 'tests', essays: 'applications', recommendations: 'applications', documents: 'applications', applications: 'applications' })[category] || 'research';
}
export function taskCategoryForMilestone(item) {
  return item.category === 'grades' ? 'academics' : ['english', 'german'].includes(item.category) ? 'language' : ['extracurriculars', 'internships'].includes(item.category) ? 'activity' : 'university';
}

/** The next achievable actions, filtered by the selected pathways and phase. */
export function getRoadmapPriorities(state, date) {
  const result = [];
  for (const path of state.profile.pathways || []) for (const phase of getRoadmap(state, path, date)) {
    const ahead = difference(date, phase.start);
    const declaredSemester = /^q[1-4]$/.test(phase.key) && phase.label === state.profile.schoolYear;
    if (ahead > 30 && !declaredSemester) continue;
    if (state.profile.schoolYear === 'Graduated' && ['q1', 'q2', 'q3', 'q4', 'abitur', 'abitur-preparation'].includes(phase.key) && phase.items.every(item => item.category === 'grades')) continue;
    // Offer and transition actions need the actual decision season. They do
    // not become generic first-year tasks just because a profile says Graduated.
    if (['admission', 'university'].includes(phase.key) && date < phase.start) continue;
    for (const item of phase.items) {
      if (item.completed || !item.nextStep) continue;
      if (state.profile.schoolYear === 'Graduated' && item.category === 'grades') continue;
      const dueIn = difference(date, item.dueDate);
      const score = item.dateVerified && dueIn >= 0 && dueIn <= 7 ? 174 : item.dateVerified && dueIn >= 0 && dueIn <= 21 ? 109
        : declaredSemester && ahead > 30 ? 58 : phase.key === 'now' ? 56 : phase.status === 'current' ? 55 : phase.status === 'past' ? 45 : 39;
      result.push({ ...item, phaseLabel: phase.label, score: score + (item.category === 'extracurriculars' ? 1 : 0), daysUntil: dueIn, category: taskCategoryForMilestone(item), milestoneCategory: item.category });
    }
  }
  return result.sort((a, b) => b.score - a.score || a.dueDate.localeCompare(b.dueDate) || state.profile.pathways.indexOf(a.pathway) - state.profile.pathways.indexOf(b.pathway) || a.id.localeCompare(b.id));
}

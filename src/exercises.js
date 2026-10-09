import { ENGLISH_PASSAGES, GERMAN_PASSAGES, ENGLISH_WORDS, BASIC_ENGLISH_WORDS, GERMAN_WORDS, BASIC_GERMAN_WORDS } from './practice-bank.js';

function hash(value) { return [...value].reduce((result, char) => (result * 31 + char.charCodeAt(0)) >>> 0, 0); }
function dayNumber(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) ? Math.floor(value / 86_400_000) : null;
}
function selectMaterial(bank, task, kind) {
  const day = dayNumber(task.date);
  return bank[day === null ? 0 : (day + hash(`${task.subjectId || ''}:${kind}`)) % bank.length];
}
function selectWords(bank, count, task, language) {
  const day = dayNumber(task.date);
  const offset = day === null ? 0 : (day * count + hash(`${task.subjectId || ''}:${language}:vocabulary`)) % bank.length;
  return Array.from({length: count}, (_, index) => bank[(offset + index) % bank.length]);
}
function englishMaterial(task, content, kind) {
  // Use the topic saved with the task, not a later edit to an exam. An old
  // completed task must keep the same material when the application reloads.
  const tag = /civil.?rights|bürgerrechte|equal.?rights/.test(content) ? 'civil-rights'
    : /american.?dream/.test(content) ? 'american-dream'
      : /us.?history|american.?history|historical|source.?criticism/.test(content) ? 'history'
        : /technolog|artificial.?intelligence|algorithm|digital/.test(content) ? 'technology'
          : /leadership|volleyball|teamwork/.test(content) ? 'leadership' : '';
  const bank = ENGLISH_PASSAGES.filter(item => tag ? item.tags.includes(tag) : ['education','technology','leadership'].some(topic => item.tags.includes(topic)));
  return selectMaterial(bank, task, kind);
}
const criterion = (id, label, hint) => ({id, label, hint});
function writingCriteria(kind, german = false, beginner = false) {
  if (beginner) return german ? [
    criterion('de-basic-meaning','Inhalt verständlich wiedergegeben','Habe ich klar geschrieben, was im Text passiert?'),
    criterion('de-basic-sentences','Vollständige Sätze verwendet','Prüfe Subjekt, Verb und Satzende; achte auf die Verbposition.'),
    kind === 'summary' ? criterion('de-basic-neutral','Ohne eigene Bewertung formuliert','Gib den Inhalt in eigenen Worten wieder, ohne deine Meinung hinzuzufügen.') : kind === 'analysis' ? criterion('de-basic-evidence','Eine passende Textstelle genannt','Zeige, welche Wörter oder Sätze die Veränderung deutlich machen.') : criterion('de-basic-reason','Einen Grund genannt','Verbinde deine eigene Meinung mit einem einfachen Grund.'),
  ] : [
    criterion('basic-meaning','Meaning is clear','Can another reader understand the main events without the original text?'),
    criterion('basic-sentences','Complete sentences','Check the subject, verb and end punctuation in every sentence.'),
    kind === 'summary' ? criterion('basic-neutral','No added opinion','Give the main events in your own words without adding your judgement.') : kind === 'analysis' ? criterion('basic-evidence','One relevant detail identified','Point to a word or sentence that shows the difference or change.') : criterion('basic-reason','A reason for my opinion','Use because to explain one opinion when the task asks for it.'),
  ];
  if (kind === 'summary') return german ? [
    criterion('de-summary-mainidea','Hauptaussage erfasst','Nenne Thema und zentrale Entwicklung; lasse unwichtige Einzelheiten weg.'),
    criterion('de-summary-neutral','Neutral und eigenständig formuliert','Verzichte auf Wertungen und wörtliche Zitate; nutze eigene Worte.'),
    criterion('de-summary-tense','Präsens und klaren Aufbau geprüft','Verknüpfe die wichtigsten Aussagen in einer sinnvollen Reihenfolge.'),
  ] : [
    criterion('summary-mainidea','Main idea and development','Introduce the main subject and include the key development, not every example.'),
    criterion('summary-ownwords','Neutral wording in my own words','Remove personal opinion, direct quotations and copied phrases.'),
    criterion('summary-structure','Present tense and clear order','Keep the meaning accurate, connect ideas, and check the requested word range.'),
  ];
  if (kind === 'analysis') return german ? [
    criterion('de-analysis-claim','Eine genaue Deutung formuliert','Die Deutung muss die konkrete Analysefrage beantworten.'),
    criterion('de-analysis-evidence','Passenden Textbeleg verwendet','Führe einen kurzen Beleg an und ordne ihn in den Text ein.'),
    criterion('de-analysis-effect','Wirkung und Funktion erklärt','Erkläre, wie der Beleg deine Deutung stützt; benenne nicht nur ein Stilmittel.'),
    criterion('de-analysis-expression','Ausdruck und Satzbau geprüft','Überarbeite ungenaue Formulierungen, Verbposition und Kommas.'),
  ] : [
    criterion('analysis-claim','A precise analytical claim','Answer the analysis question rather than retelling what happened.'),
    criterion('analysis-evidence','Relevant short evidence','Integrate a short quotation and make its context clear.'),
    criterion('analysis-effect','Effect linked to the argument','Explain how the wording, contrast or example supports the claim.'),
    criterion('analysis-expression','Clear and accurate expression','Check sentence structure and replace vague descriptions with precise wording.'),
  ];
  return german ? [
    criterion('de-comment-position','Eine klare Position vertreten','Beantworte die Frage mit einer begründeten, differenzierten These.'),
    criterion('de-comment-example','Ein konkretes Beispiel erklärt','Zeige, warum dein Beispiel die Begründung stützt.'),
    criterion('de-comment-counterargument','Einen Einwand abgewogen','Behandle einen ernsthaften Einwand und erläutere deine Antwort darauf.'),
    criterion('de-comment-expression','Aufbau und Sprache überarbeitet','Nutze passende Verknüpfungen; prüfe Kommas und genaue Begriffe.'),
  ] : [
    criterion('comment-position','A clear, qualified position','State your view and any important limit to it.'),
    criterion('comment-example','A concrete supporting example','Explain why the example supports your reason.'),
    criterion('comment-counterargument','A fair counterargument addressed','Consider a reasonable objection and respond instead of ignoring it.'),
    criterion('comment-expression','Logical flow and accurate language','Link the paragraphs and check sentence structure and word choice.'),
  ];
}

const SUMMARY_MODELS = {
  'evening-library': 'The passage describes a town that extends its library’s opening hours and discovers demand from workers, teenagers and parents. Supporters regard the change as a contribution to social mobility, while critics note that a library cannot remove every educational barrier. The trial reveals needs that earlier attendance figures do not show. The council therefore continues the programme and seeks further feedback. It plans to assess participation and experiences rather than promise identical outcomes for all visitors. Both groups recognise that the extended hours expose needs that were previously difficult for the council to identify.',
  'public-algorithm': 'The passage describes a city using software to prioritise road repairs. Residents notice that areas with fewer complaints can be overlooked. The city responds by explaining its data and sending inspectors to check some lower-priority streets. A neighbourhood group also requests a way to challenge decisions. The engineers accept that the tool should assist human judgement. The discussion therefore moves from a general verdict on software to the responsibilities involved in checking public decisions. Faster decisions are presented as valuable only when residents can understand their basis and correct missing information in the process.',
  'team-leadership': 'The passage describes a volleyball team that initially relies on its captain for decisions and organisation. Although the team wins matches, her absence reveals that other players cannot manage simple routines independently. The players then share responsibilities and the captain asks more questions. The change takes practice and can slow decisions, but the team becomes better able to adapt. It begins to measure progress through collective working habits as well as match results. Leadership consequently shifts from the captain’s visible individual control towards shared routines that the players can explain and use.',
  'dream-small-business': 'The passage describes Maya’s repair shop as an example of ambition and the support needed to pursue it. Customers value the service, but the account also identifies practical help from colleagues, a community organisation and a relative. High rent remains a risk. Maya defines success as a stable living and a contribution to her neighbourhood rather than exceptional wealth. Her experience raises a question about whether the American Dream should concern rare achievements or broadly available opportunities. Maya does not dismiss hard work, but challenges accounts that overlook the conditions and assistance that make her achievement possible.',
  'dream-career-path': 'The passage describes a career event where a successful technology worker’s story prompts practical questions from students. They ask about training costs, family responsibilities and location. The speaker acknowledges the support and timing behind his career, and teachers introduce several alternative routes. Students leave with questions to investigate rather than one definition of success. The event presents the American Dream as more useful when it recognises varied paths and the conditions that make them possible. Less dramatic local accounts offer students concrete options to research and connect career decisions with the lives they want to lead.',
  'rights-public-meeting': 'The passage describes a town meeting that is formally open to everyone but difficult for some residents to attend. A civic group identifies barriers involving the room, timing and language. It proposes practical changes and several ways to provide feedback. Councillors debate the extra work but agree to test the changes and report participation. The example connects equal rights with making participation usable in everyday life and treats inclusion as a continuing responsibility. Some councillors are concerned about the additional work, while others expect wider participation to improve the information behind their decisions.',
  'rights-library-exhibit': 'The passage describes students developing a local-history exhibition about a fictional civil-rights campaign. An interview leads them to include organising work alongside demonstrations and a policy change. They acknowledge disagreements within the campaign and continuing inequality. The exhibition compares personal accounts with documents and asks whose experiences remain missing. It presents historical change as collective work that requires attention to evidence, arguments and the limits of the surviving sources. The students avoid depicting a policy decision as the end of inequality and invite visitors to consider experiences their sources leave out.',
  'history-town-archive': 'The passage describes students revising an initial conclusion about a town’s growth. Official records and advertisements suggest widespread improvement, but additional personal sources reveal different experiences. The class considers who produced each source, its purpose and the people it represents. Students explain gaps in the evidence instead of filling them with guesses. Their final account describes uneven change and recognises that an archive can preserve useful information while reflecting unequal opportunities to leave records. The class avoids reversing its initial story into an equally simple negative account and instead compares evidence before reaching a qualified conclusion.',
};

function commentModel(material) {
  const positions = {
    'evening-library': ['Public institutions should make opportunity easier to access.', 'Evening library hours can help people whose work prevents daytime visits.', 'one service cannot remove every educational disadvantage'],
    'public-algorithm': ['Public decisions should be explainable and open to challenge.', 'A road-repair system needs checks when complaint data leave some areas less visible.', 'explanations and inspections require time and resources'],
    'team-leadership': ['A good leader should help others act independently.', 'Sharing warm-ups and travel planning makes a team more reliable when its captain is absent.', 'some urgent decisions still need one person to take responsibility'],
    'dream-small-business': ['A fair chance at a stable life is a useful way to define the American Dream.', 'A small business can provide meaningful independence without exceptional wealth.', 'individual initiative remains important'],
    'dream-career-path': ['People should be able to pursue more than one definition of success.', 'A route that fits family responsibilities may be more valuable than a prestigious job far away.', 'common standards can help people compare opportunities'],
    'rights-public-meeting': ['Equal rules should be supported by practical access.', 'An accessible room and different feedback options allow more residents to participate.', 'public organisations have limited resources'],
    'rights-library-exhibit': ['History exhibitions should explain limitations as well as achievements.', 'Including disagreement and unseen organising work makes a campaign easier to understand.', 'too much detail can overwhelm visitors'],
    'history-town-archive': ['A convincing historical account should explain the limits of its evidence.', 'Comparing official records with letters prevents a claim about everyone from resting on only one perspective.', 'historians still need to reach conclusions rather than list uncertainty indefinitely'],
  };
  const [claim, example, objection] = positions[material.id];
  const development = {
    'evening-library': 'Individuals still need to make choices and use the resources offered. However, effort cannot create an open door when a service is unavailable at the only suitable time. Councils should therefore ask residents which practical barriers matter most and test changes rather than promise universal success. Results should include people’s experiences as well as attendance figures. This would make the responsibility shared: institutions improve access, while users decide how to benefit from it. Opportunity becomes more credible when the conditions for pursuing it are visible.',
    'public-algorithm': 'An explanation also helps residents identify information that officials have missed. The answer is not to publish a complicated technical document and assume everyone can interpret it. Officials should describe important inputs in plain language and explain how people can question a result. Checks can focus on cases where the consequences are serious or the information is incomplete. This approach keeps the useful speed of the tool while making responsibility visible. Public trust should rest on a process that can correct errors, rather than on a claim that software is neutral.',
    'team-leadership': 'This does not mean that every player should make every decision. A team can agree on clear roles and still rely on its captain during urgent moments. The important difference is whether knowledge and initiative remain confined to one person. Giving others manageable responsibilities lets them practise skills and learn from mistakes. Shared routines also preserve what the group knows when members leave. I would therefore judge leadership partly by the abilities it develops in others, rather than only by the results achieved while the leader is present.',
    'dream-small-business': 'A broader definition does not remove the value of ambition. It recognises that people may want security, time for family and useful work rather than extraordinary wealth. Training, clear advice and reliable services can help turn effort into realistic options. These supports should not guarantee a particular outcome or make every choice risk-free. They should reduce avoidable barriers so that background does not decide the path in advance. The promise becomes more convincing when success can be pursued by many people in ordinary, meaningful ways.',
    'dream-career-path': 'Nevertheless, a standard that values only status can hide costs that matter to individual lives. Students should compare training, working conditions and responsibilities instead of copying a single impressive career story. Guidance can provide reliable information while leaving room for different priorities. Someone who builds a useful local business may contribute as much to a community as a person with a famous employer. Recognising several routes does not make success meaningless; it makes the reasons behind a choice more visible and encourages decisions that people can sustain.',
    'rights-public-meeting': 'The practical response is to identify the largest barriers and improve access step by step. It would be unreasonable to assume that every need can be met immediately. It is equally unreasonable to treat a formal invitation as proof that nobody is excluded. Feedback from people who cannot attend is especially useful because existing attendance figures may hide their experience. A fair process should review whom it reaches and explain the choices it makes. Equal rights become more meaningful when institutions take responsibility for making them usable.',
    'rights-library-exhibit': 'Curators can respond by organising the exhibition around a few clear questions and offering additional detail separately. Showing disagreement does not erase the significance of a successful campaign. Instead, it helps visitors understand the choices and collective work behind the result. Explaining gaps in the sources also invites further research rather than pretending the display includes every experience. A responsible exhibition should distinguish documented evidence from interpretation. Visitors can then appreciate an achievement while still asking how change happened, whom it affected and which problems remained unresolved.',
    'history-town-archive': 'A qualified conclusion is possible when the writer separates strong evidence from tentative interpretation. For example, records about businesses can explain economic activity without proving that every household benefited. Letters may add experiences but should not be treated as representative automatically. Comparing purpose, perspective and context makes each source more useful. Readers can then see why a conclusion is supported and where further research is necessary. Admitting a limit does not weaken careful history; it protects the account from claiming more than the evidence can establish.',
  };
  const conclusions = {
    'evening-library': 'That is a stronger basis for judging the programme than either blaming users for every difficulty or expecting one institution to solve everything.',
    'public-algorithm': 'This also gives officials a clearer reason to explain the decisions they defend.',
    'team-leadership': 'The captain’s success would then include a team that understands its own responsibilities.',
    'dream-small-business': 'Such a definition would preserve personal initiative while making the opportunities and constraints behind individual stories harder to overlook.',
    'dream-career-path': 'Success should therefore reflect informed priorities as well as visible external achievement.',
    'rights-public-meeting': 'The town should therefore judge the revised meeting by whose voices become heard, rather than simply count how many invitations it sends.',
    'rights-library-exhibit': 'This makes historical understanding more demanding, but also more valuable than a simple story of inevitable progress or complete failure.',
    'history-town-archive': 'Careful uncertainty and clear reasoning can make a conclusion trustworthy.',
  };
  return `${claim} ${example} Admittedly, ${objection}. That concern calls for a careful approach, but it does not justify ignoring the problem. ${development[material.id]} ${conclusions[material.id]}`;
}

/** Original practice material. Completion is self-reported, not a scored assessment. */
export function getExercise(task, data) {
  // A linked roadmap action or dated event has its own concrete instructions.
  // Subject names here must not replace profile setup or deadline work with
  // an unrelated practice exercise.
  if (task.roadmapStepId || task.eventStage) return {
    label: task.eventStage ? 'Event preparation · your next action' : 'University roadmap · your next action',
    prompt: task.title,
    checklist: task.steps?.length ? task.steps : ['Complete the concrete action above.', 'Record the result and any next step.'],
    guidance: 'Save what you actually did. A completed action records preparation; confirm the achieved milestone separately in Plan.',
  };
  // A language name inside university research or an activity describes its
  // subject matter, not a request for a school writing exercise.
  if (task.category === 'university' || task.category === 'activity') return {
    label: task.category === 'activity' ? 'Application profile · evidence first' : 'University preparation · your next action',
    prompt: task.reason || task.title,
    checklist: task.steps?.length ? task.steps : task.category === 'activity'
      ? ['Name your actual role and responsibility.', 'Record a specific action and a verifiable result.', 'Save the evidence or update the activity in Profile.']
      : ['Open the official requirements for one programme.', 'Record one verified requirement or unanswered question.', 'Update your university notes or test plan in Profile.'],
    guidance: task.category === 'activity'
      ? 'Use honest, specific evidence of your contribution.'
      : 'Use the current official requirements and materials for your chosen university or test.',
  };
  const subject = data.subjects?.find(item => item.id === task.subjectId)?.name || '';
  const content = `${task.title || ''} ${subject} ${task.reason || ''} ${task.steps?.join(' ') || ''}`.toLowerCase();
  const german = /german|deutsch/.test(content);
  const level = german ? data.profile?.germanLevel : data.profile?.englishLevel;
  const beginner = /^A[12]/i.test(level || '');
  const advanced = /^C[12]|native/i.test(level || '');
  const count = Number(task.title?.match(/\b(4|8|12)\b/)?.[1]) || (beginner ? 4 : advanced ? 12 : 8);
  const sentenceCount = beginner ? 2 : advanced ? 5 : 4;
  const stage = task.revisionStage;
  if (['timed', 'mistakes', 'light', 'explain', 'questions', 'interpret'].includes(stage)) {
    const prompts = {
      timed: `Use a teacher-provided or official practice task in ${subject || 'this subject'}. Work without notes for ${task.minutes} minutes. A short or interrupted session is section practice; a complete timed rehearsal needs the full planned duration.`,
      mistakes: 'Choose two errors from your recent work. Explain why each answer was wrong, redo the question without notes, and write one rule that prevents the mistake.',
      light: 'Recall your most important ideas from short cue cards. Review only uncertain items, organise what you need for the exam, and finish early enough to rest.',
      explain: 'Explain one topic aloud for two minutes without notes. Listen for gaps, check your class material, and try the explanation again more clearly.',
      questions: 'Write six likely follow-up questions. Answer them aloud with a clear claim, supporting evidence, and one example.',
      interpret: 'Choose one result, chart, or experiment from your course. Describe it, explain its meaning and uncertainty, then write a supported conclusion.',
    };
    const germanPrompts = {
      timed: `Bearbeite eine Übungsaufgabe aus dem Unterricht oder aus offiziellen Prüfungsmaterialien ohne Notizen für ${task.minutes} Minuten. Eine kurze oder unterbrochene Einheit ist Teilaufgabenpraxis; für eine vollständige Prüfungssimulation benötigst du die gesamte vorgesehene Zeit.`,
      mistakes: 'Wähle zwei Fehler aus deiner letzten Arbeit. Erkläre jeweils die Ursache, bearbeite die Aufgabe erneut ohne Notizen und notiere eine Regel, mit der du den Fehler künftig vermeidest.',
      light: 'Rufe die wichtigsten Inhalte mithilfe kurzer Stichwortkarten ab. Wiederhole nur unsichere Punkte, lege deine Materialien bereit und höre rechtzeitig auf, damit Zeit zur Erholung bleibt.',
      explain: 'Erkläre ein Thema zwei Minuten lang laut und ohne Notizen. Achte auf Lücken, prüfe dein Unterrichtsmaterial und wiederhole die Erklärung anschließend genauer.',
      questions: 'Formuliere sechs mögliche Nachfragen. Beantworte sie laut mit einer klaren Aussage, einem passenden Beleg und einem Beispiel.',
      interpret: 'Wähle ein Ergebnis, eine Grafik oder eine Textstelle aus dem Unterricht. Beschreibe sie, erläutere ihre Bedeutung und mögliche Grenzen und formuliere eine belegte Schlussfolgerung.',
    };
    return { label: `${subject || 'Exam'} · ${stage} practice`, prompt: german ? germanPrompts[stage] : prompts[stage], checklist: german ? ['Verwende dein aktuelles Unterrichtsmaterial.', 'Bearbeite die Aufgabe zuerst selbstständig und prüfe sie danach.', 'Speichere eine konkrete Erkenntnis in deinen Notizen.'] : task.steps?.length ? task.steps : ['Use your current class material.', 'Work independently before checking.', 'Save one lesson in your notes.'], recentNotes: stage === 'mistakes' ? (data.tasks || []).filter(item => item.id !== task.id && item.notes && (task.examId ? item.examId === task.examId : item.subjectId === task.subjectId)).sort((a,b) => b.date.localeCompare(a.date)).slice(0,3).map(item => ({title:item.title,notes:item.notes})) : [] };
  }
  // Summary and analysis instructions often mention "own words" or "wording".
  // Those phrases do not turn a writing task into a word-list exercise.
  if (/vocab|wortschatz|\b(?:use|learn|recall|review)\b.*\bwords?\b|\b(?:4|8|12)\s+words?\b/i.test(task.title || '') || stage === 'vocabulary') {
    return german ? {
      label: 'German · academic expression',
      prompt: `Rufe die Bedeutung von ${count} Ausdrücken ohne Hilfe ab. Verwende ${sentenceCount} davon in einem eigenen Absatz und ersetze anschließend zwei ungenaue Wörter.`,
      words: selectWords(beginner ? BASIC_GERMAN_WORDS : GERMAN_WORDS, count, task, 'german').map(([word,meaning]) => ({word,meaning})),
      checklist: ['Erkläre die Bedeutung in eigenen Worten.', `Verwende ${sentenceCount} Ausdrücke in einem eigenen Absatz.`, 'Notiere unsichere Wörter für eine erneute Abfrage.'],
      reviewCriteria: [criterion('de-vocabulary-recall','Bedeutungen ohne Hilfe abgerufen','Decke die Bedeutungen ab, bevor du sie überprüfst.'), criterion('de-vocabulary-use','Ausdrücke sinnvoll eingesetzt','Prüfe, ob jeder Ausdruck in deinem Satz die richtige Bedeutung hat.'), criterion('de-vocabulary-retrieval','Unsichere Wörter notiert','Speichere nur die Wörter, die du noch nicht sicher abrufen kannst.')],
    } : {
      label: 'English · academic vocabulary',
      prompt: `Read ${count} words once. Hide the meanings and recall them. Use your least familiar words in original sentences connected to school or your interests.`,
      words: selectWords(beginner ? BASIC_ENGLISH_WORDS : ENGLISH_WORDS, count, task, 'english').map(([word,meaning,example]) => ({word,meaning,example})),
      checklist: ['Recall the meanings without looking.', `Write ${sentenceCount} original sentences.`, 'Mark three words to retrieve again tomorrow.'],
      reviewCriteria: [criterion('vocabulary-recall','Meanings recalled without looking','Cover the definitions before checking each answer.'), criterion('vocabulary-use','Words used with the right meaning','Read your own sentences and check whether each word fits its context.'), criterion('vocabulary-retrieval','Uncertain words noted','Save unfamiliar words to retrieve in a later practice session.')],
    };
  }
  if (/english|englisch|ielts|toefl|cambridge/.test(content)) {
    if (/ielts|toefl|cambridge/.test(content)) return {
      label: 'English test · official-format practice',
      prompt: 'Choose one short task from the official materials for your booked test. Work under its time limit, then compare your answer with the published criteria. Save a specific error and the skill to practise next.',
      checklist: ['Use the current format for your specific test.', 'Attempt the task before looking at an answer.', 'Use the official scoring criteria or a teacher’s feedback.'],
      guidance: 'School writing and language certificates have different formats. This task is preparation guidance, not an official mock score.',
    };
    const typeContent = `${task.title || ''} ${stage || ''}`.toLowerCase();
    const kind = /comment|argument|opinion/.test(typeContent) ? 'comment' : /summary|summari|understand|overview/.test(typeContent) ? 'summary' : 'analysis';
    const material = englishMaterial(task, content, kind);
    const prompts = {
      summary: 'Write a 90–110 word summary of the passage. Introduce its main subject, use your own words, and leave out your opinion.',
      analysis: `Write one analytical paragraph: ${material.analysis} Make a claim, quote a short piece of evidence, explain its effect, and link it to the argument.`,
      comment: `${material.comment} Write a balanced comment of about 150 words with a clear position, one example, and a counterargument.`,
    };
    return {
      label: `English · ${kind} practice · ${data.profile?.englishLevel || 'B2'}`,
      materialId: material.id, materialTitle: material.title,
      prompt: beginner ? kind === 'summary' ? 'Read the short text. Write three sentences about what happened in your own words. Do not add your opinion. Check word order and your verbs.' : kind === 'analysis' ? 'Read the short text. Explain one difference or change in three simple sentences. Point to one word or sentence that helped you understand it. Check word order and your verbs.' : 'Read the short text. Write your opinion in three simple sentences and give one reason using because. Check word order and your verbs.' : prompts[kind], passage: beginner ? material.beginner : material.passage,
      checklist: kind === 'summary' ? ['Keep the original meaning and order.', 'Use present tense and your own words.', 'Remove quotations, examples, and personal judgement.'] : kind === 'analysis' ? ['Start with a precise claim.', 'Integrate evidence and explain its effect.', 'Link the paragraph back to the main argument.'] : ['State a clear position.', 'Support it with a concrete example.', 'Answer a reasonable counterargument.'],
      reviewCriteria: writingCriteria(kind, false, beginner),
      ...(beginner ? {} : {sampleAnswer: kind === 'summary' ? SUMMARY_MODELS[material.id] : kind === 'analysis' ? material.sample : commentModel(material)}),
      guidance: 'This is original practice material, not an official exam or an automated grade. Use your actual class text when preparing a specific exam. Write your own draft before comparing the example paragraph; it shows one possible approach, not a required answer. Ask a teacher for feedback.',
    };
  }
  if (/german|deutsch/.test(content)) {
    const typeContent = `${task.title || ''} ${stage || ''}`.toLowerCase();
    const kind = /summary|summari|zusammenfass|inhalt|understand/.test(typeContent) ? 'summary' : /analysis|analyse/.test(typeContent) ? 'analysis' : 'comment';
    const material = selectMaterial(GERMAN_PASSAGES, task, kind);
    const prompts = {
      summary: 'Verfasse eine kurze Inhaltsangabe in 70–90 Wörtern. Nenne das Thema, gib die wesentlichen Aussagen im Präsens und in eigenen Worten wieder und verzichte auf deine Meinung.',
      analysis: `Schreibe einen Analyseabsatz. ${material.focus} Formuliere eine Deutung, führe einen kurzen Textbeleg an und erläutere dessen Wirkung und Funktion.`,
      comment: `Schreibe einen argumentativen Absatz: ${material.question} Formuliere eine These, begründe sie mit einem konkreten Beispiel und gehe auf einen Einwand ein.`,
    };
    return {
      label: `German · ${kind} practice · ${data.profile?.germanLevel || 'C1'}`,
      materialId: material.id, materialTitle: material.title,
      prompt: beginner ? kind === 'summary' ? 'Lies den kurzen Text. Schreibe drei Sätze über den Inhalt in eigenen Worten. Verwende das Präsens und füge keine eigene Meinung hinzu.' : kind === 'analysis' ? 'Lies den kurzen Text. Beschreibe in drei einfachen Sätzen, was sich verändert. Nenne eine Textstelle, die diese Veränderung zeigt.' : `Lies den kurzen Text. ${material.question} Schreibe drei Sätze mit deiner Meinung und einem Grund. Verbinde zwei Sätze mit „weil“ oder „deshalb“.` : prompts[kind],
      passage: beginner ? material.beginner : material.passage,
      checklist: kind === 'summary' ? ['Thema und Hauptaussagen in eigenen Worten wiedergeben.', 'Im Präsens schreiben und keine eigene Bewertung einfügen.', 'Satzbau und sinnvolle Verknüpfungen prüfen.'] : kind === 'analysis' ? ['Eine genaue Deutung mit Bezug zur Frage formulieren.', 'Einen Textbeleg anführen und seine Wirkung erklären.', 'Verbposition, Kommas und genaue Begriffe prüfen.'] : ['Eine klare These und ein passendes Beispiel.', 'Einen ernsthaften Einwand abwägen.', 'Verbposition, Kommas und Satzverknüpfungen prüfen.'],
      reviewCriteria: writingCriteria(kind, true, beginner),
      ...(!beginner && kind === 'comment' ? {sampleAnswer: material.sample} : {}),
      guidance: 'Dieser Text ist eigens erstelltes Übungsmaterial und keine offizielle Prüfungsaufgabe. Nutze für eine konkrete Klausur auch deine Unterrichtstexte. Prüfe deinen eigenen Entwurf zuerst selbst und bitte eine Lehrkraft um Rückmeldung; die Selbstprüfung vergibt keine Note.',
    };
  }
  if (/mathemat|maths|mathe/.test(content) && /derivat|differentiat|ableit|calculus|funktion/.test(content)) return {
    label: 'Mathematics LK · differentiation',
    prompt: 'For f(x) = x³ − 3x² + 2, find all stationary points. Classify them using the second derivative and explain what the derivative tells you about the graph.',
    checklist: ['Calculate f′(x) and solve f′(x) = 0.', 'Use f″(x) to classify each point.', 'Check the coordinates and explain your reasoning.'],
    answer: 'f′(x) = 3x² − 6x, so x = 0 or 2. f″(x) = 6x − 6. At x = 0, f″ is negative: local maximum (0, 2). At x = 2, f″ is positive: local minimum (2, −2).',
  };
  if (/physics|physik/.test(content) && /force|newton|mechan|kinematic|beweg|kraft/.test(content)) return {
    label: 'Physics LK · forces and motion',
    prompt: 'A 1,000 kg car accelerates at 2 m/s² on a horizontal road. Resistance is 400 N. Find the driving force. Draw the horizontal forces and distinguish driving force from resultant force.',
    checklist: ['Choose a positive direction and draw a force diagram.', 'Write Fdriving − Fresistance = m × a.', 'Solve with units and check whether your answer is reasonable.'],
    answer: 'The resultant force is m × a = 2,000 N. The driving force must also overcome 400 N of resistance, so Fdriving = 2,400 N.',
  };
  return {
    label: subject ? `${subject} · deliberate practice` : 'One concrete next step',
    prompt: task.resource?.prompt || task.reason,
    checklist: task.steps?.length ? task.steps : ['Choose one small, specific topic.', 'Try it without notes, then check your work.', 'Record a mistake and the next question to practise.'],
  };
}

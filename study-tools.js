// Learning preferences are separate from graded answer history and teacher stars.
function readStudyState(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback; } catch { return fallback; }
}
let studyPrefs = { count:10, categories:['Identify','Understand','Apply','Calculate','Troubleshoot'], savedOnly:false, ...readStudyState('mra-study-options-v1', {}) };
const studyCategories = ['Identify','Understand','Apply','Calculate','Troubleshoot'];
if (![5,10,15,20,'all'].includes(studyPrefs.count)) studyPrefs.count = 10;
studyPrefs.categories = Array.isArray(studyPrefs.categories) ? studyPrefs.categories.filter(c => studyCategories.includes(c)) : [...studyCategories];
let studyBookmarks = readStudyState('mra-study-bookmarks-v1', {});
let flashRatings = readStudyState('mra-flash-ratings-v1', {});
let lastConceptQuestions = readStudyState('mra-concept-history-v1', {});
let pendingBoss = null;
function saveStudyState(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); return true; }
  catch { error = 'This browser could not save your study preference. It remains available for this session.'; return false; }
}
function questionCategory(q) {
  if (studyCategories.includes(q.category)) return q.category;
  if (q.type === 'formula' || q.numeric !== undefined) return 'Calculate';
  if (q.type === 'scenario') return 'Troubleshoot';
  if (q.diagram && /circuit|flow|lamp|energiz|direction|position|happen|when/i.test(q.prompt)) return 'Apply';
  if (q.type === 'symbol' || /identify|which symbol/i.test(q.prompt)) return 'Identify';
  return 'Understand';
}
function conceptKey(q) { return q.conceptKey || q.id; }
function filterStudyItems(items) {
  return items.filter(q => studyPrefs.categories.includes(questionCategory(q)) && (!studyPrefs.savedOnly || studyBookmarks[q.id]));
}
function studyCount(items) { return studyPrefs.count === 'all' ? items.length : Number(studyPrefs.count); }
function bookmarkControl(q) {
  const saved = Boolean(studyBookmarks[q.id]);
  return `<button type="button" class="study-bookmark" data-study-bookmark="${escape(q.id)}" aria-pressed="${saved}">${saved ? '🔖 Saved for my study' : '🔖 Save for my study'}</button>`;
}
function studySettings() {
  const available = filterStudyItems(pool()).filter(q => !q.cloze && q.examEligible !== false);
  return `<section class="topic-panel study-settings"><h2>Set up your practice</h2><label>Number of questions<select id="study-count">${[5,10,15,20,'all'].map(n => `<option value="${n}" ${studyPrefs.count === n ? 'selected' : ''}>${n === 'all' ? 'All available' : n}</option>`).join('')}</select></label><fieldset><legend>Question categories</legend>${studyCategories.map(c => `<label><input type="checkbox" data-study-category="${c}" ${studyPrefs.categories.includes(c) ? 'checked' : ''}> ${c}</label>`).join('')}</fieldset><label><input type="checkbox" id="study-saved-only" ${studyPrefs.savedOnly ? 'checked' : ''}> Only my saved questions</label><p class="small">${available.length} questions match your checked modules and practice settings. Personal bookmarks are separate from teacher stars and stay in this browser. Boss exams ignore these filters: whole course, 40 questions, aiming for 32–36 teacher questions.</p></section>`;
}
function topicSkill(qs) {
  const latest = new Map();
  const ids = new Set(qs.map(q => q.id));
  for (const e of events) if (ids.has(e.qid)) latest.set(e.qid, e);
  const answered = latest.size;
  if (!answered) return { label:'Not started', detail:'No scored evidence yet.' };
  const confident = [...latest.values()].filter(e => e.correct && e.guessed !== true).length;
  const ratio = confident / answered;
  const label = ratio < .6 ? 'Needs practice' : answered >= Math.min(5, qs.length) && answered / Math.max(1, qs.length) >= .6 && ratio >= .85 ? 'Strong' : 'Improving';
  return { label, detail:`${confident}/${answered} latest answers correct without guessing; ${answered}/${qs.length} questions attempted.` };
}
function topicSkillBadge(qs) {
  const skill = topicSkill(qs);
  return `<small class="topic-skill" title="${escape(skill.detail)}">${skill.label}</small>`;
}
// One question per narrow concept in practice; rotate which sibling appears next session.
function spacedPracticeSelection(items, target, teacherTarget = 0, coverModules = false) {
  const groups = new Map();
  const states = learningStates();
  for (const q of shuffle([...new Map(items.map(q => [q.id,q])).values()])) {
    const key = conceptKey(q);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }
  const representatives = [...groups.entries()].map(([key, group]) => {
    const previous = lastConceptQuestions[key]?.id;
    group.sort((a,b) => Number(a.id === previous) - Number(b.id === previous) || Number(!!states.get(b.id)?.isDue) - Number(!!states.get(a.id)?.isDue));
    return group[0];
  });
  const selected = learningSelection(representatives, Math.min(target, representatives.length), teacherTarget, coverModules);
  if (studyPrefs.count === 'all') {
    const used = new Set(selected.map(q => q.id));
    selected.push(...shuffle(items.filter(q => !used.has(q.id))).map(freshQuestion));
  }
  return spreadConcepts(selected);
}
function spreadConcepts(items) {
  const remaining = [...items], out = [];
  while (remaining.length) {
    const index = remaining.findIndex(q => !out.length || conceptKey(q) !== conceptKey(out[out.length-1]));
    out.push(remaining.splice(index < 0 ? 0 : index,1)[0]);
  }
  return out;
}
function recordStudyConcepts(qs) {
  for (const q of qs) lastConceptQuestions[conceptKey(q)] = { id:q.id, at:Date.now() };
  saveStudyState('mra-concept-history-v1', lastConceptQuestions);
}
function bossSelection(items) {
  const unique = [...new Map(items.filter(q => q.examEligible !== false && !q.cloze).map(q => [q.id,q])).values()];
  const teachers = shuffle(unique.filter(q => q.starred));
  const regular = shuffle(unique.filter(q => !q.starred));
  const size = Math.min(40, unique.length);
  const desired = 32 + Math.floor(Math.random()*5);
  let tc = Math.min(desired, teachers.length, size);
  let rc = Math.min(size-tc, regular.length);
  tc = Math.min(teachers.length, size-rc);
  rc = Math.min(regular.length, size-tc);
  const qs = spreadConcepts(shuffle([...teachers.slice(0,tc),...regular.slice(0,rc)])).map(freshQuestion);
  const percentage = size ? Math.round(tc/size*100) : 0;
  const meets = size === 40 && tc >= 32 && tc <= 36;
  return { qs, teacherCount:tc, regularCount:rc, percentage, meets, note:`Whole-course Boss exam: ${size} questions · ${tc} teacher (${percentage}%) + ${rc} regular · 75% to pass. Checked modules, bookmarks and categories do not limit this exam.` + (meets ? '' : ` This pool cannot supply the requested 40-question 80–90% teacher mix without repeats. Available: ${teachers.length} teacher and ${regular.length} regular. The displayed mix uses unique available questions.`) };
}
function bossPreview() {
  return `<section class="play-shell"><p class="eyebrow">${escape(world().code)} · BOSS EXAM SETUP</p><h1>Check your exam mix</h1><p>${escape(pendingBoss.note)}</p><p>Passing requires ${Math.ceil(pendingBoss.qs.length*.75)} correct answers out of ${pendingBoss.qs.length}. Answers remain editable until you lock in and grade.</p><button id="confirm-boss" class="primary" ${!pendingBoss.qs.length ? 'disabled' : ''}>${pendingBoss.meets ? 'Start 40-question Boss exam' : 'Start with this available mix'}</button><button id="cancel-boss">Back to study options</button></section>`;
}
function flashPriority(q) {
  const rated = flashRatings[q.id];
  if (!rated) return 2;
  if (rated.rating === 'Again') return 0;
  return rated.nextReview <= Date.now() ? 1 : 3;
}
function selectFlashcards(qs, target) {
  const sorted = shuffle(qs).sort((a,b) => flashPriority(a) - flashPriority(b));
  const selected = [], concepts = new Set();
  for (const q of sorted) {
    if (selected.length >= target) break;
    if (studyPrefs.count !== 'all' && concepts.has(conceptKey(q))) continue;
    selected.push(freshQuestion(q)); concepts.add(conceptKey(q));
  }
  return selected;
}
function flashRatingControls(q) {
  if (!run.flipped) return '';
  return `<section class="flash-ratings"><p>How well did you remember it?</p>${['Again','Hard','Easy'].map(r => `<button data-flash-rating="${r}" ${run.cardRatings?.[q.id] === r ? 'aria-pressed="true"' : ''}>${r}</button>`).join('')}<p class="small">Again: prioritize next session. Hard: review after 1 day. Easy: review after 7 days. Ratings guide flashcards and award no test points. They stay in this browser.</p></section>`;
}
function flashFinished() {
  const ratings = Object.values(run.cardRatings || {});
  return `<section class="results"><h1>Flashcards finished</h1><p>${ratings.length} cards rated · ${ratings.filter(r=>r==='Again').length} Again · ${ratings.filter(r=>r==='Hard').length} Hard · ${ratings.filter(r=>r==='Easy').length} Easy.</p><p>Ratings guide future flashcard order. Your scored progress has not changed.</p><button data-action="home">Back to worlds</button><button data-action="again">New flashcard session</button></section>`;
}
function normalizedChoice(value) { return String(value).toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').replace(/[.!]$/,'').trim(); }
function learningHelpFor(q) {
  return q.learningHelp || studyConceptHelp[q.learningHelpKey] || { simple:String(q.explanation).split(/(?<=[.!?])\s/)[0], example:`Work through this question: ${q.prompt.replace(/^★\s*/, '')} The answer is ${q.answer}. ${q.explanation}`, lookFor:q.reviewCue?.text || `Find ${q.section} and identify the condition that makes the answer correct.` };
}
function answerTeaching(q, selectedAnswer, correct) {
  const chosen = selectedAnswer === undefined ? null : String(selectedAnswer);
  const key = normalizedChoice(chosen || '');
  const definition = q.wrongAnswerExplanations?.[chosen] || studyOptionDefinitions[key];
  const help = learningHelpFor(q);
  const wrong = correct ? '' : `<h3>You selected: ${escape(chosen === null ? 'Answer not recorded for this attempt' : chosen + (q.numeric !== undefined && q.unit ? ' '+q.unit : ''))}</h3>${definition ? `<p>${escape(definition)}</p>` : ''}<p>${q.numeric !== undefined ? 'That result does not match the worked calculation below.' : 'That choice does not match the component, condition, or behavior asked about here.'}</p>`;
  return `${wrong}<h3>${correct ? 'Why the answer is correct' : 'Correct answer'}: ${escape(q.answer)}</h3><p>${escape(q.explanation)}</p><p class="review-cue"><b>Review:</b> ${escape(q.reviewCue?.text || q.section)}</p><details class="simple-help"><summary>Quick explanation & simple example</summary><p><b>Simple idea:</b> ${escape(help.simple)}</p><p><b>Example:</b> ${escape(help.example)}</p>${help.memory ? `<p><b>Memory tip:</b> ${escape(help.memory)}</p>` : ''}<p><b>What to look for:</b> ${escape(help.lookFor || q.reviewCue?.text || q.section)}</p></details>`;
}
function bindStudyTools() {
  const count = el('study-count');
  if (count) count.onchange = () => { studyPrefs.count = count.value === 'all' ? 'all' : Number(count.value); saveStudyState('mra-study-options-v1',studyPrefs); render(); };
  root.querySelectorAll('[data-study-category]').forEach(input => input.onchange = () => {
    studyPrefs.categories = studyCategories.filter(c => c === input.dataset.studyCategory ? input.checked : studyPrefs.categories.includes(c));
    saveStudyState('mra-study-options-v1',studyPrefs); render();
  });
  const saved = el('study-saved-only');
  if (saved) saved.onchange = () => { studyPrefs.savedOnly = saved.checked; saveStudyState('mra-study-options-v1',studyPrefs); render(); };
  root.querySelectorAll('[data-study-bookmark]').forEach(button => button.onclick = () => {
    const id = button.dataset.studyBookmark;
    if (studyBookmarks[id]) delete studyBookmarks[id]; else studyBookmarks[id] = { at:Date.now() };
    saveStudyState('mra-study-bookmarks-v1',studyBookmarks); render();
  });
  if (el('confirm-boss')) el('confirm-boss').onclick = () => { const exam = pendingBoss; pendingBoss = null; start('boss',exam); };
  if (el('cancel-boss')) el('cancel-boss').onclick = () => { pendingBoss = null; render(); };
  root.querySelectorAll('[data-flash-rating]').forEach(button => button.onclick = () => {
    const q = run.qs[run.index], rating = button.dataset.flashRating;
    flashRatings[q.id] = { rating, lastReviewed:Date.now(), nextReview:Date.now()+(rating==='Easy'?7:rating==='Hard'?1:0)*86400000 };
    run.cardRatings ??= {}; run.cardRatings[q.id] = rating;
    saveStudyState('mra-flash-ratings-v1',flashRatings);
    if (run.index < run.qs.length-1) { run.index++; run.flipped=false; } else run.cardsFinished=true;
    render(); focusQuestion();
  });
}

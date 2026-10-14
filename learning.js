/* Additive learning features. Existing question IDs and answer history remain intact. */
const DAY = 86400000;
function learningStates(now = Date.now()) {
  const states = new Map(), seen = new Set();
  for (const e of events) {
    const key = e.key || e.run + '/' + e.qid;
    if (seen.has(key)) continue;
    seen.add(key);
    const s = states.get(e.qid) || { earned: false, streak: 0, due: 0, latest: null };
    if (e.correct && e.guessed !== true) {
      s.earned = true;
      s.streak++;
      const days = [1, 3, 7, 14, 30][Math.min(s.streak - 1, 4)];
      const at = Date.parse(e.at);
      s.due = Number.isFinite(at) ? at + days * DAY : 0;
    } else {
      s.streak = 0;
      s.due = 0;
    }
    s.latest = e;
    s.isDue = s.due <= now;
    states.set(e.qid, s);
  }
  return states;
}
function learningProgress(qs) {
  const states = learningStates();
  const unique = [...new Map(qs.map(q => [q.id,q])).values()];
  return {
    total: unique.length,
    earned: unique.filter(q => states.get(q.id)?.earned).length,
    due: unique.filter(q => states.get(q.id)?.isDue).length,
  };
}
function courseProgressPanel() {
  const p = learningProgress(courseQuestions());
  return `<section class="topic-panel course-progress"><h2>${escape(world().name)} progress</h2>${progress(p.earned,p.total,'Overall course progress')}<p><b>${p.earned} / ${p.total}</b> mastered · ${p.due} due for review</p><p class="small">Whole course, including unchecked modules. Previously earned progress stays earned when a question returns for review. New correct guesses do not add mastery.</p></section>`;
}
// Reserve teacher questions, cover each selected module, then prefer due review.
function learningSelection(items, target, starredTarget = 0, coverModules = false) {
  const all = [...new Map(items.map(q=>[q.id,q])).values()];
  const states = learningStates();
  const picked = [], used = new Set();
  const add = q => { if(q && !used.has(q.id)){picked.push(q);used.add(q.id);} };
  const stars = shuffle(all.filter(q=>q.starred));
  for(const q of stars.slice(0,Math.min(starredTarget,target))) add(q);
  if(coverModules) {
    const groups = new Map();
    for(const q of shuffle(all)) {
      const key = q.world+'|'+q.topic;
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(q);
    }
    for(const [key,group] of groups) {
      if(!picked.some(q=>q.world+'|'+q.topic===key))
        add(group.find(q=>states.get(q.id)?.isDue) || group[0]);
    }
  }
  const remaining = shuffle(all.filter(q=>!used.has(q.id)));
  remaining.sort((a,b)=>Number(!!states.get(b.id)?.isDue)-Number(!!states.get(a.id)?.isDue));
  for(const q of remaining) {if(picked.length>=target)break;add(q);}
  return shuffle(picked).map(freshQuestion);
}
function starredNote(qs, requested) {
  const n=qs.filter(q=>q.starred).length;
  return ` ${n} starred teacher-quiz question${n===1?'':'s'} included.` +
    (n<requested ? ` This eligible pool has fewer than ${requested}; other modules are not added.` : '');
}
function confidenceControl(q, afterAnswer = false) {
  if (!run || run.mode === 'cards') return '';
  if (!afterAnswer && !isExam()) return '';
  if (afterAnswer && !run.answers?.some(e => e.qid === q.id)) return '';
  return `<label class="confidence"><input type="checkbox" data-confidence="${escape(q.id)}" ${afterAnswer ? 'data-confidence-saved="true"' : ''} ${run.guesses?.[q.id] ? 'checked' : ''} ${(afterAnswer ? run.grading : run.locked) || busy ? 'disabled' : ''}> ${afterAnswer ? 'I guessed / wasn’t confident' : 'I’m guessing / not confident'}</label><p class="small confidence-help">Correct guesses still earn test points, but return for practice and do not advance mastery.</p>`;
}
async function saveConfidence(qid, guessed) {
  const prior = run.guesses?.[qid] === true;
  busy = true;
  error = '';
  render();
  try {
    const response = await fetch('/api/confidence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: run.id + '/' + qid, guessed }) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Could not save confidence.');
    run.guesses ??= {};
    run.guesses[qid] = guessed;
    events = events.map(e => e.key === data.event.key ? data.event : e);
    run.answers = run.answers.map(e => e.key === data.event.key ? data.event : e);
  } catch (e) {
    run.guesses ??= {};
    run.guesses[qid] = prior;
    error = e.message;
  } finally { busy = false; render(); }
}
function weakTopics(attempts = events, qs = courseQuestions()) {
  const latest = new Map();
  for(const e of attempts) latest.set(e.qid,e);
  const groups = new Map();
  for(const q of qs) {
    const e=latest.get(q.id);
    if(!e || (e.correct && !e.guessed)) continue;
    const key=q.world+'|'+q.topic;
    if(!groups.has(key))groups.set(key,{world:q.world,topic:q.topic,wrong:0,guessed:0,questions:[]});
    const g=groups.get(key);
    if(!e.correct)g.wrong++; else g.guessed++;
    g.questions.push(q);
  }
  return [...groups.values()].sort((a,b)=>(b.wrong*2+b.guessed)-(a.wrong*2+a.guessed));
}
function weakTopicPanel(attempts = events, qs = courseQuestions()) {
  const groups=weakTopics(attempts,qs);
  return `<section class="topic-panel weak-topics"><h2>Topics to review</h2>${groups.length?groups.map(g=>{
    const refs=[...new Set(g.questions.flatMap(q=>q.reviewSlides?.length?q.reviewSlides.map(s=>s.title+' · PDF page '+s.page):[q.section]))];
    return `<article><h3>${escape(bank.worlds.find(w=>w.id===g.world)?.code)} · ${escape(g.topic)}</h3><p>${g.wrong} incorrect · ${g.guessed} correct but guessed</p><details><summary>Where to review</summary><ul>${refs.map(r=>`<li>${escape(r)}</li>`).join('')}</ul></details></article>`;
  }).join(''):'<p>No weak topics identified from these answers yet. Unanswered topics have not been assessed.</p>'}</section>`;
}
let questionFlags = {};
try { const saved=JSON.parse(localStorage.getItem('mra-question-flags-v1')||'{}'); if(saved && !Array.isArray(saved) && typeof saved==='object')questionFlags=saved; } catch {}
function selectedAnswerForReport(q) {
  if (run?.drafts?.[q.id] !== undefined) return run.drafts[q.id];
  if (run?.feedback?.q?.id === q.id) return run.feedback.answer;
  const savedAttempt = run?.answers?.find(e => e.qid === q.id);
  if (savedAttempt?.selectedAnswer !== undefined) return savedAttempt.selectedAnswer;
  return questionFlags[q.id]?.selectedAnswer || 'Not recorded for this earlier attempt';
}
function flagIssueUrl(q, reason, note) {
  const form = run?.qs?.find(item => item.id === q.id) || q;
  const body = `Question ID: ${q.id}\nCourse: ${q.world}\nModule: ${q.topic}\nQuestion: ${form.prompt}\nSelected answer: ${selectedAnswerForReport(q)}\nMarked correct answer: ${form.answer}\nSource: ${q.section}\nReview page: ${q.reviewCue?.page || 'See source section'}\nDiagram: ${form.diagram?.imageKey || 'No diagram'}\n\nIssue: ${reason}\nDetails: ${note}\n\nSuggested correction / supporting slide:`;
  return 'https://github.com/chars0311/MRA-study-/issues/new?title=' + encodeURIComponent('Question report: ' + q.id) + '&body=' + encodeURIComponent(body);
}
function flagControl(q) {
  const saved=questionFlags[q.id]||{};
  return `<details class="question-flag"><summary>${saved.reason?'⚑ Question flagged':'⚑ Flag this question'}</summary><form data-flag-form="${escape(q.id)}"><label>Reason<select name="reason">${['Unclear wording','Incorrect answer','Missing or unclear diagram','Duplicate question','Other'].map(r=>`<option ${saved.reason===r?'selected':''}>${r}</option>`).join('')}</select></label><label>Details<textarea name="note" maxlength="1500" rows="3">${escape(saved.note||'')}</textarea></label><button type="submit">Save flag</button><p data-flag-status role="status"></p><div data-flag-link>${saved.reason?`<a href="${escape(flagIssueUrl(q,saved.reason,saved.note||''))}" target="_blank" rel="noopener noreferrer">Review and send on GitHub</a>`:''}</div><p class="small">Saving keeps this flag in this browser. To send it to the site owner, open GitHub, review the report and submit it there (sign-in required).</p></form></details>`;
}
function bindLearning() {
  root.querySelectorAll('[data-confidence]').forEach(input=>{
    input.onchange=()=>{ if (input.dataset.confidenceSaved) { saveConfidence(input.dataset.confidence, input.checked); return; } run.guesses??={};run.guesses[input.dataset.confidence]=input.checked; };
  });
  root.querySelectorAll('[data-flag-form]').forEach(form=>{
    form.onsubmit=e=>{
      e.preventDefault();
      const q=bank.questions.find(q=>q.id===form.dataset.flagForm);
      if(!q)return;
      const reason=form.elements.reason.value,note=form.elements.note.value.trim();
      questionFlags[q.id]={reason,note,selectedAnswer:selectedAnswerForReport(q),at:new Date().toISOString()};
      let saved=true;
      try{localStorage.setItem('mra-question-flags-v1',JSON.stringify(questionFlags));}catch{saved=false;}
      form.querySelector('[data-flag-status]').textContent=saved?'Flag saved in this browser. Send it using the link below.':'Could not save locally. You can still send the report below.';
      form.querySelector('[data-flag-link]').innerHTML=`<a href="${escape(flagIssueUrl(q,reason,note))}" target="_blank" rel="noopener noreferrer">Review and send on GitHub</a>`;
    };
  });
}


// Fixed target mix; never duplicate a question or borrow from unchecked modules.
function teacherSelection(items, target = 10) {
  const eligible = [...new Map(items.filter(q => !q.cloze && q.examEligible !== false).map(q => [q.id,q])).values()];
  const teachers = shuffle(eligible.filter(q => q.starred));
  const regular = shuffle(eligible.filter(q => !q.starred));
  if (!teachers.length) return { qs: [], note: 'No teacher questions in the checked modules yet.' };
  const size = Math.min(target, eligible.length);
  let teacherCount = Math.min(teachers.length, Math.ceil(size * .8));
  let regularCount = Math.min(regular.length, size - teacherCount);
  teacherCount = Math.min(teachers.length, size - regularCount);
  regularCount = Math.min(regular.length, size - teacherCount);
  const qs = shuffle([...teachers.slice(0,teacherCount), ...regular.slice(0,regularCount)]).map(freshQuestion);
  return { qs, note: `${qs.length} questions · ${teacherCount} starred teacher + ${regularCount} regular study · checked modules only · immediate explanations · no life cutoff.` + (teacherCount !== 8 || regularCount !== 2 ? ' The mix is adjusted to the questions available in your checked modules.' : '') };
}



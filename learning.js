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
function confidenceControl(q) {
  if(!run || run.mode==='cards' || run.feedback && !isExam()) return '';
  return `<label class="confidence"><input type="checkbox" data-confidence="${escape(q.id)}" ${run.guesses?.[q.id]?'checked':''} ${run.locked||busy?'disabled':''}> I’m guessing / not confident</label><p class="small confidence-help">Correct guesses still earn the test points, but return for practice and do not advance mastery.</p>`;
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
function flagIssueUrl(q, reason, note) {
  const body=`Question ID: ${q.id}\nCourse: ${q.world}\nModule: ${q.topic}\nQuestion: ${q.prompt}\nSource: ${q.section}\n\nIssue: ${reason}\nDetails: ${note}\n\nSuggested correction / supporting slide:`;
  return 'https://github.com/chars0311/MRA-study-/issues/new?title='+encodeURIComponent('Question report: '+q.id)+'&body='+encodeURIComponent(body);
}
function flagControl(q) {
  const saved=questionFlags[q.id]||{};
  return `<details class="question-flag"><summary>${saved.reason?'⚑ Question flagged':'⚑ Flag this question'}</summary><form data-flag-form="${escape(q.id)}"><label>Reason<select name="reason">${['Unclear wording','Incorrect answer','Missing or unclear diagram','Duplicate question','Other'].map(r=>`<option ${saved.reason===r?'selected':''}>${r}</option>`).join('')}</select></label><label>Details<textarea name="note" maxlength="1500" rows="3">${escape(saved.note||'')}</textarea></label><button type="submit">Save flag</button><p data-flag-status role="status"></p><div data-flag-link>${saved.reason?`<a href="${escape(flagIssueUrl(q,saved.reason,saved.note||''))}" target="_blank" rel="noopener noreferrer">Review and send on GitHub</a>`:''}</div><p class="small">Saving keeps this flag in this browser. To send it to the site owner, open GitHub, review the report and submit it there (sign-in required).</p></form></details>`;
}
function bindLearning() {
  root.querySelectorAll('[data-confidence]').forEach(input=>{
    input.onchange=()=>{run.guesses??={};run.guesses[input.dataset.confidence]=input.checked;};
  });
  root.querySelectorAll('[data-flag-form]').forEach(form=>{
    form.onsubmit=e=>{
      e.preventDefault();
      const q=bank.questions.find(q=>q.id===form.dataset.flagForm);
      if(!q)return;
      const reason=form.elements.reason.value,note=form.elements.note.value.trim();
      questionFlags[q.id]={reason,note,at:new Date().toISOString()};
      let saved=true;
      try{localStorage.setItem('mra-question-flags-v1',JSON.stringify(questionFlags));}catch{saved=false;}
      form.querySelector('[data-flag-status]').textContent=saved?'Flag saved in this browser. Send it using the link below.':'Could not save locally. You can still send the report below.';
      form.querySelector('[data-flag-link]').innerHTML=`<a href="${escape(flagIssueUrl(q,reason,note))}" target="_blank" rel="noopener noreferrer">Review and send on GitHub</a>`;
    };
  });
}

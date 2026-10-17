// Preferences are local; question IDs and learning records are unchanged.
let poolQuery = "", poolTeacherFilter = "all";
const siteUpdated = "October 16, 2026";
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('mra-theme', theme); } catch {}
}
try {
  const savedTheme = localStorage.getItem('mra-theme');
  if (document.documentElement) applyTheme(['light', 'dark'].includes(savedTheme) ? savedTheme : 'dark');
} catch {}
function siteThemeButton() {
  const light = document.documentElement?.dataset.theme === 'light';
  return `<button id="theme-toggle" type="button" aria-label="Switch to ${light ? 'dark' : 'light'} mode">${light ? '☾ Dark' : '☀ Light'}</button>`;
}
function filterPoolQuestions(qs) {
  const needle = poolQuery.trim().toLocaleLowerCase();
  return qs.filter(q => (poolTeacherFilter === 'all' || Boolean(q.starred) === (poolTeacherFilter === 'teacher')) && (!needle || [q.prompt, q.topic, q.section, q.id, ...(q.variants || []).map(v => v.prompt)].join(' ').toLocaleLowerCase().includes(needle)));
}
function poolSearchControls() {
  return `<div class="pool-search"><label>Search questions<input id="pool-search" type="search" value="${escape(poolQuery)}" placeholder="Topic, keyword, or question ID"></label><label>Question source<select id="pool-teacher-filter"><option value="all" ${poolTeacherFilter === 'all' ? 'selected' : ''}>All questions</option><option value="teacher" ${poolTeacherFilter === 'teacher' ? 'selected' : ''}>Teacher questions</option><option value="regular" ${poolTeacherFilter === 'regular' ? 'selected' : ''}>Regular study questions</option></select></label></div>`;
}
function laterControl(q) {
  if (!isExam() || run.locked || run.finished) return '';
  const marked = Boolean(run.reviewLater?.[q.id]);
  return `<button type="button" data-review-later="${escape(q.id)}" aria-pressed="${marked}">${marked ? '⚑ Marked for later' : '⚑ Review this later'}</button>`;
}
function nextMarkedIndex() {
  if (!run) return -1;
  for (let step = 1; step <= run.qs.length; step++) {
    const i = (run.index + step) % run.qs.length;
    if (run.reviewLater?.[run.qs[i].id]) return i;
  }
  return -1;
}
function showDiagram(key, description, returnFocus) {
  const src = bank.slideImages?.[key];
  if (!src) return;
  document.getElementById('diagram-viewer')?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'diagram-viewer';
  dialog.setAttribute('aria-label', 'Enlarged question diagram');
  dialog.innerHTML = `<div class="viewer-toolbar"><b>Question diagram</b><button data-zoom="out" aria-label="Zoom out">−</button><button data-zoom="in" aria-label="Zoom in">+</button><button data-zoom="fit">Fit</button><button data-zoom="close" aria-label="Close diagram">Close ×</button></div><p class="small">Use + and − to zoom. Scroll or drag the scrollbars to view the diagram.</p><div class="viewer-stage"><img alt="${escape(description)}" src="${src}"></div>`;
  document.body.appendChild(dialog);
  const image = dialog.querySelector('img');
  const stage = dialog.querySelector('.viewer-stage');
  let zoom = 1, base = 700;
  const fit = () => { base = Math.min(image.naturalWidth || 700, stage.clientWidth - 24); zoom = 1; image.style.width = Math.max(1, base) + 'px'; };
  dialog.addEventListener('close', () => { dialog.remove(); if (returnFocus?.isConnected) returnFocus.focus(); });
  dialog.querySelectorAll('[data-zoom]').forEach(button => button.onclick = () => {
    if (button.dataset.zoom === 'close') { dialog.close(); return; }
    if (button.dataset.zoom === 'fit') { fit(); return; }
    zoom = Math.max(.5, Math.min(5, zoom * (button.dataset.zoom === 'in' ? 1.25 : .8)));
    image.style.width = base * zoom + 'px';
  });
  image.onload = fit;
  dialog.showModal();
  fit();
}
function bindSiteImprovements() {
  const toggle = el('theme-toggle');
  if (toggle) toggle.onclick = () => { applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); render(); };
  const search = el('pool-search');
  if (search) search.oninput = () => {
    const value = search.value, caret = search.selectionStart;
    poolQuery = value; render(); const next = el('pool-search'); next?.focus();
    try { next?.setSelectionRange(caret, caret); } catch {}
  };
  const teacher = el('pool-teacher-filter');
  if (teacher) teacher.onchange = () => { poolTeacherFilter = teacher.value; render(); };
  root.querySelectorAll('[data-review-later]').forEach(button => button.onclick = () => {
    run.reviewLater ??= {}; const id = button.dataset.reviewLater;
    run.reviewLater[id] = !run.reviewLater[id]; render();
  });
  const next = el('exam-next-marked');
  if (next) next.onclick = () => { const i = nextMarkedIndex(); if (i >= 0 && !run.locked) { run.index = i; render(); focusQuestion(); } };
  root.querySelectorAll('[data-zoom-image]').forEach(image => {
    const open = event => { event.preventDefault(); event.stopPropagation(); showDiagram(image.dataset.zoomImage, image.alt, image); };
    image.onclick = open;
    image.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') open(event); };
  });
}

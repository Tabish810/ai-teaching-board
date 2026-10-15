/* Glossary page: search, filters, A–Z, Roman Urdu toggle, font size, present mode,
   fullscreen, print and an on-screen pen for teaching. */
(function () {
  'use strict';
  const G = window.GLOSSARY;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const catMap = {}; G.cats.forEach(c => { catMap[c.id] = c; });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const terms = G.terms.slice().sort((a, b) => a.term.localeCompare(b.term));
  terms.forEach((t, i) => { t.idx = i; t.slug = 'term-' + t.term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); });

  let activeCat = 'all', query = '', visible = terms.slice();

  /* ---------- category pills ---------- */
  const pills = $('#catPills');
  const pill = (id, label, color, icon, count) =>
    '<button class="btn btn-sm rounded-pill cat-pill' + (id === 'all' ? ' active btn-dark' : ' btn-outline-secondary') + '" data-cat="' + id + '" style="--c:' + color + '">' +
    '<i class="bi ' + icon + ' me-1"></i>' + esc(label) + ' <span class="badge text-bg-light ms-1">' + count + '</span></button>';
  pills.innerHTML = pill('all', 'All terms', '#111827', 'bi-grid', terms.length) +
    G.cats.map(c => pill(c.id, c.label, c.color, c.icon, terms.filter(t => t.cat === c.id).length)).join('');
  $$('.cat-pill').forEach(b => b.addEventListener('click', () => { activeCat = b.dataset.cat; render(); }));

  /* ---------- cards ---------- */
  const grid = $('#termGrid');
  function card(t) {
    const c = catMap[t.cat];
    const r = t.ref;
    return '<div class="col fade-up"><article class="card h-100 shadow-sm term-card card-hover" id="' + t.slug + '" style="--cat:' + c.color + '">' +
      '<div class="card-body d-flex flex-column gap-3 p-4">' +
      '<div class="d-flex align-items-start justify-content-between gap-2">' +
      '<h3 class="term mb-0">' + esc(t.term) + '</h3>' +
      '<button class="btn btn-sm btn-outline-secondary flex-shrink-0 no-print" data-present="' + t.idx + '" title="Present this term"><i class="bi bi-easel"></i></button></div>' +
      '<div class="d-flex flex-wrap gap-2 small">' +
      '<span class="badge rounded-pill" style="background:' + c.color + '"><i class="bi ' + c.icon + ' me-1"></i>' + esc(c.label) + '</span>' +
      '<a class="badge rounded-pill text-bg-light text-decoration-none border" href="#lesson-' + t.lesson + '"><i class="bi bi-play-circle me-1"></i>Lesson ' + t.lesson + '</a></div>' +
      '<p class="mb-0">' + esc(t.d) + '</p>' +
      '<div class="example"><div class="small fw-bold text-uppercase mb-1" style="color:' + c.color + ';letter-spacing:.05em"><i class="bi bi-lightbulb me-1"></i>Example</div>' + esc(t.ex) + '</div>' +
      '<p class="ur mb-0"><i class="bi bi-translate me-1"></i>' + esc(t.ur) + '</p>' +
      '<div class="ref mt-auto"><i class="bi bi-book me-1"></i><span class="book">' + esc(r.book) + '</span><br>' +
      '<span><i class="bi bi-person me-1"></i>' + esc(r.author) + '</span> · ' + esc(r.pub) + ', ' + r.year + '</div>' +
      '</div></article></div>';
  }

  function render() {
    const q = query.trim().toLowerCase();
    visible = terms.filter(t => (activeCat === 'all' || t.cat === activeCat) &&
      (!q || (t.term + ' ' + t.d + ' ' + t.ex + ' ' + t.ur + ' ' + t.ref.book + ' ' + t.ref.author).toLowerCase().indexOf(q) !== -1));
    grid.innerHTML = visible.map(card).join('');
    $('#emptyState').classList.toggle('d-none', visible.length > 0);
    $('#resultCount').textContent = visible.length + ' of ' + terms.length + ' terms';
    $$('.cat-pill').forEach(b => {
      const on = b.dataset.cat === activeCat;
      b.classList.toggle('active', on);
      b.classList.toggle('btn-outline-secondary', !on);
      b.style.background = on ? (b.dataset.cat === 'all' ? '#111827' : catMap[b.dataset.cat].color) : '';
      b.style.borderColor = on ? 'transparent' : '';
    });
    $$('[data-present]').forEach(b => b.addEventListener('click', () => openPresent(+b.dataset.present)));
    renderAZ();
  }

  /* ---------- A–Z ---------- */
  function renderAZ() {
    const have = {};
    visible.forEach(t => { const L = t.term[0].toUpperCase(); if (!have[L]) have[L] = t.slug; });
    $('#azNav').innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(L =>
      have[L] ? '<a class="btn btn-sm btn-outline-primary" href="#' + have[L] + '">' + L + '</a>'
              : '<span class="btn btn-sm btn-outline-secondary disabled opacity-25">' + L + '</span>').join('');
  }

  $('#search').addEventListener('input', e => { query = e.target.value; render(); });

  /* ---------- toggles ---------- */
  $('#toggleUr').addEventListener('change', e => document.body.classList.toggle('hide-ur', !e.target.checked));
  let fs = 1;
  $('#gFontUp').addEventListener('click', () => { fs = Math.min(1.6, fs + 0.1); grid.style.setProperty('--gfs', fs + 'rem'); });
  $('#gFontDown').addEventListener('click', () => { fs = Math.max(0.85, fs - 0.1); grid.style.setProperty('--gfs', fs + 'rem'); });
  $('#btnPrint').addEventListener('click', () => window.print());


  /* ---------- present mode ---------- */
  const pModalEl = $('#presentModal');
  const pModal = bootstrap.Modal.getOrCreateInstance(pModalEl);
  let pIdx = 0;
  function showPresent() {
    const list = visible.length ? visible : terms;
    pIdx = (pIdx + list.length) % list.length;
    const t = list[pIdx], c = catMap[t.cat];
    $('#pAccent').style.background = c.color;
    $('#pCat').innerHTML = '<i class="bi ' + c.icon + ' me-1"></i>' + esc(c.label) + ' · Lesson ' + t.lesson;
    $('#pCat').style.color = c.color;
    $('#pTerm').textContent = t.term;
    $('#pDef').textContent = t.d;
    $('#pEx').textContent = t.ex;
    $('#pExBox').style.borderColor = c.color;
    $('#pUr').textContent = t.ur;
    $('#pRef').innerHTML = '<i class="bi bi-book me-2"></i><em>' + esc(t.ref.book) + '</em> · ' + esc(t.ref.author) + ' · ' + esc(t.ref.pub) + ', ' + t.ref.year;
    $('#pCount').textContent = (pIdx + 1) + ' / ' + list.length;
    const box = $('#pContent'); box.classList.remove('fade-up'); void box.offsetWidth; box.classList.add('fade-up');
  }
  function openPresent(globalIdx) {
    const list = visible.length ? visible : terms;
    const i = list.findIndex(t => t.idx === globalIdx);
    pIdx = i >= 0 ? i : 0;
    showPresent(); pModal.show();
  }
  $('#btnPresent').addEventListener('click', () => openPresent(visible.length ? visible[0].idx : 0));
  $('#pPrev').addEventListener('click', () => { pIdx--; showPresent(); });
  $('#pNext').addEventListener('click', () => { pIdx++; showPresent(); });

  /* ---------- on-screen pen ---------- */
  const inkCanvas = $('#pageInk');
  const dock = $('#inkDock');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const annot = new Annotator(inkCanvas, {
    width: window.innerWidth, height: window.innerHeight, res: dpr,
    toPoint: e => [e.clientX, e.clientY]
  });
  annot.color = '#E11D48'; annot.size = 4;
  window.addEventListener('resize', () => annot.resize(window.innerWidth, window.innerHeight));
  let inkOn = false, inkDown = false;
  function setInk(on) {
    inkOn = on;
    inkCanvas.classList.toggle('drawing', on);
    dock.classList.toggle('on', on);
    $('#btnInk').classList.toggle('active', on);
    if (!on) { annot.strokes = []; annot.redraw(); }
  }
  $('#btnInk').addEventListener('click', () => setInk(!inkOn));
  $('#inkClose').addEventListener('click', () => setInk(false));
  $('#inkClear').addEventListener('click', () => annot.clear());
  $('#inkUndo').addEventListener('click', () => annot.undo());
  $$('[data-ink-tool]').forEach(b => b.addEventListener('click', () => {
    annot.tool = b.dataset.inkTool;
    if (annot.tool === 'hl') annot.color = '#FDE047';
    else if (annot.color === '#FDE047') annot.color = '#E11D48';
    $$('[data-ink-tool]').forEach(x => x.classList.toggle('active', x === b));
  }));
  $$('[data-ink-color]').forEach(b => b.addEventListener('click', () => { annot.color = b.dataset.inkColor; if (annot.tool === 'erase') annot.tool = 'pen'; }));
  inkCanvas.addEventListener('pointerdown', e => { if (!inkOn) return; inkCanvas.setPointerCapture(e.pointerId); inkDown = true; annot.begin(e); });
  inkCanvas.addEventListener('pointermove', e => { if (inkDown) annot.move(e); });
  const up = () => { if (inkDown) { inkDown = false; annot.end(); } };
  inkCanvas.addEventListener('pointerup', up);
  inkCanvas.addEventListener('pointercancel', up);

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (document.body.dataset.view !== 'glossary') return;
    if (pModalEl.classList.contains('show')) {
      if (e.key === 'ArrowRight') { pIdx++; showPresent(); }
      if (e.key === 'ArrowLeft') { pIdx--; showPresent(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && inkOn) { e.preventDefault(); annot.undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'd') setInk(!inkOn);
    if (k === '/') { e.preventDefault(); $('#search').focus(); }
    if (e.key === 'Escape' && inkOn) setInk(false);
  });

  window.Glossary = { stopInk: () => setInk(false) };
  render();
})();

/* Lesson board controller: zoom/pan, drawing tools, laser, spotlight, blank board,
   step-by-step full-screen zoom, transcript panel, fullscreen and keyboard shortcuts. */
(function () {
  'use strict';
  const LESSONS = window.LESSONS;
  let L = null, LI = -1;
  const W = 1920, H = 1080;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const viewport = $('#viewport');
  const wrap = $('#stageWrap');
  let svg = null;
  const ink = $('#ink');
  const laserCanvas = $('#laser');
  const spot = $('#spotlight');
  const blank = $('#blankLayer');

  /* ---------------- toast ---------------- */
  const toastEl = $('#boardToast');
  const toast = toastEl ? bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 1600 }) : null;
  function notify(msg) { if (!toast) return; $('#boardToastMsg').textContent = msg; toast.show(); }

  /* ---------------- zoom & pan ---------------- */
  let scale = 1, tx = 0, ty = 0, fitScale = 1;
  function apply() {
    wrap.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    $('#zoomLabel').textContent = Math.round(scale / fitScale * 100) + '%';
  }
  let glideT = null;
  function glide(on) {
    clearTimeout(glideT);
    wrap.classList.toggle('glide', !!on);
    if (on) glideT = setTimeout(() => wrap.classList.remove('glide'), 750);
  }
  function computeFit() {
    const r = viewport.getBoundingClientRect();
    const pad = document.body.classList.contains('toolbar-hidden') ? 0 : (r.width < 700 ? 6 : 12);
    fitScale = Math.max(0.05, Math.min((r.width - pad * 2) / W, (r.height - pad * 2) / H));
    return r;
  }
  /* Whole picture, as big as the screen allows. */
  function fit(animate) {
    const r = computeFit();
    scale = fitScale;
    tx = (r.width - W * scale) / 2; ty = (r.height - H * scale) / 2;
    glide(animate === true); apply();
  }
  /* Zoom so that one area of the picture (stage coordinates) fills the screen. */
  function zoomTo(box, animate) {
    const r = computeFit();
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    const pw = bw + bw * 0.08 + 24, ph = bh + bh * 0.08 + 24;
    scale = Math.min(r.width / pw, r.height / ph, fitScale * 4);
    tx = r.width / 2 - (box.x0 + bw / 2) * scale;
    ty = r.height / 2 - (box.y0 + bh / 2) * scale;
    /* Keep the picture covering the screen: no empty band beside it when it is big enough to fill. */
    const clamp = (t, view, size) => (size <= view ? (view - size) / 2 : Math.min(0, Math.max(view - size, t)));
    tx = clamp(tx, r.width, W * scale); ty = clamp(ty, r.height, H * scale);
    glide(animate === true); apply();
  }
  function zoomAt(factor, cx, cy) {
    const r = viewport.getBoundingClientRect();
    if (cx === undefined) { cx = r.width / 2; cy = r.height / 2; }
    const ns = Math.min(fitScale * 6, Math.max(fitScale * 0.4, scale * factor));
    tx = cx - (cx - tx) * (ns / scale);
    ty = cy - (cy - ty) * (ns / scale);
    scale = ns; apply();
  }
  /* Re-frame the current step (after a resize, or to undo manual zooming). */
  function refit() { if (L) goStep(cur, false); else fit(); }
  window.addEventListener('resize', refit);

  /* ---------------- annotator ---------------- */
  function toPoint(e) {
    const r = wrap.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * W * 10) / 10, Math.round(((e.clientY - r.top) / r.height) * H * 10) / 10];
  }
  const keyFor = (mode) => 'aiboard:' + L.id + ':' + mode;
  const annot = new Annotator(ink, {
    width: W, height: H, res: 2, toPoint: toPoint, storageKey: null,
    onChange: updateUndo, onText: openTextInput
  });

  function updateUndo() {
    $('#btnUndo').disabled = annot.strokes.length === 0;
    $('#btnRedo').disabled = annot.redoStack.length === 0;
  }

  /* ---------------- tools ---------------- */
  const TOOL_NAMES = { hand: 'Move', pen: 'Pen', hl: 'Highlighter', erase: 'Eraser', arrow: 'Arrow', rect: 'Box', text: 'Text', laser: 'Laser' };
  const colorMemory = { pen: '#E11D48', hl: '#FDE047', arrow: '#2563EB', rect: '#16A34A', text: '#111827' };
  let tool = 'hand';
  function setTool(t) {
    tool = t;
    annot.tool = t;
    $$('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    viewport.className = 'viewport tool-' + t;
    if (colorMemory[t]) setColor(colorMemory[t], true);
    if (t !== 'laser') clearLaser();
  }
  function setColor(c, silent) {
    annot.color = c;
    if (colorMemory[tool] && !silent) colorMemory[tool] = c;
    $$('#boardView .swatch').forEach(s => s.classList.toggle('active', s.dataset.color.toLowerCase() === c.toLowerCase()));
  }
  $$('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $$('#boardView .swatch').forEach(s => s.addEventListener('click', () => {
    if (!Annotator.isDrawTool(tool)) setTool('pen');
    setColor(s.dataset.color);
  }));
  const sizeRange = $('#sizeRange');
  sizeRange.addEventListener('input', () => { annot.size = +sizeRange.value; });
  annot.size = +sizeRange.value;

  $('#btnUndo').addEventListener('click', () => annot.undo());
  $('#btnRedo').addEventListener('click', () => annot.redo());
  $('#btnClear').addEventListener('click', () => {
    if (!annot.count()) return;
    annot.clear(); notify('Drawings cleared (Ctrl+Z to bring back)');
  });

  /* ---------------- text tool ---------------- */
  let textInput = null;
  function openTextInput(p, e) {
    closeTextInput(true);
    const vr = viewport.getBoundingClientRect();
    textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'text-input-float';
    textInput.placeholder = 'Type, then Enter';
    textInput.style.left = (e.clientX - vr.left) + 'px';
    textInput.style.top = (e.clientY - vr.top - 18) + 'px';
    textInput.style.color = annot.color;
    textInput.style.fontSize = Math.max(14, (annot.size * 6 + 14) * scale) + 'px';
    viewport.appendChild(textInput);
    textInput.dataset.x = p[0]; textInput.dataset.y = p[1];
    setTimeout(() => textInput && textInput.focus(), 0);
    textInput.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Enter') closeTextInput(true);
      if (ev.key === 'Escape') closeTextInput(false);
    });
    textInput.addEventListener('blur', () => closeTextInput(true));
  }
  function closeTextInput(commit) {
    if (!textInput) return;
    const t = textInput; textInput = null;
    if (commit) annot.addText([+t.dataset.x, +t.dataset.y], t.value);
    t.remove();
  }

  /* ---------------- laser ---------------- */
  const lctx = laserCanvas.getContext('2d');
  laserCanvas.width = W; laserCanvas.height = H;
  let laserPts = [], laserRAF = null;
  function laserAdd(e) {
    laserPts.push({ p: toPoint(e), t: performance.now() });
    if (!laserRAF) laserRAF = requestAnimationFrame(laserLoop);
  }
  function laserLoop() {
    const now = performance.now();
    laserPts = laserPts.filter(o => now - o.t < 650);
    lctx.clearRect(0, 0, W, H);
    for (let i = 1; i < laserPts.length; i++) {
      const a = laserPts[i - 1], b = laserPts[i];
      const life = 1 - (now - b.t) / 650;
      lctx.strokeStyle = 'rgba(239,68,68,' + (life * 0.85).toFixed(3) + ')';
      lctx.lineWidth = 10 * life + 2; lctx.lineCap = 'round';
      lctx.beginPath(); lctx.moveTo(a.p[0], a.p[1]); lctx.lineTo(b.p[0], b.p[1]); lctx.stroke();
    }
    const last = laserPts[laserPts.length - 1];
    if (last) {
      const g = lctx.createRadialGradient(last.p[0], last.p[1], 0, last.p[0], last.p[1], 22);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(239,68,68,1)'); g.addColorStop(1, 'rgba(239,68,68,0)');
      lctx.fillStyle = g; lctx.beginPath(); lctx.arc(last.p[0], last.p[1], 22, 0, Math.PI * 2); lctx.fill();
    }
    laserRAF = laserPts.length ? requestAnimationFrame(laserLoop) : null;
  }
  function clearLaser() { laserPts = []; lctx.clearRect(0, 0, W, H); }

  /* ---------------- spotlight ---------------- */
  let spotOn = false, spotR = 190, spotX = -999, spotY = -999;
  function paintSpot() {
    spot.style.background = 'radial-gradient(circle ' + spotR + 'px at ' + spotX + 'px ' + spotY + 'px, transparent 0, transparent ' + (spotR - 2) + 'px, rgba(2,6,23,.78) ' + spotR + 'px)';
  }
  function toggleSpot(force) {
    spotOn = force !== undefined ? force : !spotOn;
    spot.classList.toggle('on', spotOn);
    $('#btnSpot').classList.toggle('active', spotOn);
    if (spotOn) { const r = viewport.getBoundingClientRect(); if (spotX < 0) { spotX = r.width / 2; spotY = r.height / 2; } paintSpot(); notify('Spotlight on: use [ and ] to resize'); }
  }
  $('#btnSpot').addEventListener('click', () => toggleSpot());

  /* ---------------- pointer handling (draw / pan / pinch) ---------------- */
  const pointers = new Map();
  let panning = false, panStart = null, pinch = null, spaceDown = false, drawing = false;

  viewport.addEventListener('pointerdown', e => {
    if (e.target === textInput) return;
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, e);
    if (pointers.size === 2) {
      if (drawing) { annot.cancel(); drawing = false; }
      const [a, b] = Array.from(pointers.values());
      pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s: scale };
      panning = false;
      return;
    }
    const useHand = tool === 'hand' || spaceDown || e.button === 1;
    if (useHand) {
      panning = true; panStart = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
      viewport.classList.add('dragging');
    } else if (tool === 'laser') {
      laserAdd(e);
    } else if (Annotator.isDrawTool(tool) && e.button === 0) {
      drawing = tool !== 'text';
      annot.begin(e);
    }
  });

  viewport.addEventListener('pointermove', e => {
    if (spotOn) { const r = viewport.getBoundingClientRect(); spotX = e.clientX - r.left; spotY = e.clientY - r.top; paintSpot(); }
    if (tool === 'laser' && (e.pointerType === 'mouse' || pointers.has(e.pointerId))) laserAdd(e);
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);
    if (pinch && pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const r = viewport.getBoundingClientRect();
      const cx = (a.clientX + b.clientX) / 2 - r.left, cy = (a.clientY + b.clientY) / 2 - r.top;
      zoomAt((pinch.s * d / pinch.d) / scale, cx, cy);
      return;
    }
    if (panning) {
      tx = panStart.tx + (e.clientX - panStart.x);
      ty = panStart.ty + (e.clientY - panStart.y);
      apply();
    } else if (drawing) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach(ev => annot.move(ev));
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drawing) { annot.end(); drawing = false; }
    if (panning && pointers.size === 0) { panning = false; viewport.classList.remove('dragging'); }
  }
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('pointerleave', () => { if (tool === 'laser') { /* trail fades */ } });

  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    if (spotOn && e.altKey) { spotR = Math.max(60, Math.min(600, spotR - e.deltaY * 0.3)); paintSpot(); return; }
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      zoomAt(f, e.clientX - r.left, e.clientY - r.top);
    } else { tx -= e.deltaX; ty -= e.deltaY; apply(); }
  }, { passive: false });

  /* Double-click a card (move tool) to make it fill the screen; double-click again to go back to the step. */
  let cardZoom = false;
  viewport.addEventListener('dblclick', e => {
    if (tool !== 'hand' || blankOn || !svg) return;
    if (cardZoom) { cardZoom = false; goStep(cur); return; }
    const vr = viewport.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), f = W / wr.width;
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find(el => svg.contains(el) && el !== svg);
    let box = null;
    for (let el = hit; el && el !== svg; el = el.parentNode) {
      const r = el.getBoundingClientRect();
      if (r.width >= vr.width * 0.12 && r.height >= vr.height * 0.12 && r.width < wr.width * 0.95) {
        box = { x0: (r.left - wr.left) * f, y0: (r.top - wr.top) * f, x1: (r.right - wr.left) * f, y1: (r.bottom - wr.top) * f };
        break;
      }
    }
    if (!box) { const x = (e.clientX - wr.left) * f, y = (e.clientY - wr.top) * f; box = { x0: x - 240, y0: y - 135, x1: x + 240, y1: y + 135 }; }
    cardZoom = true;
    zoomTo(box, true);
  });

  $('#btnZoomIn').addEventListener('click', () => zoomAt(1.2));
  $('#btnZoomOut').addEventListener('click', () => zoomAt(1 / 1.2));
  $('#btnFit').addEventListener('click', () => refit());
  $('#zoomLabel').addEventListener('click', () => refit());

  /* ---------------- blank board ---------------- */
  let blankOn = false;
  function setBlank(on) {
    blankOn = on;
    wrap.classList.toggle('blank', on);
    $('#btnBlank').classList.toggle('active', on);
    annot.switchKey(keyFor(on ? 'blank' : 'svg'));
    $('#stepControls').classList.toggle('opacity-50', on);
    if (on) fit(); else setTimeout(() => goStep(cur, false), 60);
    notify(on ? 'Blank board: your lesson drawings are saved separately' : 'Back to the lesson diagram');
  }
  $('#btnBlank').addEventListener('click', () => setBlank(!blankOn));
  $$('[data-bg]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    blank.className = 'blank-layer bg-' + b.dataset.bg;
    try { localStorage.setItem('aiboard:bg', b.dataset.bg); } catch (err) {}
    if (b.dataset.bg === 'chalk' || b.dataset.bg === 'dark') { colorMemory.pen = '#FFFFFF'; colorMemory.text = '#FFFFFF'; }
    else { colorMemory.pen = '#E11D48'; colorMemory.text = '#111827'; }
    if (!blankOn) setBlank(true);
    if (colorMemory[tool]) setColor(colorMemory[tool], true);
  }));
  try { const bg = localStorage.getItem('aiboard:bg'); if (bg) blank.className = 'blank-layer bg-' + bg; } catch (e) {}

  /* ---------------- steps ----------------
     Step 0 is the whole picture. Steps 1..N zoom into that step's area of the picture so it fills the screen.
     The picture's own step highlight never moves on by itself: it is held on the step the instructor chose,
     while the other animations (moving dots, typing, pulses) keep playing. */
  let STEP = 2, N = 1, T = 2, cur = 0;
  let paused = false, frozen = [];
  const anims = () => (svg && svg.getAnimations ? svg.getAnimations({ subtree: true }) : []);
  /* CSS animations whose loop length equals the whole step cycle are the step highlights. */
  const isCycle = a => { try { return Math.abs(a.effect.getTiming().duration - T * 1000) < 20; } catch (e) { return false; } };

  /* SMIL animations that follow the step cycle are replaced by fixed values for the chosen step. */
  function collectFrozen() {
    frozen = [];
    $$('animate', svg).forEach(el => {
      const dur = parseFloat(el.getAttribute('dur'));
      if (!(Math.abs(dur - T) < 0.01) || !el.getAttribute('values')) return;
      const vals = el.getAttribute('values').split(';').map(s => s.trim());
      const kt = el.getAttribute('keyTimes') ? el.getAttribute('keyTimes').split(';').map(Number) : vals.map((_, i) => i / Math.max(1, vals.length - 1));
      frozen.push({ target: el.parentNode, attr: el.getAttribute('attributeName'), vals: vals, kt: kt,
        discrete: el.getAttribute('calcMode') === 'discrete', begin: parseFloat(el.getAttribute('begin')) || 0 });
      el.remove();
    });
  }
  function valueAt(o, t) {
    const f = ((((t - o.begin) % T) + T) % T) / T;
    let i = 0;
    while (i < o.kt.length - 1 && f >= o.kt[i + 1]) i++;
    if (o.discrete || i >= o.vals.length - 1) return o.vals[i];
    const a = parseFloat(o.vals[i]), b = parseFloat(o.vals[i + 1]);
    if (isNaN(a) || isNaN(b) || /[^\d.\-\s]/.test(o.vals[i] + o.vals[i + 1])) return o.vals[i];
    return String(a + (b - a) * (f - o.kt[i]) / ((o.kt[i + 1] - o.kt[i]) || 1));
  }
  function holdAt(t) {
    anims().forEach(a => { if (isCycle(a)) { try { a.pause(); a.currentTime = t * 1000; } catch (e) {} } });
    frozen.forEach(o => o.target.setAttribute(o.attr, valueAt(o, t)));
  }

  function pauseAll() {
    anims().forEach(a => { try { a.pause(); } catch (e) {} });
    try { svg && svg.pauseAnimations(); } catch (e) {}
    paused = true; renderPlay();
  }
  function playAll() {
    anims().forEach(a => { if (!isCycle(a)) { try { a.play(); } catch (e) {} } });
    try { svg && svg.unpauseAnimations(); } catch (e) {}
    paused = false; renderPlay();
  }
  function renderPlay() {
    $('#btnPlay').innerHTML = paused ? '<i class="bi bi-play-fill"></i>' : '<i class="bi bi-pause-fill"></i>';
    $('#btnPlay').title = paused ? 'Play animation (K)' : 'Pause animation (K)';
    $('#pausedBadge').classList.toggle('d-none', !paused);
  }

  /* Bounding box (stage coordinates) of the highlight frame(s) that belong to step k. */
  function stepBox(k) {
    const d = (k - 1) * STEP, wr = wrap.getBoundingClientRect();
    if (!wr.width) return null;
    const f = W / wr.width;
    let box = null;
    $$('.spot', svg).forEach(el => {
      const ad = parseFloat(el.style.animationDelay || getComputedStyle(el).animationDelay) || 0;
      if (Math.abs(ad - d) > 0.05) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const b = { x0: (r.left - wr.left) * f, y0: (r.top - wr.top) * f, x1: (r.right - wr.left) * f, y1: (r.bottom - wr.top) * f };
      box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
    });
    return box;
  }

  function renderStep() {
    if (!L) return;
    const s = cur ? L.steps[cur - 1] : null;
    $('#stepLabel').innerHTML = s
      ? '<span class="step-dot" style="background:' + s.color + '"></span>Step ' + cur + '/' + N + ' · ' + s.name.replace(/</g, '&lt;')
      : '<i class="bi bi-image me-1"></i>Whole picture';
    $$('#stepMenu .dropdown-item').forEach((a, i) => a.classList.toggle('active', i === cur));
    $('#btnPrev').disabled = cur === 0;
    $('#btnNext').disabled = cur === N;
  }
  function goStep(k, animate) {
    if (!L || !svg) return;
    cur = Math.max(0, Math.min(N, k));
    cardZoom = false;
    svg.classList.toggle('overview', cur === 0);
    /* Hold late in the step window: its build-up is finished and its highlight frame is still on. */
    holdAt(cur === 0 ? T - STEP * 0.22 : (cur - 1) * STEP + STEP * 0.78);
    renderStep();
    if (blankOn) return;
    const box = cur ? stepBox(cur) : null;
    if (box) zoomTo(box, animate !== false); else fit(animate !== false);
  }
  function stepBy(d) { if (!blankOn) goStep(cur + d); }
  $('#btnPlay').addEventListener('click', () => (paused ? playAll() : pauseAll()));
  $('#btnOverview').addEventListener('click', () => { if (!blankOn) goStep(0); });
  $('#btnPrev').addEventListener('click', () => stepBy(-1));
  $('#btnNext').addEventListener('click', () => stepBy(1));

  /* ---------------- fullscreen / focus ---------------- */
  document.addEventListener('fullscreenchange', () => setTimeout(refit, 150));
  function toggleToolbar() { document.body.classList.toggle('toolbar-hidden'); setTimeout(refit, 60); notify(document.body.classList.contains('toolbar-hidden') ? 'Focus mode: press H to show the toolbar and sidebar' : 'Toolbar shown'); }
  $('#btnHideTb').addEventListener('click', toggleToolbar);

  /* ---------------- transcript ---------------- */
  const tBody = $('#transcriptBody');
  let tLang = 0, tFont = 1;
  function renderTranscript() {
    if (!L) return;
    const tr = L.transcripts[tLang];
    tBody.innerHTML = window.marked ? marked.parse(tr.md) : '<pre style="white-space:pre-wrap">' + tr.md.replace(/[<&]/g, c => (c === '<' ? '&lt;' : '&amp;')) + '</pre>';
    $$('[data-lang]').forEach(b => b.classList.toggle('active', +b.dataset.lang === tLang));
    tBody.parentElement.scrollTop = 0;
  }
  $('#tFontUp').addEventListener('click', () => { tFont = Math.min(1.8, tFont + 0.1); tBody.style.setProperty('--tfs', tFont + 'rem'); });
  $('#tFontDown').addEventListener('click', () => { tFont = Math.max(0.8, tFont - 0.1); tBody.style.setProperty('--tfs', tFont + 'rem'); });
  let scrollTimer = null;
  $('#tAutoScroll').addEventListener('change', e => {
    clearInterval(scrollTimer);
    if (e.target.checked) scrollTimer = setInterval(() => { tBody.parentElement.scrollTop += +$('#tSpeed').value / 10; }, 50);
  });
  $('#tPopout').addEventListener('click', () => {
    const tr = L.transcripts[tLang];
    const w = window.open('', 'transcript_' + L.id, 'width=720,height=900');
    if (!w) { notify('Allow pop-ups to open the presenter notes window'); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Notes · ' + L.title + '</title>' +
      '<style>body{font-family:Inter,Segoe UI,Arial,sans-serif;padding:28px;line-height:1.7;font-size:1.15rem;max-width:860px;margin:auto}' +
      'h2{color:#4F46E5;font-weight:800;margin-top:1.4em}h3{font-weight:800;border-top:1px solid #ddd;padding-top:.8em;margin-top:1.3em}' +
      'blockquote{border-left:4px solid #4F46E5;background:#f5f5ff;padding:.5em 1em}hr{display:none}</style></head><body>' +
      (window.marked ? marked.parse(tr.md) : tr.md) + '</body></html>');
    w.document.close();
  });
  const panelEl = $('#transcriptPanel');
  const panel = bootstrap.Offcanvas.getOrCreateInstance(panelEl);

  /* ---------------- export PNG ---------------- */
  $('#btnExport').addEventListener('click', () => {
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const o = out.getContext('2d');
    const finish = () => {
      o.drawImage(ink, 0, 0, W, H);
      const a = document.createElement('a');
      a.download = L.id + (blankOn ? '-board' : '-annotated') + '.png';
      a.href = out.toDataURL('image/png'); a.click();
      notify('Image downloaded');
    };
    if (blankOn) {
      const bg = getComputedStyle(blank);
      o.fillStyle = bg.backgroundColor && bg.backgroundColor !== 'rgba(0, 0, 0, 0)' ? bg.backgroundColor : '#ffffff';
      if (blank.classList.contains('bg-chalk')) o.fillStyle = '#244a37';
      o.fillRect(0, 0, W, H); finish();
    } else {
      const xml = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.onload = () => { o.fillStyle = '#FBFAF5'; o.fillRect(0, 0, W, H); o.drawImage(img, 0, 0, W, H); finish(); };
      img.onerror = () => { o.fillStyle = '#FBFAF5'; o.fillRect(0, 0, W, H); finish(); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    }
  });


  /* ---------------- keyboard ---------------- */
  const helpModal = bootstrap.Modal.getOrCreateInstance($('#helpModal'));
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    if (document.body.dataset.view !== 'board') return;
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? annot.redo() : annot.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) { e.preventDefault(); annot.redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const map = { v: 'hand', p: 'pen', m: 'hl', e: 'erase', a: 'arrow', r: 'rect', t: 'text', l: 'laser' };
    const lk = k.toLowerCase();
    if (map[lk]) { setTool(map[lk]); return; }
    if (k === ' ') { if (!spaceDown) { spaceDown = true; viewport.classList.add('tool-hand'); } e.preventDefault(); return; }
    if (lk === 'k') return paused ? playAll() : pauseAll();
    if (lk === 's') return toggleSpot();
    if (lk === 'b') return setBlank(!blankOn);
    if (lk === 'h') return toggleToolbar();
    if (lk === 'n') return panel.toggle();
    if (k === '?' || k === '/') return helpModal.show();
    if (k === 'PageDown' || k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); return stepBy(1); }
    if (k === 'PageUp' || k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); return stepBy(-1); }
    if (k === 'Home' || lk === 'o') { e.preventDefault(); return blankOn ? undefined : goStep(0); }
    if (k === 'End') { e.preventDefault(); return blankOn ? undefined : goStep(N); }
    if (k === '+' || k === '=') return zoomAt(1.2);
    if (k === '-' || k === '_') return zoomAt(1 / 1.2);
    if (k === '0') return refit();
    if (k === '[' || k === ']') {
      const d = k === ']' ? 1 : -1;
      if (spotOn) { spotR = Math.max(60, Math.min(600, spotR + d * 30)); paintSpot(); }
      else { sizeRange.value = Math.max(1, Math.min(12, +sizeRange.value + d)); annot.size = +sizeRange.value; notify('Brush size ' + sizeRange.value); }
      return;
    }
    if (/^[1-7]$/.test(k)) { const sw = $$('.swatch')[+k - 1]; if (sw) sw.click(); return; }
    if (k === 'Delete' || k === 'Backspace') { $('#btnClear').click(); return; }
    if (k === 'Escape') { setTool('hand'); toggleSpot(false); }
  });
  document.addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; viewport.className = 'viewport tool-' + tool; } });

  /* ---------------- lesson switching (no page reload, so full screen stays on) ---------------- */
  function buildStepMenu() {
    const menu = $('#stepMenu');
    menu.innerHTML = '<li><a class="dropdown-item" href="#" data-step="0"><i class="bi bi-image me-2"></i>Whole picture</a></li><li><hr class="dropdown-divider"></li>' +
      L.steps.map((s, i) => '<li><a class="dropdown-item" href="#" data-step="' + (i + 1) + '"><span class="step-dot" style="background:' + s.color + '"></span>' +
        (i + 1) + '. ' + s.name.replace(/</g, '&lt;') + '</a></li>').join('');
    $$('[data-step]', menu).forEach(a => a.addEventListener('click', e => { e.preventDefault(); if (!blankOn) goStep(+a.dataset.step); }));
  }
  function buildLangs() {
    const g = $('#langGroup');
    g.innerHTML = L.transcripts.map((t, i) => '<button class="btn btn-outline-primary btn-sm" data-lang="' + i + '">' + t.label + '</button>').join('');
    $$('[data-lang]', g).forEach(b => b.addEventListener('click', () => { tLang = +b.dataset.lang; renderTranscript(); }));
  }
  function load(i) {
    if (i === LI) return;
    closeTextInput(false);
    annot.cancel();
    LI = i; L = LESSONS[i];
    const old = $('#stageWrap > svg'); if (old) old.remove();
    wrap.insertAdjacentHTML('afterbegin', L.svg);
    svg = $('#stageWrap > svg');
    /* The picture's own bottom caption bar (step names that switched by themselves, plus progress dots) is the
       last thing in every lesson picture: mark it and everything after it so CSS hides it. */
    $$('rect[y="962"][height="84"]', svg).forEach(r => { for (let n = r; n; n = n.nextElementSibling) n.classList.add('capbar'); });
    STEP = L.stepDur; N = L.steps.length; T = STEP * N;
    collectFrozen();
    paused = false; renderPlay();
    if (blankOn) { blankOn = false; wrap.classList.remove('blank'); $('#btnBlank').classList.remove('active'); $('#stepControls').classList.remove('opacity-50'); }
    annot.switchKey(keyFor('svg'));
    $('#lessonBadge').textContent = 'Lesson ' + L.num;
    $('#lessonTitle').textContent = L.title;
    $('#btnPrevLesson').disabled = i === 0;
    $('#btnNextLesson').disabled = i === LESSONS.length - 1;
    document.title = 'Lesson ' + L.num + ' · ' + L.short + ' · AI Teaching Board';
    buildStepMenu();
    tLang = 0; buildLangs(); renderTranscript();
    goStep(0, false);
  }
  $('#btnPrevLesson').addEventListener('click', () => { if (LI > 0) location.hash = 'lesson-' + LI; });
  $('#btnNextLesson').addEventListener('click', () => { if (LI < LESSONS.length - 1) location.hash = 'lesson-' + (LI + 2); });

  setTool('hand');
  updateUndo();
  renderPlay();
  window.Board = { load: load, fit: refit, notify: notify, current: () => LI };
})();

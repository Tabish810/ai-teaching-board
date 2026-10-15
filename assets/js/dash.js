/* Dashboard shell: sidebar, view routing (#lesson-1..3, #glossary), full screen and theme.
   Everything happens in one page, so full screen and screen sharing are never interrupted. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const sidebar = $('#sidebar');
  const N = window.LESSONS.length;

  /* ---------- theme ---------- */
  window.AIBoardTheme && window.AIBoardTheme.bind('.js-theme');

  /* ---------- sidebar collapse ---------- */
  try { if (localStorage.getItem('aiboard:sb') === '1') sidebar.classList.add('collapsed'); } catch (e) {}
  function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    try { localStorage.setItem('aiboard:sb', sidebar.classList.contains('collapsed') ? '1' : '0'); } catch (e) {}
    setTimeout(() => window.Board && Board.fit(), 230);
  }
  $('#sbToggle').addEventListener('click', toggleSidebar);

  /* ---------- full screen ---------- */
  function toggleFS() {
    const d = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) (d.requestFullscreen || d.webkitRequestFullscreen || function () {}).call(d);
    else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
  function onFS() {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle('is-fs', on);
    $$('.js-fs').forEach(b => { b.innerHTML = on ? '<i class="bi bi-fullscreen-exit"></i>' : '<i class="bi bi-arrows-fullscreen"></i>'; b.title = on ? 'Exit full screen (F)' : 'Full screen (F)'; });
    $$('.js-fs-label').forEach(l => { l.textContent = on ? 'Exit full screen' : 'Full screen'; });
  }
  document.addEventListener('fullscreenchange', onFS);
  document.addEventListener('webkitfullscreenchange', onFS);
  $$('.js-fs, .js-fs-btn').forEach(b => b.addEventListener('click', toggleFS));

  /* ---------- views ---------- */
  function route() {
    const h = (location.hash || '').replace('#', '');
    let view = 'board', idx = 0;
    const m = h.match(/^lesson-(\d+)$/);
    if (h === 'glossary') view = 'glossary';
    else if (m) idx = Math.min(N - 1, Math.max(0, +m[1] - 1));
    document.body.dataset.view = view;
    $('#boardView').classList.toggle('d-none', view !== 'board');
    $('#glossaryView').classList.toggle('d-none', view !== 'glossary');
    $$('.sb-item[data-target]').forEach(a => a.classList.toggle('active', a.dataset.target === (view === 'glossary' ? 'glossary' : 'lesson-' + (idx + 1))));
    if (view === 'board') {
      window.Glossary && Glossary.stopInk();
      Board.load(idx);
      requestAnimationFrame(() => Board.fit());
      setTimeout(() => Board.fit(), 250);
    } else {
      document.title = 'Glossary · AI Teaching Board';
    }
  }
  window.addEventListener('hashchange', route);

  /* ---------- global keys ---------- */
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'f' || e.key === 'F') { toggleFS(); }
    if (e.key === '\\') { toggleSidebar(); }
  });

  window.Dash = { toggleFS: toggleFS };
  route();
})();

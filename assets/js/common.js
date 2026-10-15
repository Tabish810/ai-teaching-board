/* Shared helpers: light/dark theme with a remembered choice. */
(function () {
  'use strict';
  function get() { try { return localStorage.getItem('aiboard:theme'); } catch (e) { return null; } }
  function set(t) { try { localStorage.setItem('aiboard:theme', t); } catch (e) {} }
  function apply(t) {
    document.documentElement.setAttribute('data-bs-theme', t);
    document.querySelectorAll('.theme-icon').forEach(function (i) { i.className = 'theme-icon bi ' + (t === 'dark' ? 'bi-sun-fill' : 'bi-moon-stars-fill'); });
  }
  const saved = get();
  const initial = saved || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  apply(initial);
  window.AIBoardTheme = {
    bind: function (sel) {
      document.querySelectorAll(sel).forEach(function (b) {
        b.addEventListener('click', function () {
          const t = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
          apply(t); set(t);
        });
      });
      apply(document.documentElement.getAttribute('data-bs-theme'));
    }
  };
})();

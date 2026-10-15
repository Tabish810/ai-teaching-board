/* Annotator: a small drawing engine used by the lesson boards and the glossary.
   Tools: pen, hl (highlighter), erase, arrow, rect, text. Strokes are stored as data,
   so undo/redo/save are simple and drawings stay sharp when the board is zoomed. */
(function () {
  'use strict';

  class Annotator {
    constructor(canvas, opts) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.res = opts.res || 2;
      this.toPoint = opts.toPoint;
      this.key = opts.storageKey || null;
      this.onChange = opts.onChange || function () {};
      this.onText = opts.onText || null;
      this.strokes = [];
      this.redoStack = [];
      this.active = null;
      this.tool = 'pen';
      this.color = '#E11D48';
      this.size = 4;
      this.resize(opts.width, opts.height);
      this.load();
    }

    resize(w, h) {
      this.w = w; this.h = h;
      this.c.width = Math.round(w * this.res);
      this.c.height = Math.round(h * this.res);
      this.redraw();
    }

    static isDrawTool(t) { return ['pen', 'hl', 'erase', 'arrow', 'rect', 'text'].indexOf(t) !== -1; }

    begin(e) {
      const p = this.toPoint(e);
      if (this.tool === 'text') { if (this.onText) this.onText(p, e); return; }
      this.active = { type: this.tool, color: this.color, size: this.size, points: [p] };
      this.redraw();
    }

    move(e) {
      if (!this.active) return;
      const p = this.toPoint(e);
      if (this.active.type === 'arrow' || this.active.type === 'rect') this.active.points[1] = p;
      else this.active.points.push(p);
      this.redraw();
    }

    end() {
      if (!this.active) return;
      const s = this.active;
      this.active = null;
      const shape = s.type === 'arrow' || s.type === 'rect';
      if (!shape || s.points.length > 1) { this.strokes.push(s); this.redoStack = []; }
      this.redraw(); this.save(); this.onChange();
    }

    cancel() { this.active = null; this.redraw(); }

    addText(p, text) {
      if (!text || !text.trim()) return;
      this.strokes.push({ type: 'text', color: this.color, size: this.size, points: [p], text: text });
      this.redoStack = [];
      this.redraw(); this.save(); this.onChange();
    }

    undo() { if (!this.strokes.length) return; this.redoStack.push(this.strokes.pop()); this.redraw(); this.save(); this.onChange(); }
    redo() { if (!this.redoStack.length) return; this.strokes.push(this.redoStack.pop()); this.redraw(); this.save(); this.onChange(); }
    clear() { if (!this.strokes.length) return; this.redoStack = this.strokes.slice().reverse(); this.strokes = []; this.redraw(); this.save(); this.onChange(); }
    count() { return this.strokes.length; }

    switchKey(key) { this.save(); this.key = key; this.strokes = []; this.redoStack = []; this.load(); this.onChange(); }

    save() {
      if (!this.key) return;
      try { localStorage.setItem(this.key, JSON.stringify(this.strokes)); } catch (e) { /* storage unavailable */ }
    }

    load() {
      if (!this.key) { this.redraw(); return; }
      try {
        const raw = localStorage.getItem(this.key);
        this.strokes = raw ? JSON.parse(raw) : [];
      } catch (e) { this.strokes = []; }
      this.redraw();
    }

    redraw() {
      const ctx = this.ctx;
      ctx.setTransform(this.res, 0, 0, this.res, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      for (const s of this.strokes) this.draw(s);
      if (this.active) this.draw(this.active);
    }

    draw(s) {
      const ctx = this.ctx;
      const pts = s.points;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      if (s.type === 'pen' || s.type === 'hl' || s.type === 'erase') {
        let w = s.size;
        if (s.type === 'hl') { w = s.size * 5 + 6; ctx.globalAlpha = 0.35; ctx.lineCap = 'butt'; }
        if (s.type === 'erase') { w = s.size * 5 + 10; ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'; }
        ctx.lineWidth = w;
        if (pts.length === 1) {
          ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], w / 2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length - 1; i++) {
            const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
            ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
          }
          const last = pts[pts.length - 1];
          ctx.lineTo(last[0], last[1]);
          ctx.stroke();
        }
      } else if (s.type === 'arrow' && pts.length > 1) {
        const [a, b] = pts;
        const w = Math.max(2, s.size);
        ctx.lineWidth = w;
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const head = Math.max(14, w * 4);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0] - Math.cos(ang) * head * 0.6, b[1] - Math.sin(ang) * head * 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(b[0], b[1]);
        ctx.lineTo(b[0] - head * Math.cos(ang - 0.45), b[1] - head * Math.sin(ang - 0.45));
        ctx.lineTo(b[0] - head * Math.cos(ang + 0.45), b[1] - head * Math.sin(ang + 0.45));
        ctx.closePath(); ctx.fill();
      } else if (s.type === 'rect' && pts.length > 1) {
        const [a, b] = pts;
        const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
        const w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
        const r = Math.min(14, w / 2, h / 2);
        ctx.lineWidth = Math.max(2, s.size);
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.stroke();
      } else if (s.type === 'text') {
        const fs = s.size * 6 + 14;
        ctx.font = '700 ' + fs + 'px Inter, "Segoe UI", Arial, sans-serif';
        ctx.textBaseline = 'middle';
        const lines = String(s.text).split('\n');
        lines.forEach(function (ln, i) { ctx.fillText(ln, pts[0][0], pts[0][1] + i * fs * 1.2); });
      }
      ctx.restore();
    }
  }

  window.Annotator = Annotator;
})();

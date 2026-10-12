(function () {
  const PH = window.PH;
  const RAD = 180 / Math.PI;
  const INK = '#e8eef5';
  const MUT = '#93a3b5';
  const ACC = '#4ea1ff';
  const ACC2 = '#ffb454';
  const OK = '#5ddc9a';
  const BAD = '#ff6b6b';
  const SOFT = 'rgba(78,161,255,0.16)';
  const FAINT = 'rgba(255,255,255,0.22)';

  const BODIES = [
    { id: 'point', sel: true, name: 'نقطه‌ای', formula: 'نقطه‌ای — I = mr²', k: 1, kind: 'point', dim: 'R' },
    { id: 'disc', sel: true, name: 'قرص توپر', formula: 'قرص توپر — I = ½mR²', k: 0.5, kind: 'disc', dim: 'R' },
    { id: 'cylinder', sel: true, name: 'استوانه توپر', formula: 'استوانه توپر — I = ½mR²', k: 0.5, kind: 'disc', dim: 'R' },
    { id: 'hoop', sel: true, name: 'لوله نازک', formula: 'لوله نازک — I = mR²', k: 1, kind: 'hoop', dim: 'R' },
    { id: 'rod', sel: true, name: 'میله از وسط', formula: 'میله از وسط — I = (1/12)mL²', k: 1 / 12, kind: 'rod', dim: 'L' },
    { id: 'rodEnd', sel: false, name: 'میله از یک سر', formula: 'میله از یک سر — I = (1/3)mL²', k: 1 / 3, kind: 'rod', dim: 'L' },
    { id: 'sphere', sel: true, name: 'کره توپر', formula: 'کره توپر — I = (2/5)mR²', k: 0.4, kind: 'sphere', dim: 'R' },
    { id: 'shell', sel: true, name: 'کره توافته', formula: 'کره توافته — I = (2/3)mR²', k: 2 / 3, kind: 'sphere', dim: 'R' }
  ];

  let scenes = [];
  let byEl = new Map();
  let io = null;
  let rafId = 0;
  let prevTs = 0;

  function syncLoop() {
    if (rafId) return;
    for (let i = 0; i < scenes.length; i++) {
      if (scenes[i].active) {
        prevTs = 0;
        rafId = requestAnimationFrame(tick);
        return;
      }
    }
  }

  function tick(now) {
    rafId = 0;
    const dt = prevTs ? Math.min((now - prevTs) / 1000, 0.05) : 0;
    prevTs = now;
    let need = false;
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (!s.active) continue;
      need = true;
      s.t += dt;
      s.render(s);
    }
    if (need) rafId = requestAnimationFrame(tick);
  }

  function addScene(view, render) {
    const s = { view: view, render: render, t: 0, active: false };
    scenes.push(s);
    byEl.set(view.canvas, s);
    if (io) io.observe(view.canvas);
    else s.active = true;
    return s;
  }

  function begin(v) {
    const s = v.resize() || v.size() || {};
    const w = s.w || s.width || v.canvas.clientWidth || 640;
    const h = s.h || s.height || v.canvas.clientHeight || 340;
    v.clear(w, h);
    v.grid({ axes: false });
    return { w: w, h: h, ctx: v.ctx };
  }

  function line(ctx, x1, y1, x2, y2, col, wid) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = col || MUT;
    ctx.lineWidth = wid || 2;
    ctx.stroke();
  }

  function dashed(ctx, x1, y1, x2, y2, col, wid) {
    ctx.save();
    ctx.setLineDash([6, 5]);
    line(ctx, x1, y1, x2, y2, col, wid);
    ctx.restore();
  }

  function arrow(ctx, x1, y1, x2, y2, col, wid) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const d = Math.hypot(x2 - x1, y2 - y1);
    const L = Math.max(9, Math.min(17, d * 0.38));
    ctx.save();
    line(ctx, x1, y1, x2, y2, col, wid || 2.5);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - L * Math.cos(a - 0.42), y2 - L * Math.sin(a - 0.42));
    ctx.lineTo(x2 - L * Math.cos(a + 0.42), y2 - L * Math.sin(a + 0.42));
    ctx.closePath();
    ctx.fillStyle = col || MUT;
    ctx.fill();
    ctx.restore();
  }

  function circle(ctx, x, y, r, col, fill, wid) {
    ctx.beginPath();
    ctx.arc(x, y, Math.abs(r), 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = col || MUT;
    ctx.lineWidth = wid || 2;
    ctx.stroke();
  }

  function dot(ctx, x, y, r, col) {
    circle(ctx, x, y, r, col, col, 1);
  }

  function arcStroke(ctx, cx, cy, r, a0, a1, col, wid) {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.abs(r), a0, a1, a1 < a0);
    ctx.strokeStyle = col || MUT;
    ctx.lineWidth = wid || 2;
    ctx.stroke();
  }

  function arcArrow(ctx, cx, cy, r, a0, a1, col) {
    arcStroke(ctx, cx, cy, r, a0, a1, col, 2.5);
    const dir = a1 >= a0 ? 1 : -1;
    const ex = cx + r * Math.cos(a1);
    const ey = cy + r * Math.sin(a1);
    const t = a1 + (Math.PI / 2) * dir;
    arrow(ctx, ex, ey, ex + 15 * Math.cos(t), ey + 15 * Math.sin(t), col, 2.5);
  }

  function txt(ctx, s, x, y, col, size, align) {
    ctx.save();
    ctx.fillStyle = col || INK;
    ctx.font = (size || 13) + 'px Vazirmatn, Tahoma, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  function oneTurn(a) {
    const t = 2 * Math.PI;
    return a - t * Math.floor(a / t);
  }

  function phase(s, total) {
    if (!(total > 0)) return total;
    return s.t % total;
  }

  function note(host, text) {
    host.appendChild(PH.el('div', { class: 'ph-note', text: text }));
  }

  function formula(host, text) {
    host.appendChild(PH.el('div', { class: 'ph-formula', text: text }));
  }

  function badge(host, text) {
    const b = PH.el('span', { class: 'ph-badge badge-good', text: text });
    host.appendChild(b);
    return { el: b, set: function (t) { b.textContent = t; } };
  }

  function slider(label, unit, min, max, step, value, onInput) {
    return PH.control({ label: label, unit: unit, min: min, max: max, step: step, value: value, type: 'range', onInput: onInput });
  }

  function drawBody(ctx, kind, R) {
    if (kind === 'point') {
      dot(ctx, 0, 0, Math.max(5, R * 0.18), ACC2);
      return;
    }
    if (kind === 'rod') {
      const t = Math.max(3, R * 0.09);
      ctx.save();
      ctx.fillStyle = SOFT;
      ctx.strokeStyle = ACC;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-R, -t, 2 * R, 2 * t);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (kind === 'hoop') {
      circle(ctx, 0, 0, R, ACC, 'rgba(255,255,255,0.03)', 4);
      circle(ctx, 0, 0, R * 0.55, FAINT, null, 1);
      return;
    }
    if (kind === 'sphere') {
      circle(ctx, 0, 0, R, ACC, 'rgba(78,161,255,0.12)', 2);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, R, R * 0.3, 0, 0, Math.PI * 2);
      ctx.strokeStyle = FAINT;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      return;
    }
    circle(ctx, 0, 0, R, ACC, SOFT, 2);
  }

  function exp1(host) {
    const card = PH.panel('آزمایش 1 — سینماتیک دورانی', '');
    host.appendChild(card);
    formula(card.body, 'ω = ω₀ + αt ، θ = ω₀t + ½αt² ، ω² = ω₀² + 2αθ');
    note(card.body, 'با تغییر سرعت زاویه‌ای اولیه و شتاب، زاویه و سرعت زاویه‌ای در لحظه t محاسبه و روی قرص چرخان نمایش داده می‌شود.');
    const g = PH.grid(card.body, 2);
    let changed = function () {};
    const w0 = slider('سرعت زاویه‌ای اولیه ω₀', 'rad/s', 0, 20, 0.1, 4, function () { changed(); });
    const al = slider('شتاب زاویه‌ای α', 'rad/s²', -10, 10, 0.1, 2, function () { changed(); });
    const tt = slider('زمان t', 's', 0, 20, 0.1, 3, function () { changed(); });
    const rr = slider('شعاع r', 'm', 0.1, 3, 0.05, 1, function () { changed(); });
    g.appendChild(w0.root);
    g.appendChild(al.root);
    g.appendChild(tt.root);
    g.appendChild(rr.root);
    const out = PH.readout([
      { k: 'ω = ω₀ + αt', v: '-', unit: 'rad/s' },
      { k: 'θ = ω₀t + ½αt²', v: '-', unit: 'rad' },
      { k: 'ω² از رابطه زاویه‌ای', v: '-', unit: 'rad²/s²' },
      { k: 'ω₀² + 2αθ (بررسی)', v: '-', unit: 'rad²/s²' },
      { k: 'تعداد دور کامل', v: '-', unit: 'دور' },
      { k: 'سرعت خطی v = ωr', v: '-', unit: 'm/s' }
    ]);
    card.body.appendChild(out);
    const view = PH.canvas(card.body, { height: 340 });
    const s = addScene(view, render);

    function render(s) {
      const g2 = begin(view);
      const ctx = g2.ctx;
      const a = w0.get();
      const b = al.get();
      const T = tt.get();
      const p = phase(s, T);
      const cx = g2.w / 2;
      const cy = g2.h / 2;
      const R = Math.min(g2.w, g2.h) * 0.34;
      const end = a * T + 0.5 * b * T * T;
      const now = a * p + 0.5 * b * p * p;
      circle(ctx, cx, cy, R, ACC, 'rgba(78,161,255,0.08)', 2);
      arcStroke(ctx, cx, cy, R, 0, oneTurn(end), 'rgba(255,180,84,0.5)', 5);
      arcStroke(ctx, cx, cy, R * 0.42, 0, oneTurn(now), ACC2, 3);
      circle(ctx, cx, cy, 7, MUT, '#0d141d', 2);
      arrow(ctx, cx, cy, cx + R * Math.cos(now), cy + R * Math.sin(now), ACC, 3);
      dot(ctx, cx + R * Math.cos(now), cy + R * Math.sin(now), 5, ACC);
      txt(ctx, 'θ(t) = ' + PH.num(now, 3) + ' rad  =  ' + PH.num(now * RAD, 1) + '°', cx, 26, INK, 14, 'center');
      txt(ctx, 'θ(T) = ' + PH.num(end, 3) + ' rad  =  ' + PH.num(end * RAD, 1) + '°', cx, g2.h - 26, ACC2, 13, 'center');
      txt(ctx, 'ω(T) = ' + PH.num(a + b * T, 3) + ' rad/s', cx, g2.h - 8, MUT, 12, 'center');
      txt(ctx, 'دور کامل: ' + PH.num(Math.abs(end) / (2 * Math.PI), 3), cx, 8, MUT, 12, 'center');
    }

    function update() {
      const a = w0.get();
      const b = al.get();
      const T = tt.get();
      const r = rr.get();
      const om = a + b * T;
      const th = a * T + 0.5 * b * T * T;
      out.update([
        { k: 'ω = ω₀ + αt', v: PH.num(om, 3) + '  (' + PH.num(om * RAD, 1) + '°/s)', unit: 'rad/s' },
        { k: 'θ = ω₀t + ½αt²', v: PH.num(th, 3) + '  (' + PH.num(th * RAD, 1) + '°)', unit: 'rad' },
        { k: 'ω² از رابطه زاویه‌ای', v: PH.num(om * om, 3), unit: 'rad²/s²' },
        { k: 'ω₀² + 2αθ (بررسی)', v: PH.num(a * a + 2 * b * th, 3), unit: 'rad²/s²' },
        { k: 'تعداد دور کامل', v: PH.num(Math.abs(th) / (2 * Math.PI), 3), unit: 'دور' },
        { k: 'سرعت خطی v = ωr', v: PH.num(om * r, 3), unit: 'm/s' }
      ]);
    }

    changed = function () { s.t = 0; update(); };
    update();
  }

  function exp2(host) {
    const card = PH.panel('آزمایش 2 — گشتاور', '');
    host.appendChild(card);
    formula(card.body, 'τ = rF sinθ ، τ_max = rF');
    note(card.body, 'تنها مؤلفه عمود بر بازوی گشتاور گشتاور تولید می‌کند؛ بازوی گشتاور برابر بازوی دوم است.');
    const g = PH.grid(card.body, 3);
    let changed = function () {};
    const F = slider('نیرو F', 'N', 0, 100, 1, 40, function () { changed(); });
    const r = slider('بازوی گشتاور r', 'm', 0, 5, 0.05, 2, function () { changed(); });
    const th = slider('زاویه نیرو θ', '°', 0, 180, 1, 60, function () { changed(); });
    g.appendChild(F.root);
    g.appendChild(r.root);
    g.appendChild(th.root);
    const out = PH.readout([
      { k: 'τ = rF sinθ', v: '-', unit: 'N·m' },
      { k: 'τ_max = rF', v: '-', unit: 'N·m' },
      { k: 'مؤلفه عمود F⊥ = F sinθ', v: '-', unit: 'N' },
      { k: 'مؤلفه موازی F∥ = F cosθ', v: '-', unit: 'N' },
      { k: 'بازوی گشتاور', v: '-', unit: 'm' },
      { k: 'θ', v: '-', unit: 'rad' }
    ]);
    card.body.appendChild(out);
    const view = PH.canvas(card.body, { height: 340 });
    const s = addScene(view, render);

    function render(s) {
      const g2 = begin(view);
      const ctx = g2.ctx;
      const f = F.get();
      const rl = r.get();
      const thd = th.get();
      const thr = thd / RAD;
      const px = g2.w * 0.22;
      const py = g2.h / 2;
      const sc = Math.min(g2.w, g2.h) * 0.44 / 5;
      const arm = rl * sc;
      const fs = Math.min(g2.w, g2.h) * 0.3 / 100;
      const ax = px + arm;
      const fx = f * Math.cos(thr) * fs;
      const fy = -f * Math.sin(thr) * fs;
      circle(ctx, px, py, 8, ACC2, '#0d141d', 2);
      line(ctx, px, py, ax, py, ACC, 4);
      circle(ctx, ax, py, 6, ACC, '#0d141d', 2);
      if (f > 0) {
        dashed(ctx, ax, py, ax + fx, py, MUT, 2);
        arrow(ctx, ax, py, ax + fx, py + fy, BAD, 3);
        txt(ctx, 'F', ax + fx + 8, py + fy, BAD, 13);
        txt(ctx, 'F⊥ = ' + PH.num(f * Math.sin(thr), 2) + ' N', ax + fx * 0.5, py + 16, MUT, 12);
      }
      arcStroke(ctx, px, py, Math.max(46, Math.min(arm * 0.6, 90)), 0, -thr, ACC2, 3);
      txt(ctx, 'θ = ' + PH.num(thd, 0) + '° = ' + PH.num(thr, 3) + ' rad', px + 110, py - 40, ACC2, 13);
      const tq = rl * f * Math.sin(thr);
      const spin = tq >= 0 ? 1 : -1;
      arcArrow(ctx, px, py, 30, 0, spin * 1.9, tq === 0 ? MUT : OK);
      txt(ctx, 'τ = ' + PH.num(tq, 2) + ' N·m', px + 96, py + 40, OK, 13);
      txt(ctx, 'محور چرخش', px - 34, py + 26, MUT, 11);
    }

    function update() {
      const f = F.get();
      const rl = r.get();
      const thd = th.get();
      const thr = thd / RAD;
      out.update([
        { k: 'τ = rF sinθ', v: PH.num(rl * f * Math.sin(thr), 3), unit: 'N·m' },
        { k: 'τ_max = rF', v: PH.num(rl * f, 3), unit: 'N·m' },
        { k: 'مؤلفه عمود F⊥ = F sinθ', v: PH.num(f * Math.sin(thr), 3), unit: 'N' },
        { k: 'مؤلفه موازی F∥ = F cosθ', v: PH.num(f * Math.cos(thr), 3), unit: 'N' },
        { k: 'بازوی گشتاور', v: PH.num(rl * Math.sin(thr), 3), unit: 'm' },
        { k: 'θ', v: PH.num(thr, 3) + '  (' + PH.num(thd, 0) + '°)', unit: 'rad' }
      ]);
    }

    changed = function () { s.t = 0; update(); };
    update();
  }

  function exp3(host) {
    const card = PH.panel('آزمایش 3 — دوران حول محور با لختی', '');
    host.appendChild(card);
    formula(card.body, 'Στ = Iα ، I = kmL²');
    note(card.body, 'جسم با لختی مشخص تحت گشتاور ثابت می‌چرخد؛ شتاب، سرعت، زاویه و انرژی چرخشی از رابطه گشتاور دوم استخراج می‌شود.');
    const g = PH.grid(card.body, 2);
    let changed = function () {};
    const sel = PH.control({
      label: 'شکل جسم',
      options: BODIES.filter(function (b) { return b.sel; }).map(function (b) { return { value: b.id, label: b.name }; }),
      value: 'disc',
      onInput: function () { changed(); }
    });
    const m = slider('جرم m', 'kg', 0.1, 50, 0.1, 2, function () { changed(); });
    const L = slider('شعاع R یا طول L', 'm', 0.1, 3, 0.05, 1, function () { changed(); });
    const tq = slider('گشتاور τ', 'N·m', -50, 50, 0.5, 10, function () { changed(); });
    const tt = slider('زمان t', 's', 0, 20, 0.1, 3, function () { changed(); });
    g.appendChild(sel.root);
    g.appendChild(m.root);
    g.appendChild(L.root);
    g.appendChild(tq.root);
    g.appendChild(tt.root);
    const out = PH.readout([
      { k: 'لختی I', v: '-', unit: 'kg·m²' },
      { k: 'شتاب زاویه‌ای α = τ/I', v: '-', unit: 'rad/s²' },
      { k: 'سرعت زاویه‌ای ω = τt/I', v: '-', unit: 'rad/s' },
      { k: 'زاویه θ = τt²/(2I)', v: '-', unit: 'rad' },
      { k: 'انرژی چرخشی K = ½Iω²', v: '-', unit: 'J' },
      { k: 'بررسی Στ = Iα', v: '-', unit: 'N·m' }
    ]);
    card.body.appendChild(out);
    const tbl = PH.readout(BODIES.map(function (b) { return { k: b.formula, v: '-', unit: 'kg·m²' }; }));
    note(card.body, 'جدول لختی دورانی اجسام هم‌شکل (مقادیر با m و L جاری)');
    card.body.appendChild(tbl);
    const view = PH.canvas(card.body, { height: 340 });
    const s = addScene(view, render);

    function body() {
      const id = sel.get();
      for (let i = 0; i < BODIES.length; i++) if (BODIES[i].id === id) return BODIES[i];
      return BODIES[1];
    }

    function render(s) {
      const g2 = begin(view);
      const ctx = g2.ctx;
      const b = body();
      const mm = m.get();
      const LL = L.get();
      const t0 = tq.get();
      const T = tt.get();
      const I = b.k * mm * LL * LL;
      const al = I ? t0 / I : 0;
      const p = phase(s, T);
      const cx = g2.w / 2;
      const cy = g2.h / 2;
      const R = Math.min(g2.w, g2.h) * 0.36;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(al * p * p * 0.5);
      drawBody(ctx, b.kind, R);
      if (b.kind !== 'point') line(ctx, 0, 0, R, 0, 'rgba(255,255,255,0.4)', 2);
      ctx.restore();
      circle(ctx, cx, cy, 7, MUT, '#0d141d', 2);
      const om = al * T;
      const lg = I * om;
      arcArrow(ctx, cx, cy, 26, 0, om >= 0 ? 2.1 : -2.1, ACC2);
      txt(ctx, 'L = Iω = ' + PH.num(lg, 2) + ' kg·m²/s', cx, 26, ACC2, 14, 'center');
      txt(ctx, b.name + ' — I = ' + PH.num(I, 3) + ' kg·m²', cx, g2.h - 26, INK, 13, 'center');
      txt(ctx, 'α = ' + PH.num(al, 3) + ' rad/s²', cx, g2.h - 8, MUT, 12, 'center');
    }

    function update() {
      const b = body();
      const mm = m.get();
      const LL = L.get();
      const t0 = tq.get();
      const T = tt.get();
      const I = b.k * mm * LL * LL;
      const al = I > 0 ? t0 / I : 0;
      const om = al * T;
      const th = 0.5 * al * T * T;
      out.update([
        { k: 'لختی I', v: PH.num(I, 4), unit: 'kg·m²' },
        { k: 'شتاب زاویه‌ای α = τ/I', v: PH.num(al, 4), unit: 'rad/s²' },
        { k: 'سرعت زاویه‌ای ω = τt/I', v: PH.num(om, 4) + '  (' + PH.num(om * RAD, 1) + '°/s)', unit: 'rad/s' },
        { k: 'زاویه θ = τt²/(2I)', v: PH.num(th, 4) + '  (' + PH.num(th * RAD, 1) + '°)', unit: 'rad' },
        { k: 'انرژی چرخشی K = ½Iω²', v: PH.num(0.5 * I * om * om, 3), unit: 'J' },
        { k: 'بررسی Στ = Iα', v: PH.num(I * al, 3) + ' = ' + PH.num(t0, 3), unit: 'N·m' }
      ]);
      tbl.update(BODIES.map(function (x) {
        return { k: x.formula, v: PH.num(x.k * mm * LL * LL, 4), unit: 'kg·m²' };
      }));
    }

    changed = function () { s.t = 0; update(); };
    update();
  }

  function exp4(host) {
    const card = PH.panel('آزمایش 4 — قضیه محورهای موازی', '');
    host.appendChild(card);
    formula(card.body, 'I = I_cm + md²');
    note(card.body, 'جسم حول محوری به فاصله d از مرکز جرم، لختی بیشتری نسبت به محور مرکز جرم دارد.');
    const g = PH.grid(card.body, 3);
    let changed = function () {};
    const icm = slider('لختی حول مرکز جرم I_cm', 'kg·m²', 0.1, 50, 0.1, 2, function () { changed(); });
    const m = slider('جرم m', 'kg', 0.1, 100, 0.1, 5, function () { changed(); });
    const d = slider('فاصله محورها d', 'm', 0, 5, 0.05, 1, function () { changed(); });
    g.appendChild(icm.root);
    g.appendChild(m.root);
    g.appendChild(d.root);
    const out = PH.readout([
      { k: 'I_cm', v: '-', unit: 'kg·m²' },
      { k: 'md²', v: '-', unit: 'kg·m²' },
      { k: 'لختی حول محور جدید I', v: '-', unit: 'kg·m²' },
      { k: 'افزایش نسبی', v: '-', unit: '×' },
      { k: 'اینرسی معادل α برای τ ثابت', v: '-', unit: 'rad/s²' }
    ]);
    card.body.appendChild(out);
    const view = PH.canvas(card.body, { height: 340 });
    const s = addScene(view, render);

    function render(s) {
      const g2 = begin(view);
      const ctx = g2.ctx;
      const dd = d.get();
      const R = Math.min(g2.w, g2.h) * 0.2;
      const sc = Math.min(g2.w, g2.h) * 0.42 / 5;
      const cy = g2.h / 2;
      const x1 = g2.w / 2 - dd * sc * 0.5;
      const x2 = x1 + dd * sc;
      circle(ctx, x1, cy, R, ACC, SOFT, 2);
      circle(ctx, x2, cy, R, ACC2, 'rgba(255,180,84,0.14)', 2);
      dashed(ctx, x1, cy - R - 34, x1, cy + R + 34, MUT, 2);
      dashed(ctx, x2, cy - R - 34, x2, cy + R + 34, MUT, 2);
      dot(ctx, x1, cy, 5, ACC);
      dot(ctx, x2, cy, 5, ACC2);
      line(ctx, x1 - R - 20, cy + R + 40, x1 + R + 20, cy + R + 40, MUT, 1.5);
      line(ctx, x2 - R - 20, cy + R + 40, x2 + R + 20, cy + R + 40, MUT, 1.5);
      arrow(ctx, x1, cy + R + 40, x2, cy + R + 40, INK, 1.5);
      arrow(ctx, x2, cy + R + 40, x1, cy + R + 40, INK, 1.5);
      txt(ctx, 'd = ' + PH.num(dd, 2) + ' m', (x1 + x2) / 2, cy + R + 58, INK, 13, 'center');
      txt(ctx, 'I_cm', x1, cy - R - 44, ACC, 12, 'center');
      txt(ctx, 'I = I_cm + md²', x2, cy - R - 44, ACC2, 12, 'center');
      const f = (s.t % 2) / 2;
      const mx = x1 + (x2 - x1) * f;
      dot(ctx, mx, cy + R + 40, 4, OK);
      txt(ctx, 'I = ' + PH.num(icm.get() + m.get() * dd * dd, 3) + ' kg·m²', g2.w / 2, 24, INK, 14, 'center');
    }

    function update() {
      const a = icm.get();
      const mm = m.get();
      const dd = d.get();
      const I = a + mm * dd * dd;
      out.update([
        { k: 'I_cm', v: PH.num(a, 4), unit: 'kg·m²' },
        { k: 'md²', v: PH.num(mm * dd * dd, 4), unit: 'kg·m²' },
        { k: 'لختی حول محور جدید I', v: PH.num(I, 4), unit: 'kg·m²' },
        { k: 'افزایش نسبی', v: PH.num(I / a, 3), unit: '×' },
        { k: 'اینرسی معادل α برای τ ثابت', v: PH.num(10 / I, 4), unit: 'rad/s²' }
      ]);
    }

    changed = function () { s.t = 0; update(); };
    update();
  }

  function exp5(host) {
    const card = PH.panel('آزمایش 5 — غلتش بدون لغزش', '');
    host.appendChild(card);
    formula(card.body, 'v = ωr ، a = αr');
    note(card.body, 'در غلتش بدون لغزش سرعت مرکز چرخ همیشه برابر سرعت زاویه‌ای ضرب در شعاع است و نقطه تماس لحظه‌ای ساکن است.');
    const g = PH.grid(card.body, 2);
    let changed = function () {};
    const r = slider('شعاع چرخ r', 'm', 0.05, 2, 0.05, 0.5, function () { changed(); });
    const w0 = slider('سرعت زاویه‌ای اولیه ω₀', 'rad/s', 0, 40, 0.5, 10, function () { changed(); });
    const al = slider('شتاب زاویه‌ای α', 'rad/s²', -20, 20, 0.5, 0, function () { changed(); });
    const tt = slider('زمان t', 's', 0, 20, 0.1, 4, function () { changed(); });
    g.appendChild(r.root);
    g.appendChild(w0.root);
    g.appendChild(al.root);
    g.appendChild(tt.root);
    const out = PH.readout([
      { k: 'سرعت اولیه v = ω₀r', v: '-', unit: 'm/s' },
      { k: 'شتاب خطی a = αr', v: '-', unit: 'm/s²' },
      { k: 'مسافت طی‌شده s', v: '-', unit: 'm' },
      { k: 'ω در زمان t', v: '-', unit: 'rad/s' },
      { k: 'v در زمان t = ω(t)·r', v: '-', unit: 'm/s' },
      { k: 'اختلاف v − ωr (لغزش)', v: '-', unit: 'm/s' }
    ]);
    card.body.appendChild(out);
    const bd = badge(card.body, 'غلتش بدون لغزش');
    const view = PH.canvas(card.body, { height: 340 });
    const s = addScene(view, render);

    function render(s) {
      const g2 = begin(view);
      const ctx = g2.ctx;
      const rr = r.get();
      const a = w0.get();
      const b = al.get();
      const T = tt.get();
      const p = phase(s, T);
      const Rp = Math.min(g2.w, g2.h) * 0.22;
      const traveled = (a * p + 0.5 * b * p * p) * rr;
      const total = (a * T + 0.5 * b * T * T) * rr;
      const traveled0 = (a * p + 0.5 * b * p * p) * rr;
      const ground = g2.h * 0.74;
      const sc = Rp / rr;
      const px = Math.max(Rp + 24, Math.min(g2.w - Rp - 24, g2.w / 2 + (total - traveled) * sc));
      const om = a * p;
      line(ctx, 0, ground, g2.w, ground, MUT, 2.5);
      for (let x = 10; x < g2.w; x += 26) line(ctx, x, ground, x - 12, ground + 12, 'rgba(255,255,255,0.14)', 1);
      circle(ctx, px, ground - Rp, Rp, ACC, SOFT, 2.5);
      circle(ctx, px, ground - Rp, Rp * 0.28, FAINT, null, 1);
      arcArrow(ctx, px, ground - Rp, Rp * 0.62, -1.2, -1.2 + Math.max(-2.6, Math.min(2.6, om * 0.4)), ACC2);
      dot(ctx, px, ground, 5, OK);
      txt(ctx, 'نقطه تماس (لحظه‌ای ساکن)', px, ground + 26, OK, 12, 'center');
      arrow(ctx, px, ground - Rp, px + Rp * 1.5, ground - Rp, OK, 3);
      txt(ctx, 'v = ' + PH.num(om * rr, 2) + ' m/s', px + Rp * 1.5 + 6, ground - Rp, OK, 12);
      txt(ctx, 'ω = ' + PH.num(om, 2) + ' rad/s', px, ground - Rp - Rp - 20, INK, 13, 'center');
      txt(ctx, 'θ = ' + PH.num(a * p + 0.5 * b * p * p, 2) + ' rad = ' + PH.num((a * p + 0.5 * b * p * p) * RAD, 0) + '°', g2.w / 2, 22, MUT, 12, 'center');
      if (a !== 0) {
        const turns = Math.min(6, Math.floor(Math.abs(a * p + 0.5 * b * p * p) / (2 * Math.PI)));
        for (let k = 1; k <= turns; k++) {
          const pk = (2 * Math.PI * k) / Math.abs(a) * Math.sign(a);
          const tk = (a * pk + 0.5 * b * pk * pk) * rr;
          const xk = px + (traveled0 - tk) * sc;
          if (xk > 0 && xk < g2.w) line(ctx, xk, ground - 7, xk, ground + 7, ACC2, 2);
        }
      }
    }

    function update() {
      const rr = r.get();
      const a = w0.get();
      const b = al.get();
      const T = tt.get();
      const om = a + b * T;
      out.update([
        { k: 'سرعت اولیه v = ω₀r', v: PH.num(a * rr, 3), unit: 'm/s' },
        { k: 'شتاب خطی a = αr', v: PH.num(b * rr, 3), unit: 'm/s²' },
        { k: 'مسافت طی‌شده s', v: PH.num((a * T + 0.5 * b * T * T) * rr, 3), unit: 'm' },
        { k: 'ω در زمان t', v: PH.num(om, 3) + '  (' + PH.num(om * RAD, 1) + '°/s)', unit: 'rad/s' },
        { k: 'v در زمان t = ω(t)·r', v: PH.num(om * rr, 3), unit: 'm/s' },
        { k: 'اختلاف v − ωr (لغزش)', v: PH.num(om * rr - om * rr, 6), unit: 'm/s' }
      ]);
      bd.set('غلتش بدون لغزش: v = ωr');
    }

    changed = function () { s.t = 0; update(); };
    update();
  }

  function exp6(host) {
    const card = PH.panel('آزمایش 6 — انرژی چرخشی و کار گشتاور', '');
    host.appendChild(card);
    formula(card.body, 'W = τΔθ = ΔK = ½I(ω² − ω₀²)');
    note(card.body, 'کار گشتاور ثابت برابر تغییر انرژی چرخشی است؛ نقطه مسیر دایره‌ای جابه‌جایی مماسی را طی می‌کند.');
    const g = PH.grid(card.body, 2);
    let changed = function () {};
    const I = slider('لختی I', 'kg·m²', 0.1, 20, 0.1, 2, function () { changed(); });
    const w0 = slider('سرعت اولیه ω₀', 'rad/s', 0, 40, 0.5, 10, function () { changed(); });
    const th = slider('زاویه چرخش θ', '°', 0, 1440, 5, 720, function () { changed(); });
    const tq = slider('گشتاور τ', 'N·m', -50, 50, 0.5, 5, function () { changed(); });
    g.appendChild(I.root);
    g.appendChild(w0.root);
    g.appendChild(th.root);
    g.appendChild(tq.root);
    const out = PH.readout([
      { k: 'کار گشتاور W = τθ', v: '-', unit: 'J' },
      { k: 'انرژی قبل K_before = ½Iω₀²', v: '-', unit: 'J' },
      { k: 'ω پس از چرخش', v: '-', unit: 'rad/s' },
      { k: 'انرژی بعد K_after = ½Iω²', v: '-', unit: 'J' },
      { k: 'تغییر انرژی ΔK', v: '-', unit: 'J' },
      { k: 'بررسی ΔK − W', v: '-', unit: 'J' }
    ]);
    card.body.appendChild(out);
    const bd = badge(card.body, 'ترم انرژی برقرار است');
    const view = PH.canvas(card.body, { height: 340 });
    const s = addScene(view, render);

    function render(s) {
      const g2 = begin(view);
      const ctx = g2.ctx;
      const thr = th.get() / RAD;
      const R = Math.min(g2.w, g2.h) * 0.32;
      const cx = g2.w / 2;
      const cy = g2.h / 2;
      const f = (s.t % 3) / 3;
      arcStroke(ctx, cx, cy, R, 0, oneTurn(thr), 'rgba(255,180,84,0.28)', 3);
      arcStroke(ctx, cx, cy, R, 0, oneTurn(thr * f), ACC, 4);
      circle(ctx, cx, cy, 6, MUT, '#0d141d', 2);
      const ae = oneTurn(thr);
      dot(ctx, cx + R * Math.cos(0), cy + R * Math.sin(0), 5, INK);
      dot(ctx, cx + R * Math.cos(ae), cy + R * Math.sin(ae), 5, ACC2);
      const am = oneTurn(thr * f);
      const bx = cx + R * Math.cos(am);
      const by = cy + R * Math.sin(am);
      dot(ctx, bx, by, 6, OK);
      const tg = am + Math.PI / 2;
      const fs = Math.min(g2.w, g2.h) * 0.22 / 50;
      arrow(ctx, bx, by, bx + tq.get() * fs * Math.cos(tg), by + tq.get() * fs * Math.sin(tg), BAD, 3);
      arcArrow(ctx, cx, cy, R * 0.55, 0, ae, ACC2);
      txt(ctx, 'θ = ' + PH.num(th.get(), 0) + '° = ' + PH.num(thr, 3) + ' rad', cx, 24, INK, 14, 'center');
      txt(ctx, 'W = ' + PH.num(tq.get() * thr, 2) + ' J', cx, g2.h - 24, BAD, 13, 'center');
      txt(ctx, 'نیروی گشتاور در جهت مماس', bx + 16, by + 26, MUT, 12);
    }

    function update() {
      const Iv = I.get();
      const a = w0.get();
      const thr = th.get() / RAD;
      const tq2 = tq.get();
      const W = tq2 * thr;
      const Ib = Iv > 0 ? Iv : 0;
      const k0 = 0.5 * Ib * a * a;
      const om2 = Ib > 0 ? a * a + 2 * tq2 * thr / Ib : a * a;
      const om = Math.sqrt(Math.max(0, om2));
      const k1 = 0.5 * Ib * om2;
      out.update([
        { k: 'کار گشتاور W = τθ', v: PH.num(W, 3), unit: 'J' },
        { k: 'انرژی قبل K_before = ½Iω₀²', v: PH.num(k0, 3), unit: 'J' },
        { k: 'ω پس از چرخش', v: PH.num(om, 3) + '  (' + PH.num(om * RAD, 1) + '°/s)', unit: 'rad/s' },
        { k: 'انرژی بعد K_after = ½Iω²', v: PH.num(k1, 3), unit: 'J' },
        { k: 'تغییر انرژی ΔK', v: PH.num(k1 - k0, 3), unit: 'J' },
        { k: 'بررسی ΔK − W', v: PH.num(k1 - k0 - W, 6), unit: 'J' }
      ]);
      bd.set(Math.abs(k1 - k0 - W) < 1e-6 ? 'ترم انرژی برقرار است' : 'اختلاف انرژی');
    }

    changed = function () { s.t = 0; update(); };
    update();
  }

  function exp7(host) {
    const card = PH.panel('آزمایش 7 — تکانه زاویه‌ای و پایستگی L', '');
    host.appendChild(card);
    formula(card.body, 'L = Iω = ثابت ، ω₂ = I₁ω₁ / I₂');
    note(card.body, 'با جمع کردن دست‌ها لختی کاهش و سرعت زاویه‌ای افزایش می‌یابد، ولی تکانه زاویه‌ای ثابت می‌ماند و انرژی چرخشی زیاد می‌شود.');
    const g = PH.grid(card.body, 3);
    let changed = function () {};
    const I0 = slider('لختی اولیه I₁', 'kg·m²', 0.5, 20, 0.1, 4, function () { changed(); });
    const w0 = slider('سرعت اولیه ω₁', 'rad/s', 0, 40, 0.5, 6, function () { changed(); });
    const kf = slider('ضریب لختی جدید I₂/I₁', '×', 0.15, 1, 0.01, 0.4, function () { changed(); });
    g.appendChild(I0.root);
    g.appendChild(w0.root);
    g.appendChild(kf.root);
    const out = PH.readout([
      { k: 'تکانه زاویه‌ای L = I₁ω₁', v: '-', unit: 'kg·m²/s' },
      { k: 'لختی جدید I₂', v: '-', unit: 'kg·m²' },
      { k: 'ω₂ لازم برای پایستگی L', v: '-', unit: 'rad/s' },
      { k: 'انرژی قبل K₁ = ½I₁ω₁²', v: '-', unit: 'J' },
      { k: 'انرژی بعد K₂ = ½I₂ω₂²', v: '-', unit: 'J' },
      { k: 'کار انجام‌شده توسط عضله ΔK', v: '-', unit: 'J' },
      { k: 'نسبت شعاع چرخش R₂/R₁', v: '-', unit: '×' }
    ]);
    card.body.appendChild(out);
    const bd = badge(card.body, 'L ثابت می‌ماند');
    const view = PH.canvas(card.body, { height: 340 });
    const s = addScene(view, render);

    function render(s) {
      const g2 = begin(view);
      const ctx = g2.ctx;
      const I1 = I0.get();
      const a = w0.get();
      const k2 = kf.get();
      const L = I1 * a;
      const f = (s.t % 3) / 3;
      const e = f < 0.5 ? 2 * f : 2 * (1 - f);
      const kNow = 1 + (k2 - 1) * e;
      const I2 = I1 * kNow;
      const om = I2 > 0 ? L / I2 : 0;
      const cx = g2.w / 2;
      const cy = g2.h / 2;
      const Rmax = Math.min(g2.w, g2.h) * 0.36;
      circle(ctx, cx, cy, Rmax, 'rgba(255,255,255,0.16)', null, 1.5);
      const R = Rmax * Math.sqrt(kNow);
      circle(ctx, cx, cy, R, ACC, 'rgba(78,161,255,0.14)', 2.5);
      const aNow = om * s.t;
      for (let i = 0; i < 4; i++) {
        const aa = aNow + (i * Math.PI) / 2;
        line(ctx, cx, cy, cx + R * Math.cos(aa), cy + R * Math.sin(aa), 'rgba(255,255,255,0.35)', 2);
      }
      dot(ctx, cx, cy, 9, ACC2);
      dot(ctx, cx + R * Math.cos(aNow), cy + R * Math.sin(aNow), 5, OK);
      circle(ctx, cx, cy, Math.max(8, R * 0.16), ACC2, 'rgba(255,180,84,0.25)', 2);
      txt(ctx, 'L = ' + PH.num(L, 2) + ' kg·m²/s (ثابت)', cx, 24, INK, 14, 'center');
      txt(ctx, 'ω = ' + PH.num(om, 2) + ' rad/s', cx, g2.h - 44, ACC, 13, 'center');
      txt(ctx, 'I = ' + PH.num(I2, 3) + ' kg·m²  ·  K = ' + PH.num(0.5 * I2 * om * om, 2) + ' J', cx, g2.h - 22, MUT, 12, 'center');
      txt(ctx, 'I₂/I₁ = ' + PH.num(kNow, 3), cx, g2.h - 4, MUT, 11, 'center');
    }

    function update() {
      const I1 = I0.get();
      const a = w0.get();
      const k2 = kf.get() > 0 ? kf.get() : 0;
      const L = I1 * a;
      const I2 = I1 * k2;
      const om = I2 ? L / I2 : 0;
      const k1 = 0.5 * I1 * a * a;
      const k2e = 0.5 * I2 * om * om;
      out.update([
        { k: 'تکانه زاویه‌ای L = I₁ω₁', v: PH.num(L, 3), unit: 'kg·m²/s' },
        { k: 'لختی جدید I₂', v: PH.num(I2, 4), unit: 'kg·m²' },
        { k: 'ω₂ لازم برای پایستگی L', v: PH.num(om, 3) + '  (' + PH.num(om * RAD, 1) + '°/s)', unit: 'rad/s' },
        { k: 'انرژی قبل K₁ = ½I₁ω₁²', v: PH.num(k1, 3), unit: 'J' },
        { k: 'انرژی بعد K₂ = ½I₂ω₂²', v: PH.num(k2e, 3), unit: 'J' },
        { k: 'کار انجام‌شده توسط عضله ΔK', v: PH.num(k2e - k1, 3), unit: 'J' },
        { k: 'نسبت شعاع چرخش R₂/R₁', v: PH.num(Math.sqrt(k2), 3), unit: '×' }
      ]);
      bd.set('L ثابت: I₂ω₂ = I₁ω₁');
    }

    changed = function () { s.t = 0; update(); };
    update();
  }

  function exp8(host) {
    const card = PH.panel('آزمایش 8 — نوسان ساده چرخشی روی فنر پیچشی', '');
    host.appendChild(card);
    formula(card.body, 'ω_n = √(κ/I) ، f = ω_n/2π ، T = 2π√(I/κ)');
    note(card.body, 'فنر پیچشی گشتاور بازگرداننده τ = −κθ ایجاد می‌کند و میله حول محور ثابت نوسان می‌کند.');
    const g = PH.grid(card.body, 2);
    let changed = function () {};
    const kp = slider('ثابت پیچشی κ', 'N·m/rad', 0.1, 50, 0.1, 5, function () { changed(); });
    const I = slider('لختی I', 'kg·m²', 0.1, 20, 0.1, 2, function () { changed(); });
    g.appendChild(kp.root);
    g.appendChild(I.root);
    const out = PH.readout([
      { k: 'فرکانس زاویه‌ای طبیعی ω_n = √(κ/I)', v: '-', unit: 'rad/s' },
      { k: 'فرکانس f = ω_n/2π', v: '-', unit: 'Hz' },
      { k: 'دوره T = 2π√(I/κ)', v: '-', unit: 's' },
      { k: 'دوره بررسی‌شده 2π/ω_n', v: '-', unit: 's' },
      { k: 'گشتاور بازگرداننده در دامنه A = 0.6 rad', v: '-', unit: 'N·m' },
      { k: 'انرژی کل نوسان E = ½κA²', v: '-', unit: 'J' }
    ]);
    card.body.appendChild(out);
    const bd = badge(card.body, 'نوسان پایدار بدون میرایی');
    const view = PH.canvas(card.body, { height: 340 });
    const s = addScene(view, render);

    function render(s) {
      const g2 = begin(view);
      const ctx = g2.ctx;
      const k = kp.get();
      const Iv = I.get();
      const wn = Math.sqrt(Math.max(0, k) / (Iv > 0 ? Iv : 1));
      const px = g2.w * 0.24;
      const py = g2.h / 2;
      const Lp = Math.min(g2.w * 0.5, g2.h * 0.6);
      const A = 0.6;
      const th = A * Math.sin(wn * s.t);
      for (let i = 0; i < 6; i++) line(ctx, px - 34, py - 40 + i * 16, px - 6, py - 30 + i * 16, MUT, 2);
      line(ctx, px - 34, py - 48, px - 34, py + 48, MUT, 3);
      circle(ctx, px, py, 8, ACC2, '#0d141d', 2);
      const ex = px + Lp * Math.cos(th);
      const ey = py + Lp * Math.sin(th);
      for (let i = 0; i < 14; i++) {
        const t = i / 13;
        const a1 = -1.5 + t * 4 + th;
        const a2 = -1.5 + t * 4 + th * 0.35;
        line(ctx, px + Math.cos(a1) * 26, py + Math.sin(a1) * 26, px + Math.cos(a2) * 40, py + Math.sin(a2) * 40, i % 2 ? ACC : 'rgba(255,255,255,0.35)', 2.5);
      }
      line(ctx, px, py, ex, ey, ACC, 5);
      circle(ctx, ex, ey, Math.max(10, Math.min(26, Lp * 0.09)), ACC, 'rgba(78,161,255,0.2)', 2);
      const tq = -Math.max(0, k) * th;
      arcArrow(ctx, px, py, 30, 0, tq >= 0 ? 2 : -2, tq >= 0 ? BAD : OK);
      txt(ctx, 'θ = ' + PH.num(th, 3) + ' rad  =  ' + PH.num(th * RAD, 1) + '°', g2.w / 2, 24, INK, 14, 'center');
      txt(ctx, 'ω_n = ' + PH.num(wn, 3) + ' rad/s  ·  f = ' + PH.num(wn / (2 * Math.PI), 3) + ' Hz', g2.w / 2, g2.h - 24, ACC, 13, 'center');
      txt(ctx, 'τ = −κθ = ' + PH.num(tq, 2) + ' N·m', g2.w / 2, g2.h - 6, MUT, 12, 'center');
      const mid = g2.w * 0.78;
      const amp = Math.min(g2.w * 0.18, 110);
      const base = g2.h - 42;
      line(ctx, mid - amp, base, mid + amp, base, FAINT, 1.5);
      for (let i = 0; i < 60; i++) {
        const u = -1 + (2 * i) / 59;
        line(ctx, mid + u * amp, base - A * Math.sin(u * Math.PI) * 22, mid + u * amp, base + A * Math.sin(u * Math.PI) * 22, ACC2, 2);
      }
      dot(ctx, mid, base - th * 22, 4, OK);
      txt(ctx, 'θ(t)', mid, base + 34, MUT, 12, 'center');
    }

    function update() {
      const k = kp.get();
      const Iv = I.get();
      const wn = Math.sqrt(Math.max(0, k) / (Iv > 0 ? Iv : 1));
      const f = wn / (2 * Math.PI);
      const T = 2 * Math.PI / wn;
      out.update([
        { k: 'فرکانس زاویه‌ای طبیعی ω_n = √(κ/I)', v: PH.num(wn, 4), unit: 'rad/s' },
        { k: 'فرکانس f = ω_n/2π', v: PH.num(f, 4), unit: 'Hz' },
        { k: 'دوره T = 2π√(I/κ)', v: PH.num(T, 4), unit: 's' },
        { k: 'دوره بررسی‌شده 2π/ω_n', v: PH.num(2 * Math.PI / wn, 4), unit: 's' },
        { k: 'گشتاور بازگرداننده در دامنه A = 0.6 rad', v: PH.num(-Math.max(0, k) * 0.6, 3), unit: 'N·m' },
        { k: 'انرژی کل نوسان E = ½κA²', v: PH.num(0.5 * Math.max(0, k) * 0.36, 3), unit: 'J' }
      ]);
      bd.set('نوسان پایدار بدون میرایی');
    }

    changed = function () { s.t = 0; update(); };
    update();
  }

  function build(host) {
    scenes = [];
    byEl = new Map();
    rafId = 0;
    prevTs = 0;
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(function (entries) {
        for (let i = 0; i < entries.length; i++) {
          const sc = byEl.get(entries[i].target);
          if (sc) sc.active = entries[i].isIntersecting;
        }
        syncLoop();
      }, { threshold: 0.01 });
    } else {
      io = null;
    }
    exp1(host);
    exp2(host);
    exp3(host);
    exp4(host);
    exp5(host);
    exp6(host);
    exp7(host);
    exp8(host);
    syncLoop();
    return function () {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (io) {
        io.disconnect();
        io = null;
      }
      scenes = [];
      byEl = new Map();
      prevTs = 0;
    };
  }

  PH.register('rotation', {
    title: 'حرکت دورانی',
    subtitle: 'سینماتیک، گشتاور، لختی، انرژی و تکانه زاویه‌ای',
    build: build
  });
})();

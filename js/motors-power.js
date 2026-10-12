(function () {
  'use strict';

  var PH = window.PH;
  if (!PH) { return; }

  var PI = Math.PI;
  var N_STEPS = 1000;
  var STEP_LOAD = 2.2;

  var COL = {
    grid: '#223047',
    axis: '#7d8ea8',
    text: '#a7b6cc',
    faint: '#5b6a82',
    stator: '#4a5b72',
    iron: '#8a9bb4',
    rotor: '#5d708c',
    mag: '#ff6b81',
    gap: '#4cc2ff',
    copper: '#ffb454',
    c1: '#4ea3ff',
    c2: '#ffb454',
    c3: '#57d9a3',
    c4: '#ff6b81',
    c5: '#c792ea',
    c6: '#8fd4ff',
    panel: '#141d2b'
  };

  var FONT = '11px Tahoma, "Segoe UI", sans-serif';
  var FONT_B = 'bold 11px Tahoma, "Segoe UI", sans-serif';
  var FONT_S = '9px Tahoma, "Segoe UI", sans-serif';
  var FONT_XS = '8px Tahoma, "Segoe UI", sans-serif';

  var anims = [];
  var rafId = null;
  var visHost = null;
  var visObs = null;
  var canvases = [];

  function resetAnim(host) {
    if (visObs) { visObs.disconnect(); }
    anims = [];
    rafId = null;
    visHost = host;
    if (typeof IntersectionObserver !== 'undefined' && host) {
      visObs = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { kick(); }
      }, { threshold: 0.01 });
      visObs.observe(host);
    }
  }

  function isVisible() {
    if (!visHost || !visHost.getClientRects) { return true; }
    return visHost.getClientRects().length > 0;
  }

  function kick() {
    if (rafId === null && isVisible()) { rafId = requestAnimationFrame(loop); }
  }

  function loop(ts) {
    rafId = null;
    if (anims.length === 0) { return; }
    if (!isVisible()) { return; }
    for (var i = 0; i < anims.length; i++) { anims[i](ts); }
    rafId = requestAnimationFrame(loop);
  }

  function addAnim(fn) {
    anims.push(fn);
    kick();
  }

  var S = {
    wave: 'trap',
    p: 6,
    Nph: 12,
    Phi: 0.004,
    R: 0.25,
    L: 0.0003,
    Vbus: 48,
    Imax: 25,
    J: 2e-5,
    Bfric: 1e-4,
    Tload: 1.5,
    Bcore: 1.2,
    Vcore: 2.5e-5,
    Tfric0: 0.2,
    om: 400
  };

  var updaters = [];
  var binds = [];

  function clamp(v, lo, hi) {
    if (typeof v !== 'number' || isNaN(v)) { return lo; }
    if (v < lo) { return lo; }
    if (v > hi) { return hi; }
    return v;
  }

  function params() {
    return {
      wave: S.wave === 'sine' ? 'sine' : 'trap',
      p: clamp(S.p, 1, 12),
      Nph: clamp(S.Nph, 1, 60),
      Phi: clamp(S.Phi, 0.0005, 0.02),
      R: clamp(S.R, 0.02, 2),
      L: clamp(S.L, 0.00005, 0.002),
      Vbus: clamp(S.Vbus, 12, 120),
      Imax: clamp(S.Imax, 1, 60),
      J: clamp(S.J, 0.000002, 0.0002),
      Bfric: clamp(S.Bfric, 0.00002, 0.002),
      Tload: clamp(S.Tload, 0.02, 20),
      Bcore: clamp(S.Bcore, 0.2, 2.5),
      Vcore: clamp(S.Vcore, 1e-6, 2e-4),
      Tfric0: clamp(S.Tfric0, 0, 1),
      om: clamp(S.om, 0, 1200)
    };
  }

  function consts(q) {
    var lam = q.Nph * q.Phi;
    var ke = (2 / PI) * q.p * lam;
    var kt = q.wave === 'sine' ? 1.5 * q.p * lam : (2 / PI) * q.p * lam;
    var Vph = q.Vbus / Math.sqrt(3);
    var ob = ke > 0 ? Vph / ke : 0;
    var Tmax = kt * q.Imax;
    var Pmax = Tmax * ob;
    return {
      lam: lam, kt: kt, ke: ke,
      ktrap: (2 / PI) * q.p * lam, ksin: 1.5 * q.p * lam,
      Vph: Vph, ob: ob, Tmax: Tmax, Pmax: Pmax, rpm: ob * 30 / PI
    };
  }

  function impedance(q, w) {
    var x = w * q.L;
    return Math.sqrt(q.R * q.R + x * x);
  }

  function current(q, kk, w) {
    var Iu = kk.Vph / impedance(q, w);
    return Math.min(q.Imax, Iu);
  }

  function torqueOf(q, kk, w) {
    var T0 = kk.kt * current(q, kk, w);
    if (w <= kk.ob || w <= 1e-9) { return T0; }
    return kk.kt * current(q, kk, kk.ob) * kk.ob / w;
  }

  function ironLosses(q, w) {
    var f = (q.p * w) / (2 * PI);
    return {
      f: f,
      Pstein: 1.5e-3 * f * Math.pow(q.Bcore, 1.6) * q.Vcore,
      Peddy: 2e-5 * f * f * q.Bcore * q.Bcore * q.Vcore
    };
  }

  function losses(q, I, w, T) {
    var fe = ironLosses(q, w);
    var Pcu = 3 * I * I * q.R;
    var Pmech = q.Bfric * w;
    var Pout = T * w;
    var Ptot = Pout + Pcu + fe.Pstein + fe.Peddy + Pmech;
    return {
      f: fe.f, Pstein: fe.Pstein, Peddy: fe.Peddy,
      Pcu: Pcu, Pmech: Pmech, Pout: Pout, Ptot: Ptot,
      eta: Ptot > 0 ? Pout / Ptot : 0
    };
  }

  function integrate(q, kk, Tload, tDur, N) {
    var tt = [];
    var oo = [];
    var tm = [];
    var ii = [];
    var tl = [];
    var dtNom = tDur / N;
    var t = 0;
    var w = 0;
    var ein = 0;
    var nSub = 0;
    var i;
    tt.push(0);
    oo.push(0);
    tm.push(torqueOf(q, kk, 0));
    ii.push(current(q, kk, 0));
    tl.push(Tload);
    for (i = 1; i <= N; i++) {
      var target = dtNom * i;
      var guard = 0;
      while (t < target - 1e-12 && guard < 400) {
        var Tm = torqueOf(q, kk, w);
        var Iw = current(q, kk, w);
        var net = Tm - Tload - q.Bfric * w - q.Tfric0;
        var dt = (0.45 * q.J) / Math.max(Math.abs(net), 1e-7);
        if (dt > 2e-3) { dt = 2e-3; }
        if (dt < 5e-6) { dt = 5e-6; }
        var rest = target - t;
        if (dt > rest) { dt = rest; }
        var w2 = w + (net / q.J) * dt;
        if (w2 < 0) { w2 = 0; }
        var Tm2 = torqueOf(q, kk, w2);
        ein = ein + 0.5 * (Tm * w + Tm2 * w2) * dt + 3 * q.R * Iw * Iw * dt;
        w = w2;
        t = t + dt;
        nSub = nSub + 1;
        guard = guard + 1;
      }
      t = target;
      tt.push(t);
      oo.push(w);
      tm.push(torqueOf(q, kk, w));
      ii.push(current(q, kk, w));
      tl.push(Tload);
    }
    return { t: tt, om: oo, tm: tm, il: ii, tl: tl, ein: ein, nSub: nSub };
  }

  function fmt(v, d) {
    if (typeof v !== 'number' || !isFinite(v)) { return '-'; }
    var a = Math.abs(v);
    if (a !== 0 && (a >= 1e7 || a < 1e-6)) { return v.toExponential(2); }
    return PH.num(v, d === undefined ? 3 : d);
  }

  function fmt0(v) { return fmt(v, 0); }
  function fmt1(v) { return fmt(v, 1); }
  function fmt2(v) { return fmt(v, 2); }
  function fmt3(v) { return fmt(v, 3); }
  function fmt4(v) { return fmt(v, 4); }
  function fmt5(v) { return fmt(v, 5); }

  function el(tag, cls, text) {
    var a = { class: cls };
    if (text !== undefined && text !== null) { a.text = text; }
    return PH.el(tag, a);
  }

  function addFormulas(body, lines) {
    for (var i = 0; i < lines.length; i++) { body.appendChild(el('p', 'ph-formula', lines[i])); }
  }

  function newCard(host, title, sub) {
    var card = PH.panel(title, sub);
    host.appendChild(card);
    return { card: card, body: card.body, ctl: PH.grid(card.body, 3) };
  }

  function newCanvas(parent, height) {
    var c = PH.canvas(parent, { height: height });
    canvases.push(c);
    return c;
  }

  function prep(c) {
    var sz = c.resize();
    var w = sz.w;
    var h = sz.h;
    if (!w || w < 60) { w = 640; }
    if (!h) { h = 280; }
    c.clear(w, h);
    return { w: w, h: h, cv: c.canvas, ctx: c.ctx };
  }

  function poly(ctx, pts, close) {
    var i;
    ctx.beginPath();
    for (i = 0; i < pts.length; i++) {
      if (i === 0) { ctx.moveTo(pts[i][0], pts[i][1]); } else { ctx.lineTo(pts[i][0], pts[i][1]); }
    }
    if (close !== false) { ctx.closePath(); }
  }

  function line(ctx, pts, color, lw, dash) {
    var i;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 2;
    if (dash) { ctx.setLineDash(dash); }
    ctx.beginPath();
    for (i = 0; i < pts.length; i++) {
      if (i === 0) { ctx.moveTo(pts[i][0], pts[i][1]); } else { ctx.lineTo(pts[i][0], pts[i][1]); }
    }
    ctx.stroke();
    ctx.restore();
  }

  function fillPoly(ctx, pts, fill, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.fillStyle = fill;
    poly(ctx, pts);
    ctx.fill();
    ctx.restore();
  }

  function rect(ctx, x, y, w, h, fill, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, Math.abs(w), Math.abs(h));
    ctx.restore();
  }

  function dot(ctx, x, y, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.abs(r), 0, PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function ring(ctx, x, y, r, color, lw) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 2;
    ctx.beginPath();
    ctx.arc(x, y, Math.abs(r), 0, PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function arrow(ctx, x1, y1, x2, y2, color, lw, head) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) { return; }
    var ux = dx / len, uy = dy / len;
    var hs = head || 9;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw || 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - ux * hs * 0.8, y2 - uy * hs * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * hs - uy * hs * 0.45, y2 - uy * hs + ux * hs * 0.45);
    ctx.lineTo(x2 - ux * hs + uy * hs * 0.45, y2 - uy * hs - ux * hs * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function label(ctx, x, y, str, color, align, base, font) {
    ctx.save();
    ctx.direction = 'ltr';
    ctx.fillStyle = color || COL.text;
    ctx.font = font || FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = base || 'alphabetic';
    ctx.fillText(String(str), x, y);
    ctx.restore();
  }

  function plabel(ctx, x, y, str, color, align, base, font) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.fillStyle = color || COL.text;
    ctx.font = font || FONT;
    ctx.textAlign = align || 'right';
    ctx.textBaseline = base || 'alphabetic';
    ctx.fillText(String(str), x, y);
    ctx.restore();
  }

  function plot(ctx, box, xd, yd, xt, yt, xl, yl, xf, yf) {
    var i;
    var x0 = box.x, y0 = box.y, bw = box.w, bh = box.h;
    var dx = xd[1] - xd[0] === 0 ? 1 : xd[1] - xd[0];
    var dy = yd[1] - yd[0] === 0 ? 1 : yd[1] - yd[0];
    var X = function (v) { return x0 + (bw * (v - xd[0])) / dx; };
    var Y = function (v) { return y0 + bh - (bh * (v - yd[0])) / dy; };
    var xg = xf || function (v) { return String(v); };
    var yg = yf || function (v) { return String(v); };
    ctx.save();
    ctx.lineWidth = 1;
    ctx.direction = 'ltr';
    ctx.strokeStyle = COL.grid;
    ctx.beginPath();
    for (i = 0; i < xt.length; i++) {
      var gx = Math.round(X(xt[i])) + 0.5;
      ctx.moveTo(gx, y0);
      ctx.lineTo(gx, y0 + bh);
    }
    for (i = 0; i < yt.length; i++) {
      var gy = Math.round(Y(yt[i])) + 0.5;
      ctx.moveTo(x0, gy);
      ctx.lineTo(x0 + bw, gy);
    }
    ctx.stroke();
    ctx.strokeStyle = COL.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y0 + bh);
    ctx.lineTo(x0 + bw, y0 + bh);
    ctx.stroke();
    ctx.fillStyle = COL.text;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (i = 0; i < xt.length; i++) { ctx.fillText(xg(xt[i]), X(xt[i]), y0 + bh + 6); }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (i = 0; i < yt.length; i++) { ctx.fillText(yg(yt[i]), x0 - 6, Y(yt[i])); }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COL.faint;
    ctx.font = FONT_S;
    ctx.fillText(xl, x0 + bw - 2, y0 + bh + 22);
    ctx.save();
    ctx.translate(x0 - 34, y0 + 4);
    ctx.rotate(-PI / 2);
    ctx.fillText(yl, 0, 0);
    ctx.restore();
    ctx.restore();
    return { X: X, Y: Y, box: box };
  }

  function axisRight(ctx, box, yd, yt, yf) {
    var dy = yd[1] - yd[0] === 0 ? 1 : yd[1] - yd[0];
    var Y = function (v) { return box.y + box.h - (box.h * (v - yd[0])) / dy; };
    ctx.save();
    ctx.strokeStyle = COL.c4;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(box.x + box.w, box.y);
    ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.stroke();
    ctx.fillStyle = COL.c4;
    ctx.font = FONT;
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < yt.length; i++) {
      ctx.fillText(yf ? yf(yt[i]) : String(yt[i]), box.x + box.w + 6, Math.round(Y(yt[i])) + 0.5);
    }
    ctx.restore();
    return Y;
  }

  function badgeRow(body) {
    var box = el('div', 'ph-toolbar');
    body.appendChild(box);
    return box;
  }

  function setBadges(box, list) {
    while (box.firstChild) { box.removeChild(box.firstChild); }
    for (var i = 0; i < list.length; i++) {
      box.appendChild(el('span', list[i][2] ? 'ph-badge ' + list[i][2] : 'ph-badge', list[i][0]));
    }
  }

  function chipRow(body) {
    var box = el('div', 'chips');
    body.appendChild(box);
    return box;
  }

  function setChips(box, list) {
    while (box.firstChild) { box.removeChild(box.firstChild); }
    for (var i = 0; i < list.length; i++) {
      box.appendChild(el('span', 'chip ' + (list[i][1] || 'badge-accent'), list[i][0]));
    }
  }

  function waveLabel(w) {
    if (w === 'sine') { return 'سینوسی (FOC)'; }
    return 'ذرات مستطیلی (6-step)';
  }

  function bindRange(key, cfg) {
    var sc = cfg.scale || 1;
    var c = PH.control({
      label: cfg.label,
      unit: cfg.unit,
      min: cfg.min,
      max: cfg.max,
      step: cfg.step,
      value: S[key] * sc,
      digits: cfg.digits,
      onInput: function (v) {
        if (v === null || v === undefined) { return; }
        var raw = v / sc;
        if (cfg.lo !== undefined && raw < cfg.lo) { raw = cfg.lo; }
        if (cfg.hi !== undefined && raw > cfg.hi) { raw = cfg.hi; }
        S[key] = raw;
        if (cfg.after) { cfg.after(raw); }
        refresh();
      }
    });
    binds.push({ key: key, c: c, sc: sc });
    return c;
  }

  function bindSelect(key, cfg) {
    var c = PH.control({
      label: cfg.label,
      type: 'select',
      options: cfg.options,
      value: S[key],
      onInput: function (v) {
        S[key] = v;
        refresh();
      }
    });
    binds.push({ key: key, c: c, sc: 1 });
    return c;
  }

  function sync() {
    for (var i = 0; i < binds.length; i++) {
      var b = binds[i];
      var g = b.c.get();
      var s = S[b.key];
      if (typeof s === 'number') {
        var cur = parseFloat(g);
        if (!(cur === cur) || Math.abs(cur / b.sc - s) > 1e-12) { b.c.set(s * b.sc); }
      } else if (String(g) !== String(s)) {
        b.c.set(s);
      }
    }
  }

  function refresh() {
    sync();
    for (var i = 0; i < updaters.length; i++) { updaters[i](); }
  }

  function card1(host) {
    var p = newCard(host, '۱. شبیه‌سازی گذرای راه‌اندازی', 'انتگرال‌گیری رو به جلوی معادله J·dω/dt = T_motor − T_load − B_fric·ω − T_fric0 و رسم ω(t) و T_motor(t)');
    addFormulas(p.body, [
      'معادله حرکت:   J·dω/dt = T_motor − T_load − B_fric·ω − T_fric0',
      'T_motor = k_t·I   تا ω_base   و   T_motor = P_max/ω_m   بالای ω_base   (ناحیه توان ثابت)',
      'ω_base = V_phase/k_e   ,   V_phase = V_bus/√3   ,   I = min(I_max, V_phase/Z)   ,   Z = √(R² + (ω_m·L)²)',
      'P_max = k_t·I·ω_base   ,   λ = N_ph·Φ   ,   k_t = (2/π)·p·λ  یا  (3/2)·p·λ   ,   n = ω_m·30/π'
    ]);

    var cWave = bindSelect('wave', {
      label: 'نوع درایو',
      options: [
        { value: 'trap', label: 'ذرات مستطیلی (6-step)' },
        { value: 'sine', label: 'سینوسی (FOC)' }
      ]
    });
    var cJ = bindRange('J', { label: 'اینرسی ماشین J', unit: '10⁻⁶ kg·m²', min: 2, max: 200, step: 0.5, digits: 1, scale: 1e6, lo: 2e-6, hi: 2e-4 });
    var cTl = bindRange('Tload', { label: 'گشتاور بار T_load', unit: 'N·m', min: 0.02, max: 12, step: 0.02, digits: 2 });
    var cB = bindRange('Bfric', { label: 'ضریب اصطکاک B_fric', unit: '10⁻⁶ N·m·s', min: 20, max: 2000, step: 5, digits: 0, scale: 1e6, lo: 2e-5, hi: 2e-3 });
    var cI = bindRange('Imax', { label: 'جریان بیشینه I_max', unit: 'A', min: 1, max: 60, step: 0.5, digits: 1 });
    var cV = bindRange('Vbus', { label: 'ولتاژ باس V_bus', unit: 'V', min: 12, max: 120, step: 1, digits: 0 });
    var cPhi = bindRange('Phi', { label: 'شار هر قطب Φ', unit: 'Wb', min: 0.0005, max: 0.02, step: 0.0001, digits: 4 });
    p.ctl.appendChild(cWave.root);
    p.ctl.appendChild(cJ.root);
    p.ctl.appendChild(cTl.root);
    p.ctl.appendChild(cB.root);
    p.ctl.appendChild(cI.root);
    p.ctl.appendChild(cV.root);
    p.ctl.appendChild(cPhi.root);

    p.body.appendChild(el('p', 'ph-note', 'شبیه‌سازی در دو مرحله اجرا می‌شود: مرحله اول راه‌اندازی از سکون با گشتاور بار لغزنده، و در مرحله دوم گشتاور بار به اندازه ضریب پله بالا می‌رود تا دنباله کاهش سرعت دیده شود. نشانگر متحرک روی محور زمان، حالت لحظه‌ای سیستم را نشان می‌دهد.'));

    var chips = chipRow(p.body);
    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 460);

    var sim = null;
    var playT = 0;
    var lastPhase = '';

    function runSim(q, kk) {
      var tau = clamp(4 * (q.J / Math.max(q.Bfric, 1e-9)), 0.35, 6);
      var tA = tau * 1.5;
      var tB = tau * 2.0;
      var Tl2 = Math.min(q.Tload * STEP_LOAD, 20);
      var a = integrate(q, kk, q.Tload, tA, N_STEPS);
      var b = integrate(q, kk, Tl2, tB, N_STEPS);
      var n = a.t.length;
      var total = n + b.t.length;
      var tt = new Array(total);
      var oo = new Array(total);
      var tm = new Array(total);
      var il = new Array(total);
      var tl = new Array(total);
      var i;
      for (i = 0; i < n; i++) {
        tt[i] = a.t[i];
        oo[i] = a.om[i];
        tm[i] = a.tm[i];
        il[i] = a.il[i];
        tl[i] = a.tl[i];
      }
      for (i = 0; i < b.t.length; i++) {
        tt[n + i] = b.t[i] + tA;
        oo[n + i] = b.om[i];
        tm[n + i] = b.tm[i];
        il[n + i] = b.il[i];
        tl[n + i] = b.tl[i];
      }
      return {
        t: tt, om: oo, tm: tm, il: il, tl: tl,
        tStep: tA, tEnd: tA + tB, Tl1: q.Tload, Tl2: Tl2,
        dt: tA / N_STEPS,
        ein: a.ein + b.ein, nSub: a.nSub + b.nSub,
        w1: a.om[n - 1], wf: b.om[b.om.length - 1]
      };
    }

    function metrics(s) {
      var n = s.om.length;
      var i;
      var wmax = 0;
      for (i = 0; i < n; i++) { if (s.om[i] > wmax) { wmax = s.om[i]; } }
      var tol = 0.02 * Math.max(s.wf, 1e-9);
      var settle = s.tEnd;
      for (i = 0; i < n; i++) {
        if (Math.abs(s.om[i] - s.wf) > tol) { settle = i + 1 < n ? s.t[i + 1] : s.tEnd; }
      }
      var over = s.w1 > 1e-9 ? ((wmax - s.w1) / s.w1) * 100 : 0;
      if (over < 0) { over = 0; }
      return { wmax: wmax, settle: settle, over: over };
    }

    function phaseAt(s, idx) {
      var n = s.om.length;
      if (idx < 1) { idx = 1; }
      if (idx > n - 2) { idx = n - 2; }
      var dt = s.t[idx + 1] - s.t[idx - 1];
      var dd = dt > 1e-12 ? (s.om[idx + 1] - s.om[idx - 1]) / dt : 0;
      var ref = Math.max(s.om[n - 1], 1e-9);
      if (dd > 0.02 * ref) { return ['شتاب‌گیری', 'badge-accent']; }
      if (dd < -0.02 * ref) { return ['کاهش سرعت', 'badge-warn']; }
      return ['سرعت پایدار', 'badge-good'];
    }

    function indexAt(s, t) {
      var n = s.t.length;
      var lo = 0;
      var hi = n - 1;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (s.t[mid] < t) { lo = mid + 1; } else { hi = mid; }
      }
      return lo;
    }

    function setBadges1(kk, s, m, ph) {
      setBadges(bad, [
        ['مرحله ۱ — راه‌اندازی از سکون با T_load = ' + fmt2(s.Tl1) + ' N·m تا t = ' + fmt3(s.tStep) + ' s', 'badge-good'],
        ['مرحله ۲ — پله بار تا T_load = ' + fmt2(s.Tl2) + ' N·m و دنباله کاهش سرعت', 'badge-warn'],
        ['گام زمانی نمونه‌برداری Δt = ' + fmt5(s.dt) + ' s با زیرگام تطبیقی برای پایداری', 'badge-accent'],
        ['ω_base = ' + fmt1(kk.ob) + ' rad/s  |  T_max = ' + fmt2(kk.Tmax) + ' N·m  |  P_max = ' + fmt1(kk.Pmax) + ' W  |  حالت: ' + ph[0], ph[1]]
      ]);
    }

    function refreshCard1() {
      var q = params();
      var kk = consts(q);
      sim = runSim(q, kk);
      var m = metrics(sim);
      var idx = indexAt(sim, playT);
      var ph = phaseAt(sim, idx);
      var I0 = current(q, kk, 0);
      var T0 = torqueOf(q, kk, 0);
      var nSub = sim.nSub;
      ro.update([
        { k: 'نوع درایو', v: waveLabel(q.wave), unit: '' },
        { k: 'اینرسی ماشین J', v: fmt1(q.J * 1e6), unit: '10⁻⁶ kg·m²' },
        { k: 'ضریب اصطکاک B_fric', v: fmt0(q.Bfric * 1e6), unit: '10⁻⁶ N·m·s' },
        { k: 'گشتاور اصطکاک ثابت T_fric0', v: fmt2(q.Tfric0), unit: 'N·m' },
        { k: 'ثابت زمانی مکانیکی τ = J/B_fric', v: fmt3(q.J / q.Bfric), unit: 's' },
        { k: 'بازه شبیه‌سازی t_end', v: fmt3(sim.tEnd), unit: 's' },
        { k: 'گام زمانی نمونه Δt', v: fmt5(sim.dt), unit: 's' },
        { k: 'تعداد نمونه‌های رسم', v: String(sim.t.length), unit: '-' },
        { k: 'تعداد گام‌های انتگرال‌گیری', v: String(nSub), unit: '-' },
        { k: 'پیوند شار λ = N_ph·Φ', v: fmt4(kk.lam), unit: 'Wb' },
        { kind: 'accent', k: 'ضریب گشتاور k_t', v: fmt4(kk.kt), unit: 'N·m/A' },
        { k: 'k_t ذراتی = (2/π)·p·λ', v: fmt4(kk.ktrap), unit: 'N·m/A' },
        { k: 'k_t سینوسی = (3/2)·p·λ', v: fmt4(kk.ksin), unit: 'N·m/A' },
        { kind: 'accent', k: 'ضریب ضد محرک k_e = (2/π)·p·λ', v: fmt4(kk.ke), unit: 'V·s/rad' },
        { kind: 'accent', k: 'V_phase = V_bus/√3', v: fmt2(kk.Vph), unit: 'V' },
        { kind: 'accent', k: 'ω_base = V_phase/k_e', v: fmt1(kk.ob), unit: 'rad/s' },
        { k: 'n_noload = ω_base·30/π', v: fmt0(kk.rpm), unit: 'rpm' },
        { k: 'امپدانس Z در ω = 0', v: fmt3(impedance(q, 0)), unit: 'Ω' },
        { kind: 'accent', k: 'جریان راه‌اندازی I در ω = 0', v: fmt2(I0), unit: 'A' },
        { kind: 'accent', k: 'گشتاور راه‌اندازی T_motor(0)', v: fmt3(T0), unit: 'N·m' },
        { k: 'گشتاور بیشینه T_max = k_t·I_max', v: fmt2(kk.Tmax), unit: 'N·m' },
        { kind: 'accent', k: 'توان بیشینه P_max = T_max·ω_base', v: fmt1(kk.Pmax), unit: 'W' },
        { kind: 'accent', k: 'گشتاور بار مرحله اول T_load', v: fmt2(sim.Tl1), unit: 'N·m' },
        { kind: 'accent', k: 'گشتاور بار مرحله دوم T_load', v: fmt2(sim.Tl2), unit: 'N·m' },
        { k: 'زمان اعمال پله بار t_step', v: fmt3(sim.tStep), unit: 's' },
        { kind: 'good', k: 'سرعت پایدار مرحله اول ω_1', v: fmt1(sim.w1), unit: 'rad/s' },
        { kind: 'good', k: 'سرعت نهایی ω_f', v: fmt1(sim.wf), unit: 'rad/s' },
        { kind: 'good', k: 'سرعت نهایی n_f', v: fmt0(sim.wf * 30 / PI), unit: 'rpm' },
        { kind: 'good', k: 'بیشترین سرعت ω_max', v: fmt1(m.wmax), unit: 'rad/s' },
        { k: 'بیشترین دور n_max', v: fmt0(m.wmax * 30 / PI), unit: 'rpm' },
        { kind: 'good', k: 'زمان نشست پس از پله بار (باند 2%)', v: fmt3(m.settle), unit: 's' },
        { kind: 'good', k: 'فراجهش نسبی روی فلات اول', v: fmt2(m.over), unit: '%' },
        { kind: 'good', k: 'انرژی کل جذب‌شده E', v: fmt4(sim.ein), unit: 'J' },
        { k: 'انرژی جنبشی ½·J·ω_f²', v: fmt4(0.5 * q.J * sim.wf * sim.wf), unit: 'J' },
        { kind: 'accent', k: 'جریان در سرعت نهایی', v: fmt2(sim.il[sim.il.length - 1]), unit: 'A' },
        { k: 'گشتاور موتور در سرعت نهایی', v: fmt3(sim.tm[sim.tm.length - 1]), unit: 'N·m' },
        { kind: ph[1] === 'badge-good' ? 'good' : (ph[1] === 'badge-warn' ? 'warn' : 'accent'), k: 'حالت لحظه‌ای سیستم', v: ph[0], unit: '' }
      ]);
      setChips(chips, [
        [waveLabel(q.wave), 'badge-accent'],
        ['ω_1 = ' + fmt0(sim.w1 * 30 / PI) + ' rpm', 'badge-good'],
        ['ω_f = ' + fmt0(sim.wf * 30 / PI) + ' rpm', 'badge-warn'],
        ['t_settle = ' + fmt3(m.settle) + ' s', 'badge-accent'],
        ['E = ' + fmt4(sim.ein) + ' J', 'badge-accent']
      ]);
      setBadges1(kk, sim, m, ph);
      drawCard1(idx);
      lastPhase = ph[0];
    }

    function drawCard1(idx) {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      var kk = consts(params());
      var m = metrics(sim);
      var tEnd = sim.tEnd;
      var i;
      var wmax = 0;
      for (i = 0; i < sim.om.length; i++) { if (sim.om[i] > wmax) { wmax = sim.om[i]; } }
      var omTop = Math.max(wmax * 1.15, kk.ob * 0.4, 1);
      var tmTop = Math.max(kk.Tmax, sim.Tl1, sim.Tl2) * 1.25;

      var box = { x: 78, y: 58, w: w - 78 - 86, h: h - 58 - 78 };
      var xt = [];
      var yt = [];
      var yrt = [];
      for (i = 0; i <= 4; i++) {
        xt.push((tEnd * i) / 4);
        yt.push((omTop * i) / 4);
        yrt.push((tmTop * i) / 4);
      }
      var ax = plot(ctx, box, [0, tEnd], [0, omTop], xt, yt, 't [s]', 'ω_m [rad/s]',
        function (v) { return fmt2(v); }, function (v) { return fmt0(v); });
      var Tr = axisRight(ctx, box, [0, tmTop], yrt, function (v) { return fmt1(v); });
      label(ctx, box.x + box.w + 6, box.y - 10, 'T [N·m]', COL.c4, 'left', 'bottom', FONT_S);
      label(ctx, box.x - 34, box.y + 4, 'ω_m [rad/s]', COL.faint, 'left', 'bottom', FONT_S);

      var xs = function (t) { return ax.X(Math.min(Math.max(t, 0), tEnd)); };
      var iLast = sim.t.length - 1;
      line(ctx, [[xs(0), Tr(sim.tm[0])], [xs(sim.tStep), Tr(sim.Tl1)]], COL.c4, 1.8, [6, 4]);
      line(ctx, [[xs(sim.tStep), Tr(sim.Tl1)], [xs(sim.tStep), Tr(sim.Tl2)], [xs(tEnd), Tr(sim.Tl2)]], COL.c4, 1.8, [6, 4]);
      line(ctx, [[xs(sim.tStep), box.y - 8], [xs(sim.tStep), box.y + box.h]], COL.c5, 1.4, [3, 3]);
      plabel(ctx, xs(sim.tStep) + 6, box.y + 10, 'پله بار', COL.c5, 'left', 'top', FONT_S);
      label(ctx, xs(sim.tStep) + 6, box.y + 22, fmt2(sim.Tl1) + ' → ' + fmt2(sim.Tl2) + ' N·m', COL.faint, 'left', 'top', FONT_XS);

      var pw = [];
      var pt = [];
      var area = [[xs(0), box.y + box.h]];
      for (i = 0; i <= iLast; i += 2) {
        var px0 = xs(sim.t[i]);
        var py0 = ax.Y(Math.min(sim.om[i], omTop));
        pw.push([px0, py0]);
        pt.push([px0, Tr(Math.min(sim.tm[i], tmTop))]);
        area.push([px0, py0]);
      }
      area.push([xs(tEnd), box.y + box.h]);
      fillPoly(ctx, area, 'rgba(78,163,255,0.10)', 1);
      line(ctx, pw, COL.c1, 2.6);
      line(ctx, pt, COL.c2, 2.2);

      var yf = ax.Y(Math.min(sim.wf, omTop));
      line(ctx, [[xs(0), yf], [xs(tEnd), yf]], COL.c3, 1.2, [2, 4]);
      label(ctx, box.x + 4, yf - 6, 'ω_f = ' + fmt1(sim.wf) + ' rad/s', COL.c3, 'left', 'bottom', FONT_S);
      var y1 = ax.Y(Math.min(sim.w1, omTop));
      line(ctx, [[xs(0), y1], [xs(sim.tStep), y1]], COL.c3, 1, [2, 4]);

      var ii = Math.min(Math.max(idx, 0), iLast);
      var px = xs(sim.t[ii]);
      line(ctx, [[px, box.y - 4], [px, box.y + box.h]], '#e8eef7', 1, [2, 3]);
      dot(ctx, px, ax.Y(Math.min(sim.om[ii], omTop)), 4.6, COL.c1);
      dot(ctx, px, Tr(Math.min(sim.tm[ii], tmTop)), 4.6, COL.c2);

      label(ctx, 10, 16, 'ω(t) and T_motor(t) — forward Euler integration of J·dω/dt', COL.text, 'left', 'top', FONT_B);
      label(ctx, w - 10, 16, 'ω_m = ' + fmt1(sim.om[ii]) + ' rad/s  |  n = ' + fmt0(sim.om[ii] * 30 / PI) + ' rpm  |  T = ' + fmt3(sim.tm[ii]) + ' N·m  |  I = ' + fmt2(sim.il[ii]) + ' A', COL.faint, 'right', 'top', FONT_S);

      var ly = box.y + box.h + 40;
      rect(ctx, 12, ly - 8, 10, 9, COL.c1, 0.9);
      label(ctx, 26, ly - 3, 'ω_m(t)', COL.c1, 'left', 'middle', FONT_S);
      rect(ctx, 92, ly - 8, 10, 9, COL.c2, 0.9);
      label(ctx, 106, ly - 3, 'T_motor(t)', COL.c2, 'left', 'middle', FONT_S);
      rect(ctx, 192, ly - 8, 10, 9, COL.c4, 0.9);
      label(ctx, 206, ly - 3, 'T_load(t)', COL.c4, 'left', 'middle', FONT_S);
      rect(ctx, 282, ly - 8, 10, 9, COL.c3, 0.9);
      label(ctx, 296, ly - 3, 'ω_1 و ω_f', COL.c3, 'left', 'middle', FONT_S);
      var foot = [
        'ω_max = ' + fmt1(m.wmax) + ' rad/s   |   ω_1 = ' + fmt1(sim.w1) + ' rad/s   |   ω_f = ' + fmt1(sim.wf) + ' rad/s   |   t_settle = ' + fmt3(m.settle) + ' s',
        'فراجهش = ' + fmt2(m.over) + ' %   |   انرژی جذب‌شده = ' + fmt4(sim.ein) + ' J   |   تعداد گام انتگرال‌گیری = ' + String(sim.nSub)
      ];
      for (i = 0; i < foot.length; i++) {
        plabel(ctx, w - 10, ly + 16 + i * 18, foot[i], COL.faint, 'right', 'top', FONT_S);
      }
    }

    updaters.push(refreshCard1);

    var lastTs = 0;
    addAnim(function (ts) {
      if (!sim) { return; }
      var t = typeof ts === 'number' ? ts : 0;
      var dt = lastTs > 0 ? t - lastTs : 0;
      lastTs = t;
      if (dt > 0 && dt < 250) {
        playT = playT + dt * 0.0006 * sim.tEnd;
        if (playT > sim.tEnd) { playT = 0; }
      }
      var idx = indexAt(sim, playT);
      var ph = phaseAt(sim, idx);
      if (ph[0] !== lastPhase) {
        lastPhase = ph[0];
        setBadges1(consts(params()), sim, metrics(sim), ph);
      }
      drawCard1(idx);
    });

    refreshCard1();
  }

  function card2(host) {
    var p = newCard(host, '۲. تلفات و راندمان', 'تفکیک تلفات مس، آهن، تلفات گردشی و اصطکاک مکانیکی، نمودار میله‌ای سهم درصدی و منحنی η بر حسب گشتاور بار');
    addFormulas(p.body, [
      'f = p·ω_m/(2π)          P_stein = 1.5e-3·f·B_core^1.6·V_core          P_eddy = 2e-5·f²·B_core²·V_core',
      'P_cu = 3·I²·R          P_mech = B_fric·ω_m          P_out = T·ω_m',
      'P_total = P_out + P_cu + P_stein + P_eddy + P_mech',
      'η = P_out / (P_out + P_cu + P_stein + P_eddy + P_mech)'
    ]);

    var cI = bindRange('Imax', { label: 'جریان بیشینه I_max', unit: 'A', min: 1, max: 60, step: 0.5, digits: 1 });
    var cOm = bindRange('om', { label: 'سرعت مکانیکی ω_m', unit: 'rad/s', min: 0, max: 1200, step: 1, digits: 1 });
    var cBc = bindRange('Bcore', { label: 'چگالی شار هسته B_core', unit: 'T', min: 0.2, max: 2.5, step: 0.01, digits: 2 });
    var cVc = bindRange('Vcore', { label: 'حجم هسته V_core', unit: '10⁻⁶ m³', min: 1, max: 200, step: 0.5, digits: 1, scale: 1e6, lo: 1e-6, hi: 2e-4 });
    var cB = bindRange('Bfric', { label: 'ضریب اصطکاک B_fric', unit: '10⁻⁶ N·m·s', min: 20, max: 2000, step: 5, digits: 0, scale: 1e6, lo: 2e-5, hi: 2e-3 });
    var cTl = bindRange('Tload', { label: 'گشتاور بار T_load', unit: 'N·m', min: 0.02, max: 12, step: 0.02, digits: 2 });
    p.ctl.appendChild(cI.root);
    p.ctl.appendChild(cOm.root);
    p.ctl.appendChild(cBc.root);
    p.ctl.appendChild(cVc.root);
    p.ctl.appendChild(cB.root);
    p.ctl.appendChild(cTl.root);

    p.body.appendChild(el('p', 'ph-note', 'در نوار بالا سهم هر جزء از P_total و در نوار پایین سهم هر تلفات از مجموع تلفات نشان داده شده است. منحنی η بر حسب T_load با ثابت نگه‌داشتن ω_m، B_core، V_core و B_fric رسم می‌شود و جریان مورد نیاز از I = T_load/k_t تعیین می‌گردد.'));

    var chips = chipRow(p.body);
    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cvA = newCanvas(p.body, 280);
    var cvB = newCanvas(p.body, 340);

    function etaCurve(q, kk) {
      var fe = ironLosses(q, q.om);
      var fixed = fe.Pstein + fe.Peddy + q.Bfric * q.om;
      var tmax = Math.max(kk.Tmax, 0.05);
      var ts = [];
      var es = [];
      var N = 160;
      var i;
      for (i = 0; i <= N; i++) {
        var T = (tmax * i) / N;
        var Ireq = kk.kt > 0 ? Math.min(q.Imax, T / kk.kt) : q.Imax;
        var Pout = T * q.om;
        var Pt = Pout + 3 * Ireq * Ireq * q.R + fixed;
        ts.push(T);
        es.push(Pt > 0 ? Pout / Pt : 0);
      }
      var peak = 0;
      for (i = 0; i < es.length; i++) { if (es[i] > peak) { peak = es[i]; } }
      var cS = kk.kt > 0 ? 3 * q.R / (kk.kt * kk.kt) : 0;
      var Tpeak = cS > 0 ? Math.min(Math.sqrt(fixed / cS), tmax) : tmax;
      return { t: ts, eta: es, peak: peak, Tpeak: Tpeak, fixed: fixed, tmax: tmax };
    }

    updaters.push(function () {
      var q = params();
      var kk = consts(q);
      var I = Math.min(q.Imax, kk.Vph / impedance(q, q.om));
      var T = kk.kt * I;
      var L = losses(q, I, q.om, T);
      var ls = L.Pcu + L.Pstein + L.Peddy + L.Pmech;
      var pc = function (v) { return L.Ptot > 0 ? (v / L.Ptot) * 100 : 0; };
      var cv2 = etaCurve(q, kk);
      ro.update([
        { k: 'نوع درایو', v: waveLabel(q.wave), unit: '' },
        { kind: 'accent', k: 'ضریب گشتاور k_t', v: fmt4(kk.kt), unit: 'N·m/A' },
        { kind: 'accent', k: 'جریان کاری I = min(I_max, V_phase/Z)', v: fmt2(I), unit: 'A' },
        { kind: 'accent', k: 'سرعت مکانیکی ω_m', v: fmt1(q.om), unit: 'rad/s' },
        { k: 'دور موتور n = ω_m·30/π', v: fmt0(q.om * 30 / PI), unit: 'rpm' },
        { kind: 'accent', k: 'فرکانس f = p·ω_m/(2π)', v: fmt2(L.f), unit: 'Hz' },
        { k: 'چگالی شار هسته B_core', v: fmt2(q.Bcore), unit: 'T' },
        { k: 'حجم هسته V_core', v: fmt1(q.Vcore * 1e6) + '×10⁻⁶', unit: 'm³' },
        { k: 'ضریب اصطکاک B_fric', v: fmt0(q.Bfric * 1e6), unit: '10⁻⁶ N·m·s' },
        { kind: 'accent', k: 'گشتاور T = k_t·I', v: fmt3(T), unit: 'N·m' },
        { kind: 'accent', k: 'گشتاور بیشینه T_max', v: fmt2(kk.Tmax), unit: 'N·m' },
        { k: 'گشتاور بار جاری T_load', v: fmt2(q.Tload), unit: 'N·m' },
        { kind: 'good', k: 'توان خروجی P_out = T·ω_m', v: fmt1(L.Pout), unit: 'W' },
        { k: 'تلفات مس P_cu = 3·I²·R', v: fmt2(L.Pcu), unit: 'W' },
        { k: 'تلفات آهن P_stein', v: fmt5(L.Pstein), unit: 'W' },
        { k: 'تلفات گردشی P_eddy', v: fmt5(L.Peddy), unit: 'W' },
        { k: 'تلفات مکانیکی P_mech = B_fric·ω_m', v: fmt4(L.Pmech), unit: 'W' },
        { kind: 'accent', k: 'مجموع تلفات P_loss', v: fmt3(ls), unit: 'W' },
        { kind: 'accent', k: 'توان کل P_total', v: fmt1(L.Ptot), unit: 'W' },
        { kind: L.eta > 0.9 ? 'good' : (L.eta > 0.7 ? 'accent' : 'warn'), k: 'راندمان η = P_out/P_total', v: fmt4(L.eta), unit: '-' },
        { k: 'راندمان درصدی', v: fmt2(L.eta * 100), unit: '%' },
        { k: 'سهم P_out از P_total', v: fmt2(pc(L.Pout)), unit: '%' },
        { k: 'سهم P_cu از P_total', v: fmt2(pc(L.Pcu)), unit: '%' },
        { k: 'سهم P_stein از P_total', v: fmt5(pc(L.Pstein)), unit: '%' },
        { k: 'سهم P_eddy از P_total', v: fmt5(pc(L.Peddy)), unit: '%' },
        { k: 'سهم P_mech از P_total', v: fmt2(pc(L.Pmech)), unit: '%' },
        { kind: 'accent', k: 'بیشینه راندمان روی منحنی', v: fmt4(cv2.peak), unit: '-' },
        { k: 'گشتاور متناظر با بیشینه راندمان', v: fmt3(cv2.Tpeak), unit: 'N·m' },
        { k: 'تلفات ثابت بدون مس', v: fmt4(cv2.fixed), unit: 'W' }
      ]);
      setChips(chips, [
        ['η = ' + fmt2(L.eta * 100) + ' %', L.eta > 0.9 ? 'badge-good' : 'badge-warn'],
        ['P_out = ' + fmt1(L.Pout) + ' W', 'badge-accent'],
        ['P_cu = ' + fmt2(L.Pcu) + ' W', 'badge-accent'],
        ['P_loss = ' + fmt3(ls) + ' W', 'badge-warn'],
        ['η_max = ' + fmt2(cv2.peak * 100) + ' %', 'badge-good']
      ]);
      setBadges(bad, [
        ['P_out = ' + fmt1(L.Pout) + ' W  |  P_cu = ' + fmt2(L.Pcu) + ' W  |  P_stein = ' + fmt5(L.Pstein) + ' W  |  P_eddy = ' + fmt5(L.Peddy) + ' W  |  P_mech = ' + fmt4(L.Pmech) + ' W', 'badge-accent'],
        ['P_total = ' + fmt1(L.Ptot) + ' W  ⇒  η = ' + fmt4(L.eta) + ' = ' + fmt2(L.eta * 100) + ' %', L.eta > 0.9 ? 'badge-good' : 'badge-warn'],
        ['جریان لازم برای هر گشتاور:  I = T_load/k_t  و  T_max = ' + fmt2(kk.Tmax) + ' N·m در I_max = ' + fmt1(q.Imax) + ' A', 'badge-accent'],
        ['نقطه کاری جاری T_load = ' + fmt2(q.Tload) + ' N·m روی منحنی η نشان داده شده است', 'badge-good']
      ]);
      drawBars(cvA, q, kk, I, T, L, ls);
      drawEta(cvB, q, kk, L, cv2);
    });

    function drawBars(c, q, kk, I, T, L, ls) {
      var s = prep(c);
      var ctx = s.ctx, w = s.w, h = s.h;
      var items = [
        { l: 'P_out = T·ω_m', v: L.Pout, c: COL.c3 },
        { l: 'P_cu = 3·I²·R', v: L.Pcu, c: COL.c1 },
        { l: 'P_stein', v: L.Pstein, c: COL.c5 },
        { l: 'P_eddy', v: L.Peddy, c: COL.c6 },
        { l: 'P_mech = B_fric·ω_m', v: L.Pmech, c: COL.c2 }
      ];
      var x0 = 22;
      var bw = w - x0 - 22;
      var i;
      var cx = x0;
      label(ctx, x0, 14, 'سهم هر جزء از P_total = ' + fmt1(L.Ptot) + ' W', COL.text, 'left', 'top', FONT_B);
      for (i = 0; i < items.length; i++) {
        var pw = Math.max((L.Ptot > 0 ? (items[i].v / L.Ptot) : 0) * bw, 0);
        rect(ctx, cx, 32, pw, 32, items[i].c, 0.92);
        if (pw > 36) {
          label(ctx, cx + pw / 2, 48, fmt1((items[i].v / L.Ptot) * 100) + '%', '#0d1420', 'center', 'middle', FONT_S);
        }
        cx += pw;
      }
      ctx.save();
      ctx.strokeStyle = COL.axis;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, 32, bw, 32);
      ctx.restore();

      label(ctx, x0, 76, 'سهم هر تلفات از مجموع تلفات = ' + fmt3(ls) + ' W', COL.text, 'left', 'top', FONT_S);
      var lx = x0;
      for (i = 1; i < items.length; i++) {
        var lw2 = Math.max((ls > 0 ? (items[i].v / ls) : 0) * bw, 0);
        rect(ctx, lx, 90, lw2, 22, items[i].c, 0.92);
        lx += lw2;
      }
      ctx.save();
      ctx.strokeStyle = COL.axis;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, 90, bw, 22);
      ctx.restore();

      for (i = 0; i < items.length; i++) {
        var y = 136 + i * 25;
        rect(ctx, x0, y - 8, 11, 11, items[i].c, 0.95);
        plabel(ctx, x0 + 210, y - 2, items[i].l, COL.text, 'right', 'middle', FONT_S);
        label(ctx, x0 + 320, y - 2, fmt3(items[i].v) + ' W', items[i].c, 'right', 'middle', FONT_S);
        label(ctx, w - 22, y - 2, fmt2((items[i].v / L.Ptot) * 100) + ' % از P_total', COL.faint, 'right', 'middle', FONT_XS);
      }
      var yf = 136 + items.length * 25 + 6;
      plabel(ctx, w - 22, yf, 'راندمان η = P_out/P_total = ' + fmt4(L.eta) + '  (' + fmt2(L.eta * 100) + ' %)   |   I = ' + fmt2(I) + ' A   |   T = ' + fmt3(T) + ' N·m', L.eta > 0.9 ? COL.c3 : COL.c2, 'right', 'top', FONT_B);
    }

    function drawEta(c, q, kk, L, cv2) {
      var s = prep(c);
      var ctx = s.ctx, w = s.w, h = s.h;
      var tmax = cv2.tmax;
      var box = { x: 78, y: 58, w: w - 78 - 94, h: h - 58 - 72 };
      var xt = [];
      var yt = [];
      var i;
      for (i = 0; i <= 4; i++) {
        xt.push((tmax * i) / 4);
        yt.push(i / 4);
      }
      var ax = plot(ctx, box, [0, tmax], [0, 1.02], xt, yt, 'T_load [N·m]', 'η = P_out / P_total',
        function (v) { return fmt1(v); }, function (v) { return fmt2(v); });

      var pts = [];
      var area = [];
      for (i = 0; i < cv2.t.length; i++) {
        pts.push([ax.X(cv2.t[i]), ax.Y(Math.min(cv2.eta[i], 1.02))]);
      }
      area = pts.slice();
      area.push([ax.X(tmax), box.y + box.h]);
      area.push([ax.X(0), box.y + box.h]);
      fillPoly(ctx, area, 'rgba(87,217,163,0.12)', 1);
      line(ctx, pts, COL.c3, 2.6);

      var tp = cv2.Tpeak;
      line(ctx, [[ax.X(tp), box.y], [ax.X(tp), box.y + box.h]], COL.c5, 1.4, [4, 3]);
      dot(ctx, ax.X(tp), ax.Y(Math.min(cv2.peak, 1.02)), 4.5, COL.c5);
      var tx = ax.X(tp) + (ax.X(tp) > box.x + box.w * 0.6 ? -6 : 6);
      var ta = ax.X(tp) > box.x + box.w * 0.6 ? 'right' : 'left';
      label(ctx, tx, box.y + 12, 'η_max = ' + fmt4(cv2.peak), COL.c5, ta, 'top', FONT_S);
      label(ctx, tx, box.y + 24, 'T_load = ' + fmt2(tp) + ' N·m', COL.faint, ta, 'top', FONT_XS);

      var Tc = Math.min(q.Tload, tmax);
      var Ic = kk.kt > 0 ? Math.min(q.Imax, q.Tload / kk.kt) : q.Imax;
      var PoutC = q.Tload * q.om;
      var PtC = PoutC + 3 * Ic * Ic * q.R + cv2.fixed;
      var etaC = PtC > 0 ? PoutC / PtC : 0;
      line(ctx, [[ax.X(Tc), box.y], [ax.X(Tc), box.y + box.h]], COL.c4, 1.6, [3, 3]);
      dot(ctx, ax.X(Tc), ax.Y(Math.min(etaC, 1.02)), 5.5, COL.c4);
      ring(ctx, ax.X(Tc), ax.Y(Math.min(etaC, 1.02)), 9, COL.c4, 1.2);
      label(ctx, ax.X(Tc), box.y + box.h + 8, 'نقطه کاری', COL.c4, 'center', 'top', FONT_XS);
      label(ctx, ax.X(Tc), box.y + box.h + 19, fmt4(etaC), COL.c4, 'center', 'top', FONT_XS);

      label(ctx, 10, 16, 'η versus T_load at fixed ω_m, with I = T_load/k_t', COL.text, 'left', 'top', FONT_B);
      label(ctx, w - 10, 16, 'ω_m = ' + fmt1(q.om) + ' rad/s  |  I_max = ' + fmt1(q.Imax) + ' A  |  T_max = ' + fmt2(kk.Tmax) + ' N·m', COL.faint, 'right', 'top', FONT_S);

      var ly = box.y + box.h + 44;
      rect(ctx, 12, ly - 8, 10, 9, COL.c3, 0.9);
      label(ctx, 26, ly - 3, 'η(T_load)', COL.c3, 'left', 'middle', FONT_S);
      rect(ctx, 92, ly - 8, 10, 9, COL.c4, 0.9);
      label(ctx, 106, ly - 3, 'نقطه کاری جاری', COL.c4, 'left', 'middle', FONT_S);
      rect(ctx, 202, ly - 8, 10, 9, COL.c5, 0.9);
      label(ctx, 216, ly - 3, 'بیشینه η', COL.c5, 'left', 'middle', FONT_S);
      var foot = [
        'I_max·R = ' + fmt3(q.Imax * q.Imax * q.R) + ' Ω·A²   |   P_cu در I_max = ' + fmt2(3 * q.Imax * q.Imax * q.R) + ' W   |   P_out در T_max = ' + fmt1(kk.Tmax * q.om) + ' W',
        'تلفات ثابت بدون مس = ' + fmt4(cv2.fixed) + ' W   |   راندمان نقطه کاری = ' + fmt4(etaC) + '   |   راندمان در I_max = ' + fmt4(L.eta)
      ];
      for (i = 0; i < foot.length; i++) {
        plabel(ctx, w - 10, ly + 16 + i * 18, foot[i], COL.faint, 'right', 'top', FONT_S);
      }
    }
  }

  function cleanup() {
    if (visObs) { visObs.disconnect(); }
    if (rafId !== null && typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(rafId); }
    rafId = null;
    anims = [];
    for (var i = 0; i < canvases.length; i++) {
      if (canvases[i] && canvases[i].destroy) { canvases[i].destroy(); }
    }
    canvases = [];
    updaters = [];
    binds = [];
    visHost = null;
  }

  function build(host) {
    resetAnim(host);
    var wrap = PH.grid(host, 1);
    card1(wrap);
    card2(wrap);
    refresh();
    return cleanup;
  }

  PH.register('motors-power', {
    title: 'موتور BLDC — دینامیک و تلفات',
    subtitle: 'شبیه‌سازی گذرای راه‌اندازی با انتگرال‌گیری رو به جلو، تفکیک تلفات و راندمان',
    build: build
  });
}());
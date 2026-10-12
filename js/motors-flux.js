(function () {
  'use strict';

  var PH = window.PH;
  if (!PH) { return; }

  var PI = Math.PI;
  var MU0 = 4 * PI * 1e-7;
  var NGAPS = 2;
  var T_AIR = 0.02;
  var H_MAG = 0.008;
  var RHO_M = 8960;
  var G_REF_R = 0.0003;
  var G_REF_A = 0.001;
  var IRON_R = 0.65;
  var IRON_A = 0.55;
  var N_NOM = 6000;
  var LS = 0.05;

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

  var PARAMS = [
    { key: 'B', label: 'B', hint: 'چگالی شار شکاف' },
    { key: 'ro', label: 'r_o', hint: 'شعاع بیرونی' },
    { key: 'ri', label: 'r_i', hint: 'شعاع داخلی' },
    { key: 'ls', label: 'l_stack', hint: 'طول استک شعاعی' },
    { key: 'k', label: 'k', hint: 'ضریب شکل موج' },
    { key: 'g', label: 'g', hint: 'شکاف هوایی' }
  ];

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
    B: 0.8,
    ro: 0.150,
    ri: 0.090,
    ls: 0.080,
    k: 1.0,
    wave: 'sine',
    g: 0.001,
    H: 1200,
    arch: 'both',
    topo: 'single',
    spar: 'T',
    sout: 'T',
    spert: 10
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
    var ro = clamp(S.ro, 0.03, 0.40);
    return {
      B: clamp(S.B, 0.05, 1.60),
      ro: ro,
      ri: clamp(S.ri, 0.008, ro - 0.004),
      ls: clamp(S.ls, 0.004, 0.40),
      k: clamp(S.k, 0.40, 1.10),
      g: clamp(S.g, 0.00005, 0.0050),
      H: clamp(S.H, 0, 200000)
    };
  }

  function perturb(p, key, frac) {
    var q = { B: p.B, ro: p.ro, ri: p.ri, ls: p.ls, k: p.k, g: p.g, H: p.H };
    q[key] = q[key] * (1 + frac);
    var ro = clamp(q.ro, 0.03, 0.40);
    return {
      B: clamp(q.B, 0.05, 1.60),
      ro: ro,
      ri: clamp(q.ri, 0.008, ro - 0.004),
      ls: clamp(q.ls, 0.004, 0.40),
      k: clamp(q.k, 0.40, 1.10),
      g: clamp(q.g, 0.00005, 0.0050),
      H: clamp(q.H, 0, 200000)
    };
  }

  function ev(p, Br, Ba) {
    var dR2 = Math.max(p.ro * p.ro - p.ri * p.ri, 0);
    var d3 = Math.max(p.ro * p.ro * p.ro - p.ri * p.ri * p.ri, 0);
    var tauR = p.k * Br * Br / (2 * MU0);
    var tauA = p.k * Ba * Ba / (2 * MU0);
    var Tr = (2 * PI / 3) * tauR * p.ls * d3 * NGAPS;
    var Ta = (PI / 3) * tauA * d3;
    var Ar = PI * dR2;
    var Vr = Ar * p.ls;
    var depth = 2 * p.g + 2 * T_AIR + H_MAG;
    var Va = Ar * depth;
    var w = N_NOM * 2 * PI / 60;
    return {
      Br: Br, Ba: Ba, tauR: tauR, tauA: tauA, Tr: Tr, Ta: Ta,
      Ar: Ar, Vr: Vr, Va: Va, depth: depth,
      mr: Vr * RHO_M, ma: Va * RHO_M,
      tdR: Vr > 0 ? Tr / Vr : 0,
      tdA: Va > 0 ? Ta / Va : 0,
      stR: Vr > 0 ? Tr / (Vr * RHO_M) : 0,
      stA: Va > 0 ? Ta / (Va * RHO_M) : 0,
      Fa: Br * Br * Ar / (2 * MU0),
      ratio: Ta > 0 ? Tr / Ta : 0,
      w: w,
      pdR: Vr > 0 ? (Tr * w) / Vr / 1000 : 0,
      pdA: Va > 0 ? (Ta * w) / Va / 1000 : 0
    };
  }

  function design(p) {
    return ev(p, p.B, p.B);
  }

  function magnetMMF(p) {
    return p.H * H_MAG;
  }

  function gapB(p) {
    var fm = magnetMMF(p);
    return { Br: (MU0 * fm) / p.g, Ba: (MU0 * fm) / (2 * p.g) };
  }

  function gapDesign(p) {
    var b = gapB(p);
    return ev(p, b.Br, b.Ba);
  }

  function modeOf(key) {
    return key === 'g' ? 'gap' : 'design';
  }

  function outputs(p, mode, out) {
    var r = mode === 'gap' ? gapDesign(p) : design(p);
    if (out === 'TD') { return { R: r.tdR, A: r.tdA }; }
    if (out === 'M') { return { R: r.mr, A: r.ma }; }
    if (out === 'F') { return { R: r.Fa, A: r.Fa }; }
    return { R: r.Tr, A: r.Ta };
  }

  function elasticity(p, key, out, h) {
    var up = outputs(perturb(p, key, h), modeOf(key), out);
    var dn = outputs(perturb(p, key, -h), modeOf(key), out);
    var den = Math.log(1 + h) - Math.log(1 - h);
    var eR = 0, eA = 0;
    if (dn.R > 0 && up.R > 0) { eR = (Math.log(up.R) - Math.log(dn.R)) / den; }
    if (dn.A > 0 && up.A > 0) { eA = (Math.log(up.A) - Math.log(dn.A)) / den; }
    return { R: eR, A: eA };
  }

  function pctOf(v, base) {
    if (base === 0) { return 0; }
    return ((v - base) / Math.abs(base)) * 100;
  }

  function fmt(v, d) {
    if (typeof v !== 'number' || !isFinite(v)) { return '-'; }
    var a = Math.abs(v);
    if (a !== 0 && (a >= 1e7 || a < 1e-4)) { return v.toExponential(2); }
    return PH.num(v, d === undefined ? 3 : d);
  }

  function fmt0(v) { return fmt(v, 0); }
  function fmt1(v) { return fmt(v, 1); }
  function fmt2(v) { return fmt(v, 2); }

  function fsp(v, d) {
    if (typeof v !== 'number' || !isFinite(v)) { return '-'; }
    return (v >= 0 ? '+' : '') + PH.num(v, d === undefined ? 2 : d);
  }

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
    ctx.fillRect(x, y, w, h);
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

  function arc(ctx, x, y, r, a0, a1, color, lw) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 2;
    ctx.beginPath();
    ctx.arc(x, y, Math.abs(r), a0, a1, a1 < a0);
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

  function arcArrow(ctx, x, y, r, a0, a1, color, lw, head) {
    arc(ctx, x, y, r, a0, a1, color, lw);
    var hs = head || 9;
    var x2 = x + r * Math.cos(a1);
    var y2 = y + r * Math.sin(a1);
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hs * Math.cos(a1 - 0.42), y2 - hs * Math.sin(a1 - 0.42));
    ctx.lineTo(x2 - hs * Math.cos(a1 + 0.42), y2 - hs * Math.sin(a1 + 0.42));
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

  function dimLine(ctx, x1, y1, x2, y2, str, color) {
    var col = color || COL.faint;
    line(ctx, [[x1, y1], [x2, y2]], col, 1, [3, 3]);
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) {
      line(ctx, [[x1, y1 - 4], [x1, y1 + 4]], col, 1);
      line(ctx, [[x2, y2 - 4], [x2, y2 + 4]], col, 1);
      label(ctx, mx, my - 5, str, col, 'center', 'alphabetic', FONT_S);
    } else {
      line(ctx, [[x1 - 4, y1], [x1 + 4, y1]], col, 1);
      line(ctx, [[x2 - 4, y2], [x2 + 4, y2]], col, 1);
      label(ctx, mx + 6, my, str, col, 'left', 'middle', FONT_S);
    }
  }

  function plot(ctx, box, xd, yd, xt, yt, xl, yl) {
    var i;
    var x0 = box.x, y0 = box.y, bw = box.w, bh = box.h;
    var X = function (v) { return x0 + (bw * (v - xd[0])) / (xd[1] - xd[0]); };
    var Y = function (v) { return y0 + bh - (bh * (v - yd[0])) / (yd[1] - yd[0]); };
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
    for (i = 0; i < xt.length; i++) { ctx.fillText(String(xt[i]), X(xt[i]), y0 + bh + 6); }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (i = 0; i < yt.length; i++) { ctx.fillText(String(yt[i]), x0 - 6, Y(yt[i])); }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COL.faint;
    ctx.font = FONT_S;
    ctx.fillText(xl, x0 + bw - 2, y0 + bh + 22);
    ctx.save();
    ctx.translate(x0 - 38, y0 + 4);
    ctx.rotate(-PI / 2);
    ctx.fillText(yl, 0, 0);
    ctx.restore();
    ctx.restore();
    return { X: X, Y: Y, box: box };
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

  function verdictTag(v) {
    if (v > 0.005) { return 'badge-good'; }
    if (v < -0.005) { return 'badge-bad'; }
    return 'badge-warn';
  }

  function bindRange(key, cfg) {
    var c = PH.control({
      label: cfg.label,
      unit: cfg.unit,
      min: cfg.min,
      max: cfg.max,
      step: cfg.step,
      value: S[key],
      digits: cfg.digits,
      onInput: function (v) {
        if (v === null || v === undefined) { return; }
        S[key] = v;
        if (cfg.after) { cfg.after(v); }
        refresh();
      }
    });
    binds.push({ key: key, c: c });
    return c;
  }

  function bindSelect(key, cfg, after) {
    var c = PH.control({
      label: cfg.label,
      type: 'select',
      options: cfg.options,
      value: S[key],
      onInput: function (v) {
        S[key] = v;
        if (after) { after(v); }
        refresh();
      }
    });
    binds.push({ key: key, c: c });
    return c;
  }

  function sync() {
    for (var i = 0; i < binds.length; i++) {
      var b = binds[i];
      if (String(b.c.get()) !== String(S[b.key])) { b.c.set(S[b.key]); }
    }
  }

  function refresh() {
    sync();
    for (var i = 0; i < updaters.length; i++) { updaters[i](); }
  }

  function budget(p, r, axial) {
    var vGap = r.Ar * 2 * p.g;
    var vMag = r.Ar * (axial ? H_MAG : 2 * H_MAG);
    var vRest = Math.max(r.Ar * (axial ? r.depth : p.ls) - vGap - vMag, 0);
    var iron = vRest * (axial ? IRON_A : IRON_R);
    var cop = Math.max(vRest - iron, 0);
    return { gap: vGap, mag: vMag, iron: iron, cop: cop, total: vGap + vMag + iron + cop };
  }

  function waveLabel(w) {
    if (w === 'trap') { return 'ذوزه‌ای'; }
    if (w === 'custom') { return 'سفارشی'; }
    return 'سینوسی';
  }

  function topoLabel(t) {
    if (t === 'dualstator') { return 'دو استاتور'; }
    if (t === 'dualrotor') { return 'دو روتور'; }
    return 'تک‌استاتور';
  }

  function archLabel(a) {
    if (a === 'radial') { return 'شعاعی'; }
    if (a === 'axial') { return 'محوری'; }
    return 'مقایسه';
  }

  function card1(host) {
    var p = newCard(host, '۱. هندسه و تفاوت ساختاری', 'مقطع مقطعی‌نما با مقیاس واقعی، تعداد شکاف‌ها و جهت نیروی مماسی');
    addFormulas(p.body, [
      'T_radial = (2π/3)·τ_avg·l_stack·(r_o³ − r_i³)·n_gaps   ,  n_gaps = 2   →  T_radial ∝ l_stack',
      'T_axial  =  (π/3)·τ_avg·(r_o³ − r_i³)                  ,  l_eff = 1    →  T_axial مستقل از l_stack',
      'l_eff:   شعاعی = l_stack     |     محوری = 1 m'
    ]);

    var cArch = bindSelect('arch', {
      label: 'معماری',
      options: [
        { value: 'both', label: 'مقایسه' },
        { value: 'radial', label: 'شعاعی' },
        { value: 'axial', label: 'محوری' }
      ]
    });
    var cG = bindRange('g', { label: 'شکاف هوایی g', unit: 'mm', min: 0.00005, max: 0.005, step: 0.00005, digits: 3 });
    var cLs = bindRange('ls', { label: 'طول استک l_stack', unit: 'mm', min: 0.004, max: 0.30, step: 0.002, digits: 1 });
    var cRo = bindRange('ro', { label: 'شعاع بیرونی r_o', unit: 'mm', min: 0.03, max: 0.40, step: 0.002, digits: 1 });
    p.ctl.appendChild(cArch.root);
    p.ctl.appendChild(cG.root);
    p.ctl.appendChild(cLs.root);
    p.ctl.appendChild(cRo.root);

    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 400);

    var rot = 0;

    updaters.push(function () {
      var q = params();
      var r = design(q);
      var dRad = 2 * T_AIR + 2 * q.g + q.ls;
      var dAx = 2 * T_AIR + 2 * q.g + H_MAG;
      ro.update([
        { k: 'قطر بیرونی ۲r_o', v: fmt1(2 * q.ro * 1000), unit: 'mm' },
        { k: 'قطر داخلی ۲r_i', v: fmt1(2 * q.ri * 1000), unit: 'mm' },
        { k: 'عرض حلقه فعال ۲(r_o − r_i)', v: fmt1(2 * (q.ro - q.ri) * 1000), unit: 'mm' },
        { k: 'شکاف هوایی g', v: fmt(q.g * 1000, 3), unit: 'mm' },
        { k: 'g_eff شعاعی = g', v: fmt(q.g * 1000, 3), unit: 'mm' },
        { k: 'g_eff محوری = ۲g', v: fmt(2 * q.g * 1000, 3), unit: 'mm' },
        { k: 'تعداد شکاف n_gaps', v: fmt0(NGAPS), unit: '-' },
        { k: 'عمق کل شعاعی = ۲t_air + ۲g + l_stack', v: fmt1(dRad * 1000), unit: 'mm' },
        { k: 'عمق کل محوری = ۲g + ۲t_air + h_mag', v: fmt1(dAx * 1000), unit: 'mm' },
        { kind: 'accent', k: 'نسبت عمق محوری به شعاعی', v: fmt2(dAx / dRad), unit: '-' },
        { k: 'l_eff شعاعی', v: fmt1(q.ls * 1000), unit: 'mm' },
        { k: 'l_eff محوری', v: fmt1(1), unit: 'm' },
        { kind: 'accent', k: 'T_radial', v: fmt1(r.Tr), unit: 'N·m' },
        { kind: 'accent', k: 'T_axial', v: fmt1(r.Ta), unit: 'N·m' },
        { k: 'نسبت T_radial / T_axial = ۴·l_stack', v: fmt(r.ratio, 4), unit: '-' },
        { k: 'چیدمان لایه شعاعی', v: 'S / g / R / g / S', unit: '' },
        { k: 'چیدمان لایه محوری', v: 'S / g / M / Y / M / g / S', unit: '' },
        { k: 'عمق آهنربا در پنکیک h_mag', v: fmt1(H_MAG * 1000), unit: 'mm' }
      ]);
      setBadges(bad, [
        ['معماری نمایش: ' + archLabel(S.arch), 'badge-accent'],
        ['T_radial = ' + fmt1(r.Tr) + ' N·m  |  T_axial = ' + fmt1(r.Ta) + ' N·m  |  نسبت = ' + fmt(r.ratio, 4), 'badge-accent'],
        ['g_eff:  شعاعی = ' + fmt(q.g * 1000, 3) + ' mm  |  محوری = ' + fmt(2 * q.g * 1000, 3) + ' mm', q.g > 0.0015 ? 'badge-warn' : ''],
        ['عمق:  شعاعی = ' + fmt1(dRad * 1000) + ' mm  |  محوری = ' + fmt1(dAx * 1000) + ' mm', 'badge-accent']
      ]);
      drawArch(rot);
    });

    function crossMark(ctx, x, y, r, into) {
      ctx.save();
      ctx.strokeStyle = COL.c3;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, PI * 2);
      ctx.stroke();
      ctx.beginPath();
      if (into) {
        ctx.moveTo(x - r * 0.72, y - r * 0.72);
        ctx.lineTo(x + r * 0.72, y + r * 0.72);
        ctx.moveTo(x + r * 0.72, y - r * 0.72);
        ctx.lineTo(x - r * 0.72, y + r * 0.72);
      } else {
        ctx.arc(x, y, r * 0.28, 0, PI * 2);
      }
      ctx.stroke();
      ctx.restore();
    }

    function stackBands(ctx, cx, top, sc, bw, segs) {
      var y = top;
      var i;
      for (i = 0; i < segs.length; i++) {
        var hp = segs[i].h * sc;
        if (hp < 0.9) { y += hp; continue; }
        if (segs[i].gap) {
          rect(ctx, cx - bw / 2, y, bw, hp, COL.gap, 0.75);
          line(ctx, [[cx - bw / 2, y + hp / 2], [cx + bw / 2, y + hp / 2]], COL.gap, 1, [2, 3]);
        } else {
          rect(ctx, cx - bw / 2, y, bw, hp, segs[i].c, segs[i].a);
          ctx.save();
          ctx.strokeStyle = 'rgba(8,14,22,0.5)';
          ctx.lineWidth = 1;
          ctx.strokeRect(cx - bw / 2 + 0.5, y + 0.5, bw - 1, hp - 1);
          ctx.restore();
        }
        y += hp;
      }
      return y;
    }

    function laminations(ctx, cx, y0, y1, bw) {
      var n = Math.max(3, Math.round((y1 - y0) / 5));
      var i;
      for (i = 1; i < n; i++) {
        var yy = y0 + ((y1 - y0) * i) / n;
        line(ctx, [[cx - bw / 2 + 1, yy], [cx + bw / 2 - 1, yy]], 'rgba(205,225,250,0.18)', 1);
      }
    }

    function radialPanel(ctx, box, q, r, sc, rotv) {
      var cx = box.x + box.w * 0.40;
      var depth = 2 * T_AIR + 2 * q.g + q.ls;
      var top = box.y + box.h * 0.30;
      var bw = 2 * q.ro * sc;
      var bore = 2 * q.ri * sc;
      rect(ctx, cx - bore / 2, top, bore, depth * sc, COL.panel, 1);
      ctx.save();
      ctx.strokeStyle = COL.faint;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - bore / 2, top, bore, depth * sc);
      ctx.restore();
      var segs = [
        { h: T_AIR, c: COL.stator, a: 0.95 },
        { h: q.g, gap: true },
        { h: q.ls, c: COL.rotor, a: 0.95 },
        { h: q.g, gap: true },
        { h: T_AIR, c: COL.stator, a: 0.95 }
      ];
      var bot = stackBands(ctx, cx, top, sc, bw, segs);
      laminations(ctx, cx, top + (T_AIR + q.g) * sc, top + (T_AIR + q.g + q.ls) * sc, bw);
      var g1y = top + T_AIR * sc + (q.g * sc) / 2;
      var g2y = top + (T_AIR + q.g + q.ls + q.g * 0.5) * sc;
      crossMark(ctx, cx + bw / 2 + 9, g1y, 3.6, true);
      crossMark(ctx, cx + bw / 2 + 9, g2y, 3.6, true);
      arrow(ctx, cx - bw / 2 - 24, g1y, cx - bw / 2 - 6, g1y, COL.c3, 1.6, 7);
      arrow(ctx, cx - bw / 2 - 24, g2y, cx - bw / 2 - 6, g2y, COL.c3, 1.6, 7);
      plabel(ctx, cx - bw / 2 - 30, g1y - 8, 'F_t', COL.c3, 'right', 'alphabetic', FONT_S);
      arcArrow(ctx, cx, top + (depth * sc) / 2, Math.min(bw, depth * sc) * 0.5 + 26, -PI * 0.85, -PI * 0.45, COL.c2, 2.2, 9);
      label(ctx, cx - bw / 2 - 24, top + (depth * sc) / 2 + 22, 'T', COL.c2, 'center', 'top', FONT_B);
      dimLine(ctx, cx - bw / 2, bot + 26, cx + bw / 2, bot + 26, '2r_o = ' + fmt1(2 * q.ro * 1000) + ' mm', COL.faint);
      dimLine(ctx, cx + bw / 2 + 34, top, cx + bw / 2 + 34, bot, fmt1(depth * 1000) + ' mm', COL.faint);
      plabel(ctx, cx - bw / 2 - 6, top + (T_AIR * sc) / 2 + 3, 'استاتور', COL.text, 'right', 'middle', FONT_S);
      plabel(ctx, cx - bw / 2 - 6, top + (T_AIR + q.g + q.ls * 0.5) * sc + 3, 'روتور', COL.text, 'right', 'middle', FONT_S);
      endView(ctx, box.x + box.w * 0.79, box.y + box.h * 0.32, Math.min(box.w * 0.17, box.h * 0.24), rotv, true);
      return top + depth * sc;
    }

    function axialPanel(ctx, box, q, r, sc, rotv) {
      var cx = box.x + box.w * 0.40;
      var segs = [
        { h: T_AIR, c: COL.stator, a: 0.95 },
        { h: q.g, gap: true },
        { h: H_MAG * 0.42, c: COL.mag, a: 0.85 },
        { h: H_MAG * 0.16, c: COL.rotor, a: 0.95 },
        { h: H_MAG * 0.42, c: COL.mag, a: 0.85 },
        { h: q.g, gap: true },
        { h: T_AIR, c: COL.stator, a: 0.95 }
      ];
      var depth = 2 * T_AIR + 2 * q.g + H_MAG;
      var top = box.y + box.h * 0.30;
      var bw = 2 * q.ro * sc;
      var bore = 2 * q.ri * sc;
      rect(ctx, cx - bore / 2, top, bore, depth * sc, COL.panel, 1);
      ctx.save();
      ctx.strokeStyle = COL.faint;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - bore / 2, top, bore, depth * sc);
      ctx.restore();
      var bot = stackBands(ctx, cx, top, sc, bw, segs);
      var g1y = top + T_AIR * sc + (q.g * sc) / 2;
      var g2y = top + (T_AIR + q.g + H_MAG + q.g * 0.5) * sc;
      crossMark(ctx, cx + bw / 2 + 9, g1y, 3.6, true);
      crossMark(ctx, cx + bw / 2 + 9, g2y, 3.6, true);
      arrow(ctx, cx - bw / 2 - 24, g1y, cx - bw / 2 - 6, g1y, COL.c3, 1.6, 7);
      arrow(ctx, cx - bw / 2 - 24, g2y, cx - bw / 2 - 6, g2y, COL.c3, 1.6, 7);
      plabel(ctx, cx - bw / 2 - 30, g1y - 8, 'F_t', COL.c3, 'right', 'alphabetic', FONT_S);
      arcArrow(ctx, cx, top + (depth * sc) / 2, Math.min(bw, depth * sc) * 0.5 + 26, -PI * 0.85, -PI * 0.45, COL.c2, 2.2, 9);
      label(ctx, cx - bw / 2 - 24, top + (depth * sc) / 2 + 22, 'T', COL.c2, 'center', 'top', FONT_B);
      dimLine(ctx, cx - bw / 2, bot + 26, cx + bw / 2, bot + 26, '2r_o = ' + fmt1(2 * q.ro * 1000) + ' mm', COL.faint);
      dimLine(ctx, cx + bw / 2 + 34, top, cx + bw / 2 + 34, bot, fmt1(depth * 1000) + ' mm', COL.faint);
      plabel(ctx, cx - bw / 2 - 6, top + (T_AIR * sc) / 2 + 3, 'استاتور', COL.text, 'right', 'middle', FONT_S);
      plabel(ctx, cx - bw / 2 - 6, top + (T_AIR + q.g + H_MAG * 0.21) * sc + 3, 'آهنربا', COL.mag, 'right', 'middle', FONT_S);
      plabel(ctx, cx - bw / 2 - 6, top + (T_AIR + q.g + H_MAG * 0.5) * sc + 3, 'روتور', COL.text, 'right', 'middle', FONT_S);
      endView(ctx, box.x + box.w * 0.79, box.y + box.h * 0.32, Math.min(box.w * 0.17, box.h * 0.24), rotv, false);
      return top + depth * sc;
    }

    function endView(ctx, cx, cy, R, rotv, radial) {
      if (R < 8) { return; }
      ring(ctx, cx, cy, R, COL.stator, Math.max(3, R * 0.2));
      var teeth = 12;
      var i;
      for (i = 0; i < teeth; i++) {
        var a = rotv * 0.0 + (i * 2 * PI) / teeth;
        var r0 = R * 0.74, r1 = R * 0.84;
        line(ctx, [[cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)], [cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]], COL.copper, Math.max(1.5, R * 0.07));
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotv);
      ctx.fillStyle = COL.rotor;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.72, 0, PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotv);
      ctx.fillStyle = COL.mag;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.72, -PI * 0.18, PI * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COL.c6;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.72, PI * 0.82, PI * 1.18);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ring(ctx, cx, cy, R * 0.72, 'rgba(8,14,22,0.7)', 1.2);
      dot(ctx, cx, cy, R * 0.16, COL.panel);
      ring(ctx, cx, cy, R * 0.16, COL.faint, 1);
      var fa = rotv + PI * 0.5;
      var fr = R * 0.78;
      arrow(ctx, cx + fr * Math.cos(fa - PI / 2), cy + fr * Math.sin(fa - PI / 2), cx + fr * Math.cos(fa - PI / 2 - 0.5), cy + fr * Math.sin(fa - PI / 2 - 0.5), COL.c3, 2, 7);
      arcArrow(ctx, cx, cy, R * 1.06, rotv - 0.5, rotv - 0.05, COL.c2, 2, 7);
      label(ctx, cx, cy + R + 10, radial ? 'ماشین شعاعی' : 'ماشین محوری', COL.text, 'center', 'top', FONT_S);
      label(ctx, cx, cy - R - 8, 'نمای انتهایی', COL.faint, 'center', 'bottom', FONT_S);
    }

    function legend(ctx, w, h) {
      var items = [
        [COL.stator, 'استاتور'],
        [COL.rotor, 'روتور / هسته'],
        [COL.mag, 'آهنربا'],
        [COL.gap, 'شکاف هوایی'],
        [COL.c3, 'نیروی مماسی F_t'],
        [COL.c2, 'گشتاور T']
      ];
      var x = 10;
      var i;
      for (i = 0; i < items.length; i++) {
        rect(ctx, x, h - 20, 10, 10, items[i][0], 0.95);
        ctx.save();
        ctx.direction = 'rtl';
        ctx.fillStyle = COL.faint;
        ctx.font = FONT_S;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(items[i][1], x + 30, h - 15);
        ctx.restore();
        x += 34 + items[i][1].length * 7;
      }
    }

    function drawArch(ts) {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      rot += (ts || 0) * 0.0013;
      var q = params();
      var r = design(q);
      var showR = S.arch === 'both' || S.arch === 'radial';
      var showA = S.arch === 'both' || S.arch === 'axial';
      var n = showR && showA ? 2 : 1;
      var pw = w / n;
      var dRad = 2 * T_AIR + 2 * q.g + q.ls;
      var dAx = 2 * T_AIR + 2 * q.g + H_MAG;
      var maxD = Math.max(showR ? dRad : 0, showA ? dAx : 0);
      var sc = Math.min((pw * 0.56) / (2 * q.ro), (h - 190) / Math.max(maxD, 1e-6));
      if (!isFinite(sc) || sc <= 0) { sc = 200; }
      var i;
      for (i = 0; i < n; i++) {
        var box = { x: i * pw, y: 0, w: pw, h: h };
        if (n === 2) {
          line(ctx, [[box.x + box.w, 30], [box.x + box.w, h - 34]], COL.grid, 1);
        }
        if (showR && (n === 1 || i === 0)) { radialPanel(ctx, box, q, r, sc, rot); }
        if (showA && (n === 1 || i === 1)) { axialPanel(ctx, box, q, r, sc, rot); }
        if (n === 1) { break; }
      }
      legend(ctx, w, h);
    }

    addAnim(function (ts) { drawArch(ts); });
    updaters[updaters.length - 1]();
  }
  function card2(host) {
    var p = newCard(host, '۲. گشتاور و چگالی گشتاور', 'تنش برشی هوایی، گشتاور هر دو معماری، حجم، جرم و گشتاور ویژه');
    addFormulas(p.body, [
      'τ_avg = k·B²/(2μ₀)      μ₀ = 4π×10⁻⁷ H/m',
      'T_radial = (2π/3)·τ_avg·l_stack·(r_o³ − r_i³)·n_gaps',
      'T_axial  =  (π/3)·τ_avg·(r_o³ − r_i³)',
      'V_radial = π(r_o² − r_i²)·l_stack      |      V_axial = π(r_o² − r_i²)·(2g + 2t_air + h_mag)',
      'm = V·ρ ,  ρ = 8960 kg/m³   |   T/V چگالی گشتاور   |   T/m گشتاور ویژه'
    ]);

    var cB = bindRange('B', { label: 'چگالی شار B', unit: 'T', min: 0.05, max: 1.60, step: 0.01, digits: 2 });
    var cRo = bindRange('ro', { label: 'شعاع بیرونی r_o', unit: 'mm', min: 0.03, max: 0.40, step: 0.002, digits: 1 });
    var cRi = bindRange('ri', { label: 'شعاع داخلی r_i', unit: 'mm', min: 0.008, max: 0.36, step: 0.002, digits: 1 });
    var cLs = bindRange('ls', { label: 'طول استک l_stack', unit: 'mm', min: 0.004, max: 0.30, step: 0.002, digits: 1 });
    var cK = bindRange('k', {
      label: 'ضریب شکل موج k', unit: '-', min: 0.40, max: 1.10, step: 0.01, digits: 2,
      after: function (v) { S.wave = Math.abs(v - 1) < 1e-9 ? 'sine' : (Math.abs(v - 0.75) < 1e-9 ? 'trap' : 'custom'); }
    });
    var cWave = bindSelect('wave', {
      label: 'شکل موج',
      options: [
        { value: 'sine', label: 'سینوسی (k = 1.00)' },
        { value: 'trap', label: 'ذوزه‌ای (k = 0.75)' },
        { value: 'custom', label: 'سفارشی' }
      ]
    }, function (v) {
      if (v === 'sine') { S.k = 1.0; }
      else if (v === 'trap') { S.k = 0.75; }
    });
    p.ctl.appendChild(cB.root);
    p.ctl.appendChild(cRo.root);
    p.ctl.appendChild(cRi.root);
    p.ctl.appendChild(cLs.root);
    p.ctl.appendChild(cK.root);
    p.ctl.appendChild(cWave.root);

    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 340);

    updaters.push(function () {
      var q = params();
      var r = design(q);
      var clamped = Math.abs(q.ri - S.ri) > 1e-9;
      ro.update([
        { k: 'ضریب شکل موج k', v: fmt2(q.k), unit: '-' },
        { k: 'شکل موج انتخابی', v: waveLabel(S.wave), unit: '' },
        { kind: 'accent', k: 'τ_avg = k·B²/(2μ₀)', v: fmt0(r.tauR), unit: 'N/m²' },
        { k: 'μ₀', v: '1.2566e-6', unit: 'H/m' },
        { k: 'r_o³ − r_i³', v: fmt(Math.pow(q.ro, 3) - Math.pow(q.ri, 3), 6), unit: 'm³' },
        { kind: 'accent', k: 'T_radial (l_eff = l_stack)', v: fmt1(r.Tr), unit: 'N·m' },
        { kind: 'accent', k: 'T_axial (l_eff = 1)', v: fmt1(r.Ta), unit: 'N·m' },
        { k: 'نسبت T_radial / T_axial', v: fmt(r.ratio, 4), unit: '-' },
        { k: 'V_radial', v: fmt(r.Vr, 6), unit: 'm³' },
        { k: 'V_axial', v: fmt(r.Va, 6), unit: 'm³' },
        { k: 'نسبت حجم V_axial / V_radial', v: fmt2(r.Va / Math.max(r.Vr, 1e-12)), unit: '-' },
        { k: 'چگالی گشتاور T/V شعاعی', v: fmt0(r.tdR), unit: 'N·m/m³' },
        { k: 'چگالی گشتاور T/V محوری', v: fmt0(r.tdA), unit: 'N·m/m³' },
        { k: 'نسبت چگالی گشتاور', v: fmt2(r.tdA / Math.max(r.tdR, 1e-12)), unit: '-' },
        { k: 'جرم m_radial', v: fmt1(r.mr), unit: 'kg' },
        { k: 'جرم m_axial', v: fmt1(r.ma), unit: 'kg' },
        { k: 'گشتاور ویژه T/m شعاعی', v: fmt2(r.stR), unit: 'N·m/kg' },
        { k: 'گشتاور ویژه T/m محوری', v: fmt2(r.stA), unit: 'N·m/kg' },
        { k: 'نسبت گشتاور ویژه', v: fmt2(r.stA / Math.max(r.stR, 1e-12)), unit: '-' },
        { k: 'چگالی توان در ' + fmt0(N_NOM) + ' rpm — شعاعی', v: fmt0(r.pdR), unit: 'kW/m³' },
        { k: 'چگالی توان در ' + fmt0(N_NOM) + ' rpm — محوری', v: fmt0(r.pdA), unit: 'kW/m³' }
      ]);
      setBadges(bad, [
        ['شکل موج: ' + waveLabel(S.wave) + '  →  k = ' + fmt2(q.k) + ' , τ_avg = ' + fmt0(r.tauR) + ' N/m²', 'badge-accent'],
        ['T_radial = ' + fmt1(r.Tr) + ' N·m  |  T_axial = ' + fmt1(r.Ta) + ' N·m  |  نسبت = ' + fmt(r.ratio, 4), 'badge-accent'],
        ['T/m:  ' + fmt2(r.stR) + ' در برابر ' + fmt2(r.stA) + ' N·m/kg  (نسبت ' + fmt2(r.stA / Math.max(r.stR, 1e-12)) + ')', 'badge-accent'],
        clamped ? ['r_i به r_o − 4mm محدود شد → r_i = ' + fmt1(q.ri * 1000) + ' mm', 'badge-warn'] : ['r_o − r_i = ' + fmt1((q.ro - q.ri) * 1000) + ' mm', '']
      ]);
      drawBars();
    });

    function groupBars(ctx, box, title, unit, vr, va, dr, da) {
      var top = box.y + 30;
      var bot = box.y + box.h - 40;
      var bw = box.w / 2;
      var vals = [dr, da];
      var mx = Math.max(vals[0], vals[1]);
      if (mx <= 0) { mx = 1; }
      mx = mx * 1.18;
      var i;
      var yTicks = [];
      for (i = 0; i <= 4; i++) { yTicks.push((mx * i) / 4); }
      var ax = plot(ctx, { x: box.x + bw, y: top, w: box.w - bw - 6, h: bot - top }, [0, mx], [0, 1], yTicks.map(function (v) { return fmt0(v); }), [0], unit, '');
      var bwv = (ax.box.w / 2) * 0.52;
      var cxs = [ax.box.x + ax.box.w * 0.25, ax.box.x + ax.box.w * 0.75];
      var cols = [COL.c1, COL.c2];
      var vs = [dr, da];
      var i2;
      for (i2 = 0; i2 < 2; i2++) {
        var hv = Math.max(0, (vs[i2] / mx) * ax.box.h);
        ctx.save();
        ctx.fillStyle = cols[i2];
        ctx.globalAlpha = 0.88;
        ctx.fillRect(cxs[i2] - bwv / 2, ax.box.y + ax.box.h - hv, bwv, hv);
        ctx.restore();
        label(ctx, cxs[i2], ax.box.y + ax.box.h - hv - 6, fmt0(vs[i2]), cols[i2], 'center', 'bottom', FONT_S);
        plabel(ctx, cxs[i2], ax.box.y + ax.box.h + 16, i2 === 0 ? 'شعاعی' : 'محوری', cols[i2], 'center', 'top', FONT_S);
      }
      label(ctx, box.x, box.y + 14, title, COL.text, 'left', 'top', FONT_B);
      label(ctx, box.x + box.w, box.y + 14, 'max = ' + fmt0(mx), COL.faint, 'right', 'top', FONT_S);
    }

    function drawBars() {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      var q = params();
      var r = design(q);
      var pw = w / 3;
      var i;
      for (i = 0; i < 3; i++) {
        if (i > 0) { line(ctx, [[i * pw, 26], [i * pw, h - 46]], COL.grid, 1); }
      }
      groupBars(ctx, { x: 0, y: 0, w: pw, h: h }, 'گشتاور T [N·m]', 'T', r.Tr, r.Ta, r.Tr, r.Ta);
      groupBars(ctx, { x: pw, y: 0, w: pw, h: h }, 'چگالی گشتاور T/V [N·m/m³]', 'T/V', r.tdR, r.tdA, r.tdR, r.tdA);
      groupBars(ctx, { x: 2 * pw, y: 0, w: pw, h: h }, 'گشتاور ویژه T/m [N·m/kg]', 'T/m', r.stR, r.stA, r.stR, r.stA);
      label(ctx, 10, h - 10, 'τ_avg = ' + fmt0(r.tauR) + ' N/m²  |  V_radial = ' + fmt(r.Vr, 5) + ' m³  |  V_axial = ' + fmt(r.Va, 5) + ' m³  |  ρ = 8960 kg/m³', COL.faint, 'left', 'bottom', FONT_S);
      label(ctx, w - 10, h - 10, 'B = ' + fmt2(q.B) + ' T  |  k = ' + fmt2(q.k) + '  |  ' + waveLabel(S.wave), COL.faint, 'right', 'bottom', FONT_S);
    }
  }
  function card3(host) {
    var p = newCard(host, '۳. حساسیت پارامترهای طراحی', 'کشش لگاریتمی d ln(خروجی)/d ln(پارامتر) برای هر پارامتر در هر دو ماشین');
    addFormulas(p.body, [
      'E = d ln(Y) / d ln(p) = [ ln(Y(p·(1+h))) − ln(Y(p·(1−h))) ] / [ ln(1+h) − ln(1−h) ]',
      'B ↑ → T ∝ B² ,  F_axial ∝ B² ,  P_stein ∝ B^1.6      r_o ↑ → T ∝ r_o³ ولی V ∝ r_o²',
      'r_i ↑ → T ∝ (r_o³ − r_i³) ↓ ,  طول سیم‌پیچ ↓         l_stack ↑ → شعاعی: T ∝ l ، محوری: T بدون تغییر',
      'k ↑ → T خطی ↑ ، F_axial بدون تغییر                  g ↑ → T ∝ ۱/g_eff² ، F_axial ∝ ۱/g_eff²',
      'برای پارامتر g ، B از بودجه MMF ثابت محاسبه می‌شود:  B = μ₀·H·h_mag / g_eff'
    ]);

    var cPar = bindSelect('spar', {
      label: 'پارامتر آزمایش',
      options: [
        { value: 'B', label: 'B — چگالی شار' },
        { value: 'ro', label: 'r_o — شعاع بیرونی' },
        { value: 'ri', label: 'r_i — شعاع داخلی' },
        { value: 'ls', label: 'l_stack — طول استک' },
        { value: 'k', label: 'k — ضریب شکل موج' },
        { value: 'g', label: 'g — شکاف هوایی' }
      ]
    });
    var cPert = bindRange('spert', { label: 'درصد آشفتگی', unit: '%', min: -50, max: 100, step: 1, digits: 0 });
    var cOut = bindSelect('sout', {
      label: 'خروجی نمودار گردبی',
      options: [
        { value: 'T', label: 'گشتاور T' },
        { value: 'TD', label: 'چگالی گشتاور T/V' },
        { value: 'M', label: 'جرم m' },
        { value: 'F', label: 'نیروی محوری F' }
      ]
    });
    p.ctl.appendChild(cPar.root);
    p.ctl.appendChild(cPert.root);
    p.ctl.appendChild(cOut.root);

    var chips = chipRow(p.body);
    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var tbl = el('table', 'ph-table');
    p.body.appendChild(tbl);
    p.body.appendChild(el('p', 'ph-note', 'جدول آشفتگی: هر سطر یک پارامتر، ستون‌ها درصد تغییر خروجی نسبت به مقدار پایه هستند. برای g، B از بودجه MMF ثابت بازمحاسبه می‌شود و برای r_o یا r_i آشفتگی در صورت ناسازگاری هندسی تا حد مجاز کوچک می‌شود.'));
    var cv = newCanvas(p.body, 460);

    function readKind(v) {
      if (v > 0.005) { return 'good'; }
      if (v < -0.005) { return 'bad'; }
      return 'warn';
    }

    function selParam() {
      var q = params();
      var key = S.spar;
      var mode = modeOf(key);
      var frac = S.spert / 100;
      var pq = safePerturb(q, key, frac);
      var b = outputs(q, mode, S.sout);
      var a = outputs(pq, mode, S.sout);
      var rows = {
        T: { R: pctOf(a.R, b.R), A: pctOf(a.A, b.A) },
        TD: { R: pctOf(a.R, b.R), A: pctOf(a.A, b.A) },
        M: { R: pctOf(a.R, b.R), A: pctOf(a.A, b.A) },
        F: { R: pctOf(a.R, b.R), A: pctOf(a.R, b.A) }
      };
      var bT = outputs(q, mode, 'T');
      var aT = outputs(pq, mode, 'T');
      var bM = outputs(q, mode, 'TD');
      var aM = outputs(pq, mode, 'TD');
      var bW = outputs(q, mode, 'M');
      var aW = outputs(pq, mode, 'M');
      var bF = outputs(q, mode, 'F');
      var aF = outputs(pq, mode, 'F');
      rows.T = { R: pctOf(aT.R, bT.R), A: pctOf(aT.A, bT.A) };
      rows.TD = { R: pctOf(aM.R, bM.R), A: pctOf(aM.A, bM.A) };
      rows.M = { R: pctOf(aW.R, bW.R), A: pctOf(aW.A, bW.A) };
      rows.F = { R: pctOf(aF.R, bF.R), A: pctOf(aF.A, bF.A) };
      return { q: q, pq: pq, frac: frac, applied: (pq[key] / q[key] - 1) * 100, key: key, mode: mode, rows: rows };
    }

    function safePerturb(p, key, frac) {
      var f = frac;
      if (key === 'ro') {
        var m = (p.ro - 0.004 - p.ri) / p.ro;
        if (f > m) { f = m; }
      } else if (key === 'ri') {
        var d = 1 - (p.ro - 0.004) / p.ri;
        if (f < -d) { f = -d; }
      }
      return perturb(p, key, f);
    }

    function tableData() {
      var q = params();
      var frac = S.spert / 100;
      var out = [];
      var i;
      for (i = 0; i < PARAMS.length; i++) {
        var key = PARAMS[i].key;
        var mode = modeOf(key);
        var pq = safePerturb(q, key, frac);
        var bT = outputs(q, mode, 'T');
        var aT = outputs(pq, mode, 'T');
        var bM = outputs(q, mode, 'TD');
        var aM = outputs(pq, mode, 'TD');
        var bW = outputs(q, mode, 'M');
        var aW = outputs(pq, mode, 'M');
        var bF = outputs(q, mode, 'F');
        var aF = outputs(pq, mode, 'F');
        out.push({
          label: PARAMS[i].label,
          hint: PARAMS[i].hint,
          applied: (pq[key] / q[key] - 1) * 100,
          T_R: pctOf(aT.R, bT.R), T_A: pctOf(aT.A, bT.A),
          TD_R: pctOf(aM.R, bM.R), TD_A: pctOf(aM.A, bM.A),
          M_R: pctOf(aW.R, bW.R), M_A: pctOf(aW.A, bW.A),
          F: pctOf(aF.R, bF.R)
        });
      }
      return out;
    }

    updaters.push(function () {
      var s = selParam();
      var td = tableData();
      var rows = s.rows;
      ro.update([
        { k: 'پارامتر آزمایش', v: s.key === 'ro' ? 'r_o' : s.key === 'ri' ? 'r_i' : s.key === 'ls' ? 'l_stack' : s.key, unit: '' },
        { k: 'درصد آشفتگی درخواستی', v: fmt1(S.spert), unit: '%' },
        { k: 'درصد آشفتگی اعمال‌شده', v: fmt1(s.applied), unit: '%' },
        { kind: readKind(rows.T.R), k: 'ΔT_radial', v: fsp(rows.T.R), unit: '%' },
        { kind: readKind(rows.T.A), k: 'ΔT_axial', v: fsp(rows.T.A), unit: '%' },
        { kind: readKind(rows.TD.R), k: 'Δچگالی گشتاور شعاعی', v: fsp(rows.TD.R), unit: '%' },
        { kind: readKind(rows.TD.A), k: 'Δچگالی گشتاور محوری', v: fsp(rows.TD.A), unit: '%' },
        { kind: readKind(rows.M.R), k: 'Δجرم شعاعی', v: fsp(rows.M.R), unit: '%' },
        { kind: readKind(rows.M.A), k: 'Δجرم محوری', v: fsp(rows.M.A), unit: '%' },
        { kind: readKind(rows.F.R), k: 'ΔF_axial', v: fsp(rows.F.R), unit: '%' },
        { k: 'خروجی نمودار گردبی', v: S.sout === 'TD' ? 'T/V' : S.sout === 'M' ? 'm' : S.sout === 'F' ? 'F_axial' : 'T', unit: '' },
        { k: 'مدل B برای پارامتر ' + s.key, v: s.mode === 'gap' ? 'بودجه MMF ثابت: B = μ₀·H·h_mag/g_eff' : 'B طراحی مستقیم', unit: '' }
      ]);
      setChips(chips, [
        ['ΔT_radial ' + fsp(rows.T.R) + ' %', verdictTag(rows.T.R)],
        ['ΔT_axial ' + fsp(rows.T.A) + ' %', verdictTag(rows.T.A)],
        ['Δ(T/V)_axial ' + fsp(rows.TD.A) + ' %', verdictTag(rows.TD.A)],
        ['Δm_radial ' + fsp(rows.M.R) + ' %', verdictTag(rows.M.R)],
        ['Δm_axial ' + fsp(rows.M.A) + ' %', verdictTag(rows.M.A)],
        ['ΔF_axial ' + fsp(rows.F.R) + ' %', verdictTag(rows.F.R)]
      ]);
      setBadges(bad, [
        ['پارامتر: ' + s.key + '   آشفتگی: ' + fmt1(S.spert) + ' % → ' + fmt1(s.applied) + ' %', 'badge-accent'],
        ['T: ' + fsp(rows.T.R) + ' % (شعاعی)  |  ' + fsp(rows.T.A) + ' % (محوری)', 'badge-accent'],
        ['T/V: ' + fsp(rows.TD.R) + ' % (شعاعی)  |  ' + fsp(rows.TD.A) + ' % (محوری)', 'badge-accent'],
        ['m: ' + fsp(rows.M.R) + ' % (شعاعی)  |  ' + fsp(rows.M.A) + ' % (محوری)   |   F_axial: ' + fsp(rows.F.R) + ' %', 'badge-accent']
      ]);
      renderTable(td);
      drawTornado();
    });

    function renderTable(td) {
      while (tbl.firstChild) { tbl.removeChild(tbl.firstChild); }
      var thead = el('thead');
      var hr = el('tr');
      var heads = ['پارامتر', 'Δ% پارامتر', 'ΔT_radial', 'ΔT_axial', 'Δ(T/V)_radial', 'Δ(T/V)_axial', 'Δm_radial', 'Δm_axial', 'ΔF_axial'];
      var i;
      for (i = 0; i < heads.length; i++) { hr.appendChild(el('th', null, heads[i])); }
      thead.appendChild(hr);
      tbl.appendChild(thead);
      var tbody = el('tbody');
      for (i = 0; i < td.length; i++) {
        var r = td[i];
        var tr = el('tr');
        tr.appendChild(el('td', null, r.label + ' — ' + r.hint));
        tr.appendChild(el('td', null, fsp(r.applied, 1) + ' %'));
        tr.appendChild(el('td', null, fsp(r.T_R)));
        tr.appendChild(el('td', null, fsp(r.T_A)));
        tr.appendChild(el('td', null, fsp(r.TD_R)));
        tr.appendChild(el('td', null, fsp(r.TD_A)));
        tr.appendChild(el('td', null, fsp(r.M_R)));
        tr.appendChild(el('td', null, fsp(r.M_A)));
        tr.appendChild(el('td', null, fsp(r.F)));
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
    }

    function mapV(v) {
      var sgn = v < 0 ? -1 : 1;
      var n = Math.log(1 + Math.abs(v) / LS) / Math.log(1 + 0.05 / LS);
      return sgn * (isFinite(n) ? n : 0);
    }

    function drawTornado() {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      var q = params();
      var out = S.sout;
      var hs = clamp(Math.abs(S.spert) / 100, 0.01, 0.5);
      var data = [];
      var i, maxU = 1e-6;
      for (i = 0; i < PARAMS.length; i++) {
        var key = PARAMS[i].key;
        var e = elasticity(q, key, out, hs);
        data.push({ label: PARAMS[i].label, hint: PARAMS[i].hint, R: e.R, A: e.A });
        var u1 = Math.abs(mapV(e.R));
        var u2 = Math.abs(mapV(e.A));
        if (u1 > maxU) { maxU = u1; }
        if (u2 > maxU) { maxU = u2; }
      }
      maxU *= 1.12;
      var left = 132;
      var right = w - 14;
      var cx = left + (right - left) * 0.5;
      var halfW = (right - left) * 0.5 - 34;
      var top = 54;
      var bot = h - 66;
      var rowH = (bot - top) / PARAMS.length;
      var j;
      ctx.save();
      ctx.strokeStyle = COL.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (j = -3; j <= 3; j++) {
        if (j === 0) { continue; }
        var gx = Math.round(cx + (j / 3) * halfW) + 0.5;
        ctx.moveTo(gx, top - 6);
        ctx.lineTo(gx, bot + 6);
      }
      ctx.stroke();
      ctx.restore();
      line(ctx, [[cx, top - 6], [cx, bot + 6]], COL.axis, 1.6);
      label(ctx, cx, top - 12, '۰', COL.axis, 'center', 'bottom', FONT_S);
      var tk = [-3, -2, -1, 1, 2, 3];
      for (i = 0; i < tk.length; i++) {
        label(ctx, cx + (tk[i] / 3) * halfW, bot + 16, (tk[i] > 0 ? '+' : '') + fmt1(tk[i] * 0.05 * 3), COL.faint, 'center', 'top', FONT_XS);
      }
      label(ctx, left, bot + 34, 'محور لگاریتمی:  ln(1 + |E|/0.05) — هر خانه حدود ۵ درصد کشش', COL.faint, 'left', 'top', FONT_S);
      label(ctx, right, bot + 34, 'h = ' + fmt1(hs * 100) + ' %', COL.faint, 'right', 'top', FONT_S);
      var cols = [COL.c1, COL.c2];
      for (i = 0; i < data.length; i++) {
        var d = data[i];
        var y0 = top + i * rowH;
        var bh = rowH * 0.3;
        var b1 = y0 + rowH * 0.1;
        var b2 = y0 + rowH * 0.55;
        if (i % 2 === 0) {
          rect(ctx, left - 8, y0, right - left + 14, rowH, 'rgba(148,163,184,0.05)', 1);
        }
        var vals = [d.R, d.A];
        var ys = [b1, b2];
        for (j = 0; j < 2; j++) {
          var u = mapV(vals[j]);
          var bw = (u / maxU) * halfW;
          var bx = u >= 0 ? cx : cx + bw;
          ctx.save();
          ctx.fillStyle = cols[j];
          ctx.globalAlpha = 0.85;
          ctx.fillRect(Math.min(bx, cx + bw), ys[j], Math.abs(bw), bh);
          ctx.restore();
          var tipx = u >= 0 ? cx + bw : cx + bw;
          label(ctx, u >= 0 ? tipx + 5 : tipx - 5, ys[j] + bh / 2, (vals[j] >= 0 ? '+' : '') + fmt2(vals[j]), cols[j], u >= 0 ? 'left' : 'right', 'middle', FONT_S);
        }
        plabel(ctx, left - 14, y0 + rowH * 0.52, d.label + '  ' + d.hint, COL.text, 'right', 'middle', FONT_S);
        if (S.spar === PARAMS[i].key) {
          ctx.save();
          ctx.strokeStyle = COL.c6;
          ctx.lineWidth = 1.6;
          ctx.strokeRect(left - 8.5, y0 + 0.5, right - left + 15, rowH - 1);
          ctx.restore();
        }
      }
      var lx = left - 14;
      rect(ctx, lx - 60, top - 30, 10, 10, COL.c1, 0.85);
      label(ctx, lx - 46, top - 25, 'radial', COL.c1, 'left', 'middle', FONT_S);
      rect(ctx, lx - 6, top - 30, 10, 10, COL.c2, 0.85);
      label(ctx, lx + 8, top - 25, 'axial', COL.c2, 'left', 'middle', FONT_S);
      var outName = out === 'TD' ? 'T/V' : out === 'M' ? 'm' : out === 'F' ? 'F_axial' : 'T';
      label(ctx, 10, 14, 'tornado chart  E = d ln(' + outName + ') / d ln(parameter)', COL.text, 'left', 'top', FONT_B);
    }
  }
  function card4(host) {
    var p = newCard(host, '۴. شکاف هوایی و طول مؤثر', 'بودجه MMF ثابت، افت B با ۱/g_eff و جریمه شکاف محوری');
    addFormulas(p.body, [
      'MMF = H·g_eff      g_eff = g (شعاعی ، یک مسیر)      g_eff = 2g (محوری ، دو شکاف)',
      'B_gap = μ₀·H_gap = μ₀·(MMF / g_eff)   →  برای MMF ثابت:   B ∝ 1/g_eff',
      'T ∝ B²  →  T ∝ 1/g_eff²   |   F_axial ∝ B² →  ∝ 1/g_eff²',
      'MMF بودجه آهنربا:  MMF = H·h_mag   ،  h_mag = ۸ mm',
      'شکاف کاری مرجع:  g_radial ≈ 0.3 mm   |   g_axial ≈ 1.0 mm'
    ]);

    var cG = bindRange('g', { label: 'شکاف هوایی g', unit: 'mm', min: 0.00005, max: 0.005, step: 0.00005, digits: 3 });
    var cH = bindRange('H', { label: 'شدت میدان آهنربا H', unit: 'A/m', min: 0, max: 200000, step: 50, digits: 0 });
    var cB = bindRange('B', { label: 'چگالی شار طراحی B', unit: 'T', min: 0.05, max: 1.60, step: 0.01, digits: 2 });
    p.ctl.appendChild(cG.root);
    p.ctl.appendChild(cH.root);
    p.ctl.appendChild(cB.root);

    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 340);

    updaters.push(function () {
      var q = params();
      var r = design(q);
      var gp = gapB(q);
      var rg = ev(q, gp.Br, gp.Ba);
      var fm = magnetMMF(q);
      var bIdR = (MU0 * fm) / G_REF_R;
      var bIdA = (MU0 * fm) / G_REF_A;
      var lossR = bIdR > 0 ? (1 - gp.Br / bIdR) * 100 : 0;
      var lossA = bIdA > 0 ? (1 - gp.Ba / bIdA) * 100 : 0;
      ro.update([
        { k: 'بودجه MMF آهنربا = H·h_mag', v: fmt2(fm), unit: 'A·turn' },
        { k: 'g_eff شعاعی = g', v: fmt(q.g * 1000, 3), unit: 'mm' },
        { k: 'g_eff محوری = ۲g', v: fmt(2 * q.g * 1000, 3), unit: 'mm' },
        { k: 'MMF مصرفی در هر مسیر', v: fmt2(fm), unit: 'A·turn' },
        { k: 'H_gap شعاعی = MMF/g', v: fmt0(fm / q.g), unit: 'A/m' },
        { k: 'H_gap محوری = MMF/۲g', v: fmt0(fm / (2 * q.g)), unit: 'A/m' },
        { kind: 'accent', k: 'B_gap شعاعی = μ₀·H_gap', v: fmt(gp.Br, 5), unit: 'T' },
        { kind: 'accent', k: 'B_gap محوری = μ₀·H_gap', v: fmt(gp.Ba, 5), unit: 'T' },
        { k: 'نسبت B_radial / B_axial', v: fmt2(gp.Br / Math.max(gp.Ba, 1e-12)), unit: '-' },
        { k: 'τ_avg از B_gap شعاعی', v: fmt(rg.tauR, 2), unit: 'N/m²' },
        { k: 'τ_avg از B_gap محوری', v: fmt(rg.tauA, 2), unit: 'N/m²' },
        { k: 'T_radial واقعی در این H', v: fmt(rg.Tr, 4), unit: 'N·m' },
        { k: 'T_axial واقعی در این H', v: fmt(rg.Ta, 4), unit: 'N·m' },
        { kind: 'warn', k: 'B ایده‌آل شعاعی در 0.3 mm', v: fmt(bIdR, 5), unit: 'T' },
        { kind: 'warn', k: 'B ایده‌آل محوری در 1.0 mm', v: fmt(bIdA, 5), unit: 'T' },
        { kind: lossR > 0 ? 'bad' : 'good', k: 'افت B شعاعی نسبت به ایده‌آل', v: fmt1(lossR), unit: '%' },
        { kind: lossA > 0 ? 'bad' : 'good', k: 'افت B محوری نسبت به ایده‌آل', v: fmt1(lossA), unit: '%' },
        { k: 'شکاف مرجع شعاعی', v: fmt(G_REF_R * 1000, 2), unit: 'mm' },
        { k: 'شکاف مرجع محوری', v: fmt(G_REF_A * 1000, 2), unit: 'mm' },
        { k: 'B طراحی کارت ۲', v: fmt2(q.B), unit: 'T' },
        { k: 'T_radial با B طراحی', v: fmt1(r.Tr), unit: 'N·m' },
        { k: 'T_axial با B طراحی', v: fmt1(r.Ta), unit: 'N·m' },
        { k: 'T_axial بدون جریمه شکاف', v: fmt1(r.Ta), unit: 'N·m' },
        { k: 'نسبت T_axial واقعی به بدون جریمه', v: fmt2(rg.Ta / Math.max(r.Ta, 1e-12)), unit: '-' },
        { k: 'نسبت T_radial واقعی به بدون جریمه', v: fmt2(rg.Tr / Math.max(r.Tr, 1e-12)), unit: '-' }
      ]);
      setBadges(bad, [
        ['MMF = ' + fmt2(fm) + ' A·turn  |  g_eff: ' + fmt(q.g * 1000, 3) + ' mm و ' + fmt(2 * q.g * 1000, 3) + ' mm', 'badge-accent'],
        ['B_gap:  شعاعی = ' + fmt(gp.Br, 5) + ' T   |   محوری = ' + fmt(gp.Ba, 5) + ' T   (نسبت ۲ به ۱)', 'badge-accent'],
        ['افت نسبت به ایده‌آل:  ' + fmt1(lossR) + ' % (شعاعی)  |  ' + fmt1(lossA) + ' % (محوری)', lossR > 0 || lossA > 0 ? 'badge-warn' : 'badge-good'],
        ['T واقعی در این H:  ' + fmt(rg.Tr, 4) + ' N·m (شعاعی)  |  ' + fmt(rg.Ta, 4) + ' N·m (محوری)', 'badge-accent']
      ]);
      drawCurves();
    });

    function logPlot(ctx, box, x0, x1, y0, y1, xt, yt, xl, yl) {
      var lx0 = Math.log(x0);
      var lx1 = Math.log(x1);
      var ly0 = Math.log(y0);
      var ly1 = Math.log(y1);
      var X = function (v) { return box.x + (box.w * (Math.log(v) - lx0)) / (lx1 - lx0); };
      var Y = function (v) { return box.y + box.h - (box.h * (Math.log(v) - ly0)) / (ly1 - ly0); };
      var i;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.direction = 'ltr';
      ctx.strokeStyle = COL.grid;
      ctx.beginPath();
      for (i = 0; i < xt.length; i++) {
        var gx = Math.round(X(xt[i])) + 0.5;
        ctx.moveTo(gx, box.y);
        ctx.lineTo(gx, box.y + box.h);
      }
      for (i = 0; i < yt.length; i++) {
        var gy = Math.round(Y(yt[i])) + 0.5;
        ctx.moveTo(box.x, gy);
        ctx.lineTo(box.x + box.w, gy);
      }
      ctx.stroke();
      ctx.strokeStyle = COL.axis;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(box.x, box.y);
      ctx.lineTo(box.x, box.y + box.h);
      ctx.lineTo(box.x + box.w, box.y + box.h);
      ctx.stroke();
      ctx.fillStyle = COL.text;
      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (i = 0; i < xt.length; i++) { ctx.fillText(String(xt[i]), X(xt[i]), box.y + box.h + 6); }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (i = 0; i < yt.length; i++) { ctx.fillText(String(yt[i]), box.x - 6, Y(yt[i])); }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = COL.faint;
      ctx.font = FONT_S;
      ctx.fillText(xl, box.x + box.w - 2, box.y + box.h + 22);
      ctx.save();
      ctx.translate(box.x - 40, box.y + 4);
      ctx.rotate(-PI / 2);
      ctx.fillText(yl, 0, 0);
      ctx.restore();
      ctx.restore();
      return { X: X, Y: Y, box: box };
    }

    function drawCurves() {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      var q = params();
      var d3 = q.ro * q.ro * q.ro - q.ri * q.ri * q.ri;
      var fm = magnetMMF(q);
      var gLo = 0.00005;
      var gHi = 0.005;
      var pw = w / 2;
      var box = { x: 74, y: 36, w: pw - 100, h: h - 92 };
      var box2 = { x: pw + 74, y: 36, w: pw - 100, h: h - 92 };
      var xt = [0.0001, 0.0003, 0.001, 0.003, 0.005];
      var k = q.k;
      var bRMax = (MU0 * fm) / gLo;
      var bRMin = (MU0 * fm) / gHi;
      var tRmax = ((2 * PI / 3) * k * Math.pow(bRMax, 2) / (2 * MU0)) * q.ls * d3 * NGAPS;
      var tRmin = ((2 * PI / 3) * k * Math.pow(bRMin, 2) / (2 * MU0)) * q.ls * d3 * NGAPS;
      var tAmax = ((PI / 3) * k * Math.pow(bRMax / 2, 2) / (2 * MU0)) * d3;
      var tAmin = ((PI / 3) * k * Math.pow(bRMin / 2, 2) / (2 * MU0)) * d3;
      var bTop = Math.max(bRMax, 1e-12) * 2;
      var bBot = Math.max(bRMin / 4, bTop * 1e-6);
      var ytB = [];
      var dec = Math.log10(bTop);
      var i;
      for (i = 0; i <= 4; i++) { ytB.push(bBot * Math.pow(10, (dec - Math.log10(bBot)) * (i / 4))); }
      var axB = logPlot(ctx, box, gLo, gHi, bBot, bTop, xt, ytB.map(function (v) { return fmt(v, 2); }), 'g [m]', 'B [T]');
      var ptsR = [], ptsA = [], ptsB = [], ptsC = [];
      for (i = 0; i <= 120; i++) {
        var gg = gLo * Math.pow(gHi / gLo, i / 120);
        var br = (MU0 * fm) / gg;
        var ba = br / 2;
        var tr = (2 * PI / 3) * (k * br * br / (2 * MU0)) * q.ls * d3 * NGAPS;
        var ta = (PI / 3) * (k * ba * ba / (2 * MU0)) * d3;
        ptsR.push([axB.X(gg), axB.Y(br)]);
        ptsA.push([axB.X(gg), axB.Y(ba)]);
        ptsB.push([axB.X(gg), axB.Y(tr)]);
        ptsC.push([axB.X(gg), axB.Y(ta)]);
      }
      line(ctx, ptsR, COL.c1, 2.2);
      line(ctx, ptsA, COL.c2, 2.2, [6, 4]);
      var axT = logPlot(ctx, box2, gLo, gHi, Math.max(tAmin / 4, 1e-12), Math.max(tRmax * 2, 1e-12), xt, ytB.map(function (v) { return fmt(v * 1e3, 1); }), 'g [m]', 'T [N·m]');
      var outR = [];
      var outA = [];
      for (i = 0; i <= 120; i++) {
        var g2 = gLo * Math.pow(gHi / gLo, i / 120);
        var br2 = (MU0 * fm) / g2;
        var ba2 = br2 / 2;
        var tr2 = (2 * PI / 3) * (k * br2 * br2 / (2 * MU0)) * q.ls * d3 * NGAPS;
        var ta2 = (PI / 3) * (k * ba2 * ba2 / (2 * MU0)) * d3;
        outR.push([axT.X(g2), axT.Y(tr2)]);
        outA.push([axT.X(g2), axT.Y(ta2)]);
      }
      line(ctx, outR, COL.c1, 2.2);
      line(ctx, outA, COL.c2, 2.2, [6, 4]);
      var gp = gapB(q);
      var gr = (2 * PI / 3) * (k * gp.Br * gp.Br / (2 * MU0)) * q.ls * d3 * NGAPS;
      var ga = (PI / 3) * (k * gp.Ba * gp.Ba / (2 * MU0)) * d3;
      line(ctx, [[axB.X(q.g), box.y - 4], [axB.X(q.g), box.y + box.h]], COL.c6, 1.4, [3, 3]);
      line(ctx, [[axT.X(q.g), box2.y - 4], [axT.X(q.g), box2.y + box2.h]], COL.c6, 1.4, [3, 3]);
      dot(ctx, axB.X(q.g), axB.Y(gp.Br), 4.5, COL.c1);
      dot(ctx, axB.X(q.g), axB.Y(gp.Ba), 4.5, COL.c2);
      dot(ctx, axT.X(q.g), axT.Y(gr), 4.5, COL.c1);
      dot(ctx, axT.X(q.g), axT.Y(ga), 4.5, COL.c2);
      var xr1 = axB.X(G_REF_R);
      var xr2 = axB.X(G_REF_A);
      line(ctx, [[xr1, box.y], [xr1, box.y + box.h]], COL.c3, 1.2, [5, 4]);
      line(ctx, [[xr2, box.y], [xr2, box.y + box.h]], COL.c4, 1.2, [5, 4]);
      var xt1 = axT.X(G_REF_R);
      var xt2 = axT.X(G_REF_A);
      line(ctx, [[xt1, box2.y], [xt1, box2.y + box2.h]], COL.c3, 1.2, [5, 4]);
      line(ctx, [[xt2, box2.y], [xt2, box2.y + box2.h]], COL.c4, 1.2, [5, 4]);
      label(ctx, xr1, box.y + 12, 'g_r = 0.3 mm', COL.c3, 'left', 'top', FONT_S);
      label(ctx, xr2, box.y + 26, 'g_a = 1.0 mm', COL.c4, 'left', 'top', FONT_S);
      label(ctx, xt1, box2.y + 12, 'g_r = 0.3 mm', COL.c3, 'left', 'top', FONT_S);
      label(ctx, xt2, box2.y + 26, 'g_a = 1.0 mm', COL.c4, 'left', 'top', FONT_S);
      label(ctx, 10, 16, 'B_gap بر حسب g — مقطع محوری دو شکاف دارد', COL.text, 'left', 'top', FONT_B);
      label(ctx, pw + 10, 16, 'T بر حسب g — افت با توان ۲/g_eff', COL.text, 'left', 'top', FONT_B);
      rect(ctx, 10, h - 18, 10, 9, COL.c1, 0.85);
      label(ctx, 24, h - 13, 'شعاعی g_eff = g', COL.c1, 'left', 'middle', FONT_S);
      rect(ctx, 130, h - 18, 10, 9, COL.c2, 0.85);
      label(ctx, 144, h - 13, 'محوری g_eff = 2g', COL.c2, 'left', 'middle', FONT_S);
      label(ctx, w - 10, h - 13, 'MMF = ' + fmt2(fm) + ' A·turn  |  H = ' + fmt0(q.H) + ' A/m', COL.faint, 'right', 'middle', FONT_S);
    }
  }
  function card5(host) {
    var p = newCard(host, '۵. نیروی محوری و بار یاتاقان', 'نیروی محوری روی هر روتور، توپولوژی‌ها و فشار یاتاقان');
    addFormulas(p.body, [
      'F_axial = B²·A/(2μ₀)      A = π(r_o² − r_i²)      برای هر روتور',
      'تک‌استاتور:  F_net = F_axial (نامتعادل)        دو استاتور:  F_net = 0 (متعادل)',
      'دو روتور:  دو روتور از استاتور مرکزی دور می‌شوند →  بار یاتاقان = ۲·F_axial',
      'm_rotor = ρ·π·r_o²·l_rotor   ,   ρ = 8960 kg/m³        p_bearing = F_net / A_bearing ,  A_bearing = π r_o²/4'
    ]);

    var cB = bindRange('B', { label: 'چگالی شار B', unit: 'T', min: 0.05, max: 1.60, step: 0.01, digits: 2 });
    var cRo = bindRange('ro', { label: 'شعاع بیرونی r_o', unit: 'mm', min: 0.03, max: 0.40, step: 0.002, digits: 1 });
    var cRi = bindRange('ri', { label: 'شعاع داخلی r_i', unit: 'mm', min: 0.008, max: 0.36, step: 0.002, digits: 1 });
    var cTopo = bindSelect('topo', {
      label: 'توپولوژی',
      options: [
        { value: 'single', label: 'تک‌استاتور / تک‌روتور' },
        { value: 'dualstator', label: 'دو استاتور' },
        { value: 'dualrotor', label: 'دو روتور' }
      ]
    });
    p.ctl.appendChild(cB.root);
    p.ctl.appendChild(cRo.root);
    p.ctl.appendChild(cRi.root);
    p.ctl.appendChild(cTopo.root);

    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 340);

    updaters.push(function () {
      var q = params();
      var r = design(q);
      var topo = S.topo;
      var nRot = topo === 'dualrotor' ? 2 : 1;
      var mult = topo === 'single' ? 1 : topo === 'dualstator' ? 0 : 2;
      var fNet = r.Fa * mult;
      var aBear = (PI / 4) * q.ro * q.ro;
      var pBear = aBear > 0 ? fNet / aBear : 0;
      var vR = PI * q.ro * q.ro;
      var mR = vR * q.ls * RHO_M;
      var mA = vR * H_MAG * RHO_M;
      var mTot = topo === 'dualrotor' ? 2 * mA : (topo === 'dualstator' ? mA : mA);
      var wTot = mTot * 9.81;
      ro.update([
        { k: 'توپولوژی', v: topoLabel(topo), unit: '' },
        { k: 'تعداد روتور', v: fmt0(nRot), unit: '-' },
        { k: 'تعداد استاتور', v: fmt0(topo === 'dualstator' ? 2 : topo === 'dualrotor' ? 1 : 1), unit: '-' },
        { k: 'تعداد سطح نیروی محوری', v: fmt0(topo === 'single' ? 1 : topo === 'dualstator' ? 2 : 2), unit: '-' },
        { k: 'A = π(r_o² − r_i²)', v: fmt(r.Ar, 6), unit: 'm²' },
        { kind: 'accent', k: 'F_axial هر روتور', v: fmt0(r.Fa), unit: 'N' },
        { kind: 'accent', k: 'F_axial کل', v: fmt0(r.Fa * nRot), unit: 'N' },
        { k: 'ضریب توپولوژی F_net', v: fmt0(mult), unit: '×' },
        { kind: mult === 0 ? 'good' : 'bad', k: 'F_net روی یاتاقان', v: fmt0(fNet), unit: 'N' },
        { k: 'وضعیت تعادل نیروی محوری', v: mult === 0 ? 'متعادل' : 'نامتعادل', unit: '' },
        { k: 'جرم آهن روتور شعاعی', v: fmt1(mR), unit: 'kg' },
        { k: 'جرم آهن روتور محوری', v: fmt1(mA), unit: 'kg' },
        { k: 'جرم کل آهنی که نگه داشته می‌شود', v: fmt1(mTot), unit: 'kg' },
        { k: 'بار شعاعی از وزن روتور', v: fmt0(wTot), unit: 'N' },
        { k: 'قطر یاتاقان فرضی = r_o', v: fmt1(q.ro * 1000), unit: 'mm' },
        { k: 'سطح یاتاقان A_bearing', v: fmt(aBear, 6), unit: 'm²' },
        { kind: pBear > 2e6 ? 'bad' : 'warn', k: 'فشار یاتاقان p = F_net/A', v: fmt0(pBear / 1000), unit: 'kPa' },
        { k: 'نسبت F_net به بار شعاعی', v: fmt2(wTot > 0 ? fNet / wTot : 0), unit: '-' },
        { k: 'B طراحی', v: fmt2(q.B), unit: 'T' },
        { k: 'τ_avg', v: fmt0(r.tauR), unit: 'N/m²' },
        { k: 'F_axial بر حسب τ·A', v: fmt0(r.tauR * r.Ar), unit: 'N' }
      ]);
      setBadges(bad, [
        ['توپولوژی: ' + topoLabel(topo) + '  |  F_axial هر روتور = ' + fmt0(r.Fa) + ' N', 'badge-accent'],
        ['F_net روی یاتاقان = ' + fmt0(fNet) + ' N  (' + (mult === 0 ? 'متعادل' : 'نامتعادل') + ')', mult === 0 ? 'badge-good' : 'badge-bad'],
        ['p_bearing = ' + fmt0(pBear / 1000) + ' kPa  |  جرم آهنی = ' + fmt1(mTot) + ' kg', pBear > 2e6 ? 'badge-bad' : 'badge-warn'],
        ['A = ' + fmt(r.Ar, 5) + ' m²   |   F = τ·A = ' + fmt0(r.tauR * r.Ar) + ' N', 'badge-accent']
      ]);
      drawForce(0);
    });

    function statorBlock(ctx, x, y, bw, bh) {
      rect(ctx, x, y, bw, bh, COL.stator, 0.92);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,180,84,0.45)';
      ctx.lineWidth = 1;
      var i;
      for (i = -bh; i < bw; i += 7) {
        ctx.beginPath();
        ctx.moveTo(x + i, y + bh);
        ctx.lineTo(x + i + bh, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    function rotorBlock(ctx, cx, y, bw, bh, hMag) {
      rect(ctx, cx - bw / 2, y, bw, hMag, COL.mag, 0.85);
      rect(ctx, cx - bw / 2, y + hMag, bw, bh - 2 * hMag, COL.rotor, 0.95);
      rect(ctx, cx - bw / 2, y + bh - hMag, bw, hMag, COL.mag, 0.85);
      var i;
      for (i = 1; i < 6; i++) {
        var yy = y + hMag + ((bh - 2 * hMag) * i) / 6;
        line(ctx, [[cx - bw / 2 + 1, yy], [cx + bw / 2 - 1, yy]], 'rgba(205,225,250,0.16)', 1);
      }
      ctx.save();
      ctx.strokeStyle = 'rgba(8,14,22,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - bw / 2 + 0.5, y + 0.5, bw - 1, bh - 1);
      ctx.restore();
    }

    function drawForce(ts) {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      var q = params();
      var r = design(q);
      var topo = S.topo;
      var mult = topo === 'single' ? 1 : topo === 'dualstator' ? 0 : 2;
      var fNet = r.Fa * mult;
      var fRef = Math.max(r.Fa, 1e-9);
      var pulse = 0.65 + 0.35 * Math.abs(Math.sin((ts || 0) * 0.004));
      var cx = w * 0.44;
      var bw = Math.min(w * 0.52, 340);
      var rh = 34;
      var hMag = rh * 0.26;
      var gapPx = Math.max(6, q.g * 1400);
      var fLen = Math.min(70, 22 + 50 * pulse);
      var i;
      if (topo === 'dualrotor') {
        var yTop = h * 0.30;
        var yBot = h * 0.30 + rh + 2 * gapPx + 2 * (T_AIR * 400);
        statorBlock(ctx, cx - bw / 2, yTop + rh + gapPx, bw, T_AIR * 400);
        rotorBlock(ctx, cx, yTop, bw, rh, hMag);
        rotorBlock(ctx, cx, yBot, bw, rh, hMag);
        plabel(ctx, cx - bw / 2 - 8, yTop + rh + gapPx + T_AIR * 200, 'استاتور مرکزی', COL.copper, 'right', 'middle', FONT_S);
        plabel(ctx, cx - bw / 2 - 8, yTop + rh / 2, 'روتور ۱', COL.text, 'right', 'middle', FONT_S);
        plabel(ctx, cx - bw / 2 - 8, yBot + rh / 2, 'روتور ۲', COL.text, 'right', 'middle', FONT_S);
        arrow(ctx, cx, yTop + rh / 2, cx, yTop - 6 - fLen * pulse, COL.c4, 2.6, 10);
        arrow(ctx, cx, yBot + rh / 2, cx, yBot + rh + 6 + fLen * pulse, COL.c4, 2.6, 10);
        label(ctx, cx + bw / 2 + 10, yTop - 6 - fLen * pulse + 10, 'F_axial = ' + fmt0(r.Fa) + ' N', COL.c4, 'left', 'middle', FONT_S);
        label(ctx, cx + bw / 2 + 10, yBot + rh + 6 + fLen * pulse - 10, 'F_axial = ' + fmt0(r.Fa) + ' N', COL.c4, 'left', 'middle', FONT_S);
        arrow(ctx, cx, yTop - 6, cx, yBot + rh + 6, COL.c2, 2.2, 9);
        label(ctx, cx + 8, (yTop - 6 + yBot + rh + 6) / 2, 'بار یاتاقان = ۲·F_axial = ' + fmt0(fNet) + ' N', COL.c2, 'left', 'middle', FONT_B);
      } else {
        var cy = h * 0.44;
        var stTop = cy - rh - gapPx - T_AIR * 400;
        var stBot = cy + rh + gapPx;
        rotorBlock(ctx, cx, cy - rh / 2, bw, rh, hMag);
        if (topo === 'dualstator') {
          statorBlock(ctx, cx - bw / 2, stTop, bw, T_AIR * 400);
          statorBlock(ctx, cx - bw / 2, stBot, bw, T_AIR * 400);
          arrow(ctx, cx + bw * 0.22, stTop + T_AIR * 400 + 2, cx + bw * 0.22, cy - rh / 2 + 2, COL.c4, 2.4, 9);
          arrow(ctx, cx + bw * 0.22, stBot - 2, cx + bw * 0.22, cy + rh / 2 - 2, COL.c4, 2.4, 9);
          plabel(ctx, cx - bw / 2 - 8, stTop + T_AIR * 200, 'استاتور ۱', COL.copper, 'right', 'middle', FONT_S);
          plabel(ctx, cx - bw / 2 - 8, stBot + T_AIR * 200, 'استاتور ۲', COL.copper, 'right', 'middle', FONT_S);
          plabel(ctx, cx - bw / 2 - 8, cy, 'روتور', COL.text, 'right', 'middle', FONT_S);
          line(ctx, [[cx + bw * 0.22 - 12, cy - rh / 2], [cx + bw * 0.22 + 12, cy + rh / 2]], COL.c3, 2);
          line(ctx, [[cx + bw * 0.22 + 12, cy - rh / 2], [cx + bw * 0.22 - 12, cy + rh / 2]], COL.c3, 2);
          label(ctx, cx + bw / 2 + 12, cy, 'F_net = 0 N  (متعادل)', COL.c3, 'left', 'middle', FONT_B);
          label(ctx, cx + bw * 0.22 + 14, cy - rh / 2 - 6, '+' + fmt0(r.Fa) + ' N', COL.c4, 'left', 'bottom', FONT_S);
          label(ctx, cx + bw * 0.22 + 14, cy + rh / 2 + 6, '−' + fmt0(r.Fa) + ' N', COL.c4, 'left', 'top', FONT_S);
        } else {
          statorBlock(ctx, cx - bw / 2, stBot, bw, T_AIR * 400);
          plabel(ctx, cx - bw / 2 - 8, stBot + T_AIR * 200, 'استاتور', COL.copper, 'right', 'middle', FONT_S);
          plabel(ctx, cx - bw / 2 - 8, cy, 'روتور', COL.text, 'right', 'middle', FONT_S);
          arrow(ctx, cx, stBot - 2, cx, cy - rh / 2 + 2, COL.c4, 2.6, 10);
          label(ctx, cx + bw / 2 + 12, cy - rh / 2 - 6, 'F_axial = ' + fmt0(r.Fa) + ' N', COL.c4, 'left', 'bottom', FONT_S);
          label(ctx, cx + bw / 2 + 12, cy, 'F_net = ' + fmt0(fNet) + ' N  (نامتعادل)', COL.c4, 'left', 'middle', FONT_B);
        }
      }
      var aBear = (PI / 4) * q.ro * q.ro;
      var x0 = 16;
      var y0 = h - 96;
      ctx.save();
      ctx.strokeStyle = COL.axis;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x0, y0, Math.min(w * 0.62, 330), 74);
      ctx.restore();
      plabel(ctx, x0 + 8, y0 + 14, 'بار یاتاقان محوری', COL.text, 'left', 'top', FONT_S);
      var segW = Math.min(w * 0.62, 330) - 16;
      var cells = [
        { v: 1, c: COL.c4, l: 'F_net' },
        { v: 2, c: COL.c1, l: 'بار شعاعی' }
      ];
      var tot = Math.max(fNet, 1) + wTotOf(q, topo);
      var xx = x0 + 8;
      for (i = 0; i < cells.length; i++) {
        var val = i === 0 ? fNet : wTotOf(q, topo);
        var seg = (val / Math.max(tot, 1e-9)) * segW;
        rect(ctx, xx, y0 + 24, Math.max(seg, 0), 18, cells[i].c, 0.85);
        if (seg > 40) {
          label(ctx, xx + seg / 2, y0 + 33, cells[i].l, '#0d1420', 'center', 'middle', FONT_S);
        }
        xx += seg;
      }
      label(ctx, x0 + 8, y0 + 60, 'F_net = ' + fmt0(fNet) + ' N  |  F_radial = ' + fmt0(wTotOf(q, topo)) + ' N', COL.faint, 'left', 'top', FONT_S);
      label(ctx, x0 + 8, y0 + 14, 'p = ' + fmt0(aBear > 0 ? fNet / aBear / 1000 : 0) + ' kPa  |  A_bearing = ' + fmt(aBear, 5) + ' m²', COL.c3, 'right', 'top', FONT_S);
      label(ctx, 10, 16, 'axial thrust on rotor, topology = ' + topoLabel(topo), COL.text, 'left', 'top', FONT_B);
      label(ctx, w - 10, h - 10, 'F_axial = B²·A/(2μ₀) = ' + fmt0(r.Fa) + ' N   |   ref F = ' + fmt0(fRef) + ' N', COL.faint, 'right', 'bottom', FONT_S);
    }

    function wTotOf(q, topo) {
      var mA = PI * q.ro * q.ro * H_MAG * RHO_M;
      var m = topo === 'dualrotor' ? 2 * mA : mA;
      return m * 9.81;
    }

    addAnim(function (ts) { drawForce(ts); });
    updaters[updaters.length - 1]();
  }
  function card6(host) {
    var p = newCard(host, '۶. مقایسه جامع', 'جدول کامل معیارها، نمودار رادار نرمال‌شده و بودجه حجم و جرم');
    addFormulas(p.body, [
      'امتیازهای نمودار رادار نرمال‌شده ۰ تا ۱ هستند (داوری مهندسی) — دو محور چگالی گشتاور و چگالی توان از محاسبه همین کارت می‌آید.',
      'بودجه حجم:  V = V_شکاف + V_آهنربا + V_آهن + V_مس   ،  سهم آهن:  شعاعی ۶۵٪ ، محوری ۵۵٪ از باقیمانده',
      'جرم کل هر معماری = V·۸۹۶۰ kg/m³  (همان جرم کارت ۲)  |  سرعت مرجع = ' + fmt0(N_NOM) + ' rpm'
    ]);

    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var tbl = el('table', 'ph-table');
    p.body.appendChild(tbl);
    var cvR = newCanvas(p.body, 460);
    var cvB = newCanvas(p.body, 220);

    var AXES = [
      { key: 'td', label: 'چگالی گشتاور', R: 0.72, A: 0.95 },
      { key: 'pd', label: 'چگالی توان', R: 0.62, A: 0.92 },
      { key: 'cool', label: 'خنک‌کاری', R: 0.55, A: 0.92 },
      { key: 'scale', label: 'مقیاس‌پذیری', R: 0.85, A: 0.55 },
      { key: 'cost', label: 'هزینه', R: 0.85, A: 0.55 },
      { key: 'wind', label: 'سادگی سیم‌پیچ', R: 0.80, A: 0.60 }
    ];

    updaters.push(function () {
      var q = params();
      var r = design(q);
      var bR = budget(q, r, false);
      var bA = budget(q, r, true);
      var tdRatio = r.tdR > 0 ? r.tdA / r.tdR : 0;
      var pdRatio = r.pdR > 0 ? r.pdA / r.pdR : 0;
      ro.update([
        { kind: 'accent', k: 'چگالی گشتاور شعاعی', v: fmt0(r.tdR), unit: 'N·m/m³' },
        { kind: 'accent', k: 'چگالی گشتاور محوری', v: fmt0(r.tdA), unit: 'N·m/m³' },
        { k: 'نسبت چگالی گشتاور محوری/شعاعی', v: fmt2(tdRatio), unit: '×' },
        { k: 'چگالی توان شعاعی', v: fmt0(r.pdR), unit: 'kW/m³' },
        { k: 'چگالی توان محوری', v: fmt0(r.pdA), unit: 'kW/m³' },
        { k: 'نسبت چگالی توان محوری/شعاعی', v: fmt2(pdRatio), unit: '×' },
        { k: 'جرم شعاعی', v: fmt1(r.mr), unit: 'kg' },
        { k: 'جرم محوری', v: fmt1(r.ma), unit: 'kg' },
        { k: 'نسبت جرم محوری/شعاعی', v: fmt2(r.ma / Math.max(r.mr, 1e-12)), unit: '×' },
        { k: 'گشتاور ویژه شعاعی', v: fmt2(r.stR), unit: 'N·m/kg' },
        { k: 'گشتاور ویژه محوری', v: fmt2(r.stA), unit: 'N·m/kg' },
        { k: 'حجم اشغال‌شده محوری (مساحت پنکیک)', v: fmt(r.Ar, 5), unit: 'm²' },
        { k: 'ضریب پرشدگی سیم‌پیچ شعاعی (برآورد)', v: fmt2(0.48), unit: '' },
        { k: 'ضریب پرشدگی سیم‌پیچ محوری (برآورد)', v: fmt2(0.62), unit: '' },
        { k: 'شکاف هوایی کاری شعاعی', v: fmt(G_REF_R * 1000, 2), unit: 'mm' },
        { k: 'شکاف هوایی کاری محوری', v: fmt(G_REF_A * 1000, 2), unit: 'mm' },
        { k: 'سرعت مرجع', v: fmt0(N_NOM), unit: 'rpm' },
        { k: 'سرعت زاویه‌ای مرجع', v: fmt0(r.w), unit: 'rad/s' }
      ]);
      setBadges(bad, [
        ['T/V:  ' + fmt0(r.tdR) + ' در برابر ' + fmt0(r.tdA) + ' N·m/m³  (نسبت ' + fmt2(tdRatio) + ')', 'badge-accent'],
        ['P/V در ' + fmt0(N_NOM) + ' rpm:  ' + fmt0(r.pdR) + ' در برابر ' + fmt0(r.pdA) + ' kW/m³  (نسبت ' + fmt2(pdRatio) + ')', 'badge-accent'],
        ['جرم:  ' + fmt1(r.mr) + ' kg در برابر ' + fmt1(r.ma) + ' kg  |  T/m:  ' + fmt2(r.stR) + ' در برابر ' + fmt2(r.stA) + ' N·m/kg', 'badge-accent'],
        ['شکاف مرجع:  شعاعی ' + fmt(G_REF_R * 1000, 2) + ' mm  |  محوری ' + fmt(G_REF_A * 1000, 2) + ' mm', 'badge-warn']
      ]);
      renderTable6(q, r, tdRatio, pdRatio);
      drawRadar(q, r, tdRatio, pdRatio);
      drawBudget(q, r, bR, bA);
    });

    function renderTable6(q, r, tdRatio, pdRatio) {
      while (tbl.firstChild) { tbl.removeChild(tbl.firstChild); }
      var rows = [
        ['چگالی گشتاور T/V', fmt0(r.tdR) + ' N·m/m³', fmt0(r.tdA) + ' N·m/m³'],
        ['چگالی توان P/V در ' + fmt0(N_NOM) + ' rpm', fmt0(r.pdR) + ' kW/m³', fmt0(r.pdA) + ' kW/m³'],
        ['جرم m = V·۸۹۶۰', fmt1(r.mr) + ' kg', fmt1(r.ma) + ' kg'],
        ['حجم V', fmt(r.Vr, 5) + ' m³', fmt(r.Va, 5) + ' m³'],
        ['ضریب پرشدگی سیم‌پیچ (برآورد)', '۰٫۴۸ — سیم‌پیچ ساده و دسترس‌پذیر', '۰٫۶۲ — سیم‌پیچ تودرتو و پیچیده'],
        ['شکاف هوایی کاری', fmt(G_REF_R * 1000, 2) + ' mm — دقت و یاتاقان سخت', fmt(G_REF_A * 1000, 2) + ' mm — جذب و لقی زیاد'],
        ['پیامد شکاف', 'MMF کمتر مصرف می‌شود، B بالاتر', 'دو شکاف، MMF دوبرابر، B نصف'],
        ['خنک‌کاری', 'از میان پشته شعاعی — سطح کم', 'از سطح محوری روی روتور — سطح زیاد'],
        ['بهره‌برداری آهنربا', 'آهنربا روی قطب روتور، حاشیه زیاد', 'آهنربا روی سطح روتور، بازده بالا'],
        ['هزینه', 'پایین — ساخت و مونتاژ متعارف', 'بالا — ورق و سیم‌پیچ و مونتاژ خاص'],
        ['کاربردهای متداول', 'خودرو، کمپرسور، ژنراتور تناوبی', 'کشتی، رباتیک، درایو تراکشن سنگین'],
        ['مقیاس‌پذیری قطر', 'محدود به قطر بیرونی و طول استک', 'بالا — فقط قطر بزرگ‌تر، بدون طول'],
        ['نسبت چگالی گشتاور به شعاعی', '۱٫۰۰۰ پایه', fmt2(tdRatio) + '×'],
        ['نسبت چگالی توان به شعاعی', '۱٫۰۰۰ پایه', fmt2(pdRatio) + '×']
      ];
      var thead = el('thead');
      var hr = el('tr');
      hr.appendChild(el('th', null, 'معیار'));
      hr.appendChild(el('th', null, 'ماشین شعاعی (in-wheel کلاسیک)'));
      hr.appendChild(el('th', null, 'ماشین محوری (پنکیک)'));
      thead.appendChild(hr);
      tbl.appendChild(thead);
      var tbody = el('tbody');
      var i;
      for (i = 0; i < rows.length; i++) {
        var tr = el('tr');
        tr.appendChild(el('td', null, rows[i][0]));
        tr.appendChild(el('td', null, rows[i][1]));
        tr.appendChild(el('td', null, rows[i][2]));
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
    }

    function drawRadar(q, r, tdRatio, pdRatio) {
      var s = prep(cvR);
      var ctx = s.ctx, w = s.w, h = s.h;
      var cx = w * 0.5;
      var cy = h * 0.54;
      var R = Math.min(w, h) * 0.34;
      var n = AXES.length;
      var i;
      for (i = 1; i <= 4; i++) {
        var pts = [];
        var j;
        for (j = 0; j < n; j++) {
          var a = -PI / 2 + (j * 2 * PI) / n;
          pts.push([cx + R * (i / 4) * Math.cos(a), cy + R * (i / 4) * Math.sin(a)]);
        }
        poly(ctx, pts);
        ctx.save();
        ctx.strokeStyle = COL.grid;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      for (i = 0; i < n; i++) {
        var ang = -PI / 2 + (i * 2 * PI) / n;
        line(ctx, [[cx, cy], [cx + R * Math.cos(ang), cy + R * Math.sin(ang)]], COL.grid, 1);
      }
      var setR = [];
      var setA = [];
      for (i = 0; i < n; i++) {
        var ang2 = -PI / 2 + (i * 2 * PI) / n;
        setR.push([cx + R * AXES[i].R * Math.cos(ang2), cy + R * AXES[i].R * Math.sin(ang2)]);
        setA.push([cx + R * AXES[i].A * Math.cos(ang2), cy + R * AXES[i].A * Math.sin(ang2)]);
      }
      poly(ctx, setR);
      ctx.save();
      ctx.fillStyle = COL.c1;
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.restore();
      poly(ctx, setA);
      ctx.save();
      ctx.fillStyle = COL.c2;
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.restore();
      poly(ctx, setR);
      ctx.save();
      ctx.strokeStyle = COL.c1;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
      poly(ctx, setA);
      ctx.save();
      ctx.strokeStyle = COL.c2;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
      for (i = 0; i < n; i++) {
        var ang3 = -PI / 2 + (i * 2 * PI) / n;
        dot(ctx, setR[i][0], setR[i][1], 3.4, COL.c1);
        dot(ctx, setA[i][0], setA[i][1], 3.4, COL.c2);
        var lx = cx + (R + 24) * Math.cos(ang3);
        var ly = cy + (R + 24) * Math.sin(ang3);
        var al = 'center';
        var base = 'middle';
        if (lx > cx + 8) { al = 'left'; }
        if (lx < cx - 8) { al = 'right'; }
        if (ly < cy - 8) { base = 'bottom'; }
        if (ly > cy + 8) { base = 'top'; }
        plabel(ctx, lx, ly, AXES[i].label, COL.text, al, base, FONT_S);
      }
      dot(ctx, setR[0][0], setR[0][1], 5, COL.c3);
      dot(ctx, setA[0][0], setA[0][1], 5, COL.c3);
      label(ctx, cx - 6, cy - R * 0.62, 'محور ۱ = چگالی گشتاور محاسبه‌شده', COL.c3, 'right', 'middle', FONT_S);
      label(ctx, 10, 16, 'radar chart on normalised axes (0 to 1)', COL.text, 'left', 'top', FONT_B);
      label(ctx, w - 10, 16, 'T/V: ' + fmt0(r.tdR) + ' | ' + fmt0(r.tdA) + ' N·m/m³', COL.faint, 'right', 'top', FONT_S);
      label(ctx, 10, h - 12, 'P/V: ' + fmt0(r.pdR) + ' | ' + fmt0(r.pdA) + ' kW/m³ at ' + fmt0(N_NOM) + ' rpm', COL.faint, 'left', 'bottom', FONT_S);
      rect(ctx, w - 240, h - 24, 10, 10, COL.c1, 0.85);
      label(ctx, w - 226, h - 19, 'radial', COL.c1, 'left', 'middle', FONT_S);
      rect(ctx, w - 170, h - 24, 10, 10, COL.c2, 0.85);
      label(ctx, w - 156, h - 19, 'axial', COL.c2, 'left', 'middle', FONT_S);
    }

    function drawBudget(q, r, bR, bA) {
      var s = prep(cvB);
      var ctx = s.ctx, w = s.w, h = s.h;
      var rows = [
        { l: 'radial', b: bR, v: r.Vr, m: r.mr, col: COL.c1 },
        { l: 'axial', b: bA, v: r.Va, m: r.ma, col: COL.c2 }
      ];
      var segs = [
        { k: 'gap', c: COL.gap, l: 'شکاف' },
        { k: 'mag', c: COL.mag, l: 'آهنربا' },
        { k: 'iron', c: COL.iron, l: 'آهن' },
        { k: 'cop', c: COL.copper, l: 'مس' }
      ];
      var i, j;
      for (i = 0; i < 2; i++) {
        var y = 26 + i * 74;
        var x0 = 96;
        var bw = w - x0 - 24;
        var row = rows[i];
        var tot = Math.max(row.b.total, 1e-12);
        var xx = x0;
        for (j = 0; j < segs.length; j++) {
          var val = row.b[segs[j].k];
          var seg = (val / tot) * bw;
          rect(ctx, xx, y, Math.max(seg - 1, 0), 26, segs[j].c, 0.85);
          if (seg > 52) {
            label(ctx, xx + seg / 2, y + 13, segs[j].l + ' ' + fmt((val / tot) * 100, 1) + '%', '#0d1420', 'center', 'middle', FONT_S);
          }
          xx += seg;
        }
        ctx.save();
        ctx.strokeStyle = COL.axis;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x0, y, bw, 26);
        ctx.restore();
        label(ctx, x0 - 10, y + 13, row.l, row.col, 'right', 'middle', FONT_B);
        label(ctx, x0, y - 6, 'V = ' + fmt(row.v, 5) + ' m³   |   m = ' + fmt1(row.m) + ' kg   |   T/V = ' + fmt0(row.l === 'radial' ? r.tdR : r.tdA) + ' N·m/m³', COL.faint, 'left', 'bottom', FONT_S);
        label(ctx, w - 24, y + 13, '100%', COL.faint, 'right', 'middle', FONT_S);
      }
      var lx = 96;
      for (j = 0; j < segs.length; j++) {
        rect(ctx, lx, h - 16, 9, 9, segs[j].c, 0.85);
        label(ctx, lx + 13, h - 11, segs[j].l, COL.faint, 'left', 'middle', FONT_S);
        lx += 76;
      }
      label(ctx, 10, 14, 'stacked volume / mass budget per architecture', COL.text, 'left', 'top', FONT_B);
      label(ctx, w - 10, 14, 'Σ = V·8960 kg/m³', COL.faint, 'right', 'top', FONT_S);
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
    card3(wrap);
    card4(wrap);
    card5(wrap);
    card6(wrap);
    return cleanup;
  }

  PH.register('motor-flux', {
    title: 'شار محوری در برابر شعاعی',
    subtitle: 'مدل تنش برشی هوایی، گشتاور، چگالی گشتاور، شکاف هوایی، حساسیت پارامترها، نیروی محوری و مقایسه جامع',
    build: build
  });
}());
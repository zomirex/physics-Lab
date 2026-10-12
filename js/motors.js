(function () {
  'use strict';

  var PH = window.PH;
  if (!PH) { return; }

  var PI = Math.PI;
  var MU0 = 4 * PI * 1e-7;
  var G = 9.81;

  var R_BORE = 0.06;
  var L_STACK = 0.08;
  var SECTOR = 6;
  var HALL_ERR = 30;

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

  var SLOT_PHASE = ['U', 'V', 'W', 'U', 'V', 'W'];
  var SLOT_SIDE = [1, 1, 1, -1, -1, -1];
  var SEQ = [
    { hi: 'U', lo: 'V' },
    { hi: 'W', lo: 'V' },
    { hi: 'W', lo: 'U' },
    { hi: 'V', lo: 'U' },
    { hi: 'V', lo: 'W' },
    { hi: 'W', lo: 'U' }
  ];
  var SEQ2 = [
    { hi: 'U', lo: 'V' },
    { hi: 'W', lo: 'V' },
    { hi: 'W', lo: 'U' },
    { hi: 'V', lo: 'U' },
    { hi: 'V', lo: 'W' },
    { hi: 'U', lo: 'W' }
  ];
  var PHASE_COLOR = { U: COL.c1, V: COL.c3, W: COL.c2 };
  var PHASE_FULL = { U: 'فاز U', V: 'فاز V', W: 'فاز W' };

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
    theta: 0,
    p: 6,
    Nph: 12,
    Phi: 0.004,
    R: 0.25,
    L: 0.0003,
    Vbus: 48,
    Imax: 25,
    om: 100,
    Tload: 1.5,
    J: 2e-5,
    Bfric: 1e-4
  };

  var updaters = [];
  var binds = [];

  function clamp(v, lo, hi) {
    if (typeof v !== 'number' || isNaN(v)) { return lo; }
    if (v < lo) { return lo; }
    if (v > hi) { return hi; }
    return v;
  }

  function wrapDeg(v) {
    var d = v % 360;
    if (d < 0) { d += 360; }
    return d;
  }

  function params() {
    return {
      wave: S.wave === 'sine' ? 'sine' : 'trap',
      theta: clamp(S.theta, 0, 360),
      p: clamp(S.p, 1, 12),
      Nph: clamp(S.Nph, 1, 60),
      Phi: clamp(S.Phi, 0.0005, 0.02),
      R: clamp(S.R, 0.02, 2),
      L: clamp(S.L, 0.00005, 0.002),
      Vbus: clamp(S.Vbus, 12, 120),
      Imax: clamp(S.Imax, 1, 60),
      om: clamp(S.om, 0, 800),
      Tload: clamp(S.Tload, 0.1, 20)
    };
  }

  function kOf(lam, poles, wave) {
    var pl = poles * lam;
    if (wave === 'sine') { return { ke: pl, kt: 1.5 * pl, ratio: 1.5 }; }
    return { ke: (2 / PI) * pl, kt: pl, ratio: PI / 2 };
  }

  function elec(q) {
    var lam = q.Nph * q.Phi;
    var kk = kOf(lam, q.p, q.wave);
    var Vph = q.Vbus / Math.sqrt(3);
    var Z = Math.sqrt(q.R * q.R + (q.om * q.L) * (q.om * q.L));
    var Iun = Z > 0 ? Vph / Z : 0;
    var I = Math.min(q.Imax, Iun);
    var delta = Math.atan((q.om * q.L) / q.R);
    var D = Iun > 0 ? I / Iun : 0;
    var T = kk.kt * I;
    var ob = kk.ke > 0 ? Vph / kk.ke : 0;
    return {
      lam: lam, ke: kk.ke, kt: kk.kt, ratio: kk.ratio,
      Vph: Vph, Z: Z, Iun: Iun, I: I, delta: delta, D: D,
      T: T, Pin: 3 * Vph * I * Math.cos(delta), Pcu: 3 * I * I * q.R,
      Pout: T * q.om, ob: ob, rpm: ob * 30 / PI,
      we: q.p * q.om, f: (q.p * q.om) / (2 * PI)
    };
  }

  function torqueAt(q, w) {
    var lam = q.Nph * q.Phi;
    var kk = kOf(lam, q.p, q.wave);
    var Vph = q.Vbus / Math.sqrt(3);
    var ob = kk.ke > 0 ? Vph / kk.ke : 0;
    var Z = Math.sqrt(q.R * q.R + (w * q.L) * (w * q.L));
    var Iun = Z > 0 ? Vph / Z : 0;
    var Tcc = kk.kt * Math.min(q.Imax, Iun);
    if (w <= ob || w <= 0) { return Tcc; }
    return (Tcc * ob) / w;
  }

  function trapUnit(thDeg) {
    var u = wrapDeg(thDeg);
    if (u < 60) { return 1; }
    if (u < 120) { return 1 - (2 * (u - 60)) / 60; }
    if (u < 240) { return -1; }
    if (u < 300) { return -1 + (2 * (u - 240)) / 60; }
    return 1;
  }

  function commutation(q) {
    var offset = q.wave === 'sine' ? 0 : 60;
    var thE = q.p * q.theta + offset;
    var te = wrapDeg(thE);
    var k = Math.floor(te / 60) % SECTOR;
    if (k < 0) { k += SECTOR; }
    var seq = q.wave === 'sine' ? SEQ : SEQ2;
    var step = seq[k];
    var iq, id;
    if (q.wave === 'sine') {
      iq = q.Imax;
      id = 0;
    } else {
      iq = q.Imax * Math.cos(HALL_ERR * PI / 180);
      id = -q.Imax * Math.sin(HALL_ERR * PI / 180);
    }
    var iU, iV, iW;
    if (q.wave === 'sine') {
      iU = q.Imax * Math.cos(te * PI / 180);
      iV = q.Imax * Math.cos((te - 120) * PI / 180);
      iW = q.Imax * Math.cos((te + 120) * PI / 180);
    } else {
      iU = (step.hi === 'U' ? q.Imax : 0) + (step.lo === 'U' ? -q.Imax : 0);
      iV = (step.hi === 'V' ? q.Imax : 0) + (step.lo === 'V' ? -q.Imax : 0);
      iW = (step.hi === 'W' ? q.Imax : 0) + (step.lo === 'W' ? -q.Imax : 0);
    }
    var lam = q.Nph * q.Phi;
    var kk = kOf(lam, q.p, q.wave);
    var dom = 'U';
    var dmax = Math.abs(iU);
    if (Math.abs(iV) > dmax) { dmax = Math.abs(iV); dom = 'V'; }
    if (Math.abs(iW) > dmax) { dmax = Math.abs(iW); dom = 'W'; }
    return {
      offset: offset, thE: thE, te: te, k: k, step: step,
      iq: iq, id: id, iU: iU, iV: iV, iW: iW,
      kt: kk.kt, T: kk.kt * iq, dom: dom,
      statorDeg: (k * 60 + 30) / q.p
    };
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
      var g = b.c.get();
      var s = S[b.key];
      if (typeof s === 'number') {
        var cur = parseFloat(g);
        if (!(cur === cur) || Math.abs(cur - s) > 1e-9) { b.c.set(s); }
      } else if (String(g) !== String(s)) {
        b.c.set(s);
      }
    }
  }

  function refresh() {
    sync();
    for (var i = 0; i < updaters.length; i++) { updaters[i](); }
  }

  function slotUnit(c, i) {
    var ph = SLOT_PHASE[i];
    if (c.step.hi === ph && SLOT_SIDE[i] > 0) { return 1; }
    if (c.step.lo === ph && SLOT_SIDE[i] < 0) { return -1; }
    return 0;
  }

  function phaseCurrent(c, ph) {
    if (ph === 'U') { return c.iU; }
    if (ph === 'V') { return c.iV; }
    return c.iW;
  }

  function card1(host) {
    var p = newCard(host, '۱. نحوه کارکرد و کموتاسیون', 'مقطع عرضی ماشین سه‌فاز، سکتورهای هال، جفت فازهای روشن و موقعیت روتور');
    addFormulas(p.body, [
      'پیوند شار هر فاز:   λ = N_ph · Φ          زاویه الکتریکی:   θ_e = p · θ_m + offset',
      'سینوسی (FOC):  E_peak = p·λ·ω_m   ,   T = (3/2)·p·λ·i_q   ,   i_d = 0',
      'ذرات مستطیلی (6-step):  E = (2/π)·p·λ·ω_m   ,   T = p·λ·I_dc',
      'offset = 0 برای سینوسی   |   offset = ۶۰ درجه برای ذراتی   |   هر ۶۰ درجه الکتریکی یک سکتور هال',
      'مؤلفه‌های dq در حالت ذراتی:   i_q = I·cos(offset_k)   ,   i_d = −I·sin(offset_k)'
    ]);

    var cWave = bindSelect('wave', {
      label: 'نوع درایو',
      options: [
        { value: 'sine', label: 'سینوسی (FOC)' },
        { value: 'trap', label: 'ذرات مستطیلی (6-step)' }
      ]
    });
    var cTheta = bindRange('theta', { label: 'موقعیت روتور θ_m', unit: '°', min: 0, max: 360, step: 1, digits: 1 });
    p.ctl.appendChild(cWave.root);
    p.ctl.appendChild(cTheta.root);

    var chips = chipRow(p.body);
    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 460);

    function refreshCard1() {
      var q = params();
      var c = commutation(q);
      var e = elec(q);
      ro.update([
        { k: 'نوع درایو', v: waveLabel(q.wave), unit: '' },
        { k: 'offset کموتاسیون', v: fmt0(c.offset), unit: '°' },
        { k: 'تعداد جفت قطب p', v: fmt0(q.p), unit: '-' },
        { kind: 'accent', k: 'موقعیت روتور θ_m', v: fmt1(q.theta), unit: '°' },
        { kind: 'accent', k: 'زاویه الکتریکی θ_e = p·θ_m + offset', v: fmt1(c.te), unit: '°' },
        { k: 'سکتور هال جاری', v: fmt0(c.k * 60) + ' تا ' + fmt0((c.k + 1) * 60), unit: '°' },
        { kind: 'accent', k: 'شماره گام کموتاسیون', v: (c.k + 1) + ' از 6', unit: '' },
        { kind: 'accent', k: 'فازهای روشن', v: c.step.hi + '+ و ' + c.step.lo + '−', unit: '' },
        { kind: 'good', k: 'فاز با بیشترین جریان', v: PHASE_FULL[c.dom], unit: '' },
        { k: 'جریان i_q', v: fmt2(c.iq), unit: 'A' },
        { k: 'جریان i_d', v: fmt2(c.id), unit: 'A' },
        { k: 'جریان فاز U', v: fmt2(c.iU), unit: 'A' },
        { k: 'جریان فاز V', v: fmt2(c.iV), unit: 'A' },
        { k: 'جریان فاز W', v: fmt2(c.iW), unit: 'A' },
        { k: 'پیوند شار λ = N_ph·Φ', v: fmt4(e.lam), unit: 'Wb' },
        { k: 'ضریب گشتاور k_t', v: fmt3(e.kt), unit: 'N·m/A' },
        { kind: 'accent', k: 'گشتاور لحظه‌ای T = k_t·i_q', v: fmt2(c.T), unit: 'N·m' }
      ]);
      setChips(chips, [
        [waveLabel(q.wave), 'badge-accent'],
        ['گام ' + (c.k + 1) + ' / 6', 'badge-warn'],
        [c.step.hi + '+ , ' + c.step.lo + '−', 'badge-good'],
        ['θ_e = ' + fmt0(c.te) + '°', 'badge-accent']
      ]);
      setBadges(bad, [
        ['جفت فاز روشن:  ' + c.step.hi + '+ و ' + c.step.lo + '−   —   فاز آزاد: ' + thirdPhase(c), 'badge-good'],
        ['i_q = ' + fmt2(c.iq) + ' A   |   i_d = ' + fmt2(c.id) + ' A   |   T = ' + fmt2(c.T) + ' N·m', 'badge-accent'],
        ['θ_m = ' + fmt1(q.theta) + '°   →   θ_e = ' + fmt0(q.p) + '·' + fmt1(q.theta) + '° + ' + fmt0(c.offset) + '° = ' + fmt1(c.te) + '°', 'badge-accent'],
        ['خطای سنسور هال ۳۰ درجه ⇒ i_q = I·cos۳۰° و i_d = −I·sin۳۰°', q.wave === 'sine' ? 'badge-good' : 'badge-warn']
      ]);
      drawCard1();
    }

    function thirdPhase(c) {
      if (c.step.hi !== 'W' && c.step.lo !== 'W') { return 'فاز W'; }
      if (c.step.hi !== 'U' && c.step.lo !== 'U') { return 'فاز U'; }
      return 'فاز V';
    }

    function drawCard1() {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      var q = params();
      var c = commutation(q);
      var R = Math.min(w * 0.24, h * 0.34);
      var cx = w * 0.31;
      var cy = h * 0.48;
      var th = q.theta * PI / 180;
      var i;
      for (i = 0; i < SECTOR; i++) {
        var a0 = -PI / 2 + (i * 2 * PI) / SECTOR + 0.05;
        var a1 = -PI / 2 + ((i + 1) * 2 * PI) / SECTOR - 0.05;
        var hot = i === c.k;
        arc(ctx, cx, cy, R * 1.13, a0, a1, hot ? COL.c6 : COL.grid, hot ? 3.4 : 1.4);
        var am = (a0 + a1) / 2;
        label(ctx, cx + R * 1.22 * Math.cos(am), cy + R * 1.22 * Math.sin(am), (i + 1), hot ? COL.c6 : COL.faint, 'center', 'middle', FONT_XS);
      }
      plabel(ctx, cx, cy - R * 1.30, 'سنسور هال — سکتور ' + (c.k + 1), COL.c6, 'center', 'middle', FONT_S);
      ring(ctx, cx, cy, R, COL.stator, R * 0.2);
      ring(ctx, cx, cy, R * 0.80, 'rgba(8,14,22,0.7)', 1.4);
      for (i = 0; i < SECTOR; i++) {
        var a = -PI / 2 + (i * PI) / 3;
        var ph = SLOT_PHASE[i];
        var v = q.wave === 'sine' ? phaseCurrent(c, ph) / Math.max(q.Imax, 1e-9) : slotUnit(c, i);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.globalAlpha = 0.16 + 0.74 * Math.min(Math.abs(v), 1);
        ctx.fillStyle = PHASE_COLOR[ph];
        ctx.fillRect(R * 0.60, -R * 0.19, R * 0.20, R * 0.38);
        ctx.restore();
        arc(ctx, cx, cy, R * 0.585, a - 0.40, a + 0.40, COL.iron, R * 0.075);
        var lx = cx + R * 0.70 * Math.cos(a);
        var ly = cy + R * 0.70 * Math.sin(a);
        label(ctx, lx, ly, ph + (SLOT_SIDE[i] > 0 ? '+' : '−'), Math.abs(v) > 0.4 ? '#0d1420' : COL.faint, 'center', 'middle', FONT_XS);
      }
      ring(ctx, cx, cy, R * 0.52, COL.gap, 1.6);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(th);
      dot(ctx, 0, 0, R * 0.47, COL.rotor);
      ctx.save();
      ctx.fillStyle = COL.mag;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.47, -0.42, 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = COL.c6;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.47, PI - 0.42, PI + 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ring(ctx, 0, 0, R * 0.47, 'rgba(8,14,22,0.7)', 1.2);
      dot(ctx, 0, 0, R * 0.11, COL.panel);
      ring(ctx, 0, 0, R * 0.11, COL.faint, 1);
      ctx.restore();
      arrow(ctx, cx, cy, cx + R * 0.90 * Math.cos(th), cy + R * 0.90 * Math.sin(th), COL.c4, 2.4, 10);
      var sa = c.statorDeg * PI / 180;
      arrow(ctx, cx, cy, cx + R * 0.78 * Math.cos(sa), cy + R * 0.78 * Math.sin(sa), COL.c3, 2, 9);
      arcArrow(ctx, cx, cy, R * 1.36, th - 1.0, th - 0.12, COL.c2, 2.2, 9);
      label(ctx, cx - R * 1.40, cy + R * 0.30, 'ω_m', COL.c2, 'center', 'middle', FONT_B);
      label(ctx, 10, 16, 'magnetic model: 6-slot 3-phase stator, 2-pole rotor schematic', COL.text, 'left', 'top', FONT_B);
      label(ctx, w - 10, 16, 'θ_m = ' + fmt1(q.theta) + '°   θ_e = ' + fmt1(c.te) + '°', COL.faint, 'right', 'top', FONT_S);

      var x0 = w * 0.62;
      var tw = w - x0 - 12;
      var xr = x0 + tw;
      plabel(ctx, xr, 34, 'توالی کموتاسیون ۶ گامی', COL.text, 'right', 'top', FONT_B);
      var seq = q.wave === 'sine' ? SEQ : SEQ2;
      for (i = 0; i < SECTOR; i++) {
        var y = 52 + i * 25;
        var hot2 = i === c.k;
        if (hot2) { rect(ctx, x0, y - 13, tw, 24, 'rgba(76,194,255,0.12)', 1); }
        plabel(ctx, xr - 4, y, 'گام ' + (i + 1), hot2 ? COL.c6 : COL.faint, 'right', 'middle', FONT_S);
        var px = xr - 44;
        var pair = [{ p: seq[i].hi, s: 1 }, { p: seq[i].lo, s: -1 }];
        for (var j = 0; j < 2; j++) {
          rect(ctx, px - 32, y - 8, 32, 16, PHASE_COLOR[pair[j].p], hot2 ? 0.95 : 0.35);
          label(ctx, px - 16, y, pair[j].p + (pair[j].s > 0 ? '+' : '−'), hot2 ? '#0d1420' : COL.faint, 'center', 'middle', FONT_S);
          px -= 38;
        }
      }
      var yb = 52 + SECTOR * 25 + 26;
      var lines = [
        'موقعیت روتور  θ_m = ' + fmt1(q.theta) + '°',
        'زاویه الکتریکی  θ_e = ' + fmt1(c.te) + '°',
        'شماره گام کموتاسیون = ' + (c.k + 1) + ' از 6',
        'جفت فاز روشن = ' + c.step.hi + '+ و ' + c.step.lo + '−',
        'فاز آزاد = ' + thirdPhase(c),
        'مؤلفه dq :  i_q = ' + fmt2(c.iq) + ' A   i_d = ' + fmt2(c.id) + ' A',
        'بردار میدان روتور در زاویه θ_m',
        'بردار میدان استاتور در زاویه ' + fmt1(c.statorDeg) + '° مکانیکی'
      ];
      for (i = 0; i < lines.length; i++) {
        plabel(ctx, xr, yb + i * 19, lines[i], i < 2 ? COL.c6 : COL.text, 'right', 'top', FONT_S);
      }
      var ly = h - 22;
      rect(ctx, w - 168, ly - 8, 10, 10, COL.mag, 0.9);
      label(ctx, w - 154, ly - 3, 'N', COL.mag, 'left', 'middle', FONT_XS);
      rect(ctx, w - 132, ly - 8, 10, 10, COL.c6, 0.9);
      label(ctx, w - 118, ly - 3, 'S', COL.c6, 'left', 'middle', FONT_XS);
      rect(ctx, w - 96, ly - 8, 10, 10, COL.c4, 0.9);
      label(ctx, w - 82, ly - 3, 'field rotor', COL.c4, 'left', 'middle', FONT_XS);
      rect(ctx, w - 96, ly - 22, 10, 10, COL.c3, 0.9);
      label(ctx, w - 82, ly - 17, 'field stator', COL.c3, 'left', 'middle', FONT_XS);
      rect(ctx, w - 20, ly - 8, 10, 10, COL.stator, 0.9);
      label(ctx, w - 6, ly - 3, 'iron', COL.stator, 'left', 'middle', FONT_XS);
    }

    updaters.push(refreshCard1);

    var lastTs = 0;
    addAnim(function (ts) {
      var t = typeof ts === 'number' ? ts : 0;
      var dt = lastTs > 0 ? t - lastTs : 0;
      lastTs = t;
      if (dt > 0 && dt < 250) {
        var dEl = dt * 0.0018;
        var qp = params();
        S.theta = wrapDeg(S.theta + (dEl * 180) / PI / qp.p);
        cTheta.set(Math.round(S.theta * 10) / 10);
      }
      refreshCard1();
    });
    refreshCard1();
  }

  function card2(host) {
    var p = newCard(host, '۲. پارامترها و روابط', 'موج نیروی ضد محرک هر دو نوع درایو، جریان، گشتاور لحظه‌ای و رابطه k_t/k_e');
    addFormulas(p.body, [
      'λ = N_ph · Φ          ω_e = p · ω_m          E = k_e · ω_m          T = k_t · I',
      'سینوسی (FOC):   k_e = p·λ   ,   k_t = (3/2)·p·λ   ⇒  k_t/k_e = 3/2',
      'ذرات مستطیلی:   k_e = (2/π)·p·λ   ,   k_t = p·λ   ⇒  k_t/k_e = π/2',
      'θ_e = p·θ_m + offset   ,   offset = 0 (سینوسی) یا ۶۰ درجه (ذراتی)   ,   f = ω_e/(2π)'
    ]);

    var cP = bindRange('p', { label: 'تعداد جفت قطب p', unit: '-', min: 1, max: 12, step: 1, digits: 0 });
    var cN = bindRange('Nph', { label: 'دور هر فاز N_ph', unit: 'turn', min: 1, max: 60, step: 1, digits: 0 });
    var cPhi = bindRange('Phi', { label: 'شار هر قطب Φ', unit: 'Wb', min: 0.0005, max: 0.02, step: 0.0001, digits: 4 });
    var cOm = bindRange('om', { label: 'سرعت مکانیکی ω_m', unit: 'rad/s', min: 0, max: 800, step: 1, digits: 1 });
    var cI = bindRange('Imax', { label: 'جریان بیشینه I_max', unit: 'A', min: 1, max: 60, step: 0.5, digits: 1 });
    p.ctl.appendChild(cP.root);
    p.ctl.appendChild(cN.root);
    p.ctl.appendChild(cPhi.root);
    p.ctl.appendChild(cOm.root);
    p.ctl.appendChild(cI.root);

    var chips = chipRow(p.body);
    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 460);

    updaters.push(function () {
      var q = params();
      var e = elec(q);
      var kS = kOf(q.Nph * q.Phi, q.p, 'sine');
      var kT = kOf(q.Nph * q.Phi, q.p, 'trap');
      var aPole = (2 * PI * R_BORE) / q.p * L_STACK;
      var Bg = aPole > 0 ? q.Phi / aPole : 0;
      var Hg = Bg / MU0;
      ro.update([
        { k: 'تعداد جفت قطب p', v: fmt0(q.p), unit: '-' },
        { k: 'دور هر فاز N_ph', v: fmt0(q.Nph), unit: 'turn' },
        { k: 'شار هر قطب Φ', v: fmt4(q.Phi), unit: 'Wb' },
        { kind: 'accent', k: 'پیوند شار هر فاز λ = N_ph·Φ', v: fmt4(e.lam), unit: 'Wb' },
        { kind: 'accent', k: 'سرعت مکانیکی ω_m', v: fmt1(q.om), unit: 'rad/s' },
        { kind: 'accent', k: 'سرعت الکتریکی ω_e = p·ω_m', v: fmt0(e.we), unit: 'rad/s' },
        { kind: 'accent', k: 'فرکانس f = ω_e/(2π)', v: fmt2(e.f), unit: 'Hz' },
        { k: 'دور موتور n = ω_m·30/π', v: fmt0(q.om * 30 / PI), unit: 'rpm' },
        { kind: 'accent', k: 'k_e ذراتی = (2/π)·p·λ', v: fmt4(kT.ke), unit: 'V·s/rad' },
        { kind: 'accent', k: 'k_t ذراتی = p·λ', v: fmt4(kT.kt), unit: 'N·m/A' },
        { kind: 'accent', k: 'k_e سینوسی = p·λ', v: fmt4(kS.ke), unit: 'V·s/rad' },
        { kind: 'accent', k: 'k_t سینوسی = (3/2)·p·λ', v: fmt4(kS.kt), unit: 'N·m/A' },
        { kind: 'good', k: 'k_t/k_e ذراتی', v: fmt4(kT.ratio), unit: '-' },
        { kind: 'good', k: 'k_t/k_e سینوسی', v: fmt4(kS.ratio), unit: '-' },
        { kind: 'accent', k: 'نیروی ضد محرک E ذراتی = k_e·ω_m', v: fmt2(kT.ke * q.om), unit: 'V' },
        { kind: 'accent', k: 'نیروی ضد محرک E سینوسی = k_e·ω_m', v: fmt2(kS.ke * q.om), unit: 'V' },
        { k: 'جریان کاری I = min(I_max, V_phase/Z)', v: fmt2(e.I), unit: 'A' },
        { kind: 'accent', k: 'گشتاور T ذراتی = k_t·I', v: fmt3(kT.kt * e.I), unit: 'N·m' },
        { kind: 'accent', k: 'گشتاور T سینوسی = k_t·i_q', v: fmt3(kS.kt * e.I), unit: 'N·m' },
        { k: 'سطح هر قطب A_pole', v: fmt(aPole, 6), unit: 'm²' },
        { k: 'چگالی شار شکاف B = Φ/A_pole', v: fmt3(Bg), unit: 'T' },
        { k: 'شدت میدان شکاف H = B/μ₀', v: fmt0(Hg), unit: 'A/m' },
        { k: 'ثابت نفوذپذیری خلا μ₀', v: '1.2566e-6', unit: 'H/m' }
      ]);
      setChips(chips, [
        ['k_e = ' + fmt4(kT.ke), 'badge-accent'],
        ['k_t = ' + fmt4(kT.kt), 'badge-accent'],
        ['k_t/k_e = ' + fmt4(kT.ratio), 'badge-warn'],
        ['E = ' + fmt2(kT.ke * q.om) + ' V', 'badge-good'],
        ['T = ' + fmt3(kT.kt * e.I) + ' N·m', 'badge-good']
      ]);
      setBadges(bad, [
        ['ذراتی: k_e = ' + fmt4(kT.ke) + '  ,  k_t = ' + fmt4(kT.kt) + '  ⇒  k_t/k_e = π/۲ = ' + fmt4(kT.ratio), 'badge-accent'],
        ['سینوسی: k_e = ' + fmt4(kS.ke) + '  ,  k_t = ' + fmt4(kS.kt) + '  ⇒  k_t/k_e = ۳/۲ = ' + fmt4(kS.ratio), 'badge-accent'],
        ['λ = ' + fmt4(e.lam) + ' Wb   |   ω_e = ' + fmt0(e.we) + ' rad/s   |   f = ' + fmt2(e.f) + ' Hz', 'badge-accent'],
        ['نسبت گشتاور ذراتی به سینوسی = ' + fmt4(kT.kt / Math.max(kS.kt, 1e-12)), 'badge-warn']
      ]);
      drawWave();
    });

    function drawWave() {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      var q = params();
      var lam = q.Nph * q.Phi;
      var kS = kOf(lam, q.p, 'sine');
      var kT = kOf(lam, q.p, 'trap');
      var kk = kOf(lam, q.p, q.wave);
      var off = q.wave === 'sine' ? 0 : 60;
      var te = wrapDeg(q.p * q.theta + off);
      var Es = kS.ke * q.om;
      var Et = kT.ke * q.om;
      var bx = 10, by = 6, bw2 = 276, bh2 = 34;
      ctx.save();
      ctx.strokeStyle = COL.c6;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(bx, by, bw2, bh2);
      ctx.restore();
      label(ctx, bx + 8, by + 12, 'k_t / k_e = ' + fmt3(kk.ratio), COL.c6, 'left', 'middle', FONT_B);
      label(ctx, bx + 8, by + 25, q.wave === 'sine' ? 'سینوسی ⇒ k_t/k_e = 3/2' : 'ذراتی ⇒ k_t/k_e = π/2', COL.faint, 'left', 'middle', FONT_S);
      var bmax = Math.max(kS.ke, kT.ke, kS.kt, kT.kt, 1e-9);
      var bars = [{ l: 'k_e', v: kk.ke, c: COL.c1 }, { l: 'k_t', v: kk.kt, c: COL.c2 }];
      var i;
      for (i = 0; i < 2; i++) {
        var yy = by + 8 + i * 12;
        rect(ctx, bx + 96, yy, 118 * (bars[i].v / bmax), 7, bars[i].c, 0.85);
        label(ctx, bx + 90, yy + 3.5, bars[i].l, COL.text, 'right', 'middle', FONT_XS);
        label(ctx, bx + 270, yy + 3.5, fmt3(bars[i].v), bars[i].c, 'right', 'middle', FONT_XS);
      }
      label(ctx, w - 10, 22, 'هر دو شکل موج روی یک محور θ_e از ۰ تا ۳۶۰ درجه', COL.faint, 'right', 'middle', FONT_S);

      var panels = [
        { t: 'e(θ_e) [V] — سینوسی و ذراتی', ym: 1.25 * Math.max(Es, Et, 1e-6), fs: function (th) { return Es * Math.sin(th * PI / 180); }, ft: function (th) { return Et * trapUnit(th); } },
        { t: 'i(θ_e) [A] — سینوسی و ذراتی', ym: 1.25 * q.Imax, fs: function (th) { return q.Imax * Math.cos(th * PI / 180); }, ft: function (th) { return q.Imax * trapUnit(th); } },
        { t: 'T(θ_e) [N·m] — گشتاور لحظه‌ای', ym: 1.25 * Math.max(kS.kt, kT.kt) * q.Imax, fs: function () { return kS.kt * q.Imax; }, ft: function (th) { return kT.kt * q.Imax * trapUnit(th); } }
      ];
      var top = 48;
      var ph2 = (h - top - 58) / 3 - 14;
      var axes = [];
      for (i = 0; i < panels.length; i++) {
        var pan = panels[i];
        var ym = pan.ym;
        var box = { x: 66, y: top + i * (ph2 + 22), w: w - 66 - 18, h: ph2 };
        var ax = plot(ctx, box, [0, 360], [-ym, ym], [0, 90, 180, 270, 360], [-ym, 0, ym], 'θ_e [°]', pan.t,
          function (v) { return fmt0(v); }, function (v) { return fmt1(v); });
        var ptsS = [];
        var ptsT = [];
        var j;
        for (j = 0; j <= 180; j++) {
          var th = (j / 180) * 360;
          ptsS.push([ax.X(th), ax.Y(pan.fs(th))]);
          ptsT.push([ax.X(th), ax.Y(pan.ft(th))]);
        }
        line(ctx, ptsS, COL.c1, 2.2);
        line(ctx, ptsT, COL.c2, 2, [6, 4]);
        line(ctx, [[ax.X(te), box.y - 2], [ax.X(te), box.y + box.h + 2]], COL.c6, 1.4, [3, 3]);
        dot(ctx, ax.X(te), ax.Y(pan.fs(te)), 4, COL.c1);
        dot(ctx, ax.X(te), ax.Y(pan.ft(te)), 4, COL.c2);
        plabel(ctx, box.x + 4, box.y - 4, pan.t, COL.text, 'left', 'bottom', FONT_S);
        label(ctx, ax.X(te), box.y - 4, 'θ_e = ' + fmt0(te) + '°', COL.c6, ax.X(te) > box.x + box.w * 0.75 ? 'right' : 'left', 'bottom', FONT_XS);
        axes.push(ax);
      }
      rect(ctx, w - 160, h - 16, 10, 9, COL.c1, 0.85);
      label(ctx, w - 146, h - 11, 'سینوسی', COL.c1, 'left', 'middle', FONT_S);
      rect(ctx, w - 84, h - 16, 10, 9, COL.c2, 0.85);
      label(ctx, w - 70, h - 11, 'ذراتی', COL.c2, 'left', 'middle', FONT_S);
      label(ctx, 10, h - 11, 'ω_m = ' + fmt1(q.om) + ' rad/s   |   I_max = ' + fmt1(q.Imax) + ' A   |   p = ' + fmt0(q.p) + '   |   Φ = ' + fmt4(q.Phi) + ' Wb', COL.faint, 'left', 'middle', FONT_S);
    }
  }

  function card3(host) {
    var p = newCard(host, '۳. معادل الکتریکی فاز', 'مدار معادل هر فاز، امپدانس، زاویه تاخیر جریان و نمودار فازور');
    addFormulas(p.body, [
      'V_phase = V_bus/√3          Z = √(R² + (ω_m·L)²)          I_unlim = V_phase/Z          I = min(I_max, I_unlim)',
      'δ = atan(ω_m·L / R)          P_in = 3·V_phase·I·cos(δ)          P_cu = 3·I²·R          P_out = T·ω_m',
      'ω_base = V_phase/k_e          n_noload = ω_base·30/π          D_duty = I/I_unlim'
    ]);

    var cV = bindRange('Vbus', { label: 'ولتاژ باس V_bus', unit: 'V', min: 12, max: 120, step: 1, digits: 0 });
    var cR = bindRange('R', { label: 'مقاومت فاز R', unit: 'Ω', min: 0.02, max: 2, step: 0.01, digits: 2 });
    var cL = bindRange('L', { label: 'اندکتانس فاز L', unit: 'H', min: 0.00005, max: 0.002, step: 0.00001, digits: 5 });
    var cI = bindRange('Imax', { label: 'جریان بیشینه I_max', unit: 'A', min: 1, max: 60, step: 0.5, digits: 1 });
    var cOm = bindRange('om', { label: 'سرعت مکانیکی ω_m', unit: 'rad/s', min: 0, max: 800, step: 1, digits: 1 });
    p.ctl.appendChild(cV.root);
    p.ctl.appendChild(cR.root);
    p.ctl.appendChild(cL.root);
    p.ctl.appendChild(cI.root);
    p.ctl.appendChild(cOm.root);

    var chips = chipRow(p.body);
    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 400);

    updaters.push(function () {
      var q = params();
      var e = elec(q);
      var lim = e.Iun < q.Imax - 1e-9;
      var reg = lim ? 'محدودیت ولتاژ' : 'محدودیت جریان';
      ro.update([
        { k: 'ولتاژ باس V_bus', v: fmt1(q.Vbus), unit: 'V' },
        { kind: 'accent', k: 'V_phase = V_bus/√3', v: fmt2(e.Vph), unit: 'V' },
        { kind: 'accent', k: 'مقاومت فاز R', v: fmt3(q.R), unit: 'Ω' },
        { kind: 'accent', k: 'اندکتانس فاز L', v: fmt5v(q.L), unit: 'H' },
        { k: 'امپدانس R·ω_m', v: fmt2(q.om * q.R), unit: 'Ω' },
        { k: 'امپدانس X = ω_m·L', v: fmt2(q.om * q.L), unit: 'Ω' },
        { kind: 'accent', k: 'امپدانس Z = √(R² + (ω_m·L)²)', v: fmt3(e.Z), unit: 'Ω' },
        { k: 'جریان بی‌محدودیت I_unlim = V_phase/Z', v: fmt2(e.Iun), unit: 'A' },
        { k: 'جریان بیشینه I_max', v: fmt1(q.Imax), unit: 'A' },
        { kind: 'accent', k: 'جریان کاری I = min(I_max, I_unlim)', v: fmt2(e.I), unit: 'A' },
        { kind: 'accent', k: 'زاویه تاخیر δ = atan(ω_m·L/R)', v: fmt2(e.delta * 180 / PI), unit: '°' },
        { kind: e.D > 0.999 ? 'good' : 'warn', k: 'دیوتی D_duty = I/I_unlim', v: fmt3(e.D), unit: '-' },
        { k: 'ضریب توان cos(δ)', v: fmt3(Math.cos(e.delta)), unit: '-' },
        { kind: 'accent', k: 'توان ورودی P_in = 3·V_phase·I·cos(δ)', v: fmt1(e.Pin), unit: 'W' },
        { k: 'توان مس P_cu = 3·I²·R', v: fmt2(e.Pcu), unit: 'W' },
        { kind: 'accent', k: 'توان خروجی P_out = T·ω_m', v: fmt1(e.Pout), unit: 'W' },
        { k: 'بازده الکتریکی P_out/P_in', v: fmt3(e.Pin > 0 ? e.Pout / e.Pin : 0), unit: '-' },
        { k: 'گشتاور T = k_t·I', v: fmt2(e.T), unit: 'N·m' },
        { k: 'ω_base = V_phase/k_e', v: fmt1(e.ob), unit: 'rad/s' },
        { k: 'n_noload = ω_base·30/π', v: fmt0(e.rpm), unit: 'rpm' },
        { kind: lim ? 'warn' : 'good', k: 'ناحیه کاری', v: reg, unit: '' }
      ]);
      setChips(chips, [
        [reg, lim ? 'badge-warn' : 'badge-good'],
        ['V_phase = ' + fmt2(e.Vph) + ' V', 'badge-accent'],
        ['Z = ' + fmt3(e.Z) + ' Ω', 'badge-accent'],
        ['δ = ' + fmt2(e.delta * 180 / PI) + '°', 'badge-accent'],
        ['D_duty = ' + fmt3(e.D), 'badge-accent']
      ]);
      setBadges(bad, [
        [reg + '  —  I_unlim = ' + fmt2(e.Iun) + ' A  در برابر I_max = ' + fmt1(q.Imax) + ' A', lim ? 'badge-warn' : 'badge-good'],
        ['P_in = ' + fmt1(e.Pin) + ' W   |   P_cu = ' + fmt2(e.Pcu) + ' W   |   P_out = ' + fmt1(e.Pout) + ' W', 'badge-accent'],
        ['R·I = ' + fmt2(q.R * e.I) + ' V   |   ω_m·L·I = ' + fmt2(q.om * q.L * e.I) + ' V   |   |I|·Z = ' + fmt2(e.I * e.Z) + ' V', 'badge-accent'],
        ['ω_base = ' + fmt1(e.ob) + ' rad/s = ' + fmt0(e.rpm) + ' rpm', 'badge-accent']
      ]);
      drawCircuit();
    });

    function drawCircuit() {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      var q = params();
      var e = elec(q);
      var px = 12;
      var pw = Math.min(w * 0.40, 360);
      var cy = h * 0.44;
      var srcR = 30;
      var y1 = cy;
      var y2 = cy - 64;
      var xR = px + 26;
      var xL = xR + 62;
      var xE = xL + 86;
      var sx = xE + 46;
      if (sx > pw) { sx = pw - 8; }
      line(ctx, [[sx, y2], [sx, y1]], COL.axis, 1.5);
      ring(ctx, sx, (y1 + y2) / 2, srcR, COL.c2, 2.2);
      label(ctx, sx, (y1 + y2) / 2 - 8, '~', COL.c2, 'center', 'middle', FONT_B);
      label(ctx, sx, (y1 + y2) / 2 + 12, 'V_phase', COL.c2, 'center', 'middle', FONT_XS);
      line(ctx, [[px + 8, y2], [sx, y2]], COL.axis, 1.5);
      line(ctx, [[px + 8, y1], [sx, y1]], COL.axis, 1.5);
      rect(ctx, xR, y1 - 15, 40, 30, COL.rotor, 0.9);
      label(ctx, xR + 20, y1, 'R', COL.text, 'center', 'middle', FONT_B);
      line(ctx, [[sx, y2], [xL, y2], [xL, y1], [xR + 40, y1]], COL.axis, 1.5);
      var coils = 4;
      for (var j = 0; j < coils; j++) {
        arc(ctx, xL + 9 + j * 15, y2, 8, PI, 0, COL.c5, 2);
      }
      label(ctx, xL + 30, y2 - 16, 'L', COL.c5, 'center', 'middle', FONT_B);
      ring(ctx, xE, (y1 + y2) / 2, 22, COL.c6, 2);
      label(ctx, xE, (y1 + y2) / 2 + 4, 'e', COL.c6, 'center', 'middle', FONT_B);
      line(ctx, [[xR + 40, y1], [xE - 22, y1], [xE - 22, (y1 + y2) / 2 - 22]], COL.axis, 1.5);
      line(ctx, [[xE + 22, (y1 + y2) / 2 - 22], [xE + 22, y2]], COL.axis, 1.5);
      arrow(ctx, px + 20, y1, px + 20, y2, COL.c1, 2, 9);
      label(ctx, px + 28, (y1 + y2) / 2, 'I', COL.c1, 'left', 'middle', FONT_B);
      label(ctx, xR + 20, y1 + 26, 'R = ' + fmt3(q.R) + ' Ω', COL.text, 'center', 'top', FONT_XS);
      label(ctx, xL + 30, y2 - 28, 'L = ' + fmt5v(q.L) + ' H', COL.c5, 'center', 'bottom', FONT_XS);
      label(ctx, xE, (y1 + y2) / 2 + 34, 'E = k_e·ω_m', COL.c6, 'center', 'top', FONT_XS);
      label(ctx, sx, (y1 + y2) / 2 - srcR - 8, 'V_bus = ' + fmt1(q.Vbus) + ' V', COL.c2, 'center', 'bottom', FONT_S);
      label(ctx, px + 8, y2 - 14, 'مدار معادل یک فاز', COL.text, 'left', 'bottom', FONT_B);

      var bx = Math.max(px + pw + 14, w * 0.44);
      var box = { x: bx, y: 52, w: w - bx - 16, h: h - 52 - 42 };
      var maxLen = Math.min(box.w * 0.52, box.h * 0.5);
      var VR = q.R * e.I;
      var VX = q.om * q.L * e.I;
      var Vref = Math.max(e.Vph, e.I * e.Z, 1e-9);
      var sc = maxLen / Vref;
      var ox = box.x + maxLen * 0.22;
      var oy = box.y + box.h * 0.72;
      var ax0 = ox + VR * sc;
      var ay0 = oy - VX * sc;
      rect(ctx, ox, ay0, Math.max(VR * sc, 0), Math.max(VX * sc, 0), COL.c5, 0.12);
      line(ctx, [[ox, oy], [ox, oy - maxLen * 0.16]], COL.axis, 1.2);
      line(ctx, [[ox - maxLen * 0.06, oy], [ox + Vref * sc + maxLen * 0.08, oy]], COL.axis, 1.2);
      arrow(ctx, ox, oy, ox + e.Vph * sc, oy, COL.c2, 2.4, 10);
      arrow(ctx, ox, oy, ax0, ay0, COL.c1, 2.4, 10);
      line(ctx, [[ox, oy], [ax0, oy]], COL.c6, 2.6);
      line(ctx, [[ax0, oy], [ax0, ay0]], COL.c5, 2.6);
      dot(ctx, ax0, ay0, 4, COL.c1);
      var dl = Math.atan2(-VX, Math.max(VR, 1e-9));
      if (dl > 0.02) {
        arc(ctx, ox, oy, maxLen * 0.30, -dl, 0, COL.c4, 1.8);
        label(ctx, ox + maxLen * 0.34 * Math.cos(-dl / 2), oy + maxLen * 0.34 * Math.sin(-dl / 2), 'δ = ' + fmt1(e.delta * 180 / PI) + '°', COL.c4, 'center', 'middle', FONT_S);
      }
      label(ctx, ox + e.Vph * sc + 6, oy + 14, 'V_phase = ' + fmt2(e.Vph) + ' V', COL.c2, 'left', 'top', FONT_S);
      label(ctx, ax0 + 6, ay0 - 6, 'I = ' + fmt2(e.I) + ' A', COL.c1, 'left', 'bottom', FONT_S);
      label(ctx, (ox + ax0) / 2, oy + 16, 'R·I = ' + fmt2(VR) + ' V', COL.c6, 'center', 'top', FONT_S);
      label(ctx, ax0 + 10, (oy + ay0) / 2, 'ω_m·L·I = ' + fmt2(VX) + ' V', COL.c5, 'left', 'middle', FONT_S);
      label(ctx, ax0 + 10, (oy + ay0) / 2 + 12, '|I|·Z = ' + fmt2(e.I * e.Z) + ' V', COL.faint, 'left', 'middle', FONT_S);
      label(ctx, box.x, 36, 'نمودار فازور — مثلث قائم R و ω_m·L', COL.text, 'right', 'top', FONT_B);
      label(ctx, box.x + box.w, 36, 'ω_m = ' + fmt1(q.om) + ' rad/s', COL.faint, 'left', 'top', FONT_S);
      label(ctx, 10, 16, 'per-phase equivalent circuit and phasor triangle', COL.text, 'left', 'top', FONT_B);
      label(ctx, w - 10, h - 12, 'D_duty = ' + fmt3(e.D) + '   |   P_in = ' + fmt1(e.Pin) + ' W   |   P_cu = ' + fmt2(e.Pcu) + ' W   |   P_out = ' + fmt1(e.Pout) + ' W', COL.faint, 'right', 'bottom', FONT_S);
    }

    function fmt5v(v) {
      if (typeof v !== 'number' || !isFinite(v)) { return '-'; }
      return PH.num(v, 5);
    }
  }

  function card4(host) {
    var p = newCard(host, '۴. منحنی گشتاور–سرعت', 'ناحیه گشتاور ثابت، ناحیه توان ثابت، خط بار و نقطه کاری');
    addFormulas(p.body, [
      'ناحیه گشتاور ثابت (ω_m ≤ ω_base):   T = k_t·I = T_max   ⇒   ω_base = V_phase/k_e',
      'ناحیه توان ثابت (ω_m > ω_base):   T = P_max/ω_m   با   P_max = T_max·ω_base',
      'نقطه کاری:   T_motor(ω_op) = T_load   ،   n_noload = ω_base·30/π',
      'J·dω/dt = T_motor − T_load − B_fric·ω   (پارامترهای ثابت ماشین: J و B_fric)'
    ]);

    var cV = bindRange('Vbus', { label: 'ولتاژ باس V_bus', unit: 'V', min: 12, max: 120, step: 1, digits: 0 });
    var cPhi = bindRange('Phi', { label: 'شار هر قطب Φ', unit: 'Wb', min: 0.0005, max: 0.02, step: 0.0001, digits: 4 });
    var cN = bindRange('Nph', { label: 'دور هر فاز N_ph', unit: 'turn', min: 1, max: 60, step: 1, digits: 0 });
    var cI = bindRange('Imax', { label: 'جریان بیشینه I_max', unit: 'A', min: 1, max: 60, step: 0.5, digits: 1 });
    var cTl = bindRange('Tload', { label: 'گشتاور بار T_load', unit: 'N·m', min: 0.1, max: 20, step: 0.1, digits: 1 });
    var cOm = bindRange('om', { label: 'سرعت مکانیکی ω_m', unit: 'rad/s', min: 0, max: 800, step: 1, digits: 1 });
    p.ctl.appendChild(cV.root);
    p.ctl.appendChild(cPhi.root);
    p.ctl.appendChild(cN.root);
    p.ctl.appendChild(cI.root);
    p.ctl.appendChild(cTl.root);
    p.ctl.appendChild(cOm.root);

    var chips = chipRow(p.body);
    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 460);

    updaters.push(function () {
      var q = params();
      var lam = q.Nph * q.Phi;
      var kk = kOf(lam, q.p, q.wave);
      var Vph = q.Vbus / Math.sqrt(3);
      var ob = kk.ke > 0 ? Vph / kk.ke : 0;
      var Tmax = kk.kt * q.Imax;
      var Pmax = Tmax * ob;
      var Tw = torqueAt(q, q.om);
      var Pw = Tw * q.om;
      var wop = q.Tload >= Tmax ? ob : Pmax / q.Tload;
      var inPower = q.Tload < Tmax;
      var regime = inPower ? 'ناحیه توان ثابت' : 'ناحیه گشتاور ثابت';
      ro.update([
        { k: 'ضریب گشتاور k_t', v: fmt3(kk.kt), unit: 'N·m/A' },
        { k: 'ضریب ضد محرک k_e', v: fmt4(kk.ke), unit: 'V·s/rad' },
        { k: 'پیوند شار λ', v: fmt4(lam), unit: 'Wb' },
        { kind: 'accent', k: 'گشتاور بیشینه T_max = k_t·I_max', v: fmt2(Tmax), unit: 'N·m' },
        { kind: 'accent', k: 'سرعت پایه ω_base = V_phase/k_e', v: fmt1(ob), unit: 'rad/s' },
        { kind: 'accent', k: 'ω_noload بدون بار', v: fmt1(ob), unit: 'rad/s' },
        { kind: 'accent', k: 'n_noload = ω_base·30/π', v: fmt0(ob * 30 / PI), unit: 'rpm' },
        { kind: 'accent', k: 'توان بیشینه P_max = T_max·ω_base', v: fmt1(Pmax), unit: 'W' },
        { k: 'سرعت جاری ω_m', v: fmt1(q.om), unit: 'rad/s' },
        { k: 'گشتاور در سرعت جاری T', v: fmt2(Tw), unit: 'N·m' },
        { k: 'توان در سرعت جاری P = T·ω_m', v: fmt1(Pw), unit: 'W' },
        { k: 'دور جاری n = ω_m·30/π', v: fmt0(q.om * 30 / PI), unit: 'rpm' },
        { k: 'گشتاور بار T_load', v: fmt2(q.Tload), unit: 'N·m' },
        { k: 'سرعت بی‌باری متناظر با T_load', v: fmt1(wop), unit: 'rad/s' },
        { k: 'دور نقطه کاری n_op', v: fmt0(wop * 30 / PI), unit: 'rpm' },
        { kind: inPower ? 'accent' : 'good', k: 'ناحیه کاری نقطه عملیاتی', v: regime, unit: '' },
        { kind: inPower ? 'accent' : 'good', k: 'وضعیت', v: inPower ? 'بالای ω_base — توان ثابت' : 'تا ω_base — گشتاور ثابت', unit: '' },
        { k: 'سرعت بیشینه رسم منحنی', v: fmt1(Math.max(1.5 * ob, q.om * 1.05, 1)), unit: 'rad/s' },
        { k: 'اینرسی ماشین J', v: fmt1(S.J * 1e6), unit: '10⁻⁶ kg·m²' },
        { k: 'ضریب اصطکاک B_fric', v: fmt0(S.Bfric * 1e6), unit: '10⁻⁶ N·m·s' },
        { k: 'گشتاور تلفات اصطکاک B_fric·ω_m', v: fmt1(S.Bfric * q.om * 1e6), unit: '10⁻⁶ N·m' },
        { kind: 'accent', k: 'جرم معادل بالابری m = T/G', v: fmt2(Tw / G), unit: 'kg' }
      ]);
      setChips(chips, [
        [regime, inPower ? 'badge-accent' : 'badge-good'],
        ['T_max = ' + fmt2(Tmax) + ' N·m', 'badge-accent'],
        ['ω_base = ' + fmt1(ob) + ' rad/s', 'badge-accent'],
        ['n_noload = ' + fmt0(ob * 30 / PI) + ' rpm', 'badge-warn'],
        ['P_max = ' + fmt1(Pmax) + ' W', 'badge-good']
      ]);
      setBadges(bad, [
        ['ناحیه گشتاور ثابت تا ω_base = ' + fmt1(ob) + ' rad/s = ' + fmt0(ob * 30 / PI) + ' rpm', 'badge-good'],
        ['ناحیه توان ثابت بالای ω_base با P_max = ' + fmt1(Pmax) + ' W', 'badge-accent'],
        ['بار T_load = ' + fmt2(q.Tload) + ' N·m  ⇒  ω_op = ' + fmt1(wop) + ' rad/s  (' + regime + ')', q.Tload >= Tmax ? 'badge-warn' : 'badge-good'],
        ['در سرعت جاری ω_m = ' + fmt1(q.om) + ' rad/s :  T = ' + fmt2(Tw) + ' N·m  و  P = ' + fmt1(Pw) + ' W', 'badge-accent']
      ]);
      drawSpeed();
    });

    function drawSpeed() {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      var q = params();
      var lam = q.Nph * q.Phi;
      var kk = kOf(lam, q.p, q.wave);
      var Vph = q.Vbus / Math.sqrt(3);
      var ob = kk.ke > 0 ? Vph / kk.ke : 0;
      var Tmax = kk.kt * q.Imax;
      var Pmax = Tmax * ob;
      var wop = q.Tload >= Tmax ? ob : Pmax / q.Tload;
      var wMax = Math.max(1.5 * ob, q.om * 1.05, wop * 1.02, 1);
      var box = { x: 76, y: 52, w: w - 76 - 66, h: h - 52 - 62 };
      var yt = [0, 0.5, 1];
      var yv = [];
      var i;
      for (i = 0; i < yt.length; i++) { yv.push(yt[i] * 1.15 * Tmax); }
      var xt = [];
      for (i = 0; i <= 4; i++) { xt.push((wMax * i) / 4); }
      var ax = plot(ctx, box, [0, wMax], [0, 1.15 * Tmax], xt, yv, 'ω_m [rad/s]', 'T [N·m]',
        function (v) { return fmt0(v); }, function (v) { return fmt1(v); });
      var xp = function (w) {
        var t = wMax > 0 ? w / wMax : 0;
        return box.x + box.w * Math.min(Math.max(t, 0), 1);
      };
      var ypP = function (pw) {
        var t = Pmax > 0 ? pw / Pmax : 0;
        return box.y + box.h - box.h * Math.min(Math.max(t, 0), 1.15);
      };
      rect(ctx, box.x, box.y, Math.max(Math.min(xp(ob), box.x + box.w) - box.x, 0), box.h, COL.c1, 0.07);
      rect(ctx, Math.max(Math.min(xp(ob), box.x + box.w), box.x), box.y, Math.max(box.x + box.w - xp(ob), 0), box.h, COL.c2, 0.07);
      plabel(ctx, box.x + 10, box.y + 14, 'ناحیه گشتاور ثابت', COL.c1, 'left', 'top', FONT_S);
      plabel(ctx, box.x + box.w - 10, box.y + 14, 'ناحیه توان ثابت', COL.c2, 'right', 'top', FONT_S);
      line(ctx, [[xp(ob), box.y - 6], [xp(ob), box.y + box.h]], COL.c6, 1.6, [4, 3]);
      label(ctx, xp(ob), box.y - 10, 'ω_base = ' + fmt1(ob), COL.c6, xp(ob) > box.x + box.w * 0.7 ? 'right' : 'left', 'bottom', FONT_S);
      var ptsT = [];
      var ptsP = [];
      for (i = 0; i <= 160; i++) {
        var w = (wMax * i) / 160;
        var tt = torqueAt(q, w);
        ptsT.push([xp(w), ax.Y(tt)]);
        ptsP.push([xp(w), ypP(tt * w)]);
      }
      line(ctx, ptsT, COL.c1, 2.6);
      line(ctx, ptsP, COL.c2, 2.2, [6, 4]);
      var Tl = Math.min(q.Tload, 1.15 * Tmax);
      line(ctx, [[box.x, ax.Y(Tl)], [box.x + box.w, ax.Y(Tl)]], COL.c4, 1.8, [5, 4]);
      label(ctx, box.x + 6, ax.Y(Tl) - 6, 'T_load = ' + fmt2(q.Tload) + ' N·m', COL.c4, 'left', 'bottom', FONT_S);
      var wo = Math.min(wop, wMax);
      dot(ctx, xp(wo), ax.Y(torqueAt(q, wo)), 5, COL.c4);
      line(ctx, [[xp(wo), ax.Y(torqueAt(q, wo))], [xp(wo), box.y + box.h]], COL.c4, 1, [2, 3]);
      label(ctx, xp(wo), box.y + box.h + 8, 'ω_op', COL.c4, 'center', 'top', FONT_XS);
      var wc = Math.min(q.om, wMax);
      dot(ctx, xp(wc), ax.Y(torqueAt(q, wc)), 5.5, COL.c3);
      dot(ctx, xp(wc), ypP(torqueAt(q, wc) * wc), 4.5, COL.c3);
      line(ctx, [[xp(wc), box.y - 6], [xp(wc), box.y + box.h]], COL.c3, 1.2, [2, 3]);
      label(ctx, box.x + box.w, 34, 'ω_m = ' + fmt1(q.om) + ' rad/s  →  T = ' + fmt2(torqueAt(q, q.om)) + ' N·m', COL.c3, 'right', 'top', FONT_S);
      label(ctx, 10, 16, 'torque-speed and power-speed characteristic with load line', COL.text, 'left', 'top', FONT_B);
      label(ctx, w - 10, h - 12, 'P_max = ' + fmt1(Pmax) + ' W  |  ω_base = ' + fmt1(ob) + ' rad/s  |  n_noload = ' + fmt0(ob * 30 / PI) + ' rpm', COL.faint, 'right', 'bottom', FONT_S);
      var ry = box.y + 22;
      rect(ctx, box.x + box.w + 8, ry, 10, 9, COL.c1, 0.85);
      label(ctx, box.x + box.w + 22, ry + 4, 'T', COL.c1, 'left', 'middle', FONT_S);
      rect(ctx, box.x + box.w + 8, ry + 14, 10, 9, COL.c2, 0.85);
      label(ctx, box.x + box.w + 22, ry + 18, 'P', COL.c2, 'left', 'middle', FONT_S);
      rect(ctx, box.x + box.w + 8, ry + 28, 10, 9, COL.c3, 0.85);
      label(ctx, box.x + box.w + 22, ry + 32, 'ω_m', COL.c3, 'left', 'middle', FONT_S);
      rect(ctx, box.x + box.w + 8, ry + 42, 10, 9, COL.c4, 0.85);
      label(ctx, box.x + box.w + 22, ry + 46, 'T_load', COL.c4, 'left', 'middle', FONT_S);
      label(ctx, box.x + box.w + 8, ry - 6, 'P [W]', COL.c2, 'left', 'bottom', FONT_S);
      for (i = 0; i <= 4; i++) {
        var pw2 = (Pmax * i) / 4;
        label(ctx, box.x + box.w + 8, ypP(pw2), fmt0(pw2), COL.faint, 'left', 'middle', FONT_XS);
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
    card3(wrap);
    card4(wrap);
    refresh();
    return cleanup;
  }

  PH.register('motors', {
    title: 'موتور BLDC — نحوه کار و پارامترها',
    subtitle: 'مدل پیوند شار، کموتاسیون شش‌گامی، معادل الکتریکی فاز و منحنی گشتاور–سرعت',
    build: build
  });
}());
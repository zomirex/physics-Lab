(function () {
  'use strict';

  var PH = window.PH;
  if (!PH) { return; }

  var PI = Math.PI;
  var NSLOT = 12;
  var TRACE_N = 900;
  var DEAD = 0.05;

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
    focus: 'Phi',
    dPct: 10,
    p: 6,
    Nph: 12,
    Phi: 0.004,
    R: 0.25,
    L: 0.0003,
    Vbus: 48,
    Imax: 25,
    Bfric: 1e-4,
    Bcore: 1.2,
    Vcore: 2.5e-5,
    om: 400,
    ripple: 8,
    cog: 1.5,
    fpwm: 20
  };

  var PARAM_LIST = [
    {
      key: 'Phi', sym: 'Φ', name: 'شار هر قطب', unit: 'Wb',
      why: 'λ = N_ph·Φ ↑ ⇒ k_e ↑ و k_t ↑ ⇒ T ↑ خطی و ω_base ↓ و η ↓ (زیان استین، B_core ∝ Φ)'
    },
    {
      key: 'Nph', sym: 'N_ph', name: 'دور هر فاز', unit: 'turn',
      why: 'λ ↑ و R ∝ N_ph² و L ∝ N_ph² ⇒ T ↑ و η ↓↓ و ω_base ↓'
    },
    {
      key: 'p', sym: 'p', name: 'تعداد جفت قطب', unit: '-',
      why: 'k_e ∝ p و k_t ∝ p و f ↑ ⇒ T ↑ و ω_base ↓ و η ↓'
    },
    {
      key: 'Imax', sym: 'I', name: 'جریان بیشینه', unit: 'A',
      why: 'T = k_t·I خطی و P_cu ∝ I² ⇒ P_out ↑ و η ↓'
    },
    {
      key: 'Bcore', sym: 'B_core', name: 'چگالی شار هسته', unit: 'T',
      why: 'P_stein ∝ B^1.6 و P_eddy ∝ B² ⇒ η ↓ و افت توان مفید زیر بار'
    },
    {
      key: 'R', sym: 'R', name: 'مقاومت فاز', unit: 'Ω',
      why: 'I ↓ و P_cu ↑ ⇒ T ↓ و η ↓'
    },
    {
      key: 'L', sym: 'L', name: 'اندکتانس فاز', unit: 'H',
      why: 'δ ↑ و Z ↑ ⇒ I ↓ در دور بالا و ریپل ↓ و η ↑ در دور بالا'
    },
    {
      key: 'om', sym: 'ω_m', name: 'سرعت مکانیکی', unit: 'rad/s',
      why: 'E ↑ و Z ↑ و I ↓ ⇒ T ↓ بالای ω_base و η ↓'
    },
    {
      key: 'Vbus', sym: 'V_bus', name: 'ولتاژ باس', unit: 'V',
      why: 'V_phase ↑ و ω_base ↑ و I ↑ ⇒ P_out ↑ تا سقف جریان و η ↓ در جریان بالا'
    }
  ];

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
      focus: S.focus,
      dPct: clamp(S.dPct, -50, 100),
      p: clamp(S.p, 1, 12),
      Nph: clamp(S.Nph, 1, 60),
      Phi: clamp(S.Phi, 0.0005, 0.02),
      R: clamp(S.R, 0.02, 2),
      L: clamp(S.L, 0.00005, 0.002),
      Vbus: clamp(S.Vbus, 12, 120),
      Imax: clamp(S.Imax, 1, 60),
      Bfric: clamp(S.Bfric, 0.00002, 0.002),
      Bcore: clamp(S.Bcore, 0.2, 2.5),
      Vcore: clamp(S.Vcore, 1e-6, 2e-4),
      om: clamp(S.om, 20, 8000),
      ripple: clamp(S.ripple, 0, 15),
      cog: clamp(S.cog, 0, 3),
      fpwm: clamp(S.fpwm, 5, 50)
    };
  }

  function solve(q, o) {
    o = o || {};
    var p = o.p === undefined ? q.p : o.p;
    var Nph = o.Nph === undefined ? q.Nph : o.Nph;
    var Phi = o.Phi === undefined ? q.Phi : o.Phi;
    var R = o.R === undefined ? q.R : o.R;
    var L = o.L === undefined ? q.L : o.L;
    var Vbus = o.Vbus === undefined ? q.Vbus : o.Vbus;
    var Imax = o.Imax === undefined ? q.Imax : o.Imax;
    var Bcore = o.Bcore === undefined ? q.Bcore : o.Bcore;
    var om = o.om === undefined ? q.om : o.om;
    var lam = Nph * Phi;
    var sine = q.wave === 'sine';
    var ke = sine ? p * lam : (2 / PI) * p * lam;
    var kt = sine ? 1.5 * p * lam : p * lam;
    var Vph = Vbus / Math.sqrt(3);
    var x = om * L;
    var Z = Math.sqrt(R * R + x * x);
    var Iun = Z > 0 ? Vph / Z : 0;
    var I = Math.min(Imax, Iun);
    var delta = Math.atan(x / R);
    var T = kt * I;
    var ob = ke > 0 ? Vph / ke : 0;
    var f = p * om / (2 * PI);
    var Pcu = 3 * I * I * R;
    var Pstein = 1.5e-3 * f * Math.pow(Bcore, 1.6) * q.Vcore;
    var Peddy = 2e-5 * f * f * Bcore * Bcore * q.Vcore;
    var Pmech = q.Bfric * om;
    var Pout = T * om;
    var Ptot = Pout + Pcu + Pstein + Peddy + Pmech;
    var eta = Ptot > 0 ? Pout / Ptot : 0;
    return {
      lam: lam, ke: ke, kt: kt, Vph: Vph, Z: Z, Iun: Iun, I: I, delta: delta,
      T: T, ob: ob, noload: ob * 30 / PI, f: f, rpm: om * 30 / PI,
      Pcu: Pcu, Pstein: Pstein, Peddy: Peddy, Pmech: Pmech,
      Pout: Pout, Ptot: Ptot, eta: eta, vlim: Iun < Imax
    };
  }

  function perturb(key, k, q) {
    if (key === 'Phi') { return { Phi: q.Phi * k, Bcore: q.Bcore * k }; }
    if (key === 'Nph') { return { Nph: q.Nph * k, R: q.R * k * k, L: q.L * k * k }; }
    if (key === 'p') { return { p: q.p * k }; }
    if (key === 'Imax') { return { Imax: q.Imax * k }; }
    if (key === 'Bcore') { return { Bcore: q.Bcore * k }; }
    if (key === 'R') { return { R: q.R * k }; }
    if (key === 'L') { return { L: q.L * k }; }
    if (key === 'om') { return { om: q.om * k }; }
    if (key === 'Vbus') { return { Vbus: q.Vbus * k }; }
    return null;
  }

  function rel(base, val) {
    if (!isFinite(base) || Math.abs(base) < 1e-12) { return 0; }
    return ((val - base) / Math.abs(base)) * 100;
  }

  function sgn(v) {
    if (v > DEAD) { return '↑'; }
    if (v < -DEAD) { return '↓'; }
    return '≈';
  }

  function sensitivity(q) {
    var b = solve(q);
    var k = 1 + q.dPct / 100;
    var rows = [];
    for (var i = 0; i < PARAM_LIST.length; i++) {
      var pd = PARAM_LIST[i];
      var r = solve(q, perturb(pd.key, k, q));
      rows.push({
        key: pd.key, sym: pd.sym, name: pd.name, unit: pd.unit, why: pd.why,
        dT: rel(b.T, r.T), dP: rel(b.Pout, r.Pout),
        dn: rel(b.noload, r.noload), de: rel(b.eta, r.eta),
        T0: b.T, T1: r.T, e0: b.eta, e1: r.eta, p0: b.Pout, p1: r.Pout,
        n0: b.noload, n1: r.noload
      });
    }
    return { base: b, k: k, rows: rows };
  }

  function rippleState(q) {
    var b = solve(q);
    var tau = q.R > 0 ? q.L / q.R : 0;
    var tcomm = b.f > 0 ? 1 / (6 * b.f) : 0;
    var smooth = Math.exp(-tcomm / Math.max(tau, 1e-9));
    var rTrap = q.ripple * (0.15 + 0.85 * smooth);
    var ipp = q.L > 0 ? q.Vbus / (4 * q.L * q.fpwm * 1000) : 0;
    var iRatio = ipp / Math.max(q.Imax, 1e-9);
    var rSin = q.ripple * 0.45 * (1 - Math.exp(-iRatio));
    return {
      b: b, tau: tau, tcomm: tcomm, smooth: smooth,
      rTrap: rTrap, rSin: rSin, ipp: ipp, iRatio: iRatio,
      ipk: 0.5 * ipp, icu: iRatio * 100,
      fRipple: 6 * b.f, order: 6,
      band: Math.max(rTrap, rSin, q.cog), cog: q.cog
    };
  }

  function torqueTraces(q, st) {
    var T = st.b.T;
    var p = q.p;
    var cogP = 360 / NSLOT;
    var ptsT = [];
    var ptsS = [];
    var upT = [];
    var loT = [];
    var upS = [];
    var loS = [];
    var aT = st.rTrap / 100;
    var aS = st.rSin / 100;
    var aC = st.cog / 100;
    var i;
    for (i = 0; i <= TRACE_N; i++) {
      var th = (360 * i) / TRACE_N;
      var te = p * th;
      var u = te - 60 * Math.floor(te / 60);
      var ph = u / 60;
      var cog = aC * Math.cos((2 * PI * th) / cogP);
      var tt = T * (1 - aT * Math.cos(2 * PI * ph) + cog);
      var ts = T * (1 + aS * (0.62 * Math.cos((2 * PI * 6 * te) / 360) + 0.38 * Math.cos((2 * PI * 12 * te) / 360)) + cog);
      ptsT.push([th, tt]);
      ptsS.push([th, ts]);
      upT.push([th, T * (1 + aT) + T * aC]);
      loT.push([th, T * (1 - aT) - T * aC]);
      upS.push([th, T * (1 + aS) + T * aC]);
      loS.push([th, T * (1 - aS) - T * aC]);
    }
    return { T: T, ptsT: ptsT, ptsS: ptsS, upT: upT, loT: loT, upS: upS, loS: loS };
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
      box.appendChild(el('span', list[i][1] ? 'ph-badge ' + list[i][1] : 'ph-badge', list[i][0]));
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

  function etaClass(v) {
    if (v > DEAD) { return 'badge-good'; }
    if (v < -DEAD) { return 'badge-bad'; }
    return 'badge-warn';
  }

  function etaKind(v) {
    if (v > DEAD) { return 'good'; }
    if (v < -DEAD) { return 'bad'; }
    return 'warn';
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

  function niceM(v) {
    if (!(v > 0) || !isFinite(v)) { return 1; }
    var e = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var m = v / e;
    var s = m <= 1 ? 1 : (m <= 2 ? 2 : (m <= 2.5 ? 2.5 : (m <= 5 ? 5 : 10)));
    return s * e;
  }

  function focusIndex(key, rows) {
    for (var i = 0; i < rows.length; i++) { if (rows[i].key === key) { return i; } }
    return 0;
  }

  function card1(host) {
    var p = newCard(host, '۱. حساسیت پارامترها', 'تغییر هر پارامتر به اندازه Δ درصد و اندازه‌گیری درصد تغییر T، P_out، ω_noload و η به همراه نمودار تورنادو واگرا');
    addFormulas(p.body, [
      'λ = N_ph · Φ          ذراتی:  k_e = (2/π)·p·λ  ,  k_t = p·λ          سینوسی:  k_e = p·λ  ,  k_t = (3/2)·p·λ',
      'V_phase = V_bus/√3          Z = √(R² + (ω_m·L)²)          I = min(I_max , V_phase/Z)          δ = atan(ω_m·L/R)',
      'ω_base = V_phase/k_e          f = p·ω_m/(2π)          P_cu = 3·I²·R          P_mech = B_fric·ω_m          P_out = T·ω_m',
      'P_stein = 1.5e-3·f·B_core^1.6·V_core          P_eddy = 2e-5·f²·B_core²·V_core          η = P_out/(P_out + P_cu + P_stein + P_eddy + P_mech)',
      'روش: هر پارامتر جداگانه در ضریب (1 + Δ/100) ضرب می‌شود و تمام خروجی‌ها دوباره حل می‌شوند؛ وابستگی فیزیکی N_ph روی R و L (∝ N_ph²) و وابستگی Φ روی B_core (∝ Φ) نیز اعمال می‌شود'
    ]);

    var opts = [];
    var i;
    for (i = 0; i < PARAM_LIST.length; i++) {
      opts.push({ value: PARAM_LIST[i].key, label: PARAM_LIST[i].sym + ' — ' + PARAM_LIST[i].name });
    }

    var cWave = bindSelect('wave', {
      label: 'نوع درایو',
      options: [
        { value: 'trap', label: 'ذرات مستطیلی (6-step)' },
        { value: 'sine', label: 'سینوسی (FOC)' }
      ]
    });
    var cFocus = bindSelect('focus', { label: 'پارامتر متمرکز', options: opts });
    var cD = bindRange('dPct', { label: 'تغییر پارامتر Δ', unit: '%', min: -50, max: 100, step: 1, digits: 1 });
    var cOm = bindRange('om', { label: 'سرعت مکانیکی ω_m', unit: 'rad/s', min: 20, max: 8000, step: 10, digits: 0 });
    var cI = bindRange('Imax', { label: 'جریان بیشینه I_max', unit: 'A', min: 1, max: 60, step: 0.5, digits: 1 });
    p.ctl.appendChild(cWave.root);
    p.ctl.appendChild(cFocus.root);
    p.ctl.appendChild(cD.root);
    p.ctl.appendChild(cOm.root);
    p.ctl.appendChild(cI.root);

    var note = el('p', 'ph-note', '');
    p.body.appendChild(note);

    var chips = chipRow(p.body);
    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 400);

    function refreshCard1() {
      var q = params();
      var sn = sensitivity(q);
      var b = sn.base;
      var rows = sn.rows;
      var fi = focusIndex(q.focus, rows);
      var fp = rows[fi];
      var regime = b.vlim ? 'محدودیت ولتاژ' : 'محدودیت جریان';
      var roRows = [
        { k: 'ترتیب ستون‌ها', v: 'ΔT %  ·  ΔP %  ·  Δn %  ·  Δη %', unit: '' },
        { k: 'نوع درایو', v: waveLabel(q.wave), unit: '' },
        { k: 'درصد تغییر اعمالی Δ', v: fmt1(q.dPct), unit: '%' },
        { k: 'ضریب مقیاس (1 + Δ/100)', v: fmt4(sn.k), unit: '-' },
        { kind: 'accent', k: 'گشتاور پایه T = k_t·I', v: fmt3(b.T), unit: 'N·m' },
        { kind: 'accent', k: 'توان خروجی پایه P_out = T·ω_m', v: fmt1(b.Pout), unit: 'W' },
        { kind: 'accent', k: 'سرعت بی‌باری پایه ω_base = V_phase/k_e', v: fmt1(b.ob), unit: 'rad/s' },
        { kind: 'accent', k: 'دور بی‌باری پایه n_noload', v: fmt0(b.noload), unit: 'rpm' },
        { kind: b.eta > 0.9 ? 'good' : 'accent', k: 'راندمان پایه η', v: fmt4(b.eta), unit: '-' },
        { k: 'جریان پایه I = min(I_max, V_phase/Z)', v: fmt2(b.I), unit: 'A' },
        { k: 'جریان بی‌محدودیت V_phase/Z', v: fmt2(b.Iun), unit: 'A' },
        { k: 'امپدانس Z', v: fmt3(b.Z), unit: 'Ω' },
        { k: 'فرکانس f = p·ω_m/(2π)', v: fmt2(b.f), unit: 'Hz' },
        { k: 'ناحیه کاری', v: regime, unit: '' }
      ];
      for (i = 0; i < rows.length; i++) {
        roRows.push({
          kind: etaKind(rows[i].de),
          k: rows[i].sym + ' — ' + rows[i].name,
          v: fmt2(rows[i].dT) + '  /  ' + fmt2(rows[i].dP) + '  /  ' + fmt2(rows[i].dn) + '  /  ' + fmt2(rows[i].de),
          unit: '%'
        });
      }
      ro.update(roRows);

      var dir = q.dPct >= 0 ? 'افزایش ' : 'کاهش ';
      var cList = [];
      var bList = [];
      for (i = 0; i < rows.length; i++) {
        cList.push([
          dir + rows[i].sym + ' ⇒ T ' + sgn(rows[i].dT) + ' ، P ' + sgn(rows[i].dP) + ' ، n ' + sgn(rows[i].dn) + ' ، η ' + sgn(rows[i].de),
          etaClass(rows[i].de)
        ]);
        bList.push([
          rows[i].sym + ' ⇒ T ' + fmt2(rows[i].dT) + ' % , P ' + fmt2(rows[i].dP) + ' % , n ' + fmt2(rows[i].dn) + ' % , η ' + fmt2(rows[i].de) + ' %',
          etaClass(rows[i].de)
        ]);
      }
      setChips(chips, cList);
      setBadges(bad, bList);

      note.textContent = 'زنجیره حساسیت ' + fp.sym + ' : ' + fp.why + ' — مقدار پایه گشتاور ' + fmt2(fp.T0) +
        ' N·m با ضریب ' + fmt4(sn.k) + ' به ' + fmt2(fp.T1) + ' N·m و راندمان از ' + fmt4(fp.e0) + ' به ' + fmt4(fp.e1) +
        ' می‌رسد. ناحیه کاری پایه: ' + regime + ' در ω_m = ' + fmt0(q.om) + ' rad/s و ω_base = ' + fmt1(b.ob) + ' rad/s.';

      drawTornado(cv, q, sn);
    }

    function drawTornado(c, q, sn) {
      var s = prep(c);
      var ctx = s.ctx, w = s.w, h = s.h;
      var rows = sn.rows;
      var n = rows.length;
      var labW = Math.min(196, Math.max(104, w * 0.24));
      var x0 = 12;
      var bw = w - x0 - labW - 14;
      var top = 54;
      var bot = h - 42;
      var bh = bot - top;
      var zx = x0 + bw / 2;
      var mx = 1;
      var j;
      for (j = 0; j < n; j++) {
        if (Math.abs(rows[j].dT) > mx) { mx = Math.abs(rows[j].dT); }
        if (Math.abs(rows[j].de) > mx) { mx = Math.abs(rows[j].de); }
      }
      mx = niceM(mx * 1.15);
      var X = function (v) { return zx + (bw / 2) * (v / mx); };
      var ticks = [-mx, -mx / 2, 0, mx / 2, mx];

      ctx.save();
      ctx.strokeStyle = COL.grid;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (j = 0; j < ticks.length; j++) {
        if (ticks[j] === 0) { continue; }
        var gx = Math.round(X(ticks[j])) + 0.5;
        ctx.moveTo(gx, top - 10);
        ctx.lineTo(gx, bot + 6);
      }
      ctx.stroke();
      ctx.restore();

      var grp = bh / n;
      for (j = 0; j < n; j++) {
        var gy = top + j * grp;
        var focused = rows[j].key === q.focus;
        if (j % 2 === 1) { rect(ctx, x0, gy + 1, bw, grp - 2, '#0e1622', 0.4); }
        if (focused) { rect(ctx, x0, gy + 1, bw + labW - 4, grp - 2, COL.gap, 0.08); }
        var bhT = grp * 0.36;
        var yT = gy + grp * 0.10;
        var yE = gy + grp * 0.54;
        var vT = rows[j].dT;
        var vE = rows[j].de;
        var xT = X(vT);
        var xE = X(vE);
        rect(ctx, zx, yT, xT - zx, bhT, COL.c1, focused ? 1 : 0.8);
        rect(ctx, zx, yE, xE - zx, bhT, COL.c2, focused ? 1 : 0.8);
        if (focused) {
          ctx.save();
          ctx.strokeStyle = COL.c6;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(Math.min(zx, xT) - 0.5, yT - 0.5, Math.abs(xT - zx) + 1, bhT + 1);
          ctx.strokeRect(Math.min(zx, xE) - 0.5, yE - 0.5, Math.abs(xE - zx) + 1, bhT + 1);
          ctx.restore();
        }
        var txT = Math.min(Math.max(vT >= 0 ? xT + 5 : xT - 5, x0 + 2), zx - 38);
        var txE = Math.min(Math.max(vE >= 0 ? xE + 5 : xE - 5, x0 + 2), zx - 38);
        label(ctx, txT, yT + bhT / 2, fmt2(vT) + '%', COL.c1, vT >= 0 ? 'left' : 'right', 'middle', FONT_XS);
        label(ctx, txE, yE + bhT / 2, fmt2(vE) + '%', COL.c2, vE >= 0 ? 'left' : 'right', 'middle', FONT_XS);
        plabel(ctx, w - 8, gy + grp * 0.32, rows[j].name + '  ' + rows[j].sym, focused ? COL.c6 : COL.text, 'right', 'middle', FONT_S);
        label(ctx, w - 8 - labW + 6, gy + grp * 0.74, rows[j].unit, focused ? COL.c6 : COL.faint, 'left', 'middle', FONT_XS);
      }

      line(ctx, [[zx, top - 14], [zx, bot + 8]], COL.axis, 1.8);
      line(ctx, [[x0, bot], [x0 + bw, bot]], COL.axis, 1.5);

      for (j = 0; j < ticks.length; j++) {
        label(ctx, X(ticks[j]), bot + 7, fmt1(ticks[j]), ticks[j] === 0 ? COL.text : COL.faint, 'center', 'top', FONT_XS);
      }
      label(ctx, X(mx) - 2, bot + 19, 'Δ% بیشینه', COL.faint, 'right', 'top', FONT_XS);
      label(ctx, X(-mx) + 2, bot + 19, 'Δ% کمینه', COL.faint, 'left', 'top', FONT_XS);
      plabel(ctx, w - 8, bot + 19, 'مرجع عمود در ضفر تغییر', COL.faint, 'right', 'top', FONT_XS);
      label(ctx, x0, bot + 32, 'diverging tornado — Δ% for a ' + fmt1(q.dPct) + '% change of every parameter', COL.faint, 'left', 'top', FONT_S);

      label(ctx, 12, 16, 'tornado — diverging bars of ΔT and Δη around zero', COL.text, 'left', 'top', FONT_B);
      var ly = 32;
      rect(ctx, 12, ly - 8, 11, 10, COL.c1, 0.9);
      label(ctx, 28, ly - 2, 'ΔT % (گشتاور)', COL.c1, 'left', 'middle', FONT_S);
      rect(ctx, 140, ly - 8, 11, 10, COL.c2, 0.9);
      label(ctx, 156, ly - 2, 'Δη % (راندمان)', COL.c2, 'left', 'middle', FONT_S);
      plabel(ctx, w - 12, 16, 'ω_m = ' + fmt0(q.om) + ' rad/s  |  I_max = ' + fmt1(q.Imax) + ' A  |  T = ' + fmt3(sn.base.T) + ' N·m  |  η = ' + fmt4(sn.base.eta), COL.faint, 'right', 'top', FONT_S);
      plabel(ctx, w - 12, 32, 'پارامتر متمرکز ' + sn.rows[focusIndex(q.focus, sn.rows)].sym + ' و محدوده ماشین با ضخامت بیشتر مشخص شده است', COL.faint, 'right', 'top', FONT_S);
    }

    updaters.push(refreshCard1);
    refreshCard1();
  }

  function card2(host) {
    var p = newCard(host, '۲. ریپل گشتاور و PWM', 'مقایسه موج گشتاور ذراتی و سینوسی بر حسب زاویه روتور، خط تخت ایده‌آل، پوش ریپل، کوگینگ و ریپل جریان حامل PWM');
    addFormulas(p.body, [
      'τ = L/R          t_comm = 1/(6·f)          f = p·ω_m/(2π)          فرکانس ریپل گشتاور = 6·f  (هارمونیک غالب مرتبه 6)',
      'ریپل ذراتی:   r_trap = ripple·(0.15 + 0.85·exp(−t_comm/τ))          با بزرگ شدن L یا p مقدار t_comm/τ کوچک و ریپل کمتر می‌شود',
      'ریپل سینوسی:   Δi_pp = V_bus/(4·L·f_pwm)          r_sin = ripple·0.45·(1 − exp(−Δi_pp/I_max))',
      'کوگینگ:   نوسان بر حسب زاویه مکانیکی با تناوب 360/تعداد شیار و دامنه مستقیم برابر درصد کوگینگ',
      'T(θ_m) ذراتی:   T·(1 − r_trap·cos(2π·φ) + c)          φ = باقیمانده θ_e تقسیم بر 60 درجه          c = کوگینگ بر حسب شیار'
    ]);

    var cRip = bindRange('ripple', { label: 'ریپل فرم موج', unit: '%', min: 0, max: 15, step: 0.1, digits: 1 });
    var cCog = bindRange('cog', { label: 'کوگینگ', unit: '%', min: 0, max: 3, step: 0.05, digits: 2 });
    var cFp = bindRange('fpwm', { label: 'فرکانس حامل PWM', unit: 'kHz', min: 5, max: 50, step: 0.5, digits: 1 });
    var cL = bindRange('L', { label: 'اندکتانس فاز L', unit: '10⁻⁶ H', min: 10, max: 2000, step: 5, digits: 0, scale: 1e-6, lo: 1e-5, hi: 2e-3 });
    var cP = bindRange('p', { label: 'تعداد جفت قطب p', unit: '-', min: 1, max: 12, step: 1, digits: 0 });
    p.ctl.appendChild(cRip.root);
    p.ctl.appendChild(cCog.root);
    p.ctl.appendChild(cFp.root);
    p.ctl.appendChild(cL.root);
    p.ctl.appendChild(cP.root);

    p.body.appendChild(el('p', 'ph-note', 'خط افقی خاکستری مقدار ایده‌آل T = k_t·I بدون ریپل است. ناحیه رنگ روشن بالای خط ذراتی پوش ریپل گشتاور 6 گامی و ناحیه باریک‌تر بالای خط سینوسی پوش ریپل درایو FOC است. هر دو موج شامل مؤلفه کوگینگ با تناوب یک گام شیار هستند.'));

    var chips = chipRow(p.body);
    var bad = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 400);

    function refreshCard2() {
      var q = params();
      var st = rippleState(q);
      var b = st.b;
      ro.update([
        { k: 'گشتاور میانگین T = k_t·I', v: fmt3(b.T), unit: 'N·m' },
        { kind: 'accent', k: 'ریپل گشتاور ذرات مستطیلی', v: fmt2(st.rTrap), unit: '%' },
        { kind: 'accent', k: 'ریپل گشتاور سینوسی', v: fmt2(st.rSin), unit: '%' },
        { kind: 'warn', k: 'کوگینگ', v: fmt2(st.cog), unit: '%' },
        { kind: 'accent', k: 'ریپل جریان حامل PWM', v: fmt2(st.icu), unit: '%' },
        { k: 'دامنه جریان پیک‌به‌پیک Δi_pp', v: fmt3(st.ipp), unit: 'A' },
        { k: 'نیمه دامنه جریان Δi_pk', v: fmt3(st.ipk), unit: 'A' },
        { kind: 'accent', k: 'فرکانس ریپل گشتاور = 6·f', v: fmt1(st.fRipple), unit: 'Hz' },
        { k: 'هارمونیک غالب', v: String(st.order), unit: '-' },
        { k: 'فرکانس الکتریکی f = p·ω_m/(2π)', v: fmt2(b.f), unit: 'Hz' },
        { kind: 'accent', k: 'فرکانس حامل PWM f_pwm', v: fmt1(q.fpwm), unit: 'kHz' },
        { k: 'ثابت زمانی فاز τ = L/R', v: fmt3(st.tau * 1000), unit: 'ms' },
        { k: 'بازه کموتاسیون t_comm = 1/(6f)', v: fmt3(st.tcomm * 1000), unit: 'ms' },
        { k: 'نسبت t_comm/τ', v: fmt3(st.tcomm / Math.max(st.tau, 1e-9)), unit: '-' },
        { k: 'ضریب هموارسازی exp(−t_comm/τ)', v: fmt4(st.smooth), unit: '-' },
        { k: 'اندکتانس فاز L', v: fmt1(q.L * 1e6) + '×10⁻⁶', unit: 'H' },
        { k: 'تعداد جفت قطب p', v: fmt0(q.p), unit: '-' },
        { k: 'پهنای کل ریپل پوش', v: fmt2(st.band), unit: '%' },
        { k: 'گشتاور بیشینه پوش', v: fmt2(b.T * (1 + st.band / 100)), unit: 'N·m' },
        { k: 'گشتاور کمینه پوش', v: fmt2(b.T * (1 - st.band / 100)), unit: 'N·m' },
        { k: 'تعداد شیار فرضی برای کوگینگ', v: String(NSLOT), unit: '-' },
        { k: 'تناوب کوگینگ مکانیکی', v: fmt1(360 / NSLOT), unit: '°' }
      ]);
      setChips(chips, [
        ['r_trap = ' + fmt2(st.rTrap) + ' %', st.rTrap > st.rSin ? 'badge-warn' : 'badge-good'],
        ['r_sin = ' + fmt2(st.rSin) + ' %', 'badge-good'],
        ['کوگینگ = ' + fmt2(st.cog) + ' %', 'badge-warn'],
        ['Δi_pp = ' + fmt3(st.ipp) + ' A', 'badge-accent'],
        ['f_ripple = ' + fmt1(st.fRipple) + ' Hz', 'badge-accent']
      ]);
      setBadges(bad, [
        ['ذراتی: r_trap = ' + fmt2(st.rTrap) + ' % = ' + fmt2(q.ripple) + ' % × (0.15 + 0.85·' + fmt4(st.smooth) + ')', 'badge-warn'],
        ['سینوسی: r_sin = ' + fmt2(st.rSin) + ' % با Δi_pp = ' + fmt3(st.ipp) + ' A و f_pwm = ' + fmt1(q.fpwm) + ' kHz', 'badge-good'],
        ['فرکانس ریپل گشتاور = 6 × ' + fmt2(b.f) + ' Hz = ' + fmt1(st.fRipple) + ' Hz  ⇒  هارمونیک غالب مرتبه 6', 'badge-accent'],
        ['τ = ' + fmt3(st.tau * 1000) + ' ms و t_comm = ' + fmt3(st.tcomm * 1000) + ' ms  ⇒  t_comm/τ = ' + fmt3(st.tcomm / Math.max(st.tau, 1e-9)), 'badge-accent'],
        ['افزایش L یا p مقدار t_comm/τ را کاهش و ریپل هر دو درایو را کم می‌کند', 'badge-good']
      ]);
      drawRipple(cv, q, st);
    }

    function drawRipple(c, q, st) {
      var s = prep(c);
      var ctx = s.ctx, w = s.w, h = s.h;
      var tr = torqueTraces(q, st);
      var T = tr.T;
      var span = Math.max(st.band * 1.7, 1.5);
      var yd = [T * (1 - span / 100), T * (1 + span / 100)];
      var box = { x: 84, y: 62, w: w - 84 - 30, h: h - 62 - 86 };
      var xt = [0, 90, 180, 270, 360];
      var yt = [yd[0], T, yd[1]];
      var ax = plot(ctx, box, [0, 360], yd, xt, yt, 'θ_m [°]', 'T(θ_m) [N·m]',
        function (v) { return fmt0(v); }, function (v) { return fmt2(v); });

      var envT = [];
      var envS = [];
      var i;
      for (i = 0; i < tr.upT.length; i++) {
        envT.push([ax.X(tr.upT[i][0]), ax.Y(Math.min(tr.upT[i][1], yd[1]))]);
      }
      for (i = tr.loT.length - 1; i >= 0; i--) {
        envT.push([ax.X(tr.loT[i][0]), ax.Y(Math.max(tr.loT[i][1], yd[0]))]);
      }
      for (i = 0; i < tr.upS.length; i++) {
        envS.push([ax.X(tr.upS[i][0]), ax.Y(Math.min(tr.upS[i][1], yd[1]))]);
      }
      for (i = tr.loS.length - 1; i >= 0; i--) {
        envS.push([ax.X(tr.loS[i][0]), ax.Y(Math.max(tr.loS[i][1], yd[0]))]);
      }
      fillPoly(ctx, envT, COL.c2, 0.13);
      fillPoly(ctx, envS, COL.c1, 0.13);

      var ptsT = [];
      var ptsS = [];
      for (i = 0; i < tr.ptsT.length; i++) {
        ptsT.push([ax.X(tr.ptsT[i][0]), ax.Y(Math.min(Math.max(tr.ptsT[i][1], yd[0]), yd[1]))]);
        ptsS.push([ax.X(tr.ptsS[i][0]), ax.Y(Math.min(Math.max(tr.ptsS[i][1], yd[0]), yd[1]))]);
      }
      line(ctx, [[box.x, ax.Y(T)], [box.x + box.w, ax.Y(T)]], COL.c6, 1.6, [7, 5]);
      line(ctx, ptsT, COL.c2, 1.6);
      line(ctx, ptsS, COL.c1, 1.6);
      dot(ctx, box.x, ax.Y(T), 3.4, COL.c6);

      var xc = ax.X(q.p > 0 ? 360 / (6 * q.p) * 2 : 0);
      line(ctx, [[xc, box.y], [xc, box.y + box.h]], COL.c5, 1.1, [2, 4]);

      plabel(ctx, box.x + 6, ax.Y(T) - 8, 'خط ایده‌آل T = ' + fmt3(T) + ' N·m', COL.c6, 'left', 'bottom', FONT_S);
      plabel(ctx, box.x + box.w - 6, box.y + 12, 'پوش ریپل ذراتی ±' + fmt2(st.rTrap) + ' %', COL.c2, 'right', 'top', FONT_S);
      plabel(ctx, box.x + box.w - 6, box.y + 25, 'پوش ریپل سینوسی ±' + fmt2(st.rSin) + ' %', COL.c1, 'right', 'top', FONT_S);
      label(ctx, xc + 4, box.y + 12, 'θ_m', COL.c5, 'left', 'top', FONT_XS);

      label(ctx, 12, 16, 'T(θ_m) — trapezoidal versus sinusoidal with shaded ripple envelope', COL.text, 'left', 'top', FONT_B);
      plabel(ctx, w - 12, 16, 'ω_m = ' + fmt0(q.om) + ' rad/s  |  f = ' + fmt2(st.b.f) + ' Hz  |  f_ripple = ' + fmt1(st.fRipple) + ' Hz  |  L = ' + fmt1(q.L * 1e6) + ' µH', COL.faint, 'right', 'top', FONT_S);

      var ly = box.y + box.h + 46;
      rect(ctx, 12, ly - 8, 11, 9, COL.c2, 0.92);
      label(ctx, 28, ly - 3, 'ذرات مستطیلی', COL.c2, 'left', 'middle', FONT_S);
      rect(ctx, 124, ly - 8, 11, 9, COL.c1, 0.92);
      label(ctx, 140, ly - 3, 'سینوسی', COL.c1, 'left', 'middle', FONT_S);
      rect(ctx, 196, ly - 8, 11, 9, COL.c6, 0.92);
      label(ctx, 212, ly - 3, 'خط ایده‌آل', COL.c6, 'left', 'middle', FONT_S);
      rect(ctx, 288, ly - 8, 11, 9, COL.c5, 0.92);
      label(ctx, 304, ly - 3, 'مرجع کوگینگ', COL.c5, 'left', 'middle', FONT_S);
      var foot = [
        'τ = L/R = ' + fmt3(st.tau * 1000) + ' ms   |   t_comm = 1/(6f) = ' + fmt3(st.tcomm * 1000) + ' ms   |   exp(−t_comm/τ) = ' + fmt4(st.smooth),
        'Δi_pp = V_bus/(4·L·f_pwm) = ' + fmt3(st.ipp) + ' A   |   ریپل جریان = ' + fmt2(st.icu) + ' %   |   هارمونیک غالب مرتبه ' + String(st.order)
      ];
      for (i = 0; i < foot.length; i++) {
        plabel(ctx, w - 12, ly + 14 + i * 18, foot[i], COL.faint, 'right', 'top', FONT_S);
      }
    }

    updaters.push(refreshCard2);
    refreshCard2();
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

  PH.register('motors-sens', {
    title: 'موتور BLDC — حساسیت پارامترها و ریپل گشتاور',
    subtitle: 'تحلیل حساسیت 9 پارامتر ماشین با نمودار تورنادو واگرا و مقایسه موج گشتاور ذراتی و سینوسی با ریپل PWM',
    build: build
  });
}());

(function () {
  'use strict';

  var PH = window.PH;
  if (!PH) { return; }

  var RHO0 = 1.225;
  var KB = 8.988e9;
  var G = 9.81;
  var CSOUND = 340;
  var CL_SLOPE = 2 * Math.PI;
  var KT = 1.94384;

  var ISA = [
    [0, 288.15, 101325, 1.2250],
    [1000, 288.15, 89875, 1.1120],
    [2000, 288.15, 79498, 0.9691],
    [3000, 288.15, 70121, 0.9093],
    [4000, 281.15, 61660, 0.8194],
    [5000, 268.65, 54019, 0.7364],
    [6000, 256.15, 47211, 0.6601],
    [7000, 243.59, 41063, 0.5901],
    [8000, 236.22, 35656, 0.5258],
    [9000, 229.90, 30742, 0.4671],
    [10000, 223.15, 26436, 0.4135],
    [11000, 216.65, 22632, 0.3639],
    [12000, 216.65, 19330, 0.3108]
  ];

  var COL = {
    grid: '#223047',
    axis: '#7d8ea8',
    text: '#a7b6cc',
    faint: '#5b6a82',
    c1: '#4ea3ff',
    c2: '#ffb454',
    c3: '#57d9a3',
    c4: '#ff6b81',
    c5: '#c792ea',
    c6: '#8fd4ff',
    panel: '#141d2b',
    flow: '#6fa8e6',
    body: '#c9d6e8'
  };

  var FONT = '11px Tahoma, Segoe UI, sans-serif';
  var FONT_B = 'bold 11px Tahoma, Segoe UI, sans-serif';
  var FONT_S = '9px Tahoma, Segoe UI, sans-serif';

  var anims = [];
  var rafId = null;
  var visHost = null;
  var visObs = null;

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

  function interpISA(h, col) {
    var i;
    if (h <= ISA[0][0]) { return ISA[0][col]; }
    var last = ISA[ISA.length - 1];
    if (h >= last[0]) { return last[col]; }
    for (i = 1; i < ISA.length; i++) {
      if (h <= ISA[i][0]) {
        var f = (h - ISA[i - 1][0]) / (ISA[i][0] - ISA[i - 1][0]);
        return ISA[i - 1][col] + f * (ISA[i][col] - ISA[i - 1][col]);
      }
    }
    return last[col];
  }

  function rhoAt(h) { return interpISA(h, 3); }
  function tempAt(h) { return interpISA(h, 1); }
  function soundAt(h) { return 20.05 * Math.sqrt(tempAt(h)); }

  function dynPress(rho, v) { return 0.5 * rho * v * v; }

  function aspect(b, s) { return (b * b) / s; }

  function degPerCl(cl, slope) { return (cl * 180) / (slope * Math.PI); }

  function critAlpha(clMax) { return degPerCl(clMax, CL_SLOPE); }

  function induced(cl, e, ar) { return (cl * cl) / (Math.PI * e * ar); }

  function aeroAt(aDeg, o) {
    var perDeg = (CL_SLOPE * Math.PI) / 180;
    var aCrit = critAlpha(o.clMax);
    var cl = perDeg * aDeg;
    var sep = 0;
    var stalled = aDeg > aCrit;
    if (stalled) {
      cl = o.clMax - perDeg * 0.55 * (aDeg - aCrit);
      sep = aDeg - aCrit;
    }
    var cdi = induced(cl, o.e, o.ar);
    var cd = o.cd0 + cdi + 0.02 * sep * sep;
    return { cl: cl, cd: cd, cdi: cdi, stalled: stalled, sep: sep, aCrit: aCrit };
  }

  function reVerdict(re) {
    if (re < 5e5) { return 'آرام'; }
    if (re < 3e6) { return 'گذار'; }
    return 'آشفته';
  }

  function machVerdict(m) {
    if (m < 0.8) { return 'زیرصوت'; }
    if (m < 1.2) { return 'گذرا'; }
    return 'بالاصوت';
  }

  function clMaxOfRe(re, clMax) {
    return clMax * (1 - 45 * Math.pow(re, -0.35));
  }

  function cdOfRe(re, cd0) {
    return 1.328 / Math.sqrt(re) + cd0 * Math.pow(re / 1e6, -0.15);
  }

  function propCT(j) {
    return 0.045 + 0.9 * Math.exp(-1.9 * (j - 0.45) * (j - 0.45));
  }

  function propCP(j) {
    return 0.06 + 0.36 * Math.exp(-2.2 * (j - 0.85) * (j - 0.85));
  }

  function fmt(v, d) {
    if (typeof v !== 'number' || !isFinite(v)) { return '-'; }
    var a = Math.abs(v);
    if (a !== 0 && (a >= 1e6 || a < 1e-4)) { return v.toExponential(2); }
    return PH.num(v, d === undefined ? 3 : d);
  }

  function fmt0(v) {
    if (typeof v !== 'number' || !isFinite(v)) { return '-'; }
    return PH.num(v, 0);
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

  function tickVal(t) {
    if (typeof t === 'object' && t !== null) { return t.v; }
    return t;
  }

  function tickTxt(t) {
    if (typeof t === 'object' && t !== null) { return t.label; }
    return String(t);
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
      var gx = Math.round(X(tickVal(xt[i]))) + 0.5;
      ctx.moveTo(gx, y0);
      ctx.lineTo(gx, y0 + bh);
    }
    for (i = 0; i < yt.length; i++) {
      var gy = Math.round(Y(tickVal(yt[i]))) + 0.5;
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
    for (i = 0; i < xt.length; i++) { ctx.fillText(tickTxt(xt[i]), X(tickVal(xt[i])), y0 + bh + 6); }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (i = 0; i < yt.length; i++) { ctx.fillText(tickTxt(yt[i]), x0 - 6, Y(tickVal(yt[i]))); }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COL.faint;
    ctx.font = FONT_S;
    ctx.fillText(xl, x0 + bw - 2, y0 + bh + 20);
    ctx.save();
    ctx.translate(x0 - 34, y0 + 4);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yl, 0, 0);
    ctx.restore();
    ctx.restore();
    return { X: X, Y: Y, box: box };
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

  function poly(ctx, pts, close) {
    var i;
    ctx.beginPath();
    for (i = 0; i < pts.length; i++) {
      if (i === 0) { ctx.moveTo(pts[i][0], pts[i][1]); } else { ctx.lineTo(pts[i][0], pts[i][1]); }
    }
    if (close !== false) { ctx.closePath(); }
  }

  function fillPoly(ctx, pts, fill, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.fillStyle = fill;
    poly(ctx, pts);
    ctx.fill();
    ctx.restore();
  }

  function dot(ctx, x, y, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function ring(ctx, x, y, r, color, lw) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
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

  function label(ctx, x, y, text, color, align, base, font) {
    ctx.save();
    ctx.direction = 'ltr';
    ctx.fillStyle = color || COL.text;
    ctx.font = font || FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = base || 'alphabetic';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function dimLine(ctx, x1, y1, x2, y2, text, color) {
    var col = color || COL.faint;
    line(ctx, [[x1, y1], [x2, y2]], col, 1, [3, 3]);
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    var horiz = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    if (horiz) {
      line(ctx, [[x1, y1 - 4], [x1, y1 + 4]], col, 1);
      line(ctx, [[x2, y2 - 4], [x2, y2 + 4]], col, 1);
      label(ctx, mx, my - 5, text, col, 'center', 'alphabetic', FONT_S);
    } else {
      line(ctx, [[x1 - 4, y1], [x1 + 4, y1]], col, 1);
      line(ctx, [[x2 - 4, y2], [x2 + 4, y2]], col, 1);
      label(ctx, mx + 5, my, text, col, 'left', 'middle', FONT_S);
    }
  }

  function badge(text, warn) {
    return el('span', warn ? 'ph-badge badge-warn' : 'ph-badge', text);
  }

  function badgeRow(body) {
    var box = el('div', 'ph-toolbar');
    body.appendChild(box);
    return box;
  }

  function setBadges(box, list) {
    while (box.firstChild) { box.removeChild(box.firstChild); }
    for (var i = 0; i < list.length; i++) { box.appendChild(badge(list[i][0], list[i][1])); }
  }

  function streamY(d, a, y0) {
    var yy = y0;
    var k;
    for (k = 0; k < 6; k++) {
      var r2 = d * d + yy * yy;
      var f = yy * (1 - (a * a) / r2) - y0;
      var df = 1 - (a * a) * (yy * yy - d * d) / (r2 * r2);
      if (Math.abs(df) < 1e-6) { break; }
      yy = yy - f / df;
    }
    return yy;
  }

  function nacaPt(x, m, p, t, s) {
    var yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
    var yc = 0, dy = 0;
    if (m > 0 && p > 0 && p < 1) {
      if (x < p) {
        yc = (m / (p * p)) * (2 * p * x - x * x);
        dy = (2 * m / (p * p)) * (p - x);
      } else {
        yc = (m / ((1 - p) * (1 - p))) * ((1 - 2 * p) + 2 * p * x - x * x);
        dy = (2 * m / ((1 - p) * (1 - p))) * (p - x);
      }
    }
    var th = Math.atan(dy);
    return [x - yt * Math.sin(th), yc + s * yt * Math.cos(th)];
  }

  function nacaOutline(m, p, t, n) {
    var up = [], lo = [], i, b;
    for (i = 0; i <= n; i++) {
      b = (Math.PI * i) / n;
      var x = 0.5 * (1 - Math.cos(b));
      up.push(nacaPt(x, m, p, t, 1));
      lo.push(nacaPt(x, m, p, t, -1));
    }
    var out = [];
    for (i = 0; i < up.length; i++) { out.push(up[i]); }
    for (i = lo.length - 1; i >= 0; i--) { out.push(lo[i]); }
    return out;
  }

  function nacaPeaks(m, p, t, n) {
    var up, lo, i, x, yc, th, cam = 0, thick = 0;
    for (i = 0; i < n; i++) {
      x = (i + 0.5) / n;
      up = nacaPt(x, m, p, t, 1);
      lo = nacaPt(x, m, p, t, -1);
      yc = (up[1] + lo[1]) / 2;
      th = up[1] - lo[1];
      if (yc > cam) { cam = yc; }
      if (th > thick) { thick = th; }
    }
    return { camber: cam, thick: thick };
  }

  function engineLabel(k) {
    if (k === 'jet') { return 'توربوجت'; }
    if (k === 'bypass') { return 'بای‌پس توربوفن'; }
    if (k === 'turboprop') { return 'توربوپراپ'; }
    return 'پیستونی';
  }

  function exp1(host) {
    var p = newCard(host, '۱. میدان‌های پایه سیال', 'فشار دینامیکی، دبی جرمی، عدد رینولدز و عدد ماخ');
    addFormulas(p.body, [
      'q = ½ρV²',
      'ṁ = ρVA',
      'Re = ρVL/μ',
      'M = V/c',
      'δ ≈ 5L/√Re (برآورد ضخامت لایه مرزی)'
    ]);

    var cRho = PH.control({ label: 'چگالی ρ', unit: 'kg/m³', min: 0.05, max: 1.4, step: 0.005, value: 1.225, onInput: upd });
    var cV = PH.control({ label: 'سرعت V', unit: 'm/s', min: 1, max: 150, step: 1, value: 30, onInput: upd });
    var cA = PH.control({ label: 'سطح جریان A', unit: 'm²', min: 0.02, max: 6, step: 0.01, value: 1.2, onInput: upd });
    var cMu = PH.control({ label: 'ویسکوزیته μ', unit: '10⁻⁵ Pa·s', min: 0.5, max: 5, step: 0.01, value: 1.79, onInput: upd });
    var cL = PH.control({ label: 'طول مرجع L', unit: 'm', min: 0.1, max: 20, step: 0.1, value: 2, onInput: upd });
    var cC = PH.control({ label: 'سرعت صوت c', unit: 'm/s', min: 280, max: 360, step: 1, value: CSOUND, onInput: upd });
    p.ctl.appendChild(cRho.root);
    p.ctl.appendChild(cV.root);
    p.ctl.appendChild(cA.root);
    p.ctl.appendChild(cMu.root);
    p.ctl.appendChild(cL.root);
    p.ctl.appendChild(cC.root);

    var badges = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 280);
    var st = { re: 0, m: 0 };

    function upd() {
      var rho = cRho.get(), v = cV.get(), ar = cA.get();
      var mu = cMu.get() * 1e-5, l = cL.get(), cs = cC.get();
      var q = dynPress(rho, v);
      var mdot = rho * v * ar;
      var re = (rho * v * l) / mu;
      var m = v / cs;
      var delta = (5 * l) / Math.sqrt(re) * 1000;
      st.re = re;
      st.m = m;
      ro.update([
        { k: 'فشار دینامیکی q = ½ρV²', v: fmt(q), unit: 'Pa' },
        { k: 'دبی جرمی ṁ = ρVA', v: fmt(mdot), unit: 'kg/s' },
        { k: 'عدد رینولدز Re = ρVL/μ', v: fmt(re), unit: '-' },
        { k: 'عدد ماخ M = V/c', v: fmt(m, 3), unit: '-' },
        { k: 'ضخامت لایه مرزی δ', v: fmt(delta, 2), unit: 'mm' },
        { k: 'ویسکوزیته μ', v: fmt(mu * 1e6, 2), unit: '10⁻⁶ Pa·s' }
      ]);
      setBadges(badges, [
        ['رژیم لایه مرزی: ' + reVerdict(re), false],
        ['ترمودینامیک: ' + machVerdict(m), m >= 1.2],
        ['Re = ' + fmt(re) + '   M = ' + fmt(m, 3), false]
      ]);
      kick();
    }

    function draw(ts) {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      var xc = w * 0.36, yc = h * 0.5;
      var a = h * 0.115;
      var off = (ts || 0) * 0.03;
      var i, j;
      var ys = [];
      for (i = 0; i < 5; i++) { ys.push(h * 0.08 + (i * (yc - a * 1.7 - h * 0.08)) / 4); }
      for (i = 0; i < 5; i++) { ys.push(yc + a * 1.7 + (i * (h * 0.92 - yc - a * 1.7)) / 4); }
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = COL.flow;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([14, 12]);
      ctx.lineDashOffset = -off;
      for (j = 0; j < ys.length; j++) {
        var pts = [];
        for (i = 0; i <= w; i += 5) { pts.push([i, yc + streamY(i - xc, a, ys[j] - yc)]); }
        poly(ctx, pts, false);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.restore();
      var bodyPts = [];
      for (i = 0; i <= 60; i++) {
        var th = (Math.PI * i) / 60;
        bodyPts.push([xc + 1.5 * a * Math.cos(th), yc + a * Math.sin(th)]);
      }
      fillPoly(ctx, bodyPts, COL.body, 0.9);

      var dpx = h * 0.02 + (h * 0.22) / Math.sqrt(Math.max(st.re, 1));
      dpx = Math.min(dpx, h * 0.28);
      var bl = [], bl2 = [];
      for (i = 0; i <= 60; i++) {
        var xx = xc + 1.5 * a * Math.cos((Math.PI * i) / 60);
        var sn = Math.sin((Math.PI * i) / 60);
        var grow = dpx * (0.35 + 0.65 * (xx - xc) / (1.5 * a));
        if (Math.abs(sn) > 0.08) {
          bl.push([xx, yc + a * sn - Math.sign(sn) * grow]);
          bl2.push([xx, yc + a * sn + Math.sign(sn) * grow]);
        }
      }
      line(ctx, bl, COL.c2, 1.5, [6, 4]);
      line(ctx, bl2, COL.c2, 1.5, [6, 4]);
      arrow(ctx, xc - 1.5 * a, yc - a - dpx, xc - 1.5 * a, yc - a, COL.c2, 1.5, 6);
      arrow(ctx, xc - 1.5 * a, yc - a, xc - 1.5 * a, yc - a - dpx, COL.c2, 1.5, 6);
      label(ctx, xc - 1.5 * a - 8, yc - a - dpx / 2, 'delta', COL.c2, 'right', 'middle', FONT_S);
      dot(ctx, xc - 1.5 * a, yc, 3, COL.c4);
      label(ctx, 10, 16, 'Re = ' + fmt(st.re) + '   M = ' + fmt(st.m, 3) + '   ' + reVerdict(st.re), COL.text, 'left', 'top', FONT);
      label(ctx, 10, h - 10, 'streamlines over body, boundary layer dashed', COL.faint, 'left', 'bottom', FONT_S);
    }

    addAnim(draw);
    upd();
  }

  function exp2(host) {
    var p = newCard(host, '۲. برآ و پسا', 'منحنی برآ، پسای پاراژیت و القایی، بازده برآ‌به‌پسا و زاویه حمله');
    addFormulas(p.body, [
      'q = ½ρV² ,  L = qSC_L',
      'C_L = C_L0 + C_Lα·α  (C_Lα = 2π بر حسب رادیان)',
      'C_D = C_D0 + C_L²/(πeAR)',
      'AR = b²/S',
      'L/D = C_L/C_D'
    ]);

    var cRho = PH.control({ label: 'چگالی ρ', unit: 'kg/m³', min: 0.05, max: 1.4, step: 0.005, value: 0.364, onInput: upd });
    var cV = PH.control({ label: 'سرعت V', unit: 'm/s', min: 10, max: 300, step: 1, value: 250, onInput: upd });
    var cS = PH.control({ label: 'سطح بال S', unit: 'm²', min: 5, max: 200, step: 0.2, value: 122.6, onInput: upd });
    var cA = PH.control({ label: 'زاویه حمله α', unit: 'deg', min: -10, max: 20, step: 0.1, value: 4.1, onInput: upd });
    var cCd0 = PH.control({ label: 'پسای پاراژیت C_D0', unit: '-', min: 0.005, max: 0.08, step: 0.0005, value: 0.02, onInput: upd });
    var cE = PH.control({ label: 'بازده span e', unit: '-', min: 0.5, max: 1, step: 0.01, value: 0.8, onInput: upd });
    var cB = PH.control({ label: 'دهانه b', unit: 'm', min: 4, max: 60, step: 0.1, value: 35.8, onInput: upd });
    var cW = PH.control({ label: 'وزن W', unit: 'N', min: 1000, max: 900000, step: 500, value: 620000, onInput: upd });
    var cClMax = PH.control({ label: 'برآی بیشینه C_Lmax', unit: '-', min: 0.8, max: 2.2, step: 0.02, value: 1.6, onInput: upd });
    var cM = PH.control({ label: 'انحنای مقطع m', unit: '-', min: 0, max: 0.06, step: 0.002, value: 0.02, onInput: upd });
    var cT = PH.control({ label: 'ضخامت نسبی t', unit: '-', min: 0.06, max: 0.24, step: 0.005, value: 0.12, onInput: upd });
    p.ctl.appendChild(cRho.root);
    p.ctl.appendChild(cV.root);
    p.ctl.appendChild(cS.root);
    p.ctl.appendChild(cA.root);
    p.ctl.appendChild(cCd0.root);
    p.ctl.appendChild(cE.root);
    p.ctl.appendChild(cB.root);
    p.ctl.appendChild(cW.root);
    p.ctl.appendChild(cClMax.root);
    p.ctl.appendChild(cM.root);
    p.ctl.appendChild(cT.root);

    var badges = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cvs = PH.grid(p.body, 2);
    var cvAir = newCanvas(cvs, 280);
    var cvPlot = newCanvas(cvs, 280);
    var st = { a: 0, cl: 0, cam: 0, thk: 0 };

    function params() {
      return {
        ar: aspect(cB.get(), cS.get()),
        e: cE.get(),
        cd0: cCd0.get(),
        clMax: cClMax.get()
      };
    }

    function upd() {
      var rho = cRho.get(), v = cV.get(), s = cS.get();
      var aDeg = cA.get(), w = cW.get();
      var pr = params();
      var q = dynPress(rho, v);
      var res = aeroAt(aDeg, pr);
      var l = q * s * res.cl;
      var d = q * s * res.cd;
      var ld = res.cd > 0 ? res.cl / res.cd : 0;
      st.a = aDeg;
      st.cl = res.cl;
      var pk = nacaPeaks(cM.get(), 0.4, cT.get(), 40);
      st.cam = pk.camber;
      st.thk = pk.thick;
      ro.update([
        { k: 'فشار دینامیکی q', v: fmt(q), unit: 'Pa' },
        { k: 'ضریب برآ C_L', v: fmt(res.cl, 4), unit: '-' },
        { k: 'نیروی برآ L = qSC_L', v: fmt(l), unit: 'N' },
        { k: 'پسای القایی C_Di', v: fmt(res.cdi, 5), unit: '-' },
        { k: 'ضریب پسا C_D', v: fmt(res.cd, 5), unit: '-' },
        { k: 'نیروی پسا D = qSC_D', v: fmt(d), unit: 'N' },
        { k: 'بازده برآ‌به‌پسا L/D', v: fmt(ld, 2), unit: '-' },
        { k: 'نسبت رانش لازم T/W', v: fmt(w > 0 ? d / w : 0, 4), unit: '-' },
        { k: 'بارگذاری بال W/S', v: fmt(w / s, 1), unit: 'N/m²' },
        { k: 'نسبت منظری AR = b²/S', v: fmt(pr.ar, 2), unit: '-' },
        { k: 'زاویه بحرانی α_crit', v: fmt(res.aCrit, 2), unit: 'deg' },
        { k: 'بیشینه انحنای مقطع y_c', v: fmt(st.cam * 100, 2), unit: '%c' },
        { k: 'بیشینه ضخامت مقطع t_max', v: fmt(st.thk * 100, 2), unit: '%c' }
      ]);
      setBadges(badges, [
        [res.stalled ? 'هشدار استال: جریان جدا شده است' : 'جریان متصل: رابطه خطی C_L معتبر است', res.stalled],
        ['C_L = ' + fmt(res.cl, 4) + '   C_D = ' + fmt(res.cd, 5) + '   L/D = ' + fmt(ld, 2), false]
      ]);
      drawAir();
      drawPlot();
    }

    function drawAir() {
      var s = prep(cvAir);
      var ctx = s.ctx, w = s.w, h = s.h;
      var aDeg = st.a;
      var ox = w * 0.28, oy = h * 0.62;
      var sc = Math.min(w * 0.42, h * 0.42);
      var a = (aDeg * Math.PI) / 180;
      var ca = Math.cos(a), sa = Math.sin(a);
      var shape = nacaOutline(cM.get(), 0.4, cT.get(), 36);
      var pts = [], xs = [], ys = [], i;
      for (i = 0; i < shape.length; i++) {
        var cx = shape[i][0], cy = shape[i][1];
        var rx = cx * ca + cy * sa;
        var ry = -(cx * sa) + cy * ca;
        pts.push([ox + rx * sc, oy - ry * sc]);
      }
      for (i = 0; i < pts.length; i++) { xs.push(pts[i][0]); ys.push(pts[i][1]); }
      var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
      var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      ctx.save();
      ctx.strokeStyle = COL.faint;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (i = 0; i <= 10; i++) {
        var yy = minY - 10 + (i * (maxY - minY + 20)) / 10;
        ctx.moveTo(minX - 6, yy);
        ctx.lineTo(maxX + 6, yy);
      }
      for (i = 0; i <= 12; i++) {
        var xx = minX - 6 + (i * (maxX - minX + 12)) / 12;
        ctx.moveTo(xx, minY - 10);
        ctx.lineTo(xx, maxY + 10);
      }
      ctx.stroke();
      ctx.restore();
      fillPoly(ctx, pts, COL.body, 0.92);
      line(ctx, [[ox, oy], [ox + ca * sc, oy - sa * sc]], COL.c1, 1.5, [7, 5]);
      arrow(ctx, ox - sc * 0.55, oy, ox + sc * 1.25, oy, COL.flow, 2, 10);
      label(ctx, ox + sc * 1.3, oy + 14, 'V_inf', COL.flow, 'left', 'top', FONT_S);
      var r0 = sc * 0.55;
      line(ctx, [[ox, oy], [ox + r0 * Math.cos(-a), oy - r0 * Math.sin(-a)]], COL.c2, 1.5);
      ctx.save();
      ctx.strokeStyle = COL.c2;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ox, oy, r0, -a, 0);
      ctx.stroke();
      ctx.restore();
      label(ctx, ox + r0 * 0.55, oy - 8, 'a = ' + fmt(aDeg, 1) + ' deg', COL.c2, 'left', 'bottom', FONT_S);
      var fScale = Math.min(sc * 0.9, 20 + Math.abs(st.cl) * 90);
      var lx = ox + ca * sc * 0.55, ly = oy - sa * sc * 0.55;
      arrow(ctx, lx, ly, lx - sa * fScale, ly - ca * fScale, COL.c3, 2.6, 11);
      label(ctx, lx - sa * fScale - 6, ly - ca * fScale - 4, 'L', COL.c3, 'right', 'bottom', FONT_B);
      arrow(ctx, lx, ly, lx - ca * fScale * 0.35, ly + sa * fScale * 0.35, COL.c4, 2.6, 11);
      label(ctx, lx - ca * fScale * 0.4, ly + sa * fScale * 0.4 + 12, 'D', COL.c4, 'right', 'top', FONT_B);
      var rx = lx - sa * fScale - ca * fScale * 0.35;
      var ry = ly - ca * fScale + sa * fScale * 0.35;
      arrow(ctx, lx, ly, rx, ry, COL.c5, 2, 10);
      label(ctx, rx + 6, ry, 'R', COL.c5, 'left', 'middle', FONT_B);
      label(ctx, 10, 16, 'airfoil, m = ' + fmt(cM.get(), 3) + ', t = ' + fmt(cT.get(), 3), COL.text, 'left', 'top', FONT_S);
    }

    function drawPlot() {
      var pr = params();
      var s = prep(cvPlot);
      var ctx = s.ctx;
      var box = { x: 58, y: 22, w: s.w - 88, h: s.h - 66 };
      var ax = plot(ctx, box, [-12, 22], [-1.6, 2.2], [-10, -5, 0, 5, 10, 15, 20], [-1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2], 'alpha [deg]', 'C_L');
      var pts = [], i;
      for (i = 0; i <= 180; i++) {
        var aa = -12 + (i * 34) / 180;
        pts.push([ax.X(aa), ax.Y(aeroAt(aa, pr).cl)]);
      }
      line(ctx, pts, COL.c1, 2.2);
      var post = [];
      var ac0 = critAlpha(pr.clMax);
      for (i = 0; i <= 90; i++) {
        var aa2 = ac0 + (i * (22 - ac0)) / 90;
        post.push([ax.X(aa2), ax.Y(aeroAt(aa2, pr).cl)]);
      }
      line(ctx, post, COL.c4, 2, [5, 4]);
      line(ctx, [[ax.X(ac0), box.y], [ax.X(ac0), box.y + box.h]], COL.c4, 1.2, [4, 4]);
      dot(ctx, ax.X(ac0), ax.Y(pr.clMax), 5, COL.c4);
      label(ctx, ax.X(ac0) + 6, box.y + 12, 'stall a_crit = ' + fmt(ac0, 1), COL.c4, 'left', 'top', FONT_S);
      var px = ax.X(st.a), py = ax.Y(st.cl);
      dot(ctx, px, py, 4.5, COL.c2);
      ring(ctx, px, py, 9, COL.c2, 1.2);
      line(ctx, [[px, box.y], [px, box.y + box.h]], COL.c2, 1, [2, 3]);
      label(ctx, px + 8, py - 8, 'C_L = ' + fmt(st.cl, 3), COL.c2, 'left', 'bottom', FONT_S);
      label(ctx, box.x, 12, 'lift curve with stall break', COL.text, 'left', 'top', FONT_S);
    }

    upd();
  }

  function exp3(host) {
    var p = newCard(host, '۳. قطب پسا و سرعت‌های بهینه', 'قطب پسا، بیشینه برآ‌به‌پسا، کمینه پسا، بیشینه برد و بیشینه مداومت');
    addFormulas(p.body, [
      'C_D = C_D0 + C_L²/(πeAR)',
      'C_L(L/D)_max = √(πeAR·C_D0)',
      'V = √(2W/(ρS C_L))',
      'C_L برد (جت) = √(πeAR·C_D0) ,  C_L برد (پیشانه) = √(πeAR·C_D0/3)',
      'C_L مداومت (پیشانه) = √(3πeAR·C_D0)'
    ]);

    var cRho = PH.control({ label: 'چگالی ρ', unit: 'kg/m³', min: 0.05, max: 1.4, step: 0.005, value: 0.364, onInput: upd });
    var cW = PH.control({ label: 'وزن W', unit: 'N', min: 5000, max: 900000, step: 1000, value: 620000, onInput: upd });
    var cS = PH.control({ label: 'سطح بال S', unit: 'm²', min: 5, max: 250, step: 0.2, value: 122.6, onInput: upd });
    var cCd0 = PH.control({ label: 'پسای پاراژیت C_D0', unit: '-', min: 0.005, max: 0.08, step: 0.0005, value: 0.02, onInput: upd });
    var cE = PH.control({ label: 'بازده span e', unit: '-', min: 0.5, max: 1, step: 0.01, value: 0.8, onInput: upd });
    var cAr = PH.control({ label: 'نسبت منظری AR', unit: '-', min: 3, max: 25, step: 0.1, value: 10.5, onInput: upd });
    var cV = PH.control({ label: 'سرعت کاری V', unit: 'm/s', min: 10, max: 350, step: 1, value: 250, onInput: upd });
    var cType = PH.control({
      label: 'نوع پیشران',
      type: 'select',
      options: [{ value: 'jet', label: 'جت' }, { value: 'prop', label: 'پیشانه' }],
      value: 'jet',
      onInput: upd
    });
    p.ctl.appendChild(cRho.root);
    p.ctl.appendChild(cW.root);
    p.ctl.appendChild(cS.root);
    p.ctl.appendChild(cCd0.root);
    p.ctl.appendChild(cE.root);
    p.ctl.appendChild(cAr.root);
    p.ctl.appendChild(cV.root);
    p.ctl.appendChild(cType.root);

    var badges = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 340);

    function vel(cl) {
      var denom = cRho.get() * cS.get() * cl;
      if (denom <= 0) { return 0; }
      return Math.sqrt((2 * cW.get()) / denom);
    }

    function cdOf(cl) {
      return cCd0.get() + induced(cl, cE.get(), cAr.get());
    }

    function upd() {
      var e = cE.get(), ar = cAr.get(), cd0 = cCd0.get();
      var root = Math.sqrt(Math.PI * e * ar * cd0);
      var clLdm = root;
      var vLdm = vel(clLdm);
      var ldLdm = clLdm / cdOf(clLdm);
      var clMin = 1;
      var vMin = vel(clMin);
      var ldMin = clMin / cdOf(clMin);
      var clRj = root;
      var vRj = vel(clRj);
      var ldRj = clRj / cdOf(clRj);
      var clEp = Math.sqrt(3 * Math.PI * e * ar * cd0);
      var vEp = vel(clEp);
      var ldEp = clEp / cdOf(clEp);
      var clRp = Math.sqrt((Math.PI * e * ar * cd0) / 3);
      var vRp = vel(clRp);
      var ldRp = clRp / cdOf(clRp);
      var sel = cType.get() === 'prop';
      var vNow = cV.get();
      var clNow = (2 * cW.get()) / (cRho.get() * cS.get() * vNow * vNow);
      var cdNow = cdOf(clNow);
      var ldNow = cdNow > 0 ? clNow / cdNow : 0;
      ro.update([
        { k: 'بیشینه L/D : C_L', v: fmt(clLdm, 4), unit: '-' },
        { k: 'بیشینه L/D : سرعت V', v: fmt(vLdm, 1), unit: 'm/s' },
        { k: 'بیشینه L/D : L/D', v: fmt(ldLdm, 2), unit: '-' },
        { k: 'کمینه پسا : C_L', v: fmt(clMin, 4), unit: '-' },
        { k: 'کمینه پسا : C_D', v: fmt(cdOf(clMin), 5), unit: '-' },
        { k: 'کمینه پسا : سرعت V', v: fmt(vMin, 1), unit: 'm/s' },
        { k: 'کمینه پسا : L/D', v: fmt(ldMin, 2), unit: '-' },
        { k: 'بیشینه برد (جت) : C_L', v: fmt(clRj, 4), unit: '-' },
        { k: 'بیشینه برد (جت) : سرعت V', v: fmt(vRj, 1), unit: 'm/s' },
        { k: 'بیشینه برد (جت) : L/D', v: fmt(ldRj, 2), unit: '-' },
        { k: 'بیشینه برد (پیشانه) : C_L', v: fmt(clRp, 4), unit: '-' },
        { k: 'بیشینه برد (پیشانه) : سرعت V', v: fmt(vRp, 1), unit: 'm/s' },
        { k: 'بیشینه برد (پیشانه) : L/D', v: fmt(ldRp, 2), unit: '-' },
        { k: 'بیشینه مداومت (پیشانه) : C_L', v: fmt(clEp, 4), unit: '-' },
        { k: 'بیشینه مداومت (پیشانه) : سرعت V', v: fmt(vEp, 1), unit: 'm/s' },
        { k: 'بیشینه مداومت (پیشانه) : L/D', v: fmt(ldEp, 2), unit: '-' },
        { k: 'نقطه کاری در V انتخابی : C_L', v: fmt(clNow, 4), unit: '-' },
        { k: 'نقطه کاری در V انتخابی : C_D', v: fmt(cdNow, 5), unit: '-' },
        { k: 'نقطه کاری در V انتخابی : L/D', v: fmt(ldNow, 2), unit: '-' },
        { k: 'مرجع انتخابی : سرعت V', v: fmt(sel ? vRp : vRj, 1), unit: 'm/s' },
        { k: 'مرجع انتخابی : L/D', v: fmt(sel ? ldRp : ldRj, 2), unit: '-' }
      ]);
      setBadges(badges, [
        ['حالت انتخابی: ' + (sel ? 'پیشانه — بیشینه برد پیشانه / بیشینه مداومت پیشانه' : 'جت — بیشینه برد و بیشینه مداومت در بیشینه L/D'), false],
        ['نقطه کاری: C_L = ' + fmt(clNow, 4) + ' , C_D = ' + fmt(cdNow, 5) + ' , L/D = ' + fmt(ldNow, 2), false]
      ]);
      draw(clLdm, vLdm, clMin, vMin, clRj, vRj, clEp, vEp, clNow, cdNow);
    }

    function cdTicks(top) {
      var stepv = Math.pow(10, Math.floor(Math.log(top) / Math.LN10)) / 2;
      var out = [0];
      var v = stepv;
      while (v <= top * 1.001) { out.push(+v.toFixed(5)); v += stepv; }
      return out;
    }

    function clTicks(top) {
      var stepv = top > 2 ? 0.5 : 0.25;
      var out = [];
      var v = -0.5;
      while (v <= top * 1.001) { out.push(+v.toFixed(2)); v += stepv; }
      return out;
    }

    function draw(clLdm, vLdm, clMin, vMin, clRj, vRj, clEp, vEp, clNow, cdNow) {
      var s = prep(cv);
      var ctx = s.ctx;
      var box = { x: 62, y: 22, w: s.w - 100, h: s.h - 66 };
      var cdTop = (cCd0.get() + (clEp * clEp) / (Math.PI * cE.get() * cAr.get()) + cCd0.get()) * 1.05;
      var clTop = clEp * 1.08;
      var ax = plot(ctx, box, [0, cdTop], [-0.6, clTop], cdTicks(cdTop), clTicks(clTop), 'C_D', 'C_L');
      var pts = [], i;
      for (i = 0; i <= 200; i++) {
        var cl = -0.6 + (i * (clTop + 0.6)) / 200;
        pts.push([ax.X(cdOf(cl)), ax.Y(cl)]);
      }
      line(ctx, pts, COL.c1, 2.2);
      var mk = function (cl, col, txt) {
        dot(ctx, ax.X(cdOf(cl)), ax.Y(cl), 4.5, col);
        ring(ctx, ax.X(cdOf(cl)), ax.Y(cl), 8, col, 1.2);
        label(ctx, ax.X(cdOf(cl)) + 8, ax.Y(cl) - 6, txt, col, 'left', 'bottom', FONT_S);
      };
      mk(clLdm, COL.c3, '(L/D)max V=' + fmt(vLdm, 0));
      mk(clMin, COL.c6, 'min drag V=' + fmt(vMin, 0));
      mk(clRj, COL.c2, 'range jet V=' + fmt(vRj, 0));
      mk(clEp, COL.c5, 'endur prop V=' + fmt(vEp, 0));
      dot(ctx, ax.X(cdNow), ax.Y(clNow), 4, COL.c4);
      line(ctx, [[ax.X(cdNow), box.y], [ax.X(cdNow), box.y + box.h]], COL.c4, 1, [2, 3]);
      line(ctx, [[box.x, ax.Y(clNow)], [box.x + box.w, ax.Y(clNow)]], COL.c4, 1, [2, 3]);
      label(ctx, ax.X(cdNow) + 6, box.y + box.h - 6, 'operating point', COL.c4, 'left', 'bottom', FONT_S);
      label(ctx, box.x, 12, 'drag polar with optimum points', COL.text, 'left', 'top', FONT_S);
    }

    upd();
  }

  function exp4(host) {
    var p = newCard(host, '۴. استال و سرعت بحرانی', 'سرعت‌های مرجع، نمودار V-n و هشدار استال');
    addFormulas(p.body, [
      'V_s = √(2nW/(ρSC_Lmax))',
      'V_s0 = √(2W/(ρSC_Lmax))',
      'V_x = V_s0·√n ,  V_fe = 1.1 V_s0 ,  V_no = 1.3 V_s0',
      'S_TO ≈ (1.15 V_s0)²/(2a) + 60 m'
    ]);

    var cW = PH.control({ label: 'وزن W', unit: 'N', min: 3000, max: 900000, step: 500, value: 10230, onInput: upd });
    var cS = PH.control({ label: 'سطح بال S', unit: 'm²', min: 5, max: 250, step: 0.2, value: 16.2, onInput: upd });
    var cRho = PH.control({ label: 'چگالی ρ', unit: 'kg/m³', min: 0.05, max: 1.4, step: 0.005, value: 1.225, onInput: upd });
    var cClMax = PH.control({ label: 'برآی بیشینه C_Lmax', unit: '-', min: 0.8, max: 2.6, step: 0.02, value: 1.6, onInput: upd });
    var cN = PH.control({ label: 'ضریب بار n', unit: '-', min: 1.5, max: 6, step: 0.1, value: 3.8, onInput: upd });
    var cV = PH.control({ label: 'سرعت کاری V', unit: 'm/s', min: 10, max: 220, step: 1, value: 30, onInput: upd });
    var cAr = PH.control({ label: 'نسبت منظری AR', unit: '-', min: 3, max: 22, step: 0.1, value: 7.4, onInput: upd });
    var cH = PH.control({ label: 'ارتفاع h', unit: 'm', min: 0, max: 11000, step: 100, value: 0, onInput: upd });
    p.ctl.appendChild(cW.root);
    p.ctl.appendChild(cS.root);
    p.ctl.appendChild(cRho.root);
    p.ctl.appendChild(cClMax.root);
    p.ctl.appendChild(cN.root);
    p.ctl.appendChild(cV.root);
    p.ctl.appendChild(cAr.root);
    p.ctl.appendChild(cH.root);

    var badges = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cvs = PH.grid(p.body, 2);
    var cvWing = newCanvas(cvs, 280);
    var cvVn = newCanvas(cvs, 280);
    var st = { stalled: false, vs0: 0, vx: 0, vno: 0, vfe: 0, n: 3.8 };

    function upd() {
      var w = cW.get(), s = cS.get();
      var rho = cRho.get() * (cH.get() > 0 ? rhoAt(cH.get()) / RHO0 : 1);
      var clMax = cClMax.get();
      var n = cN.get();
      var vs = Math.sqrt((2 * n * w) / (rho * s * clMax));
      var vs0 = Math.sqrt((2 * w) / (rho * s * clMax));
      var vx = vs0 * Math.sqrt(n);
      var vfe = 1.1 * vs0;
      var vno = 1.3 * vs0;
      var v = cV.get();
      var cl = (2 * w) / (rho * v * v * s);
      var alpha = degPerCl(cl, CL_SLOPE);
      var stalled = cl > clMax || alpha > critAlpha(clMax);
      var sto = (1.15 * vs0 * 1.15 * vs0) / (2 * 1.8) + 60;
      st.stalled = stalled;
      st.vs0 = vs0;
      st.vx = vx;
      st.vno = vno;
      st.vfe = vfe;
      st.n = n;
      ro.update([
        { k: 'سرعت استال با بار n : V_s', v: fmt(vs, 2), unit: 'm/s' },
        { k: 'سرعت استال بدون بار : V_s0', v: fmt(vs0, 2), unit: 'm/s' },
        { k: 'همان بر حسب گره', v: fmt(vs0 * KT, 1), unit: 'KT' },
        { k: 'سرعت گوشه : V_x', v: fmt(vx, 2), unit: 'm/s' },
        { k: 'سرعت فلپ کامل : V_fe', v: fmt(vfe, 2), unit: 'm/s' },
        { k: 'سرعت بیشینه طراحی : V_no', v: fmt(vno, 2), unit: 'm/s' },
        { k: 'سرعت کاری V', v: fmt(v, 1), unit: 'm/s' },
        { k: 'برآی لازم در پرواز افقی', v: fmt(cl, 4), unit: '-' },
        { k: 'زاویه حمله متناظر', v: fmt(alpha, 2), unit: 'deg' },
        { k: 'طول باند تقریبی', v: fmt(sto, 0), unit: 'm' },
        { k: 'دهانه b = √(AR·S)', v: fmt(Math.sqrt(cAr.get() * s), 2), unit: 'm' },
        { k: 'چگالی در ارتفاع h', v: fmt(rho, 4), unit: 'kg/m³' }
      ]);
      setBadges(badges, [
        [stalled ? 'هشدار استال: سرعت کمتر از ۱٫۱۵ V_s0 است' : 'سرعت بالاتر از ۱٫۱۵ V_s0 — ایمن', stalled],
        ['C_L = ' + fmt(cl, 3) + ' , alpha = ' + fmt(alpha, 1) + ' deg', stalled]
      ]);
      kick();
    }

    function drawWing(ts) {
      var s = prep(cvWing);
      var ctx = s.ctx, w = s.w, h = s.h;
      var b = Math.sqrt(cAr.get() * cS.get());
      var cbar = (2 * cS.get()) / b;
      var scale = Math.min((w * 0.88) / b, (h * 0.55) / cbar);
      var x0 = w * 0.5;
      var yRoot = h * 0.72;
      var spanPx = b * scale * 0.5;
      var cpx = cbar * scale;
      var le0 = yRoot - cpx;
      ctx.save();
      ctx.strokeStyle = COL.faint;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      for (var k = -1; k <= 1.001; k += 0.25) {
        var xx = x0 + k * spanPx;
        ctx.beginPath();
        ctx.moveTo(xx, le0 - 14);
        ctx.lineTo(xx, yRoot + 14);
        ctx.stroke();
      }
      ctx.restore();
      var pts = [[x0 - spanPx, le0], [x0 - spanPx * 0.25, le0 - 6], [x0, le0 - 8], [x0 + spanPx * 0.25, le0 - 6], [x0 + spanPx, le0],
      [x0 + spanPx, le0 + cpx * 0.25], [x0, le0 + cpx], [x0 - spanPx, le0 + cpx * 0.25]];
      fillPoly(ctx, pts, COL.body, st.stalled ? 0.55 : 0.85);
      var i, off = (ts || 0) * 0.04;
      for (i = -6; i <= 6; i++) {
        var xx2 = x0 + i * spanPx * 0.16;
        var surf = le0 - 8 - (Math.abs(i) / 6) * 6;
        var cp = [];
        for (var j = 0; j <= 40; j++) {
          var u = j / 40;
          var wave = st.stalled ? 9 * Math.sin(u * 7 + off + i) * u : 0;
          cp.push([xx2, surf - 10 - u * 18 + wave]);
        }
        line(ctx, cp, st.stalled ? COL.c4 : COL.flow, st.stalled ? 2 : 1.4);
      }
      if (st.stalled) {
        for (i = 0; i < 7; i++) {
          var t2 = ((ts || 0) * 0.0008 + i * 0.17) % 1;
          dot(ctx, x0 + (i - 3) * spanPx * 0.22, le0 - 18 - t2 * 26, 3.5 * (1 - t2) + 1.5, COL.c4);
        }
      }
      dimLine(ctx, x0 - spanPx, yRoot + 34, x0 + spanPx, yRoot + 34, 'b = ' + fmt(b, 2) + ' m', COL.faint);
      dimLine(ctx, x0 + spanPx + 26, le0, x0 + spanPx + 26, yRoot, 'c = ' + fmt(cbar, 2) + ' m', COL.faint);
      label(ctx, 10, 16, st.stalled ? 'separated flow (stall)' : 'attached flow', st.stalled ? COL.c4 : COL.text, 'left', 'top', FONT_S);
      label(ctx, 10, h - 10, 'wing planform, AR = ' + fmt(cAr.get(), 2), COL.faint, 'left', 'bottom', FONT_S);
    }

    function drawVn() {
      var s = prep(cvVn);
      var ctx = s.ctx;
      var vTop = st.vno * 1.35;
      var nTop = Math.max(st.n + 1, 5);
      var box = { x: 62, y: 22, w: s.w - 100, h: s.h - 66 };
      var xt = [], i;
      var stepv = vTop / 4;
      for (i = 0; i <= 4; i++) { xt.push(+(i * stepv).toFixed(0)); }
      var yt = [];
      for (i = -1; i <= nTop; i++) { yt.push(i); }
      var ax = plot(ctx, box, [0, vTop], [-1.5, nTop], xt, yt, 'V [m/s]', 'n');
      var pts = [];
      for (i = 0; i <= 120; i++) {
        var nn = 1 + (st.n - 1) * (i / 120);
        pts.push([ax.X(st.vs0 * Math.sqrt(nn)), ax.Y(nn)]);
      }
      line(ctx, pts, COL.c4, 2.2);
      line(ctx, [[ax.X(st.vs0), ax.Y(1)], [ax.X(st.vx), ax.Y(st.n)], [ax.X(st.vno), ax.Y(st.n)], [ax.X(st.vno), ax.Y(nTop)]], COL.c1, 2.2);
      line(ctx, [[ax.X(st.vs0), ax.Y(-1)], [ax.X(st.vno), ax.Y(-0.4)]], COL.c6, 1.6, [5, 4]);
      line(ctx, [[ax.X(st.vfe), ax.Y(1)], [ax.X(st.vfe), ax.Y(nTop)], [ax.X(st.vno), ax.Y(nTop)]], COL.c3, 1.2, [4, 4]);
      dot(ctx, ax.X(st.vx), ax.Y(st.n), 4.5, COL.c2);
      label(ctx, ax.X(st.vx) + 6, ax.Y(st.n) - 6, 'Vx n=' + fmt(st.n, 1), COL.c2, 'left', 'bottom', FONT_S);
      label(ctx, ax.X(st.vno) + 5, ax.Y(0.4), 'Vno', COL.c6, 'left', 'middle', FONT_S);
      var v = cV.get();
      var rhoNow = cRho.get() * (cH.get() > 0 ? rhoAt(cH.get()) / RHO0 : 1);
      var clNow = (2 * cW.get()) / (rhoNow * v * v * cS.get());
      var nnNow = clNow / cClMax.get();
      if (nnNow >= 0) {
        dot(ctx, ax.X(v), ax.Y(nnNow), 4.5, COL.c5);
        ring(ctx, ax.X(v), ax.Y(nnNow), 9, COL.c5, 1.2);
        label(ctx, ax.X(v) + 8, ax.Y(nnNow) - 8, 'point V=' + fmt(v, 0) + ' n=' + fmt(nnNow, 2), COL.c5, 'left', 'bottom', FONT_S);
      }
      label(ctx, box.x, 12, 'V-n diagram, Vs0 = ' + fmt(st.vs0, 1) + ' m/s', COL.text, 'left', 'top', FONT_S);
    }

    addAnim(function (ts) { drawWing(ts); drawVn(); });
    upd();
  }

  function exp5(host) {
    var p = newCard(host, '۵. ساختار بال و بودجه جرمی', 'نسبت منظری، مخروطی، پسرفت، دیهدرال، پیچ و برآورد وزن بال');
    addFormulas(p.body, [
      'AR = b²/S',
      'c_tip = λ·b ,  c_mean = 2S/b',
      'LE sweep: tanΛ = (y_tip − y_root)/(b/2)',
      'W_wing = f_W·M_OE·(1 + 0.30|twist|/3 + 0.40·tanΛ + 0.25|Γ|/3)',
      'M_root = (W_wing·g/2)·(b/4)'
    ]);

    var cS = PH.control({ label: 'سطح بال S', unit: 'm²', min: 5, max: 250, step: 0.2, value: 16.2, onInput: upd });
    var cB = PH.control({ label: 'دهانه b', unit: 'm', min: 4, max: 70, step: 0.1, value: 11, onInput: upd });
    var cLam = PH.control({ label: 'نسبت مخروطی λ', unit: '-', min: 0.2, max: 1, step: 0.01, value: 0.7, onInput: upd });
    var cSw = PH.control({ label: 'پسرفت لبه جلو Λ', unit: 'deg', min: 0, max: 45, step: 0.5, value: 2, onInput: upd });
    var cDi = PH.control({ label: 'دیهدرال Γ', unit: 'deg', min: -10, max: 12, step: 0.5, value: 1.7, onInput: upd });
    var cTw = PH.control({ label: 'پیچ نوک β', unit: 'deg', min: -8, max: 4, step: 0.1, value: -2, onInput: upd });
    var cE = PH.control({ label: 'بازده span e', unit: '-', min: 0.5, max: 1, step: 0.01, value: 0.8, onInput: upd });
    var cMe = PH.control({ label: 'جرم خالی M_OE', unit: 'kg', min: 300, max: 80000, step: 100, value: 750, onInput: upd });
    var cPl = PH.control({ label: 'بار مفید payload', unit: 'kg', min: 0, max: 30000, step: 50, value: 300, onInput: upd });
    var cFu = PH.control({ label: 'سوخت fuel', unit: 'kg', min: 0, max: 40000, step: 50, value: 150, onInput: upd });
    var cCls = PH.control({
      label: 'کلاس هواپیما',
      type: 'select',
      options: [
        { value: 'ga', label: 'سبک (GA)' },
        { value: 'trainer', label: 'آموزشی/Utility' },
        { value: 'regional', label: 'منطقه‌ای' },
        { value: 'transport', label: 'باربری' }
      ],
      value: 'ga',
      onInput: upd
    });
    p.ctl.appendChild(cS.root);
    p.ctl.appendChild(cB.root);
    p.ctl.appendChild(cLam.root);
    p.ctl.appendChild(cSw.root);
    p.ctl.appendChild(cDi.root);
    p.ctl.appendChild(cTw.root);
    p.ctl.appendChild(cE.root);
    p.ctl.appendChild(cMe.root);
    p.ctl.appendChild(cPl.root);
    p.ctl.appendChild(cFu.root);
    p.ctl.appendChild(cCls.root);

    var badges = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 340);

    function fw() {
      var k = cCls.get();
      if (k === 'trainer') { return 0.16; }
      if (k === 'regional') { return 0.24; }
      if (k === 'transport') { return 0.30; }
      return 0.13;
    }

    function upd() {
      var s = cS.get(), b = cB.get(), lam = cLam.get();
      var swR = (cSw.get() * Math.PI) / 180;
      var cmean = (2 * s) / b;
      var cTip = (2 * s) / (b * (1 + lam));
      var cRoot = cTip + cmean * lam;
      var ar = (b * b) / s;
      var me = cMe.get();
      var corr = 1 + 0.30 * Math.abs(cTw.get()) / 3 + 0.40 * Math.tan(swR) + 0.25 * Math.abs(cDi.get()) / 3;
      var wwing = fw() * me * corr;
      var mroot = (wwing * G / 2) * (b / 4);
      var tipload = (wwing * G) / (2 * b);
      var mto = me + cPl.get() + cFu.get();
      ro.update([
        { k: 'نسبت منظری AR = b²/S', v: fmt(ar, 2), unit: '-' },
        { k: 'رشته نسبی c₀/c_t', v: fmt(cRoot / cTip, 3), unit: '-' },
        { k: 'میانگین هندسی c = 2S/b', v: fmt(cmean, 3), unit: 'm' },
        { k: 'مقطع ریشه c₀', v: fmt(cRoot, 3), unit: 'm' },
        { k: 'مقطع نوک c_t', v: fmt(cTip, 3), unit: 'm' },
        { k: 'بازده span e', v: fmt(cE.get(), 2), unit: '-' },
        { k: 'برآورد وزن بال W_wing', v: fmt(wwing, 1), unit: 'kg' },
        { k: 'سهم بال از جرم خالی', v: fmt(me > 0 ? (wwing * 100) / me : 0, 1), unit: '%' },
        { k: 'بار خطی نوک بال', v: fmt(tipload, 1), unit: 'N/m' },
        { k: 'گشتاور ریشه بال', v: fmt(mroot, 0), unit: 'N·m' },
        { k: 'جرم خالی M_OE', v: fmt0(me), unit: 'kg' },
        { k: 'بار مفید', v: fmt0(cPl.get()), unit: 'kg' },
        { k: 'سوخت', v: fmt0(cFu.get()), unit: 'kg' },
        { k: 'بار قابل استفاده', v: fmt0(cPl.get() + cFu.get()), unit: 'kg' },
        { k: 'جرم کل M_TO', v: fmt0(mto), unit: 'kg' },
        { k: 'سهم سوخت از جرم کل', v: fmt(mto > 0 ? (cFu.get() * 100) / mto : 0, 1), unit: '%' },
        { k: 'بارگذاری بال W/S', v: fmt((mto * G) / s, 0), unit: 'N/m²' }
      ]);
      setBadges(badges, [
        ['کلاس: ' + cCls.get() + ' — ضریب f_W = ' + fmt(fw(), 2), false],
        ['AR = ' + fmt(ar, 2) + ' , c₀/c_t = ' + fmt(cRoot / cTip, 2) + ' , W_wing = ' + fmt(wwing, 0) + ' kg', false]
      ]);
      draw();
    }

    function draw() {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      var b = cB.get(), lam = cLam.get();
      var swR = (cSw.get() * Math.PI) / 180;
      var diR = (cDi.get() * Math.PI) / 180;
      var tw = cTw.get();
      var cmean = (2 * cS.get()) / b;
      var cTip = (2 * cS.get()) / (b * (1 + lam));
      var cRoot = cTip + cmean * lam;
      var scale = Math.min((w * 0.62) / b, (h * 0.5) / cRoot);
      var x0 = w * 0.36, yRef = h * 0.62;
      var halfB = (b * scale) / 2;
      var sweepPx = Math.tan(swR) * halfB;
      var i;
      fillPoly(ctx, [
        [x0 - halfB, yRef + sweepPx - cTip * scale],
        [x0, yRef - cRoot * scale],
        [x0 + halfB, yRef + sweepPx - cTip * scale],
        [x0 + halfB, yRef + sweepPx],
        [x0, yRef],
        [x0 - halfB, yRef + sweepPx]
      ], COL.body, 0.85);
      for (i = 1; i < 5; i++) {
        var u = i / 5;
        var yle = yRef - cRoot * scale * (1 - u) + sweepPx * u;
        var cst = (cRoot + (cTip - cRoot) * u) * scale;
        line(ctx, [[x0 - halfB + 2 * halfB * u, yle], [x0 - halfB + 2 * halfB * u, yle + cst]], COL.faint, 1);
      }
      line(ctx, [[x0 - halfB, yRef + sweepPx - cTip * scale], [x0, yRef - cRoot * scale]], COL.c4, 1.4, [6, 4]);
      dimLine(ctx, x0 - halfB, yRef + sweepPx + 42, x0 + halfB, yRef + sweepPx + 42, 'b = ' + fmt(b, 2) + ' m', COL.faint);
      dimLine(ctx, x0, yRef - cRoot * scale - 16, x0, yRef, 'c₀ = ' + fmt(cRoot, 2) + ' m', COL.faint);
      dimLine(ctx, x0 + halfB + 22, yRef + sweepPx - cTip * scale, x0 + halfB + 22, yRef + sweepPx, 'c_t = ' + fmt(cTip, 2) + ' m', COL.faint);
      label(ctx, x0 - halfB + 10, yRef + sweepPx - cTip * scale - 16, 'Lambda = ' + fmt(cSw.get(), 1) + ' deg', COL.c4, 'left', 'bottom', FONT_S);
      label(ctx, x0 - halfB + 4, yRef + sweepPx + 30, 'lambda = ' + fmt(lam, 2), COL.faint, 'left', 'bottom', FONT_S);

      var fx = w * 0.8, fy = h * 0.3, fs = Math.min(h * 0.28, w * 0.12);
      line(ctx, [[fx, fy], [fx, fy + fs]], COL.faint, 1.5);
      line(ctx, [[fx - fs * 0.6, fy], [fx + fs * 0.6, fy]], COL.faint, 1.5);
      var tipY = fy + Math.tan(diR) * fs;
      line(ctx, [[fx, fy + fs], [fx, tipY]], COL.c1, 3);
      ctx.save();
      ctx.strokeStyle = COL.c2;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(fx, fy + fs, fs * 0.55, -Math.PI / 2, -Math.PI / 2 - diR, diR < 0);
      ctx.stroke();
      ctx.restore();
      label(ctx, fx + fs * 0.62, fy + fs - fs * 0.28, 'Gamma = ' + fmt(cDi.get(), 1), COL.c2, 'left', 'middle', FONT_S);
      var sec = nacaOutline(0.02, 0.4, 0.12, 24);
      var twR = (tw * Math.PI) / 180;
      var cs = Math.cos(twR), sn = Math.sin(twR);
      var secPts = [];
      for (i = 0; i < sec.length; i++) {
        var cx = sec[i][0] * fs * 0.8, cy = sec[i][1] * fs * 0.8;
        secPts.push([fx + cx * cs - cy * sn, tipY + cx * sn + cy * cs]);
      }
      fillPoly(ctx, secPts, COL.c3, 0.9);
      line(ctx, [[fx, tipY], [fx + fs * 0.8, tipY - fs * 0.8 * sn]], COL.faint, 1, [4, 3]);
      label(ctx, fx - fs * 0.95, tipY - 14, 'twist = ' + fmt(tw, 1) + ' deg', COL.c3, 'left', 'bottom', FONT_S);
      label(ctx, fx - fs * 0.95, fy + fs * 0.7, 'front view', COL.faint, 'left', 'top', FONT_S);
      label(ctx, 10, h - 10, 'top view (to scale) and tip section', COL.faint, 'left', 'bottom', FONT_S);
    }

    upd();
  }

  function exp6(host) {
    var p = newCard(host, '۶. پیشران و رانش', 'رانش موتور جت، توان پیشران و بازده پیشران');
    addFormulas(p.body, [
      'T = ṁ(V_e−V_0) + (p_e−p_0)A_e',
      'P = D·V ,  D = qSC_D',
      'η_p = V_0·T/P'
    ]);

    var cMd = PH.control({ label: 'دبی جرمی ṁ', unit: 'kg/s', min: 5, max: 800, step: 5, value: 120, onInput: upd });
    var cV0 = PH.control({ label: 'سرعت ورودی V_0', unit: 'm/s', min: 30, max: 350, step: 1, value: 230, onInput: upd });
    var cVe = PH.control({ label: 'سرعت خروجی V_e', unit: 'm/s', min: 30, max: 600, step: 1, value: 320, onInput: upd });
    var cPe = PH.control({ label: 'فشار خروجی p_e', unit: 'kPa', min: 5, max: 200, step: 1, value: 35, onInput: upd });
    var cP0 = PH.control({ label: 'فشار محیط p_0', unit: 'kPa', min: 5, max: 120, step: 1, value: 25, onInput: upd });
    var cAe = PH.control({ label: 'سطح خروجی A_e', unit: 'm²', min: 0.05, max: 3, step: 0.01, value: 0.83, onInput: upd });
    var cNe = PH.control({ label: 'تعداد موتور', unit: '-', min: 1, max: 4, step: 1, value: 2, onInput: upd });
    var cRho = PH.control({ label: 'چگالی ρ', unit: 'kg/m³', min: 0.05, max: 1.4, step: 0.005, value: 0.3639, onInput: upd });
    var cS = PH.control({ label: 'سطح بال S', unit: 'm²', min: 5, max: 250, step: 0.2, value: 122.6, onInput: upd });
    var cCd = PH.control({ label: 'ضریب پسا C_D', unit: '-', min: 0.005, max: 0.09, step: 0.0005, value: 0.028, onInput: upd });
    var cW = PH.control({ label: 'وزن W', unit: 'N', min: 3000, max: 900000, step: 1000, value: 620000, onInput: upd });
    var cV = PH.control({ label: 'سرعت پرواز V', unit: 'm/s', min: 30, max: 300, step: 1, value: 250, onInput: upd });
    var cType = PH.control({
      label: 'نوع موتور',
      type: 'select',
      options: [
        { value: 'jet', label: 'توربوجت' },
        { value: 'bypass', label: 'بای‌پس توربوفن' },
        { value: 'turboprop', label: 'توربوپراپ' },
        { value: 'piston', label: 'پیستونی' }
      ],
      value: 'bypass',
      onInput: upd
    });
    p.ctl.appendChild(cMd.root);
    p.ctl.appendChild(cV0.root);
    p.ctl.appendChild(cVe.root);
    p.ctl.appendChild(cPe.root);
    p.ctl.appendChild(cP0.root);
    p.ctl.appendChild(cAe.root);
    p.ctl.appendChild(cNe.root);
    p.ctl.appendChild(cRho.root);
    p.ctl.appendChild(cS.root);
    p.ctl.appendChild(cCd.root);
    p.ctl.appendChild(cW.root);
    p.ctl.appendChild(cV.root);
    p.ctl.appendChild(cType.root);

    var badges = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 280);
    var st = { t: 0, type: 'bypass', pe: 0, p0: 0, md: 0 };

    function upd() {
      var md = cMd.get(), v0 = cV0.get(), ve = cVe.get();
      var pe = cPe.get() * 1000, p0 = cP0.get() * 1000, ae = cAe.get();
      var tm = md * (ve - v0);
      var tp = (pe - p0) * ae;
      var t = tm + tp;
      var q = dynPress(cRho.get(), cV.get());
      var d = q * cS.get() * cCd.get();
      var pTot = d * cV.get();
      var pEng = pTot / cNe.get();
      var ep = pEng > 0 ? (t * v0) / pEng : 0;
      var tw = cW.get() > 0 ? (t * cNe.get()) / cW.get() : 0;
      st.t = t;
      st.type = cType.get();
      st.pe = pe;
      st.p0 = p0;
      st.md = md;
      var note = '';
      if (st.type === 'turboprop' || st.type === 'piston') {
        note = 'در موتور پیشانه‌ای جمله فشار ناچیز است و رانش از گشتاور اسپول می‌آید (جمله تکانه).';
      } else if (st.type === 'bypass') {
        note = 'در بای‌پس دبی جرمی هوابیک افزوده از فن، جمله تکانه را تقویت می‌کند.';
      } else {
        note = 'توربوجت: رانش از شتاب داده گاز در نازل، هر دو جمله مؤثرند.';
      }
      ro.update([
        { k: 'جمله تکانه ṁ(V_e−V_0)', v: fmt0(tm), unit: 'N' },
        { k: 'جمله فشار (p_e−p_0)A_e', v: fmt0(tp), unit: 'N' },
        { k: 'رانش هر موتور T', v: fmt0(t), unit: 'N' },
        { k: 'رانش کل', v: fmt0(t * cNe.get()), unit: 'N' },
        { k: 'پسا در پرواز D = qSC_D', v: fmt0(d), unit: 'N' },
        { k: 'توان لازم P = D·V (کل)', v: fmt(pTot / 1000, 1), unit: 'kW' },
        { k: 'توان لازم هر موتور', v: fmt(pEng / 1000, 1), unit: 'kW' },
        { k: 'بازده پیشران η_p = V_0 T/P', v: fmt(ep, 3), unit: '-' },
        { k: 'نسبت رانش کل T/W', v: fmt(tw, 4), unit: '-' },
        { k: 'نوع موتور انتخابی', v: engineLabel(st.type), unit: '' },
        { k: 'سهم جمله تکانه از رانش', v: fmt(t !== 0 ? (tm / t) * 100 : 0, 1), unit: '%' },
        { k: 'سهم جمله فشار از رانش', v: fmt(t !== 0 ? (tp / t) * 100 : 0, 1), unit: '%' }
      ]);
      setBadges(badges, [
        [note, false],
        ['T = ' + fmt0(t) + ' N per engine, eta_p = ' + fmt(ep, 3), ep < 0.75]
      ]);
      kick();
    }

    function draw(ts) {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      var cy = h * 0.52;
      var i;
      if (st.type === 'turboprop' || st.type === 'piston') {
        var x0 = w * 0.18, x1 = w * 0.62;
        line(ctx, [[x0, cy], [x1, cy]], COL.body, 8);
        line(ctx, [[x0, cy], [x1, cy]], COL.faint, 1);
        ctx.save();
        ctx.translate(x1, cy);
        ctx.rotate((ts || 0) * 0.004);
        for (i = 0; i < 3; i++) {
          ctx.save();
          ctx.rotate((i * 2 * Math.PI) / 3);
          fillPoly(ctx, [[0, -6], [w * 0.16, -3], [w * 0.16, 3], [0, 6]], COL.c3, 0.9);
          ctx.restore();
        }
        dot(ctx, 0, 0, 6, COL.c1);
        ctx.restore();
        dot(ctx, x0, cy, 6, COL.c1);
        var plume = Math.min(w * 0.3, 40 + st.t * 0.004);
        fillPoly(ctx, [[x1, cy - 7], [x1 + plume, cy - 16], [x1 + plume, cy + 16], [x1, cy + 7]], COL.c4, 0.35);
        arrow(ctx, x0 - 30, cy, x0 - 4, cy, COL.flow, 2, 9);
        label(ctx, x0 - 34, cy - 8, 'mdot = ' + fmt(st.md, 0) + ' kg/s', COL.flow, 'right', 'bottom', FONT_S);
        label(ctx, x1 + plume + 8, cy, 'T = ' + fmt0(st.t) + ' N', COL.c4, 'left', 'middle', FONT_S);
        label(ctx, x1 - 10, cy + 22, 'helical slipstream', COL.faint, 'right', 'bottom', FONT_S);
      } else {
        var bx = w * 0.1, ex = w * 0.66;
        var th = h * 0.2;
        line(ctx, [[bx, cy - th], [ex, cy - th * 0.45]], COL.body, 3);
        line(ctx, [[bx, cy + th], [ex, cy + th * 0.45]], COL.body, 3);
        line(ctx, [[bx, cy - th], [bx, cy + th]], COL.body, 3);
        dot(ctx, bx, cy, th * 0.75, COL.panel);
        ctx.save();
        ctx.translate(bx, cy);
        ctx.rotate((ts || 0) * 0.02);
        for (i = 0; i < 8; i++) {
          var aj = (i * Math.PI) / 4;
          line(ctx, [[Math.cos(aj) * th * 0.2, Math.sin(aj) * th * 0.2], [Math.cos(aj) * th * 0.7, Math.sin(aj) * th * 0.7]], COL.c1, 2);
        }
        ctx.restore();
        var fan = bx + w * 0.1;
        line(ctx, [[fan, cy - th], [fan, cy + th]], COL.faint, 1);
        label(ctx, fan + 4, cy - th - 6, 'p0 = ' + fmt(st.p0 / 1000, 1) + ' kPa', COL.faint, 'left', 'bottom', FONT_S);
        var comp = bx + w * 0.28;
        line(ctx, [[comp, cy - th * 0.8], [comp, cy + th * 0.8]], COL.faint, 1);
        label(ctx, comp + 4, cy + th * 0.8 + 4, 'compressor', COL.faint, 'left', 'top', FONT_S);
        var burn = bx + w * 0.4;
        var flick = 1 + 0.12 * Math.sin((ts || 0) * 0.02);
        fillPoly(ctx, [[burn - 6, cy - th * 0.55 * flick], [burn + 16, cy], [burn - 6, cy + th * 0.55 * flick]], COL.c4, 0.7);
        var turb = bx + w * 0.5;
        line(ctx, [[turb, cy - th * 0.7], [turb, cy + th * 0.7]], COL.faint, 1);
        label(ctx, turb + 4, cy - th * 0.7 - 4, 'turbine', COL.faint, 'left', 'bottom', FONT_S);
        var plume = Math.min(w * 0.3, 30 + st.t * 0.003);
        fillPoly(ctx, [[ex, cy - th * 0.45], [ex + plume, cy - th * 0.2], [ex + plume, cy + th * 0.2], [ex, cy + th * 0.45]], COL.c4, 0.4);
        label(ctx, ex + 8, cy - th * 0.45 - 6, 'pe = ' + fmt(st.pe / 1000, 1) + ' kPa', COL.faint, 'left', 'bottom', FONT_S);
        arrow(ctx, bx - 34, cy, bx - 4, cy, COL.flow, 2, 9);
        label(ctx, bx - 38, cy - 8, 'V0, mdot', COL.flow, 'right', 'bottom', FONT_S);
        arrow(ctx, ex + plume + 4, cy, ex + plume + 40, cy, COL.c4, 2, 9);
        label(ctx, ex + plume + 8, cy - 8, 'Ve, T = ' + fmt0(st.t) + ' N', COL.c4, 'left', 'bottom', FONT_S);
        var frac = Math.max(0, Math.min(1, (cAe.get() - 0.05) / 2.95));
        label(ctx, ex, cy + th * 0.6, 'Ae = ' + fmt(cAe.get(), 2) + ' m² (' + fmt(frac * 100, 0) + '%)', COL.faint, 'left', 'top', FONT_S);
      }
      var cap = 'propeller drive schematic';
      if (st.type === 'bypass') { cap = 'turbofan schematic with station pressures'; }
      if (st.type === 'jet') { cap = 'turbojet schematic with station pressures'; }
      label(ctx, 10, 16, cap, COL.text, 'left', 'top', FONT_S);
    }

    addAnim(draw);
    upd();
  }

  function exp7(host) {
    var p = newCard(host, '۷. پروانه (Propeller)', 'نسبت پیشروی، ضریب رانش و توان، بازده و سرعت نوک پره');
    addFormulas(p.body, [
      'V = J·n·D',
      'C_T = T/(ρn²D⁴) ,  C_P = P/(ρn³D⁵)',
      'η = P/(T·V) = C_P/(C_T·J) · η_0 · η_i',
      'K_static = C_T(0)/C_T(J) ,  M_tip = πnD/a'
    ]);

    var cJ = PH.control({ label: 'نسبت پیشروی J', unit: '-', min: 0.2, max: 2.2, step: 0.05, value: 1.2, onInput: upd });
    var cN = PH.control({ label: 'دوران n', unit: 'rpm', min: 300, max: 3000, step: 10, value: 1800, onInput: upd });
    var cD = PH.control({ label: 'قطر پروانه D', unit: 'm', min: 0.6, max: 4.5, step: 0.05, value: 2.5, onInput: upd });
    var cE0 = PH.control({ label: 'بازده مقطع η_0', unit: '-', min: 0.6, max: 0.98, step: 0.01, value: 0.88, onInput: upd });
    var cEi = PH.control({ label: 'بازده القایی η_i', unit: '-', min: 0.6, max: 1, step: 0.01, value: 0.95, onInput: upd });
    var cRho = PH.control({ label: 'چگالی ρ', unit: 'kg/m³', min: 0.05, max: 1.4, step: 0.005, value: 1.225, onInput: upd });
    p.ctl.appendChild(cJ.root);
    p.ctl.appendChild(cN.root);
    p.ctl.appendChild(cD.root);
    p.ctl.appendChild(cE0.root);
    p.ctl.appendChild(cEi.root);
    p.ctl.appendChild(cRho.root);

    var badges = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cv = newCanvas(p.body, 340);
    var st = { j: 1, beta: 0 };

    function upd() {
      var j = cJ.get(), n = cN.get() / 60, d = cD.get();
      var rho = cRho.get();
      var ct = propCT(j);
      var cp = propCP(j);
      var v = j * n * d;
      var t = ct * rho * n * n * Math.pow(d, 4);
      var pw = cp * rho * Math.pow(n, 3) * Math.pow(d, 5);
      var etaCurve = ct * j > 0 ? cp / (ct * j) : 0;
      var eta = etaCurve * cE0.get() * cEi.get();
      var kStatic = propCT(0) / ct;
      var mt = (Math.PI * n * d) / soundAt(0);
      var beta = (Math.atan2(v, Math.PI * n * d) * 180) / Math.PI;
      st.j = j;
      st.beta = beta;
      ro.update([
        { k: 'سرعت پیشروی V = J n D', v: fmt(v, 2), unit: 'm/s' },
        { k: 'ضریب رانش C_T', v: fmt(ct, 4), unit: '-' },
        { k: 'ضریب توان C_P', v: fmt(cp, 4), unit: '-' },
        { k: 'رانش T = C_T ρn²D⁴', v: fmt0(t), unit: 'N' },
        { k: 'توان P = C_P ρn³D⁵', v: fmt(pw / 1000, 1), unit: 'kW' },
        { k: 'بازده هندسی منحنی', v: fmt(etaCurve, 3), unit: '-' },
        { k: 'بازده کل η', v: fmt(eta, 3), unit: '-' },
        { k: 'ضریب رانش ساکن K_static', v: fmt(kStatic, 3), unit: '-' },
        { k: 'سرعت نوک پره', v: fmt(Math.PI * n * d, 1), unit: 'm/s' },
        { k: 'عدد ماخ نوک پره', v: fmt(mt, 3), unit: '-' },
        { k: 'زاویه هندسی پره β', v: fmt(beta, 2), unit: 'deg' }
      ]);
      var regime = 'نزدیک نقطه بهینه';
      if (j < 0.8) { regime = 'کم (رانش زیاد، کارایی پایین)'; }
      if (j > 1.6) { regime = 'زیاد (توان زیاد، رانش کم)'; }
      setBadges(badges, [
        ['J = ' + fmt(j, 2) + ' — نسبت پیشروی ' + regime, false],
        ['C_T = ' + fmt(ct, 3) + ' , C_P = ' + fmt(cp, 3) + ' , eta = ' + fmt(eta, 3) + (mt > 0.9 ? ' , mach tip high' : ''), mt > 0.9]
      ]);
      kick();
    }

    function draw(ts) {
      var s = prep(cv);
      var ctx = s.ctx, w = s.w, h = s.h;
      var cx = w * 0.5, cy = h * 0.54;
      var r = Math.min(w * 0.24, h * 0.36);
      ctx.save();
      ctx.strokeStyle = COL.grid;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      var i;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((ts || 0) * 0.004);
      for (i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate((i * 2 * Math.PI) / 3);
        ctx.save();
        ctx.translate(r * 0.5, 0);
        ctx.rotate((st.beta * Math.PI) / 180);
        fillPoly(ctx, [[-r * 0.5, -r * 0.075], [r * 0.5, -r * 0.045], [r * 0.5, r * 0.045], [-r * 0.5, r * 0.075]], COL.c3, 0.92);
        ctx.restore();
        ctx.restore();
      }
      dot(ctx, 0, 0, r * 0.1, COL.c1);
      ctx.restore();
      line(ctx, [[cx - r * 1.25, cy], [cx + r * 1.25, cy]], COL.flow, 2);
      label(ctx, cx + r * 1.3, cy, 'V', COL.flow, 'left', 'middle', FONT_B);
      ctx.save();
      ctx.strokeStyle = COL.c2;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.16, Math.PI * 0.72, Math.PI * 0.28);
      ctx.stroke();
      ctx.restore();
      fillPoly(ctx, [[cx + r * 1.16, cy - r * 0.16], [cx + r * 1.3, cy], [cx + r * 1.16, cy + r * 0.16]], COL.c2, 1);
      var helix = [];
      for (i = 0; i <= 80; i++) {
        var u = i / 80;
        helix.push([cx - r * 1.2 + u * r * 2.4, cy - Math.sin((u * Math.PI * 2 * st.j) / Math.PI) * 10]);
      }
      line(ctx, helix, COL.c5, 1.6, [5, 4]);
      label(ctx, cx, cy + r * 1.45, 'helical advance, J = ' + fmt(st.j, 2), COL.c5, 'center', 'bottom', FONT_S);
      label(ctx, cx - r * 1.2, cy - r * 1.45, 'blade angle beta = ' + fmt(st.beta, 1) + ' deg', COL.c3, 'left', 'top', FONT_S);
      label(ctx, 10, h - 10, 'propeller disc, three blades, rotation and advance helix', COL.faint, 'left', 'bottom', FONT_S);
    }

    addAnim(draw);
    upd();
  }

  function exp8(host) {
    var p = newCard(host, '۸. سیال، پسا و استال چندحالته', 'پویش عدد رینولدز، افت C_D و C_Lmax و افت منحنی برآ پس از گذار');
    addFormulas(p.body, [
      'C_D = 1.328/√Re + C_D0(Re/10⁶)^(−0.15)',
      'C_Lmax(Re) = C_Lmax,∞·(1 − 45·Re^(−0.35))',
      'C_Lα(Re) = C_Lα·(Re/(Re+4·10⁶))^0.15'
    ]);

    var cV = PH.control({ label: 'سرعت V', unit: 'm/s', min: 5, max: 200, step: 1, value: 60, onInput: upd });
    var cMu = PH.control({ label: 'ویسکوزیته μ', unit: '10⁻⁵ Pa·s', min: 0.5, max: 5, step: 0.01, value: 1.79, onInput: upd });
    var cL = PH.control({ label: 'طول مرجع L', unit: 'm', min: 0.2, max: 10, step: 0.1, value: 2, onInput: upd });
    var cAr = PH.control({ label: 'نسبت منظری AR', unit: '-', min: 3, max: 22, step: 0.1, value: 7.4, onInput: upd });
    var cE = PH.control({ label: 'بازده span e', unit: '-', min: 0.5, max: 1, step: 0.01, value: 0.8, onInput: upd });
    var cCd0 = PH.control({ label: 'پسای مقطع در 10⁶', unit: '-', min: 0.004, max: 0.05, step: 0.0005, value: 0.012, onInput: upd });
    var cClMax = PH.control({ label: 'برآی بیشینه در Re بی‌نهایت', unit: '-', min: 0.8, max: 2.4, step: 0.02, value: 1.6, onInput: upd });
    var cA = PH.control({ label: 'زاویه حمله α', unit: 'deg', min: -6, max: 20, step: 0.1, value: 4, onInput: upd });
    p.ctl.appendChild(cV.root);
    p.ctl.appendChild(cMu.root);
    p.ctl.appendChild(cL.root);
    p.ctl.appendChild(cAr.root);
    p.ctl.appendChild(cE.root);
    p.ctl.appendChild(cCd0.root);
    p.ctl.appendChild(cClMax.root);
    p.ctl.appendChild(cA.root);

    var badges = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cvs = PH.grid(p.body, 2);
    var cvRe = newCanvas(cvs, 340);
    var cvCl = newCanvas(cvs, 340);
    var st = { alpha: 0 };

    function reCrit() { return 5e5; }

    function slopeAt(re) {
      return CL_SLOPE * Math.pow(re / (re + 4e6), 0.15);
    }

    function curveAt(aDeg, re, clMaxInf) {
      var perDeg = (slopeAt(re) * Math.PI) / 180;
      var clMax = clMaxOfRe(re, clMaxInf);
      var aCrit = degPerCl(clMax, slopeAt(re));
      if (aDeg <= aCrit) { return perDeg * aDeg; }
      return clMax - perDeg * 0.55 * (aDeg - aCrit);
    }

    function upd() {
      var mu = cMu.get() * 1e-5;
      var re = (RHO0 * cV.get() * cL.get()) / mu;
      var cd = cdOfRe(re, cCd0.get());
      var clMax = clMaxOfRe(re, cClMax.get());
      var aCrit = degPerCl(clMax, slopeAt(re));
      st.alpha = cA.get();
      var clSel = curveAt(st.alpha, re, cClMax.get());
      ro.update([
        { k: 'عدد رینولدز Re', v: fmt(re), unit: '-' },
        { k: 'رژیم جریان', v: reVerdict(re), unit: '' },
        { k: 'پسای کل C_D (بدون القایی)', v: fmt(cd, 5), unit: '-' },
        { k: 'برآی بیشینه C_Lmax(Re)', v: fmt(clMax, 4), unit: '-' },
        { k: 'افت C_Lmax نسبت به حد بی‌نهایت', v: fmt((1 - clMax / cClMax.get()) * 100, 1), unit: '%' },
        { k: 'شیب برآ C_Lα(Re)', v: fmt(slopeAt(re) / CL_SLOPE, 3), unit: '-' },
        { k: 'زاویه بحرانی α_crit', v: fmt(aCrit, 2), unit: 'deg' },
        { k: 'زاویه حمله انتخابی α', v: fmt(st.alpha, 1), unit: 'deg' },
        { k: 'برآی در زاویه انتخابی C_L(α)', v: fmt(clSel, 4), unit: '-' },
        { k: 'وضعیت نسبت به زاویه بحرانی', v: st.alpha > aCrit ? 'جدا شدن جریان' : 'جریان متصل', unit: '' },
        { k: 'Re بحرانی گذار', v: fmt(reCrit()), unit: '-' },
        { k: 'پسای القایی در C_L = 0.5', v: fmt(induced(0.5, cE.get(), cAr.get()), 5), unit: '-' }
      ]);
      setBadges(badges, [
        [re < reCrit() ? 'گذار روی بال رخ می‌دهد: افت برآی بیشینه' : 'جریان آشفته: ضریب برآ به حالت بی‌نهایت نزدیک', re < reCrit()],
        ['Re = ' + fmt(re) + ' , C_Lmax = ' + fmt(clMax, 3) + ' , C_D = ' + fmt(cd, 5), false]
      ]);
      drawRe(re, clMax, cd);
      drawCl(re, aCrit);
    }

    function drawRe(re, clMax, cd) {
      var s = prep(cvRe);
      var ctx = s.ctx;
      var box = { x: 62, y: 22, w: s.w - 100, h: s.h - 66 };
      var xt = [
        { v: 1e5, label: '1e5' }, { v: 1e6, label: '1e6' }, { v: 1e7, label: '1e7' },
        { v: 1e8, label: '1e8' }, { v: 1e9, label: '1e9' }
      ];
      var cdTop = cdOfRe(1e5, cCd0.get()) * 1.6;
      var yt = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5].filter(function (v) { return v <= cdTop; });
      var ax = plot(ctx, box, [1e5, 1e9], [0, cdTop], xt, yt, 'Re', 'C_D');
      var i;
      var pts = [];
      for (i = 0; i <= 120; i++) {
        var rv = Math.pow(10, 5 + (i * 4) / 120);
        pts.push([ax.X(rv), ax.Y(cdOfRe(rv, cCd0.get()))]);
      }
      line(ctx, pts, COL.c1, 2.2);
      var pts2 = [];
      for (i = 0; i <= 120; i++) {
        var rv2 = Math.pow(10, 5 + (i * 4) / 120);
        pts2.push([ax.X(rv2), ax.Y(clMaxOfRe(rv2, cClMax.get()))]);
      }
      line(ctx, pts2, COL.c2, 2.2, [6, 4]);
      ctx.save();
      ctx.direction = 'ltr';
      ctx.fillStyle = COL.c2;
      ctx.font = FONT_S;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (i = 0; i <= 4; i++) {
        var rv3 = Math.pow(10, 5 + i);
        ctx.fillText(PH.num(clMaxOfRe(rv3, cClMax.get()), 2), box.x + box.w + 6, ax.Y(clMaxOfRe(rv3, cClMax.get())) - 7);
      }
      ctx.restore();
      var xc = ax.X(Math.min(Math.max(re, 1e5), 1e9));
      line(ctx, [[xc, box.y], [xc, box.y + box.h]], COL.faint, 1, [3, 3]);
      dot(ctx, xc, ax.Y(cd), 4, COL.c3);
      dot(ctx, xc, ax.Y(clMax), 4, COL.c4);
      label(ctx, xc + 6, box.y + 4, 'Re = ' + fmt(re), COL.text, 'left', 'top', FONT_S);
      label(ctx, box.x + 4, 12, 'C_D (solid, left axis) and C_Lmax (dashed, right axis)', COL.text, 'left', 'top', FONT_S);
    }

    function drawCl(re, aCrit) {
      var s = prep(cvCl);
      var ctx = s.ctx;
      var clTop = cClMax.get() * 1.2;
      var box = { x: 58, y: 22, w: s.w - 88, h: s.h - 66 };
      var ax = plot(ctx, box, [-6, 20], [-1.2, clTop], [-5, 0, 5, 10, 15, 20], [-1, -0.5, 0, 0.5, 1, 1.5, 2].filter(function (v) { return v <= clTop; }), 'alpha [deg]', 'C_L');
      var i;
      var ref = [];
      for (i = 0; i <= 160; i++) {
        var aa = -6 + (i * 26) / 160;
        ref.push([ax.X(aa), ax.Y(curveAt(aa, 1e9, cClMax.get()))]);
      }
      line(ctx, ref, COL.faint, 1.6, [5, 4]);
      var cur = [];
      for (i = 0; i <= 160; i++) {
        var a2 = -6 + (i * 26) / 160;
        cur.push([ax.X(a2), ax.Y(curveAt(a2, re, cClMax.get()))]);
      }
      line(ctx, cur, COL.c1, 2.2);
      var ac = Math.min(aCrit, 20);
      line(ctx, [[ax.X(ac), box.y], [ax.X(ac), box.y + box.h]], COL.c4, 1.2, [4, 4]);
      dot(ctx, ax.X(ac), ax.Y(clMaxOfRe(re, cClMax.get())), 4.5, COL.c4);
      label(ctx, ax.X(ac) + 6, box.y + box.h - 6, 'a_crit = ' + fmt(ac, 1), COL.c4, 'left', 'bottom', FONT_S);
      var px = ax.X(st.alpha), py = ax.Y(curveAt(st.alpha, re, cClMax.get()));
      dot(ctx, px, py, 4.5, COL.c2);
      ring(ctx, px, py, 9, COL.c2, 1.2);
      label(ctx, px + 8, py - 8, 'C_L = ' + fmt(curveAt(st.alpha, re, cClMax.get()), 3), COL.c2, 'left', 'bottom', FONT_S);
      var xref = ax.X(degPerCl(clMaxOfRe(re, cClMax.get()), slopeAt(1e9)));
      line(ctx, [[xref, box.y], [xref, box.y + box.h]], COL.c3, 1, [2, 4]);
      label(ctx, xref + 4, box.y + 4, 'a_crit at Re = 1e9', COL.c3, 'left', 'top', FONT_S);
      label(ctx, box.x, 12, 'CL-alpha degradation with Reynolds number', COL.text, 'left', 'top', FONT_S);
    }

    upd();
  }

  function exp9(host) {
    var p = newCard(host, '۹. نقشه طراحی (Sizing)', 'پروفایل پرواز، سطح بال لازم، بارگذاری بال، رانش لازم، باند و بودجه جرمی');
    addFormulas(p.body, [
      'V_c = M_c·a(h) ,  S = W/(q_c·C_L)',
      'C_D = C_D0 + C_L²/(πeAR) ,  L/D = C_L/C_D',
      'φ_fuel = 1 − exp(−R·TSFC·g/(V_c·(L/D)))',
      'M_TO = (M_OE + W_payload)/(1 − φ_fuel)',
      'S_TO ≈ (1.15 V_s0)²/(2a) + 60 m ,  V_s0 = √(2W/(ρSC_Lmax))'
    ]);

    var cR = PH.control({ label: 'برد R', unit: 'km', min: 200, max: 12000, step: 100, value: 3000, onInput: upd });
    var cMc = PH.control({ label: 'ماخ کروز M_c', unit: '-', min: 0.3, max: 0.9, step: 0.01, value: 0.78, onInput: upd });
    var cCeil = PH.control({ label: 'سقف پرواز h', unit: 'm', min: 3000, max: 12000, step: 100, value: 11000, onInput: upd });
    var cPay = PH.control({ label: 'بار مفید', unit: 'kg', min: 500, max: 40000, step: 100, value: 15000, onInput: upd });
    var cMe = PH.control({ label: 'جرم خالی M_OE', unit: 'kg', min: 500, max: 80000, step: 500, value: 42000, onInput: upd });
    var cTsfc = PH.control({ label: 'گزینش سوخت ویژه TSFC', unit: '10⁻⁵ kg/(N·s)', min: 0.4, max: 4, step: 0.01, value: 1.84, onInput: upd });
    var cAr = PH.control({ label: 'نسبت منظری AR', unit: '-', min: 4, max: 22, step: 0.1, value: 10, onInput: upd });
    var cCl = PH.control({ label: 'برآی کروز C_L', unit: '-', min: 0.2, max: 1, step: 0.01, value: 0.5, onInput: upd });
    var cCd0 = PH.control({ label: 'پسای پاراژیت C_D0', unit: '-', min: 0.01, max: 0.06, step: 0.0005, value: 0.02, onInput: upd });
    var cE = PH.control({ label: 'بازده span e', unit: '-', min: 0.5, max: 1, step: 0.01, value: 0.8, onInput: upd });
    var cClMax = PH.control({ label: 'برآی بیشینه C_Lmax', unit: '-', min: 1.2, max: 2.8, step: 0.02, value: 2.4, onInput: upd });
    var cNe = PH.control({ label: 'تعداد موتور', unit: '-', min: 1, max: 4, step: 1, value: 2, onInput: upd });
    var cSt = PH.control({ label: 'تعداد مرحله پرواز', unit: '-', min: 1, max: 4, step: 1, value: 1, onInput: upd });
    p.ctl.appendChild(cR.root);
    p.ctl.appendChild(cMc.root);
    p.ctl.appendChild(cCeil.root);
    p.ctl.appendChild(cPay.root);
    p.ctl.appendChild(cMe.root);
    p.ctl.appendChild(cTsfc.root);
    p.ctl.appendChild(cAr.root);
    p.ctl.appendChild(cCl.root);
    p.ctl.appendChild(cCd0.root);
    p.ctl.appendChild(cE.root);
    p.ctl.appendChild(cClMax.root);
    p.ctl.appendChild(cNe.root);
    p.ctl.appendChild(cSt.root);

    var badges = badgeRow(p.body);
    var ro = PH.readout([]);
    p.body.appendChild(ro);
    var cvs = PH.grid(p.body, 2);
    var cvBar = newCanvas(cvs, 340);
    var cvTop = newCanvas(cvs, 340);
    var st = { empty: 1, pay: 1, fuel: 1 };

    function upd() {
      var h = cCeil.get();
      var rho = rhoAt(h);
      var a = soundAt(h);
      var vc = cMc.get() * a;
      var q = dynPress(rho, vc);
      var cd = cCd0.get() + induced(cCl.get(), cE.get(), cAr.get());
      var ld = cCl.get() / cd;
      var phi1 = 1 - Math.exp(-((cR.get() * 1000 * (cTsfc.get() * 1e-5) * G) / (vc * ld)) / cSt.get());
      var phi = 1 - Math.pow(1 - phi1, cSt.get());
      var mto = (cMe.get() + cPay.get()) / Math.max(1 - phi, 0.05);
      var w = mto * G;
      var sArea = w / (q * cCl.get());
      var span = Math.sqrt(cAr.get() * sArea);
      var dcr = w / ld;
      var tEng = dcr / cNe.get();
      var vs0 = Math.sqrt((2 * w) / (RHO0 * sArea * cClMax.get()));
      var sto = (1.15 * vs0 * 1.15 * vs0) / (2 * 1.8) + 60;
      var fuel = mto * phi;
      var length = 0.00042 * mto + 9.5;
      st.empty = cMe.get();
      st.pay = cPay.get();
      st.fuel = fuel;
      ro.update([
        { k: 'چگالی در سقف پرواز', v: fmt(rho, 4), unit: 'kg/m³' },
        { k: 'سرعت صوت a(h)', v: fmt(a, 1), unit: 'm/s' },
        { k: 'سرعت کروز V_c = M_c a', v: fmt(vc, 1), unit: 'm/s' },
        { k: 'فشار دینامیکی کروز q', v: fmt(q, 0), unit: 'Pa' },
        { k: 'پسای کروز C_D', v: fmt(cd, 5), unit: '-' },
        { k: 'بازده کروز L/D', v: fmt(ld, 2), unit: '-' },
        { k: 'سطح بال لازم S', v: fmt(sArea, 1), unit: 'm²' },
        { k: 'بارگذاری بال W/S', v: fmt(w / sArea, 0), unit: 'N/m²' },
        { k: 'بارگذاری بال جرمی', v: fmt(mto / sArea, 1), unit: 'kg/m²' },
        { k: 'دهانه b = √(AR·S)', v: fmt(span, 1), unit: 'm' },
        { k: 'پسای کروز D', v: fmt0(dcr), unit: 'N' },
        { k: 'رانش لازم کل', v: fmt(dcr / 1000, 1), unit: 'kN' },
        { k: 'رانش لازم هر موتور', v: fmt(tEng / 1000, 1), unit: 'kN' },
        { k: 'سرعت استال دریایی V_s0', v: fmt(vs0, 2), unit: 'm/s' },
        { k: 'طول باند تقریبی S_TO', v: fmt(sto, 0), unit: 'm' },
        { k: 'سهم سوخت φ_fuel', v: fmt(phi * 100, 1), unit: '%' },
        { k: 'سهم سوخت هر مرحله φ_stage', v: fmt(phi1 * 100, 2), unit: '%' },
        { k: 'تعداد مرحله پرواز n', v: fmt0(cSt.get()), unit: '-' },
        { k: 'جرم سوخت', v: fmt0(fuel), unit: 'kg' },
        { k: 'جرم کل M_TO', v: fmt0(mto), unit: 'kg' },
        { k: 'سهم جرم خالی', v: fmt((cMe.get() / mto) * 100, 1), unit: '%' }
      ]);
      setBadges(badges, [
        ['L/D کروز = ' + fmt(ld, 1) + ' , S = ' + fmt(sArea, 1) + ' m² , b = ' + fmt(span, 1) + ' m', false],
        ['φ_fuel = ' + fmt(phi * 100, 1) + '% در ' + fmt0(cSt.get()) + ' مرحله', phi > 0.45]
      ]);
      drawBar(mto);
      drawTop(span, length, sArea);
    }

    function drawBar(mto) {
      var s = prep(cvBar);
      var ctx = s.ctx;
      var box = { x: 62, y: 22, w: s.w - 100, h: s.h - 66 };
      var ax = plot(ctx, box, [0, mto * 1.02], [0, 1], [0, mto * 0.25, mto * 0.5, mto * 0.75, mto], [0, 1], 'mass [kg]', 'M_TO');
      var y0 = box.y + box.h * 0.18;
      var bh = box.h * 0.28;
      var segs = [
        { v: st.empty, c: COL.c1, l: 'empty' },
        { v: st.pay, c: COL.c2, l: 'payload' },
        { v: st.fuel, c: COL.c4, l: 'fuel' }
      ];
      var i, x = box.x;
      for (i = 0; i < segs.length; i++) {
        var x2 = ax.X(x + segs[i].v);
        ctx.save();
        ctx.fillStyle = segs[i].c;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, y0, x2 - x, bh);
        ctx.restore();
        if (x2 - x > 44) {
          label(ctx, (x + x2) / 2, y0 + bh / 2, segs[i].l + ' ' + fmt0(segs[i].v), '#0d1420', 'center', 'middle', FONT_S);
        }
        x = x2;
      }
      ctx.save();
      ctx.strokeStyle = COL.axis;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(box.x, y0, box.w, bh);
      ctx.restore();
      var totX = ax.X(mto);
      line(ctx, [[totX, y0 - 12], [totX, y0 + bh + 12]], COL.c3, 2);
      label(ctx, totX, y0 - 16, 'M_TO = ' + fmt0(mto) + ' kg', COL.c3, totX > box.x + box.w * 0.7 ? 'right' : 'left', 'bottom', FONT_S);
      var y1 = y0 + bh * 1.8;
      x = box.x;
      for (i = 0; i < segs.length; i++) {
        var px2 = ax.X(x + segs[i].v);
        ctx.save();
        ctx.fillStyle = segs[i].c;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x, y1, px2 - x, bh);
        ctx.restore();
        label(ctx, (x + px2) / 2, y1 + bh + 14, fmt((segs[i].v / mto) * 100, 1) + '%', COL.text, 'center', 'top', FONT_S);
        x = px2;
      }
      label(ctx, box.x, 12, 'mass budget stacked bar', COL.text, 'left', 'top', FONT_S);
    }

    function drawTop(span, len, area) {
      var s = prep(cvTop);
      var ctx = s.ctx, w = s.w, h = s.h;
      var scale = Math.min((w * 0.78) / Math.max(span, 1), (h * 0.5) / Math.max(len, 1));
      var cx = w * 0.5, cy = h * 0.5;
      var halfB = (span * scale) / 2;
      var fus = len * scale;
      fillPoly(ctx, [[cx - fus * 0.5, cy - fus * 0.035], [cx + fus * 0.34, cy - fus * 0.028], [cx + fus * 0.5, cy], [cx + fus * 0.34, cy + fus * 0.028], [cx - fus * 0.5, cy + fus * 0.035]], COL.body, 0.9);
      fillPoly(ctx, [
        [cx - halfB, cy + fus * 0.02],
        [cx - fus * 0.16, cy],
        [cx - fus * 0.16, cy - fus * 0.09],
        [cx - halfB, cy - fus * 0.05]
      ], COL.c1, 0.85);
      fillPoly(ctx, [
        [cx + halfB, cy + fus * 0.02],
        [cx + fus * 0.16, cy],
        [cx + fus * 0.16, cy - fus * 0.09],
        [cx + halfB, cy - fus * 0.05]
      ], COL.c1, 0.85);
      line(ctx, [[cx - halfB, cy + fus * 0.02], [cx - fus * 0.16, cy], [cx + fus * 0.16, cy], [cx + halfB, cy + fus * 0.02]], COL.c4, 2.2);
      fillPoly(ctx, [[cx - fus * 0.3, cy - fus * 0.03], [cx - fus * 0.24, cy - fus * 0.03], [cx - fus * 0.26, cy - fus * 0.085]], COL.c3, 0.9);
      fillPoly(ctx, [[cx - fus * 0.1, cy - fus * 0.03], [cx - fus * 0.04, cy - fus * 0.03], [cx - fus * 0.06, cy - fus * 0.085]], COL.c3, 0.9);
      fillPoly(ctx, [[cx + fus * 0.05, cy - fus * 0.03], [cx + fus * 0.11, cy - fus * 0.03], [cx + fus * 0.09, cy - fus * 0.085]], COL.c3, 0.9);
      fillPoly(ctx, [[cx + fus * 0.25, cy - fus * 0.03], [cx + fus * 0.31, cy - fus * 0.03], [cx + fus * 0.29, cy - fus * 0.085]], COL.c3, 0.9);
      dimLine(ctx, cx - halfB, cy - fus * 0.14, cx + halfB, cy - fus * 0.14, 'b = ' + fmt(span, 1) + ' m', COL.faint);
      dimLine(ctx, cx - fus * 0.5, cy + fus * 0.12, cx + fus * 0.5, cy + fus * 0.12, 'length = ' + fmt(len, 1) + ' m', COL.faint);
      label(ctx, cx, cy + fus * 0.2, 'S = ' + fmt(area, 1) + ' m² , AR = ' + fmt(cAr.get(), 1) + ' , engines = ' + fmt0(cNe.get()), COL.text, 'center', 'top', FONT_S);
      label(ctx, 10, 16, 'sized aircraft top view (to scale)', COL.text, 'left', 'top', FONT_S);
      label(ctx, 10, h - 10, 'length estimated from mass budget', COL.faint, 'left', 'bottom', FONT_S);
    }

    upd();
  }

  function build(host) {
    resetAnim(host);
    var wrap = PH.grid(host, 1);
    exp1(wrap);
    exp2(wrap);
    exp3(wrap);
    exp4(wrap);
    exp5(wrap);
    exp6(wrap);
    exp7(wrap);
    exp8(wrap);
    exp9(wrap);
  }

  PH.register('aerodynamics', {
    title: 'آیرودینامیک و طراحی هواپیما',
    subtitle: 'میدان‌های پایه سیال، برآ و پسا، استال، پیشران، پروانه و نقشه طراحی',
    build: build
  });
}());

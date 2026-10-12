(function (global) {
  'use strict';

  var G = 9.81;
  var TH = global.PH.theme;
  var PERIOD = 4200;

  function gv(c) {
    var v = c.get();
    return v === null || v === undefined ? 0 : v;
  }

  function lerp(a, b, f) {
    return a + (b - a) * f;
  }

  function cap(v, m) {
    var a = Math.abs(v);
    return a > m ? (v < 0 ? -m : m) : v;
  }

  function ring(x, y, r, n) {
    var pts = [], i, t;
    for (i = 0; i < n; i++) {
      t = i * 6.283185307179586 / n;
      pts.push([x + r * Math.cos(t), y + r * Math.sin(t)]);
    }
    return pts;
  }

  function box(x, y, w, h) {
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  }

  function loop(host, frame) {
    var raf = 0;
    function tick() {
      raf = 0;
      if (!host.isConnected) return;
      if (!document.hidden && host.getClientRects().length > 0) frame();
      raf = global.requestAnimationFrame(tick);
    }
    raf = global.requestAnimationFrame(tick);
    return function stop() {
      if (raf) {
        global.cancelAnimationFrame(raf);
        raf = 0;
      }
    };
  }

  function makeCard(host, title, subtitle, formula, cols, height) {
    var card = PH.panel(title, subtitle);
    host.appendChild(card);
    var body = card.body;
    body.appendChild(PH.el('div', { class: 'ph-formula', text: formula }));
    var grid = PH.grid(body, cols);
    var readout = PH.readout([]);
    body.appendChild(readout);
    var C = PH.canvas(body, { height: height });
    return { body: body, grid: grid, readout: readout, C: C };
  }

  function expConstAccel(host, stops) {
    var s = makeCard(
      host,
      '۱. حرکت با شتاب ثابت',
      'جابه‌جایی، سرعت و شتاب یکنواخت روی ریل افقی',
      'x = v₀·t + ½·a·t²      v = v₀ + a·t      v² = v₀² + 2·a·x',
      3, 280
    );

    var ph = 0.35;

    var cV0 = PH.control({ label: 'سرعت اولیه v₀', unit: 'm/s', min: 0, max: 30, step: 0.5, value: 10, digits: 1, onInput: redraw });
    var cA = PH.control({ label: 'شتاب a', unit: 'm/s²', min: -10, max: 10, step: 0.5, value: 2, digits: 1, onInput: redraw });
    var cT = PH.control({ label: 'زمان t', unit: 's', min: 0.5, max: 10, step: 0.5, value: 4, digits: 1, onInput: redraw });
    s.grid.appendChild(cV0.root);
    s.grid.appendChild(cA.root);
    s.grid.appendChild(cT.root);

    function travel(v0, a, t) {
      if (Math.abs(a) < 1e-9) return Math.abs(v0 * t);
      var tc = -2 * v0 / a;
      var tt = (tc > 0 && tc < t) ? tc : t;
      var xc = v0 * tt + 0.5 * a * tt * tt;
      var xt = v0 * t + 0.5 * a * t * t;
      return Math.abs(xc) + Math.abs(xt - xc);
    }

    function update() {
      var v0 = gv(cV0), a = gv(cA), t = gv(cT);
      var x = v0 * t + 0.5 * a * t * t;
      var v = v0 + a * t;
      s.readout.update([
        { k: 'جابه‌جایی x', v: x, unit: 'm', kind: 'accent' },
        { k: 'سرعت نهایی v', v: v, unit: 'm/s', kind: 'accent' },
        { k: 'سرعت متوسط (v₀+v)/2', v: (v0 + v) / 2, unit: 'm/s' },
        { k: 'شتاب متوسط (Δv/Δt)', v: (v - v0) / t, unit: 'm/s²' },
        { k: 'مسافت طی‌شده', v: travel(v0, a, t), unit: 'm' },
        { k: 'بررسی √(v₀² + 2ax)', v: Math.sqrt(v0 * v0 + 2 * a * x), unit: 'm/s', kind: 'good' }
      ]);
    }

    function draw() {
      var C = s.C;
      var d = C.resize();
      var W = d.w, H = d.h;
      C.clear(W, H);
      C.grid({ step: 32, axes: false });

      var v0 = gv(cV0), a = gv(cA), T = gv(cT);
      var baseY = H - 34;
      var N = 60, i, tt, xv, xmin = Infinity, xmax = -Infinity;
      for (i = 0; i <= N; i++) {
        tt = T * i / N;
        xv = v0 * tt + 0.5 * a * tt * tt;
        if (xv < xmin) xmin = xv;
        if (xv > xmax) xmax = xv;
      }
      var span = Math.max(xmax - xmin, 1);
      var pad = span * 0.08 + 0.4;
      xmin -= pad;
      xmax += pad;
      var L = 40, Rr = W - 24;
      var sc = (Rr - L) / (xmax - xmin);
      function px(xm) { return L + (xm - xmin) * sc; }

      C.line(L, baseY, Rr, baseY, { color: TH.axis, width: 2 });
      var stepm = span > 60 ? 20 : span > 30 ? 10 : span > 12 ? 5 : span > 4 ? 2 : 1;
      var start = Math.ceil(xmin / stepm) * stepm;
      for (xv = start; xv <= xmax; xv += stepm) {
        C.line(px(xv), baseY, px(xv), baseY + 6, { color: TH.axis, width: 1 });
        C.text(PH.num(xv, 0), px(xv), baseY + 21, { align: 'center', size: 11, rtl: false, color: TH.muted });
      }
      C.text('x (m)', Rr - 2, baseY + 21, { align: 'right', size: 11, rtl: false, color: TH.muted });

      var tb = ph * T;
      var xb = v0 * tb + 0.5 * a * tb * tb;
      var vb = v0 + a * tb;
      var xf = px(xb);
      var x0 = px(0);

      C.line(x0, baseY, xf, baseY, { color: TH.accent, width: 3 });
      C.line(x0, baseY - 22, x0, baseY - 34, { color: TH.muted, width: 1, dash: [3, 3] });
      C.text('x = 0', x0, baseY - 40, { align: 'center', size: 11, rtl: false, color: TH.muted });

      C.circle(xf, baseY - 10, 10, { fill: TH.accent, stroke: TH.text, width: 1 });

      var vy = cap(vb * 2.4, 58);
      if (Math.abs(vy) > 2) {
        C.arrow(xf, baseY - 24, xf, baseY - 24 - vy, { color: TH.good, width: 3, head: 9 });
      }
      C.text('v = ' + PH.num(vb, 2) + ' m/s', xf + 14, baseY - 30, { size: 12, rtl: false, color: TH.good });
      C.text('t = ' + PH.num(tb, 2) + ' s', xf + 14, baseY - 48, { size: 11, rtl: false, color: TH.muted });
      C.text('a = ' + PH.num(a, 2) + ' m/s²', L, 20, { size: 12, rtl: false, color: TH.accent2 });
    }

    function redraw() {
      update();
      draw();
    }

    function frame(now) {
      ph = (now % PERIOD) / PERIOD;
      draw();
    }

    redraw();
    stops.push(loop(host, frame));
  }

  function expProjectile(host, stops) {
    var s = makeCard(
      host,
      '۲. پرتابه',
      'حرکت پرتابه با مقاومت هوا ناچیز',
      'R = v₀·cosθ·t      H = h₀ + (v₀·sinθ)²/(2g)      t = (v₀·sinθ + √((v₀·sinθ)² + 2g·h₀)) / g',
      3, 340
    );

    var ph = 0.3;

    var cV0 = PH.control({ label: 'سرعت پرتاب v₀', unit: 'm/s', min: 5, max: 60, step: 1, value: 20, digits: 1, onInput: redraw });
    var cTh = PH.control({ label: 'زاویهٔ پرتاب θ', unit: '°', min: 0, max: 90, step: 1, value: 45, digits: 0, onInput: redraw });
    var cH0 = PH.control({ label: 'ارتفاع پرتاب h₀', unit: 'm', min: 0, max: 20, step: 0.5, value: 0, digits: 1, onInput: redraw });
    s.grid.appendChild(cV0.root);
    s.grid.appendChild(cTh.root);
    s.grid.appendChild(cH0.root);

    function update() {
      var v0 = gv(cV0), th = gv(cTh) * Math.PI / 180, h0 = gv(cH0);
      var u = v0 * Math.sin(th);
      var w = v0 * Math.cos(th);
      var tf = (u + Math.sqrt(u * u + 2 * G * h0)) / G;
      var R = w * tf;
      var H = h0 + u * u / (2 * G);
      var viy = u - G * tf;
      s.readout.update([
        { k: 'برد افقی R', v: R, unit: 'm', kind: 'accent' },
        { k: 'بیشینهٔ ارتفاع از زمین H', v: H, unit: 'm', kind: 'accent' },
        { k: 'زمان پرواز t', v: tf, unit: 's' },
        { k: 'مؤلفهٔ افقی برخورد vx', v: w, unit: 'm/s' },
        { k: 'مؤلفهٔ عمودی برخورد vy', v: viy, unit: 'm/s' },
        { k: 'سرعت برخورد |v|', v: Math.sqrt(w * w + viy * viy), unit: 'm/s', kind: 'warn' },
        { k: 'بیشینهٔ سرعت در اوج', v: Math.sqrt(v0 * v0 + 2 * G * h0), unit: 'm/s' }
      ]);
    }

    function draw() {
      var C = s.C;
      var d = C.resize();
      var W = d.w, H = d.h;
      C.clear(W, H);

      var v0 = gv(cV0), th = gv(cTh) * Math.PI / 180, h0 = gv(cH0);
      var u = v0 * Math.sin(th);
      var w = v0 * Math.cos(th);
      var tf = (u + Math.sqrt(u * u + 2 * G * h0)) / G;
      var R = w * tf;
      var Hmax = h0 + u * u / (2 * G);

      var groundY = H - 44;
      var x0 = 44;
      var xr = Math.max(R, 1);
      var yr = Math.max(Hmax, h0, 1);
      var sc = Math.min((W - x0 - 40) / (xr * 1.08), (groundY - 46) / (yr * 1.12));
      function px(xm) { return x0 + xm * sc; }
      function py(ym) { return groundY - ym * sc; }

      C.grid({ step: 36, axes: false });

      C.line(x0 - 12, 30, x0 - 12, groundY, { color: TH.axis, width: 1.5 });
      C.line(x0 - 12, groundY, W - 16, groundY, { color: TH.axis, width: 2 });
      for (var gt = 0; gt <= 12; gt++) {
        var gxp = x0 + (W - x0 - 34) * gt / 12;
        C.line(gxp, groundY, gxp, groundY + 6, { color: TH.axis, width: 1 });
      }
      var gy = 0;
      var gstep = yr > 20 ? 5 : 1;
      while (gy < yr) {
        gy += gstep;
        if (gy > yr) break;
        C.line(x0 - 18, py(gy), x0 - 12, py(gy), { color: TH.axis, width: 1 });
        C.text(PH.num(gy, 0), x0 - 22, py(gy) + 4, { align: 'right', size: 11, rtl: false, color: TH.muted });
      }
      C.text('x', W - 18, groundY + 22, { align: 'right', size: 12, rtl: false, color: TH.muted });
      C.text('y', x0 - 26, 26, { align: 'center', size: 12, rtl: false, color: TH.muted });

      var i, tb, path = [];
      var M = 90;
      for (i = 0; i <= M; i++) {
        tb = tf * i / M;
        path.push([px(w * tb), py(Math.max(0, h0 + u * tb - 0.5 * G * tb * tb))]);
      }
      C.poly(path, { stroke: TH.accent, width: 2, close: false });

      C.circle(px(0), py(h0), 7, { fill: TH.accent2 });

      var tAp = u / G;
      var apX = px(w * tAp), apY = py(Hmax);
      if (u > 0.01) {
        C.line(apX, apY, apX, groundY, { color: TH.violet, width: 1, dash: [4, 4] });
        C.circle(apX, apY, 5, { fill: TH.violet });
        C.text('اوج ' + PH.num(Hmax, 2) + ' m', apX, apY - 12, { align: 'center', size: 11, color: TH.violet });
      }

      var tb2 = ph * tf;
      var bxp = px(w * tb2);
      var byp = py(Math.max(0, h0 + u * tb2 - 0.5 * G * tb2 * tb2));
      C.circle(bxp, byp, 8, { fill: TH.good, stroke: TH.text, width: 1 });
      C.line(bxp, byp, px(R), byp, { color: TH.muted, width: 1, dash: [3, 3] });
      C.text('t = ' + PH.num(tb2, 2) + ' s', bxp + 12, byp - 12, { size: 11, rtl: false, color: TH.good });
      C.line(px(0), py(0), px(R), py(0), { color: TH.good, width: 2 });
      C.text('R = ' + PH.num(R, 2) + ' m', px(R) - 4, py(0) - 10, { align: 'right', size: 12, rtl: false, color: TH.good });
    }

    function redraw() {
      update();
      draw();
    }

    function frame(now) {
      ph = (now % PERIOD) / PERIOD;
      draw();
    }

    redraw();
    stops.push(loop(host, frame));
  }

  function expNewton(host, stops) {
    var s = makeCard(
      host,
      '۳. قوانین نیوتن و نیروی خالص',
      'شتاب دوم نیوتن روی سطح بدون اصطکاک',
      'ΣF = F₁ − F₂      a = ΣF / m      v = a·t      x = ½·a·t²',
      4, 280
    );

    var ph = 0.2;

    var cM = PH.control({ label: 'جرم m', unit: 'kg', min: 1, max: 50, step: 1, value: 10, digits: 1, onInput: redraw });
    var cF1 = PH.control({ label: 'نیروی محرک F₁', unit: 'N', min: 0, max: 200, step: 5, value: 60, digits: 0, onInput: redraw });
    var cF2 = PH.control({ label: 'نیروی مقاوم F₂', unit: 'N', min: 0, max: 200, step: 5, value: 20, digits: 0, onInput: redraw });
    var cT = PH.control({ label: 'زمان t', unit: 's', min: 0.5, max: 10, step: 0.5, value: 3, digits: 1, onInput: redraw });
    s.grid.appendChild(cM.root);
    s.grid.appendChild(cF1.root);
    s.grid.appendChild(cF2.root);
    s.grid.appendChild(cT.root);

    function update() {
      var m = gv(cM), f1 = gv(cF1), f2 = gv(cF2), t = gv(cT);
      var net = f1 - f2;
      var a = net / m;
      s.readout.update([
        { k: 'نیروی خالص ΣF', v: net, unit: 'N', kind: 'accent' },
        { k: 'شتاب a = ΣF/m', v: a, unit: 'm/s²', kind: 'accent' },
        { k: 'سرعت پس از t', v: a * t, unit: 'm/s' },
        { k: 'جابه‌جایی پس از t', v: 0.5 * a * t * t, unit: 'm' },
        { k: 'بررسی F = m·a', v: m * a, unit: 'N', kind: 'good' },
        { k: 'جهت شتاب', v: net > 0 ? 'رو به جلو (+x)' : (net < 0 ? 'رو به عقب (−x)' : 'بدون حرکت') }
      ]);
    }

    function draw() {
      var C = s.C;
      var d = C.resize();
      var W = d.w, H = d.h;
      C.clear(W, H);
      C.grid({ step: 32, axes: false });

      var m = gv(cM), f1 = gv(cF1), f2 = gv(cF2), T = gv(cT);
      var net = f1 - f2;
      var a = net / m;
      var surfY = H - 76;
      var bw = 62, bh = 40;

      C.line(20, surfY, W - 20, surfY, { color: TH.axis, width: 2 });
      for (var gx = 26; gx < W - 20; gx += 14) {
        C.line(gx, surfY, gx - 9, surfY + 9, { color: TH.axis, width: 1 });
      }

      var xmax = Math.max(0.5 * Math.abs(a) * T * T, 1);
      var sc = Math.min((W / 2 - 90) / xmax, 14);
      var tb = ph * T;
      var disp = 0.5 * a * tb * tb;
      var cx = W / 2 + disp * sc;

      C.poly(box(cx - bw / 2, surfY - bh, bw, bh), { fill: TH.accent, stroke: TH.text, width: 1.5 });
      C.text('m = ' + PH.num(m, 1) + ' kg', cx, surfY - bh / 2 + 5, { align: 'center', size: 13, weight: '700', rtl: false, color: '#06121c' });

      var l1 = 24 + cap(f1 * 0.55, 96);
      var l2 = 24 + cap(f2 * 0.55, 96);
      C.arrow(cx, surfY - bh - 34, cx + l1, surfY - bh - 34, { color: TH.good, width: 3 });
      C.text('F₁ = ' + PH.num(f1, 0) + ' N', cx + l1 + 8, surfY - bh - 30, { size: 12, rtl: false, color: TH.good });
      C.arrow(cx, surfY - bh - 62, cx - l2, surfY - bh - 62, { color: TH.bad, width: 3 });
      C.text('F₂ = ' + PH.num(f2, 0) + ' N', cx - l2 - 8, surfY - bh - 58, { align: 'right', size: 12, rtl: false, color: TH.bad });
      C.arrow(cx, surfY - bh - 6, cx, surfY - bh - 6 + 26, { color: TH.accent2, width: 2.5 });
      C.text('W = ' + PH.num(m * G, 1) + ' N', cx + 10, surfY - bh + 8, { size: 11, rtl: false, color: TH.accent2 });

      var barY = H - 34;
      var barX = 40;
      var barMax = W - barX - 90;
      C.text('a', barX - 8, barY + 12, { align: 'right', size: 12, rtl: false, color: TH.muted });
      C.line(barX, barY, barX + barMax, barY, { color: TH.border, width: 8 });
      var barLen = barMax * Math.min(Math.abs(a) / 12, 1);
      if (barLen > 1) {
        C.line(barX, barY, barX + barLen, barY, { color: a >= 0 ? TH.accent : TH.bad, width: 8 });
      }
      C.text('a = ' + PH.num(a, 2) + ' m/s²', barX + barMax + 10, barY + 5, { size: 12, rtl: false, color: TH.text });
      C.text('v(t) = ' + PH.num(a * tb, 2) + ' m/s', barX, barY + 26, { size: 11, rtl: false, color: TH.muted });
      C.text('x(t) = ' + PH.num(disp, 2) + ' m', barX + 140, barY + 26, { size: 11, rtl: false, color: TH.muted });
    }

    function redraw() {
      update();
      draw();
    }

    function frame(now) {
      ph = (now % PERIOD) / PERIOD;
      draw();
    }

    redraw();
    stops.push(loop(host, frame));
  }

  function expIncline(host, stops) {
    var s = makeCard(
      host,
      '۴. شیب‌دار با اصطکاک',
      'تجزیهٔ نیروی وزن روی سطح شیبدار',
      'W = m·g      W∥ = m·g·sinθ      N = m·g·cosθ      f = μ·N      a = g·(sinθ − μ·cosθ)',
      3, 340
    );

    var ph = 0.15;

    var cTh = PH.control({ label: 'زاویهٔ شیب θ', unit: '°', min: 0, max: 80, step: 1, value: 30, digits: 0, onInput: redraw });
    var cMu = PH.control({ label: 'ضریب اصطکاک μ', unit: '', min: 0, max: 1.5, step: 0.05, value: 0.2, digits: 2, onInput: redraw });
    var cM = PH.control({ label: 'جرم m', unit: 'kg', min: 0.5, max: 50, step: 0.5, value: 20, digits: 1, onInput: redraw });
    s.grid.appendChild(cTh.root);
    s.grid.appendChild(cMu.root);
    s.grid.appendChild(cM.root);

    function update() {
      var th = gv(cTh) * Math.PI / 180, mu = gv(cMu), m = gv(cM);
      var W = m * G;
      var par = W * Math.sin(th);
      var nor = W * Math.cos(th);
      var fr = mu * nor;
      var net = par - fr;
      var a = net / m;
      var moves = net > 0.01;
      s.readout.update([
        { k: 'وزن W = m·g', v: W, unit: 'N' },
        { k: 'مؤلفهٔ موازی شیب W∥', v: par, unit: 'N', kind: 'accent' },
        { k: 'نیروی نرمال N', v: nor, unit: 'N' },
        { k: 'نیروی اصطکاک f = μN', v: fr, unit: 'N' },
        { k: 'نیروی خالص موازی شیب', v: net, unit: 'N', kind: moves ? 'good' : 'warn' },
        { k: 'شتاب a', v: moves ? a : 0, unit: 'm/s²', kind: 'accent' },
        { k: 'وضعیت', v: moves ? 'لغزش به سمت پایین شیب' : 'بدون حرکت (ساکن)', kind: moves ? 'bad' : 'good' }
      ]);
    }

    function draw() {
      var C = s.C;
      var d = C.resize();
      var W = d.w, H = d.h;
      C.clear(W, H);
      C.grid({ step: 36, axes: false });

      var th = gv(cTh) * Math.PI / 180, mu = gv(cMu), m = gv(cM);
      var par = m * G * Math.sin(th);
      var nor = m * G * Math.cos(th);
      var fr = mu * nor;
      var net = par - fr;
      var moves = net > 0.01;

      var baseY = H - 44;
      var x0 = 56;
      var sl = Math.min(300, W - x0 - 90);
      var ct = Math.cos(th), st = Math.sin(th);
      var topX = x0 + sl * ct;
      var topY = baseY - sl * st;

      C.line(x0 - 26, baseY, W - 30, baseY, { color: TH.axis, width: 2 });
      for (var gx = x0 - 20; gx < W - 30; gx += 14) {
        C.line(gx, baseY, gx - 9, baseY + 9, { color: TH.axis, width: 1 });
      }
      C.poly([[x0 - 26, baseY], [topX, topY], [x0 - 26, baseY]], { fill: 'rgba(76,194,255,0.10)', stroke: TH.accent, width: 2 });
      C.text('θ = ' + PH.num(gv(cTh), 0) + '°', x0 + 26, baseY - 16, { align: 'center', size: 13, rtl: false, color: TH.accent });

      var dAlong = 0;
      if (moves) {
        dAlong = Math.min(0.5 * (net / m) * Math.pow(ph, 2) * 8, sl * 0.86);
      }
      var bx = topX - dAlong * ct + st * 5;
      var by = topY + dAlong * st - ct * 5;
      var bwid = 38, bhei = 26;

      C.poly(box(bx - bwid / 2, by - bhei / 2, bwid, bhei), { fill: TH.accent2, stroke: TH.text, width: 1.5 });
      C.text(PH.num(m, 1) + ' kg', bx, by + 5, { align: 'center', size: 11, weight: '700', rtl: false, color: '#1a1206' });

      C.arrow(bx, by - bhei / 2 - 6, bx, by - bhei / 2 - 6 + 42, { color: TH.bad, width: 2.5 });
      C.text('W = ' + PH.num(m * G, 1) + ' N', bx + 8, by + 30, { size: 11, rtl: false, color: TH.bad });

      var lp = 14 + cap(par * 0.3, 46);
      C.arrow(bx, by + bhei / 2 + 10, bx - lp * ct, by + bhei / 2 + 10 + lp * st, { color: TH.good, width: 2.5 });
      C.text('W∥ = ' + PH.num(par, 1) + ' N', bx - lp * ct + 6, by + bhei / 2 + 14 + lp * st, { size: 11, rtl: false, color: TH.good });

      var lf = 14 + cap(fr * 0.3, 46);
      C.arrow(bx, by + bhei / 2 + 26, bx + lf * ct, by + bhei / 2 + 26 - lf * st, { color: TH.warn, width: 2.5 });
      C.text('f = ' + PH.num(fr, 1) + ' N', bx + lf * ct + 6, by + bhei / 2 + 22 - lf * st, { size: 11, rtl: false, color: TH.warn });

      var ln = 14 + cap(nor * 0.3, 46);
      C.arrow(bx, by, bx - ln * st, by - ln * ct, { color: TH.violet, width: 2.5 });
      C.text('N = ' + PH.num(nor, 1) + ' N', bx - ln * st - 8, by - ln * ct, { align: 'right', size: 11, rtl: false, color: TH.violet });

      C.text('a = ' + PH.num(moves ? net / m : 0, 2) + ' m/s²', W - 34, 24, { align: 'right', size: 13, rtl: false, color: moves ? TH.good : TH.warn });
      C.text(moves ? 'لغزش' : 'ساکن', W - 34, 44, { align: 'right', size: 12, color: moves ? TH.bad : TH.good });
    }

    function redraw() {
      update();
      draw();
    }

    function frame(now) {
      ph = (now % PERIOD) / PERIOD;
      draw();
    }

    redraw();
    stops.push(loop(host, frame));
  }

  function expWorkEnergy(host, stops) {
    var s = makeCard(
      host,
      '۵. کار و انرژی',
      'تبدیل انرژی پتانسیل به جنبشی در سقوط آزاد',
      'U = m·g·h      K₀ = ½·m·v₀²      E = K + U = ثابت      W_خالص = ΔK = m·g·h',
      3, 340
    );

    var ph = 0.1;

    var cM = PH.control({ label: 'جرم m', unit: 'kg', min: 0.5, max: 20, step: 0.5, value: 4, digits: 1, onInput: redraw });
    var cH = PH.control({ label: 'ارتفاع h', unit: 'm', min: 0, max: 50, step: 0.5, value: 15, digits: 1, onInput: redraw });
    var cV0 = PH.control({ label: 'سرعت اولیه v₀', unit: 'm/s', min: 0, max: 30, step: 0.5, value: 3, digits: 1, onInput: redraw });
    s.grid.appendChild(cM.root);
    s.grid.appendChild(cH.root);
    s.grid.appendChild(cV0.root);

    function update() {
      var m = gv(cM), h = gv(cH), v0 = gv(cV0);
      var U = m * G * h;
      var K0 = 0.5 * m * v0 * v0;
      var E = K0 + U;
      var vb = Math.sqrt(v0 * v0 + 2 * G * h);
      s.readout.update([
        { k: 'انرژی پتانسیل U = mgh', v: U, unit: 'J', kind: 'accent' },
        { k: 'انرژی جنبشی اولیه K₀', v: K0, unit: 'J', kind: 'accent' },
        { k: 'انرژی مکانیکی E = K + U', v: E, unit: 'J', kind: 'good' },
        { k: 'کار نیروی خالص W = ΔK', v: m * G * h, unit: 'J' },
        { k: 'سرعت در پایین v', v: vb, unit: 'm/s' },
        { k: 'انرژی جنبشی در پایین', v: 0.5 * m * vb * vb, unit: 'J', kind: 'warn' }
      ]);
    }

    function draw() {
      var C = s.C;
      var d = C.resize();
      var W = d.w, H = d.h;
      C.clear(W, H);
      C.grid({ step: 36, axes: false });

      var m = gv(cM), h = gv(cH), v0 = gv(cV0);
      var U = m * G * h;
      var K0 = 0.5 * m * v0 * v0;
      var E = K0 + U;
      var dropT = (Math.sqrt(v0 * v0 + 2 * G * h) - v0) / G;

      var groundY = H - 92;
      var topY = 46;
      var scY = (groundY - topY) / 50;
      function py(ym) { return groundY - ym * scY; }

      C.line(40, groundY, W - 24, groundY, { color: TH.axis, width: 2 });
      for (var gx = 46; gx < W - 24; gx += 14) {
        C.line(gx, groundY, gx - 9, groundY + 9, { color: TH.axis, width: 1 });
      }

      C.line(26, groundY, 26, py(50), { color: TH.muted, width: 1 });
      for (var my = 0; my <= 50; my += 10) {
        C.line(20, py(my), 26, py(my), { color: TH.muted, width: 1 });
        C.text(PH.num(my, 0), 18, py(my) + 4, { align: 'right', size: 10, rtl: false, color: TH.muted });
      }
      C.text('m', 26, py(50) - 8, { align: 'center', size: 11, rtl: false, color: TH.muted });

      C.line(40, py(h), W - 24, py(h), { color: TH.accent2, width: 1.5, dash: [6, 4] });
      C.text('h = ' + PH.num(h, 1) + ' m', W - 28, py(h) - 8, { align: 'right', size: 12, rtl: false, color: TH.accent2 });

      var tb = ph * dropT;
      var fallen = v0 * tb + 0.5 * G * tb * tb;
      var yCur = Math.max(0, h - fallen);
      var vCur = Math.sqrt(v0 * v0 + 2 * G * (h - yCur));
      var kCur = 0.5 * m * vCur * vCur;
      var uCur = m * G * yCur;

      var bx = W * 0.42;
      var by = py(yCur);
      C.poly(box(bx - 22, by - 14, 44, 28), { fill: TH.accent, stroke: TH.text, width: 1.5 });
      C.text(PH.num(m, 1) + ' kg', bx, by + 5, { align: 'center', size: 11, weight: '700', rtl: false, color: '#06121c' });
      C.arrow(bx, by + 18, bx, by + 18 + 16 + vCur * 2, { color: TH.good, width: 2.5 });
      C.text('v = ' + PH.num(vCur, 2) + ' m/s', bx + 10, by + 40, { size: 11, rtl: false, color: TH.good });
      C.text('y = ' + PH.num(yCur, 2) + ' m', bx + 10, by + 56, { size: 11, rtl: false, color: TH.muted });

      var barX = 40, barY = H - 54, barW = W - 90, barH = 22;
      C.line(barX, barY, barX + barW, barY, { color: TH.border, width: 1 });
      var kw = E > 0 ? barW * (kCur / E) : 0;
      var uw = E > 0 ? barW * (uCur / E) : 0;
      if (kw > 0.5) C.poly(box(barX, barY, kw, barH), { fill: TH.good, stroke: TH.text, width: 1 });
      if (uw > 0.5) C.poly(box(barX + kw, barY, uw, barH), { fill: TH.accent2, stroke: TH.text, width: 1 });
      C.text('K = ' + PH.num(kCur, 1) + ' J', barX + 4, barY + 15, { size: 11, rtl: false, color: '#06121c', weight: '700' });
      C.text('U = ' + PH.num(uCur, 1) + ' J', barX + barW - 4, barY - 8, { align: 'right', size: 12, rtl: false, color: TH.accent2 });
      C.text('E = ' + PH.num(E, 1) + ' J', barX + barW + 10, barY + 15, { size: 12, rtl: false, color: TH.text });
    }

    function redraw() {
      update();
      draw();
    }

    function frame(now) {
      ph = (now % PERIOD) / PERIOD;
      draw();
    }

    redraw();
    stops.push(loop(host, frame));
  }

  function expMomentum(host, stops) {
    var s = makeCard(
      host,
      '۶. تکانه و برخورد',
      'پایستگی تکانه در برخورد کشسان و کاملاً ناکشسان',
      'p = m₁v₁ + m₂v₂      v₁′ = ((m₁−m₂)v₁ + 2m₂v₂)/(m₁+m₂)      v′ = p/(m₁+m₂)      ΔK = K_قبل − K_بعد',
      4, 340
    );

    var ph = 0.1;

    var cM1 = PH.control({ label: 'جرم m₁', unit: 'kg', min: 0.5, max: 20, step: 0.5, value: 2, digits: 1, onInput: redraw });
    var cM2 = PH.control({ label: 'جرم m₂', unit: 'kg', min: 0.5, max: 20, step: 0.5, value: 3, digits: 1, onInput: redraw });
    var cV1 = PH.control({ label: 'سرعت v₁', unit: 'm/s', min: -20, max: 20, step: 0.5, value: 5, digits: 1, onInput: redraw });
    var cV2 = PH.control({ label: 'سرعت v₂', unit: 'm/s', min: -20, max: 20, step: 0.5, value: 0, digits: 1, onInput: redraw });
    s.grid.appendChild(cM1.root);
    s.grid.appendChild(cM2.root);
    s.grid.appendChild(cV1.root);
    s.grid.appendChild(cV2.root);

    function update() {
      var m1 = gv(cM1), m2 = gv(cM2), v1 = gv(cV1), v2 = gv(cV2);
      var M = m1 + m2;
      var p = m1 * v1 + m2 * v2;
      var Kb = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;
      var e1 = ((m1 - m2) * v1 + 2 * m2 * v2) / M;
      var e2 = ((m2 - m1) * v2 + 2 * m1 * v1) / M;
      var Ke = 0.5 * m1 * e1 * e1 + 0.5 * m2 * e2 * e2;
      var vi = p / M;
      var Ki = 0.5 * M * vi * vi;
      var loss = Kb - Ki;
      var pct = Kb > 1e-9 ? 100 * loss / Kb : 0;
      s.readout.update([
        { k: 'تکانهٔ کل پیش از برخورد p', v: p, unit: 'kg·m/s', kind: 'accent' },
        { k: 'انرژی جنبشی پیش از برخورد', v: Kb, unit: 'J', kind: 'accent' },
        { k: 'برخورد کشسان: v₁′', v: e1, unit: 'm/s', kind: 'good' },
        { k: 'برخورد کشسان: v₂′', v: e2, unit: 'm/s', kind: 'good' },
        { k: 'تکانهٔ کل پس از برخورد کشسان', v: m1 * e1 + m2 * e2, unit: 'kg·m/s' },
        { k: 'انرژی جنبشی پس از برخورد کشسان', v: Ke, unit: 'J', kind: 'good' },
        { k: 'برخورد کاملاً ناکشسان: v′', v: vi, unit: 'm/s', kind: 'warn' },
        { k: 'انرژی جنبشی پس از برخورد ناکشسان', v: Ki, unit: 'J', kind: 'warn' },
        { k: 'انرژی اتلاف‌شده ΔK', v: loss, unit: 'J', kind: 'bad' },
        { k: 'درصد اتلاف انرژی', v: pct, unit: '%', kind: 'bad' }
      ]);
    }

    function arrowFor(C, x, y, p, maxAbsP, label) {
      var len = 18 + (maxAbsP > 1e-9 ? 74 * Math.min(Math.abs(p) / maxAbsP, 1) : 0);
      var sgn = p < 0 ? -1 : 1;
      C.arrow(x, y, x + sgn * len, y, { color: p < 0 ? TH.bad : TH.good, width: 3 });
      C.text(label, x + sgn * len + sgn * 6, y + 4, { align: sgn < 0 ? 'right' : 'left', size: 11, rtl: false, color: p < 0 ? TH.bad : TH.good });
    }

    function draw() {
      var C = s.C;
      var d = C.resize();
      var W = d.w, H = d.h;
      C.clear(W, H);
      C.grid({ step: 36, axes: false });

      var m1 = gv(cM1), m2 = gv(cM2), v1 = gv(cV1), v2 = gv(cV2);
      var M = m1 + m2;
      var p = m1 * v1 + m2 * v2;
      var e1 = ((m1 - m2) * v1 + 2 * m2 * v2) / M;
      var e2 = ((m2 - m1) * v2 + 2 * m1 * v1) / M;

      var bw = 48, bh = 30;
      var cx = W / 2;
      var reach = Math.min(160, Math.max(70, (W / 2) - 70));
      var trackA = 66, trackB = 202;

      C.text('پیش از برخورد', cx, 26, { align: 'center', size: 13, weight: '700', color: TH.text });
      C.text('پس از برخورد کشسان', cx, 162, { align: 'center', size: 13, weight: '700', color: TH.text });

      C.line(24, trackA, W - 24, trackA, { color: TH.axis, width: 2 });
      C.line(24, trackB, W - 24, trackB, { color: TH.axis, width: 2 });

      var x1a = lerp(cx - reach, cx - 28, ph);
      var x2a = lerp(cx + reach, cx + 28, ph);
      C.poly(box(x1a - bw / 2, trackA - bh, bw, bh), { fill: TH.accent, stroke: TH.text, width: 1.5 });
      C.poly(box(x2a - bw / 2, trackA - bh, bw, bh), { fill: TH.violet, stroke: TH.text, width: 1.5 });
      C.text(PH.num(m1, 1), x1a, trackA - 11, { align: 'center', size: 12, weight: '700', rtl: false, color: '#06121c' });
      C.text(PH.num(m2, 1), x2a, trackA - 11, { align: 'center', size: 12, weight: '700', rtl: false, color: '#06121c' });

      var flash = 7 + 6 * Math.abs(Math.sin(ph * Math.PI));
      C.circle(cx, trackA - bh / 2, flash, { stroke: TH.warn, width: 2 });
      C.text('برخورد', cx, trackA - bh - 14, { align: 'center', size: 11, color: TH.warn });

      var maxP = Math.max(Math.abs(m1 * v1), Math.abs(m2 * v2), Math.abs(m1 * e1), Math.abs(m2 * e2), 1);
      arrowFor(C, x1a, trackA - bh - 30, m1 * v1, maxP, 'p₁ = ' + PH.num(m1 * v1, 1));
      arrowFor(C, x2a, trackA - bh - 30, m2 * v2, maxP, 'p₂ = ' + PH.num(m2 * v2, 1));

      var dir1 = e1 < 0 ? -1 : 1;
      var dir2 = e2 < 0 ? -1 : 1;
      var x1b = cx + dir1 * (28 + ph * reach);
      var x2b = cx + dir2 * (28 + ph * reach);
      C.poly(box(x1b - bw / 2, trackB - bh, bw, bh), { fill: TH.accent, stroke: TH.text, width: 1.5 });
      C.poly(box(x2b - bw / 2, trackB - bh, bw, bh), { fill: TH.violet, stroke: TH.text, width: 1.5 });
      C.text(PH.num(m1, 1), x1b, trackB - 11, { align: 'center', size: 12, weight: '700', rtl: false, color: '#06121c' });
      C.text(PH.num(m2, 1), x2b, trackB - 11, { align: 'center', size: 12, weight: '700', rtl: false, color: '#06121c' });
      arrowFor(C, x1b, trackB - bh - 30, m1 * e1, maxP, 'p₁′ = ' + PH.num(m1 * e1, 1));
      arrowFor(C, x2b, trackB - bh - 30, m2 * e2, maxP, 'p₂′ = ' + PH.num(m2 * e2, 1));

      C.text('Σp قبل = ' + PH.num(p, 2), 26, trackA + 18, { align: 'left', size: 12, rtl: false, color: TH.accent });
      C.text('Σp بعد = ' + PH.num(m1 * e1 + m2 * e2, 2), 26, trackB + 18, { align: 'left', size: 12, rtl: false, color: TH.good });
      C.text('سرعت مشترک در برخورد ناکشسان: ' + PH.num(p / M, 2) + ' m/s', 26, H - 12, { align: 'left', size: 12, rtl: false, color: TH.warn });
    }

    function redraw() {
      update();
      draw();
    }

    function frame(now) {
      ph = (now % PERIOD) / PERIOD;
      draw();
    }

    redraw();
    stops.push(loop(host, frame));
  }

  function expAtwood(host, stops) {
    var s = makeCard(
      host,
      '۷. قرقره و دستگاه آویزان',
      'دو جرم روی قرقرهٔ دورانی با ممان اینرسی معادل',
      'a = g·(m₁ − m₂)/(m₁ + m₂ + k·M)      T₁ = m₁(g − a)      T₂ = m₂(g + a)      α = a/R      ω = α·t      I = k·M·R²',
      3, 340
    );

    var ph = 0.05;

    var cM1 = PH.control({ label: 'جرم m₁ (سنگین‌تر)', unit: 'kg', min: 0.5, max: 20, step: 0.5, value: 8, digits: 1, onInput: redraw });
    var cM2 = PH.control({ label: 'جرم m₂', unit: 'kg', min: 0.5, max: 20, step: 0.5, value: 4, digits: 1, onInput: redraw });
    var cMp = PH.control({ label: 'جرم قرقره M', unit: 'kg', min: 1, max: 20, step: 1, value: 6, digits: 0, onInput: redraw });
    var cR = PH.control({ label: 'شعاع R', unit: 'm', min: 0.05, max: 0.3, step: 0.01, value: 0.2, digits: 2, onInput: redraw });
    var cK = PH.control({
      label: 'شکل قرقره',
      value: '0.5',
      options: [
        { value: '0.5', label: 'استوانهٔ توپر (k = ½)' },
        { value: '1', label: 'حلقهٔ نازک (k = 1)' },
        { value: '0.75', label: 'لولهٔ ضخیم‌جدار (k = ¾)' }
      ],
      onInput: redraw
    });
    var cT = PH.control({ label: 'زمان t', unit: 's', min: 0.5, max: 10, step: 0.5, value: 5, digits: 1, onInput: redraw });
    s.grid.appendChild(cM1.root);
    s.grid.appendChild(cM2.root);
    s.grid.appendChild(cMp.root);
    s.grid.appendChild(cR.root);
    s.grid.appendChild(cK.root);
    s.grid.appendChild(cT.root);

    function kOf() {
      var k = parseFloat(cK.get());
      return isFinite(k) && k > 0 ? k : 0.5;
    }

    function update() {
      var m1 = gv(cM1), m2 = gv(cM2), Mp = gv(cMp), R = gv(cR), t = gv(cT), k = kOf();
      var I = k * Mp * R * R;
      var a = G * (m1 - m2) / (m1 + m2 + k * Mp);
      var T1 = m1 * (G - a);
      var T2 = m2 * (G + a);
      var al = a / R;
      var w = al * t;
      var tau = (T1 - T2) * R;
      var heavy = a >= 0 ? 'm₁' : 'm₂';
      s.readout.update([
        { k: 'ممان اینرسی I = k·M·R²', v: I, unit: 'kg·m²' },
        { k: 'شتاب دستگاه a', v: a, unit: 'm/s²', kind: 'accent' },
        { k: 'کشش شاخهٔ m₁ (T₁)', v: T1, unit: 'N' },
        { k: 'کشش شاخهٔ m₂ (T₂)', v: T2, unit: 'N' },
        { k: 'گشتاور خالص τ = (T₁−T₂)R', v: tau, unit: 'N·m' },
        { k: 'بررسی τ = I·α', v: I * al, unit: 'N·m', kind: 'good' },
        { k: 'شتاب زاویه‌ای α = a/R', v: al, unit: 'rad/s²', kind: 'accent' },
        { k: 'سرعت زاویه‌ای ω پس از t', v: w, unit: 'rad/s', kind: 'warn' },
        { k: 'جرم نزولی‌کننده', v: heavy }
      ]);
    }

    function draw() {
      var C = s.C;
      var d = C.resize();
      var W = d.w, H = d.h;
      C.clear(W, H);
      C.grid({ step: 36, axes: false });

      var m1 = gv(cM1), m2 = gv(cM2), Mp = gv(cMp), R = gv(cR), T = gv(cT), k = kOf();
      var I = k * Mp * R * R;
      var a = G * (m1 - m2) / (m1 + m2 + k * Mp);
      var T1 = m1 * (G - a);
      var T2 = m2 * (G + a);
      var al = a / R;

      var ceilY = 34;
      var cx = W / 2;
      var pr = 30;
      var cy = ceilY + pr;
      var y0 = cy + pr + 74;

      C.line(cx - 150, ceilY, cx + 150, ceilY, { color: TH.axis, width: 3 });
      C.line(cx, ceilY, cx, cy, { color: TH.axis, width: 2 });

      var tb = ph * T;
      var drop = 0.5 * a * tb * tb;
      var reachM = Math.max(Math.abs(0.5 * a * T * T), 0.5);
      var scD = Math.min(1.8, 96 / reachM);
      var dpx = drop * scD;

      C.circle(cx, cy, pr, { fill: 'rgba(76,194,255,0.10)', stroke: TH.accent, width: 2 });
      C.circle(cx, cy, 6, { fill: TH.accent, stroke: TH.text, width: 1 });

      var ang = (0.5 * Math.abs(al) * tb * tb) % 6.283185307179586;
      if (a < 0) ang = -ang;
      C.line(cx, cy, cx + pr * Math.cos(ang), cy + pr * Math.sin(ang), { color: TH.accent2, width: 2 });
      C.circle(cx + pr * Math.cos(ang), cy + pr * Math.sin(ang), 4, { fill: TH.accent2 });
      C.arrow(cx + pr + 8, cy, cx + pr + 8, cy + 30, { color: TH.accent2, width: 2 });
      C.text('ω = ' + PH.num(al * tb, 2) + ' rad/s', cx + pr + 14, cy + 16, { size: 11, rtl: false, color: TH.accent2 });
      C.text('α = ' + PH.num(al, 2) + ' rad/s²', cx + pr + 14, cy + 32, { size: 11, rtl: false, color: TH.muted });

      function block(m, bx, yTop, tension, weight, color) {
        var bwid = 32 + 24 * Math.sqrt(m / 20);
        var bhei = 26 + 18 * Math.sqrt(m / 20);
        C.poly(box(bx - bwid / 2, yTop, bwid, bhei), { fill: color, stroke: TH.text, width: 1.5 });
        C.text(PH.num(m, 1) + ' kg', bx, yTop + bhei / 2 + 5, { align: 'center', size: 11, weight: '700', rtl: false, color: '#06121c' });
        C.line(bx, cy, bx, yTop, { color: TH.text, width: 1.5 });
        C.arrow(bx, yTop + 4, bx, yTop + 4 - (16 + cap(tension * 0.3, 44)), { color: TH.good, width: 2.5 });
        C.arrow(bx, yTop + bhei - 4, bx, yTop + bhei - 4 + (16 + cap(weight * 0.12, 44)), { color: TH.bad, width: 2.5 });
        C.text('T = ' + PH.num(tension, 1) + ' N', bx + 10, yTop + bhei + 18, { size: 11, rtl: false, color: TH.good });
        return bhei;
      }

      var y1 = y0 + dpx;
      var y2 = y0 - dpx;
      y1 = Math.min(Math.max(y1, cy + pr + 6), H - 56);
      y2 = Math.min(Math.max(y2, cy + pr + 6), H - 56);

      block(m1, cx - pr, y1, T1, m1 * G, TH.accent2);
      block(m2, cx + pr, y2, T2, m2 * G, TH.violet);

      C.line(24, y0 + 34, W - 24, y0 + 34, { color: TH.border, width: 1, dash: [4, 4] });
      C.text('سطح مرجع', W - 28, y0 + 26, { align: 'right', size: 10, color: TH.muted });
      C.text('a = ' + PH.num(a, 3) + ' m/s²', 24, 24, { align: 'left', size: 13, rtl: false, color: a >= 0 ? TH.good : TH.warn });
      C.text('I = ' + PH.num(I, 4) + ' kg·m²   R = ' + PH.num(R, 2) + ' m', 24, H - 12, { align: 'left', size: 11, rtl: false, color: TH.muted });
    }

    function redraw() {
      update();
      draw();
    }

    function frame(now) {
      ph = (now % PERIOD) / PERIOD;
      draw();
    }

    redraw();
    stops.push(loop(host, frame));
  }

  PH.register('mechanics', {
    title: 'مکانیک کلاسیک',
    subtitle: 'حرکت‌شناسی، قوانین نیوتن، کار و انرژی، تکانه و دستگاه آویزان',
    build: function (host) {
      var stops = [];
      expConstAccel(host, stops);
      expProjectile(host, stops);
      expNewton(host, stops);
      expIncline(host, stops);
      expWorkEnergy(host, stops);
      expMomentum(host, stops);
      expAtwood(host, stops);
      return function teardown() {
        for (var i = 0; i < stops.length; i++) stops[i]();
      };
    }
  });
})(window);
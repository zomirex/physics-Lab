(function () {
  if (!window.PH) { return; }

  var PI2 = Math.PI * 2;
  var GN = 6.6743e-11;
  var DEG = Math.PI / 180;
  var FONT = '"Segoe UI", Tahoma, sans-serif';

  var COL = {
    ink: '#e6ecf6',
    dim: '#93a0b5',
    line: '#2f3847',
    faint: '#1e2634',
    eq: '#7386a3',
    block: '#ffb454',
    steel: '#c6d2e3',
    planet: '#3f7fd0',
    planet2: '#2a5f9e',
    sat: '#ffd166',
    force: '#ff6b6b',
    kE: '#4ea3ff',
    uE: '#ffb454',
    eE: '#54d98c',
    water: '#2f6fae',
    waterD: '#1c4670',
    hi: '#ff6b6b',
    lo: '#4aa3ff'
  };

  var PL = {
    earth: { M: 5.972e24, R: 6.371e6 },
    mars: { M: 6.417e23, R: 3.389e6 },
    saturn: { M: 5.683e26, R: 6.834e7 }
  };

  function nv(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  function hex(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }

  function mix(c1, c2, u) {
    var a = hex(c1);
    var b = hex(c2);
    u = clamp(u, 0, 1);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * u) + ',' + Math.round(a[1] + (b[1] - a[1]) * u) + ',' + Math.round(a[2] + (b[2] - a[2]) * u) + ')';
  }

  function fit(s) {
    var c = s.canvas;
    var w = c.clientWidth || 720;
    var h = c.clientHeight || s.height;
    if (w < 200) { w = 720; }
    if (h < 120) { h = s.height; }
    var dpr = window.devicePixelRatio || 1;
    var pw = Math.round(w * dpr);
    var ph = Math.round(h * dpr);
    if (c.width !== pw) { c.width = pw; }
    if (c.height !== ph) { c.height = ph; }
    s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    s.w = w;
    s.h = h;
    return s;
  }

  function ln(ctx, x1, y1, x2, y2, col, lw) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = col;
    ctx.lineWidth = lw || 1.5;
    ctx.stroke();
  }

  function dash(ctx, x1, y1, x2, y2, col, lw, d) {
    ctx.save();
    ctx.setLineDash([d || 5, d || 5]);
    ln(ctx, x1, y1, x2, y2, col, lw || 1.2);
    ctx.restore();
  }

  function arr(ctx, x1, y1, x2, y2, col, lw, hs) {
    ln(ctx, x1, y1, x2, y2, col, lw || 2);
    var a = Math.atan2(y2 - y1, x2 - x1);
    var s = hs || 9;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - s * Math.cos(a - 0.42), y2 - s * Math.sin(a - 0.42));
    ctx.lineTo(x2 - s * Math.cos(a + 0.42), y2 - s * Math.sin(a + 0.42));
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }

  function cir(ctx, x, y, r, col, fill, lw) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, r), 0, PI2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (col) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw || 1.5;
      ctx.stroke();
    }
  }

  function box(ctx, x, y, w, h, col, fill, lw) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (col) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw || 1;
      ctx.stroke();
    }
  }

  function txt(ctx, s, x, y, col, size, al, base) {
    ctx.fillStyle = col || COL.ink;
    ctx.font = (size || 12) + 'px ' + FONT;
    ctx.textAlign = al || 'left';
    ctx.textBaseline = base || 'alphabetic';
    ctx.fillText(s, x, y);
  }

  function n2(v, d) {
    return PH.num(v, d === undefined ? 2 : d);
  }

  function panelBody(host, title, subtitle) {
    var p = PH.panel(title, subtitle);
    var root = (p && p.root) ? p.root : p;
    var body = (p && p.body) ? p.body : p;
    host.appendChild(root);
    return body;
  }

  function makeApi(host) {
    var drawers = [];
    var updaters = [];
    var raf = 0;
    var t0 = performance.now();
    var frame = 0;

    function visible() {
      if (!host || !host.isConnected) { return false; }
      if (host.getClientRects) { return host.getClientRects().length > 0; }
      return host.offsetWidth > 0 || host.offsetHeight > 0;
    }

    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (!host.isConnected) {
        cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      frame++;
      if (!visible()) { return; }
      var t = (now - t0) / 1000;
      var i;
      for (i = 0; i < drawers.length; i++) { drawers[i](t); }
      if (frame % 3 === 0) {
        for (i = 0; i < updaters.length; i++) { updaters[i](t); }
      }
    }

    var api = {
      open: function (title, subtitle, height, notes) {
        var body = panelBody(host, title, subtitle);
        var i;
        if (notes) {
          for (i = 0; i < notes.length; i++) {
            body.appendChild(PH.el('div', { class: 'formula', text: notes[i] }));
          }
        }
        var g = PH.grid(body, 4);
        var c = PH.canvas(body, { height: height });
        var s = { canvas: c.canvas, ctx: c.ctx, height: height, w: 720, h: height };
        if (s.canvas && s.canvas.setAttribute) { s.canvas.setAttribute('aria-label', title); }
        var ro = PH.readout([]);
        body.appendChild(ro);
        return { body: body, grid: g, s: s, ro: ro };
      },
      put: function (g, spec) {
        var c = PH.control(spec);
        g.appendChild(c.root);
        return c;
      },
      add: function (fn) { drawers.push(fn); },
      addUp: function (fn) { updaters.push(fn); },
      start: function () {
        t0 = performance.now();
        if (!raf) { raf = requestAnimationFrame(loop); }
      }
    };
    return api;
  }

  function shm(api) {
    var M = 1;
    var e = api.open(
      'نوسان هماهنگ ساده (SHM)',
      'حرکت تناوبی با شتاب متناسب و معکوس با جابه‌جایی',
      340,
      [
        'x(t) = A cos(ωt + φ)   |   v(t) = −Aω sin(ωt + φ)   |   a(t) = −Aω² cos(ωt + φ)',
        'K = ½ m v²   |   U = ½ k x²   |   E = K + U = ½ k A²   |   k = m ω²   (m = 1 kg)'
      ]
    );
    var A = api.put(e.grid, { label: 'دامنه A', unit: 'm', min: 0.05, max: 2, step: 0.01, value: 0.5 });
    var W = api.put(e.grid, { label: 'فرکانس زاویه‌ای ω', unit: 'rad/s', min: 0.2, max: 8, step: 0.05, value: 2 });
    var P = api.put(e.grid, { label: 'فاز اولیه φ', unit: 'rad', min: 0, max: 6.28, step: 0.02, value: 0 });
    api.put(e.grid, { label: 'جرم m', unit: 'kg', min: 0.1, max: 5, step: 0.1, value: 1 });

    var trail = [];

    api.add(function (t) {
      var s = fit(e.s);
      var ctx = s.ctx;
      var w = s.w;
      var h = s.h;
      ctx.clearRect(0, 0, w, h);

      var amp = nv(A.get());
      var om = nv(W.get());
      var ph = nv(P.get());
      if (amp <= 0) { amp = 0.001; }
      if (om <= 0) { om = 0.001; }

      var th = om * t + ph;
      var x = amp * Math.cos(th);
      var v = -amp * om * Math.sin(th);
      var ac = -amp * om * om * Math.cos(th);
      var kk = M * om * om;
      var K = 0.5 * M * v * v;
      var U = 0.5 * kk * x * x;
      var E = 0.5 * kk * amp * amp;
      var T = PI2 / om;

      var split = h * 0.50;
      ln(ctx, 0, split, w, split, COL.faint, 1);

      var y0 = h * 0.30;
      var cx = w * 0.5;
      var sc = (w * 0.44) / amp;
      var bx = cx + x * sc;

      ln(ctx, w * 0.04, y0, w * 0.96, y0, COL.line, 2);
      dash(ctx, cx, y0 - h * 0.16, cx, y0 + h * 0.14, COL.eq, 1.2, 6);
      dash(ctx, cx - amp * sc, y0 - h * 0.10, cx - amp * sc, y0 + h * 0.10, COL.dim, 1.2, 4);
      dash(ctx, cx + amp * sc, y0 - h * 0.10, cx + amp * sc, y0 + h * 0.10, COL.dim, 1.2, 4);

      trail.push(bx);
      if (trail.length > 90) { trail.shift(); }
      ctx.save();
      for (var i = 1; i < trail.length; i++) {
        var a = i / trail.length;
        ctx.globalAlpha = a * 0.8;
        ln(ctx, trail[i - 1], y0, trail[i], y0, COL.kE, 2);
      }
      ctx.restore();

      box(ctx, cx - amp * sc, y0 + 3, amp * sc * 2, 3, null, mix(COL.lo, COL.hi, 0.5), 0);
      cir(ctx, bx, y0, 15, COL.ink, COL.block, 2);
      cir(ctx, bx, y0, 5, COL.line, null, 1);

      txt(ctx, '−A', cx - amp * sc, y0 - h * 0.13, COL.dim, 12, 'center');
      txt(ctx, '+A', cx + amp * sc, y0 - h * 0.13, COL.dim, 12, 'center');
      txt(ctx, '0', cx, y0 - h * 0.13, COL.eq, 12, 'center');
      txt(ctx, 'x = ' + n2(x, 3) + ' m', w * 0.04, h * 0.09, COL.ink, 13);
      txt(ctx, 'v = ' + n2(v, 3) + ' m/s', w * 0.24, h * 0.09, COL.kE, 13);
      txt(ctx, 'a = ' + n2(ac, 3) + ' m/s²', w * 0.42, h * 0.09, COL.force, 13);
      txt(ctx, 'ω = ' + n2(om, 2) + ' rad/s   T = ' + n2(T, 3) + ' s', w * 0.04, h * 0.45, COL.dim, 12);

      var bx0 = w * 0.06;
      var bx1 = w * 0.54;
      var bw = bx1 - bx0;
      var by0 = h * 0.60;
      var by1 = h * 0.93;
      var bh = by1 - by0;
      txt(ctx, 'انرژی (J)', bx0, by0 - 8, COL.dim, 12);

      var maxE = E > 0 ? E : 1;
      var hk = (K / maxE) * bh;
      var hu = (U / maxE) * bh;
      box(ctx, bx0, by1 - bh, bw * 0.45, bh, null, COL.faint, 0);
      box(ctx, bx0, by1 - hk, bw * 0.45, hk, COL.kE, COL.kE, 0);
      box(ctx, bx0 + bw * 0.5, by1 - bh, bw * 0.45, bh, null, COL.faint, 0);
      box(ctx, bx0 + bw * 0.5, by1 - hu, bw * 0.45, hu, COL.uE, COL.uE, 0);
      txt(ctx, 'K = ' + n2(K, 3), bx0 + bw * 0.225, by1 - hk - 5, COL.kE, 11, 'center');
      txt(ctx, 'U = ' + n2(U, 3), bx0 + bw * 0.725, by1 - hu - 5, COL.uE, 11, 'center');
      ln(ctx, bx0, by1 + 4, bx1, by1 + 4, COL.eE, 2);
      txt(ctx, 'E = K + U = ' + n2(E, 3) + ' J', bx0, by1 + 18, COL.eE, 12);
    });

    api.addUp(function (t) {
      var amp = nv(A.get());
      var om = nv(W.get());
      var ph = nv(P.get());
      if (amp <= 0) { amp = 0.001; }
      if (om <= 0) { om = 0.001; }
      var th = om * t + ph;
      var x = amp * Math.cos(th);
      var v = -amp * om * Math.sin(th);
      var ac = -amp * om * om * Math.cos(th);
      var kk = M * om * om;
      var K = 0.5 * M * v * v;
      var U = 0.5 * kk * x * x;
      var E = 0.5 * kk * amp * amp;
      e.ro.update([
        { k: 'زمان t', v: t, unit: 's' },
        { k: 'جابه‌جایی x', v: x, unit: 'm' },
        { k: 'سرعت v', v: v, unit: 'm/s' },
        { k: 'شتاب a', v: ac, unit: 'm/s²' },
        { k: 'ثابت فنر k = mω²', v: kk, unit: 'N/m' },
        { k: 'انرژی جنبشی K', v: K, unit: 'J' },
        { k: 'انرژی پتانسیل U', v: U, unit: 'J' },
        { k: 'انرژی کل E', v: E, unit: 'J' },
        { k: 'توان لحظه‌ای P = mva', v: M * v * ac, unit: 'W' },
        { k: 'خطای پایستگی E − (K+U)', v: E - (K + U), unit: 'J' }
      ]);
    });
  }

  function spring(api) {
    var e = api.open(
      'فنر–جرم',
      'سامانه نوسان‌گر هماهنگ جرم روی فنر',
      340,
      [
        'ω₀ = √(k / m)   |   f = ω₀ / 2π   |   T = 2π √(m / k)',
        'v_max = A ω₀   |   a_max = A ω₀²   |   E = ½ k A²'
      ]
    );
    var Mm = api.put(e.grid, { label: 'جرم m', unit: 'kg', min: 0.1, max: 10, step: 0.1, value: 1 });
    var Kk = api.put(e.grid, { label: 'ثابت فنر k', unit: 'N/m', min: 10, max: 500, step: 1, value: 120 });
    var Aa = api.put(e.grid, { label: 'دامنه A', unit: 'm', min: 0.05, max: 0.6, step: 0.01, value: 0.25 });

    api.add(function (t) {
      var s = fit(e.s);
      var ctx = s.ctx;
      var w = s.w;
      var h = s.h;
      ctx.clearRect(0, 0, w, h);

      var m = nv(Mm.get());
      var k = nv(Kk.get());
      var amp = nv(Aa.get());
      if (m <= 0) { m = 0.001; }
      if (k <= 0) { k = 0.001; }
      if (amp <= 0) { amp = 0.001; }

      var om = Math.sqrt(k / m);
      var th = om * t;
      var x = amp * Math.sin(th);
      var v = amp * om * Math.cos(th);
      var ac = -amp * om * om * Math.sin(th);

      var cx = w * 0.5;
      var y = h * 0.52;
      var sc = (w * 0.32) / amp;
      var bx = cx + x * sc;
      var wall = cx - amp * sc - 78;

      box(ctx, wall - 10, h * 0.16, 10, h * 0.68, COL.line, COL.faint, 1);
      for (var i = 0; i < 6; i++) {
        ln(ctx, wall - 10, h * 0.16 + 8 + i * (h * 0.68 - 16) / 5, wall - 22, h * 0.16 + 8 + i * (h * 0.68 - 16) / 5, COL.line, 1);
      }

      var n = 14;
      var x0 = wall;
      var x1 = bx - 20;
      var span = x1 - x0;
      var ampC = Math.min(14, Math.abs(span) / (n * 0.55));
      ctx.beginPath();
      ctx.moveTo(x0, y);
      for (var j = 0; j <= n; j++) {
        var px = x0 + (span * j) / n;
        var py = y + ((j % 2 === 0) ? 0 : ampC);
        if (j > 0) { ln(ctx, x0 + (span * (j - 1)) / n, y + ((j - 1) % 2 === 0 ? 0 : ampC), px, py, COL.steel, 2); }
      }

      ln(ctx, w * 0.05, y + 26, w * 0.95, y + 26, COL.line, 2);
      dash(ctx, cx, y - 60, cx, y + 34, COL.eq, 1.2, 6);
      dash(ctx, cx - amp * sc, y - 46, cx - amp * sc, y + 20, COL.dim, 1.2, 4);
      dash(ctx, cx + amp * sc, y - 46, cx + amp * sc, y + 20, COL.dim, 1.2, 4);

      box(ctx, bx - 20, y - 20, 40, 40, COL.ink, COL.block, 2);
      txt(ctx, 'm', bx, y + 5, '#1a1a1a', 15, 'center');

      if (Math.abs(v) > 0.001) {
        var dir = v > 0 ? 1 : -1;
        arr(ctx, bx, y - 20, bx + dir * 52, y - 20, COL.kE, 2.5, 9);
        txt(ctx, 'v', bx + dir * 60, y - 16, COL.kE, 12);
      }
      if (Math.abs(ac) > 0.001) {
        var da = ac > 0 ? 1 : -1;
        arr(ctx, bx, y + 20, bx + da * 52, y + 20, COL.force, 2.5, 9);
        txt(ctx, 'a', bx + da * 60, y + 24, COL.force, 12);
      }

      txt(ctx, '−A', cx - amp * sc, y - 52, COL.dim, 12, 'center');
      txt(ctx, '+A', cx + amp * sc, y - 52, COL.dim, 12, 'center');
      txt(ctx, 'موقعیت تعادل', cx, y + 44, COL.eq, 12, 'center');
      txt(ctx, 'x = ' + n2(x, 3) + ' m', w * 0.05, h * 0.10, COL.ink, 13);
      txt(ctx, 'ω₀ = ' + n2(om, 3) + ' rad/s', w * 0.26, h * 0.10, COL.uE, 13);
      txt(ctx, 'دوره T = ' + n2(PI2 / om, 3) + ' s', w * 0.52, h * 0.10, COL.eE, 13);
      txt(ctx, 'طول فنر در حالت تعادل: k', w * 0.05, h * 0.93, COL.dim, 12);
    });

    api.addUp(function () {
      var m = nv(Mm.get());
      var k = nv(Kk.get());
      var amp = nv(Aa.get());
      if (m <= 0) { m = 0.001; }
      if (k <= 0) { k = 0.001; }
      if (amp <= 0) { amp = 0.001; }
      var om = Math.sqrt(k / m);
      e.ro.update([
        { k: 'ω₀ = √(k/m)', v: om, unit: 'rad/s' },
        { k: 'فرکانس f = ω₀/2π', v: om / PI2, unit: 'Hz' },
        { k: 'دوره T = 2π/ω₀', v: PI2 / om, unit: 's' },
        { k: 'بیشینه سرعت v_max', v: amp * om, unit: 'm/s' },
        { k: 'بیشینه شتاب a_max', v: amp * om * om, unit: 'm/s²' },
        { k: 'بیشینه نیروی فنر F_max = kA', v: k * amp, unit: 'N' },
        { k: 'انرژی کل E = ½kA²', v: 0.5 * k * amp * amp, unit: 'J' },
        { k: 'طول طبیعی فنر در تعادل ℓ = mg/k', v: m * 9.81 / k, unit: 'm' }
      ]);
    });
  }

  function pendulum(api) {
    var e = api.open(
      'آونگ ساده',
      'حرکت نوسانی آونگ با دامنه زاویه‌ای دلخواه',
      340,
      [
        'T₀ = 2π √(L / g)   (تقریب زاویه کوچک)',
        'T = T₀ (1 + θ²/16 + 11θ⁴/3072)   |   h_max = L (1 − cos θ_max)   |   v_max = √(2 g L (1 − cos θ_max))'
      ]
    );
    var L = api.put(e.grid, { label: 'طول آونگ L', unit: 'm', min: 0.2, max: 3, step: 0.01, value: 1 });
    var TH = api.put(e.grid, { label: 'بیشینه زاویه θ_max', unit: 'deg', min: 2, max: 85, step: 1, value: 30 });
    var G = api.put(e.grid, { label: 'شتاب گرانش g', unit: 'm/s²', min: 1, max: 25, step: 0.01, value: 9.81 });

    api.add(function (t) {
      var s = fit(e.s);
      var ctx = s.ctx;
      var w = s.w;
      var h = s.h;
      ctx.clearRect(0, 0, w, h);

      var len = nv(L.get());
      var thmax = nv(TH.get()) * DEG;
      var g = nv(G.get());
      if (len <= 0) { len = 0.001; }
      if (g <= 0) { g = 0.001; }

      var om = Math.sqrt(g / len);
      var ang = thmax * Math.cos(om * t);

      var px = w * 0.5;
      var py = h * 0.16;
      var sc = (h * 0.66) / len;

      ctx.beginPath();
      ctx.moveTo(w * 0.06, py);
      ctx.lineTo(w * 0.94, py);
      ctx.strokeStyle = COL.line;
      ctx.lineWidth = 3;
      ctx.stroke();
      for (var i = 0; i < 10; i++) {
        var hx = w * 0.06 + (w * 0.88 * i) / 9;
        ln(ctx, hx, py, hx - 12, py + 14, COL.line, 1);
      }
      cir(ctx, px, py, 7, COL.steel, COL.block, 1.5);

      var R = len * sc;
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(px, py, R, PI2 / 2 - thmax, PI2 / 2 + thmax);
      ctx.strokeStyle = COL.eq;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      dash(ctx, px, py, px, py + R, COL.eq, 1.2, 5);

      var bx = px + R * Math.sin(ang);
      var by = py + R * Math.cos(ang);

      ln(ctx, px, py, bx, by, COL.steel, 2);
      cir(ctx, bx, by, 17, COL.ink, COL.block, 2);
      cir(ctx, bx - 5, by - 5, 4, '#ffffff', null, 1);

      var dx = (bx - px) * 0.45;
      var dy = (by - py) * 0.45;
      arr(ctx, px + dx * 0.55, py + dy * 0.55, bx, by, COL.force, 1.5, 10);
      txt(ctx, 'mg', bx + 14, by + 12, COL.force, 12);

      var lx = px - (R + 26) * Math.sin(ang) * 0.55;
      var ly = py + (R + 26) * Math.cos(ang) * 0.55;
      dash(ctx, px - 30, py, lx - 6, ly, COL.dim, 1, 3);
      ln(ctx, lx - 8, ly + 6, lx + 4, ly - 6, COL.dim, 1);
      txt(ctx, 'L = ' + n2(len, 2) + ' m', lx - 4, ly - 12, COL.dim, 12, 'center');

      txt(ctx, 'θ = ' + n2(ang / DEG, 1) + '°', w * 0.06, h * 0.92, COL.ink, 13);
      txt(ctx, 'θ_max = ' + n2(thmax / DEG, 1) + '°', w * 0.30, h * 0.92, COL.dim, 13);
      txt(ctx, 'ω = √(g/L) = ' + n2(om, 3) + ' rad/s', w * 0.56, h * 0.92, COL.uE, 13);
    });

    api.addUp(function () {
      var len = nv(L.get());
      var th = nv(TH.get()) * DEG;
      var g = nv(G.get());
      if (len <= 0) { len = 0.001; }
      if (g <= 0) { g = 0.001; }
      var T0 = PI2 * Math.sqrt(len / g);
      var corr = 1 + th * th / 16 + 11 * th * th * th * th / 3072;
      var hm = len * (1 - Math.cos(th));
      var vm = Math.sqrt(2 * g * len * (1 - Math.cos(th)));
      e.ro.update([
        { k: 'دوره تقریبی T₀ = 2π√(L/g)', v: T0, unit: 's' },
        { k: 'دوره دقیق (اصلاح دامنه)', v: T0 * corr, unit: 's' },
        { k: 'فرکانس f = 1/T', v: 1 / (T0 * corr), unit: 'Hz' },
        { k: 'ω₀ = √(g/L)', v: Math.sqrt(g / len), unit: 'rad/s' },
        { k: 'بیشینه سرعت v_max', v: vm, unit: 'm/s' },
        { k: 'بیشینه ارتفاع h_max', v: hm, unit: 'm' },
        { k: 'انرژی کل E = mgh (m=1kg)', v: 1 * g * hm, unit: 'J' },
        { k: 'نیروی کشش در پایین‌ترین نقطه', v: 1 * g + 1 * vm * vm / len, unit: 'N' }
      ]);
    });
  }

  function gravity(api) {
    var e = api.open(
      'گرانش و مدار',
      'جاذبه سیاره‌ای، سرعت گریز و مدار دایره‌ای',
      340,
      [
        'g = GM / r²   |   F = GMm / r²   |   v_esc = √(2GM / r)',
        'v_orb = √(GM / r)   |   T_orb = 2π r / v_orb   |   E = −GMm / 2r   (m = 1 kg)'
      ]
    );
    var M = api.put(e.grid, {
      label: 'جرم سیاره M',
      unit: '',
      type: 'select',
      value: 'earth',
      options: [
        { value: 'earth', label: 'زمین' },
        { value: 'mars', label: 'مریخ' },
        { value: 'saturn', label: 'زحل' }
      ]
    });
    var R = api.put(e.grid, { label: 'فاصله r (ضریبی از R)', unit: '×R', min: 1, max: 5, step: 0.01, value: 1 });

    api.add(function (t) {
      var s = fit(e.s);
      var ctx = s.ctx;
      var w = s.w;
      var h = s.h;
      ctx.clearRect(0, 0, w, h);

      var key = String(M.get());
      var p = PL[key] ? PL[key] : PL.earth;
      var mult = nv(R.get());
      if (mult < 1) { mult = 1; }
      var r = p.R * mult;
      var g = GN * p.M / (r * r);
      var vEsc = Math.sqrt(2 * GN * p.M / r);
      var vOrb = Math.sqrt(GN * p.M / r);
      var TOrb = PI2 * r / vOrb;
      var F = GN * p.M * 1 / (r * r);

      var cx = w * 0.5;
      var cy = h * 0.55;
      var maxR = Math.min(w * 0.42, h * 0.42);
      var pxPerR = maxR / 5;
      var prad = Math.max(12, pxPerR * 1 * Math.sqrt(p.R / 6.371e6) * 0.9);
      var orad = pxPerR * mult;

      var gx = cx - orad * 0.7071;
      var gy = cy - orad * 0.7071;
      var fr = (t / TOrb) % 1;
      var sa = fr * PI2;
      var sx = cx + orad * Math.cos(sa);
      var sy = cy + orad * Math.sin(sa);

      ctx.save();
      ctx.setLineDash([6, 6]);
      cir(ctx, cx, cy, orad, COL.eq, null, 1.4);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.22;
      cir(ctx, cx, cy, orad, COL.planet, null, 1);
      ctx.restore();

      cir(ctx, cx, cy, prad, COL.ink, COL.planet, 2);
      ctx.save();
      ctx.globalAlpha = 0.45;
      cir(ctx, cx - prad * 0.3, cy - prad * 0.3, prad * 0.55, COL.ink, null, 1);
      ctx.restore();
      txt(ctx, p === PL.mars ? 'مریخ' : (p === PL.saturn ? 'زحل' : 'زمین'), cx, cy + prad + 16, COL.dim, 12, 'center');

      cir(ctx, sx, sy, 10, COL.ink, COL.sat, 2);
      var mag = clamp((F / 12) * 46, 18, 70);
      arr(ctx, sx, sy, sx - (sx - cx) / orad * mag, sy - (sy - cy) / orad * mag, COL.force, 2.5, 10);
      txt(ctx, 'F = ' + n2(F, 3) + ' N', sx + 14, sy - 12, COL.force, 12);
      txt(ctx, 'g = ' + n2(g, 3) + ' m/s²', sx + 14, sy + 4, COL.kE, 12);
      txt(ctx, 'r = ' + n2(r / 1000, 0) + ' km', sx + 14, sy + 20, COL.dim, 12);

      txt(ctx, 'v_esc = ' + n2(vEsc / 1000, 3) + ' km/s', w * 0.06, h * 0.10, COL.hi, 14);
      txt(ctx, 'v_orb = ' + n2(vOrb / 1000, 3) + ' km/s', w * 0.38, h * 0.10, COL.eE, 14);
      txt(ctx, vOrb > vEsc ? 'مدار ناپایدار (گریز)' : 'مدار پایدار', w * 0.72, h * 0.10, COL.dim, 14);
    });

    api.addUp(function () {
      var key = String(M.get());
      var p = PL[key] ? PL[key] : PL.earth;
      var mult = nv(R.get());
      if (mult < 1) { mult = 1; }
      var r = p.R * mult;
      var g = GN * p.M / (r * r);
      var F = GN * p.M / (r * r);
      var vEsc = Math.sqrt(2 * GN * p.M / r);
      var vOrb = Math.sqrt(GN * p.M / r);
      var TOrb = PI2 * r / vOrb;
      e.ro.update([
        { k: 'جرم سیاره M', v: p.M, unit: 'kg' },
        { k: 'شعاع سیاره R', v: p.R / 1000, unit: 'km' },
        { k: 'فاصله r', v: r / 1000, unit: 'km' },
        { k: 'شتاب گرانشی g = GM/r²', v: g, unit: 'm/s²' },
        { k: 'نیروی جاذبه F = GMm/r²', v: F, unit: 'N' },
        { k: 'سرعت گریز v_esc', v: vEsc / 1000, unit: 'km/s' },
        { k: 'سرعت مداری v_orb', v: vOrb / 1000, unit: 'km/s' },
        { k: 'دوره مدار T_orb', v: TOrb, unit: 's' },
        { k: 'دوره مدار', v: TOrb / 60, unit: 'min' },
        { k: 'انرژی مدار E = −GMm/2r', v: -GN * p.M / (2 * r), unit: 'J' },
        { k: 'سرعت گریز در سطح سیاره', v: Math.sqrt(2 * GN * p.M / p.R) / 1000, unit: 'km/s' }
      ]);
    });
  }

  function bernoulli(api) {
    var e = api.open(
      'سیال: پیوستگی و برنولی',
      'جریان چندلایه در لوله با سطح مقطع متغیر',
      340,
      [
        'A₁ v₁ = A₂ v₂   |   p₁ + ½ ρ v₁² = p₂ + ½ ρ v₂²',
        'Δp = p₂ − p₁ = ½ ρ (v₁² − v₂²)'
      ]
    );
    var A1 = api.put(e.grid, { label: 'سطح مقطع A₁', unit: 'cm²', min: 0.5, max: 20, step: 0.1, value: 6 });
    var A2 = api.put(e.grid, { label: 'سطح مقطع A₂', unit: 'cm²', min: 0.5, max: 20, step: 0.1, value: 2 });
    var V1 = api.put(e.grid, { label: 'سرعت ورودی v₁', unit: 'm/s', min: 0.2, max: 20, step: 0.1, value: 4 });
    var P1 = api.put(e.grid, { label: 'فشار ورودی p₁', unit: 'kPa', min: 0, max: 400, step: 1, value: 120 });
    var RO = api.put(e.grid, { label: 'چگالی ρ', unit: 'kg/m³', min: 100, max: 2000, step: 10, value: 1000 });

    var par = [];
    var pt = -1;

    api.add(function (t) {
      var s = fit(e.s);
      var ctx = s.ctx;
      var w = s.w;
      var h = s.h;
      ctx.clearRect(0, 0, w, h);

      var a1 = nv(A1.get()) * 1e-4;
      var a2 = nv(A2.get()) * 1e-4;
      var v1 = nv(V1.get());
      var p1 = nv(P1.get()) * 1000;
      var ro = nv(RO.get());
      if (a1 <= 0) { a1 = 1e-8; }
      if (a2 <= 0) { a2 = 1e-8; }
      if (v1 <= 0) { v1 = 0.001; }

      var v2 = v1 * a1 / a2;
      var p2 = p1 + 0.5 * ro * (v1 * v1 - v2 * v2);

      var x0 = w * 0.08;
      var x1 = w * 0.92;
      var span = x1 - x0;
      var cy = h * 0.5;
      var pxPerArea = (h * 0.30) / Math.max(a1, a2);
      var hA1 = a1 * pxPerArea;
      var hA2 = a2 * pxPerArea;

      function half(u) { return hA1 + (hA2 - hA1) * u; }
      function area(u) { return a1 + (a2 - a1) * u; }
      function vel(u) { return v1 * a1 / area(u); }
      function prs(u) { return p1 + 0.5 * ro * (v1 * v1 - vel(u) * vel(u)); }

      var pLo = Math.min(p1, p2);
      var pHi = Math.max(p1, p2);
      var spanP = (pHi - pLo) > 1 ? (pHi - pLo) : 1;

      ctx.beginPath();
      ctx.moveTo(x0, cy - hA1);
      ctx.lineTo(x1, cy - hA2);
      ctx.lineTo(x1, cy + hA2);
      ctx.lineTo(x0, cy + hA1);
      ctx.closePath();
      ctx.fillStyle = mix(COL.lo, COL.hi, 0.15);
      ctx.fill();
      ctx.strokeStyle = COL.steel;
      ctx.lineWidth = 2;
      ctx.stroke();

      var steps = 40;
      for (var i = 0; i < steps; i++) {
        var u = i / steps;
        var u2 = (i + 1) / steps;
        var col = mix(COL.lo, COL.hi, (prs(u) - pLo) / spanP);
        ctx.beginPath();
        ctx.moveTo(x0 + span * u, cy - half(u));
        ctx.lineTo(x0 + span * u2, cy - half(u2));
        ctx.lineTo(x0 + span * u2, cy + half(u2));
        ctx.lineTo(x0 + span * u, cy + half(u));
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.85;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      var lanes = 6;
      if (par.length !== lanes) {
        par = [];
        pt = -1;
        for (var q = 0; q < lanes; q++) { par.push({ u: Math.random() }); }
      }
      var dt = pt < 0 ? 0 : Math.min(0.05, Math.max(0, t - pt));
      pt = t;
      var vScale = 0.0022;

      for (var L = 0; L < lanes; L++) {
        var ly = cy - half(1) + (2 * half(1) * (L + 0.5)) / lanes;
        var p = par[L];
        var vv = vel(p.u) * vScale;
        p.u += vv * dt;
        if (p.u > 1) { p.u -= 1; }
        var lx = x0 + span * p.u;
        var col2 = mix(COL.lo, COL.hi, (prs(p.u) - pLo) / spanP);
        var lh = half(p.u);
        var seg = Math.min(46, 8 + vv * 260);
        ctx.save();
        ctx.strokeStyle = col2;
        ctx.lineWidth = 2.4;
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.moveTo(lx - Math.min(seg, span * p.u), ly);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        ctx.restore();
        if (ly > cy - lh + 1 && ly < cy + lh - 1) { cir(ctx, lx, ly, 2.4, '#ffffff', col2, 1); }
      }

      ln(ctx, x0 - 12, cy - hA1, x0 - 12, cy + hA1, COL.dim, 1);
      ln(ctx, x1 + 12, cy - hA2, x1 + 12, cy + hA2, COL.dim, 1);
      txt(ctx, 'A₁ = ' + n2(a1 * 1e4, 1) + ' cm²', x0 - 18, cy, COL.ink, 12, 'right');
      txt(ctx, 'A₂ = ' + n2(a2 * 1e4, 1) + ' cm²', x1 + 18, cy, COL.ink, 12, 'left');
      txt(ctx, 'v₁ = ' + n2(v1, 2) + ' m/s   p₁ = ' + n2(p1 / 1000, 1) + ' kPa', x0, h * 0.10, COL.kE, 13);
      txt(ctx, 'v₂ = ' + n2(v2, 2) + ' m/s   p₂ = ' + n2(p2 / 1000, 2) + ' kPa', x0, h * 0.10 + 18, COL.hi, 13);
      txt(ctx, 'Q = A₁v₁ = ' + n2(a1 * v1 * 1000, 2) + ' L/s', w * 0.60, h * 0.10, COL.eE, 13);
      txt(ctx, 'فشار بالا: ' + mix(COL.lo, COL.hi, 1) + '   فشار پایین: ' + mix(COL.lo, COL.hi, 0), x0, h * 0.95, COL.dim, 12);
    });

    api.addUp(function () {
      var a1 = nv(A1.get()) * 1e-4;
      var a2 = nv(A2.get()) * 1e-4;
      var v1 = nv(V1.get());
      var p1 = nv(P1.get()) * 1000;
      var ro = nv(RO.get());
      if (a1 <= 0) { a1 = 1e-8; }
      if (a2 <= 0) { a2 = 1e-8; }
      var v2 = v1 * a1 / a2;
      var p2 = p1 + 0.5 * ro * (v1 * v1 - v2 * v2);
      var dp = p2 - p1;
      e.ro.update([
        { k: 'سرعت خروجی v₂ = v₁A₁/A₂', v: v2, unit: 'm/s' },
        { k: 'فشار خروجی p₂', v: p2 / 1000, unit: 'kPa' },
        { k: 'اختلاف فشار Δp = p₂ − p₁', v: dp / 1000, unit: 'kPa' },
        { k: 'Δp + Δ(½ρv²) (باید صفر باشد)', v: dp + 0.5 * ro * (v2 * v2 - v1 * v1), unit: 'Pa' },
        { k: 'دبی Q = A₁v₁', v: a1 * v1 * 1000, unit: 'L/s' },
        { k: 'انرژی جنبشی در واحد جرم ½v₁²', v: 0.5 * v1 * v1, unit: 'J/kg' },
        { k: 'انرژی جنبشی در واحد جرم ½v₂²', v: 0.5 * v2 * v2, unit: 'J/kg' },
        { k: 'نسبت سرعت v₂/v₁', v: v2 / v1, unit: '' },
        { k: 'حالت جریان', v: ro * v1 * a1 > 0.01 ? 'جاری' : 'راکد', unit: '' }
      ]);
    });
  }

  function buoyancy(api) {
    var e = api.open(
      'شناوری ارشمیدس',
      'تعادل نیروی بالابر، وزن و شناوری اجسام در سیال',
      280,
      [
        'F_b = ρ_fluid V g   |   W = ρ_object V g   |   F_net = W − F_b',
        'کسر غوطه‌ور در تعادل = min(1 , ρ_object / ρ_fluid)'
      ]
    );
    var V = api.put(e.grid, { label: 'حجم V', unit: 'L', min: 0.1, max: 20, step: 0.1, value: 5 });
    var RF = api.put(e.grid, { label: 'چگالی سیال ρ_fluid', unit: 'kg/m³', min: 200, max: 2000, step: 10, value: 1000 });
    var ROO = api.put(e.grid, { label: 'چگالی جسم ρ_object', unit: 'kg/m³', min: 100, max: 8000, step: 10, value: 800 });

    api.add(function () {
      var s = fit(e.s);
      var ctx = s.ctx;
      var w = s.w;
      var h = s.h;
      ctx.clearRect(0, 0, w, h);

      var vol = nv(V.get()) / 1000;
      var rf = nv(RF.get());
      var ro = nv(ROO.get());
      if (vol <= 0) { vol = 1e-6; }
      if (rf <= 0) { rf = 1; }
      if (ro <= 0) { ro = 1; }

      var g = 9.81;
      var Fb = rf * vol * g;
      var W = ro * vol * g;
      var frac = Math.min(1, ro / rf);
      var floats = ro <= rf;

      var x0 = w * 0.20;
      var x1 = w * 0.80;
      var yL = h * 0.32;
      var yB = h * 0.90;
      var ow = Math.min(110, (x1 - x0) * 0.32);
      var oh = 96;
      var ocx = (x0 + x1) / 2;

      box(ctx, x0, yL, x1 - x0, yB - yL, null, COL.water, 0);
      box(ctx, x0, yL, x1 - x0, yB - yL, COL.ink, null, 2);
      ln(ctx, x0 - 14, yL, x1 + 14, yL, COL.kE, 2.5);
      txt(ctx, 'سطح سیال', x1 + 20, yL + 4, COL.kE, 12);

      var oy1 = floats ? yL - (1 - frac) * oh : yB;
      var oy0 = oy1 - oh;
      var subTop = Math.max(oy0, yL);

      box(ctx, ocx - ow / 2, subTop, ow, Math.max(0, Math.min(oy1, yB) - subTop), null, COL.waterD, 0);
      box(ctx, ocx - ow / 2, oy0, ow, oh, COL.ink, COL.block, 2);
      ln(ctx, ocx - ow / 2, yL, ocx + ow / 2, yL, COL.force, 2);
      if (yL > oy0 && yL < oy1) {
        dash(ctx, ocx - ow / 2 - 16, yL, ocx + ow / 2 + 16, yL, COL.hi, 1.2, 4);
      }

      arr(ctx, ocx, yL - 26, ocx, yL - 26 - Math.min(60, Fb / 12), COL.kE, 2.5, 9);
      txt(ctx, 'F_b', ocx + 12, yL - 40, COL.kE, 12);
      arr(ctx, ocx, yB - 8, ocx, yB - 8 + Math.min(60, W / 12), COL.force, 2.5, 9);
      txt(ctx, 'W', ocx + 12, yB - 2, COL.force, 12);

      txt(ctx, 'V = ' + n2(vol * 1000, 1) + ' L', x0, h * 0.12, COL.ink, 13);
      txt(ctx, 'ρ_fluid = ' + n2(rf, 0) + ' kg/m³', x0 + 150, h * 0.12, COL.kE, 13);
      txt(ctx, 'ρ_object = ' + n2(ro, 0) + ' kg/m³', x0 + 320, h * 0.12, COL.uE, 13);
      txt(ctx, floats ? 'شناور — کسر غوطه‌ور ' + n2(frac * 100, 1) + '٪' : 'در حال سقوط — چگالی بیشتر از سیال', x0, h * 0.97, floats ? COL.eE : COL.hi, 13);
    });

    api.addUp(function () {
      var vol = nv(V.get()) / 1000;
      var rf = nv(RF.get());
      var ro = nv(ROO.get());
      if (vol <= 0) { vol = 1e-6; }
      if (rf <= 0) { rf = 1; }
      if (ro <= 0) { ro = 1; }
      var g = 9.81;
      var Fb = rf * vol * g;
      var W = ro * vol * g;
      var frac = Math.min(1, ro / rf);
      e.ro.update([
        { k: 'نیروی بالابر F_b = ρ_f V g', v: Fb, unit: 'N' },
        { k: 'وزن W = ρ_o V g', v: W, unit: 'N' },
        { k: 'نیروی خالص F_net = W − F_b', v: W - Fb, unit: 'N' },
        { k: 'جرم جسم m = ρ_o V', v: ro * vol, unit: 'kg' },
        { k: 'کسر غوطه‌ور در تعادل', v: frac * 100, unit: '٪' },
        { k: 'حجم غوطه‌ور V_sub', v: vol * frac * 1000, unit: 'L' },
        { k: 'حجم بیرون از سیال V_above', v: vol * (1 - frac) * 1000, unit: 'L' },
        { k: 'وضعیت', v: ro <= rf ? 'شناور' : 'در حال سقوط', unit: '' },
        { k: 'نسبت چگالی ρ_o/ρ_f', v: ro / rf, unit: '' }
      ]);
    });
  }

  function tension(api) {
    var e = api.open(
      'کشش سطح و قطره',
      'فشار اضافی داخل حباب و قطره با انحنای متفاوت',
      280,
      [
        'ΔP = 2γ / R  (قطره یا حاب تک‌سطحی)   |   ΔP = 4γ / R  (حباب صابونی دو‌سطحی)',
        'ΔP₁ − ΔP₂ = 2γ (1/R₁ − 1/R₂)'
      ]
    );
    var R1 = api.put(e.grid, { label: 'شعاع R₁', unit: 'mm', min: 0.1, max: 20, step: 0.1, value: 1 });
    var R2 = api.put(e.grid, { label: 'شعاع R₂', unit: 'mm', min: 0.1, max: 20, step: 0.1, value: 5 });
    var GA = api.put(e.grid, { label: 'ضریب کشش سطح γ', unit: 'mN/m', min: 10, max: 150, step: 1, value: 72 });

    api.add(function () {
      var s = fit(e.s);
      var ctx = s.ctx;
      var w = s.w;
      var h = s.h;
      ctx.clearRect(0, 0, w, h);

      var r1 = nv(R1.get()) / 1000;
      var r2 = nv(R2.get()) / 1000;
      var g = nv(GA.get()) / 1000;
      if (r1 <= 0) { r1 = 1e-6; }
      if (r2 <= 0) { r2 = 1e-6; }
      if (g <= 0) { g = 1e-6; }

      var d1 = 2 * g / r1;
      var d2 = 2 * g / r2;
      var hiP = Math.max(d1, d2);
      var loP = 0;

      var p1x = w * 0.29;
      var p2x = w * 0.71;
      var cy = h * 0.52;
      var sc = Math.min(h * 0.34 / r1, h * 0.34 / r2);
      var gapScale = (p2x - p1x - w * 0.06) / (r1 + r2);
      if (gapScale < sc) { sc = gapScale; }
      var pr1 = r1 * sc;
      var pr2 = r2 * sc;

      ln(ctx, p1x + pr1, cy, p2x - pr2, cy, COL.steel, 6);
      ln(ctx, p1x + pr1, cy, p2x - pr2, cy, COL.line, 2);

      cir(ctx, p1x, cy, pr1, COL.ink, mix(COL.hi, COL.lo, (d1 - loP) / (hiP || 1)), 2);
      cir(ctx, p2x, cy, pr2, COL.ink, mix(COL.hi, COL.lo, (d2 - loP) / (hiP || 1)), 2);
      cir(ctx, p1x - pr1 * 0.35, cy - pr1 * 0.35, Math.max(2, pr1 * 0.16), '#ffffff', null, 1);
      cir(ctx, p2x - pr2 * 0.3, cy - pr2 * 0.3, Math.max(2, pr2 * 0.12), '#ffffff', null, 1);

      dash(ctx, p1x, cy - pr1, p1x, cy + pr1, COL.dim, 1, 4);
      dash(ctx, p2x, cy - pr2, p2x, cy + pr2, COL.dim, 1, 4);
      arr(ctx, p1x - pr1, cy, p1x + pr1, cy, COL.ink, 1.5, 7);
      arr(ctx, p2x - pr2, cy, p2x + pr2, cy, COL.ink, 1.5, 7);
      txt(ctx, 'R₁ = ' + n2(r1 * 1000, 1) + ' mm', p1x, cy - pr1 - 10, COL.ink, 12, 'center');
      txt(ctx, 'R₂ = ' + n2(r2 * 1000, 1) + ' mm', p2x, cy - pr2 - 10, COL.ink, 12, 'center');
      txt(ctx, 'ΔP₁ = ' + n2(d1, 1) + ' Pa', p1x, cy + pr1 + 22, COL.hi, 13, 'center');
      txt(ctx, 'ΔP₂ = ' + n2(d2, 1) + ' Pa', p2x, cy + pr2 + 22, COL.lo, 13, 'center');
      txt(ctx, 'γ = ' + n2(g * 1000, 0) + ' mN/m   اختلاف فشار = ' + n2(d1 - d2, 1) + ' Pa', w * 0.06, h * 0.94, COL.eE, 13);
    });

    api.addUp(function () {
      var r1 = nv(R1.get()) / 1000;
      var r2 = nv(R2.get()) / 1000;
      var g = nv(GA.get()) / 1000;
      if (r1 <= 0) { r1 = 1e-6; }
      if (r2 <= 0) { r2 = 1e-6; }
      var d1 = 2 * g / r1;
      var d2 = 2 * g / r2;
      e.ro.update([
        { k: 'فشار اضافی قطره ۱ ΔP₁ = 2γ/R₁', v: d1, unit: 'Pa' },
        { k: 'فشار اضافی قطره ۲ ΔP₂ = 2γ/R₂', v: d2, unit: 'Pa' },
        { k: 'اختلاف فشار ΔP₁ − ΔP₂', v: d1 - d2, unit: 'Pa' },
        { k: 'حباب صابونی ۱ ΔP = 4γ/R₁', v: 4 * g / r1, unit: 'Pa' },
        { k: 'حباب صابونی ۲ ΔP = 4γ/R₂', v: 4 * g / r2, unit: 'Pa' },
        { k: 'نسبت فشارها ΔP₁/ΔP₂ = R₂/R₁', v: d1 / d2, unit: '' },
        { k: 'نیروی سطح کل F = γ · L', v: g * PI2 * r1, unit: 'N' },
        { k: 'قطر بیشینه پایدار (رابطه فشار-رادیوس)', v: 2 * g / 1000, unit: 'kPa' }
      ]);
    });
  }

  function waves(api) {
    var e = api.open(
      'موج و داپلر',
      'انتشار موج تناوبی، حرکت منبع و ناظر و اثر داپلر',
      340,
      [
        'v = f λ   |   λ_obs = (v − v_s) / f   |   f_obs = f (v − v_o) / (v − v_s)',
        'قرارداد علامت: سرعت مثبت یعنی حرکت به سوی طرف مقابل'
      ]
    );
    var F = api.put(e.grid, { label: 'فرکانس f', unit: 'Hz', min: 0.2, max: 5, step: 0.05, value: 2 });
    var LA = api.put(e.grid, { label: 'طول موج λ', unit: 'm', min: 0.3, max: 6, step: 0.05, value: 1.5 });
    var V = api.put(e.grid, { label: 'سرعت موج v', unit: 'm/s', min: 1, max: 20, step: 0.1, value: 3 });
    var VS = api.put(e.grid, { label: 'سرعت منبع v_s', unit: 'm/s', min: 0, max: 8, step: 0.05, value: 0 });
    var VO = api.put(e.grid, { label: 'سرعت ناظر v_o', unit: 'm/s', min: -8, max: 8, step: 0.05, value: 0 });

    api.add(function (t) {
      var s = fit(e.s);
      var ctx = s.ctx;
      var w = s.w;
      var h = s.h;
      ctx.clearRect(0, 0, w, h);

      var f = nv(F.get());
      var lam = nv(LA.get());
      var v = nv(V.get());
      var vs = nv(VS.get());
      var vo = nv(VO.get());
      if (f <= 0) { f = 0.001; }
      if (v <= 0) { v = 0.001; }

      var lamTrue = v / f;
      var lamObs = (v - vs) / f;
      var fObs = (v - vs) > 0.001 ? f * (v - vo) / (v - vs) : NaN;

      var x0 = w * 0.05;
      var x1 = w * 0.95;
      var span = x1 - x0;
      var cy = h * 0.50;
      var amp = h * 0.17;
      var pxPerM = clamp(span / (lamTrue * 3), 5, 300);

      ln(ctx, x0, cy + amp + 26, x1, cy + amp + 26, COL.line, 2);

      var src = (t * vs * pxPerM) % (span + 200);
      if (src < 0) { src += span + 200; }
      var sx = x1 - src;
      var ob = ((t * vo * pxPerM + span * 0.55) % (span + 200));
      if (ob < 0) { ob += span + 200; }
      var ox = x1 - ob;

      var useLam = lamTrue * pxPerM;
      if (useLam < 20) { useLam = 20; }

      ctx.save();
      ctx.beginPath();
      for (var i = 0; i <= 180; i++) {
        var x = x0 + (span * i) / 180;
        var y = cy + amp * Math.sin((PI2 * (x - x0)) / useLam - (PI2 * (t * v * pxPerM - sx)) / useLam);
        if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
      }
      ctx.strokeStyle = COL.kE;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.restore();

      var lamObsPx = lamObs * pxPerM;
      if (lamObsPx > 12) {
        var nc = Math.min(24, Math.floor(span / lamObsPx));
        for (var c = 0; c <= nc; c++) {
          var cx2 = sx - c * lamObsPx;
          if (cx2 < x0 - 2 || cx2 > x1 + 2) { continue; }
          dash(ctx, cx2, cy - amp - 16, cx2, cy + amp + 18, COL.uE, 1.2, 4);
        }
        txt(ctx, 'λ_obs = ' + n2(lamObs, 3) + ' m', x0, h * 0.10, COL.uE, 13);
      }

      box(ctx, sx - 4, cy - amp - 24, 8, (amp + 24) * 2, null, COL.eE, 0);
      arr(ctx, sx, cy - amp - 34, sx - vs * 6, cy - amp - 34, COL.eE, 2.5, 8);
      txt(ctx, 'منبع', sx - 10, cy - amp - 42, COL.eE, 12, 'right');

      box(ctx, ox - 3, cy - amp - 20, 6, (amp + 20) * 2, null, COL.sat, 0);
      arr(ctx, ox, cy - amp - 30, ox + vo * 6, cy - amp - 30, COL.sat, 2.5, 8);
      txt(ctx, 'ناظر', ox + 10, cy - amp - 38, COL.sat, 12, 'left');

      txt(ctx, 'f_obs = ' + (isNaN(fObs) ? '-' : n2(fObs, 3)) + ' Hz', x0, h * 0.96, COL.hi, 13);
      txt(ctx, 'λ (ورودی) = ' + n2(lam, 2) + ' m', x0 + 190, h * 0.96, COL.dim, 13);
      txt(ctx, 'fλ = ' + n2(f * lam, 2) + ' m/s', x0 + 360, h * 0.96, COL.dim, 13);
      txt(ctx, 'خطوط‌چین: جبهه‌های موج فشرده در جلوی منبع', w * 0.46, h * 0.10, COL.dim, 12);
    });

    api.addUp(function () {
      var f = nv(F.get());
      var lam = nv(LA.get());
      var v = nv(V.get());
      var vs = nv(VS.get());
      var vo = nv(VO.get());
      if (f <= 0) { f = 0.001; }
      if (v <= 0) { v = 0.001; }
      var vCheck = f * lam;
      var lamObs = (v - vs) / f;
      var fObs = (v - vs) > 0.001 ? f * (v - vo) / (v - vs) : NaN;
      e.ro.update([
        { k: 'سرعت موج از f و λ (v_check = fλ)', v: vCheck, unit: 'm/s' },
        { k: 'خطای سازگاری ورودی', v: ((v - vCheck) / vCheck) * 100, unit: '٪' },
        { k: 'طول موج واقعی λ = v/f', v: v / f, unit: 'm' },
        { k: 'طول موج مشاهده‌شده λ_obs', v: lamObs, unit: 'm' },
        { k: 'بسامد مشاهده‌شده f_obs', v: fObs, unit: 'Hz' },
        { k: 'افزایش بسامد Δf', v: isNaN(fObs) ? NaN : fObs - f, unit: 'Hz' },
        { k: 'تغییر طول موج Δλ', v: lamObs - lam, unit: 'm' },
        { k: 'نسبت طول موج λ_obs/λ', v: lamObs / lam, unit: '' },
        { k: 'شرط فراصوت', v: vs >= v ? 'منبع فراصوت' : 'مادون‌ صوت', unit: '' }
      ]);
    });
  }

  function build(host) {
    var api = makeApi(host);
    shm(api);
    spring(api);
    pendulum(api);
    gravity(api);
    bernoulli(api);
    buoyancy(api);
    tension(api);
    waves(api);
    api.start();
  }

  PH.register('oscillations', {
    title: 'نوسان، گرانش، سیال و موج',
    subtitle: 'آزمایشگاه تعاملی نوسان هماهنگ، گرانش سیاره‌ای، مکانیک سیالات و موج و داپلر',
    build: build
  });
})();
(function () {
  'use strict';

  var PH = window.PH;

  var K = 8.988e9;
  var EPS0 = 8.854e-12;

  var POS = '#ff5a6e';
  var NEG = '#5b9bff';
  var INK = '#e8eef8';
  var DIM = '#93a1b5';
  var ACC = '#ffc857';
  var FAINT = 'rgba(150,170,200,0.14)';
  var SOFT = 'rgba(150,170,200,0.30)';
  var FONT = '12px Tahoma, "Segoe UI", sans-serif';
  var FONT_B = 'bold 13px Tahoma, "Segoe UI", sans-serif';

  var HEAT = [];
  for (var hi = 0; hi < 64; hi++) {
    var ht = hi / 63;
    HEAT.push('rgb(' + Math.round(28 + 226 * Math.pow(ht, 1.6)) + ',' + Math.round(44 + 168 * Math.pow(ht, 2.4)) + ',' + Math.round(120 - 66 * Math.pow(ht, 1.1)) + ')');
  }

  var sess = null;

  function dispose() {
    if (!sess) return;
    sess.loops.forEach(function (l) {
      l.dead = true;
      if (l.id) cancelAnimationFrame(l.id);
      l.id = 0;
    });
    sess.listeners.forEach(function (fn) { window.removeEventListener('resize', fn); });
    window.removeEventListener('focus', sess.onVis);
    document.removeEventListener('visibilitychange', sess.onVis);
    sess = null;
  }

  function pump(l) {
    if (l.dead || document.hidden || !sess.host.isConnected || !l.host.isConnected) { l.id = 0; return; }
    l.draw();
    l.id = requestAnimationFrame(function () { pump(l); });
  }

  function kick() {
    if (!sess) return;
    sess.loops.forEach(function (l) {
      if (l.dead || l.id) return;
      if (document.hidden || !sess.host.isConnected || !l.host.isConnected) return;
      l.id = requestAnimationFrame(function () { l.id = 0; pump(l); });
    });
  }

  function loop(host, draw) {
    var l = { host: host, draw: draw, id: 0, dead: false };
    sess.loops.push(l);
    kick();
    return l;
  }

  function onResize(fn) {
    window.addEventListener('resize', fn);
    sess.listeners.push(fn);
  }

  function surface(host, height) {
    var cv = PH.canvas(host, { height: height });
    var el = cv.canvas;
    var ctx = cv.ctx;
    function metrics() {
      var k = 1;
      if (typeof ctx.getTransform === 'function') {
        var t = ctx.getTransform();
        if (t && t.a) k = t.a;
      }
      return { w: el.width / k, h: el.height / k };
    }
    return {
      el: el,
      ctx: ctx,
      metrics: metrics,
      sync: function () { if (cv.resize) cv.resize(); },
      clear: function () {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, el.width, el.height);
        ctx.restore();
      }
    };
  }

  function trim(s) {
    if (s.indexOf('.') < 0) return s;
    s = s.replace(/0+$/, '');
    if (s.charAt(s.length - 1) === '.') s = s.slice(0, -1);
    return s;
  }

  function sci(v, d) {
    if (typeof v !== 'number' || !isFinite(v)) return '-';
    if (v === 0) return '0';
    var a = Math.abs(v);
    var e = Math.floor(Math.log(a) / Math.LN10);
    var m = v / Math.pow(10, e);
    return trim(m.toFixed(d)) + 'e' + e;
  }

  function fmt(v, d) {
    if (typeof v !== 'number' || !isFinite(v)) return '-';
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a >= 1 && a < 1e6) return PH.num(v, d === undefined ? 3 : d);
    return sci(v, d === undefined ? 3 : d);
  }

  function row(k, v, u) { return { k: k, v: v, unit: u || '' }; }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function card(host, title, subtitle) {
    var c = PH.panel(title, subtitle);
    host.appendChild(c);
    return c.body;
  }

  function formula(parent, text) {
    parent.appendChild(PH.el('div', { class: 'formula', text: text }));
  }

  function slider(parent, opts) {
    var c = PH.control(opts);
    parent.appendChild(c.root);
    return c;
  }

  function label(ctx, text, x, y, size, color, align, bold) {
    ctx.font = bold ? FONT_B : (size + 'px Tahoma, "Segoe UI", sans-serif');
    ctx.fillStyle = color;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text), x, y);
  }

  function arrow(ctx, x1, y1, x2, y2, color, width, head) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width || 2;
    ctx.lineCap = 'round';
    if (len < 0.8) {
      ctx.beginPath();
      ctx.arc(x1, y1, 2.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    var hs = Math.min(head || 9, len * 0.45);
    var ux = dx / len;
    var uy = dy / len;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - ux * hs * 0.9, y2 - uy * hs * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * hs + uy * hs * 0.55, y2 - uy * hs - ux * hs * 0.55);
    ctx.lineTo(x2 - ux * hs - uy * hs * 0.55, y2 - uy * hs + ux * hs * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  function dot(ctx, x, y, r, fill, stroke) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  function glyph(ctx, x, y, r, q, text) {
    dot(ctx, x, y, r, q >= 0 ? POS : NEG, 'rgba(0,0,0,0.35)');
    label(ctx, text, x, y + 0.5, 13, '#0d1220', 'center', true);
  }

  function grid(ctx, m, step) {
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = step; x < m.w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, m.h); }
    for (var y = step; y < m.h; y += step) { ctx.moveTo(0, y); ctx.lineTo(m.w, y); }
    ctx.stroke();
  }

  function fieldAt(list, x, y) {
    var ex = 0, ey = 0;
    for (var i = 0; i < list.length; i++) {
      var dx = x - list[i].x;
      var dy = y;
      var r2 = dx * dx + dy * dy;
      if (r2 < 1e-4) continue;
      var s = K * list[i].q * 1e-6 / (r2 * Math.sqrt(r2));
      ex += s * dx;
      ey += s * dy;
    }
    return [ex, ey];
  }

  function potAt(list, x, y) {
    var v = 0;
    for (var i = 0; i < list.length; i++) {
      var r = Math.sqrt((x - list[i].x) * (x - list[i].x) + y * y);
      if (r < 0.12) r = 0.12;
      v += K * list[i].q * 1e-6 / r;
    }
    return v;
  }

  function contour(vals, nx, ny, level) {
    var segs = [];
    for (var j = 0; j < ny - 1; j++) {
      for (var i = 0; i < nx - 1; i++) {
        var a = vals[j * nx + i];
        var b = vals[j * nx + i + 1];
        var c = vals[(j + 1) * nx + i + 1];
        var d = vals[(j + 1) * nx + i];
        var idx = 0;
        if (a > level) idx |= 1;
        if (b > level) idx |= 2;
        if (c > level) idx |= 4;
        if (d > level) idx |= 8;
        if (idx === 0 || idx === 15) continue;
        var T = [i + (b !== a ? (level - a) / (b - a) : 0.5), j];
        var R = [i + 1, j + (c !== b ? (level - b) / (c - b) : 0.5)];
        var B = [i + (c !== d ? (level - d) / (c - d) : 0.5), j + 1];
        var L = [i, j + (d !== a ? (level - a) / (d - a) : 0.5)];
        if (idx === 1 || idx === 14) segs.push([T, L]);
        else if (idx === 2 || idx === 13) segs.push([T, R]);
        else if (idx === 3 || idx === 12) segs.push([L, R]);
        else if (idx === 4 || idx === 11) segs.push([R, B]);
        else if (idx === 6 || idx === 9) segs.push([T, B]);
        else if (idx === 7 || idx === 8) segs.push([L, B]);
        else { segs.push([T, L]); segs.push([R, B]); }
      }
    }
    return segs;
  }

  function coulomb(body) {
    var st = { q1: 1, q2: 1, r: 1 };
    var s = surface(body, 300);
    var ctx1 = s.ctx;
    var g = PH.grid(body, 3);
    var c1 = slider(g, { label: 'بارداری نخست q1', unit: 'µC', min: -5, max: 5, step: 0.1, value: st.q1, onInput: sync });
    var c2 = slider(g, { label: 'بارداری دوم q2', unit: 'µC', min: -5, max: 5, step: 0.1, value: st.q2, onInput: sync });
    var c3 = slider(g, { label: 'فاصله r', unit: 'm', min: 0.2, max: 5, step: 0.05, value: st.r, onInput: sync });
    formula(body, 'F = k q1 q2 / r^2        k = 8.988e9 N·m²/C²        E = k |q| / r^2');
    var chips = PH.el('div', { class: 'chips' });
    var chip1 = PH.el('span', { class: 'chip q-pos', text: 'q1' });
    var chip2 = PH.el('span', { class: 'chip q-pos', text: 'q2' });
    chips.appendChild(chip1);
    chips.appendChild(chip2);
    body.appendChild(chips);
    var out = PH.readout([]);
    body.appendChild(out);

    var t0 = 0;
    function sync() {
      st.q1 = Number(c1.get());
      st.q2 = Number(c2.get());
      st.r = Number(c3.get());
      var f = K * st.q1 * st.q2 * 1e-12 / (st.r * st.r);
      var e1 = K * Math.abs(st.q2) * 1e-6 / (st.r * st.r);
      var e2 = K * Math.abs(st.q1) * 1e-6 / (st.r * st.r);
      chip1.className = 'chip ' + (st.q1 >= 0 ? 'q-pos' : 'q-neg');
      chip1.textContent = 'q1 = ' + fmt(st.q1, 2) + ' µC';
      chip2.className = 'chip ' + (st.q2 >= 0 ? 'q-pos' : 'q-neg');
      chip2.textContent = 'q2 = ' + fmt(st.q2, 2) + ' µC';
      out.update([
        row('اندازه نیرو |F|', fmt(Math.abs(f)), 'N'),
        row('نیرو روی بار نخست', fmt(f), 'N'),
        row('نیرو روی بار دوم', fmt(-f), 'N'),
        row('جهت نیرو', f > 0 ? 'دافعه' : (f < 0 ? 'جاذبه' : 'بدون نیرو'), ''),
        row('شدت میدان در محل q1', fmt(e1), 'N/C'),
        row('شدت میدان در محل q2', fmt(e2), 'N/C'),
        row('انرژی پتانسیل جفت', fmt(K * Math.abs(st.q1 * st.q2) * 1e-12 / st.r), 'J')
      ]);
    }

    function draw() {
      s.clear();
      var m = s.metrics();
      var w = m.w, h = m.h;
      grid(ctx1, m, 40);
      var cx = w / 2, cy = h / 2;
      var sc = (w * 0.30) / Math.max(st.r, 0.01);
      var x1 = cx - sc * st.r / 2;
      var x2 = cx + sc * st.r / 2;
      var f = K * st.q1 * st.q2 * 1e-12 / (st.r * st.r);
      var t = (Math.sin(t0) + 1) / 2;
      var len = (w * 0.13) * (0.25 + 0.75 * (1 - Math.exp(-Math.abs(f) / 18))) * (0.82 + 0.18 * t);
      ctx1.strokeStyle = SOFT;
      ctx1.lineWidth = 2;
      ctx1.setLineDash([7, 6]);
      ctx1.beginPath();
      ctx1.moveTo(x1, cy);
      ctx1.lineTo(x2, cy);
      ctx1.stroke();
      ctx1.setLineDash([]);
      label(ctx1, 'r = ' + fmt(st.r, 2) + ' m', cx, cy - 16, 11, DIM);
      var d1 = f > 0 ? -1 : 1;
      var d2 = f > 0 ? 1 : -1;
      arrow(ctx1, x1, cy + 34, x1 + d1 * len, cy + 34, INK, 2.6, 10);
      arrow(ctx1, x2, cy + 34, x2 + d2 * len, cy + 34, INK, 2.6, 10);
      label(ctx1, fmt(f) + ' N', x1 + d1 * (len / 2), cy + 52, 11, DIM);
      label(ctx1, fmt(-f) + ' N', x2 + d2 * (len / 2), cy + 52, 11, DIM);
      label(ctx1, 'F روی q1', x1, cy + 70, 10, DIM);
      label(ctx1, 'F روی q2', x2, cy + 70, 10, DIM);
      glyph(ctx1, x1, cy, 14, st.q1, st.q1 >= 0 ? '+' : '−');
      glyph(ctx1, x2, cy, 14, st.q2, st.q2 >= 0 ? '+' : '−');
      label(ctx1, 'F = ' + fmt(Math.abs(f)) + ' N', 12, 14, 11, ACC, 'left');
      label(ctx1, f > 0 ? 'هم‌علامت → دافعه' : (f < 0 ? ' خلاف‌علامت → جاذبه' : ''), 12, 32, 11, DIM, 'left');
    }

    var last = 0;
    sync();
    loop(body, function () {
      var now = performance.now();
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;
      t0 += dt * 2;
      draw();
    });
    onResize(function () { s.sync(); });
  }

  function pointField(body) {
    var Q0 = 1e-6;
    var st = { q: 2, r: 1 };
    var s = surface(body, 320);
    var g = PH.grid(body, 2);
    var c1 = slider(g, { label: 'بارداری نقطه q', unit: 'µC', min: -5, max: 5, step: 0.1, value: st.q, onInput: sync });
    var c2 = slider(g, { label: 'شعاع آزمون r', unit: 'm', min: 0.2, max: 4, step: 0.05, value: st.r, onInput: sync });
    formula(body, 'E = k q / r^2        V = k q / r        U = q0 V        q0 = 1 µC');
    var chips = PH.el('div', { class: 'chips' });
    var chip = PH.el('span', { class: 'chip q-pos', text: 'q' });
    chips.appendChild(chip);
    body.appendChild(chips);
    var out = PH.readout([]);
    body.appendChild(out);
    var tE = PH.readout([]);
    body.appendChild(tE);
    var tV = PH.readout([]);
    body.appendChild(tV);

    var t0 = 0;
    function sync() {
      st.q = Number(c1.get());
      st.r = Number(c2.get());
      var q = st.q * 1e-6;
      var E = K * q / (st.r * st.r);
      var V = K * q / st.r;
      chip.className = 'chip ' + (st.q >= 0 ? 'q-pos' : 'q-neg');
      chip.textContent = 'q = ' + fmt(st.q, 2) + ' µC';
      out.update([
        row('شدت میدان در شعاع r', fmt(E), 'N/C'),
        row('پتانسیل در شعاع r', fmt(V), 'V'),
        row('انرژی پتانسیل بار آزمایشی', fmt(Q0 * V), 'J'),
        row('جهت میدان', st.q >= 0 ? 'رو به بیرون' : 'رو به داخل', ''),
        row('شار الکتریکی Φ = 4πr²E', fmt(Math.abs(E * 4 * Math.PI * st.r * st.r)), 'N·m²/C'),
        row('بار محصور Q = ε0 Φ', fmt(Math.abs(EPS0 * E * 4 * Math.PI * st.r * st.r)), 'C')
      ]);
      var re = [], rv = [];
      for (var i = 1; i <= 5; i++) {
        var r = st.r * i;
        re.push(row('r = ' + fmt(r, 2) + ' m', fmt(K * q / (r * r)), 'N/C'));
        rv.push(row('r = ' + fmt(r, 2) + ' m', fmt(K * q / r), 'V'));
      }
      tE.update(re);
      tV.update(rv);
    }

    var ctx = s.ctx;
    function draw() {
      s.clear();
      var m = s.metrics();
      grid(ctx, m, 40);
      var cx = m.w / 2, cy = m.h / 2;
      var reach = st.r * 4.4;
      var sc = (m.h * 0.44) / reach;
      var dir = st.q >= 0 ? 1 : -1;
      var count = clamp(6 + Math.round(12 * Math.abs(st.q) / 5), 6, 22);
      var pulse = (Math.sin(t0) + 1) / 2;
      for (var i = 0; i < count; i++) {
        var ang = (Math.PI * 2 * i) / count + 0.16;
        var ca = Math.cos(ang), sa = Math.sin(ang);
        var r0 = 18 / sc;
        var r1 = reach;
        ctx.strokeStyle = FAINT;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (var t = 0; t <= 40; t++) {
          var rr = r0 + (r1 - r0) * (t / 40);
          var px = cx + ca * rr * sc, py = cy - sa * rr * sc;
          if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        var marks = 5;
        for (var k = 1; k <= marks; k++) {
          var tm = k / (marks + 1) + 0.05 * Math.sin(t0 + i);
          var rm = r0 + (r1 - r0) * tm;
          var mx = cx + ca * rm * sc, my = cy - sa * rm * sc;
          var ex = mx + dir * ca * 11, ey = my - dir * sa * 11;
          arrow(ctx, mx, my, ex, ey, dir > 0 ? POS : NEG, 1.8, 7);
        }
      }
      for (var j = 1; j <= 4; j++) {
        var ring = st.r * j * sc;
        if (ring > m.h * 0.55) continue;
        ctx.strokeStyle = j === 1 ? ACC : SOFT;
        ctx.lineWidth = j === 1 ? 2 : 1.2;
        ctx.setLineDash(j === 1 ? [] : [5, 5]);
        ctx.beginPath();
        ctx.arc(cx, cy, ring, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        label(ctx, 'r=' + fmt(st.r * j, 2), cx, cy - ring - 8, 9, j === 1 ? ACC : DIM);
      }
      dot(ctx, cx, cy, 16, st.q >= 0 ? POS : NEG, 'rgba(0,0,0,0.35)');
      label(ctx, st.q >= 0 ? '+' : '−', cx, cy + 0.5, 16, '#0d1220', 'center', true);
      dot(ctx, cx + st.r * sc, cy, 5 + 1.5 * pulse, 'rgba(255,255,255,0.85)', ACC);
      label(ctx, 'بار آزمایشی', cx + st.r * sc, cy + 18, 10, ACC);
      label(ctx, 'E = ' + fmt(K * st.q * 1e-6 / (st.r * st.r)) + ' N/C', 12, 14, 11, ACC, 'left');
      label(ctx, 'V = ' + fmt(K * st.q * 1e-6 / st.r) + ' V', 12, 32, 11, DIM, 'left');
      label(ctx, 'خطوط میدان: ' + count, m.w - 12, 14, 11, DIM, 'right');
    }

    var last = 0;
    sync();
    loop(body, function () {
      var now = performance.now();
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;
      t0 += dt * 2;
      draw();
    });
    onResize(function () { s.sync(); });
  }

  function multiCharge(body) {
    var NX = 34, NY = 22;
    var BX0 = -6, BX1 = 6, BY0 = -3.6, BY1 = 3.6;
    var st = { n: 3, px: 3.2, py: 1.2, R: 1.6 };
    var ch = [
      { x: -2.5, q: 2 },
      { x: 0, q: -2 },
      { x: 2.5, q: 1.5 },
      { x: 4.5, q: -1 }
    ];
    var s = surface(body, 320);
    var off = document.createElement('canvas');
    off.width = NX;
    off.height = NY;
    var octx = off.getContext('2d');
    var dirty = true;
    var gridE = new Float32Array(NX * NY);
    var cells = new Array(NX * NY);
    var lines = [];
    var probe = [0, 0, 0, 0, 0];
    var flux = [0, 0];

    var gtop = PH.grid(body, 3);
    var cN = slider(gtop, { label: 'تعداد بارها', unit: '', min: 2, max: 4, step: 1, value: st.n, onInput: onCount });
    var cPx = slider(gtop, { label: 'مختصات نقطه آزمون x', unit: 'm', min: -5, max: 5, step: 0.1, value: st.px, onInput: onProbe });
    var cPy = slider(gtop, { label: 'مختصات نقطه آزمون y', unit: 'm', min: -3.4, max: 3.4, step: 0.1, value: st.py, onInput: onProbe });
    var gmid = PH.grid(body, 4);
    var cR = slider(gmid, { label: 'شعاع سطح گاوس R', unit: 'm', min: 0.3, max: 4, step: 0.1, value: st.R, onInput: onProbe });
    var gch = PH.grid(body, 4);
    formula(body, 'E = Σ k qi ri / |ri|^3        V = Σ k qi / ri        Φ = ∮ E·dA = Q_enc / ε0');
    var chips = PH.el('div', { class: 'chips' });
    body.appendChild(chips);
    var out = PH.readout([]);
    body.appendChild(out);
    var outG = PH.readout([]);
    body.appendChild(outG);

    function active() {
      var a = [];
      for (var i = 0; i < st.n; i++) a.push(ch[i]);
      return a;
    }

    function onCount() {
      st.n = clamp(Math.round(Number(cN.get())), 2, 4);
      renderChargeControls();
      dirty = true;
    }

    function onProbe() {
      st.px = Number(cPx.get());
      st.py = Number(cPy.get());
      st.R = Number(cR.get());
      dirty = true;
    }

    function renderChargeControls() {
      while (gch.firstChild) gch.removeChild(gch.firstChild);
      while (chips.firstChild) chips.removeChild(chips.firstChild);
      for (var i = 0; i < st.n; i++) {
        (function (i) {
          var cx = slider(gch, {
            label: 'موقعیت بار ' + (i + 1), unit: 'm', min: -5, max: 5, step: 0.1, value: ch[i].x,
            onInput: function () { ch[i].x = Number(cx.get()); dirty = true; }
          });
          var cq = slider(gch, {
            label: 'مقدار بار ' + (i + 1), unit: 'µC', min: -4, max: 4, step: 0.1, value: ch[i].q,
            onInput: function () { ch[i].q = Number(cq.get()); dirty = true; }
          });
          var cp = PH.el('span', { class: 'chip ' + (ch[i].q >= 0 ? 'q-pos' : 'q-neg'), text: 'q' + (i + 1) });
          chips.appendChild(cp);
          ch[i].chip = cp;
        })(i);
      }
    }

    function sample() {
      var list = active();
      var emax = 1e-12;
      for (var j = 0; j < NY; j++) {
        var wy = BY1 - ((BY1 - BY0) * j) / (NY - 1);
        for (var i = 0; i < NX; i++) {
          var wx = BX0 + ((BX1 - BX0) * i) / (NX - 1);
          var e = fieldAt(list, wx, wy);
          var mag = Math.sqrt(e[0] * e[0] + e[1] * e[1]);
          var k = j * NX + i;
          gridE[k] = mag;
          if (mag > emax) emax = mag;
        }
      }
      var den = Math.log(1 + emax);
      for (var q = 0; q < NX * NY; q++) {
        var t = den > 0 ? Math.log(1 + gridE[q]) / den : 0;
        var idx = clamp(Math.round(t * 63), 0, 63);
        cells[q] = HEAT[idx];
      }
      octx.clearRect(0, 0, NX, NY);
      for (var jj = 0; jj < NY; jj++) {
        for (var ii = 0; ii < NX; ii++) {
          octx.fillStyle = cells[jj * NX + ii];
          octx.fillRect(ii, jj, 1, 1);
        }
      }
      lines = [];
      for (var c = 0; c < list.length; c++) {
        if (list[c].q === 0) continue;
        for (var a = 0; a < 10; a++) {
          var ang = (Math.PI * 2 * a) / 10 + 0.31;
          lines.push(trace([list[c].x + 0.22 * Math.cos(ang), 0.22 * Math.sin(ang)], 1, list));
          lines.push(trace([list[c].x + 0.22 * Math.cos(ang), 0.22 * Math.sin(ang)], -1, list));
        }
      }
      var pv = fieldAt(list, st.px, st.py);
      probe = [pv[0], pv[1], Math.sqrt(pv[0] * pv[0] + pv[1] * pv[1]), potAt(list, st.px, st.py), Math.atan2(pv[1], pv[0]) * 180 / Math.PI];
      var enc = 0;
      for (var z = 0; z < list.length; z++) {
        if (Math.sqrt((st.px - list[z].x) * (st.px - list[z].x) + st.py * st.py) < st.R) enc += list[z].q;
      }
      flux = gauss(list, enc);
      for (var u = 0; u < list.length; u++) {
        if (!list[u].chip) continue;
        list[u].chip.className = 'chip ' + (list[u].q >= 0 ? 'q-pos' : 'q-neg');
        list[u].chip.textContent = 'q' + (u + 1) + ' = ' + fmt(list[u].q, 2) + ' µC';
      }
      out.update([
        row('مولفه برد Ex', fmt(probe[0]), 'N/C'),
        row('مولفه عمودی Ey', fmt(probe[1]), 'N/C'),
        row('شدت میدان خالص', fmt(probe[2]), 'N/C'),
        row('زاویه میدان با محور x', fmt(probe[4], 1), '°'),
        row('پتانسیل خالص در نقطه آزمون', fmt(probe[3]), 'V'),
        row('بار محصور در سطح گاوس', fmt(enc * 1e-6), 'C')
      ]);
      outG.update([
        row('شار محاسبه‌شده Φ (انتگرال عددی)', fmt(flux[0]), 'N·m²/C'),
        row('بار محصور / ε0', fmt(flux[1]), 'N·m²/C'),
        row('خطای نسبی', fmt(flux[1] !== 0 ? Math.abs((flux[0] - flux[1]) / flux[1]) * 100 : 0, 2), '%')
      ]);
    }

    function gauss(list, enc) {
      var N = 180;
      var sum = 0;
      for (var i = 0; i < N; i++) {
        var a = (Math.PI * 2 * i) / N;
        var x = st.px + st.R * Math.cos(a);
        var y = st.py + st.R * Math.sin(a);
        var e = fieldAt(list, x, y);
        sum += (e[0] * Math.cos(a) + e[1] * Math.sin(a)) * st.R * (Math.PI * 2 / N);
      }
      return [sum, enc * 1e-6 / EPS0];
    }

    function trace(seed, dir, list) {
      var pts = [];
      var x = seed[0], y = seed[1];
      for (var i = 0; i < 170; i++) {
        var e = fieldAt(list, x, y);
        var mg = Math.sqrt(e[0] * e[0] + e[1] * e[1]);
        if (mg < 1e-9) break;
        x += (e[0] / mg) * dir * 0.11;
        y += (e[1] / mg) * dir * 0.11;
        if (x < BX0 || x > BX1 || y < BY0 || y > BY1) break;
        var hit = false;
        for (var j = 0; j < list.length; j++) {
          if (list[j].q === 0) continue;
          var dx = x - list[j].x;
          if (Math.sqrt(dx * dx + y * y) < 0.24) { hit = true; break; }
        }
        if (hit) break;
        pts.push(x, y);
      }
      return pts;
    }

    var ctx = s.ctx;
    function draw() {
      s.clear();
      var m = s.metrics();
      var scx = m.w / (BX1 - BX0);
      var scy = m.h / (BY1 - BY0);
      var sc = Math.min(scx, scy);
      var ox = m.w / 2 - ((BX0 + BX1) / 2) * sc;
      var oy = m.h / 2 + ((BY0 + BY1) / 2) * sc;
      function PX(x) { return ox + x * sc; }
      function PY(y) { return oy - y * sc; }
      ctx.save();
      ctx.globalAlpha = 0.62;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, m.w, m.h);
      ctx.restore();
      ctx.strokeStyle = 'rgba(220,235,255,0.30)';
      ctx.lineWidth = 1.1;
      for (var l = 0; l < lines.length; l++) {
        var pts = lines[l];
        if (pts.length < 4) continue;
        ctx.beginPath();
        ctx.moveTo(PX(pts[0]), PY(pts[1]));
        for (var k = 2; k < pts.length; k += 2) ctx.lineTo(PX(pts[k]), PY(pts[k + 1]));
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(PX(st.px), PY(st.py), st.R * sc, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, 'سطح گاوس R = ' + fmt(st.R, 2) + ' m', PX(st.px), PY(st.py) - st.R * sc - 10, 10, ACC);
      var list = active();
      for (var c = 0; c < list.length; c++) {
        glyph(ctx, PX(list[c].x), PY(0), 13, list[c].q, list[c].q >= 0 ? '+' : '−');
      }
      var pxx = PX(st.px), pyy = PY(st.py);
      if (probe[2] > 0) {
        var mx = pxx + (probe[0] / probe[2]) * Math.min(70, 18 + 46 * Math.log(1 + probe[2] / 40));
        var my = pyy - (probe[1] / probe[2]) * Math.min(70, 18 + 46 * Math.log(1 + probe[2] / 40));
        arrow(ctx, pxx, pyy, mx, my, ACC, 2.6, 10);
      }
      dot(ctx, pxx, pyy, 7, ACC, '#0d1220');
      label(ctx, 'نقطه آزمون', pxx, pyy - 18, 10, ACC);
      label(ctx, '|E| = ' + fmt(probe[2]) + ' N/C', 12, 14, 11, ACC, 'left');
      label(ctx, 'V = ' + fmt(probe[3]) + ' V', 12, 32, 11, DIM, 'left');
    }

    renderChargeControls();
    sample();
    dirty = false;
    loop(body, function () {
      if (dirty) { sample(); dirty = false; }
      draw();
    });
    onResize(function () { s.sync(); dirty = true; });
  }

  function dipole(body) {
    var I = 4e-8;
    var st = { p: 20, th: 60, E: 200 };
    var s = surface(body, 320);
    var g = PH.grid(body, 3);
    var c1 = slider(g, { label: 'گشتاور دوقطبی p', unit: 'nC·m', min: -60, max: 60, step: 1, value: st.p, onInput: sync });
    var c2 = slider(g, { label: 'زاویه اولیه θ', unit: '°', min: 0, max: 180, step: 1, value: st.th, onInput: onTheta });
    var c3 = slider(g, { label: 'شدت میدان E', unit: 'N/C', min: 0, max: 500, step: 5, value: st.E, onInput: sync });
    formula(body, 'τ = − p E sin θ        U = − p E cos θ        W = p E (cos θ − 1)');
    var chips = PH.el('div', { class: 'chips' });
    var chip = PH.el('span', { class: 'chip q-pos', text: 'p' });
    chips.appendChild(chip);
    body.appendChild(chips);
    var out = PH.readout([]);
    body.appendChild(out);

    var ang = st.th * Math.PI / 180;
    var om = 0;
    var t0 = 0;

    function onTheta() {
      st.th = Number(c2.get());
      ang = st.th * Math.PI / 180;
      om = 0;
      sync();
    }

    function sync() {
      st.p = Number(c1.get());
      st.th = Number(c2.get());
      st.E = Number(c3.get());
      chip.className = 'chip ' + (st.p >= 0 ? 'q-pos' : 'q-neg');
      chip.textContent = 'p = ' + fmt(st.p, 1) + ' nC·m';
      vals();
    }

    function vals() {
      var p = st.p * 1e-9;
      var E = st.E;
      var deg = ang * 180 / Math.PI;
      if (deg > 180) deg -= 360;
      if (deg < -180) deg += 360;
      var tau = -p * E * Math.sin(ang);
      var U = -p * E * Math.cos(ang);
      var W = p * E * (Math.cos(ang) - 1);
      var verdict = st.p === 0 ? 'بدون دوقطبی' : (tau < -1e-15 ? 'چرخش به سمت کاهش زاویه' : (tau > 1e-15 ? 'چرخش به سمت افزایش زاویه' : 'در تعادل'));
      out.update([
        row('زاویه لحظه‌ای θ', fmt(deg, 1), '°'),
        row('گشتاور الکتریکی τ', fmt(tau), 'N·m'),
        row('انرژی پتانسیل U', fmt(U), 'J'),
        row('کار میدان برای هم‌راستا شدن W', fmt(W), 'J'),
        row('جهت گشتاور', verdict, ''),
        row('هم‌راستایی', st.p >= 0 ? 'هم‌جهت با E' : 'پادجهت با E', '')
      ]);
    }

    var ctx = s.ctx;
    function draw() {
      s.clear();
      var m = s.metrics();
      grid(ctx, m, 40);
      var cx = m.w / 2, cy = m.h / 2 + 6;
      var eLen = Math.min(m.w * 0.34, 60 + 1.6 * st.E);
      arrow(ctx, cx - eLen, cy, cx + eLen, cy, DIM, 2.4, 11);
      label(ctx, 'E = ' + fmt(st.E, 0) + ' N/C', cx + eLen, cy + 18, 11, DIM);
      var pl = clamp(34 + Math.abs(st.p) * 1.5, 0, m.w * 0.3);
      var dx = Math.cos(ang), dy = -Math.sin(ang);
      var px = cx + dx * pl, py = cy + dy * pl;
      ctx.strokeStyle = 'rgba(255,255,255,0.20)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, pl, 0, Math.PI * 2);
      ctx.stroke();
      var pulse = (Math.sin(t0 * 1.6) + 1) / 2;
      arrow(ctx, cx, cy, px, py, st.p >= 0 ? POS : NEG, 3, 11);
      ctx.strokeStyle = ACC;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 52, -ang, 0);
      ctx.stroke();
      var lm = 52;
      label(ctx, fmt(ang * 180 / Math.PI, 0) + '°', cx + Math.cos(-ang / 2) * (lm + 16), cy + Math.sin(-ang / 2) * (lm + 16), 11, ACC);
      glyph(ctx, px, py, 13, st.p, st.p >= 0 ? '+' : '−');
      glyph(ctx, cx - dx * pl, cy - dy * pl, 13, -st.p, st.p >= 0 ? '−' : '+');
      dot(ctx, cx, cy, 4, INK);
      ctx.globalAlpha = 0.25 + 0.15 * pulse;
      arrow(ctx, cx, cy - 16, cx, cy - 40, ACC, 2, 8);
      ctx.globalAlpha = 1;
      label(ctx, 'جهت τ', cx, cy - 50, 10, ACC);
      var p = st.p * 1e-9;
      label(ctx, 'τ = ' + fmt(-p * st.E * Math.sin(ang)) + ' N·m', 12, 14, 11, ACC, 'left');
      label(ctx, 'U = ' + fmt(-p * st.E * Math.cos(ang)) + ' J', 12, 32, 11, DIM, 'left');
    }

    sync();
    loop(body, function () {
      var p = st.p * 1e-9;
      var tau = -p * st.E * Math.sin(ang);
      var acc = tau / I - 1.1 * om;
      om += acc * 0.016;
      ang += om * 0.016;
      if (Math.abs(om) < 1e-6 && Math.abs(Math.sin(ang)) < 1e-4) { om = 0; }
      t0 += 0.016;
      vals();
      draw();
    });
    onResize(function () { s.sync(); });
  }

  function potentialWork(body) {
    var Q0 = 1e-6;
    var X0 = 3;
    var SEP = 2;
    var NX = 60, NY = 38;
    var BX0 = -1.5, BX1 = 7.5, BY0 = -3.4, BY1 = 3.4;
    var st = { q1: 2, q2: -2, d: 1 };
    var s = surface(body, 320);
    var g = PH.grid(body, 3);
    var c1 = slider(g, { label: 'بارداری q1', unit: 'µC', min: -4, max: 4, step: 0.1, value: st.q1, onInput: onChange });
    var c2 = slider(g, { label: 'بارداری q2', unit: 'µC', min: -4, max: 4, step: 0.1, value: st.q2, onInput: onChange });
    var c3 = slider(g, { label: 'جابه‌جایی بار آزمایشی', unit: 'm', min: -1.4, max: 2.4, step: 0.1, value: st.d, onInput: onChange });
    formula(body, 'V(x) = k q1/r1 + k q2/r2        ΔV = V_f − V_i        ΔU = q0 ΔV        W = −ΔU');
    var chips = PH.el('div', { class: 'chips' });
    var chip1 = PH.el('span', { class: 'chip q-pos', text: 'q1' });
    var chip2 = PH.el('span', { class: 'chip q-pos', text: 'q2' });
    chips.appendChild(chip1);
    chips.appendChild(chip2);
    body.appendChild(chips);
    var out = PH.readout([]);
    body.appendChild(out);

    var dirty = true;
    var mv = { t: 1, from: X0 + st.d, to: X0 + st.d, x: X0 + st.d };
    var segs = [];
    var vals = new Float32Array(NX * NY);
    var last = 0;

    function onChange() {
      st.q1 = Number(c1.get());
      st.q2 = Number(c2.get());
      var d = Number(c3.get());
      var to = X0 + d;
      if (Math.abs(to - SEP) < 0.35) to = SEP + (to >= SEP ? 0.35 : -0.35);
      if (to < 0.35) to = 0.35;
      mv.from = mv.x;
      mv.to = to;
      mv.t = 0;
      st.d = d;
      chip1.className = 'chip ' + (st.q1 >= 0 ? 'q-pos' : 'q-neg');
      chip1.textContent = 'q1 = ' + fmt(st.q1, 2) + ' µC';
      chip2.className = 'chip ' + (st.q2 >= 0 ? 'q-pos' : 'q-neg');
      chip2.textContent = 'q2 = ' + fmt(st.q2, 2) + ' µC';
      dirty = true;
      sync();
    }

    function pot(x) {
      var r1 = Math.max(Math.abs(x), 0.15);
      var r2 = Math.max(Math.abs(x - SEP), 0.15);
      return K * st.q1 * 1e-6 / r1 + K * st.q2 * 1e-6 / r2;
    }

    function sync() {
      var vi = pot(X0);
      var vf = pot(mv.to);
      var dv = vf - vi;
      var du = Q0 * dv;
      out.update([
        row('پتانسیل اولیه V_i', fmt(vi), 'V'),
        row('پتانسیل نهایی V_f', fmt(vf), 'V'),
        row('تغییر پتانسیل ΔV', fmt(dv), 'V'),
        row('تغییر انرژی پتانسیل ΔU', fmt(du), 'J'),
        row('کار میدان الکتریکی W', fmt(-du), 'J'),
        row('کار نیروی خارجی', fmt(du), 'J'),
        row('جابه‌جایی خالص', fmt(mv.to - X0, 2), 'm')
      ]);
    }

    function sample() {
      for (var j = 0; j < NY; j++) {
        var wy = BY1 - ((BY1 - BY0) * j) / (NY - 1);
        for (var i = 0; i < NX; i++) {
          var wx = BX0 + ((BX1 - BX0) * i) / (NX - 1);
          vals[j * NX + i] = pot(wx);
        }
      }
      var base = K * Math.abs(st.q1 >= 0.02 ? st.q1 : st.q2) * 1e-6 / 2.2;
      if (base < 1e-12) base = 500;
      var ref = st.q1 >= 0 ? 1 : -1;
      segs = [];
      var mult = [0.2, 0.35, 0.5, 0.75, 1, 1.4, 2, 2.8, 4, 6];
      for (var m = 0; m < mult.length; m++) {
        segs = segs.concat(contour(vals, NX, NY, ref * base * mult[m]));
      }
    }

    var ctx = s.ctx;
    function draw() {
      s.clear();
      var m = s.metrics();
      grid(ctx, m, 40);
      var sc = Math.min(m.w / (BX1 - BX0), m.h / (BY1 - BY0));
      var ox = m.w / 2 - ((BX0 + BX1) / 2) * sc;
      var oy = m.h / 2 + ((BY0 + BY1) / 2) * sc;
      function PX(x) { return ox + x * sc; }
      function PY(y) { return oy - y * sc; }
      ctx.strokeStyle = 'rgba(140,200,255,0.45)';
      ctx.lineWidth = 1.1;
      for (var i = 0; i < segs.length; i++) {
        var sg = segs[i];
        ctx.beginPath();
        ctx.moveTo(ox + (BX0 + ((BX1 - BX0) * sg[0][0]) / (NX - 1)) * sc, oy - (BY1 - ((BY1 - BY0) * sg[0][1]) / (NY - 1)) * sc);
        ctx.lineTo(ox + (BX0 + ((BX1 - BX0) * sg[1][0]) / (NX - 1)) * sc, oy - (BY1 - ((BY1 - BY0) * sg[1][1]) / (NY - 1)) * sc);
        ctx.stroke();
      }
      glyph(ctx, PX(0), PY(0), 15, st.q1, st.q1 >= 0 ? '+' : '−');
      glyph(ctx, PX(SEP), PY(0), 15, st.q2, st.q2 >= 0 ? '+' : '−');
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(PX(X0), PY(0));
      ctx.lineTo(PX(mv.x), PY(0));
      ctx.stroke();
      ctx.setLineDash([]);
      arrow(ctx, PX(mv.from), PY(0), PX(mv.x), PY(0), ACC, 2.6, 10);
      dot(ctx, PX(mv.x), PY(0), 11, ACC, '#0d1220');
      label(ctx, 'q0', PX(mv.x), PY(0) - 22, 11, ACC);
      label(ctx, 'خطوط هم‌پتانسیل', 12, 14, 11, DIM, 'left');
      label(ctx, 'x = ' + fmt(mv.x, 2) + ' m', m.w - 12, 14, 11, ACC, 'right');
      label(ctx, 'V = ' + fmt(pot(mv.x)) + ' V', m.w - 12, 32, 11, DIM, 'right');
    }

    sample();
    sync();
    loop(body, function () {
      var now = performance.now();
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;
      if (mv.t < 1) {
        mv.t = Math.min(1, mv.t + dt / 1.6);
        var e = mv.t < 0.5 ? 2 * mv.t * mv.t : 1 - Math.pow(-2 * mv.t + 2, 2) / 2;
        mv.x = mv.from + (mv.to - mv.from) * e;
      } else {
        mv.x = mv.to;
      }
      if (dirty) { sample(); dirty = false; sync(); }
      draw();
    });
    onResize(function () { s.sync(); dirty = true; });
  }

  function capacitor(body) {
    var st = { A: 1, dcm: 1, er: 4, V: 100, n: 1 };
    var s = surface(body, 300);
    var g = PH.grid(body, 3);
    var c1 = slider(g, { label: 'سطح صفحه A', unit: 'm²', min: 0.05, max: 2, step: 0.05, value: st.A, onInput: sync });
    var c2 = slider(g, { label: 'فاصله d', unit: 'cm', min: 0.1, max: 5, step: 0.1, value: st.dcm, onInput: sync });
    var c3 = slider(g, { label: 'ضریب گذرندگی εr', unit: '', min: 1, max: 10, step: 0.1, value: st.er, onInput: sync });
    var c4 = slider(g, { label: 'ولتاژ V', unit: 'V', min: 0, max: 500, step: 5, value: st.V, onInput: sync });
    var c5 = slider(g, { label: 'تعداد خازن موازی n', unit: '', min: 1, max: 8, step: 1, value: st.n, onInput: sync });
    formula(body, 'C = ε0 εr A / d        Q = C V        E = V / d        U = ½ C V²        u = ½ ε0 εr E²');
    var chips = PH.el('div', { class: 'chips' });
    var chipA = PH.el('span', { class: 'chip q-pos', text: 'صفحه مثبت' });
    var chipB = PH.el('span', { class: 'chip q-neg', text: 'صفحه منفی' });
    chips.appendChild(chipA);
    chips.appendChild(chipB);
    body.appendChild(chips);
    var out = PH.readout([]);
    body.appendChild(out);

    var t0 = 0;
    function sync() {
      st.A = Number(c1.get());
      st.dcm = Number(c2.get());
      st.er = Number(c3.get());
      st.V = Number(c4.get());
      st.n = clamp(Math.round(Number(c5.get())), 1, 8);
      var d = st.dcm / 100;
      var C = EPS0 * st.er * st.A / d;
      var Ct = st.n * C;
      var E = st.V / d;
      var U = 0.5 * Ct * st.V * st.V;
      var u = 0.5 * EPS0 * st.er * E * E;
      out.update([
        row('فاصله d', fmt(d), 'm'),
        row('ظرفیت هر خازن C', fmt(C), 'F'),
        row('ظرفیت معادل C = nC', fmt(Ct), 'F'),
        row('بار کل Q', fmt(Ct * st.V), 'C'),
        row('میدان میان صفحات E', fmt(E), 'V/m'),
        row('انرژی کل U', fmt(U), 'J'),
        row('چگالی انرژی u', fmt(u), 'J/m³'),
        row('انرژی هر خازن', fmt(0.5 * C * st.V * st.V), 'J')
      ]);
    }

    var ctx = s.ctx;
    function draw() {
      s.clear();
      var m = s.metrics();
      grid(ctx, m, 40);
      var d = st.dcm / 100;
      var n = st.n;
      var gap = 26 + 130 * ((d - 0.001) / 0.049);
      var unit = Math.min((m.w - 60) / n, 70);
      var ph = Math.min(m.h - 90, 150);
      var cy = m.h / 2 + 6;
      var E = st.V / d;
      var emax = 500 / 0.001;
      var pulse = (Math.sin(t0 * 2) + 1) / 2;
      for (var i = 0; i < n; i++) {
        var cx = m.w / 2 + (i - (n - 1) / 2) * unit;
        var xL = cx - gap / 2;
        var xR = cx + gap / 2;
        ctx.fillStyle = 'rgba(190,205,230,0.16)';
        ctx.fillRect(xL - 5, cy - ph / 2, 5, ph);
        ctx.fillRect(xR, cy - ph / 2, 5, ph);
        ctx.strokeStyle = 'rgba(220,232,250,0.65)';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(xL - 5, cy - ph / 2, 5, ph);
        ctx.strokeRect(xR, cy - ph / 2, 5, ph);
        var rows = 4;
        var fade = Math.log(1 + E / 20) / Math.log(1 + emax / 20);
        for (var r = 0; r < rows; r++) {
          var yy = cy - ph / 2 + (ph * (r + 0.5)) / rows;
          for (var k = 0; k < 4; k++) {
            var t = k / 3;
            var sIdx = t < 0.4 ? -1 : 1;
            var a = xL + (xR - xL) * t;
            var len = 8 + 12 * fade * (0.75 + 0.25 * pulse);
            arrow(ctx, a, yy, a + sIdx * len, yy, ACC, 1.6, 6);
          }
        }
        var cnt = Math.max(2, Math.round(ph / 34));
        for (var c = 0; c < cnt; c++) {
          var py = cy - ph / 2 + (ph * (c + 0.5)) / cnt;
          label(ctx, '+', xL - 13, py, 13, POS, 'center', true);
          label(ctx, '−', xR + 13, py, 13, NEG, 'center', true);
        }
        if (gap < 70) label(ctx, 'd = ' + fmt(st.dcm, 1) + ' cm', cx, cy + ph / 2 + 16, 10, DIM);
      }
      label(ctx, 'C = ' + fmt(EPS0 * st.er * st.A / d) + ' F', 12, 14, 11, ACC, 'left');
      label(ctx, 'E = ' + fmt(E) + ' V/m', 12, 32, 11, DIM, 'left');
      label(ctx, 'n = ' + n + ' خازن موازی', m.w - 12, 14, 11, DIM, 'right');
    }

    var last = 0;
    sync();
    loop(body, function () {
      var now = performance.now();
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;
      t0 += dt;
      draw();
    });
    onResize(function () { s.sync(); });
  }

  function dielectric(body) {
    var REF_A = 1;
    var REF_D = 0.01;
    var st = { er: 4, sig: 1 };
    var s = surface(body, 300);
    var g = PH.grid(body, 2);
    var c1 = slider(g, { label: 'ضریب گذرندگی εr', unit: '', min: 1, max: 12, step: 0.1, value: st.er, onInput: sync });
    var c2 = slider(g, { label: 'چگالی بار سطحی آزاد σ', unit: 'µC/m²', min: 0.1, max: 4, step: 0.05, value: st.sig, onInput: sync });
    formula(body, 'E_in = σ / (ε0 εr)        E_out = σ / ε0        P = ε0 (εr − 1) E_in        C = ε0 εr A / d');
    var chips = PH.el('div', { class: 'chips' });
    var chipP = PH.el('span', { class: 'chip q-pos', text: 'بار مقید مثبت' });
    var chipN = PH.el('span', { class: 'chip q-neg', text: 'بار مقید منفی' });
    chips.appendChild(chipP);
    chips.appendChild(chipN);
    body.appendChild(chips);
    var out = PH.readout([]);
    body.appendChild(out);

    var t0 = 0;
    function sync() {
      st.er = Number(c1.get());
      st.sig = Number(c2.get());
      var sig = st.sig * 1e-6;
      var Ein = sig / (EPS0 * st.er);
      var Eout = sig / EPS0;
      var P = sig * (1 - 1 / st.er);
      var C0 = EPS0 * REF_A / REF_D;
      var C = EPS0 * st.er * REF_A / REF_D;
      out.update([
        row('میدان داخل دی‌الکتریک E_in', fmt(Ein), 'V/m'),
        row('میدان بیرون دی‌الکتریک E_out', fmt(Eout), 'V/m'),
        row('نسبت E_out / E_in', fmt(st.er, 2), ''),
        row('بردار قطبش P', fmt(P), 'C/m²'),
        row('بار سطحی مقید σ_b', fmt(P), 'C/m²'),
        row('ظرفیت خالی C0 (A=1 m², d=1 cm)', fmt(C0), 'F'),
        row('ظرفیت با دی‌الکتریک C', fmt(C), 'F'),
        row('نسبت C / C0', fmt(st.er, 2), ''),
        row('افت ولتاژ با دی‌الکتریک', fmt(1 / st.er * 100, 2), '% از مقدار اولیه')
      ]);
    }

    var ctx = s.ctx;
    function draw() {
      s.clear();
      var m = s.metrics();
      grid(ctx, m, 40);
      var cy = m.h / 2 + 6;
      var x0 = m.w * 0.13;
      var x1 = m.w * 0.87;
      var hx0 = m.w * 0.36;
      var hx1 = m.w * 0.64;
      var eOut = st.sig * 1e-6 / EPS0;
      var eIn = st.sig * 1e-6 / (EPS0 * st.er);
      var pulse = (Math.sin(t0 * 2) + 1) / 2;
      ctx.fillStyle = 'rgba(120,190,255,0.09)';
      ctx.fillRect(hx0, 26, hx1 - hx0, m.h - 52);
      ctx.strokeStyle = 'rgba(140,200,255,0.55)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(hx0, 26, hx1 - hx0, m.h - 52);
      label(ctx, 'دی‌الکتریک εr = ' + fmt(st.er, 1), (hx0 + hx1) / 2, 40, 11, DIM);
      var rows = 5;
      for (var r = 0; r < rows; r++) {
        var yy = 56 + ((m.h - 84) * r) / (rows - 1);
        arrow(ctx, x0, yy, hx0 - 6, yy, ACC, 2, 9);
        arrow(ctx, hx1 + 6, yy, x1, yy, ACC, 2, 9);
        arrow(ctx, hx0 + 6, yy, hx1 - 6, yy, ACC, 1.8, 8);
        label(ctx, 'E_out', x0 - 2, yy - 12, 9, DIM, 'left');
        label(ctx, 'E_in', hx0 + 6, yy - 12, 9, ACC, 'left');
      }
      label(ctx, 'E_out = ' + fmt(eOut) + ' V/m', m.w / 2, 18, 10, ACC);
      label(ctx, 'σ = ' + fmt(st.sig, 2) + ' µC/m²', m.w / 2, m.h - 14, 10, DIM);
      var dipCols = 5, dipRows = 6;
      for (var c = 0; c < dipCols; c++) {
        for (var d = 0; d < dipRows; d++) {
          var px = hx0 + 18 + ((hx1 - hx0 - 36) * c) / (dipCols - 1);
          var py = 52 + ((m.h - 104) * d) / (dipRows - 1);
          var off = 5 * (1 - 1 / st.er) * (0.85 + 0.15 * pulse);
          dot(ctx, px - off, py, 3.2, NEG);
          dot(ctx, px + off, py, 3.2, POS);
        }
      }
      label(ctx, '−', hx0, cy - m.h * 0.36, 14, NEG, 'center', true);
      label(ctx, '+', hx1, cy - m.h * 0.36, 14, POS, 'center', true);
      label(ctx, 'σ_b', hx0 - 18, cy, 10, NEG);
      label(ctx, 'σ_b', hx1 + 18, cy, 10, POS);
    }

    var last = 0;
    sync();
    loop(body, function () {
      var now = performance.now();
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;
      t0 += dt;
      draw();
    });
    onResize(function () { s.sync(); });
  }

  PH.register('electrostatics', {
    title: 'الکترواستاتیک',
    subtitle: 'نیروی کولن، میدان و پتانسیل، خازن و دی‌الکتریک',
    build: function (host) {
      dispose();
      sess = {
        host: host,
        loops: [],
        listeners: [],
        onVis: function () { kick(); }
      };
      window.addEventListener('focus', sess.onVis);
      document.addEventListener('visibilitychange', sess.onVis);
      coulomb(card(host, 'قانون کولن', 'نیروی بین دو بار نقطه‌ای و شدت میدان در محل هر بار'));
      pointField(card(host, 'میدان الکتریکی نقطه بار', 'تغییر میدان و پتانسیل بر حسب شعاع و سطح‌های هم‌پتانسیل'));
      multiCharge(card(host, 'برهم‌کنش چند بار و قانون گاوس', 'نقشه حرارتی میدان، بردار میدان در نقطه آزمون و شار از سطح گاوس'));
      dipole(card(host, 'دیپول در میدان یکنواخت', 'گشتاور، انرژی پتانسیل و چرخش دوقطبی تا هم‌راستایی'));
      potentialWork(card(host, 'پتانسیل و کار', 'تغییر پتانسیل و انرژی با جابه‌جایی بار آزمایشی و خطوط هم‌پتانسیل'));
      capacitor(card(host, 'خازن', 'خازن صفحات موازی با میانگر خازن‌های موازی'));
      dielectric(card(host, 'دی‌الکتریک', 'قطبش، بار مقید و کاهش میدان در دی‌الکتریک'));
    }
  });
})();
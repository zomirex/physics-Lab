(function (global) {
  'use strict';

  var doc = global.document;

  var PH = {
    sections: {},
    state: {},
    order: []
  };

  function isPlain(v) {
    return v !== null && typeof v === 'object';
  }

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function applyAttrs(node, attrs) {
    if (!isPlain(attrs)) return;
    Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'class' || key === 'className') {
        node.className = value;
      } else if (key === 'text') {
        node.textContent = String(value);
      } else if (key === 'dataset' || key === 'data') {
        Object.keys(value).forEach(function (dk) {
          node.dataset[dk] = String(value[dk]);
        });
      } else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected' || key === 'indeterminate') {
        node[key] = value;
      } else {
        node.setAttribute(key, String(value));
      }
    });
  }

  function appendChild(node, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (c) { appendChild(node, c); });
      return;
    }
    if (typeof children === 'object' && children.nodeType) {
      node.appendChild(children);
      return;
    }
    node.appendChild(doc.createTextNode(String(children)));
  }

  PH.el = function (tag, attrs, children) {
    var node = doc.createElement(tag || 'div');
    applyAttrs(node, attrs);
    appendChild(node, children);
    return node;
  };

  PH.num = function (v, digits) {
    var d = digits === undefined || digits === null ? 2 : digits;
    if (v === null || v === undefined || v === '') return '-';
    var n = typeof v === 'number' ? v : parseFloat(v);
    if (typeof n !== 'number' || isNaN(n)) return '-';
    if (!isFinite(n)) return n > 0 ? '+∞' : '-∞';
    var s = n.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s;
  };

  PH.register = function (id, section) {
    if (!id || !isPlain(section)) return;
    PH.sections[id] = section;
    if (PH.order.indexOf(id) === -1) PH.order.push(id);
    if (booted) buildNav();
  };

  PH.panel = function (title, subtitle) {
    var card = PH.el('div', { class: 'card' });
    var head = PH.el('div', { class: 'card-head' }, [
      PH.el('h3', { class: 'card-title', text: title || '' }),
      subtitle ? PH.el('p', { class: 'card-sub', text: subtitle }) : null
    ]);
    var body = PH.el('div', { class: 'card-body' });
    card.appendChild(head);
    card.appendChild(body);
    card.body = body;
    card.head = head;
    return card;
  };

  PH.grid = function (host, cols) {
    var g = PH.el('div', { class: 'ph-grid', dataset: { cols: String(cols || 3) } });
    if (host && host.appendChild) host.appendChild(g);
    return g;
  };

  PH.control = function (cfg) {
    cfg = cfg || {};
    var type = cfg.type === 'select' || cfg.options ? 'select' : (cfg.type || 'range');
    var root = PH.el('div', { class: 'ph-ctrl' });
    var headEl = null;

    if (cfg.label) {
      headEl = PH.el('div', { class: 'ph-ctrl-head' }, [
        PH.el('label', { class: 'ph-ctrl-label', text: cfg.label }),
        cfg.unit ? PH.el('span', { class: 'ph-badge', text: cfg.unit }) : null
      ]);
      root.appendChild(headEl);
    }

    var valueEl = PH.el('span', { class: 'ph-ctrl-value', text: PH.num(cfg.value, cfg.digits) });
    if (headEl) headEl.appendChild(valueEl);

    var inputEl;

    if (type === 'select') {
      inputEl = PH.el('select', { class: 'ph-input' });
      (cfg.options || []).forEach(function (opt) {
        var o = PH.el('option', { value: String(opt.value), text: String(opt.label) });
        inputEl.appendChild(o);
      });
      if (cfg.value !== undefined && cfg.value !== null) inputEl.value = String(cfg.value);
    } else if (type === 'number' || type === 'text') {
      inputEl = PH.el('input', { class: 'ph-input', type: type });
      if (cfg.min !== undefined) inputEl.min = cfg.min;
      if (cfg.max !== undefined) inputEl.max = cfg.max;
      if (cfg.step !== undefined) inputEl.step = cfg.step;
      if (cfg.placeholder) inputEl.placeholder = cfg.placeholder;
      inputEl.value = cfg.value === undefined || cfg.value === null ? '' : String(cfg.value);
    } else {
      inputEl = PH.el('input', { class: 'ph-range', type: 'range' });
      if (cfg.min !== undefined) inputEl.min = cfg.min;
      if (cfg.max !== undefined) inputEl.max = cfg.max;
      if (cfg.step !== undefined) inputEl.step = cfg.step;
      if (cfg.value !== undefined) inputEl.value = cfg.value;
    }

    root.appendChild(inputEl);

    function get() {
      if (type === 'select') return inputEl.value;
      var v = parseFloat(inputEl.value);
      return isNaN(v) ? null : v;
    }

    function set(v) {
      if (v === null || v === undefined) return;
      inputEl.value = String(v);
      sync();
    }

    function sync() {
      if (type === 'select') {
        var sel = inputEl.options[inputEl.selectedIndex];
        valueEl.textContent = sel ? sel.text : inputEl.value;
      } else {
        valueEl.textContent = PH.num(get(), cfg.digits);
      }
    }

    function fire() {
      sync();
      if (typeof cfg.onInput === 'function') cfg.onInput(get(), cfg);
    }

    inputEl.addEventListener('input', fire);
    if (type === 'select') inputEl.addEventListener('change', fire);

    sync();

    return { root: root, get: get, set: set, valueEl: valueEl, inputEl: inputEl, sync: sync };
  };

  PH.readNumber = function (host, key, cfg) {
    cfg = cfg || {};
    var target = host && host.appendChild ? host : PH.el('div');
    var c = PH.control({
      label: cfg.label || key,
      unit: cfg.unit,
      type: cfg.type || 'number',
      min: cfg.min,
      max: cfg.max,
      step: cfg.step,
      value: cfg.value === undefined ? 0 : cfg.value,
      digits: cfg.digits,
      onInput: function (v) {
        PH.state[key] = v;
        if (typeof cfg.onInput === 'function') cfg.onInput(v, key);
      }
    });
    PH.state[key] = c.get();
    target.appendChild(c.root);
    c.key = key;
    return c;
  };

  PH.readout = function (rows) {
    var root = PH.el('div', { class: 'ph-readout' });

    function update(list) {
      root.textContent = '';
      (list || []).forEach(function (row) {
        if (!row) return;
        var cls = 'ph-readout-row';
        if (row.kind) cls += ' is-' + row.kind;
        var val;
        if (typeof row.v === 'number') {
          val = PH.num(row.v, row.digits === undefined ? 2 : row.digits);
        } else if (row.v === undefined || row.v === null) {
          val = '-';
        } else {
          val = String(row.v);
        }
        root.appendChild(PH.el('div', { class: cls }, [
          PH.el('span', { class: 'ph-readout-k', text: row.k === undefined ? '' : String(row.k) }),
          PH.el('span', { class: 'ph-readout-v', text: val }),
          row.unit ? PH.el('span', { class: 'ph-readout-u', text: row.unit }) : null
        ]));
      });
    }

    update(rows);
    root.update = update;
    return root;
  };

  var HEIGHTS = { 160: 1, 220: 1, 280: 1, 340: 1, 400: 1, 460: 1 };

  PH.canvas = function (host, opts) {
    opts = opts || {};
    var h = opts.height || 280;
    if (!HEIGHTS[h]) {
      var nearest = 280;
      Object.keys(HEIGHTS).forEach(function (k) {
        if (Math.abs(Number(k) - h) < Math.abs(Number(nearest) - h)) nearest = Number(k);
      });
      h = nearest;
    }

    var wrap = PH.el('div', { class: 'ph-canvas-wrap', dataset: { h: String(h) } });
    var canvas = PH.el('canvas', { class: 'ph-canvas' });
    wrap.appendChild(canvas);
    if (host && host.appendChild) host.appendChild(wrap);

    var ctx = canvas.getContext('2d');
    var dpr = 1;
    var cssW = 0;
    var cssH = h;

    function size() {
      return { w: cssW, h: cssH, dpr: dpr, width: canvas.width, height: canvas.height };
    }

    function resize() {
      dpr = global.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      var w = rect.width;
      if (!w) w = wrap.getBoundingClientRect().width - 12;
      cssW = Math.max(1, Math.round(w));
      cssH = rect.height ? Math.round(rect.height) : h;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return size();
    }

    function clear(w, hgt) {
      var W = w === undefined ? cssW : w;
      var H = hgt === undefined ? cssH : hgt;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.restore();
    }

    function line(x1, y1, x2, y2, opts) {
      opts = opts || {};
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = opts.color || '#2f3d4f';
      ctx.lineWidth = opts.width || 1;
      if (opts.dash) ctx.setLineDash(opts.dash);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    function arrow(x1, y1, x2, y2, opts) {
      opts = opts || {};
      var color = opts.color || '#4cc2ff';
      var width = opts.width || 2;
      line(x1, y1, x2, y2, { color: color, width: width, dash: opts.dash });
      var a = Math.atan2(y2 - y1, x2 - x1);
      var head = opts.head || 10;
      var spread = opts.spread || 0.42;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(a - spread), y2 - head * Math.sin(a - spread));
      ctx.lineTo(x2 - head * Math.cos(a + spread), y2 - head * Math.sin(a + spread));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function text(str, x, y, opts) {
      opts = opts || {};
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = opts.color || '#93a2b8';
      ctx.font = (opts.weight || '400') + ' ' + (opts.size || 12) + 'px ' + (opts.mono ? 'Consolas, monospace' : '"Vazirmatn","Segoe UI",Tahoma,sans-serif');
      ctx.textAlign = opts.align || 'left';
      ctx.textBaseline = opts.baseline || 'alphabetic';
      ctx.direction = opts.rtl === false ? 'ltr' : 'rtl';
      ctx.fillText(String(str), x, y);
      ctx.restore();
    }

    function circle(x, y, r, opts) {
      opts = opts || {};
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      ctx.arc(x, y, Math.abs(r), 0, Math.PI * 2);
      if (opts.fill) {
        ctx.fillStyle = opts.fill;
        ctx.fill();
      }
      if (opts.stroke) {
        ctx.strokeStyle = opts.stroke;
        ctx.lineWidth = opts.width || 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    function poly(points, opts) {
      opts = opts || {};
      if (!points || points.length < 2) return;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      if (opts.close !== false) ctx.closePath();
      if (opts.fill) {
        ctx.fillStyle = opts.fill;
        ctx.fill();
      }
      if (opts.stroke) {
        ctx.strokeStyle = opts.stroke;
        ctx.lineWidth = opts.width || 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    function fillPoly(points, opts) {
      var o = opts || {};
      poly(points, { fill: o.fill || 'rgba(76,194,255,0.2)', stroke: o.stroke, width: o.width, close: true });
    }

    function grid(opts) {
      opts = opts || {};
      var step = opts.step || 40;
      var color = opts.color || 'rgba(148,163,184,0.14)';
      var W = cssW;
      var H = cssH;
      for (var x = step; x < W; x += step) {
        line(x, 0, x, H, { color: color, width: 1 });
      }
      for (var y = step; y < H; y += step) {
        line(0, y, W, y, { color: color, width: 1 });
      }
      if (opts.axes !== false) {
        line(opts.x0 === undefined ? 40 : opts.x0, 0, opts.x0 === undefined ? 40 : opts.x0, H, { color: '#7c8aa0', width: 1.5 });
        line(0, opts.y0 === undefined ? 24 : opts.y0, W, opts.y0 === undefined ? 24 : opts.y0, { color: '#7c8aa0', width: 1.5 });
      }
    }

    var api = {
      canvas: canvas,
      wrap: wrap,
      ctx: ctx,
      clear: clear,
      resize: resize,
      arrow: arrow,
      line: line,
      text: text,
      circle: circle,
      poly: poly,
      fillPoly: fillPoly,
      grid: grid,
      size: size
    };

    resize();
    if (global.ResizeObserver) {
      var ro = new global.ResizeObserver(function () { resize(); });
      ro.observe(wrap);
      api.destroy = function () { ro.disconnect(); };
    }

    if (opts.onResize && typeof opts.onResize === 'function') opts.onResize(api);

    return api;
  };

  PH.theme = {
    text: '#e8eef7',
    muted: '#93a2b8',
    accent: '#4cc2ff',
    accent2: '#ffb454',
    good: '#5ddc9a',
    warn: '#ffd166',
    bad: '#ff6b6b',
    violet: '#b28dff',
    axis: '#7c8aa0',
    grid: 'rgba(148,163,184,0.14)',
    border: '#2f3d4f',
    panel: '#141b26'
  };

  function titleFor(id) {
    var s = PH.sections[id];
    return s && s.title ? s.title : id;
  }

  function buildNav() {
    var nav = doc.getElementById('nav');
    if (!nav) return;
    nav.textContent = '';
    PH.order.forEach(function (id) {
      var btn = PH.el('button', { class: 'ph-nav-btn', type: 'button', text: titleFor(id) });
      btn.addEventListener('click', function () { PH.go(id); });
      nav.appendChild(PH.el('div', { class: 'ph-nav-item' }, btn));
    });
  }

  function markActive(id) {
    var nav = doc.getElementById('nav');
    if (!nav) return;
    Array.prototype.forEach.call(nav.children, function (c, i) {
      var b = c.querySelector('.ph-nav-btn');
      if (b) b.classList.toggle('is-active', PH.order[i] === id);
    });
  }

  function currentId() {
    var hash = global.location.hash.replace(/^#\/?/, '');
    if (hash && has(PH.sections, hash)) return hash;
    return PH.order[0] || '';
  }

  var cleanup = null;
  var booted = false;

  PH.render = function () {
    var id = currentId();
    var view = doc.getElementById('view');
    if (!view || !id) return;

    if (typeof cleanup === 'function') {
      cleanup();
      cleanup = null;
    }

    if (global.location.hash !== '#/' + id) {
      global.history.replaceState(null, '', '#/' + id);
    }

    view.textContent = '';
    markActive(id);

    var section = PH.sections[id];
    var host = PH.el('div', { class: 'ph-section' }, [
      PH.el('div', { class: 'ph-section-head' }, [
        PH.el('h2', { class: 'ph-section-title', text: titleFor(id) }),
        section.subtitle ? PH.el('p', { class: 'ph-section-sub', text: section.subtitle }) : null
      ])
    ]);
    var body = PH.el('div', { class: 'ph-section-body' });
    host.appendChild(body);
    view.appendChild(host);

    cleanup = section.build(body) || null;

    var rfs = global.requestAnimationFrame;
    if (rfs) rfs(function () { global.dispatchEvent(new global.Event('resize')); });
  };

  PH.go = function (id) {
    if (!has(PH.sections, id)) return;
    if (currentId() === id) {
      PH.render();
    } else {
      global.location.hash = '#/' + id;
    }
  };

  function boot() {
    booted = true;
    buildNav();
    global.addEventListener('hashchange', PH.render);
    PH.render();
  }

  global.PH = PH;

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);

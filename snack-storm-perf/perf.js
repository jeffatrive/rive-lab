// Snack Storm perf test page: a frame meter and a panel of switches, to find what drops the phone to 30 fps.
//
// - The meter (bottom strip) times the page's own animation frames: fps, the average frame, the share of slow frames
//   (over 20 ms: a missed 60 Hz refresh) and the worst frame, every second, plus the drawing resolution.
// - The panel (PERF button) sets the drawing resolution (app.js asks ssPerf.ratio()), the game's GameVM `perf` bits
//   (each turns one part of the frame off; work/perf-uat world.as) and `crowdCap` (the most critters at once).
// - Every setting is timed while it's on. COPY RESULTS puts a table of them on the clipboard to paste into chat.
// The choices are kept in this browser (snackStorm.perfOpts) and come back on reload.
(function () {
  'use strict';

  var KEY = 'snackStorm.perfOpts';
  var SLOW_MS = 20;
  var RATIOS = [[0, 'Phone (full)'], [2, '2x'], [1.5, '1.5x'], [1, '1x']];
  var BITS = [
    [1, 'Ground (path, grass, decals)'],
    [2, 'Night light pools on the ground'],
    [4, 'Night glows, beam, eyes, fireflies'],
    [8, 'All night lighting (tint too)'],
    [16, 'Crowd drawing (critters still there)'],
    [32, 'Snacks, sprays and effects'],
    [64, 'Stands and props'],
    [512, 'Chef and boss'],
    [256, 'Script HUD (arrows, rings, slots, tags)'],
    [128, 'Sound']
  ];
  var CAPS = [[0, 'No cap'], [150, '150'], [100, '100'], [60, '60']];

  var opts = { ratio: 0, bits: 0, cap: 0 };
  try {
    var saved = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (saved) {
      opts.ratio = +saved.ratio || 0;
      opts.bits = +saved.bits || 0;
      opts.cap = +saved.cap || 0;
    }
  } catch (e) { /* private mode: defaults */ }
  // ?data=perf=N / ?data=crowdCap=N / ?ratio=N in the address win over the kept choices (links that set up a test)
  new URLSearchParams(location.search).getAll('data').forEach(function (pair) {
    var m = /^(perf|crowdCap)=(\d+)$/.exec(pair);
    if (m && m[1] === 'perf') opts.bits = +m[2];
    else if (m) opts.cap = +m[2];
  });
  var ratioParam = new URLSearchParams(location.search).get('ratio');
  if (ratioParam !== null) opts.ratio = +ratioParam || 0;
  function store() {
    try { window.localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) { /* ignore */ }
  }

  var perfProp = null, capProp = null, statsProp = null, statsText = null, resize = null, canvas = null;

  function ratio() {
    var d = window.devicePixelRatio || 1;
    return opts.ratio > 0 ? Math.min(opts.ratio, d) : d;
  }

  function apply() {
    if (perfProp) perfProp.value = opts.bits;
    if (capProp) capProp.value = opts.cap;
    if (resize) resize();
  }

  function label() {
    var parts = [ratio() + 'x'];
    BITS.forEach(function (b) { if (opts.bits & b[0]) parts.push('no ' + b[1].split(' (')[0].toLowerCase()); });
    if (opts.cap) parts.push('cap ' + opts.cap);
    return parts.join(', ');
  }

  // ------------------------------------------------------------ the meter

  var last = 0, win = newStats(), seg = newStats(), segLabel = '', log = [];
  function newStats() { return { n: 0, sum: 0, slow: 0, worst: 0, t0: performance.now() }; }
  function add(st, dt) {
    st.n++;
    st.sum += dt;
    if (dt > SLOW_MS) st.slow++;
    if (dt > st.worst) st.worst = dt;
  }
  function critters() {
    var m = statsText && /(\d+) critters/.exec(statsText);
    return m ? +m[1] : -1;
  }
  function closeSegment() {
    var secs = (performance.now() - seg.t0) / 1000;
    if (seg.n > 30 && secs >= 3) {
      log.push({ label: segLabel, secs: secs, fps: seg.n / secs, avg: seg.sum / seg.n, slow: 100 * seg.slow / seg.n,
        worst: seg.worst, crit: seg.crit || 0 });
    }
    seg = newStats();
    segLabel = label();
  }

  function frame(t) {
    if (last) {
      var dt = t - last;
      if (dt < 250 && document.visibilityState === 'visible') { // (a hidden or stalled page isn't a frame)
        add(win, dt);
        add(seg, dt);
      }
    }
    last = t;
    if (t - win.t0 >= 1000) {
      if (statsProp) statsText = statsProp.value;
      var c = critters();
      if (c > (seg.crit || 0)) seg.crit = c;
      var fps = win.n ? win.n * 1000 / (t - win.t0) : 0;
      var px = canvas ? canvas.width + '×' + canvas.height : '';
      meter.textContent = Math.round(fps) + ' fps · avg ' + (win.n ? (win.sum / win.n).toFixed(1) : '-') + ' ms · slow ' +
        (win.n ? Math.round(100 * win.slow / win.n) : 0) + '% · worst ' + Math.round(win.worst) + ' ms · ' +
        ratio() + 'x ' + px + (c >= 0 ? ' · ' + c + ' critters' : '');
      meter.className = fps < 50 ? 'bad' : (fps < 58 ? 'meh' : '');
      win = newStats();
      win.t0 = t;
    }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ the panel

  var css = document.createElement('style');
  css.textContent = [
    '#game{bottom:auto;height:calc(100vh - 26px - env(safe-area-inset-bottom));height:calc(100dvh - 26px - env(safe-area-inset-bottom))}',
    '#perfbar{position:fixed;left:0;right:0;bottom:0;height:26px;padding-bottom:env(safe-area-inset-bottom);display:flex;',
    'align-items:center;gap:6px;background:#15132b;color:#cfe9d0;font:600 11px/1 ui-monospace,Menlo,monospace;z-index:20}',
    '#perfbar button{flex:none;height:22px;margin-left:4px;padding:0 10px;border:0;border-radius:6px;background:#ffcf3f;',
    'color:#2b2210;font:800 11px/1 system-ui,sans-serif}',
    '#perfmeter{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#perfmeter.meh{color:#ffd76a}#perfmeter.bad{color:#ff8a7a}',
    '#perfpanel{position:fixed;left:8px;right:8px;bottom:calc(32px + env(safe-area-inset-bottom));max-height:75vh;',
    'overflow:auto;padding:12px 14px;border-radius:14px;background:rgba(21,19,43,.96);color:#fff;',
    'font:14px/1.3 system-ui,sans-serif;z-index:21;display:none;box-shadow:0 8px 30px rgba(0,0,0,.5)}',
    '#perfpanel.on{display:block}',
    '#perfpanel h3{margin:10px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#ffcf3f}',
    '#perfpanel h3:first-child{margin-top:0}',
    '#perfpanel .row{display:flex;flex-wrap:wrap;gap:6px}',
    '#perfpanel .row button{padding:8px 10px;border-radius:8px;border:1px solid #4a4570;background:#2b2650;color:#fff;font:600 13px system-ui}',
    '#perfpanel .row button.on{background:#3fd0dc;border-color:#3fd0dc;color:#0b2226}',
    '#perfpanel label{display:flex;align-items:center;gap:10px;padding:6px 0}',
    '#perfpanel input{width:20px;height:20px;flex:none}',
    '#perfpanel .note{color:#b9b4d9;font-size:12px;margin:4px 0 0}',
    '#perfpanel .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}',
    '#perfpanel .actions button,#perfpanel .actions a{padding:9px 12px;border-radius:8px;border:0;background:#ffcf3f;',
    'color:#2b2210;font:800 13px system-ui;text-decoration:none}',
    '#perflog{white-space:pre-wrap;font:11px/1.35 ui-monospace,Menlo,monospace;color:#cfe9d0;margin-top:10px}'
  ].join('');
  document.head.appendChild(css);

  var bar = document.createElement('div');
  bar.id = 'perfbar';
  var btn = document.createElement('button');
  btn.textContent = 'PERF';
  var meter = document.createElement('div');
  meter.id = 'perfmeter';
  meter.textContent = 'measuring…';
  bar.appendChild(btn);
  bar.appendChild(meter);
  var panel = document.createElement('div');
  panel.id = 'perfpanel';

  function choiceRow(list, get, set) {
    var row = document.createElement('div');
    row.className = 'row';
    list.forEach(function (c) {
      var b = document.createElement('button');
      b.textContent = c[1];
      b.className = get() === c[0] ? 'on' : '';
      b.addEventListener('click', function () {
        set(c[0]);
        Array.prototype.forEach.call(row.children, function (x) { x.className = ''; });
        b.className = 'on';
        changed();
      });
      row.appendChild(b);
    });
    return row;
  }
  function heading(text) {
    var h = document.createElement('h3');
    h.textContent = text;
    panel.appendChild(h);
  }
  function note(text) {
    var p = document.createElement('p');
    p.className = 'note';
    p.textContent = text;
    panel.appendChild(p);
  }

  heading('Drawing resolution');
  panel.appendChild(choiceRow(RATIOS, function () { return opts.ratio; }, function (v) { opts.ratio = v; }));
  note('Phone (full) is what the rive.to test page draws (3x on most iPhones). The play page draws 2x.');
  heading('Turn off');
  var boxes = [];
  BITS.forEach(function (b) {
    var l = document.createElement('label');
    var i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = (opts.bits & b[0]) !== 0;
    i.addEventListener('change', function () {
      opts.bits = i.checked ? (opts.bits | b[0]) : (opts.bits & ~b[0]);
      changed();
    });
    boxes.push([i, b[0]]);
    l.appendChild(i);
    l.appendChild(document.createTextNode(b[1]));
    panel.appendChild(l);
  });
  heading('Most critters at once');
  var capRow = choiceRow(CAPS, function () { return opts.cap; }, function (v) { opts.cap = v; });
  panel.appendChild(capRow);
  note('A cap applies as the crowd grows; a crowd already bigger shrinks as critters are fed.');

  var actions = document.createElement('div');
  actions.className = 'actions';
  function action(text, fn) {
    var b = document.createElement('button');
    b.textContent = text;
    b.addEventListener('click', fn);
    actions.appendChild(b);
    return b;
  }
  var copyBtn = action('COPY RESULTS', function () {
    closeSegment();
    var text = report();
    logView.textContent = text;
    var done = function () { copyBtn.textContent = 'COPIED'; setTimeout(function () { copyBtn.textContent = 'COPY RESULTS'; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { copyBtn.textContent = 'SELECT BELOW'; });
    else copyBtn.textContent = 'SELECT BELOW';
  });
  action('RESET SWITCHES', function () {
    opts.bits = 0;
    opts.cap = 0;
    boxes.forEach(function (x) { x[0].checked = false; });
    Array.prototype.forEach.call(capRow.children, function (x, k) { x.className = k === 0 ? 'on' : ''; });
    changed();
  });
  var busy = document.createElement('a');
  busy.textContent = 'BUSY AUTOPLAY';
  busy.href = '?data=autoplay=1&data=seed=7';
  actions.appendChild(busy);
  var plain = document.createElement('a');
  plain.textContent = 'NORMAL PLAY';
  plain.href = './';
  actions.appendChild(plain);
  action('CLOSE', function () { panel.classList.remove('on'); });
  panel.appendChild(actions);
  note('BUSY AUTOPLAY restarts the page with the game playing itself (the same run every time), so settings can be ' +
    'compared hands-free. Change one thing, wait 10 s or more, then the next. The table times each setting while it was on.');
  var logView = document.createElement('div');
  logView.id = 'perflog';
  panel.appendChild(logView);

  function report() {
    var ua = navigator.userAgent.replace(/.*\((iPhone[^;)]*|iPad[^;)]*|Macintosh[^;)]*|Linux[^;)]*|Windows[^;)]*).*/, '$1');
    var lines = ['Snack Storm perf · ' + ua + ' · dpr ' + (window.devicePixelRatio || 1) + ' · ' +
      window.innerWidth + '×' + window.innerHeight + (/autoplay/.test(location.search) ? ' · autoplay' : ''),
      'fps | avg ms | slow % | worst ms | secs | most critters | setting'];
    log.forEach(function (r) {
      lines.push(r.fps.toFixed(1) + ' | ' + r.avg.toFixed(1) + ' | ' + Math.round(r.slow) + ' | ' + Math.round(r.worst) +
        ' | ' + Math.round(r.secs) + ' | ' + (r.crit > 0 ? r.crit : '-') + ' | ' + r.label);
    });
    if (!log.length) lines.push('(nothing timed yet: keep a setting on for at least 3 seconds)');
    return lines.join('\n');
  }

  function changed() {
    store();
    apply();
    closeSegment();
  }

  btn.addEventListener('click', function () { panel.classList.toggle('on'); });

  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(bar);
    canvas = document.getElementById('game');
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  window.ssPerf = {
    ratio: ratio,
    // app.js, in the game's onLoad: the GameVM numbers this page writes, and a resize at the new resolution
    connect: function (instance, resizeFn) {
      var vm = instance.viewModelInstance;
      resize = resizeFn;
      if (vm) {
        perfProp = vm.number('perf');
        capProp = vm.number('crowdCap');
        statsProp = vm.string('stats');
        var show = vm.number('showStats');
        if (show) show.value = 1; // the game's own line carries the critter count the table logs
      }
      apply();
      segLabel = label();
      seg = newStats();
    },
    report: report
  };
  segLabel = label();
  requestAnimationFrame(frame);
})();

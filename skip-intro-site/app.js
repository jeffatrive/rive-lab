// Skip Intro (VECTOR/9) on the web: plays game.riv full-window with Rive's accessibility layer on.
//
// What this host adds over rive.to (which leaves the accessibility layer off):
//   - semanticsMode "enabled": the runtime lays real elements over the canvas (buttons, switches, headings, text
//     fields, a dialog, a live region) from the file's semantics, so screen readers and Tab work;
//   - reduced motion: the file's `calm` follows the visitor's prefers-reduced-motion (the MOTION button in the
//     site can still change it).
//
// Page options (add to the URL): ?motion=off or ?motion=on overrides prefers-reduced-motion (testing); ?coi=0 runs
// without the service worker (no threads, so no sound).
(function () {
  'use strict';

  var FILE = 'game.riv';
  var params = new URLSearchParams(window.location.search);
  var canvas = document.getElementById('canvas');
  var statusBox = document.getElementById('status');
  var bar = statusBox.querySelector('.bar span');
  var riveInstance = null;
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function showStatus(message, isError) {
    statusBox.hidden = false;
    statusBox.classList.toggle('error', !!isError);
    statusBox.querySelector('.message').textContent = message;
  }

  function hideStatus() {
    statusBox.classList.add('leaving');
    setTimeout(function () {
      statusBox.hidden = true;
      statusBox.classList.remove('leaving');
    }, 300);
  }

  function hasWebGL2() {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch (e) {
      return false;
    }
  }

  function wantsCalm() {
    var m = params.get('motion');
    if (m === 'off') return true;
    if (m === 'on') return false;
    return !!(reduced && reduced.matches);
  }

  function setCalm(value) {
    var vm = riveInstance && riveInstance.viewModelInstance;
    var calm = vm && vm.boolean('calm');
    if (calm) calm.value = value;
  }

  function pixelRatio() {
    return Math.min(2, window.devicePixelRatio || 1);
  }

  function pointWasm() {
    var tag = document.querySelector('script[src*="/@rive-app/"][src$="/rive.js"]');
    if (!tag || typeof rive === 'undefined' || !rive.RuntimeLoader) return;
    var dir = tag.src.replace(/rive\.js$/, '');
    rive.RuntimeLoader.setWasmUrl(dir + 'rive.wasm');
    rive.RuntimeLoader.setWasmFallbackUrl(dir + 'rive_fallback.wasm');
    if (rive.RuntimeLoader.setWasmThreadsUrl) rive.RuntimeLoader.setWasmThreadsUrl(dir + 'rive_threads.wasm');
  }

  function reportAudio() {
    Promise.all([window.siIsolation, rive.RuntimeLoader.awaitInstance()]).then(function (got) {
      var scripting = got[1] && got[1].riveScripting;
      var refusal = scripting && scripting.audioRefusal ? scripting.audioRefusal() : 'this runtime has no audio processors';
      if (refusal) console.warn('Skip Intro: ' + got[0] + '; no real-time audio (' + refusal + '): the site is silent.');
      else console.info('Skip Intro: ' + got[0] + ', threaded runtime: sound available.');
    }).catch(function () { /* (only a report) */ });
  }

  function load() {
    var early = window.siEarly;
    window.siEarly = null;
    return (early || fetch(FILE, { cache: 'no-cache' })).then(function (r) { // no-cache: revalidate every load
      if (!r.ok) throw new Error(FILE + ': ' + r.status);
      bar.style.width = '60%';
      return r.arrayBuffer();
    });
  }

  function start() {
    if (typeof rive === 'undefined') {
      showStatus('The Rive player didn’t load. Check your connection and reload.', true);
      return;
    }
    if (!hasWebGL2()) {
      showStatus('This browser can’t show the site (it needs WebGL 2). Try an up-to-date Safari, Chrome or Firefox.', true);
      return;
    }
    var file = null;
    load().then(function (buffer) {
      bar.style.width = '100%';
      file = new rive.RiveFile({ buffer: buffer, enableGPUCanvas: true });
      return file.init();
    }).then(function () {
      var instance = new rive.Rive({
        riveFile: file,
        canvas: canvas,
        autoplay: true,
        autoBind: true,
        enableGPUCanvas: true,
        enableMultiTouch: true,
        stateMachine: 'State Machine 1',
        layout: new rive.Layout({ fit: rive.Fit.Layout, alignment: rive.Alignment.Center }),
        semanticsMode: 'enabled',
        semanticsOptions: { riveCanvasLabel: 'VECTOR/9, a digital studio' },
        // The site sends focus to each screen's heading as it comes up. When the focused heading of the screen
        // before goes away, the page's focus falls out of Rive; this lets Rive take it back, or Tab would leave
        // the site.
        focusOptions: { allowFocusInterrupt: true },
        onLoad: function () {
          riveInstance = instance;
          setCalm(wantsCalm());
          reportAudio();
          instance.resizeDrawingSurfaceToCanvas(pixelRatio());
          hideStatus();
          canvas.focus({ preventScroll: true });
        },
        onLoadError: function () {
          showStatus('The site couldn’t start in this browser.', true);
        }
      });
      var resize = function () {
        if (riveInstance) riveInstance.resizeDrawingSurfaceToCanvas(pixelRatio());
      };
      if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(canvas);
      else window.addEventListener('resize', resize);
      // The visitor changing their setting while here.
      if (reduced && !params.get('motion')) {
        var follow = function () { setCalm(reduced.matches); };
        if (reduced.addEventListener) reduced.addEventListener('change', follow);
        else if (reduced.addListener) reduced.addListener(follow);
      }
      window.skipIntro = { rive: instance };
    }).catch(function () {
      showStatus('The site file didn’t load. Check your connection and reload.', true);
    });
  }

  // nothing big starts until the service worker settles (its first visit reloads the page once)
  window.siIsolation.then(function (state) {
    if (typeof rive !== 'undefined') pointWasm();
    if (state !== 'isolated') console.info('Skip Intro: ' + state);
    start();
  });
})();

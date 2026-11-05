// Earth Invasion on the web: plays game.riv full-window (cut down from smashabout/app.js: no saves, no loader file).
//
// Page options (add to the URL): ?mute=1 keeps the game silent (its synth plays outside the player's volume, so the
// page sets the game's hostMute before the first frame). ?coi=0 runs without the service worker (no threads, no sound).
(function () {
  'use strict';

  var GAME_FILE = 'game.riv';
  var params = new URLSearchParams(window.location.search);
  var muted = params.get('mute') === '1';

  var canvas = document.getElementById('game');
  var statusBox = document.getElementById('status');
  var bar = statusBox.querySelector('.bar span');
  var riveInstance = null;

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

  function firstStateMachine(file) {
    var artboard = file.getInstance().defaultArtboard();
    if (!artboard) return undefined;
    var name = artboard.stateMachineCount() ? artboard.stateMachineByIndex(0).name : undefined;
    artboard.delete();
    return name;
  }

  // Fit.Layout: the HUD lays itself out to fill the window. A phone stays at 1 (as on rive.to); a big window scales
  // the HUD up so its buttons aren't tiny, from 1 to 1.6 (the window over 1100 x 620, whichever is smaller).
  function uiScale() {
    var s = Math.min(window.innerWidth / 1100, window.innerHeight / 620);
    return Math.round(Math.max(1, Math.min(1.6, s)) * 100) / 100;
  }

  function gameLayout() {
    return new rive.Layout({ fit: rive.Fit.Layout, alignment: rive.Alignment.Center, layoutScaleFactor: uiScale() });
  }

  // at most 2x pixel density: a 3x iPhone draws 56% fewer pixels, hard to tell apart on a phone, and the 3-D buffers
  // stay small enough that iOS doesn't kill the page for memory
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
    Promise.all([window.eiIsolation, rive.RuntimeLoader.awaitInstance()]).then(function (got) {
      var scripting = got[1] && got[1].riveScripting;
      var refusal = scripting && scripting.audioRefusal ? scripting.audioRefusal() : 'this runtime has no audio processors';
      if (refusal) {
        console.warn('Earth Invasion: ' + got[0] + '; no real-time audio (' + refusal + '): the game is silent.');
      } else {
        console.info('Earth Invasion: ' + got[0] + ', threaded runtime: sound on' + (muted ? ' (muted: ?mute=1)' : '') + '.');
      }
    }).catch(function () { /* (only a report) */ });
  }

  function readCounting(response) {
    var total = parseInt(response.headers.get('Content-Length'), 10) || 0;
    if (response.headers.get('Content-Encoding')) total = 0;
    if (!response.body || !response.body.getReader || !total) return response.arrayBuffer();
    var reader = response.body.getReader();
    var whole = new Uint8Array(total);
    var loaded = 0;
    var chunks = [];
    var pump = function () {
      return reader.read().then(function (step) {
        if (step.done) {
          if (loaded === total && !chunks.length) return whole.buffer;
          var out = new Uint8Array(loaded);
          out.set(whole.subarray(0, Math.min(loaded, total)));
          var at = Math.min(loaded, total);
          chunks.forEach(function (c) { out.set(c, at); at += c.length; });
          return out.buffer;
        }
        var chunk = step.value;
        if (loaded + chunk.length <= total && !chunks.length) whole.set(chunk, loaded); else chunks.push(chunk);
        loaded += chunk.length;
        bar.style.width = Math.min(100, loaded / total * 100) + '%';
        return pump();
      });
    };
    return pump();
  }

  function loadGameFile() {
    var early = window.eiEarly;
    window.eiEarly = null;
    return (early || fetch(GAME_FILE)).then(function (r) {
      if (!r.ok) throw new Error(GAME_FILE + ': ' + r.status);
      return readCounting(r);
    });
  }

  function start() {
    if (typeof rive === 'undefined') {
      showStatus('The Rive player didn’t load. Check your connection and reload.', true);
      return;
    }
    if (!hasWebGL2()) {
      showStatus('This browser can’t run Earth Invasion (it needs WebGL 2). Try an up-to-date Safari, Chrome or Firefox.', true);
      return;
    }
    var file = null;
    loadGameFile().then(function (buffer) {
      bar.style.width = '100%';
      file = new rive.RiveFile({ buffer: buffer, enableGPUCanvas: true });
      return file.init();
    }).then(function () {
      var instance = new rive.Rive({
        riveFile: file,
        canvas: canvas,
        autoplay: !muted, // muted: set hostMute first, then play
        autoBind: true,
        enableGPUCanvas: true,
        enableMultiTouch: true,
        stateMachine: firstStateMachine(file),
        layout: gameLayout(),
        onLoad: function () {
          riveInstance = instance;
          if (muted) {
            instance.volume = 0;
            var vm = instance.viewModelInstance;
            var hostMute = vm && vm.boolean('hostMute');
            if (hostMute) hostMute.value = true;
            instance.play();
          }
          reportAudio();
          instance.resizeDrawingSurfaceToCanvas(pixelRatio());
          hideStatus();
          canvas.focus({ preventScroll: true });
        },
        onLoadError: function () {
          showStatus('Earth Invasion couldn’t start in this browser.', true);
        }
      });
      var resize = function () {
        if (!riveInstance) return;
        if (riveInstance.layout.layoutScaleFactor !== uiScale()) riveInstance.layout = gameLayout();
        riveInstance.resizeDrawingSurfaceToCanvas(pixelRatio());
      };
      if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(canvas);
      else window.addEventListener('resize', resize);
      window.earthInvasion = { rive: instance };
    }).catch(function () {
      showStatus('The game file didn’t load. Check your connection and reload.', true);
    });
  }

  // nothing big starts until the service worker settles (its first visit reloads the page once)
  window.eiIsolation.then(function (state) {
    if (typeof rive !== 'undefined') pointWasm();
    if (state !== 'isolated') console.info('Earth Invasion: ' + state);
    start();
  });
})();

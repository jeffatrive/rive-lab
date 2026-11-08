// Snack Storm on the web: plays game.riv full-window and keeps your progress in this browser (localStorage).
//
// The save. The Rive runtime has no storage of its own, so the game keeps all its progress (tips, crew, trucks, the
// recipe book) in one string in its view model, GameVM `save` ("SS5.<numbers>", meta.as pack/unpack). The game reads
// `save` once, on its first frame, and rewrites it whenever progress changes. This page hands the stored string to the
// game before that first frame, and copies every change back to localStorage (plus a last copy when the page hides).
// The game itself tells a returning player from a new one by what's in `save`; if a build also has a GameVM boolean
// `hasSave`, the page sets it to whether a save was handed over.
//
// Page options (add to the URL):
//   ?mute=1   keeps the game silent (its synth plays outside the player's volume, so the page sets the game's `silent`
//             before the first frame; the game reads it every frame).
//   ?reset=1  forgets the save in this browser, then starts fresh (the parameter is dropped from the address so a
//             reload doesn't reset again).
//   ?coi=0    runs without the service worker (no threads, no sound).
//   ?data=name=value  sets a GameVM property before the first frame, like rive-cli's --data= (testing; repeatable).
// The page also writes GameVM `safeTop` (the top safe-area inset in CSS px, for a phone notch) before the first frame
// and on resize, and `hasSave` (whether a save was handed over) if the build has it.
(function () {
  'use strict';

  var GAME_FILE = 'game.riv';
  var SAVE_KEY = 'snackStorm.save';
  var params = new URLSearchParams(window.location.search);
  var muted = params.get('mute') === '1';

  var canvas = document.getElementById('game');
  var statusBox = document.getElementById('status');
  var bar = statusBox.querySelector('.bar span');
  var riveInstance = null;
  var saveProp = null; // GameVM `save` (string)
  var silentProp = null; // GameVM `silent` (number, > 0 = no sound)
  var safeTopProp = null; // GameVM `safeTop` (number, points): the notch / status bar inset the HUD should clear
  var storageWorks = true;

  // ------------------------------------------------------------ storage

  function readStored() {
    try {
      return window.localStorage.getItem(SAVE_KEY) || '';
    } catch (e) {
      storageWorks = false;
      return '';
    }
  }

  function writeStored(value) {
    try {
      if (value) window.localStorage.setItem(SAVE_KEY, value);
      else window.localStorage.removeItem(SAVE_KEY);
      return true;
    } catch (e) {
      storageWorks = false;
      return false;
    }
  }

  // The shape of a Snack Storm save: "SS<version>." then dot-separated whole numbers (meta.as pack). Anything else
  // (an empty string, a stray value) is never stored or handed to the game; the game checks the field count itself.
  function isSave(text) {
    return typeof text === 'string' && /^SS\d+(\.\d+){4,}$/.test(text);
  }

  if (params.get('reset') === '1') {
    writeStored('');
    params.delete('reset');
    try {
      var clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
      window.history.replaceState(null, '', clean);
    } catch (e) { /* (only cosmetic) */ }
    console.info('Snack Storm: save cleared (?reset=1).');
  }

  // ------------------------------------------------------------ page

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

  // Fit.Layout at scale 1, as on the game's rive.to page: the game lays its HUD out for the window's shape itself
  // (GameVM `narrow` under 600 points wide).
  function gameLayout() {
    return new rive.Layout({ fit: rive.Fit.Layout, alignment: rive.Alignment.Center, layoutScaleFactor: 1 });
  }

  // at most 2x pixel density: a 3x iPhone draws 56% fewer pixels, hard to tell apart on a phone, and the atlas and
  // canvases stay small enough that iOS doesn't kill the page for memory
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
    Promise.all([window.ssIsolation, rive.RuntimeLoader.awaitInstance()]).then(function (got) {
      var scripting = got[1] && got[1].riveScripting;
      var refusal = scripting && scripting.audioRefusal ? scripting.audioRefusal() : 'this runtime has no audio processors';
      if (refusal) {
        console.warn('Snack Storm: ' + got[0] + '; no real-time audio (' + refusal + '): the game is silent.');
      } else {
        console.info('Snack Storm: ' + got[0] + ', threaded runtime: sound on' + (muted ? ' (muted: ?mute=1)' : '') + '.');
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
    var early = window.ssEarly;
    window.ssEarly = null;
    return (early || fetch(GAME_FILE, { cache: 'no-cache' })).then(function (r) { // no-cache: revalidate (a 304 when unchanged)
      if (!r.ok) throw new Error(GAME_FILE + ': ' + r.status);
      return readCounting(r);
    });
  }

  // ------------------------------------------------------------ the save bridge

  // Runs in onLoad, before the game's first frame (the player starts paused and plays after this), so the game's
  // first frame already sees the stored save: no fresh-start flash, no lost progress.
  function connectSave(instance) {
    var vm = instance.viewModelInstance;
    saveProp = vm ? vm.string('save') : null;
    if (!saveProp) {
      console.warn('Snack Storm: the game has no `save` property; progress won’t be kept.');
      return;
    }
    var stored = readStored();
    var handed = isSave(stored);
    if (handed) saveProp.value = stored;
    var hasSave = vm.boolean('hasSave'); // (optional: a build with a home screen may want the flag ready-made)
    if (hasSave) hasSave.value = handed;
    // every change the game makes: a save replaces the stored one; an empty string forgets it (a "start over")
    saveProp.on(function (value) {
      if (isSave(value)) writeStored(value);
      else if (value === '') writeStored('');
    });
    if (!storageWorks) console.warn('Snack Storm: this browser won’t let the page save (private browsing?).');
  }

  // a last copy when the page goes away or to the background (iOS may kill a background tab without another event)
  function flushSave() {
    if (saveProp && isSave(saveProp.value)) writeStored(saveProp.value);
  }

  // ------------------------------------------------------------ sound

  // The game's synth runs outside the player's volume, so the page talks to GameVM `silent` (read every frame): 1 while
  // the page is muted or hidden, else 0. (Hidden, the game also fades itself out when frames stop; this just makes
  // the last frame before hiding a quiet one.)
  function applySilent() {
    if (!silentProp) return;
    silentProp.value = (muted || document.visibilityState === 'hidden') ? 1 : 0;
  }

  function connectSound(instance) {
    var vm = instance.viewModelInstance;
    silentProp = vm ? vm.number('silent') : null;
    if (!silentProp && muted) console.warn('Snack Storm: the game has no `silent` property; ?mute=1 can’t silence its synth.');
    if (muted) instance.volume = 0;
    applySilent();
  }

  // Hidden or left, the page also suspends its audio contexts (index.html lists every one in window.ssAudioContexts;
  // the runtime makes the synth's). A running context, even a silent one, keeps iOS showing "audio playing" after you
  // leave, until Safari is quit: the runtime sets navigator.audioSession to "playback", which lets audio run in the
  // background. Back in view, the page resumes only the contexts it suspended; if the browser wants a tap first, the
  // next tap, click or key does it. A page that's going away for good (pagehide, not kept for Back) closes them.
  var wokenByPage = []; // contexts this page suspended and still has to resume
  var gestureEvents = ['pointerdown', 'pointerup', 'touchend', 'keydown'];
  var waitingForGesture = false;

  function audioContexts() {
    var list = window.ssAudioContexts || [];
    for (var i = list.length - 1; i >= 0; i--) if (list[i].state === 'closed') list.splice(i, 1);
    return list;
  }

  function quietly(promise) {
    if (promise && promise.catch) promise.catch(function () { /* (refused or closed: nothing to do) */ });
  }

  function suspendAudio() {
    stopWaitingForGesture();
    audioContexts().forEach(function (context) {
      if (context.state === 'suspended') return; // (never started, or the runtime's own: not ours to resume)
      if (wokenByPage.indexOf(context) < 0) wokenByPage.push(context);
      quietly(context.suspend());
    });
  }

  function closeAudio() {
    stopWaitingForGesture();
    wokenByPage = [];
    audioContexts().forEach(function (context) { quietly(context.close()); });
  }

  function resumeAudio() {
    if (document.visibilityState === 'hidden') return;
    wokenByPage = wokenByPage.filter(function (context) { return context.state !== 'closed'; });
    wokenByPage.slice().forEach(function (context) {
      var ask = context.resume();
      var check = function () {
        if (context.state === 'running') {
          var at = wokenByPage.indexOf(context);
          if (at >= 0) wokenByPage.splice(at, 1);
          if (!wokenByPage.length) stopWaitingForGesture();
        } else {
          waitForGesture();
        }
      };
      if (ask && ask.then) ask.then(check, waitForGesture); else check();
    });
  }

  function onGesture() {
    resumeAudio();
  }

  function waitForGesture() {
    if (waitingForGesture || !wokenByPage.length || document.visibilityState === 'hidden') return;
    waitingForGesture = true;
    gestureEvents.forEach(function (type) { window.addEventListener(type, onGesture, true); });
  }

  function stopWaitingForGesture() {
    if (!waitingForGesture) return;
    waitingForGesture = false;
    gestureEvents.forEach(function (type) { window.removeEventListener(type, onGesture, true); });
  }

  // ------------------------------------------------------------ the safe area (notch)

  // In standalone (home screen) mode on an iPhone the canvas runs under the notch (viewport-fit=cover). The game lays its
  // HUD out itself, so the page measures env(safe-area-inset-top) with a hidden element and hands it over as GameVM
  // `safeTop` (CSS px = the game's points at layout scale 1), before the first frame and again on every resize/rotation.
  var safeProbe = null;

  function measureSafeTop() {
    if (!safeProbe) {
      safeProbe = document.createElement('div');
      safeProbe.setAttribute('aria-hidden', 'true');
      safeProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding-top:env(safe-area-inset-top, 0px);';
      document.body.appendChild(safeProbe);
    }
    var px = parseFloat(window.getComputedStyle(safeProbe).paddingTop) || 0;
    return px > 0 && px < 200 ? Math.round(px) : 0;
  }

  function applySafeTop() {
    if (!safeTopProp) return;
    var top = measureSafeTop();
    if (safeTopProp.value !== top) safeTopProp.value = top;
  }

  function connectSafeArea(instance) {
    var vm = instance.viewModelInstance;
    safeTopProp = vm ? vm.number('safeTop') : null;
    applySafeTop();
  }

  // ------------------------------------------------------------ testing: ?data=name=value

  // Like rive-cli's --data=: sets GameVM properties before the first frame (?data=openTab=1&data=autoplay=1). Numbers,
  // booleans (1/0, true/false) and strings by the property's type; `save` is not seedable here (localStorage owns it).
  function seedData(instance) {
    var vm = instance.viewModelInstance;
    if (!vm) return;
    params.getAll('data').forEach(function (pair) {
      var at = pair.indexOf('=');
      var name = at < 0 ? pair : pair.slice(0, at);
      var value = at < 0 ? '1' : pair.slice(at + 1);
      if (!name || name === 'save') return;
      var prop;
      try {
        if ((prop = vm.number(name))) prop.value = Number(value) || 0;
        else if ((prop = vm.boolean(name))) prop.value = value === '1' || value === 'true';
        else if ((prop = vm.string(name))) prop.value = value;
        else console.warn('Snack Storm: ?data=' + name + ': no such property.');
      } catch (e) {
        console.warn('Snack Storm: ?data=' + name + ': ' + e);
      }
    });
  }

  // ------------------------------------------------------------ start

  function start() {
    if (typeof rive === 'undefined') {
      showStatus('The Rive player didn’t load. Check your connection and reload.', true);
      return;
    }
    if (!hasWebGL2()) {
      showStatus('This browser can’t run Snack Storm (it needs WebGL 2). Try an up-to-date Safari, Chrome or Firefox.', true);
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
        autoplay: false, // the save and the mute go in first (onLoad), then play: the first frame sees them
        autoBind: true,
        enableGPUCanvas: true,
        enableMultiTouch: true,
        stateMachine: firstStateMachine(file),
        layout: gameLayout(),
        onLoad: function () {
          riveInstance = instance;
          connectSave(instance);
          connectSound(instance);
          connectSafeArea(instance);
          seedData(instance);
          instance.play();
          reportAudio();
          instance.resizeDrawingSurfaceToCanvas(pixelRatio());
          hideStatus();
          canvas.focus({ preventScroll: true });
        },
        onLoadError: function () {
          showStatus('Snack Storm couldn’t start in this browser.', true);
        }
      });
      var resize = function () {
        if (!riveInstance) return;
        riveInstance.resizeDrawingSurfaceToCanvas(pixelRatio());
        applySafeTop();
      };
      if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(canvas);
      else window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', function () { setTimeout(applySafeTop, 50); });
      window.snackStorm = {
        rive: instance,
        save: function () { return saveProp ? saveProp.value : readStored(); },
        clearSave: function () { writeStored(''); if (saveProp) saveProp.value = ''; }
      };
    }).catch(function () {
      showStatus('The game file didn’t load. Check your connection and reload.', true);
    });
  }

  document.addEventListener('visibilitychange', function () {
    applySilent();
    if (document.visibilityState === 'hidden') {
      flushSave();
      suspendAudio();
    } else {
      resumeAudio();
    }
  });
  window.addEventListener('pagehide', function (event) {
    flushSave();
    if (event.persisted) suspendAudio(); // kept for Back/Forward: pageshow wakes it
    else closeAudio(); // gone for good
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) resumeAudio();
  });
  document.addEventListener('freeze', suspendAudio); // (Chrome: a hidden page about to be frozen)
  document.addEventListener('resume', resumeAudio);

  // nothing big starts until the service worker settles (its first visit reloads the page once)
  window.ssIsolation.then(function (state) {
    if (typeof rive !== 'undefined') pointWasm();
    if (state !== 'isolated') console.info('Snack Storm: ' + state);
    start();
  });
})();

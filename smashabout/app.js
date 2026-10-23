// Smashabout on the web: plays game.riv full-window and keeps the player's
// progress in this browser (localStorage).
//
// How saving works: the game keeps the whole player profile as a JSON string
// in its view model's `save` property. It adopts whatever is in `save` when it
// starts, and rewrites `save` whenever the profile changes. This page fills
// `save` from localStorage before the game's first frame, and copies every
// change back to localStorage.
//
// Page options (add to the URL): ?mute=1 silences the game. ?debug=1 shows the reload watch (it stays on until
// ?debug=0); ?debug=reset clears its counts. The menu's Show/Hide reload watch does the same from inside the page,
// which is the only way in a Home Screen web app (it opens at ./ with its own storage).
(function () {
  'use strict';

  var GAME_FILE = 'game.riv';
  // A copy of the page served from the repo as it is (Jeff's Cloudflare worker, 2026-10-22) has no game.riv: it's not in
  // git, the GitHub Pages workflow fetches it from the release. Such a copy plays the GitHub Pages one, which allows
  // cross-site loads (Access-Control-Allow-Origin: *), so publish.sh still updates both.
  var GAME_FALLBACK = 'https://jeffatrive.github.io/rive-lab/smashabout/game.riv';
  var SAVE_KEY = 'smashabout.save';
  var BACKUP_KEY = 'smashabout.save.beforePaste'; // the save a "Paste a save" replaced, just in case
  // The newest profile version this page knows (P.VERSION in game3d/profile.luau).
  // A pasted save with a higher number gets a warning, not a refusal.
  var KNOWN_SAVE_VERSION = 1;

  var params = new URLSearchParams(window.location.search);
  var muted = params.get('mute') === '1';

  var canvas = document.getElementById('game');
  var statusBox = document.getElementById('status');
  var menuButton = document.getElementById('menu-button');
  var menu = document.getElementById('menu');
  var menuNote = document.getElementById('menu-note');
  var dialog = document.getElementById('save-dialog');
  var dialogTitle = document.getElementById('save-dialog-title');
  var dialogHelp = document.getElementById('save-dialog-help');
  var saveText = document.getElementById('save-text');
  var saveError = document.getElementById('save-error');
  var saveOk = document.getElementById('save-ok');

  var riveInstance = null;
  var saveProp = null; // the view model's `save` string
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

  function writeStored(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      storageWorks = false;
      return false;
    }
  }

  // Is this string a Smashabout profile? Returns { ok, newer, reason }.
  function checkSave(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, reason: 'That isn’t a save: it should start with { and end with }.' };
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, reason: 'That isn’t a Smashabout save.' };
    }
    if (typeof data.v !== 'number' || data.v < 1 || typeof data.kaiju !== 'string' ||
        typeof data.recs !== 'object' || data.recs === null) {
      return { ok: false, reason: 'That isn’t a Smashabout save (it’s missing its version, kaiju or records).' };
    }
    return { ok: true, newer: data.v > KNOWN_SAVE_VERSION };
  }

  // ------------------------------------------------------------ status

  function showStatus(message, isError) {
    statusBox.hidden = false;
    statusBox.classList.toggle('error', !!isError);
    statusBox.querySelector('.message').textContent = message;
  }

  function hideStatus() {
    statusBox.hidden = true;
  }

  // ------------------------------------------------------------ the game

  function hasWebGL2() {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch (e) {
      return false;
    }
  }

  // The first state machine on the file's default artboard (what Rive's hosted player picks).
  function firstStateMachine(file) {
    var artboard = file.getInstance().defaultArtboard();
    if (!artboard) return undefined;
    var name = artboard.stateMachineCount() ? artboard.stateMachineByIndex(0).name : undefined;
    artboard.delete();
    return name;
  }

  // Every window gets Fit.Layout: the game lays itself out to fill it (2026-10-21: the desktop phone frame is gone; the
  // HUD, the bottom bar and the menus stop at a max width, the board takes the rest). A big window also scales the UI up
  // (the Layout's layoutScaleFactor: the game is laid out in a window that many times smaller, then drawn to fill it), so
  // text and buttons aren't phone-sized in a lot of space: the window's width over 600 or its height over 760, whichever
  // is smaller, from 1 to 1.5 (a 1080p desktop about 1.27, a portrait iPad 1.37, a laptop's short window 1). A phone
  // stays at 1; a bigger window keeps at least 600 x 760 points to lay out in, about a phone's height, so the menus
  // fit without scrolling and the board keeps its room under the HUD. It changes the layout's size only, not the pixels
  // drawn (the canvas and the 2x cap).
  var MIN_W = 600, MIN_H = 760, MAX_SCALE = 1.5;
  function uiScale() {
    var s = Math.min(window.innerWidth / MIN_W, window.innerHeight / MIN_H);
    return Math.round(Math.max(1, Math.min(MAX_SCALE, s)) * 100) / 100;
  }

  function gameLayout() {
    return new rive.Layout({ fit: rive.Fit.Layout, alignment: rive.Alignment.Center, layoutScaleFactor: uiScale() });
  }

  // The game guesses room for the iPhone's clock and home indicator on a phone-tall screen (the native app draws
  // under them). This page knows the real insets: none at the top below Safari's opaque status bar, the home
  // indicator at the bottom, none on a desktop. Read from CSS env() and handed to the game (in its points: CSS pixels
  // over the UI scale).
  // At most 2x pixel density (Jeff 2026-10-21: the page reloaded mid-boss, most likely iOS killing it for memory).
  // An iPhone is 3x: a 1170 x 2532 drawing surface plus anti-aliasing and the 3-D buffers. 2x is 56% fewer pixels and
  // hard to tell apart on a phone.
  var MAX_PIXEL_RATIO = 2;
  function pixelRatio() {
    return Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
  }

  function connectInsets(instance) {
    var vm = instance.viewModelInstance;
    var top = vm && vm.number('hostSafeTop');
    var bottom = vm && vm.number('hostSafeBottom');
    if (!top || !bottom) return;
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
    var apply = function () {
      var cs = getComputedStyle(probe);
      var scale = uiScale();
      top.value = (parseFloat(cs.paddingTop) || 0) / scale;
      bottom.value = (parseFloat(cs.paddingBottom) || 0) / scale;
    };
    apply();
    window.addEventListener('resize', apply);
  }

  function connectSave(instance) {
    var vm = instance.viewModelInstance;
    saveProp = vm ? vm.string('save') : null;
    if (!saveProp) {
      console.warn('Smashabout: the game has no `save` property; progress won’t be kept.');
      menuNote.textContent = 'Saving isn’t available in this build.';
      return;
    }
    // 1. Hand the stored profile to the game. This runs in onLoad, before the
    //    game's first frame, so the game starts with it (no fresh-profile flash).
    var stored = readStored();
    if (stored && checkSave(stored).ok) {
      saveProp.value = stored;
    }
    // 2. Keep every change the game makes.
    saveProp.on(function (value) {
      if (value && checkSave(value).ok) {
        writeStored(SAVE_KEY, value);
      }
    });
    if (!storageWorks) {
      menuNote.textContent = 'This browser won’t let the page save (private browsing?). Use “Copy my save” before you leave.';
    }
  }

  // The save menu button only shows on the title and map screens, so it never covers play.
  var MENU_SCREENS = ['Splash', 'Map'];
  function connectScreen(instance) {
    var vm = instance.viewModelInstance;
    var screen = vm ? vm.enum('screen') : null;
    if (!screen) return; // no screen info: leave the button showing
    var update = function () {
      var show = MENU_SCREENS.indexOf(screen.value) !== -1;
      menuButton.hidden = !show;
      if (!show) setMenu(false);
    };
    screen.on(update);
    update();
  }

  // The game file's bytes: this page's own copy, else the GitHub Pages one.
  function loadGameFile() {
    var get = function (url) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error(url + ': ' + r.status);
        return r.arrayBuffer();
      });
    };
    return get(GAME_FILE).catch(function () {
      return location.href.indexOf(GAME_FALLBACK.replace('game.riv', '')) === 0 ? Promise.reject() : get(GAME_FALLBACK);
    });
  }

  function start() {
    if (typeof rive === 'undefined') {
      showStatus('The Rive player didn’t load. Check your connection and reload.', true);
      return;
    }
    if (!hasWebGL2()) {
      showStatus('This browser can’t run Smashabout (it needs WebGL 2). Try an up-to-date Safari, Chrome or Firefox.', true);
      return;
    }
    var file = null;
    loadGameFile().then(function (buffer) {
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
        stateMachine: firstStateMachine(file),
        layout: gameLayout(),
        onLoad: function () {
          riveInstance = instance;
          if (muted) instance.volume = 0;
          connectSave(instance);
          connectInsets(instance);
          connectScreen(instance);
          instance.resizeDrawingSurfaceToCanvas(pixelRatio());
          hideStatus();
          canvas.focus({ preventScroll: true });
        },
        onLoadError: function () {
          showStatus('Smashabout couldn’t start in this browser.', true);
        }
      });
      // (a new UI scale when the window crosses a size: a new Layout, then the drawing surface, which resizes the
      // artboard to the canvas over the scale)
      var resize = function () {
        if (!riveInstance) return;
        if (riveInstance.layout.layoutScaleFactor !== uiScale()) riveInstance.layout = gameLayout();
        riveInstance.resizeDrawingSurfaceToCanvas(pixelRatio());
      };
      if (typeof ResizeObserver === 'function') {
        new ResizeObserver(resize).observe(canvas);
      } else {
        window.addEventListener('resize', resize);
      }
      // (for testing from the browser console)
      window.smashabout = { rive: instance, save: function () { return saveProp && saveProp.value; } };
    }).catch(function () {
      showStatus('The game file didn’t load. Check your connection and reload.', true);
    });
  }

  // ------------------------------------------------------------ menu

  function setMenu(open) {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  menuButton.addEventListener('click', function (e) {
    e.stopPropagation();
    setMenu(menu.hidden);
  });
  document.addEventListener('pointerdown', function (e) {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== menuButton && !menuButton.contains(e.target)) {
      setMenu(false);
    }
  });

  function currentSave() {
    return (saveProp && saveProp.value) || readStored();
  }

  function openDialog(mode, text) {
    var copying = mode === 'copy';
    dialog.dataset.mode = mode;
    dialogTitle.textContent = copying ? 'Your save' : 'Paste a save';
    dialogHelp.textContent = copying
      ? 'Copy this text and paste it into “Paste a save” on your other device.'
      : 'Paste the text you copied on your other device. It replaces the progress on this one.';
    saveText.value = text || '';
    saveText.readOnly = copying;
    saveError.textContent = '';
    saveOk.textContent = copying ? 'Done' : 'Load this save';
    dialog.showModal();
    if (copying) {
      saveText.focus();
      saveText.select();
    } else {
      saveText.focus();
    }
  }

  function copySave() {
    var text = currentSave();
    if (!text) {
      menuNote.textContent = 'No progress yet: play a little first.';
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        menuNote.textContent = 'Copied. Paste it into “Paste a save” on your other device.';
      }, function () {
        openDialog('copy', text);
      });
    } else {
      openDialog('copy', text);
    }
  }

  menu.addEventListener('click', function (e) {
    var action = e.target.getAttribute && e.target.getAttribute('data-action');
    if (action === 'copy') {
      copySave();
    } else if (action === 'paste') {
      setMenu(false);
      openDialog('paste', '');
    } else if (action === 'watch') {
      setWatch(!debugBox);
      setMenu(false);
    }
  });

  saveOk.addEventListener('click', function (e) {
    if (dialog.dataset.mode !== 'paste') return; // "Done" just closes
    e.preventDefault();
    var text = saveText.value.trim();
    var check = checkSave(text);
    if (!check.ok) {
      saveError.textContent = check.reason;
      return;
    }
    if (check.newer && !window.confirm('This save is from a newer version of Smashabout than this page. Load it anyway?')) {
      return;
    }
    var old = currentSave();
    if (old) writeStored(BACKUP_KEY, old);
    if (!writeStored(SAVE_KEY, text)) {
      // can't store it: hand it to the running game for this visit only
      if (saveProp) saveProp.value = text;
      saveError.textContent = 'Loaded for now, but this browser won’t keep it after you leave.';
      return;
    }
    dialog.close('ok');
    // Reload so the game starts fresh from the pasted save (it reads it before its first frame).
    try { window.sessionStorage.setItem(EXPECT_KEY, '1'); } catch (err) { /* storage blocked */ }
    window.location.reload();
  });

  // ------------------------------------------------------------ reload watch
  // (Jeff 2026-10-22: make sure a phone's browser never reloads the game on its own.) iOS kills a heavy tab's process
  // when memory runs low and reloads the page when you come back to it. The page can't see that happen, only the start
  // that follows, so each visit keeps a heartbeat and marks a clean end (pagehide): a start whose previous visit ended
  // without one is counted as unclean. That also catches quitting the browser app; "hidden" says the visit was in the
  // background when it stopped, the usual sign of a memory kill. Kept in localStorage; ?debug=1 shows it.
  var DIAG_KEY = 'smashabout.diag';
  var DEBUG_KEY = 'smashabout.debug';
  var EXPECT_KEY = 'smashabout.expectReload'; // sessionStorage: a reload the page asked for (pasting a save)
  var diag = { loads: 0, reloads: 0, unclean: 0, log: [], live: null };
  var debugBox = null;

  function readDiag() {
    try {
      var d = JSON.parse(window.localStorage.getItem(DIAG_KEY) || 'null');
      if (d && typeof d === 'object') diag = d;
    } catch (e) { /* storage blocked or bad JSON: start over */ }
    diag.log = diag.log || [];
  }

  function writeDiag() {
    try { window.localStorage.setItem(DIAG_KEY, JSON.stringify(diag)); } catch (e) { /* storage blocked */ }
  }

  function minutes(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function watchReloads() {
    var dbg = params.get('debug');
    try {
      if (dbg === '1') window.localStorage.setItem(DEBUG_KEY, '1');
      else if (dbg === '0') window.localStorage.removeItem(DEBUG_KEY);
    } catch (e) { /* storage blocked */ }
    readDiag();
    if (dbg === 'reset') diag = { loads: 0, reloads: 0, unclean: 0, log: [], live: null };
    var now = Date.now();
    var expected = false;
    try {
      expected = window.sessionStorage.getItem(EXPECT_KEY) === '1';
      window.sessionStorage.removeItem(EXPECT_KEY);
    } catch (e) { /* storage blocked */ }
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var prev = diag.live;
    if (prev && !prev.clean && !expected) {
      diag.unclean += 1;
      diag.log.unshift({ t: now, kind: 'unclean', hidden: !!prev.hidden, up: prev.beat - prev.start, gap: now - prev.beat });
    }
    if (nav && nav.type === 'reload' && !expected) {
      diag.reloads += 1;
      diag.log.unshift({ t: now, kind: 'reload' });
    }
    diag.loads += 1;
    diag.log = diag.log.slice(0, 12);
    diag.live = { start: now, beat: now, hidden: document.hidden, clean: false };
    writeDiag();

    var beat = function () {
      diag.live.beat = Date.now();
      diag.live.hidden = document.hidden;
      writeDiag();
    };
    setInterval(beat, 5000);
    document.addEventListener('visibilitychange', beat);
    window.addEventListener('pagehide', function () { diag.live.clean = true; beat(); });
    // back from the browser's page cache: the same visit carries on
    window.addEventListener('pageshow', function (e) { if (e.persisted) { diag.live.clean = false; beat(); } });

    var on = false;
    try { on = window.localStorage.getItem(DEBUG_KEY) === '1'; } catch (e) { /* storage blocked */ }
    setWatch(on);
  }

  // The readout on or off (remembered), from ?debug= or the menu.
  var watchTimer = null;
  function setWatch(on) {
    try {
      if (on) window.localStorage.setItem(DEBUG_KEY, '1');
      else window.localStorage.removeItem(DEBUG_KEY);
    } catch (e) { /* storage blocked */ }
    var toggle = document.getElementById('watch-toggle');
    if (toggle) toggle.textContent = on ? 'Hide reload watch' : 'Show reload watch';
    if (!on) {
      if (debugBox) debugBox.remove();
      debugBox = null;
      clearInterval(watchTimer);
      return;
    }
    if (debugBox) return;
    debugBox = document.createElement('div');
    debugBox.id = 'diag';
    debugBox.setAttribute('aria-hidden', 'true');
    document.body.appendChild(debugBox);
    var show = function () {
      var last = diag.log[0];
      var lines = ['loads ' + diag.loads + ' · reloads ' + diag.reloads + ' · unclean ' + diag.unclean +
                   ' · up ' + minutes(Date.now() - diag.live.start)];
      if (last) {
        var when = new Date(last.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        lines.push('last: ' + last.kind + ' ' + when + (last.kind === 'unclean'
          ? (last.hidden ? ', hidden' : ', on screen') + ', after ' + minutes(last.up) : ''));
      }
      if (performance.memory) lines.push('JS heap ' + Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB');
      debugBox.textContent = lines.join('\n');
    };
    show();
    watchTimer = setInterval(show, 1000);
  }

  // iOS Safari: no pinch-zoom of the page.
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  watchReloads();
  start();
})();

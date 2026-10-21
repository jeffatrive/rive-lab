// Smashabout on the web: plays game.riv full-window and keeps the player's
// progress in this browser (localStorage).
//
// How saving works: the game keeps the whole player profile as a JSON string
// in its view model's `save` property. It adopts whatever is in `save` when it
// starts, and rewrites `save` whenever the profile changes. This page fills
// `save` from localStorage before the game's first frame, and copies every
// change back to localStorage.
//
// Page options (add to the URL): ?mute=1 silences the game.
(function () {
  'use strict';

  var GAME_FILE = 'game.riv';
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

  // The game guesses room for the iPhone's clock and home indicator on a phone-tall screen (the native app draws
  // under them). This page knows the real insets: none at the top below Safari's opaque status bar, the home
  // indicator at the bottom, none at all in the desktop frame. Read from CSS env() and handed to the game.
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
      var framed = window.matchMedia('(min-aspect-ratio: 3/4)').matches;
      top.value = framed ? 0 : (parseFloat(cs.paddingTop) || 0);
      bottom.value = framed ? 0 : (parseFloat(cs.paddingBottom) || 0);
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

  function start() {
    if (typeof rive === 'undefined') {
      showStatus('The Rive player didn’t load. Check your connection and reload.', true);
      return;
    }
    if (!hasWebGL2()) {
      showStatus('This browser can’t run Smashabout (it needs WebGL 2). Try an up-to-date Safari, Chrome or Firefox.', true);
      return;
    }
    var file = new rive.RiveFile({ src: GAME_FILE, enableGPUCanvas: true });
    // A phone (or a tall window) gets Fit.Layout: the game lays itself out to fill the screen. A wider screen shows a
    // phone-shaped frame (style.css), and the game is drawn at its designed 390 x 844 and scaled to fit it
    // (Fit.Contain), so a small window shrinks it instead of cramming its layout.
    var framed = window.matchMedia('(min-aspect-ratio: 3/4)');
    function gameLayout() {
      return new rive.Layout({ fit: framed.matches ? rive.Fit.Contain : rive.Fit.Layout, alignment: rive.Alignment.Center });
    }
    file.init().then(function () {
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
      var resize = function () {
        if (riveInstance) riveInstance.resizeDrawingSurfaceToCanvas(pixelRatio());
      };
      var relayout = function () {
        if (riveInstance) { riveInstance.layout = gameLayout(); resize(); }
      };
      if (framed.addEventListener) framed.addEventListener('change', relayout);
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
    window.location.reload();
  });

  // iOS Safari: no pinch-zoom of the page.
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  start();
})();

async function main() {
  var canvas = document.getElementById('riveCanvas');
  if (!canvas) return;

  var riveInstance = null;
  var artboardProperty = null;
  var chartArtboard = null;
  var barArtboard = null;
  var ringArtboard = null;
  var arcArtboard = null;
  var swapableVMI = null; // SwapableVM instance for number property

function attachChart() {
  if (chartArtboard && artboardProperty) artboardProperty.value = chartArtboard;
}

  var layout = new rive.Layout({ fit: rive.Fit.Layout });

  riveInstance = new rive.Rive({
    canvas: canvas,
    layout: layout,
    autoplay: true,
    autoBind: true,
    src: 'relative_bind_demo-host.riv',
    artboard: 'Artboard',
    stateMachines: ['State Machine 1'],
    onLoad: function () {
      if (riveInstance) riveInstance.resizeDrawingSurfaceToCanvas();
      var vmi = riveInstance.viewModelInstance;
      artboardProperty = vmi.artboard('artboard');

      var barTrig = vmi.trigger('barTrig');
      var ringTrig = vmi.trigger('ringTrig');
      if (barTrig) {
        barTrig.on(function () {
          chartArtboard = barArtboard;
          if (chartArtboard && artboardProperty) artboardProperty.value = chartArtboard;
        });
      }
      if (ringTrig) {
        ringTrig.on(function () {
          chartArtboard = ringArtboard;
          if (chartArtboard && artboardProperty) artboardProperty.value = chartArtboard;
        });
      }

      // SwapableVM: get instance for number property (use default or named "Instance")
      var numberProp = vmi.number('swapable/number');
   
      if (numberProp) {
          var inputEl = document.getElementById('arcValue');
          if (inputEl) {
            inputEl.addEventListener('input', function () {
              var n = parseInt(inputEl.value, 10);
              if (!isNaN(n)) numberProp.value = Math.max(0, Math.min(100, n));
            });
          }
        }

      var arcBtn = document.getElementById('arcBtn');
      if (arcBtn) {
        arcBtn.addEventListener('click', function () {
          chartArtboard = arcArtboard;
          if (chartArtboard && artboardProperty) artboardProperty.value = chartArtboard;
        });
      }
    },
    onLoadError: function () {
      console.log('Main Rive file failed to load');
    },
  });

  // Load components.riv for Bar and Ring artboards.
  var componentsFile = new rive.RiveFile({
    src: 'components.riv',
    onLoad: function () {
      barArtboard = componentsFile.getBindableArtboard('Bar') || componentsFile.getArtboard('Bar');
      ringArtboard = componentsFile.getBindableArtboard('Ring') || componentsFile.getArtboard('Ring');
      chartArtboard = barArtboard;
      attachChart();
    },
    onLoadError: function () {
      console.warn('components.riv failed to load');
    },
  });
  componentsFile.init();

  // Load arc.riv for Arc artboard (used by Arc button).
  var arcFile = new rive.RiveFile({
    src: 'arc.riv',
    onLoad: function () {
      arcArtboard = arcFile.getBindableArtboard('Arc') || arcFile.getArtboard('Arc');
      attachChart();
    },
    onLoadError: function () {
      console.warn('arc.riv failed to load');
    },
  });
  arcFile.init();

  function resize() {
    if (riveInstance) riveInstance.resizeDrawingSurfaceToCanvas();
  }

  window.addEventListener('resize', resize);

  var lastDPR = window.devicePixelRatio || 1;
  var checkDPR = setInterval(function () {
    var dpr = window.devicePixelRatio || 1;
    if (dpr !== lastDPR) {
      lastDPR = dpr;
      resize();
    }
  }, 500);
};


main();

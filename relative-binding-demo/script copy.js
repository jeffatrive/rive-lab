// (function () {
//   var canvas = document.getElementById('riveCanvas');
//   if (!canvas) return;

//   var riveInstance = null;
//   var artboardProperty = null;
//   var chartArtboard = null;

//   function attachChart() {
//     if (!artboardProperty) {
//       console.log('[attachChart] artboardProperty not ready yet');
//       return;
//     }
//     if (!chartArtboard) {
//       console.log('[attachChart] chartArtboard not ready yet');
//       return;
//     }
//     artboardProperty.value = chartArtboard;
//     console.log('[attachChart] bound external artboard to property');
//   }

//   var layout = new rive.Layout({ fit: rive.Fit.Layout });

//   riveInstance = new rive.Rive({
//     canvas: canvas,
//     layout: layout,
//     autoplay: true,
//     autoBind: true,
//     src: 'relative_bind_demo-host.riv',
//     artboard: 'Artboard',
//     stateMachines: ['State Machine 1'],
//     onLoad: function () {
//       if (riveInstance) riveInstance.resizeDrawingSurfaceToCanvas();
//       var vmi = riveInstance.viewModelInstance;
//       if (!vmi) {
//         console.warn('[Main] No viewModelInstance – ensure the main .riv has a View Model and autoBind is used');
//         return;
//       }
//       // Discover artboard property: try default View Model property names, then common path names
//       var vm = riveInstance.defaultViewModel();
//       var path = null;
//       if (vm && typeof vm.properties !== 'undefined' && Array.isArray(vm.properties)) {
//         for (var i = 0; i < vm.properties.length; i++) {
//           var propName = vm.properties[i].name;
//           if (vmi.artboard(propName)) {
//             path = propName;
//             break;
//           }
//         }
//       }
//       var fallbacks = ['artboard', 'chart', 'Artboard', 'Artboard property', 'ring', 'Ring'];
//       if (!path) {
//         for (var j = 0; j < fallbacks.length; j++) {
//           if (vmi.artboard(fallbacks[j])) {
//             path = fallbacks[j];
//             break;
//           }
//         }
//       }
//       artboardProperty = path ? vmi.artboard(path) : null;
//       if (!artboardProperty) {
//         console.warn("[Main] No artboard property found. Tried path '" + path + "' and default View Model property names. In the Rive editor, check the View Model's Artboard-type property name and use: vmi.artboard('YourPropertyName')");
//         return;
//       }
//       // Path comes from your View Model (e.g. "artboard" or "artbaord" if typo in editor)
//       console.log('[Main] artboard property ready (path: "' + path + '")');
//       attachChart();
//     },
//     onLoadError: function () {
//       console.log('Main Rive file failed to load');
//     },
//   });

//   // Load external .riv and bind its artboard to the main file's artboard property.
//   var assetsFile = new rive.RiveFile({
//     src: 'components.riv',
//     onLoad: function () {
//       // Prefer getBindableArtboard for binding; fall back to getArtboard if Ring has no view model
//       chartArtboard = assetsFile.getBindableArtboard('Ring') || assetsFile.getArtboard('Ring');
//       if (!chartArtboard) {
//         console.warn("[Assets] Artboard 'Ring' not found in relative_bind_demo.riv – check name and file");
//         return;
//       }
//       console.log('[Assets] Ring artboard ready');
//       attachChart();
//     },
//     onLoadError: function () {
//       console.error('Assets Rive file failed to load – check path and CORS for relative_bind_demo.riv');
//     },
//   });
//   assetsFile.init();

//   function resize() {
//     if (riveInstance) riveInstance.resizeDrawingSurfaceToCanvas();
//   }

//   window.addEventListener('resize', resize);

//   var lastDPR = window.devicePixelRatio || 1;
//   var checkDPR = setInterval(function () {
//     var dpr = window.devicePixelRatio || 1;
//     if (dpr !== lastDPR) {
//       lastDPR = dpr;
//       resize();
//     }
//   }, 500);
// })();

import { createDictation, isDictationSupported } from "./dictation.js";

// Names shared with the Rive file. Keep these in sync with the view model in
// rive/scene.rml and with DictationText.luau.
const RIV_FILE = "./live-dictation.riv";
const PROP_FINAL = "finalText";
const PROP_INTERIM = "interimText";
const PROP_REDUCE_MOTION = "reduceMotion";
const PROP_LISTENING = "listening";

const { Rive, Layout, Fit } = window.rive;

const canvas = document.getElementById("canvas");
const micButton = document.getElementById("mic");
const clearButton = document.getElementById("clear");
const statusEl = document.getElementById("status");
const transcriptEl = document.getElementById("transcript");
const typingInput = document.getElementById("typing-input");

let props = null;

const r = new Rive({
  src: RIV_FILE,
  canvas,
  autoplay: true,
  autoBind: true,
  layout: new Layout({ fit: Fit.Layout }),
  onLoad: () => {
    r.resizeDrawingSurfaceToCanvas();
    const vmi = r.viewModelInstance;
    if (!vmi) {
      statusEl.textContent = "The Rive file has no view model bound.";
      return;
    }
    props = {
      final: vmi.string(PROP_FINAL),
      interim: vmi.string(PROP_INTERIM),
      reduceMotion: vmi.boolean(PROP_REDUCE_MOTION),
      listening: vmi.boolean(PROP_LISTENING),
    };
    syncReducedMotion();
  },
  onLoadError: () => {
    statusEl.textContent = "Couldn't load the Rive file.";
  },
});

function setText(finalText, interimText) {
  if (props) {
    props.final.value = finalText;
    props.interim.value = interimText;
  }
  transcriptEl.textContent = finalText;
}

// Reduced motion: the script settles glyphs instantly when this is true.
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
function syncReducedMotion() {
  if (props?.reduceMotion) props.reduceMotion.value = motionQuery.matches;
}
motionQuery.addEventListener("change", syncReducedMotion);

// Keep the drawing surface sharp on resize and when moving between screens.
function computeSize() {
  r.resizeDrawingSurfaceToCanvas();
}
window.addEventListener("resize", computeSize);
window
  .matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  .addEventListener("change", computeSize);

if (isDictationSupported) {
  const dictation = createDictation({
    lang: navigator.language || "en-US",
    onText: ({ final, interim }) => setText(final, interim),
    onState: (state) => {
      const on = state === "listening";
      micButton.setAttribute("aria-pressed", String(on));
      micButton.textContent = on ? "Stop listening" : "Start listening";
      statusEl.textContent = on ? "Listening…" : "Stopped.";
      if (props?.listening) props.listening.value = on;
    },
    onError: (error) => {
      if (error === "not-allowed" || error === "service-not-allowed") {
        statusEl.textContent = "Microphone access was blocked. Allow it in your browser to dictate.";
      } else if (error !== "no-speech" && error !== "aborted") {
        statusEl.textContent = `Speech recognition stopped (${error}).`;
      }
    },
  });

  micButton.addEventListener("click", () => {
    if (dictation.listening) dictation.stop();
    else dictation.start();
  });
  clearButton.addEventListener("click", () => dictation.clear());
} else {
  // No SpeechRecognition (for example Firefox): typing drives the same effect.
  document.body.classList.add("no-speech");
  statusEl.textContent = "Speech isn't available in this browser, so type instead.";
  typingInput.addEventListener("input", () => setText(typingInput.value, ""));
  clearButton.addEventListener("click", () => {
    typingInput.value = "";
    setText("", "");
  });
}

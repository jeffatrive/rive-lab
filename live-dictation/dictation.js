// Live dictation with the browser's Web Speech API.
// Emits the transcript as it grows: `final` text is settled, `interim` is the
// words the recognizer is still guessing at. Works in Chrome, Edge and Safari.
// Firefox has no SpeechRecognition, so callers should offer a typing fallback.

const Recognition =
  globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

export const isDictationSupported = Boolean(Recognition);

export function createDictation({ lang = "en-US", onText, onState, onError } = {}) {
  if (!Recognition) {
    throw new Error("Speech recognition isn't supported in this browser.");
  }

  const rec = new Recognition();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = "";
  let wantRunning = false;

  rec.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const piece = result[0].transcript;
      if (result.isFinal) {
        finalText = joinText(finalText, piece);
      } else {
        interim = joinText(interim, piece);
      }
    }
    onText?.({ final: finalText, interim, full: joinText(finalText, interim) });
  };

  rec.onstart = () => onState?.("listening");
  rec.onerror = (event) => {
    // "no-speech" and "aborted" are routine; anything else stops the session.
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      wantRunning = false;
    }
    onError?.(event.error);
  };
  rec.onend = () => {
    // Chrome ends continuous sessions after a pause; restart while wanted.
    if (wantRunning) {
      try {
        rec.start();
        return;
      } catch {
        /* already starting */
      }
    }
    onState?.("idle");
  };

  return {
    start() {
      wantRunning = true;
      rec.start();
    },
    stop() {
      wantRunning = false;
      rec.stop();
    },
    clear() {
      finalText = "";
      onText?.({ final: "", interim: "", full: "" });
    },
    get listening() {
      return wantRunning;
    },
  };
}

function joinText(a, b) {
  const left = a.trim();
  const right = b.trim();
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}

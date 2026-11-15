# Live Dictation

A voice-to-text demo built with Rive. You talk, and the words appear on a Rive
artboard one glyph at a time: new letters rise and fade in, words the
recognizer is still guessing at wobble in a dim orange, and they pop into place
once they're final.

## What's here

- `rive/`: the Rive CLI project.
  - `rive.yaml`: project config (name, default artboard `main`, logs in `build/`).
  - `scene.rml`: the `main` artboard. It still needs the view model, font,
    script node and state machine (see "Finishing the scene").
  - `DictationText.luau`: a Node script that draws the transcript glyph by glyph.
  - `fonts/Inter.ttf`: Inter, under the SIL Open Font License (`fonts/OFL.txt`).
- The page itself sits at the top of this folder, so it serves at
  `/live-dictation/` on the Rive Lab site:
  - `dictation.js`: wraps the browser's Web Speech API (Chrome, Edge, Safari).
  - `main.js`: loads `live-dictation.riv` and writes the transcript into its view model.
  - `index.html`: the page, with a start/stop button, a screen-reader
    transcript, and a typing fallback for browsers without speech.

## How the pieces talk

The page and the script share one view model on the `main` artboard:

| Property       | Type    | Set by | Used for |
| -------------- | ------- | ------ | -------- |
| `finalText`    | string  | page   | settled words, drawn white |
| `interimText`  | string  | page   | words still being guessed, drawn dim and wobbling |
| `reduceMotion` | boolean | page   | follows `prefers-reduced-motion`; glyphs appear without animating |
| `listening`    | boolean | page   | true while the mic is on, free for state machine use |

The script listens for changes to the two strings, works out which characters
are new, and only animates those.

## Finishing the scene (on your Mac)

The Rive CLI couldn't be downloaded in the cloud workspace this was written in,
so `scene.rml` is a starting point and nothing here has been built yet. The
exact RML for view models, data binding and placing a script node isn't in
Rive's public docs, so it's easiest to finish with the CLI's own reference:

```sh
rive schema --search ViewModel
rive schema --search Script
rive schema --search Font
rive docs skeleton
```

Add to `scene.rml`:

1. A view model with the four properties above, and bind the `main` artboard to it.
2. A `FontAsset` for `fonts/Inter.ttf` named `Inter` (the script asks for that name).
3. A `ScriptAsset` for `DictationText.luau` and a node on `main` that runs it,
   placed near the top left (about x 80, y 120).
4. A state machine that plays on load, set as the artboard's `defaultStateMachineId`.

A Claude Code session started in `rive/` picks up the CLI's own agent notes
if you copy in the `AGENTS.md` and `CLAUDE.md` that `rive create` writes.

## Build and check

```sh
cd rive
rive . --verify          # compile check, no file written
rive .                   # live preview window, rebuilds on save
rive . --data=finalText="hello there" --data=interimText="how are"
```

The web runtime only plays scripts in signed files, so build the web copy with
`--publish` (needs `rive login`) and copy it next to the page:

```sh
rive login
rive . --publish=local
cp build/live-dictation.riv ../
```

## Run the page

Speech recognition needs a secure origin, and `localhost` counts:

```sh
cd live-dictation
python3 -m http.server 8080
```

Then open http://localhost:8080 in Chrome, press Start listening, and allow the
microphone. In Firefox, type in the box instead.

## Accessibility

- The canvas is decorative (`aria-hidden`); a hidden `aria-live` region reads
  out settled words, so screen readers don't hear every interim guess.
- The mic button is a toggle with `aria-pressed`, and status changes are
  announced through a `role="status"` line.
- `prefers-reduced-motion` turns the glyph animation off.
- Browsers without speech recognition get a text field that drives the same effect.

## Not checked yet

Nothing has been compiled. These are the parts most likely to need a fix on
the first build:

- The script reads inputs as plain values (`self.fontSize`), which the docs
  imply but don't state.
- `glyph.x` and `line.baseline` are assumed to be in the text's own space.
- The font's asset name: the script looks for `Inter`.
- The web runtime is pinned to `@rive-app/webgl2@2.50.0`; Rive's docs don't
  list a minimum version for scripting.

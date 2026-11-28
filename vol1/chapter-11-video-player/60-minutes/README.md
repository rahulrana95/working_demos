# Chapter 11: Video player, the 60-minute answer

A video player for a streaming site: play, pause, seek, volume, a clear state
for loading, buffering and errors, full keyboard use, captions, translated
texts and the quality decision.

This is the staff answer. It is the [45-minute answer](../45-minutes) plus 15
minutes of work. What a team adds after the interview is in
[`../production`](../production). The [chapter README](../README.md) compares the three.

**Live demo:** see the link in the repository description.

## Run it

You need Node.js 20 or newer.

```bash
npm install
```

```bash
npm test
```

```bash
npm run dev
```

Then open the address that the last command prints, usually `http://localhost:5173`.

## The video in the demo is simulated

The demo and the tests download no video file. `src/demo/simulatedMedia.ts`
takes the real `<video>` element of the player and replaces the parts a player
uses with a clock that a timer moves. The [45-minute README](../45-minutes/README.md)
says why, and why a canvas with `captureStream()` could not do the job.

Two more things are simulated in this folder:

- **The caption timing.** The player puts a real `<track>` element in the video, and the demo gives it a real WebVTT file, made in memory. But a browser times the lines of that file against a real video, and there is none. So the simulation also stands in for `video.textTracks`: it says which line belongs to the current time.
- **The network for the quality decision.** The demo page has a "network speed" slider. Once a second it measures the buffer of the simulated video and asks `chooseQuality` for a level. A higher level makes the simulated download slower. No segment is loaded.

## What was added to the 45-minute answer

| Addition                                   | Why it matters                                                                                                                                            | Minutes |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Captions (`captionsSrc`, `useCaptions.ts`) | A `<track>` element and a Captions button. We draw the text ourselves, just above the controls, so the controls never cover it.                           | 3       |
| `chooseQuality`                            | The adaptive-bitrate decision as one pure function: go up only when the speed is clearly enough, do not go down for a short dip while the buffer is full. | 5       |
| Seek once per drag (`SeekBar.tsx`)         | While the user drags, only the thumb and the time text move. One seek is sent when the user lets go. With streaming, every seek is a network request.     | 2       |
| `messages` and `locale`                    | Every text can be translated. The spoken time ("1 minute 20 seconds") comes from the browser, in the words and plural forms of the language.              | 5       |

Each addition is small on purpose. The state machine and the hook are the same
files as in the 45-minute answer, line for line.

## What is part of the interview

| File                                 | In the interview? | Time       | Lines of code |
| ------------------------------------ | ----------------- | ---------- | ------------- |
| `src/player/playerMachine.ts`        | Yes               | 10 minutes | 61            |
| `src/player/usePlayer.ts`            | Yes               | 12 minutes | 75            |
| `src/player/time.ts`                 | Yes               | 4 minutes  | 26            |
| `src/player/SeekBar.tsx`             | Yes               | 8 minutes  | 68            |
| `src/player/shortcuts.ts`            | Yes               | 2 minutes  | 9             |
| `src/player/Player.tsx`              | Yes               | 14 minutes | 116           |
| `src/player/messages.ts`             | Yes               | 2 minutes  | 22            |
| `src/player/chooseQuality.ts`        | Yes               | 5 minutes  | 27            |
| `src/player/useCaptions.ts`          | Yes               | 3 minutes  | 24            |
| `*.test.ts`, `*.test.tsx`            | No                |            |               |
| `src/App.tsx`, `src/demo/`           | No                |            |               |
| `src/styles.css`, `src/testUtils.ts` | No                |            |               |

Lines of code are counted without blank lines and comments: 428 in total.
The folder has 172 tests.

The player code is 2,880 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/player/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## The quality decision, and what this folder does not do

`chooseQuality(levels, measuredKbps, bufferSeconds, currentIndex)` returns the
index of the level to load next. `levels` is sorted from the lowest quality to
the highest.

- **Up:** one level at a time, and only when the buffer holds at least 10 seconds and the next level needs at most 70% of the measured speed.
- **Stay:** while the buffer holds at least 10 seconds, or the current level needs at most 90% of the measured speed.
- **Down:** otherwise, straight to the best level that needs at most 90% of the measured speed.

The gap between 70% and 90% is what stops the picture from switching up and
down every few seconds: a speed that moves a little around the limit of a
level changes nothing. The function needs the current level for that, so it
has four arguments.

**This folder does not stream.** The player sets `video.src` to one file and
the browser loads it. Real adaptive streaming (HLS or DASH) downloads the
video in segments of a few seconds, at the level that a function like this one
picks, and gives them to the `<video>` element through Media Source
Extensions. A library does that work (for example hls.js, dash.js or Shaka
Player); product teams do not write it. Left out here, on purpose:

- Loading the list of levels and segments (the manifest).
- Downloading segments and measuring the speed.
- Media Source Extensions: source buffers, appending segments, removing old ones.
- Switching the level in the middle of a video, and a menu to pick a level by hand.
- Live streams, protected content (DRM) and audio tracks.

`chooseQuality` is exported and tested, but the `Player` of this folder does
not call it. The demo page calls it, with a simulated network. The
[`production`](../production) folder has the interface for a streaming engine
and the quality menu.

## How the styles ship

The player needs CSS to work as described. It needs the rules in
`src/styles.css` under the "Player" heading. The other rules style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--player-accent`, `--player-text`, `--player-surface`) are CSS variables, so a host app can theme the player.
- Sizes and sides use logical properties (`inline-size`, `inset-inline`, …), so the layout mirrors itself in a right-to-left language. The played part of the seek bar is then drawn from the right.
- The captions are inside the bar of controls and are placed against its upper edge, so they are just above the controls whatever the height of the bar. On a narrow phone the bar is two rows tall.
- The spinner is CSS only, and stays hidden for the first 300 ms.
- Buttons and sliders are at least 44px tall, and button text is at least 16px.

The measured JavaScript size does not include this CSS. The player rules are
1,179 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Player/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

The seven rows of the [45-minute answer](../45-minutes/README.md#why-it-holds-at-scale)
hold here too, with the same tests. This folder adds:

| Pressure                                       | What protects us                                                     | Test that proves it                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| The network speed moves around a level's limit | Going up needs more room than staying                                | `keeps one level when the speed moves 10% around the limit of the next level`     |
| A short dip in speed                           | A buffer of 10 seconds or more gives time                            | `does not go down for a slow moment while the buffer is safe`                     |
| The user drags the seek bar over 500 pixels    | One seek when the user lets go                                       | `does not seek on every move of a drag, and seeks once when the user lets go`     |
| Most viewers never switch captions on          | The track stays "disabled", and the browser does not load its file   | `does not load the captions file while captions are off`                          |
| Another team ships the player in Hindi         | Every text comes from `messages`; units and plurals from the browser | `uses the texts of the caller for every control, with no English left`            |
| A language with more than two plural forms     | `Intl.NumberFormat` writes the unit                                  | `uses the plural forms of the language: Russian has three`                        |
| A phone where the controls take two rows       | The captions are placed against the upper edge of the bar            | `places the captions above the bar of controls, so the controls never cover them` |

## Edge cases covered, on top of the 45-minute answer

- Captions are switched on in the middle of a line: the line is shown at once.
- A caption with two lines keeps its line break.
- A seek moves to the caption of the new time.
- No `captionsSrc`: no `<track>`, no Captions button.
- The video plays on during a drag: the thumb stays under the finger.
- A drag is cancelled by the browser (`pointercancel`): no seek, and the bar shows the real time again.
- A change of the seek bar that is not part of a drag (Page Up, a screen reader) seeks at once.
- `messages` with only some texts: the others keep their English default.
- `chooseQuality` with one level, a speed of 0 or an endless speed returns a level that exists.

## Accessibility

Everything in the [45-minute answer](../45-minutes/README.md#accessibility), and:

- Captions is a toggle button with `aria-pressed`.
- The `<track>` element carries the language of the captions (`srcLang`, from `locale`).
- While the user drags the seek bar, `aria-valuetext` says the time under the thumb.
- The spoken time is written by `Intl.NumberFormat` in the language of `locale`: "1 minute 20 seconds" in English, "1 मिनट 20 सेकंड" in Hindi.
- The captions have a dark background, and a border that only high-contrast mode shows.

## What this folder leaves out

These are in the design brief for a staff answer, but they do not fit in 15
minutes of typing next to the rest. They are built in [`production`](../production):

- The downloaded ranges drawn on the seek bar, and a preview of the time under the mouse.
- A menu to pick the quality by hand.
- A setting for the size of the caption text.
- Full screen, picture-in-picture and playback speed.
- Remembering the volume, the captions and the place in the video.
- Hiding the controls after 3 seconds, and "tap to show the controls" on a phone.

Also not here: a caption file can mark up its text (`<i>`, `<v Name>`). This
folder shows the marks as they are. `production` takes them out.

## Try it in the demo

1. Press "Captions". The lines appear just above the controls.
2. Drag the seek bar. The time text follows the thumb, and the video jumps once, when you let go.
3. Tick "Hindi texts". Every button changes, and a screen reader hears the time in Hindi.
4. Pull "Network speed" down to 600. The quality stays while the buffer is full, then drops. Push it up to 8000: the quality climbs one level at a time.
5. Everything from the [45-minute demo](../45-minutes/README.md#try-it-in-the-demo) works here too.

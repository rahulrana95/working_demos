# Chapter 11: Video player

A video player for the web, as used on a streaming site: play, pause, seek,
volume, captions, and a clear state for loading, buffering and errors.

This chapter has three folders. Two are interview answers to the same
question. The third is not an interview answer: it shows what a team adds
after the interview. Each folder is a separate project, so you can run them
side by side and compare the code.

| Folder                     | Level                   | What it is                                                                                                              |
| -------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`45-minutes`](45-minutes) | Senior                  | The player state as one state machine, a hook that follows the `<video>` element, accessible controls and shortcuts.    |
| [`60-minutes`](60-minutes) | Staff                   | The same code, plus captions, translated texts, one seek per drag and the adaptive-quality decision as a pure function. |
| [`production`](production) | Not an interview answer | The staff answer, plus what you add in the first week before real users see it.                                         |

Start with `45-minutes`. Then compare two folders to see only the additions:

```bash
git diff --no-index 45-minutes/src 60-minutes/src
```

```bash
git diff --no-index 60-minutes/src production/src
```

No folder downloads a video. The demo and the tests use a simulated video
element with a clock moved by a timer (`src/demo/simulatedMedia.ts`, the same
file in all three folders). The [45-minute README](45-minutes/README.md#the-video-in-the-demo-is-simulated)
says how it works and why.

## The three folders in numbers

Lines of code are the lines in `src/player`, without tests, blank lines and
comments, and without `index.ts` (6, 10 and 21 lines). The size is the player
code without React, minified and compressed with gzip. Each folder's README
has the command that measures it.

| Folder       | Tests | Lines of code | JavaScript (min + gzip) | Styles (min + gzip) |
| ------------ | ----- | ------------- | ----------------------- | ------------------- |
| `45-minutes` | 131   | 314           | 2,273 bytes             | 1,058 bytes         |
| `60-minutes` | 172   | 428           | 2,880 bytes             | 1,179 bytes         |
| `production` | 362   | 1,551         | 8,107 bytes             | 1,549 bytes         |

The two interview answers have a hard limit, because the book says they can be
typed in the stated time: 320 lines for 45 minutes, 430 lines for 60 minutes.

## Which feature is in which folder

The design for this chapter asks for more than fits in those limits. So some
features moved down one level. This table is the full list.

| Feature                                                               | 45 minutes | 60 minutes | production |
| --------------------------------------------------------------------- | ---------- | ---------- | ---------- |
| State machine with eight states, pure and fully tested                | Yes        | Yes        | Yes        |
| Hook that follows the `<video>` element; `play()` promise handled     | Yes        | Yes        | Yes        |
| Only the seek bar is drawn again on `timeupdate`                      | Yes        | Yes        | Yes        |
| Play/pause, seek bar, time, mute, volume, error with "Try again"      | Yes        | Yes        | Yes        |
| Spinner only after 300 ms                                             | Yes        | Yes        | Yes        |
| Keyboard shortcuts, slider pattern, visible focus                     | Yes        | Yes        | Yes        |
| Captions with a `<track>`, drawn above the controls                   |            | Yes        | Yes        |
| `chooseQuality` with a gap between going up and staying               |            | Yes        | Yes        |
| One seek per drag; the time under the thumb during a drag             |            | Yes        | Yes        |
| `messages`, `locale`, logical CSS                                     |            | Yes        | Yes        |
| Downloaded ranges drawn; time under the mouse and during keyboard use |            |            | Yes        |
| Quality menu with a manual choice; engine interface                   |            |            | Yes        |
| Caption size                                                          |            |            | Yes        |
| Full screen, picture-in-picture, playback speed                       |            |            | Yes        |
| Volume, captions and the place in the video remembered                |            |            | Yes        |
| Controls hide after 3 seconds; tap to show them                       |            |            | Yes        |
| Errors by kind, retry with a growing wait, the place kept             |            |            | Yes        |
| Stall detector, playback quality events, Media Session                |            |            | Yes        |
| `preload`, data saving, pause in a hidden tab, less motion            |            |            | Yes        |
| Keyboard help dialog, error boundary                                  |            |            | Yes        |

Moved down from the 45-minute brief: the downloaded part of the seek bar
(`bufferedEnd`). Moved down from the 60-minute brief: drawing the downloaded
ranges, the time preview on hover and during keyboard use, the manual quality
menu, the caption size, full screen, picture-in-picture, playback speed,
remembering settings and the place, and hiding the controls.

## What the extra 15 minutes buys

The 45-minute answer is a correct player for one team and one language. The
60-minute answer adds the four things another team asks for first.

| Addition                | Why it matters                                                                                                                     | Minutes |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Captions                | Required for many viewers and in many countries. Drawn by us, so the controls never cover them.                                    | 3       |
| `chooseQuality`         | The one part of adaptive streaming a candidate can write: the decision, with a gap that stops it from switching every few seconds. | 5       |
| One seek per drag       | With streaming, each seek is a network request. A drag over the bar sends one, not hundreds.                                       | 2       |
| `messages` and `locale` | No English is fixed in the player. The spoken time uses the plural rules of the language.                                          | 5       |

## What the first week adds

The `production` folder is what a team builds after the interview. Do not try
to write it in an interview. Know that it exists, and name one or two of these
when the interviewer asks, "What would you do next?"

| Addition                            | Why it matters                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Engine interface                    | A real streaming library is plugged in with one small adapter. Nobody writes the engine.            |
| Errors by kind, with retries        | A short network drop in a long film repairs itself, at the same second.                             |
| Stall detector                      | A frozen picture that the element does not report still shows a spinner and reaches the monitoring. |
| Playback quality events             | Time to first frame and rebuffering are the numbers a video team watches. No personal data in them. |
| `preload` and data saving           | A page with many videos downloads nothing until the user presses Play.                              |
| Remembering                         | The user comes back to the same second, with the same volume and captions.                          |
| Media Session                       | The lock screen and the headset buttons work.                                                       |
| Help dialog, error boundary, hiding | The parts every shipped player has and no interview has time for.                                   |

The [production README](production/README.md) names the test that proves each one,
and lists what is still not built.

## Measure what React draws in a real browser

`scripts/measure-renders.mjs` plays the demo in a real Chromium for 10 seconds
and prints how often React drew the whole player and how often the seek bar
changed. It runs twice: with a `timeupdate` event every 250 ms, the slowest a
browser sends them, and every 15 ms, the fastest. It needs
[Playwright](https://playwright.dev) installed, with its Chromium browser.

In one terminal, build a folder and serve it:

```bash
cd 45-minutes && npm run build && npx vite preview
```

In a second terminal, in this folder:

```bash
node scripts/measure-renders.mjs
```

The script opens `http://localhost:4173`. If the preview prints another
address, pass it: `node scripts/measure-renders.mjs http://localhost:4174`.

This is the 45-minute answer on our machine. The other two folders print the
same numbers:

```text
timeupdate every 250 ms, 10 s of playback: timeupdate events 4.0/s; whole player drawn 0.0/s (0 times); seek bar changed 4.0/s
timeupdate every 15 ms, 10 s of playback: timeupdate events 66.8/s; whole player drawn 0.0/s (0 times); seek bar changed 66.8/s
```

What the numbers mean:

- "timeupdate events" is how many the simulated video element sent.
- "whole player drawn" is how many times React called the `Player` function. The demo page wraps `Player` to count the calls.
- "seek bar changed" is how many times the seek bar or the time text changed on the page, counted with a `MutationObserver`. One drawing of the seek bar by React is one change.

What they do not mean:

- They are lab numbers from one desktop computer with a simulated video. A real video element chooses its own `timeupdate` rate, between about 4 and 66 a second, by the load of the machine.
- They count drawings, not time. They do not say how long one drawing takes on a slow phone.
- In `production` the measurement starts after the controls have hidden. Hiding them is one drawing of the player.

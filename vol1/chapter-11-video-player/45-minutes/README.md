# Chapter 11: Video player, the 45-minute answer

A video player for a streaming site: play, pause, seek, volume, a clear state
for loading, buffering and errors, and full keyboard use.

This is the senior answer. The staff answer, with 15 more minutes of work, is
in [`../60-minutes`](../60-minutes). What a team adds after the interview is in
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
uses (`src`, `play()`, `pause()`, `currentTime`, `duration`, `buffered`,
`volume` and the media events) with a clock that a timer moves. The player
does not know: it talks to the element in the normal way, so the same player
code works with a real file.

The picture you see is a small canvas, drawn for the current time and shown as
the poster of the `<video>` element.

We did not use a canvas captured with `captureStream()`. That gives the
`<video>` a live stream: it has no duration, it cannot seek, it has no
downloaded ranges and it never ends. So it could not show the things this
chapter is about.

## What is part of the interview

Every source file says on its first lines whether you would write it in the
interview. `index.html` and `vite.config.ts` say so too. The JSON files do not,
because JSON cannot hold a comment: none of them is part of the interview.

| File                                 | In the interview? | Time       | Lines of code |
| ------------------------------------ | ----------------- | ---------- | ------------- |
| `src/player/playerMachine.ts`        | Yes               | 10 minutes | 61            |
| `src/player/usePlayer.ts`            | Yes               | 12 minutes | 75            |
| `src/player/time.ts`                 | Yes               | 4 minutes  | 25            |
| `src/player/SeekBar.tsx`             | Yes               | 6 minutes  | 50            |
| `src/player/shortcuts.ts`            | Yes               | 2 minutes  | 9             |
| `src/player/Player.tsx`              | Yes               | 11 minutes | 94            |
| `*.test.ts`, `*.test.tsx`            | No                |            |               |
| `src/App.tsx`, `src/demo/`           | No                |            |               |
| `src/styles.css`, `src/testUtils.ts` | No                |            |               |

Lines of code are counted without blank lines and comments: 314 in total.
The folder has 131 tests.

The player code is 2,273 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/player/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

Write the files in the order of the table. The state machine comes first: it
is the centre of the answer, and you can draw it while you type it.

## The state machine

The player is in exactly one of eight states. `TRANSITIONS` in
`playerMachine.ts` is the whole machine, as one table:

| State       | Meaning                                           | Leaves on                                                                         |
| ----------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `idle`      | no source yet                                     | `load`                                                                            |
| `loading`   | a source is set, we cannot play yet               | `canplay` → ready, `playing` → playing, `error`                                   |
| `ready`     | can play, has not played yet                      | `play` → buffering, `playing` → playing, `error`                                  |
| `playing`   | the picture moves                                 | `pause` → paused, `waiting` → buffering, `ended`, `error`                         |
| `paused`    | the user stopped it                               | `play` → buffering, `playing` → playing, `ended`, `error`                         |
| `buffering` | the user wants to play, the picture is not moving | `playing` → playing, `pause` → paused, `play_rejected` → paused, `ended`, `error` |
| `ended`     | the video is over                                 | `play` → buffering, `playing` → playing, `seek` → paused, `error`                 |
| `error`     | the video could not be loaded or played           | `retry` → loading                                                                 |

`load` (a new source) leads to `loading` from every state. Any other pair of
state and event changes nothing.

Where the events come from:

- From the `<video>` element: `loadedmetadata`, `canplay`, `playing`, `pause`, `waiting`, `ended`, `error`, `timeupdate`.
- From the user: `play`, `seek`, `retry`. A pause by the user has no event of its own: the hook calls `video.pause()`, and the `pause` event of the element moves the machine.
- From the hook: `load` when it sets the source, and `play_rejected` when the promise of `video.play()` rejects.

## Why the whole player is not drawn again many times a second

The `timeupdate` event fires 4 to 66 times a second. The state lives in a small
store outside React (`createPlayerStore` in `usePlayer.ts`). A component reads
one value with `usePlayerValue(store, select)`, and React draws it again only
when that value changes. `Player` reads the status. Only `SeekBar` reads the
time. So while the video plays, React draws the seek bar and nothing else.

The [chapter README](../README.md) has a script that measures it in a real browser.

## How the styles ship

The player needs CSS to work as described. It needs the rules in
`src/styles.css` under the "Player" heading. The other rules style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--player-accent`, `--player-text`, `--player-surface`) are CSS variables, so a host app can theme the player.
- The spinner is CSS only. It is drawn for `data-status="loading"` and `"buffering"`, and an animation keeps it hidden for the first 300 ms.
- The seek bar is a native range input. The CSS fills the played part from the `--played` variable that the component sets.
- Buttons and sliders are at least 44px tall, and button text is at least 16px.

The measured JavaScript size does not include this CSS. The player rules are
1,058 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Player/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

| Pressure                                          | What protects us                                                         | Test that proves it                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Media events arrive late, twice or in a new order | One table of transitions; every other pair of state and event is ignored | `moves only as the table says, and returns the same object when nothing changes` |
| Thousands of events in any order                  | The machine cannot leave its eight states                                | `never leaves the eight states, whatever order 5,000 events arrive in`           |
| `timeupdate` fires up to 66 times a second        | Only the seek bar reads the time from the store                          | `draws only the seek bar again while the video plays, not the whole player`      |
| The browser blocks autoplay                       | The rejected `play()` promise is caught; the Play button stays           | `stays on the Play button, with no error, when the browser blocks autoplay`      |
| The network stalls, and the user pauses meanwhile | "buffering" is one state, and a pause leaves it for good                 | `stays paused when the user pauses during a stall and the data arrives later`    |
| Play and Pause pressed with nothing in between    | The interrupted `play()` promise is handled, not shown as an error       | `pauses when the user presses Play and then Pause before the video has started`  |
| The player is removed while the video downloads   | Listeners are removed, the source is taken away, the download stops      | `stops the download and every timer when it is removed while playing`            |

## Edge cases covered

- Autoplay is refused before the video can play: the player becomes ready and shows Play.
- `play()` is refused after the video was ready: the player goes back to the Play button.
- An old browser returns nothing from `play()`: no error.
- The download is slower than the video: the player buffers, then plays again.
- A seek to a part that is not downloaded yet: buffering, then playing.
- A seek before the start or after the end is kept inside the video.
- The end: the element sends `pause` just before `ended`. The machine accepts `ended` from both states.
- Play after the end starts from the beginning. A seek back from the end gives a paused video, not an ended one.
- A failed load shows "The video could not be loaded." and "Try again". A second failure shows it again. The player never tries by itself.
- "Try again" removes its own button, so the focus moves to the player and the keyboard is not lost.
- While the error is shown, Play, Space and the arrows do nothing, and the seek bar is disabled.
- A new `src` starts from zero in the loading state.
- A duration that is not a number (a live stream reports `Infinity`) is stored as 0, and the seek bar stays disabled.
- The volume is changed from outside the player (`video.volume = …`): the slider and the Mute button follow.
- Moving the volume switches the sound back on.
- A shortcut key with Ctrl, Alt or Cmd is left to the browser.

## Accessibility

- Every control is a real `<button>` or a native `<input type="range">`. A range input has the `slider` role, and the browser fills in `aria-valuemin`, `aria-valuemax` and `aria-valuenow` from `min`, `max` and `value`. We add `aria-valuetext`, so a screen reader says "1 minute 20 seconds of 5 minutes" and not a bare number.
- The seek bar follows the WAI-ARIA slider pattern: Right and Up go forward 5 seconds, Left and Down go back, Home and End jump to the start and the end.
- The player is a `role="group"` with the title of the video as its name. It can take the focus, and the shortcuts work only while the focus is inside it: Space or K (play, pause), Left and Right (5 seconds), Up and Down (volume), M (mute), Home and End.
- A focused control keeps its own keys: Space and Enter press a focused button and do not also play; the arrows move a focused slider. A text field keeps every key (`controlOwnsKey` in `shortcuts.ts`).
- The error is a `role="alert"`, so it is read out when it appears. While the player loads or buffers it has `aria-busy="true"`. The spinner itself is decoration.
- Mute is a toggle button with `aria-pressed`. A pressed button has a thicker border and a line through its text, not only another colour.
- The focus has a real outline. High-contrast mode keeps the borders of the seek bar and its thumb.
- The controls are always visible in this folder. Hiding them is in `production`.

## What this folder leaves out

- The downloaded ranges are not drawn, and the hook does not report a `bufferedEnd`. Both are in `production`.
- After "Try again" the video starts from the beginning. Keeping the place is in `production`.
- Captions, the quality decision, translated texts: `60-minutes`.

## Try it in the demo

1. Press Tab to focus the player. Space pauses and plays. Right moves 5 seconds. M mutes. Tab reaches every control.
2. Tick "Block autoplay" and press "Load the player again". The player waits with its Play button, and the console has no error. Press Play.
3. Press "Buffer for 3 seconds". The state goes to `buffering` and back. The spinner appears only after 300 ms.
4. Tick "Fail to load" and press "Load the player again". Untick it and press "Try again".
5. Watch the two counters while the video plays: the player stands still, the seek bar goes up.

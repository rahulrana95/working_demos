# Chapter 11: Video player, the production version

**This folder is not an interview answer.** It is the
[60-minute answer](../60-minutes) plus what a team builds in the first week
before real users see the player: failure handling, monitoring, the interface
to a streaming engine, and the comfort features that did not fit in the
interview. Do not try to write it in an interview. Know that it exists.

The [chapter README](../README.md) compares the three folders.

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

The video in the demo is simulated, as in the other two folders
([why](../45-minutes/README.md#the-video-in-the-demo-is-simulated)). The
streaming engine in the demo is a fake one (`src/demo/fakeEngine.ts`): it
offers quality levels and switches between them, but it loads no segments.

## What was added to the 60-minute answer

| Addition                                              | Why it matters                                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine interface (`engine.ts`)                        | `loadSource`, `levels`, `setLevel`, `subscribe`, `unload`. A real streaming library is plugged in with one small adapter. The default engine lets the browser play one file. |
| Errors by kind (`playerMachine.ts`, `controller.ts`)  | Network, decode and "not supported" each get their own message. A network error is tried again by the player, after 1, 2 and 4 seconds, at the same second of the video.     |
| Stall detector (`stallDetector.ts`)                   | The picture stands still but the element says "playing": after 5 seconds the player shows buffering and reports it.                                                          |
| Playback quality events (`metrics.ts`, `onEvent`)     | Time to first frame, rebuffer count and time, quality switches, errors by kind, watch time in a heartbeat. No event holds the address, title or id of the video.             |
| Media Session (`mediaSession.ts`)                     | The play, pause and seek buttons of the lock screen, a headset and the media keys work.                                                                                      |
| `preload` and data saving                             | `none`, `metadata` or `auto`. A user who asked the browser to save data gets `none` and no autoplay.                                                                         |
| Hidden tab                                            | A muted video that started by itself is paused while its tab is hidden.                                                                                                      |
| Remembering (`storage.ts`, `videoId`)                 | Volume, mute, captions and caption size for the next visit; the place in each video.                                                                                         |
| Seek bar (`SeekBar.tsx`)                              | Every downloaded range is drawn. The time is shown under the mouse, under the thumb during a drag, and at the thumb while the keyboard is used.                              |
| Quality menu, speed, caption size                     | Native `<select>` menus: "Auto" or a fixed level, 0.5× to 2×, 75% to 200%.                                                                                                   |
| Full screen and picture-in-picture (`screenModes.ts`) | A button for each, drawn only where the browser can do it.                                                                                                                   |
| The controls hide (`useIdle.ts`)                      | After 3 seconds with no sign of the user while the video plays. Never while paused, buffering, focused or with the help open. On a phone, a tap brings them back.            |
| Keyboard help (`ShortcutHelp.tsx`)                    | A dialog with every shortcut, opened with `?`.                                                                                                                               |
| Error boundary (`PlayerErrorBoundary.tsx`)            | A bug in the player shows a message in its place. The page around it keeps working.                                                                                          |
| Less motion                                           | With `prefers-reduced-motion`, the spinner does not turn and the controls do not fade.                                                                                       |

## Lines of code

Counted without tests, blank lines and comments: 1,551 in `src/player`, without `index.ts` (21 lines).

| File                                 | Lines of code |
| ------------------------------------ | ------------- |
| `src/player/playerMachine.ts`        | 120           |
| `src/player/store.ts`                | 25            |
| `src/player/controller.ts`           | 171           |
| `src/player/usePlayer.ts`            | 60            |
| `src/player/engine.ts`               | 60            |
| `src/player/chooseQuality.ts`        | 27            |
| `src/player/metrics.ts`              | 134           |
| `src/player/stallDetector.ts`        | 31            |
| `src/player/storage.ts`              | 88            |
| `src/player/mediaSession.ts`         | 72            |
| `src/player/screenModes.ts`          | 71            |
| `src/player/useIdle.ts`              | 18            |
| `src/player/useCaptions.ts`          | 28            |
| `src/player/time.ts`                 | 41            |
| `src/player/shortcuts.ts`            | 9             |
| `src/player/messages.ts`             | 65            |
| `src/player/Player.tsx`              | 288           |
| `src/player/SeekBar.tsx`             | 103           |
| `src/player/QualityMenu.tsx`         | 48            |
| `src/player/ShortcutHelp.tsx`        | 58            |
| `src/player/PlayerErrorBoundary.tsx` | 34            |

The folder has 362 tests.

The player code is 8,107 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/player/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## How the styles ship

The player needs CSS to work as described. It needs the rules in
`src/styles.css` under the "Player" heading. The other rules style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--player-accent`, `--player-text`, `--player-surface`) are CSS variables, so a host app can theme the player.
- Sizes and sides use logical properties, so the layout mirrors itself in a right-to-left language.
- The CSS does the hiding of the controls: `data-idle="true"` makes them transparent, but not while one of them has the focus (`:focus-within`) or the mouse (`:hover`). They are transparent, not removed, so Tab still reaches them.
- The thumb of the seek bar is 18px wide. The layer with the downloaded ranges is 9px shorter on each side, and `THUMB_RADIUS_PX` in `time.ts` is the same 9.
- Buttons, sliders and menus are at least 44px tall, with text of at least 16px.

The measured JavaScript size does not include this CSS. The player rules are
1,549 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Player/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## How to use the new parts

### Props, in order

`src`, `title`, `autoPlay`, `poster`, `preload`, `captionsSrc`, `engine`,
`videoId`, `locale`, `messages`, `onEvent`, `stallTimeoutMs`.

```tsx
<Player
  src="https://example.com/film/master.m3u8"
  title="The name of the film"
  engine={engine}
  videoId="film-42"
  captionsSrc="https://example.com/film/captions.hi.vtt"
  locale="hi"
  messages={hindiMessages}
  preload="metadata"
  onEvent={sendToMonitoring}
/>
```

### A streaming engine

The player talks to the engine through five functions:

```ts
export interface StreamingEngine {
  loadSource: (video: HTMLVideoElement, src: string) => void;
  levels: () => QualityLevel[];
  setLevel: (level: number | "auto") => void;
  subscribe: (listener: (event: EngineEvent) => void) => () => void;
  unload: () => void;
}
```

An adapter for a real library is a small file: `loadSource` gives the library
the element and the address, `levels` and `setLevel` pass its levels through,
and its events become `levels`, `level_switched` and `error` (with a kind of
`"network"`, `"decode"` or `"unsupported"`). Send only errors the library
cannot repair itself. No adapter for a real library is in this repository.

Create the engine once, outside the render. A new engine object makes the
player load the video again.

Without an `engine` prop the player uses `createNativeEngine()`: it sets
`video.src`, and the browser loads the file. There are no levels then, and no
quality menu.

### Errors and retries

The contract is in the kind of the error:

| Kind          | Where it comes from                | What the player does                                                                                                                                                     |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `network`     | `MediaError` code 2, or the engine | Loads the source again by itself after about 1, 2 and 4 seconds, at the same second, playing or paused as before. After three tries it shows the error with "Try again". |
| `decode`      | `MediaError` code 3, or the engine | Shows the error with "Try again". A broken file does not get better by itself.                                                                                           |
| `unsupported` | `MediaError` code 4, or the engine | Shows the error with "Try again".                                                                                                                                        |

Two honest notes. With a plain file, a browser also reports code 4 when the
very first request for the file fails, so a network failure at the start is
shown as "could not be loaded" and is not tried again by the player. And the
wait before a retry is shortened by up to a quarter at random, so that many
players that lost the network at one moment do not all come back at one moment.

### Playback quality events

`onEvent` receives objects of this type:

```ts
export type PlayerMetricEvent =
  | { type: "first_frame"; ms: number }
  | { type: "autoplay_blocked" }
  | { type: "rebuffer_start"; count: number; afterSeek: boolean }
  | { type: "rebuffer_end"; ms: number; totalMs: number }
  | { type: "stall_detected" }
  | { type: "quality_switch"; fromHeight: number | null; toHeight: number; auto: boolean }
  | { type: "error"; kind: ErrorKind | "render"; retry: number }
  | { type: "heartbeat"; watchedMs: number; rebufferCount: number; rebufferMs: number }
  | { type: "ended" };
```

- `first_frame` is measured from the start of the load (with `preload="none"`: from the press of Play) to the first moving picture.
- A rebuffer is a stop after the first frame. `afterSeek` is true when it starts within a second of a seek, so a dashboard can leave those out.
- `heartbeat` is sent every 10 seconds while the video plays, once at the end, and once when the player is removed in the middle. `watchedMs` counts only time in the "playing" state.
- `error` with `retry: 1`, `2` or `3` is a network error that the player tries again. `retry: 0` is an error the user sees.
- The rebuffer ratio is `rebufferMs / (watchedMs + rebufferMs)`. The receiver works it out.

Every value is a number, `true` or `false`, `null`, or one of a few fixed
words. The player adds no address, title, video id, caption text or time in
the video. The receiver adds what it knows about the session.

### `preload` and its cost in data

| Value        | What is downloaded before Play                             | Use it for                                    |
| ------------ | ---------------------------------------------------------- | --------------------------------------------- |
| `"none"`     | Nothing. The status is `idle` until the user presses Play. | A page with many videos; expensive data.      |
| `"metadata"` | The length and the first picture. The default.             | One main video on a page.                     |
| `"auto"`     | As much as the browser likes.                              | A video the user came for, on a good network. |

With the default engine the value is the `preload` attribute of the `<video>`,
which is a hint: the browser may load less. `"none"` is more than a hint here:
the player does not give the engine the source until Play is pressed. A
streaming engine decides for itself how much to load for the other two values.

When `navigator.connection.saveData` is true, the player uses `"none"` and
does not autoplay, whatever the props say. Only some browsers have that property.

### Remembering

With a `videoId`, the place in the video is saved in `localStorage` under
`video-player:position:<videoId>`: once in 5 seconds of video, on every pause,
when the page is hidden for good (`pagehide`) and when the player is removed.
The first and the last 10 seconds of a video are not remembered. The volume,
mute, captions and caption size are saved under `video-player:settings`. If
the storage is missing, full or blocked, the player works with its defaults.

## Why it holds at scale

The rows of the [45-minute](../45-minutes/README.md#why-it-holds-at-scale) and
[60-minute](../60-minutes/README.md#why-it-holds-at-scale) answers hold here
too, with the same tests. This folder adds:

| Pressure                                                  | What protects us                                                        | Test that proves it                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| The network drops for a moment in a two-hour film         | Retry by the player, at the same second                                 | `loads again after 1 second, and goes on at the same second, still playing`                     |
| The network stays down                                    | Three tries with a longer wait each time, then the error. Never a loop. | `waits 1, 2 and 4 seconds, then shows the error with Try again`                                 |
| The player is removed while a retry waits                 | The timer is cancelled                                                  | `cancels the waiting retry when the player is removed`                                          |
| A frozen picture that the element does not report         | The stall detector watches the clock                                    | `shows buffering when the picture stands still for 5 seconds although the element plays`        |
| Events go to a monitoring service                         | Events hold numbers and fixed words only                                | `never puts the address, the title, the id or the captions of the video in an event`            |
| A page with 20 videos                                     | `preload="none"` loads nothing                                          | `loads nothing with preload none, and shows a Play button`                                      |
| `timeupdate` up to 66 times a second, and storage         | The place is saved once in 5 seconds of video                           | `saves once in 5 seconds of video while it plays, not on every time update`                     |
| `timeupdate` up to 66 times a second, and the lock screen | The system is told the position only when the status changes            | `tells the system the position on a change of status, not on every time update`                 |
| The mouse sends "move" many times a second                | A move only starts a timer again; React state changes when "idle" flips | `draws the player once when the controls hide, and not for the mouse moving over it`            |
| A bug in the player, or in a translation                  | The error boundary                                                      | `shows a message in place of the player, reports it, and keeps the page alive`                  |
| A muted preview in a tab nobody looks at                  | It is paused while the tab is hidden                                    | `pauses a muted video that started by itself while its tab is hidden, and plays it again after` |
| Storage is blocked or full                                | Every storage call is inside a try                                      | `works with its defaults when the storage throws on every call`                                 |
| A browser without full screen or picture-in-picture       | The buttons are drawn only where the mode exists                        | `has no full screen and no picture-in-picture button where the browser cannot do it`            |

## Edge cases covered, on top of the 60-minute answer

- The user had paused before the network error: after the recovery the video is at the same second and still not playing.
- The very first load fails with a network error: it is tried again too, and plays if the user had asked to.
- A network error after a recovery gets its three tries again.
- While a source loads again, the element reports time 0. The seek bar keeps the place of the user.
- A decode error is never tried again by the player.
- A paused video, a buffering video and a video at speed 0 are not called stalled.
- After a detected stall, the player goes back to "playing" by itself when the time moves again.
- A play that a pause interrupted is not reported as a blocked autoplay.
- A new `onEvent` function on every render does not load the video again.
- The remembered place is used for the first frame: the wait at that place is not counted as a rebuffer.
- A video watched to the end starts from the beginning next time.
- Stored settings with a wrong type, or text that is not JSON, are ignored field by field.
- Full screen or picture-in-picture is refused by the browser: nothing changes, and no error is thrown.
- Full screen is left with Escape: the button follows the `fullscreenchange` event.
- On an iPhone, where a page cannot put an element in full screen, the video's own full screen is used.
- A tap on the video while the controls are hidden only shows the controls. The next tap pauses.
- A menu with the focus keeps every key, so the arrows choose an option and do not seek.
- A key pressed in the help dialog does not play, seek or mute the video behind it.
- A caption with marks (`<i>`, `<v Name>`) is shown as plain text.
- The browser does not know one Media Session action: the others are still connected.

## Accessibility

Everything in the [60-minute answer](../60-minutes/README.md#accessibility), and:

- The keyboard help follows the WAI-ARIA modal dialog pattern: `role="dialog"`, `aria-modal`, a name from its heading, the focus moves to "Close", Tab stays inside, Escape closes, and the focus goes back to the "?" button.
- New shortcuts: C (captions), F (full screen), ? (help).
- The hidden controls are transparent, not removed. Tab reaches them, and a control with the focus is always visible. Any key press in the player shows them.
- Full screen, picture-in-picture and Captions are toggle buttons with `aria-pressed`.
- The menus are native `<select>` elements, so they work with every keyboard and screen reader as they are.
- "Trying again…" is a `role="status"`: it is read when the user is idle. The final error is a `role="alert"`.
- The volume slider says its value as a percentage, written in the language of `locale`.
- The time preview and the downloaded ranges are decoration and hidden from screen readers: the slider already says the time.
- With `prefers-reduced-motion`, the spinner does not turn and the controls do not fade.

## Known limits, described in the book but not built here

Streaming:

- There is no adapter for a real streaming library, no Media Source Extensions, no manifest and no segment loading. The engine in the demo is a fake.
- `chooseQuality` is used only by the fake engine. A real library has its own rule.
- The player does not check whether the browser plays HLS by itself, and does not choose between that and a library.
- No live streams, no protected content (DRM, Encrypted Media Extensions), no choice of audio track, no casting to a TV.

Failures and monitoring:

- After a detected stall the player only shows buffering and reports it. It does not try to repair it, for example with a small seek or a reload.
- The time spent on retries after a network error is not in the rebuffer numbers.
- With a plain file, a failed first request is reported by the browser as "not supported" and is not tried again by the player.
- No dropped-frame numbers, no average quality, no start failure rate.
- The events are handed to `onEvent`. Sending them (batches, `sendBeacon`, sampling) is the work of the caller.
- The error boundary catches errors while React draws. It does not catch errors in event handlers or timers.

Autoplay and data:

- When autoplay with sound is blocked, the player waits with its Play button. It does not try again muted, and does not ask `navigator.getAutoplayPolicy()`.
- The data-saver check uses `navigator.connection.saveData`, which only some browsers have. It does not cap the quality level.
- A video that is scrolled out of view keeps playing. Only a hidden tab pauses a muted autoplay video.

Captions and controls:

- One captions file, with a button for on and off. No menu of languages, no caption colours or fonts, no cue positions.
- The captions are drawn by the page. So they are not in the picture-in-picture window, and not in the full screen of an iPhone, which shows only the `<video>`.
- The seek bar previews the time, not a picture of that moment. No chapters.
- The playback speed is not remembered. The place in a video is stored on this device only, never expires and is not sent to a server.
- The controls wrap to two rows on a narrow player. They do not fold into one settings menu.
- The shortcuts are fixed. No number keys for 10% steps, no J and L, no frame step.
- On an iPhone a web page cannot set the volume of a video, so the volume slider has no effect there. Mute works.
- No audio description track and no transcript.

Engineering:

- The player reads `navigator` and `localStorage` while it is first drawn, so it is not ready for rendering on a server.
- No build step fails when the size budget is crossed. The size is measured by hand, with the command above.
- All tests use the simulated video element. Nothing here runs against a real media file or on a set of real browsers and phones.

## Try it in the demo

1. Press "Network error now". The player says "Trying again (1 of 3)…", loads the video again and goes on at the same second.
2. Tick "The network is down" and press "Network error now". After about 8 seconds the player gives up and shows "Try again". Untick the box and press it.
3. Press "Freeze the picture for 9 seconds". The video element still says it plays. After 5 seconds the state becomes `buffering`, and a `stall_detected` event is in the list.
4. Stop moving the mouse while the video plays. The controls hide after 3 seconds. Press Tab: they are back.
5. Press `?` for the keyboard help. Escape closes it.
6. Pull "Network speed" down. The quality menu shows the level drop. Pick a level by hand, then "Auto" again.
7. Load the page again in the middle of the video. It goes on where you were, with the same volume and captions.

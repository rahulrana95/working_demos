# Chapter 8: Food ordering and live order status

The user picks dishes on the page of a restaurant, places the order, and then
watches the status of the order change live.

This chapter has three folders. Two are interview answers to the same
question. The third is not an interview answer: it shows what a team adds
after the interview. Each folder is a separate project, so you can run them
side by side and compare the code.

| Folder                     | Level                   | What it is                                                                                                    |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`45-minutes`](45-minutes) | Senior                  | A cart with exact money, an order that is placed once, and a status page that polls and never goes backwards. |
| [`60-minutes`](60-minutes) | Staff                   | The same code, plus a cart that survives a reload and live updates over a stream that falls back to polling.  |
| [`production`](production) | Not an interview answer | The staff answer, plus what you add in the first week before real users see it.                               |

Start with `45-minutes`. Then compare two folders to see only the additions:

```bash
git diff --no-index 45-minutes/src 60-minutes/src
```

```bash
git diff --no-index 60-minutes/src production/src
```

## The three folders in numbers

Lines of code are counted without tests, blank lines and comments. For the
two interview answers they are the files you write in the interview: the files
in `src/ordering` whose first comment says "PART OF THE INTERVIEW: yes". For
`production` they are all 36 files in `src/ordering`. The size is that code
without React, minified and compressed with gzip. Each folder's README has the
command that measures it.

| Folder       | Tests | Lines of code | JavaScript (min + gzip) | Styles (min + gzip) |
| ------------ | ----- | ------------- | ----------------------- | ------------------- |
| `45-minutes` | 90    | 312           | 2,383 bytes             | 936 bytes           |
| `60-minutes` | 119   | 423           | 2,764 bytes             | 936 bytes           |
| `production` | 309   | 1,628         | 8,596 bytes             | 1,530 bytes         |

The two interview answers have hard limits: at most 320 lines for 45 minutes
and at most 430 lines for 60 minutes. That is what a practised engineer can
type in the time. So some things a real page needs are not in the interview
folders. The next table says where each one lives.

## Which feature lives in which folder

| Feature                                                                             | 45  | 60  | production |
| ----------------------------------------------------------------------------------- | --- | --- | ---------- |
| Cart as a pure reducer (`add`, `remove`, `clear`), whole paise, quantity limit      | yes | yes | yes        |
| An unavailable dish cannot be added                                                 | yes | yes | yes        |
| Menu with categories, buttons named after the dish, cart bar with a live total      | yes | yes | yes        |
| One order for two taps: an idempotency key, kept for a retry                        | yes | yes | yes        |
| Status by polling: every 5 s, stops at the end, pauses in a hidden tab, backs off   | yes | yes | yes        |
| An old answer never moves the status backwards (`updatedAt`)                        | yes | yes | yes        |
| Step list with `aria-current="step"`, a polite live region, the arrival time        | yes | yes | yes        |
| Cart saved in `sessionStorage`, one for each restaurant                             |     | yes | yes        |
| Live updates over a stream: reconnect with backoff and jitter, catch-up request     |     | yes | yes        |
| Falls back to polling after three failed reconnects                                 |     | yes | yes        |
| `setQuantity` and a quantity field                                                  |     |     | yes        |
| A price change or a sold-out dish found at checkout, shown and confirmed            |     |     | yes        |
| Courier on a map that moves smoothly, with the distance as text                     |     |     | yes        |
| A menu of 400 dishes: memoised rows, search, category links with scroll spy         |     |     | yes        |
| Every text in a `messages` object, prices by `Intl.NumberFormat`, Hindi in the demo |     |     | yes        |
| A time limit on every request                                                       |     |     | yes        |
| Saved menu, offline hint, "Updated 2 minutes ago"                                   |     |     | yes        |
| The way back from an outside payment page                                           |     |     | yes        |
| The order state machine as data                                                     |     |     | yes        |
| One cart in several tabs                                                            |     |     | yes        |
| A message for a new status, and browser notifications after the user asks           |     |     | yes        |
| Events for monitoring (`onEvent`) with no personal data                             |     |     | yes        |
| Skeletons, and an error boundary around the map                                     |     |     | yes        |

## What the extra 15 minutes buys

| Addition                                    | Why it matters                                                                                                         | Lines     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| The cart in `sessionStorage`                | A reload, or the browser killing the tab on a phone with little memory, does not empty the cart.                       | 43        |
| The stream in `useOrderStatus`              | The page sends 1 request in 10 minutes, not 112, and the user sees a new status at once.                               | 68        |
| Reconnect with random waits, and a fallback | A million clients that lose one server do not come back in the same second. A network that blocks streams still works. | in the 68 |

## Polling or a stream: the measured numbers

`scripts/measure-requests.mjs` keeps the status page of the 60-minute demo
open for 10 minutes, once with polling and once with the stream, and counts
what reached the fake server. It runs a real Chromium with a fake clock, so the
10 minutes take a few seconds. It needs [Playwright](https://playwright.dev)
installed, with its Chromium browser.

In one terminal, build the folder and serve it:

```bash
cd 60-minutes && npm run build && npx vite preview
```

In a second terminal, in this folder:

```bash
node scripts/measure-requests.mjs
```

The script opens `http://localhost:4173`. If the preview prints another
address, pass it: `node scripts/measure-requests.mjs http://localhost:4174`.

This is the output on our machine:

```text
polling: 112 requests in 10 minutes; status at the end: "Order accepted"
stream:  1 connection and 1 request in 10 minutes, 1 event received; status at the end: "Order accepted"
```

What the numbers mean:

- Polling asks every 5 seconds after the last answer. The fake server takes 150 to 600 ms to answer, so one round is about 5.4 seconds, and 10 minutes are 112 rounds.
- The stream opens one connection and sends one request to catch up. After that the server speaks only when something changes. In these 10 minutes the status changed once.
- The order in this run stays 8 minutes in each status, like a real order of 40 minutes.

What they do not mean:

- They are counts, not times and not bytes. They do not show what a connection that stays open costs a phone battery or a server. Measure that on real devices.
- The server is a fake inside the page. A real stream also sends a small "still here" message now and then, which this fake does not.

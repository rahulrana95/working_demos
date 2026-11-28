# Chapter 8: Food ordering and live order status, the 60-minute answer

The user picks dishes on the page of a restaurant, places the order, and then
watches the status of the order change live.

This is the staff answer: the senior answer from
[`../45-minutes`](../45-minutes), plus what 15 more minutes buy. What a team
adds after the interview is in [`../production`](../production). The
[chapter README](../README.md) compares the three.

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

## What the extra 15 minutes add

| Addition                                                       | Why                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| The cart is saved in `sessionStorage`, one for each restaurant | A reload does not empty the cart. A phone with little memory kills background tabs, and the user comes back to an empty cart without this. |
| Live updates over a stream (`subscribeToOrder`)                | Polling sends 112 requests in 10 minutes for a status that changes once. The stream sends 1, and the user sees the change at once.         |
| Reconnect with backoff and random waits                        | When one server dies, all its clients lose the stream in the same second. Random waits spread their return.                                |
| A request to catch up after every connect                      | The stream only sends what changes from now on. One request brings what changed while we were not connected.                               |
| Fall back to polling after three reconnects with no update     | Some networks and proxies block or cut long connections. The page must still show the order there.                                         |

## What is part of the interview

Every source file says on its first lines whether you would write it in the
interview.

| File                                            | In the interview? | Time       | Lines of code | In the 45-minute answer |
| ----------------------------------------------- | ----------------- | ---------- | ------------- | ----------------------- |
| `src/ordering/types.ts`                         | Yes               | 4 minutes  | 44            | 39                      |
| `src/ordering/cart.ts`                          | Yes               | 7 minutes  | 44            | 41                      |
| `src/ordering/cartStorage.ts`                   | Yes               | 3 minutes  | 24            | not there               |
| `src/ordering/usePlaceOrder.ts`                 | Yes               | 8 minutes  | 40            | 40                      |
| `src/ordering/useOrderStatus.ts`                | Yes               | 22 minutes | 129           | 67                      |
| `src/ordering/MenuAndCart.tsx`                  | Yes               | 12 minutes | 102           | 86                      |
| `src/ordering/OrderStatusPage.tsx`              | Yes               | 4 minutes  | 40            | 39                      |
| `src/ordering/RestaurantPage.tsx`, `useMenu.ts` | No                |            |               |                         |
| `*.test.ts`, `*.test.tsx`, `src/testUtils.ts`   | No                |            |               |                         |
| `src/App.tsx`, `src/api/`                       | No                |            |               |                         |
| `src/styles.css`                                | No                |            |               |                         |

Lines of code are counted without blank lines and comments: 423 in total, 111
more than the 45-minute answer (312). The limit for a 60-minute answer is 430.
The folder has 119 tests.

The code is 2,764 bytes when it is minified and compressed with gzip, without
React (45-minute answer: 2,383). Measure it again with:

```bash
npx esbuild src/ordering/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## What is not in this folder

The 430 lines are used up by the saved cart and the stream. A staff candidate
says the rest aloud. All of it is built in [`../production`](../production):

- The courier on a map that moves smoothly, with the distance as text.
- A menu of 400 dishes: memoised rows, search inside the menu, category links that follow the scroll, pictures that load late.
- A price that changed, or a dish that ran out, found when the order is placed.
- Every text in a `messages` object, prices written by `Intl.NumberFormat`, and Hindi.
- `setQuantity` with a field to type a number.
- A time limit on a request. Here a request that never answers stops the polling until the tab is hidden and shown again, or the stream sends an update.

## The contract of `subscribeToOrder`

```ts
type SubscribeToOrder = (
  orderId: string,
  onUpdate: (order: Order) => void,
  onError: () => void,
) => () => void;
```

The page cannot see the connection. It only sees these two callbacks. So your
function must keep three rules:

1. Call `onUpdate` for every update of the order.
2. Call `onError` once when the connection breaks, and do not reconnect by yourself. The hook does that, with its own waits and its own limit. An `EventSource` reconnects by itself, so close it in its `onerror`.
3. Call nothing before the function returns, and nothing after the returned function was called.

```ts
const subscribeToOrder: SubscribeToOrder = (orderId, onUpdate, onError) => {
  const source = new EventSource(`/api/orders/${orderId}/events`);
  source.onmessage = (event) => onUpdate(JSON.parse(event.data));
  source.onerror = () => {
    source.close();
    onError();
  };
  return () => source.close();
};
```

A reconnect counts as failed when the stream breaks again before it sent any
update. After three of those in a row the hook polls, and stays with polling
until the page is opened again. So a stream that connects, stays silent and
breaks three times also ends in polling. That is the safe side.

## How the styles ship

The same as in the 45-minute answer: the rules in `src/styles.css` under the
"Ordering" heading, 936 bytes minified and compressed with gzip. Measure them
again with:

```bash
awk '/^\/\* -+ /{on = /Ordering/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

The rows of the 45-minute answer still hold, and their tests are in this folder
too. These are the new ones.

| Pressure                                             | What protects us                                                     | Test that proves it                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A status that changes five times in 40 minutes       | The stream: one connection, and no request while it works            | `shows the updates of the stream and does not poll while the stream works`                  |
| The stream and a request answer in any order         | Both go through the same `updatedAt` check                           | `ignores the answer of the request when the stream already sent a newer update`             |
| A status changes while we are not connected          | One request after every connect                                      | `opens the stream again after the wait, and sends a request to catch up`                    |
| A million clients lose the same server               | The wait before a reconnect is random between half and the full time | `waits at most 1, 2 and 4 seconds before a reconnect, and at least half of that`            |
| A network that blocks streams                        | After three reconnects with no update, the hook polls                | `falls back to polling after three reconnects that brought no update`                       |
| A stream that breaks now and then, for hours         | An update between two breaks starts the count again                  | `starts the count again when an update arrives between two breaks`                          |
| Tabs left open in the background                     | A hidden tab closes the stream                                       | `closes the stream while the tab is hidden, and opens it and catches up when it is visible` |
| The browser kills the tab, or the user reloads       | The cart is in `sessionStorage`                                      | `saves the cart, and shows it again after a reload`                                         |
| A saved cart is read back by hand-edited or old data | Every saved line is checked                                          | `drops saved lines that are not real cart lines`                                            |

## Edge cases covered, on top of the 45-minute answer

- The saved text is not JSON, or not a list: the cart starts empty.
- The browser refuses to read or write storage: the cart works from memory.
- A saved dish is unavailable now, or not on the menu: it is not counted and not sent.
- The order is placed and the parent removes the page at once: the saved cart is still emptied.
- The order fails: the saved cart is kept.
- Each restaurant has its own saved cart.
- An update or an error from a stream that was already closed is ignored.
- The request to catch up fails while the stream is open: it is tried again with the polling backoff.
- The order is delivered, by the stream or by the request: the stream is closed and never opened again.
- The app gives a stream later, or takes it away: the hook starts again with what it has.

## Accessibility

The same as in the 45-minute answer. The stream changes nothing for a screen
reader: a new status is read once from the same polite live region, and
"Reconnecting…" stays outside it.

## Try it in the demo

1. Add dishes, then reload the page. The cart is still there. The panel shows the saved cart.
2. Place an order. The log shows one `STREAM … opened`, one `GET` to catch up, and then only events.
3. Untick "Use the live stream". The page polls every 5 seconds. Tick it again.
4. Tick "Break the stream". The page says "Reconnecting…", opens the stream three more times, and then polls. The status keeps moving.
5. Tick "Send an old update late". The log shows an old event after each new one. The status on the page never goes backwards.

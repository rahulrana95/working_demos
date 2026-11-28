# Chapter 8: Food ordering and live order status, the 45-minute answer

The user picks dishes on the page of a restaurant, places the order, and then
watches the status of the order change.

This is the senior answer. The staff answer, with 15 more minutes of work, is
in [`../60-minutes`](../60-minutes). What a team adds after the interview is in
[`../production`](../production). The [chapter README](../README.md) compares the three.

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

## What is part of the interview

Every source file says on its first lines whether you would write it in the
interview. `index.html` and `vite.config.ts` say so too. The JSON files do not,
because JSON cannot hold a comment: none of them is part of the interview.

| File                                            | In the interview? | Time       | Lines of code |
| ----------------------------------------------- | ----------------- | ---------- | ------------- |
| `src/ordering/types.ts`                         | Yes               | 3 minutes  | 39            |
| `src/ordering/cart.ts`                          | Yes               | 7 minutes  | 41            |
| `src/ordering/usePlaceOrder.ts`                 | Yes               | 7 minutes  | 40            |
| `src/ordering/useOrderStatus.ts`                | Yes               | 14 minutes | 67            |
| `src/ordering/MenuAndCart.tsx`                  | Yes               | 10 minutes | 86            |
| `src/ordering/OrderStatusPage.tsx`              | Yes               | 4 minutes  | 39            |
| `src/ordering/RestaurantPage.tsx`, `useMenu.ts` | No                |            |               |
| `*.test.ts`, `*.test.tsx`, `src/testUtils.ts`   | No                |            |               |
| `src/App.tsx`, `src/api/`                       | No                |            |               |
| `src/styles.css`                                | No                |            |               |

Lines of code are counted without blank lines and comments: 312 in total. The
limit for a 45-minute answer is 320. The folder has 90 tests.

`RestaurantPage.tsx` and `useMenu.ts` load the menu and show "loading" and
"error". In the interview you say "the menu loads with the usual loading,
error and retry states" and write `MenuAndCart.tsx`, which gets the loaded menu.

The code is 2,383 bytes when it is minified and compressed with gzip, without
React. Measure it again with:

```bash
npx esbuild src/ordering/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## What is not in this folder

To stay inside 320 lines, these are left to the other folders. Say them aloud
in the interview.

- The cart lives in memory. A reload empties it. The 60-minute answer saves it in `sessionStorage`.
- The reducer has `add`, `remove` and `clear`. `setQuantity`, with a field to type a number, is in the production version.
- The status texts are made from the status names ("Order picked up"). Real texts that can be translated are in the production version.
- There is no time limit on a request. A request that never answers stops the polling until the tab is hidden and shown again. The production version counts a request with no answer in 10 seconds as failed.
- `fetchMenu`, `placeOrder` and `fetchOrder` must be the same functions on every render. A new `fetchOrder` starts the polling again.

## How the styles ship

The two pages need CSS to work as described. They need the rules in
`src/styles.css` under the "Ordering" heading, which include
`.visually-hidden`. The other rules style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--color-…`) are CSS variables, so a host app can theme the pages without changing the rules.
- Every button is at least 44px wide and tall, so a finger can hit it.
- The cart bar is `position: sticky` at the bottom. `scroll-padding-block-end` on the page keeps a row that gets the focus above the bar, not under it.

The measured JavaScript size does not include this CSS. The rules are 936 bytes
more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Ordering/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

| Pressure                                             | What protects us                                                | Test that proves it                                              |
| ---------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| The user taps "Place order" twice                    | A second tap while a request is in flight is ignored            | `creates one order when the user taps “Place order” twice`       |
| The network fails after the server created the order | The retry sends the same idempotency key                        | `sends the same idempotency key when the user tries again`       |
| An old answer arrives after a newer one              | An answer with an older `updatedAt` is ignored                  | `ignores an answer that is older than the one on screen`         |
| Thousands of open status pages of finished orders    | Polling stops for ever at "delivered" and "cancelled"           | `stops for ever when the order is %s`                            |
| Tabs left open in the background                     | A hidden tab sends nothing, and asks at once when it is visible | `sends nothing while the tab is hidden`                          |
| The server is failing                                | Each failed poll doubles the wait, up to 60 seconds             | `waits 10, 20, 40, 60 and 60 seconds between failed polls`       |
| Prices like ₹33.35                                   | Money is whole paise, never a fraction                          | `has no rounding error where rupees as fractions would have one` |
| A user taps "+" for ever                             | One function sets every quantity and keeps it at 10 or less     | `never goes above the quantity limit`                            |

## Edge cases covered

- A dish that is unavailable cannot be added. Its "+" button is marked, and the row says "Unavailable".
- The cart changes while the order is on its way to the server: the change is ignored.
- The order fails: the cart is kept, an error is read out, and the next tap sends the same key.
- The cart changes after a failed order: the next tap sends a new key, because it is a new order.
- The first request for the order fails: the page says "Reconnecting…" and keeps trying.
- A request fails while a status is on screen: the status stays, with "Reconnecting…" under it.
- The tab is hidden while a request is in flight: the request is aborted, and its answer is dropped, also when the fetch function ignores the abort.
- An aborted request never shows an error.
- The page is removed while a request is in flight: the request is aborted and no timer is left.
- The restaurant changes: the menu, the cart and the checkout start again, and the menu of the old restaurant is never shown under the new one.
- A cancelled order: the page says so, marks no step, and stops polling.
- The menu fails to load: an error with "Try again". After the tap, the focus moves to the page, not to nowhere.

## Accessibility

- Every cart button has the name of its dish: "Add Paneer Tikka", "Remove one Paneer Tikka".
- A button that cannot be used (remove at 0, add at 10, add for an unavailable dish, "Place order" for an empty cart or while it is busy) is `aria-disabled`, not `disabled` and not removed. So the keyboard focus is never lost. A dashed border marks it, not colour alone.
- The count and total in the cart bar are a polite live region (`role="status"`): a screen reader reads the new total after every change.
- A failed order is read out from an alert.
- The status steps are an ordered list. The current step has `aria-current="step"`, a real border and bold text. A step that is done has a check mark and the hidden text "(done)". In high-contrast mode the border of the current step uses the system highlight colour.
- The status text is a polite live region: a new status is read once. "Reconnecting…" is not in it, because it is not a settled outcome.
- The arrival time is plain text.

## Try it in the demo

1. Add two dishes with Tab and Enter. Remove one. The cart bar shows the count and the total.
2. Press "Place order" twice quickly. The panel shows one `POST /orders` and "Orders the server created: 1".
3. On the status page, tick "Make the server fail". "Reconnecting…" appears and the last status stays. Untick it, and the page recovers.
4. Tick "Send an old update late". The log shows answers marked "(old answer)". The status on the page never goes backwards.
5. Switch to another tab for 20 seconds and come back. The log shows no request while the tab was hidden, and one at the moment you came back.

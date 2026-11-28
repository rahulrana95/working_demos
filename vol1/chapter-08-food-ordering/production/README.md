# Chapter 8: Food ordering and live order status, the production version

The user picks dishes on the page of a restaurant, places the order, pays, and
then watches the status of the order change live.

**This is not an interview answer.** Nobody writes this in 45 or 60 minutes.
It is the staff answer from [`../60-minutes`](../60-minutes), plus what a team
adds in the first week before real users see it. The
[chapter README](../README.md) compares the three folders.

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

## What was added to the 60-minute answer

The first seven rows are things a staff candidate describes in the interview
and has no time to type. The others are the first week of a team.

| Feature                                                                                   | Why                                                                                                                                                                                               | Test that proves it                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a. A menu of 400 dishes: memoised rows (`MenuItemRow`)                                    | One tap on "+" must draw one row again, not 400.                                                                                                                                                  | `draws one row again, not all of them, when one quantity changes`                                                                                                                            |
| b. Search inside the menu (`MenuNavigator`, `filterMenu`)                                 | The menu is already in memory, so search is a filter after a 200 ms pause, with no request. The rows are not drawn again while the user types.                                                    | `filters the dishes only after the user stopped typing`, `does not draw the rows again while the user types in the search box`                                                               |
| c. Category links that follow the scroll (`useActiveSection`)                             | An `IntersectionObserver` marks the category on screen. No code runs while the user scrolls.                                                                                                      | `marks the section that enters the band`                                                                                                                                                     |
| d. Pictures that load late, in boxes of a fixed shape                                     | 400 pictures must not load at once, and the page must not jump when one arrives.                                                                                                                  | `loads a picture only when it comes near the screen, and hides it from screen readers`                                                                                                       |
| e. A price change or a sold-out dish at checkout (`CartChangedError`, `applyCartChanges`) | The menu on screen can be minutes old. The order carries the price the user saw. When the server disagrees, it creates no order, and the user sees what changed and confirms.                     | `shows the new price, the new total, and asks the user to confirm`, `sends the new price with a new key when the user confirms`                                                              |
| f. The courier on a map (`CourierMap`, `useSmoothPosition`)                               | Positions arrive every few seconds. The marker moves between them in `requestAnimationFrame`, and jumps when the user asked for less motion. The distance is text, for everybody.                 | `moves to a new position step by step, and ends exactly on it`, `jumps to the new position when the user asked for less motion`, `says in text how far the courier is`                       |
| g. Texts, language and currency (`messages`, `locale`, `currency`)                        | No English is fixed in the pages. Prices are written by `Intl.NumberFormat`, plurals by `Intl.PluralRules`. The demo has Hindi.                                                                   | `has no fixed English: every text can be replaced`, `writes prices in the locale and currency the app gives, and follows a change`                                                           |
| h. A quantity field, and `setQuantity` in the reducer                                     | Ten naans are one number typed, not ten taps.                                                                                                                                                     | `sets the quantity the user types`, `keeps a typed quantity at the limit`                                                                                                                    |
| i. The cart comes before the dishes in the page                                           | 400 dishes are 1,200 buttons and fields. The cart bar is drawn at the bottom of the screen but sits before them in the page, so Tab reaches it after the category links.                          | `puts the cart before the dishes in the page, so the keyboard reaches it first`                                                                                                              |
| j. A time limit on every request (`withTimeout`)                                          | A request that never answers must not stop the polling, or leave "Placing the order…" on screen for ever. Order status: 10 s. Menu: 10 s. Place order: 15 s, and the retry sends the same key.    | `counts as failed after 10 seconds, and is aborted`, `fails with “timeout” after 15 seconds, aborts the request, and keeps the key`                                                          |
| k. A saved menu (`menuCache`)                                                             | The last menu is shown at once, from memory or `sessionStorage`, while a fresh one loads. Offline, it is all the user has. A failure is never saved.                                              | `shows the saved menu at once, and still asks the server for a fresh one`, `never saves a failure: the next visit asks the server again`                                                     |
| l. An offline hint (`useOnlineHint`, `OfflineBanner`)                                     | The browser's offline flag is only a hint, so it only shows a message. Every request is still sent. When the browser says it is online again, the status page asks at once.                       | `says “offline” as a hint, and sends the request all the same`, `asks at once when the browser says it is back online`                                                                       |
| m. The age of the status ("Updated 2 minutes ago")                                        | While the page cannot reach the server, the last status stays, and the user is told how old it is.                                                                                                | `says how old the status is while it reconnects`                                                                                                                                             |
| n. The way back from the payment page (`pendingOrder`, `OrderingFlow`)                    | The payment page belongs to another company. The browser leaves our app, and comes back with a full page load. The id of the order is saved before the user leaves, and read when the app starts. | `saves the id of the order before it sends the user to the payment page`, `finds the order after the app was loaded again, and shows its status`                                             |
| o. The order state machine as data (`orderMachine`)                                       | A table says which status can follow which. A newer update with a status that cannot follow (delivered, then preparing) is not shown, and is reported.                                            | `refuses a newer update whose status cannot follow, and reports it`                                                                                                                          |
| p. One cart in several tabs (`cartSync`, `useCart`)                                       | `sessionStorage` belongs to one tab, so the tabs talk over a `BroadcastChannel`. A new tab gets the cart of the open tabs.                                                                        | `shows a change of one tab in the other tab`, `does not send a received cart back, so two tabs do not talk for ever`                                                                         |
| q. A message for a new status, and notifications (`useStatusNotifications`)               | In a visible tab: a short message on the page. In a hidden tab: a notification of the browser, only after the user tapped "Tell me when the status changes". The page never asks by itself.       | `shows a short message for a new status in a visible tab, and removes it`, `never asks for the permission by itself`, `shows a notification of the browser for a new status in a hidden tab` |
| r. Events (`onEvent`)                                                                     | The team can measure the time to the menu, orders, failures and how late a status is. An event holds counts, times and status names only.                                                         | `never puts a name, a position, an id or a typed text in an event`                                                                                                                           |
| s. Skeletons, and an error boundary around the map (`Skeleton`, `MapBoundary`)            | The page keeps its shape while it loads. When the map throws, only the map goes away: the status, the steps and the distance stay.                                                                | `shows a skeleton with a text for screen readers while the first menu loads`, `keeps the status, the steps and the distance when the map throws`                                             |

## Lines of code

Counted without blank lines and comments, in `src/ordering`:

| File                        | What it holds                                        | Lines of code |
| --------------------------- | ---------------------------------------------------- | ------------- |
| `types.ts`                  | The contract with the server                         | 53            |
| `events.ts`                 | The events for monitoring                            | 18            |
| `messages.ts`               | Every text the user reads or hears                   | 57            |
| `cart.ts`                   | The cart reducer, totals, the price formatter        | 58            |
| `cartStorage.ts`            | The cart in `sessionStorage`                         | 24            |
| `cartSync.ts`               | The cart between tabs                                | 32            |
| `useCart.ts`                | The cart hook: read, save, sync                      | 36            |
| `cartChanges.ts`            | `CartChangedError`, `applyCartChanges`               | 31            |
| `usePlaceOrder.ts`          | Placing the order once                               | 82            |
| `timeout.ts`                | `withTimeout`, `TimeoutError`                        | 27            |
| `pendingOrder.ts`           | The saved order id for the way back from the payment | 31            |
| `orderMachine.ts`           | The order state machine                              | 24            |
| `useOrderStatus.ts`         | The status hook: stream, polling, fallback           | 193           |
| `useStatusNotifications.ts` | The message for a new status, and notifications      | 47            |
| `useNow.ts`                 | A clock for "Updated 2 minutes ago"                  | 9             |
| `useOnlineHint.ts`          | The browser's online flag                            | 14            |
| `menuCache.ts`              | The saved menu                                       | 37            |
| `useMenu.ts`                | Loading the menu, saved copy first                   | 46            |
| `menuSearch.ts`             | `filterMenu`, `countItems`                           | 16            |
| `useDebouncedValue.ts`      | The pause before a search                            | 9             |
| `useActiveSection.ts`       | Scroll spy                                           | 37            |
| `useLatest.ts`              | The newest value of a prop, in a ref                 | 9             |
| `geo.ts`                    | Distance, a point between two points, lat/lng to x/y | 42            |
| `useSmoothPosition.ts`      | The smooth move of the marker                        | 33            |
| `CourierMap.tsx`            | The map picture                                      | 27            |
| `MapBoundary.tsx`           | The error boundary of the map                        | 19            |
| `Skeleton.tsx`              | The grey boxes while loading                         | 16            |
| `OfflineBanner.tsx`         | The offline hint                                     | 9             |
| `CategoryNav.tsx`           | The category links                                   | 28            |
| `MenuNavigator.tsx`         | Search box and category links                        | 38            |
| `MenuItemRow.tsx`           | One dish with its quantity control                   | 71            |
| `MenuAndCart.tsx`           | The menu, the cart bar, the notice about changes     | 160           |
| `RestaurantPage.tsx`        | The shell of the restaurant page                     | 89            |
| `OrderStatusPage.tsx`       | The status page                                      | 129           |
| `OrderingFlow.tsx`          | Restaurant page, payment, status page                | 46            |
| `index.ts`                  | Shorter imports                                      | 31            |

That is 1,628 lines in total: 1,205 more than the 60-minute answer (423), and
1,316 more than the 45-minute answer (312). The tests grow from 119 to 309.

The code is 8,596 bytes when it is minified and compressed with gzip, without
React (45-minute answer: 2,383, 60-minute answer: 2,764). Measure it again with:

```bash
npx esbuild src/ordering/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## How the styles ship

The pages need CSS to work as described. They need the rules in
`src/styles.css` under the "Ordering" heading, which include
`.visually-hidden`. The other rules style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--color-…`) are CSS variables, so a host app can theme the pages without changing the rules.
- The rules use logical properties (`margin-block`, `padding-inline`, `inset-inline`), so the layout mirrors itself in right-to-left languages. A test fails when a physical `left` or `right` comes back.
- Every input sets `font-size: max(16px, 1em)`, because Safari on iPhone zooms the page when a focused input has text smaller than 16px.
- Every button, link and field is at least 44px tall, so a finger can hit it.
- Each category has `content-visibility: auto`, so the browser skips the layout and paint of categories that are far from the screen.
- The skeleton has an animation, which is switched off for `prefers-reduced-motion: reduce`.

The measured JavaScript size does not include this CSS. The rules are 1,530
bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Ordering/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## How to use the new parts

### The contract of `placeOrder`

```ts
type PlaceOrder = (
  lines: OrderLine[], // { itemId, quantity, unitPrice }
  idempotencyKey: string,
  signal: AbortSignal,
) => Promise<Order>;
```

The page cannot see HTTP status codes. It only sees whether the promise
resolves or rejects. So your function must keep four rules:

1. Send the key to the server. The server creates one order for one key, and answers with that order when it sees the key again.
2. When a `unitPrice` is not the price of the server, or a dish is not available, the server creates no order. Reject with `new CartChangedError(changes)`. The page shows the changes and asks the user to confirm. The next tap sends the new prices with a new key.
3. For every other failure, reject with any other error. The page does not know whether the order exists, so the next tap sends the same key.
4. Stop the network call when the signal is aborted. The page aborts after 15 seconds.

### The way back from the payment

Give `OrderingFlow` a `startPayment` function that sends the browser to the
payment page. The flow saves the id of the order in `localStorage` before it
calls the function. When the app starts again, on any page load, `OrderingFlow`
reads the id and shows the status page. The id is forgotten when the order is
delivered or cancelled, when the user goes back to the menu, or after a day.

### Events

`onEvent` on `OrderingFlow`, `RestaurantPage` and `OrderStatusPage` receives
`menu_viewed`, `item_added`, `checkout_started`, `order_placed`,
`order_failed`, `status_changed`, `stream_fell_back`, `update_rejected` and
`map_failed`. The types are in `src/ordering/events.ts`. The pages only call
the function. Sending the events to a server is the job of the app.

## Edge cases covered, on top of the 60-minute answer

- A newer update with the same status (the courier moved) is accepted. Only a change of status is reported as `status_changed`.
- An update from the stream after "delivered" is refused, also when it is newer.
- The clock of the server is ahead of ours: `delayMs` is 0, never negative.
- An answer for the order that arrives after the 15 seconds is ignored.
- A sold-out dish is taken out of the cart and of the saved cart. When every dish of the cart is sold out, the order cannot be confirmed.
- The user changes the cart after a refusal: the new price is kept.
- The saved menu is replaced by the fresh one. When the fresh one fails, the saved one stays, with a note that a price may have changed.
- The menu of another restaurant is never shown under the new one, not even for one frame.
- A new, empty tab does not empty the cart of the other tabs.
- A message from another tab that is not a cart is dropped, line by line.
- A browser without `BroadcastChannel`, `IntersectionObserver` or `Notification` still works, without that feature.
- A new position arrives while the marker moves: the marker starts from where it is.
- A position that is not on the earth breaks only the map.
- A hidden tab keeps listening only when the user allowed notifications.
- A saved order id that is a day old, broken, or of the wrong shape is ignored.
- The page is changed by the flow: the focus moves to the start of the new page.

## Accessibility

- The quantity control is two buttons and a field, each named after its dish. The buttons stay on the page and are `aria-disabled` when they cannot be used.
- The search box is a labelled `type="search"` input. The number of dishes found is read after the user stops typing, not on every key press.
- The category links are a `nav` with plain links to the categories. The current one has `aria-current="true"` and a real border.
- The cart is a labelled region. The notice about changed prices is an alert. The focus stays on the button, whose text changes to "Confirm and place order".
- The map picture is `aria-hidden`. The distance is plain text and is not a live region, because it changes every few seconds.
- The message for a new status is hidden from screen readers, because the live region of the status already read the same text.
- The skeletons hold a hidden text ("Loading the menu…") in a status region. The grey boxes are `aria-hidden`.
- The permission for notifications is asked only after a tap on a button.

## Known limits, described in the book but not built here

- Notifications work only while the page is open in a tab. There is no service worker and no Web Push, so a closed page gets nothing. Chrome on Android shows no notification at all without a service worker.
- There is no service worker, so offline only helps a page that is already loaded. A reload while offline shows the browser's error page.
- The menu page is not rendered on the server. The first view waits for the JavaScript and then for the menu request.
- The list is not virtual. All 400 rows are in the page, and the browser skips the paint of far categories with `content-visibility`. A menu of several thousand dishes needs a virtual list.
- A keyboard user deep in the menu has no shortcut back to the cart. The cart is early in the page, and the category links jump between categories, but there is no "skip to cart" link and no arrow-key navigation inside a category.
- The map is a plain SVG with two shapes. There are no map tiles, no route, no zoom, and the box of the map is fixed from the first position.
- The cart lives in the browser. It is not saved on the server, so it does not follow the user to another device or another browser. The tabs of one browser share it.
- The idempotency key lives in memory. After a failed order and a reload, the next tap sends a new key, and the server could create a second order. A real app saves the key with the cart.
- The payment is a fake page in the demo. A failed or cancelled payment, and how the provider's redirect behaves in in-app browsers, are not handled.
- The stream has no "resume from event N" (`Last-Event-ID`). It catches up with one request. A stream that stays open but sends nothing is not noticed. After a fallback the page polls until it is opened again.
- The saved menu has no expiry and no version. It lives until the tab is closed.
- `updatedAt` is compared as a number from the server's clock. Two servers with different clocks can order two updates wrongly. A version number that the server counts up is safer.
- The price formatter expects a currency with 100 small units in one large unit.
- Pictures have one size. There is no `srcset`, no placeholder colour from the picture, and the demo has only eight small pictures.
- Search looks at the names of the dishes only. It does not forgive typing errors and does not match Hindi and Latin spellings of one dish.
- Hindi is only in the demo. The names of the dishes come from the server and are not translated.
- Events are handed to `onEvent` and not sent anywhere. Nothing computes rates, such as orders per menu view.
- What a long connection costs a phone battery is not measured.
- The message for a new status cannot be closed by the user. It leaves after 5 seconds.
- No build step fails when the size budget is crossed. The size is measured by hand, with the command above.

## Try it in the demo

1. Type `samosa` in the search box. Scroll, and see the category links follow.
2. Add Paneer Tikka and Samosa, tick "Change a price and sell out a dish on the server", and place the order. The cart says what changed. Confirm.
3. On the status page, wait for "Courier picked up the food". The marker moves smoothly, and the text says how far the courier is.
4. Tick "Break the stream". After three reconnects the page polls. The "Last events" list shows `stream_fell_back`.
5. Go back to the menu, tick "Pay on an outside page", and place an order. The browser leaves for the fake payment page. Pay, and the app loads again and shows the order.
6. Open the page in a second tab and change the cart in one. Both show the same cart.
7. Turn the network off in the developer tools. The page says "You seem to be offline. We keep trying."
8. Read the "Last events" list. It holds counts, times and status names, never a name, an address or a position.

# Chapter 5: Generic form, the 60-minute answer

A form component that draws any form from a schema. The schema is plain data,
so a server can send it and an admin can build it in a form builder.

This is the staff answer. It does what the senior answer in
[`../45-minutes`](../45-minutes) does, and adds what makes the form fast with
hundreds of fields and usable by a team in another country. What a team adds
after the interview is in [`../production`](../production). The
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
Add `?fields=300` to the address to start with the form of 300 fields.

## What is part of the interview

Every source file says on its first lines whether you would write it in the
interview. `index.html` and `vite.config.ts` say so too. The JSON files do not,
because JSON cannot hold a comment: none of them is part of the interview.

| File                       | In the interview? | Time       | Lines of code |
| -------------------------- | ----------------- | ---------- | ------------- |
| `src/form/types.ts`        | Yes               | 4 minutes  | 39            |
| `src/form/validation.ts`   | Yes               | 12 minutes | 90            |
| `src/form/formStore.ts`    | Yes               | 12 minutes | 72            |
| `src/form/Form.tsx`        | Yes               | 13 minutes | 127           |
| `src/form/fields.tsx`      | Yes               | 6 minutes  | 69            |
| `src/form/messages.ts`     | Yes               | 3 minutes  | 19            |
| `src/form/warnOnce.ts`     | Yes               | 1 minute   | 7             |
| `src/form/RenderCount.tsx` | No                |            |               |
| `*.test.ts`, `*.test.tsx`  | No                |            |               |
| `src/App.tsx`, `src/api/`  | No                |            |               |
| `src/demo/`                | No                |            |               |
| `src/styles.css`           | No                |            |               |

Lines of code are counted without blank lines and comments: 423 in total.
The folder has 150 tests.

That is about 51 minutes of typing for someone who has practised it. The rest
of the hour goes to the measurement: why one state object draws 300 fields
for one key press, and what the store changes.

The component code is 3,249 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/form/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## What the extra 15 minutes buys

| Addition                                                | Why it matters                                                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A store outside React (`createFormStore`)               | It takes the place of the `useForm` hook. Each field listens to it and reads only its own value, error and visibility. A key press draws one field again, not all 300. |
| Richer conditions (`all`, `any`, `notEquals`, `in`)     | "Contractor outside India" can be written in the schema, still as plain data.                                                                                          |
| Errors from `onSubmit` (`fieldErrors`, `formError`)     | What the server refuses appears on the right field, and focus moves to the first one.                                                                                  |
| Errors as data (`FieldError`), every text in `messages` | Every text can be translated, and a change of language also changes the errors that are on screen.                                                                     |
| Links in the error summary                              | A keyboard user goes from the list of errors straight to the field.                                                                                                    |

Three things that a staff candidate names but does not type are in
[`../production`](../production): checks on the server while the user types
("is this email taken?"), field types that another team adds, and time limits.

## The props

| Prop       | What it is                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `schema`   | The definition of the form, as plain data.                                                     |
| `onSubmit` | Gets the values of the fields on screen. Reject its promise with `{ fieldErrors, formError }`. |
| `messages` | Other texts, for example a translation. A text that is left out stays in English.              |

Keep the same object for `messages` between renders (create it outside the
component). A new object each time would draw every field again. `onSubmit`
can be new on every render: the form gives the newest one to the store at
each submit.

The contract of `onSubmit`: resolve when the server took the values. Reject
with `{ fieldErrors: { name: text }, formError: text }` to show what the
server said. Reject with anything else and the form shows a default text. The
form cannot see HTTP status codes, because the page makes the request.

## How the store works

`createFormStore(schema)` returns `getState`, `subscribe`, `setValue`,
`touch` and `submit`. The state is one object that is replaced, never
changed, on every update.

A field reads the store with `useSyncExternalStore` and a small function
that picks one thing:

```ts
const value = useStoreValue(store, (state) => state.values[field.name] ?? "");
```

After a key press every field is asked "did your part change?". Only the
fields that answer yes are drawn again. The form component itself reads only
`isSubmitting`, so typing never draws it.

## How the styles ship

The component needs CSS to work as described: the rules in `src/styles.css`
under the "Form" heading. The other rules style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--color-…`) are CSS variables, so a host app can theme the form without changing its rules.
- The rules use logical properties (`inline-start`, `margin-block-end`), never left or right, so the browser mirrors the layout in a right-to-left language.
- Every control sets `font-size: max(16px, 1em)`, because Safari on iPhone zooms the page when a focused control has text smaller than 16px.
- The submit button is at least 44px tall, so a finger can hit it.
- An error is marked with a thicker real border and a bar beside the field, never with a shadow or with colour alone. High-contrast mode keeps both.

The measured JavaScript size does not include this CSS. The form rules are
735 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = !/Demo/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

| Pressure                                | What protects us                                             | Test that proves it                                                            |
| --------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| The form has 300 fields                 | Each field listens to the store and reads only its own state | `draws only the changed field again when the user types in one of 300 fields`  |
| 30 fields depend on one tick box        | Only the fields whose visibility changed are drawn           | `draws again only the fields whose visibility depends on the changed field`    |
| The page around the form is drawn again | `memo` on the field, and a stable `messages` object          | `does not draw the fields again when the page around the form is drawn again`  |
| The page gives a new `onSubmit`         | The form gives the newest one to the store at each submit    | `calls the newest onSubmit after the page gave the form a new one`             |
| The server refuses a field              | The error goes on that field and focus moves there           | `shows a field error on its field and moves focus there`                       |
| The server refuses several fields       | Focus goes to the first, in the order of the form            | `moves focus to the first of several field errors, in the order of the form`   |
| The user changes the language           | Errors are kept as data and worded when they are drawn       | `shows new texts at once when the page changes them, for example the language` |
| The user presses submit twice           | The second press is ignored while the first is in flight     | `ignores a second submit while the first is in flight`                         |

One thing still grows with the number of fields. After every key press the
store calls three small functions for each field, to ask "did your part
change?". They are cheap, but they are not free: the
[chapter README](../README.md#measure-typing-in-a-real-browser) has the
numbers. A store that keeps a list of listeners for each field name would ask
only one field. That is in the known limits of the production version.

## Edge cases covered

Everything in the [45-minute answer](../45-minutes/README.md#edge-cases-covered), and:

- An error of the server stays when focus leaves the field. It goes away when the user changes the value.
- `onSubmit` rejects with an error for a field that is not on screen: the form shows the default text, because the user could not fix that field.
- `onSubmit` rejects with something that is not an object, or with parts of the wrong kind: the default text.
- A second submit sends again, also when the server refused a field the first time and the user changed nothing.
- New `messages` from the page take effect at once, also for the errors and the summary on screen.
- A condition inside `all` or `any` can hold more `all` and `any`.

## Accessibility

Everything in the [45-minute answer](../45-minutes/README.md#accessibility), and:

- Each error in the summary is a link. Enter on it moves focus into the field.
- No English is fixed in the component. Every text comes from `messages`, with English defaults. The demo has a simple Hindi set.

## Try it in the demo

1. Send the filled form with the work email `taken@example.com`, or with "Contractor" and the company name `Acme`. The server puts an error on that field, and focus goes there.
2. Send the empty form, then follow a link in the summary with Tab and Enter.
3. Tick "Messages in Hindi". The errors on screen change language.
4. Tick "Form with 300 fields" and "Show how many times each field was drawn". Type in one field: only its number goes up.

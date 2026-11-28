# Chapter 5: Generic form, the 60-minute answer

A form component that draws any form from a schema. The schema is plain data,
so a server can send it and an admin can build it in a form builder.

This is the staff answer. It does what the senior answer in
[`../45-minutes`](../45-minutes) does, and adds what makes the form fast with
hundreds of fields and reusable by other teams. What a team adds after the
interview is in [`../production`](../production). The
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

| File                          | In the interview? | Time       | Lines of code |
| ----------------------------- | ----------------- | ---------- | ------------- |
| `src/form/types.ts`           | Yes               | 4 minutes  | 47            |
| `src/form/validation.ts`      | Yes               | 12 minutes | 122           |
| `src/form/formStore.ts`       | Yes               | 16 minutes | 216           |
| `src/form/Form.tsx`           | Yes               | 7 minutes  | 136           |
| `src/form/Field.tsx`          | Yes               | 6 minutes  | 102           |
| `src/form/fields.tsx`         | Yes               | 6 minutes  | 92            |
| `src/form/messages.ts`        | Yes               | 2 minutes  | 20            |
| `src/form/warnOnce.ts`        | Yes               | 1 minute   | 8             |
| `src/form/RenderCount.tsx`    | No                |            |               |
| `*.test.ts`, `*.test.tsx`     | No                |            |               |
| `src/App.tsx`, `src/api/`     | No                |            |               |
| `src/demo/`, `src/styles.css` | No                |            |               |

Lines of code are counted without blank lines and comments: 743 in total.
The folder has 168 tests.

Be honest with yourself about this number. Nobody types 743 lines in an
hour. This folder holds all the code, so that you can read and run every
part. In the interview you type the parts that answer "how does it scale?",
and you say the others aloud. The table under
[What the extra 15 minutes buys](#what-the-extra-15-minutes-buys) says which
is which.

The component code is 4,122 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/form/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## What the extra 15 minutes buys

| Addition                                              | Why it matters                                                                                                          | In the interview         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| A store outside React (`createFormStore`)             | A key press draws one field again, not all 300. Each field reads only its own value, error and visibility.              | Type it: about 8 minutes |
| Errors as data (`FieldError`), text from `messages`   | Every text can be translated, and a change of language also changes the errors that are on screen.                      | Type it: about 3 minutes |
| Richer conditions (`all`, `any`, `notEquals`, `in`)   | "Contractor outside India" can be written in the schema, still as plain data.                                           | Type it: about 2 minutes |
| `fieldTypes`                                          | Another team adds a field type, or replaces a built-in one, without a change to the form.                               | Type it: about 2 minutes |
| Checks on the server (`asyncRule`, `asyncValidators`) | "Is this email taken?" is asked 300 ms after the last key press. An old answer never wins. Submit waits for the answer. | Say it, or type the core |
| Errors from `onSubmit` (`fieldErrors`, `formError`)   | What the server refuses appears on the right field, and focus moves there.                                              | Say it                   |
| Links in the error summary                            | A keyboard user goes from the list of errors straight to the field.                                                     | Say it                   |

## The props

| Prop               | What it is                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `schema`           | The definition of the form, as plain data.                                                              |
| `onSubmit`         | Gets the values of the fields on screen. Reject its promise with `{ fieldErrors, formError }`.          |
| `asyncValidators`  | The functions behind the `asyncRule` names in the schema: `(value, signal) => Promise<string \| null>`. |
| `asyncDebounceMs`  | How long the user must stop typing before a server check starts. Default 300.                           |
| `fieldTypes`       | More field types, or other components for the built-in ones.                                            |
| `messages`         | Other texts, for example a translation. A text that is left out stays in English.                       |
| `showRenderCounts` | Debug help: each field shows how many times it was drawn.                                               |

Keep the same object for `fieldTypes` and `messages` between renders (create
them outside the component). A new object each time would draw every field
again. `onSubmit` and `asyncValidators` can be new on every render: the form
reads the newest ones when it needs them.

The contract of `onSubmit`: resolve when the server took the values. Reject
with `{ fieldErrors: { name: text }, formError: text }` to show what the
server said. Reject with anything else and the form shows a default text. The
form cannot see HTTP status codes, because the page makes the request.

The contract of an async validator: resolve with an error text, or with
`null` when the value is fine. If it rejects, the user is not blamed: the
field shows no error, and the server checks again on submit.

## How the styles ship

The component needs CSS to work as described: the rules in `src/styles.css`
under the "Form" heading. The other rules style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--color-…`) are CSS variables, so a host app can theme the form without changing its rules.
- The rules use logical properties (`inline-start`, `margin-block-end`), never left or right, so the browser mirrors the layout in a right-to-left language.
- Every control sets `font-size: max(16px, 1em)`, because Safari on iPhone zooms the page when a focused control has text smaller than 16px.
- The submit button and each radio choice are at least 44px tall, so a finger can hit them.
- An error is marked with a thicker real border and a bar beside the field, never with a shadow or with colour alone. High-contrast mode keeps both.

The measured JavaScript size does not include this CSS. The form rules are
848 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = !/Demo/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

| Pressure                                         | What protects us                                             | Test that proves it                                                             |
| ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| The form has 300 fields                          | Each field listens to the store and reads only its own state | `draws only the changed field again when the user types in one of 300 fields`   |
| 30 fields depend on one tick box                 | Only the fields whose visibility changed are drawn           | `draws again only the fields whose visibility depends on the changed field`     |
| The page around the form is drawn again          | `memo` on the field, and stable `messages` and `fieldTypes`  | `does not draw the fields again when the page around the form is drawn again`   |
| The user types fast in a field the server checks | Debounce: one request after the user pauses                  | `asks the server one time, 300 ms after the last key press`                     |
| An old answer of the server arrives late         | The old check is aborted and its answer is ignored           | `never lets an old answer overwrite a newer one`                                |
| The user submits while a check runs              | Submit waits for the check, then decides                     | `submit waits for a check that is still running, then sends`                    |
| The check itself fails                           | No error on the field. The server checks again on submit     | `does not blame the user when the check itself fails`                           |
| The form is removed while a check runs           | Timers are cleared and requests aborted                      | `cancels the running check when the form is removed`                            |
| The server refuses a field                       | The error goes on that field and focus moves there           | `shows a field error on its field and moves focus there`                        |
| The user changes the language                    | Errors are kept as data and worded when they are drawn       | `shows new texts at once when the page changes them, for example the language`  |
| Another team needs a new kind of field           | `fieldTypes` adds it with no change to the form              | `draws a type that the page added, with label, rules and submit like any field` |

One thing still grows with the number of fields. After every key press the
store calls four small functions for each field, to ask "did your part
change?". They are cheap, but they are not free: the
[chapter README](../README.md#measure-typing-in-a-real-browser) has the
numbers for 300 and for 1,000 fields.

## Edge cases covered

Everything in the [45-minute answer](../45-minutes/README.md#edge-cases-covered), and:

- An error of the server stays when focus leaves the field. It goes away when the user changes the value.
- The server is not asked about an empty value, or about a value that our own rules refuse.
- A second check starts while the first is in flight: the first is aborted, and "Checking…" stays until the newer one answers.
- The schema names a check that the page did not give: one warning in the console, and the field is not blocked.
- `onSubmit` rejects with an error for a field that is not on screen: the form shows the default text, because the user could not fix that field.
- `onSubmit` rejects with something that is not an object: the default text.
- A second submit sends again, also when the server refused a field the first time and the user changed nothing.
- A new `onSubmit` or new `messages` from the page take effect at once.
- A field type that the page did not add shows the "unsupported" box. A type from the page can replace a built-in one.

## Accessibility

Everything in the [45-minute answer](../45-minutes/README.md#accessibility), and:

- Each error in the summary is a link. Enter on it moves focus into the field.
- A field with a server check has a hidden `role="status"` line that reads the outcome. It stays silent while the check runs, so a screen reader does not say "Checking…" after every key press. The visible "Checking…" is hidden from screen readers.
- A field type with several controls, like radio buttons, sets `isGroup`. Then the form does not tie the label to one control, and the component names its group with `aria-labelledby`. The demo adds radio buttons this way (`src/demo/RadioControl.tsx`).
- No English is fixed in the component. Every text comes from `messages`, with English defaults. The demo has a simple Hindi set.

## Try it in the demo

1. Type `taken@example.com` as the work email and wait. "Checking…" appears, then the error of the server.
2. Choose "Contractor", type the company name `Acme` and send the filled form. The server puts an error on that field, and focus goes there.
3. Send the empty form, then tick "Messages in Hindi". The errors on screen change language.
4. Tick "Form with 300 fields" and "Show how many times each field was drawn". Type in one field: only its number goes up.

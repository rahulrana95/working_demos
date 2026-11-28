# Chapter 5: Generic form, the production version

A form component that draws any form from a schema. The schema is plain data,
so a server can send it and an admin can build it in a form builder.

**This is not an interview answer.** It is what a team builds in the first
week after the interview: the failure handling, monitoring and hardening that
the design discussion covers and that no interview has time to type. The
interview answers are in [`../45-minutes`](../45-minutes) and
[`../60-minutes`](../60-minutes). The [chapter README](../README.md) compares the three.

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

Nothing in this folder. Every source file says so on its first lines:
`NOT PART OF THE INTERVIEW: production version.`

| File                          | What it holds                                                                | Lines of code |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------- |
| `src/form/types.ts`           | The schema, the errors, the contract of `onSubmit`, the events               | 85            |
| `src/form/validation.ts`      | Pure functions: conditions, rules, error texts, the values to submit         | 165           |
| `src/form/checkSchema.ts`     | Finds the mistakes in a schema                                               | 129           |
| `src/form/draft.ts`           | Reads and writes the draft in `sessionStorage`, and never throws             | 72            |
| `src/form/formStore.ts`       | The state: values, errors, steps, group items, server checks, submit, events | 562           |
| `src/form/Form.tsx`           | The form, the steps, the buttons, focus, the leave warning                   | 247           |
| `src/form/Field.tsx`          | One field: label, control, help and error                                    | 102           |
| `src/form/GroupField.tsx`     | A group that repeats, with its Add and Remove buttons                        | 84            |
| `src/form/ErrorSummary.tsx`   | The list of errors at the top, with a link to each field                     | 57            |
| `src/form/SchemaProblems.tsx` | The report that takes the place of a broken form in development              | 19            |
| `src/form/fields.tsx`         | The controls and the registry of field types                                 | 116           |
| `src/form/messages.ts`        | Every text of the form, with English defaults                                | 34            |
| `src/form/warnOnce.ts`        | One console message for each schema mistake                                  | 8             |
| `src/form/RenderCount.tsx`    | Debug help: how many times a field was drawn                                 | 16            |
| `src/form/index.ts`           | The exports                                                                  | 39            |

Lines of code are counted without blank lines and comments: 1,735 in total.
The folder has 277 tests.

The component code is 8,634 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/form/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## What the first week adds

| Addition                             | What it does                                                                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkSchema(schema)`                | Finds a field name used twice, a condition on a missing field, a circle of conditions, a select with no options, a broken or too long pattern, and mistakes in steps and groups. |
| Report in development                | In development the form shows the list of problems in place of a broken form. In a production build it still tries to draw the form.                                             |
| Pattern limit (`MAX_PATTERN_LENGTH`) | A pattern longer than 200 characters is never run. An admin writes the patterns, and a bad one can freeze the page.                                                              |
| Steps (`schema.steps`)               | "Next" checks only the current step. A list shows the steps, with `aria-current="step"`. Focus moves to the heading of the new step.                                             |
| Groups that repeat (type `group`)    | The user adds and removes items, between `minItems` and `maxItems`. Buttons say "Remove dependant 2". Focus has a sensible place after a remove.                                 |
| Draft (`saveDraft`)                  | The answers are saved in `sessionStorage` 500 ms after the last change, under the schema id and `version`. Fields marked `sensitive` are never saved.                            |
| Leave warning (`warnBeforeLeave`)    | The browser warns before the page is left with answers that were not sent. The listener is there only while the form is dirty.                                                   |
| Events (`onEvent`)                   | `form_viewed`, `field_error`, `submit_attempted`, `submit_succeeded`, `submit_failed`, with times. No event holds a value of a field.                                            |
| Time limits                          | `onSubmit` gets an `AbortSignal` and is given up after `submitTimeoutMs`. A server check is given up after `asyncTimeoutMs`.                                                     |
| Field types `date` and `radio`       | Built in. Radio buttons are a named `radiogroup`.                                                                                                                                |
| Plural forms (`Intl.PluralRules`)    | The title of the summary is worded by the plural rules of the language.                                                                                                          |
| Enter while a word is being composed | With a Hindi, Japanese or Chinese keyboard, the Enter that takes a word does not send the form.                                                                                  |

## The props

In this order:

| Prop                 | Default           | What it is                                                                             |
| -------------------- | ----------------- | -------------------------------------------------------------------------------------- |
| `schema`             |                   | The definition of the form, as plain data.                                             |
| `onSubmit`           |                   | `(values, signal) => Promise<void> \| void`. Reject with `{ fieldErrors, formError }`. |
| `asyncValidators`    | none              | The functions behind the `asyncRule` names in the schema.                              |
| `asyncDebounceMs`    | 300               | How long the user must stop typing before a server check starts.                       |
| `asyncTimeoutMs`     | 10,000            | A server check that takes longer is given up. The user is not blamed.                  |
| `submitTimeoutMs`    | 30,000            | An `onSubmit` that takes longer is given up, and the user can try again.               |
| `fieldTypes`         | none              | More field types, or other components for the built-in ones.                           |
| `messages`           | English           | Other texts, for example a translation.                                                |
| `saveDraft`          | `false`           | Keeps the answers in `sessionStorage` while the user fills in the form.                |
| `draftDebounceMs`    | 500               | How long after the last change the draft is saved.                                     |
| `warnBeforeLeave`    | `false`           | Asks the browser to warn the user who leaves with answers that were not sent.          |
| `onEvent`            | none              | Tells the monitoring of the page what happens.                                         |
| `showSchemaProblems` | on in development | Shows the mistakes of the schema in place of the form.                                 |
| `showRenderCounts`   | `false`           | Debug help: each field shows how many times it was drawn.                              |

### The contract of `onSubmit`

The form cannot see HTTP status codes, because the page makes the request.
So the page tells the form what happened:

- Resolve when the server took the values. The form then removes the draft and stops the leave warning.
- Reject with `{ fieldErrors: { name: text }, formError: text }` to show what the server said. For a field of a group item the name is `group.index.field`, where the first item has index 0.
- Reject with anything else, and the form shows the default text.
- Pass the `signal` to `fetch`. It is aborted when the time limit is over, and when the form is removed from the page.

A group is sent as a list with one object for each item:
`{ dependants: [{ name: "Meena", relation: "child" }] }`.

After a time-out the user can send again. The server may have taken the first
request all the same. Send an idempotency key with the request, so that the
server can ignore the second one. That is the job of the page, not of the form.

## How the styles ship

The component needs CSS to work as described: the rules in `src/styles.css`
under the "Form", "Steps" and "A group that repeats" headings. The rules
under "Demo panel" style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--color-…`) are CSS variables, so a host app can theme the form without changing its rules.
- The rules use logical properties, never left or right, so the browser mirrors the layout in a right-to-left language.
- Every control sets `font-size: max(16px, 1em)`. Every button and each radio choice is at least 44px tall.
- State is never shown by colour alone. An error has a thicker border and a bar. The current step has a solid border where the others have a dashed one. The "Add" button at its limit has a dashed border.

The measured JavaScript size does not include this CSS. The form rules are
1,143 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = !/Demo/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

Everything in the table of the [60-minute answer](../60-minutes/README.md#why-it-holds-at-scale)
holds here too, with the same tests in `Form.test.tsx`. The rows below are new.
Their tests are in `Form.production.test.tsx`, `checkSchema.test.ts`,
`draft.test.ts` and `validation.test.ts`.

| Pressure                                              | What protects us                                                        | Test that proves it                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| An admin saves a schema with mistakes                 | `checkSchema` reports every problem, not only the first                 | `reports every problem of a schema, not only the first`                                   |
| Two fields each wait for the other                    | The circle of conditions is found                                       | `finds two fields that each wait for the other`                                           |
| An admin pastes a very long pattern                   | It is never run                                                         | `is never run, does not block the user, and is reported one time`                         |
| A developer opens a form with a broken schema         | The report takes the place of the form                                  | `shows every problem in place of the form in development`                                 |
| The same broken schema reaches production             | The form is still drawn                                                 | `still draws the form when the page turns the report off, as a production build does`     |
| A long form is split into steps                       | "Next" checks only the fields of the current step                       | `checks only the fields of the current step on “Next”, and stays there when one is wrong` |
| The server refuses a field of an earlier step         | The form goes back to that step and focuses the field                   | `takes the user back to the step of a field that the server refuses`                      |
| An item in the middle of a group is removed           | Items have ids that never change, so the answers of the others stay     | `keeps the answers of the other items when one is removed, and numbers them again`        |
| The server names a group item by its position         | The position is turned into the id of the item on screen                | `puts an error of the server on the right item, which it names by position`               |
| The tab reloads or crashes                            | The draft brings the answers back                                       | `brings the answers back when the form is opened again, with the items of a group`        |
| The user types fast                                   | The draft is written once, after the user pauses                        | `saves the answers a moment after the last change, not on every key press`                |
| A bank account number is in the form                  | A `sensitive` field never reaches storage                               | `never saves a field that is marked as sensitive, also not inside a group`                |
| The fields change between two releases                | A draft of another `version` is thrown away                             | `throws away a draft that was saved for another version of the schema`                    |
| Storage is full, blocked or holds rubbish             | Every storage call is caught. The form works the same                   | `works the same when the storage throws on every call`                                    |
| The user leaves with unsent answers                   | The browser warns, only while the form is dirty                         | `does not listen while nothing was changed`, `asks for a warning after the first change`  |
| The server never answers a submit                     | The request is given up, its signal aborted, and the user can try again | `gives up an onSubmit that takes too long, aborts its signal and lets the user try again` |
| The answer comes after the time limit                 | It is ignored                                                           | `ignores the answer of an onSubmit that comes after the time limit`                       |
| A server check never answers                          | It is given up, and the field is not blocked                            | `gives up a server check that takes too long, without an error on the field`              |
| The team must see failures without seeing the answers | Events hold names, counts and times only                                | `never puts a value that the user typed, or a text from a server, in an event`            |
| The monitoring code throws                            | The form ignores it                                                     | `keeps working when the onEvent of the page throws`                                       |

## Edge cases covered

Everything in the [60-minute answer](../60-minutes/README.md#edge-cases-covered), and:

- Enter in a field means "Next" on every step but the last. It never sends the form early.
- "Back" does not check anything and keeps the answers.
- A field on a later step is not checked while the user types in it for the first time, also after a failed "Next" on an earlier step.
- A link in the summary to a field on another step shows that step first.
- A field that no step names goes on the last step, so it is never lost. `checkSchema` reports it.
- A group starts with `minItems` items. At `minItems` there is no "Remove" button. At `maxItems` the "Add" button stays reachable, says why it does nothing, and adds nothing.
- After a remove, focus goes to the "Remove" button that took its place, or else the one before it, or else "Add".
- An error of a group item says which item in the summary: "Dependant 2: Name is required."
- A hidden group is not checked and not sent. Its answers are kept.
- A field type inside a group that nobody can draw shows the "unsupported" box and is not sent.
- A change that still waits for the draft timer is saved when the form is removed.
- After a successful submit the draft is removed and is not written back.
- A stored draft with a value of the wrong kind, an unknown key, or more items than `maxItems`: the bad parts are ignored. A `sensitive` field is not read from a draft either.
- A draft with answers that was brought back counts as "dirty", so the leave warning is on at once.
- The form is removed while `onSubmit` is in flight: its signal is aborted, and no error or event follows.
- A check function that throws at once does not crash the form.
- The form is mounted twice by React in development: `form_viewed` is sent one time.
- A field that stays wrong sends one `field_error`, not one for each key press. A field of a group is named without its item: `dependants.name`.

## Accessibility

Everything in the [60-minute answer](../60-minutes/README.md#accessibility), and:

- The steps are an ordered list with a name. The current step has `aria-current="step"`. When the step changes, focus moves to its heading, "Step 2 of 3: The job", so a screen reader says where the user is.
- A group is a `<fieldset>` with a `<legend>`, and each item is one too. A screen reader says "Dependant 2, Name", not only "Name".
- Every "Remove" button names its item. Focus never falls back to the top of the page after a remove.
- "Add" at its limit uses `aria-disabled`, not `disabled`, so it stays in the Tab order and its description says why it does nothing.
- Radio buttons are a `radiogroup` named by the visible label. The arrow keys move between the choices.
- The date field is the date picker of the browser, in the language of the user.

## Try it in the demo

1. Press "Next" on the empty first step. Only the errors of this step are listed.
2. Fill in the three steps. On the last one, add two dependants and remove the first.
3. Wait a moment and press "Show the saved draft". The bank account number is not in it.
4. Press "Load the page again". The browser warns you. Your answers are back, the bank account number is empty.
5. On step 2, choose "Contractor" and type the company name `Acme`. Send the form from step 3: the form goes back to step 2 and puts the error on that field.
6. Look at "Events for monitoring". No event holds a value that you typed.
7. Choose "A schema with mistakes". The report takes the place of the form.

## Known limits, described in the book but not built here

- **No form builder.** This folder draws a schema. It does not make one.
- **The schema is not fetched, cached or versioned here.** The page gets it and gives it to the form. A draft of another version is thrown away, not migrated to the new fields.
- **The server must check everything again.** These rules run in the browser, where a user can turn them off. The same schema and the same pure functions can run on the server.
- **Pattern safety is a length limit only.** A short pattern can still be slow. A real product also runs patterns with a time limit, or with an engine that cannot backtrack, and checks them when the admin saves.
- **No rules across fields.** "The end date is after the start date", a field that is required only when another has a value, and a field whose value is worked out from others are not built.
- **A condition compares a field with a fixed value.** It cannot compare two fields. A field inside a group can depend only on fields outside the group, not on another field of the same item.
- **No groups inside groups.** `checkSchema` reports one.
- **No file upload, rich text, date range, time or time zone fields.** `min` and `max` do not work on dates.
- **Numbers use a point.** "1,5" is not accepted as a number, and numbers are not shown in the format of the locale.
- **The draft lives in one tab.** It is not saved on the server, not shared between devices, and not encrypted. There is no "we brought your answers back" message and no "start again" button. The step the user was on is not saved.
- **No retry.** A failed submit or a failed server check is not sent again by the form. The answer of a server check is not cached.
- **One server check for each field.**
- **Steps have no address.** The Back button of the browser does not go to the step before. A step whose fields are all hidden is still shown.
- **Each key press still asks every field "did your part change?".** That is four small function calls for each field. A store that keeps a list of listeners for each field name would ask only one field. Very long forms would also draw only the fields on screen.
- **Adding or removing an item is not read out by itself.** A screen reader user learns it from where focus goes.
- **Monitoring is basic.** There is no event for a form that was left unfinished, no time for each field, and no sampling.
- **Right-to-left is prepared, not tested.** The styles use logical properties. No test draws the form in Arabic or Hebrew.
- **Labels and help texts are plain text.** They come from the schema in the language of the user. React writes them as text, so a schema cannot put HTML into the page.

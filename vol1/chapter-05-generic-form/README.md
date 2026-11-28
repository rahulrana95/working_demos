# Chapter 5: Generic form

A form component that draws any form from a schema. The schema is plain data:
a server can send it, a database can store it, and an admin can build it in a
form builder without a developer.

This chapter has three folders. Two are interview answers to the same
question. The third is not an interview answer: it shows what a team adds
after the interview. Each folder is a separate project, so you can run them
side by side and compare the code.

| Folder                     | Level                   | What it is                                                                                                             |
| -------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`45-minutes`](45-minutes) | Senior                  | A form from a schema that is correct: rules, fields that depend on others, errors, focus, screen readers.              |
| [`60-minutes`](60-minutes) | Staff                   | The same form, fast with hundreds of fields, and reusable: server checks, server errors, new field types, translation. |
| [`production`](production) | Not an interview answer | The staff answer, plus what you add in the first week before real users see it.                                        |

Start with `45-minutes`. Then compare two folders to see only the additions:

```bash
git diff --no-index 45-minutes/src 60-minutes/src
```

```bash
git diff --no-index 60-minutes/src production/src
```

## The three folders in numbers

Lines of code are the lines in `src/form`, without tests, blank lines and
comments. The size is the component code without React, minified and
compressed with gzip. Each folder's README has the command that measures it.
For the two interview answers the lines are the files you write in the
interview, so without `index.ts` (22 and 32 lines) and without the debug help
`RenderCount.tsx` (16 lines). For `production` they are all fifteen files.

| Folder       | Tests | Lines of code | JavaScript (min + gzip) | Styles (min + gzip) |
| ------------ | ----- | ------------- | ----------------------- | ------------------- |
| `45-minutes` | 101   | 416           | 2,457 bytes             | 712 bytes           |
| `60-minutes` | 168   | 743           | 4,122 bytes             | 848 bytes           |
| `production` | 277   | 1,735         | 8,634 bytes             | 1,143 bytes         |

The JavaScript size does not include the styles. Each folder's README says
which CSS rules the component needs and how they ship.

The 60-minute folder is larger than anyone types in an hour. It holds the
whole staff answer as code that runs, so that you can read every part. Its
README says which parts to type in the interview and which to say aloud.

## The schema in one look

```ts
const schema: FormSchema = {
  id: "employee-onboarding",
  fields: [
    { name: "fullName", label: "Full name", type: "text", required: true },
    {
      name: "country",
      label: "Country",
      type: "select",
      options: [{ value: "IN", label: "India" }],
    },
    {
      name: "pan",
      label: "PAN",
      type: "text",
      visibleWhen: { field: "country", equals: "IN" },
      rules: [{ type: "pattern", value: "^[A-Z]{5}[0-9]{4}[A-Z]$", message: "…" }],
    },
  ],
};
```

Three ideas carry the whole chapter:

- **The schema is data, never code.** A condition is `{ field, equals }`, not a function. So the schema is JSON, and the server can run the same rules.
- **Pure functions decide, components draw.** `isVisible`, `validateField` and `getSubmitValues` know nothing about React and are tested without it.
- **A registry maps a field type to a component.** A new type is one component and one line. A type that nobody knows becomes a box in the page, not a crash.

## What the extra 15 minutes buys

The 45-minute answer is right for one form on one page. The 60-minute answer
holds when the form has 300 fields, when the server has a say, and when
another team wants to use it.

| Addition                                  | Why it matters                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A store outside React (`createFormStore`) | A key press draws one field again, not all of them.                                                        |
| Errors as data, text from `messages`      | Every text can be translated. A change of language also changes the errors on screen.                      |
| Richer conditions                         | `all`, `any`, `notEquals` and `in`, still as plain data.                                                   |
| `fieldTypes`                              | Another team adds or replaces a field type without a change to the form.                                   |
| Checks on the server (`asyncRule`)        | Debounced, cancelled when the user types again, never overwritten by an old answer. Submit waits for them. |
| Errors from `onSubmit`                    | What the server refuses appears on the right field, and focus moves there.                                 |
| Links in the error summary                | From the list of errors straight into the field.                                                           |

## What the first week adds

The `production` folder is what a team builds after the interview. Do not try
to write it in an interview. Know that it exists, and name one or two of
these when the interviewer asks, "What would you do next?"

| Addition                       | Why it matters                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `checkSchema`                  | An admin's mistake is found when the form is built, not when an employee cannot send it. |
| Pattern limit                  | A pattern that an admin pasted cannot freeze the page.                                   |
| Steps                          | A long form in pages. "Next" checks only the current page.                               |
| Groups that repeat             | "Add dependant", "Remove dependant 2", with a sensible place for focus.                  |
| Draft in `sessionStorage`      | A reload does not lose the answers. Sensitive fields are never saved.                    |
| Leave warning                  | The browser warns before unsent answers are lost, only while there are some.             |
| Events (`onEvent`)             | The team can see where users fail. No event holds a value of a field.                    |
| Time limits and `AbortSignal`  | A server that never answers becomes an error the user can retry.                         |
| Field types `date` and `radio` | The two that every HR form needs next.                                                   |

The [production README](production/README.md) names the test that proves each one, and lists what is still not built.

## Measure typing in a real browser

`scripts/measure-typing.mjs` types in a form of 300 fields with a real
Chromium and prints how long the page took to answer the key presses: once on
a normal CPU and once on a CPU made 6 times slower. It needs
[Playwright](https://playwright.dev) installed, with its Chromium browser.

In one terminal, build a folder and serve it:

```bash
cd 45-minutes && npm run build && npx vite preview
```

In a second terminal, in this folder:

```bash
node scripts/measure-typing.mjs
```

The script opens `http://localhost:4173/?fields=300`. If the preview prints
another address, pass it. A second number changes how many fields the form has:

```bash
node scripts/measure-typing.mjs http://localhost:4174 1000
```

It prints one line for each CPU speed. These are the two interview answers on our machine.

`45-minutes`, where all values are in one state object:

```text
300 fields, cpu x1: 100 key presses over 5 runs; script ms p50 2.8 p95 8.9 max 19.2; events >=16ms: 25; duration ms max 24
300 fields, cpu x6: 100 key presses over 5 runs; script ms p50 15.0 p95 45.0 max 129.0; events >=16ms: 199; duration ms max 160
1000 fields, cpu x1: 100 key presses over 5 runs; script ms p50 6.6 p95 22.9 max 40.2; events >=16ms: 122; duration ms max 64
1000 fields, cpu x6: 100 key presses over 5 runs; script ms p50 35.9 p95 93.5 max 136.7; events >=16ms: 200; duration ms max 176
```

`60-minutes`, where each field listens to a store:

```text
300 fields, cpu x1: 100 key presses over 5 runs; script ms p50 0.9 p95 1.5 max 2.1; events >=16ms: 5; duration ms max 16
300 fields, cpu x6: 100 key presses over 5 runs; script ms p50 6.3 p95 11.4 max 13.2; events >=16ms: 199; duration ms max 48
1000 fields, cpu x1: 100 key presses over 5 runs; script ms p50 1.6 p95 2.8 max 3.8; events >=16ms: 13; duration ms max 24
1000 fields, cpu x6: 100 key presses over 5 runs; script ms p50 9.6 p95 16.4 max 20.5; events >=16ms: 200; duration ms max 80
```

What the numbers mean:

- "script ms" is the time our own code and React ran for one key press, for all 100 key presses.
- "duration ms" is the time from the key press to the next paint, as the browser reports it, rounded to 8 ms.
- "events >=16ms" is how many key events the browser reported at all. One key press is two events, so the most is 200.

What they say:

- With 300 plain fields, one state object is not a disaster on a desktop: about 3 ms for a key press. On the slow CPU the worst key presses take longer than 100 ms, and the user can feel that.
- The store keeps the worst key press on the slow CPU under 16 ms of script time, at 300 fields and near it at 1,000.
- The store is not free either. Its time still grows a little with the number of fields, because every field is asked "did your part change?" after every key press.

What they do not mean:

- They are lab numbers from one desktop computer, with a slowed CPU. They are not numbers from real users on real phones. For those, collect INP in the field.
- The fields of the test form are plain text boxes. A form with heavy fields, like a date picker made in JavaScript, costs much more for each field that is drawn again, so the gap between the two answers is wider.
- The Event Timing API only reports events that took 16 ms or longer, so "duration ms max" is of the slow events only.
- Your numbers will differ from ours, and from one run to the next.

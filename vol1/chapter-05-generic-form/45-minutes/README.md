# Chapter 5: Generic form, the 45-minute answer

A form component that draws any form from a schema. The schema is plain data,
so a server can send it and an admin can build it in a form builder.

This is the senior answer. The staff answer, with what makes the form fast
with hundreds of fields and reusable by other teams, is in
[`../60-minutes`](../60-minutes). What a team adds after the interview is in
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
Add `?fields=300` to the address to get a form with 300 text fields. The
[typing measurement](../README.md#measure-typing-in-a-real-browser) uses it.

## What is part of the interview

Every source file says on its first lines whether you would write it in the
interview. `index.html` and `vite.config.ts` say so too. The JSON files do not,
because JSON cannot hold a comment: none of them is part of the interview.

| File                      | In the interview? | Time       | Lines of code |
| ------------------------- | ----------------- | ---------- | ------------- |
| `src/form/types.ts`       | Yes               | 3 minutes  | 35            |
| `src/form/validation.ts`  | Yes               | 10 minutes | 89            |
| `src/form/useForm.ts`     | Yes               | 12 minutes | 92            |
| `src/form/Form.tsx`       | Yes               | 10 minutes | 108           |
| `src/form/fields.tsx`     | Yes               | 6 minutes  | 84            |
| `src/form/warnOnce.ts`    | Yes               | 1 minute   | 8             |
| `*.test.ts`, `*.test.tsx` | No                |            |               |
| `src/App.tsx`, `src/api/` | No                |            |               |
| `src/styles.css`          | No                |            |               |

Lines of code are counted without blank lines and comments: 416 in total.
The folder has 101 tests.

That is more than most people type in 42 minutes. If you run short, write the
text input and the select in `fields.tsx` and say the other two controls
aloud: they are the same five lines with another element. Do not cut
`validation.ts` or `useForm.ts`. They are what the interviewer asks about.

The component code is 2,457 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/form/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## The schema

```ts
const schema: FormSchema = {
  id: "employee-onboarding",
  title: "New employee",
  submitLabel: "Add employee",
  fields: [
    { name: "fullName", label: "Full name", type: "text", required: true, autoComplete: "name" },
    {
      name: "employmentType",
      label: "Employment type",
      type: "select",
      options: [
        { value: "full-time", label: "Full-time" },
        { value: "contractor", label: "Contractor" },
      ],
    },
    {
      name: "companyName",
      label: "Company name",
      type: "text",
      required: true,
      visibleWhen: { field: "employmentType", equals: "contractor" },
    },
  ],
};
```

- Field types: `text`, `email`, `number`, `textarea`, `select`, `checkbox`.
- Rules: `minLength`, `maxLength`, `min`, `max`, `pattern`, `email`. Each can have its own `message`.
- `visibleWhen` is data, never a function, so the schema stays plain JSON.

The component has two props: `schema` and `onSubmit`. `onSubmit` gets the
values of the fields on screen. Return a promise, and reject it when the
server fails: the form then shows an error and keeps the answers.

## When a field is checked

- When focus leaves it. Not while the user types in it for the first time.
- On every change, once the field shows an error or the form was submitted once. So an error goes away as soon as it is fixed.
- On submit, together with every other field on screen. Focus moves to the first field with an error, and a summary lists all errors.

## How the styles ship

The component needs CSS to work as described: the rules in `src/styles.css`
under the "Form" heading. The other rules style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--color-…`) are CSS variables, so a host app can theme the form without changing its rules.
- Every control sets `font-size: max(16px, 1em)`, because Safari on iPhone zooms the page when a focused control has text smaller than 16px.
- An error is marked with a thicker real border and a bar beside the field, never with a shadow or with colour alone. High-contrast mode keeps both.

The measured JavaScript size does not include this CSS. The form rules are
712 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = !/Demo/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

| Pressure                                         | What protects us                                              | Test that proves it                                                            |
| ------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A newer server sends a field type we do not know | A box in place of the field. The other fields still work      | `shows a message in place of the field and still draws the other fields`       |
| An admin writes a broken pattern                 | The rule is skipped and reported once in the console          | `does not crash and does not block the user`                                   |
| A newer server sends a rule type we do not know  | The rule is ignored                                           | `ignores a rule type it does not know`                                         |
| The user presses submit twice                    | The second press is ignored while the first is in flight      | `ignores a second submit while the first is in flight`                         |
| The server fails                                 | An error for the whole form. The answers stay                 | `shows an error for the whole form and keeps the values when the server fails` |
| A required field is hidden by a condition        | A hidden field is not checked and not sent                    | `does not check a hidden required field on submit`                             |
| The form is removed while the server works       | No state is set after the form is gone                        | `does nothing wrong when the form is removed while the server works`           |
| The form has 300 fields                          | One key press draws all fields again, in 2 to 3 ms (measured) | None. See the measurement in the [chapter README](../README.md)                |

The last row is the limit of this answer. All values are in one state object,
so every key press draws every field. The 60-minute answer removes that.

## Edge cases covered

- A field that was filled in and then hidden: its value is not sent. It is kept in memory, so the text is back when the field is shown again.
- A field that appears after a failed submit does not show an error at once.
- A required tick box must be ticked. A required text field with only spaces is empty.
- An empty optional field passes every rule.
- A number field compares as a number: 9 is less than 50. Text that is not a plain number, like `1e5` or `seven`, is an error.
- An empty number field is sent as an empty text, not as 0. A filled one is sent as a number.
- A field type named `constructor` is unknown too, and does not crash the form.
- `onSubmit` that returns nothing works like one that returns a promise.
- The summary keeps the errors of the last submit while the user fixes them, and drops a field that is hidden now.

## Accessibility

- Every control has a `<label>`. A required control has `required` and `aria-required`, and the label shows "(required)" to the eye only.
- A control in error has `aria-invalid`. Its help text and its error text are linked with `aria-describedby`, so a screen reader reads them after the label.
- After a failed submit, focus moves to the first field with an error. A summary at the top of the form, in a `role="alert"` box, lists every error.
- The submit button is never disabled. While the form is sent it has `aria-busy` and the text "Sending…".
- The form has `noValidate`, so the error bubbles of the browser do not fight with our messages.
- A number field is `type="text"` with `inputMode="decimal"`. `type="number"` changes its value when the user scrolls over it, and it accepts the letter "e".
- `autoComplete` from the schema goes on the control, so the browser can fill in a name or an email address.
- The whole form works with the keyboard alone: Tab, Space, the arrow keys in a select, and Enter to send.

## Try it in the demo

1. Press "Add employee" on the empty form. The summary appears and focus is in "Full name".
2. Choose "Contractor". "Company name" appears. Choose "India". "PAN" appears.
3. Type a company name, choose "Full-time" and send. The company name is not in the values. Choose "Contractor" again: the text is back.
4. Tick "Make the server fail" and send. You get an error, and your answers stay.

/*
 * PART OF THE INTERVIEW: yes (about 12 minutes).
 * The state of the form lives here, outside React. It takes the place of the
 * `useForm` hook of the 45-minute answer, and it follows the same rules for
 * when a field is checked: on blur, then on every change once the field shows
 * an error or the form was submitted once, and on submit.
 *
 * Why it holds at scale: in the 45-minute answer the state is in the form
 * component, so one key press draws all 300 fields again. Here each field
 * listens to the store and reads only its own value, error and visibility.
 * After a key press React draws again only the fields whose reading changed.
 */
import type { FieldValue, FormErrors, FormSchema, SubmitHandler } from "./types";
import {
  getInitialValues,
  getSubmitValues,
  readSubmitErrors,
  validateField,
  validateForm,
} from "./validation";

/** The state at the start. The state keeps this shape for the whole life of the form. */
const createState = (schema: FormSchema) => ({
  values: getInitialValues(schema),
  /** One error for each field that was checked and is wrong, from our rules or from the server. */
  errors: {} as FormErrors,
  /** The errors found by the last submit, or null before the first one. They do not change while the user types. */
  summaryErrors: null as FormErrors | null,
  isSubmitting: false,
  /** Set when `onSubmit` failed with an error about the whole form. `message` is the server's text, if any. */
  failure: null as { message?: string } | null,
});

export type FormState = ReturnType<typeof createState>;
export type FormStore = ReturnType<typeof createFormStore>;

export function createFormStore(schema: FormSchema) {
  let state = createState(schema);
  const listeners = new Set<() => void>();

  function setState(change: Partial<FormState>) {
    // A new object each time: `useSyncExternalStore` compares what it read before and after.
    state = { ...state, ...change };
    listeners.forEach((listener) => listener());
  }

  /** Checks one field. Returns the errors with its error set, or with the one it had removed. */
  function checkField(name: string, value: FieldValue): FormErrors {
    const field = schema.fields.find((candidate) => candidate.name === name);
    const error = field === undefined ? null : validateField(field, value);
    const { [name]: _oldError, ...others } = state.errors;
    return error === null ? others : { ...others, [name]: error };
  }

  function setValue(name: string, value: FieldValue) {
    // An error from the server was about the old value, so this check also takes its place.
    const isChecked = state.summaryErrors !== null || state.errors[name] !== undefined;
    setState({
      // A hidden field keeps its value here, so the text is back when the field is shown again.
      values: { ...state.values, [name]: value },
      errors: isChecked ? checkField(name, value) : state.errors,
    });
  }

  /** Called when focus leaves a field. */
  function touch(name: string) {
    // A field that shows an error is already checked on every change. And an
    // error from the server must stay until the value changes.
    if (state.errors[name] === undefined) {
      setState({ errors: checkField(name, state.values[name] ?? "") });
    }
  }

  /**
   * Checks every field on screen and sends the values. On an error it calls
   * `focusField` with the name of the first field that has one. The form
   * gives both functions at each call, so the store always uses the newest.
   */
  async function submit(onSubmit: SubmitHandler, focusField: (name: string) => void) {
    /** Shows the errors and moves focus to the first field that has one. */
    function fail(errors: FormErrors, formError?: string) {
      const firstInvalidField = schema.fields.find((field) => errors[field.name] !== undefined);
      // The user must always see some reason. With no field to point at, it is the form error.
      const failure = firstInvalidField && formError === undefined ? null : { message: formError };
      setState({ errors, summaryErrors: errors, isSubmitting: false, failure });
      if (firstInvalidField !== undefined) focusField(firstInvalidField.name);
    }

    // A second submit while one is in flight is ignored.
    if (state.isSubmitting) return;

    const errors = validateForm(schema, state.values);
    if (Object.keys(errors).length > 0) return fail(errors);
    // Nothing is wrong, so this empties the summary and removes an old answer of `onSubmit`.
    setState({ errors, summaryErrors: errors, isSubmitting: true, failure: null });

    try {
      await onSubmit(getSubmitValues(schema, state.values));
      setState({ isSubmitting: false });
    } catch (reason) {
      const fromServer = readSubmitErrors(schema, state.values, reason);
      fail(fromServer.errors, fromServer.formError);
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    setValue,
    touch,
    submit,
  };
}

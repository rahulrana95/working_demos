/*
 * PART OF THE INTERVIEW: yes (about 16 minutes).
 * The state of the form lives here, outside React. This is what makes a form
 * with 300 fields fast. Type the state, `setState`, `subscribe`, `setValue`,
 * `touch` and `submit` first. They are the answer to "how does it scale?".
 * Then add the checks on the server and the errors from `onSubmit` if there
 * is time, or say aloud how they work.
 *
 * Why it holds at scale: in the 45-minute answer the state is in the form
 * component, so one key press draws all 300 fields again. Here each field
 * listens to the store and reads only its own value, error and visibility.
 * After a key press React draws again only the fields whose reading changed.
 *
 * The store also runs the checks on the server, because they need timers and
 * must be cancelled: that is easier here than in an effect.
 */
import type {
  AsyncValidator,
  FieldError,
  FieldSchema,
  FieldValue,
  FormErrors,
  FormSchema,
  FormValues,
  SubmitErrors,
  SubmitHandler,
} from "./types";
import { getInitialValues, getSubmitValues, isVisible, validateField } from "./validation";
import { warnOnce } from "./warnOnce";

export interface FormState {
  values: FormValues;
  /** One error for each field that was checked and is wrong, from our rules or from a server. */
  errors: FormErrors;
  /** The fields that the user has left, or that were on screen at a submit. */
  touched: Record<string, boolean>;
  /** The fields with a server check that has not answered yet. */
  checking: Record<string, boolean>;
  /** The errors found by the last submit. They do not change while the user types. */
  summaryErrors: FormErrors;
  hasSubmitted: boolean;
  isSubmitting: boolean;
  /** Set when `onSubmit` failed with an error about the whole form. `message` is the server's text, if any. */
  submitError: { message?: string } | null;
}

/** What the form component gives the store. It is read at the moment it is needed. */
export interface FormStoreOptions {
  onSubmit: SubmitHandler;
  asyncValidators: Record<string, AsyncValidator>;
  debounceMs: number;
  /** Moves focus to the control of one field. The store itself does not know the page. */
  focusField: (name: string) => void;
}

/** One server check that waits for its timer or for its answer. */
interface PendingCheck {
  controller: AbortController;
  /** Settles when the check has answered or was cancelled. Submit waits for it. */
  done: Promise<void>;
}

export type FormStore = ReturnType<typeof createFormStore>;

/** A copy of the record with one entry set, or removed when the value is null. */
function withEntry<T>(record: Record<string, T>, name: string, value: T | null): Record<string, T> {
  const { [name]: _old, ...others } = record;
  return value === null ? others : { ...others, [name]: value };
}

export function createFormStore(schema: FormSchema, getOptions: () => FormStoreOptions) {
  let state: FormState = {
    values: getInitialValues(schema),
    errors: {},
    touched: {},
    checking: {},
    summaryErrors: {},
    hasSubmitted: false,
    isSubmitting: false,
    submitError: null,
  };
  // False after the form is removed from the page. Then we must not move focus or submit.
  let isConnected = true;
  const listeners = new Set<() => void>();
  const pendingChecks = new Map<string, PendingCheck>();
  const fieldsByName = new Map(schema.fields.map((field) => [field.name, field]));

  function setState(change: Partial<FormState>) {
    state = { ...state, ...change };
    listeners.forEach((listener) => listener());
  }

  function getVisibleFields(): FieldSchema[] {
    return schema.fields.filter((field) => isVisible(field, state.values));
  }

  function cancelCheck(name: string) {
    // The abort stops the timer, and an answer that still arrives is ignored.
    pendingChecks.get(name)?.controller.abort();
    pendingChecks.delete(name);
  }

  /** Asks the server about a value, after the user has stopped typing for a moment. */
  function scheduleCheck(field: FieldSchema, value: FieldValue) {
    const { asyncValidators, debounceMs } = getOptions();
    if (field.asyncRule === undefined) {
      return;
    }

    const validate = asyncValidators[field.asyncRule.name];
    if (validate === undefined) {
      warnOnce(`Form schema error: no async validator with the name "${field.asyncRule.name}".`);
      return;
    }
    // Do not ask the server about a value that our own rules already refuse.
    if (value === "" || validateField(field, value) !== null) {
      return;
    }

    const controller = new AbortController();
    const done = new Promise<void>((resolve) => {
      const timerId = setTimeout(async () => {
        let message: string | null = null;
        try {
          message = await validate(value, controller.signal);
        } catch {
          // The check itself failed. We do not blame the user. The server checks again on submit.
        }

        // When the user typed again, this answer is about an old value: drop it.
        if (!controller.signal.aborted) {
          pendingChecks.delete(field.name);
          setState({
            checking: withEntry(state.checking, field.name, null),
            errors:
              message === null
                ? state.errors
                : { ...state.errors, [field.name]: { type: "async", message } },
          });
        }
        resolve();
      }, debounceMs);

      controller.signal.addEventListener("abort", () => {
        clearTimeout(timerId);
        resolve();
      });
    });

    pendingChecks.set(field.name, { controller, done });
    setState({ checking: { ...state.checking, [field.name]: true } });
  }

  function setValue(name: string, value: FieldValue) {
    cancelCheck(name);

    const field = fieldsByName.get(name);
    // A field is checked on every change once it shows an error, or after the
    // first submit. An answer from a server was about the old value, so this
    // check also takes its place.
    const isChecked = state.hasSubmitted || state.errors[name] !== undefined;

    setState({
      // A hidden field keeps its value here, so the text is back when the field is shown again.
      values: { ...state.values, [name]: value },
      errors:
        field !== undefined && isChecked
          ? withEntry(state.errors, name, validateField(field, value))
          : state.errors,
      checking: withEntry(state.checking, name, null),
    });

    if (field !== undefined) {
      scheduleCheck(field, value);
    }
  }

  /** Called when focus leaves a field. */
  function touch(name: string) {
    const field = fieldsByName.get(name);
    // A field that shows an error is already checked on every change. And an
    // error from a server must stay until the value changes.
    const error =
      field === undefined || state.errors[name] !== undefined
        ? (state.errors[name] ?? null)
        : validateField(field, state.values[name] ?? "");

    setState({
      touched: { ...state.touched, [name]: true },
      errors: withEntry(state.errors, name, error),
    });
  }

  /** Every error of the fields on screen: our own rules, and what a server check said. */
  function collectErrors(): FormErrors {
    const errors: FormErrors = {};

    for (const field of getVisibleFields()) {
      const current = state.errors[field.name];
      // An error that `onSubmit` sent back is not kept: the user may try again.
      const error: FieldError | null =
        current?.type === "async" ? current : validateField(field, state.values[field.name] ?? "");
      if (error !== null) {
        errors[field.name] = error;
      }
    }

    return errors;
  }

  function fail(errors: FormErrors, submitError: FormState["submitError"]) {
    setState({ errors, summaryErrors: errors, submitError, isSubmitting: false });

    const firstInvalidField = schema.fields.find((field) => errors[field.name] !== undefined);
    if (firstInvalidField !== undefined) {
      getOptions().focusField(firstInvalidField.name);
    }
  }

  /** Reads what `onSubmit` rejected with. It can be anything, so we check every part. */
  function failWithServerErrors(reason: unknown) {
    const { fieldErrors, formError }: SubmitErrors =
      typeof reason === "object" && reason !== null ? reason : {};
    const visibleNames = new Set(getVisibleFields().map((field) => field.name));
    const errors: FormErrors = {};

    for (const [name, message] of Object.entries(fieldErrors ?? {})) {
      // An error for a field that is not on screen could not be shown or fixed.
      if (typeof message === "string" && visibleNames.has(name)) {
        errors[name] = { type: "server", message };
      }
    }

    const hasFormError = typeof formError === "string";
    // The user must always see some reason. With nothing from the server, the form has a default text.
    const showsFormError = hasFormError || Object.keys(errors).length === 0;
    fail(errors, showsFormError ? { message: hasFormError ? formError : undefined } : null);
  }

  async function submit() {
    // A second submit while one is in flight is ignored.
    if (state.isSubmitting) {
      return;
    }

    setState({
      touched: Object.fromEntries(getVisibleFields().map((field) => [field.name, true])),
      hasSubmitted: true,
      isSubmitting: true,
      submitError: null,
    });

    // Wait for the server checks that are still running. The user may type
    // while we wait, which starts a new check, so we look again after each wait.
    while (pendingChecks.size > 0 && Object.keys(collectErrors()).length === 0) {
      await Promise.all([...pendingChecks.values()].map((check) => check.done));
    }
    if (!isConnected) {
      return;
    }

    const errors = collectErrors();
    if (Object.keys(errors).length > 0) {
      fail(errors, null);
      return;
    }

    // Nothing is wrong, so this empties the summary and removes an old answer of `onSubmit`.
    setState({ errors, summaryErrors: errors });

    try {
      await getOptions().onSubmit(getSubmitValues(schema, state.values));
      setState({ isSubmitting: false });
    } catch (reason) {
      if (isConnected) {
        failWithServerErrors(reason);
      }
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setValue,
    touch,
    submit,
    /** Called when the form is put on the page. */
    connect() {
      isConnected = true;
    },
    /** Called when the form is removed from the page. Stops every timer and request. */
    disconnect() {
      isConnected = false;
      [...pendingChecks.keys()].forEach(cancelCheck);
    },
  };
}

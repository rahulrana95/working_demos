/*
 * PART OF THE INTERVIEW: yes (about 13 minutes).
 * The form creates the store, loops over the schema, and draws the error
 * summary and the submit button. The field and the summary are the ones of
 * the 45-minute answer. The new parts are `useStoreValue`, `memo` and the
 * links in the summary.
 *
 * Why it holds at scale: the form does not listen to the values. Each field
 * listens to the store by itself and reads only what it shows. So a key
 * press in one field draws that field again, and no other.
 *
 * The form keeps its own state. To start again with empty values, or to show
 * another schema, give the form a new `key`.
 */
import { memo, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import type { FormEvent, MouseEvent } from "react";
import { getControl } from "./fields";
import { createFormStore } from "./formStore";
import type { FormState, FormStore } from "./formStore";
import { DEFAULT_MESSAGES } from "./messages";
import type { FormMessages } from "./messages";
import { RenderCount } from "./RenderCount";
import type { FieldSchema, FormSchema, SubmitHandler } from "./types";
import { getErrorText, isVisible } from "./validation";
import { warnOnce } from "./warnOnce";

export interface FormProps {
  /** The definition of the form. It is plain data and can come from a server. */
  schema: FormSchema;
  /**
   * Gets the values of the fields on screen. Reject the promise with
   * `{ fieldErrors, formError }` to show what the server said.
   */
  onSubmit: SubmitHandler;
  /** Other texts, for example a translation. A text that is left out stays in English. Keep the same object between renders. */
  messages?: Partial<FormMessages>;
}

/** What every part of the form gets. `formId` starts every id, so two forms on a page do not clash. */
type PartProps = { store: FormStore; messages: FormMessages; formId: string };

/**
 * Reads one thing from the store. The component is drawn again only when
 * that thing changes. The selector must return a text, a number, a boolean or
 * an object that is kept in the state, because React compares with `Object.is`.
 */
function useStoreValue<T>(store: FormStore, select: (state: FormState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}

export function Form({ schema, onSubmit, messages: customMessages }: FormProps) {
  const formId = useId();
  // This object is a prop of every field. useMemo keeps it the same between
  // renders, so `memo` on the field can skip the fields.
  const messages = useMemo(() => ({ ...DEFAULT_MESSAGES, ...customMessages }), [customMessages]);

  // useState with a function creates the store once, on the first render.
  const [store] = useState(() => {
    // A field we cannot draw cannot be filled in, so it must not be checked or sent.
    const knownFields = schema.fields.filter((field) => getControl(field.type) !== undefined);
    return createFormStore({ ...schema, fields: knownFields });
  });
  // This changes only around a submit, so it does not draw the form again on a key press.
  const isSubmitting = useStoreValue(store, (state) => state.isSubmitting);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Without this the browser loads the page again.
    event.preventDefault();
    void store.submit(onSubmit, (name) => document.getElementById(`${formId}-${name}`)?.focus());
  }

  return (
    // `noValidate` turns off the error bubbles of the browser. They would fight with our messages.
    <form className="form" noValidate aria-label={schema.title} onSubmit={handleSubmit}>
      {schema.title !== undefined && <h2 className="form__title">{schema.title}</h2>}
      <ErrorSummary schema={schema} store={store} messages={messages} formId={formId} />
      {schema.fields.map((field) => (
        <Field key={field.name} field={field} store={store} messages={messages} formId={formId} />
      ))}
      {/*
        The button is never disabled. A disabled button cannot tell the user
        what is wrong. A second press while we send is ignored in the store.
      */}
      <button className="form__submit" type="submit" aria-busy={isSubmitting}>
        {isSubmitting ? messages.submitting : (schema.submitLabel ?? messages.submit)}
      </button>
    </form>
  );
}

function ErrorSummary({ schema, store, messages, formId }: PartProps & { schema: FormSchema }) {
  const summaryErrors = useStoreValue(store, (state) => state.summaryErrors) ?? {};
  const values = useStoreValue(store, (state) => state.values);
  const failure = useStoreValue(store, (state) => state.failure);
  // A field that is hidden now leaves the summary, or its link would lead nowhere.
  const invalidFields = schema.fields.filter(
    (field) => summaryErrors[field.name] !== undefined && isVisible(field, values),
  );

  function followLink(event: MouseEvent, id: string) {
    // The link alone would only scroll. A keyboard user needs the focus in the field.
    event.preventDefault();
    document.getElementById(id)?.focus();
  }

  return (
    // This box is always in the page, also when it is empty. A screen reader
    // reads new text inside an alert that it already knows.
    <div className="form__alert" role="alert">
      {invalidFields.length > 0 && (
        <>
          <p className="form__alert-title">{messages.summaryTitle(invalidFields.length)}</p>
          <ul>
            {invalidFields.map((field) => (
              <li key={field.name}>
                <a
                  href={`#${formId}-${field.name}`}
                  onClick={(event) => followLink(event, `${formId}-${field.name}`)}
                >
                  {/* The filter above kept only fields with an error, so the "!" is safe. */}
                  {getErrorText(field, summaryErrors[field.name]!, messages)}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {failure && <p className="form__alert-title">{failure.message ?? messages.submitFailed}</p>}
    </div>
  );
}

function FieldInner({ field, store, messages, formId }: PartProps & { field: FieldSchema }) {
  const isShown = useStoreValue(store, (state) => isVisible(field, state.values));
  const value = useStoreValue(store, (state) => state.values[field.name] ?? "");
  const fieldError = useStoreValue(store, (state) => state.errors[field.name]);

  const Control = getControl(field.type);
  useEffect(() => {
    if (Control === undefined) {
      warnOnce(`Form schema error: no component for the field type "${field.type}".`);
    }
  }, [Control, field.type]);

  if (!isShown) return null;
  // A box in place of a field whose type we do not know. The other fields still work.
  if (Control === undefined) {
    return <p className="field field__unsupported">{messages.unsupportedField(field.type)}</p>;
  }

  const id = `${formId}-${field.name}`;
  const descriptionId = `${id}-description`;
  // The text is chosen here, so the error changes language together with `messages`.
  const error = fieldError && getErrorText(field, fieldError, messages);

  return (
    <div className={`field field--${field.type}${error ? " is-invalid" : ""}`}>
      <label className="field__label" htmlFor={id}>
        {field.label}
        {/* A screen reader already says "required", because of the attribute on the control. */}
        {field.required && <span aria-hidden="true"> {messages.requiredMark}</span>}
      </label>
      <Control
        field={field}
        value={value}
        onChange={(newValue) => store.setValue(field.name, newValue)}
        shared={{
          id,
          name: field.name,
          required: field.required,
          // Said again for screen readers, because the form has `noValidate`.
          "aria-required": field.required,
          autoComplete: field.autoComplete,
          "aria-invalid": error ? true : undefined,
          // A screen reader reads the help and the error after the label.
          "aria-describedby": field.helpText || error ? descriptionId : undefined,
          onBlur: () => store.touch(field.name),
        }}
        messages={messages}
      />
      <div id={descriptionId}>
        {field.helpText && <p className="field__help">{field.helpText}</p>}
        {error && <p className="field__error">{error}</p>}
      </div>
      {/* Debug help. It draws nothing until the demo page or a test turns it on. */}
      <RenderCount />
    </div>
  );
}

/**
 * `memo` stops a field from being drawn again when the form is drawn again
 * for a reason that does not change this field. Without it, a new `onSubmit`
 * from the page would draw all 300 fields.
 */
const Field = memo(FieldInner);

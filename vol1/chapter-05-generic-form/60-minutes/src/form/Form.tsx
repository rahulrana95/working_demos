/*
 * PART OF THE INTERVIEW: yes (about 7 minutes).
 * The form creates the store, loops over the schema, and draws the parts that
 * belong to the whole form: the error summary and the submit button.
 *
 * The form itself does not listen to the values. Only the small parts below
 * do, so a key press never draws the whole form again.
 *
 * The form keeps its own state. To start again with empty values, or to show
 * another schema, give the form a new `key`.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { Field, useStoreValue } from "./Field";
import { BUILT_IN_FIELD_TYPES, getFieldType } from "./fields";
import type { FieldTypeDefinition } from "./fields";
import { createFormStore } from "./formStore";
import type { FormStore, FormStoreOptions } from "./formStore";
import { DEFAULT_MESSAGES } from "./messages";
import type { FormMessages } from "./messages";
import type { AsyncValidator, FormSchema, SubmitHandler } from "./types";
import { getErrorText, isVisible } from "./validation";

export interface FormProps {
  /** The definition of the form. It is plain data and can come from a server. */
  schema: FormSchema;
  /**
   * Gets the values of the fields on screen. Reject the promise with
   * `{ fieldErrors, formError }` to show what the server said.
   */
  onSubmit: SubmitHandler;
  /** The functions behind the `asyncRule` names in the schema. */
  asyncValidators?: Record<string, AsyncValidator>;
  /** How long the user must stop typing before a server check starts. */
  asyncDebounceMs?: number;
  /** More field types, or other components for the built-in ones. Keep the same object between renders. */
  fieldTypes?: Record<string, FieldTypeDefinition>;
  /** Other texts, for example a translation. A text that is left out stays in English. Keep the same object between renders. */
  messages?: Partial<FormMessages>;
  /** Debug help: each field shows how many times it was drawn. */
  showRenderCounts?: boolean;
}

const NO_VALIDATORS: Record<string, AsyncValidator> = {};

export function Form({
  schema,
  onSubmit,
  asyncValidators = NO_VALIDATORS,
  asyncDebounceMs = 300,
  fieldTypes,
  messages: customMessages,
  showRenderCounts = false,
}: FormProps) {
  const formId = useId();

  // These two objects are props of every field. useMemo keeps them the same
  // between renders, so `memo` on the field can skip the fields.
  const messages = useMemo(() => ({ ...DEFAULT_MESSAGES, ...customMessages }), [customMessages]);
  const allFieldTypes = useMemo(() => ({ ...BUILT_IN_FIELD_TYPES, ...fieldTypes }), [fieldTypes]);

  // The store lives as long as the form, but it must always call the newest
  // `onSubmit` and read the newest messages. So it reads them from a ref,
  // and an effect puts the newest ones in the ref after every render.
  const options: FormStoreOptions = {
    onSubmit,
    asyncValidators,
    debounceMs: asyncDebounceMs,
    focusField: (name) => document.getElementById(`${formId}-${name}`)?.focus(),
  };
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // useState with a function creates the store once, on the first render.
  const [store] = useState(() => {
    // A field we cannot draw cannot be filled in, so it must not be checked or sent.
    const knownFields = schema.fields.filter(
      (field) => getFieldType(allFieldTypes, field.type) !== undefined,
    );
    return createFormStore({ ...schema, fields: knownFields }, () => optionsRef.current);
  });

  useEffect(() => {
    store.connect();
    return () => store.disconnect();
  }, [store]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Without this the browser loads the page again.
    event.preventDefault();
    void store.submit();
  }

  return (
    <form
      className="form"
      // The browser has its own error bubbles. They would fight with our messages.
      noValidate
      aria-label={schema.title}
      onSubmit={handleSubmit}
    >
      {schema.title !== undefined && <h2 className="form__title">{schema.title}</h2>}

      <ErrorSummary schema={schema} store={store} messages={messages} formId={formId} />

      {schema.fields.map((field) => (
        <Field
          key={field.name}
          field={field}
          definition={getFieldType(allFieldTypes, field.type)}
          store={store}
          messages={messages}
          formId={formId}
          showRenderCount={showRenderCounts}
        />
      ))}

      <SubmitButton store={store} label={schema.submitLabel} messages={messages} />
    </form>
  );
}

interface ErrorSummaryProps {
  schema: FormSchema;
  store: FormStore;
  messages: FormMessages;
  formId: string;
}

function ErrorSummary({ schema, store, messages, formId }: ErrorSummaryProps) {
  const summaryErrors = useStoreValue(store, (state) => state.summaryErrors);
  const submitError = useStoreValue(store, (state) => state.submitError);
  const values = useStoreValue(store, (state) => state.values);
  // A field that is hidden now leaves the summary, or its link would lead nowhere.
  const invalidFields = schema.fields.filter(
    (field) => summaryErrors[field.name] !== undefined && isVisible(field, values),
  );

  function focusField(event: MouseEvent<HTMLAnchorElement>, name: string) {
    // The link alone would only scroll. A keyboard user needs the focus in the field.
    event.preventDefault();
    document.getElementById(`${formId}-${name}`)?.focus();
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
                  onClick={(event) => focusField(event, field.name)}
                >
                  {/* The filter above kept only fields with an error, so the "!" is safe. */}
                  {getErrorText(field, summaryErrors[field.name]!, messages)}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {submitError !== null && (
        <p className="form__alert-title">{submitError.message ?? messages.submitFailed}</p>
      )}
    </div>
  );
}

interface SubmitButtonProps {
  store: FormStore;
  label: string | undefined;
  messages: FormMessages;
}

function SubmitButton({ store, label, messages }: SubmitButtonProps) {
  const isSubmitting = useStoreValue(store, (state) => state.isSubmitting);

  return (
    // The button is never disabled. A disabled button cannot tell the user
    // what is wrong. A second press while we send is ignored in the store.
    <button className="form__submit" type="submit" aria-busy={isSubmitting}>
      {isSubmitting ? messages.submitting : (label ?? messages.submit)}
    </button>
  );
}

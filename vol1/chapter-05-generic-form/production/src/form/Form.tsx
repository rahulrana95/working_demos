/*
 * NOT PART OF THE INTERVIEW: production version.
 * The form checks the schema, creates the store, and draws the parts that
 * belong to the whole form: the steps, the error summary and the buttons.
 *
 * The form itself does not listen to the values. Only the small parts below
 * do, so a key press never draws the whole form again.
 *
 * The form keeps its own state. To start again with empty values, or to show
 * another schema, give the form a new `key`.
 */
/// <reference types="vite/client" />
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { checkSchema } from "./checkSchema";
import { ErrorSummary } from "./ErrorSummary";
import { Field, useStoreValue } from "./Field";
import { BUILT_IN_FIELD_TYPES, getFieldType } from "./fields";
import type { FieldTypeDefinition } from "./fields";
import { createFormStore, getSteps, STEP_HEADING_TARGET } from "./formStore";
import type { FormStore, FormStoreOptions } from "./formStore";
import { GroupField } from "./GroupField";
import { DEFAULT_MESSAGES } from "./messages";
import type { FormMessages } from "./messages";
import { SchemaProblems } from "./SchemaProblems";
import type {
  AsyncValidator,
  FieldSchema,
  FormMonitorEvent,
  FormSchema,
  SubmitHandler,
} from "./types";
import { warnOnce } from "./warnOnce";

export interface FormProps {
  /** The definition of the form. It is plain data and can come from a server. */
  schema: FormSchema;
  /**
   * Gets the values of the fields on screen, and a signal that is aborted when
   * the form stops waiting. Reject the promise with `{ fieldErrors, formError }`
   * to show what the server said.
   */
  onSubmit: SubmitHandler;
  /** The functions behind the `asyncRule` names in the schema. */
  asyncValidators?: Record<string, AsyncValidator>;
  /** How long the user must stop typing before a server check starts. */
  asyncDebounceMs?: number;
  /** A server check that takes longer than this is given up. The user is not blamed. */
  asyncTimeoutMs?: number;
  /** An `onSubmit` that takes longer than this is given up, and the user can try again. */
  submitTimeoutMs?: number;
  /** More field types, or other components for the built-in ones. Keep the same object between renders. */
  fieldTypes?: Record<string, FieldTypeDefinition>;
  /** Other texts, for example a translation. A text that is left out stays in English. Keep the same object between renders. */
  messages?: Partial<FormMessages>;
  /** Keeps the answers in `sessionStorage` while the user fills in the form. Fields marked `sensitive` are never kept. */
  saveDraft?: boolean;
  /** How long after the last change the draft is saved. */
  draftDebounceMs?: number;
  /** Asks the browser to warn the user who leaves the page with answers that were not sent. */
  warnBeforeLeave?: boolean;
  /** Tells the monitoring of the page what happens. An event never holds a value of a field. */
  onEvent?: (event: FormMonitorEvent) => void;
  /** Shows the mistakes of the schema in place of the form. The default is on in development and off in production. */
  showSchemaProblems?: boolean;
  /** Debug help: each field shows how many times it was drawn. */
  showRenderCounts?: boolean;
}

const NO_VALIDATORS: Record<string, AsyncValidator> = {};

/** Checks the schema one time. A second form with the same schema must find the same answer. */
function useSchemaProblems(schema: FormSchema): string[] {
  const [problems] = useState(() => checkSchema(schema));

  useEffect(() => {
    problems.forEach((problem) => warnOnce(`Form schema error in "${schema.id}": ${problem}`));
  }, [problems, schema.id]);

  return problems;
}

export function Form({ showSchemaProblems = import.meta.env.DEV, ...props }: FormProps) {
  const problems = useSchemaProblems(props.schema);

  // In production we still try to draw the form. A form with one broken rule
  // is better for the user than no form.
  if (showSchemaProblems && problems.length > 0) {
    return <SchemaProblems schemaId={props.schema.id} problems={problems} />;
  }
  return <CheckedForm {...props} />;
}

function CheckedForm({
  schema,
  onSubmit,
  asyncValidators = NO_VALIDATORS,
  asyncDebounceMs = 300,
  asyncTimeoutMs = 10_000,
  submitTimeoutMs = 30_000,
  fieldTypes,
  messages: customMessages,
  saveDraft = false,
  draftDebounceMs = 500,
  warnBeforeLeave = false,
  onEvent,
  showRenderCounts = false,
}: FormProps) {
  const formId = useId();

  // These two objects are props of every field. useMemo keeps them the same
  // between renders, so `memo` on the field can skip the fields.
  const messages = useMemo(() => ({ ...DEFAULT_MESSAGES, ...customMessages }), [customMessages]);
  const allFieldTypes = useMemo(() => ({ ...BUILT_IN_FIELD_TYPES, ...fieldTypes }), [fieldTypes]);

  // The store lives as long as the form, but it must always call the newest
  // `onSubmit` and read the newest settings. So it reads them from a ref,
  // and an effect puts the newest ones in the ref after every render.
  const options: FormStoreOptions = {
    onSubmit,
    asyncValidators,
    debounceMs: asyncDebounceMs,
    asyncTimeoutMs,
    submitTimeoutMs,
    saveDraft,
    draftDebounceMs,
    onEvent,
  };
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // useState with a function creates the store once, on the first render.
  const [store] = useState(() => {
    // A field we cannot draw cannot be filled in, so it must not be checked or sent.
    const isKnown = (field: FieldSchema) =>
      field.type === "group" || getFieldType(allFieldTypes, field.type) !== undefined;
    const knownFields = schema.fields
      .filter(isKnown)
      .map((field) =>
        field.fields === undefined ? field : { ...field, fields: field.fields.filter(isKnown) },
      );
    // The steps are worked out from all fields, so a field with an unknown
    // type keeps its place on its step, where its "unsupported" box is drawn.
    const checkedSchema = { ...schema, fields: knownFields, steps: getSteps(schema) };
    return createFormStore(checkedSchema, () => optionsRef.current);
  });

  useEffect(() => {
    store.connect();
    return () => store.disconnect();
  }, [store]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Without this the browser loads the page again.
    event.preventDefault();

    // Enter in a field means "go on": to the next step, or send on the last one.
    if (store.getState().stepIndex < store.steps.length - 1) {
      store.goToNextStep();
    } else {
      void store.submit();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    // With a Hindi, Japanese or Chinese keyboard, Enter can mean "take this
    // word", not "send the form". Safari reports that Enter with keyCode 229.
    if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) {
      event.preventDefault();
    }
  }

  return (
    <form
      className="form"
      // The browser has its own error bubbles. They would fight with our messages.
      noValidate
      aria-label={schema.title}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
    >
      {schema.title !== undefined && <h2 className="form__title">{schema.title}</h2>}

      <ErrorSummary store={store} messages={messages} formId={formId} />

      <StepFields
        schema={schema}
        store={store}
        fieldTypes={allFieldTypes}
        messages={messages}
        formId={formId}
        showRenderCounts={showRenderCounts}
      />

      <Buttons store={store} submitLabel={schema.submitLabel} messages={messages} />

      <FocusMover store={store} formId={formId} />
      {warnBeforeLeave && <LeaveWarning store={store} />}
    </form>
  );
}

interface StepFieldsProps {
  schema: FormSchema;
  store: FormStore;
  fieldTypes: Record<string, FieldTypeDefinition>;
  messages: FormMessages;
  formId: string;
  showRenderCounts: boolean;
}

/** The step indicator, and the fields of the step on screen. */
function StepFields(props: StepFieldsProps) {
  const { schema, store, fieldTypes, messages, formId, showRenderCounts } = props;
  const stepIndex = useStoreValue(store, (state) => state.stepIndex);
  const { steps } = store;
  // The "!" is safe: the store keeps `stepIndex` between 0 and the last step.
  const currentStep = steps[stepIndex]!;

  return (
    <>
      {steps.length > 1 && (
        <>
          <ol className="steps" aria-label={messages.stepsLabel}>
            {steps.map((step, index) => (
              <li
                // The list of steps never changes, so the index is a safe key.
                key={index}
                className="steps__step"
                aria-current={index === stepIndex ? "step" : undefined}
              >
                {step.title}
              </li>
            ))}
          </ol>
          {/*
            Focus moves here when the step changes, so a screen reader says
            where the user is now. `tabIndex={-1}` lets a heading take focus
            from code, without adding it to the Tab order.
          */}
          <h3 id={`${formId}-${STEP_HEADING_TARGET}`} className="form__step-title" tabIndex={-1}>
            {messages.stepTitle(stepIndex + 1, steps.length, currentStep.title)}
          </h3>
        </>
      )}

      {/* The order is the order of the schema. The step only says which fields are on screen. */}
      {schema.fields
        .filter((field) => currentStep.fields.includes(field.name))
        .map((field) =>
          field.type === "group" ? (
            <GroupField
              key={field.name}
              group={field}
              fieldTypes={fieldTypes}
              store={store}
              messages={messages}
              formId={formId}
              showRenderCount={showRenderCounts}
            />
          ) : (
            <Field
              key={field.name}
              // The store keeps one object for each field, so `memo` can skip it.
              field={store.getLeaf(field.name) ?? field}
              definition={getFieldType(fieldTypes, field.type)}
              store={store}
              messages={messages}
              formId={formId}
              showRenderCount={showRenderCounts}
            />
          ),
        )}
    </>
  );
}

interface ButtonsProps {
  store: FormStore;
  submitLabel: string | undefined;
  messages: FormMessages;
}

function Buttons({ store, submitLabel, messages }: ButtonsProps) {
  const isSubmitting = useStoreValue(store, (state) => state.isSubmitting);
  const stepIndex = useStoreValue(store, (state) => state.stepIndex);
  const isLastStep = stepIndex === store.steps.length - 1;

  return (
    <div className="form__buttons">
      {stepIndex > 0 && (
        <button className="form__back" type="button" onClick={store.goToPreviousStep}>
          {messages.back}
        </button>
      )}
      {/*
        The button is never disabled. A disabled button cannot tell the user
        what is wrong. A second press while we send is ignored in the store.
        It is a submit button on every step, so Enter in a field presses it.
      */}
      <button className="form__submit" type="submit" aria-busy={isSubmitting}>
        {isSubmitting
          ? messages.submitting
          : isLastStep
            ? (submitLabel ?? messages.submit)
            : messages.next}
      </button>
    </div>
  );
}

/**
 * Moves focus where the store asks. It runs in an effect, after React has
 * drawn: the field can be on a step, or in a group item, that was not on
 * screen a moment ago.
 */
function FocusMover({ store, formId }: { store: FormStore; formId: string }) {
  const request = useStoreValue(store, (state) => state.focusRequest);

  useEffect(() => {
    if (request !== null) {
      document.getElementById(`${formId}-${request.target}`)?.focus();
    }
  }, [request, formId]);

  return null;
}

/**
 * Asks the browser to warn before the page is left with answers that were not
 * sent. The listener is there only while the form is dirty: a page with a
 * `beforeunload` listener loads slower when the user comes back to it,
 * because the browser cannot keep it in memory.
 */
function LeaveWarning({ store }: { store: FormStore }) {
  const isDirty = useStoreValue(store, (state) => state.isDirty);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      // The browser shows its own text. It ignores any text we give.
      event.preventDefault();
      // Older browsers need this line as well.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  return null;
}

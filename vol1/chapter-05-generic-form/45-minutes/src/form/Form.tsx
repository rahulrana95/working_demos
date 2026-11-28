/*
 * PART OF THE INTERVIEW: yes (about 10 minutes).
 * Order to write it in:
 *   1. Loop over the schema and draw each field through the registry.  (3 minutes)
 *   2. Label, help text and error text, linked with ARIA attributes.   (4 minutes)
 *   3. The error summary, the submit button and its busy state.        (3 minutes)
 *
 * The form keeps its own state. To start again with empty values, or to show
 * another schema, give the form a new `key`.
 */
import { useEffect } from "react";
import { getControl } from "./fields";
import type { FieldSchema, FormSchema } from "./types";
import { useForm } from "./useForm";
import type { SubmitHandler, UseFormReturn } from "./useForm";
import { isVisible } from "./validation";
import { warnOnce } from "./warnOnce";

export interface FormProps {
  /** The definition of the form. It is plain data and can come from a server. */
  schema: FormSchema;
  /** Gets the values of the fields on screen. Reject the promise when the server fails. */
  onSubmit: SubmitHandler;
}

export function Form({ schema, onSubmit }: FormProps) {
  // A field we cannot draw cannot be filled in, so it must not be checked or sent.
  const knownFields = schema.fields.filter((field) => getControl(field.type) !== undefined);
  const form = useForm({ ...schema, fields: knownFields }, onSubmit);

  const summaryFields = knownFields.filter(
    (field) => form.summaryErrors[field.name] !== undefined && isVisible(field, form.values),
  );

  return (
    <form
      className="form"
      // The browser has its own error bubbles. They would fight with our messages.
      noValidate
      aria-label={schema.title}
      onSubmit={form.handleSubmit}
    >
      {schema.title !== undefined && <h2 className="form__title">{schema.title}</h2>}

      {/*
        This box is always in the page, also when it is empty. A screen reader
        reads new text inside an alert that it already knows.
      */}
      <div className="form__alert" role="alert">
        {summaryFields.length > 0 && (
          <>
            <p className="form__alert-title">Please fix these problems:</p>
            <ul>
              {summaryFields.map((field) => (
                <li key={field.name}>{form.summaryErrors[field.name]}</li>
              ))}
            </ul>
          </>
        )}
        {form.submitError && (
          <p className="form__alert-title">
            We could not send the form. Your answers are still here. Please try again.
          </p>
        )}
      </div>

      {schema.fields.map((field) => (
        <Field key={field.name} field={field} form={form} />
      ))}

      {/*
        The button is never disabled. A disabled button cannot tell the user
        what is wrong. A second press while we send is ignored in the hook.
      */}
      <button className="form__submit" type="submit" aria-busy={form.isSubmitting}>
        {form.isSubmitting ? "Sending…" : (schema.submitLabel ?? "Submit")}
      </button>
    </form>
  );
}

interface FieldProps {
  field: FieldSchema;
  form: UseFormReturn;
}

function Field({ field, form }: FieldProps) {
  const Control = getControl(field.type);

  if (!isVisible(field, form.values)) {
    return null;
  }
  if (Control === undefined) {
    return <UnsupportedField field={field} />;
  }

  const id = form.getFieldId(field.name);
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const error = form.errors[field.name];

  // A screen reader reads the help and the error after the label.
  const describedBy = [field.helpText && helpId, error && errorId].filter(Boolean).join(" ");

  return (
    <div className={`field field--${field.type}${error ? " is-invalid" : ""}`}>
      <label className="field__label" htmlFor={id}>
        {field.label}
        {/* A screen reader already says "required", because of the attribute on the control. */}
        {field.required && <span aria-hidden="true"> (required)</span>}
      </label>

      <Control
        field={field}
        value={form.values[field.name] ?? ""}
        onChange={(value) => form.setValue(field.name, value)}
        controlProps={{
          id,
          name: field.name,
          required: field.required,
          // Said again for screen readers, because the form has `noValidate`.
          "aria-required": field.required,
          autoComplete: field.autoComplete,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": describedBy || undefined,
          onBlur: () => form.handleBlur(field.name),
        }}
      />

      {field.helpText && (
        <p id={helpId} className="field__help">
          {field.helpText}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

/** Shown in place of a field whose type we do not know. The other fields still work. */
function UnsupportedField({ field }: { field: FieldSchema }) {
  useEffect(() => {
    warnOnce(`Form schema error: no component for the field type "${field.type}".`);
  }, [field.type]);

  return <p className="field field__unsupported">Unsupported field type: {field.type}</p>;
}

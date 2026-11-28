/*
 * PART OF THE INTERVIEW: yes (about 4 minutes).
 * Write these types first. They are the contract between the server, which
 * sends the form definition, and the component, which draws it.
 *
 * Everything in a schema is plain data that JSON can hold. There are no
 * functions, so a server can send a schema and a database can store one.
 * The staff answer adds richer conditions, errors as data, and the shape of
 * the errors that a server sends back.
 */

/** What one field can hold. A number field holds the typed text while the user edits it. */
export type FieldValue = string | number | boolean;

export type FieldType = "text" | "email" | "number" | "textarea" | "select" | "checkbox";

export type Rule =
  | { type: "minLength" | "maxLength" | "min" | "max"; value: number; message?: string }
  | { type: "pattern"; value: string; message?: string }
  | { type: "email"; message?: string };

/**
 * When to show a field. It is data, not a function. `all` and `any` hold more
 * conditions, so "contractor in India or Germany" can be written down.
 */
export type Condition =
  | { field: string; equals: FieldValue }
  | { field: string; notEquals: FieldValue }
  | { field: string; in: FieldValue[] }
  | { all: Condition[] }
  | { any: Condition[] };

export interface FieldSchema {
  /** The key of the field in the values. It must be unique in the form. */
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: FieldValue;
  /** The browser's autofill hint, like "name" or "email". It goes on the control as it is. */
  autoComplete?: string;
  /** The choices of a select. */
  options?: { value: string; label: string }[];
  /** Checked in this order. The first rule that fails gives the error. */
  rules?: Rule[];
  visibleWhen?: Condition;
}

export interface FormSchema {
  id: string;
  title?: string;
  submitLabel?: string;
  fields: FieldSchema[];
}

export type FormValues = Record<string, FieldValue>;

/**
 * Why a field is wrong. It is data, not a text: the rule that failed, or one
 * of the checks that are not rules. The text is chosen when the error is
 * drawn, so a change of language also changes the errors on screen. An error
 * from the server ("server") brings its own text in `message`.
 */
export type FieldError = Rule | { type: "required" | "number" | "server"; message?: string };

/** One error for each field that has one. The key is the field name. */
export type FormErrors = Record<string, FieldError>;

export type SubmitHandler = (values: FormValues) => Promise<void> | void;

/** Reject the promise of `onSubmit` with this shape, and the form shows the errors. */
export interface SubmitErrors {
  /** Errors that belong to one field. The key is the field name. */
  fieldErrors?: Record<string, string>;
  /** An error about the whole form. */
  formError?: string;
}

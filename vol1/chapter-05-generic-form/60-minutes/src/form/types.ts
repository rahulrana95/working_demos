/*
 * PART OF THE INTERVIEW: yes (about 4 minutes).
 * Write these types first. They are the contract between the server, which
 * sends the form definition, and the component, which draws it.
 *
 * Everything in a schema is plain data that JSON can hold. There are no
 * functions, so a server can send a schema and a database can store one.
 * The staff answer adds richer conditions, checks on the server, and the
 * shape of the errors that a server sends back.
 */

/** What one field can hold. A number field holds the typed text while the user edits it. */
export type FieldValue = string | number | boolean;

/** The field types that are built in. The `fieldTypes` prop of the form can add more. */
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

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldSchema {
  /** The key of the field in the values. It must be unique in the form. */
  name: string;
  label: string;
  /** A built-in `FieldType`, or a type that the page added with `fieldTypes`. */
  type: string;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: FieldValue;
  /** The browser's autofill hint, like "name" or "email". It goes on the control as it is. */
  autoComplete?: string;
  /** The choices of a select. */
  options?: FieldOption[];
  /** Checked in this order. The first rule that fails gives the error. */
  rules?: Rule[];
  /**
   * A check that only a server can do, like "is this email taken?". The schema
   * holds only a name. The page gives the function with that name in `asyncValidators`.
   */
  asyncRule?: { name: string };
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
 * drawn, so a change of language also changes the errors on screen. An answer
 * from a server ("async" or "server") brings its own text in `message`.
 */
export type FieldError =
  | Rule
  | { type: "required" | "number" | "async" | "server"; message?: string };

/** One error for each field that has one. The key is the field name. */
export type FormErrors = Record<string, FieldError>;

/**
 * Asks a server about one value. It resolves with an error text, or with null
 * when the value is fine. When the user types again, the signal is aborted.
 */
export type AsyncValidator = (value: FieldValue, signal: AbortSignal) => Promise<string | null>;

export type SubmitHandler = (values: FormValues) => Promise<void> | void;

/** Reject the promise of `onSubmit` with this shape, and the form shows the errors. */
export interface SubmitErrors {
  /** Errors that belong to one field. The key is the field name. */
  fieldErrors?: Record<string, string>;
  /** An error about the whole form. */
  formError?: string;
}

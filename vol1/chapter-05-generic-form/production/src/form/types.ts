/*
 * NOT PART OF THE INTERVIEW: production version.
 * The contract between the server, which sends the form definition, and the
 * component, which draws it. Everything in a schema is plain data that JSON
 * can hold. On top of the staff answer it has steps, groups that repeat,
 * fields that are never saved in a draft, and the events for monitoring.
 */

/** What one field can hold. A number field holds the typed text while the user edits it. */
export type FieldValue = string | number | boolean;

/** The field types that are built in. The `fieldTypes` prop of the form can add more. */
export type FieldType =
  | "text"
  | "email"
  | "number"
  | "date"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "group";

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
  /** The key of the field in the values. It must be unique in the form, and have no dot in it. */
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
  /** The choices of a select or of radio buttons. */
  options?: FieldOption[];
  /** Checked in this order. The first rule that fails gives the error. */
  rules?: Rule[];
  /**
   * A check that only a server can do, like "is this email taken?". The schema
   * holds only a name. The page gives the function with that name in `asyncValidators`.
   */
  asyncRule?: { name: string };
  /**
   * When to show the field. A field inside a group can depend only on fields
   * outside the group.
   */
  visibleWhen?: Condition;
  /** True for a value like a bank account number. It is never saved in a draft. */
  sensitive?: boolean;

  /** Type "group" only: the fields of one item. The user can add and remove items. */
  fields?: FieldSchema[];
  /** Type "group" only: the name of one item, like "Dependant". The default is the label. */
  itemLabel?: string;
  /** Type "group" only: the form starts with this many items and never has fewer. Default 0. */
  minItems?: number;
  /** Type "group" only: the user cannot add more items than this. Default: no limit. */
  maxItems?: number;
}

export interface StepSchema {
  title: string;
  /** The names of the fields and groups of this step. */
  fields: string[];
}

export interface FormSchema {
  id: string;
  /** Raise it when the fields change. A draft that was saved for another version is thrown away. */
  version?: number;
  title?: string;
  submitLabel?: string;
  fields: FieldSchema[];
  /** Splits the form into pages. A field that no step names goes on the last one. */
  steps?: StepSchema[];
}

/** The values inside the form. A field of a group item has the key "group.itemId.field". */
export type FormValues = Record<string, FieldValue>;

/** The values that `onSubmit` gets. A group is a list with one object for each item. */
export type SubmitValues = Record<string, FieldValue | FormValues[]>;

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

/**
 * Sends the values. Resolve when the server took them. Reject with
 * `SubmitErrors` to show what the server said, or with anything else to show
 * the default text. The signal is aborted when the form gives up waiting or
 * is removed: pass it to `fetch`.
 */
export type SubmitHandler = (values: SubmitValues, signal: AbortSignal) => Promise<void> | void;

/** Reject the promise of `onSubmit` with this shape, and the form shows the errors. */
export interface SubmitErrors {
  /**
   * Errors that belong to one field. The key is the field name. For a field
   * of a group item it is "group.index.field", where the first item has index 0.
   */
  fieldErrors?: Record<string, string>;
  /** An error about the whole form. */
  formError?: string;
}

/**
 * What the form tells the monitoring of the page. An event never holds a
 * value that the user typed: only names from the schema, counts and times.
 */
export type FormMonitorEvent =
  | { type: "form_viewed"; formId: string }
  | {
      type: "field_error";
      formId: string;
      /** The name from the schema. For a field of a group it is "group.field". */
      field: string;
      /** The type of the rule that failed, or "required", "number", "async" or "server". */
      rule: string;
    }
  | { type: "submit_attempted"; formId: string; msSinceViewed: number }
  | { type: "submit_succeeded"; formId: string; durationMs: number; msSinceViewed: number }
  | {
      type: "submit_failed";
      formId: string;
      /** From the press on the button to the moment the user saw the errors. */
      durationMs: number;
      reason: "validation" | "server" | "timeout";
      /** How many fields have an error. */
      errorCount: number;
    };

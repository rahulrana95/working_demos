/*
 * PART OF THE INTERVIEW: yes (about 3 minutes).
 * Write these types first. They are the contract between the server, which
 * sends the form definition, and the component, which draws it.
 *
 * Everything here is plain data that JSON can hold. There are no functions,
 * so a server can send a schema and a database can store one.
 */

/** What one field can hold. A number field holds the typed text while the user edits it. */
export type FieldValue = string | number | boolean;

export type FieldType = "text" | "email" | "number" | "textarea" | "select" | "checkbox";

export type Rule =
  | { type: "minLength" | "maxLength" | "min" | "max"; value: number; message?: string }
  | { type: "pattern"; value: string; message?: string }
  | { type: "email"; message?: string };

/** Show the field only while another field has this value. It is data, not a function. */
export interface Condition {
  field: string;
  equals: FieldValue;
}

export interface FieldOption {
  value: string;
  label: string;
}

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
  options?: FieldOption[];
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

/** One error text for each field that has an error. The key is the field name. */
export type FormErrors = Record<string, string>;

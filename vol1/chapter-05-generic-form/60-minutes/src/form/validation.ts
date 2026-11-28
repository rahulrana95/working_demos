/*
 * PART OF THE INTERVIEW: yes (about 12 minutes).
 * Pure functions: values in, answer out. They do not know React, so they are
 * easy to test, and the server can run the same rules on the same schema.
 * The staff answer adds richer conditions. It also returns an error as data
 * and chooses the text in a second step, from `messages`.
 */
import type { FormMessages } from "./messages";
import type {
  Condition,
  FieldError,
  FieldSchema,
  FieldValue,
  FormErrors,
  FormSchema,
  FormValues,
  Rule,
} from "./types";
import { warnOnce } from "./warnOnce";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Digits with an optional minus sign and decimal point. "1e5" and "abc" are not numbers here. */
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

/** Says whether a condition from the schema holds for these values. */
export function matchesCondition(condition: Condition, values: FormValues): boolean {
  if ("all" in condition) {
    return condition.all.every((part) => matchesCondition(part, values));
  }
  if ("any" in condition) {
    return condition.any.some((part) => matchesCondition(part, values));
  }

  const value = values[condition.field];

  if ("equals" in condition) {
    return value === condition.equals;
  }
  if ("notEquals" in condition) {
    return value !== condition.notEquals;
  }
  return value !== undefined && condition.in.includes(value);
}

/** A field is on screen when it has no condition, or when its condition holds. */
export function isVisible(field: FieldSchema, values: FormValues): boolean {
  return field.visibleWhen === undefined || matchesCondition(field.visibleWhen, values);
}

/** The value every field starts with. The schema can give its own in `defaultValue`. */
export function getInitialValues(schema: FormSchema): FormValues {
  const values: FormValues = {};

  for (const field of schema.fields) {
    // A number field starts as an empty text, not as 0, so the box can be empty.
    values[field.name] = field.defaultValue ?? (field.type === "checkbox" ? false : "");
  }

  return values;
}

/** Empty means: no text, only spaces, or a tick box that is not ticked. */
export function isEmpty(value: FieldValue): boolean {
  return value === false || (typeof value === "string" && value.trim() === "");
}

/** A broken pattern in the schema must not crash the form or block the user. */
function matchesPattern(source: string, text: string): boolean {
  try {
    return new RegExp(source).test(text);
  } catch {
    warnOnce(`Form schema error: "${source}" is not a valid regular expression.`);
    return true;
  }
}

function passesRule(rule: Rule, value: FieldValue): boolean {
  const text = String(value);

  switch (rule.type) {
    case "minLength":
      return text.length >= rule.value;
    case "maxLength":
      return text.length <= rule.value;
    // Number("9") is smaller than 50. The text "9" is not smaller than the text "50".
    case "min":
      return Number(value) >= rule.value;
    case "max":
      return Number(value) <= rule.value;
    case "email":
      return EMAIL_PATTERN.test(text);
    case "pattern":
      return matchesPattern(rule.value, text);
    default:
      // A rule type we do not know, from a newer server. It must not block the user.
      return true;
  }
}

/** Returns what is wrong with the value of one field, or null when it is fine. */
export function validateField(field: FieldSchema, value: FieldValue): FieldError | null {
  // An empty field fails only when it is required. No other rule looks at it.
  if (isEmpty(value)) {
    return field.required ? { type: "required" } : null;
  }
  // A number field is a text box, so the user can type anything into it.
  if (field.type === "number" && !NUMBER_PATTERN.test(String(value).trim())) {
    return { type: "number" };
  }

  return (field.rules ?? []).find((rule) => !passesRule(rule, value)) ?? null;
}

/** The text of an error: the one the schema or a server gave, or else the one in `messages`. */
export function getErrorText(
  field: FieldSchema,
  error: FieldError,
  messages: FormMessages,
): string {
  if (error.message !== undefined) {
    return error.message;
  }

  switch (error.type) {
    case "minLength":
    case "maxLength":
    case "min":
    case "max":
      return messages[error.type](field.label, error.value);
    case "required":
    case "number":
    case "email":
    case "pattern":
      return messages[error.type](field.label);
    default:
      // An answer from a server has its own message. This is the text if one does not.
      return messages.pattern(field.label);
  }
}

/** Checks every field that is on screen. A hidden field can never block the form. */
export function validateForm(schema: FormSchema, values: FormValues): FormErrors {
  const errors: FormErrors = {};

  for (const field of schema.fields) {
    const error = isVisible(field, values) ? validateField(field, values[field.name] ?? "") : null;
    if (error !== null) {
      errors[field.name] = error;
    }
  }

  return errors;
}

/**
 * The values we give to `onSubmit`: fields on screen only, so an answer the
 * user can no longer see is never sent. A number field is sent as a number.
 * An empty number field is sent as an empty text, because 0 would be a lie.
 */
export function getSubmitValues(schema: FormSchema, values: FormValues): FormValues {
  const submitValues: FormValues = {};

  for (const field of schema.fields) {
    if (isVisible(field, values)) {
      const value = values[field.name] ?? "";
      submitValues[field.name] = field.type === "number" && !isEmpty(value) ? Number(value) : value;
    }
  }

  return submitValues;
}

/*
 * PART OF THE INTERVIEW: yes (about 10 minutes).
 * Pure functions: values in, answer out. They do not know React, so they are
 * easy to test, and the server can run the same rules on the same schema.
 */
import type { FieldSchema, FieldValue, FormErrors, FormSchema, FormValues, Rule } from "./types";
import { warnOnce } from "./warnOnce";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Digits with an optional minus sign and decimal point. "1e5" and "abc" are not numbers here. */
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

/** A field is on screen when it has no condition, or when its condition holds. */
export function isVisible(field: FieldSchema, values: FormValues): boolean {
  const condition = field.visibleWhen;
  return condition === undefined || values[condition.field] === condition.equals;
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
function isEmpty(value: FieldValue): boolean {
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

/** Returns the default error text of one rule, or null when the value passes it. */
function checkRule(rule: Rule, value: FieldValue, label: string): string | null {
  const text = String(value);

  switch (rule.type) {
    case "minLength":
      return text.length >= rule.value
        ? null
        : `${label} must have at least ${rule.value} characters.`;
    case "maxLength":
      return text.length <= rule.value
        ? null
        : `${label} must have at most ${rule.value} characters.`;
    // Number("9") is smaller than 50. The text "9" is not smaller than the text "50".
    case "min":
      return Number(value) >= rule.value ? null : `${label} must be ${rule.value} or more.`;
    case "max":
      return Number(value) <= rule.value ? null : `${label} must be ${rule.value} or less.`;
    case "email":
      return EMAIL_PATTERN.test(text)
        ? null
        : `${label} must be an email address, like name@example.com.`;
    case "pattern":
      return matchesPattern(rule.value, text) ? null : `${label} is not in the right format.`;
    default:
      // A rule type we do not know, from a newer server. It must not block the user.
      return null;
  }
}

/** Returns the error text of one field, or null when the value is fine. */
export function validateField(field: FieldSchema, value: FieldValue): string | null {
  // An empty field fails only when it is required. No other rule looks at it.
  if (isEmpty(value)) {
    return field.required ? `${field.label} is required.` : null;
  }

  // A number field is a text box, so the user can type anything into it.
  if (field.type === "number" && !NUMBER_PATTERN.test(String(value).trim())) {
    return `${field.label} must be a number.`;
  }

  for (const rule of field.rules ?? []) {
    const error = checkRule(rule, value, field.label);
    if (error !== null) {
      return rule.message ?? error;
    }
  }

  return null;
}

/** Checks every field that is on screen. A hidden field can never block the form. */
export function validateForm(schema: FormSchema, values: FormValues): FormErrors {
  const errors: FormErrors = {};

  for (const field of schema.fields) {
    if (!isVisible(field, values)) {
      continue;
    }

    const error = validateField(field, values[field.name] ?? "");
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

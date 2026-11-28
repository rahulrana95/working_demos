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

/** The default error text of each rule. A rule in the schema can bring its own `message`. */
const RULE_TEXTS: Record<Rule["type"], (label: string, limit: unknown) => string> = {
  minLength: (label, limit) => `${label} must have at least ${limit} characters.`,
  maxLength: (label, limit) => `${label} must have at most ${limit} characters.`,
  min: (label, limit) => `${label} must be ${limit} or more.`,
  max: (label, limit) => `${label} must be ${limit} or less.`,
  email: (label) => `${label} must be an email address, like name@example.com.`,
  pattern: (label) => `${label} is not in the right format.`,
};

/** A field is on screen when it has no condition, or when its condition holds. */
export function isVisible(field: FieldSchema, values: FormValues): boolean {
  const condition = field.visibleWhen;
  return condition === undefined || values[condition.field] === condition.equals;
}

/** The value every field starts with. The schema can give its own in `defaultValue`. */
export function getInitialValues(schema: FormSchema): FormValues {
  // A number field starts as an empty text, not as 0, so the box can be empty.
  const getStartValue = (field: FieldSchema) =>
    field.defaultValue ?? (field.type === "checkbox" ? false : "");
  return Object.fromEntries(schema.fields.map((field) => [field.name, getStartValue(field)]));
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

function passesRule(rule: Rule, value: FieldValue): boolean {
  const text = String(value);
  if (rule.type === "minLength") return text.length >= rule.value;
  if (rule.type === "maxLength") return text.length <= rule.value;
  // Number("9") is smaller than 50. The text "9" is not smaller than the text "50".
  if (rule.type === "min") return Number(value) >= rule.value;
  if (rule.type === "max") return Number(value) <= rule.value;
  if (rule.type === "email") return EMAIL_PATTERN.test(text);
  if (rule.type === "pattern") return matchesPattern(rule.value, text);
  // A rule type we do not know, from a newer server. It must not block the user.
  return true;
}

/** Returns the error text of one field, or null when the value is fine. */
export function validateField(field: FieldSchema, value: FieldValue): string | null {
  // An empty field fails only when it is required. No other rule looks at it.
  if (isEmpty(value)) return field.required ? `${field.label} is required.` : null;
  // A number field is a text box, so the user can type anything into it.
  if (field.type === "number" && !NUMBER_PATTERN.test(String(value).trim())) {
    return `${field.label} must be a number.`;
  }

  const failedRule = (field.rules ?? []).find((rule) => !passesRule(rule, value));
  if (failedRule === undefined) return null;
  const limit = "value" in failedRule ? failedRule.value : undefined;
  return failedRule.message ?? RULE_TEXTS[failedRule.type](field.label, limit);
}

/** Checks every field that is on screen. A hidden field can never block the form. */
export function validateForm(schema: FormSchema, values: FormValues): FormErrors {
  const errors: FormErrors = {};
  for (const field of schema.fields) {
    const error = isVisible(field, values) ? validateField(field, values[field.name] ?? "") : null;
    if (error !== null) errors[field.name] = error;
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
  for (const field of schema.fields.filter((candidate) => isVisible(candidate, values))) {
    const value = values[field.name] ?? "";
    submitValues[field.name] = field.type === "number" && !isEmpty(value) ? Number(value) : value;
  }
  return submitValues;
}

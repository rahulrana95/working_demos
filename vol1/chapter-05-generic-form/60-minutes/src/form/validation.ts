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
  SubmitErrors,
} from "./types";
import { warnOnce } from "./warnOnce";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Digits with an optional minus sign and decimal point. "1e5" and "abc" are not numbers here. */
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

/** Says whether a condition from the schema holds for these values. */
export function matchesCondition(condition: Condition, values: FormValues): boolean {
  if ("all" in condition) return condition.all.every((part) => matchesCondition(part, values));
  if ("any" in condition) return condition.any.some((part) => matchesCondition(part, values));

  const value = values[condition.field];
  if ("equals" in condition) return value === condition.equals;
  if ("notEquals" in condition) return value !== condition.notEquals;
  return value !== undefined && condition.in.includes(value);
}

/** A field is on screen when it has no condition, or when its condition holds. */
export function isVisible(field: FieldSchema, values: FormValues): boolean {
  return field.visibleWhen === undefined || matchesCondition(field.visibleWhen, values);
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

/** Returns what is wrong with the value of one field, or null when it is fine. */
export function validateField(field: FieldSchema, value: FieldValue): FieldError | null {
  // An empty field fails only when it is required. No other rule looks at it.
  if (isEmpty(value)) return field.required ? { type: "required" } : null;
  // A number field is a text box, so the user can type anything into it.
  if (field.type === "number" && !NUMBER_PATTERN.test(String(value).trim())) {
    return { type: "number" };
  }
  return (field.rules ?? []).find((rule) => !passesRule(rule, value)) ?? null;
}

/** The text of an error: the one the schema or the server gave, or else the one in `messages`. */
export function getErrorText(field: FieldSchema, error: FieldError, texts: FormMessages): string {
  // An error from the server always has its own message, so it never reaches the last lines.
  if (error.message !== undefined || error.type === "server") return error.message ?? "";
  // Some texts take the limit of the rule and some do not. An argument too many does no harm.
  const getText = texts[error.type] as (label: string, limit: unknown) => string;
  return getText(field.label, "value" in error ? error.value : undefined);
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

/**
 * Reads what `onSubmit` rejected with. It can be anything, so every part is
 * checked before it is used. An error for a field that is not on screen is
 * left out: it could not be shown or fixed.
 */
export function readSubmitErrors(schema: FormSchema, values: FormValues, reason: unknown) {
  const { fieldErrors, formError }: SubmitErrors =
    typeof reason === "object" && reason !== null ? reason : {};
  const errors: FormErrors = {};
  for (const field of schema.fields.filter((candidate) => isVisible(candidate, values))) {
    const message = fieldErrors?.[field.name];
    if (typeof message === "string") errors[field.name] = { type: "server", message };
  }
  return { errors, formError: typeof formError === "string" ? formError : undefined };
}

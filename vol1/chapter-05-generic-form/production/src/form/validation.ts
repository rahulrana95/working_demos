/*
 * NOT PART OF THE INTERVIEW: production version.
 * Pure functions: values in, answer out. They do not know React, so they are
 * easy to test, and the server can run the same rules on the same schema.
 * On top of the staff answer: a pattern that is too long is never run, and the
 * submitted values hold the items of a group as a list.
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
  SubmitValues,
} from "./types";
import { warnOnce } from "./warnOnce";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Digits with an optional minus sign and decimal point. "1e5" and "abc" are not numbers here. */
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

/**
 * An admin writes the patterns, and a bad one can freeze the page: some
 * patterns take minutes on a short text. A length limit does not catch all of
 * them, but it stops the ones that are pasted in by mistake or on purpose.
 */
export const MAX_PATTERN_LENGTH = 200;

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

/** The names of the fields that a condition reads. */
export function getConditionFields(condition: Condition): string[] {
  if ("all" in condition) {
    return condition.all.flatMap(getConditionFields);
  }
  if ("any" in condition) {
    return condition.any.flatMap(getConditionFields);
  }
  return [condition.field];
}

/** A field is on screen when it has no condition, or when its condition holds. */
export function isVisible(field: FieldSchema, values: FormValues): boolean {
  return field.visibleWhen === undefined || matchesCondition(field.visibleWhen, values);
}

/** The value a field starts with. The schema can give its own in `defaultValue`. */
export function getDefaultValue(field: FieldSchema): FieldValue {
  // A number field starts as an empty text, not as 0, so the box can be empty.
  return field.defaultValue ?? (field.type === "checkbox" ? false : "");
}

/** The start values of the fields outside groups. A group starts with no values of its own. */
export function getInitialValues(schema: FormSchema): FormValues {
  const values: FormValues = {};

  for (const field of schema.fields) {
    if (field.type !== "group") {
      values[field.name] = getDefaultValue(field);
    }
  }

  return values;
}

/** The key of one field of one group item in the values. */
export function getItemFieldName(groupName: string, itemId: number, fieldName: string): string {
  return `${groupName}.${itemId}.${fieldName}`;
}

/** Empty means: no text, only spaces, or a tick box that is not ticked. */
export function isEmpty(value: FieldValue): boolean {
  return value === false || (typeof value === "string" && value.trim() === "");
}

/** A broken or very long pattern in the schema must not crash the form or block the user. */
function matchesPattern(source: string, text: string): boolean {
  if (source.length > MAX_PATTERN_LENGTH) {
    warnOnce(`Form schema error: a pattern is longer than ${MAX_PATTERN_LENGTH} characters.`);
    return true;
  }

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

/** Checks the given fields that are on screen. A hidden field can never block the form. */
export function validateFields(fields: FieldSchema[], values: FormValues): FormErrors {
  const errors: FormErrors = {};

  for (const field of fields) {
    const error = isVisible(field, values) ? validateField(field, values[field.name] ?? "") : null;
    if (error !== null) {
      errors[field.name] = error;
    }
  }

  return errors;
}

/** A number field is sent as a number. An empty one is sent as an empty text: 0 would be a lie. */
function toSubmitValue(field: FieldSchema, value: FieldValue): FieldValue {
  return field.type === "number" && !isEmpty(value) ? Number(value) : value;
}

/**
 * The values we give to `onSubmit`: fields on screen only, so an answer the
 * user can no longer see is never sent. A group is sent as a list with one
 * object for each item, in the order on screen.
 */
export function getSubmitValues(
  schema: FormSchema,
  values: FormValues,
  itemIds: Record<string, number[]>,
): SubmitValues {
  const submitValues: SubmitValues = {};

  for (const field of schema.fields) {
    if (!isVisible(field, values)) {
      continue;
    }
    if (field.type !== "group") {
      submitValues[field.name] = toSubmitValue(field, values[field.name] ?? "");
      continue;
    }

    submitValues[field.name] = (itemIds[field.name] ?? []).map((itemId) => {
      const item: FormValues = {};
      for (const itemField of field.fields ?? []) {
        if (isVisible(itemField, values)) {
          const name = getItemFieldName(field.name, itemId, itemField.name);
          item[itemField.name] = toSubmitValue(itemField, values[name] ?? "");
        }
      }
      return item;
    });
  }

  return submitValues;
}

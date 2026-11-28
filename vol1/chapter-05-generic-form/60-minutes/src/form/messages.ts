/*
 * PART OF THE INTERVIEW: yes (about 2 minutes).
 * Every text that the form itself writes is here, in one object. Another team
 * can replace any of them to translate the form. The labels and help texts
 * are not here: they come from the schema, already in the right language.
 */

export const DEFAULT_MESSAGES = {
  required: (label: string) => `${label} is required.`,
  number: (label: string) => `${label} must be a number.`,
  minLength: (label: string, count: number) => `${label} must have at least ${count} characters.`,
  maxLength: (label: string, count: number) => `${label} must have at most ${count} characters.`,
  min: (label: string, limit: number) => `${label} must be ${limit} or more.`,
  max: (label: string, limit: number) => `${label} must be ${limit} or less.`,
  email: (label: string) => `${label} must be an email address, like name@example.com.`,
  pattern: (label: string) => `${label} is not in the right format.`,
  /** Shown after the label of a required field. */
  requiredMark: "(required)",
  /** The first choice of a select with no placeholder. */
  selectPlaceholder: "Select…",
  /** Shown beside a field while a server check runs. */
  checking: "Checking…",
  summaryTitle: (errorCount: number) =>
    errorCount === 1 ? "Please fix this problem:" : `Please fix these ${errorCount} problems:`,
  submit: "Submit",
  submitting: "Sending…",
  /** Shown when `onSubmit` fails and gives no text of its own. */
  submitFailed: "We could not send the form. Your answers are still here. Please try again.",
  unsupportedField: (type: string) => `Unsupported field type: ${type}`,
};

export type FormMessages = typeof DEFAULT_MESSAGES;

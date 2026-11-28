/*
 * NOT PART OF THE INTERVIEW: production version.
 * Every text that the form itself writes is here, in one object. Another team
 * can replace any of them to translate the form. The labels and help texts
 * are not here: they come from the schema, already in the right language.
 */

/** English has two plural forms. Other languages have up to six: use their own rules. */
const englishPlurals = new Intl.PluralRules("en");

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
    englishPlurals.select(errorCount) === "one"
      ? "Please fix this problem:"
      : `Please fix these ${errorCount} problems:`,
  /** Before an error of a group item in the summary: "Dependant 2: Name is required." */
  itemError: (itemTitle: string, error: string) => `${itemTitle}: ${error}`,
  submit: "Submit",
  submitting: "Sending…",
  /** Shown when `onSubmit` fails or takes too long, and gives no text of its own. */
  submitFailed: "We could not send the form. Your answers are still here. Please try again.",
  unsupportedField: (type: string) => `Unsupported field type: ${type}`,
  /** The heading of one item of a group: "Dependant 2". */
  itemTitle: (itemLabel: string, position: number) => `${itemLabel} ${position}`,
  addItem: (itemLabel: string) => `Add ${itemLabel.toLowerCase()}`,
  removeItem: (itemLabel: string, position: number) =>
    `Remove ${itemLabel.toLowerCase()} ${position}`,
  maxItemsReached: (limit: number) => `You cannot add more than ${limit}.`,
  /** The name of the list of steps, for screen readers. */
  stepsLabel: "Steps of this form",
  stepTitle: (position: number, total: number, title: string) =>
    `Step ${position} of ${total}: ${title}`,
  next: "Next",
  back: "Back",
};

export type FormMessages = typeof DEFAULT_MESSAGES;

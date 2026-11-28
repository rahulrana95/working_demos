/*
 * NOT PART OF THE INTERVIEW: production version.
 * The texts of the form in simple Hindi, for the demo. The labels stay in
 * English here, because they come from the schema: a real server would send
 * the schema in the language of the user.
 */
import type { FormMessages } from "../form";

/** In Hindi, 0 and 1 take the singular form. English uses it for 1 only. */
const hindiPlurals = new Intl.PluralRules("hi");

export const HINDI_MESSAGES: FormMessages = {
  required: (label) => `${label}: यह ज़रूरी है।`,
  number: (label) => `${label}: यहाँ संख्या लिखें।`,
  minLength: (label, count) => `${label}: कम से कम ${count} अक्षर लिखें।`,
  maxLength: (label, count) => `${label}: ज़्यादा से ज़्यादा ${count} अक्षर लिखें।`,
  min: (label, limit) => `${label}: ${limit} या उससे ज़्यादा लिखें।`,
  max: (label, limit) => `${label}: ${limit} या उससे कम लिखें।`,
  email: (label) => `${label}: सही ईमेल पता लिखें, जैसे name@example.com।`,
  pattern: (label) => `${label}: इसे सही तरीके से लिखें।`,
  requiredMark: "(ज़रूरी)",
  selectPlaceholder: "चुनें…",
  checking: "जाँच हो रही है…",
  summaryTitle: (errorCount) =>
    hindiPlurals.select(errorCount) === "one"
      ? "यह गलती ठीक करें:"
      : `ये ${errorCount} गलतियाँ ठीक करें:`,
  itemError: (itemTitle, error) => `${itemTitle}: ${error}`,
  submit: "भेजें",
  submitting: "भेज रहे हैं…",
  submitFailed: "फ़ॉर्म नहीं भेजा जा सका। आपके जवाब यहीं हैं। फिर से कोशिश करें।",
  unsupportedField: (type) => `यह फ़ील्ड नहीं दिखाया जा सकता। प्रकार: ${type}`,
  itemTitle: (itemLabel, position) => `${itemLabel} ${position}`,
  addItem: (itemLabel) => `${itemLabel} जोड़ें`,
  removeItem: (itemLabel, position) => `${itemLabel} ${position} हटाएँ`,
  maxItemsReached: (limit) => `आप ${limit} से ज़्यादा नहीं जोड़ सकते।`,
  stepsLabel: "इस फ़ॉर्म के चरण",
  stepTitle: (position, total, title) => `चरण ${position} / ${total}: ${title}`,
  next: "आगे",
  back: "पीछे",
};

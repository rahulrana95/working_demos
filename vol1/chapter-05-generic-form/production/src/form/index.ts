/* NOT PART OF THE INTERVIEW: production version. It only makes imports shorter. */
export { Form } from "./Form";
export type { FormProps } from "./Form";
export { checkSchema } from "./checkSchema";
export { clearDraft, loadDraft, saveDraft } from "./draft";
export type { Draft } from "./draft";
export { BUILT_IN_FIELD_TYPES } from "./fields";
export type { ControlProps, FieldTypeDefinition } from "./fields";
export { createFormStore, getSteps } from "./formStore";
export type { FormState, FormStore, FormStoreOptions, LeafField } from "./formStore";
export { DEFAULT_MESSAGES } from "./messages";
export type { FormMessages } from "./messages";
export {
  getErrorText,
  getInitialValues,
  getSubmitValues,
  isVisible,
  matchesCondition,
  MAX_PATTERN_LENGTH,
  validateField,
  validateFields,
} from "./validation";
export type {
  AsyncValidator,
  Condition,
  FieldError,
  FieldOption,
  FieldSchema,
  FieldType,
  FieldValue,
  FormErrors,
  FormMonitorEvent,
  FormSchema,
  FormValues,
  Rule,
  StepSchema,
  SubmitErrors,
  SubmitHandler,
  SubmitValues,
} from "./types";

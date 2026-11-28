/* NOT PART OF THE INTERVIEW. It only makes imports shorter. */
export { Form } from "./Form";
export type { FormProps } from "./Form";
export { BUILT_IN_FIELD_TYPES } from "./fields";
export type { ControlProps, FieldTypeDefinition } from "./fields";
export { createFormStore } from "./formStore";
export type { FormState, FormStore, FormStoreOptions } from "./formStore";
export { DEFAULT_MESSAGES } from "./messages";
export type { FormMessages } from "./messages";
export {
  getErrorText,
  getInitialValues,
  getSubmitValues,
  isVisible,
  matchesCondition,
  validateField,
  validateForm,
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
  FormSchema,
  FormValues,
  Rule,
  SubmitErrors,
  SubmitHandler,
} from "./types";

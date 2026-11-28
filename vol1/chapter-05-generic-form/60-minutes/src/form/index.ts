/* NOT PART OF THE INTERVIEW. It only makes imports shorter. */
export { Form } from "./Form";
export type { FormProps } from "./Form";
export type { ControlProps } from "./fields";
export { createFormStore } from "./formStore";
export type { FormState, FormStore } from "./formStore";
export { DEFAULT_MESSAGES } from "./messages";
export type { FormMessages } from "./messages";
export { showRenderCounts } from "./RenderCount";
export {
  getErrorText,
  getInitialValues,
  getSubmitValues,
  isVisible,
  matchesCondition,
  readSubmitErrors,
  validateField,
  validateForm,
} from "./validation";
export type {
  Condition,
  FieldError,
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

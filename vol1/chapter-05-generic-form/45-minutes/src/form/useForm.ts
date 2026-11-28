/*
 * PART OF THE INTERVIEW: yes (about 12 minutes).
 * The hook holds the state of the form. The component only draws it.
 *
 * When a field is checked:
 *   - when focus leaves it (blur), not while the user types in it the first time;
 *   - on every change, once the field shows an error or the form was submitted
 *     once, so the error goes away as soon as it is fixed;
 *   - on submit, together with every other field on screen.
 *
 * Why it holds at scale: all values are in one state object, so a key press
 * draws every field again. That is simple, and fast enough for a form of a
 * few hundred plain fields (the chapter README has the measured numbers). The
 * 60-minute answer moves the state to a store, so only one field is drawn.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { FieldValue, FormErrors, FormSchema, FormValues } from "./types";
import {
  getInitialValues,
  getSubmitValues,
  isVisible,
  validateField,
  validateForm,
} from "./validation";

export type SubmitHandler = (values: FormValues) => Promise<void> | void;

export function useForm(schema: FormSchema, onSubmit: SubmitHandler) {
  const [values, setValues] = useState(() => getInitialValues(schema));
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [summaryErrors, setSummaryErrors] = useState<FormErrors>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const baseId = useId();
  const getFieldId = (name: string) => `${baseId}-${name}`;

  // State is one render late: two submits in the same moment would both read
  // `isSubmitting` as false. A ref changes at once, so the second one stops.
  const isSubmittingRef = useRef(false);

  // The form can be removed while `onSubmit` is still waiting for the server.
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /** Checks one field and stores its error, or removes the error it had. */
  function checkField(name: string, value: FieldValue) {
    const field = schema.fields.find((candidate) => candidate.name === name);
    const error = field === undefined ? null : validateField(field, value);

    setErrors(({ [name]: _oldError, ...others }) =>
      error === null ? others : { ...others, [name]: error },
    );
  }

  function setValue(name: string, value: FieldValue) {
    // A hidden field keeps its value here, so the text is back when the field is shown again.
    setValues((current) => ({ ...current, [name]: value }));

    if (errors[name] !== undefined || hasSubmitted) {
      checkField(name, value);
    }
  }

  function handleBlur(name: string) {
    setTouched((current) => ({ ...current, [name]: true }));
    checkField(name, values[name] ?? "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Without this the browser loads the page again.
    event.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    const visibleFields = schema.fields.filter((field) => isVisible(field, values));
    const foundErrors = validateForm(schema, values);
    setErrors(foundErrors);
    setSummaryErrors(foundErrors);
    setTouched(Object.fromEntries(visibleFields.map((field) => [field.name, true])));
    setHasSubmitted(true);
    setSubmitError(false);

    const firstInvalidField = visibleFields.find((field) => foundErrors[field.name] !== undefined);
    if (firstInvalidField !== undefined) {
      // The field is already on screen, so we can move focus now.
      document.getElementById(getFieldId(firstInvalidField.name))?.focus();
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      await onSubmit(getSubmitValues(schema, values));
    } catch {
      if (isMountedRef.current) {
        setSubmitError(true);
      }
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }

  return {
    values,
    /** One error text for each field that was checked and is wrong. */
    errors,
    /** The fields that the user has left, or that were on screen at a submit. */
    touched,
    /** The errors found by the last submit. They do not change while the user types. */
    summaryErrors,
    isSubmitting,
    /** True when `onSubmit` failed. The values are kept, so the user can try again. */
    submitError,
    /** The id of the control of one field. Its label points at it. */
    getFieldId,
    setValue,
    handleBlur,
    handleSubmit,
  };
}

export type UseFormReturn = ReturnType<typeof useForm>;

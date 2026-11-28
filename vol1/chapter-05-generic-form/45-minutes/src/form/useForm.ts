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
import { getInitialValues, getSubmitValues, validateField, validateForm } from "./validation";

export type SubmitHandler = (values: FormValues) => Promise<void> | void;

export function useForm(schema: FormSchema, onSubmit: SubmitHandler) {
  const [values, setValues] = useState(() => getInitialValues(schema));
  const [errors, setErrors] = useState<FormErrors>({});
  /** The errors found by the last submit. They do not change while the user types. */
  const [summaryErrors, setSummaryErrors] = useState<FormErrors>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  /** "failed" means that `onSubmit` failed. The values are kept, so the user can try again. */
  const [status, setStatus] = useState<"idle" | "submitting" | "failed">("idle");

  const baseId = useId();
  /** The id of the control of one field. Its label points at it. */
  const getFieldId = (name: string) => `${baseId}-${name}`;

  // State is one render late: two submits in the same moment would both read
  // "idle". A ref changes at once, so the second one stops.
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
    if (errors[name] !== undefined || hasSubmitted) checkField(name, value);
  }

  const handleBlur = (name: string) => checkField(name, values[name] ?? "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Without this the browser loads the page again.
    event.preventDefault();
    if (isSubmittingRef.current) return;

    const foundErrors = validateForm(schema, values);
    setErrors(foundErrors);
    setSummaryErrors(foundErrors);
    setHasSubmitted(true);
    setStatus("idle");

    const firstInvalidField = schema.fields.find((field) => foundErrors[field.name] !== undefined);
    if (firstInvalidField !== undefined) {
      // The field is already on screen, so we can move focus now.
      document.getElementById(getFieldId(firstInvalidField.name))?.focus();
      return;
    }

    isSubmittingRef.current = true;
    setStatus("submitting");
    let hasFailed = false;
    try {
      await onSubmit(getSubmitValues(schema, values));
    } catch {
      hasFailed = true;
    }
    isSubmittingRef.current = false;
    if (isMountedRef.current) setStatus(hasFailed ? "failed" : "idle");
  }

  return { values, errors, summaryErrors, status, getFieldId, setValue, handleBlur, handleSubmit };
}

export type UseFormReturn = ReturnType<typeof useForm>;

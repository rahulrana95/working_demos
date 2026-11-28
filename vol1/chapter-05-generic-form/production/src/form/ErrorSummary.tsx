/*
 * NOT PART OF THE INTERVIEW: production version.
 * The box at the top of the form with the result of the last press on Next
 * or Submit: one link for each field with an error, and the error about the
 * whole form.
 */
import type { MouseEvent } from "react";
import { useStoreValue } from "./Field";
import type { FormStore, LeafField } from "./formStore";
import type { FormMessages } from "./messages";
import type { FieldError } from "./types";
import { getErrorText, isVisible } from "./validation";

export interface ErrorSummaryProps {
  store: FormStore;
  messages: FormMessages;
  formId: string;
}

export function ErrorSummary({ store, messages, formId }: ErrorSummaryProps) {
  const summaryErrors = useStoreValue(store, (state) => state.summaryErrors);
  const submitError = useStoreValue(store, (state) => state.submitError);
  const values = useStoreValue(store, (state) => state.values);
  const itemIds = useStoreValue(store, (state) => state.itemIds);

  // A field that is hidden now leaves the summary, or its link would lead nowhere.
  const invalidFields = store
    .getLeaves()
    .filter((field) => summaryErrors[field.name] !== undefined && isVisible(field, values));

  function getText(field: LeafField, error: FieldError): string {
    const text = getErrorText(field, error, messages);
    if (field.item === undefined) {
      return text;
    }
    // "Name is required." does not say which dependant. "Dependant 2: Name is required." does.
    const { group, id } = field.item;
    const position = (itemIds[group.name] ?? []).indexOf(id) + 1;
    return messages.itemError(messages.itemTitle(group.itemLabel ?? group.label, position), text);
  }

  function goToField(event: MouseEvent<HTMLAnchorElement>, name: string) {
    // The link alone would only scroll. A keyboard user needs the focus in the
    // field, and the field can be on another step.
    event.preventDefault();
    store.goToField(name);
  }

  return (
    // This box is always in the page, also when it is empty. A screen reader
    // reads new text inside an alert that it already knows.
    <div className="form__alert" role="alert">
      {invalidFields.length > 0 && (
        <>
          <p className="form__alert-title">{messages.summaryTitle(invalidFields.length)}</p>
          <ul>
            {invalidFields.map((field) => (
              <li key={field.name}>
                <a
                  href={`#${formId}-${field.name}`}
                  onClick={(event) => goToField(event, field.name)}
                >
                  {/* The filter above kept only fields with an error, so the "!" is safe. */}
                  {getText(field, summaryErrors[field.name]!)}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {submitError !== null && (
        <p className="form__alert-title">{submitError.message ?? messages.submitFailed}</p>
      )}
    </div>
  );
}

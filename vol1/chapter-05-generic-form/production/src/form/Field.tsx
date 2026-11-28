/*
 * NOT PART OF THE INTERVIEW: production version.
 * One field: its label, its control, its help text and its error.
 *
 * Each field listens to the store by itself and reads only what it shows.
 * So a key press in one field draws that field again, and no other.
 */
import { memo, useEffect, useSyncExternalStore } from "react";
import type { FieldTypeDefinition } from "./fields";
import type { FormState, FormStore } from "./formStore";
import type { FormMessages } from "./messages";
import { RenderCount } from "./RenderCount";
import type { FieldSchema } from "./types";
import { getErrorText, isVisible } from "./validation";
import { warnOnce } from "./warnOnce";

/**
 * Reads one thing from the store. The component is drawn again only when
 * that thing changes. The selector must return a text, a number, a boolean or
 * an object that is kept in the state, because React compares with `Object.is`.
 */
export function useStoreValue<T>(store: FormStore, select: (state: FormState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}

export interface FieldProps {
  /** For a field of a group item, this is the field with its full name: "group.itemId.field". */
  field: FieldSchema;
  /** Undefined when the schema has a field type that nobody has given a component for. */
  definition: FieldTypeDefinition | undefined;
  store: FormStore;
  messages: FormMessages;
  /** The start of every id in this form, so two forms on one page do not clash. */
  formId: string;
  showRenderCount: boolean;
}

function FieldInner({ field, definition, store, messages, formId, showRenderCount }: FieldProps) {
  const isShown = useStoreValue(store, (state) => isVisible(field, state.values));
  const value = useStoreValue(store, (state) => state.values[field.name] ?? "");
  const fieldError = useStoreValue(store, (state) => state.errors[field.name]);
  const isChecking = useStoreValue(store, (state) => state.checking[field.name] === true);

  if (!isShown) {
    return null;
  }
  if (definition === undefined) {
    return <UnsupportedField field={field} messages={messages} />;
  }

  const Control = definition.component;
  const id = `${formId}-${field.name}`;
  const labelId = `${id}-label`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  // The text is chosen here, so the error changes language together with `messages`.
  const error = fieldError && getErrorText(field, fieldError, messages);

  // A screen reader reads the help and the error after the label.
  const describedBy = [field.helpText && helpId, error && errorId].filter(Boolean).join(" ");

  const labelContent = (
    <>
      {field.label}
      {/* A screen reader already says "required", because of the attribute on the control. */}
      {field.required && <span aria-hidden="true"> {messages.requiredMark}</span>}
    </>
  );

  return (
    <div className={`field field--${field.type}${error ? " is-invalid" : ""}`}>
      {definition.isGroup ? (
        // A <label> belongs to one control. A group names itself with this id.
        <span id={labelId} className="field__label">
          {labelContent}
        </span>
      ) : (
        <label id={labelId} className="field__label" htmlFor={id}>
          {labelContent}
        </label>
      )}

      <Control
        field={field}
        value={value}
        onChange={(newValue) => store.setValue(field.name, newValue)}
        controlProps={{
          id,
          name: field.name,
          required: field.required,
          // Said again for screen readers, because the form has `noValidate`.
          "aria-required": field.required,
          autoComplete: field.autoComplete,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": describedBy || undefined,
          onBlur: () => store.touch(field.name),
        }}
        labelId={labelId}
        messages={messages}
      />

      {field.helpText && (
        <p id={helpId} className="field__help">
          {field.helpText}
        </p>
      )}
      {isChecking && (
        <p className="field__checking" aria-hidden="true">
          {messages.checking}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
      {field.asyncRule !== undefined && (
        // The answer of the server comes while the user is still in the field.
        // This hidden line reads it out. It is always in the page, because a
        // screen reader reads new text only in a status line it already knows.
        // It stays silent while the check runs, so it does not talk on every key press.
        <p className="visually-hidden" role="status">
          {isChecking ? null : error}
        </p>
      )}
      {showRenderCount && <RenderCount />}
    </div>
  );
}

/**
 * `memo` stops a field from being drawn again when the form is drawn again
 * for a reason that does not change this field. Without it, one new prop on
 * the form would draw all 300 fields.
 */
export const Field = memo(FieldInner);

/** Shown in place of a field whose type we do not know. The other fields still work. */
function UnsupportedField({ field, messages }: { field: FieldSchema; messages: FormMessages }) {
  useEffect(() => {
    warnOnce(`Form schema error: no component for the field type "${field.type}".`);
  }, [field.type]);

  return <p className="field field__unsupported">{messages.unsupportedField(field.type)}</p>;
}

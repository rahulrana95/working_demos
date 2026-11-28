/*
 * PART OF THE INTERVIEW: yes (about 6 minutes).
 * One small component for each kind of control, and a registry that maps a
 * field type from the schema to its component. A new field type is one new
 * component and one new line in the registry. The form itself does not change.
 */
import type { ChangeEvent, ComponentType, HTMLAttributes } from "react";
import type { FieldSchema, FieldType, FieldValue } from "./types";

export interface ControlProps {
  field: FieldSchema;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  /** The same for every control: id, name, `required`, the ARIA attributes and `onBlur`. */
  shared: HTMLAttributes<HTMLElement> & { name: string; required?: boolean; autoComplete?: string };
}

/** Text, email, number and long text are one component: they differ in two attributes. */
function TextControl({ field, value, onChange, shared }: ControlProps) {
  const props = {
    ...shared,
    className: "field__input",
    placeholder: field.placeholder,
    value: String(value),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };
  if (field.type === "textarea") return <textarea {...props} rows={3} />;

  // A number field is a text box that asks a phone for the number keys.
  // `type="number"` changes the value when the user scrolls over the box, and
  // it accepts the letter "e". Our own rule checks that the text is a number.
  const isNumber = field.type === "number";
  return (
    <input
      {...props}
      type={isNumber ? "text" : field.type}
      inputMode={isNumber ? "decimal" : undefined}
    />
  );
}

function SelectControl({ field, value, onChange, shared }: ControlProps) {
  return (
    <select
      {...shared}
      className="field__input"
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
    >
      {/* The empty choice lets the user leave an optional select without an answer. */}
      <option value="">{field.placeholder ?? "Select…"}</option>
      {(field.options ?? []).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function CheckboxControl({ value, onChange, shared }: ControlProps) {
  return (
    <input
      {...shared}
      className="field__checkbox"
      type="checkbox"
      checked={value === true}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

const CONTROLS: Record<FieldType, ComponentType<ControlProps>> = {
  text: TextControl,
  email: TextControl,
  number: TextControl,
  textarea: TextControl,
  select: SelectControl,
  checkbox: CheckboxControl,
};

/**
 * Finds the component for a field type. The schema comes from a server, so
 * the type can be one this code does not know. Then the answer is undefined.
 */
export function getControl(type: string): ComponentType<ControlProps> | undefined {
  // The own-property check stops a type like "constructor" from finding
  // something that every JavaScript object has.
  const isKnown = Object.prototype.hasOwnProperty.call(CONTROLS, type);
  return isKnown ? CONTROLS[type as FieldType] : undefined;
}

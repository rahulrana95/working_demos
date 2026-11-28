/*
 * PART OF THE INTERVIEW: yes (about 6 minutes).
 * One small component for each kind of control, and a registry that maps a
 * field type from the schema to its component. A new field type is one new
 * component and one new line in the registry. The form itself does not change.
 */
import type { ComponentType } from "react";
import type { FieldSchema, FieldType, FieldValue } from "./types";

export interface ControlProps {
  field: FieldSchema;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  /** The same for every control. Spread it on the element the user types in. */
  controlProps: {
    id: string;
    name: string;
    required: boolean | undefined;
    "aria-required": boolean | undefined;
    autoComplete: string | undefined;
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
    onBlur: () => void;
  };
}

function InputControl({ field, value, onChange, controlProps }: ControlProps) {
  // A number field is a text box that asks a phone for the number keys.
  // `type="number"` changes the value when the user scrolls over the box, and
  // it accepts the letter "e". Our own rule checks that the text is a number.
  const isNumber = field.type === "number";

  return (
    <input
      {...controlProps}
      className="field__input"
      type={isNumber ? "text" : field.type}
      inputMode={isNumber ? "decimal" : undefined}
      placeholder={field.placeholder}
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function TextareaControl({ field, value, onChange, controlProps }: ControlProps) {
  return (
    <textarea
      {...controlProps}
      className="field__input"
      rows={3}
      placeholder={field.placeholder}
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function SelectControl({ field, value, onChange, controlProps }: ControlProps) {
  return (
    <select
      {...controlProps}
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

function CheckboxControl({ value, onChange, controlProps }: ControlProps) {
  return (
    <input
      {...controlProps}
      className="field__checkbox"
      type="checkbox"
      checked={value === true}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

const CONTROLS: Record<FieldType, ComponentType<ControlProps>> = {
  text: InputControl,
  email: InputControl,
  number: InputControl,
  textarea: TextareaControl,
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
  return Object.prototype.hasOwnProperty.call(CONTROLS, type)
    ? CONTROLS[type as FieldType]
    : undefined;
}

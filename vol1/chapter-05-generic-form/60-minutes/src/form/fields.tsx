/*
 * PART OF THE INTERVIEW: yes (about 6 minutes).
 * One small component for each kind of control, and a registry that maps a
 * field type from the schema to its component. A new field type is one new
 * component and one new line in the registry. The form itself does not change.
 * The staff answer lets the page add its own types, and takes the text of the
 * empty choice from `messages`.
 */
import type { ComponentType } from "react";
import type { FormMessages } from "./messages";
import type { FieldSchema, FieldType, FieldValue } from "./types";

export interface ControlProps {
  field: FieldSchema;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  /** The same for every control. Spread it on the element the user types in. */
  controlProps: {
    /** Focus goes to the element with this id when the field has an error. */
    id: string;
    name: string;
    required: boolean | undefined;
    "aria-required": boolean | undefined;
    autoComplete: string | undefined;
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
    onBlur: () => void;
  };
  /** The id of the visible label. A group of controls, like radio buttons, names itself with it. */
  labelId: string;
  messages: FormMessages;
}

export interface FieldTypeDefinition {
  component: ComponentType<ControlProps>;
  /**
   * True when the component draws several controls, like radio buttons. Then
   * the form does not tie the label to one control. The component must put
   * `aria-labelledby={labelId}` on the element around its controls.
   */
  isGroup?: boolean;
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

function SelectControl({ field, value, onChange, controlProps, messages }: ControlProps) {
  return (
    <select
      {...controlProps}
      className="field__input"
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
    >
      {/* The empty choice lets the user leave an optional select without an answer. */}
      <option value="">{field.placeholder ?? messages.selectPlaceholder}</option>
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

export const BUILT_IN_FIELD_TYPES: Record<FieldType, FieldTypeDefinition> = {
  text: { component: InputControl },
  email: { component: InputControl },
  number: { component: InputControl },
  textarea: { component: TextareaControl },
  select: { component: SelectControl },
  checkbox: { component: CheckboxControl },
};

/**
 * Finds the definition of a field type. The schema comes from a server, so
 * the type can be one this code does not know. Then the answer is undefined.
 */
export function getFieldType(
  fieldTypes: Record<string, FieldTypeDefinition>,
  type: string,
): FieldTypeDefinition | undefined {
  // The own-property check stops a type like "constructor" from finding
  // something that every JavaScript object has.
  return Object.prototype.hasOwnProperty.call(fieldTypes, type) ? fieldTypes[type] : undefined;
}

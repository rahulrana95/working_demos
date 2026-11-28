/*
 * NOT PART OF THE INTERVIEW: production version.
 * One small component for each kind of control, and a registry that maps a
 * field type from the schema to its component. On top of the staff answer,
 * date fields and radio buttons are built in. A group is not in this list: it
 * is not one control, and `GroupField` draws it.
 */
import type { ComponentType } from "react";
import type { FormMessages } from "./messages";
import type { FieldSchema, FieldValue } from "./types";

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

function RadioControl({ field, value, onChange, controlProps, labelId }: ControlProps) {
  const { id, name, required, onBlur, autoComplete: _notForRadios, ...groupProps } = controlProps;

  return (
    <div {...groupProps} className="field__choices" role="radiogroup" aria-labelledby={labelId}>
      {(field.options ?? []).map((option, index) => (
        <label key={option.value} className="field__choice">
          <input
            // The first button has the id of the field, so focus goes there on an error.
            id={index === 0 ? id : undefined}
            type="radio"
            name={name}
            value={option.value}
            // The browser has the rule "one of these must be picked" for radio buttons too.
            required={required}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            onBlur={onBlur}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export const BUILT_IN_FIELD_TYPES: Record<string, FieldTypeDefinition> = {
  text: { component: InputControl },
  email: { component: InputControl },
  number: { component: InputControl },
  // The browser draws its own date picker, in the language of the user. The value is "2026-05-01".
  date: { component: InputControl },
  textarea: { component: TextareaControl },
  select: { component: SelectControl },
  radio: { component: RadioControl, isGroup: true },
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

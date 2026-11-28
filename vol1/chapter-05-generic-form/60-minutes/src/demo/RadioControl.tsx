/*
 * NOT PART OF THE INTERVIEW.
 * A field type that the form does not have. The demo page adds it with the
 * `fieldTypes` prop, to show that a team can do that without a change to the form.
 */
import type { ControlProps } from "../form";

export function RadioControl({ field, value, onChange, controlProps, labelId }: ControlProps) {
  const { id, name, required, onBlur, ...groupProps } = controlProps;

  return (
    <div
      {...groupProps}
      className="field__choices"
      role="radiogroup"
      aria-labelledby={labelId}
      aria-required={required}
    >
      {(field.options ?? []).map((option, index) => (
        <label key={option.value} className="field__choice">
          <input
            // The first button has the id of the field, so focus goes there on an error.
            id={index === 0 ? id : undefined}
            type="radio"
            name={name}
            value={option.value}
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

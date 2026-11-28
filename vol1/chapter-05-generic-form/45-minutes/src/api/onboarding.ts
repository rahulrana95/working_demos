/*
 * NOT PART OF THE INTERVIEW.
 * A fake server for the demo. It "sends" the form definition as plain data,
 * and it takes the submitted values after a short delay.
 */
import type { FieldSchema, FormSchema, FormValues } from "../form";

/** In a real product this object is the JSON body of `GET /forms/employee-onboarding`. */
export const onboardingSchema: FormSchema = {
  id: "employee-onboarding",
  title: "New employee",
  submitLabel: "Add employee",
  fields: [
    {
      name: "fullName",
      label: "Full name",
      type: "text",
      required: true,
      autoComplete: "name",
      rules: [{ type: "minLength", value: 2 }],
    },
    {
      name: "workEmail",
      label: "Work email",
      type: "email",
      required: true,
      autoComplete: "email",
      helpText: "We send the joining letter to this address.",
      rules: [{ type: "email" }],
    },
    {
      name: "employmentType",
      label: "Employment type",
      type: "select",
      required: true,
      options: [
        { value: "full-time", label: "Full-time" },
        { value: "contractor", label: "Contractor" },
      ],
    },
    {
      name: "companyName",
      label: "Company name",
      type: "text",
      required: true,
      helpText: "The company that sends us the invoice.",
      visibleWhen: { field: "employmentType", equals: "contractor" },
    },
    {
      name: "country",
      label: "Country",
      type: "select",
      options: [
        { value: "IN", label: "India" },
        { value: "US", label: "United States" },
        { value: "DE", label: "Germany" },
      ],
    },
    {
      name: "pan",
      label: "PAN",
      type: "text",
      helpText: "The 10-character tax number on the PAN card.",
      visibleWhen: { field: "country", equals: "IN" },
      rules: [
        {
          type: "pattern",
          value: "^[A-Z]{5}[0-9]{4}[A-Z]$",
          message: "PAN must be 5 capital letters, 4 digits and 1 capital letter, like ABCDE1234F.",
        },
      ],
    },
    {
      name: "yearsOfExperience",
      label: "Years of experience",
      type: "number",
      rules: [
        { type: "min", value: 0 },
        { type: "max", value: 50 },
      ],
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      rules: [{ type: "maxLength", value: 200 }],
    },
    {
      name: "terms",
      label: "Agreement to the terms of employment",
      type: "checkbox",
      required: true,
    },
  ],
};

/** A form with many fields, to measure how long one key press takes. */
export function createStressSchema(fieldCount: number): FormSchema {
  const fields: FieldSchema[] = [];

  for (let index = 1; index <= fieldCount; index += 1) {
    fields.push({
      name: `field${index}`,
      label: `Field ${index}`,
      type: "text",
      rules: [{ type: "maxLength", value: 20 }],
    });
  }

  return { id: `stress-${fieldCount}`, title: `${fieldCount} fields`, fields };
}

const DELAY_MS = 600;

export interface FakeServerOptions {
  /** Return true to make the next submit fail. */
  shouldFail: () => boolean;
}

/** Builds a submit function that answers after a short delay, like a real server. */
export function createSubmit({ shouldFail }: FakeServerOptions) {
  return (values: FormValues) =>
    new Promise<FormValues>((resolve, reject) => {
      setTimeout(() => {
        if (shouldFail()) {
          reject(new Error("The server did not respond"));
        } else {
          resolve(values);
        }
      }, DELAY_MS);
    });
}

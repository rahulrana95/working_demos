/*
 * NOT PART OF THE INTERVIEW.
 * A fake server for the demo. It "sends" the form definition as plain data,
 * it checks whether an email address is free, and it takes the submitted
 * values after a short delay.
 */
import type { AsyncValidator, FieldSchema, FormSchema, FormValues, SubmitErrors } from "../form";

/** The demo server says that this address already belongs to an employee. */
export const TAKEN_EMAIL = "taken@example.com";

/** The demo server refuses this company name when the form is submitted. */
export const REFUSED_COMPANY = "Acme";

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
      helpText: `We send the joining letter to this address. Try ${TAKEN_EMAIL}.`,
      rules: [{ type: "email" }],
      asyncRule: { name: "emailIsFree" },
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
      helpText: `The company that sends us the invoice. The server refuses “${REFUSED_COMPANY}”.`,
      visibleWhen: { field: "employmentType", equals: "contractor" },
    },
    {
      // "radio" is not a built-in type. The demo page adds it with `fieldTypes`.
      name: "workPlace",
      label: "Place of work",
      type: "radio",
      required: true,
      options: [
        { value: "office", label: "Office" },
        { value: "remote", label: "Remote" },
        { value: "hybrid", label: "Hybrid" },
      ],
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
      name: "taxId",
      label: "Tax ID of the company",
      type: "text",
      helpText: "Asked only from contractors outside India.",
      visibleWhen: {
        all: [
          { field: "employmentType", equals: "contractor" },
          { field: "country", in: ["US", "DE"] },
        ],
      },
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

/** A form with many fields, to show that typing stays fast. */
export function createStressSchema(fieldCount: number): FormSchema {
  const fields: FieldSchema[] = [
    { name: "showExtra", label: "Show the extra fields", type: "checkbox" },
  ];

  for (let index = 1; index <= fieldCount; index += 1) {
    fields.push({
      name: `field${index}`,
      label: `Field ${index}`,
      type: "text",
      rules: [{ type: "maxLength", value: 20 }],
      // Every tenth field depends on the tick box at the top.
      visibleWhen: index % 10 === 0 ? { field: "showExtra", equals: true } : undefined,
    });
  }

  return { id: `stress-${fieldCount}`, title: `${fieldCount} fields`, fields };
}

const SUBMIT_DELAY_MS = 600;
const CHECK_DELAY_MS = 500;

/** Answers after a delay, and stops early when the form cancels the check. */
export const checkEmailIsFree: AsyncValidator = (value, signal) =>
  new Promise((resolve, reject) => {
    const timerId = setTimeout(() => {
      const isTaken = String(value).trim().toLowerCase() === TAKEN_EMAIL;
      resolve(isTaken ? "An employee with this email address already exists." : null);
    }, CHECK_DELAY_MS);

    signal.addEventListener("abort", () => {
      clearTimeout(timerId);
      reject(new DOMException("The check was cancelled", "AbortError"));
    });
  });

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
          const errors: SubmitErrors = {
            formError: "The server is not available. Please try again in a minute.",
          };
          reject(errors);
        } else if (values.companyName === REFUSED_COMPANY) {
          const errors: SubmitErrors = {
            fieldErrors: {
              companyName: `${REFUSED_COMPANY} is not on the list of approved companies.`,
            },
          };
          reject(errors);
        } else {
          resolve(values);
        }
      }, SUBMIT_DELAY_MS);
    });
}

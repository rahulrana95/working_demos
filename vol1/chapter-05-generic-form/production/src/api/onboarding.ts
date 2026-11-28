/*
 * NOT PART OF THE INTERVIEW: production version.
 * A fake server for the demo. It "sends" the form definition as plain data,
 * it checks whether an email address is free, and it takes the submitted
 * values after a short delay.
 */
import type { AsyncValidator, FieldSchema, FormSchema, SubmitErrors, SubmitValues } from "../form";

/** The demo server says that this address already belongs to an employee. */
export const TAKEN_EMAIL = "taken@example.com";

/** The demo server refuses this company name when the form is submitted. */
export const REFUSED_COMPANY = "Acme";

/** In a real product this object is the JSON body of `GET /forms/employee-onboarding`. */
export const onboardingSchema: FormSchema = {
  id: "employee-onboarding",
  version: 3,
  title: "New employee",
  submitLabel: "Add employee",
  steps: [
    { title: "About you", fields: ["fullName", "workEmail", "dateOfBirth"] },
    {
      title: "The job",
      fields: [
        "employmentType",
        "companyName",
        "workPlace",
        "country",
        "pan",
        "taxId",
        "yearsOfExperience",
      ],
    },
    { title: "Pay and family", fields: ["bankAccount", "dependants", "notes", "terms"] },
  ],
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
      name: "dateOfBirth",
      label: "Date of birth",
      type: "date",
      autoComplete: "bday",
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
      autoComplete: "organization",
      helpText: `The company that sends us the invoice. The server refuses “${REFUSED_COMPANY}”.`,
      visibleWhen: { field: "employmentType", equals: "contractor" },
    },
    {
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
      autoComplete: "country",
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
      name: "bankAccount",
      label: "Bank account number",
      type: "text",
      required: true,
      // The browser must not offer to remember it, and the draft never holds it.
      autoComplete: "off",
      sensitive: true,
      helpText: "For the salary. It is not kept in the draft: after a reload you type it again.",
      rules: [{ type: "pattern", value: "^[0-9]{9,18}$", message: "Use 9 to 18 digits." }],
    },
    {
      name: "dependants",
      label: "Dependants",
      type: "group",
      itemLabel: "Dependant",
      helpText: "The family members on your health insurance. You can add up to 3.",
      maxItems: 3,
      fields: [
        { name: "name", label: "Name", type: "text", required: true },
        {
          name: "relation",
          label: "Relation",
          type: "select",
          required: true,
          options: [
            { value: "spouse", label: "Spouse" },
            { value: "child", label: "Child" },
            { value: "parent", label: "Parent" },
          ],
        },
        { name: "dateOfBirth", label: "Date of birth", type: "date" },
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

/** A schema with the mistakes that `checkSchema` finds. The demo shows its report. */
export const brokenSchema: FormSchema = {
  id: "broken-example",
  fields: [
    { name: "email", label: "Email", type: "email" },
    { name: "email", label: "Second email", type: "email" },
    { name: "team", label: "Team", type: "select" },
    {
      name: "code",
      label: "Code",
      type: "text",
      rules: [{ type: "pattern", value: "[A-Z" }],
      visibleWhen: { field: "badge", equals: true },
    },
    {
      name: "badge",
      label: "Has a badge",
      type: "checkbox",
      visibleWhen: { field: "code", equals: "X" },
    },
    {
      name: "nickname",
      label: "Nickname",
      type: "text",
      visibleWhen: { field: "firstName", notEquals: "" },
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
  return (values: SubmitValues, signal: AbortSignal) =>
    new Promise<SubmitValues>((resolve, reject) => {
      const timerId = setTimeout(() => {
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

      // A real `fetch` stops by itself when it gets the signal. The fake one does it by hand.
      signal.addEventListener("abort", () => clearTimeout(timerId));
    });
}

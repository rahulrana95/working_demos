/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you say these cases aloud. Here they are written as tests,
 * so you can see that the pure functions handle them.
 */
import { DEFAULT_MESSAGES } from "./messages";
import type { FormMessages } from "./messages";
import type { Condition, FieldSchema, FieldValue, FormSchema, FormValues } from "./types";
import {
  getErrorText,
  getInitialValues,
  getSubmitValues,
  isVisible,
  matchesCondition,
  validateField as validateFieldAsData,
  validateForm as validateFormAsData,
} from "./validation";

/** Checks a field and returns the text of its error, in the given texts. */
function validateFieldWithMessages(
  field: FieldSchema,
  value: FieldValue,
  messages: FormMessages,
): string | null {
  const error = validateFieldAsData(field, value);
  return error === null ? null : getErrorText(field, error, messages);
}

// Most tests read the English text of an error. These two helpers keep them short.
function validateField(field: FieldSchema, value: FieldValue): string | null {
  return validateFieldWithMessages(field, value, DEFAULT_MESSAGES);
}

function validateForm(schema: FormSchema, values: FormValues): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const [name, error] of Object.entries(validateFormAsData(schema, values))) {
    const field = schema.fields.find((candidate) => candidate.name === name);
    texts[name] = field === undefined ? "" : getErrorText(field, error, DEFAULT_MESSAGES);
  }
  return texts;
}

/** Builds a text field. Each test names only the parts it cares about. */
function makeField(overrides: Partial<FieldSchema> = {}): FieldSchema {
  return { name: "city", label: "City", type: "text", ...overrides };
}

const contractorSchema: FormSchema = {
  id: "test",
  fields: [
    { name: "kind", label: "Kind", type: "select" },
    {
      name: "company",
      label: "Company",
      type: "text",
      required: true,
      visibleWhen: { field: "kind", equals: "contractor" },
    },
    { name: "years", label: "Years", type: "number" },
  ],
};

describe("isVisible", () => {
  it("shows a field that has no condition", () => {
    expect(isVisible(makeField(), {})).toBe(true);
  });

  it("shows a field when the other field has the wanted value", () => {
    const field = makeField({ visibleWhen: { field: "kind", equals: "contractor" } });

    expect(isVisible(field, { kind: "contractor" })).toBe(true);
  });

  it("hides a field when the other field has another value", () => {
    const field = makeField({ visibleWhen: { field: "kind", equals: "contractor" } });

    expect(isVisible(field, { kind: "full-time" })).toBe(false);
  });

  it("hides a field when the other field does not exist", () => {
    const field = makeField({ visibleWhen: { field: "missing", equals: "x" } });

    expect(isVisible(field, {})).toBe(false);
  });

  it("can depend on a tick box", () => {
    const field = makeField({ visibleWhen: { field: "hasCar", equals: true } });

    expect(isVisible(field, { hasCar: true })).toBe(true);
    expect(isVisible(field, { hasCar: false })).toBe(false);
  });

  it("does not treat the text “true” as a ticked box", () => {
    const field = makeField({ visibleWhen: { field: "hasCar", equals: true } });

    expect(isVisible(field, { hasCar: "true" })).toBe(false);
  });
});

describe("matchesCondition", () => {
  const values: FormValues = { kind: "contractor", country: "DE", years: 3, hasCar: false };

  it("notEquals holds when the field has another value", () => {
    expect(matchesCondition({ field: "kind", notEquals: "full-time" }, values)).toBe(true);
    expect(matchesCondition({ field: "kind", notEquals: "contractor" }, values)).toBe(false);
  });

  it("notEquals holds when the field does not exist", () => {
    expect(matchesCondition({ field: "missing", notEquals: "x" }, values)).toBe(true);
  });

  it("in holds when the value is one of the list", () => {
    expect(matchesCondition({ field: "country", in: ["US", "DE"] }, values)).toBe(true);
    expect(matchesCondition({ field: "country", in: ["US", "IN"] }, values)).toBe(false);
  });

  it("in works with numbers and tick boxes, and never mixes them with text", () => {
    expect(matchesCondition({ field: "years", in: [1, 2, 3] }, values)).toBe(true);
    expect(matchesCondition({ field: "years", in: ["3"] }, values)).toBe(false);
    expect(matchesCondition({ field: "hasCar", in: [false] }, values)).toBe(true);
  });

  it("in does not hold for an empty list or a field that does not exist", () => {
    expect(matchesCondition({ field: "country", in: [] }, values)).toBe(false);
    expect(matchesCondition({ field: "missing", in: ["x"] }, values)).toBe(false);
  });

  it("all holds only when every part holds", () => {
    const both: Condition = {
      all: [
        { field: "kind", equals: "contractor" },
        { field: "country", in: ["US", "DE"] },
      ],
    };

    expect(matchesCondition(both, values)).toBe(true);
    expect(matchesCondition(both, { ...values, country: "IN" })).toBe(false);
  });

  it("any holds when one part holds", () => {
    const either: Condition = {
      any: [
        { field: "kind", equals: "intern" },
        { field: "country", equals: "DE" },
      ],
    };

    expect(matchesCondition(either, values)).toBe(true);
    expect(matchesCondition(either, { ...values, country: "IN" })).toBe(false);
  });

  it("an empty all holds, and an empty any does not", () => {
    expect(matchesCondition({ all: [] }, values)).toBe(true);
    expect(matchesCondition({ any: [] }, values)).toBe(false);
  });

  it("conditions can be inside each other", () => {
    const nested: Condition = {
      any: [
        { field: "kind", equals: "intern" },
        {
          all: [
            { field: "kind", equals: "contractor" },
            {
              any: [
                { field: "years", in: [3] },
                { field: "hasCar", equals: true },
              ],
            },
          ],
        },
      ],
    };

    expect(matchesCondition(nested, values)).toBe(true);
    expect(matchesCondition(nested, { ...values, years: 4 })).toBe(false);
  });

  it("decides whether a field is visible", () => {
    const field: FieldSchema = {
      name: "taxId",
      label: "Tax ID",
      type: "text",
      visibleWhen: { all: [{ field: "kind", equals: "contractor" }] },
    };

    expect(isVisible(field, values)).toBe(true);
    expect(isVisible(field, { kind: "full-time" })).toBe(false);
  });
});

describe("errors as data", () => {
  it("says which check failed, not a text", () => {
    const rule = { type: "minLength" as const, value: 2 };
    const field = makeField({ required: true, rules: [rule] });

    expect(validateFieldAsData(field, "")).toEqual({ type: "required" });
    expect(validateFieldAsData(field, "A")).toBe(rule);
    expect(validateFieldAsData(makeField({ type: "number" }), "x")).toEqual({ type: "number" });
    expect(validateFieldAsData(field, "Ab")).toBeNull();
  });

  it("uses the text that a server sent, as it is", () => {
    const error = { type: "server" as const, message: "Not on the list." };

    expect(getErrorText(makeField(), error, DEFAULT_MESSAGES)).toBe("Not on the list.");
  });

  it("still has a text for a server error that came without one", () => {
    expect(getErrorText(makeField(), { type: "async" }, DEFAULT_MESSAGES)).toBe(
      "City is not in the right format.",
    );
  });
});

describe("messages", () => {
  const shortMessages: FormMessages = {
    ...DEFAULT_MESSAGES,
    required: (label) => `Need ${label}`,
    number: (label) => `${label} number`,
    minLength: (label, count) => `${label} min ${count}`,
    maxLength: (label, count) => `${label} max ${count}`,
    min: (label, limit) => `${label} >= ${limit}`,
    max: (label, limit) => `${label} <= ${limit}`,
    email: (label) => `${label} email`,
    pattern: (label) => `${label} pattern`,
  };

  function check(overrides: Partial<FieldSchema>, value: FieldValue): string | null {
    return validateFieldWithMessages(
      { name: "a", label: "A", type: "text", ...overrides },
      value,
      shortMessages,
    );
  }

  it("takes every default error text from the messages, with the number of the rule", () => {
    expect(check({ required: true }, "")).toBe("Need A");
    expect(check({ type: "number" }, "x")).toBe("A number");
    expect(check({ rules: [{ type: "minLength", value: 4 }] }, "x")).toBe("A min 4");
    expect(check({ rules: [{ type: "maxLength", value: 2 }] }, "xyz")).toBe("A max 2");
    expect(check({ rules: [{ type: "min", value: 5 }] }, "1")).toBe("A >= 5");
    expect(check({ rules: [{ type: "max", value: 5 }] }, "9")).toBe("A <= 5");
    expect(check({ rules: [{ type: "email" }] }, "x")).toBe("A email");
    expect(check({ rules: [{ type: "pattern", value: "^y$" }] }, "x")).toBe("A pattern");
  });

  it("still prefers the message that the schema gives for one rule", () => {
    expect(check({ rules: [{ type: "email", message: "From the schema." }] }, "x")).toBe(
      "From the schema.",
    );
  });
});

describe("getInitialValues", () => {
  it("starts text, email, textarea, select and number fields as an empty text", () => {
    const schema: FormSchema = {
      id: "test",
      fields: [
        { name: "a", label: "A", type: "text" },
        { name: "b", label: "B", type: "email" },
        { name: "c", label: "C", type: "textarea" },
        { name: "d", label: "D", type: "select" },
        { name: "e", label: "E", type: "number" },
      ],
    };

    expect(getInitialValues(schema)).toEqual({ a: "", b: "", c: "", d: "", e: "" });
  });

  it("starts a tick box as not ticked", () => {
    const schema: FormSchema = {
      id: "test",
      fields: [{ name: "a", label: "A", type: "checkbox" }],
    };

    expect(getInitialValues(schema)).toEqual({ a: false });
  });

  it("uses the default value from the schema", () => {
    const schema: FormSchema = {
      id: "test",
      fields: [
        { name: "a", label: "A", type: "text", defaultValue: "Pune" },
        { name: "b", label: "B", type: "number", defaultValue: 0 },
        { name: "c", label: "C", type: "checkbox", defaultValue: true },
      ],
    };

    expect(getInitialValues(schema)).toEqual({ a: "Pune", b: 0, c: true });
  });

  it("returns an empty object for a form with no fields", () => {
    expect(getInitialValues({ id: "test", fields: [] })).toEqual({});
  });
});

describe("validateField: required", () => {
  it("fails an empty required field", () => {
    expect(validateField(makeField({ required: true }), "")).toBe("City is required.");
  });

  it("fails a required field that holds only spaces", () => {
    expect(validateField(makeField({ required: true }), "   ")).toBe("City is required.");
  });

  it("fails a required tick box that is not ticked", () => {
    const field = makeField({ type: "checkbox", label: "Terms", required: true });

    expect(validateField(field, false)).toBe("Terms is required.");
    expect(validateField(field, true)).toBeNull();
  });

  it("passes an empty field that is not required", () => {
    expect(validateField(makeField(), "")).toBeNull();
  });

  it("checks required before any other rule", () => {
    const field = makeField({ required: true, rules: [{ type: "minLength", value: 2 }] });

    expect(validateField(field, "")).toBe("City is required.");
  });

  it("does not run the rules on an empty optional field", () => {
    const field = makeField({
      rules: [
        { type: "minLength", value: 2 },
        { type: "email" },
        { type: "pattern", value: "^x$" },
      ],
    });

    expect(validateField(field, "")).toBeNull();
  });

  it("accepts the number 0 in a required number field", () => {
    expect(validateField(makeField({ type: "number", required: true }), 0)).toBeNull();
    expect(validateField(makeField({ type: "number", required: true }), "0")).toBeNull();
  });
});

describe("validateField: rules", () => {
  it("checks the shortest allowed text", () => {
    const field = makeField({ rules: [{ type: "minLength", value: 2 }] });

    expect(validateField(field, "A")).toBe("City must have at least 2 characters.");
    expect(validateField(field, "Ab")).toBeNull();
  });

  it("checks the longest allowed text", () => {
    const field = makeField({ rules: [{ type: "maxLength", value: 3 }] });

    expect(validateField(field, "Abcd")).toBe("City must have at most 3 characters.");
    expect(validateField(field, "Abc")).toBeNull();
  });

  it("compares a number field as a number, not as text", () => {
    const field = makeField({
      type: "number",
      label: "Years",
      rules: [{ type: "max", value: 50 }],
    });

    // As text, "9" comes after "50". As a number, 9 is smaller.
    expect(validateField(field, "9")).toBeNull();
    expect(validateField(field, "100")).toBe("Years must be 50 or less.");
  });

  it("refuses text that is not a plain number in a number field", () => {
    const field = makeField({ type: "number", label: "Years" });

    for (const text of ["seven", "1e5", "0x10", "7 years", "1,5", "--1", "."]) {
      expect(validateField(field, text)).toBe("Years must be a number.");
    }
  });

  it("accepts whole, decimal and negative numbers, with spaces around them", () => {
    const field = makeField({ type: "number", label: "Years" });

    for (const text of ["7", "7.5", "-3", "0", " 12 "]) {
      expect(validateField(field, text)).toBeNull();
    }
  });

  it("does not check the text of a field that is not a number field", () => {
    expect(validateField(makeField(), "seven")).toBeNull();
  });

  it("checks the smallest allowed number, and allows the limit itself", () => {
    const field = makeField({ type: "number", label: "Years", rules: [{ type: "min", value: 0 }] });

    expect(validateField(field, "-1")).toBe("Years must be 0 or more.");
    expect(validateField(field, "0")).toBeNull();
    expect(validateField(field, 0)).toBeNull();
  });

  it("checks an email address", () => {
    const field = makeField({ label: "Email", rules: [{ type: "email" }] });

    expect(validateField(field, "asha@example")).toBe(
      "Email must be an email address, like name@example.com.",
    );
    expect(validateField(field, "asha example@x.com")).not.toBeNull();
    expect(validateField(field, "asha@example.com")).toBeNull();
  });

  it("checks a pattern", () => {
    const field = makeField({
      label: "PAN",
      rules: [{ type: "pattern", value: "^[A-Z]{5}[0-9]{4}[A-Z]$" }],
    });

    expect(validateField(field, "abcde1234f")).toBe("PAN is not in the right format.");
    expect(validateField(field, "ABCDE1234F")).toBeNull();
  });

  it("uses the message of the rule when the schema gives one", () => {
    const field = makeField({
      rules: [{ type: "pattern", value: "^[A-Z]+$", message: "Use capital letters only." }],
    });

    expect(validateField(field, "pune")).toBe("Use capital letters only.");
  });

  it("returns the error of the first rule that fails", () => {
    const field = makeField({
      rules: [
        { type: "minLength", value: 5, message: "Too short." },
        { type: "pattern", value: "^[A-Z]+$", message: "Capital letters only." },
      ],
    });

    expect(validateField(field, "ab")).toBe("Too short.");
    expect(validateField(field, "abcdef")).toBe("Capital letters only.");
  });

  it("ignores a rule type it does not know", () => {
    const field = makeField({
      // A newer server can send a rule that this code has never seen.
      rules: [{ type: "phoneNumber" } as unknown as { type: "email" }],
    });

    expect(validateField(field, "anything")).toBeNull();
  });
});

describe("validateField: a broken pattern in the schema", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("does not crash and does not block the user", () => {
    const field = makeField({ rules: [{ type: "pattern", value: "([a-z" }] });

    expect(validateField(field, "pune")).toBeNull();
  });

  it("reports the broken pattern in the console one time only", () => {
    const field = makeField({ rules: [{ type: "pattern", value: "[0-9" }] });

    validateField(field, "1");
    validateField(field, "12");
    validateField(field, "123");

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("[0-9"));
  });

  it("still checks the rules that come after the broken one", () => {
    const field = makeField({
      rules: [
        { type: "pattern", value: "(((" },
        { type: "maxLength", value: 2 },
      ],
    });

    expect(validateField(field, "pune")).toBe("City must have at most 2 characters.");
  });
});

describe("validateForm", () => {
  it("returns one error for each field that is wrong", () => {
    const schema: FormSchema = {
      id: "test",
      fields: [
        { name: "a", label: "A", type: "text", required: true },
        { name: "b", label: "B", type: "text" },
        { name: "c", label: "C", type: "checkbox", required: true },
      ],
    };

    expect(validateForm(schema, { a: "", b: "", c: false })).toEqual({
      a: "A is required.",
      c: "C is required.",
    });
  });

  it("returns an empty object when everything is fine", () => {
    expect(validateForm(contractorSchema, { kind: "full-time", company: "", years: "" })).toEqual(
      {},
    );
  });

  it("does not check a hidden field", () => {
    expect(validateForm(contractorSchema, { kind: "", company: "", years: "" })).toEqual({});
  });

  it("checks the field again when it becomes visible", () => {
    expect(validateForm(contractorSchema, { kind: "contractor", company: "", years: "" })).toEqual({
      company: "Company is required.",
    });
  });

  it("treats a missing value as empty", () => {
    expect(validateForm(contractorSchema, { kind: "contractor" })).toEqual({
      company: "Company is required.",
    });
  });
});

describe("getSubmitValues", () => {
  it("leaves out the value of a hidden field", () => {
    const values = { kind: "full-time", company: "Old answer", years: "" };

    expect(getSubmitValues(contractorSchema, values)).toEqual({ kind: "full-time", years: "" });
  });

  it("sends the value of a field that is visible", () => {
    const values = { kind: "contractor", company: "Acme", years: "" };

    expect(getSubmitValues(contractorSchema, values)).toEqual({
      kind: "contractor",
      company: "Acme",
      years: "",
    });
  });

  it("sends a number field as a number", () => {
    const values = { kind: "", company: "", years: "12" };

    expect(getSubmitValues(contractorSchema, values)).toEqual({ kind: "", years: 12 });
  });

  it("sends an empty number field as an empty text, and 0 as the number 0", () => {
    expect(getSubmitValues(contractorSchema, { kind: "", years: "" })).toEqual({
      kind: "",
      years: "",
    });
    expect(getSubmitValues(contractorSchema, { kind: "", years: "0" })).toEqual({
      kind: "",
      years: 0,
    });
  });

  it("does not send values of fields that are not in the schema", () => {
    expect(getSubmitValues(contractorSchema, { kind: "", extra: "x" })).toEqual({
      kind: "",
      years: "",
    });
  });
});

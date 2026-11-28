/*
 * NOT PART OF THE INTERVIEW: production version.
 * In the interview you say these cases aloud and walk through one or two.
 * Here they are written as tests, so you can see that the code handles them.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Form } from "./Form";
import type { FormProps } from "./Form";
import type { ControlProps } from "./fields";
import type { AsyncValidator, FieldSchema, FormSchema, SubmitHandler, SubmitValues } from "./types";

const schema: FormSchema = {
  id: "test",
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
      name: "email",
      label: "Email",
      type: "email",
      required: true,
      helpText: "Your work address.",
      rules: [{ type: "email" }],
    },
    {
      name: "kind",
      label: "Kind",
      type: "select",
      options: [
        { value: "full-time", label: "Full-time" },
        { value: "contractor", label: "Contractor" },
      ],
    },
    {
      name: "company",
      label: "Company",
      type: "text",
      required: true,
      visibleWhen: { field: "kind", equals: "contractor" },
    },
    { name: "years", label: "Years", type: "number", rules: [{ type: "max", value: 50 }] },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "terms", label: "I agree", type: "checkbox", required: true },
  ],
};

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: Error) => void;
}

/** A promise that the test settles by hand, to control when the "server" answers. */
function createDeferred(): Deferred {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets promises settle and lets React finish its updates. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function renderForm(
  onSubmit: SubmitHandler = vi.fn(),
  formSchema: FormSchema = schema,
  props: Partial<FormProps> = {},
) {
  const view = render(<Form schema={formSchema} onSubmit={onSubmit} {...props} />);
  return { onSubmit, ...view };
}

/** Moves the fake clock forward and lets React finish its updates. */
async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function getControl(label: string): HTMLInputElement {
  return screen.getByLabelText(label, { exact: false }) as HTMLInputElement;
}

function type(label: string, text: string): void {
  fireEvent.change(getControl(label), { target: { value: text } });
}

/** Moves real focus into the field and out again, as the Tab key does. */
function visitAndLeave(label: string): void {
  act(() => {
    getControl(label).focus();
    getSubmitButton().focus();
  });
}

function getSubmitButton(): HTMLButtonElement {
  return screen.getByRole("button") as HTMLButtonElement;
}

function pressSubmit(): void {
  fireEvent.click(getSubmitButton());
}

function fillValidForm(): void {
  type("Full name", "Asha Rao");
  type("Email", "asha@example.com");
  fireEvent.click(getControl("I agree"));
}

function getSummaryTexts(): string[] {
  return within(screen.getByRole("alert"))
    .queryAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

describe("Form: drawing the schema", () => {
  it("draws one labelled control for each field, of the right kind", () => {
    renderForm();

    expect(getControl("Full name")).toHaveAttribute("type", "text");
    expect(getControl("Email")).toHaveAttribute("type", "email");
    expect(getControl("Kind").tagName).toBe("SELECT");
    expect(getControl("Notes").tagName).toBe("TEXTAREA");
    expect(getControl("I agree")).toHaveAttribute("type", "checkbox");
  });

  it("draws a number field as a text box with a decimal keypad, not as type “number”", () => {
    renderForm();

    expect(getControl("Years")).toHaveAttribute("type", "text");
    expect(getControl("Years")).toHaveAttribute("inputmode", "decimal");
    expect(getControl("Full name")).not.toHaveAttribute("inputmode");
  });

  it("passes the autofill hint of the schema to the control", () => {
    renderForm();

    expect(getControl("Full name")).toHaveAttribute("autocomplete", "name");
    expect(getControl("Email")).not.toHaveAttribute("autocomplete");
  });

  it("shows the title and names the form after it", () => {
    renderForm();

    expect(screen.getByRole("form", { name: "New employee" })).toBeInTheDocument();
  });

  it("uses the submit label of the schema, and “Submit” when there is none", () => {
    const { unmount } = renderForm();
    expect(getSubmitButton()).toHaveTextContent("Add employee");
    unmount();

    renderForm(vi.fn(), { id: "plain", fields: [] });
    expect(getSubmitButton()).toHaveTextContent("Submit");
  });

  it("draws the choices of a select, with an empty choice first", () => {
    renderForm();

    const options = within(getControl("Kind")).getAllByRole("option");

    expect(options.map((option) => option.textContent)).toEqual([
      "Select…",
      "Full-time",
      "Contractor",
    ]);
  });

  it("starts each field with its default value", () => {
    renderForm(vi.fn(), {
      id: "defaults",
      fields: [
        { name: "city", label: "City", type: "text", defaultValue: "Pune" },
        { name: "years", label: "Years", type: "number", defaultValue: 3 },
        { name: "news", label: "News", type: "checkbox", defaultValue: true },
      ],
    });

    expect(getControl("City")).toHaveValue("Pune");
    expect(getControl("Years")).toHaveValue("3");
    expect(getControl("News")).toBeChecked();
  });

  it("starts a number field empty, not with 0", () => {
    renderForm();

    expect(getControl("Years")).toHaveValue("");
  });

  it("turns off the error bubbles of the browser", () => {
    renderForm();

    expect(screen.getByRole("form")).toHaveAttribute("novalidate");
  });

  it("draws a form with no fields without a crash", () => {
    renderForm(vi.fn(), { id: "empty", fields: [] });

    expect(getSubmitButton()).toBeInTheDocument();
  });
});

describe("Form: a field type we do not know", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  function schemaWithUnknownType(type: string): FormSchema {
    return {
      id: "unknown",
      fields: [
        { name: "city", label: "City", type: "text" },
        // A newer server can send a type that this code has never seen.
        { name: "colour", label: "Colour", type: type as "text", required: true },
        { name: "shade", label: "Shade", type: type as "text" },
      ],
    };
  }

  it("shows a message in place of the field and still draws the other fields", () => {
    renderForm(vi.fn(), schemaWithUnknownType("colour-picker"));

    expect(screen.getAllByText("Unsupported field type: colour-picker")).toHaveLength(2);
    expect(getControl("City")).toBeInTheDocument();
  });

  it("warns in the console one time for the type, not one time for each field", () => {
    renderForm(vi.fn(), schemaWithUnknownType("star-rating"));

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("star-rating"));
  });

  it("does not let the unknown field block the submit, and does not send it", async () => {
    const { onSubmit } = renderForm(vi.fn(), schemaWithUnknownType("signature"));

    type("City", "Pune");
    pressSubmit();
    await flush();

    expect(onSubmit).toHaveBeenCalledWith({ city: "Pune" }, expect.any(AbortSignal));
  });

  it("treats a type like “constructor” as unknown too", () => {
    renderForm(vi.fn(), schemaWithUnknownType("constructor"));

    expect(screen.getAllByText("Unsupported field type: constructor")).toHaveLength(2);
  });
});

describe("Form: fields that depend on another field", () => {
  it("hides the field until the other field has the wanted value", () => {
    renderForm();

    expect(screen.queryByLabelText("Company", { exact: false })).not.toBeInTheDocument();

    type("Kind", "contractor");

    expect(getControl("Company")).toBeVisible();
  });

  it("hides the field again when the other field changes back", () => {
    renderForm();

    type("Kind", "contractor");
    type("Kind", "full-time");

    expect(screen.queryByLabelText("Company", { exact: false })).not.toBeInTheDocument();
  });

  it("does not check a hidden required field on submit", async () => {
    const { onSubmit } = renderForm();

    fillValidForm();
    pressSubmit();
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("checks the field on submit when it is visible", () => {
    const { onSubmit } = renderForm();

    fillValidForm();
    type("Kind", "contractor");
    pressSubmit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(getSummaryTexts()).toEqual(["Company is required."]);
    expect(getControl("Company")).toHaveFocus();
  });

  it("does not send the value of a field that was filled in and then hidden", async () => {
    const { onSubmit } = renderForm();

    fillValidForm();
    type("Kind", "contractor");
    type("Company", "Acme");
    type("Kind", "full-time");
    pressSubmit();
    await flush();

    expect(onSubmit).toHaveBeenCalledWith(
      {
        fullName: "Asha Rao",
        email: "asha@example.com",
        kind: "full-time",
        years: "",
        notes: "",
        terms: true,
      },
      expect.any(AbortSignal),
    );
  });

  it("keeps the typed value when the field is hidden and shown again", () => {
    renderForm();

    type("Kind", "contractor");
    type("Company", "Acme");
    type("Kind", "full-time");
    type("Kind", "contractor");

    expect(getControl("Company")).toHaveValue("Acme");
  });

  it("removes a hidden field from the error summary", () => {
    renderForm();

    fillValidForm();
    type("Kind", "contractor");
    pressSubmit();
    expect(getSummaryTexts()).toEqual(["Company is required."]);

    type("Kind", "full-time");

    expect(getSummaryTexts()).toEqual([]);
  });

  it("does not show an error at once on a field that appears after a failed submit", () => {
    renderForm();

    pressSubmit();
    type("Kind", "contractor");

    expect(getControl("Company")).not.toHaveAttribute("aria-invalid");
  });
});

describe("Form: when a field is checked", () => {
  it("shows no error while the user types in a field for the first time", () => {
    renderForm();

    type("Full name", "A");

    expect(screen.queryByText("Full name must have at least 2 characters.")).toBeNull();
    expect(getControl("Full name")).not.toHaveAttribute("aria-invalid");
  });

  it("checks the field when focus leaves it", () => {
    renderForm();

    type("Full name", "A");
    visitAndLeave("Full name");

    expect(screen.getByText("Full name must have at least 2 characters.")).toBeVisible();
  });

  it("shows “required” when the user leaves a required field empty", () => {
    renderForm();

    visitAndLeave("Email");

    expect(screen.getByText("Email is required.")).toBeVisible();
  });

  it("checks a field with an error on every change, so the error goes away as soon as it is fixed", () => {
    renderForm();

    visitAndLeave("Full name");
    expect(screen.getByText("Full name is required.")).toBeVisible();

    type("Full name", "A");
    expect(screen.getByText("Full name must have at least 2 characters.")).toBeVisible();

    type("Full name", "Asha");
    expect(screen.queryByText(/Full name must/)).toBeNull();
    expect(getControl("Full name")).not.toHaveAttribute("aria-invalid");
  });

  it("checks every field on every change after the first submit attempt", () => {
    renderForm();

    pressSubmit();
    type("Email", "asha@");

    expect(
      screen.getByText("Email must be an email address, like name@example.com."),
    ).toBeVisible();

    type("Email", "asha@example.com");

    expect(getControl("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("leaving one field does not show errors on the other fields", () => {
    renderForm();

    visitAndLeave("Full name");

    expect(getControl("Email")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Email is required.")).toBeNull();
  });

  it("compares a number field as a number", () => {
    renderForm();

    type("Years", "9");
    visitAndLeave("Years");
    expect(getControl("Years")).not.toHaveAttribute("aria-invalid");

    type("Years", "100");
    visitAndLeave("Years");
    expect(screen.getByText("Years must be 50 or less.")).toBeVisible();
  });

  it("says that a number field must hold a number", () => {
    renderForm();

    type("Years", "seven");
    visitAndLeave("Years");

    expect(screen.getByText("Years must be a number.")).toBeVisible();
  });

  it("waits for the next blur before it shows a new error on a field that was fine", () => {
    renderForm();

    type("Full name", "Asha");
    visitAndLeave("Full name");
    type("Full name", "A");

    // The field had no error, so the user is not told off in the middle of a word.
    expect(getControl("Full name")).not.toHaveAttribute("aria-invalid");

    visitAndLeave("Full name");

    expect(screen.getByText("Full name must have at least 2 characters.")).toBeVisible();
  });

  it("keeps the error of a field that is hidden and shown again with the same wrong value", () => {
    renderForm();

    type("Kind", "contractor");
    visitAndLeave("Company");
    type("Kind", "full-time");
    type("Kind", "contractor");

    expect(screen.getByText("Company is required.")).toBeVisible();
  });
});

describe("Form: submit", () => {
  it("shows the error summary and does not call onSubmit when the empty form is sent", () => {
    const { onSubmit } = renderForm();

    pressSubmit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Please fix these 3 problems:");
    expect(getSummaryTexts()).toEqual([
      "Full name is required.",
      "Email is required.",
      "I agree is required.",
    ]);
  });

  it("moves focus to the first field with an error", () => {
    renderForm();

    pressSubmit();

    expect(document.activeElement).toBe(getControl("Full name"));
  });

  it("moves focus to the first wrong field, also when it is not the first field", () => {
    renderForm();

    type("Full name", "Asha Rao");
    pressSubmit();

    expect(document.activeElement).toBe(getControl("Email"));
  });

  it("can move focus to a tick box", () => {
    renderForm();

    type("Full name", "Asha Rao");
    type("Email", "asha@example.com");
    pressSubmit();

    expect(document.activeElement).toBe(getControl("I agree"));
  });

  it("marks every wrong field after a failed submit, not only the first", () => {
    renderForm();

    pressSubmit();

    expect(getControl("Full name")).toHaveAttribute("aria-invalid", "true");
    expect(getControl("Email")).toHaveAttribute("aria-invalid", "true");
    expect(getControl("I agree")).toHaveAttribute("aria-invalid", "true");
    expect(getControl("Notes")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps the summary as it was while the user fixes a field", () => {
    renderForm();

    pressSubmit();
    type("Full name", "Asha Rao");

    // The summary is the result of the last attempt. If it changed on every
    // key press, a screen reader would read it out again and again.
    expect(getSummaryTexts()).toHaveLength(3);
  });

  it("sends the values when everything is right, with a number as a number", async () => {
    const { onSubmit } = renderForm();

    fillValidForm();
    type("Years", "7");
    type("Notes", "Joins in May");
    pressSubmit();
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      {
        fullName: "Asha Rao",
        email: "asha@example.com",
        kind: "",
        years: 7,
        notes: "Joins in May",
        terms: true,
      },
      expect.any(AbortSignal),
    );
  });

  it("clears the summary when the next attempt is right", async () => {
    renderForm();

    pressSubmit();
    fillValidForm();
    pressSubmit();
    await flush();

    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("works with an onSubmit that returns nothing", async () => {
    const received: SubmitValues[] = [];
    renderForm((values) => {
      received.push(values);
    });

    fillValidForm();
    pressSubmit();
    await flush();

    expect(received).toHaveLength(1);
    expect(getSubmitButton()).toHaveAttribute("aria-busy", "false");
  });

  it("shows a busy button while the server works, and never disables it", async () => {
    const pending = createDeferred();
    renderForm(() => pending.promise);

    expect(getSubmitButton()).toHaveAttribute("aria-busy", "false");
    expect(getSubmitButton()).toBeEnabled();

    fillValidForm();
    pressSubmit();
    await flush();

    expect(getSubmitButton()).toHaveAttribute("aria-busy", "true");
    expect(getSubmitButton()).toHaveTextContent("Sending…");
    expect(getSubmitButton()).toBeEnabled();

    pending.resolve();
    await flush();

    expect(getSubmitButton()).toHaveAttribute("aria-busy", "false");
    expect(getSubmitButton()).toHaveTextContent("Add employee");
  });

  it("ignores a second submit while the first is in flight", async () => {
    const pending = createDeferred();
    const onSubmit = vi.fn(() => pending.promise);
    renderForm(onSubmit);

    fillValidForm();
    pressSubmit();
    pressSubmit();
    await flush();
    pressSubmit();
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);

    pending.resolve();
    await flush();
  });

  it("allows a new submit after the first has finished", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit);

    fillValidForm();
    pressSubmit();
    await flush();
    pressSubmit();
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("shows an error for the whole form and keeps the values when the server fails", async () => {
    renderForm(vi.fn().mockRejectedValue(new Error("500")));

    fillValidForm();
    pressSubmit();
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not send the form. Your answers are still here. Please try again.",
    );
    expect(getControl("Full name")).toHaveValue("Asha Rao");
    expect(getControl("Email")).toHaveValue("asha@example.com");
    expect(getControl("I agree")).toBeChecked();
    expect(getSubmitButton()).toHaveAttribute("aria-busy", "false");
  });

  it("lets the user try again after a failure, and removes the error", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error("500"))
      .mockResolvedValueOnce(undefined);
    renderForm(onSubmit);

    fillValidForm();
    pressSubmit();
    await flush();
    pressSubmit();
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("does nothing wrong when the form is removed while the server works", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = createDeferred();
    const { unmount } = renderForm(() => pending.promise);

    fillValidForm();
    pressSubmit();
    await flush();
    unmount();
    pending.reject(new Error("500"));
    await flush();

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("Form: accessibility", () => {
  it("marks required fields for screen readers, and shows “(required)” to the eye only", () => {
    renderForm();

    expect(getControl("Full name")).toBeRequired();
    expect(getControl("Full name")).toHaveAttribute("aria-required", "true");
    expect(getControl("Notes")).not.toBeRequired();
    expect(getControl("Notes")).not.toHaveAttribute("aria-required");
    // The visible word is hidden from screen readers, so they do not hear "required" twice.
    expect(screen.getByRole("textbox", { name: "Full name" })).toBeInTheDocument();
    expect(screen.getByText("Full name", { exact: false })).toHaveTextContent(
      "Full name (required)",
    );
  });

  it("links the help text to its control", () => {
    renderForm();

    expect(getControl("Email")).toHaveAccessibleDescription("Your work address.");
  });

  it("links the error text to its control, after the help text", () => {
    renderForm();

    visitAndLeave("Email");

    expect(getControl("Email")).toHaveAttribute("aria-invalid", "true");
    expect(getControl("Email")).toHaveAccessibleDescription(
      "Your work address. Email is required.",
    );
  });

  it("has no description on a field with no help and no error", () => {
    renderForm();

    expect(getControl("Full name")).not.toHaveAttribute("aria-describedby");
  });

  it("keeps the alert box in the page while it is empty, so new text in it is read out", () => {
    renderForm();

    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("can be filled in with focus and keys only", async () => {
    const { onSubmit } = renderForm();

    act(() => getControl("Full name").focus());
    type("Full name", "Asha Rao");
    act(() => getControl("Email").focus());
    type("Email", "asha@example.com");
    act(() => getControl("I agree").focus());
    // Space on a tick box makes the browser send a click.
    fireEvent.click(document.activeElement as HTMLElement);
    act(() => getSubmitButton().focus());
    fireEvent.click(document.activeElement as HTMLElement);
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("Form: speed with many fields", () => {
  const FIELD_COUNT = 300;

  const bigSchema: FormSchema = {
    id: "big",
    fields: [
      { name: "showExtra", label: "Show extra", type: "checkbox" },
      ...Array.from({ length: FIELD_COUNT }, (_, index): FieldSchema => {
        const number = index + 1;
        return {
          name: `field${number}`,
          label: `Field ${number}`,
          type: "text",
          // Every tenth field depends on the tick box.
          visibleWhen: number % 10 === 0 ? { field: "showExtra", equals: true } : undefined,
        };
      }),
    ],
  };

  /** Reads the number that each field on screen shows: how many times it was drawn. */
  function getRenderCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    document.querySelectorAll(".field").forEach((fieldElement) => {
      const name = fieldElement.querySelector("input")?.name ?? "";
      counts[name] = Number(fieldElement.querySelector(".field__renders span")?.textContent);
    });
    return counts;
  }

  /** A search by label looks at all 300 labels and is slow. A search by name is not. */
  function getInputByName(name: string): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (input === null) {
      throw new Error(`No input with the name ${name}`);
    }
    return input;
  }

  function namesDrawnMoreThanOnce(): string[] {
    return Object.entries(getRenderCounts())
      .filter(([, count]) => count > 1)
      .map(([name]) => name);
  }

  it("draws every field one time at the start", () => {
    renderForm(vi.fn(), bigSchema, { showRenderCounts: true });

    const counts = Object.values(getRenderCounts());

    // 270 text fields and the tick box. The 30 dependent fields are hidden.
    expect(counts).toHaveLength(271);
    expect(counts.every((count) => count === 1)).toBe(true);
  });

  it("draws only the changed field again when the user types in one of 300 fields", () => {
    renderForm(vi.fn(), bigSchema, { showRenderCounts: true });

    const field7 = getInputByName("field7");
    fireEvent.change(field7, { target: { value: "a" } });
    fireEvent.change(field7, { target: { value: "ab" } });
    fireEvent.change(field7, { target: { value: "abc" } });

    expect(getRenderCounts().field7).toBe(4);
    expect(namesDrawnMoreThanOnce()).toEqual(["field7"]);
  });

  it("draws again only the fields whose visibility depends on the changed field", () => {
    renderForm(vi.fn(), bigSchema, { showRenderCounts: true });

    fireEvent.click(getInputByName("showExtra"));

    const counts = getRenderCounts();
    // The 30 dependent fields are new on screen. All other fields were left alone.
    expect(Object.keys(counts)).toHaveLength(301);
    expect(namesDrawnMoreThanOnce()).toEqual(["showExtra"]);
    expect(counts.field10).toBe(1);
  });

  it("does not draw the fields again when the page around the form is drawn again", () => {
    const onSubmit = vi.fn();
    const { rerender } = renderForm(onSubmit, bigSchema, { showRenderCounts: true });

    rerender(<Form schema={bigSchema} onSubmit={onSubmit} showRenderCounts />);
    rerender(<Form schema={bigSchema} onSubmit={vi.fn()} showRenderCounts />);

    expect(namesDrawnMoreThanOnce()).toEqual([]);
  });

  it("calls the newest onSubmit after the page gave the form a new one", async () => {
    const firstOnSubmit = vi.fn();
    const secondOnSubmit = vi.fn();
    const small: FormSchema = { id: "small", fields: [{ name: "a", label: "A", type: "text" }] };
    const { rerender } = renderForm(firstOnSubmit, small);

    rerender(<Form schema={small} onSubmit={secondOnSubmit} />);
    pressSubmit();
    await flush();

    expect(firstOnSubmit).not.toHaveBeenCalled();
    expect(secondOnSubmit).toHaveBeenCalledWith({ a: "" }, expect.any(AbortSignal));
  });
});

describe("Form: richer conditions", () => {
  const conditionSchema: FormSchema = {
    id: "conditions",
    fields: [
      { name: "kind", label: "Kind", type: "text" },
      { name: "country", label: "Country", type: "text" },
      {
        name: "taxId",
        label: "Tax ID",
        type: "text",
        required: true,
        visibleWhen: {
          all: [
            { field: "kind", equals: "contractor" },
            { field: "country", in: ["US", "DE"] },
          ],
        },
      },
      {
        name: "reason",
        label: "Reason",
        type: "text",
        visibleWhen: {
          any: [
            { field: "kind", equals: "intern" },
            { field: "country", notEquals: "" },
          ],
        },
      },
    ],
  };

  it("shows a field only when every part of an “all” condition holds", () => {
    renderForm(vi.fn(), conditionSchema);

    type("Kind", "contractor");
    expect(screen.queryByLabelText("Tax ID", { exact: false })).toBeNull();

    type("Country", "DE");
    expect(getControl("Tax ID")).toBeVisible();

    type("Country", "IN");
    expect(screen.queryByLabelText("Tax ID", { exact: false })).toBeNull();
  });

  it("shows a field when one part of an “any” condition holds", () => {
    renderForm(vi.fn(), conditionSchema);

    expect(screen.queryByLabelText("Reason")).toBeNull();

    type("Kind", "intern");
    expect(getControl("Reason")).toBeVisible();

    type("Kind", "");
    type("Country", "FR");
    expect(getControl("Reason")).toBeVisible();
  });

  it("does not send or check a field that such a condition hides", async () => {
    const { onSubmit } = renderForm(vi.fn(), conditionSchema);

    type("Kind", "contractor");
    type("Country", "DE");
    type("Tax ID", "DE123");
    type("Country", "");
    pressSubmit();
    await flush();

    expect(onSubmit).toHaveBeenCalledWith(
      { kind: "contractor", country: "" },
      expect.any(AbortSignal),
    );
  });
});

describe("Form: checks on the server", () => {
  const DEBOUNCE_MS = 300;

  const asyncSchema: FormSchema = {
    id: "async",
    fields: [
      {
        name: "email",
        label: "Email",
        type: "email",
        required: true,
        rules: [{ type: "email" }],
        asyncRule: { name: "emailIsFree" },
      },
      { name: "city", label: "City", type: "text" },
    ],
  };

  interface Check {
    value: string;
    signal: AbortSignal;
    answer: (error: string | null) => void;
    fail: () => void;
  }

  /** A validator that the test answers by hand, to control the order of the answers. */
  function createValidator() {
    const checks: Check[] = [];
    const validator: AsyncValidator = (value, signal) =>
      new Promise((resolve, reject) => {
        checks.push({
          value: String(value),
          signal,
          answer: resolve,
          fail: () => reject(new Error("offline")),
        });
      });
    return { checks, validator };
  }

  function renderAsyncForm(onSubmit: SubmitHandler = vi.fn()) {
    const { checks, validator } = createValidator();
    const view = renderForm(onSubmit, asyncSchema, {
      asyncValidators: { emailIsFree: validator },
    });
    return { ...view, checks };
  }

  /** The line that a screen reader reads out. It is hidden on screen. */
  function getStatus(): HTMLElement {
    return screen.getByRole("status");
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks the server one time, 300 ms after the last key press", async () => {
    const { checks } = renderAsyncForm();

    type("Email", "a@example.co");
    await wait(DEBOUNCE_MS - 1);
    type("Email", "a@example.com");
    await wait(DEBOUNCE_MS - 1);

    expect(checks).toHaveLength(0);

    await wait(1);

    expect(checks.map((check) => check.value)).toEqual(["a@example.com"]);
  });

  it("shows “Checking…” while it waits, and removes it after the answer", async () => {
    const { checks } = renderAsyncForm();

    type("Email", "a@example.com");

    expect(screen.getByText("Checking…", { selector: ".field__checking" })).toBeVisible();
    // A screen reader hears only the outcome, not "Checking…" after every key press.
    expect(screen.getByText("Checking…")).toHaveAttribute("aria-hidden", "true");
    expect(getStatus()).toBeEmptyDOMElement();

    await wait(DEBOUNCE_MS);
    checks[0].answer(null);
    await flush();

    expect(screen.queryByText("Checking…")).toBeNull();
    expect(getStatus()).toBeEmptyDOMElement();
    expect(getControl("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("shows the error of the server on the field, also before the user has left it", async () => {
    const { checks } = renderAsyncForm();

    type("Email", "taken@example.com");
    await wait(DEBOUNCE_MS);
    checks[0].answer("This address is taken.");
    await flush();

    expect(getControl("Email")).toHaveAttribute("aria-invalid", "true");
    expect(getControl("Email")).toHaveAccessibleDescription("This address is taken.");
    expect(getStatus()).toHaveTextContent("This address is taken.");
  });

  it("keeps the error of the server when focus leaves the field", async () => {
    const { checks } = renderAsyncForm();

    type("Email", "taken@example.com");
    await wait(DEBOUNCE_MS);
    checks[0].answer("This address is taken.");
    await flush();
    act(() => {
      getControl("Email").focus();
      getControl("City").focus();
    });

    expect(getControl("Email")).toHaveAccessibleDescription("This address is taken.");
  });

  it("removes the error of the server as soon as the user types again", async () => {
    const { checks } = renderAsyncForm();

    type("Email", "taken@example.com");
    await wait(DEBOUNCE_MS);
    checks[0].answer("This address is taken.");
    await flush();
    type("Email", "free@example.com");

    expect(getControl("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("never lets an old answer overwrite a newer one", async () => {
    const { checks } = renderAsyncForm();

    type("Email", "taken@example.com");
    await wait(DEBOUNCE_MS);
    type("Email", "free@example.com");
    await wait(DEBOUNCE_MS);

    // The newer check answers first. Then the old one arrives late.
    checks[1].answer(null);
    await flush();
    checks[0].answer("This address is taken.");
    await flush();

    expect(checks[0].signal.aborted).toBe(true);
    expect(getControl("Email")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("This address is taken.")).toBeNull();
  });

  it("keeps “Checking…” on screen when an old check ends while a newer one runs", async () => {
    const { checks } = renderAsyncForm();

    type("Email", "a@example.com");
    await wait(DEBOUNCE_MS);
    type("Email", "b@example.com");
    await wait(DEBOUNCE_MS);
    checks[0].answer(null);
    await flush();

    expect(screen.getByText("Checking…", { selector: ".field__checking" })).toBeVisible();
  });

  it("does not ask the server about a value that our own rules refuse, or an empty one", async () => {
    const { checks } = renderAsyncForm();

    type("Email", "not-an-email");
    await wait(DEBOUNCE_MS);
    type("Email", "");
    await wait(DEBOUNCE_MS);

    expect(checks).toHaveLength(0);
    expect(screen.queryByText("Checking…")).toBeNull();
  });

  it("submit waits for a check that is still running, then sends", async () => {
    const { checks, onSubmit } = renderAsyncForm();

    type("Email", "free@example.com");
    pressSubmit();
    await wait(DEBOUNCE_MS);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(getSubmitButton()).toHaveAttribute("aria-busy", "true");

    checks[0].answer(null);
    await flush();

    expect(onSubmit).toHaveBeenCalledWith(
      { email: "free@example.com", city: "" },
      expect.any(AbortSignal),
    );
  });

  it("submit does not send when the check it waited for finds an error", async () => {
    const { checks, onSubmit } = renderAsyncForm();

    type("Email", "taken@example.com");
    pressSubmit();
    await wait(DEBOUNCE_MS);
    checks[0].answer("This address is taken.");
    await flush();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(getSummaryTexts()).toEqual(["This address is taken."]);
    expect(getControl("Email")).toHaveFocus();
    expect(getSubmitButton()).toHaveAttribute("aria-busy", "false");
  });

  it("submit does not send while an error of the server is still on the field", async () => {
    const { checks, onSubmit } = renderAsyncForm();

    type("Email", "taken@example.com");
    await wait(DEBOUNCE_MS);
    checks[0].answer("This address is taken.");
    await flush();
    pressSubmit();
    await flush();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(getSummaryTexts()).toEqual(["This address is taken."]);
  });

  it("does not blame the user when the check itself fails", async () => {
    const { checks, onSubmit } = renderAsyncForm();

    type("Email", "a@example.com");
    await wait(DEBOUNCE_MS);
    checks[0].fail();
    await flush();

    expect(getControl("Email")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Checking…")).toBeNull();

    pressSubmit();
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("cancels the running check when the form is removed", async () => {
    const { checks, unmount } = renderAsyncForm();

    type("Email", "a@example.com");
    await wait(DEBOUNCE_MS);
    unmount();

    expect(checks[0].signal.aborted).toBe(true);
  });

  it("does not ask the server at all when the form is removed during the wait", async () => {
    const { checks, unmount } = renderAsyncForm();

    type("Email", "a@example.com");
    unmount();
    await wait(DEBOUNCE_MS);

    expect(checks).toHaveLength(0);
  });

  it("warns one time and does not block when the schema names a check that nobody gave", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { onSubmit } = renderForm(vi.fn(), asyncSchema);

    type("Email", "a@example.com");
    type("Email", "b@example.com");
    pressSubmit();
    await flush();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("emailIsFree"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});

describe("Form: errors that the server sends back", () => {
  it("shows a field error on its field and moves focus there", async () => {
    renderForm(vi.fn().mockRejectedValue({ fieldErrors: { email: "This address is blocked." } }));

    fillValidForm();
    pressSubmit();
    await flush();

    expect(getControl("Email")).toHaveAttribute("aria-invalid", "true");
    expect(getControl("Email")).toHaveAccessibleDescription(
      "Your work address. This address is blocked.",
    );
    expect(getSummaryTexts()).toEqual(["This address is blocked."]);
    expect(getControl("Email")).toHaveFocus();
    expect(getSubmitButton()).toHaveAttribute("aria-busy", "false");
  });

  it("keeps the error that onSubmit sent when focus leaves the field", async () => {
    renderForm(vi.fn().mockRejectedValue({ fieldErrors: { email: "This address is blocked." } }));

    fillValidForm();
    pressSubmit();
    await flush();
    visitAndLeave("Email");

    expect(getSummaryTexts()).toEqual(["This address is blocked."]);
    expect(getControl("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("moves focus to the first of several field errors, in the order of the form", async () => {
    renderForm(
      vi
        .fn()
        .mockRejectedValue({ fieldErrors: { notes: "Too rude.", fullName: "Not on the list." } }),
    );

    fillValidForm();
    pressSubmit();
    await flush();

    expect(getSummaryTexts()).toEqual(["Not on the list.", "Too rude."]);
    expect(getControl("Full name")).toHaveFocus();
  });

  it("removes the error of the server when the user changes that field", async () => {
    renderForm(vi.fn().mockRejectedValue({ fieldErrors: { email: "This address is blocked." } }));

    fillValidForm();
    pressSubmit();
    await flush();
    type("Email", "other@example.com");

    expect(getControl("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("shows the form error that the server sends", async () => {
    renderForm(vi.fn().mockRejectedValue({ formError: "Payroll is closed for this month." }));

    fillValidForm();
    pressSubmit();
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("Payroll is closed for this month.");
    expect(getControl("Full name")).toHaveValue("Asha Rao");
  });

  it("can show a form error and field errors together", async () => {
    renderForm(
      vi.fn().mockRejectedValue({ formError: "Not saved.", fieldErrors: { email: "Blocked." } }),
    );

    fillValidForm();
    pressSubmit();
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("Not saved.");
    expect(getSummaryTexts()).toEqual(["Blocked."]);
  });

  it("does not add the default text when the server sent field errors", async () => {
    renderForm(vi.fn().mockRejectedValue({ fieldErrors: { email: "Blocked." } }));

    fillValidForm();
    pressSubmit();
    await flush();

    expect(screen.getByRole("alert")).not.toHaveTextContent("We could not send the form.");
  });

  it("shows the default text when the only field error is for a field that is not on screen", async () => {
    renderForm(
      vi.fn().mockRejectedValue({ fieldErrors: { company: "Hidden.", nobody: "Unknown." } }),
    );

    fillValidForm();
    pressSubmit();
    await flush();

    expect(getSummaryTexts()).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent("We could not send the form.");
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a text", "500"],
    ["an Error", new Error("500")],
    ["field errors that are not texts", { fieldErrors: { email: 42, fullName: null } }],
    ["field errors that are not an object", { fieldErrors: "bad", formError: 7 }],
  ])("shows the default text when onSubmit rejects with %s", async (_name, reason) => {
    renderForm(vi.fn().mockRejectedValue(reason));

    fillValidForm();
    pressSubmit();
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not send the form. Your answers are still here. Please try again.",
    );
    expect(getSummaryTexts()).toEqual([]);
  });

  it("clears the errors of the server on the next submit", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce({ fieldErrors: { notes: "Too rude." }, formError: "Not saved." })
      .mockResolvedValueOnce(undefined);
    renderForm(onSubmit);

    fillValidForm();
    pressSubmit();
    await flush();
    // The server checks again. We do not keep its old answer.
    pressSubmit();
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(getControl("Notes")).not.toHaveAttribute("aria-invalid");
  });
});

describe("Form: the error summary", () => {
  it("lists each error as a link to its field", () => {
    renderForm();

    pressSubmit();

    const link = screen.getByRole("link", { name: "Email is required." });
    expect(link).toHaveAttribute("href", `#${getControl("Email").id}`);
  });

  it("moves focus to the field when the user follows a link", () => {
    renderForm();

    pressSubmit();
    const link = screen.getByRole("link", { name: "I agree is required." });
    act(() => link.focus());
    // Enter on a link makes the browser send a click.
    fireEvent.click(link);

    expect(getControl("I agree")).toHaveFocus();
  });
});

describe("Form: field types from the page", () => {
  function StarsControl({ value, onChange, controlProps }: ControlProps) {
    return (
      <input
        {...controlProps}
        type="range"
        min={0}
        max={5}
        value={Number(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    );
  }

  function ShoutingInput({ value, onChange, controlProps }: ControlProps) {
    return (
      <input
        {...controlProps}
        data-shouting="yes"
        value={String(value)}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
      />
    );
  }

  const starsSchema: FormSchema = {
    id: "stars",
    fields: [
      { name: "city", label: "City", type: "text" },
      {
        name: "stars",
        label: "Stars",
        type: "stars",
        defaultValue: 0,
        rules: [{ type: "min", value: 1, message: "Give at least one star." }],
      },
    ],
  };

  it("draws a type that the page added, with label, rules and submit like any field", async () => {
    const { onSubmit } = renderForm(vi.fn(), starsSchema, {
      fieldTypes: { stars: { component: StarsControl } },
    });

    expect(screen.getByRole("slider", { name: "Stars" })).toBeInTheDocument();

    pressSubmit();
    expect(getSummaryTexts()).toEqual(["Give at least one star."]);
    expect(screen.getByRole("slider")).toHaveFocus();

    fireEvent.change(screen.getByRole("slider"), { target: { value: "4" } });
    pressSubmit();
    await flush();

    expect(onSubmit).toHaveBeenCalledWith({ city: "", stars: 4 }, expect.any(AbortSignal));
  });

  it("shows “unsupported” for that type when the page did not add it", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    renderForm(vi.fn(), starsSchema);

    expect(screen.getByText("Unsupported field type: stars")).toBeVisible();
    consoleError.mockRestore();
  });

  it("lets the page replace a built-in type", () => {
    renderForm(vi.fn(), starsSchema, {
      fieldTypes: { text: { component: ShoutingInput }, stars: { component: StarsControl } },
    });

    type("City", "pune");

    expect(getControl("City")).toHaveAttribute("data-shouting", "yes");
    expect(getControl("City")).toHaveValue("PUNE");
  });
});

describe("Form: texts from the page", () => {
  it("uses the given texts and keeps English for the ones that are left out", () => {
    renderForm(vi.fn(), schema, {
      messages: {
        required: (label) => `${label}: यह ज़रूरी है।`,
        summaryTitle: (errorCount) => `गलतियाँ: ${errorCount}`,
        requiredMark: "(ज़रूरी)",
      },
    });

    pressSubmit();
    type("Full name", "A");

    expect(screen.getByRole("alert")).toHaveTextContent("गलतियाँ: 3");
    expect(getSummaryTexts()[1]).toBe("Email: यह ज़रूरी है।");
    expect(screen.getByText("Full name", { selector: "label", exact: false })).toHaveTextContent(
      "Full name (ज़रूरी)",
    );
    // This text was not given, so it stays in English, with the number of the rule.
    expect(getControl("Full name")).toHaveAccessibleDescription(
      "Full name must have at least 2 characters.",
    );
  });

  it("takes the texts of the button and of the empty choice from the messages", async () => {
    const pending = createDeferred();
    renderForm(
      () => pending.promise,
      { ...schema, submitLabel: undefined },
      {
        messages: { submit: "भेजें", submitting: "भेज रहे हैं…", selectPlaceholder: "चुनें…" },
      },
    );

    expect(getSubmitButton()).toHaveTextContent("भेजें");
    expect(within(getControl("Kind")).getAllByRole("option")[0]).toHaveTextContent("चुनें…");

    fillValidForm();
    pressSubmit();
    await flush();

    expect(getSubmitButton()).toHaveTextContent("भेज रहे हैं…");
    pending.resolve();
    await flush();
  });

  it("says “this problem” for one error and counts several", () => {
    renderForm();

    pressSubmit();
    expect(screen.getByRole("alert")).toHaveTextContent("Please fix these 3 problems:");

    type("Full name", "Asha Rao");
    type("Email", "asha@example.com");
    pressSubmit();
    expect(screen.getByRole("alert")).toHaveTextContent("Please fix this problem:");
  });

  it("shows new texts at once when the page changes them, for example the language", () => {
    const onSubmit = vi.fn();
    const hindi = { required: (label: string) => `${label}: यह ज़रूरी है।` };
    const { rerender } = renderForm(onSubmit);

    visitAndLeave("Full name");
    expect(getControl("Full name")).toHaveAccessibleDescription("Full name is required.");

    rerender(<Form schema={schema} onSubmit={onSubmit} messages={hindi} />);

    expect(getControl("Full name")).toHaveAccessibleDescription("Full name: यह ज़रूरी है।");
  });

  it("changes the language of the summary and of the default failure text too", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("500"));
    const hindi = {
      required: (label: string) => `${label}: यह ज़रूरी है।`,
      submitFailed: "फ़ॉर्म नहीं भेजा जा सका।",
    };
    const { rerender } = renderForm(onSubmit);

    pressSubmit();
    rerender(<Form schema={schema} onSubmit={onSubmit} messages={hindi} />);

    expect(getSummaryTexts()[0]).toBe("Full name: यह ज़रूरी है।");

    fillValidForm();
    pressSubmit();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("फ़ॉर्म नहीं भेजा जा सका।");

    rerender(<Form schema={schema} onSubmit={onSubmit} />);
    expect(screen.getByRole("alert")).toHaveTextContent("We could not send the form.");
  });
});

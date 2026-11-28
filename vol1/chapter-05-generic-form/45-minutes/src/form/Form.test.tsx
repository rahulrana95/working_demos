/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you say these cases aloud and walk through one or two.
 * Here they are written as tests, so you can see that the code handles them.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Form } from "./Form";
import type { FormSchema, FormValues } from "./types";
import type { SubmitHandler } from "./useForm";

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

function renderForm(onSubmit: SubmitHandler = vi.fn(), formSchema: FormSchema = schema) {
  const view = render(<Form schema={formSchema} onSubmit={onSubmit} />);
  return { onSubmit, ...view };
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

    expect(onSubmit).toHaveBeenCalledWith({ city: "Pune" });
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

    expect(onSubmit).toHaveBeenCalledWith({
      fullName: "Asha Rao",
      email: "asha@example.com",
      kind: "full-time",
      years: "",
      notes: "",
      terms: true,
    });
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
    expect(screen.getByRole("alert")).toHaveTextContent("Please fix these problems:");
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
    expect(onSubmit).toHaveBeenCalledWith({
      fullName: "Asha Rao",
      email: "asha@example.com",
      kind: "",
      years: 7,
      notes: "Joins in May",
      terms: true,
    });
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
    const received: FormValues[] = [];
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

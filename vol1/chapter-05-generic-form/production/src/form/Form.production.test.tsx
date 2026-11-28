/*
 * NOT PART OF THE INTERVIEW: production version.
 * Tests for what the production version adds to the staff answer: steps,
 * groups that repeat, the draft, the leave warning, time limits, the events
 * for monitoring and the check of the schema. `Form.test.tsx` has the tests
 * that the three folders share.
 */
import { StrictMode } from "react";
import { act, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { Form } from "./Form";
import type { FormProps } from "./Form";
import type { FormMonitorEvent, FormSchema, SubmitHandler } from "./types";

/** Lets promises settle and lets React finish its updates. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Moves the fake clock forward and lets React finish its updates. */
async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderForm(
  formSchema: FormSchema,
  onSubmit: SubmitHandler = vi.fn(),
  props: Partial<FormProps> = {},
) {
  const view = render(<Form schema={formSchema} onSubmit={onSubmit} {...props} />);
  return { onSubmit, ...view };
}

function getControl(label: string): HTMLInputElement {
  return screen.getByLabelText(label, { exact: false }) as HTMLInputElement;
}

function type(control: HTMLElement, text: string): void {
  fireEvent.change(control, { target: { value: text } });
}

function press(name: string): void {
  fireEvent.click(screen.getByRole("button", { name }));
}

function getSummaryTexts(): string[] {
  return within(screen.getByRole("alert"))
    .queryAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

function getDraft(schemaId: string): { values: Record<string, unknown>; itemCounts: unknown } {
  return JSON.parse(window.sessionStorage.getItem(`form-draft:${schemaId}`) ?? "null");
}

/** The event that is `position` places from the end. 1 is the last one. */
function fromEnd(events: FormMonitorEvent[], position: number): FormMonitorEvent | undefined {
  return events[events.length - position];
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

const stepsSchema: FormSchema = {
  id: "steps",
  submitLabel: "Send",
  steps: [
    { title: "You", fields: ["name", "email"] },
    { title: "Job", fields: ["kind", "company"] },
    { title: "Finish", fields: ["terms"] },
  ],
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", rules: [{ type: "email" }] },
    {
      name: "kind",
      label: "Kind",
      type: "select",
      options: [
        { value: "staff", label: "Staff" },
        { value: "contractor", label: "Contractor" },
      ],
    },
    {
      name: "company",
      label: "Company",
      type: "text",
      required: true,
      rules: [{ type: "minLength", value: 3 }],
      visibleWhen: { field: "kind", equals: "contractor" },
    },
    { name: "terms", label: "I agree", type: "checkbox", required: true },
  ],
};

describe("Form: steps", () => {
  function getCurrentStep(): string | null {
    const steps = within(screen.getByRole("list", { name: "Steps of this form" }));
    const current = steps.getAllByRole("listitem").filter((item) => item.ariaCurrent === "step");
    return current.length === 1 ? current[0].textContent : null;
  }

  function goToStepTwo(): void {
    type(getControl("Name"), "Asha");
    press("Next");
  }

  it("draws only the fields of the first step, and marks that step as the current one", () => {
    renderForm(stepsSchema);

    expect(getControl("Name")).toBeVisible();
    expect(screen.queryByLabelText("Kind")).toBeNull();
    expect(screen.queryByLabelText("I agree", { exact: false })).toBeNull();
    expect(getCurrentStep()).toBe("You");
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Step 1 of 3: You");
  });

  it("shows “Next” on every step but the last, and “Back” on every step but the first", () => {
    renderForm(stepsSchema);

    expect(screen.getByRole("button", { name: "Next" })).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();

    goToStepTwo();
    expect(screen.getByRole("button", { name: "Back" })).toHaveAttribute("type", "button");

    press("Next");
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("checks only the fields of the current step on “Next”, and stays there when one is wrong", () => {
    const { onSubmit } = renderForm(stepsSchema);

    press("Next");

    // "I agree" is required too, but it is on the last step.
    expect(getSummaryTexts()).toEqual(["Name is required."]);
    expect(getControl("Name")).toHaveFocus();
    expect(getCurrentStep()).toBe("You");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("moves to the next step when the current one is fine, and puts focus on its heading", () => {
    renderForm(stepsSchema);

    goToStepTwo();

    expect(getCurrentStep()).toBe("Job");
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Step 2 of 3: Job");
    expect(screen.getByRole("heading", { level: 3 })).toHaveFocus();
    expect(getControl("Kind")).toBeVisible();
    expect(screen.queryByLabelText("Name", { exact: false })).toBeNull();
  });

  it("empties the summary when the step changes", () => {
    renderForm(stepsSchema);

    press("Next");
    expect(getSummaryTexts()).toHaveLength(1);
    goToStepTwo();

    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("goes back without a check, keeps the answers, and puts focus on the heading", () => {
    renderForm(stepsSchema);

    goToStepTwo();
    type(getControl("Kind"), "contractor");
    press("Back");

    expect(getCurrentStep()).toBe("You");
    expect(screen.getByRole("heading", { level: 3 })).toHaveFocus();
    expect(getControl("Name")).toHaveValue("Asha");

    press("Next");
    expect(getControl("Kind")).toHaveValue("contractor");
  });

  it("treats Enter in a field as “Next”, and does not send the form before the last step", () => {
    const { onSubmit } = renderForm(stepsSchema);

    type(getControl("Name"), "Asha");
    // Enter in a text field makes the browser submit the form.
    fireEvent.submit(getControl("Name"));

    expect(getCurrentStep()).toBe("Job");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not check a field on a later step while the user types in it for the first time", () => {
    renderForm(stepsSchema);

    press("Next");
    goToStepTwo();
    type(getControl("Kind"), "contractor");
    type(getControl("Company"), "A");

    expect(getControl("Company")).not.toHaveAttribute("aria-invalid");
  });

  it("checks a field on every change after the user tried to leave its step", () => {
    renderForm(stepsSchema);

    goToStepTwo();
    type(getControl("Kind"), "contractor");
    press("Next");
    type(getControl("Company"), "A");

    expect(getControl("Company")).toHaveAccessibleDescription(
      "Company must have at least 3 characters.",
    );
  });

  it("sends the answers of all steps from the last step", async () => {
    const { onSubmit } = renderForm(stepsSchema);

    goToStepTwo();
    press("Next");
    fireEvent.click(getControl("I agree"));
    press("Send");
    await flush();

    expect(onSubmit).toHaveBeenCalledWith(
      { name: "Asha", email: "", kind: "", terms: true },
      expect.any(AbortSignal),
    );
  });

  it("takes the user back to the step of a field that the server refuses", async () => {
    renderForm(stepsSchema, vi.fn().mockRejectedValue({ fieldErrors: { name: "Already used." } }));

    goToStepTwo();
    press("Next");
    fireEvent.click(getControl("I agree"));
    press("Send");
    await flush();

    expect(getCurrentStep()).toBe("You");
    expect(getControl("Name")).toHaveFocus();
    expect(getControl("Name")).toHaveAccessibleDescription("Already used.");
  });

  it("shows the step of a field when the user follows its link in the summary", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue({ fieldErrors: { name: "Already used.", terms: "Read them first." } });
    renderForm(stepsSchema, onSubmit);

    goToStepTwo();
    press("Next");
    fireEvent.click(getControl("I agree"));
    press("Send");
    await flush();
    expect(getCurrentStep()).toBe("You");

    fireEvent.click(screen.getByRole("link", { name: "Read them first." }));

    expect(getCurrentStep()).toBe("Finish");
    expect(getControl("I agree")).toHaveFocus();
  });

  it("puts a field that no step names on the last step, so it is never lost", () => {
    renderForm(
      {
        id: "left-over",
        steps: [
          { title: "One", fields: ["a"] },
          { title: "Two", fields: ["b"] },
        ],
        fields: [
          { name: "a", label: "A", type: "text" },
          { name: "b", label: "B", type: "text" },
          { name: "c", label: "C", type: "text" },
        ],
      },
      vi.fn(),
      { showSchemaProblems: false },
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    press("Next");

    expect(getControl("B")).toBeVisible();
    expect(getControl("C")).toBeVisible();
  });

  it("shows no step list for a form without steps", () => {
    renderForm({ id: "plain", fields: [{ name: "a", label: "A", type: "text" }] });

    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });
});

const groupSchema: FormSchema = {
  id: "group",
  fields: [
    { name: "hasFamily", label: "Has family", type: "checkbox", defaultValue: true },
    {
      name: "kids",
      label: "Children",
      type: "group",
      itemLabel: "Child",
      helpText: "Add each child.",
      minItems: 1,
      maxItems: 3,
      visibleWhen: { field: "hasFamily", equals: true },
      fields: [
        { name: "name", label: "Name", type: "text", required: true },
        { name: "age", label: "Age", type: "number", rules: [{ type: "max", value: 25 }] },
      ],
    },
  ],
};

describe("Form: a group that repeats", () => {
  function getItem(position: number): HTMLElement {
    return screen.getByRole("group", { name: `Child ${position}` });
  }

  function getItemControl(position: number, label: string): HTMLInputElement {
    return within(getItem(position)).getByLabelText(label, { exact: false }) as HTMLInputElement;
  }

  it("starts with the smallest number of items, each one a named group of fields", () => {
    renderForm(groupSchema);

    expect(screen.getByRole("group", { name: "Children" })).toHaveAccessibleDescription(
      "Add each child.",
    );
    expect(getItemControl(1, "Name")).toBeVisible();
    expect(screen.queryByRole("group", { name: "Child 2" })).toBeNull();
  });

  it("adds an item and moves focus to its first field", () => {
    renderForm(groupSchema);

    press("Add child");

    expect(getItemControl(2, "Name")).toHaveFocus();
  });

  it("names each remove button after its item", () => {
    renderForm(groupSchema);

    press("Add child");

    expect(screen.getByRole("button", { name: "Remove child 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove child 2" })).toBeInTheDocument();
  });

  it("has no remove button when the group is at its smallest size", () => {
    renderForm(groupSchema);

    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  });

  it("keeps the answers of the other items when one is removed, and numbers them again", () => {
    renderForm(groupSchema);

    press("Add child");
    press("Add child");
    type(getItemControl(1, "Name"), "Ravi");
    type(getItemControl(2, "Name"), "Meena");
    type(getItemControl(3, "Name"), "Kiran");
    press("Remove child 2");

    expect(getItemControl(1, "Name")).toHaveValue("Ravi");
    expect(getItemControl(2, "Name")).toHaveValue("Kiran");
    expect(screen.queryByRole("group", { name: "Child 3" })).toBeNull();
  });

  it("moves focus to the remove button that takes the place of the removed one", () => {
    renderForm(groupSchema);

    press("Add child");
    press("Add child");
    press("Remove child 2");

    // The old third item is now the second.
    expect(screen.getByRole("button", { name: "Remove child 2" })).toHaveFocus();
  });

  it("moves focus to the remove button before it when the last item is removed", () => {
    renderForm(groupSchema);

    press("Add child");
    press("Add child");
    press("Remove child 3");

    expect(screen.getByRole("button", { name: "Remove child 2" })).toHaveFocus();
  });

  it("moves focus to “Add” when no item can be removed any more", () => {
    renderForm(groupSchema);

    press("Add child");
    press("Remove child 2");

    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Add child" })).toHaveFocus();
  });

  it("keeps “Add” reachable at the limit, says why it does nothing, and adds nothing", () => {
    renderForm(groupSchema);

    press("Add child");
    press("Add child");
    const addButton = screen.getByRole("button", { name: "Add child" });

    expect(addButton).toBeEnabled();
    expect(addButton).toHaveAttribute("aria-disabled", "true");
    expect(addButton).toHaveAccessibleDescription("You cannot add more than 3.");

    press("Add child");
    expect(screen.queryByRole("group", { name: "Child 4" })).toBeNull();

    press("Remove child 1");
    expect(screen.getByRole("button", { name: "Add child" })).not.toHaveAttribute("aria-disabled");
  });

  it("checks the fields of every item, and says in the summary which item is wrong", () => {
    const { onSubmit } = renderForm(groupSchema);

    press("Add child");
    type(getItemControl(1, "Name"), "Ravi");
    type(getItemControl(2, "Age"), "40");
    press("Submit");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(getSummaryTexts()).toEqual([
      "Child 2: Name is required.",
      "Child 2: Age must be 25 or less.",
    ]);
    expect(getItemControl(2, "Name")).toHaveFocus();
    expect(getItemControl(2, "Name")).toHaveAccessibleDescription("Name is required.");
    expect(getItemControl(1, "Name")).not.toHaveAttribute("aria-invalid");
  });

  it("takes an error out of the summary when its item is removed", () => {
    renderForm(groupSchema);

    press("Add child");
    type(getItemControl(1, "Name"), "Ravi");
    press("Submit");
    expect(getSummaryTexts()).toEqual(["Child 2: Name is required."]);

    press("Remove child 2");

    expect(getSummaryTexts()).toEqual([]);
  });

  it("sends a group as a list with one object for each item, in the order on screen", async () => {
    const { onSubmit } = renderForm(groupSchema);

    press("Add child");
    press("Add child");
    type(getItemControl(1, "Name"), "Ravi");
    type(getItemControl(1, "Age"), "7");
    type(getItemControl(2, "Name"), "Meena");
    type(getItemControl(3, "Name"), "Kiran");
    press("Remove child 2");
    press("Submit");
    await flush();

    expect(onSubmit).toHaveBeenCalledWith(
      {
        hasFamily: true,
        kids: [
          { name: "Ravi", age: 7 },
          { name: "Kiran", age: "" },
        ],
      },
      expect.any(AbortSignal),
    );
  });

  it("does not check or send a group that is hidden, and keeps its answers", async () => {
    const { onSubmit } = renderForm(groupSchema);

    fireEvent.click(getControl("Has family"));
    expect(screen.queryByRole("group", { name: "Children" })).toBeNull();

    press("Submit");
    await flush();
    expect(onSubmit).toHaveBeenCalledWith({ hasFamily: false }, expect.any(AbortSignal));

    fireEvent.click(getControl("Has family"));
    expect(getItemControl(1, "Name")).toBeVisible();
  });

  it("puts an error of the server on the right item, which it names by position", async () => {
    const onSubmit = vi.fn().mockRejectedValue({ fieldErrors: { "kids.1.name": "Not found." } });
    renderForm(groupSchema, onSubmit);

    press("Add child");
    press("Add child");
    type(getItemControl(1, "Name"), "Ravi");
    type(getItemControl(2, "Name"), "Meena");
    type(getItemControl(3, "Name"), "Kiran");
    // The first item is removed, so the internal ids no longer match the positions.
    press("Remove child 1");
    press("Submit");
    await flush();

    expect(getSummaryTexts()).toEqual(["Child 2: Not found."]);
    expect(getItemControl(2, "Name")).toHaveValue("Kiran");
    expect(getItemControl(2, "Name")).toHaveFocus();
  });

  it("shows a box for a field type in a group that nobody can draw, and does not send it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { onSubmit } = renderForm({
      id: "unknown-in-group",
      fields: [
        {
          name: "kids",
          label: "Children",
          type: "group",
          minItems: 1,
          fields: [
            { name: "name", label: "Name", type: "text" },
            { name: "photo", label: "Photo", type: "camera", required: true },
          ],
        },
      ],
    });

    expect(screen.getByText("Unsupported field type: camera")).toBeVisible();

    press("Submit");
    await flush();

    expect(onSubmit).toHaveBeenCalledWith({ kids: [{ name: "" }] }, expect.any(AbortSignal));
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("camera"));
  });
});

const draftSchema: FormSchema = {
  id: "draft",
  version: 2,
  fields: [
    { name: "name", label: "Your name", type: "text" },
    { name: "account", label: "Account", type: "text", sensitive: true },
    { name: "agree", label: "I agree", type: "checkbox" },
    {
      name: "kids",
      label: "Children",
      type: "group",
      itemLabel: "Child",
      maxItems: 2,
      fields: [
        { name: "name", label: "Child name", type: "text" },
        { name: "secret", label: "Child secret", type: "text", sensitive: true },
      ],
    },
  ],
};

describe("Form: the draft", () => {
  const DEBOUNCE_MS = 500;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  function renderDraftForm(onSubmit: SubmitHandler = vi.fn(), props: Partial<FormProps> = {}) {
    return renderForm(draftSchema, onSubmit, { saveDraft: true, ...props });
  }

  it("saves the answers a moment after the last change, not on every key press", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderDraftForm();

    type(getControl("Your name"), "A");
    await wait(DEBOUNCE_MS - 1);
    type(getControl("Your name"), "Asha");
    await wait(DEBOUNCE_MS - 1);
    expect(setItem).not.toHaveBeenCalled();

    await wait(1);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(getDraft("draft").values.name).toBe("Asha");
  });

  it("never saves a field that is marked as sensitive, also not inside a group", async () => {
    renderDraftForm();

    type(getControl("Account"), "1234567890");
    press("Add child");
    type(getControl("Child name"), "Ravi");
    type(getControl("Child secret"), "open-sesame");
    await wait(DEBOUNCE_MS);

    const saved = window.sessionStorage.getItem("form-draft:draft") ?? "";
    expect(saved).toContain("Ravi");
    expect(saved).not.toContain("1234567890");
    expect(saved).not.toContain("open-sesame");
    expect(Object.keys(getDraft("draft").values)).toEqual(["name", "agree", "kids.0.name"]);
  });

  it("brings the answers back when the form is opened again, with the items of a group", async () => {
    const { unmount } = renderDraftForm();
    type(getControl("Your name"), "Asha");
    fireEvent.click(getControl("I agree"));
    type(getControl("Account"), "1234567890");
    press("Add child");
    type(getControl("Child name"), "Ravi");
    await wait(DEBOUNCE_MS);
    unmount();

    renderDraftForm();

    expect(getControl("Your name")).toHaveValue("Asha");
    expect(getControl("I agree")).toBeChecked();
    expect(getControl("Child name")).toHaveValue("Ravi");
    // The sensitive field was never saved, so the user types it again.
    expect(getControl("Account")).toHaveValue("");
  });

  it("saves a change that still waits for its timer when the form is removed", () => {
    const { unmount } = renderDraftForm();

    type(getControl("Your name"), "Asha");
    unmount();

    expect(getDraft("draft").values.name).toBe("Asha");
  });

  it("throws away a draft that was saved for another version of the schema", async () => {
    const { unmount } = renderForm({ ...draftSchema, version: 1 }, vi.fn(), { saveDraft: true });
    type(getControl("Your name"), "Asha");
    await wait(DEBOUNCE_MS);
    unmount();

    renderDraftForm();

    expect(getControl("Your name")).toHaveValue("");
    expect(window.sessionStorage.getItem("form-draft:draft")).toBeNull();
  });

  it("removes the draft after the server took the form, and does not write it back", async () => {
    const { unmount } = renderDraftForm();

    type(getControl("Your name"), "Asha");
    await wait(DEBOUNCE_MS);
    type(getControl("Your name"), "Asha Rao");
    press("Submit");
    await flush();
    expect(window.sessionStorage.getItem("form-draft:draft")).toBeNull();

    await wait(DEBOUNCE_MS);
    unmount();
    expect(window.sessionStorage.getItem("form-draft:draft")).toBeNull();
  });

  it("keeps the draft when the server refuses the form", async () => {
    renderDraftForm(vi.fn().mockRejectedValue(new Error("500")));

    type(getControl("Your name"), "Asha");
    await wait(DEBOUNCE_MS);
    press("Submit");
    await flush();

    expect(getDraft("draft").values.name).toBe("Asha");
  });

  it("does not touch the storage when the page did not ask for a draft", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const { unmount } = renderForm(draftSchema);

    type(getControl("Your name"), "Asha");
    await wait(DEBOUNCE_MS);
    unmount();

    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
  });

  it("does not use a stored value of the wrong kind, or more items than the group allows", () => {
    window.sessionStorage.setItem(
      "form-draft:draft",
      JSON.stringify({
        version: 2,
        values: { name: 42, agree: "yes", account: "999", "kids.0.name": "Ravi", other: "x" },
        itemCounts: { kids: 50 },
      }),
    );

    renderDraftForm();

    expect(getControl("Your name")).toHaveValue("");
    expect(getControl("I agree")).not.toBeChecked();
    // A sensitive field is not read from a draft either, in case an old version saved it.
    expect(getControl("Account")).toHaveValue("");
    expect(screen.getAllByLabelText("Child name")).toHaveLength(2);
    expect(screen.getAllByLabelText("Child name")[0]).toHaveValue("Ravi");
  });

  it("works the same when the storage throws on every call", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { onSubmit } = renderDraftForm();

    type(getControl("Your name"), "Asha");
    await wait(DEBOUNCE_MS);
    press("Submit");
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("Form: the warning before the user leaves", () => {
  const schema: FormSchema = {
    id: "leave",
    fields: [{ name: "name", label: "Name", type: "text" }],
  };

  /** Sends the event that the browser sends before it leaves the page. True when the form asks for a warning. */
  function asksForWarning(): boolean {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it("does not listen while nothing was changed", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    renderForm(schema, vi.fn(), { warnBeforeLeave: true });

    expect(addEventListener).not.toHaveBeenCalledWith("beforeunload", expect.anything());
    expect(asksForWarning()).toBe(false);
  });

  it("asks for a warning after the first change", () => {
    renderForm(schema, vi.fn(), { warnBeforeLeave: true });

    type(getControl("Name"), "Asha");

    expect(asksForWarning()).toBe(true);
  });

  it("stops after the server took the form", async () => {
    renderForm(schema, vi.fn(), { warnBeforeLeave: true });

    type(getControl("Name"), "Asha");
    press("Submit");
    await flush();

    expect(asksForWarning()).toBe(false);
  });

  it("keeps asking when the server refused the form", async () => {
    renderForm(schema, vi.fn().mockRejectedValue(new Error("500")), { warnBeforeLeave: true });

    type(getControl("Name"), "Asha");
    press("Submit");
    await flush();

    expect(asksForWarning()).toBe(true);
  });

  it("stops when the form is removed from the page", () => {
    const { unmount } = renderForm(schema, vi.fn(), { warnBeforeLeave: true });

    type(getControl("Name"), "Asha");
    unmount();

    expect(asksForWarning()).toBe(false);
  });

  it("never asks when the page did not turn the warning on", () => {
    renderForm(schema);

    type(getControl("Name"), "Asha");

    expect(asksForWarning()).toBe(false);
  });

  it("asks at once when a draft with answers was brought back", () => {
    window.sessionStorage.setItem(
      "form-draft:leave",
      JSON.stringify({ version: 1, values: { name: "Asha" }, itemCounts: {} }),
    );

    renderForm(schema, vi.fn(), { warnBeforeLeave: true, saveDraft: true });

    expect(asksForWarning()).toBe(true);
  });
});

describe("Form: time limits", () => {
  const schema: FormSchema = {
    id: "limits",
    fields: [{ name: "email", label: "Email", type: "email", asyncRule: { name: "isFree" } }],
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("gives up an onSubmit that takes too long, aborts its signal and lets the user try again", async () => {
    const signals: AbortSignal[] = [];
    const onSubmit = vi.fn((_values: unknown, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<void>(() => {});
    });
    renderForm(schema, onSubmit, { submitTimeoutMs: 5000 });

    press("Submit");
    await wait(4999);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    expect(signals[0].aborted).toBe(false);

    await wait(1);

    expect(signals[0].aborted).toBe(true);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("alert")).toHaveTextContent("We could not send the form.");

    press("Submit");
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("ignores the answer of an onSubmit that comes after the time limit", async () => {
    let resolveLate = () => {};
    const events: FormMonitorEvent[] = [];
    const onSubmit = () =>
      new Promise<void>((resolve) => {
        resolveLate = resolve;
      });
    renderForm(schema, onSubmit, {
      submitTimeoutMs: 5000,
      onEvent: (event) => events.push(event),
    });

    press("Submit");
    await wait(5000);
    resolveLate();
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("We could not send the form.");
    expect(events.map((event) => event.type)).not.toContain("submit_succeeded");
  });

  it("stops the time limit when the server answers in time", async () => {
    renderForm(schema, vi.fn().mockResolvedValue(undefined), { submitTimeoutMs: 5000 });

    press("Submit");
    await flush();
    await wait(10_000);

    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("aborts the signal of onSubmit when the form is removed, and shows nothing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const signals: AbortSignal[] = [];
    const events: FormMonitorEvent[] = [];
    const onSubmit = (_values: unknown, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<void>(() => {});
    };
    const { unmount } = renderForm(schema, onSubmit, { onEvent: (event) => events.push(event) });

    press("Submit");
    await flush();
    unmount();
    await flush();

    expect(signals[0].aborted).toBe(true);
    expect(events.map((event) => event.type)).not.toContain("submit_failed");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("gives up a server check that takes too long, without an error on the field", async () => {
    const signals: AbortSignal[] = [];
    const isFree = (_value: unknown, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<string | null>(() => {});
    };
    const { onSubmit } = renderForm(schema, vi.fn(), {
      asyncValidators: { isFree },
      asyncTimeoutMs: 2000,
    });

    type(getControl("Email"), "asha@example.com");
    await wait(300);
    expect(screen.getByText("Checking…", { selector: ".field__checking" })).toBeVisible();

    await wait(2000);

    expect(screen.queryByText("Checking…", { selector: ".field__checking" })).toBeNull();
    expect(signals[0].aborted).toBe(true);
    expect(getControl("Email")).not.toHaveAttribute("aria-invalid");

    press("Submit");
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("ignores the answer of a server check that comes after its time limit", async () => {
    let answerLate: (message: string | null) => void = () => {};
    const isFree = () =>
      new Promise<string | null>((resolve) => {
        answerLate = resolve;
      });
    renderForm(schema, vi.fn(), { asyncValidators: { isFree }, asyncTimeoutMs: 2000 });

    type(getControl("Email"), "asha@example.com");
    await wait(2300);
    answerLate("This address is taken.");
    await flush();

    expect(getControl("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("does not crash when the check function throws at once", async () => {
    const isFree = () => {
      throw new Error("bug in the page");
    };
    renderForm(schema, vi.fn(), { asyncValidators: { isFree } });

    type(getControl("Email"), "asha@example.com");
    await wait(300);

    expect(screen.queryByText("Checking…", { selector: ".field__checking" })).toBeNull();
    expect(getControl("Email")).not.toHaveAttribute("aria-invalid");
  });
});

describe("Form: events for monitoring", () => {
  const schema: FormSchema = {
    id: "events",
    fields: [
      {
        name: "name",
        label: "Name",
        type: "text",
        required: true,
        rules: [{ type: "minLength", value: 3 }],
      },
      { name: "email", label: "Email", type: "email", asyncRule: { name: "isFree" } },
      {
        name: "kids",
        label: "Children",
        type: "group",
        itemLabel: "Child",
        fields: [{ name: "name", label: "Child name", type: "text", required: true }],
      },
    ],
  };

  function renderWithEvents(onSubmit: SubmitHandler = vi.fn(), props: Partial<FormProps> = {}) {
    const events: FormMonitorEvent[] = [];
    const view = renderForm(schema, onSubmit, { onEvent: (event) => events.push(event), ...props });
    return { events, ...view };
  }

  it("says one time that the form was viewed, also when React mounts it twice", () => {
    const events: FormMonitorEvent[] = [];
    render(
      <StrictMode>
        <Form schema={schema} onSubmit={vi.fn()} onEvent={(event) => events.push(event)} />
      </StrictMode>,
    );

    expect(events).toEqual([{ type: "form_viewed", formId: "events" }]);
  });

  it("reports an error of a field with the field name and the rule, when focus leaves it", () => {
    const { events } = renderWithEvents();

    act(() => {
      getControl("Name").focus();
      getControl("Email").focus();
    });

    expect(events[1]).toEqual({
      type: "field_error",
      formId: "events",
      field: "name",
      rule: "required",
    });
  });

  it("reports one error while the field stays wrong, and a new one when the rule changes", () => {
    const { events } = renderWithEvents();

    act(() => {
      getControl("Name").focus();
      getControl("Email").focus();
    });
    type(getControl("Name"), "A");
    type(getControl("Name"), "As");
    type(getControl("Name"), "Asha");

    const rules = events.flatMap((event) => (event.type === "field_error" ? [event.rule] : []));
    expect(rules).toEqual(["required", "minLength"]);
  });

  it("reports a failed attempt with the number of errors, and names a group field without its item", () => {
    const { events } = renderWithEvents();

    press("Add child");
    press("Submit");

    expect(events.map((event) => event.type)).toEqual([
      "form_viewed",
      "submit_attempted",
      "field_error",
      "field_error",
      "submit_failed",
    ]);
    expect(events[3]).toMatchObject({ field: "kids.name", rule: "required" });
    expect(events[4]).toMatchObject({ reason: "validation", errorCount: 2 });
  });

  it("reports a success with how long the server took and how long the form was open", async () => {
    vi.useFakeTimers();
    let resolveSubmit = () => {};
    const onSubmit = () =>
      new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      });
    const { events } = renderWithEvents(onSubmit);

    type(getControl("Name"), "Asha");
    await wait(4000);
    press("Submit");
    await wait(250);
    resolveSubmit();
    await flush();

    expect(fromEnd(events, 2)).toEqual({
      type: "submit_attempted",
      formId: "events",
      msSinceViewed: expect.any(Number),
    });
    const succeeded = fromEnd(events, 1);
    expect(succeeded).toMatchObject({ type: "submit_succeeded", formId: "events" });
    if (succeeded?.type === "submit_succeeded") {
      expect(succeeded.durationMs).toBeGreaterThanOrEqual(0);
      expect(succeeded.msSinceViewed).toBeGreaterThanOrEqual(succeeded.durationMs);
    }
  });

  it("reports a refusal of the server, with the errors on fields", async () => {
    const onSubmit = vi.fn().mockRejectedValue({ fieldErrors: { name: "Already used." } });
    const { events } = renderWithEvents(onSubmit);

    type(getControl("Name"), "Asha");
    press("Submit");
    await flush();

    expect(fromEnd(events, 2)).toMatchObject({
      type: "field_error",
      field: "name",
      rule: "server",
    });
    expect(fromEnd(events, 1)).toMatchObject({
      type: "submit_failed",
      reason: "server",
      errorCount: 1,
    });
  });

  it("reports a time-out as its own reason", async () => {
    vi.useFakeTimers();
    const { events } = renderWithEvents(() => new Promise<void>(() => {}), {
      submitTimeoutMs: 1000,
    });

    type(getControl("Name"), "Asha");
    press("Submit");
    await wait(1000);

    expect(fromEnd(events, 1)).toMatchObject({
      type: "submit_failed",
      reason: "timeout",
      errorCount: 0,
    });
  });

  it("never puts a value that the user typed, or a text from a server, in an event", async () => {
    vi.useFakeTimers();
    const isFree = vi.fn().mockResolvedValue("SECRET-ASYNC-TEXT is taken.");
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce({
        fieldErrors: { name: "SECRET-SERVER-TEXT" },
        formError: "SECRET-FORM-TEXT",
      })
      .mockResolvedValueOnce(undefined);
    const { events } = renderWithEvents(onSubmit, { asyncValidators: { isFree } });

    type(getControl("Name"), "SECRET-NAME");
    type(getControl("Email"), "secret-email@example.com");
    await wait(300);
    press("Add child");
    type(getControl("Child name"), "SECRET-CHILD");
    type(getControl("Email"), "secret-other@example.com");
    isFree.mockResolvedValue(null);
    await wait(300);
    press("Submit");
    await flush();
    press("Submit");
    await flush();

    const sent = JSON.stringify(events);
    expect(events.map((event) => event.type)).toContain("submit_succeeded");
    expect(events.filter((event) => event.type === "field_error")).toHaveLength(2);
    expect(sent.toLowerCase()).not.toContain("secret");
    // Every event has only these keys. A new key must be checked for values by hand.
    const allowedKeys = [
      "type",
      "formId",
      "field",
      "rule",
      "durationMs",
      "msSinceViewed",
      "reason",
      "errorCount",
    ];
    for (const event of events) {
      expect(allowedKeys).toEqual(expect.arrayContaining(Object.keys(event)));
    }
  });

  it("keeps working when the onEvent of the page throws", async () => {
    const { onSubmit } = renderForm(schema, vi.fn(), {
      onEvent: () => {
        throw new Error("the monitoring is down");
      },
    });

    type(getControl("Name"), "Asha");
    press("Submit");
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("calls the newest onEvent after the page gave the form a new one", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderForm(schema, vi.fn(), { onEvent: first });

    rerender(<Form schema={schema} onSubmit={vi.fn()} onEvent={second} />);
    press("Submit");

    expect(second).toHaveBeenCalledWith(expect.objectContaining({ type: "submit_attempted" }));
    expect(first).toHaveBeenCalledTimes(1);
  });
});

describe("Form: a schema with mistakes", () => {
  const broken: FormSchema = {
    id: "broken",
    fields: [
      { name: "email", label: "Email", type: "email" },
      { name: "email", label: "Second email", type: "email" },
      { name: "team", label: "Team", type: "select" },
    ],
  };
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows every problem in place of the form in development", () => {
    // Vitest runs in development mode, like `npm run dev`.
    renderForm(broken);

    expect(screen.getByRole("alert")).toHaveTextContent("The schema “broken” has problems.");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      'The field name "email" is used more than once.',
      '"team" is a select with no options.',
    ]);
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("still draws the form when the page turns the report off, as a production build does", () => {
    renderForm({ ...broken, id: "broken-in-production" }, vi.fn(), { showSchemaProblems: false });

    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(screen.getByLabelText("Team")).toBeInTheDocument();
  });

  it("writes each problem to the console one time, in both modes", () => {
    const { unmount } = renderForm({ ...broken, id: "broken-logged" });
    unmount();
    renderForm({ ...broken, id: "broken-logged" }, vi.fn(), { showSchemaProblems: false });

    const problems = consoleError.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.includes('"broken-logged"'));
    expect(problems).toEqual([
      'Form schema error in "broken-logged": The field name "email" is used more than once.',
      'Form schema error in "broken-logged": "team" is a select with no options.',
    ]);
  });

  it("draws a correct schema as a form, with no report", () => {
    renderForm({ id: "fine", fields: [{ name: "a", label: "A", type: "text" }] });

    expect(screen.queryByText(/The schema/)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("Form: date fields", () => {
  it("draws the date picker of the browser, and sends the date as text", async () => {
    const { onSubmit } = renderForm({
      id: "date",
      fields: [{ name: "start", label: "Start date", type: "date", required: true }],
    });

    expect(getControl("Start date")).toHaveAttribute("type", "date");

    type(getControl("Start date"), "2026-05-01");
    press("Submit");
    await flush();

    expect(onSubmit).toHaveBeenCalledWith({ start: "2026-05-01" }, expect.any(AbortSignal));
  });
});

describe("Form: Enter while a word is being composed", () => {
  const schema: FormSchema = { id: "ime", fields: [{ name: "name", label: "Name", type: "text" }] };

  function pressEnter(init: KeyboardEventInit): boolean {
    const event = createEvent.keyDown(getControl("Name"), { key: "Enter", ...init });
    fireEvent(getControl("Name"), event);
    return event.defaultPrevented;
  }

  it("stops an Enter that only takes a word from a Hindi, Japanese or Chinese keyboard", () => {
    renderForm(schema);

    expect(pressEnter({ isComposing: true })).toBe(true);
  });

  it("stops the same Enter in Safari, which marks it with the key code 229", () => {
    renderForm(schema);

    expect(pressEnter({ keyCode: 229 })).toBe(true);
  });

  it("lets a normal Enter through, so the browser can submit the form", () => {
    renderForm(schema);

    expect(pressEnter({ keyCode: 13 })).toBe(false);
  });
});

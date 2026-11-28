/*
 * NOT PART OF THE INTERVIEW: production version.
 * These tests prove that radio buttons work like any other field: label,
 * required, error, focus and submit.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Form } from "./Form";
import type { FormSchema } from "./types";

const schema: FormSchema = {
  id: "radio",
  fields: [
    {
      name: "place",
      label: "Place of work",
      type: "radio",
      required: true,
      helpText: "You can change it later.",
      options: [
        { value: "office", label: "Office" },
        { value: "remote", label: "Remote" },
      ],
    },
  ],
};

function renderRadioForm() {
  const onSubmit = vi.fn();
  render(<Form schema={schema} onSubmit={onSubmit} />);
  return { onSubmit };
}

describe("radio buttons, a built-in field type", () => {
  it("draws a named group with one radio button for each choice", () => {
    renderRadioForm();

    const group = screen.getByRole("radiogroup", { name: "Place of work" });

    expect(group).toHaveAttribute("aria-required", "true");
    expect(group).toHaveAccessibleDescription("You can change it later.");
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual([
      "office",
      "remote",
    ]);
  });

  it("does not use a <label> for the name of the group, so a click on it picks nothing", () => {
    renderRadioForm();

    fireEvent.click(screen.getByText("Place of work", { exact: false }));

    expect(screen.getByRole("radio", { name: "Office" })).not.toBeChecked();
  });

  it("marks the group as wrong and moves focus to the first button on a failed submit", () => {
    const { onSubmit } = renderRadioForm();

    fireEvent.click(screen.getByRole("button"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("radiogroup")).toHaveAccessibleDescription(
      "You can change it later. Place of work is required.",
    );
    expect(screen.getByRole("radio", { name: "Office" })).toHaveFocus();
  });

  it("sends the value of the chosen button", async () => {
    const { onSubmit } = renderRadioForm();

    fireEvent.click(screen.getByRole("radio", { name: "Remote" }));
    fireEvent.click(screen.getByRole("button"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledWith({ place: "remote" }, expect.any(AbortSignal));
  });
});

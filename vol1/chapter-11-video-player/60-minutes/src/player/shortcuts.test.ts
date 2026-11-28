/* NOT PART OF THE INTERVIEW. */
import { controlOwnsKey } from "./shortcuts";

function element(html: string): Element {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  // The holder has exactly the one element that the test wrote.
  return holder.firstElementChild!;
}

describe("controlOwnsKey", () => {
  it("leaves Space and Enter to a focused button, so Space does not also play", () => {
    const button = element("<button>Mute</button>");

    expect(controlOwnsKey(button, " ")).toBe(true);
    expect(controlOwnsKey(button, "Enter")).toBe(true);
    expect(controlOwnsKey(button, "k")).toBe(false);
    expect(controlOwnsKey(button, "ArrowRight")).toBe(false);
  });

  it("leaves the arrows, Home and End to a focused slider", () => {
    const slider = element('<input type="range" />');

    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]) {
      expect(controlOwnsKey(slider, key)).toBe(true);
    }
    expect(controlOwnsKey(slider, " ")).toBe(false);
    expect(controlOwnsKey(slider, "m")).toBe(false);
  });

  it.each([
    '<input type="text" />',
    "<input />",
    "<textarea></textarea>",
    "<select></select>",
    '<div contenteditable="true"></div>',
  ])("leaves every key to %s, so the user can type", (html) => {
    const field = element(html);

    for (const key of ["k", "m", " ", "ArrowLeft", "Home"]) {
      expect(controlOwnsKey(field, key)).toBe(true);
    }
  });

  it("owns no key for the player itself or the video", () => {
    expect(controlOwnsKey(element("<div></div>"), " ")).toBe(false);
    expect(controlOwnsKey(element("<video></video>"), "ArrowLeft")).toBe(false);
  });
});

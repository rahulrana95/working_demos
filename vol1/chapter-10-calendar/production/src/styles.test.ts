/*
 * NOT PART OF THE INTERVIEW: production version.
 * These tests read the CSS text. They prove the rules that the calendar
 * needs for touch, for iPhone, for high-contrast mode and for paper are there.
 */
/// <reference types="vite/client" />
import { HOUR_HEIGHT } from "./calendar";
import styles from "./styles.css?raw";

/** Removes the comments, so words in a comment do not count. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("styles", () => {
  const css = withoutComments(styles);
  const calendarCss = css.slice(css.indexOf(".calendar {"));
  const highContrast = css.split("@media (forced-colors: active)")[1].split("@media print")[0];
  const print = css.split("@media print")[1];

  it("makes a slot as tall as one hour of the layout, which is more than 44px", () => {
    expect(css).toMatch(
      new RegExp(
        `\\[role="gridcell"\\] > button:not\\(\\[data-day\\]\\)\\s*{[^}]*height: ${HOUR_HEIGHT}px`,
      ),
    );
    expect(HOUR_HEIGHT).toBeGreaterThanOrEqual(44);
  });

  it("marks an event with a real border, which high-contrast mode keeps", () => {
    expect(css).toMatch(/\.calendar__event,\s*\.calendar__more\s*{[^}]*border: 1px solid/);
    expect(highContrast).toMatch(
      /\.calendar__event,\s*\.calendar__more\s*{\s*border-color: ButtonText/,
    );
  });

  it("shows focus with an outline, not with a shadow", () => {
    expect(css).toMatch(/button:focus-visible[^{]*{[^}]*outline: 3px solid/);
    expect(css).not.toMatch(/box-shadow/);
  });

  it("lets a click between two events fall through to the slot under the lists", () => {
    expect(css).toMatch(/\.calendar__lists\s*{[^}]*pointer-events: none/);
    expect(css).toMatch(/\.calendar__lists li\s*{[^}]*pointer-events: auto/);
  });

  it("keeps a strip free beside the events, so a slot can be clicked in a full hour", () => {
    expect(css).toMatch(/\.calendar__lists ol\s*{[^}]*margin-inline: 52px 8px/);
  });

  it("starts the lists of events below the row of day names", () => {
    expect(css).toMatch(/\[role="columnheader"\]\s*{[^}]*height: 32px/);
    expect(css).toMatch(/\.calendar__lists\s*{[^}]*inset-block: 32px 0/);
  });

  it("keeps the row of day names on screen while the hours scroll", () => {
    expect(css).toMatch(/\.calendar__scroll\s*{[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.calendar__scroll \[role="row"\]:first-child\s*{[^}]*position: sticky/);
  });

  it("lets a finger drag an event: the browser must not take the touch for scrolling", () => {
    expect(css).toMatch(/\.calendar__lists \.calendar__event\s*{[^}]*touch-action: none/);
    expect(css).toMatch(/\.calendar__lists \.calendar__event\s*{[^}]*user-select: none/);
  });

  it("marks the event that is being moved by the style of its border, not by colour alone", () => {
    expect(css).toMatch(/\.calendar__event\.is-moving\s*{[^}]*border-style: dashed/);
  });

  it("makes the '+N more' box look different from an event by its border", () => {
    expect(css).toMatch(/\.calendar__more\s*{[^}]*border-style: dashed/);
  });

  it("draws the line for the present time and the mark for today as borders, which high-contrast mode keeps", () => {
    expect(css).toMatch(/li\.calendar__now\s*{[^}]*border-block-start: 2px solid/);
    expect(css).toMatch(/\[aria-current="date"\]\s*{[^}]*border-block-end: 3px solid/);
    expect(highContrast).toMatch(/li\.calendar__now,[^{]*{\s*border-color: Highlight/);
  });

  it("does not let the line for the present time take clicks", () => {
    expect(css).toMatch(/li\.calendar__now\s*{[^}]*pointer-events: none/);
  });

  it("uses logical properties in the calendar rules, so the layout mirrors in right-to-left pages", () => {
    expect(calendarCss).not.toMatch(
      /(margin|padding|border)-(left|right)|[^-](left|right|top|bottom):/,
    );
    expect(calendarCss).not.toMatch(/text-align: (left|right)/);
  });

  it("keeps the text of the inputs at 16px or more, so Safari on iPhone does not zoom", () => {
    expect(css).toMatch(/\.calendar__form select\s*{[^}]*font-size: max\(16px, 1em\)/);
  });

  it("makes the inputs and the buttons at least 44px tall, so a finger can hit them", () => {
    expect(css).toMatch(/\.calendar__form select\s*{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.calendar__form button,[^{]*{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.calendar__form \.calendar__check\s*{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.calendar__daynumber\s*{[^}]*min-height: 44px/);
  });

  it("marks an error with a border, not by colour alone", () => {
    expect(css).toMatch(/\.calendar \[role="alert"\],[^{]*{[^}]*border: 1px solid/);
  });

  it("hides the status text for screen readers without removing it from them", () => {
    expect(css).toMatch(/\.visually-hidden\s*{[^}]*clip: rect\(0 0 0 0\)/);
    expect(css).not.toMatch(/\.visually-hidden\s*{[^}]*display: none/);
  });

  describe("on paper", () => {
    it("leaves out the form, the page controls and the messages about the connection", () => {
      const hidden = /{([^{]*){\s*display: none/.exec(print)?.[1] ?? "";

      for (const selector of [".page__nav", ".panel", ".calendar__form", ".calendar__waiting"]) {
        expect(hidden).toContain(selector);
      }
    });

    it("prints the whole day, not only the hours that were on screen", () => {
      expect(print).toMatch(/\.calendar__scroll\s*{[^}]*max-height: none/);
      expect(print).toMatch(/\.calendar__scroll\s*{[^}]*overflow: visible/);
    });

    it("does not cut an event in two at the end of a page", () => {
      expect(print).toMatch(/\.calendar__lists li,[^{]*{\s*break-inside: avoid/);
    });

    it("keeps the box of an event visible without its background", () => {
      expect(print).toMatch(/\.calendar__event\s*{[^}]*border-color: #000000/);
    });
  });
});

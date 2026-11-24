/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you say these cases aloud and walk through one or two.
 * Here they are written as tests, so you can see that the code handles them.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Typeahead } from "./Typeahead";
import type { SearchFn } from "./types";

const DEBOUNCE_MS = 250;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

/** A promise that the test resolves by hand, to control the order of responses. */
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Moves the fake clock forward and lets React finish its updates. */
async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderTypeahead(search: SearchFn<string>) {
  const onSelect = vi.fn();

  render(
    <Typeahead
      label="City"
      search={search}
      getItemLabel={(city) => city}
      getItemKey={(city) => city}
      onSelect={onSelect}
      debounceMs={DEBOUNCE_MS}
    />,
  );

  const input = screen.getByRole("combobox", { name: "City" }) as HTMLInputElement;
  const type = (text: string) => fireEvent.change(input, { target: { value: text } });
  const press = (key: string) => fireEvent.keyDown(input, { key });

  return { input, type, press, onSelect };
}

/** Types the text, waits for the debounce, and waits for the answer. */
async function typeAndWait(type: (text: string) => void, text: string): Promise<void> {
  type(text);
  await wait(DEBOUNCE_MS);
}

function getOptionTexts(): string[] {
  return screen.queryAllByRole("option").map((option) => option.textContent ?? "");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Typeahead: searching", () => {
  it("starts closed and has not called the server", () => {
    const search = vi.fn().mockResolvedValue([]);
    const { input } = renderTypeahead(search);

    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(search).not.toHaveBeenCalled();
  });

  it("does not search until the user has typed two characters", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    const { type } = renderTypeahead(search);

    await typeAndWait(type, "m");

    expect(search).not.toHaveBeenCalled();
  });

  it("counts characters after removing the spaces around the text", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    const { type } = renderTypeahead(search);

    await typeAndWait(type, "  m  ");

    expect(search).not.toHaveBeenCalled();
  });

  it("sends one request when the user types fast", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    const { type } = renderTypeahead(search);

    type("mu");
    await wait(DEBOUNCE_MS - 1);
    type("mum");
    await wait(DEBOUNCE_MS - 1);
    type("mumb");
    await wait(DEBOUNCE_MS);

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("mumb", expect.any(AbortSignal));
  });

  it("shows the results and marks the input as expanded", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai", "Munnar"]);
    const { input, type } = renderTypeahead(search);

    await typeAndWait(type, "mu");

    expect(getOptionTexts()).toEqual(["Mumbai", "Munnar"]);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("status")).toHaveTextContent("2 results available");
  });

  it("shows a loading message while the first request is in flight", async () => {
    const pending = createDeferred<string[]>();
    const { input, type } = renderTypeahead(() => pending.promise);

    await typeAndWait(type, "mu");

    expect(screen.getByText("Searching…")).toBeVisible();
    expect(input).toHaveAttribute("aria-busy", "true");
  });

  it("shows a message when the server returns nothing", async () => {
    const search = vi.fn().mockResolvedValue([]);
    const { input, type } = renderTypeahead(search);

    await typeAndWait(type, "zzz");

    expect(screen.getByText("No results for “zzz”")).toBeVisible();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("status")).toHaveTextContent("No results found");
  });
});

describe("Typeahead: race conditions", () => {
  it("ignores an old response that arrives after a newer one", async () => {
    const slowFirstRequest = createDeferred<string[]>();
    const fastSecondRequest = createDeferred<string[]>();
    const search = vi
      .fn()
      .mockReturnValueOnce(slowFirstRequest.promise)
      .mockReturnValueOnce(fastSecondRequest.promise);
    const { type } = renderTypeahead(search);

    await typeAndWait(type, "mu");
    await typeAndWait(type, "mum");

    fastSecondRequest.resolve(["Mumbai"]);
    await wait(0);
    slowFirstRequest.resolve(["Mumbai", "Munnar"]);
    await wait(0);

    expect(getOptionTexts()).toEqual(["Mumbai"]);
  });

  it("aborts the request in flight when the user types again", async () => {
    const pending = createDeferred<string[]>();
    const search = vi.fn().mockReturnValue(pending.promise);
    const { type } = renderTypeahead(search);

    await typeAndWait(type, "mu");
    const firstSignal = search.mock.calls[0][1] as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    type("mum");

    expect(firstSignal.aborted).toBe(true);
  });

  it("does not show an error when an aborted request rejects", async () => {
    const firstRequest = createDeferred<string[]>();
    const search = vi
      .fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce(["Mumbai"]);
    const { type } = renderTypeahead(search);

    await typeAndWait(type, "mu");
    await typeAndWait(type, "mum");
    firstRequest.reject(new Error("aborted"));
    await wait(0);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getOptionTexts()).toEqual(["Mumbai"]);
  });

  it("aborts the request when the component is removed from the page", async () => {
    const pending = createDeferred<string[]>();
    const search = vi.fn().mockReturnValue(pending.promise);
    const onSelect = vi.fn();
    const { unmount } = render(
      <Typeahead
        label="City"
        search={search}
        getItemLabel={(city: string) => city}
        getItemKey={(city: string) => city}
        onSelect={onSelect}
        debounceMs={DEBOUNCE_MS}
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "mu" } });
    await wait(DEBOUNCE_MS);
    unmount();

    expect((search.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
  });
});

describe("Typeahead: cache", () => {
  it("answers a repeated query from the cache without a new request", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce(["Mumbai", "Munnar"])
      .mockResolvedValueOnce(["Mumbai"]);
    const { type } = renderTypeahead(search);

    await typeAndWait(type, "mu");
    await typeAndWait(type, "mum");
    type("mu");
    await wait(0);

    expect(search).toHaveBeenCalledTimes(2);
    expect(getOptionTexts()).toEqual(["Mumbai", "Munnar"]);
  });

  it("treats upper case and lower case as the same query", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    const { type } = renderTypeahead(search);

    await typeAndWait(type, "mum");
    await typeAndWait(type, "MUM ");

    expect(search).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed request", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error("Server is down"))
      .mockResolvedValueOnce(["Mumbai"]);
    const { type } = renderTypeahead(search);

    await typeAndWait(type, "mum");
    await typeAndWait(type, "mu");
    await typeAndWait(type, "mum");

    expect(search).toHaveBeenCalledTimes(3);
  });
});

describe("Typeahead: errors", () => {
  it('shows an error and searches again when the user clicks "Try again"', async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error("Server is down"))
      .mockResolvedValueOnce(["Mumbai"]);
    const { type } = renderTypeahead(search);

    await typeAndWait(type, "mum");
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await wait(DEBOUNCE_MS);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getOptionTexts()).toEqual(["Mumbai"]);
  });
});

describe("Typeahead: keyboard", () => {
  async function openWithThreeCities() {
    const search = vi.fn().mockResolvedValue(["Mumbai", "Munnar", "Murshidabad"]);
    const utils = renderTypeahead(search);
    await typeAndWait(utils.type, "mu");
    return { ...utils, search };
  }

  function getActiveOptionText(input: HTMLInputElement): string | null {
    const activeId = input.getAttribute("aria-activedescendant");
    return activeId === null ? null : (document.getElementById(activeId)?.textContent ?? null);
  }

  it("has no active option until the user presses an arrow key", async () => {
    const { input } = await openWithThreeCities();

    expect(getActiveOptionText(input)).toBeNull();
  });

  it("moves down with ArrowDown and wraps to the first option", async () => {
    const { input, press } = await openWithThreeCities();

    press("ArrowDown");
    expect(getActiveOptionText(input)).toBe("Mumbai");

    press("ArrowDown");
    press("ArrowDown");
    expect(getActiveOptionText(input)).toBe("Murshidabad");

    press("ArrowDown");
    expect(getActiveOptionText(input)).toBe("Mumbai");
  });

  it("moves up with ArrowUp and wraps to the last option", async () => {
    const { input, press } = await openWithThreeCities();

    press("ArrowUp");
    expect(getActiveOptionText(input)).toBe("Murshidabad");

    press("ArrowUp");
    expect(getActiveOptionText(input)).toBe("Munnar");
  });

  it("marks only the active option as selected", async () => {
    const { press } = await openWithThreeCities();

    press("ArrowDown");
    press("ArrowDown");

    const selected = screen
      .getAllByRole("option")
      .filter((option) => option.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("Munnar");
  });

  it("selects the active option with Enter", async () => {
    const { input, press, onSelect, search } = await openWithThreeCities();

    press("ArrowDown");
    press("ArrowDown");
    press("Enter");
    await wait(DEBOUNCE_MS);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("Munnar");
    expect(input).toHaveValue("Munnar");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("does nothing on Enter when no option is active", async () => {
    const { press, onSelect } = await openWithThreeCities();

    press("Enter");

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("ignores Enter while the user is composing a word in an IME keyboard", async () => {
    const { input, press, onSelect } = await openWithThreeCities();

    press("ArrowDown");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("closes the list on the first Escape and clears the text on the second", async () => {
    const { input, press } = await openWithThreeCities();

    press("Escape");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("mu");

    press("Escape");
    expect(input).toHaveValue("");
  });

  it("opens the list again with ArrowDown, using the cache", async () => {
    const { input, press, search } = await openWithThreeCities();

    press("Escape");
    press("ArrowDown");
    await wait(0);

    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("drops the active option when the user types again", async () => {
    const { input, press, type } = await openWithThreeCities();

    press("ArrowDown");
    type("mum");

    expect(getActiveOptionText(input)).toBeNull();
  });
});

describe("Typeahead: mouse and focus", () => {
  it("selects an option on click", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai", "Munnar"]);
    const { input, type, onSelect } = renderTypeahead(search);
    await typeAndWait(type, "mu");

    fireEvent.click(screen.getByRole("option", { name: "Munnar" }));

    expect(onSelect).toHaveBeenCalledWith("Munnar");
    expect(input).toHaveValue("Munnar");
  });

  it("keeps focus on the input when the user presses the mouse on an option", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    const { type } = renderTypeahead(search);
    await typeAndWait(type, "mu");

    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    screen.getByRole("option", { name: "Mumbai" }).dispatchEvent(mouseDown);

    expect(mouseDown.defaultPrevented).toBe(true);
  });

  it("makes the option under the mouse active", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai", "Munnar"]);
    const { type } = renderTypeahead(search);
    await typeAndWait(type, "mu");

    fireEvent.mouseEnter(screen.getByRole("option", { name: "Munnar" }));

    expect(screen.getByRole("option", { name: "Munnar" })).toHaveAttribute("aria-selected", "true");
  });

  it("closes the list when the input loses focus", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    const { input, type } = renderTypeahead(search);
    await typeAndWait(type, "mu");

    fireEvent.blur(input);

    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});

describe("Typeahead: at scale", () => {
  it("draws only 10 rows when the server sends 5,000 items", async () => {
    const fiveThousandCities = Array.from({ length: 5000 }, (_, index) => `City ${index}`);
    const search = vi.fn().mockResolvedValue(fiveThousandCities);
    const { type } = renderTypeahead(search);

    await typeAndWait(type, "ci");

    expect(screen.getAllByRole("option")).toHaveLength(10);
    expect(screen.getByRole("status")).toHaveTextContent("10 results available");
  });

  it("sends one request when the user types 200 characters without stopping", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    const { type } = renderTypeahead(search);

    let text = "";
    for (let count = 0; count < 200; count += 1) {
      text += "a";
      type(text);
      await wait(20);
    }
    await wait(DEBOUNCE_MS);

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(text, expect.any(AbortSignal));
  });

  it("wraps from the last row to the first row with 10 rows on screen", async () => {
    const manyCities = Array.from({ length: 5000 }, (_, index) => `City ${index}`);
    const { input, type, press } = renderTypeahead(vi.fn().mockResolvedValue(manyCities));
    await typeAndWait(type, "ci");

    for (let count = 0; count < 11; count += 1) {
      press("ArrowDown");
    }

    const activeId = input.getAttribute("aria-activedescendant") as string;
    expect(document.getElementById(activeId)).toHaveTextContent("City 0");
  });
});

/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you say these cases aloud and walk through one or two.
 * Here they are written as tests, so you can see that the code handles them.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import type { Ref } from "react";
import { Typeahead } from "./Typeahead";
import type { TypeaheadProps } from "./Typeahead";
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

/** The props that a test may add or replace. */
type ExtraProps = Partial<TypeaheadProps<string>> & { ref?: Ref<HTMLInputElement> };

function renderTypeahead(search: SearchFn<string>, extraProps: ExtraProps = {}) {
  const onSelect = vi.fn();

  const { container } = render(
    <Typeahead
      label="City"
      search={search}
      getItemLabel={(city) => city}
      getItemKey={(city) => city}
      onSelect={onSelect}
      debounceMs={DEBOUNCE_MS}
      {...extraProps}
    />,
  );

  const input = screen.getByRole("combobox", { name: "City" }) as HTMLInputElement;
  const type = (text: string) => fireEvent.change(input, { target: { value: text } });
  const press = (key: string) => fireEvent.keyDown(input, { key });

  return { input, type, press, onSelect, container };
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

    expect(screen.getByText("Searching…", { selector: "p" })).toBeVisible();
    expect(input).toHaveAttribute("aria-busy", "true");
  });

  it("shows a message when the server returns nothing", async () => {
    const search = vi.fn().mockResolvedValue([]);
    const { input, type } = renderTypeahead(search);

    await typeAndWait(type, "zzz");

    expect(screen.getByText("No results for “zzz”", { selector: "p" })).toBeVisible();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("status")).toHaveTextContent("No results for “zzz”");
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

  it("does nothing harmful on arrow keys when the list is empty", async () => {
    const search = vi.fn().mockResolvedValue([]);
    const { input, type, press, onSelect } = renderTypeahead(search);
    await typeAndWait(type, "zzz");

    press("ArrowDown");
    press("ArrowUp");
    press("Enter");

    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(screen.getByText("No results for “zzz”", { selector: "p" })).toBeVisible();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does nothing harmful on arrow keys when the list shows an error", async () => {
    const search = vi.fn().mockRejectedValue(new Error("Server is down"));
    const { input, type, press, onSelect } = renderTypeahead(search);
    await typeAndWait(type, "mum");

    press("ArrowDown");
    press("ArrowUp");
    press("Enter");

    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");
    expect(onSelect).not.toHaveBeenCalled();
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

    // The query is cut to the first 100 characters. See "very long text" below.
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(text.slice(0, 100), expect.any(AbortSignal));
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

describe("Typeahead: text controlled by the parent", () => {
  /** A parent that owns the text, like a form library does. */
  function ControlledTypeahead({ search }: { search: SearchFn<string> }) {
    const [text, setText] = useState("");

    return (
      <>
        <Typeahead
          label="City"
          search={search}
          getItemLabel={(city) => city}
          getItemKey={(city) => city}
          onSelect={() => {}}
          debounceMs={DEBOUNCE_MS}
          value={text}
          onValueChange={setText}
        />
        <button type="button" onClick={() => setText("")}>
          Clear from outside
        </button>
        <output>{text}</output>
      </>
    );
  }

  it("keeps its own text and still reports every change when no value is given", async () => {
    const onValueChange = vi.fn();
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    const { input, type } = renderTypeahead(search, { onValueChange });

    await typeAndWait(type, "mu");

    expect(input.value).toBe("mu");
    expect(onValueChange).toHaveBeenLastCalledWith("mu");
  });

  it("shows the text from the parent and searches for it", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    render(<ControlledTypeahead search={search} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "mu" } });
    await wait(DEBOUNCE_MS);

    expect(input.value).toBe("mu");
    expect(document.querySelector("output")).toHaveTextContent("mu");
    expect(getOptionTexts()).toEqual(["Mumbai"]);
  });

  it("gives the parent the label of the selected option", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    render(<ControlledTypeahead search={search} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "mu" } });
    await wait(DEBOUNCE_MS);

    fireEvent.click(screen.getByRole("option", { name: "Mumbai" }));

    expect(input.value).toBe("Mumbai");
    expect(document.querySelector("output")).toHaveTextContent("Mumbai");
  });

  it("shows the new text when the parent changes it from outside", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    render(<ControlledTypeahead search={search} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "mu" } });
    await wait(DEBOUNCE_MS);

    fireEvent.click(screen.getByRole("button", { name: "Clear from outside" }));

    expect(input.value).toBe("");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("does not change the text when the parent ignores the change", () => {
    const onValueChange = vi.fn();
    const search = vi.fn().mockResolvedValue([]);
    const { input, type } = renderTypeahead(search, { value: "fixed", onValueChange });

    type("something else");

    expect(input.value).toBe("fixed");
    expect(onValueChange).toHaveBeenCalledWith("something else");
  });

  it("tells the parent that the text is empty on the second Escape", async () => {
    const onValueChange = vi.fn();
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    const { type, press } = renderTypeahead(search, { onValueChange });
    await typeAndWait(type, "mu");

    press("Escape");
    press("Escape");

    expect(onValueChange).toHaveBeenLastCalledWith("");
  });
});

describe("Typeahead: inside a form", () => {
  it("passes name, required and disabled to the input", () => {
    const search = vi.fn().mockResolvedValue([]);
    const { input } = renderTypeahead(search, { name: "city", required: true, disabled: true });

    expect(input).toHaveAttribute("name", "city");
    expect(input).toBeRequired();
    expect(input).toBeDisabled();
  });

  it("leaves the input enabled and optional by default", () => {
    const search = vi.fn().mockResolvedValue([]);
    const { input } = renderTypeahead(search);

    expect(input).toBeEnabled();
    expect(input).not.toBeRequired();
  });

  it("gives the parent the input element through ref", () => {
    const ref = createRef<HTMLInputElement>();
    const search = vi.fn().mockResolvedValue([]);
    const { input } = renderTypeahead(search, { ref });

    expect(ref.current).toBe(input);
  });

  it("sends the typed text with the form under the given name", () => {
    const search = vi.fn().mockResolvedValue([]);
    render(
      <form aria-label="Trip">
        <Typeahead
          label="City"
          name="city"
          search={search}
          getItemLabel={(city: string) => city}
          getItemKey={(city) => city}
          onSelect={() => {}}
        />
      </form>,
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Pune" } });

    const form = screen.getByRole("form", { name: "Trip" }) as HTMLFormElement;
    expect(new FormData(form).get("city")).toBe("Pune");
  });
});

describe("Typeahead: custom rows", () => {
  it("draws each row with renderItem and tells it the query and the active row", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai", "Munnar"]);
    const { type, press } = renderTypeahead(search, {
      renderItem: (city, { isActive, query }) => (
        <span>
          {isActive ? "active" : "idle"} {city} for {query}
        </span>
      ),
    });
    await typeAndWait(type, " mu ");

    press("ArrowDown");

    expect(getOptionTexts()).toEqual(["active Mumbai for mu", "idle Munnar for mu"]);
  });

  it("still puts the plain label in the input after a selection", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    const { input, type } = renderTypeahead(search, {
      renderItem: (city) => <strong>City of {city}</strong>,
    });
    await typeAndWait(type, "mu");

    fireEvent.click(screen.getByRole("option", { name: "City of Mumbai" }));

    expect(input.value).toBe("Mumbai");
  });
});

describe("Typeahead: translated messages", () => {
  const HINDI = {
    searching: "खोज रहे हैं…",
    noResults: (query: string) => `“${query}” के लिए कोई नतीजा नहीं मिला`,
    error: "कुछ गड़बड़ हो गई।",
    retry: "फिर से कोशिश करें",
    resultsAvailable: (count: number) => `${count} नतीजे उपलब्ध हैं`,
  };

  it("shows the translated loading message", async () => {
    const pending = createDeferred<string[]>();
    const { type } = renderTypeahead(() => pending.promise, { messages: HINDI });

    await typeAndWait(type, "mu");

    expect(screen.getByText("खोज रहे हैं…", { selector: "p" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("खोज रहे हैं…");
  });

  it("shows the translated message for no results, with the query inside", async () => {
    const search = vi.fn().mockResolvedValue([]);
    const { type } = renderTypeahead(search, { messages: HINDI });

    await typeAndWait(type, "zzz");

    expect(screen.getByText("“zzz” के लिए कोई नतीजा नहीं मिला", { selector: "p" })).toBeVisible();
  });

  it("shows the translated error and retry button", async () => {
    const search = vi.fn().mockRejectedValue(new Error("Server is down"));
    const { type } = renderTypeahead(search, { messages: HINDI });

    await typeAndWait(type, "mum");

    expect(screen.getByRole("alert")).toHaveTextContent("कुछ गड़बड़ हो गई।");
    expect(screen.getByRole("button", { name: "फिर से कोशिश करें" })).toBeVisible();
  });

  it("reads the translated result count to screen readers", async () => {
    const search = vi.fn().mockResolvedValue(["Mumbai", "Munnar"]);
    const { type } = renderTypeahead(search, { messages: HINDI });

    await typeAndWait(type, "mu");

    expect(screen.getByRole("status")).toHaveTextContent("2 नतीजे उपलब्ध हैं");
  });

  it("keeps the English text for every message that is not translated", async () => {
    const search = vi.fn().mockRejectedValue(new Error("Server is down"));
    const { type } = renderTypeahead(search, { messages: { retry: "Retry now" } });

    await typeAndWait(type, "mum");

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");
    expect(screen.getByRole("button", { name: "Retry now" })).toBeVisible();
  });
});

describe("Typeahead: cache expiry", () => {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  async function searchMuThenMum(extraProps: ExtraProps = {}) {
    const search = vi.fn().mockResolvedValue(["Mumbai"]);
    const utils = renderTypeahead(search, extraProps);
    await typeAndWait(utils.type, "mu");
    await typeAndWait(utils.type, "mum");
    return { ...utils, search };
  }

  it("still answers from the cache just before five minutes have passed", async () => {
    const { type, search } = await searchMuThenMum();

    await wait(FIVE_MINUTES_MS - 2 * DEBOUNCE_MS);
    await typeAndWait(type, "mu");

    expect(search).toHaveBeenCalledTimes(2);
  });

  it("asks the server again when the cached answer is older than five minutes", async () => {
    const { type, search } = await searchMuThenMum();

    await wait(FIVE_MINUTES_MS);
    await typeAndWait(type, "mu");

    expect(search).toHaveBeenCalledTimes(3);
    expect(search).toHaveBeenLastCalledWith("mu", expect.any(AbortSignal));
  });

  it("uses the expiry time given in cacheTtlMs", async () => {
    const { type, search } = await searchMuThenMum({ cacheTtlMs: 1000 });

    await wait(1000);
    await typeAndWait(type, "mu");

    expect(search).toHaveBeenCalledTimes(3);
  });
});

describe("Typeahead: very long text", () => {
  it("cuts the query to 100 characters before searching", async () => {
    const search = vi.fn().mockResolvedValue([]);
    const { input, type } = renderTypeahead(search);

    await typeAndWait(type, "a".repeat(150));

    expect(search).toHaveBeenCalledWith("a".repeat(100), expect.any(AbortSignal));
    expect(input.value).toHaveLength(150);
  });

  it("sends no new request for characters typed after the limit", async () => {
    const search = vi.fn().mockResolvedValue([]);
    const { type } = renderTypeahead(search);
    await typeAndWait(type, "a".repeat(100));

    await typeAndWait(type, "a".repeat(101));

    expect(search).toHaveBeenCalledTimes(1);
  });

  it("uses the limit given in maxQueryLength", async () => {
    const search = vi.fn().mockResolvedValue([]);
    const { type } = renderTypeahead(search, { maxQueryLength: 5 });

    await typeAndWait(type, "mumbai city");

    expect(search).toHaveBeenCalledWith("mumba", expect.any(AbortSignal));
  });
});

describe("Typeahead: styling from outside", () => {
  it("adds the given class name to the root element and keeps its own", () => {
    const search = vi.fn().mockResolvedValue([]);
    const { container } = renderTypeahead(search, { className: "checkout-city" });

    expect(container.firstElementChild).toHaveClass("typeahead", "checkout-city");
  });

  it("has only its own class name when none is given", () => {
    const search = vi.fn().mockResolvedValue([]);
    const { container } = renderTypeahead(search);

    expect(container.firstElementChild?.className).toBe("typeahead");
  });
});

/*
 * NOT PART OF THE INTERVIEW: production version.
 * In the interview you say these cases aloud and walk through one or two.
 * Here they are written as tests, so you can see that the code handles them.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MENU, createDeferred, makeOrder } from "../testUtils";
import type { Deferred } from "../testUtils";
import { CartChangedError } from "./cartChanges";
import { SEARCH_DEBOUNCE_MS } from "./MenuNavigator";
import { clearMenuMemory } from "./menuCache";
import { DEFAULT_MESSAGES } from "./messages";
import { RestaurantPage } from "./RestaurantPage";
import type { RestaurantPageProps } from "./RestaurantPage";
import type { MenuCategory, Order, OrderLine, PlaceOrder } from "./types";

const PLACED = makeOrder("placed", 100);

interface PlaceCall {
  cart: OrderLine[];
  key: string;
  answer: Deferred<Order>;
}

async function renderPage(restaurantId = "r1", extra: Partial<RestaurantPageProps> = {}) {
  const placeCalls: PlaceCall[] = [];
  const placeOrder: PlaceOrder = (cart, key) => {
    const answer = createDeferred<Order>();
    placeCalls.push({ cart, key, answer });
    return answer.promise;
  };
  const fetchMenu = vi.fn().mockResolvedValue(MENU);
  const onOrderPlaced = vi.fn();
  const props = { fetchMenu, placeOrder, onOrderPlaced, ...extra };

  const view = render(<RestaurantPage restaurantId={restaurantId} {...props} />);
  await act(async () => {});

  const showRestaurant = async (id: string, more: Partial<RestaurantPageProps> = {}) => {
    view.rerender(<RestaurantPage restaurantId={id} {...props} {...more} />);
    await act(async () => {});
  };
  return { ...view, placeCalls, fetchMenu, onOrderPlaced, showRestaurant };
}

const button = (name: string) => screen.getByRole("button", { name });
/** The live region of the cart. The search has a live region of its own. */
const cartStatus = () => document.querySelector("p.visually-hidden") as HTMLElement;
const savedCart = (restaurantId = "r1") =>
  JSON.parse(sessionStorage.getItem(`cart:${restaurantId}`) ?? "null");

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  clearMenuMemory();
});

describe("RestaurantPage: the menu", () => {
  it("shows every category as a heading with its dishes", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 2, name: "Starters" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Main course" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Paneer Tikka" })).toBeInTheDocument();
    expect(screen.getByText("Veg · ₹220.00")).toBeInTheDocument();
  });

  it("names every button after its dish", async () => {
    await renderPage();

    expect(button("Add Paneer Tikka")).toBeInTheDocument();
    expect(button("Remove one Paneer Tikka")).toBeInTheDocument();
    expect(button("Add Butter Naan")).toBeInTheDocument();
  });

  it("says “loading” first, and asks for the menu of this restaurant", async () => {
    const menu = createDeferred<MenuCategory[]>();
    const fetchMenu = vi.fn().mockReturnValue(menu.promise);

    render(
      <RestaurantPage
        restaurantId="r1"
        fetchMenu={fetchMenu}
        placeOrder={vi.fn()}
        onOrderPlaced={vi.fn()}
      />,
    );

    expect(screen.getByText("Loading the menu…")).toBeInTheDocument();
    expect(fetchMenu).toHaveBeenCalledWith("r1", expect.any(AbortSignal));
  });

  it("shows an error with “Try again”, and loads the menu on the second try", async () => {
    const fetchMenu = vi.fn().mockRejectedValueOnce(new Error("500")).mockResolvedValue(MENU);
    render(
      <RestaurantPage
        restaurantId="r1"
        fetchMenu={fetchMenu}
        placeOrder={vi.fn()}
        onOrderPlaced={vi.fn()}
      />,
    );
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent("We could not load the menu.");

    button("Try again").focus();
    await act(async () => fireEvent.click(button("Try again")));

    expect(fetchMenu).toHaveBeenCalledTimes(2);
    expect(button("Add Paneer Tikka")).toBeInTheDocument();
    // The button is gone. The focus is on the page, not lost.
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Menu" }));
  });

  it("aborts the menu request when the page is removed", async () => {
    const fetchMenu = vi.fn().mockReturnValue(new Promise(() => {}));
    const { unmount } = render(
      <RestaurantPage
        restaurantId="r1"
        fetchMenu={fetchMenu}
        placeOrder={vi.fn()}
        onOrderPlaced={vi.fn()}
      />,
    );

    unmount();

    expect((fetchMenu.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
  });
});

describe("RestaurantPage: the cart", () => {
  it("adds dishes and shows the count and the total in the cart bar", async () => {
    await renderPage();

    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Add Butter Naan"));

    expect(screen.getByText("3 items · ₹500.00")).toBeInTheDocument();
  });

  it("says “1 item” for one dish", async () => {
    await renderPage();

    fireEvent.click(button("Add Butter Naan"));

    expect(screen.getByText("1 item · ₹60.00")).toBeInTheDocument();
  });

  it("removes one dish at a time", async () => {
    await renderPage();
    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Add Paneer Tikka"));

    fireEvent.click(button("Remove one Paneer Tikka"));

    expect(screen.getByText("1 item · ₹220.00")).toBeInTheDocument();
  });

  it("tells screen readers about every cart change", async () => {
    await renderPage();
    const status = cartStatus();
    expect(status).toHaveTextContent("");

    fireEvent.click(button("Add Paneer Tikka"));
    expect(status).toHaveTextContent("Paneer Tikka: 1 in the cart. Total ₹220.00.");

    fireEvent.click(button("Remove one Paneer Tikka"));
    expect(status).toHaveTextContent("Paneer Tikka: 0 in the cart. Total ₹0.00.");
  });

  it("does not add an unavailable dish, and marks its button", async () => {
    await renderPage();

    fireEvent.click(button("Add Biryani"));

    expect(button("Add Biryani")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Veg · ₹280.00 · Unavailable")).toBeInTheDocument();
    expect(screen.getByText("0 items · ₹0.00")).toBeInTheDocument();
  });

  it("marks “remove” as unusable at 0 and “add” at the limit, and keeps both focusable", async () => {
    await renderPage();
    const add = button("Add Paneer Tikka");
    const remove = button("Remove one Paneer Tikka");
    expect(remove).toHaveAttribute("aria-disabled", "true");

    add.focus();
    for (let tap = 0; tap < 12; tap++) {
      fireEvent.click(add);
    }

    expect(screen.getByText("10 items · ₹2,200.00")).toBeInTheDocument();
    expect(add).toHaveAttribute("aria-disabled", "true");
    expect(add).not.toBeDisabled();
    expect(document.activeElement).toBe(add);
  });

  it("keeps the focus on “remove” when the last dish is removed", async () => {
    await renderPage();
    fireEvent.click(button("Add Paneer Tikka"));
    const remove = button("Remove one Paneer Tikka");

    remove.focus();
    fireEvent.click(remove);

    expect(document.activeElement).toBe(remove);
    expect(remove).toHaveAttribute("aria-disabled", "true");
  });

  it("saves the cart, and shows it again after a reload", async () => {
    const first = await renderPage();
    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Add Paneer Tikka"));
    expect(savedCart()).toEqual([{ itemId: "tikka", quantity: 2 }]);

    first.unmount();
    await renderPage();

    expect(screen.getByText("2 items · ₹440.00")).toBeInTheDocument();
  });

  it("keeps a different cart for each restaurant", async () => {
    sessionStorage.setItem("cart:r2", JSON.stringify([{ itemId: "naan", quantity: 3 }]));
    const { showRestaurant } = await renderPage("r1");
    fireEvent.click(button("Add Paneer Tikka"));

    await showRestaurant("r2");
    expect(screen.getByText("3 items · ₹180.00")).toBeInTheDocument();

    await showRestaurant("r1");
    expect(screen.getByText("1 item · ₹220.00")).toBeInTheDocument();
    expect(savedCart("r2")).toEqual([{ itemId: "naan", quantity: 3 }]);
  });

  it("does not count a saved dish that is unavailable now", async () => {
    sessionStorage.setItem(
      "cart:r1",
      JSON.stringify([
        { itemId: "biryani", quantity: 2 },
        { itemId: "naan", quantity: 1 },
      ]),
    );

    await renderPage();

    expect(screen.getByText("1 item · ₹60.00")).toBeInTheDocument();
  });
});

describe("RestaurantPage: placing the order", () => {
  it("does nothing for an empty cart", async () => {
    const { placeCalls } = await renderPage();

    fireEvent.click(button("Place order"));

    expect(button("Place order")).toHaveAttribute("aria-disabled", "true");
    expect(placeCalls).toHaveLength(0);
  });

  it("creates one order when the user taps “Place order” twice", async () => {
    const { placeCalls } = await renderPage();
    fireEvent.click(button("Add Paneer Tikka"));

    fireEvent.click(button("Place order"));
    fireEvent.click(button("Placing the order…"));

    expect(placeCalls).toHaveLength(1);
    expect(placeCalls[0].cart).toEqual([{ itemId: "tikka", quantity: 1, unitPrice: 22000 }]);
  });

  it("shows a busy button that keeps the focus", async () => {
    await renderPage();
    fireEvent.click(button("Add Paneer Tikka"));
    const place = button("Place order");

    place.focus();
    fireEvent.click(place);

    expect(place).toHaveTextContent("Placing the order…");
    expect(place).toHaveAttribute("aria-disabled", "true");
    expect(document.activeElement).toBe(place);
  });

  it("does not change the cart while the order is on its way", async () => {
    const { placeCalls } = await renderPage();
    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Place order"));

    fireEvent.click(button("Add Butter Naan"));
    fireEvent.click(button("Remove one Paneer Tikka"));

    expect(screen.getByText("1 item · ₹220.00")).toBeInTheDocument();
    expect(placeCalls).toHaveLength(1);
  });

  it("empties the cart and hands the order over when the server answers", async () => {
    const { placeCalls, onOrderPlaced } = await renderPage();
    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Place order"));

    await act(async () => placeCalls[0].answer.resolve(PLACED));

    expect(onOrderPlaced).toHaveBeenCalledTimes(1);
    expect(onOrderPlaced).toHaveBeenCalledWith(PLACED);
    expect(savedCart()).toEqual([]);
  });

  it("empties the saved cart also when the parent removes the page at once", async () => {
    const view = await renderPage();
    view.onOrderPlaced.mockImplementation(() => view.unmount());
    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Place order"));

    await act(async () => view.placeCalls[0].answer.resolve(PLACED));

    expect(savedCart()).toEqual([]);
  });

  it("keeps the cart and shows an error when the request fails", async () => {
    const { placeCalls, onOrderPlaced } = await renderPage();
    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Place order"));

    await act(async () => placeCalls[0].answer.reject(new Error("timeout")));

    expect(screen.getByRole("alert")).toHaveTextContent("We could not place the order.");
    expect(screen.getByText("1 item · ₹220.00")).toBeInTheDocument();
    expect(savedCart()).toEqual([{ itemId: "tikka", quantity: 1 }]);
    expect(onOrderPlaced).not.toHaveBeenCalled();
  });

  it("sends the same idempotency key when the user tries again", async () => {
    const { placeCalls } = await renderPage();
    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Place order"));
    await act(async () => placeCalls[0].answer.reject(new Error("timeout")));

    fireEvent.click(button("Place order"));

    expect(placeCalls).toHaveLength(2);
    expect(placeCalls[1].key).toBe(placeCalls[0].key);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends a new key when the user changed the cart after a failure", async () => {
    const { placeCalls } = await renderPage();
    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Place order"));
    await act(async () => placeCalls[0].answer.reject(new Error("timeout")));

    fireEvent.click(button("Add Butter Naan"));
    fireEvent.click(button("Place order"));

    expect(placeCalls[1].key).not.toBe(placeCalls[0].key);
  });

  it("does not send a saved dish that is unavailable now", async () => {
    sessionStorage.setItem(
      "cart:r1",
      JSON.stringify([
        { itemId: "biryani", quantity: 2 },
        { itemId: "naan", quantity: 1 },
      ]),
    );
    const { placeCalls } = await renderPage();

    fireEvent.click(button("Place order"));

    expect(placeCalls[0].cart).toEqual([{ itemId: "naan", quantity: 1, unitPrice: 6000 }]);
  });
});

describe("RestaurantPage: the quantity field", () => {
  const field = (name: string) => screen.getByRole("textbox", { name }) as HTMLInputElement;

  it("sets the quantity the user types", async () => {
    await renderPage();

    fireEvent.change(field("Number of Butter Naan"), { target: { value: "4" } });

    expect(field("Number of Butter Naan").value).toBe("4");
    expect(screen.getByText("4 items · ₹240.00")).toBeInTheDocument();
    expect(savedCart()).toEqual([{ itemId: "naan", quantity: 4 }]);
  });

  it("keeps a typed quantity at the limit", async () => {
    await renderPage();

    fireEvent.change(field("Number of Butter Naan"), { target: { value: "75" } });

    expect(field("Number of Butter Naan").value).toBe("10");
  });

  it("removes the dish when the field is emptied, and ignores letters", async () => {
    await renderPage();
    fireEvent.change(field("Number of Butter Naan"), { target: { value: "3" } });

    fireEvent.change(field("Number of Butter Naan"), { target: { value: "abc" } });
    expect(field("Number of Butter Naan").value).toBe("3");

    fireEvent.change(field("Number of Butter Naan"), { target: { value: "" } });
    expect(field("Number of Butter Naan").value).toBe("0");
    expect(savedCart()).toEqual([]);
  });

  it("cannot be used for an unavailable dish", async () => {
    await renderPage();

    expect(field("Number of Biryani")).toBeDisabled();
  });
});

describe("RestaurantPage: a large menu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const dishNames = () =>
    screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
  const search = (text: string) =>
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the menu" }), {
      target: { value: text },
    });
  const searchStatus = () => document.querySelector(".menu-search__count") as HTMLElement;
  const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  it("filters the dishes only after the user stopped typing", async () => {
    await renderPage();

    search("na");
    await wait(SEARCH_DEBOUNCE_MS - 1);
    search("naan");
    await wait(SEARCH_DEBOUNCE_MS - 1);
    expect(dishNames()).toEqual(["Paneer Tikka", "Butter Naan", "Biryani"]);

    await wait(1);
    expect(dishNames()).toEqual(["Butter Naan"]);
  });

  it("says how many dishes were found, after the user stopped typing", async () => {
    await renderPage();
    expect(searchStatus()).toHaveTextContent("");

    search("a");
    expect(searchStatus()).toHaveTextContent("");
    await wait(SEARCH_DEBOUNCE_MS);
    expect(searchStatus()).toHaveTextContent("3 dishes found");

    search("tikka");
    await wait(SEARCH_DEBOUNCE_MS);
    expect(searchStatus()).toHaveTextContent("1 dish found");

    search("pizza");
    await wait(SEARCH_DEBOUNCE_MS);
    expect(searchStatus()).toHaveTextContent("0 dishes found");
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("shows the whole menu again when the search is cleared", async () => {
    await renderPage();
    search("tikka");
    await wait(SEARCH_DEBOUNCE_MS);

    search("");
    await wait(SEARCH_DEBOUNCE_MS);

    expect(dishNames()).toEqual(["Paneer Tikka", "Butter Naan", "Biryani"]);
    expect(searchStatus()).toHaveTextContent("");
  });

  it("keeps the cart when a dish is filtered out and comes back", async () => {
    await renderPage();
    fireEvent.click(button("Add Butter Naan"));

    search("tikka");
    await wait(SEARCH_DEBOUNCE_MS);
    expect(screen.getByText("1 item · ₹60.00")).toBeInTheDocument();

    search("");
    await wait(SEARCH_DEBOUNCE_MS);
    expect(screen.getByRole("textbox", { name: "Number of Butter Naan" })).toHaveValue("1");
  });

  it("puts the cart before the dishes in the page, so the keyboard reaches it first", async () => {
    await renderPage();
    const cart = screen.getByRole("region", { name: "Cart" });
    const links = screen.getByRole("navigation", { name: "Menu categories" });
    const firstDish = button("Add Paneer Tikka");

    // Tab order follows the order in the page: links, then the cart, then 400 dishes.
    expect(links.compareDocumentPosition(cart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cart.compareDocumentPosition(firstDish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cart).toContainElement(button("Place order"));
  });

  it("has a link to every category, and only to categories that match the search", async () => {
    await renderPage();
    const nav = screen.getByRole("navigation", { name: "Menu categories" });
    const links = () => Array.from(nav.querySelectorAll("a"));

    expect(links().map((link) => link.textContent)).toEqual(["Starters", "Main course"]);
    expect(links()[1].getAttribute("href")).toBe("#category-mains");
    expect(document.getElementById("category-mains")).toHaveAccessibleName("Main course");

    search("tikka");
    await wait(SEARCH_DEBOUNCE_MS);
    expect(links().map((link) => link.textContent)).toEqual(["Starters"]);
  });

  it("marks the first category as the current one before the user scrolls", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: "Starters" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Main course" })).not.toHaveAttribute("aria-current");
  });

  it("loads a picture only when it comes near the screen, and hides it from screen readers", async () => {
    const menu: MenuCategory[] = [
      { id: "c", name: "C", items: [{ ...MENU[0].items[0], imageUrl: "dishes/1.svg" }] },
    ];
    await renderPage("r1", { fetchMenu: vi.fn().mockResolvedValue(menu) });

    const picture = document.querySelector("img");

    expect(picture).toHaveAttribute("src", "dishes/1.svg");
    expect(picture).toHaveAttribute("loading", "lazy");
    expect(picture).toHaveAttribute("decoding", "async");
    expect(picture).toHaveAttribute("alt", "");
  });

  it("keeps the box of the picture for a dish without a picture", async () => {
    await renderPage();

    expect(document.querySelectorAll(".menu-item__image")).toHaveLength(3);
    expect(document.querySelector("img")).toBeNull();
  });

  it("draws one row again, not all of them, when one quantity changes", async () => {
    // A row asks for its “Add …” text every time it is drawn. So the calls count the draws.
    const addItem = vi.fn((name: string) => `Add ${name}`);
    const messages = { addItem };
    await renderPage("r1", { messages });
    const draws = (name: string) => addItem.mock.calls.filter((call) => call[0] === name).length;
    const naanBefore = draws("Butter Naan");
    const tikkaBefore = draws("Paneer Tikka");

    fireEvent.click(button("Add Paneer Tikka"));

    expect(draws("Paneer Tikka")).toBe(tikkaBefore + 1);
    expect(draws("Butter Naan")).toBe(naanBefore);
  });

  it("does not draw the rows again while the user types in the search box", async () => {
    const addItem = vi.fn((name: string) => `Add ${name}`);
    const messages = { addItem };
    await renderPage("r1", { messages });
    const drawsBefore = addItem.mock.calls.length;

    search("a");
    search("an");

    expect(addItem.mock.calls.length).toBe(drawsBefore);
  });
});

describe("RestaurantPage: the server changed the cart", () => {
  const PRICE_UP = { itemId: "tikka", reason: "price_changed" as const, newPrice: 24000 };
  const SOLD_OUT = { itemId: "naan", reason: "unavailable" as const };

  async function placeAndGetRefused(changes: (typeof PRICE_UP | typeof SOLD_OUT)[]) {
    const view = await renderPage();
    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Add Butter Naan"));
    button("Place order").focus();
    fireEvent.click(button("Place order"));
    await act(async () => view.placeCalls[0].answer.reject(new CartChangedError(changes)));
    return view;
  }

  it("shows the new price, the new total, and asks the user to confirm", async () => {
    const { onOrderPlaced } = await placeAndGetRefused([PRICE_UP]);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The restaurant changed something.");
    expect(alert).toHaveTextContent("Paneer Tikka now costs ₹240.00.");
    expect(screen.getByText("2 items · ₹300.00")).toBeInTheDocument();
    expect(screen.getByText("Veg · ₹240.00")).toBeInTheDocument();
    expect(button("Confirm and place order")).not.toHaveAttribute("aria-disabled", "true");
    expect(onOrderPlaced).not.toHaveBeenCalled();
  });

  it("keeps the focus on the button, which now says “Confirm”", async () => {
    await placeAndGetRefused([PRICE_UP]);

    expect(document.activeElement).toBe(button("Confirm and place order"));
  });

  it("sends the new price with a new key when the user confirms", async () => {
    const { placeCalls, onOrderPlaced } = await placeAndGetRefused([PRICE_UP]);

    fireEvent.click(button("Confirm and place order"));

    expect(placeCalls).toHaveLength(2);
    expect(placeCalls[1].cart).toEqual([
      { itemId: "tikka", quantity: 1, unitPrice: 24000 },
      { itemId: "naan", quantity: 1, unitPrice: 6000 },
    ]);
    expect(placeCalls[1].key).not.toBe(placeCalls[0].key);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(async () => placeCalls[1].answer.resolve(PLACED));
    expect(onOrderPlaced).toHaveBeenCalledWith(PLACED);
  });

  it("takes a sold-out dish out of the cart and says so", async () => {
    await placeAndGetRefused([SOLD_OUT]);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Butter Naan is not available any more. We took it out.",
    );
    expect(screen.getByText("1 item · ₹220.00")).toBeInTheDocument();
    expect(savedCart()).toEqual([{ itemId: "tikka", quantity: 1 }]);
    expect(button("Add Butter Naan")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Veg · ₹60.00 · Unavailable")).toBeInTheDocument();
  });

  it("lists every change when two dishes changed", async () => {
    await placeAndGetRefused([PRICE_UP, SOLD_OUT]);

    const changes = Array.from(screen.getByRole("alert").querySelectorAll("li"));
    expect(changes.map((change) => change.textContent)).toEqual([
      "Paneer Tikka now costs ₹240.00.",
      "Butter Naan is not available any more. We took it out.",
    ]);
  });

  it("cannot confirm when every dish of the cart is sold out", async () => {
    const view = await renderPage();
    fireEvent.click(button("Add Butter Naan"));
    fireEvent.click(button("Place order"));
    await act(async () => view.placeCalls[0].answer.reject(new CartChangedError([SOLD_OUT])));

    fireEvent.click(button("Confirm and place order"));

    expect(button("Confirm and place order")).toHaveAttribute("aria-disabled", "true");
    expect(view.placeCalls).toHaveLength(1);
  });

  it("keeps the new price when the user changes the cart after the refusal", async () => {
    const { placeCalls } = await placeAndGetRefused([PRICE_UP]);

    fireEvent.click(button("Add Paneer Tikka"));
    expect(screen.getByText("3 items · ₹540.00")).toBeInTheDocument();

    fireEvent.click(button("Confirm and place order"));
    expect(placeCalls[1].cart[0]).toEqual({ itemId: "tikka", quantity: 2, unitPrice: 24000 });
  });
});

describe("RestaurantPage: texts, language and currency", () => {
  it("has no fixed English: every text can be replaced", async () => {
    // Every default text is replaced by its own name, or by a function that gives it.
    const mark = (key: string, value: unknown): unknown => {
      if (typeof value === "function") {
        return () => `[${key}]`;
      }
      return typeof value === "string"
        ? `[${key}]`
        : Object.fromEntries(Object.keys(value as object).map((inner) => [inner, `[${key}]`]));
    };
    const marked = Object.fromEntries(
      Object.entries(DEFAULT_MESSAGES).map(([key, value]) => [key, mark(key, value)]),
    ) as RestaurantPageProps["messages"];

    const { container } = await renderPage("r1", { messages: marked });
    fireEvent.click(screen.getAllByRole("button", { name: "[addItem]" })[0]);

    // What is left after the marked texts, the prices and the names from the server.
    const leftover = (container.textContent ?? "")
      .replace(/\[\w+\]/g, "")
      .replace(/Starters|Main course|Paneer Tikka|Butter Naan|Biryani/g, "")
      .replace(/[₹\d.,·−+\s]/g, "");
    expect(leftover).toBe("");
    expect(screen.getByRole("region", { name: "[menuLabel]" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "[searchLabel]" })).toBeInTheDocument();
  });

  it("uses the texts the app gives, and the default for the others", async () => {
    await renderPage("r1", { messages: { placeOrder: "ऑर्डर करें" } });

    expect(button("ऑर्डर करें")).toBeInTheDocument();
    expect(button("Add Paneer Tikka")).toBeInTheDocument();
  });

  it("writes the item count with the plural rules of English", async () => {
    expect(DEFAULT_MESSAGES.itemCount(0)).toBe("0 items");
    expect(DEFAULT_MESSAGES.itemCount(1)).toBe("1 item");
    expect(DEFAULT_MESSAGES.itemCount(2)).toBe("2 items");
    expect(DEFAULT_MESSAGES.searchResults(1)).toBe("1 dish found");
    expect(DEFAULT_MESSAGES.searchResults(5)).toBe("5 dishes found");
  });

  it("writes prices in rupees for India by default", async () => {
    await renderPage();

    expect(screen.getByText("Veg · ₹220.00")).toBeInTheDocument();
  });

  it("writes prices in the locale and currency the app gives, and follows a change", async () => {
    const { showRestaurant } = await renderPage("r1", { locale: "de-DE", currency: "EUR" });
    expect(screen.getByText(/^Veg · 220,00\s€$/)).toBeInTheDocument();

    await showRestaurant("r1", { locale: "en-US", currency: "USD" });
    expect(screen.getByText("Veg · $220.00")).toBeInTheDocument();
  });
});

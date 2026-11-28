/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you say these cases aloud and walk through one or two.
 * Here they are written as tests, so you can see that the code handles them.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MENU, createDeferred, makeOrder } from "../testUtils";
import type { Deferred } from "../testUtils";
import { RestaurantPage } from "./RestaurantPage";
import type { CartLine, MenuCategory, Order, PlaceOrder } from "./types";

const PLACED = makeOrder("placed", 100);

interface PlaceCall {
  cart: CartLine[];
  key: string;
  answer: Deferred<Order>;
}

async function renderPage(restaurantId = "r1") {
  const placeCalls: PlaceCall[] = [];
  const placeOrder: PlaceOrder = (cart, key) => {
    const answer = createDeferred<Order>();
    placeCalls.push({ cart, key, answer });
    return answer.promise;
  };
  const fetchMenu = vi.fn().mockResolvedValue(MENU);
  const onOrderPlaced = vi.fn();
  const props = { fetchMenu, placeOrder, onOrderPlaced };

  const view = render(<RestaurantPage restaurantId={restaurantId} {...props} />);
  await act(async () => {});

  const showRestaurant = async (id: string) => {
    view.rerender(<RestaurantPage restaurantId={id} {...props} />);
    await act(async () => {});
  };
  return { ...view, placeCalls, fetchMenu, onOrderPlaced, showRestaurant };
}

const button = (name: string) => screen.getByRole("button", { name });

const savedCart = (restaurantId = "r1") =>
  JSON.parse(sessionStorage.getItem(`cart:${restaurantId}`) ?? "null");

beforeEach(() => {
  sessionStorage.clear();
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

  it("tells screen readers the new count and total after every cart change", async () => {
    await renderPage();
    const status = screen.getByRole("status");

    fireEvent.click(button("Add Paneer Tikka"));
    expect(status).toHaveTextContent("1 item · ₹220.00");

    fireEvent.click(button("Remove one Paneer Tikka"));
    expect(status).toHaveTextContent("0 items · ₹0.00");
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

  it("does not count or send a saved dish that is unavailable now", async () => {
    sessionStorage.setItem(
      "cart:r1",
      JSON.stringify([
        { itemId: "biryani", quantity: 2 },
        { itemId: "naan", quantity: 1 },
      ]),
    );
    const { placeCalls } = await renderPage();
    expect(screen.getByText("1 item · ₹60.00")).toBeInTheDocument();

    fireEvent.click(button("Place order"));

    expect(placeCalls[0].cart).toEqual([{ itemId: "naan", quantity: 1 }]);
  });

  it("empties the saved cart after the order, also when the parent removes the page at once", async () => {
    const view = await renderPage();
    view.onOrderPlaced.mockImplementation(() => view.unmount());
    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Place order"));

    await act(async () => view.placeCalls[0].answer.resolve(PLACED));

    expect(savedCart()).toEqual([]);
  });

  it("keeps the saved cart when the order fails", async () => {
    const { placeCalls } = await renderPage();
    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Place order"));

    await act(async () => placeCalls[0].answer.reject(new Error("timeout")));

    expect(savedCart()).toEqual([{ itemId: "tikka", quantity: 1 }]);
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

    expect(screen.getByText("10 items · ₹2200.00")).toBeInTheDocument();
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
    expect(placeCalls[0].cart).toEqual([{ itemId: "tikka", quantity: 1 }]);
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
    expect(screen.getByText("0 items · ₹0.00")).toBeInTheDocument();
  });

  it("keeps the cart and shows an error when the request fails", async () => {
    const { placeCalls, onOrderPlaced } = await renderPage();
    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Place order"));

    await act(async () => placeCalls[0].answer.reject(new Error("timeout")));

    expect(screen.getByRole("alert")).toHaveTextContent("We could not place the order.");
    expect(screen.getByText("1 item · ₹220.00")).toBeInTheDocument();
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
});

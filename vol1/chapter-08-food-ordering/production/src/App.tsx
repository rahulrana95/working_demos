/*
 * NOT PART OF THE INTERVIEW: production version.
 * The demo page. It shows the ordering flow: the restaurant page, a fake
 * payment page, and the status page. A small panel shows every request that
 * reached the fake server and the last events.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { HOME_POSITION, createFakeServer } from "./api/fakeServer";
import { OrderingFlow } from "./ordering";
import type { Order, OrderingEvent, OrderingMessages } from "./ordering";

const RESTAURANT_ID = "spice-garden";
const REQUESTS_ON_SCREEN = 12;
const EVENTS_ON_SCREEN = 8;
const CART_REFRESH_MS = 300;
/** The address of the fake payment page: this page, with the id of the order to pay. */
const PAYMENT_PARAM = "pay";

const hindiPlurals = new Intl.PluralRules("hi");

// Simple Hindi. The names of the dishes come from the server, so they stay as they are.
const HINDI_MESSAGES: OrderingMessages = {
  menuLabel: "मेन्यू",
  loadingMenu: "मेन्यू लोड हो रहा है…",
  menuError: "मेन्यू लोड नहीं हो सका।",
  retry: "फिर से कोशिश करें",
  categories: "मेन्यू की श्रेणियाँ",
  searchLabel: "मेन्यू में खोजें",
  searchResults: (count) =>
    hindiPlurals.select(count) === "one" ? `${count} व्यंजन मिला` : `${count} व्यंजन मिले`,
  veg: "शाकाहारी",
  nonVeg: "मांसाहारी",
  unavailable: "उपलब्ध नहीं",
  addItem: (name) => `${name} जोड़ें`,
  removeOne: (name) => `एक ${name} हटाएँ`,
  quantityOf: (name) => `${name} की संख्या`,
  itemCount: (count) => `${count} आइटम`,
  cartChange: (name, quantity, total) => `${name}: कार्ट में ${quantity}। कुल ${total}।`,
  cartLabel: "कार्ट",
  placeOrder: "ऑर्डर करें",
  placingOrder: "ऑर्डर भेजा जा रहा है…",
  orderFailed: "ऑर्डर नहीं हो सका। आपका कार्ट सुरक्षित है। फिर से कोशिश करें।",
  orderTimedOut:
    "ऑर्डर में बहुत समय लग गया। आपका कार्ट सुरक्षित है। फिर से कोशिश करें: दो ऑर्डर नहीं बनेंगे।",
  cartChanged: "रेस्तराँ ने कुछ बदला है। अपना कार्ट देखें, फिर पुष्टि करें।",
  priceChanged: (name, price) => `${name} का दाम अब ${price} है।`,
  itemUnavailable: (name) => `${name} अब उपलब्ध नहीं है। हमने इसे हटा दिया।`,
  confirmOrder: "पुष्टि करें और ऑर्डर करें",
  orderHeading: "आपका ऑर्डर",
  loadingOrder: "आपका ऑर्डर लोड हो रहा है…",
  reconnecting: "फिर से जुड़ रहे हैं…",
  eta: (minutes) => `लगभग ${minutes} मिनट में पहुँचेगा`,
  stepDone: "(पूरा हुआ)",
  status: {
    placed: "ऑर्डर मिल गया",
    accepted: "रेस्तराँ ने ऑर्डर स्वीकार किया",
    preparing: "खाना बन रहा है",
    picked_up: "कूरियर ने खाना ले लिया",
    arriving: "कूरियर पास में है",
    delivered: "पहुँचा दिया गया",
    cancelled: "ऑर्डर रद्द हुआ",
  },
  courierDistance: (name, distance) => `${name} लगभग ${distance} किमी दूर है`,
  mapUnavailable: "नक्शा उपलब्ध नहीं है।",
  offline: "लगता है आप ऑफ़लाइन हैं। हम कोशिश करते रहेंगे।",
  savedMenu: "यह पहले सहेजा गया मेन्यू है। कोई दाम बदला हो सकता है।",
  updatedJustNow: "एक मिनट से कम पहले अपडेट हुआ",
  updatedAgo: (timeAgo) => `${timeAgo} अपडेट हुआ`,
  notifyMe: "स्थिति बदलने पर मुझे बताएँ",
  notificationsOn: "स्थिति बदलने पर हम आपको बताएँगे।",
  notificationsBlocked: "आपके ब्राउज़र की सेटिंग में सूचनाएँ बंद हैं।",
  backToMenu: "मेन्यू पर वापस जाएँ",
};

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="panel__toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function readSavedCart(): string {
  try {
    return sessionStorage.getItem(`cart:${RESTAURANT_ID}`) ?? "[]";
  } catch {
    return "[]";
  }
}

/**
 * The page of the "payment provider". It is not our app: the browser loaded
 * a new page to get here, and loads a new page again to go back.
 */
function FakePaymentPage({ orderId }: { orderId: string }) {
  return (
    <main className="page">
      <h1>Fake payment provider</h1>
      <p className="page__intro">
        You left the food app with a full page load. Its memory is gone. Order {orderId} is waiting
        for your payment.
      </p>
      <a className="button button--primary" href={window.location.pathname}>
        Pay and go back to the food app
      </a>
    </main>
  );
}

/**
 * How long the order stays in one status. The address can set it, for example
 * `?stepMs=480000` for a real order of 40 minutes. scripts/measure-requests.mjs uses this.
 */
function readStepMs(): number | undefined {
  const stepMs = Number(new URLSearchParams(window.location.search).get("stepMs"));
  return Number.isFinite(stepMs) && stepMs > 0 ? stepMs : undefined;
}

export function App() {
  const orderToPay = new URLSearchParams(window.location.search).get(PAYMENT_PARAM);
  return orderToPay === null ? <FoodApp /> : <FakePaymentPage orderId={orderToPay} />;
}

function FoodApp() {
  const [requestLog, setRequestLog] = useState<string[]>([]);
  const [events, setEvents] = useState<OrderingEvent[]>([]);
  const [savedCart, setSavedCart] = useState(readSavedCart);
  const [isServerFailing, setIsServerFailing] = useState(false);
  const [isNetworkSlow, setIsNetworkSlow] = useState(false);
  const [sendsOldAnswers, setSendsOldAnswers] = useState(false);
  const [usesStream, setUsesStream] = useState(true);
  const [isStreamBroken, setIsStreamBroken] = useState(false);
  const [hasMenuChanged, setHasMenuChanged] = useState(false);
  const [paysOutside, setPaysOutside] = useState(false);
  const [isHindi, setIsHindi] = useState(false);
  const [isRightToLeft, setIsRightToLeft] = useState(false);

  // The server is created once. It reads the checkbox values from a ref, so
  // ticking a checkbox does not create a new server.
  const toggles = {
    isServerFailing,
    isNetworkSlow,
    sendsOldAnswers,
    isStreamBroken,
    hasMenuChanged,
  };
  const togglesRef = useRef(toggles);
  useEffect(() => {
    togglesRef.current = toggles;
  });

  const server = useMemo(
    () =>
      createFakeServer({
        shouldFail: () => togglesRef.current.isServerFailing,
        isSlow: () => togglesRef.current.isNetworkSlow,
        sendsOldAnswers: () => togglesRef.current.sendsOldAnswers,
        isStreamBroken: () => togglesRef.current.isStreamBroken,
        hasMenuChanged: () => togglesRef.current.hasMenuChanged,
        onRequest: (line) => setRequestLog((log) => [...log, line]),
        stepMs: readStepMs(),
      }),
    [],
  );

  // The cart lives inside the restaurant page. The panel reads the saved copy.
  useEffect(() => {
    const timerId = setInterval(() => setSavedCart(readSavedCart()), CART_REFRESH_MS);
    return () => clearInterval(timerId);
  }, []);

  function recordEvent(event: OrderingEvent): void {
    setEvents((log) => [...log, event].slice(-EVENTS_ON_SCREEN));
  }

  function goToPaymentPage(order: Order): void {
    window.location.assign(`?${PAYMENT_PARAM}=${encodeURIComponent(order.id)}`);
  }

  return (
    <main className="page" dir={isRightToLeft ? "rtl" : "ltr"} lang={isHindi ? "hi" : "en"}>
      <h1 lang="en">Chapter 8: Food ordering and live order status, production version</h1>
      <p className="page__intro" lang="en">
        Add a few dishes and place the order. Everything works with the keyboard.
      </p>

      <OrderingFlow
        restaurantId={RESTAURANT_ID}
        fetchMenu={server.fetchMenu}
        placeOrder={server.placeOrder}
        fetchOrder={server.fetchOrder}
        subscribeToOrder={usesStream ? server.subscribeToOrder : undefined}
        destination={HOME_POSITION}
        startPayment={paysOutside ? goToPaymentPage : undefined}
        messages={isHindi ? HINDI_MESSAGES : undefined}
        locale={isHindi ? "hi-IN" : "en-IN"}
        onEvent={recordEvent}
      />

      <section className="panel" aria-label="What is happening" lang="en" dir="ltr">
        <Toggle
          label="Make the server fail"
          checked={isServerFailing}
          onChange={setIsServerFailing}
        />
        <Toggle label="Slow network" checked={isNetworkSlow} onChange={setIsNetworkSlow} />
        <Toggle
          label="Send an old update late"
          checked={sendsOldAnswers}
          onChange={setSendsOldAnswers}
        />
        <Toggle label="Use the live stream" checked={usesStream} onChange={setUsesStream} />
        <Toggle
          label="Break the stream (requests still work)"
          checked={isStreamBroken}
          onChange={setIsStreamBroken}
        />
        <Toggle
          label="Change a price and sell out a dish on the server"
          checked={hasMenuChanged}
          onChange={setHasMenuChanged}
        />
        <Toggle
          label="Pay on an outside page (full page load)"
          checked={paysOutside}
          onChange={setPaysOutside}
        />
        <Toggle label="Texts in Hindi" checked={isHindi} onChange={setIsHindi} />
        <Toggle label="Right to left" checked={isRightToLeft} onChange={setIsRightToLeft} />

        <p>
          <strong>Orders the server created: {server.countOrders()}</strong>
        </p>
        <p>
          <strong>Requests sent to the server: {requestLog.length}</strong>
        </p>
        <ol
          className="panel__log"
          aria-label="Last requests"
          start={Math.max(1, requestLog.length - REQUESTS_ON_SCREEN + 1)}
        >
          {requestLog.slice(-REQUESTS_ON_SCREEN).map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ol>

        <p>
          <strong>Last events</strong>
        </p>
        <ul className="panel__log" aria-label="Last events">
          {events.map((event, index) => (
            <li key={index}>{JSON.stringify(event)}</li>
          ))}
        </ul>

        <p>
          <strong>Saved cart</strong> (sessionStorage)
        </p>
        <pre className="panel__json" aria-label="Saved cart">
          {savedCart}
        </pre>
        <p className="panel__hint">
          Open this page in a second tab and change the cart: both tabs show the same cart. Tick
          “Pay on an outside page” and place an order: the app loads again and finds the order. An
          event holds counts and times, never a name, an address or a position.
        </p>
      </section>
    </main>
  );
}

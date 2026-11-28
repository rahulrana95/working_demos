/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. It shows the restaurant page, and after an order the status
 * page. A small panel shows every request that reached the fake server.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createFakeServer } from "./api/fakeServer";
import { OrderStatusPage, RestaurantPage } from "./ordering";

const RESTAURANT_ID = "spice-garden";
const REQUESTS_ON_SCREEN = 12;

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

/**
 * How long the order stays in one status. The address can set it, for example
 * `?stepMs=480000` for a real order of 40 minutes. scripts/measure-requests.mjs uses this.
 */
function readStepMs(): number | undefined {
  const stepMs = Number(new URLSearchParams(window.location.search).get("stepMs"));
  return Number.isFinite(stepMs) && stepMs > 0 ? stepMs : undefined;
}

export function App() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [requestLog, setRequestLog] = useState<string[]>([]);
  const [isServerFailing, setIsServerFailing] = useState(false);
  const [isNetworkSlow, setIsNetworkSlow] = useState(false);
  const [sendsOldAnswers, setSendsOldAnswers] = useState(false);
  const [usesStream, setUsesStream] = useState(true);
  const [isStreamBroken, setIsStreamBroken] = useState(false);

  // The server is created once. It reads the checkbox values from a ref, so
  // ticking a checkbox does not create a new server.
  const toggles = { isServerFailing, isNetworkSlow, sendsOldAnswers, isStreamBroken };
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
        onRequest: (line) => setRequestLog((log) => [...log, line]),
        stepMs: readStepMs(),
      }),
    [],
  );

  // The page under the heading changed. Focus moves to the heading, so a
  // keyboard or screen reader user starts at the top of the new page.
  const headingRef = useRef<HTMLHeadingElement>(null);
  function showPage(nextOrderId: string | null): void {
    setOrderId(nextOrderId);
    headingRef.current?.focus();
  }

  return (
    <main className="page">
      <h1 ref={headingRef} tabIndex={-1}>
        Chapter 8: Food ordering and live order status
      </h1>

      {orderId === null ? (
        <>
          <p className="page__intro">
            Add a few dishes and place the order. Everything works with the keyboard.
          </p>
          <RestaurantPage
            restaurantId={RESTAURANT_ID}
            fetchMenu={server.fetchMenu}
            placeOrder={server.placeOrder}
            onOrderPlaced={(order) => showPage(order.id)}
          />
        </>
      ) : (
        <>
          <OrderStatusPage
            orderId={orderId}
            fetchOrder={server.fetchOrder}
            subscribeToOrder={usesStream ? server.subscribeToOrder : undefined}
          />
          <button type="button" className="button" onClick={() => showPage(null)}>
            Back to the menu
          </button>
        </>
      )}

      <section className="panel" aria-label="What is happening">
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

        <p className="panel__hint">
          Press “Place order” twice quickly: the server creates one order. On the status page, make
          the server fail and see “Reconnecting…” while the last status stays. Tick “Break the
          stream”: after three reconnects the page polls.
        </p>
      </section>
    </main>
  );
}

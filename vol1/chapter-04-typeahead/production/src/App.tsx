/*
 * NOT PART OF THE INTERVIEW: production version.
 * The demo page. It shows two typeaheads that share one cache, and a panel
 * with every request that reached the fake server and the last few events.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createCitySearch } from "./api/searchCities";
import type { City } from "./api/searchCities";
import { Typeahead } from "./typeahead";
import type { TypeaheadEvent, TypeaheadMessages } from "./typeahead";

const hindiPlurals = new Intl.PluralRules("hi");

const HINDI_MESSAGES: TypeaheadMessages = {
  searching: "खोज रहे हैं…",
  noResults: (query) => `“${query}” के लिए कोई नतीजा नहीं मिला`,
  error: "कुछ गड़बड़ हो गई।",
  offline: "आप ऑफ़लाइन हैं।",
  timeout: "खोज में बहुत समय लग गया।",
  retry: "फिर से कोशिश करें",
  // Hindi has the same two forms as English, but its own rule for when to use "one".
  resultsAvailable: (count) =>
    hindiPlurals.select(count) === "one" ? `${count} नतीजा उपलब्ध है` : `${count} नतीजे उपलब्ध हैं`,
};

const EVENTS_ON_SCREEN = 6;

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

function describeCity(city: City | null): string {
  return city === null ? "Nothing yet" : `${city.name}, ${city.state}`;
}

export function App() {
  const [fromCity, setFromCity] = useState<City | null>(null);
  const [toCity, setToCity] = useState<City | null>(null);
  const [requestLog, setRequestLog] = useState<string[]>([]);
  const [events, setEvents] = useState<TypeaheadEvent[]>([]);
  const [isServerFailing, setIsServerFailing] = useState(false);
  const [isServerRateLimited, setIsServerRateLimited] = useState(false);
  const [isServerVerySlow, setIsServerVerySlow] = useState(false);
  const [isRightToLeft, setIsRightToLeft] = useState(false);
  const [isHindi, setIsHindi] = useState(false);

  // The search function is created once. It reads the checkbox values from a
  // ref, so ticking a checkbox does not create a new function.
  const serverRef = useRef({ isServerFailing, isServerRateLimited, isServerVerySlow });
  useEffect(() => {
    serverRef.current = { isServerFailing, isServerRateLimited, isServerVerySlow };
  }, [isServerFailing, isServerRateLimited, isServerVerySlow]);

  const searchCities = useMemo(
    () =>
      createCitySearch({
        shouldFail: () => serverRef.current.isServerFailing,
        shouldRateLimit: () => serverRef.current.isServerRateLimited,
        shouldBeVerySlow: () => serverRef.current.isServerVerySlow,
        onRequest: (query) => setRequestLog((log) => [...log, query]),
      }),
    [],
  );

  function recordEvent(event: TypeaheadEvent) {
    setEvents((log) => [...log, event].slice(-EVENTS_ON_SCREEN));
  }

  // Both typeaheads get the same props, except the label and what they select.
  const sharedProps = {
    placeholder: "Search a city",
    search: searchCities,
    getItemLabel: (city: City) => `${city.name}, ${city.state}`,
    getItemKey: (city: City) => city.id,
    renderItem: (city: City) => (
      <>
        <strong className="city__name">{city.name}</strong>
        <span className="city__state">{city.state}</span>
      </>
    ),
    messages: isHindi ? HINDI_MESSAGES : undefined,
    cacheKey: "places",
    onEvent: recordEvent,
  };

  return (
    <main className="page" dir={isRightToLeft ? "rtl" : "ltr"}>
      <h1>Chapter 4: Typeahead, production version</h1>
      <p className="page__intro">
        Type at least two letters of an Indian city, for example <kbd>mu</kbd> or <kbd>pur</kbd>.
        Use the arrow keys, Enter and Escape.
      </p>

      <Typeahead label="From" onSelect={setFromCity} {...sharedProps} />
      <Typeahead label="To" onSelect={setToCity} {...sharedProps} />

      <section className="panel" aria-label="What is happening">
        <p>
          <strong>From:</strong> {describeCity(fromCity)}
        </p>
        <p>
          <strong>To:</strong> {describeCity(toCity)}
        </p>

        <Toggle
          label="Make the server fail"
          checked={isServerFailing}
          onChange={setIsServerFailing}
        />
        <Toggle
          label="Server is rate limited (429 once)"
          checked={isServerRateLimited}
          onChange={setIsServerRateLimited}
        />
        <Toggle
          label="Server is very slow (times out)"
          checked={isServerVerySlow}
          onChange={setIsServerVerySlow}
        />
        <Toggle label="Right to left" checked={isRightToLeft} onChange={setIsRightToLeft} />
        <Toggle label="Messages in Hindi" checked={isHindi} onChange={setIsHindi} />

        <p>
          <strong>Requests sent to the server: {requestLog.length}</strong>
        </p>
        <ol className="panel__log">
          {requestLog.map((query, index) => (
            <li key={index}>{query}</li>
          ))}
        </ol>
        <p className="panel__hint">
          Type <kbd>mum</kbd> in “From”, then in “To”. The second box sends no request, because both
          boxes share one cache.
        </p>

        <p>
          <strong>Last events</strong>
        </p>
        <ul className="panel__log" aria-label="Last events">
          {events.map((event, index) => (
            <li key={index}>{JSON.stringify(event)}</li>
          ))}
        </ul>
        <p className="panel__hint">
          An event holds the length of the text, never the text. Turn the network off in the
          developer tools and tick “Make the server fail” to see the offline message.
        </p>
      </section>
    </main>
  );
}

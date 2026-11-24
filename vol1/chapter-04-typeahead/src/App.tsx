/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. It shows the typeahead and a small panel with every request
 * that reached the fake server.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createCitySearch } from "./api/searchCities";
import type { City } from "./api/searchCities";
import { Typeahead } from "./typeahead";

export function App() {
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [requestLog, setRequestLog] = useState<string[]>([]);
  const [isServerFailing, setIsServerFailing] = useState(false);

  // The search function is created once. It reads the checkbox value from a
  // ref, so ticking the checkbox does not create a new function.
  const isServerFailingRef = useRef(isServerFailing);
  useEffect(() => {
    isServerFailingRef.current = isServerFailing;
  }, [isServerFailing]);

  const searchCities = useMemo(
    () =>
      createCitySearch({
        shouldFail: () => isServerFailingRef.current,
        onRequest: (query) => setRequestLog((log) => [...log, query]),
      }),
    [],
  );

  return (
    <main className="page">
      <h1>Chapter 4: Typeahead</h1>
      <p className="page__intro">
        Type at least two letters of an Indian city, for example <kbd>mu</kbd> or <kbd>pur</kbd>.
        Use the arrow keys, Enter and Escape.
      </p>

      <Typeahead
        label="City"
        placeholder="Search a city"
        search={searchCities}
        getItemLabel={(city) => `${city.name}, ${city.state}`}
        getItemKey={(city) => city.id}
        onSelect={setSelectedCity}
      />

      <section className="panel" aria-label="What is happening">
        <p>
          <strong>Selected:</strong>{" "}
          {selectedCity === null ? "Nothing yet" : `${selectedCity.name}, ${selectedCity.state}`}
        </p>

        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={isServerFailing}
            onChange={(event) => setIsServerFailing(event.target.checked)}
          />
          Make the server fail
        </label>

        <p>
          <strong>Requests sent to the server: {requestLog.length}</strong>
        </p>
        <ol className="panel__log">
          {requestLog.map((query, index) => (
            <li key={index}>{query}</li>
          ))}
        </ol>
        <p className="panel__hint">
          Type fast and see that only the last text is sent. Delete a letter and type it again, and
          no new request is sent, because the answer comes from the cache.
        </p>
      </section>
    </main>
  );
}

/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. It shows the typeahead and a small panel with every request
 * that reached the fake server. It also shows three of the staff-level
 * additions: a custom row, translated messages and right-to-left layout.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createCitySearch } from "./api/searchCities";
import type { City } from "./api/searchCities";
import { Typeahead } from "./typeahead";
import type { TypeaheadMessages } from "./typeahead";

const HINDI_MESSAGES: TypeaheadMessages = {
  searching: "खोज रहे हैं…",
  noResults: (query) => `“${query}” के लिए कोई नतीजा नहीं मिला`,
  error: "कुछ गड़बड़ हो गई।",
  retry: "फिर से कोशिश करें",
  // Hindi, like English, has a different form for one result.
  resultsAvailable: (count) => (count === 1 ? "1 नतीजा उपलब्ध है" : `${count} नतीजे उपलब्ध हैं`),
};

export function App() {
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [requestLog, setRequestLog] = useState<string[]>([]);
  const [isServerFailing, setIsServerFailing] = useState(false);
  const [isRightToLeft, setIsRightToLeft] = useState(false);
  const [isHindi, setIsHindi] = useState(false);

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
    <main className="page" dir={isRightToLeft ? "rtl" : "ltr"}>
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
        renderItem={(city) => (
          <>
            <strong className="city__name">{city.name}</strong>
            <span className="city__state">{city.state}</span>
          </>
        )}
        messages={isHindi ? HINDI_MESSAGES : undefined}
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

        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={isRightToLeft}
            onChange={(event) => setIsRightToLeft(event.target.checked)}
          />
          Right to left
        </label>

        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={isHindi}
            onChange={(event) => setIsHindi(event.target.checked)}
          />
          Messages in Hindi
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

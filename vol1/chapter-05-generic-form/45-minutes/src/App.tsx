/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. It shows a form drawn from a schema, and a small panel with
 * the values that reached the fake server and the schema itself.
 */
import { useEffect, useRef, useState } from "react";
import { createStressSchema, createSubmit, onboardingSchema } from "./api/onboarding";
import { Form } from "./form";
import type { FormValues } from "./form";

/**
 * Open the page with `?fields=300` to get a form with 300 text fields. The
 * script in `../scripts/measure-typing.mjs` uses it to time a key press.
 */
function getSchema() {
  const fieldCount = Number(new URLSearchParams(window.location.search).get("fields"));
  return fieldCount >= 1 && fieldCount <= 2000
    ? createStressSchema(Math.floor(fieldCount))
    : onboardingSchema;
}

const schema = getSchema();

export function App() {
  const [submittedValues, setSubmittedValues] = useState<FormValues | null>(null);
  const [isServerFailing, setIsServerFailing] = useState(false);

  // The submit function is created once. It reads the tick box from a ref,
  // so it always sees the value of the moment the server "answers".
  const isServerFailingRef = useRef(isServerFailing);
  useEffect(() => {
    isServerFailingRef.current = isServerFailing;
  }, [isServerFailing]);

  // useState with a function creates the fake server once, on the first render.
  const [submitToServer] = useState(() =>
    createSubmit({ shouldFail: () => isServerFailingRef.current }),
  );

  async function handleSubmit(values: FormValues) {
    setSubmittedValues(await submitToServer(values));
  }

  return (
    <main className="page">
      <h1>Chapter 5: Generic form</h1>
      <p className="page__intro">
        This form is drawn from a schema, which is plain data. Press <kbd>Tab</kbd> to move,{" "}
        <kbd>Space</kbd> to tick a box and <kbd>Enter</kbd> to send. Choose “Contractor” or “India”
        and see a new field appear.
      </p>

      <Form schema={schema} onSubmit={handleSubmit} />

      <section className="panel" aria-label="What is happening">
        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={isServerFailing}
            onChange={(event) => setIsServerFailing(event.target.checked)}
          />
          Make the server fail
        </label>

        {/* A screen reader reads this box when the server has taken the form. */}
        <div role="status">
          <p>
            <strong>Sent to the server:</strong>{" "}
            {submittedValues === null ? "Nothing yet" : "these values"}
          </p>
          {submittedValues !== null && (
            <pre className="panel__code">{JSON.stringify(submittedValues, null, 2)}</pre>
          )}
        </div>

        <details>
          <summary>The schema of this form</summary>
          <pre className="panel__code">{JSON.stringify(schema, null, 2)}</pre>
        </details>

        <p className="panel__hint">
          Hidden fields are not sent. Choose “Contractor”, type a company name, choose “Full-time”
          again and send: the company name is not in the values.
        </p>
      </section>
    </main>
  );
}

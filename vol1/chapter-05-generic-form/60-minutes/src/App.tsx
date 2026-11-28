/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. It shows a form drawn from a schema, and a small panel with
 * switches for each part of the staff answer.
 */
import { useEffect, useRef, useState } from "react";
import {
  checkEmailIsFree,
  createStressSchema,
  createSubmit,
  onboardingSchema,
  REFUSED_COMPANY,
  TAKEN_EMAIL,
} from "./api/onboarding";
import { HINDI_MESSAGES } from "./demo/hindiMessages";
import { RadioControl } from "./demo/RadioControl";
import { Form } from "./form";
import type { FieldTypeDefinition, FormValues } from "./form";

// These objects are made once, outside the component. The form asks for the
// same object on every render, so that it can skip the fields.
const FIELD_TYPES: Record<string, FieldTypeDefinition> = {
  radio: { component: RadioControl, isGroup: true },
};
const ASYNC_VALIDATORS = { emailIsFree: checkEmailIsFree };

/**
 * Open the page with `?fields=300` to start with the form of 300 fields. The
 * script in `../scripts/measure-typing.mjs` uses it to time a key press. It
 * can ask for another number of fields, up to 2,000.
 */
const askedFieldCount = Number(new URLSearchParams(window.location.search).get("fields"));
const startsWithStressTest = askedFieldCount >= 1 && askedFieldCount <= 2000;
const STRESS_SCHEMA = createStressSchema(startsWithStressTest ? Math.floor(askedFieldCount) : 300);

export function App() {
  const [submittedValues, setSubmittedValues] = useState<FormValues | null>(null);
  const [isServerFailing, setIsServerFailing] = useState(false);
  const [isHindi, setIsHindi] = useState(false);
  const [isStressTest, setIsStressTest] = useState(startsWithStressTest);
  const [showRenderCounts, setShowRenderCounts] = useState(false);

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

  const schema = isStressTest ? STRESS_SCHEMA : onboardingSchema;

  return (
    <main className="page">
      <h1>Chapter 5: Generic form</h1>
      <p className="page__intro">
        This form is drawn from a schema, which is plain data. Press <kbd>Tab</kbd> to move,{" "}
        <kbd>Space</kbd> to tick a box and <kbd>Enter</kbd> to send. Choose “Contractor” or “India”
        and see a new field appear.
      </p>

      <Form
        // A new key gives the other schema a new form with new, empty values.
        key={schema.id}
        schema={schema}
        onSubmit={handleSubmit}
        asyncValidators={ASYNC_VALIDATORS}
        fieldTypes={FIELD_TYPES}
        messages={isHindi ? HINDI_MESSAGES : undefined}
        showRenderCounts={showRenderCounts}
      />

      <section className="panel" aria-label="What is happening">
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
            checked={isHindi}
            onChange={(event) => setIsHindi(event.target.checked)}
          />
          Messages in Hindi
        </label>
        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={isStressTest}
            onChange={(event) => setIsStressTest(event.target.checked)}
          />
          Form with 300 fields
        </label>
        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={showRenderCounts}
            onChange={(event) => setShowRenderCounts(event.target.checked)}
          />
          Show how many times each field was drawn
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
          Type <kbd>{TAKEN_EMAIL}</kbd> as the email and wait: the server says it is taken. Send the
          company name <kbd>{REFUSED_COMPANY}</kbd>: the server puts an error on that field. Tick
          “300 fields” and “Show how many times”, then type: only one number goes up.
        </p>
      </section>
    </main>
  );
}

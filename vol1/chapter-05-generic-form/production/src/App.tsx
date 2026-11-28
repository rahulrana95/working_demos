/*
 * NOT PART OF THE INTERVIEW: production version.
 * The demo page. It shows a form drawn from a schema, and a panel that makes
 * the hidden work visible: the events for monitoring, the saved draft, and
 * the report on a broken schema.
 */
import { useEffect, useRef, useState } from "react";
import {
  brokenSchema,
  checkEmailIsFree,
  createStressSchema,
  createSubmit,
  onboardingSchema,
  REFUSED_COMPANY,
  TAKEN_EMAIL,
} from "./api/onboarding";
import { HINDI_MESSAGES } from "./demo/hindiMessages";
import { Form } from "./form";
import type { FormMonitorEvent, SubmitValues } from "./form";

// This object is made once, outside the component. The form asks for the
// same object on every render, so that it can skip the fields.
const ASYNC_VALIDATORS = { emailIsFree: checkEmailIsFree };
const DRAFT_KEY = `form-draft:${onboardingSchema.id}`;

/**
 * Open the page with `?fields=300` to start with the form of 300 fields. The
 * script in `../scripts/measure-typing.mjs` uses it to time a key press. It
 * can ask for another number of fields, up to 2,000.
 */
const askedFieldCount = Number(new URLSearchParams(window.location.search).get("fields"));
const startsWithStressTest = askedFieldCount >= 1 && askedFieldCount <= 2000;
const STRESS_SCHEMA = createStressSchema(startsWithStressTest ? Math.floor(askedFieldCount) : 300);

type SchemaChoice = "onboarding" | "stress" | "broken";
const SCHEMAS = { onboarding: onboardingSchema, stress: STRESS_SCHEMA, broken: brokenSchema };

function readDraft(): string {
  try {
    const text = window.sessionStorage.getItem(DRAFT_KEY);
    return text === null ? "No draft is saved." : JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return "The storage of this browser cannot be read.";
  }
}

export function App() {
  const [submittedValues, setSubmittedValues] = useState<SubmitValues | null>(null);
  const [events, setEvents] = useState<FormMonitorEvent[]>([]);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [isServerFailing, setIsServerFailing] = useState(false);
  const [isHindi, setIsHindi] = useState(false);
  const [schemaChoice, setSchemaChoice] = useState<SchemaChoice>(
    startsWithStressTest ? "stress" : "onboarding",
  );
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

  async function handleSubmit(values: SubmitValues, signal: AbortSignal) {
    setSubmittedValues(await submitToServer(values, signal));
  }

  const schema = SCHEMAS[schemaChoice];

  return (
    <main className="page">
      <h1>Chapter 5: Generic form</h1>
      <p className="page__intro">
        This form is drawn from a schema, which is plain data. Press <kbd>Tab</kbd> to move,{" "}
        <kbd>Space</kbd> to tick a box and <kbd>Enter</kbd> to go on. It has three steps, a group
        that repeats, and a draft that survives a reload of the page.
      </p>

      <Form
        // A new key gives the other schema a new form with new, empty values.
        key={schema.id}
        schema={schema}
        onSubmit={handleSubmit}
        asyncValidators={ASYNC_VALIDATORS}
        messages={isHindi ? HINDI_MESSAGES : undefined}
        saveDraft
        warnBeforeLeave
        onEvent={(event) => setEvents((log) => [...log, event])}
        // The demo shows the report in the built page too. A real app leaves the default.
        showSchemaProblems
        showRenderCounts={showRenderCounts}
      />

      <section className="panel" aria-label="What is happening">
        <fieldset className="panel__choices">
          <legend>Schema</legend>
          {(
            [
              ["onboarding", "New employee, in 3 steps"],
              ["stress", "Form with 300 fields"],
              ["broken", "A schema with mistakes"],
            ] as const
          ).map(([choice, label]) => (
            <label key={choice} className="panel__toggle">
              <input
                type="radio"
                name="schemaChoice"
                checked={schemaChoice === choice}
                onChange={() => setSchemaChoice(choice)}
              />
              {label}
            </label>
          ))}
        </fieldset>

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

        <p>
          <strong>Events for monitoring: {events.length}</strong>
        </p>
        <ol className="panel__log">
          {events.map((event, index) => (
            <li key={index}>{JSON.stringify(event)}</li>
          ))}
        </ol>

        <p>
          <button className="panel__button" type="button" onClick={() => setDraftText(readDraft())}>
            Show the saved draft
          </button>{" "}
          <button className="panel__button" type="button" onClick={() => window.location.reload()}>
            Load the page again
          </button>
        </p>
        {draftText !== null && <pre className="panel__code">{draftText}</pre>}

        <details>
          <summary>The schema of this form</summary>
          <pre className="panel__code">{JSON.stringify(schema, null, 2)}</pre>
        </details>

        <p className="panel__hint">
          Fill in a few fields, wait a moment and press “Show the saved draft”: the bank account
          number is never in it. Load the page again and your answers are back. Type{" "}
          <kbd>{TAKEN_EMAIL}</kbd> as the email and wait: the server says it is taken. Send the
          company name <kbd>{REFUSED_COMPANY}</kbd>: the form goes back to the step of that field.
          No event holds a value that you typed.
        </p>
      </section>
    </main>
  );
}

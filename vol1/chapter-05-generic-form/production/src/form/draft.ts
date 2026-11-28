/*
 * NOT PART OF THE INTERVIEW: production version.
 * Keeps the answers of a half-filled form in `sessionStorage`, so a reload or
 * a crash of the tab does not lose them. `sessionStorage` is emptied when the
 * tab is closed, which is right for a shared office computer.
 *
 * Nothing in this file may throw. Storage can be turned off, full, or blocked
 * in a private window. The form must work the same without it.
 */
import type { FieldValue, FormSchema, FormValues } from "./types";

export interface Draft {
  /** A field of a group item has the key "group.index.field". The first item has index 0. */
  values: FormValues;
  /** How many items each group had. */
  itemCounts: Record<string, number>;
}

const KEY_PREFIX = "form-draft:";

/** Only reading the property can already throw, for example in a sandboxed iframe. */
function getStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getKey(schema: FormSchema): string {
  return KEY_PREFIX + schema.id;
}

function getVersion(schema: FormSchema): number {
  return schema.version ?? 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldValue(value: unknown): value is FieldValue {
  return typeof value === "string" || typeof value === "boolean" || typeof value === "number";
}

/** Keeps the entries of a record that pass the test. What is in storage can be anything. */
function pick<T>(source: unknown, isWanted: (value: unknown) => value is T): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(isRecord(source) ? source : {})) {
    if (isWanted(value)) {
      result[key] = value;
    }
  }
  return result;
}

export function saveDraft(schema: FormSchema, draft: Draft): void {
  try {
    getStorage()?.setItem(
      getKey(schema),
      JSON.stringify({ version: getVersion(schema), ...draft }),
    );
  } catch {
    // The storage is full or blocked. A draft is a comfort, not a promise.
  }
}

export function clearDraft(schema: FormSchema): void {
  try {
    getStorage()?.removeItem(getKey(schema));
  } catch {
    // Nothing to do: see `saveDraft`.
  }
}

/** Returns the saved draft of this form, or null when there is none that we can use. */
export function loadDraft(schema: FormSchema): Draft | null {
  try {
    const text = getStorage()?.getItem(getKey(schema));
    if (text === null || text === undefined) {
      return null;
    }

    const saved: unknown = JSON.parse(text);
    // The fields have changed since the draft was saved. Its answers may not fit them.
    if (!isRecord(saved) || saved.version !== getVersion(schema)) {
      clearDraft(schema);
      return null;
    }

    return {
      values: pick(saved.values, isFieldValue),
      itemCounts: pick(
        saved.itemCounts,
        (count): count is number => Number.isInteger(count) && (count as number) >= 0,
      ),
    };
  } catch {
    // The text in storage is not JSON, or storage failed.
    clearDraft(schema);
    return null;
  }
}

/*
 * NOT PART OF THE INTERVIEW: production version.
 * The state of the form lives here, outside React.
 *
 * Why it holds at scale: each field listens to the store and reads only its
 * own value, error and visibility, so a key press in a form of 300 fields
 * draws one field again.
 *
 * On top of the staff answer the store knows about steps, groups that repeat,
 * the draft, time limits and the events for monitoring.
 *
 * How a group is held: every field of every item is one more entry in the
 * flat `values`, with the key "group.itemId.field". So a field in a group is
 * checked, focused and drawn again exactly like any other field. The item id
 * never changes, also when an item before it is removed.
 */
import { clearDraft, loadDraft, saveDraft } from "./draft";
import type { Draft } from "./draft";
import type {
  AsyncValidator,
  FieldSchema,
  FieldValue,
  FormErrors,
  FormMonitorEvent,
  FormSchema,
  FormValues,
  StepSchema,
  SubmitErrors,
  SubmitHandler,
} from "./types";
import {
  getDefaultValue,
  getInitialValues,
  getItemFieldName,
  getSubmitValues,
  isVisible,
  validateField,
  validateFields,
} from "./validation";
import { warnOnce } from "./warnOnce";

/** One control that the user fills in: a field outside a group, or a field of one group item. */
export interface LeafField extends FieldSchema {
  /** The name of the field or of its group in the schema. The steps use this name. */
  topName: string;
  /** The name for monitoring. For a field of a group it is "group.field", with no item id. */
  path: string;
  /** Set when the field belongs to an item of a group. */
  item?: { group: FieldSchema; id: number };
}

export interface FormState {
  values: FormValues;
  /** The ids of the items of each group, in the order on screen. */
  itemIds: Record<string, number[]>;
  /** One error for each field that was checked and is wrong, from our rules or from a server. */
  errors: FormErrors;
  /** The fields that the user has left, or that were on screen at a submit. */
  touched: Record<string, boolean>;
  /** The fields with a server check that has not answered yet. */
  checking: Record<string, boolean>;
  /** The errors found by the last press on Next or Submit. They do not change while the user types. */
  summaryErrors: FormErrors;
  /** The step on screen. A form without steps has one step, with index 0. */
  stepIndex: number;
  /** The steps the user tried to leave. Their fields are checked on every change. */
  attemptedSteps: number[];
  isSubmitting: boolean;
  /** Set when `onSubmit` failed with an error about the whole form. `message` is the server's text, if any. */
  submitError: { message?: string } | null;
  /** True when the user has changed something that was not sent yet. */
  isDirty: boolean;
  /**
   * Where focus must go after the next draw: the name of a field, or one of
   * the targets below. A new object each time, so the same target works twice.
   */
  focusRequest: { target: string } | null;
}

/** The focus target for the heading of the step on screen. */
export const STEP_HEADING_TARGET = ":step";
/** The focus targets for the buttons of a group. A colon cannot be part of a field id. */
export const getAddButtonTarget = (groupName: string) => `${groupName}:add`;
export const getRemoveButtonTarget = (groupName: string, itemId: number) =>
  `${groupName}.${itemId}:remove`;

/** What the form component gives the store. It is read at the moment it is needed. */
export interface FormStoreOptions {
  onSubmit: SubmitHandler;
  asyncValidators: Record<string, AsyncValidator>;
  debounceMs: number;
  /** A server check that takes longer than this counts as failed. The user is not blamed. */
  asyncTimeoutMs: number;
  /** An `onSubmit` that takes longer than this is given up, and the user can try again. */
  submitTimeoutMs: number;
  saveDraft: boolean;
  draftDebounceMs: number;
  onEvent: ((event: FormMonitorEvent) => void) | undefined;
}

/** One server check that waits for its timer or for its answer. */
interface PendingCheck {
  controller: AbortController;
  /** Settles when the check has answered or was cancelled. Submit waits for it. */
  done: Promise<void>;
}

export type FormStore = ReturnType<typeof createFormStore>;

/** A copy of the record with one entry set, or removed when the value is null. */
function withEntry<T>(record: Record<string, T>, name: string, value: T | null): Record<string, T> {
  const { [name]: _old, ...others } = record;
  return value === null ? others : { ...others, [name]: value };
}

/** A copy of the record without the given keys. */
function withoutKeys<T>(record: Record<string, T>, names: string[]): Record<string, T> {
  const copy = { ...record };
  names.forEach((name) => delete copy[name]);
  return copy;
}

function hasEntries(record: object): boolean {
  return Object.keys(record).length > 0;
}

/** The steps of the form. A field that no step names goes on the last step, so it is never lost. */
export function getSteps(schema: FormSchema): StepSchema[] {
  const names = schema.fields.map((field) => field.name);
  const steps = schema.steps ?? [];
  if (steps.length === 0) {
    return [{ title: "", fields: names }];
  }

  const listed = new Set(steps.flatMap((step) => step.fields));
  const leftOver = names.filter((name) => !listed.has(name));
  return steps.map((step, index) =>
    index === steps.length - 1 ? { ...step, fields: [...step.fields, ...leftOver] } : step,
  );
}

/** Rejects when the signal is aborted. It lets us stop waiting for a promise that we cannot cancel. */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  });
}

export function createFormStore(schema: FormSchema, getOptions: () => FormStoreOptions) {
  const steps = getSteps(schema);
  const stepByTopName = new Map<string, number>();
  steps.forEach((step, index) => step.fields.forEach((name) => stepByTopName.set(name, index)));

  /** Every leaf that exists now, by its name in the values. The same object as long as it exists. */
  const leavesByName = new Map<string, LeafField>();
  /** The leaves in the order of the form. Built again when an item is added or removed. */
  let leaves: LeafField[] = [];
  let nextItemId = 1;

  // False after the form is removed from the page. Then we must not move focus or submit.
  let isConnected = true;
  let hasBeenViewed = false;
  let viewedAt = performance.now();
  let draftTimerId: ReturnType<typeof setTimeout> | undefined;
  /** Cancels the `onSubmit` that is in flight. */
  let submitController: AbortController | null = null;
  const listeners = new Set<() => void>();
  const pendingChecks = new Map<string, PendingCheck>();

  let state: FormState = createInitialState();

  function createInitialState(): FormState {
    const draft = getOptions().saveDraft ? loadDraft(schema) : null;
    const values = getInitialValues(schema);
    const itemIds: Record<string, number[]> = {};

    for (const group of schema.fields.filter((field) => field.type === "group")) {
      const wanted = Math.max(draft?.itemCounts[group.name] ?? 0, group.minItems ?? 0);
      const count = Math.min(wanted, group.maxItems ?? Infinity);
      itemIds[group.name] = Array.from({ length: count }, () => nextItemId++);
      for (const itemId of itemIds[group.name]) {
        Object.assign(values, getItemDefaults(group, itemId));
      }
    }
    rebuildLeaves(itemIds);

    let isDirty = false;
    for (const leaf of draft === null ? [] : leaves) {
      const saved = draft?.values[getDraftKey(leaf, itemIds)];
      // The draft is only text in storage. A value of the wrong kind is not used.
      if (!leaf.sensitive && saved !== undefined && typeof saved === typeof values[leaf.name]) {
        isDirty = isDirty || saved !== values[leaf.name];
        values[leaf.name] = saved;
      }
    }

    return {
      values,
      itemIds,
      errors: {},
      touched: {},
      checking: {},
      summaryErrors: {},
      stepIndex: 0,
      attemptedSteps: [],
      isSubmitting: false,
      submitError: null,
      isDirty,
      focusRequest: null,
    };
  }

  function getItemDefaults(group: FieldSchema, itemId: number): FormValues {
    const values: FormValues = {};
    for (const field of group.fields ?? []) {
      values[getItemFieldName(group.name, itemId, field.name)] = getDefaultValue(field);
    }
    return values;
  }

  /** Returns the leaf with this name, and makes it the first time it is asked for. */
  function getLeaf(name: string, make: () => LeafField): LeafField {
    const known = leavesByName.get(name) ?? make();
    leavesByName.set(name, known);
    return known;
  }

  function rebuildLeaves(itemIds: Record<string, number[]>) {
    leaves = schema.fields.flatMap((field): LeafField[] => {
      if (field.type !== "group") {
        return [getLeaf(field.name, () => ({ ...field, topName: field.name, path: field.name }))];
      }

      return (itemIds[field.name] ?? []).flatMap((itemId) =>
        (field.fields ?? []).map((itemField) => {
          const name = getItemFieldName(field.name, itemId, itemField.name);
          // A field of an item is on screen only when its group is too.
          const conditions = [field.visibleWhen, itemField.visibleWhen].filter(
            (condition) => condition !== undefined,
          );
          return getLeaf(name, () => ({
            ...itemField,
            name,
            visibleWhen: conditions.length === 0 ? undefined : { all: conditions },
            topName: field.name,
            path: `${field.name}.${itemField.name}`,
            item: { group: field, id: itemId },
          }));
        }),
      );
    });
  }

  /** The key of a leaf in a draft and in the errors of `onSubmit`: with the position, not the id. */
  function getDraftKey(leaf: LeafField, itemIds: Record<string, number[]>): string {
    if (leaf.item === undefined) {
      return leaf.name;
    }
    const groupName = leaf.item.group.name;
    const index = (itemIds[groupName] ?? []).indexOf(leaf.item.id);
    return leaf.name.replace(`${groupName}.${leaf.item.id}.`, `${groupName}.${index}.`);
  }

  function getStep(leaf: LeafField): number {
    return stepByTopName.get(leaf.topName) ?? steps.length - 1;
  }

  /** Monitoring must never break the form, so a failing `onEvent` is ignored. */
  function emit(event: FormMonitorEvent) {
    try {
      getOptions().onEvent?.(event);
    } catch {
      // Nothing to do.
    }
  }

  function setState(change: Partial<FormState>) {
    for (const [name, error] of Object.entries(change.errors ?? {})) {
      // One event when a field gets an error, not one for each key press while it stays wrong.
      if (state.errors[name]?.type !== error.type) {
        const field = leavesByName.get(name)?.path ?? name;
        emit({ type: "field_error", formId: schema.id, field, rule: error.type });
      }
    }

    state = { ...state, ...change };
    listeners.forEach((listener) => listener());
  }

  // ---------- The draft ----------

  function buildDraft(): Draft {
    const values: FormValues = {};
    for (const leaf of leaves) {
      // A sensitive value, like a bank account number, never goes to storage.
      if (!leaf.sensitive) {
        values[getDraftKey(leaf, state.itemIds)] = state.values[leaf.name] ?? "";
      }
    }

    const itemCounts: Record<string, number> = {};
    for (const [groupName, ids] of Object.entries(state.itemIds)) {
      itemCounts[groupName] = ids.length;
    }
    return { values, itemCounts };
  }

  function cancelDraftTimer() {
    clearTimeout(draftTimerId);
    draftTimerId = undefined;
  }

  function writeDraftNow() {
    cancelDraftTimer();
    saveDraft(schema, buildDraft());
  }

  /** Saves a moment after the last change, not on every key press. */
  function scheduleDraft() {
    if (getOptions().saveDraft) {
      cancelDraftTimer();
      draftTimerId = setTimeout(writeDraftNow, getOptions().draftDebounceMs);
    }
  }

  // ---------- Checks on the server ----------

  function cancelCheck(name: string) {
    // The abort stops the timers, and an answer that still arrives is ignored.
    pendingChecks.get(name)?.controller.abort();
    pendingChecks.delete(name);
  }

  /** Asks the server about a value, after the user has stopped typing for a moment. */
  function scheduleCheck(field: LeafField, value: FieldValue) {
    const { asyncValidators, debounceMs, asyncTimeoutMs } = getOptions();
    if (field.asyncRule === undefined) {
      return;
    }

    const validate = asyncValidators[field.asyncRule.name];
    if (validate === undefined) {
      warnOnce(`Form schema error: no async validator with the name "${field.asyncRule.name}".`);
      return;
    }
    // Do not ask the server about a value that our own rules already refuse.
    if (value === "" || validateField(field, value) !== null) {
      return;
    }

    const controller = new AbortController();
    const done = new Promise<void>((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      /** Takes the answer. `null` means: fine, or the check itself failed. */
      const settle = (message: string | null) => {
        // Aborted means: the user typed again, or this check was settled before. Drop the answer.
        if (controller.signal.aborted) {
          return;
        }
        pendingChecks.delete(field.name);
        setState({
          checking: withEntry(state.checking, field.name, null),
          errors:
            message === null
              ? state.errors
              : { ...state.errors, [field.name]: { type: "async", message } },
        });
        // Stops a request that is still running after the time limit, and cleans up below.
        controller.abort();
      };

      const debounceId = setTimeout(() => {
        timeoutId = setTimeout(() => settle(null), asyncTimeoutMs);
        // A failed check does not blame the user. The server checks again on submit.
        Promise.resolve()
          .then(() => validate(value, controller.signal))
          .then(settle, () => settle(null));
      }, debounceMs);

      controller.signal.addEventListener("abort", () => {
        clearTimeout(debounceId);
        clearTimeout(timeoutId);
        resolve();
      });
    });

    pendingChecks.set(field.name, { controller, done });
    setState({ checking: { ...state.checking, [field.name]: true } });
  }

  // ---------- Changes by the user ----------

  function setValue(name: string, value: FieldValue) {
    cancelCheck(name);

    const field = leavesByName.get(name);
    // A field is checked on every change once it shows an error, or after the
    // user tried to leave its step. An answer from a server was about the old
    // value, so this check also takes its place.
    const isChecked =
      state.errors[name] !== undefined ||
      (field !== undefined && state.attemptedSteps.includes(getStep(field)));

    setState({
      // A hidden field keeps its value here, so the text is back when the field is shown again.
      values: { ...state.values, [name]: value },
      errors:
        field !== undefined && isChecked
          ? withEntry(state.errors, name, validateField(field, value))
          : state.errors,
      checking: withEntry(state.checking, name, null),
      isDirty: true,
    });

    if (field !== undefined) {
      scheduleCheck(field, value);
    }
    scheduleDraft();
  }

  /** Called when focus leaves a field. */
  function touch(name: string) {
    const field = leavesByName.get(name);
    // A field that shows an error is already checked on every change. And an
    // error from a server must stay until the value changes.
    const error =
      field === undefined || state.errors[name] !== undefined
        ? (state.errors[name] ?? null)
        : validateField(field, state.values[name] ?? "");

    setState({
      touched: { ...state.touched, [name]: true },
      errors: withEntry(state.errors, name, error),
    });
  }

  function addItem(groupName: string) {
    const group = schema.fields.find((field) => field.name === groupName && field.type === "group");
    const ids = state.itemIds[groupName] ?? [];
    if (group === undefined || ids.length >= (group.maxItems ?? Infinity)) {
      return;
    }

    const itemId = nextItemId++;
    const itemIds = { ...state.itemIds, [groupName]: [...ids, itemId] };
    rebuildLeaves(itemIds);
    const firstField = group.fields?.[0];

    setState({
      itemIds,
      values: { ...state.values, ...getItemDefaults(group, itemId) },
      isDirty: true,
      // The user asked for a new item, so the next thing to do is to fill it in.
      focusRequest:
        firstField === undefined
          ? state.focusRequest
          : { target: getItemFieldName(groupName, itemId, firstField.name) },
    });
    scheduleDraft();
  }

  function removeItem(groupName: string, itemId: number) {
    const group = schema.fields.find((field) => field.name === groupName);
    const ids = state.itemIds[groupName] ?? [];
    const index = ids.indexOf(itemId);
    if (group === undefined || index === -1 || ids.length <= (group.minItems ?? 0)) {
      return;
    }

    const names = (group.fields ?? []).map((field) =>
      getItemFieldName(groupName, itemId, field.name),
    );
    names.forEach((name) => {
      cancelCheck(name);
      leavesByName.delete(name);
    });
    const remainingIds = ids.filter((id) => id !== itemId);
    const itemIds = { ...state.itemIds, [groupName]: remainingIds };
    rebuildLeaves(itemIds);

    // The button that had focus is gone. Without a new place, focus falls
    // back to the top of the page and a keyboard user is lost. It goes to the
    // "Remove" button that is now at the same place, or else the one before
    // it. When no item can be removed any more, it goes to "Add".
    const neighbourId = remainingIds[index] ?? remainingIds[index - 1];
    const canStillRemove = remainingIds.length > (group.minItems ?? 0);

    setState({
      itemIds,
      values: withoutKeys(state.values, names),
      errors: withoutKeys(state.errors, names),
      touched: withoutKeys(state.touched, names),
      checking: withoutKeys(state.checking, names),
      summaryErrors: withoutKeys(state.summaryErrors, names),
      isDirty: true,
      focusRequest: {
        target:
          neighbourId !== undefined && canStillRemove
            ? getRemoveButtonTarget(groupName, neighbourId)
            : getAddButtonTarget(groupName),
      },
    });
    scheduleDraft();
  }

  // ---------- Steps and submit ----------

  /** Every error of the given fields that are on screen: our own rules, and what a server check said. */
  function collectErrors(fields: LeafField[]): FormErrors {
    // An error that `onSubmit` sent back is not kept: the user may try again.
    const errors = validateFields(fields, state.values);

    for (const field of fields) {
      const current = state.errors[field.name];
      if (current?.type === "async" && isVisible(field, state.values)) {
        errors[field.name] = current;
      }
    }
    return errors;
  }

  /** The errors of `checked` fields are replaced by `errors`. The other errors stay. */
  function replaceErrors(checked: LeafField[], errors: FormErrors): FormErrors {
    return {
      ...withoutKeys(
        state.errors,
        checked.map((field) => field.name),
      ),
      ...errors,
    };
  }

  /** Shows the errors, and takes the user to the first one: to its step, then to its control. */
  function fail(checked: LeafField[], errors: FormErrors, submitError: FormState["submitError"]) {
    const firstInvalidField = leaves.find((field) => errors[field.name] !== undefined);

    setState({
      errors: replaceErrors(checked, errors),
      summaryErrors: errors,
      submitError,
      isSubmitting: false,
      ...(firstInvalidField === undefined
        ? {}
        : {
            stepIndex: getStep(firstInvalidField),
            focusRequest: { target: firstInvalidField.name },
          }),
    });
  }

  function markAttempted(fields: LeafField[], stepIndexes: number[]) {
    const visibleNames = fields
      .filter((field) => isVisible(field, state.values))
      .map((field) => [field.name, true]);

    setState({
      touched: { ...state.touched, ...Object.fromEntries(visibleNames) },
      attemptedSteps: [...new Set([...state.attemptedSteps, ...stepIndexes])],
      submitError: null,
    });
  }

  /** Checks the fields of the step on screen, and shows the next step when they are fine. */
  function goToNextStep() {
    if (state.isSubmitting || state.stepIndex >= steps.length - 1) {
      return;
    }

    const stepFields = leaves.filter((field) => getStep(field) === state.stepIndex);
    markAttempted(stepFields, [state.stepIndex]);

    // A server check that still runs does not hold the user here. Submit waits for it.
    const errors = collectErrors(stepFields);
    if (hasEntries(errors)) {
      fail(stepFields, errors, null);
      return;
    }

    setState({
      errors: replaceErrors(stepFields, {}),
      summaryErrors: {},
      stepIndex: state.stepIndex + 1,
      focusRequest: { target: STEP_HEADING_TARGET },
    });
  }

  function goToPreviousStep() {
    if (!state.isSubmitting && state.stepIndex > 0) {
      setState({
        summaryErrors: {},
        submitError: null,
        stepIndex: state.stepIndex - 1,
        focusRequest: { target: STEP_HEADING_TARGET },
      });
    }
  }

  /** Shows the step of a field and moves focus to it. The links of the error summary use it. */
  function goToField(name: string) {
    const field = leavesByName.get(name);
    if (field !== undefined) {
      setState({ stepIndex: getStep(field), focusRequest: { target: name } });
    }
  }

  /** Reads what `onSubmit` rejected with. It can be anything, so we check every part. */
  function failWithServerErrors(reason: unknown) {
    const { fieldErrors, formError }: SubmitErrors =
      typeof reason === "object" && reason !== null ? reason : {};
    const errors: FormErrors = {};

    for (const field of leaves) {
      const message = fieldErrors?.[getDraftKey(field, state.itemIds)];
      // An error for a field that is not on screen could not be shown or fixed.
      if (typeof message === "string" && isVisible(field, state.values)) {
        errors[field.name] = { type: "server", message };
      }
    }

    const hasFormError = typeof formError === "string";
    // The user must always see some reason. With nothing from the server, the form has a default text.
    const showsFormError = hasFormError || !hasEntries(errors);
    fail([], errors, showsFormError ? { message: hasFormError ? formError : undefined } : null);
    return Object.keys(errors).length;
  }

  async function submit() {
    // A second submit while one is in flight is ignored.
    if (state.isSubmitting) {
      return;
    }

    const formId = schema.id;
    const startedAt = performance.now();
    const msSince = (start: number) => Math.round(performance.now() - start);
    emit({ type: "submit_attempted", formId, msSinceViewed: msSince(viewedAt) });

    markAttempted(
      leaves,
      steps.map((_step, index) => index),
    );
    setState({ isSubmitting: true });

    // Wait for the server checks that are still running. The user may type
    // while we wait, which starts a new check, so we look again after each wait.
    while (pendingChecks.size > 0 && !hasEntries(collectErrors(leaves))) {
      await Promise.all([...pendingChecks.values()].map((check) => check.done));
    }
    if (!isConnected) {
      return;
    }

    const errors = collectErrors(leaves);
    const errorCount = Object.keys(errors).length;
    if (errorCount > 0) {
      fail(leaves, errors, null);
      const durationMs = msSince(startedAt);
      emit({ type: "submit_failed", formId, durationMs, reason: "validation", errorCount });
      return;
    }

    // Nothing is wrong, so this empties the summary and removes an old answer of `onSubmit`.
    setState({ errors: {}, summaryErrors: {} });

    const controller = new AbortController();
    submitController = controller;
    let hasTimedOut = false;
    const timeoutId = setTimeout(() => {
      hasTimedOut = true;
      controller.abort();
    }, getOptions().submitTimeoutMs);

    try {
      const values = getSubmitValues(schema, state.values, state.itemIds);
      // The race lets us stop waiting, also when `onSubmit` does not listen to the signal.
      await Promise.race([
        Promise.resolve().then(() => getOptions().onSubmit(values, controller.signal)),
        rejectOnAbort(controller.signal),
      ]);

      // The answers are with the server now. A draft of them must not come back.
      cancelDraftTimer();
      clearDraft(schema);
      setState({ isSubmitting: false, isDirty: false });
      const durationMs = msSince(startedAt);
      emit({ type: "submit_succeeded", formId, durationMs, msSinceViewed: msSince(viewedAt) });
    } catch (reason) {
      // An abort with no timeout means that the form was removed: say nothing.
      if (isConnected) {
        const errorCount = failWithServerErrors(hasTimedOut ? null : reason);
        const durationMs = msSince(startedAt);
        emit({
          type: "submit_failed",
          formId,
          durationMs,
          reason: hasTimedOut ? "timeout" : "server",
          errorCount,
        });
      }
    } finally {
      clearTimeout(timeoutId);
      submitController = null;
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    steps,
    /** The fields that exist now, in the order of the form. Read it again after `itemIds` changes. */
    getLeaves: () => leaves,
    getLeaf: (name: string) => leavesByName.get(name),
    getStep,
    setValue,
    touch,
    addItem,
    removeItem,
    goToNextStep,
    goToPreviousStep,
    goToField,
    submit,
    /** Called when the form is put on the page. */
    connect() {
      isConnected = true;
      // React can connect twice in development. The form was still viewed one time.
      if (!hasBeenViewed) {
        hasBeenViewed = true;
        viewedAt = performance.now();
        emit({ type: "form_viewed", formId: schema.id });
      }
    },
    /** Called when the form is removed from the page. Stops every timer and request. */
    disconnect() {
      isConnected = false;
      [...pendingChecks.keys()].forEach(cancelCheck);
      submitController?.abort();
      // A change that still waits for its timer is saved now, or it would be lost.
      if (draftTimerId !== undefined) {
        writeDraftNow();
      }
    },
  };
}

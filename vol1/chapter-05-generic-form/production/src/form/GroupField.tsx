/*
 * NOT PART OF THE INTERVIEW: production version.
 * A group that repeats, like "Dependants": the user adds and removes items,
 * and each item has the same fields.
 *
 * Each item is a <fieldset> with a <legend>, so a screen reader says
 * "Dependant 2, Name" and not only "Name". The buttons say what they act on:
 * "Remove dependant 2", never just "Remove".
 */
import { memo } from "react";
import { Field, useStoreValue } from "./Field";
import { getFieldType } from "./fields";
import type { FieldTypeDefinition } from "./fields";
import { getAddButtonTarget, getRemoveButtonTarget } from "./formStore";
import type { FormStore } from "./formStore";
import type { FormMessages } from "./messages";
import type { FieldSchema } from "./types";
import { getItemFieldName, isVisible } from "./validation";

export interface GroupFieldProps {
  group: FieldSchema;
  fieldTypes: Record<string, FieldTypeDefinition>;
  store: FormStore;
  messages: FormMessages;
  formId: string;
  showRenderCount: boolean;
}

const NO_ITEMS: number[] = [];

function GroupFieldInner(props: GroupFieldProps) {
  const { group, fieldTypes, store, messages, formId, showRenderCount } = props;
  const isShown = useStoreValue(store, (state) => isVisible(group, state.values));
  const itemIds = useStoreValue(store, (state) => state.itemIds[group.name]) ?? NO_ITEMS;

  if (!isShown) {
    return null;
  }

  const itemLabel = group.itemLabel ?? group.label;
  const helpId = `${formId}-${group.name}-help`;
  const canRemove = itemIds.length > (group.minItems ?? 0);
  const canAdd = itemIds.length < (group.maxItems ?? Infinity);

  return (
    <fieldset className="group" aria-describedby={group.helpText ? helpId : undefined}>
      <legend className="group__legend">{group.label}</legend>
      {group.helpText && (
        <p id={helpId} className="field__help">
          {group.helpText}
        </p>
      )}

      {itemIds.map((itemId, index) => (
        <fieldset key={itemId} className="group__item">
          <legend className="group__item-legend">{messages.itemTitle(itemLabel, index + 1)}</legend>

          {(group.fields ?? []).map((itemField) => (
            <Field
              key={itemField.name}
              // The store has no field for a type that nobody can draw. Then
              // the field of the schema is enough to draw the "unsupported" box.
              field={
                store.getLeaf(getItemFieldName(group.name, itemId, itemField.name)) ?? itemField
              }
              definition={getFieldType(fieldTypes, itemField.type)}
              store={store}
              messages={messages}
              formId={formId}
              showRenderCount={showRenderCount}
            />
          ))}

          {canRemove && (
            <button
              type="button"
              className="group__button"
              id={`${formId}-${getRemoveButtonTarget(group.name, itemId)}`}
              onClick={() => store.removeItem(group.name, itemId)}
            >
              {messages.removeItem(itemLabel, index + 1)}
            </button>
          )}
        </fieldset>
      ))}

      {/*
        "Add" is always in the page, so focus can go to it after a remove. At
        the limit it stays reachable and says why it does nothing: a disabled
        button would say nothing, and focus could not rest on it.
      */}
      <button
        type="button"
        className="group__button"
        id={`${formId}-${getAddButtonTarget(group.name)}`}
        aria-disabled={canAdd ? undefined : true}
        aria-describedby={canAdd ? undefined : `${formId}-${group.name}-limit`}
        onClick={() => store.addItem(group.name)}
      >
        {messages.addItem(itemLabel)}
      </button>
      {!canAdd && (
        <p id={`${formId}-${group.name}-limit`} className="field__help">
          {messages.maxItemsReached(group.maxItems ?? 0)}
        </p>
      )}
    </fieldset>
  );
}

/** `memo` for the same reason as on `Field`: a new prop on the form must not draw every group. */
export const GroupField = memo(GroupFieldInner);

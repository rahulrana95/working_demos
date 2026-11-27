/*
 * NOT PART OF THE INTERVIEW: production version.
 * The component from the 60-minute answer, plus:
 *   1. `locale`, `timeoutMs` and `cacheKey`, which go straight to the hook.
 *   2. One message for each error reason: failed, timeout, offline.
 *   3. `onEvent`, which also reports the row the user picked.
 *   4. `minChars` counts the characters the user sees.
 */
import { forwardRef, useId, useState } from "react";
import type {
  ChangeEvent,
  ForwardedRef,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
  ReactNode,
  Ref,
} from "react";
import { DEFAULT_MESSAGES } from "./messages";
import type { TypeaheadMessages } from "./messages";
import { countGraphemes } from "./text";
import type { SearchFn, TypeaheadEvent } from "./types";
import { useTypeahead } from "./useTypeahead";

export interface TypeaheadProps<T> {
  /** Visible label of the input. Screen readers read it out too. */
  label: string;
  placeholder?: string;
  search: SearchFn<T>;
  /** The text shown for one item, in the list and in the input. */
  getItemLabel: (item: T) => string;
  /** A stable and unique key for one item. */
  getItemKey: (item: T) => string;
  onSelect: (item: T) => void;
  debounceMs?: number;
  minChars?: number;
  maxItems?: number;
  cacheTtlMs?: number;
  maxQueryLength?: number;
  /** The language used to make the text lower case. The default is the browser language. */
  locale?: string;
  /** A request that takes longer than this is aborted. The default is 5000. */
  timeoutMs?: number;
  /**
   * Typeaheads with the same key share one cache. Use one key for one search
   * function only. Leave it out and this typeahead keeps its own cache.
   */
  cacheKey?: string;
  /** Receives what happened, for analytics. An event never holds the typed text. */
  onEvent?: (event: TypeaheadEvent) => void;

  /**
   * The text in the input. Pass it, with `onValueChange`, to control the text
   * from the parent. Leave it out and the component keeps the text itself.
   */
  value?: string;
  /** Called every time the text changes: on typing, on select and on clear. */
  onValueChange?: (value: string) => void;

  /** Form props. They go straight to the input element. */
  name?: string;
  disabled?: boolean;
  required?: boolean;

  /** Draws one row. The default is the text from `getItemLabel`. */
  renderItem?: (item: T, state: { isActive: boolean; query: string }) => ReactNode;
  /** Replaces some or all of the English texts. */
  messages?: Partial<TypeaheadMessages>;
  /** An extra class name for the root element. */
  className?: string;
}

const NO_ACTIVE_OPTION = -1;

function TypeaheadInner<T>(
  {
    label,
    placeholder,
    search,
    getItemLabel,
    getItemKey,
    onSelect,
    debounceMs,
    minChars = 2,
    maxItems,
    cacheTtlMs,
    maxQueryLength,
    locale,
    timeoutMs,
    cacheKey,
    onEvent,
    value,
    onValueChange,
    name,
    disabled,
    required,
    renderItem,
    messages,
    className,
  }: TypeaheadProps<T>,
  ref: ForwardedRef<HTMLInputElement>,
) {
  // When the parent passes `value`, that text wins and our own state is not shown.
  const [ownValue, setOwnValue] = useState("");
  const inputValue = value ?? ownValue;
  const typedQuery = inputValue.trim();
  const typedLength = countGraphemes(typedQuery);

  const text = { ...DEFAULT_MESSAGES, ...messages };

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(NO_ACTIVE_OPTION);

  // We search only while the list is open. After the user picks an item,
  // the input holds the full label, and we do not want one more request
  // for that label.
  const query = isOpen ? inputValue : "";

  const { status, items, errorReason, retry, isStale } = useTypeahead({
    query,
    search,
    debounceMs,
    minChars,
    maxItems,
    cacheTtlMs,
    maxQueryLength,
    locale,
    timeoutMs,
    cacheKey,
    onEvent,
  });

  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const getOptionId = (index: number) => `${baseId}-option-${index}`;

  const isPopupVisible = isOpen && typedLength >= minChars;
  const isListVisible = isPopupVisible && items.length > 0 && status !== "error";

  // The list can become shorter while an option is active.
  // In that case we drop the active option, so we never point at a row that is gone.
  // Stale rows belong to an older query, so none of them can be active.
  const safeActiveIndex = !isStale && activeIndex < items.length ? activeIndex : NO_ACTIVE_OPTION;

  function changeValue(nextValue: string) {
    setOwnValue(nextValue);
    onValueChange?.(nextValue);
  }

  function selectItem(item: T, index: number) {
    changeValue(getItemLabel(item));
    setIsOpen(false);
    setActiveIndex(NO_ACTIVE_OPTION);
    onSelect(item);
    onEvent?.({ type: "item_selected", position: index + 1, queryLength: typedLength });
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    changeValue(event.target.value);
    setIsOpen(true);
    setActiveIndex(NO_ACTIVE_OPTION);
  }

  function moveActiveOption(step: 1 | -1) {
    if (items.length === 0 || isStale) {
      return;
    }

    setActiveIndex((current) => {
      if (current === NO_ACTIVE_OPTION) {
        return step === 1 ? 0 : items.length - 1;
      }

      // The modulo makes the selection wrap around at both ends.
      return (current + step + items.length) % items.length;
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // In Hindi, Japanese or Chinese keyboards, the user presses Enter to
    // confirm a word inside the keyboard itself. That Enter is not for us.
    if (event.nativeEvent.isComposing) {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        // Stops the cursor from jumping to the start or end of the text.
        event.preventDefault();

        if (!isOpen) {
          setIsOpen(true);
          return;
        }

        moveActiveOption(event.key === "ArrowDown" ? 1 : -1);
        return;
      }

      case "Enter": {
        const activeItem = items[safeActiveIndex];

        if (isListVisible && activeItem !== undefined) {
          // Without this, Enter would also submit the form around the input.
          event.preventDefault();
          selectItem(activeItem, safeActiveIndex);
        }
        return;
      }

      case "Escape": {
        if (isOpen) {
          setIsOpen(false);
          setActiveIndex(NO_ACTIVE_OPTION);
        } else {
          changeValue("");
        }
        return;
      }
    }
  }

  function handleBlur() {
    setIsOpen(false);
    setActiveIndex(NO_ACTIVE_OPTION);
  }

  // A mouse press moves focus away from the input, and blur closes the list
  // before the click reaches the option. Stopping the default keeps focus in place.
  function keepFocusOnInput(event: MouseEvent) {
    event.preventDefault();
  }

  function getErrorMessage(): string {
    if (errorReason === "offline") {
      return text.offline;
    }
    return errorReason === "timeout" ? text.timeout : text.error;
  }

  function getStatusMessage(): string {
    if (!isPopupVisible) {
      return "";
    }
    if (status === "loading") {
      return text.searching;
    }
    if (status === "success") {
      return items.length === 0 ? text.noResults(typedQuery) : text.resultsAvailable(items.length);
    }
    return "";
  }

  return (
    <div className={className ? `typeahead ${className}` : "typeahead"}>
      <label className="typeahead__label" htmlFor={inputId}>
        {label}
      </label>

      <input
        ref={ref}
        id={inputId}
        name={name}
        disabled={disabled}
        required={required}
        className="typeahead__input"
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={inputValue}
        aria-autocomplete="list"
        aria-expanded={isListVisible}
        aria-controls={listboxId}
        aria-activedescendant={
          safeActiveIndex === NO_ACTIVE_OPTION ? undefined : getOptionId(safeActiveIndex)
        }
        aria-busy={status === "loading"}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />

      {/* Screen readers read this text when it changes. It is hidden on screen. */}
      <div className="visually-hidden" role="status" aria-live="polite">
        {getStatusMessage()}
      </div>

      <div className="typeahead__popup" hidden={!isPopupVisible} onMouseDown={keepFocusOnInput}>
        <ul
          id={listboxId}
          className={isStale ? "typeahead__list is-stale" : "typeahead__list"}
          role="listbox"
          aria-label={label}
        >
          {isListVisible &&
            items.map((item, index) => {
              const isActive = index === safeActiveIndex;

              return (
                <li
                  key={getItemKey(item)}
                  id={getOptionId(index)}
                  className={isActive ? "typeahead__option is-active" : "typeahead__option"}
                  role="option"
                  aria-selected={isActive}
                  aria-disabled={isStale}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={isStale ? undefined : () => selectItem(item, index)}
                >
                  {renderItem
                    ? renderItem(item, { isActive, query: typedQuery })
                    : getItemLabel(item)}
                </li>
              );
            })}
        </ul>

        {status === "loading" && items.length === 0 && (
          <p className="typeahead__message">{text.searching}</p>
        )}

        {status === "success" && items.length === 0 && (
          <p className="typeahead__message">{text.noResults(typedQuery)}</p>
        )}

        {status === "error" && (
          <p className="typeahead__message" role="alert">
            {getErrorMessage()}{" "}
            <button type="button" className="typeahead__retry" onClick={retry}>
              {text.retry}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

// forwardRef does not keep the generic type T: without the cast, `item` in
// `getItemLabel` and `onSelect` would be `unknown`. The cast gives the
// component back its real type: generic props, plus a ref to the input.
export const Typeahead = forwardRef(TypeaheadInner) as <T>(
  props: TypeaheadProps<T> & { ref?: Ref<HTMLInputElement> },
) => ReactElement;

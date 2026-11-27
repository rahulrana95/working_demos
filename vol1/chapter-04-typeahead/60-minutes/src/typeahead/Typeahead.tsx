/*
 * PART OF THE INTERVIEW: yes (about 28 minutes).
 * Order to write it in:
 *   1. The input and the list, with mouse click.         (5 minutes)
 *   2. Keyboard: ArrowDown, ArrowUp, Enter, Escape.       (7 minutes)
 *   3. ARIA attributes for screen readers.                (4 minutes)
 *   4. Loading, empty and error messages.                 (4 minutes)
 *
 * The staff-level additions, so other teams can reuse the component:
 *   5. `value` and `onValueChange`, form props and `ref`. (4 minutes)
 *      `name` sends the key of the picked item, in a hidden input.
 *   6. `renderItem` for custom rows.                      (2 minutes)
 *   7. `messages` for translation.                        (1 minute)
 *   8. `className` on the root element.                   (1 minute)
 *
 * Why it holds at scale: the hook gives us at most `maxItems` items, so this
 * component never draws more than that many rows. Moving the active row
 * with the keyboard re-draws those few rows only.
 */
import { forwardRef, useId, useImperativeHandle, useRef, useState } from "react";
import type {
  ChangeEvent,
  FocusEvent,
  ForwardedRef,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
  ReactNode,
  Ref,
} from "react";
import { DEFAULT_MESSAGES } from "./messages";
import type { TypeaheadMessages } from "./messages";
import type { SearchFn } from "./types";
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

  /**
   * The text in the input. Pass it, with `onValueChange`, to control the text
   * from the parent. Leave it out and the component keeps the text itself.
   */
  value?: string;
  /** Called every time the text changes: on typing, on select and on clear. */
  onValueChange?: (value: string) => void;

  /**
   * With a name, a form gets the key of the picked item (from `getItemKey`)
   * under that name. It gets an empty text while nothing is picked, also
   * when the user has typed a text but picked no row.
   */
  name?: string;
  /** Form props. They go straight to the input element. */
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

  // The item the user picked last, for the form value.
  const [picked, setPicked] = useState<{ key: string; label: string } | null>(null);
  // The parent can change the text from outside, for example to reset a form.
  // So the pick counts only while the input still shows the picked label.
  const pickedKey = picked !== null && picked.label === inputValue ? picked.key : "";

  const text = { ...DEFAULT_MESSAGES, ...messages };

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(NO_ACTIVE_OPTION);

  // We need the input ourselves, and the parent may ask for it through `ref`.
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);

  // We search only while the list is open. After the user picks an item,
  // the input holds the full label, and we do not want one more request
  // for that label.
  const query = isOpen ? inputValue : "";

  const { status, items, retry, isStale } = useTypeahead({
    query,
    search,
    debounceMs,
    minChars,
    maxItems,
    cacheTtlMs,
    maxQueryLength,
  });

  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const getOptionId = (index: number) => `${baseId}-option-${index}`;

  const isPopupVisible = isOpen && typedQuery.length >= minChars;
  const isListVisible = isPopupVisible && items.length > 0 && status !== "error";

  // The list can become shorter while an option is active.
  // In that case we drop the active option, so we never point at a row that is gone.
  // Stale rows belong to an older query, so none of them can be active.
  const safeActiveIndex = !isStale && activeIndex < items.length ? activeIndex : NO_ACTIVE_OPTION;

  function changeValue(nextValue: string) {
    setOwnValue(nextValue);
    onValueChange?.(nextValue);
  }

  function selectItem(item: T) {
    const itemLabel = getItemLabel(item);
    changeValue(itemLabel);
    setPicked({ key: getItemKey(item), label: itemLabel });
    setIsOpen(false);
    setActiveIndex(NO_ACTIVE_OPTION);
    onSelect(item);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    changeValue(event.target.value);
    // The text is no longer the picked item, so the form must not send its key.
    setPicked(null);
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
    // Safari sends that Enter with `isComposing` already false, but with the
    // old key code 229, so we check both.
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
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
        if (isPopupVisible && isStale) {
          // The rows belong to an older text, so there is nothing to pick yet.
          // We also stop the form around the input from being submitted with
          // a text the user has not finished.
          event.preventDefault();
          return;
        }

        const activeItem = items[safeActiveIndex];

        if (isListVisible && activeItem !== undefined) {
          // Without this, Enter would also submit the form around the input.
          event.preventDefault();
          selectItem(activeItem);
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

  // This runs when focus leaves the input or the "Try again" button.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    // Tab moves focus from the input to "Try again", which is inside this
    // component. If we closed the popup now, the button would vanish.
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    setIsOpen(false);
    setActiveIndex(NO_ACTIVE_OPTION);
  }

  function handleRetry() {
    retry();
    // The search removes the button. Focus goes back to the input first, so
    // a keyboard user does not lose their place on the page.
    inputRef.current?.focus();
  }

  // A mouse press moves focus away from the input, and blur closes the list
  // before the click reaches the option. Stopping the default keeps focus in place.
  function keepFocusOnInput(event: MouseEvent) {
    event.preventDefault();
  }

  function getStatusMessage(): string {
    if (!isPopupVisible || status !== "success") {
      return "";
    }
    return items.length === 0 ? text.noResults(typedQuery) : text.resultsAvailable(items.length);
  }

  return (
    <div className={className ? `typeahead ${className}` : "typeahead"} onBlur={handleBlur}>
      <label className="typeahead__label" htmlFor={inputId}>
        {label}
      </label>

      <input
        ref={inputRef}
        id={inputId}
        disabled={disabled}
        required={required}
        className="typeahead__input"
        type="text"
        role="combobox"
        autoComplete="off"
        autoCapitalize="off"
        enterKeyHint="search"
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
      />

      {/* The visible input holds a label for people. The form needs the key. */}
      {name !== undefined && (
        <input type="hidden" name={name} value={pickedKey} disabled={disabled} />
      )}

      {/*
        Screen readers read this text when it changes. It is hidden on screen.
        It holds only the final outcome of a search. "Searching" on every key
        press would talk over the user. The error is read from its own alert.
      */}
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
                  // Not onMouseEnter: that also fires when the list is drawn
                  // again under a mouse that is not moving.
                  onMouseMove={isActive ? undefined : () => setActiveIndex(index)}
                  onClick={isStale ? undefined : () => selectItem(item)}
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
            {text.error}{" "}
            <button type="button" className="typeahead__retry" onClick={handleRetry}>
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

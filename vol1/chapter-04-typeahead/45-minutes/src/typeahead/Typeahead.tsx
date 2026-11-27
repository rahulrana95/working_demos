/*
 * PART OF THE INTERVIEW: yes (about 20 minutes).
 * Order to write it in:
 *   1. The input and the list, with mouse click.         (5 minutes)
 *   2. Keyboard: ArrowDown, ArrowUp, Enter, Escape.       (7 minutes)
 *   3. ARIA attributes for screen readers.                (4 minutes)
 *   4. Loading, empty and error messages.                 (4 minutes)
 *
 * Why it holds at scale: the hook gives us at most `maxItems` items, so this
 * component never draws more than that many rows. Moving the active row
 * with the keyboard re-draws those few rows only.
 */
import { useId, useRef, useState } from "react";
import type { ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent } from "react";
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
}

const NO_ACTIVE_OPTION = -1;

export function Typeahead<T>({
  label,
  placeholder,
  search,
  getItemLabel,
  getItemKey,
  onSelect,
  debounceMs,
  minChars = 2,
  maxItems,
}: TypeaheadProps<T>) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(NO_ACTIVE_OPTION);
  const inputRef = useRef<HTMLInputElement>(null);

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
  });

  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const getOptionId = (index: number) => `${baseId}-option-${index}`;

  const isPopupVisible = isOpen && inputValue.trim().length >= minChars;
  const isListVisible = isPopupVisible && items.length > 0 && status !== "error";

  // The list can become shorter while an option is active.
  // In that case we drop the active option, so we never point at a row that is gone.
  // Stale rows belong to an older query, so none of them can be active.
  const safeActiveIndex = !isStale && activeIndex < items.length ? activeIndex : NO_ACTIVE_OPTION;

  function selectItem(item: T) {
    setInputValue(getItemLabel(item));
    setIsOpen(false);
    setActiveIndex(NO_ACTIVE_OPTION);
    onSelect(item);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setInputValue(event.target.value);
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
          setInputValue("");
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
    if (items.length === 0) {
      return "No results found";
    }
    return items.length === 1 ? "1 result available" : `${items.length} results available`;
  }

  return (
    <div className="typeahead" onBlur={handleBlur}>
      <label className="typeahead__label" htmlFor={inputId}>
        {label}
      </label>

      <input
        ref={inputRef}
        id={inputId}
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
                  {getItemLabel(item)}
                </li>
              );
            })}
        </ul>

        {status === "loading" && items.length === 0 && (
          <p className="typeahead__message">Searching…</p>
        )}

        {status === "success" && items.length === 0 && (
          <p className="typeahead__message">No results for “{inputValue.trim()}”</p>
        )}

        {status === "error" && (
          <p className="typeahead__message" role="alert">
            Something went wrong.{" "}
            <button type="button" className="typeahead__retry" onClick={handleRetry}>
              Try again
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

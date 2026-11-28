/*
 * NOT PART OF THE INTERVIEW: production version.
 * The search box and the category links above the menu. Search is a
 * debounced filter over the menu we already have. The links mark the
 * category on screen with an IntersectionObserver.
 */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CategoryNav, sectionId } from "./CategoryNav";
import { countItems, filterMenu } from "./menuSearch";
import type { OrderingMessages } from "./messages";
import type { MenuCategory } from "./types";
import { useActiveSection } from "./useActiveSection";
import { useDebouncedValue } from "./useDebouncedValue";

export const SEARCH_DEBOUNCE_MS = 200;

export interface MenuNavigatorProps {
  categories: MenuCategory[];
  messages: OrderingMessages;
  /** Draws the categories that match the search. */
  children: (shownCategories: MenuCategory[]) => ReactNode;
}

export function MenuNavigator({ categories, messages, children }: MenuNavigatorProps) {
  const [searchText, setSearchText] = useState("");
  const query = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS);

  // useMemo: a cart change draws this component again. With 400 dishes the
  // filter must not run again for the same menu and the same text.
  const shown = useMemo(() => filterMenu(categories, query), [categories, query]);
  const activeId = useActiveSection(shown.map((category) => sectionId(category.id)));

  return (
    <>
      <label className="menu-search">
        <span className="menu-search__label">{messages.searchLabel}</span>
        <input
          className="menu-search__input"
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </label>
      {/* Read by screen readers after the user stops typing, not on every key press. */}
      <p className="menu-search__count" role="status">
        {query.trim() !== "" && messages.searchResults(countItems(shown))}
      </p>

      <CategoryNav label={messages.categories} categories={shown} activeId={activeId} />

      {children(shown)}
    </>
  );
}

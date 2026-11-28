/*
 * NOT PART OF THE INTERVIEW: production version.
 * Search inside the menu. The whole menu is already in memory, so the search
 * is a filter and sends no request.
 */
import type { MenuCategory } from "./types";

/** Keeps the dishes whose name holds the text. A category with no dish left is dropped. */
export function filterMenu(categories: MenuCategory[], query: string): MenuCategory[] {
  // toLowerCase, not toLocaleLowerCase: the result must not change with the
  // language of the browser ("I" becomes "ı" in a Turkish browser).
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return categories;
  }
  return categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => item.name.toLowerCase().includes(needle)),
    }))
    .filter((category) => category.items.length > 0);
}

export function countItems(categories: MenuCategory[]): number {
  return categories.reduce((count, category) => count + category.items.length, 0);
}

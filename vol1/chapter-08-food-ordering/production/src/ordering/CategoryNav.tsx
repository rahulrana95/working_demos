/*
 * NOT PART OF THE INTERVIEW: production version.
 * The row of category links above the menu. Plain links to the headings, so
 * they work with the keyboard and without JavaScript.
 */
import type { MenuCategory } from "./types";

export interface CategoryNavProps {
  label: string;
  categories: MenuCategory[];
  activeId: string | null;
}

export function sectionId(categoryId: string): string {
  return `category-${categoryId}`;
}

export function CategoryNav({ label, categories, activeId }: CategoryNavProps) {
  return (
    <nav className="category-nav" aria-label={label}>
      <ul className="category-nav__list">
        {categories.map((category) => (
          <li key={category.id}>
            <a
              className="category-nav__link"
              href={`#${sectionId(category.id)}`}
              aria-current={sectionId(category.id) === activeId ? "true" : undefined}
            >
              {category.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/*
 * NOT PART OF THE INTERVIEW: production version.
 * Tells which category is at the top of the screen, so the navigation can
 * mark it ("scroll spy"). It uses an IntersectionObserver, not a scroll
 * listener, so no code runs while the user scrolls.
 */
import { useEffect, useState } from "react";

/** Only a band near the top of the screen counts: from 15% to 40% of its height. */
const TOP_BAND = "-15% 0px -60% 0px";

export function useActiveSection(sectionIds: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  // A text, so the effect runs when the ids change, not when the array is new.
  const idList = sectionIds.join(" ");

  useEffect(() => {
    // An old browser, or a test, has no IntersectionObserver. No section is marked then.
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const ids = idList === "" ? [] : idList.split(" ");
    const inBand = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            inBand.add(entry.target.id);
          } else {
            inBand.delete(entry.target.id);
          }
        }
        // The first section of the page that is in the band wins.
        const first = ids.find((id) => inBand.has(id));
        if (first !== undefined) {
          setActiveId(first);
        }
      },
      { rootMargin: TOP_BAND },
    );

    for (const id of ids) {
      const section = document.getElementById(id);
      if (section !== null) {
        observer.observe(section);
      }
    }
    return () => observer.disconnect();
  }, [idList]);

  return activeId !== null && sectionIds.includes(activeId) ? activeId : (sectionIds[0] ?? null);
}

/*
 * NOT PART OF THE INTERVIEW: production version.
 * Grey boxes in the shape of the content that is loading. The page does not
 * jump when the content arrives, and a slow network feels less slow.
 */

export interface SkeletonProps {
  /** How many grey rows to draw. */
  rows: number;
  /** What a screen reader says, for example "Loading the menu…". */
  label: string;
}

export function Skeleton({ rows, label }: SkeletonProps) {
  return (
    <div className="skeleton" role="status">
      <span className="visually-hidden">{label}</span>
      {/* The boxes mean nothing to a screen reader, so it skips them. */}
      <div aria-hidden="true">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="skeleton__row" />
        ))}
      </div>
    </div>
  );
}

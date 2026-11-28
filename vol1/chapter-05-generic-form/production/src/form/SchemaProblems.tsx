/*
 * NOT PART OF THE INTERVIEW: production version.
 * Shown in development in place of a form whose schema has mistakes. The
 * developer sees every problem at once, before a user can meet a broken form.
 * The text is for developers, so it is not in `messages` and is not translated.
 */

export interface SchemaProblemsProps {
  schemaId: string;
  problems: string[];
}

export function SchemaProblems({ schemaId, problems }: SchemaProblemsProps) {
  return (
    <div className="form form__problems" role="alert">
      <p className="form__alert-title">
        The schema “{schemaId}” has {problems.length === 1 ? "a problem" : "problems"}. The form is
        not shown until {problems.length === 1 ? "it is" : "they are"} fixed.
      </p>
      <ul>
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </div>
  );
}

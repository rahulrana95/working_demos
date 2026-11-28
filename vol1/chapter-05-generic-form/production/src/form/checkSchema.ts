/*
 * NOT PART OF THE INTERVIEW: production version.
 * Finds the mistakes in a schema before a user meets them. An admin builds
 * the schema in a form builder, so a mistake is normal, and it must be found
 * when the form is built, not when an employee cannot send it.
 *
 * Run it in three places: in the form builder when the admin saves, on the
 * server before it stores the schema, and in the form itself (in development
 * the form shows the list in place of a broken form).
 */
import type { Condition, FieldSchema, FormSchema } from "./types";
import { getConditionFields, MAX_PATTERN_LENGTH } from "./validation";

/** The field types that need a list of choices. */
const TYPES_WITH_OPTIONS = ["select", "radio"];

/** Returns one sentence for each problem. An empty list means the schema is fine. */
export function checkSchema(schema: FormSchema): string[] {
  const problems: string[] = [];
  const topLevelNames = new Set<string>();
  /** For each field, the fields that decide whether it is visible. */
  const dependencies = new Map<string, string[]>();

  /** Fields that a condition can read: the ones outside groups. A group has no value of its own. */
  const readableNames = new Set(
    schema.fields.filter((field) => field.type !== "group").map((field) => field.name),
  );

  function checkCondition(owner: string, condition: Condition | undefined) {
    for (const name of condition === undefined ? [] : getConditionFields(condition)) {
      if (!readableNames.has(name)) {
        problems.push(
          `"${owner}" is shown depending on "${name}", which is not a field outside a group.`,
        );
      }
    }
  }

  function checkField(field: FieldSchema, owner: string) {
    if (field.name.includes(".")) {
      problems.push(`The field name "${field.name}" has a dot in it.`);
    }
    if (TYPES_WITH_OPTIONS.includes(field.type) && (field.options ?? []).length === 0) {
      problems.push(`"${owner}" is a ${field.type} with no options.`);
    }

    for (const rule of field.rules ?? []) {
      if (rule.type !== "pattern") {
        continue;
      }
      if (rule.value.length > MAX_PATTERN_LENGTH) {
        problems.push(
          `"${owner}" has a pattern of ${rule.value.length} characters. The limit is ${MAX_PATTERN_LENGTH}.`,
        );
        continue;
      }
      try {
        new RegExp(rule.value);
      } catch {
        problems.push(`"${owner}" has a pattern that is not a valid regular expression.`);
      }
    }

    checkCondition(owner, field.visibleWhen);
  }

  function checkGroup(group: FieldSchema) {
    const itemNames = new Set<string>();
    const fields = group.fields ?? [];

    if (fields.length === 0) {
      problems.push(`The group "${group.name}" has no fields.`);
    }
    if ((group.minItems ?? 0) > (group.maxItems ?? Infinity)) {
      problems.push(`The group "${group.name}" has a minItems that is larger than its maxItems.`);
    }

    for (const field of fields) {
      const owner = `${group.name}.${field.name}`;
      if (itemNames.has(field.name)) {
        problems.push(`The field name "${owner}" is used more than once.`);
      }
      itemNames.add(field.name);

      if (field.type === "group") {
        problems.push(`"${owner}" is a group inside a group. That is not supported.`);
      } else {
        checkField(field, owner);
      }
    }
  }

  for (const field of schema.fields) {
    if (topLevelNames.has(field.name)) {
      problems.push(`The field name "${field.name}" is used more than once.`);
    }
    topLevelNames.add(field.name);
    dependencies.set(
      field.name,
      field.visibleWhen === undefined ? [] : getConditionFields(field.visibleWhen),
    );

    checkField(field, field.name);
    if (field.type === "group") {
      checkGroup(field);
    }
  }

  problems.push(...findCycles(dependencies), ...checkSteps(schema, topLevelNames));
  return problems;
}

/**
 * "A is shown when B is ticked, and B is shown when A is ticked": neither can
 * ever be reached. This walks the chain from each field and reports the first
 * field it meets twice.
 */
function findCycles(dependencies: Map<string, string[]>): string[] {
  const problems: string[] = [];
  /** Fields whose whole chain was walked and has no cycle. */
  const finished = new Set<string>();

  function walk(name: string, path: string[]) {
    if (finished.has(name)) {
      return;
    }
    if (path.includes(name)) {
      const cycle = [...path.slice(path.indexOf(name)), name];
      problems.push(`The visibility of these fields goes in a circle: ${cycle.join(" → ")}.`);
      return;
    }
    for (const dependency of dependencies.get(name) ?? []) {
      walk(dependency, [...path, name]);
    }
    finished.add(name);
  }

  for (const name of dependencies.keys()) {
    walk(name, []);
  }
  return problems;
}

function checkSteps(schema: FormSchema, topLevelNames: Set<string>): string[] {
  if (schema.steps === undefined) {
    return [];
  }

  const problems: string[] = [];
  const seen = new Set<string>();

  for (const step of schema.steps) {
    for (const name of step.fields) {
      if (!topLevelNames.has(name)) {
        problems.push(`The step "${step.title}" names "${name}", which is not a field.`);
      }
      if (seen.has(name)) {
        problems.push(`The field "${name}" is in more than one step.`);
      }
      seen.add(name);
    }
  }

  for (const name of topLevelNames) {
    if (!seen.has(name)) {
      problems.push(`The field "${name}" is in no step.`);
    }
  }
  return problems;
}

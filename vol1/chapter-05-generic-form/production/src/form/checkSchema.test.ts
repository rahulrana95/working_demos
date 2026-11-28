/*
 * NOT PART OF THE INTERVIEW: production version.
 * One test for each mistake that an admin can make in a form builder.
 */
import { checkSchema } from "./checkSchema";
import type { FieldSchema, FormSchema } from "./types";

function makeSchema(fields: FieldSchema[], extra: Partial<FormSchema> = {}): FormSchema {
  return { id: "test", fields, ...extra };
}

const text = (name: string, extra: Partial<FieldSchema> = {}): FieldSchema => ({
  name,
  label: name,
  type: "text",
  ...extra,
});

describe("checkSchema", () => {
  it("finds nothing in a correct schema", () => {
    const schema = makeSchema(
      [
        text("name", { rules: [{ type: "pattern", value: "^[A-Z]+$" }] }),
        { name: "kind", label: "Kind", type: "select", options: [{ value: "a", label: "A" }] },
        text("company", { visibleWhen: { field: "kind", equals: "a" } }),
        {
          name: "children",
          label: "Children",
          type: "group",
          minItems: 1,
          maxItems: 3,
          fields: [text("name"), text("school", { visibleWhen: { field: "kind", equals: "a" } })],
        },
      ],
      {
        steps: [
          { title: "One", fields: ["name", "kind"] },
          { title: "Two", fields: ["company", "children"] },
        ],
      },
    );

    expect(checkSchema(schema)).toEqual([]);
  });

  it("finds a field name that is used twice", () => {
    expect(checkSchema(makeSchema([text("email"), text("email")]))).toEqual([
      'The field name "email" is used more than once.',
    ]);
  });

  it("finds a condition that points at a field that does not exist", () => {
    const schema = makeSchema([text("pan", { visibleWhen: { field: "county", equals: "IN" } })]);

    expect(checkSchema(schema)).toEqual([
      '"pan" is shown depending on "county", which is not a field outside a group.',
    ]);
  });

  it("looks inside “all” and “any” conditions", () => {
    const schema = makeSchema([
      text("a"),
      text("b", {
        visibleWhen: { all: [{ field: "a", equals: "x" }, { any: [{ field: "zz", in: ["1"] }] }] },
      }),
    ]);

    expect(checkSchema(schema)).toEqual([
      '"b" is shown depending on "zz", which is not a field outside a group.',
    ]);
  });

  it("finds two fields that each wait for the other", () => {
    const schema = makeSchema([
      text("a", { visibleWhen: { field: "b", equals: "x" } }),
      text("b", { visibleWhen: { field: "a", equals: "x" } }),
    ]);

    expect(checkSchema(schema)).toEqual([
      "The visibility of these fields goes in a circle: a → b → a.",
    ]);
  });

  it("finds a longer circle, and a field that waits for itself", () => {
    const schema = makeSchema([
      text("a", { visibleWhen: { field: "c", equals: "x" } }),
      text("b", { visibleWhen: { field: "a", equals: "x" } }),
      text("c", { visibleWhen: { field: "b", equals: "x" } }),
      text("self", { visibleWhen: { field: "self", equals: "x" } }),
    ]);

    expect(checkSchema(schema)).toEqual([
      "The visibility of these fields goes in a circle: a → c → b → a.",
      "The visibility of these fields goes in a circle: self → self.",
    ]);
  });

  it("does not call a chain without a circle a problem", () => {
    const schema = makeSchema([
      text("a"),
      text("b", { visibleWhen: { field: "a", equals: "x" } }),
      text("c", { visibleWhen: { field: "b", equals: "x" } }),
      text("d", {
        visibleWhen: {
          all: [
            { field: "b", equals: "x" },
            { field: "c", equals: "x" },
          ],
        },
      }),
    ]);

    expect(checkSchema(schema)).toEqual([]);
  });

  it("finds a select and radio buttons with no options", () => {
    const schema = makeSchema([
      { name: "team", label: "Team", type: "select" },
      { name: "place", label: "Place", type: "radio", options: [] },
    ]);

    expect(checkSchema(schema)).toEqual([
      '"team" is a select with no options.',
      '"place" is a radio with no options.',
    ]);
  });

  it("finds a pattern that is not a regular expression", () => {
    const schema = makeSchema([text("code", { rules: [{ type: "pattern", value: "[A-Z" }] })]);

    expect(checkSchema(schema)).toEqual([
      '"code" has a pattern that is not a valid regular expression.',
    ]);
  });

  it("finds a pattern that is longer than 200 characters", () => {
    const schema = makeSchema([
      text("ok", { rules: [{ type: "pattern", value: "a".repeat(200) }] }),
      text("long", { rules: [{ type: "pattern", value: "a".repeat(201) }] }),
    ]);

    expect(checkSchema(schema)).toEqual([
      '"long" has a pattern of 201 characters. The limit is 200.',
    ]);
  });

  it("finds a field name with a dot, which would clash with the names of group items", () => {
    expect(checkSchema(makeSchema([text("home.city")]))).toEqual([
      'The field name "home.city" has a dot in it.',
    ]);
  });

  it("checks the fields inside a group, and names them with the group", () => {
    const schema = makeSchema([
      {
        name: "children",
        label: "Children",
        type: "group",
        minItems: 4,
        maxItems: 2,
        fields: [
          text("name"),
          text("name"),
          { name: "school", label: "School", type: "select" },
          text("age", { visibleWhen: { field: "name", notEquals: "" } }),
          { name: "toys", label: "Toys", type: "group", fields: [text("toy")] },
        ],
      },
      { name: "empty", label: "Empty", type: "group" },
    ]);

    expect(checkSchema(schema)).toEqual([
      'The group "children" has a minItems that is larger than its maxItems.',
      'The field name "children.name" is used more than once.',
      '"children.school" is a select with no options.',
      '"children.age" is shown depending on "name", which is not a field outside a group.',
      '"children.toys" is a group inside a group. That is not supported.',
      'The group "empty" has no fields.',
    ]);
  });

  it("does not let a field depend on a group, which has no value of its own", () => {
    const schema = makeSchema([
      { name: "children", label: "Children", type: "group", fields: [text("name")] },
      text("school", { visibleWhen: { field: "children", notEquals: "" } }),
    ]);

    expect(checkSchema(schema)).toEqual([
      '"school" is shown depending on "children", which is not a field outside a group.',
    ]);
  });

  it("finds steps that name a missing field, a field twice, or leave a field out", () => {
    const schema = makeSchema([text("a"), text("b"), text("c")], {
      steps: [
        { title: "One", fields: ["a", "x"] },
        { title: "Two", fields: ["a", "b"] },
      ],
    });

    expect(checkSchema(schema)).toEqual([
      'The step "One" names "x", which is not a field.',
      'The field "a" is in more than one step.',
      'The field "c" is in no step.',
    ]);
  });

  it("reports every problem of a schema, not only the first", () => {
    const schema = makeSchema([
      text("email"),
      text("email"),
      { name: "team", label: "Team", type: "select" },
    ]);

    expect(checkSchema(schema)).toHaveLength(2);
  });
});

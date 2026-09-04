import { describe, expect, test } from "bun:test";

import { type } from "arktype";

import { toStandardJsonSchema } from "@valibot/to-json-schema";

import * as v from "valibot";

import * as z from "zod";

import { Gelis, inspectContract } from "gelis";

import type { StandardJSONSchemaV1, StandardSchemaV1 } from "gelis";

import { projectPaths } from "../../src/path";

describe("OpenAPI cross-library Standard JSON Schema conformance", () => {
  test("projects Zod schemas through input and output Standard JSON Schema conversion", () => {
    const schema = z.object({
      name: z.string(),

      tags: z.array(z.string()).optional(),
    });

    schema satisfies StandardSchemaV1;

    schema satisfies StandardJSONSchemaV1;

    const app = new Gelis();

    app.post(
      "/zod",

      {
        body: schema,

        responses: {
          200: {
            schema,

            serialize: "json",
          },
        },
      },

      () => new Response(),
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([]);

    assertObjectStringProperty(
      result.paths["/zod"]?.post?.requestBody?.content["application/json"]?.schema,

      "name",
    );

    assertObjectStringProperty(
      result.paths["/zod"]?.post?.responses["200"]?.content?.["application/json"]?.schema,

      "name",
    );
  });

  test("projects ArkType schemas through input and output Standard JSON Schema conversion", () => {
    const schema = type({
      name: "string",

      "tags?": "string[]",
    });

    schema satisfies StandardSchemaV1;

    schema satisfies StandardJSONSchemaV1;

    const app = new Gelis();

    app.post(
      "/arktype",

      {
        body: schema,

        responses: {
          200: {
            schema,

            serialize: "json",
          },
        },
      },

      () => new Response(),
    );

    app.get(
      "/arktype-direct",

      {
        responses: {
          200: schema,
        },
      },

      () => new Response(),
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([]);

    assertObjectStringProperty(
      result.paths["/arktype"]?.post?.requestBody?.content["application/json"]?.schema,

      "name",
    );

    assertObjectStringProperty(
      result.paths["/arktype"]?.post?.responses["200"]?.content?.["application/json"]?.schema,

      "name",
    );

    assertObjectStringProperty(
      result.paths["/arktype-direct"]?.get?.responses["200"]?.content?.["application/json"]?.schema,

      "name",
    );
  });

  test("projects Valibot schemas through its official Standard JSON Schema wrapper", () => {
    const validationSchema = v.object({
      name: v.string(),

      tags: v.optional(v.array(v.string())),
    });

    const schema = toStandardJsonSchema(validationSchema);

    schema satisfies StandardSchemaV1;

    schema satisfies StandardJSONSchemaV1;

    /*
     * The official wrapper must preserve the
     * Valibot Standard Schema validator rather
     * than becoming serialization-only.
     */
    expect(typeof schema["~standard"].validate).toBe("function");

    expect(typeof schema["~standard"].jsonSchema.input).toBe("function");

    expect(typeof schema["~standard"].jsonSchema.output).toBe("function");

    const app = new Gelis();

    app.post(
      "/valibot",

      {
        body: schema,

        responses: {
          200: {
            schema,

            serialize: "json",
          },
        },
      },

      () => new Response(),
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([]);

    assertObjectStringProperty(
      result.paths["/valibot"]?.post?.requestBody?.content["application/json"]?.schema,

      "name",
    );

    assertObjectStringProperty(
      result.paths["/valibot"]?.post?.responses["200"]?.content?.["application/json"]?.schema,

      "name",
    );
  });
});

function assertObjectStringProperty(
  schema: unknown,

  propertyName: string,
): void {
  expect(isRecord(schema)).toBe(true);

  if (!isRecord(schema)) {
    throw new Error("Expected a JSON Schema object.");
  }

  expect(schema.type).toBe("object");

  const properties = schema.properties;

  expect(isRecord(properties)).toBe(true);

  if (!isRecord(properties)) {
    throw new Error("Expected JSON Schema object properties.");
  }

  const property = properties[propertyName];

  expect(isRecord(property)).toBe(true);

  if (!isRecord(property)) {
    throw new Error(`Expected JSON Schema property "${propertyName}".`);
  }

  expect(property.type).toBe("string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

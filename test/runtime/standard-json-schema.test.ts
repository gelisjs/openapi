import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "gelis";

import type { StandardJSONSchemaV1, StandardSchemaV1 } from "gelis";

import { projectPaths } from "../../src/path";

import {
  createStandardJSONSchemaProjectionResolver,
  createStandardJSONSchemaResolver,
  STANDARD_JSON_SCHEMA_TARGET,
} from "../../src/standard-json-schema";

type TestValue = Record<string, unknown>;

type ConvertibleSchema = StandardSchemaV1<TestValue, TestValue> & StandardJSONSchemaV1<TestValue, TestValue>;

describe("Standard JSON Schema resolution", () => {
  test("uses draft-2020-12 and memoizes input and output independently", () => {
    let inputCalls = 0;

    let outputCalls = 0;

    const schema = createConvertibleSchema({
      input(options) {
        inputCalls += 1;

        expect(options).toEqual({
          target: STANDARD_JSON_SCHEMA_TARGET,
        });

        return {
          type: "object",

          properties: {
            input: {
              type: "string",
            },
          },
        };
      },

      output(options) {
        outputCalls += 1;

        expect(options).toEqual({
          target: STANDARD_JSON_SCHEMA_TARGET,
        });

        return {
          type: "object",

          properties: {
            output: {
              type: "string",
            },
          },
        };
      },
    });

    const resolver = createStandardJSONSchemaResolver();

    const inputA = resolver.resolveInput(schema);

    const inputB = resolver.resolveInput(schema);

    const outputA = resolver.resolveOutput(schema);

    const outputB = resolver.resolveOutput(schema);

    expect(inputCalls).toBe(1);

    expect(outputCalls).toBe(1);

    expect(inputA).not.toBe(inputB);

    expect(outputA).not.toBe(outputB);

    expect(inputA).toEqual(inputB);

    expect(outputA).toEqual(outputB);
  });

  test("keeps cached schemas detached from converter output and from each occurrence", () => {
    const converterOwned: Record<string, unknown> = {
      type: "object",

      properties: {
        value: {
          type: "string",
        },
      },
    };

    let calls = 0;

    const schema = createConvertibleSchema({
      input() {
        calls += 1;

        return converterOwned;
      },

      output() {
        return {
          type: "object",
        };
      },
    });

    const resolver = createStandardJSONSchemaResolver();

    const first = resolver.resolveInput(schema);

    converterOwned["type"] = "string";

    if (!isRecord(first)) {
      throw new Error("Expected object schema");
    }

    const properties = first["properties"];

    if (!isRecord(properties)) {
      throw new Error("Expected object properties");
    }

    properties["mutated"] = {
      type: "boolean",
    };

    const second = resolver.resolveInput(schema);

    expect(calls).toBe(1);

    expect(second).toEqual({
      type: "object",

      properties: {
        value: {
          type: "string",
        },
      },
    });
  });

  test("borrows detached canonical schemas only for production projection", () => {
    const converterOwned: Record<string, unknown> = {
      type: "object",

      properties: {
        value: {
          type: "string",
        },
      },
    };

    let calls = 0;

    const schema = createConvertibleSchema({
      input() {
        calls += 1;

        return converterOwned;
      },

      output() {
        return {
          type: "object",
        };
      },
    });

    const resolver = createStandardJSONSchemaProjectionResolver();

    const first = resolver.resolveInput(schema);

    const second = resolver.resolveInput(schema);

    expect(calls).toBe(1);

    /*
     * Projection mode intentionally borrows the
     * resolver-owned canonical copy.
     */
    expect(first).toBe(second);

    /*
     * It must still never borrow converter-owned
     * state.
     */
    expect(first).not.toBe(converterOwned);

    converterOwned["type"] = "string";

    expect(first).toEqual({
      type: "object",

      properties: {
        value: {
          type: "string",
        },
      },
    });
  });

  test("caches converter failures by schema identity and direction", () => {
    const failure = new Error("converter failure");

    let inputCalls = 0;

    const schema = createConvertibleSchema({
      input() {
        inputCalls += 1;

        throw failure;
      },

      output() {
        return {
          type: "object",
        };
      },
    });

    const resolver = createStandardJSONSchemaResolver();

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        resolver.resolveInput(schema);

        throw new Error("Expected resolver failure");
      } catch (cause) {
        expect(cause).toBe(failure);
      }
    }

    expect(inputCalls).toBe(1);
  });

  test("automatically resolves shared schemas during contract projection", () => {
    let inputCalls = 0;

    let outputCalls = 0;

    const schema = createConvertibleSchema({
      input() {
        inputCalls += 1;

        return {
          type: "object",

          properties: {
            q: {
              type: "string",
            },
          },

          required: ["q"],
        };
      },

      output() {
        outputCalls += 1;

        return {
          type: "object",

          properties: {
            ok: {
              type: "boolean",
            },
          },

          required: ["ok"],
        };
      },
    });

    const app = new Gelis();

    app.post(
      "/items",

      {
        query: schema,

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

    expect(inputCalls).toBe(1);

    expect(outputCalls).toBe(1);

    expect(result.paths["/items"]?.post?.parameters).toEqual([
      {
        name: "q",

        in: "query",

        required: true,

        schema: {
          type: "string",
        },
      },
    ]);

    expect(result.paths["/items"]?.post?.requestBody).toEqual({
      required: true,

      content: {
        "application/json": {
          schema: {
            type: "object",

            properties: {
              q: {
                type: "string",
              },
            },

            required: ["q"],
          },
        },
      },
    });

    expect(result.paths["/items"]?.post?.responses["200"]).toEqual({
      description: "HTTP 200 response",

      content: {
        "application/json": {
          schema: {
            type: "object",

            properties: {
              ok: {
                type: "boolean",
              },
            },

            required: ["ok"],
          },
        },
      },
    });
  });

  test("keeps final projected occurrences independently mutable with shared schema identity", () => {
    let inputCalls = 0;

    const schema = createConvertibleSchema({
      input() {
        inputCalls += 1;

        return {
          type: "object",

          properties: {
            value: {
              type: "string",
            },
          },

          required: ["value"],
        };
      },

      output() {
        return {
          type: "object",
        };
      },
    });

    const app = new Gelis();

    app.post(
      "/first",

      {
        body: schema,
      },

      () => new Response(),
    );

    app.post(
      "/second",

      {
        body: schema,
      },

      () => new Response(),
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([]);

    expect(inputCalls).toBe(1);

    const first = result.paths["/first"]?.post?.requestBody?.content["application/json"]?.schema;

    const second = result.paths["/second"]?.post?.requestBody?.content["application/json"]?.schema;

    expect(first).not.toBe(second);

    if (!isRecord(first) || !isRecord(second)) {
      throw new Error("Expected projected object schemas.");
    }

    const firstProperties = first["properties"];

    const secondProperties = second["properties"];

    if (!isRecord(firstProperties) || !isRecord(secondProperties)) {
      throw new Error("Expected projected schema properties.");
    }

    firstProperties["mutated"] = {
      type: "boolean",
    };

    expect(secondProperties["mutated"]).toBeUndefined();

    expect(second).toEqual({
      type: "object",

      properties: {
        value: {
          type: "string",
        },
      },

      required: ["value"],
    });
  });

  test("turns missing Standard JSON Schema capability into a contextual generation issue", () => {
    const app = new Gelis();

    app.get(
      "/search",

      {
        query: createValidationOnlySchema(),
      },

      () => "search",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toHaveLength(1);

    expect(result.issues[0]?.code).toBe("OPENAPI_QUERY_SCHEMA_RESOLUTION_FAILED");

    expect(result.issues[0]?.method).toBe("GET");

    expect(result.issues[0]?.path).toBe("/search");

    expect(result.issues[0]?.location).toBe("request.query");

    expect(result.issues[0]?.cause).toBeInstanceOf(TypeError);

    expect((result.issues[0]?.cause as Error).message).toBe(
      "Standard Schema does not expose Standard JSON Schema V1 conversion capability.",
    );
  });
});

function createConvertibleSchema(converter: StandardJSONSchemaV1.Converter): ConvertibleSchema {
  return {
    "~standard": {
      version: 1,

      vendor: "test",

      validate(value: unknown) {
        return {
          value: value as TestValue,
        };
      },

      jsonSchema: converter,
    },
  };
}

function createValidationOnlySchema(): StandardSchemaV1<TestValue, TestValue> {
  return {
    "~standard": {
      version: 1,

      vendor: "test",

      validate(value: unknown) {
        return {
          value: value as TestValue,
        };
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

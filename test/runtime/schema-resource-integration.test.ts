import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "gelis";

import type { StandardJSONSchemaV1, StandardSchemaV1 } from "gelis";

import { projectPaths } from "../../src/path";

import { SchemaResourceError } from "../../src/schema-resource";

type Value = Record<string, unknown>;

type ConvertibleSchema = StandardSchemaV1<Value, Value> & StandardJSONSchemaV1<Value, Value>;

describe("OpenAPI schema resource integration", () => {
  test("assigns distinct deterministic synthetic resources to shared body and response schemas", () => {
    let inputCalls = 0;

    let outputCalls = 0;

    const schema = createConvertibleSchema({
      input() {
        inputCalls += 1;

        return recursiveSchema();
      },

      output() {
        outputCalls += 1;

        return recursiveSchema();
      },
    });

    const app = new Gelis();

    app.post(
      "/trees/:id",

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

    expect(inputCalls).toBe(1);

    expect(outputCalls).toBe(1);

    expect(result.paths["/trees/{id}"]?.post?.requestBody?.content["application/json"]?.schema).toEqual({
      $defs: {
        node: {
          type: "object",

          properties: {
            next: {
              $ref: "#/$defs/node",
            },
          },
        },
      },

      $ref: "#/$defs/node",

      $id: "https://schemas.gelis.invalid/openapi/post/%2Ftrees%2F%3Aid/request/body",
    });

    expect(result.paths["/trees/{id}"]?.post?.responses["200"]?.content?.["application/json"]?.schema).toEqual({
      $defs: {
        node: {
          type: "object",

          properties: {
            next: {
              $ref: "#/$defs/node",
            },
          },
        },
      },

      $ref: "#/$defs/node",

      $id: "https://schemas.gelis.invalid/openapi/post/%2Ftrees%2F%3Aid/responses/200",
    });
  });

  test("projects self-contained recursive query parameter schemas", () => {
    const schema = createConvertibleSchema({
      input() {
        return {
          type: "object",

          properties: {
            node: {
              $defs: {
                value: {
                  type: "string",
                },
              },

              $ref: "#/$defs/value",
            },
          },

          required: ["node"],
        };
      },

      output() {
        return {
          type: "object",
        };
      },
    });

    const app = new Gelis();

    app.get(
      "/search",

      {
        query: schema,
      },

      () => "ok",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([]);

    expect(result.paths["/search"]?.get?.parameters).toEqual([
      {
        name: "node",

        in: "query",

        required: true,

        schema: {
          $defs: {
            value: {
              type: "string",
            },
          },

          $ref: "#/$defs/value",

          $id: "https://schemas.gelis.invalid/openapi/get/%2Fsearch/request/query/node",
        },
      },
    ]);
  });

  test("rejects query parameter refs that depend on the discarded parent query schema", () => {
    const schema = createConvertibleSchema({
      input() {
        return {
          type: "object",

          $defs: {
            shared: {
              type: "string",
            },
          },

          properties: {
            q: {
              $ref: "#/$defs/shared",
            },
          },
        };
      },

      output() {
        return {
          type: "object",
        };
      },
    });

    const app = new Gelis();

    app.get(
      "/search",

      {
        query: schema,
      },

      () => "ok",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toHaveLength(1);

    expect(result.issues[0]?.code).toBe("OPENAPI_SCHEMA_REFERENCE_UNRESOLVABLE");

    expect(result.issues[0]?.method).toBe("GET");

    expect(result.issues[0]?.path).toBe("/search");

    expect(result.issues[0]?.location).toBe("request.query.q");

    expect(result.issues[0]?.cause).toBeInstanceOf(SchemaResourceError);

    expect(result.paths["/search"]?.get?.parameters).toBeUndefined();
  });

  test("preserves explicit absolute resource ids and relative external refs", () => {
    const schema = createConvertibleSchema({
      input() {
        return {
          $id: "https://example.com/root.json",

          $ref: "other.json",
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
      "/external",

      {
        body: schema,
      },

      () => "ok",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([]);

    expect(result.paths["/external"]?.post?.requestBody?.content["application/json"]?.schema).toEqual({
      $id: "https://example.com/root.json",

      $ref: "other.json",
    });
  });
});

function recursiveSchema(): Record<string, unknown> {
  return {
    $defs: {
      node: {
        type: "object",

        properties: {
          next: {
            $ref: "#/$defs/node",
          },
        },
      },
    },

    $ref: "#/$defs/node",
  };
}

function createConvertibleSchema(converter: StandardJSONSchemaV1.Converter): ConvertibleSchema {
  return {
    "~standard": {
      version: 1,

      vendor: "test",

      validate(value: unknown) {
        return {
          value: value as Value,
        };
      },

      jsonSchema: converter,
    },
  };
}

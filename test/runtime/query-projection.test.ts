import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "gelis";

import type { StandardSchemaV1 } from "gelis";

import { projectPaths } from "../../src/path";

import type { InputSchemaResolver } from "../../src/schema-resolution";

describe("OpenAPI query projection", () => {
  test("projects object properties after path parameters with deterministic query ordering", () => {
    const app = new Gelis();

    const querySchema = createQuerySchema();

    app.get(
      "/search/:scope",

      {
        query: querySchema,
      },

      () => "search",
    );

    const resolver: InputSchemaResolver = {
      resolveInput(schema) {
        expect(schema).toBe(querySchema);

        return {
          type: "object",

          properties: {
            tags: {
              type: "array",

              items: {
                type: "string",
              },
            },

            q: {
              type: "string",
            },

            limit: {
              type: "integer",
            },
          },

          required: ["q", "tags"],
        };
      },
    };

    const result = projectPaths(
      inspectContract(app),

      resolver,
    );

    expect(result.issues).toEqual([]);

    expect(result.paths["/search/{scope}"]?.get?.parameters).toEqual([
      {
        name: "scope",

        in: "path",

        required: true,

        schema: {
          type: "string",
        },
      },

      {
        name: "limit",

        in: "query",

        schema: {
          type: "integer",
        },
      },

      {
        name: "q",

        in: "query",

        required: true,

        schema: {
          type: "string",
        },
      },

      {
        name: "tags",

        in: "query",

        required: true,

        schema: {
          type: "array",

          items: {
            type: "string",
          },
        },

        style: "form",

        explode: true,
      },
    ]);
  });

  test("reports a missing resolver only when automatic query projection is required", () => {
    const app = new Gelis();

    app.get(
      "/search",

      {
        query: createQuerySchema(),
      },

      () => "search",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([
      {
        code: "OPENAPI_QUERY_SCHEMA_RESOLVER_REQUIRED",

        method: "GET",

        path: "/search",

        location: "request.query",

        message: "Automatic query projection requires an input JSON Schema resolver.",
      },
    ]);
  });

  test("reports query schemas that cannot be decomposed into independent parameters", () => {
    const app = new Gelis();

    app.get(
      "/search",

      {
        query: createQuerySchema(),
      },

      () => "search",
    );

    const resolver: InputSchemaResolver = {
      resolveInput() {
        return {
          type: "string",
        };
      },
    };

    const result = projectPaths(
      inspectContract(app),

      resolver,
    );

    expect(result.issues).toHaveLength(1);

    expect(result.issues[0]).toEqual({
      code: "OPENAPI_QUERY_SCHEMA_NOT_DECOMPOSABLE",

      method: "GET",

      path: "/search",

      location: "request.query",

      message:
        "The query schema for GET /search cannot be projected automatically: the root schema does not describe an object.",
    });
  });

  test("preserves resolver failure identity as an aggregate generation issue cause", () => {
    const app = new Gelis();

    app.get(
      "/search",

      {
        query: createQuerySchema(),
      },

      () => "search",
    );

    const failure = new Error("converter failure");

    const resolver: InputSchemaResolver = {
      resolveInput() {
        throw failure;
      },
    };

    const result = projectPaths(
      inspectContract(app),

      resolver,
    );

    expect(result.issues).toHaveLength(1);

    expect(result.issues[0]?.code).toBe("OPENAPI_QUERY_SCHEMA_RESOLUTION_FAILED");

    expect(result.issues[0]?.method).toBe("GET");

    expect(result.issues[0]?.path).toBe("/search");

    expect(result.issues[0]?.location).toBe("request.query");

    expect(result.issues[0]?.cause).toBe(failure);
  });

  test("does not resolve schemas for routes excluded from OpenAPI", () => {
    const app = new Gelis();

    app.get(
      "/hidden",

      {
        query: createQuerySchema(),

        openapi: false,
      },

      () => "hidden",
    );

    let calls = 0;

    const resolver: InputSchemaResolver = {
      resolveInput() {
        calls += 1;

        throw new Error("must not run");
      },
    };

    const result = projectPaths(
      inspectContract(app),

      resolver,
    );

    expect(calls).toBe(0);

    expect(result.issues).toEqual([]);

    expect(result.paths).toEqual({});
  });
});

function createQuerySchema(): StandardSchemaV1<Record<string, unknown>, Record<string, unknown>> {
  return {
    "~standard": {
      version: 1,

      vendor: "test",

      validate(value: unknown) {
        return {
          value: value as Record<string, unknown>,
        };
      },
    },
  };
}

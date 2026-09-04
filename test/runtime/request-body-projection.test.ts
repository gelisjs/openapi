import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "gelis";

import type { StandardSchemaV1 } from "gelis";

import { projectPaths } from "../../src/path";

import type { InputSchemaResolver } from "../../src/schema-resolution";

describe("OpenAPI request body projection", () => {
  test("projects request body together with path and query parameters", () => {
    const app = new Gelis();

    const querySchema = createSchema();

    const bodySchema = createSchema();

    app.post(
      "/items/:id",

      {
        query: querySchema,

        body: bodySchema,
      },

      () => "created",
    );

    const calls: StandardSchemaV1[] = [];

    const resolver: InputSchemaResolver = {
      resolveInput(schema) {
        calls.push(schema);

        if (schema === querySchema) {
          return {
            type: "object",

            properties: {
              filter: {
                type: "string",
              },
            },

            required: ["filter"],
          };
        }

        if (schema === bodySchema) {
          return {
            type: "object",

            properties: {
              name: {
                type: "string",
              },
            },

            required: ["name"],
          };
        }

        throw new Error("unexpected schema");
      },
    };

    const result = projectPaths(
      inspectContract(app),

      resolver,
    );

    expect(result.issues).toEqual([]);

    expect(calls).toEqual([querySchema, bodySchema]);

    expect(result.paths["/items/{id}"]?.post?.parameters).toEqual([
      {
        name: "id",

        in: "path",

        required: true,

        schema: {
          type: "string",
        },
      },

      {
        name: "filter",

        in: "query",

        required: true,

        schema: {
          type: "string",
        },
      },
    ]);

    expect(result.paths["/items/{id}"]?.post?.requestBody).toEqual({
      required: true,

      content: {
        "application/json": {
          schema: {
            type: "object",

            properties: {
              name: {
                type: "string",
              },
            },

            required: ["name"],
          },
        },
      },
    });
  });

  test("reports a missing resolver only when automatic request body projection is required", () => {
    const app = new Gelis();

    app.post(
      "/items",

      {
        body: createSchema(),
      },

      () => "created",
    );

    const result = projectPaths(
      inspectContract(app),

      {},
    );

    expect(result.issues).toEqual([
      {
        code: "OPENAPI_REQUEST_BODY_SCHEMA_RESOLVER_REQUIRED",

        method: "POST",

        path: "/items",

        location: "request.body",

        message: "Automatic request body projection requires an input JSON Schema resolver.",
      },
    ]);
  });

  test("preserves resolver failure identity as a request body issue cause", () => {
    const app = new Gelis();

    app.post(
      "/items",

      {
        body: createSchema(),
      },

      () => "created",
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

    expect(result.issues[0]).toEqual({
      code: "OPENAPI_REQUEST_BODY_SCHEMA_RESOLUTION_FAILED",

      method: "POST",

      path: "/items",

      location: "request.body",

      message: "Failed to resolve the request body schema for POST /items.",

      cause: failure,
    });
  });

  test("does not resolve request body schemas for routes excluded from OpenAPI", () => {
    const app = new Gelis();

    app.post(
      "/hidden",

      {
        body: createSchema(),

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

  test("does not rewrite request body semantics based on HTTP method conventions", () => {
    const app = new Gelis();

    const bodySchema = createSchema();

    app.get(
      "/search",

      {
        body: bodySchema,
      },

      () => "search",
    );

    const resolver: InputSchemaResolver = {
      resolveInput(schema) {
        expect(schema).toBe(bodySchema);

        return true;
      },
    };

    const result = projectPaths(
      inspectContract(app),

      resolver,
    );

    expect(result.issues).toEqual([]);

    expect(result.paths["/search"]?.get?.requestBody).toEqual({
      required: true,

      content: {
        "application/json": {
          schema: true,
        },
      },
    });
  });
});

function createSchema(): StandardSchemaV1<Record<string, unknown>, Record<string, unknown>> {
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

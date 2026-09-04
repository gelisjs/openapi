import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "gelis";

import type { StandardSchemaV1 } from "gelis";

import { projectPaths } from "../../src/path";

import type { SchemaResolver } from "../../src/schema-resolution";

describe("OpenAPI response projection", () => {
  test("projects explicit statuses in numeric order with runtime media semantics", () => {
    const app = new Gelis();

    const autoText = createSchema<string>();

    const explicitJson = createSchema<{
      ok: boolean;
    }>();

    const autoJson = createSchema<{
      id: number;
    }>();

    const explicitText = createSchema<string>();

    app.get(
      "/responses",

      {
        responses: {
          204: undefined,

          203: {
            schema: explicitText,

            serialize: "text",

            contentType: "text/csv",
          },

          202: {
            schema: autoJson,

            validate: true,
          },

          201: {
            schema: explicitJson,

            serialize: "json",

            contentType: "application/vnd.gelis.test+json",
          },

          200: autoText,
        },
      },

      () => new Response("raw"),
    );

    const calls: StandardSchemaV1[] = [];

    const resolver: SchemaResolver = {
      resolveOutput(schema) {
        calls.push(schema);

        if (schema === autoText) {
          return {
            type: "string",
          };
        }

        if (schema === explicitJson) {
          /*
           * Explicit JSON serialization does
           * not require AUTO media inference.
           */
          return true;
        }

        if (schema === autoJson) {
          return {
            type: "object",
          };
        }

        if (schema === explicitText) {
          return {
            type: "string",
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

    expect(calls).toEqual([autoText, explicitJson, autoJson, explicitText]);

    const responses = result.paths["/responses"]?.get?.responses;

    expect(Object.keys(responses ?? {})).toEqual(["200", "201", "202", "203", "204"]);

    expect(responses).toEqual({
      200: {
        description: "HTTP 200 response",

        content: {
          "text/plain": {
            schema: {
              type: "string",
            },
          },
        },
      },

      201: {
        description: "HTTP 201 response",

        content: {
          "application/vnd.gelis.test+json": {
            schema: true,
          },
        },
      },

      202: {
        description: "HTTP 202 response",

        content: {
          "application/json": {
            schema: {
              type: "object",
            },
          },
        },
      },

      203: {
        description: "HTTP 203 response",

        content: {
          "text/csv": {
            schema: {
              type: "string",
            },
          },
        },
      },

      204: {
        description: "HTTP 204 response",
      },
    });
  });

  test("projects implicit handler responses as opaque default responses without schema resolution", () => {
    const app = new Gelis();

    app.get(
      "/implicit",

      () => "hello",
    );

    let calls = 0;

    const resolver: SchemaResolver = {
      resolveOutput() {
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

    expect(result.paths["/implicit"]?.get?.responses).toEqual({
      default: {
        description: "Undocumented response",
      },
    });
  });

  test("reports a missing output resolver for body-bearing explicit responses", () => {
    const app = new Gelis();

    app.get(
      "/items",

      {
        responses: {
          200: createSchema<{
            ok: boolean;
          }>(),
        },
      },

      () => new Response(),
    );

    const result = projectPaths(
      inspectContract(app),

      {},
    );

    expect(result.issues).toEqual([
      {
        code: "OPENAPI_RESPONSE_SCHEMA_RESOLVER_REQUIRED",

        method: "GET",

        path: "/items",

        status: 200,

        location: "responses.200",

        message: "Automatic response projection for status 200 requires an output JSON Schema resolver.",
      },
    ]);
  });

  test("preserves output resolver failure identity", () => {
    const app = new Gelis();

    app.get(
      "/items",

      {
        responses: {
          200: createSchema<{
            ok: boolean;
          }>(),
        },
      },

      () => new Response(),
    );

    const failure = new Error("converter failure");

    const resolver: SchemaResolver = {
      resolveOutput() {
        throw failure;
      },
    };

    const result = projectPaths(
      inspectContract(app),

      resolver,
    );

    expect(result.issues).toHaveLength(1);

    expect(result.issues[0]).toEqual({
      code: "OPENAPI_RESPONSE_SCHEMA_RESOLUTION_FAILED",

      method: "GET",

      path: "/items",

      status: 200,

      location: "responses.200",

      message: "Failed to resolve the response schema for GET /items status 200.",

      cause: failure,
    });
  });

  test("rejects ambiguous AUTO response media types instead of guessing", () => {
    const app = new Gelis();

    const schema = createSchema<
      | string
      | {
          ok: boolean;
        }
    >();

    app.get(
      "/ambiguous",

      {
        responses: {
          200: schema,
        },
      },

      () => new Response(),
    );

    const resolver: SchemaResolver = {
      resolveOutput() {
        return {};
      },
    };

    const result = projectPaths(
      inspectContract(app),

      resolver,
    );

    expect(result.issues).toEqual([
      {
        code: "OPENAPI_RESPONSE_MEDIA_TYPE_AMBIGUOUS",

        method: "GET",

        path: "/ambiguous",

        status: 200,

        location: "responses.200",

        message:
          "The response schema for GET /ambiguous status 200 does not determine whether Gelis AUTO serialization emits text or JSON.",
      },
    ]);

    expect(result.paths["/ambiguous"]?.get?.responses["200"]).toEqual({
      description: "HTTP 200 response",
    });
  });

  test("does not resolve responses for routes excluded from OpenAPI", () => {
    const app = new Gelis();

    app.get(
      "/hidden",

      {
        responses: {
          200: createSchema<string>(),
        },

        openapi: false,
      },

      () => new Response(),
    );

    let calls = 0;

    const resolver: SchemaResolver = {
      resolveOutput() {
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

function createSchema<Output>(): StandardSchemaV1<Output, Output> {
  return {
    "~standard": {
      version: 1,

      vendor: "test",

      validate(value: unknown) {
        return {
          value: value as Output,
        };
      },
    },
  };
}

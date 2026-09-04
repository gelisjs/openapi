import { describe, expect, test } from "bun:test";

import { Gelis } from "gelis";

import type { StandardSchemaV1 } from "gelis";

import { generateOpenAPI, OpenAPIGenerationError } from "../../src";

describe("generateOpenAPI", () => {
  test("generates a complete document without executing route handlers", () => {
    let handlerCalls = 0;

    const app = new Gelis();

    app.get(
      "/users/:id",

      {
        responses: {
          200: undefined,
        },

        openapi: {
          summary: "Get user",

          description: "Fetch one user.",

          operationId: "getUser",

          tags: ["Users"],
        },
      },

      () => {
        handlerCalls += 1;

        return new Response(
          null,

          {
            status: 200,
          },
        );
      },
    );

    const document = generateOpenAPI(
      app,

      {
        info: {
          title: "Gelis API",

          version: "1.0.0",
        },

        servers: [
          {
            url: "https://api.example.com",
          },
        ],

        tags: [
          {
            name: "Users",
          },
        ],
      },
    );

    expect(handlerCalls).toBe(0);

    expect(document).toEqual({
      openapi: "3.1.2",

      jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",

      info: {
        title: "Gelis API",

        version: "1.0.0",
      },

      servers: [
        {
          url: "https://api.example.com",
        },
      ],

      tags: [
        {
          name: "Users",
        },
      ],

      paths: {
        "/users/{id}": {
          get: {
            summary: "Get user",

            description: "Fetch one user.",

            operationId: "getUser",

            tags: ["Users"],

            parameters: [
              {
                name: "id",

                in: "path",

                required: true,

                schema: {
                  type: "string",
                },
              },
            ],

            responses: {
              "200": {
                description: "HTTP 200 response",
              },
            },
          },
        },
      },
    });
  });

  test("throws one aggregate error for all projection issues", () => {
    const app = new Gelis();

    const schema = createValidationOnlySchema();

    app.get(
      "/first",

      {
        query: schema,
      },

      () => new Response(),
    );

    app.get(
      "/second",

      {
        query: schema,
      },

      () => new Response(),
    );

    try {
      generateOpenAPI(
        app,

        {
          info: {
            title: "Invalid API",

            version: "1.0.0",
          },
        },
      );

      throw new Error("Expected OpenAPI generation failure.");
    } catch (cause) {
      expect(cause).toBeInstanceOf(OpenAPIGenerationError);

      if (!(cause instanceof OpenAPIGenerationError)) {
        throw cause;
      }

      expect(cause.issues).toHaveLength(2);

      expect(cause.issues.map((issue) => issue.code)).toEqual([
        "OPENAPI_QUERY_SCHEMA_RESOLUTION_FAILED",
        "OPENAPI_QUERY_SCHEMA_RESOLUTION_FAILED",
      ]);

      expect(cause.issues.map((issue) => issue.path)).toEqual(["/first", "/second"]);
    }
  });

  test("returns fresh documents and does not cache application snapshots", () => {
    const app = new Gelis();

    app.get(
      "/first",

      {
        responses: {
          204: undefined,
        },
      },

      () =>
        new Response(
          null,

          {
            status: 204,
          },
        ),
    );

    const options = {
      info: {
        title: "Fresh API",

        version: "1.0.0",
      },
    } as const;

    const first = generateOpenAPI(app, options);

    app.get(
      "/second",

      {
        responses: {
          204: undefined,
        },
      },

      () =>
        new Response(
          null,

          {
            status: 204,
          },
        ),
    );

    const second = generateOpenAPI(app, options);

    expect(first).not.toBe(second);

    expect(first.paths).not.toBe(second.paths);

    expect(Object.keys(first.paths)).toEqual(["/first"]);

    expect(Object.keys(second.paths)).toEqual(["/first", "/second"]);

    expect(first.paths["/first"]).not.toBe(second.paths["/first"]);

    first.info.title = "Caller mutation";

    first.paths["/first"] = {
      mutated: true,
    };

    expect(second.info.title).toBe("Fresh API");

    expect(second.paths["/first"]).not.toEqual({
      mutated: true,
    });
  });

  test("excludes routes explicitly hidden from OpenAPI", () => {
    const app = new Gelis();

    app.get(
      "/visible",

      {
        responses: {
          200: undefined,
        },
      },

      () => new Response(),
    );

    app.get(
      "/internal",

      {
        openapi: false,
      },

      () => new Response(),
    );

    const document = generateOpenAPI(
      app,

      {
        info: {
          title: "Visibility API",

          version: "1.0.0",
        },
      },
    );

    expect(Object.keys(document.paths)).toEqual(["/visible"]);
  });
});

function createValidationOnlySchema(): StandardSchemaV1<Record<string, unknown>, Record<string, unknown>> {
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

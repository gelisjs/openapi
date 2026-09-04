import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "gelis";

import type { StandardSchemaV1 } from "gelis";

import { projectPaths } from "../../src/path";

import type { InputSchemaResolver } from "../../src/schema-resolution";

describe("OpenAPI query metadata", () => {
  test("uses an explicit query schema override instead of Standard JSON Schema conversion", () => {
    const app = new Gelis();

    const runtimeSchema = createQuerySchema();

    app.get(
      "/search",

      {
        query: runtimeSchema,

        openapi: {
          request: {
            query: {
              schema: {
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
                },

                required: ["q"],
              },
            },
          },
        },
      },

      () => "search",
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

    expect(result.paths["/search"]?.get?.parameters).toEqual([
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

  test("projects explicit query parameters in user order and bypasses conversion", () => {
    const app = new Gelis();

    const runtimeSchema = createQuerySchema();

    app.get(
      "/explicit",

      {
        query: runtimeSchema,

        openapi: {
          request: {
            query: {
              parameters: [
                {
                  name: "z",

                  description: "Last alphabetically, first explicitly.",

                  required: false,

                  deprecated: true,

                  style: "form",

                  explode: false,

                  schema: {
                    $defs: {
                      value: {
                        type: "string",
                      },
                    },

                    $ref: "#/$defs/value",
                  },
                },

                {
                  name: "a",

                  description: "No schema override.",

                  required: true,
                },
              ],
            },
          },
        },
      },

      () => "explicit",
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

    expect(result.paths["/explicit"]?.get?.parameters).toEqual([
      {
        name: "z",

        in: "query",

        description: "Last alphabetically, first explicitly.",

        required: false,

        deprecated: true,

        style: "form",

        explode: false,

        schema: {
          $defs: {
            value: {
              type: "string",
            },
          },

          $ref: "#/$defs/value",

          $id: "https://schemas.gelis.invalid/openapi/get/%2Fexplicit/request/query/z",
        },
      },

      {
        name: "a",

        in: "query",

        description: "No schema override.",

        required: true,
      },
    ]);
  });

  test("opaque query metadata suppresses automatic query documentation without suppressing path parameters", () => {
    const app = new Gelis();

    app.get(
      "/search/:scope",

      {
        query: createQuerySchema(),

        openapi: {
          request: {
            query: {
              opaque: true,
            },
          },
        },
      },

      () => "search",
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

    expect(result.paths["/search/{scope}"]?.get?.parameters).toEqual([
      {
        name: "scope",

        in: "path",

        required: true,

        schema: {
          type: "string",
        },
      },
    ]);
  });

  test("supports documentation-only explicit query parameters without a runtime query validator", () => {
    const app = new Gelis();

    app.get(
      "/docs",

      {
        openapi: {
          request: {
            query: {
              parameters: [
                {
                  name: "page",

                  description: "Documentation-only page number.",

                  schema: {
                    type: "integer",

                    minimum: 1,
                  },
                },
              ],
            },
          },
        },
      },

      () => "docs",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([]);

    expect(result.paths["/docs"]?.get?.parameters).toEqual([
      {
        name: "page",

        in: "query",

        description: "Documentation-only page number.",

        schema: {
          type: "integer",

          minimum: 1,
        },
      },
    ]);
  });

  test("reports duplicate explicit query parameter names deterministically", () => {
    const app = new Gelis();

    app.get(
      "/duplicate",

      {
        openapi: {
          request: {
            query: {
              parameters: [
                {
                  name: "q",
                },

                {
                  name: "q",
                },
              ],
            },
          },
        },
      },

      () => "duplicate",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([
      {
        code: "OPENAPI_QUERY_PARAMETER_DUPLICATE",

        method: "GET",

        path: "/duplicate",

        location: "request.query.parameters.1",

        message: 'OpenAPI explicit query parameter "q" is declared more than once on GET /duplicate.',
      },
    ]);

    expect(result.paths["/duplicate"]?.get?.parameters).toEqual([
      {
        name: "q",

        in: "query",
      },
    ]);
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

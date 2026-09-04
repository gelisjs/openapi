import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "gelis";

import type { StandardSchemaV1 } from "gelis";

import { projectPaths } from "../../src/path";

import type { SchemaResolver } from "../../src/schema-resolution";

describe("OpenAPI body and response metadata", () => {
  test("uses an explicit request body schema override and bypasses conversion", () => {
    const app = new Gelis();

    const runtimeSchema = createSchema();

    app.post(
      "/items",

      {
        body: runtimeSchema,

        openapi: {
          request: {
            body: {
              description: "Create item payload.",

              required: true,

              mediaType: "application/vnd.gelis.item+json",

              schema: {
                $defs: {
                  item: {
                    type: "object",
                  },
                },

                $ref: "#/$defs/item",
              },
            },
          },
        },
      },

      () => "created",
    );

    let inputCalls = 0;

    const resolver: SchemaResolver = {
      resolveInput() {
        inputCalls += 1;

        throw new Error("must not run");
      },
    };

    const result = projectPaths(
      inspectContract(app),

      resolver,
    );

    expect(inputCalls).toBe(0);

    expect(result.issues).toEqual([]);

    expect(result.paths["/items"]?.post?.requestBody).toEqual({
      description: "Create item payload.",

      required: true,

      content: {
        "application/vnd.gelis.item+json": {
          schema: {
            $defs: {
              item: {
                type: "object",
              },
            },

            $ref: "#/$defs/item",

            $id: "https://schemas.gelis.invalid/openapi/post/%2Fitems/request/body",
          },
        },
      },
    });
  });

  test("supports documentation-only opaque request bodies", () => {
    const app = new Gelis();

    app.post(
      "/import",

      {
        openapi: {
          request: {
            body: {
              opaque: true,

              description: "CSV import.",

              required: false,

              mediaType: "text/csv",
            },
          },
        },
      },

      () => "accepted",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([]);

    expect(result.paths["/import"]?.post?.requestBody).toEqual({
      description: "CSV import.",

      required: false,

      content: {
        "text/csv": {},
      },
    });
  });

  test("rejects request body media types that contradict a runtime JSON body contract", () => {
    const app = new Gelis();

    app.post(
      "/items",

      {
        body: createSchema(),

        openapi: {
          request: {
            body: {
              opaque: true,

              mediaType: "text/plain",
            },
          },
        },
      },

      () => "created",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([
      {
        code: "OPENAPI_REQUEST_BODY_MEDIA_TYPE_CONFLICT",

        method: "POST",

        path: "/items",

        location: "request.body",

        message:
          'OpenAPI request body media type "text/plain" contradicts the JSON runtime body contract for POST /items.',
      },
    ]);

    expect(result.paths["/items"]?.post?.requestBody).toBeUndefined();
  });

  test("uses explicit response schema metadata without running output conversion", () => {
    const app = new Gelis();

    const runtimeSchema = createSchema();

    app.get(
      "/items",

      {
        responses: {
          200: {
            schema: runtimeSchema,

            serialize: "json",

            contentType: "application/vnd.gelis.item+json",
          },
        },

        openapi: {
          responses: {
            200: {
              description: "Item response.",

              mediaType: "application/vnd.gelis.item+json",

              schema: {
                $defs: {
                  item: {
                    type: "object",
                  },
                },

                $ref: "#/$defs/item",
              },
            },
          },
        },
      },

      () => new Response(),
    );

    let outputCalls = 0;

    const resolver: SchemaResolver = {
      resolveOutput() {
        outputCalls += 1;

        throw new Error("must not run");
      },
    };

    const result = projectPaths(
      inspectContract(app),

      resolver,
    );

    expect(outputCalls).toBe(0);

    expect(result.issues).toEqual([]);

    expect(result.paths["/items"]?.get?.responses["200"]).toEqual({
      description: "Item response.",

      content: {
        "application/vnd.gelis.item+json": {
          schema: {
            $defs: {
              item: {
                type: "object",
              },
            },

            $ref: "#/$defs/item",

            $id: "https://schemas.gelis.invalid/openapi/get/%2Fitems/responses/200",
          },
        },
      },
    });
  });

  test("opaque response metadata bypasses conversion while retaining deterministic runtime media type", () => {
    const app = new Gelis();

    app.get(
      "/export",

      {
        responses: {
          200: {
            schema: createSchema(),

            serialize: "text",

            contentType: "text/csv",
          },
        },

        openapi: {
          responses: {
            200: {
              opaque: true,

              description: "Opaque CSV export.",
            },
          },
        },
      },

      () => new Response(),
    );

    let outputCalls = 0;

    const resolver: SchemaResolver = {
      resolveOutput() {
        outputCalls += 1;

        throw new Error("must not run");
      },
    };

    const result = projectPaths(
      inspectContract(app),

      resolver,
    );

    expect(outputCalls).toBe(0);

    expect(result.issues).toEqual([]);

    expect(result.paths["/export"]?.get?.responses["200"]).toEqual({
      description: "Opaque CSV export.",

      content: {
        "text/csv": {},
      },
    });
  });

  test("adds documentation-only response statuses while preserving the implicit default response", () => {
    const app = new Gelis();

    app.get(
      "/docs",

      {
        openapi: {
          responses: {
            404: {
              description: "Not found.",

              schema: {
                type: "object",

                properties: {
                  error: {
                    type: "string",
                  },
                },
              },
            },

            default: {
              opaque: true,

              description: "Other response.",

              mediaType: "text/plain",
            },
          },
        },
      },

      () => "runtime response",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([]);

    const responses = result.paths["/docs"]?.get?.responses;

    expect(Object.keys(responses ?? {})).toEqual(["404", "default"]);

    expect(responses).toEqual({
      404: {
        description: "Not found.",

        content: {
          "application/json": {
            schema: {
              type: "object",

              properties: {
                error: {
                  type: "string",
                },
              },
            },
          },
        },
      },

      default: {
        description: "Other response.",

        content: {
          "text/plain": {},
        },
      },
    });
  });

  test("rejects content metadata for runtime bodyless responses", () => {
    const app = new Gelis();

    app.delete(
      "/items/:id",

      {
        responses: {
          204: undefined,
        },

        openapi: {
          responses: {
            204: {
              schema: {
                type: "object",
              },
            },
          },
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

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([
      {
        code: "OPENAPI_RESPONSE_BODYLESS_CONTENT_CONFLICT",

        method: "DELETE",

        path: "/items/:id",

        status: 204,

        location: "responses.204",

        message:
          "OpenAPI response metadata for DELETE /items/:id status 204 declares content for a runtime bodyless response.",
      },
    ]);

    expect(result.paths["/items/{id}"]?.delete?.responses["204"]).toEqual({
      description: "HTTP 204 response",
    });
  });

  test("rejects response media types that contradict deterministic runtime serialization", () => {
    const app = new Gelis();

    app.get(
      "/items",

      {
        responses: {
          200: {
            schema: createSchema(),

            serialize: "json",
          },
        },

        openapi: {
          responses: {
            200: {
              opaque: true,

              mediaType: "text/plain",
            },
          },
        },
      },

      () => new Response(),
    );

    let outputCalls = 0;

    const resolver: SchemaResolver = {
      resolveOutput() {
        outputCalls += 1;

        throw new Error("must not run");
      },
    };

    const result = projectPaths(
      inspectContract(app),

      resolver,
    );

    expect(outputCalls).toBe(0);

    expect(result.issues).toEqual([
      {
        code: "OPENAPI_RESPONSE_MEDIA_TYPE_CONFLICT",

        method: "GET",

        path: "/items",

        status: 200,

        location: "responses.200",

        message:
          'OpenAPI response media type "text/plain" contradicts runtime media type "application/json" for GET /items status 200.',
      },
    ]);

    expect(result.paths["/items"]?.get?.responses["200"]).toEqual({
      description: "HTTP 200 response",

      content: {
        "application/json": {},
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

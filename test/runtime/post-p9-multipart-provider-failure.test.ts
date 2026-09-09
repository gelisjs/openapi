import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "gelis";

import type { StandardSchemaV1 } from "gelis";

import { projectPaths } from "../../src/path";

import type { InputSchemaResolver } from "../../src/schema-resolution";

describe("post-P9 multipart OpenAPI projection", () => {
  test("reports provider conversion failure without losing runtime multipart media", () => {
    const app = new Gelis();
    const schema = createValidationOnlySchema();
    const failure = new Error("multipart schema is not serializable");

    app.post(
      "/upload",
      {
        body: schema,
        bodyParser: "multipart",
        responses: {
          204: undefined,
        },
      },
      () => new Response(null, { status: 204 }),
    );

    const resolver: InputSchemaResolver = {
      resolveInput(input) {
        expect(input).toBe(schema);
        throw failure;
      },
    };

    const result = projectPaths(inspectContract(app), resolver);

    expect(result.issues).toEqual([
      {
        code: "OPENAPI_REQUEST_BODY_SCHEMA_RESOLUTION_FAILED",
        method: "POST",
        path: "/upload",
        location: "request.body",
        message:
          "Failed to resolve the request body schema for POST /upload.",
        cause: failure,
      },
    ]);

    expect(result.paths["/upload"]?.post?.requestBody).toEqual({
      required: true,
      content: {
        "multipart/form-data": {},
      },
    });
  });
});

function createValidationOnlySchema(): StandardSchemaV1<
  Record<string, unknown>,
  Record<string, unknown>
> {
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

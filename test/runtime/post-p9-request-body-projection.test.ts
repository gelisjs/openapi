import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "gelis";

import type { StandardSchemaV1 } from "gelis";

import { projectPaths } from "../../src/path";

import type { InputSchemaResolver } from "../../src/schema-resolution";

import { OPENAPI_VERSION_3_2 } from "../../src/types";

describe("post-P9 OpenAPI request body projection", () => {
  test("projects every built-in parser default and keeps arrayBuffer opaque by default", () => {
    const app = new Gelis();
    const schema = createSchema();

    app.post(
      "/json",
      {
        body: schema,
        responses: { 204: undefined },
      },
      () => new Response(null, { status: 204 }),
    );

    app.post(
      "/text",
      {
        body: schema,
        bodyParser: "text",
        responses: { 204: undefined },
      },
      () => new Response(null, { status: 204 }),
    );

    app.post(
      "/urlencoded",
      {
        body: schema,
        bodyParser: "urlencoded",
        responses: { 204: undefined },
      },
      () => new Response(null, { status: 204 }),
    );

    app.post(
      "/multipart",
      {
        body: schema,
        bodyParser: "multipart",
        responses: { 204: undefined },
      },
      () => new Response(null, { status: 204 }),
    );

    app.post(
      "/binary",
      {
        body: schema,
        bodyParser: "arrayBuffer",
        responses: { 204: undefined },
      },
      () => new Response(null, { status: 204 }),
    );

    let resolverCalls = 0;

    const resolver: InputSchemaResolver = {
      resolveInput(input) {
        resolverCalls += 1;
        expect(input).toBe(schema);

        return {
          type: "object",
          properties: {
            value: {
              type: "string",
            },
          },
        };
      },
    };

    const result = projectPaths(inspectContract(app), resolver);

    expect(result.issues).toEqual([]);
    expect(resolverCalls).toBe(4);

    expect(
      Object.keys(result.paths["/json"]?.post?.requestBody?.content ?? {}),
    ).toEqual(["application/json"]);
    expect(
      Object.keys(result.paths["/text"]?.post?.requestBody?.content ?? {}),
    ).toEqual(["text/plain"]);
    expect(
      Object.keys(
        result.paths["/urlencoded"]?.post?.requestBody?.content ?? {},
      ),
    ).toEqual(["application/x-www-form-urlencoded"]);
    expect(
      Object.keys(
        result.paths["/multipart"]?.post?.requestBody?.content ?? {},
      ),
    ).toEqual(["multipart/form-data"]);

    expect(result.paths["/binary"]?.post?.requestBody).toEqual({
      required: true,
      content: {
        "application/octet-stream": {},
      },
    });
  });

  test("uses explicit normalized runtime media keys, resolves once, and prepares fresh schema occurrences", () => {
    const app = new Gelis();
    const schema = createSchema();

    app.post(
      "/vendor-json",
      {
        body: schema,
        bodyParser: "json",
        bodyContentTypes: [
          "Application/Vnd.Example+JSON; charset=utf-8",
          "application/json",
          "application/vnd.example+json",
        ],
        responses: { 204: undefined },
      },
      () => new Response(null, { status: 204 }),
    );

    let resolverCalls = 0;

    const resolver: InputSchemaResolver = {
      resolveInput(input) {
        resolverCalls += 1;
        expect(input).toBe(schema);

        return {
          $defs: {
            payload: {
              type: "object",
            },
          },
          $ref: "#/$defs/payload",
        };
      },
    };

    const result = projectPaths(inspectContract(app), resolver);

    expect(result.issues).toEqual([]);
    expect(resolverCalls).toBe(1);

    const content = result.paths["/vendor-json"]?.post?.requestBody?.content;

    expect(Object.keys(content ?? {})).toEqual([
      "application/vnd.example+json",
      "application/json",
    ]);

    const vendorSchema = content?.["application/vnd.example+json"]?.schema;
    const jsonSchema = content?.["application/json"]?.schema;

    expect(vendorSchema).toEqual({
      $defs: {
        payload: {
          type: "object",
        },
      },
      $ref: "#/$defs/payload",
      $id:
        "https://schemas.gelis.invalid/openapi/post/%2Fvendor-json/request/body/application%2Fvnd.example%2Bjson",
    });

    expect(jsonSchema).toEqual({
      $defs: {
        payload: {
          type: "object",
        },
      },
      $ref: "#/$defs/payload",
      $id:
        "https://schemas.gelis.invalid/openapi/post/%2Fvendor-json/request/body/application%2Fjson",
    });

    expect(vendorSchema).not.toBe(jsonSchema);
  });

  test("keeps parser grammar independent from custom media aliases", () => {
    const app = new Gelis();
    const schema = createSchema<string>();

    app.post(
      "/custom-text",
      {
        body: schema,
        bodyParser: "text",
        bodyContentTypes: ["application/vnd.gelis.text"],
        responses: { 204: undefined },
      },
      () => new Response(null, { status: 204 }),
    );

    const contract = inspectContract(app).routes[0];

    expect(contract?.bodyParser).toBe("text");
    expect(contract?.bodyContentTypes).toEqual([
      "application/vnd.gelis.text",
    ]);

    const result = projectPaths(inspectContract(app), {
      resolveInput(input) {
        expect(input).toBe(schema);
        return { type: "string" };
      },
    });

    expect(result.issues).toEqual([]);
    expect(result.paths["/custom-text"]?.post?.requestBody).toEqual({
      required: true,
      content: {
        "application/vnd.gelis.text": {
          schema: {
            type: "string",
          },
        },
      },
    });
  });

  test("enforces managed required and media metadata as consistency assertions", () => {
    const requiredConflictApp = new Gelis();

    requiredConflictApp.post(
      "/required",
      {
        body: createSchema(),
        openapi: {
          request: {
            body: {
              required: false,
            },
          },
        },
      },
      () => "created",
    );

    const requiredConflict = projectPaths(
      inspectContract(requiredConflictApp),
      createObjectResolver(),
    );

    expect(requiredConflict.issues).toEqual([
      {
        code: "OPENAPI_REQUEST_BODY_REQUIRED_CONFLICT",
        method: "POST",
        path: "/required",
        location: "request.body",
        message:
          "OpenAPI request body metadata marks the managed body for POST /required as optional, but the Gelis runtime body contract is required.",
      },
    ]);
    expect(requiredConflict.paths["/required"]?.post?.requestBody?.required).toBe(
      true,
    );

    const matchingApp = new Gelis();

    matchingApp.post(
      "/matching",
      {
        body: createSchema<string>(),
        bodyParser: "text",
        openapi: {
          request: {
            body: {
              mediaType: "Text/Plain; charset=utf-8",
            },
          },
        },
      },
      () => "created",
    );

    const matching = projectPaths(inspectContract(matchingApp), {
      resolveInput() {
        return { type: "string" };
      },
    });

    expect(matching.issues).toEqual([]);
    expect(
      Object.keys(matching.paths["/matching"]?.post?.requestBody?.content ?? {}),
    ).toEqual(["text/plain"]);

    const multipleMediaApp = new Gelis();

    multipleMediaApp.post(
      "/multiple",
      {
        body: createSchema(),
        bodyContentTypes: [
          "application/json",
          "application/vnd.gelis+json",
        ],
        openapi: {
          request: {
            body: {
              mediaType: "application/json",
            },
          },
        },
      },
      () => "created",
    );

    const multipleMedia = projectPaths(
      inspectContract(multipleMediaApp),
      createObjectResolver(),
    );

    expect(multipleMedia.issues).toEqual([
      {
        code: "OPENAPI_REQUEST_BODY_MEDIA_TYPE_CONFLICT",
        method: "POST",
        path: "/multiple",
        location: "request.body",
        message:
          'OpenAPI request body media type "application/json" cannot replace the 2 runtime media types accepted by POST /multiple.',
      },
    ]);
  });

  test("preserves documentation-only body behavior and managed schema/opaque precedence", () => {
    const documentationOnlyApp = new Gelis();

    documentationOnlyApp.post(
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

    const documentationOnly = projectPaths(inspectContract(documentationOnlyApp));

    expect(documentationOnly.issues).toEqual([]);
    expect(documentationOnly.paths["/import"]?.post?.requestBody).toEqual({
      description: "CSV import.",
      required: false,
      content: {
        "text/csv": {},
      },
    });

    const explicitSchemaApp = new Gelis();

    explicitSchemaApp.post(
      "/binary",
      {
        body: createSchema<ArrayBuffer>(),
        bodyParser: "arrayBuffer",
        openapi: {
          request: {
            body: {
              schema: {
                type: "string",
                format: "binary",
              },
            },
          },
        },
      },
      () => "accepted",
    );

    let explicitResolverCalls = 0;

    const explicitSchema = projectPaths(inspectContract(explicitSchemaApp), {
      resolveInput() {
        explicitResolverCalls += 1;
        throw new Error("arrayBuffer explicit schema must bypass conversion");
      },
    });

    expect(explicitResolverCalls).toBe(0);
    expect(explicitSchema.issues).toEqual([]);
    expect(explicitSchema.paths["/binary"]?.post?.requestBody).toEqual({
      required: true,
      content: {
        "application/octet-stream": {
          schema: {
            type: "string",
            format: "binary",
          },
        },
      },
    });

    const opaqueApp = new Gelis();

    opaqueApp.post(
      "/opaque",
      {
        body: createSchema(),
        bodyParser: "multipart",
        bodyContentTypes: [
          "multipart/form-data",
          "application/vnd.gelis.multipart",
        ],
        openapi: {
          request: {
            body: {
              opaque: true,
            },
          },
        },
      },
      () => "accepted",
    );

    let opaqueResolverCalls = 0;

    const opaque = projectPaths(inspectContract(opaqueApp), {
      resolveInput() {
        opaqueResolverCalls += 1;
        throw new Error("opaque body must bypass conversion");
      },
    });

    expect(opaqueResolverCalls).toBe(0);
    expect(opaque.issues).toEqual([]);
    expect(opaque.paths["/opaque"]?.post?.requestBody).toEqual({
      required: true,
      content: {
        "multipart/form-data": {},
        "application/vnd.gelis.multipart": {},
      },
    });
  });

  test("keeps request-body semantics equal between OpenAPI 3.1.2 and 3.2.0", () => {
    const app = new Gelis();

    app.post(
      "/body",
      {
        body: createSchema(),
        bodyParser: "urlencoded",
        bodyContentTypes: [
          "application/x-www-form-urlencoded",
          "application/vnd.gelis.form",
        ],
        responses: { 204: undefined },
      },
      () => new Response(null, { status: 204 }),
    );

    const compatibility = projectPaths(
      inspectContract(app),
      createObjectResolver(),
    );
    const fullFidelity = projectPaths(
      inspectContract(app),
      OPENAPI_VERSION_3_2,
      createObjectResolver(),
    );

    expect(compatibility.issues).toEqual([]);
    expect(fullFidelity.issues).toEqual([]);
    expect(compatibility.paths["/body"]?.post?.requestBody).toEqual(
      fullFidelity.paths["/body"]?.post?.requestBody,
    );
  });
});

function createObjectResolver(): InputSchemaResolver {
  return {
    resolveInput() {
      return {
        type: "object",
      };
    },
  };
}

function createSchema<Output = Record<string, unknown>>(): StandardSchemaV1<
  Output,
  Output
> {
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

import { describe, expect, test } from "bun:test";

import { type } from "arktype";
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import * as z from "zod";

import { Gelis, inspectContract } from "gelis";

import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from "gelis";

import { projectPaths } from "../../src/path";
import { OPENAPI_VERSION_3_2 } from "../../src/types";

type PortableObjectSchema = StandardSchemaV1<
  unknown,
  Record<string, unknown>
> &
  StandardJSONSchemaV1<unknown, Record<string, unknown>>;

type PortableStringSchema = StandardSchemaV1<unknown, string> &
  StandardJSONSchemaV1<unknown, string>;

interface ProviderFixture {
  readonly name: string;
  readonly objectSchema: PortableObjectSchema;
  readonly stringSchema: PortableStringSchema;
}

const providers: readonly ProviderFixture[] = [
  {
    name: "Zod",
    objectSchema: z.object({
      name: z.string(),
      count: z.number().optional(),
    }),
    stringSchema: z.string(),
  },
  {
    name: "ArkType",
    objectSchema: type({
      name: "string",
      "count?": "number",
    }),
    stringSchema: type("string"),
  },
  {
    name: "Valibot",
    objectSchema: toStandardJsonSchema(
      v.object({
        name: v.string(),
        count: v.optional(v.number()),
      }),
    ),
    stringSchema: toStandardJsonSchema(v.string()),
  },
];

describe("P10-E post-P9 provider compatibility", () => {
  for (const provider of providers) {
    test(`${provider.name} projects the post-P9 managed body/query/response matrix`, () => {
      assertStandardCapabilities(provider.objectSchema);
      assertStandardCapabilities(provider.stringSchema);

      const app = createProviderApplication(provider);
      const contract = inspectContract(app);

      const compatibility = projectPaths(contract);
      const fullFidelity = projectPaths(contract, OPENAPI_VERSION_3_2);

      expect(compatibility.issues).toEqual([]);
      expect(fullFidelity.issues).toEqual([]);

      /*
       * These routes use only ordinary HTTP methods. Output-version
       * selection must therefore not change provider-derived schema
       * semantics or media projection.
       */
      expect(fullFidelity.paths).toEqual(compatibility.paths);

      const base = `/${provider.name.toLowerCase()}`;

      const queryParameters = compatibility.paths[`${base}/search`]?.get?.parameters;
      expect(queryParameters?.some((parameter) => parameter.name === "name")).toBe(
        true,
      );

      const queryName = queryParameters?.find(
        (parameter) => parameter.name === "name",
      );
      assertStringSchema(queryName?.schema);

      const queryResponse =
        compatibility.paths[`${base}/search`]?.get?.responses["200"]?.content?.[
          "application/json"
        ]?.schema;
      assertObjectStringProperty(queryResponse, "name");

      const jsonContent =
        compatibility.paths[`${base}/json`]?.post?.requestBody?.content;

      expect(Object.keys(jsonContent ?? {})).toEqual([
        "application/json",
        "application/vnd.gelis+json",
      ]);

      const canonicalJSON = jsonContent?.["application/json"]?.schema;
      const vendorJSON = jsonContent?.["application/vnd.gelis+json"]?.schema;

      assertObjectStringProperty(canonicalJSON, "name");
      assertObjectStringProperty(vendorJSON, "name");
      expect(canonicalJSON).not.toBe(vendorJSON);

      const jsonResponse =
        compatibility.paths[`${base}/json`]?.post?.responses["200"]?.content?.[
          "application/json"
        ]?.schema;
      assertObjectStringProperty(jsonResponse, "name");

      const textBody =
        compatibility.paths[`${base}/text`]?.post?.requestBody?.content[
          "text/plain"
        ]?.schema;
      assertStringSchema(textBody);

      const urlencodedBody =
        compatibility.paths[`${base}/urlencoded`]?.post?.requestBody?.content[
          "application/x-www-form-urlencoded"
        ]?.schema;
      assertObjectStringProperty(urlencodedBody, "name");

      const multipartBody =
        compatibility.paths[`${base}/multipart`]?.post?.requestBody?.content[
          "multipart/form-data"
        ]?.schema;
      assertObjectStringProperty(multipartBody, "name");
    });
  }
});

function createProviderApplication(provider: ProviderFixture): Gelis {
  const app = new Gelis();
  const base: `/${string}` = `/${provider.name.toLowerCase()}`;
  const searchPath: `/${string}` = `${base}/search`;
  const jsonPath: `/${string}` = `${base}/json`;
  const textPath: `/${string}` = `${base}/text`;
  const urlencodedPath: `/${string}` = `${base}/urlencoded`;
  const multipartPath: `/${string}` = `${base}/multipart`;

  app.get(
    searchPath,
    {
      query: provider.objectSchema,
      responses: {
        200: {
          schema: provider.objectSchema,
          serialize: "json",
        },
      },
    },
    () => new Response(),
  );

  app.post(
    jsonPath,
    {
      body: provider.objectSchema,
      bodyContentTypes: [
        "application/json",
        "application/vnd.gelis+json",
      ],
      responses: {
        200: {
          schema: provider.objectSchema,
          serialize: "json",
        },
      },
    },
    () => new Response(),
  );

  app.post(
    textPath,
    {
      body: provider.stringSchema,
      bodyParser: "text",
      responses: {
        204: undefined,
      },
    },
    () => new Response(null, { status: 204 }),
  );

  app.post(
    urlencodedPath,
    {
      body: provider.objectSchema,
      bodyParser: "urlencoded",
      responses: {
        204: undefined,
      },
    },
    () => new Response(null, { status: 204 }),
  );

  app.post(
    multipartPath,
    {
      body: provider.objectSchema,
      bodyParser: "multipart",
      responses: {
        204: undefined,
      },
    },
    () => new Response(null, { status: 204 }),
  );

  return app;
}

function assertStandardCapabilities<Input, Output>(
  schema: StandardSchemaV1<Input, Output> &
    StandardJSONSchemaV1<Input, Output>,
): void {
  expect(typeof schema["~standard"].validate).toBe("function");
  expect(typeof schema["~standard"].jsonSchema.input).toBe("function");
  expect(typeof schema["~standard"].jsonSchema.output).toBe("function");
}

function assertObjectStringProperty(
  schema: unknown,
  propertyName: string,
): void {
  expect(isRecord(schema)).toBe(true);

  if (!isRecord(schema)) {
    throw new Error("Expected a JSON Schema object.");
  }

  expect(schema.type).toBe("object");

  const properties = schema.properties;
  expect(isRecord(properties)).toBe(true);

  if (!isRecord(properties)) {
    throw new Error("Expected JSON Schema object properties.");
  }

  assertStringSchema(properties[propertyName]);
}

function assertStringSchema(schema: unknown): void {
  expect(isRecord(schema)).toBe(true);

  if (!isRecord(schema)) {
    throw new Error("Expected a JSON Schema object.");
  }

  expect(schema.type).toBe("string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

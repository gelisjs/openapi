import { OPENAPI_JSON_SCHEMA_DIALECT, OPENAPI_VERSION, OpenAPIGenerationError } from "../../src";

import type { OpenAPIDocument, OpenAPIGenerationIssue, OpenAPIGenerationOptions, OpenAPIHttpMethod } from "../../src";

import type { Equal, Expect } from "./assert";

type _Version = Expect<Equal<typeof OPENAPI_VERSION, "3.1.2">>;

type _Dialect = Expect<Equal<typeof OPENAPI_JSON_SCHEMA_DIALECT, "https://json-schema.org/draft/2020-12/schema">>;

type _DocumentVersion = Expect<Equal<OpenAPIDocument["openapi"], "3.1.2">>;

type _DocumentDialect = Expect<
  Equal<OpenAPIDocument["jsonSchemaDialect"], "https://json-schema.org/draft/2020-12/schema">
>;

type _Method = Expect<Equal<OpenAPIHttpMethod, "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD">>;

const minimalOptions: OpenAPIGenerationOptions = {
  info: {
    title: "Gelis API",

    version: "1.0.0",
  },
};

const fullIssue: OpenAPIGenerationIssue = {
  code: "TEST",

  method: "POST",

  path: "/users",

  location: "responses.default",

  status: "default",

  message: "Test issue.",

  cause: new Error(),
};

const error = new OpenAPIGenerationError([fullIssue]);

type _ErrorIssues = Expect<Equal<typeof error.issues, readonly OpenAPIGenerationIssue[]>>;

const missingVersion: OpenAPIGenerationOptions = {
  // @ts-expect-error version is required
  info: {
    title: "Missing version",
  },
};

type PublicAPI = typeof import("../../src/index");

type _NoInternalRootBuilder = Expect<Equal<"createOpenAPIRoot" extends keyof PublicAPI ? true : false, false>>;

void minimalOptions;
void missingVersion;

import { Gelis } from "gelis";

import {
  generateOpenAPI,
  OPENAPI_JSON_SCHEMA_DIALECT,
  OPENAPI_VERSION,
  OPENAPI_VERSION_3_2,
  OpenAPIGenerationError,
} from "../../src";

import type {
  OpenAPIDocument,
  OpenAPIGenerationIssue,
  OpenAPIGenerationOptions,
  OpenAPIHttpMethod,
  OpenAPIVersion,
} from "../../src";

import type { Equal, Expect } from "./assert";

type _DefaultVersion = Expect<Equal<typeof OPENAPI_VERSION, "3.1.2">>;

type _Version32 = Expect<Equal<typeof OPENAPI_VERSION_3_2, "3.2.0">>;

type _VersionUnion = Expect<Equal<OpenAPIVersion, "3.1.2" | "3.2.0">>;

type _Dialect = Expect<
  Equal<
    typeof OPENAPI_JSON_SCHEMA_DIALECT,
    "https://json-schema.org/draft/2020-12/schema"
  >
>;

type _DocumentVersion = Expect<
  Equal<OpenAPIDocument["openapi"], OpenAPIVersion>
>;

type _DocumentDialect = Expect<
  Equal<
    OpenAPIDocument["jsonSchemaDialect"],
    "https://json-schema.org/draft/2020-12/schema"
  >
>;

type _Method = Expect<Equal<OpenAPIHttpMethod, string>>;

const minimalOptions: OpenAPIGenerationOptions = {
  info: {
    title: "Gelis API",

    version: "1.0.0",
  },
};

const version32Options: OpenAPIGenerationOptions = {
  version: "3.2.0",

  info: {
    title: "Gelis API",

    version: "1.0.0",
  },
};

const app = new Gelis();

const generated = generateOpenAPI(app, minimalOptions);

type _GeneratedDocument = Expect<Equal<typeof generated, OpenAPIDocument>>;

const fullIssue: OpenAPIGenerationIssue = {
  code: "TEST",

  method: "PURGE",

  path: "/users",

  location: "responses.default",

  status: "default",

  message: "Test issue.",

  cause: new Error(),
};

const error = new OpenAPIGenerationError([fullIssue]);

type _ErrorIssues = Expect<
  Equal<typeof error.issues, readonly OpenAPIGenerationIssue[]>
>;

const missingVersion: OpenAPIGenerationOptions = {
  // @ts-expect-error info.version is required
  info: {
    title: "Missing version",
  },
};

const invalidOpenAPIVersion: OpenAPIGenerationOptions = {
  // @ts-expect-error unsupported OpenAPI output version
  version: "3.0.3",

  info: {
    title: "Invalid OpenAPI version",

    version: "1.0.0",
  },
};

// @ts-expect-error options are required
generateOpenAPI(app);

type PublicAPI = typeof import("../../src/index");

type _HasGenerator = Expect<
  Equal<"generateOpenAPI" extends keyof PublicAPI ? true : false, true>
>;

type _HasVersion32 = Expect<
  Equal<"OPENAPI_VERSION_3_2" extends keyof PublicAPI ? true : false, true>
>;

type _NoInternalRootBuilder = Expect<
  Equal<"createOpenAPIRoot" extends keyof PublicAPI ? true : false, false>
>;

void minimalOptions;
void version32Options;
void generated;
void missingVersion;
void invalidOpenAPIVersion;

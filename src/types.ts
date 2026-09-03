export const OPENAPI_VERSION = "3.1.2" as const;

export const OPENAPI_JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema" as const;

export interface OpenAPIInfoObject {
  title: string;

  version: string;

  description?: string;
}

export interface OpenAPIServerObject {
  url: string;

  description?: string;
}

export interface OpenAPITagObject {
  name: string;

  description?: string;
}

/*
 * B10 owns only the OpenAPI root.
 *
 * PathItem/Operation structure is intentionally
 * introduced by the route-projection milestones
 * beginning in B11.
 */
export interface OpenAPIDocument {
  openapi: typeof OPENAPI_VERSION;

  jsonSchemaDialect: typeof OPENAPI_JSON_SCHEMA_DIALECT;

  info: OpenAPIInfoObject;

  paths: Record<string, object>;

  servers?: OpenAPIServerObject[];

  tags?: OpenAPITagObject[];
}

export interface OpenAPIGenerationOptions {
  readonly info: Readonly<OpenAPIInfoObject>;

  readonly servers?: readonly Readonly<OpenAPIServerObject>[];

  readonly tags?: readonly Readonly<OpenAPITagObject>[];
}

export type OpenAPIHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

export interface OpenAPIGenerationIssue {
  readonly code: string;

  readonly message: string;

  readonly location: string;

  readonly method?: OpenAPIHttpMethod;

  readonly path?: string;

  readonly status?: number | "default";

  readonly cause?: unknown;
}

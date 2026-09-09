export const OPENAPI_VERSION = "3.1.2" as const;

export const OPENAPI_VERSION_3_2 = "3.2.0" as const;

export type OpenAPIVersion =
  | typeof OPENAPI_VERSION
  | typeof OPENAPI_VERSION_3_2;

export const OPENAPI_JSON_SCHEMA_DIALECT =
  "https://json-schema.org/draft/2020-12/schema" as const;

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

export interface OpenAPIDocument {
  openapi: OpenAPIVersion;

  jsonSchemaDialect: typeof OPENAPI_JSON_SCHEMA_DIALECT;

  info: OpenAPIInfoObject;

  paths: Record<string, object>;

  servers?: OpenAPIServerObject[];

  tags?: OpenAPITagObject[];
}

export interface OpenAPIGenerationOptions {
  readonly info: Readonly<OpenAPIInfoObject>;

  /**
   * OpenAPI 3.1.2 remains the compatibility default.
   *
   * OpenAPI 3.2.0 provides native QUERY and additional-operation
   * representation for the post-P9 Gelis method surface.
   */
  readonly version?: OpenAPIVersion;

  readonly servers?: readonly Readonly<OpenAPIServerObject>[];

  readonly tags?: readonly Readonly<OpenAPITagObject>[];
}

/*
 * Generation issues preserve the actual Gelis method identity.
 *
 * Generic route() accepts valid custom HTTP method tokens, so this
 * can no longer truthfully be restricted to the seven historical
 * OpenAPI Path Item method fields.
 */
export type OpenAPIHttpMethod = string;

export interface OpenAPIGenerationIssue {
  readonly code: string;

  readonly message: string;

  readonly location: string;

  readonly method?: OpenAPIHttpMethod;

  readonly path?: string;

  readonly status?: number | "default";

  readonly cause?: unknown;
}

import type { ContractRouteSnapshot, OpenAPIJSONSchema, OpenAPIRequestBodyMetadata } from "gelis";

import type { InputSchemaResolver, ResolvedJSONSchema } from "./schema-resolution";

import type { OpenAPIGenerationIssue } from "./types";

import { prepareSchemaOccurrence, schemaResourceIssueCode, schemaResourceIssueDetail } from "./schema-occurrence";

export interface ProjectedMediaTypeObject {
  schema?: ResolvedJSONSchema;
}

export interface ProjectedRequestBodyObject {
  description?: string;

  required?: boolean;

  content: Record<string, ProjectedMediaTypeObject>;
}

export interface RequestBodyProjectionResult {
  readonly requestBody: ProjectedRequestBodyObject | undefined;

  readonly issues: OpenAPIGenerationIssue[];
}

export function projectRequestBody(
  route: ContractRouteSnapshot,

  resolver: InputSchemaResolver | undefined,
): RequestBodyProjectionResult {
  const body = route.body;

  const metadata = getRequestBodyMetadata(route);

  if (body === undefined && metadata === undefined) {
    return {
      requestBody: undefined,

      issues: [],
    };
  }

  const mediaType = metadata?.mediaType ?? "application/json";

  /*
   * A runtime Gelis body contract parses JSON.
   * Metadata may select application/json or a
   * concrete application/*+json media type, but
   * must not document a runtime contract as text,
   * multipart, etc.
   *
   * Documentation-only bodies have no such
   * restriction.
   */
  if (body !== undefined && metadata?.mediaType !== undefined && !isRuntimeJSONMediaType(metadata.mediaType)) {
    return {
      requestBody: undefined,

      issues: [
        createRequestBodyIssue(
          route,

          "OPENAPI_REQUEST_BODY_MEDIA_TYPE_CONFLICT",

          `OpenAPI request body media type "${metadata.mediaType}" contradicts the JSON runtime body contract for ${route.method} ${route.path}.`,
        ),
      ],
    };
  }

  let preparedSchema: ResolvedJSONSchema | undefined;

  /*
   * Precedence:
   *
   * opaque
   *   > explicit OpenAPI schema
   *   > Standard JSON Schema conversion
   */
  if (metadata?.opaque !== true) {
    if (metadata?.schema !== undefined) {
      try {
        preparedSchema = prepareSchemaOccurrence(
          route,

          {
            kind: "body",
          },

          cloneOpenAPIJSONSchema(metadata.schema),
        );
      } catch (cause) {
        return {
          requestBody: undefined,

          issues: [
            createRequestBodyIssue(
              route,

              schemaResourceIssueCode(cause),

              `Failed to prepare the OpenAPI request body schema override for ${route.method} ${route.path}: ${schemaResourceIssueDetail(cause)}`,

              cause,
            ),
          ],
        };
      }
    } else if (body !== undefined) {
      if (resolver === undefined) {
        return {
          requestBody: undefined,

          issues: [
            createRequestBodyIssue(
              route,

              "OPENAPI_REQUEST_BODY_SCHEMA_RESOLVER_REQUIRED",

              "Automatic request body projection requires an input JSON Schema resolver.",
            ),
          ],
        };
      }

      let schema: ResolvedJSONSchema;

      try {
        schema = resolver.resolveInput(body);
      } catch (cause) {
        return {
          requestBody: undefined,

          issues: [
            createRequestBodyIssue(
              route,

              "OPENAPI_REQUEST_BODY_SCHEMA_RESOLUTION_FAILED",

              `Failed to resolve the request body schema for ${route.method} ${route.path}.`,

              cause,
            ),
          ],
        };
      }

      try {
        preparedSchema = prepareSchemaOccurrence(
          route,

          {
            kind: "body",
          },

          schema,
        );
      } catch (cause) {
        return {
          requestBody: undefined,

          issues: [
            createRequestBodyIssue(
              route,

              schemaResourceIssueCode(cause),

              `Failed to prepare the request body schema for ${route.method} ${route.path}: ${schemaResourceIssueDetail(cause)}`,

              cause,
            ),
          ],
        };
      }
    }
  }

  const media: ProjectedMediaTypeObject =
    preparedSchema === undefined
      ? {}
      : {
          schema: preparedSchema,
        };

  const requestBody: ProjectedRequestBodyObject = {
    content: {
      [mediaType]: media,
    },
  };

  if (metadata?.description !== undefined) {
    requestBody.description = metadata.description;
  }

  if (metadata?.required !== undefined) {
    requestBody.required = metadata.required;
  } else if (body !== undefined) {
    requestBody.required = true;
  }

  return {
    requestBody,

    issues: [],
  };
}

function getRequestBodyMetadata(route: ContractRouteSnapshot): OpenAPIRequestBodyMetadata | undefined {
  const openapi = route.openapi;

  if (openapi === undefined || openapi === false) {
    return undefined;
  }

  return openapi.request?.body;
}

function cloneOpenAPIJSONSchema(schema: OpenAPIJSONSchema): ResolvedJSONSchema {
  if (typeof schema === "boolean") {
    return schema;
  }

  const cloned = structuredClone(schema);

  if (!isRecord(cloned)) {
    throw new TypeError("OpenAPI request body schema override must be a JSON Schema object or boolean schema.");
  }

  return cloned;
}

function isRuntimeJSONMediaType(value: string): boolean {
  const separator = value.indexOf(";");

  const mediaType = (separator === -1 ? value : value.slice(0, separator)).trim().toLowerCase();

  return mediaType === "application/json" || (mediaType.startsWith("application/") && mediaType.endsWith("+json"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createRequestBodyIssue(
  route: ContractRouteSnapshot,

  code: string,

  message: string,

  cause?: unknown,
): OpenAPIGenerationIssue {
  return {
    code,

    method: route.method,

    path: route.path,

    location: "request.body",

    message,

    ...(cause === undefined
      ? {}
      : {
          cause,
        }),
  };
}

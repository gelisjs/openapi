import type {
  ContractRouteSnapshot,
  OpenAPIJSONSchema,
  OpenAPIRequestBodyMetadata,
} from "gelis";

import type {
  InputSchemaResolver,
  ResolvedJSONSchema,
} from "./schema-resolution";

import type { OpenAPIGenerationIssue } from "./types";

import {
  prepareSchemaOccurrence,
  schemaResourceIssueCode,
  schemaResourceIssueDetail,
} from "./schema-occurrence";

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
  const metadata = getRequestBodyMetadata(route);

  if (route.body === undefined) {
    return projectDocumentationOnlyBody(route, metadata);
  }

  return projectManagedBody(route, metadata, resolver);
}

function projectManagedBody(
  route: ContractRouteSnapshot,

  metadata: OpenAPIRequestBodyMetadata | undefined,

  resolver: InputSchemaResolver | undefined,
): RequestBodyProjectionResult {
  const body = route.body;

  if (body === undefined) {
    throw new TypeError("Managed request body projection requires a body schema");
  }

  const parser = route.bodyParser ?? "json";
  const mediaTypes = managedMediaTypes(route, parser);
  const issues: OpenAPIGenerationIssue[] = [];

  if (metadata?.required === false) {
    issues.push(
      createRequestBodyIssue(
        route,
        "OPENAPI_REQUEST_BODY_REQUIRED_CONFLICT",
        `OpenAPI request body metadata marks the managed body for ${route.method} ${route.path} as optional, but the Gelis runtime body contract is required.`,
      ),
    );
  }

  if (metadata?.mediaType !== undefined) {
    if (
      mediaTypes.length !== 1 ||
      normalizeMediaType(metadata.mediaType) !==
        normalizeMediaType(mediaTypes[0]!)
    ) {
      issues.push(
        createRequestBodyIssue(
          route,
          "OPENAPI_REQUEST_BODY_MEDIA_TYPE_CONFLICT",
          mediaTypes.length === 1
            ? `OpenAPI request body media type "${metadata.mediaType}" contradicts runtime media type "${mediaTypes[0]}" for ${route.method} ${route.path}.`
            : `OpenAPI request body media type "${metadata.mediaType}" cannot replace the ${mediaTypes.length} runtime media types accepted by ${route.method} ${route.path}.`,
        ),
      );
    }
  }

  const content: Record<string, ProjectedMediaTypeObject> = {};

  let resolvedAutomaticSchema: ResolvedJSONSchema | undefined;

  if (
    metadata?.opaque !== true &&
    metadata?.schema === undefined &&
    parser !== "arrayBuffer"
  ) {
    if (resolver === undefined) {
      issues.push(
        createRequestBodyIssue(
          route,
          "OPENAPI_REQUEST_BODY_SCHEMA_RESOLVER_REQUIRED",
          "Automatic request body projection requires an input JSON Schema resolver.",
        ),
      );
    } else {
      try {
        resolvedAutomaticSchema = resolver.resolveInput(body);
      } catch (cause) {
        issues.push(
          createRequestBodyIssue(
            route,
            "OPENAPI_REQUEST_BODY_SCHEMA_RESOLUTION_FAILED",
            `Failed to resolve the request body schema for ${route.method} ${route.path}.`,
            cause,
          ),
        );
      }
    }
  }

  for (const mediaType of mediaTypes) {
    let preparedSchema: ResolvedJSONSchema | undefined;

    if (metadata?.opaque !== true) {
      const sourceSchema =
        metadata?.schema === undefined
          ? resolvedAutomaticSchema
          : cloneOpenAPIJSONSchema(metadata.schema);

      if (sourceSchema !== undefined) {
        try {
          preparedSchema = prepareSchemaOccurrence(
            route,
            mediaTypes.length === 1
              ? {
                  kind: "body",
                }
              : {
                  kind: "body",
                  mediaType,
                },
            sourceSchema,
          );
        } catch (cause) {
          issues.push(
            createRequestBodyIssue(
              route,
              schemaResourceIssueCode(cause),
              `Failed to prepare the OpenAPI request body schema for media type "${mediaType}" on ${route.method} ${route.path}: ${schemaResourceIssueDetail(cause)}`,
              cause,
            ),
          );
        }
      }
    }

    content[mediaType] =
      preparedSchema === undefined
        ? {}
        : {
            schema: preparedSchema,
          };
  }

  const requestBody: ProjectedRequestBodyObject = {
    required: true,
    content,
  };

  if (metadata?.description !== undefined) {
    requestBody.description = metadata.description;
  }

  return {
    requestBody,
    issues,
  };
}

function projectDocumentationOnlyBody(
  route: ContractRouteSnapshot,

  metadata: OpenAPIRequestBodyMetadata | undefined,
): RequestBodyProjectionResult {
  if (metadata === undefined) {
    return {
      requestBody: undefined,
      issues: [],
    };
  }

  const mediaType = metadata.mediaType ?? "application/json";
  let preparedSchema: ResolvedJSONSchema | undefined;

  if (metadata.opaque !== true && metadata.schema !== undefined) {
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
  }

  const requestBody: ProjectedRequestBodyObject = {
    content: {
      [mediaType]:
        preparedSchema === undefined
          ? {}
          : {
              schema: preparedSchema,
            },
    },
  };

  if (metadata.description !== undefined) {
    requestBody.description = metadata.description;
  }

  if (metadata.required !== undefined) {
    requestBody.required = metadata.required;
  }

  return {
    requestBody,
    issues: [],
  };
}

function managedMediaTypes(
  route: ContractRouteSnapshot,

  parser: NonNullable<ContractRouteSnapshot["bodyParser"]> | "json",
): readonly string[] {
  const explicit = route.bodyContentTypes;

  if (explicit !== undefined) {
    return explicit;
  }

  switch (parser) {
    case "json":
      return ["application/json"];

    case "text":
      return ["text/plain"];

    case "urlencoded":
      return ["application/x-www-form-urlencoded"];

    case "multipart":
      return ["multipart/form-data"];

    case "arrayBuffer":
      return ["application/octet-stream"];
  }
}

function getRequestBodyMetadata(
  route: ContractRouteSnapshot,
): OpenAPIRequestBodyMetadata | undefined {
  const openapi = route.openapi;

  if (openapi === undefined || openapi === false) {
    return undefined;
  }

  return openapi.request?.body;
}

function cloneOpenAPIJSONSchema(
  schema: OpenAPIJSONSchema,
): ResolvedJSONSchema {
  if (typeof schema === "boolean") {
    return schema;
  }

  const cloned = structuredClone(schema);

  if (!isRecord(cloned)) {
    throw new TypeError(
      "OpenAPI request body schema override must be a JSON Schema object or boolean schema.",
    );
  }

  return cloned;
}

function normalizeMediaType(value: string): string {
  const separator = value.indexOf(";");

  return (separator === -1 ? value : value.slice(0, separator))
    .trim()
    .toLowerCase();
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
    ...(cause === undefined ? {} : { cause }),
  };
}

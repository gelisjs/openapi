import type { ContractRouteSnapshot, ResponseContract, ResponseDescriptor, StandardSchemaV1 } from "gelis";

import type { OutputSchemaResolver, ResolvedJSONSchema } from "./schema-resolution";

import type { OpenAPIGenerationIssue } from "./types";

export interface ProjectedResponseMediaTypeObject {
  schema: ResolvedJSONSchema;
}

export interface ProjectedResponseObject {
  description: string;

  content?: Record<string, ProjectedResponseMediaTypeObject>;
}

export type ProjectedResponsesObject = Record<string, ProjectedResponseObject>;

export interface ResponseProjectionResult {
  readonly responses: ProjectedResponsesObject;

  readonly issues: OpenAPIGenerationIssue[];
}

const BODYLESS_STATUSES = new Set([204, 205, 304]);

export function projectResponses(
  route: ContractRouteSnapshot,

  resolver: OutputSchemaResolver | undefined,
): ResponseProjectionResult {
  const declared = route.responses;

  /*
   * Handler return inference is intentionally not
   * available through the runtime contract source.
   *
   * Never guess 200 here. An implicit route is an
   * opaque default response.
   */
  if (declared === undefined) {
    return {
      responses: {
        default: {
          description: "Undocumented response",
        },
      },

      issues: [],
    };
  }

  const responses: ProjectedResponsesObject = {};

  const issues: OpenAPIGenerationIssue[] = [];

  const statuses = Object.keys(declared).map(Number).sort(compareNumbers);

  if (statuses.length === 0) {
    issues.push({
      code: "OPENAPI_RESPONSE_CONTRACT_EMPTY",

      method: route.method,

      path: route.path,

      location: "responses",

      message: `The explicit response contract for ${route.method} ${route.path} does not declare any statuses.`,
    });

    return {
      responses,
      issues,
    };
  }

  for (const status of statuses) {
    const entry = declared[status];

    const projection = projectResponse(route, status, entry, resolver);

    responses[String(status)] = projection.response;

    issues.push(...projection.issues);
  }

  return {
    responses,
    issues,
  };
}

function projectResponse(
  route: ContractRouteSnapshot,

  status: number,

  entry: ResponseContract,

  resolver: OutputSchemaResolver | undefined,
): {
  readonly response: ProjectedResponseObject;

  readonly issues: OpenAPIGenerationIssue[];
} {
  const response: ProjectedResponseObject = {
    description: `HTTP ${status} response`,
  };

  /*
   * Gelis explicitly treats 204, 205, and 304
   * as bodyless. An undefined response entry also
   * means there is no documented response body.
   */
  if (BODYLESS_STATUSES.has(status) || entry === undefined) {
    return {
      response,
      issues: [],
    };
  }

  const schema = responseSchema(entry);

  if (resolver === undefined) {
    return {
      response,

      issues: [
        createResponseIssue(
          route,
          status,

          "OPENAPI_RESPONSE_SCHEMA_RESOLVER_REQUIRED",

          `Automatic response projection for status ${status} requires an output JSON Schema resolver.`,
        ),
      ],
    };
  }

  let resolved: ResolvedJSONSchema;

  try {
    resolved = resolver.resolveOutput(schema);
  } catch (cause) {
    return {
      response,

      issues: [
        createResponseIssue(
          route,
          status,

          "OPENAPI_RESPONSE_SCHEMA_RESOLUTION_FAILED",

          `Failed to resolve the response schema for ${route.method} ${route.path} status ${status}.`,

          cause,
        ),
      ],
    };
  }

  const mediaType = responseMediaType(entry, resolved);

  if (mediaType === undefined) {
    return {
      response,

      issues: [
        createResponseIssue(
          route,
          status,

          "OPENAPI_RESPONSE_MEDIA_TYPE_AMBIGUOUS",

          `The response schema for ${route.method} ${route.path} status ${status} does not determine whether Gelis AUTO serialization emits text or JSON.`,
        ),
      ],
    };
  }

  response.content = {
    [mediaType]: {
      schema: resolved,
    },
  };

  return {
    response,
    issues: [],
  };
}

function responseSchema(entry: Exclude<ResponseContract, undefined>): StandardSchemaV1 {
  if (isStandardSchema(entry)) {
    return entry;
  }

  return entry.schema;
}

function responseMediaType(
  entry: Exclude<ResponseContract, undefined>,

  schema: ResolvedJSONSchema,
): string | undefined {
  if (!isStandardSchema(entry)) {
    const descriptor: ResponseDescriptor = entry;

    if (descriptor.serialize === "json") {
      return descriptor.contentType ?? "application/json";
    }

    if (descriptor.serialize === "text") {
      return descriptor.contentType ?? "text/plain";
    }
  }

  return classifyAutoMediaType(schema);
}

function classifyAutoMediaType(schema: ResolvedJSONSchema): string | undefined {
  if (typeof schema === "boolean") {
    return undefined;
  }

  const type = schema.type;

  if (type === "string") {
    return "text/plain";
  }

  if (isDefiniteJSONType(type)) {
    return "application/json";
  }

  if (!Array.isArray(type)) {
    return undefined;
  }

  let hasString = false;

  let hasJSON = false;

  for (const member of type) {
    if (member === "string") {
      hasString = true;

      continue;
    }

    if (isDefiniteJSONType(member)) {
      hasJSON = true;

      continue;
    }

    return undefined;
  }

  if (hasString && hasJSON) {
    return undefined;
  }

  if (hasString) {
    return "text/plain";
  }

  if (hasJSON) {
    return "application/json";
  }

  return undefined;
}

function isDefiniteJSONType(type: unknown): boolean {
  return (
    type === "object" ||
    type === "array" ||
    type === "number" ||
    type === "integer" ||
    type === "boolean" ||
    type === "null"
  );
}

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return typeof value === "object" && value !== null && "~standard" in value;
}

function createResponseIssue(
  route: ContractRouteSnapshot,

  status: number,

  code: string,

  message: string,

  cause?: unknown,
): OpenAPIGenerationIssue {
  return {
    code,

    method: route.method,

    path: route.path,

    status,

    location: `responses.${status}`,

    message,

    ...(cause === undefined
      ? {}
      : {
          cause,
        }),
  };
}

function compareNumbers(
  left: number,

  right: number,
): number {
  return left - right;
}

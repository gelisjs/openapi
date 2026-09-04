import type {
  ContractRouteSnapshot,
  OpenAPIJSONSchema,
  OpenAPIResponseMetadata,
  OpenAPIResponseMetadataMap,
  ResponseContract,
  ResponseDescriptor,
  StandardSchemaV1,
} from "gelis";

import type { OutputSchemaResolver, ResolvedJSONSchema } from "./schema-resolution";

import type { OpenAPIGenerationIssue } from "./types";

import { prepareSchemaOccurrence, schemaResourceIssueCode, schemaResourceIssueDetail } from "./schema-occurrence";

export interface ProjectedResponseMediaTypeObject {
  schema?: ResolvedJSONSchema;
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

type ResponseStatus = number | "default";

const BODYLESS_STATUSES = new Set([204, 205, 304]);

export function projectResponses(
  route: ContractRouteSnapshot,

  resolver: OutputSchemaResolver | undefined,
): ResponseProjectionResult {
  const declared = route.responses;

  const metadata = getResponseMetadata(route);

  const responses: ProjectedResponsesObject = {};

  const issues: OpenAPIGenerationIssue[] = [];

  if (declared !== undefined && Object.keys(declared).length === 0) {
    issues.push({
      code: "OPENAPI_RESPONSE_CONTRACT_EMPTY",

      method: route.method,

      path: route.path,

      location: "responses",

      message: `The explicit response contract for ${route.method} ${route.path} does not declare any statuses.`,
    });
  }

  const statuses = collectNumericStatuses(declared, metadata);

  for (const status of statuses) {
    const hasRuntimeContract = declared !== undefined && hasOwn(declared, String(status));

    const entry = hasRuntimeContract ? declared[status] : undefined;

    const patch = metadata?.[status];

    const projection = projectResponse(route, status, hasRuntimeContract, entry, patch, resolver);

    responses[String(status)] = projection.response;

    issues.push(...projection.issues);
  }

  /*
   * An implicit handler response always keeps an
   * opaque default response. Numeric documentation
   * additions must never turn that into an inferred
   * exhaustive runtime response contract.
   *
   * Explicit runtime contracts only gain a default
   * response when metadata requests one.
   */
  const defaultMetadata = metadata?.default;

  if (declared === undefined || defaultMetadata !== undefined) {
    const projection = projectDefaultResponse(route, defaultMetadata);

    responses.default = projection.response;

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

  hasRuntimeContract: boolean,

  entry: ResponseContract,

  metadata: OpenAPIResponseMetadata | undefined,

  resolver: OutputSchemaResolver | undefined,
): {
  readonly response: ProjectedResponseObject;

  readonly issues: OpenAPIGenerationIssue[];
} {
  const response: ProjectedResponseObject = {
    description: metadata?.description ?? `HTTP ${status} response`,
  };

  /*
   * Runtime bodyless semantics always win.
   *
   * Description/deprecation-style documentation can
   * patch the response, but schema/media content
   * cannot be invented for a status that Gelis
   * guarantees has no body.
   */
  if (hasRuntimeContract && (BODYLESS_STATUSES.has(status) || entry === undefined)) {
    if (metadata?.schema !== undefined || metadata?.mediaType !== undefined) {
      return {
        response,

        issues: [
          createResponseIssue(
            route,
            status,

            "OPENAPI_RESPONSE_BODYLESS_CONTENT_CONFLICT",

            `OpenAPI response metadata for ${route.method} ${route.path} status ${status} declares content for a runtime bodyless response.`,
          ),
        ],
      };
    }

    return {
      response,

      issues: [],
    };
  }

  /*
   * Opaque metadata bypasses schema conversion.
   *
   * If runtime serialization already gives us a
   * deterministic media type, retain it. Metadata
   * may provide a media type only when it does not
   * contradict that runtime fact.
   */
  if (metadata?.opaque === true) {
    const runtimeMediaType = hasRuntimeContract ? runtimeExplicitMediaType(entry) : undefined;

    const selected = selectMediaType(metadata.mediaType, runtimeMediaType);

    if (selected.conflict) {
      if (selected.mediaType !== undefined) {
        response.content = {
          [selected.mediaType]: {},
        };
      }

      return {
        response,

        issues: [
          createResponseIssue(
            route,
            status,

            "OPENAPI_RESPONSE_MEDIA_TYPE_CONFLICT",

            `OpenAPI response media type "${metadata.mediaType}" contradicts runtime media type "${runtimeMediaType}" for ${route.method} ${route.path} status ${status}.`,
          ),
        ],
      };
    }

    if (selected.mediaType !== undefined) {
      response.content = {
        [selected.mediaType]: {},
      };
    }

    return {
      response,

      issues: [],
    };
  }

  /*
   * Explicit OpenAPI schema metadata bypasses
   * Standard JSON Schema conversion.
   */
  if (metadata?.schema !== undefined) {
    let prepared: ResolvedJSONSchema;

    try {
      prepared = prepareSchemaOccurrence(
        route,

        {
          kind: "response",

          status,
        },

        cloneOpenAPIJSONSchema(metadata.schema),
      );
    } catch (cause) {
      return {
        response,

        issues: [
          createResponseIssue(
            route,
            status,

            schemaResourceIssueCode(cause),

            `Failed to prepare the OpenAPI response schema override for ${route.method} ${route.path} status ${status}: ${schemaResourceIssueDetail(cause)}`,

            cause,
          ),
        ],
      };
    }

    if (!hasRuntimeContract) {
      const mediaType = metadata.mediaType ?? "application/json";

      response.content = {
        [mediaType]: {
          schema: prepared,
        },
      };

      return {
        response,

        issues: [],
      };
    }

    const runtimeMediaType = runtimeExplicitMediaType(entry) ?? classifyAutoMediaType(prepared);

    const selected = selectMediaType(metadata.mediaType, runtimeMediaType);

    if (selected.conflict) {
      if (selected.mediaType !== undefined) {
        response.content = {
          [selected.mediaType]: {
            schema: prepared,
          },
        };
      }

      return {
        response,

        issues: [
          createResponseIssue(
            route,
            status,

            "OPENAPI_RESPONSE_MEDIA_TYPE_CONFLICT",

            `OpenAPI response media type "${metadata.mediaType}" contradicts runtime media type "${runtimeMediaType}" for ${route.method} ${route.path} status ${status}.`,
          ),
        ],
      };
    }

    if (selected.mediaType === undefined) {
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
      [selected.mediaType]: {
        schema: prepared,
      },
    };

    return {
      response,

      issues: [],
    };
  }

  /*
   * No runtime response exists: metadata is a
   * documentation-only response patch/addition.
   *
   * Without an explicit schema it remains opaque.
   */
  if (!hasRuntimeContract) {
    if (metadata?.mediaType !== undefined) {
      response.content = {
        [metadata.mediaType]: {},
      };
    }

    return {
      response,

      issues: [],
    };
  }

  const schema = responseSchema(entry as Exclude<ResponseContract, undefined>);

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

  let prepared: ResolvedJSONSchema;

  try {
    prepared = prepareSchemaOccurrence(
      route,

      {
        kind: "response",

        status,
      },

      resolved,
    );
  } catch (cause) {
    return {
      response,

      issues: [
        createResponseIssue(
          route,
          status,

          schemaResourceIssueCode(cause),

          `Failed to prepare the response schema for ${route.method} ${route.path} status ${status}: ${schemaResourceIssueDetail(cause)}`,

          cause,
        ),
      ],
    };
  }

  const runtimeMediaType = runtimeExplicitMediaType(entry) ?? classifyAutoMediaType(prepared);

  const selected = selectMediaType(metadata?.mediaType, runtimeMediaType);

  if (selected.conflict) {
    if (selected.mediaType !== undefined) {
      response.content = {
        [selected.mediaType]: {
          schema: prepared,
        },
      };
    }

    return {
      response,

      issues: [
        createResponseIssue(
          route,
          status,

          "OPENAPI_RESPONSE_MEDIA_TYPE_CONFLICT",

          `OpenAPI response media type "${metadata?.mediaType}" contradicts runtime media type "${runtimeMediaType}" for ${route.method} ${route.path} status ${status}.`,
        ),
      ],
    };
  }

  if (selected.mediaType === undefined) {
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
    [selected.mediaType]: {
      schema: prepared,
    },
  };

  return {
    response,

    issues: [],
  };
}

function projectDefaultResponse(
  route: ContractRouteSnapshot,

  metadata: OpenAPIResponseMetadata | undefined,
): {
  readonly response: ProjectedResponseObject;

  readonly issues: OpenAPIGenerationIssue[];
} {
  const response: ProjectedResponseObject = {
    description: metadata?.description ?? "Undocumented response",
  };

  if (metadata === undefined) {
    return {
      response,

      issues: [],
    };
  }

  if (metadata.opaque === true) {
    if (metadata.mediaType !== undefined) {
      response.content = {
        [metadata.mediaType]: {},
      };
    }

    return {
      response,

      issues: [],
    };
  }

  if (metadata.schema !== undefined) {
    let prepared: ResolvedJSONSchema;

    try {
      prepared = prepareSchemaOccurrence(
        route,

        {
          kind: "response",

          status: "default",
        },

        cloneOpenAPIJSONSchema(metadata.schema),
      );
    } catch (cause) {
      return {
        response,

        issues: [
          createResponseIssue(
            route,
            "default",

            schemaResourceIssueCode(cause),

            `Failed to prepare the OpenAPI default response schema override for ${route.method} ${route.path}: ${schemaResourceIssueDetail(cause)}`,

            cause,
          ),
        ],
      };
    }

    const mediaType = metadata.mediaType ?? "application/json";

    response.content = {
      [mediaType]: {
        schema: prepared,
      },
    };

    return {
      response,

      issues: [],
    };
  }

  if (metadata.mediaType !== undefined) {
    response.content = {
      [metadata.mediaType]: {},
    };
  }

  return {
    response,

    issues: [],
  };
}

function collectNumericStatuses(
  declared: ContractRouteSnapshot["responses"],

  metadata: OpenAPIResponseMetadataMap | undefined,
): number[] {
  const statuses = new Set<number>();

  if (declared !== undefined) {
    for (const key of Object.keys(declared)) {
      const status = Number(key);

      if (Number.isFinite(status)) {
        statuses.add(status);
      }
    }
  }

  if (metadata !== undefined) {
    for (const key of Object.keys(metadata)) {
      if (key === "default") {
        continue;
      }

      const status = Number(key);

      if (Number.isFinite(status)) {
        statuses.add(status);
      }
    }
  }

  return [...statuses].sort(compareNumbers);
}

function getResponseMetadata(route: ContractRouteSnapshot): OpenAPIResponseMetadataMap | undefined {
  const openapi = route.openapi;

  if (openapi === undefined || openapi === false) {
    return undefined;
  }

  return openapi.responses;
}

function responseSchema(entry: Exclude<ResponseContract, undefined>): StandardSchemaV1 {
  if (isStandardSchema(entry)) {
    return entry;
  }

  return entry.schema;
}

function runtimeExplicitMediaType(entry: ResponseContract): string | undefined {
  if (entry === undefined || isStandardSchema(entry)) {
    return undefined;
  }

  const descriptor: ResponseDescriptor = entry;

  if (descriptor.serialize === "json") {
    return descriptor.contentType ?? "application/json";
  }

  if (descriptor.serialize === "text") {
    return descriptor.contentType ?? "text/plain";
  }

  return undefined;
}

function selectMediaType(
  metadataMediaType: string | undefined,

  runtimeMediaType: string | undefined,
): {
  readonly mediaType: string | undefined;

  readonly conflict: boolean;
} {
  if (
    metadataMediaType !== undefined &&
    runtimeMediaType !== undefined &&
    normalizeMediaType(metadataMediaType) !== normalizeMediaType(runtimeMediaType)
  ) {
    return {
      mediaType: runtimeMediaType,

      conflict: true,
    };
  }

  return {
    mediaType: metadataMediaType ?? runtimeMediaType,

    conflict: false,
  };
}

function normalizeMediaType(value: string): string {
  const separator = value.indexOf(";");

  return (separator === -1 ? value : value.slice(0, separator)).trim().toLowerCase();
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

function cloneOpenAPIJSONSchema(schema: OpenAPIJSONSchema): ResolvedJSONSchema {
  if (typeof schema === "boolean") {
    return schema;
  }

  const cloned = structuredClone(schema);

  if (!isRecord(cloned)) {
    throw new TypeError("OpenAPI response schema override must be a JSON Schema object or boolean schema.");
  }

  return cloned;
}

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return value !== null && (typeof value === "object" || typeof value === "function") && "~standard" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(
  value: object,

  key: PropertyKey,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function createResponseIssue(
  route: ContractRouteSnapshot,

  status: ResponseStatus,

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

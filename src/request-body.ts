import type { ContractRouteSnapshot } from "gelis";

import type { InputSchemaResolver, ResolvedJSONSchema } from "./schema-resolution";

import type { OpenAPIGenerationIssue } from "./types";

import { prepareSchemaOccurrence, schemaResourceIssueCode, schemaResourceIssueDetail } from "./schema-occurrence";

export interface ProjectedMediaTypeObject {
  schema: ResolvedJSONSchema;
}

export interface ProjectedRequestBodyObject {
  required: true;

  content: {
    "application/json": ProjectedMediaTypeObject;
  };
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

  if (body === undefined) {
    return {
      requestBody: undefined,

      issues: [],
    };
  }

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

  let preparedSchema: ResolvedJSONSchema;

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

  return {
    requestBody: {
      required: true,

      content: {
        "application/json": {
          schema: preparedSchema,
        },
      },
    },

    issues: [],
  };
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

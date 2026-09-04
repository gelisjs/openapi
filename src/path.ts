import type {
  ApplicationContractSnapshot,
  ContractRouteSnapshot,
  HttpMethod,
  OpenAPIJSONSchema,
  OpenAPIRouteMetadata,
} from "gelis";

import { projectQueryParameters } from "./query";

import type { ProjectedQueryParameterObject } from "./query";

import { projectRequestBody } from "./request-body";

import type { ProjectedRequestBodyObject } from "./request-body";

import { getInputSchemaResolver, getOutputSchemaResolver } from "./schema-resolution";

import type { ResolvedJSONSchema, SchemaResolver } from "./schema-resolution";

import { projectResponses } from "./response";

import type { ProjectedResponsesObject } from "./response";

import { prepareSchemaOccurrence, schemaResourceIssueCode, schemaResourceIssueDetail } from "./schema-occurrence";

import { createStandardJSONSchemaProjectionResolver } from "./standard-json-schema";

import type { OpenAPIGenerationIssue } from "./types";

type OpenAPIMethodKey = "get" | "post" | "put" | "patch" | "delete" | "options" | "head";

export interface ProjectedPathParameterObject {
  name: string;

  in: "path";

  required: true;

  description?: string;

  deprecated?: boolean;

  schema: ResolvedJSONSchema;
}

export type ProjectedParameterObject = ProjectedPathParameterObject | ProjectedQueryParameterObject;

export interface ProjectedOperationObject {
  summary?: string;

  description?: string;

  operationId?: string;

  tags?: string[];

  deprecated?: boolean;

  parameters?: ProjectedParameterObject[];

  requestBody?: ProjectedRequestBodyObject;

  responses: ProjectedResponsesObject;
}

export type ProjectedPathItemObject = Partial<Record<OpenAPIMethodKey, ProjectedOperationObject>>;

export interface PathProjectionResult {
  readonly paths: Record<string, ProjectedPathItemObject>;

  readonly issues: OpenAPIGenerationIssue[];
}

interface PathCandidate {
  readonly route: ContractRouteSnapshot;

  readonly openapiPath: string;

  readonly templateShape: string;

  readonly parameterNames: readonly string[];
}

interface TemplateOwner {
  readonly sourcePath: string;

  readonly openapiPath: string;
}

const METHOD_ORDER: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

export function projectPaths(
  contract: ApplicationContractSnapshot,

  resolver?: SchemaResolver,
): PathProjectionResult {
  const issues: OpenAPIGenerationIssue[] = [];

  const activeResolver = resolver ?? createStandardJSONSchemaProjectionResolver();

  const inputResolver = getInputSchemaResolver(activeResolver);

  const outputResolver = getOutputSchemaResolver(activeResolver);

  const candidates = createCandidates(contract);

  const grouped = new Map<string, Partial<Record<OpenAPIMethodKey, ProjectedOperationObject>>>();

  const templateOwners = new Map<string, TemplateOwner>();

  const operationIds = new Map<
    string,
    {
      readonly method: HttpMethod;

      readonly path: string;
    }
  >();

  for (const candidate of candidates) {
    const { route, openapiPath, templateShape, parameterNames } = candidate;

    const metadata = getRouteMetadata(route);

    validateOperationId(route, metadata, operationIds, issues);

    const queryProjection = projectQueryParameters(route, inputResolver);

    const bodyProjection = projectRequestBody(route, inputResolver);

    const responseProjection = projectResponses(route, outputResolver);

    issues.push(...queryProjection.issues, ...bodyProjection.issues, ...responseProjection.issues);

    const existingOwner = templateOwners.get(templateShape);

    if (existingOwner !== undefined && existingOwner.sourcePath !== route.path) {
      issues.push({
        code: "OPENAPI_PATH_TEMPLATE_COLLISION",

        method: route.method,

        path: route.path,

        location: "path",

        message: `Route "${route.path}" conflicts with "${existingOwner.sourcePath}" after OpenAPI path-template projection.`,
      });

      continue;
    }

    if (existingOwner === undefined) {
      templateOwners.set(
        templateShape,

        {
          sourcePath: route.path,

          openapiPath,
        },
      );
    }

    let operations = grouped.get(openapiPath);

    if (operations === undefined) {
      operations = {};

      grouped.set(openapiPath, operations);
    }

    const method = toOpenAPIMethodKey(route.method);

    if (operations[method] !== undefined) {
      issues.push({
        code: "OPENAPI_OPERATION_COLLISION",

        method: route.method,

        path: route.path,

        location: `paths.${openapiPath}.${method}`,

        message: `Multiple Gelis routes project to OpenAPI operation ${route.method} ${openapiPath}.`,
      });

      continue;
    }

    const pathParameters = createPathParameters(route, parameterNames, issues);

    const parameters: ProjectedParameterObject[] = [...pathParameters, ...queryProjection.parameters];

    const operation: ProjectedOperationObject = {
      responses: responseProjection.responses,
    };

    applyOperationMetadata(operation, metadata);

    if (parameters.length > 0) {
      operation.parameters = parameters;
    }

    if (bodyProjection.requestBody !== undefined) {
      operation.requestBody = bodyProjection.requestBody;
    }

    operations[method] = operation;
  }

  return {
    paths: finalizePaths(grouped),

    issues,
  };
}

function createCandidates(contract: ApplicationContractSnapshot): PathCandidate[] {
  const candidates: PathCandidate[] = [];

  for (const route of contract.routes) {
    if (route.openapi === false) {
      continue;
    }

    const path = projectPath(route.path);

    candidates.push({
      route,

      ...path,
    });
  }

  candidates.sort(
    (left, right) =>
      compareStrings(left.openapiPath, right.openapiPath) ||
      compareNumbers(methodRank(left.route.method), methodRank(right.route.method)) ||
      compareStrings(left.route.path, right.route.path),
  );

  return candidates;
}

function projectPath(path: string): {
  readonly openapiPath: string;

  readonly templateShape: string;

  readonly parameterNames: readonly string[];
} {
  const sourceSegments = path.split("/");

  const parameterNames: string[] = [];

  const openapiSegments = sourceSegments.map((segment) => {
    if (segment.startsWith(":") && segment.length > 1) {
      const name = segment.slice(1);

      parameterNames.push(name);

      return `{${name}}`;
    }

    return segment;
  });

  const openapiPath = openapiSegments.join("/");

  const templateShape = openapiSegments.map((segment) => (isTemplateSegment(segment) ? "{}" : segment)).join("/");

  return {
    openapiPath,
    templateShape,
    parameterNames,
  };
}

function createPathParameters(
  route: ContractRouteSnapshot,

  names: readonly string[],

  issues: OpenAPIGenerationIssue[],
): ProjectedPathParameterObject[] {
  const parameters: ProjectedPathParameterObject[] = [];

  const seen = new Set<string>();

  const metadata = getRouteMetadata(route)?.request?.params;

  for (const name of names) {
    if (seen.has(name)) {
      continue;
    }

    seen.add(name);

    const patch = metadata?.[name];

    let schema: ResolvedJSONSchema = {
      type: "string",
    };

    if (patch?.schema !== undefined) {
      try {
        schema = prepareSchemaOccurrence(
          route,

          {
            kind: "path",

            name,
          },

          cloneOpenAPIJSONSchema(patch.schema),
        );
      } catch (cause) {
        issues.push({
          code: schemaResourceIssueCode(cause),

          method: route.method,

          path: route.path,

          location: `request.params.${name}`,

          message: `Failed to prepare path parameter schema "${name}" for ${route.method} ${route.path}: ${schemaResourceIssueDetail(cause)}`,

          ...(cause === undefined
            ? {}
            : {
                cause,
              }),
        });
      }
    }

    const parameter: ProjectedPathParameterObject = {
      name,

      in: "path",

      required: true,

      schema,
    };

    if (patch?.description !== undefined) {
      parameter.description = patch.description;
    }

    if (patch?.deprecated !== undefined) {
      parameter.deprecated = patch.deprecated;
    }

    parameters.push(parameter);
  }

  if (metadata !== undefined) {
    const patchedNames = Object.keys(metadata).sort(compareStrings);

    for (const name of patchedNames) {
      if (seen.has(name)) {
        continue;
      }

      issues.push({
        code: "OPENAPI_PATH_PARAMETER_UNKNOWN",

        method: route.method,

        path: route.path,

        location: `request.params.${name}`,

        message: `OpenAPI path metadata references unknown path parameter "${name}" on ${route.method} ${route.path}.`,
      });
    }
  }

  return parameters;
}

function getRouteMetadata(route: ContractRouteSnapshot): OpenAPIRouteMetadata | undefined {
  if (route.openapi === undefined || route.openapi === false) {
    return undefined;
  }

  return route.openapi;
}

function applyOperationMetadata(
  operation: ProjectedOperationObject,

  metadata: OpenAPIRouteMetadata | undefined,
): void {
  if (metadata === undefined) {
    return;
  }

  if (metadata.summary !== undefined) {
    operation.summary = metadata.summary;
  }

  if (metadata.description !== undefined) {
    operation.description = metadata.description;
  }

  if (metadata.operationId !== undefined) {
    operation.operationId = metadata.operationId;
  }

  if (metadata.tags !== undefined) {
    operation.tags = [...metadata.tags];
  }

  if (metadata.deprecated !== undefined) {
    operation.deprecated = metadata.deprecated;
  }
}

function validateOperationId(
  route: ContractRouteSnapshot,

  metadata: OpenAPIRouteMetadata | undefined,

  operationIds: Map<
    string,
    {
      readonly method: HttpMethod;

      readonly path: string;
    }
  >,

  issues: OpenAPIGenerationIssue[],
): void {
  const operationId = metadata?.operationId;

  if (operationId === undefined) {
    return;
  }

  const existing = operationIds.get(operationId);

  if (existing === undefined) {
    operationIds.set(
      operationId,

      {
        method: route.method,

        path: route.path,
      },
    );

    return;
  }

  issues.push({
    code: "OPENAPI_OPERATION_ID_DUPLICATE",

    method: route.method,

    path: route.path,

    location: "operationId",

    message: `OpenAPI operationId "${operationId}" on ${route.method} ${route.path} is already used by ${existing.method} ${existing.path}.`,
  });
}

function cloneOpenAPIJSONSchema(schema: OpenAPIJSONSchema): ResolvedJSONSchema {
  if (typeof schema === "boolean") {
    return schema;
  }

  const cloned = structuredClone(schema);

  if (!isRecord(cloned)) {
    throw new TypeError("OpenAPI schema override must be a JSON Schema object or boolean schema.");
  }

  return cloned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finalizePaths(
  grouped: ReadonlyMap<string, Partial<Record<OpenAPIMethodKey, ProjectedOperationObject>>>,
): Record<string, ProjectedPathItemObject> {
  const paths: Record<string, ProjectedPathItemObject> = {};

  const sortedPaths = [...grouped.keys()].sort(compareStrings);

  for (const path of sortedPaths) {
    const source = grouped.get(path);

    if (source === undefined) {
      continue;
    }

    const item: ProjectedPathItemObject = {};

    for (const method of METHOD_ORDER) {
      const key = toOpenAPIMethodKey(method);

      const operation = source[key];

      if (operation === undefined) {
        continue;
      }

      item[key] = operation;
    }

    paths[path] = item;
  }

  return paths;
}

function isTemplateSegment(segment: string): boolean {
  return segment.length >= 3 && segment.startsWith("{") && segment.endsWith("}");
}

function methodRank(method: HttpMethod): number {
  switch (method) {
    case "GET":
      return 0;

    case "POST":
      return 1;

    case "PUT":
      return 2;

    case "PATCH":
      return 3;

    case "DELETE":
      return 4;

    case "OPTIONS":
      return 5;

    case "HEAD":
      return 6;
  }
}

function toOpenAPIMethodKey(method: HttpMethod): OpenAPIMethodKey {
  switch (method) {
    case "GET":
      return "get";

    case "POST":
      return "post";

    case "PUT":
      return "put";

    case "PATCH":
      return "patch";

    case "DELETE":
      return "delete";

    case "OPTIONS":
      return "options";

    case "HEAD":
      return "head";
  }
}

function compareStrings(
  left: string,

  right: string,
): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function compareNumbers(
  left: number,

  right: number,
): number {
  return left - right;
}

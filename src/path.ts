import type { ApplicationContractSnapshot, ContractRouteSnapshot, HttpMethod } from "gelis";

import type { OpenAPIGenerationIssue } from "./types";

type OpenAPIMethodKey = "get" | "post" | "put" | "patch" | "delete" | "options" | "head";

export interface ProjectedPathParameterObject {
  name: string;

  in: "path";

  required: true;

  schema: {
    type: "string";
  };
}

export interface ProjectedOperationObject {
  parameters?: ProjectedPathParameterObject[];
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

export function projectPaths(contract: ApplicationContractSnapshot): PathProjectionResult {
  const issues: OpenAPIGenerationIssue[] = [];

  const candidates = createCandidates(contract);

  const grouped = new Map<string, Partial<Record<OpenAPIMethodKey, ProjectedOperationObject>>>();

  const templateOwners = new Map<string, TemplateOwner>();

  for (const candidate of candidates) {
    const { route, openapiPath, templateShape, parameterNames } = candidate;

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

    const parameters = createPathParameters(parameterNames);

    operations[method] =
      parameters.length === 0
        ? {}
        : {
            parameters,
          };
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

function createPathParameters(names: readonly string[]): ProjectedPathParameterObject[] {
  const parameters: ProjectedPathParameterObject[] = [];

  const seen = new Set<string>();

  for (const name of names) {
    if (seen.has(name)) {
      continue;
    }

    seen.add(name);

    parameters.push({
      name,

      in: "path",

      required: true,

      schema: {
        type: "string",
      },
    });
  }

  return parameters;
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

import type { ContractRouteSnapshot } from "gelis";

import type { InputSchemaResolver, ResolvedJSONSchema } from "./schema-resolution";

import type { OpenAPIGenerationIssue } from "./types";

export interface ProjectedQueryParameterObject {
  name: string;

  in: "query";

  required?: boolean;

  schema: ResolvedJSONSchema;

  style?: "form" | "spaceDelimited" | "pipeDelimited" | "deepObject";

  explode?: boolean;
}

export interface QueryProjectionResult {
  readonly parameters: ProjectedQueryParameterObject[];

  readonly issues: OpenAPIGenerationIssue[];
}

interface QuerySchemaDecomposition {
  readonly properties: Record<string, ResolvedJSONSchema>;

  readonly required: ReadonlySet<string>;
}

const NON_DECOMPOSABLE_ROOT_KEYWORDS = [
  "$ref",
  "$dynamicRef",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
] as const;

export function projectQueryParameters(
  route: ContractRouteSnapshot,

  resolver: InputSchemaResolver | undefined,
): QueryProjectionResult {
  const query = route.query;

  if (query === undefined) {
    return {
      parameters: [],

      issues: [],
    };
  }

  if (resolver === undefined) {
    return {
      parameters: [],

      issues: [
        createQueryIssue(
          route,

          "OPENAPI_QUERY_SCHEMA_RESOLVER_REQUIRED",

          "Automatic query projection requires an input JSON Schema resolver.",
        ),
      ],
    };
  }

  let schema: ResolvedJSONSchema;

  try {
    schema = resolver.resolveInput(query);
  } catch (cause) {
    return {
      parameters: [],

      issues: [
        createQueryIssue(
          route,

          "OPENAPI_QUERY_SCHEMA_RESOLUTION_FAILED",

          `Failed to resolve the query schema for ${route.method} ${route.path}.`,

          cause,
        ),
      ],
    };
  }

  const decomposition = decomposeQuerySchema(schema);

  if (typeof decomposition === "string") {
    return {
      parameters: [],

      issues: [
        createQueryIssue(
          route,

          "OPENAPI_QUERY_SCHEMA_NOT_DECOMPOSABLE",

          `The query schema for ${route.method} ${route.path} cannot be projected automatically: ${decomposition}`,
        ),
      ],
    };
  }

  const names = Object.keys(decomposition.properties).sort(compareStrings);

  const parameters: ProjectedQueryParameterObject[] = [];

  for (const name of names) {
    const propertySchema = decomposition.properties[name];

    if (propertySchema === undefined) {
      continue;
    }

    const parameter: ProjectedQueryParameterObject = {
      name,

      in: "query",

      schema: propertySchema,
    };

    if (decomposition.required.has(name)) {
      parameter.required = true;
    }

    if (schemaAllowsArray(propertySchema)) {
      parameter.style = "form";

      parameter.explode = true;
    }

    parameters.push(parameter);
  }

  return {
    parameters,
    issues: [],
  };
}

function decomposeQuerySchema(schema: ResolvedJSONSchema): QuerySchemaDecomposition | string {
  if (typeof schema === "boolean") {
    return "the root schema is boolean rather than an object schema.";
  }

  for (const keyword of NON_DECOMPOSABLE_ROOT_KEYWORDS) {
    if (hasOwn(schema, keyword)) {
      return `root keyword "${keyword}" requires query semantics that cannot be represented as independent parameters.`;
    }
  }

  if (!allowsObject(schema.type)) {
    return "the root schema does not describe an object.";
  }

  const rawProperties = schema.properties;

  if (!isRecord(rawProperties)) {
    return 'the root schema does not contain a directly decomposable "properties" object.';
  }

  const properties: Record<string, ResolvedJSONSchema> = {};

  for (const [name, propertySchema] of Object.entries(rawProperties)) {
    if (!isJSONSchema(propertySchema)) {
      return `property "${name}" is not a JSON Schema object or boolean schema.`;
    }

    properties[name] = propertySchema;
  }

  const required = new Set<string>();

  const rawRequired = schema.required;

  if (rawRequired !== undefined) {
    if (!Array.isArray(rawRequired)) {
      return '"required" is not an array.';
    }

    for (const name of rawRequired) {
      if (typeof name !== "string") {
        return '"required" contains a non-string property name.';
      }

      if (!hasOwn(properties, name)) {
        return `required property "${name}" has no directly projected property schema.`;
      }

      required.add(name);
    }
  }

  return {
    properties,
    required,
  };
}

function allowsObject(type: unknown): boolean {
  if (type === undefined) {
    return true;
  }

  if (type === "object") {
    return true;
  }

  if (Array.isArray(type)) {
    return type.includes("object");
  }

  return false;
}

function schemaAllowsArray(schema: ResolvedJSONSchema): boolean {
  if (typeof schema === "boolean") {
    return false;
  }

  const type = schema.type;

  if (type === "array") {
    return true;
  }

  return Array.isArray(type) && type.includes("array");
}

function isJSONSchema(value: unknown): value is ResolvedJSONSchema {
  return typeof value === "boolean" || isRecord(value);
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

function createQueryIssue(
  route: ContractRouteSnapshot,

  code: string,

  message: string,

  cause?: unknown,
): OpenAPIGenerationIssue {
  return {
    code,

    method: route.method,

    path: route.path,

    location: "request.query",

    message,

    ...(cause === undefined
      ? {}
      : {
          cause,
        }),
  };
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

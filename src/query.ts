import type { ContractRouteSnapshot, OpenAPIJSONSchema, OpenAPIQueryMetadata, OpenAPIQueryParameter } from "gelis";

import type { InputSchemaResolver, ResolvedJSONSchema } from "./schema-resolution";

import { prepareSchemaOccurrence, schemaResourceIssueCode, schemaResourceIssueDetail } from "./schema-occurrence";

import type { OpenAPIGenerationIssue } from "./types";

export interface ProjectedQueryParameterObject {
  name: string;

  in: "query";

  description?: string;

  required?: boolean;

  deprecated?: boolean;

  schema?: ResolvedJSONSchema;

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
  const metadata = getQueryMetadata(route);

  if (metadata !== undefined) {
    if (metadata.opaque === true) {
      return {
        parameters: [],

        issues: [],
      };
    }

    if (Array.isArray(metadata.parameters)) {
      return projectExplicitQueryParameters(route, metadata.parameters);
    }

    if (metadata.schema !== undefined) {
      let schema: ResolvedJSONSchema;

      try {
        schema = cloneOpenAPIJSONSchema(metadata.schema);
      } catch (cause) {
        return {
          parameters: [],

          issues: [
            createQueryIssue(
              route,

              "OPENAPI_QUERY_SCHEMA_OVERRIDE_INVALID",

              `Failed to clone the OpenAPI query schema override for ${route.method} ${route.path}.`,

              cause,
            ),
          ],
        };
      }

      return projectDecomposedQuerySchema(route, schema);
    }

    return {
      parameters: [],

      issues: [
        createQueryIssue(
          route,

          "OPENAPI_QUERY_METADATA_INVALID",

          `OpenAPI query metadata for ${route.method} ${route.path} does not select schema, parameters, or opaque projection.`,
        ),
      ],
    };
  }

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

  return projectDecomposedQuerySchema(route, schema);
}

function projectExplicitQueryParameters(
  route: ContractRouteSnapshot,

  declarations: readonly OpenAPIQueryParameter[],
): QueryProjectionResult {
  const parameters: ProjectedQueryParameterObject[] = [];

  const issues: OpenAPIGenerationIssue[] = [];

  const seen = new Set<string>();

  for (let index = 0; index < declarations.length; index++) {
    const declaration = declarations[index];

    if (declaration === undefined) {
      continue;
    }

    const name = declaration.name;

    if (seen.has(name)) {
      issues.push({
        code: "OPENAPI_QUERY_PARAMETER_DUPLICATE",

        method: route.method,

        path: route.path,

        location: `request.query.parameters.${index}`,

        message: `OpenAPI explicit query parameter "${name}" is declared more than once on ${route.method} ${route.path}.`,
      });

      continue;
    }

    seen.add(name);

    const parameter: ProjectedQueryParameterObject = {
      name,

      in: "query",
    };

    if (declaration.description !== undefined) {
      parameter.description = declaration.description;
    }

    if (declaration.required !== undefined) {
      parameter.required = declaration.required;
    }

    if (declaration.deprecated !== undefined) {
      parameter.deprecated = declaration.deprecated;
    }

    if (declaration.style !== undefined) {
      parameter.style = declaration.style;
    }

    if (declaration.explode !== undefined) {
      parameter.explode = declaration.explode;
    }

    if (declaration.schema !== undefined) {
      try {
        parameter.schema = prepareSchemaOccurrence(
          route,

          {
            kind: "query",

            name,
          },

          cloneOpenAPIJSONSchema(declaration.schema),
        );
      } catch (cause) {
        issues.push({
          code: schemaResourceIssueCode(cause),

          method: route.method,

          path: route.path,

          location: `request.query.parameters.${index}.schema`,

          message: `Failed to prepare explicit query parameter schema "${name}" for ${route.method} ${route.path}: ${schemaResourceIssueDetail(cause)}`,

          ...(cause === undefined
            ? {}
            : {
                cause,
              }),
        });
      }
    }

    parameters.push(parameter);
  }

  return {
    parameters,
    issues,
  };
}

function projectDecomposedQuerySchema(
  route: ContractRouteSnapshot,

  schema: ResolvedJSONSchema,
): QueryProjectionResult {
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

  const issues: OpenAPIGenerationIssue[] = [];

  for (const name of names) {
    const propertySchema = decomposition.properties[name];

    if (propertySchema === undefined) {
      continue;
    }

    let preparedSchema: ResolvedJSONSchema;

    try {
      preparedSchema = prepareSchemaOccurrence(
        route,

        {
          kind: "query",

          name,
        },

        propertySchema,
      );
    } catch (cause) {
      issues.push({
        code: schemaResourceIssueCode(cause),

        method: route.method,

        path: route.path,

        location: `request.query.${name}`,

        message: `Failed to prepare query parameter schema "${name}" for ${route.method} ${route.path}: ${schemaResourceIssueDetail(cause)}`,

        ...(cause === undefined
          ? {}
          : {
              cause,
            }),
      });

      continue;
    }

    const parameter: ProjectedQueryParameterObject = {
      name,

      in: "query",

      schema: preparedSchema,
    };

    if (decomposition.required.has(name)) {
      parameter.required = true;
    }

    if (schemaAllowsArray(preparedSchema)) {
      parameter.style = "form";

      parameter.explode = true;
    }

    parameters.push(parameter);
  }

  return {
    parameters,
    issues,
  };
}

function getQueryMetadata(route: ContractRouteSnapshot): OpenAPIQueryMetadata | undefined {
  const openapi = route.openapi;

  if (openapi === undefined || openapi === false) {
    return undefined;
  }

  return openapi.request?.query;
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

function cloneOpenAPIJSONSchema(schema: OpenAPIJSONSchema): ResolvedJSONSchema {
  if (typeof schema === "boolean") {
    return schema;
  }

  const cloned = structuredClone(schema);

  if (!isRecord(cloned)) {
    throw new TypeError("OpenAPI query schema override must be a JSON Schema object or boolean schema.");
  }

  return cloned;
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

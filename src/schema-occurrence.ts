import type { ContractRouteSnapshot } from "gelis";

import { prepareSchemaResource, SchemaResourceError } from "./schema-resource";

import type { ResolvedJSONSchema } from "./schema-resolution";

export type SchemaOccurrence =
  | {
      readonly kind: "path";

      readonly name: string;
    }
  | {
      readonly kind: "query";

      readonly name: string;
    }
  | {
      readonly kind: "body";
    }
  | {
      readonly kind: "response";

      readonly status: number;
    };

const SYNTHETIC_SCHEMA_ORIGIN = "https://schemas.gelis.invalid/openapi";

export function prepareSchemaOccurrence(
  route: ContractRouteSnapshot,

  occurrence: SchemaOccurrence,

  schema: ResolvedJSONSchema,
): ResolvedJSONSchema {
  return prepareSchemaResource(schema, createSyntheticSchemaResourceId(route, occurrence));
}

export function schemaResourceIssueCode(cause: unknown): string {
  if (cause instanceof SchemaResourceError) {
    return cause.code;
  }

  return "OPENAPI_SCHEMA_RESOURCE_PREPARATION_FAILED";
}

export function schemaResourceIssueDetail(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }

  return "Unknown schema resource preparation failure.";
}

function createSyntheticSchemaResourceId(
  route: ContractRouteSnapshot,

  occurrence: SchemaOccurrence,
): string {
  const routeBase = `${SYNTHETIC_SCHEMA_ORIGIN}/${route.method.toLowerCase()}/${encodeURIComponent(route.path)}`;

  switch (occurrence.kind) {
    case "path":
      return `${routeBase}/request/path/${encodeURIComponent(occurrence.name)}`;
    case "query":
      return `${routeBase}/request/query/${encodeURIComponent(occurrence.name)}`;

    case "body":
      return `${routeBase}/request/body`;

    case "response":
      return `${routeBase}/responses/${occurrence.status}`;
  }
}

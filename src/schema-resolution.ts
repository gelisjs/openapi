import type { StandardSchemaV1 } from "gelis";

export type ResolvedJSONSchema = boolean | Record<string, unknown>;

export interface InputSchemaResolver {
  resolveInput(schema: StandardSchemaV1): ResolvedJSONSchema;
}

export interface OutputSchemaResolver {
  resolveOutput(schema: StandardSchemaV1): ResolvedJSONSchema;
}

/*
 * Directional capabilities are optional while
 * B12-B14 are assembled incrementally.
 *
 * B15 will provide both capabilities through one
 * production per-generation resolver.
 */
export interface SchemaResolver {
  readonly resolveInput?: InputSchemaResolver["resolveInput"];

  readonly resolveOutput?: OutputSchemaResolver["resolveOutput"];
}

export function getInputSchemaResolver(resolver: SchemaResolver | undefined): InputSchemaResolver | undefined {
  if (resolver === undefined || !hasInputSchemaResolver(resolver)) {
    return undefined;
  }

  return resolver;
}

export function getOutputSchemaResolver(resolver: SchemaResolver | undefined): OutputSchemaResolver | undefined {
  if (resolver === undefined || !hasOutputSchemaResolver(resolver)) {
    return undefined;
  }

  return resolver;
}

function hasInputSchemaResolver(resolver: SchemaResolver): resolver is SchemaResolver & InputSchemaResolver {
  return typeof resolver.resolveInput === "function";
}

function hasOutputSchemaResolver(resolver: SchemaResolver): resolver is SchemaResolver & OutputSchemaResolver {
  return typeof resolver.resolveOutput === "function";
}

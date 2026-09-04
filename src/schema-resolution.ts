import type { StandardSchemaV1 } from "gelis";

export type ResolvedJSONSchema = boolean | Record<string, unknown>;

export interface InputSchemaResolver {
  resolveInput(schema: StandardSchemaV1): ResolvedJSONSchema;
}

export interface OutputSchemaResolver {
  resolveOutput(schema: StandardSchemaV1): ResolvedJSONSchema;
}

/*
 * B12-B14 consume direction-specific capabilities.
 *
 * B15 will provide one production resolver
 * implementing both directions with Standard
 * JSON Schema conversion and per-generation
 * identity memoization.
 */
export type SchemaResolver = Partial<InputSchemaResolver & OutputSchemaResolver>;

export function getInputSchemaResolver(resolver: SchemaResolver | undefined): InputSchemaResolver | undefined {
  if (resolver === undefined || typeof resolver.resolveInput !== "function") {
    return undefined;
  }

  return resolver;
}

export function getOutputSchemaResolver(resolver: SchemaResolver | undefined): OutputSchemaResolver | undefined {
  if (resolver === undefined || typeof resolver.resolveOutput !== "function") {
    return undefined;
  }

  return resolver;
}

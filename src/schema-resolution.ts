import type { StandardSchemaV1 } from "gelis";

export type ResolvedJSONSchema = boolean | Record<string, unknown>;

/*
 * Internal capability boundary.
 *
 * B12/B13 consume input resolution without
 * knowing how Standard JSON Schema conversion
 * is implemented.
 *
 * B15 supplies the production implementation.
 */
export interface InputSchemaResolver {
  resolveInput(schema: StandardSchemaV1): ResolvedJSONSchema;
}

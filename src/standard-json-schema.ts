import type { StandardJSONSchemaV1, StandardSchemaV1 } from "gelis";

import type { InputSchemaResolver, OutputSchemaResolver, ResolvedJSONSchema } from "./schema-resolution";

export const STANDARD_JSON_SCHEMA_TARGET = "draft-2020-12" as const;

export type StandardJSONSchemaResolver = InputSchemaResolver & OutputSchemaResolver;

type ConversionDirection = "input" | "output";

type CachedConversion =
  | {
      readonly ok: true;

      readonly schema: Record<string, unknown>;
    }
  | {
      readonly ok: false;

      readonly cause: unknown;
    };

interface ResolverOptions {
  readonly detachResults: boolean;
}

/*
 * General-purpose resolver semantics.
 *
 * Every successful resolve returns a detached
 * occurrence. This remains useful for direct/internal
 * callers that may mutate the returned schema.
 */
export function createStandardJSONSchemaResolver(): StandardJSONSchemaResolver {
  return createResolver({
    detachResults: true,
  });
}

/*
 * Production OpenAPI projection resolver.
 *
 * The cached canonical schema is already detached
 * from converter-owned state. Projection immediately
 * passes this borrowed canonical value through
 * prepareSchemaResource(), which creates the final
 * detached occurrence.
 *
 * Avoiding an intermediate occurrence clone removes
 * one structuredClone() per projected schema while
 * retaining:
 *
 * converter-owned state
 *   != cached canonical state
 *   != final document occurrence
 *
 * Callers must treat values returned by this resolver
 * as borrowed/read-only and must not expose or mutate
 * them directly.
 */
export function createStandardJSONSchemaProjectionResolver(): StandardJSONSchemaResolver {
  return createResolver({
    detachResults: false,
  });
}

function createResolver(options: ResolverOptions): StandardJSONSchemaResolver {
  const inputCache = new WeakMap<object, CachedConversion>();

  const outputCache = new WeakMap<object, CachedConversion>();

  return {
    resolveInput(schema) {
      return resolveSchema(schema, "input", inputCache, options.detachResults);
    },

    resolveOutput(schema) {
      return resolveSchema(schema, "output", outputCache, options.detachResults);
    },
  };
}

function resolveSchema(
  schema: StandardSchemaV1,

  direction: ConversionDirection,

  cache: WeakMap<object, CachedConversion>,

  detachResult: boolean,
): ResolvedJSONSchema {
  const cached = cache.get(schema);

  if (cached !== undefined) {
    if (!cached.ok) {
      throw cached.cause;
    }

    return resultSchema(cached.schema, detachResult);
  }

  try {
    if (!hasStandardJSONSchemaCapability(schema)) {
      throw new TypeError("Standard Schema does not expose Standard JSON Schema V1 conversion capability.");
    }

    const converter = schema["~standard"].jsonSchema;

    const converted =
      direction === "input"
        ? converter.input({
            target: STANDARD_JSON_SCHEMA_TARGET,
          })
        : converter.output({
            target: STANDARD_JSON_SCHEMA_TARGET,
          });

    if (!isRecord(converted)) {
      throw new TypeError(`Standard JSON Schema ${direction} converter returned a non-object schema.`);
    }

    /*
     * Never retain converter-owned state.
     *
     * This canonical copy belongs exclusively to the
     * resolver cache for this generation.
     */
    const canonical = cloneSchema(converted);

    cache.set(
      schema,

      {
        ok: true,

        schema: canonical,
      },
    );

    return resultSchema(canonical, detachResult);
  } catch (cause) {
    /*
     * Converter failures are memoized by schema
     * identity and direction exactly as successful
     * conversions are.
     */
    cache.set(
      schema,

      {
        ok: false,

        cause,
      },
    );

    throw cause;
  }
}

function resultSchema(
  canonical: Record<string, unknown>,

  detach: boolean,
): Record<string, unknown> {
  return detach ? cloneSchema(canonical) : canonical;
}

function hasStandardJSONSchemaCapability(schema: StandardSchemaV1): schema is StandardSchemaV1 & StandardJSONSchemaV1 {
  const standard = schema["~standard"] as StandardSchemaV1["~standard"] & {
    readonly jsonSchema?: unknown;
  };

  const converter = standard.jsonSchema;

  return isRecord(converter) && typeof converter.input === "function" && typeof converter.output === "function";
}

function cloneSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const cloned = structuredClone(schema);

  if (!isRecord(cloned)) {
    throw new TypeError("Failed to create a detached Standard JSON Schema object.");
  }

  return cloned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

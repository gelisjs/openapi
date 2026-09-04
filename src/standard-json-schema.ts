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

export function createStandardJSONSchemaResolver(): StandardJSONSchemaResolver {
  const inputCache = new WeakMap<object, CachedConversion>();

  const outputCache = new WeakMap<object, CachedConversion>();

  return {
    resolveInput(schema) {
      return resolveSchema(schema, "input", inputCache);
    },

    resolveOutput(schema) {
      return resolveSchema(schema, "output", outputCache);
    },
  };
}

function resolveSchema(
  schema: StandardSchemaV1,

  direction: ConversionDirection,

  cache: WeakMap<object, CachedConversion>,
): ResolvedJSONSchema {
  const cached = cache.get(schema);

  if (cached !== undefined) {
    if (!cached.ok) {
      throw cached.cause;
    }

    return cloneSchema(cached.schema);
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
     * Never retain the converter-owned object.
     *
     * The cache owns a detached canonical copy,
     * while every consumer receives another copy.
     * This gives:
     *
     * schema source
     *   != cache state
     *   != generated occurrence
     */
    const canonical = cloneSchema(converted);

    cache.set(
      schema,

      {
        ok: true,

        schema: canonical,
      },
    );

    return cloneSchema(canonical);
  } catch (cause) {
    /*
     * A schema identity/direction is attempted once
     * per resolver lifetime, including failures.
     *
     * This prevents one unsupported or throwing
     * converter from being repeatedly executed for
     * every route occurrence.
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

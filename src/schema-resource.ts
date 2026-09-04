import type { ResolvedJSONSchema } from "./schema-resolution";

export type SchemaResourceErrorCode =
  | "OPENAPI_SCHEMA_RESOURCE_ID_INVALID"
  | "OPENAPI_SCHEMA_RESOURCE_ID_COLLISION"
  | "OPENAPI_SCHEMA_ANCHOR_INVALID"
  | "OPENAPI_SCHEMA_REFERENCE_INVALID"
  | "OPENAPI_SCHEMA_REFERENCE_UNRESOLVABLE";

export class SchemaResourceError extends Error {
  readonly code: SchemaResourceErrorCode;

  constructor(
    code: SchemaResourceErrorCode,

    message: string,
  ) {
    super(message);

    this.name = "SchemaResourceError";

    this.code = code;
  }
}

interface SchemaResource {
  readonly root: Record<string, unknown>;

  readonly uri: string | undefined;

  readonly trustedExternalBase: boolean;

  readonly fragments: Set<string>;
}

interface ResourceGraph {
  readonly nodeResources: WeakMap<object, SchemaResource>;

  readonly resourcesByUri: Map<string, SchemaResource>;
}

interface SchemaResourceAnalysis {
  readonly hasResourceSemantics: boolean;

  readonly needsSyntheticBase: boolean;
}

const ANCHOR_PATTERN = /^[A-Za-z_][A-Za-z0-9._-]*$/;

const SINGLE_SCHEMA_KEYWORDS = [
  "not",
  "if",
  "then",
  "else",
  "items",
  "contains",
  "additionalProperties",
  "unevaluatedProperties",
  "propertyNames",
  "unevaluatedItems",
  "contentSchema",
] as const;

const ARRAY_SCHEMA_KEYWORDS = ["allOf", "anyOf", "oneOf", "prefixItems"] as const;

const MAP_SCHEMA_KEYWORDS = ["$defs", "properties", "patternProperties", "dependentSchemas"] as const;

export function prepareSchemaResource(
  schema: ResolvedJSONSchema,

  syntheticId: string,
): ResolvedJSONSchema {
  if (typeof schema === "boolean") {
    return schema;
  }

  const prepared = cloneRecord(schema);

  const analysis = analyzeSchemaResource(prepared);

  /*
   * Most ordinary JSON Schemas have no resource
   * identity/reference semantics at all.
   *
   * The detached clone is already the complete final
   * occurrence in that case. Avoid constructing a
   * resource graph and walking the schema again.
   */
  if (!analysis.hasResourceSemantics) {
    return prepared;
  }

  const rootId = prepared["$id"];

  let syntheticRoot = false;

  if (rootId === undefined) {
    if (analysis.needsSyntheticBase) {
      validateAbsoluteResourceId(syntheticId, "Synthetic schema resource id");

      prepared["$id"] = syntheticId;

      syntheticRoot = true;
    }
  } else {
    if (typeof rootId !== "string") {
      throw new SchemaResourceError(
        "OPENAPI_SCHEMA_RESOURCE_ID_INVALID",

        'Schema root "$id" must be a string.',
      );
    }

    /*
     * The root has no parent resource from which a
     * relative id can be resolved. Preserve explicit
     * ids rather than silently rewriting them.
     */
    validateAbsoluteResourceId(rootId, 'Schema root "$id"');
  }

  const graph = collectResourceGraph(prepared, syntheticRoot);

  validateReferences(prepared, graph);

  return prepared;
}

function analyzeSchemaResource(root: Record<string, unknown>): SchemaResourceAnalysis {
  const visited = new WeakSet<object>();

  let hasResourceSemantics = false;

  let needsSyntheticBase = false;

  visitSchemaTree(
    root,

    (schema, isRoot) => {
      /*
       * Dialect validity applies even when the schema
       * takes the simple fast path and must continue
       * to be checked after resource analysis has
       * otherwise reached a terminal state.
       */
      validateDialect(schema);

      /*
       * Once a synthetic base is required, both
       * resource-analysis answers are already final:
       *
       * hasResourceSemantics = true
       * needsSyntheticBase   = true
       *
       * visitSchemaTree() must still visit descendants
       * so their $schema values are validated, but the
       * more expensive resource keyword checks and URL
       * parsing no longer provide additional information.
       */
      if (needsSyntheticBase) {
        return;
      }

      const id = schema["$id"];

      if (id !== undefined) {
        hasResourceSemantics = true;

        if (!isRoot && typeof id === "string" && !isAbsoluteUri(id)) {
          needsSyntheticBase = true;
        }
      }

      if (schema["$anchor"] !== undefined || schema["$dynamicAnchor"] !== undefined) {
        hasResourceSemantics = true;

        needsSyntheticBase = true;
      }

      for (const keyword of ["$ref", "$dynamicRef"] as const) {
        const reference = schema[keyword];

        if (reference === undefined) {
          continue;
        }

        hasResourceSemantics = true;

        if (typeof reference === "string" && !isAbsoluteUri(reference)) {
          needsSyntheticBase = true;
        }
      }
    },

    visited,
  );

  return {
    hasResourceSemantics,
    needsSyntheticBase,
  };
}

function collectResourceGraph(
  root: Record<string, unknown>,

  syntheticRoot: boolean,
): ResourceGraph {
  const nodeResources = new WeakMap<object, SchemaResource>();

  const resourcesByUri = new Map<string, SchemaResource>();

  const visited = new WeakSet<object>();

  function visit(
    schema: Record<string, unknown>,

    parent: SchemaResource | undefined,

    isRoot: boolean,
  ): void {
    if (visited.has(schema)) {
      return;
    }

    visited.add(schema);

    const explicitId = schema["$id"];

    let resource = parent;

    if (isRoot) {
      resource = createRootResource(schema, explicitId, syntheticRoot);

      registerResource(resource, resourcesByUri);
    } else if (explicitId !== undefined) {
      if (typeof explicitId !== "string") {
        throw new SchemaResourceError(
          "OPENAPI_SCHEMA_RESOURCE_ID_INVALID",

          'Schema "$id" must be a string.',
        );
      }

      if (parent === undefined) {
        throw new Error("Missing parent schema resource");
      }

      resource = createNestedResource(schema, explicitId, parent);

      registerResource(resource, resourcesByUri);
    }

    if (resource === undefined) {
      throw new Error("Missing schema resource");
    }

    nodeResources.set(schema, resource);

    registerAnchor(schema, "$anchor", resource);

    registerAnchor(schema, "$dynamicAnchor", resource);

    forEachSchemaChild(
      schema,

      (child) => {
        if (typeof child === "boolean") {
          return;
        }

        visit(child, resource, false);
      },
    );
  }

  visit(root, undefined, true);

  return {
    nodeResources,
    resourcesByUri,
  };
}

function createRootResource(
  root: Record<string, unknown>,

  id: unknown,

  synthetic: boolean,
): SchemaResource {
  if (id === undefined) {
    return {
      root,

      uri: undefined,

      trustedExternalBase: false,

      fragments: new Set(),
    };
  }

  if (typeof id !== "string") {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_RESOURCE_ID_INVALID",

      'Schema root "$id" must be a string.',
    );
  }

  const uri = canonicalAbsoluteResourceId(id, 'Schema root "$id"');

  return {
    root,

    uri,

    trustedExternalBase: !synthetic,

    fragments: new Set(),
  };
}

function createNestedResource(
  root: Record<string, unknown>,

  id: string,

  parent: SchemaResource,
): SchemaResource {
  let uri: string;

  let trustedExternalBase: boolean;

  if (isAbsoluteUri(id)) {
    uri = canonicalAbsoluteResourceId(id, 'Schema "$id"');

    trustedExternalBase = true;
  } else {
    if (parent.uri === undefined) {
      throw new SchemaResourceError(
        "OPENAPI_SCHEMA_RESOURCE_ID_INVALID",

        `Relative schema resource id "${id}" has no base URI.`,
      );
    }

    uri = resolveResourceId(id, parent.uri);

    trustedExternalBase = parent.trustedExternalBase;
  }

  return {
    root,

    uri,

    trustedExternalBase,

    fragments: new Set(),
  };
}

function registerResource(
  resource: SchemaResource,

  resourcesByUri: Map<string, SchemaResource>,
): void {
  if (resource.uri === undefined) {
    return;
  }

  const existing = resourcesByUri.get(resource.uri);

  if (existing !== undefined && existing !== resource) {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_RESOURCE_ID_COLLISION",

      `Multiple schema resources resolve to "${resource.uri}".`,
    );
  }

  resourcesByUri.set(resource.uri, resource);
}

function registerAnchor(
  schema: Record<string, unknown>,

  keyword: "$anchor" | "$dynamicAnchor",

  resource: SchemaResource,
): void {
  const value = schema[keyword];

  if (value === undefined) {
    return;
  }

  if (typeof value !== "string" || !ANCHOR_PATTERN.test(value)) {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_ANCHOR_INVALID",

      `${keyword} must be a valid JSON Schema anchor name.`,
    );
  }

  if (resource.fragments.has(value)) {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_ANCHOR_INVALID",

      `Schema resource defines fragment "${value}" more than once.`,
    );
  }

  resource.fragments.add(value);
}

function validateReferences(
  root: Record<string, unknown>,

  graph: ResourceGraph,
): void {
  const visited = new WeakSet<object>();

  visitSchemaTree(
    root,

    (schema) => {
      const resource = graph.nodeResources.get(schema);

      if (resource === undefined) {
        throw new Error("Missing schema resource mapping");
      }

      validateReferenceKeyword(schema, "$ref", resource, graph);

      validateReferenceKeyword(schema, "$dynamicRef", resource, graph);
    },

    visited,
  );
}

function validateReferenceKeyword(
  schema: Record<string, unknown>,

  keyword: "$ref" | "$dynamicRef",

  source: SchemaResource,

  graph: ResourceGraph,
): void {
  const value = schema[keyword];

  if (value === undefined) {
    return;
  }

  if (typeof value !== "string") {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_REFERENCE_INVALID",

      `${keyword} must be a URI-reference string.`,
    );
  }

  const resolved = resolveReference(value, source);

  const target = graph.resourcesByUri.get(resolved.resourceUri);

  if (target !== undefined) {
    validateEmbeddedFragment(resolved.fragment, target, value);

    return;
  }

  /*
   * Absolute external references are preserved.
   * We never fetch them.
   */
  if (resolved.originallyAbsolute) {
    return;
  }

  /*
   * A relative external reference is only safe if
   * its base originates from an explicit schema id.
   *
   * Synthetic ids exist to keep embedded/local
   * resources coherent, not to invent locations for
   * missing external documents.
   */
  if (source.trustedExternalBase) {
    return;
  }

  throw new SchemaResourceError(
    "OPENAPI_SCHEMA_REFERENCE_UNRESOLVABLE",

    `Relative schema reference "${value}" does not resolve to an embedded resource and has no explicit external base URI.`,
  );
}

function resolveReference(
  reference: string,

  source: SchemaResource,
): {
  readonly resourceUri: string;

  readonly fragment: string;

  readonly originallyAbsolute: boolean;
} {
  const absolute = tryAbsoluteUrl(reference);

  if (absolute !== undefined) {
    const fragment = absolute.hash.startsWith("#") ? absolute.hash.slice(1) : "";

    absolute.hash = "";

    return {
      resourceUri: absolute.href,

      fragment,

      originallyAbsolute: true,
    };
  }

  if (source.uri === undefined) {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_REFERENCE_UNRESOLVABLE",

      `Relative schema reference "${reference}" has no base URI.`,
    );
  }

  let resolved: URL;

  try {
    resolved = new URL(reference, source.uri);
  } catch {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_REFERENCE_INVALID",

      `Schema reference "${reference}" cannot be resolved against "${source.uri}".`,
    );
  }

  const fragment = resolved.hash.startsWith("#") ? resolved.hash.slice(1) : "";

  resolved.hash = "";

  return {
    resourceUri: resolved.href,

    fragment,

    originallyAbsolute: false,
  };
}

function validateEmbeddedFragment(
  rawFragment: string,

  target: SchemaResource,

  reference: string,
): void {
  if (rawFragment === "") {
    return;
  }

  let fragment: string;

  try {
    fragment = decodeURIComponent(rawFragment);
  } catch {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_REFERENCE_INVALID",

      `Schema reference "${reference}" contains an invalid URI fragment.`,
    );
  }

  if (fragment.startsWith("/")) {
    if (!jsonPointerExists(target.root, fragment)) {
      throw new SchemaResourceError(
        "OPENAPI_SCHEMA_REFERENCE_UNRESOLVABLE",

        `Schema reference "${reference}" points to a missing JSON Pointer target.`,
      );
    }

    return;
  }

  if (!target.fragments.has(fragment)) {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_REFERENCE_UNRESOLVABLE",

      `Schema reference "${reference}" points to an unknown anchor "${fragment}".`,
    );
  }
}

function jsonPointerExists(
  root: unknown,

  pointer: string,
): boolean {
  let current = root;

  const segments = pointer.slice(1).split("/");

  for (const rawSegment of segments) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");

    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(segment)) {
        return false;
      }

      const index = Number(segment);

      if (index >= current.length) {
        return false;
      }

      current = current[index];

      continue;
    }

    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return false;
    }

    current = current[segment];
  }

  return true;
}

function validateDialect(schema: Record<string, unknown>): void {
  const dialect = schema["$schema"];

  if (dialect !== undefined && typeof dialect !== "string") {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_RESOURCE_ID_INVALID",

      '"$schema" must be a URI string when present.',
    );
  }
}

function validateAbsoluteResourceId(
  value: string,

  label: string,
): void {
  canonicalAbsoluteResourceId(value, label);
}

function canonicalAbsoluteResourceId(
  value: string,

  label: string,
): string {
  const parsed = tryAbsoluteUrl(value);

  if (parsed === undefined) {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_RESOURCE_ID_INVALID",

      `${label} must resolve to an absolute URI.`,
    );
  }

  if (parsed.hash !== "") {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_RESOURCE_ID_INVALID",

      `${label} must not contain a non-empty fragment.`,
    );
  }

  parsed.hash = "";

  return parsed.href;
}

function resolveResourceId(
  value: string,

  base: string,
): string {
  let parsed: URL;

  try {
    parsed = new URL(value, base);
  } catch {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_RESOURCE_ID_INVALID",

      `Schema resource id "${value}" cannot be resolved against "${base}".`,
    );
  }

  if (parsed.hash !== "") {
    throw new SchemaResourceError(
      "OPENAPI_SCHEMA_RESOURCE_ID_INVALID",

      `Schema resource id "${value}" must not resolve to a non-empty fragment.`,
    );
  }

  parsed.hash = "";

  return parsed.href;
}

function isAbsoluteUri(value: string): boolean {
  return tryAbsoluteUrl(value) !== undefined;
}

function tryAbsoluteUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function visitSchemaTree(
  root: Record<string, unknown>,

  visitor: (
    schema: Record<string, unknown>,

    isRoot: boolean,
  ) => void,

  visited: WeakSet<object>,
): void {
  function visit(
    schema: Record<string, unknown>,

    isRoot: boolean,
  ): void {
    if (visited.has(schema)) {
      return;
    }

    visited.add(schema);

    visitor(schema, isRoot);

    forEachSchemaChild(
      schema,

      (child) => {
        if (typeof child !== "boolean") {
          visit(child, false);
        }
      },
    );
  }

  visit(root, true);
}

function forEachSchemaChild(
  schema: Record<string, unknown>,

  visitor: (schema: ResolvedJSONSchema) => void,
): void {
  for (const keyword of SINGLE_SCHEMA_KEYWORDS) {
    const value = schema[keyword];

    if (isSchemaValue(value)) {
      visitor(value);
    }
  }

  for (const keyword of ARRAY_SCHEMA_KEYWORDS) {
    const value = schema[keyword];

    if (!Array.isArray(value)) {
      continue;
    }

    for (const child of value) {
      if (isSchemaValue(child)) {
        visitor(child);
      }
    }
  }

  for (const keyword of MAP_SCHEMA_KEYWORDS) {
    const value = schema[keyword];

    if (!isRecord(value)) {
      continue;
    }

    for (const child of Object.values(value)) {
      if (isSchemaValue(child)) {
        visitor(child);
      }
    }
  }
}

function isSchemaValue(value: unknown): value is ResolvedJSONSchema {
  return typeof value === "boolean" || isRecord(value);
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(value);

  if (!isRecord(clone)) {
    throw new TypeError("Failed to clone JSON Schema resource.");
  }

  return clone;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

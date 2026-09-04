import { describe, expect, test } from "bun:test";

import { prepareSchemaResource, SchemaResourceError } from "../../src/schema-resource";

describe("OpenAPI JSON Schema resources", () => {
  test("preserves detached simple schemas without inventing resource identity", () => {
    const source = {
      type: "object",

      properties: {
        name: {
          type: "string",
        },

        tags: {
          type: "array",

          items: {
            type: "string",
          },
        },
      },

      required: ["name"],
    };

    const prepared = prepareSchemaResource(
      source,

      "https://schemas.gelis.invalid/test/simple",
    );

    expect(prepared).toEqual(source);

    expect(prepared).not.toBe(source);

    expect((prepared as Record<string, unknown>)["$id"]).toBeUndefined();

    if (typeof prepared !== "object" || prepared === null) {
      throw new Error("Expected prepared object schema.");
    }

    expect(prepared["properties"]).not.toBe(source.properties);
  });

  test("validates dialect keywords on the simple resource fast path", () => {
    try {
      prepareSchemaResource(
        {
          $schema: 42,

          type: "object",

          properties: {
            value: {
              type: "string",
            },
          },
        },

        "https://schemas.gelis.invalid/test/simple",
      );

      throw new Error("Expected dialect failure");
    } catch (cause) {
      expect(cause).toBeInstanceOf(SchemaResourceError);

      if (!(cause instanceof SchemaResourceError)) {
        throw cause;
      }

      expect(cause.code).toBe("OPENAPI_SCHEMA_RESOURCE_ID_INVALID");
    }
  });

  test("preserves recursive local refs and adds a deterministic synthetic resource id", () => {
    const source = {
      $defs: {
        node: {
          type: "object",

          properties: {
            next: {
              $ref: "#/$defs/node",
            },
          },
        },
      },

      $ref: "#/$defs/node",
    };

    const prepared = prepareSchemaResource(
      source,

      "https://schemas.gelis.invalid/test/recursive",
    );

    expect(source).toEqual({
      $defs: {
        node: {
          type: "object",

          properties: {
            next: {
              $ref: "#/$defs/node",
            },
          },
        },
      },

      $ref: "#/$defs/node",
    });

    expect(prepared).toEqual({
      $defs: {
        node: {
          type: "object",

          properties: {
            next: {
              $ref: "#/$defs/node",
            },
          },
        },
      },

      $ref: "#/$defs/node",

      $id: "https://schemas.gelis.invalid/test/recursive",
    });
  });

  test("preserves explicit ids dialects anchors and dynamic recursion", () => {
    const source = {
      $schema: "https://json-schema.org/draft/2020-12/schema",

      $id: "https://example.com/tree",

      $dynamicAnchor: "node",

      type: "object",

      properties: {
        children: {
          type: "array",

          items: {
            $dynamicRef: "#node",
          },
        },
      },

      $defs: {
        label: {
          $anchor: "label",

          type: "string",
        },
      },
    };

    const prepared = prepareSchemaResource(
      source,

      "https://schemas.gelis.invalid/unused",
    );

    expect(prepared).toEqual(source);

    expect(prepared).not.toBe(source);
  });

  test("supports bundled relative schema resources under a synthetic base", () => {
    const source = {
      $ref: "child.json#child",

      $defs: {
        child: {
          $id: "child.json",

          $anchor: "child",

          type: "string",
        },
      },
    };

    const prepared = prepareSchemaResource(
      source,

      "https://schemas.gelis.invalid/test/root.json",
    );

    expect(prepared).toEqual({
      $ref: "child.json#child",

      $defs: {
        child: {
          $id: "child.json",

          $anchor: "child",

          type: "string",
        },
      },

      $id: "https://schemas.gelis.invalid/test/root.json",
    });
  });

  test("rejects unbundled relative external references when only a synthetic base exists", () => {
    try {
      prepareSchemaResource(
        {
          $ref: "other.json",
        },

        "https://schemas.gelis.invalid/test/root.json",
      );

      throw new Error("Expected reference failure");
    } catch (cause) {
      expect(cause).toBeInstanceOf(SchemaResourceError);

      if (!(cause instanceof SchemaResourceError)) {
        throw cause;
      }

      expect(cause.code).toBe("OPENAPI_SCHEMA_REFERENCE_UNRESOLVABLE");
    }
  });

  test("preserves relative external references when an explicit absolute base exists", () => {
    const source = {
      $id: "https://example.com/root.json",

      $ref: "other.json",
    };

    const prepared = prepareSchemaResource(
      source,

      "https://schemas.gelis.invalid/unused",
    );

    expect(prepared).toEqual(source);
  });

  test("rejects duplicate anchor identities inside one resource", () => {
    try {
      prepareSchemaResource(
        {
          $id: "https://example.com/root.json",

          $anchor: "same",

          $defs: {
            child: {
              $dynamicAnchor: "same",

              type: "string",
            },
          },
        },

        "https://schemas.gelis.invalid/unused",
      );

      throw new Error("Expected anchor failure");
    } catch (cause) {
      expect(cause).toBeInstanceOf(SchemaResourceError);

      if (!(cause instanceof SchemaResourceError)) {
        throw cause;
      }

      expect(cause.code).toBe("OPENAPI_SCHEMA_ANCHOR_INVALID");
    }
  });
});

import { describe, expect, test } from "bun:test";

import { createOpenAPIRoot } from "../../src/document";

import { OPENAPI_JSON_SCHEMA_DIALECT, OPENAPI_VERSION } from "../../src";

import type { OpenAPIGenerationOptions } from "../../src";

describe("OpenAPI root document", () => {
  test("creates an exact OpenAPI 3.1.2 root with the 2020-12 dialect", () => {
    const document = createOpenAPIRoot({
      info: {
        title: "Gelis API",

        version: "1.0.0",
      },
    });

    expect(document).toEqual({
      openapi: "3.1.2",

      jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",

      info: {
        title: "Gelis API",

        version: "1.0.0",
      },

      paths: {},
    });

    expect(document.openapi).toBe(OPENAPI_VERSION);

    expect(document.jsonSchemaDialect).toBe(OPENAPI_JSON_SCHEMA_DIALECT);
  });

  test("copies root options into detached caller-owned document state", () => {
    const info = {
      title: "Gelis API",

      version: "1.0.0",

      description: "Original description",
    };

    const servers = [
      {
        url: "https://api.example.com",

        description: "Primary",
      },
    ];

    const tags = [
      {
        name: "Users",

        description: "User operations",
      },
    ];

    const options = {
      info,
      servers,
      tags,
    } satisfies OpenAPIGenerationOptions;

    const document = createOpenAPIRoot(options);

    expect(document.info).not.toBe(info);

    expect(document.servers).not.toBe(servers);

    expect(document.servers?.[0]).not.toBe(servers[0]);

    expect(document.tags).not.toBe(tags);

    expect(document.tags?.[0]).not.toBe(tags[0]);

    info.title = "Changed input";

    servers[0]!.url = "https://changed.example.com";

    tags[0]!.name = "Changed";

    expect(document.info.title).toBe("Gelis API");

    expect(document.servers?.[0]?.url).toBe("https://api.example.com");

    expect(document.tags?.[0]?.name).toBe("Users");

    /*
     * Generated documents themselves are
     * deliberately mutable.
     */
    document.info.title = "Caller-owned";

    document.paths["/health"] = {};

    expect(document.info.title).toBe("Caller-owned");

    expect(document.paths["/health"]).toEqual({});
  });

  test("returns fresh document state on every construction", () => {
    const options = {
      info: {
        title: "Gelis API",

        version: "1.0.0",
      },

      servers: [
        {
          url: "https://api.example.com",
        },
      ],

      tags: [
        {
          name: "Users",
        },
      ],
    } satisfies OpenAPIGenerationOptions;

    const first = createOpenAPIRoot(options);

    const second = createOpenAPIRoot(options);

    expect(first).not.toBe(second);

    expect(first.info).not.toBe(second.info);

    expect(first.paths).not.toBe(second.paths);

    expect(first.servers).not.toBe(second.servers);

    expect(first.servers?.[0]).not.toBe(second.servers?.[0]);

    expect(first.tags).not.toBe(second.tags);

    expect(first.tags?.[0]).not.toBe(second.tags?.[0]);

    first.paths["/first-only"] = {};

    expect(second.paths["/first-only"]).toBeUndefined();
  });

  test("omits optional root arrays when they are absent", () => {
    const document = createOpenAPIRoot({
      info: {
        title: "Minimal",

        version: "0.1.0",
      },
    });

    expect("servers" in document).toBe(false);

    expect("tags" in document).toBe(false);
  });
});

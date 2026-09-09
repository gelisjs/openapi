import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "gelis";

import {
  generateOpenAPI,
  OpenAPIGenerationError,
  OPENAPI_VERSION_3_2,
} from "../../src";

import { projectPaths } from "../../src/path";

describe("post-P9 OpenAPI method projection", () => {
  test("keeps OpenAPI 3.1.2 as the default and allows explicit 3.2.0", () => {
    const app = new Gelis();

    app.get(
      "/health",
      {
        responses: {
          204: undefined,
        },
      },
      () => new Response(null, { status: 204 }),
    );

    const defaultDocument = generateOpenAPI(app, {
      info: {
        title: "Gelis API",
        version: "1.0.0",
      },
    });

    const fullFidelityDocument = generateOpenAPI(app, {
      version: OPENAPI_VERSION_3_2,
      info: {
        title: "Gelis API",
        version: "1.0.0",
      },
    });

    expect(defaultDocument.openapi).toBe("3.1.2");
    expect(fullFidelityDocument.openapi).toBe("3.2.0");

    expect(defaultDocument.paths).toEqual(fullFidelityDocument.paths);
  });

  test("encodes QUERY and custom methods through the version-specific method surface", () => {
    const app = new Gelis();

    app.query(
      "/resource",
      {
        responses: {
          204: undefined,
        },
        openapi: {
          operationId: "queryResource",
        },
      },
      () => new Response(null, { status: 204 }),
    );

    app.route(
      "PURGE",
      "/resource",
      {
        responses: {
          204: undefined,
        },
        openapi: {
          operationId: "purgeResource",
        },
      },
      () => new Response(null, { status: 204 }),
    );

    const compatibility = projectPaths(inspectContract(app));
    const fullFidelity = projectPaths(
      inspectContract(app),
      OPENAPI_VERSION_3_2,
    );

    expect(compatibility.issues).toEqual([]);
    expect(fullFidelity.issues).toEqual([]);

    const compatibilityPath = compatibility.paths["/resource"];
    const fullFidelityPath = fullFidelity.paths["/resource"];

    expect(compatibilityPath?.query).toBeUndefined();
    expect(compatibilityPath?.additionalOperations).toBeUndefined();
    expect(
      Object.keys(compatibilityPath?.["x-oai-additionalOperations"] ?? {}),
    ).toEqual(["QUERY", "PURGE"]);

    expect(fullFidelityPath?.["x-oai-additionalOperations"]).toBeUndefined();
    expect(fullFidelityPath?.query?.operationId).toBe("queryResource");
    expect(Object.keys(fullFidelityPath?.additionalOperations ?? {})).toEqual([
      "PURGE",
    ]);

    expect(
      compatibilityPath?.["x-oai-additionalOperations"]?.QUERY,
    ).toEqual(fullFidelityPath?.query);
    expect(
      compatibilityPath?.["x-oai-additionalOperations"]?.PURGE,
    ).toEqual(fullFidelityPath?.additionalOperations?.PURGE);
  });

  test("preserves custom method identity and deterministic additional-operation order", () => {
    const app = new Gelis();

    for (const method of ["Z-INVALIDATION", "MiXeD-Gelis", "PURGE"] as const) {
      app.route(
        method,
        "/cache",
        {
          responses: {
            204: undefined,
          },
        },
        () => new Response(null, { status: 204 }),
      );
    }

    const compatibility = projectPaths(inspectContract(app));
    const fullFidelity = projectPaths(
      inspectContract(app),
      OPENAPI_VERSION_3_2,
    );

    expect(compatibility.issues).toEqual([]);
    expect(fullFidelity.issues).toEqual([]);

    expect(
      Object.keys(
        compatibility.paths["/cache"]?.["x-oai-additionalOperations"] ?? {},
      ),
    ).toEqual(["MiXeD-Gelis", "PURGE", "Z-INVALIDATION"]);

    expect(
      Object.keys(fullFidelity.paths["/cache"]?.additionalOperations ?? {}),
    ).toEqual(["MiXeD-Gelis", "PURGE", "Z-INVALIDATION"]);
  });

  test("treats wire method ALL as a custom method but rejects app.all pseudo-method projection", () => {
    const wireMethodApp = new Gelis();

    wireMethodApp.route(
      "ALL",
      "/wire-all",
      {
        responses: {
          204: undefined,
        },
      },
      () => new Response(null, { status: 204 }),
    );

    const wireProjection = projectPaths(
      inspectContract(wireMethodApp),
      OPENAPI_VERSION_3_2,
    );

    expect(wireProjection.issues).toEqual([]);
    expect(
      Object.keys(
        wireProjection.paths["/wire-all"]?.additionalOperations ?? {},
      ),
    ).toEqual(["ALL"]);

    const pseudoMethodApp = new Gelis();

    pseudoMethodApp.all(
      "/fallback",
      {
        responses: {
          204: undefined,
        },
      },
      () => new Response(null, { status: 204 }),
    );

    expect(() =>
      generateOpenAPI(pseudoMethodApp, {
        info: {
          title: "Invalid API",
          version: "1.0.0",
        },
      }),
    ).toThrow(OpenAPIGenerationError);

    try {
      generateOpenAPI(pseudoMethodApp, {
        info: {
          title: "Invalid API",
          version: "1.0.0",
        },
      });
    } catch (cause) {
      if (!(cause instanceof OpenAPIGenerationError)) {
        throw cause;
      }

      expect(cause.issues).toEqual([
        {
          code: "OPENAPI_ALL_METHOD_UNREPRESENTABLE",
          method: "*",
          path: "/fallback",
          location: "method",
          message:
            "Gelis ALL route /fallback cannot be represented as one OpenAPI operation. Exclude it with openapi:false or document concrete operations explicitly.",
        },
      ]);
    }
  });

  test("excludes hidden ALL routes and detects operationId collisions across expanded methods", () => {
    const hiddenApp = new Gelis();

    hiddenApp.all(
      "/fallback",
      {
        openapi: false,
      },
      () => "hidden",
    );

    const hidden = projectPaths(inspectContract(hiddenApp));

    expect(hidden.issues).toEqual([]);
    expect(hidden.paths).toEqual({});

    const collisionApp = new Gelis();

    collisionApp.query(
      "/shared",
      {
        responses: {
          204: undefined,
        },
        openapi: {
          operationId: "duplicateOperation",
        },
      },
      () => new Response(null, { status: 204 }),
    );

    collisionApp.route(
      "PURGE",
      "/shared",
      {
        responses: {
          204: undefined,
        },
        openapi: {
          operationId: "duplicateOperation",
        },
      },
      () => new Response(null, { status: 204 }),
    );

    const collision = projectPaths(
      inspectContract(collisionApp),
      OPENAPI_VERSION_3_2,
    );

    expect(collision.issues).toEqual([
      {
        code: "OPENAPI_OPERATION_ID_DUPLICATE",
        method: "PURGE",
        path: "/shared",
        location: "operationId",
        message:
          'OpenAPI operationId "duplicateOperation" on PURGE /shared is already used by QUERY /shared.',
      },
    ]);
  });
});

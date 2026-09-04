import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "gelis";

import { projectPaths } from "../../src/path";

describe("OpenAPI operation and path metadata", () => {
  test("projects operation metadata and path parameter patches", () => {
    const app = new Gelis();

    const tags = ["users", "admin"];

    app.get(
      "/users/:id",

      {
        openapi: {
          summary: "Get user",

          description: "Returns one user.",

          operationId: "getUser",

          tags,

          deprecated: true,

          request: {
            params: {
              id: {
                description: "User identifier",

                deprecated: false,

                schema: {
                  $defs: {
                    id: {
                      type: "string",
                    },
                  },

                  $ref: "#/$defs/id",
                },
              },
            },
          },
        },
      },

      () => "user",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([]);

    const operation = result.paths["/users/{id}"]?.get;

    expect(operation?.summary).toBe("Get user");

    expect(operation?.description).toBe("Returns one user.");

    expect(operation?.operationId).toBe("getUser");

    expect(operation?.deprecated).toBe(true);

    expect(operation?.tags).toEqual(["users", "admin"]);

    expect(operation?.tags).not.toBe(tags);

    expect(operation?.parameters).toEqual([
      {
        name: "id",

        in: "path",

        required: true,

        description: "User identifier",

        deprecated: false,

        schema: {
          $defs: {
            id: {
              type: "string",
            },
          },

          $ref: "#/$defs/id",

          $id: "https://schemas.gelis.invalid/openapi/get/%2Fusers%2F%3Aid/request/path/id",
        },
      },
    ]);
  });

  test("reports metadata for path parameters that do not exist", () => {
    const app = new Gelis();

    app.get(
      "/users/:id",

      {
        openapi: {
          request: {
            params: {
              missing: {
                description: "Not real",
              },
            },
          },
        },
      },

      () => "user",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([
      {
        code: "OPENAPI_PATH_PARAMETER_UNKNOWN",

        method: "GET",

        path: "/users/:id",

        location: "request.params.missing",

        message: 'OpenAPI path metadata references unknown path parameter "missing" on GET /users/:id.',
      },
    ]);
  });

  test("reports duplicate operation ids globally", () => {
    const app = new Gelis();

    app.get(
      "/a",

      {
        openapi: {
          operationId: "sharedOperation",
        },
      },

      () => "a",
    );

    app.post(
      "/b",

      {
        openapi: {
          operationId: "sharedOperation",
        },
      },

      () => "b",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([
      {
        code: "OPENAPI_OPERATION_ID_DUPLICATE",

        method: "POST",

        path: "/b",

        location: "operationId",

        message: 'OpenAPI operationId "sharedOperation" on POST /b is already used by GET /a.',
      },
    ]);

    expect(result.paths["/a"]?.get?.operationId).toBe("sharedOperation");

    expect(result.paths["/b"]?.post?.operationId).toBe("sharedOperation");
  });
});

import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "gelis";

import { projectPaths } from "../../src/path";

describe("OpenAPI path projection", () => {
  test("projects Gelis paths and required path parameters deterministically", () => {
    const app = new Gelis();

    app.post(
      "/z/:id",

      () => "z",
    );

    app.get(
      "/users/:userId/posts/:postId",

      () => "post",
    );

    app.get(
      "/health",

      () => "healthy",
    );

    app.delete(
      "/users/:id",

      () => "deleted",
    );

    app.get(
      "/users/:id",

      () => "user",
    );

    app.get(
      "/hidden/:id",

      {
        openapi: false,
      },

      () => "hidden",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([]);

    expect(Object.keys(result.paths)).toEqual(["/health", "/users/{id}", "/users/{userId}/posts/{postId}", "/z/{id}"]);

    expect(Object.keys(result.paths["/users/{id}"] ?? {})).toEqual(["get", "delete"]);

    expect(result.paths["/users/{id}"]?.get?.parameters).toEqual([
      {
        name: "id",

        in: "path",

        required: true,

        schema: {
          type: "string",
        },
      },
    ]);

    expect(result.paths["/users/{userId}/posts/{postId}"]?.get?.parameters).toEqual([
      {
        name: "userId",

        in: "path",

        required: true,

        schema: {
          type: "string",
        },
      },

      {
        name: "postId",

        in: "path",

        required: true,

        schema: {
          type: "string",
        },
      },
    ]);

    expect(result.paths["/hidden/{id}"]).toBeUndefined();
  });

  test("merges methods sharing the same Gelis path in OpenAPI method order", () => {
    const app = new Gelis();

    app.delete(
      "/items/:id",

      () => "delete",
    );

    app.post(
      "/items/:id",

      () => "post",
    );

    app.get(
      "/items/:id",

      () => "get",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([]);

    expect(Object.keys(result.paths["/items/{id}"] ?? {})).toEqual(["get", "post", "delete"]);
  });

  test("reports conflicting equivalent OpenAPI path templates", () => {
    const app = new Gelis();

    app.get(
      "/users/:id",

      () => "by id",
    );

    app.post(
      "/users/:name",

      () => "by name",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toHaveLength(1);

    expect(result.issues[0]).toEqual({
      code: "OPENAPI_PATH_TEMPLATE_COLLISION",

      method: "POST",

      path: "/users/:name",

      location: "path",

      message: 'Route "/users/:name" conflicts with "/users/:id" after OpenAPI path-template projection.',
    });

    expect(Object.keys(result.paths)).toEqual(["/users/{id}"]);
  });

  test("does not let an OpenAPI-excluded route participate in template collisions", () => {
    const app = new Gelis();

    app.get(
      "/users/:id",

      () => "visible",
    );

    app.post(
      "/users/:name",

      {
        openapi: false,
      },

      () => "hidden",
    );

    const result = projectPaths(inspectContract(app));

    expect(result.issues).toEqual([]);

    expect(Object.keys(result.paths)).toEqual(["/users/{id}"]);
  });
});

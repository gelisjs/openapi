import { describe, expect, test } from "bun:test";

import { OpenAPIGenerationError } from "../../src";

import type { OpenAPIGenerationIssue } from "../../src";

describe("OpenAPI generation errors", () => {
  test("aggregates generation issues into one public error", () => {
    const cause = new Error("converter failed");

    const issues: OpenAPIGenerationIssue[] = [
      {
        code: "TEST_REQUEST_SCHEMA",

        method: "POST",

        path: "/users",

        location: "request.body",

        message: "Unable to project request schema.",

        cause,
      },

      {
        code: "TEST_RESPONSE_SCHEMA",

        method: "GET",

        path: "/users/:id",

        location: "responses.200",

        status: 200,

        message: "Unable to project response schema.",
      },
    ];

    const error = new OpenAPIGenerationError(issues);

    expect(error).toBeInstanceOf(Error);

    expect(error).toBeInstanceOf(OpenAPIGenerationError);

    expect(error.name).toBe("OpenAPIGenerationError");

    expect(error.message).toBe("OpenAPI generation failed with 2 issues.");

    expect(error.issues).toHaveLength(2);

    expect(error.issues).not.toBe(issues);

    expect(error.issues[0]).not.toBe(issues[0]);

    expect(error.issues[0]?.cause).toBe(cause);

    expect(error.issues[1]?.status).toBe(200);
  });

  test("copies issue containers from caller-owned input", () => {
    const issue = {
      code: "TEST",

      location: "paths./users",

      message: "Original",
    };

    const error = new OpenAPIGenerationError([issue]);

    issue.message = "Changed";

    expect(error.issues[0]?.message).toBe("Original");

    expect(error.message).toBe("OpenAPI generation failed with 1 issue.");
  });

  test("supports default response issue status", () => {
    const error = new OpenAPIGenerationError([
      {
        code: "TEST_DEFAULT",

        method: "GET",

        path: "/users",

        location: "responses.default",

        status: "default",

        message: "Default response failed.",
      },
    ]);

    expect(error.issues[0]?.status).toBe("default");
  });
});

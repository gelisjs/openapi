import type { OpenAPIGenerationIssue } from "./types";

export class OpenAPIGenerationError extends Error {
  readonly issues: readonly OpenAPIGenerationIssue[];

  constructor(issues: readonly OpenAPIGenerationIssue[]) {
    const copiedIssues = issues.map((issue) => ({
      ...issue,
    }));

    const count = copiedIssues.length;

    super(`OpenAPI generation failed with ${count} ${count === 1 ? "issue" : "issues"}.`);

    this.name = "OpenAPIGenerationError";

    this.issues = copiedIssues;
  }
}

import { inspectContract } from "gelis";

import type { Gelis } from "gelis";

import { createOpenAPIRoot } from "./document";

import { OpenAPIGenerationError } from "./errors";

import { projectPaths } from "./path";

import { OPENAPI_VERSION } from "./types";

import type { OpenAPIDocument, OpenAPIGenerationOptions } from "./types";

export function generateOpenAPI(
  app: Gelis,

  options: OpenAPIGenerationOptions,
): OpenAPIDocument {
  /*
   * Every generation receives a fresh contract snapshot and a fresh
   * projection resolver. Version selection is tooling-only state.
   */
  const version = options.version ?? OPENAPI_VERSION;
  const projection = projectPaths(inspectContract(app), version);

  /*
   * Projection deliberately collects all route problems before this
   * boundary. Public callers receive either one complete document or
   * one aggregate generation error, never a partial public document.
   */
  if (projection.issues.length > 0) {
    throw new OpenAPIGenerationError(projection.issues);
  }

  const document = createOpenAPIRoot(options);

  /*
   * projectPaths() already returns fresh caller-owned occurrence state.
   */
  document.paths = projection.paths;

  return document;
}

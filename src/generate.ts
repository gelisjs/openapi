import { inspectContract } from "gelis";

import type { Gelis } from "gelis";

import { createOpenAPIRoot } from "./document";

import { OpenAPIGenerationError } from "./errors";

import { projectPaths } from "./path";

import type { OpenAPIDocument, OpenAPIGenerationOptions } from "./types";

export function generateOpenAPI(
  app: Gelis,

  options: OpenAPIGenerationOptions,
): OpenAPIDocument {
  /*
   * Every generation receives a fresh contract
   * snapshot and a fresh projection resolver.
   *
   * No generated document or schema conversion cache
   * survives across generateOpenAPI() calls.
   */
  const projection = projectPaths(inspectContract(app));

  /*
   * Projection deliberately collects all route
   * problems before this boundary. Public callers
   * either receive one complete document or one
   * aggregate generation error, never a partial
   * document.
   */
  if (projection.issues.length > 0) {
    throw new OpenAPIGenerationError(projection.issues);
  }

  const document = createOpenAPIRoot(options);

  /*
   * projectPaths() already returns fresh,
   * caller-owned occurrence state. Assign it directly
   * rather than introducing another document-wide
   * clone after the projection pipeline.
   */
  document.paths = projection.paths;

  return document;
}

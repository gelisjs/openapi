import { OPENAPI_JSON_SCHEMA_DIALECT, OPENAPI_VERSION } from "./types";

import type {
  OpenAPIDocument,
  OpenAPIGenerationOptions,
  OpenAPIInfoObject,
  OpenAPIServerObject,
  OpenAPITagObject,
} from "./types";

/*
 * Internal root-document constructor.
 *
 * It intentionally is not exported from the
 * package root. generateOpenAPI() will become
 * the public construction API.
 */
export function createOpenAPIRoot(options: OpenAPIGenerationOptions): OpenAPIDocument {
  const servers = options.servers;

  const tags = options.tags;

  return {
    openapi: OPENAPI_VERSION,

    jsonSchemaDialect: OPENAPI_JSON_SCHEMA_DIALECT,

    info: cloneInfo(options.info),

    paths: {},

    ...(servers === undefined
      ? {}
      : {
          servers: servers.map(cloneServer),
        }),

    ...(tags === undefined
      ? {}
      : {
          tags: tags.map(cloneTag),
        }),
  };
}

function cloneInfo(info: Readonly<OpenAPIInfoObject>): OpenAPIInfoObject {
  return {
    ...info,
  };
}

function cloneServer(server: Readonly<OpenAPIServerObject>): OpenAPIServerObject {
  return {
    ...server,
  };
}

function cloneTag(tag: Readonly<OpenAPITagObject>): OpenAPITagObject {
  return {
    ...tag,
  };
}

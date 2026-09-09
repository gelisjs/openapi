# @gelis/openapi

Official OpenAPI contract generation for Gelis.

> Pre-release: the package API is accepted for the current Gelis v0.1 development line, but `@gelis/openapi` has not been published to npm yet.

`@gelis/openapi` consumes Gelis application contract snapshots and generates deterministic OpenAPI documents without adding OpenAPI work to the request hot path.

## Supported output

```text
OpenAPI 3.1.2  compatibility default
OpenAPI 3.2.0  explicit full-fidelity mode
JSON Schema     draft 2020-12
```

OpenAPI 3.1.2 remains the default so existing tooling can keep using the compatibility output. OpenAPI 3.2.0 is available when native `QUERY` and additional HTTP-operation representation is required.

## Basic generation

```ts
import { generateOpenAPI } from "@gelis/openapi";

const document = generateOpenAPI(app, {
  info: {
    title: "Example API",
    version: "1.0.0",
  },
});
```

The default document version is `3.1.2`.

For OpenAPI 3.2:

```ts
const document = generateOpenAPI(app, {
  version: "3.2.0",
  info: {
    title: "Example API",
    version: "1.0.0",
  },
});
```

Optional root metadata:

```ts
const document = generateOpenAPI(app, {
  version: "3.2.0",
  info: {
    title: "Example API",
    version: "1.0.0",
    description: "Public API",
  },
  servers: [
    {
      url: "https://api.example.com",
      description: "Production",
    },
  ],
  tags: [
    {
      name: "users",
      description: "User operations",
    },
  ],
});
```

## Route metadata

Gelis route metadata supplies documentation that cannot be inferred from runtime schemas alone.

```ts
app.get(
  "/users/:id",
  {
    openapi: {
      summary: "Get a user",
      operationId: "getUser",
      tags: ["users"],
      request: {
        params: {
          id: {
            description: "User identifier",
          },
        },
      },
    },
  },
  ({ params }) => ({ id: params.id }),
);
```

Supported route metadata includes:

```text
summary
description
operationId
tags
deprecated
request.params
request.query
request.body
responses
```

Set `openapi: false` on a route to exclude it from generation.

## QUERY and custom HTTP methods

Standard methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`) are emitted as ordinary OpenAPI Path Item operations.

Post-P9 Gelis methods are version-aware:

```text
Gelis method       OpenAPI 3.2.0            OpenAPI 3.1.2
QUERY              query                    x-oai-additionalOperations.QUERY
custom method      additionalOperations     x-oai-additionalOperations
```

Example:

```ts
app.query("/search", () => new Response());
app.route("PURGE", "/cache/:id", () => new Response());
```

For maximum fidelity of these operations, generate OpenAPI 3.2.0.

### ALL routes

A Gelis `ALL` route represents multiple possible HTTP methods and cannot truthfully map to one OpenAPI operation. Generation therefore fails closed for such a route.

Either exclude it:

```ts
app.all(
  "/fallback",
  {
    openapi: false,
  },
  () => new Response(),
);
```

or document concrete operations separately.

## Request bodies and media types

Managed body documentation follows the Gelis runtime contract rather than inventing documentation-only body semantics.

Default media types:

| `bodyParser` | OpenAPI media type |
| --- | --- |
| `json` / omitted | `application/json` |
| `text` | `text/plain` |
| `urlencoded` | `application/x-www-form-urlencoded` |
| `multipart` | `multipart/form-data` |
| `arrayBuffer` | `application/octet-stream` |

Explicit `bodyContentTypes` replaces the parser default media keys:

```ts
app.post(
  "/items",
  {
    body: ItemSchema,
    bodyParser: "json",
    bodyContentTypes: [
      "application/json",
      "application/vnd.example.item+json",
    ],
  },
  ({ body }) => body,
);
```

For a managed body, OpenAPI projection keeps `required: true` because that is the Gelis runtime contract. Documentation metadata cannot silently override contradictory runtime media admission or requiredness.

`arrayBuffer` is opaque by default. Supply explicit OpenAPI request-body schema metadata when the binary representation needs a documented schema.

## Schema providers

Runtime validation remains a Gelis / Standard Schema concern. Automatic OpenAPI schema projection uses the Standard JSON Schema capability.

The accepted compatibility matrix covers:

- Zod;
- ArkType;
- Valibot (with its Standard JSON Schema adapter).

The OpenAPI package does not inspect private provider internals and does not contain provider-specific reflection adapters.

A schema can therefore be valid for runtime validation while still requiring explicit documentation metadata if it cannot expose a serializable JSON Schema representation.

See [`docs/compatibility-and-projection-v0.1.md`](docs/compatibility-and-projection-v0.1.md) for the detailed projection contract.

## Generation errors

Generation is all-or-error.

```ts
import {
  generateOpenAPI,
  OpenAPIGenerationError,
} from "@gelis/openapi";

try {
  const document = generateOpenAPI(app, {
    info: {
      title: "Example API",
      version: "1.0.0",
    },
  });
} catch (error) {
  if (error instanceof OpenAPIGenerationError) {
    for (const issue of error.issues) {
      console.error(issue.code, issue.method, issue.path, issue.message);
    }
  }

  throw error;
}
```

The public generator does not return a partially valid document when projection issues exist.

## Runtime isolation

`@gelis/openapi` is tooling, not request middleware.

Importing the package does not automatically:

```text
install a Gelis plugin
register lifecycle hooks
wrap app.fetch
create a documentation route
```

`generateOpenAPI()` explicitly inspects the application contract when called. Accepted zero-runtime-overhead benchmarks found no request-time regression beyond the frozen bounds for metadata-only, import-only, or generate-once scenarios.

## Public API

Runtime exports:

```text
generateOpenAPI
OpenAPIGenerationError
OPENAPI_VERSION
OPENAPI_VERSION_3_2
OPENAPI_JSON_SCHEMA_DIALECT
```

Public types:

```text
OpenAPIDocument
OpenAPIGenerationIssue
OpenAPIGenerationOptions
OpenAPIHttpMethod
OpenAPIInfoObject
OpenAPIServerObject
OpenAPITagObject
OpenAPIVersion
```

Internal projection helpers are not public API.

## Development

```bash
bun install --frozen-lockfile
bun run check
```

Generation acceptance benchmark:

```bash
bun run bench:generation:p10-f -- --control-root=<B21-control> --candidate-root=.
```

Zero-runtime-overhead acceptance benchmark:

```bash
bun run bench:runtime:p10-g -- --candidate-root=.
```

## Architecture and engineering evidence

Historical architecture freeze:

```text
docs/architecture-v0.1.md
```

Post-P9 compatibility and projection contract:

```text
docs/compatibility-and-projection-v0.1.md
```

Detailed engineering acceptance records remain under `docs/`.

## Release status

Milestone completion does not mean the package has been released.

Before public publication, release readiness still needs to define and verify package versioning, Gelis compatibility/peer dependency policy, package publication metadata, tagging, and release workflow.

No release or npm publication is performed automatically.

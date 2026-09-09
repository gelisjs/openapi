# P10-H Public API and Documentation Freeze

**Status:** BOUNDARY FROZEN  
**Phase:** P10-H  
**Date:** 2026-09-09  
**Accepted P10-G candidate:** `6e84bd324fb83de228e17c99736deea92e23d070`

## Purpose

P10-H closes OpenAPI & Contract Integration by freezing the public package surface and aligning user-facing documentation with the accepted post-P9 behavior.

This phase does not add request-runtime features.

## Public runtime exports

The v0.1 runtime export surface is exactly:

```text
generateOpenAPI
OpenAPIGenerationError
OPENAPI_VERSION
OPENAPI_VERSION_3_2
OPENAPI_JSON_SCHEMA_DIALECT
```

No internal projection helper is public.

## Public type exports

The v0.1 public type surface is:

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

## Version contract

```text
default / compatibility output: OpenAPI 3.1.2
explicit full-fidelity output: OpenAPI 3.2.0
JSON Schema dialect: draft 2020-12
```

`OPENAPI_VERSION` remains `"3.1.2"`.

`OPENAPI_VERSION_3_2` is `"3.2.0"`.

## Method projection

Standard methods remain standard Path Item operations.

For post-P9 Gelis methods:

```text
OpenAPI 3.2.0
QUERY          -> query
custom methods -> additionalOperations

OpenAPI 3.1.2 compatibility mode
QUERY + custom methods
-> x-oai-additionalOperations
```

Gelis `ALL` (`*`) is intentionally fail-closed because one wildcard Gelis route cannot truthfully be represented as one OpenAPI operation.

Users must either exclude the route with `openapi: false` or document concrete operations separately.

## Request-body contract

Managed Gelis bodies are documented from runtime-owned body semantics.

Parser defaults:

```text
json        -> application/json
text        -> text/plain
urlencoded  -> application/x-www-form-urlencoded
multipart   -> multipart/form-data
arrayBuffer -> application/octet-stream
```

Explicit `bodyContentTypes` replaces the parser default media keys for documentation, matching the accepted Gelis runtime contract.

For managed bodies:

```text
required = true
```

OpenAPI metadata may describe or provide/opaque the schema, but it does not override contradictory runtime media admission or requiredness.

`arrayBuffer` is opaque by default unless an explicit documentation schema is supplied.

## Schema-provider boundary

Automatic projection uses Standard JSON Schema capabilities.

Verified provider families:

```text
Zod
ArkType
Valibot
```

No provider-specific reflection adapter is part of the package architecture.

A runtime-valid Standard Schema that cannot supply a serializable representation must use explicit OpenAPI metadata/opaque behavior or produce deterministic generation issues.

## Error contract

Generation is all-or-error.

`generateOpenAPI()` returns one complete document or throws `OpenAPIGenerationError` containing the collected `issues`.

The package does not expose a partially valid public document after generation issues.

## Runtime-isolation contract

P10-G accepted the invariant that OpenAPI tooling remains outside request execution.

The package public entrypoint does not automatically:

```text
install a plugin
register hooks
wrap app.fetch
create a docs route
```

Calling `generateOpenAPI()` explicitly inspects the application contract at tooling time.

## Documentation requirements

The root README must document, without requiring knowledge of internal P10 labels:

```text
package status
basic generation
3.1.2 vs 3.2.0
QUERY/custom-method behavior
ALL behavior
managed body/media behavior
route metadata
schema-provider expectations
error handling
runtime isolation
current pre-release status
```

Historical architecture documents may retain B21/P10 phase labels.

## Packaging boundary

P10-H does not authorize publication.

The repository remains pre-release. The following release-engineering items are intentionally deferred to the explicit release-readiness phase:

```text
version selection
private flag removal
peerDependencies / Gelis compatibility range
npm publication
GitHub Release
tagging
release automation
```

No release action is automatic.

## Acceptance gate

Before P10-H can be accepted:

```text
README and post-P9 compatibility docs match the frozen surface
public API type test locks the runtime exports
bun run check passes on the final documentation/test candidate
no package source semantics change after P10-G measurement
```

If package source semantics change, affected earlier acceptance evidence must be rerun before P10 closes.

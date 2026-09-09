# @gelis/openapi Compatibility and Projection v0.1

This document describes the accepted user-visible projection behavior of `@gelis/openapi` for the current Gelis v0.1 development line.

It supplements the historical `docs/architecture-v0.1.md` freeze without rewriting that older record.

## Output versions

The package supports two explicit document versions:

```text
3.1.2  compatibility default
3.2.0  full-fidelity method projection
```

The JSON Schema dialect remains:

```text
https://json-schema.org/draft/2020-12/schema
```

The default remains OpenAPI 3.1.2:

```ts
generateOpenAPI(app, {
  info: {
    title: "Example API",
    version: "1.0.0",
  },
});
```

Select OpenAPI 3.2.0 explicitly:

```ts
generateOpenAPI(app, {
  version: "3.2.0",
  info: {
    title: "Example API",
    version: "1.0.0",
  },
});
```

## HTTP method projection

### Standard operations

These Gelis methods project to ordinary Path Item fields in both output versions:

```text
GET      -> get
POST     -> post
PUT      -> put
PATCH    -> patch
DELETE   -> delete
OPTIONS  -> options
HEAD     -> head
```

### QUERY

Gelis `QUERY` is retained as a distinct semantic method.

OpenAPI 3.2.0:

```text
Path Item.query
```

OpenAPI 3.1.2 compatibility output:

```text
Path Item.x-oai-additionalOperations.QUERY
```

### Custom methods

For a valid Gelis custom method such as:

```ts
app.route("PURGE", "/cache/:id", handler);
```

OpenAPI 3.2.0 uses:

```text
Path Item.additionalOperations.PURGE
```

OpenAPI 3.1.2 compatibility output uses:

```text
Path Item.x-oai-additionalOperations.PURGE
```

Custom method identity is preserved in generation issues and is not collapsed into the historical standard-method union.

### ALL

Gelis `ALL` (`*`) is not serialized as one OpenAPI operation.

Generation records:

```text
OPENAPI_ALL_METHOD_UNREPRESENTABLE
```

and fails at the public generation boundary unless the route is excluded with `openapi: false` or equivalent concrete operations are documented separately.

## Path projection

The current compatibility projection recognizes Gelis v0.1 required named parameters:

```text
/users/:id
      ↓
/users/{id}
```

Path parameters are emitted as required OpenAPI path parameters.

The documentation package is not the authority for future router grammar. Future optional/catch-all/constrained grammar must continue to come from Gelis semantic contract information rather than a separately invented OpenAPI parser.

## Query projection

Query documentation is sourced from the Gelis route query contract when serializable metadata is available.

Route-level OpenAPI metadata can provide explicit query schema/parameters or mark query documentation opaque where automatic projection is intentionally unavailable.

Runtime validation and OpenAPI serialization remain separate capabilities.

## Managed request bodies

A route with a Gelis managed body:

```ts
{
  body: Schema
}
```

is required by the runtime contract and therefore projects as:

```text
requestBody.required = true
```

Documentation metadata cannot silently change that runtime fact to optional.

### Parser defaults

```text
bodyParser omitted/json
-> application/json

bodyParser text
-> text/plain

bodyParser urlencoded
-> application/x-www-form-urlencoded

bodyParser multipart
-> multipart/form-data

bodyParser arrayBuffer
-> application/octet-stream
```

### Explicit runtime media aliases

If `bodyContentTypes` is present, those media types replace the parser's default documentation media keys.

Example:

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
  handler,
);
```

The OpenAPI request body contains both media keys.

For multiple media keys, schema conversion occurs once and fresh schema occurrences are prepared for each media entry.

### Metadata consistency

For managed bodies, `openapi.request.body.mediaType` is a consistency assertion rather than an override of runtime admission.

Contradictory metadata produces a deterministic generation issue instead of silently documenting behavior different from the application.

Likewise, `required: false` conflicts with a managed body and produces a deterministic issue.

### Binary bodies

`arrayBuffer` defaults to an opaque media entry:

```yaml
application/octet-stream: {}
```

because the runtime body contract alone does not define a truthful wire-level JSON Schema.

Users can supply explicit OpenAPI request-body schema metadata when a binary format should be described more precisely.

## Documentation-only request bodies

A route without a managed Gelis body may still provide documentation-only request body metadata.

That metadata does not create runtime body parsing or validation.

This preserves the separation between:

```text
runtime behavior
and
documentation metadata
```

## Responses

Explicit Gelis response contracts are the canonical source for documented statuses and body schemas.

Bodyless response contracts remain bodyless in the generated document.

Serializer/content-type descriptors are projected from the accepted Gelis response contract rather than guessed from handler implementation internals.

Documentation-only response metadata can supplement contract projection without enabling runtime response validation or serialization by itself.

## Route metadata

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

`operationId` collisions and equivalent OpenAPI path-template collisions are reported as generation issues rather than resolved nondeterministically.

## Schema serialization boundary

Gelis runtime validation is based on Standard Schema.

Automatic OpenAPI conversion requires Standard JSON Schema capability.

These are deliberately not equivalent statements:

```text
schema can validate at runtime
        ≠
schema can necessarily be serialized to OpenAPI
```

Verified provider coverage includes:

```text
Zod
ArkType
Valibot + Standard JSON Schema adapter
```

The package does not inspect private provider internals.

If automatic serialization is unavailable, users can provide explicit OpenAPI schema metadata or mark the relevant documentation area opaque when that is semantically appropriate.

## Generation errors

Public generation is all-or-error:

```text
complete OpenAPI document
or
OpenAPIGenerationError
```

`OpenAPIGenerationError.issues` contains the collected deterministic issues.

Typical issue categories include:

```text
unrepresentable ALL route
operation collision
operationId collision
path-template collision
missing/failed schema serialization
request-body runtime/documentation conflict
schema-resource errors
```

The generator does not expose a partially valid document after issues are detected.

## Runtime isolation

OpenAPI generation is tooling-time work.

The accepted package architecture does not automatically install request-time behavior when the package is imported.

`generateOpenAPI()` explicitly calls the Gelis contract-inspection boundary and produces a document outside normal request execution.

Accepted P10-G evidence measured 5,000-route applications across:

```text
metadata-only
import-only plain
import-only rich
generate-once plain
generate-once rich
```

Every frozen per-case request-time gate passed, and the package-isolation geomean remained within the accepted bound.

Ratios below 1.0 in those measurements are treated only as no-regression evidence, not as a generalized speedup claim.

## Compatibility notes for the pre-P9 OpenAPI architecture

Existing users of the older 3.1.2-only architecture should note:

1. `3.1.2` remains the default output version.
2. `3.2.0` is opt-in.
3. QUERY/custom methods now preserve their semantic identity instead of being forced into standard operations.
4. Managed request-body media types now follow Gelis runtime `bodyParser` / `bodyContentTypes` semantics.
5. Contradictory request-body documentation metadata fails deterministically instead of overriding runtime facts.
6. `ALL` remains intentionally unrepresentable as a single operation.
7. The package remains tooling-only and does not install a runtime documentation endpoint.

## Release status

This compatibility contract is an internal v0.1 acceptance boundary, not npm publication authorization.

Versioning, Gelis compatibility ranges, package publication metadata, tags, GitHub Releases, and npm publishing remain explicit release-readiness work.

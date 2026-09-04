# @gelis/openapi Architecture v0.1

## Status

**ACCEPTED / FROZEN**

Milestone: **B21 — OpenAPI Contract Serialization v0.1**

This document records the accepted architecture boundary for `@gelis/openapi` before Gelis moves into **Performance Architecture Re-evaluation v0.2** and, after that, **Router Grammar & Matching v0.2**.

The purpose of this freeze is to preserve the semantic and tooling contract that has already been validated without prematurely freezing future router grammar internals.

---

## Package

```text
npm:    @gelis/openapi
GitHub: gelisjs/openapi
```

`@gelis/openapi` is the official optional OpenAPI package for Gelis.

It consumes Gelis application contract snapshots and projects them into deterministic OpenAPI documents.

---

## Accepted public API

The accepted v0.1 public construction API is:

```ts
generateOpenAPI(app, options);
```

The package also exposes:

```text
OpenAPIGenerationError
OPENAPI_VERSION
OPENAPI_JSON_SCHEMA_DIALECT

OpenAPIDocument
OpenAPIGenerationIssue
OpenAPIGenerationOptions
OpenAPIHttpMethod
OpenAPIInfoObject
OpenAPIServerObject
OpenAPITagObject
```

Internal projection helpers are not part of the public API.

In particular, internal document builders and projection stages remain implementation details.

---

## Contract boundary

The accepted integration boundary between Gelis core and `@gelis/openapi` is:

```text
Gelis application
      ↓
inspectContract(app)
      ↓
ApplicationContractSnapshot
      ↓
@gelis/openapi projection
      ↓
OpenAPI document
```

`@gelis/openapi` does not consume router internals, runtime route flags, handler execution internals, lifecycle implementation details, or Bun-specific runtime state.

The internal Gelis contract-source capability symbol remains private to Gelis core. External tooling consumes `inspectContract()` rather than accessing the capability directly.

This boundary is intentionally semantic rather than execution-oriented.

---

## OpenAPI version

The accepted document version is:

```text
OpenAPI 3.1.2
```

The accepted JSON Schema dialect is:

```text
https://json-schema.org/draft/2020-12/schema
```

---

## Generation model

Each call to:

```ts
generateOpenAPI(app, options);
```

creates a fresh contract snapshot and a fresh projection resolver.

Generated OpenAPI documents are not cached across calls.

Schema-conversion caches used during one generation do not survive into later generations.

Generation is therefore treated as an explicit tooling operation rather than request-path runtime state.

---

## Error model

Generation is all-or-error.

Projection collects generation issues and the public boundary returns either:

```text
one complete OpenAPI document
```

or throws:

```text
OpenAPIGenerationError
```

containing all collected generation issues.

The generator does not return partially valid public documents.

---

## Deterministic projection

The accepted v0.1 implementation guarantees deterministic projection for the currently supported Gelis route grammar.

This includes deterministic handling of:

```text
route ordering
HTTP method ordering
operation metadata
path parameters
query parameters
request bodies
responses
operationId collisions
equivalent OpenAPI path-template collisions
excluded routes
generation issues
```

---

## Request body and response semantics

OpenAPI projection follows runtime contract semantics rather than HTTP-method conventions inferred by the documentation package.

The package does not rewrite Gelis request-body semantics based only on method names.

Response projection follows explicit Gelis response contracts when present.

Implicit handler responses remain representable as opaque default responses when no explicit schema contract exists.

Documentation-only response statuses may be represented without changing runtime response execution.

---

## Explicit OpenAPI metadata

Gelis route metadata may override or supplement automatic projection.

Supported v0.1 metadata includes:

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

Metadata may provide explicit JSON Schema projection or mark supported areas as opaque where automatic projection is intentionally suppressed.

Metadata is tooling state and does not become part of the request execution plan.

---

## Standard Schema integration

Runtime validation contracts remain based on Standard Schema.

`@gelis/openapi` uses Standard JSON Schema capabilities when automatic schema projection is required.

Input and output schema projection are resolved independently.

Converter failures are preserved as generation issue causes.

Automatic schema resolution is skipped when a route or metadata configuration does not require it.

---

## Verified schema-library conformance

The v0.1 architecture has been verified against:

```text
Zod
ArkType
Valibot
```

Cross-library tests confirm that Standard JSON Schema conversion can be projected through the accepted Gelis contract boundary.

This does not make any one validation library a dependency of Gelis core.

---

## JSON Schema resource handling

The accepted v0.1 resource model includes support for:

```text
draft 2020-12
explicit $id
synthetic resource identity where required
local recursive $ref
$anchor
$dynamicAnchor / dynamic recursion
bundled relative resources
absolute resource bases
relative external references when an explicit absolute base exists
duplicate anchor detection
```

The projection layer does not silently reinterpret unsupported or ambiguous schema-resource relationships.

Invalid or unresolvable resource relationships are reported as generation issues.

---

## Fresh caller-owned state

Generated OpenAPI documents and projected schema occurrences are returned as fresh caller-owned structures.

Shared schema identity may be used internally for conversion memoization, but projected occurrences are independently mutable.

Caller mutations to a generated document do not mutate the source Gelis application contract.

---

## Zero-unused runtime architecture

OpenAPI support is not part of Gelis request execution semantics.

At route registration, OpenAPI contract metadata is only created when `options.openapi` is present.

OpenAPI metadata does not contribute to the route execution flags used to choose the request hot path.

Plain routes therefore remain eligible for the plain Gelis runtime path.

Contract inspection occurs only when tooling explicitly calls:

```ts
inspectContract(app);
```

This preserves the Gelis invariant:

> Unused framework capabilities must remain off the request hot path.

---

## Correctness acceptance

Accepted runtime verification:

```text
69 tests passed
0 tests failed
259 expect() calls
14 runtime test files
```

The suite covers:

```text
body and response metadata
cross-library Standard JSON Schema conformance
aggregate generation errors
generateOpenAPI()
operation and path metadata
path projection
query metadata
query projection
request-body projection
response projection
OpenAPI root document creation
schema-resource integration
JSON Schema resource semantics
Standard JSON Schema resolution
```

All TypeScript checks and the package build also passed at the acceptance checkpoint.

---

## Generation scaling acceptance

Authoritative benchmark environment:

```text
Runtime: Bun 1.4.0
Warmups: 3
Runs:    9
Sizes:   100, 1000, 5000 routes
```

Public `generateOpenAPI()` results at 5,000 routes:

```text
plain   12.240 ms   2.448 µs/route
shared  95.378 ms  19.076 µs/route
unique 155.348 ms  31.070 µs/route
```

Scaling from 1,000 to 5,000 routes:

```text
route multiplier: 5.000x

plain public:   6.324x
shared public:  4.893x
unique public:  5.260x
```

The accepted conclusion is that the generator does not show an architectural scaling failure at the tested 5,000-route size.

The `plain` variance is treated as benchmark/runtime noise rather than evidence of an OpenAPI-specific superlinear architecture because the schema-heavy shared and unique scenarios remain approximately linear at the larger scale.

No generator optimization is required before the v0.1 architecture freeze.

---

## Path grammar boundary

The current OpenAPI path projection recognizes the Gelis v0.1 grammar:

```text
/static
/:requiredParam
```

and converts named Gelis parameters into OpenAPI path-template parameters.

Example:

```text
/users/:id
      ↓
/users/{id}
```

This implementation is accepted only as a **v0.1 compatibility projection**.

It is explicitly **not** the long-term grammar authority.

---

## Deferred path-semantic migration

When Gelis begins **Router Grammar & Matching v0.2**, `@gelis/openapi` must not grow an independent parser for future constructs such as:

```text
optional named parameters
named catch-all parameters
constrained parameters
future grammar extensions
```

The intended future architecture is:

```text
route declaration
      ↓
Gelis core semantic path representation
      ↓
┌───────────────┬──────────────┬──────────────┐
runtime router  OpenAPI        client / AOT
```

The exact shape of that semantic representation is intentionally not frozen by B21.

Designing it is deferred until after **Performance Architecture Re-evaluation v0.2**.

---

## Relationship to future RoutePlan / AOT work

The accepted OpenAPI boundary does not require OpenAPI to understand request execution closures.

That keeps the architecture compatible with a future internal direction such as:

```text
Route declaration
      ↓
semantic RoutePlan / IR
      ↓
execution backend
```

Potential future backends may include:

```text
registration-time specialized runtime executor
runtime-specific fast paths
build-time generated artifact
optional AOT
```

`@gelis/openapi` should continue to consume semantic contract information rather than execution-backend implementation details.

---

## Explicitly not frozen

The following are not frozen by this document:

```text
future Router Grammar v0.2 syntax
PathPlan / PathIR representation
whole-route execution specialization
Bun native static dispatch
build-time AOT architecture
validation acceleration
OpenAPI components architecture beyond current requirements
security-scheme expansion
publication and release workflow
package compatibility/version policy
```

These remain future work.

---

## Packaging follow-up

The package is still pre-release and currently uses development packaging configuration.

Before public npm publication, revisit:

```text
private flag
version policy
peerDependencies
Gelis compatibility range
release automation
publishing workflow
```

These are release-engineering tasks and are not blockers for the OpenAPI architecture v0.1 freeze.

---

## Acceptance decision

**B21 — OpenAPI Contract Serialization v0.1 is accepted and frozen.**

The accepted architecture is:

```text
Gelis semantic contract snapshot
      ↓
deterministic OpenAPI projection
      ↓
OpenAPI 3.1.2 document
```

with OpenAPI generation remaining outside the request hot path.

No further OpenAPI architecture feature work is required before the next Gelis milestone.

---

## Next milestones

The roadmap after this freeze is:

```text
B21 OpenAPI Contract Serialization v0.1
        ↓
ACCEPTED / FROZEN
        ↓
Performance Architecture Re-evaluation v0.2
        ↓
Router Grammar & Matching v0.2
```

The performance re-evaluation is expected to study, benchmark, or prototype candidates including:

```text
Elysia 2 stable
Elysia 2 AOT
Elysia 2 compiler architecture
Bun native routing
current Gelis end-to-end profile
whole-route executor specialization
Bun-native static-route dispatch
optional Gelis build-time AOT
validation acceleration
semantic RoutePlan / IR readiness
```

Each candidate remains subject to the Gelis acceptance process:

```text
candidate
   ↓
correctness
   ↓
benchmark
   ↓
HTTP benchmark where relevant
   ↓
architecture / type regression review
   ↓
KEEP or REJECT
```

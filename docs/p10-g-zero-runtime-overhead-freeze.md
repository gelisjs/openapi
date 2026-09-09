# P10-G Zero Runtime Overhead Freeze

**Status:** GATES FROZEN  
**Phase:** P10-G  
**Date:** 2026-09-09  
**Accepted P10-F source:** `85765908b91a400f01fa891f9ae64b7c15a376fa`  
**P10-F acceptance:** `0c48cf0c215ece8af8273931fa752046945863db`

## Purpose

P10-G verifies the request-time invariant behind the Gelis OpenAPI architecture:

> OpenAPI tooling must remain outside normal request execution.

The package may be installed, imported, and used to generate a document outside the request loop without adding a permanent OpenAPI branch, hook, wrapper, or lookup to Gelis request execution.

This phase is not a generation-speed benchmark. P10-F already owns generation performance.

No acceptance threshold in this document may be relaxed after P10-G measurements are observed.

## Architectural invariant

The intended topology is:

```text
route registration
      ↓
Gelis runtime plans + compact contract metadata
      ↓
request execution

separately:

@gelis/openapi
      ↓
inspectContract(app)
      ↓
project/generate document
```

There must be no mandatory request-time edge from the first flow to the second.

## Structural prerequisites

Before runtime measurement is accepted, the package must satisfy all of the following:

```text
package sideEffects = false

public entrypoint does not install a Gelis plugin
public entrypoint does not register lifecycle hooks
public entrypoint does not wrap app.fetch
public entrypoint does not create a documentation route

generateOpenAPI() performs explicit tooling-time inspection
and returns a document without installing request behavior
```

No automatic runtime documentation endpoint is part of P10-G.

## Canonical environment

```text
Runtime:       Bun 1.4.0
Gelis:         884e8bed42a40ff69ed1180a155fec6839d26539
Machine:       same physical machine for every paired worker
Candidate:     clean P10-G candidate checkout
Route count:   5,000
```

The exact candidate must pass:

```text
bun run check
```

before P10-G acceptance.

## Runtime workload A — metadata-only

Purpose:

Verify that OpenAPI route metadata itself does not create request-time execution work.

Paired applications are semantically identical plain static GET applications:

```text
control
5,000 routes
no openapi metadata
shared raw Response

candidate
5,000 routes
openapi metadata on every route
same shared raw Response
```

The measured target is one static route.

The `@gelis/openapi` package is not imported in either worker for this case.

This isolates compact route metadata from package import effects.

## Runtime workload B — import-only

Purpose:

Verify that importing `@gelis/openapi` without invoking generation does not alter request execution.

Both workers build the same documented application. The only difference is:

```text
control
does not import @gelis/openapi

candidate
imports the candidate public entrypoint
but never calls generateOpenAPI()
```

Two application profiles are required:

### B1 plain-documented

```text
5,000 static GET routes
OpenAPI metadata present
shared raw Response
```

### B2 rich-documented

```text
5,000 GET routes
query Standard Schema
response Standard Schema
explicit JSON serializer
beforeHandle
handler
afterHandle
OpenAPI metadata present
```

The rich workload deliberately avoids a consumable request body so the same Request can be reused during direct app.fetch measurement.

## Runtime workload C — generate-once

Purpose:

Verify that successful OpenAPI generation does not mutate or wrap subsequent request execution.

Both workers build the same documented applications as workload B.

Candidate worker additionally performs exactly one:

```ts
generateOpenAPI(app, ...)
```

after route registration and before warmup.

Generation is outside the measured request interval.

Required profiles:

```text
C1 plain-documented
C2 rich-documented
```

The generated document must be validated before measurement and then discarded from the request hot path.

## Mutation guard

For generate-once profiles, the harness must verify before measurement that generation does not replace the application's fetch entrypoint.

At minimum:

```text
fetch identity before generation
===
fetch identity after generation
```

If Gelis exposes a runtime representation where direct identity comparison is not stable by design, the harness must instead use an equally strong permanent structural invariant and document it before accepting measurements.

No post-result weakening of this guard is allowed.

## Measurement protocol

Each paired case uses process-isolated persistent Bun workers.

Canonical protocol:

```text
4 persistent workers per paired case
2 control
2 candidate

orientations
ABBA + BAAB

10,000 warmup dispatches per worker
20,000 measured app.fetch() dispatches per measurement
41 mirrored measurements per case
Bun.gc(true) before measured batches
```

The canonical statistic is:

```text
median of paired candidate/control ratios
```

Order-bucket medians are diagnostic only.

Startup/import/generation time is excluded from the request-time interval and may be recorded only as diagnostics.

## Frozen request-time gates

Cases:

```text
A   metadata-only
B1  import-only plain-documented
B2  import-only rich-documented
C1  generate-once plain-documented
C2  generate-once rich-documented
```

Every case must satisfy:

```text
median candidate/control ratio <= 1.03x
```

Across B1/B2/C1/C2, which isolate `@gelis/openapi` package presence/use from otherwise identical applications:

```text
geometric mean candidate/control ratio <= 1.02x
```

The metadata-only A case is reported separately because its control and candidate route definitions intentionally differ by metadata.

Ratios below 1.0 are no-regression evidence only and do not authorize a generalized speedup claim.

## Correctness guards

Every worker must verify before timing:

```text
expected route response status
expected response body/content-type where managed response is used
no generation issues for generate-once profiles
expected generated OpenAPI version
```

A worker producing different semantics is invalid benchmark evidence even if its timing passes.

## Exclusions

P10-G does not gate:

```text
OpenAPI generation latency         -> P10-F
OpenAPI document size              -> P10-F
HTTP network-stack throughput      -> not needed for this invariant
startup/import latency             -> diagnostic only
third-party schema provider speed  -> P10-E/P10-F boundaries
runtime documentation endpoint     -> not part of v0.1 architecture
```

## Source-change rule

If package source or the benchmark semantics/timing boundary changes after measurement, all affected P10-G cases must be rerun.

Documentation-only commits after an exact measured candidate do not invalidate request-time evidence.

## Freeze decision

The architecture, protocol, cases, and thresholds above are frozen before P10-G measurements.

```text
P10-G ZERO-RUNTIME-OVERHEAD GATES FROZEN
```

# P10-F OpenAPI Generation Scalability Freeze

**Status:** GATES FROZEN  
**Phase:** P10-F  
**Date:** 2026-09-09  
**Legacy control:** `c08f46d2c3f2a5ced3de372a024da735c35b3f97`  
**Accepted post-P9 source:** `2c6f5ade9086ea415c4d0baf7d0cce3a6a3a862f`  
**Provider acceptance head:** `b37b9edf4533d958364ea5d89b3eacadaaf9fd83`

## Purpose

P10-F closes the OpenAPI integration work with generation-performance and scalability evidence before public API/docs freeze.

The phase measures tooling-time work only. It does not authorize request-time OpenAPI work and does not alter Gelis runtime hot paths.

No acceptance threshold in this document may be relaxed after benchmark results are observed.

## Benchmark principles

P10-F separates two questions:

```text
legacy regression
= did post-P9 integration make previously supported OpenAPI generation materially slower?

post-P9 scalability
= do the new method/media semantics scale acceptably to large route counts?
```

The legacy B21 control cannot represent all post-P9 semantics. Therefore post-P9-only workloads must not be presented as direct B21 feature-performance comparisons.

## Environment

Canonical acceptance environment:

```text
Runtime:      Bun 1.4.0
TypeScript:   7.0.2
Machine:      same physical machine for control and candidate
Control root: detached/worktree checkout of B21 control
Candidate:    clean P10-F candidate checkout
```

Control and candidate must use their own pinned dependency locks.

## Legacy regression matrix

The existing accepted generation scenarios remain the regression surface:

```text
plain
shared
unique
```

Existing modes:

```text
projection
end-to-end
public
```

The legacy workload semantics must remain equivalent between control and candidate. Default public output remains OpenAPI 3.1.2 for this comparison.

Canonical acceptance size:

```text
5,000 routes
```

Smaller route counts may be recorded diagnostically but do not replace the 5,000-route gate.

## Legacy measurement protocol

A dedicated acceptance harness must compare control and candidate without startup/import time inside the measured generation interval.

Required protocol:

```text
persistent worker/process per root
5 warmup generations before measured samples
21 mirrored measured samples per case
both control-first and candidate-first orientations
median of candidate/control paired ratios is canonical
order buckets are diagnostic only
```

The benchmark must validate projected path count and zero generation issues before timing is accepted.

## Legacy regression gates

For each of the 9 legacy scenario/mode combinations at 5,000 routes:

```text
median candidate/control ratio <= 1.08x
```

Across all 9 combinations:

```text
geometric mean candidate/control ratio <= 1.03x
```

Interpretation:

- ratios below 1.0 are no-regression evidence, not generalized speedup claims;
- one noisy case may use the per-case 8% envelope, but the aggregate accepted regression budget remains 3%;
- no post-hoc case removal is allowed.

## Post-P9 rich workload

P10-F must add a permanent post-P9-rich generation workload that exercises a deterministic mixture of:

```text
ordinary HTTP methods
QUERY
custom HTTP method
query schema
JSON request body
JSON multi-media body aliases
text body
urlencoded body
multipart body
arrayBuffer body
explicit JSON responses
bodyless responses
```

`app.all()` is excluded because P10-B intentionally defines it as unrepresentable/fail-closed.

The workload must use provider-neutral benchmark schemas rather than Zod/ArkType/Valibot so this phase measures OpenAPI generation architecture rather than third-party provider performance.

## Post-P9 sizes

Canonical route counts:

```text
100
1,000
5,000
```

For every size, the harness must verify exact projected path count and zero generation issues.

## Post-P9 output modes

The rich workload must measure both:

```text
projection OpenAPI 3.1.2
projection OpenAPI 3.2.0
public generation OpenAPI 3.1.2
public generation OpenAPI 3.2.0
```

Schema semantics must remain equivalent across versions; method encoding may differ according to P10-B.

## Post-P9 scaling protocol

For each size/mode:

```text
3 warmups
11 measured runs
observed-sample median is canonical
```

The same application/snapshot construction policy must be used consistently per mode. Setup that is outside the declared measured mode must not be moved in or out after results are observed.

## Post-P9 scaling gates

For every rich mode:

```text
100 -> 1,000 routes
median time multiplier <= 12.0x

1,000 -> 5,000 routes
median time multiplier <= 6.0x
```

These gates allow bounded overhead above ideal linear scaling (10x and 5x respectively) while rejecting substantial superlinear growth.

At 5,000 routes, version overhead must satisfy:

```text
projection 3.2 / projection 3.1 <= 1.10x
public 3.2 / public 3.1         <= 1.10x
```

A ratio below 1.0 does not justify a generalized claim that OpenAPI 3.2 is faster.

## Output-size structural gate

The rich generated document must also remain structurally linear.

For each output version:

```text
JSON-serialized document size at 5,000 routes
/
JSON-serialized document size at 1,000 routes
<= 5.5x
```

This is a deterministic structural-growth gate, not an RSS or heap-memory claim.

RSS/heap observations may be recorded diagnostically but are not acceptance gates in P10-F because allocator and GC noise would otherwise dominate this tooling benchmark.

## Component benchmark

The existing generation component benchmark may be rerun for diagnosis, but component microbenchmarks are not P10-F acceptance gates and cannot override end-to-end acceptance results.

## Correctness prerequisite

Before any P10-F result is accepted:

```text
bun run check
```

must pass on the exact measured candidate.

If package source changes after measurements, all affected P10-F gates must be rerun before acceptance.

Benchmark-harness-only fixes that change measured semantics or timing boundaries also invalidate prior measurements.

## External competitors

Hono/Elysia/Fastify OpenAPI tooling comparisons are optional diagnostics and are not P10-F acceptance gates. Any such comparison must use semantically equivalent documents and clearly identify the external package/version.

No broad competitor-performance claim may be made from P10-F without that separate evidence.

## Freeze decision

The protocol and thresholds above are frozen before P10-F measurements.

```text
P10-F GENERATION SCALABILITY GATES FROZEN
```

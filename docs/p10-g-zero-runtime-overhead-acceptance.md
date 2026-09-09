# P10-G Zero Runtime Overhead Acceptance

**Status:** ACCEPTED  
**Phase:** P10-G  
**Date:** 2026-09-09  
**Measured candidate:** `6e84bd324fb83de228e17c99736deea92e23d070`  
**Freeze:** `8d50f9340ea5ba53a49c89bbd9cc4b6e97e5286f`

## Preconditions

The exact measured candidate passed the canonical package check before measurement:

```text
84 pass
0 fail
463 expect() calls
build completed
```

The candidate worktree was clean.

## Canonical protocol

```text
Runtime:        Bun 1.4.0
CPU:            Intel Core i5-10500H @ 2.50GHz
Routes:         5,000/case
Workers:        four persistent workers/case
Pair shape:     semantic ABBA / BAAB
Warmup:         10,000 app.fetch calls/worker
Measurement:    20,000 app.fetch calls/measurement
Samples:        41 mirrored samples/case
GC:             Bun.gc(true) inside measured worker
Per-case gate:  candidate/control <= 1.03x
Package gate:   B1/B2/C1/C2 geomean <= 1.02x
```

Order-bucket medians remained diagnostic only.

## Results

| case | median ratio | control-start | candidate-start | gate | verdict |
| --- | ---: | ---: | ---: | --- | --- |
| metadata-only | 0.9716x | 0.9822x | 0.9632x | <= 1.03x | PASS |
| import-plain | 1.0118x | 1.0291x | 0.9876x | <= 1.03x | PASS |
| import-rich | 0.9929x | 0.9893x | 0.9946x | <= 1.03x | PASS |
| generate-plain | 1.0084x | 1.0221x | 0.9989x | <= 1.03x | PASS |
| generate-rich | 1.0089x | 0.9940x | 1.0206x | <= 1.03x | PASS |

Package-isolation geomean:

```text
1.0055x <= 1.02x => PASS
```

## Accepted interpretation

The evidence supports the P10-G invariant:

> Installing/importing `@gelis/openapi`, attaching OpenAPI metadata, or generating one document before request execution does not introduce a measurable permanent request-time OpenAPI cost above the frozen acceptance bounds on this workload.

Ratios below `1.0x` are treated only as no-regression evidence. They are not a generalized speedup claim.

`generateOpenAPI()` remained tooling-time behavior outside the measured request interval, and the harness verified that generation did not replace the Gelis fetch entrypoint.

## Boundary

P10-G does not claim anything about:

```text
network-stack throughput
startup/import latency
generation latency
document size
other machines or runtimes
```

Generation latency and document growth are owned by P10-F.

## Decision

All frozen P10-G request-time gates passed without relaxation.

```text
P10-G ZERO-RUNTIME-OVERHEAD ACCEPTED
```

Next phase:

```text
P10-H public API + documentation freeze
```

# P10-F OpenAPI Generation Scalability Acceptance

**Status:** ACCEPTED  
**Phase:** P10-F  
**Date:** 2026-09-09  
**Legacy control:** `c08f46d2c3f2a5ced3de372a024da735c35b3f97`  
**Measured candidate:** `85765908b91a400f01fa891f9ae64b7c15a376fa`  
**Freeze:** `b6a19bd0364a3931a3eb6a47fb4bf6d493698721`

## Decision

P10-F is accepted.

The exact measured source candidate passed the frozen generation-regression and post-P9 scalability gates. The maintainer subsequently reran the repository correctness/build gate on the exact measured source and reported it completed successfully.

```text
P10-F GENERATION SCALABILITY ACCEPTED
```

## Correctness prerequisite

The acceptance prerequisite remained:

```text
bun run check
```

The exact measured source retained the accepted runtime/provider matrix:

```text
84 pass
0 fail
463 expect() calls
```

and the typecheck/build chain completed without reported error.

## Legacy B21 regression result

Canonical comparison used the frozen B21 control at 5,000 routes.

| scenario | mode | candidate/control | gate |
| --- | --- | ---: | --- |
| plain | projection | 0.9703x | PASS |
| plain | end-to-end | 0.9185x | PASS |
| plain | public | 0.9296x | PASS |
| shared | projection | 1.0060x | PASS |
| shared | end-to-end | 1.0166x | PASS |
| shared | public | 1.0431x | PASS |
| unique | projection | 1.0024x | PASS |
| unique | end-to-end | 0.9821x | PASS |
| unique | public | 1.0026x | PASS |

Frozen per-case gate:

```text
candidate/control <= 1.08x
```

All nine cases passed.

Legacy geometric mean:

```text
0.9850x <= 1.03x
```

PASS.

Ratios below 1.0 are retained only as no-regression evidence. They are not a generalized speed claim.

## Post-P9 rich generation result

| mode | version | routes | median ms | us/route | document bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| projection | 3.1.2 | 100 | 2.035 | 20.346 | - |
| projection | 3.1.2 | 1,000 | 11.543 | 11.543 | - |
| projection | 3.1.2 | 5,000 | 59.638 | 11.928 | - |
| projection | 3.2.0 | 100 | 1.135 | 11.349 | - |
| projection | 3.2.0 | 1,000 | 10.772 | 10.772 | - |
| projection | 3.2.0 | 5,000 | 57.596 | 11.519 | - |
| public | 3.1.2 | 100 | 1.137 | 11.370 | 49,601 |
| public | 3.1.2 | 1,000 | 10.981 | 10.981 | 490,165 |
| public | 3.1.2 | 5,000 | 60.162 | 12.032 | 2,454,665 |
| public | 3.2.0 | 100 | 1.196 | 11.963 | 49,120 |
| public | 3.2.0 | 1,000 | 11.364 | 11.364 | 485,540 |
| public | 3.2.0 | 5,000 | 60.288 | 12.058 | 2,431,540 |

### Scaling gates

```text
projection 3.1.2 100 -> 1,000     5.6734x <= 12.0x  PASS
projection 3.1.2 1,000 -> 5,000   5.1665x <=  6.0x  PASS
projection 3.2.0 100 -> 1,000     9.4919x <= 12.0x  PASS
projection 3.2.0 1,000 -> 5,000   5.3466x <=  6.0x  PASS
public 3.1.2 100 -> 1,000         9.6580x <= 12.0x  PASS
public 3.1.2 1,000 -> 5,000       5.4787x <=  6.0x  PASS
public 3.2.0 100 -> 1,000         9.4994x <= 12.0x  PASS
public 3.2.0 1,000 -> 5,000       5.3052x <=  6.0x  PASS
```

### Version-overhead gates

```text
projection 3.2 / 3.1 @ 5,000 = 0.9658x <= 1.10x  PASS
public     3.2 / 3.1 @ 5,000 = 1.0021x <= 1.10x  PASS
```

No generalized claim that OpenAPI 3.2 is faster is authorized by these ratios.

### Structural document-size gates

```text
OpenAPI 3.1.2 1,000 -> 5,000 = 5.0078x <= 5.5x  PASS
OpenAPI 3.2.0 1,000 -> 5,000 = 5.0079x <= 5.5x  PASS
```

The generated-document growth remains structurally linear within the frozen envelope.

## Failed candidate retained as evidence

The first measured candidate, `17ea4c0d90284d6c681c8aaf398f5157324d3ba6`, failed the frozen legacy gate:

```text
plain projection   1.2570x  FAIL
plain end-to-end   1.2195x  FAIL
plain public       1.1438x  FAIL
legacy geomean     1.0873x  FAIL
```

The gate was not relaxed and the plain cases were not removed.

Diagnosis found that the post-P9 method model allocated a `Map` for every projected path and performed method-map scans during finalization, including for ordinary standard-method-only routes.

The accepted source candidate restored the standard-method object fast path and made QUERY/custom-method storage lazy sidecars:

```text
standard methods
-> direct path-item properties

QUERY
-> allocated only when present

custom methods
-> allocated only when present
```

This retained P10-B method semantics while removing unused additional-method representation cost from the standard-method path.

## Interpretation

P10-F establishes that the post-P9 OpenAPI integration:

- does not materially regress the accepted B21 generation workloads under the frozen matrix;
- scales to 5,000 rich routes without substantial superlinear growth;
- keeps OpenAPI 3.2 encoding overhead bounded relative to 3.1.2;
- preserves linear generated-document growth;
- retains a cheap standard-method path while making newer method capabilities pay-for-use.

P10-F does not measure request-time runtime overhead. That is the responsibility of P10-G.

## Phase transition

```text
P10-D  post-P9 integration          ACCEPTED
P10-E  provider compatibility       ACCEPTED
P10-F  generation scalability       ACCEPTED
P10-G  zero-runtime-overhead        NEXT
P10-H  public API + docs freeze     PLANNED
```

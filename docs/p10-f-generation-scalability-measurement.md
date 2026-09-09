# P10-F OpenAPI Generation Scalability Measurement

**Status:** PERFORMANCE / SCALABILITY GATES PASS — FINAL ACCEPTANCE PENDING EXACT-CANDIDATE `bun run check`  
**Phase:** P10-F  
**Date:** 2026-09-09  
**Legacy control:** `c08f46d2c3f2a5ced3de372a024da735c35b3f97`  
**Measured candidate:** `85765908b91a400f01fa891f9ae64b7c15a376fa`  
**Runtime:** Bun 1.4.0

## Context

The first P10-F candidate failed the frozen legacy regression gate because standard HTTP methods were represented through a per-path `Map`, which imposed material overhead on plain OpenAPI projection. The frozen gates were not changed.

The accepted optimization candidate restores the B21-style plain-object representation for standard methods and uses lazy sidecars only for QUERY and custom methods. The full P10-F benchmark was then rerun because package source changed.

## Legacy B21 regression matrix

Canonical 5,000-route mirrored results:

| scenario | mode | median candidate/control | control-first | candidate-first | gate |
| --- | --- | ---: | ---: | ---: | --- |
| plain | projection | 0.9703x | 0.9703x | 0.9754x | PASS |
| plain | end-to-end | 0.9185x | 0.9121x | 1.0045x | PASS |
| plain | public | 0.9296x | 0.9289x | 0.9539x | PASS |
| shared | projection | 1.0060x | 0.9953x | 1.0095x | PASS |
| shared | end-to-end | 1.0166x | 1.0000x | 1.0321x | PASS |
| shared | public | 1.0431x | 1.0558x | 1.0431x | PASS |
| unique | projection | 1.0024x | 1.0166x | 0.9941x | PASS |
| unique | end-to-end | 0.9821x | 0.9907x | 0.9595x | PASS |
| unique | public | 1.0026x | 1.0026x | 1.0175x | PASS |

Legacy geometric mean:

```text
0.9850x <= 1.03x => PASS
```

Ratios below 1.0 are treated only as no-regression evidence, not as generalized speedup claims.

## Post-P9 rich generation

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

## Frozen rich gates

```text
projection 3.1.2 100->1000      5.6734x <= 12.0x  PASS
projection 3.1.2 1000->5000     5.1665x <= 6.0x   PASS
projection 3.2.0 100->1000      9.4919x <= 12.0x  PASS
projection 3.2.0 1000->5000     5.3466x <= 6.0x   PASS
public 3.1.2 100->1000          9.6580x <= 12.0x  PASS
public 3.1.2 1000->5000         5.4787x <= 6.0x   PASS
public 3.2.0 100->1000          9.4994x <= 12.0x  PASS
public 3.2.0 1000->5000         5.3052x <= 6.0x   PASS
projection 3.2/3.1 @5000        0.9658x <= 1.10x  PASS
public 3.2/3.1 @5000            1.0021x <= 1.10x  PASS
public 3.1.2 size 1000->5000    5.0078x <= 5.5x   PASS
public 3.2.0 size 1000->5000    5.0079x <= 5.5x   PASS
```

## Measurement decision

All frozen P10-F performance, scalability, version-overhead, and structural document-growth gates pass on candidate `85765908b91a400f01fa891f9ae64b7c15a376fa`.

The phase is not yet marked fully accepted in this record because the freeze requires `bun run check` to pass on the exact measured candidate after the source optimization. Once that prerequisite is confirmed, a separate P10-F acceptance record may be committed without rerunning the benchmark, provided package source and benchmark semantics remain unchanged.

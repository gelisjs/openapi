# P10-H Public API and Documentation Acceptance

**Status:** ACCEPTED / P10 COMPLETE  
**Phase:** P10-H  
**Date:** 2026-09-09  
**Exact checked candidate:** `0ea37471af520c4a19c826187786c09021c8ce37`

## Acceptance gate

The exact P10-H candidate passed the full package gate:

```text
84 pass
0 fail
463 expect() calls
```

The command path also completed TypeScript source checks, type-test checks, benchmark typechecks, runtime tests, and package build.

P10-H introduced no runtime-source semantic changes after P10-G. The P10-H candidate changed only user documentation, compatibility guidance, the public-API freeze document, and compile-time public API tests.

## Accepted public API

Runtime exports:

```text
generateOpenAPI
OpenAPIGenerationError
OPENAPI_VERSION
OPENAPI_VERSION_3_2
OPENAPI_JSON_SCHEMA_DIALECT
```

Public type exports:

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

Internal projection helpers remain non-public.

## Accepted user-facing behavior

The documentation now describes the accepted package behavior without requiring users to understand internal P10 phase labels:

```text
OpenAPI 3.1.2 compatibility output by default
OpenAPI 3.2.0 full-fidelity output when selected
QUERY representation
custom HTTP method representation
ALL fail-closed semantics
managed request-body parser/media projection
Zod / ArkType / Valibot provider compatibility
aggregate generation error semantics
explicit tooling-time generation
zero request-time OpenAPI architecture
```

The historical `docs/architecture-v0.1.md` remains as the B21 architecture freeze. Post-P9 behavior is documented through the P10 documents and current user-facing README/compatibility guide rather than rewriting historical evidence.

## Evidence carried into P10 completion

P10-D:

```text
post-P9 contract/OpenAPI integration accepted
OpenAPI 3.1.2 + 3.2.0
QUERY/custom methods
ALL fail-closed
managed body/media projection
```

P10-E:

```text
Zod
ArkType
Valibot
Standard Schema / Standard JSON Schema boundary
84 pass / 0 fail / 463 expect() calls at the accepted provider gate
```

P10-F:

```text
legacy 5,000-route regression matrix PASS
legacy geomean 0.9850x <= 1.03x PASS
post-P9 100 / 1,000 / 5,000 route scaling PASS
OpenAPI 3.2 / 3.1 overhead gates PASS
document-size growth gates PASS
```

P10-G:

```text
metadata-only   0.9716x PASS
import-plain    1.0118x PASS
import-rich     0.9929x PASS
generate-plain  1.0084x PASS
generate-rich   1.0089x PASS
package geomean 1.0055x <= 1.02x PASS
```

Ratios below `1.0x` are no-regression evidence only and are not generalized speedup claims.

## Final P10 phase tree

```text
P10  OpenAPI & Contract Integration        COMPLETE
├── A  post-P9 contract/OpenAPI audit      COMPLETE
├── B  version + method strategy           FROZEN
├── C  request-body/media strategy         FROZEN
├── D  @gelis/openapi integration          ACCEPTED
├── E  provider compatibility              ACCEPTED
├── F  generation scalability              ACCEPTED
├── G  zero-runtime-overhead               ACCEPTED
└── H  public API + documentation freeze   ACCEPTED
```

## Release boundary

P10 completion is not release authorization.

No npm publish, GitHub Release, tag, merge-to-release branch, or other public release action is implied by this acceptance.

Release engineering remains a later explicit maintainer-controlled process.

## Decision

```text
P10-H ACCEPTED
P10 OPENAPI & CONTRACT INTEGRATION COMPLETE
```

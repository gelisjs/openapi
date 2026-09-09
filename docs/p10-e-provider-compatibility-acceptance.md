# P10-E Provider Compatibility Acceptance

**Status:** ACCEPTED / FROZEN  
**Phase:** P10-E  
**Date:** 2026-09-09  
**Accepted provider-matrix commit:** `4268f50df97073770bffbadd3aea7e837ea753a6`  
**Gate freeze:** `34d23e35cb68ed0dae62f01f269449b82ed00781`

## Scope

P10-E validates that post-P9 OpenAPI projection remains provider-neutral through Standard Schema V1 and Standard JSON Schema V1 rather than provider-specific adapters.

Permanent coverage includes:

```text
Zod      4.5.4
ArkType  2.2.3
Valibot  1.4.2 + @valibot/to-json-schema 1.7.1
```

For every provider, the matrix covers query input, JSON response output, JSON multi-media request bodies, text bodies, urlencoded bodies, provider-convertible multipart objects, and OpenAPI 3.1.2 / 3.2.0 parity.

## Executed gate

The maintainer executed `bun run check` against the final provider matrix after the gate freeze.

Observed result:

```text
source typecheck               PASS
test typecheck                 PASS
benchmark typecheck            PASS
runtime tests                  84 pass
                               0 fail
                               463 expect() calls
Zod post-P9 matrix             PASS
ArkType post-P9 matrix         PASS
Valibot post-P9 matrix         PASS
OpenAPI 3.1.2 parity           PASS
OpenAPI 3.2.0 parity           PASS
```

P10-E introduces no package source changes. The buildable package source is identical to the already-accepted P10-D source tree, whose build gate passed.

## Development corrections

Two typecheck failures occurred while constructing the provider test matrix. Neither exposed a runtime or provider defect and neither caused a gate relaxation:

1. dynamically constructed route paths had widened to `string`; the test was corrected to preserve the Gelis-valid template-literal path type `` `/${string}` ``;
2. the shared provider fixture widened response outputs to `unknown`; it was corrected to retain the real provider output categories (`Record<string, unknown>` for object schemas and `string` for string schemas) required by Gelis response contracts.

No `any`, forced `never` cast, provider-specific source adapter, reflection fallback, hidden schema invention, or core/runtime change was introduced.

## Acceptance decision

The frozen provider compatibility gates passed without relaxation.

Therefore:

```text
P10-E PROVIDER COMPATIBILITY ACCEPTED / FROZEN
```

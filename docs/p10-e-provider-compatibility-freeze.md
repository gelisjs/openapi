# P10-E Provider Compatibility Freeze

**Status:** ACCEPTED / FROZEN  
**Phase:** P10-E  
**Date:** 2026-09-09  
**Depends on:** P10-D accepted post-P9 OpenAPI integration, P10-B method/version freeze, P10-C request-body/media freeze

## Purpose

This document freezes the provider-compatibility correctness gate for `@gelis/openapi` before P10-E results are observed.

P10-E verifies that the post-P9 OpenAPI projection remains provider-neutral across the currently supported Standard Schema / Standard JSON Schema providers used by the project.

It does not authorize provider-specific reflection, provider-specific runtime adapters, or provider-specific OpenAPI fallbacks.

## Provider boundary

The accepted integration boundary remains:

```text
schema provider
    ↓
Standard Schema V1 runtime contract
    +
Standard JSON Schema V1 serialization capability
    ↓
@gelis/openapi
```

`@gelis/openapi` must not special-case Zod, ArkType, or Valibot by library identity.

The package may only consume the standard capabilities already exposed by the schema object or an official standards wrapper.

Provider compatibility means equivalent Gelis/OpenAPI semantics, aggregate error behavior, media projection rules, and version-neutral schema projection. It does not require byte-identical provider JSON Schema output.

## Frozen provider matrix

```text
Zod      4.5.4
ArkType  2.2.3
Valibot  1.4.2 + @valibot/to-json-schema 1.7.1
```

Future provider upgrades are separate compatibility events and must rerun this matrix.

## Required positive coverage

For each provider, P10-E must verify at minimum:

1. runtime schema still satisfies Standard Schema V1;
2. serialization capability satisfies Standard JSON Schema V1;
3. automatic request input projection succeeds;
4. automatic response output projection succeeds;
5. default JSON body projects to `application/json`;
6. explicit multi-media JSON aliases project the same semantic schema under every runtime-owned media key;
7. a text body with a string schema projects through the text parser;
8. a urlencoded body with an object schema projects through the urlencoded parser;
9. a provider-convertible multipart object schema projects through the multipart parser;
10. query input projection and response output projection remain functional in the same provider suite;
11. the same route semantics project without generation issues under OpenAPI 3.1.2 and 3.2.0.

Provider-specific JSON Schema decoration may differ. Tests must assert semantic properties, media keys, and successful projection rather than unstable library-specific formatting.

## Multipart boundary

P10-E does not claim that arbitrary Web Standard `File` runtime schemas are serializable by every provider.

```text
runtime multipart capability
        !=
portable JSON Schema File serialization guarantee
```

Positive provider tests use provider-convertible multipart object schemas. A non-serializable multipart schema must continue to surface a deterministic generation issue through the aggregate error model. No hidden fallback may invent a file schema.

## arrayBuffer boundary

Default `arrayBuffer` projection is provider-independent and remains opaque:

```text
application/octet-stream: {}
```

Explicit OpenAPI schema metadata remains the supported path for documented binary schemas.

## Multi-media occurrence rule

For explicit `bodyContentTypes`, one semantic provider input schema may project to multiple OpenAPI content entries.

Required invariant:

```text
provider conversion work is not multiplied unnecessarily
fresh projected occurrence ownership is preserved
```

The exact memoization implementation is not public API.

## OpenAPI version rule

Provider conversion is version-neutral for the features covered here. Selecting 3.1.2 versus 3.2.0 may alter method encoding, but must not alter semantic request/query/response schemas merely because of output version.

## Failure semantics

The correctness gate is fail-closed. Any provider conversion failure must remain an `OpenAPIGenerationIssue` collected by the existing aggregate generation model.

P10-E must not swallow provider exceptions, silently emit `{}` for an automatically serializable schema, inspect provider internals to guess replacement schemas, downgrade a provider to documentation-only behavior, or mutate Gelis runtime semantics.

## No runtime/core changes

P10-E is tooling compatibility work only. It authorizes no Gelis core hot-path changes and no request-time OpenAPI work.

## Acceptance gate

P10-E is accepted only when all of the following hold:

```text
bun run typecheck             PASS
bun run typecheck:tests       PASS
bun run typecheck:bench       PASS
bun test test/runtime         0 fail
bun run build                 PASS

Zod post-P9 matrix            PASS
ArkType post-P9 matrix        PASS
Valibot post-P9 matrix        PASS
OpenAPI 3.1.2 parity          PASS
OpenAPI 3.2.0 parity          PASS
no provider-specific source adapter introduced
```

There is no performance threshold in P10-E. Performance/scaling belongs to P10-F and must be frozen separately before measurement.

## Freeze decision

```text
P10-E PROVIDER COMPATIBILITY GATES FROZEN
```

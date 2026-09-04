# @gelis/openapi

OpenAPI 3.1 contract generation for Gelis.

> Status: OpenAPI architecture v0.1 accepted and frozen.

`@gelis/openapi` is the official optional OpenAPI package for the Gelis TypeScript backend framework.

The package consumes Gelis application contract snapshots and projects them into deterministic OpenAPI 3.1 documents.

## Package

```text
npm:    @gelis/openapi
GitHub: gelisjs/openapi
```

## Architecture

The accepted v0.1 architecture is documented in:

```text
docs/architecture-v0.1.md
```

The package consumes Gelis through the public contract-inspection boundary and does not depend on router or request-execution internals.

## Current specification target

```text
OpenAPI:     3.1.2
JSON Schema: draft 2020-12
```

## Public generation API

```ts
import { generateOpenAPI } from "@gelis/openapi";

const document = generateOpenAPI(app, {
  info: {
    title: "Example API",
    version: "1.0.0",
  },
});
```

## Development

```bash
bun install
bun run check
```

Generation benchmark:

```bash
bun run bench:generation -- --sizes=100,1000,5000 --runs=9 --warmups=3
```

## Roadmap

After the OpenAPI v0.1 architecture freeze, Gelis moves into:

```text
Performance Architecture Re-evaluation v0.2
        ↓
Router Grammar & Matching v0.2
```

import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Gelis } from "gelis";
import type { StandardJSONSchemaV1, StandardSchemaV1 } from "gelis";

import type * as OpenAPIModuleType from "../../src/index";

type CaseId =
  | "metadata-only"
  | "import-plain"
  | "import-rich"
  | "generate-plain"
  | "generate-rich";

type Variant = "control" | "candidate";

interface Payload {
  readonly id: string;
  readonly value: number;
  readonly tags: readonly string[];
}

type PayloadSchema = StandardSchemaV1<Payload, Payload> &
  StandardJSONSchemaV1<Payload, Payload>;

const ROUTES = 5_000;
const TARGET_INDEX = ROUTES - 1;
const WARMUP_ITERATIONS = 10_000;
const MEASURED_ITERATIONS = 20_000;

const args = process.argv.slice(2);
const root = readRoot(args);
const caseId = readCase(args);
const variant = readVariant(args);

const needsOpenAPI =
  variant === "candidate" &&
  (caseId === "import-plain" ||
    caseId === "import-rich" ||
    caseId === "generate-plain" ||
    caseId === "generate-rich");

const openapiModule = needsOpenAPI
  ? ((await import(
      pathToFileURL(resolve(root, "src/index.ts")).href
    )) as typeof OpenAPIModuleType)
  : undefined;

if (needsOpenAPI && typeof openapiModule?.generateOpenAPI !== "function") {
  throw new Error("P10-G candidate public entrypoint did not expose generateOpenAPI");
}

const rich = caseId === "import-rich" || caseId === "generate-rich";
const documented = caseId !== "metadata-only" || variant === "candidate";
const application = rich
  ? createRichApplication(documented)
  : createPlainApplication(documented);

if (
  variant === "candidate" &&
  (caseId === "generate-plain" || caseId === "generate-rich")
) {
  const fetchBefore = application.fetch;
  const document = openapiModule!.generateOpenAPI(application, {
    version: "3.2.0",
    info: {
      title: "Gelis P10-G Runtime Isolation",
      version: "0.0.0",
    },
  });

  if (application.fetch !== fetchBefore) {
    throw new Error("generateOpenAPI() replaced the Gelis fetch entrypoint");
  }

  if (document.openapi !== "3.2.0") {
    throw new Error(`Expected generated OpenAPI 3.2.0, received ${document.openapi}`);
  }

  const pathCount = Object.keys(document.paths).length;
  if (pathCount !== ROUTES) {
    throw new Error(
      `Expected ${ROUTES} generated paths, received ${pathCount}`,
    );
  }
}

const request = rich
  ? new Request(
      `http://gelis.test/p10-g/rich/${TARGET_INDEX}?id=target&value=1&tags=gelis`,
    )
  : new Request(`http://gelis.test/p10-g/plain/${TARGET_INDEX}`);

let sink = 0;

await verifyCorrectness(application, request, rich);
await warmup(application, request);

writeMessage({
  type: "ready",
  caseId,
  variant,
});

const input = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const line of input) {
  if (line === "measure") {
    Bun.gc(true);
    writeMessage({
      type: "measurement",
      ns: await measure(application, request),
    });
    continue;
  }

  if (line === "close") {
    input.close();
    break;
  }

  throw new Error(`Unknown P10-G worker command: ${line}`);
}

void sink;

function createPlainApplication(documentedRoutes: boolean): Gelis {
  const app = new Gelis();
  const sharedResponse = new Response("ok");

  for (let index = 0; index < ROUTES; index++) {
    const path: `/${string}` = `/p10-g/plain/${index}`;

    if (documentedRoutes) {
      app.get(
        path,
        {
          openapi: {
            summary: `P10-G plain route ${index}`,
          },
        },
        () => sharedResponse,
      );
      continue;
    }

    app.get(path, () => sharedResponse);
  }

  return app;
}

function createRichApplication(documentedRoutes: boolean): Gelis {
  const app = new Gelis();
  const schema = createPayloadSchema();
  const payload: Payload = {
    id: "target",
    value: 1,
    tags: ["gelis"],
  };

  for (let index = 0; index < ROUTES; index++) {
    const path: `/${string}` = `/p10-g/rich/${index}`;
    const options = {
      query: schema,
      responses: {
        200: {
          schema,
          serialize: "json" as const,
          validate: true as const,
        },
      },
      ...(documentedRoutes
        ? {
            openapi: {
              summary: `P10-G rich route ${index}`,
            },
          }
        : {}),
    };

    app.get(
      path,
      options,
      () => payload,
      {
        beforeHandle() {},
        afterHandle() {},
      },
    );
  }

  return app;
}

function createPayloadSchema(): PayloadSchema {
  return {
    "~standard": {
      version: 1,
      vendor: "gelis-p10-g",
      validate(value: unknown) {
        return {
          value: value as Payload,
        };
      },
      jsonSchema: {
        input() {
          return createPayloadJSONSchema();
        },
        output() {
          return createPayloadJSONSchema();
        },
      },
    },
  };
}

function createPayloadJSONSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      id: { type: "string" },
      value: { type: "number" },
      tags: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["id", "value", "tags"],
    additionalProperties: false,
  };
}

async function verifyCorrectness(
  app: Gelis,
  request: Request,
  rich: boolean,
): Promise<void> {
  const response = await app.fetch(request);

  if (!(response instanceof Response)) {
    throw new Error("P10-G worker did not return a Response");
  }

  if (response.status !== 200) {
    throw new Error(`P10-G worker returned status ${response.status}`);
  }

  if (!rich) {
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Expected JSON content type, received ${contentType}`);
  }

  const body = (await response.json()) as Partial<Payload>;
  if (
    body.id !== "target" ||
    body.value !== 1 ||
    !Array.isArray(body.tags) ||
    body.tags[0] !== "gelis"
  ) {
    throw new Error("P10-G rich response correctness validation failed");
  }
}

async function warmup(app: Gelis, request: Request): Promise<void> {
  for (let index = 0; index < WARMUP_ITERATIONS; index++) {
    await consume(app.fetch(request));
  }
}

async function measure(app: Gelis, request: Request): Promise<number> {
  const started = performance.now();

  for (let index = 0; index < MEASURED_ITERATIONS; index++) {
    await consume(app.fetch(request));
  }

  return ((performance.now() - started) * 1_000_000) / MEASURED_ITERATIONS;
}

async function consume(result: Response | Promise<Response>): Promise<void> {
  const response = await result;
  sink += response.status;
}

function readRoot(values: readonly string[]): string {
  const argument = values.find((value) => value.startsWith("--root="));
  const value = argument?.slice("--root=".length);

  if (!value) {
    throw new Error("Expected --root=<candidate-root>");
  }

  return resolve(value);
}

function readCase(values: readonly string[]): CaseId {
  const argument = values.find((value) => value.startsWith("--case="));
  const value = argument?.slice("--case=".length);

  if (
    value === "metadata-only" ||
    value === "import-plain" ||
    value === "import-rich" ||
    value === "generate-plain" ||
    value === "generate-rich"
  ) {
    return value;
  }

  throw new Error(
    "Expected --case=metadata-only|import-plain|import-rich|generate-plain|generate-rich",
  );
}

function readVariant(values: readonly string[]): Variant {
  const argument = values.find((value) => value.startsWith("--variant="));
  const value = argument?.slice("--variant=".length);

  if (value === "control" || value === "candidate") {
    return value;
  }

  throw new Error("Expected --variant=control|candidate");
}

function writeMessage(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

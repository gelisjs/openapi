import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from "gelis";

import type * as GelisModuleType from "gelis";
import type * as OpenAPIModuleType from "../../src/index";
import type * as PathModuleType from "../../src/path";

type LegacyScenario = "plain" | "shared" | "unique";
type LegacyMode = "projection" | "end-to-end" | "public";
type RichMode = "projection" | "public";
type OpenAPIVersion = "3.1.2" | "3.2.0";

type CaseConfig =
  | {
      readonly kind: "legacy";
      readonly scenario: LegacyScenario;
      readonly mode: LegacyMode;
      readonly size: number;
    }
  | {
      readonly kind: "rich";
      readonly mode: RichMode;
      readonly version: OpenAPIVersion;
      readonly size: number;
    };

type WorkerCommand =
  | {
      readonly id: number;
      readonly action: "setup";
      readonly config: CaseConfig;
    }
  | {
      readonly id: number;
      readonly action: "warmup";
      readonly count: number;
    }
  | {
      readonly id: number;
      readonly action: "measure";
    }
  | {
      readonly id: number;
      readonly action: "close";
    };

interface Measurement {
  readonly elapsedMs: number;
  readonly documentBytes?: number;
}

interface Payload {
  readonly id: string;
  readonly value: number;
  readonly tags: readonly string[];
}

type ObjectSchema = StandardSchemaV1<Payload, Payload> &
  StandardJSONSchemaV1<Payload, Payload>;

type StringSchema = StandardSchemaV1<string, string> &
  StandardJSONSchemaV1<string, string>;

type BinarySchema = StandardSchemaV1<ArrayBuffer, ArrayBuffer>;

interface PreparedCase {
  readonly config: CaseConfig;
  readonly run: () => unknown;
}

const root = parseRoot(process.argv.slice(2));
const requireFromRoot = createRequire(resolve(root, "package.json"));
const gelisEntry = requireFromRoot.resolve("gelis");

const gelisModule = (await import(
  pathToFileURL(gelisEntry).href
)) as typeof GelisModuleType;

const openapiModule = (await import(
  pathToFileURL(resolve(root, "src/index.ts")).href
)) as typeof OpenAPIModuleType;

const pathModule = (await import(
  pathToFileURL(resolve(root, "src/path.ts")).href
)) as typeof PathModuleType;

const { Gelis, inspectContract } = gelisModule;
const { generateOpenAPI } = openapiModule;
const { projectPaths } = pathModule;

let prepared: PreparedCase | undefined;

process.on("message", (message: unknown) => {
  void handleMessage(message);
});

process.send?.({
  type: "ready",
  root,
});

async function handleMessage(message: unknown): Promise<void> {
  if (!isWorkerCommand(message)) {
    process.send?.({
      type: "fatal",
      error: "Invalid worker command.",
    });
    return;
  }

  try {
    switch (message.action) {
      case "setup": {
        prepared = prepareCase(message.config);
        validateRun(prepared);
        process.send?.({ id: message.id, ok: true });
        return;
      }

      case "warmup": {
        const active = requirePrepared();
        for (let index = 0; index < message.count; index++) {
          validateRun(active);
        }
        process.send?.({ id: message.id, ok: true });
        return;
      }

      case "measure": {
        const active = requirePrepared();
        Bun.gc(true);
        const measurement = measure(active);
        process.send?.({
          id: message.id,
          ok: true,
          measurement,
        });
        return;
      }

      case "close": {
        process.send?.({ id: message.id, ok: true });
        process.disconnect?.();
        process.exit(0);
      }
    }
  } catch (cause) {
    process.send?.({
      id: message.id,
      ok: false,
      error: errorMessage(cause),
    });
  }
}

function prepareCase(config: CaseConfig): PreparedCase {
  if (config.kind === "legacy") {
    const app = createLegacyApplication(config.scenario, config.size);
    const snapshot = inspectContract(app);

    return {
      config,
      run() {
        switch (config.mode) {
          case "projection":
            return projectPaths(snapshot);

          case "end-to-end":
            return projectPaths(inspectContract(app));

          case "public":
            return generateOpenAPI(app, {
              info: {
                title: "Gelis P10-F Legacy",
                version: "0.0.0",
              },
            });
        }
      },
    };
  }

  const app = createRichApplication(config.size);
  const snapshot = inspectContract(app);

  return {
    config,
    run() {
      if (config.mode === "projection") {
        return projectPaths(snapshot, config.version);
      }

      return generateOpenAPI(app, {
        version: config.version,
        info: {
          title: "Gelis P10-F Rich",
          version: "0.0.0",
        },
      });
    },
  };
}

function measure(active: PreparedCase): Measurement {
  const started = performance.now();
  const result = active.run();
  const elapsedMs = performance.now() - started;

  validateResult(active.config, result);

  const documentBytes =
    active.config.kind === "rich" && active.config.mode === "public"
      ? Buffer.byteLength(JSON.stringify(result), "utf8")
      : undefined;

  return {
    elapsedMs,
    ...(documentBytes === undefined ? {} : { documentBytes }),
  };
}

function validateRun(active: PreparedCase): void {
  validateResult(active.config, active.run());
}

function validateResult(config: CaseConfig, result: unknown): void {
  if (!isRecord(result)) {
    throw new Error("Benchmark generation did not return an object.");
  }

  if (config.mode === "projection" || config.mode === "end-to-end") {
    const issues = result.issues;
    if (!Array.isArray(issues) || issues.length !== 0) {
      throw new Error(
        `${describeCase(config)} produced ${Array.isArray(issues) ? issues.length : "invalid"} generation issue(s).`,
      );
    }
  }

  const paths = result.paths;
  if (!isRecord(paths)) {
    throw new Error(`${describeCase(config)} did not produce a paths object.`);
  }

  const pathCount = Object.keys(paths).length;
  if (pathCount !== config.size) {
    throw new Error(
      `${describeCase(config)} expected ${config.size} paths, received ${pathCount}.`,
    );
  }

  if (config.kind === "rich" && config.mode === "public") {
    if (result.openapi !== config.version) {
      throw new Error(
        `${describeCase(config)} expected OpenAPI ${config.version}, received ${String(result.openapi)}.`,
      );
    }
  }
}

function createLegacyApplication(
  scenario: LegacyScenario,
  size: number,
): InstanceType<typeof Gelis> {
  const app = new Gelis();

  if (scenario === "plain") {
    for (let index = 0; index < size; index++) {
      const path: `/${string}` = `/bench/plain/${index}/:id`;
      app.get(path, () => new Response());
    }

    return app;
  }

  const sharedSchema = scenario === "shared" ? createObjectSchema() : undefined;

  for (let index = 0; index < size; index++) {
    const schema = sharedSchema ?? createObjectSchema();
    const path: `/${string}` = `/bench/${scenario}/${index}/:id`;

    app.post(
      path,
      {
        body: schema,
        responses: {
          200: {
            schema,
            serialize: "json",
          },
        },
      },
      () => new Response(),
    );
  }

  return app;
}

function createRichApplication(size: number): InstanceType<typeof Gelis> {
  const app = new Gelis();
  const sharedObject = createObjectSchema();
  const sharedString = createStringSchema();
  const sharedBinary = createBinarySchema();

  for (let index = 0; index < size; index++) {
    const path: `/${string}` = `/bench/rich/${index}/:id`;

    switch (index % 8) {
      case 0:
        app.get(
          path,
          {
            query: sharedObject,
            responses: {
              200: {
                schema: sharedObject,
                serialize: "json",
              },
            },
          },
          () => new Response(),
        );
        break;

      case 1:
        app.post(
          path,
          {
            body: sharedObject,
            bodyContentTypes: [
              "application/json",
              "application/vnd.gelis+json",
            ],
            responses: {
              200: {
                schema: sharedObject,
                serialize: "json",
              },
            },
          },
          () => new Response(),
        );
        break;

      case 2:
        app.query(
          path,
          {
            query: sharedObject,
            responses: {
              200: {
                schema: sharedObject,
                serialize: "json",
              },
            },
          },
          () => new Response(),
        );
        break;

      case 3:
        app.route(
          "PURGE",
          path,
          {
            responses: {
              204: undefined,
            },
          },
          () => new Response(null, { status: 204 }),
        );
        break;

      case 4:
        app.post(
          path,
          {
            body: sharedString,
            bodyParser: "text",
            responses: {
              204: undefined,
            },
          },
          () => new Response(null, { status: 204 }),
        );
        break;

      case 5:
        app.post(
          path,
          {
            body: sharedObject,
            bodyParser: "urlencoded",
            responses: {
              204: undefined,
            },
          },
          () => new Response(null, { status: 204 }),
        );
        break;

      case 6:
        app.post(
          path,
          {
            body: sharedObject,
            bodyParser: "multipart",
            responses: {
              204: undefined,
            },
          },
          () => new Response(null, { status: 204 }),
        );
        break;

      case 7:
        app.post(
          path,
          {
            body: sharedBinary,
            bodyParser: "arrayBuffer",
            responses: {
              204: undefined,
            },
          },
          () => new Response(null, { status: 204 }),
        );
        break;
    }
  }

  return app;
}

function createObjectSchema(): ObjectSchema {
  return {
    "~standard": {
      version: 1,
      vendor: "gelis-p10-f-benchmark",
      validate(value: unknown) {
        return {
          value: value as Payload,
        };
      },
      jsonSchema: {
        input(options) {
          assertTarget(options.target);
          return createObjectJSONSchema();
        },
        output(options) {
          assertTarget(options.target);
          return createObjectJSONSchema();
        },
      },
    },
  };
}

function createStringSchema(): StringSchema {
  return {
    "~standard": {
      version: 1,
      vendor: "gelis-p10-f-benchmark",
      validate(value: unknown) {
        return {
          value: String(value),
        };
      },
      jsonSchema: {
        input(options) {
          assertTarget(options.target);
          return { type: "string" };
        },
        output(options) {
          assertTarget(options.target);
          return { type: "string" };
        },
      },
    },
  };
}

function createBinarySchema(): BinarySchema {
  return {
    "~standard": {
      version: 1,
      vendor: "gelis-p10-f-benchmark",
      validate(value: unknown) {
        if (value instanceof ArrayBuffer) {
          return { value };
        }

        return {
          issues: [
            {
              message: "Expected ArrayBuffer.",
            },
          ],
        };
      },
    },
  };
}

function createObjectJSONSchema(): Record<string, unknown> {
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

function assertTarget(target: StandardJSONSchemaV1.Target): void {
  if (target !== "draft-2020-12") {
    throw new Error(`Unexpected Standard JSON Schema target: ${target}`);
  }
}

function requirePrepared(): PreparedCase {
  if (prepared === undefined) {
    throw new Error("Worker case has not been prepared.");
  }

  return prepared;
}

function describeCase(config: CaseConfig): string {
  if (config.kind === "legacy") {
    return `${config.kind}/${config.scenario}/${config.mode}/${config.size}`;
  }

  return `${config.kind}/${config.mode}/${config.version}/${config.size}`;
}

function parseRoot(args: readonly string[]): string {
  const entry = args.find((argument) => argument.startsWith("--root="));

  if (entry === undefined) {
    throw new Error("Missing --root=<repository-root>.");
  }

  return resolve(entry.slice("--root=".length));
}

function isWorkerCommand(value: unknown): value is WorkerCommand {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "number" &&
    typeof value.action === "string" &&
    ["setup", "warmup", "measure", "close"].includes(value.action)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.stack ?? cause.message : String(cause);
}

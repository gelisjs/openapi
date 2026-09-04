import { Gelis, inspectContract } from "gelis";

import type { StandardJSONSchemaV1, StandardSchemaV1 } from "gelis";

import { generateOpenAPI } from "../../src";

import { projectPaths } from "../../src/path";

type Scenario = "plain" | "shared" | "unique";

type Mode = "projection" | "end-to-end" | "public";

interface Config {
  readonly sizes: readonly number[];

  readonly runs: number;

  readonly warmups: number;
}

interface BenchmarkResult {
  readonly scenario: Scenario;

  readonly mode: Mode;

  readonly routes: number;

  readonly medianMs: number;

  readonly minMs: number;

  readonly maxMs: number;

  readonly perRouteUs: number;
}

interface Payload {
  readonly id: string;

  readonly value: number;

  readonly tags: readonly string[];
}

type BenchSchema = StandardSchemaV1<Payload, Payload> & StandardJSONSchemaV1<Payload, Payload>;

const DEFAULT_SIZES = [100, 1_000, 5_000] as const;

const DEFAULT_RUNS = 9;

const DEFAULT_WARMUPS = 3;

const SCENARIOS: readonly Scenario[] = ["plain", "shared", "unique"];

const MODES: readonly Mode[] = ["projection", "end-to-end", "public"];

const PUBLIC_GENERATION_OPTIONS = {
  info: {
    title: "Gelis Benchmark",

    version: "0.0.0",
  },
} as const;

const config = parseConfig(process.argv.slice(2));

const results: BenchmarkResult[] = [];

console.log("OpenAPI Generation Scaling Benchmark");

console.log(`Bun ${Bun.version}`);

console.log(`sizes=${config.sizes.join(",")} runs=${config.runs} warmups=${config.warmups}`);

console.log();

for (const scenario of SCENARIOS) {
  for (const size of config.sizes) {
    const app = createApplication(scenario, size);

    const snapshot = inspectContract(app);

    const preflight = projectPaths(snapshot);

    assertProjection(scenario, size, preflight.paths, preflight.issues);

    const publicPreflight = generateOpenAPI(
      app,

      PUBLIC_GENERATION_OPTIONS,
    );

    assertPathCount(scenario, "public", size, publicPreflight.paths);

    for (const mode of MODES) {
      const sample = benchmark(
        () => runMode(mode, app, snapshot, scenario, size),

        config.warmups,
        config.runs,
      );

      results.push({
        scenario,
        mode,
        routes: size,

        medianMs: sample.median,

        minMs: sample.min,

        maxMs: sample.max,

        perRouteUs: (sample.median * 1_000) / size,
      });
    }
  }
}

printResults(results);

printScaling(results, config.sizes);

function runMode(
  mode: Mode,

  app: Gelis,

  snapshot: ReturnType<typeof inspectContract>,

  scenario: Scenario,

  size: number,
): number {
  if (mode === "public") {
    const document = generateOpenAPI(
      app,

      PUBLIC_GENERATION_OPTIONS,
    );

    return assertPathCount(scenario, mode, size, document.paths);
  }

  const result = mode === "projection" ? projectPaths(snapshot) : projectPaths(inspectContract(app));

  if (result.issues.length !== 0) {
    throw new Error(`${scenario}/${mode}/${size}: projection produced ${result.issues.length} issue(s)`);
  }

  return assertPathCount(scenario, mode, size, result.paths);
}

function assertPathCount(
  scenario: Scenario,

  mode: Mode,

  size: number,

  paths: Record<string, unknown>,
): number {
  const count = Object.keys(paths).length;

  if (count !== size) {
    throw new Error(`${scenario}/${mode}/${size}: expected ${size} paths, received ${count}`);
  }

  return count;
}

function createApplication(
  scenario: Scenario,

  size: number,
): Gelis {
  const app = new Gelis();

  if (scenario === "plain") {
    for (let index = 0; index < size; index++) {
      app.get(
        `/bench/plain/${index}/:id`,

        () => new Response(),
      );
    }

    return app;
  }

  const sharedSchema = scenario === "shared" ? createSchema() : undefined;

  for (let index = 0; index < size; index++) {
    const schema = sharedSchema ?? createSchema();

    app.post(
      `/bench/${scenario}/${index}/:id`,

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

function createSchema(): BenchSchema {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-openapi-benchmark",

      validate(value: unknown) {
        return {
          value: value as Payload,
        };
      },

      jsonSchema: {
        input(options) {
          assertTarget(options.target);

          return createJSONSchema();
        },

        output(options) {
          assertTarget(options.target);

          return createJSONSchema();
        },
      },
    },
  };
}

function createJSONSchema(): Record<string, unknown> {
  return {
    type: "object",

    properties: {
      id: {
        type: "string",
      },

      value: {
        type: "number",
      },

      tags: {
        type: "array",

        items: {
          type: "string",
        },
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

function assertProjection(
  scenario: Scenario,

  size: number,

  paths: Record<string, unknown>,

  issues: readonly unknown[],
): void {
  if (issues.length !== 0) {
    throw new Error(`${scenario}/${size}: preflight produced ${issues.length} issue(s)`);
  }

  const pathCount = Object.keys(paths).length;

  if (pathCount !== size) {
    throw new Error(`${scenario}/${size}: expected ${size} projected paths, received ${pathCount}`);
  }
}

function benchmark(
  run: () => number,

  warmups: number,

  runs: number,
): {
  readonly median: number;

  readonly min: number;

  readonly max: number;
} {
  for (let index = 0; index < warmups; index++) {
    run();
  }

  const samples: number[] = [];

  for (let index = 0; index < runs; index++) {
    const started = performance.now();

    run();

    const elapsed = performance.now() - started;

    samples.push(elapsed);
  }

  samples.sort(compareNumbers);

  const median = samples[Math.floor(samples.length / 2)];

  const min = samples[0];

  const max = samples[samples.length - 1];

  if (median === undefined || min === undefined || max === undefined) {
    throw new Error("Benchmark did not produce samples.");
  }

  return {
    median,
    min,
    max,
  };
}

function printResults(results: readonly BenchmarkResult[]): void {
  console.log("| scenario | mode | routes | median ms | min ms | max ms | us/route |");

  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: |");

  for (const result of results) {
    console.log(
      `| ${result.scenario} | ${result.mode} | ${result.routes} | ${format(result.medianMs)} | ${format(result.minMs)} | ${format(result.maxMs)} | ${format(result.perRouteUs)} |`,
    );
  }
}

function printScaling(
  results: readonly BenchmarkResult[],

  sizes: readonly number[],
): void {
  console.log();
  console.log("Scaling ratios (median)");

  console.log("| scenario | mode | from | to | route multiplier | time multiplier |");

  console.log("| --- | --- | ---: | ---: | ---: | ---: |");

  for (const scenario of SCENARIOS) {
    for (const mode of MODES) {
      for (let index = 1; index < sizes.length; index++) {
        const from = sizes[index - 1];

        const to = sizes[index];

        if (from === undefined || to === undefined) {
          continue;
        }

        const previous = results.find(
          (result) => result.scenario === scenario && result.mode === mode && result.routes === from,
        );

        const current = results.find(
          (result) => result.scenario === scenario && result.mode === mode && result.routes === to,
        );

        if (previous === undefined || current === undefined) {
          throw new Error("Missing benchmark result for scaling calculation.");
        }

        console.log(
          `| ${scenario} | ${mode} | ${from} | ${to} | ${format(to / from)}x | ${format(current.medianMs / previous.medianMs)}x |`,
        );
      }
    }
  }
}

function parseConfig(args: readonly string[]): Config {
  let sizes: readonly number[] = DEFAULT_SIZES;

  let runs = DEFAULT_RUNS;

  let warmups = DEFAULT_WARMUPS;

  for (const argument of args) {
    if (argument.startsWith("--sizes=")) {
      sizes = parsePositiveIntegers(argument.slice("--sizes=".length));

      continue;
    }

    if (argument.startsWith("--runs=")) {
      runs = parsePositiveInteger(argument.slice("--runs=".length), "runs");

      continue;
    }

    if (argument.startsWith("--warmups=")) {
      warmups = parseNonNegativeInteger(argument.slice("--warmups=".length), "warmups");

      continue;
    }

    throw new Error(`Unknown benchmark argument: ${argument}`);
  }

  if (runs % 2 === 0) {
    throw new Error("--runs must be odd so the median is an observed sample.");
  }

  return {
    sizes,
    runs,
    warmups,
  };
}

function parsePositiveIntegers(value: string): readonly number[] {
  const parsed = value.split(",").map((part) => parsePositiveInteger(part, "size"));

  if (parsed.length === 0) {
    throw new Error("--sizes must contain at least one route count.");
  }

  return parsed;
}

function parsePositiveInteger(
  value: string,

  name: string,
): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive safe integer.`);
  }

  return parsed;
}

function parseNonNegativeInteger(
  value: string,

  name: string,
): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative safe integer.`);
  }

  return parsed;
}

function format(value: number): string {
  return value.toFixed(3);
}

function compareNumbers(
  left: number,

  right: number,
): number {
  return left - right;
}

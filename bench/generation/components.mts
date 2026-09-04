import type { StandardJSONSchemaV1, StandardSchemaV1 } from "gelis";

import { prepareSchemaResource } from "../../src/schema-resource";

import { createStandardJSONSchemaResolver } from "../../src/standard-json-schema";

interface Payload {
  readonly id: string;

  readonly value: number;

  readonly tags: readonly string[];
}

type BenchSchema = StandardSchemaV1<Payload, Payload> & StandardJSONSchemaV1<Payload, Payload>;

interface Config {
  readonly iterations: number;

  readonly runs: number;

  readonly warmups: number;
}

interface Result {
  readonly name: string;

  readonly medianMs: number;

  readonly minMs: number;

  readonly maxMs: number;

  readonly usPerOperation: number;
}

type Operation = (index: number) => number;

type Setup = () => Operation;

const config = parseConfig(process.argv.slice(2));

let sink = 0;

const cases: readonly {
  readonly name: string;

  readonly setup: Setup;
}[] = [
  {
    name: "structured-clone",

    setup() {
      const schema = createJSONSchema();

      return () => {
        const cloned = structuredClone(schema);

        return countKeys(cloned);
      };
    },
  },

  {
    name: "resource-simple",

    setup() {
      const schema = createJSONSchema();

      return (index) => {
        const prepared = prepareSchemaResource(
          schema,

          `https://schemas.gelis.invalid/component/simple/${index}`,
        );

        return countKeys(prepared);
      };
    },
  },

  {
    name: "resource-recursive",

    setup() {
      const schema = createRecursiveJSONSchema();

      return (index) => {
        const prepared = prepareSchemaResource(
          schema,

          `https://schemas.gelis.invalid/component/recursive/${index}`,
        );

        return countKeys(prepared);
      };
    },
  },

  {
    name: "resolver-shared-input",

    setup() {
      const resolver = createStandardJSONSchemaResolver();

      const schema = createSchema();

      return () => {
        const resolved = resolver.resolveInput(schema);

        return countKeys(resolved);
      };
    },
  },

  {
    name: "resolver-unique-input",

    setup() {
      const resolver = createStandardJSONSchemaResolver();

      const schemas = Array.from(
        {
          length: config.iterations,
        },

        () => createSchema(),
      );

      return (index) => {
        const schema = schemas[index];

        if (schema === undefined) {
          throw new Error(`Missing schema at index ${index}.`);
        }

        const resolved = resolver.resolveInput(schema);

        return countKeys(resolved);
      };
    },
  },

  {
    name: "production-shared-pair",

    setup() {
      const resolver = createStandardJSONSchemaResolver();

      const schema = createSchema();

      return (index) => {
        const input = prepareSchemaResource(
          resolver.resolveInput(schema),

          `https://schemas.gelis.invalid/component/shared/${index}/body`,
        );

        const output = prepareSchemaResource(
          resolver.resolveOutput(schema),

          `https://schemas.gelis.invalid/component/shared/${index}/response`,
        );

        return countKeys(input) + countKeys(output);
      };
    },
  },

  {
    name: "production-unique-pair",

    setup() {
      const resolver = createStandardJSONSchemaResolver();

      const schemas = Array.from(
        {
          length: config.iterations,
        },

        () => createSchema(),
      );

      return (index) => {
        const schema = schemas[index];

        if (schema === undefined) {
          throw new Error(`Missing schema at index ${index}.`);
        }

        const input = prepareSchemaResource(
          resolver.resolveInput(schema),

          `https://schemas.gelis.invalid/component/unique/${index}/body`,
        );

        const output = prepareSchemaResource(
          resolver.resolveOutput(schema),

          `https://schemas.gelis.invalid/component/unique/${index}/response`,
        );

        return countKeys(input) + countKeys(output);
      };
    },
  },
];

const results: Result[] = [];

console.log("OpenAPI Generation Component Benchmark");

console.log(`Bun ${Bun.version}`);

console.log(`iterations=${config.iterations} runs=${config.runs} warmups=${config.warmups}`);

console.log();

for (const benchmarkCase of cases) {
  const samples: number[] = [];

  for (let index = 0; index < config.warmups; index++) {
    execute(benchmarkCase.setup(), config.iterations);
  }

  for (let index = 0; index < config.runs; index++) {
    const operation = benchmarkCase.setup();

    const started = performance.now();

    execute(operation, config.iterations);

    samples.push(performance.now() - started);
  }

  samples.sort(compareNumbers);

  const median = samples[Math.floor(samples.length / 2)];

  const min = samples[0];

  const max = samples[samples.length - 1];

  if (median === undefined || min === undefined || max === undefined) {
    throw new Error(`No samples for ${benchmarkCase.name}.`);
  }

  results.push({
    name: benchmarkCase.name,

    medianMs: median,

    minMs: min,

    maxMs: max,

    usPerOperation: (median * 1_000) / config.iterations,
  });
}

console.log("| case | median ms | min ms | max ms | us/op |");

console.log("| --- | ---: | ---: | ---: | ---: |");

for (const result of results) {
  console.log(
    `| ${result.name} | ${format(result.medianMs)} | ${format(result.minMs)} | ${format(result.maxMs)} | ${format(result.usPerOperation)} |`,
  );
}

console.log();
console.log(`sink=${sink}`);

function execute(
  operation: Operation,

  iterations: number,
): void {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    local += operation(index);
  }

  sink ^= local;
}

function createSchema(): BenchSchema {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-openapi-component-benchmark",

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

function createRecursiveJSONSchema(): Record<string, unknown> {
  return {
    $defs: {
      node: {
        type: "object",

        properties: {
          next: {
            $ref: "#/$defs/node",
          },
        },
      },
    },

    $ref: "#/$defs/node",
  };
}

function assertTarget(target: StandardJSONSchemaV1.Target): void {
  if (target !== "draft-2020-12") {
    throw new Error(`Unexpected target: ${target}`);
  }
}

function countKeys(value: unknown): number {
  if (typeof value !== "object" || value === null) {
    return 0;
  }

  return Object.keys(value).length;
}

function parseConfig(args: readonly string[]): Config {
  let iterations = 5_000;

  let runs = 9;

  let warmups = 3;

  for (const argument of args) {
    if (argument.startsWith("--iterations=")) {
      iterations = parsePositiveInteger(
        argument.slice("--iterations=".length),

        "iterations",
      );

      continue;
    }

    if (argument.startsWith("--runs=")) {
      runs = parsePositiveInteger(
        argument.slice("--runs=".length),

        "runs",
      );

      continue;
    }

    if (argument.startsWith("--warmups=")) {
      warmups = parseNonNegativeInteger(
        argument.slice("--warmups=".length),

        "warmups",
      );

      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (runs % 2 === 0) {
    throw new Error("--runs must be odd.");
  }

  return {
    iterations,
    runs,
    warmups,
  };
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

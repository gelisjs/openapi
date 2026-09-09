import { execFileSync, spawn } from "node:child_process";
import { cpus } from "node:os";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const SAMPLES = 41;
const CASE_LIMIT = 1.03;
const PACKAGE_GEOMEAN_LIMIT = 1.02;

type CaseId =
  | "metadata-only"
  | "import-plain"
  | "import-rich"
  | "generate-plain"
  | "generate-rich";

type Variant = "control" | "candidate";

interface WorkerClient {
  readonly measure: () => Promise<number>;
  readonly close: () => Promise<void>;
}

interface Sample {
  readonly order: "control-start" | "candidate-start";
  readonly ratio: number;
}

interface CaseResult {
  readonly caseId: CaseId;
  readonly medianRatio: number;
  readonly controlStartMedian: number;
  readonly candidateStartMedian: number;
  readonly pass: boolean;
}

const caseIds: readonly CaseId[] = [
  "metadata-only",
  "import-plain",
  "import-rich",
  "generate-plain",
  "generate-rich",
];

const args = process.argv.slice(2);
const candidateRoot = readRoot(args, "--candidate-root=", ".");
const candidateHead = gitHead(candidateRoot);
const candidateDirty = gitStatus(candidateRoot) !== "";

if (candidateDirty) {
  throw new Error("P10-G candidate worktree must be clean");
}

const packageJson = JSON.parse(
  readFileSync(resolve(candidateRoot, "package.json"), "utf8"),
) as {
  readonly sideEffects?: unknown;
};

if (packageJson.sideEffects !== false) {
  throw new Error("P10-G requires package.json sideEffects=false");
}

const here = dirname(fileURLToPath(import.meta.url));
const workerPath = resolve(here, "p10-g-zero-runtime-worker.mts");

console.log("\nP10-G zero-runtime-overhead acceptance\n");
console.log(`Runtime:        bun ${Bun.version}`);
console.log(`CPU:            ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Candidate HEAD: ${candidateHead}`);
console.log("Candidate dirty:no");
console.log("Routes:         5,000/case");
console.log("Workers:        four persistent workers/case");
console.log("Pair shape:     semantic ABBA / BAAB");
console.log("Warmup:         10,000 app.fetch calls/worker");
console.log("Measurement:    20,000 app.fetch calls/measurement");
console.log(`Samples:        ${SAMPLES} mirrored samples/case`);
console.log("GC:             Bun.gc(true) inside measured worker");
console.log(`Per-case gate:  candidate/control <= ${CASE_LIMIT.toFixed(2)}x`);
console.log(
  `Package geomean gate (B1/B2/C1/C2): <= ${PACKAGE_GEOMEAN_LIMIT.toFixed(2)}x`,
);
console.log("Order buckets:  diagnostic only");

const results: CaseResult[] = [];

for (const caseId of caseIds) {
  results.push(await runCase(caseId));
}

console.log("\nP10-G zero-runtime-overhead summary\n");
console.table(
  results.map((result) => ({
    case: result.caseId,
    "median ratio": round(result.medianRatio, 4),
    "control-start": round(result.controlStartMedian, 4),
    "candidate-start": round(result.candidateStartMedian, 4),
    gate: `<= ${CASE_LIMIT.toFixed(2)}x`,
    verdict: result.pass ? "PASS" : "FAIL",
  })),
);

const packageCases = results.filter(
  (result) => result.caseId !== "metadata-only",
);
const packageGeomean = geometricMean(
  packageCases.map((result) => result.medianRatio),
);
const packageGeomeanPass = packageGeomean <= PACKAGE_GEOMEAN_LIMIT;

console.log();
console.log(
  `Package geomean: ${formatRatio(packageGeomean)} <= ${PACKAGE_GEOMEAN_LIMIT.toFixed(2)}x => ${packageGeomeanPass ? "PASS" : "FAIL"}`,
);

const failed = results.filter((result) => !result.pass);

if (failed.length !== 0 || !packageGeomeanPass) {
  throw new Error(
    `P10-G zero-runtime-overhead gate failed${
      failed.length === 0
        ? ""
        : `: ${failed.map((result) => result.caseId).join(", ")}`
    }`,
  );
}

console.log("\nP10-G ACCEPTANCE: PASS");

async function runCase(caseId: CaseId): Promise<CaseResult> {
  console.log(`\n--- ${caseId} ---`);

  const controlOne = await createWorker(candidateRoot, caseId, "control");
  const candidateOne = await createWorker(candidateRoot, caseId, "candidate");
  const candidateTwo = await createWorker(candidateRoot, caseId, "candidate");
  const controlTwo = await createWorker(candidateRoot, caseId, "control");

  const samples: Sample[] = [];

  try {
    for (let sample = 0; sample < SAMPLES; sample++) {
      const controlStart = sample % 2 === 0;

      let ratioOne: number;
      let ratioTwo: number;

      if (sample % 2 === 0) {
        ratioOne = await measureOrientation(
          controlOne,
          candidateOne,
          controlStart,
        );
        ratioTwo = await measureOrientation(
          controlTwo,
          candidateTwo,
          controlStart,
        );
      } else {
        ratioTwo = await measureOrientation(
          controlTwo,
          candidateTwo,
          controlStart,
        );
        ratioOne = await measureOrientation(
          controlOne,
          candidateOne,
          controlStart,
        );
      }

      const mirroredRatio = Math.sqrt(ratioOne * ratioTwo);

      samples.push({
        order: controlStart ? "control-start" : "candidate-start",
        ratio: mirroredRatio,
      });

      console.log(
        `sample ${String(sample + 1).padStart(2, "0")}/${SAMPLES} | ${
          controlStart ? "C-start" : "N-start"
        } | ratio ${formatRatio(mirroredRatio)}`,
      );
    }
  } finally {
    await Promise.all([
      controlOne.close(),
      candidateOne.close(),
      candidateTwo.close(),
      controlTwo.close(),
    ]);
  }

  const medianRatio = median(samples.map((sample) => sample.ratio));
  const controlStartMedian = median(
    samples
      .filter((sample) => sample.order === "control-start")
      .map((sample) => sample.ratio),
  );
  const candidateStartMedian = median(
    samples
      .filter((sample) => sample.order === "candidate-start")
      .map((sample) => sample.ratio),
  );

  return {
    caseId,
    medianRatio,
    controlStartMedian,
    candidateStartMedian,
    pass: medianRatio <= CASE_LIMIT,
  };
}

async function measureOrientation(
  control: WorkerClient,
  candidate: WorkerClient,
  controlStart: boolean,
): Promise<number> {
  let controlFirst: number;
  let controlSecond: number;
  let candidateFirst: number;
  let candidateSecond: number;

  if (controlStart) {
    controlFirst = await control.measure();
    candidateFirst = await candidate.measure();
    candidateSecond = await candidate.measure();
    controlSecond = await control.measure();
  } else {
    candidateFirst = await candidate.measure();
    controlFirst = await control.measure();
    controlSecond = await control.measure();
    candidateSecond = await candidate.measure();
  }

  const controlNs = (controlFirst + controlSecond) / 2;
  const candidateNs = (candidateFirst + candidateSecond) / 2;

  return candidateNs / controlNs;
}

async function createWorker(
  root: string,
  caseId: CaseId,
  variant: Variant,
): Promise<WorkerClient> {
  const child = spawn(
    process.execPath,
    [
      workerPath,
      `--root=${root}`,
      `--case=${caseId}`,
      `--variant=${variant}`,
    ],
    {
      cwd: root,
      env: process.env,
      stdio: ["pipe", "pipe", "inherit"],
    },
  );

  if (child.stdin === null || child.stdout === null) {
    throw new Error("Failed to create P10-G worker pipes");
  }

  const input = child.stdin;
  const output = createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  const lines: string[] = [];
  const waiters: Array<(line: string) => void> = [];

  output.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter !== undefined) {
      waiter(line);
      return;
    }
    lines.push(line);
  });

  const exitPromise = new Promise<void>((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code) => {
      if (code === 0 || code === null) {
        resolveExit();
        return;
      }
      rejectExit(new Error(`P10-G worker exited with code ${code}`));
    });
  });

  const nextLine = (): Promise<string> => {
    const existing = lines.shift();
    if (existing !== undefined) {
      return Promise.resolve(existing);
    }
    return new Promise((resolveLine) => {
      waiters.push(resolveLine);
    });
  };

  const ready = JSON.parse(await nextLine()) as {
    readonly type?: string;
    readonly caseId?: string;
    readonly variant?: string;
  };

  if (
    ready.type !== "ready" ||
    ready.caseId !== caseId ||
    ready.variant !== variant
  ) {
    throw new Error(
      `P10-G worker did not become ready for ${caseId}/${variant}`,
    );
  }

  let closed = false;

  return {
    measure: async () => {
      if (closed) {
        throw new Error("P10-G worker is already closed");
      }

      input.write("measure\n");

      const message = JSON.parse(await nextLine()) as {
        readonly type?: string;
        readonly ns?: number;
      };

      if (message.type !== "measurement" || typeof message.ns !== "number") {
        throw new Error("Invalid P10-G worker measurement");
      }

      return message.ns;
    },

    close: async () => {
      if (closed) {
        return;
      }

      closed = true;
      input.write("close\n");
      input.end();
      await exitPromise;
    },
  };
}

function readRoot(
  values: readonly string[],
  prefix: string,
  fallback?: string,
): string {
  const argument = values.find((value) => value.startsWith(prefix));
  const value = argument?.slice(prefix.length) ?? fallback;

  if (!value) {
    throw new Error(`Expected ${prefix}<path>`);
  }

  return resolve(value);
}

function gitHead(root: string): string {
  return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

function gitStatus(root: string): string {
  return execFileSync("git", ["-C", root, "status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot calculate median of empty samples");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const value = sorted[Math.floor(sorted.length / 2)];

  if (value === undefined) {
    throw new Error("Median sample is missing");
  }

  return value;
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot calculate geometric mean of empty samples");
  }

  return Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) /
      values.length,
  );
}

function formatRatio(value: number): string {
  return `${value.toFixed(4)}x`;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

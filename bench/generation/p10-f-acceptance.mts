import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

interface Measurement {
  readonly elapsedMs: number;
  readonly documentBytes?: number;
}

interface WorkerSuccess {
  readonly id: number;
  readonly ok: true;
  readonly measurement?: Measurement;
}

interface WorkerFailure {
  readonly id: number;
  readonly ok: false;
  readonly error: string;
}

type WorkerResponse = WorkerSuccess | WorkerFailure;

interface LegacyResult {
  readonly scenario: LegacyScenario;
  readonly mode: LegacyMode;
  readonly medianRatio: number;
  readonly controlFirstMedian: number;
  readonly candidateFirstMedian: number;
  readonly pass: boolean;
}

interface RichResult {
  readonly mode: RichMode;
  readonly version: OpenAPIVersion;
  readonly size: number;
  readonly medianMs: number;
  readonly documentBytes?: number;
}

const LEGACY_SCENARIOS: readonly LegacyScenario[] = [
  "plain",
  "shared",
  "unique",
];
const LEGACY_MODES: readonly LegacyMode[] = [
  "projection",
  "end-to-end",
  "public",
];
const RICH_MODES: readonly RichMode[] = ["projection", "public"];
const OPENAPI_VERSIONS: readonly OpenAPIVersion[] = ["3.1.2", "3.2.0"];
const RICH_SIZES = [100, 1_000, 5_000] as const;

const LEGACY_WARMUPS = 5;
const LEGACY_SAMPLES = 21;
const RICH_WARMUPS = 3;
const RICH_SAMPLES = 11;

const LEGACY_CASE_LIMIT = 1.08;
const LEGACY_GEOMEAN_LIMIT = 1.03;
const RICH_100_TO_1000_LIMIT = 12.0;
const RICH_1000_TO_5000_LIMIT = 6.0;
const VERSION_OVERHEAD_LIMIT = 1.10;
const DOCUMENT_SIZE_LIMIT = 5.5;

const config = parseConfig(process.argv.slice(2));
const workerPath = fileURLToPath(
  new URL("./p10-f-worker.mts", import.meta.url),
);

const controlInfo = readRepositoryInfo(config.controlRoot);
const candidateInfo = readRepositoryInfo(config.candidateRoot);

console.log("P10-F OpenAPI Generation Scalability Acceptance");
console.log(`Bun:       ${Bun.version}`);
console.log(`Control:   ${controlInfo.head}`);
console.log(`Candidate: ${candidateInfo.head}`);
console.log(`Control dirty:   ${controlInfo.dirty ? "yes" : "no"}`);
console.log(`Candidate dirty: ${candidateInfo.dirty ? "yes" : "no"}`);
console.log();

if (controlInfo.dirty || candidateInfo.dirty) {
  throw new Error("P10-F acceptance requires clean control and candidate worktrees.");
}

const control = new WorkerClient(config.controlRoot, workerPath);
const candidate = new WorkerClient(config.candidateRoot, workerPath);

let failed = false;

try {
  await Promise.all([control.ready, candidate.ready]);

  const legacyResults = await runLegacyAcceptance(control, candidate);
  const legacyGeomean = geometricMean(
    legacyResults.map((result) => result.medianRatio),
  );

  console.log("Legacy B21 regression matrix (5,000 routes)");
  console.log(
    "| scenario | mode | median candidate/control | control-first | candidate-first | gate |",
  );
  console.log("| --- | --- | ---: | ---: | ---: | --- | ");

  for (const result of legacyResults) {
    console.log(
      `| ${result.scenario} | ${result.mode} | ${formatRatio(result.medianRatio)} | ${formatRatio(result.controlFirstMedian)} | ${formatRatio(result.candidateFirstMedian)} | ${result.pass ? "PASS" : "FAIL"} |`,
    );
    failed ||= !result.pass;
  }

  const legacyGeomeanPass = legacyGeomean <= LEGACY_GEOMEAN_LIMIT;
  console.log();
  console.log(
    `Legacy geomean: ${formatRatio(legacyGeomean)} <= ${LEGACY_GEOMEAN_LIMIT.toFixed(2)}x => ${legacyGeomeanPass ? "PASS" : "FAIL"}`,
  );
  failed ||= !legacyGeomeanPass;

  console.log();

  const richResults = await runRichAcceptance(candidate);
  printRichResults(richResults);

  const richGateResults = evaluateRichGates(richResults);

  console.log();
  console.log("Post-P9 rich scaling gates");
  for (const gate of richGateResults) {
    console.log(`${gate.label}: ${gate.detail} => ${gate.pass ? "PASS" : "FAIL"}`);
    failed ||= !gate.pass;
  }
} finally {
  await Promise.allSettled([control.close(), candidate.close()]);
}

console.log();
console.log(failed ? "P10-F ACCEPTANCE: FAIL" : "P10-F ACCEPTANCE: PASS");

if (failed) {
  process.exitCode = 1;
}

async function runLegacyAcceptance(
  control: WorkerClient,
  candidate: WorkerClient,
): Promise<LegacyResult[]> {
  const results: LegacyResult[] = [];

  for (const scenario of LEGACY_SCENARIOS) {
    for (const mode of LEGACY_MODES) {
      const caseConfig: CaseConfig = {
        kind: "legacy",
        scenario,
        mode,
        size: 5_000,
      };

      await Promise.all([
        control.setup(caseConfig),
        candidate.setup(caseConfig),
      ]);
      await Promise.all([
        control.warmup(LEGACY_WARMUPS),
        candidate.warmup(LEGACY_WARMUPS),
      ]);

      const ratios: number[] = [];
      const controlFirst: number[] = [];
      const candidateFirst: number[] = [];

      for (let sample = 0; sample < LEGACY_SAMPLES; sample++) {
        const isControlFirst = sample % 4 === 0 || sample % 4 === 3;

        let controlMeasurement: Measurement;
        let candidateMeasurement: Measurement;

        if (isControlFirst) {
          controlMeasurement = await control.measure();
          candidateMeasurement = await candidate.measure();
        } else {
          candidateMeasurement = await candidate.measure();
          controlMeasurement = await control.measure();
        }

        const ratio =
          candidateMeasurement.elapsedMs / controlMeasurement.elapsedMs;
        ratios.push(ratio);
        (isControlFirst ? controlFirst : candidateFirst).push(ratio);
      }

      const medianRatio = median(ratios);

      results.push({
        scenario,
        mode,
        medianRatio,
        controlFirstMedian: median(controlFirst),
        candidateFirstMedian: median(candidateFirst),
        pass: medianRatio <= LEGACY_CASE_LIMIT,
      });
    }
  }

  return results;
}

async function runRichAcceptance(
  candidate: WorkerClient,
): Promise<RichResult[]> {
  const results: RichResult[] = [];

  for (const mode of RICH_MODES) {
    for (const version of OPENAPI_VERSIONS) {
      for (const size of RICH_SIZES) {
        const caseConfig: CaseConfig = {
          kind: "rich",
          mode,
          version,
          size,
        };

        await candidate.setup(caseConfig);
        await candidate.warmup(RICH_WARMUPS);

        const elapsed: number[] = [];
        let documentBytes: number | undefined;

        for (let sample = 0; sample < RICH_SAMPLES; sample++) {
          const measurement = await candidate.measure();
          elapsed.push(measurement.elapsedMs);

          if (measurement.documentBytes !== undefined) {
            if (
              documentBytes !== undefined &&
              documentBytes !== measurement.documentBytes
            ) {
              throw new Error(
                `${mode}/${version}/${size}: generated document size changed between samples.`,
              );
            }

            documentBytes = measurement.documentBytes;
          }
        }

        results.push({
          mode,
          version,
          size,
          medianMs: median(elapsed),
          ...(documentBytes === undefined ? {} : { documentBytes }),
        });
      }
    }
  }

  return results;
}

function printRichResults(results: readonly RichResult[]): void {
  console.log("Post-P9 rich generation");
  console.log("| mode | version | routes | median ms | us/route | document bytes | ");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ");

  for (const result of results) {
    console.log(
      `| ${result.mode} | ${result.version} | ${result.size} | ${format(result.medianMs)} | ${format((result.medianMs * 1_000) / result.size)} | ${result.documentBytes ?? "-"} |`,
    );
  }
}

function evaluateRichGates(
  results: readonly RichResult[],
): readonly {
  readonly label: string;
  readonly detail: string;
  readonly pass: boolean;
}[] {
  const gates: {
    label: string;
    detail: string;
    pass: boolean;
  }[] = [];

  for (const mode of RICH_MODES) {
    for (const version of OPENAPI_VERSIONS) {
      const at100 = requireRichResult(results, mode, version, 100);
      const at1000 = requireRichResult(results, mode, version, 1_000);
      const at5000 = requireRichResult(results, mode, version, 5_000);

      const firstGrowth = at1000.medianMs / at100.medianMs;
      const secondGrowth = at5000.medianMs / at1000.medianMs;

      gates.push({
        label: `${mode} ${version} 100->1000`,
        detail: `${formatRatio(firstGrowth)} <= ${RICH_100_TO_1000_LIMIT.toFixed(1)}x`,
        pass: firstGrowth <= RICH_100_TO_1000_LIMIT,
      });
      gates.push({
        label: `${mode} ${version} 1000->5000`,
        detail: `${formatRatio(secondGrowth)} <= ${RICH_1000_TO_5000_LIMIT.toFixed(1)}x`,
        pass: secondGrowth <= RICH_1000_TO_5000_LIMIT,
      });
    }
  }

  for (const mode of RICH_MODES) {
    const version31 = requireRichResult(results, mode, "3.1.2", 5_000);
    const version32 = requireRichResult(results, mode, "3.2.0", 5_000);
    const ratio = version32.medianMs / version31.medianMs;

    gates.push({
      label: `${mode} 3.2/3.1 @5000`,
      detail: `${formatRatio(ratio)} <= ${VERSION_OVERHEAD_LIMIT.toFixed(2)}x`,
      pass: ratio <= VERSION_OVERHEAD_LIMIT,
    });
  }

  for (const version of OPENAPI_VERSIONS) {
    const at1000 = requireRichResult(results, "public", version, 1_000);
    const at5000 = requireRichResult(results, "public", version, 5_000);

    if (
      at1000.documentBytes === undefined ||
      at5000.documentBytes === undefined
    ) {
      throw new Error(`Missing public document size for OpenAPI ${version}.`);
    }

    const ratio = at5000.documentBytes / at1000.documentBytes;

    gates.push({
      label: `public ${version} document-size 1000->5000`,
      detail: `${formatRatio(ratio)} <= ${DOCUMENT_SIZE_LIMIT.toFixed(1)}x`,
      pass: ratio <= DOCUMENT_SIZE_LIMIT,
    });
  }

  return gates;
}

function requireRichResult(
  results: readonly RichResult[],
  mode: RichMode,
  version: OpenAPIVersion,
  size: number,
): RichResult {
  const result = results.find(
    (entry) =>
      entry.mode === mode && entry.version === version && entry.size === size,
  );

  if (result === undefined) {
    throw new Error(`Missing rich result for ${mode}/${version}/${size}.`);
  }

  return result;
}

class WorkerClient {
  readonly ready: Promise<void>;

  private readonly process: Bun.Subprocess;
  private readonly pending = new Map<
    number,
    {
      resolve: (response: WorkerSuccess) => void;
      reject: (cause: Error) => void;
    }
  >();
  private nextId = 1;
  private resolveReady: (() => void) | undefined;

  constructor(root: string, workerPath: string) {
    this.ready = new Promise<void>((resolveReady) => {
      this.resolveReady = resolveReady;
    });

    this.process = Bun.spawn({
      cmd: [process.execPath, workerPath, `--root=${root}`],
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
      ipc: (message) => {
        this.handleMessage(message);
      },
    });
  }

  setup(config: CaseConfig): Promise<void> {
    return this.rpc({ action: "setup", config }).then(() => undefined);
  }

  warmup(count: number): Promise<void> {
    return this.rpc({ action: "warmup", count }).then(() => undefined);
  }

  async measure(): Promise<Measurement> {
    const response = await this.rpc({ action: "measure" });

    if (response.measurement === undefined) {
      throw new Error("Worker measurement response did not include a measurement.");
    }

    return response.measurement;
  }

  async close(): Promise<void> {
    if (this.process.exitCode !== null) {
      return;
    }

    try {
      await this.rpc({ action: "close" });
    } catch {
      this.process.kill();
    }

    await this.process.exited;
  }

  private rpc(
    payload:
      | { readonly action: "setup"; readonly config: CaseConfig }
      | { readonly action: "warmup"; readonly count: number }
      | { readonly action: "measure" }
      | { readonly action: "close" },
  ): Promise<WorkerSuccess> {
    const id = this.nextId++;

    return new Promise<WorkerSuccess>((resolveResponse, rejectResponse) => {
      this.pending.set(id, {
        resolve: resolveResponse,
        reject: rejectResponse,
      });

      this.process.send({
        id,
        ...payload,
      });
    });
  }

  private handleMessage(message: unknown): void {
    if (!isRecord(message)) {
      return;
    }

    if (message.type === "ready") {
      this.resolveReady?.();
      this.resolveReady = undefined;
      return;
    }

    if (message.type === "fatal") {
      const error = new Error(String(message.error));
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
      return;
    }

    if (typeof message.id !== "number" || typeof message.ok !== "boolean") {
      return;
    }

    const pending = this.pending.get(message.id);
    if (pending === undefined) {
      return;
    }

    this.pending.delete(message.id);

    const response = message as unknown as WorkerResponse;

    if (!response.ok) {
      pending.reject(new Error(response.error));
      return;
    }

    pending.resolve(response);
  }
}

function parseConfig(args: readonly string[]): {
  readonly controlRoot: string;
  readonly candidateRoot: string;
} {
  let controlRoot: string | undefined;
  let candidateRoot = process.cwd();

  for (const argument of args) {
    if (argument.startsWith("--control-root=")) {
      controlRoot = resolve(argument.slice("--control-root=".length));
      continue;
    }

    if (argument.startsWith("--candidate-root=")) {
      candidateRoot = resolve(argument.slice("--candidate-root=".length));
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (controlRoot === undefined) {
    throw new Error("Missing --control-root=<B21 worktree>.");
  }

  return {
    controlRoot,
    candidateRoot,
  };
}

function readRepositoryInfo(root: string): {
  readonly head: string;
  readonly dirty: boolean;
} {
  return {
    head: git(root, "rev-parse", "HEAD"),
    dirty: git(root, "status", "--porcelain").length > 0,
  };
}

function git(root: string, ...args: readonly string[]): string {
  const result = Bun.spawnSync({
    cmd: ["git", "-C", root, ...args],
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `git -C ${root} ${args.join(" ")} failed: ${decode(result.stderr)}`,
    );
  }

  return decode(result.stdout).trim();
}

function decode(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot calculate median of an empty sample.");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const value = sorted[Math.floor(sorted.length / 2)];

  if (value === undefined) {
    throw new Error("Median sample is missing.");
  }

  return value;
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot calculate geomean of an empty sample.");
  }

  return Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) /
      values.length,
  );
}

function format(value: number): string {
  return value.toFixed(3);
}

function formatRatio(value: number): string {
  return `${value.toFixed(4)}x`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { createRuntime } from "../runtime.js";
import { loadConfig, type AppConfig } from "../config.js";
import type { MessageRequest } from "../agent/service.js";
import type {
  EvalCaseFixture,
  EvalCaseResult,
  EvalCheck,
  EvalExecutionDeps,
  EvalRunOptions,
  EvalSuiteFile,
  EvalSuiteResult,
  ResolvedEvalCase,
  ResolvedEvalSuite,
} from "./types.js";

export async function loadEvalSuite(suitePath: string): Promise<ResolvedEvalSuite> {
  const absolutePath = resolve(suitePath);
  const raw = await readFile(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as EvalSuiteFile;

  return {
    id: parsed.id,
    title: parsed.title,
    sourcePath: absolutePath,
    cases: parsed.cases.map((item) => resolveEvalCase(absolutePath, parsed.defaults, item)),
  };
}

export async function runEvalSuite(
  suitePath: string,
  options: EvalRunOptions = {},
): Promise<EvalSuiteResult> {
  const suite = await loadEvalSuite(suitePath);
  const startedAt = Date.now();
  const baseConfig = loadConfig();
  const config = applyEvalConfigOverrides(baseConfig, options.configOverrides);

  const results: EvalCaseResult[] = [];
  for (const testCase of suite.cases) {
    results.push(await runEvalCase(testCase, suite.sourcePath, config));
  }

  const durationMs = Date.now() - startedAt;
  const passedCases = results.filter((result) => result.passed).length;

  return {
    suiteId: suite.id,
    title: suite.title,
    sourcePath: suite.sourcePath,
    totalCases: results.length,
    passedCases,
    failedCases: results.length - passedCases,
    durationMs,
    config: {
      modelBaseUrl: config.modelBaseUrl,
      modelId: config.modelId,
      modelName: config.modelName,
      modelReasoning: config.modelReasoning,
      modelThinkingLevel: config.modelThinkingLevel,
    },
    results,
  };
}

export async function runEvalCase(
  testCase: ResolvedEvalCase,
  suiteSourcePath: string,
  config: AppConfig,
): Promise<EvalCaseResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "gullak-eval-"));
  const ledgerPath = join(tempDir, "main.ledger");
  const statePath = join(tempDir, "pi-state.json");
  const recapDir = join(tempDir, "recaps");
  const initialLedger = testCase.ledgerFixture
    ? await readFile(resolveFixturePath(suiteSourcePath, testCase.ledgerFixture), "utf8")
    : "";

  await writeFile(ledgerPath, initialLedger, "utf8");
  await writeFile(
    statePath,
    JSON.stringify(withStateDefaults(testCase.initialState), null, 2),
    "utf8",
  );

  const runtime = createRuntime({
    ...config,
    dataDir: tempDir,
    ledgerPath,
    statePath,
    recapDir,
    validateWrites: config.validateWrites,
  });

  const deps: EvalExecutionDeps = {
    execute: (request) => runtime.agentService.handleMessage(request),
    readLedger: () => readFile(ledgerPath, "utf8"),
  };

  return await executeEvalCase(testCase, deps);
}

export async function executeEvalCase(
  testCase: ResolvedEvalCase,
  deps: EvalExecutionDeps,
): Promise<EvalCaseResult> {
  const request = buildEvalRequest(testCase.request);
  const ledgerBefore = await deps.readLedger();
  const startedAt = Date.now();
  const response = await deps.execute(request);
  const durationMs = Date.now() - startedAt;
  const ledgerAfter = await deps.readLedger();
  const ledgerChanged = ledgerBefore !== ledgerAfter;
  const checks = evaluateExpectations(testCase.expectations, response, ledgerChanged, ledgerAfter);

  return {
    id: testCase.id,
    title: testCase.title,
    tags: testCase.tags,
    passed: checks.every((check) => check.passed),
    durationMs,
    reply: response.reply,
    action: response.action,
    transactionId: response.transactionId,
    referencedTransactionIds: response.referencedTransactionIds ?? [],
    needsClarification: response.needsClarification,
    ledgerChanged,
    checks,
  };
}

export function buildEvalRequest(
  requestFixture: ResolvedEvalCase["request"],
): MessageRequest {
  const text = requestFixture.quotedText
    ? `[Replying to: "${requestFixture.quotedText}"]\n${requestFixture.text}`
    : requestFixture.text;

  return {
    text,
    threadId: requestFixture.threadId,
    source: requestFixture.source ?? "api",
    sourceUser: requestFixture.sourceUser,
    timestamp: requestFixture.timestamp,
    quotedMessageId: requestFixture.quotedMessageId,
  };
}

export function evaluateExpectations(
  expectations: ResolvedEvalCase["expectations"],
  response: {
    reply: string;
    action?: string;
    transactionId?: string;
    referencedTransactionIds?: string[];
    needsClarification: boolean;
  },
  ledgerChanged: boolean,
  ledgerContent: string,
): EvalCheck[] {
  const checks: EvalCheck[] = [];

  if (expectations.action !== undefined) {
    checks.push({
      name: "action",
      passed: response.action === expectations.action,
      expected: String(expectations.action),
      actual: String(response.action ?? "undefined"),
    });
  }

  if (expectations.transactionId !== undefined) {
    checks.push({
      name: "transactionId",
      passed: response.transactionId === expectations.transactionId,
      expected: expectations.transactionId,
      actual: String(response.transactionId ?? "undefined"),
    });
  }

  if (expectations.needsClarification !== undefined) {
    checks.push({
      name: "needsClarification",
      passed: response.needsClarification === expectations.needsClarification,
      expected: String(expectations.needsClarification),
      actual: String(response.needsClarification),
    });
  }

  if (expectations.ledgerChanged !== undefined) {
    checks.push({
      name: "ledgerChanged",
      passed: ledgerChanged === expectations.ledgerChanged,
      expected: String(expectations.ledgerChanged),
      actual: String(ledgerChanged),
    });
  }

  if (expectations.referencedTransactionIds !== undefined) {
    const actualIds = [...new Set(response.referencedTransactionIds ?? [])].sort();
    const expectedIds = [...new Set(expectations.referencedTransactionIds)].sort();
    checks.push({
      name: "referencedTransactionIds",
      passed: JSON.stringify(actualIds) === JSON.stringify(expectedIds),
      expected: expectedIds.join(", "),
      actual: actualIds.join(", "),
    });
  }

  for (const needle of expectations.replyContains ?? []) {
    checks.push({
      name: `replyContains:${needle}`,
      passed: response.reply.includes(needle),
      expected: `reply to contain "${needle}"`,
      actual: truncate(response.reply),
    });
  }

  for (const needle of expectations.replyExcludes ?? []) {
    checks.push({
      name: `replyExcludes:${needle}`,
      passed: !response.reply.includes(needle),
      expected: `reply to exclude "${needle}"`,
      actual: truncate(response.reply),
    });
  }

  if (expectations.replyMaxLength !== undefined) {
    checks.push({
      name: "replyMaxLength",
      passed: response.reply.length <= expectations.replyMaxLength,
      expected: `reply length <= ${expectations.replyMaxLength}`,
      actual: String(response.reply.length),
    });
  }

  for (const needle of expectations.ledgerContains ?? []) {
    checks.push({
      name: `ledgerContains:${needle}`,
      passed: ledgerContent.includes(needle),
      expected: `ledger to contain "${needle}"`,
      actual: truncate(ledgerContent),
    });
  }

  for (const needle of expectations.ledgerExcludes ?? []) {
    checks.push({
      name: `ledgerExcludes:${needle}`,
      passed: !ledgerContent.includes(needle),
      expected: `ledger to exclude "${needle}"`,
      actual: truncate(ledgerContent),
    });
  }

  return checks;
}

export function formatEvalSuiteReport(result: EvalSuiteResult): string {
  const lines = [
    `# Eval Report: ${result.title}`,
    "",
    `- Suite: ${result.suiteId}`,
    `- Source: ${result.sourcePath}`,
    `- Model: ${result.config.modelName} (${result.config.modelId})`,
    `- Passed: ${result.passedCases}/${result.totalCases}`,
    `- Duration: ${result.durationMs} ms`,
    "",
  ];

  for (const testCase of result.results) {
    lines.push(`## ${testCase.passed ? "PASS" : "FAIL"} ${testCase.id} — ${testCase.title}`);
    lines.push(`- Action: ${testCase.action ?? "none"}`);
    lines.push(`- Ledger changed: ${String(testCase.ledgerChanged)}`);
    lines.push(`- Needs clarification: ${String(testCase.needsClarification)}`);
    lines.push(`- Duration: ${testCase.durationMs} ms`);
    lines.push(`- Reply: ${testCase.reply.replace(/\n/g, " ")}`);
    if (testCase.checks.some((check) => !check.passed)) {
      lines.push("- Failed checks:");
      for (const check of testCase.checks.filter((item) => !item.passed)) {
        lines.push(`  - ${check.name}: expected ${check.expected}; actual ${check.actual}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function resolveEvalCase(
  suitePath: string,
  defaults: EvalSuiteFile["defaults"] | undefined,
  item: EvalCaseFixture,
): ResolvedEvalCase {
  return {
    id: item.id,
    title: item.title,
    tags: item.tags ?? [],
    ledgerFixture: item.ledgerFixture ?? defaults?.ledgerFixture,
    initialState: structuredClone(item.initialState ?? defaults?.initialState ?? {}),
    request: {
      source: "api",
      ...defaults?.request,
      ...item.request,
    },
    expectations: {
      ...defaults?.expectations,
      ...item.expectations,
    },
  };
}

function resolveFixturePath(suitePath: string, fixturePath: string): string {
  return resolve(dirname(suitePath), fixturePath);
}

function withStateDefaults(state: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 1,
    payeeMemory: {},
    threads: {},
    whatsappSeen: {},
    recaps: {},
    ...state,
  };
}

function applyEvalConfigOverrides(
  baseConfig: AppConfig,
  overrides: EvalRunOptions["configOverrides"],
): AppConfig {
  if (!overrides) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    modelBaseUrl: overrides.modelBaseUrl ?? baseConfig.modelBaseUrl,
    modelId: overrides.modelId ?? baseConfig.modelId,
    modelName: overrides.modelName ?? overrides.modelId ?? baseConfig.modelName,
    modelApiKey: overrides.modelApiKey ?? baseConfig.modelApiKey,
    modelReasoning: overrides.modelReasoning ?? baseConfig.modelReasoning,
    modelThinkingLevel: overrides.modelThinkingLevel ?? baseConfig.modelThinkingLevel,
    validateWrites: overrides.validateWrites ?? baseConfig.validateWrites,
  };
}

function truncate(value: string, maxLength = 180): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3)}...`;
}

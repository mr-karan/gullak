import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

import { formatEvalSuiteReport, runEvalSuite } from "../evals/runner.js";

const args = process.argv.slice(2);
const suitePath = args.find((arg) => !arg.startsWith("--")) ?? "evals/critical-regressions.json";
const jsonOut = readFlagValue(args, "--json-out");
const markdownOut = readFlagValue(args, "--markdown-out");
const modelBaseUrl = readFlagValue(args, "--model-base-url");
const modelId = readFlagValue(args, "--model-id");
const modelName = readFlagValue(args, "--model-name");
const modelApiKey = readModelApiKey(args);
const noReasoning = args.includes("--no-reasoning");
const noValidateWrites = args.includes("--no-validate-writes");

const result = await runEvalSuite(resolve(suitePath), {
  configOverrides: {
    modelBaseUrl: modelBaseUrl ?? undefined,
    modelId: modelId ?? undefined,
    modelName: modelName ?? undefined,
    modelApiKey,
    modelReasoning: noReasoning ? false : undefined,
    validateWrites: noValidateWrites ? false : undefined,
  },
});

const markdown = formatEvalSuiteReport(result);
console.log(markdown);

if (jsonOut) {
  await writeFile(resolve(jsonOut), JSON.stringify(result, null, 2), "utf8");
}

if (markdownOut) {
  await writeFile(resolve(markdownOut), markdown, "utf8");
}

if (result.failedCases > 0) {
  process.exitCode = 1;
}

function readFlagValue(allArgs: string[], name: string): string | undefined {
  const index = allArgs.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return allArgs[index + 1];
}

function readModelApiKey(allArgs: string[]): string | undefined {
  const value = readFlagValue(allArgs, "--model-api-key");
  if (value) {
    return value;
  }

  const envName = readFlagValue(allArgs, "--api-key-env");
  if (!envName) {
    return undefined;
  }

  return process.env[envName];
}

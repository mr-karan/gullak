import type { MessageRequest, MessageResponse } from "../agent/service.js";
import type { ToolDetails } from "../agent/tools.js";
import type { AppConfig } from "../config.js";
import type { TransactionSource } from "../ledger/models.js";

export interface EvalRequestFixture {
  text: string;
  threadId: string;
  source?: TransactionSource;
  sourceUser?: string;
  timestamp?: string;
  quotedText?: string;
  quotedMessageId?: string;
}

export interface EvalExpectations {
  action?: ToolDetails["action"];
  transactionId?: string;
  referencedTransactionIds?: string[];
  needsClarification?: boolean;
  ledgerChanged?: boolean;
  replyContains?: string[];
  replyExcludes?: string[];
  replyMaxLength?: number;
  ledgerContains?: string[];
  ledgerExcludes?: string[];
}

export interface EvalCaseFixture {
  id: string;
  title: string;
  tags?: string[];
  ledgerFixture?: string;
  initialState?: Record<string, unknown>;
  request: EvalRequestFixture;
  expectations: EvalExpectations;
}

export interface EvalSuiteDefaults {
  ledgerFixture?: string;
  initialState?: Record<string, unknown>;
  request?: Partial<Omit<EvalRequestFixture, "text" | "threadId">>;
  expectations?: Partial<EvalExpectations>;
}

export interface EvalSuiteFile {
  id: string;
  title: string;
  defaults?: EvalSuiteDefaults;
  cases: EvalCaseFixture[];
}

export interface ResolvedEvalCase {
  id: string;
  title: string;
  tags: string[];
  ledgerFixture?: string;
  initialState: Record<string, unknown>;
  request: EvalRequestFixture;
  expectations: EvalExpectations;
}

export interface ResolvedEvalSuite {
  id: string;
  title: string;
  sourcePath: string;
  cases: ResolvedEvalCase[];
}

export interface EvalConfigOverrides {
  modelBaseUrl?: string;
  modelId?: string;
  modelName?: string;
  modelApiKey?: string;
  modelReasoning?: boolean;
  modelThinkingLevel?: AppConfig["modelThinkingLevel"];
  validateWrites?: boolean;
}

export interface EvalRunOptions {
  configOverrides?: EvalConfigOverrides;
}

export interface EvalCheck {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface EvalCaseResult {
  id: string;
  title: string;
  tags: string[];
  passed: boolean;
  durationMs: number;
  reply: string;
  action?: ToolDetails["action"];
  transactionId?: string;
  referencedTransactionIds: string[];
  needsClarification: boolean;
  ledgerChanged: boolean;
  checks: EvalCheck[];
}

export interface EvalSuiteResult {
  suiteId: string;
  title: string;
  sourcePath: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  durationMs: number;
  config: {
    modelBaseUrl: string;
    modelId: string;
    modelName: string;
    modelReasoning: boolean;
    modelThinkingLevel: string;
  };
  results: EvalCaseResult[];
}

export interface EvalRequestBuildResult {
  request: MessageRequest;
  quotedMessageId?: string;
}

export interface EvalExecutionDeps {
  execute(request: MessageRequest): Promise<MessageResponse>;
  readLedger(): Promise<string>;
}

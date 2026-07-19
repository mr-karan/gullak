// TS mirror of the server rules JSON shapes (pi-server/src/rules/*, routes/rules.ts).
// Rules are server-only config; the web app is their only editor.

export type RuleStage = "pre" | "main" | "post";
export type MatchMode = "all" | "any";
export type TriggerType = "user" | "learned";
export type NotesMode = "replace" | "append" | "prepend";

export interface RuleCondition {
  field: string;
  op: string;
  value?: unknown;
}

export interface RuleTriggerPayload {
  match: MatchMode;
  conditions: RuleCondition[];
}

export type RuleAction =
  | { type: "set_payee"; value: string }
  | { type: "set_category"; value: string }
  | { type: "set_notes"; value: { mode: NotesMode; text: string } };

export interface RuleActionPayload {
  actions: RuleAction[];
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  triggerType: TriggerType;
  stage: RuleStage;
  triggerPayload: RuleTriggerPayload;
  actionPayload: RuleActionPayload;
  createdAt: number;
  updatedAt: number;
}

export interface RuleInput {
  name: string;
  enabled?: boolean;
  stage?: RuleStage;
  priority?: number;
  triggerType?: TriggerType;
  triggerPayload: RuleTriggerPayload;
  actionPayload: RuleActionPayload;
}

export interface RulesResponse {
  rules: Rule[];
}

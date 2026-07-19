// Typed API contracts. These mirror exactly what the pi-server /v1/* routes
// return today (ported from the legacy Alpine stores). Money is integer minor
// units; dates are "YYYY-MM-DD"; timestamps are epoch-ms integers; ids are UUID
// text.

export interface Account {
  id: string;
  name: string;
  kind: string;
  openingBalanceCents: number;
  onBudget: boolean;
  archived: boolean;
  sortOrder: number;
}
export interface AccountsResponse {
  accounts: Account[];
}

export interface Category {
  id: string;
  name: string;
  groupId: string | null;
}
export interface CategoriesResponse {
  categories: Category[];
}

export interface CategoryGroup {
  id: string;
  name: string;
}
export interface CategoryGroupsResponse {
  groups: CategoryGroup[];
}

export interface Payee {
  id: string;
  name: string;
}
export interface PayeesResponse {
  payees: Payee[];
}

export interface Transaction {
  id: string;
  date: string;
  payeeName: string | null;
  amountCents: number;
  notes: string | null;
  locationName: string | null;
  accountId: string;
  categoryId: string | null;
  parentId?: string | null;
}
export interface TransactionsResponse {
  transactions: Transaction[];
}

export interface Summary {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export interface NetWorth {
  cashCents: number;
  investedCurrentCents: number;
  investedInvestedCents: number;
  investedPnlCents: number;
  totalCents: number;
  lastImportAt: number | null;
}

export type HoldingKind = "equity" | "mutual_fund" | string;

export interface Holding {
  id: string;
  isin: string | null;
  symbol: string | null;
  name: string | null;
  kind: HoldingKind;
  sector: string | null;
  quantity: number | null;
  avgPrice: number | null;
  lastPrice: number | null;
  investedCents: number;
  currentCents: number;
  goalId: string | null;
  stale: boolean;
  importedAt: number | null;
  createdAt?: number;
  updatedAt?: number;
}
export interface HoldingsSummary {
  investedCents: number;
  currentCents: number;
  pnlCents: number;
  count: number;
  lastImportAt: number | null;
}
export interface HoldingsResponse {
  holdings: Holding[];
  summary: HoldingsSummary;
}
export interface HoldingsImportResult {
  updated: number;
  added: number;
  missing: { isin: string; name?: string }[];
}

export interface Goal {
  id: string;
  name: string;
  emoji: string | null;
  targetCents: number;
  currentCents: number;
  targetDate: string | null;
  notes: string | null;
  archived?: boolean;
}
export interface GoalsResponse {
  goals: Goal[];
  unmappedCents: number;
}
export interface GoalInput {
  name: string;
  emoji: string | null;
  targetCents: number;
  targetDate: string | null;
  notes: string | null;
}

export type DesireStatus = "considering" | "approved" | "bought" | "dropped" | string;

export interface Desire {
  id: string;
  person: string | null;
  title: string;
  estCostCents: number;
  why: string | null;
  status: DesireStatus;
  boughtTransactionId: string | null;
  photoIds: string[];
  commentCount: number;
}
export interface DesiresResponse {
  desires: Desire[];
}
export interface DesireComment {
  id: string;
  person: string | null;
  body: string;
  createdAt: number;
}
export interface DesireDetail {
  desire: Desire;
  photos: { id: string }[];
  comments: DesireComment[];
}
export interface DesireInput {
  person: string | null;
  title: string;
  estCostCents: number;
  why: string | null;
}

export interface Profile {
  id: string;
  name: string;
  emoji: string | null;
}
export interface ProfilesResponse {
  profiles: Profile[];
}

/** Advisory "where is the user" hint sent with every chat message. */
export interface ChatContext {
  view: string;
  accountId?: string;
  month?: string;
  desireId?: string;
  goalId?: string;
}
export interface ChatRequest {
  text: string;
  threadId?: string;
  source: "web";
  context: ChatContext;
}
export interface ChatResponse {
  threadId?: string;
  reply: string;
}

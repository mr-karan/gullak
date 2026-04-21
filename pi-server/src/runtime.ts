import { loadConfig, type AppConfig } from "./config.js";
import { AgentService } from "./agent/service.js";
import { LedgerService } from "./ledger/service.js";
import { LedgerValidator } from "./ledger/validator.js";
import { LedgerWriter } from "./ledger/writer.js";
import { WeeklyRecapService } from "./recap/weekly.js";
import { StateStore } from "./state/store.js";
import { ModelReceiptVisionService } from "./whatsapp/media.js";
import { WhatsAppBridgeClient, WhatsAppService } from "./whatsapp/service.js";

export interface Runtime {
  config: AppConfig;
  stateStore: StateStore;
  validator: LedgerValidator;
  writer: LedgerWriter;
  ledgerService: LedgerService;
  agentService: AgentService;
  bridgeClient: WhatsAppBridgeClient;
  whatsappService: WhatsAppService;
  weeklyRecapService: WeeklyRecapService;
}

export function createRuntime(config: AppConfig = loadConfig()): Runtime {
  const stateStore = new StateStore(config.statePath);
  const validator = new LedgerValidator(config.ledgerCli, config.validateWrites);
  const writer = new LedgerWriter(config.ledgerPath, validator);
  const ledgerService = new LedgerService(config, writer);
  const agentService = new AgentService(config, ledgerService, stateStore);
  const bridgeClient = new WhatsAppBridgeClient(config);
  const receiptVisionService = new ModelReceiptVisionService(config);
  const whatsappService = new WhatsAppService(
    config,
    bridgeClient,
    agentService,
    stateStore,
    receiptVisionService,
  );
  const weeklyRecapService = new WeeklyRecapService(
    config,
    ledgerService,
    stateStore,
    bridgeClient,
  );

  return {
    config,
    stateStore,
    validator,
    writer,
    ledgerService,
    agentService,
    bridgeClient,
    whatsappService,
    weeklyRecapService,
  };
}

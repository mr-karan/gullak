# Gullak v2: From SQLite to Plain-Text Accounting

*This is a follow-up to my [original Gullak post](/posts/gullak/) from 2024. If you haven't read that, the TL;DR: I built an AI-powered expense tracker using Go + Vue.js + SQLite that let me log expenses via natural language.*

A lot has changed since then.

## What Prompted the Rewrite

The original Gullak worked. I used it for months. But a few things nagged at me:

1. **SQLite felt like overkill** for what's essentially append-only financial data
2. **No double-entry bookkeeping** — I couldn't track transfers between accounts properly
3. **Visualization was a pain** — Metabase dashboards required constant fiddling
4. **The data wasn't portable** — if I wanted to switch tools, I'd need migration scripts

Then I stumbled upon [plain-text accounting](https://plaintextaccounting.org/) and tools like [ledger-cli](https://ledger-cli.org/) and [Paisa](https://paisa.fyi/). The philosophy clicked immediately: your financial data is just text files. Version control them. Query them. Own them forever.

A recent [HN thread](https://news.ycombinator.com/item?id=46463644) about someone tracking 10 years of finances in beancount validated this. But the comments also revealed the pain point: the monthly ritual of downloading CSVs, running importers, and manually categorizing transactions takes 30-45 minutes.

I wanted the best of both worlds: plain-text accounting's durability with Gullak v1's "just type and forget" convenience.

## What's New in v2

### Complete Rewrite: Python + FastAPI

The Go + Vue.js stack served v1 well, but for rapid iteration on LLM-heavy features, Python made more sense. The new stack:

- **FastAPI** for the API layer
- **LiteLLM** for multi-provider LLM support (OpenRouter, OpenAI, Anthropic, Gemini, Ollama)
- **Alpine.js + Jinja2** for a lighter frontend
- **ledger-cli** as the source of truth

No more SQLite. Transactions go directly into `.ledger` files.

### ledger-cli Format

Instead of storing expenses in a database, Gullak now writes proper double-entry transactions:

```ledger
2026-01-03 Swiggy
    ; gullak:id 7f8a9b2c
    Expenses:Food:Delivery                     ₹350.00
    Assets:Bank:HDFC:UPI
```

Every transaction balances. Transfers between accounts just work. And I can open these files in vim whenever I want.

### Paisa Integration

[Paisa](https://paisa.fyi/) reads ledger files and generates beautiful dashboards — expense breakdowns, net worth tracking, investment allocation. It runs alongside Gullak via Docker Compose, watching the same ledger files.

No more Metabase. No more writing SQL for basic visualizations.

![Gullak Transaction Logger](./screenshots/log.png)

### Payee Memory

This is the killer feature I didn't have in v1. When you confirm a transaction, Gullak learns:

```ledger
; gullak:payee_map Swiggy=Expenses:Food:Delivery|Assets:Bank:HDFC:UPI
```

Next time you say "Swiggy 280", it auto-fills both the expense category AND the payment account. The mappings live right in your ledger file as comments — portable and human-readable.

Over time, the system gets smarter. Novel merchants use the LLM; repeat purchases use pattern matching with fuzzy search. The 80/20 rule in action.

### WhatsApp Bridge

Remember the Telegram limitation from v1? ("Telegram does not offer the option to create a private bot")

v2 solves this with a WhatsApp bridge using [Baileys](https://github.com/WhiskeySockets/Baileys). I message myself:

```
"Auto rickshaw 80"
"Groceries 1200 DMart"
```

Each becomes a pending transaction. I can confirm right there or review later on the web UI. This is the "Apple Notes" workflow I originally wanted, but with structure.

### Pending Transaction Flow

Every expense goes through a preview state before hitting the ledger:

```
┌─────────────────────────────────────┐
│ Preview                             │
├─────────────────────────────────────┤
│ 2026-01-03 Swiggy                   │
│   Expenses:Food:Delivery    ₹350    │
│   Assets:Bank:HDFC:UPI              │
├─────────────────────────────────────┤
│ [Confirm]  [Edit]  [Cancel]         │
└─────────────────────────────────────┘
```

You can say "change to 400" or "use cash instead" and the LLM understands corrections in context. This solves the "fixing bad entries" problem from v1 without raw SQL.

### Threaded Conversations

v1 was stateless — each expense was independent. v2 maintains conversation threads with full context. I can say:

```
Me: "Coffee 150"
Gullak: [shows preview for Expenses:Food:Coffee]
Me: "actually that was a client meeting, put it in work expenses"
Gullak: [updates to Expenses:Work:ClientMeeting]
Me: "confirm"
```

### Receipt OCR

Upload a receipt image or PDF. Gullak extracts the amount, merchant, and date. Works via web UI or WhatsApp (just send a photo).

### CSV Import

For the monthly bank statement ritual, there's now a proper import tool. Upload your CSV, map the columns once, and Gullak creates pending transactions for each row. Reconciliation instead of data entry.

## The Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Web UI     │     │  WhatsApp   │     │  API        │
│  (Alpine)   │────▶│  Bridge     │────▶│  (FastAPI)  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          ▼                          │
                    │  ┌─────────────┐   ┌─────────────┐   ┌───────────┐  │
                    │  │ LLM Agent   │──▶│ ledger-cli  │──▶│ .ledger   │  │
                    │  │ (LiteLLM)   │   │ validation  │   │ files     │  │
                    │  └─────────────┘   └─────────────┘   └─────┬─────┘  │
                    │                                            │        │
                    │                                            ▼        │
                    │                                      ┌───────────┐  │
                    │                                      │   Paisa   │  │
                    │                                      │ dashboard │  │
                    │                                      └───────────┘  │
                    └─────────────────────────────────────────────────────┘
```

The LLM agent has 15 tools: parse expenses, parse income, query balances, edit transactions, learn payee mappings, import CSVs, set budgets, and more. Every tool write goes through ledger-cli validation — if a transaction doesn't balance, it's rejected before hitting the file.

## What I Learned from the PTA Community

Reading through the [HN discussions](https://news.ycombinator.com/item?id=46463407), a few themes stood out:

**"Plain text is backlash against lock-in, but what matters is: accounting, double-entry, no vendor lock-in, no proprietary formats"**

Agreed. The file format matters less than data ownership. But plain text makes version control trivial and ensures the data outlives any app.

**"Accounting needs automation because manual tasks are error-prone"**

This is why the LLM + payee memory combination works. The LLM handles ambiguity; learned mappings handle the routine. Human confirmation catches mistakes.

**"The monthly ritual is where most of those 30-45 minutes go"**

By logging expenses in real-time via natural language, the monthly ritual becomes reconciliation, not data entry. My 45 minutes became 10.

**"What I've found most difficult is the learning curve between 'Assets = Liabilities + Equity' and modeling a household economy"**

The LLM abstracts this away. Say "coffee 150" and let the system figure out the double-entry. You can always look at the ledger file to learn.

## Running It

```bash
git clone https://github.com/mr-karan/gullak.git
cd gullak
cp .env.example .env
# Add your LLM API key
docker compose up -d
```

That gives you Gullak + Paisa + WhatsApp bridge. Your data stays in `./data/` as plain text ledger files.

## What's Next

Some ideas I'm mulling over:

- **Bank statement auto-import** via email parsing (forward statements to a dedicated address)
- **Budget alerts** via WhatsApp ("You've spent 80% of your food budget")
- **Investment tracking** with automatic price updates
- **Multi-currency** support with proper exchange rate handling

The beauty of plain-text accounting is that the data format won't change. Whatever features I add, the core ledger files remain readable by any PTA tool.

---

*If you're already doing plain-text accounting, Gullak slots right into your workflow. If you've been meaning to start, this might lower the barrier enough to actually try it.*

*Questions? Find me on [Twitter/X](https://x.com/mrkaran_) or open an issue on [GitHub](https://github.com/mr-karan/gullak).*

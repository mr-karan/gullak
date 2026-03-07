#!/usr/bin/env python3
"""Generate realistic ledger data and chat history for a Bangalore-based Indian male.

Usage:
    python tests/generate_fixtures.py [data_dir]

Generates:
    - main.ledger with ~1 month of realistic transactions
    - chat.db with realistic chat threads and messages
"""

import asyncio
import random
import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from gullak.chat_history import ChatHistory
from gullak.ledger.models import PeriodicBudget, BudgetEntry, Transaction, TransactionSource

random.seed(42)  # Reproducible data


def _id() -> str:
    return uuid4().hex[:8]


def generate_ledger_data(start_date: date, end_date: date) -> str:
    """Generate ~1 month of realistic transactions for Bangalore-based Indian male."""

    payee_mappings = [
        "; gullak:payee_map Swiggy=Expenses:Food:Delivery|Assets:Bank:HDFC:UPI",
        "; gullak:payee_map Zomato=Expenses:Food:Delivery|Assets:Bank:HDFC:UPI",
        "; gullak:payee_map BigBasket=Expenses:Food:Groceries|Assets:Bank:HDFC:UPI",
        "; gullak:payee_map Zepto=Expenses:Food:Groceries|Assets:Bank:HDFC:UPI",
        "; gullak:payee_map Uber=Expenses:Transport:Rides|Assets:Bank:HDFC:UPI",
        "; gullak:payee_map Ola=Expenses:Transport:Rides|Assets:Bank:HDFC:UPI",
        "; gullak:payee_map Netflix=Expenses:Entertainment:Streaming|Assets:Bank:HDFC",
        "; gullak:payee_map Spotify=Expenses:Entertainment:Music|Assets:Bank:HDFC",
        "; gullak:payee_map ACT Fibernet=Expenses:Utilities:Internet|Assets:Bank:HDFC",
        "; gullak:payee_map Airtel=Expenses:Utilities:Mobile|Assets:Bank:HDFC:UPI",
        "; gullak:payee_map Shell=Expenses:Transport:Fuel|Liabilities:CreditCard:HDFC",
        "; gullak:payee_map Amazon=Expenses:Shopping:Online|Liabilities:CreditCard:HDFC",
        "; gullak:payee_map Cult.fit=Expenses:Health:Fitness|Assets:Bank:HDFC:UPI",
    ]

    # Budget
    budget = PeriodicBudget(
        start_date=start_date,
        entries=[
            BudgetEntry(account="Expenses:Food", amount=Decimal("15000")),
            BudgetEntry(account="Expenses:Transport", amount=Decimal("5000")),
            BudgetEntry(account="Expenses:Entertainment", amount=Decimal("3000")),
            BudgetEntry(account="Expenses:Utilities", amount=Decimal("5000")),
            BudgetEntry(account="Expenses:Shopping", amount=Decimal("8000")),
            BudgetEntry(account="Expenses:Health", amount=Decimal("3000")),
            BudgetEntry(account="Expenses:Housing", amount=Decimal("27000")),
        ],
        funding_account="Assets:Bank:HDFC",
    )

    # Fixed monthly transactions
    fixed_transactions = [
        # Rent on 1st
        Transaction.create_expense(
            date=start_date.replace(day=1),
            payee="Landlord - Rent",
            amount=Decimal("25000"),
            expense_account="Expenses:Housing:Rent",
            payment_account="Assets:Bank:HDFC",
            source=TransactionSource.WHATSAPP,
            source_user="Karan",
        ),
        # Salary on 1st
        Transaction.create_income(
            date=start_date.replace(day=1),
            payee="TechCorp India",
            amount=Decimal("150000"),
            income_account="Income:Salary",
            deposit_account="Assets:Bank:HDFC",
            source=TransactionSource.WEB,
            source_user="Karan",
        ),
        # Internet on 5th
        Transaction.create_expense(
            date=start_date.replace(day=5),
            payee="ACT Fibernet",
            amount=Decimal("1100"),
            expense_account="Expenses:Utilities:Internet",
            payment_account="Assets:Bank:HDFC",
            source=TransactionSource.WHATSAPP,
        ),
        # Mobile on 7th
        Transaction.create_expense(
            date=start_date.replace(day=7),
            payee="Airtel Prepaid",
            amount=Decimal("599"),
            expense_account="Expenses:Utilities:Mobile",
            payment_account="Assets:Bank:HDFC:UPI",
            source=TransactionSource.WHATSAPP,
        ),
        # Netflix on 10th
        Transaction.create_expense(
            date=start_date.replace(day=10),
            payee="Netflix",
            amount=Decimal("649"),
            expense_account="Expenses:Entertainment:Streaming",
            payment_account="Assets:Bank:HDFC",
            note="Standard plan",
            source=TransactionSource.WEB,
        ),
        # Spotify on 10th
        Transaction.create_expense(
            date=start_date.replace(day=10),
            payee="Spotify",
            amount=Decimal("119"),
            expense_account="Expenses:Entertainment:Music",
            payment_account="Assets:Bank:HDFC",
            source=TransactionSource.WEB,
        ),
        # Electricity on 15th
        Transaction.create_expense(
            date=start_date.replace(day=15),
            payee="BESCOM",
            amount=Decimal("1800"),
            expense_account="Expenses:Utilities:Electricity",
            payment_account="Assets:Bank:HDFC:UPI",
            source=TransactionSource.WHATSAPP,
        ),
        # Gym on 1st
        Transaction.create_expense(
            date=start_date.replace(day=1),
            payee="Cult.fit",
            amount=Decimal("1500"),
            expense_account="Expenses:Health:Fitness",
            payment_account="Assets:Bank:HDFC:UPI",
            source=TransactionSource.WHATSAPP,
        ),
        # Insurance on 20th
        Transaction.create_expense(
            date=start_date.replace(day=20),
            payee="HDFC Life Insurance",
            amount=Decimal("2500"),
            expense_account="Expenses:Insurance",
            payment_account="Assets:Bank:HDFC",
            source=TransactionSource.WEB,
        ),
    ]

    # Variable daily transactions
    variable_templates = [
        # Swiggy/Zomato orders (2-3 per week)
        ("Swiggy", "Expenses:Food:Delivery", "Assets:Bank:HDFC:UPI", 200, 600),
        ("Zomato", "Expenses:Food:Delivery", "Assets:Bank:HDFC:UPI", 250, 700),
        # Chai/coffee (almost daily)
        ("Third Wave Coffee", "Expenses:Food:Coffee", "Assets:Bank:HDFC:UPI", 180, 400),
        ("Chai Point", "Expenses:Food:Snacks", "Assets:Cash", 30, 80),
        # Groceries (1-2 per week)
        ("BigBasket", "Expenses:Food:Groceries", "Assets:Bank:HDFC:UPI", 500, 2500),
        ("Zepto", "Expenses:Food:Groceries", "Assets:Bank:HDFC:UPI", 200, 800),
        # Restaurants (1-2 per week)
        ("Truffles", "Expenses:Food:Restaurants", "Liabilities:CreditCard:HDFC", 400, 1200),
        ("Meghana Foods", "Expenses:Food:Restaurants", "Assets:Bank:HDFC:UPI", 300, 800),
        ("Vidyarthi Bhavan", "Expenses:Food:Restaurants", "Assets:Cash", 150, 400),
        # Transport (3-4 per week)
        ("Uber", "Expenses:Transport:Rides", "Assets:Bank:HDFC:UPI", 100, 500),
        ("Ola", "Expenses:Transport:Rides", "Assets:Bank:HDFC:UPI", 80, 400),
        ("Rapido", "Expenses:Transport:Rides", "Assets:Bank:HDFC:UPI", 50, 200),
        ("Namma Metro", "Expenses:Transport:PublicTransit", "Assets:Cash", 30, 60),
        # Fuel (1-2 per month)
        ("Shell Petrol", "Expenses:Transport:Fuel", "Liabilities:CreditCard:HDFC", 1500, 3000),
        # Shopping (occasional)
        ("Amazon", "Expenses:Shopping:Online", "Liabilities:CreditCard:HDFC", 500, 5000),
        ("Flipkart", "Expenses:Shopping:Online", "Liabilities:CreditCard:HDFC", 300, 3000),
        ("Decathlon", "Expenses:Shopping:Sports", "Liabilities:CreditCard:HDFC", 1000, 5000),
        # Health
        ("Apollo Pharmacy", "Expenses:Health:Pharmacy", "Assets:Bank:HDFC:UPI", 200, 800),
        # Personal care
        ("Toni & Guy", "Expenses:PersonalCare:Grooming", "Assets:Bank:HDFC:UPI", 500, 1500),
        # ATM
        ("ATM Withdrawal", "Expenses:Cash", "Assets:Bank:HDFC", 2000, 5000),
    ]

    # Frequency weights (higher = more frequent)
    frequency_weights = {
        "Swiggy": 8, "Zomato": 6, "Third Wave Coffee": 12, "Chai Point": 15,
        "BigBasket": 4, "Zepto": 5, "Truffles": 2, "Meghana Foods": 3,
        "Vidyarthi Bhavan": 2, "Uber": 8, "Ola": 6, "Rapido": 5,
        "Namma Metro": 8, "Shell Petrol": 2, "Amazon": 3, "Flipkart": 2,
        "Decathlon": 1, "Apollo Pharmacy": 1, "Toni & Guy": 1, "ATM Withdrawal": 2,
    }

    variable_transactions = []
    current = start_date
    while current <= end_date:
        # Pick 2-5 transactions per day
        n_txns = random.randint(2, 5)
        day_templates = random.choices(
            variable_templates,
            weights=[frequency_weights.get(t[0], 1) for t in variable_templates],
            k=n_txns,
        )

        for payee, expense_acc, payment_acc, min_amt, max_amt in day_templates:
            amount = Decimal(str(random.randint(min_amt, max_amt)))
            source = random.choice([TransactionSource.WHATSAPP, TransactionSource.WEB])

            txn = Transaction.create_expense(
                date=current,
                payee=payee,
                amount=amount,
                expense_account=expense_acc,
                payment_account=payment_acc,
                source=source,
                source_user="Karan",
            )
            variable_transactions.append(txn)

        current += timedelta(days=1)

    # Build final ledger
    sections = []
    sections.append("\n".join(payee_mappings))
    sections.append("")
    sections.append(budget.to_ledger())
    sections.append("")

    # Sort all transactions by date
    all_txns = fixed_transactions + variable_transactions
    all_txns.sort(key=lambda t: t.date)

    for txn in all_txns:
        sections.append(txn.to_ledger())

    return "\n\n".join(sections) + "\n"


async def generate_chat_history(db_path: Path, start_date: date, end_date: date) -> None:
    """Generate realistic chat history with conversations."""
    ch = ChatHistory(db_path)

    conversations = [
        {
            "thread_id": "wa:dm:919876543210",
            "title": "WhatsApp: Karan",
            "messages": [
                ("user", "chai 50"),
                ("assistant", "Saved 50 for Chai Point — Snacks, cash."),
                ("user", "swiggy 450"),
                ("assistant", "Saved 450 for Swiggy — Food delivery, HDFC UPI."),
                ("user", "actually it was 500"),
                ("assistant", "Updated Swiggy to 500."),
                ("user", "uber to office 250"),
                ("assistant", "Saved 250 for Uber — Rides, HDFC UPI."),
                ("user", "bigbasket 1800 vegetables and fruits"),
                ("assistant", "Saved 1800 for BigBasket — Groceries, HDFC UPI."),
                ("user", "how much on food this month"),
                ("assistant", "Your food spending this month: 8,450. Budget: 15,000. You've used 56%."),
                ("user", "netflix 649"),
                ("assistant", "Saved 649 for Netflix — Streaming, HDFC."),
                ("user", "petrol 2500 hdfc card"),
                ("assistant", "Saved 2,500 for Shell — Fuel, HDFC credit card."),
                ("user", "rent 25000"),
                ("assistant", "Saved 25,000 for Landlord — Housing rent, HDFC."),
                ("user", "haircut 700"),
                ("assistant", "Saved 700 for Toni & Guy — Grooming, HDFC UPI."),
            ],
        },
        {
            "thread_id": "web:abc123def456",
            "title": "Monthly review",
            "messages": [
                ("user", "Show me my spending breakdown for this month"),
                ("assistant", "Here's your spending for this month:\n\nFood: 12,350 (82% of 15k budget)\nTransport: 3,200 (64% of 5k budget)\nHousing: 25,000 (93% of 27k budget)\nUtilities: 3,498\nEntertainment: 768\nShopping: 4,500\nHealth: 1,500\n\nTotal: 50,816"),
                ("user", "What's my biggest expense category?"),
                ("assistant", "Housing (Rent) at 25,000, followed by Food at 12,350."),
                ("user", "Am I on track with my budget?"),
                ("assistant", "You're within budget for most categories. Food is at 82% with a week left — might be tight. Everything else looks good."),
            ],
        },
        {
            "thread_id": "web:settings001",
            "title": "Initial setup",
            "messages": [
                ("user", "Set up my accounts. I use HDFC bank (savings + UPI), HDFC credit card, and some cash."),
                ("assistant", "I've noted your accounts:\n- Assets:Bank:HDFC (savings)\n- Assets:Bank:HDFC:UPI\n- Liabilities:CreditCard:HDFC\n- Assets:Cash\n\nThese will be used for payment tracking."),
                ("user", "Budget 15k food, 5k transport, 3k entertainment, 5k utilities, 8k shopping, 3k health, 27k housing"),
                ("assistant", "Budget set for 7 categories. Total monthly budget: 66,000."),
            ],
        },
        {
            "thread_id": "web:import001",
            "title": "CSV Import",
            "messages": [
                ("user", "I want to import my HDFC bank statement"),
                ("assistant", "Sure, upload your CSV file and I'll import the transactions. I'll auto-categorize based on known payees and skip any duplicates."),
            ],
        },
    ]

    for conv in conversations:
        await ch.create_thread(thread_id=conv["thread_id"], title=conv["title"])
        for role, content in conv["messages"]:
            await ch.save_message(conv["thread_id"], role, content)


async def main():
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("./test_data")
    data_dir.mkdir(parents=True, exist_ok=True)

    end_date = date.today()
    start_date = (end_date.replace(day=1) - timedelta(days=1)).replace(day=1)  # Start of previous month

    print(f"Generating data for {start_date} to {end_date}...")

    # Generate ledger
    ledger_content = generate_ledger_data(start_date, end_date)
    ledger_path = data_dir / "main.ledger"
    ledger_path.write_text(ledger_content)
    lines = ledger_content.count("\n")
    print(f"Written {ledger_path} ({lines} lines)")

    # Generate chat history
    db_path = data_dir / "chat.db"
    db_path.unlink(missing_ok=True)
    await generate_chat_history(db_path, start_date, end_date)
    print(f"Written {db_path}")

    print("Done!")


if __name__ == "__main__":
    asyncio.run(main())

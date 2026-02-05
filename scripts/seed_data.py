#!/usr/bin/env python3
"""
Seed data generator for Gullak - Creates realistic Indian household expenses for 21 days.
Run with: python scripts/seed_data.py
"""

import random
import sqlite3
import json
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

# Configuration
DATA_DIR = Path(__file__).parent.parent / "data"
LEDGER_FILE = DATA_DIR / "main.ledger"
CHAT_DB = DATA_DIR / "chat_history.db"

# Date range: last 21 days from today (Jan 21, 2026)
END_DATE = datetime(2026, 1, 21)
START_DATE = END_DATE - timedelta(days=20)


def gen_id():
    return uuid4().hex[:8]


# ============================================================================
# EXPENSE TEMPLATES - Realistic Indian household patterns
# ============================================================================

GROCERIES = [
    (
        "BigBasket",
        "Expenses:Food:Groceries",
        "Assets:Bank:HDFC:UPI",
        (800, 2500),
        "Weekly groceries",
    ),
    ("Blinkit", "Expenses:Food:Groceries", "Assets:Bank:HDFC:UPI", (150, 800), "Quick grocery run"),
    ("Zepto", "Expenses:Food:Groceries", "Assets:Bank:HDFC:UPI", (200, 600), "Instant delivery"),
    ("DMart", "Expenses:Food:Groceries", "Assets:Bank:HDFC", (1500, 4000), "Monthly stock-up"),
    (
        "Nature's Basket",
        "Expenses:Food:Groceries",
        "Liabilities:CreditCard:ICICI",
        (600, 1500),
        "Premium groceries",
    ),
    (
        "Local Kirana Store",
        "Expenses:Food:Groceries",
        "Assets:Cash",
        (100, 400),
        "Daily essentials",
    ),
    ("Nilgiris", "Expenses:Food:Groceries", "Assets:Bank:Kotak:UPI", (300, 900), "Dairy and bread"),
]

FOOD_DELIVERY = [
    ("Swiggy", "Expenses:Food:Delivery", "Liabilities:CreditCard:ICICI", (200, 800), None),
    ("Zomato", "Expenses:Food:Delivery", "Liabilities:CreditCard:ICICI", (250, 900), None),
    (
        "Swiggy Instamart",
        "Expenses:Food:Groceries",
        "Assets:Bank:HDFC:UPI",
        (150, 500),
        "Quick essentials",
    ),
    ("EatSure", "Expenses:Food:Delivery", "Assets:Bank:Kotak:UPI", (300, 600), None),
]

DINING_OUT = [
    (
        "Starbucks",
        "Expenses:Food:Cafe",
        "Liabilities:CreditCard:Axis",
        (350, 700),
        "Coffee and snacks",
    ),
    ("Third Wave Coffee", "Expenses:Food:Cafe", "Assets:Bank:HDFC:UPI", (250, 500), None),
    ("Blue Tokai", "Expenses:Food:Cafe", "Assets:Bank:Kotak:UPI", (200, 450), None),
    (
        "Truffles",
        "Expenses:Food:DiningOut",
        "Liabilities:CreditCard:ICICI",
        (800, 1500),
        "Dinner with family",
    ),
    (
        "Toit Brewpub",
        "Expenses:Food:DiningOut",
        "Liabilities:CreditCard:Axis",
        (1200, 2500),
        "Weekend dinner",
    ),
    (
        "Barbeque Nation",
        "Expenses:Food:DiningOut",
        "Liabilities:CreditCard:ICICI",
        (1800, 3200),
        "Family dinner",
    ),
    (
        "Punjab Grill",
        "Expenses:Food:DiningOut",
        "Liabilities:CreditCard:Axis",
        (2000, 4000),
        "Special occasion",
    ),
    ("McDonald's", "Expenses:Food:FastFood", "Assets:Bank:HDFC:UPI", (200, 500), None),
    ("KFC", "Expenses:Food:FastFood", "Assets:Bank:HDFC:UPI", (300, 600), None),
    (
        "Domino's",
        "Expenses:Food:FastFood",
        "Liabilities:CreditCard:ICICI",
        (400, 800),
        "Pizza night",
    ),
    ("Chai Point", "Expenses:Food:Cafe", "Assets:Cash", (60, 150), "Office chai"),
    (
        "Local Darshini",
        "Expenses:Food:DiningOut",
        "Assets:Cash",
        (80, 200),
        "South Indian breakfast",
    ),
]

TRANSPORT = [
    ("Uber", "Expenses:Transport:Rides", "Assets:Bank:HDFC:UPI", (150, 600), None),
    ("Ola", "Expenses:Transport:Rides", "Assets:Bank:HDFC:UPI", (120, 500), None),
    ("Rapido", "Expenses:Transport:Rides", "Assets:Bank:Kotak:UPI", (50, 200), "Bike taxi"),
    ("Namma Metro", "Expenses:Transport:PublicTransit", "Assets:Cash", (30, 60), "Metro commute"),
    ("BMTC Bus", "Expenses:Transport:PublicTransit", "Assets:Cash", (15, 40), "Bus fare"),
    (
        "Indian Oil - Petrol",
        "Expenses:Transport:Fuel",
        "Liabilities:CreditCard:ICICI",
        (1500, 3500),
        "Fuel for car",
    ),
    ("HP Petrol Pump", "Expenses:Transport:Fuel", "Assets:Bank:HDFC", (1000, 2500), "Bike fuel"),
    ("Parking", "Expenses:Transport:Parking", "Assets:Cash", (20, 100), "Mall parking"),
    (
        "FASTag Recharge",
        "Expenses:Transport:Tolls",
        "Assets:Bank:HDFC",
        (500, 1000),
        "Highway tolls",
    ),
]

SHOPPING = [
    ("Amazon", "Expenses:Shopping:Online", "Liabilities:CreditCard:ICICI", (500, 5000), None),
    ("Flipkart", "Expenses:Shopping:Online", "Liabilities:CreditCard:Axis", (400, 4000), None),
    (
        "Myntra",
        "Expenses:Shopping:Clothing",
        "Liabilities:CreditCard:ICICI",
        (800, 3500),
        "Clothes shopping",
    ),
    ("Ajio", "Expenses:Shopping:Clothing", "Liabilities:CreditCard:Axis", (600, 2500), None),
    (
        "Croma",
        "Expenses:Shopping:Electronics",
        "Liabilities:CreditCard:ICICI",
        (1500, 8000),
        "Electronics",
    ),
    (
        "Decathlon",
        "Expenses:Shopping:Sports",
        "Liabilities:CreditCard:Axis",
        (800, 3000),
        "Sports gear",
    ),
    ("Lifestyle", "Expenses:Shopping:Clothing", "Liabilities:CreditCard:ICICI", (1200, 4000), None),
    ("Reliance Digital", "Expenses:Shopping:Electronics", "Assets:Bank:HDFC", (2000, 6000), None),
    ("IKEA", "Expenses:Shopping:Home", "Liabilities:CreditCard:Axis", (1500, 8000), "Home decor"),
    (
        "Home Centre",
        "Expenses:Shopping:Home",
        "Liabilities:CreditCard:ICICI",
        (1000, 5000),
        "Household items",
    ),
]

UTILITIES = [
    (
        "BESCOM Electricity",
        "Expenses:Housing:Electricity",
        "Assets:Bank:HDFC",
        (1500, 3500),
        "Monthly electricity bill",
    ),
    (
        "Indane Gas Cylinder",
        "Expenses:Housing:Gas",
        "Assets:Bank:HDFC:UPI",
        (950, 1050),
        "LPG refill",
    ),
    (
        "ACT Fibernet",
        "Expenses:Housing:Internet",
        "Assets:Bank:HDFC",
        (1000, 1500),
        "Monthly internet",
    ),
    ("Airtel Postpaid", "Expenses:Utilities:Mobile", "Assets:Bank:HDFC", (599, 999), "Mobile bill"),
    ("BWSSB Water", "Expenses:Housing:Water", "Assets:Bank:HDFC:UPI", (200, 500), "Water bill"),
    (
        "Apartment Maintenance",
        "Expenses:Housing:Maintenance",
        "Assets:Bank:HDFC",
        (4000, 6000),
        "Society maintenance",
    ),
]

SUBSCRIPTIONS = [
    (
        "Netflix",
        "Expenses:Entertainment:Subscriptions",
        "Liabilities:CreditCard:ICICI",
        (199, 649),
        "Streaming subscription",
    ),
    (
        "Amazon Prime",
        "Expenses:Entertainment:Subscriptions",
        "Liabilities:CreditCard:ICICI",
        (179, 179),
        "Prime membership",
    ),
    (
        "Hotstar",
        "Expenses:Entertainment:Subscriptions",
        "Assets:Bank:HDFC:UPI",
        (299, 299),
        "Disney+ Hotstar",
    ),
    (
        "Spotify",
        "Expenses:Entertainment:Subscriptions",
        "Liabilities:CreditCard:ICICI",
        (119, 119),
        "Music streaming",
    ),
    (
        "YouTube Premium",
        "Expenses:Entertainment:Subscriptions",
        "Assets:Bank:HDFC:UPI",
        (129, 129),
        "Ad-free YouTube",
    ),
    (
        "Gym Membership - Cult.fit",
        "Expenses:Health:Fitness",
        "Liabilities:CreditCard:Axis",
        (1500, 2500),
        "Monthly gym",
    ),
]

HEALTH = [
    (
        "Apollo Pharmacy",
        "Expenses:Health:Medical",
        "Assets:Bank:HDFC:UPI",
        (200, 1500),
        "Medicines",
    ),
    ("1mg", "Expenses:Health:Medical", "Assets:Bank:HDFC:UPI", (300, 1200), "Online pharmacy"),
    (
        "PharmEasy",
        "Expenses:Health:Medical",
        "Liabilities:CreditCard:ICICI",
        (250, 1000),
        "Medicines delivery",
    ),
    (
        "Dr. Consultation - Practo",
        "Expenses:Health:Medical",
        "Assets:Bank:HDFC:UPI",
        (500, 1500),
        "Doctor visit",
    ),
    (
        "Manipal Hospital",
        "Expenses:Health:Medical",
        "Liabilities:CreditCard:ICICI",
        (1000, 5000),
        "Health checkup",
    ),
    (
        "Lenskart",
        "Expenses:Health:Eyecare",
        "Liabilities:CreditCard:ICICI",
        (1500, 4000),
        "New glasses",
    ),
]

ENTERTAINMENT = [
    (
        "PVR Cinemas",
        "Expenses:Entertainment:Movies",
        "Liabilities:CreditCard:ICICI",
        (400, 1200),
        "Movie tickets",
    ),
    (
        "BookMyShow",
        "Expenses:Entertainment:Events",
        "Liabilities:CreditCard:Axis",
        (500, 2000),
        "Event tickets",
    ),
    ("INOX", "Expenses:Entertainment:Movies", "Assets:Bank:HDFC:UPI", (350, 900), "Movie night"),
]

PERSONAL_CARE = [
    (
        "Urban Company",
        "Expenses:Personal:Services",
        "Assets:Bank:HDFC:UPI",
        (500, 2000),
        "Home services",
    ),
    (
        "Lakme Salon",
        "Expenses:Personal:Grooming",
        "Liabilities:CreditCard:ICICI",
        (800, 2500),
        "Salon visit",
    ),
    ("Enrich Salon", "Expenses:Personal:Grooming", "Assets:Bank:HDFC:UPI", (400, 1200), "Haircut"),
    (
        "Nykaa",
        "Expenses:Personal:Beauty",
        "Liabilities:CreditCard:ICICI",
        (500, 2500),
        "Beauty products",
    ),
]

MISCELLANEOUS = [
    (
        "Ather Charging",
        "Expenses:Transport:Charging",
        "Assets:Bank:HDFC:UPI",
        (50, 150),
        "EV charging",
    ),
    ("Dry Cleaning", "Expenses:Personal:Laundry", "Assets:Cash", (200, 600), "Laundry service"),
    (
        "Newspaper Vendor",
        "Expenses:Utilities:Newspaper",
        "Assets:Cash",
        (300, 300),
        "Monthly newspaper",
    ),
    (
        "Amazon Pay Later EMI",
        "Expenses:Shopping:EMI",
        "Assets:Bank:HDFC",
        (1500, 3000),
        "EMI payment",
    ),
    (
        "LIC Premium",
        "Expenses:Insurance:Life",
        "Assets:Bank:HDFC",
        (5000, 10000),
        "Insurance premium",
    ),
]


def generate_transactions():
    """Generate realistic transaction data for 21 days."""
    transactions = []
    current_date = START_DATE

    while current_date <= END_DATE:
        day_of_week = current_date.weekday()
        is_weekend = day_of_week >= 5
        date_str = current_date.strftime("%Y/%m/%d")

        # Daily patterns
        # Morning: coffee/chai (70% chance)
        if random.random() < 0.7:
            choices = [t for t in DINING_OUT if "Cafe" in t[1] or "chai" in str(t[4]).lower()]
            if choices:
                t = random.choice(choices)
                transactions.append(create_transaction(date_str, t))

        # Lunch: 40% chance of ordering in/eating out
        if random.random() < 0.4:
            if random.random() < 0.6:
                t = random.choice(FOOD_DELIVERY[:2])  # Swiggy/Zomato
            else:
                t = random.choice(
                    [t for t in DINING_OUT if "FastFood" in t[1] or "Darshini" in t[0]]
                )
            if t:
                transactions.append(create_transaction(date_str, t))

        # Evening snacks/dinner: higher on weekends
        if is_weekend and random.random() < 0.8:
            t = random.choice(DINING_OUT)
            transactions.append(create_transaction(date_str, t))
        elif random.random() < 0.5:
            if random.random() < 0.7:
                t = random.choice(FOOD_DELIVERY)
            else:
                t = random.choice(DINING_OUT)
            transactions.append(create_transaction(date_str, t))

        # Transport: daily commute on weekdays
        if not is_weekend:
            # Metro/bus more common
            if random.random() < 0.5:
                t = random.choice([t for t in TRANSPORT if "PublicTransit" in t[1]])
                transactions.append(create_transaction(date_str, t))
            if random.random() < 0.3:
                t = random.choice([t for t in TRANSPORT if "Rides" in t[1]])
                transactions.append(create_transaction(date_str, t))
        else:
            # Weekend: more likely to use cabs
            if random.random() < 0.6:
                t = random.choice([t for t in TRANSPORT if "Rides" in t[1]])
                transactions.append(create_transaction(date_str, t))

        # Groceries: Blinkit/Zepto almost daily, BigBasket weekly
        if random.random() < 0.6:
            t = random.choice(
                [t for t in GROCERIES if t[0] in ("Blinkit", "Zepto", "Local Kirana Store")]
            )
            transactions.append(create_transaction(date_str, t))

        # Weekly patterns
        if day_of_week == 5:  # Saturday: BigBasket/DMart run
            t = random.choice(
                [t for t in GROCERIES if t[0] in ("BigBasket", "DMart", "Nature's Basket")]
            )
            transactions.append(create_transaction(date_str, t))

        if day_of_week == 6 and random.random() < 0.5:  # Sunday: movie?
            t = random.choice(ENTERTAINMENT)
            transactions.append(create_transaction(date_str, t))

        # Shopping: 2-3 times per week
        if random.random() < 0.2:
            t = random.choice(SHOPPING)
            transactions.append(create_transaction(date_str, t))

        # Fuel: once a week
        if day_of_week == 0 and random.random() < 0.7:  # Monday fuel up
            t = random.choice([t for t in TRANSPORT if "Fuel" in t[1]])
            transactions.append(create_transaction(date_str, t))

        # Monthly bills (around 1st and 5th)
        if current_date.day == 1:
            # Subscriptions
            for sub in random.sample(SUBSCRIPTIONS, min(3, len(SUBSCRIPTIONS))):
                transactions.append(create_transaction(date_str, sub))
            # Apartment maintenance
            maint = [t for t in UTILITIES if "Maintenance" in t[0]]
            if maint:
                transactions.append(create_transaction(date_str, maint[0]))

        if current_date.day == 5:
            # Utility bills
            for util in [
                t
                for t in UTILITIES
                if t[0] in ("BESCOM Electricity", "ACT Fibernet", "Airtel Postpaid")
            ]:
                transactions.append(create_transaction(date_str, util))

        # Gas cylinder: roughly every 3 weeks
        if current_date.day == 10:
            gas = [t for t in UTILITIES if "Gas" in t[0]]
            if gas:
                transactions.append(create_transaction(date_str, gas[0]))

        # Health: occasional
        if random.random() < 0.1:
            t = random.choice(
                [t for t in HEALTH if t[0] in ("Apollo Pharmacy", "1mg", "PharmEasy")]
            )
            transactions.append(create_transaction(date_str, t))

        # Personal care: once a week
        if day_of_week == 6 and random.random() < 0.3:
            t = random.choice(PERSONAL_CARE)
            transactions.append(create_transaction(date_str, t))

        # Misc expenses
        if random.random() < 0.05:
            t = random.choice(MISCELLANEOUS)
            transactions.append(create_transaction(date_str, t))

        current_date += timedelta(days=1)

    return transactions


def create_transaction(date_str, template):
    """Create a single transaction from a template."""
    payee, expense_account, payment_account, amount_range, note = template
    amount = round(random.uniform(amount_range[0], amount_range[1]), 2)

    # Round to realistic amounts
    if amount > 100:
        amount = round(amount / 10) * 10
    if amount > 1000:
        amount = round(amount / 50) * 50

    return {
        "date": date_str,
        "payee": payee,
        "expense_account": expense_account,
        "payment_account": payment_account,
        "amount": amount,
        "note": note,
        "gullak_id": gen_id(),
    }


def format_ledger_transaction(txn):
    """Format transaction as ledger entry."""
    lines = [f"{txn['date']} {txn['payee']}"]
    lines.append(f"    ; gullak:id {txn['gullak_id']}")
    lines.append(f"    ; gullak:source web")
    if txn.get("note"):
        lines.append(f"    ; {txn['note']}")
    lines.append(f"    {txn['expense_account']}  {txn['amount']:.2f} INR")
    lines.append(f"    {txn['payment_account']}  {-txn['amount']:.2f} INR")
    return "\n".join(lines)


def generate_chat_messages(transactions):
    """Generate realistic chat messages that would have created these transactions."""
    messages = []

    # Group transactions by date
    by_date = {}
    for txn in transactions:
        date = txn["date"]
        if date not in by_date:
            by_date[date] = []
        by_date[date].append(txn)

    # Create chat threads with realistic messages
    thread_templates = [
        # Morning coffee
        [
            ("user", "coffee at {payee} {amount}"),
            ("assistant", "Got it! Logged {amount} INR at {payee} under Food:Cafe."),
        ],
        # Food delivery
        [
            ("user", "ordered {payee} for {amount} rs"),
            ("assistant", "Added! {amount} INR for {payee} delivery."),
        ],
        # Groceries
        [
            ("user", "{payee} groceries {amount}"),
            ("assistant", "Recorded {amount} INR for groceries from {payee}."),
        ],
        # Transport
        [
            ("user", "took {payee} today {amount}"),
            ("assistant", "Logged {payee} ride for {amount} INR."),
        ],
        # Bills
        [
            ("user", "paid {payee} bill {amount}"),
            ("assistant", "Bill payment recorded: {amount} INR to {payee}."),
        ],
        # Shopping
        [
            ("user", "bought something on {payee} for {amount}"),
            ("assistant", "Shopping expense logged: {amount} INR on {payee}."),
        ],
        # Quick entry
        [
            ("user", "{payee} {amount}"),
            ("assistant", "Added: {amount} INR at {payee}."),
        ],
    ]

    for date, txns in by_date.items():
        for txn in random.sample(txns, min(len(txns), 3)):  # Not all txns have chat
            template = random.choice(thread_templates)
            thread_id = uuid4().hex[:12]
            dt = datetime.strptime(date, "%Y/%m/%d")
            # Random time during the day
            dt = dt.replace(hour=random.randint(8, 22), minute=random.randint(0, 59))

            for role, msg_template in template:
                msg = msg_template.format(payee=txn["payee"], amount=int(txn["amount"]))
                messages.append(
                    {
                        "thread_id": thread_id,
                        "role": role,
                        "content": msg,
                        "created_at": dt.isoformat(),
                    }
                )
                dt += timedelta(seconds=random.randint(2, 10))

    return messages


def write_ledger(transactions):
    """Append transactions to ledger file."""
    # Read existing content
    existing = LEDGER_FILE.read_text()

    # Remove any existing seed data marker if present
    if "; === SEED DATA ===" in existing:
        existing = existing.split("; === SEED DATA ===")[0].rstrip() + "\n"

    # Add seed data
    lines = [existing, "\n; === SEED DATA ===", "; Generated for demo purposes", ""]

    # Sort transactions by date
    sorted_txns = sorted(transactions, key=lambda t: t["date"])

    for txn in sorted_txns:
        lines.append(format_ledger_transaction(txn))
        lines.append("")  # Blank line between transactions

    LEDGER_FILE.write_text("\n".join(lines))
    print(f"Wrote {len(transactions)} transactions to {LEDGER_FILE}")


def write_chat_history(messages):
    """Write chat messages to SQLite database."""
    conn = sqlite3.connect(CHAT_DB)
    cursor = conn.cursor()

    # Ensure tables exist
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY,
            title TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (thread_id) REFERENCES threads(id)
        )
    """)

    # Group messages by thread
    threads = {}
    for msg in messages:
        tid = msg["thread_id"]
        if tid not in threads:
            threads[tid] = []
        threads[tid].append(msg)

    # Insert threads and messages
    for tid, msgs in threads.items():
        first_msg = msgs[0]
        last_msg = msgs[-1]
        title = first_msg["content"][:50]
        if len(first_msg["content"]) > 50:
            title += "..."

        cursor.execute(
            "INSERT OR IGNORE INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (tid, title, first_msg["created_at"], last_msg["created_at"]),
        )

        for msg in msgs:
            cursor.execute(
                "INSERT INTO messages (thread_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                (msg["thread_id"], msg["role"], msg["content"], msg["created_at"]),
            )

    conn.commit()
    conn.close()
    print(f"Wrote {len(messages)} messages across {len(threads)} threads to {CHAT_DB}")


def main():
    print("Generating seed data for Gullak...")
    print(f"Date range: {START_DATE.date()} to {END_DATE.date()}")

    # Generate transactions
    transactions = generate_transactions()
    print(f"Generated {len(transactions)} transactions")

    # Calculate totals by category
    totals = {}
    for txn in transactions:
        cat = txn["expense_account"].split(":")[1]
        totals[cat] = totals.get(cat, 0) + txn["amount"]

    print("\nCategory breakdown:")
    for cat, total in sorted(totals.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {total:,.0f} INR")

    print(f"\nTotal expenses: {sum(totals.values()):,.0f} INR")

    # Write to ledger
    write_ledger(transactions)

    # Generate and write chat history
    messages = generate_chat_messages(transactions)
    write_chat_history(messages)

    print("\nDone! Your Gullak is now populated with realistic demo data.")


if __name__ == "__main__":
    main()

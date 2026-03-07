"""Category suggestion based on patterns and merchant names."""

import re

# Pattern order matters: first match wins. Income patterns before expense patterns.
CATEGORY_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"salary|payroll|stipend", re.IGNORECASE), "Income:Salary"),
    (
        re.compile(
            r"interest\s*(credit|credited|received|earned)|int\s*cr|interest\s+received",
            re.IGNORECASE,
        ),
        "Income:Interest",
    ),
    (re.compile(r"dividend", re.IGNORECASE), "Income:Dividend"),
    (re.compile(r"refund|cashback", re.IGNORECASE), "Income:Refund"),
    # Food & Dining
    (re.compile(r"swiggy|zomato|uber\s*eats|dunzo", re.IGNORECASE), "Expenses:Food:Delivery"),
    (re.compile(r"starbucks|costa|cafe|coffee|barista|ccd", re.IGNORECASE), "Expenses:Food:Coffee"),
    (
        re.compile(r"mcdonald|domino|pizza|burger|kfc|subway|taco", re.IGNORECASE),
        "Expenses:Food:FastFood",
    ),
    (
        re.compile(r"restaurant|bistro|dhaba|hotel\s+\w+\s+restaurant", re.IGNORECASE),
        "Expenses:Food:Restaurants",
    ),
    (
        re.compile(
            r"bigbasket|blinkit|zepto|jiomart|grofers|d-?mart|more\s+supermarket|reliance\s+fresh|supermarket|grocery|licious|freshtohome|country\s*delight",
            re.IGNORECASE,
        ),
        "Expenses:Food:Groceries",
    ),
    # Transport
    (re.compile(r"uber|ola|rapido|meru|cab|taxi", re.IGNORECASE), "Expenses:Transport:Rides"),
    (
        re.compile(
            r"shell|hp\s+petrol|bharat\s+petroleum|iocl|indian\s*oil|petrol|fuel|diesel|cng|filling",
            re.IGNORECASE,
        ),
        "Expenses:Transport:Fuel",
    ),
    (re.compile(r"irctc|railway|train", re.IGNORECASE), "Expenses:Transport:Train"),
    (
        re.compile(
            r"indigo|spicejet|air\s*india|vistara|akasa|goair|flight|airline", re.IGNORECASE
        ),
        "Expenses:Transport:Flight",
    ),
    (
        re.compile(r"metro|bus|bmtc|dtc|public\s*transport", re.IGNORECASE),
        "Expenses:Transport:PublicTransit",
    ),
    (re.compile(r"parking|fastag|toll", re.IGNORECASE), "Expenses:Transport:Parking"),
    # Shopping
    (re.compile(r"amazon|flipkart|myntra|ajio|meesho", re.IGNORECASE), "Expenses:Shopping:Online"),
    (re.compile(r"decathlon|sports", re.IGNORECASE), "Expenses:Shopping:Sports"),
    (
        re.compile(r"ikea|home\s*centre|pepperfry|urban\s*ladder", re.IGNORECASE),
        "Expenses:Shopping:HomeDecor",
    ),
    (
        re.compile(r"croma|reliance\s*digital|vijay\s*sales|electronics", re.IGNORECASE),
        "Expenses:Shopping:Electronics",
    ),
    # Entertainment & Subscriptions
    (
        re.compile(r"netflix|hotstar|disney|prime\s*video|jiocinema|sonyliv|zee5", re.IGNORECASE),
        "Expenses:Entertainment:Streaming",
    ),
    (
        re.compile(r"spotify|gaana|jiosaavn|apple\s*music|youtube\s*music", re.IGNORECASE),
        "Expenses:Entertainment:Music",
    ),
    (
        re.compile(r"pvr|inox|cinepolis|movie|cinema|bookmyshow", re.IGNORECASE),
        "Expenses:Entertainment:Movies",
    ),
    (
        re.compile(r"playstation|xbox|steam|epic\s*games|gaming", re.IGNORECASE),
        "Expenses:Entertainment:Gaming",
    ),
    # Utilities & Bills
    (
        re.compile(r"electricity|power|bescom|tata\s*power|adani|discom", re.IGNORECASE),
        "Expenses:Utilities:Electricity",
    ),
    (re.compile(r"water|bwssb|jal\s*board", re.IGNORECASE), "Expenses:Utilities:Water"),
    (
        re.compile(r"piped\s*gas|indane|bharat\s*gas|hp\s*gas|lpg", re.IGNORECASE),
        "Expenses:Utilities:Gas",
    ),
    (
        re.compile(r"airtel|jio|vodafone|vi|bsnl|mobile|recharge|postpaid|prepaid", re.IGNORECASE),
        "Expenses:Utilities:Mobile",
    ),
    (
        re.compile(r"broadband|internet|wifi|fiber|act\s*fibernet", re.IGNORECASE),
        "Expenses:Utilities:Internet",
    ),
    # Health & Medical
    (
        re.compile(
            r"apollo|pharmeasy|netmeds|1mg|medplus|pharmacy|medical|medicine", re.IGNORECASE
        ),
        "Expenses:Health:Pharmacy",
    ),
    (
        re.compile(r"hospital|clinic|doctor|dr\.|consultation", re.IGNORECASE),
        "Expenses:Health:Medical",
    ),
    (
        re.compile(r"gym|fitness|cult\.fit|cult|gold\'s|healthifyme", re.IGNORECASE),
        "Expenses:Health:Fitness",
    ),
    (
        re.compile(r"insurance|lic|hdfc\s*life|icici\s*pru|sbi\s*life", re.IGNORECASE),
        "Expenses:Insurance",
    ),
    # Education
    (
        re.compile(
            r"udemy|coursera|unacademy|byju|school|college|university|tuition|coaching",
            re.IGNORECASE,
        ),
        "Expenses:Education",
    ),
    (re.compile(r"book|kindle|audible|library", re.IGNORECASE), "Expenses:Education:Books"),
    # Personal Care
    (
        re.compile(r"salon|parlour|parlor|spa|massage|haircut|beauty", re.IGNORECASE),
        "Expenses:PersonalCare:Grooming",
    ),
    (
        re.compile(r"nykaa|purplle|sephora|cosmetic|makeup", re.IGNORECASE),
        "Expenses:PersonalCare:Cosmetics",
    ),
    # Services
    (
        re.compile(r"urban\s*company|urbanclap|housejoy|plumber|electrician|maid|cleaning|domestic\s*help", re.IGNORECASE),
        "Expenses:Services:HomeServices",
    ),
    (re.compile(r"laundry|dry\s*clean|wash", re.IGNORECASE), "Expenses:Services:Laundry"),
    (re.compile(r"atm\s*withdraw|cash\s*withdraw|withdrawal", re.IGNORECASE), "Expenses:Cash"),
    (
        re.compile(r"emi\s*payment|loan\s*payment|interest\s*charge", re.IGNORECASE),
        "Expenses:Finance:EMI",
    ),
    (re.compile(r"rent|housing|apartment", re.IGNORECASE), "Expenses:Housing:Rent"),
]


# Amount-based heuristics (when description doesn't match patterns)
AMOUNT_HEURISTICS: list[tuple[tuple[float, float], str]] = [
    ((0, 100), "Expenses:Food:Snacks"),
    ((100, 500), "Expenses:Food:Meals"),
    ((500, 2000), "Expenses:Food:Restaurants"),
]


def suggest_category(
    description: str,
    amount: float | None = None,
    is_credit: bool = False,
) -> str | None:
    """
    Suggest a category based on description and amount.

    Args:
        description: Transaction description/narration
        amount: Transaction amount (for heuristics)
        is_credit: Whether this is a credit (income) transaction

    Returns:
        Suggested account path or None
    """
    if not description:
        return None

    # Check patterns
    for pattern, category in CATEGORY_PATTERNS:
        if pattern.search(description):
            return category

    # For credits without pattern match, suggest Income:Other
    if is_credit:
        return "Income:Other"

    # Amount-based heuristics (only for expenses without pattern match)
    if amount is not None and not is_credit:
        for (min_amt, max_amt), category in AMOUNT_HEURISTICS:
            if min_amt <= amount < max_amt:
                return category

    return None


def get_category_confidence(description: str, suggested: str) -> float:
    """
    Get confidence score for a category suggestion.

    Returns:
        Confidence score between 0 and 1
    """
    if not description or not suggested:
        return 0.0

    for pattern, category in CATEGORY_PATTERNS:
        if pattern.search(description) and category == suggested:
            return 0.9  # High confidence for pattern match

    return 0.5  # Medium confidence for heuristics

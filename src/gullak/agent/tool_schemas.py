from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class ParseExpenseArgs(BaseModel):
    payee: str = Field(
        ..., description="Merchant or payee name (e.g., 'BigBasket', 'Swiggy', 'Amazon')"
    )
    amount: Decimal = Field(
        ..., gt=0, description="Positive amount of the expense (e.g., 500, 1250.50)"
    )
    expense_account: str = Field(
        ...,
        description="Expense account path like 'Expenses:Food:Groceries', 'Expenses:Transport:Fuel', 'Expenses:Housing:Rent'",
    )
    payment_account: str = Field(
        "Assets:Cash",
        description="Payment source like 'Assets:Cash', 'Assets:Bank:HDFC', 'Liabilities:CreditCard:ICICI'. Default: Assets:Cash",
    )
    currency: str = Field("INR", description="Currency code (INR, USD, EUR). Default: INR")
    transaction_date: str = Field(
        "today",
        description="Date in YYYY-MM-DD format, or relative like 'today', 'yesterday', 'last Monday'. Default: today",
    )
    note: str | None = Field(None, description="Optional note about the transaction")
    is_recurring: bool = Field(
        False,
        description="True for recurring expenses like subscriptions, bills, SIPs, EMIs (e.g., 'monthly rent', 'Netflix', 'SIP')",
    )
    recurring_name: str | None = Field(
        None, description="Name for the recurring expense (e.g., 'Netflix', 'Rent')"
    )
    recurring_period: str | None = Field(
        None,
        description="Period pattern for Paisa: '1 * ?' for 1st of month, 'L * ?' for last day, '? * 0' for every Sunday",
    )


class ParseIncomeArgs(BaseModel):
    payee: str = Field(
        ...,
        description="Source of income (e.g., 'Acme Corp', 'HDFC Bank Interest', 'Amazon Refund')",
    )
    amount: Decimal = Field(..., gt=0, description="Amount received (positive number)")
    income_account: str = Field(
        ..., description="Income account like 'Income:Salary' or 'Income:Interest'"
    )
    deposit_account: str = Field(
        ..., description="Account where money was deposited (e.g., 'Assets:Bank:HDFC')"
    )
    currency: str = Field("INR", description="Currency code (INR, USD, EUR). Default: INR")
    transaction_date: str = Field(
        "today", description="Date in YYYY-MM-DD format, or relative like 'today'. Default: today"
    )
    note: str | None = Field(None, description="Optional note")


class QueryBalanceArgs(BaseModel):
    account: str = Field(
        "",
        description="Account pattern like 'Expenses:Food', 'Assets:Bank'. Leave empty for all accounts.",
    )
    period: str = Field("", description="Time period (e.g., 'this month', 'last week', '2024')")


class ListAccountsArgs(BaseModel):
    account_type: Literal["all", "expenses", "assets", "liabilities", "income"] = Field(
        "all", description="Filter by type: 'all', 'expenses', 'assets', 'liabilities', 'income'"
    )


class EditTransactionArgs(BaseModel):
    transaction_id: str = Field(
        ..., description="The gullak ID of the transaction to edit (8-char hex string)"
    )
    payee: str | None = Field(None, description="New payee name (optional)")
    amount: Decimal | None = Field(None, gt=0, description="New amount (optional)")
    expense_account: str | None = Field(None, description="New expense account (optional)")
    payment_account: str | None = Field(None, description="New payment account (optional)")
    currency: str | None = Field(None, description="New currency code (optional)")
    date: str | None = Field(None, description="New date in YYYY-MM-DD format (optional)")
    note: str | None = Field(None, description="New note (optional)")


class DeleteTransactionArgs(BaseModel):
    transaction_id: str = Field(
        ..., description="The gullak ID of the transaction to delete (8-char hex string)"
    )


class GetRecentTransactionsArgs(BaseModel):
    limit: int = Field(
        5, ge=1, le=20, description="Number of transactions to return (default: 5, max: 20)"
    )
    account: str | None = Field(None, description="Filter by account pattern (optional)")


class LearnPayeeMappingArgs(BaseModel):
    payee: str = Field(..., description="The payee/merchant name")
    account: str = Field(..., description="The expense account to associate")


class ImportCsvArgs(BaseModel):
    file_path: str = Field(..., description="Path to the CSV file")
    payment_account: str = Field(
        ..., description="The bank/card account for these transactions (e.g., Assets:Bank:HDFC)"
    )
    default_expense_account: str = Field(
        "Expenses:Unknown", description="Default expense account for uncategorized transactions"
    )


class BudgetEntrySchema(BaseModel):
    account: str = Field(..., description="Expense account (e.g., Expenses:Food)")
    amount: Decimal = Field(..., gt=0, description="Monthly budget amount")


class SetBudgetArgs(BaseModel):
    budgets: list[BudgetEntrySchema] = Field(..., description="List of budget entries")
    funding_account: str = Field(
        "Assets:Checking", description="Account to fund from (default: Assets:Checking)"
    )


class AddCreditCardArgs(BaseModel):
    name: str = Field(..., description="Card name (e.g., 'HDFC', 'Amex', 'ICICI Amazon')")
    credit_limit: int = Field(..., gt=0, description="Credit limit in default currency")
    statement_end_day: int = Field(
        1, ge=1, le=31, description="Day of month when statement closes (1-31)"
    )
    due_day: int = Field(15, ge=1, le=31, description="Day of month when payment is due (1-31)")
    network: Literal["visa", "mastercard", "amex", "rupay", "diners"] = Field(
        "visa", description="Card network"
    )


class AllocationTargetSchema(BaseModel):
    name: str = Field(..., description="Asset class name (e.g., 'Equity', 'Debt')")
    target: int = Field(..., ge=0, le=100, description="Target percentage (0-100)")
    accounts: list[str] | None = Field(
        None, description="Account patterns (e.g., ['Assets:Equity:*'])"
    )


class SetAllocationTargetsArgs(BaseModel):
    targets: list[AllocationTargetSchema] = Field(
        ..., description="List of allocation targets (must sum to 100)"
    )

"""Tests for category suggestion patterns."""

import pytest

from gullak.ledger.categories import get_category_confidence, suggest_category


class TestCategorySuggestion:
    """Test pattern-based category suggestions."""

    # Food & Delivery
    @pytest.mark.parametrize("description,expected", [
        ("Swiggy order", "Expenses:Food:Delivery"),
        ("Zomato - Biryani", "Expenses:Food:Delivery"),
        ("Uber Eats delivery", "Expenses:Food:Delivery"),
    ])
    def test_food_delivery(self, description, expected):
        assert suggest_category(description) == expected

    @pytest.mark.parametrize("description,expected", [
        ("Starbucks Reserve", "Expenses:Food:Coffee"),
        ("CCD Java City", "Expenses:Food:Coffee"),
        ("Blue Tokai Coffee", "Expenses:Food:Coffee"),
    ])
    def test_coffee(self, description, expected):
        assert suggest_category(description) == expected

    @pytest.mark.parametrize("description,expected", [
        ("McDonald's", "Expenses:Food:FastFood"),
        ("Domino's Pizza", "Expenses:Food:FastFood"),
        ("KFC bucket", "Expenses:Food:FastFood"),
    ])
    def test_fast_food(self, description, expected):
        assert suggest_category(description) == expected

    @pytest.mark.parametrize("description,expected", [
        ("BigBasket monthly", "Expenses:Food:Groceries"),
        ("Blinkit vegetables", "Expenses:Food:Groceries"),
        ("Zepto delivery", "Expenses:Food:Groceries"),
        ("D-Mart purchase", "Expenses:Food:Groceries"),
        ("Licious chicken", "Expenses:Food:Groceries"),
        ("FreshToHome fish", "Expenses:Food:Groceries"),
        ("Country Delight milk", "Expenses:Food:Groceries"),
    ])
    def test_groceries(self, description, expected):
        assert suggest_category(description) == expected

    # Transport
    @pytest.mark.parametrize("description,expected", [
        ("Uber trip", "Expenses:Transport:Rides"),
        ("Ola auto", "Expenses:Transport:Rides"),
        ("Rapido bike", "Expenses:Transport:Rides"),
    ])
    def test_rides(self, description, expected):
        assert suggest_category(description) == expected

    @pytest.mark.parametrize("description,expected", [
        ("Shell Petrol pump", "Expenses:Transport:Fuel"),
        ("Indian Oil fuel", "Expenses:Transport:Fuel"),
        ("HP Petrol", "Expenses:Transport:Fuel"),
    ])
    def test_fuel(self, description, expected):
        assert suggest_category(description) == expected

    # Shopping
    @pytest.mark.parametrize("description,expected", [
        ("Amazon.in order", "Expenses:Shopping:Online"),
        ("Flipkart purchase", "Expenses:Shopping:Online"),
        ("Myntra fashion", "Expenses:Shopping:Online"),
    ])
    def test_online_shopping(self, description, expected):
        assert suggest_category(description) == expected

    # Entertainment
    @pytest.mark.parametrize("description,expected", [
        ("Netflix subscription", "Expenses:Entertainment:Streaming"),
        ("Disney+ Hotstar", "Expenses:Entertainment:Streaming"),
        ("Spotify Premium", "Expenses:Entertainment:Music"),
        ("BookMyShow tickets", "Expenses:Entertainment:Movies"),
    ])
    def test_entertainment(self, description, expected):
        assert suggest_category(description) == expected

    # Utilities
    @pytest.mark.parametrize("description,expected", [
        ("BESCOM electricity", "Expenses:Utilities:Electricity"),
        ("Airtel prepaid", "Expenses:Utilities:Mobile"),
        ("ACT Fibernet bill", "Expenses:Utilities:Internet"),
    ])
    def test_utilities(self, description, expected):
        assert suggest_category(description) == expected

    # Income
    @pytest.mark.parametrize("description,expected", [
        ("Salary credited", "Income:Salary"),
        ("Monthly stipend", "Income:Salary"),
        ("Amazon refund", "Income:Refund"),
        ("Cashback received", "Income:Refund"),
        ("FD interest credited", "Income:Interest"),
        ("Dividend payout", "Income:Dividend"),
    ])
    def test_income(self, description, expected):
        assert suggest_category(description) == expected

    # Amount-based heuristics
    def test_small_amount_snacks(self):
        result = suggest_category("unknown vendor", amount=50)
        assert result == "Expenses:Food:Snacks"

    def test_medium_amount_meals(self):
        result = suggest_category("unknown vendor", amount=250)
        assert result == "Expenses:Food:Meals"

    def test_large_amount_no_heuristic(self):
        result = suggest_category("unknown vendor", amount=5000)
        assert result is None

    # Credit direction
    def test_credit_without_pattern(self):
        result = suggest_category("Random Credit", is_credit=True)
        assert result == "Income:Other"

    # Edge cases
    def test_empty_description(self):
        assert suggest_category("") is None

    def test_none_amount(self):
        assert suggest_category("random") is None


class TestCategoryConfidence:
    """Test confidence scoring."""

    def test_pattern_match_high_confidence(self):
        score = get_category_confidence("Swiggy order", "Expenses:Food:Delivery")
        assert score == 0.9

    def test_no_match_medium_confidence(self):
        score = get_category_confidence("unknown", "Expenses:Other")
        assert score == 0.5

    def test_empty_zero_confidence(self):
        assert get_category_confidence("", "Expenses:Other") == 0.0
        assert get_category_confidence("test", "") == 0.0

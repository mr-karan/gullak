"""API routes for Gullak."""

from .chat import router as chat_router
from .ledger import router as ledger_router
from .setup import router as setup_router

__all__ = ["chat_router", "ledger_router", "setup_router"]

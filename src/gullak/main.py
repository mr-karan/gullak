"""Gullak - Main FastAPI application."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from gullak.agent import GullakAgent
from gullak.api import chat_router, ledger_router, setup_router
from gullak.config import settings
from gullak.ledger.parser import LedgerParser
from gullak.ledger.validator import LedgerValidator


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    settings.ensure_data_dir()

    # Initialize components
    app.state.settings = settings
    app.state.parser = LedgerParser()
    app.state.validator = LedgerValidator(cli_path=settings.ledger_cli)

    # Initialize agent
    app.state.agent = GullakAgent(
        ledger_path=settings.ledger_path,
        default_currency=settings.default_currency,
        timezone=settings.timezone,
        ledger_cli=settings.ledger_cli,
    )

    # Note: Ledger file is created by setup wizard, not here

    yield

    # Shutdown (cleanup if needed)


# Create FastAPI app
app = FastAPI(
    title="Gullak",
    description="AI-powered expense tracker with ledger-cli integration",
    version="2.0.0",
    lifespan=lifespan,
)

# Mount static files
static_path = Path(__file__).parent / "web" / "static"
app.mount("/static", StaticFiles(directory=static_path), name="static")

# Setup templates
templates_path = Path(__file__).parent / "web" / "templates"
templates = Jinja2Templates(directory=templates_path)

# Include API routers
app.include_router(chat_router, prefix="/api")
app.include_router(ledger_router, prefix="/api")
app.include_router(setup_router, prefix="/api")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Serve the main application page."""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "2.0.0",
    }


# Run with uvicorn if executed directly
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "gullak.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )

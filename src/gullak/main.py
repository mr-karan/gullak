"""Gullak - Main FastAPI application."""

import hashlib
import shutil
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from gullak.agent import GullakAgent
from gullak.api import chat_router, ledger_router, setup_router, threads_router
from gullak.api.whatsapp import router as whatsapp_router
from gullak.ledger.parser import LedgerParser
from gullak.ledger.validator import LedgerValidator
from gullak.ledger.writer import LedgerWriter
from gullak.logging import configure_logging, get_logger
from gullak.settings import settings

# Configure logging before anything else
configure_logging(debug=settings.debug)
logger = get_logger(__name__)


class LedgerCLINotFoundError(Exception):
    """Raised when ledger-cli is not found in PATH."""

    pass


def _check_ledger_cli() -> None:
    """Check ledger CLI availability. Raises if not found."""
    cli_path = settings.ledger_cli

    if not shutil.which(cli_path):
        raise LedgerCLINotFoundError(
            f"'{cli_path}' not found in PATH. "
            "Install: apt install ledger (Debian/Ubuntu), "
            "brew install ledger (macOS), "
            "or nix develop (Nix)"
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("application_startup", version="2.0.0", debug=settings.debug)

    _check_ledger_cli()
    settings.ensure_data_dir()

    app.state.settings = settings
    app.state.parser = LedgerParser()
    app.state.validator = LedgerValidator(cli_path=settings.ledger_cli)
    app.state.writer = LedgerWriter(settings.ledger_path, app.state.validator, settings.paisa_url)

    # Initialize agent
    app.state.agent = GullakAgent(
        ledger_path=settings.ledger_path,
        default_currency=settings.default_currency,
        timezone=settings.timezone,
        ledger_cli=settings.ledger_cli,
    )

    logger.info(
        "agent_initialized",
        ledger_path=str(settings.ledger_path),
        currency=settings.default_currency,
    )

    # Initialize shared HTTP client for WhatsApp bridge
    whatsapp_timeout = httpx.Timeout(10.0, connect=5.0)
    whatsapp_headers = {"X-Api-Key": settings.whatsapp_api_key} if settings.whatsapp_api_key else {}
    app.state.whatsapp_client = httpx.AsyncClient(
        timeout=whatsapp_timeout,
        base_url=settings.whatsapp_bridge_url,
        headers=whatsapp_headers,
    )
    logger.info("whatsapp_client_initialized", base_url=settings.whatsapp_bridge_url)

    # Note: Ledger file is created by setup wizard, not here

    yield

    # Shutdown
    await app.state.whatsapp_client.aclose()
    logger.info("application_shutdown")


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


def get_asset_hash(filename: str) -> str:
    """Generate a short hash of file contents for cache busting."""
    filepath = static_path / filename
    if filepath.exists():
        content = filepath.read_bytes()
        return hashlib.md5(content).hexdigest()[:8]
    return str(int(time.time()))

# Include API routers
app.include_router(chat_router, prefix="/api")
app.include_router(ledger_router, prefix="/api")
app.include_router(setup_router, prefix="/api")
app.include_router(threads_router, prefix="/api")
app.include_router(whatsapp_router, prefix="/api")


@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    """Log requests with timing and correlation IDs."""
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()

    # Skip logging for static files and health checks
    if request.url.path.startswith("/static") or request.url.path == "/health":
        return await call_next(request)

    log = logger.bind(
        request_id=request_id,
        method=request.method,
        path=request.url.path,
    )

    try:
        response = await call_next(request)
        duration_ms = (time.time() - start_time) * 1000

        log.info(
            "request_completed",
            status_code=response.status_code,
            duration_ms=round(duration_ms, 2),
        )

        response.headers["X-Request-ID"] = request_id
        return response

    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        log.error(
            "request_failed",
            error=str(e),
            error_type=type(e).__name__,
            duration_ms=round(duration_ms, 2),
        )
        raise


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Serve the main application page."""
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "paisa_url": settings.paisa_external_url or settings.paisa_url,
            "asset_version": {
                "js": get_asset_hash("js/app.js"),
                "css": get_asset_hash("css/main.css"),
            },
        },
    )


@app.get("/health")
async def health():
    """Health check endpoint."""
    ledger_ok = shutil.which(settings.ledger_cli) is not None
    return {
        "status": "healthy" if ledger_ok else "degraded",
        "version": "2.0.0",
        "ledger_cli": ledger_ok,
    }


@app.get("/sw.js")
async def service_worker():
    """Serve service worker from root with proper headers."""
    sw_path = static_path / "sw.js"
    return FileResponse(
        sw_path,
        media_type="application/javascript",
        headers={"Service-Worker-Allowed": "/", "Cache-Control": "no-cache"},
    )


@app.get("/manifest.json")
async def manifest():
    """Serve manifest from root."""
    manifest_path = static_path / "manifest.json"
    return FileResponse(manifest_path, media_type="application/manifest+json")


@app.get("/offline", response_class=HTMLResponse)
async def offline(request: Request):
    """Offline fallback page."""
    return templates.TemplateResponse("offline.html", {"request": request})


# Run with uvicorn if executed directly
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "gullak.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )

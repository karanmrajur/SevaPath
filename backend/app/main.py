from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import sessionmaker
from starlette.exceptions import HTTPException

from .core import sessions
from .core.config import Settings, load_settings
from .core.errors import ApiError, error_response
from .db.database import Db, make_engine
from .db.centre_directory import CentreDirectory
from .routers import catalog, centres, citizen, grievances, jansetu, journeys

logger = logging.getLogger(__name__)
PRIVATE_PATHS = {"session", "journeys", "grievances", "citizen"}


def create_app(settings: Settings | None = None, *, engine=None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database = engine if engine is not None else make_engine(settings.database_url)
        app.state.session_factory = sessionmaker(bind=database, expire_on_commit=False)
        try:
            yield
        finally:
            if engine is None:
                database.dispose()

    app = FastAPI(title="SevaPath API", version="0.2.0", lifespan=lifespan,
                  description="Public service catalog and anonymous local preparation tools.")
    app.state.settings = settings
    app.state.account_attempts = citizen.AttemptLimiter()
    app.state.map_attempts = citizen.AttemptLimiter("Too many map requests. Try again in 15 minutes.")
    app.state.centre_directory = CentreDirectory(settings.centre_directory_live)
    app.state.jansetu = jansetu.Runtime(settings.jansetu)

    @app.middleware("http")
    async def protect_workspace(request: Request, call_next):
        parts = request.url.path.split("/")
        private = len(parts) >= 3 and parts[1] == "api" and parts[2] in PRIVATE_PATHS
        origin = request.headers.get("origin")
        same_origin = f"{request.url.scheme}://{request.url.netloc}"
        allowed_origin = origin is None or origin == same_origin or origin in settings.cors_origins
        if private and request.method not in {"GET", "HEAD", "OPTIONS"} and not allowed_origin:
            response = error_response(403, "origin_forbidden", "This request origin is not allowed.")
        else:
            response = await call_next(request)
        if private:
            response.headers["Cache-Control"] = "no-store"
        return response

    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_credentials=True,
                       allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Content-Type"])

    @app.exception_handler(ApiError)
    async def api_error(_request, exc):
        return error_response(exc.status, exc.code, str(exc))

    @app.exception_handler(HTTPException)
    async def http_error(_request, exc):
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return error_response(exc.status_code, f"http_{exc.status_code}", message, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request, exc):
        # Only return field locations and messages; submitted text stays out of error payloads.
        details = [{"location": error["loc"], "message": error["msg"]} for error in exc.errors()]
        return error_response(422, "validation_error", "Check the highlighted request fields.", details=details)

    @app.exception_handler(SQLAlchemyError)
    async def database_error(_request, exc):
        logger.error("Database operation failed (%s)", type(exc).__name__)
        if isinstance(exc, OperationalError):
            return error_response(503, "database_unavailable", "The database is temporarily unavailable.")
        return error_response(500, "database_error", "The database could not complete this request.")

    @app.get("/api/health", tags=["system"])
    def health(db: Db):
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "reachable"}

    for router in (sessions.router, catalog.router, journeys.router, grievances.router, citizen.router, centres.router, jansetu.router):
        app.include_router(router, prefix="/api")

    app.include_router(journeys.router, prefix="/api/citizen")
    app.include_router(grievances.router, prefix="/api/citizen")

    return app


app = create_app()

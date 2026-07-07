"""ArenaOS FastAPI application entry point.

Provides the HTTP API for real-time crowd dynamics calculations,
guardrail-protected RAG operations queries, and system health monitoring.
Includes security hardening middleware, GZip compression, structured
logging, and lifespan-managed resource initialisation.
"""

import logging
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from enum import Enum
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field

from backend.database.connection import VectorStorageManager
from backend.guardrails.security_filters import analyze_input_integrity

# ---------------------------------------------------------------------------
# Structured logging configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("arenaos.api")

# ---------------------------------------------------------------------------
# Physics constants for crowd dynamics (Weidmann 1993 pedestrian model)
# ---------------------------------------------------------------------------
FREE_FLOW_VELOCITY: float = 1.34     # v₀ — free-flow walking speed (m/s)
STRUCTURAL_SCALING: float = 0.28     # a  — structural footprint factor
MAX_DENSITY_NORM: float = 5.0        # ρ_max for normalisation
ACOUSTIC_FLOOR: float = 30.0         # Minimum decibel baseline
ACOUSTIC_RANGE: float = 90.0         # dB range for normalisation
WEIGHT_DENSITY: float = 0.4          # w₁ — congestion weight for density
WEIGHT_VELOCITY: float = 0.3         # w₂ — congestion weight for deviation
WEIGHT_ACOUSTIC: float = 0.3         # w₃ — congestion weight for acoustics

# ---------------------------------------------------------------------------
# Rate limiter (in-memory sliding window, per-IP)
# ---------------------------------------------------------------------------
RATE_LIMIT_WINDOW: int = 60          # Window duration in seconds
RATE_LIMIT_MAX_REQUESTS: int = 30    # Max requests per window per IP

_rate_limit_store: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(client_ip: str) -> bool:
    """Return True if the client is within the rate limit window.

    Uses a sliding window approach: timestamps older than
    ``RATE_LIMIT_WINDOW`` seconds are pruned on each check.

    Args:
        client_ip: The requesting client's IP address.

    Returns:
        ``True`` if the request is allowed, ``False`` if rate-limited.
    """
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW

    # Prune expired timestamps
    _rate_limit_store[client_ip] = [
        ts for ts in _rate_limit_store[client_ip] if ts > window_start
    ]

    if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
        return False

    _rate_limit_store[client_ip].append(now)
    return True


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class SafetyStatus(str, Enum):
    """Enumerated crowd safety status levels."""

    SAFE = "SAFE"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


# ---------------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------------
class OperationQuery(BaseModel):
    """Incoming RAG operations query from a stadium user.

    Attributes:
        query_text: Natural-language question (max 512 chars).
        user_role: Access role determining which protocols are visible.
    """

    query_text: str = Field(
        ...,
        max_length=512,
        description="Natural-language operations question.",
    )
    user_role: str = Field(
        ...,
        pattern="^(fan|staff|volunteer)$",
        description="Role-based access level: fan, staff, or volunteer.",
    )


class UnifiedResponse(BaseModel):
    """Standard response envelope for RAG query results.

    Attributes:
        grounded_answer: The context-grounded answer text.
        status: Resolution status — success, unresolved, or error.
    """

    grounded_answer: str = Field(
        ..., description="Context-grounded response from the RAG engine."
    )
    status: str = Field(
        ..., description="Query resolution status."
    )


class CrowdParameters(BaseModel):
    """Input parameters for crowd dynamics calculations.

    All values are bounded to physically meaningful ranges.

    Attributes:
        density: Crowd density in people per square metre.
        velocity_deviation: Normalised velocity vector deviation [0–1].
        acoustic_db: Ambient acoustic level in decibels.
        channel_width: Effective exit channel width in metres.
    """

    density: float = Field(
        ..., ge=0.0, le=10.0,
        description="Crowd density (people/m²).",
    )
    velocity_deviation: float = Field(
        ..., ge=0.0, le=1.0,
        description="Normalised velocity vector deviation.",
    )
    acoustic_db: float = Field(
        ..., ge=30.0, le=120.0,
        description="Ambient acoustic level (dB).",
    )
    channel_width: float = Field(
        ..., ge=0.5, le=20.0,
        description="Effective exit channel width (m).",
    )


class CrowdMetricsResponse(BaseModel):
    """Computed crowd safety metrics returned by the congestion endpoint.

    Attributes:
        walking_velocity: Calculated mean walking velocity (m/s).
        flow_rate: Calculated pedestrian flow rate (pax/s).
        congestion_index: Normalised congestion index [0–1].
        safety_status: Categorical safety classification.
    """

    walking_velocity: float = Field(
        ..., description="Mean walking velocity (m/s)."
    )
    flow_rate: float = Field(
        ..., description="Pedestrian flow rate (pax/s)."
    )
    congestion_index: float = Field(
        ..., description="Normalised congestion index [0–1]."
    )
    safety_status: SafetyStatus = Field(
        ..., description="Safety classification: SAFE, WARNING, or CRITICAL."
    )


# ---------------------------------------------------------------------------
# Application lifespan — eagerly warm resources on startup
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and shutdown lifecycle.

    On startup the vector store manager and embedding model are
    eagerly loaded so the first request doesn't incur cold-start
    latency.
    """
    logger.info("ArenaOS starting — warming vector store and model")
    app.state.vector_manager = VectorStorageManager()
    logger.info("ArenaOS ready — all resources initialised")
    yield
    logger.info("ArenaOS shutting down")


# ---------------------------------------------------------------------------
# FastAPI application instance
# ---------------------------------------------------------------------------
app = FastAPI(
    title="ArenaOS - Smart Stadium Operations Engine",
    version="1.0.0",
    description=(
        "Asynchronous engine providing real-time operations guidance "
        "and crowd dynamics calculations for ArenaOS."
    ),
    lifespan=lifespan,
)

# GZip compression for response payloads over 500 bytes
app.add_middleware(GZipMiddleware, minimum_size=500)

# CORS — restricted to trusted origins with explicit methods/headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# ---------------------------------------------------------------------------
# Security headers middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:  # noqa: ANN001
    """Inject defence-in-depth HTTP security headers on every response.

    Also enforces per-IP rate limiting and logs blocked requests.
    """
    # Rate limiting check
    client_ip: str = request.client.host if request.client else "unknown"
    if not _check_rate_limit(client_ip):
        logger.warning("Rate limit exceeded for IP=%s", client_ip)
        return Response(
            content='{"detail":"Too many requests. Please try again later."}',
            status_code=429,
            media_type="application/json",
        )

    response: Response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(self), geolocation=()"
    )
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Cache-Control"] = "no-store"

    return response


# ---------------------------------------------------------------------------
# Helper to access the lifespan-scoped vector manager
# ---------------------------------------------------------------------------
def _get_vector_manager(request: Request) -> VectorStorageManager:
    """Retrieve the VectorStorageManager from application state.

    Falls back to lazy initialisation when the lifespan context has
    not run (e.g. during ``TestClient`` testing).

    Args:
        request: The incoming FastAPI request.

    Returns:
        The shared VectorStorageManager instance.
    """
    if not hasattr(request.app.state, "vector_manager"):
        request.app.state.vector_manager = VectorStorageManager()
    return request.app.state.vector_manager


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------
@app.post(
    "/api/v1/operations/query",
    response_model=UnifiedResponse,
    tags=["RAG Operations"],
    summary="Submit a guardrail-protected operations query",
    responses={
        403: {"description": "Input blocked by security guardrails"},
        429: {"description": "Rate limit exceeded"},
        500: {"description": "Internal processing error"},
    },
)
async def handle_operations_query(
    payload: OperationQuery, request: Request
) -> UnifiedResponse:
    """Process an operations query through guardrails and RAG retrieval.

    The query text is first screened by deterministic security filters.
    If safe, it is embedded and matched against role-filtered protocol
    documents in the vector store.

    Args:
        payload: The validated query payload.
        request: The incoming HTTP request (for state access).

    Returns:
        A ``UnifiedResponse`` with the grounded answer and status.

    Raises:
        HTTPException: 403 if the query fails guardrail checks.
        HTTPException: 500 on internal processing errors.
    """
    is_safe, sanitized_query = analyze_input_integrity(payload.query_text)
    if not is_safe:
        logger.warning(
            "Guardrail block — role=%s query=%r",
            payload.user_role,
            payload.query_text[:120],
        )
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Input query failed system safety checks.",
        )

    try:
        vm = _get_vector_manager(request)
        context_docs = vm.retrieve_grounded_context(
            sanitized_query=sanitized_query,
            user_role=payload.user_role,
        )

        if not context_docs:
            return UnifiedResponse(
                grounded_answer=(
                    "No validated procedures match your request. "
                    "Please contact zone supervision."
                ),
                status="unresolved",
            )

        grounded_response = (
            f"Grounded response matching system context details. "
            f"Protocol: {context_docs[0]}"
        )
        return UnifiedResponse(
            grounded_answer=grounded_response,
            status="success",
        )

    except Exception as exc:
        logger.exception("Internal error processing RAG query")
        raise HTTPException(
            status_code=500,
            detail=f"Internal system error: {exc}",
        ) from exc


@app.post(
    "/api/v1/operations/calculate-congestion",
    response_model=CrowdMetricsResponse,
    tags=["Crowd Dynamics"],
    summary="Compute real-time crowd safety metrics",
    responses={
        422: {"description": "Validation error on input parameters"},
        429: {"description": "Rate limit exceeded"},
    },
)
async def calculate_congestion(
    params: CrowdParameters,
) -> CrowdMetricsResponse:
    """Compute crowd safety metrics using the Weidmann fluid dynamics model.

    Formulas applied:
        - Walking Velocity:  ``v = v₀ × (1 − a × ρ)⁴``
        - Flow Rate:         ``Q = ρ × v × W``
        - Congestion Index:  ``C = w₁·d_s + w₂·δv + w₃·α_d``

    The congestion index is normalised to [0, 1] and mapped to a
    categorical safety status.

    Args:
        params: Validated crowd dynamics input parameters.

    Returns:
        A ``CrowdMetricsResponse`` with computed metrics and safety status.
    """
    # Walking velocity: v = v₀ × (1 − a × ρ)⁴  (bounded at 0)
    density_factor = 1.0 - (STRUCTURAL_SCALING * params.density)
    walking_velocity = FREE_FLOW_VELOCITY * (max(0.0, density_factor) ** 4)

    # Flow rate: Q = ρ × v × W
    flow_rate = params.density * walking_velocity * params.channel_width

    # Normalised congestion index components
    ds = min(1.0, params.density / MAX_DENSITY_NORM)
    alpha_d = (params.acoustic_db - ACOUSTIC_FLOOR) / ACOUSTIC_RANGE

    congestion_index = (
        (WEIGHT_DENSITY * ds)
        + (WEIGHT_VELOCITY * params.velocity_deviation)
        + (WEIGHT_ACOUSTIC * alpha_d)
    )
    congestion_index = min(1.0, max(0.0, congestion_index))

    # Classify safety status
    if congestion_index >= 0.7:
        safety_status = SafetyStatus.CRITICAL
    elif congestion_index >= 0.4:
        safety_status = SafetyStatus.WARNING
    else:
        safety_status = SafetyStatus.SAFE

    logger.info(
        "Congestion calc — C=%.2f status=%s ρ=%.1f v=%.2f Q=%.2f",
        congestion_index,
        safety_status.value,
        params.density,
        walking_velocity,
        flow_rate,
    )

    return CrowdMetricsResponse(
        walking_velocity=round(walking_velocity, 2),
        flow_rate=round(flow_rate, 2),
        congestion_index=round(congestion_index, 2),
        safety_status=safety_status,
    )


@app.get(
    "/healthz",
    tags=["System Health"],
    summary="System health check endpoint",
)
async def health_check() -> dict[str, str]:
    """Return the current operational status of the ArenaOS backend.

    Returns:
        A dictionary with a ``status`` key indicating system health.
    """
    return {"status": "operational"}

"""
Litmus Science Backend API - FastAPI Application

Main entry point for the REST API implementing the OpenAPI specification.
"""

from __future__ import annotations

import json
import os
import time
from collections import defaultdict
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import cast

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile as StarletteUploadFile

from backend import schemas
from backend.auth import (
    AuthUser,
    authenticate_user,
    create_access_token,
    decode_token,
    get_current_operator,
    get_current_user,
    get_password_hash,
    get_rate_limit,
    get_user_by_id,
    hash_api_key,
)
from backend.cloud_labs import TranslationError, get_translator
from backend.cloud_labs import list_providers as get_providers_list
from backend.cloud_labs.models import (
    EdisonClearHistoryResponse,
    EdisonJobType,
    EdisonReasoningTraceResponse,
    EdisonRunDraft,
    EdisonRunDraftUpdateRequest,
    EdisonRunListResponse,
    EdisonRunStartResponse,
    EdisonRunStatusResponse,
    EdisonRunSummary,
    EdisonTranslateRequest,
    EdisonTranslateResponse,
    LLMInterpretRequest,
    LLMInterpretResponse,
    ProviderInfoResponse,
    ProvidersListResponse,
    SupportedTypesResponse,
    TranslateRequest,
    TranslateResponse,
    TranslationResultResponse,
    ValidateForProviderRequest,
    ValidationIssueResponse,
)
from backend.cloud_labs.registry import (
    get_provider_info,
    get_supported_experiment_types,
    validate_intake_for_provider,
)
from backend.cloud_labs.registry import (
    translate_intake as do_translate_intake,
)
from backend.env import PROJECT_ROOT
from backend.models import (
    CloudLabSubmission,
    Dispute,
    ExperimentResult,
    OperatorProfile,
    User,
    generate_uuid,
    get_db,
    init_db,
)
from backend.models import (
    ConfidenceLevel as DBConfidenceLevel,
)
from backend.models import (
    DisputeReason as DBDisputeReason,
)
from backend.models import (
    EdisonRun as EdisonRunModel,
)
from backend.models import (
    EdisonRunStatus as DBEdisonRunStatus,
)
from backend.models import (
    Experiment as ExperimentModel,
)
from backend.models import (
    ExperimentStatus as DBExperimentStatus,
)
from backend.models import (
    Hypothesis as HypothesisModel,
)
from backend.models import (
    HypothesisStatus as DBHypothesisStatus,
)
from backend.models import (
    LabPacket as LabPacketModel,
)
from backend.models import (
    PaymentStatus as DBPaymentStatus,
)
from backend.models import (
    RfqPackage as RfqPacketModel,
)
from backend.models import (
    RfqStatus as DBRfqStatus,
)
from backend.models import (
    Template as TemplateModel,
)
from backend.services.edison_client import EdisonJobType as EdisonJobTypeClient
from backend.services.edison_integration import get_edison_litmus_integration
from backend.services.edison_types import EdisonReasoningTrace
from backend.services.experiment_interpreter import get_experiment_interpreter
from backend.types import JsonObject, JsonValue


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize database on startup."""
    await init_db()
    await seed_templates()
    yield


app = FastAPI(
    title="Litmus Science API",
    description="""
API for the Litmus wet lab validation marketplace. Enables programmatic submission
of experiment requests, status tracking, and results retrieval.

## Authentication
All endpoints require a Bearer token in the Authorization header or X-API-Key header.

## Rate Limits
- Standard tier: 100 requests/minute, 1000 requests/day
- Pro tier: 1000 requests/minute, 10000 requests/day
- AI Agent tier: 500 requests/minute, 5000 requests/day
""",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware - Configure allowed origins from environment
_cors_origins = os.environ.get("LITMUS_CORS_ORIGINS", "").split(",")
_cors_origins = [o.strip() for o in _cors_origins if o.strip()]
_cors_origin_regex = os.environ.get("LITMUS_CORS_ORIGIN_REGEX", "").strip() or None

# Check if we're in development mode (auth disabled or debug mode)
_dev_mode = os.environ.get("LITMUS_AUTH_DISABLED", "").lower() in (
    "1",
    "true",
    "yes",
) or os.environ.get("LITMUS_DEBUG", "").lower() in ("1", "true", "yes")

# Default to restrictive origins in production, permissive in dev
if not _cors_origins:
    if _dev_mode:
        # Allow all origins in development
        _cors_origins = ["*"]
    else:
        _cors_origins = [
            "https://app.litmus.science",
            "https://admin.litmus.science",
            "https://docs.litmus.science",
        ]


# =============================================================================
# Rate Limiting Middleware
# =============================================================================

# In-memory rate limit storage (use Redis in production)
_rate_limit_storage: dict[str, dict[str, list[float]]] = defaultdict(
    lambda: {"minute": [], "day": []}
)


def _as_object(value: JsonValue | None) -> JsonObject:
    return value if isinstance(value, dict) else {}


def _as_str(value: JsonValue | None, default: str | None = None) -> str | None:
    if isinstance(value, str):
        return value
    return default


def _as_float(value: JsonValue | None) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _as_str_list(value: JsonValue | None) -> list[str]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    return []


@app.middleware("http")
async def rate_limit_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Enforce rate limits based on user tier."""
    # Skip rate limiting for health checks/docs, dev-mode traffic, and CORS preflight.
    if (
        request.url.path in ("/health", "/docs", "/redoc", "/openapi.json")
        or _dev_mode
        or request.method == "OPTIONS"
    ):
        return await call_next(request)

    # Identify the caller. Prefer authenticated identity over IP.
    api_key = request.headers.get("X-API-Key", "")
    authorization = request.headers.get("Authorization", "")
    token = ""
    if authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
    token_data = decode_token(token) if token else None

    if token_data:
        client_id = token_data.user_id
    elif api_key:
        client_id = f"api_key:{hash_api_key(api_key)}"
    elif request.client:
        client_id = request.client.host
    else:
        client_id = "unknown"

    tier = token_data.rate_limit_tier if token_data else "standard"
    limits = get_rate_limit(tier)
    now = time.time()
    minute_ago = now - 60
    day_ago = now - 86400

    # Clean old entries and count recent requests
    storage = _rate_limit_storage[client_id]
    storage["minute"] = [t for t in storage["minute"] if t > minute_ago]
    storage["day"] = [t for t in storage["day"] if t > day_ago]

    minute_count = len(storage["minute"])
    day_count = len(storage["day"])

    # Check limits
    if minute_count >= limits["per_minute"]:
        return JSONResponse(
            status_code=429,
            content={
                "error": {"code": "rate_limit_exceeded", "message": "Too many requests per minute"}
            },
            headers={
                "X-RateLimit-Limit": str(limits["per_minute"]),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(minute_ago + 60)),
                "Retry-After": "60",
            },
        )

    if day_count >= limits["per_day"]:
        return JSONResponse(
            status_code=429,
            content={
                "error": {"code": "rate_limit_exceeded", "message": "Daily request limit exceeded"}
            },
            headers={
                "X-RateLimit-Limit": str(limits["per_day"]),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(day_ago + 86400)),
                "Retry-After": "3600",
            },
        )

    # Record this request
    storage["minute"].append(now)
    storage["day"].append(now)

    # Process request and add rate limit headers
    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(limits["per_minute"])
    response.headers["X-RateLimit-Remaining"] = str(limits["per_minute"] - minute_count - 1)

    return response


# Add CORS middleware after functional middleware so it can attach headers to all responses.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=not _dev_mode,  # Can't use credentials with "*" origins
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Request-ID"],
)


# Helper functions
def load_schema(name: str) -> JsonObject:
    """Load a JSON schema from the schemas directory."""
    schema_path = PROJECT_ROOT / "schemas" / f"{name}.json"
    if schema_path.exists():
        loaded = json.loads(schema_path.read_text())
        return loaded if isinstance(loaded, dict) else {}
    return {}


def validate_intake(intake: JsonObject) -> schemas.ValidationResult:
    """Validate intake against schema."""
    errors: list[schemas.ValidationError] = []
    warnings: list[schemas.ValidationError] = []
    safety_flags: list[str] = []

    # Basic validation
    if not _as_str(intake.get("experiment_type")):
        errors.append(
            schemas.ValidationError(
                path="experiment_type",
                code="required_field_missing",
                message="experiment_type is required",
                suggestion="Specify one of: SANGER_PLASMID_VERIFICATION, QPCR_EXPRESSION, etc.",
            )
        )

    # Check required fields
    if not _as_str(intake.get("title")):
        errors.append(
            schemas.ValidationError(
                path="title", code="required_field_missing", message="title is required"
            )
        )

    # Check BSL level (schema uses "bsl", not "bsl_level")
    compliance = _as_object(intake.get("compliance"))
    bsl = _as_str(compliance.get("bsl"), "BSL1") or "BSL1"
    if bsl not in ["BSL1", "BSL2"]:
        safety_flags.append("bsl_level_exceeded")
        safety_flags.append("safety_rejected")
        errors.append(
            schemas.ValidationError(
                path="compliance.bsl",
                code="safety_violation",
                message=f"BSL level {bsl} is not supported",
                suggestion="Only BSL1 and BSL2 experiments are allowed",
            )
        )

    if bsl == "BSL2" and compliance.get("human_derived_material") is True:
        warnings.append(
            schemas.ValidationError(
                path="compliance.human_derived_material",
                code="human_material_bsl2_review",
                message="Human-derived materials at BSL2 require biosafety review documentation",
                suggestion="Confirm IRB/biosafety approvals before submission",
            )
        )

    # Check for controlled substances in materials_provided
    materials_value = intake.get("materials_provided")
    materials = materials_value if isinstance(materials_value, list) else []
    for material in materials:
        if not isinstance(material, dict):
            continue
        if material.get("hazardous") is True:
            if compliance.get("sds_attached") is not True:
                warnings.append(
                    schemas.ValidationError(
                        path="compliance.sds_attached",
                        code="recommended_field_missing",
                        message="SDS should be attached for hazardous materials",
                        suggestion="Set compliance.sds_attached to true and attach SDS document",
                    )
                )
                break

    # Check hypothesis completeness
    hypothesis = _as_object(intake.get("hypothesis"))
    if not _as_str(hypothesis.get("statement")):
        warnings.append(
            schemas.ValidationError(
                path="hypothesis.statement",
                code="recommended_field_missing",
                message="Hypothesis statement improves clarity",
                suggestion="Add a clear, testable hypothesis statement",
            )
        )

    # Check turnaround_budget required fields
    turnaround = _as_object(intake.get("turnaround_budget"))
    if _as_float(turnaround.get("budget_max_usd")) is None:
        errors.append(
            schemas.ValidationError(
                path="turnaround_budget.budget_max_usd",
                code="required_field_missing",
                message="budget_max_usd is required",
            )
        )

    # Check deliverables required fields
    deliverables = _as_object(intake.get("deliverables"))
    if not _as_str(deliverables.get("minimum_package_level")):
        errors.append(
            schemas.ValidationError(
                path="deliverables.minimum_package_level",
                code="required_field_missing",
                message="minimum_package_level is required",
            )
        )

    # Validate experiment-type specific sections
    exp_type = _as_str(intake.get("experiment_type"))
    exp_type_to_section = {
        "SANGER_PLASMID_VERIFICATION": "sanger",
        "QPCR_EXPRESSION": "qpcr",
        "CELL_VIABILITY_IC50": "cell_viability",
        "ENZYME_INHIBITION_IC50": "enzyme_inhibition",
        "MICROBIAL_GROWTH_MATRIX": "microbial_growth",
        "MIC_MBC_ASSAY": "mic_mbc",
        "ZONE_OF_INHIBITION": "zone_of_inhibition",
        "CUSTOM": "custom_protocol",
    }
    required_section = exp_type_to_section.get(exp_type) if exp_type else None
    if required_section and not intake.get(required_section):
        errors.append(
            schemas.ValidationError(
                path=required_section,
                code="required_field_missing",
                message=f"{required_section} section is required for {exp_type}",
                suggestion=(
                    f"Add the {required_section} section with experiment-specific parameters"
                ),
            )
        )

    return schemas.ValidationResult(
        valid=len(errors) == 0 and "safety_rejected" not in safety_flags,
        errors=errors,
        warnings=warnings,
        safety_flags=safety_flags,
    )


def estimate_cost(intake: JsonObject) -> schemas.CostEstimate:
    """Generate cost estimate for an experiment."""
    exp_type = _as_str(intake.get("experiment_type"), "CUSTOM") or "CUSTOM"

    # Base costs by experiment type
    base_costs = {
        "SANGER_PLASMID_VERIFICATION": (50, 100, 150),
        "QPCR_EXPRESSION": (200, 350, 500),
        "CELL_VIABILITY_IC50": (300, 550, 800),
        "ENZYME_INHIBITION_IC50": (200, 400, 600),
        "MICROBIAL_GROWTH_MATRIX": (150, 275, 400),
        "MIC_MBC_ASSAY": (200, 300, 400),
        "ZONE_OF_INHIBITION": (100, 175, 250),
        "CUSTOM": (200, 400, 800),
    }

    low, typical, high = base_costs.get(exp_type, (200, 400, 800))

    # Privacy premium - NOTE: privacy is at root level in schema, NOT under compliance
    privacy = _as_str(intake.get("privacy"), "open") or "open"
    privacy_multiplier = {
        "open": 0,
        "delayed_6mo": 0.10,
        "delayed_12mo": 0.15,
        "private": 0.25,
    }.get(privacy, 0)

    privacy_premium = typical * privacy_multiplier

    # Package level adjustment
    deliverables = _as_object(intake.get("deliverables"))
    package_level = (
        _as_str(deliverables.get("minimum_package_level"), "L1_BASIC_QC") or "L1_BASIC_QC"
    )
    package_multiplier = {
        "L0_RAW_ONLY": 0.8,
        "L1_BASIC_QC": 1.0,
        "L2_INTERPRETATION": 1.3,
    }.get(package_level, 1.0)

    # Priority adjustment
    turnaround = _as_object(intake.get("turnaround_budget"))
    priority = _as_str(turnaround.get("priority"), "standard") or "standard"
    priority_multiplier = {
        "standard": 1.0,
        "expedited": 1.25,
        "urgent": 1.5,
    }.get(priority, 1.0)

    # Calculate adjusted costs
    adjusted_typical = typical * package_multiplier * priority_multiplier
    adjusted_low = low * package_multiplier * priority_multiplier
    adjusted_high = high * package_multiplier * priority_multiplier

    return schemas.CostEstimate(
        estimated_cost_usd=schemas.CostRange(
            low=round(adjusted_low, 2),
            typical=round(adjusted_typical + privacy_premium, 2),
            high=round(adjusted_high + (adjusted_high * privacy_multiplier), 2),
        ),
        estimated_turnaround_days=schemas.TurnaroundEstimate(
            standard=14 if priority == "standard" else 10,
            expedited=7 if priority == "standard" else 5,
        ),
        cost_breakdown=schemas.CostBreakdown(
            materials=round(adjusted_typical * 0.3, 2),
            labor=round(adjusted_typical * 0.4, 2),
            equipment=round(adjusted_typical * 0.1, 2),
            platform_fee=round(adjusted_typical * 0.2, 2),
            privacy_premium=round(privacy_premium, 2),
        ),
        operator_availability="high",
    )


async def seed_templates() -> None:
    """Seed initial protocol templates."""
    from backend.models import Template, async_session

    templates = [
        {
            "id": "sanger-sequencing-v1",
            "name": "Sanger Sequencing - Plasmid Verification",
            "description": "Standard Sanger sequencing for plasmid insert verification",
            "category": "molecular_biology",
            "bsl_level": "BSL-1",
            "version": "1.0",
            "parameters": [
                {"name": "primer_type", "type": "string", "required": True},
                {"name": "read_length", "type": "integer", "default": "800"},
            ],
            "equipment_required": ["Sanger sequencer", "Thermocycler"],
            "estimated_duration_hours": 4,
            "estimated_cost_min": 50,
            "estimated_cost_max": 150,
        },
        {
            "id": "cell-viability-mtt-v1",
            "name": "Cell Viability - MTT Assay",
            "description": "MTT-based cell viability assay for IC50 determination",
            "category": "cell_biology",
            "bsl_level": "BSL-2",
            "version": "1.0",
            "parameters": [
                {"name": "cell_line", "type": "string", "required": True},
                {"name": "compound_concentrations", "type": "array", "required": True},
                {"name": "incubation_time_hours", "type": "integer", "default": "48"},
            ],
            "equipment_required": ["Cell culture hood", "CO2 incubator", "Plate reader"],
            "estimated_duration_hours": 72,
            "estimated_cost_min": 300,
            "estimated_cost_max": 800,
        },
        {
            "id": "mic-broth-dilution-v1",
            "name": "MIC/MBC - Broth Microdilution",
            "description": "Standard broth microdilution for antimicrobial testing",
            "category": "microbiology",
            "bsl_level": "BSL-2",
            "version": "1.0",
            "parameters": [
                {"name": "organism", "type": "string", "required": True},
                {"name": "compound_range", "type": "string", "required": True},
            ],
            "equipment_required": ["Biosafety cabinet", "Incubator", "Spectrophotometer"],
            "estimated_duration_hours": 24,
            "estimated_cost_min": 200,
            "estimated_cost_max": 400,
        },
        {
            "id": "qpcr-gene-expression-v1",
            "name": "qPCR Gene Expression",
            "description": "Quantitative PCR for gene expression analysis",
            "category": "molecular_biology",
            "bsl_level": "BSL-1",
            "version": "1.0",
            "parameters": [
                {"name": "target_genes", "type": "array", "required": True},
                {"name": "reference_gene", "type": "string", "default": "GAPDH"},
            ],
            "equipment_required": ["Real-time PCR system", "RNA extraction kit"],
            "estimated_duration_hours": 8,
            "estimated_cost_min": 200,
            "estimated_cost_max": 500,
        },
        {
            "id": "enzyme-kinetics-v1",
            "name": "Enzyme Inhibition IC50",
            "description": "Enzyme inhibition assay for IC50 determination",
            "category": "biochemistry",
            "bsl_level": "BSL-1",
            "version": "1.0",
            "parameters": [
                {"name": "enzyme", "type": "string", "required": True},
                {"name": "substrate", "type": "string", "required": True},
                {"name": "inhibitor_concentrations", "type": "array", "required": True},
            ],
            "equipment_required": ["Plate reader", "Multichannel pipettes"],
            "estimated_duration_hours": 4,
            "estimated_cost_min": 200,
            "estimated_cost_max": 600,
        },
    ]

    async with async_session() as session:
        for t in templates:
            existing = await session.execute(select(Template).where(Template.id == t["id"]))
            if not existing.scalar_one_or_none():
                template = Template(**t)
                session.add(template)
        await session.commit()


# =============================================================================
# Auth Endpoints
# =============================================================================


@app.post("/auth/register", response_model=schemas.UserResponse, tags=["Auth"])
async def register_user(
    user_data: schemas.UserCreate, db: AsyncSession = Depends(get_db)
) -> schemas.UserResponse:
    """Register a new user account."""
    existing = await db.execute(select(User).where(User.email == user_data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    api_key = f"lk_{generate_uuid().replace('-', '')}"
    user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        name=user_data.name,
        organization=user_data.organization,
        api_key_hash=hash_api_key(api_key),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return schemas.UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        organization=user.organization,
        role=user.role,
        rate_limit_tier=user.rate_limit_tier,
        created_at=user.created_at,
        api_key=api_key,
    )


@app.post("/auth/token", response_model=schemas.Token, tags=["Auth"])
async def login(
    credentials: schemas.TokenRequest, db: AsyncSession = Depends(get_db)
) -> schemas.Token:
    """Get access token with email and password."""
    user = await authenticate_user(db, credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password"
        )

    access_token = create_access_token(
        data={
            "sub": user.id,
            "email": user.email,
            "role": user.role,
            "rate_limit_tier": user.rate_limit_tier,
        }
    )
    return schemas.Token(access_token=access_token)


@app.get("/auth/me", response_model=schemas.UserResponse, tags=["Auth"])
async def get_current_user_info(
    current_user: AuthUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> schemas.UserResponse:
    """Get current authenticated user info."""
    user = await get_user_by_id(db, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return schemas.UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        organization=user.organization,
        role=user.role,
        rate_limit_tier=user.rate_limit_tier,
        created_at=user.created_at,
        api_key=None,  # Don't expose API key in response
    )


# =============================================================================
# Experiments Endpoints
# =============================================================================


@app.post(
    "/experiments",
    response_model=schemas.ExperimentCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Experiments"],
)
async def create_experiment(
    request: schemas.ExperimentRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.ExperimentCreatedResponse:
    """Submit a new experiment request."""
    spec_raw = request.model_dump(exclude_none=True)
    spec: JsonObject = spec_raw if isinstance(spec_raw, dict) else {}
    metadata = _as_object(spec.get("metadata"))
    if metadata.get("edison_generated") is True and not _as_str(metadata.get("intake_id")):
        spec["metadata"] = {**metadata, "intake_id": generate_uuid()}

    # Validate
    validation = validate_intake(spec)
    if not validation.valid:
        if "safety_rejected" in validation.safety_flags:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "safety_rejected",
                    "message": "Experiment rejected for safety reasons",
                    "flags": validation.safety_flags,
                },
            )
        primary_error = validation.errors[0] if validation.errors else None
        message = "Experiment validation failed"
        if primary_error:
            message = f"{message}: {primary_error.path} {primary_error.message}"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "validation_failed",
                "message": message,
                "validation_errors": [e.model_dump() for e in validation.errors],
            },
        )

    # Estimate cost
    estimate = estimate_cost(spec)

    # Create experiment
    experiment = ExperimentModel(
        requester_id=current_user.id,
        status=DBExperimentStatus.PENDING_REVIEW,
        specification=spec,
        experiment_type=_as_str(spec.get("experiment_type")),
        estimated_cost_usd=estimate.estimated_cost_usd.typical,
        webhook_url=_as_str(_as_object(spec.get("requester_info")).get("webhook_url")),
        payment_status=DBPaymentStatus.PENDING,
    )
    db.add(experiment)
    await db.commit()
    await db.refresh(experiment)

    return schemas.ExperimentCreatedResponse(
        experiment_id=experiment.id,
        status=schemas.ExperimentStatus(experiment.status.value),
        created_at=experiment.created_at,
        estimated_cost_usd=experiment.estimated_cost_usd,
        estimated_turnaround_days=14,
        links=schemas.ExperimentLinks(
            self=f"/experiments/{experiment.id}",
            results=f"/experiments/{experiment.id}/results",
            cancel=f"/experiments/{experiment.id}",
        ),
    )


@app.get("/experiments", response_model=schemas.ExperimentListResponse, tags=["Experiments"])
async def list_experiments(
    status: str | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    limit: int = Query(20, ge=1, le=100),
    cursor: str | None = None,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.ExperimentListResponse:
    """List experiments for the authenticated user."""
    filters = [ExperimentModel.requester_id == current_user.id]
    query = select(ExperimentModel).where(*filters)

    if status:
        filters.append(ExperimentModel.status == DBExperimentStatus(status))
    if created_after:
        filters.append(ExperimentModel.created_at >= created_after)
    if created_before:
        filters.append(ExperimentModel.created_at <= created_before)
    query = query.where(*filters)

    if cursor:
        cursor_row = await db.execute(select(ExperimentModel).where(ExperimentModel.id == cursor))
        cursor_exp = cursor_row.scalar_one_or_none()
        if cursor_exp:
            query = query.where(
                or_(
                    ExperimentModel.created_at < cursor_exp.created_at,
                    and_(
                        ExperimentModel.created_at == cursor_exp.created_at,
                        ExperimentModel.id < cursor_exp.id,
                    ),
                )
            )

    query = query.order_by(ExperimentModel.created_at.desc(), ExperimentModel.id.desc()).limit(
        limit + 1
    )

    result = await db.execute(query)
    experiments = result.scalars().all()

    has_more = len(experiments) > limit
    if has_more:
        experiments = experiments[:limit]

    count_result = await db.execute(
        select(func.count()).select_from(ExperimentModel).where(*filters)
    )
    total_count = count_result.scalar_one()

    return schemas.ExperimentListResponse(
        experiments=[
            schemas.Experiment(
                id=e.id,
                status=schemas.ExperimentStatus(e.status.value),
                created_at=e.created_at,
                updated_at=e.updated_at,
                claimed_at=e.claimed_at,
                completed_at=e.completed_at,
                specification=e.specification,
                operator=schemas.OperatorInfo(
                    id=e.operator.id,
                    reputation_score=e.operator.reputation_score,
                    completed_experiments=e.operator.completed_experiments,
                )
                if e.operator
                else None,
                cost=schemas.CostInfo(
                    estimated_usd=e.estimated_cost_usd,
                    final_usd=e.final_cost_usd,
                    payment_status=schemas.PaymentStatus(e.payment_status.value),
                ),
            )
            for e in experiments
        ],
        pagination=schemas.Pagination(
            total=total_count, cursor=experiments[-1].id if has_more else None, has_more=has_more
        ),
    )


@app.get("/experiments/{experiment_id}", response_model=schemas.Experiment, tags=["Experiments"])
async def get_experiment(
    experiment_id: str,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.Experiment:
    """Get experiment details."""
    result = await db.execute(select(ExperimentModel).where(ExperimentModel.id == experiment_id))
    experiment = result.scalar_one_or_none()

    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    # Check access
    if experiment.requester_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    return schemas.Experiment(
        id=experiment.id,
        status=schemas.ExperimentStatus(experiment.status.value),
        created_at=experiment.created_at,
        updated_at=experiment.updated_at,
        claimed_at=experiment.claimed_at,
        completed_at=experiment.completed_at,
        specification=experiment.specification,
        operator=schemas.OperatorInfo(
            id=experiment.operator.id,
            reputation_score=experiment.operator.reputation_score,
            completed_experiments=experiment.operator.completed_experiments,
        )
        if experiment.operator
        else None,
        cost=schemas.CostInfo(
            estimated_usd=experiment.estimated_cost_usd,
            final_usd=experiment.final_cost_usd,
            payment_status=schemas.PaymentStatus(experiment.payment_status.value),
        ),
    )


@app.patch("/experiments/{experiment_id}", response_model=schemas.Experiment, tags=["Experiments"])
async def update_experiment(
    experiment_id: str,
    update: schemas.ExperimentUpdate,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.Experiment:
    """Update experiment (limited fields based on status)."""
    result = await db.execute(select(ExperimentModel).where(ExperimentModel.id == experiment_id))
    experiment = result.scalar_one_or_none()

    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if experiment.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Apply updates based on status
    if update.communication_preferences:
        webhook_url = _as_str(update.communication_preferences.get("webhook_url"))
        if webhook_url:
            experiment.webhook_url = webhook_url
        notification_events = update.communication_preferences.get("notification_events")
        if isinstance(notification_events, (dict, list)):
            experiment.notification_events = notification_events

    if update.constraints and experiment.status in [
        DBExperimentStatus.DRAFT,
        DBExperimentStatus.OPEN,
    ]:
        spec = experiment.specification.copy()
        if "turnaround_budget" not in spec:
            spec["turnaround_budget"] = {}
        new_budget = _as_float(update.constraints.get("budget_max_usd"))
        if new_budget is not None:
            budget_section = _as_object(spec.get("turnaround_budget"))
            old_budget = _as_float(budget_section.get("budget_max_usd")) or 0.0
            if experiment.status == DBExperimentStatus.OPEN and new_budget < old_budget:
                raise HTTPException(
                    status_code=409, detail="Cannot decrease budget after experiment is open"
                )
            budget_section["budget_max_usd"] = new_budget
            spec["turnaround_budget"] = budget_section
        experiment.specification = spec

    experiment.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(experiment)

    return schemas.Experiment(
        id=experiment.id,
        status=schemas.ExperimentStatus(experiment.status.value),
        created_at=experiment.created_at,
        updated_at=experiment.updated_at,
        claimed_at=experiment.claimed_at,
        completed_at=experiment.completed_at,
        specification=experiment.specification,
        cost=schemas.CostInfo(
            estimated_usd=experiment.estimated_cost_usd,
            final_usd=experiment.final_cost_usd,
            payment_status=schemas.PaymentStatus(experiment.payment_status.value),
        ),
    )


@app.delete(
    "/experiments/{experiment_id}", response_model=schemas.CancelResponse, tags=["Experiments"]
)
async def cancel_experiment(
    experiment_id: str,
    reason: str = Query(..., max_length=500),
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.CancelResponse:
    """Cancel an experiment."""
    result = await db.execute(select(ExperimentModel).where(ExperimentModel.id == experiment_id))
    experiment = result.scalar_one_or_none()

    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if experiment.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Check if cancellable
    non_cancellable = [
        DBExperimentStatus.IN_PROGRESS,
        DBExperimentStatus.COMPLETED,
        DBExperimentStatus.CANCELLED,
    ]
    if experiment.status in non_cancellable:
        raise HTTPException(
            status_code=409, detail=f"Cannot cancel experiment in {experiment.status.value} status"
        )

    # Calculate refund
    refund_amount = 0.0
    refund_status = "none"

    if experiment.status in [
        DBExperimentStatus.DRAFT,
        DBExperimentStatus.PENDING_REVIEW,
        DBExperimentStatus.OPEN,
    ]:
        refund_amount = experiment.estimated_cost_usd or 0.0
        refund_status = "processed"
    elif experiment.status == DBExperimentStatus.CLAIMED:
        refund_amount = (experiment.estimated_cost_usd or 0.0) * 0.8  # 80% refund
        refund_status = "processed"

    experiment.status = DBExperimentStatus.CANCELLED
    experiment.payment_status = (
        DBPaymentStatus.REFUNDED if refund_amount > 0 else DBPaymentStatus.PENDING
    )
    await db.commit()

    return schemas.CancelResponse(
        experiment_id=experiment.id,
        status="cancelled",
        refund_amount_usd=refund_amount,
        refund_status=refund_status,
    )


# =============================================================================
# Results Endpoints
# =============================================================================


@app.get(
    "/experiments/{experiment_id}/results",
    response_model=schemas.ExperimentResults,
    tags=["Results"],
)
async def get_experiment_results(
    experiment_id: str,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.ExperimentResults:
    """Get experiment results."""
    result = await db.execute(select(ExperimentModel).where(ExperimentModel.id == experiment_id))
    experiment = result.scalar_one_or_none()

    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if experiment.requester_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    if experiment.status not in [DBExperimentStatus.COMPLETED, DBExperimentStatus.DISPUTED]:
        raise HTTPException(status_code=409, detail="Experiment not yet completed")

    if not experiment.results:
        raise HTTPException(status_code=404, detail="Results not found")

    results = experiment.results
    structured_data = (
        schemas.StructuredData.model_validate(results.structured_data)
        if isinstance(results.structured_data, dict)
        else None
    )
    raw_data_files: list[schemas.RawDataFile] = []
    raw_files_value = results.raw_data_files if isinstance(results.raw_data_files, list) else []
    for raw_file in raw_files_value:
        if isinstance(raw_file, dict):
            raw_data_files.append(schemas.RawDataFile.model_validate(raw_file))

    documentation = (
        schemas.Documentation.model_validate(results.documentation)
        if isinstance(results.documentation, dict)
        else None
    )

    return schemas.ExperimentResults(
        experiment_id=experiment.id,
        status=schemas.ExperimentStatus(experiment.status.value),
        hypothesis_supported=results.hypothesis_supported,
        confidence_level=schemas.ConfidenceLevel(results.confidence_level.value)
        if results.confidence_level
        else None,
        summary=results.summary,
        structured_data=structured_data,
        raw_data_files=raw_data_files,
        documentation=documentation,
        operator_notes=results.notes,
    )


@app.post(
    "/experiments/{experiment_id}/approve", response_model=schemas.ApproveResponse, tags=["Results"]
)
async def approve_results(
    experiment_id: str,
    request: schemas.ApproveRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.ApproveResponse:
    """Approve experiment results and release payment."""
    result = await db.execute(select(ExperimentModel).where(ExperimentModel.id == experiment_id))
    experiment = result.scalar_one_or_none()

    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if experiment.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if experiment.status != DBExperimentStatus.COMPLETED or not experiment.results:
        raise HTTPException(status_code=409, detail="No results to approve")

    # Update results with approval
    experiment.results.is_approved = True
    experiment.results.approved_at = datetime.utcnow()
    if request.rating:
        experiment.results.rating = request.rating
    if request.feedback:
        experiment.results.feedback = request.feedback

    # Release payment
    experiment.payment_status = DBPaymentStatus.RELEASED

    # Update operator metrics
    if experiment.operator:
        experiment.operator.completed_experiments += 1
        if request.rating:
            # Update average rating
            total_ratings = experiment.operator.completed_experiments
            current_avg = experiment.operator.average_rating
            experiment.operator.average_rating = (
                current_avg * (total_ratings - 1) + request.rating
            ) / total_ratings

    await db.commit()

    return schemas.ApproveResponse(
        experiment_id=experiment.id, status="completed", payment_released=True
    )


@app.post(
    "/experiments/{experiment_id}/dispute", response_model=schemas.DisputeResponse, tags=["Results"]
)
async def dispute_results(
    experiment_id: str,
    request: schemas.DisputeRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.DisputeResponse:
    """Open a dispute for experiment results."""
    result = await db.execute(select(ExperimentModel).where(ExperimentModel.id == experiment_id))
    experiment = result.scalar_one_or_none()

    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if experiment.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if experiment.status != DBExperimentStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Can only dispute completed experiments")

    # Create dispute
    dispute = Dispute(
        experiment_id=experiment.id,
        reason=DBDisputeReason(request.reason.value),
        description=request.description,
        evidence_urls=request.evidence_urls,
    )
    db.add(dispute)

    experiment.status = DBExperimentStatus.DISPUTED
    await db.commit()
    await db.refresh(dispute)

    return schemas.DisputeResponse(
        dispute_id=dispute.id, experiment_id=experiment.id, status="disputed"
    )


# =============================================================================
# Lab Packet & RFQ Endpoints
# =============================================================================


@app.post(
    "/experiments/{experiment_id}/lab-packet",
    response_model=schemas.LabPacketResponse,
    tags=["Lab Packets"],
)
async def generate_lab_packet_endpoint(
    experiment_id: str,
    request: schemas.GenerateLabPacketRequest = schemas.GenerateLabPacketRequest(),
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.LabPacketResponse:
    """Generate an LLM-powered lab packet for an experiment."""
    # Load experiment
    result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
    experiment = result.scalar_one_or_none()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    if experiment.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your experiment")

    # Check for existing packet
    existing = await db.execute(
        select(LabPacketModel).where(LabPacketModel.experiment_id == experiment_id)
    )
    existing_packet = existing.scalar_one_or_none()
    if existing_packet and not request.force_regenerate:
        return _lab_packet_to_response(existing_packet)

    # Generate via LLM
    from backend.services.lab_packet_service import generate_lab_packet
    from backend.services.llm_service import get_llm_service

    try:
        llm = get_llm_service()
    except ValueError as exc:
        raise HTTPException(
            status_code=503, detail=f"LLM service unavailable: {exc}"
        )

    try:
        packet_data, model_name, cost_usd = await generate_lab_packet(
            experiment.specification, llm
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Lab packet generation failed: {exc}"
        )

    # Validate LLM output against Pydantic schemas before persisting
    from pydantic import ValidationError as PydanticValidationError

    design_raw = packet_data.get("design")
    if design_raw and isinstance(design_raw, dict):
        try:
            schemas.ExperimentDesign(**design_raw)
        except PydanticValidationError as exc:
            raise HTTPException(
                status_code=502, detail=f"LLM returned invalid design: {exc}"
            )
    cost_raw = packet_data.get("estimated_direct_cost_usd")
    if cost_raw and isinstance(cost_raw, dict):
        try:
            schemas.DirectCostEstimate(**cost_raw)
        except PydanticValidationError as exc:
            raise HTTPException(
                status_code=502, detail=f"LLM returned invalid cost estimate: {exc}"
            )
    materials_raw = packet_data.get("materials", [])
    if materials_raw is None:
        materials_raw = []
    if not isinstance(materials_raw, list):
        raise HTTPException(
            status_code=502,
            detail="LLM returned invalid materials: expected an array of objects",
        )
    for m in materials_raw:
        if not isinstance(m, dict):
            raise HTTPException(
                status_code=502,
                detail="LLM returned invalid materials: each material must be an object",
            )
        try:
            schemas.MaterialItem(**m)
        except PydanticValidationError as exc:
            raise HTTPException(status_code=502, detail=f"LLM returned invalid material: {exc}")

    protocol_references_raw = packet_data.get("protocol_references", [])
    if protocol_references_raw is None:
        protocol_references_raw = []
    if not isinstance(protocol_references_raw, list):
        raise HTTPException(
            status_code=502,
            detail="LLM returned invalid protocol references: expected an array of objects",
        )
    for r in protocol_references_raw:
        if not isinstance(r, dict):
            raise HTTPException(
                status_code=502,
                detail=(
                    "LLM returned invalid protocol references: "
                    "each protocol reference must be an object"
                ),
            )
        try:
            schemas.ProtocolReference(**r)
        except PydanticValidationError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"LLM returned invalid protocol reference: {exc}",
            )

    title_raw = packet_data.get("title", experiment.specification.get("title", ""))
    if not isinstance(title_raw, str):
        raise HTTPException(
            status_code=502, detail="LLM returned invalid title: expected a string"
        )

    objective_raw = packet_data.get("objective", "")
    if not isinstance(objective_raw, str):
        raise HTTPException(
            status_code=502, detail="LLM returned invalid objective: expected a string"
        )

    readouts_raw = packet_data.get("readouts", [])
    if readouts_raw is None:
        readouts_raw = []
    if not isinstance(readouts_raw, list) or not all(
        isinstance(readout, str) for readout in readouts_raw
    ):
        raise HTTPException(
            status_code=502, detail="LLM returned invalid readouts: expected an array of strings"
        )

    handoff_package_raw = packet_data.get("handoff_package_for_lab", [])
    if handoff_package_raw is None:
        handoff_package_raw = []
    if not isinstance(handoff_package_raw, list) or not all(
        isinstance(item, str) for item in handoff_package_raw
    ):
        raise HTTPException(
            status_code=502,
            detail=(
                "LLM returned invalid handoff package: expected an array of strings"
            ),
        )

    # Build shared field values for both create and update paths
    fields = {
        "title": title_raw,
        "objective": objective_raw,
        "readouts": readouts_raw,
        "design": design_raw,
        "materials": materials_raw,
        "estimated_direct_cost_usd": cost_raw,
        "protocol_references": protocol_references_raw,
        "handoff_package_for_lab": handoff_package_raw,
        "llm_model": model_name,
        "llm_cost_usd": cost_usd,
    }

    if existing_packet:
        for key, value in fields.items():
            setattr(existing_packet, key, value)
        existing_packet.updated_at = datetime.utcnow()
        packet = existing_packet
    else:
        packet = LabPacketModel(
            experiment_id=experiment_id,
            user_id=current_user.id,
            **fields,
        )
        db.add(packet)

    await db.flush()
    return _lab_packet_to_response(packet)


@app.get(
    "/experiments/{experiment_id}/lab-packet",
    response_model=schemas.LabPacketResponse,
    tags=["Lab Packets"],
)
async def get_lab_packet_endpoint(
    experiment_id: str,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.LabPacketResponse:
    """Get the lab packet for an experiment."""
    result = await db.execute(
        select(LabPacketModel).where(LabPacketModel.experiment_id == experiment_id)
    )
    packet = result.scalar_one_or_none()
    if not packet:
        raise HTTPException(status_code=404, detail="Lab packet not found. Generate one first.")
    if packet.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your lab packet")
    return _lab_packet_to_response(packet)


@app.post(
    "/experiments/{experiment_id}/rfq",
    response_model=schemas.RfqPackageResponse,
    tags=["Lab Packets"],
)
async def generate_rfq_endpoint(
    experiment_id: str,
    request: schemas.GenerateRfqRequest = schemas.GenerateRfqRequest(),
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.RfqPackageResponse:
    """Generate an RFQ package from an experiment's lab packet."""
    # Load lab packet
    result = await db.execute(
        select(LabPacketModel).where(LabPacketModel.experiment_id == experiment_id)
    )
    packet = result.scalar_one_or_none()
    if not packet:
        raise HTTPException(status_code=404, detail="Lab packet not found. Generate one first.")

    # Load experiment for spec
    exp_result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
    experiment = exp_result.scalar_one_or_none()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    if experiment.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your experiment")

    # Check for existing RFQ
    existing = await db.execute(
        select(RfqPacketModel).where(RfqPacketModel.lab_packet_id == packet.id)
    )
    existing_rfq = existing.scalar_one_or_none()
    timeline_matches_request = False
    if existing_rfq and isinstance(existing_rfq.timeline, dict):
        rfq_issue_date_raw = existing_rfq.timeline.get("rfq_issue_date")
        questions_due_raw = existing_rfq.timeline.get("questions_due")
        quote_due_raw = existing_rfq.timeline.get("quote_due")
        target_kickoff_raw = existing_rfq.timeline.get("target_kickoff")
        if (
            isinstance(rfq_issue_date_raw, str)
            and isinstance(questions_due_raw, str)
            and isinstance(quote_due_raw, str)
            and isinstance(target_kickoff_raw, str)
        ):
            try:
                rfq_issue_date = datetime.fromisoformat(rfq_issue_date_raw).date()
                questions_due = datetime.fromisoformat(questions_due_raw).date()
                quote_due = datetime.fromisoformat(quote_due_raw).date()
                target_kickoff = datetime.fromisoformat(target_kickoff_raw).date()
                timeline_matches_request = (
                    (questions_due - rfq_issue_date).days == request.questions_due_days
                    and (quote_due - rfq_issue_date).days == request.quote_due_days
                    and (target_kickoff - rfq_issue_date).days == request.target_kickoff_days
                )
            except ValueError:
                timeline_matches_request = False

    if (
        existing_rfq
        and existing_rfq.updated_at >= packet.updated_at
        and timeline_matches_request
    ):
        return _rfq_to_response(existing_rfq)

    # Generate RFQ deterministically
    from backend.services.lab_packet_service import generate_rfq_from_packet

    packet_data = {
        "title": packet.title,
        "objective": packet.objective,
        "readouts": packet.readouts or [],
        "design": packet.design or {},
        "materials": packet.materials or [],
        "estimated_direct_cost_usd": packet.estimated_direct_cost_usd,
        "protocol_references": packet.protocol_references or [],
        "handoff_package_for_lab": packet.handoff_package_for_lab or [],
    }

    rfq_data = generate_rfq_from_packet(
        packet_data,
        experiment_id,
        experiment.specification,
        questions_due_days=request.questions_due_days,
        quote_due_days=request.quote_due_days,
        target_kickoff_days=request.target_kickoff_days,
    )

    if existing_rfq:
        existing_rfq.rfq_id = rfq_data["rfq_id"]
        existing_rfq.title = rfq_data["title"]
        existing_rfq.objective = rfq_data["objective"]
        existing_rfq.scope_of_work = rfq_data["scope_of_work"]
        existing_rfq.client_provided_inputs = rfq_data["client_provided_inputs"]
        existing_rfq.required_deliverables = rfq_data["required_deliverables"]
        existing_rfq.acceptance_criteria = rfq_data["acceptance_criteria"]
        existing_rfq.quote_requirements = rfq_data["quote_requirements"]
        existing_rfq.timeline = rfq_data["timeline"]
        existing_rfq.updated_at = datetime.utcnow()
        rfq = existing_rfq
    else:
        rfq = RfqPacketModel(
            rfq_id=rfq_data["rfq_id"],
            lab_packet_id=packet.id,
            experiment_id=experiment_id,
            user_id=current_user.id,
            title=rfq_data["title"],
            objective=rfq_data["objective"],
            scope_of_work=rfq_data["scope_of_work"],
            client_provided_inputs=rfq_data["client_provided_inputs"],
            required_deliverables=rfq_data["required_deliverables"],
            acceptance_criteria=rfq_data["acceptance_criteria"],
            quote_requirements=rfq_data["quote_requirements"],
            timeline=rfq_data["timeline"],
        )
        db.add(rfq)
    await db.flush()
    return _rfq_to_response(rfq)


@app.get(
    "/experiments/{experiment_id}/rfq",
    response_model=schemas.RfqPackageResponse,
    tags=["Lab Packets"],
)
async def get_rfq_endpoint(
    experiment_id: str,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.RfqPackageResponse:
    """Get the RFQ package for an experiment."""
    result = await db.execute(
        select(RfqPacketModel).where(RfqPacketModel.experiment_id == experiment_id)
    )
    rfq = result.scalar_one_or_none()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found. Generate one first.")
    if rfq.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your RFQ")
    return _rfq_to_response(rfq)


@app.patch(
    "/experiments/{experiment_id}/rfq",
    response_model=schemas.RfqPackageResponse,
    tags=["Lab Packets"],
)
async def update_rfq_status_endpoint(
    experiment_id: str,
    request: schemas.RfqStatusUpdate,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.RfqPackageResponse:
    """Update the status of an RFQ package."""
    result = await db.execute(
        select(RfqPacketModel).where(RfqPacketModel.experiment_id == experiment_id)
    )
    rfq = result.scalar_one_or_none()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    if rfq.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your RFQ")

    rfq.status = DBRfqStatus(request.status)
    rfq.updated_at = datetime.utcnow()
    await db.flush()
    return _rfq_to_response(rfq)


def _lab_packet_to_response(packet: LabPacketModel) -> schemas.LabPacketResponse:
    design = packet.design
    design_obj = None
    if design and isinstance(design, dict):
        design_obj = schemas.ExperimentDesign(**design)

    cost = packet.estimated_direct_cost_usd
    cost_obj = None
    if cost and isinstance(cost, dict):
        cost_obj = schemas.DirectCostEstimate(**cost)

    materials = [
        schemas.MaterialItem(**m) if isinstance(m, dict) else m
        for m in (packet.materials or [])
    ]
    refs = [
        schemas.ProtocolReference(**r) if isinstance(r, dict) else r
        for r in (packet.protocol_references or [])
    ]

    return schemas.LabPacketResponse(
        id=packet.id,
        experiment_id=packet.experiment_id,
        title=packet.title,
        objective=packet.objective,
        readouts=packet.readouts or [],
        design=design_obj,
        materials=materials,
        estimated_direct_cost_usd=cost_obj,
        protocol_references=refs,
        handoff_package_for_lab=packet.handoff_package_for_lab or [],
        llm_model=packet.llm_model,
        llm_cost_usd=packet.llm_cost_usd,
        created_at=packet.created_at,
        updated_at=packet.updated_at,
    )


def _rfq_to_response(rfq: RfqPacketModel) -> schemas.RfqPackageResponse:
    timeline = rfq.timeline
    timeline_obj = None
    if timeline and isinstance(timeline, dict):
        timeline_obj = schemas.RfqTimeline(**timeline)

    return schemas.RfqPackageResponse(
        id=rfq.id,
        rfq_id=rfq.rfq_id,
        experiment_id=rfq.experiment_id,
        title=rfq.title,
        objective=rfq.objective,
        scope_of_work=rfq.scope_of_work or [],
        client_provided_inputs=rfq.client_provided_inputs or [],
        required_deliverables=rfq.required_deliverables or [],
        acceptance_criteria=rfq.acceptance_criteria or [],
        quote_requirements=rfq.quote_requirements or [],
        timeline=timeline_obj,
        target_operator_ids=rfq.target_operator_ids or [],
        status=rfq.status.value if hasattr(rfq.status, "value") else rfq.status,
        created_at=rfq.created_at,
        updated_at=rfq.updated_at,
    )


# =============================================================================
# Validation Endpoints
# =============================================================================


@app.post("/validate", response_model=schemas.ValidationResult, tags=["Validation"])
async def validate_experiment(
    request: schemas.ExperimentRequest, current_user: AuthUser = Depends(get_current_user)
) -> schemas.ValidationResult:
    """Validate experiment without submitting."""
    spec_raw = request.model_dump(exclude_none=True)
    spec: JsonObject = spec_raw if isinstance(spec_raw, dict) else {}
    return validate_intake(spec)


@app.post("/validate/hypothesis", response_model=schemas.ValidationResult, tags=["Validation"])
async def validate_hypothesis(
    request: schemas.HypothesisSection, current_user: AuthUser = Depends(get_current_user)
) -> schemas.ValidationResult:
    """Validate hypothesis structure only."""
    errors: list[schemas.ValidationError] = []
    warnings: list[schemas.ValidationError] = []

    if not request.statement:
        errors.append(
            schemas.ValidationError(
                path="statement",
                code="required_field_missing",
                message="Hypothesis statement is required",
            )
        )

    if not request.null_hypothesis:
        errors.append(
            schemas.ValidationError(
                path="null_hypothesis",
                code="required_field_missing",
                message="Null hypothesis is required",
            )
        )

    if not request.rationale:
        warnings.append(
            schemas.ValidationError(
                path="rationale",
                code="recommended_field_missing",
                message="Adding rationale improves clarity",
            )
        )

    return schemas.ValidationResult(
        valid=len(errors) == 0, errors=errors, warnings=warnings, safety_flags=[]
    )


@app.post("/estimate", response_model=schemas.CostEstimate, tags=["Validation"])
async def get_estimate(
    request: schemas.ExperimentRequest, current_user: AuthUser = Depends(get_current_user)
) -> schemas.CostEstimate:
    """Get cost and time estimate without creating experiment."""
    spec_raw = request.model_dump(exclude_none=True)
    spec: JsonObject = spec_raw if isinstance(spec_raw, dict) else {}
    return estimate_cost(spec)


# =============================================================================
# Templates Endpoints
# =============================================================================


@app.get("/templates", response_model=schemas.TemplateListResponse, tags=["Templates"])
async def list_templates(
    category: str | None = None,
    bsl_level: str | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> schemas.TemplateListResponse:
    """List available protocol templates."""
    query = select(TemplateModel).where(TemplateModel.is_active.is_(True))

    if category:
        query = query.where(TemplateModel.category == category)
    if bsl_level:
        query = query.where(TemplateModel.bsl_level == bsl_level)
    if search:
        query = query.where(
            TemplateModel.name.ilike(f"%{search}%") | TemplateModel.description.ilike(f"%{search}%")
        )

    result = await db.execute(query)
    templates = result.scalars().all()

    return schemas.TemplateListResponse(
        templates=[
            schemas.TemplateListItem(
                id=t.id,
                name=t.name,
                description=t.description,
                category=t.category,
                bsl_level=t.bsl_level,
                estimated_cost_range=f"${t.estimated_cost_min}-${t.estimated_cost_max}"
                if t.estimated_cost_min
                else None,
            )
            for t in templates
        ]
    )


@app.get("/templates/{template_id}", response_model=schemas.Template, tags=["Templates"])
async def get_template(template_id: str, db: AsyncSession = Depends(get_db)) -> schemas.Template:
    """Get template details."""
    result = await db.execute(select(TemplateModel).where(TemplateModel.id == template_id))
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    parameters: list[schemas.TemplateParameter] = []
    if isinstance(template.parameters, list):
        for param in template.parameters:
            if isinstance(param, dict):
                parameters.append(schemas.TemplateParameter.model_validate(param))

    estimated_cost_usd = (
        {"min": template.estimated_cost_min, "max": template.estimated_cost_max}
        if template.estimated_cost_min is not None and template.estimated_cost_max is not None
        else None
    )

    return schemas.Template(
        id=template.id,
        name=template.name,
        description=template.description,
        category=template.category,
        bsl_level=template.bsl_level,
        version=template.version,
        parameters=parameters,
        equipment_required=template.equipment_required or [],
        typical_materials=template.typical_materials or [],
        estimated_duration_hours=template.estimated_duration_hours,
        estimated_cost_usd=estimated_cost_usd,
        protocol_steps=template.protocol_steps or [],
    )


# =============================================================================
# Operator Endpoints
# =============================================================================


@app.get("/operator/jobs", response_model=schemas.JobListResponse, tags=["Operators"])
async def list_available_jobs(
    category: str | None = None,
    min_budget: float | None = None,
    max_budget: float | None = None,
    current_user: AuthUser = Depends(get_current_operator),
    db: AsyncSession = Depends(get_db),
) -> schemas.JobListResponse:
    """List available jobs for operators."""
    query = select(ExperimentModel).where(ExperimentModel.status == DBExperimentStatus.OPEN)

    if min_budget:
        query = query.where(ExperimentModel.estimated_cost_usd >= min_budget)
    if max_budget:
        query = query.where(ExperimentModel.estimated_cost_usd <= max_budget)

    result = await db.execute(query.order_by(ExperimentModel.created_at.desc()).limit(50))
    experiments = result.scalars().all()

    return schemas.JobListResponse(
        jobs=[
            schemas.JobListItem(
                experiment_id=e.id,
                title=f"{_as_str(e.experiment_type) or 'Experiment'} Experiment",
                category=_as_str(e.experiment_type) or "CUSTOM",
                budget_usd=e.estimated_cost_usd or 0,
                deadline=None,  # TODO: Calculate from turnaround
                bsl_level=_as_str(_as_object(e.specification.get("compliance")).get("bsl"))
                or "BSL1",
                equipment_required=_as_str_list(
                    _as_object(e.specification.get("custom_protocol")).get("equipment_required")
                ),
                posted_at=e.created_at,
            )
            for e in experiments
        ]
    )


@app.post(
    "/operator/jobs/{experiment_id}/claim", response_model=schemas.ClaimResponse, tags=["Operators"]
)
async def claim_job(
    experiment_id: str,
    request: schemas.ClaimRequest,
    current_user: AuthUser = Depends(get_current_operator),
    db: AsyncSession = Depends(get_db),
) -> schemas.ClaimResponse:
    """Claim an experiment for execution."""
    if not request.equipment_confirmation or not request.authorization_confirmation:
        raise HTTPException(
            status_code=400, detail="Must confirm equipment access and authorization"
        )

    # Get operator profile
    op_result = await db.execute(
        select(OperatorProfile).where(OperatorProfile.user_id == current_user.id)
    )
    operator: OperatorProfile | None = op_result.scalar_one_or_none()

    if not operator:
        raise HTTPException(status_code=403, detail="Operator profile not found")

    if not operator.is_verified:
        raise HTTPException(status_code=403, detail="Operator not verified")

    # Get experiment
    exp_result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
    experiment: ExperimentModel | None = exp_result.scalar_one_or_none()

    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if experiment.status != DBExperimentStatus.OPEN:
        raise HTTPException(status_code=409, detail="Experiment not available for claiming")

    # Claim the experiment
    experiment.operator_id = operator.id
    experiment.status = DBExperimentStatus.CLAIMED
    experiment.claimed_at = datetime.utcnow()
    experiment.payment_status = DBPaymentStatus.ESCROWED

    operator.current_jobs += 1

    await db.commit()
    await db.refresh(experiment)

    # Calculate deadline (14 days from claim)
    deadline = experiment.claimed_at + timedelta(days=14)

    return schemas.ClaimResponse(
        experiment_id=experiment.id, claimed_at=experiment.claimed_at, deadline=deadline
    )


@app.post(
    "/operator/jobs/{experiment_id}/submit",
    response_model=schemas.SubmitResultsResponse,
    tags=["Operators"],
)
async def submit_results(
    experiment_id: str,
    request: schemas.ResultSubmission,
    current_user: AuthUser = Depends(get_current_operator),
    db: AsyncSession = Depends(get_db),
) -> schemas.SubmitResultsResponse:
    """Submit experiment results."""
    # Get operator profile
    op_result = await db.execute(
        select(OperatorProfile).where(OperatorProfile.user_id == current_user.id)
    )
    operator: OperatorProfile | None = op_result.scalar_one_or_none()

    if not operator:
        raise HTTPException(status_code=403, detail="Operator profile not found")

    # Get experiment
    exp_result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
    experiment: ExperimentModel | None = exp_result.scalar_one_or_none()

    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if experiment.operator_id != operator.id:
        raise HTTPException(status_code=403, detail="Not assigned to this experiment")

    if experiment.status not in [DBExperimentStatus.CLAIMED, DBExperimentStatus.IN_PROGRESS]:
        raise HTTPException(status_code=409, detail="Cannot submit results for this experiment")

    # Create results
    result_record = ExperimentResult(
        experiment_id=experiment.id,
        hypothesis_supported=request.hypothesis_supported,
        confidence_level=DBConfidenceLevel(request.confidence_level.value)
        if request.confidence_level
        else None,
        summary=request.summary,
        structured_data={
            "measurements": [m.model_dump() for m in request.measurements],
            "statistics": request.statistics.model_dump() if request.statistics else None,
        },
        documentation=request.documentation.model_dump() if request.documentation else None,
        notes=request.notes,
    )
    db.add(result_record)

    experiment.status = DBExperimentStatus.COMPLETED
    experiment.completed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(result_record)

    return schemas.SubmitResultsResponse(
        experiment_id=experiment.id,
        status="pending_approval",
        submitted_at=result_record.submitted_at,
    )


# =============================================================================
# Webhook Endpoints
# =============================================================================


@app.post("/webhooks/test", response_model=schemas.WebhookTestResponse, tags=["Webhooks"])
async def test_webhook(
    request: schemas.WebhookTestRequest, current_user: AuthUser = Depends(get_current_user)
) -> schemas.WebhookTestResponse:
    """Send test webhook to verify endpoint configuration."""
    payload = {
        "event": f"experiment.{request.event_type}",
        "experiment_id": "test_" + generate_uuid()[:8],
        "timestamp": datetime.utcnow().isoformat(),
        "data": {"test": True, "message": "This is a test webhook from Litmus Science"},
    }

    try:
        start_time = datetime.utcnow()
        async with httpx.AsyncClient() as client:
            response = await client.post(request.url, json=payload, timeout=10.0)
        elapsed = (datetime.utcnow() - start_time).total_seconds() * 1000

        return schemas.WebhookTestResponse(
            success=200 <= response.status_code < 300,
            response_code=response.status_code,
            response_time_ms=int(elapsed),
        )
    except Exception:
        return schemas.WebhookTestResponse(success=False, response_code=None, response_time_ms=None)


# =============================================================================
# Cloud Lab Endpoints
# =============================================================================

# Map API job type names to Edison client job types
_EDISON_JOB_TYPE_MAP = {
    "literature": EdisonJobTypeClient.LITERATURE,
    "molecules": EdisonJobTypeClient.MOLECULES,
    "analysis": EdisonJobTypeClient.ANALYSIS,
    "precedent": EdisonJobTypeClient.PRECEDENT,
}


async def _parse_edison_request(request: Request) -> tuple[EdisonTranslateRequest, str | None]:
    content_type = request.headers.get("content-type", "")
    files: list[UploadFile] = []
    if content_type.startswith("multipart/form-data"):
        form = await request.form()

        def _form_str(value: str | UploadFile | StarletteUploadFile | None) -> str | None:
            return value if isinstance(value, str) else None

        request_data: dict[str, str | None] = {
            "query": _form_str(form.get("query")),
            "job_type": _form_str(form.get("job_type")),
            "context": _form_str(form.get("context")),
            "provider": _form_str(form.get("provider")),
        }
        files = [item for item in form.getlist("files") if isinstance(item, UploadFile)]
    else:
        body = await request.json()
        request_data = body if isinstance(body, dict) else {}

    try:
        edison_request = EdisonTranslateRequest.model_validate(request_data)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc

    additional_context = edison_request.context
    if files:
        file_snippets = []
        for upload in files:
            filename = upload.filename or "upload"
            content_type = upload.content_type or "application/octet-stream"
            if content_type.startswith("text/") or filename.lower().endswith(
                (".txt", ".md", ".csv", ".tsv", ".json")
            ):
                content = await upload.read(50000)
                text = content.decode("utf-8", errors="replace").strip()
                if text:
                    file_snippets.append(f"File: {filename}\n{text}")
                else:
                    file_snippets.append(f"File: {filename} (empty text file)")
            else:
                file_snippets.append(f"File: {filename} (content type: {content_type})")

        if file_snippets:
            file_context = "\n\n".join(file_snippets)
            additional_context = (
                f"{additional_context}\n\n{file_context}" if additional_context else file_context
            )

    return edison_request, additional_context


@app.get("/cloud-labs/providers", response_model=ProvidersListResponse, tags=["Cloud Labs"])
async def list_cloud_lab_providers() -> ProvidersListResponse:
    """List available cloud lab providers and their capabilities."""
    providers = get_providers_list()
    return ProvidersListResponse(
        providers=[ProviderInfoResponse.model_validate(p) for p in providers]
    )


@app.get(
    "/cloud-labs/providers/{provider_id}", response_model=ProviderInfoResponse, tags=["Cloud Labs"]
)
async def get_cloud_lab_provider(provider_id: str) -> ProviderInfoResponse:
    """Get detailed information about a specific cloud lab provider."""
    try:
        info = get_provider_info(provider_id)
        return ProviderInfoResponse.model_validate(info)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/cloud-labs/supported-types", response_model=SupportedTypesResponse, tags=["Cloud Labs"])
async def get_supported_types(
    provider: str | None = Query(None, description="Filter by provider (ecl/strateos)"),
) -> SupportedTypesResponse:
    """Get experiment types supported by cloud lab providers."""
    return SupportedTypesResponse(supported_types=get_supported_experiment_types(provider))


@app.post("/cloud-labs/interpret", response_model=LLMInterpretResponse, tags=["Cloud Labs"])
async def interpret_experiment(
    request: LLMInterpretRequest, current_user: AuthUser = Depends(get_current_user)
) -> LLMInterpretResponse:
    """
    Use LLM to interpret an experiment description and extract structured parameters.

    Takes natural language input (hypothesis, notes) and extracts experiment
    parameters that can be used for cloud lab translation.

    Requires LLM_PROVIDER environment variable set to 'anthropic' or 'openai',
    along with the corresponding API key (ANTHROPIC_API_KEY or OPENAI_API_KEY).
    """
    interpreter = get_experiment_interpreter()

    result = await interpreter.interpret(
        experiment_type=request.experiment_type,
        title=request.title,
        hypothesis=request.hypothesis,
        notes=request.notes,
        existing_intake=request.existing_intake,
    )

    return LLMInterpretResponse(
        success=result.success,
        enriched_intake=result.enriched_intake,
        suggestions=result.suggestions,
        warnings=result.warnings,
        confidence=result.confidence,
        error=result.error,
    )


@app.post("/cloud-labs/edison", response_model=EdisonTranslateResponse, tags=["Cloud Labs"])
async def translate_edison_query(
    request: Request, current_user: AuthUser = Depends(get_current_user)
) -> EdisonTranslateResponse:
    """
    Use Edison Scientific for hypothesis generation, then translate to cloud lab protocols.

    This endpoint integrates with Edison Scientific's AI research platform to:
    1. Query Edison for research insights (literature, molecules, analysis)
    2. Generate a testable hypothesis from Edison's output
    3. Create a Litmus experiment specification
    4. Translate to cloud lab protocols (ECL, Strateos)

    Example queries:
    - "What is the IC50 of aspirin against COX-2?" (analysis)
    - "Find synthesis routes for ibuprofen" (molecules)
    - "What does the literature say about EGFR inhibitors?" (literature)

    Set EDISON_API_KEY for real Edison integration, otherwise uses mock responses.
    Requires LLM_PROVIDER and API key for hypothesis generation.
    """
    integration = get_edison_litmus_integration()
    edison_request, additional_context = await _parse_edison_request(request)

    # Map the request job type to the client's enum
    job_type = _EDISON_JOB_TYPE_MAP.get(
        edison_request.job_type.value, EdisonJobTypeClient.MOLECULES
    )

    # Run the full pipeline: Edison → Hypothesis → Litmus → Cloud Labs
    result = await integration.research_and_translate(
        query=edison_request.query,
        job_type=job_type,
        additional_context=additional_context,
        translate_to_cloud_labs=True,
    )

    if not result.success:
        return EdisonTranslateResponse(
            success=False,
            experiment_type=result.experiment_type,
            intake={},
            error=result.error,
        )

    translations_payload: JsonObject | None = None
    if result.translations:
        translations_payload = {}
        for key, value in result.translations.items():
            translations_payload[key] = value

    return EdisonTranslateResponse(
        success=True,
        experiment_type=result.experiment_type,
        intake=result.intake,
        translations=translations_payload,
        suggestions=result.suggestions,
        warnings=result.warnings,
    )


@app.post("/cloud-labs/edison/start", response_model=EdisonRunStartResponse, tags=["Cloud Labs"])
async def start_edison_run(
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EdisonRunStartResponse:
    """
    Start an Edison run and return a run_id for resumable polling.
    """
    integration = get_edison_litmus_integration()
    edison_request, additional_context = await _parse_edison_request(request)

    job_type = _EDISON_JOB_TYPE_MAP.get(
        edison_request.job_type.value, EdisonJobTypeClient.MOLECULES
    )
    try:
        task_id = await integration.edison.create_task(
            query=edison_request.query,
            job_type=job_type,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    await db.execute(
        update(EdisonRunModel)
        .where(
            and_(
                EdisonRunModel.user_id == current_user.id,
                EdisonRunModel.is_hidden.is_(False),
                EdisonRunModel.status.in_((DBEdisonRunStatus.PENDING, DBEdisonRunStatus.RUNNING)),
            )
        )
        .values(
            status=DBEdisonRunStatus.FAILED,
            error="Superseded by new run",
            updated_at=datetime.utcnow(),
        )
    )

    intake_id = generate_uuid()
    run = EdisonRunModel(
        user_id=current_user.id,
        query=edison_request.query,
        job_type=edison_request.job_type.value,
        task_id=task_id,
        status=DBEdisonRunStatus.PENDING,
        additional_context=additional_context,
        intake_id=intake_id,
    )
    db.add(run)
    await db.commit()

    return EdisonRunStartResponse(
        run_id=run.id,
        status=DBEdisonRunStatus.PENDING,
        intake_id=intake_id,
    )


@app.get("/cloud-labs/edison/active", response_model=EdisonRunSummary | None, tags=["Cloud Labs"])
async def get_active_edison_run(
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EdisonRunSummary | None:
    """
    Fetch the most recent active Edison run for the current user.
    """
    result = await db.execute(
        select(EdisonRunModel)
        .where(
            and_(
                EdisonRunModel.user_id == current_user.id,
                EdisonRunModel.status.in_((DBEdisonRunStatus.PENDING, DBEdisonRunStatus.RUNNING)),
            )
        )
        .order_by(EdisonRunModel.created_at.desc())
        .limit(1)
    )
    run = result.scalar_one_or_none()
    if run is None:
        return None

    return EdisonRunSummary(
        run_id=run.id,
        status=run.status,
        query=run.query,
        job_type=EdisonJobType(run.job_type),
        started_at=run.created_at,
        experiment_type=run.experiment_type,
        draft=_build_edison_run_draft(run),
    )


@app.get("/cloud-labs/edison/runs", response_model=EdisonRunListResponse, tags=["Cloud Labs"])
async def list_edison_runs(
    status: DBEdisonRunStatus | None = None,
    limit: int = Query(20, ge=1, le=100),
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EdisonRunListResponse:
    """
    List Edison runs for the current user.
    """
    query = select(EdisonRunModel).where(
        and_(
            EdisonRunModel.user_id == current_user.id,
            EdisonRunModel.is_hidden.is_(False),
        )
    )
    if status is not None:
        query = query.where(EdisonRunModel.status == status)
    query = query.order_by(EdisonRunModel.created_at.desc()).limit(limit)

    result = await db.execute(query)
    runs = result.scalars().all()

    summaries = [
        EdisonRunSummary(
            run_id=run.id,
            status=run.status,
            query=run.query,
            job_type=EdisonJobType(run.job_type),
            started_at=run.created_at,
            experiment_type=run.experiment_type,
            draft=_build_edison_run_draft(run),
        )
        for run in runs
    ]

    return EdisonRunListResponse(runs=summaries)


@app.patch(
    "/cloud-labs/edison/runs/{run_id}/draft", response_model=EdisonRunDraft, tags=["Cloud Labs"]
)
async def update_edison_run_draft(
    run_id: str,
    request: EdisonRunDraftUpdateRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EdisonRunDraft:
    """
    Update draft edits for an Edison run.
    """
    result = await db.execute(
        select(EdisonRunModel).where(
            and_(
                EdisonRunModel.id == run_id,
                EdisonRunModel.user_id == current_user.id,
            )
        )
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Edison run not found")

    fields_set = request.model_fields_set
    if "hypothesis" in fields_set:
        run.edited_hypothesis = request.hypothesis
    if "null_hypothesis" in fields_set:
        run.edited_null_hypothesis = request.null_hypothesis

    await db.commit()
    return _build_edison_run_draft(run) or EdisonRunDraft()


@app.post(
    "/cloud-labs/edison/runs/clear-history",
    response_model=EdisonClearHistoryResponse,
    tags=["Cloud Labs"],
)
async def clear_edison_history(
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EdisonClearHistoryResponse:
    """
    Hide completed Edison runs from history for the current user.
    """
    from sqlalchemy.engine import CursorResult

    result = await db.execute(
        update(EdisonRunModel)
        .where(
            and_(
                EdisonRunModel.user_id == current_user.id,
                EdisonRunModel.status == DBEdisonRunStatus.COMPLETED,
                EdisonRunModel.is_hidden.is_(False),
            )
        )
        .values(is_hidden=True, updated_at=datetime.utcnow())
    )
    await db.commit()
    rowcount = cast(CursorResult[tuple[object, ...]], result).rowcount or 0
    return EdisonClearHistoryResponse(success=True, cleared=rowcount)


def _convert_reasoning_trace(
    trace: EdisonReasoningTrace | None,
) -> EdisonReasoningTraceResponse | None:
    """Convert reasoning trace to API response model."""
    if trace is None:
        return None
    return EdisonReasoningTraceResponse.model_validate(trace.model_dump())


def _build_edison_run_draft(run: EdisonRunModel) -> EdisonRunDraft | None:
    if (
        run.edited_hypothesis is None
        and run.edited_null_hypothesis is None
        and run.intake_id is None
    ):
        return None
    return EdisonRunDraft(
        hypothesis=run.edited_hypothesis,
        null_hypothesis=run.edited_null_hypothesis,
        intake_id=run.intake_id,
    )


@app.get(
    "/cloud-labs/edison/status/{run_id}",
    response_model=EdisonRunStatusResponse,
    tags=["Cloud Labs"],
)
async def get_edison_run_status(
    run_id: str,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EdisonRunStatusResponse:
    """
    Get the status of an Edison run and return results when completed.

    Returns reasoning_trace with the agent's execution state including:
    - current_step: Current execution phase (INITIALIZED, CREATE_PLAN, PAPER_SEARCH, etc.)
    - steps_completed: List of completed phases
    - plan: Execution plan with objectives and status
    - papers: Papers found during search
    - evidence: Evidence gathered from papers
    - paper_count, relevant_papers, evidence_count: Running counters
    """
    result = await db.execute(
        select(EdisonRunModel).where(
            and_(
                EdisonRunModel.id == run_id,
                EdisonRunModel.user_id == current_user.id,
            )
        )
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Edison run not found")

    intake_id_updated = False
    if run.intake_id is None:
        run.intake_id = generate_uuid()
        intake_id_updated = True

    if intake_id_updated and run.status in (DBEdisonRunStatus.COMPLETED, DBEdisonRunStatus.FAILED):
        await db.commit()
        intake_id_updated = False

    if run.status == DBEdisonRunStatus.COMPLETED:
        if run.result is None:
            run.status = DBEdisonRunStatus.FAILED
            run.error = "Edison run completed without a result"
            await db.commit()
            return EdisonRunStatusResponse(
                run_id=run.id,
                status=DBEdisonRunStatus.FAILED,
                error=run.error,
                draft=_build_edison_run_draft(run),
            )
        return EdisonRunStatusResponse(
            run_id=run.id,
            status=DBEdisonRunStatus.COMPLETED,
            result=(
                EdisonTranslateResponse.model_validate(run.result)
                if isinstance(run.result, dict)
                else EdisonTranslateResponse(
                    success=False,
                    experiment_type=run.experiment_type or "CUSTOM",
                    intake={},
                    error="Stored result had an invalid format",
                )
            ),
            draft=_build_edison_run_draft(run),
        )

    if run.status == DBEdisonRunStatus.FAILED:
        return EdisonRunStatusResponse(
            run_id=run.id,
            status=DBEdisonRunStatus.FAILED,
            error=run.error,
            draft=_build_edison_run_draft(run),
        )

    integration = get_edison_litmus_integration()
    edison_task = await integration.edison.get_task(run.task_id, verbose=True)
    task_status = edison_task.status.lower()
    in_progress = task_status in ("in progress", "pending", "queued", "running")

    # Convert reasoning trace for response
    reasoning_trace = _convert_reasoning_trace(edison_task.reasoning_trace)

    if in_progress:
        run.status = DBEdisonRunStatus.RUNNING
        await db.commit()
        return EdisonRunStatusResponse(
            run_id=run.id,
            status=DBEdisonRunStatus.RUNNING,
            reasoning_trace=reasoning_trace,
            draft=_build_edison_run_draft(run),
        )

    edison_insights = edison_task.formatted_answer or edison_task.answer
    if not edison_insights:
        run.status = DBEdisonRunStatus.FAILED
        run.error = "Edison response missing insights"
        await db.commit()
        return EdisonRunStatusResponse(
            run_id=run.id,
            status=DBEdisonRunStatus.FAILED,
            error=run.error,
            reasoning_trace=reasoning_trace,
            draft=_build_edison_run_draft(run),
        )

    translated = await integration.translate_from_insights(
        query=run.query,
        edison_insights=edison_insights,
        additional_context=run.additional_context,
        translate_to_cloud_labs=True,
    )

    if not translated.success:
        run.status = DBEdisonRunStatus.FAILED
        run.error = translated.error or "Failed to translate Edison insights"
        await db.commit()
        return EdisonRunStatusResponse(
            run_id=run.id,
            status=DBEdisonRunStatus.FAILED,
            error=run.error,
            reasoning_trace=reasoning_trace,
            draft=_build_edison_run_draft(run),
        )

    translated_payload: JsonObject | None = None
    if translated.translations:
        translated_payload = {}
        for key, value in translated.translations.items():
            translated_payload[key] = value

    response_payload = EdisonTranslateResponse(
        success=True,
        experiment_type=translated.experiment_type,
        intake=translated.intake,
        translations=translated_payload,
        suggestions=translated.suggestions,
        warnings=translated.warnings,
    )
    run.status = DBEdisonRunStatus.COMPLETED
    run.experiment_type = translated.experiment_type
    run.result = response_payload.model_dump()
    await db.commit()

    return EdisonRunStatusResponse(
        run_id=run.id,
        status=DBEdisonRunStatus.COMPLETED,
        result=response_payload,
        reasoning_trace=reasoning_trace,
        draft=_build_edison_run_draft(run),
    )


@app.post("/cloud-labs/translate", response_model=TranslateResponse, tags=["Cloud Labs"])
async def translate_to_cloud_lab(
    request: TranslateRequest, current_user: AuthUser = Depends(get_current_user)
) -> TranslateResponse:
    """
    Translate a Litmus experiment intake to cloud lab protocol format.

    Converts the standardized Litmus intake JSON to either:
    - SLL (Symbolic Lab Language) for ECL
    - Autoprotocol (JSON) for Strateos

    If no provider is specified, translates for all compatible providers.

    Set use_llm=true to have an LLM interpret and enrich the intake before translation.
    This extracts additional parameters from the hypothesis and notes fields.
    """
    intake = request.intake
    provider = request.provider

    # If LLM interpretation is requested, enrich the intake first
    if request.use_llm:
        interpreter = get_experiment_interpreter()
        interpretation = await interpreter.interpret(
            experiment_type=_as_str(intake.get("experiment_type"), "CUSTOM") or "CUSTOM",
            title=_as_str(intake.get("title"), "Untitled") or "Untitled",
            hypothesis=_as_str(_as_object(intake.get("hypothesis")).get("statement"), "") or "",
            notes=_as_str(intake.get("notes")),
            existing_intake=intake,
        )
        if interpretation.success:
            intake = interpretation.enriched_intake
        else:
            # Return error when LLM interpretation fails
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "llm_interpretation_failed",
                    "message": interpretation.error or "LLM interpretation failed",
                },
            )

    try:
        results = do_translate_intake(intake, provider)

        translations = {}
        for prov_name, result in results.items():
            translations[prov_name] = TranslationResultResponse(
                provider=result.provider,
                format=result.format,
                protocol=result.protocol,
                protocol_readable=result.protocol_readable,
                success=result.success,
                errors=[
                    ValidationIssueResponse(
                        path=e.path,
                        code=e.code,
                        message=e.message,
                        severity=e.severity,
                        suggestion=e.suggestion,
                    )
                    for e in result.errors
                ],
                warnings=[
                    ValidationIssueResponse(
                        path=w.path,
                        code=w.code,
                        message=w.message,
                        severity=w.severity,
                        suggestion=w.suggestion,
                    )
                    for w in result.warnings
                ],
                metadata=result.metadata,
            )

        return TranslateResponse(
            translations=translations,
            experiment_type=_as_str(intake.get("experiment_type"), "unknown") or "unknown",
            title=_as_str(intake.get("title")),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except TranslationError as e:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "translation_error",
                "message": str(e),
                "field_path": e.field_path,
                "suggestion": e.suggestion,
            },
        )


@app.post("/cloud-labs/validate", tags=["Cloud Labs"])
async def validate_for_cloud_lab(
    request: ValidateForProviderRequest, current_user: AuthUser = Depends(get_current_user)
) -> JsonObject:
    """
    Validate an intake specification for a specific cloud lab provider.

    Returns validation issues (errors and warnings) specific to the
    target cloud lab's requirements and capabilities.
    """
    try:
        issues = validate_intake_for_provider(request.intake, request.provider)
        errors = [i for i in issues if i.severity == "error"]
        warnings = [i for i in issues if i.severity == "warning"]

        errors_payload: list[JsonObject] = [
            ValidationIssueResponse(
                path=e.path,
                code=e.code,
                message=e.message,
                severity=e.severity,
                suggestion=e.suggestion,
            ).model_dump()
            for e in errors
        ]
        warnings_payload: list[JsonObject] = [
            ValidationIssueResponse(
                path=w.path,
                code=w.code,
                message=w.message,
                severity=w.severity,
                suggestion=w.suggestion,
            ).model_dump()
            for w in warnings
        ]

        errors_list: list[JsonValue] = list(errors_payload)
        warnings_list: list[JsonValue] = list(warnings_payload)
        return {
            "valid": len(errors) == 0,
            "provider": request.provider,
            "errors": errors_list,
            "warnings": warnings_list,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/cloud-labs/experiments/{experiment_id}/translate", tags=["Cloud Labs"])
async def translate_experiment(
    experiment_id: str,
    provider: str = Query(..., description="Target provider (ecl/strateos)"),
    save: bool = Query(False, description="Save translation to database"),
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JsonObject:
    """
    Translate an existing experiment to cloud lab format.

    Fetches the experiment specification and translates it to the
    specified cloud lab's protocol format.
    """
    # Get the experiment
    result = await db.execute(select(ExperimentModel).where(ExperimentModel.id == experiment_id))
    experiment = result.scalar_one_or_none()

    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if experiment.requester_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    # Translate the specification
    try:
        translator = get_translator(provider)
        translation_result = translator.translate(experiment.specification)

        if save and translation_result.success:
            # Save to database
            submission = CloudLabSubmission(
                experiment_id=experiment.id,
                provider=provider,
                translated_protocol=translation_result.protocol,
                protocol_format=translation_result.format,
                status="pending",
            )
            db.add(submission)
            await db.commit()
            await db.refresh(submission)

            return {
                "submission_id": submission.id,
                "translation": TranslationResultResponse(
                    provider=translation_result.provider,
                    format=translation_result.format,
                    protocol=translation_result.protocol,
                    protocol_readable=translation_result.protocol_readable,
                    success=translation_result.success,
                    errors=[],
                    warnings=[
                        ValidationIssueResponse(
                            path=w.path,
                            code=w.code,
                            message=w.message,
                            severity=w.severity,
                            suggestion=w.suggestion,
                        )
                        for w in translation_result.warnings
                    ],
                    metadata=translation_result.metadata,
                ).model_dump(),
                "saved": True,
            }

        return {
            "translation": TranslationResultResponse(
                provider=translation_result.provider,
                format=translation_result.format,
                protocol=translation_result.protocol,
                protocol_readable=translation_result.protocol_readable,
                success=translation_result.success,
                errors=[
                    ValidationIssueResponse(
                        path=e.path,
                        code=e.code,
                        message=e.message,
                        severity=e.severity,
                        suggestion=e.suggestion,
                    )
                    for e in translation_result.errors
                ],
                warnings=[
                    ValidationIssueResponse(
                        path=w.path,
                        code=w.code,
                        message=w.message,
                        severity=w.severity,
                        suggestion=w.suggestion,
                    )
                    for w in translation_result.warnings
                ],
                metadata=translation_result.metadata,
            ).model_dump(),
            "saved": False,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/cloud-labs/submissions", tags=["Cloud Labs"])
async def list_cloud_lab_submissions(
    experiment_id: str | None = None,
    provider: str | None = None,
    status: str | None = None,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JsonObject:
    """List cloud lab submissions for the current user's experiments."""
    # Get user's experiment IDs
    exp_query = select(ExperimentModel.id).where(ExperimentModel.requester_id == current_user.id)

    query = select(CloudLabSubmission).where(CloudLabSubmission.experiment_id.in_(exp_query))

    if experiment_id:
        query = query.where(CloudLabSubmission.experiment_id == experiment_id)
    if provider:
        query = query.where(CloudLabSubmission.provider == provider)
    if status:
        query = query.where(CloudLabSubmission.status == status)

    query = query.order_by(CloudLabSubmission.created_at.desc())

    result = await db.execute(query)
    submissions = result.scalars().all()

    return {
        "submissions": [
            {
                "id": s.id,
                "experiment_id": s.experiment_id,
                "provider": s.provider,
                "protocol_format": s.protocol_format,
                "status": s.status,
                "provider_submission_id": s.provider_submission_id,
                "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                "created_at": s.created_at.isoformat(),
            }
            for s in submissions
        ]
    }


@app.get("/cloud-labs/submissions/{submission_id}", tags=["Cloud Labs"])
async def get_cloud_lab_submission(
    submission_id: str,
    include_protocol: bool = Query(False, description="Include full protocol in response"),
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JsonObject:
    """Get details of a specific cloud lab submission."""
    result = await db.execute(
        select(CloudLabSubmission).where(CloudLabSubmission.id == submission_id)
    )
    submission = result.scalar_one_or_none()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Check access via experiment
    exp_result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == submission.experiment_id)
    )
    experiment = exp_result.scalar_one_or_none()

    if not experiment or (
        experiment.requester_id != current_user.id and current_user.role != "admin"
    ):
        raise HTTPException(status_code=403, detail="Access denied")

    response: JsonObject = {
        "id": submission.id,
        "experiment_id": submission.experiment_id,
        "provider": submission.provider,
        "protocol_format": submission.protocol_format,
        "status": submission.status,
        "provider_submission_id": submission.provider_submission_id,
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "completed_at": submission.completed_at.isoformat() if submission.completed_at else None,
        "created_at": submission.created_at.isoformat(),
        "updated_at": submission.updated_at.isoformat(),
    }

    if include_protocol:
        response["translated_protocol"] = submission.translated_protocol

    return response


# =============================================================================
# Hypotheses Endpoints
# =============================================================================


@app.post(
    "/hypotheses",
    response_model=schemas.HypothesisResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Hypotheses"],
)
async def create_hypothesis(
    request: schemas.HypothesisCreate,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.HypothesisResponse:
    """Create a new hypothesis."""
    hypothesis = HypothesisModel(
        user_id=current_user.id,
        title=request.title,
        statement=request.statement,
        null_hypothesis=request.null_hypothesis,
        experiment_type=request.experiment_type,
        edison_agent=request.edison_agent,
        edison_query=request.edison_query,
        edison_response=request.edison_response,
        intake_draft=request.intake_draft,
        status=DBHypothesisStatus.DRAFT,
    )
    db.add(hypothesis)
    await db.commit()
    await db.refresh(hypothesis)

    # Count experiments linked to this hypothesis
    exp_count_result = await db.execute(
        select(func.count())
        .select_from(ExperimentModel)
        .where(ExperimentModel.hypothesis_id == hypothesis.id)
    )
    experiments_count = exp_count_result.scalar_one()

    return schemas.HypothesisResponse(
        id=hypothesis.id,
        user_id=hypothesis.user_id,
        title=hypothesis.title,
        statement=hypothesis.statement,
        null_hypothesis=hypothesis.null_hypothesis,
        experiment_type=hypothesis.experiment_type,
        status=hypothesis.status,
        edison_agent=hypothesis.edison_agent,
        edison_query=hypothesis.edison_query,
        edison_response=hypothesis.edison_response,
        intake_draft=hypothesis.intake_draft,
        experiments_count=experiments_count,
        created_at=hypothesis.created_at,
        updated_at=hypothesis.updated_at,
    )


@app.get("/hypotheses", response_model=schemas.HypothesisListResponse, tags=["Hypotheses"])
async def list_hypotheses(
    status: DBHypothesisStatus | None = None,
    experiment_type: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    cursor: str | None = None,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.HypothesisListResponse:
    """List hypotheses for the authenticated user."""
    filters = [HypothesisModel.user_id == current_user.id]

    if status:
        filters.append(HypothesisModel.status == status)
    else:
        filters.append(HypothesisModel.status != DBHypothesisStatus.ARCHIVED)
    if experiment_type:
        filters.append(HypothesisModel.experiment_type == experiment_type)

    query = select(HypothesisModel).where(*filters)

    if cursor:
        cursor_row = await db.execute(select(HypothesisModel).where(HypothesisModel.id == cursor))
        cursor_hyp = cursor_row.scalar_one_or_none()
        if cursor_hyp:
            query = query.where(
                or_(
                    HypothesisModel.created_at < cursor_hyp.created_at,
                    and_(
                        HypothesisModel.created_at == cursor_hyp.created_at,
                        HypothesisModel.id < cursor_hyp.id,
                    ),
                )
            )

    query = query.order_by(HypothesisModel.created_at.desc(), HypothesisModel.id.desc()).limit(
        limit + 1
    )

    result = await db.execute(query)
    hypotheses = result.scalars().all()

    has_more = len(hypotheses) > limit
    if has_more:
        hypotheses = hypotheses[:limit]

    count_result = await db.execute(
        select(func.count()).select_from(HypothesisModel).where(*filters)
    )
    total_count = count_result.scalar_one()

    return schemas.HypothesisListResponse(
        hypotheses=[
            schemas.HypothesisListItem(
                id=h.id,
                title=h.title,
                statement=h.statement,
                experiment_type=h.experiment_type,
                status=h.status,
                created_at=h.created_at,
            )
            for h in hypotheses
        ],
        pagination=schemas.Pagination(
            total=total_count, cursor=hypotheses[-1].id if has_more else None, has_more=has_more
        ),
    )


@app.get(
    "/hypotheses/{hypothesis_id}", response_model=schemas.HypothesisResponse, tags=["Hypotheses"]
)
async def get_hypothesis(
    hypothesis_id: str,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.HypothesisResponse:
    """Get a specific hypothesis."""
    result = await db.execute(select(HypothesisModel).where(HypothesisModel.id == hypothesis_id))
    hypothesis = result.scalar_one_or_none()

    if not hypothesis:
        raise HTTPException(status_code=404, detail="Hypothesis not found")

    if hypothesis.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Count experiments linked to this hypothesis
    exp_count_result = await db.execute(
        select(func.count())
        .select_from(ExperimentModel)
        .where(ExperimentModel.hypothesis_id == hypothesis.id)
    )
    experiments_count = exp_count_result.scalar_one()

    return schemas.HypothesisResponse(
        id=hypothesis.id,
        user_id=hypothesis.user_id,
        title=hypothesis.title,
        statement=hypothesis.statement,
        null_hypothesis=hypothesis.null_hypothesis,
        experiment_type=hypothesis.experiment_type,
        status=hypothesis.status,
        edison_agent=hypothesis.edison_agent,
        edison_query=hypothesis.edison_query,
        edison_response=hypothesis.edison_response,
        intake_draft=hypothesis.intake_draft,
        experiments_count=experiments_count,
        created_at=hypothesis.created_at,
        updated_at=hypothesis.updated_at,
    )


@app.patch(
    "/hypotheses/{hypothesis_id}", response_model=schemas.HypothesisResponse, tags=["Hypotheses"]
)
async def update_hypothesis(
    hypothesis_id: str,
    update: schemas.HypothesisUpdate,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.HypothesisResponse:
    """Update a hypothesis."""
    result = await db.execute(select(HypothesisModel).where(HypothesisModel.id == hypothesis_id))
    hypothesis = result.scalar_one_or_none()

    if not hypothesis:
        raise HTTPException(status_code=404, detail="Hypothesis not found")

    if hypothesis.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Apply partial updates
    update_data = update.model_dump(exclude_none=True)
    if isinstance(update_data, dict):
        for field, value in update_data.items():
            setattr(hypothesis, field, value)

    hypothesis.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(hypothesis)

    # Count experiments linked to this hypothesis
    exp_count_result = await db.execute(
        select(func.count())
        .select_from(ExperimentModel)
        .where(ExperimentModel.hypothesis_id == hypothesis.id)
    )
    experiments_count = exp_count_result.scalar_one()

    return schemas.HypothesisResponse(
        id=hypothesis.id,
        user_id=hypothesis.user_id,
        title=hypothesis.title,
        statement=hypothesis.statement,
        null_hypothesis=hypothesis.null_hypothesis,
        experiment_type=hypothesis.experiment_type,
        status=hypothesis.status,
        edison_agent=hypothesis.edison_agent,
        edison_query=hypothesis.edison_query,
        edison_response=hypothesis.edison_response,
        intake_draft=hypothesis.intake_draft,
        experiments_count=experiments_count,
        created_at=hypothesis.created_at,
        updated_at=hypothesis.updated_at,
    )


@app.delete("/hypotheses/{hypothesis_id}", tags=["Hypotheses"])
async def delete_hypothesis(
    hypothesis_id: str,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JsonObject:
    """Archive a hypothesis (soft delete)."""
    result = await db.execute(select(HypothesisModel).where(HypothesisModel.id == hypothesis_id))
    hypothesis = result.scalar_one_or_none()

    if not hypothesis:
        raise HTTPException(status_code=404, detail="Hypothesis not found")

    if hypothesis.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    hypothesis.status = DBHypothesisStatus.ARCHIVED
    hypothesis.updated_at = datetime.utcnow()
    await db.commit()

    return {"deleted": True}


@app.post(
    "/hypotheses/{hypothesis_id}/to-experiment",
    response_model=schemas.ExperimentCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Hypotheses"],
)
async def convert_hypothesis_to_experiment(
    hypothesis_id: str,
    request: schemas.HypothesisToExperimentRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> schemas.ExperimentCreatedResponse:
    """Convert a hypothesis to an experiment request."""
    result = await db.execute(select(HypothesisModel).where(HypothesisModel.id == hypothesis_id))
    hypothesis = result.scalar_one_or_none()

    if not hypothesis:
        raise HTTPException(status_code=404, detail="Hypothesis not found")

    if hypothesis.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Build experiment specification from hypothesis and request
    spec: JsonObject = {}

    # Start with the intake draft if available
    if hypothesis.intake_draft:
        spec = hypothesis.intake_draft.copy()

    # Override with request parameters
    spec["experiment_type"] = hypothesis.experiment_type
    spec["title"] = request.title_override or hypothesis.title
    spec["hypothesis"] = {
        "statement": hypothesis.statement,
        "null_hypothesis": hypothesis.null_hypothesis,
    }

    if request.budget_max_usd is not None:
        if "turnaround_budget" not in spec or not isinstance(spec["turnaround_budget"], dict):
            spec["turnaround_budget"] = {}
        budget_section = spec["turnaround_budget"]
        if isinstance(budget_section, dict):
            budget_section["budget_max_usd"] = request.budget_max_usd

    if request.bsl_level:
        if "compliance" not in spec or not isinstance(spec["compliance"], dict):
            spec["compliance"] = {}
        compliance_section = spec["compliance"]
        if isinstance(compliance_section, dict):
            compliance_section["bsl"] = request.bsl_level.value

    if request.privacy:
        spec["privacy"] = request.privacy

    # Validate the specification
    validation = validate_intake(spec)
    if not validation.valid:
        if "safety_rejected" in validation.safety_flags:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "safety_rejected",
                    "message": "Experiment rejected for safety reasons",
                    "flags": validation.safety_flags,
                },
            )
        primary_error = validation.errors[0] if validation.errors else None
        message = "Experiment validation failed"
        if primary_error:
            message = f"{message}: {primary_error.path} {primary_error.message}"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "validation_failed",
                "message": message,
                "validation_errors": [e.model_dump() for e in validation.errors],
            },
        )

    # Estimate cost
    estimate = estimate_cost(spec)

    # Create experiment
    experiment = ExperimentModel(
        requester_id=current_user.id,
        hypothesis_id=hypothesis.id,
        status=DBExperimentStatus.PENDING_REVIEW,
        specification=spec,
        experiment_type=_as_str(spec.get("experiment_type")),
        estimated_cost_usd=estimate.estimated_cost_usd.typical,
        webhook_url=_as_str(_as_object(spec.get("requester_info")).get("webhook_url")),
        payment_status=DBPaymentStatus.PENDING,
    )
    db.add(experiment)

    # Update hypothesis status
    hypothesis.status = DBHypothesisStatus.USED
    hypothesis.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(experiment)

    return schemas.ExperimentCreatedResponse(
        experiment_id=experiment.id,
        status=schemas.ExperimentStatus(experiment.status.value),
        created_at=experiment.created_at,
        estimated_cost_usd=experiment.estimated_cost_usd,
        estimated_turnaround_days=14,
        links=schemas.ExperimentLinks(
            self=f"/experiments/{experiment.id}",
            results=f"/experiments/{experiment.id}/results",
            cancel=f"/experiments/{experiment.id}",
        ),
    )


# =============================================================================
# Health Check
# =============================================================================


@app.get("/health", tags=["System"])
async def health_check() -> JsonObject:
    """Health check endpoint."""
    return {"status": "healthy", "version": "1.0.0"}


@app.get("/config", tags=["System"])
async def get_config() -> JsonObject:
    """Get public configuration for frontend."""
    return {
        "auth_disabled": os.environ.get("LITMUS_AUTH_DISABLED", "").lower() in ("1", "true", "yes"),
        "debug_mode": os.environ.get("LITMUS_DEBUG", "").lower() in ("1", "true", "yes"),
    }


# =============================================================================
# Main
# =============================================================================


def main() -> None:
    """Run the API server."""
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()

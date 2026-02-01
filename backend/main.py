"""
Litmus Science Backend API - FastAPI Application

Main entry point for the REST API implementing the OpenAPI specification.
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List
from contextlib import asynccontextmanager
from collections import defaultdict

# Load environment variables from .env file at project root
# This allows sharing .env between frontend and backend
from dotenv import load_dotenv
PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env")

from fastapi import FastAPI, HTTPException, Depends, Query, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, and_, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

# Add project root to path for imports
sys.path.insert(0, str(PROJECT_ROOT))

from backend.models import (
    init_db, get_db, Experiment as ExperimentModel, ExperimentResult,
    Template as TemplateModel, User, OperatorProfile, Dispute, FileUpload,
    ExperimentStatus as DBExperimentStatus, PaymentStatus as DBPaymentStatus,
    ConfidenceLevel as DBConfidenceLevel, DisputeReason as DBDisputeReason,
    generate_uuid
)
from backend.auth import (
    get_current_user, get_current_operator, AuthUser,
    get_password_hash, create_access_token, authenticate_user, hash_api_key
)
from backend import schemas


@asynccontextmanager
async def lifespan(app: FastAPI):
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
_dev_mode = (
    os.environ.get("LITMUS_AUTH_DISABLED", "").lower() in ("1", "true", "yes") or
    os.environ.get("LITMUS_DEBUG", "").lower() in ("1", "true", "yes")
)

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=not _dev_mode,  # Can't use credentials with "*" origins
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Request-ID"],
)


# =============================================================================
# Rate Limiting Middleware
# =============================================================================

# In-memory rate limit storage (use Redis in production)
_rate_limit_storage: dict[str, dict] = defaultdict(lambda: {"minute": [], "day": []})

RATE_LIMITS = {
    "standard": {"per_minute": 100, "per_day": 1000},
    "pro": {"per_minute": 1000, "per_day": 10000},
    "ai_agent": {"per_minute": 500, "per_day": 5000},
}


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Enforce rate limits based on user tier."""
    # Skip rate limiting for health checks and docs
    if request.url.path in ("/health", "/docs", "/redoc", "/openapi.json"):
        return await call_next(request)

    # Get client identifier (API key or IP as fallback)
    api_key = request.headers.get("X-API-Key", "")
    client_id = api_key if api_key else request.client.host if request.client else "unknown"

    # Default to standard tier (in production, look up tier from database)
    tier = "standard"

    limits = RATE_LIMITS.get(tier, RATE_LIMITS["standard"])
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
            content={"error": {"code": "rate_limit_exceeded", "message": "Too many requests per minute"}},
            headers={
                "X-RateLimit-Limit": str(limits["per_minute"]),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(minute_ago + 60)),
                "Retry-After": "60",
            }
        )

    if day_count >= limits["per_day"]:
        return JSONResponse(
            status_code=429,
            content={"error": {"code": "rate_limit_exceeded", "message": "Daily request limit exceeded"}},
            headers={
                "X-RateLimit-Limit": str(limits["per_day"]),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(day_ago + 86400)),
                "Retry-After": "3600",
            }
        )

    # Record this request
    storage["minute"].append(now)
    storage["day"].append(now)

    # Process request and add rate limit headers
    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(limits["per_minute"])
    response.headers["X-RateLimit-Remaining"] = str(limits["per_minute"] - minute_count - 1)

    return response


# Helper functions
def load_schema(name: str) -> dict:
    """Load a JSON schema from the schemas directory."""
    schema_path = PROJECT_ROOT / "schemas" / f"{name}.json"
    if schema_path.exists():
        return json.loads(schema_path.read_text())
    return {}


def validate_intake(intake: dict) -> schemas.ValidationResult:
    """Validate intake against schema."""
    errors = []
    warnings = []
    safety_flags = []

    # Basic validation
    if not intake.get("experiment_type"):
        errors.append(schemas.ValidationError(
            path="experiment_type",
            code="required_field_missing",
            message="experiment_type is required",
            suggestion="Specify one of: SANGER_PLASMID_VERIFICATION, QPCR_EXPRESSION, etc."
        ))

    # Check required fields
    if not intake.get("title"):
        errors.append(schemas.ValidationError(
            path="title",
            code="required_field_missing",
            message="title is required"
        ))

    # Check BSL level (schema uses "bsl", not "bsl_level")
    compliance = intake.get("compliance", {})
    bsl = compliance.get("bsl", "BSL1")
    if bsl not in ["BSL1", "BSL2"]:
        safety_flags.append("bsl_level_exceeded")
        safety_flags.append("safety_rejected")
        errors.append(schemas.ValidationError(
            path="compliance.bsl",
            code="safety_violation",
            message=f"BSL level {bsl} is not supported",
            suggestion="Only BSL1 and BSL2 experiments are allowed"
        ))

    # Check for controlled substances in materials_provided
    materials = intake.get("materials_provided", [])
    for material in materials:
        if material.get("hazardous"):
            if not compliance.get("sds_attached"):
                warnings.append(schemas.ValidationError(
                    path="compliance.sds_attached",
                    code="recommended_field_missing",
                    message="SDS should be attached for hazardous materials",
                    suggestion="Set compliance.sds_attached to true and attach SDS document"
                ))
                break

    # Check hypothesis completeness
    hypothesis = intake.get("hypothesis", {})
    if not hypothesis.get("statement"):
        warnings.append(schemas.ValidationError(
            path="hypothesis.statement",
            code="recommended_field_missing",
            message="Hypothesis statement improves clarity",
            suggestion="Add a clear, testable hypothesis statement"
        ))

    # Check turnaround_budget required fields
    turnaround = intake.get("turnaround_budget", {})
    if not turnaround.get("budget_max_usd"):
        errors.append(schemas.ValidationError(
            path="turnaround_budget.budget_max_usd",
            code="required_field_missing",
            message="budget_max_usd is required"
        ))

    # Check deliverables required fields
    deliverables = intake.get("deliverables", {})
    if not deliverables.get("minimum_package_level"):
        errors.append(schemas.ValidationError(
            path="deliverables.minimum_package_level",
            code="required_field_missing",
            message="minimum_package_level is required"
        ))

    # Validate experiment-type specific sections
    exp_type = intake.get("experiment_type")
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
    required_section = exp_type_to_section.get(exp_type)
    if required_section and not intake.get(required_section):
        errors.append(schemas.ValidationError(
            path=required_section,
            code="required_field_missing",
            message=f"{required_section} section is required for {exp_type}",
            suggestion=f"Add the {required_section} section with experiment-specific parameters"
        ))

    return schemas.ValidationResult(
        valid=len(errors) == 0 and "safety_rejected" not in safety_flags,
        errors=errors,
        warnings=warnings,
        safety_flags=safety_flags
    )


def estimate_cost(intake: dict) -> schemas.CostEstimate:
    """Generate cost estimate for an experiment."""
    exp_type = intake.get("experiment_type", "CUSTOM")

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
    privacy = intake.get("privacy", "open")
    privacy_multiplier = {
        "open": 0,
        "delayed_6mo": 0.10,
        "delayed_12mo": 0.15,
        "private": 0.25,
    }.get(privacy, 0)

    privacy_premium = typical * privacy_multiplier

    # Package level adjustment
    deliverables = intake.get("deliverables", {})
    package_level = deliverables.get("minimum_package_level", "L1_BASIC_QC")
    package_multiplier = {
        "L0_RAW_ONLY": 0.8,
        "L1_BASIC_QC": 1.0,
        "L2_INTERPRETATION": 1.3,
    }.get(package_level, 1.0)

    # Priority adjustment
    turnaround = intake.get("turnaround_budget", {})
    priority = turnaround.get("priority", "standard")
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
            high=round(adjusted_high + (adjusted_high * privacy_multiplier), 2)
        ),
        estimated_turnaround_days=schemas.TurnaroundEstimate(
            standard=14 if priority == "standard" else 10,
            expedited=7 if priority == "standard" else 5
        ),
        cost_breakdown=schemas.CostBreakdown(
            materials=round(adjusted_typical * 0.3, 2),
            labor=round(adjusted_typical * 0.4, 2),
            equipment=round(adjusted_typical * 0.1, 2),
            platform_fee=round(adjusted_typical * 0.2, 2),
            privacy_premium=round(privacy_premium, 2)
        ),
        operator_availability="high"
    )


async def seed_templates():
    """Seed initial protocol templates."""
    from backend.models import async_session, Template

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
                {"name": "read_length", "type": "integer", "default": "800"}
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
                {"name": "incubation_time_hours", "type": "integer", "default": "48"}
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
                {"name": "compound_range", "type": "string", "required": True}
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
                {"name": "reference_gene", "type": "string", "default": "GAPDH"}
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
                {"name": "inhibitor_concentrations", "type": "array", "required": True}
            ],
            "equipment_required": ["Plate reader", "Multichannel pipettes"],
            "estimated_duration_hours": 4,
            "estimated_cost_min": 200,
            "estimated_cost_max": 600,
        },
    ]

    async with async_session() as session:
        for t in templates:
            existing = await session.execute(
                select(Template).where(Template.id == t["id"])
            )
            if not existing.scalar_one_or_none():
                template = Template(**t)
                session.add(template)
        await session.commit()


# =============================================================================
# Auth Endpoints
# =============================================================================

@app.post("/auth/register", response_model=schemas.UserResponse, tags=["Auth"])
async def register_user(
    user_data: schemas.UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user account."""
    existing = await db.execute(select(User).where(User.email == user_data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    api_key = f"lk_{generate_uuid().replace('-', '')}"
    user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        name=user_data.name,
        organization=user_data.organization,
        api_key_hash=hash_api_key(api_key)
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
        api_key=api_key
    )


@app.post("/auth/token", response_model=schemas.Token, tags=["Auth"])
async def login(
    credentials: schemas.TokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """Get access token with email and password."""
    user = await authenticate_user(db, credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    access_token = create_access_token(
        data={"sub": user.id, "email": user.email, "role": user.role}
    )
    return schemas.Token(access_token=access_token)


# =============================================================================
# Experiments Endpoints
# =============================================================================

@app.post(
    "/experiments",
    response_model=schemas.ExperimentCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Experiments"]
)
async def create_experiment(
    request: schemas.ExperimentRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Submit a new experiment request."""
    spec = request.model_dump(exclude_none=True)

    # Validate
    validation = validate_intake(spec)
    if not validation.valid:
        if "safety_rejected" in validation.safety_flags:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "safety_rejected",
                    "message": "Experiment rejected for safety reasons",
                    "flags": validation.safety_flags
                }
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "validation_failed",
                "message": "Experiment validation failed",
                "validation_errors": [e.model_dump() for e in validation.errors]
            }
        )

    # Estimate cost
    estimate = estimate_cost(spec)

    # Create experiment
    experiment = ExperimentModel(
        requester_id=current_user.id,
        status=DBExperimentStatus.PENDING_REVIEW,
        specification=spec,
        experiment_type=spec.get("experiment_type"),
        estimated_cost_usd=estimate.estimated_cost_usd.typical,
        webhook_url=spec.get("requester_info", {}).get("webhook_url"),
        payment_status=DBPaymentStatus.PENDING
    )
    db.add(experiment)
    await db.commit()
    await db.refresh(experiment)

    # Auto-approve simple experiments (skip review for now)
    experiment.status = DBExperimentStatus.OPEN
    await db.commit()

    return schemas.ExperimentCreatedResponse(
        experiment_id=experiment.id,
        status=schemas.ExperimentStatus(experiment.status.value),
        created_at=experiment.created_at,
        estimated_cost_usd=experiment.estimated_cost_usd,
        estimated_turnaround_days=14,
        links=schemas.ExperimentLinks(
            self=f"/experiments/{experiment.id}",
            results=f"/experiments/{experiment.id}/results",
            cancel=f"/experiments/{experiment.id}"
        )
    )


@app.get("/experiments", response_model=schemas.ExperimentListResponse, tags=["Experiments"])
async def list_experiments(
    status: Optional[str] = None,
    created_after: Optional[datetime] = None,
    created_before: Optional[datetime] = None,
    limit: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = None,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
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
        cursor_row = await db.execute(
            select(ExperimentModel).where(ExperimentModel.id == cursor)
        )
        cursor_exp = cursor_row.scalar_one_or_none()
        if cursor_exp:
            query = query.where(
                or_(
                    ExperimentModel.created_at < cursor_exp.created_at,
                    and_(
                        ExperimentModel.created_at == cursor_exp.created_at,
                        ExperimentModel.id < cursor_exp.id
                    )
                )
            )

    query = query.order_by(
        ExperimentModel.created_at.desc(),
        ExperimentModel.id.desc()
    ).limit(limit + 1)

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
                    completed_experiments=e.operator.completed_experiments
                ) if e.operator else None,
                cost=schemas.CostInfo(
                    estimated_usd=e.estimated_cost_usd,
                    final_usd=e.final_cost_usd,
                    payment_status=schemas.PaymentStatus(e.payment_status.value)
                )
            )
            for e in experiments
        ],
        pagination=schemas.Pagination(
            total=total_count,
            cursor=experiments[-1].id if has_more else None,
            has_more=has_more
        )
    )


@app.get("/experiments/{experiment_id}", response_model=schemas.Experiment, tags=["Experiments"])
async def get_experiment(
    experiment_id: str,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get experiment details."""
    result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
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
            completed_experiments=experiment.operator.completed_experiments
        ) if experiment.operator else None,
        cost=schemas.CostInfo(
            estimated_usd=experiment.estimated_cost_usd,
            final_usd=experiment.final_cost_usd,
            payment_status=schemas.PaymentStatus(experiment.payment_status.value)
        )
    )


@app.patch("/experiments/{experiment_id}", response_model=schemas.Experiment, tags=["Experiments"])
async def update_experiment(
    experiment_id: str,
    update: schemas.ExperimentUpdate,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update experiment (limited fields based on status)."""
    result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
    experiment = result.scalar_one_or_none()

    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if experiment.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Apply updates based on status
    if update.communication_preferences:
        if update.communication_preferences.get("webhook_url"):
            experiment.webhook_url = update.communication_preferences["webhook_url"]
        if update.communication_preferences.get("notification_events"):
            experiment.notification_events = update.communication_preferences["notification_events"]

    if update.constraints and experiment.status in [DBExperimentStatus.DRAFT, DBExperimentStatus.OPEN]:
        spec = experiment.specification.copy()
        if "turnaround_budget" not in spec:
            spec["turnaround_budget"] = {}
        if update.constraints.get("budget_max_usd"):
            new_budget = update.constraints["budget_max_usd"]
            old_budget = spec.get("turnaround_budget", {}).get("budget_max_usd", 0)
            if experiment.status == DBExperimentStatus.OPEN and new_budget < old_budget:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot decrease budget after experiment is open"
                )
            spec["turnaround_budget"]["budget_max_usd"] = new_budget
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
            payment_status=schemas.PaymentStatus(experiment.payment_status.value)
        )
    )


@app.delete("/experiments/{experiment_id}", response_model=schemas.CancelResponse, tags=["Experiments"])
async def cancel_experiment(
    experiment_id: str,
    reason: str = Query(..., max_length=500),
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Cancel an experiment."""
    result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
    experiment = result.scalar_one_or_none()

    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if experiment.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Check if cancellable
    non_cancellable = [DBExperimentStatus.IN_PROGRESS, DBExperimentStatus.COMPLETED, DBExperimentStatus.CANCELLED]
    if experiment.status in non_cancellable:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel experiment in {experiment.status.value} status"
        )

    # Calculate refund
    refund_amount = 0.0
    refund_status = "none"

    if experiment.status in [DBExperimentStatus.DRAFT, DBExperimentStatus.PENDING_REVIEW, DBExperimentStatus.OPEN]:
        refund_amount = experiment.estimated_cost_usd or 0.0
        refund_status = "processed"
    elif experiment.status == DBExperimentStatus.CLAIMED:
        refund_amount = (experiment.estimated_cost_usd or 0.0) * 0.8  # 80% refund
        refund_status = "processed"

    experiment.status = DBExperimentStatus.CANCELLED
    experiment.payment_status = DBPaymentStatus.REFUNDED if refund_amount > 0 else DBPaymentStatus.PENDING
    await db.commit()

    return schemas.CancelResponse(
        experiment_id=experiment.id,
        status="cancelled",
        refund_amount_usd=refund_amount,
        refund_status=refund_status
    )


# =============================================================================
# Results Endpoints
# =============================================================================

@app.get("/experiments/{experiment_id}/results", response_model=schemas.ExperimentResults, tags=["Results"])
async def get_experiment_results(
    experiment_id: str,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get experiment results."""
    result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
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
    return schemas.ExperimentResults(
        experiment_id=experiment.id,
        status=schemas.ExperimentStatus(experiment.status.value),
        hypothesis_supported=results.hypothesis_supported,
        confidence_level=schemas.ConfidenceLevel(results.confidence_level.value) if results.confidence_level else None,
        summary=results.summary,
        structured_data=results.structured_data,
        raw_data_files=results.raw_data_files or [],
        documentation=results.documentation,
        operator_notes=results.notes
    )


@app.post("/experiments/{experiment_id}/approve", response_model=schemas.ApproveResponse, tags=["Results"])
async def approve_results(
    experiment_id: str,
    request: schemas.ApproveRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Approve experiment results and release payment."""
    result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
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
                (current_avg * (total_ratings - 1) + request.rating) / total_ratings
            )

    await db.commit()

    return schemas.ApproveResponse(
        experiment_id=experiment.id,
        status="completed",
        payment_released=True
    )


@app.post("/experiments/{experiment_id}/dispute", response_model=schemas.DisputeResponse, tags=["Results"])
async def dispute_results(
    experiment_id: str,
    request: schemas.DisputeRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Open a dispute for experiment results."""
    result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
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
        evidence_urls=request.evidence_urls
    )
    db.add(dispute)

    experiment.status = DBExperimentStatus.DISPUTED
    await db.commit()
    await db.refresh(dispute)

    return schemas.DisputeResponse(
        dispute_id=dispute.id,
        experiment_id=experiment.id,
        status="disputed"
    )


# =============================================================================
# Validation Endpoints
# =============================================================================

@app.post("/validate", response_model=schemas.ValidationResult, tags=["Validation"])
async def validate_experiment(
    request: schemas.ExperimentRequest,
    current_user: AuthUser = Depends(get_current_user)
):
    """Validate experiment without submitting."""
    spec = request.model_dump(exclude_none=True)
    return validate_intake(spec)


@app.post("/validate/hypothesis", response_model=schemas.ValidationResult, tags=["Validation"])
async def validate_hypothesis(
    request: schemas.HypothesisSection,
    current_user: AuthUser = Depends(get_current_user)
):
    """Validate hypothesis structure only."""
    errors = []
    warnings = []

    if not request.statement:
        errors.append(schemas.ValidationError(
            path="statement",
            code="required_field_missing",
            message="Hypothesis statement is required"
        ))

    if not request.null_hypothesis:
        errors.append(schemas.ValidationError(
            path="null_hypothesis",
            code="required_field_missing",
            message="Null hypothesis is required"
        ))

    if not request.rationale:
        warnings.append(schemas.ValidationError(
            path="rationale",
            code="recommended_field_missing",
            message="Adding rationale improves clarity"
        ))

    return schemas.ValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        safety_flags=[]
    )


@app.post("/estimate", response_model=schemas.CostEstimate, tags=["Validation"])
async def get_estimate(
    request: schemas.ExperimentRequest,
    current_user: AuthUser = Depends(get_current_user)
):
    """Get cost and time estimate without creating experiment."""
    spec = request.model_dump(exclude_none=True)
    return estimate_cost(spec)


# =============================================================================
# Templates Endpoints
# =============================================================================

@app.get("/templates", response_model=schemas.TemplateListResponse, tags=["Templates"])
async def list_templates(
    category: Optional[str] = None,
    bsl_level: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """List available protocol templates."""
    query = select(TemplateModel).where(TemplateModel.is_active == True)

    if category:
        query = query.where(TemplateModel.category == category)
    if bsl_level:
        query = query.where(TemplateModel.bsl_level == bsl_level)
    if search:
        query = query.where(
            TemplateModel.name.ilike(f"%{search}%") |
            TemplateModel.description.ilike(f"%{search}%")
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
                estimated_cost_range=f"${t.estimated_cost_min}-${t.estimated_cost_max}" if t.estimated_cost_min else None
            )
            for t in templates
        ]
    )


@app.get("/templates/{template_id}", response_model=schemas.Template, tags=["Templates"])
async def get_template(
    template_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get template details."""
    result = await db.execute(
        select(TemplateModel).where(TemplateModel.id == template_id)
    )
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    return schemas.Template(
        id=template.id,
        name=template.name,
        description=template.description,
        category=template.category,
        bsl_level=template.bsl_level,
        version=template.version,
        parameters=template.parameters or [],
        equipment_required=template.equipment_required or [],
        typical_materials=template.typical_materials or [],
        estimated_duration_hours=template.estimated_duration_hours,
        estimated_cost_usd={"min": template.estimated_cost_min, "max": template.estimated_cost_max},
        protocol_steps=template.protocol_steps or []
    )


# =============================================================================
# Operator Endpoints
# =============================================================================

@app.get("/operator/jobs", response_model=schemas.JobListResponse, tags=["Operators"])
async def list_available_jobs(
    category: Optional[str] = None,
    min_budget: Optional[float] = None,
    max_budget: Optional[float] = None,
    current_user: AuthUser = Depends(get_current_operator),
    db: AsyncSession = Depends(get_db)
):
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
                title=f"{e.experiment_type} Experiment",
                category=e.experiment_type,
                budget_usd=e.estimated_cost_usd or 0,
                deadline=None,  # TODO: Calculate from turnaround
                bsl_level=e.specification.get("compliance", {}).get("bsl", "BSL1"),
                equipment_required=e.specification.get("custom_protocol", {}).get("equipment_required", []),
                posted_at=e.created_at
            )
            for e in experiments
        ]
    )


@app.post("/operator/jobs/{experiment_id}/claim", response_model=schemas.ClaimResponse, tags=["Operators"])
async def claim_job(
    experiment_id: str,
    request: schemas.ClaimRequest,
    current_user: AuthUser = Depends(get_current_operator),
    db: AsyncSession = Depends(get_db)
):
    """Claim an experiment for execution."""
    if not request.equipment_confirmation or not request.authorization_confirmation:
        raise HTTPException(
            status_code=400,
            detail="Must confirm equipment access and authorization"
        )

    # Get operator profile
    result = await db.execute(
        select(OperatorProfile).where(OperatorProfile.user_id == current_user.id)
    )
    operator = result.scalar_one_or_none()

    if not operator:
        raise HTTPException(status_code=403, detail="Operator profile not found")

    if not operator.is_verified:
        raise HTTPException(status_code=403, detail="Operator not verified")

    # Get experiment
    result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
    experiment = result.scalar_one_or_none()

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
        experiment_id=experiment.id,
        claimed_at=experiment.claimed_at,
        deadline=deadline
    )


@app.post("/operator/jobs/{experiment_id}/submit", response_model=schemas.SubmitResultsResponse, tags=["Operators"])
async def submit_results(
    experiment_id: str,
    request: schemas.ResultSubmission,
    current_user: AuthUser = Depends(get_current_operator),
    db: AsyncSession = Depends(get_db)
):
    """Submit experiment results."""
    # Get operator profile
    result = await db.execute(
        select(OperatorProfile).where(OperatorProfile.user_id == current_user.id)
    )
    operator = result.scalar_one_or_none()

    if not operator:
        raise HTTPException(status_code=403, detail="Operator profile not found")

    # Get experiment
    result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
    experiment = result.scalar_one_or_none()

    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if experiment.operator_id != operator.id:
        raise HTTPException(status_code=403, detail="Not assigned to this experiment")

    if experiment.status not in [DBExperimentStatus.CLAIMED, DBExperimentStatus.IN_PROGRESS]:
        raise HTTPException(status_code=409, detail="Cannot submit results for this experiment")

    # Create results
    exp_result = ExperimentResult(
        experiment_id=experiment.id,
        hypothesis_supported=request.hypothesis_supported,
        confidence_level=DBConfidenceLevel(request.confidence_level.value) if request.confidence_level else None,
        summary=request.summary,
        structured_data={
            "measurements": [m.model_dump() for m in request.measurements],
            "statistics": request.statistics.model_dump() if request.statistics else None
        },
        documentation=request.documentation.model_dump() if request.documentation else None,
        notes=request.notes
    )
    db.add(exp_result)

    experiment.status = DBExperimentStatus.COMPLETED
    experiment.completed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(exp_result)

    return schemas.SubmitResultsResponse(
        experiment_id=experiment.id,
        status="pending_approval",
        submitted_at=exp_result.submitted_at
    )


# =============================================================================
# Webhook Endpoints
# =============================================================================

@app.post("/webhooks/test", response_model=schemas.WebhookTestResponse, tags=["Webhooks"])
async def test_webhook(
    request: schemas.WebhookTestRequest,
    current_user: AuthUser = Depends(get_current_user)
):
    """Send test webhook to verify endpoint configuration."""
    payload = {
        "event": f"experiment.{request.event_type}",
        "experiment_id": "test_" + generate_uuid()[:8],
        "timestamp": datetime.utcnow().isoformat(),
        "data": {
            "test": True,
            "message": "This is a test webhook from Litmus Science"
        }
    }

    try:
        start_time = datetime.utcnow()
        async with httpx.AsyncClient() as client:
            response = await client.post(
                request.url,
                json=payload,
                timeout=10.0
            )
        elapsed = (datetime.utcnow() - start_time).total_seconds() * 1000

        return schemas.WebhookTestResponse(
            success=200 <= response.status_code < 300,
            response_code=response.status_code,
            response_time_ms=int(elapsed)
        )
    except Exception as e:
        return schemas.WebhookTestResponse(
            success=False,
            response_code=None,
            response_time_ms=None
        )


# =============================================================================
# Cloud Lab Endpoints
# =============================================================================

from backend.cloud_labs import (
    get_translator, get_provider, list_providers as get_providers_list,
    PROVIDERS, TranslationError
)
from backend.cloud_labs.registry import (
    translate_intake as do_translate_intake,
    validate_intake_for_provider,
    get_supported_experiment_types,
    get_provider_info,
)
from backend.cloud_labs.models import (
    TranslateRequest, TranslateResponse, TranslationResultResponse,
    ValidateForProviderRequest, ProviderInfoResponse, ProvidersListResponse,
    SupportedTypesResponse, ValidationIssueResponse,
    LLMInterpretRequest, LLMInterpretResponse,
    EdisonTranslateRequest, EdisonTranslateResponse,
)
from backend.services.experiment_interpreter import ExperimentInterpreter, get_experiment_interpreter
from backend.services.edison_integration import EdisonLitmusIntegration, get_edison_litmus_integration
from backend.services.edison_client import EdisonJobType as EdisonJobTypeClient

# Map API job type names to Edison client job types
_EDISON_JOB_TYPE_MAP = {
    "literature": EdisonJobTypeClient.LITERATURE,
    "molecules": EdisonJobTypeClient.MOLECULES,
    "analysis": EdisonJobTypeClient.ANALYSIS,
    "precedent": EdisonJobTypeClient.PRECEDENT,
}
from backend.models import CloudLabSubmission


@app.get("/cloud-labs/providers", response_model=ProvidersListResponse, tags=["Cloud Labs"])
async def list_cloud_lab_providers():
    """List available cloud lab providers and their capabilities."""
    providers = get_providers_list()
    return ProvidersListResponse(
        providers=[
            ProviderInfoResponse(**p)
            for p in providers
        ]
    )


@app.get("/cloud-labs/providers/{provider_id}", response_model=ProviderInfoResponse, tags=["Cloud Labs"])
async def get_cloud_lab_provider(provider_id: str):
    """Get detailed information about a specific cloud lab provider."""
    try:
        info = get_provider_info(provider_id)
        return ProviderInfoResponse(**info)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/cloud-labs/supported-types", response_model=SupportedTypesResponse, tags=["Cloud Labs"])
async def get_supported_types(
    provider: Optional[str] = Query(None, description="Filter by provider (ecl/strateos)")
):
    """Get experiment types supported by cloud lab providers."""
    return SupportedTypesResponse(
        supported_types=get_supported_experiment_types(provider)
    )


@app.post("/cloud-labs/interpret", response_model=LLMInterpretResponse, tags=["Cloud Labs"])
async def interpret_experiment(
    request: LLMInterpretRequest,
    current_user: AuthUser = Depends(get_current_user)
):
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
    request: EdisonTranslateRequest,
    current_user: AuthUser = Depends(get_current_user)
):
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

    # Map the request job type to the client's enum
    job_type = _EDISON_JOB_TYPE_MAP.get(request.job_type.value, EdisonJobTypeClient.MOLECULES)

    # Run the full pipeline: Edison → Hypothesis → Litmus → Cloud Labs
    result = await integration.research_and_translate(
        query=request.query,
        job_type=job_type,
        additional_context=request.context,
        translate_to_cloud_labs=True,
    )

    if not result.success:
        return EdisonTranslateResponse(
            success=False,
            experiment_type=result.experiment_type,
            intake={},
            error=result.error,
        )

    return EdisonTranslateResponse(
        success=True,
        experiment_type=result.experiment_type,
        intake=result.intake,
        translations=result.translations,
        suggestions=result.suggestions,
        warnings=result.warnings,
    )


@app.post("/cloud-labs/translate", response_model=TranslateResponse, tags=["Cloud Labs"])
async def translate_to_cloud_lab(
    request: TranslateRequest,
    current_user: AuthUser = Depends(get_current_user)
):
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
            experiment_type=intake.get("experiment_type", "CUSTOM"),
            title=intake.get("title", "Untitled"),
            hypothesis=intake.get("hypothesis", {}).get("statement", ""),
            notes=intake.get("notes"),
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
                }
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
                errors=[ValidationIssueResponse(
                    path=e.path, code=e.code, message=e.message,
                    severity=e.severity, suggestion=e.suggestion
                ) for e in result.errors],
                warnings=[ValidationIssueResponse(
                    path=w.path, code=w.code, message=w.message,
                    severity=w.severity, suggestion=w.suggestion
                ) for w in result.warnings],
                metadata=result.metadata
            )

        return TranslateResponse(
            translations=translations,
            experiment_type=intake.get("experiment_type", "unknown"),
            title=intake.get("title")
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except TranslationError as e:
        raise HTTPException(status_code=422, detail={
            "code": "translation_error",
            "message": str(e),
            "field_path": e.field_path,
            "suggestion": e.suggestion
        })


@app.post("/cloud-labs/validate", tags=["Cloud Labs"])
async def validate_for_cloud_lab(
    request: ValidateForProviderRequest,
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Validate an intake specification for a specific cloud lab provider.

    Returns validation issues (errors and warnings) specific to the
    target cloud lab's requirements and capabilities.
    """
    try:
        issues = validate_intake_for_provider(request.intake, request.provider)
        errors = [i for i in issues if i.severity == "error"]
        warnings = [i for i in issues if i.severity == "warning"]

        return {
            "valid": len(errors) == 0,
            "provider": request.provider,
            "errors": [ValidationIssueResponse(
                path=e.path, code=e.code, message=e.message,
                severity=e.severity, suggestion=e.suggestion
            ) for e in errors],
            "warnings": [ValidationIssueResponse(
                path=w.path, code=w.code, message=w.message,
                severity=w.severity, suggestion=w.suggestion
            ) for w in warnings]
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/cloud-labs/experiments/{experiment_id}/translate", tags=["Cloud Labs"])
async def translate_experiment(
    experiment_id: str,
    provider: str = Query(..., description="Target provider (ecl/strateos)"),
    save: bool = Query(False, description="Save translation to database"),
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Translate an existing experiment to cloud lab format.

    Fetches the experiment specification and translates it to the
    specified cloud lab's protocol format.
    """
    # Get the experiment
    result = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
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
                status="pending"
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
                    warnings=[ValidationIssueResponse(
                        path=w.path, code=w.code, message=w.message,
                        severity=w.severity, suggestion=w.suggestion
                    ) for w in translation_result.warnings],
                    metadata=translation_result.metadata
                ),
                "saved": True
            }

        return {
            "translation": TranslationResultResponse(
                provider=translation_result.provider,
                format=translation_result.format,
                protocol=translation_result.protocol,
                protocol_readable=translation_result.protocol_readable,
                success=translation_result.success,
                errors=[ValidationIssueResponse(
                    path=e.path, code=e.code, message=e.message,
                    severity=e.severity, suggestion=e.suggestion
                ) for e in translation_result.errors],
                warnings=[ValidationIssueResponse(
                    path=w.path, code=w.code, message=w.message,
                    severity=w.severity, suggestion=w.suggestion
                ) for w in translation_result.warnings],
                metadata=translation_result.metadata
            ),
            "saved": False
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/cloud-labs/submissions", tags=["Cloud Labs"])
async def list_cloud_lab_submissions(
    experiment_id: Optional[str] = None,
    provider: Optional[str] = None,
    status: Optional[str] = None,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List cloud lab submissions for the current user's experiments."""
    # Get user's experiment IDs
    exp_query = select(ExperimentModel.id).where(
        ExperimentModel.requester_id == current_user.id
    )

    query = select(CloudLabSubmission).where(
        CloudLabSubmission.experiment_id.in_(exp_query)
    )

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
                "submitted_at": s.submitted_at,
                "completed_at": s.completed_at,
                "created_at": s.created_at,
            }
            for s in submissions
        ]
    }


@app.get("/cloud-labs/submissions/{submission_id}", tags=["Cloud Labs"])
async def get_cloud_lab_submission(
    submission_id: str,
    include_protocol: bool = Query(False, description="Include full protocol in response"),
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
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

    if not experiment or (experiment.requester_id != current_user.id and current_user.role != "admin"):
        raise HTTPException(status_code=403, detail="Access denied")

    response = {
        "id": submission.id,
        "experiment_id": submission.experiment_id,
        "provider": submission.provider,
        "protocol_format": submission.protocol_format,
        "status": submission.status,
        "provider_submission_id": submission.provider_submission_id,
        "submitted_at": submission.submitted_at,
        "completed_at": submission.completed_at,
        "created_at": submission.created_at,
        "updated_at": submission.updated_at,
    }

    if include_protocol:
        response["translated_protocol"] = submission.translated_protocol

    return response


# =============================================================================
# Health Check
# =============================================================================

@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "1.0.0"}


@app.get("/config", tags=["System"])
async def get_config():
    """Get public configuration for frontend."""
    return {
        "auth_disabled": os.environ.get("LITMUS_AUTH_DISABLED", "").lower() in ("1", "true", "yes"),
        "debug_mode": os.environ.get("LITMUS_DEBUG", "").lower() in ("1", "true", "yes"),
    }


# =============================================================================
# Main
# =============================================================================

def main():
    """Run the API server."""
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )


if __name__ == "__main__":
    main()

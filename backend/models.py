"""
Database models for Litmus Science Backend.
Uses SQLAlchemy with async support.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import JSON, Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from backend.types import JsonArray, JsonObject, JsonValue


class Base(DeclarativeBase):
    pass


def generate_uuid() -> str:
    return str(uuid.uuid4())


class ExperimentStatus(str, PyEnum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    OPEN = "open"
    CLAIMED = "claimed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    DISPUTED = "disputed"
    CANCELLED = "cancelled"


class PaymentStatus(str, PyEnum):
    PENDING = "pending"
    ESCROWED = "escrowed"
    RELEASED = "released"
    REFUNDED = "refunded"


class ConfidenceLevel(str, PyEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INCONCLUSIVE = "inconclusive"


class DisputeReason(str, PyEnum):
    RESULTS_INCOMPLETE = "results_incomplete"
    RESULTS_INCORRECT = "results_incorrect"
    PROTOCOL_NOT_FOLLOWED = "protocol_not_followed"
    DOCUMENTATION_INSUFFICIENT = "documentation_insufficient"
    OTHER = "other"


class HypothesisStatus(str, PyEnum):
    DRAFT = "draft"
    USED = "used"
    ARCHIVED = "archived"


class EdisonRunStatus(str, PyEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class User(Base):
    """User accounts (both requesters and operators)."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str | None] = mapped_column(String)
    organization: Mapped[str | None] = mapped_column(String)
    role: Mapped[str] = mapped_column(String, default="requester")  # requester, operator, admin
    api_key: Mapped[str | None] = mapped_column(String, unique=True, index=True)
    api_key_hash: Mapped[str | None] = mapped_column(String, unique=True, index=True)
    rate_limit_tier: Mapped[str] = mapped_column(
        String, default="standard"
    )  # standard, pro, ai_agent
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    experiments: Mapped[list[Experiment]] = relationship(
        "Experiment", back_populates="requester", foreign_keys="Experiment.requester_id"
    )
    operator_profile: Mapped[OperatorProfile | None] = relationship(
        "OperatorProfile", back_populates="user", uselist=False
    )
    hypotheses: Mapped[list[Hypothesis]] = relationship("Hypothesis", back_populates="user")


class OperatorProfile(Base):
    """Operator capabilities and verification status."""

    __tablename__ = "operator_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), unique=True, nullable=False
    )

    # Verification
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    institution: Mapped[str | None] = mapped_column(String)
    pi_name: Mapped[str | None] = mapped_column(String)
    pi_email: Mapped[str | None] = mapped_column(String)

    # Capabilities
    experiment_types: Mapped[list[str] | None] = mapped_column(
        JSON
    )  # List of supported experiment types
    bsl_level: Mapped[str] = mapped_column(String, default="BSL1")  # BSL1, BSL2
    equipment: Mapped[list[str] | None] = mapped_column(JSON)  # List of available equipment

    # Location & Logistics
    region: Mapped[str | None] = mapped_column(String)
    can_receive_samples: Mapped[bool] = mapped_column(Boolean, default=True)
    shipping_modes: Mapped[list[str] | None] = mapped_column(
        JSON
    )  # List of supported shipping modes

    # Metrics
    reputation_score: Mapped[float] = mapped_column(Float, default=0.0)
    completed_experiments: Mapped[int] = mapped_column(Integer, default=0)
    on_time_rate: Mapped[float] = mapped_column(Float, default=1.0)
    rerun_rate: Mapped[float] = mapped_column(Float, default=0.0)
    average_rating: Mapped[float] = mapped_column(Float, default=0.0)

    # Availability
    weekly_capacity: Mapped[int] = mapped_column(Integer, default=5)
    current_jobs: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user: Mapped[User] = relationship("User", back_populates="operator_profile")
    claimed_experiments: Mapped[list[Experiment]] = relationship(
        "Experiment", back_populates="operator", foreign_keys="Experiment.operator_id"
    )


class Hypothesis(Base):
    """User hypotheses for experiment design."""

    __tablename__ = "hypotheses"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)

    # Core hypothesis
    title: Mapped[str] = mapped_column(String, nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    null_hypothesis: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata
    experiment_type: Mapped[str | None] = mapped_column(String, index=True)
    status: Mapped[HypothesisStatus] = mapped_column(
        Enum(HypothesisStatus), default=HypothesisStatus.DRAFT, index=True
    )

    # Edison integration
    edison_response: Mapped[JsonObject | None] = mapped_column(JSON)
    edison_agent: Mapped[str | None] = mapped_column(String)
    edison_query: Mapped[str | None] = mapped_column(Text)

    # Draft experiment
    intake_draft: Mapped[JsonObject | None] = mapped_column(JSON)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user: Mapped[User] = relationship("User", back_populates="hypotheses")
    experiments: Mapped[list[Experiment]] = relationship(
        "Experiment", back_populates="source_hypothesis"
    )


class EdisonRun(Base):
    """Persisted Edison task runs to allow resume after refresh."""

    __tablename__ = "edison_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)

    query: Mapped[str] = mapped_column(Text, nullable=False)
    job_type: Mapped[str] = mapped_column(String, nullable=False)
    task_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    status: Mapped[EdisonRunStatus] = mapped_column(
        Enum(EdisonRunStatus), default=EdisonRunStatus.PENDING, index=True
    )

    experiment_type: Mapped[str | None] = mapped_column(String)

    additional_context: Mapped[str | None] = mapped_column(Text)
    result: Mapped[JsonObject | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    edited_hypothesis: Mapped[str | None] = mapped_column(Text)
    edited_null_hypothesis: Mapped[str | None] = mapped_column(Text)
    intake_id: Mapped[str | None] = mapped_column(String)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped[User] = relationship("User")


class Experiment(Base):
    """Experiment requests."""

    __tablename__ = "experiments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    requester_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    operator_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("operator_profiles.id"), nullable=True
    )
    hypothesis_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("hypotheses.id"), nullable=True, index=True
    )

    # Status tracking
    status: Mapped[ExperimentStatus] = mapped_column(
        Enum(ExperimentStatus), default=ExperimentStatus.DRAFT
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Specification (full intake JSON)
    specification: Mapped[JsonObject] = mapped_column(JSON, nullable=False)
    experiment_type: Mapped[str | None] = mapped_column(String, index=True)

    # Cost tracking
    estimated_cost_usd: Mapped[float | None] = mapped_column(Float)
    final_cost_usd: Mapped[float | None] = mapped_column(Float)
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus), default=PaymentStatus.PENDING
    )

    # Communication
    webhook_url: Mapped[str | None] = mapped_column(String)
    notification_events: Mapped[JsonObject | JsonArray | None] = mapped_column(JSON)

    # Relationships
    requester: Mapped[User] = relationship(
        "User", back_populates="experiments", foreign_keys=[requester_id]
    )
    operator: Mapped[OperatorProfile | None] = relationship(
        "OperatorProfile", back_populates="claimed_experiments", foreign_keys=[operator_id]
    )
    source_hypothesis: Mapped[Hypothesis | None] = relationship(
        "Hypothesis", back_populates="experiments", foreign_keys=[hypothesis_id]
    )
    results: Mapped[ExperimentResult | None] = relationship(
        "ExperimentResult", back_populates="experiment", uselist=False
    )
    disputes: Mapped[list[Dispute]] = relationship("Dispute", back_populates="experiment")


class ExperimentResult(Base):
    """Experiment results submitted by operators."""

    __tablename__ = "experiment_results"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    experiment_id: Mapped[str] = mapped_column(
        String, ForeignKey("experiments.id"), unique=True, nullable=False
    )

    # Results
    hypothesis_supported: Mapped[bool | None] = mapped_column(Boolean)
    confidence_level: Mapped[ConfidenceLevel | None] = mapped_column(Enum(ConfidenceLevel))
    summary: Mapped[str | None] = mapped_column(Text)
    structured_data: Mapped[JsonObject | None] = mapped_column(JSON)  # measurements, statistics

    # Files
    raw_data_files: Mapped[list[JsonObject] | None] = mapped_column(JSON)  # List of file references
    documentation: Mapped[JsonObject | None] = mapped_column(JSON)  # photos, lab notebook

    # Operator notes
    notes: Mapped[str | None] = mapped_column(Text)

    # Approval
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime)
    rating: Mapped[int | None] = mapped_column(Integer)  # 1-5
    feedback: Mapped[str | None] = mapped_column(Text)

    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    experiment: Mapped[Experiment] = relationship("Experiment", back_populates="results")


class Dispute(Base):
    """Dispute records for contested results."""

    __tablename__ = "disputes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    experiment_id: Mapped[str] = mapped_column(String, ForeignKey("experiments.id"), nullable=False)

    reason: Mapped[DisputeReason] = mapped_column(Enum(DisputeReason), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_urls: Mapped[list[str] | None] = mapped_column(JSON)

    status: Mapped[str] = mapped_column(String, default="open")  # open, under_review, resolved
    resolution: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    experiment: Mapped[Experiment] = relationship("Experiment", back_populates="disputes")


class Template(Base):
    """Protocol templates."""

    __tablename__ = "templates"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String, index=True)
    bsl_level: Mapped[str | None] = mapped_column(String)
    version: Mapped[str | None] = mapped_column(String)

    # Template details
    parameters: Mapped[list[JsonObject] | None] = mapped_column(JSON)
    equipment_required: Mapped[list[str] | None] = mapped_column(JSON)
    typical_materials: Mapped[list[dict[str, str]] | None] = mapped_column(JSON)
    estimated_duration_hours: Mapped[float | None] = mapped_column(Float)
    estimated_cost_min: Mapped[float | None] = mapped_column(Float)
    estimated_cost_max: Mapped[float | None] = mapped_column(Float)
    protocol_steps: Mapped[list[JsonObject] | None] = mapped_column(JSON)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FileUpload(Base):
    """File upload records."""

    __tablename__ = "file_uploads"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String)
    size_bytes: Mapped[int | None] = mapped_column(Integer)

    # Storage
    storage_path: Mapped[str | None] = mapped_column(String)  # S3/GCS path
    upload_url: Mapped[str | None] = mapped_column(String)  # Signed upload URL
    download_url: Mapped[str | None] = mapped_column(String)  # Signed download URL

    # Association
    experiment_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("experiments.id"), nullable=True
    )
    attachment_type: Mapped[str | None] = mapped_column(String)  # SDS, protocol, etc.

    uploaded_by: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"))
    uploaded_at: Mapped[datetime | None] = mapped_column(DateTime)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CloudLabSubmission(Base):
    """Cloud lab submission records for ECL and Strateos."""

    __tablename__ = "cloud_lab_submissions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    experiment_id: Mapped[str] = mapped_column(String, ForeignKey("experiments.id"), nullable=False)

    # Provider info
    provider: Mapped[str] = mapped_column(String, nullable=False)  # "ecl" or "strateos"
    provider_submission_id: Mapped[str | None] = mapped_column(String)  # External ID from cloud lab

    # Protocol
    translated_protocol: Mapped[JsonValue | None] = mapped_column(
        JSON
    )  # The SLL/Autoprotocol output
    protocol_format: Mapped[str | None] = mapped_column(String)  # "sll" or "autoprotocol"

    # Status tracking
    status: Mapped[str] = mapped_column(
        String, default="pending"
    )  # pending, submitted, queued, running, completed, failed, cancelled
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Provider response data
    provider_response: Mapped[JsonObject | None] = mapped_column(JSON)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# Database setup - Use environment variable for production database
DATABASE_URL = os.environ.get("LITMUS_DATABASE_URL", "sqlite+aiosqlite:///./litmus.db")

# Railway provides postgresql:// but SQLAlchemy async needs postgresql+asyncpg://
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Only enable SQL echo in development (never in production - security risk)
_debug_mode = os.environ.get("LITMUS_DEBUG", "").lower() in ("1", "true", "yes")
engine = create_async_engine(DATABASE_URL, echo=_debug_mode)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def init_db() -> None:
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Dependency for getting database session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

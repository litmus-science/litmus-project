"""
Database models for Litmus Science Backend.
Uses SQLAlchemy with async support.
"""

from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text, JSON,
    ForeignKey, Enum, create_engine
)
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, relationship, declarative_base
import uuid

Base = declarative_base()


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


class User(Base):
    """User accounts (both requesters and operators)."""
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    name = Column(String)
    organization = Column(String)
    role = Column(String, default="requester")  # requester, operator, admin
    api_key = Column(String, unique=True, index=True)
    api_key_hash = Column(String, unique=True, index=True)
    rate_limit_tier = Column(String, default="standard")  # standard, pro, ai_agent
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    experiments = relationship("Experiment", back_populates="requester", foreign_keys="Experiment.requester_id")
    operator_profile = relationship("OperatorProfile", back_populates="user", uselist=False)


class OperatorProfile(Base):
    """Operator capabilities and verification status."""
    __tablename__ = "operator_profiles"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), unique=True, nullable=False)

    # Verification
    is_verified = Column(Boolean, default=False)
    institution = Column(String)
    pi_name = Column(String)
    pi_email = Column(String)

    # Capabilities
    experiment_types = Column(JSON)  # List of supported experiment types
    bsl_level = Column(String, default="BSL1")  # BSL1, BSL2
    equipment = Column(JSON)  # List of available equipment

    # Location & Logistics
    region = Column(String)
    can_receive_samples = Column(Boolean, default=True)
    shipping_modes = Column(JSON)  # List of supported shipping modes

    # Metrics
    reputation_score = Column(Float, default=0.0)
    completed_experiments = Column(Integer, default=0)
    on_time_rate = Column(Float, default=1.0)
    rerun_rate = Column(Float, default=0.0)
    average_rating = Column(Float, default=0.0)

    # Availability
    weekly_capacity = Column(Integer, default=5)
    current_jobs = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="operator_profile")
    claimed_experiments = relationship("Experiment", back_populates="operator", foreign_keys="Experiment.operator_id")


class Experiment(Base):
    """Experiment requests."""
    __tablename__ = "experiments"

    id = Column(String, primary_key=True, default=generate_uuid)
    requester_id = Column(String, ForeignKey("users.id"), nullable=False)
    operator_id = Column(String, ForeignKey("operator_profiles.id"), nullable=True)

    # Status tracking
    status = Column(Enum(ExperimentStatus), default=ExperimentStatus.DRAFT)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    claimed_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Specification (full intake JSON)
    specification = Column(JSON, nullable=False)
    experiment_type = Column(String, index=True)

    # Cost tracking
    estimated_cost_usd = Column(Float)
    final_cost_usd = Column(Float)
    payment_status = Column(Enum(PaymentStatus), default=PaymentStatus.PENDING)

    # Communication
    webhook_url = Column(String)
    notification_events = Column(JSON)

    # Relationships
    requester = relationship("User", back_populates="experiments", foreign_keys=[requester_id])
    operator = relationship("OperatorProfile", back_populates="claimed_experiments", foreign_keys=[operator_id])
    results = relationship("ExperimentResult", back_populates="experiment", uselist=False)
    disputes = relationship("Dispute", back_populates="experiment")


class ExperimentResult(Base):
    """Experiment results submitted by operators."""
    __tablename__ = "experiment_results"

    id = Column(String, primary_key=True, default=generate_uuid)
    experiment_id = Column(String, ForeignKey("experiments.id"), unique=True, nullable=False)

    # Results
    hypothesis_supported = Column(Boolean)
    confidence_level = Column(Enum(ConfidenceLevel))
    summary = Column(Text)
    structured_data = Column(JSON)  # measurements, statistics

    # Files
    raw_data_files = Column(JSON)  # List of file references
    documentation = Column(JSON)  # photos, lab notebook

    # Operator notes
    notes = Column(Text)

    # Approval
    is_approved = Column(Boolean, default=False)
    approved_at = Column(DateTime)
    rating = Column(Integer)  # 1-5
    feedback = Column(Text)

    submitted_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    experiment = relationship("Experiment", back_populates="results")


class Dispute(Base):
    """Dispute records for contested results."""
    __tablename__ = "disputes"

    id = Column(String, primary_key=True, default=generate_uuid)
    experiment_id = Column(String, ForeignKey("experiments.id"), nullable=False)

    reason = Column(Enum(DisputeReason), nullable=False)
    description = Column(Text, nullable=False)
    evidence_urls = Column(JSON)

    status = Column(String, default="open")  # open, under_review, resolved
    resolution = Column(Text)
    resolved_at = Column(DateTime)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    experiment = relationship("Experiment", back_populates="disputes")


class Template(Base):
    """Protocol templates."""
    __tablename__ = "templates"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    category = Column(String, index=True)
    bsl_level = Column(String)
    version = Column(String)

    # Template details
    parameters = Column(JSON)
    equipment_required = Column(JSON)
    typical_materials = Column(JSON)
    estimated_duration_hours = Column(Float)
    estimated_cost_min = Column(Float)
    estimated_cost_max = Column(Float)
    protocol_steps = Column(JSON)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FileUpload(Base):
    """File upload records."""
    __tablename__ = "file_uploads"

    id = Column(String, primary_key=True, default=generate_uuid)
    filename = Column(String, nullable=False)
    mime_type = Column(String)
    size_bytes = Column(Integer)

    # Storage
    storage_path = Column(String)  # S3/GCS path
    upload_url = Column(String)  # Signed upload URL
    download_url = Column(String)  # Signed download URL

    # Association
    experiment_id = Column(String, ForeignKey("experiments.id"), nullable=True)
    attachment_type = Column(String)  # SDS, protocol, etc.

    uploaded_by = Column(String, ForeignKey("users.id"))
    uploaded_at = Column(DateTime)
    expires_at = Column(DateTime)

    created_at = Column(DateTime, default=datetime.utcnow)


# Database setup - Use environment variable for production database
import os

DATABASE_URL = os.environ.get(
    "LITMUS_DATABASE_URL",
    "sqlite+aiosqlite:///./litmus.db"
)

# Railway provides postgresql:// but SQLAlchemy async needs postgresql+asyncpg://
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Only enable SQL echo in development (never in production - security risk)
_debug_mode = os.environ.get("LITMUS_DEBUG", "").lower() in ("1", "true", "yes")
engine = create_async_engine(DATABASE_URL, echo=_debug_mode)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
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

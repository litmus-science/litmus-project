"""
Pydantic schemas for cloud lab API requests and responses.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class CloudLabProvider(str, Enum):
    """Supported cloud lab providers."""
    ECL = "ecl"
    STRATEOS = "strateos"


class SubmissionStatus(str, Enum):
    """Status of a cloud lab submission."""
    PENDING = "pending"
    SUBMITTED = "submitted"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# Request schemas

class TranslateRequest(BaseModel):
    """Request to translate an intake to cloud lab format."""
    intake: Dict[str, Any] = Field(..., description="The Litmus experiment intake specification")
    provider: Optional[str] = Field(None, description="Target provider (ecl/strateos), or null for all compatible")


class ValidateForProviderRequest(BaseModel):
    """Request to validate an intake for a specific provider."""
    intake: Dict[str, Any]
    provider: str


class SubmitToCloudLabRequest(BaseModel):
    """Request to submit an experiment to a cloud lab."""
    experiment_id: str = Field(..., description="Litmus experiment ID")
    provider: str = Field(..., description="Target cloud lab provider")
    credentials: Optional[Dict[str, str]] = Field(None, description="Provider credentials (if not stored)")
    auto_submit: bool = Field(False, description="Automatically submit after translation")


# Response schemas

class ValidationIssueResponse(BaseModel):
    """A validation issue (error or warning)."""
    path: str
    code: str
    message: str
    severity: str = "error"
    suggestion: Optional[str] = None


class TranslationResultResponse(BaseModel):
    """Result of translating an intake to cloud lab format."""
    provider: str
    format: str
    protocol: Optional[Any] = None
    protocol_readable: str
    success: bool
    errors: List[ValidationIssueResponse] = []
    warnings: List[ValidationIssueResponse] = []
    metadata: Dict[str, Any] = {}


class TranslateResponse(BaseModel):
    """Response containing translation results for one or more providers."""
    translations: Dict[str, TranslationResultResponse]
    experiment_type: str
    title: Optional[str] = None


class ProviderInfoResponse(BaseModel):
    """Information about a cloud lab provider."""
    id: str
    name: str
    short_name: str
    protocol_format: str
    protocol_format_name: str
    description: str
    website: str
    documentation: str
    capabilities: List[str]
    bsl_levels: List[str]
    credential_fields: List[str]
    api_status: str


class ProvidersListResponse(BaseModel):
    """List of available cloud lab providers."""
    providers: List[ProviderInfoResponse]


class SupportedTypesResponse(BaseModel):
    """Supported experiment types by provider."""
    supported_types: Dict[str, List[str]]


class SubmissionResponse(BaseModel):
    """Response from submitting an experiment to a cloud lab."""
    success: bool
    submission_id: Optional[str] = None
    provider_experiment_id: Optional[str] = None
    status: SubmissionStatus = SubmissionStatus.PENDING
    estimated_completion: Optional[datetime] = None
    message: Optional[str] = None
    translated_protocol: Optional[Any] = None


class SubmissionStatusResponse(BaseModel):
    """Status of a cloud lab submission."""
    submission_id: str
    status: SubmissionStatus
    progress_percent: Optional[float] = None
    current_step: Optional[str] = None
    started_at: Optional[datetime] = None
    estimated_completion: Optional[datetime] = None
    error_message: Optional[str] = None


class SubmissionResultsResponse(BaseModel):
    """Results from a completed cloud lab submission."""
    submission_id: str
    status: SubmissionStatus
    completed_at: Optional[datetime] = None
    raw_data_urls: List[str] = []
    processed_data: Dict[str, Any] = {}
    metadata: Dict[str, Any] = {}


# Database model schema (for storing submissions)

class CloudLabSubmissionCreate(BaseModel):
    """Schema for creating a cloud lab submission record."""
    experiment_id: str
    provider: str
    translated_protocol: Any


class CloudLabSubmissionResponse(BaseModel):
    """Schema for cloud lab submission response."""
    id: str
    experiment_id: str
    provider: str
    provider_submission_id: Optional[str] = None
    status: SubmissionStatus
    translated_protocol: Optional[Any] = None
    submitted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

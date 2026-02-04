"""
Pydantic schemas for cloud lab API requests and responses.
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from backend.models import EdisonRunStatus
from backend.services.edison_types import (
    EdisonEvidence,
    EdisonPaperResult,
    EdisonPlanStep,
    EdisonReasoningTrace,
)
from backend.types import JsonObject, JsonValue


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


class EdisonJobType(str, Enum):
    """Edison Scientific job types."""

    LITERATURE = "literature"
    MOLECULES = "molecules"
    ANALYSIS = "analysis"
    PRECEDENT = "precedent"


# Edison Reasoning Trace schemas for streaming UI
class EdisonPlanStepResponse(EdisonPlanStep):
    """A step in Edison's execution plan."""


class EdisonPaperResultResponse(EdisonPaperResult):
    """A paper found during literature search."""


class EdisonEvidenceResponse(EdisonEvidence):
    """Evidence gathered from a paper."""


class EdisonReasoningTraceResponse(EdisonReasoningTrace):
    """Full reasoning trace from Edison's execution for streaming UI."""


# Request schemas


class TranslateRequest(BaseModel):
    """Request to translate an intake to cloud lab format."""

    intake: JsonObject = Field(..., description="The Litmus experiment intake specification")
    provider: str | None = Field(
        None, description="Target provider (ecl/strateos), or null for all compatible"
    )
    use_llm: bool = Field(
        False, description="Use LLM to interpret and enrich the intake before translation"
    )


class LLMInterpretRequest(BaseModel):
    """Request to interpret an experiment using LLM."""

    experiment_type: str = Field(..., description="Type of experiment (e.g., QPCR_EXPRESSION)")
    title: str = Field(..., description="Experiment title")
    hypothesis: str = Field(..., description="Hypothesis statement")
    notes: str | None = Field(None, description="Additional notes from user")
    existing_intake: JsonObject | None = Field(None, description="Existing intake data to enhance")


class LLMInterpretResponse(BaseModel):
    """Response from LLM interpretation."""

    success: bool
    enriched_intake: JsonObject
    suggestions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    error: str | None = None


class EdisonTranslateRequest(BaseModel):
    """Request to translate an Edison query to cloud lab protocol."""

    query: str = Field(..., description="The Edison-style query (e.g., synthesis planning request)")
    job_type: EdisonJobType = Field(
        EdisonJobType.MOLECULES,
        description="Edison job type: molecules, analysis, literature, precedent",
    )
    context: str | None = Field(None, description="Additional context about the experiment")
    provider: str | None = Field(
        None, description="Target provider (ecl/strateos), or null for all"
    )


class EdisonTranslateResponse(BaseModel):
    """Response from Edison query translation."""

    success: bool
    experiment_type: str
    intake: JsonObject
    translations: JsonObject | None = None
    suggestions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None


class EdisonRunStartResponse(BaseModel):
    """Response from starting an Edison run."""

    run_id: str
    status: EdisonRunStatus
    intake_id: str


class EdisonRunDraft(BaseModel):
    """Draft edits for an Edison run."""

    hypothesis: str | None = None
    null_hypothesis: str | None = None
    intake_id: str | None = None


class EdisonRunStatusResponse(BaseModel):
    """Status response for a persisted Edison run."""

    run_id: str
    status: EdisonRunStatus
    result: EdisonTranslateResponse | None = None
    error: str | None = None
    reasoning_trace: EdisonReasoningTraceResponse | None = None
    draft: EdisonRunDraft | None = None


class EdisonRunSummary(BaseModel):
    """Summary of an active Edison run."""

    run_id: str
    status: EdisonRunStatus
    query: str
    job_type: EdisonJobType
    started_at: datetime
    reasoning_trace: EdisonReasoningTraceResponse | None = None
    experiment_type: str | None = None
    draft: EdisonRunDraft | None = None


class EdisonRunDraftUpdateRequest(BaseModel):
    """Request to update draft edits for an Edison run."""

    hypothesis: str | None = None
    null_hypothesis: str | None = None


class EdisonRunListResponse(BaseModel):
    """List response for Edison runs."""

    runs: list[EdisonRunSummary]


class EdisonClearHistoryResponse(BaseModel):
    """Response for clearing Edison run history."""

    success: bool
    cleared: int


class ValidateForProviderRequest(BaseModel):
    """Request to validate an intake for a specific provider."""

    intake: JsonObject
    provider: str


class SubmitToCloudLabRequest(BaseModel):
    """Request to submit an experiment to a cloud lab."""

    experiment_id: str = Field(..., description="Litmus experiment ID")
    provider: str = Field(..., description="Target cloud lab provider")
    credentials: dict[str, str] | None = Field(
        None, description="Provider credentials (if not stored)"
    )
    auto_submit: bool = Field(False, description="Automatically submit after translation")


# Response schemas


class ValidationIssueResponse(BaseModel):
    """A validation issue (error or warning)."""

    path: str
    code: str
    message: str
    severity: str = "error"
    suggestion: str | None = None


class TranslationResultResponse(BaseModel):
    """Result of translating an intake to cloud lab format."""

    provider: str
    format: str
    protocol: JsonValue | None = None
    protocol_readable: str
    success: bool
    errors: list[ValidationIssueResponse] = Field(default_factory=list)
    warnings: list[ValidationIssueResponse] = Field(default_factory=list)
    metadata: JsonObject = Field(default_factory=dict)


class TranslateResponse(BaseModel):
    """Response containing translation results for one or more providers."""

    translations: dict[str, TranslationResultResponse]
    experiment_type: str
    title: str | None = None


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
    capabilities: list[str]
    bsl_levels: list[str]
    credential_fields: list[str]
    api_status: str


class ProvidersListResponse(BaseModel):
    """List of available cloud lab providers."""

    providers: list[ProviderInfoResponse]


class SupportedTypesResponse(BaseModel):
    """Supported experiment types by provider."""

    supported_types: dict[str, list[str]]


class SubmissionResponse(BaseModel):
    """Response from submitting an experiment to a cloud lab."""

    success: bool
    submission_id: str | None = None
    provider_experiment_id: str | None = None
    status: SubmissionStatus = SubmissionStatus.PENDING
    estimated_completion: datetime | None = None
    message: str | None = None
    translated_protocol: JsonValue | None = None


class SubmissionStatusResponse(BaseModel):
    """Status of a cloud lab submission."""

    submission_id: str
    status: SubmissionStatus
    progress_percent: float | None = None
    current_step: str | None = None
    started_at: datetime | None = None
    estimated_completion: datetime | None = None
    error_message: str | None = None


class SubmissionResultsResponse(BaseModel):
    """Results from a completed cloud lab submission."""

    submission_id: str
    status: SubmissionStatus
    completed_at: datetime | None = None
    raw_data_urls: list[str] = Field(default_factory=list)
    processed_data: JsonObject = Field(default_factory=dict)
    metadata: JsonObject = Field(default_factory=dict)


# Database model schema (for storing submissions)


class CloudLabSubmissionCreate(BaseModel):
    """Schema for creating a cloud lab submission record."""

    experiment_id: str
    provider: str
    translated_protocol: JsonValue


class CloudLabSubmissionResponse(BaseModel):
    """Schema for cloud lab submission response."""

    id: str
    experiment_id: str
    provider: str
    provider_submission_id: str | None = None
    status: SubmissionStatus
    translated_protocol: JsonValue | None = None
    submitted_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

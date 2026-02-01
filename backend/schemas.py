"""
Pydantic schemas for API request/response models.
"""

from datetime import datetime, date
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, EmailStr
from enum import Enum

# JSON type for arbitrary JSON data (opaque blobs not requiring deep validation)
# Using object as the value type allows nested structures without recursive type issues
JsonDict = Dict[str, object]


# Enums
class ExperimentStatus(str, Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    OPEN = "open"
    CLAIMED = "claimed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    DISPUTED = "disputed"
    CANCELLED = "cancelled"


class PaymentStatus(str, Enum):
    PENDING = "pending"
    ESCROWED = "escrowed"
    RELEASED = "released"
    REFUNDED = "refunded"


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INCONCLUSIVE = "inconclusive"


class DisputeReason(str, Enum):
    RESULTS_INCOMPLETE = "results_incomplete"
    RESULTS_INCORRECT = "results_incorrect"
    PROTOCOL_NOT_FOLLOWED = "protocol_not_followed"
    DOCUMENTATION_INSUFFICIENT = "documentation_insufficient"
    OTHER = "other"


class BSLLevel(str, Enum):
    BSL1 = "BSL1"
    BSL2 = "BSL2"


class TemplateCategory(str, Enum):
    BIOCHEMISTRY = "biochemistry"
    MICROBIOLOGY = "microbiology"
    CELL_BIOLOGY = "cell_biology"
    MOLECULAR_BIOLOGY = "molecular_biology"
    ANALYTICAL = "analytical"


# Auth schemas
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenRequest(BaseModel):
    email: EmailStr
    password: str


class TokenData(BaseModel):
    user_id: str
    email: str
    role: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    organization: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str]
    organization: Optional[str]
    role: str
    rate_limit_tier: str
    created_at: datetime
    api_key: Optional[str] = None

    class Config:
        from_attributes = True


# Experiment schemas
class ExperimentRequest(BaseModel):
    """Full experiment specification (matches experiment_intake.json schema)."""
    # Required fields
    experiment_type: str
    title: Optional[str] = None
    hypothesis: Optional[Dict[str, Any]] = None
    compliance: Optional[Dict[str, Any]] = None
    turnaround_budget: Optional[Dict[str, Any]] = None
    deliverables: Optional[Dict[str, Any]] = None

    # Optional common fields
    metadata: Optional[Dict[str, Any]] = None
    privacy: Optional[str] = "open"
    materials_provided: Optional[List[Dict[str, Any]]] = None
    replicates: Optional[Dict[str, Any]] = None
    acceptance_criteria: Optional[Dict[str, Any]] = None
    communication_preferences: Optional[Dict[str, Any]] = None

    # Experiment-type specific sections (names match JSON schema exactly)
    sanger: Optional[Dict[str, Any]] = None
    qpcr: Optional[Dict[str, Any]] = None
    cell_viability: Optional[Dict[str, Any]] = None
    enzyme_inhibition: Optional[Dict[str, Any]] = None
    microbial_growth: Optional[Dict[str, Any]] = None
    mic_mbc: Optional[Dict[str, Any]] = None
    zone_of_inhibition: Optional[Dict[str, Any]] = None
    custom_protocol: Optional[Dict[str, Any]] = None


class ExperimentLinks(BaseModel):
    self: str
    results: str
    cancel: str


class ExperimentCreatedResponse(BaseModel):
    experiment_id: str
    status: ExperimentStatus
    created_at: datetime
    estimated_cost_usd: Optional[float] = None
    estimated_turnaround_days: Optional[int] = None
    links: ExperimentLinks


class OperatorInfo(BaseModel):
    id: str
    reputation_score: float
    completed_experiments: int


class CostInfo(BaseModel):
    estimated_usd: Optional[float] = None
    final_usd: Optional[float] = None
    payment_status: PaymentStatus


class Experiment(BaseModel):
    id: str
    status: ExperimentStatus
    created_at: datetime
    updated_at: datetime
    claimed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    specification: Dict[str, Any]
    operator: Optional[OperatorInfo] = None
    cost: CostInfo

    class Config:
        from_attributes = True


class ExperimentUpdate(BaseModel):
    """Allowed updates to an experiment."""
    constraints: Optional[Dict[str, Any]] = None
    communication_preferences: Optional[Dict[str, Any]] = None


class Pagination(BaseModel):
    total: int
    cursor: Optional[str] = None
    has_more: bool


class ExperimentListResponse(BaseModel):
    experiments: List[Experiment]
    pagination: Pagination


class CancelResponse(BaseModel):
    experiment_id: str
    status: str = "cancelled"
    refund_amount_usd: Optional[float] = None
    refund_status: str


# Results schemas
class Measurement(BaseModel):
    metric: str
    value: float
    unit: Optional[str] = None
    condition: Optional[str] = None
    replicate: Optional[int] = None


class Statistics(BaseModel):
    test_used: Optional[str] = None
    p_value: Optional[float] = None
    effect_size: Optional[float] = None
    confidence_interval: Optional[Dict[str, float]] = None


class StructuredData(BaseModel):
    measurements: List[Measurement] = []
    statistics: Optional[Statistics] = None


class RawDataFile(BaseModel):
    name: str
    format: Optional[str] = None
    url: str
    checksum_sha256: Optional[str] = None


class Photo(BaseModel):
    step: int
    url: str
    timestamp: Optional[datetime] = None


class Documentation(BaseModel):
    photos: List[Photo] = []
    lab_notebook_url: Optional[str] = None


class ExperimentResults(BaseModel):
    experiment_id: str
    status: ExperimentStatus
    hypothesis_supported: Optional[bool] = None
    confidence_level: Optional[ConfidenceLevel] = None
    summary: Optional[str] = None
    structured_data: Optional[StructuredData] = None
    raw_data_files: List[RawDataFile] = []
    documentation: Optional[Documentation] = None
    operator_notes: Optional[str] = None


class ApproveRequest(BaseModel):
    rating: Optional[int] = Field(None, ge=1, le=5)
    feedback: Optional[str] = Field(None, max_length=2000)


class ApproveResponse(BaseModel):
    experiment_id: str
    status: str = "completed"
    payment_released: bool


class DisputeRequest(BaseModel):
    reason: DisputeReason
    description: str = Field(..., min_length=50, max_length=5000)
    evidence_urls: Optional[List[str]] = None


class DisputeResponse(BaseModel):
    dispute_id: str
    experiment_id: str
    status: str = "disputed"


# Validation schemas
class ValidationError(BaseModel):
    path: str
    code: str
    message: str
    suggestion: Optional[str] = None


class ValidationResult(BaseModel):
    valid: bool
    errors: List[ValidationError] = []
    warnings: List[ValidationError] = []
    safety_flags: List[str] = []


class HypothesisSection(BaseModel):
    statement: str
    null_hypothesis: str
    rationale: Optional[str] = None
    variables: Optional[Dict[str, Any]] = None


# Estimate schemas
class CostRange(BaseModel):
    low: float
    typical: float
    high: float


class TurnaroundEstimate(BaseModel):
    standard: int
    expedited: Optional[int] = None


class CostBreakdown(BaseModel):
    materials: float
    labor: float
    equipment: float
    platform_fee: float
    privacy_premium: float = 0.0


class CostEstimate(BaseModel):
    estimated_cost_usd: CostRange
    estimated_turnaround_days: TurnaroundEstimate
    cost_breakdown: CostBreakdown
    operator_availability: str  # high, medium, low, none


# Template schemas
class TemplateParameter(BaseModel):
    name: str
    type: str
    required: bool = False
    default: Optional[str] = None
    description: Optional[str] = None
    constraints: Optional[Dict[str, Any]] = None


class TemplateListItem(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    category: str
    bsl_level: str
    estimated_cost_range: Optional[str] = None


class Template(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    category: str
    bsl_level: str
    version: str
    parameters: List[TemplateParameter] = []
    equipment_required: List[str] = []
    typical_materials: List[Dict[str, str]] = []
    estimated_duration_hours: Optional[float] = None
    estimated_cost_usd: Optional[Dict[str, float]] = None
    protocol_steps: List[Dict[str, Any]] = []


class TemplateListResponse(BaseModel):
    templates: List[TemplateListItem]


# Operator schemas
class JobListItem(BaseModel):
    experiment_id: str
    title: str
    category: str
    budget_usd: float
    deadline: Optional[date] = None
    bsl_level: str
    equipment_required: List[str] = []
    posted_at: datetime


class JobListResponse(BaseModel):
    jobs: List[JobListItem]


class ClaimRequest(BaseModel):
    equipment_confirmation: bool
    authorization_confirmation: bool
    estimated_start_date: date
    notes: Optional[str] = Field(None, max_length=1000)


class ClaimResponse(BaseModel):
    experiment_id: str
    claimed_at: datetime
    deadline: datetime


class PhotoSubmission(BaseModel):
    step: int
    image_base64: str
    timestamp: Optional[datetime] = None
    caption: Optional[str] = None


class DocumentationSubmission(BaseModel):
    photos: List[PhotoSubmission]
    lab_notebook_base64: Optional[str] = None


class RawDataUpload(BaseModel):
    name: str
    format: Optional[str] = None
    content_base64: str


class ResultSubmission(BaseModel):
    hypothesis_supported: bool
    confidence_level: Optional[ConfidenceLevel] = None
    summary: Optional[str] = Field(None, max_length=5000)
    measurements: List[Measurement]
    statistics: Optional[Statistics] = None
    raw_data_uploads: Optional[List[RawDataUpload]] = None
    documentation: DocumentationSubmission
    notes: Optional[str] = Field(None, max_length=5000)


class SubmitResultsResponse(BaseModel):
    experiment_id: str
    status: str = "pending_approval"
    submitted_at: datetime


# Webhook schemas
class WebhookTestRequest(BaseModel):
    url: str
    event_type: str = "completed"


class WebhookTestResponse(BaseModel):
    success: bool
    response_code: Optional[int] = None
    response_time_ms: Optional[int] = None


# Error schemas
class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class ValidationErrorDetail(BaseModel):
    code: str = "validation_failed"
    message: str
    validation_errors: List[ValidationError]


class ValidationErrorResponse(BaseModel):
    error: ValidationErrorDetail


class SafetyRejectionDetail(BaseModel):
    code: str = "safety_rejected"
    message: str
    flags: List[str]
    appeal_available: bool = True
    appeal_url: Optional[str] = None


class SafetyRejectionResponse(BaseModel):
    error: SafetyRejectionDetail


# Hypothesis schemas
class HypothesisCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    statement: str = Field(..., min_length=1, max_length=2000)
    null_hypothesis: Optional[str] = Field(None, max_length=2000)
    experiment_type: str
    edison_agent: Optional[str] = None
    edison_query: Optional[str] = None
    edison_response: Optional[JsonDict] = None
    intake_draft: Optional[JsonDict] = None


class HypothesisUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    statement: Optional[str] = Field(None, min_length=1, max_length=2000)
    null_hypothesis: Optional[str] = Field(None, max_length=2000)
    experiment_type: Optional[str] = None
    edison_agent: Optional[str] = None
    edison_query: Optional[str] = None
    edison_response: Optional[JsonDict] = None
    intake_draft: Optional[JsonDict] = None


class HypothesisResponse(BaseModel):
    id: str
    user_id: str
    title: str
    statement: str
    null_hypothesis: Optional[str]
    experiment_type: str
    edison_agent: Optional[str]
    edison_query: Optional[str]
    edison_response: Optional[JsonDict]
    intake_draft: Optional[JsonDict]
    experiments_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class HypothesisListItem(BaseModel):
    id: str
    title: str
    statement: str
    experiment_type: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class HypothesisListResponse(BaseModel):
    hypotheses: List[HypothesisListItem]
    pagination: Pagination


class HypothesisToExperimentRequest(BaseModel):
    budget_max_usd: Optional[float] = Field(None, gt=0)
    bsl_level: Optional[BSLLevel] = None
    privacy: Optional[str] = Field(None, pattern="^(open|private)$")
    title_override: Optional[str] = Field(None, min_length=1, max_length=500)

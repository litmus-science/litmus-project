"""
Pydantic schemas for API request/response models.
"""

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, EmailStr, Field, field_validator

from backend.models import HypothesisStatus
from backend.services.experiment_types import EXPERIMENT_TYPE_FIELD_MAP
from backend.types import JsonObject

JsonDict = JsonObject

_ALLOWED_EXPERIMENT_TYPES = set(EXPERIMENT_TYPE_FIELD_MAP.keys())


def _validate_experiment_type(value: str) -> str:
    if value not in _ALLOWED_EXPERIMENT_TYPES:
        allowed = ", ".join(sorted(_ALLOWED_EXPERIMENT_TYPES))
        raise ValueError(f"Invalid experiment_type. Allowed: {allowed}")
    return value


# Enums
class ExperimentStatus(str, Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    OPEN = "open"
    DESIGN_FINALIZED = "design_finalized"
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
    name: str | None = None
    organization: str | None = None


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None
    organization: str | None
    role: str
    rate_limit_tier: str
    created_at: datetime
    api_key: str | None = None

    class Config:
        from_attributes = True


# Experiment schemas
class ExperimentRequest(BaseModel):
    """Full experiment specification (matches experiment_intake.json schema)."""

    # Required fields
    experiment_type: str
    title: str | None = None
    hypothesis: JsonObject | None = None
    compliance: JsonObject | None = None
    turnaround_budget: JsonObject | None = None
    deliverables: JsonObject | None = None

    # Optional common fields
    metadata: JsonObject | None = None
    privacy: str | None = "open"
    materials_provided: list[JsonObject] | None = None
    replicates: JsonObject | None = None
    acceptance_criteria: JsonObject | None = None
    communication_preferences: JsonObject | None = None

    # Experiment-type specific sections (names match JSON schema exactly)
    sanger: JsonObject | None = None
    qpcr: JsonObject | None = None
    cell_viability: JsonObject | None = None
    enzyme_inhibition: JsonObject | None = None
    microbial_growth: JsonObject | None = None
    mic_mbc: JsonObject | None = None
    zone_of_inhibition: JsonObject | None = None
    custom_protocol: JsonObject | None = None


class ExperimentLinks(BaseModel):
    self: str
    results: str
    cancel: str


class ExperimentCreatedResponse(BaseModel):
    experiment_id: str
    status: ExperimentStatus
    created_at: datetime
    estimated_cost_usd: float | None = None
    estimated_turnaround_days: int | None = None
    links: ExperimentLinks


class OperatorInfo(BaseModel):
    id: str
    reputation_score: float
    completed_experiments: int


class CostInfo(BaseModel):
    estimated_usd: float | None = None
    final_usd: float | None = None
    payment_status: PaymentStatus


class Experiment(BaseModel):
    id: str
    status: ExperimentStatus
    created_at: datetime
    updated_at: datetime
    claimed_at: datetime | None = None
    completed_at: datetime | None = None
    specification: JsonObject
    operator: OperatorInfo | None = None
    cost: CostInfo

    class Config:
        from_attributes = True


class ExperimentUpdate(BaseModel):
    """Allowed updates to an experiment."""

    constraints: JsonObject | None = None
    communication_preferences: JsonObject | None = None


class Pagination(BaseModel):
    total: int
    cursor: str | None = None
    has_more: bool


class ExperimentListResponse(BaseModel):
    experiments: list[Experiment]
    pagination: Pagination


class CancelResponse(BaseModel):
    experiment_id: str
    status: str = "cancelled"
    refund_amount_usd: float | None = None
    refund_status: str


# Results schemas
class Measurement(BaseModel):
    metric: str
    value: float
    unit: str | None = None
    condition: str | None = None
    replicate: int | None = None


class Statistics(BaseModel):
    test_used: str | None = None
    p_value: float | None = None
    effect_size: float | None = None
    confidence_interval: dict[str, float] | None = None


class StructuredData(BaseModel):
    measurements: list[Measurement] = Field(default_factory=list)
    statistics: Statistics | None = None


class RawDataFile(BaseModel):
    name: str
    format: str | None = None
    url: str
    checksum_sha256: str | None = None


class Photo(BaseModel):
    step: int
    url: str
    timestamp: datetime | None = None


class Documentation(BaseModel):
    photos: list[Photo] = []
    lab_notebook_url: str | None = None


class ExperimentResults(BaseModel):
    experiment_id: str
    status: ExperimentStatus
    hypothesis_supported: bool | None = None
    confidence_level: ConfidenceLevel | None = None
    summary: str | None = None
    structured_data: StructuredData | None = None
    raw_data_files: list[RawDataFile] = []
    documentation: Documentation | None = None
    operator_notes: str | None = None


class ApproveRequest(BaseModel):
    rating: int | None = Field(None, ge=1, le=5)
    feedback: str | None = Field(None, max_length=2000)


class ApproveResponse(BaseModel):
    experiment_id: str
    status: str = "completed"
    payment_released: bool


class DisputeRequest(BaseModel):
    reason: DisputeReason
    description: str = Field(..., min_length=50, max_length=5000)
    evidence_urls: list[str] | None = None


class DisputeResponse(BaseModel):
    dispute_id: str
    experiment_id: str
    status: str = "disputed"


# Validation schemas
class ValidationError(BaseModel):
    path: str
    code: str
    message: str
    suggestion: str | None = None


class ValidationResult(BaseModel):
    valid: bool
    errors: list[ValidationError] = []
    warnings: list[ValidationError] = []
    safety_flags: list[str] = []


class HypothesisSection(BaseModel):
    statement: str
    null_hypothesis: str
    rationale: str | None = None
    variables: JsonObject | None = None


# Estimate schemas
class CostRange(BaseModel):
    low: float
    typical: float
    high: float


class TurnaroundEstimate(BaseModel):
    standard: int
    expedited: int | None = None


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
    default: str | None = None
    description: str | None = None
    constraints: JsonObject | None = None


class TemplateListItem(BaseModel):
    id: str
    name: str
    description: str | None = None
    category: str | None = None
    bsl_level: str | None = None
    estimated_cost_range: str | None = None


class Template(BaseModel):
    id: str
    name: str
    description: str | None = None
    category: str | None = None
    bsl_level: str | None = None
    version: str | None = None
    parameters: list[TemplateParameter] = Field(default_factory=list)
    equipment_required: list[str] = Field(default_factory=list)
    typical_materials: list[dict[str, str]] = Field(default_factory=list)
    estimated_duration_hours: float | None = None
    estimated_cost_usd: dict[str, float] | None = None
    protocol_steps: list[JsonObject] = Field(default_factory=list)


class TemplateListResponse(BaseModel):
    templates: list[TemplateListItem]


# Operator schemas
class JobListItem(BaseModel):
    experiment_id: str
    title: str
    category: str
    budget_usd: float
    deadline: date | None = None
    bsl_level: str
    equipment_required: list[str] = []
    posted_at: datetime


class JobListResponse(BaseModel):
    jobs: list[JobListItem]


class ClaimRequest(BaseModel):
    equipment_confirmation: bool
    authorization_confirmation: bool
    estimated_start_date: date
    notes: str | None = Field(None, max_length=1000)


class ClaimResponse(BaseModel):
    experiment_id: str
    claimed_at: datetime
    deadline: datetime


class PhotoSubmission(BaseModel):
    step: int
    image_base64: str
    timestamp: datetime | None = None
    caption: str | None = None


class DocumentationSubmission(BaseModel):
    photos: list[PhotoSubmission]
    lab_notebook_base64: str | None = None


class RawDataUpload(BaseModel):
    name: str
    format: str | None = None
    content_base64: str


class ResultSubmission(BaseModel):
    hypothesis_supported: bool
    confidence_level: ConfidenceLevel | None = None
    summary: str | None = Field(None, max_length=5000)
    measurements: list[Measurement]
    statistics: Statistics | None = None
    raw_data_uploads: list[RawDataUpload] | None = None
    documentation: DocumentationSubmission
    notes: str | None = Field(None, max_length=5000)


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
    response_code: int | None = None
    response_time_ms: int | None = None


# Error schemas
class ErrorDetail(BaseModel):
    code: str
    message: str
    details: JsonObject | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class ValidationErrorDetail(BaseModel):
    code: str = "validation_failed"
    message: str
    validation_errors: list[ValidationError]


class ValidationErrorResponse(BaseModel):
    error: ValidationErrorDetail


class SafetyRejectionDetail(BaseModel):
    code: str = "safety_rejected"
    message: str
    flags: list[str]
    appeal_available: bool = True
    appeal_url: str | None = None


class SafetyRejectionResponse(BaseModel):
    error: SafetyRejectionDetail


# Hypothesis schemas
class HypothesisCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    statement: str = Field(..., min_length=1, max_length=2000)
    null_hypothesis: str | None = Field(None, max_length=2000)
    experiment_type: str
    edison_agent: str | None = None
    edison_query: str | None = None
    edison_response: JsonDict | None = None
    intake_draft: JsonDict | None = None

    @field_validator("experiment_type")
    @classmethod
    def validate_experiment_type(cls, value: str) -> str:
        return _validate_experiment_type(value)


class HypothesisUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    statement: str | None = Field(None, min_length=1, max_length=2000)
    null_hypothesis: str | None = Field(None, max_length=2000)
    experiment_type: str | None = None
    edison_agent: str | None = None
    edison_query: str | None = None
    edison_response: JsonDict | None = None
    intake_draft: JsonDict | None = None

    @field_validator("experiment_type")
    @classmethod
    def validate_experiment_type(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _validate_experiment_type(value)


class HypothesisResponse(BaseModel):
    id: str
    user_id: str
    title: str
    statement: str
    null_hypothesis: str | None
    experiment_type: str | None
    status: HypothesisStatus
    edison_agent: str | None
    edison_query: str | None
    edison_response: JsonDict | None
    intake_draft: JsonDict | None
    experiments_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class HypothesisListItem(BaseModel):
    id: str
    title: str
    statement: str
    experiment_type: str | None
    status: HypothesisStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class HypothesisListResponse(BaseModel):
    hypotheses: list[HypothesisListItem]
    pagination: Pagination


class HypothesisToExperimentRequest(BaseModel):
    budget_max_usd: float | None = Field(None, gt=0)
    bsl_level: BSLLevel | None = None
    privacy: str | None = Field(None, pattern="^(open|private)$")
    title_override: str | None = Field(None, min_length=1, max_length=500)


# Lab Packet schemas — v2
class StudyParameters(BaseModel):
    model_config = {"extra": "allow"}
    test_compounds: str | None = None
    concentration_points: str | None = None
    replicates: str | None = None
    cell_line_or_organism: str | None = None
    incubation_duration: str | None = None
    plate_format: str | None = None
    total_wells_per_plate: str | None = None


class TestArticle(BaseModel):
    id: str
    role: str
    top_concentration: str | None = None
    dilution_scheme: str | None = None
    vehicle: str | None = None


class CellRequirements(BaseModel):
    model_config = {"extra": "allow"}
    cell_line: str | None = None
    passage_range: str | None = None
    mycoplasma_testing: str | None = None
    authentication: str | None = None
    culture_medium: str | None = None
    incubation_conditions: str | None = None
    confluency_at_seeding: str | None = None


class ProtocolStep(BaseModel):
    step: int
    day: str | None = None
    title: str
    procedure: str
    critical_notes: str | None = None


class ReagentItem(BaseModel):
    item: str
    specification: str | None = None
    supplier: str | None = None
    catalog_or_id: str | None = None
    link: str | None = None


class AcceptanceCriterion(BaseModel):
    parameter: str
    requirement: str


class Deliverable(BaseModel):
    name: str
    description: str


# Lab Packet schemas — v1 (kept for backward compat)
class MaterialItem(BaseModel):
    item: str
    supplier: str | None = None
    catalog_or_id: str | None = None
    link: str | None = None
    purpose: str | None = None


class ProtocolReference(BaseModel):
    title: str
    use: str | None = None


class ExperimentDesign(BaseModel):
    overview: str | None = None
    work_packages: list[str] = Field(default_factory=list)
    controls: list[str] = Field(default_factory=list)
    sample_size_plan: str | None = None
    success_criteria: list[str] = Field(default_factory=list)
    estimated_timeline_weeks: int | None = None


class DirectCostEstimate(BaseModel):
    low: float
    high: float
    scope: str | None = None


class GenerateLabPacketRequest(BaseModel):
    force_regenerate: bool = False


class LabPacketResponse(BaseModel):
    id: str
    experiment_id: str
    title: str
    objective: str
    # v2 fields
    study_parameters: StudyParameters | None = None
    test_articles: list[TestArticle] = Field(default_factory=list)
    compound_supply_instructions: str | None = None
    cell_requirements: CellRequirements | None = None
    protocol_steps: list[ProtocolStep] = Field(default_factory=list)
    reagents_and_consumables: list[ReagentItem] = Field(default_factory=list)
    acceptance_criteria: list[AcceptanceCriterion] = Field(default_factory=list)
    deliverables: list[Deliverable] = Field(default_factory=list)
    sponsor_provided_inputs: list[str] = Field(default_factory=list)
    # v1 fields (backward compat)
    readouts: list[str] = Field(default_factory=list)
    design: ExperimentDesign | None = None
    materials: list[MaterialItem] = Field(default_factory=list)
    handoff_package_for_lab: list[str] = Field(default_factory=list)
    # shared
    estimated_direct_cost_usd: DirectCostEstimate | None = None
    protocol_references: list[ProtocolReference] = Field(default_factory=list)
    llm_model: str | None = None
    llm_cost_usd: float | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# RFQ schemas
class RfqTimeline(BaseModel):
    rfq_issue_date: str
    questions_due: str
    quote_due: str
    target_kickoff: str


class GenerateRfqRequest(BaseModel):
    questions_due_days: int = Field(7, ge=1, le=90)
    quote_due_days: int = Field(14, ge=1, le=90)
    target_kickoff_days: int = Field(28, ge=1, le=180)


class RfqPackageResponse(BaseModel):
    id: str
    rfq_id: str
    experiment_id: str
    title: str
    objective: str
    scope_of_work: list[str] = Field(default_factory=list)
    client_provided_inputs: list[str] = Field(default_factory=list)
    required_deliverables: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    quote_requirements: list[str] = Field(default_factory=list)
    timeline: RfqTimeline | None = None
    target_operator_ids: list[str] = Field(default_factory=list)
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RfqStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(draft|sent|quoted|accepted|expired)$")

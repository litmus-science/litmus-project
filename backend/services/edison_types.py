"""
Shared Edison types for internal client and API responses.
"""

from pydantic import BaseModel, Field

from backend.types import JsonObject


class EdisonPlanStep(BaseModel):
    """A step in Edison's execution plan."""

    id: int
    objective: str
    rationale: str
    status: str = "pending"
    result: str | None = None
    evaluation: str | None = None


class EdisonPaperResult(BaseModel):
    """A paper found during literature search."""

    doc_id: str
    title: str
    authors: list[str] = Field(default_factory=list)
    journal: str | None = None
    year: int | None = None
    citation_count: int | None = None
    is_peer_reviewed: bool = False
    relevance_score: float | None = None
    url: str | None = None


class EdisonEvidence(BaseModel):
    """Evidence gathered from a paper."""

    doc_id: str
    context: str
    summary: str | None = None
    relevance: float | None = None


class EdisonReasoningTrace(BaseModel):
    """Full reasoning trace from Edison's execution."""

    current_step: str = "INITIALIZED"
    steps_completed: list[str] = Field(default_factory=list)
    plan: list[EdisonPlanStep] = Field(default_factory=list)
    papers: list[EdisonPaperResult] = Field(default_factory=list)
    evidence: list[EdisonEvidence] = Field(default_factory=list)
    paper_count: int = 0
    relevant_papers: int = 0
    evidence_count: int = 0
    current_cost: float | None = None
    status_message: str | None = None


class EdisonTaskResponse(BaseModel):
    """Response from an Edison task."""

    task_id: str
    success: bool
    status: str = "unknown"
    answer: str | None = None
    formatted_answer: str | None = None
    has_successful_answer: bool = False
    metadata: JsonObject = Field(default_factory=dict)
    error: str | None = None
    reasoning_trace: EdisonReasoningTrace | None = None

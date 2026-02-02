"""
Edison Scientific API Client.

Provides a client for interacting with the Edison Scientific platform
for hypothesis generation, literature search, and molecule analysis.
"""

import os
from collections.abc import Collection, Sequence
from enum import Enum
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from edison_client.models.app import (
        TaskRequest,
    )


from backend.services.edison_types import (
    EdisonEvidence,
    EdisonPaperResult,
    EdisonPlanStep,
    EdisonReasoningTrace,
    EdisonTaskResponse,
)
from backend.types import JsonObject, JsonValue


class EdisonPlatformClientProtocol(Protocol):
    async def acreate_task(self, task_data: "TaskRequest | dict[str, object]") -> str: ...

    async def aget_task(
        self, task_id: str, history: bool = True, verbose: bool = True
    ) -> object: ...

    async def arun_tasks_until_done(
        self,
        task_data: (
            "TaskRequest | dict[str, object] | Collection[TaskRequest] | "
            "Collection[dict[str, object]]"
        ),
        *,
        verbose: bool = ...,
        progress_bar: bool = ...,
        concurrency: int = ...,
        timeout: float | None = ...,
        files: list[str] | None = ...,
    ) -> Sequence[object]: ...

    async def aclose(self) -> None: ...


def _as_object(value: JsonValue | None) -> JsonObject:
    if isinstance(value, dict):
        return value
    return {}


def _as_str(value: JsonValue | None, default: str | None = None) -> str | None:
    if isinstance(value, str):
        return value
    return default


def _as_str_list(value: JsonValue | None) -> list[str]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    return []


def _as_bool_or_none(value: JsonValue | None) -> bool | None:
    if isinstance(value, bool):
        return value
    return None


def _as_int_or_none(value: JsonValue | None) -> int | None:
    if isinstance(value, int):
        return value
    return None


def _as_float_or_none(value: JsonValue | None) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


class EdisonJobType(str, Enum):
    """Edison Scientific job types mapped to actual job names."""

    # Map to Edison job names from edison-client JobNames enum
    LITERATURE = "job-futurehouse-paperqa3"
    MOLECULES = "job-futurehouse-phoenix"
    ANALYSIS = "job-futurehouse-data-analysis-crow-high"
    PRECEDENT = "job-futurehouse-paperqa3-precedent"


def _job_name_for(job_type: EdisonJobType | str) -> str:
    if isinstance(job_type, EdisonJobType):
        return job_type.value
    return job_type


class EdisonClient:
    """
    Client for the Edison Scientific platform API.

    Edison provides AI-powered scientific research capabilities:
    - LITERATURE: Query scientific sources with citations (PaperQA)
    - MOLECULES: Chemistry tasks using cheminformatics tools (Phoenix)
    - ANALYSIS: Generate insights from biological datasets
    - PRECEDENT: Search for precedent work in literature
    """

    def __init__(self, api_key: str | None = None):
        self.api_key = (
            api_key or os.environ.get("EDISON_API_KEY") or os.environ.get("EDISON_PLATFORM_API_KEY")
        )
        if not self.api_key:
            raise ValueError(
                "EDISON_API_KEY or EDISON_PLATFORM_API_KEY environment variable "
                "or api_key parameter is required"
            )
        from edison_client import EdisonClient as EdisonPlatformClient

        self._client: EdisonPlatformClientProtocol = EdisonPlatformClient(api_key=self.api_key)

    def _build_task_request(
        self,
        query: str,
        job_type: EdisonJobType | str,
        runtime_config: JsonObject | None,
    ) -> "TaskRequest":
        from edison_client.models.app import TaskRequest

        job_name = _job_name_for(job_type)
        if runtime_config:
            from edison_client.models.app import RuntimeConfig

            runtime_config_payload = RuntimeConfig.model_validate(runtime_config)
            return TaskRequest(name=job_name, query=query, runtime_config=runtime_config_payload)
        return TaskRequest(name=job_name, query=query)

    def _parse_reasoning_trace(
        self,
        environment_frame: JsonObject | None,
        status: str,
    ) -> EdisonReasoningTrace | None:
        """Parse environment_frame from verbose response into reasoning trace."""
        import re

        trace = EdisonReasoningTrace()

        # Parse status string for counters
        # Format: "Status: Paper Count=X | Relevant Papers=Y | Current Evidence=Z
        # | Current Cost=$..."
        status_match = re.search(
            r"Paper Count=(\d+).*Relevant Papers=(\d+).*Current Evidence=(\d+)",
            status,
        )
        if status_match:
            trace.paper_count = int(status_match.group(1))
            trace.relevant_papers = int(status_match.group(2))
            trace.evidence_count = int(status_match.group(3))

        cost_match = re.search(r"Current Cost=\$?([\d.]+)", status)
        if cost_match:
            trace.current_cost = float(cost_match.group(1))

        trace.status_message = status

        if not environment_frame:
            return trace

        # Extract state from environment_frame
        state_value = environment_frame.get("state")
        state = _as_object(state_value)
        state = _as_object(state.get("state"))

        # Determine current step from status
        status_lower = status.lower()
        if "success" in status_lower or "complete" in status_lower:
            trace.current_step = "COMPLETE"
            trace.steps_completed = [
                "INITIALIZED",
                "CREATE_PLAN",
                "PAPER_SEARCH",
                "UPDATE_PLAN",
                "GATHER_EVIDENCE",
                "CREATE_ARTIFACT",
                "COMPLETE",
            ]
        elif "evidence" in status_lower:
            trace.current_step = "GATHER_EVIDENCE"
            trace.steps_completed = ["INITIALIZED", "CREATE_PLAN", "PAPER_SEARCH", "UPDATE_PLAN"]
        elif "paper" in status_lower or "search" in status_lower:
            trace.current_step = "PAPER_SEARCH"
            trace.steps_completed = ["INITIALIZED", "CREATE_PLAN"]
        elif "plan" in status_lower:
            trace.current_step = "CREATE_PLAN"
            trace.steps_completed = ["INITIALIZED"]
        else:
            trace.current_step = "INITIALIZED"

        # Extract papers from docs/session
        docs = _as_object(state.get("docs"))
        docs_list = docs.get("docs", [])
        if isinstance(docs_list, list):
            for doc in docs_list[:20]:  # Limit to 20 papers
                if isinstance(doc, dict):
                    source_quality_value = doc.get("source_quality", 0)
                    if not isinstance(source_quality_value, (int, float)):
                        source_quality_value = 0
                    title = _as_str(doc.get("title"))
                    if not title:
                        title = _as_str(doc.get("docname"), "Unknown") or "Unknown"
                    trace.papers.append(
                        EdisonPaperResult(
                            doc_id=str(doc.get("doc_id", doc.get("dockey", ""))),
                            title=title,
                            authors=_as_str_list(doc.get("authors")),
                            journal=_as_str(doc.get("journal")),
                            year=_as_int_or_none(doc.get("year")),
                            citation_count=_as_int_or_none(doc.get("citation_count")),
                            is_peer_reviewed=source_quality_value >= 1,
                            relevance_score=_as_float_or_none(doc.get("relevance_score")),
                            url=_as_str(doc.get("url")),
                        )
                    )

        # Extract evidence/contexts from session
        session = _as_object(state.get("session"))
        contexts = session.get("contexts", [])
        if isinstance(contexts, list):
            for ctx in contexts[:10]:  # Limit to 10 evidence items
                if isinstance(ctx, dict):
                    text = _as_object(ctx.get("text"))
                    doc = _as_object(text.get("doc"))
                    trace.evidence.append(
                        EdisonEvidence(
                            doc_id=_as_str(doc.get("doc_id"), "") or "",
                            context=_as_str(ctx.get("context"), "") or "",
                            summary=_as_str(ctx.get("summary")),
                            relevance=_as_float_or_none(ctx.get("score")),
                        )
                    )

        # Extract tool history as plan steps
        tool_history = session.get("tool_history", [])
        if isinstance(tool_history, list):
            step_id = 1
            for step_tools in tool_history:
                if isinstance(step_tools, list):
                    for tool_name in step_tools:
                        if isinstance(tool_name, str):
                            trace.plan.append(
                                EdisonPlanStep(
                                    id=step_id,
                                    objective=tool_name.replace("_", " ").title(),
                                    rationale=f"Step {step_id} of agent execution",
                                    status="completed",
                                )
                            )
                            step_id += 1

        return trace

    def _extract_answer_from_environment_frame(
        self,
        environment_frame: JsonObject | None,
    ) -> tuple[str | None, str | None, bool | None]:
        if not environment_frame or not isinstance(environment_frame, dict):
            return None, None, None

        state_value = environment_frame.get("state")
        state = _as_object(state_value)
        state = _as_object(state.get("state"))
        if not state:
            return None, None, None

        response = _as_object(state.get("response"))
        answer_payload = _as_object(response.get("answer"))
        if answer_payload:
            return (
                _as_str(answer_payload.get("answer")),
                _as_str(answer_payload.get("formatted_answer")),
                _as_bool_or_none(answer_payload.get("has_successful_answer")),
            )

        answer_value = state.get("answer")
        answer = _as_str(answer_value)
        if answer is not None:
            return answer, None, None
        return None, None, None

    def _coerce_task_response(
        self,
        response: object,
        task_id: str | None = None,
    ) -> EdisonTaskResponse:
        status = _as_str(getattr(response, "status", None), "unknown") or "unknown"
        answer = _as_str(getattr(response, "answer", None))
        formatted_answer = _as_str(getattr(response, "formatted_answer", None))
        has_successful_answer = _as_bool_or_none(getattr(response, "has_successful_answer", None))
        has_successful_answer = (
            has_successful_answer if has_successful_answer is not None else False
        )
        metadata_value = getattr(response, "metadata", None)
        metadata = _as_object(metadata_value)
        response_task_id = (
            getattr(response, "task_id", None)
            or getattr(response, "trajectory_id", None)
            or task_id
            or ""
        )
        response_task_id_str = _as_str(response_task_id, "") or ""
        environment_frame_value = getattr(response, "environment_frame", None)
        environment_frame = (
            environment_frame_value if isinstance(environment_frame_value, dict) else None
        )
        if environment_frame:
            extracted_answer, extracted_formatted, extracted_success = (
                self._extract_answer_from_environment_frame(environment_frame)
            )
            if not answer:
                answer = extracted_answer
            if not formatted_answer:
                formatted_answer = extracted_formatted
            if not has_successful_answer and extracted_success is not None:
                has_successful_answer = extracted_success

        success = status.lower() == "success" or has_successful_answer

        # Parse environment_frame for reasoning trace (verbose mode)
        reasoning_trace = self._parse_reasoning_trace(environment_frame, status)

        return EdisonTaskResponse(
            task_id=response_task_id_str,
            success=success,
            status=status,
            answer=answer,
            formatted_answer=formatted_answer,
            has_successful_answer=has_successful_answer,
            metadata=metadata,
            error=getattr(response, "error", None),
            reasoning_trace=reasoning_trace,
        )

    async def close(self) -> None:
        """Close the HTTP client."""
        if hasattr(self._client, "aclose"):
            await self._client.aclose()

    async def create_task(
        self,
        query: str,
        job_type: EdisonJobType = EdisonJobType.MOLECULES,
        runtime_config: JsonObject | None = None,
    ) -> str:
        """
        Create a new Edison task.

        Args:
            query: The question or task description
            job_type: Type of Edison job
            runtime_config: Optional config (timeout, max_steps, etc.)

        Returns:
            Trajectory ID for tracking
        """
        task = self._build_task_request(query, job_type, runtime_config)
        task_id = await self._client.acreate_task(task)
        return str(task_id)

    async def get_task(self, task_id: str, verbose: bool = True) -> EdisonTaskResponse:
        """
        Get the status and result of an Edison task.

        Args:
            task_id: The trajectory ID from create_task
            verbose: If True, request verbose response with environment_frame
                     for reasoning trace data (default: True)

        Returns:
            EdisonTaskResponse with results (and reasoning_trace if verbose)
        """
        response = await self._client.aget_task(task_id, history=verbose, verbose=verbose)
        return self._coerce_task_response(response, task_id=task_id)

    async def run_task_until_done(
        self,
        query: str,
        job_type: EdisonJobType = EdisonJobType.MOLECULES,
        runtime_config: JsonObject | None = None,
        poll_interval: float = 5.0,
        max_wait: float = 600.0,
    ) -> EdisonTaskResponse:
        """
        Submit a task and wait for completion.

        Args:
            query: The question or task description
            job_type: Type of Edison job
            runtime_config: Optional config
            poll_interval: Seconds between status checks
            max_wait: Maximum seconds to wait

        Returns:
            EdisonTaskResponse with results
        """
        task_request = self._build_task_request(query, job_type, runtime_config)
        _ = poll_interval
        responses = await self._client.arun_tasks_until_done(
            task_request,
            timeout=max_wait,
        )

        if responses:
            return self._coerce_task_response(responses[0])
        return EdisonTaskResponse(
            task_id="",
            success=False,
            status="timeout",
            error=f"Task timed out after {max_wait} seconds",
        )

    async def search_literature(self, query: str) -> EdisonTaskResponse:
        """Search scientific literature with citations using PaperQA."""
        return await self.run_task_until_done(query, EdisonJobType.LITERATURE)

    async def analyze_molecules(self, query: str) -> EdisonTaskResponse:
        """Run chemistry/cheminformatics analysis using Phoenix."""
        return await self.run_task_until_done(query, EdisonJobType.MOLECULES)

    async def analyze_data(self, query: str) -> EdisonTaskResponse:
        """Generate insights from biological datasets."""
        return await self.run_task_until_done(query, EdisonJobType.ANALYSIS)

    async def find_precedent(self, query: str) -> EdisonTaskResponse:
        """Search for precedent work in scientific literature."""
        return await self.run_task_until_done(query, EdisonJobType.PRECEDENT)


# Mock client for development/testing when Edison API is not available
class MockEdisonClient(EdisonClient):
    """
    Mock Edison client for development and testing.

    Returns simulated responses without calling the actual API.
    """

    def __init__(self, api_key: str | None = None):
        # Don't require API key for mock
        self.api_key = api_key or "mock_key"
        self._task_counter = 0

    async def create_task(
        self,
        query: str,
        job_type: EdisonJobType = EdisonJobType.MOLECULES,
        runtime_config: JsonObject | None = None,
    ) -> str:
        self._task_counter += 1
        return f"mock_task_{self._task_counter}"

    async def get_task(self, task_id: str, verbose: bool = True) -> EdisonTaskResponse:
        # Simulate task with reasoning trace
        trace = (
            EdisonReasoningTrace(
                current_step="COMPLETE",
                steps_completed=[
                    "INITIALIZED",
                    "CREATE_PLAN",
                    "PAPER_SEARCH",
                    "UPDATE_PLAN",
                    "GATHER_EVIDENCE",
                    "CREATE_ARTIFACT",
                    "COMPLETE",
                ],
                plan=[
                    EdisonPlanStep(
                        id=1,
                        objective="Search literature",
                        rationale="Find relevant papers",
                        status="completed",
                    ),
                    EdisonPlanStep(
                        id=2,
                        objective="Gather evidence",
                        rationale="Extract key findings",
                        status="completed",
                    ),
                    EdisonPlanStep(
                        id=3,
                        objective="Synthesize answer",
                        rationale="Combine evidence",
                        status="completed",
                    ),
                ],
                papers=[
                    EdisonPaperResult(
                        doc_id="paper_1",
                        title="Mock Study on Enzyme Inhibition",
                        authors=["Smith J", "Johnson M"],
                        journal="Journal of Biological Chemistry",
                        year=2024,
                        citation_count=42,
                        is_peer_reviewed=True,
                    ),
                    EdisonPaperResult(
                        doc_id="paper_2",
                        title="Analysis of IC50 Determination Methods",
                        authors=["Williams A", "Brown K"],
                        journal="Nature Methods",
                        year=2023,
                        citation_count=128,
                        is_peer_reviewed=True,
                    ),
                ],
                evidence=[
                    EdisonEvidence(
                        doc_id="paper_1",
                        context=(
                            "The enzyme showed significant inhibition at concentrations above "
                            "10 μM."
                        ),
                        summary="IC50 values typically range from 1-100 μM for similar compounds.",
                        relevance=0.95,
                    ),
                ],
                paper_count=5,
                relevant_papers=2,
                evidence_count=3,
                current_cost=0.0042,
                status_message=(
                    "Status: Paper Count=5 | Relevant Papers=2 | Current Evidence=3 "
                    "| Current Cost=$0.0042"
                ),
            )
            if verbose
            else None
        )

        return EdisonTaskResponse(
            task_id=task_id,
            success=True,
            status="success",
            answer="This is a mock response from Edison Scientific.",
            formatted_answer="**Mock Response**\n\nThis is a simulated response for development.",
            has_successful_answer=True,
            metadata={"mock": True},
            reasoning_trace=trace,
        )

    async def run_task_until_done(
        self,
        query: str,
        job_type: EdisonJobType = EdisonJobType.MOLECULES,
        runtime_config: JsonObject | None = None,
        poll_interval: float = 5.0,
        max_wait: float = 600.0,
    ) -> EdisonTaskResponse:
        task_id = await self.create_task(query, job_type, runtime_config)

        # Generate job-type specific mock responses
        job_type_name = job_type.name.lower()

        if job_type == EdisonJobType.LITERATURE:
            answer = (
                f'Based on scientific literature search for: "{query}"\n\n'
                "Key findings:\n"
                "1. Multiple studies have investigated this topic\n"
                "2. The primary mechanism involves enzyme-substrate interactions\n"
                "3. Typical concentrations used range from 1-100 μM\n\n"
                "References:\n"
                "- Smith et al. (2023) Journal of Biological Chemistry\n"
                "- Johnson et al. (2024) Nature Methods\n"
            )
        elif job_type == EdisonJobType.MOLECULES:
            answer = (
                f'Molecular analysis for: "{query}"\n\n'
                "Compound Information:\n"
                "- Molecular weight: ~300 Da (estimated)\n"
                "- LogP: 2.5 (moderate lipophilicity)\n"
                "- Predicted solubility: Moderate in aqueous buffers\n\n"
                "Synthesis considerations:\n"
                "- Standard organic synthesis techniques applicable\n"
                "- No unusual safety concerns identified\n"
            )
        elif job_type == EdisonJobType.ANALYSIS:
            answer = (
                f'Data analysis insights for: "{query}"\n\n'
                "Statistical Summary:\n"
                "- The experimental design supports hypothesis testing\n"
                "- Recommended sample size: n=3 technical replicates\n"
                "- Expected effect size: Medium to large\n\n"
                "Recommended assays:\n"
                "- Primary: Fluorometric or colorimetric detection\n"
                "- Secondary: Dose-response curve fitting for IC50\n"
            )
        elif job_type == EdisonJobType.PRECEDENT:
            answer = (
                f'Precedent search for: "{query}"\n\n'
                "Similar experiments found:\n"
                "1. IC50 determination using standard protocols\n"
                "2. Enzyme inhibition assays with comparable compounds\n"
                "3. Published methodologies from reputable labs\n\n"
                "Recommended approach based on precedent:\n"
                "- Use established assay conditions\n"
                "- Include positive and negative controls\n"
                "- Plan for 8-12 concentration points for IC50\n"
            )
        else:
            answer = f"Analysis complete for: {query}"

        # Generate mock reasoning trace
        trace = EdisonReasoningTrace(
            current_step="COMPLETE",
            steps_completed=[
                "INITIALIZED",
                "CREATE_PLAN",
                "PAPER_SEARCH",
                "UPDATE_PLAN",
                "GATHER_EVIDENCE",
                "CREATE_ARTIFACT",
                "COMPLETE",
            ],
            plan=[
                EdisonPlanStep(
                    id=1,
                    objective="Search literature",
                    rationale="Find relevant papers",
                    status="completed",
                ),
                EdisonPlanStep(
                    id=2,
                    objective="Analyze sources",
                    rationale="Extract key findings",
                    status="completed",
                ),
                EdisonPlanStep(
                    id=3,
                    objective="Synthesize answer",
                    rationale="Combine evidence into response",
                    status="completed",
                ),
            ],
            papers=[
                EdisonPaperResult(
                    doc_id="mock_paper_1",
                    title=f"Mock Study: {query[:50]}...",
                    authors=["Smith J", "Johnson M"],
                    journal="Journal of Biological Chemistry",
                    year=2024,
                    citation_count=42,
                    is_peer_reviewed=True,
                ),
            ],
            evidence=[
                EdisonEvidence(
                    doc_id="mock_paper_1",
                    context=f"Evidence related to: {query[:100]}",
                    summary="Key findings from literature analysis",
                    relevance=0.9,
                ),
            ],
            paper_count=5,
            relevant_papers=2,
            evidence_count=3,
            current_cost=0.0,
            status_message=(
                "Status: Paper Count=5 | Relevant Papers=2 | Current Evidence=3 "
                "| Current Cost=$0.00"
            ),
        )

        return EdisonTaskResponse(
            task_id=task_id,
            success=True,
            status="success",
            answer=answer,
            formatted_answer=f"**Edison {job_type_name.title()} Analysis**\n\n{answer}",
            has_successful_answer=True,
            metadata={"mock": True, "job_type": job_type.value},
            reasoning_trace=trace,
        )


# Singleton management
_edison_client: EdisonClient | None = None


def get_edison_client(use_mock: bool | None = None) -> EdisonClient:
    """
    Get or create the Edison client singleton.

    Args:
        use_mock: Force mock client (True) or real client (False).
                  If None, auto-detect based on Edison API key availability.

    Returns:
        EdisonClient instance
    """
    global _edison_client

    if _edison_client is None:
        if use_mock is None:
            # Auto-detect: use mock if no API key
            use_mock = not (
                os.environ.get("EDISON_API_KEY") or os.environ.get("EDISON_PLATFORM_API_KEY")
            )

        if use_mock:
            _edison_client = MockEdisonClient()
        else:
            _edison_client = EdisonClient()

    return _edison_client

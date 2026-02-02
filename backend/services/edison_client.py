"""
Edison Scientific API Client.

Provides a client for interacting with the Edison Scientific platform
for hypothesis generation, literature search, and molecule analysis.
"""

import os
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from edison_client import EdisonClient as EdisonPlatformClient
    from edison_client.models.app import (
        FinchTaskResponse,
        LiteTaskResponse,
        PhoenixTaskResponse,
        PQATaskResponse,
        TaskRequest,
        TaskResponse,
        TaskResponseVerbose,
    )


from backend.services.edison_types import (
    EdisonPlanStep,
    EdisonPaperResult,
    EdisonEvidence,
    EdisonReasoningTrace,
    EdisonTaskResponse,
)


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
        self.api_key = api_key or os.environ.get("EDISON_API_KEY") or os.environ.get(
            "EDISON_PLATFORM_API_KEY"
        )
        if not self.api_key:
            raise ValueError(
                "EDISON_API_KEY or EDISON_PLATFORM_API_KEY environment variable "
                "or api_key parameter is required"
            )
        from edison_client import EdisonClient as EdisonPlatformClient

        self._client: "EdisonPlatformClient" = EdisonPlatformClient(api_key=self.api_key)

    def _build_task_request(
        self,
        query: str,
        job_type: EdisonJobType | str,
        runtime_config: dict | None,
    ) -> "TaskRequest":
        from edison_client.models.app import TaskRequest

        job_name = _job_name_for(job_type)
        if runtime_config:
            return TaskRequest(name=job_name, query=query, runtime_config=runtime_config)
        return TaskRequest(name=job_name, query=query)

    def _parse_reasoning_trace(
        self,
        environment_frame: dict | None,
        status: str,
    ) -> EdisonReasoningTrace | None:
        """Parse environment_frame from verbose response into reasoning trace."""
        import re

        trace = EdisonReasoningTrace()

        # Parse status string for counters
        # Format: "Status: Paper Count=X | Relevant Papers=Y | Current Evidence=Z | Current Cost=$..."
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
        state = environment_frame.get("state", {})
        if isinstance(state, dict):
            state = state.get("state", state)

        # Determine current step from status
        status_lower = status.lower()
        if "success" in status_lower or "complete" in status_lower:
            trace.current_step = "COMPLETE"
            trace.steps_completed = [
                "INITIALIZED", "CREATE_PLAN", "PAPER_SEARCH",
                "UPDATE_PLAN", "GATHER_EVIDENCE", "CREATE_ARTIFACT", "COMPLETE"
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
        docs = state.get("docs", {})
        if isinstance(docs, dict):
            docs_list = docs.get("docs", [])
            if isinstance(docs_list, list):
                for doc in docs_list[:20]:  # Limit to 20 papers
                    if isinstance(doc, dict):
                        source_quality_value = doc.get("source_quality", 0)
                        if not isinstance(source_quality_value, (int, float)):
                            source_quality_value = 0
                        trace.papers.append(EdisonPaperResult(
                            doc_id=str(doc.get("doc_id", doc.get("dockey", ""))),
                            title=doc.get("title", doc.get("docname", "Unknown")),
                            authors=doc.get("authors", []) or [],
                            journal=doc.get("journal"),
                            year=doc.get("year"),
                            citation_count=doc.get("citation_count"),
                            is_peer_reviewed=source_quality_value >= 1,
                            relevance_score=doc.get("relevance_score"),
                            url=doc.get("url"),
                        ))

        # Extract evidence/contexts from session
        session = state.get("session", {})
        if isinstance(session, dict):
            contexts = session.get("contexts", [])
            if isinstance(contexts, list):
                for ctx in contexts[:10]:  # Limit to 10 evidence items
                    if isinstance(ctx, dict):
                        trace.evidence.append(EdisonEvidence(
                            doc_id=str(ctx.get("text", {}).get("doc", {}).get("doc_id", "")),
                            context=ctx.get("context", ""),
                            summary=ctx.get("summary"),
                            relevance=ctx.get("score"),
                        ))

            # Extract tool history as plan steps
            tool_history = session.get("tool_history", [])
            if isinstance(tool_history, list):
                step_id = 1
                for step_tools in tool_history:
                    if isinstance(step_tools, list):
                        for tool_name in step_tools:
                            trace.plan.append(EdisonPlanStep(
                                id=step_id,
                                objective=tool_name.replace("_", " ").title(),
                                rationale=f"Step {step_id} of agent execution",
                                status="completed",
                            ))
                            step_id += 1

        return trace

    def _extract_answer_from_environment_frame(
        self,
        environment_frame: dict | None,
    ) -> tuple[str | None, str | None, bool | None]:
        if not environment_frame or not isinstance(environment_frame, dict):
            return None, None, None

        state = environment_frame.get("state", {})
        if isinstance(state, dict):
            state = state.get("state", state)
        if not isinstance(state, dict):
            return None, None, None

        response = state.get("response", {})
        if isinstance(response, dict):
            answer_payload = response.get("answer", {})
            if isinstance(answer_payload, dict):
                return (
                    answer_payload.get("answer"),
                    answer_payload.get("formatted_answer"),
                    answer_payload.get("has_successful_answer"),
                )

        answer_value = state.get("answer")
        if isinstance(answer_value, str):
            return answer_value, None, None
        return None, None, None

    def _coerce_task_response(
        self,
        response: "TaskResponse | TaskResponseVerbose | LiteTaskResponse | PhoenixTaskResponse | PQATaskResponse | FinchTaskResponse",
        task_id: str | None = None,
    ) -> EdisonTaskResponse:
        status = getattr(response, "status", "unknown")
        answer = getattr(response, "answer", None)
        formatted_answer = getattr(response, "formatted_answer", None)
        has_successful_answer = bool(getattr(response, "has_successful_answer", False))
        metadata = getattr(response, "metadata", None) or {}
        response_task_id = (
            getattr(response, "task_id", None)
            or getattr(response, "trajectory_id", None)
            or task_id
            or ""
        )
        environment_frame = getattr(response, "environment_frame", None)
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
            task_id=str(response_task_id),
            success=success,
            status=status,
            answer=answer,
            formatted_answer=formatted_answer,
            has_successful_answer=has_successful_answer,
            metadata=metadata,
            error=getattr(response, "error", None),
            reasoning_trace=reasoning_trace,
        )

    async def close(self):
        """Close the HTTP client."""
        if hasattr(self._client, "aclose"):
            await self._client.aclose()

    async def create_task(
        self,
        query: str,
        job_type: EdisonJobType = EdisonJobType.MOLECULES,
        runtime_config: dict | None = None,
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
        return await self._client.acreate_task(task)

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
        runtime_config: dict | None = None,
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
        runtime_config: dict | None = None,
    ) -> str:
        self._task_counter += 1
        return f"mock_task_{self._task_counter}"

    async def get_task(self, task_id: str, verbose: bool = True) -> EdisonTaskResponse:
        # Simulate task with reasoning trace
        trace = EdisonReasoningTrace(
            current_step="COMPLETE",
            steps_completed=[
                "INITIALIZED", "CREATE_PLAN", "PAPER_SEARCH",
                "UPDATE_PLAN", "GATHER_EVIDENCE", "CREATE_ARTIFACT", "COMPLETE"
            ],
            plan=[
                EdisonPlanStep(id=1, objective="Search literature", rationale="Find relevant papers", status="completed"),
                EdisonPlanStep(id=2, objective="Gather evidence", rationale="Extract key findings", status="completed"),
                EdisonPlanStep(id=3, objective="Synthesize answer", rationale="Combine evidence", status="completed"),
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
                    context="The enzyme showed significant inhibition at concentrations above 10 μM.",
                    summary="IC50 values typically range from 1-100 μM for similar compounds.",
                    relevance=0.95,
                ),
            ],
            paper_count=5,
            relevant_papers=2,
            evidence_count=3,
            current_cost=0.0042,
            status_message="Status: Paper Count=5 | Relevant Papers=2 | Current Evidence=3 | Current Cost=$0.0042",
        ) if verbose else None

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
        runtime_config: dict | None = None,
        poll_interval: float = 5.0,
        max_wait: float = 600.0,
    ) -> EdisonTaskResponse:
        task_id = await self.create_task(query, job_type, runtime_config)

        # Generate job-type specific mock responses
        job_type_name = job_type.name.lower()

        if job_type == EdisonJobType.LITERATURE:
            answer = f"""Based on scientific literature search for: \"{query}\"\n\nKey findings:\n1. Multiple studies have investigated this topic\n2. The primary mechanism involves enzyme-substrate interactions\n3. Typical concentrations used range from 1-100 μM\n\nReferences:\n- Smith et al. (2023) Journal of Biological Chemistry\n- Johnson et al. (2024) Nature Methods\n"""
        elif job_type == EdisonJobType.MOLECULES:
            answer = f"""Molecular analysis for: \"{query}\"\n\nCompound Information:\n- Molecular weight: ~300 Da (estimated)\n- LogP: 2.5 (moderate lipophilicity)\n- Predicted solubility: Moderate in aqueous buffers\n\nSynthesis considerations:\n- Standard organic synthesis techniques applicable\n- No unusual safety concerns identified\n"""
        elif job_type == EdisonJobType.ANALYSIS:
            answer = f"""Data analysis insights for: \"{query}\"\n\nStatistical Summary:\n- The experimental design supports hypothesis testing\n- Recommended sample size: n=3 technical replicates\n- Expected effect size: Medium to large\n\nRecommended assays:\n- Primary: Fluorometric or colorimetric detection\n- Secondary: Dose-response curve fitting for IC50\n"""
        elif job_type == EdisonJobType.PRECEDENT:
            answer = f"""Precedent search for: \"{query}\"\n\nSimilar experiments found:\n1. IC50 determination using standard protocols\n2. Enzyme inhibition assays with comparable compounds\n3. Published methodologies from reputable labs\n\nRecommended approach based on precedent:\n- Use established assay conditions\n- Include positive and negative controls\n- Plan for 8-12 concentration points for IC50\n"""
        else:
            answer = f"Analysis complete for: {query}"

        # Generate mock reasoning trace
        trace = EdisonReasoningTrace(
            current_step="COMPLETE",
            steps_completed=[
                "INITIALIZED", "CREATE_PLAN", "PAPER_SEARCH",
                "UPDATE_PLAN", "GATHER_EVIDENCE", "CREATE_ARTIFACT", "COMPLETE"
            ],
            plan=[
                EdisonPlanStep(id=1, objective="Search literature", rationale="Find relevant papers", status="completed"),
                EdisonPlanStep(id=2, objective="Analyze sources", rationale="Extract key findings", status="completed"),
                EdisonPlanStep(id=3, objective="Synthesize answer", rationale="Combine evidence into response", status="completed"),
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
            status_message="Status: Paper Count=5 | Relevant Papers=2 | Current Evidence=3 | Current Cost=$0.00",
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

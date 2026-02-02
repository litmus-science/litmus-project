"""
Edison Scientific API Client.

Provides a client for interacting with the Edison Scientific platform
for hypothesis generation, literature search, and molecule analysis.
"""

import os
from dataclasses import dataclass, field
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


class EdisonJobType(str, Enum):
    """Edison Scientific job types mapped to actual job names."""
    # Map to Edison job names from edison-client JobNames enum
    LITERATURE = "job-futurehouse-paperqa2"
    MOLECULES = "job-futurehouse-phoenix"
    ANALYSIS = "job-futurehouse-data-analysis-crow-high"
    PRECEDENT = "job-futurehouse-paperqa3-precedent"


_EDISON_JOB_ENV_VARS: dict[EdisonJobType, str] = {
    EdisonJobType.LITERATURE: "EDISON_JOB_LITERATURE",
    EdisonJobType.MOLECULES: "EDISON_JOB_MOLECULES",
    EdisonJobType.ANALYSIS: "EDISON_JOB_ANALYSIS",
    EdisonJobType.PRECEDENT: "EDISON_JOB_PRECEDENT",
}


def _job_name_override(job_type: EdisonJobType) -> str | None:
    env_var = _EDISON_JOB_ENV_VARS[job_type]
    value = os.environ.get(env_var)
    if value:
        return value.strip()
    return None


def _job_name_for(job_type: EdisonJobType | str) -> str:
    if isinstance(job_type, EdisonJobType):
        override = _job_name_override(job_type)
        return override or job_type.value
    return job_type


@dataclass
class EdisonTaskResponse:
    """Response from an Edison task."""
    task_id: str
    success: bool
    status: str = "unknown"
    answer: str | None = None
    formatted_answer: str | None = None
    has_successful_answer: bool = False
    metadata: dict[str, object] = field(default_factory=dict)
    error: str | None = None


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
        success = status.lower() == "success"
        if not success and has_successful_answer:
            success = True

        return EdisonTaskResponse(
            task_id=response_task_id,
            success=success,
            status=status,
            answer=answer,
            formatted_answer=formatted_answer,
            has_successful_answer=has_successful_answer,
            metadata=metadata,
            error=getattr(response, "error", None),
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

    async def get_task(self, task_id: str) -> EdisonTaskResponse:
        """
        Get the status and result of an Edison task.

        Args:
            task_id: The trajectory ID from create_task

        Returns:
            EdisonTaskResponse with results
        """
        response = await self._client.aget_task(task_id)
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

    async def get_task(self, task_id: str) -> EdisonTaskResponse:
        # Simulate completed task
        return EdisonTaskResponse(
            task_id=task_id,
            success=True,
            status="success",
            answer="This is a mock response from Edison Scientific.",
            formatted_answer="**Mock Response**\n\nThis is a simulated response for development.",
            has_successful_answer=True,
            metadata={"mock": True},
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

        return EdisonTaskResponse(
            task_id=task_id,
            success=True,
            status="success",
            answer=answer,
            formatted_answer=f"**Edison {job_type_name.title()} Analysis**\n\n{answer}",
            has_successful_answer=True,
            metadata={"mock": True, "job_type": job_type.value},
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

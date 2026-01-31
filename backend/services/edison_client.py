"""
Edison Scientific API Client.

Provides a client for interacting with the Edison Scientific platform
for hypothesis generation, literature search, and molecule analysis.
"""

import os
import asyncio
import httpx
from dataclasses import dataclass, field
from typing import Any
from enum import Enum


class EdisonJobType(str, Enum):
    """Edison Scientific job types mapped to actual job names."""
    # Map to actual Edison job names from edison-client JobNames enum
    LITERATURE = "job-futurehouse-paperqa3"
    MOLECULES = "job-futurehouse-phoenix"
    ANALYSIS = "job-futurehouse-data-analysis-crow-high"
    PRECEDENT = "job-futurehouse-paperqa3-precedent"


@dataclass
class EdisonTaskResponse:
    """Response from an Edison task."""
    task_id: str
    success: bool
    status: str = "unknown"
    answer: str | None = None
    formatted_answer: str | None = None
    has_successful_answer: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


class EdisonClient:
    """
    Client for the Edison Scientific platform API.

    Edison provides AI-powered scientific research capabilities:
    - LITERATURE: Query scientific sources with citations (PaperQA3)
    - MOLECULES: Chemistry tasks using cheminformatics tools (Phoenix)
    - ANALYSIS: Generate insights from biological datasets
    - PRECEDENT: Search for precedent work in literature
    """

    # Edison platform API URL (from edison-client package Stage.PROD)
    BASE_URL = os.environ.get("EDISON_API_URL", "https://api.platform.edisonscientific.com")

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("EDISON_API_KEY")
        if not self.api_key:
            raise ValueError("EDISON_API_KEY environment variable or api_key parameter is required")
        self._client: httpx.AsyncClient | None = None
        self._jwt_token: str | None = None

    async def _authenticate(self) -> str:
        """
        Authenticate with Edison API to get a JWT token.

        Edison uses API key to get a JWT via /auth/login endpoint.
        """
        async with httpx.AsyncClient(base_url=self.BASE_URL, timeout=30.0) as client:
            response = await client.post(
                "/auth/login",
                json={"api_key": self.api_key},
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            data = response.json()
            return data["access_token"]

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.BASE_URL,
                headers={"Content-Type": "application/json"},
                timeout=120.0,  # Edison tasks can take time
            )
        return self._client

    async def _ensure_authenticated(self):
        """Ensure we have a valid JWT token."""
        if self._jwt_token is None:
            self._jwt_token = await self._authenticate()
        # Update client headers with token
        self.client.headers["Authorization"] = f"Bearer {self._jwt_token}"

    async def _request_with_auth(self, method: str, url: str, **kwargs):
        """Make an authenticated request, handling token refresh on 401."""
        await self._ensure_authenticated()

        response = await getattr(self.client, method)(url, **kwargs)

        # If unauthorized, try refreshing token once
        if response.status_code in (401, 403):
            self._jwt_token = await self._authenticate()
            self.client.headers["Authorization"] = f"Bearer {self._jwt_token}"
            response = await getattr(self.client, method)(url, **kwargs)

        response.raise_for_status()
        return response

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
        self._jwt_token = None

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
        payload = {
            "name": job_type.value,  # Uses the actual job name like "job-futurehouse-phoenix"
            "query": query,
        }
        if runtime_config:
            payload["runtime_config"] = runtime_config

        # Edison uses /v0.1/crows endpoint for task creation
        response = await self._request_with_auth("post", "/v0.1/crows", json=payload)
        data = response.json()
        return data["trajectory_id"]

    async def get_task(self, task_id: str) -> EdisonTaskResponse:
        """
        Get the status and result of an Edison task.

        Args:
            task_id: The trajectory ID from create_task

        Returns:
            EdisonTaskResponse with results
        """
        # Edison uses /v0.1/trajectories/{id} endpoint for status
        response = await self._request_with_auth("get", f"/v0.1/trajectories/{task_id}")
        data = response.json()

        # Extract status
        status = data.get("status", "unknown")

        # Extract answer from environment_frame for PQA responses
        env_frame = data.get("environment_frame") or {}
        state = (env_frame.get("state") or {}).get("state") or {}
        response_data = state.get("response") or {}
        answer_data = response_data.get("answer") or {}

        answer = answer_data.get("answer") or state.get("answer")
        formatted_answer = answer_data.get("formatted_answer")
        has_successful_answer = answer_data.get("has_successful_answer", False)

        return EdisonTaskResponse(
            task_id=task_id,
            success=has_successful_answer,
            status=status,
            answer=answer,
            formatted_answer=formatted_answer,
            has_successful_answer=has_successful_answer,
            metadata=data.get("metadata", {}),
        )

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
        task_id = await self.create_task(query, job_type, runtime_config)

        elapsed = 0.0
        while elapsed < max_wait:
            result = await self.get_task(task_id)

            # Check if task is complete (success, failed, or has answer)
            # Edison returns "in progress" with space for running tasks
            if result.status.lower() not in ("in progress", "pending", "queued", "running"):
                return result
            if result.has_successful_answer:
                return result
            if result.error:
                return result

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        return EdisonTaskResponse(
            task_id=task_id,
            success=False,
            status="timeout",
            error=f"Task timed out after {max_wait} seconds",
        )

    async def search_literature(self, query: str) -> EdisonTaskResponse:
        """Search scientific literature with citations using PaperQA3."""
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
        self._client = None
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
            status="complete",
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
            answer = f"""Based on scientific literature search for: "{query}"

Key findings:
1. Multiple studies have investigated this topic
2. The primary mechanism involves enzyme-substrate interactions
3. Typical concentrations used range from 1-100 μM

References:
- Smith et al. (2023) Journal of Biological Chemistry
- Johnson et al. (2024) Nature Methods
"""
        elif job_type == EdisonJobType.MOLECULES:
            answer = f"""Molecular analysis for: "{query}"

Compound Information:
- Molecular weight: ~300 Da (estimated)
- LogP: 2.5 (moderate lipophilicity)
- Predicted solubility: Moderate in aqueous buffers

Synthesis considerations:
- Standard organic synthesis techniques applicable
- No unusual safety concerns identified
"""
        elif job_type == EdisonJobType.ANALYSIS:
            answer = f"""Data analysis insights for: "{query}"

Statistical Summary:
- The experimental design supports hypothesis testing
- Recommended sample size: n=3 technical replicates
- Expected effect size: Medium to large

Recommended assays:
- Primary: Fluorometric or colorimetric detection
- Secondary: Dose-response curve fitting for IC50
"""
        elif job_type == EdisonJobType.PRECEDENT:
            answer = f"""Precedent search for: "{query}"

Similar experiments found:
1. IC50 determination using standard protocols
2. Enzyme inhibition assays with comparable compounds
3. Published methodologies from reputable labs

Recommended approach based on precedent:
- Use established assay conditions
- Include positive and negative controls
- Plan for 8-12 concentration points for IC50
"""
        else:
            answer = f"Analysis complete for: {query}"

        return EdisonTaskResponse(
            task_id=task_id,
            success=True,
            status="complete",
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
                  If None, auto-detect based on EDISON_API_KEY availability.

    Returns:
        EdisonClient instance
    """
    global _edison_client

    if _edison_client is None:
        if use_mock is None:
            # Auto-detect: use mock if no API key
            use_mock = not os.environ.get("EDISON_API_KEY")

        if use_mock:
            _edison_client = MockEdisonClient()
        else:
            _edison_client = EdisonClient()

    return _edison_client

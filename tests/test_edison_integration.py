"""
Tests for Edison integration.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.services.edison_integration import EdisonLitmusIntegration


@pytest.mark.asyncio
async def test_invalid_job_type_returns_error() -> None:
    integration = EdisonLitmusIntegration()
    result = await integration.research_and_translate("test query", job_type="invalid")
    assert not result.success
    assert result.error is not None
    assert "Unsupported Edison job_type" in result.error

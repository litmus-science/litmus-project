"""
Tests for Edison integration.
"""

import pytest
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.services.edison_integration import EdisonIntegration


@pytest.mark.asyncio
async def test_invalid_job_type_returns_error():
    integration = EdisonIntegration()
    result = await integration.translate_query("test query", job_type="invalid")
    assert not result.success
    assert result.error is not None
    assert "Unsupported Edison job_type" in result.error

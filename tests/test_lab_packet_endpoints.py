from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

from backend import main, schemas
from backend.auth import AuthUser


class _ScalarResult:
    def __init__(self, value: object | None) -> None:
        self._value = value

    def scalar_one_or_none(self) -> object | None:
        return self._value


class _FakeSession:
    def __init__(self, queued_results: list[object | None]) -> None:
        self._queued_results = list(queued_results)
        self.added: list[object] = []
        self.flushed = False

    async def execute(self, _query: object) -> _ScalarResult:
        if not self._queued_results:
            raise AssertionError("No queued result available for execute()")
        return _ScalarResult(self._queued_results.pop(0))

    def add(self, obj: object) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        self.flushed = True


def _make_user() -> AuthUser:
    return AuthUser(
        id="user-1",
        email="user@example.com",
        name="User",
        organization=None,
        role="requester",
        rate_limit_tier="standard",
    )


def _make_experiment() -> SimpleNamespace:
    return SimpleNamespace(
        id="exp-1",
        requester_id="user-1",
        specification={"title": "Fallback Title"},
    )


def _base_packet_data() -> dict[str, Any]:
    return {
        "title": "Generated Title",
        "objective": "Generated objective",
        "readouts": ["readout-a"],
        "design": {},
        "materials": [],
        "estimated_direct_cost_usd": {"low": 10.0, "high": 20.0, "scope": "test"},
        "protocol_references": [],
        "handoff_package_for_lab": ["specification sheet"],
    }


def _patch_lab_packet_generation(
    monkeypatch: pytest.MonkeyPatch,
    packet_data: dict[str, Any],
) -> None:
    monkeypatch.setattr("backend.services.llm_service.get_llm_service", lambda: object())

    async def fake_generate_lab_packet(
        _spec: object,
        _llm: object,
    ) -> tuple[dict[str, Any], str, float]:
        return packet_data, "test-model", 0.01

    monkeypatch.setattr(
        "backend.services.lab_packet_service.generate_lab_packet",
        fake_generate_lab_packet,
    )


def _make_lab_packet(updated_at: datetime) -> SimpleNamespace:
    return SimpleNamespace(
        id="packet-1",
        experiment_id="exp-1",
        user_id="user-1",
        title="Packet title",
        objective="Packet objective",
        readouts=["readout-a"],
        design={},
        materials=[],
        estimated_direct_cost_usd=None,
        protocol_references=[],
        handoff_package_for_lab=["specification sheet"],
        updated_at=updated_at,
    )


def _make_rfq(updated_at: datetime, timeline: dict[str, str]) -> SimpleNamespace:
    return SimpleNamespace(
        id="rfq-db-1",
        rfq_id="rfq-old",
        lab_packet_id="packet-1",
        experiment_id="exp-1",
        user_id="user-1",
        title="Old RFQ",
        objective="Old objective",
        scope_of_work=["old scope"],
        client_provided_inputs=["old input"],
        required_deliverables=["old deliverable"],
        acceptance_criteria=["old criteria"],
        quote_requirements=["old quote req"],
        timeline=timeline,
        target_operator_ids=[],
        status="draft",
        created_at=updated_at,
        updated_at=updated_at,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("field", "value", "error_fragment"),
    [
        ("title", None, "invalid title"),
        ("objective", None, "invalid objective"),
        ("readouts", "single readout", "invalid readouts"),
        ("handoff_package_for_lab", "single handoff item", "invalid handoff package"),
    ],
)
async def test_generate_lab_packet_rejects_invalid_llm_shapes(
    monkeypatch: pytest.MonkeyPatch,
    field: str,
    value: object,
    error_fragment: str,
) -> None:
    packet_data = _base_packet_data()
    packet_data[field] = value
    _patch_lab_packet_generation(monkeypatch, packet_data)

    db = _FakeSession([_make_experiment(), None])
    with pytest.raises(HTTPException) as exc_info:
        await main.generate_lab_packet_endpoint(
            experiment_id="exp-1",
            request=schemas.GenerateLabPacketRequest(),
            current_user=_make_user(),
            db=db,  # type: ignore[arg-type]
        )

    assert exc_info.value.status_code == 502
    assert error_fragment in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_generate_rfq_reuses_existing_when_fresh_and_timeline_matches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime.utcnow()
    packet = _make_lab_packet(updated_at=now)
    issue_date = (now - timedelta(days=1)).date()
    existing_rfq = _make_rfq(
        updated_at=now,
        timeline={
            "rfq_issue_date": issue_date.isoformat(),
            "questions_due": (issue_date + timedelta(days=7)).isoformat(),
            "quote_due": (issue_date + timedelta(days=14)).isoformat(),
            "target_kickoff": (issue_date + timedelta(days=28)).isoformat(),
        },
    )
    experiment = _make_experiment()
    db = _FakeSession([packet, experiment, existing_rfq])

    monkeypatch.setattr(
        main,
        "_rfq_to_response",
        lambda rfq: {"rfq_id": rfq.rfq_id, "title": rfq.title},
    )

    def should_not_regenerate(*_args: object, **_kwargs: object) -> dict[str, Any]:
        raise AssertionError("generate_rfq_from_packet should not be called when RFQ is fresh")

    monkeypatch.setattr(
        "backend.services.lab_packet_service.generate_rfq_from_packet",
        should_not_regenerate,
    )

    response = await main.generate_rfq_endpoint(
        experiment_id="exp-1",
        request=schemas.GenerateRfqRequest(),
        current_user=_make_user(),
        db=db,  # type: ignore[arg-type]
    )

    assert response == {"rfq_id": "rfq-old", "title": "Old RFQ"}
    assert db.flushed is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "rfq_request",
    [
        schemas.GenerateRfqRequest(),
        schemas.GenerateRfqRequest(quote_due_days=21),
    ],
)
async def test_generate_rfq_regenerates_when_stale_or_timeline_changes(
    monkeypatch: pytest.MonkeyPatch,
    rfq_request: schemas.GenerateRfqRequest,
) -> None:
    now = datetime.utcnow()
    packet = _make_lab_packet(updated_at=now)
    issue_date = (now - timedelta(days=1)).date()

    # First param case (default request): stale RFQ via older updated_at.
    # Second param case (quote_due_days=21): timeline mismatch despite fresh updated_at.
    existing_rfq_updated_at = now - timedelta(seconds=1)
    if rfq_request.quote_due_days == 21:
        existing_rfq_updated_at = now
    existing_rfq = _make_rfq(
        updated_at=existing_rfq_updated_at,
        timeline={
            "rfq_issue_date": issue_date.isoformat(),
            "questions_due": (issue_date + timedelta(days=7)).isoformat(),
            "quote_due": (issue_date + timedelta(days=14)).isoformat(),
            "target_kickoff": (issue_date + timedelta(days=28)).isoformat(),
        },
    )
    experiment = _make_experiment()
    db = _FakeSession([packet, experiment, existing_rfq])

    monkeypatch.setattr(
        main,
        "_rfq_to_response",
        lambda rfq: {"rfq_id": rfq.rfq_id, "title": rfq.title, "timeline": rfq.timeline},
    )

    def fake_generate_rfq_from_packet(
        _packet_data: dict[str, Any],
        experiment_id: str,
        _spec: dict[str, Any],
        questions_due_days: int,
        quote_due_days: int,
        target_kickoff_days: int,
    ) -> dict[str, Any]:
        base_date = issue_date
        return {
            "rfq_id": f"rfq-{experiment_id}-v2",
            "title": "Regenerated RFQ",
            "objective": "New objective",
            "scope_of_work": ["new scope"],
            "client_provided_inputs": ["new input"],
            "required_deliverables": ["new deliverable"],
            "acceptance_criteria": ["new criteria"],
            "quote_requirements": ["new quote req"],
            "timeline": {
                "rfq_issue_date": base_date.isoformat(),
                "questions_due": (base_date + timedelta(days=questions_due_days)).isoformat(),
                "quote_due": (base_date + timedelta(days=quote_due_days)).isoformat(),
                "target_kickoff": (base_date + timedelta(days=target_kickoff_days)).isoformat(),
            },
        }

    monkeypatch.setattr(
        "backend.services.lab_packet_service.generate_rfq_from_packet",
        fake_generate_rfq_from_packet,
    )

    response = await main.generate_rfq_endpoint(
        experiment_id="exp-1",
        request=rfq_request,
        current_user=_make_user(),
        db=db,  # type: ignore[arg-type]
    )

    assert response["title"] == "Regenerated RFQ"
    assert response["rfq_id"] == "rfq-exp-1-v2"
    assert existing_rfq.title == "Regenerated RFQ"
    assert db.flushed is True

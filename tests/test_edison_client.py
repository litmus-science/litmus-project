"""
Tests for Edison client response coercion.
"""

from backend.services.edison_client import MockEdisonClient
from backend.types import JsonObject


class DummyVerboseResponse:
    def __init__(self, environment_frame: JsonObject):
        self.status = "success"
        self.metadata: JsonObject = {}
        self.task_id = "task-123"
        self.environment_frame = environment_frame


def test_coerce_task_response_extracts_answer_from_environment_frame() -> None:
    client = MockEdisonClient()
    environment_frame: JsonObject = {
        "state": {
            "state": {
                "response": {
                    "answer": {
                        "answer": "Plain answer",
                        "formatted_answer": "**Formatted answer**",
                        "has_successful_answer": True,
                    }
                }
            }
        }
    }
    response = DummyVerboseResponse(environment_frame)

    coerced = client._coerce_task_response(response)

    assert coerced.answer == "Plain answer"
    assert coerced.formatted_answer == "**Formatted answer**"
    assert coerced.has_successful_answer is True
    assert coerced.success is True

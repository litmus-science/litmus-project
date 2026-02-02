"""
Tests for Edison client response coercion.
"""

from backend.services.edison_client import MockEdisonClient


class DummyVerboseResponse:
    def __init__(self, environment_frame: dict):
        self.status = "success"
        self.metadata = {}
        self.task_id = "task-123"
        self.environment_frame = environment_frame


def test_coerce_task_response_extracts_answer_from_environment_frame():
    client = MockEdisonClient()
    environment_frame = {
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

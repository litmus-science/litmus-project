"""Prompt templates for LLM-based experiment interpretation."""

from .experiment_prompts import (
    SYSTEM_PROMPT,
    get_interpretation_prompt,
    get_experiment_type_context,
)
from .ecl_context import ECL_CONTEXT
from .strateos_context import STRATEOS_CONTEXT

__all__ = [
    "SYSTEM_PROMPT",
    "get_interpretation_prompt",
    "get_experiment_type_context",
    "ECL_CONTEXT",
    "STRATEOS_CONTEXT",
]

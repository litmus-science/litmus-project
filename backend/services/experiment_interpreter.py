"""
Experiment Interpreter Service.

Uses LLM to interpret natural language experiment descriptions
and extract structured parameters for cloud lab translation.
"""

from dataclasses import dataclass, field

from backend.types import JsonObject, JsonValue

from .experiment_types import get_experiment_field_name
from .llm_service import LLMService, get_llm_service
from .prompts import SYSTEM_PROMPT, get_interpretation_prompt


def _as_str_list(value: JsonValue) -> list[str]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    return []


def _as_float(value: JsonValue, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return default


def _as_object(value: JsonValue) -> JsonObject:
    if isinstance(value, dict):
        return value
    return {}


@dataclass
class InterpretationResult:
    """Result of experiment interpretation."""

    success: bool
    enriched_intake: JsonObject
    suggestions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    confidence: float = 0.0
    error: str | None = None


class ExperimentInterpreter:
    """
    Interprets natural language experiment descriptions using LLM.

    Takes user input (hypothesis, notes, experiment type) and extracts
    structured parameters that can be fed to the existing cloud lab translators.
    """

    def __init__(self, llm_service: LLMService | None = None):
        self.llm_service = llm_service or get_llm_service()

    async def interpret(
        self,
        experiment_type: str,
        title: str,
        hypothesis: str,
        notes: str | None = None,
        existing_intake: JsonObject | None = None,
    ) -> InterpretationResult:
        """
        Interpret an experiment description and extract parameters.

        Args:
            experiment_type: The type of experiment (e.g., QPCR_EXPRESSION)
            title: The experiment title
            hypothesis: The hypothesis statement
            notes: Additional notes from the user
            existing_intake: Existing intake data to enhance (optional)

        Returns:
            InterpretationResult with enriched intake and metadata
        """
        # Build the prompt
        prompt = get_interpretation_prompt(
            experiment_type=experiment_type,
            title=title,
            hypothesis=hypothesis,
            notes=notes,
        )

        try:
            # Call LLM to interpret
            result = await self.llm_service.generate_json(
                prompt=prompt,
                system_prompt=SYSTEM_PROMPT,
                temperature=0.1,
                max_tokens=4096,
            )

            # Extract the results
            suggestions = _as_str_list(result.pop("suggestions", []))
            warnings = _as_str_list(result.pop("warnings", []))
            confidence = _as_float(result.pop("confidence", 0.8), default=0.8)

            # Merge with existing intake if provided
            enriched_intake = self._merge_intake(
                existing_intake or {},
                result,
                experiment_type,
                title,
                hypothesis,
            )

            return InterpretationResult(
                success=True,
                enriched_intake=enriched_intake,
                suggestions=suggestions,
                warnings=warnings,
                confidence=confidence,
            )

        except Exception as e:
            error_msg = str(e)

            # Provide helpful error messages for common issues
            if "API_KEY" in error_msg or "api_key" in error_msg.lower():
                error_msg = (
                    "LLM not configured. Set LLM_PROVIDER (anthropic/openai/openrouter) "
                    "and the corresponding API key environment variable "
                    "(ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY)."
                )

            return InterpretationResult(
                success=False,
                enriched_intake=existing_intake or {},
                error=error_msg,
            )

    def _merge_intake(
        self,
        existing: JsonObject,
        interpreted: JsonObject,
        experiment_type: str,
        title: str,
        hypothesis: str,
    ) -> JsonObject:
        """Merge interpreted data with existing intake."""
        # Start with existing data
        result: JsonObject = dict(existing)

        # Ensure required fields
        result["experiment_type"] = experiment_type
        result["title"] = title

        # Set up hypothesis structure if not present
        if "hypothesis" not in result or not isinstance(result["hypothesis"], dict):
            result["hypothesis"] = {}
        hypothesis_section = result["hypothesis"]
        if isinstance(hypothesis_section, dict):
            hypothesis_section["statement"] = hypothesis

        # Merge experiment-specific section
        field_name = get_experiment_field_name(experiment_type)
        if field_name in interpreted:
            if field_name not in result or not isinstance(result[field_name], dict):
                result[field_name] = {}
            base_section = result[field_name]
            interpreted_section = interpreted[field_name]
            if isinstance(base_section, dict) and isinstance(interpreted_section, dict):
                merged = self._deep_merge(
                    base_section,
                    interpreted_section,
                )
                result[field_name] = merged

        # Merge replicates
        if "replicates" in interpreted:
            if "replicates" not in result or not isinstance(result["replicates"], dict):
                result["replicates"] = {}
            base_replicates = result["replicates"]
            interpreted_replicates = interpreted["replicates"]
            if isinstance(base_replicates, dict) and isinstance(interpreted_replicates, dict):
                result["replicates"] = self._deep_merge(
                    base_replicates,
                    interpreted_replicates,
                )

        # Merge materials
        if "materials_provided" in interpreted:
            materials_value = result.get("materials_provided")
            materials: list[JsonValue] = (
                list(materials_value) if isinstance(materials_value, list) else []
            )
            interpreted_materials = interpreted["materials_provided"]
            if isinstance(interpreted_materials, list):
                for material in interpreted_materials:
                    if isinstance(material, str):
                        materials.append({"name": material})
                    else:
                        materials.append(material)
            result["materials_provided"] = materials

        return result

    def _deep_merge(self, base: JsonObject, updates: JsonObject) -> JsonObject:
        """Deep merge two dictionaries, with updates taking precedence."""
        result: JsonObject = dict(base)
        for key, value in updates.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                base_section = _as_object(result[key])
                update_section = _as_object(value)
                result[key] = self._deep_merge(base_section, update_section)
            else:
                result[key] = value
        return result


# Singleton instance
_interpreter: ExperimentInterpreter | None = None


def get_experiment_interpreter() -> ExperimentInterpreter:
    """Get or create the experiment interpreter singleton."""
    global _interpreter
    if _interpreter is None:
        _interpreter = ExperimentInterpreter()
    return _interpreter

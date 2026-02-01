"""Prompt templates for experiment interpretation."""

from .ecl_context import ECL_CONTEXT
from .strateos_context import STRATEOS_CONTEXT
from ..experiment_types import get_experiment_field_name

SYSTEM_PROMPT = f"""You are an expert laboratory scientist and protocol designer. Your role is to interpret natural language experiment descriptions and extract structured parameters for automated cloud laboratory systems.

You have deep knowledge of:
- Molecular biology techniques (PCR, qPCR, sequencing, cloning)
- Cell biology assays (viability, cytotoxicity, IC50 determination)
- Microbiology methods (growth curves, MIC/MBC, zone of inhibition)
- Biochemistry (enzyme kinetics, inhibition assays)

You are translating experiments for two cloud lab platforms:

{ECL_CONTEXT}

{STRATEOS_CONTEXT}

## Your Task

When given an experiment description (hypothesis, notes, type), extract all relevant experimental parameters and return them in a structured JSON format that can be used by the cloud lab translators.

Be thorough but practical:
- Extract explicit parameters mentioned by the user
- Infer reasonable defaults for common parameters not specified
- Flag any ambiguities or missing critical information
- Suggest optimal configurations based on best practices

Always respond with valid JSON matching the schema provided in the prompt.
"""

# Experiment type specific schemas
EXPERIMENT_SCHEMAS = {
    "SANGER_PLASMID_VERIFICATION": {
        "type": "object",
        "properties": {
            "template_type": {"type": "string", "enum": ["plasmid", "pcr_product", "genomic"]},
            "template_concentration_ng_ul": {"type": "number"},
            "primers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "sequence": {"type": "string"},
                        "provided_by": {"type": "string", "enum": ["requester", "operator"]}
                    }
                }
            },
            "expected_insert_size_bp": {"type": "integer"},
            "regions_of_interest": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "start_bp": {"type": "integer"},
                        "end_bp": {"type": "integer"}
                    }
                }
            }
        }
    },
    "QPCR_EXPRESSION": {
        "type": "object",
        "properties": {
            "chemistry": {"type": "string", "enum": ["SYBR_GREEN", "TAQMAN", "OTHER"]},
            "targets": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "gene_symbol": {"type": "string"},
                        "assay_id": {"type": "string"},
                        "primer_sequences": {
                            "type": "object",
                            "properties": {
                                "forward": {"type": "string"},
                                "reverse": {"type": "string"},
                                "probe": {"type": "string"}
                            }
                        }
                    }
                }
            },
            "housekeeping_genes": {"type": "array", "items": {"type": "string"}},
            "sample_type": {"type": "string", "enum": ["cDNA", "RNA", "gDNA", "cells"]},
            "number_of_samples": {"type": "integer"},
            "conditions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"}
                    }
                }
            }
        }
    },
    "CELL_VIABILITY_IC50": {
        "type": "object",
        "properties": {
            "cell_line": {"type": "string"},
            "cell_source": {"type": "string"},
            "assay_type": {"type": "string", "enum": ["CELLTITER_GLO", "MTT", "MTS", "RESAZURIN", "LIVE_DEAD", "OTHER"]},
            "compound_name": {"type": "string"},
            "compound_stock_concentration": {
                "type": "object",
                "properties": {"value": {"type": "number"}, "unit": {"type": "string"}}
            },
            "solvent": {"type": "string"},
            "dose_range": {
                "type": "object",
                "properties": {
                    "min": {"type": "number"},
                    "max": {"type": "number"},
                    "unit": {"type": "string"},
                    "points": {"type": "integer"},
                    "dilution_series": {"type": "string", "enum": ["2-fold", "3-fold", "half-log", "custom"]}
                }
            },
            "exposure_time_hours": {"type": "number"},
            "seeding_density_cells_per_well": {"type": "integer"},
            "plate_format": {"type": "string", "enum": ["96-well", "384-well"]},
            "positive_control": {"type": "string"},
            "include_z_factor": {"type": "boolean"}
        }
    },
    "ENZYME_INHIBITION_IC50": {
        "type": "object",
        "properties": {
            "target_enzyme": {"type": "string"},
            "enzyme_source": {"type": "string"},
            "enzyme_concentration": {
                "type": "object",
                "properties": {"value": {"type": "number"}, "unit": {"type": "string"}}
            },
            "assay_type": {"type": "string", "enum": ["COLORIMETRIC", "FLUOROMETRIC", "LUMINESCENT", "RADIOMETRIC", "COUPLED", "OTHER"]},
            "substrate": {"type": "string"},
            "substrate_concentration": {
                "type": "object",
                "properties": {"value": {"type": "number"}, "unit": {"type": "string"}}
            },
            "inhibitor_name": {"type": "string"},
            "inhibitor_concentrations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"value": {"type": "number"}, "unit": {"type": "string"}}
                }
            },
            "incubation_time_minutes": {"type": "integer"},
            "incubation_temperature_c": {"type": "number"},
            "buffer": {"type": "string"},
            "detection_wavelength_nm": {"type": "integer"},
            "positive_control_inhibitor": {"type": "string"}
        }
    },
    "MICROBIAL_GROWTH_MATRIX": {
        "type": "object",
        "properties": {
            "organism": {"type": "string"},
            "strain": {"type": "string"},
            "media": {"type": "string"},
            "temperature_celsius": {"type": "number"},
            "duration_hours": {"type": "number"},
            "read_interval_minutes": {"type": "number"},
            "shaking": {"type": "boolean"},
            "shaking_rpm": {"type": "integer"},
            "conditions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "variable": {"type": "string"},
                        "value": {"type": "string"}
                    }
                }
            }
        }
    },
    "MIC_MBC_ASSAY": {
        "type": "object",
        "properties": {
            "organism": {"type": "string"},
            "strain": {"type": "string"},
            "antibiotics": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "stock_concentration": {"type": "number"},
                        "unit": {"type": "string"}
                    }
                }
            },
            "method": {"type": "string", "enum": ["BrothMicrodilution", "AgarDilution"]},
            "dilution_factor": {"type": "integer"},
            "number_of_dilutions": {"type": "integer"},
            "starting_concentration": {
                "type": "object",
                "properties": {"value": {"type": "number"}, "unit": {"type": "string"}}
            },
            "incubation_hours": {"type": "number"},
            "incubation_temperature_c": {"type": "number"},
            "include_mbc": {"type": "boolean"}
        }
    },
    "ZONE_OF_INHIBITION": {
        "type": "object",
        "properties": {
            "organism": {"type": "string"},
            "strain": {"type": "string"},
            "compounds": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "concentration": {"type": "number"},
                        "unit": {"type": "string"}
                    }
                }
            },
            "agar_type": {"type": "string"},
            "disk_diameter_mm": {"type": "number"},
            "disk_loading_ul": {"type": "number"},
            "incubation_hours": {"type": "number"},
            "incubation_temperature_c": {"type": "number"}
        }
    },
    "CUSTOM": {
        "type": "object",
        "properties": {
            "description": {"type": "string"},
            "protocol_steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "step_number": {"type": "integer"},
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "duration": {"type": "string"},
                        "temperature": {"type": "string"},
                        "equipment": {"type": "array", "items": {"type": "string"}},
                        "reagents": {"type": "array", "items": {"type": "string"}},
                        "critical_parameters": {"type": "array", "items": {"type": "string"}}
                    }
                }
            }
        }
    }
}


def get_experiment_type_context(experiment_type: str) -> str:
    """Get the context and schema for a specific experiment type."""
    schema = EXPERIMENT_SCHEMAS.get(experiment_type, EXPERIMENT_SCHEMAS["CUSTOM"])
    import json
    return f"""
## Experiment Type: {experiment_type}

Expected output schema for the experiment-specific section:
```json
{json.dumps(schema, indent=2)}
```
"""


def get_interpretation_prompt(
    experiment_type: str,
    title: str,
    hypothesis: str,
    notes: str | None = None,
    additional_context: str | None = None,
) -> str:
    """
    Generate the interpretation prompt for an experiment.

    Args:
        experiment_type: The type of experiment (e.g., QPCR_EXPRESSION)
        title: The experiment title
        hypothesis: The hypothesis statement
        notes: Additional notes from the user
        additional_context: Any additional context to include

    Returns:
        The formatted prompt for the LLM
    """
    type_context = get_experiment_type_context(experiment_type)
    field_name = get_experiment_field_name(experiment_type)

    prompt = f"""
{type_context}

## User's Experiment Description

**Title:** {title}

**Hypothesis:** {hypothesis}

**Additional Notes:** {notes or "None provided"}

{additional_context or ""}

## Instructions

Based on the above experiment description, extract the experimental parameters and return a JSON object with:

1. A "{field_name}" key containing the experiment-specific parameters matching the schema above
2. A "replicates" key with:
   - "technical": number of technical replicates (default: 3)
   - "biological": number of biological replicates (default: 1)
3. A "materials_provided" key listing any materials the user mentioned they will provide
4. A "suggestions" key with an array of recommendations for improving the experimental design
5. A "warnings" key with an array of potential issues or missing information
6. A "confidence" key with a value from 0.0 to 1.0 indicating how confident you are in the interpretation

Return ONLY valid JSON. Do not include any explanation outside the JSON.

Example structure:
```json
{{
  "{field_name}": {{
    // experiment-specific parameters
  }},
  "replicates": {{
    "technical": 3,
    "biological": 1
  }},
  "materials_provided": [],
  "suggestions": [],
  "warnings": [],
  "confidence": 0.85
}}
```
"""
    return prompt

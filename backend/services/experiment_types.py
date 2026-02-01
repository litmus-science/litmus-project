"""
Shared experiment type mappings used across services.
"""

EXPERIMENT_TYPE_FIELD_MAP = {
    "SANGER_PLASMID_VERIFICATION": "sanger",
    "QPCR_EXPRESSION": "qpcr",
    "CELL_VIABILITY_IC50": "cell_viability",
    "ENZYME_INHIBITION_IC50": "enzyme_inhibition",
    "MICROBIAL_GROWTH_MATRIX": "microbial_growth",
    "MIC_MBC_ASSAY": "mic_mbc",
    "ZONE_OF_INHIBITION": "zone_of_inhibition",
    "CUSTOM": "custom_protocol",
}


def get_experiment_field_name(experiment_type: str) -> str:
    """Map experiment type to its intake field name."""
    return EXPERIMENT_TYPE_FIELD_MAP.get(experiment_type, "custom_protocol")

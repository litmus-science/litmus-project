"""
SLL (Symbolic Lab Language) templates for ECL experiments.

SLL is built on Wolfram Language (Mathematica) syntax. These templates
generate valid SLL code for various experiment types.

See: https://www.emeraldcloudlab.com/documentation/functions/
"""

from typing import Any


def format_value(value: Any, unit: str | None = None) -> str:
    """
    Format a value for SLL syntax.

    Examples:
        format_value(10, "Microliter") -> "10 Microliter"
        format_value(37, "Celsius") -> "37 Celsius"
        format_value("sample-1") -> '"sample-1"'
        format_value([1, 2, 3]) -> "{1, 2, 3}"
    """
    if value is None:
        return "Null"

    if isinstance(value, bool):
        return "True" if value else "False"

    if isinstance(value, (int, float)):
        if unit:
            return f"{value} {unit}"
        return str(value)

    if isinstance(value, str):
        return f'"{value}"'

    if isinstance(value, list):
        items = [format_value(v, None) for v in value]
        return "{" + ", ".join(items) + "}"

    if isinstance(value, dict):
        # Association syntax
        items = [f'"{k}" -> {format_value(v, None)}' for k, v in value.items()]
        return "<|" + ", ".join(items) + "|>"

    return str(value)


def object_ref(obj_type: str, obj_id: str) -> str:
    """Create an ECL object reference."""
    return f'Object[{obj_type}, "{obj_id}"]'


def sample_ref(sample_id: str) -> str:
    """Create a sample object reference."""
    return object_ref("Sample", sample_id)


def container_ref(container_id: str) -> str:
    """Create a container object reference."""
    return object_ref("Container", container_id)


def model_ref(model_type: str, model_name: str) -> str:
    """Create a model reference."""
    return f'Model[{model_type}, "{model_name}"]'


def option(name: str, value: Any, unit: str | None = None) -> str:
    """Create an option assignment."""
    return f"{name} -> {format_value(value, unit)}"


def experiment_call(func_name: str, samples: list[str], options: list[str]) -> str:
    """
    Build an experiment function call.

    Args:
        func_name: The experiment function name (e.g., "ExperimentqPCR")
        samples: List of sample references
        options: List of option strings

    Returns:
        Complete SLL function call string
    """
    samples_str = "{" + ", ".join(samples) + "}" if len(samples) > 1 else samples[0]
    options_str = ",\n  ".join(options)

    return f"""{func_name}[
  {samples_str},
  {options_str}
]"""


# Unit conversions for common SLL units
UNITS = {
    # Volume
    "μL": "Microliter",
    "uL": "Microliter",
    "mL": "Milliliter",
    "L": "Liter",
    # Concentration
    "μM": "Micromolar",
    "uM": "Micromolar",
    "mM": "Millimolar",
    "M": "Molar",
    "nM": "Nanomolar",
    "ng/μL": "Nanogram/Microliter",
    "ng/uL": "Nanogram/Microliter",
    # Temperature
    "°C": "Celsius",
    "C": "Celsius",
    # Time
    "s": "Second",
    "sec": "Second",
    "min": "Minute",
    "h": "Hour",
    "hr": "Hour",
    # Length
    "bp": "Basepair",
    "kb": "Kilobasepair",
    "nm": "Nanometer",
    # Mass
    "g": "Gram",
    "mg": "Milligram",
    "μg": "Microgram",
    "ug": "Microgram",
}


def convert_unit(unit: str) -> str:
    """Convert common unit abbreviations to SLL unit names."""
    return UNITS.get(unit, unit)


# Experiment-specific templates

def experiment_sequencing(
    samples: list[str],
    primers: list[str] | None = None,
    method: str = "Sanger",
    read_length: int | None = None,
    coverage: str | None = None
) -> str:
    """
    Generate ExperimentSequencing SLL code.

    ECL function: ExperimentSequencing
    """
    options = [
        option("Method", method),
    ]

    if primers:
        options.append(option("Primers", primers))

    if read_length:
        options.append(option("ReadLength", read_length, "Basepair"))

    if coverage:
        coverage_map = {
            "single_end": "SingleEnd",
            "double_end": "DoubleEnd",
            "tiled": "Tiled"
        }
        options.append(option("Coverage", coverage_map.get(coverage, coverage)))

    return experiment_call("ExperimentSequencing", samples, options)


def experiment_qpcr(
    samples: list[str],
    primers: list[dict],
    probes: list[dict] | None = None,
    reference_samples: list[str] | None = None,
    number_of_replicates: int = 3,
    reaction_volume: float = 20,
    master_mix: str | None = None,
    reverse_transcription: bool = False
) -> str:
    """
    Generate ExperimentqPCR SLL code.

    ECL function: ExperimentqPCR
    """
    options = []

    # Format primers
    primer_refs = []
    for p in primers:
        if "object_id" in p:
            primer_refs.append(sample_ref(p["object_id"]))
        else:
            # Create inline primer spec
            primer_refs.append(f'<|"Forward" -> "{p.get("forward", "")}", "Reverse" -> "{p.get("reverse", "")}"|>')
    options.append(f"Primers -> {{{', '.join(primer_refs)}}}")

    if probes:
        probe_refs = [sample_ref(p.get("object_id", p.get("name", ""))) for p in probes]
        options.append(f"Probes -> {{{', '.join(probe_refs)}}}")

    if reference_samples:
        ref_refs = [sample_ref(s) for s in reference_samples]
        options.append(f"ReferenceSamples -> {{{', '.join(ref_refs)}}}")

    options.append(option("NumberOfReplicates", number_of_replicates))
    options.append(option("ReactionVolume", reaction_volume, "Microliter"))

    if master_mix:
        options.append(option("MasterMix", model_ref("Sample", master_mix)))

    if reverse_transcription:
        options.append(option("ReverseTranscription", True))

    return experiment_call("ExperimentqPCR", samples, options)


def experiment_cell_viability(
    cells: str,
    compounds: list[dict],
    assay_method: str = "MTT",
    concentration_range: tuple[float, float] | None = None,
    incubation_time: float = 48,
    plate_format: int = 96,
    replicates: int = 3
) -> str:
    """
    Generate ExperimentCellViability SLL code.

    ECL function: ExperimentCellViability
    """
    options = []

    # Format compounds
    compound_refs = []
    for c in compounds:
        if "object_id" in c:
            compound_refs.append(sample_ref(c["object_id"]))
        else:
            compound_refs.append(f'"{c.get("name", "Unknown")}"')
    options.append(f"Compounds -> {{{', '.join(compound_refs)}}}")

    # Assay method mapping
    method_map = {
        "MTT": "MTT",
        "XTT": "XTT",
        "RESAZURIN": "Resazurin",
        "CELLTITER_GLO": "CellTiterGlo",
        "CALCEIN_AM": "CalceinAM"
    }
    options.append(option("Method", method_map.get(assay_method, assay_method)))

    if concentration_range:
        options.append(f"ConcentrationRange -> {{{concentration_range[0]} Micromolar, {concentration_range[1]} Micromolar}}")

    options.append(option("IncubationTime", incubation_time, "Hour"))
    options.append(option("PlateFormat", plate_format))
    options.append(option("NumberOfReplicates", replicates))

    return experiment_call("ExperimentCellViability", [sample_ref(cells)], options)


def experiment_enzyme_activity(
    enzyme: str,
    substrate: str,
    inhibitors: list[dict] | None = None,
    concentration_range: tuple[float, float] | None = None,
    assay_time: float = 30,
    temperature: float = 37,
    detection_wavelength: int = 405,
    replicates: int = 3
) -> str:
    """
    Generate ExperimentEnzymeActivity SLL code.

    ECL function: ExperimentEnzymeActivity
    """
    options = [
        option("Substrate", sample_ref(substrate)),
        option("Temperature", temperature, "Celsius"),
        option("AssayTime", assay_time, "Minute"),
        option("DetectionWavelength", detection_wavelength, "Nanometer"),
        option("NumberOfReplicates", replicates),
    ]

    if inhibitors:
        inhibitor_refs = []
        for i in inhibitors:
            if "object_id" in i:
                inhibitor_refs.append(sample_ref(i["object_id"]))
            else:
                inhibitor_refs.append(f'"{i.get("name", "Unknown")}"')
        options.append(f"Inhibitors -> {{{', '.join(inhibitor_refs)}}}")

    if concentration_range:
        options.append(f"InhibitorConcentrationRange -> {{{concentration_range[0]} Micromolar, {concentration_range[1]} Micromolar}}")

    return experiment_call("ExperimentEnzymeActivity", [sample_ref(enzyme)], options)


def experiment_growth_curve(
    samples: list[str],
    media: str = "LB",
    temperature: float = 37,
    duration: float = 24,
    read_interval: float = 30,
    shaking: bool = True,
    shaking_rate: int = 200
) -> str:
    """
    Generate ExperimentGrowthCurve SLL code.

    ECL function: ExperimentGrowthCurve
    """
    sample_refs = [sample_ref(s) for s in samples]

    options = [
        option("Media", model_ref("Sample", media)),
        option("Temperature", temperature, "Celsius"),
        option("Duration", duration, "Hour"),
        option("ReadInterval", read_interval, "Minute"),
        option("Shaking", shaking),
    ]

    if shaking:
        options.append(option("ShakingRate", shaking_rate, "RPM"))

    return experiment_call("ExperimentGrowthCurve", sample_refs, options)


def experiment_antibiotic_susceptibility(
    organisms: list[str],
    antibiotics: list[dict],
    method: str = "BrothMicrodilution",
    dilution_factor: int = 2,
    num_dilutions: int = 8,
    incubation_time: float = 18,
    temperature: float = 37
) -> str:
    """
    Generate ExperimentAntibioticSusceptibility SLL code.

    ECL function: ExperimentAntibioticSusceptibility (MIC/MBC)
    """
    organism_refs = [sample_ref(o) for o in organisms]

    options = []

    # Format antibiotics
    antibiotic_refs = []
    for a in antibiotics:
        if "object_id" in a:
            antibiotic_refs.append(sample_ref(a["object_id"]))
        else:
            antibiotic_refs.append(f'"{a.get("name", "Unknown")}"')
    options.append(f"Antibiotics -> {{{', '.join(antibiotic_refs)}}}")

    method_map = {
        "BrothMicrodilution": "BrothMicrodilution",
        "AgarDilution": "AgarDilution",
        "DiskDiffusion": "DiskDiffusion",
        "Etest": "Etest"
    }
    options.append(option("Method", method_map.get(method, method)))
    options.append(option("DilutionFactor", dilution_factor))
    options.append(option("NumberOfDilutions", num_dilutions))
    options.append(option("IncubationTime", incubation_time, "Hour"))
    options.append(option("Temperature", temperature, "Celsius"))

    return experiment_call("ExperimentAntibioticSusceptibility", organism_refs, options)


def experiment_disk_diffusion(
    organisms: list[str],
    compounds: list[dict],
    agar_type: str = "MuellerHinton",
    disk_concentration: str | None = None,
    incubation_time: float = 18,
    temperature: float = 37
) -> str:
    """
    Generate ExperimentDiskDiffusion SLL code for zone of inhibition assays.

    ECL function: ExperimentDiskDiffusion
    """
    organism_refs = [sample_ref(o) for o in organisms]

    options = []

    # Format compounds
    compound_refs = []
    for c in compounds:
        if "object_id" in c:
            compound_refs.append(sample_ref(c["object_id"]))
        else:
            compound_refs.append(f'"{c.get("name", "Unknown")}"')
    options.append(f"Compounds -> {{{', '.join(compound_refs)}}}")

    options.append(option("AgarType", model_ref("Sample", agar_type)))
    options.append(option("IncubationTime", incubation_time, "Hour"))
    options.append(option("Temperature", temperature, "Celsius"))

    if disk_concentration:
        options.append(option("DiskConcentration", disk_concentration))

    return experiment_call("ExperimentDiskDiffusion", organism_refs, options)


def custom_protocol(
    name: str,
    description: str,
    steps: list[dict]
) -> str:
    """
    Generate a custom protocol structure.

    For custom protocols, we generate a commented structure that
    requires manual review and potentially custom SLL development.
    """
    lines = [
        f'(* Custom Protocol: {name} *)',
        f'(* Description: {description} *)',
        '',
        '(* Protocol Steps - Requires manual SLL implementation: *)',
    ]

    for i, step in enumerate(steps, 1):
        step_name = step.get("name", f"Step {i}")
        step_desc = step.get("description", "No description")
        lines.append(f'(* Step {i}: {step_name} *)')
        lines.append(f'(*   {step_desc} *)')
        lines.append('')

    lines.append('(* Please contact ECL support for custom protocol implementation *)')

    return '\n'.join(lines)

"""
Autoprotocol instruction builders for Strateos.

These functions build the JSON structure for Autoprotocol instructions.
See: https://autoprotocol.org/specification/
"""

from typing import Any


def ref(container_type: str, storage: str | None = None, discard: bool = False) -> dict:
    """
    Create a container reference definition.

    Args:
        container_type: Type of container (e.g., "96-pcr", "96-flat")
        storage: Storage condition if keeping (e.g., "cold_4", "ambient")
        discard: Whether to discard after protocol

    Returns:
        Dict for the refs section value
    """
    ref_def = {"new": container_type}
    if discard:
        ref_def["discard"] = True
    elif storage:
        ref_def["store"] = {"where": storage}
    return ref_def


def existing_ref(container_id: str, storage: str | None = None, discard: bool = False) -> dict:
    """Reference an existing container by ID."""
    ref_def = {"id": container_id}
    if discard:
        ref_def["discard"] = True
    elif storage:
        ref_def["store"] = {"where": storage}
    return ref_def


def seal(container: str, seal_type: str = "foil") -> dict:
    """Seal a container."""
    return {
        "op": "seal",
        "object": container,
        "type": seal_type
    }


def unseal(container: str) -> dict:
    """Unseal a container."""
    return {
        "op": "unseal",
        "object": container
    }


def spin(container: str, acceleration: str, duration: str) -> dict:
    """
    Centrifuge a container.

    Args:
        container: Container reference
        acceleration: e.g., "1000:g"
        duration: e.g., "5:minute"
    """
    return {
        "op": "spin",
        "object": container,
        "acceleration": acceleration,
        "duration": duration
    }


def incubate(container: str, where: str, duration: str, shaking: bool = False,
             co2_percent: float | None = None) -> dict:
    """
    Incubate a container.

    Args:
        container: Container reference
        where: Location (e.g., "warm_37", "cold_4", "ambient")
        duration: e.g., "24:hour"
        shaking: Whether to shake during incubation
        co2_percent: CO2 percentage for cell culture
    """
    instr = {
        "op": "incubate",
        "object": container,
        "where": where,
        "duration": duration,
        "shaking": shaking
    }
    if co2_percent is not None:
        instr["co2_percent"] = co2_percent
    return instr


def thermocycle(container: str, groups: list[dict], lid_temperature: str | None = None,
                volume: str | None = None, dataref: str | None = None) -> dict:
    """
    Perform thermal cycling (PCR).

    Args:
        container: Container reference
        groups: List of cycle groups, each with "cycles" and "steps"
        lid_temperature: e.g., "97:celsius"
        volume: Reaction volume, e.g., "20:microliter"
        dataref: Data reference name
    """
    instr = {
        "op": "thermocycle",
        "object": container,
        "groups": groups
    }
    if lid_temperature:
        instr["lid_temperature"] = lid_temperature
    if volume:
        instr["volume"] = volume
    if dataref:
        instr["dataref"] = dataref
    return instr


def thermocycle_step(temperature: str, duration: str, read: bool = False) -> dict:
    """Create a single thermocycle step."""
    step = {"temperature": temperature, "duration": duration}
    if read:
        step["read"] = True
    return step


def thermocycle_group(cycles: int, steps: list[dict]) -> dict:
    """Create a thermocycle group (repeated cycles)."""
    return {"cycles": cycles, "steps": steps}


def dispense(container: str, reagent: str, columns: list[dict]) -> dict:
    """
    Dispense reagent into a container.

    Args:
        container: Container reference
        reagent: Reagent identifier
        columns: List of {"column": int, "volume": str}
    """
    return {
        "op": "dispense",
        "object": container,
        "reagent": reagent,
        "columns": columns
    }


def transfer(source: str, source_well: str, dest: str, dest_well: str,
             volume: str, mix_after: dict | None = None) -> dict:
    """
    Transfer liquid between wells.

    Args:
        source: Source container reference
        source_well: Source well (e.g., "A1")
        dest: Destination container reference
        dest_well: Destination well
        volume: Volume to transfer, e.g., "10:microliter"
        mix_after: Optional mixing parameters
    """
    transfer_def = {
        "from": f"{source}/{source_well}",
        "to": f"{dest}/{dest_well}",
        "volume": volume
    }
    if mix_after:
        transfer_def["mix_after"] = mix_after
    return transfer_def


def pipette(groups: list[dict]) -> dict:
    """
    General pipetting instruction with multiple transfers.

    Args:
        groups: List of transfer groups
    """
    return {
        "op": "pipette",
        "groups": groups
    }


def absorbance(container: str, wells: list[str], wavelength: str, dataref: str,
               num_flashes: int = 25) -> dict:
    """
    Measure absorbance.

    Args:
        container: Container reference
        wells: List of wells to measure
        wavelength: e.g., "260:nanometer"
        dataref: Data reference name
        num_flashes: Number of flashes per read
    """
    return {
        "op": "absorbance",
        "object": container,
        "wells": wells,
        "wavelength": wavelength,
        "num_flashes": num_flashes,
        "dataref": dataref
    }


def fluorescence(container: str, wells: list[str], excitation: str, emission: str,
                 dataref: str, num_flashes: int = 25, gain: float | None = None) -> dict:
    """
    Measure fluorescence.

    Args:
        container: Container reference
        wells: List of wells to measure
        excitation: Excitation wavelength, e.g., "485:nanometer"
        emission: Emission wavelength, e.g., "535:nanometer"
        dataref: Data reference name
    """
    instr = {
        "op": "fluorescence",
        "object": container,
        "wells": wells,
        "excitation": excitation,
        "emission": emission,
        "num_flashes": num_flashes,
        "dataref": dataref
    }
    if gain is not None:
        instr["gain"] = gain
    return instr


def luminescence(container: str, wells: list[str], dataref: str,
                 integration_time: str | None = None) -> dict:
    """
    Measure luminescence.

    Args:
        container: Container reference
        wells: List of wells to measure
        dataref: Data reference name
        integration_time: e.g., "1:second"
    """
    instr = {
        "op": "luminescence",
        "object": container,
        "wells": wells,
        "dataref": dataref
    }
    if integration_time:
        instr["integration_time"] = integration_time
    return instr


def sangerseq(container: str, wells: list[str], dataref: str,
              primer: dict | None = None, type_: str = "standard") -> dict:
    """
    Perform Sanger sequencing.

    Args:
        container: Container reference
        wells: List of wells to sequence
        dataref: Data reference name
        primer: Primer container/well reference
        type_: Sequencing type ("standard" or "rca")
    """
    instr = {
        "op": "sanger_sequence",
        "object": container,
        "wells": wells,
        "dataref": dataref,
        "type": type_
    }
    if primer:
        instr["primer"] = primer
    return instr


def image_plate(container: str, dataref: str, mode: str = "top",
                magnification: float = 1.0) -> dict:
    """
    Image a plate.

    Args:
        container: Container reference
        dataref: Data reference name
        mode: "top" or "bottom"
        magnification: Magnification level
    """
    return {
        "op": "image_plate",
        "object": container,
        "dataref": dataref,
        "mode": mode,
        "magnification": magnification
    }


def cover(container: str, lid: str = "standard") -> dict:
    """Cover a container with a lid."""
    return {
        "op": "cover",
        "object": container,
        "lid": lid
    }


def uncover(container: str) -> dict:
    """Remove lid from a container."""
    return {
        "op": "uncover",
        "object": container
    }


def agitate(container: str, mode: str, duration: str, speed: str | None = None) -> dict:
    """
    Agitate a container.

    Args:
        container: Container reference
        mode: "vortex", "shake_orbital", "stir_bar", etc.
        duration: e.g., "30:second"
        speed: e.g., "500:rpm"
    """
    instr = {
        "op": "agitate",
        "object": container,
        "mode": mode,
        "duration": duration
    }
    if speed:
        instr["speed"] = speed
    return instr


def provision(container: str, wells: list[dict], resource_id: str) -> dict:
    """
    Provision a resource into wells.

    Args:
        container: Container reference
        wells: List of {"well": str, "volume": str}
        resource_id: ID of the resource to provision
    """
    return {
        "op": "provision",
        "to": [{"well": f"{container}/{w['well']}", "volume": w["volume"]} for w in wells],
        "resource_id": resource_id
    }


# Helper functions for building well lists

def well_range(start_col: int, end_col: int, rows: str = "ABCDEFGH") -> list[str]:
    """Generate a list of wells from start to end column across all rows."""
    wells = []
    for row in rows:
        for col in range(start_col, end_col + 1):
            wells.append(f"{row}{col}")
    return wells


def all_wells_96() -> list[str]:
    """Return all wells of a 96-well plate."""
    return well_range(1, 12, "ABCDEFGH")


def column_wells(column: int, rows: str = "ABCDEFGH") -> list[str]:
    """Return all wells in a specific column."""
    return [f"{row}{column}" for row in rows]


def row_wells(row: str, columns: int = 12) -> list[str]:
    """Return all wells in a specific row."""
    return [f"{row}{col}" for col in range(1, columns + 1)]

"""Strateos context for LLM prompts.

This provides the LLM with knowledge about Strateos's Autoprotocol
format and available instructions.
"""

STRATEOS_CONTEXT = """
## Strateos - Autoprotocol Format

Strateos uses Autoprotocol, a JSON-based protocol specification.
See: https://autoprotocol.org/specification/

### Protocol Structure:

```json
{
  "version": "1.0",
  "refs": {
    "container_name": {
      "new": "96-pcr",
      "store": {"where": "cold_4"}
    }
  },
  "instructions": [
    {"op": "instruction_name", ...}
  ]
}
```

### Container Types:
- 96-pcr: 96-well PCR plate
- 96-flat: 96-well flat-bottom plate
- 96-deep: 96-well deep well plate
- 384-flat: 384-well flat-bottom plate

### Storage Locations:
- cold_4: 4°C refrigerator
- cold_20: -20°C freezer
- cold_80: -80°C freezer
- warm_37: 37°C incubator
- ambient: Room temperature

### Available Instructions:

1. **seal** - Seal a container
   - op: "seal"
   - object: container reference
   - type: "foil", "ultra-clear", "breathable"

2. **unseal** - Remove seal from container

3. **spin** - Centrifuge
   - acceleration: "1000:g"
   - duration: "5:minute"

4. **incubate** - Incubate container
   - where: "warm_37", "cold_4", "ambient"
   - duration: "24:hour"
   - shaking: true/false
   - co2_percent: 5.0 (for cell culture)

5. **thermocycle** - PCR thermal cycling
   - groups: [{cycles: N, steps: [{temperature, duration}]}]
   - lid_temperature: "97:celsius"
   - volume: "20:microliter"
   - dataref: "pcr_data"

6. **pipette** - Liquid transfers
   - groups: [{transfer: [{from, to, volume}]}]

7. **dispense** - Bulk reagent dispense
   - reagent: reagent ID
   - columns: [{column: N, volume: "X:microliter"}]

8. **absorbance** - Measure absorbance
   - wavelength: "260:nanometer"
   - wells: ["A1", "A2", ...]
   - dataref: "abs_data"

9. **fluorescence** - Measure fluorescence
   - excitation: "485:nanometer"
   - emission: "535:nanometer"

10. **luminescence** - Measure luminescence
    - integration_time: "1:second"

11. **sanger_sequence** - Sanger sequencing
    - type: "standard" or "rca"
    - wells: ["A1", ...]
    - dataref: "seq_data"

12. **image_plate** - Plate imaging
    - mode: "top" or "bottom"
    - magnification: 1.0

### Unit Format:
Units use colon notation: "value:unit"
- "10:microliter"
- "37:celsius"
- "5:minute"
- "1000:g"

### Well References:
- Single well: "plate_name/A1"
- Well list: ["A1", "A2", "B1", "B2"]
- Column: all wells in column 1 = ["A1", "B1", "C1", ...]
- Row: all wells in row A = ["A1", "A2", "A3", ...]
"""

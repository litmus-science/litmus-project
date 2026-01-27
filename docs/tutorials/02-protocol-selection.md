# Tutorial 2: Choosing the Right Protocol

You have a hypothesis. Now you need a way to test it. This tutorial covers how to select from Litmus standard templates, customize them, or design a custom protocol.

## The Protocol Decision Tree

```
Do you know exactly what assay you need?
├── YES → Is it a common, standardized assay?
│         ├── YES → Use a Litmus template
│         └── NO  → Submit a custom protocol
└── NO  → Request protocol design assistance
```

Most users fall into one of three categories:
1. **Expert in the field**: Knows the exact protocol, submits custom
2. **Knows the assay type**: Uses a template with parameters
3. **Has hypothesis, needs guidance**: Requests protocol design

## Option 1: Standard Templates

Litmus maintains validated templates for common experiment types. Using a template means:
- Faster matching with qualified operators
- Predictable pricing
- Known turnaround times
- Quality-controlled protocols

### Example: Enzyme Inhibition Assay

If your hypothesis is "Compound X inhibits Enzyme Y," you'd use the enzyme inhibition template:

```json
{
  "protocol": {
    "type": "standard_template",
    "template_id": "enzyme-inhibition-colorimetric-v1",
    "template_parameters": {
      "enzyme": "β-galactosidase",
      "enzyme_source": "E. coli, Sigma G4155",
      "enzyme_concentration": "0.5 U/mL",
      "substrate": "ONPG",
      "substrate_concentration": "4 mM",
      "compound_concentrations_uM": [0, 0.1, 1, 10, 100, 1000],
      "incubation_time_minutes": 30,
      "incubation_temperature_C": 37,
      "detection_wavelength_nm": 420,
      "buffer": "Z-buffer, pH 7.0",
      "replicates": 3
    },
    "materials": [
      {
        "name": "Test compound",
        "specification": "≥95% purity, dissolved in DMSO",
        "quantity": { "value": 10, "unit": "mg" },
        "provided_by_requester": true
      }
    ]
  }
}
```

The template defines the protocol steps. You just fill in the parameters.

### Browsing Available Templates

Use the API to find templates:

```bash
GET /templates?category=biochemistry&bsl_level=BSL-1
```

Or browse by common experiment types:
- **Enzyme assays**: inhibition, kinetics, activity
- **Microbiology**: MIC/MBC, growth curves, zone of inhibition
- **Cell biology**: viability, proliferation, cytotoxicity
- **Molecular biology**: PCR, gel electrophoresis, cloning verification
- **Analytical**: HPLC, mass spec, spectroscopy

## Option 2: Custom Protocol

If you have a specific protocol that's not templated, submit it in full:

```json
{
  "protocol": {
    "type": "custom",
    "custom_protocol": {
      "title": "Modified Kirby-Bauer Disk Diffusion",
      "version": "1.0",
      "steps": [
        {
          "step_number": 1,
          "action": "Prepare Mueller-Hinton agar plates. Pour 25mL of molten MH agar into 100mm Petri dishes. Allow to solidify at room temperature for 30 minutes.",
          "duration": { "value": 30, "unit": "minutes" },
          "temperature": { "value": 25, "unit": "C", "tolerance": 5 },
          "expected_outcome": "Solid, even agar surface with no bubbles"
        },
        {
          "step_number": 2,
          "action": "Prepare bacterial inoculum. Suspend colonies from overnight culture in sterile saline to 0.5 McFarland standard (approximately 1.5 × 10^8 CFU/mL). Verify turbidity with densitometer.",
          "critical_parameters": ["McFarland standard must be 0.5 ± 0.05"],
          "expected_outcome": "Turbid suspension matching 0.5 McFarland"
        },
        {
          "step_number": 3,
          "action": "Inoculate plates. Dip sterile swab into inoculum, express excess liquid, streak entire agar surface in three directions rotating plate 60° between streaks.",
          "expected_outcome": "Even lawn coverage, no pooling"
        },
        {
          "step_number": 4,
          "action": "Apply test compound disks. Using sterile forceps, place 6mm paper disks loaded with test compound (10μL at specified concentrations) onto agar surface. Press gently to ensure contact. Include positive control (ampicillin 10μg) and negative control (DMSO vehicle).",
          "critical_parameters": ["Disks must be at least 24mm apart", "Maximum 6 disks per 100mm plate"]
        },
        {
          "step_number": 5,
          "action": "Incubate plates inverted at 37°C for 18 hours.",
          "duration": { "value": 18, "unit": "hours" },
          "temperature": { "value": 37, "unit": "C", "tolerance": 1 }
        },
        {
          "step_number": 6,
          "action": "Measure zone of inhibition. Using digital calipers, measure diameter of clear zone around each disk. Record to nearest 0.1mm. Photograph each plate with ruler for scale.",
          "expected_outcome": "Clear zones visible around active compounds"
        }
      ],
      "safety_notes": [
        "BSL-2 practices required for handling bacterial cultures",
        "Dispose of all materials in biohazard waste",
        "Autoclave plates before disposal"
      ]
    },
    "materials": [
      { "name": "Mueller-Hinton agar", "specification": "BD Difco 225250", "quantity": { "value": 500, "unit": "mL" } },
      { "name": "Bacterial strain", "specification": "E. coli ATCC 25922", "provided_by_requester": false },
      { "name": "Test compound", "provided_by_requester": true, "quantity": { "value": 5, "unit": "mg" } },
      { "name": "Ampicillin disks", "specification": "10μg, Oxoid CT0003B" },
      { "name": "Blank paper disks", "specification": "6mm, Whatman" }
    ],
    "equipment": [
      { "name": "Densitometer", "specifications": "0.5 McFarland capability" },
      { "name": "Digital calipers", "specifications": "0.1mm resolution" },
      { "name": "Incubator", "specifications": "37°C ± 1°C" }
    ],
    "replicates": {
      "technical_replicates": 3,
      "biological_replicates": 2
    }
  }
}
```

### Custom Protocol Requirements

Your protocol must include:
1. **Numbered steps** with clear actions
2. **Critical parameters** that must be followed exactly
3. **Expected outcomes** so the operator knows if it's working
4. **Materials list** with enough specificity to source correctly
5. **Equipment list** so we can match you with capable operators

Optional but helpful:
- Troubleshooting tips
- Duration estimates
- Safety notes
- References to published methods

## Option 3: Protocol Design Requested

Don't know the exact protocol? That's fine. Describe what you need to accomplish:

```json
{
  "protocol": {
    "type": "protocol_design_requested",
    "protocol_design_brief": "I need to test whether my compound (a small molecule, MW ~350, soluble in DMSO up to 10mM) has antibacterial activity against E. coli and S. aureus. I want to determine the minimum inhibitory concentration (MIC) if there is activity. I have about 50mg of compound available. I don't have a preference for specific method as long as it gives quantitative MIC values. Budget is flexible up to $800.",
    "materials": [
      {
        "name": "Test compound",
        "specification": "Small molecule, MW 350, >95% purity",
        "quantity": { "value": 50, "unit": "mg" },
        "provided_by_requester": true,
        "storage_requirements": "-20°C, desiccated"
      }
    ]
  }
}
```

When you request protocol design:
1. Litmus reviews your hypothesis and brief
2. We propose a protocol (usually within 48 hours)
3. You review and approve before execution begins
4. Price is confirmed with the protocol proposal

## Materials: Who Provides What?

Materials can be:
- **Provided by requester**: You ship them to the operator
- **Sourced by operator**: Included in the quoted price

### When to Provide Materials

Provide materials when:
- It's your proprietary compound
- It's a specific lot you need tested
- It's not commercially available
- You already have it and it's cheaper than buying new

### Material Shipping Requirements

If you're providing materials:
```json
{
  "name": "Test compound ABC-123",
  "specification": "≥95% purity by HPLC, lot #2024-001",
  "quantity": { "value": 25, "unit": "mg" },
  "provided_by_requester": true,
  "storage_requirements": "-20°C, protected from light",
  "cas_number": "123456-78-9"
}
```

You'll receive shipping instructions after an operator claims your job.

## Equipment Requirements

Be specific about required equipment:

```json
{
  "equipment": [
    {
      "name": "Plate reader",
      "specifications": "Absorbance at 405nm, 96-well plate capability",
      "alternatives_acceptable": true
    },
    {
      "name": "HPLC system",
      "specifications": "C18 column, UV-Vis detection at 254nm",
      "alternatives_acceptable": false,
      "calibration_required": true
    }
  ]
}
```

Setting `alternatives_acceptable: false` means the operator must have exactly what you specified. This limits your operator pool but ensures specific capabilities.

## Replicates: How Many Do You Need?

### Technical Replicates
Same sample measured multiple times. Controls for measurement variability.
- Minimum: 3 (allows outlier detection)
- Typical: 3-6

### Biological Replicates
Independent samples (different cell passages, different bacterial colonies, etc.). Controls for biological variability.
- Minimum: 1 (if you just need a preliminary answer)
- Recommended: 3 (for publishable results)
- More if high variability expected

```json
{
  "replicates": {
    "technical_replicates": 3,
    "biological_replicates": 3
  }
}
```

**Cost implication**: More replicates = more materials, time, and cost. Start with fewer for preliminary experiments, increase for definitive tests.

## Putting It Together

Here's a complete protocol section using a template:

```json
{
  "protocol": {
    "type": "standard_template",
    "template_id": "mic-broth-microdilution-v2",
    "template_parameters": {
      "organism": "Escherichia coli ATCC 25922",
      "medium": "Mueller-Hinton broth",
      "compound_stock_concentration_mM": 10,
      "dilution_series": "2-fold",
      "concentration_range_uM": [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256],
      "incubation_hours": 18,
      "incubation_temperature_C": 37,
      "positive_control": "Ampicillin",
      "readout_method": "OD600 and visual inspection"
    },
    "materials": [
      {
        "name": "Test compound",
        "specification": "10mM stock in DMSO, sterile filtered",
        "quantity": { "value": 500, "unit": "μL" },
        "provided_by_requester": true,
        "storage_requirements": "-20°C"
      }
    ],
    "equipment": [
      {
        "name": "Plate reader",
        "specifications": "OD600 measurement capability",
        "alternatives_acceptable": true
      }
    ],
    "replicates": {
      "technical_replicates": 3,
      "biological_replicates": 2
    }
  }
}
```

## Exercise Answers (from Tutorial 1)

**1. "Is green tea extract good for cells?"**
Better: "Does 100μg/mL green tea extract (EGCG-standardized) increase HeLa cell viability by ≥20% after 24-hour exposure to 100μM hydrogen peroxide?"

**2. "Does temperature matter for enzyme activity?"**
Better: "Does increasing temperature from 25°C to 37°C increase the Vmax of purified alkaline phosphatase by ≥50% when measured with pNPP substrate?"

**3. "Can bacteria grow in salt water?"**
Better: "Can E. coli K-12 maintain >10^6 CFU/mL viability after 24 hours in LB medium supplemented with 5% NaCl at 37°C?"

## Next Steps

You have a hypothesis and a protocol. Tutorial 3 covers acceptance criteria, constraints, and actually submitting your experiment.

---

## Quick Reference: Protocol Checklist

- [ ] Protocol type selected (template, custom, or design requested)
- [ ] All required parameters filled (for templates)
- [ ] Steps are clear and numbered (for custom)
- [ ] Materials list complete with specifications
- [ ] Equipment requirements specified
- [ ] Replicate numbers defined
- [ ] Materials shipping requirements clear (if providing)
- [ ] Safety requirements within BSL-1/2

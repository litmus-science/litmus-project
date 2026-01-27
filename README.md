# Litmus Science Platform

**AI Wet Lab Validation Marketplace**

A complete system for connecting scientific ideas to laboratory capacity. This repository contains schemas, routing logic, and backend API for the Litmus platform.

**Documentation**: [github.com/litmus-science/litmus-docs](https://github.com/litmus-science/litmus-docs)
**MCP Server**: [github.com/litmus-science/litmus-mcp](https://github.com/litmus-science/litmus-mcp)

---

## Project Status

| Component | Status | Notes |
|-----------|--------|-------|
| Schemas | **Complete** | All 3 schemas fully defined |
| Router (Python) | **Complete** | 674 lines, full routing logic |
| Router (TypeScript) | **Complete** | 437 lines, mirrors Python |
| OpenAPI Spec | **Complete** | 1362 lines, all endpoints defined |
| MCP Server | **Complete** | [Separate repo](https://github.com/litmus-science/litmus-mcp) |
| Tutorials | **Complete** | [Separate repo](https://github.com/litmus-science/litmus-docs) |
| Case Studies | **Complete** | [Separate repo](https://github.com/litmus-science/litmus-docs) |
| Examples | **Complete** | All 8 experiment types covered |
| Tests | **Partial** | Router tests covered; backend/MCP tests pending |
| Backend API | **Complete** | FastAPI implementation of OpenAPI spec |

See [TODO.md](TODO.md) for detailed roadmap and next steps.

---

## Overview

Litmus makes it "push-button" to run one-off wet lab experiments by:

1. **Standardizing experiment specifications** (intake schema)
2. **Standardizing lab capabilities** (lab profile schema)  
3. **Standardizing outputs** (deliverables taxonomy with package levels)
4. **Routing requests** to best-fit labs (hard filters + weighted scoring)
5. **Exposing everything via MCP** so AI assistants can act as intake + routing agents ([see MCP repo](https://github.com/litmus-science/litmus-mcp))

### Target Users

- **Citizen scientists** wanting to validate ideas without lab access
- **AI-for-science researchers** needing rapid validation loops
- **Biotech startups** screening compounds at low cost
- **Graduate students / technicians** monetizing lab capacity as operators

---

## Repository Structure

```
litmus-project/
├── README.md                           # This file
├── LICENSE                             # Apache 2.0 license
├── TODO.md                             # Development status and roadmap
├── package.json                        # Node.js package config
├── pyproject.toml                      # Python package config
├── tsconfig.json                       # TypeScript config
├── .gitignore                          # Git ignore rules
├── schemas/
│   ├── experiment_intake.json          # Unified intake schema (JSON Schema)
│   ├── lab_profile.json                # Lab/operator directory schema
│   └── deliverables_taxonomy.json      # Output formats, processed outputs, package levels
├── router/
│   ├── router.py                       # Python routing implementation
│   └── router.ts                       # TypeScript routing implementation
├── backend/
│   ├── __init__.py                     # Backend package
│   ├── main.py                         # FastAPI application and routes
│   ├── models.py                       # SQLAlchemy database models
│   ├── schemas.py                      # Pydantic request/response schemas
│   ├── auth.py                         # Authentication and authorization
│   ├── requirements.txt                # Backend dependencies
│   └── README.md                       # Backend documentation
├── api/
│   └── openapi.yaml                    # REST API specification (OpenAPI 3.1)
├── examples/
│   ├── intake_cell_viability.json      # CELL_VIABILITY_IC50 example
│   ├── intake_mic_assay.json           # MIC_MBC_ASSAY example
│   ├── intake_sanger_verification.json # SANGER_PLASMID_VERIFICATION example
│   ├── intake_qpcr_expression.json     # QPCR_EXPRESSION example
│   ├── intake_enzyme_inhibition.json   # ENZYME_INHIBITION_IC50 example
│   ├── intake_microbial_growth.json    # MICROBIAL_GROWTH_MATRIX example
│   ├── intake_zone_inhibition.json     # ZONE_OF_INHIBITION example
│   ├── intake_custom.json              # CUSTOM protocol example
│   ├── lab_profile_individual.json     # Individual operator profile
│   └── lab_profile_commercial.json     # Commercial CRO profile
└── tests/
    ├── python/
    │   └── test_router.py              # Python router tests (50+ tests)
    └── typescript/
        └── router.test.ts              # TypeScript router tests (40+ tests)
```

---

## Quick Start

### 1. Understand the Intake Schema

The experiment intake schema defines how experiments are specified. Key sections:

- **experiment_type**: One of `SANGER_PLASMID_VERIFICATION`, `QPCR_EXPRESSION`, `CELL_VIABILITY_IC50`, `ENZYME_INHIBITION_IC50`, `MICROBIAL_GROWTH_MATRIX`, `MIC_MBC_ASSAY`, `ZONE_OF_INHIBITION`, `CUSTOM`
- **hypothesis**: Statement, null hypothesis, rationale
- **compliance**: BSL level, sample types, hazards
- **turnaround_budget**: Timeline and budget constraints
- **deliverables**: Required output formats and processing level
- **[experiment-specific section]**: Protocol parameters for the chosen type

### 2. Use the Router

Python:
```python
from router import route_intake, DEFAULT_WEIGHTS

result = route_intake(intake, labs, strict_deliverables=True)
for match in result.top_matches:
    print(f"{match.lab_name}: {match.score}")
```

TypeScript:
```typescript
import { routeIntake } from './router';

const result = routeIntake(intake, labs, { strictDeliverables: true });
result.top_matches.forEach(m => console.log(`${m.lab_name}: ${m.score}`));
```

### 3. Integrate via MCP

See the [litmus-mcp repository](https://github.com/litmus-science/litmus-mcp) for MCP server integration with tools for drafting intakes, validation, lab matching, and submission.

---

## Key Concepts

### Experiment Types

| Type | Description | Typical Budget |
|------|-------------|----------------|
| `SANGER_PLASMID_VERIFICATION` | Verify plasmid/construct sequence | $50-150 |
| `QPCR_EXPRESSION` | Gene expression analysis | $200-500 |
| `CELL_VIABILITY_IC50` | Compound toxicity/activity in cells | $300-800 |
| `ENZYME_INHIBITION_IC50` | Enzyme inhibitor characterization | $200-600 |
| `MICROBIAL_GROWTH_MATRIX` | Growth conditions optimization | $150-400 |
| `MIC_MBC_ASSAY` | Antimicrobial activity testing | $200-400 |
| `ZONE_OF_INHIBITION` | Disk diffusion antibacterial | $100-250 |
| `CUSTOM` | User-defined protocol | Variable |

### Package Levels

| Level | Contents | Use Case |
|-------|----------|----------|
| `L0_RAW_ONLY` | Raw instrument files only | Expert analysis elsewhere |
| `L1_BASIC_QC` | + QC summary, organized data | Most users |
| `L2_INTERPRETATION` | + Curve fits, statistics, interpretation | Publication-ready |

### Routing

Routing happens in two phases:

1. **Hard Filters** (pass/fail):
   - Experiment type support
   - BSL level compliance
   - Sample type approval (human/animal)
   - Shipping mode capability
   - Deliverables requirements (if strict mode)

2. **Weighted Scoring** (ranked):
   - Menu fit (specific capabilities for this experiment)
   - Turnaround fit (can meet timeline)
   - Cost fit (within budget)
   - Quality metrics (on-time rate, ratings, rerun rate)
   - Deliverables match (can provide required outputs)
   - Logistics (capacity, receiving)

Default weights sum to ~1.0 for interpretable scores.

---

## API Endpoints

The OpenAPI spec (`api/openapi.yaml`) defines:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/experiments` | POST | Submit new experiment |
| `/experiments` | GET | List experiments |
| `/experiments/{id}` | GET | Get experiment details |
| `/experiments/{id}/results` | GET | Get results |
| `/validate` | POST | Validate without submitting |
| `/estimate` | POST | Get cost/time estimate |
| `/templates` | GET | List standard protocols |
| `/templates/{id}` | GET | Get template details |

---

## MCP Integration Flow

See the [litmus-mcp repository](https://github.com/litmus-science/litmus-mcp) for the recommended integration flow for ChatGPT/Claude extensions.

---

## Tutorials & Case Studies

See the [litmus-docs repository](https://github.com/litmus-science/litmus-docs) for:

- **Tutorials**: Hypothesis formulation, protocol selection, submission workflow
- **Case Studies**: Citizen scientist, AI drug screening, operator perspective, failed hypothesis value

---

## Development

### Running the Router (Python)

```bash
cd router
python router.py  # Runs example/tests
```

### Running the Router (TypeScript)

```bash
cd router
npx ts-node router.ts
```

### Validating Schemas

```bash
# Using ajv-cli
npm install -g ajv-cli
ajv validate -s schemas/experiment_intake.json -d examples/intake_viability.json
```

---

## Configuration

### Routing Weights

Default weights (tunable):

```python
DEFAULT_WEIGHTS = RoutingWeights(
    menu_fit=0.20,           # Specific capabilities match
    turnaround_fit=0.15,     # Can meet timeline
    spec_completeness=0.10,  # How complete the intake is
    cost_fit=0.15,           # Within budget
    quality=0.20,            # Quality metrics
    logistics=0.05,          # Capacity, receiving
    deliverables_match=0.15  # Can provide required outputs
)
```

### Package Levels

Configure minimum package level based on user needs:

- **Researchers**: Typically want `L2_INTERPRETATION` for publication
- **Screening pipelines**: Often fine with `L1_BASIC_QC`
- **Experts with own analysis**: May prefer `L0_RAW_ONLY` (cheaper)

---

## Safety & Compliance

- **BSL-1/BSL-2 only**: No BSL-3/4 work
- **No controlled substances**: DEA-scheduled compounds prohibited
- **No human subjects**: In vitro only
- **Operator verification**: Identity, institutional affiliation, PI approval
- **Conservative review**: Uncertain requests declined; appeal available

---

## Privacy Options

| Option | Description | Premium |
|--------|-------------|---------|
| `open` | Results public immediately | None |
| `delayed_6mo` | Private 6 months, then public | ~10% |
| `delayed_12mo` | Private 12 months, then public | ~15% |
| `private` | Permanently private | ~25-50% |

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request with:
   - Schema changes include migration notes
   - Router changes include test cases
   - Documentation updates as needed

---

## License

Apache 2.0. See [LICENSE](LICENSE) for details.

---

## Support

- Documentation: [github.com/litmus-science/litmus-docs](https://github.com/litmus-science/litmus-docs)
- API Status: [status.litmus.science](https://status.litmus.science)
- Email: support@litmus.science

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
| OpenAPI Spec | **Partial** | Core endpoints defined; cloud labs/hypothesis endpoints pending |
| MCP Server | **Complete** | [Separate repo](https://github.com/litmus-science/litmus-mcp) |
| Tutorials | **Complete** | [Separate repo](https://github.com/litmus-science/litmus-docs) |
| Case Studies | **Complete** | [Separate repo](https://github.com/litmus-science/litmus-docs) |
| Examples | **Complete** | All 8 experiment types covered |
| Tests | **Partial** | Router tests covered; backend/MCP tests pending |
| Backend API | **Complete** | FastAPI implementation with 35+ endpoints |
| Hypothesis Library | **Complete** | Save, manage, and reuse hypotheses |
| Edison Integration | **Complete** | AI-powered hypothesis generation |
| Lab Packets & RFQs | **Complete** | LLM-powered experiment design + quote requests |
| Cloud Labs | **Complete** | ECL and Strateos protocol translation |

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
│   ├── README.md                       # Backend documentation
│   ├── cloud_labs/                     # Cloud lab integrations
│   │   ├── registry.py                 # Provider registry
│   │   ├── base.py                     # Base translator/provider classes
│   │   ├── ecl/                        # Enko Cloud Lab (SLL protocol)
│   │   └── strateos/                   # Strateos (Autoprotocol JSON)
│   └── services/                       # Business logic services
│       ├── lab_packet_service.py       # Lab packet + RFQ generation
│       ├── edison_client.py            # Edison Scientific API client
│       ├── edison_integration.py       # Edison hypothesis pipeline
│       ├── llm_service.py              # LLM service abstraction
│       ├── experiment_interpreter.py   # Experiment analysis
│       └── prompts/                    # LLM prompt templates
├── frontend/                           # Next.js 15 React application
│   ├── app/                            # App router pages
│   │   ├── hypothesize/                # Hypothesis generation UI
│   │   ├── experiments/                # Experiment management
│   │   │   └── [id]/lab-packet/        # Lab packet generation UI
│   │   └── operator/                   # Operator job management
│   ├── components/                     # React components
│   └── lib/                            # Utilities and API clients
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

## Hypothesis Library

The Hypothesis Library allows users to save, manage, and reuse hypotheses across experiments.

### Hypothesis Sources

- **Manual Entry**: Create hypotheses directly in the UI
- **Edison-Generated**: AI-generated hypotheses from research queries
- **Experiment-Derived**: Save hypotheses from submitted experiments

### Hypothesis Status

| Status | Description |
|--------|-------------|
| `DRAFT` | Work in progress, not yet used |
| `USED` | Associated with a submitted experiment |
| `ARCHIVED` | No longer active |

### Usage Flow

1. Create or generate a hypothesis
2. Review and refine the hypothesis statement
3. Select hypothesis when creating an experiment
4. Hypothesis status updates to `USED` when experiment is submitted

---

## Edison Scientific Integration

Edison Scientific provides AI-powered hypothesis generation by analyzing scientific literature and research context.

### How It Works

1. **Submit Query**: Describe your research question or area of interest
2. **Literature Analysis**: Edison analyzes relevant scientific papers
3. **Hypothesis Generation**: Receive suggested hypotheses with supporting rationale
4. **Reasoning Trace**: View the step-by-step reasoning process
5. **Save to Library**: Add generated hypotheses to your library

### Edison Run Status

| Status | Description |
|--------|-------------|
| `PENDING` | Task queued, waiting to start |
| `RUNNING` | Analysis in progress |
| `COMPLETED` | Results ready |
| `FAILED` | Task encountered an error |

### API Usage

```bash
# Start Edison hypothesis generation
curl -X POST http://localhost:8000/cloud-labs/edison/start \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "Novel antimicrobial peptides targeting gram-negative bacteria"}'

# Check status
curl http://localhost:8000/cloud-labs/edison/status/<run_id> \
  -H "Authorization: Bearer <token>"
```

---

## Cloud Labs Integration

Litmus integrates with automated cloud laboratories to execute experiments without manual intervention.

### Supported Providers

| Provider | Protocol Format | Status |
|----------|-----------------|--------|
| **Enko Cloud Lab (ECL)** | SLL (Symbolic Lab Language) | Available |
| **Strateos** | Autoprotocol JSON | Available |

### Translation Flow

1. **Interpret**: LLM analyzes experiment intake and extracts key parameters
2. **Translate**: Convert intake to provider-specific protocol format
3. **Validate**: Check protocol against provider constraints
4. **Submit**: Send to cloud lab for execution

### Supported Experiment Types

Cloud lab translation currently supports:
- `CELL_VIABILITY_IC50`
- `MIC_MBC_ASSAY`
- `QPCR_EXPRESSION`

### API Usage

```bash
# List available providers
curl http://localhost:8000/cloud-labs/providers \
  -H "Authorization: Bearer <token>"

# Translate an experiment
curl -X POST http://localhost:8000/cloud-labs/experiments/<id>/translate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"provider_id": "ecl"}'
```

---

## Lab Packets & RFQ Workflow

Lab packets are LLM-generated, bench-ready experiment designs derived from experiment specifications.

### What's in a Lab Packet

- **Design**: Work packages, controls, sample size planning, success criteria
- **Materials**: Bill of materials with vendor search links (Sigma-Aldrich, Thermo Fisher, ATCC, etc.)
- **Cost Estimate**: Low/high range for direct costs
- **Handoff Checklist**: Items to communicate to the executing lab

### Workflow

1. **Create Experiment** → submit intake with hypothesis and specifications
2. **Generate Lab Packet** → LLM analyzes experiment and produces detailed design
3. **Create RFQ** → deterministically derive a formal Request for Quote from the lab packet
4. **Send to Operators** → share RFQ with matched operators for quoting

### API Usage

```bash
# Generate lab packet
curl -X POST http://localhost:8000/experiments/{id}/lab-packet \
  -H "Authorization: Bearer <token>"

# Create RFQ from lab packet
curl -X POST http://localhost:8000/experiments/{id}/rfq \
  -H "Authorization: Bearer <token>"
```

---

## API Endpoints

The backend implements 35+ endpoints across several categories:

### Core Experiment Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/experiments` | POST | Submit new experiment |
| `/experiments` | GET | List experiments |
| `/experiments/{id}` | GET | Get experiment details |
| `/experiments/{id}` | PATCH | Update experiment |
| `/experiments/{id}` | DELETE | Cancel experiment (requires reason) |
| `/experiments/{id}/results` | GET | Get results |
| `/experiments/{id}/approve` | POST | Approve results |
| `/experiments/{id}/dispute` | POST | Dispute results |
| `/validate` | POST | Validate without submitting |
| `/estimate` | POST | Get cost/time estimate |
| `/templates` | GET | List standard protocols |
| `/templates/{id}` | GET | Get template details |

### Hypothesis Library

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/hypotheses` | GET | List user hypotheses |
| `/hypotheses` | POST | Create hypothesis |
| `/hypotheses/{id}` | GET | Get hypothesis |
| `/hypotheses/{id}` | PATCH | Update hypothesis |
| `/hypotheses/{id}` | DELETE | Delete hypothesis |

### Edison Scientific Integration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cloud-labs/edison` | POST | Generate hypothesis via Edison |
| `/cloud-labs/edison/start` | POST | Start Edison task |
| `/cloud-labs/edison/active` | GET | Get current Edison run |
| `/cloud-labs/edison/runs` | GET | List Edison runs (paginated) |
| `/cloud-labs/edison/runs/{id}/draft` | PATCH | Update draft hypothesis |
| `/cloud-labs/edison/runs/clear-history` | POST | Clear Edison history |
| `/cloud-labs/edison/status/{id}` | GET | Get Edison run status |

### Lab Packets & RFQs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/experiments/{id}/lab-packet` | POST | Generate lab packet (LLM) |
| `/experiments/{id}/lab-packet` | GET | Get existing lab packet |
| `/experiments/{id}/rfq` | POST | Generate RFQ from lab packet |
| `/experiments/{id}/rfq` | GET | Get RFQ package |
| `/experiments/{id}/rfq` | PATCH | Update RFQ status |

### Cloud Labs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cloud-labs/providers` | GET | List cloud lab providers |
| `/cloud-labs/providers/{id}` | GET | Get provider info |
| `/cloud-labs/supported-types` | GET | List supported experiment types |
| `/cloud-labs/interpret` | POST | Interpret experiments with LLM |
| `/cloud-labs/translate` | POST | Translate intake to cloud lab protocol |
| `/cloud-labs/validate` | POST | Validate intake for provider |
| `/cloud-labs/experiments/{id}/translate` | POST | Translate specific experiment |
| `/cloud-labs/submissions` | GET | List cloud lab submissions |
| `/cloud-labs/submissions/{id}` | GET | Get submission details |

### System & Auth

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/config` | GET | Configuration bootstrap |
| `/auth/register` | POST | Register new user |
| `/auth/token` | POST | Get access token |
| `/auth/me` | GET | Get current user info |

### Operators

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/operator/jobs` | GET | List available jobs |
| `/operator/jobs/{id}/claim` | POST | Claim job |
| `/operator/jobs/{id}/submit` | POST | Submit results |

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

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LITMUS_SECRET_KEY` | Yes | JWT signing key (generate with `openssl rand -hex 32`) |
| `LITMUS_DATABASE_URL` | Yes | Database connection URL |
| `LITMUS_CORS_ORIGINS` | No | Comma-separated allowed origins |
| `LITMUS_CORS_ORIGIN_REGEX` | No | Regex pattern for allowed origins |
| `LITMUS_DEBUG` | No | Enable debug mode (logs SQL, allows localhost CORS) |
| `LITMUS_AUTH_DISABLED` | No | Disable authentication (development only) |

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

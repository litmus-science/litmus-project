# Litmus Project - Development Status

This document tracks what has been implemented and what remains to be done.

---

## Completed Components

### Schemas (100% Complete)
- [x] `schemas/experiment_intake.json` - Unified experiment request schema with all 8 experiment types
- [x] `schemas/lab_profile.json` - Lab/operator capabilities and constraints
- [x] `schemas/deliverables_taxonomy.json` - Output formats, processed outputs, and package levels

### Router Logic (100% Complete)
- [x] `router/router.py` - Python implementation (674 lines)
  - Hard filters (experiment type, BSL, materials, shipping, deliverables)
  - Weighted scoring (7 factors)
  - Spec completeness calculation
- [x] `router/router.ts` - TypeScript implementation (437 lines)
  - Same logic as Python version for JS/Node environments

### API Specification (100% Complete)
- [x] `api/openapi.yaml` - OpenAPI 3.1 REST API spec (1362 lines)
  - All CRUD operations for experiments
  - Validation and estimation endpoints
  - Template browsing
  - Operator job management
  - Webhook definitions

### MCP Integration (100% Complete)
- [x] `mcp/mcp.json` - Model Context Protocol manifest
  - 4 resources (schemas, taxonomy, routing weights)
  - 8 tools (intake drafting, validation, routing, submission, file handling)

### Documentation - Tutorials (100% Complete)
- [x] `docs/tutorials/01-hypothesis-formulation.md` - Converting ideas to testable hypotheses
- [x] `docs/tutorials/02-protocol-selection.md` - Templates, custom protocols, design requests
- [x] `docs/tutorials/03-submission.md` - Acceptance criteria, constraints, and submission flow

### Documentation - Case Studies (100% Complete)
- [x] `docs/case-studies/01-honey-remedy.md` - Citizen scientist, $200 budget
- [x] `docs/case-studies/02-ai-drug-screening.md` - AI pipeline, batch submission
- [x] `docs/case-studies/03-operator-perspective.md` - Grad student economics ($800-1200/month)
- [x] `docs/case-studies/04-failed-hypothesis.md` - Value of negative results

### Examples (Partial - 50%)
- [x] `examples/intake_cell_viability.json` - CELL_VIABILITY_IC50 example
- [x] `examples/intake_mic_assay.json` - MIC_MBC_ASSAY example
- [x] `examples/lab_profile_individual.json` - Individual operator profile
- [x] `examples/lab_profile_commercial.json` - Commercial CRO profile

---

## Not Yet Implemented

### Project Infrastructure (Priority: High)
- [x] **Package management**
  - [x] `package.json` for TypeScript router and tooling
  - [x] `pyproject.toml` for Python dependencies
  - [x] `tsconfig.json` for TypeScript compilation
- [ ] **Git initialization**
  - [x] Add `.gitignore`
  - [ ] Initialize git repository
  - [ ] Create initial commit
- [x] **LICENSE** - Apache 2.0
- [x] **Build/run scripts**
  - [x] npm scripts in package.json
  - [x] pytest config in pyproject.toml

### Testing (Priority: High)
- [x] **Python tests** (`tests/python/test_router.py`)
  - [x] Test file structure created
  - [x] Unit tests for hard filters, deliverables gaps, spec completeness
  - [x] Scoring tests with custom weights
  - [x] End-to-end routing tests
  - [x] Validation tests
  - [x] Edge case tests
  - [x] Test fixtures from examples directory
- [x] **TypeScript tests** (`tests/typescript/router.test.ts`)
  - [x] Vitest test file created
  - [x] All test cases matching Python version
  - [x] Same coverage as Python for consistency
- [x] **Schema validation tests** (`tests/python/test_schemas.py`)
  - [x] Validate example files against schemas
  - [x] Test edge cases and error handling
  - [x] Consistency tests between schema, examples, and code

### Additional Examples (Priority: Medium)
All experiment types now have example intake files:
- [x] `examples/intake_sanger_verification.json` - SANGER_PLASMID_VERIFICATION
- [x] `examples/intake_qpcr_expression.json` - QPCR_EXPRESSION
- [x] `examples/intake_enzyme_inhibition.json` - ENZYME_INHIBITION_IC50
- [x] `examples/intake_microbial_growth.json` - MICROBIAL_GROWTH_MATRIX
- [x] `examples/intake_zone_inhibition.json` - ZONE_OF_INHIBITION
- [x] `examples/intake_custom.json` - CUSTOM protocol example

### Backend Implementation (Priority: High)
- [x] **Database schema** - Storage for experiments, operators, results
  - [x] SQLAlchemy models with async support
  - [x] User, OperatorProfile, Experiment, ExperimentResult, Dispute, Template, FileUpload
- [x] **API server** - Implementation of OpenAPI spec
  - [x] FastAPI application (`backend/main.py`)
  - [x] All CRUD endpoints for experiments
  - [x] Results submission and approval
  - [x] Validation endpoints
  - [x] Template browsing
  - [x] Operator job management
  - [x] Authentication (JWT/API keys)
  - [x] Rate limiting middleware (in-memory, use Redis for production)
  - [x] Webhook dispatch (test endpoint)
  - [x] Environment-based configuration (`.env.example`)
  - [x] CORS security (configurable origins)
- [ ] **Production enhancements** (Future)
  - [ ] PostgreSQL database (SQLite is dev only)
  - [ ] Redis for distributed rate limiting
  - [ ] File storage - S3/GCS integration for data files
  - [ ] Payment integration - Escrow and payout system
  - [ ] Webhook retry logic with exponential backoff

### Frontend Implementation (Priority: Medium - Future)
- [ ] **Requester dashboard**
  - [ ] Experiment submission wizard
  - [ ] Status tracking
  - [ ] Results viewer
- [ ] **Operator dashboard**
  - [ ] Job browsing and claiming
  - [ ] Result submission interface
  - [ ] Earnings tracking
- [ ] **Admin dashboard**
  - [ ] Safety review queue
  - [ ] Dispute resolution
  - [ ] Platform analytics

### MCP Server Implementation (Priority: Medium)
- [x] **MCP server code** (`litmus_mcp/src/server.py`)
  - [x] Tool handlers for all 8 defined tools
  - [x] Resource handlers for 4 resources
  - [x] Integration with router logic
  - [x] Error handling and response formatting
  - [ ] Integration with production backend API (uses mock storage currently)

### CI/CD (Priority: Low)
- [ ] **GitHub Actions** or equivalent
  - [ ] Run tests on PR
  - [ ] Schema validation
  - [ ] Lint checks
- [ ] **Deployment automation**
  - [ ] Staging environment
  - [ ] Production deployment

### Documentation (Priority: Low)
- [ ] **API reference** - Generated from OpenAPI spec
- [ ] **Operator onboarding guide** - How to become a verified operator
- [ ] **Integration guide** - For AI agent developers
- [ ] **Security documentation** - Webhook signature verification, etc.

---

## Architecture Notes

### Data Flow
```
Requester (Human/AI)
    → MCP Tools / REST API
    → Validation (Schema + Safety)
    → Router (Filter + Score)
    → Operator Assignment
    → Execution
    → Results + Payment
```

### Key Design Decisions
1. **Schema-first**: All data structures defined as JSON Schema before implementation
2. **Dual router**: Python for backend, TypeScript for edge/browser use cases
3. **MCP integration**: First-class support for AI assistants as intake agents
4. **Package levels**: Tiered deliverables (L0/L1/L2) for different user needs
5. **Open by default**: Results public unless privacy premium paid

### Experiment Types Supported
| Type | Status | Example |
|------|--------|---------|
| SANGER_PLASMID_VERIFICATION | Complete | `intake_sanger_verification.json` |
| QPCR_EXPRESSION | Complete | `intake_qpcr_expression.json` |
| CELL_VIABILITY_IC50 | Complete | `intake_cell_viability.json` |
| ENZYME_INHIBITION_IC50 | Complete | `intake_enzyme_inhibition.json` |
| MICROBIAL_GROWTH_MATRIX | Complete | `intake_microbial_growth.json` |
| MIC_MBC_ASSAY | Complete | `intake_mic_assay.json` |
| ZONE_OF_INHIBITION | Complete | `intake_zone_inhibition.json` |
| CUSTOM | Complete | `intake_custom.json` |

---

## Next Steps (Recommended Order)

1. **Initialize git repository** - Version control is essential
2. **Set up CI/CD** - GitHub Actions for testing and linting
3. **Production database** - Migrate from SQLite to PostgreSQL
4. **File storage** - Implement S3/GCS integration
5. **Payment integration** - Add escrow and payout system
6. **Frontend dashboards** - Build requester and operator UIs

---

## Production Readiness Fixes Applied

The following security and consistency issues have been fixed:

### Critical (Fixed)
- [x] SECRET_KEY now from environment variable (not hardcoded)
- [x] CORS configured with specific origins (not wildcard)
- [x] Field name consistency (`bsl` not `bsl_level`)
- [x] Privacy field read from correct location (root, not compliance)
- [x] Rate limiting middleware implemented

### High Priority (Fixed)
- [x] Database SQL logging disabled by default
- [x] Environment configuration via `.env.example`
- [x] Pydantic schemas match JSON schema field names
- [x] Router input validation added
- [x] Schema validation tests added

### Remaining for Production
- [ ] Use PostgreSQL instead of SQLite
- [ ] Use Redis for distributed rate limiting
- [ ] Add webhook signature verification
- [ ] Implement file upload to cloud storage
- [ ] Add comprehensive error logging

---

*Last updated: 2026-01-26*

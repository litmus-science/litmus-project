# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Litmus is an AI wet lab validation marketplace that connects scientific experiment requests with laboratory capacity. The system standardizes experiment specifications, routes requests to best-fit labs, and exposes everything via MCP for AI assistant integration.

## Development Commands

### Backend (Python/FastAPI)

```bash
# Install dependencies
uv sync --extra backend --extra dev

# Run API server
uv run litmus-api
# Or directly:
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Run all Python tests
uv run pytest

# Run specific test file
uv run pytest tests/python/test_router.py -v

# Run with coverage
uv run pytest --cov=backend
```

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev      # Development server
npm run build    # Production build
npm run lint     # ESLint
```

### TypeScript Router

```bash
npm install
npm run build    # Compile TypeScript
npm run test     # Vitest tests
npm run lint     # ESLint
```

### Schema Validation

```bash
npm run validate:schemas   # Validate intake examples
npm run validate:examples  # Validate all examples
```

## Architecture

### Core Components

**Router** (`router/router.py`, `router/router.ts`):

- Two-phase matching: hard filters (BSL, experiment type, compliance) then weighted scoring (menu fit, turnaround, cost, quality)
- Python version for backend, TypeScript mirrors for browser/edge use
- Key types: `RoutingWeights`, `LabMatch`, `RoutingResult`

**Backend** (`backend/`):

- FastAPI application implementing OpenAPI spec (`api/openapi.yaml`)
- SQLAlchemy async models with SQLite (dev) / PostgreSQL (prod)
- JWT + API key authentication
- Rate limiting middleware (in-memory; use Redis for production)

**Lab Packets & RFQs** (`backend/services/lab_packet_service.py`):

- LLM-powered lab packet generation from experiment specs (materials, work packages, controls, cost estimates)
- Deterministic RFQ (Request for Quote) derivation from lab packets — no LLM call needed
- Vendor search URL builder for material links (Sigma-Aldrich, Thermo Fisher, ATCC, etc.)
- Prompt template in `backend/services/prompts/lab_packet.py`

**Cloud Labs** (`backend/cloud_labs/`):

- Protocol translators for automated cloud labs (ECL, Strateos)
- ECL uses SLL (Symbolic Lab Language), Strateos uses Autoprotocol JSON
- Registry pattern for provider management
- Currently stub implementations awaiting API credentials

**Frontend** (`frontend/`):

- Next.js 15 with React 19, TypeScript
- Zustand for state, SWR for data fetching
- TailwindCSS styling
- Pages: dashboard, experiment submission, operator job views, lab packet generation

### Schemas (`schemas/`)

Three JSON Schema files define the data model:

- `experiment_intake.json`: Unified experiment request format (8 experiment types)
- `lab_profile.json`: Lab/operator capabilities and constraints
- `deliverables_taxonomy.json`: Output formats and package levels (L0/L1/L2)

### Data Flow

```
Requester (Human/AI) → MCP Tools/REST API → Validation → Router → Lab Assignment → Execution → Results
                                                      ↘ Lab Packet (LLM) → RFQ → Operator Quoting
```

## Experiment Types

SANGER_PLASMID_VERIFICATION, QPCR_EXPRESSION, CELL_VIABILITY_IC50, ENZYME_INHIBITION_IC50, MICROBIAL_GROWTH_MATRIX, MIC_MBC_ASSAY, ZONE_OF_INHIBITION, CUSTOM

## Key Patterns

- Schema-first design: JSON Schema defines data structures before implementation
- Dual router: Python for backend, TypeScript for edge
- Package levels: L0 (raw only), L1 (basic QC), L2 (interpretation)
- Environment config: `LITMUS_SECRET_KEY`, `LITMUS_DATABASE_URL`, `LITMUS_CORS_ORIGINS`

## Coding Guardrails

- Never use dynamic imports (unless asked) like `await import(..)`
- Never cast to `any` in TypeScript
- Do not add extra defensive checks or try/catch blocks beyond what's requested
- Never commit `.env*` files (only `.env.example` is allowed)
- Follow SSOT (Single Source of Truth) - no duplicated logic or data definitions
- Follow DRY (Don't Repeat Yourself)
- Follow SOLID principles
- Strict type safety - no implicit any, proper generics, exhaustive type checks
- Prefer immutable data structures and pure functions
- Optimize for performance, memory efficiency, and algorithmic complexity
- Ensure thread safety for concurrent operations

# Lessons Learned

- Avoid recursive JSON type aliases for runtime models; use `pydantic.JsonValue` in `backend/types.py` to prevent Pydantic schema recursion errors.
- When assigning lists of dicts into `JsonObject` fields, coerce to `list[JsonValue]` (or cast) to avoid mypy invariance issues.
- Keep type stubs aligned with strict mypy: add `types-jsonschema`, `types-passlib`, and `types-python-jose` to dev dependencies.
- Router linting relies on `.eslintrc.cjs` plus `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` in `package.json`.

# React `useEffect` Guidelines

**Before using `useEffect`, read:**  
[You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

---

## Common cases where `useEffect` is **NOT** needed

- Transforming data for rendering → use variables or `useMemo`
- Handling user events → use event handlers
- Resetting state when props change → use `key` prop or calculate during render
- Updating state based on props/state changes → calculate during render

---

## Only use `useEffect` for

- Synchronizing with external systems (APIs, DOM, third-party libraries)
- Cleanup that must happen when the component unmounts

## Testing

Python tests in `tests/python/`, TypeScript tests in `tests/typescript/`. CI runs on PRs via GitHub Actions (`.github/workflows/tests.yml`).

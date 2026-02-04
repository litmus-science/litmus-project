# Theorizer → Litmus Integration Plan

> **Goal**: Create an end-to-end pipeline where AI-generated hypotheses flow through Litmus to cloud labs for validation.

---

## 0. Repository Locations

| Repository | Path |
|------------|------|
| **Asta-Theorizer** | `/Users/suhjungdae/code/opensource/asta-theorizer` |
| **Litmus Project** | `/Users/suhjungdae/code/litmus/litmus-project` |

---

## 1. Executive Summary

**Vision**: The advent of AI theorizers will generate countless hypotheses. Litmus acts as a hub that finds and executes experiments for validation.

**Pipeline**:
```
User Query → Theorizer → Hypothesis → Litmus → Cloud Labs → Results → Feedback Loop
```

**Principles**:
- SOTA tech stack
- No over-engineering (KISS, YAGNI)
- Cloud labs agnostic (plug and play)
- Domain agnostic (not just biology)

---

## 2. Current State Analysis

### 2.1 Asta-Theorizer (Allen AI)

**Repository**: https://github.com/allenai/asta-theorizer

| Component | Status | Reusability |
|-----------|--------|-------------|
| Pipeline orchestration (`Theorizer.py`) | Production | 100% |
| LLM abstraction (`ExtractionUtils.py`) | Production | 100% |
| Multi-threaded extraction (`SchemaExtractionQueue.py`) | Production | 100% |
| Paper caching (`PaperStore.py`) | Production | 100% |
| PDF→Text (`MistralOCRStore.py`) | Production | 100% |
| Data structures (`Struct.py`) | Production | 80% (need new classes) |
| Web UI (`TheorizerWebInterface.py`) | Production | 50% (needs redesign) |
| REST API (`TheorizerServer.py`) | Production | 70% (new endpoints) |

**Domain-Specific (Must Change)**:
- Paper source: Semantic Scholar only (skews CS/AI; limited coverage in chemistry/clinical/materials)
- Prompts: Hardcoded AI/NLP examples
- Output: Theory JSON (not experiment intake)

**Source Expansion Required**:
- Chemistry: **ChemRxiv**, **PubChem** (context), optional **Crossref** for DOIs
- Clinical: **PubMed** + **PubMed Central (PMC)** for full text, **ClinicalTrials.gov** for trials
- Materials: **arXiv** (cond-mat/mtrl-sci), **Semantic Scholar**, optional **Crossref**

### 2.2 Litmus Platform

| Component | Status |
|-----------|--------|
| Experiment intake schema | Complete |
| Router (lab matching) | Complete |
| Cloud lab translators (ECL, Strateos) | Stubbed (awaiting credentials) |
| FastAPI backend | Complete |
| Next.js frontend | Partial (auth + dashboard + basic intake form; not B2C hypothesis UI) |

**Auth**:
- Litmus requires `X-API-Key` or Bearer token for all endpoints.

**Supported Experiment Types**:
- `SANGER_PLASMID_VERIFICATION` - Molecular Biology
- `QPCR_EXPRESSION` - Molecular Biology
- `CELL_VIABILITY_IC50` - Drug Discovery
- `ENZYME_INHIBITION_IC50` - Biochemistry
- `MICROBIAL_GROWTH_MATRIX` - Microbiology
- `MIC_MBC_ASSAY` - Antimicrobials
- `ZONE_OF_INHIBITION` - Microbiology
- `CUSTOM` - Any domain

---

## 3. Architecture Design

### 3.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                B2C Interface (litmus.science)                │
│  User enters natural language query about any science domain │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Domain Classifier (LLM-based)                   │
│  Detects: drug_discovery, molecular_bio, microbio, etc.      │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Paper Source Router (pluggable)                 │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐   │
│  │ PubMed   │ PMC      │ BioRxiv  │ ChemRxiv │ arXiv    │   │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘   │
│  ┌──────────┬──────────┬──────────┐                         │
│  │ S2       │ Crossref │ Clinical │                         │
│  │          │ (DOI)    │ Trials   │                         │
│  └──────────┴──────────┴──────────┘                         │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│         Extraction Schema Registry (config-driven)           │
│  Loads domain-specific extraction prompts from YAML          │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│   Core Pipeline (ported/adapted from Theorizer)              │
│  Query → Papers → Extract → Synthesize → Theory components   │
│  NOTE: requires decoupling from S2/PaperFinder for new sources│
└─────────────────────────────┬───────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Litmus Translator (NEW)                         │
│  Maps theory → experiment_intake.json (incl. type sections)   │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Litmus Platform (existing)                      │
│  /validate → /estimate → /experiments                        │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Cloud Labs                                │
│              ECL / Strateos / Future Labs                    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Domain-Agnostic Design

Instead of hardcoding "bio" or "chemistry", use config-driven domains:

```
theorizer/
├── core/                    # Unchanged from asta-theorizer
│   ├── pipeline.py
│   ├── extraction_queue.py
│   ├── paper_store.py
│   └── llm_utils.py
│
├── paper_sources/           # Pluggable adapters
│   ├── base.py
│   ├── pubmed.py
│   ├── pmc.py
│   ├── biorxiv.py
│   ├── chemrxiv.py
│   ├── arxiv.py
│   ├── crossref.py
│   ├── clinical_trials.py
│   └── semantic_scholar.py
│
├── domains/                 # Config-driven extraction schemas
│   ├── drug_discovery.yaml
│   ├── clinical_trials.yaml
│   ├── molecular_biology.yaml
│   ├── microbiology.yaml
│   ├── biochemistry.yaml
│   ├── materials_science.yaml
│   └── custom.yaml
│
├── translators/             # Output format adapters
│   ├── base.py
│   ├── litmus_translator.py
│   └── raw_theory.py
│
└── api/
    ├── server.py
    └── litmus_client.py
```

---

## 4. Domain Configuration Examples

### 4.1 Drug Discovery

```yaml
# domains/drug_discovery.yaml
domain: drug_discovery
description: "Drug candidates, IC50, binding affinity, selectivity"

paper_sources:
  primary:
    - pubmed
    - chemrxiv
  secondary:
    - biorxiv
    - semantic_scholar

extraction_schema:
  - name: compound_name
    type: str
    description: "Drug/compound identifier (name, SMILES, CAS number)"
  - name: target_protein
    type: str
    description: "Target protein, enzyme, receptor, or pathway"
  - name: activity_type
    type: str
    description: "IC50, EC50, Ki, Kd, or other activity measure"
  - name: activity_value
    type: str
    description: "Numerical value with units (e.g., '50 nM')"
  - name: assay_type
    type: str
    description: "Biochemical, cell-based, or in vivo assay"
  - name: cell_line
    type: str
    description: "Cell line used if cell-based (e.g., HeLa, MCF7)"
  - name: selectivity_data
    type: str
    description: "Off-target effects or selectivity ratio vs related targets"
  - name: safety_notes
    type: str
    description: "Toxicity, ADMET, or safety observations"

litmus_experiment_types:
  - CELL_VIABILITY_IC50
  - ENZYME_INHIBITION_IC50

example_queries:
  - "Find compounds that inhibit EGFR with IC50 < 100nM"
  - "What drugs show selectivity for CDK4 over CDK6?"
  - "Identify repurposing candidates for SARS-CoV-2 main protease"
```

### 4.2 Microbiology

```yaml
# domains/microbiology.yaml
domain: microbiology
description: "Antimicrobials, MIC/MBC, growth conditions, resistance"

paper_sources:
  primary:
    - pubmed
  secondary:
    - biorxiv

extraction_schema:
  - name: organism
    type: str
    description: "Bacterial or fungal species (e.g., E. coli, S. aureus)"
  - name: strain
    type: str
    description: "Specific strain if mentioned (e.g., ATCC 25922)"
  - name: compound
    type: str
    description: "Antimicrobial agent or treatment"
  - name: mic_value
    type: str
    description: "Minimum inhibitory concentration with units"
  - name: mbc_value
    type: str
    description: "Minimum bactericidal concentration with units"
  - name: growth_medium
    type: str
    description: "Culture medium used (e.g., MHB, LB)"
  - name: temperature
    type: str
    description: "Incubation temperature"
  - name: resistance_genes
    type: str
    description: "Resistance mechanisms or genes if mentioned"

litmus_experiment_types:
  - MIC_MBC_ASSAY
  - ZONE_OF_INHIBITION
  - MICROBIAL_GROWTH_MATRIX

example_queries:
  - "What is the MIC of ciprofloxacin against Pseudomonas aeruginosa?"
  - "Find natural compounds active against MRSA"
  - "Which antibiotics are effective against carbapenem-resistant Enterobacteriaceae?"
```

### 4.3 Molecular Biology

```yaml
# domains/molecular_biology.yaml
domain: molecular_biology
description: "Gene expression, knockdowns, plasmids, sequencing"

paper_sources:
  primary:
    - pubmed
    - biorxiv
  secondary:
    - semantic_scholar

extraction_schema:
  - name: gene_name
    type: str
    description: "Gene symbol or name (e.g., BRCA1, TP53)"
  - name: organism
    type: str
    description: "Species (human, mouse, etc.)"
  - name: cell_line
    type: str
    description: "Cell line or tissue type"
  - name: intervention
    type: str
    description: "Knockdown, overexpression, CRISPR edit, etc."
  - name: expression_change
    type: str
    description: "Fold change or percentage change in expression"
  - name: method
    type: str
    description: "qPCR, RNA-seq, Western blot, etc."
  - name: phenotype
    type: str
    description: "Observed phenotypic effect"

litmus_experiment_types:
  - QPCR_EXPRESSION
  - SANGER_PLASMID_VERIFICATION

example_queries:
  - "What happens when KRAS is knocked down in pancreatic cancer cells?"
  - "Which genes regulate autophagy in HeLa cells?"
  - "Find validated siRNA sequences for HIF1A"
```

### 4.4 Clinical (Trials & Therapeutics)

```yaml
# domains/clinical_trials.yaml
domain: clinical_trials
description: "Clinical interventions, trial outcomes, dosing, safety"

paper_sources:
  primary:
    - clinical_trials
    - pubmed
    - pmc
  secondary:
    - semantic_scholar

extraction_schema:
  - name: intervention
    type: str
    description: "Drug/therapy/procedure under investigation"
  - name: indication
    type: str
    description: "Disease/condition"
  - name: phase
    type: str
    description: "Trial phase (I/II/III/IV)"
  - name: primary_endpoint
    type: str
    description: "Primary efficacy or safety endpoint"
  - name: outcome
    type: str
    description: "Outcome summary (effect size, p-value if available)"
  - name: population
    type: str
    description: "Patient population, inclusion criteria"

litmus_experiment_types:
  - CUSTOM

example_queries:
  - "Which EGFR inhibitors improved PFS in NSCLC trials?"
  - "Summarize phase II results for sickle cell gene therapies"
```

### 4.5 Materials Science

```yaml
# domains/materials_science.yaml
domain: materials_science
description: "Materials properties, synthesis, performance metrics"

paper_sources:
  primary:
    - arxiv
    - semantic_scholar
  secondary:
    - crossref

extraction_schema:
  - name: material
    type: str
    description: "Material name/composition"
  - name: synthesis_method
    type: str
    description: "Synthesis or fabrication method"
  - name: property
    type: str
    description: "Measured property (conductivity, strength, etc.)"
  - name: value
    type: str
    description: "Value with units"
  - name: conditions
    type: str
    description: "Test conditions (temperature, pressure, etc.)"

litmus_experiment_types:
  - CUSTOM

example_queries:
  - "High-conductivity solid electrolytes for Li metal batteries"
  - "What synthesis routes improve perovskite stability?"
```

---

## 5. Key Components to Build

### 5.1 Paper Source Registry

```python
# paper_sources/registry.py
from typing import Protocol, List, Dict
from abc import abstractmethod

class PaperSource(Protocol):
    """Protocol for paper source adapters"""

    @abstractmethod
    def search(self, query: str, limit: int = 100,
               date_cutoff: str = None) -> List[Dict]:
        """Search for papers matching query"""
        ...

    @abstractmethod
    def get_full_text(self, paper_id: str) -> str:
        """Retrieve full text of a paper"""
        ...

class PaperSourceRegistry:
    _sources: Dict[str, PaperSource] = {}

    @classmethod
    def register(cls, name: str, source: PaperSource):
        cls._sources[name] = source

    @classmethod
    def get(cls, name: str) -> PaperSource:
        return cls._sources[name]

    @classmethod
    def search_multiple(cls, sources: List[str], query: str,
                        limit: int = 100) -> List[Dict]:
        """Search across multiple sources and deduplicate"""
        results = []
        for source_name in sources:
            source = cls.get(source_name)
            results.extend(source.search(query, limit))
        return deduplicate_papers(results)
```

### 5.2 Domain Classifier

```python
# core/domain_classifier.py
from llm_utils import get_llm_response

DOMAIN_CLASSIFICATION_PROMPT = """
Classify the following scientific query into one of these domains:
- drug_discovery: IC50, binding, inhibitors, drug candidates
- molecular_biology: gene expression, knockdown, qPCR, plasmids
- microbiology: bacteria, MIC, antimicrobials, growth
- biochemistry: enzyme kinetics, protein assays
- materials_science: conductivity, strength, materials properties
- custom: anything else

Query: {query}

Return only the domain name, nothing else.
"""

def classify_domain(query: str) -> str:
    prompt = DOMAIN_CLASSIFICATION_PROMPT.format(query=query)
    response = get_llm_response(prompt, model="gpt-4o-mini")
    return response.strip().lower()
```

### 5.3 Litmus Translator

```python
# translators/litmus_translator.py
from typing import Dict, List
from domains import load_domain_config

class LitmusTranslator:
    """Converts adapter-normalized hypothesis to Litmus experiment_intake.json"""

    def __init__(self, domain: str):
        self.config = load_domain_config(domain)

    def translate(self, hypothesis: Dict, user_prefs: Dict = None) -> Dict:
        """
        Convert a generated hypothesis into Litmus experiment intake format.

        Args:
            hypothesis: Output from Theorizer pipeline
            user_prefs: User preferences (budget, timeline, etc.)

        Returns:
            Litmus experiment_intake.json compatible dict
        """
        user_prefs = user_prefs or {}
        experiment_type = self._infer_experiment_type(hypothesis)

        intake = {
            "metadata": {
                "submitter_type": "ai_agent",
                "agent_identifier": "theorizer/v1",
                "tags": [self.config["domain"]]
            },
            "experiment_type": experiment_type,
            "title": self._generate_title(hypothesis),
            "hypothesis": {
                "statement": hypothesis["statement"],
                "null_hypothesis": hypothesis.get("null_hypothesis", ""),
                "why_interesting": hypothesis.get("rationale", ""),
                "prior_work": self._extract_citations(hypothesis)
            },
            "compliance": self._infer_compliance(hypothesis),
            "turnaround_budget": {
                "budget_max_usd": user_prefs.get("budget", 500),
                "desired_turnaround_days": user_prefs.get("days", 14),
                "budget_flexibility": "flexible_25"
            },
            "deliverables": {
                "minimum_package_level": user_prefs.get("deliverables", "L1_BASIC_QC")
            }
        }

        # Add experiment-type-specific parameters (required for /validate)
        intake.update(self._get_type_specific_params(experiment_type, hypothesis))

        return intake

    def _infer_experiment_type(self, hypothesis: Dict) -> str:
        """Map hypothesis content to Litmus experiment type"""
        valid_types = self.config.get("litmus_experiment_types", ["CUSTOM"])

        # Use LLM to classify if multiple options
        if len(valid_types) == 1:
            return valid_types[0]

        # Simple keyword matching or LLM classification
        content = str(hypothesis).lower()

        if "ic50" in content and "cell" in content:
            return "CELL_VIABILITY_IC50"
        elif "ic50" in content and "enzyme" in content:
            return "ENZYME_INHIBITION_IC50"
        elif "mic" in content or "mbc" in content:
            return "MIC_MBC_ASSAY"
        elif "zone" in content and "inhibition" in content:
            return "ZONE_OF_INHIBITION"
        elif "qpcr" in content or "expression" in content:
            return "QPCR_EXPRESSION"
        elif "plasmid" in content or "sequenc" in content:
            return "SANGER_PLASMID_VERIFICATION"
        else:
            return "CUSTOM"

    def _infer_compliance(self, hypothesis: Dict) -> Dict:
        """Infer safety/compliance requirements"""
        content = str(hypothesis).lower()

        return {
            "bsl": "BSL2" if any(x in content for x in
                ["pathogen", "bsl2", "infectious", "human cell"]) else "BSL1",
            "human_derived_material": "human" in content and "cell" in content,
            "animal_derived_material": any(x in content for x in
                ["mouse", "rat", "animal", "serum"]),
            "hazardous_chemicals": any(x in content for x in
                ["toxic", "hazardous", "carcinogen"])
        }
```

**Translator requirements (must pass `/validate`)**:
- Use exact field names from `schemas/experiment_intake.json` (e.g., `deliverables.minimum_package_level`, `compliance.bsl`).
- Always include the experiment-specific section (e.g., `cell_viability`, `qpcr`, `mic_mbc`) when `experiment_type` is not `CUSTOM`.
- For `CUSTOM`, always include `custom_protocol` with at least `protocol_title` and `brief_description`.

### 5.4 Litmus API Client

```python
# api/litmus_client.py
import httpx
from typing import Dict, Optional

class LitmusClient:
    """Client for Litmus Platform API"""

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.headers = {"X-API-Key": api_key}

    async def validate(self, intake: Dict) -> Dict:
        """Validate experiment intake without submitting"""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/validate",
                json=intake,
                headers=self.headers
            )
            return resp.json()

    async def estimate(self, intake: Dict) -> Dict:
        """Get cost and time estimate"""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/estimate",
                json=intake,
                headers=self.headers
            )
            return resp.json()

    async def submit(self, intake: Dict) -> Dict:
        """Submit experiment for execution"""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/experiments",
                json=intake,
                headers=self.headers
            )
            return resp.json()

    async def get_status(self, experiment_id: str) -> Dict:
        """Check experiment status"""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/experiments/{experiment_id}",
                headers=self.headers
            )
            return resp.json()

    async def get_results(self, experiment_id: str) -> Dict:
        """Retrieve experiment results"""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/experiments/{experiment_id}/results",
                headers=self.headers
            )
            return resp.json()
```

---

## 6. SOTA Open Source Tools to Integrate

Based on 2026 landscape research:

| Tool | Use For | Integration |
|------|---------|-------------|
| **[FutureHouse paper-qa](https://github.com/Future-House/paper-qa)** | Literature search & QA | Replace/augment paper retrieval |
| **[Kosmos](https://github.com/jimmc414/Kosmos)** | Complex multi-cycle research | Optional advanced mode |
| **[BioDiscoveryAgent](https://github.com/snap-stanford/BioDiscoveryAgent)** | Genetic perturbation design | Domain-specific agent |
| **LiteLLM** | Multi-provider LLM access | Already in Theorizer |

### Recommended: Use paper-qa for Literature

```python
# paper_sources/paperqa_adapter.py
from paperqa import Settings, ask

class PaperQASource:
    """Use FutureHouse paper-qa for enhanced literature search"""

    def __init__(self, docs_path: str = None):
        self.settings = Settings(
            llm="gpt-4o-mini",
            summary_llm="gpt-4o-mini",
        )

    async def search_and_synthesize(self, query: str) -> Dict:
        """Get literature-grounded answer with citations"""
        result = await ask(
            query,
            settings=self.settings,
        )
        return {
            "answer": result.answer,
            "citations": result.contexts,
            "confidence": result.confidence
        }
```

---

## 7. Implementation Phases

### Phase 0: Adapter MVP (Week 0-1)

- [ ] Stand up a thin **Theorizer adapter service** (new endpoints; see API section)
- [ ] Map Theorizer theory → **Litmus intake** using `CUSTOM` experiment type only
- [ ] Populate `custom_protocol.protocol_title` + `custom_protocol.brief_description` at minimum
- [ ] Ensure intake passes `/validate` and `/estimate`
- [ ] Return Litmus-ready intake + estimate to frontend

### Porting Scope (explicit)

**Reuse as-is**:
- `Theorizer.py`, `SchemaExtractionQueue.py`, `ExtractionUtils.py`
- `Struct.py` (core theory data structures; extend only if needed)
- `PaperStore.py` / `SemanticScholar.py` (initially, before new sources land)

**Port with minimal edits**:
- `TheorizerServer.py` → wrap behind adapter (or add `/hypothesize`)
- `TheorizerProcessing.py` → extract domain-specific prompt examples
- `PaperFinderRequests.py` → keep until multi-source router replaces it

**New code (required)**:
- Theorizer adapter service (normalize output + auth boundary)
- `LitmusTranslator` with experiment-type sections
- Paper source adapters (PubMed, PMC, ChemRxiv, ClinicalTrials, Crossref)

### Phase 1: Core Refactoring (Week 1-2)

- [ ] Fork asta-theorizer
- [ ] Extract domain-specific code from `TheorizerProcessing.py`
- [ ] Create `domains/` YAML config structure
- [ ] Implement `PaperSourceRegistry` with Semantic Scholar + PubMed + PMC
- [ ] Add domain classifier

### Phase 2: Typed Experiment Mapping (Week 2-3)

- [ ] Implement `LitmusTranslator` **per experiment type** (add required sections)
- [ ] Implement `LitmusClient`
- [ ] Add validation step before submission
- [ ] Add a mapping table from Theorizer components → Litmus schema fields

### Phase 3: Paper Sources (Week 3-4)

- [ ] Add BioRxiv adapter
- [ ] Add ChemRxiv adapter
- [ ] Add ClinicalTrials.gov adapter
- [ ] Add Crossref DOI resolver
- [ ] Integrate paper-qa for enhanced retrieval
- [ ] Implement source routing based on domain (chemistry/clinical/materials)

### Phase 4: B2C Interface (Week 4-5)

- [ ] Design hypothesis submission UI
- [ ] Add cost/time estimation display
- [ ] Implement results tracking dashboard
- [ ] User accounts and history

### Phase 5: Feedback Loop (Week 5-6)

- [ ] Store experiment results
- [ ] Feed results back to hypothesis refinement
- [ ] Implement hypothesis scoring based on outcomes
- [ ] Add learning from successful/failed experiments

---

## 8. Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **LLM** | LiteLLM (GPT-4o, Claude, etc.) | Multi-provider, already in Theorizer |
| **Literature** | paper-qa + PubMed/PMC/BioRxiv/ChemRxiv/arXiv/ClinicalTrials/Crossref | SOTA, open source |
| **Backend** | FastAPI | Already in Litmus, async-first |
| **Frontend** | Next.js 15 | Already in Litmus |
| **Database** | PostgreSQL | Already planned for Litmus |
| **Queue** | Native Python (upgrade to Redis later) | KISS |
| **Config** | YAML | Human-readable, easy to extend |
| **Hosting** | Railway | Already configured for Litmus |

---

## 9. API Design

### New Endpoints (Theorizer Adapter Service)

```yaml
# POST /hypothesize
# Generate a theory/hypothesis from natural language query
Request:
  query: "Find drug candidates for EGFR inhibition"
  domain: "auto"  # or specific domain
  paper_limit: 50

Response:
  hypothesis_id: "hyp-123"
  status: "processing"

# GET /hypothesize/{id}
# Get hypothesis status and result (adapter polls Theorizer)
Response:
  status: "completed"
  hypothesis:
    statement: "Compound X inhibits EGFR with IC50 < 50nM"
    rationale: "Based on 47 papers..."
    supporting_evidence: [...]
    suggested_experiments: [...]
  litmus_intake: { ... }  # Valid intake JSON (includes experiment-specific section)

# POST /hypothesize/{id}/submit-to-litmus
# Submit hypothesis to Litmus for execution (requires Litmus auth)
Request:
  budget_max_usd: 500
  desired_turnaround_days: 14

Response:
  litmus_experiment_id: "exp-456"
  estimated_cost: 350
  estimated_days: 10
```

**Note**: The upstream Theorizer server currently exposes endpoints like `/theoryrequestmanual`, `/theorylist`, and `/theory/<id>`. The adapter should wrap these and normalize output into the Litmus-ready schema above.

### Adapter Tracking Layer (MVP)

**Goal**: Provide stable `hypothesis_id` and status without modifying Theorizer.

**Adapter storage (minimal)**:
- `hypothesis_id` (UUID)
- `query`, `domain`, `paper_limit`
- `status` (`processing`/`completed`/`failed`)
- `theorizer_marker` (string embedded in query)
- `theory_ids` (array)
- timestamps + error field

**Flow**:
1. `POST /hypothesize`:
   - Generate `hypothesis_id`.
   - Append marker to query (e.g., `[litmus_request_id=<uuid>]`).
   - Call Theorizer `/theoryrequestmanual` with the marked query.
   - Return `{ hypothesis_id, status: "processing" }`.
2. Background poller (every N seconds):
   - Call Theorizer `/theorylist`.
   - Match theories where `theory_query` contains the marker.
   - Store `theory_ids`, set status `completed`.
3. `GET /hypothesize/{id}`:
   - Return status + normalized hypothesis + Litmus intake if completed.

**Preferred (more robust) alternative**:
- Add a `workflow_id` return value to Theorizer server and store it in adapter (eliminates marker matching).

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Hypothesis generation time | 30–60 minutes (MVP); < 10 minutes after optimization |
| Literature coverage | > 100 papers per query |
| Litmus validation pass rate | > 90% |
| User satisfaction (B2C) | > 4/5 stars |
| Cost per hypothesis | < $5 (LLM costs) |

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Hallucinated hypotheses | Require literature citations for all claims |
| Infeasible experiments | Litmus `/validate` catches issues before submission |
| Domain coverage gaps | Start with 3-4 domains, expand based on demand |
| Full-text access limits | Use PMC for open access; fall back to abstracts + ask user for PDFs |
| Cloud-lab translator mismatch | Align translators to `schemas/experiment_intake.json` or add an explicit mapping layer before translation |
| Cloud lab API delays | Stubbed implementations work; credentials are business blocker |
| Cost overruns (LLM) | Use gpt-4o-mini for extraction, gpt-4o for synthesis |

---

## 12. Plan Analysis (What’s Solid vs What Needs Revision)

**Solid**:
- High-level pipeline concept
- Use of Litmus validation/estimate/submit flow
- Cloud-lab agnosticism
- Need for a translation layer

**High-risk gaps**:
- Translator must map Theorizer output → Litmus intake including experiment-specific sections (e.g., `cell_viability`, `qpcr`), otherwise `/validate` will fail.
- Theorizer’s core pipeline is not “unchanged” if you add new paper sources; it is coupled to Semantic Scholar/PaperFinder in `src/PaperStore.py`.
- Domain classifier + YAML configs are net-new architecture; nothing in Theorizer currently supports this model.
- Authentication and service boundaries are unspecified: Litmus requires auth (`X-API-Key` or Bearer in `backend/main.py`), Theorizer does not.

**If you want this plan to be executable as-is**:
1. Define a concrete mapping from Theorizer components to Litmus experiment-specific schema fields.
2. Add a thin service adapter for Theorizer that exposes `/hypothesize` and outputs a Litmus-ready hypothesis object.
3. Update the translator spec to align with `schemas/experiment_intake.json` field names.
4. Adjust success metrics to match Theorizer’s current runtime or plan for major performance rework.

---

## 13. Mapping Table (Theorizer → Litmus Intake)

**Purpose**: Normalize Theorizer output into a Litmus‑valid `experiment_intake.json`.

### 13.1 Core Fields (all experiment types)

| Litmus Field | Source (Theorizer / Adapter) | Notes |
|------------|-------------------------------|-------|
| `title` | `theory.name` or adapter-generated | Use `theory.description` if no name |
| `hypothesis.statement` | `theory.components.theory_statements[0].theory_statement` | Fallback: `theory.description` |
| `hypothesis.null_hypothesis` | adapter-generated | Required by Litmus; derive as negation/placeholder |
| `hypothesis.why_interesting` | `theory.description` | Or use rationale summary |
| `hypothesis.prior_work[]` | `theory.components.theory_statements[*].supporting_evidence` | Requires UUID → DOI/PMID/URL resolution layer |
| `compliance.bsl` | adapter default (`BSL1`) or inferred | Must be `BSL1` or `BSL2` |
| `compliance.human_derived_material` | adapter inference | Based on entity extraction (e.g., “human cell line”) |
| `compliance.animal_derived_material` | adapter inference | Based on model organism mentions |
| `compliance.hazardous_chemicals` | adapter inference | Based on toxicity/compound class |
| `turnaround_budget.budget_max_usd` | user input or default | Required |
| `turnaround_budget.desired_turnaround_days` | user input or default | Optional |
| `deliverables.minimum_package_level` | user input or default | Required (`L0_RAW_ONLY`, `L1_BASIC_QC`, `L2_INTERPRETATION`) |

### 13.2 Experiment‑Specific Sections (required when not `CUSTOM`)

**CELL_VIABILITY_IC50 → `cell_viability`**
- `compound_name` ← extracted `compound_name`
- `cell_line` ← extracted `cell_line`
- `assay_type` ← default `"CELLTITER_GLO"` unless specified
- `dose_range` ← derive from activity values; else require user input
- Optional but recommended: `exposure_time_hours`, `solvent`

**ENZYME_INHIBITION_IC50 → `enzyme_inhibition`**
- `target_enzyme` ← extracted `target_protein`
- `inhibitor_name` ← extracted `compound_name`
- `assay_type` ← extracted `assay_type`
- `substrate` ← extracted or user input
- Optional but recommended: `enzyme_concentration`, `substrate_concentration`

**QPCR_EXPRESSION → `qpcr`**
- `targets[].gene_symbol` ← extracted `gene_name`
- `housekeeping_genes[]` ← user input (required for real execution)
- `sample_type` ← inferred from `cell_line`/tissue (`cells`/`RNA`/`cDNA`) or user input
- Optional: `conditions[]`, `number_of_samples`

**SANGER_PLASMID_VERIFICATION → `sanger`**
- `template_type` ← inferred (`plasmid`/`pcr_product`/`genomic`) or user input
- `primers[]` ← user input (required for real execution)
- Optional: `expected_insert_size_bp`, `reference_sequence_attached`

**MIC_MBC_ASSAY → `mic_mbc`**
- `organism` ← extracted `organism`
- `compound_name` ← extracted `compound`
- `medium` ← extracted `growth_medium`
- Optional: `concentration_range`, `strain`

**MICROBIAL_GROWTH_MATRIX → `microbial_growth`**
- `organism` ← extracted `organism`
- `base_medium` ← extracted `growth_medium`
- `condition_matrix` ← extracted factors (temperature, pH, additives)
- Optional: `incubation_temperature_c`, `incubation_hours`

**ZONE_OF_INHIBITION → `zone_of_inhibition`**
- `organism` ← extracted `organism`
- `compound_name` ← extracted `compound`
- Optional: `strain`, `medium`, `disk_loading`

**CUSTOM → `custom_protocol`**
- `protocol_title` ← adapter‑generated title
- `brief_description` ← `theory.description` + adapter summary
- Optional: `steps[]`, `equipment_required[]`, `safety_notes[]`

**Rule**: `/validate` only enforces the section’s presence, but **real execution** requires required fields (e.g., primers for Sanger, housekeeping genes for qPCR). Surface missing fields to the user before submission.

### 13.3 Execution‑Ready Checklist (Minimums)

**To pass `/validate` (backend)**:
- `experiment_type`, `title`, `compliance.bsl`, `deliverables.minimum_package_level`, `turnaround_budget.budget_max_usd`
- Experiment‑specific section present (e.g., `cell_viability`, `custom_protocol`)
- `hypothesis.statement` is strongly recommended (backend warning if missing)

**To be execution‑ready (use examples as baseline)**:
- Use `examples/intake_*.json` as canonical field sets for each experiment type.
- For `CUSTOM`, always provide `custom_protocol.protocol_title` + `custom_protocol.brief_description`.
- For `QPCR_EXPRESSION`, collect `qpcr.targets[].gene_symbol` and `housekeeping_genes[]`.
- For `SANGER_PLASMID_VERIFICATION`, collect `sanger.template_type` + `sanger.primers[]`.

---

## 14. Open Questions

1. **Pricing model**: Per hypothesis? Per experiment? Subscription?
2. **Data privacy**: How long to retain user queries and results?
3. **Feedback loop**: How to handle failed experiments (refund? retry?)?
4. **Multi-step experiments**: Support experiment chains (if A, then B)?
5. **Human-in-the-loop**: Required approval before cloud lab submission?

---

## 15. Next Steps

1. **Immediate**: Set up fork of asta-theorizer in litmus org
2. **This week**: Stand up Theorizer adapter service (`/hypothesize` + status)
3. **This week**: Implement PubMed + PMC paper source adapters
4. **This week**: Create first domain configs (drug_discovery.yaml, clinical_trials.yaml, materials_science.yaml)
5. **Next week**: Build LitmusTranslator MVP (CUSTOM) + mapping table
6. **Next week**: End-to-end test: query → hypothesis → Litmus intake → `/validate` → `/estimate`

---

*Last updated: 2026-01-31*

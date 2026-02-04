# User Interface Gap Analysis

> **Question**: What to do with user-facing interfaces? Litmus and Theorizer both not enough.

---

## 1. Current State

### 1.1 Theorizer UI (`TheorizerWebInterface.py`)

| Aspect | Assessment |
|--------|------------|
| **Framework** | PyWebIO (Python-based, server-rendered) |
| **Target User** | Researchers, power users |
| **Design** | Functional, minimal styling |
| **Mobile** | Not optimized |

**Pages**:
| Page | Purpose | B2C Ready? |
|------|---------|------------|
| `/theoryrequestmanual` | Submit single theory query | ❌ Too technical |
| `/theoryrequestmanualbatch` | Submit batch queries | ❌ Power user only |
| `/theorylist` | View generated theories | ⚠️ Needs redesign |
| `/theory/{id}` | Theory details | ⚠️ Needs redesign |
| `/status` | Pipeline status | ❌ Internal tool |

**What it does well**:
- Model selection (gpt-4, claude, etc.)
- Literature parameters (paper count, cutoff dates)
- Batch processing
- Status monitoring

**What it lacks**:
- Modern UX/UI (no Tailwind, no components)
- No hypothesis → experiment conversion
- No cost/time estimation
- No approval workflow
- No results tracking
- No user accounts

---

### 1.2 Litmus UI (`frontend/app/`)

| Aspect | Assessment |
|--------|------------|
| **Framework** | Next.js 15 + React 19 |
| **Target User** | Researchers who know what they want |
| **Design** | Clean, modern (Tailwind) |
| **Mobile** | Responsive |

**Pages**:
| Page | Purpose | B2C Ready? |
|------|---------|------------|
| `/login`, `/register` | Auth | ✅ Ready |
| `/dashboard` | List experiments | ✅ Ready |
| `/experiments/new` | Create experiment | ⚠️ Manual only |
| `/experiments/[id]` | Experiment details | ✅ Ready |
| `/experiments/[id]/results` | View results | ✅ Ready |
| `/templates` | Protocol templates | ⚠️ Browse only |
| `/operator/jobs` | Operator job list | ✅ Ready (B2B) |

**What it does well**:
- Clean experiment creation form
- Cost estimation display
- Experiment status tracking
- Results viewing
- Operator workflow

**What it lacks**:
- No hypothesis generation
- No literature search
- No AI assistance
- User must know experiment type upfront
- User must write hypothesis manually
- No "ask a question" flow

---

## 2. The Gap: What's Missing

### 2.1 The Desired B2C Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER ASKS QUESTION (natural language)                        │
│     "What drugs might inhibit EGFR in lung cancer?"              │
│     ↓                                                            │
├─────────────────────────────────────────────────────────────────┤
│  2. LITERATURE SEARCH (automated)                                │
│     ← Searching 150 papers from PubMed, BioRxiv...              │
│     ← Found 47 relevant papers                                   │
│     ↓                                                            │
├─────────────────────────────────────────────────────────────────┤
│  3. HYPOTHESIS GENERATION (AI)                                   │
│     ← Extracting evidence from papers...                        │
│     ← Generating testable hypotheses...                         │
│     ↓                                                            │
├─────────────────────────────────────────────────────────────────┤
│  4. HYPOTHESIS REVIEW (user approval)                            │
│     "Compound X inhibits EGFR with IC50 < 50nM"                  │
│     [Edit] [Accept] [Reject] [Regenerate]                        │
│     ↓                                                            │
├─────────────────────────────────────────────────────────────────┤
│  5. EXPERIMENT PROPOSAL (automated translation)                  │
│     Experiment Type: CELL_VIABILITY_IC50                         │
│     Cell Line: A549 (lung cancer)                                │
│     Compound: Compound X                                         │
│     Estimated Cost: $350-500                                     │
│     Estimated Time: 7-10 days                                    │
│     [Edit Details] [Approve & Submit]                            │
│     ↓                                                            │
├─────────────────────────────────────────────────────────────────┤
│  6. LAB EXECUTION (Litmus + Cloud Labs)                          │
│     Status: In Progress → Completed                              │
│     ↓                                                            │
├─────────────────────────────────────────────────────────────────┤
│  7. RESULTS & FEEDBACK                                           │
│     IC50 = 42nM ✓ Hypothesis Supported                           │
│     [Download Data] [New Experiment] [Refine Hypothesis]         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Neither UI Supports This

| Step | Theorizer UI | Litmus UI | Gap |
|------|--------------|-----------|-----|
| 1. Natural language input | ✅ Has query input | ❌ No | - |
| 2. Literature search | ✅ Automated | ❌ No | - |
| 3. Hypothesis generation | ✅ Generates theories | ❌ No | - |
| 4. User review/edit | ⚠️ View only | ❌ No | **NEW NEEDED** |
| 5. Experiment translation | ❌ No | ❌ No | **NEW NEEDED** |
| 6. Cost/time estimation | ❌ No | ✅ Has `/estimate` | Integration |
| 7. Approval workflow | ❌ No | ❌ No | **NEW NEEDED** |
| 8. Submission | ❌ No | ✅ Has `/experiments` | Integration |
| 9. Status tracking | ❌ No | ✅ Has dashboard | Integration |
| 10. Results display | ❌ No | ✅ Has results page | Integration |
| 11. Feedback loop | ❌ No | ❌ No | **NEW NEEDED** |

---

## 3. Options Analysis

### Option A: Extend Litmus Frontend (Recommended)

**Add new pages to existing Next.js app**:

```
frontend/app/
├── (existing)
│   ├── dashboard/
│   ├── experiments/
│   └── ...
│
└── (new) hypothesize/
    ├── page.tsx              # Natural language input
    ├── [id]/
    │   ├── page.tsx          # Generation status + review
    │   ├── edit/page.tsx     # Edit hypothesis
    │   └── submit/page.tsx   # Approve & submit to Litmus
    └── history/page.tsx      # Past hypotheses
```

**Pros**:
- Unified codebase
- Shared auth, components, styling
- Single deployment
- Consistent UX

**Cons**:
- Couples hypothesis generation to Litmus
- Larger frontend bundle

**Effort**: Medium (2-3 weeks)

---

### Option B: Separate Hypothesis UI (Standalone)

**New Next.js app specifically for hypothesis generation**:

```
hypothesis-ui/
├── app/
│   ├── page.tsx              # Landing + input
│   ├── generate/[id]/
│   │   ├── page.tsx          # Status + results
│   │   └── review/page.tsx   # Review + edit
│   └── submit/[id]/page.tsx  # Submit to Litmus
├── lib/
│   ├── theorizer-client.ts   # Talk to Theorizer adapter
│   └── litmus-client.ts      # Talk to Litmus API
└── components/
    └── ...
```

**Pros**:
- Clean separation of concerns
- Can evolve independently
- Can be used without Litmus

**Cons**:
- Duplicate auth/styling
- Two deployments
- UX fragmentation

**Effort**: Medium-High (3-4 weeks)

---

### Option C: Rebuild Theorizer UI in Next.js

**Replace PyWebIO with modern React**:

```
theorizer/
├── (backend unchanged)
└── web/                      # New Next.js frontend
    ├── app/
    │   ├── page.tsx          # Query input
    │   ├── theories/
    │   ├── status/
    │   └── ...
    └── components/
```

**Pros**:
- Modern Theorizer UI
- Could share components with Litmus

**Cons**:
- Doesn't solve the integration problem
- Still two separate UIs
- Duplicated effort

**Effort**: High (4+ weeks)

---

### Option D: Unified "Science Discovery" Platform

**Single app combining both**:

```
litmus-science/
├── app/
│   ├── (public)
│   │   ├── page.tsx          # Landing page
│   │   └── pricing/
│   │
│   ├── (auth)
│   │   ├── login/
│   │   └── register/
│   │
│   ├── discover/             # Hypothesis generation (NEW)
│   │   ├── page.tsx          # "Ask a question"
│   │   ├── [id]/page.tsx     # Generation + review
│   │   └── history/
│   │
│   ├── experiments/          # Existing Litmus
│   │   ├── page.tsx
│   │   ├── new/
│   │   └── [id]/
│   │
│   └── operator/             # Existing Litmus
│       └── ...
│
└── components/
    ├── hypothesis/
    │   ├── QueryInput.tsx
    │   ├── GenerationStatus.tsx
    │   ├── HypothesisCard.tsx
    │   └── ExperimentProposal.tsx
    └── experiments/
        └── (existing)
```

**Pros**:
- Single unified platform
- Seamless user journey
- Shared everything

**Cons**:
- Largest scope
- Requires architectural decisions upfront

**Effort**: High (4-6 weeks)

---

## 4. Recommendation

### Short Term: Option A (Extend Litmus)

Add `/hypothesize` routes to existing Litmus frontend:

1. **`/hypothesize`** - Natural language input form
2. **`/hypothesize/[id]`** - Generation status + hypothesis review
3. **`/hypothesize/[id]/submit`** - Experiment proposal + approval

This gives you:
- Working B2C flow quickly
- Uses existing Litmus infrastructure
- Minimal new code

### Long Term: Option D (Unified Platform)

Once validated, merge into a unified "Litmus Science" platform with:
- Public landing page
- Discovery flow (hypothesis generation)
- Execution flow (experiments)
- Operator portal

---

## 5. New Components Needed

### 5.1 Hypothesis Input (`QueryInput.tsx`)

```
┌─────────────────────────────────────────────────────────────┐
│  🔬 What scientific question do you want to explore?        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ What compounds inhibit EGFR in lung cancer cells?   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Domain: [Auto-detect ▼]  Budget: [$500 ▼]  Speed: [Normal ▼]│
│                                                             │
│  [Examples ▼]                          [Generate Hypothesis] │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Generation Status (`GenerationStatus.tsx`)

```
┌─────────────────────────────────────────────────────────────┐
│  Generating Hypothesis                                       │
│                                                             │
│  ✓ Searching literature... (47 papers found)                │
│  ✓ Extracting evidence... (156 data points)                 │
│  ◉ Synthesizing hypothesis... (2/4 theories)                │
│  ○ Preparing experiment proposal...                         │
│                                                             │
│  ████████████████████░░░░░░░░  65%                          │
│                                                             │
│  Estimated time remaining: ~3 minutes                       │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Hypothesis Review (`HypothesisCard.tsx`)

```
┌─────────────────────────────────────────────────────────────┐
│  Generated Hypothesis                           [Edit] [✓]  │
│                                                             │
│  "Gefitinib inhibits EGFR with IC50 < 50nM in A549 cells"  │
│                                                             │
│  Confidence: ████████░░ 82%                                │
│                                                             │
│  Supporting Evidence (12 papers):                           │
│  • Smith et al. 2024 - "EGFR inhibitors in NSCLC..."       │
│  • Jones et al. 2023 - "Gefitinib resistance..."           │
│  • [Show all 12]                                            │
│                                                             │
│  [Reject]  [Modify]  [Accept & Continue →]                  │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Experiment Proposal (`ExperimentProposal.tsx`)

```
┌─────────────────────────────────────────────────────────────┐
│  Proposed Experiment                                         │
│                                                             │
│  Type: Cell Viability IC50 Assay                            │
│  Cell Line: A549 (human lung carcinoma)                     │
│  Compound: Gefitinib                                        │
│  Dose Range: 0.1nM - 10μM (8-point)                        │
│  Replicates: 3                                              │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Estimated Cost: $350 - $500                        │   │
│  │  Estimated Time: 7-10 business days                 │   │
│  │  Lab: Emerald Cloud Lab (ECL)                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Back]  [Edit Details]  [Submit Experiment →]              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. API Integration Points

### Theorizer Adapter → Litmus

```typescript
// lib/theorizer-client.ts
export async function generateHypothesis(query: string, options: {
  domain?: string;
  paperLimit?: number;
  budget?: number;
}): Promise<{ hypothesisId: string }>;

export async function getHypothesisStatus(id: string): Promise<{
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  hypothesis?: Hypothesis;
  litmusIntake?: ExperimentIntake;
}>;

export async function submitToLitmus(hypothesisId: string, overrides?: Partial<ExperimentIntake>): Promise<{
  experimentId: string;
  estimatedCost: number;
  estimatedDays: number;
}>;
```

### Litmus API (Existing)

```typescript
// lib/api.ts (existing)
export async function estimateCost(intake: Record<string, unknown>): Promise<CostEstimate>;
export async function createExperiment(intake: Record<string, unknown>): Promise<{ experiment_id: string; status: string; created_at: string }>;
export async function getExperiment(id: string): Promise<Experiment>;
export async function getResults(id: string): Promise<ExperimentResults>;
```

**MVP auth assumption**: Litmus backend runs with `LITMUS_AUTH_DISABLED=true` (or `LITMUS_DEBUG=true`), so the frontend can call these endpoints without tokens.

---

## 7. Summary

| UI | Good For | Not Good For |
|----|----------|--------------|
| **Theorizer (PyWebIO)** | Researchers running theory queries | B2C, experiment execution |
| **Litmus (Next.js)** | Experiment submission & tracking | Hypothesis generation |
| **Neither** | End-to-end question → experiment → results flow | |

**The solution**: Extend Litmus frontend with `/hypothesize` routes that:
1. Accept natural language input
2. Call Theorizer adapter for hypothesis generation
3. Present hypothesis for user review/edit
4. Translate to Litmus experiment intake
5. Show cost/time estimate
6. Submit to existing Litmus experiment flow
7. Track through to results

**New UI code needed**: ~4-6 new React components, ~3 new pages

**Backend needed**: Theorizer adapter service (see main integration plan)

---

*Last updated: 2026-01-31*

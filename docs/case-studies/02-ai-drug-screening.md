# Case Study: AI-Driven Drug Repurposing Screen

**User Profile**: BioML Research (startup), using AI models to identify drug repurposing candidates  
**Budget**: $12,000 (batch of 24 experiments)  
**Outcome**: 3 hits identified, 1 advancing to further study

---

## The Problem

BioML Research uses machine learning models to predict which existing drugs might work against new disease targets. Their models generate hundreds of candidates, but computational predictions need wet lab validation.

Traditional CROs wanted $50K+ minimum contracts and 8-week timelines just to screen 20 compounds. BioML needed faster, cheaper iteration.

## The Approach

BioML built an automated pipeline:

1. ML model generates ranked compound predictions
2. Pipeline auto-generates Litmus experiment specifications
3. Experiments submitted via API
4. Results feed back into model training

This case study covers one batch: 24 compounds predicted to inhibit a kinase target implicated in inflammatory disease.

## Pipeline Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  ML Prediction  │────▶│  Spec Generator  │────▶│   Litmus API    │
│     Model       │     │   (Python)       │     │                 │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Model Retraining│◀────│  Results Parser  │◀────│    Webhooks     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Experiment Generation Code

BioML's spec generator:

```python
def generate_litmus_spec(compound: Compound, target: Target) -> dict:
    return {
        "metadata": {
            "submitter_type": "ai_agent",
            "agent_identifier": "bioml-repurposing-v2.1",
            "tags": [target.name, "repurposing", f"batch-{batch_id}"]
        },
        "hypothesis": {
            "statement": f"{compound.name} inhibits {target.name} with IC50 ≤ 10μM",
            "null_hypothesis": f"{compound.name} does not inhibit {target.name} (IC50 > 100μM or no inhibition)",
            "rationale": f"Predicted by ML model with confidence {compound.prediction_score:.2f}. Structural similarity to known {target.name} inhibitors: {compound.tanimoto_similarity:.2f}",
            "variables": {
                "independent": [{
                    "name": f"{compound.name} concentration",
                    "values": [
                        {"value": 0, "unit": "μM", "is_control": True},
                        {"value": 0.1, "unit": "μM"},
                        {"value": 0.3, "unit": "μM"},
                        {"value": 1, "unit": "μM"},
                        {"value": 3, "unit": "μM"},
                        {"value": 10, "unit": "μM"},
                        {"value": 30, "unit": "μM"},
                        {"value": 100, "unit": "μM"}
                    ]
                }],
                "dependent": [{
                    "name": f"{target.name} activity",
                    "measurement_method": target.assay_method,
                    "unit": "% of control"
                }],
                "controlled": [
                    {"name": "ATP concentration", "held_at": target.atp_km},
                    {"name": "Substrate concentration", "held_at": target.substrate_km},
                    {"name": "DMSO", "held_at": "1%", "tolerance": "final concentration"}
                ]
            }
        },
        "protocol": {
            "type": "standard_template",
            "template_id": "kinase-inhibition-adp-glo-v1",
            "template_parameters": {
                "kinase": target.name,
                "kinase_source": target.source_catalog,
                "substrate": target.substrate,
                "atp_concentration_uM": target.atp_concentration,
                "incubation_minutes": 60,
                "compound_concentrations_uM": [0.1, 0.3, 1, 3, 10, 30, 100]
            },
            "materials": [{
                "name": compound.name,
                "specification": f"≥95% purity, {compound.cas_number}",
                "quantity": {"value": 5, "unit": "mg"},
                "cas_number": compound.cas_number,
                "provided_by_requester": True
            }],
            "replicates": {
                "technical_replicates": 3,
                "biological_replicates": 1
            }
        },
        "acceptance_criteria": {
            "success_conditions": [{
                "metric": "IC50",
                "operator": "lte",
                "threshold": 10,
                "unit": "μM"
            }],
            "failure_conditions": [
                {"condition": "No inhibition at 100μM", "interpretation": "Inactive"},
                {"condition": "IC50 > 100μM", "interpretation": "Weak/inactive"}
            ]
        },
        "constraints": {
            "budget_max_usd": 500,
            "budget_flexibility": "strict",
            "turnaround_days": 14,
            "bsl_level": "BSL-1",
            "privacy": "delayed_12mo"  # Patent protection period
        },
        "communication_preferences": {
            "webhook_url": "https://api.bioml.io/litmus/webhook",
            "notification_events": ["claimed", "completed", "issue"],
            "preferred_contact_method": "webhook"
        }
    }
```

## Batch Submission

BioML submitted 24 experiments in one API session:

```python
async def submit_batch(compounds: list[Compound], target: Target):
    results = []
    async with aiohttp.ClientSession() as session:
        for compound in compounds:
            spec = generate_litmus_spec(compound, target)
            
            # Validate first
            validate_resp = await session.post(
                "https://api.litmus.science/v1/validate",
                json=spec,
                headers={"Authorization": f"Bearer {API_KEY}"}
            )
            validation = await validate_resp.json()
            
            if not validation["valid"]:
                logger.error(f"Validation failed for {compound.name}: {validation['errors']}")
                continue
            
            # Submit
            submit_resp = await session.post(
                "https://api.litmus.science/v1/experiments",
                json=spec,
                headers={"Authorization": f"Bearer {API_KEY}"}
            )
            result = await submit_resp.json()
            results.append({
                "compound": compound.name,
                "experiment_id": result["experiment_id"],
                "estimated_cost": result["estimated_cost_usd"]
            })
    
    return results
```

Submission completed in 45 seconds. 24 experiments, total estimated cost: $11,400.

## Execution Timeline

| Day | Event |
|-----|-------|
| 0 | 24 experiments submitted |
| 1-2 | All experiments claimed by 4 different operators |
| 3 | First issue flagged: 1 compound insoluble in DMSO at required concentration |
| 5 | Insoluble compound experiment modified (lower concentration range) |
| 8 | First results received (6 experiments) |
| 12 | 18 experiments complete |
| 14 | All 24 experiments complete |

## Results Summary

| Result | Count | Compounds |
|--------|-------|-----------|
| IC50 ≤ 10μM (hit) | 3 | BML-042, BML-089, BML-156 |
| IC50 10-100μM (weak) | 5 | BML-023, BML-067, BML-091, BML-112, BML-178 |
| IC50 > 100μM (inactive) | 14 | [remaining] |
| Inconclusive (solubility) | 2 | BML-033, BML-144 |

**Hit rate: 12.5%** (3/24)

For comparison, BioML's previous ML model version had a 4% hit rate. The improved model (v2.1) showed meaningful improvement.

## Detailed Results: Top Hit

**BML-089** showed the strongest activity:

| Concentration (μM) | Activity (% control) | Std Dev |
|-------------------|---------------------|---------|
| 0 (DMSO) | 100.0 | 3.2 |
| 0.1 | 98.2 | 4.1 |
| 0.3 | 91.5 | 3.8 |
| 1 | 72.3 | 5.2 |
| 3 | 41.2 | 4.6 |
| 10 | 18.7 | 3.1 |
| 30 | 8.3 | 2.4 |
| 100 | 4.1 | 1.8 |

**Calculated IC50: 2.3 ± 0.4 μM**

## Feedback Loop

Results automatically parsed and fed back to model:

```python
@webhook_handler("/litmus/webhook")
async def handle_results(payload: dict):
    if payload["event"] != "experiment.completed":
        return
    
    experiment_id = payload["experiment_id"]
    results = await fetch_full_results(experiment_id)
    
    # Extract IC50 from results
    ic50 = parse_ic50(results["structured_data"])
    
    # Update training database
    await db.experiments.update_one(
        {"experiment_id": experiment_id},
        {"$set": {
            "actual_ic50": ic50,
            "hypothesis_supported": ic50 <= 10 if ic50 else False,
            "results_received_at": datetime.utcnow()
        }}
    )
    
    # Trigger model retraining if batch complete
    batch = await db.batches.find_one({"experiments": experiment_id})
    if all_complete(batch):
        await trigger_retraining(batch["batch_id"])
```

## Cost Analysis

| Item | Amount |
|------|--------|
| 24 experiments @ ~$475 avg | $11,400 |
| Compounds (provided by BioML) | $2,100 |
| Shipping | $180 |
| **Total** | **$13,680** |
| **Cost per compound tested** | **$570** |

Compared to traditional CRO quote: $52,000 for same scope (24 compounds, same assay).

**Savings: 74%**

## Timeline Comparison

| Metric | Litmus | Traditional CRO |
|--------|--------|-----------------|
| Contracting | Instant (API) | 2-3 weeks |
| Execution | 14 days | 6-8 weeks |
| Results format | Structured JSON | PDF report |
| Integration | Automated webhook | Manual extraction |
| **Total time** | **14 days** | **8-11 weeks** |

## Next Steps

BioML advanced BML-089 to:
1. Selectivity panel (testing against related kinases)
2. Cell-based activity assay
3. Preliminary ADMET profiling

All submitted as follow-up experiments through Litmus, referencing the original experiment ID.

## Lessons Learned

1. **Structured output enables automation**: JSON results parse directly into training pipelines. No manual data entry.

2. **Parallelization matters**: 24 experiments across 4 operators completed faster than sequential execution would.

3. **Validation endpoint catches errors early**: 2 experiments had spec issues caught before submission.

4. **Delayed privacy works for IP protection**: 12-month delay gives time for patent filing while eventually contributing to open science.

5. **Hit rate feedback improves models**: Each batch improves prediction accuracy for the next.

## Model Performance Over Time

| Batch | Compounds | Hits | Hit Rate | Model Version |
|-------|-----------|------|----------|---------------|
| 1 | 20 | 1 | 5.0% | v1.0 |
| 2 | 20 | 1 | 5.0% | v1.2 |
| 3 | 24 | 2 | 8.3% | v2.0 |
| 4 | 24 | 3 | 12.5% | v2.1 |
| 5 | 30 | 5 | 16.7% | v2.3 |

The feedback loop is working. Wet lab validation improves computational predictions.

---

*Batch ID: batch_bioml_kinase_2026_04*  
*Results available after embargo: January 2027*

# Tutorial 3: Acceptance Criteria and Submission

You have a hypothesis and a protocol. Before submitting, you need to define what success looks like and set your constraints. This tutorial covers the final pieces and walks through the complete submission process.

## Why Acceptance Criteria Matter

Acceptance criteria are your pre-registered definition of success. They:
- Prevent moving goalposts after seeing data
- Make disputes objective (did results meet criteria or not?)
- Force you to think through what you actually need
- Enable automated validation by AI pipelines

Define these **before** the experiment runs.

## Defining Success Conditions

Each success condition has three parts:
1. **Metric**: What you're measuring
2. **Operator**: How to compare (greater than, less than, between, etc.)
3. **Threshold**: The value that constitutes success

### Example: Enzyme Inhibition

```json
{
  "acceptance_criteria": {
    "success_conditions": [
      {
        "metric": "IC50",
        "operator": "lte",
        "threshold": 10,
        "unit": "μM",
        "description": "Compound must inhibit enzyme with IC50 ≤ 10μM to be considered active"
      },
      {
        "metric": "Maximum inhibition",
        "operator": "gte",
        "threshold": 80,
        "unit": "%",
        "description": "Must achieve at least 80% inhibition at highest concentration tested"
      }
    ]
  }
}
```

### Available Operators

| Operator | Meaning | Use Case |
|----------|---------|----------|
| `gt` | Greater than | "Effect must be >X" |
| `gte` | Greater than or equal | "Effect must be ≥X" |
| `lt` | Less than | "IC50 must be <X" |
| `lte` | Less than or equal | "MIC must be ≤X" |
| `eq` | Equal to | Rarely used (too strict) |
| `neq` | Not equal to | "Must differ from control" |
| `between` | Within range | "pH must be 6.5-7.5" |
| `not_between` | Outside range | "Must not be in toxic range" |

### Using Ranges

For `between` and `not_between`, use an object threshold:

```json
{
  "metric": "Cell viability",
  "operator": "between",
  "threshold": { "min": 80, "max": 120 },
  "unit": "% of control",
  "description": "Compound must not be cytotoxic (viability 80-120% of control)"
}
```

## Defining Failure Conditions

Failure conditions describe results that would definitively reject your hypothesis (as opposed to inconclusive results):

```json
{
  "failure_conditions": [
    {
      "condition": "No inhibition observed at any concentration up to 1mM",
      "interpretation": "Compound is inactive against this target"
    },
    {
      "condition": "IC50 > 100μM",
      "interpretation": "Compound has weak activity, not suitable for further development"
    },
    {
      "condition": "Compound precipitates in assay buffer above 10μM",
      "interpretation": "Solubility-limited; cannot determine true activity"
    }
  ]
}
```

## Statistical Requirements

For quantitative experiments, specify your statistical standards:

```json
{
  "statistical_requirements": {
    "significance_level": 0.05,
    "statistical_test": "t_test",
    "power": 0.8
  }
}
```

### Choosing a Statistical Test

| Test | Use When |
|------|----------|
| `t_test` | Comparing two groups, continuous data, normal distribution |
| `anova` | Comparing 3+ groups |
| `mann_whitney` | Comparing two groups, non-normal data |
| `chi_square` | Categorical outcomes |
| `fisher_exact` | Categorical outcomes, small sample sizes |

If unsure, leave it out—the operator can select the appropriate test based on the data distribution.

## Measurement Precision

Specify how precise measurements need to be:

```json
{
  "measurement_precision": {
    "IC50": {
      "precision": 0.1,
      "unit": "μM"
    },
    "zone_diameter": {
      "precision": 0.5,
      "unit": "mm"
    }
  }
}
```

This helps operators understand your quality requirements and select appropriate methods/instruments.

## Setting Constraints

### Budget

```json
{
  "constraints": {
    "budget_max_usd": 500,
    "budget_flexibility": "flexible_25"
  }
}
```

Flexibility options:
- `strict`: Hard cap, no exceptions
- `flexible_10`: Can go up to 10% over if needed
- `flexible_25`: Can go up to 25% over
- `flexible_50`: Can go up to 50% over

More flexibility = faster matching, as operators have room to handle unexpected costs.

### Turnaround

```json
{
  "turnaround_days": 14,
  "turnaround_priority": "standard"
}
```

Priority levels:
- `standard`: Normal queue, best pricing
- `expedited`: Faster matching, ~20% premium
- `urgent`: Top priority, ~50% premium

### Biosafety Level

```json
{
  "bsl_level": "BSL-1"
}
```

Options:
- `BSL-1`: Non-pathogenic organisms, standard lab practices
- `BSL-2`: Moderate-risk agents, restricted access

Litmus currently only supports BSL-1 and BSL-2 work.

### Privacy

```json
{
  "privacy": "open"
}
```

Options:
- `open`: Results public immediately (default, no extra cost)
- `delayed_6mo`: Private for 6 months, then public (~10% premium)
- `delayed_12mo`: Private for 12 months, then public (~15% premium)
- `private`: Permanently private (~25-50% premium)

Open science is the default. You retain IP on your hypothesis regardless of privacy setting.

## Documentation Requirements

Specify what documentation you need:

```json
{
  "documentation_requirements": {
    "photo_documentation": "key_steps",
    "video_documentation": false,
    "raw_data_formats": ["csv", "images"],
    "lab_notebook_scan": true
  }
}
```

More documentation = higher confidence in results, but also higher cost.

## Communication Preferences (For Automated Pipelines)

If you're building an AI agent that submits experiments, configure webhooks:

```json
{
  "communication_preferences": {
    "webhook_url": "https://your-server.com/litmus/webhook",
    "notification_events": ["claimed", "started", "completed", "issue"],
    "preferred_contact_method": "webhook"
  }
}
```

Webhook payloads are signed for security. See API documentation for verification details.

## Complete Submission Example

Here's a full experiment submission putting everything together:

```json
{
  "metadata": {
    "submitter_type": "human",
    "tags": ["antibacterial", "natural-product", "screening"]
  },
  "hypothesis": {
    "statement": "Compound ABC-123 inhibits E. coli growth with MIC ≤ 32 μg/mL",
    "null_hypothesis": "Compound ABC-123 has no antibacterial activity against E. coli (MIC > 256 μg/mL)",
    "rationale": "ABC-123 is structurally similar to known antibacterial natural products. Preliminary computational docking suggests affinity for bacterial ribosome.",
    "variables": {
      "independent": [
        {
          "name": "ABC-123 concentration",
          "values": [
            { "value": 0, "unit": "μg/mL", "is_control": true },
            { "value": 1, "unit": "μg/mL" },
            { "value": 2, "unit": "μg/mL" },
            { "value": 4, "unit": "μg/mL" },
            { "value": 8, "unit": "μg/mL" },
            { "value": 16, "unit": "μg/mL" },
            { "value": 32, "unit": "μg/mL" },
            { "value": 64, "unit": "μg/mL" },
            { "value": 128, "unit": "μg/mL" },
            { "value": 256, "unit": "μg/mL" }
          ]
        }
      ],
      "dependent": [
        {
          "name": "Bacterial growth",
          "measurement_method": "OD600 after 18h incubation; visual confirmation of turbidity",
          "unit": "OD600"
        }
      ],
      "controlled": [
        { "name": "Bacterial strain", "held_at": "E. coli ATCC 25922" },
        { "name": "Inoculum density", "held_at": "5×10^5 CFU/mL" },
        { "name": "Incubation temperature", "held_at": "37°C", "tolerance": "±1°C" },
        { "name": "Incubation time", "held_at": "18 hours", "tolerance": "±1 hour" }
      ]
    }
  },
  "protocol": {
    "type": "standard_template",
    "template_id": "mic-broth-microdilution-v2",
    "template_parameters": {
      "organism": "Escherichia coli ATCC 25922",
      "medium": "Mueller-Hinton broth",
      "dilution_series": "2-fold",
      "concentration_range": [1, 2, 4, 8, 16, 32, 64, 128, 256],
      "concentration_unit": "μg/mL",
      "incubation_hours": 18,
      "positive_control": "Ampicillin"
    },
    "materials": [
      {
        "name": "Compound ABC-123",
        "specification": "≥95% purity, dissolved in DMSO at 10 mg/mL",
        "quantity": { "value": 2, "unit": "mg" },
        "provided_by_requester": true,
        "storage_requirements": "-20°C, protected from light"
      }
    ],
    "replicates": {
      "technical_replicates": 3,
      "biological_replicates": 2
    }
  },
  "acceptance_criteria": {
    "success_conditions": [
      {
        "metric": "MIC",
        "operator": "lte",
        "threshold": 32,
        "unit": "μg/mL",
        "description": "Compound must inhibit growth at ≤32 μg/mL to be considered active"
      }
    ],
    "failure_conditions": [
      {
        "condition": "No growth inhibition at 256 μg/mL",
        "interpretation": "Compound is inactive against E. coli"
      },
      {
        "condition": "Compound precipitates in MH broth",
        "interpretation": "Cannot determine MIC due to solubility issues"
      }
    ],
    "statistical_requirements": {
      "significance_level": 0.05
    }
  },
  "constraints": {
    "budget_max_usd": 350,
    "budget_flexibility": "flexible_10",
    "turnaround_days": 21,
    "turnaround_priority": "standard",
    "bsl_level": "BSL-1",
    "privacy": "open"
  },
  "documentation_requirements": {
    "photo_documentation": "key_steps",
    "raw_data_formats": ["csv", "images"],
    "lab_notebook_scan": true
  }
}
```

## Submitting via API

### Validate First (Recommended)

```bash
curl -X POST https://api.litmus.science/v1/validate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @experiment.json
```

Response:
```json
{
  "valid": true,
  "errors": [],
  "warnings": [
    {
      "path": "protocol.replicates.biological_replicates",
      "code": "low_replicates",
      "message": "2 biological replicates may not provide sufficient statistical power for publication-quality results. Consider 3+ for definitive conclusions."
    }
  ],
  "safety_flags": []
}
```

### Get Cost Estimate

```bash
curl -X POST https://api.litmus.science/v1/estimate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @experiment.json
```

Response:
```json
{
  "estimated_cost_usd": {
    "low": 180,
    "typical": 250,
    "high": 320
  },
  "estimated_turnaround_days": {
    "standard": 14,
    "expedited": 7
  },
  "cost_breakdown": {
    "materials": 80,
    "labor": 120,
    "equipment": 20,
    "platform_fee": 30,
    "privacy_premium": 0
  },
  "operator_availability": "high"
}
```

### Submit

```bash
curl -X POST https://api.litmus.science/v1/experiments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @experiment.json
```

Response:
```json
{
  "experiment_id": "exp_7a8b9c0d-1234-5678-9abc-def012345678",
  "status": "open",
  "created_at": "2026-01-15T10:30:00Z",
  "estimated_cost_usd": 250,
  "estimated_turnaround_days": 14,
  "links": {
    "self": "https://api.litmus.science/v1/experiments/exp_7a8b9c0d-1234-5678-9abc-def012345678",
    "results": "https://api.litmus.science/v1/experiments/exp_7a8b9c0d-1234-5678-9abc-def012345678/results",
    "cancel": "https://api.litmus.science/v1/experiments/exp_7a8b9c0d-1234-5678-9abc-def012345678"
  }
}
```

## What Happens Next

1. **Open**: Your experiment is visible to qualified operators
2. **Claimed**: An operator accepts the job (you're notified)
3. **In Progress**: Operator executes the protocol
4. **Results Submitted**: You review results against acceptance criteria
5. **Approved/Disputed**: You approve (payment released) or dispute

## After Results: Approval or Dispute

### Approving Results

If results meet your acceptance criteria:

```bash
curl -X POST https://api.litmus.science/v1/experiments/exp_xxx/approve \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rating": 5, "feedback": "Excellent documentation, clear results."}'
```

### Disputing Results

If results don't meet criteria or there are quality issues:

```bash
curl -X POST https://api.litmus.science/v1/experiments/exp_xxx/dispute \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "results_incomplete",
    "description": "Protocol specified 3 biological replicates but only 2 were performed. Missing data for replicate 3."
  }'
```

Disputes are resolved by Litmus based on whether delivered work meets the stated acceptance criteria.

## Tips for Successful Experiments

1. **Start small**: First experiment? Keep it simple. One variable, standard template, low budget.

2. **Be specific in acceptance criteria**: Vague criteria lead to disputes. "Must show activity" is bad. "IC50 ≤ 10μM" is good.

3. **Budget realistically**: Use the estimate endpoint. Lowballing your budget reduces operator interest.

4. **Provide quality materials**: If you're shipping compounds, ensure purity and proper storage.

5. **Communicate**: If an operator has questions, respond promptly. Delays extend turnaround.

6. **Review results carefully**: Check that the protocol was followed, not just the final numbers.

---

## Quick Reference: Submission Checklist

- [ ] Hypothesis complete (statement, null hypothesis, variables)
- [ ] Protocol selected (template with parameters, custom, or design requested)
- [ ] Materials list complete (what you're providing vs. operator sources)
- [ ] Acceptance criteria defined (success conditions with thresholds)
- [ ] Failure conditions stated
- [ ] Budget set (with flexibility level)
- [ ] Turnaround specified
- [ ] BSL level appropriate for the work
- [ ] Privacy setting selected
- [ ] Validated via /validate endpoint
- [ ] Cost estimate reviewed

## You're Ready

You now know how to:
1. Turn a question into a testable hypothesis
2. Select or design a protocol
3. Define what success looks like
4. Submit and manage your experiment

Your first experiment awaits. Start with something you're genuinely curious about.

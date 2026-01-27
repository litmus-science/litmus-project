# Case Study: The Hypothesis That Failed (And Why That's Valuable)

**User Profile**: David, software engineer interested in nootropics  
**Budget**: $400  
**Outcome**: Hypothesis rejected—but informative

---

## The Question

David had been reading about Lion's Mane mushroom (Hericium erinaceus) and its supposed cognitive benefits. He'd seen claims that it promotes nerve growth factor (NGF) production.

He'd also seen that most studies used proprietary extracts, and he wondered: does the Lion's Mane supplement he actually buys do anything measurable?

## The Hypothesis

David's initial idea: "My Lion's Mane supplement boosts brain function."

This is untestable on Litmus (no human subjects), so he refined it to something mechanistic:

**Final hypothesis**: "Hot water extract from my Lion's Mane supplement (Brand X, 500mg capsules) induces NGF secretion in PC12 cells at ≥2x baseline levels at 100μg/mL concentration."

**Rationale**: If the supplement works via NGF induction (as claimed), extract from the actual capsules should show measurable activity in a standard NGF-responsive cell line.

## The Submission

```json
{
  "hypothesis": {
    "statement": "Hot water extract from Lion's Mane supplement (Brand X) induces NGF secretion from PC12 cells at ≥2x baseline at 100μg/mL",
    "null_hypothesis": "Hot water extract from Lion's Mane supplement shows no significant increase in NGF secretion from PC12 cells compared to vehicle control",
    "rationale": "Lion's Mane is marketed for cognitive benefits supposedly mediated by NGF induction. Testing whether a commercial supplement actually shows this activity in a standard assay.",
    "variables": {
      "independent": [
        {
          "name": "Extract concentration",
          "values": [
            { "value": 0, "unit": "μg/mL", "is_control": true },
            { "value": 10, "unit": "μg/mL" },
            { "value": 50, "unit": "μg/mL" },
            { "value": 100, "unit": "μg/mL" },
            { "value": 250, "unit": "μg/mL" }
          ]
        }
      ],
      "dependent": [
        {
          "name": "NGF concentration in conditioned medium",
          "measurement_method": "ELISA",
          "unit": "pg/mL"
        },
        {
          "name": "Cell viability",
          "measurement_method": "MTT assay",
          "unit": "% of control"
        }
      ]
    }
  },
  "protocol": {
    "type": "custom",
    "custom_protocol": {
      "title": "Lion's Mane Extract NGF Induction Assay",
      "steps": [
        {
          "step_number": 1,
          "action": "Prepare extract: Empty 10 capsules into 50mL distilled water. Heat at 80°C for 2 hours with stirring. Filter through 0.22μm. Lyophilize. Reconstitute at 10mg/mL in sterile water.",
          "duration": { "value": 4, "unit": "hours" }
        },
        {
          "step_number": 2,
          "action": "Culture PC12 cells in RPMI-1640 + 10% FBS until 70% confluent"
        },
        {
          "step_number": 3,
          "action": "Seed cells in 96-well plates at 10,000 cells/well. Allow 24h to attach."
        },
        {
          "step_number": 4,
          "action": "Treat with extract at specified concentrations for 48 hours. Include vehicle control (water) and positive control (50ng/mL recombinant NGF)."
        },
        {
          "step_number": 5,
          "action": "Collect conditioned medium. Measure NGF by ELISA."
        },
        {
          "step_number": 6,
          "action": "Assess cell viability by MTT assay to rule out cytotoxicity."
        }
      ]
    },
    "materials": [
      {
        "name": "Lion's Mane supplement capsules",
        "specification": "Brand X, 500mg, Lot #2025-09",
        "quantity": { "value": 20, "unit": "capsules" },
        "provided_by_requester": true
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
        "metric": "NGF induction fold-change",
        "operator": "gte",
        "threshold": 2,
        "unit": "fold over control",
        "description": "At least 2x NGF vs vehicle at any concentration"
      }
    ],
    "failure_conditions": [
      {
        "condition": "Cell viability <70% at test concentrations",
        "interpretation": "Cytotoxicity confounds results"
      },
      {
        "condition": "NGF levels not different from vehicle at any concentration",
        "interpretation": "Extract does not induce NGF secretion"
      }
    ]
  },
  "constraints": {
    "budget_max_usd": 450,
    "budget_flexibility": "flexible_10",
    "turnaround_days": 28,
    "bsl_level": "BSL-1",
    "privacy": "open"
  }
}
```

## The Results

### NGF ELISA Results

| Condition | NGF (pg/mL) | Fold vs Control | p-value |
|-----------|-------------|-----------------|---------|
| Vehicle control | 12.3 ± 2.1 | 1.0 | — |
| Extract 10 μg/mL | 14.1 ± 3.2 | 1.15 | 0.42 |
| Extract 50 μg/mL | 13.8 ± 2.8 | 1.12 | 0.51 |
| Extract 100 μg/mL | 15.2 ± 3.5 | 1.24 | 0.28 |
| Extract 250 μg/mL | 11.9 ± 4.1 | 0.97 | 0.89 |
| Positive control (NGF) | 485.2 ± 28.4 | 39.4 | <0.001 |

### Cell Viability (MTT)

| Condition | Viability (% control) |
|-----------|----------------------|
| Extract 10 μg/mL | 98.2 ± 4.1 |
| Extract 50 μg/mL | 95.7 ± 5.3 |
| Extract 100 μg/mL | 94.1 ± 4.8 |
| Extract 250 μg/mL | 91.3 ± 6.2 |

## The Verdict

**Hypothesis rejected.**

No concentration showed statistically significant NGF induction (all p > 0.05). The highest fold-change observed was 1.24x, well below the 2x threshold. Cell viability was fine, so this isn't a toxicity artifact.

The positive control worked perfectly (39x induction), confirming the assay itself was functional.

## What David Learned

### 1. The Supplement May Not Contain Active Compounds

Lion's Mane's purported activity comes from compounds called hericenones and erinacines. These require specific extraction methods. A commercial supplement might:
- Use cultivation methods that don't produce these compounds
- Use mycelium-on-grain (mostly starch) rather than fruiting bodies
- Undergo processing that degrades active compounds

David's hot water extract might not have contained the relevant molecules.

### 2. The Claim May Be Overstated

Even studies showing Lion's Mane activity often use:
- Purified compounds, not crude extracts
- Higher concentrations
- Different cell types
- Direct NGF measurement rather than induction

The marketing claim that a 500mg capsule "supports NGF" is several steps removed from controlled research.

### 3. Negative Results Are Data

David didn't get the result he hoped for, but he got an answer: his specific supplement, tested in a standard assay, doesn't show detectable NGF induction.

This is exactly what science is supposed to do—test claims and accept the results.

## Was It Worth $400?

David's take:

> "I've probably spent more than $400 on Lion's Mane supplements over the years based on vague promises. Now I know that at least this brand, in this assay, doesn't do what the marketing implies. That's worth knowing.
> 
> I could buy a different brand that claims to use fruiting bodies and specific extraction methods. Or I could accept that the evidence isn't there and spend my money elsewhere.
> 
> Either way, I made a decision based on data instead of marketing."

## Follow-Up Options

David considered several follow-ups but decided not to pursue them immediately:

1. **Test a "premium" Lion's Mane extract** that claims standardized hericenone content
2. **Different assay**: Test for neurite outgrowth in PC12 cells (functional readout rather than NGF secretion)
3. **Different cell type**: Some studies use astrocytes, which might respond differently

He bookmarked these for later if he decides to dig deeper.

## Why Open Results Matter

David published his results as open access. Now when someone searches "Lion's Mane NGF Brand X," they'll find actual data rather than just marketing claims.

Three months after publication, his results page had:
- 847 views
- 12 saves
- 3 citations in forum discussions

Someone else running a similar experiment could see his protocol and results, learn from his approach, and perhaps test different conditions.

## Lessons for Other Citizen Scientists

1. **Negative results are still results**: Rejecting a hypothesis is a valid scientific outcome. Don't only publish when you find what you hoped for.

2. **Test what you actually use**: Studies on purified compounds don't tell you about your specific supplement.

3. **Pre-register your criteria**: David defined "success" as ≥2x induction before seeing data. This prevented him from retroactively deciding that 1.24x was "promising."

4. **Consider what you'll do with each outcome**: Before submitting, think through: "If positive, then what? If negative, then what?" David had a plan for both.

5. **Share openly**: Your negative result might save someone else $400 and months of false hope.

---

*Experiment ID: exp_lions_mane_ngf_2026*  
*Results publicly available at: litmus.science/results/exp_lions_mane_ngf_2026*  
*Status: Hypothesis rejected*

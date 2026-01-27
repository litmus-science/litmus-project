# Tutorial 1: From Question to Testable Hypothesis

This tutorial walks you through the most important part of any experiment: turning a vague question into something you can actually test.

## The Problem with Vague Questions

Most people start with questions like:

- "Does caffeine affect memory?"
- "Is this compound antibacterial?"
- "Will changing the pH make the reaction faster?"

These are fine starting points, but they're not testable as written. A testable hypothesis needs to be **specific**, **measurable**, and **falsifiable**.

## Step 1: Make It Specific

Let's take "Does caffeine affect memory?" and make it specific.

**Ask yourself:**
- What kind of memory? (short-term, long-term, working memory, recall, recognition)
- What organism? (humans, mice, cells, in vitro)
- How much caffeine? (concentration, dose)
- Affect how? (improve, impair, no change)
- Over what timeframe?

A more specific version: "Does 100μM caffeine improve short-term memory consolidation in hippocampal neuron cultures over 24 hours?"

Now we know exactly what we're testing.

## Step 2: Define Your Variables

Every experiment has three types of variables:

### Independent Variable (What You Change)
This is what you manipulate. In our caffeine example: caffeine concentration.

You need to define:
- The values you'll test (e.g., 0μM, 10μM, 50μM, 100μM, 500μM)
- Which is your control (usually 0 or vehicle-only)

### Dependent Variable (What You Measure)
This is your outcome. For memory consolidation, you might measure:
- Long-term potentiation (LTP) magnitude
- Synaptic protein expression levels
- Dendritic spine density

You need to define:
- Exactly what you're measuring
- How you'll measure it (the assay or instrument)
- The units

### Controlled Variables (What You Hold Constant)
Everything else that could affect your results:
- Temperature (37°C)
- CO2 levels (5%)
- Culture medium composition
- Cell passage number
- Time of treatment

## Step 3: State Your Hypothesis and Null Hypothesis

A hypothesis is a prediction you can test. The null hypothesis is what you'd expect if your prediction is wrong.

**Hypothesis:** "Treatment with 100μM caffeine increases LTP magnitude in hippocampal neuron cultures by at least 25% compared to vehicle control after 24 hours."

**Null Hypothesis:** "Treatment with 100μM caffeine has no significant effect on LTP magnitude in hippocampal neuron cultures compared to vehicle control."

Notice:
- The hypothesis includes a specific threshold (25%)
- Both are testable with the same experiment
- The null hypothesis is what statistics actually test against

## Step 4: Define Success and Failure

Before you run the experiment, decide what results would:

**Support your hypothesis:**
- LTP magnitude ≥25% higher than control
- p-value < 0.05
- Effect observed in at least 2 of 3 biological replicates

**Reject your hypothesis:**
- LTP magnitude <25% higher than control, OR
- p-value ≥ 0.05, OR
- Effect not reproducible across replicates

**Be inconclusive:**
- High variability making statistical comparison impossible
- Technical failures (contamination, equipment malfunction)

This prevents you from moving the goalposts after seeing the data.

## Putting It Together: The Litmus Format

Here's how this hypothesis looks in the Litmus submission format:

```json
{
  "hypothesis": {
    "statement": "Treatment with 100μM caffeine increases LTP magnitude in hippocampal neuron cultures by at least 25% compared to vehicle control after 24 hours of exposure.",
    "null_hypothesis": "Treatment with 100μM caffeine has no significant effect on LTP magnitude in hippocampal neuron cultures compared to vehicle control after 24 hours.",
    "rationale": "Caffeine is an adenosine receptor antagonist. Adenosine typically inhibits synaptic transmission, so blocking it may enhance LTP. Previous studies have shown acute effects, but chronic exposure effects on LTP are understudied.",
    "variables": {
      "independent": [
        {
          "name": "Caffeine concentration",
          "description": "Concentration of caffeine in culture medium",
          "values": [
            { "value": 0, "unit": "μM", "is_control": true },
            { "value": 10, "unit": "μM" },
            { "value": 50, "unit": "μM" },
            { "value": 100, "unit": "μM" },
            { "value": 500, "unit": "μM" }
          ]
        }
      ],
      "dependent": [
        {
          "name": "LTP magnitude",
          "description": "Percentage increase in field excitatory postsynaptic potential (fEPSP) slope 60 minutes post-tetanus relative to baseline",
          "measurement_method": "Multi-electrode array recording with tetanic stimulation protocol",
          "unit": "% of baseline",
          "expected_range": { "min": 100, "max": 300 }
        }
      ],
      "controlled": [
        { "name": "Temperature", "held_at": "37°C", "tolerance": "±0.5°C" },
        { "name": "CO2", "held_at": "5%", "tolerance": "±0.1%" },
        { "name": "Culture age", "held_at": "DIV 14-16" },
        { "name": "Cell density", "held_at": "500,000 cells/well", "tolerance": "±10%" }
      ]
    },
    "prior_work": [
      {
        "type": "doi",
        "identifier": "10.1234/example.2023.001",
        "relevance": "Showed acute caffeine enhances LTP in slice preparations"
      }
    ]
  }
}
```

## Common Mistakes to Avoid

### 1. Hypothesis Too Vague
❌ "Caffeine affects neurons"
✅ "100μM caffeine increases LTP magnitude by ≥25% in hippocampal cultures"

### 2. No Clear Threshold
❌ "Caffeine increases LTP"
✅ "Caffeine increases LTP by at least 25%"

Without a threshold, you can't distinguish a real effect from noise.

### 3. Untestable with Available Methods
❌ "Caffeine improves human memory" (can't test in Litmus—requires human subjects)
✅ "Caffeine enhances LTP in neuron cultures" (testable with BSL-1 methods)

### 4. Missing Controls
Every experiment needs a control group. If you're testing caffeine, you need a 0μM (or vehicle-only) condition.

### 5. Confusing Correlation with Causation
Your hypothesis should be about whether X *causes* Y, not just whether they're associated. The experiment design (manipulating X, measuring Y) establishes causation.

## Exercise: Fix These Hypotheses

Try converting these vague questions into testable hypotheses:

1. "Is green tea extract good for cells?"
2. "Does temperature matter for enzyme activity?"
3. "Can bacteria grow in salt water?"

(Answers in the next tutorial)

## Next Steps

Once you have a solid hypothesis, you need a protocol to test it. Tutorial 2 covers how to select or design a protocol that will actually answer your question.

---

## Quick Reference: Hypothesis Checklist

- [ ] Specific prediction (not just "affects" or "changes")
- [ ] Quantitative threshold when possible
- [ ] Clear independent variable with defined values
- [ ] Clear dependent variable with measurement method
- [ ] Controlled variables identified
- [ ] Null hypothesis stated
- [ ] Testable with BSL-1 or BSL-2 methods
- [ ] Success criteria defined before experiment runs

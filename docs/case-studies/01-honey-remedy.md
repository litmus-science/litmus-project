# Case Study: Testing Grandma's Honey Remedy

**User Profile**: Sarah, retired teacher, no formal science background  
**Budget**: $200  
**Outcome**: Hypothesis partially supported

---

## The Question

Sarah's grandmother always claimed that local honey helped with seasonal allergies. Sarah had been taking a tablespoon of local honey daily for years and felt it helped, but she wanted to know: is this real, or placebo?

She couldn't test this in humans through Litmus (human subjects aren't allowed), but she could test a related, more fundamental question.

## Refining the Hypothesis

Sarah started with: "Does local honey help with allergies?"

Working through the Litmus tutorial, she refined this to something testable:

**Final hypothesis**: "Raw local honey contains measurable pollen content (>1000 pollen grains per gram), and this pollen retains allergenic protein activity as measured by IgE binding capacity."

**Rationale**: The folk theory is that consuming local pollen builds tolerance. For this to even be plausible, the honey must contain pollen, and that pollen must retain its allergenic properties after being in honey.

## The Submission

```json
{
  "metadata": {
    "submitter_type": "human",
    "tags": ["honey", "pollen", "allergen", "citizen-science"]
  },
  "hypothesis": {
    "statement": "Raw local honey contains >1000 pollen grains per gram, and pollen proteins retain IgE binding activity after 6 months of storage in honey",
    "null_hypothesis": "Raw local honey contains <1000 pollen grains per gram OR pollen proteins lose IgE binding activity during storage in honey",
    "rationale": "Folk remedy claims local honey consumption reduces allergy symptoms. If true, honey must contain allergenic pollen. Testing whether pollen survives in honey and retains activity.",
    "variables": {
      "independent": [
        {
          "name": "Honey sample",
          "values": [
            { "value": "Local raw honey", "is_control": false },
            { "value": "Commercial filtered honey", "is_control": true }
          ]
        }
      ],
      "dependent": [
        {
          "name": "Pollen grain count",
          "measurement_method": "Microscopic examination of honey sediment after dilution",
          "unit": "grains per gram"
        },
        {
          "name": "IgE binding activity",
          "measurement_method": "ELISA using pooled allergic serum",
          "unit": "relative binding units"
        }
      ],
      "controlled": [
        { "name": "Sample volume", "held_at": "50g per analysis" },
        { "name": "Storage conditions", "held_at": "Room temperature, dark, 6 months minimum age" }
      ]
    }
  },
  "protocol": {
    "type": "protocol_design_requested",
    "protocol_design_brief": "I need to (1) count pollen grains in honey samples and identify pollen types if possible, and (2) test whether proteins extracted from honey can bind IgE antibodies, indicating retained allergenicity. I have two honey samples: one raw local honey from a farmer's market (at least 6 months old) and one commercial filtered honey as a negative control. I'm providing both samples. Budget is ~$200, willing to go to $250 if needed.",
    "materials": [
      {
        "name": "Local raw honey",
        "specification": "From [County] Farmer's Market, purchased 6 months ago",
        "quantity": { "value": 100, "unit": "g" },
        "provided_by_requester": true
      },
      {
        "name": "Commercial filtered honey",
        "specification": "Store brand, 'ultra-filtered'",
        "quantity": { "value": 100, "unit": "g" },
        "provided_by_requester": true
      }
    ]
  },
  "acceptance_criteria": {
    "success_conditions": [
      {
        "metric": "Pollen count in local honey",
        "operator": "gte",
        "threshold": 1000,
        "unit": "grains per gram"
      },
      {
        "metric": "IgE binding (local vs filtered)",
        "operator": "gte",
        "threshold": 2,
        "unit": "fold difference",
        "description": "Local honey must show at least 2x more IgE binding than filtered control"
      }
    ],
    "failure_conditions": [
      {
        "condition": "Pollen count in local honey < 100 grains/gram",
        "interpretation": "Local honey does not contain significant pollen"
      },
      {
        "condition": "No difference in IgE binding between samples",
        "interpretation": "Even if pollen present, it has lost allergenicity"
      }
    ]
  },
  "constraints": {
    "budget_max_usd": 250,
    "budget_flexibility": "flexible_10",
    "turnaround_days": 30,
    "bsl_level": "BSL-1",
    "privacy": "open"
  }
}
```

## Protocol Designed by Litmus

Within 48 hours, Sarah received a proposed protocol:

**Part 1: Pollen Count**
1. Dissolve 10g honey in warm distilled water
2. Centrifuge to pellet pollen
3. Resuspend in known volume
4. Count pollen grains using hemocytometer under microscope
5. Identify major pollen types using reference images
6. Calculate grains per gram

**Part 2: IgE Binding ELISA**
1. Extract proteins from honey samples using centrifugation and dialysis
2. Coat ELISA plates with honey protein extracts
3. Add pooled human serum with known IgE reactivity to common allergens (commercially available)
4. Detect bound IgE with anti-human IgE-HRP conjugate
5. Compare binding between local and filtered honey extracts

**Estimated cost**: $185  
**Estimated time**: 2 weeks

Sarah approved the protocol.

## Results

The operator delivered results in 11 days:

### Pollen Count
| Sample | Pollen grains/gram | Major types identified |
|--------|-------------------|----------------------|
| Local raw honey | 4,250 ± 380 | Clover (45%), wildflower mix (35%), tree pollen (20%) |
| Commercial filtered | 12 ± 5 | Trace, unidentifiable |

### IgE Binding (Relative Units)
| Sample | IgE Binding | Fold vs. Control |
|--------|------------|-----------------|
| Local raw honey | 0.85 ± 0.12 | 8.5x |
| Commercial filtered | 0.10 ± 0.03 | 1.0x (baseline) |
| Positive control (pollen extract) | 2.10 ± 0.18 | 21x |

## Interpretation

**Hypothesis partially supported:**

✅ Local raw honey contains abundant pollen (4,250 grains/gram >> 1,000 threshold)

✅ Pollen proteins retain IgE binding activity (8.5x higher than filtered honey)

The operator noted: "Local honey shows clear IgE binding activity, approximately 40% of the signal from pure pollen extract. This suggests pollen proteins survive in honey but may be partially degraded or present at lower concentrations than in raw pollen."

## Sarah's Conclusion

The experiment confirmed that local raw honey does contain significant pollen and that this pollen retains allergenicity. This doesn't prove the folk remedy works (that would require human trials), but it establishes biological plausibility: the proposed mechanism (pollen exposure) is at least possible.

Sarah shared her results on a citizen science forum and is now considering a follow-up experiment testing whether the pollen content varies by season.

## Cost Breakdown

| Item | Cost |
|------|------|
| Materials (ELISA reagents, lab supplies) | $95 |
| Operator labor (6 hours) | $60 |
| Equipment access | $15 |
| Platform fee | $15 |
| **Total** | **$185** |

## Lessons Learned

1. **Start with what's testable**: Sarah couldn't test human health effects, but she could test the underlying mechanism.

2. **Protocol design assistance works**: Sarah had no idea how to count pollen or run an ELISA. The protocol design service bridged that gap.

3. **Controls matter**: The commercial filtered honey was essential—without it, there'd be no baseline for comparison.

4. **Open results benefit everyone**: Sarah's public results now appear in searches for "honey pollen allergenicity," helping others with similar questions.

---

*Experiment ID: exp_h0n3y-p0ll3n-2026*  
*Results publicly available at: litmus.science/results/exp_h0n3y-p0ll3n-2026*

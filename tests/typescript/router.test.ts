/**
 * Tests for the Litmus routing logic (TypeScript version).
 *
 * These tests validate:
 * 1. Hard filter logic (experiment type, BSL, materials, shipping, deliverables)
 * 2. Weighted scoring algorithm
 * 3. Spec completeness calculation
 * 4. End-to-end routing with example data
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  routeIntake,
  applyHardFilters,
  checkDeliverablesGaps,
  computeSpecCompleteness,
  validateIntake,
  FilterReason,
  DEFAULT_WEIGHTS,
  type Intake,
  type LabProfile,
  type RoutingWeights,
} from '../../router/router';

// ============================================================================
// Test Helpers
// ============================================================================

const examplesDir = join(__dirname, '..', '..', 'examples');

function loadExample<T>(filename: string): T {
  const path = join(examplesDir, filename);
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

// ============================================================================
// Fixtures
// ============================================================================

let sampleIntake: Intake;
let micIntake: Intake;
let individualLab: LabProfile;
let commercialLab: LabProfile;

beforeAll(() => {
  sampleIntake = loadExample<Intake>('intake_cell_viability.json');
  micIntake = loadExample<Intake>('intake_mic_assay.json');
  individualLab = loadExample<LabProfile>('lab_profile_individual.json');
  commercialLab = loadExample<LabProfile>('lab_profile_commercial.json');
});

function createMinimalIntake(): Intake {
  return {
    experiment_type: 'CELL_VIABILITY_IC50',
    title: 'Minimal test intake',
    hypothesis: {
      statement: 'Test compound affects cell viability',
    },
    compliance: {
      bsl: 'BSL1',
    },
    turnaround_budget: {
      budget_max_usd: 300,
    },
    deliverables: {
      minimum_package_level: 'L1_BASIC_QC',
    },
  };
}

// ============================================================================
// Hard Filter Tests
// ============================================================================

describe('Hard Filters', () => {
  it('should pass labs supporting experiment type', () => {
    const reasons = applyHardFilters(sampleIntake, commercialLab, {});
    expect(reasons).not.toContain(FilterReason.EXPERIMENT_TYPE_NOT_SUPPORTED);
  });

  it('should fail labs not supporting experiment type', () => {
    const reasons = applyHardFilters(sampleIntake, individualLab, {});
    expect(reasons).toContain(FilterReason.EXPERIMENT_TYPE_NOT_SUPPORTED);
  });

  it('should pass labs with sufficient BSL level', () => {
    const bsl2Intake: Intake = {
      ...createMinimalIntake(),
      compliance: { bsl: 'BSL2' },
    };
    const reasons = applyHardFilters(bsl2Intake, commercialLab, {});
    expect(reasons).not.toContain(FilterReason.BSL_EXCEEDED);
  });

  it('should fail when BSL level exceeded', () => {
    const bsl2Intake: Intake = {
      ...createMinimalIntake(),
      compliance: { bsl: 'BSL2' },
    };
    const bsl1Lab: LabProfile = {
      ...individualLab,
      compliance: { max_bsl: 'BSL1' },
    };
    const reasons = applyHardFilters(bsl2Intake, bsl1Lab, {});
    expect(reasons).toContain(FilterReason.BSL_EXCEEDED);
  });

  it('should fail when human samples not approved', () => {
    const humanIntake: Intake = {
      ...createMinimalIntake(),
      compliance: { bsl: 'BSL1', human_derived_material: true },
    };
    const reasons = applyHardFilters(humanIntake, individualLab, {});
    expect(reasons).toContain(FilterReason.HUMAN_SAMPLES_NOT_APPROVED);
  });

  it('should fail when animal samples not approved', () => {
    const animalIntake: Intake = {
      ...createMinimalIntake(),
      compliance: { bsl: 'BSL1', animal_derived_material: true },
    };
    const reasons = applyHardFilters(animalIntake, individualLab, {});
    expect(reasons).toContain(FilterReason.ANIMAL_SAMPLES_NOT_APPROVED);
  });

  it('should pass when hazardous chemicals approved', () => {
    const reasons = applyHardFilters(sampleIntake, commercialLab, {});
    expect(reasons).not.toContain(FilterReason.HAZMAT_NOT_APPROVED);
  });

  it('should pass labs accepting required shipping mode', () => {
    const reasons = applyHardFilters(sampleIntake, commercialLab, {
      requiredShippingMode: 'DRY_ICE',
    });
    expect(reasons).not.toContain(FilterReason.SHIPPING_MODE_NOT_SUPPORTED);
  });

  it('should fail labs not accepting required shipping mode', () => {
    const reasons = applyHardFilters(sampleIntake, individualLab, {
      requiredShippingMode: 'DRY_ICE',
    });
    expect(reasons).toContain(FilterReason.SHIPPING_MODE_NOT_SUPPORTED);
  });

  it('should filter unavailable labs', () => {
    const unavailableLab: LabProfile = {
      ...commercialLab,
      availability: { current_capacity: 'none' },
    };
    const reasons = applyHardFilters(sampleIntake, unavailableLab, {});
    expect(reasons).toContain(FilterReason.LAB_UNAVAILABLE);
  });

  it('should filter inactive labs', () => {
    const inactiveLab: LabProfile = {
      ...commercialLab,
      status: 'paused',
    };
    const reasons = applyHardFilters(sampleIntake, inactiveLab, {});
    expect(reasons).toContain(FilterReason.LAB_UNAVAILABLE);
  });

  it('should filter in strict deliverables mode when requirements not met', () => {
    const intake: Intake = {
      ...sampleIntake,
      deliverables: {
        ...sampleIntake.deliverables,
        raw_data_formats: ['FASTQ'],
      },
    };
    const reasons = applyHardFilters(intake, commercialLab, { strictDeliverables: true });
    expect(reasons).toContain(FilterReason.DELIVERABLES_NOT_SUPPORTED);
  });
});

// ============================================================================
// Deliverables Gap Tests
// ============================================================================

describe('Deliverables Gaps', () => {
  it('should report no gaps when all supported', () => {
    const gaps = checkDeliverablesGaps(sampleIntake, commercialLab);
    expect(gaps).toHaveLength(0);
  });

  it('should report gap for missing raw format', () => {
    const intake: Intake = {
      ...sampleIntake,
      deliverables: {
        ...sampleIntake.deliverables,
        raw_data_formats: ['FASTQ'],
      },
    };
    const gaps = checkDeliverablesGaps(intake, commercialLab);
    expect(gaps).toContain('raw_format:FASTQ');
  });

  it('should report gap for missing processed output', () => {
    const intake: Intake = {
      ...createMinimalIntake(),
      experiment_type: 'MIC_MBC_ASSAY',
      deliverables: {
        minimum_package_level: 'L1_BASIC_QC',
        required_processed_outputs: ['SOME_UNSUPPORTED_OUTPUT'],
      },
    };
    const gaps = checkDeliverablesGaps(intake, individualLab);
    expect(gaps.some(g => g.includes('processed_output:'))).toBe(true);
  });
});

// ============================================================================
// Spec Completeness Tests
// ============================================================================

describe('Spec Completeness', () => {
  it('should score complete intake high (> 0.7)', () => {
    const completeness = computeSpecCompleteness(sampleIntake);
    expect(completeness).toBeGreaterThan(0.7);
  });

  it('should score minimal intake lower than complete one', () => {
    const completeScore = computeSpecCompleteness(sampleIntake);
    const minimalScore = computeSpecCompleteness(createMinimalIntake());
    expect(minimalScore).toBeLessThan(completeScore);
  });

  it('should return score between 0 and 1', () => {
    const score1 = computeSpecCompleteness(sampleIntake);
    const score2 = computeSpecCompleteness(createMinimalIntake());
    expect(score1).toBeGreaterThanOrEqual(0);
    expect(score1).toBeLessThanOrEqual(1);
    expect(score2).toBeGreaterThanOrEqual(0);
    expect(score2).toBeLessThanOrEqual(1);
  });

  it('should score empty intake very low', () => {
    const score = computeSpecCompleteness({} as Intake);
    expect(score).toBeLessThan(0.3);
  });

  it('should increase score with acceptance criteria', () => {
    const minimal = createMinimalIntake();
    const withoutCriteria = computeSpecCompleteness(minimal);

    const withCriteria: Intake = {
      ...minimal,
      acceptance_criteria: {
        success_conditions: [
          { metric: 'IC50', operator: 'lte', threshold: 10 },
        ],
      },
    };
    const withCriteriaScore = computeSpecCompleteness(withCriteria);

    expect(withCriteriaScore).toBeGreaterThan(withoutCriteria);
  });
});

// ============================================================================
// Scoring Tests
// ============================================================================

describe('Scoring', () => {
  it('should have default weights that sum to approximately 1.0', () => {
    const w = DEFAULT_WEIGHTS;
    const total = w.menuFit + w.turnaroundFit + w.specCompleteness +
                  w.costFit + w.quality + w.logistics + w.deliverablesMatch;
    expect(total).toBeGreaterThanOrEqual(0.95);
    expect(total).toBeLessThanOrEqual(1.05);
  });

  it('should produce scores in valid range', () => {
    const result = routeIntake(sampleIntake, [commercialLab]);
    expect(result.top_matches[0].score).toBeGreaterThanOrEqual(0);
    expect(result.top_matches[0].score).toBeLessThanOrEqual(1.5);
  });

  it('should have non-negative score components', () => {
    const result = routeIntake(sampleIntake, [commercialLab]);
    const breakdown = result.top_matches[0].score_breakdown;
    for (const [key, value] of Object.entries(breakdown)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('should score good lab reasonably high', () => {
    const result = routeIntake(sampleIntake, [commercialLab]);
    expect(result.top_matches[0].score).toBeGreaterThan(0.5);
  });
});

// ============================================================================
// End-to-End Routing Tests
// ============================================================================

describe('Route Intake', () => {
  it('should return matches sorted by score descending', () => {
    const lowerLab: LabProfile = {
      ...commercialLab,
      lab_id: 'lab_lower',
      name: 'Lower Quality Lab',
      quality_metrics: {
        ...commercialLab.quality_metrics,
        average_rating: 3.5,
      },
    };

    const result = routeIntake(sampleIntake, [lowerLab, commercialLab]);

    if (result.top_matches.length >= 2) {
      expect(result.top_matches[0].score).toBeGreaterThanOrEqual(result.top_matches[1].score);
    }
  });

  it('should filter incompatible labs', () => {
    const result = routeIntake(sampleIntake, [individualLab, commercialLab]);

    const matchIds = result.top_matches.map(m => m.lab_id);
    expect(matchIds).not.toContain(individualLab.lab_id);
    expect(result.filtered_out[individualLab.lab_id]).toBeDefined();
  });

  it('should include filter reasons', () => {
    const result = routeIntake(sampleIntake, [individualLab]);

    expect(result.filtered_out[individualLab.lab_id]).toContain('experiment_type_not_supported');
  });

  it('should respect top_k parameter', () => {
    const labs: LabProfile[] = [];
    for (let i = 0; i < 5; i++) {
      labs.push({
        ...commercialLab,
        lab_id: `lab_${i}`,
        name: `Lab ${i}`,
      });
    }

    const result = routeIntake(sampleIntake, labs, { topK: 3 });
    expect(result.top_matches.length).toBeLessThanOrEqual(3);
  });

  it('should route MIC intake to individual lab', () => {
    const result = routeIntake(micIntake, [individualLab]);

    expect(result.all_matches_count).toBe(1);
    expect(result.top_matches[0].lab_id).toBe(individualLab.lab_id);
  });

  it('should include pricing info in matches', () => {
    const result = routeIntake(micIntake, [individualLab]);
    const match = result.top_matches[0];

    expect(match.pricing_band_usd).toBeDefined();
    expect(match.pricing_band_usd?.min).toBeDefined();
    expect(match.pricing_band_usd?.max).toBeDefined();
  });

  it('should include TAT info in matches', () => {
    const result = routeIntake(micIntake, [individualLab]);
    const match = result.top_matches[0];

    expect(match.estimated_tat_days).toBeDefined();
  });

  it('should apply strict deliverables filter', () => {
    const intake: Intake = {
      ...sampleIntake,
      deliverables: {
        ...sampleIntake.deliverables,
        raw_data_formats: ['FASTQ'],
      },
    };

    const result = routeIntake(intake, [commercialLab], { strictDeliverables: true });
    expect(result.all_matches_count).toBe(0);
  });

  it('should apply region preference bonus', () => {
    const resultNoPref = routeIntake(sampleIntake, [commercialLab]);
    const resultWithPref = routeIntake(sampleIntake, [commercialLab], { regionPreference: 'US' });

    expect(resultWithPref.top_matches[0].score).toBeGreaterThan(resultNoPref.top_matches[0].score);
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('Validation', () => {
  it('should pass valid intake', () => {
    const result = validateIntake(sampleIntake);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail missing required fields', () => {
    const incomplete = {
      experiment_type: 'CELL_VIABILITY_IC50' as const,
      title: 'Missing fields',
    };
    const result = validateIntake(incomplete);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should fail missing hypothesis statement', () => {
    const intake = {
      experiment_type: 'CELL_VIABILITY_IC50' as const,
      title: 'Test',
      hypothesis: {} as Intake['hypothesis'],
      compliance: { bsl: 'BSL1' as const },
      deliverables: { minimum_package_level: 'L1_BASIC_QC' as const },
      turnaround_budget: { budget_max_usd: 500 },
    };
    const result = validateIntake(intake);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('hypothesis'))).toBe(true);
  });

  it('should fail missing budget', () => {
    const intake = {
      experiment_type: 'CELL_VIABILITY_IC50' as const,
      title: 'Test',
      hypothesis: { statement: 'Test statement' },
      compliance: { bsl: 'BSL1' as const },
      deliverables: { minimum_package_level: 'L1_BASIC_QC' as const },
      turnaround_budget: {},
    };
    const result = validateIntake(intake);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('budget'))).toBe(true);
  });

  it('should warn on missing null hypothesis', () => {
    const result = validateIntake(createMinimalIntake());
    expect(result.warnings.some(w => w.path.includes('null_hypothesis'))).toBe(true);
  });

  it('should warn on low completeness', () => {
    // Use an incomplete intake missing required fields - this will have errors
    // but should also generate a completeness warning since score < 50%
    const incompleteIntake = {
      experiment_type: 'CELL_VIABILITY_IC50' as const,
      title: 'Test',
      // Missing many required fields, so completeness will be low
    };
    const result = validateIntake(incompleteIntake);
    // Should be invalid due to missing required fields
    expect(result.valid).toBe(false);
    // Should also warn about low completeness
    expect(result.warnings.some(w => w.message.toLowerCase().includes('completeness'))).toBe(true);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty labs list', () => {
    const result = routeIntake(sampleIntake, []);
    expect(result.top_matches).toHaveLength(0);
    expect(result.all_matches_count).toBe(0);
  });

  it('should handle all labs filtered', () => {
    const result = routeIntake(sampleIntake, [individualLab]);
    expect(result.all_matches_count).toBe(0);
    expect(Object.keys(result.filtered_out)).toHaveLength(1);
  });

  it('should handle labs with missing optional fields', () => {
    const sparseLab: LabProfile = {
      lab_id: 'sparse_lab',
      name: 'Sparse Lab',
      status: 'active',
      capabilities: {
        experiment_types: ['MIC_MBC_ASSAY'],
      },
      compliance: {
        max_bsl: 'BSL2',
      },
    };

    const result = routeIntake(micIntake, [sparseLab]);
    expect(result.all_matches_count).toBe(1);
    expect(result.top_matches[0].score).toBeGreaterThan(0);
  });
});

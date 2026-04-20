#!/usr/bin/env python3
"""Seed the local dev DB with a realistic demo portfolio of experiments."""

import json
import sqlite3
import uuid
from datetime import datetime, timedelta

DB_PATH = "/Users/arunnijhawan/Documents/Litmus/litmus-project/litmus.db"
USER_ID = "dev-user"

now = datetime.utcnow()
def ago(days: int, hours: int = 0) -> str:
    return (now - timedelta(days=days, hours=hours)).isoformat()

def new_id() -> str:
    return str(uuid.uuid4())

EXPERIMENTS = [
    # ─── Program 1: GAL-5 Series ────────────────────────────────────────────
    {
        "id": new_id(),
        "status": "COMPLETED",
        "payment_status": "RELEASED",
        "created_at": ago(28),
        "updated_at": ago(8),
        "completed_at": ago(8),
        "experiment_type": "enzyme_inhibition",
        "estimated_cost_usd": 1200.0,
        "specification": {
            "program": "GAL-5 Series",
            "compound_series": "Galantamine analogs",
            "therapeutic_area": "Neurodegeneration / Alzheimer's",
            "experiment_type": "enzyme_inhibition",
            "title": "AChE inhibition IC₅₀ — GAL-5 vs galantamine",
            "hypothesis": {
                "statement": "GAL-5 inhibits recombinant human AChE with IC50 < 1 µM, at least 2-fold more potently than parent compound galantamine",
                "null_hypothesis": "GAL-5 shows no significant improvement over galantamine (IC50 ≥ 0.91 µM)",
            },
            "compliance": {"bsl_level": "BSL1"},
            "turnaround_budget": {"budget_max_usd": 1500, "target_tat_days": 10},
            "deliverables": {"minimum_package_level": "standard"},
            "metadata": {
                "notes": "Ellman assay, 0.5 mM acetylthiocholine substrate. 8-point dose-response 0.001–100 µM. Include galantamine and donepezil reference inhibitors. n=3 replicates."
            },
        },
        "result": {
            "hypothesis_supported": True,
            "confidence_level": "high",
            "summary": (
                "GAL-5 demonstrated potent AChE inhibition with IC50 = 0.43 µM, "
                "representing a 2.1-fold improvement over galantamine (IC50 = 0.91 µM). "
                "The primary endpoint of IC50 < 1 µM was met with high confidence (n=3). "
                "Donepezil positive control returned IC50 = 0.024 µM, within 2× historical range."
            ),
            "structured_data": {
                "measurements": [
                    {"metric": "IC50 (AChE)", "value": 0.43, "unit": "µM", "condition": "GAL-5"},
                    {"metric": "IC50 (AChE)", "value": 0.91, "unit": "µM", "condition": "Galantamine (ref)"},
                    {"metric": "IC50 (AChE)", "value": 0.024, "unit": "µM", "condition": "Donepezil (+ctrl)"},
                    {"metric": "Hill coefficient", "value": 1.12, "unit": "", "condition": "GAL-5"},
                    {"metric": "R²", "value": 0.994, "unit": "", "condition": "4PL fit, GAL-5"},
                    {"metric": "Emax", "value": 98.3, "unit": "%", "condition": "GAL-5"},
                ],
                "statistics": {
                    "test_used": "4-parameter logistic (4PL) nonlinear regression",
                    "p_value": 0.0008,
                    "effect_size": 2.1,
                },
            },
            "raw_data_files": [
                {"name": "GAL5-AChE-fluorescence-raw.xlsx", "format": "XLSX", "url": "#"},
                {"name": "GAL5-AChE-4PL-curves.pdf", "format": "PDF", "url": "#"},
            ],
            "notes": "Assay performed at 37°C, pH 8.0. All controls within specification. Curves fit with Prism 10.",
            "is_approved": True,
            "rating": 5,
        },
    },
    {
        "id": new_id(),
        "status": "IN_PROGRESS",
        "payment_status": "ESCROWED",
        "created_at": ago(14),
        "updated_at": ago(2),
        "experiment_type": "enzyme_inhibition",
        "estimated_cost_usd": 1800.0,
        "specification": {
            "program": "GAL-5 Series",
            "compound_series": "Galantamine analogs",
            "therapeutic_area": "Neurodegeneration / Alzheimer's",
            "experiment_type": "enzyme_inhibition",
            "title": "BuChE selectivity counterscreen — GAL-5",
            "hypothesis": {
                "statement": "GAL-5 shows > 10-fold selectivity for AChE over BuChE (BuChE IC50 > 4.3 µM)",
                "null_hypothesis": "GAL-5 inhibits BuChE with comparable potency to AChE",
            },
            "compliance": {"bsl_level": "BSL1"},
            "turnaround_budget": {"budget_max_usd": 2000, "target_tat_days": 12},
            "deliverables": {"minimum_package_level": "standard"},
            "metadata": {"notes": "Equine BuChE, butyrylthiocholine substrate. Same dose-response format as AChE assay."},
        },
    },
    {
        "id": new_id(),
        "status": "OPEN",
        "payment_status": "ESCROWED",
        "created_at": ago(10),
        "updated_at": ago(5),
        "experiment_type": "cell_viability",
        "estimated_cost_usd": 950.0,
        "specification": {
            "program": "GAL-5 Series",
            "compound_series": "Galantamine analogs",
            "therapeutic_area": "Neurodegeneration / Alzheimer's",
            "experiment_type": "cell_viability",
            "title": "Neuronal cytotoxicity — GAL-5 in SH-SY5Y (48h)",
            "hypothesis": {
                "statement": "GAL-5 shows no significant cytotoxicity in SH-SY5Y neuroblastoma cells at therapeutic concentrations (CC50 > 50 µM)",
                "null_hypothesis": "GAL-5 exhibits cytotoxicity with CC50 ≤ 10 µM in neuronal cells",
            },
            "compliance": {"bsl_level": "BSL1"},
            "turnaround_budget": {"budget_max_usd": 1200, "target_tat_days": 10},
            "deliverables": {"minimum_package_level": "standard"},
            "metadata": {"notes": "MTT assay, 48h exposure, serum-free medium. Include staurosporine as positive control."},
        },
    },
    {
        "id": new_id(),
        "status": "PENDING_REVIEW",
        "payment_status": "PENDING",
        "created_at": ago(3),
        "updated_at": ago(3),
        "experiment_type": "custom",
        "estimated_cost_usd": 2400.0,
        "specification": {
            "program": "GAL-5 Series",
            "compound_series": "Galantamine analogs",
            "therapeutic_area": "Neurodegeneration / Alzheimer's",
            "experiment_type": "custom",
            "title": "Human plasma protein binding — GAL-5 (equilibrium dialysis)",
            "hypothesis": {
                "statement": "GAL-5 protein binding is < 90%, consistent with adequate free fraction for CNS penetration",
                "null_hypothesis": "GAL-5 is > 95% protein-bound, limiting free drug exposure",
            },
            "compliance": {"bsl_level": "BSL1"},
            "turnaround_budget": {"budget_max_usd": 3000, "target_tat_days": 14},
            "deliverables": {"minimum_package_level": "standard"},
            "metadata": {"notes": "Rapid equilibrium dialysis (RED) at 37°C, 4h. Warfarin as high-binding reference (> 98%)."},
        },
    },

    # ─── Program 2: LIT-2847 Kinase ──────────────────────────────────────────
    {
        "id": new_id(),
        "status": "OPEN",
        "payment_status": "ESCROWED",
        "created_at": ago(12),
        "updated_at": ago(6),
        "experiment_type": "cell_viability",
        "estimated_cost_usd": 1100.0,
        "specification": {
            "program": "LIT-2847 Kinase Program",
            "compound_series": "EGFR inhibitors",
            "therapeutic_area": "NSCLC / Oncology",
            "experiment_type": "cell_viability",
            "title": "Cell viability IC₅₀ — LIT-2847 in A549 EGFR-L858R",
            "hypothesis": {
                "statement": "LIT-2847 selectively inhibits proliferation of EGFR L858R-mutant A549 cells with IC50 < 100 nM",
                "null_hypothesis": "LIT-2847 shows no selective antiproliferative activity (IC50 ≥ 500 nM)",
            },
            "compliance": {"bsl_level": "BSL2"},
            "turnaround_budget": {"budget_max_usd": 1500, "target_tat_days": 10},
            "deliverables": {"minimum_package_level": "standard"},
            "metadata": {"notes": "CellTiter-Glo 2.0, 72h. 10-point dose-response 0.1 nM–10 µM. Osimertinib as reference."},
        },
    },
    {
        "id": new_id(),
        "status": "OPEN",
        "payment_status": "ESCROWED",
        "created_at": ago(12),
        "updated_at": ago(6),
        "experiment_type": "cell_viability",
        "estimated_cost_usd": 950.0,
        "specification": {
            "program": "LIT-2847 Kinase Program",
            "compound_series": "EGFR inhibitors",
            "therapeutic_area": "NSCLC / Oncology",
            "experiment_type": "cell_viability",
            "title": "Selectivity window — LIT-2847 in MRC-5 normal fibroblasts",
            "hypothesis": {
                "statement": "LIT-2847 spares normal MRC-5 fibroblasts with CC50 > 10 µM, giving ≥ 100-fold selectivity window",
                "null_hypothesis": "LIT-2847 shows < 10-fold selectivity between cancer and normal cells",
            },
            "compliance": {"bsl_level": "BSL1"},
            "turnaround_budget": {"budget_max_usd": 1200, "target_tat_days": 10},
            "deliverables": {"minimum_package_level": "standard"},
            "metadata": {"notes": "Run in parallel with A549 assay. Same CellTiter-Glo protocol."},
        },
    },
    {
        "id": new_id(),
        "status": "PENDING_REVIEW",
        "payment_status": "PENDING",
        "created_at": ago(4),
        "updated_at": ago(4),
        "experiment_type": "qpcr_expression",
        "estimated_cost_usd": 750.0,
        "specification": {
            "program": "LIT-2847 Kinase Program",
            "compound_series": "EGFR inhibitors",
            "therapeutic_area": "NSCLC / Oncology",
            "experiment_type": "qpcr_expression",
            "title": "EGFR pathway inhibition — qPCR in A549 (4h treatment)",
            "hypothesis": {
                "statement": "LIT-2847 at IC50 concentration suppresses EGFR downstream targets (pERK, pAKT surrogates) by ≥ 50% vs DMSO",
                "null_hypothesis": "LIT-2847 does not significantly alter EGFR pathway gene expression",
            },
            "compliance": {"bsl_level": "BSL2"},
            "turnaround_budget": {"budget_max_usd": 1000, "target_tat_days": 8},
            "deliverables": {"minimum_package_level": "standard"},
            "metadata": {"notes": "4h treatment at IC50 and 3×IC50. Panel: EGFR, ERK1/2, AKT, MYC, CDK4. GAPDH/ACTB reference."},
        },
    },

    # ─── Program 3: ZL-9 Antimicrobial ───────────────────────────────────────
    {
        "id": new_id(),
        "status": "OPEN",
        "payment_status": "ESCROWED",
        "created_at": ago(9),
        "updated_at": ago(4),
        "experiment_type": "mic_mbc",
        "estimated_cost_usd": 650.0,
        "specification": {
            "program": "ZL-9 Antimicrobial",
            "compound_series": "Lipopeptides",
            "therapeutic_area": "Infectious Disease / MRSA",
            "experiment_type": "mic_mbc",
            "title": "MIC / MBC — ZL-9 vs 5 MRSA clinical isolates + ATCC 29213",
            "hypothesis": {
                "statement": "ZL-9 achieves MIC ≤ 2 µg/mL against all tested MRSA isolates, comparable to vancomycin",
                "null_hypothesis": "ZL-9 MIC > 4 µg/mL, indicating insufficient potency for clinical relevance",
            },
            "compliance": {"bsl_level": "BSL2"},
            "turnaround_budget": {"budget_max_usd": 900, "target_tat_days": 7},
            "deliverables": {"minimum_package_level": "standard"},
            "metadata": {"notes": "CLSI M07 broth microdilution. Vancomycin and daptomycin as comparators. Report exact MIC and MBC."},
        },
    },
    {
        "id": new_id(),
        "status": "PENDING_REVIEW",
        "payment_status": "PENDING",
        "created_at": ago(5),
        "updated_at": ago(5),
        "experiment_type": "zone_of_inhibition",
        "estimated_cost_usd": 420.0,
        "specification": {
            "program": "ZL-9 Antimicrobial",
            "compound_series": "Lipopeptides",
            "therapeutic_area": "Infectious Disease / MRSA",
            "experiment_type": "zone_of_inhibition",
            "title": "Zone of inhibition panel — ZL-9 disk diffusion (6 strains)",
            "hypothesis": {
                "statement": "ZL-9 produces measurable zones of inhibition ≥ 15 mm against all 6 tested strains",
                "null_hypothesis": "ZL-9 produces no inhibition zones or < 10 mm zones",
            },
            "compliance": {"bsl_level": "BSL2"},
            "turnaround_budget": {"budget_max_usd": 600, "target_tat_days": 5},
            "deliverables": {"minimum_package_level": "standard"},
            "metadata": {"notes": "Mueller-Hinton agar, 10 µg disks. Include MRSA, MSSA, E. faecalis, K. pneumoniae, E. coli, P. aeruginosa."},
        },
    },
    {
        "id": new_id(),
        "status": "DRAFT",
        "payment_status": "PENDING",
        "created_at": ago(1),
        "updated_at": ago(1),
        "experiment_type": "custom",
        "estimated_cost_usd": 820.0,
        "specification": {
            "program": "ZL-9 Antimicrobial",
            "compound_series": "Lipopeptides",
            "therapeutic_area": "Infectious Disease / MRSA",
            "experiment_type": "custom",
            "title": "Time-kill kinetics — ZL-9 at 1×, 2×, 4× MIC vs MRSA ATCC 29213",
            "hypothesis": {
                "statement": "ZL-9 at 2× MIC achieves ≥ 3-log10 CFU reduction within 6h, consistent with bactericidal activity",
                "null_hypothesis": "ZL-9 shows only bacteriostatic activity at ≤ 4× MIC",
            },
            "compliance": {"bsl_level": "BSL2"},
            "turnaround_budget": {"budget_max_usd": 1100, "target_tat_days": 10},
            "deliverables": {"minimum_package_level": "standard"},
            "metadata": {"notes": "Sampling at 0, 2, 4, 6, 12, 24h. MHB broth, inoculum 5×10⁵ CFU/mL. Vancomycin at 2× MIC as comparator."},
        },
    },
]


def seed():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # Remove existing dev experiments and their results/packets
    cur.execute("SELECT id FROM experiments WHERE requester_id = ?", (USER_ID,))
    existing_ids = [r["id"] for r in cur.fetchall()]
    if existing_ids:
        placeholders = ",".join("?" * len(existing_ids))
        cur.execute(f"DELETE FROM experiment_results WHERE experiment_id IN ({placeholders})", existing_ids)
        cur.execute(f"DELETE FROM lab_packets WHERE experiment_id IN ({placeholders})", existing_ids)
        cur.execute(f"DELETE FROM experiments WHERE id IN ({placeholders})", existing_ids)
        print(f"Removed {len(existing_ids)} existing experiments.")

    for exp in EXPERIMENTS:
        result = exp.pop("result", None)
        exp_id = exp["id"]
        spec_json = json.dumps(exp["specification"])
        completed_at = exp.get("completed_at")

        cur.execute(
            """
            INSERT INTO experiments (
                id, requester_id, status, payment_status,
                created_at, updated_at, completed_at,
                experiment_type, estimated_cost_usd, specification
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                exp_id,
                USER_ID,
                exp["status"],
                exp["payment_status"],
                exp["created_at"],
                exp["updated_at"],
                completed_at,
                exp["experiment_type"],
                exp["estimated_cost_usd"],
                spec_json,
            ),
        )

        if result:
            cur.execute(
                """
                INSERT INTO experiment_results (
                    id, experiment_id, hypothesis_supported, confidence_level,
                    summary, structured_data, raw_data_files, notes,
                    is_approved, rating, submitted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_id(),
                    exp_id,
                    1 if result["hypothesis_supported"] else 0,
                    result["confidence_level"],
                    result["summary"],
                    json.dumps(result["structured_data"]),
                    json.dumps(result["raw_data_files"]),
                    result["notes"],
                    1 if result.get("is_approved") else 0,
                    result.get("rating"),
                    ago(7),
                ),
            )

        print(f"  ✓ [{exp['status']:15}] {exp['specification']['title'][:60]}")

    con.commit()
    con.close()
    print(f"\nSeeded {len(EXPERIMENTS)} experiments across 3 programs.")


if __name__ == "__main__":
    seed()

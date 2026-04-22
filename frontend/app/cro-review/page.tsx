"use client";

import CroReviewCockpit from "./CroReviewCockpit";
import type { StudyContext } from "./CroReviewCockpit";

const EXAMPLE_STUDY: StudyContext = {
  id: "HD-103",
  title: "HDAC6 Selective Inhibitor IC50 Characterization (HD-103)",
  assayType: "Fluorogenic substrate assay (IC₅₀)",
  compound: "HD-103",
  enzymes: ["HDAC1", "HDAC3/NCoR2", "HDAC6 (primary)", "HDAC8"],
  submitted: "Apr 19, 2026",
  privacy: "Confidential",
};

export default function CroReviewPage() {
  return <CroReviewCockpit study={EXAMPLE_STUDY} />;
}

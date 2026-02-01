"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  EdisonJobType,
  EdisonTranslateResponse,
} from "./types";

export interface ChatSession {
  id: string;
  query: string;
  agent: EdisonJobType;
  timestamp: string;
  experimentType?: string;
}

interface HypothesisState {
  // Query & generation
  query: string;
  selectedAgent: EdisonJobType;
  edisonResponse: EdisonTranslateResponse | null;

  // Editable hypothesis
  editedHypothesis: string;
  editedNullHypothesis: string;

  // Flow state
  flowState: "INITIAL" | "PROCESSING" | "HYPOTHESIS_REVIEW" | "EXPERIMENT_FORM";

  // Cost estimate
  estimate: { low: number; typical: number; high: number } | null;

  // History (max 20 items)
  chatHistory: ChatSession[];

  // Actions
  setQuery: (query: string) => void;
  setSelectedAgent: (agent: EdisonJobType) => void;
  setEdisonResponse: (response: EdisonTranslateResponse | null) => void;
  setHypothesis: (hypothesis: string) => void;
  updateHypothesis: (hypothesis: string) => void;
  updateNullHypothesis: (nullHypothesis: string) => void;
  setFlowState: (
    state: "INITIAL" | "PROCESSING" | "HYPOTHESIS_REVIEW" | "EXPERIMENT_FORM"
  ) => void;
  setEstimate: (estimate: {
    low: number;
    typical: number;
    high: number;
  } | null) => void;
  addToHistory: (session: Omit<ChatSession, "id" | "timestamp">) => void;
  clearHistory: () => void;
  loadFromResponse: (response: EdisonTranslateResponse) => void;
  startNewHypothesis: () => void;
  reset: () => void;
}

const MAX_HISTORY_ITEMS = 20;

export const useHypothesisStore = create<HypothesisState>()(
  persist(
    (set, get) => ({
      // Initial state
      query: "",
      selectedAgent: "literature",
      edisonResponse: null,
      editedHypothesis: "",
      editedNullHypothesis: "",
      flowState: "INITIAL",
      estimate: null,
      chatHistory: [],

      // Actions
      setQuery: (query: string) => set({ query }),

      setSelectedAgent: (agent: EdisonJobType) => set({ selectedAgent: agent }),

      setEdisonResponse: (response: EdisonTranslateResponse | null) =>
        set({ edisonResponse: response }),

      setHypothesis: (hypothesis: string) =>
        set({ editedHypothesis: hypothesis }),

      updateHypothesis: (hypothesis: string) =>
        set({ editedHypothesis: hypothesis }),

      updateNullHypothesis: (nullHypothesis: string) =>
        set({ editedNullHypothesis: nullHypothesis }),

      setFlowState: (
        state: "INITIAL" | "PROCESSING" | "HYPOTHESIS_REVIEW" | "EXPERIMENT_FORM"
      ) => set({ flowState: state }),

      setEstimate: (estimate: {
        low: number;
        typical: number;
        high: number;
      } | null) => set({ estimate }),

      addToHistory: (session: Omit<ChatSession, "id" | "timestamp">) => {
        const newSession: ChatSession = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          ...session,
        };
        const currentHistory = get().chatHistory;
        const updatedHistory = [newSession, ...currentHistory].slice(
          0,
          MAX_HISTORY_ITEMS
        );
        set({ chatHistory: updatedHistory });
      },

      clearHistory: () => set({ chatHistory: [] }),

      loadFromResponse: (response: EdisonTranslateResponse) => {
        const hypothesis = response.intake.hypothesis.statement || "";
        const nullHypothesis = response.intake.hypothesis.null_hypothesis || "";
        set({
          edisonResponse: response,
          editedHypothesis: hypothesis,
          editedNullHypothesis: nullHypothesis,
        });
      },

      startNewHypothesis: () => {
        const currentHistory = get().chatHistory;
        set({
          query: "",
          selectedAgent: "literature",
          edisonResponse: null,
          editedHypothesis: "",
          editedNullHypothesis: "",
          flowState: "INITIAL",
          estimate: null,
          chatHistory: currentHistory,
        });
      },

      reset: () =>
        set({
          query: "",
          selectedAgent: "literature",
          edisonResponse: null,
          editedHypothesis: "",
          editedNullHypothesis: "",
          flowState: "INITIAL",
          estimate: null,
          chatHistory: [],
        }),
    }),
    {
      name: "litmus-hypothesis",
      partialize: (state) => ({
        query: state.query,
        selectedAgent: state.selectedAgent,
        editedHypothesis: state.editedHypothesis,
        editedNullHypothesis: state.editedNullHypothesis,
        chatHistory: state.chatHistory,
        estimate: state.estimate,
      }),
    }
  )
);

// Selectors as hooks
export const useCurrentHypothesis = () => {
  const editedHypothesis = useHypothesisStore(
    (state) => state.editedHypothesis
  );
  const editedNullHypothesis = useHypothesisStore(
    (state) => state.editedNullHypothesis
  );

  return {
    statement: editedHypothesis,
    nullHypothesis: editedNullHypothesis,
    isReady: editedHypothesis.trim().length > 0,
  };
};

export const useHypothesisFlow = () => {
  const flowState = useHypothesisStore((state) => state.flowState);
  const setFlowState = useHypothesisStore((state) => state.setFlowState);

  return {
    flowState,
    setFlowState,
  };
};

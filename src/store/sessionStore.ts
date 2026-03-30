import { create } from "zustand";
import type {
  AiPreviewState,
  ReactionLog,
  SessionState,
  Settings,
  Summary,
  SummaryListItem,
} from "../types/ipc";

type BootstrapState = "idle" | "loading" | "ready" | "error";

function createInitialSessionState(): SessionState {
  return {
    status: "idle",
    session_id: null,
    started_at: null,
  };
}

function createInitialAiPreviewState(): AiPreviewState {
  return {
    image_base64: null,
    mime_type: null,
    updated_at: null,
    width: null,
    height: null,
  };
}

interface SessionStore {
  bootstrapState: BootstrapState;
  errorMessage: string | null;
  sessionState: SessionState;
  aiPreview: AiPreviewState;
  settings: Settings | null;
  summaries: SummaryListItem[];
  selectedSummaryId: string | null;
  selectedSummary: Summary | null;
  reactions: ReactionLog[];
  isSessionActionPending: boolean;
  isSettingsPending: boolean;
  isSummariesLoading: boolean;
  isSummaryDetailLoading: boolean;
  isReactionsLoading: boolean;
  setBootstrapState: (state: BootstrapState) => void;
  setErrorMessage: (message: string) => void;
  clearErrorMessage: () => void;
  setSessionState: (state: SessionState) => void;
  setAiPreview: (state: AiPreviewState) => void;
  setSettings: (settings: Settings) => void;
  setSummaries: (summaries: SummaryListItem[]) => void;
  setSelectedSummaryId: (sessionId: string | null) => void;
  setSelectedSummary: (summary: Summary | null) => void;
  setReactions: (reactions: ReactionLog[]) => void;
  setSessionActionPending: (pending: boolean) => void;
  setSettingsPending: (pending: boolean) => void;
  setSummariesLoading: (pending: boolean) => void;
  setSummaryDetailLoading: (pending: boolean) => void;
  setReactionsLoading: (pending: boolean) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  bootstrapState: "idle",
  errorMessage: null,
  sessionState: createInitialSessionState(),
  aiPreview: createInitialAiPreviewState(),
  settings: null,
  summaries: [],
  selectedSummaryId: null,
  selectedSummary: null,
  reactions: [],
  isSessionActionPending: false,
  isSettingsPending: false,
  isSummariesLoading: false,
  isSummaryDetailLoading: false,
  isReactionsLoading: false,
  setBootstrapState: (bootstrapState) => set({ bootstrapState }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  clearErrorMessage: () => set({ errorMessage: null }),
  setSessionState: (sessionState) => set({ sessionState }),
  setAiPreview: (aiPreview) => set({ aiPreview }),
  setSettings: (settings) => set({ settings }),
  setSummaries: (summaries) => set({ summaries }),
  setSelectedSummaryId: (selectedSummaryId) =>
    set((state) =>
      state.selectedSummaryId === selectedSummaryId
        ? { selectedSummaryId }
        : { selectedSummaryId, selectedSummary: null, reactions: [] },
    ),
  setSelectedSummary: (selectedSummary) => set({ selectedSummary }),
  setReactions: (reactions) => set({ reactions }),
  setSessionActionPending: (isSessionActionPending) => set({ isSessionActionPending }),
  setSettingsPending: (isSettingsPending) => set({ isSettingsPending }),
  setSummariesLoading: (isSummariesLoading) => set({ isSummariesLoading }),
  setSummaryDetailLoading: (isSummaryDetailLoading) =>
    set({ isSummaryDetailLoading }),
  setReactionsLoading: (isReactionsLoading) => set({ isReactionsLoading }),
}));

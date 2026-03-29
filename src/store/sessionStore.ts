import { create } from "zustand";
import type {
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

interface SessionStore {
  bootstrapState: BootstrapState;
  errorMessage: string | null;
  sessionState: SessionState;
  settings: Settings | null;
  summaries: SummaryListItem[];
  selectedSummaryId: string | null;
  selectedSummary: Summary | null;
  isSessionActionPending: boolean;
  isSettingsPending: boolean;
  isSummariesLoading: boolean;
  isSummaryDetailLoading: boolean;
  setBootstrapState: (state: BootstrapState) => void;
  setErrorMessage: (message: string) => void;
  clearErrorMessage: () => void;
  setSessionState: (state: SessionState) => void;
  setSettings: (settings: Settings) => void;
  setSummaries: (summaries: SummaryListItem[]) => void;
  setSelectedSummaryId: (sessionId: string | null) => void;
  setSelectedSummary: (summary: Summary | null) => void;
  setSessionActionPending: (pending: boolean) => void;
  setSettingsPending: (pending: boolean) => void;
  setSummariesLoading: (pending: boolean) => void;
  setSummaryDetailLoading: (pending: boolean) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  bootstrapState: "idle",
  errorMessage: null,
  sessionState: createInitialSessionState(),
  settings: null,
  summaries: [],
  selectedSummaryId: null,
  selectedSummary: null,
  isSessionActionPending: false,
  isSettingsPending: false,
  isSummariesLoading: false,
  isSummaryDetailLoading: false,
  setBootstrapState: (bootstrapState) => set({ bootstrapState }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  clearErrorMessage: () => set({ errorMessage: null }),
  setSessionState: (sessionState) => set({ sessionState }),
  setSettings: (settings) => set({ settings }),
  setSummaries: (summaries) => set({ summaries }),
  setSelectedSummaryId: (selectedSummaryId) =>
    set({ selectedSummaryId, selectedSummary: null }),
  setSelectedSummary: (selectedSummary) => set({ selectedSummary }),
  setSessionActionPending: (isSessionActionPending) => set({ isSessionActionPending }),
  setSettingsPending: (isSettingsPending) => set({ isSettingsPending }),
  setSummariesLoading: (isSummariesLoading) => set({ isSummariesLoading }),
  setSummaryDetailLoading: (isSummaryDetailLoading) =>
    set({ isSummaryDetailLoading }),
}));

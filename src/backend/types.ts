import type {
  AiPreviewState,
  AiPreviewUpdatedEvent,
  SessionState,
  SessionStateChangedEvent,
  Settings,
  SettingsPatch,
  Summary,
  SummaryListItem,
  SummaryReadyEvent,
} from "../types/ipc";

export type BackendMode = "mock" | "tauri";
export type Unsubscribe = () => void;

export interface BackendAdapter {
  readonly kind: BackendMode;
  startSession(): Promise<string>;
  stopSession(): Promise<void>;
  getSessionState(): Promise<SessionState>;
  getAiPreviewState(): Promise<AiPreviewState>;
  listSummaries(): Promise<SummaryListItem[]>;
  getSummary(sessionId: string): Promise<Summary>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: SettingsPatch): Promise<Settings>;
  subscribeSessionStateChanged(
    handler: (event: SessionStateChangedEvent) => void | Promise<void>,
  ): Promise<Unsubscribe>;
  subscribeSummaryReady(
    handler: (event: SummaryReadyEvent) => void | Promise<void>,
  ): Promise<Unsubscribe>;
  subscribeAiPreviewUpdated(
    handler: (event: AiPreviewUpdatedEvent) => void | Promise<void>,
  ): Promise<Unsubscribe>;
}

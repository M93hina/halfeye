import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
import type { BackendAdapter } from "./types";

export class TauriBackend implements BackendAdapter {
  readonly kind = "tauri" as const;

  startSession() {
    return invoke<string>("start_session");
  }

  stopSession() {
    return invoke<void>("stop_session");
  }

  getSessionState() {
    return invoke<SessionState>("get_session_state");
  }

  getAiPreviewState() {
    return invoke<AiPreviewState>("get_ai_preview_state");
  }

  listSummaries() {
    return invoke<SummaryListItem[]>("list_summaries");
  }

  getSummary(sessionId: string) {
    return invoke<Summary>("get_summary", { sessionId });
  }

  updateSummaryTitle(sessionId: string, title: string) {
    return invoke<Summary>("update_summary_title", { sessionId, title });
  }

  getSettings() {
    return invoke<Settings>("get_settings");
  }

  updateSettings(patch: SettingsPatch) {
    return invoke<Settings>("update_settings", { patch });
  }

  async subscribeSessionStateChanged(
    handler: (event: SessionStateChangedEvent) => void | Promise<void>,
  ) {
    return listen<SessionStateChangedEvent>(
      "session_state_changed",
      async (event) => {
        await handler(event.payload);
      },
    );
  }

  async subscribeSummaryReady(
    handler: (event: SummaryReadyEvent) => void | Promise<void>,
  ) {
    return listen<SummaryReadyEvent>("summary_ready", async (event) => {
      await handler(event.payload);
    });
  }

  async subscribeAiPreviewUpdated(
    handler: (event: AiPreviewUpdatedEvent) => void | Promise<void>,
  ) {
    return listen<AiPreviewUpdatedEvent>("ai_preview_updated", async (event) => {
      await handler(event.payload);
    });
  }
}

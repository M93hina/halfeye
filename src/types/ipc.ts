export type SessionStatus = "idle" | "active" | "ending";

export interface SessionState {
  status: SessionStatus;
  session_id: string | null;
  started_at: string | null;
}

export interface SummaryListItem {
  session_id: string;
  created_at: string;
}

export interface Summary {
  session_id: string;
  text: string;
  created_at: string;
}

export interface Settings {
  reaction_enabled: boolean;
}

export interface SettingsPatch {
  reaction_enabled?: boolean;
}

export interface SessionStateChangedEvent {
  status: SessionStatus;
}

export interface OverlayReactionEvent {
  text: string;
}

export interface SummaryReadyEvent {
  session_id: string;
  text: string;
}

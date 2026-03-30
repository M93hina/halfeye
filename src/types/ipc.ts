export type SessionStatus = "idle" | "active" | "ending";

export interface SessionState {
  status: SessionStatus;
  session_id: string | null;
  started_at: string | null;
  audio_transcription_enabled: boolean;
}

export interface StartSessionOptions {
  audio_transcription: boolean;
}

export interface AudioTranscriptionStatus {
  available: boolean;
  model_path: string;
  reason: string | null;
}

export interface SummaryListItem {
  session_id: string;
  title: string;
  created_at: string;
}

export interface Summary {
  session_id: string;
  title: string;
  text: string;
  created_at: string;
}

export interface AiPreviewState {
  image_base64: string | null;
  mime_type: string | null;
  updated_at: string | null;
  width: number | null;
  height: number | null;
}

export type ReactionActionType = "react" | "silent";

export interface ReactionLog {
  id: string;
  session_id: string;
  timestamp: string;
  action_type: ReactionActionType;
  observation_summary: string;
  text: string;
}

export type TimeDisplayMode = "absolute" | "relative";
export type SummariesSortOrder = "newest" | "oldest";
export type SummaryFontSize = "small" | "medium" | "large";
export type ActiveSessionEmphasis = "strong" | "calm";
export type ThemeMode = "light" | "dark";

export interface Settings {
  auto_select_summary: boolean;
  confirm_before_stop: boolean;
  time_display_mode: TimeDisplayMode;
  summaries_sort_order: SummariesSortOrder;
  summary_font_size: SummaryFontSize;
  active_session_emphasis: ActiveSessionEmphasis;
  theme_mode: ThemeMode;
}

export interface SettingsPatch {
  auto_select_summary?: boolean;
  confirm_before_stop?: boolean;
  time_display_mode?: TimeDisplayMode;
  summaries_sort_order?: SummariesSortOrder;
  summary_font_size?: SummaryFontSize;
  active_session_emphasis?: ActiveSessionEmphasis;
  theme_mode?: ThemeMode;
}

export interface SessionStateChangedEvent {
  status: SessionStatus;
}

export interface OverlayReactionEvent {
  text: string;
}

export interface AiPreviewUpdatedEvent extends AiPreviewState {}

export interface SummaryReadyEvent {
  session_id: string;
  text: string;
}

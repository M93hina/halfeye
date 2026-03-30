import type {
  AiPreviewState,
  AiPreviewUpdatedEvent,
  SessionState,
  SessionStateChangedEvent,
  Settings,
  SettingsPatch,
  Summary,
  SummaryReadyEvent,
} from "../types/ipc";
import type { BackendAdapter, Unsubscribe } from "./types";

function createIdleState(): SessionState {
  return {
    status: "idle",
    session_id: null,
    started_at: null,
  };
}

function createEmptyAiPreviewState(): AiPreviewState {
  return {
    image_base64: null,
    mime_type: null,
    updated_at: null,
    width: null,
    height: null,
  };
}

function createSeededSummaries(): Summary[] {
  return [
    {
      session_id: "session-demo-design-review",
      title: "overlay の余白設計レビュー",
      created_at: "2026-03-29T12:30:00.000Z",
      text: [
        "デザインレビューで overlay の余白設計を確認。",
        "セッション開始中は AI の存在感を強め、停止後は自然に UI を沈める方針で合意。",
        "次のアクション: Person B が window 制御を進め、Person A は main window を React 化する。",
      ].join("\n"),
    },
    {
      session_id: "session-demo-pairing",
      title: "companion AI 体験の検証",
      created_at: "2026-03-28T04:10:00.000Z",
      text: [
        "コーディング作業中の companion AI 体験を検証。",
        "要点: 常時監視ではなく、ユーザーが明示的に session を切る体験が安心感につながる。",
        "メモ: 初期版は screen-first、audio は後続フェーズに分離。",
      ].join("\n"),
    },
  ];
}

export class MockBackend implements BackendAdapter {
  readonly kind = "mock" as const;

  private sessionState: SessionState = createIdleState();
  private aiPreviewState: AiPreviewState = createEmptyAiPreviewState();
  private settings: Settings = {
    auto_select_summary: true,
    confirm_before_stop: true,
    time_display_mode: "absolute",
    summaries_sort_order: "newest",
    summary_font_size: "medium",
    active_session_emphasis: "strong",
    theme_mode: "light",
  };
  private summaries = createSeededSummaries();
  private sessionStateListeners = new Set<
    (event: SessionStateChangedEvent) => void | Promise<void>
  >();
  private summaryReadyListeners = new Set<
    (event: SummaryReadyEvent) => void | Promise<void>
  >();
  private aiPreviewListeners = new Set<
    (event: AiPreviewUpdatedEvent) => void | Promise<void>
  >();
  private pendingStopTimer: number | null = null;
  private previewTimer: number | null = null;
  private previewTick = 0;

  async startSession() {
    if (this.sessionState.status !== "idle" && this.sessionState.session_id) {
      return this.sessionState.session_id;
    }

    const sessionId = `session-${crypto.randomUUID().slice(0, 8)}`;
    this.sessionState = {
      status: "active",
      session_id: sessionId,
      started_at: new Date().toISOString(),
    };

    this.emitSessionStateChanged();
    this.startPreviewLoop(sessionId);
    return sessionId;
  }

  async stopSession() {
    if (this.sessionState.status !== "active") {
      return;
    }

    const finishingSession = { ...this.sessionState };

    this.sessionState = {
      ...this.sessionState,
      status: "ending",
    };

    this.emitSessionStateChanged();

    if (this.pendingStopTimer !== null) {
      window.clearTimeout(this.pendingStopTimer);
    }
    this.stopPreviewLoop();

    this.pendingStopTimer = window.setTimeout(() => {
      const createdAt = new Date().toISOString();
      const startedAt = finishingSession.started_at
        ? new Date(finishingSession.started_at).toLocaleString("ja-JP")
        : "不明";
      const summary: Summary = {
        session_id: finishingSession.session_id ?? `session-${createdAt}`,
        title: deriveSummaryTitle(
          [
            `セッション ${finishingSession.session_id ?? "unknown"} を終了しました。`,
            `開始時刻: ${startedAt}`,
            "モック連携が summary_ready イベントを発火し、一覧と詳細を再取得します。",
            "ここを Rust 実装に差し替えても、UI 側は adapter 越しのまま利用できます。",
          ].join("\n"),
          finishingSession.session_id ?? `session-${createdAt}`,
        ),
        created_at: createdAt,
        text: [
          `セッション ${finishingSession.session_id ?? "unknown"} を終了しました。`,
          `開始時刻: ${startedAt}`,
          "モック連携が summary_ready イベントを発火し、一覧と詳細を再取得します。",
          "ここを Rust 実装に差し替えても、UI 側は adapter 越しのまま利用できます。",
        ].join("\n"),
      };

      this.summaries = [summary, ...this.summaries];
      this.sessionState = createIdleState();
      this.aiPreviewState = createEmptyAiPreviewState();
      this.emitSessionStateChanged();
      this.emitAiPreviewUpdated();
      this.emitSummaryReady(summary);
    }, 1400);
  }

  async getSessionState() {
    return { ...this.sessionState };
  }

  async getAiPreviewState() {
    return { ...this.aiPreviewState };
  }

  async listSummaries() {
    return this.summaries.map((summary) => ({
      session_id: summary.session_id,
      title: summary.title,
      created_at: summary.created_at,
    }));
  }

  async getSummary(sessionId: string) {
    const summary = this.summaries.find((item) => item.session_id === sessionId);

    if (!summary) {
      throw new Error(`セッション ${sessionId} のまとめが見つかりません。`);
    }

    return { ...summary };
  }

  async updateSummaryTitle(sessionId: string, title: string) {
    const summary = this.summaries.find((item) => item.session_id === sessionId);

    if (!summary) {
      throw new Error(`セッション ${sessionId} のまとめが見つかりません。`);
    }

    summary.title = normalizeSummaryTitle(title, sessionId);
    return { ...summary };
  }

  async getSettings() {
    return { ...this.settings };
  }

  async updateSettings(patch: SettingsPatch) {
    this.settings = {
      ...this.settings,
      ...patch,
    };

    return { ...this.settings };
  }

  async subscribeSessionStateChanged(
    handler: (event: SessionStateChangedEvent) => void | Promise<void>,
  ): Promise<Unsubscribe> {
    this.sessionStateListeners.add(handler);
    return () => {
      this.sessionStateListeners.delete(handler);
    };
  }

  async subscribeSummaryReady(
    handler: (event: SummaryReadyEvent) => void | Promise<void>,
  ): Promise<Unsubscribe> {
    this.summaryReadyListeners.add(handler);
    return () => {
      this.summaryReadyListeners.delete(handler);
    };
  }

  async subscribeAiPreviewUpdated(
    handler: (event: AiPreviewUpdatedEvent) => void | Promise<void>,
  ): Promise<Unsubscribe> {
    this.aiPreviewListeners.add(handler);
    return () => {
      this.aiPreviewListeners.delete(handler);
    };
  }

  private emitSessionStateChanged() {
    const payload: SessionStateChangedEvent = {
      status: this.sessionState.status,
    };

    for (const listener of this.sessionStateListeners) {
      void listener(payload);
    }
  }

  private emitSummaryReady(summary: Summary) {
    const payload: SummaryReadyEvent = {
      session_id: summary.session_id,
      text: summary.text,
    };

    for (const listener of this.summaryReadyListeners) {
      void listener(payload);
    }
  }

  private emitAiPreviewUpdated() {
    const payload: AiPreviewUpdatedEvent = {
      ...this.aiPreviewState,
    };

    for (const listener of this.aiPreviewListeners) {
      void listener(payload);
    }
  }

  private startPreviewLoop(sessionId: string) {
    this.stopPreviewLoop();
    this.previewTick = 0;

    const updatePreview = () => {
      this.previewTick += 1;
      this.aiPreviewState = createMockPreview(sessionId, this.previewTick);
      this.emitAiPreviewUpdated();
    };

    updatePreview();
    this.previewTimer = window.setInterval(updatePreview, 2_000);
  }

  private stopPreviewLoop() {
    if (this.previewTimer !== null) {
      window.clearInterval(this.previewTimer);
      this.previewTimer = null;
    }
  }
}

function deriveSummaryTitle(text: string, sessionId: string) {
  const firstMeaningfulLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return normalizeSummaryTitle(firstMeaningfulLine ?? sessionId, sessionId);
}

function normalizeSummaryTitle(title: string, fallback: string) {
  const trimmed = title.trim();
  const normalized = trimmed.length > 0 ? trimmed : fallback;
  return normalized.slice(0, 40);
}

function createMockPreview(sessionId: string, tick: number): AiPreviewState {
  const updatedAt = new Date().toISOString();
  const accent = tick % 2 === 0 ? "#38bdf8" : "#34d399";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
      </defs>
      <rect width="480" height="300" rx="24" fill="url(#bg)" />
      <rect x="24" y="24" width="432" height="36" rx="12" fill="rgba(255,255,255,0.08)" />
      <rect x="24" y="84" width="260" height="146" rx="18" fill="${accent}" opacity="0.24" />
      <rect x="302" y="84" width="154" height="24" rx="12" fill="rgba(255,255,255,0.12)" />
      <rect x="302" y="122" width="120" height="18" rx="9" fill="rgba(255,255,255,0.1)" />
      <rect x="302" y="154" width="138" height="18" rx="9" fill="rgba(255,255,255,0.1)" />
      <rect x="302" y="186" width="90" height="18" rx="9" fill="rgba(255,255,255,0.1)" />
      <rect x="24" y="248" width="180" height="20" rx="10" fill="rgba(255,255,255,0.12)" />
      <text x="40" y="47" fill="white" font-family="Segoe UI, sans-serif" font-size="14">AI view preview</text>
      <text x="40" y="274" fill="rgba(255,255,255,0.78)" font-family="Segoe UI, sans-serif" font-size="13">${sessionId}</text>
    </svg>
  `.trim();

  return {
    image_base64: btoa(svg),
    mime_type: "image/svg+xml",
    updated_at: updatedAt,
    width: 480,
    height: 300,
  };
}

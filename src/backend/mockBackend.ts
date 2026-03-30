import type {
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

function createSeededSummaries(): Summary[] {
  return [
    {
      session_id: "session-demo-design-review",
      created_at: "2026-03-29T12:30:00.000Z",
      text: [
        "デザインレビューで overlay の余白設計を確認。",
        "セッション開始中は AI の存在感を強め、停止後は自然に UI を沈める方針で合意。",
        "次のアクション: Person B が window 制御を進め、Person A は main window を React 化する。",
      ].join("\n"),
    },
    {
      session_id: "session-demo-pairing",
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
  private pendingStopTimer: number | null = null;

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

    this.pendingStopTimer = window.setTimeout(() => {
      const createdAt = new Date().toISOString();
      const startedAt = finishingSession.started_at
        ? new Date(finishingSession.started_at).toLocaleString("ja-JP")
        : "不明";
      const summary: Summary = {
        session_id: finishingSession.session_id ?? `session-${createdAt}`,
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
      this.emitSessionStateChanged();
      this.emitSummaryReady(summary);
    }, 1400);
  }

  async getSessionState() {
    return { ...this.sessionState };
  }

  async listSummaries() {
    return this.summaries.map((summary) => ({
      session_id: summary.session_id,
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
}

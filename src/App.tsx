import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { backend, backendModeLabel } from "./backend";
import type { NavigationTab } from "./store/navigationStore";
import { useNavigationStore } from "./store/navigationStore";
import { useSessionStore } from "./store/sessionStore";
import type {
  ActiveSessionEmphasis,
  ReactionLog,
  SessionStatus,
  SettingsPatch,
  SummaryFontSize,
  SummaryListItem,
  SummariesSortOrder,
  TimeDisplayMode,
} from "./types/ipc";

const tabs: Array<{ id: NavigationTab; label: string }> = [
  { id: "session", label: "セッション" },
  { id: "summaries", label: "まとめ" },
  { id: "settings", label: "設定" },
];

const statusLabels: Record<SessionStatus, string> = {
  idle: "待機中",
  active: "実行中",
  ending: "終了処理中",
};

const summaryFontClasses: Record<SummaryFontSize, string> = {
  small: "text-xs leading-6",
  medium: "text-sm leading-7",
  large: "text-base leading-8",
};

const summaryFontStyles: Record<
  SummaryFontSize,
  { fontSize: string; lineHeight: string }
> = {
  small: { fontSize: "12px", lineHeight: "1.7" },
  medium: { fontSize: "15px", lineHeight: "1.9" },
  large: { fontSize: "18px", lineHeight: "2" },
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isDarkTheme(themeMode: string | undefined) {
  return themeMode === "dark";
}

function normalizeSummaryTitle(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function formatAbsoluteDateTime(value: string | null) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRelativeDateTime(value: string | null) {
  if (!value) {
    return "--";
  }

  const target = new Date(value).getTime();
  const diffMs = target - Date.now();
  const rtf = new Intl.RelativeTimeFormat("ja-JP", { numeric: "auto" });
  const minutes = Math.round(diffMs / 60000);

  if (Math.abs(minutes) < 60) {
    return rtf.format(minutes, "minute");
  }

  const hours = Math.round(diffMs / 3600000);
  if (Math.abs(hours) < 24) {
    return rtf.format(hours, "hour");
  }

  const days = Math.round(diffMs / 86400000);
  if (Math.abs(days) < 30) {
    return rtf.format(days, "day");
  }

  const months = Math.round(diffMs / (86400000 * 30));
  return rtf.format(months, "month");
}

function formatDisplayTime(value: string | null, mode: TimeDisplayMode) {
  return mode === "relative"
    ? formatRelativeDateTime(value)
    : formatAbsoluteDateTime(value);
}

function createObjectUrlFromBase64(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function formatActionLabel(actionType: ReactionLog["action_type"]) {
  return actionType === "react" ? "react" : "silent";
}

function sortSummaries(
  summaries: SummaryListItem[],
  order: SummariesSortOrder,
) {
  return [...summaries].sort((left, right) => {
    const diff =
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime();

    return order === "newest" ? diff : -diff;
  });
}

function getStatusTone(
  status: SessionStatus,
  emphasis: ActiveSessionEmphasis,
  isDark: boolean,
) {
  if (status === "idle") {
    return isDark
      ? "border-slate-700 bg-slate-800 text-slate-200"
      : "border-stone-200 bg-stone-100 text-stone-700";
  }

  if (status === "ending") {
    return isDark
      ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
      : "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (emphasis === "calm") {
    return isDark
      ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100"
      : "border-sky-200 bg-sky-50 text-sky-700";
  }

  return isDark
    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function SessionTab() {
  const aiPreview = useSessionStore((state) => state.aiPreview);
  const settings = useSessionStore((state) => state.settings);
  const sessionState = useSessionStore((state) => state.sessionState);
  const isSessionActionPending = useSessionStore(
    (state) => state.isSessionActionPending,
  );
  const setSessionState = useSessionStore((state) => state.setSessionState);
  const setSessionActionPending = useSessionStore(
    (state) => state.setSessionActionPending,
  );
  const setErrorMessage = useSessionStore((state) => state.setErrorMessage);
  const clearErrorMessage = useSessionStore((state) => state.clearErrorMessage);

  const isDark = isDarkTheme(settings?.theme_mode);
  const timeMode = settings?.time_display_mode ?? "absolute";
  const emphasis = settings?.active_session_emphasis ?? "strong";
  const canStart = sessionState.status === "idle" && !isSessionActionPending;
  const canStop = sessionState.status === "active" && !isSessionActionPending;
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!aiPreview.image_base64 || !aiPreview.mime_type) {
      setPreviewSrc(null);
      return;
    }

    const objectUrl = createObjectUrlFromBase64(
      aiPreview.image_base64,
      aiPreview.mime_type,
    );
    setPreviewSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [aiPreview.image_base64, aiPreview.mime_type]);

  async function handleStart() {
    setSessionActionPending(true);
    clearErrorMessage();

    try {
      await backend.startSession();
      setSessionState(await backend.getSessionState());
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "セッションを開始できませんでした。"));
    } finally {
      setSessionActionPending(false);
    }
  }

  async function handleStop() {
    if ((settings?.confirm_before_stop ?? true) && !window.confirm("終了しますか？")) {
      return;
    }

    setSessionActionPending(true);
    clearErrorMessage();

    try {
      await backend.stopSession();
      setSessionState(await backend.getSessionState());
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "セッションを終了できませんでした。"));
    } finally {
      setSessionActionPending(false);
    }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            className={cx(
              "text-lg font-semibold tracking-tight",
              isDark ? "text-slate-100" : "text-slate-900",
            )}
          >
            セッション
          </h2>
          <p
            className={cx(
              "mt-1 break-all text-sm",
              isDark ? "text-slate-400" : "text-slate-500",
            )}
          >
            {sessionState.session_id ?? "--"}
          </p>
        </div>

        {sessionState.status === "idle" ? (
          <ActionButton
            disabled={!canStart}
            intent="primary"
            onClick={handleStart}
          >
            {isSessionActionPending ? "開始中" : "開始"}
          </ActionButton>
        ) : sessionState.status === "active" ? (
          <ActionButton
            disabled={!canStop}
            intent="primary"
            onClick={handleStop}
          >
            {isSessionActionPending ? "終了中" : "終了"}
          </ActionButton>
        ) : (
          <ActionButton disabled intent="secondary" onClick={() => {}}>
            処理中
          </ActionButton>
        )}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <MetricCard
          label="状態"
          tone={getStatusTone(sessionState.status, emphasis, isDark)}
          value={statusLabels[sessionState.status]}
        />
        <MetricCard
          label="開始"
          tone={
            isDark
              ? "border-slate-700 bg-slate-800 text-slate-200"
              : "border-stone-200 bg-stone-50 text-slate-700"
          }
          value={formatDisplayTime(sessionState.started_at, timeMode)}
        />
        <MetricCard
          label="ID"
          tone={
            isDark
              ? "border-slate-700 bg-slate-800 text-slate-200"
              : "border-stone-200 bg-stone-50 text-slate-700"
          }
          value={sessionState.session_id ?? "--"}
        />
      </div>

      <div
        className={cx(
          "mt-6 border-t pt-6",
          isDark ? "border-slate-800" : "border-stone-200",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div
            className={cx(
              "text-sm font-semibold uppercase tracking-[0.2em]",
              isDark ? "text-slate-400" : "text-slate-500",
            )}
          >
            AI view
          </div>
          <div
            className={cx(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
              sessionState.status === "active"
                ? getStatusTone("active", emphasis, isDark)
                : isDark
                  ? "border-slate-700 bg-slate-800 text-slate-300"
                  : "border-stone-200 bg-stone-100 text-slate-600",
            )}
          >
            {previewSrc ? "LIVE" : "IDLE"}
          </div>
        </div>

        <div
          className={cx(
            "mt-4 overflow-hidden rounded-[1.2rem] border",
            isDark
              ? "border-slate-700 bg-slate-950"
              : "border-stone-200 bg-stone-100",
          )}
        >
          <div className="aspect-video w-full">
            {previewSrc ? (
              <img
                alt="AI preview"
                className="h-full w-full object-cover"
                src={previewSrc}
              />
            ) : (
              <div
                className={cx(
                  "flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-sm",
                  isDark ? "text-slate-500" : "text-slate-400",
                )}
              >
                <div>
                  {sessionState.status === "active"
                    ? "プレビュー待機中"
                    : "セッション開始後に表示"}
                </div>
                <div className="text-xs">
                  {sessionState.status === "active"
                    ? "最初のキャプチャが届くまで少し待ってください"
                    : "開始すると AI が見ている画面がここに出ます"}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="更新"
            tone={
              isDark
                ? "border-slate-700 bg-slate-800 text-slate-200"
                : "border-stone-200 bg-stone-50 text-slate-700"
            }
            value={formatDisplayTime(aiPreview.updated_at, timeMode)}
          />
          <MetricCard
            label="サイズ"
            tone={
              isDark
                ? "border-slate-700 bg-slate-800 text-slate-200"
                : "border-stone-200 bg-stone-50 text-slate-700"
            }
            value={
              aiPreview.width && aiPreview.height
                ? `${aiPreview.width} x ${aiPreview.height}`
                : "--"
            }
          />
        </div>
      </div>
    </Panel>
  );
}

function SummariesTab() {
  const settings = useSessionStore((state) => state.settings);
  const summaries = useSessionStore((state) => state.summaries);
  const selectedSummaryId = useSessionStore((state) => state.selectedSummaryId);
  const selectedSummary = useSessionStore((state) => state.selectedSummary);
  const reactions = useSessionStore((state) => state.reactions);
  const isSummariesLoading = useSessionStore((state) => state.isSummariesLoading);
  const isSummaryDetailLoading = useSessionStore(
    (state) => state.isSummaryDetailLoading,
  );
  const isReactionsLoading = useSessionStore((state) => state.isReactionsLoading);
  const setSelectedSummaryId = useSessionStore(
    (state) => state.setSelectedSummaryId,
  );
  const setSummaries = useSessionStore((state) => state.setSummaries);
  const setSelectedSummary = useSessionStore((state) => state.setSelectedSummary);
  const setErrorMessage = useSessionStore((state) => state.setErrorMessage);
  const clearErrorMessage = useSessionStore((state) => state.clearErrorMessage);

  const isDark = isDarkTheme(settings?.theme_mode);
  const timeMode = settings?.time_display_mode ?? "absolute";
  const fontSize = settings?.summary_font_size ?? "medium";
  const sortedSummaries = sortSummaries(
    summaries,
    settings?.summaries_sort_order ?? "newest",
  );
  const recentSummaries = sortedSummaries.slice(0, 2);
  const olderSummaries = sortedSummaries.slice(2);
  const [titleDraft, setTitleDraft] = useState("");
  const [isRenamePending, setRenamePending] = useState(false);
  const [isRegenerateTitlePending, setRegenerateTitlePending] = useState(false);
  const [isReactionLogOpen, setReactionLogOpen] = useState(false);
  const [isOlderSummariesOpen, setOlderSummariesOpen] = useState(false);

  useEffect(() => {
    setTitleDraft(selectedSummary?.title ?? "");
  }, [selectedSummary?.session_id, selectedSummary?.title]);

  useEffect(() => {
    setReactionLogOpen(false);
  }, [selectedSummaryId]);

  useEffect(() => {
    if (olderSummaries.length === 0) {
      setOlderSummariesOpen(false);
    }
  }, [olderSummaries.length]);

  const currentSummaryTitle = selectedSummary
    ? normalizeSummaryTitle(selectedSummary.title, selectedSummary.session_id)
    : "";
  const normalizedTitleDraft = selectedSummary
    ? normalizeSummaryTitle(titleDraft, selectedSummary.session_id)
    : "";
  const canSaveTitle =
    !!selectedSummary &&
    !isRenamePending &&
    !isRegenerateTitlePending &&
    normalizedTitleDraft !== currentSummaryTitle;

  function applyUpdatedSummaryTitle(updatedSummary: typeof selectedSummary) {
    if (!updatedSummary) {
      return;
    }

    setSelectedSummary(updatedSummary);
    setSummaries(
      summaries.map((summary) =>
        summary.session_id === updatedSummary.session_id
          ? { ...summary, title: updatedSummary.title }
          : summary,
      ),
    );
    setTitleDraft(updatedSummary.title);
  }

  async function handleSaveTitle() {
    if (!selectedSummary || !canSaveTitle) {
      return;
    }

    setRenamePending(true);
    clearErrorMessage();

    try {
      const updatedSummary = await backend.updateSummaryTitle(
        selectedSummary.session_id,
        normalizedTitleDraft,
      );
      applyUpdatedSummaryTitle(updatedSummary);
    } catch (error) {
      setTitleDraft(currentSummaryTitle);
      setErrorMessage(
        getErrorMessage(error, "まとめの名前を更新できませんでした。"),
      );
    } finally {
      setRenamePending(false);
    }
  }

  async function handleRegenerateTitle() {
    if (!selectedSummary || isRenamePending || isRegenerateTitlePending) {
      return;
    }

    setRegenerateTitlePending(true);
    clearErrorMessage();

    try {
      const updatedSummary = await backend.regenerateSummaryTitle(
        selectedSummary.session_id,
      );
      applyUpdatedSummaryTitle(updatedSummary);
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "まとめの名前を再生成できませんでした。"),
      );
    } finally {
      setRegenerateTitlePending(false);
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]">
      <Panel className="p-3">
        <div className="flex items-center justify-between gap-3 px-1 pb-3">
          <h2
            className={cx(
              "text-sm font-semibold uppercase tracking-[0.2em]",
              isDark ? "text-slate-400" : "text-slate-500",
            )}
          >
            まとめ
          </h2>
          <span
            className={cx(
              "rounded-full border px-2.5 py-1 text-xs font-medium",
              isDark
                ? "border-slate-700 bg-slate-800 text-slate-300"
                : "border-stone-200 bg-stone-100 text-slate-600",
            )}
          >
            {sortedSummaries.length}
          </span>
        </div>

        <div className="space-y-2">
          {isSummariesLoading && sortedSummaries.length === 0 ? (
            <EmptyState title="読み込み中" />
          ) : sortedSummaries.length === 0 ? (
            <EmptyState title="なし" />
          ) : (
            <>
              {recentSummaries.map((summary) => (
                <SummaryListButton
                  key={summary.session_id}
                  fontSize={fontSize}
                  item={summary}
                  onSelect={() => {
                    if (summary.session_id !== selectedSummaryId) {
                      setSelectedSummaryId(summary.session_id);
                    }
                  }}
                  selected={summary.session_id === selectedSummaryId}
                  timeMode={timeMode}
                />
              ))}

              {olderSummaries.length > 0 ? (
                <section
                  className={cx(
                    "overflow-hidden rounded-[1rem] border",
                    isDark
                      ? "border-slate-800 bg-slate-900/60"
                      : "border-stone-200 bg-stone-50/80",
                  )}
                >
                  <button
                    className={cx(
                      "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition",
                      isDark ? "hover:bg-slate-800/80" : "hover:bg-white/80",
                    )}
                    onClick={() => setOlderSummariesOpen((current) => !current)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <div
                        className={cx(
                          "text-sm font-medium",
                          isDark ? "text-slate-100" : "text-slate-900",
                        )}
                      >
                        それ以前のまとめ
                      </div>
                      <div
                        className={cx(
                          "mt-1 text-xs",
                          isDark ? "text-slate-400" : "text-slate-500",
                        )}
                      >
                        {olderSummaries.length}件
                      </div>
                    </div>
                    <span
                      className={cx(
                        "rounded-full border px-2.5 py-1 text-xs font-medium",
                        isDark
                          ? "border-slate-700 bg-slate-800 text-slate-300"
                          : "border-stone-200 bg-white text-slate-600",
                      )}
                    >
                      {isOlderSummariesOpen ? "閉じる" : "開く"}
                    </span>
                  </button>

                  {isOlderSummariesOpen ? (
                    <div
                      className={cx(
                        "space-y-2 border-t p-3",
                        isDark ? "border-slate-800" : "border-stone-200",
                      )}
                    >
                      {olderSummaries.map((summary) => (
                        <SummaryListButton
                          key={summary.session_id}
                          fontSize={fontSize}
                          item={summary}
                          onSelect={() => {
                            if (summary.session_id !== selectedSummaryId) {
                              setSelectedSummaryId(summary.session_id);
                            }
                          }}
                          selected={summary.session_id === selectedSummaryId}
                          timeMode={timeMode}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </div>
      </Panel>

      <Panel>
        {!selectedSummaryId ? (
          <EmptyState title="選択してください" />
        ) : isSummaryDetailLoading && !selectedSummary ? (
          <EmptyState title="読み込み中" />
        ) : selectedSummary ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div
                  className={cx(
                    "text-xs font-semibold uppercase tracking-[0.2em]",
                    isDark ? "text-slate-400" : "text-slate-500",
                  )}
                >
                  名前
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className={cx(
                      "min-w-[16rem] flex-1 rounded-xl border px-3 py-2 text-sm outline-none transition",
                      isDark
                        ? "border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                        : "border-stone-200 bg-white text-slate-700 placeholder:text-slate-400",
                    )}
                    disabled={isRenamePending || isRegenerateTitlePending}
                    maxLength={40}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setTitleDraft(currentSummaryTitle);
                        return;
                      }

                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleSaveTitle();
                      }
                    }}
                    placeholder={selectedSummary.session_id}
                    type="text"
                    value={titleDraft}
                  />
                  <ActionButton
                    disabled={!canSaveTitle}
                    intent="primary"
                    onClick={() => {
                      void handleSaveTitle();
                    }}
                  >
                    {isRenamePending ? "保存中" : "保存"}
                  </ActionButton>
                  <ActionButton
                    disabled={!selectedSummary || isRenamePending || isRegenerateTitlePending}
                    intent="secondary"
                    onClick={() => {
                      void handleRegenerateTitle();
                    }}
                  >
                    {isRegenerateTitlePending ? "再生成中" : "再生成"}
                  </ActionButton>
                </div>
              </div>
              <div
                className={cx(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  isDark
                    ? "border-slate-700 bg-slate-800 text-slate-300"
                    : "border-stone-200 bg-stone-100 text-slate-600",
                )}
              >
                {formatDisplayTime(selectedSummary.created_at, timeMode)}
              </div>
            </div>
            <p
              className={cx(
                "break-all text-sm",
                isDark ? "text-slate-400" : "text-slate-500",
              )}
            >
              {selectedSummary.session_id}
            </p>

            <article
              className={cx(
                "rounded-[1.25rem] border p-4",
                isDark
                  ? "border-slate-700 bg-slate-900/70 text-slate-200"
                  : "border-stone-200 bg-stone-50/90 text-slate-700",
              )}
            >
              <pre
                className={cx(
                  "whitespace-pre-wrap font-sans",
                  summaryFontClasses[fontSize],
                )}
                style={summaryFontStyles[fontSize]}
              >
                {selectedSummary.text}
              </pre>
            </article>

            <section
              className={cx(
                "overflow-hidden rounded-[1.25rem] border",
                isDark
                  ? "border-slate-800 bg-slate-900/60"
                  : "border-stone-200 bg-stone-50/70",
              )}
            >
              <button
                className={cx(
                  "flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition",
                  isDark ? "hover:bg-slate-800/70" : "hover:bg-white/70",
                )}
                onClick={() => setReactionLogOpen((current) => !current)}
                type="button"
              >
                <div className="min-w-0">
                  <h3
                    className={cx(
                      "text-sm font-semibold uppercase tracking-[0.2em]",
                      isDark ? "text-slate-400" : "text-slate-500",
                    )}
                  >
                    Reaction Log
                  </h3>
                  <p
                    className={cx(
                      "mt-1 text-xs",
                      isDark ? "text-slate-500" : "text-slate-500",
                    )}
                  >
                    {isReactionLogOpen ? "クリックで収納" : "クリックで表示"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      "rounded-full border px-2.5 py-1 text-xs font-medium",
                      isDark
                        ? "border-slate-700 bg-slate-800 text-slate-300"
                        : "border-stone-200 bg-stone-100 text-slate-600",
                    )}
                  >
                    {reactions.length}
                  </span>
                  <span
                    className={cx(
                      "rounded-full border px-2.5 py-1 text-xs font-medium",
                      isDark
                        ? "border-slate-700 bg-slate-900 text-slate-300"
                        : "border-stone-200 bg-white text-slate-600",
                    )}
                  >
                    {isReactionLogOpen ? "閉じる" : "開く"}
                  </span>
                </div>
              </button>

              {isReactionLogOpen ? (
                <div
                  className={cx(
                    "space-y-3 border-t px-4 py-4",
                    isDark ? "border-slate-800" : "border-stone-200",
                  )}
                >
                  {isReactionsLoading && reactions.length === 0 ? (
                    <EmptyState title="ログ読み込み中" />
                  ) : reactions.length === 0 ? (
                    <EmptyState title="ログなし" />
                  ) : (
                    <div className="space-y-3">
                      {reactions.map((reaction) => (
                        <article
                          key={reaction.id}
                          className={cx(
                            "rounded-[1.1rem] border p-4",
                            isDark
                              ? "border-slate-800 bg-slate-950/50"
                              : "border-stone-200 bg-white/70",
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span
                              className={cx(
                                "rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-[0.16em]",
                                reaction.action_type === "react"
                                  ? isDark
                                    ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100"
                                    : "border-sky-200 bg-sky-50 text-sky-700"
                                  : isDark
                                    ? "border-slate-700 bg-slate-800 text-slate-300"
                                    : "border-stone-200 bg-stone-100 text-slate-600",
                              )}
                            >
                              {formatActionLabel(reaction.action_type)}
                            </span>
                            <span
                              className={cx(
                                "text-xs",
                                isDark ? "text-slate-400" : "text-slate-500",
                              )}
                            >
                              {formatDisplayTime(reaction.timestamp, timeMode)}
                            </span>
                          </div>

                          <p
                            className={cx(
                              "mt-3 text-sm leading-7",
                              isDark ? "text-slate-200" : "text-slate-700",
                            )}
                          >
                            {reaction.observation_summary}
                          </p>

                          <div
                            className={cx(
                              "mt-3 rounded-xl border px-3 py-2 text-sm",
                              isDark
                                ? "border-slate-800 bg-slate-900 text-slate-300"
                                : "border-stone-200 bg-stone-50 text-slate-600",
                            )}
                          >
                            {reaction.action_type === "react" &&
                            reaction.text.trim().length > 0
                              ? reaction.text
                              : "silent"}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          </div>
        ) : (
          <EmptyState title="取得できません" />
        )}
      </Panel>
    </section>
  );
}

function SettingsTab() {
  const settings = useSessionStore((state) => state.settings);
  const isSettingsPending = useSessionStore((state) => state.isSettingsPending);
  const setSettings = useSessionStore((state) => state.setSettings);
  const setSettingsPending = useSessionStore((state) => state.setSettingsPending);
  const setErrorMessage = useSessionStore((state) => state.setErrorMessage);
  const clearErrorMessage = useSessionStore((state) => state.clearErrorMessage);

  async function updateSetting<K extends keyof SettingsPatch>(
    patch: Pick<SettingsPatch, K>,
  ) {
    if (!settings) {
      return;
    }

    const previousSettings = settings;
    setSettings({ ...settings, ...patch });
    setSettingsPending(true);
    clearErrorMessage();

    try {
      setSettings(await backend.updateSettings(patch));
    } catch (error) {
      setSettings(previousSettings);
      setErrorMessage(getErrorMessage(error, "設定を更新できませんでした。"));
    } finally {
      setSettingsPending(false);
    }
  }

  return (
    <Panel>
      <div className="space-y-3">
        <SettingToggleRow
          checked={settings?.auto_select_summary ?? false}
          disabled={!settings || isSettingsPending}
          label="まとめを自動選択"
          onChange={(checked) =>
            void updateSetting({ auto_select_summary: checked })
          }
          pending={isSettingsPending}
        />
        <SettingToggleRow
          checked={settings?.confirm_before_stop ?? false}
          disabled={!settings || isSettingsPending}
          label="終了確認"
          onChange={(checked) =>
            void updateSetting({ confirm_before_stop: checked })
          }
          pending={isSettingsPending}
        />
        <SettingSelectRow
          disabled={!settings || isSettingsPending}
          label="時刻表示"
          onChange={(value) =>
            void updateSetting({
              time_display_mode: value as TimeDisplayMode,
            })
          }
          options={[
            { label: "絶対時刻", value: "absolute" },
            { label: "相対時刻", value: "relative" },
          ]}
          pending={isSettingsPending}
          value={settings?.time_display_mode ?? "absolute"}
        />
        <SettingSelectRow
          disabled={!settings || isSettingsPending}
          label="並び順"
          onChange={(value) =>
            void updateSetting({
              summaries_sort_order: value as SummariesSortOrder,
            })
          }
          options={[
            { label: "新しい順", value: "newest" },
            { label: "古い順", value: "oldest" },
          ]}
          pending={isSettingsPending}
          value={settings?.summaries_sort_order ?? "newest"}
        />
        <SettingSelectRow
          disabled={!settings || isSettingsPending}
          label="本文サイズ"
          onChange={(value) =>
            void updateSetting({
              summary_font_size: value as SummaryFontSize,
            })
          }
          options={[
            { label: "小", value: "small" },
            { label: "標準", value: "medium" },
            { label: "大", value: "large" },
          ]}
          pending={isSettingsPending}
          value={settings?.summary_font_size ?? "medium"}
        />
        <SettingSelectRow
          disabled={!settings || isSettingsPending}
          label="実行中の強調"
          onChange={(value) =>
            void updateSetting({
              active_session_emphasis: value as ActiveSessionEmphasis,
            })
          }
          options={[
            { label: "強め", value: "strong" },
            { label: "落ち着かせる", value: "calm" },
          ]}
          pending={isSettingsPending}
          value={settings?.active_session_emphasis ?? "strong"}
        />
        <SettingToggleRow
          checked={(settings?.theme_mode ?? "light") === "dark"}
          disabled={!settings || isSettingsPending}
          label="ダークモード"
          onChange={(checked) =>
            void updateSetting({ theme_mode: checked ? "dark" : "light" })
          }
          pending={isSettingsPending}
        />
      </div>
    </Panel>
  );
}

export function App() {
  const activeTab = useNavigationStore((state) => state.activeTab);
  const setActiveTab = useNavigationStore((state) => state.setActiveTab);

  const bootstrapState = useSessionStore((state) => state.bootstrapState);
  const errorMessage = useSessionStore((state) => state.errorMessage);
  const settings = useSessionStore((state) => state.settings);
  const selectedSummaryId = useSessionStore((state) => state.selectedSummaryId);
  const sessionState = useSessionStore((state) => state.sessionState);
  const summaries = useSessionStore((state) => state.summaries);

  const setBootstrapState = useSessionStore((state) => state.setBootstrapState);
  const setErrorMessage = useSessionStore((state) => state.setErrorMessage);
  const clearErrorMessage = useSessionStore((state) => state.clearErrorMessage);
  const setSessionState = useSessionStore((state) => state.setSessionState);
  const setAiPreview = useSessionStore((state) => state.setAiPreview);
  const setSettings = useSessionStore((state) => state.setSettings);
  const setSummaries = useSessionStore((state) => state.setSummaries);
  const setSelectedSummaryId = useSessionStore(
    (state) => state.setSelectedSummaryId,
  );
  const setSelectedSummary = useSessionStore((state) => state.setSelectedSummary);
  const setReactions = useSessionStore((state) => state.setReactions);
  const setSummariesLoading = useSessionStore(
    (state) => state.setSummariesLoading,
  );
  const setSummaryDetailLoading = useSessionStore(
    (state) => state.setSummaryDetailLoading,
  );
  const setReactionsLoading = useSessionStore((state) => state.setReactionsLoading);

  const isDark = isDarkTheme(settings?.theme_mode);

  const refreshSessionState = useEffectEvent(async () => {
    setSessionState(await backend.getSessionState());
  });

  const refreshSummaries = useEffectEvent(
    async (preferredSessionId?: string | null) => {
      setSummariesLoading(true);

      try {
        const list = await backend.listSummaries();
        setSummaries(list);

        const nextSelectedSummaryId =
          preferredSessionId &&
          list.some((summary) => summary.session_id === preferredSessionId)
            ? preferredSessionId
            : selectedSummaryId &&
                list.some((summary) => summary.session_id === selectedSummaryId)
              ? selectedSummaryId
              : list[0]?.session_id ?? null;

        setSelectedSummaryId(nextSelectedSummaryId);
      } finally {
        setSummariesLoading(false);
      }
    },
  );

  const shouldAutoSelectSummary = useEffectEvent(
    () => settings?.auto_select_summary ?? true,
  );

  const openSummariesTab = useEffectEvent(() => {
    if (activeTab !== "summaries") {
      setActiveTab("summaries");
    }
  });

  const bootstrapApp = useEffectEvent(async () => {
    setBootstrapState("loading");
    clearErrorMessage();

    try {
      const [nextSessionState, nextAiPreview, nextSettings, list] = await Promise.all([
        backend.getSessionState(),
        backend.getAiPreviewState(),
        backend.getSettings(),
        backend.listSummaries(),
      ]);

      setSessionState(nextSessionState);
      setAiPreview(nextAiPreview);
      setSettings(nextSettings);
      setSummaries(list);
      setSelectedSummaryId(list[0]?.session_id ?? null);
      setBootstrapState("ready");
    } catch (error) {
      setBootstrapState("error");
      setErrorMessage(getErrorMessage(error, "初期データの読み込みに失敗しました。"));
    }
  });

  useEffect(() => {
    let isActive = true;
    let unsubscribeSession = () => {};
    let unsubscribeSummary = () => {};
    let unsubscribePreview = () => {};

    void (async () => {
      await bootstrapApp();
      if (!isActive) {
        return;
      }

      const unsub1 = await backend.subscribeSessionStateChanged(async () => {
        try {
          await refreshSessionState();
        } catch (error) {
          setErrorMessage(
            getErrorMessage(error, "セッション状態の同期に失敗しました。"),
          );
        }
      });
      if (!isActive) {
        unsub1();
        return;
      }
      unsubscribeSession = unsub1;

      const unsubPreview = await backend.subscribeAiPreviewUpdated(async (event) => {
        setAiPreview(event);
      });
      if (!isActive) {
        unsubPreview();
        return;
      }
      unsubscribePreview = unsubPreview;

      const unsub2 = await backend.subscribeSummaryReady(async (event) => {
        try {
          await refreshSummaries(
            shouldAutoSelectSummary() ? event.session_id : undefined,
          );
          openSummariesTab();
        } catch (error) {
          setErrorMessage(
            getErrorMessage(error, "まとめ一覧の更新に失敗しました。"),
          );
        }
      });
      if (!isActive) {
        unsub2();
        return;
      }
      unsubscribeSummary = unsub2;
    })();

    return () => {
      isActive = false;
      unsubscribeSession();
      unsubscribePreview();
      unsubscribeSummary();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- useEffectEvent は安定参照であり依存配列不要
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!selectedSummaryId) {
      setSelectedSummary(null);
      setReactions([]);
      setSummaryDetailLoading(false);
      setReactionsLoading(false);
      return () => {
        isActive = false;
      };
    }

    setSummaryDetailLoading(true);
    setReactionsLoading(true);

    void Promise.all([
      backend.getSummary(selectedSummaryId),
      backend.listReactions(selectedSummaryId),
    ])
      .then(([summary, reactions]) => {
        if (!isActive) {
          return;
        }

        setSelectedSummary(summary);
        setReactions(reactions);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setSelectedSummary(null);
        setReactions([]);
        setErrorMessage(getErrorMessage(error, "まとめ詳細の取得に失敗しました。"));
      })
      .finally(() => {
        if (!isActive) {
          return;
        }

        setSummaryDetailLoading(false);
        setReactionsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [
    selectedSummaryId,
    setErrorMessage,
    setReactions,
    setReactionsLoading,
    setSelectedSummary,
    setSummaryDetailLoading,
  ]);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    const timerId = window.setTimeout(() => {
      clearErrorMessage();
    }, 4500);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [clearErrorMessage, errorMessage]);

  return (
    <div
      className={cx(
        "min-h-screen overflow-x-auto px-3 py-3 sm:px-4",
        isDark
          ? "bg-[linear-gradient(180deg,#020617_0%,#0f172a_100%)] text-slate-100"
          : "bg-[linear-gradient(180deg,#f5f7fb_0%,#eef2f7_100%)] text-slate-900",
      )}
    >
      <div className="mx-auto grid min-w-[60rem] max-w-7xl grid-cols-[13rem_minmax(0,1fr)] gap-4">
        <aside
          className={cx(
            "rounded-[1.5rem] border p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-4",
            isDark
              ? "border-slate-800 bg-slate-900"
              : "border-slate-200 bg-white",
          )}
        >
          <div
            className={cx(
              "flex items-start justify-between gap-3 border-b pb-4",
              isDark ? "border-slate-800" : "border-slate-100",
            )}
          >
            <div className="min-w-0">
              <div
                className={cx(
                  "text-lg font-semibold tracking-tight",
                  isDark ? "text-slate-100" : "text-slate-900",
                )}
              >
                halfeye
              </div>
              <div
                className={cx(
                  "mt-1 text-xs",
                  isDark ? "text-slate-400" : "text-slate-500",
                )}
              >
                {backendModeLabel}
              </div>
            </div>
            <StatusChip status={sessionState.status} />
          </div>

          <nav className="mt-4 grid gap-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  className={cx(
                    "rounded-[1rem] border px-4 py-3 text-left text-sm font-medium transition",
                    isActive
                      ? isDark
                        ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                        : "border-sky-200 bg-sky-50 text-sky-700 shadow-[0_8px_24px_rgba(14,165,233,0.08)]"
                      : isDark
                        ? "border-transparent bg-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/80"
                        : "border-transparent bg-slate-50 text-slate-600 hover:border-slate-200 hover:bg-white",
                  )}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-4 grid gap-2">
            <SidebarMetric label="状態" value={statusLabels[sessionState.status]} />
            <SidebarMetric label="まとめ" value={`${summaries.length}`} />
          </div>
        </aside>

        <section className="space-y-4">
          {errorMessage ? (
            <div
              className={cx(
                "flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border px-4 py-3 text-sm shadow-[0_10px_30px_rgba(244,63,94,0.12)]",
                isDark
                  ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
                  : "border-rose-200 bg-rose-50 text-rose-700",
              )}
            >
              <p className="min-w-0 flex-1">{errorMessage}</p>
              <button
                className={cx(
                  "rounded-lg border px-3 py-2 text-xs font-medium transition",
                  isDark
                    ? "border-rose-400/30 bg-slate-900 text-rose-100 hover:bg-slate-800"
                    : "border-rose-200 bg-white text-rose-700 hover:bg-rose-100",
                )}
                onClick={() => void bootstrapApp()}
                type="button"
              >
                再読み込み
              </button>
            </div>
          ) : null}

          <main>
            {bootstrapState === "loading" ? (
              <LoadingScreen />
            ) : activeTab === "session" ? (
              <SessionTab />
            ) : activeTab === "summaries" ? (
              <SummariesTab />
            ) : (
              <SettingsTab />
            )}
          </main>
        </section>
      </div>
    </div>
  );
}

function LoadingScreen() {
  const settings = useSessionStore((state) => state.settings);
  const isDark = isDarkTheme(settings?.theme_mode);

  return (
    <Panel className="flex min-h-[18rem] items-center justify-center">
      <div className="text-center">
        <div
          className={cx(
            "mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2",
            isDark
              ? "border-slate-700 border-t-cyan-300"
              : "border-slate-200 border-t-sky-500",
          )}
        />
        <div
          className={cx(
            "text-sm font-medium",
            isDark ? "text-slate-300" : "text-slate-600",
          )}
        >
          読み込み中
        </div>
      </div>
    </Panel>
  );
}

function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const settings = useSessionStore((state) => state.settings);
  const isDark = isDarkTheme(settings?.theme_mode);

  return (
    <section
      className={cx(
        "min-w-0 rounded-[1.5rem] border p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-5",
        isDark
          ? "border-slate-800 bg-slate-900"
          : "border-slate-200 bg-white",
        className,
      )}
    >
      {children}
    </section>
  );
}

function StatusChip({ status }: { status: SessionStatus }) {
  const settings = useSessionStore((state) => state.settings);
  const isDark = isDarkTheme(settings?.theme_mode);
  const emphasis = settings?.active_session_emphasis ?? "strong";

  return (
    <div
      className={cx(
        "inline-flex rounded-full border px-3 py-1 text-xs font-medium",
        getStatusTone(status, emphasis, isDark),
      )}
    >
      {statusLabels[status]}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  const settings = useSessionStore((state) => state.settings);
  const isDark = isDarkTheme(settings?.theme_mode);

  return (
    <div className={cx("rounded-[1.1rem] border p-4", tone)}>
      <div
        className={cx(
          "text-[0.68rem] uppercase tracking-[0.2em]",
          isDark ? "text-slate-400" : "text-slate-500",
        )}
      >
        {label}
      </div>
      <div className="mt-3 break-all text-sm font-medium leading-6 text-current">
        {value}
      </div>
    </div>
  );
}

function SidebarMetric({ label, value }: { label: string; value: string }) {
  const settings = useSessionStore((state) => state.settings);
  const isDark = isDarkTheme(settings?.theme_mode);

  return (
    <div
      className={cx(
        "rounded-[1rem] border px-4 py-3",
        isDark
          ? "border-slate-800 bg-slate-800/80"
          : "border-slate-200 bg-slate-50",
      )}
    >
      <div
        className={cx(
          "text-[0.68rem] uppercase tracking-[0.2em]",
          isDark ? "text-slate-400" : "text-slate-500",
        )}
      >
        {label}
      </div>
      <div
        className={cx(
          "mt-2 text-sm font-medium",
          isDark ? "text-slate-100" : "text-slate-900",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  intent,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  intent: "primary" | "secondary";
  onClick: () => void;
}) {
  const settings = useSessionStore((state) => state.settings);
  const isDark = isDarkTheme(settings?.theme_mode);

  return (
    <button
      className={cx(
        "rounded-xl border px-4 py-2.5 text-sm font-medium transition",
        disabled && "cursor-not-allowed opacity-45",
        !disabled &&
          intent === "primary" &&
          (isDark
            ? "border-cyan-300 bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            : "border-sky-700 bg-sky-700 text-white hover:bg-sky-600"),
        !disabled &&
          intent === "secondary" &&
          (isDark
            ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
            : "border-stone-300 bg-white text-slate-700 hover:bg-stone-100"),
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function SummaryListButton({
  fontSize,
  item,
  onSelect,
  selected,
  timeMode,
}: {
  fontSize: SummaryFontSize;
  item: SummaryListItem;
  onSelect: () => void;
  selected: boolean;
  timeMode: TimeDisplayMode;
}) {
  const settings = useSessionStore((state) => state.settings);
  const isDark = isDarkTheme(settings?.theme_mode);

  return (
    <button
      className={cx(
        "w-full rounded-[1rem] border px-4 py-3 text-left transition",
        selected
          ? isDark
            ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
            : "border-sky-200 bg-sky-50 text-sky-700 shadow-[0_8px_24px_rgba(14,165,233,0.08)]"
          : isDark
            ? "border-slate-700 bg-slate-800/70 text-slate-200 hover:border-slate-600 hover:bg-slate-800"
            : "border-stone-200 bg-stone-50/70 text-slate-700 hover:border-stone-300 hover:bg-white",
      )}
      onClick={onSelect}
      type="button"
    >
      <div
        className="break-all font-medium"
        style={summaryFontStyles[fontSize]}
      >
        {normalizeSummaryTitle(item.title, item.session_id)}
      </div>
      <div
        className={cx(
          "mt-1 break-all text-xs",
          isDark ? "text-slate-400" : "text-slate-500",
        )}
      >
        {item.session_id}
      </div>
      <div
        className={cx(
          "mt-2 text-xs",
          isDark ? "text-slate-400" : "text-slate-500",
        )}
      >
        {formatDisplayTime(item.created_at, timeMode)}
      </div>
    </button>
  );
}

function EmptyState({ title }: { title: string }) {
  const settings = useSessionStore((state) => state.settings);
  const isDark = isDarkTheme(settings?.theme_mode);

  return (
    <div
      className={cx(
        "rounded-[1.1rem] border border-dashed px-5 py-8 text-center",
        isDark
          ? "border-slate-700 bg-slate-800/70"
          : "border-stone-300 bg-stone-50/70",
      )}
    >
      <h3
        className={cx(
          "text-sm font-medium",
          isDark ? "text-slate-200" : "text-slate-900",
        )}
      >
        {title}
      </h3>
    </div>
  );
}

function SettingToggleRow({
  checked,
  disabled,
  label,
  onChange,
  pending,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  pending: boolean;
}) {
  const settings = useSessionStore((state) => state.settings);
  const isDark = isDarkTheme(settings?.theme_mode);

  return (
    <div
      className={cx(
        "flex flex-wrap items-center justify-between gap-4 rounded-[1.1rem] border p-4",
        isDark
          ? "border-slate-800 bg-slate-800/80"
          : "border-stone-200 bg-stone-50/80",
      )}
    >
      <div className="min-w-0">
        <div
          className={cx(
            "text-sm font-medium",
            isDark ? "text-slate-100" : "text-slate-900",
          )}
        >
          {label}
        </div>
        <div
          className={cx(
            "mt-1 text-xs",
            isDark ? "text-slate-400" : "text-slate-500",
          )}
        >
          {checked ? "ON" : "OFF"}
        </div>
      </div>

      <label
        className={cx(
          "inline-flex cursor-pointer items-center gap-3 rounded-full border px-4 py-2 text-sm",
          isDark
            ? "border-slate-700 bg-slate-900 text-slate-200"
            : "border-stone-200 bg-white text-slate-700",
        )}
      >
        <input
          checked={checked}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span
          className={cx(
            "relative inline-flex h-7 w-12 rounded-full border transition",
            checked
              ? "border-emerald-300 bg-emerald-400"
              : isDark
                ? "border-slate-600 bg-slate-700"
                : "border-stone-300 bg-stone-200",
          )}
        >
          <span
            className={cx(
              "absolute top-0.5 h-[1.375rem] w-[1.375rem] rounded-full bg-white shadow-sm transition",
              checked ? "left-6" : "left-0.5",
            )}
          />
        </span>
        <span>{pending ? "更新中" : "切替"}</span>
      </label>
    </div>
  );
}

function SettingSelectRow({
  disabled,
  label,
  onChange,
  options,
  pending,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  pending: boolean;
  value: string;
}) {
  const settings = useSessionStore((state) => state.settings);
  const isDark = isDarkTheme(settings?.theme_mode);

  return (
    <div
      className={cx(
        "flex flex-wrap items-center justify-between gap-4 rounded-[1.1rem] border p-4",
        isDark
          ? "border-slate-800 bg-slate-800/80"
          : "border-stone-200 bg-stone-50/80",
      )}
    >
      <div className="min-w-0">
        <div
          className={cx(
            "text-sm font-medium",
            isDark ? "text-slate-100" : "text-slate-900",
          )}
        >
          {label}
        </div>
        <div
          className={cx(
            "mt-1 text-xs",
            isDark ? "text-slate-400" : "text-slate-500",
          )}
        >
          {pending
            ? "更新中"
            : options.find((option) => option.value === value)?.label}
        </div>
      </div>

      <select
        className={cx(
          "rounded-xl border px-3 py-2 text-sm outline-none transition",
          isDark
            ? "border-slate-700 bg-slate-900 text-slate-100"
            : "border-stone-200 bg-white text-slate-700",
        )}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

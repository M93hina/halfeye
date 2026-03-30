import { useEffect, useEffectEvent, type ReactNode } from "react";
import { backend, backendModeLabel } from "./backend";
import type { NavigationTab } from "./store/navigationStore";
import { useNavigationStore } from "./store/navigationStore";
import { useSessionStore } from "./store/sessionStore";
import type { SessionStatus, SummaryListItem } from "./types/ipc";

const tabs: Array<{ id: NavigationTab; label: string; caption: string }> = [
  { id: "session", label: "セッション", caption: "今の状態と操作" },
  { id: "summaries", label: "まとめ", caption: "終わった後の記録" },
  { id: "settings", label: "設定", caption: "表示の調整" },
];

const statusCopy: Record<
  SessionStatus,
  { label: string; tone: string; title: string; body: string }
> = {
  idle: {
    label: "待機中",
    tone:
      "border-stone-200 bg-stone-100 text-stone-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]",
    title: "必要なときだけ、すぐ始められます",
    body: "セッションを始めると、その時間だけ AI が状況を追いかけます。",
  },
  active: {
    label: "実行中",
    tone:
      "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_10px_30px_rgba(16,185,129,0.12)]",
    title: "いまセッションを実行しています",
    body: "終わらせると、あとで見返せるまとめを自動で作ります。",
  },
  ending: {
    label: "終了処理中",
    tone:
      "border-amber-200 bg-amber-50 text-amber-700 shadow-[0_10px_30px_rgba(245,158,11,0.14)]",
    title: "まとめを作成しています",
    body: "少し待つと「まとめ」タブに結果が追加されます。",
  },
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "未開始";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRelativeTimestamp(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function SessionTab() {
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

  const status = statusCopy[sessionState.status];
  const canStart = sessionState.status === "idle" && !isSessionActionPending;
  const canStop = sessionState.status === "active" && !isSessionActionPending;

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
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.8fr)]">
      <Panel className="overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.9),transparent_72%)]" />
        <div className="relative flex flex-col gap-6">
          <div className="space-y-3">
            <StatusChip status={sessionState.status} />
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {status.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {status.body}
              </p>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-sky-100 bg-sky-50/70 p-5">
            <div className="text-[0.68rem] uppercase tracking-[0.24em] text-sky-700">
              いま必要な操作
            </div>
            {sessionState.status === "idle" ? (
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-900">
                    セッションを始める
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    AI にその場の状況を渡したいタイミングで開始します。
                  </p>
                </div>
                <ActionButton
                  disabled={!canStart}
                  intent="primary"
                  onClick={handleStart}
                >
                  {isSessionActionPending ? "開始中..." : "セッションを開始"}
                </ActionButton>
              </div>
            ) : sessionState.status === "active" ? (
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-900">
                    終わったら終了する
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    終了すると自動でまとめを作り、「まとめ」から見返せます。
                  </p>
                </div>
                <ActionButton
                  disabled={!canStop}
                  intent="primary"
                  onClick={handleStop}
                >
                  {isSessionActionPending ? "終了中..." : "セッションを終了"}
                </ActionButton>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-900">
                    いまは待つだけで大丈夫です
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    まとめが完成すると自動で一覧に反映されます。
                  </p>
                </div>
                <ActionButton disabled intent="secondary" onClick={() => {}}>
                  まとめを作成中
                </ActionButton>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="状態" value={status.label} tone={status.tone} />
            <MetricCard
              label="開始時刻"
              value={formatDateTime(sessionState.started_at)}
              tone="border-stone-200 bg-stone-50 text-slate-700"
            />
            <MetricCard
              label="セッションID"
              value={sessionState.session_id ?? "なし"}
              tone="border-stone-200 bg-stone-50 text-slate-700"
            />
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionEyebrow label="使い方" />
        <div className="mt-4 space-y-4">
          <GuideItem
            number="1"
            title="必要なときに開始"
            body="会話や作業、鑑賞など、AI に見てほしい時間だけセッションを始めます。"
          />
          <GuideItem
            number="2"
            title="終わったら終了"
            body="終わるまで動かし続ける必要はありません。区切りがついたら終了します。"
          />
          <GuideItem
            number="3"
            title="あとでまとめを見る"
            body="内容の振り返りは「まとめ」タブで確認できます。"
          />
        </div>
      </Panel>
    </section>
  );
}

function SummariesTab() {
  const summaries = useSessionStore((state) => state.summaries);
  const selectedSummaryId = useSessionStore((state) => state.selectedSummaryId);
  const selectedSummary = useSessionStore((state) => state.selectedSummary);
  const isSummariesLoading = useSessionStore((state) => state.isSummariesLoading);
  const isSummaryDetailLoading = useSessionStore(
    (state) => state.isSummaryDetailLoading,
  );
  const setSelectedSummaryId = useSessionStore(
    (state) => state.setSelectedSummaryId,
  );

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.2fr)]">
      <Panel>
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionEyebrow label="見返す" />
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              まとめ一覧
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              新しいものから順に表示します。
            </p>
          </div>
          <div className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs uppercase tracking-[0.24em] text-stone-600">
            {summaries.length} 件
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {isSummariesLoading && summaries.length === 0 ? (
            <EmptyState
              title="まとめを読み込み中です"
              body="これまでのセッション一覧を取得しています。"
            />
          ) : summaries.length === 0 ? (
            <EmptyState
              title="まだまとめはありません"
              body="セッションを終了すると、ここに自動で追加されます。"
            />
          ) : (
            summaries.map((summary) => (
              <SummaryListButton
                key={summary.session_id}
                item={summary}
                onSelect={() => setSelectedSummaryId(summary.session_id)}
                selected={summary.session_id === selectedSummaryId}
              />
            ))
          )}
        </div>
      </Panel>

      <Panel>
        <div className="space-y-4">
          <SectionEyebrow label="内容を見る" />
          {!selectedSummaryId ? (
            <EmptyState
              title="左からまとめを選んでください"
              body="選ぶと、ここに詳細テキストが表示されます。"
            />
          ) : isSummaryDetailLoading && !selectedSummary ? (
            <EmptyState
              title="詳細を読み込み中です"
              body="選択中セッションのまとめを取得しています。"
            />
          ) : selectedSummary ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                    {selectedSummary.session_id}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {formatDateTime(selectedSummary.created_at)}
                  </p>
                </div>
                <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs uppercase tracking-[0.24em] text-sky-700">
                  まとめ
                </div>
              </div>
              <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/90 p-5 text-sm leading-7 text-slate-700">
                <pre className="whitespace-pre-wrap font-sans">{selectedSummary.text}</pre>
              </article>
            </>
          ) : (
            <EmptyState
              title="詳細を表示できませんでした"
              body="別の項目を選ぶか、少し待ってからもう一度確認してください。"
            />
          )}
        </div>
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

  async function handleToggle(checked: boolean) {
    if (!settings) {
      return;
    }

    const previousSettings = settings;
    setSettings({ ...settings, reaction_enabled: checked });
    setSettingsPending(true);
    clearErrorMessage();

    try {
      setSettings(
        await backend.updateSettings({
          reaction_enabled: checked,
        }),
      );
    } catch (error) {
      setSettings(previousSettings);
      setErrorMessage(getErrorMessage(error, "設定を更新できませんでした。"));
    } finally {
      setSettingsPending(false);
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.8fr)]">
      <Panel>
        <SectionEyebrow label="必要な設定" />
        <div className="mt-4 space-y-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              リアクション表示
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              AI のリアクション表示をオンにするかどうかを切り替えます。迷ったら有効のままで使えます。
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-base font-semibold text-slate-900">
                いまの設定: {settings?.reaction_enabled ? "有効" : "無効"}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                変更するとすぐ保存されます。
              </p>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-slate-700">
              <input
                checked={settings?.reaction_enabled ?? false}
                className="sr-only"
                disabled={!settings || isSettingsPending}
                onChange={(event) => handleToggle(event.target.checked)}
                type="checkbox"
              />
              <span
                className={cx(
                  "relative inline-flex h-7 w-12 rounded-full border transition",
                  settings?.reaction_enabled
                    ? "border-emerald-300 bg-emerald-400"
                    : "border-stone-300 bg-stone-200",
                )}
              >
                <span
                  className={cx(
                    "absolute top-0.5 h-[1.375rem] w-[1.375rem] rounded-full bg-white shadow-sm transition",
                    settings?.reaction_enabled ? "left-6" : "left-0.5",
                  )}
                />
              </span>
              <span>{isSettingsPending ? "更新中..." : "切り替える"}</span>
            </label>
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionEyebrow label="補足" />
        <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
          <p>
            表示を一時的に減らしたいときは無効、AI の参加感を出したいときは有効がおすすめです。
          </p>
          <p>
            ほかの設定が増えても、ここから同じように操作できる形で追加していきます。
          </p>
        </div>
      </Panel>
    </section>
  );
}

export function App() {
  const activeTab = useNavigationStore((state) => state.activeTab);
  const setActiveTab = useNavigationStore((state) => state.setActiveTab);

  const bootstrapState = useSessionStore((state) => state.bootstrapState);
  const errorMessage = useSessionStore((state) => state.errorMessage);
  const selectedSummaryId = useSessionStore((state) => state.selectedSummaryId);
  const sessionState = useSessionStore((state) => state.sessionState);
  const summaries = useSessionStore((state) => state.summaries);

  const setBootstrapState = useSessionStore((state) => state.setBootstrapState);
  const setErrorMessage = useSessionStore((state) => state.setErrorMessage);
  const clearErrorMessage = useSessionStore((state) => state.clearErrorMessage);
  const setSessionState = useSessionStore((state) => state.setSessionState);
  const setSettings = useSessionStore((state) => state.setSettings);
  const setSummaries = useSessionStore((state) => state.setSummaries);
  const setSelectedSummaryId = useSessionStore(
    (state) => state.setSelectedSummaryId,
  );
  const setSelectedSummary = useSessionStore((state) => state.setSelectedSummary);
  const setSummariesLoading = useSessionStore(
    (state) => state.setSummariesLoading,
  );
  const setSummaryDetailLoading = useSessionStore(
    (state) => state.setSummaryDetailLoading,
  );

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

  const openSummariesTab = useEffectEvent(() => {
    if (activeTab !== "summaries") {
      setActiveTab("summaries");
    }
  });

  const bootstrapApp = useEffectEvent(async () => {
    setBootstrapState("loading");
    clearErrorMessage();

    try {
      const [nextSessionState, nextSettings, list] = await Promise.all([
        backend.getSessionState(),
        backend.getSettings(),
        backend.listSummaries(),
      ]);

      setSessionState(nextSessionState);
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

    void (async () => {
      await bootstrapApp();
      if (!isActive) {
        return;
      }

      const unsub1 = await backend.subscribeSessionStateChanged(
        async () => {
          try {
            await refreshSessionState();
          } catch (error) {
            setErrorMessage(
              getErrorMessage(error, "セッション状態の同期に失敗しました。"),
            );
          }
        },
      );
      if (!isActive) {
        unsub1();
        return;
      }
      unsubscribeSession = unsub1;

      const unsub2 = await backend.subscribeSummaryReady(async (event) => {
        try {
          await refreshSummaries(event.session_id);
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
      unsubscribeSummary();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- useEffectEvent は安定参照であり依存配列不要
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!selectedSummaryId) {
      setSelectedSummary(null);
      setSummaryDetailLoading(false);
      return () => {
        isActive = false;
      };
    }

    setSummaryDetailLoading(true);

    void backend
      .getSummary(selectedSummaryId)
      .then((summary) => {
        if (!isActive) {
          return;
        }

        setSelectedSummary(summary);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setSelectedSummary(null);
        setErrorMessage(getErrorMessage(error, "まとめ詳細の取得に失敗しました。"));
      })
      .finally(() => {
        if (!isActive) {
          return;
        }

        setSummaryDetailLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [
    selectedSummaryId,
    setErrorMessage,
    setSelectedSummary,
    setSummaryDetailLoading,
  ]);

  const headerStatus = statusCopy[sessionState.status];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.18),transparent_22%),linear-gradient(180deg,#fcfaf5_0%,#f8f0e3_42%,#f5eee7_100%)] px-4 py-5 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-7xl flex-col gap-4">
        <header className="rounded-[2rem] border border-stone-200/90 bg-white/85 px-6 py-5 shadow-[0_30px_80px_rgba(148,163,184,0.18)] backdrop-blur-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3 rounded-full border border-stone-200 bg-stone-100 px-4 py-2 text-[0.68rem] uppercase tracking-[0.3em] text-stone-600">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                halfeye
              </div>
              <div className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  使うときに迷わないホーム
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  まずは「セッション」を始めること、終わったら「まとめ」を見ること。この 2 つを中心に操作できるようにしています。
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                label="いまの状態"
                tone={headerStatus.tone}
                value={headerStatus.label}
              />
              <MetricCard
                label="まとめの数"
                tone="border-sky-200 bg-sky-50 text-sky-700"
                value={`${summaries.length} 件`}
              />
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-[0_14px_35px_rgba(251,113,133,0.14)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>{errorMessage}</p>
              <button
                className="rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.24em] text-rose-700 transition hover:bg-rose-100"
                onClick={() => void bootstrapApp()}
                type="button"
              >
                再読み込み
              </button>
            </div>
          </div>
        ) : null}

        <nav className="grid gap-3 rounded-[1.75rem] border border-stone-200/90 bg-white/75 p-2 backdrop-blur-xl sm:grid-cols-3">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                className={cx(
                  "rounded-[1.25rem] border px-4 py-4 text-left transition",
                  isActive
                    ? "border-sky-200 bg-sky-50 shadow-[0_12px_30px_rgba(14,165,233,0.12)]"
                    : "border-transparent bg-white/45 hover:border-stone-200 hover:bg-stone-50",
                )}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <div className="text-sm font-medium text-slate-900">{tab.label}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  {tab.caption}
                </div>
              </button>
            );
          })}
        </nav>

        <main className="flex-1">
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

        <p className="text-center text-xs text-stone-500">
          現在の連携モード: {backendModeLabel}
        </p>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <Panel className="flex min-h-[24rem] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 h-14 w-14 animate-spin rounded-full border border-sky-200 border-t-sky-500 bg-sky-50" />
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          画面を準備しています
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          セッション状態、まとめ一覧、設定を読み込んでいます。
        </p>
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
  return (
    <section
      className={cx(
        "relative rounded-[1.75rem] border border-stone-200/90 bg-white/82 p-5 shadow-[0_18px_50px_rgba(148,163,184,0.16)] backdrop-blur-xl sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

function SectionEyebrow({ label }: { label: string }) {
  return (
    <div className="text-[0.68rem] uppercase tracking-[0.28em] text-sky-700/80">
      {label}
    </div>
  );
}

function StatusChip({ status }: { status: SessionStatus }) {
  const copy = statusCopy[status];

  return (
    <div
      className={cx(
        "inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.24em]",
        copy.tone,
      )}
    >
      {copy.label}
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
  return (
    <div className={cx("rounded-[1.25rem] border p-4", tone)}>
      <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 break-all text-sm font-medium leading-6 text-current">
        {value}
      </div>
    </div>
  );
}

function GuideItem({
  body,
  number,
  title,
}: {
  body: string;
  number: string;
  title: string;
}) {
  return (
    <div className="flex gap-4 rounded-[1.3rem] border border-stone-200 bg-stone-50/80 p-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">
        {number}
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
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
  return (
    <button
      className={cx(
        "rounded-full border px-5 py-3 text-sm font-medium tracking-[0.02em] transition",
        disabled && "cursor-not-allowed opacity-45",
        !disabled &&
          intent === "primary" &&
          "border-sky-700 bg-sky-700 text-white hover:bg-sky-600",
        !disabled &&
          intent === "secondary" &&
          "border-stone-300 bg-white text-slate-700 hover:bg-stone-100",
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
  item,
  onSelect,
  selected,
}: {
  item: SummaryListItem;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      className={cx(
        "w-full rounded-[1.25rem] border px-4 py-4 text-left transition",
        selected
          ? "border-sky-200 bg-sky-50 shadow-[0_12px_28px_rgba(14,165,233,0.1)]"
          : "border-stone-200 bg-stone-50/70 hover:border-stone-300 hover:bg-white",
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-900">{item.session_id}</div>
          <div className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500">
            {formatRelativeTimestamp(item.created_at)}
          </div>
        </div>
        {selected ? (
          <span className="rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.24em] text-sky-700">
            表示中
          </span>
        ) : null}
      </div>
    </button>
  );
}

function EmptyState({
  body,
  title,
}: {
  body: string;
  title: string;
}) {
  return (
    <div className="rounded-[1.3rem] border border-dashed border-stone-300 bg-stone-50/70 px-5 py-8 text-center">
      <h3 className="text-base font-medium text-slate-900">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

# 開発分担

## 方針

- **セッション中の処理はすべてバックエンド（Person B）が担当する**
- **状態の権威はRust（バックエンド）が持つ**
- フロントエンド（Person A）はRustの状態を受け取って表示するだけ
- セッション開始時の入力はなし（シンプルなトリガーのみ）
- 初期版では音声キャプチャを扱わず、画面キャプチャを中心に実装する

---

## 分担

| Person A | Person B |
|---|---|
| メイン画面UI（React） | オーバーレイウィンドウ（Rust + React） |
| セッション開始/終了ボタン | 画面キャプチャ（xcap） |
| サマリー表示画面 | LLM呼び出し・リアクション生成 |
| 設定画面 | LLM呼び出し・リアクション生成 |
| | セッション状態管理（Rust） |
| | オーバーレイ表示制御 |
| | サマリー生成 |
| | 共有基盤整備（Tauriマルチウィンドウ、DB、IPC） |

オーバーレイはTauriのウィンドウ設定（`always_on_top` / `transparent`）も中身のReact UIもBが担当する。
リアクション表示はBの内部で完結し、AはReactionイベントを受け取らない。

---

## インターフェース（AとBの境界）

### Commands（A が呼ぶ / B が実装）

| コマンド | 引数 | 戻り値 | 説明 |
|---|---|---|---|
| `start_session` | なし | `session_id: String` | セッション開始 |
| `stop_session` | なし | なし | セッション終了 |
| `get_session_state` | なし | `SessionState` | 現在の状態取得（起動時に呼ぶ） |
| `list_summaries` | なし | `SummaryListItem[]` | サマリー一覧取得 |
| `get_summary` | `session_id: String` | `Summary` | サマリー詳細取得 |
| `get_settings` | なし | `Settings` | 設定取得 |
| `update_settings` | `SettingsPatch` | `Settings` | 設定更新 |

### Events（B が emit / A が受信）

| イベント | ペイロード | 説明 |
|---|---|---|
| `session_state_changed` | `{ status: "idle" \| "active" \| "ending" }` | 状態変化通知 |
| `summary_ready` | `{ session_id: string, text: string }` | サマリー完成通知 |

### SessionState 型

```ts
type SessionStatus = "idle" | "active" | "ending";

interface SessionState {
  status: SessionStatus;
  session_id: string | null;
  started_at: string | null; // ISO 8601
}

interface SummaryListItem {
  session_id: string;
  created_at: string; // ISO 8601
}

interface Summary {
  session_id: string;
  text: string;
  created_at: string; // ISO 8601
}

interface Settings {
  reaction_enabled: boolean;
}

interface SettingsPatch {
  reaction_enabled?: boolean;
}
```

---

## DBスキーマ

```sql
-- Aが表示に使う: sessions, summaries
-- Bが読み書きする: sessions, reactions, summaries, settings
-- AはB経由のコマンドで取得し、DBを直接読まない

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  status     TEXT NOT NULL
);

CREATE TABLE reactions (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  text       TEXT NOT NULL,
  timestamp  TEXT NOT NULL
);

CREATE TABLE summaries (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## 実装ガイドライン

- インターフェース定義は `src/types/ipc.ts` に置き、AとBで共有する
- AはRustの状態を `get_session_state` で起動時に取得し、以降は `session_state_changed` イベントで差分を受け取る
- サマリー一覧・詳細、設定はすべてB経由で取得・更新する
- BはAのUI実装に関与しない。メイン画面のコンポーネント・スタイルはAの管轄

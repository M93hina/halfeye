# halfeye

Tauri製デスクトップアプリ。スクリーンをAIが監視し、オーバーレイでリアクションを表示する。

## 構成

- フロントエンド: React + TypeScript (Vite)
- バックエンド: Rust (Tauri v2)
- LLM: Gemini API (`gemini-3-flash-preview` — このモデルは実在する)
- DB: SQLite (rusqlite) — アプリデータディレクトリに `halfeye.db`

## 主要モジュール（Rust）

| モジュール | 役割 |
|---|---|
| `capture` | スクリーンキャプチャループ（10秒間隔） |
| `reaction` | キャプチャ画像をGeminiに送りリアクション生成・保存 |
| `summary` | セッション終了時にリアクションログからサマリ生成 |
| `overlay` | 透過オーバーレイウィンドウ管理（400x100, 右上固定） |
| `session` | セッション開始/停止ロジック |
| `db` | SQLiteスキーマ初期化・マイグレーション |
| `state` | `AppState` — DBとセッション状態を保持 |
| `llm/gemini` | Gemini API クライアント |

## DBスキーマ

- `sessions`: id, started_at, ended_at, status
- `reactions`: id, session_id, text, timestamp
- `summaries`: id, session_id, text, created_at
- `settings`: key/value（`reaction_enabled` デフォルト `true`）

## イベント（Tauri emit）

- `session_state_changed` — セッション状態変化（idle/active/ending）
- `overlay-reaction` — リアクションテキスト
- `summary_ready` — サマリ生成完了

## 環境変数

- `GEMINI_API_KEY` — 必須。`.env` または環境変数で設定（`dotenvy` で読み込み）

## フロント

- メインUI: `src/main.tsx`
- オーバーレイUI: `src/overlay/` → `overlay.html` にバンドル
- IPC型定義: `src/types/ipc.ts`
- オーバーレイはリアクション受信から8秒後に自動非表示

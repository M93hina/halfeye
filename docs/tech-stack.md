# 技術スタック

## アプリフレームワーク

- **Tauri 2.x**（Rust）
- Win優先、将来的にMac対応

## フロントエンド

- **React + TypeScript + Vite**
- 状態管理: **Zustand**
- スタイリング: **Tailwind CSS**

## 画面表示

Tauriのマルチウィンドウ機能を利用。

- メイン画面 — セッション管理・設定・サマリー表示
- オーバーレイ画面 — `always_on_top` + `transparent` でリアクション表示

## 画面キャプチャ

- **xcap**（Rust クレート）
- セッション中に定期的にスクリーンショットを取得し、LLMに文脈として送信

## 音声キャプチャ

- 初期版では未対応
- 将来: **cpal**（Rust側）を候補とする
  - マイク入力 + システム音声（WASAPI Loopback）の両対応
  - 音声入力ソースは抽象化し、マイク / システム音声 / ミックスを切り替え可能にする

## 音声文字起こし

- 初期版では未対応
- 将来的に **OpenAI Speech-to-Text** やローカル推論（whisper-rs 等）を検討する

## LLM連携

- **OpenAI / Anthropic API**
- ストリーミング（SSE）でリアルタイムにリアクションを生成・表示

## データ保存

- **SQLite**（tauri-plugin-sql）
- セッション履歴、サマリー、ユーザー設定を保存

use crate::llm::gemini::GeminiClient;
use crate::llm::LlmClient;
use crate::state::AppState;
use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

pub async fn generate_summary(state: &AppState, session_id: &str) -> Result<(), String> {
    let api_key =
        std::env::var("GEMINI_API_KEY").map_err(|_| "GEMINI_API_KEY not set".to_string())?;
    let client = GeminiClient::new(api_key);

    let reactions_text = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT text, timestamp
                 FROM reactions
                 WHERE session_id = ?1 AND action_type = 'react'
                 ORDER BY timestamp",
            )
            .map_err(|e| e.to_string())?;
        let rows: Vec<String> = stmt
            .query_map(params![session_id], |row| {
                let text: String = row.get(0)?;
                let ts: String = row.get(1)?;
                Ok(format!("[{}] {}", ts, text))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows.join("\n")
    };

    if reactions_text.is_empty() {
        eprintln!(
            "No reactions found for session {}, skipping summary",
            session_id
        );
        return Ok(());
    }

    let prompt = format!(
        "以下はセッション中にAIがリアクションした内容のログです。このセッションの要約を生成してください。日本語で簡潔に。\n\n{}",
        reactions_text
    );

    let summary_text = client.generate_text(&prompt).await?;
    let summary_title =
        match generate_summary_title_with_client(&client, &summary_text, session_id).await {
            Ok(title) => title,
            Err(error) => {
                eprintln!(
                    "Summary title generation error for session {}: {}",
                    session_id, error
                );
                derive_summary_title(&summary_text, session_id)
            }
        };

    let summary_id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();

    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO summaries (id, session_id, title, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![summary_id, session_id, summary_title, summary_text, created_at],
        )
        .map_err(|e| e.to_string())?;
    }

    eprintln!("Summary generated for session {}", session_id);
    Ok(())
}

pub async fn generate_summary_title(
    summary_text: &str,
    session_id: &str,
) -> Result<String, String> {
    let api_key =
        std::env::var("GEMINI_API_KEY").map_err(|_| "GEMINI_API_KEY not set".to_string())?;
    let client = GeminiClient::new(api_key);
    generate_summary_title_with_client(&client, summary_text, session_id).await
}

async fn generate_summary_title_with_client(
    client: &impl LlmClient,
    summary_text: &str,
    session_id: &str,
) -> Result<String, String> {
    if summary_text.trim().is_empty() {
        return Ok(derive_summary_title(summary_text, session_id));
    }

    let prompt = format!(
        "以下はセッション要約です。この内容に基づいて、一覧表示向けの短いタイトルを日本語で1つだけ作ってください。\n\
         条件:\n\
         - 20文字前後、長くても40文字以内\n\
         - 本文の書き出しをそのまま切り取らない\n\
         - 要点やテーマが分かる自然なタイトルにする\n\
         - 余計な説明、記号、かぎ括弧、箇条書き、改行は不要\n\n{}",
        summary_text
    );

    let raw_title = client.generate_text(&prompt).await?;
    Ok(normalize_generated_title(&raw_title, session_id))
}

pub fn derive_summary_title(summary_text: &str, session_id: &str) -> String {
    let first_meaningful_line = summary_text
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or(session_id);

    normalize_generated_title(first_meaningful_line, session_id)
}

pub fn normalize_generated_title(title: &str, fallback: &str) -> String {
    let first_line = title.lines().next().unwrap_or_default().trim();
    let trimmed = first_line
        .trim_matches(|ch: char| matches!(ch, '"' | '\'' | '「' | '」' | '『' | '』'))
        .trim_start_matches([
            '-', '*', '・', '●', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', ' ',
        ])
        .trim();
    let normalized = if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    };
    normalized.chars().take(40).collect()
}

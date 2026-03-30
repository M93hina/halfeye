use crate::llm::gemini::GeminiClient;
use crate::llm::LlmClient;
use crate::state::AppState;
use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

pub async fn generate_summary(
    state: &AppState,
    session_id: &str,
) -> Result<(), String> {
    let api_key = std::env::var("GEMINI_API_KEY").map_err(|_| "GEMINI_API_KEY not set".to_string())?;
    let client = GeminiClient::new(api_key);

    let reactions_text = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT text, timestamp FROM reactions WHERE session_id = ?1 ORDER BY timestamp")
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
        eprintln!("No reactions found for session {}, skipping summary", session_id);
        return Ok(());
    }

    let prompt = format!(
        "以下はセッション中にAIがリアクションした内容のログです。このセッションの要約を生成してください。日本語で簡潔に。\n\n{}",
        reactions_text
    );

    let summary_text = client.generate_text(&prompt).await?;

    let summary_id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();

    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO summaries (id, session_id, text, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![summary_id, session_id, summary_text, created_at],
        )
        .map_err(|e| e.to_string())?;
    }

    eprintln!("Summary generated for session {}", session_id);
    Ok(())
}

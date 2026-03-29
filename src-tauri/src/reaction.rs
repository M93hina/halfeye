use crate::llm::gemini::GeminiClient;
use crate::llm::LlmClient;
use crate::state::AppState;
use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

pub async fn generate_and_save_reaction(
    state: &AppState,
    image_base64: &str,
) -> Result<(), String> {
    let api_key = std::env::var("GEMINI_API_KEY").map_err(|_| "GEMINI_API_KEY not set".to_string())?;
    let client = GeminiClient::new(api_key);

    let session_id = {
        let session = state.session_rx.borrow();
        session.session_id.clone().ok_or("No active session")?
    };

    let text = client.generate_reaction(image_base64, "").await?;

    let reaction_id = Uuid::new_v4().to_string();
    let timestamp = Utc::now().to_rfc3339();

    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO reactions (id, session_id, text, timestamp) VALUES (?1, ?2, ?3, ?4)",
            params![reaction_id, session_id, text, timestamp],
        )
        .map_err(|e| e.to_string())?;
    }

    eprintln!("Reaction generated: {}", text);
    Ok(())
}

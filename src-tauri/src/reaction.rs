use crate::llm::gemini::GeminiClient;
use crate::llm::{ActionType, LlmClient, ReactionContext};
use crate::state::AppState;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactionLog {
    pub id: String,
    pub session_id: String,
    pub timestamp: String,
    pub action_type: String,
    pub observation_summary: String,
    pub text: String,
}

pub async fn generate_and_save_reaction(
    state: &AppState,
    image_base64: &str,
) -> Result<Option<String>, String> {
    let api_key =
        std::env::var("GEMINI_API_KEY").map_err(|_| "GEMINI_API_KEY not set".to_string())?;
    let client = GeminiClient::new(api_key);

    let session_id = {
        let session = state.session_rx.borrow();
        session.session_id.clone().ok_or("No active session")?
    };

    let context = list_recent_reaction_contexts(state, &session_id, 5)?;
    let output = client.generate_reaction(image_base64, &context).await?;

    let reaction_id = Uuid::new_v4().to_string();
    let timestamp = Utc::now().to_rfc3339();
    let action_type = output.action_type.as_str().to_string();
    let reaction_text = output.reaction.unwrap_or_default();

    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO reactions (id, session_id, text, timestamp, observation_summary, action_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                reaction_id,
                session_id,
                reaction_text,
                timestamp,
                output.observation_summary,
                action_type,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    if action_type == ActionType::React.as_str() {
        eprintln!("Reaction generated: {}", reaction_text);
        return Ok(Some(reaction_text));
    }

    eprintln!("Reaction skipped: silent");
    Ok(None)
}

pub fn list_reactions(state: &AppState, session_id: &str) -> Result<Vec<ReactionLog>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, timestamp, action_type, observation_summary, text
             FROM reactions
             WHERE session_id = ?1
             ORDER BY timestamp DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(ReactionLog {
                id: row.get(0)?,
                session_id: row.get(1)?,
                timestamp: row.get(2)?,
                action_type: row.get(3)?,
                observation_summary: row.get(4)?,
                text: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }

    Ok(items)
}

fn list_recent_reaction_contexts(
    state: &AppState,
    session_id: &str,
    limit: usize,
) -> Result<Vec<ReactionContext>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT timestamp, action_type, observation_summary, text
             FROM reactions
             WHERE session_id = ?1
             ORDER BY timestamp DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![session_id, limit as i64], |row| {
            let action_type: String = row.get(1)?;
            let text: String = row.get(3)?;
            Ok(ReactionContext {
                timestamp: row.get(0)?,
                action_type: ActionType::from_db_value(&action_type).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        1,
                        rusqlite::types::Type::Text,
                        Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e)),
                    )
                })?,
                observation_summary: row.get(2)?,
                reaction: if text.trim().is_empty() {
                    None
                } else {
                    Some(text)
                },
            })
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }
    items.reverse();

    Ok(items)
}

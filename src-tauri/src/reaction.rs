use crate::audio::TranscriptChunk;
use crate::llm::gemini::GeminiClient;
use crate::llm::{ActionType, LlmClient, ReactionContext};
use crate::state::AppState;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
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
    transcript_chunks: &[TranscriptChunk],
) -> Result<Option<String>, String> {
    let api_key =
        std::env::var("GEMINI_API_KEY").map_err(|_| "GEMINI_API_KEY not set".to_string())?;
    let client = GeminiClient::new(api_key);

    let session_id = {
        let session = state.session_rx.borrow();
        session.session_id.clone().ok_or("No active session")?
    };

    let session_summary = load_session_summary(state, &session_id)?;
    eprintln!(
        "Context summary loaded for session {}: {}",
        session_id,
        session_summary
            .as_ref()
            .map(|summary| format!("present ({} chars)", summary.chars().count()))
            .unwrap_or_else(|| "missing".to_string())
    );
    let context = list_recent_reaction_contexts(state, &session_id, 5)?;
    let output = client
        .generate_reaction(
            image_base64,
            transcript_chunks,
            &context,
            session_summary.as_deref(),
        )
        .await?;

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

    if let Err(error) = maybe_refresh_session_summary(state, &client, &session_id).await {
        eprintln!("Context summary refresh error: {}", error);
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

fn load_session_summary(state: &AppState, session_id: &str) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let summary = conn
        .query_row(
            "SELECT context_summary FROM sessions WHERE id = ?1",
            params![session_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten()
        .and_then(|summary| {
            let trimmed = summary.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

    Ok(summary)
}

async fn maybe_refresh_session_summary(
    state: &AppState,
    client: &impl LlmClient,
    session_id: &str,
) -> Result<(), String> {
    let observation_summaries = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let reaction_count = count_session_reactions(&conn, session_id)?;
        if reaction_count == 0 || reaction_count % 5 != 0 {
            return Ok(());
        }

        list_session_observation_summaries(&conn, session_id)?
    };

    let prompt = build_context_summary_prompt(&observation_summaries)?;
    eprintln!(
        "Refreshing context summary for session {} from {} observation summaries",
        session_id,
        observation_summaries.len()
    );
    let context_summary = client.generate_text(&prompt).await?;
    let context_summary = context_summary.trim();
    if context_summary.is_empty() {
        return Err("generated context summary is empty".to_string());
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE sessions SET context_summary = ?1 WHERE id = ?2",
        params![context_summary, session_id],
    )
    .map_err(|e| e.to_string())?;
    eprintln!(
        "Context summary updated for session {} ({} chars)",
        session_id,
        context_summary.chars().count()
    );

    Ok(())
}

fn count_session_reactions(conn: &Connection, session_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM reactions WHERE session_id = ?1",
        params![session_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

fn list_session_observation_summaries(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT observation_summary
             FROM reactions
             WHERE session_id = ?1
             ORDER BY timestamp ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![session_id], |row| row.get::<_, Option<String>>(0))
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        let summary = row.map_err(|e| e.to_string())?;
        if let Some(summary) = summary {
            let trimmed = summary.trim();
            if !trimmed.is_empty() {
                items.push(trimmed.to_string());
            }
        }
    }

    Ok(items)
}

fn build_context_summary_prompt(observation_summaries: &[String]) -> Result<String, String> {
    if observation_summaries.is_empty() {
        return Err("no observation summaries available".to_string());
    }

    let timeline = observation_summaries
        .iter()
        .enumerate()
        .map(|(index, summary)| format!("{}. {}", index + 1, summary))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(format!(
        "以下は同一セッション中の観察ログです。重複を整理しつつ、ここまでの流れがわかるセッション概要を日本語で3文以内、200字以内で要約してください。\n\n{}",
        timeline
    ))
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

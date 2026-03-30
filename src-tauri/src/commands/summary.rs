use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryListItem {
    pub session_id: String,
    pub title: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Summary {
    pub session_id: String,
    pub title: String,
    pub text: String,
    pub created_at: String,
}

#[tauri::command]
pub fn list_summaries(state: State<'_, Arc<AppState>>) -> Result<Vec<SummaryListItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT session_id, title, created_at FROM summaries ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SummaryListItem {
                session_id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }
    Ok(items)
}

#[tauri::command]
pub fn get_summary(state: State<'_, Arc<AppState>>, session_id: String) -> Result<Summary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT session_id, title, text, created_at FROM summaries WHERE session_id = ?1",
        [&session_id],
        |row| {
            Ok(Summary {
                session_id: row.get(0)?,
                title: row.get(1)?,
                text: row.get(2)?,
                created_at: row.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_summary_title(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    title: String,
) -> Result<Summary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let normalized = normalize_summary_title(&title, &session_id);

    conn.execute(
        "UPDATE summaries SET title = ?1 WHERE session_id = ?2",
        [&normalized, &session_id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT session_id, title, text, created_at FROM summaries WHERE session_id = ?1",
        [&session_id],
        |row| {
            Ok(Summary {
                session_id: row.get(0)?,
                title: row.get(1)?,
                text: row.get(2)?,
                created_at: row.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

fn normalize_summary_title(title: &str, fallback: &str) -> String {
    let trimmed = title.trim();
    let normalized = if trimmed.is_empty() { fallback } else { trimmed };
    normalized.chars().take(40).collect()
}

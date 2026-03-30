use crate::state::AppState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub reaction_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsPatch {
    pub reaction_enabled: Option<bool>,
}

#[tauri::command]
pub fn get_settings(state: State<'_, Arc<AppState>>) -> Result<Settings, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let value: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'reaction_enabled'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(Settings {
        reaction_enabled: value == "true",
    })
}

#[tauri::command]
pub fn update_settings(
    state: State<'_, Arc<AppState>>,
    patch: SettingsPatch,
) -> Result<Settings, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    if let Some(reaction_enabled) = patch.reaction_enabled {
        conn.execute(
            "UPDATE settings SET value = ?1 WHERE key = 'reaction_enabled'",
            params![if reaction_enabled { "true" } else { "false" }],
        )
        .map_err(|e| e.to_string())?;
    }

    let value: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'reaction_enabled'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(Settings {
        reaction_enabled: value == "true",
    })
}

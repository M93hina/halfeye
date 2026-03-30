use crate::state::AppState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub auto_select_summary: bool,
    pub confirm_before_stop: bool,
    pub time_display_mode: String,
    pub summaries_sort_order: String,
    pub summary_font_size: String,
    pub active_session_emphasis: String,
    pub theme_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsPatch {
    pub auto_select_summary: Option<bool>,
    pub confirm_before_stop: Option<bool>,
    pub time_display_mode: Option<String>,
    pub summaries_sort_order: Option<String>,
    pub summary_font_size: Option<String>,
    pub active_session_emphasis: Option<String>,
    pub theme_mode: Option<String>,
}

fn read_bool_setting(
    conn: &rusqlite::Connection,
    key: &str,
    default: bool,
) -> Result<bool, String> {
    let value = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| {
            if default {
                "true".to_string()
            } else {
                "false".to_string()
            }
        });

    Ok(value == "true")
}

fn read_string_setting(
    conn: &rusqlite::Connection,
    key: &str,
    default: &str,
) -> Result<String, String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
        row.get::<_, String>(0)
    })
    .or_else(|_| Ok(default.to_string()))
    .map_err(|e: rusqlite::Error| e.to_string())
}

fn write_bool_setting(conn: &rusqlite::Connection, key: &str, value: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE settings SET value = ?1 WHERE key = ?2",
        params![if value { "true" } else { "false" }, key],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn write_string_setting(
    conn: &rusqlite::Connection,
    key: &str,
    value: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE settings SET value = ?1 WHERE key = ?2",
        params![value, key],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn load_settings(conn: &rusqlite::Connection) -> Result<Settings, String> {
    Ok(Settings {
        auto_select_summary: read_bool_setting(conn, "auto_select_summary", true)?,
        confirm_before_stop: read_bool_setting(conn, "confirm_before_stop", true)?,
        time_display_mode: read_string_setting(conn, "time_display_mode", "absolute")?,
        summaries_sort_order: read_string_setting(conn, "summaries_sort_order", "newest")?,
        summary_font_size: read_string_setting(conn, "summary_font_size", "medium")?,
        active_session_emphasis: read_string_setting(
            conn,
            "active_session_emphasis",
            "strong",
        )?,
        theme_mode: read_string_setting(conn, "theme_mode", "light")?,
    })
}

#[tauri::command]
pub fn get_settings(state: State<'_, Arc<AppState>>) -> Result<Settings, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    load_settings(&conn)
}

#[tauri::command]
pub fn update_settings(
    state: State<'_, Arc<AppState>>,
    patch: SettingsPatch,
) -> Result<Settings, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    if let Some(auto_select_summary) = patch.auto_select_summary {
        write_bool_setting(&conn, "auto_select_summary", auto_select_summary)?;
    }

    if let Some(confirm_before_stop) = patch.confirm_before_stop {
        write_bool_setting(&conn, "confirm_before_stop", confirm_before_stop)?;
    }

    if let Some(time_display_mode) = patch.time_display_mode {
        write_string_setting(&conn, "time_display_mode", &time_display_mode)?;
    }

    if let Some(summaries_sort_order) = patch.summaries_sort_order {
        write_string_setting(&conn, "summaries_sort_order", &summaries_sort_order)?;
    }

    if let Some(summary_font_size) = patch.summary_font_size {
        write_string_setting(&conn, "summary_font_size", &summary_font_size)?;
    }

    if let Some(active_session_emphasis) = patch.active_session_emphasis {
        write_string_setting(&conn, "active_session_emphasis", &active_session_emphasis)?;
    }

    if let Some(theme_mode) = patch.theme_mode {
        write_string_setting(&conn, "theme_mode", &theme_mode)?;
    }

    load_settings(&conn)
}

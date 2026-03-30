use rusqlite::{Connection, Result};
use std::path::Path;
use std::sync::Mutex;

pub fn init_db(app_data_dir: &Path) -> Result<Mutex<Connection>> {
    let db_path = app_data_dir.join("halfeye.db");
    let conn = Connection::open(&db_path)?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA foreign_keys=ON;",
    )?;
    migrate(&conn)?;
    Ok(Mutex::new(conn))
}

fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions (
            id         TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            ended_at   TEXT,
            status     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reactions (
            id         TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            text       TEXT NOT NULL,
            timestamp  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS summaries (
            id         TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            text       TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        DELETE FROM settings WHERE key IN ('reaction_enabled', 'auto_open_summary', 'compact_ui');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_select_summary', 'true');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('confirm_before_stop', 'true');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('time_display_mode', 'absolute');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('summaries_sort_order', 'newest');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('summary_font_size', 'medium');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('active_session_emphasis', 'strong');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('theme_mode', 'light');
        ",
    )?;
    Ok(())
}

use crate::capture;
use crate::overlay;
use crate::reaction;
use crate::state::{AppState, SessionState, SessionStatus};
use crate::summary;
use chrono::Utc;
use rusqlite::params;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub fn start_session(app: &AppHandle, state: &AppState) -> Result<String, String> {
    let current = state.session_rx.borrow().clone();
    if current.status != SessionStatus::Idle {
        return Err("Session already active".into());
    }

    let session_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();

    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO sessions (id, started_at, status) VALUES (?1, ?2, ?3)",
            params![session_id, started_at, "active"],
        )
        .map_err(|e| e.to_string())?;
    }

    let state_arc = state.self_arc.clone().ok_or("AppState Arc not set")?;
    let app_handle = app.clone();
    let handle = capture::start_capture_loop(10, move |image_data| {
        let state_arc = state_arc.clone();
        let app_handle = app_handle.clone();
        tokio::spawn(async move {
            match reaction::generate_and_save_reaction(&state_arc, &image_data).await {
                Ok(text) => {
                    let _ = app_handle.emit("overlay-reaction", serde_json::json!({ "text": text }));
                }
                Err(e) => eprintln!("Reaction error: {}", e),
            }
        });
    });
    {
        let mut capture_handle = state.capture_handle.lock().map_err(|e| e.to_string())?;
        *capture_handle = Some(handle);
    }

    overlay::create_overlay(app)?;

    let new_state = SessionState {
        status: SessionStatus::Active,
        session_id: Some(session_id.clone()),
        started_at: Some(started_at),
    };
    state
        .session_tx
        .send(new_state)
        .map_err(|e| e.to_string())?;

    app.emit(
        "session_state_changed",
        serde_json::json!({ "status": "active" }),
    )
    .map_err(|e| e.to_string())?;

    Ok(session_id)
}

pub fn stop_session(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let current = state.session_rx.borrow().clone();
    if current.status != SessionStatus::Active {
        return Err("No active session".into());
    }

    let session_id = current.session_id.clone().ok_or("No session id")?;
    let ended_at = Utc::now().to_rfc3339();

    if let Ok(mut handle_guard) = state.capture_handle.lock() {
        if let Some(handle) = handle_guard.take() {
            handle.cancel();
        }
    }

    let ending_state = SessionState {
        status: SessionStatus::Ending,
        ..current.clone()
    };
    state
        .session_tx
        .send(ending_state)
        .map_err(|e| e.to_string())?;
    app.emit(
        "session_state_changed",
        serde_json::json!({ "status": "ending" }),
    )
    .map_err(|e| e.to_string())?;

    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE sessions SET ended_at = ?1, status = 'idle' WHERE id = ?2",
            params![ended_at, session_id],
        )
        .map_err(|e| e.to_string())?;
    }

    let state_arc = state.self_arc.clone().ok_or("AppState Arc not set")?;
    let app_clone = app.clone();
    let sid = session_id.clone();
    tokio::spawn(async move {
        match summary::generate_summary(&state_arc, &sid).await {
            Ok(()) => {
                let text = {
                    let conn = state_arc.db.lock().ok();
                    conn.and_then(|c| {
                        c.query_row(
                            "SELECT text FROM summaries WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 1",
                            params![sid],
                            |row| row.get::<_, String>(0),
                        ).ok()
                    })
                };
                if let Some(text) = text {
                    let _ = app_clone.emit("summary_ready", serde_json::json!({ "session_id": sid, "text": text }));
                }
            }
            Err(e) => eprintln!("Summary generation error: {}", e),
        }
    });

    overlay::destroy_overlay(app)?;

    let idle_state = SessionState::default();
    state
        .session_tx
        .send(idle_state)
        .map_err(|e| e.to_string())?;
    app.emit(
        "session_state_changed",
        serde_json::json!({ "status": "idle" }),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn get_session_state(state: &AppState) -> SessionState {
    state.session_rx.borrow().clone()
}

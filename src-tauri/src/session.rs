use crate::capture;
use crate::overlay;
use crate::reaction;
use crate::state::{AiPreviewState, AppState, SessionState, SessionStatus};
use crate::summary;
use chrono::Utc;
use rusqlite::params;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const PREVIEW_INTERVAL_SECS: u64 = 2;
const LLM_INTERVAL_SECS: u64 = 10;
const PREVIEW_MAX_WIDTH: u32 = 480;

fn emit_ai_preview(app: &AppHandle, preview: &AiPreviewState) -> Result<(), String> {
    app.emit("ai_preview_updated", preview)
        .map_err(|e| e.to_string())
}

fn set_ai_preview(state: &AppState, preview: AiPreviewState) -> Result<(), String> {
    let mut guard = state.ai_preview.lock().map_err(|e| e.to_string())?;
    *guard = preview;
    Ok(())
}

fn clear_ai_preview(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let preview = AiPreviewState::default();
    set_ai_preview(state, preview.clone())?;
    emit_ai_preview(app, &preview)?;
    Ok(())
}

fn update_ai_preview(app: &AppHandle, state: &AppState, image_base64: &str) -> Result<(), String> {
    let preview = match capture::create_preview_frame(image_base64, PREVIEW_MAX_WIDTH) {
        Ok(frame) => AiPreviewState {
            image_base64: Some(frame.image_base64),
            mime_type: Some(frame.mime_type),
            updated_at: Some(Utc::now().to_rfc3339()),
            width: Some(frame.width),
            height: Some(frame.height),
        },
        Err(error) => {
            eprintln!("AI preview resize error: {}", error);
            AiPreviewState {
                image_base64: Some(image_base64.to_string()),
                mime_type: Some("image/jpeg".to_string()),
                updated_at: Some(Utc::now().to_rfc3339()),
                width: None,
                height: None,
            }
        }
    };

    set_ai_preview(state, preview.clone())?;
    emit_ai_preview(app, &preview)?;
    Ok(())
}

fn can_attempt_llm(state: &AppState) -> Result<bool, String> {
    let in_flight = state.llm_in_flight.lock().map_err(|e| e.to_string())?;
    if *in_flight {
        return Ok(false);
    }

    let last_started_at = state
        .last_llm_started_at
        .lock()
        .map_err(|e| e.to_string())?;
    let now = Instant::now();

    if last_started_at
        .as_ref()
        .map(|last| now.duration_since(*last) < Duration::from_secs(LLM_INTERVAL_SECS))
        .unwrap_or(false)
    {
        return Ok(false);
    }

    Ok(true)
}

fn try_begin_llm(state: &AppState, generation: u64) -> Result<bool, String> {
    let mut in_flight = state.llm_in_flight.lock().map_err(|e| e.to_string())?;
    if *in_flight || !is_current_generation(state, generation) {
        return Ok(false);
    }

    let mut last_started_at = state
        .last_llm_started_at
        .lock()
        .map_err(|e| e.to_string())?;
    let now = Instant::now();

    if last_started_at
        .as_ref()
        .map(|last| now.duration_since(*last) < Duration::from_secs(LLM_INTERVAL_SECS))
        .unwrap_or(false)
    {
        return Ok(false);
    }

    *last_started_at = Some(now);
    *in_flight = true;
    Ok(true)
}

fn finish_llm(state: &AppState) {
    if let Ok(mut in_flight) = state.llm_in_flight.lock() {
        *in_flight = false;
    }
}

fn reset_llm_state(state: &AppState) {
    if let Ok(mut last_started_at) = state.last_llm_started_at.lock() {
        *last_started_at = None;
    }
    if let Ok(mut in_flight) = state.llm_in_flight.lock() {
        *in_flight = false;
    }
}

fn reset_thumbnail(state: &AppState) -> Result<(), String> {
    let mut thumbnail = state
        .last_capture_thumbnail
        .lock()
        .map_err(|e| e.to_string())?;
    *thumbnail = None;
    Ok(())
}

fn update_thumbnail(
    state: &AppState,
    generation: u64,
    thumb: capture::CaptureThumb,
) -> Result<bool, String> {
    let mut thumbnail = state
        .last_capture_thumbnail
        .lock()
        .map_err(|e| e.to_string())?;
    if !is_current_generation(state, generation) {
        return Ok(false);
    }

    *thumbnail = Some(thumb);
    Ok(true)
}

fn screen_has_changed(
    state: &AppState,
    new_thumb: &capture::CaptureThumb,
) -> Result<bool, String> {
    let thumbnail = state
        .last_capture_thumbnail
        .lock()
        .map_err(|e| e.to_string())?;

    Ok(thumbnail
        .as_ref()
        .map(|prev| capture::has_significant_change(prev, new_thumb))
        .unwrap_or(true))
}

fn next_capture_generation(state: &AppState) -> u64 {
    state
        .capture_generation
        .fetch_add(1, Ordering::AcqRel)
        .wrapping_add(1)
}

fn is_current_generation(state: &AppState, generation: u64) -> bool {
    state.capture_generation.load(Ordering::Acquire) == generation
}

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

    let capture_generation = next_capture_generation(state);
    reset_llm_state(state);
    reset_thumbnail(state)?;
    clear_ai_preview(app, state)?;
    overlay::show_overlay(app).map_err(|e| e.to_string())?;

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

    let state_arc = state.self_arc.upgrade().ok_or("AppState Arc not set")?;
    let app_handle = app.clone();
    let handle = capture::start_capture_loop(PREVIEW_INTERVAL_SECS, move |image_data| {
        let state_arc = state_arc.clone();
        let app_handle = app_handle.clone();

        tokio::spawn(async move {
            if !is_current_generation(&state_arc, capture_generation) {
                return;
            }

            if let Err(error) = update_ai_preview(&app_handle, &state_arc, &image_data) {
                eprintln!("AI preview error: {}", error);
            }

            match can_attempt_llm(&state_arc) {
                Ok(false) => return,
                Ok(true) => {}
                Err(error) => {
                    eprintln!("LLM cadence error: {}", error);
                    return;
                }
            }

            let thumbnail = match capture::make_thumbnail(&image_data) {
                Ok(thumbnail) => thumbnail,
                Err(error) => {
                    eprintln!("Thumbnail generation error: {}", error);
                    return;
                }
            };

            if !is_current_generation(&state_arc, capture_generation) {
                return;
            }

            let changed = match screen_has_changed(&state_arc, &thumbnail) {
                Ok(changed) => changed,
                Err(error) => {
                    eprintln!("Thumbnail comparison error: {}", error);
                    return;
                }
            };

            if !changed {
                return;
            }

            match try_begin_llm(&state_arc, capture_generation) {
                Ok(true) => {}
                Ok(false) => return,
                Err(error) => {
                    eprintln!("LLM start error: {}", error);
                    return;
                }
            }

            state_arc.reaction_in_flight.store(true, Ordering::Release);
            if !is_current_generation(&state_arc, capture_generation) {
                state_arc.reaction_in_flight.store(false, Ordering::Release);
                finish_llm(&state_arc);
                return;
            }

            match update_thumbnail(&state_arc, capture_generation, thumbnail) {
                Ok(true) => {}
                Ok(false) => {
                    state_arc.reaction_in_flight.store(false, Ordering::Release);
                    finish_llm(&state_arc);
                    return;
                }
                Err(error) => {
                    eprintln!("Thumbnail update error: {}", error);
                    state_arc.reaction_in_flight.store(false, Ordering::Release);
                    finish_llm(&state_arc);
                    return;
                }
            }

            match reaction::generate_and_save_reaction(&state_arc, &image_data).await {
                Ok(Some(text)) => {
                    let _ = app_handle.emit("overlay-reaction", serde_json::json!({ "text": text }));
                }
                Ok(None) => {}
                Err(error) => eprintln!("Reaction error: {}", error),
            }
            state_arc.reaction_in_flight.store(false, Ordering::Release);
            finish_llm(&state_arc);
        });
    });
    {
        let mut capture_handle = state.capture_handle.lock().map_err(|e| e.to_string())?;
        *capture_handle = Some(handle);
    }

    Ok(session_id)
}

pub fn stop_session(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let current = state.session_rx.borrow().clone();
    if current.status != SessionStatus::Active {
        return Err("No active session".into());
    }

    let session_id = current.session_id.clone().ok_or("No session id")?;
    let ended_at = Utc::now().to_rfc3339();

    next_capture_generation(state);

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

    let state_arc = state.self_arc.upgrade().ok_or("AppState Arc not set")?;
    let app_clone = app.clone();
    let sid = session_id.clone();
    tokio::spawn(async move {
        while state_arc.reaction_in_flight.load(Ordering::Acquire) {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }

        match summary::generate_summary(&state_arc, &sid).await {
            Ok(()) => {
                let text = {
                    let conn = state_arc.db.lock().ok();
                    conn.and_then(|c| {
                        c.query_row(
                            "SELECT text FROM summaries WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 1",
                            params![sid],
                            |row| row.get::<_, String>(0),
                        )
                        .ok()
                    })
                };
                if let Some(text) = text {
                    let _ = app_clone.emit(
                        "summary_ready",
                        serde_json::json!({ "session_id": sid, "text": text }),
                    );
                }
            }
            Err(error) => eprintln!("Summary generation error: {}", error),
        }
    });

    overlay::hide_overlay(app).map_err(|e| e.to_string())?;
    reset_llm_state(state);
    reset_thumbnail(state)?;
    clear_ai_preview(app, state)?;

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

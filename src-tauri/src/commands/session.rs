use crate::session;
use crate::state::{AppState, SessionState, StartSessionOptions};
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn start_session(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    options: StartSessionOptions,
) -> Result<String, String> {
    session::start_session(&app, &state, options)
}

#[tauri::command]
pub async fn stop_session(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    session::stop_session(&app, &state)
}

#[tauri::command]
pub fn get_session_state(state: State<'_, Arc<AppState>>) -> SessionState {
    session::get_session_state(&state)
}

#[tauri::command]
pub fn get_audio_transcription_status(
    state: State<'_, Arc<AppState>>,
) -> crate::audio::AudioTranscriptionStatus {
    crate::audio::get_audio_transcription_status(&state)
}

use crate::session;
use crate::state::AppState;
use crate::state::SessionState;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn start_session(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<String, String> {
    session::start_session(&app, &state)
}

#[tauri::command]
pub fn stop_session(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    session::stop_session(&app, &state)
}

#[tauri::command]
pub fn get_session_state(state: State<'_, Arc<AppState>>) -> SessionState {
    session::get_session_state(&state)
}

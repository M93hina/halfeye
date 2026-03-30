use crate::state::{AiPreviewState, AppState};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn get_ai_preview_state(state: State<'_, Arc<AppState>>) -> Result<AiPreviewState, String> {
    let preview = state.ai_preview.lock().map_err(|e| e.to_string())?;
    Ok(preview.clone())
}

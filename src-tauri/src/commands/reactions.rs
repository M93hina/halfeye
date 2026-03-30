use crate::reaction::{self, ReactionLog};
use crate::state::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn list_reactions(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<Vec<ReactionLog>, String> {
    reaction::list_reactions(&state, &session_id)
}

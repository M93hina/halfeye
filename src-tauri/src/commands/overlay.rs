use crate::overlay;
use tauri::AppHandle;

#[tauri::command]
pub fn resize_overlay(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    overlay::resize_overlay(&app, width, height).map_err(|e| e.to_string())
}

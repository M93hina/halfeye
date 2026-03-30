use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn create_overlay(app: &AppHandle) -> Result<(), String> {
    let existing = app.get_webview_window("overlay");
    if existing.is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay/index.html".into()))
        .title("halfeye-overlay")
        .inner_size(400.0, 100.0)
        .position(100.0, 100.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn destroy_overlay(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

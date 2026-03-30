use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

const OVERLAY_LABEL: &str = "overlay";
const OVERLAY_WIDTH: i32 = 400;
const OVERLAY_HEIGHT: i32 = 100;
const OVERLAY_MARGIN: i32 = 24;

pub fn create_overlay(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        return Ok(());
    }

    let window =
        WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("overlay.html".into()))
        .title("halfeye-overlay")
        .inner_size(OVERLAY_WIDTH as f64, OVERLAY_HEIGHT as f64)
        .visible(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focusable(false)
        .build()?;

    window.set_ignore_cursor_events(true)?;

    Ok(())
}

pub fn show_overlay(app: &AppHandle) -> tauri::Result<()> {
    let window = app
        .get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| tauri::Error::AssetNotFound("overlay window not initialized".into()))?;

    if let Some(monitor) = window.primary_monitor()? {
        let work_area = monitor.work_area();
        let x = work_area.position.x + work_area.size.width as i32 - OVERLAY_WIDTH - OVERLAY_MARGIN;
        let y = work_area.position.y + OVERLAY_MARGIN;
        window.set_position(PhysicalPosition::new(x, y))?;
    }

    window.show()?;
    Ok(())
}

pub fn hide_overlay(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        window.hide()?;
    }

    Ok(())
}

use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

const OVERLAY_LABEL: &str = "overlay";
const OVERLAY_WIDTH: f64 = 320.0;
const OVERLAY_HEIGHT: f64 = 88.0;
const OVERLAY_MIN_WIDTH: f64 = 220.0;
const OVERLAY_MIN_HEIGHT: f64 = 56.0;
const OVERLAY_MARGIN: i32 = 24;

pub fn create_overlay(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        return Ok(());
    }

    let window =
        WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("overlay.html".into()))
            .title("halfeye-overlay")
            .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT)
            .visible(false)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .focusable(false)
            .build()?;

    window.set_ignore_cursor_events(true)?;
    apply_overlay_size(&window, OVERLAY_WIDTH, OVERLAY_HEIGHT)?;

    Ok(())
}

fn position_overlay_window(window: &WebviewWindow) -> tauri::Result<()> {
    if let Some(monitor) = window.primary_monitor()? {
        let work_area = monitor.work_area();
        let window_size = window.outer_size()?;
        let work_area_left = work_area.position.x;
        let work_area_top = work_area.position.y;
        let work_area_right = work_area_left + work_area.size.width as i32;
        let work_area_bottom = work_area_top + work_area.size.height as i32;

        // Use the actual outer window size so DPI scaling and platform chrome
        // do not push the overlay off-screen.
        let desired_x = work_area_right - window_size.width as i32 - OVERLAY_MARGIN;
        let desired_y = work_area_top + OVERLAY_MARGIN;
        let max_x = work_area_right - window_size.width as i32;
        let max_y = work_area_bottom - window_size.height as i32;

        let x = desired_x.clamp(work_area_left, max_x.max(work_area_left));
        let y = desired_y.clamp(work_area_top, max_y.max(work_area_top));
        window.set_position(PhysicalPosition::new(x, y))?;
    }

    Ok(())
}

fn apply_overlay_size(window: &WebviewWindow, width: f64, height: f64) -> tauri::Result<()> {
    let mut next_width = width.max(OVERLAY_MIN_WIDTH);
    let mut next_height = height.max(OVERLAY_MIN_HEIGHT);

    if let Some(monitor) = window.primary_monitor()? {
        let work_area = monitor.work_area();
        let max_width = (work_area.size.width as f64 - f64::from(OVERLAY_MARGIN * 2))
            .max(OVERLAY_MIN_WIDTH);
        let max_height = (work_area.size.height as f64 - f64::from(OVERLAY_MARGIN * 2))
            .max(OVERLAY_MIN_HEIGHT);
        next_width = next_width.min(max_width);
        next_height = next_height.min(max_height);
    }

    window.set_size(LogicalSize::new(next_width, next_height))?;
    position_overlay_window(window)?;
    Ok(())
}

pub fn show_overlay(app: &AppHandle) -> tauri::Result<()> {
    let window = app
        .get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| tauri::Error::AssetNotFound("overlay window not initialized".into()))?;

    apply_overlay_size(&window, OVERLAY_WIDTH, OVERLAY_HEIGHT)?;

    window.show()?;
    Ok(())
}

pub fn resize_overlay(app: &AppHandle, width: f64, height: f64) -> tauri::Result<()> {
    let window = app
        .get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| tauri::Error::AssetNotFound("overlay window not initialized".into()))?;

    apply_overlay_size(&window, width, height)
}

pub fn hide_overlay(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        window.hide()?;
    }

    Ok(())
}

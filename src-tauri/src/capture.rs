use base64::Engine;
use image::ImageFormat;
use std::io::Cursor;
use tokio_util::sync::CancellationToken;
use xcap::Monitor;

pub struct CaptureHandle {
    cancel: CancellationToken,
    #[allow(dead_code)]
    task: tokio::task::JoinHandle<()>,
}

impl CaptureHandle {
    pub fn cancel(&self) {
        self.cancel.cancel();
    }
}

pub fn capture_screenshot() -> Result<String, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    let monitor = monitors.first().ok_or("No monitor found")?;
    let image = monitor.capture_image().map_err(|e| e.to_string())?;

    let mut buf = Cursor::new(Vec::new());
    image
        .write_to(&mut buf, ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;
    let base64_str = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    Ok(base64_str)
}

pub fn start_capture_loop<F>(interval_secs: u64, on_capture: F) -> CaptureHandle
where
    F: Fn(String) + Send + 'static,
{
    let cancel = CancellationToken::new();
    let cancel_clone = cancel.clone();

    let task = tokio::spawn(async move {
        loop {
            if cancel_clone.is_cancelled() {
                break;
            }
            match capture_screenshot() {
                Ok(data) => on_capture(data),
                Err(e) => {
                    eprintln!("Capture error: {}", e);
                }
            }
            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_secs(interval_secs)) => {}
                _ = cancel_clone.cancelled() => break,
            }
        }
    });

    CaptureHandle { cancel, task }
}

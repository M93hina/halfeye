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
    let rgba_image = monitor.capture_image().map_err(|e| e.to_string())?;
    let rgb_image = image::DynamicImage::ImageRgba8(rgba_image).to_rgb8();

    let mut buf = Cursor::new(Vec::new());
    rgb_image
        .write_to(&mut buf, ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;
    let base64_str = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    Ok(base64_str)
}

pub fn start_capture_loop<F, G>(
    interval_secs: u64,
    should_capture: G,
    on_capture: F,
) -> CaptureHandle
where
    G: Fn() -> bool + Send + 'static,
    F: Fn(String) + Send + 'static,
{
    let cancel = CancellationToken::new();
    let cancel_clone = cancel.clone();

    let task = tokio::spawn(async move {
        loop {
            if cancel_clone.is_cancelled() {
                break;
            }
            if should_capture() {
                match capture_screenshot() {
                    Ok(data) => on_capture(data),
                    Err(e) => {
                        eprintln!("Capture error: {}", e);
                    }
                }
            } else {
                eprintln!("Capture skipped: reaction still in flight");
            }
            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_secs(interval_secs)) => {}
                _ = cancel_clone.cancelled() => break,
            }
        }
    });

    CaptureHandle { cancel, task }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_rgba_image_to_jpeg_after_dropping_alpha() {
        let rgba_image = image::RgbaImage::from_fn(2, 2, |_x, _y| image::Rgba([10, 20, 30, 128]));
        let rgb_image = image::DynamicImage::ImageRgba8(rgba_image).to_rgb8();

        let mut buf = Cursor::new(Vec::new());
        rgb_image
            .write_to(&mut buf, ImageFormat::Jpeg)
            .expect("RGBA image converted to RGB should encode as JPEG");

        assert!(
            !buf.into_inner().is_empty(),
            "JPEG buffer should not be empty"
        );
    }
}

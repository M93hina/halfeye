use base64::Engine;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat};
use std::io::Cursor;
use tokio_util::sync::CancellationToken;
use xcap::Monitor;

pub struct PreviewFrame {
    pub image_base64: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
}

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
    let image = DynamicImage::ImageRgba8(rgba_image).to_rgb8();

    let mut buf = Cursor::new(Vec::new());
    image
        .write_to(&mut buf, ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;
    let base64_str = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    Ok(base64_str)
}

pub fn create_preview_frame(image_base64: &str, max_width: u32) -> Result<PreviewFrame, String> {
    let image_bytes = base64::engine::general_purpose::STANDARD
        .decode(image_base64)
        .map_err(|e| e.to_string())?;
    let image = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
    let resized = if image.width() > max_width {
        image.resize(max_width, max_width, FilterType::Triangle)
    } else {
        image
    };

    let (width, height) = resized.dimensions();
    let mut buffer = Vec::new();
    {
        let mut encoder = JpegEncoder::new_with_quality(&mut buffer, 60);
        encoder.encode_image(&resized).map_err(|e| e.to_string())?;
    }

    Ok(PreviewFrame {
        image_base64: base64::engine::general_purpose::STANDARD.encode(buffer),
        mime_type: "image/jpeg".to_string(),
        width,
        height,
    })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_rgba_image_to_jpeg_after_dropping_alpha() {
        let rgba_image =
            image::RgbaImage::from_fn(2, 2, |_x, _y| image::Rgba([10, 20, 30, 128]));
        let rgb_image = DynamicImage::ImageRgba8(rgba_image).to_rgb8();

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


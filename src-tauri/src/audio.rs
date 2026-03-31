use crate::state::AppState;
use chrono::{Duration as ChronoDuration, Utc};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig, SupportedStreamConfig};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const DEFAULT_MODEL_FILE: &str = "ggml-small.bin";
const TARGET_SAMPLE_RATE_HZ: usize = 16_000;
const MIN_BUFFER_DURATION_SECS: usize = 4;
const MAX_BUFFER_DURATION_SECS: usize = 12;
const LOOP_SLEEP_MILLIS: u64 = 1_200;
const RMS_THRESHOLD: f32 = 0.012;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TranscriptSource {
    Microphone,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptChunk {
    pub source: TranscriptSource,
    pub started_at: String,
    pub ended_at: String,
    pub text: String,
    pub speaker_turn: bool,
    pub consumed_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AudioRuntimeState {
    pub transcription_enabled: bool,
    pub model_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioTranscriptionStatus {
    pub available: bool,
    pub model_path: String,
    pub reason: Option<String>,
}

impl AudioRuntimeState {
    pub fn new(model_path: PathBuf) -> Self {
        Self {
            transcription_enabled: false,
            model_path,
        }
    }
}

pub struct TranscriptionWorkerHandle {
    cancel_token: CancellationToken,
    join_handle: Option<JoinHandle<()>>,
}

impl TranscriptionWorkerHandle {
    pub fn new(cancel_token: CancellationToken, join_handle: JoinHandle<()>) -> Self {
        Self {
            cancel_token,
            join_handle: Some(join_handle),
        }
    }

    pub fn cancel(mut self) {
        self.cancel_token.cancel();

        if let Some(join_handle) = self.join_handle.take() {
            let _ = join_handle.join();
        }
    }
}

impl Drop for TranscriptionWorkerHandle {
    fn drop(&mut self) {
        self.cancel_token.cancel();

        if let Some(join_handle) = self.join_handle.take() {
            let _ = join_handle.join();
        }
    }
}

pub fn resolve_model_path(app_data_dir: &Path) -> PathBuf {
    std::env::var("WHISPER_MODEL_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| app_data_dir.join("models").join(DEFAULT_MODEL_FILE))
}

pub fn model_setup_hint(state: &AppState) -> String {
    let model_path = state
        .audio_runtime
        .lock()
        .map(|runtime| runtime.model_path.clone())
        .unwrap_or_else(|_| PathBuf::from(DEFAULT_MODEL_FILE));

    format!(
        "Whisper model not found. Set WHISPER_MODEL_PATH or place {} at {}.",
        DEFAULT_MODEL_FILE,
        model_path.display()
    )
}

pub fn ensure_model_available(state: &AppState) -> Result<(), String> {
    let model_path = state
        .audio_runtime
        .lock()
        .map_err(|e| e.to_string())?
        .model_path
        .clone();

    if model_path.is_file() {
        Ok(())
    } else {
        Err(model_setup_hint(state))
    }
}

pub fn get_audio_transcription_status(state: &AppState) -> AudioTranscriptionStatus {
    let model_path = state
        .audio_runtime
        .lock()
        .map(|runtime| runtime.model_path.clone())
        .unwrap_or_else(|_| PathBuf::from(DEFAULT_MODEL_FILE));

    if model_path.is_file() {
        AudioTranscriptionStatus {
            available: true,
            model_path: model_path.display().to_string(),
            reason: None,
        }
    } else {
        AudioTranscriptionStatus {
            available: false,
            model_path: model_path.display().to_string(),
            reason: Some(format!(
                "{} が見つかりません。`WHISPER_MODEL_PATH` を設定するか、この場所へ配置してください。",
                model_path.display()
            )),
        }
    }
}

pub fn clear_transcript_chunks(state: &AppState) -> Result<(), String> {
    state
        .transcript_chunks
        .lock()
        .map_err(|e| e.to_string())?
        .clear();
    Ok(())
}

pub fn take_pending_transcript_chunks(state: &AppState) -> Result<Vec<TranscriptChunk>, String> {
    let mut guard = state.transcript_chunks.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let mut chunks = std::mem::take(&mut *guard);

    for chunk in &mut chunks {
        chunk.consumed_at = Some(now.clone());
    }

    Ok(chunks)
}

pub fn start_transcription_worker(state: &AppState) -> Result<TranscriptionWorkerHandle, String> {
    ensure_model_available(state)?;

    let state_arc = state.self_arc.upgrade().ok_or("AppState Arc not set")?;
    let cancel_token = CancellationToken::new();
    let thread_cancel_token = cancel_token.clone();
    let (startup_tx, startup_rx) = mpsc::channel::<Result<(), String>>();

    let join_handle = thread::Builder::new()
        .name("halfeye-audio-transcription".to_string())
        .spawn(move || {
            if let Err(error) = run_transcription_loop(state_arc, thread_cancel_token, startup_tx) {
                eprintln!("Audio transcription worker stopped: {}", error);
            }
        })
        .map_err(|e| e.to_string())?;

    match startup_rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(())) => Ok(TranscriptionWorkerHandle::new(cancel_token, join_handle)),
        Ok(Err(error)) => {
            cancel_token.cancel();
            let _ = join_handle.join();
            Err(error)
        }
        Err(error) => {
            cancel_token.cancel();
            let _ = join_handle.join();
            Err(format!(
                "Failed to start audio transcription worker: {}",
                error
            ))
        }
    }
}

fn run_transcription_loop(
    state: Arc<AppState>,
    cancel_token: CancellationToken,
    startup_tx: Sender<Result<(), String>>,
) -> Result<(), String> {
    let init_result = (|| -> Result<_, String> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or("No microphone input device is available.")?;
        let supported_config = device.default_input_config().map_err(|e| e.to_string())?;
        let stream_config = supported_config.config();
        let sample_rate_hz = stream_config.sample_rate.0 as usize;
        let channels = stream_config.channels as usize;
        let shared_samples = Arc::new(Mutex::new(Vec::<f32>::new()));

        let stream = build_input_stream(
            &device,
            &supported_config,
            &stream_config,
            channels,
            shared_samples.clone(),
        )?;

        let model_path = state
            .audio_runtime
            .lock()
            .map_err(|e| e.to_string())?
            .model_path
            .clone();
        let model_path_str = model_path
            .to_str()
            .ok_or("Whisper model path contains invalid UTF-8.")?;

        let context =
            WhisperContext::new_with_params(model_path_str, WhisperContextParameters::default())
                .map_err(|e| e.to_string())?;
        let whisper_state = context.create_state().map_err(|e| e.to_string())?;

        Ok((
            sample_rate_hz,
            shared_samples,
            stream,
            context,
            whisper_state,
        ))
    })();

    let (sample_rate_hz, shared_samples, stream, _context, mut whisper_state) = match init_result {
        Ok(value) => value,
        Err(error) => {
            let _ = startup_tx.send(Err(error.clone()));
            return Err(error);
        }
    };

    if let Err(error) = stream.play().map_err(|e| e.to_string()) {
        let _ = startup_tx.send(Err(error.clone()));
        return Err(error);
    }
    let _ = startup_tx.send(Ok(()));

    while !cancel_token.is_cancelled() {
        thread::sleep(Duration::from_millis(LOOP_SLEEP_MILLIS));

        let min_buffer_samples = sample_rate_hz * MIN_BUFFER_DURATION_SECS;
        let maybe_pcm = {
            let mut guard = shared_samples.lock().map_err(|e| e.to_string())?;
            if guard.len() < min_buffer_samples {
                None
            } else {
                let max_buffer_samples = sample_rate_hz * MAX_BUFFER_DURATION_SECS;
                let take_len = guard.len().min(max_buffer_samples);
                Some(guard.drain(..take_len).collect::<Vec<f32>>())
            }
        };

        let Some(pcm) = maybe_pcm else {
            continue;
        };

        let pcm = resample_to_16khz(&pcm, sample_rate_hz);
        if pcm.is_empty() || !contains_speech(&pcm) {
            continue;
        }

        let chunks = transcribe_audio(&mut whisper_state, &pcm)?;
        if chunks.is_empty() {
            continue;
        }

        let mut transcript_guard = state.transcript_chunks.lock().map_err(|e| e.to_string())?;
        transcript_guard.extend(chunks);
    }

    drop(stream);
    Ok(())
}

fn build_input_stream(
    device: &cpal::Device,
    supported_config: &SupportedStreamConfig,
    stream_config: &StreamConfig,
    channels: usize,
    shared_samples: Arc<Mutex<Vec<f32>>>,
) -> Result<Stream, String> {
    let error_callback = |error| {
        eprintln!("Audio input stream error: {}", error);
    };

    match supported_config.sample_format() {
        SampleFormat::F32 => {
            let buffer = shared_samples.clone();
            device
                .build_input_stream(
                    stream_config,
                    move |data: &[f32], _| append_samples(&buffer, data, channels),
                    error_callback,
                    None,
                )
                .map_err(|e| e.to_string())
        }
        SampleFormat::I16 => {
            let buffer = shared_samples.clone();
            device
                .build_input_stream(
                    stream_config,
                    move |data: &[i16], _| {
                        let converted = data
                            .iter()
                            .map(|sample| *sample as f32 / i16::MAX as f32)
                            .collect::<Vec<f32>>();
                        append_samples(&buffer, &converted, channels);
                    },
                    error_callback,
                    None,
                )
                .map_err(|e| e.to_string())
        }
        SampleFormat::U16 => {
            let buffer = shared_samples.clone();
            device
                .build_input_stream(
                    stream_config,
                    move |data: &[u16], _| {
                        let converted = data
                            .iter()
                            .map(|sample| (*sample as f32 / u16::MAX as f32) * 2.0 - 1.0)
                            .collect::<Vec<f32>>();
                        append_samples(&buffer, &converted, channels);
                    },
                    error_callback,
                    None,
                )
                .map_err(|e| e.to_string())
        }
        other => Err(format!("Unsupported audio sample format: {:?}", other)),
    }
}

fn append_samples(shared_samples: &Arc<Mutex<Vec<f32>>>, data: &[f32], channels: usize) {
    if channels == 0 {
        return;
    }

    if let Ok(mut guard) = shared_samples.lock() {
        for frame in data.chunks(channels) {
            let sum: f32 = frame.iter().copied().sum();
            guard.push(sum / channels as f32);
        }
    }
}

fn resample_to_16khz(samples: &[f32], source_rate_hz: usize) -> Vec<f32> {
    if source_rate_hz == TARGET_SAMPLE_RATE_HZ {
        return samples.to_vec();
    }

    let ratio = source_rate_hz as f64 / TARGET_SAMPLE_RATE_HZ as f64;
    let target_len = ((samples.len() as f64) / ratio).floor() as usize;
    let mut resampled = Vec::with_capacity(target_len);

    for index in 0..target_len {
        let source_index = (index as f64 * ratio).floor() as usize;
        if let Some(sample) = samples.get(source_index) {
            resampled.push(*sample);
        }
    }

    resampled
}

fn contains_speech(samples: &[f32]) -> bool {
    if samples.is_empty() {
        return false;
    }

    let rms =
        (samples.iter().map(|sample| sample * sample).sum::<f32>() / samples.len() as f32).sqrt();

    rms >= RMS_THRESHOLD
}

fn transcribe_audio(
    whisper_state: &mut whisper_rs::WhisperState,
    pcm: &[f32],
) -> Result<Vec<TranscriptChunk>, String> {
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(4);
    params.set_language(Some("ja"));
    params.set_translate(false);
    params.set_no_context(true);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    whisper_state.full(params, pcm).map_err(|e| e.to_string())?;

    let chunk_duration_ms = ((pcm.len() as i64) * 1000) / TARGET_SAMPLE_RATE_HZ as i64;
    let chunk_base = Utc::now() - ChronoDuration::milliseconds(chunk_duration_ms);
    let mut chunks = Vec::new();

    for segment in whisper_state.as_iter() {
        let text = segment
            .to_str_lossy()
            .map_err(|e| e.to_string())?
            .trim()
            .to_string();

        if text.is_empty() {
            continue;
        }

        let started_at = chunk_base + ChronoDuration::milliseconds(segment.start_timestamp() * 10);
        let ended_at = chunk_base + ChronoDuration::milliseconds(segment.end_timestamp() * 10);

        chunks.push(TranscriptChunk {
            source: TranscriptSource::Microphone,
            started_at: started_at.to_rfc3339(),
            ended_at: ended_at.to_rfc3339(),
            text,
            speaker_turn: segment.next_segment_speaker_turn(),
            consumed_at: None,
        });
    }

    Ok(chunks)
}

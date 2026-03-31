use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex, Weak};
use std::time::Instant;
use tokio::sync::watch;

use crate::audio::{AudioRuntimeState, TranscriptChunk, TranscriptionWorkerHandle};
use crate::capture::{CaptureHandle, CaptureThumb};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Idle,
    Active,
    Ending,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionState {
    pub status: SessionStatus,
    pub session_id: Option<String>,
    pub started_at: Option<String>,
    pub audio_transcription_enabled: bool,
}

impl Default for SessionState {
    fn default() -> Self {
        Self {
            status: SessionStatus::Idle,
            session_id: None,
            started_at: None,
            audio_transcription_enabled: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartSessionOptions {
    pub audio_transcription: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiPreviewState {
    pub image_base64: Option<String>,
    pub mime_type: Option<String>,
    pub updated_at: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

impl Default for AiPreviewState {
    fn default() -> Self {
        Self {
            image_base64: None,
            mime_type: None,
            updated_at: None,
            width: None,
            height: None,
        }
    }
}

pub struct AppState {
    pub db: Mutex<Connection>,
    pub session_tx: watch::Sender<SessionState>,
    pub session_rx: watch::Receiver<SessionState>,
    pub ai_preview: Mutex<AiPreviewState>,
    pub capture_handle: Mutex<Option<CaptureHandle>>,
    pub audio_handle: Mutex<Option<TranscriptionWorkerHandle>>,
    pub transcript_chunks: Mutex<Vec<TranscriptChunk>>,
    pub audio_runtime: Mutex<AudioRuntimeState>,
    pub capture_image_buffer: Mutex<VecDeque<String>>,
    pub last_capture_thumbnail: Mutex<Option<CaptureThumb>>,
    pub capture_generation: AtomicU64,
    pub last_llm_started_at: Mutex<Option<Instant>>,
    pub llm_in_flight: Mutex<bool>,
    pub reaction_in_flight: AtomicBool,
    pub self_arc: Weak<AppState>,
}

impl AppState {
    pub fn new(db: Mutex<Connection>, app_data_dir: PathBuf) -> Arc<Self> {
        let (session_tx, session_rx) = watch::channel(SessionState::default());
        let audio_runtime = AudioRuntimeState::new(crate::audio::resolve_model_path(&app_data_dir));
        Arc::new_cyclic(|weak| Self {
            db,
            session_tx,
            session_rx,
            ai_preview: Mutex::new(AiPreviewState::default()),
            capture_handle: Mutex::new(None),
            audio_handle: Mutex::new(None),
            transcript_chunks: Mutex::new(Vec::new()),
            audio_runtime: Mutex::new(audio_runtime),
            capture_image_buffer: Mutex::new(VecDeque::with_capacity(3)),
            last_capture_thumbnail: Mutex::new(None),
            capture_generation: AtomicU64::new(0),
            last_llm_started_at: Mutex::new(None),
            llm_in_flight: Mutex::new(false),
            reaction_in_flight: AtomicBool::new(false),
            self_arc: weak.clone(),
        })
    }
}

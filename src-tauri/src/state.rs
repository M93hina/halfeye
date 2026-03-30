use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, Weak};
use std::time::Instant;
use tokio::sync::watch;

use crate::capture::CaptureHandle;

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
}

impl Default for SessionState {
    fn default() -> Self {
        Self {
            status: SessionStatus::Idle,
            session_id: None,
            started_at: None,
        }
    }
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
    pub last_llm_started_at: Mutex<Option<Instant>>,
    pub llm_in_flight: Mutex<bool>,
    pub self_arc: Weak<AppState>,
}

impl AppState {
    pub fn new(db: Mutex<Connection>) -> Arc<Self> {
        let (session_tx, session_rx) = watch::channel(SessionState::default());
        Arc::new_cyclic(|weak| Self {
            db,
            session_tx,
            session_rx,
            ai_preview: Mutex::new(AiPreviewState::default()),
            capture_handle: Mutex::new(None),
            last_llm_started_at: Mutex::new(None),
            llm_in_flight: Mutex::new(false),
            self_arc: weak.clone(),
        })
    }
}

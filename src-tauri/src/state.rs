use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, Weak};
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

pub struct AppState {
    pub db: Mutex<Connection>,
    pub session_tx: watch::Sender<SessionState>,
    pub session_rx: watch::Receiver<SessionState>,
    pub capture_handle: Mutex<Option<CaptureHandle>>,
    pub self_arc: Weak<AppState>,
}

impl AppState {
    pub fn new(db: Mutex<Connection>) -> Arc<Self> {
        let (session_tx, session_rx) = watch::channel(SessionState::default());
        Arc::new_cyclic(|weak| Self {
            db,
            session_tx,
            session_rx,
            capture_handle: Mutex::new(None),
            self_arc: weak.clone(),
        })
    }
}

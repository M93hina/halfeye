pub mod gemini;

use crate::audio::TranscriptChunk;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActionType {
    React,
    Silent,
}

impl ActionType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::React => "react",
            Self::Silent => "silent",
        }
    }

    pub fn from_db_value(value: &str) -> Result<Self, String> {
        match value {
            "react" => Ok(Self::React),
            "silent" => Ok(Self::Silent),
            _ => Err(format!("unknown action_type: {}", value)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactionOutput {
    pub observation_summary: String,
    pub action_type: ActionType,
    pub reaction: Option<String>,
}

impl ReactionOutput {
    pub fn validate(self) -> Result<Self, String> {
        if self.observation_summary.trim().is_empty() {
            return Err("observation_summary is empty".to_string());
        }

        match self.action_type {
            ActionType::React => match self.reaction.as_deref().map(str::trim) {
                Some("") | None => Err("reaction is required for action_type=react".to_string()),
                Some(reaction) => Ok(Self {
                    observation_summary: self.observation_summary.trim().to_string(),
                    action_type: self.action_type,
                    reaction: Some(reaction.to_string()),
                }),
            },
            ActionType::Silent => Ok(Self {
                observation_summary: self.observation_summary.trim().to_string(),
                action_type: self.action_type,
                reaction: None,
            }),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ReactionContext {
    pub timestamp: String,
    pub action_type: ActionType,
    pub observation_summary: String,
    pub reaction: Option<String>,
}

#[async_trait]
pub trait LlmClient: Send + Sync {
    async fn generate_reaction(
        &self,
        images: &[String],
        transcript_chunks: &[TranscriptChunk],
        context: &[ReactionContext],
    ) -> Result<ReactionOutput, String>;
    async fn generate_text(&self, prompt: &str) -> Result<String, String>;
}

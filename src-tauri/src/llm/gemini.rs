use crate::llm::LlmClient;
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

const GEMINI_MODEL: &str = "gemini-3-flash-preview";
const DEFAULT_REACTION_PROMPT: &str =
    "この画面を見て、簡潔にリアクションやコメントを生成してください。";

#[derive(Clone)]
pub struct GeminiClient {
    api_key: String,
    http: Client,
}

#[derive(Serialize)]
struct GeminiRequest {
    contents: Vec<Content>,
}

#[derive(Serialize)]
struct Content {
    parts: Vec<Part>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum Part {
    Text { text: String },
    InlineData { inline_data: InlineData },
}

#[derive(Serialize)]
struct InlineData {
    mime_type: String,
    data: String,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<Candidate>>,
}

#[derive(Deserialize)]
struct Candidate {
    content: ContentResponse,
}

#[derive(Deserialize)]
struct ContentResponse {
    parts: Vec<PartResponse>,
}

#[derive(Deserialize)]
struct PartResponse {
    text: Option<String>,
}

impl GeminiClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            http: Client::new(),
        }
    }

    async fn generate_content(&self, parts: Vec<Part>) -> Result<String, String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            GEMINI_MODEL, self.api_key
        );

        let body = GeminiRequest {
            contents: vec![Content { parts }],
        };

        let resp = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Gemini API error {}: {}", status, text));
        }

        let gemini_resp: GeminiResponse = resp.json().await.map_err(|e| e.to_string())?;
        Self::extract_text(gemini_resp)
    }

    fn extract_text(response: GeminiResponse) -> Result<String, String> {
        response
            .candidates
            .unwrap_or_default()
            .into_iter()
            .flat_map(|candidate| candidate.content.parts.into_iter())
            .filter_map(|part| part.text)
            .find(|text| !text.trim().is_empty())
            .ok_or("No text in Gemini response".to_string())
    }
}

#[async_trait]
impl LlmClient for GeminiClient {
    async fn generate_reaction(&self, image_base64: &str) -> Result<String, String> {
        if image_base64.trim().is_empty() {
            return Err("image payload is empty".to_string());
        }

        self.generate_content(vec![
            Part::Text {
                text: DEFAULT_REACTION_PROMPT.to_string(),
            },
            Part::InlineData {
                inline_data: InlineData {
                    mime_type: "image/jpeg".to_string(),
                    data: image_base64.to_string(),
                },
            },
        ])
        .await
    }

    async fn generate_text(&self, prompt: &str) -> Result<String, String> {
        if prompt.trim().is_empty() {
            return Err("prompt is empty".to_string());
        }

        self.generate_content(vec![Part::Text {
            text: prompt.to_string(),
        }])
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::{Content, GeminiRequest, InlineData, Part};
    use serde_json::json;

    #[test]
    fn serializes_inline_data_payload_for_image_requests() {
        let payload = GeminiRequest {
            contents: vec![Content {
                parts: vec![
                    Part::Text {
                        text: "prompt".to_string(),
                    },
                    Part::InlineData {
                        inline_data: InlineData {
                            mime_type: "image/jpeg".to_string(),
                            data: "abc123".to_string(),
                        },
                    },
                ],
            }],
        };

        let value = serde_json::to_value(payload).expect("payload should serialize");

        assert_eq!(
            value,
            json!({
                "contents": [{
                    "parts": [
                        { "text": "prompt" },
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": "abc123"
                            }
                        }
                    ]
                }]
            })
        );
    }
}

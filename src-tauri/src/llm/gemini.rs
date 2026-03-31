use crate::audio::{TranscriptChunk, TranscriptSource};
use crate::llm::{LlmClient, ReactionContext, ReactionOutput};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const GEMINI_MODEL: &str = "gemini-3-flash-preview";
const DEFAULT_REACTION_PROMPT: &str =
    "画面を観察し、必要なら短いリアクションを返してください。入力画像には2秒間隔の直近の複数フレームが含まれることがあります。音声文字起こしがある場合は、その会話内容も文脈として使ってください。";
const REACTION_SYSTEM_PROMPT: &str = r#"あなたは、ユーザーの友達みたいなAIです。ユーザのPCを覗き、たまに反応を返します。

今回の入力には、画面キャプチャに加えて、直近の音声文字起こしが含まれることがあります。内部推論を書かず、観察結果の要約だけを `observation_summary` に入れてください。

重要:
- `observation_summary` は画面の状況や音声の文字起こしを客観的に要約すること
- `reaction` 「実況」ではありません。画面を見て思ったこと、空気を読んだ一言、役に立つ小さな助言、軽い冗談、親しい相手への軽いイジりなどあなたの感じた反応を返し、必ずしもユーザが役立つ"だけ"の回答をする必要はありません。
- `reaction` は「画面に映っているものの説明」ではなく、「それを見た友達なら何と言うか」を優先すること。

出力ルール:
- `observation_summary` は画面の状況や変化を1-2文で要約
- `action_type` は `react` または `silent`
- `reaction` はユーザーに見せる短い一言
- `reaction` は実況ではなく、反応・共感・助言・冗談・軽いイジりのどれか
- 同じ話題が続くときは `silent` を選ぶ
- お茶目で砕けた雰囲気で話すが、必ずですます調は崩さずに出力すること。
- 応答は指定されたJSONスキーマに厳密に従う"#;

#[derive(Clone)]
pub struct GeminiClient {
    api_key: String,
    http: Client,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequest {
    contents: Vec<Content>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<Content>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GenerationConfig>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Content {
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<String>,
    parts: Vec<Part>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum Part {
    Text {
        text: String,
    },
    InlineData {
        #[serde(rename = "inlineData")]
        inline_data: InlineData,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InlineData {
    mime_type: String,
    data: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerationConfig {
    response_mime_type: String,
    response_json_schema: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiResponse {
    candidates: Option<Vec<Candidate>>,
    usage_metadata: Option<UsageMetadata>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Candidate {
    content: Option<ContentResponse>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContentResponse {
    parts: Vec<PartResponse>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartResponse {
    text: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageMetadata {
    prompt_token_count: Option<u32>,
    candidates_token_count: Option<u32>,
    total_token_count: Option<u32>,
}

impl GeminiClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            http: Client::new(),
        }
    }

    async fn send_request(&self, request: GeminiRequest) -> Result<String, String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            GEMINI_MODEL, self.api_key
        );

        let resp = self
            .http
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Gemini API error {}: {}", status, text));
        }

        let gemini_resp: GeminiResponse = resp.json().await.map_err(|e| e.to_string())?;
        if let Some(usage) = &gemini_resp.usage_metadata {
            eprintln!(
                "Gemini usage_metadata: prompt={}, candidates={}, total={}",
                usage.prompt_token_count.unwrap_or(0),
                usage.candidates_token_count.unwrap_or(0),
                usage.total_token_count.unwrap_or(0)
            );
        }
        Self::extract_text(gemini_resp)
    }

    fn extract_text(response: GeminiResponse) -> Result<String, String> {
        response
            .candidates
            .unwrap_or_default()
            .into_iter()
            .filter_map(|candidate| candidate.content)
            .flat_map(|content| content.parts.into_iter())
            .filter_map(|part| part.text)
            .find(|text| !text.trim().is_empty())
            .ok_or("No text in Gemini response".to_string())
    }

    fn reaction_schema() -> Value {
        json!({
            "type": "object",
            "properties": {
                "observation_summary": {
                    "type": "string",
                    "description": "A concise observation summary of the current screen and any recent change."
                },
                "action_type": {
                    "type": "string",
                    "enum": ["react", "silent"],
                    "description": "Whether to display a reaction or stay silent."
                },
                "reaction": {
                    "anyOf": [
                        {
                            "type": "string",
                            "description": "A short user-facing reaction shown in the overlay."
                        },
                        { "type": "null" }
                    ]
                }
            },
            "required": ["observation_summary", "action_type", "reaction"]
        })
    }

    fn build_context_contents(context: &[ReactionContext]) -> Vec<Content> {
        let mut contents = Vec::with_capacity(context.len() * 2 + 1);

        for item in context {
            contents.push(Content {
                role: Some("user".to_string()),
                parts: vec![Part::Text {
                    text: format!("前回ログ at {}", item.timestamp),
                }],
            });
            contents.push(Content {
                role: Some("model".to_string()),
                parts: vec![Part::Text {
                    text: Self::format_context_item(item),
                }],
            });
        }

        contents
    }

    fn format_context_item(item: &ReactionContext) -> String {
        let reaction_line = match item.reaction.as_deref() {
            Some(reaction) if !reaction.trim().is_empty() => {
                format!("reaction: {}", reaction.trim())
            }
            _ => "reaction: <none>".to_string(),
        };

        [
            format!("timestamp: {}", item.timestamp),
            format!("action_type: {}", item.action_type.as_str()),
            format!("observation_summary: {}", item.observation_summary.trim()),
            reaction_line,
        ]
        .join("\n")
    }

    fn format_transcript_chunks(transcript_chunks: &[TranscriptChunk]) -> String {
        if transcript_chunks.is_empty() {
            return "音声文字起こし: なし".to_string();
        }

        let lines = transcript_chunks
            .iter()
            .map(|chunk| {
                let source = match chunk.source {
                    TranscriptSource::Microphone => "microphone",
                    TranscriptSource::System => "system",
                };
                let speaker_turn = if chunk.speaker_turn {
                    "speaker_turn"
                } else {
                    "continuous"
                };

                format!(
                    "[{} {} -> {} {}] {}",
                    source,
                    chunk.started_at,
                    chunk.ended_at,
                    speaker_turn,
                    chunk.text.trim()
                )
            })
            .collect::<Vec<_>>();

        format!("直近の音声文字起こし:\n{}", lines.join("\n"))
    }
}

#[async_trait]
impl LlmClient for GeminiClient {
    async fn generate_reaction(
        &self,
        images: &[String],
        transcript_chunks: &[TranscriptChunk],
        context: &[ReactionContext],
    ) -> Result<ReactionOutput, String> {
        if images.is_empty() {
            return Err("image payload is empty".to_string());
        }

        let mut contents = Self::build_context_contents(context);
        let mut parts = vec![Part::Text {
            text: format!(
                "{}\n\n{}",
                DEFAULT_REACTION_PROMPT,
                Self::format_transcript_chunks(transcript_chunks)
            ),
        }];
        for image in images {
            if !image.trim().is_empty() {
                parts.push(Part::InlineData {
                    inline_data: InlineData {
                        mime_type: "image/jpeg".to_string(),
                        data: image.clone(),
                    },
                });
            }
        }
        if parts.len() == 1 {
            return Err("image payload is empty".to_string());
        }

        contents.push(Content {
            role: Some("user".to_string()),
            parts,
        });

        let response_text = self
            .send_request(GeminiRequest {
                contents,
                system_instruction: Some(Content {
                    role: None,
                    parts: vec![Part::Text {
                        text: REACTION_SYSTEM_PROMPT.to_string(),
                    }],
                }),
                generation_config: Some(GenerationConfig {
                    response_mime_type: "application/json".to_string(),
                    response_json_schema: Self::reaction_schema(),
                }),
            })
            .await?;

        serde_json::from_str::<ReactionOutput>(&response_text)
            .map_err(|e| format!("Failed to parse structured reaction output: {}", e))?
            .validate()
    }

    async fn generate_text(&self, prompt: &str) -> Result<String, String> {
        if prompt.trim().is_empty() {
            return Err("prompt is empty".to_string());
        }

        self.send_request(GeminiRequest {
            contents: vec![Content {
                role: Some("user".to_string()),
                parts: vec![Part::Text {
                    text: prompt.to_string(),
                }],
            }],
            system_instruction: None,
            generation_config: None,
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::{Content, GeminiRequest, GenerationConfig, InlineData, Part};
    use crate::llm::{ActionType, ReactionContext, ReactionOutput};
    use serde_json::json;

    #[test]
    fn serializes_structured_output_request_with_schema() {
        let payload = GeminiRequest {
            contents: vec![Content {
                role: Some("user".to_string()),
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
                    Part::InlineData {
                        inline_data: InlineData {
                            mime_type: "image/jpeg".to_string(),
                            data: "def456".to_string(),
                        },
                    },
                ],
            }],
            system_instruction: Some(Content {
                role: None,
                parts: vec![Part::Text {
                    text: "system".to_string(),
                }],
            }),
            generation_config: Some(GenerationConfig {
                response_mime_type: "application/json".to_string(),
                response_json_schema: json!({
                    "type": "object"
                }),
            }),
        };

        let value = serde_json::to_value(payload).expect("payload should serialize");

        assert_eq!(
            value,
            json!({
                "contents": [{
                    "role": "user",
                    "parts": [
                        { "text": "prompt" },
                        {
                            "inlineData": {
                                "mimeType": "image/jpeg",
                                "data": "abc123"
                            }
                        },
                        {
                            "inlineData": {
                                "mimeType": "image/jpeg",
                                "data": "def456"
                            }
                        }
                    ]
                }],
                "systemInstruction": {
                    "parts": [{ "text": "system" }]
                },
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseJsonSchema": {
                        "type": "object"
                    }
                }
            })
        );
    }

    #[test]
    fn validates_react_output_requires_reaction() {
        let result = ReactionOutput {
            observation_summary: "same editor view".to_string(),
            action_type: ActionType::React,
            reaction: None,
        }
        .validate();

        assert!(result.is_err(), "react output without reaction should fail");
    }

    #[test]
    fn validates_silent_output_clears_reaction() {
        let result = ReactionOutput {
            observation_summary: "same editor view".to_string(),
            action_type: ActionType::Silent,
            reaction: Some("ignored".to_string()),
        }
        .validate()
        .expect("silent output should validate");

        assert_eq!(result.reaction, None);
    }

    #[test]
    fn formats_context_items_without_raw_json() {
        let context = ReactionContext {
            timestamp: "2026-03-30T10:00:00Z".to_string(),
            action_type: ActionType::Silent,
            observation_summary: "editor remained unchanged".to_string(),
            reaction: None,
        };

        let text = super::GeminiClient::format_context_item(&context);

        assert!(text.contains("action_type: silent"));
        assert!(text.contains("observation_summary: editor remained unchanged"));
        assert!(text.contains("reaction: <none>"));
    }
}

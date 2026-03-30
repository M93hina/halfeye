pub mod gemini;

use async_trait::async_trait;

#[async_trait]
pub trait LlmClient: Send + Sync {
    async fn generate_reaction(&self, image_base64: &str, context: &str) -> Result<String, String>;
}

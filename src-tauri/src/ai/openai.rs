use reqwest::header::{CONTENT_TYPE, USER_AGENT};
use serde_json::json;
use tauri::{AppHandle, Runtime};

#[allow(unused_imports)]
use super::*;

pub(crate) async fn run_openai_chat_completion<R: Runtime>(
    app: AppHandle<R>,
    config: &AiProviderConfig,
    api_key: &str,
    request: &AiRunCompletionRequest,
    request_id: &str,
) -> Result<AiRunCompletionResponse, String> {
    let completion_url = build_ai_chat_completions_url(&config.base_url)?;
    let payload = json!({
        "model": config.model,
        "messages": request.messages,
        "stream": true,
    });

    let response = build_default_http_client()?
        .post(completion_url)
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT)
        .header(CONTENT_TYPE, "application/json")
        .bearer_auth(api_key)
        .body(payload.to_string());

    let response = apply_ai_project_header(response, &config.project)
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?
        .error_for_status()
        .map_err(|error| normalize_ai_status_error_message(error.status(), &error.to_string()))?;

    let (mut stream_response, _) =
        read_ai_streaming_completion_response(app, request_id, response).await?;
    stream_response.content_type = resolve_ai_response_content_type(request, false).to_string();
    ensure_ai_response_contains_text(stream_response)
}

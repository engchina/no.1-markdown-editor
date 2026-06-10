use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use reqwest::header::{ACCEPT, CONTENT_TYPE, USER_AGENT};
use reqwest::StatusCode;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};

#[allow(unused_imports)]
use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiOAuthTokenResponse {
    pub(crate) access_token: String,
    #[serde(default)]
    pub(crate) expires_in: Option<u64>,
}

pub(crate) async fn run_hosted_agent_completion<R: Runtime>(
    app: AppHandle<R>,
    config: &AiProviderConfig,
    request: &AiRunCompletionRequest,
    request_id: &str,
) -> Result<AiRunCompletionResponse, String> {
    let profile_id = request
        .hosted_agent_profile_id
        .as_deref()
        .ok_or_else(|| "Hosted agent profile is required for structured execution".to_string())?;
    let profile = find_hosted_agent_profile(config, profile_id)
        .ok_or_else(|| "Selected hosted agent profile was not found".to_string())?;
    let client_secret = read_hosted_agent_client_secret(profile_id)?;
    let access_token = resolve_hosted_agent_access_token(
        &app.state::<AiOAuthTokenCache>(),
        profile,
        &client_secret,
    )
    .await?;
    let access_token_aud = decode_jwt_claim(&access_token, "aud");
    let access_token_scope = decode_jwt_claim(&access_token, "scope");
    let invoke_url = build_ai_hosted_agent_invoke_url(profile)?;
    let invoke_url_string = invoke_url.to_string();
    eprintln!(
        "[ai:hosted-agent] invoke request url={} access_token_len={} profile_id={} token_aud={:?} token_scope={:?}",
        invoke_url_string,
        access_token.len(),
        profile.id,
        access_token_aud,
        access_token_scope
    );
    let message = build_hosted_agent_message(request);
    let thread_id = request
        .thread_id
        .clone()
        .unwrap_or_else(|| request.request_id.clone());
    let payload = json!({
        "thread_id": thread_id,
        "message": message,
    });

    let builder = build_default_http_client()?
        .post(invoke_url)
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT)
        .bearer_auth(access_token)
        .header(CONTENT_TYPE, "application/json")
        .body(payload.to_string());

    if profile.transport == "sse" {
        let response = builder
            .header(ACCEPT, "text/event-stream")
            .send()
            .await
            .map_err(|error| {
                normalize_ai_send_error_message(
                    error.is_timeout(),
                    error.is_connect(),
                    &error.to_string(),
                )
            })?;
        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(normalize_hosted_agent_invoke_status_error(
                profile,
                Some(status),
                &invoke_url_string,
                &body,
                access_token_aud.as_ref(),
                access_token_scope.as_ref(),
            ));
        }

        let (mut stream_response, _) =
            read_ai_streaming_completion_response(app, request_id, response).await?;
        stream_response.thread_id = Some(thread_id);
        stream_response.content_type = resolve_ai_response_content_type(request, true).to_string();
        stream_response.source_label = Some(profile.label.clone());
        stream_response.explanation_text =
            Some("Returned by the configured Oracle hosted agent.".to_string());
        return ensure_ai_response_contains_text(stream_response);
    }

    let response = builder
        .header(ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?;
    let response_status = response.status();
    let response_body = response
        .text()
        .await
        .map_err(|_| "Hosted agent returned an unreadable response".to_string())?;
    if !response_status.is_success() {
        eprintln!(
            "[ai:hosted-agent] invoke failed. status={} body={}",
            response_status,
            preview_ai_response_body(&response_body, 500)
        );
        return Err(normalize_hosted_agent_invoke_status_error(
            profile,
            Some(response_status),
            &invoke_url_string,
            &response_body,
            access_token_aud.as_ref(),
            access_token_scope.as_ref(),
        ));
    }
    let response_json: Value = serde_json::from_str(&response_body)
        .map_err(|_| "Hosted agent returned a malformed response".to_string())?;

    let text = extract_hosted_agent_reply_text(&response_json)
        .ok_or_else(|| "Hosted agent response did not include reply text".to_string())?;
    let resolved_thread_id = response_json
        .get("thread_id")
        .and_then(Value::as_str)
        .or_else(|| response_json.get("threadId").and_then(Value::as_str))
        .map(str::to_string)
        .or_else(|| Some(thread_id.clone()));

    Ok(AiRunCompletionResponse {
        text,
        finish_reason: Some("stop".to_string()),
        model: Some("oracle-hosted-agent".to_string()),
        request_id: Some(request.request_id.clone()),
        thread_id: resolved_thread_id,
        content_type: resolve_ai_response_content_type(request, true).to_string(),
        explanation_text: Some("Returned by the configured Oracle hosted agent.".to_string()),
        warning_text: None,
        source_label: Some(profile.label.clone()),
        retrieval_executed: false,
        retrieval_query: None,
        retrieval_results: vec![],
        retrieval_result_count: None,
        generated_sql: None,
        structured_execution_status: None,
        structured_execution_tool_name: None,
    })
}

pub(crate) async fn resolve_hosted_agent_access_token(
    cache: &tauri::State<'_, AiOAuthTokenCache>,
    profile: &AiOracleHostedAgentProfile,
    client_secret: &str,
) -> Result<String, String> {
    let cache_key = format!(
        "{}|{}|{}",
        profile.domain_url.trim(),
        profile.client_id.trim(),
        profile.scope.trim()
    );
    let now_unix = unix_timestamp_now();

    if let Some(token) = cache
        .0
        .lock()
        .map_err(|_| "Failed to access OAuth token cache".to_string())?
        .get(&cache_key)
        .cloned()
    {
        if token.expires_at_unix > now_unix + AI_OAUTH_REFRESH_MARGIN_SECONDS {
            return Ok(token.access_token);
        }
    }

    let token_url = build_ai_hosted_agent_token_url(&profile.domain_url)?;
    let client_id_trimmed = profile.client_id.trim();
    let client_secret_trimmed = client_secret.trim();
    let scope_trimmed = profile.scope.trim();
    let mut form: Vec<(&str, &str)> = vec![
        ("grant_type", "client_credentials"),
        ("client_id", client_id_trimmed),
        ("client_secret", client_secret_trimmed),
    ];
    if !scope_trimmed.is_empty() {
        form.push(("scope", scope_trimmed));
    }
    let form_body = form
        .iter()
        .map(|(key, value)| {
            format!(
                "{}={}",
                url_encode_component(key),
                url_encode_component(value)
            )
        })
        .collect::<Vec<_>>()
        .join("&");
    eprintln!(
        "[ai:hosted-agent] token request url={} client_id_len={} client_secret_len={} scope={:?}",
        token_url,
        client_id_trimmed.len(),
        client_secret_trimmed.len(),
        scope_trimmed
    );
    let client = build_default_http_client()?;
    let response = client
        .post(token_url)
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(form_body)
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?;
    let token_status = response.status();
    let token_content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
        .unwrap_or_default();
    let token_body = response
        .text()
        .await
        .map_err(|_| "Hosted agent token endpoint returned an unreadable response".to_string())?;
    if !token_status.is_success() {
        return Err(normalize_hosted_agent_token_status_error(
            token_status,
            &token_content_type,
            &token_body,
        ));
    }
    let token_response = extract_hosted_agent_oauth_token_response(&token_body)?;

    eprintln!(
        "[ai:hosted-agent] token acquired. jwt_aud={:?} jwt_scope={:?}",
        decode_jwt_claim(&token_response.access_token, "aud"),
        decode_jwt_claim(&token_response.access_token, "scope")
    );

    let expires_in = token_response.expires_in.unwrap_or(300);
    let cached = CachedOAuthToken {
        access_token: token_response.access_token.clone(),
        expires_at_unix: now_unix + expires_in,
    };

    cache
        .0
        .lock()
        .map_err(|_| "Failed to update OAuth token cache".to_string())?
        .insert(cache_key, cached);

    Ok(token_response.access_token)
}

pub(crate) fn extract_hosted_agent_oauth_token_response(
    body: &str,
) -> Result<AiOAuthTokenResponse, String> {
    let normalized_body = body.trim().trim_start_matches('\u{feff}');
    let response_json: Value = serde_json::from_str(normalized_body).map_err(|_| {
        format!(
            "Hosted agent token endpoint returned non-JSON content. body={}",
            preview_ai_response_body(body, 240)
        )
    })?;
    let response_object = response_json.as_object().ok_or_else(|| {
        format!(
            "Hosted agent token endpoint returned JSON, but not an object. body={}",
            preview_ai_response_body(body, 240)
        )
    })?;

    if let Some(error) = response_object.get("error").and_then(Value::as_str) {
        let description = response_object
            .get("error_description")
            .and_then(Value::as_str)
            .or_else(|| {
                response_object
                    .get("errorDescription")
                    .and_then(Value::as_str)
            })
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("No error description was provided");
        return Err(format!(
            "Hosted agent token endpoint returned an OAuth error: {error}. {description}"
        ));
    }

    let access_token = response_object
        .get("access_token")
        .and_then(Value::as_str)
        .or_else(|| response_object.get("accessToken").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!(
                "Hosted agent token endpoint returned JSON without access_token. body={}",
                preview_ai_response_body(body, 240)
            )
        })?
        .to_string();
    let expires_in = response_object
        .get("expires_in")
        .or_else(|| response_object.get("expiresIn"))
        .and_then(parse_json_u64);

    Ok(AiOAuthTokenResponse {
        access_token,
        expires_in,
    })
}

pub(crate) fn normalize_hosted_agent_token_status_error(
    status: StatusCode,
    content_type: &str,
    body: &str,
) -> String {
    let detail = extract_oauth_error_summary(body).unwrap_or_else(|| {
        format!(
            "content_type={} body={}",
            if content_type.trim().is_empty() {
                "<unknown>"
            } else {
                content_type.trim()
            },
            preview_ai_response_body(body, 240)
        )
    });

    match status.as_u16() {
        400 => format!("Hosted agent token request was rejected. {detail}"),
        401 | 403 => format!(
            "Hosted agent authentication failed. Check client ID, client secret, and scope. {detail}"
        ),
        404 => format!("Hosted agent token endpoint was not found. {detail}"),
        500..=599 => format!("Hosted agent token service is temporarily unavailable. {detail}"),
        code => format!("Hosted agent token request returned an error ({code}). {detail}"),
    }
}

pub(crate) fn extract_oauth_error_summary(body: &str) -> Option<String> {
    let normalized_body = body.trim().trim_start_matches('\u{feff}');
    let response_json: Value = serde_json::from_str(normalized_body).ok()?;
    let response_object = response_json.as_object()?;
    let error = response_object.get("error").and_then(Value::as_str)?.trim();
    if error.is_empty() {
        return None;
    }

    let description = response_object
        .get("error_description")
        .and_then(Value::as_str)
        .or_else(|| {
            response_object
                .get("errorDescription")
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty());

    Some(match description {
        Some(description) => format!("oauth_error={error} description={description}"),
        None => format!("oauth_error={error}"),
    })
}

pub(crate) fn decode_jwt_claim(token: &str, claim: &str) -> Option<Value> {
    let payload_b64 = token.split('.').nth(1)?;
    let payload_bytes = URL_SAFE_NO_PAD
        .decode(payload_b64.trim_end_matches('='))
        .ok()?;
    let payload: Value = serde_json::from_slice(&payload_bytes).ok()?;
    payload.get(claim).cloned()
}

pub(crate) fn normalize_hosted_agent_invoke_status_error(
    profile: &AiOracleHostedAgentProfile,
    status: Option<StatusCode>,
    invoke_url: &str,
    fallback: &str,
    token_aud: Option<&Value>,
    token_scope: Option<&Value>,
) -> String {
    let detail = summarize_hosted_agent_response_detail(fallback);
    let auth_context = summarize_hosted_agent_auth_context(profile, token_aud, token_scope);
    let audience_hint = if detail.to_ascii_lowercase().contains("audience mismatch") {
        "The token audience does not match the configured Hosted Application OCID."
    } else {
        ""
    };
    match status.map(|status| status.as_u16()) {
        Some(400) => format!("Hosted agent request was rejected by the provider. {detail}"),
        Some(401 | 403) => format!(
            "Hosted agent authentication failed. Check token scope, agent permissions, client secret, and Hosted Application OCID. {auth_context} {detail} {audience_hint}"
        ),
        Some(404) => format!(
            "Hosted agent endpoint was not found. Check OCI region, API version, hosted application OCID, and API action. url={invoke_url} {detail}"
        ),
        Some(429) => "Hosted agent rate limit reached. Try again in a moment".to_string(),
        Some(500..=599) => format!("Hosted agent service is temporarily unavailable. Try again later. {detail}"),
        Some(code) => format!("Hosted agent request returned an error ({code}). {detail}"),
        None => format!("Hosted agent request returned an error: {fallback}"),
    }
}

pub(crate) fn summarize_hosted_agent_auth_context(
    profile: &AiOracleHostedAgentProfile,
    token_aud: Option<&Value>,
    token_scope: Option<&Value>,
) -> String {
    format!(
        "profile_id={} profile_label={} hosted_application_ocid={} configured_scope={} token_aud={} token_scope={}.",
        profile.id,
        summarize_hosted_agent_setting(&profile.label),
        summarize_hosted_agent_setting(&profile.hosted_application_ocid),
        summarize_hosted_agent_setting(&profile.scope),
        summarize_hosted_agent_claim(token_aud),
        summarize_hosted_agent_claim(token_scope),
    )
}

pub(crate) fn summarize_hosted_agent_setting(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "<empty>".to_string()
    } else {
        trimmed.to_string()
    }
}

pub(crate) fn summarize_hosted_agent_claim(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(string)) => summarize_hosted_agent_setting(string),
        Some(other) => other.to_string(),
        None => "<missing>".to_string(),
    }
}

pub(crate) fn summarize_hosted_agent_response_detail(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        let code = value
            .get("code")
            .and_then(Value::as_str)
            .or_else(|| value.get("error").and_then(Value::as_str));
        let message = value
            .get("message")
            .and_then(Value::as_str)
            .or_else(|| value.get("error_description").and_then(Value::as_str));
        match (code, message) {
            (Some(code), Some(message)) => return format!("{code}: {message}"),
            (Some(code), None) => return code.to_string(),
            (None, Some(message)) => return message.to_string(),
            _ => {}
        }
    }
    let snippet: String = trimmed.chars().take(500).collect();
    snippet
}

pub(crate) fn build_hosted_agent_message(request: &AiRunCompletionRequest) -> String {
    if let Some(user_message) = request
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "user")
    {
        if !user_message.content.trim().is_empty() {
            return user_message.content.trim().to_string();
        }
    }

    request.prompt.trim().to_string()
}

pub(crate) fn extract_hosted_agent_reply_text(response_json: &Value) -> Option<String> {
    response_json
        .get("reply")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            response_json
                .get("text")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| response_json.get("content").and_then(extract_content_text))
        .or_else(|| {
            response_json
                .get("data")
                .and_then(|data| data.get("reply"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

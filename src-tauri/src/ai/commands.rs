use reqwest::header::{CONTENT_TYPE, USER_AGENT};
use serde_json::Value;
use std::collections::HashMap;
use tauri::{AppHandle, Runtime};
use tokio::task::AbortHandle;

#[allow(unused_imports)]
use super::*;

#[tauri::command]
pub fn ai_load_provider_state<R: Runtime>(app: AppHandle<R>) -> Result<AiProviderState, String> {
    let config = read_ai_provider_config(&app)?;
    let has_api_key = has_ai_provider_api_key()?;
    let has_oci_key_file_passphrase_by_id = match config.as_ref() {
        Some(config) if config.provider == "oci-responses" => config
            .oci_auth_profiles
            .iter()
            .map(|profile| {
                Ok((
                    profile.id.clone(),
                    has_oci_key_file_passphrase(&profile.id)?,
                ))
            })
            .collect::<Result<HashMap<_, _>, String>>()?,
        _ => HashMap::new(),
    };
    let has_hosted_agent_client_secret_by_id = match config.as_ref() {
        Some(config) if config.provider == "oci-responses" => config
            .hosted_agent_profiles
            .iter()
            .map(|profile| {
                Ok((
                    profile.id.clone(),
                    has_hosted_agent_client_secret(&profile.id)?,
                ))
            })
            .collect::<Result<HashMap<_, _>, String>>()?,
        _ => HashMap::new(),
    };

    Ok(AiProviderState {
        config,
        has_api_key,
        storage_kind: "keyring".to_string(),
        has_oci_key_file_passphrase_by_id,
        has_hosted_agent_client_secret_by_id,
    })
}

#[tauri::command]
pub fn ai_save_provider_config<R: Runtime>(
    app: AppHandle<R>,
    config: AiProviderConfig,
) -> Result<AiProviderConfig, String> {
    let normalized = normalize_ai_provider_config(config)?;
    write_ai_provider_config(&app, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub fn ai_store_provider_api_key(api_key: String) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("AI API key cannot be empty".to_string());
    }

    ai_keyring_entry(AI_DIRECT_PROVIDER_ACCOUNT)?
        .set_password(trimmed)
        .map_err(|error| format!("Failed to store AI API key: {error}"))
}

#[tauri::command]
pub fn ai_clear_provider_api_key() -> Result<(), String> {
    match ai_keyring_entry(AI_DIRECT_PROVIDER_ACCOUNT)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to clear AI API key: {error}")),
    }
}

#[tauri::command]
pub fn ai_store_oci_key_file_passphrase(
    profile_id: String,
    passphrase: String,
) -> Result<(), String> {
    let trimmed_profile_id = profile_id.trim();
    if trimmed_profile_id.is_empty() {
        return Err("OCI auth profile id is required".to_string());
    }

    let trimmed_passphrase = passphrase.trim();
    if trimmed_passphrase.is_empty() {
        return Err("OCI key file passphrase cannot be empty".to_string());
    }

    ai_keyring_entry(&oci_key_file_passphrase_account(trimmed_profile_id))?
        .set_password(trimmed_passphrase)
        .map_err(|error| format!("Failed to store OCI key file passphrase: {error}"))
}

#[tauri::command]
pub fn ai_clear_oci_key_file_passphrase(profile_id: String) -> Result<(), String> {
    let trimmed_profile_id = profile_id.trim();
    if trimmed_profile_id.is_empty() {
        return Err("OCI auth profile id is required".to_string());
    }

    match ai_keyring_entry(&oci_key_file_passphrase_account(trimmed_profile_id))?
        .delete_credential()
    {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to clear OCI key file passphrase: {error}")),
    }
}

#[tauri::command]
pub fn ai_store_hosted_agent_client_secret(
    profile_id: String,
    client_secret: String,
) -> Result<(), String> {
    let trimmed_profile_id = profile_id.trim();
    if trimmed_profile_id.is_empty() {
        return Err("Hosted agent profile id is required".to_string());
    }

    let trimmed_secret = client_secret.trim();
    if trimmed_secret.is_empty() {
        return Err("Hosted agent client secret cannot be empty".to_string());
    }

    ai_keyring_entry(&hosted_agent_keyring_account(trimmed_profile_id))?
        .set_password(trimmed_secret)
        .map_err(|error| format!("Failed to store hosted agent client secret: {error}"))
}

#[tauri::command]
pub fn ai_clear_hosted_agent_client_secret(profile_id: String) -> Result<(), String> {
    let trimmed_profile_id = profile_id.trim();
    if trimmed_profile_id.is_empty() {
        return Err("Hosted agent profile id is required".to_string());
    }

    match ai_keyring_entry(&hosted_agent_keyring_account(trimmed_profile_id))?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Failed to clear hosted agent client secret: {error}"
        )),
    }
}

#[tauri::command]
pub async fn ai_run_completion<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AiInFlightRequests>,
    _oauth_cache: tauri::State<'_, AiOAuthTokenCache>,
    request: AiRunCompletionRequest,
) -> Result<AiRunCompletionResponse, String> {
    validate_ai_request(&request)?;

    let config = read_ai_provider_config(&app)?
        .ok_or_else(|| "AI provider settings are not configured".to_string())?;
    let request_id = request.request_id.trim().to_string();
    let request_id_for_task = request_id.clone();
    let app_handle = app.clone();
    let config_for_task = config.clone();
    let request_for_task = request.clone();

    let handle = tokio::spawn(async move {
        route_ai_completion_request(
            app_handle,
            request_id_for_task,
            config_for_task,
            request_for_task,
        )
        .await
    });

    register_in_flight_request(&state, &request_id, handle.abort_handle())?;
    let result = handle.await;
    unregister_in_flight_request(&state, &request_id);

    match result {
        Ok(inner) => inner,
        Err(error) if error.is_cancelled() => Err("AI request was canceled".to_string()),
        Err(error) => Err(format!("AI request task failed: {error}")),
    }
}

#[tauri::command]
pub fn ai_cancel_completion(
    state: tauri::State<'_, AiInFlightRequests>,
    request_id: String,
) -> Result<bool, String> {
    let trimmed = request_id.trim();
    if trimmed.is_empty() {
        return Err("AI request id is required".to_string());
    }

    let handle = state
        .0
        .lock()
        .map_err(|_| "Failed to access AI in-flight requests".to_string())?
        .remove(trimmed);

    if let Some(handle) = handle {
        handle.abort();
        return Ok(true);
    }

    Ok(false)
}

#[tauri::command]
pub async fn ai_list_enrichment_jobs<R: Runtime>(
    app: AppHandle<R>,
    request: AiListEnrichmentJobsRequest,
) -> Result<Value, String> {
    let config = read_ai_provider_config(&app)?
        .ok_or_else(|| "AI provider settings are not configured".to_string())?;
    let store = find_structured_store_registration(&config, Some(&request.structured_store_id))
        .ok_or_else(|| "Selected Oracle structured store was not found".to_string())?;
    let url = build_ai_enrichment_jobs_url(&config, store, Some(&request.compartment_id))?;
    let response = build_default_http_client()?
        .get(url.clone())
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT);
    let response = apply_oci_iam_signature(response, &config, store, "get", &url, "")?
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?;
    let response = ensure_ai_success_status(response, "ai:list-enrichment-jobs").await?;
    parse_json_response(response).await
}

#[tauri::command]
pub async fn ai_generate_enrichment_job<R: Runtime>(
    app: AppHandle<R>,
    request: AiEnrichmentJobRequest,
) -> Result<Value, String> {
    let config = read_ai_provider_config(&app)?
        .ok_or_else(|| "AI provider settings are not configured".to_string())?;
    let store = find_structured_store_registration(&config, Some(&request.structured_store_id))
        .ok_or_else(|| "Selected Oracle structured store was not found".to_string())?;
    let url = build_ai_generate_enrichment_job_url(&config, store)?;
    let payload = build_enrichment_job_payload(store, &request)?;
    let body = payload.to_string();
    let response = build_default_http_client()?
        .post(url.clone())
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT)
        .header(CONTENT_TYPE, "application/json")
        .body(body.clone());
    let response = apply_oci_iam_signature(response, &config, store, "post", &url, &body)?
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?;
    let response = ensure_ai_success_status(response, "ai:generate-enrichment-job").await?;
    parse_json_response(response).await
}

#[tauri::command]
pub async fn ai_get_enrichment_job<R: Runtime>(
    app: AppHandle<R>,
    request: AiEnrichmentJobActionRequest,
) -> Result<Value, String> {
    let config = read_ai_provider_config(&app)?
        .ok_or_else(|| "AI provider settings are not configured".to_string())?;
    let store = find_structured_store_registration(&config, Some(&request.structured_store_id))
        .ok_or_else(|| "Selected Oracle structured store was not found".to_string())?;
    let url = build_ai_enrichment_job_url(&config, store, &request.enrichment_job_id)?;
    let response = build_default_http_client()?
        .get(url.clone())
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT);
    let response = apply_oci_iam_signature(response, &config, store, "get", &url, "")?
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?;
    let response = ensure_ai_success_status(response, "ai:get-enrichment-job").await?;
    parse_json_response(response).await
}

pub(crate) async fn route_ai_completion_request<R: Runtime>(
    app: AppHandle<R>,
    request_id: String,
    config: AiProviderConfig,
    request: AiRunCompletionRequest,
) -> Result<AiRunCompletionResponse, String> {
    if request.execution_target_kind == "oracle-hosted-agent" {
        return run_hosted_agent_completion(app, &config, &request, &request_id).await;
    }

    if request.knowledge_selection.kind == "oracle-structured-store"
        && request.knowledge_selection.mode.as_deref() == Some("sql-draft")
    {
        return run_oci_nl2sql_draft_completion(&config, &request).await;
    }

    if request.knowledge_selection.kind == "oracle-structured-store"
        && request.knowledge_selection.mode.as_deref() == Some("agent-answer")
    {
        return run_oci_structured_mcp_completion(&config, &request).await;
    }

    let api_key = read_ai_provider_api_key()?;

    if should_use_openai_chat_completions(&config) {
        return run_openai_chat_completion(app, &config, &api_key, &request, &request_id).await;
    }

    run_oci_responses_completion(app, &config, &api_key, &request, &request_id).await
}

pub(crate) fn should_use_openai_chat_completions(config: &AiProviderConfig) -> bool {
    config.provider == "openai-compatible"
}

pub(crate) fn register_in_flight_request(
    state: &tauri::State<'_, AiInFlightRequests>,
    request_id: &str,
    abort_handle: AbortHandle,
) -> Result<(), String> {
    let mut requests = state
        .0
        .lock()
        .map_err(|_| "Failed to access AI in-flight requests".to_string())?;
    requests.insert(request_id.to_string(), abort_handle);
    Ok(())
}

pub(crate) fn unregister_in_flight_request(
    state: &tauri::State<'_, AiInFlightRequests>,
    request_id: &str,
) {
    if let Ok(mut requests) = state.0.lock() {
        requests.remove(request_id);
    }
}

pub(crate) fn validate_ai_request(request: &AiRunCompletionRequest) -> Result<(), String> {
    if request.request_id.trim().is_empty() {
        return Err("AI request id is required".to_string());
    }

    if request.execution_target_kind == "oracle-hosted-agent" {
        if request
            .hosted_agent_profile_id
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
        {
            return Err("Hosted agent profile is required".to_string());
        }
        if request.prompt.trim().is_empty() {
            return Err("AI request prompt is required".to_string());
        }
    }

    if request.knowledge_selection.kind == "oracle-structured-store"
        && request.knowledge_selection.mode.as_deref() == Some("sql-draft")
        && request.prompt.trim().is_empty()
    {
        return Err("NL2SQL request prompt is required".to_string());
    }

    if request.messages.is_empty() && request.prompt.trim().is_empty() {
        return Err("AI request must include at least one message".to_string());
    }

    validate_ai_messages(&request.messages)
}

pub(crate) fn validate_ai_messages(messages: &[AiRequestMessage]) -> Result<(), String> {
    for message in messages {
        if !matches!(message.role.as_str(), "system" | "user" | "assistant") {
            return Err(format!("Unsupported AI message role: {}", message.role));
        }
        if message.content.trim().is_empty() {
            return Err("AI request messages must not be empty".to_string());
        }
    }

    Ok(())
}

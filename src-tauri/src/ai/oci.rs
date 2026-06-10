use reqwest::header::{CONTENT_TYPE, USER_AGENT};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};

#[allow(unused_imports)]
use super::*;

pub(crate) async fn run_oci_responses_completion<R: Runtime>(
    app: AppHandle<R>,
    config: &AiProviderConfig,
    api_key: &str,
    request: &AiRunCompletionRequest,
    request_id: &str,
) -> Result<AiRunCompletionResponse, String> {
    let responses_url = build_ai_responses_url(&config.base_url)?;
    let (payload, source_label) = build_oci_responses_payload(config, request)?;

    let response = build_default_http_client()?
        .post(responses_url)
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

    let (mut stream_response, file_search_observation) =
        read_ai_streaming_completion_response(app, request_id, response).await?;
    stream_response.content_type = resolve_ai_response_content_type(request, false).to_string();
    if request.knowledge_selection.kind == "oracle-unstructured-store" {
        return finalize_document_store_response(
            stream_response,
            request,
            source_label,
            &file_search_observation,
        );
    }

    stream_response.source_label = source_label;
    ensure_ai_response_contains_text(stream_response)
}

pub(crate) async fn run_oci_nl2sql_draft_completion(
    config: &AiProviderConfig,
    request: &AiRunCompletionRequest,
) -> Result<AiRunCompletionResponse, String> {
    let store = find_structured_store_registration(
        config,
        request.knowledge_selection.registration_id.as_deref(),
    )
    .ok_or_else(|| "Selected Oracle structured store was not found".to_string())?;

    if let Some(response) = build_user_supplied_sql_draft_response(store, request) {
        return Ok(response);
    }

    let generate_sql_url = build_ai_generate_sql_url(config, store)?;
    let payload = json!({
        "inputNaturalLanguageQuery": request.prompt.trim()
    });

    let response = build_default_http_client()?
        .post(generate_sql_url.clone())
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT)
        .header(CONTENT_TYPE, "application/json")
        .body(payload.to_string());

    let response = apply_oci_iam_signature(
        response,
        config,
        store,
        "post",
        &generate_sql_url,
        &payload.to_string(),
    )?
    .send()
    .await
    .map_err(|error| {
        normalize_ai_send_error_message(error.is_timeout(), error.is_connect(), &error.to_string())
    })?;
    let response = ensure_ai_success_status(response, "ai:generate-sql-from-nl").await?;

    let response_body = response
        .text()
        .await
        .map_err(|_| "AI service returned an unreadable response".to_string())?;
    let response_json: Value = serde_json::from_str(&response_body)
        .map_err(|_| "AI service returned a malformed response".to_string())?;
    let text = extract_nl2sql_sql_text(&response_json)
        .ok_or_else(|| "NL2SQL response did not include SQL text".to_string())?;
    let explanation_text = extract_nl2sql_explanation(&response_json);
    let warning_text = extract_nl2sql_warning(&response_json);

    Ok(AiRunCompletionResponse {
        text: text.clone(),
        finish_reason: Some("stop".to_string()),
        model: Some(config.model.clone()),
        request_id: Some(request.request_id.clone()),
        thread_id: request.thread_id.clone(),
        content_type: "sql".to_string(),
        explanation_text,
        warning_text,
        source_label: Some(store.label.clone()),
        retrieval_executed: false,
        retrieval_query: None,
        retrieval_results: vec![],
        retrieval_result_count: None,
        generated_sql: Some(text.clone()),
        structured_execution_status: None,
        structured_execution_tool_name: None,
    })
}

pub(crate) fn build_user_supplied_sql_draft_response(
    store: &AiOracleStructuredStoreRegistration,
    request: &AiRunCompletionRequest,
) -> Option<AiRunCompletionResponse> {
    let sql = request.prompt.trim();
    if !is_read_only_select_sql(sql) {
        return None;
    }

    Some(AiRunCompletionResponse {
        text: sql.to_string(),
        finish_reason: Some("stop".to_string()),
        model: Some("user-supplied-sql".to_string()),
        request_id: Some(request.request_id.clone()),
        thread_id: request.thread_id.clone(),
        content_type: "sql".to_string(),
        explanation_text: Some(
            "Using the read-only SQL from the prompt. No NL2SQL request was sent.".to_string(),
        ),
        warning_text: Some(
            "Review table names and predicates before running this SQL against production data."
                .to_string(),
        ),
        source_label: Some(store.label.clone()),
        retrieval_executed: false,
        retrieval_query: None,
        retrieval_results: vec![],
        retrieval_result_count: None,
        generated_sql: Some(sql.to_string()),
        structured_execution_status: None,
        structured_execution_tool_name: None,
    })
}

pub(crate) async fn run_oci_structured_mcp_completion(
    config: &AiProviderConfig,
    request: &AiRunCompletionRequest,
) -> Result<AiRunCompletionResponse, String> {
    let store = find_structured_store_registration(
        config,
        request.knowledge_selection.registration_id.as_deref(),
    )
    .ok_or_else(|| "Selected Oracle structured store was not found".to_string())?;
    let sql = request
        .generated_sql
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let sql = if let Some(sql) = sql {
        sql
    } else {
        run_oci_nl2sql_draft_completion(config, request)
            .await?
            .text
            .trim()
            .to_string()
    };
    if !is_read_only_select_sql(&sql) {
        return Err("Generated SQL is not a read-only SELECT query. Review and copy the SQL manually instead of executing it.".to_string());
    }

    let execution_profile =
        find_mcp_execution_profile(config, store.execution_profile_id.as_deref())
            .ok_or_else(|| "Selected MCP execution profile was not found".to_string())?;
    let (answer, tool_name) = run_mcp_execution_profile(execution_profile, store, request, &sql)?;
    let status = format!(
        "MCP execution completed{}.",
        tool_name
            .as_deref()
            .map(|name| format!(" with {name}"))
            .unwrap_or_default()
    );

    Ok(AiRunCompletionResponse {
        text: answer,
        finish_reason: Some("stop".to_string()),
        model: Some("oci-nl2sql-mcp".to_string()),
        request_id: Some(request.request_id.clone()),
        thread_id: request.thread_id.clone(),
        content_type: "markdown".to_string(),
        explanation_text: Some(
            "Generated SQL with OCI NL2SQL, then executed through the configured MCP profile."
                .to_string(),
        ),
        warning_text: None,
        source_label: Some(store.label.clone()),
        retrieval_executed: false,
        retrieval_query: None,
        retrieval_results: vec![],
        retrieval_result_count: None,
        generated_sql: Some(sql),
        structured_execution_status: Some(status),
        structured_execution_tool_name: tool_name,
    })
}

pub(crate) fn extract_nl2sql_sql_text(response_json: &Value) -> Option<String> {
    response_json
        .get("generatedSql")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            response_json
                .get("generated_sql")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            response_json
                .get("sql")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            response_json
                .get("statement")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            response_json
                .get("data")
                .and_then(|data| data.get("generatedSql"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            response_json
                .get("jobOutput")
                .and_then(extract_nl2sql_job_output_text)
        })
        .or_else(|| {
            response_json
                .get("output")
                .and_then(extract_nl2sql_job_output_text)
        })
}

pub(crate) fn extract_nl2sql_job_output_text(job_output: &Value) -> Option<String> {
    job_output
        .get("content")
        .and_then(extract_content_text)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            job_output
                .get("generatedSql")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            job_output
                .get("data")
                .and_then(|data| data.get("generatedSql"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

pub(crate) fn extract_nl2sql_explanation(response_json: &Value) -> Option<String> {
    response_json
        .get("explanation")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            response_json
                .get("summary")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

pub(crate) fn extract_nl2sql_warning(response_json: &Value) -> Option<String> {
    response_json
        .get("warning")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            response_json
                .get("warnings")
                .and_then(Value::as_array)
                .map(|warnings| {
                    warnings
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .collect::<Vec<_>>()
                        .join("\n")
                })
        })
        .filter(|value| !value.is_empty())
}

use reqwest::StatusCode;
use serde_json::Value;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[allow(unused_imports)]
use super::*;

pub(crate) fn parse_json_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64(),
        Value::String(text) => text.trim().parse::<u64>().ok(),
        _ => None,
    }
}

pub(crate) fn preview_ai_response_body(body: &str, limit: usize) -> String {
    let compact = body.trim().replace('\r', "\\r").replace('\n', "\\n");
    if compact.chars().count() <= limit {
        return compact;
    }

    let preview = compact.chars().take(limit).collect::<String>();
    format!("{preview}...(truncated)")
}

pub(crate) fn apply_ai_project_header(
    builder: reqwest::RequestBuilder,
    project: &str,
) -> reqwest::RequestBuilder {
    let trimmed = project.trim();
    if trimmed.is_empty() {
        builder
    } else {
        builder.header(AI_PROVIDER_PROJECT_HEADER, trimmed)
    }
}

pub(crate) async fn parse_json_response(response: reqwest::Response) -> Result<Value, String> {
    let body = response
        .text()
        .await
        .map_err(|_| "AI service returned an unreadable response".to_string())?;
    serde_json::from_str(&body).map_err(|_| "AI service returned a malformed response".to_string())
}

pub(crate) async fn ensure_ai_success_status(
    response: reqwest::Response,
    operation: &str,
) -> Result<reqwest::Response, String> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }

    let opc_request_id = response
        .headers()
        .get("opc-request-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let body = response.text().await.unwrap_or_default();
    eprintln!(
        "[{operation}] provider returned status={} body={}",
        status.as_u16(),
        preview_ai_response_body(&body, 1000)
    );
    Err(normalize_ai_status_error_message_with_provider_detail(
        Some(status),
        &body,
        operation,
        opc_request_id.as_deref(),
    ))
}

pub(crate) fn first_non_empty(values: &[&str]) -> String {
    values
        .iter()
        .map(|value| value.trim())
        .find(|value| !value.is_empty())
        .unwrap_or("")
        .to_string()
}

pub(crate) fn normalize_ai_send_error_message(
    is_timeout: bool,
    is_connect: bool,
    fallback: &str,
) -> String {
    if is_timeout {
        return "AI request timed out".to_string();
    }

    if is_connect {
        return "Unable to reach the AI service. Check your network connection".to_string();
    }

    format!("AI request failed: {fallback}")
}

pub(crate) fn normalize_ai_status_error_message(
    status: Option<StatusCode>,
    fallback: &str,
) -> String {
    match status.map(|status| status.as_u16()) {
        Some(400) => "AI request was rejected by the provider".to_string(),
        Some(401 | 403) => {
            "AI authentication failed. Check your API key and project settings".to_string()
        }
        Some(404) => {
            "AI endpoint or resource was not found. Check the configured base URL, OCI region, semantic store ID, compartment OCID, enrichment job ID, and IAM policy".to_string()
        }
        Some(429) => "AI rate limit reached. Try again in a moment".to_string(),
        Some(500..=599) => "AI service is temporarily unavailable. Try again later".to_string(),
        Some(code) => format!("AI request returned an error ({code})"),
        None => format!("AI request returned an error: {fallback}"),
    }
}

pub(crate) fn normalize_ai_status_error_message_with_provider_detail(
    status: Option<StatusCode>,
    fallback: &str,
    operation: &str,
    opc_request_id: Option<&str>,
) -> String {
    let base = normalize_ai_operation_status_error_message(operation, status, fallback);
    match summarize_ai_provider_error_detail(fallback, opc_request_id) {
        Some(detail) => format!("{base}. Provider detail ({operation}): {detail}"),
        None => base,
    }
}

pub(crate) fn normalize_ai_operation_status_error_message(
    operation: &str,
    status: Option<StatusCode>,
    fallback: &str,
) -> String {
    if operation.starts_with("ai:generate-sql-from-nl")
        || operation.starts_with("ai:generate-enrichment-job")
        || operation.starts_with("ai:list-enrichment-jobs")
        || operation.starts_with("ai:get-enrichment-job")
    {
        match status.map(|status| status.as_u16()) {
            Some(400) => {
                return "Structured data request was rejected by OCI. Check the Semantic Store OCID, schema metadata, and request details.".to_string();
            }
            Some(401 | 403) => {
                return "OCI authentication failed. Check the selected IAM profile, key file, and policy permissions.".to_string();
            }
            Some(404) => {
                return "OCI structured data endpoint or resource was not found. Check the Semantic Store OCID, OCI region, base URL, compartment OCID, enrichment job ID, and IAM policy.".to_string();
            }
            Some(429) => {
                return "OCI structured data rate limit reached. Try again in a moment."
                    .to_string();
            }
            Some(500..=599) => {
                return "OCI structured data service is temporarily unavailable. Try again later."
                    .to_string();
            }
            _ => {}
        }
    }

    normalize_ai_status_error_message(status, fallback)
}

pub(crate) fn summarize_ai_provider_error_detail(
    body: &str,
    opc_request_id: Option<&str>,
) -> Option<String> {
    let trimmed = body.trim();
    let mut parts = Vec::new();
    let mut detail_includes_request_id = false;

    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        if let Some(code) = first_json_string_by_keys(&value, &["code", "errorCode", "status"]) {
            parts.push(format!("code={code}"));
        }
        if let Some(message) = first_json_string_by_keys(
            &value,
            &["message", "errorMessage", "errorDescription", "detail"],
        ) {
            parts.push(format!("message={message}"));
        }
        if let Some(request_id) =
            first_json_string_by_keys(&value, &["opc-request-id", "opcRequestId", "requestId"])
        {
            detail_includes_request_id = true;
            parts.push(format!("opc-request-id={request_id}"));
        }
        if parts.is_empty() && !trimmed.is_empty() {
            parts.push(format!("body={}", preview_ai_response_body(trimmed, 360)));
        }
    } else if !trimmed.is_empty() {
        parts.push(format!("body={}", preview_ai_response_body(trimmed, 360)));
    }

    if !detail_includes_request_id {
        if let Some(request_id) = opc_request_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            parts.push(format!("opc-request-id={request_id}"));
        }
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

pub(crate) fn first_json_string_by_keys(value: &Value, keys: &[&str]) -> Option<String> {
    match value {
        Value::Object(map) => {
            for key in keys {
                for (field, candidate) in map {
                    if field.eq_ignore_ascii_case(key) {
                        if let Some(text) = candidate
                            .as_str()
                            .map(str::trim)
                            .filter(|text| !text.is_empty())
                        {
                            return Some(text.to_string());
                        }
                    }
                }
            }

            for candidate in map.values() {
                if let Some(text) = first_json_string_by_keys(candidate, keys) {
                    return Some(text);
                }
            }

            None
        }
        Value::Array(items) => {
            for item in items {
                if let Some(text) = first_json_string_by_keys(item, keys) {
                    return Some(text);
                }
            }

            None
        }
        _ => None,
    }
}

pub(crate) fn build_default_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Failed to initialize AI HTTP client: {error}"))
}

pub(crate) fn unix_timestamp_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

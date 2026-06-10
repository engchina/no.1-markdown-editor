use serde_json::Value;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Runtime};

#[allow(unused_imports)]
use super::*;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct AiFileSearchCallObservation {
    pub(crate) status: Option<String>,
    pub(crate) queries: Vec<String>,
    pub(crate) result_count: Option<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct AiFileSearchObservation {
    pub(crate) calls_by_id: HashMap<String, AiFileSearchCallObservation>,
    pub(crate) ordered_queries: Vec<String>,
    pub(crate) result_previews: Vec<AiRetrievalResultPreview>,
}

impl AiFileSearchObservation {
    pub(crate) fn has_calls(&self) -> bool {
        !self.calls_by_id.is_empty()
    }

    pub(crate) fn total_result_count(&self) -> Option<usize> {
        let mut total = 0;
        let mut has_known_count = false;

        for call in self.calls_by_id.values() {
            if let Some(count) = call.result_count {
                total += count;
                has_known_count = true;
            }
        }

        has_known_count.then_some(total)
    }

    pub(crate) fn first_query(&self) -> Option<String> {
        self.ordered_queries.first().cloned().or_else(|| {
            self.calls_by_id
                .values()
                .flat_map(|call| call.queries.iter().cloned())
                .find(|query| !query.trim().is_empty())
        })
    }

    pub(crate) fn result_previews(&self) -> Vec<AiRetrievalResultPreview> {
        self.result_previews.clone()
    }
}

#[cfg(test)]
pub(crate) fn extract_ai_completion_response(
    response_json: Value,
) -> Result<AiRunCompletionResponse, String> {
    let request_id = response_json
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let model = response_json
        .get("model")
        .and_then(Value::as_str)
        .map(str::to_string);

    let choices = response_json
        .get("choices")
        .and_then(Value::as_array)
        .ok_or_else(|| "AI response did not include choices".to_string())?;
    let first_choice = choices
        .first()
        .ok_or_else(|| "AI response choices were empty".to_string())?;

    let finish_reason = first_choice
        .get("finish_reason")
        .and_then(Value::as_str)
        .map(str::to_string);
    let content = first_choice
        .get("message")
        .and_then(|message| message.get("content"))
        .ok_or_else(|| "AI response did not include message content".to_string())?;
    let text = extract_content_text(content)
        .ok_or_else(|| "AI response content was empty or unsupported".to_string())?;

    Ok(AiRunCompletionResponse {
        text,
        finish_reason,
        model,
        request_id,
        thread_id: None,
        content_type: "markdown".to_string(),
        explanation_text: None,
        warning_text: None,
        source_label: None,
        retrieval_executed: false,
        retrieval_query: None,
        retrieval_results: vec![],
        retrieval_result_count: None,
        generated_sql: None,
        structured_execution_status: None,
        structured_execution_tool_name: None,
    })
}

pub(crate) async fn read_ai_streaming_completion_response<R: Runtime>(
    app: AppHandle<R>,
    request_id: &str,
    mut response: reqwest::Response,
) -> Result<(AiRunCompletionResponse, AiFileSearchObservation), String> {
    let mut event_buffer = String::new();
    let mut text = String::new();
    let mut finish_reason = None;
    let mut model = None;
    let mut provider_request_id = None;
    let mut thread_id = None;
    let mut stream_finished = false;
    let mut file_search_observation = AiFileSearchObservation::default();

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "AI service returned an unreadable response".to_string())?
    {
        event_buffer.push_str(&String::from_utf8_lossy(&chunk));
        normalize_ai_sse_buffer(&mut event_buffer);

        while let Some(event) = take_next_ai_sse_event(&mut event_buffer) {
            let should_finish = apply_ai_stream_event(
                &app,
                request_id,
                &event,
                &mut text,
                &mut finish_reason,
                &mut model,
                &mut provider_request_id,
                &mut thread_id,
                &mut file_search_observation,
            )?;

            if should_finish {
                stream_finished = true;
                break;
            }
        }

        if stream_finished {
            break;
        }
    }

    normalize_ai_sse_buffer(&mut event_buffer);
    if !stream_finished && !event_buffer.trim().is_empty() {
        let _ = apply_ai_stream_event(
            &app,
            request_id,
            event_buffer.trim(),
            &mut text,
            &mut finish_reason,
            &mut model,
            &mut provider_request_id,
            &mut thread_id,
            &mut file_search_observation,
        )?;
    }

    Ok((
        AiRunCompletionResponse {
            text,
            finish_reason,
            model,
            request_id: provider_request_id.or_else(|| Some(request_id.to_string())),
            thread_id,
            content_type: "markdown".to_string(),
            explanation_text: None,
            warning_text: None,
            source_label: None,
            retrieval_executed: false,
            retrieval_query: None,
            retrieval_results: vec![],
            retrieval_result_count: None,
            generated_sql: None,
            structured_execution_status: None,
            structured_execution_tool_name: None,
        },
        file_search_observation,
    ))
}

pub(crate) fn normalize_ai_sse_buffer(buffer: &mut String) {
    if buffer.contains("\r\n") {
        *buffer = buffer.replace("\r\n", "\n");
    }
    if buffer.contains('\r') {
        *buffer = buffer.replace('\r', "\n");
    }
}

pub(crate) fn take_next_ai_sse_event(buffer: &mut String) -> Option<String> {
    let boundary_index = buffer.find("\n\n")?;
    let event = buffer[..boundary_index].to_string();
    buffer.drain(..boundary_index + 2);
    Some(event)
}

pub(crate) fn apply_ai_stream_event<R: Runtime>(
    app: &AppHandle<R>,
    request_id: &str,
    event: &str,
    text: &mut String,
    finish_reason: &mut Option<String>,
    model: &mut Option<String>,
    provider_request_id: &mut Option<String>,
    thread_id: &mut Option<String>,
    file_search_observation: &mut AiFileSearchObservation,
) -> Result<bool, String> {
    let data = collect_ai_sse_data(event);
    if data.is_empty() {
        return Ok(false);
    }
    if data == "[DONE]" {
        return Ok(true);
    }

    let response_json: Value = match serde_json::from_str(&data) {
        Ok(value) => value,
        Err(_) => {
            text.push_str(&data);
            emit_ai_stream_chunk(app, request_id, &data)?;
            return Ok(false);
        }
    };

    if provider_request_id.is_none() {
        *provider_request_id = response_json
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string);
    }
    if model.is_none() {
        *model = response_json
            .get("model")
            .and_then(Value::as_str)
            .map(str::to_string);
    }
    if thread_id.is_none() {
        *thread_id = response_json
            .get("thread_id")
            .and_then(Value::as_str)
            .or_else(|| response_json.get("threadId").and_then(Value::as_str))
            .map(str::to_string);
    }
    collect_ai_file_search_observation(&response_json, file_search_observation);

    let chunk_finish_reason = extract_ai_stream_finish_reason(&response_json);
    if let Some(ref reason) = chunk_finish_reason {
        *finish_reason = Some(reason.clone());
    }

    if let Some(chunk) = extract_ai_stream_chunk(&response_json, !text.is_empty()) {
        text.push_str(&chunk);
        emit_ai_stream_chunk(app, request_id, &chunk)?;
    }

    if chunk_finish_reason.is_some() {
        return Ok(true);
    }

    Ok(false)
}

pub(crate) fn collect_ai_file_search_observation(
    response_json: &Value,
    observation: &mut AiFileSearchObservation,
) {
    match response_json {
        Value::Array(items) => {
            for item in items {
                collect_ai_file_search_observation(item, observation);
            }
        }
        Value::Object(map) => {
            if map.get("type").and_then(Value::as_str) == Some("file_search_call") {
                let call_id = map
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or("file_search_call");
                let entry = observation
                    .calls_by_id
                    .entry(call_id.to_string())
                    .or_default();

                if let Some(status) = map
                    .get("status")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                {
                    entry.status = Some(status.to_string());
                }

                let mut queries = map
                    .get("queries")
                    .and_then(Value::as_array)
                    .map(|values| {
                        values
                            .iter()
                            .filter_map(Value::as_str)
                            .map(str::trim)
                            .filter(|value| !value.is_empty())
                            .map(str::to_string)
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                if queries.is_empty() {
                    if let Some(query) = map
                        .get("query")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                    {
                        queries.push(query.to_string());
                    }
                }
                for query in queries {
                    if !entry.queries.iter().any(|existing| existing == &query) {
                        entry.queries.push(query.clone());
                    }
                    if !observation
                        .ordered_queries
                        .iter()
                        .any(|existing| existing == &query)
                    {
                        observation.ordered_queries.push(query.clone());
                    }
                }

                if let Some(results) = map.get("results") {
                    entry.result_count = Some(resolve_ai_file_search_result_count(results));
                    collect_ai_file_search_result_previews(results, observation);
                } else if let Some(results) = map.get("search_results") {
                    entry.result_count = Some(resolve_ai_file_search_result_count(results));
                    collect_ai_file_search_result_previews(results, observation);
                }
            }

            for nested in map.values() {
                collect_ai_file_search_observation(nested, observation);
            }
        }
        _ => {}
    }
}

pub(crate) fn resolve_ai_file_search_result_count(results: &Value) -> usize {
    results.as_array().map(|items| items.len()).unwrap_or(0)
}

pub(crate) fn collect_ai_file_search_result_previews(
    results: &Value,
    observation: &mut AiFileSearchObservation,
) {
    let Some(items) = results.as_array() else {
        return;
    };

    for (index, item) in items.iter().enumerate() {
        let Some(preview) = extract_ai_file_search_result_preview(item, index) else {
            continue;
        };

        if !observation
            .result_previews
            .iter()
            .any(|existing| existing == &preview)
        {
            observation.result_previews.push(preview);
        }
    }
}

pub(crate) fn extract_ai_file_search_result_preview(
    value: &Value,
    index: usize,
) -> Option<AiRetrievalResultPreview> {
    let map = value.as_object()?;
    let title = read_trimmed_json_string_field(
        map,
        &[
            "filename",
            "file_name",
            "title",
            "document_name",
            "path",
            "source",
            "id",
        ],
    )
    .map(str::to_string)
    .unwrap_or_else(|| format!("Result {}", index + 1));
    let detail = read_trimmed_json_string_field(
        map,
        &["path", "document_path", "source", "document_id", "id"],
    )
    .filter(|detail| *detail != title)
    .map(str::to_string);
    let snippet = extract_ai_file_search_result_snippet(map);

    if title.trim().is_empty() && detail.is_none() && snippet.is_none() {
        return None;
    }

    Some(AiRetrievalResultPreview {
        title,
        detail,
        snippet,
    })
}

pub(crate) fn extract_ai_file_search_result_snippet(
    map: &serde_json::Map<String, Value>,
) -> Option<String> {
    let direct_snippet = read_trimmed_json_string_field(
        map,
        &[
            "text",
            "snippet",
            "excerpt",
            "summary",
            "chunk_text",
            "page_content",
        ],
    )
    .map(str::to_string)
    .or_else(|| map.get("content").and_then(extract_content_text));

    direct_snippet
        .map(|value| truncate_ai_preview_text(&value, 220))
        .filter(|value| !value.is_empty())
}

pub(crate) fn read_trimmed_json_string_field<'a>(
    map: &'a serde_json::Map<String, Value>,
    keys: &[&str],
) -> Option<&'a str> {
    for key in keys {
        let value = map
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if value.is_some() {
            return value;
        }
    }

    None
}

pub(crate) fn truncate_ai_preview_text(value: &str, max_chars: usize) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let truncated = trimmed.chars().take(max_chars).collect::<String>();
    if trimmed.chars().count() <= max_chars {
        truncated
    } else {
        format!("{truncated}...")
    }
}

pub(crate) fn collect_ai_sse_data(event: &str) -> String {
    event
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with(':') {
                return None;
            }

            trimmed
                .strip_prefix("data:")
                .map(|value| value.trim_start().to_string())
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub(crate) fn emit_ai_stream_chunk<R: Runtime>(
    app: &AppHandle<R>,
    request_id: &str,
    chunk: &str,
) -> Result<(), String> {
    app.emit(
        AI_COMPLETION_STREAM_EVENT,
        AiCompletionStreamChunk {
            request_id: request_id.to_string(),
            chunk: chunk.to_string(),
        },
    )
    .map_err(|error| format!("Failed to emit AI stream chunk: {error}"))
}

pub(crate) fn extract_ai_stream_finish_reason(response_json: &Value) -> Option<String> {
    let from_choices = response_json
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| {
            choice
                .get("finish_reason")
                .and_then(Value::as_str)
                .or_else(|| choice.get("finishReason").and_then(Value::as_str))
        })
        .map(str::to_string);

    if from_choices.is_some() {
        return from_choices;
    }

    if let Some(event_type) = response_json.get("type").and_then(Value::as_str) {
        match event_type {
            "response.completed" => return Some("stop".to_string()),
            "response.failed" => return Some("error".to_string()),
            _ => {}
        }
    }

    if response_json
        .get("done")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Some("stop".to_string());
    }

    response_json
        .get("finishReason")
        .and_then(Value::as_str)
        .map(str::to_string)
}

pub(crate) fn extract_ai_stream_chunk(
    response_json: &Value,
    has_buffered_text: bool,
) -> Option<String> {
    if let Some(event_type) = response_json.get("type").and_then(Value::as_str) {
        return extract_ai_typed_stream_chunk(event_type, response_json, has_buffered_text);
    }

    if let Some(delta) = response_json
        .get("delta")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    {
        return Some(delta.to_string());
    }

    if let Some(reply) = response_json
        .get("reply")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    {
        return Some(reply.to_string());
    }

    let first_choice = response_json
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first());

    first_choice
        .and_then(|choice| {
            choice
                .get("delta")
                .and_then(|delta| delta.get("content"))
                .and_then(extract_content_text)
                .or_else(|| {
                    choice
                        .get("message")
                        .and_then(|message| message.get("content"))
                        .and_then(extract_content_text)
                })
                .or_else(|| {
                    choice
                        .get("text")
                        .and_then(Value::as_str)
                        .filter(|value| !value.trim().is_empty())
                        .map(str::to_string)
                })
        })
        .or_else(|| extract_ai_output_array_text(response_json.get("output")))
}

pub(crate) fn extract_ai_typed_stream_chunk(
    event_type: &str,
    response_json: &Value,
    has_buffered_text: bool,
) -> Option<String> {
    match event_type {
        "response.output_text.delta" => response_json
            .get("delta")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string),
        "response.output_text.done" => {
            if has_buffered_text {
                None
            } else {
                response_json
                    .get("text")
                    .and_then(Value::as_str)
                    .filter(|value| !value.trim().is_empty())
                    .map(str::to_string)
            }
        }
        "response.content_part.done" => {
            if has_buffered_text {
                None
            } else {
                response_json
                    .get("part")
                    .and_then(extract_ai_output_item_text)
            }
        }
        "response.output_item.done" => {
            if has_buffered_text {
                None
            } else {
                response_json
                    .get("item")
                    .and_then(extract_ai_output_item_text)
            }
        }
        "response.completed" => {
            if has_buffered_text {
                None
            } else {
                extract_ai_output_array_text(response_json.get("output"))
            }
        }
        _ => None,
    }
}

pub(crate) fn extract_ai_output_array_text(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_array)
        .and_then(|output| output.first())
        .and_then(extract_ai_output_item_text)
}

pub(crate) fn extract_ai_output_item_text(value: &Value) -> Option<String> {
    value
        .get("content")
        .and_then(extract_content_text)
        .or_else(|| {
            value
                .get("text")
                .and_then(Value::as_str)
                .filter(|text| !text.trim().is_empty())
                .map(str::to_string)
        })
}

pub(crate) fn extract_content_text(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return (!text.trim().is_empty()).then_some(text.to_string());
    }

    let parts = value.as_array()?;
    let text = parts
        .iter()
        .filter_map(|part| {
            part.get("text")
                .and_then(Value::as_str)
                .or_else(|| part.get("content").and_then(Value::as_str))
        })
        .collect::<Vec<_>>()
        .join("");

    (!text.trim().is_empty()).then_some(text)
}

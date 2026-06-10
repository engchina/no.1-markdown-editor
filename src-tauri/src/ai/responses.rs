use serde_json::{json, Value};

#[allow(unused_imports)]
use super::*;

pub(crate) fn build_responses_instruction_and_input(
    messages: &[AiRequestMessage],
    prompt: &str,
) -> (Option<String>, String) {
    let mut instructions = None;
    let mut input_parts = vec![];

    for message in messages {
        if message.role == "system" && instructions.is_none() {
            instructions = Some(message.content.trim().to_string());
            continue;
        }

        let content = message.content.trim();
        if content.is_empty() {
            continue;
        }

        input_parts.push(format!("{}:\n{}", message.role, content));
    }

    if input_parts.is_empty() && !prompt.trim().is_empty() {
        input_parts.push(prompt.trim().to_string());
    }

    (instructions, input_parts.join("\n\n"))
}

pub(crate) fn build_oci_responses_payload(
    config: &AiProviderConfig,
    request: &AiRunCompletionRequest,
) -> Result<(Value, Option<String>), String> {
    let (mut instructions, input) =
        build_responses_instruction_and_input(&request.messages, &request.prompt);
    let mut payload = json!({
        "model": config.model,
        "input": input,
        "stream": true,
    });
    let mut source_label = None;

    if request.knowledge_selection.kind == "oracle-unstructured-store" {
        let store = find_unstructured_store_registration(
            config,
            request.knowledge_selection.registration_id.as_deref(),
        )
        .ok_or_else(|| "Selected Oracle unstructured store was not found".to_string())?;
        source_label = Some(store.label.clone());
        instructions = Some(append_document_store_grounding_instructions(
            instructions.as_deref(),
            &store.label,
        ));
        payload["tools"] = json!([{
            "type": "file_search",
            "vector_store_ids": [store.vector_store_id.clone()]
        }]);
        payload["tool_choice"] = json!({
            "type": "file_search"
        });
        payload["include"] = json!(["file_search_call.results"]);
    }

    if let Some(instructions) = instructions.filter(|value| !value.trim().is_empty()) {
        payload["instructions"] = Value::String(instructions);
    }

    Ok((payload, source_label))
}

pub(crate) fn append_document_store_grounding_instructions(
    base_instructions: Option<&str>,
    store_label: &str,
) -> String {
    let grounding_rules = [
        format!(
            "When the document store \"{store_label}\" is selected, you must call the file_search tool before answering."
        ),
        "Base the answer only on information supported by the retrieved document-store results."
            .to_string(),
        "If retrieval returns no relevant results, explicitly say the selected document store does not contain enough information and do not answer from prior knowledge."
            .to_string(),
        "If the retrieved evidence is partial or conflicting, state that uncertainty and keep the answer limited to the retrieved support."
            .to_string(),
    ]
    .join("\n");

    match base_instructions
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(existing) => format!("{existing}\n{grounding_rules}"),
        None => grounding_rules,
    }
}

pub(crate) fn resolve_ai_response_content_type(
    request: &AiRunCompletionRequest,
    hosted_agent: bool,
) -> &'static str {
    if request.knowledge_selection.kind == "oracle-structured-store"
        && request.knowledge_selection.mode.as_deref() == Some("sql-draft")
    {
        return "sql";
    }

    if hosted_agent {
        return if request.output_target == "chat-only" {
            "text"
        } else {
            "markdown"
        };
    }

    if request.output_target == "chat-only" {
        "text"
    } else {
        "markdown"
    }
}

pub(crate) fn ensure_ai_response_contains_text(
    response: AiRunCompletionResponse,
) -> Result<AiRunCompletionResponse, String> {
    if response.text.trim().is_empty() {
        return Err("AI response content was empty or unsupported".to_string());
    }

    Ok(response)
}

pub(crate) fn finalize_document_store_response(
    mut response: AiRunCompletionResponse,
    request: &AiRunCompletionRequest,
    source_label: Option<String>,
    observation: &AiFileSearchObservation,
) -> Result<AiRunCompletionResponse, String> {
    if !observation.has_calls() {
        return Err(
            "Selected document store did not execute retrieval. Check the store configuration and try again."
                .to_string(),
        );
    }

    let result_count = observation.total_result_count();
    let query = observation.first_query();

    if result_count == Some(0) {
        response.text = build_document_store_no_results_text(request);
        response.warning_text = Some(
            "Retrieval completed, but the selected document store returned no relevant passages."
                .to_string(),
        );
    }

    response.source_label = source_label.clone();
    response.retrieval_executed = true;
    response.retrieval_query = query.clone();
    response.retrieval_results = observation.result_previews();
    response.retrieval_result_count = result_count;
    response.explanation_text = Some(build_document_store_grounding_explanation(
        source_label.as_deref(),
        query.as_deref(),
        result_count,
    ));

    ensure_ai_response_contains_text(response)
}

pub(crate) fn build_document_store_grounding_explanation(
    source_label: Option<&str>,
    query: Option<&str>,
    result_count: Option<usize>,
) -> String {
    let mut parts = vec![match source_label {
        Some(label) => format!("Generated with Oracle file search over \"{label}\"."),
        None => "Generated with Oracle file search over the selected document store.".to_string(),
    }];

    match result_count {
        Some(0) => parts.push("Retrieval returned no relevant passages.".to_string()),
        Some(1) => parts.push("Retrieval returned 1 passage.".to_string()),
        Some(count) => parts.push(format!("Retrieval returned {count} passages.")),
        None => parts.push("Retrieval executed before the answer was generated.".to_string()),
    }

    if let Some(query) = query.map(str::trim).filter(|value| !value.is_empty()) {
        parts.push(format!("Retrieved with query: \"{query}\"."));
    }

    parts.join(" ")
}

pub(crate) fn build_document_store_no_results_text(request: &AiRunCompletionRequest) -> String {
    match detect_request_language(request) {
        "ja" => "選択したドキュメントストアから、この質問に答えるための関連情報を見つけられませんでした。質問を具体化するか、ストアの内容を確認してください。".to_string(),
        "zh" => "在所选文档库中没有检索到足够的相关信息，无法仅基于检索结果回答这个问题。请细化问题或检查文档库内容。".to_string(),
        _ => "I couldn't find enough relevant information in the selected document store to answer this request based only on retrieved results. Please refine the question or review the store contents.".to_string(),
    }
}

pub(crate) fn detect_request_language(request: &AiRunCompletionRequest) -> &'static str {
    let sample = request
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "user")
        .map(|message| message.content.trim())
        .filter(|message| !message.is_empty())
        .unwrap_or_else(|| request.prompt.trim());

    if sample
        .chars()
        .any(|character| ('\u{3040}'..='\u{30ff}').contains(&character))
    {
        return "ja";
    }

    if sample
        .chars()
        .any(|character| ('\u{4e00}'..='\u{9fff}').contains(&character))
    {
        return "zh";
    }

    "en"
}

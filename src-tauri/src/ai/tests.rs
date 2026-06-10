use super::apply_ai_project_header;
use super::build_ai_chat_completions_url;
use super::build_ai_enrichment_job_url;
use super::build_ai_enrichment_jobs_url;
use super::build_ai_generate_enrichment_job_url;
use super::build_ai_generate_sql_url;
use super::build_ai_hosted_agent_invoke_url;
use super::build_ai_responses_url;
use super::build_enrichment_job_payload;
use super::build_oci_request_target;
use super::build_oci_responses_payload;
use super::build_oci_signature_headers;
use super::build_user_supplied_sql_draft_response;
use super::collect_ai_file_search_observation;
use super::collect_ai_sse_data;
use super::extract_ai_completion_response;
use super::extract_ai_stream_chunk;
use super::extract_ai_stream_finish_reason;
use super::extract_hosted_agent_oauth_token_response;
use super::extract_mcp_text_response;
use super::extract_nl2sql_sql_text;
use super::finalize_document_store_response;
use super::format_mcp_process_error;
use super::is_read_only_select_sql;
use super::normalize_ai_operation_status_error_message;
use super::normalize_ai_provider_config;
use super::normalize_ai_send_error_message;
use super::normalize_ai_sse_buffer;
use super::normalize_ai_status_error_message;
use super::normalize_ai_status_error_message_with_provider_detail;
use super::normalize_hosted_agent_invoke_status_error;
use super::normalize_hosted_agent_token_status_error;
use super::parse_oci_config_profile;
use super::resolve_mcp_tool_name;
use super::should_use_openai_chat_completions;
use super::take_next_ai_sse_event;
use super::AiEnrichmentJobRequest;
use super::AiFileSearchCallObservation;
use super::AiFileSearchObservation;
use super::AiKnowledgeSelection;
use super::AiOracleHostedAgentProfile;
use super::AiOracleStructuredStoreRegistration;
use super::AiOracleUnstructuredStoreRegistration;
use super::AiProviderConfig;
use super::AiRequestMessage;
use super::AiRetrievalResultPreview;
use super::AiRunCompletionRequest;
use super::AiRunCompletionResponse;
use super::AI_PROVIDER_PROJECT_HEADER;
use reqwest::StatusCode;
use serde_json::{json, Value};
use std::collections::HashMap;

fn sample_unstructured_provider_config() -> AiProviderConfig {
    AiProviderConfig {
        provider: "oci-responses".to_string(),
        base_url: "https://example.com/openai/v1".to_string(),
        model: "gpt-test".to_string(),
        project: "project-123".to_string(),
        unstructured_stores: vec![AiOracleUnstructuredStoreRegistration {
            id: "docs-default".to_string(),
            label: "Product Docs".to_string(),
            vector_store_id: "vs_docs_123".to_string(),
            description: "Product documentation".to_string(),
            enabled: true,
            is_default: true,
        }],
        structured_stores: vec![],
        oci_auth_profiles: vec![],
        hosted_agent_profiles: vec![],
        mcp_execution_profiles: vec![],
    }
}

fn sample_structured_store() -> AiOracleStructuredStoreRegistration {
    AiOracleStructuredStoreRegistration {
        id: "sales-store".to_string(),
        label: "Sales".to_string(),
        semantic_store_id: "semantic-store-1".to_string(),
        compartment_id: "ocid1.compartment.oc1..sales".to_string(),
        store_ocid: "".to_string(),
        oci_auth_profile_id: Some("oci-default".to_string()),
        region_override: "us-chicago-1".to_string(),
        schema_name: "SALES".to_string(),
        description: "".to_string(),
        enabled: true,
        is_default: true,
        default_mode: "agent-answer".to_string(),
        execution_profile_id: Some("mcp-sales".to_string()),
        enrichment_default_mode: "full".to_string(),
        enrichment_object_names: "ORDERS\nCUSTOMERS".to_string(),
    }
}

fn sample_unstructured_request(prompt: &str) -> AiRunCompletionRequest {
    AiRunCompletionRequest {
        request_id: "req_123".to_string(),
        intent: "ask".to_string(),
        scope: "document".to_string(),
        output_target: "chat-only".to_string(),
        prompt: prompt.to_string(),
        messages: vec![
            AiRequestMessage {
                role: "system".to_string(),
                content: "System rules".to_string(),
            },
            AiRequestMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            },
        ],
        execution_target_kind: "direct-provider".to_string(),
        invocation_capability: "rag-unstructured".to_string(),
        knowledge_selection: AiKnowledgeSelection {
            kind: "oracle-unstructured-store".to_string(),
            registration_id: Some("docs-default".to_string()),
            mode: None,
        },
        thread_id: None,
        hosted_agent_profile_id: None,
        generated_sql: None,
    }
}

fn sample_stream_response(text: &str) -> AiRunCompletionResponse {
    AiRunCompletionResponse {
        text: text.to_string(),
        finish_reason: Some("stop".to_string()),
        model: Some("gpt-test".to_string()),
        request_id: Some("resp_123".to_string()),
        thread_id: None,
        content_type: "text".to_string(),
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
    }
}

#[test]
fn provider_route_uses_responses_for_oci_even_without_project() {
    let oci_config = AiProviderConfig {
        provider: "oci-responses".to_string(),
        base_url: "https://example.com/openai/v1".to_string(),
        model: "model-x".to_string(),
        project: "".to_string(),
        oci_auth_profiles: vec![],
        unstructured_stores: vec![],
        structured_stores: vec![],
        mcp_execution_profiles: vec![],
        hosted_agent_profiles: vec![],
    };
    let openai_config = AiProviderConfig {
        provider: "openai-compatible".to_string(),
        base_url: "https://example.com/v1".to_string(),
        model: "gpt-test".to_string(),
        project: "".to_string(),
        oci_auth_profiles: vec![],
        unstructured_stores: vec![],
        structured_stores: vec![],
        mcp_execution_profiles: vec![],
        hosted_agent_profiles: vec![],
    };

    assert!(!should_use_openai_chat_completions(&oci_config));
    assert!(should_use_openai_chat_completions(&openai_config));
}

#[test]
fn normalize_ai_provider_config_trims_and_validates_fields() {
    let config = normalize_ai_provider_config(AiProviderConfig {
        provider: "oci-responses".to_string(),
        base_url: "https://example.com/openai/v1".to_string(),
        model: " gpt-test ".to_string(),
        project: "  project-123  ".to_string(),
        unstructured_stores: vec![],
        structured_stores: vec![],
        oci_auth_profiles: vec![],
        hosted_agent_profiles: vec![],
        mcp_execution_profiles: vec![],
    })
    .expect("normalize provider config");

    assert_eq!(config.provider, "oci-responses");
    assert_eq!(config.base_url, "https://example.com/openai/v1");
    assert_eq!(config.model, "gpt-test");
    assert_eq!(config.project, "project-123");
}

#[test]
fn normalize_ai_provider_config_normalizes_hosted_agent_profile_defaults() {
    let config = normalize_ai_provider_config(AiProviderConfig {
        provider: "oci-responses".to_string(),
        base_url: "https://example.com/openai/v1".to_string(),
        model: "gpt-test".to_string(),
        project: "".to_string(),
        unstructured_stores: vec![],
        structured_stores: vec![],
        oci_auth_profiles: vec![],
        hosted_agent_profiles: vec![AiOracleHostedAgentProfile {
            id: "hosted-agent-1".to_string(),
            label: "Travel Agent".to_string(),
            oci_region: " us-chicago-1 ".to_string(),
            hosted_application_ocid:
                " ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest ".to_string(),
            api_version: "".to_string(),
            api_action: "".to_string(),
            domain_url: "https://idcs.example.com".to_string(),
            client_id: " client-id ".to_string(),
            scope: " https://k8scloud.site/invoke ".to_string(),
            transport: "http-json".to_string(),
        }],
        mcp_execution_profiles: vec![],
    })
    .expect("normalize provider config");

    let profile = config
        .hosted_agent_profiles
        .first()
        .expect("hosted agent profile");
    assert_eq!(profile.oci_region, "us-chicago-1");
    assert_eq!(
        profile.hosted_application_ocid,
        "ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest"
    );
    assert_eq!(profile.api_version, "20251112");
    assert_eq!(profile.api_action, "chat");
    assert_eq!(profile.client_id, "client-id");
    assert_eq!(profile.scope, "https://k8scloud.site/invoke");
}

#[test]
fn normalize_ai_provider_config_preserves_custom_api_action() {
    let config = normalize_ai_provider_config(AiProviderConfig {
        provider: "oci-responses".to_string(),
        base_url: "https://example.com/openai/v1".to_string(),
        model: "gpt-test".to_string(),
        project: "".to_string(),
        unstructured_stores: vec![],
        structured_stores: vec![],
        oci_auth_profiles: vec![],
        hosted_agent_profiles: vec![AiOracleHostedAgentProfile {
            id: "hosted-agent-1".to_string(),
            label: "Travel Agent".to_string(),
            oci_region: "us-chicago-1".to_string(),
            hosted_application_ocid:
                "ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest".to_string(),
            api_version: "20251112".to_string(),
            api_action: " /completion/ ".to_string(),
            domain_url: "https://idcs.example.com".to_string(),
            client_id: "client-id".to_string(),
            scope: "scope".to_string(),
            transport: "http-json".to_string(),
        }],
        mcp_execution_profiles: vec![],
    })
    .expect("normalize provider config");

    let profile = config
        .hosted_agent_profiles
        .first()
        .expect("hosted agent profile");
    assert_eq!(profile.api_action, "completion");
}

#[test]
fn normalize_ai_provider_config_keeps_one_structured_store_default() {
    let mut first = sample_structured_store();
    first.id = "data-first".to_string();
    first.is_default = true;
    let mut duplicate = sample_structured_store();
    duplicate.id = "data-duplicate".to_string();
    duplicate.is_default = true;

    let config = normalize_ai_provider_config(AiProviderConfig {
        provider: "oci-responses".to_string(),
        base_url: "https://example.com/openai/v1".to_string(),
        model: "gpt-test".to_string(),
        project: "".to_string(),
        unstructured_stores: vec![],
        structured_stores: vec![first, duplicate],
        oci_auth_profiles: vec![],
        hosted_agent_profiles: vec![],
        mcp_execution_profiles: vec![],
    })
    .expect("normalize provider config");

    assert!(config.structured_stores[0].is_default);
    assert!(!config.structured_stores[1].is_default);
}

#[test]
fn build_ai_chat_completions_url_appends_chat_completions_path() {
    let url =
        build_ai_chat_completions_url("https://example.com/v1").expect("build completion url");
    assert_eq!(url.as_str(), "https://example.com/v1/chat/completions");
}

#[test]
fn build_ai_responses_url_appends_responses_path() {
    let url = build_ai_responses_url("https://example.com/openai/v1").expect("build responses url");
    assert_eq!(url.as_str(), "https://example.com/openai/v1/responses");
}

#[test]
fn build_ai_generate_sql_url_uses_inference_root() {
    let mut config = sample_unstructured_provider_config();
    config.base_url = "https://genai.oci.us-chicago-1.oraclecloud.com/openai/v1".to_string();
    let store = sample_structured_store();
    let url = build_ai_generate_sql_url(&config, &store).expect("build generate sql url");
    assert_eq!(
        url.as_str(),
        "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/semantic-store-1/actions/generateSqlFromNl"
    );
}

#[test]
fn build_ai_generate_sql_url_preserves_custom_non_oci_roots() {
    let mut config = sample_unstructured_provider_config();
    config.base_url = "https://example.com/openai/v1".to_string();
    let store = sample_structured_store();
    let url = build_ai_generate_sql_url(&config, &store).expect("build generate sql url");
    assert_eq!(
        url.as_str(),
        "https://example.com/20260325/semanticStores/semantic-store-1/actions/generateSqlFromNl"
    );
}

#[test]
fn build_ai_enrichment_job_urls_use_20260325_operation_paths() {
    let mut config = sample_unstructured_provider_config();
    config.base_url = "https://genai.oci.us-chicago-1.oraclecloud.com/openai/v1".to_string();
    let store = sample_structured_store();

    let list =
        build_ai_enrichment_jobs_url(&config, &store, None).expect("build enrichment jobs url");
    assert_eq!(
        list.as_str(),
        "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/semantic-store-1/enrichmentJobs?compartmentId=ocid1.compartment.oc1..sales&sortBy=timeCreated&sortOrder=DESC&limit=10"
    );

    let list_with_override =
        build_ai_enrichment_jobs_url(&config, &store, Some("ocid1.compartment.oc1..unsaved"))
            .expect("build enrichment jobs url with current form value");
    assert_eq!(
        list_with_override.as_str(),
        "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/semantic-store-1/enrichmentJobs?compartmentId=ocid1.compartment.oc1..unsaved&sortBy=timeCreated&sortOrder=DESC&limit=10"
    );

    let generate = build_ai_generate_enrichment_job_url(&config, &store)
        .expect("build generate enrichment url");
    assert_eq!(
        generate.as_str(),
        "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/semantic-store-1/actions/enrich"
    );

    let job = build_ai_enrichment_job_url(&config, &store, "enrichment-job-1")
        .expect("build enrichment job url");
    assert_eq!(
        job.as_str(),
        "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/semantic-store-1/enrichmentJobs/enrichment-job-1"
    );
}

#[test]
fn build_ai_enrichment_jobs_url_requires_compartment_id_for_list() {
    let mut config = sample_unstructured_provider_config();
    config.base_url = "https://genai.oci.us-chicago-1.oraclecloud.com/openai/v1".to_string();
    let mut store = sample_structured_store();
    store.compartment_id.clear();
    store.store_ocid.clear();

    let error = build_ai_enrichment_jobs_url(&config, &store, None)
        .expect_err("list enrichment jobs requires compartment id");
    assert_eq!(
        error,
        "Compartment OCID is required to refresh enrichment jobs"
    );
}

#[test]
fn build_enrichment_job_payload_supports_full_and_partial_builds() {
    let store = sample_structured_store();
    let full = build_enrichment_job_payload(
        &store,
        &AiEnrichmentJobRequest {
            structured_store_id: store.id.clone(),
            mode: "full".to_string(),
            schema_name: "".to_string(),
            database_objects: vec![],
        },
    )
    .expect("full payload");
    assert_eq!(full["enrichmentJobType"], "FULL_BUILD");
    assert_eq!(
        full["enrichmentJobConfiguration"]["enrichmentJobType"],
        "FULL_BUILD"
    );
    assert_eq!(full["enrichmentJobConfiguration"]["schemaName"], "SALES");

    let delta = build_enrichment_job_payload(
        &store,
        &AiEnrichmentJobRequest {
            structured_store_id: store.id.clone(),
            mode: "delta".to_string(),
            schema_name: "OPS".to_string(),
            database_objects: vec![],
        },
    );
    assert!(delta
        .expect_err("delta needs a schedule")
        .contains("Delta enrichment requires a refresh schedule"));

    let partial = build_enrichment_job_payload(
        &store,
        &AiEnrichmentJobRequest {
            structured_store_id: store.id.clone(),
            mode: "partial".to_string(),
            schema_name: "".to_string(),
            database_objects: vec!["ORDERS".to_string()],
        },
    )
    .expect("partial payload");
    assert_eq!(partial["enrichmentJobType"], "PARTIAL_BUILD");
    assert_eq!(
        partial["enrichmentJobConfiguration"]["enrichmentJobType"],
        "PARTIAL_BUILD"
    );
    assert_eq!(
        partial["enrichmentJobConfiguration"]["databaseObjects"],
        json!([{ "name": "ORDERS", "type": "TABLE" }])
    );
}

#[test]
fn parse_oci_config_profile_reads_default_and_named_profiles() {
    let raw = r#"
[DEFAULT]
region = us-chicago-1
tenancy = ocid1.tenancy.oc1..default
user = ocid1.user.oc1..default

[SALES]
region = us-ashburn-1
fingerprint = aa:bb
key_file = ~/.oci/sales.pem
"#;

    let default_profile = parse_oci_config_profile(raw, "DEFAULT");
    assert_eq!(
        default_profile.get("region").map(String::as_str),
        Some("us-chicago-1")
    );
    assert_eq!(
        default_profile.get("tenancy").map(String::as_str),
        Some("ocid1.tenancy.oc1..default")
    );

    let sales_profile = parse_oci_config_profile(raw, "SALES");
    assert_eq!(
        sales_profile.get("region").map(String::as_str),
        Some("us-ashburn-1")
    );
    assert_eq!(
        sales_profile.get("fingerprint").map(String::as_str),
        Some("aa:bb")
    );
    assert_eq!(
        sales_profile.get("key_file").map(String::as_str),
        Some("~/.oci/sales.pem")
    );
}

#[test]
fn build_oci_request_target_preserves_query_string() {
    let url = reqwest::Url::parse("https://example.com/20260325/resource?limit=10&page=abc")
        .expect("url");
    assert_eq!(
        build_oci_request_target("GET", &url),
        "get /20260325/resource?limit=10&page=abc"
    );
}

#[test]
fn build_oci_signature_headers_uses_minimal_get_headers() {
    let url = reqwest::Url::parse(
        "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/store/enrichmentJobs?compartmentId=ocid1.compartment.oc1..sales",
    )
    .expect("url");
    let headers = build_oci_signature_headers("GET", &url, "Tue, 28 Apr 2026 08:39:00 GMT", "")
        .expect("headers");
    let names = headers.iter().map(|(name, _)| *name).collect::<Vec<_>>();

    assert_eq!(names, vec!["date", "(request-target)", "host"]);
    assert_eq!(
        headers.get(1).map(|(_, value)| value.as_str()),
        Some("get /20260325/semanticStores/store/enrichmentJobs?compartmentId=ocid1.compartment.oc1..sales")
    );
}

#[test]
fn build_oci_signature_headers_includes_body_headers_for_post() {
    let url = reqwest::Url::parse(
        "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/store/actions/enrich",
    )
    .expect("url");
    let headers = build_oci_signature_headers(
        "POST",
        &url,
        "Tue, 28 Apr 2026 08:39:00 GMT",
        "{\"enrichmentJobType\":\"FULL_BUILD\"}",
    )
    .expect("headers");
    let names = headers.iter().map(|(name, _)| *name).collect::<Vec<_>>();

    assert_eq!(
        names,
        vec![
            "date",
            "(request-target)",
            "host",
            "x-content-sha256",
            "content-type",
            "content-length"
        ]
    );
    assert_eq!(
        headers
            .iter()
            .find(|(name, _)| *name == "content-length")
            .map(|(_, value)| value.as_str()),
        Some("34")
    );
}

#[test]
fn mcp_helpers_resolve_tool_names_and_text_content() {
    let single_tool = json!({
        "result": { "tools": [{ "name": "query_sales_database" }] }
    });
    assert_eq!(
        resolve_mcp_tool_name(&single_tool, "").expect("single tool"),
        "query_sales_database"
    );

    let ambiguous = json!({
        "result": { "tools": [{ "name": "query_a" }, { "name": "query_b" }] }
    });
    assert!(resolve_mcp_tool_name(&ambiguous, "").is_err());
    assert_eq!(
        resolve_mcp_tool_name(&ambiguous, "query_b").expect("configured tool"),
        "query_b"
    );

    let call_response = json!({
        "result": {
            "content": [
                { "type": "text", "text": "Answer line 1" },
                { "type": "text", "text": "Answer line 2" }
            ]
        }
    });
    assert_eq!(
        extract_mcp_text_response(&call_response).as_deref(),
        Some("Answer line 1\nAnswer line 2")
    );
}

#[test]
fn mcp_process_error_includes_stderr_and_npm_offline_hint() {
    let error = format_mcp_process_error(
        "Failed to read MCP response header: failed to fill whole buffer",
        Some("exit code 1"),
        "npm error code ENOTCACHED\nnpm error request to https://registry.npmjs.org/mcp-remote failed: cache mode is 'only-if-cached' but no cached response is available.",
    );

    assert!(error.contains("MCP process exited before sending a response header"));
    assert!(error.contains("MCP process status: exit code 1"));
    assert!(error.contains("npm is running in offline/cache-only mode"));
    assert!(error.contains("ENOTCACHED"));
}

#[test]
fn mcp_process_error_includes_remote_dns_hint() {
    let error = format_mcp_process_error(
        "Failed to read MCP response header: failed to fill whole buffer",
        Some("exit code 1"),
        "TypeError: fetch failed\nCaused by: Error: getaddrinfo ENOTFOUND genai.oci.us-chicago-1.oraclecloud.com",
    );

    assert!(error.contains("MCP process exited before sending a response header"));
    assert!(error.contains("MCP remote server hostname could not be resolved"));
    assert!(error.contains("DNS/network/proxy"));
    assert!(error.contains("Oracle GenAI MCP server URL/region"));
    assert!(error.contains("ENOTFOUND"));
}

#[test]
fn read_only_sql_guard_blocks_non_select_statements() {
    assert!(is_read_only_select_sql("SELECT * FROM orders"));
    assert!(is_read_only_select_sql(
        "WITH recent AS (SELECT * FROM orders) SELECT * FROM recent"
    ));
    assert!(!is_read_only_select_sql("DELETE FROM orders"));
    assert!(!is_read_only_select_sql(
        "SELECT * FROM orders; DROP TABLE orders"
    ));
}

#[test]
fn user_supplied_select_sql_becomes_local_sql_draft() {
    let store = sample_structured_store();
    let mut request = sample_unstructured_request("select * from employees");
    request.knowledge_selection = AiKnowledgeSelection {
        kind: "oracle-structured-store".to_string(),
        registration_id: Some(store.id.clone()),
        mode: Some("sql-draft".to_string()),
    };

    let response = build_user_supplied_sql_draft_response(&store, &request)
        .expect("read-only SQL prompt should become a local draft");

    assert_eq!(response.text, "select * from employees");
    assert_eq!(response.content_type, "sql");
    assert_eq!(
        response.generated_sql.as_deref(),
        Some("select * from employees")
    );
    assert_eq!(response.model.as_deref(), Some("user-supplied-sql"));
    assert!(response
        .explanation_text
        .as_deref()
        .unwrap_or_default()
        .contains("No NL2SQL request was sent"));
}

#[test]
fn user_supplied_non_select_sql_is_not_used_as_a_local_sql_draft() {
    let store = sample_structured_store();
    let request = sample_unstructured_request("delete from employees");

    assert!(build_user_supplied_sql_draft_response(&store, &request).is_none());
}

#[test]
fn build_ai_hosted_agent_invoke_url_uses_region_ocid_and_action() {
    let url = build_ai_hosted_agent_invoke_url(&AiOracleHostedAgentProfile {
        id: "hosted-agent-1".to_string(),
        label: "Travel Agent".to_string(),
        oci_region: "us-chicago-1".to_string(),
        hosted_application_ocid:
            "ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest".to_string(),
        api_version: "20251112".to_string(),
        api_action: "chat".to_string(),
        domain_url: "https://idcs.example.com".to_string(),
        client_id: "client-id".to_string(),
        scope: "scope".to_string(),
        transport: "http-json".to_string(),
    })
    .expect("build oci hosted invoke url");
    assert_eq!(
        url.as_str(),
        "https://application.generativeai.us-chicago-1.oci.oraclecloud.com/20251112/hostedApplications/ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest/actions/invoke/chat"
    );
}

#[test]
fn normalize_hosted_agent_invoke_status_error_explains_oci_404() {
    let message = normalize_hosted_agent_invoke_status_error(
        &AiOracleHostedAgentProfile {
            id: "hosted-agent-1".to_string(),
            label: "Travel Agent".to_string(),
            oci_region: "us-chicago-1".to_string(),
            hosted_application_ocid:
                "ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest"
                    .to_string(),
            api_version: "20251112".to_string(),
            api_action: "chat".to_string(),
            domain_url: "https://idcs.example.com".to_string(),
            client_id: "client-id".to_string(),
            scope: "scope".to_string(),
            transport: "http-json".to_string(),
        },
        Some(StatusCode::NOT_FOUND),
        "https://application.generativeai.us-chicago-1.oci.oraclecloud.com/20251112/hostedApplications/ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest/actions/invoke/chat",
        "not found",
        None,
        None,
    );

    assert!(message.contains("Hosted agent endpoint was not found"));
    assert!(message.contains("OCI region"));
    assert!(message.contains("hosted application OCID"));
    assert!(message.contains("API action"));
}

#[test]
fn normalize_hosted_agent_invoke_status_error_surfaces_audience_mismatch_context() {
    let message = normalize_hosted_agent_invoke_status_error(
        &AiOracleHostedAgentProfile {
            id: "hosted-agent-1".to_string(),
            label: "Travel Agent".to_string(),
            oci_region: "us-chicago-1".to_string(),
            hosted_application_ocid:
                "ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest"
                    .to_string(),
            api_version: "20251112".to_string(),
            api_action: "chat".to_string(),
            domain_url: "https://idcs.example.com".to_string(),
            client_id: "client-id".to_string(),
            scope: "https://k8scloud.site/invoke".to_string(),
            transport: "http-json".to_string(),
        },
        Some(StatusCode::UNAUTHORIZED),
        "https://application.generativeai.us-chicago-1.oci.oraclecloud.com/20251112/hostedApplications/ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest/actions/invoke/chat",
        "invalid_token: audience mismatch",
        Some(&Value::String("https://k8scloud.site/".to_string())),
        Some(&Value::String("invoke".to_string())),
    );

    assert!(message.contains("Hosted Application OCID"));
    assert!(message.contains("hosted_application_ocid=ocid1.generativeaihostedapplication"));
    assert!(message.contains("token_aud=https://k8scloud.site/"));
    assert!(message.contains("configured_scope=https://k8scloud.site/invoke"));
    assert!(message.contains("token audience does not match"));
}

#[test]
fn extract_ai_completion_response_supports_string_content() {
    let response = extract_ai_completion_response(json!({
        "id": "req_123",
        "model": "gpt-test",
        "choices": [{
            "finish_reason": "stop",
            "message": {
                "content": "Hello from AI"
            }
        }]
    }))
    .expect("extract string response");

    assert_eq!(response.text, "Hello from AI");
    assert_eq!(response.finish_reason.as_deref(), Some("stop"));
    assert_eq!(response.model.as_deref(), Some("gpt-test"));
    assert_eq!(response.request_id.as_deref(), Some("req_123"));
    assert_eq!(response.content_type, "markdown");
}

#[test]
fn extract_ai_completion_response_supports_array_content() {
    let response = extract_ai_completion_response(json!({
        "choices": [{
            "message": {
                "content": [
                    { "type": "text", "text": "Hello " },
                    { "type": "text", "text": "world" }
                ]
            }
        }]
    }))
    .expect("extract array response");

    assert_eq!(response.text, "Hello world");
}

#[test]
fn extract_nl2sql_sql_text_reads_generated_sql_variants() {
    assert_eq!(
        extract_nl2sql_sql_text(&json!({ "generatedSql": "SELECT 1" })).as_deref(),
        Some("SELECT 1")
    );
    assert_eq!(
        extract_nl2sql_sql_text(&json!({ "sql": "SELECT 2" })).as_deref(),
        Some("SELECT 2")
    );
    assert_eq!(
        extract_nl2sql_sql_text(&json!({ "jobOutput": { "content": "SELECT 3" } })).as_deref(),
        Some("SELECT 3")
    );
    assert_eq!(
        extract_nl2sql_sql_text(&json!({ "jobOutput": { "content": [{ "text": "SELECT 4" }] } }))
            .as_deref(),
        Some("SELECT 4")
    );
}

#[test]
fn normalize_ai_sse_buffer_and_take_next_event_support_crlf_boundaries() {
    let mut buffer =
        "data: {\"choices\":[{\"delta\":{\"content\":\"Hello \"}}]}\r\n\r\ndata: [DONE]\r\n\r\n"
            .to_string();
    normalize_ai_sse_buffer(&mut buffer);

    let first_event = take_next_ai_sse_event(&mut buffer).expect("first sse event");
    let second_event = take_next_ai_sse_event(&mut buffer).expect("second sse event");

    assert_eq!(
        first_event,
        "data: {\"choices\":[{\"delta\":{\"content\":\"Hello \"}}]}"
    );
    assert_eq!(second_event, "data: [DONE]");
}

#[test]
fn collect_ai_sse_data_joins_multiple_data_lines() {
    let payload = collect_ai_sse_data(
        "event: completion\ndata: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\ndata: {\"tail\":true}",
    );

    assert_eq!(
        payload,
        "{\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n{\"tail\":true}"
    );
}

#[test]
fn extract_ai_stream_chunk_supports_chat_and_responses_events() {
    assert_eq!(
        extract_ai_stream_chunk(
            &json!({
                "choices": [{
                    "delta": { "content": "Hello " },
                    "finish_reason": null
                }]
            }),
            false
        )
        .as_deref(),
        Some("Hello ")
    );

    assert_eq!(
        extract_ai_stream_chunk(
            &json!({
                "type": "response.output_text.delta",
                "delta": "world"
            }),
            false
        )
        .as_deref(),
        Some("world")
    );
}

#[test]
fn extract_ai_stream_chunk_ignores_tool_argument_deltas_and_terminal_replays() {
    assert_eq!(
        extract_ai_stream_chunk(
            &json!({
                "type": "response.function_call_arguments.delta",
                "delta": "{\"query\":\"Who is Mei's sister?\"}"
            }),
            false
        ),
        None
    );

    assert_eq!(
        extract_ai_stream_chunk(
            &json!({
                "type": "response.output_text.done",
                "text": "Mei's sister is Satsuki."
            }),
            true
        ),
        None
    );

    assert_eq!(
        extract_ai_stream_chunk(
            &json!({
                "type": "response.completed",
                "output": [{
                    "content": [{ "text": "Mei's sister is Satsuki." }]
                }]
            }),
            true
        ),
        None
    );
}

#[test]
fn extract_ai_stream_finish_reason_reads_terminal_choice_metadata() {
    assert_eq!(
        extract_ai_stream_finish_reason(&json!({
            "choices": [{
                "delta": {},
                "finish_reason": "stop"
            }]
        }))
        .as_deref(),
        Some("stop")
    );

    assert_eq!(
        extract_ai_stream_finish_reason(&json!({
            "type": "response.completed"
        }))
        .as_deref(),
        Some("stop")
    );
}

#[test]
fn apply_ai_project_header_adds_header_when_project_is_present() {
    let request = apply_ai_project_header(
        reqwest::Client::new().post("https://example.com/v1/chat/completions"),
        "project-123",
    )
    .build()
    .expect("build request");

    assert_eq!(
        request
            .headers()
            .get(AI_PROVIDER_PROJECT_HEADER)
            .and_then(|value| value.to_str().ok()),
        Some("project-123")
    );
}

#[test]
fn apply_ai_project_header_omits_header_when_project_is_empty() {
    let request = apply_ai_project_header(
        reqwest::Client::new().post("https://example.com/v1/chat/completions"),
        "   ",
    )
    .build()
    .expect("build request");

    assert!(request.headers().get(AI_PROVIDER_PROJECT_HEADER).is_none());
}

#[test]
fn normalize_ai_send_error_message_maps_timeout_and_connect_failures() {
    assert_eq!(
        normalize_ai_send_error_message(true, false, "timed out"),
        "AI request timed out"
    );
    assert_eq!(
        normalize_ai_send_error_message(false, true, "offline"),
        "Unable to reach the AI service. Check your network connection"
    );
    assert!(normalize_ai_send_error_message(false, false, "boom").starts_with("AI request failed:"));
}

#[test]
fn normalize_ai_status_error_message_maps_common_provider_status_codes() {
    assert_eq!(
        normalize_ai_status_error_message(Some(StatusCode::UNAUTHORIZED), "unauthorized"),
        "AI authentication failed. Check your API key and project settings"
    );
    assert_eq!(
        normalize_ai_status_error_message(Some(StatusCode::TOO_MANY_REQUESTS), "rate limit"),
        "AI rate limit reached. Try again in a moment"
    );
    assert_eq!(
        normalize_ai_status_error_message(Some(StatusCode::BAD_GATEWAY), "bad gateway"),
        "AI service is temporarily unavailable. Try again later"
    );
}

#[test]
fn normalize_ai_status_error_message_surfaces_provider_error_body() {
    let message = normalize_ai_status_error_message_with_provider_detail(
        Some(StatusCode::NOT_FOUND),
        r#"{"code":"NotAuthorizedOrNotFound","message":"resource not found","opc-request-id":"req-123"}"#,
        "ai:get-enrichment-job",
        None,
    );

    assert!(message.contains("OCI structured data endpoint or resource was not found"));
    assert!(message.contains("Provider detail (ai:get-enrichment-job)"));
    assert!(message.contains("code=NotAuthorizedOrNotFound"));
    assert!(message.contains("message=resource not found"));
    assert!(message.contains("opc-request-id=req-123"));
}

#[test]
fn normalize_ai_operation_status_error_message_explains_structured_data_404() {
    assert_eq!(
        normalize_ai_operation_status_error_message(
            "ai:generate-sql-from-nl",
            Some(StatusCode::NOT_FOUND),
            "not found"
        ),
        "OCI structured data endpoint or resource was not found. Check the Semantic Store OCID, OCI region, base URL, compartment OCID, enrichment job ID, and IAM policy."
    );
    assert_eq!(
        normalize_ai_operation_status_error_message(
            "ai:chat",
            Some(StatusCode::NOT_FOUND),
            "not found"
        ),
        normalize_ai_status_error_message(Some(StatusCode::NOT_FOUND), "not found")
    );
}

#[test]
fn extract_hosted_agent_oauth_token_response_supports_string_expires_in() {
    let token = extract_hosted_agent_oauth_token_response(
        r#"{"access_token":"token-123","expires_in":"3600"}"#,
    )
    .expect("parse oauth token");

    assert_eq!(token.access_token, "token-123");
    assert_eq!(token.expires_in, Some(3600));
}

#[test]
fn extract_hosted_agent_oauth_token_response_surfaces_oauth_errors() {
    let error = extract_hosted_agent_oauth_token_response(
        r#"{"error":"invalid_client","error_description":"Client authentication failed"}"#,
    )
    .expect_err("oauth error");

    assert!(error.contains("invalid_client"));
    assert!(error.contains("Client authentication failed"));
}

#[test]
fn extract_hosted_agent_oauth_token_response_includes_body_preview_for_non_json() {
    let error =
        extract_hosted_agent_oauth_token_response("<html><body>Sign in required</body></html>")
            .expect_err("non json error");

    assert!(error.contains("non-JSON content"));
    assert!(error.contains("Sign in required"));
}

#[test]
fn normalize_hosted_agent_token_status_error_includes_oauth_error_details() {
    let message = normalize_hosted_agent_token_status_error(
        StatusCode::UNAUTHORIZED,
        "application/json",
        r#"{"error":"invalid_client","error_description":"Bad client secret"}"#,
    );

    assert!(message.contains("Hosted agent authentication failed"));
    assert!(message.contains("invalid_client"));
    assert!(message.contains("Bad client secret"));
}

#[test]
fn build_oci_responses_payload_for_document_store_forces_file_search_and_includes_results() {
    let config = sample_unstructured_provider_config();
    let request = sample_unstructured_request("What's New for Oracle AI Vector Search?");

    let (payload, source_label) =
        build_oci_responses_payload(&config, &request).expect("build payload");

    assert_eq!(source_label.as_deref(), Some("Product Docs"));
    assert_eq!(
        payload
            .get("tool_choice")
            .and_then(|value| value.get("type"))
            .and_then(Value::as_str),
        Some("file_search")
    );
    assert_eq!(
        payload
            .get("include")
            .and_then(Value::as_array)
            .and_then(|items| items.first())
            .and_then(Value::as_str),
        Some("file_search_call.results")
    );
    assert_eq!(
        payload
            .get("tools")
            .and_then(Value::as_array)
            .and_then(|items| items.first())
            .and_then(|tool| tool.get("vector_store_ids"))
            .and_then(Value::as_array)
            .and_then(|items| items.first())
            .and_then(Value::as_str),
        Some("vs_docs_123")
    );

    let instructions = payload
        .get("instructions")
        .and_then(Value::as_str)
        .expect("document-store instructions");
    assert!(instructions.contains("System rules"));
    assert!(instructions.contains("must call the file_search tool before answering"));
    assert!(instructions.contains("do not answer from prior knowledge"));
}

#[test]
fn collect_ai_file_search_observation_reads_nested_completed_response_items() {
    let mut observation = AiFileSearchObservation::default();

    collect_ai_file_search_observation(
        &json!({
            "type": "response.completed",
            "response": {
                "output": [
                    {
                        "type": "file_search_call",
                        "id": "fs_1",
                        "status": "completed",
                        "queries": ["oracle ai vector search"],
                        "results": [
                            { "filename": "whats-new.md", "text": "Vector search now supports richer passage retrieval." },
                            { "filename": "release-notes.md", "text": "Release notes highlight ranking improvements." }
                        ]
                    },
                    {
                        "type": "message",
                        "id": "msg_1",
                        "status": "completed",
                        "role": "assistant",
                        "content": [
                            { "type": "output_text", "text": "Answer" }
                        ]
                    }
                ]
            }
        }),
        &mut observation,
    );

    assert!(observation.has_calls());
    assert_eq!(observation.total_result_count(), Some(2));
    assert_eq!(
        observation.first_query().as_deref(),
        Some("oracle ai vector search")
    );
    assert_eq!(
        observation
            .calls_by_id
            .get("fs_1")
            .and_then(|call| call.status.as_deref()),
        Some("completed")
    );
    assert_eq!(observation.result_previews.len(), 2);
    assert_eq!(observation.result_previews[0].title, "whats-new.md");
    assert_eq!(
        observation.result_previews[0].snippet.as_deref(),
        Some("Vector search now supports richer passage retrieval.")
    );
}

#[test]
fn finalize_document_store_response_replaces_answer_when_results_are_empty() {
    let request = sample_unstructured_request("この文書ストアを使って最新情報を教えてください");
    let response = sample_stream_response("Hallucinated answer");
    let observation = AiFileSearchObservation {
        calls_by_id: HashMap::from([(
            "fs_1".to_string(),
            AiFileSearchCallObservation {
                status: Some("completed".to_string()),
                queries: vec!["oracle ai vector search".to_string()],
                result_count: Some(0),
            },
        )]),
        ordered_queries: vec!["oracle ai vector search".to_string()],
        result_previews: vec![],
    };

    let finalized = finalize_document_store_response(
        response,
        &request,
        Some("Product Docs".to_string()),
        &observation,
    )
    .expect("finalize document-store response");

    assert!(finalized.text.contains("関連情報を見つけられませんでした"));
    assert_eq!(finalized.source_label.as_deref(), Some("Product Docs"));
    assert_eq!(
        finalized.retrieval_query.as_deref(),
        Some("oracle ai vector search")
    );
    assert_eq!(finalized.retrieval_result_count, Some(0));
    assert!(finalized.retrieval_results.is_empty());
    assert_eq!(
        finalized.warning_text.as_deref(),
        Some("Retrieval completed, but the selected document store returned no relevant passages.")
    );
    assert!(finalized
        .explanation_text
        .as_deref()
        .unwrap_or_default()
        .contains("Retrieval returned no relevant passages."));
}

#[test]
fn finalize_document_store_response_exposes_retrieval_query_and_results() {
    let request = sample_unstructured_request("メイのあねはだれですか？");
    let response = sample_stream_response("メイの姉はサツキです。");
    let observation = AiFileSearchObservation {
        calls_by_id: HashMap::from([(
            "fs_1".to_string(),
            AiFileSearchCallObservation {
                status: Some("completed".to_string()),
                queries: vec!["Who is Mei's sister?".to_string()],
                result_count: Some(1),
            },
        )]),
        ordered_queries: vec!["Who is Mei's sister?".to_string()],
        result_previews: vec![AiRetrievalResultPreview {
            title: "totoro-character-guide.md".to_string(),
            detail: Some("references/totoro-character-guide.md".to_string()),
            snippet: Some("Satsuki is Mei's older sister and acts as her guardian.".to_string()),
        }],
    };

    let finalized = finalize_document_store_response(
        response,
        &request,
        Some("Product Docs".to_string()),
        &observation,
    )
    .expect("finalize document-store response");

    assert_eq!(finalized.text, "メイの姉はサツキです。");
    assert_eq!(
        finalized.retrieval_query.as_deref(),
        Some("Who is Mei's sister?")
    );
    assert_eq!(finalized.retrieval_result_count, Some(1));
    assert_eq!(finalized.retrieval_results.len(), 1);
    assert_eq!(
        finalized.retrieval_results[0].title,
        "totoro-character-guide.md"
    );
}

#[test]
fn finalize_document_store_response_keeps_query_for_insertable_markdown_outputs() {
    let mut request = sample_unstructured_request("Draft a paragraph about Mei.");
    request.output_target = "insert-below".to_string();
    let response = sample_stream_response("Mei's sister is Satsuki.");
    let observation = AiFileSearchObservation {
        calls_by_id: HashMap::from([(
            "fs_1".to_string(),
            AiFileSearchCallObservation {
                status: Some("completed".to_string()),
                queries: vec!["Who is Mei's sister?".to_string()],
                result_count: Some(1),
            },
        )]),
        ordered_queries: vec!["Who is Mei's sister?".to_string()],
        result_previews: vec![],
    };

    let finalized = finalize_document_store_response(
        response,
        &request,
        Some("Product Docs".to_string()),
        &observation,
    )
    .expect("finalize document-store response");

    assert_eq!(finalized.text, "Mei's sister is Satsuki.");
    assert_eq!(
        finalized.retrieval_query.as_deref(),
        Some("Who is Mei's sister?")
    );
    assert_eq!(finalized.retrieval_result_count, Some(1));
}

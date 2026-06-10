use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::task::AbortHandle;

const AI_PROVIDER_CONFIG_FILE: &str = "ai-provider.json";
const AI_KEYRING_SERVICE: &str = "com.no1.markdown-editor.ai";
const AI_DIRECT_PROVIDER_ACCOUNT: &str = "direct-provider";
const AI_OCI_KEY_FILE_PASSPHRASE_ACCOUNT_PREFIX: &str = "oci-key-file-passphrase:";
const AI_HOSTED_AGENT_ACCOUNT_PREFIX: &str = "hosted-agent:";
const AI_PROVIDER_USER_AGENT: &str = "No.1 Markdown Editor AI Client";
const AI_PROVIDER_PROJECT_HEADER: &str = "OpenAI-Project";
const AI_COMPLETION_STREAM_EVENT: &str = "ai:completion-stream";
const AI_OAUTH_REFRESH_MARGIN_SECONDS: u64 = 30;
const DEFAULT_OCI_IAM_CONFIG_FILE: &str = "~/.oci_iam/config";
const MCP_STDERR_MAX_CHARS: usize = 4000;

pub struct AiInFlightRequests(pub Mutex<HashMap<String, AbortHandle>>);
pub struct AiOAuthTokenCache(pub Mutex<HashMap<String, CachedOAuthToken>>);

#[derive(Debug, Clone)]
pub struct CachedOAuthToken {
    pub access_token: String,
    pub expires_at_unix: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiCompletionStreamChunk {
    pub request_id: String,
    pub chunk: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiOracleUnstructuredStoreRegistration {
    pub id: String,
    pub label: String,
    pub vector_store_id: String,
    pub description: String,
    pub enabled: bool,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiOracleStructuredStoreRegistration {
    pub id: String,
    pub label: String,
    pub semantic_store_id: String,
    #[serde(default)]
    pub compartment_id: String,
    #[serde(default)]
    pub store_ocid: String,
    #[serde(default)]
    pub oci_auth_profile_id: Option<String>,
    #[serde(default)]
    pub region_override: String,
    #[serde(default)]
    pub schema_name: String,
    pub description: String,
    pub enabled: bool,
    #[serde(default)]
    pub is_default: bool,
    pub default_mode: String,
    #[serde(default)]
    pub execution_profile_id: Option<String>,
    #[serde(default)]
    pub enrichment_default_mode: String,
    #[serde(default)]
    pub enrichment_object_names: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiOracleOCIAuthProfile {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub config_file: String,
    #[serde(default)]
    pub profile: String,
    #[serde(default)]
    pub region: String,
    #[serde(default)]
    pub tenancy: String,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub fingerprint: String,
    #[serde(default)]
    pub key_file: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiOracleMCPExecutionProfile {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub config_json: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub server_url: String,
    pub transport: String,
    #[serde(default)]
    pub tool_name: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiOracleHostedAgentProfile {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub oci_region: String,
    #[serde(default)]
    pub hosted_application_ocid: String,
    #[serde(default)]
    pub api_version: String,
    #[serde(default)]
    pub api_action: String,
    pub domain_url: String,
    pub client_id: String,
    #[serde(default)]
    pub scope: String,
    pub transport: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfig {
    pub provider: String,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub project: String,
    #[serde(default)]
    pub oci_auth_profiles: Vec<AiOracleOCIAuthProfile>,
    #[serde(default)]
    pub unstructured_stores: Vec<AiOracleUnstructuredStoreRegistration>,
    #[serde(default)]
    pub structured_stores: Vec<AiOracleStructuredStoreRegistration>,
    #[serde(default)]
    pub mcp_execution_profiles: Vec<AiOracleMCPExecutionProfile>,
    #[serde(default)]
    pub hosted_agent_profiles: Vec<AiOracleHostedAgentProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderState {
    pub config: Option<AiProviderConfig>,
    pub has_api_key: bool,
    pub storage_kind: String,
    pub has_oci_key_file_passphrase_by_id: HashMap<String, bool>,
    pub has_hosted_agent_client_secret_by_id: HashMap<String, bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiRequestMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiKnowledgeSelection {
    pub kind: String,
    #[serde(default)]
    pub registration_id: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRunCompletionRequest {
    pub request_id: String,
    #[serde(default)]
    pub intent: String,
    #[serde(default)]
    pub scope: String,
    #[serde(default)]
    pub output_target: String,
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub messages: Vec<AiRequestMessage>,
    pub execution_target_kind: String,
    pub invocation_capability: String,
    pub knowledge_selection: AiKnowledgeSelection,
    #[serde(default)]
    pub thread_id: Option<String>,
    #[serde(default)]
    pub hosted_agent_profile_id: Option<String>,
    #[serde(default)]
    pub generated_sql: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiRetrievalResultPreview {
    pub title: String,
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiRunCompletionResponse {
    pub text: String,
    pub finish_reason: Option<String>,
    pub model: Option<String>,
    pub request_id: Option<String>,
    pub thread_id: Option<String>,
    pub content_type: String,
    pub explanation_text: Option<String>,
    pub warning_text: Option<String>,
    pub source_label: Option<String>,
    #[serde(default)]
    pub retrieval_executed: bool,
    #[serde(default)]
    pub retrieval_query: Option<String>,
    #[serde(default)]
    pub retrieval_results: Vec<AiRetrievalResultPreview>,
    #[serde(default)]
    pub retrieval_result_count: Option<usize>,
    #[serde(default)]
    pub generated_sql: Option<String>,
    #[serde(default)]
    pub structured_execution_status: Option<String>,
    #[serde(default)]
    pub structured_execution_tool_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiListEnrichmentJobsRequest {
    pub structured_store_id: String,
    #[serde(default)]
    pub compartment_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiEnrichmentJobRequest {
    pub structured_store_id: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub schema_name: String,
    #[serde(default)]
    pub database_objects: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiEnrichmentJobActionRequest {
    pub structured_store_id: String,
    pub enrichment_job_id: String,
}

pub(crate) mod commands;
mod config;
mod enrichment;
mod hosted;
mod http;
mod mcp;
mod oci;
mod oci_sign;
mod openai;
mod responses;
mod secrets;
mod streaming;
mod urls;

#[cfg(test)]
mod tests;

#[allow(unused_imports)]
pub(crate) use commands::*;
#[allow(unused_imports)]
pub(crate) use config::*;
#[allow(unused_imports)]
pub(crate) use enrichment::*;
#[allow(unused_imports)]
pub(crate) use hosted::*;
#[allow(unused_imports)]
pub(crate) use http::*;
#[allow(unused_imports)]
pub(crate) use mcp::*;
#[allow(unused_imports)]
pub(crate) use oci::*;
#[allow(unused_imports)]
pub(crate) use oci_sign::*;
#[allow(unused_imports)]
pub(crate) use openai::*;
#[allow(unused_imports)]
pub(crate) use responses::*;
#[allow(unused_imports)]
pub(crate) use secrets::*;
#[allow(unused_imports)]
pub(crate) use streaming::*;
#[allow(unused_imports)]
pub(crate) use urls::*;

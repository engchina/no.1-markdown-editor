#[allow(unused_imports)]
use super::*;

pub(crate) fn build_ai_chat_completions_url(base_url: &str) -> Result<reqwest::Url, String> {
    let parsed = normalize_url_with_trailing_slash(base_url)?;
    parsed
        .join("chat/completions")
        .map_err(|error| format!("Failed to build AI completion URL: {error}"))
}

pub(crate) fn build_ai_responses_url(base_url: &str) -> Result<reqwest::Url, String> {
    let parsed = normalize_url_with_trailing_slash(base_url)?;
    parsed
        .join("responses")
        .map_err(|error| format!("Failed to build AI responses URL: {error}"))
}

pub(crate) fn build_ai_generate_sql_url(
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
) -> Result<reqwest::Url, String> {
    let inference_root = build_ai_inference_root_url(config, store)?;
    inference_root
        .join(&format!(
            "20260325/semanticStores/{}/actions/generateSqlFromNl",
            store.semantic_store_id.trim()
        ))
        .map_err(|error| format!("Failed to build AI GenerateSqlFromNl URL: {error}"))
}

pub(crate) fn build_ai_enrichment_jobs_url(
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
    compartment_id_override: Option<&str>,
) -> Result<reqwest::Url, String> {
    let inference_root = build_ai_inference_root_url(config, store)?;
    let mut url = inference_root
        .join(&format!(
            "20260325/semanticStores/{}/enrichmentJobs",
            store.semantic_store_id.trim()
        ))
        .map_err(|error| format!("Failed to build AI Enrichment Jobs URL: {error}"))?;
    let compartment_id = resolve_enrichment_jobs_compartment_id(store, compartment_id_override)?;
    url.query_pairs_mut()
        .append_pair("compartmentId", &compartment_id)
        .append_pair("sortBy", "timeCreated")
        .append_pair("sortOrder", "DESC")
        .append_pair("limit", "10");
    Ok(url)
}

pub(crate) fn build_ai_generate_enrichment_job_url(
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
) -> Result<reqwest::Url, String> {
    let inference_root = build_ai_inference_root_url(config, store)?;
    inference_root
        .join(&format!(
            "20260325/semanticStores/{}/actions/enrich",
            store.semantic_store_id.trim()
        ))
        .map_err(|error| format!("Failed to build AI GenerateEnrichmentJob URL: {error}"))
}

pub(crate) fn build_ai_enrichment_job_url(
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
    enrichment_job_id: &str,
) -> Result<reqwest::Url, String> {
    let enrichment_job_id = enrichment_job_id.trim();
    if enrichment_job_id.is_empty() {
        return Err("Enrichment Job ID is required".to_string());
    }
    let inference_root = build_ai_inference_root_url(config, store)?;
    inference_root
        .join(&format!(
            "20260325/semanticStores/{}/enrichmentJobs/{}",
            store.semantic_store_id.trim(),
            enrichment_job_id
        ))
        .map_err(|error| format!("Failed to build Enrichment Job URL: {error}"))
}

pub(crate) fn build_ai_inference_root_url(
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
) -> Result<reqwest::Url, String> {
    let region = resolve_structured_store_region(config, store)?;
    let parsed = normalize_url_with_trailing_slash(&config.base_url)?;

    if let Some(host) = parsed.host_str() {
        if let Some(inference_host) = build_generative_ai_data_inference_host(host, &region) {
            let url = format!("{}://{}/", parsed.scheme(), inference_host);
            return reqwest::Url::parse(&url)
                .map_err(|error| format!("Failed to build OCI Generative AI Data URL: {error}"));
        }
    }

    let mut parsed = parsed;
    let normalized_path = parsed.path().trim_end_matches('/').to_string();
    let trimmed_path = if normalized_path.ends_with("/openai/v1") {
        normalized_path.trim_end_matches("/openai/v1")
    } else {
        normalized_path.as_str()
    };
    let next_path = if trimmed_path.is_empty() {
        "/"
    } else {
        trimmed_path
    };
    parsed.set_path(next_path);
    if !parsed.path().ends_with('/') {
        let value = format!("{}/", parsed.path().trim_end_matches('/'));
        parsed.set_path(&value);
    }
    Ok(parsed)
}

pub(crate) fn build_generative_ai_data_inference_host(host: &str, region: &str) -> Option<String> {
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    let region = region.trim();
    if host.is_empty() || region.is_empty() {
        return None;
    }

    if host.starts_with("inference.generativeai.") {
        return Some(format!(
            "inference.generativeai.{region}.oci.{}",
            infer_oci_second_level_domain(&host, region)?
        ));
    }

    if host.starts_with("genai.oci.")
        || host.contains(".oraclecloud.")
        || host.contains(".oraclegovcloud.")
    {
        return Some(format!(
            "inference.generativeai.{region}.oci.{}",
            infer_oci_second_level_domain(&host, region)?
        ));
    }

    None
}

pub(crate) fn infer_oci_second_level_domain(host: &str, region: &str) -> Option<String> {
    if let Some((_, suffix)) = host.split_once(".oci.") {
        let region_prefix = format!("{}.", region.trim());
        let suffix = suffix.strip_prefix(&region_prefix).unwrap_or(suffix);
        if !suffix.trim().is_empty() {
            return Some(suffix.to_string());
        }
    }

    for marker in ["oraclecloud.", "oraclegovcloud."] {
        if let Some(index) = host.find(marker) {
            return Some(host[index..].to_string());
        }
    }

    None
}

pub(crate) fn build_ai_hosted_agent_invoke_url(
    profile: &AiOracleHostedAgentProfile,
) -> Result<reqwest::Url, String> {
    let region = profile.oci_region.trim();
    let hosted_application_ocid = profile.hosted_application_ocid.trim();
    if region.is_empty() {
        return Err("Hosted agent OCI region is required".to_string());
    }
    if hosted_application_ocid.is_empty() {
        return Err("Hosted agent application OCID is required".to_string());
    }

    let api_version = normalize_hosted_agent_api_version(&profile.api_version);
    let api_action = normalize_hosted_agent_api_action(&profile.api_action);
    let url = format!(
        "https://application.generativeai.{region}.oci.oraclecloud.com/{api_version}/hostedApplications/{hosted_application_ocid}/actions/invoke/{api_action}"
    );
    reqwest::Url::parse(&url)
        .map_err(|error| format!("Failed to build hosted agent invoke URL: {error}"))
}

pub(crate) fn build_ai_hosted_agent_token_url(domain_url: &str) -> Result<reqwest::Url, String> {
    let parsed = normalize_url_with_trailing_slash(domain_url)?;
    parsed
        .join("oauth2/v1/token")
        .map_err(|error| format!("Failed to build hosted agent token URL: {error}"))
}

pub(crate) fn normalize_url_with_trailing_slash(base_url: &str) -> Result<reqwest::Url, String> {
    let mut normalized = base_url.trim().to_string();
    if normalized.is_empty() {
        return Err("AI base URL is required".to_string());
    }
    if !normalized.ends_with('/') {
        normalized.push('/');
    }

    reqwest::Url::parse(&normalized).map_err(|_| "AI base URL must be a valid URL".to_string())
}

pub(crate) fn url_encode_component(input: &str) -> String {
    input
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            b' ' => vec!['+'],
            _ => format!("%{:02X}", byte).chars().collect::<Vec<_>>(),
        })
        .collect()
}

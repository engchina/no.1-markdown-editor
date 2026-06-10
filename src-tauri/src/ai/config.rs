use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

#[allow(unused_imports)]
use super::*;

pub(crate) fn read_ai_provider_config<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<AiProviderConfig>, String> {
    let config_path = ai_provider_config_path(app)?;
    if !config_path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&config_path)
        .map_err(|error| format!("Failed to read AI provider config: {error}"))?;
    let config: AiProviderConfig = serde_json::from_str(&raw)
        .map_err(|error| format!("Failed to parse AI provider config: {error}"))?;

    normalize_ai_provider_config(config).map(Some)
}

pub(crate) fn write_ai_provider_config<R: Runtime>(
    app: &AppHandle<R>,
    config: &AiProviderConfig,
) -> Result<(), String> {
    let config_path = ai_provider_config_path(app)?;
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create AI config directory: {error}"))?;
    }

    let body = serde_json::to_string_pretty(config)
        .map_err(|error| format!("Failed to serialize AI provider config: {error}"))?;
    fs::write(config_path, body)
        .map_err(|error| format!("Failed to write AI provider config: {error}"))
}

pub(crate) fn ai_provider_config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Failed to resolve AI config directory: {error}"))?;

    Ok(base_dir.join(AI_PROVIDER_CONFIG_FILE))
}

pub(crate) fn normalize_ai_provider_config(
    config: AiProviderConfig,
) -> Result<AiProviderConfig, String> {
    let provider = config.provider.trim();
    let model = config.model.trim();
    if model.is_empty() {
        return Err("AI model is required".to_string());
    }

    let base_url = normalize_http_url(
        config.base_url.trim(),
        "AI base URL must be a valid HTTP or HTTPS URL",
    )?;

    match provider {
        "openai-compatible" => Ok(AiProviderConfig {
            provider: "openai-compatible".to_string(),
            base_url,
            model: model.to_string(),
            project: config.project.trim().to_string(),
            oci_auth_profiles: vec![],
            unstructured_stores: vec![],
            structured_stores: vec![],
            mcp_execution_profiles: vec![],
            hosted_agent_profiles: vec![],
        }),
        "oci-responses" => {
            let project = config.project.trim();

            let hosted_agent_profiles =
                normalize_hosted_agent_profiles(config.hosted_agent_profiles)?;
            let oci_auth_profiles = normalize_oci_auth_profiles(config.oci_auth_profiles);
            let oci_auth_profile_ids = oci_auth_profiles
                .iter()
                .map(|profile| profile.id.clone())
                .collect::<HashSet<_>>();
            let mcp_execution_profiles =
                normalize_mcp_execution_profiles(config.mcp_execution_profiles);
            let mcp_execution_profile_ids = mcp_execution_profiles
                .iter()
                .map(|profile| profile.id.clone())
                .collect::<HashSet<_>>();
            let unstructured_stores =
                normalize_unstructured_store_registrations(config.unstructured_stores);
            let structured_stores = normalize_structured_store_registrations(
                config.structured_stores,
                &oci_auth_profile_ids,
                &mcp_execution_profile_ids,
            );

            Ok(AiProviderConfig {
                provider: "oci-responses".to_string(),
                base_url,
                model: model.to_string(),
                project: project.to_string(),
                oci_auth_profiles,
                unstructured_stores,
                structured_stores,
                mcp_execution_profiles,
                hosted_agent_profiles,
            })
        }
        _ => Err(format!("Unsupported AI provider: {}", provider)),
    }
}

pub(crate) fn normalize_unstructured_store_registrations(
    stores: Vec<AiOracleUnstructuredStoreRegistration>,
) -> Vec<AiOracleUnstructuredStoreRegistration> {
    let mut seen_default = false;
    stores
        .into_iter()
        .enumerate()
        .map(|(index, store)| {
            let is_default = if store.is_default && !seen_default {
                seen_default = true;
                true
            } else {
                false
            };

            AiOracleUnstructuredStoreRegistration {
                id: normalize_config_id(&store.id, "unstructured", index),
                label: store.label.trim().to_string(),
                vector_store_id: store.vector_store_id.trim().to_string(),
                description: store.description.trim().to_string(),
                enabled: store.enabled,
                is_default,
            }
        })
        .collect()
}

pub(crate) fn normalize_structured_store_registrations(
    stores: Vec<AiOracleStructuredStoreRegistration>,
    oci_auth_profile_ids: &HashSet<String>,
    mcp_execution_profile_ids: &HashSet<String>,
) -> Vec<AiOracleStructuredStoreRegistration> {
    let mut seen_default = false;
    stores
        .into_iter()
        .enumerate()
        .map(|(index, store)| {
            let is_default = if store.is_default && !seen_default {
                seen_default = true;
                true
            } else {
                false
            };

            AiOracleStructuredStoreRegistration {
                id: normalize_config_id(&store.id, "structured", index),
                label: store.label.trim().to_string(),
                semantic_store_id: store.semantic_store_id.trim().to_string(),
                compartment_id: first_non_empty(&[
                    store.compartment_id.as_str(),
                    store.store_ocid.as_str(),
                ]),
                store_ocid: store.store_ocid.trim().to_string(),
                oci_auth_profile_id: store.oci_auth_profile_id.and_then(|value| {
                    let trimmed = value.trim().to_string();
                    if trimmed.is_empty() || !oci_auth_profile_ids.contains(&trimmed) {
                        None
                    } else {
                        Some(trimmed)
                    }
                }),
                region_override: store.region_override.trim().to_string(),
                schema_name: store.schema_name.trim().to_string(),
                description: store.description.trim().to_string(),
                enabled: store.enabled,
                is_default,
                default_mode: if store.default_mode == "agent-answer" {
                    "agent-answer".to_string()
                } else {
                    "sql-draft".to_string()
                },
                execution_profile_id: store.execution_profile_id.and_then(|value| {
                    let trimmed = value.trim().to_string();
                    if trimmed.is_empty() || !mcp_execution_profile_ids.contains(&trimmed) {
                        None
                    } else {
                        Some(trimmed)
                    }
                }),
                enrichment_default_mode: match store.enrichment_default_mode.as_str() {
                    "partial" => "partial".to_string(),
                    "delta" => "delta".to_string(),
                    _ => "full".to_string(),
                },
                enrichment_object_names: store.enrichment_object_names.trim().to_string(),
            }
        })
        .collect()
}

pub(crate) fn normalize_oci_auth_profiles(
    profiles: Vec<AiOracleOCIAuthProfile>,
) -> Vec<AiOracleOCIAuthProfile> {
    profiles
        .into_iter()
        .enumerate()
        .map(|(index, profile)| AiOracleOCIAuthProfile {
            id: normalize_config_id(&profile.id, "oci-auth", index),
            label: profile.label.trim().to_string(),
            config_file: DEFAULT_OCI_IAM_CONFIG_FILE.to_string(),
            profile: if profile.profile.trim().is_empty() {
                "DEFAULT".to_string()
            } else {
                profile.profile.trim().to_string()
            },
            region: profile.region.trim().to_string(),
            tenancy: profile.tenancy.trim().to_string(),
            user: profile.user.trim().to_string(),
            fingerprint: profile.fingerprint.trim().to_string(),
            key_file: profile.key_file.trim().to_string(),
            enabled: profile.enabled,
        })
        .collect()
}

pub(crate) fn normalize_mcp_execution_profiles(
    profiles: Vec<AiOracleMCPExecutionProfile>,
) -> Vec<AiOracleMCPExecutionProfile> {
    profiles
        .into_iter()
        .enumerate()
        .map(|(index, profile)| {
            let server_url = profile.server_url.trim().to_string();
            let mut args: Vec<String> = profile
                .args
                .into_iter()
                .map(|arg| arg.trim().to_string())
                .filter(|arg| !arg.is_empty())
                .collect();
            if args.is_empty() {
                args = vec![
                    "-y".to_string(),
                    "mcp-remote".to_string(),
                    if server_url.is_empty() {
                        "https://genai.oci.{region-identifier}.oraclecloud.com/nl2sql/toolchain"
                            .to_string()
                    } else {
                        server_url.clone()
                    },
                    "--allow-http".to_string(),
                ];
            }

            AiOracleMCPExecutionProfile {
                id: normalize_config_id(&profile.id, "mcp-execution", index),
                label: profile.label.trim().to_string(),
                description: profile.description.trim().to_string(),
                config_json: profile.config_json.trim().to_string(),
                command: if profile.command.trim().is_empty() {
                    "/opt/homebrew/bin/npx".to_string()
                } else {
                    profile.command.trim().to_string()
                },
                args,
                server_url,
                transport: if profile.transport.trim() == "streamable-http" {
                    "streamable-http".to_string()
                } else {
                    "stdio".to_string()
                },
                tool_name: profile.tool_name.trim().to_string(),
                enabled: profile.enabled,
            }
        })
        .collect()
}

pub(crate) fn normalize_hosted_agent_profiles(
    profiles: Vec<AiOracleHostedAgentProfile>,
) -> Result<Vec<AiOracleHostedAgentProfile>, String> {
    profiles
        .into_iter()
        .enumerate()
        .map(|(index, profile)| {
            let oci_region = profile.oci_region.trim().to_string();
            let hosted_application_ocid = profile.hosted_application_ocid.trim().to_string();
            if oci_region.is_empty() {
                return Err("Hosted agent OCI region is required".to_string());
            }
            if hosted_application_ocid.is_empty() {
                return Err("Hosted agent application OCID is required".to_string());
            }

            Ok(AiOracleHostedAgentProfile {
                id: normalize_config_id(&profile.id, "hosted-agent", index),
                label: profile.label.trim().to_string(),
                oci_region,
                hosted_application_ocid,
                api_version: normalize_hosted_agent_api_version(&profile.api_version),
                api_action: normalize_hosted_agent_api_action(&profile.api_action),
                domain_url: normalize_http_url(
                    profile.domain_url.trim(),
                    "Hosted agent domain URL must be a valid HTTP or HTTPS URL",
                )?,
                client_id: profile.client_id.trim().to_string(),
                scope: profile.scope.trim().to_string(),
                transport: if profile.transport == "sse" {
                    "sse".to_string()
                } else {
                    "http-json".to_string()
                },
            })
        })
        .collect()
}

pub(crate) fn normalize_config_id(input: &str, prefix: &str, index: usize) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        format!("{prefix}-{}", index + 1)
    } else {
        trimmed.to_string()
    }
}

pub(crate) fn normalize_http_url(input: &str, invalid_message: &str) -> Result<String, String> {
    let mut base_url = reqwest::Url::parse(input).map_err(|_| invalid_message.to_string())?;
    if !matches!(base_url.scheme(), "http" | "https") {
        return Err("AI base URL must use HTTP or HTTPS".to_string());
    }

    if !base_url.path().ends_with('/') {
        let next_path = if base_url.path().is_empty() {
            "/".to_string()
        } else {
            format!("{}/", base_url.path().trim_end_matches('/'))
        };
        base_url.set_path(&next_path);
    }

    Ok(base_url.to_string().trim_end_matches('/').to_string())
}

pub(crate) fn normalize_hosted_agent_api_version(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        "20251112".to_string()
    } else {
        trimmed.to_string()
    }
}

pub(crate) fn normalize_hosted_agent_api_action(input: &str) -> String {
    let trimmed = input.trim().trim_matches('/');
    if trimmed.is_empty() {
        "chat".to_string()
    } else {
        trimmed.to_string()
    }
}

pub(crate) fn find_unstructured_store_registration<'a>(
    config: &'a AiProviderConfig,
    registration_id: Option<&str>,
) -> Option<&'a AiOracleUnstructuredStoreRegistration> {
    let registration_id = registration_id?.trim();
    if registration_id.is_empty() {
        return None;
    }

    config
        .unstructured_stores
        .iter()
        .find(|store| store.id == registration_id)
}

pub(crate) fn find_structured_store_registration<'a>(
    config: &'a AiProviderConfig,
    registration_id: Option<&str>,
) -> Option<&'a AiOracleStructuredStoreRegistration> {
    let registration_id = registration_id?.trim();
    if registration_id.is_empty() {
        return None;
    }

    config
        .structured_stores
        .iter()
        .find(|store| store.id == registration_id)
}

pub(crate) fn find_oci_auth_profile<'a>(
    config: &'a AiProviderConfig,
    profile_id: Option<&str>,
) -> Option<&'a AiOracleOCIAuthProfile> {
    if let Some(profile_id) = profile_id.map(str::trim).filter(|value| !value.is_empty()) {
        return config
            .oci_auth_profiles
            .iter()
            .find(|profile| profile.id == profile_id && profile.enabled);
    }

    config
        .oci_auth_profiles
        .iter()
        .find(|profile| profile.enabled)
}

pub(crate) fn find_mcp_execution_profile<'a>(
    config: &'a AiProviderConfig,
    profile_id: Option<&str>,
) -> Option<&'a AiOracleMCPExecutionProfile> {
    let profile_id = profile_id?.trim();
    if profile_id.is_empty() {
        return None;
    }

    config
        .mcp_execution_profiles
        .iter()
        .find(|profile| profile.id == profile_id && profile.enabled)
}

pub(crate) fn find_hosted_agent_profile<'a>(
    config: &'a AiProviderConfig,
    profile_id: &str,
) -> Option<&'a AiOracleHostedAgentProfile> {
    let profile_id = profile_id.trim();
    if profile_id.is_empty() {
        return None;
    }

    config
        .hosted_agent_profiles
        .iter()
        .find(|profile| profile.id == profile_id)
}

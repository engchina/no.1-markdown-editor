use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use ring::rand::SystemRandom;
use ring::signature::{RsaKeyPair, RSA_PKCS1_SHA256};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[allow(unused_imports)]
use super::*;

pub(crate) fn apply_oci_iam_signature(
    builder: reqwest::RequestBuilder,
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
    method: &str,
    url: &reqwest::Url,
    body: &str,
) -> Result<reqwest::RequestBuilder, String> {
    let auth = resolve_oci_auth_settings(config, store)?;
    let date = Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
    let headers = build_oci_signature_headers(method, url, &date, body)?;
    let signing_string = headers
        .iter()
        .map(|(name, value)| format!("{name}: {value}"))
        .collect::<Vec<_>>()
        .join("\n");
    let signature = sign_oci_request_string(
        &auth.key_file,
        auth.key_file_passphrase.as_deref(),
        &signing_string,
    )?;
    let key_id = format!("{}/{}/{}", auth.tenancy, auth.user, auth.fingerprint);
    let header_names = headers
        .iter()
        .map(|(name, _)| *name)
        .collect::<Vec<_>>()
        .join(" ");
    let authorization = format!(
        "Signature version=\"1\",keyId=\"{key_id}\",algorithm=\"rsa-sha256\",headers=\"{header_names}\",signature=\"{signature}\""
    );

    let mut builder = builder;
    for (name, value) in &headers {
        if *name == "(request-target)" {
            continue;
        }
        builder = builder.header(*name, value.as_str());
    }

    Ok(builder.header("authorization", authorization))
}

pub(crate) fn build_oci_signature_headers(
    method: &str,
    url: &reqwest::Url,
    date: &str,
    body: &str,
) -> Result<Vec<(&'static str, String)>, String> {
    let host = url
        .host_str()
        .ok_or_else(|| "OCI request URL did not include a host".to_string())?
        .to_string();
    let mut headers = vec![
        ("date", date.to_string()),
        ("(request-target)", build_oci_request_target(method, url)),
        ("host", host),
    ];

    // OCI IAM signing only includes body headers for methods that send a body.
    // Signing them for GET makes some OCI endpoints reject otherwise valid requests.
    if method.eq_ignore_ascii_case("post")
        || method.eq_ignore_ascii_case("put")
        || method.eq_ignore_ascii_case("patch")
    {
        headers.extend([
            (
                "x-content-sha256",
                STANDARD.encode(Sha256::digest(body.as_bytes())),
            ),
            ("content-type", "application/json".to_string()),
            ("content-length", body.as_bytes().len().to_string()),
        ]);
    }

    Ok(headers)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ResolvedOCIAuthSettings {
    region: String,
    tenancy: String,
    user: String,
    fingerprint: String,
    key_file: String,
    key_file_passphrase: Option<String>,
}

pub(crate) fn resolve_oci_auth_settings(
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
) -> Result<ResolvedOCIAuthSettings, String> {
    let profile = find_oci_auth_profile(config, store.oci_auth_profile_id.as_deref())
        .ok_or_else(|| "OCI auth profile is required for NL2SQL".to_string())?;
    let config_values = load_oci_config_profile(&profile.config_file, &profile.profile)?;
    let keyring_passphrase = read_oci_key_file_passphrase(&profile.id)?;
    let region = first_non_empty(&[
        store.region_override.as_str(),
        profile.region.as_str(),
        config_values
            .get("region")
            .map(String::as_str)
            .unwrap_or(""),
    ]);
    let tenancy = first_non_empty(&[
        profile.tenancy.as_str(),
        config_values
            .get("tenancy")
            .map(String::as_str)
            .unwrap_or(""),
    ]);
    let user = first_non_empty(&[
        profile.user.as_str(),
        config_values.get("user").map(String::as_str).unwrap_or(""),
    ]);
    let fingerprint = first_non_empty(&[
        profile.fingerprint.as_str(),
        config_values
            .get("fingerprint")
            .map(String::as_str)
            .unwrap_or(""),
    ]);
    let key_file = first_non_empty(&[
        profile.key_file.as_str(),
        config_values
            .get("key_file")
            .map(String::as_str)
            .unwrap_or(""),
    ]);
    let key_file_passphrase = first_non_empty(&[
        keyring_passphrase.as_deref().unwrap_or(""),
        config_values
            .get("pass_phrase")
            .map(String::as_str)
            .unwrap_or(""),
    ]);

    for (label, value) in [
        ("OCI region", region.as_str()),
        ("OCI tenancy OCID", tenancy.as_str()),
        ("OCI user OCID", user.as_str()),
        ("OCI fingerprint", fingerprint.as_str()),
        ("OCI key file", key_file.as_str()),
    ] {
        if value.trim().is_empty() {
            return Err(format!("{label} is required for NL2SQL IAM signing"));
        }
    }

    Ok(ResolvedOCIAuthSettings {
        region,
        tenancy,
        user,
        fingerprint,
        key_file,
        key_file_passphrase: (!key_file_passphrase.trim().is_empty())
            .then_some(key_file_passphrase),
    })
}

pub(crate) fn resolve_structured_store_region(
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
) -> Result<String, String> {
    let profile = find_oci_auth_profile(config, store.oci_auth_profile_id.as_deref());
    let config_values = match profile {
        Some(profile) => load_oci_config_profile(&profile.config_file, &profile.profile)?,
        None => HashMap::new(),
    };
    let profile_region = profile.map(|value| value.region.as_str()).unwrap_or("");
    let region = first_non_empty(&[
        store.region_override.as_str(),
        profile_region,
        config_values
            .get("region")
            .map(String::as_str)
            .unwrap_or(""),
        infer_oci_region_from_base_url(&config.base_url)
            .as_deref()
            .unwrap_or(""),
    ]);

    if region.is_empty() {
        return Err("OCI region is required for NL2SQL endpoint resolution".to_string());
    }

    Ok(region)
}

pub(crate) fn infer_oci_region_from_base_url(base_url: &str) -> Option<String> {
    let parsed = normalize_url_with_trailing_slash(base_url).ok()?;
    let host = parsed
        .host_str()?
        .trim()
        .trim_end_matches('.')
        .to_ascii_lowercase();
    let parts = host.split('.').collect::<Vec<_>>();
    let oci_index = parts.iter().position(|part| *part == "oci")?;
    let candidate = parts.get(oci_index + 1)?;
    if candidate.contains('-') {
        Some((*candidate).to_string())
    } else {
        None
    }
}

pub(crate) fn load_oci_config_profile(
    _config_file: &str,
    profile_name: &str,
) -> Result<HashMap<String, String>, String> {
    let path = expand_home_path(DEFAULT_OCI_IAM_CONFIG_FILE);
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read OCI config file {}: {error}", path.display()))?;
    Ok(parse_oci_config_profile(&raw, profile_name))
}

pub(crate) fn parse_oci_config_profile(raw: &str, profile_name: &str) -> HashMap<String, String> {
    let target = if profile_name.trim().is_empty() {
        "DEFAULT"
    } else {
        profile_name.trim()
    };
    let mut active = false;
    let mut values = HashMap::new();

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            active = trimmed
                .trim_start_matches('[')
                .trim_end_matches(']')
                .trim()
                .eq_ignore_ascii_case(target);
            continue;
        }
        if !active {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once('=') {
            values.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    values
}

pub(crate) fn sign_oci_request_string(
    key_file: &str,
    key_file_passphrase: Option<&str>,
    signing_string: &str,
) -> Result<String, String> {
    let key_text = read_text_file_expanding_home(key_file)?;
    let key_der = decode_pem_private_key(&key_text, key_file_passphrase)?;
    let key_pair = RsaKeyPair::from_pkcs8(&key_der)
        .or_else(|_| RsaKeyPair::from_der(&key_der))
        .map_err(|_| {
            "Failed to parse OCI private key. Encrypted private keys are not supported yet."
                .to_string()
        })?;
    let rng = SystemRandom::new();
    let mut signature = vec![0; key_pair.public().modulus_len()];
    key_pair
        .sign(
            &RSA_PKCS1_SHA256,
            &rng,
            signing_string.as_bytes(),
            &mut signature,
        )
        .map_err(|_| "Failed to sign OCI request".to_string())?;
    Ok(STANDARD.encode(signature))
}

pub(crate) fn read_text_file_expanding_home(path: &str) -> Result<String, String> {
    let expanded = expand_home_path(path);
    fs::read_to_string(&expanded)
        .map_err(|error| format!("Failed to read {}: {error}", expanded.display()))
}

pub(crate) fn expand_home_path(path: &str) -> PathBuf {
    let trimmed = path.trim();
    if trimmed == "~" || trimmed.starts_with("~/") || trimmed.starts_with("~\\") {
        if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            let suffix = trimmed
                .trim_start_matches('~')
                .trim_start_matches('/')
                .trim_start_matches('\\');
            return PathBuf::from(home).join(suffix);
        }
    }
    PathBuf::from(trimmed)
}

pub(crate) fn decode_pem_private_key(
    text: &str,
    key_file_passphrase: Option<&str>,
) -> Result<Vec<u8>, String> {
    let mut body = String::new();
    let mut in_key = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("-----BEGIN ") && trimmed.contains("PRIVATE KEY-----") {
            if trimmed.contains("ENCRYPTED") {
                if key_file_passphrase.map(str::trim).unwrap_or("").is_empty() {
                    return Err(
                        "Encrypted OCI private key requires a key file passphrase".to_string()
                    );
                }
                return Err(
                    "Encrypted OCI private keys are not supported by the built-in signer yet"
                        .to_string(),
                );
            }
            in_key = true;
            continue;
        }
        if trimmed.starts_with("-----END ") && trimmed.contains("PRIVATE KEY-----") {
            break;
        }
        if in_key {
            body.push_str(trimmed);
        }
    }
    if body.is_empty() {
        return Err("OCI private key PEM did not contain a supported private key".to_string());
    }
    STANDARD
        .decode(body.as_bytes())
        .map_err(|_| "Failed to decode OCI private key PEM".to_string())
}

pub(crate) fn build_oci_request_target(method: &str, url: &reqwest::Url) -> String {
    let path = if url.path().is_empty() {
        "/"
    } else {
        url.path()
    };
    match url.query() {
        Some(query) if !query.is_empty() => {
            format!("{} {path}?{query}", method.to_ascii_lowercase())
        }
        _ => format!("{} {path}", method.to_ascii_lowercase()),
    }
}

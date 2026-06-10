use keyring::Entry;

#[allow(unused_imports)]
use super::*;

pub(crate) fn ai_keyring_entry(account: &str) -> Result<Entry, String> {
    Entry::new(AI_KEYRING_SERVICE, account)
        .map_err(|error| format!("Failed to initialize AI keyring entry: {error}"))
}

pub(crate) fn oci_key_file_passphrase_account(profile_id: &str) -> String {
    format!("{AI_OCI_KEY_FILE_PASSPHRASE_ACCOUNT_PREFIX}{profile_id}")
}

pub(crate) fn hosted_agent_keyring_account(profile_id: &str) -> String {
    format!("{AI_HOSTED_AGENT_ACCOUNT_PREFIX}{profile_id}")
}

pub(crate) fn has_ai_provider_api_key() -> Result<bool, String> {
    match ai_keyring_entry(AI_DIRECT_PROVIDER_ACCOUNT)?.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("Failed to inspect AI API key state: {error}")),
    }
}

pub(crate) fn read_ai_provider_api_key() -> Result<String, String> {
    match ai_keyring_entry(AI_DIRECT_PROVIDER_ACCOUNT)?.get_password() {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Err("Stored AI API key is empty".to_string());
            }
            Ok(trimmed.to_string())
        }
        Err(keyring::Error::NoEntry) => Err("No AI API key is configured".to_string()),
        Err(error) => Err(format!("Failed to read AI API key: {error}")),
    }
}

pub(crate) fn has_oci_key_file_passphrase(profile_id: &str) -> Result<bool, String> {
    match ai_keyring_entry(&oci_key_file_passphrase_account(profile_id))?.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!(
            "Failed to inspect OCI key file passphrase state: {error}"
        )),
    }
}

pub(crate) fn read_oci_key_file_passphrase(profile_id: &str) -> Result<Option<String>, String> {
    match ai_keyring_entry(&oci_key_file_passphrase_account(profile_id))?.get_password() {
        Ok(value) => {
            let trimmed = value.trim();
            Ok((!trimmed.is_empty()).then(|| trimmed.to_string()))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Failed to read OCI key file passphrase: {error}")),
    }
}

pub(crate) fn has_hosted_agent_client_secret(profile_id: &str) -> Result<bool, String> {
    match ai_keyring_entry(&hosted_agent_keyring_account(profile_id))?.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!(
            "Failed to inspect hosted agent secret state: {error}"
        )),
    }
}

pub(crate) fn read_hosted_agent_client_secret(profile_id: &str) -> Result<String, String> {
    match ai_keyring_entry(&hosted_agent_keyring_account(profile_id))?.get_password() {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Err("Stored hosted agent client secret is empty".to_string());
            }
            Ok(trimmed.to_string())
        }
        Err(keyring::Error::NoEntry) => {
            Err("No hosted agent client secret is configured".to_string())
        }
        Err(error) => Err(format!(
            "Failed to read hosted agent client secret: {error}"
        )),
    }
}

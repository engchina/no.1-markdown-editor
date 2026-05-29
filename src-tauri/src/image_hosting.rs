use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use keyring::Entry;
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

const IMAGE_HOSTING_CONFIG_FILE: &str = "image-hosting.json";
const IMAGE_HOSTING_KEYRING_SERVICE: &str = "com.no1.markdown-editor.image-hosting";
const IMAGE_HOSTING_PAT_ACCOUNT: &str = "github-pat";
const IMAGE_HOSTING_USER_AGENT: &str = "No.1 Markdown Editor Image Hosting Client";
const GITHUB_API_BASE: &str = "https://api.github.com";
const GITHUB_API_VERSION: &str = "2022-11-28";
const GITHUB_API_ACCEPT: &str = "application/vnd.github+json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImageHostingConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub owner: String,
    #[serde(default)]
    pub repo: String,
    #[serde(default = "default_branch")]
    pub branch: String,
    #[serde(default = "default_directory")]
    pub directory: String,
    #[serde(default = "default_commit_message_template")]
    pub commit_message_template: String,
}

impl Default for ImageHostingConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            owner: String::new(),
            repo: String::new(),
            branch: default_branch(),
            directory: default_directory(),
            commit_message_template: default_commit_message_template(),
        }
    }
}

fn default_branch() -> String {
    "main".to_string()
}

fn default_directory() -> String {
    "images".to_string()
}

fn default_commit_message_template() -> String {
    "Upload image: {filename}".to_string()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageHostingState {
    pub config: ImageHostingConfig,
    pub has_pat: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageHostingUploadResult {
    pub url: String,
    pub raw_url: String,
    pub remote_path: String,
    pub commit_sha: Option<String>,
}

#[tauri::command]
pub fn image_hosting_load_state<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ImageHostingState, String> {
    let config = read_image_hosting_config(&app)?.unwrap_or_default();
    let has_pat = has_image_hosting_pat()?;
    Ok(ImageHostingState { config, has_pat })
}

#[tauri::command]
pub fn image_hosting_save_config<R: Runtime>(
    app: AppHandle<R>,
    config: ImageHostingConfig,
) -> Result<ImageHostingConfig, String> {
    let normalized = normalize_image_hosting_config(config)?;
    write_image_hosting_config(&app, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub fn image_hosting_store_pat(pat: String) -> Result<(), String> {
    let trimmed = pat.trim();
    if trimmed.is_empty() {
        return Err("GitHub personal access token cannot be empty".to_string());
    }

    image_hosting_keyring_entry()?
        .set_password(trimmed)
        .map_err(|error| format!("Failed to store GitHub personal access token: {error}"))
}

#[tauri::command]
pub fn image_hosting_clear_pat() -> Result<(), String> {
    match image_hosting_keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Failed to clear GitHub personal access token: {error}"
        )),
    }
}

#[tauri::command]
pub async fn image_hosting_verify<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let config = read_image_hosting_config(&app)?
        .ok_or_else(|| "Image hosting is not configured".to_string())?;
    if config.owner.is_empty() || config.repo.is_empty() {
        return Err("Owner and repository name are required".to_string());
    }

    let pat = read_image_hosting_pat()?;
    let client = build_github_client()?;
    let url = format!("{}/repos/{}/{}", GITHUB_API_BASE, config.owner, config.repo);
    let response = client
        .get(&url)
        .header(ACCEPT, GITHUB_API_ACCEPT)
        .header(USER_AGENT, IMAGE_HOSTING_USER_AGENT)
        .header(AUTHORIZATION, format!("Bearer {pat}"))
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .send()
        .await
        .map_err(|error| format!("Failed to reach GitHub API: {error}"))?;

    let status = response.status();
    let response_text: String = response
        .text()
        .await
        .map_err(|error| format!("Failed to read GitHub repository response: {error}"))?;

    if status == StatusCode::UNAUTHORIZED {
        return Err("GitHub rejected the token. Check that the PAT is valid.".to_string());
    }
    if status == StatusCode::NOT_FOUND {
        return Err(format!(
            "Repository {}/{} not found, or the PAT cannot access it.",
            config.owner, config.repo
        ));
    }
    if !status.is_success() {
        return Err(format!("GitHub API returned {status}: {response_text}"));
    }

    let body: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|error| format!("Failed to parse GitHub repository response: {error}"))?;

    let private = body
        .get("private")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    let can_push = body
        .get("permissions")
        .and_then(|p| p.get("push"))
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);

    if private {
        return Err(
            "Repository is private. Image URLs require a public repository to be accessible."
                .to_string(),
        );
    }
    if !can_push {
        return Err(
            "The PAT does not have Contents: Read and write permission on this repository."
                .to_string(),
        );
    }

    Ok(format!("{}/{}", config.owner, config.repo))
}

#[tauri::command]
pub async fn image_hosting_upload<R: Runtime>(
    app: AppHandle<R>,
    local_path: String,
    remote_filename: String,
) -> Result<ImageHostingUploadResult, String> {
    let config = read_image_hosting_config(&app)?
        .ok_or_else(|| "Image hosting is not configured".to_string())?;
    if !config.enabled {
        return Err("Image hosting is disabled".to_string());
    }
    if config.owner.is_empty() || config.repo.is_empty() {
        return Err("Owner and repository name are required".to_string());
    }

    let pat = read_image_hosting_pat()?;
    let bytes = std::fs::read(&local_path)
        .map_err(|error| format!("Failed to read local image: {error}"))?;
    let encoded = BASE64_STANDARD.encode(&bytes);

    let safe_filename = sanitize_remote_filename(&remote_filename)?;
    let remote_path = if config.directory.is_empty() {
        safe_filename.clone()
    } else {
        format!("{}/{}", config.directory.trim_matches('/'), safe_filename)
    };

    let commit_message = config
        .commit_message_template
        .replace("{filename}", &safe_filename);

    let client = build_github_client()?;
    let url = format!(
        "{}/repos/{}/{}/contents/{}",
        GITHUB_API_BASE, config.owner, config.repo, remote_path
    );
    let body = json!({
        "message": commit_message,
        "content": encoded,
        "branch": config.branch,
    });
    let body_bytes = serde_json::to_vec(&body)
        .map_err(|error| format!("Failed to serialize GitHub upload payload: {error}"))?;

    let response = client
        .put(&url)
        .header(ACCEPT, GITHUB_API_ACCEPT)
        .header(USER_AGENT, IMAGE_HOSTING_USER_AGENT)
        .header(AUTHORIZATION, format!("Bearer {pat}"))
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .header(CONTENT_TYPE, "application/json")
        .body(body_bytes)
        .send()
        .await
        .map_err(|error| format!("Failed to upload image to GitHub: {error}"))?;

    let status = response.status();
    let response_text: String = response
        .text()
        .await
        .map_err(|error| format!("Failed to read GitHub upload response: {error}"))?;

    if status == StatusCode::UNPROCESSABLE_ENTITY {
        return Err(format!(
            "GitHub rejected the upload (file may already exist at this path): {response_text}"
        ));
    }
    if !status.is_success() {
        return Err(format!("GitHub upload failed ({status}): {response_text}"));
    }

    let payload: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|error| format!("Failed to parse GitHub upload response: {error}"))?;

    let commit_sha = payload
        .get("commit")
        .and_then(|c| c.get("sha"))
        .and_then(serde_json::Value::as_str)
        .map(|s| s.to_string());

    let cdn_url = build_jsdelivr_url(&config.owner, &config.repo, &config.branch, &remote_path);
    let raw_url = build_raw_github_url(&config.owner, &config.repo, &config.branch, &remote_path);

    Ok(ImageHostingUploadResult {
        url: cdn_url,
        raw_url,
        remote_path,
        commit_sha,
    })
}

fn build_jsdelivr_url(owner: &str, repo: &str, branch: &str, path: &str) -> String {
    format!("https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/{path}")
}

fn build_raw_github_url(owner: &str, repo: &str, branch: &str, path: &str) -> String {
    format!("https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}")
}

fn sanitize_remote_filename(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Remote filename cannot be empty".to_string());
    }
    if trimmed.starts_with('/') || trimmed.contains("..") {
        return Err(
            "Remote filename must be a relative path without parent references".to_string(),
        );
    }
    if trimmed.chars().any(|c| matches!(c, '\\' | '\0')) {
        return Err("Remote filename contains invalid characters".to_string());
    }
    Ok(trimmed.trim_matches('/').to_string())
}

fn build_github_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(3))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Failed to initialize GitHub client: {error}"))
}

fn normalize_image_hosting_config(
    config: ImageHostingConfig,
) -> Result<ImageHostingConfig, String> {
    let owner = config.owner.trim().to_string();
    let repo = config.repo.trim().to_string();
    let branch = {
        let b = config.branch.trim();
        if b.is_empty() {
            default_branch()
        } else {
            b.to_string()
        }
    };
    let directory = config.directory.trim().trim_matches('/').to_string();
    let commit_message_template = {
        let t = config.commit_message_template.trim();
        if t.is_empty() {
            default_commit_message_template()
        } else {
            t.to_string()
        }
    };

    if config.enabled && (owner.is_empty() || repo.is_empty()) {
        return Err("Owner and repository are required when image hosting is enabled".to_string());
    }

    Ok(ImageHostingConfig {
        enabled: config.enabled,
        owner,
        repo,
        branch,
        directory,
        commit_message_template,
    })
}

fn read_image_hosting_config<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<ImageHostingConfig>, String> {
    let path = image_hosting_config_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read image hosting config: {error}"))?;
    let config: ImageHostingConfig = serde_json::from_str(&raw)
        .map_err(|error| format!("Failed to parse image hosting config: {error}"))?;
    Ok(Some(config))
}

fn write_image_hosting_config<R: Runtime>(
    app: &AppHandle<R>,
    config: &ImageHostingConfig,
) -> Result<(), String> {
    let path = image_hosting_config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create config directory: {error}"))?;
    }
    let body = serde_json::to_string_pretty(config)
        .map_err(|error| format!("Failed to serialize image hosting config: {error}"))?;
    fs::write(path, body).map_err(|error| format!("Failed to write image hosting config: {error}"))
}

fn image_hosting_config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Failed to resolve config directory: {error}"))?;
    Ok(base.join(IMAGE_HOSTING_CONFIG_FILE))
}

fn image_hosting_keyring_entry() -> Result<Entry, String> {
    Entry::new(IMAGE_HOSTING_KEYRING_SERVICE, IMAGE_HOSTING_PAT_ACCOUNT)
        .map_err(|error| format!("Failed to initialize image hosting keyring entry: {error}"))
}

fn has_image_hosting_pat() -> Result<bool, String> {
    match image_hosting_keyring_entry()?.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("Failed to inspect PAT state: {error}")),
    }
}

fn read_image_hosting_pat() -> Result<String, String> {
    match image_hosting_keyring_entry()?.get_password() {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Err("Stored GitHub personal access token is empty".to_string());
            }
            Ok(trimmed.to_string())
        }
        Err(keyring::Error::NoEntry) => {
            Err("No GitHub personal access token configured".to_string())
        }
        Err(error) => Err(format!(
            "Failed to read GitHub personal access token: {error}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jsdelivr_url_is_built_from_components() {
        let url = build_jsdelivr_url("octocat", "markdown-images", "main", "2026/05/image.png");
        assert_eq!(
            url,
            "https://cdn.jsdelivr.net/gh/octocat/markdown-images@main/2026/05/image.png"
        );
    }

    #[test]
    fn raw_github_url_is_built_from_components() {
        let url = build_raw_github_url("octocat", "markdown-images", "main", "img.png");
        assert_eq!(
            url,
            "https://raw.githubusercontent.com/octocat/markdown-images/main/img.png"
        );
    }

    #[test]
    fn sanitize_rejects_parent_traversal() {
        assert!(sanitize_remote_filename("../etc/passwd").is_err());
        assert!(sanitize_remote_filename("/abs/path").is_err());
        assert!(sanitize_remote_filename("").is_err());
        assert!(sanitize_remote_filename("subdir\\name.png").is_err());
    }

    #[test]
    fn sanitize_accepts_relative_path() {
        assert_eq!(
            sanitize_remote_filename("2026/05/screenshot.png").unwrap(),
            "2026/05/screenshot.png"
        );
    }

    #[test]
    fn normalize_requires_owner_and_repo_when_enabled() {
        let cfg = ImageHostingConfig {
            enabled: true,
            owner: " ".into(),
            repo: "x".into(),
            branch: "main".into(),
            directory: "img".into(),
            commit_message_template: "test".into(),
        };
        assert!(normalize_image_hosting_config(cfg).is_err());
    }

    #[test]
    fn normalize_applies_defaults_when_blank() {
        let cfg = ImageHostingConfig {
            enabled: false,
            owner: "".into(),
            repo: "".into(),
            branch: "  ".into(),
            directory: "/img/".into(),
            commit_message_template: "  ".into(),
        };
        let normalized = normalize_image_hosting_config(cfg).unwrap();
        assert_eq!(normalized.branch, "main");
        assert_eq!(normalized.directory, "img");
        assert_eq!(
            normalized.commit_message_template,
            "Upload image: {filename}"
        );
    }
}

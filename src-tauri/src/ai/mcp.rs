use serde_json::{json, Value};
use std::io::{Read, Write};
use std::process::{ChildStderr, Command, ExitStatus, Stdio};
use std::thread::{self, JoinHandle};

#[allow(unused_imports)]
use super::*;

pub(crate) fn is_read_only_select_sql(sql: &str) -> bool {
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    let without_comments = lower
        .lines()
        .filter(|line| !line.trim_start().starts_with("--"))
        .collect::<Vec<_>>()
        .join("\n");
    let candidate = without_comments.trim_start();
    if !(candidate.starts_with("select") || candidate.starts_with("with")) {
        return false;
    }
    let forbidden = [
        " insert ",
        " update ",
        " delete ",
        " merge ",
        " drop ",
        " alter ",
        " create ",
        " truncate ",
        " grant ",
        " revoke ",
        " call ",
        " execute ",
        " begin ",
        " commit ",
        " rollback ",
    ];
    let padded = format!(" {candidate} ");
    !forbidden.iter().any(|token| padded.contains(token))
}

pub(crate) fn run_mcp_execution_profile(
    profile: &AiOracleMCPExecutionProfile,
    store: &AiOracleStructuredStoreRegistration,
    request: &AiRunCompletionRequest,
    sql: &str,
) -> Result<(String, Option<String>), String> {
    let command = profile.command.trim();
    if command.is_empty() {
        return Err("MCP command is required".to_string());
    }

    let mut child = Command::new(command)
        .args(profile.args.iter().filter(|arg| !arg.trim().is_empty()))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to start MCP execution profile: {error}"))?;

    let stderr_reader = child.stderr.take().map(spawn_mcp_stderr_reader);
    let mut stdin = match child.stdin.take() {
        Some(stdin) => stdin,
        None => {
            return Err(finish_mcp_process_with_error(
                child,
                stderr_reader,
                "Failed to open MCP stdin".to_string(),
            ))
        }
    };
    let mut stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            return Err(finish_mcp_process_with_error(
                child,
                stderr_reader,
                "Failed to open MCP stdout".to_string(),
            ))
        }
    };

    let session_result =
        run_mcp_execution_session(&mut stdin, &mut stdout, profile, store, request, sql);
    drop(stdin);
    match session_result {
        Ok((text, tool_name)) => {
            let _ = child.kill();
            let _ = child.wait();
            let _ = join_mcp_stderr_reader(stderr_reader);
            Ok((text, Some(tool_name)))
        }
        Err(error) => Err(finish_mcp_process_with_error(child, stderr_reader, error)),
    }
}

pub(crate) fn run_mcp_execution_session(
    stdin: &mut std::process::ChildStdin,
    stdout: &mut std::process::ChildStdout,
    profile: &AiOracleMCPExecutionProfile,
    store: &AiOracleStructuredStoreRegistration,
    request: &AiRunCompletionRequest,
    sql: &str,
) -> Result<(String, String), String> {
    write_mcp_message(
        stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "No.1 Markdown Editor",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }
        }),
    )?;
    let _ = read_mcp_response(stdout, 1)?;
    write_mcp_message(
        stdin,
        &json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {}
        }),
    )?;

    write_mcp_message(
        stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }),
    )?;
    let tools_response = read_mcp_response(stdout, 2)?;
    let tool_name = resolve_mcp_tool_name(&tools_response, &profile.tool_name)?;

    write_mcp_message(
        stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": {
                    "query": request.prompt.trim(),
                    "naturalLanguageQuery": request.prompt.trim(),
                    "sql": sql,
                    "semanticStoreId": store.semantic_store_id.clone(),
                    "schemaName": store.schema_name.clone()
                }
            }
        }),
    )?;
    let call_response = read_mcp_response(stdout, 3)?;
    let text = extract_mcp_text_response(&call_response)
        .ok_or_else(|| "MCP execution response did not include text content".to_string())?;
    Ok((text, tool_name))
}

pub(crate) fn spawn_mcp_stderr_reader(mut stderr: ChildStderr) -> JoinHandle<String> {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        match stderr.read_to_end(&mut bytes) {
            Ok(_) => String::from_utf8_lossy(&bytes).to_string(),
            Err(error) => format!("Failed to read MCP stderr: {error}"),
        }
    })
}

pub(crate) fn join_mcp_stderr_reader(reader: Option<JoinHandle<String>>) -> String {
    reader
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default()
}

pub(crate) fn finish_mcp_process_with_error(
    mut child: std::process::Child,
    stderr_reader: Option<JoinHandle<String>>,
    error: String,
) -> String {
    let status = child.try_wait().ok().flatten();
    if status.is_none() {
        let _ = child.kill();
    }
    let status = status.or_else(|| child.wait().ok());
    let status_text = status.as_ref().map(describe_mcp_exit_status);
    let stderr = join_mcp_stderr_reader(stderr_reader);
    format_mcp_process_error(&error, status_text.as_deref(), &stderr)
}

pub(crate) fn describe_mcp_exit_status(status: &ExitStatus) -> String {
    status
        .code()
        .map(|code| format!("exit code {code}"))
        .unwrap_or_else(|| "terminated without an exit code".to_string())
}

pub(crate) fn format_mcp_process_error(error: &str, status: Option<&str>, stderr: &str) -> String {
    let mut parts = vec![normalize_mcp_transport_error(error)];
    if let Some(status) = status {
        parts.push(format!("MCP process status: {status}"));
    }
    let stderr = normalize_mcp_stderr(stderr);
    if !stderr.is_empty() {
        if let Some(hint) = infer_mcp_stderr_hint(&stderr) {
            parts.push(hint.to_string());
        }
        parts.push(format!("MCP stderr:\n{stderr}"));
    }
    parts.join("\n\n")
}

pub(crate) fn normalize_mcp_transport_error(error: &str) -> String {
    if error.starts_with("Failed to read MCP response header") {
        return format!("MCP process exited before sending a response header ({error}).");
    }
    error.to_string()
}

pub(crate) fn normalize_mcp_stderr(stderr: &str) -> String {
    let normalized = stderr.replace("\r\n", "\n").replace('\r', "\n");
    let trimmed = normalized.trim();
    if trimmed.chars().count() <= MCP_STDERR_MAX_CHARS {
        return trimmed.to_string();
    }
    let truncated = trimmed
        .chars()
        .take(MCP_STDERR_MAX_CHARS)
        .collect::<String>();
    format!("{truncated}\n... MCP stderr truncated ...")
}

pub(crate) fn infer_mcp_stderr_hint(stderr: &str) -> Option<&'static str> {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("enotcached") || lower.contains("only-if-cached") {
        return Some("npm is running in offline/cache-only mode and mcp-remote is not cached. Disable npm offline mode (`npm config set offline false`) or preinstall/cache `mcp-remote` before running this MCP profile.");
    }
    if lower.contains("econnrefused") && lower.contains("registry.npmjs.org") {
        return Some("npm could not reach the package registry. Check npm proxy/network settings or preinstall/cache `mcp-remote` before running this MCP profile.");
    }
    if lower.contains("enotfound") || lower.contains("getaddrinfo") {
        if lower.contains("oraclecloud.com") || lower.contains("genai.oci") {
            return Some("MCP remote server hostname could not be resolved. Check DNS/network/proxy settings and verify the Oracle GenAI MCP server URL/region.");
        }
        return Some("MCP remote server hostname could not be resolved. Check DNS/network/proxy settings and verify the MCP server URL/region.");
    }
    if lower.contains("fetch failed") {
        return Some("MCP remote server request failed. Check network/proxy settings and verify the MCP server URL/region.");
    }
    None
}

pub(crate) fn write_mcp_message(
    stdin: &mut std::process::ChildStdin,
    value: &Value,
) -> Result<(), String> {
    let body = value.to_string();
    let frame = format!("Content-Length: {}\r\n\r\n{}", body.as_bytes().len(), body);
    stdin
        .write_all(frame.as_bytes())
        .and_then(|_| stdin.flush())
        .map_err(|error| format!("Failed to write MCP message: {error}"))
}

pub(crate) fn read_mcp_response(
    stdout: &mut std::process::ChildStdout,
    expected_id: i64,
) -> Result<Value, String> {
    loop {
        let value = read_mcp_message(stdout)?;
        if value.get("id").and_then(Value::as_i64) != Some(expected_id) {
            continue;
        }
        if let Some(error) = value.get("error") {
            return Err(format!(
                "MCP returned an error: {}",
                summarize_mcp_error(error)
            ));
        }
        return Ok(value);
    }
}

pub(crate) fn read_mcp_message(stdout: &mut std::process::ChildStdout) -> Result<Value, String> {
    let mut header = Vec::new();
    let mut byte = [0_u8; 1];
    while !header.ends_with(b"\r\n\r\n") && !header.ends_with(b"\n\n") {
        stdout
            .read_exact(&mut byte)
            .map_err(|error| format!("Failed to read MCP response header: {error}"))?;
        header.push(byte[0]);
        if header.len() > 8192 {
            return Err("MCP response header was too large".to_string());
        }
    }
    let header_text = String::from_utf8_lossy(&header);
    let content_length = header_text
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.trim()
                .eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .ok_or_else(|| "MCP response did not include Content-Length".to_string())?;
    let mut body = vec![0_u8; content_length];
    stdout
        .read_exact(&mut body)
        .map_err(|error| format!("Failed to read MCP response body: {error}"))?;
    serde_json::from_slice(&body)
        .map_err(|error| format!("MCP response was malformed JSON: {error}"))
}

pub(crate) fn resolve_mcp_tool_name(
    tools_response: &Value,
    configured_tool_name: &str,
) -> Result<String, String> {
    let configured = configured_tool_name.trim();
    if !configured.is_empty() {
        return Ok(configured.to_string());
    }
    let tools = tools_response
        .get("result")
        .and_then(|result| result.get("tools"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if tools.len() == 1 {
        return tools[0]
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "MCP tool did not include a name".to_string());
    }
    if tools.is_empty() {
        return Err("MCP server did not expose any tools".to_string());
    }
    let names = tools
        .iter()
        .filter_map(|tool| tool.get("name").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join(", ");
    Err(format!(
        "MCP server exposed multiple tools ({names}). Configure a tool name in AI Setup."
    ))
}

pub(crate) fn extract_mcp_text_response(response: &Value) -> Option<String> {
    let result = response.get("result")?;
    if let Some(text) = result.get("text").and_then(Value::as_str) {
        return Some(text.trim().to_string()).filter(|value| !value.is_empty());
    }
    if let Some(content) = result.get("content").and_then(Value::as_array) {
        let text = content
            .iter()
            .filter_map(|item| {
                if item.get("type").and_then(Value::as_str) == Some("text") {
                    item.get("text").and_then(Value::as_str)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        return Some(text.trim().to_string()).filter(|value| !value.is_empty());
    }
    None
}

pub(crate) fn summarize_mcp_error(error: &Value) -> String {
    error
        .get("message")
        .and_then(Value::as_str)
        .or_else(|| error.as_str())
        .unwrap_or("unknown MCP error")
        .to_string()
}

use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    ipc::Response, AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub const SCREENSHOT_REQUEST_EVENT: &str = "screenshot-requested";
pub const SCREENSHOT_CAPTURED_EVENT: &str = "screenshot-captured";
pub const SCREENSHOT_CANCELLED_EVENT: &str = "screenshot-cancelled";

const GLOBAL_SHORTCUT: &str = "Alt+A";
const OVERLAY_LABEL_PREFIX: &str = "screenshot-overlay-";

#[derive(Default)]
pub struct ScreenshotState(Mutex<Option<ScreenshotSession>>);

struct ScreenshotSession {
    id: String,
    monitors: Vec<MonitorCapture>,
    overlay_labels: Vec<String>,
    claimed_monitor_id: Option<String>,
}

struct MonitorCapture {
    id: String,
    name: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f32,
    image_bytes: Vec<u8>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotMonitorDescriptor {
    id: String,
    name: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotBeginResult {
    session_id: String,
    mode: &'static str,
    monitors: Vec<ScreenshotMonitorDescriptor>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotRect {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenshotCapturedPayload {
    session_id: String,
    monitor_id: String,
    selection: ScreenshotRect,
    #[serde(skip_serializing_if = "Option::is_none")]
    edit: Option<serde_json::Value>,
}

fn session_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{}-{nanos}", std::process::id())
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn close_overlay_windows<R: Runtime>(app: &AppHandle<R>, labels: &[String]) {
    for label in labels {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.destroy();
        }
    }
}

fn clear_session_slot(state: &ScreenshotState, session_id: &str) {
    if let Ok(mut session) = state.0.lock() {
        if session
            .as_ref()
            .is_some_and(|active| active.id == session_id)
        {
            *session = None;
        }
    }
}

fn reserve_session_slot(state: &ScreenshotState, session_id: &str) -> Result<(), String> {
    let mut session = state
        .0
        .lock()
        .map_err(|_| "capture_state_failed".to_string())?;
    if session.is_some() {
        return Err("capture_already_active".to_string());
    }
    *session = Some(ScreenshotSession {
        id: session_id.to_string(),
        monitors: Vec::new(),
        overlay_labels: Vec::new(),
        claimed_monitor_id: None,
    });
    Ok(())
}

fn claim_monitor(active: &mut ScreenshotSession, monitor_id: &str) -> Result<Vec<String>, String> {
    if !active
        .monitors
        .iter()
        .any(|monitor| monitor.id == monitor_id)
    {
        return Err("capture_monitor_missing".to_string());
    }
    match active.claimed_monitor_id.as_deref() {
        Some(claimed) if claimed != monitor_id => Err("capture_session_claimed".to_string()),
        Some(_) => Ok(Vec::new()),
        None => {
            active.claimed_monitor_id = Some(monitor_id.to_string());
            let current_label = format!("{OVERLAY_LABEL_PREFIX}{}-{monitor_id}", active.id);
            Ok(active
                .overlay_labels
                .iter()
                .filter(|label| label.as_str() != current_label.as_str())
                .cloned()
                .collect())
        }
    }
}

fn descriptor(monitor: &MonitorCapture) -> ScreenshotMonitorDescriptor {
    ScreenshotMonitorDescriptor {
        id: monitor.id.clone(),
        name: monitor.name.clone(),
        x: monitor.x,
        y: monitor.y,
        width: monitor.width,
        height: monitor.height,
        scale_factor: monitor.scale_factor,
    }
}

fn encode_bmp(image: image::RgbaImage) -> Result<Vec<u8>, String> {
    let pixel_bytes = image
        .width()
        .checked_mul(image.height())
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "capture_encode_failed:image_too_large".to_string())?;
    let file_size = 54_u32
        .checked_add(pixel_bytes)
        .ok_or_else(|| "capture_encode_failed:image_too_large".to_string())?;
    let mut bytes = Vec::with_capacity(file_size as usize);
    bytes.extend_from_slice(b"BM");
    bytes.extend_from_slice(&file_size.to_le_bytes());
    bytes.extend_from_slice(&[0; 4]);
    bytes.extend_from_slice(&54_u32.to_le_bytes());
    bytes.extend_from_slice(&40_u32.to_le_bytes());
    bytes.extend_from_slice(&(image.width() as i32).to_le_bytes());
    bytes.extend_from_slice(&(-(image.height() as i32)).to_le_bytes());
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&32_u16.to_le_bytes());
    bytes.extend_from_slice(&0_u32.to_le_bytes());
    bytes.extend_from_slice(&pixel_bytes.to_le_bytes());
    bytes.extend_from_slice(&[0; 16]);
    for pixel in image.pixels() {
        bytes.extend_from_slice(&[pixel[2], pixel[1], pixel[0], 255]);
    }
    Ok(bytes)
}

fn list_monitors() -> Result<Vec<MonitorCapture>, String> {
    let monitors = xcap::Monitor::all().map_err(|error| format!("capture_failed:{error}"))?;
    if monitors.is_empty() {
        return Err("capture_no_monitor".to_string());
    }
    monitors
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| {
            Ok(MonitorCapture {
                id: index.to_string(),
                name: monitor
                    .name()
                    .unwrap_or_else(|_| format!("Display {}", index + 1)),
                x: monitor.x().unwrap_or_default(),
                y: monitor.y().unwrap_or_default(),
                width: monitor
                    .width()
                    .map_err(|error| format!("capture_failed:{error}"))?,
                height: monitor
                    .height()
                    .map_err(|error| format!("capture_failed:{error}"))?,
                scale_factor: monitor.scale_factor().unwrap_or(1.0).max(0.1),
                image_bytes: Vec::new(),
            })
        })
        .collect()
}

fn capture_monitors() -> Result<Vec<MonitorCapture>, String> {
    let monitors = xcap::Monitor::all().map_err(|error| format!("capture_failed:{error}"))?;
    if monitors.is_empty() {
        return Err("capture_no_monitor".to_string());
    }

    let captures = monitors
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| {
            let image = monitor
                .capture_image()
                .map_err(|error| format!("capture_failed:{error}"))?;
            let width = image.width();
            let height = image.height();
            Ok((
                MonitorCapture {
                    id: index.to_string(),
                    name: monitor
                        .name()
                        .unwrap_or_else(|_| format!("Display {}", index + 1)),
                    x: monitor.x().unwrap_or_default(),
                    y: monitor.y().unwrap_or_default(),
                    width,
                    height,
                    scale_factor: monitor.scale_factor().unwrap_or(1.0).max(0.1),
                    image_bytes: Vec::new(),
                },
                image,
            ))
        })
        .collect::<Result<Vec<_>, String>>()?;

    captures
        .into_iter()
        .map(|(mut monitor, image)| {
            std::thread::spawn(move || {
                monitor.image_bytes = encode_bmp(image)?;
                Ok(monitor)
            })
        })
        .collect::<Vec<_>>()
        .into_iter()
        .map(|task| match task.join() {
            Ok(result) => result,
            Err(_) => Err("capture_encode_failed".to_string()),
        })
        .collect()
}

#[cfg(target_os = "linux")]
fn is_wayland_session() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some()
        && std::env::var("XDG_SESSION_TYPE")
            .map(|value| value.eq_ignore_ascii_case("wayland"))
            .unwrap_or(true)
}

#[cfg(not(target_os = "linux"))]
fn is_wayland_session() -> bool {
    false
}

#[cfg(target_os = "linux")]
async fn capture_wayland_portal() -> Result<Vec<MonitorCapture>, String> {
    use ashpd::desktop::screenshot::Screenshot;

    let request = Screenshot::request()
        .interactive(true)
        .modal(false)
        .send()
        .await
        .map_err(|error| format!("capture_portal_failed:{error}"))?;
    let response = request
        .response()
        .map_err(|_| "capture_cancelled".to_string())?;
    let uri = reqwest::Url::parse(response.uri().as_str())
        .map_err(|error| format!("capture_portal_invalid_uri:{error}"))?;
    let path = uri
        .to_file_path()
        .map_err(|_| "capture_portal_invalid_uri".to_string())?;
    let png =
        std::fs::read(&path).map_err(|error| format!("capture_portal_read_failed:{error}"))?;
    let image = image::load_from_memory(&png)
        .map_err(|error| format!("capture_portal_decode_failed:{error}"))?;
    let image_bytes = encode_bmp(image.to_rgba8())?;

    Ok(vec![MonitorCapture {
        id: "portal".to_string(),
        name: "Wayland Portal".to_string(),
        x: 0,
        y: 0,
        width: image.width(),
        height: image.height(),
        scale_factor: 1.0,
        image_bytes,
    }])
}

fn validate_selection(
    rect: ScreenshotRect,
    monitor: &MonitorCapture,
) -> Result<ScreenshotRect, String> {
    if rect.width == 0 || rect.height == 0 {
        return Err("capture_empty_selection".to_string());
    }

    let x = rect.x.min(monitor.width.saturating_sub(1));
    let y = rect.y.min(monitor.height.saturating_sub(1));
    let width = rect.width.min(monitor.width.saturating_sub(x));
    let height = rect.height.min(monitor.height.saturating_sub(y));
    if width == 0 || height == 0 {
        return Err("capture_empty_selection".to_string());
    }
    Ok(ScreenshotRect {
        x,
        y,
        width,
        height,
    })
}

fn validate_edit_payload(
    mut edit: serde_json::Value,
    monitor: &MonitorCapture,
) -> Result<(ScreenshotRect, serde_json::Value), String> {
    if !edit
        .get("annotations")
        .is_some_and(serde_json::Value::is_array)
    {
        return Err("capture_edit_annotations_invalid".to_string());
    }
    let crop = serde_json::from_value::<ScreenshotRect>(
        edit.get("crop")
            .cloned()
            .ok_or_else(|| "capture_edit_crop_missing".to_string())?,
    )
    .map_err(|_| "capture_edit_crop_invalid".to_string())?;
    let selection = validate_selection(crop, monitor)?;
    edit["crop"] =
        serde_json::to_value(selection).map_err(|_| "capture_edit_crop_invalid".to_string())?;
    Ok((selection, edit))
}

fn overlay_url(session_id: &str, monitor_id: &str) -> PathBuf {
    format!("index.html?screenshotOverlay=1&sessionId={session_id}&monitorId={monitor_id}").into()
}

fn overlay_origin(coordinate: i32, scale_factor: f32) -> f64 {
    #[cfg(windows)]
    {
        f64::from(coordinate) / f64::from(scale_factor.max(0.1))
    }
    #[cfg(not(windows))]
    {
        let _ = scale_factor;
        f64::from(coordinate)
    }
}

fn open_overlay_windows<R: Runtime>(
    app: &AppHandle<R>,
    session_id: &str,
    monitors: &[ScreenshotMonitorDescriptor],
) -> Result<Vec<String>, String> {
    let mut labels = Vec::with_capacity(monitors.len());
    for monitor in monitors {
        let label = format!("{OVERLAY_LABEL_PREFIX}{session_id}-{}", monitor.id);
        let scale = f64::from(monitor.scale_factor.max(0.1));
        let _window = match WebviewWindowBuilder::new(
            app,
            &label,
            WebviewUrl::App(overlay_url(session_id, &monitor.id)),
        )
        .title("Screenshot")
        .visible(false)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .position(
            overlay_origin(monitor.x, monitor.scale_factor),
            overlay_origin(monitor.y, monitor.scale_factor),
        )
        .inner_size(
            f64::from(monitor.width) / scale,
            f64::from(monitor.height) / scale,
        )
        .build()
        {
            Ok(window) => window,
            Err(error) => {
                close_overlay_windows(app, &labels);
                return Err(format!("capture_overlay_failed:{error}"));
            }
        };
        labels.push(label);
    }
    Ok(labels)
}

#[tauri::command]
pub fn screenshot_register_global_shortcut<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    if app.global_shortcut().is_registered(GLOBAL_SHORTCUT) {
        return Ok(true);
    }

    app.global_shortcut()
        .on_shortcut(GLOBAL_SHORTCUT, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let _ = app.emit(SCREENSHOT_REQUEST_EVENT, ());
            }
        })
        .map_err(|error| format!("shortcut_registration_failed:{error}"))?;
    Ok(true)
}

#[tauri::command]
pub async fn screenshot_capture_begin<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ScreenshotState>,
) -> Result<ScreenshotBeginResult, String> {
    let id = session_id();
    reserve_session_slot(&state, &id)?;
    let wayland = is_wayland_session();
    if wayland {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.hide();
        }
        #[cfg(target_os = "linux")]
        {
            let monitors = match capture_wayland_portal().await {
                Ok(monitors) => monitors,
                Err(error) => {
                    clear_session_slot(&state, &id);
                    show_main_window(&app);
                    return Err(error);
                }
            };
            let descriptors = monitors.iter().map(descriptor).collect::<Vec<_>>();
            {
                let mut session = state
                    .0
                    .lock()
                    .map_err(|_| "capture_state_failed".to_string())?;
                if !session.as_ref().is_some_and(|active| active.id == id) {
                    show_main_window(&app);
                    return Err("capture_session_stale".to_string());
                }
                *session = Some(ScreenshotSession {
                    id: id.clone(),
                    monitors,
                    overlay_labels: Vec::new(),
                    claimed_monitor_id: None,
                });
            }
            let monitor = descriptors
                .first()
                .ok_or_else(|| "capture_no_monitor".to_string())?;
            show_main_window(&app);
            if let Err(error) = app.emit(
                SCREENSHOT_CAPTURED_EVENT,
                ScreenshotCapturedPayload {
                    session_id: id.clone(),
                    monitor_id: monitor.id.clone(),
                    selection: ScreenshotRect {
                        x: 0,
                        y: 0,
                        width: monitor.width,
                        height: monitor.height,
                    },
                    edit: None,
                },
            ) {
                clear_session_slot(&state, &id);
                return Err(format!("capture_event_failed:{error}"));
            }
            return Ok(ScreenshotBeginResult {
                session_id: id,
                mode: "portal",
                monitors: descriptors,
            });
        }
        #[cfg(not(target_os = "linux"))]
        unreachable!();
    }

    // Prepare hidden webviews while the editor is still visible so only capture time sits
    // between hiding the editor and showing the frozen screenshot.
    let pending_monitors = match tauri::async_runtime::spawn_blocking(list_monitors).await {
        Ok(Ok(monitors)) => monitors,
        Ok(Err(error)) => {
            clear_session_slot(&state, &id);
            return Err(error);
        }
        Err(error) => {
            clear_session_slot(&state, &id);
            return Err(format!("capture_failed:{error}"));
        }
    };
    let descriptors = pending_monitors.iter().map(descriptor).collect::<Vec<_>>();
    let prepared = state
        .0
        .lock()
        .map(|mut session| {
            if let Some(active) = session.as_mut().filter(|active| active.id == id) {
                active.monitors = pending_monitors;
                true
            } else {
                false
            }
        })
        .unwrap_or(false);
    if !prepared {
        return Err("capture_session_stale".to_string());
    }
    let overlay_labels = match open_overlay_windows(&app, &id, &descriptors) {
        Ok(labels) => labels,
        Err(error) => {
            clear_session_slot(&state, &id);
            return Err(error);
        }
    };
    let assigned = state
        .0
        .lock()
        .map(|mut session| {
            if let Some(active) = session.as_mut().filter(|active| active.id == id) {
                active.overlay_labels = overlay_labels.clone();
                true
            } else {
                false
            }
        })
        .unwrap_or(false);
    if !assigned {
        close_overlay_windows(&app, &overlay_labels);
        return Err("capture_session_stale".to_string());
    }

    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    let monitors = match tauri::async_runtime::spawn_blocking(|| {
        std::thread::sleep(Duration::from_millis(16));
        capture_monitors()
    })
    .await
    {
        Ok(Ok(monitors)) => monitors,
        Ok(Err(error)) => {
            close_overlay_windows(&app, &overlay_labels);
            clear_session_slot(&state, &id);
            show_main_window(&app);
            return Err(error);
        }
        Err(error) => {
            close_overlay_windows(&app, &overlay_labels);
            clear_session_slot(&state, &id);
            show_main_window(&app);
            return Err(format!("capture_failed:{error}"));
        }
    };
    let stored = state
        .0
        .lock()
        .map(|mut session| {
            if let Some(active) = session.as_mut().filter(|active| active.id == id) {
                active.monitors = monitors;
                true
            } else {
                false
            }
        })
        .unwrap_or(false);
    if !stored {
        close_overlay_windows(&app, &overlay_labels);
        show_main_window(&app);
        return Err("capture_session_stale".to_string());
    }

    Ok(ScreenshotBeginResult {
        session_id: id,
        mode: "overlay",
        monitors: descriptors,
    })
}

#[tauri::command]
pub fn screenshot_capture_claim<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ScreenshotState>,
    session_id: String,
    monitor_id: String,
) -> Result<(), String> {
    let labels_to_close = {
        let mut session = state
            .0
            .lock()
            .map_err(|_| "capture_state_failed".to_string())?;
        let active = session
            .as_mut()
            .ok_or_else(|| "capture_session_missing".to_string())?;
        if active.id != session_id {
            return Err("capture_session_stale".to_string());
        }
        claim_monitor(active, &monitor_id)?
    };
    close_overlay_windows(&app, &labels_to_close);
    Ok(())
}

#[tauri::command]
pub fn screenshot_capture_read(
    state: tauri::State<'_, ScreenshotState>,
    session_id: String,
    monitor_id: String,
) -> Result<Response, String> {
    let session = state
        .0
        .lock()
        .map_err(|_| "capture_state_failed".to_string())?;
    let session = session
        .as_ref()
        .ok_or_else(|| "capture_session_missing".to_string())?;
    if session.id != session_id {
        return Err("capture_session_stale".to_string());
    }
    let monitor = session
        .monitors
        .iter()
        .find(|monitor| monitor.id == monitor_id)
        .ok_or_else(|| "capture_monitor_missing".to_string())?;
    if monitor.image_bytes.is_empty() {
        return Err("capture_monitor_pending".to_string());
    }
    Ok(Response::new(monitor.image_bytes.clone()))
}

#[tauri::command]
pub fn screenshot_capture_select<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ScreenshotState>,
    session_id: String,
    monitor_id: String,
    selection: ScreenshotRect,
) -> Result<(), String> {
    let (selection, labels) = {
        let session = state
            .0
            .lock()
            .map_err(|_| "capture_state_failed".to_string())?;
        let session = session
            .as_ref()
            .ok_or_else(|| "capture_session_missing".to_string())?;
        if session.id != session_id {
            return Err("capture_session_stale".to_string());
        }
        let monitor = session
            .monitors
            .iter()
            .find(|monitor| monitor.id == monitor_id)
            .ok_or_else(|| "capture_monitor_missing".to_string())?;
        if session
            .claimed_monitor_id
            .as_deref()
            .is_some_and(|claimed| claimed != monitor_id.as_str())
        {
            return Err("capture_session_claimed".to_string());
        }
        (
            validate_selection(selection, monitor)?,
            session.overlay_labels.clone(),
        )
    };

    close_overlay_windows(&app, &labels);
    show_main_window(&app);
    if let Err(error) = app.emit(
        SCREENSHOT_CAPTURED_EVENT,
        ScreenshotCapturedPayload {
            session_id: session_id.clone(),
            monitor_id,
            selection,
            edit: None,
        },
    ) {
        clear_session_slot(&state, &session_id);
        return Err(format!("capture_event_failed:{error}"));
    }
    Ok(())
}

#[tauri::command]
pub fn screenshot_capture_finish<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ScreenshotState>,
    session_id: String,
    monitor_id: String,
    edit: serde_json::Value,
) -> Result<(), String> {
    let (selection, edit) = {
        let session = state
            .0
            .lock()
            .map_err(|_| "capture_state_failed".to_string())?;
        let session = session
            .as_ref()
            .ok_or_else(|| "capture_session_missing".to_string())?;
        if session.id != session_id {
            return Err("capture_session_stale".to_string());
        }
        let monitor = session
            .monitors
            .iter()
            .find(|monitor| monitor.id == monitor_id)
            .ok_or_else(|| "capture_monitor_missing".to_string())?;
        if session.claimed_monitor_id.as_deref() != Some(monitor_id.as_str()) {
            return Err("capture_session_claimed".to_string());
        }
        validate_edit_payload(edit, monitor)?
    };

    app.emit(
        SCREENSHOT_CAPTURED_EVENT,
        ScreenshotCapturedPayload {
            session_id,
            monitor_id,
            selection,
            edit: Some(edit),
        },
    )
    .map_err(|error| format!("capture_event_failed:{error}"))
}

#[tauri::command]
pub fn screenshot_capture_cancel<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ScreenshotState>,
    session_id: String,
) -> Result<(), String> {
    let labels = {
        let mut session = state
            .0
            .lock()
            .map_err(|_| "capture_state_failed".to_string())?;
        let labels = match session.as_ref() {
            Some(active) if active.id == session_id => active.overlay_labels.clone(),
            Some(_) => return Err("capture_session_stale".to_string()),
            None => return Ok(()),
        };
        *session = None;
        labels
    };
    close_overlay_windows(&app, &labels);
    show_main_window(&app);
    let _ = app.emit(SCREENSHOT_CANCELLED_EVENT, ());
    Ok(())
}

#[tauri::command]
pub fn screenshot_capture_release<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ScreenshotState>,
    session_id: String,
) -> Result<(), String> {
    let mut session = state
        .0
        .lock()
        .map_err(|_| "capture_state_failed".to_string())?;
    let labels = match session.as_ref() {
        Some(active) if active.id == session_id => {
            let labels = active.overlay_labels.clone();
            *session = None;
            labels
        }
        Some(_) => return Err("capture_session_stale".to_string()),
        None => Vec::new(),
    };
    drop(session);
    close_overlay_windows(&app, &labels);
    show_main_window(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn monitor(width: u32, height: u32) -> MonitorCapture {
        MonitorCapture {
            id: "0".to_string(),
            name: "test".to_string(),
            x: -1920,
            y: 0,
            width,
            height,
            scale_factor: 1.0,
            image_bytes: Vec::new(),
        }
    }

    #[test]
    fn selection_is_clamped_to_monitor_pixels() {
        assert_eq!(
            validate_selection(
                ScreenshotRect {
                    x: 90,
                    y: 40,
                    width: 40,
                    height: 40
                },
                &monitor(100, 50),
            )
            .unwrap(),
            ScreenshotRect {
                x: 90,
                y: 40,
                width: 10,
                height: 10
            }
        );
    }

    #[test]
    fn empty_selection_is_rejected() {
        assert!(validate_selection(
            ScreenshotRect {
                x: 0,
                y: 0,
                width: 0,
                height: 10
            },
            &monitor(100, 50),
        )
        .is_err());
    }

    #[test]
    fn screenshot_session_reservation_is_mutually_exclusive_and_releasable() {
        let state = ScreenshotState::default();
        assert!(reserve_session_slot(&state, "first").is_ok());
        assert_eq!(
            reserve_session_slot(&state, "second").unwrap_err(),
            "capture_already_active"
        );
        clear_session_slot(&state, "stale");
        assert_eq!(
            reserve_session_slot(&state, "second").unwrap_err(),
            "capture_already_active"
        );
        clear_session_slot(&state, "first");
        assert!(reserve_session_slot(&state, "second").is_ok());
    }

    #[test]
    fn first_monitor_claim_wins_the_multi_display_session() {
        let mut session = ScreenshotSession {
            id: "session".to_string(),
            monitors: vec![
                monitor(100, 50),
                MonitorCapture {
                    id: "1".to_string(),
                    ..monitor(100, 50)
                },
            ],
            overlay_labels: vec![
                "screenshot-overlay-session-0".to_string(),
                "screenshot-overlay-session-1".to_string(),
            ],
            claimed_monitor_id: None,
        };
        assert_eq!(
            claim_monitor(&mut session, "0").unwrap(),
            vec!["screenshot-overlay-session-1"]
        );
        assert!(claim_monitor(&mut session, "0").unwrap().is_empty());
        assert_eq!(
            claim_monitor(&mut session, "1").unwrap_err(),
            "capture_session_claimed"
        );
    }

    #[test]
    fn monitor_descriptor_preserves_negative_desktop_coordinates() {
        let monitor = monitor(1920, 1080);
        let descriptor = descriptor(&monitor);
        assert_eq!(descriptor.x, -1920);
        assert_eq!(descriptor.y, 0);
    }

    #[test]
    fn bmp_encoder_keeps_dimensions_and_pixel_order() {
        let bmp = encode_bmp(image::RgbaImage::from_pixel(
            7,
            5,
            image::Rgba([1, 2, 3, 255]),
        ))
        .unwrap();
        assert_eq!(&bmp[0..2], b"BM");
        assert_eq!(i32::from_le_bytes(bmp[18..22].try_into().unwrap()), 7);
        assert_eq!(i32::from_le_bytes(bmp[22..26].try_into().unwrap()), -5);
        assert_eq!(&bmp[54..58], &[3, 2, 1, 255]);
        assert_eq!(bmp.len(), 54 + 7 * 5 * 4);
    }

    #[test]
    fn finished_edit_keeps_annotations_and_clamps_crop() {
        let edit = serde_json::json!({
            "crop": { "x": 90, "y": 40, "width": 40, "height": 40 },
            "annotations": [{ "type": "rectangle" }]
        });
        let (selection, normalized) = validate_edit_payload(edit, &monitor(100, 50)).unwrap();
        assert_eq!(
            selection,
            ScreenshotRect {
                x: 90,
                y: 40,
                width: 10,
                height: 10
            }
        );
        assert_eq!(normalized["crop"]["width"], 10);
        assert_eq!(normalized["annotations"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn finished_edit_rejects_missing_annotation_list() {
        let edit = serde_json::json!({
            "crop": { "x": 0, "y": 0, "width": 10, "height": 10 }
        });
        assert_eq!(
            validate_edit_payload(edit, &monitor(100, 50)).unwrap_err(),
            "capture_edit_annotations_invalid"
        );
    }
}

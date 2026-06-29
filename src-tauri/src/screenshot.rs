use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    ipc::Response, AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub const SCREENSHOT_REQUEST_EVENT: &str = "screenshot-requested";
pub const SCREENSHOT_CAPTURED_EVENT: &str = "screenshot-captured";
pub const SCREENSHOT_CANCELLED_EVENT: &str = "screenshot-cancelled";
pub const SCREENSHOT_OVERLAY_BEGIN_EVENT: &str = "screenshot-overlay-begin";

const GLOBAL_SHORTCUT: &str = "Alt+A";
const OVERLAY_LABEL_PREFIX: &str = "screenshot-overlay-";

#[derive(Default)]
pub struct ScreenshotState(Mutex<Option<ScreenshotSession>>);

/// Warm pool of reusable overlay windows. Built once per monitor layout and
/// shown/hidden across captures, so we never pay WebView cold-boot per
/// screenshot — that cold boot was the dominant "Alt+A feels dead" latency.
#[derive(Default)]
pub struct OverlayPoolState(Mutex<OverlayPool>);

#[derive(Default)]
struct OverlayPool {
    signature: Option<String>,
    labels: Vec<String>,
}

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

/// Park the editor out of the way after "copy to clipboard": keep it reachable
/// (a hidden window loses its taskbar button) but don't yank it to the
/// foreground — the user copied to paste somewhere else.
#[cfg(windows)]
fn park_main_window<R: Runtime>(app: &AppHandle<R>) {
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWMINNOACTIVE};
    if let Some(window) = app.get_webview_window("main") {
        // Show minimized WITHOUT activating — no foreground flash, taskbar stays.
        if let Ok(hwnd) = window.hwnd() {
            unsafe {
                let _ = ShowWindow(hwnd, SW_SHOWMINNOACTIVE);
            }
            return;
        }
        let _ = window.show();
        let _ = window.minimize();
    }
}

#[cfg(not(windows))]
fn park_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.minimize();
    }
}

/// Permanently tear down overlay windows. Used only when the monitor layout
/// changed and the warm pool must be rebuilt.
fn destroy_overlay_windows<R: Runtime>(app: &AppHandle<R>, labels: &[String]) {
    for label in labels {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.destroy();
        }
    }
}

/// Hide overlay windows but keep them warm for the next capture.
fn hide_overlay_windows<R: Runtime>(app: &AppHandle<R>, labels: &[String]) {
    for label in labels {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.hide();
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
            let current_label = format!("{OVERLAY_LABEL_PREFIX}{monitor_id}");
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

#[cfg(not(target_os = "linux"))]
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

#[cfg(target_os = "linux")]
fn list_monitors() -> Result<Vec<MonitorCapture>, String> {
    x11_capture::monitors(false)
}

#[cfg(not(target_os = "linux"))]
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
fn capture_monitors() -> Result<Vec<MonitorCapture>, String> {
    x11_capture::monitors(true)
}

#[cfg(any(target_os = "linux", test))]
#[cfg_attr(test, allow(dead_code))]
mod x11_capture {
    use super::{encode_bmp, MonitorCapture};
    use x11rb::{
        connection::Connection,
        image::{Image, PixelLayout},
        protocol::{randr, xproto},
    };

    fn error(error: impl std::fmt::Display) -> String {
        format!("capture_failed:{error}")
    }

    fn monitor_name<C: Connection>(connection: &C, atom: u32, index: usize) -> String {
        if atom != x11rb::NONE {
            if let Some(name) = xproto::get_atom_name(connection, atom)
                .ok()
                .and_then(|cookie| cookie.reply().ok())
                .and_then(|reply| String::from_utf8(reply.name).ok())
                .filter(|name| !name.is_empty())
            {
                return name;
            }
        }
        format!("Display {}", index + 1)
    }

    fn pixel_rgba(layout: PixelLayout, pixel: u32) -> [u8; 4] {
        let (red, green, blue) = layout.decode(pixel);
        [(red >> 8) as u8, (green >> 8) as u8, (blue >> 8) as u8, 255]
    }

    fn capture_bmp<C: Connection>(
        connection: &C,
        root: xproto::Window,
        x: i16,
        y: i16,
        width: u16,
        height: u16,
    ) -> Result<Vec<u8>, String> {
        let (ximage, visual_id) =
            Image::get(connection, root, x, y, width, height).map_err(error)?;
        let visual = connection
            .setup()
            .roots
            .iter()
            .flat_map(|screen| screen.allowed_depths.iter())
            .flat_map(|depth| depth.visuals.iter())
            .find(|visual| visual.visual_id == visual_id)
            .cloned()
            .ok_or_else(|| "capture_failed:x11_visual_missing".to_string())?;
        let layout = PixelLayout::from_visual_type(visual).map_err(error)?;
        let rgba = image::RgbaImage::from_fn(u32::from(width), u32::from(height), |x, y| {
            image::Rgba(pixel_rgba(layout, ximage.get_pixel(x as u16, y as u16)))
        });
        encode_bmp(rgba)
    }

    pub(super) fn monitors(capture_pixels: bool) -> Result<Vec<MonitorCapture>, String> {
        let (connection, screen_number) = x11rb::connect(None).map_err(error)?;
        let screen = connection
            .setup()
            .roots
            .get(screen_number)
            .ok_or_else(|| "capture_no_monitor".to_string())?;
        let root = screen.root;
        let fallback_width = screen.width_in_pixels;
        let fallback_height = screen.height_in_pixels;
        let monitor_infos = randr::get_monitors(&connection, root, true)
            .ok()
            .and_then(|cookie| cookie.reply().ok())
            .map(|reply| reply.monitors)
            .unwrap_or_default();

        if monitor_infos.is_empty() {
            return Ok(vec![MonitorCapture {
                id: "0".to_string(),
                name: "Display 1".to_string(),
                x: 0,
                y: 0,
                width: u32::from(fallback_width),
                height: u32::from(fallback_height),
                scale_factor: 1.0,
                image_bytes: if capture_pixels {
                    capture_bmp(&connection, root, 0, 0, fallback_width, fallback_height)?
                } else {
                    Vec::new()
                },
            }]);
        }

        monitor_infos
            .into_iter()
            .enumerate()
            .map(|(index, monitor)| {
                Ok(MonitorCapture {
                    id: index.to_string(),
                    name: monitor_name(&connection, monitor.name, index),
                    x: i32::from(monitor.x),
                    y: i32::from(monitor.y),
                    width: u32::from(monitor.width),
                    height: u32::from(monitor.height),
                    scale_factor: 1.0,
                    image_bytes: if capture_pixels {
                        capture_bmp(
                            &connection,
                            root,
                            monitor.x,
                            monitor.y,
                            monitor.width,
                            monitor.height,
                        )?
                    } else {
                        Vec::new()
                    },
                })
            })
            .collect()
    }

    #[test]
    fn pixel_conversion_uses_x11_visual_masks() {
        use x11rb::image::ColorComponent;

        let layout = PixelLayout::new(
            ColorComponent::new(8, 16).unwrap(),
            ColorComponent::new(8, 8).unwrap(),
            ColorComponent::new(8, 0).unwrap(),
        );
        assert_eq!(pixel_rgba(layout, 0x0011_2233), [0x11, 0x22, 0x33, 255]);
    }
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

fn overlay_url(monitor_id: &str) -> PathBuf {
    format!("index.html?screenshotOverlay=1&monitorId={monitor_id}").into()
}

/// Stable fingerprint of the current monitor layout. While it stays constant we
/// can reuse the warm overlay windows verbatim; when it changes (resolution,
/// plug/unplug, rearrange) we rebuild the pool.
fn layout_signature(monitors: &[ScreenshotMonitorDescriptor]) -> String {
    monitors
        .iter()
        .map(|m| format!("{}:{}:{}:{}:{}:{}", m.id, m.x, m.y, m.width, m.height, m.scale_factor))
        .collect::<Vec<_>>()
        .join("|")
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

/// Return the warm overlay windows for the current layout, building them once
/// and reusing them on every subsequent capture. Reuse is the whole point: a
/// fresh WebView per capture cost 100-500ms of cold boot per monitor.
fn ensure_overlay_windows<R: Runtime>(
    app: &AppHandle<R>,
    pool: &OverlayPoolState,
    monitors: &[ScreenshotMonitorDescriptor],
) -> Result<Vec<String>, String> {
    let signature = layout_signature(monitors);
    let mut guard = pool
        .0
        .lock()
        .map_err(|_| "capture_state_failed".to_string())?;

    let reusable = guard.signature.as_deref() == Some(signature.as_str())
        && guard.labels.len() == monitors.len()
        && guard
            .labels
            .iter()
            .all(|label| app.get_webview_window(label).is_some());
    if reusable {
        return Ok(guard.labels.clone());
    }

    // Layout changed (or first run / a window went missing): rebuild the pool.
    destroy_overlay_windows(app, &guard.labels);
    guard.signature = None;
    guard.labels = Vec::new();

    let mut labels = Vec::with_capacity(monitors.len());
    for monitor in monitors {
        let label = format!("{OVERLAY_LABEL_PREFIX}{}", monitor.id);
        let scale = f64::from(monitor.scale_factor.max(0.1));
        let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(overlay_url(&monitor.id)))
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
            .build();
        if let Err(error) = built {
            destroy_overlay_windows(app, &labels);
            return Err(format!("capture_overlay_failed:{error}"));
        }
        labels.push(label);
    }

    guard.signature = Some(signature);
    guard.labels = labels.clone();
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
    pool: tauri::State<'_, OverlayPoolState>,
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
    let overlay_labels = match ensure_overlay_windows(&app, &pool, &descriptors) {
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
        hide_overlay_windows(&app, &overlay_labels);
        return Err("capture_session_stale".to_string());
    }

    // Hand the session id to the (warm) overlays now, before capture, so they
    // begin polling for pixels during the capture instead of after it. Cold
    // overlays that mount mid-capture catch up via `screenshot_active_session`.
    let _ = app.emit(
        SCREENSHOT_OVERLAY_BEGIN_EVENT,
        serde_json::json!({ "sessionId": id }),
    );

    let monitors = match tauri::async_runtime::spawn_blocking(capture_monitors).await {
        Ok(Ok(monitors)) => monitors,
        Ok(Err(error)) => {
            hide_overlay_windows(&app, &overlay_labels);
            clear_session_slot(&state, &id);
            show_main_window(&app);
            return Err(error);
        }
        Err(error) => {
            hide_overlay_windows(&app, &overlay_labels);
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
        hide_overlay_windows(&app, &overlay_labels);
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
    hide_overlay_windows(&app, &labels_to_close);
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

    hide_overlay_windows(&app, &labels);
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
    hide_overlay_windows(&app, &labels);
    show_main_window(&app);
    let _ = app.emit(SCREENSHOT_CANCELLED_EVENT, ());
    Ok(())
}

/// Close the capture after "copy to clipboard": like cancel, but parks (does not
/// raise) the editor so focus stays where the user will paste.
#[tauri::command]
pub fn screenshot_capture_dismiss<R: Runtime>(
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
    hide_overlay_windows(&app, &labels);
    park_main_window(&app);
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
    hide_overlay_windows(&app, &labels);
    show_main_window(&app);
    Ok(())
}

#[tauri::command]
pub fn screenshot_hide_main<R: Runtime>(app: AppHandle<R>) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
}

/// Current active session id, if any. A warm overlay window that boots mid
/// capture (first run or after a layout rebuild) may miss the broadcast
/// `screenshot-overlay-begin` event, so it queries this on mount to catch up.
#[tauri::command]
pub fn screenshot_active_session(
    state: tauri::State<'_, ScreenshotState>,
) -> Result<Option<String>, String> {
    let session = state
        .0
        .lock()
        .map_err(|_| "capture_state_failed".to_string())?;
    Ok(session.as_ref().map(|active| active.id.clone()))
}

/// Visible top-level window rectangles intersected with one monitor, expressed
/// in that monitor's image-pixel coordinates (origin = monitor top-left). The
/// overlay uses these to offer PixPin-style "hover a window, click to grab it".
#[cfg(not(target_os = "linux"))]
fn enumerate_window_rects(mx: i32, my: i32, mw: u32, mh: u32) -> Vec<ScreenshotRect> {
    let Ok(windows) = xcap::Window::all() else {
        return Vec::new();
    };
    let mon_right = mx.saturating_add(mw as i32);
    let mon_bottom = my.saturating_add(mh as i32);
    let mut rects = Vec::new();
    for window in windows {
        if window.is_minimized().unwrap_or(true) {
            continue;
        }
        // Skip our own fullscreen overlays (titled "Screenshot").
        if window.title().map(|title| title == "Screenshot").unwrap_or(false) {
            continue;
        }
        let (Ok(wx), Ok(wy), Ok(ww), Ok(wh)) =
            (window.x(), window.y(), window.width(), window.height())
        else {
            continue;
        };
        if ww == 0 || wh == 0 {
            continue;
        }
        let left = wx.max(mx);
        let top = wy.max(my);
        let right = wx.saturating_add(ww as i32).min(mon_right);
        let bottom = wy.saturating_add(wh as i32).min(mon_bottom);
        if right <= left || bottom <= top {
            continue;
        }
        rects.push(ScreenshotRect {
            x: (left - mx) as u32,
            y: (top - my) as u32,
            width: (right - left) as u32,
            height: (bottom - top) as u32,
        });
    }
    rects
}

#[cfg(target_os = "linux")]
fn enumerate_window_rects(_mx: i32, _my: i32, _mw: u32, _mh: u32) -> Vec<ScreenshotRect> {
    // Best-effort feature: X11/Wayland window enumeration is skipped for now and
    // the overlay simply falls back to manual drag selection.
    Vec::new()
}

/// Copy an annotated screenshot to the OS clipboard. The RGBA is sent as the
/// whole IPC payload (octet-stream fast path) — wrapping bytes in a JSON object
/// makes Tauri serialize them to a number array, which is seconds-slow for big
/// images. Width/height ride along in headers, mirroring the fs plugin.
#[tauri::command]
pub fn screenshot_copy_image<R: Runtime>(
    app: AppHandle<R>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    use std::borrow::Cow;
    use tauri_plugin_clipboard_manager::ClipboardExt;

    let rgba: Cow<[u8]> = match request.body() {
        tauri::ipc::InvokeBody::Raw(data) => Cow::Borrowed(data),
        // Fallback for the postMessage IPC path (custom protocol unavailable).
        tauri::ipc::InvokeBody::Json(serde_json::Value::Array(data)) => Cow::Owned(
            data.iter()
                .map(|value| value.as_u64().unwrap_or(0) as u8)
                .collect(),
        ),
        _ => return Err("capture_copy_invalid_body".to_string()),
    };

    let header = |name: &str| -> Option<u32> {
        request.headers().get(name)?.to_str().ok()?.parse().ok()
    };
    let width = header("width").ok_or_else(|| "capture_copy_missing_size".to_string())?;
    let height = header("height").ok_or_else(|| "capture_copy_missing_size".to_string())?;
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4));
    if expected != Some(rgba.len()) {
        return Err("capture_copy_size_mismatch".to_string());
    }

    let image = tauri::image::Image::new(&rgba, width, height);
    app.clipboard()
        .write_image(&image)
        .map_err(|error| format!("capture_copy_failed:{error}"))
}

#[tauri::command]
pub fn screenshot_window_rects(
    state: tauri::State<'_, ScreenshotState>,
    session_id: String,
    monitor_id: String,
) -> Result<Vec<ScreenshotRect>, String> {
    let geometry = {
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
        (monitor.x, monitor.y, monitor.width, monitor.height)
    };
    // Enumerate outside the lock — xcap window queries are comparatively slow.
    Ok(enumerate_window_rects(geometry.0, geometry.1, geometry.2, geometry.3))
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
                "screenshot-overlay-0".to_string(),
                "screenshot-overlay-1".to_string(),
            ],
            claimed_monitor_id: None,
        };
        assert_eq!(
            claim_monitor(&mut session, "0").unwrap(),
            vec!["screenshot-overlay-1"]
        );
        assert!(claim_monitor(&mut session, "0").unwrap().is_empty());
        assert_eq!(
            claim_monitor(&mut session, "1").unwrap_err(),
            "capture_session_claimed"
        );
    }

    #[test]
    fn layout_signature_is_stable_and_layout_sensitive() {
        let one = descriptor(&monitor(1920, 1080));
        let two = ScreenshotMonitorDescriptor {
            id: "1".to_string(),
            ..descriptor(&monitor(2560, 1440))
        };
        let base = layout_signature(&[one.clone(), two.clone()]);
        // Same layout → identical signature (warm pool reused).
        assert_eq!(base, layout_signature(&[one.clone(), two.clone()]));
        // A resolution change → different signature (pool rebuilt).
        let resized = ScreenshotMonitorDescriptor { width: 3840, ..one.clone() };
        assert_ne!(base, layout_signature(&[resized, two]));
        // Fewer monitors → different signature.
        assert_ne!(base, layout_signature(&[one]));
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

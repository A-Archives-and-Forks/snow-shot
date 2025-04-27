use device_query::{DeviceQuery, DeviceState, MouseState};
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::codecs::webp::WebPEncoder;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::command;
use tauri::ipc::Response;
use xcap::{Monitor, Window};

use crate::os::ElementRect;
use crate::os::ui_automation::UIElements;

fn get_device_mouse_position() -> (i32, i32) {
    let device_state = DeviceState::new();
    let mouse: MouseState = device_state.get_mouse();

    mouse.coords
}

#[command]
pub async fn capture_current_monitor(encoder: String) -> Response {
    // 获取当前鼠标的位置
    let (mouse_x, mouse_y) = get_device_mouse_position();

    // 获取当前鼠标所在屏幕的截图图像
    let monitor = Monitor::from_point(mouse_x, mouse_y).unwrap();

    let image_buffer = monitor.capture_image().unwrap();

    // 前端处理渲染图片的方式有两种
    // 1. 接受 RGBA 数据通过 canvas 转为 base64 后显示
    // 2. 直接接受 png、jpg 文件格式的二进制数据
    // 所以无需将原始的 RGBA 数据返回给前端，直接在 rust 编码为指定格式返回前端
    // 前端也无需再转为 base64 显示

    // 编码为指定格式
    let mut buf = Vec::with_capacity(image_buffer.len() + 10 * 4);

    if encoder == "webp" {
        image_buffer
            .write_with_encoder(WebPEncoder::new_lossless(&mut buf))
            .unwrap();
    } else {
        image_buffer
            .write_with_encoder(PngEncoder::new_with_quality(
                &mut buf,
                CompressionType::Fast,
                FilterType::Adaptive,
            ))
            .unwrap();
    }

    // 将屏幕信息也推送到前端
    let monitor_x_bytes = monitor.x().unwrap_or(0).to_le_bytes();
    let monitor_y_bytes = monitor.y().unwrap_or(0).to_le_bytes();
    let monitor_width_bytes = monitor.width().unwrap_or(0).to_le_bytes();
    let monitor_height_bytes = monitor.height().unwrap_or(0).to_le_bytes();
    let monitor_scale_factor_bytes = monitor.scale_factor().unwrap_or(0.0).to_le_bytes();
    let mouse_x_bytes = mouse_x.to_le_bytes();
    let mouse_y_bytes = mouse_y.to_le_bytes();

    buf.push(monitor_x_bytes[0]);
    buf.push(monitor_x_bytes[1]);
    buf.push(monitor_x_bytes[2]);
    buf.push(monitor_x_bytes[3]);

    buf.push(monitor_y_bytes[0]);
    buf.push(monitor_y_bytes[1]);
    buf.push(monitor_y_bytes[2]);
    buf.push(monitor_y_bytes[3]);

    buf.push(monitor_width_bytes[0]);
    buf.push(monitor_width_bytes[1]);
    buf.push(monitor_width_bytes[2]);
    buf.push(monitor_width_bytes[3]);

    buf.push(monitor_height_bytes[0]);
    buf.push(monitor_height_bytes[1]);
    buf.push(monitor_height_bytes[2]);
    buf.push(monitor_height_bytes[3]);

    buf.push(monitor_scale_factor_bytes[0]);
    buf.push(monitor_scale_factor_bytes[1]);
    buf.push(monitor_scale_factor_bytes[2]);
    buf.push(monitor_scale_factor_bytes[3]);

    buf.push(mouse_x_bytes[0]);
    buf.push(mouse_x_bytes[1]);
    buf.push(mouse_x_bytes[2]);
    buf.push(mouse_x_bytes[3]);

    buf.push(mouse_y_bytes[0]);
    buf.push(mouse_y_bytes[1]);
    buf.push(mouse_y_bytes[2]);
    buf.push(mouse_y_bytes[3]);

    return Response::new(buf);
}

#[command]
pub async fn init_ui_elements(
    ui_elements: tauri::State<'_, Mutex<UIElements>>,
    window: tauri::Window,
) -> Result<(), ()> {
    let mut ui_elements = match ui_elements.lock() {
        Ok(ui_elements) => ui_elements,
        Err(_) => return Err(()),
    };

    match ui_elements.init(match window.hwnd() {
        Ok(hwnd) => Some(hwnd),
        Err(_) => None,
    }) {
        Ok(_) => Ok(()),
        Err(_) => Err(()),
    }
}

#[command]
pub async fn init_ui_elements_cache(
    ui_elements: tauri::State<'_, Mutex<UIElements>>,
) -> Result<(), ()> {
    // 获取当前鼠标的位置
    let (mouse_x, mouse_y) = get_device_mouse_position();

    let mut ui_elements = match ui_elements.lock() {
        Ok(ui_elements) => ui_elements,
        Err(_) => return Err(()),
    };

    match ui_elements.init_cache() {
        Ok(_) => (),
        Err(_) => return Err(()),
    }

    // 用当前鼠标位置初始化下
    match ui_elements.get_element_from_point_walker(mouse_x, mouse_y) {
        Ok(_) => (),
        Err(_) => return Err(()),
    }

    Ok(())
}

#[command]
pub async fn get_window_elements() -> Result<Vec<ElementRect>, ()> {
    // 获取当前鼠标的位置
    let device_state = DeviceState::new();
    let mouse: MouseState = device_state.get_mouse();
    let (mouse_x, mouse_y) = mouse.coords;

    let monitor = xcap::Monitor::from_point(mouse_x, mouse_y).unwrap();
    let monitor_min_x = monitor.x().unwrap_or(0);
    let monitor_min_y = monitor.y().unwrap_or(0);
    let monitor_max_x = monitor_min_x + monitor.width().unwrap_or(0) as i32;
    let monitor_max_y = monitor_min_y + monitor.height().unwrap_or(0) as i32;

    // 获取所有窗口，简单筛选下需要的窗口，然后获取窗口所有元素
    let windows = Window::all().unwrap_or_default();

    let mut rect_list = Vec::new();
    for window in windows {
        if window.is_minimized().unwrap_or(true) {
            continue;
        }

        if let Ok(title) = window.title() {
            if title.eq("Shell Handwriting Canvas") {
                continue;
            }
        }

        let x = match window.x() {
            Ok(x) => x,
            Err(_) => continue,
        };

        let y = match window.y() {
            Ok(y) => y,
            Err(_) => continue,
        };

        let width = match window.width() {
            Ok(width) => width,
            Err(_) => continue,
        };
        let height = match window.height() {
            Ok(height) => height,
            Err(_) => continue,
        };

        // 保留在屏幕内的窗口
        if !(x >= monitor_min_x && y >= monitor_min_y && x <= monitor_max_x && y <= monitor_max_y) {
            continue;
        }

        rect_list.push(ElementRect {
            min_x: x,
            min_y: y,
            max_x: x + width as i32,
            max_y: y + height as i32,
        });
    }

    Ok(rect_list)
}

#[command]
pub async fn get_element_from_position(
    ui_elements: tauri::State<'_, Mutex<UIElements>>,
    mouse_x: i32,
    mouse_y: i32,
) -> Result<Vec<ElementRect>, ()> {
    let mut ui_elements = ui_elements.lock().unwrap();
    let element_rect_list = match ui_elements.get_element_from_point_walker(mouse_x, mouse_y) {
        Ok(element_rect) => element_rect,
        Err(_) => {
            return Err(());
        }
    };

    Ok(element_rect_list)
}

#[command]
pub async fn get_mouse_position() -> Result<(i32, i32), ()> {
    let device_state = DeviceState::new();
    let mouse: MouseState = device_state.get_mouse();
    let (mouse_x, mouse_y) = mouse.coords;

    Ok((mouse_x, mouse_y))
}

#[command]
pub async fn create_draw_window(app: tauri::AppHandle) {
    tauri::WebviewWindowBuilder::new(
        &app,
        format!(
            "draw-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs()
        ),
        tauri::WebviewUrl::App("/draw".into()),
    )
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .fullscreen(false)
    .title("Snow Shot - Draw")
    .center()
    .decorations(false)
    .shadow(false)
    .transparent(true)
    .skip_taskbar(true)
    .maximizable(false)
    .minimizable(false)
    .resizable(false)
    .inner_size(0.0, 0.0)
    .build()
    .unwrap();
}

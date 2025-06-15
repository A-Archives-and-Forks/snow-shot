use num_cpus;
use paddle_ocr_rs::ocr_lite::OcrLite;
use std::{io::Cursor, sync::Mutex};
use tauri::{Manager, command, path::BaseDirectory};

pub struct OcrLiteWrap {
    pub ocr_instance: Option<OcrLite>,
}

#[command]
pub async fn ocr_init(
    app: tauri::AppHandle,
    ocr_instance: tauri::State<'_, Mutex<OcrLiteWrap>>,
) -> Result<(), ()> {
    let mut ocr_wrap_instance = match ocr_instance.lock() {
        Ok(ocr_instance) => ocr_instance,
        Err(_) => return Err(()),
    };

    let resource_path = match app.path().resolve("models", BaseDirectory::Resource) {
        Ok(resource_path) => resource_path,
        Err(_) => return Err(()),
    };

    let ocr_instance = match &mut ocr_wrap_instance.ocr_instance {
        Some(ocr_lite_instance) => ocr_lite_instance,
        None => return Err(()),
    };

    ocr_instance
        .init_models(
            &resource_path
                .join("ch_PP-OCRv5_mobile_det.onnx")
                .display()
                .to_string(),
            &resource_path
                .join("ch_ppocr_mobile_v2.0_cls_infer.onnx")
                .display()
                .to_string(),
            &resource_path
                .join("ch_PP-OCRv5_rec_mobile_infer.onnx")
                .display()
                .to_string(),
            (num_cpus::get() / 2).max(1),
        )
        .unwrap();

    Ok(())
}

#[command]
pub async fn ocr_detect(
    ocr_instance: tauri::State<'_, Mutex<OcrLiteWrap>>,
    request: tauri::ipc::Request<'_>,
) -> Result<String, ()> {
    let mut ocr_wrap_instance = match ocr_instance.lock() {
        Ok(ocr_instance) => ocr_instance,
        Err(_) => return Err(()),
    };

    let ocr_instance = match &mut ocr_wrap_instance.ocr_instance {
        Some(ocr_lite_instance) => ocr_lite_instance,
        None => return Err(()),
    };

    let image_data = match request.body() {
        tauri::ipc::InvokeBody::Raw(data) => data,
        _ => return Err(()),
    };

    let image = match image::load(Cursor::new(image_data), image::ImageFormat::Jpeg) {
        Ok(image) => image,
        Err(_) => return Err(()),
    };

    let scale_factor: f32 = match request.headers().get("x-scale-factor") {
        Some(header) => match header.to_str() {
            Ok(scale_factor) => scale_factor.parse::<f32>().unwrap(),
            Err(_) => return Err(()),
        },
        None => return Err(()),
    };

    let image_buffer = image.to_rgb8();
    let ocr_result = ocr_instance.detect_angle_rollback(
        &image_buffer,
        50,
        (image.height().max(image.width()) as f32 / scale_factor) as u32,
        0.5,
        0.3,
        1.6,
        true,
        false,
        0.9, // 屏幕截取的文字质量通常较高，且非横向排版的情况较少，尽量减少角度的影响
    );

    match ocr_result {
        Ok(ocr_result) => Ok(serde_json::to_string(&ocr_result).unwrap()),
        Err(_) => return Err(()),
    }
}

#[command]
pub async fn ocr_release(ocr_instance: tauri::State<'_, Mutex<OcrLiteWrap>>) -> Result<(), ()> {
    let mut ocr_instance = match ocr_instance.lock() {
        Ok(ocr_instance) => ocr_instance,
        Err(_) => return Err(()),
    };

    ocr_instance.ocr_instance.take();

    Ok(())
}

use serde::{Deserialize, Serialize};
use tauri::command;

#[cfg(target_os = "macos")]
use std::process::Command;

#[derive(Serialize, Deserialize, Debug)]
pub struct OcrResult {
    pub text: String,
    pub success: bool,
    pub error_message: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct OcrRequest {
    pub image_data: String, // base64 encoded image data
}

#[command]
pub async fn extract_text_with_system_ocr(request: OcrRequest) -> OcrResult {
    #[cfg(target_os = "macos")]
    {
        // 在macOS上使用系统OCR
        extract_text_macos(request).await
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        // 非macOS平台返回错误
        OcrResult {
            text: String::new(),
            success: false,
            error_message: Some("System OCR is only available on macOS".to_string()),
        }
    }
}

#[cfg(target_os = "macos")]
async fn extract_text_macos(request: OcrRequest) -> OcrResult {
    use std::io::Write;
    use std::fs::File;
    use std::env::temp_dir;
    use base64::{Engine as _, engine::general_purpose};
    
    // 解码base64图像数据
    let image_data = match general_purpose::STANDARD.decode(&request.image_data) {
        Ok(data) => data,
        Err(e) => {
            return OcrResult {
                text: String::new(),
                success: false,
                error_message: Some(format!("Failed to decode base64 image data: {}", e)),
            };
        }
    };
    
    // 创建临时文件
    let mut temp_file_path = temp_dir();
    temp_file_path.push(format!("ocr_temp_{}.png", uuid::Uuid::new_v4()));
    
    // 将图像数据写入临时文件
    let mut temp_file = match File::create(&temp_file_path) {
        Ok(file) => file,
        Err(e) => {
            return OcrResult {
                text: String::new(),
                success: false,
                error_message: Some(format!("Failed to create temporary file: {}", e)),
            };
        }
    };
    
    if let Err(e) = temp_file.write_all(&image_data) {
        return OcrResult {
            text: String::new(),
            success: false,
            error_message: Some(format!("Failed to write image data to temporary file: {}", e)),
        };
    }
    
    // 获取OCR可执行文件路径
    // 首先尝试从环境变量获取（由build.rs设置）
    let ocr_executable_path = if let Ok(path) = std::env::var("OCR_EXECUTABLE_PATH") {
        std::path::PathBuf::from(path)
    } else {
        // 如果环境变量不存在，尝试在当前可执行文件目录查找
        let exe_path = std::env::current_exe().unwrap_or_else(|_| std::path::PathBuf::from("./"));
        let exe_dir = exe_path.parent().unwrap_or_else(|| std::path::Path::new("."));
        exe_dir.join("ocr")
    };
    
    // 检查OCR可执行文件是否存在
    if !ocr_executable_path.exists() {
        let _ = std::fs::remove_file(&temp_file_path);
        return OcrResult {
            text: String::new(),
            success: false,
            error_message: Some(format!("OCR executable not found at: {:?}", ocr_executable_path)),
        };
    }
    
    // 执行OCR程序
    let output = Command::new(&ocr_executable_path)
        .arg(&temp_file_path)
        .output();
    
    // 清理临时文件
    let _ = std::fs::remove_file(&temp_file_path);
    
    match output {
        Ok(output) => {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                OcrResult {
                    text,
                    success: true,
                    error_message: None,
                }
            } else {
                let error = String::from_utf8_lossy(&output.stderr);
                OcrResult {
                    text: String::new(),
                    success: false,
                    error_message: Some(format!("OCR failed: {}", error)),
                }
            }
        }
        Err(e) => {
            OcrResult {
                text: String::new(),
                success: false,
                error_message: Some(format!("Failed to execute OCR: {}", e)),
            }
        }
    }
}
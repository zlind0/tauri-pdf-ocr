use serde::{Deserialize, Serialize};
use tauri::command;

#[cfg(target_os = "macos")]
use std::process::Command;

#[cfg(target_os = "windows")]
use base64::{Engine as _, engine::general_purpose};

#[cfg(target_os = "windows")]
use windows::{
    core::*,
    Graphics::Imaging::BitmapDecoder,
    Media::Ocr::OcrEngine,
    Storage::{FileAccessMode, StorageFile},
};

#[derive(Serialize, Deserialize, Debug)]
pub struct OcrResult {
    pub text: String,
    pub success: bool,
    pub error_message: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct OcrRequest {
    pub image_data: String, // base64 encoded image data
    pub languages: Option<Vec<String>>, // OCR 识别语言
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SupportedLanguagesResult {
    pub languages: Vec<String>,
    pub success: bool,
    pub error_message: Option<String>,
}

#[command]
pub async fn extract_text_with_system_ocr(request: OcrRequest) -> OcrResult {
    #[cfg(target_os = "macos")]
    {
        // 在macOS上使用系统OCR
        extract_text_macos(request).await
    }
    
    #[cfg(target_os = "windows")]
    {
        // 在Windows上使用系统OCR
        extract_text_windows(request).await
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        // 非macOS和非Windows平台返回错误
        OcrResult {
            text: String::new(),
            success: false,
            error_message: Some("System OCR is only available on macOS and Windows".to_string()),
        }
    }
}

#[command]
pub async fn get_supported_recognition_languages() -> SupportedLanguagesResult {
    #[cfg(target_os = "macos")]
    {
        // 在macOS上获取支持的语言
        get_supported_languages_macos().await
    }
    
    #[cfg(target_os = "windows")]
    {
        // 在Windows上获取支持的语言
        get_supported_languages_windows().await
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        // 非macOS和非Windows平台返回错误
        SupportedLanguagesResult {
            languages: vec![],
            success: false,
            error_message: Some("System OCR is only available on macOS and Windows".to_string()),
        }
    }
}

#[cfg(target_os = "windows")]
async fn extract_text_windows(request: OcrRequest) -> OcrResult {
    use std::io::Write;
    use std::fs::File;
    use std::env::temp_dir;
    use windows::{
        Graphics::Imaging::BitmapDecoder,
        Media::Ocr::OcrEngine,
        Storage::{FileAccessMode, StorageFile},
    };
    use futures::executor::block_on;
    
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
    
    // 执行OCR识别
    let result = block_on(async {
        // 获取文件路径
        let file_path = temp_file_path.to_str().unwrap_or("");
        if file_path.is_empty() {
            return Err("Failed to get temporary file path".to_string());
        }
        
        // 使用Windows OCR API
        let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(file_path))
            .map_err(|e| format!("Failed to get storage file: {:?}", e))?
            .join()
            .map_err(|e| format!("Failed to join storage file operation: {:?}", e))?;
            
        let stream = file.OpenAsync(FileAccessMode::Read)
            .map_err(|e| format!("Failed to open file stream: {:?}", e))?
            .join()
            .map_err(|e| format!("Failed to join file stream operation: {:?}", e))?;

        let decoder = BitmapDecoder::CreateAsync(&stream)
            .map_err(|e| format!("Failed to create bitmap decoder: {:?}", e))?
            .join()
            .map_err(|e| format!("Failed to join bitmap decoder operation: {:?}", e))?;
            
        let bitmap = decoder.GetSoftwareBitmapAsync()
            .map_err(|e| format!("Failed to get software bitmap: {:?}", e))?
            .join()
            .map_err(|e| format!("Failed to join software bitmap operation: {:?}", e))?;

        let engine = OcrEngine::TryCreateFromUserProfileLanguages()
            .map_err(|e| format!("Failed to create OCR engine: {:?}", e))?;
            
        let ocr_result = engine.RecognizeAsync(&bitmap)
            .map_err(|e| format!("Failed to recognize text: {:?}", e))?
            .join()
            .map_err(|e| format!("Failed to join OCR operation: {:?}", e))?;

        Ok(ocr_result.Text()
            .map_err(|e| format!("Failed to get OCR result text: {:?}", e))?
            .to_string())
    });
    
    // 清理临时文件
    let _ = std::fs::remove_file(&temp_file_path);
    
    match result {
        Ok(text) => OcrResult {
            text,
            success: true,
            error_message: None,
        },
        Err(e) => OcrResult {
            text: String::new(),
            success: false,
            error_message: Some(e),
        },
    }
}

#[cfg(target_os = "windows")]
async fn get_supported_languages_windows() -> SupportedLanguagesResult {
    use windows::{
        Media::Ocr::OcrEngine,
    };
    
    // Windows OCR使用系统默认语言，不需要显式指定语言
    // 返回一个默认语言列表
    SupportedLanguagesResult {
        languages: vec!["en-US".to_string(), "zh-CN".to_string()], // 示例语言
        success: true,
        error_message: None,
    }
}

#[cfg(target_os = "macos")]
async fn get_supported_languages_macos() -> SupportedLanguagesResult {
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
        return SupportedLanguagesResult {
            languages: vec![],
            success: false,
            error_message: Some(format!("OCR executable not found at: {:?}", ocr_executable_path)),
        };
    }
    
    // 执行OCR程序获取支持的语言
    let output = Command::new(&ocr_executable_path)
        .output();
    
    match output {
        Ok(output) => {
            if output.status.success() {
                let output_str = String::from_utf8_lossy(&output.stdout);
                let lines: Vec<&str> = output_str.lines().collect();
                
                // 查找语言列表的开始和结束标记
                let start_index = lines.iter().position(|&line| line == "SUPPORTED_LANGUAGES_START");
                let end_index = lines.iter().position(|&line| line == "SUPPORTED_LANGUAGES_END");
                
                if let (Some(start), Some(end)) = (start_index, end_index) {
                    // 提取语言列表
                    let languages: Vec<String> = lines[start+1..end]
                        .iter()
                        .map(|s| s.to_string())
                        .collect();
                    
                    SupportedLanguagesResult {
                        languages,
                        success: true,
                        error_message: None,
                    }
                } else {
                    SupportedLanguagesResult {
                        languages: vec![],
                        success: false,
                        error_message: Some("Failed to parse supported languages from OCR output".to_string()),
                    }
                }
            } else {
                let error = String::from_utf8_lossy(&output.stderr);
                SupportedLanguagesResult {
                    languages: vec![],
                    success: false,
                    error_message: Some(format!("Failed to get supported languages: {}", error)),
                }
            }
        }
        Err(e) => {
            SupportedLanguagesResult {
                languages: vec![],
                success: false,
                error_message: Some(format!("Failed to execute OCR to get supported languages: {}", e)),
            }
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
    
    // 构建命令参数
    let mut cmd = Command::new(&ocr_executable_path);
    cmd.arg(&temp_file_path);
    
    // 如果提供了语言选项，则添加语言参数
    if let Some(languages) = &request.languages {
        if !languages.is_empty() {
            let languages_str = languages.join(",");
            cmd.arg(languages_str);
        }
    }
    
    // 执行OCR程序
    let output = cmd.output();
    
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
use serde::{Deserialize, Serialize};
use tauri::{command, Emitter};

#[cfg(target_os = "macos")]
use std::process::Command;
#[cfg(target_os = "macos")]
use std::sync::Mutex;
#[cfg(target_os = "macos")]
use std::collections::HashMap as StdHashMap;

#[derive(Serialize, Deserialize, Debug)]
pub struct TtsResult {
    pub success: bool,
    pub process_id: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LanguageResult {
    pub languages: Vec<String>,
    pub success: bool,
    pub error_message: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct VoiceResult {
    pub voices: Vec<VoiceInfo>,
    pub success: bool,
    pub error_message: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VoiceInfo {
    pub name: String,
    pub identifier: String,
}

// 在macOS上存储正在运行的TTS进程
#[cfg(target_os = "macos")]
lazy_static::lazy_static! {
    static ref TTS_PROCESSES: Mutex<StdHashMap<String, std::process::Child>> = Mutex::new(StdHashMap::new());
}

#[command]
pub async fn speak_text(app_handle: tauri::AppHandle, text: String, voice: Option<String>) -> TtsResult {
    #[cfg(target_os = "macos")]
    {
        speak_text_macos(app_handle, text, voice).await
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        TtsResult {
            success: false,
            process_id: None,
            error_message: Some("TTS is only available on macOS".to_string()),
        }
    }
}

#[command]
pub async fn stop_speaking(process_id: String) -> TtsResult {
    #[cfg(target_os = "macos")]
    {
        stop_speaking_macos(process_id).await
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        TtsResult {
            success: false,
            process_id: None,
            error_message: Some("TTS is only available on macOS".to_string()),
        }
    }
}

#[command]
pub async fn get_supported_tts_languages() -> LanguageResult {
    #[cfg(target_os = "macos")]
    {
        get_supported_languages_macos().await
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        LanguageResult {
            languages: vec![],
            success: false,
            error_message: Some("TTS is only available on macOS".to_string()),
        }
    }
}

#[command]
pub async fn get_voices_for_language(language: String) -> VoiceResult {
    #[cfg(target_os = "macos")]
    {
        get_voices_for_language_macos(language).await
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        VoiceResult {
            voices: vec![],
            success: false,
            error_message: Some("TTS is only available on macOS".to_string()),
        }
    }
}

#[cfg(target_os = "macos")]
async fn speak_text_macos(app_handle: tauri::AppHandle, text: String, voice: Option<String>) -> TtsResult {
    use std::process::{Command, Stdio};
    use uuid::Uuid;
    
    // 生成唯一的进程ID
    let process_id = Uuid::new_v4().to_string();
    
    // 构建say命令
    let mut cmd = Command::new("say");
    
    // 如果指定了音色，则添加-v参数
    if let Some(voice_name) = voice {
        cmd.arg("-v").arg(voice_name);
    }
    
    // 添加要朗读的文本
    cmd.arg(&text);
    
    // 重定向输出以避免阻塞
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());
    
    match cmd.spawn() {
        Ok(mut child) => {
            // 克隆app_handle用于在线程中发送事件
            let app_handle_clone = app_handle.clone();
            let process_id_clone = process_id.clone();
            
            // 在单独的线程中等待进程完成
            std::thread::spawn(move || {
                // 等待进程完成
                let _ = child.wait();
                
                // 发送朗读完成事件到前端
                let _ = app_handle_clone.emit("tts-finished", process_id_clone);
            });
            
            TtsResult {
                success: true,
                process_id: Some(process_id),
                error_message: None,
            }
        }
        Err(e) => {
            TtsResult {
                success: false,
                process_id: None,
                error_message: Some(format!("Failed to start TTS: {}", e)),
            }
        }
    }
}

#[cfg(target_os = "macos")]
async fn stop_speaking_macos(process_id: String) -> TtsResult {
    let mut processes = TTS_PROCESSES.lock().unwrap();
    
    if let Some(mut child) = processes.remove(&process_id) {
        // 终止进程
        let _ = child.kill();
        let _ = child.wait();
        
        TtsResult {
            success: true,
            process_id: None,
            error_message: None,
        }
    } else {
        // 如果找不到进程，尝试使用macOS的afplay命令停止所有音频
        let output = Command::new("killall")
            .arg("say")
            .output();
            
        match output {
            Ok(_) => TtsResult {
                success: true,
                process_id: None,
                error_message: None,
            },
            Err(e) => TtsResult {
                success: false,
                process_id: None,
                error_message: Some(format!("Failed to stop TTS: {}", e)),
            },
        }
    }
}

#[cfg(target_os = "macos")]
async fn get_supported_languages_macos() -> LanguageResult {
    // 使用say -v '?'命令获取支持的语言和音色
    let output = Command::new("say")
        .arg("-v")
        .arg("?")
        .output();
        
    match output {
        Ok(output) => {
            if output.status.success() {
                let output_str = String::from_utf8_lossy(&output.stdout);
                let mut languages = Vec::new();
                let mut language_set = std::collections::HashSet::new();
                
                // 解析say -v '?'的输出来提取语言
                for line in output_str.lines() {
                    // 正确解析格式: 语音名称    语言代码    # 语音示例
                    // 从右向左查找语言代码，使用#作为参考点
                    if let Some(hash_pos) = line.rfind("#") {
                        // 获取#之前的部分
                        let before_hash = &line[..hash_pos].trim();
                        // 获取语言代码（#之前部分的最后一个字段）
                        if let Some(last_space_pos) = before_hash.rfind(|c: char| c.is_whitespace()) {
                            let lang_code = before_hash[last_space_pos..].trim();
                            // 转换语言代码格式 (en_US -> en-US)
                            let normalized_lang = lang_code.replace("_", "-");
                            language_set.insert(normalized_lang);
                        }
                    }
                }
                
                languages.extend(language_set);
                languages.sort();
                
                LanguageResult {
                    languages,
                    success: true,
                    error_message: None,
                }
            } else {
                let error = String::from_utf8_lossy(&output.stderr);
                LanguageResult {
                    languages: vec![],
                    success: false,
                    error_message: Some(format!("Failed to get supported languages: {}", error)),
                }
            }
        }
        Err(e) => {
            LanguageResult {
                languages: vec![],
                success: false,
                error_message: Some(format!("Failed to execute say command: {}", e)),
            }
        }
    }
}

#[cfg(target_os = "macos")]
async fn get_voices_for_language_macos(language: String) -> VoiceResult {
    // 使用say -v '?'命令获取指定语言的音色
    let output = Command::new("say")
        .arg("-v")
        .arg("?")
        .output();
        
    match output {
        Ok(output) => {
            if output.status.success() {
                let output_str = String::from_utf8_lossy(&output.stdout);
                let mut voices = Vec::new();
                
                // 解析say -v '?'的输出来提取指定语言的音色
                for line in output_str.lines() {
                    // 正确解析格式: 语音名称    语言代码    # 语音示例
                    if let Some(hash_pos) = line.rfind("#") {
                        // 获取#之前的部分
                        let before_hash = &line[..hash_pos].trim();
                        // 获取语言代码（#之前部分的最后一个字段）
                        if let Some(last_space_pos) = before_hash.rfind(|c: char| c.is_whitespace()) {
                            let lang_part = &before_hash[last_space_pos..].trim();
                            // 转换语言代码格式 (en_US -> en-US)
                            let normalized_lang = lang_part.replace("_", "-");
                            
                            // 如果语言匹配，则添加到结果中
                            if normalized_lang == language || normalized_lang.starts_with(&format!("{}-", language.split('-').next().unwrap_or(&language))) {
                                // 获取语音名称（#之前部分中语言代码之前的所有内容）
                                let voice_name = before_hash[..last_space_pos].trim().to_string();
                                if !voice_name.is_empty() {
                                    // 生成标识符（简化版本）
                                    let identifier = format!("{}", 
                                        voice_name);
                                    voices.push(VoiceInfo {
                                        name: voice_name,
                                        identifier,
                                    });
                                }
                            }
                        }
                    }
                }
                
                VoiceResult {
                    voices,
                    success: true,
                    error_message: None,
                }
            } else {
                let error = String::from_utf8_lossy(&output.stderr);
                VoiceResult {
                    voices: vec![],
                    success: false,
                    error_message: Some(format!("Failed to get voices for language: {}", error)),
                }
            }
        }
        Err(e) => {
            VoiceResult {
                voices: vec![],
                success: false,
                error_message: Some(format!("Failed to execute say command: {}", e)),
            }
        }
    }
}
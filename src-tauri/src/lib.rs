mod ocr;
mod tts;
use ocr::{extract_text_with_system_ocr, get_supported_recognition_languages};
use tts::{speak_text, stop_speaking, get_supported_tts_languages, get_voices_for_language};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            extract_text_with_system_ocr,
            get_supported_recognition_languages,
            speak_text,
            stop_speaking,
            get_supported_tts_languages,
            get_voices_for_language
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

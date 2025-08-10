use std::process::Command;
use std::env;
use std::path::Path;

fn main() {
    tauri_build::build();
    // 只在 macOS 上编译 Swift OCR 程序
    if env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() == "macos" {
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
        let target_dir = env::var("CARGO_TARGET_DIR").unwrap_or_else(|_| "target".to_string());
        
        // Swift 源文件路径
        let swift_src = Path::new(&manifest_dir).join("src/ocr.swift");
        // 输出可执行文件路径 (在 target 目录中)
        let ocr_executable = Path::new(&target_dir).join("ocr");
        
        // 确保 src 目录存在
        if swift_src.exists() {
            println!("cargo:warning=Compiling Swift OCR program...");
            
            // 编译 Swift 程序
            let output = Command::new("swiftc")
                .arg("-o")
                .arg(&ocr_executable)
                .arg(&swift_src)
                .output();
                
            match output {
                Ok(output) => {
                    if output.status.success() {
                        println!("cargo:warning=Swift OCR program compiled successfully");
                        // 将可执行文件复制到最终的 bundle 目录
                        println!("cargo:rustc-env=OCR_EXECUTABLE_PATH={}", ocr_executable.display());
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        println!("cargo:warning=Failed to compile Swift OCR program: {}", stderr);
                    }
                }
                Err(e) => {
                    println!("cargo:warning=Failed to execute swiftc: {}", e);
                }
            }
        } else {
            println!("cargo:warning=Swift source file not found: {}", swift_src.display());
        }
        
        println!("cargo:rerun-if-changed=src/ocr.swift");
    }
}
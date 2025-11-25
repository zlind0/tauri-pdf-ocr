use std::env;
use std::path::PathBuf;

fn main() {
    // Only run this build script on macOS
    if env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() == "macos" {
        let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

        // Define paths for the object and library files
        let obj_path = out_dir.join("ocr.o");
        let lib_path = out_dir.join("libocr.a");

        // Compile the Swift code into an object file
        // Note: Add '-swift-version 5' or your specific version if needed.
        let status = std::process::Command::new("swiftc")
            .args(&[
                "-c",
                "src/ocr.swift", // Relative to src-tauri/
                "-o",
                obj_path.to_str().unwrap(),
            ])
            .status()
            .expect("Failed to compile Swift code");

        if !status.success() {
            panic!("Swift compilation failed. Check for errors above.");
        }

        // Create a static library from the compiled object file
        let status = std::process::Command::new("ar")
            .args(&[
                "rcs",
                lib_path.to_str().unwrap(),
                obj_path.to_str().unwrap(),
            ])
            .status()
            .expect("Failed to create static library 'libocr.a'");

        if !status.success() {
            panic!("Failed to create static library. Check for errors above.");
        }

        // Instruct Cargo to link our new static library
        println!("cargo:rustc-link-search=native={}", out_dir.display());
        println!("cargo:rustc-link-lib=static=ocr");

        // Instruct Cargo to link the necessary macOS frameworks
        println!("cargo:rustc-link-lib=framework=Vision");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=AVFoundation");


        // Tell Cargo to rerun this script if the Swift file changes
        println!("cargo:rerun-if-changed=src/ocr.swift");
    }

    // Let Tauri do its thing
    tauri_build::build();
}
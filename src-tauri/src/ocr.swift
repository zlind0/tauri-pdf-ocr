import Foundation
import Vision
import AppKit

// Helper to create a C-style string (char*) from a Swift String.
// The caller is responsible for deallocating the returned pointer.
func stringToCharP(_ str: String) -> UnsafeMutablePointer<CChar> {
    let count = str.utf8.count + 1
    let result = UnsafeMutablePointer<CChar>.allocate(capacity: count)
    str.withCString { (baseAddress) in
        strncpy(result, baseAddress, count)
    }
    return result
}

// Exposes the perform_ocr function to C.
// Takes a C-string path to an image and a C-string of comma-separated languages.
// Returns a C-string with the recognized text, or an error message.
@_cdecl("perform_ocr")
public func perform_ocr(imagePath: UnsafePointer<CChar>, languages: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
    let path = String(cString: imagePath)
    let langStr = String(cString: languages)
    
    let url = URL(fileURLWithPath: path)

    guard let image = NSImage(contentsOf: url),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        return stringToCharP("Error: Could not load image from \(path)")
    }
    
    var recognizedText = ""
    let request = VNRecognizeTextRequest { (request, error) in
        if let error = error {
            recognizedText = "OCR Error: \(error.localizedDescription)"
            return
        }
        
        guard let observations = request.results as? [VNRecognizedTextObservation] else {
            recognizedText = "Error: No text observations found"
            return
        }
        
        recognizedText = observations.compactMap {
            $0.topCandidates(1).first?.string
        }.joined(separator: "\n")
    }
    
    request.recognitionLevel = .accurate
    
    let langArray = langStr.split(separator: ",").map(String.init)
    if !langArray.isEmpty {
        do {
            let supportedLanguages = try request.supportedRecognitionLanguages()
            let validLanguages = langArray.filter { supportedLanguages.contains($0) }
            if !validLanguages.isEmpty {
                request.recognitionLanguages = validLanguages
            }
        } catch {
            // If language validation fails, proceed with the default languages.
        }
    }

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    let semaphore = DispatchSemaphore(value: 0)
    
    // Perform the request on a background thread.
    DispatchQueue.global(qos: .userInitiated).async {
        do {
            try handler.perform([request])
        } catch {
            recognizedText = "Failed to perform OCR: \(error.localizedDescription)"
        }
        semaphore.signal()
    }
    
    // Wait for the OCR to complete, with a timeout.
    _ = semaphore.wait(timeout: .now() + 30)

    if recognizedText.isEmpty {
        return stringToCharP("No text found or OCR timed out.")
    }
    
    return stringToCharP(recognizedText)
}

// Exposes the get_supported_languages function to C.
// Returns a C-string containing a comma-separated list of supported languages.
@_cdecl("get_supported_languages")
public func get_supported_languages() -> UnsafeMutablePointer<CChar>? {
    do {
        let request = VNRecognizeTextRequest()
        let supported = try request.supportedRecognitionLanguages()
        let resultString = supported.joined(separator: ",")
        return stringToCharP(resultString)
    } catch {
        return stringToCharP("Error: \(error.localizedDescription)")
    }
}

// Exposes a function to C for deallocating strings created in Swift.
@_cdecl("free_string")
public func free_string(ptr: UnsafeMutablePointer<CChar>?) {
    ptr?.deallocate()
}
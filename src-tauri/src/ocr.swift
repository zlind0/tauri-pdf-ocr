import Cocoa
import Vision

// 获取系统支持的OCR语言
func getSupportedRecognitionLanguages() -> [String] {
    // 正确的写法是调用方法并处理异常
    do {
        let request = VNRecognizeTextRequest()
        return try request.supportedRecognitionLanguages()
    } catch {
        print("Error getting supported languages: \(error)")
        return []
    }
}

// 从命令行参数获取文件路径和语言选项
// 注意：CommandLine.arguments.count 至少为1（程序名本身）
if CommandLine.arguments.count <= 1 {
    // 如果没有参数，返回支持的语言列表
    let languages = getSupportedRecognitionLanguages()
    print("SUPPORTED_LANGUAGES_START")
    for language in languages {
        print(language)
    }
    print("SUPPORTED_LANGUAGES_END")
    exit(0)
}

// 必须至少有文件路径参数
guard CommandLine.arguments.count > 1 else {
    print("Usage: ocr <image_path> [language1,language2,...]")
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: imagePath)

// 获取语言参数（如果有）
var languages: [String] = []
if CommandLine.arguments.count > 2 {
    let languagesString = CommandLine.arguments[2]
    languages = languagesString.split(separator: ",").map { String($0) }
}

// 加载图像
guard let image = NSImage(contentsOf: url) else {
    print("Error: Could not load image from \(imagePath)")
    exit(1)
}

// 将 NSImage 转换为 CGImage
guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("Error: Could not convert image to CGImage")
    exit(1)
}

// 创建 Vision 请求
let request = VNRecognizeTextRequest { (request, error) in
    if let error = error {
        print("OCR Error: \(error)")
        exit(1)
    }
    
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        print("Error: No text observations found")
        exit(1)
    }
    
    // 提取识别的文本
    var recognizedText = ""
    for observation in observations {
        guard let topCandidate = observation.topCandidates(1).first else { continue }
        recognizedText += topCandidate.string + "\n"
    }
    
    // 输出结果
    print(recognizedText)
}

// 设置识别级别
request.recognitionLevel = .accurate

// 设置识别语言（如果提供了有效语言）
if !languages.isEmpty {
    // 在设置语言之前，最好验证一下这些语言是否被支持
    do {
        let supportedLanguages = try request.supportedRecognitionLanguages()
        let validLanguages = languages.filter { supportedLanguages.contains($0) }
        if !validLanguages.isEmpty {
            request.recognitionLanguages = validLanguages
        } else {
            print("Warning: None of the provided languages are supported. Using default.")
            request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
        }
    } catch {
        print("Could not verify languages, using default. Error: \(error)")
        request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
    }
} else {
    // 默认支持中英文
    request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
}


// 执行请求
let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    print("Failed to perform OCR: \(error)")
    exit(1)
}
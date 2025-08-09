import Cocoa
import Vision

// 从命令行参数获取文件路径
guard CommandLine.arguments.count > 1 else {
    print("Usage: ocr <image_path>")
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: imagePath)

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
request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"] // 支持中英文

// 执行请求
let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    print("Failed to perform OCR: \(error)")
    exit(1)
}
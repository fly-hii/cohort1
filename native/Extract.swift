import Foundation
import Vision
import PDFKit
import AppKit
import ImageIO

struct Extraction: Codable { let text: String; let pages: Int; let ocrPages: Int; let engine: String }
func fail(_ message: String) -> Never { fputs(message + "\n", stderr); exit(1) }
func recognize(_ image: CGImage) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-US"]
    request.automaticallyDetectsLanguage = true
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    let observations = (request.results ?? []).sorted { a, b in
        if abs(a.boundingBox.midY - b.boundingBox.midY) < 0.012 { return a.boundingBox.minX < b.boundingBox.minX }
        return a.boundingBox.midY > b.boundingBox.midY
    }
    return observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}
guard CommandLine.arguments.count == 2 else { fail("Choose one document.") }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
var texts: [String] = []
var ocrPages = 0
var pageCount = 1
do {
    if url.pathExtension.lowercased() == "pdf" {
        guard let document = PDFDocument(url: url), !document.isLocked else { fail("This PDF is damaged or password-protected. Export an unlocked copy and try again.") }
        pageCount = document.pageCount
        guard pageCount > 0 && pageCount <= 10 else { fail("Please upload a PDF containing 1–10 pages for one invoice.") }
        for index in 0..<pageCount {
            guard let page = document.page(at: index) else { fail("A PDF page could not be read.") }
            let embedded = (page.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if embedded.count >= 80 {
                texts.append(embedded)
            } else {
                let bounds = page.bounds(for: .mediaBox)
                guard bounds.width > 0 && bounds.height > 0 else { fail("Invalid PDF page dimensions.") }
                let scale = min(3.0, 2600.0 / max(bounds.width, bounds.height))
                let thumbnail = page.thumbnail(of: NSSize(width: bounds.width * scale, height: bounds.height * scale), for: .mediaBox)
                var rect = CGRect(origin: .zero, size: thumbnail.size)
                guard let image = thumbnail.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { fail("Could not render this PDF page.") }
                let recognized = try recognize(image)
                texts.append(recognized.isEmpty ? embedded : recognized)
                ocrPages += 1
            }
        }
    } else {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil), CGImageSourceGetCount(source) == 1 else { fail("Choose a single-page PNG, JPEG, or HEIC image.") }
        let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 3200]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { fail("This image could not be opened. Try a PNG or JPEG copy.") }
        texts.append(try recognize(image)); ocrPages = 1
    }
    let text = texts.joined(separator: "\n\n--- Page break ---\n\n")
    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { fail("No readable text found. Use a sharper, upright scan with good lighting.") }
    let result = Extraction(text: String(text.prefix(80000)), pages: pageCount, ocrPages: ocrPages, engine: "Apple Vision + PDFKit (on-device)")
    let data = try JSONEncoder().encode(result)
    print(String(data: data, encoding: .utf8)!)
} catch { fail("Text recognition failed: \(error.localizedDescription)") }

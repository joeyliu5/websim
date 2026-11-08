import AppKit
import AVFoundation
import Foundation

guard CommandLine.arguments.count == 3 else {
    fputs("Usage: swift extract_video_poster.swift input.mp4 output.jpg\n", stderr)
    exit(2)
}
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let asset = AVURLAsset(url: input)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

var bestImage: CGImage? = nil
var bestScore = -1.0
for second in [0.5, 1.0, 2.0, 3.0] {
    do {
        let frame = try generator.copyCGImage(at: CMTime(seconds: second, preferredTimescale: 600), actualTime: nil)
        let bitmap = NSBitmapImageRep(cgImage: frame)
        var score = 0.0
        var count = 0.0
        for y in stride(from: 0, to: bitmap.pixelsHigh, by: max(1, bitmap.pixelsHigh / 12)) {
            for x in stride(from: 0, to: bitmap.pixelsWide, by: max(1, bitmap.pixelsWide / 12)) {
                if let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) {
                    score += color.redComponent + color.greenComponent + color.blueComponent
                    count += 3
                }
            }
        }
        score /= max(count, 1)
        if score > bestScore { bestScore = score; bestImage = frame }
    } catch { continue }
}
guard let image = bestImage,
      let jpeg = NSBitmapImageRep(cgImage: image).representation(using: .jpeg, properties: [.compressionFactor: 0.85]) else {
    fputs("Could not extract a video frame\n", stderr)
    exit(1)
}
try jpeg.write(to: output)
print("Saved \(output.path), brightness \(bestScore)")

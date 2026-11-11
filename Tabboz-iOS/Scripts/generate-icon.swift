import AppKit

// Reuse the game's original icon; nearest-neighbor scaling preserves its pixels.
let base = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let source = base.appendingPathComponent("Tabboz/Web/resources/icons/ZARROSIM.gif")
let destination = base.appendingPathComponent("Tabboz/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png")
let image = NSImage(contentsOf: source)!
var sourceRect = CGRect(origin: .zero, size: image.size)
let original = image.cgImage(forProposedRect: &sourceRect, context: nil, hints: nil)!
let colorSpace = CGColorSpaceCreateDeviceRGB()
let context = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8,
                        bytesPerRow: 4096, space: colorSpace,
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.setFillColor(CGColor(red: 0, green: 0.5, blue: 0.5, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
context.interpolationQuality = .none
context.draw(original, in: CGRect(x: 128, y: 128, width: 768, height: 768))
let bitmap = NSBitmapImageRep(cgImage: context.makeImage()!)
try bitmap.representation(using: .png, properties: [:])!.write(to: destination)
print("Generated AppIcon.png from the original Tabboz icon.")

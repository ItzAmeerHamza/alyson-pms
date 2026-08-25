import AppKit

let size = NSSize(width: 900, height: 260)
let image = NSImage(size: size)
image.lockFocus()
NSColor.white.setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()
let title = "Alyson Pulse OCR Test"
let body = "Cursor IDE TypeScript refactor"
let titleAttrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.boldSystemFont(ofSize: 42),
  .foregroundColor: NSColor.black,
]
let bodyAttrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 32),
  .foregroundColor: NSColor.black,
]
title.draw(at: NSPoint(x: 32, y: 150), withAttributes: titleAttrs)
body.draw(at: NSPoint(x: 32, y: 70), withAttributes: bodyAttrs)
image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
  fputs("failed to encode png\n", stderr)
  exit(1)
}

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "ocr-fixture.png"
try png.write(to: URL(fileURLWithPath: out))
print(out)

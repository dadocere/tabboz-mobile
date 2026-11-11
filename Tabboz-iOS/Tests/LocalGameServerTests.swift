import XCTest
@testable import Tabboz

final class LocalGameServerTests: XCTestCase {
    private let root = URL(fileURLWithPath: "/tmp/tabboz-test-web", isDirectory: true)

    func testRootResolvesToIndex() {
        XCTAssertEqual(LocalGameServer.resourceURL(for: "/", root: root)?.lastPathComponent, "index.html")
    }

    func testNestedResourceResolvesInsideBundle() {
        XCTAssertEqual(LocalGameServer.resourceURL(for: "/resources/dialogs/includes/1.inc.html", root: root)?.path,
                       root.standardizedFileURL.resolvingSymlinksInPath().appendingPathComponent("resources/dialogs/includes/1.inc.html").path)
    }

    func testTraversalCannotReadOutsideBundle() {
        for path in ["/../secret", "/%2e%2e/secret", "/resources/../../secret", "/%00secret", "/..%5csecret"] {
            XCTAssertNil(LocalGameServer.resourceURL(for: path, root: root), path)
        }
    }

    func testWebAssemblyAndFontContentTypes() {
        XCTAssertEqual(LocalGameServer.mimeType(for: URL(fileURLWithPath: "zarrosim.wasm")), "application/wasm")
        XCTAssertEqual(LocalGameServer.mimeType(for: URL(fileURLWithPath: "font.woff2")), "font/woff2")
    }

    func testOriginalEngineAndResourcesAreBundled() throws {
        let bundle = Bundle(for: GameViewController.self)
        let web = try XCTUnwrap(bundle.url(forResource: "Web", withExtension: nil))
        let wasm = try Data(contentsOf: web.appendingPathComponent("zarrosim.wasm"))
        XCTAssertEqual(Array(wasm.prefix(4)), [0, 97, 115, 109])
        for file in ["index.html", "mobile.js", "resources/dialogs/includes/1.inc.html", "resources/strings/strings.json"] {
            XCTAssertTrue(FileManager.default.fileExists(atPath: web.appendingPathComponent(file).path), file)
        }
    }
}

import Foundation
import Network

/// Serves only bundled files, only on loopback. A fixed origin preserves WebKit saves.
final class LocalGameServer {
    static let port: UInt16 = 18798
    static let origin = URL(string: "http://127.0.0.1:\(port)")!
    private let root: URL
    private let queue = DispatchQueue(label: "it.tabboz.offline-server")
    private var listener: NWListener?
    private var connections: [UUID: NWConnection] = [:]

    init(root: URL) { self.root = root.standardizedFileURL.resolvingSymlinksInPath() }

    func start(completion: @escaping (Result<URL, Error>) -> Void) {
        queue.async { [self] in
            guard listener == nil else { return }
            do {
                let parameters = NWParameters.tcp
                parameters.requiredLocalEndpoint = .hostPort(
                    host: "127.0.0.1", port: NWEndpoint.Port(rawValue: Self.port)!
                )
                let server = try NWListener(using: parameters)
                listener = server
                var reported = false
                server.stateUpdateHandler = { state in
                    switch state {
                    case .ready where !reported:
                        reported = true
                        DispatchQueue.main.async { completion(.success(Self.origin)) }
                    case .failed(let error) where !reported:
                        reported = true
                        DispatchQueue.main.async { completion(.failure(error)) }
                    default: break
                    }
                }
                server.newConnectionHandler = { [weak self] connection in
                    guard let self else { connection.cancel(); return }
                    let id = UUID()
                    self.connections[id] = connection
                    connection.stateUpdateHandler = { [weak self] state in
                        switch state {
                        case .cancelled, .failed: self?.connections.removeValue(forKey: id)
                        default: break
                        }
                    }
                    connection.start(queue: self.queue)
                    self.receive(connection, data: Data())
                }
                server.start(queue: queue)
            } catch {
                DispatchQueue.main.async { completion(.failure(error)) }
            }
        }
    }

    private func receive(_ connection: NWConnection, data: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] chunk, _, complete, error in
            guard let self else { connection.cancel(); return }
            var buffer = data
            if let chunk { buffer.append(chunk) }
            if buffer.range(of: Data("\r\n\r\n".utf8)) != nil {
                self.respond(connection, request: buffer)
            } else if error != nil || complete || buffer.count > 32_768 {
                connection.cancel()
            } else {
                self.receive(connection, data: buffer)
            }
        }
    }

    static func resourceURL(for path: String, root: URL) -> URL? {
        guard let decoded = path.removingPercentEncoding,
              !decoded.contains("\0"), !decoded.contains("\\") else { return nil }
        let base = root.standardizedFileURL.resolvingSymlinksInPath()
        let relative = decoded == "/" ? "index.html" : String(decoded.drop(while: { $0 == "/" }))
        let file = base.appendingPathComponent(relative).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(base.path + "/") else { return nil }
        return file
    }

    static func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js": return "application/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "wasm": return "application/wasm"
        case "png": return "image/png"
        case "gif": return "image/gif"
        case "bmp": return "image/bmp"
        case "ico": return "image/x-icon"
        case "wav": return "audio/wav"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        default: return "application/octet-stream"
        }
    }

    private func respond(_ connection: NWConnection, request: Data) {
        let parts = String(decoding: request, as: UTF8.self).components(separatedBy: "\r\n")[0].split(separator: " ")
        guard parts.count == 3, parts[0] == "GET" || parts[0] == "HEAD" else {
            send(connection, status: "405 Method Not Allowed", body: Data(), mime: "text/plain")
            return
        }
        let path = parts[1].split(separator: "?", maxSplits: 1).first.map(String.init) ?? ""
        guard path.hasPrefix("/"), let file = Self.resourceURL(for: path, root: root),
              let body = try? Data(contentsOf: file) else {
            send(connection, status: "404 Not Found", body: Data(), mime: "text/plain")
            return
        }
        send(connection, status: "200 OK", body: body, mime: Self.mimeType(for: file), head: parts[0] == "HEAD")
    }

    private func send(_ connection: NWConnection, status: String, body: Data, mime: String, head: Bool = false) {
        let headers = "HTTP/1.1 \(status)\r\nContent-Type: \(mime)\r\nContent-Length: \(body.count)\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n"
        var response = Data(headers.utf8)
        if !head { response.append(body) }
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
}

import SwiftUI
import WebKit
import UniformTypeIdentifiers

struct GameView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> GameViewController { GameViewController() }
    func updateUIViewController(_ controller: GameViewController, context: Context) {}
}

final class GameViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler, UIDocumentPickerDelegate {
    private var webView: WKWebView!
    private var server: LocalGameServer?
    private var errorLabel: UILabel?
    private lazy var ads = AdCoordinator(owner: self)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0, green: 0.5, blue: 0.5, alpha: 1)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(WeakGameMessageHandler(self), name: "tabboz")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = view.backgroundColor
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor)
        ])
        NotificationCenter.default.addObserver(self, selector: #selector(save), name: UIApplication.willResignActiveNotification, object: nil)
        guard let root = Bundle.main.url(forResource: "Web", withExtension: nil) else {
            showError("Impossibile trovare i file del gioco.")
            return
        }
        server = LocalGameServer(root: root)
        server?.start { [weak self] result in
            switch result {
            case .success(let url): self?.webView.load(URLRequest(url: url))
            case .failure(let error): self?.showError("Impossibile avviare il gioco.\n\(error.localizedDescription)")
            }
        }
    }

    #if DEBUG
    private var adSDKTestLabel: UILabel?
    func updateAdSDKTestStatus(_ status: String) {
        guard ProcessInfo.processInfo.arguments.contains("--ad-sdk-smoke") else { return }
        if adSDKTestLabel == nil {
            let label = UILabel(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
            label.font = .systemFont(ofSize: 1)
            label.accessibilityIdentifier = "adSDKTestStatus"
            view.addSubview(label)
            adSDKTestLabel = label
        }
        adSDKTestLabel?.text = status
    }
    #endif

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        ads.start()
    }

    func prepareForAd(token: String?, completion: @escaping (Bool) -> Void) {
        guard presentedViewController == nil else { completion(false); return }
        webView.isUserInteractionEnabled = false
        var completed = false
        let finish: (Bool) -> Void = { ready in
            guard !completed else { return }
            completed = true
            completion(ready)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { finish(false) }
        webView.callAsyncJavaScript("return await window.TabbozMobile.beginAd(token)", arguments: ["token": token as Any? ?? NSNull()], in: nil, in: .page) { result in
            switch result {
            case .success(let ready): finish(ready as? Bool == true)
            case .failure: finish(false)
            }
        }
    }

    func resumeAfterAd() {
        webView.isUserInteractionEnabled = true
        webView.evaluateJavaScript("window.TabbozMobile?.endAd()", completionHandler: nil)
    }

    func showAdMessage(_ message: String) {
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(title: "Tabboz", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    @objc private func save() {
        webView.evaluateJavaScript("window.TabbozMobile?.save()", completionHandler: nil)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.host == "127.0.0.1",
              let body = message.body as? [String: String] else { return }
        switch body["type"] {
        case "adHeartbeat":
            ads.heartbeat(active: body["active"] == "true")
        case "adCompleted":
            if let token = body["token"] { ads.activityCompleted(token: token) }
        case "adOpportunity":
            if let token = body["token"] { ads.activityOpportunity(token: token) }
        case "adReward":
            ads.showRewardOffer()
        case "adPrivacy":
            ads.privacyOptions()
        case "error":
            TelemetrySettings.shared.recordRuntimeDiagnostic(.engineError)
            showError(body["message"] ?? "Errore durante l'avvio del gioco.")
        case "privacy":
            guard presentedViewController == nil else { return }
            present(UIHostingController(rootView: PrivacySettingsView()), animated: true)
        case "export":
            guard let payload = body["payload"], let data = payload.data(using: .utf8) else { return }
            do {
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("Tabboz.tabboz.json")
                try data.write(to: url, options: .atomic)
                let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
                present(picker, animated: true)
            } catch { showFileError(error.localizedDescription) }
        case "import":
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json], asCopy: true)
            picker.delegate = self
            present(picker, animated: true)
        default: break
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size <= 1_048_576 else { showFileError("Il file di salvataggio è troppo grande."); return }
            let payload = try String(contentsOf: url, encoding: .utf8)
            webView.callAsyncJavaScript("return window.TabbozMobile.restoreSave(payload)", arguments: ["payload": payload], in: nil, in: .page) { [weak self] result in
                switch result {
                case .success: self?.webView.reload()
                case .failure: self?.showFileError("Questo file non è un salvataggio Tabboz per mobile valido.")
                }
            }
        } catch { showFileError(error.localizedDescription) }
    }

    private func showFileError(_ message: String) {
        let alert = UIAlertController(title: "Tabboz Simulator", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        let isGame = url?.scheme == "http" && url?.host == "127.0.0.1" && url?.port == Int(LocalGameServer.port)
        decisionHandler(isGame ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        TelemetrySettings.shared.recordRuntimeDiagnostic(.navigationFailure)
        showError(error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        TelemetrySettings.shared.recordRuntimeDiagnostic(.webContentTermination)
        webView.reload()
    }

    private func showError(_ message: String) {
        errorLabel?.removeFromSuperview()
        let label = UILabel()
        label.text = "Tabboz Simulator\n\n\(message)\n\nChiudi e riapri l'app per riprovare."
        label.numberOfLines = 0
        label.textAlignment = .center
        label.textColor = .white
        label.font = .monospacedSystemFont(ofSize: 16, weight: .regular)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24)
        ])
        errorLabel = label
    }
}

private final class WeakGameMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?
    init(_ delegate: WKScriptMessageHandler) { self.delegate = delegate }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

import SwiftUI
import FirebaseCore
import FirebaseAnalytics
import FirebaseCrashlytics

final class FirebaseAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        FirebaseApp.configure()
        TelemetrySettings.shared.applyPreferences()
        return true
    }
}

final class TelemetrySettings: ObservableObject {
    static let shared = TelemetrySettings()
    static let privacyURL = URL(string: "https://tabboz-mobile-2026.web.app/privacy")!

    @Published var analyticsEnabled: Bool {
        didSet {
            UserDefaults.standard.set(analyticsEnabled, forKey: "telemetry.analyticsEnabled")
            applyAnalyticsPreference()
        }
    }
    @Published var crashReportsEnabled: Bool {
        didSet {
            UserDefaults.standard.set(crashReportsEnabled, forKey: "telemetry.crashReportsEnabled")
            applyCrashPreference()
        }
    }

    private init() {
        let defaults = UserDefaults.standard
        defaults.register(defaults: ["telemetry.analyticsEnabled": true, "telemetry.crashReportsEnabled": true])
        analyticsEnabled = defaults.bool(forKey: "telemetry.analyticsEnabled")
        crashReportsEnabled = defaults.bool(forKey: "telemetry.crashReportsEnabled")
    }

    func applyPreferences() {
        applyAnalyticsPreference()
        applyCrashPreference()
    }

    enum RuntimeDiagnostic: Int {
        case engineError = 1001
        case webContentTermination = 1002
        case navigationFailure = 1003
    }

    func recordRuntimeDiagnostic(_ diagnostic: RuntimeDiagnostic) {
        guard crashReportsEnabled else { return }
        // Fixed domain/code only: never attach JS payloads, navigation URLs,
        // imported-file contents, character names, or saved-game state.
        Crashlytics.crashlytics().record(error: NSError(domain: "it.tabboz.runtime", code: diagnostic.rawValue))
    }

    private func applyAnalyticsPreference() {
        // Firebase's advertising purposes stay denied for our non-personalized model.
        // The separate AdMob SDK honors UMP and also forces non-personalized requests.
        Analytics.setConsent([
            .analyticsStorage: analyticsEnabled ? .granted : .denied,
            .adStorage: .denied,
            .adUserData: .denied,
            .adPersonalization: .denied
        ])
        Analytics.setAnalyticsCollectionEnabled(analyticsEnabled)
        if !analyticsEnabled { Analytics.resetAnalyticsData() }
    }

    private func applyCrashPreference() {
        let crashlytics = Crashlytics.crashlytics()
        crashlytics.setCrashlyticsCollectionEnabled(crashReportsEnabled)
        if !crashReportsEnabled { crashlytics.deleteUnsentReports() }
    }
}

struct PrivacySettingsView: View {
    @ObservedObject private var settings = TelemetrySettings.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Statistiche di utilizzo", isOn: $settings.analyticsEnabled)
                        .accessibilityIdentifier("telemetryAnalyticsSwitch")
                    Toggle("Segnalazioni di arresto anomalo", isOn: $settings.crashReportsEnabled)
                        .accessibilityIdentifier("telemetryCrashlyticsSwitch")
                } header: {
                    Text("Analytics e diagnostica")
                } footer: {
                    Text("Firebase misura l'uso dell'app e raccoglie dati tecnici per migliorarne la stabilità. Le raccolte sono inizialmente attive e puoi disattivarle separatamente. Le tue scelte vengono conservate sul dispositivo.")
                }
                Section {
                    Link("Leggi l'informativa sulla privacy", destination: TelemetrySettings.privacyURL)
                        .accessibilityIdentifier("privacyPolicyLink")
                    Link("Contatta l'assistenza", destination: URL(string: "mailto:dadocere@hotmail.it")!)
                } footer: {
                    Text("Il gioco non invia ad Analytics i nomi dei personaggi o il contenuto dei salvataggi. Gli annunci AdMob sono richiesti senza personalizzazione. Le preferenze pubblicitarie sono accessibili dal menu Help.")
                }
            }
            .navigationTitle("Privacy e diagnostica")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fine") { dismiss() } } }
        }
    }
}

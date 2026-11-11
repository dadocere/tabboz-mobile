import SwiftUI

@main
struct TabbozApp: App {
    @UIApplicationDelegateAdaptor(FirebaseAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            GameView()
                .preferredColorScheme(.light)
                .background(Color(red: 0, green: 0.5, blue: 0.5).ignoresSafeArea())
        }
    }
}

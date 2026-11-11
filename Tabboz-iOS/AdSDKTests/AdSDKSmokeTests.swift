import XCTest

/// Explicit network test scheme, excluded from the ordinary offline native suite.
final class AdSDKSmokeTests: XCTestCase {
    func testForcedAdAfterRealGraceAndCompletedActivities() {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "it.tabboz.simulator")
        app.launchArguments = ["--ad-sdk-smoke", "--reset-ad-policy-for-sdk-test"]
        app.launch()
        let ready = app.staticTexts["adSDKTestStatus"]
        XCTAssertTrue(ready.waitForExistence(timeout: 90), app.debugDescription)
        let splash = app.webViews.buttons["Avvia Tabboz Simulator"]
        if splash.exists { splash.tap() }
        XCTAssertTrue(app.webViews.buttons["Scooter"].waitForExistence(timeout: 15))
        func completedOuting() {
            app.webViews.buttons["Compagnia"].tap()
            app.webViews.buttons["Esci con la compagnia"].tap()
            for _ in 0..<20 {
                if app.webViews.buttons["Scooter"].exists { return }
                let buttons = app.webViews.buttons.matching(NSPredicate(format: "label IN %@", ["OK", "Ci rinuncio...", "Annulla", "No"]))
                if let button = buttons.allElementsBoundByIndex.last(where: { $0.isHittable }) { button.tap() }
                else { XCTFail(app.debugDescription); return }
            }
            XCTFail("Activity did not complete")
        }
        for _ in 0..<5 { completedOuting() }
        XCTAssertFalse(app.staticTexts["Test mode"].exists, "First-play grace must not be bypassed by activities alone")
        // Exercise real production timing, with no accelerated policy or engine hooks.
        for minute in 0..<6 { Thread.sleep(forTimeInterval: 50); print("Forced-ad grace observation \(minute + 1)/6") }
        completedOuting()
        XCTAssertTrue(app.staticTexts["Test mode"].waitForExistence(timeout: 20), app.debugDescription)
        let close = app.buttons.matching(NSPredicate(format: "enabled == true AND (label CONTAINS[c] %@ OR label CONTAINS[c] %@)", "close", "chiudi")).firstMatch
        for _ in 0..<3 {
            if app.webViews.buttons["Scooter"].exists { break }
            XCTAssertTrue(close.waitForExistence(timeout: 30), app.debugDescription)
            close.tap()
            if app.webViews.buttons["Scooter"].waitForExistence(timeout: 3) { break }
        }
        XCTAssertTrue(app.webViews.buttons["Scooter"].exists)
    }

    func testRealSDKConsentRewardAndResume() {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "it.tabboz.simulator")
        app.launchArguments = ["--ad-sdk-smoke", "--reset-ad-policy-for-sdk-test"]
        app.launch()
        let consent = app.webViews.buttons.matching(NSPredicate(format: "label IN %@", ["Consent", "Acconsento", "Consenti"])) .firstMatch
        if consent.waitForExistence(timeout: 30) { consent.tap() }
        let status = app.staticTexts["adSDKTestStatus"]
        XCTAssertTrue(status.waitForExistence(timeout: 90), app.debugDescription)
        XCTAssertEqual(status.label, "reward_ready")
        let splash = app.webViews.buttons["Avvia Tabboz Simulator"]
        if splash.exists { splash.tap() }
        XCTAssertTrue(app.webViews.buttons["Scooter"].waitForExistence(timeout: 15))
        app.webViews.staticTexts["Help"].tap()
        app.webViews.menuItems.matching(NSPredicate(format: "label CONTAINS %@", "10 minuti senza pubblicità")).firstMatch.tap()
        XCTAssertTrue(app.alerts["Una pausa dalla pubblicità"].waitForExistence(timeout: 5))
        app.alerts.buttons["Guarda il video"].tap()
        let close = app.buttons.matching(NSPredicate(format: "enabled == true AND (label CONTAINS[c] %@ OR label CONTAINS[c] %@)", "close", "chiudi")).firstMatch
        XCTAssertTrue(close.waitForExistence(timeout: 90), app.debugDescription)
        // The SDK owns ad playback; the game's status is intentionally inaccessible behind it.
        Thread.sleep(forTimeInterval: 35)
        for _ in 0..<3 {
            if app.webViews.buttons["Scooter"].exists { break }
            XCTAssertTrue(close.waitForExistence(timeout: 15), app.debugDescription)
            close.tap()
            if app.webViews.buttons["Scooter"].waitForExistence(timeout: 3) { break }
        }
        XCTAssertTrue(app.webViews.buttons["Scooter"].waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertEqual(status.label, "reward_active")
        app.terminate(); app.launchArguments = ["--ad-sdk-smoke"]; app.launch()
        if splash.waitForExistence(timeout: 10) { splash.tap() }
        XCTAssertTrue(app.webViews.buttons["Scooter"].waitForExistence(timeout: 15))
        app.webViews.staticTexts["Help"].tap()
        app.webViews.menuItems.matching(NSPredicate(format: "label CONTAINS %@", "10 minuti senza pubblicità")).firstMatch.tap()
        XCTAssertTrue(app.alerts.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "minuti di gioco senza interruzioni")).firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["OK"].tap()
    }
}

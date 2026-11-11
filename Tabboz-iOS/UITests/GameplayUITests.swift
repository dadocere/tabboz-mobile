import XCTest

final class GameplayUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app.launchArguments = ["--disable-ads-for-ui-tests"]
        app.launch()
    }

    private func openGame() {
        let splash = app.webViews.buttons["Avvia Tabboz Simulator"]
        if splash.waitForExistence(timeout: 15) { splash.tap() }
        XCTAssertTrue(app.webViews.buttons["Scooter"].waitForExistence(timeout: 15), app.debugDescription)
    }

    private func screenshot(_ name: String) {
        let capture = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: capture)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try? capture.pngRepresentation.write(to: documents.appendingPathComponent(name + ".png"))
    }

    // Capture the real touch UI at the simulator's native resolution for the
    // store listing. Browsing these dialogs does not alter the saved character.
    func testCaptureStoreScreenshots() throws {
        openGame()
        screenshot("Store 01 Main")
        for (name, file) in [("Scuola", "Store 02 Scuola"), ("Negozi", "Store 03 Negozi"), ("Scooter", "Store 04 Scooter")] {
            app.webViews.buttons[name].tap()
            let ok = app.webViews.buttons["OK"].firstMatch
            XCTAssertTrue(ok.waitForExistence(timeout: 5), "Missing OK in \(name)")
            screenshot(file)
            ok.tap()
            XCTAssertTrue(app.webViews.buttons["Scooter"].waitForExistence(timeout: 5))
        }
    }

    func testPrivacyCollectionPreferencesPersist() throws {
        func openPrivacy() {
            openGame()
            app.webViews.staticTexts["Help"].tap()
            let item = app.webViews.menuItems.matching(NSPredicate(format: "label CONTAINS %@", "Privacy e diagnostica...")).firstMatch
            XCTAssertTrue(item.waitForExistence(timeout: 5), app.debugDescription)
            item.tap()
            XCTAssertTrue(app.switches["telemetryAnalyticsSwitch"].waitForExistence(timeout: 5), app.debugDescription)
        }
        openPrivacy()
        let analytics = app.switches["telemetryAnalyticsSwitch"]
        let crashes = app.switches["telemetryCrashlyticsSwitch"]
        XCTAssertEqual(analytics.value as? String, "1", "Run default collection verification on a fresh dedicated simulator")
        XCTAssertEqual(crashes.value as? String, "1")
        XCTAssertTrue(app.links["privacyPolicyLink"].exists || app.buttons["privacyPolicyLink"].exists)
        analytics.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        crashes.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        screenshot("Firebase Privacy Settings Disabled")
        XCTAssertEqual(analytics.value as? String, "0")
        XCTAssertEqual(crashes.value as? String, "0")
        app.buttons["Fine"].tap()
        app.terminate()
        app.launch()
        openPrivacy()
        XCTAssertEqual(app.switches["telemetryAnalyticsSwitch"].value as? String, "0")
        XCTAssertEqual(app.switches["telemetryCrashlyticsSwitch"].value as? String, "0")
        app.switches["telemetryAnalyticsSwitch"].coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        app.switches["telemetryCrashlyticsSwitch"].coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        app.buttons["Fine"].tap()
        XCTAssertTrue(app.webViews.buttons["Scooter"].isHittable)
    }

    func testAdRewardUnavailableDoesNotBlockGameplay() {
        openGame()
        app.webViews.staticTexts["Help"].tap()
        let item = app.webViews.menuItems.matching(NSPredicate(format: "label CONTAINS %@", "10 minuti senza pubblicità")).firstMatch
        XCTAssertTrue(item.waitForExistence(timeout: 5))
        item.tap()
        XCTAssertTrue(app.alerts["Tabboz"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.alerts.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Puoi continuare a giocare normalmente")).firstMatch.exists)
        app.alerts.buttons["OK"].tap()
        XCTAssertTrue(app.webViews.buttons["Scooter"].isHittable)
        app.webViews.buttons["Scuola"].tap()
        XCTAssertTrue(app.webViews.buttons["Studia Agraria"].waitForExistence(timeout: 5))
        app.webViews.buttons["OK"].firstMatch.tap()
    }

    private func replaceText(in field: XCUIElement, with text: String) {
        let original = field.value as? String ?? ""
        // Place the caret beyond the last glyph and clear with native key events.
        // This works for existing multi-word names without depending on iOS edit-menu labels.
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: original.count) + text)
        XCTAssertEqual(field.value as? String, text)
        let done = app.toolbars.buttons["Done"].firstMatch
        if done.exists { done.tap() }
    }

    private func dismissGameplayEvents() {
        for _ in 0..<20 {
            let scooter = app.webViews.buttons["Scooter"]
            if scooter.exists && scooter.isHittable { return }
            // WebKit may report an obscured parent's OK as hittable. The
            // current modal is appended last, so dismiss its button first.
            let button = app.webViews.buttons.allElementsBoundByIndex.reversed().first {
                $0.isHittable && ["OK", "Ci rinuncio..."].contains($0.label)
            }
            guard let button else { XCTFail(app.debugDescription); return }
            button.tap()
        }
        XCTFail("Gameplay did not return to main: \(app.debugDescription)")
    }

    // Run this test on a fresh dedicated simulator. It exercises actual actions
    // and a previously blocked shop radio, without fixtures or engine shortcuts.
    func testFreshGamePurchasesSchoolAndShopTouchTargets() throws {
        openGame()
        guard app.webViews.staticTexts["10000 L."].exists else {
            throw XCTSkip("This fresh-game transaction test requires a new dedicated simulator; existing progress is preserved.")
        }
        app.webViews.staticTexts["Negozi"].tap()
        app.webViews.staticTexts["Bar Tabacchi..."].tap()
        let pack = app.webViews.buttons["Barclay"]
        XCTAssertTrue(pack.waitForExistence(timeout: 5))
        pack.tap()
        app.webViews.buttons["OK"].firstMatch.tap()
        dismissGameplayEvents()
        XCTAssertTrue(app.webViews.staticTexts["4000 L."].exists, app.debugDescription)

        app.webViews.buttons["Scuola"].tap()
        app.webViews.buttons["Studia Agraria"].tap()
        dismissGameplayEvents()
        XCTAssertTrue(app.webViews.staticTexts["1/100"].exists, app.debugDescription)

        app.webViews.staticTexts["Negozi"].tap()
        app.webViews.staticTexts["Zoccolaro..."].tap()
        let trousers = app.webViews.staticTexts["90000 L."]
        XCTAssertTrue(trousers.waitForExistence(timeout: 5))
        trousers.tap()
        app.webViews.buttons["OK"].firstMatch.tap()
        XCTAssertTrue(app.webViews.staticTexts["Bella figura"].waitForExistence(timeout: 5), "The shop selection did not reach the game")
        dismissGameplayEvents()
        XCTAssertTrue(app.webViews.staticTexts["4000 L."].exists)
        screenshot("iPhone Gameplay Actions")
        app.terminate()
        app.launch()
        openGame()
        XCTAssertTrue(app.webViews.staticTexts["4000 L."].exists)
        XCTAssertTrue(app.webViews.staticTexts["1/100"].exists)
    }

    func testOriginalGameTouchRotationAndPersistentProfile() throws {
        openGame()
        screenshot("iPhone Portrait Main")
        for name in ["Scooter", "Disco", "Scuola", "Lavoro", "Compagnia", "Famiglia"] {
            app.webViews.buttons[name].tap()
            let ok = app.webViews.buttons["OK"].firstMatch
            XCTAssertTrue(ok.waitForExistence(timeout: 5), "Missing OK in \(name): \(app.debugDescription)")
            ok.tap()
            XCTAssertTrue(app.webViews.buttons["Scooter"].waitForExistence(timeout: 5))
        }

        XCUIDevice.shared.orientation = .landscapeLeft
        expectation(for: NSPredicate { _, _ in self.app.frame.width > self.app.frame.height }, evaluatedWith: app)
        waitForExpectations(timeout: 5)
        XCTAssertTrue(app.webViews.buttons["Scooter"].waitForExistence(timeout: 5))
        for name in ["Scooter", "About"] {
            let button = app.webViews.buttons[name]
            XCTAssertTrue(button.isHittable)
            XCTAssertTrue(app.frame.contains(button.frame), "Clipped \(name): \(button.frame) outside \(app.frame)")
        }
        screenshot("iPhone Landscape Main")
        XCUIDevice.shared.orientation = .portrait

        app.webViews.staticTexts["Special"].tap()
        app.webViews.staticTexts["Personal Information..."].tap()
        let surnameField = app.webViews.textFields["Cognome"]
        XCTAssertTrue(surnameField.waitForExistence(timeout: 5), app.debugDescription)
        if surnameField.value as? String != "Caio" { replaceText(in: surnameField, with: "Caio") }
        let nameField = app.webViews.textFields["Nome"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 5), app.debugDescription)
        let editedName = nameField.value as? String == "Tabbozzo iOS" ? "Tabbozzo Mobile" : "Tabbozzo iOS"
        replaceText(in: nameField, with: editedName)
        app.webViews.buttons["OK"].firstMatch.tap()
        XCTAssertTrue(app.webViews.staticTexts[editedName + " Caio"].waitForExistence(timeout: 5), app.debugDescription)
        screenshot("iPhone Edited Profile")

        XCUIDevice.shared.press(.home)
        app.activate()
        app.terminate()
        app.launch()
        openGame()
        XCTAssertTrue(app.webViews.staticTexts[editedName + " Caio"].waitForExistence(timeout: 5), app.debugDescription)
        screenshot("iPhone Restored Profile")
    }

    func testNativeBackupPickers() throws {
        openGame()
        app.webViews.staticTexts["File"].tap()
        app.webViews.staticTexts["Salva con nome..."].tap()
        let save = app.buttons.matching(NSPredicate(format: "identifier == %@ OR label == %@", "DOCPicker.actionButton", "Save")).firstMatch
        XCTAssertTrue(save.waitForExistence(timeout: 10), app.debugDescription)
        screenshot("iPhone Export Backup Picker")
        save.tap()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let replace = springboard.alerts.buttons["Replace"].firstMatch
        if replace.waitForExistence(timeout: 3) { replace.tap() }
        else if app.alerts.buttons["Replace"].firstMatch.exists { app.alerts.buttons["Replace"].firstMatch.tap() }
        XCTAssertTrue(save.waitForNonExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(app.webViews.staticTexts["File"].waitForExistence(timeout: 10))
        app.webViews.staticTexts["File"].tap()
        app.webViews.staticTexts["Apri..."].tap()
        let backup = app.staticTexts["Tabboz.tabboz.json"].firstMatch
        XCTAssertTrue(backup.waitForExistence(timeout: 10), app.debugDescription)
        screenshot("iPhone Import Backup Picker")
        let thumbnail = app.cells.containing(.staticText, identifier: "Tabboz.tabboz.json").firstMatch.images.firstMatch
        // Newer Files pickers expose the thumbnail's bounds but can report it
        // as not hittable. Send the touch at its actual on-screen center.
        thumbnail.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(backup.waitForNonExistence(timeout: 10))
        openGame()
        XCTAssertFalse(app.alerts.firstMatch.exists, app.debugDescription)
        XCTAssertTrue(app.webViews.buttons["Scooter"].isHittable, app.debugDescription)
        screenshot("iPhone Imported Backup")
    }
}

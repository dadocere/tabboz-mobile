# Mobile distribution status

Development is proceeding for iOS and Android without contacting the original author, as requested. Attribution is retained. Attribution alone is not a substitute for license compliance or a determination that a store release is permitted.

## Existing permissions and obligations

The original game is provided under GPL-3.0-or-later. Commercial modification and distribution are permitted subject to that license. Release preparation must preserve the notices and provide complete corresponding source for the distributed version, including modifications and necessary build inputs, through a compliant distribution method. A link to the untouched upstream repository alone does not provide our modified source.

The port retains the game license, upstream snapshot, corrected compatibility source, engine build recipe and source/artifact hash manifest. The modified source and build inputs are published at [https://github.com/dadocere/tabboz-mobile](https://github.com/dadocere/tabboz-mobile), with tag `ios-v1.0.0-build4` identifying the snapshot for uploaded build 4. Binary IPA archives and signing credentials are excluded. Source publication does not settle the separate platform, dependency or asset-rights questions.

Novantotto retains MPL-2.0 notices and its license in `Tabboz-iOS/Compatibility/Novantotto`. The exact 98.css v0.1.20 MIT permission notice has been added to the existing bundled `ThirdPartyNotices.txt`. Separate provenance of fonts and other non-code assets still needs verification; this note does not conclude they are infringing or cleared.

## Platform status

- **iOS:** the tested project exists in `Tabboz-iOS`. A draft App Store Connect record named Tabboz (ID `6832685698`) and version 1.0.0 build 4 now exist under ISTITUTI EDMONDO DE AMICIS SRL, team `FC4758TVE2`. The current Apple processing and attachment status is recorded in `Tabboz-iOS/AppStore/release.json`. The app is being prepared as a free ads-funded download without purchases; the educational membership fee waiver has not been changed. No App Review submission or public release has been made. The potential conflict between GPL obligations and App Store distribution conditions remains unresolved; author credit, Apple approval and source publication alone should not be represented as resolving that conflict. See [build and store details](Tabboz-iOS/AppStore/README.md).
- **Android:** the SDK, Gradle and Java are available locally. The Android application has not yet been implemented. Google Play does not present a blanket prohibition on GPL software, but the actual build, dependencies and distribution method must meet both the relevant licenses and store policies. No store submission has been made.

No author outreach has been performed. Development and draft metadata preparation can continue while distribution questions are evaluated. The decision not to contact the author does not itself waive any license condition or establish permission for additional rights such as trademarks.

## References

- [Original game license](https://github.com/andreax79/tabboz/blob/main/LICENSE)
- [GNU licensing FAQ](https://www.gnu.org/licenses/gpl-faq.en.html)
- [FSF's historical explanation of the App Store conflict](https://www.fsf.org/blogs/licensing/more-about-the-app-store-gpl-enforcement) — relevant background, not a current legal clearance for this app
- [Mozilla MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
- [98.css v0.1.20 license](https://unpkg.com/98.css@0.1.20/LICENSE)
- [Google Play intellectual-property policy](https://support.google.com/googleplay/android-developer/answer/9888072?hl=en)

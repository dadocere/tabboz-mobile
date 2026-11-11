# Monetization working proposal

The current unpublished App Store draft is a EUR 4.99 paid download, with Italy as the initial storefront. No in-app purchases, advertisements or subscriptions have been implemented. This is an initial product hypothesis, not a forecast or a commitment to a public release price.

## First launch

Launch the complete classic game as a one-time purchase if the release prerequisites are resolved. Preserve the original gameplay balance and interface. Sell the maintained mobile experience: touch adaptation, local saves/backups, device support and reliability.

Use Italian retro-gaming audiences and short clips of recognizable gameplay to test demand before committing money to acquisition. The initial evidence target is feedback and behavior from the first 100 paying users, not an assumed download volume.

## Decisions to measure

| Observation | Next investigation |
| --- | --- |
| Few relevant product-page visits | Discovery, creator/community outreach and campaign messaging |
| Visits but few purchases | Listing clarity, screenshots, trust, price and whether a demo would reduce uncertainty |
| Purchases but little repeat play | First-play clarity, touch usability, progression and faithful gameplay |
| Crashes or blocked sessions | Fix reliability before increasing promotion |
| Sustained demand for new material | Evaluate a substantial expansion with a clear price and scope |

Use App Store Connect for acquisition, sales, price-point estimates and actual proceeds. Use Firebase Analytics for app usage/retention and Crashlytics for stability, subject to the implemented privacy settings and disclosures. Do not send names, save files, contact details or free-form player input as analytics parameters. Paid-download conversion cannot be inferred from Firebase users alone because people who never install do not appear there.

## Later experiment

A free demo followed by a EUR 4.99 permanent unlock remains a candidate if acquisition data supports it. That requires a deliberate demo boundary, StoreKit entitlements, purchase restoration, offline entitlement behavior and tests. It is not part of the present build. Do not add purchases of game money or paid advantages to the faithful classic merely to create revenue.

A subscription would need a separately justified ongoing content/service proposition. An ad-funded version would need evidence that its expected revenue outweighs its effect on the experience and the additional advertising/privacy implementation.

## Economics

Use actual App Store proceeds rather than treating the customer price as revenue. Store commission, consumption taxes, refunds, licensing arrangements, support and acquisition costs affect profit. Apple Small Business Program eligibility applies to the legal entity and relevant associated accounts, not just Tabboz; eligibility/enrollment has not been established here.

Sources: [Apple App Analytics](https://developer.apple.com/app-store-connect/analytics/), [Small Business Program](https://developer.apple.com/app-store/small-business-program/).

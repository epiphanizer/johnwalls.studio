# Mobile Platform Strategy For LeadMeGuideMe

Date: 2026-06-19

## Purpose

This document summarizes the practical options for bringing LeadMeGuideMe to Android and, if desired, moving toward a shared mobile codebase.

The analysis assumes a single developer supported by modern AI coding tools.

## Executive Summary

LeadMeGuideMe is currently a native iOS app with a UIKit and storyboard-based architecture. It is not a lightweight content app and it is not already structured as a shared cross-platform codebase.

Because of that, there is no low-risk "wrapper" or one-click port path to Android.

The two options that make the most business sense are:

1. Build a native Android app in Kotlin and Jetpack Compose while keeping the existing iOS app.
2. Rebuild the app in Flutter if the long-term goal is a single shared mobile codebase for both iOS and Android.

Our recommendation is:

1. Choose native Android if the priority is the fastest, lowest-risk path to Android.
2. Choose Flutter if the priority is consolidating future mobile development into one cross-platform codebase.

We do not recommend Cordova wrapping for this app.

## Current App Snapshot

The current codebase has the following characteristics:

- 79 Swift files in the app source tree.
- 17 storyboard files.
- 19 XIB files.
- Heavy UIKit usage across the app.
- Firebase Auth and Firestore used throughout the app.
- OneSignal used for push notifications and in-app messaging.
- Sentry used for crash reporting.
- Sign in with Apple support.
- Deep link handling and app lifecycle logic in iOS app delegates.
- An iOS notification service extension for rich push handling.

This matters because Android support is not just about translating Swift syntax. The existing product behavior is spread across UI controllers, storyboard wiring, lifecycle hooks, native SDK integrations, and push/deep-link flows.

## What AI Can And Cannot Accelerate

AI can help significantly with:

- Converting model objects and data structures.
- Scaffolding screens and navigation.
- Rebuilding service layers against Firebase.
- Recreating common UI patterns quickly.
- Producing first-pass code for most screens.

AI does not remove the need to:

- Rebuild platform-specific integrations correctly.
- Verify business logic and UI behavior against the current app.
- Test push notifications, deep links, auth flows, media access, and edge cases.
- Validate that production behavior matches the existing iOS experience.

In short: AI can generate a prototype very quickly, but not a production-safe port overnight.

## Option Review

### Option 1: Native Android In Kotlin + Jetpack Compose

What it means:

- Keep the existing iOS app.
- Build a separate Android client using Kotlin and Jetpack Compose.
- Reuse the current Firebase backend and business rules.

Why it makes sense:

- Fastest path to an Android release.
- Lowest risk to the existing iOS product.
- Best fit for Android performance, notifications, deep links, and platform-specific polish.
- Easier to reason about than forcing a cross-platform migration on a UIKit codebase.

Tradeoffs:

- Two client codebases to maintain going forward.
- Shared logic will be conceptual rather than literally shared unless extracted later.

Estimated effort for one developer with AI:

- Technical spike: 1 week.
- Credible MVP: 6 to 10 weeks.
- Near-parity production version: 16 to 24 weeks.

Best fit when:

- The primary goal is to launch Android as soon as possible with acceptable risk.

### Option 2: Flutter Rewrite For iOS And Android

What it means:

- Rebuild the app in Flutter.
- Replace the current iOS client over time.
- Use one Dart codebase for both iOS and Android.

Why it makes sense:

- Best true single-codebase option for this app.
- Strong Firebase ecosystem.
- Supported Sentry and OneSignal integrations.
- Good AI leverage because screens, forms, list views, and service classes can be generated quickly.

Tradeoffs:

- This is a rewrite, not a wrap.
- iOS regression risk is real because the current app would eventually be replaced.
- Push, Apple auth, deep links, permissions, and media flows still need real platform integration and testing.

Estimated effort for one developer with AI:

- Overnight to 3 days: generated prototype or visual scaffold.
- Usable internal prototype: 1 to 2 weeks.
- Credible MVP for both platforms: 12 to 18 weeks.
- Near-parity production version: 20 to 32 weeks.

Best fit when:

- The goal is to consolidate future mobile work into one shared codebase.

### Option 3: Flutter Android-First, Keep iOS Native For Now

What it means:

- Build Android in Flutter first.
- Keep the current iOS app in Swift until there is a reason to replace it.

Why it makes sense:

- Gives the team a path into Flutter without forcing an immediate iOS rewrite.
- Reduces risk versus replacing both clients at once.
- Preserves the option to later migrate iOS if Flutter proves to be a good fit.

Tradeoffs:

- Short term, the team still maintains two mobile stacks.
- Long term, the codebase may still need another migration decision for iOS.

Estimated effort for one developer with AI:

- Technical spike: 1 to 2 weeks.
- Android MVP: 8 to 12 weeks.
- More complete Android release: 14 to 20 weeks.

Best fit when:

- The business wants Android soon, but also wants to test Flutter as a long-term platform choice.

### Option 4: Skip (Swift To Android Tooling)

What it means:

- Keep a Swift-first development model.
- Extract or rebuild app logic into modules that can target Android.
- Potentially share parts of UI only after architectural cleanup.

Why it makes sense:

- Preserves more Swift investment.
- Interesting long-term path for teams committed to Swift.

Tradeoffs:

- This app is currently UIKit and storyboard based, which is the hard case for Skip.
- Not a direct migration path from the current Xcode target.
- Requires structural refactoring before meaningful Android output appears.

Estimated effort for one developer with AI:

- Technical spike: 1 to 2 weeks.
- Shared-core proof of concept: 4 to 8 weeks.
- Credible Android delivery path: 16 to 28 weeks.

Best fit when:

- The team strongly prefers Swift as its long-term center of gravity.

### Option 5: Kotlin Multiplatform / Compose Multiplatform

What it means:

- Move shared logic, and possibly UI, into Kotlin.
- Align the mobile stack around Kotlin and Compose.

Why it makes sense:

- Strong for Android-led teams.
- Viable for shared business logic and increasingly viable for shared UI.

Tradeoffs:

- Much weaker fit for a Swift-first codebase like this one.
- Requires a significant shift in team workflow and platform ownership.
- More organizational change than the other sensible options.

Estimated effort for one developer with AI:

- Technical spike: 2 weeks.
- MVP path: 14 to 22 weeks.
- Near-parity path: 24 to 36 weeks.

Best fit when:

- The long-term strategy is to become Kotlin-first across mobile.

### Option 6: React Native

What it means:

- Rebuild the app in React Native, likely with a TypeScript-based architecture.

Why it might make sense:

- Large ecosystem.
- Good for teams that already work heavily in React and TypeScript.

Tradeoffs:

- No specific advantage over Flutter for this codebase.
- Still a rewrite.
- Less aligned to the current Swift-heavy implementation.

Estimated effort for one developer with AI:

- Technical spike: 1 to 2 weeks.
- MVP: 12 to 18 weeks.
- Near-parity production version: 22 to 34 weeks.

Best fit when:

- The team already has deep React Native experience.

### Option 7: Cordova Or Capacitor Wrapping

What it means:

- Rebuild the app as a web application, then package it in a mobile shell.

Why it does not make sense here:

- The current app is not a web app.
- Wrapping does not convert UIKit screens, storyboard flows, or native Swift code into Android.
- All the product behavior would still need to be rebuilt in web technologies.
- This is generally a worse fit than Flutter for a Firebase-heavy mobile app with deep links, push, auth, and media flows.

Estimated effort for one developer with AI:

- Prototype only: 1 to 2 weeks.
- Credible MVP: 14 to 24 weeks.
- Production-safe version: 24 to 40+ weeks.

Recommendation:

- Do not choose Cordova or Capacitor for this project.

## Comparative Ranking

If the goal is fastest Android delivery:

1. Native Android in Kotlin + Compose.
2. Flutter Android-first.
3. Flutter full rewrite.

If the goal is one long-term mobile codebase:

1. Flutter.
2. Skip, but only if Swift-first strategy is a hard requirement.
3. Kotlin Multiplatform / Compose Multiplatform, if the team wants to become Kotlin-first.

If the goal is lowest overall risk:

1. Native Android while preserving the current iOS app.
2. Flutter Android-first.
3. Flutter full rewrite.

## Recommended Path

### Recommendation A: Fastest, Lowest-Risk Business Path

Build a native Android app in Kotlin and Jetpack Compose while keeping the existing iOS app intact.

This is the best choice if the priority is reaching Android users quickly without destabilizing the existing iOS product.

### Recommendation B: Best Long-Term Shared Codebase Path

Rebuild in Flutter if the business is willing to invest in a strategic client rewrite and wants one shared mobile codebase going forward.

This is the best choice if long-term efficiency matters more than the immediate shortest path to Android.

## Detailed Review: The Skip Option

This section expands the Skip analysis because Skip is the most tempting option for a Swift-first team and the easiest one to misunderstand.

### What Skip Would Actually Mean For This App

Skip is not a tool that takes an existing UIKit app target and turns it into a working Android app.

For LeadMeGuideMe, Skip would be most useful in one of two forms:

1. Shared Swift business logic and service modules, with a native Android UI built separately.
2. A longer-term restructuring effort that gradually moves product logic, and potentially some future UI, into Skip-compatible Swift modules.

It is not well suited to directly translating the current storyboard and UIViewController implementation.

### Why The Current App Is A Hard Skip Migration

The app today is tightly coupled to iOS-native implementation details:

- App lifecycle and startup wiring in AppDelegate and SceneDelegate.
- Navigation driven by storyboards and instantiated view controllers.
- UIKit-based screens and table/collection view cells.
- Apple-only frameworks such as PhotosUI and AuthenticationServices.
- OneSignal-specific iOS notification extension behavior.

This means the first task in any Skip-based path is architectural extraction, not Android build generation.

### Where Skip Fits Well

Skip is strongest here if used to share non-UI code such as:

- Models like AppUser, Group, Highlight, Book, Chapter, and ReadingProgress.
- Firestore-backed domain services after UIKit dependencies are removed.
- Business rules for groups, highlights, comments, reading state, bookmarks, and onboarding state.
- Validation, serialization, and shared application state.

In practical terms, this means refactoring code out of the current app target into Swift Package Manager modules and then making those modules Skip-aware.

### Where Skip Fits Poorly

Skip is a poor fit for the following parts of the current app:

- Storyboards and XIB-driven UI.
- UIViewController-based navigation flows.
- Existing table view and collection view presentation code.
- PhotosUI picker flows.
- The current OneSignal notification service extension.
- Any Sign in with Apple implementation that depends on AuthenticationServices directly.

These areas would either remain platform-specific or need to be redesigned.

### The Important Skip Technical Detail: Fuse vs Lite

Skip has two main modes:

1. Skip Fuse, which compiles Swift natively for Android.
2. Skip Lite, which transpiles Swift to Kotlin.

For this app, the best Skip strategy would almost certainly be mixed-mode:

1. Use Skip Fuse for shared business logic and shared service code.
2. Use Skip Lite only where direct Android Kotlin or Java API access is needed.

This matters because:

- Fuse is better for preserving real Swift behavior and supporting broader Swift code.
- Lite is better when Android interop needs to be direct and transparent.
- A mixed architecture is normal in Skip and is likely the correct shape for this app.

### How The Shared Architecture Would Likely Look

If LeadMeGuideMe used Skip seriously, the codebase would likely need to be reorganized into modules such as:

1. CoreModels
2. CoreDomain
3. CoreData
4. AppShell or PlatformAdapters

One reasonable target structure would be:

1. CoreModels
Contains AppUser, Group, Highlight, Book, Chapter, Bookmark-related types, reading state, tutorial state, and value objects.

2. CoreDomain
Contains business rules, group membership logic, highlight/comment behavior, onboarding decisions, and app state rules.

3. CoreData
Contains Firebase-backed services for auth, Firestore, storage, and functions, rewritten so they do not depend on UIKit classes, NotificationCenter-driven UI assumptions, or storyboard state.

4. AndroidApp
Contains a native Android UI, most likely Jetpack Compose, calling into bridged Swift APIs exposed by the shared modules.

5. Existing iOS App
Continues to use the shared modules from the current Xcode app while retaining its UIKit UI.

This is the lowest-risk Skip shape for this repo.

### Firebase Fit Under Skip

Firebase is the strongest part of the Skip story for this app.

SkipFirebase appears mature enough for the parts this app uses most heavily:

- Firestore is one of the most complete modules.
- Auth supports the common flows such as email/password, anonymous, email-link, state listeners, ID token retrieval, account linking, and reauthentication.
- Messaging, Storage, Analytics, Remote Config, App Check, Crashlytics, Functions, and Performance all have meaningful wrapper support.

However, there are still important caveats:

- Firestore transactions are not implemented.
- Some Functions conveniences are missing, especially streaming-oriented API.
- Some Firebase Auth APIs are not bridged.
- Messaging support does not automatically solve OneSignal-specific integration needs.

This means Firebase is a point in Skip’s favor, but not a full migration answer on its own.

### Push Notifications Under Skip

Push is one of the more complex parts of the current app.

Today the app relies on OneSignal and an iOS notification service extension. Under Skip, there are two different paths:

1. Keep OneSignal as a platform-specific integration.
2. Move closer to FCM/APNs primitives using SkipFirebaseMessaging or SkipNotify.

The problem is that Skip has wrappers for Firebase messaging and generic push token handling, but it does not provide an obvious first-class OneSignal wrapper.

That means a Skip migration would probably require one of the following:

1. Keeping OneSignal native on each platform.
2. Building a custom Android wrapper layer around the OneSignal Android SDK.
3. Reworking messaging architecture to rely less on OneSignal-specific client behavior.

This is a major reason Skip is not plug-and-play here.

### Sign In With Apple Under Skip

This is one of the clearest current blockers.

Skip’s AuthenticationServices compatibility layer currently supports web authentication sessions. It explicitly says Sign in with Apple is planned for the future, not fully provided now.

For this app, that means Sign in with Apple would need a separate treatment:

1. Retain the current iOS implementation natively.
2. Use a different Android auth path.
3. Potentially switch the shared auth abstraction to a web-based or provider-based flow rather than direct Apple-native assumptions.

This alone is enough to prevent a fully shared auth implementation today.

### Sentry Fit Under Skip

Sentry support exists and is usable for error monitoring, basic configuration, user context, tags, breadcrumbs, and event capture.

It is not a total blocker.

However, SkipSentry does not yet wrap all advanced native features such as:

- Full performance monitoring.
- Attachments.
- Session replay.
- Profiling.
- Metrics.
- Feature flag support.

For this app, basic crash reporting can likely be shared. More advanced observability would still require native handling.

### What A Realistic Skip Migration Would Look Like

The realistic Skip path is not:

1. Convert the current iOS target.
2. Press build.
3. Ship Android.

The realistic Skip path is:

1. Extract models and domain logic into SwiftPM modules.
2. Remove UIKit dependencies from shared services.
3. Decide which services become shared Skip modules.
4. Build a native Android UI that consumes bridged Swift APIs.
5. Keep iOS UI native for now.
6. Only later decide whether any UI should be shared.

That means Skip is better understood here as a shared core strategy, not as a UI porting strategy.

### Best-Case, Likely, And Worst-Case Skip Outcomes

Best-case:

- Shared Swift models and Firebase-backed services.
- Native Android UI in Compose consuming shared Swift business logic.
- Existing iOS UI preserved.
- Significant reuse without destabilizing the current app.

Likely:

- Shared models and some domain logic move successfully.
- A meaningful portion of service code has to be rewritten to remove UIKit, NotificationCenter, and app-lifecycle assumptions.
- Push, Apple auth, photos, and some onboarding and navigation behavior remain platform-specific.

Worst-case:

- The team spends time restructuring for Skip but still ends up writing a mostly separate Android app because too much of the current implementation is UIKit-driven.

### Refined Skip Estimate For This Repo

For one developer using AI assistance, the most realistic Skip estimates are:

1. Technical feasibility spike: 1 to 2 weeks.
2. Shared model and service extraction: 3 to 6 weeks.
3. Bridged Android proof of concept with native Android UI: 2 to 4 weeks.
4. Android MVP using shared Swift core: 12 to 20 weeks total.
5. Near-parity Android version using shared Swift core: 20 to 30 weeks total.

If the goal expands to sharing UI as well, the estimate becomes much worse because the current UI would need to be substantially redesigned.

### Bottom Line On Skip

Skip is technically credible and stronger than it might first appear, especially because of its Firebase support and its ability to mix native Swift and transpiled modules.

But for LeadMeGuideMe, Skip should be viewed as:

1. A shared-core architecture option.
2. A Swift-first long-term investment.
3. Not the fastest route to Android.
4. Not a direct translation strategy for the current UIKit app.

If the team wants to stay Swift-first and is willing to invest in modularization, Skip is worth a serious spike.

If the business wants the shortest path to Android, native Android remains the stronger option.

If the business wants the cleanest future single-codebase story, Flutter remains the stronger option.

### Special Case: Migrate Up From UIKit First

There is one version of the Swift-first strategy that is more viable than trying to point Skip at the current app directly:

1. Migrate the iOS app from UIKit and storyboards toward SwiftUI.
2. Extract shared models, domain logic, and data services into Swift Package Manager modules while doing so.
3. Only after that, evaluate Skip again for Android.

This approach would improve the architecture for Skip because it would remove one of the biggest current constraints: the app is still built around UIKit view controllers, storyboard navigation, and XIB-backed cells.

However, it is important to understand what this does and does not solve.

What it improves:

- Replaces storyboard and view-controller wiring with code-defined UI state.
- Forces navigation, screen state, and data flow into more explicit structures.
- Makes future shared UI or shared app-shell work much more plausible.
- Produces a cleaner iOS architecture even if Android never ships.

What it does not solve:

- OneSignal integration still remains platform-specific.
- The notification service extension still remains iOS-specific.
- Sign in with Apple still remains a separate concern.
- Photos and media access still remain platform-specific.
- Android value still arrives late in the process.

For this repo, the UIKit migration surface is large enough that this is effectively a major product rewrite stage on its own:

- 14 UIViewController files.
- 2 UITableViewController files.
- 1 UICollectionViewController file.
- 10 ViewModel files.
- 16 storyboard files.
- 19 XIB files.

That means UIKit-first is only a good idea if the team wants the SwiftUI migration for iOS itself, not just as a pre-step for Android.

Estimated effort for one developer with AI:

1. UIKit to SwiftUI migration of the iOS app: 8 to 16 weeks for a credible app-wide migration, 12 to 20 weeks for a more polished and regression-tested result.
2. Skip feasibility spike after SwiftUI migration begins: 1 to 2 weeks.
3. Additional Android delivery path after the architecture is modernized: 8 to 16 more weeks for an Android MVP built on the improved shared core.

So the staged path is plausible, but expensive:

1. UIKit -> SwiftUI first: better Swift-first foundation.
2. SwiftUI/shared modules -> Skip later: better technical fit.
3. Total time to Android: usually longer than either native Android or Flutter.

Bottom line:

- If the goal is a cleaner iOS architecture and a Swift-first long game, UIKit-first is a sensible strategy.
- If the goal is the shortest path to Android, UIKit-first is not the right move.

## Suggested Next Step

Regardless of platform choice, the best immediate next step is a short, fixed-scope technical spike.

Suggested spike duration:

- 5 to 10 business days.

Suggested spike deliverables:

1. Login flow.
2. Groups list or home feed.
3. One reading or highlight/comment flow.
4. Deep link proof of concept.
5. Push notification proof of concept.

At the end of the spike, the team should decide based on actual implementation evidence rather than theoretical framework marketing.

## Final Recommendation

For LeadMeGuideMe, there is no realistic overnight Android port.

There is, however, a realistic AI-assisted acceleration path:

1. Use AI to generate a rapid first-pass client.
2. Use a short spike to prove the riskiest integrations.
3. Choose between native Android speed and Flutter long-term consolidation.

If a client decision is needed now, the most defensible recommendation is:

1. Choose native Android for the fastest business result.
2. Choose Flutter only if the business explicitly wants a future single mobile codebase.
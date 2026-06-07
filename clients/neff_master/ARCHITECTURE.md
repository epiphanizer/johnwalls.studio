# LeadMeGuideMe Architecture

## System Summary

LeadMeGuideMe is a native iOS application with a Swift-first codebase, some legacy Objective-C interop, Firebase-backed identity and data flows, OneSignal push integration, and Sentry crash monitoring. The product structure is mobile-first: the app owns onboarding, user auth, group flows, highlights, reading/bookmark flows, and user settings directly inside the iOS project rather than through a separate local backend service in this repo.

The repo is centered around the Xcode project under `LeadMeGuideMe/`. Supporting folders provide tests, Firebase-related artifacts, signing material, and build outputs.

## Top-Level Surfaces

### `LeadMeGuideMe/`

- Main iOS app project.
- App startup is wired in `LeadMeGuideMe/LeadMeGuideMe/LeadMeGuideMe/Resources/AppDelegate.swift`.
- Startup config shows `FirebaseApp.configure()`, `SentrySDK.start(...)`, and `OneSignal.initialize(...)`.
- Domain areas visible in source include onboarding, groups, highlights, search, bookmarks, reading, and user/auth flows.

### `LeadMeGuideMeTests/`

- Native test target with focused Swift test coverage.

### `firebase/`

- Firebase-related material and future-facing feature stubs, including conversation work that appears staged rather than fully active.

### `build/`

- Build outputs and generated Xcode artifacts.
- Do not treat this as source of truth.

## Product Domains Inside The App

- `User + Auth/`: login, account creation, account management, settings, auth services, and user models.
- `Groups/`: group creation, membership, settings, and group service flows backed by Firebase.
- `Highlights/`: feed and comments behavior.
- `BOM/`: reading, books, chapters, and bookmarks.
- `Onboarding/`: first-run flow and permission/setup orchestration.

## External Service Boundaries

- Firebase handles app configuration, auth, Firestore/data, and some Functions-backed group behavior.
- OneSignal handles notification permission prompts and rich push extension flows.
- Sentry handles crash and error capture.

## Working Model

1. Start in `LeadMeGuideMe/` for any product behavior change.
2. Check `Resources/AppDelegate.swift` when a task involves startup, SDKs, or environment bootstrapping.
3. Check the owning domain folder before making UI or service changes.
4. Treat `build/` as generated output and avoid editing it directly.
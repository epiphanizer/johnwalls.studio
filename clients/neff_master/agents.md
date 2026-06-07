# LeadMeGuideMe Agent Guide

## Overview

- This repo is a native iOS product, not a multi-service monorepo.
- The canonical source lives under `LeadMeGuideMe/`.
- Firebase, OneSignal, and Sentry are first-class runtime dependencies.

## Start Here

1. Read `ARCHITECTURE.md` first.
2. Route to the owning app area under `LeadMeGuideMe/LeadMeGuideMe/LeadMeGuideMe/`.
3. If the task affects startup or third-party SDKs, inspect `Resources/AppDelegate.swift` first.
4. If the task affects push delivery, also inspect `OneSignalNotificationServiceExtension/`.

## Repo Map

- `LeadMeGuideMe/`: Xcode project, app source, and package resolution.
- `LeadMeGuideMeTests/`: test target.
- `firebase/`: Firebase-related support files and future-facing feature work.
- `build/`: generated artifacts; do not edit directly.

## Domain Map

- `User + Auth/`: login, create account, account settings, auth service.
- `Groups/`: group lifecycle and membership.
- `Highlights/`: highlight feed and comments.
- `BOM/`: books, chapters, reading, bookmarks.
- `Onboarding/`: initial flow and permissions.
- `Resources/`: app delegate, scene delegate, plist, shared app config.

## Rules

- Prefer editing source in the app target, not generated build output.
- Treat Firebase-auth and Firestore behavior as part of the product contract.
- Push-notification changes may span app source plus the OneSignal notification service extension.
- Crash or runtime boot changes should account for Sentry, Firebase, and OneSignal initialization order.

## Validation

- Validate in Xcode when possible.
- Use the test target for focused regression checks when changing app logic.
- If you cannot run Apple build tooling in the current environment, state that clearly in handoff notes.
#!/usr/bin/env bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"
APP_NAME="johnwalls.studio"
APP_BUNDLE="${PROJECT_ROOT}/build/${APP_NAME}.app"

echo "=================================================="
echo "  Building native macOS Desktop Program: ${APP_NAME} "
echo "=================================================="

# 1. Ensure UI production build is fresh
cd "${PROJECT_ROOT}/ui"
npm run build

# 2. Prepare .app bundle hierarchy
rm -rf "${APP_BUNDLE}"
mkdir -p "${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${APP_BUNDLE}/Contents/Resources"

# 3. Copy Info.plist and PkgInfo
cp "${SCRIPT_DIR}/Info.plist" "${APP_BUNDLE}/Contents/Info.plist"
echo "APPL????" > "${APP_BUNDLE}/Contents/PkgInfo"

# 4. Copy web production assets into Resources
cp -R "${PROJECT_ROOT}/ui/dist" "${APP_BUNDLE}/Contents/Resources/dist"

# 5. Compile native macOS Cocoa + WebKit Mach-O binary
echo "Compiling native Cocoa + WebKit runner..."
clang++ -std=c++20 -O3 -fobjc-arc \
    -framework Cocoa \
    -framework WebKit \
    "${SCRIPT_DIR}/src/main.mm" \
    -o "${APP_BUNDLE}/Contents/MacOS/johnwalls.studio"

chmod +x "${APP_BUNDLE}/Contents/MacOS/johnwalls.studio"

echo "✓ Successfully built: ${APP_BUNDLE}"
echo "Launching desktop program on your screen..."
open "${APP_BUNDLE}"
echo "✓ Desktop program launched!"

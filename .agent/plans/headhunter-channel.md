# Implementation Plan - Headhunter Notification Channel

## Problem

The user wants a dedicated "Headhunter" notification category (channel) for recruit alerts. Standard PWAs on Android rely on the browser's channel implementation, but we can hint at a specific channel by using the `channelId` (experimental) or by ensuring the notification structure is distinct.

## Proposed Changes

### 1. Service Worker (`public/sw.js`)

- **Modification**: Update `SHOW_NOTIFICATION` handler to pass `channelId` if present in options.
- **Modification**: Update `BADGE_NOTIFICATION_ANDROID` handler (lines 60-85 of `sw.js`) to include `channelId: "headhunter-channel"`.
- **Reason**: While not universally supported, some modern Android wrappers (TWA) or future PWA standards respect this property to group notifications.

### 2. Frontend Logic (`useBadge.ts`)

- **Modification**: In `sendLocalNotification`, allow passing `channelId` in the options.
- **Modification**: In `useClanData.ts` (where "Elite Recruits" are triggered), pass `channelId: "headhunter-channel"` in the notification options.

### 3. Verification Plan

- **Manual Test**: Trigger a "synthetic" notification (using the debug console if available, or modifying `useClanData` to force a notification).
- **Check**: Inspect the notification on an Android device (if possible) or inspecting the Service Worker message payload in DevTools.
- **Verify**: Ensure the code compiles and `pnpm run build` succeeds.

## Note on "Creating" Channels

Since we cannot explicitly call `createNotificationChannel` from a Service Worker, we rely on the implementation where providing a `channelId` might prompt the system (or the wrapper) to bucket it correctly. If purely PWA, this might just fallback to the default channel, which is acceptable as we've done our best to categorize it.

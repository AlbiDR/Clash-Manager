# Task: Implement Headhunter Notification Channel

## Goal

Create a dedicated Notification Channel (Category) named "Headhunter" for Android notifications related to elite recruits. This ensures users can manage these notifications separately in their system settings.

## Deliverables

- [x] Modify `public/sw.js` (or the relevant service worker file) to implementation the notification channel logic on `activate` or `install`.
- [x] Update `useBadge.ts` or the notification dispatch logic to specify the `channelId` (or `tag`) as "headhunter-channel".
- [x] Verify implementation compatibility with Android PWA standards.
- [x] Push to `Stable` (Synced manually).

## Notes

- `channelId` property is added to the options of `showNotification` in both `useBadge.ts` (local) and `sw.js` (background/push).
- This provides the necessary hint to Android wrappers/browsers to categorize these notifications.

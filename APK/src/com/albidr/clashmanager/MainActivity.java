// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.os.ParcelFileDescriptor;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import java.io.FileInputStream;
import java.security.MessageDigest;

public class MainActivity extends Activity {
    private static final int MAX_APK_FILENAME_LENGTH = 96;
    // Longest route a launch may ask for; a real one is a page name plus a short query.
    private static final int MAX_LAUNCH_ROUTE_LENGTH = 2048;

    // Origin the bridge is allowed to talk to. Matches strings.xml/hostName - the
    // PWA's real host. Any other origin loaded into this WebView (an external
    // link the user tapped) gets the JS interface detached so that page cannot
    // call into native code, even though it shares the same WebView instance.
    private String mTrustedHost;
    private WebView mWebView;
    private AndroidBridge mBridge;
    private boolean mBridgeAttached = false;
    private BroadcastReceiver mApkDownloadReceiver = null;
    private String mPendingTagsJson = null;
    private long mPendingDelayMs = BlitzService.DEFAULT_PROFILE_LOAD_DELAY_MS;
    private boolean mAwaitingOverlayPermission = false;
    // Set when CM Dev is launched with BlitzService.EXTRA_REHEARSAL (APK/apk-dev.mjs start --rehearsal).
    private boolean mBlitzRehearsal = false;
    private FrameLayout mRootLayout;
    // What the PWA last said it is showing; null until it reports (see setThemeColors).
    private Boolean mPageDark = null;
    // Where the status bar, display cutout and navigation bar cover the page, in
    // pixels; read by the bridge's binder thread, so volatile.
    private volatile Insets mSafeArea = Insets.NONE;
    // Steps the page back; registered only while it can (see updateBackHandling).
    private final OnBackInvokedCallback mPageBack = () -> {
        if (mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
        }
    };
    private boolean mPageBackRegistered = false;

    private void registerApkDownloadReceiver(final long downloadId, final String filename, final String expectedSha256) {
        if (this.mApkDownloadReceiver != null) {
            try {
                unregisterReceiver(this.mApkDownloadReceiver);
            } catch (Exception ignored) {
            }
            this.mApkDownloadReceiver = null;
        }

        this.mApkDownloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;

                long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                if (completedId != downloadId) return;

                try {
                    MainActivity.this.unregisterReceiver(this);
                } catch (Exception ignored) {
                }
                MainActivity.this.mApkDownloadReceiver = null;
                MainActivity.this.openDownloadedApkInstaller(downloadId, filename, expectedSha256);
            }
        };

        // DownloadManager runs in another process, so its broadcast needs an exported receiver.
        registerReceiver(this.mApkDownloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_EXPORTED);
    }

    private String sha256ForDownload(DownloadManager dm, long downloadId) throws Exception {
        var digest = MessageDigest.getInstance("SHA-256");
        try (ParcelFileDescriptor descriptor = dm.openDownloadedFile(downloadId);
             FileInputStream inputStream = new FileInputStream(descriptor.getFileDescriptor())) {
            var buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                digest.update(buffer, 0, bytesRead);
            }
        }
        byte[] hash = digest.digest();
        var hex = new StringBuilder(hash.length * 2);
        for (byte value : hash) {
            hex.append(String.format("%02x", value));
        }
        return hex.toString();
    }

    private void openDownloadedApkInstaller(long downloadId, String filename, String expectedSha256) {
        var dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) {
            Toast.makeText(this, "Download finished, but installer could not open", Toast.LENGTH_LONG).show();
            return;
        }

        var query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = dm.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                Toast.makeText(this, "Download finished, but installer could not open", Toast.LENGTH_LONG).show();
                return;
            }

            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int status = statusIndex >= 0 ? cursor.getInt(statusIndex) : DownloadManager.STATUS_FAILED;
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                Toast.makeText(this, "APK download did not complete", Toast.LENGTH_LONG).show();
                return;
            }
        } catch (Exception e) {
            android.util.Log.w("ClashManagerMain", "Could not verify APK download status", e);
            Toast.makeText(this, "Download finished, but installer could not open", Toast.LENGTH_LONG).show();
            return;
        }

        Uri apkUri = dm.getUriForDownloadedFile(downloadId);
        if (apkUri == null) {
            Toast.makeText(this, "Download finished, but installer could not open", Toast.LENGTH_LONG).show();
            return;
        }

        if (expectedSha256 != null && expectedSha256.matches("(?i)^[a-f0-9]{64}$")) {
            try {
                String actualSha256 = sha256ForDownload(dm, downloadId);
                if (!expectedSha256.equalsIgnoreCase(actualSha256)) {
                    android.util.Log.w("ClashManagerMain", "APK SHA-256 mismatch for " + filename);
                    Toast.makeText(this, "APK verification failed -- download blocked", Toast.LENGTH_LONG).show();
                    return;
                }
            } catch (Exception e) {
                android.util.Log.w("ClashManagerMain", "Could not verify APK checksum for " + filename, e);
                Toast.makeText(this, "APK verification failed -- download blocked", Toast.LENGTH_LONG).show();
                return;
            }
        }

        try {
            var installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(installIntent);
            Toast.makeText(this, "Confirm Android installer to update Clash Manager", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            android.util.Log.w("ClashManagerMain", "Could not open installer for " + filename, e);
            Toast.makeText(this, "Download complete -- open " + filename + " from Downloads", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        // Logged so a restart can be told apart from a handled change: the manifest
        // declares rotation and dark mode as handled here, without recreating.
        android.util.Log.i("ClashManagerMain", "activity created" + (bundle != null ? " (recreated by the system)" : ""));
        mTrustedHost = getString(getResources().getIdentifier("hostName", "string", getPackageName()));
        mBlitzRehearsal = BlitzService.isRehearsal(this, getIntent());

        // Only ever true for a manifest explicitly marked android:debuggable="true"
        // (a local dev install) - the signed release manifest never sets that flag,
        // so this is a no-op in production and safe to leave unconditional.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // Edge to edge, as native apps draw: the page runs under see-through
        // status and navigation bars and any camera cutout, and keeps its own
        // content clear of them. Android 15+ enforces this; on Android 14 this
        // call and Theme.ClashManager do the same. WebView does not report the
        // bars through CSS env(safe-area-inset-*), so their size goes to the page
        // through getSafeAreaInsets(). Only the keyboard is handled here: the page
        // is lifted above it, because edge to edge Android no longer resizes the
        // window for it (adjustResize in the manifest makes it report the
        // keyboard's height instead of sliding the whole window up).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        var frameLayout = new FrameLayout(this);
        ViewCompat.setOnApplyWindowInsetsListener(frameLayout, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            int keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            view.setPadding(0, 0, 0, keyboard);
            // The keyboard already covers the navigation bar, so the page need not clear it.
            Insets area = keyboard > 0 ? Insets.of(bars.left, bars.top, bars.right, 0) : bars;
            if (!area.equals(mSafeArea)) {
                mSafeArea = area;
                notifyPageOfSafeArea();
            }
            return WindowInsetsCompat.CONSUMED;
        });

        // Back is handled by updateBackHandling(), registered against the dispatcher
        // only while the page has history to go back through.

        this.mRootLayout = frameLayout;
        setContentView(frameLayout);
        applySystemBarAppearance();
        initWebView();
    }

    @Override
    protected void onDestroy() {
        if (this.mApkDownloadReceiver != null) {
            try {
                unregisterReceiver(this.mApkDownloadReceiver);
            } catch (Exception ignored) {
            }
            this.mApkDownloadReceiver = null;
        }
        super.onDestroy();
    }

    /**
     * Builds and attaches a fresh WebView with the full settings/client/bridge setup, then
     * loads the PWA. Split out from onCreate so onRenderProcessGone can rebuild the WebView
     * in place after the renderer crashes, instead of the whole app going down with it.
     */
    private void initWebView() {
        var webView = new WebView(this);
        this.mWebView = webView;
        this.mWebView.setHapticFeedbackEnabled(true);
        // Transparent until the PWA paints, so the window background shows rather
        // than WebView's default white flash in dark mode.
        this.mWebView.setBackgroundColor(Color.TRANSPARENT);
        this.mRootLayout.addView(webView);

        WebSettings settings = this.mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setSaveFormData(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setOffscreenPreRaster(true);
        settings.setSafeBrowsingEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        // The manifest already forbids cleartext traffic app-wide; ALWAYS_ALLOW here
        // actively fought that by letting an https page embed http subresources.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setUserAgentString(settings.getUserAgentString() + " ClashManagerAndroidWrapper");

        if (this.mBridge == null) {
            this.mBridge = new AndroidBridge();
        }
        this.mWebView.addJavascriptInterface(this.mBridge, "AndroidBridge");
        this.mBridgeAttached = true;

        this.mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("clashroyale://") || url.startsWith("intent://") || !isTrustedOrigin(url)) {
                    launchExternalIntent(url);
                    return true;
                }
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                // Detach the native bridge the instant the WebView navigates off the
                // PWA's own origin (an external https link opened in-place). It is
                // re-attached only once navigation returns to the trusted origin, so a
                // third-party page loaded in this WebView can never reach AndroidBridge.
                boolean trusted = isTrustedOrigin(url);
                if (trusted && !mBridgeAttached) {
                    view.addJavascriptInterface(mBridge, "AndroidBridge");
                    mBridgeAttached = true;
                } else if (!trusted && mBridgeAttached) {
                    view.removeJavascriptInterface("AndroidBridge");
                    mBridgeAttached = false;
                }
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                super.doUpdateVisitedHistory(view, url, isReload);
                // Fires for the PWA's in-page navigations too (history.pushState).
                if (view == mWebView) {
                    updateBackHandling();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // An inset change that arrived before this page committed found no
                // trusted page to tell (notifyPageOfSafeArea checks the URL) and is
                // not sent again, so the page is told once it is there.
                if (view == mWebView) {
                    notifyPageOfSafeArea();
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                Toast.makeText(MainActivity.this, "Load failed: " + description + "\nURL: " + failingUrl, Toast.LENGTH_LONG).show();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // WebView's contract (since API 26): if this isn't overridden, an unhandled
                // renderer crash takes the whole host app down with it. The renderer crash
                // itself lives in the platform's WebView, out of our control - but whether
                // it kills this app is entirely up to us, so rebuild the WebView instead.
                android.util.Log.w("ClashManagerMain", "WebView renderer process gone (didCrash="
                    + detail.didCrash() + "); rebuilding WebView instead of losing the app");
                if (view != mWebView) {
                    // Stale callback from a WebView already replaced by an earlier recovery.
                    return true;
                }
                mRootLayout.removeView(mWebView);
                mWebView.destroy();
                initWebView();
                // The fresh WebView has no history to go back through yet.
                updateBackHandling();
                return true;
            }
        });

        this.mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                String extra = view.getHitTestResult().getExtra();
                if (extra != null && (extra.startsWith("intent://") || extra.startsWith("clashroyale://") || extra.startsWith("http://") || extra.startsWith("https://"))) {
                    launchExternalIntent(extra);
                    return false;
                }

                // A window the page opens by script (window.open without a
                // clickable link) is handed a throwaway WebView whose first
                // navigation is sent out as an external intent.
                var popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popupView, String url) {
                        launchExternalIntent(url);
                        return true;
                    }
                });
                ((WebView.WebViewTransport) resultMsg.obj).setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });

        String requested = launchTarget(getIntent());
        this.mWebView.loadUrl(requested != null ? requested : launchUrl());
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        android.util.Log.i("ClashManagerMain", "configuration handled in place: orientation " + newConfig.orientation
            + ", night " + ((newConfig.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES));
        applySystemBarAppearance();
    }

    /**
     * Status and navigation bar icons that contrast with what is behind them: the
     * page's own theme once the PWA has reported it, the phone's until then.
     */
    private void applySystemBarAppearance() {
        boolean dark = mPageDark != null
            ? mPageDark
            : (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        var controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (BlitzService.isRehearsal(this, intent)) {
            mBlitzRehearsal = true;
        }
        // singleTask: a shortcut, link or share reaching the running app arrives
        // here. A plain launcher tap names no page and leaves the user where they were.
        String requested = launchTarget(intent);
        if (requested != null && mWebView != null) {
            mWebView.loadUrl(requested);
        }
    }

    /**
     * Registers the page's Back handler only while the page can go back. At the
     * start of its history Back then reaches Android, which plays its
     * back-to-home animation and keeps the app in memory, so it reopens where it
     * was. Always handling Back here meant calling finish() at the start screen,
     * which discarded the page and reloaded it on the next launch.
     */
    private void updateBackHandling() {
        boolean pageCanGoBack = mWebView != null && mWebView.canGoBack();
        if (pageCanGoBack == mPageBackRegistered) return;
        if (pageCanGoBack) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, mPageBack);
        } else {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(mPageBack);
        }
        mPageBackRegistered = pageCanGoBack;
    }

    /**
     * Tells a page already running that the bars changed size (rotation, the
     * keyboard, a switch of navigation mode), so it reads getSafeAreaInsets()
     * again. Pages from other origins are left alone.
     */
    private void notifyPageOfSafeArea() {
        if (mWebView != null && isTrustedOrigin(mWebView.getUrl())) {
            mWebView.evaluateJavascript("window.dispatchEvent(new Event('shellinsetschange'))", null);
        }
    }

    private String launchUrl() {
        return getString(getResources().getIdentifier("launchUrl", "string", getPackageName()));
    }

    /**
     * The page a launch asks for, as a URL inside this app's own PWA, or null
     * when it names none.
     *
     * Launcher shortcuts, links into the PWA, web+clash and clash-manager links
     * and the share sheet each name a page, and each used to be dropped: every
     * one of them opened the roster. The intent only ever chooses the route (the
     * part after #); the origin always comes from this build's own launch URL,
     * so a link can never point the bridge-carrying WebView at another site, and
     * the dev build's shortcuts open the dev build's PWA. The mappings mirror the
     * PWA's web manifest: share_target and protocol_handlers both land on
     * #/headhunter with the same parameter names.
     */
    private String launchTarget(Intent intent) {
        if (intent == null) return null;
        String route = null;
        Uri data = intent.getData();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && !text.trim().isEmpty()) {
                String title = intent.getStringExtra(Intent.EXTRA_SUBJECT);
                route = "/headhunter?text=" + Uri.encode(text) + (title == null ? "" : "&title=" + Uri.encode(title));
            }
        } else if (data != null) {
            String scheme = data.getScheme();
            if ("https".equals(scheme) || "http".equals(scheme)) {
                route = data.getEncodedFragment();
            } else if ("web+clash".equals(scheme)) {
                route = "/headhunter?query=" + Uri.encode(data.toString());
            } else if ("clash-manager".equals(scheme)) {
                route = "/" + (data.getHost() == null ? "" : data.getHost()) + (data.getPath() == null ? "" : data.getPath());
            }
        }
        if (route == null || !route.startsWith("/") || route.length() > MAX_LAUNCH_ROUTE_LENGTH) return null;
        String launchUrl = launchUrl();
        int hash = launchUrl.indexOf('#');
        return (hash >= 0 ? launchUrl.substring(0, hash) : launchUrl) + "#" + route;
    }

    /**
     * Why Blitz cannot tap. Android lists the service as switched on and still
     * leaves it unbound after the app was force-stopped, until the user toggles
     * it; "turn it on" would then point them at a switch that is already on.
     */
    private String accessibilityHint() {
        var component = new ComponentName(this, ClashManagerAccessibilityService.class);
        String label;
        try {
            label = getPackageManager().getServiceInfo(component, 0).loadLabel(getPackageManager()).toString();
        } catch (Exception e) {
            label = "Clash Manager Blitz";
        }
        String enabled = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        boolean switchedOn = false;
        if (enabled != null) {
            for (String entry : enabled.split(":")) {
                if (component.equals(ComponentName.unflattenFromString(entry))) {
                    switchedOn = true;
                    break;
                }
            }
        }
        return switchedOn
            ? "\"" + label + "\" is on but not connected. Turn it off and on again in Accessibility settings so Blitz can tap."
            : "Turn on \"" + label + "\" in Accessibility settings so Blitz can tap Invite.";
    }

    /** True when the URL's host is the PWA's own origin (safe to keep the bridge attached for). */
    private boolean isTrustedOrigin(String url) {
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            if (!"https".equals(scheme) && !"http".equals(scheme)) {
                // Non-web schemes (about:, data:, blob:) never carry the bridge origin.
                return "about:blank".equals(url);
            }
            return mTrustedHost.equalsIgnoreCase(uri.getHost());
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Launches a page-supplied URL/intent-URI as a standalone Android intent instead of
     * inside this WebView. `setSelector(null)` blocks the intent-scheme "selector"
     * confusion trick a hostile page could otherwise use to redirect an explicit intent
     * at an arbitrary component.
     */
    private void launchExternalIntent(String url) {
        try {
            Intent intent;
            if (url.startsWith("intent://")) {
                intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            android.util.Log.w("ClashManagerMain", "Could not launch external intent for: " + url, e);
            Toast.makeText(this, "Could not open link", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (this.mAwaitingOverlayPermission) {
            this.mAwaitingOverlayPermission = false;
            if (Settings.canDrawOverlays(this)) {
                String pendingTags = this.mPendingTagsJson;
                if (pendingTags != null) {
                    startBlitzService(pendingTags, this.mPendingDelayMs);
                    this.mPendingTagsJson = null;
                }
            } else {
                Toast.makeText(this, "Overlay permission is required for autonomous Blitz Mode", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private void startBlitzService(String tagsJson, long delayMs) {
        var intent = new Intent(this, BlitzService.class);
        intent.putExtra("tags", tagsJson);
        intent.putExtra("delayMs", delayMs);
        if (mBlitzRehearsal) {
            intent.putExtra(BlitzService.EXTRA_REHEARSAL, true);
        }
        try {
            startForegroundService(intent);
        } catch (android.app.ForegroundServiceStartNotAllowedException e) {
            // Android only lets an app start a foreground service while it is in
            // front. Uncaught, this refusal used to take the whole app down.
            android.util.Log.w("ClashManagerMain", "Blitz could not start: app not in the foreground", e);
            Toast.makeText(this, "Blitz could not start. Open Clash Manager and try again.", Toast.LENGTH_LONG).show();
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public boolean isAndroidWrapper() {
            return true;
        }

        @JavascriptInterface
        public String getAppVersionName() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                android.util.Log.w("ClashManagerMain", "getAppVersionName failed", e);
                return "";
            }
        }

        @JavascriptInterface
        public int getAppVersionCode() {
            try {
                var packageInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                return (int) Math.min(packageInfo.getLongVersionCode(), Integer.MAX_VALUE);
            } catch (Exception e) {
                android.util.Log.w("ClashManagerMain", "getAppVersionCode failed", e);
                return 0;
            }
        }

        @JavascriptInterface
        public int getBuildNumber() {
            try {
                int buildNumberId = getResources().getIdentifier("buildNumber", "string", getPackageName());
                return Integer.parseInt(getString(buildNumberId));
            } catch (Exception e) {
                android.util.Log.w("ClashManagerMain", "getBuildNumber failed", e);
                return 0;
            }
        }

        @JavascriptInterface
        public void openExternalUrl(String url) {
            runOnUiThread(() -> {
                Uri parsed = Uri.parse(url);
                String scheme = parsed.getScheme();
                if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
                    android.util.Log.w("ClashManagerMain", "openExternalUrl rejected non-http(s) scheme: " + scheme);
                    return;
                }
                try {
                    var intent = new Intent(Intent.ACTION_VIEW, parsed);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    android.util.Log.w("ClashManagerMain", "Could not open URL: " + url, e);
                    Toast.makeText(MainActivity.this, "Could not open URL", Toast.LENGTH_SHORT).show();
                }
            });
        }

        /**
         * Downloads an APK file directly using the Android DownloadManager.
         *
         * Unlike openExternalUrl (which fires ACTION_VIEW and hands the URL to a
         * browser), this method enqueues the download through the system
         * DownloadManager so the binary is fetched natively and saved to the
         * public Downloads folder. The system shows a download progress
         * notification automatically. Once complete, the wrapper opens Android's
         * package installer so the user can confirm the in-place update.
         *
         * @param url      Direct HTTPS URL to the APK file.
         * @param filename Suggested filename to save under in Downloads.
         */
        @JavascriptInterface
        public boolean downloadApkFile(String url, String filename) {
            return downloadApkFile(url, filename, null);
        }

        @JavascriptInterface
        public boolean downloadApkFile(String url, String filename, String expectedSha256) {
            Uri parsed = Uri.parse(url);
            String scheme = parsed.getScheme();
            if (!"https".equalsIgnoreCase(scheme)) {
                android.util.Log.w("ClashManagerMain", "downloadApkFile rejected non-https scheme: " + scheme);
                return false;
            }
            if (filename == null || filename.length() > MAX_APK_FILENAME_LENGTH || !filename.matches("clashmanager-v\\d+\\.\\d+\\.\\d+\\+\\d+\\.apk")) {
                android.util.Log.w("ClashManagerMain", "downloadApkFile rejected invalid filename");
                return false;
            }
            runOnUiThread(() -> {
                try {
                    var request = new DownloadManager.Request(parsed);
                    request.setTitle("Clash Manager Update");
                    request.setDescription("Downloading " + filename);
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, filename);
                    request.setMimeType("application/vnd.android.package-archive");
                    request.addRequestHeader("User-Agent", "ClashManager-Android");
                    var dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    long downloadId = dm.enqueue(request);
                    registerApkDownloadReceiver(downloadId, filename, expectedSha256);
                    Toast.makeText(MainActivity.this, "Download started -- installer opens when ready", Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    android.util.Log.e("ClashManagerMain", "downloadApkFile failed: " + url, e);
                    Toast.makeText(MainActivity.this, "Download failed -- check your connection", Toast.LENGTH_SHORT).show();
                }
            });
            return true;
        }

        @JavascriptInterface
        public void openPlayerProfile(String tag) {
            runOnUiThread(() -> {
                try {
                    String safeTag = tag == null ? "" : tag.replaceAll("[^0289CGJLPQRUVY]", "");
                    if (safeTag.isEmpty()) {
                        android.util.Log.w("ClashManagerMain", "openPlayerProfile rejected invalid tag");
                        return;
                    }
                    var intent = Intent.parseUri("intent://playerInfo?id=" + Uri.encode(safeTag) + "#Intent;scheme=clashroyale;package=com.supercell.clashroyale;end", Intent.URI_INTENT_SCHEME);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                    Toast.makeText(MainActivity.this, "Could not open Clash Royale - is it installed?", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public boolean hasOverlayPermission() {
            return Settings.canDrawOverlays(MainActivity.this);
        }

        @JavascriptInterface
        public boolean canRequestPackageInstalls() {
            return getPackageManager().canRequestPackageInstalls();
        }

        @JavascriptInterface
        public void openPackageInstallSettings() {
            runOnUiThread(() -> {
                try {
                    var intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    android.util.Log.w("ClashManagerMain", "Could not open package install settings", e);
                    Toast.makeText(MainActivity.this, "Could not open install settings", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void openOverlaySettings() {
            runOnUiThread(() -> {
                try {
                    openOverlayPermissionScreen();
                } catch (Exception e) {
                    android.util.Log.w("ClashManagerMain", "Could not open overlay settings", e);
                    Toast.makeText(MainActivity.this, "Could not open overlay settings", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void startBlitz(String tagsJson, long delayMs) {
            runOnUiThread(() -> {
                if (Settings.canDrawOverlays(MainActivity.this)) {
                    if (!ClashManagerAccessibilityService.isActive()) {
                        Toast.makeText(MainActivity.this, accessibilityHint(), Toast.LENGTH_LONG).show();
                    }
                    startBlitzService(tagsJson, delayMs);
                    return;
                }
                mPendingTagsJson = tagsJson;
                mPendingDelayMs = delayMs;
                mAwaitingOverlayPermission = true;
                Toast.makeText(MainActivity.this, "Grant 'Display over other apps' for Clash Manager, then return here", Toast.LENGTH_LONG).show();
                try {
                    openOverlayPermissionScreen();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Please grant 'Display over other apps' in system settings", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void saveCoordinates(float inviteX, float inviteY, float closeX, float closeY) {
            new Calibration(inviteX, inviteY, closeX, closeY).save(MainActivity.this, false);
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "Coordinates updated successfully", Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public String getCoordinates() {
            return Calibration.load(MainActivity.this).toJson();
        }

        /**
         * The PWA reports the background it is showing whenever its theme resolves
         * or changes. The page itself paints behind the status and navigation
         * bars; this layout takes the same colour for the space the keyboard
         * opens below the page, and the bar icons are picked to contrast with it.
         * The window background from the theme only covers the moment before the
         * page has painted: it follows the phone, while the page follows the
         * app's own theme setting.
         */
        @JavascriptInterface
        public void setThemeColors(String background, boolean dark) {
            int color;
            try {
                color = Color.parseColor(background);
            } catch (Exception e) {
                android.util.Log.w("ClashManagerMain", "setThemeColors rejected colour: " + background);
                return;
            }
            runOnUiThread(() -> {
                mPageDark = dark;
                mRootLayout.setBackgroundColor(color);
                applySystemBarAppearance();
            });
        }

        /**
         * Where the status bar, display cutout and navigation bar cover the page,
         * in CSS pixels: {"top":..,"right":..,"bottom":..,"left":..}. The page
         * reads it before its first paint and again on "resize" and
         * "shellinsetschange"; see BOOT_INSETS_SCRIPT in the PWA.
         */
        @JavascriptInterface
        public String getSafeAreaInsets() {
            Insets area = mSafeArea;
            float density = getResources().getDisplayMetrics().density;
            return "{\"top\":" + area.top / density + ",\"right\":" + area.right / density
                + ",\"bottom\":" + area.bottom / density + ",\"left\":" + area.left / density + "}";
        }

        /** The last Blitz run as JSON (see BlitzRun), or an empty string when Blitz has never run. */
        @JavascriptInterface
        public String getLastBlitzRun() {
            return BlitzRun.lastJson(MainActivity.this);
        }

        @JavascriptInterface
        public boolean isAccessibilityActive() {
            return ClashManagerAccessibilityService.isActive();
        }

        @JavascriptInterface
        public void openAccessibilitySettings() {
            runOnUiThread(() -> {
                try {
                    var intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                    Toast.makeText(MainActivity.this, "Could not open Accessibility Settings", Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    /**
     * Opens this app's own "Display over other apps" screen, falling back to the
     * system-wide list on the few builds that reject the per-package form.
     * Shared by openOverlaySettings and the startBlitz permission prompt, which
     * each carried their own copy of this.
     */
    private void openOverlayPermissionScreen() {
        try {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
        } catch (Exception perPackageRejected) {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
        }
    }
}

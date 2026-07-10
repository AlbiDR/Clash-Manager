package com.albidr.clashmanager;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;

/* JADX INFO: loaded from: /Users/ADR/Documents/Github/Projects/clash-manager/APK/android/classes.dex */
public class MainActivity extends Activity {
    private WebView mWebView;
    private String mPendingTagsJson = null;
    private boolean mAwaitingOverlayPermission = false;

    @Override // android.app.Activity
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        if (Build.VERSION.SDK_INT >= 29) {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        }
        getWindow().setStatusBarColor(Color.parseColor("#0B0E14"));
        getWindow().setNavigationBarColor(ViewCompat.MEASURED_STATE_MASK);
        FrameLayout frameLayout = new FrameLayout(this);
        frameLayout.setFitsSystemWindows(true);
        frameLayout.setBackgroundColor(Color.parseColor("#0B0E14"));
        WebView webView = new WebView(this);
        this.mWebView = webView;
        frameLayout.addView(webView);
        setContentView(frameLayout);
        WebSettings settings = this.mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMixedContentMode(0);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setUserAgentString(settings.getUserAgentString() + " ClashManagerAndroidWrapper");
        this.mWebView.setWebViewClient(new WebViewClient() { // from class: com.albidr.clashmanager.MainActivity.1
            @Override // android.webkit.WebViewClient
            public boolean shouldOverrideUrlLoading(WebView webView2, String str) {
                if (!str.startsWith("clashroyale://") && !str.startsWith("intent://")) {
                    return false;
                }
                try {
                    Intent uri = Intent.parseUri(str, 1);
                    if (uri != null) {
                        webView2.getContext().startActivity(uri);
                        return true;
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
                return true;
            }

            @Override // android.webkit.WebViewClient
            public void onReceivedError(WebView webView2, int i, String str, String str2) {
                super.onReceivedError(webView2, i, str, str2);
                Toast.makeText(MainActivity.this, "Load failed: " + str + "\nURL: " + str2, 1).show();
            }
        });
        this.mWebView.setWebChromeClient(new WebChromeClient() { // from class: com.albidr.clashmanager.MainActivity.2
            @Override // android.webkit.WebChromeClient
            public boolean onCreateWindow(WebView webView2, boolean z, boolean z2, Message message) {
                Intent intent;
                String extra = webView2.getHitTestResult().getExtra();
                if (extra != null && (extra.startsWith("intent://") || extra.startsWith("clashroyale://") || extra.startsWith("http://") || extra.startsWith("https://"))) {
                    try {
                        if (extra.startsWith("intent://")) {
                            intent = Intent.parseUri(extra, 1);
                        } else {
                            intent = new Intent("android.intent.action.VIEW", Uri.parse(extra));
                        }
                        intent.addFlags(268435456);
                        MainActivity.this.startActivity(intent);
                        return false;
                    } catch (Exception e) {
                        e.printStackTrace();
                        return false;
                    }
                }
                WebView webView3 = new WebView(MainActivity.this);
                webView3.setWebViewClient(new WebViewClient() { // from class: com.albidr.clashmanager.MainActivity.2.1
                    @Override // android.webkit.WebViewClient
                    public boolean shouldOverrideUrlLoading(WebView webView4, String str) {
                        Intent intent2;
                        try {
                            if (str.startsWith("intent://")) {
                                intent2 = Intent.parseUri(str, 1);
                            } else {
                                intent2 = new Intent("android.intent.action.VIEW", Uri.parse(str));
                            }
                            intent2.addFlags(268435456);
                            MainActivity.this.startActivity(intent2);
                        } catch (Exception e2) {
                            e2.printStackTrace();
                        }
                        return true;
                    }
                });
                ((WebView.WebViewTransport) message.obj).setWebView(webView3);
                message.sendToTarget();
                return true;
            }
        });
        this.mWebView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        this.mWebView.loadUrl(getString(R.string.launchUrl));
    }

    @Override // android.app.Activity
    protected void onResume() {
        super.onResume();
        if (this.mAwaitingOverlayPermission) {
            this.mAwaitingOverlayPermission = false;
            if (Build.VERSION.SDK_INT >= 23 && Settings.canDrawOverlays(this)) {
                String str = this.mPendingTagsJson;
                if (str != null) {
                    startBlitzService(str);
                    this.mPendingTagsJson = null;
                    return;
                }
                return;
            }
            Toast.makeText(this, "Overlay permission is required for autonomous Blitz Mode", 0).show();
        }
    }

    @Override // android.app.Activity
    public void onBackPressed() {
        if (this.mWebView.canGoBack()) {
            this.mWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /* JADX INFO: Access modifiers changed from: private */
    public void startBlitzService(String str) {
        Intent intent = new Intent(this, (Class<?>) BlitzService.class);
        intent.putExtra("tags", str);
        if (Build.VERSION.SDK_INT >= 26) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public boolean isAndroidWrapper() {
            return true;
        }

        public AndroidBridge() {
        }

        @JavascriptInterface
        public void openExternalUrl(final String str) {
            MainActivity.this.runOnUiThread(new Runnable() { // from class: com.albidr.clashmanager.MainActivity$AndroidBridge$$ExternalSyntheticLambda1
                @Override // java.lang.Runnable
                public final void run() {
                    this.f$0.m221x5f20ce62(str);
                }
            });
        }

        /* JADX INFO: renamed from: lambda$openExternalUrl$0$com-clashmanager-MainActivity$AndroidBridge, reason: not valid java name */
        /* synthetic */ void m221x5f20ce62(String str) {
            try {
                Intent intent = new Intent("android.intent.action.VIEW", Uri.parse(str));
                intent.addFlags(268435456);
                MainActivity.this.startActivity(intent);
            } catch (Exception e) {
                e.printStackTrace();
                Toast.makeText(MainActivity.this, "Could not open URL", 0).show();
            }
        }

        @JavascriptInterface
        public void openPlayerProfile(final String str) {
            MainActivity.this.runOnUiThread(new Runnable() { // from class: com.albidr.clashmanager.MainActivity$AndroidBridge$$ExternalSyntheticLambda2
                @Override // java.lang.Runnable
                public final void run() {
                    this.f$0.m222x2d90fd87(str);
                }
            });
        }

        /* JADX INFO: renamed from: lambda$openPlayerProfile$1$com-clashmanager-MainActivity$AndroidBridge, reason: not valid java name */
        /* synthetic */ void m222x2d90fd87(String str) {
            try {
                Intent uri = Intent.parseUri("intent://playerInfo?id=" + str + "#Intent;scheme=clashroyale;package=com.supercell.clashroyale;end", 1);
                uri.addFlags(268435456);
                MainActivity.this.startActivity(uri);
            } catch (Exception e) {
                e.printStackTrace();
                Toast.makeText(MainActivity.this, "Could not open Clash Royale - is it installed?", 0).show();
            }
        }

        @JavascriptInterface
        public boolean hasOverlayPermission() {
            if (Build.VERSION.SDK_INT >= 23) {
                return Settings.canDrawOverlays(MainActivity.this);
            }
            return true;
        }

        @JavascriptInterface
        public void startBlitz(final String str) {
            MainActivity.this.runOnUiThread(new Runnable() { // from class: com.albidr.clashmanager.MainActivity$AndroidBridge$$ExternalSyntheticLambda3
                @Override // java.lang.Runnable
                public final void run() {
                    this.f$0.m224lambda$startBlitz$2$comclashmanagerMainActivity$AndroidBridge(str);
                }
            });
        }

        /* JADX INFO: renamed from: lambda$startBlitz$2$com-clashmanager-MainActivity$AndroidBridge, reason: not valid java name */
        /* synthetic */ void m224lambda$startBlitz$2$comclashmanagerMainActivity$AndroidBridge(String str) {
            if (Build.VERSION.SDK_INT >= 23 ? Settings.canDrawOverlays(MainActivity.this) : true) {
                if (!ClashManagerAccessibilityService.isActive()) {
                    Toast.makeText(MainActivity.this, "Tip: Enable Clash Manager in Accessibility Settings for automatic invites", 1).show();
                }
                MainActivity.this.startBlitzService(str);
                return;
            }
            MainActivity.this.mPendingTagsJson = str;
            MainActivity.this.mAwaitingOverlayPermission = true;
            Toast.makeText(MainActivity.this, "Grant 'Display over other apps' for Clash Manager, then return here", 1).show();
            try {
                try {
                    MainActivity.this.startActivity(new Intent("android.settings.action.MANAGE_OVERLAY_PERMISSION", Uri.parse("package:" + MainActivity.this.getPackageName())));
                } catch (Exception unused) {
                    MainActivity.this.startActivity(new Intent("android.settings.action.MANAGE_OVERLAY_PERMISSION"));
                }
            } catch (Exception unused2) {
                Toast.makeText(MainActivity.this, "Please grant 'Display over other apps' in system settings", 1).show();
            }
        }

        @JavascriptInterface
        public void saveCoordinates(float f, float f2, float f3, float f4) {
            MainActivity.this.getSharedPreferences("blitz_prefs", 0).edit().putFloat("invite_x", f).putFloat("invite_y", f2).putFloat("close_x", f3).putFloat("close_y", f4).apply();
            MainActivity.this.runOnUiThread(new Runnable() { // from class: com.albidr.clashmanager.MainActivity$AndroidBridge$$ExternalSyntheticLambda0
                @Override // java.lang.Runnable
                public final void run() {
                    this.f$0.m223xbb185e29();
                }
            });
        }

        /* JADX INFO: renamed from: lambda$saveCoordinates$3$com-clashmanager-MainActivity$AndroidBridge, reason: not valid java name */
        /* synthetic */ void m223xbb185e29() {
            Toast.makeText(MainActivity.this, "Coordinates updated successfully", 0).show();
        }

        @JavascriptInterface
        public String getCoordinates() {
            return "{\"inviteX\":" + MainActivity.this.getSharedPreferences("blitz_prefs", 0).getFloat("invite_x", 0.5083f) + ",\"inviteY\":" + MainActivity.this.getSharedPreferences("blitz_prefs", 0).getFloat("invite_y", 0.7214f) + ",\"closeX\":" + MainActivity.this.getSharedPreferences("blitz_prefs", 0).getFloat("close_x", 0.9213f) + ",\"closeY\":" + MainActivity.this.getSharedPreferences("blitz_prefs", 0).getFloat("close_y", 0.2044f) + "}";
        }

        @JavascriptInterface
        public boolean isAccessibilityActive() {
            return ClashManagerAccessibilityService.isActive();
        }

        @JavascriptInterface
        public void openAccessibilitySettings() {
            MainActivity.this.runOnUiThread(new Runnable() { // from class: com.albidr.clashmanager.MainActivity$AndroidBridge$$ExternalSyntheticLambda4
                @Override // java.lang.Runnable
                public final void run() {
                    this.f$0.m220xf7ee1053();
                }
            });
        }

        /* JADX INFO: renamed from: lambda$openAccessibilitySettings$4$com-clashmanager-MainActivity$AndroidBridge, reason: not valid java name */
        /* synthetic */ void m220xf7ee1053() {
            try {
                Intent intent = new Intent("android.settings.ACCESSIBILITY_SETTINGS");
                intent.addFlags(268435456);
                MainActivity.this.startActivity(intent);
            } catch (Exception e) {
                e.printStackTrace();
                Toast.makeText(MainActivity.this, "Could not open Accessibility Settings", 0).show();
            }
        }
    }
}

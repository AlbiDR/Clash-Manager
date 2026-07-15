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

public class MainActivity extends Activity {
    private WebView mWebView;
    private String mPendingTagsJson = null;
    private boolean mAwaitingOverlayPermission = false;

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        if (Build.VERSION.SDK_INT >= 29) {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        }
        getWindow().setStatusBarColor(Color.parseColor("#0b0e14"));
        getWindow().setNavigationBarColor(Color.parseColor("#0b0e14"));
        
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
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);
        if (Build.VERSION.SDK_INT >= 23) {
            settings.setOffscreenPreRaster(true);
        }
        if (Build.VERSION.SDK_INT >= 26) {
            settings.setSafeBrowsingEnabled(false);
        }
        settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setUserAgentString(settings.getUserAgentString() + " ClashManagerAndroidWrapper");
        
        this.mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView webView2, String str) {
                if (!str.startsWith("clashroyale://") && !str.startsWith("intent://")) {
                    return false;
                }
                try {
                    Intent uri = Intent.parseUri(str, Intent.URI_INTENT_SCHEME);
                    if (uri != null) {
                        webView2.getContext().startActivity(uri);
                        return true;
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView webView2, int i, String str, String str2) {
                super.onReceivedError(webView2, i, str, str2);
                Toast.makeText(MainActivity.this, "Load failed: " + str + "\nURL: " + str2, Toast.LENGTH_LONG).show();
            }
        });
        
        this.mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView webView2, boolean z, boolean z2, Message message) {
                Intent intent;
                String extra = webView2.getHitTestResult().getExtra();
                if (extra != null && (extra.startsWith("intent://") || extra.startsWith("clashroyale://") || extra.startsWith("http://") || extra.startsWith("https://"))) {
                    try {
                        if (extra.startsWith("intent://")) {
                            intent = Intent.parseUri(extra, Intent.URI_INTENT_SCHEME);
                        } else {
                            intent = new Intent(Intent.ACTION_VIEW, Uri.parse(extra));
                        }
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        MainActivity.this.startActivity(intent);
                        return false;
                    } catch (Exception e) {
                        e.printStackTrace();
                        return false;
                    }
                }
                
                WebView webView3 = new WebView(MainActivity.this);
                webView3.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView webView4, String str) {
                        Intent intent2;
                        try {
                            if (str.startsWith("intent://")) {
                                intent2 = Intent.parseUri(str, Intent.URI_INTENT_SCHEME);
                            } else {
                                intent2 = new Intent(Intent.ACTION_VIEW, Uri.parse(str));
                            }
                            intent2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
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
        this.mWebView.loadUrl(getString(getResources().getIdentifier("launchUrl", "string", getPackageName())));
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (this.mAwaitingOverlayPermission) {
            this.mAwaitingOverlayPermission = false;
            if (Build.VERSION.SDK_INT >= 23 && Settings.canDrawOverlays(this)) {
                String str = this.mPendingTagsJson;
                if (str != null) {
                    startBlitzService(str);
                    this.mPendingTagsJson = null;
                }
            } else {
                Toast.makeText(this, "Overlay permission is required for autonomous Blitz Mode", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (this.mWebView.canGoBack()) {
            this.mWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private void startBlitzService(String str) {
        Intent intent = new Intent(this, BlitzService.class);
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

        @JavascriptInterface
        public void openExternalUrl(final String url) {
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        MainActivity.this.startActivity(intent);
                    } catch (Exception e) {
                        e.printStackTrace();
                        Toast.makeText(MainActivity.this, "Could not open URL", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void openPlayerProfile(final String tag) {
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent uri = Intent.parseUri("intent://playerInfo?id=" + tag + "#Intent;scheme=clashroyale;package=com.supercell.clashroyale;end", Intent.URI_INTENT_SCHEME);
                        uri.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        MainActivity.this.startActivity(uri);
                    } catch (Exception e) {
                        e.printStackTrace();
                        Toast.makeText(MainActivity.this, "Could not open Clash Royale - is it installed?", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean hasOverlayPermission() {
            if (Build.VERSION.SDK_INT >= 23) {
                return Settings.canDrawOverlays(MainActivity.this);
            }
            return true;
        }

        @JavascriptInterface
        public void startBlitz(final String tagsJson) {
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    boolean overlaysAllowed = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(MainActivity.this);
                    if (overlaysAllowed) {
                        if (!ClashManagerAccessibilityService.isActive()) {
                            Toast.makeText(MainActivity.this, "Tip: Enable Clash Manager in Accessibility Settings for automatic invites", Toast.LENGTH_LONG).show();
                        }
                        MainActivity.this.startBlitzService(tagsJson);
                        return;
                    }
                    MainActivity.this.mPendingTagsJson = tagsJson;
                    MainActivity.this.mAwaitingOverlayPermission = true;
                    Toast.makeText(MainActivity.this, "Grant 'Display over other apps' for Clash Manager, then return here", Toast.LENGTH_LONG).show();
                    try {
                        try {
                            MainActivity.this.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + MainActivity.this.getPackageName())));
                        } catch (Exception unused) {
                            MainActivity.this.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
                        }
                    } catch (Exception unused2) {
                        Toast.makeText(MainActivity.this, "Please grant 'Display over other apps' in system settings", Toast.LENGTH_LONG).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void saveCoordinates(final float inviteX, final float inviteY, final float closeX, final float closeY) {
            MainActivity.this.getSharedPreferences("blitz_prefs", 0).edit()
                .putFloat("invite_x", inviteX)
                .putFloat("invite_y", inviteY)
                .putFloat("close_x", closeX)
                .putFloat("close_y", closeY)
                .apply();
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, "Coordinates updated successfully", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public String getCoordinates() {
            return "{\"inviteX\":" + MainActivity.this.getSharedPreferences("blitz_prefs", 0).getFloat("invite_x", 0.5083f) 
                + ",\"inviteY\":" + MainActivity.this.getSharedPreferences("blitz_prefs", 0).getFloat("invite_y", 0.7214f) 
                + ",\"closeX\":" + MainActivity.this.getSharedPreferences("blitz_prefs", 0).getFloat("close_x", 0.9213f) 
                + ",\"closeY\":" + MainActivity.this.getSharedPreferences("blitz_prefs", 0).getFloat("close_y", 0.2044f) + "}";
        }

        @JavascriptInterface
        public boolean isAccessibilityActive() {
            return ClashManagerAccessibilityService.isActive();
        }

        @JavascriptInterface
        public void openAccessibilitySettings() {
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        MainActivity.this.startActivity(intent);
                    } catch (Exception e) {
                        e.printStackTrace();
                        Toast.makeText(MainActivity.this, "Could not open Accessibility Settings", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }
    }
}

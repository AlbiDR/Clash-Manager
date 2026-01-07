# ---------------------------------------------------------------------------------------
# TAURI ANDROID RELEASE RULES
# ---------------------------------------------------------------------------------------
# Critical: Keep Tauri's internal classes. Rust accesses these via JNI strings.
# If these are renamed/stripped, the app panics on startup with ClassNotFoundException.
-keep class app.tauri.** { *; }

# Keep all Tauri Plugins (accessed via reflection/JNI)
-keep class * extends app.tauri.plugin.Plugin

# Keep the Wry (WebView) internals
-keep class * extends android.webkit.WebChromeClient
-keep class * extends android.webkit.WebViewClient

# Keep any native methods (required for Rust <-> Java bridge)
-keepclassmembers class * {
    native <methods>;
}

# Keep JavascriptInterface methods (WebView <-> Rust communication)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ---------------------------------------------------------------------------------------
# PROJECT SPECIFIC
# ---------------------------------------------------------------------------------------
# Keep your specific package classes (MainActivity, etc.)
-keep class com.albidr.clashmanager.** { *; }

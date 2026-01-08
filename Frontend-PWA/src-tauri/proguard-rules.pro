# ---------------------------------------------------------------------------------------
# TAURI ANDROID RELEASE RULES (HARDENED)
# ---------------------------------------------------------------------------------------
# Critical: Keep Tauri's internal classes. Rust accesses these via JNI strings.
-keep class app.tauri.** { *; }
-keep class com.tauri.** { *; }

# Keep all Tauri Plugins (accessed via reflection/JNI)
-keep class * extends app.tauri.plugin.Plugin

# Keep the Wry (WebView) internals
-keep class * extends android.webkit.WebChromeClient
-keep class * extends android.webkit.WebViewClient

# Keep any native methods (required for Rust <-> Java bridge)
-keepclassmembers class * {
    native <methods>;
}

# Keep JavascriptInterface methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep the generated R classes (prevents resource stripping issues)
-keep class **.R$* { *; }

# ---------------------------------------------------------------------------------------
# PROJECT SPECIFIC
# ---------------------------------------------------------------------------------------
# Keep your specific package classes (MainActivity, etc.)
-keep class com.albidr.clashmanager.** { *; }

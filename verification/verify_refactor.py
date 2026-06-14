import os
from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a mobile-like viewport to see the banner clearly
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()

        # Navigate to the local dev server
        # Note: base path is /Clash-Manager/
        try:
            page.goto("http://localhost:5173/Clash-Manager/")

            # Wait for the app to hydrate
            page.wait_for_selector(".voyage-banner", timeout=10000)

            # Take a screenshot of the banner
            banner = page.locator(".voyage-banner")
            banner.screenshot(path="verification/voyage_banner.png")

            # Navigate to settings to see EventManagement
            # Assuming there is a way to navigate to settings, usually a dock icon
            # Or just goto the URL if router allows
            page.goto("http://localhost:5173/Clash-Manager/#/settings")
            # Wait for settings
            page.wait_for_selector(".settings-card", timeout=5000)

            # Take a screenshot of the entire page or the specific card
            page.screenshot(path="verification/settings_page.png")

        except Exception as e:
            print(f"Verification failed: {e}")
            # Fallback screenshot
            page.screenshot(path="verification/error_fallback.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run_verification()

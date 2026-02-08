from playwright.sync_api import sync_playwright, expect
import time

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        context.add_init_script("""
            localStorage.setItem('clash_manager_showcase_mode', 'true');
            localStorage.setItem('clash_manager_blueprint_mode', 'true');
            localStorage.setItem('clash_manager_synthetic_mode', 'true');
            localStorage.setItem('clash_manager_api_configured', 'true');
        """)

        page = context.new_page()

        print("Navigating to home...")
        page.goto("http://localhost:5173/Clash-Manager/", wait_until="networkidle")
        time.sleep(2)

        page.screenshot(path="verification/leaderboard.png")

        # Click expand on first member card
        first_card = page.locator(".card").first
        first_card.click()
        time.sleep(1)
        page.screenshot(path="verification/leaderboard_expanded.png")

        print("Navigating to recruiter...")
        page.goto("http://localhost:5173/Clash-Manager/#/recruiter", wait_until="networkidle")
        time.sleep(2)
        page.screenshot(path="verification/recruiter.png")

        # Click expand on first recruit card
        first_recruit = page.locator(".card").first
        first_recruit.click()
        time.sleep(1)
        page.screenshot(path="verification/recruiter_expanded.png")

        browser.close()

if __name__ == "__main__":
    run_verification()

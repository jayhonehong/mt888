"""Render the running app in Chromium, capture screenshots and console errors.

    python3 scripts/screenshots.py [baseUrl]

Used to verify the interface actually paints and to catch client-side runtime
errors that a build cannot detect.
"""
import sys
import pathlib
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

problems: list[str] = []


def attach(page, label):
    page.on(
        "console",
        lambda msg: problems.append(f"[{label}] console.{msg.type}: {msg.text}")
        if msg.type in ("error", "warning")
        else None,
    )
    page.on("pageerror", lambda err: problems.append(f"[{label}] pageerror: {err}"))
    page.on(
        "requestfailed",
        lambda req: problems.append(f"[{label}] requestfailed: {req.url} {req.failure}"),
    )


def shoot(page, name, full=True):
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    print(f"  saved {name}.png")


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/chromium",
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )

    # --- desktop -----------------------------------------------------------
    desktop = browser.new_context(viewport={"width": 1440, "height": 940}, device_scale_factor=1)
    page = desktop.new_page()
    attach(page, "desktop")

    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(5000)  # let a few live ticks land
    print(f"  title: {page.title()}")
    print(f"  fixtures rendered: {page.locator('article').count()}")
    print(f"  live badge visible: {page.get_by_text('LIVE', exact=False).count() > 0}")
    shoot(page, "01-home-desktop")

    page.goto(f"{BASE}/sports", wait_until="networkidle")
    page.wait_for_timeout(1500)
    shoot(page, "02-sports-desktop")

    # pick the first fixture on the board and open its detail page
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(2000)
    # Prefer a fixture that is still in play: a match can go full-time between
    # load and click, and a settled fixture's prices are correctly disabled.
    link = page.locator('article:has-text("LIVE") a[href^="/event/"]').first
    if link.count() == 0:
        link = page.locator('a[href^="/event/"]').first
    href = link.get_attribute("href")
    page.goto(f"{BASE}{href}", wait_until="networkidle")
    page.wait_for_timeout(2000)
    shoot(page, "03-event-desktop")

    # add a selection to the slip and confirm the slip reacts
    price = page.locator("button[aria-pressed]:not([disabled])").first
    if price.count() == 0:
        # every market on this fixture settled while we were looking at it
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(1500)
        page.locator('article:has-text("LIVE") a[href^="/event/"]').first.click()
        page.wait_for_timeout(2000)
        price = page.locator("button[aria-pressed]:not([disabled])").first
    price.click()
    page.wait_for_timeout(600)
    slip_text = page.locator("aside").last.inner_text()
    # CSS uppercases the .label class, so compare case-insensitively.
    print(f"  slip picked up the selection: {'returns' in slip_text.lower()}")
    print(f"  slip is marked pressed: {price.get_attribute('aria-pressed')}")
    shoot(page, "04-event-with-slip")

    page.goto(f"{BASE}/leaderboard", wait_until="networkidle")
    page.wait_for_timeout(1200)
    shoot(page, "05-leaderboard-desktop")

    # --- auth flow ---------------------------------------------------------
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.wait_for_timeout(600)
    shoot(page, "06-login")

    page.fill('input#identifier', "demo")
    page.fill('input#password', "goldbean")
    page.click('button[type="submit"]')
    page.wait_for_timeout(2500)
    print(f"  signed in, landed on: {page.url}")
    shoot(page, "07-home-signed-in")

    page.goto(f"{BASE}/wallet", wait_until="networkidle")
    page.wait_for_timeout(1500)
    rows = page.locator("tbody tr").count()
    print(f"  statement rows: {rows}")
    shoot(page, "08-wallet-desktop")

    page.goto(f"{BASE}/my-bets", wait_until="networkidle")
    page.wait_for_timeout(1500)
    shoot(page, "09-my-bets-desktop")

    page.goto(f"{BASE}/admin", wait_until="networkidle")
    page.wait_for_timeout(1800)
    shoot(page, "10-admin-desktop")

    # The demo player is correctly refused, so sign in as the admin account to
    # capture the console itself.
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input#identifier', "admin")
    page.fill('input#password', "goldbean-admin")
    page.click('button[type="submit"]')
    page.wait_for_timeout(2000)
    page.goto(f"{BASE}/admin", wait_until="networkidle")
    page.wait_for_timeout(2500)
    print(f"  admin console reached: {'Admin console' in page.content()}")
    shoot(page, "10b-admin-console")

    # --- mobile ------------------------------------------------------------
    mobile = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
    )
    phone = mobile.new_page()
    attach(phone, "mobile")
    phone.goto(BASE, wait_until="networkidle")
    phone.wait_for_timeout(3500)
    shoot(phone, "11-home-mobile")

    phone.locator('a[href^="/event/"]').first.click()
    phone.wait_for_timeout(2000)
    shoot(phone, "12-event-mobile")

    browser.close()

print("\n--- console / network problems ---")
if problems:
    for item in problems[:40]:
        print(" ", item)
    print(f"  ({len(problems)} total)")
else:
    print("  none")

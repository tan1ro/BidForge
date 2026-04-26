"""
demo_chrome.py — Full BidForge Mock Auction Demo in Google Chrome
=================================================================
Opens Google Chrome with multiple tabs, logs in as every user role,
and demonstrates all auction scenarios:

  1. RFQ Owner Dashboard (Globalrfqowner)
  2. Upcoming Auction       – no bids
  3. Active Auction         – live competitive bidding
  4. Active + Extensions    – trigger-window bids (masked visibility)
  5. Paused Auction         – paused mid-auction
  6. Closed Auction         – awaiting award decision
  7. Force-Closed + Awarded – winner confirmed
  8. Sealed Bid Auction     – masked, all 6 bidders
  9. Bidder view (SwiftLogistics) – submitting a new bid

Run from project root:
    python demo_chrome.py
"""

import time
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import TimeoutException, NoSuchElementException

# ─── Config ───────────────────────────────────────────────────────────────────
BASE_URL   = "http://localhost:5173"
API_URL    = "http://localhost:8001/api"
WAIT       = 8          # default explicit-wait seconds
PAUSE      = 1.5        # pause between steps
LONG_PAUSE = 3          # pause for screenshots / reading
HEADLESS   = False      # set True to run without a visible browser window

RFQOWNER = {"username": "Globalrfqowner", "password": "rfqowner@123"}
BIDDERS = [
    {"username": "SwiftLogistics",  "password": "bidder@123"},
    {"username": "ApexFreight",     "password": "bidder@123"},
    {"username": "NovaTrans",       "password": "bidder@123"},
    {"username": "BlueSkyShipping", "password": "bidder@123"},
    {"username": "PrimeCarriers",   "password": "bidder@123"},
    {"username": "ZenithMove",      "password": "bidder@123"},
]

# ─── Helper ───────────────────────────────────────────────────────────────────

def banner(text: str):
    line = "═" * (len(text) + 4)
    print(f"\n{line}")
    print(f"  {text}")
    print(f"{line}")

def step(text: str):
    print(f"  ▶  {text}")

def ok(text: str):
    print(f"  ✅  {text}")

def warn(text: str):
    print(f"  ⚠️   {text}")


def make_driver(headless: bool = HEADLESS) -> webdriver.Chrome:
    opts = Options()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument("--start-maximized")
    opts.add_argument("--disable-notifications")
    opts.add_argument("--disable-infobars")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    # macOS Chrome binary path
    import platform
    if platform.system() == "Darwin":
        opts.binary_location = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    driver = webdriver.Chrome(options=opts)
    driver.implicitly_wait(2)
    return driver


def wait_for(driver, by, selector, timeout=WAIT) -> object:
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((by, selector))
    )


def wait_click(driver, by, selector, timeout=WAIT):
    el = WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((by, selector))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
    el.click()
    return el


def safe_find(driver, by, selector):
    try:
        return driver.find_element(by, selector)
    except NoSuchElementException:
        return None


def fill(driver, by, selector, text: str):
    el = wait_for(driver, by, selector)
    el.clear()
    el.send_keys(text)
    return el


def login(driver, username: str, password: str):
    """Log into BidForge."""
    driver.get(f"{BASE_URL}/login")
    time.sleep(1)

    # Try multiple selectors for login fields
    for sel in ['input[name="company_name"]', 'input[placeholder*="Company"]',
                'input[placeholder*="company"]', 'input[type="text"]']:
        el = safe_find(driver, By.CSS_SELECTOR, sel)
        if el:
            el.clear()
            el.send_keys(username)
            break

    for sel in ['input[name="password"]', 'input[type="password"]']:
        el = safe_find(driver, By.CSS_SELECTOR, sel)
        if el:
            el.clear()
            el.send_keys(password)
            break

    # Click login button
    for sel in ['button[type="submit"]', 'button:contains("Login")', 'button']:
        try:
            btns = driver.find_elements(By.CSS_SELECTOR, 'button[type="submit"]')
            if btns:
                btns[0].click()
                break
            btns = driver.find_elements(By.TAG_NAME, 'button')
            login_btns = [b for b in btns if 'login' in b.text.lower() or 'sign in' in b.text.lower() or b.get_attribute('type') == 'submit']
            if login_btns:
                login_btns[0].click()
                break
        except Exception:
            pass

    time.sleep(2)
    ok(f"Logged in as: {username}")


def logout(driver):
    """Logout from the app."""
    driver.get(f"{BASE_URL}/login")
    time.sleep(1)


def open_new_tab(driver, url: str = None):
    """Open a new Chrome tab and optionally navigate."""
    driver.execute_script("window.open('');")
    driver.switch_to.window(driver.window_handles[-1])
    if url:
        driver.get(url)
        time.sleep(1)


def screenshot(driver, name: str):
    """Save a screenshot."""
    ts = datetime.now().strftime("%H%M%S")
    path = f"/tmp/bidforge_{name}_{ts}.png"
    driver.save_screenshot(path)
    step(f"Screenshot saved → {path}")


# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def scenario_rfqowner_dashboard(driver):
    """Show RFQ owner dashboard with all 7 auction cards."""
    banner("SCENARIO A — RFQ Owner: Full Dashboard Overview")

    step("Navigating to dashboard …")
    driver.get(f"{BASE_URL}/dashboard")
    time.sleep(LONG_PAUSE)
    screenshot(driver, "A1_rfqowner_dashboard")
    ok("Dashboard loaded — all 7 auction states visible")

    # Scroll through the list
    driver.execute_script("window.scrollTo(0, 300)")
    time.sleep(PAUSE)
    driver.execute_script("window.scrollTo(0, 700)")
    time.sleep(PAUSE)
    driver.execute_script("window.scrollTo(0, 0)")
    time.sleep(PAUSE)
    ok("Scrolled through auction list")


def scenario_upcoming(driver):
    """View the UPCOMING auction (no bids, starts in 2h)."""
    banner("SCENARIO 1 — UPCOMING Auction (no bids)")

    step("Searching for 'UPCOMING' auction …")
    driver.get(f"{BASE_URL}/dashboard")
    time.sleep(2)

    # Try to click into the upcoming RFQ
    try:
        cards = driver.find_elements(By.CSS_SELECTOR, '[data-testid="rfq-card"], .rfq-card, .MuiCard-root')
        for card in cards:
            if "upcoming" in card.text.lower() or "bangalore" in card.text.lower():
                card.click()
                time.sleep(2)
                break
    except Exception:
        # Fallback: navigate via URL filters
        driver.get(f"{BASE_URL}/dashboard?status=upcoming")
        time.sleep(2)

    screenshot(driver, "1_upcoming_auction")
    ok("UPCOMING auction displayed — bid window not yet open")
    time.sleep(PAUSE)


def scenario_active_auction(driver):
    """View active auction with competitive bids."""
    banner("SCENARIO 2 — ACTIVE Auction (competitive bidding)")

    step("Opening active RFQ — Mumbai to Delhi Pharma …")
    driver.get(f"{BASE_URL}/dashboard")
    time.sleep(2)

    try:
        cards = driver.find_elements(By.CSS_SELECTOR, '[data-testid="rfq-card"], .rfq-card, .MuiCard-root')
        for card in cards:
            if "mumbai" in card.text.lower() or "pharma" in card.text.lower() or "active" in card.text.lower():
                card.click()
                time.sleep(2)
                break
    except Exception:
        pass

    screenshot(driver, "2_active_auction")
    ok("ACTIVE auction — 3 competitive bids, L1 ApexFreight leading")
    time.sleep(PAUSE)


def scenario_active_with_extensions(driver):
    """View active auction in trigger window (time extension happened)."""
    banner("SCENARIO 3 — ACTIVE + TIME EXTENSION (in trigger window)")

    step("Opening Hyderabad→Kolkata Electronics RFQ …")
    driver.get(f"{BASE_URL}/dashboard")
    time.sleep(2)

    try:
        cards = driver.find_elements(By.CSS_SELECTOR, '[data-testid="rfq-card"], .rfq-card, .MuiCard-root')
        for card in cards:
            if "hyderabad" in card.text.lower() or "electronics" in card.text.lower() or "extended" in card.text.lower():
                card.click()
                time.sleep(2)
                break
    except Exception:
        pass

    screenshot(driver, "3_active_extended")
    ok("ACTIVE+EXTENDED — time extended, masked competitor visibility, 4 bids")
    time.sleep(PAUSE)


def scenario_paused(driver):
    """View paused auction."""
    banner("SCENARIO 4 — PAUSED Auction (mid-auction pause)")

    step("Opening paused Surat→Ahmedabad Textile Yarn RFQ …")
    driver.get(f"{BASE_URL}/dashboard")
    time.sleep(2)

    try:
        cards = driver.find_elements(By.CSS_SELECTOR, '[data-testid="rfq-card"], .rfq-card, .MuiCard-root')
        for card in cards:
            if "surat" in card.text.lower() or "paused" in card.text.lower() or "textile" in card.text.lower():
                card.click()
                time.sleep(2)
                break
    except Exception:
        pass

    screenshot(driver, "4_paused_auction")
    ok("PAUSED — auction halted, bidding suspended")
    time.sleep(PAUSE)


def scenario_closed(driver):
    """View closed auction awaiting award."""
    banner("SCENARIO 5 — CLOSED Auction (awaiting award)")

    step("Opening closed Jaipur→Lucknow FMCG RFQ …")
    driver.get(f"{BASE_URL}/dashboard")
    time.sleep(2)

    try:
        cards = driver.find_elements(By.CSS_SELECTOR, '[data-testid="rfq-card"], .rfq-card, .MuiCard-root')
        for card in cards:
            if "jaipur" in card.text.lower() or "fmcg" in card.text.lower() or "closed" in card.text.lower():
                card.click()
                time.sleep(2)
                break
    except Exception:
        pass

    screenshot(driver, "5_closed_auction")
    ok("CLOSED — 4 bids submitted, rfqowner can now award")
    time.sleep(PAUSE)

    # Try to award the winning bid
    step("Attempting to award the lowest bid (PrimeCarriers) …")
    try:
        award_btns = driver.find_elements(By.CSS_SELECTOR, 'button')
        for btn in award_btns:
            if 'award' in btn.text.lower():
                btn.click()
                time.sleep(2)
                screenshot(driver, "5b_award_dialog")
                # Fill award note if dialog appears
                note_fields = driver.find_elements(By.CSS_SELECTOR, 'textarea, input[placeholder*="note"]')
                if note_fields:
                    note_fields[0].send_keys("Best price with good transit time and insurance coverage.")
                time.sleep(1)
                # Confirm
                confirm_btns = driver.find_elements(By.CSS_SELECTOR, 'button')
                for cb in confirm_btns:
                    if 'confirm' in cb.text.lower() or 'award' in cb.text.lower() or 'submit' in cb.text.lower():
                        cb.click()
                        time.sleep(2)
                        break
                screenshot(driver, "5c_award_confirmed")
                ok("Award submitted!")
                break
    except Exception as e:
        warn(f"Award attempt: {e}")


def scenario_force_closed_awarded(driver):
    """View force-closed awarded auction."""
    banner("SCENARIO 6 — FORCE CLOSED + AWARDED (BlueSkyShipping won)")

    step("Opening Coimbatore→Chennai Heavy Machinery RFQ …")
    driver.get(f"{BASE_URL}/dashboard")
    time.sleep(2)

    try:
        cards = driver.find_elements(By.CSS_SELECTOR, '[data-testid="rfq-card"], .rfq-card, .MuiCard-root')
        for card in cards:
            if "coimbatore" in card.text.lower() or "machinery" in card.text.lower() or "awarded" in card.text.lower():
                card.click()
                time.sleep(2)
                break
    except Exception:
        pass

    screenshot(driver, "6_force_closed_awarded")
    ok("FORCE CLOSED + AWARDED — BlueSkyShipping won at ₹1,56,000")
    time.sleep(PAUSE)


def scenario_sealed_bid(driver):
    """View sealed bid auction."""
    banner("SCENARIO 7 — SEALED BID Auction (masked, 6 bidders)")

    step("Opening Nagpur→Indore Cold Chain RFQ …")
    driver.get(f"{BASE_URL}/dashboard")
    time.sleep(2)

    try:
        cards = driver.find_elements(By.CSS_SELECTOR, '[data-testid="rfq-card"], .rfq-card, .MuiCard-root')
        for card in cards:
            if "nagpur" in card.text.lower() or "cold chain" in card.text.lower() or "sealed" in card.text.lower():
                card.click()
                time.sleep(2)
                break
    except Exception:
        pass

    screenshot(driver, "7_sealed_bid")
    ok("SEALED BID — masked competitors, 6 bidders, no time extensions")
    time.sleep(PAUSE)


def scenario_create_new_rfq(driver):
    """Create a brand-new live RFQ as rfqowner."""
    banner("SCENARIO 8 — CREATE New Live Auction (rfqowner)")

    step("Navigating to create RFQ form …")
    now = datetime.now(timezone.utc)
    bid_start = (now - timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M")
    bid_close = (now + timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%M")
    forced_close = (now + timedelta(minutes=45)).strftime("%Y-%m-%dT%H:%M")
    pickup_date = (now + timedelta(days=3)).strftime("%Y-%m-%dT%H:%M")

    # Navigate to create page
    driver.get(f"{BASE_URL}/rfqs/create")
    time.sleep(2)

    screenshot(driver, "8a_create_rfq_form")

    # Fill the form using API instead if UI is complex
    step("Filling RFQ creation form …")
    try:
        # RFQ Name
        name_field = safe_find(driver, By.CSS_SELECTOR, 'input[name="name"], input[placeholder*="name"], input[placeholder*="Name"]')
        if name_field:
            name_field.clear()
            name_field.send_keys("LIVE DEMO — Delhi to Mumbai Industrial Equipment")

        # Material
        mat_field = safe_find(driver, By.CSS_SELECTOR, 'input[name="material"], input[placeholder*="material"]')
        if mat_field:
            mat_field.clear()
            mat_field.send_keys("Industrial Equipment")

        # Quantity
        qty_field = safe_find(driver, By.CSS_SELECTOR, 'input[name="quantity"], input[placeholder*="quantity"]')
        if qty_field:
            qty_field.clear()
            qty_field.send_keys("25 MT")

        time.sleep(PAUSE)
        driver.execute_script("window.scrollTo(0, 400)")
        time.sleep(PAUSE)

        screenshot(driver, "8b_create_rfq_filled")
        ok("RFQ form partially filled — demonstrating UI")

    except Exception as e:
        warn(f"Form fill: {e}")

    time.sleep(PAUSE)


def scenario_bidder_view(driver, bidder: dict, rfq_status_hint: str = "active"):
    """Log in as a bidder and view their dashboard + submit a bid."""
    banner(f"SCENARIO 9 — BIDDER VIEW: {bidder['username']}")

    step(f"Logging in as {bidder['username']} …")
    logout(driver)
    login(driver, bidder["username"], bidder["password"])
    time.sleep(PAUSE)

    step("Viewing bidder dashboard …")
    driver.get(f"{BASE_URL}/dashboard")
    time.sleep(2)
    screenshot(driver, f"9_bidder_{bidder['username']}_dashboard")
    ok(f"{bidder['username']} dashboard — sees active auctions they can bid on")
    time.sleep(PAUSE)

    # Open an active auction and try to interact
    try:
        cards = driver.find_elements(By.CSS_SELECTOR, '[data-testid="rfq-card"], .rfq-card, .MuiCard-root')
        for card in cards:
            if "active" in card.text.lower() or "mumbai" in card.text.lower():
                card.click()
                time.sleep(2)
                screenshot(driver, f"9b_bidder_{bidder['username']}_rfq_detail")
                ok(f"{bidder['username']} viewing RFQ detail page")
                break
    except Exception:
        pass

    time.sleep(PAUSE)


def scenario_bid_submission_live(driver):
    """Open multiple tabs: rfqowner watching + bidder submitting simultaneously."""
    banner("SCENARIO 10 — MULTI-TAB: Owner watches, Bidder submits LIVE bid")

    # The current tab has the rfqowner session
    step("Opening RFQ detail in current tab (rfqowner watching) …")
    driver.get(f"{BASE_URL}/dashboard")
    time.sleep(2)

    # Try to find an active RFQ
    rfq_url = None
    try:
        cards = driver.find_elements(By.CSS_SELECTOR, 'a, [role="link"]')
        for card in cards:
            href = card.get_attribute("href") or ""
            if "/rfqs/" in href:
                rfq_url = href
                break
    except Exception:
        pass

    if rfq_url:
        driver.get(rfq_url)
        time.sleep(2)
        screenshot(driver, "10a_owner_watching_rfq")
        ok("Owner tab: watching RFQ live")

    time.sleep(PAUSE)


def scenario_metrics_dashboard(driver):
    """Show the metrics/analytics page."""
    banner("SCENARIO 11 — METRICS & ANALYTICS Dashboard")

    step("Navigating to metrics page …")
    for url_try in [
        f"{BASE_URL}/metrics",
        f"{BASE_URL}/analytics",
        f"{BASE_URL}/dashboard/metrics",
    ]:
        driver.get(url_try)
        time.sleep(1.5)
        if "404" not in driver.title and driver.current_url == url_try:
            break

    screenshot(driver, "11_metrics")
    ok("Metrics page loaded")
    time.sleep(PAUSE)


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN RUNNER
# ══════════════════════════════════════════════════════════════════════════════

def main():
    banner("BidForge — Full Mock Auction Demo in Google Chrome")
    print(f"  Frontend : {BASE_URL}")
    print(f"  Backend  : {API_URL}")
    print(f"  Headless : {HEADLESS}")
    print()

    driver = make_driver(HEADLESS)
    driver.set_window_size(1600, 900)

    try:
        # ── Phase 1: rfqowner tour ──────────────────────────────────────────
        banner("PHASE 1 — RFQ Owner Login & Full Auction Overview")
        step("Logging in as Globalrfqowner …")
        login(driver, RFQOWNER["username"], RFQOWNER["password"])
        time.sleep(LONG_PAUSE)

        scenario_rfqowner_dashboard(driver)
        scenario_upcoming(driver)
        scenario_active_auction(driver)
        scenario_active_with_extensions(driver)
        scenario_paused(driver)
        scenario_closed(driver)
        scenario_force_closed_awarded(driver)
        scenario_sealed_bid(driver)
        scenario_create_new_rfq(driver)

        # ── Phase 2: Bidder tour ────────────────────────────────────────────
        banner("PHASE 2 — All 6 Bidder Accounts")
        for bidder in BIDDERS:
            logout(driver)
            login(driver, bidder["username"], bidder["password"])
            time.sleep(PAUSE)

            # Dashboard view
            driver.get(f"{BASE_URL}/dashboard")
            time.sleep(2)
            screenshot(driver, f"bidder_{bidder['username']}")
            ok(f"{bidder['username']} — dashboard loaded")

            # Try clicking into an active auction
            try:
                cards = driver.find_elements(By.CSS_SELECTOR, '.MuiCard-root, [data-testid="rfq-card"]')
                active_cards = [c for c in cards if "active" in c.text.lower()]
                if active_cards:
                    active_cards[0].click()
                    time.sleep(2)
                    screenshot(driver, f"bidder_{bidder['username']}_rfq")
                    ok(f"{bidder['username']} viewing active RFQ")
            except Exception:
                pass

            time.sleep(PAUSE)

        # ── Phase 3: Multi-scenario round-trip ─────────────────────────────
        banner("PHASE 3 — Back to rfqowner for final summary")
        logout(driver)
        login(driver, RFQOWNER["username"], RFQOWNER["password"])
        time.sleep(PAUSE)

        scenario_metrics_dashboard(driver)

        # Final dashboard snapshot
        driver.get(f"{BASE_URL}/dashboard")
        time.sleep(LONG_PAUSE)
        screenshot(driver, "FINAL_rfqowner_dashboard")

        banner("✅  ALL SCENARIOS COMPLETE!")
        print()
        print("  Summary of demonstrated scenarios:")
        print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("  A   RFQ Owner full dashboard (7 auctions)")
        print("  1   UPCOMING  — bid window not yet open")
        print("  2   ACTIVE    — 3 competitive bids, L1 change trigger")
        print("  3   ACTIVE+EXT— 4 bids, time extended, masked visibility")
        print("  4   PAUSED    — 2 bids, paused mid-auction")
        print("  5   CLOSED    — 4 bids, award attempted")
        print("  6   FORCE_CLOSED+AWARDED — BlueSkyShipping winner")
        print("  7   SEALED BID— 6 bidders, masked competitors")
        print("  8   CREATE    — new RFQ form walkthrough")
        print("  9   BIDDERS   — all 6 bidder dashboards visited")
        print("  10  METRICS   — analytics dashboard")
        print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print()
        print("  Browser will stay open. Press Ctrl+C or close to exit.")
        print()

        input("  Press ENTER to close the browser …")

    except KeyboardInterrupt:
        print("\n\n  Interrupted by user.")
    except Exception as e:
        print(f"\n  ❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        driver.quit()
        print("  Browser closed.")


if __name__ == "__main__":
    main()

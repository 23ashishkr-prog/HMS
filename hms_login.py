"""Sign in to HMS as each user in users.csv and save each browser session.

Passwords are never stored: you type each one when prompted (input is hidden).
Each successful login is saved to sessions/<role>.json so later test runs
can reuse the signed-in session without a password.

Usage:
    python3 -m pip install playwright && python3 -m playwright install chromium
    python3 hms_login.py            # all users in users.csv
    python3 hms_login.py doctor     # only the given role(s)
"""

import csv
import getpass
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

BASE = "https://greynova.in/hms"
LOGIN_URL = f"{BASE}/auth/login"
HERE = Path(__file__).parent
SESSIONS = HERE / "sessions"


def load_users(only):
    rows = (HERE / "users.csv").read_text().splitlines()
    rows = [r for r in rows if r.strip() and not r.lstrip().startswith("#")]
    users = list(csv.DictReader(rows))
    return [u for u in users if not only or u["role"] in only]


def login(browser, user, password):
    context = browser.new_context()
    page = context.new_page()
    start = time.perf_counter()
    page.goto(LOGIN_URL, wait_until="networkidle")
    load_s = time.perf_counter() - start

    page.get_by_label("Email").fill(user["email"])
    page.get_by_label("Password").fill(password)
    start = time.perf_counter()
    page.get_by_role("button", name="Sign in").click()
    try:
        page.wait_for_url(lambda url: "/auth/login" not in url, timeout=20_000)
        page.wait_for_load_state("networkidle")
        ok, error = True, ""
    except PWTimeout:
        ok = False
        error = page.locator("body").inner_text()[:300]
    signin_s = time.perf_counter() - start

    result = {
        "role": user["role"],
        "email": user["email"],
        "ok": ok,
        "landing_url": page.url,
        "login_page_load_s": round(load_s, 2),
        "sign_in_s": round(signin_s, 2),
        "error": error,
    }
    if ok:
        SESSIONS.mkdir(exist_ok=True)
        context.storage_state(path=SESSIONS / f"{user['role']}.json")
        page.screenshot(path=SESSIONS / f"{user['role']}_landing.png", full_page=True)
    context.close()
    return result


def main():
    users = load_users(set(sys.argv[1:]))
    if not users:
        sys.exit("No matching users in users.csv")
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        for user in users:
            password = getpass.getpass(f"Password for {user['role']} ({user['email']}): ")
            result = login(browser, user, password)
            del password
            status = "OK  " if result["ok"] else "FAIL"
            print(f"{status} {result['role']:<14} sign-in {result['sign_in_s']}s -> {result['landing_url']}")
            results.append(result)
        browser.close()
    SESSIONS.mkdir(exist_ok=True)
    (SESSIONS / "login_results.json").write_text(json.dumps(results, indent=2))
    print(f"\nSaved sessions and results in {SESSIONS}")


if __name__ == "__main__":
    main()

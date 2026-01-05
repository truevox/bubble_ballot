import asyncio
from playwright.async_api import async_playwright
import os
import subprocess
import time
import sys

async def main():
    # Kill the existing server
    print("Stopping any existing server...")
    if sys.platform == "win32":
        subprocess.run("taskkill /F /IM python.exe /T", shell=True, stderr=subprocess.DEVNULL)
    else:
        # Cross-platform way to find and kill the process on port 5000 is tricky without lsof
        # But we can try pkill or just assume the user handles it if this fails.
        # For this environment, we stick to what works but wrap it cleaner.
        subprocess.run("kill $(lsof -t -i :5000) 2>/dev/null || true", shell=True)

    # Remove the database
    print("Cleaning up database...")
    if os.path.exists("questions.db"):
        os.remove("questions.db")
    if os.path.exists("board.db"): # The app uses board.db now according to database.py
        os.remove("board.db")

    # Start the server
    print("Starting server...")
    # Use subprocess.Popen for background process
    server_process = subprocess.Popen(
        [sys.executable, "app.py"],
        stdout=open("flask_output.log", "w"),
        stderr=subprocess.STDOUT
    )

    # Give it a moment to start up
    print("Waiting for server to start...")
    await asyncio.sleep(3)

    try:
        async with async_playwright() as p:
            print("Launching browser...")
            browser = await p.chromium.launch()
            page = await browser.new_page()

            # Capture console logs
            page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

            print("Navigating to landing page...")
            try:
                await page.goto("http://127.0.0.1:5000")
            except Exception as e:
                print(f"Failed to load page: {e}")
                return

            await page.wait_for_timeout(2000)  # Wait for animations to settle
            await page.screenshot(path="final_verification_before_click.png")
            print("Screenshot saved: final_verification_before_click.png")

            # Get tree coordinates from the browser context
            tree_coords = await page.evaluate('''() => {
                const canvas = document.getElementById('canvas');
                if (!canvas) return null;
                const width = canvas.width;
                const height = canvas.height;
                const treeX = width * 0.65;
                const treeY = height * 0.7;
                const trunkHeight = 120;
                const treeTopY = treeY - trunkHeight;
                return { x: treeX, y: treeTopY };
            }''')

            if tree_coords:
                print(f"Clicking at coordinates: {tree_coords}")
                await page.mouse.click(tree_coords['x'], tree_coords['y'])

                await page.wait_for_timeout(1000)  # Wait for coconut to fall
                await page.screenshot(path="final_verification_after_click.png")
                print("Screenshot saved: final_verification_after_click.png")
            else:
                print("Could not find tree coordinates (canvas missing?)")

            await browser.close()
    finally:
        # Kill the server
        print("Stopping server...")
        server_process.terminate()
        server_process.wait()

        # Double check cleanup
        if sys.platform == "win32":
            subprocess.run("taskkill /F /IM python.exe /T", shell=True, stderr=subprocess.DEVNULL)
        else:
             subprocess.run("kill $(lsof -t -i :5000) 2>/dev/null || true", shell=True)

if __name__ == "__main__":
    asyncio.run(main())

import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    # Kill the existing server
    os.system("kill $(lsof -t -i :5000) 2>/dev/null || true")
    # Remove the database
    os.system("rm -f questions.db")
    # Start the server
    os.system("python app.py > flask_output.log 2>&1 &")
    # Give it a moment to start up
    await asyncio.sleep(2)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

        await page.goto("http://127.0.0.1:5000")
        await page.wait_for_timeout(2000)  # Wait for animations to settle
        await page.screenshot(path="final_verification_before_click.png")

        # Get tree coordinates from the browser context
        tree_coords = await page.evaluate('''() => {
            const canvas = document.getElementById('canvas');
            const width = canvas.width;
            const height = canvas.height;
            const treeX = width * 0.65;
            const treeY = height * 0.7;
            const trunkHeight = 120;
            const treeTopY = treeY - trunkHeight;
            return { x: treeX, y: treeTopY };
        }''')

        print(f"Clicking at coordinates: {tree_coords}")
        await page.mouse.click(tree_coords['x'], tree_coords['y'])

        await page.wait_for_timeout(1000)  # Wait for coconut to fall
        await page.screenshot(path="final_verification_after_click.png")

        await browser.close()
        # Kill the server
        os.system("kill $(lsof -t -i :5000) 2>/dev/null || true")

if __name__ == "__main__":
    asyncio.run(main())

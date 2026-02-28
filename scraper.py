import os
import asyncio
from playwright.async_api import async_playwright
from supabase import create_client, Client

# 1. Supabase Setup (Credentials stored in GitHub Secrets)
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

async def scrape_and_push(hotel_url, hotel_name, city, state):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await page.goto(hotel_url, timeout=60000)
            # Find policy text - looking for common deposit keywords
            content = await page.locator("body").inner_text()
            
            # Simple Logic: Extract 300 characters around the word "Deposit"
            index = content.lower().find("deposit")
            summary = content[index:index+300] if index != -1 else "Policy text not found automatically."

            # 2. Push to Supabase
            data = {
                "hotel_name": hotel_name,
                "city": city,
                "state": state,
                "policy_summary": summary,
                "source_url": hotel_url,
                "is_refundable": "refundable" in summary.lower()
            }
            
            # Upsert: Updates if hotel exists, inserts if it doesn't
            supabase.table("hotel_policies").upsert(data, on_conflict="hotel_name").execute()
            print(f"✅ Updated {hotel_name}")

        except Exception as e:
            print(f"❌ Error scraping {hotel_name}: {e}")
        
        await browser.close()

# Example: Run for a list of hotels
async def main():
    hotels = [
        {"url": "https://example-hotel-mt.com/terms", "name": "Big Sky Lodge", "city": "Bozeman", "state": "MT"},
    ]
    for h in hotels:
        await scrape_and_push(h['url'], h['name'], h['city'], h['state'])

if __name__ == "__main__":
    asyncio.run(main())
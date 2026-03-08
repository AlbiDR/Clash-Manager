import * as v from "valibot";
import { RoyaleTournamentResponseSchema } from "./src/schemas.js";

// Needs tsx because of ES modules and valibot
async function test() {
  const apiKey = process.env.VITE_CLASH_API_KEY || (process.env.API_KEYS ? process.env.API_KEYS.split(",")[0] : null);
  if (!apiKey) {
    console.error("No API key found in env.");
    process.exit(1);
  }

  try {
    const searchRes = await fetch("https://api.clashroyale.com/v1/tournaments?name=a&limit=1", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    
    if (!searchRes.ok) {
        console.error("Search failed:", searchRes.status, await searchRes.text());
        process.exit(1);
    }
    
    const searchData: any = await searchRes.json();
    const tag = searchData.items[0].tag;

    const res = await fetch(`https://api.clashroyale.com/v1/tournaments/${encodeURIComponent(tag)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    
    if (!res.ok) {
        console.error("Detail fetch failed:", res.status, await res.text());
        process.exit(1);
    }
    
    const data: any = await res.json();
    
    const result = v.safeParse(RoyaleTournamentResponseSchema, data);
    
    if (result.success) {
      console.log("SUCCESS! Schema passed.");
    } else {
      console.log("FAILED! Schema errors:");
      console.log(JSON.stringify(result.issues, null, 2));
      console.log("Sample member:", JSON.stringify(data.membersList?.[0], null, 2));
    }
  } catch (err) {
    console.error("Script error:", err);
  }
}

test();

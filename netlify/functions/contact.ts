import type { Handler } from "@netlify/functions";
import { Resend } from "resend";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const resend = new Resend(process.env.RESEND_API_KEY);

const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(3, "1 h"),
    prefix: "syncera:contact",
});

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const handler: Handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers: CORS_HEADERS, body: "" };
    }

    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Method not allowed" }),
        };
    }

    const ip =
        event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        event.headers["client-ip"] ||
        "unknown";

    const { success, remaining, reset } = await ratelimit.limit(ip);

    if (!success) {
        return {
            statusCode: 429,
            headers: {
                ...CORS_HEADERS,
                "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
                "X-RateLimit-Remaining": String(remaining),
            },
            body: JSON.stringify({ error: "Too many requests. Please try again later." }),
        };
    }

    let body: { name?: string; email?: string; message?: string };
    try {
        body = JSON.parse(event.body || "{}");
    } catch {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Invalid JSON" }),
        };
    }

    const { name, email, message } = body;

    if (!name || !email || !message) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Name, email, and message are required." }),
        };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Invalid email address." }),
        };
    }

    try {
        await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to: process.env.EMAIL_TO,
            replyTo: email,
            subject: `New contact from ${name}`,
            html: buildEmailHtml(escapeHtml(name), escapeHtml(email), escapeHtml(message).replace(/\n/g, "<br>")),
        });

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ success: true }),
        };
    } catch (err) {
        console.error("Resend error:", err);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Failed to send message. Please try again." }),
        };
    }
};

function buildEmailHtml(name: string, email: string, message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Contact — Syncera</title>
</head>
<body style="margin:0;padding:0;background-color:#e8e2d6;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#e8e2d6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#f0ebe1;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(45,35,25,0.12);">

          <!-- Header -->
          <tr>
            <td style="background-color:#2d2319;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:#f0ebe1;letter-spacing:0.04em;">Syncera</p>
              <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7a6654;letter-spacing:0.12em;text-transform:uppercase;">New Contact Form Submission</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">

              <!-- Sender info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="padding:16px;background-color:#e8e2d6;border-radius:6px;border-left:4px solid #5c4a3a;">
                    <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#7a6654;text-transform:uppercase;letter-spacing:0.08em;">From</p>
                    <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#2d2319;font-weight:700;">${name}</p>
                    <p style="margin:0;">
                      <a href="mailto:${email}" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#5c4a3a;text-decoration:none;">${email}</a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="border-top:1px solid #e8e2d6;"></td>
                </tr>
              </table>

              <!-- Message -->
              <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#7a6654;text-transform:uppercase;letter-spacing:0.08em;">Message</p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#3d3027;line-height:1.7;">${message}</p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#3d3027;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7a6654;">syncerainc.com &mdash; Reply directly to this email to respond to ${name}.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export { handler };

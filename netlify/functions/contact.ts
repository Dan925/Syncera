import type { Handler } from "@netlify/functions";
import { Resend } from "resend";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import Anthropic from "@anthropic-ai/sdk";

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

    // 1. Send owner notification (critical path — failure returns 500)
    try {
        await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to: process.env.EMAIL_TO,
            replyTo: email,
            subject: `New contact from ${name}`,
            html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
      `,
        });
    } catch (err) {
        console.error("Resend error:", err);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Failed to send message. Please try again." }),
        };
    }

    // 2. Best-effort: AI-written follow-up to the prospect with Cal.com booking link
    if (process.env.ANTHROPIC_API_KEY && process.env.BOOKING_URL) {
        try {
            const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
            const bookingUrl = process.env.BOOKING_URL;

            const aiResponse = await anthropic.messages.create({
                model: "claude-opus-4-6",
                max_tokens: 400,
                messages: [{
                    role: "user",
                    content: `You are an assistant for Syncera Digitale Studio, a boutique digital marketing agency.
A prospect submitted this contact form:
  Name: ${name}
  Message: ${message}

Write a follow-up email (3–4 sentences) that:
- Warmly acknowledges their specific inquiry (no generic "thanks for contacting us")
- Expresses genuine excitement about connecting
- Invites them to book a free 30-minute strategy call at: ${bookingUrl}

Tone: human, warm, clear — no jargon. Match the language of the prospect's message (French if French, English if English).

Respond with ONLY valid JSON, nothing else:
{"subject":"<email subject>","body":"<email body, use \\n for paragraph breaks>"}`,
                }],
            });

            const raw = aiResponse.content[0].type === "text"
                ? aiResponse.content[0].text.trim()
                : null;

            if (raw) {
                const { subject, body: emailBody } = JSON.parse(raw) as { subject: string; body: string };

                await resend.emails.send({
                    from: process.env.EMAIL_FROM!,
                    to: email,
                    replyTo: process.env.EMAIL_TO,
                    subject,
                    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#2d2319;line-height:1.6;">
  <p>Hi ${escapeHtml(name)},</p>
  ${emailBody.split("\n").filter(Boolean).map((p: string) => `<p>${escapeHtml(p)}</p>`).join("")}
  <p style="margin-top:28px;">
    <a href="${bookingUrl}"
       style="display:inline-block;background:#2d2319;color:#f0ebe1;padding:12px 28px;text-decoration:none;font-weight:600;border-radius:4px;">
      Book Your Strategy Call →
    </a>
  </p>
  <p style="margin-top:32px;font-size:13px;color:#888;">Syncera Digitale Studio</p>
</div>`,
                });
            }
        } catch (aiErr) {
            // Best-effort — owner notification already succeeded, don't surface this error
            console.error("[AI follow-up] error:", aiErr);
        }
    }

    return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: true }),
    };
};

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export { handler };

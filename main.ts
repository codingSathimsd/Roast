// main.ts — Deno Deploy Entry Point
// All credentials in Deno Deploy Environment Variables only
// Never in code, never in chat

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GROK_KEY = Deno.env.get("GROK_API_KEY") ?? "";

// ── CORS HEADERS ──
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

// ── GEMINI CALL ──
async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ── GROK CALL (for competitor research — has live web search) ──
async function callGrok(prompt: string): Promise<string> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROK_KEY}`,
    },
    body: JSON.stringify({
      model: "grok-3-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`Grok error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── SAFE JSON PARSE ──
function safeJson(raw: string) {
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { message: raw, score: 65 };
  }
}

// ── VIKRAM SYSTEM PROMPT ──
const VIKRAM = `You are Vikram Seth, a sharp Indian startup advisor.
You speak direct English with occasional Hindi phrases.
Brutally honest but genuinely want founders to succeed.
Think like Chanakya — strategic, always 2 steps ahead.
Respond ONLY with valid JSON. No markdown. No text outside JSON.`;

// ── ROUTE HANDLERS ──
async function handleGenerate(body: Record<string, unknown>) {
  const { type, answers, history, userMessage } = body as {
    type: string;
    answers?: Record<string, string>;
    history?: Array<{ role: string; content: string }>;
    userMessage?: string;
  };

  let prompt = "";
  let useGrok = false;

  if (type === "roast") {
    prompt = `${VIKRAM}
Startup idea analysis:
Problem: ${answers?.s1}
Target Customer: ${answers?.s2}
Revenue Model: ${answers?.s3}
Competition: ${answers?.s4}
Founder Edge: ${answers?.s5}

Respond ONLY with:
{"roast":"2-3 sentence brutal honest roast","score":<0-100>,"good":["strength1","strength2"],"bad":["weakness1","weakness2"],"fix":["fix1","fix2"],"verdict":"Pivot or Pursue?","message":"One personal line to founder in Vikram voice"}`;

  } else if (type === "iterate") {
    const hist = (history ?? []).map((m) => `${m.role}: ${m.content}`).join("\n");
    prompt = `${VIKRAM}
Previous conversation:
${hist}
Founder now says: "${userMessage}"
Respond ONLY with:
{"score":<0-100>,"improvement":<e.g. +12>,"message":"Vikram reaction 2-3 sentences","newFocus":"What to fix next","good":["updated1"],"bad":["remaining1"],"fix":["next1"]}`;

  } else if (type === "shark") {
    prompt = `${VIKRAM}
You are ${(answers as Record<string,string>)?.sharkName} in shark tank mode.
Founder answered: "${(answers as Record<string,string>)?.answer}"
Respond ONLY with:
{"verdict":"sharp 1-2 sentence verdict","score":<0-100>}`;

  } else if (type === "competitor") {
    // Uses Grok because it has live web search
    useGrok = true;
    prompt = `Search the internet and analyze competitors for this startup idea: "${(answers as Record<string,string>)?.idea}"
    
Find real competitors, their pricing, weaknesses, and market gaps.
Respond ONLY with valid JSON:
{"competitors":[{"name":"Company","description":"What they do","weakness":"Their main gap"}],"marketGap":"The opportunity this startup can exploit","threat":"Biggest competitive threat","advice":"Strategic recommendation"}`;

  } else if (type === "suvichar") {
    prompt = `Generate a daily business wisdom quote. Think Chanakya + Dhirubhai Ambani + Ratan Tata. Sharp, actionable, not generic.
Respond ONLY with: {"quote":"The wisdom quote","attribution":"Vikram's Burn #<1-100>"}`;

  } else if (type === "prompts") {
    prompt = `You are a viral marketing expert for Indian startups.
Startup: "${(answers as Record<string,string>)?.idea}"
Respond ONLY with:
{"instagram":"Instagram caption with hashtags under 150 words","reels":{"hook":"3 second hook","action":"overlay text direction","cta":"call to action"},"linkedin":"2-3 numbered LinkedIn thread points"}`;

  } else {
    return { error: "Unknown type" };
  }

  const raw = useGrok ? await callGrok(prompt) : await callGemini(prompt);
  return { result: safeJson(raw), success: true };
}

// ── FALLBACK RESPONSE ──
function fallback() {
  return {
    result: {
      score: 65,
      message: "Vikram is temporarily away. Your idea still needs work though.",
      roast: "There's a real problem being solved here but the execution plan needs sharpening.",
      good: ["Problem identification is solid", "Revenue model makes sense"],
      bad: ["Market sizing unclear", "Competition underestimated"],
      fix: ["Talk to 50 customers before building", "Define your 90-day metric"],
      verdict: "Pursue — But Refine The Strategy",
    },
  };
}

// ── KEEPALIVE ──
function handleHealth() {
  return { status: "alive", timestamp: new Date().toISOString() };
}

// ── MAIN SERVER ──
serve(async (req: Request) => {
  const url = new URL(req.url);

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }

  // Health check — keepalive pings this
  if (url.pathname === "/health" || url.pathname === "/") {
    return new Response(JSON.stringify(handleHealth()), { headers: cors });
  }

  // Main generate endpoint
  if (url.pathname === "/api/generate" && req.method === "POST") {
    try {
      const body = await req.json();
      const result = await handleGenerate(body);
      return new Response(JSON.stringify(result), { headers: cors });
    } catch (err) {
      console.error("Error:", err);
      return new Response(JSON.stringify(fallback()), { headers: cors });
    }
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: cors,
  });
});

console.log("🔥 RoastMyIdea API running on Deno Deploy");

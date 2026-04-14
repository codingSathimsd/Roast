import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GROK_KEY = Deno.env.get("GROK_API_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 1024, responseMimeType: "application/json" },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callGrok(prompt: string): Promise<string> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROK_KEY}` },
    body: JSON.stringify({ model: "grok-3-mini", messages: [{ role: "user", content: prompt }], max_tokens: 1024 }),
  });
  if (!res.ok) throw new Error(`Grok ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function safeJson(raw: string) {
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { return { message: raw, score: 65 }; }
}

const VIKRAM = `You are Vikram Seth, a sharp Indian startup advisor. Brutally honest, speaks English with occasional Hindi. Think like Chanakya. Respond ONLY with valid JSON. No markdown.`;

async function handleGenerate(body: Record<string, unknown>) {
  const { type, idea, answers, history, userMessage } = body as {
    type: string; idea?: string;
    answers?: Record<string, string>;
    history?: Array<{ role: string; content: string }>;
    userMessage?: string;
  };

  let prompt = "";
  let useGrok = false;

  if (type === "generateQuestions") {
    // KEY NEW TYPE: generates smart questions based on the actual idea
    prompt = `${VIKRAM}
A founder described their startup idea as: "${idea}"

Generate exactly 4 smart follow-up questions SPECIFIC to this idea.
Each question must dig into a real weakness or assumption in their specific idea.
DO NOT ask generic questions. Make them about THIS idea specifically.

Respond ONLY with this JSON:
{"questions":[
  {
    "question":"question text (use <span class='hl'>key phrase</span> to highlight important words)",
    "options":[
      {"label":"LABEL1","text":"specific answer option 1"},
      {"label":"LABEL2","text":"specific answer option 2"},
      {"label":"LABEL3","text":"specific answer option 3"},
      {"label":"OTHER","text":"Let me explain in my own words..."}
    ]
  }
]}
Return exactly 4 question objects. Cover: target customer, revenue model, competition, founder edge.`;

  } else if (type === "roast") {
    const answerText = Object.entries(answers || {}).map(([k,v]) => `${k}: ${v}`).join('\n');
    prompt = `${VIKRAM}
Startup idea: "${idea}"
Founder answers:
${answerText}

Respond ONLY with:
{"roast":"2-3 sentence brutal honest roast specific to this idea","score":<0-100>,"good":["strength1","strength2"],"bad":["weakness1","weakness2"],"fix":["actionable fix1","actionable fix2"],"verdict":"Pivot or Pursue?","message":"One personal line to founder in Vikram voice"}`;

  } else if (type === "iterate") {
    const hist = (history ?? []).map(m => `${m.role}: ${m.content}`).join("\n");
    prompt = `${VIKRAM}
Original idea: "${idea}"
Conversation so far:
${hist}
Founder now says: "${userMessage}"
They are refining. Give updated analysis.
Respond ONLY with:
{"score":<0-100>,"improvement":<e.g. +12>,"message":"Vikram reaction 2-3 sentences","newFocus":"What to fix next","good":["updated1"],"bad":["remaining1"],"fix":["next action"]}`;

  } else if (type === "shark") {
    prompt = `${VIKRAM}
You are ${(answers as Record<string,string>)?.sharkName} in shark tank.
Original idea: "${idea}"
Founder answered: "${(answers as Record<string,string>)?.answer}"
Respond ONLY with: {"verdict":"sharp 1-2 sentence verdict","score":<0-100>}`;

  } else if (type === "competitor") {
    useGrok = true;
    prompt = `Search the web and find real competitors for: "${idea}"
Respond ONLY with JSON:
{"competitors":[{"name":"Company","description":"What they do","weakness":"Their gap"}],"marketGap":"The opportunity","threat":"Biggest risk","advice":"Strategic recommendation"}`;

  } else if (type === "suvichar") {
    prompt = `Generate a sharp Indian business wisdom quote. Think Chanakya + Dhirubhai + Ratan Tata.
Respond ONLY with: {"quote":"The quote","attribution":"Vikram's Burn #<1-100>"}`;

  } else if (type === "prompts") {
    prompt = `Viral marketing expert for Indian startups.
Startup: "${idea}"
Respond ONLY with:
{"instagram":"Instagram caption with hashtags","reels":{"hook":"3 sec hook","action":"visual direction","cta":"call to action"},"linkedin":"2-3 numbered LinkedIn points"}`;

  } else {
    return { error: "Unknown type" };
  }

  const raw = useGrok ? await callGrok(prompt) : await callGemini(prompt);
  return { result: safeJson(raw), success: true };
}

function fallback() {
  return { result: { score: 65, message: "Vikram is temporarily away. Your idea still needs work.", roast: "Real problem, weak execution.", good: ["Problem identification solid"], bad: ["No clear CAC plan"], fix: ["Talk to 50 customers first"], verdict: "Pursue — Refine The Strategy", questions: [] } };
}

serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (url.pathname === "/health" || url.pathname === "/") return new Response(JSON.stringify({ status: "alive", ts: Date.now() }), { headers: cors });
  if (url.pathname === "/api/generate" && req.method === "POST") {
    try {
      const body = await req.json();
      const result = await handleGenerate(body);
      return new Response(JSON.stringify(result), { headers: cors });
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify(fallback()), { headers: cors });
    }
  }
  return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: cors });
});

console.log("🔥 RoastMyIdea API on Deno Deploy");

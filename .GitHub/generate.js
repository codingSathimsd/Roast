// api/generate.js — Vercel Serverless Function
// Credentials ONLY in Vercel Environment Variables — never in code

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type, answers, history, userMessage } = req.body;

    const vikramSystem = `You are Vikram Seth, a sharp Indian startup advisor.
You speak direct English with occasional Hindi. You are brutally honest but want founders to succeed.
You think like Chanakya — strategic, always 2 steps ahead.
Respond ONLY with valid JSON. No markdown backticks. No text outside JSON.`;

    let prompt = '';

    if (type === 'roast') {
      prompt = `${vikramSystem}
Analyze this startup idea:
Problem: ${answers?.s1}
Target Customer: ${answers?.s2}
Revenue Model: ${answers?.s3}
Competition: ${answers?.s4}
Founder Edge: ${answers?.s5}

Respond ONLY with this JSON:
{"roast":"2-3 sentence brutal honest roast","score":<0-100>,"good":["strength1","strength2"],"bad":["weakness1","weakness2"],"fix":["fix1","fix2"],"verdict":"Pivot or Pursue?","message":"One personal line to founder in Vikram voice"}`;

    } else if (type === 'iterate') {
      const hist = (history || []).map(m => `${m.role}: ${m.content}`).join('\n');
      prompt = `${vikramSystem}
Previous conversation:
${hist}
Founder now says: "${userMessage}"
They are refining their idea based on your feedback.
Respond ONLY with:
{"score":<updated 0-100>,"improvement":<change e.g. +12>,"message":"Vikram reaction 2-3 sentences","newFocus":"What to fix next","good":["updated1"],"bad":["remaining1"],"fix":["next1"]}`;

    } else if (type === 'shark') {
      prompt = `${vikramSystem}
You are playing ${answers?.sharkName} in a shark tank simulation.
Founder answered: "${answers?.answer}"
Respond ONLY with:
{"verdict":"sharp 1-2 sentence verdict","score":<0-100>}`;

    } else if (type === 'suvichar') {
      prompt = `Generate a daily business wisdom quote in English. Think Chanakya + Dhirubhai Ambani + Ratan Tata. Sharp, actionable, not generic.
Respond ONLY with: {"quote":"The wisdom quote","attribution":"Vikram's Burn #<1-100>"}`;

    } else if (type === 'prompts') {
      prompt = `You are a viral marketing expert for Indian startups.
Startup: "${answers?.idea}"
Generate marketing content. Respond ONLY with:
{"instagram":"Instagram caption with hashtags under 150 words","reels":{"hook":"3 second hook","action":"overlay text direction","cta":"call to action"},"linkedin":"2-3 numbered LinkedIn thread points"}`;

    } else {
      return res.status(400).json({ error: 'Unknown type' });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 1024, responseMimeType: 'application/json' }
        })
      }
    );

    if (!geminiRes.ok) throw new Error(`Gemini error: ${geminiRes.status}`);

    const gData = await geminiRes.json();
    const raw = gData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('Empty response');

    let result;
    try { result = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
    catch { result = { message: raw, score: 65 }; }

    return res.status(200).json({ result, success: true });

  } catch (err) {
    console.error(err.message);
    return res.status(200).json({
      result: {
        score: 65, message: "Vikram is temporarily away. Your idea still needs work though.",
        roast: "There's a real problem being solved here but the execution plan needs sharpening.",
        good: ["Problem identification is solid", "Revenue model makes sense"],
        bad: ["Market sizing unclear", "Competition underestimated"],
        fix: ["Talk to 50 customers before building", "Define your 90-day metric"],
        verdict: "Pursue — But Refine The Strategy"
      }
    });
  }
}

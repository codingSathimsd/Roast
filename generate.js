// netlify/functions/generate.js
// Netlify serverless function — replaces Deno Deploy main.ts
// Add env vars in: Netlify → Site Settings → Environment Variables

exports.handler = async function(event, context) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
  const GROK_KEY = process.env.GROK_API_KEY || '';

  const VIKRAM = `You are Vikram Seth, a sharp Indian startup advisor. Brutally honest, speaks English with occasional Hindi. Think like Chanakya. Respond ONLY with valid JSON. No markdown backticks.`;

  try {
    const body = JSON.parse(event.body || '{}');
    const { type, idea, answers, history, userMessage } = body;

    let prompt = '';
    let useGrok = false;

    if (type === 'generateQuestions') {
      prompt = `${VIKRAM}
A founder described their startup idea as: "${idea}"

Generate exactly 4 smart follow-up questions SPECIFIC to this idea.
Each question must dig into a real weakness specific to THEIR idea.
DO NOT ask generic questions. Make them about THIS idea.

Respond ONLY with this exact JSON (no other text):
{"questions":[
  {"question":"question text (use <span class='hl'>key phrase</span> to highlight)","options":[{"label":"LABEL","text":"answer option"}]},
  {"question":"...","options":[...]},
  {"question":"...","options":[...]},
  {"question":"...","options":[...]}
]}`;

    } else if (type === 'roast') {
      const ans = Object.entries(answers || {}).map(([k,v]) => `${k}: ${v}`).join('\n');
      prompt = `${VIKRAM}
Startup idea: "${idea}"
Founder's answers:
${ans}

Respond ONLY with this JSON:
{"roast":"2-3 sentence brutal honest roast","score":<0-100>,"good":["strength1","strength2"],"bad":["weakness1","weakness2"],"fix":["fix1","fix2"],"verdict":"Pivot or Pursue?","message":"One personal line to founder in Vikram voice"}`;

    } else if (type === 'iterate') {
      const hist = (history || []).map(m => `${m.role}: ${m.content}`).join('\n');
      prompt = `${VIKRAM}
Original idea: "${idea}"
Conversation: ${hist}
Founder now says: "${userMessage}"
Respond ONLY with:
{"score":<0-100>,"improvement":<e.g. +12>,"message":"Vikram 2-3 sentence reaction","newFocus":"Next thing to fix","good":["updated1"],"bad":["remaining1"],"fix":["next action"]}`;

    } else if (type === 'shark') {
      prompt = `${VIKRAM}
You are ${answers?.sharkName} in shark tank.
Idea: "${idea}"
Founder answered: "${answers?.answer}"
Respond ONLY with: {"verdict":"1-2 sentence verdict","score":<0-100>}`;

    } else if (type === 'competitor') {
      useGrok = true;
      prompt = `Search web for real competitors for: "${idea}"
Respond ONLY with JSON:
{"competitors":[{"name":"Company","description":"What they do","weakness":"Their gap"}],"marketGap":"The opportunity","threat":"Biggest risk","advice":"Strategic recommendation"}`;

    } else if (type === 'suvichar') {
      prompt = `Generate a sharp Indian business wisdom quote. Think Chanakya + Dhirubhai + Ratan Tata. Sharp, not generic.
Respond ONLY with: {"quote":"The quote","attribution":"Vikram's Burn #<1-100>"}`;

    } else if (type === 'prompts') {
      prompt = `Viral marketing expert for Indian startups.
Startup: "${idea}"
Respond ONLY with:
{"instagram":"Instagram caption with hashtags under 150 words","reels":{"hook":"3 sec hook","action":"visual direction","cta":"call to action"},"linkedin":"2-3 numbered LinkedIn thread points"}`;

    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown type' }) };
    }

    // Call Gemini or Grok
    let raw = '';
    if (useGrok && GROK_KEY) {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROK_KEY}` },
        body: JSON.stringify({ model: 'grok-3-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 1024 })
      });
      const data = await res.json();
      raw = data.choices?.[0]?.message?.content || '';
    } else {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.8, maxOutputTokens: 1024, responseMimeType: 'application/json' }
          })
        }
      );
      const data = await res.json();
      raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    let result;
    try { result = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
    catch { result = { message: raw, score: 65 }; }

    return { statusCode: 200, headers, body: JSON.stringify({ result, success: true }) };

  } catch (err) {
    console.error('Function error:', err.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        result: {
          score: 67,
          message: "The idea has fire. The plan needs fuel. Here is your score.",
          roast: "Real problem identified but execution plan needs serious work.",
          good: ["Problem is genuine", "Revenue model makes sense"],
          bad: ["No customer acquisition plan", "Competition underestimated"],
          fix: ["Talk to 50 customers before building", "Define your 90-day metric"],
          verdict: "Pursue — Refine The Strategy",
          questions: []
        }
      })
    };
  }
};
    

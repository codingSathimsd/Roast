// netlify/functions/generate.js
exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };
  if (event.httpMethod !== 'POST') return { statusCode:405, headers, body: JSON.stringify({error:'Method not allowed'}) };

  const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
  const GROK_KEY   = process.env.GROK_API_KEY || '';

  async function callGemini(prompt, isJson) {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 1500 }
    };
    if (isJson !== false) body.generationConfig.responseMimeType = 'application/json';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }
    );
    if (!res.ok) throw new Error('Gemini '+res.status);
    const d = await res.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  function safeJson(raw) {
    try { return JSON.parse(raw.replace(/```json|```/g,'').trim()); }
    catch(e) { return { type:'question', message: raw, input_type:'text' }; }
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { type, messages, idea, answers, history, userMessage } = body;
    let raw = '';

    // ── VIKRAM CHAT (main conversation engine) ──
    if (type === 'vikram_chat') {
      const prompt = messages.map(m => m.content).join('\n\n');
      raw = await callGemini(prompt, true);
      const result = safeJson(raw);
      return { statusCode:200, headers, body: JSON.stringify({ result, success:true }) };
    }

    // ── ROAST (called from result page) ──
    if (type === 'roast') {
      const ans = Object.entries(answers||{}).map(([k,v])=>`${k}: ${v}`).join('\n');
      const prompt = `You are Vikram Seth, sharp Indian startup advisor. Respond ONLY with JSON.
Startup idea: "${idea}"
Answers: ${ans}
{"roast":"brutal 2-3 sentence roast","score":<0-100>,"good":["s1","s2"],"bad":["w1","w2"],"fix":["f1","f2"],"verdict":"Pursue/Pivot/Kill It","message":"Personal line to founder"}`;
      raw = await callGemini(prompt, true);
      return { statusCode:200, headers, body: JSON.stringify({ result: safeJson(raw), success:true }) };
    }

    // ── ITERATE ──
    if (type === 'iterate') {
      const hist = (history||[]).map(m=>`${m.role}: ${m.content}`).join('\n');
      const prompt = `You are Vikram Seth. Original idea: "${idea}". Conversation: ${hist}. Founder says: "${userMessage}". Respond ONLY with JSON: {"score":<0-100>,"improvement":<e.g.+12>,"message":"reaction","newFocus":"next fix","good":["u1"],"bad":["r1"],"fix":["n1"]}`;
      raw = await callGemini(prompt, true);
      return { statusCode:200, headers, body: JSON.stringify({ result: safeJson(raw), success:true }) };
    }

    // ── SUVICHAR ──
    if (type === 'suvichar') {
      raw = await callGemini('Generate a sharp Indian business wisdom quote. Think Chanakya + Dhirubhai + Ratan Tata. Sharp, not generic. Respond ONLY with JSON: {"quote":"The quote","attribution":"Vikram\'s Burn #<1-100>"}', true);
      return { statusCode:200, headers, body: JSON.stringify({ result: safeJson(raw), success:true }) };
    }

    // ── PROMPTS ──
    if (type === 'prompts') {
      raw = await callGemini(`Viral marketing expert for Indian startups. Startup: "${idea}". Respond ONLY with JSON: {"instagram":"caption with hashtags","reels":{"hook":"3sec","action":"direction","cta":"cta"},"linkedin":"2-3 numbered points"}`, true);
      return { statusCode:200, headers, body: JSON.stringify({ result: safeJson(raw), success:true }) };
    }

    // ── COMPETITOR (uses Grok for web search) ──
    if (type === 'competitor' && GROK_KEY) {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${GROK_KEY}`},
        body: JSON.stringify({ model:'grok-3-mini', messages:[{role:'user',content:`Search web for competitors for: "${idea}". JSON: {"competitors":[{"name":"","description":"","weakness":""}],"marketGap":"","threat":"","advice":""}`}], max_tokens:1024 })
      });
      const d = await res.json();
      raw = d.choices?.[0]?.message?.content||'{}';
      return { statusCode:200, headers, body: JSON.stringify({ result: safeJson(raw), success:true }) };
    }

    return { statusCode:400, headers, body: JSON.stringify({error:'Unknown type'}) };

  } catch(err) {
    console.error(err.message);
    // Smart fallback — keeps conversation going
    const fallbacks = [
      {type:'question', message:"Interesting. Ab batao — tumne is idea ke liye koi customer se baat ki hai? If yes, what did they say?", input_type:'text', hint:'Tell me about a real conversation with a potential customer...'},
      {type:'question', message:"Theek hai. Competition ke baare mein bolo — jo already exist karta hai, usse better kaise ho tum?", input_type:'text'},
      {type:'question', message:"Yaar, ye sab theek hai — but how do you make money? Be specific. Subscription? Commission? One-time fee?", input_type:'single_choice', options:['Monthly subscription','Commission per transaction','One-time purchase','Freemium model','B2B licensing']},
    ];
    const fb = fallbacks[Math.floor(Math.random()*fallbacks.length)];
    return { statusCode:200, headers, body: JSON.stringify({ result: fb }) };
  }
};
      

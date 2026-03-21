'use strict';
const fetch = require('node-fetch');

// Updated March 2026 — 2.0 Flash deprecated, migrated to 2.5 series
// Free tier: 2.5 Flash-Lite (15 RPM, 1000 RPD) for chat, 2.5 Flash (10 RPM, 250 RPD) for deep/review
const GEMINI_LITE  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_KEY}`;
const GEMINI_FLASH = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_KEY}`;
const GEMINI_PRO   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_KEY}`;

const SYS_PROMPT = `You are DevCollab AI — an expert technical assistant embedded in DevCollab Hub, an enterprise developer collaboration platform. You have deep expertise in: React/Next.js, Node.js, Express, PostgreSQL, Supabase, Socket.io, GitHub API, JWT auth, AES-256 encryption. Be direct, technical, and precise. Format code with language-tagged fenced blocks. For errors: give root cause + fix + prevention. Keep responses concise and actionable.`;

async function geminiChat(messages, mode = 'lite') {
  const key = process.env.GEMINI_KEY;
  if (!key) throw new Error('GEMINI_KEY not set in environment');

  // Route by mode: lite=fast chat, flash=normal, pro=deep analysis
  const url = mode === 'pro' ? GEMINI_PRO : mode === 'flash' ? GEMINI_FLASH : GEMINI_LITE;
  const modelName = mode === 'pro' ? 'gemini-2.5-pro' : mode === 'flash' ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite';

  const body = {
    contents: messages,
    systemInstruction: { parts: [{ text: SYS_PROMPT }] },
    generationConfig: {
      temperature: mode === 'pro' ? 0.2 : 0.7,
      maxOutputTokens: mode === 'pro' ? 8192 : mode === 'flash' ? 4096 : 2048,
      topP: 0.95,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const msg = e.error?.message || `Gemini API error ${res.status}`;
    // If quota exceeded on pro/flash, fall back to lite
    if (res.status === 429 && mode !== 'lite') {
      console.warn(`[AI] Quota hit on ${modelName}, falling back to flash-lite`);
      return geminiChat(messages, 'lite');
    }
    throw new Error(msg);
  }

  const data = await res.json();
  return {
    reply: data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response',
    usage: data.usageMetadata || {},
    model: modelName,
  };
}

module.exports = { geminiChat };

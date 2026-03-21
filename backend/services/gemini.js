'use strict';
const fetch = require('node-fetch');

const GEMINI_FLASH = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_KEY}`;
const GEMINI_PRO   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-05-06:generateContent?key=${process.env.GEMINI_KEY}`;

const SYS_PROMPT = `You are DevCollab AI — an expert technical assistant embedded in DevCollab Hub, an enterprise developer collaboration platform. You have deep expertise in: React/Next.js, Node.js, Express, MongoDB, PostgreSQL, Supabase, Socket.io, GitHub API, JWT auth, AES-256 encryption, and Gemini AI. Be direct, technical, and precise. Format code with language-tagged fenced blocks. For errors: give root cause + fix + prevention.`;

async function geminiChat(messages, mode = 'flash') {
  const key = process.env.GEMINI_KEY;
  if (!key) throw new Error('GEMINI_KEY not set in environment');

  const url = (mode === 'pro') ? GEMINI_PRO : GEMINI_FLASH;
  const body = {
    contents: messages,
    systemInstruction: { parts: [{ text: SYS_PROMPT }] },
    generationConfig: {
      temperature: mode === 'pro' ? 0.2 : 0.7,
      maxOutputTokens: mode === 'pro' ? 8192 : 2048,
      topP: 0.95,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',   threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `Gemini API error ${res.status}`);
  }

  const data = await res.json();
  return {
    reply: data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response',
    usage: data.usageMetadata || {},
  };
}

module.exports = { geminiChat };

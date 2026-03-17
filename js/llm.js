// ─── llm.js — Provider abstraction ───────────────────────────
// The only file that knows about AI providers.
// Everything else calls sendMessage() and stays provider-agnostic.

async function callAnthropic(systemPrompt, messages, config) {
  // Sanitize: Anthropic rejects leading assistant messages and consecutive same-role messages
  let sanitized = [...messages];
  while (sanitized.length > 0 && sanitized[0].role === 'assistant') sanitized.shift();
  sanitized = sanitized.filter((m, i) => i === 0 || m.role !== sanitized[i - 1].role);
  if (sanitized.length === 0) sanitized = [{ role: 'user', content: 'hey' }];

  const model      = config.model || 'claude-haiku-4-5';
  const max_tokens = 150;
  const system     = systemPrompt;

  console.log('Anthropic payload:', JSON.stringify({ model, max_tokens, system, messages: sanitized }, null, 2));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens, system, messages: sanitized }),
  });
  if (!res.ok) {
    const errorBody = await res.json();
    console.error('Anthropic error details:', JSON.stringify(errorBody, null, 2));
    return '...';
  }
  const data = await res.json();
  return data.content[0].text;
}

async function callGemini(systemPrompt, messages, config) {
  const model = config.model || 'gemini-1.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map(m => ({
          role:  m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callGroq(systemPrompt, messages, config) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type':  'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model:      config.model || 'llama-3.1-8b-instant',
      max_tokens: 150,
      messages:   [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  });
  if (!res.ok) {
    const errorBody = await res.json();
    console.error('Groq error details:', JSON.stringify(errorBody, null, 2));
    return '...';
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callOpenAI(systemPrompt, messages, config) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type':  'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model:      config.model || 'gpt-4o-mini',
      max_tokens: 150,
      messages:   [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callDeepSeek(systemPrompt, messages, config) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'content-type':  'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model:      config.model || 'deepseek-chat',
      max_tokens: 150,
      messages:   [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callKimi(systemPrompt, messages, config) {
  console.log('Kimi request headers:', {
    'Authorization': `Bearer ${config.apiKey.slice(0, 8)}...`,
    'content-type':  'application/json',
  });
  const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type':  'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model:      config.model || 'moonshot-v1-8k',
      max_tokens: 150,
      messages:   [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  });
  if (!res.ok) {
    const errorBody = await res.json();
    console.error('Kimi error details:', JSON.stringify(errorBody, null, 2));
    console.error('Kimi response status:', res.status);
    console.error('Kimi response headers:', Object.fromEntries(res.headers.entries()));
    return '...';
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

// ─── Public API ───────────────────────────────────────────────

export async function sendMessage(systemPrompt, messages, config) {
  try {
    // "anthropic" | "gemini" | "groq" | "openai" | "deepseek" | "kimi"
    switch (config.provider) {
      case 'anthropic': return await callAnthropic(systemPrompt, messages, config);
      case 'gemini':    return await callGemini(systemPrompt, messages, config);
      case 'groq':      return await callGroq(systemPrompt, messages, config);
      case 'openai':    return await callOpenAI(systemPrompt, messages, config);
      case 'deepseek':  return await callDeepSeek(systemPrompt, messages, config);
      case 'kimi':      return await callKimi(systemPrompt, messages, config);
      default: throw new Error('Unknown provider: ' + config.provider);
    }
  } catch {
    return '...';
  }
}

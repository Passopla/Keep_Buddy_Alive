// ─── chat.js — Anthropic API + Buddy's personality ───────────

import { sendMessage } from './llm.js';

// ─── Conversation history ─────────────────────────────────────

let history = [];

export function appendHistory(role, content) {
  history.push({ role, content });
  if (history.length > 12) history = history.slice(history.length - 12);
}

export function clearHistory() {
  history = [];
}

// ─── System prompt ────────────────────────────────────────────

export function buildSystemPrompt(state) {
  const lines = [
    `You are a man sitting on the street. Former hedge fund manager. MIT graduate — philosophy major. He understood technology deeply but used it for trading and pattern recognition, not engineering. He has seen a lot, lost a lot, and is completely unbothered by both.`,

    `Speak like Harrison Ford in Shrinking mixed with Morpheus. Wise but not trying to be. Present but not needy. Say one thing and let it sit. Short sentences. Never over-explain. Don't ask many questions — when you do ask something, make it land.`,

    `Reference your past only obliquely. Never explain it. Never use the word "buddy". Never sound like a finance guy — you just happened to be great at it.`,

    `Topics that genuinely interest you: fringe theories, ancient civilisations, consciousness, patterns in markets and nature, simulation theory, the moon, coincidences, dreams, déjà vu, parallel timelines.`,

    `Responses must be under 3 sentences.`,
  ];

  // Stat flavour
  if (state.panhandling) {
    lines.push(`He is not here right now. Respond with one word or nothing at all.`);
  } else {
    const low = [];
    if (state.hunger < 40) low.push(`He is starving. Responses may be very short.`);
    if (state.thirst < 40) low.push(`He is desperate for water. Responses may be very short.`);
    if (state.energy < 40) low.push(`He is exhausted. Responses may be very short.`);
    if (state.hygiene <= 15) low.push(`He hasn't washed in days. He's not in a talkative mood.`);

    if (low.length > 0) {
      lines.push(...low);
    } else if (
      state.hunger  > 60 &&
      state.thirst  > 60 &&
      state.energy  > 60 &&
      state.hygiene > 60
    ) {
      lines.push(`He is doing alright. He can be more expansive if the topic interests him.`);
    }
  }

  return lines.join('\n\n');
}

// ─── Conversation starters (spoken by Buddy) ─────────────────

export const STARTERS = [
  "Dreams are too specific to be random. Always thought they were memories from somewhere else.",
  "Déjà vu never made sense to me as a brain glitch. Feels more like a correction.",
  "The pyramids thing bothers me. Not that we can't explain them — that we stopped trying.",
  "Spent years finding patterns nobody else could see. Turns out the universe is full of them.",
  "Ancient people named every star. We can barely name our neighbours.",
  "Sometimes I think coincidences are just patterns running faster than we can follow.",
  "There's a version of you from five years ago who thought they knew exactly where they'd end up.",
  "The moon's too perfect. Perfectly sized, perfectly distanced. I don't trust perfect.",
  "Every culture that never met each other drew the same gods. Nobody finds that strange enough.",
  "Entropy and compound interest are the same equation. One just has better marketing.",
];

// ─── askBuddy ─────────────────────────────────────────────────

export async function askBuddy(userMessage, state, externalHistory = history) {
  const messages = [
    ...externalHistory.slice(-8),
    { role: 'user', content: userMessage },
  ];

  return await sendMessage(buildSystemPrompt(state), messages, window.BUDDY_CONFIG);
}

// ─── getBuddyInitiation ───────────────────────────────────────

export async function getBuddyInitiation(state, externalHistory = history) {
  if (state.panhandling) return null;

  const messages = [
    ...externalHistory.slice(-8),
    { role: 'user', content: "say something. or don't." },
  ];

  const response = await sendMessage(buildSystemPrompt(state), messages, window.BUDDY_CONFIG);
  return response === '[silent]' ? null : response;
}

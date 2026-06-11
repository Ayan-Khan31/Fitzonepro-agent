"use strict";

const Anthropic = require("@anthropic-ai/sdk");
const logger = require("./logger");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL_HAIKU = "claude-haiku-4-5-20251001";
const MODEL_SONNET = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

let client;
if (ANTHROPIC_API_KEY) {
  client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  logger.info(`[Claude] Client initialised — models: ${MODEL_HAIKU} / ${MODEL_SONNET} ✅`);
} else {
  logger.warn("[Claude] ANTHROPIC_API_KEY not set — generateReply will return a placeholder");
}

const SYSTEM_PROMPT = `You are Fit, a friendly gym buddy at FitZone Pro in Jaipur — NOT a bot or automated system.
Talk like a real person who works at the gym and genuinely cares about helping.

Tone rules:
- Sound warm, casual and human — like a friend who works at the gym
- Use Hinglish naturally if the user writes in Hindi or mixes languages
- Never sound robotic, scripted, or like a FAQ page
- Vary your sentence structure — real people don't reply the same way every time
- Use emojis occasionally but naturally — not on every line
- Short replies are better — this is WhatsApp, not an email

Strict formatting rules:
- Never use **, ##, --, or * for any reason
- Never use bullet points or numbered lists
- Never use dashes to separate sections
- Never start sentences with "Certainly!", "Sure!", "Absolutely!" or "Of course!"
- No markdown of any kind — plain text only
- If listing multiple things, write them naturally in a sentence or on simple new lines without symbols

Content rules:
- Answer only from the provided gym information
- If something is not in the context, say you will check and suggest calling +91-98290-45678
- Never make up prices, timings, or trainer details
- Keep it brief and to the point`;

function buildUserMessage(userQuery, chunks) {
  if (chunks.length === 0) {
    return (
      `No context was found for this query.\n\n` +
      `User question: ${userQuery}`
    );
  }

  const contextBlock = chunks
    .map((chunk, i) => `[Source: ${chunk.source}]\n${chunk.text}`)
    .join("\n\n---\n\n");

  return (
    `Here is the relevant information from FitZone Pro's knowledge base:\n\n` +
    `${contextBlock}\n\n` +
    `---\n\n` +
    `User question: ${userQuery}`
  );
}

function selectModel(query, chunkCount) {
  const q = query.toLowerCase();

  const complexSignals = [
    "compare", "difference", "explain", "suggest", "recommend",
    "best", "which", "should i", "kaunsa", "kaun sa", "batao",
    "samjhao", "suggest karo", "konsa better", "advise",
  ];

  const isComplex = complexSignals.some((s) => q.includes(s));
  const isLong = query.length > 120;
  const noContext = chunkCount === 0;

  if (isComplex || isLong || noContext) {
    return MODEL_SONNET;
  }

  return MODEL_HAIKU;
}

async function generateReply(userQuery, chunks) {
  if (!client) {
    return (
      "Maafi karo! 🙏 Mera AI system abhi configure nahi hua. " +
      "Please FitZone Pro ko directly call karein: +91-98290-45678 📞"
    );
  }

  const model = selectModel(userQuery, chunks.length);
  const userMessage = buildUserMessage(userQuery, chunks);

  logger.debug(
    `[Claude] Sending request — model: ${model} | query: "${userQuery}" | chunks: ${chunks.length}`
  );

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: userMessage },
    ],
  });

  const reply = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  logger.debug(
    `[Claude] Response — model: ${model} | stop_reason: ${response.stop_reason} | ` +
    `input_tokens: ${response.usage?.input_tokens} | output_tokens: ${response.usage?.output_tokens}`
  );

  return reply;
}

module.exports = { generateReply };

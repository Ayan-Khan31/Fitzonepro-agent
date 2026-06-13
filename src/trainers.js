"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const logger = require("./logger");

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const GRAPH_API_VERSION = "v19.0";
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`;

const KNOWLEDGE_PATH = path.resolve(__dirname, "../data/gym-knowledge.json");

let _trainers = null;

function getTrainers() {
  if (_trainers) return _trainers;
  try {
    const raw = fs.readFileSync(KNOWLEDGE_PATH, "utf8");
    _trainers = JSON.parse(raw).trainers ?? [];
    logger.debug(`[Trainers] Loaded ${_trainers.length} trainer(s) from gym-knowledge.json`);
  } catch (err) {
    logger.error(`[Trainers] Failed to load gym-knowledge.json: ${err.message}`);
    _trainers = [];
  }
  return _trainers;
}

const TRAINER_KEYWORDS = [
  "trainer", "trainers", "coach", "coaches", "instructor", "instructors",
  "staff", "team", "personal trainer",
  "trainer kaun hai", "trainer batao", "trainer kon hai",
  "coach kaun hai", "coach batao",
  "trainer chahiye", "trainer dikhao", "trainer list",
  "kaun trainer", "koi trainer", "trainer available",
  "gym staff", "gym team", "gym coach",
];

function detectTrainerQuery(text) {
  const lower = text.toLowerCase().trim();
  return TRAINER_KEYWORDS.some((kw) => lower.includes(kw));
}

async function sendTrainerList(phone) {
  const trainers = getTrainers();

  if (trainers.length === 0) {
    logger.warn("[Trainers] No trainers found — cannot build interactive list");
    return;
  }

  const rows = trainers.map((t) => ({
    id: `trainer_${t.id}`,
    title: t.name.slice(0, 24),
    description: t.role.slice(0, 72),
  }));

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "💪 FitZone Pro Trainers",
      },
      body: {
        text: "Hamare certified trainers ki list neeche hai. Kisi bhi trainer ka naam select karo aur unki poori profile dekho!",
      },
      footer: {
        text: "FitZone Pro — Malviya Nagar, Jaipur",
      },
      action: {
        button: "Trainers Dekho",
        sections: [
          {
            title: "Our Expert Team",
            rows,
          },
        ],
      },
    },
  };

  try {
    const response = await axios.post(GRAPH_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 10_000,
    });
    logger.info(
      `[Trainers] 📋 Interactive trainer list sent to ${phone} — ` +
      `msg id: ${response.data?.messages?.[0]?.id}`
    );
  } catch (err) {
    const detail = err.response?.data ?? err.message;
    logger.error(`[Trainers] Failed to send trainer list to ${phone}:`, detail);
    throw err;
  }
}

async function sendTrainerProfile(phone, trainerId) {
  const trainers = getTrainers();

  const trainer = trainers.find(
    (t) =>
      `trainer_${t.id}` === trainerId ||
      t.id === trainerId ||
      t.name.toLowerCase() === trainerId.toLowerCase()
  );

  if (!trainer) {
    logger.warn(`[Trainers] No trainer found for id/name: "${trainerId}"`);
    await sendFallbackText(
      phone,
      "Sorry, trainer profile nahi mila. Kripya list mein se dobara select karein. 🙏"
    );
    return;
  }

  const batches = trainer.available_batches
    .map((b) => b.charAt(0).toUpperCase() + b.slice(1))
    .join(" & ");

  const certLines = trainer.certifications
    .map((c) => `   ✅ ${c}`)
    .join("\n");

  const specLines = trainer.specializations
    .map((s) => `   • ${s}`)
    .join("\n");

  const profile =
    `👤 *${trainer.name}*\n` +
    `🏅 _${trainer.role}_\n\n` +
    `⏳ *Experience:* ${trainer.experience_years} years\n\n` +
    `🎯 *Specializations:*\n${specLines}\n\n` +
    `🕐 *Available Batches:* ${batches}\n\n` +
    `🗣️ *Languages:* ${trainer.languages.join(", ")}\n\n` +
    `📜 *Certifications:*\n${certLines}\n\n` +
    `📝 *About:*\n${trainer.about}\n\n` +
    `📞 Book a session: +91-98290-45678`;

  await sendFallbackText(phone, profile);

  logger.info(`[Trainers] ✅ Profile sent for "${trainer.name}" to ${phone}`);
}

async function sendFallbackText(to, text) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      preview_url: false,
      body: text,
    },
  };

  try {
    const response = await axios.post(GRAPH_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 10_000,
    });
    logger.debug(
      `[Trainers] Text message sent — msg id: ${response.data?.messages?.[0]?.id}`
    );
  } catch (err) {
    const detail = err.response?.data ?? err.message;
    logger.error(`[Trainers] Failed to send text to ${to}:`, detail);
    throw err;
  }
}

module.exports = { detectTrainerQuery, sendTrainerList, sendTrainerProfile };

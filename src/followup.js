"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const logger = require("./logger");

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const GRAPH_API_VERSION = "v19.0";
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`;

const FOLLOWUPS_PATH = path.resolve(__dirname, "../data/followups.json");
const INTERVAL_MS = 30 * 60 * 1000;
const DELAY_MS = 24 * 60 * 60 * 1000;

function readFollowUps() {
  if (!fs.existsSync(FOLLOWUPS_PATH)) return [];
  try {
    const raw = fs.readFileSync(FOLLOWUPS_PATH, "utf8").trim();
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    logger.warn(`[FollowUp] Could not parse followups.json: ${err.message} — returning empty`);
    return [];
  }
}

function writeFollowUps(data) {
  fs.writeFileSync(FOLLOWUPS_PATH, JSON.stringify(data, null, 2), "utf8");
}

function scheduleFollowUp(phone, name, query) {
  const followups = readFollowUps();

  const alreadyQueued = followups.some(
    (f) => f.phone === phone && f.sent === false
  );

  if (alreadyQueued) {
    logger.debug(`[FollowUp] Skipped — unsent follow-up already queued for ${phone}`);
    return;
  }

  const entry = {
    phone,
    name,
    query,
    scheduledAt: new Date(Date.now() + DELAY_MS).toISOString(),
    sent: false,
  };

  followups.push(entry);
  writeFollowUps(followups);

  logger.info(
    `[FollowUp] 📅 Scheduled for ${phone} ("${name}") at ${entry.scheduledAt}`
  );
}

async function sendFollowUpMessage(to, name) {
  const body =
    `Hey ${name}! 👋 FitZone Pro mein aapka interest tha.\n` +
    `Abhi join karo toh pehle mahine pe special discount milega!\n` +
    `Koi bhi sawaal ho toh batao, main help karta hoon 😊💪`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      preview_url: false,
      body,
    },
  };

  const response = await axios.post(GRAPH_API_URL, payload, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    timeout: 10_000,
  });

  logger.debug(
    `[FollowUp] WhatsApp sent to ${to} — msg id: ${response.data?.messages?.[0]?.id}`
  );
}

async function processFollowUps() {
  logger.info("[FollowUp] ⏰ Starting 30-minute follow-up interval");

  const tick = async () => {
    logger.debug("[FollowUp] 🔄 Checking due follow-ups…");

    const followups = readFollowUps();
    const now = Date.now();

    const due = followups.filter(
      (f) => !f.sent && new Date(f.scheduledAt).getTime() <= now
    );

    if (due.length === 0) {
      logger.debug("[FollowUp] No due follow-ups found");
      return;
    }

    logger.info(`[FollowUp] Found ${due.length} due follow-up(s) — processing`);

    for (const entry of due) {
      try {
        await sendFollowUpMessage(entry.phone, entry.name);
        entry.sent = true;
        entry.sentAt = new Date().toISOString();
        logger.info(
          `[FollowUp] ✅ Follow-up sent to ${entry.phone} ("${entry.name}")`
        );
      } catch (err) {
        const detail = err.response?.data ?? err.message;
        logger.error(
          `[FollowUp] ❌ Failed to send follow-up to ${entry.phone}: ${err.message}`,
          detail
        );
      }
    }

    writeFollowUps(followups);
    logger.info("[FollowUp] 💾 followups.json updated");
  };

  await tick();
  setInterval(tick, INTERVAL_MS);
}

module.exports = { scheduleFollowUp, processFollowUps };

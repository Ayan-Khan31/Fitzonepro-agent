"use strict";

const express = require("express");
const axios = require("axios");
const { retrieveChunks } = require("./rag");
const { generateReply } = require("./claude");
const { processLeadFlow } = require("./leads");
const { detectTrainerQuery, sendTrainerList, sendTrainerProfile } = require("./trainers");
const logger = require("./logger");

const router = express.Router();

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const GRAPH_API_VERSION = "v19.0";
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`;

if (!VERIFY_TOKEN || !WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
  logger.warn(
    "⚠️  One or more required environment variables are missing: " +
    "VERIFY_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID. " +
    "Webhook will not function correctly."
  );
}

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  logger.info(`[Webhook] GET verification request — mode: ${mode}`);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    logger.info("[Webhook] ✅ Verification successful");
    return res.status(200).send(challenge);
  }

  logger.warn(`[Webhook] ❌ Verification failed — token mismatch or wrong mode`);
  return res.status(403).json({ error: "Verification failed" });
});

router.post("/", async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;

    if (!isWhatsAppEvent(body)) {
      logger.debug("[Webhook] Ignored non-WhatsApp-message event");
      return;
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages || value.messages.length === 0) {
      logger.debug("[Webhook] No messages in payload — likely a status update, skipping");
      return;
    }

    const message = value.messages[0];

    const senderPhone = message.from;
    logger.info(`[DEBUG] Sender phone extracted: ${senderPhone}`);
    const messageId = message.id;
    const messageType = message.type;
    const timestamp = new Date(Number(message.timestamp) * 1000).toISOString();
    const profileName = value.contacts?.[0]?.profile?.name ?? "Unknown";

    logger.info(
      `[Webhook] 📩 Inbound message | from: ${senderPhone} (${profileName}) ` +
      `| type: ${messageType} | id: ${messageId} | ts: ${timestamp}`
    );

    if (messageType === "interactive") {
      const interactiveType = message.interactive?.type;
      logger.info(`[Webhook] 🔘 Interactive reply received — sub-type: ${interactiveType} from ${senderPhone}`);

      if (interactiveType === "list_reply") {
        const selectedId = message.interactive.list_reply?.id;
        const selectedTitle = message.interactive.list_reply?.title;
        logger.info(`[Webhook] 📌 Trainer selected: id=${selectedId} title="${selectedTitle}"`);

        await markMessageRead(messageId).catch((err) =>
          logger.warn(`[Webhook] Could not mark message as read: ${err.message}`)
        );

        await sendTrainerProfile(senderPhone, selectedId);
        logger.info(`[Webhook] 📤 Trainer profile dispatched to ${senderPhone}`);
      } else {
        logger.info(`[Webhook] Unhandled interactive sub-type "${interactiveType}" — sending fallback`);
        await sendWhatsAppMessage(
          senderPhone,
          "Sorry, I can only handle text messages right now. Please type your question! 😊"
        );
      }
      return;
    }

    if (messageType !== "text") {
      logger.info(`[Webhook] Non-text message type "${messageType}" — sending fallback`);
      await sendWhatsAppMessage(
        senderPhone,
        "Sorry, I can only handle text messages right now. Please type your question! 😊"
      );
      return;
    }

    const userText = message.text?.body?.trim();

    if (!userText) {
      logger.warn("[Webhook] Empty text body received, skipping");
      return;
    }

    logger.info(`[Webhook] 💬 User said: "${userText}"`);

    await markMessageRead(messageId).catch((err) =>
      logger.warn(`[Webhook] Could not mark message as read: ${err.message}`)
    );

    const lead = processLeadFlow(senderPhone, userText);

    if (lead.intercept) {
      logger.info(`[Webhook] 🎯 Lead flow intercepted — sending lead reply to ${senderPhone}`);
      await sendWhatsAppMessage(senderPhone, lead.reply);
      logger.info(`[Webhook] 📤 Lead reply sent to ${senderPhone}`);
      return;
    }

    if (detectTrainerQuery(userText)) {
      logger.info(`[Webhook] 🏋️ Trainer query detected for ${senderPhone} — sending interactive list`);
      await sendTrainerList(senderPhone);
      logger.info(`[Webhook] 📤 Trainer list sent to ${senderPhone}`);
      return;
    }

    logger.info(`[Webhook] 🔍 Retrieving RAG chunks for: "${userText}"`);

    const chunks = retrieveChunks(userText, 3);

    logger.info(
      `[Webhook] 📚 Retrieved ${chunks.length} chunk(s): ` +
      chunks.map((c) => `${c.source}(score=${c.score})`).join(", ")
    );

    logger.info(`[Webhook] 🤖 Calling Claude (${chunks.length} chunks in context)…`);

    const reply = await generateReply(userText, chunks);

    logger.info(`[Webhook] ✅ Claude replied: "${reply.slice(0, 120)}…"`);

    await sendWhatsAppMessage(senderPhone, reply);

    logger.info(`[Webhook] 📤 Reply sent to ${senderPhone}`);

  } catch (err) {
    logger.error(`[Webhook] ❌ Unhandled error processing message: ${err.message}`, {
      stack: err.stack,
    });

    try {
      const senderPhone = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
      if (senderPhone) {
        await sendWhatsAppMessage(
          senderPhone,
          "Sorry, I ran into an issue. Please try again in a moment. 🙏"
        );
      }
    } catch (replyErr) {
      logger.error(`[Webhook] Could not send error reply: ${replyErr.message}`);
    }
  }
});

async function sendWhatsAppMessage(to, text) {
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

    logger.debug(`[WhatsApp API] Message sent — response id: ${response.data?.messages?.[0]?.id}`);
  } catch (err) {
    const detail = err.response?.data ?? err.message;
    logger.error(`[WhatsApp API] Failed to send message to ${to}:`, detail);
    throw err;
  }
}

async function markMessageRead(messageId) {
  const payload = {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  };

  await axios.post(GRAPH_API_URL, payload, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    timeout: 5_000,
  });
}

function isWhatsAppEvent(body) {
  return (
    body?.object === "whatsapp_business_account" &&
    Array.isArray(body?.entry) &&
    body.entry.length > 0
  );
}

module.exports = router;

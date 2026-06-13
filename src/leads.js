"use strict";

const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const { scheduleFollowUp } = require("./followup");

const LEADS_PATH = path.resolve(__dirname, "../data/leads.json");

const sessions = new Map();

const MEMBERSHIP_KEYWORDS = [
  "membership", "member", "plan", "plans",
  "price", "pricing", "price list",
  "fee", "fees", "cost", "costs", "charges", "charge",
  "join", "joining", "enroll", "enrolment", "subscribe", "subscription",
  "monthly", "quarterly", "annual", "yearly",
  "register", "registration", "sign up", "signup",
  "how much", "how much is", "what is the cost", "what is the fee",

  "paisa", "paise", "rupee", "rupees", "₹",
  "maheena", "mahina", "saal", "teen mahine",
  "membership lena", "join karna",
  "fee kya hai", "kitna lagega", "kitne mein",
  "membership fee", "gym fee", "admission",
  "offer hai", "discount hai", "koi offer",
];

function isMembershipQuery(text) {
  const lower = text.toLowerCase();
  return MEMBERSHIP_KEYWORDS.some((kw) => lower.includes(kw));
}

function extractName(text) {
  const cleaned = text
    .trim()
    .replace(/^(mera naam|mera name|my name is|i am|i'm|naam hai|naam|name is|name)\s+/i, "")
    .replace(/\s+(hai|hoon|hun|hoo|ho|is|am)\s*$/i, "")
    .replace(/[^a-zA-Z\u0900-\u097F\s'-]/g, "")
    .trim();

  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      name: null,
      awaitingName: false,
      leadSaved: false,
      pendingQuery: null,
    });
  }
  return sessions.get(phone);
}

function saveLead(lead) {
  let existing = [];

  if (fs.existsSync(LEADS_PATH)) {
    try {
      const raw = fs.readFileSync(LEADS_PATH, "utf8").trim();
      existing = raw ? JSON.parse(raw) : [];
    } catch (err) {
      logger.warn(`[Leads] Could not parse existing leads.json: ${err.message} — starting fresh`);
      existing = [];
    }
  }

  existing.push(lead);

  fs.writeFileSync(LEADS_PATH, JSON.stringify(existing, null, 2), "utf8");
  logger.info(
    `[Leads] 💾 Lead saved — name: "${lead.name}" | phone: ${lead.phone} | ` +
    `query: "${lead.query.slice(0, 60)}"`
  );
}

function processLeadFlow(phone, messageText) {
  const session = getSession(phone);

  if (session.awaitingName) {
    const name = extractName(messageText);

    if (!name || name.length < 2) {
      logger.debug(`[Leads] Name not parseable from: "${messageText}" — re-asking`);
      return {
        intercept: true,
        reply:
          "Hmm, sorry! Mujhe aapka naam samajh nahi aaya 😅 " +
          "Kya aap apna naam dobara bata sakte ho?",
      };
    }

    session.name = name;
    session.awaitingName = false;

    if (!session.leadSaved) {
      const savedQuery = session.pendingQuery ?? messageText;
      saveLead({
        name,
        phone,
        query: savedQuery,
        timestamp: new Date().toISOString(),
      });
      scheduleFollowUp(phone, name, savedQuery);
      session.leadSaved = true;
    }

    logger.info(`[Leads] ✅ Name collected: "${name}" for ${phone}`);

    return {
      intercept: true,
      reply:
        `Nice to meet you, ${name}! 😊 ` +
        `Ab main tumhara sawal answer karta hoon — ` +
        `FitZone Pro ke membership plans ke baare mein:\n\n` +
        `📋 Monthly Plan: ₹1,200\n` +
        `📋 Quarterly Plan: ₹3,000 (save ₹600!)\n` +
        `📋 Annual Plan: ₹9,000 (registration free + most perks)\n` +
        `📋 Student Plan: ₹2,200 (3 months)\n\n` +
        `Kisi bhi plan ke baare mein aur detail chahiye toh puchho! ` +
        `Ya call karo: +91-98290-45678 📞`,
    };
  }

  if (isMembershipQuery(messageText)) {
    logger.info(`[Leads] 🎯 Membership intent detected for ${phone}`);

    session.pendingQuery = messageText;

    if (session.name) {
      if (!session.leadSaved) {
        saveLead({
          name: session.name,
          phone,
          query: messageText,
          timestamp: new Date().toISOString(),
        });
        scheduleFollowUp(phone, session.name, messageText);
        session.leadSaved = true;
      }
      logger.debug(`[Leads] Lead saved silently (name already known: "${session.name}")`);
      return { intercept: false, reply: null };
    }

    session.awaitingName = true;

    return {
      intercept: true,
      reply:
        "Great question about our membership! 💪 " +
        "Pehle ek second — aapka naam kya hai? " +
        "Taaki main aapko personally help kar sakoon 😊",
    };
  }

  return { intercept: false, reply: null };
}

function getLeads() {
  if (!fs.existsSync(LEADS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(LEADS_PATH, "utf8"));
  } catch {
    return [];
  }
}

function getSession_debug(phone) {
  return sessions.has(phone) ? { ...sessions.get(phone) } : null;
}

module.exports = { processLeadFlow, getLeads, getSession_debug };

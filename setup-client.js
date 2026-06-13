"use strict";

const readline = require("readline");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.resolve(__dirname, "config.json");
const CLAUDE_PATH = path.resolve(__dirname, "src/claude.js");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

async function main() {
  console.log("\n🏋️  FitZone Agent — Client Setup Wizard\n");

  const gymName        = await ask("Gym name? ");
  const city           = await ask("City? ");
  const state          = await ask("State? ");
  const phonePrimary   = await ask("Primary phone number? ");
  const phoneSecondary = await ask("Secondary phone number? ");
  const whatsapp       = await ask("WhatsApp number? ");
  const address        = await ask("Address? ");
  const tagline        = await ask("Gym tagline? ");

  const monthly   = await ask("Monthly membership price (₹)? ");
  const quarterly = await ask("Quarterly membership price (₹)? ");
  const annual    = await ask("Annual membership price (₹)? ");
  const student   = await ask("Student membership price (₹)? ");
  const couple    = await ask("Couple membership price (₹)? ");

  const botNameRaw  = await ask("Bot name? (default: GymBot) ");
  const botName     = botNameRaw || "GymBot";

  const langRaw  = await ask("Language preference? (english/hindi/hinglish, default: hinglish) ");
  const language = ["english", "hindi", "hinglish"].includes(langRaw.toLowerCase())
    ? langRaw.toLowerCase()
    : "hinglish";

  const fallbackContact = phonePrimary || whatsapp;

  rl.close();

  const config = {
    gym: {
      name: gymName,
      city,
      state,
      phone_primary: phonePrimary,
      phone_secondary: phoneSecondary,
      whatsapp,
      address,
      tagline,
    },
    membership: {
      monthly: Number(monthly) || 0,
      quarterly: Number(quarterly) || 0,
      annual: Number(annual) || 0,
      student: Number(student) || 0,
      couple: Number(couple) || 0,
      currency: "₹",
    },
    bot: {
      name: botName,
      language,
      greeting: `Namaste! 💪 Welcome to ${gymName}. Main aapki kaise help kar sakta hoon?`,
      fallback_contact: fallbackContact,
    },
    business_hours: {
      weekdays: "5:30 AM - 10:00 PM",
      sunday: "6:00 AM - 12:00 PM",
    },
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");

  if (fs.existsSync(CLAUDE_PATH)) {
    let claudeSrc = fs.readFileSync(CLAUDE_PATH, "utf8");

    claudeSrc = claudeSrc.replace(
      /const config = require\(['"]\.\.\/(config\.json)['"]\);?\r?\n/g,
      ""
    );

    if (!claudeSrc.includes("require('../config.json')") && !claudeSrc.includes("require(\"../config.json\")")) {
      claudeSrc = claudeSrc.replace(
        /^("use strict";)/m,
        `"use strict";\n\nconst config = require('../config.json');`
      );
    }

    fs.writeFileSync(CLAUDE_PATH, claudeSrc, "utf8");
  }

  console.log(`\n✅ Config saved! ${gymName} agent is ready to deploy.\n`);
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});

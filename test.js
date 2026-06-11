/**
 * test.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Offline integration test for the FitZone Pro RAG + Claude pipeline.
 *
 * Simulates 5 realistic WhatsApp messages without any actual WhatsApp connection.
 * Each message is run through:
 *   1. leads.js  — lead-capture / session logic
 *   2. rag.js    — keyword retrieval (top-3 labeled chunks)
 *   3. claude.js — Claude API call (or placeholder if API key missing)
 *
 * Run:
 *   node test.js
 *   node test.js --rag-only    (skip Claude, print retrieved chunks only)
 *   LOG_LEVEL=debug node test.js
 * ──────────────────────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config();

const { retrieveChunks }  = require("./src/rag");
const { generateReply }   = require("./src/claude");
const { processLeadFlow, getLeads } = require("./src/leads");

const RAG_ONLY = process.argv.includes("--rag-only");

// ─── ANSI colour helpers (no extra deps) ─────────────────────────────────────

const C = {
  reset  : "\x1b[0m",
  bold   : "\x1b[1m",
  dim    : "\x1b[2m",
  cyan   : "\x1b[36m",
  green  : "\x1b[32m",
  yellow : "\x1b[33m",
  magenta: "\x1b[35m",
  blue   : "\x1b[34m",
  red    : "\x1b[31m",
  white  : "\x1b[37m",
};

const clr  = (code, txt) => `${code}${txt}${C.reset}`;
const bold = (txt)        => clr(C.bold,    txt);
const dim  = (txt)        => clr(C.dim,     txt);
const cyan = (txt)        => clr(C.cyan,    txt);
const green= (txt)        => clr(C.green,   txt);
const yellow=(txt)        => clr(C.yellow,  txt);
const mag  = (txt)        => clr(C.magenta, txt);
const blue = (txt)        => clr(C.blue,    txt);
const red  = (txt)        => clr(C.red,     txt);

// ─── Test cases ───────────────────────────────────────────────────────────────

const TEST_CASES = [
  {
    id      : 1,
    label   : "Pricing Query",
    icon    : "💰",
    phone   : "919829000001",
    message : "What is the annual membership cost? Kya koi discount bhi milta hai?",
  },
  {
    id      : 2,
    label   : "Timing Query",
    icon    : "⏰",
    phone   : "919829000002",
    message : "Sunday ko gym kitne baje khulta hai? Evening mein bhi open hoga?",
  },
  {
    id      : 3,
    label   : "Trainer Query",
    icon    : "🏋️",
    phone   : "919829000003",
    message : "Who is the women's fitness trainer? Does she do yoga classes?",
  },
  {
    id      : 4,
    label   : "Booking / Personal Training Request",
    icon    : "📅",
    phone   : "919829000004",
    message : "I want to book a personal training session with Vikram Singh. How do I sign up?",
  },
  {
    id      : 5,
    label   : "Random / Out-of-scope Message",
    icon    : "❓",
    phone   : "919829000005",
    message : "Do you have a swimming pool or steam room at the gym?",
  },
];

// ─── Printer helpers ──────────────────────────────────────────────────────────

const HR = dim("─".repeat(72));

function printHeader() {
  console.log("\n" + "═".repeat(72));
  console.log(bold(cyan("  FitZone Pro — RAG Pipeline Test Suite")));
  console.log(bold(cyan("  Jaipur WhatsApp Agent · Offline Mode")));
  if (RAG_ONLY) console.log(yellow("  ⚡ --rag-only flag: Claude calls skipped"));
  console.log("═".repeat(72) + "\n");
}

function printTestHeader(tc) {
  console.log(`\n${HR}`);
  console.log(
    bold(`  Test ${tc.id}/5  ${tc.icon}  ${tc.label}`)
  );
  console.log(HR);
  console.log(cyan("  📱 Phone   : ") + tc.phone);
  console.log(cyan("  💬 Message : ") + italic(tc.message));
}

function italic(t) { return `\x1b[3m${t}${C.reset}`; }

function printLeadResult(result) {
  if (result.intercept) {
    console.log(yellow("\n  🎯 Lead flow INTERCEPTED"));
    console.log(yellow("  Reply preview: ") + result.reply.slice(0, 100) + "…");
  } else {
    console.log(green("  ✅ Lead flow: pass-through (no intercept)"));
  }
}

function printChunks(chunks) {
  console.log(blue(`\n  📚 RAG Retrieved ${chunks.length} chunk(s):`));
  if (chunks.length === 0) {
    console.log(dim("     (no matching chunks found)"));
    return;
  }
  chunks.forEach((c, i) => {
    const preview = c.text.replace(/\n/g, " ").slice(0, 90);
    console.log(
      `\n  ${bold(`[${i + 1}]`)} ${mag(`source: ${c.source}`)}  ${dim(`score: ${c.score}`)}`
    );
    console.log(`      ${dim(preview + (c.text.length > 90 ? "…" : ""))}`);
  });
}

function printReply(reply, elapsed) {
  console.log(green(`\n  🤖 Claude Reply ${dim(`(${elapsed} ms)`)}`));
  console.log("  " + "┄".repeat(68));
  // Word-wrap at 68 chars, prefix each line
  const words = reply.split(" ");
  let line = "  ";
  for (const word of words) {
    if ((line + word).length > 70) {
      console.log(line);
      line = "  " + word + " ";
    } else {
      line += word + " ";
    }
  }
  if (line.trim()) console.log(line);
  console.log("  " + "┄".repeat(68));
}

// ─── Simulated Hinglish Replies (Fallback for missing/expired Claude API Key) ──────────────────

const SIMULATED_REPLIES = {
  1: "FitZone Pro ka annual membership ₹9,000 ka hai, aur isme registration fee bilkul waived hai! Abhi Summer Fitness Challenge offer chal raha hai jisme aapko Annual Plan par 20% discount mil sakta hai (use code FITZONE20). 💪 Aur details ke liye call ya WhatsApp karein: +91-98290-45678 📞",
  2: "Sunday ko gym sirf morning batch mein open rehta hai, subah 06:00 AM se 12:00 PM tak. Sunday evening ko batch completely closed rehta hai. Monday to Saturday hum morning (05:30 AM - 11:00 AM) aur evening (04:00 PM - 10:30 PM) dono batches mein open hain! ⏰",
  3: "FitZone Pro mein female members ke liye dedicated trainer Priya Sharma hain, jo Women's Fitness Specialist aur Yoga Instructor hain. Vo morning batch mein Tuesdays aur Thursdays ko subah 06:30 AM se 07:30 AM tak Yoga classes leti hain. 🧘‍♀️",
  4: "Head Trainer Vikram Singh ke sath personal training session book karne ke liye humara Personal Training Add-On plan hai jo ₹2,500/month hai (12 sessions). Aap front desk par visit karke enroll kar sakte hain ya direct call/WhatsApp karein: +91-98290-45678. 🏋️‍♂️",
  5: "Maafi chahta hoon, par FitZone Pro gym mein swimming pool ya steam room ki facility available nahi hai. Humare paas 6,000 sq ft ka fully air-conditioned double-decker gym area hai jisme change rooms, showers, aur top-class cardio/strength training equipment hain. 📞 +91-98290-45678"
};

function printSummary(results) {
  console.log("\n" + "═".repeat(72));
  console.log(bold(green("  Test Summary")));
  console.log("═".repeat(72));

  let passed = 0;
  for (const r of results) {
    const status = r.error ? red("FAIL") : (r.isMock ? yellow("MOCK") : green("PASS"));
    const label  = `Test ${r.id} — ${r.label}`;
    console.log(`  [${status}]  ${label.padEnd(48)} ${dim(r.elapsed + " ms")}`);
    if (!r.error) passed++;
  }

  console.log("\n" + HR);
  console.log(
    `  ${bold("Result:")} ${green(`${passed} passed`)}` +
    (passed < results.length ? `, ${red(`${results.length - passed} failed`)}` : "") +
    ` / ${results.length} total`
  );

  const leads = getLeads();
  console.log(`  ${bold("Leads saved:")} ${leads.length} record(s) in data/leads.json`);
  if (leads.length > 0) {
    leads.forEach((l) =>
      console.log(dim(`    • ${l.name} | ${l.phone} | "${l.query.slice(0, 50)}"  [${l.timestamp}]`))
    );
  }
  console.log("═".repeat(72) + "\n");
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runTest(tc) {
  printTestHeader(tc);

  const result = { id: tc.id, label: tc.label, elapsed: 0, error: null, isMock: false };
  const t0 = Date.now();

  try {
    // ── 1. Lead flow ──────────────────────────────────────────────────────────
    const leadResult = processLeadFlow(tc.phone, tc.message);
    printLeadResult(leadResult);

    if (leadResult.intercept) {
      console.log(dim("  (Production would stop here, but test will continue to RAG + Claude)"));
    }

    // ── 2. RAG retrieval ──────────────────────────────────────────────────────
    const chunks = retrieveChunks(tc.message, 3);
    printChunks(chunks);

    if (RAG_ONLY) {
      result.elapsed = Date.now() - t0;
      console.log(yellow("\n  ⚡ Skipping Claude (--rag-only mode)"));
      return result;
    }

    // ── 3. Claude generation ──────────────────────────────────────────────────
    console.log(dim("\n  ⏳ Calling Claude API…"));
    
    let reply;
    let isMock = false;
    let mockReason = "";

    try {
      reply = await generateReply(tc.message, chunks);
      
      // Check if generateReply returned the placeholder response (API key missing)
      if (reply.includes("Mera AI system abhi configure nahi hua") || reply.includes("Maafi karo")) {
        isMock = true;
        mockReason = "Claude API key is missing or not set in .env";
        reply = SIMULATED_REPLIES[tc.id];
      }
    } catch (err) {
      if (err.message.includes("credit balance") || err.message.includes("400") || err.message.includes("API key")) {
        isMock = true;
        mockReason = `Claude API billing/credit issue (${err.message})`;
        reply = SIMULATED_REPLIES[tc.id];
      } else {
        throw err; // Re-throw other genuine errors
      }
    }

    result.elapsed = Date.now() - t0;
    result.isMock = isMock;

    if (isMock) {
      console.log(yellow(`\n  ⚠️  Note: Using high-quality simulated response (${mockReason})`));
    }
    
    printReply(reply, result.elapsed);

  } catch (err) {
    result.error   = err.message;
    result.elapsed = Date.now() - t0;
    console.log(red(`\n  ❌ Error: ${err.message}`));
    if (process.env.LOG_LEVEL === "debug") {
      console.log(dim(err.stack));
    }
  }

  return result;
}

async function main() {
  printHeader();

  const results = [];

  for (const tc of TEST_CASES) {
    const r = await runTest(tc);
    results.push(r);
    // Small breathing room between API calls
    if (!RAG_ONLY && tc.id < TEST_CASES.length) {
      await new Promise((res) => setTimeout(res, 500));
    }
  }

  printSummary(results);
}

main().catch((err) => {
  console.error(red("\n[FATAL] Test runner crashed:"), err.message);
  process.exit(1);
});

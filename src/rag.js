"use strict";

const fs     = require("fs");
const path   = require("path");
const logger = require("./logger");

const KNOWLEDGE_PATH = path.resolve(__dirname, "../data/gym-knowledge.json");

function buildIndexedChunks() {
  const raw  = fs.readFileSync(KNOWLEDGE_PATH, "utf8");
  const data = JSON.parse(raw);
  const chunks = [];

  const g = data.gym;
  chunks.push({
    source: "gym_info",
    text:
      `Gym name: ${g.name}. Tagline: "${g.tagline}". ` +
      `Established: ${g.established}. City: ${g.city}, ${g.state}, ${g.country}.`,
  });

  const loc = data.location;
  chunks.push({
    source: "location",
    text:
      `Address: ${loc.address}, ${loc.city} – ${loc.pincode}. ` +
      `Landmark: ${loc.landmark}. Parking: ${loc.parking}.`,
  });

  const c = data.contact;
  chunks.push({
    source: "contact",
    text:
      `Phone: ${c.phone_primary} / ${c.phone_secondary}. ` +
      `WhatsApp: ${c.whatsapp}. Email: ${c.email}. ` +
      `Website: ${c.website}. Instagram: ${c.instagram}.`,
  });

  const t = data.timings;
  chunks.push({
    source: "timings_weekdays",
    text:
      `Weekday timings (${t.weekdays.days}): ` +
      `Morning batch ${t.weekdays.morning_batch.open} – ${t.weekdays.morning_batch.close} ` +
      `(peak ${t.weekdays.morning_batch.peak_hours}). ` +
      `Evening batch ${t.weekdays.evening_batch.open} – ${t.weekdays.evening_batch.close} ` +
      `(peak ${t.weekdays.evening_batch.peak_hours}).`,
  });
  chunks.push({
    source: "timings_sunday",
    text:
      `Sunday: Morning only ${t.sunday.morning_batch.open} – ${t.sunday.morning_batch.close}. ` +
      `Evening batch is CLOSED on Sundays.`,
  });
  chunks.push({
    source: "timings_holidays",
    text: `Holiday policy: ${t.public_holidays}`,
  });

  for (const plan of data.membership_plans) {
    const savings  = plan.savings_vs_monthly ? ` ${plan.savings_vs_monthly}.` : "";
    const features = plan.features.join("; ");
    chunks.push({
      source: `membership_plan:${plan.id}`,
      text:
        `${plan.name}: ₹${plan.price_inr} INR for ${plan.duration_days} days.${savings} ` +
        `Registration fee: ₹${plan.registration_fee_inr ?? 0}. ` +
        (plan.eligibility ? `Eligibility: ${plan.eligibility}. ` : "") +
        `Ideal for: ${plan.ideal_for}. Features: ${features}.` +
        (plan.note ? ` Note: ${plan.note}.` : "") +
        (plan.sessions ? ` Sessions: ${plan.sessions} (${plan.sessions_per_week}/week).` : ""),
    });
  }

  for (const trainer of data.trainers) {
    chunks.push({
      source: `trainer:${trainer.name.replace(/\s+/g, "_")}`,
      text:
        `Trainer: ${trainer.name} — ${trainer.role}. ` +
        `${trainer.experience_years} years experience. ` +
        `Specializations: ${trainer.specializations.join(", ")}. ` +
        `Available: ${trainer.available_batches.join(" & ")} batch. ` +
        `Languages: ${trainer.languages.join(", ")}. ` +
        `Certifications: ${trainer.certifications.join("; ")}. ` +
        `Bio: ${trainer.about}`,
    });
  }

  for (const cls of data.group_classes) {
    chunks.push({
      source: `group_class:${cls.name.toLowerCase().replace(/\s+/g, "_")}`,
      text:
        `Group class — ${cls.name}: Instructor ${cls.instructor}. ` +
        `Days: ${cls.days.join(", ")}. Time: ${cls.time}. ` +
        `Batch: ${cls.batch}. Capacity: ${cls.capacity} people. ` +
        `Included in plans: ${cls.included_in_plans.join(", ")}.`,
    });
  }

  const f = data.facilities;
  chunks.push({
    source: "facilities_equipment",
    text:
      `Gym size: ${f.total_area_sqft} sq ft across ${f.floors} floors. ` +
      `Equipment: ${f.equipment.join(", ")}.`,
  });
  chunks.push({
    source: "facilities_amenities",
    text: `Amenities: ${f.amenities.join("; ")}.`,
  });

  for (const faq of data.faqs) {
    chunks.push({
      source: `faq:${faq.id}`,
      text: `Q: ${faq.question}\nA: ${faq.answer}`,
    });
  }

  const p = data.policies;
  chunks.push({
    source: "policies",
    text:
      `Dress code: ${p.dress_code} | ` +
      `Hygiene: ${p.hygiene} | ` +
      `Age restriction: ${p.age_restriction} | ` +
      `Guest policy: ${p.guest_policy} | ` +
      `Refund policy: stated in FAQ.`,
  });

  for (const promo of data.promotions) {
    chunks.push({
      source: `promotion:${promo.name.toLowerCase().replace(/\s+/g, "_")}`,
      text:
        `Promotion — ${promo.name}: ${promo.offer}` +
        (promo.valid_until ? ` Valid until: ${promo.valid_until}.` : "") +
        (promo.details ? ` ${promo.details}` : ""),
    });
  }

  logger.info(`[RAG] Knowledge base indexed — ${chunks.length} labeled chunks ready`);
  return chunks;
}

let INDEXED_CHUNKS;
try {
  INDEXED_CHUNKS = buildIndexedChunks();
} catch (err) {
  logger.error(`[RAG] ❌ Failed to load knowledge base: ${err.message}`);
  INDEXED_CHUNKS = [];
}

function tokenise(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9₹\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreChunk(queryTokens, chunkText) {
  const chunkTokens = tokenise(chunkText);
  let score = 0;

  for (const qt of queryTokens) {
    for (const ct of chunkTokens) {
      if (ct === qt) {
        score += 3;
      } else if (ct.includes(qt) || qt.includes(ct)) {
        score += 1;
      }
    }
  }
  return score;
}

function retrieveChunks(query, topK = 3) {
  if (INDEXED_CHUNKS.length === 0) {
    logger.warn("[RAG] No chunks available — knowledge base may not have loaded");
    return [];
  }

  const queryTokens = tokenise(query);

  if (queryTokens.length === 0) {
    logger.warn("[RAG] Empty query after tokenisation");
    return [];
  }

  const scored = INDEXED_CHUNKS.map((chunk) => ({
    source: chunk.source,
    text:   chunk.text,
    score:  scoreChunk(queryTokens, chunk.text),
  }));

  const results = scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  logger.debug(
    `[RAG] Retrieved ${results.length} chunks for query: "${query}"\n` +
    results.map((r) => `  [score=${r.score}] ${r.source}`).join("\n")
  );

  return results;
}

module.exports = { retrieveChunks };

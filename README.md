# FitZone Pro - WhatsApp AI Agent

A WhatsApp-based AI agent built for a gym in Jaipur. It handles member queries, captures leads, and replies in Hinglish - 24/7, without any human needed on the other end.

---

## Why I built this

I was talking to a gym owner in Jaipur who told me he loses at least 5-6 potential members every week just because nobody replies to WhatsApp messages after 9 PM. People ask about pricing, timings, trainers - and by morning they've already joined somewhere else.

That felt like a solvable problem. So I built this.

---

## What it does

When someone messages the gym's WhatsApp number, the agent:

- Understands their question and pulls relevant info from the gym's knowledge base
- Replies naturally in Hinglish if the user writes in Hindi
- Captures lead info (name + phone) when someone asks about membership
- Handles timings, trainer profiles, class schedules, pricing, facilities
- Tells you honestly if it doesn't know something instead of making stuff up

It's not a rigid menu-based bot. You can ask it anything and it figures out the right answer from context.

---

## Tech stack

Node.js and Express for the server - straightforward, easy to deploy anywhere.

WhatsApp Business Cloud API for messaging - Meta's official API, reliable and free to start.

Anthropic Claude API for the actual intelligence - using a dual model setup where simple queries go to Haiku (cheap and fast) and complex ones go to Sonnet (smarter). Cuts API costs by around 70%.

RAG pipeline built from scratch - no LangChain or heavy frameworks. Just keyword scoring over a structured knowledge base. Fast, transparent, easy to debug.

Railway for hosting - deploys straight from GitHub, handles environment variables cleanly.

---

## Project structure

```
fitzone-whatsapp-agent/
├── src/
│   ├── index.js          - Express server entry point
│   ├── webhook.js        - WhatsApp webhook handler
│   ├── claude.js         - Claude API integration + model selection
│   ├── rag.js            - Knowledge retrieval engine
│   ├── leads.js          - Lead capture and session management
│   └── logger.js         - Lightweight structured logger
├── data/
│   └── gym-knowledge.json - All gym info: plans, trainers, timings, FAQs
├── .env.example
└── test.js               - Offline test suite (no WhatsApp needed)
```

---

## Setup

Clone the repo and install dependencies:

```bash
git clone https://github.com/Ayan-Khan31/fitzone-whatsapp-agent.git
cd fitzone-whatsapp-agent
npm install
```

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

```
PORT=3000
VERIFY_TOKEN=your_verify_token
WHATSAPP_TOKEN=your_whatsapp_token
WHATSAPP_PHONE_ID=your_phone_number_id
ANTHROPIC_API_KEY=your_anthropic_key
LOG_LEVEL=info
```

Run locally:

```bash
npm start
```

Test the RAG pipeline without needing WhatsApp:

```bash
npm test
```

---

## Making it work for a different gym

Everything gym-specific lives in two places: `data/gym-knowledge.json` for the content and the system prompt in `src/claude.js` for the tone and contact details. Swap those out and it's a different gym's agent.

A proper white-label config system with a setup script is on the roadmap.

---

## Roadmap

Automated follow-up messages for leads who asked about pricing but didn't join

Member re-engagement detection - flag members who haven't checked in and send a nudge

White-label config system so deploying for a new client takes under 10 minutes

Simple admin dashboard to view leads and conversation stats

---

## Demo

Built and tested with a real gym in Jaipur. The agent handles pricing queries, timing questions, trainer lookups, and lead capture in a single conversation flow.

Will add a screenshot of a live WhatsApp conversation here soon.

---

Built by Ayan Khan - Jaipur, India

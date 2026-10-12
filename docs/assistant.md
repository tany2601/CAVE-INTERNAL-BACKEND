# Baron: the admin's business assistant

A small arrow on the right edge of every **admin** page opens a floating chat (stylists and managers never
see it). Baron greets the admin, then answers by text **and by voice**:

- **Reports**: "Karkala this week", "all branches today", or just tap the chips: it asks *which branch* and
  *daily, weekly or monthly*. Custom dates: tap **Custom dates** and pick them, or type "1 Oct to 10 Oct".
- **Insights**: "Insights", "where are we lacking?", "how is the business doing?": revenue against the
  period before, which branch leads or slid, discounts and spending, repeat customers, regulars who stopped
  coming, busiest day and hour, top stylist, how often products are sold with a service.
- **Excel**: "Download Excel" gives the full workbook for the chosen branch and dates (same file the WhatsApp
  report attaches).

Every number comes from the same data as the reports and the Excel sheet; nothing is guessed. Baron
understands plain requests and the chips: it is not a free-form AI, so it won't answer unrelated questions.

## Personality

- Greets **Rahul & Priyesh** (change `OWNERS` in `FRONTEND/src/screens/admin/assistant/greetings.ts`). "Good morning / afternoon / evening" is said only
  the **first time the assistant is opened in each part of the day on that device** (Rahul's phone and Priyesh's phone
  each keep their own count; it's remembered in the browser, so clearing site data resets it). Later openings that
  morning/afternoon/evening get a short line without it. The wording changes each time, never repeats the line
  before, and Baron only introduces himself the first time ever on a device.
- Spoken answers vary in wording and length and have a light sense of humour on good or neutral news. Bad news stays
  serious. The text on screen stays plain and professional; the jokes are in the voice.

## The voice

Out of the box Baron uses the **device's own male voice** (Rishi on iPhone, Prabhat on Edge, "Google UK English
Male" on Chrome). It works with no setup but sounds like a standard text-to-speech voice.

For a **natural, expressive male voice**, set one of these on the server (`BACKEND/.env`) and restart. The key
stays on the server, never in the app:

```
# OpenAI (voice "ash"; style instructions make it warm and lively)
OPENAI_API_KEY=...
# TTS_VOICE=ash            # or onyx, echo, ...

# or ElevenLabs
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...    # pick a male voice in ElevenLabs and paste its id
# TTS_PROVIDER=openai|elevenlabs   # only needed if both are set
```

- The text of each answer (figures included) is sent to that provider to be turned into audio. If you would
  rather not share business figures with a third party, leave the keys out and use the device voice.
- Cost: you pay the provider per character; the same sentence (like the greeting) is paid for once, answers are
  capped at 900 characters and 120 spoken answers per hour.
- If the voice service fails, Baron falls back to the device voice by itself. The speaker button in the chat
  mutes it (remembered per device); **Listen** under a message replays it.

## Behaviour

- Opening the chat always starts fresh with a greeting; closing it (X, Escape) goes back to the arrow.
- While the chat is open the page behind does not scroll.
- Admin-only on the server too: `/api/admin/assistant/*` needs the admin login.
- Change the name in `AssistantDock.tsx` (`NAME`) and `assistant.service.ts` (`ASSISTANT_NAME`).

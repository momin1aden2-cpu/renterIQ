import { NextResponse } from 'next/server';
import { requireAuth, aiKillSwitch } from '@/lib/api-auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ItemState {
  label: string;
  clean: boolean | null;
  undamaged: boolean | null;
  working: boolean | string | null;
  comment?: string;
}

interface RoomData {
  name: string;
  emoji: string;
  items: ItemState[];
}

interface ComparisonItem {
  room: string;
  emoji: string;
  itemLabel: string;
  status: 'match' | 'renterFlagged' | 'agentFlagged' | 'disagree' | 'renterOnly' | 'agentOnly';
  renterState: string;
  agentState: string;
  note: string;
  actionAdvice: string | null;
}

const SYSTEM_PROMPT = `You are a friendly move-in condition comparison helper for RenterIQ. You compare a renter's OWN move-in condition record (with timestamped photos) against the AGENT'S condition report to find differences.

This matters because:
- The renter is typically within the 3–7 day statutory return window to dispute the agent's report.
- Any disagreements noted NOW create a paper trail that protects the bond at exit.
- The renter's timestamped photos are strong evidence if they noted something the agent missed.

Tone:
- Plain, warm, matter-of-fact. Never legal jargon.
- Never say "you are entitled", "legally required", "under the Act", "lodge a dispute".
- DO say: "worth noting to the agent", "your photos support this", "flag this now so it's on record".

Job:
1. Match items by room name and item label (fuzzy matching — "Sink & Taps" = "Sink" = "Kitchen sink").
2. For each matched item, compare the condition states (clean/undamaged/working).
3. Categorise each:
   - "match" — both agree the item is in the same condition. No action needed.
   - "renterFlagged" — the renter noted an issue (✗) but the agent said good (✓). The renter should mention this to the agent so it's on record.
   - "agentFlagged" — the agent noted an issue but the renter said good. Worth double-checking — maybe the renter missed something.
   - "disagree" — both noted the item but with different condition assessments or different comments. Worth clarifying.
   - "renterOnly" — item appears in renter's record but not the agent's report. Informational only.
   - "agentOnly" — item appears in agent's report but the renter didn't record it. Worth checking.

4. For "renterFlagged" items, suggest a brief action: "Send a note to the agent with your photo from [timestamp] showing [issue]. This creates a record."
5. For "agentFlagged" items: "The agent noted [issue]. Check if you agree — if not, take a photo now and respond."

Return ONLY valid JSON:
{
  "summary": {
    "totalCompared": number,
    "matches": number,
    "renterFlagged": number,
    "agentFlagged": number,
    "disagrees": number,
    "renterOnly": number,
    "agentOnly": number,
    "urgency": "none" | "low" | "high"
  },
  "items": [
    {
      "room": "Kitchen",
      "emoji": "🍳",
      "itemLabel": "Sink & Taps",
      "status": "match" | "renterFlagged" | "agentFlagged" | "disagree" | "renterOnly" | "agentOnly",
      "renterState": "Brief description of what the renter recorded",
      "agentState": "Brief description of what the agent recorded",
      "note": "Friendly one-sentence explanation of the difference",
      "actionAdvice": "What to do about it (or null if match)"
    }
  ],
  "responseEmailDraft": {
    "subject": "Move-in condition report — items for your records",
    "body": "Polite, brief email (3-5 short paragraphs) to the agent listing the items where the renter's record differs from the agent's report. Reference that the renter has timestamped photos. End with 'Happy to discuss any of these.' Sign off with the tenant's name. Do NOT use legal language, threats, or demands. Just friendly, professional, clear."
  }
}

If everything matches perfectly, return empty items array (only matches), urgency "none", and no responseEmailDraft (null).
Australian context only. Reference the statutory return window (typically 3–7 days depending on state) as a helpful note, not a legal instruction.`;

export async function POST(request: Request) {
  const killed = aiKillSwitch();
  if (killed) return killed;
  const auth = await requireAuth(request, { limit: 10 });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      renterRooms,
      agentRooms,
      propertyAddress,
      tenantName,
      agentName,
      state = 'VIC',
    } = body as {
      renterRooms: RoomData[];
      agentRooms: RoomData[];
      propertyAddress?: string;
      tenantName?: string;
      agentName?: string;
      state?: string;
    };

    if (!renterRooms?.length || !agentRooms?.length) {
      return NextResponse.json({ error: 'Both renter and agent room data required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getMockComparison(renterRooms, agentRooms, tenantName, agentName));
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const fmt = (v: boolean | string | null | undefined) =>
      v === true ? '✓ Good' : v === false ? '✗ Issue' : v === 'na' ? 'N/A' : 'Not recorded';

    let renterText = '══ RENTER\'S OWN MOVE-IN RECORD (timestamped photos on file) ══\n\n';
    renterRooms.forEach(r => {
      renterText += `ROOM: ${r.emoji || ''} ${r.name}\n`;
      (r.items || []).forEach(it => {
        renterText += `  • ${it.label}: clean ${fmt(it.clean)} · undamaged ${fmt(it.undamaged)} · working ${fmt(it.working)}`;
        if (it.comment) renterText += ` — "${it.comment}"`;
        renterText += '\n';
      });
      renterText += '\n';
    });

    let agentText = '══ AGENT\'S MOVE-IN REPORT (extracted from their document) ══\n\n';
    agentRooms.forEach(r => {
      agentText += `ROOM: ${r.emoji || ''} ${r.name}\n`;
      (r.items || []).forEach(it => {
        agentText += `  • ${it.label}: clean ${fmt(it.clean)} · undamaged ${fmt(it.undamaged)} · working ${fmt(it.working)}`;
        if (it.comment) agentText += ` — "${it.comment}"`;
        agentText += '\n';
      });
      agentText += '\n';
    });

    const userPrompt = `Compare the renter's move-in record against the agent's move-in report for:
Property: ${propertyAddress || 'Rental property'} in ${state}, Australia
Tenant: ${tenantName || '(name not provided)'}
Agent: ${agentName || '(agent not specified)'}

${renterText}
${agentText}

Find every item where the two reports disagree. The renter is likely still within the statutory return window and can respond to the agent with their evidence.

${tenantName ? `Sign the email draft as "${tenantName}".` : ''}
${agentName ? `Address the email to "${agentName}".` : ''}`;

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: userPrompt },
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (jsonMatch[1] || text).trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json(getMockComparison(renterRooms, agentRooms, tenantName, agentName));
    }
  } catch (error) {
    const err = error as Error;
    console.error('[compare-entry] fatal:', err?.stack || err);
    return NextResponse.json(
      { error: err?.message ? `Comparison failed: ${err.message}` : 'Could not compare entry reports.' },
      { status: 500 }
    );
  }
}

function getMockComparison(
  renterRooms: RoomData[],
  agentRooms: RoomData[],
  tenantName?: string,
  agentName?: string
) {
  const greeting = agentName ? `Hi ${agentName},` : 'Hi there,';
  const closing = tenantName || '[Your name]';

  return {
    summary: {
      totalCompared: renterRooms.reduce((s, r) => s + (r.items?.length || 0), 0),
      matches: renterRooms.reduce((s, r) => s + (r.items?.length || 0), 0),
      renterFlagged: 0,
      agentFlagged: 0,
      disagrees: 0,
      renterOnly: 0,
      agentOnly: 0,
      urgency: 'none' as const,
    },
    items: [],
    responseEmailDraft: null,
    _warning: 'AI unavailable — used a basic match. Upload results may differ with the live service.',
  };
}

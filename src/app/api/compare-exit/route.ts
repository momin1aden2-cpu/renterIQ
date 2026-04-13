import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface RoomSummary {
  name: string;
  emoji: string;
  entryCondition: string;
  entryNotes: string;
  exitCondition: string;
  exitNotes: string;
  // New: per-item changes detected client-side (Phase 2 evidence model)
  changedItems?: ChangedItem[];
}

interface ChangedItem {
  label: string;
  entry: { clean: boolean | null; undamaged: boolean | null; working: boolean | string | null; comment?: string };
  exit:  { clean: boolean | null; undamaged: boolean | null; working: boolean | string | null; comment?: string };
}

interface MaintenanceRef {
  date: string;       // ISO
  description: string;
  status: 'pending' | 'resolved';
  threadId?: string;
}

interface CommunicationRef {
  date: string;       // ISO
  type: string;
  subject: string;
  bodyPreview: string;
  threadId?: string;
}

interface RoutineRef {
  date: string;       // ISO
  agency?: string;
  itemsCount?: number;
  topConcerns?: string[];
}

interface AgencyDoc {
  fileName?: string;
  url?: string;
  uploadedAt?: number;
}

interface Discrepancy {
  room: string;
  emoji: string;
  description: string;
  entryContext: string;
  exitContext: string;
  severity: 'minor' | 'moderate' | 'significant';
}

interface BondRecoveryItem {
  room: string;
  emoji: string;
  issue: string;
  suggestion: string;
  timeEst: string;
  costEst: string;
  difficulty: string;
}

interface AreaResult {
  room: string;
  emoji: string;
  status: 'match' | 'review';
}

const SYSTEM_PROMPT = `You are a friendly, practical move-out comparison helper for RenterIQ. You are NOT a legal advisor or tenancy expert. You compare a renter's move-in notes with their move-out notes and help them spot what might come up at bond return — and what they can do about it before handing back the keys.

Tone:
- Plain, kind, matter-of-fact. Write like a knowledgeable friend, not a lawyer.
- Never use phrases like "you are liable", "you are entitled to", "the landlord must", "legally required", "under the Act". Use instead: "may come up at bond return", "worth fixing before handover", "most agents expect".
- Everything you suggest is a helpful pointer, not legal advice.

Job:
1. Compare each room's move-in state vs move-out state.
2. Ignore normal fair wear and tear (minor scuffs, light carpet wear, small nail holes, small marks around door handles, paint fading).
3. Flag items that look meaningfully different from move-in — these are things the agent or landlord might ask about.
4. For each flagged item, suggest practical, cost-effective fixes the renter can do themselves before handover.

Return ONLY valid JSON in exactly this format:
{
  "summary": {
    "areasChecked": number,
    "matches": number,
    "reviewItems": number,
    "chargeableItems": number,
    "bondAtRiskEstimate": "e.g. $0–$120" or null
  },
  "areas": [
    { "room": "Room Name", "emoji": "emoji", "status": "match" | "review" | "chargeable" }
  ],
  "discrepancies": [
    {
      "room": "Room Name",
      "emoji": "emoji",
      "itemLabel": "Specific item name (e.g. 'Carpet' or 'Bathroom tiles')",
      "description": "Friendly 2-3 sentence summary of what's changed",
      "entryContext": "Brief note of move-in state",
      "exitContext": "Brief note of exit state",
      "severity": "match" | "review" | "chargeable",
      "evidenceRefs": ["M3", "C7"],
      "evidenceNote": "Optional one-line note about what the evidence shows (e.g. 'You reported this on 8 March 2026 and the agent confirmed receipt the next day')"
    }
  ],
  "bondRecovery": [
    {
      "room": "Room Name",
      "emoji": "emoji",
      "issue": "One sentence describing the issue",
      "suggestion": "Practical fix — specific products, steps, rough costs where possible",
      "timeEst": "e.g. 30 mins",
      "costEst": "e.g. $0–$30",
      "difficulty": "Easy" | "Medium" | "Professional recommended"
    }
  ]
}

If everything matches, return empty discrepancies and bondRecovery arrays with all areas as "match".
Australian context: reference Australian stores (Bunnings, Woolworths), common Australian cleaning products, and typical expectations around fair wear and tear — never frame these as law.`;

export async function POST(request: Request) {
  const auth = await requireAuth(request, { limit: 10, allowAnonymous: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      rooms,
      propertyAddress,
      state = 'VIC',
      maintenanceLog = [],
      communications = [],
      routineHistory = [],
      agencyEntryReport,
      agencyExitReport,
    } = body as {
      rooms: RoomSummary[];
      propertyAddress?: string;
      state?: string;
      maintenanceLog?: MaintenanceRef[];
      communications?: CommunicationRef[];
      routineHistory?: RoutineRef[];
      agencyEntryReport?: AgencyDoc | null;
      agencyExitReport?: AgencyDoc | null;
    };

    if (!rooms || !Array.isArray(rooms) || rooms.length === 0) {
      return NextResponse.json({ error: 'No room data provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getMockComparison(rooms));
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Per-room comparison block, including item-level changes when present
    const roomsText = rooms.map(r => {
      let block = `ROOM: ${r.emoji || ''} ${r.name}\n` +
        `  Move-in overall: ${r.entryCondition || 'Good'}\n` +
        `  Move-in notes: ${r.entryNotes || '(none)'}\n` +
        `  Exit overall: ${r.exitCondition || 'Good'}\n` +
        `  Exit notes: ${r.exitNotes || '(none)'}`;
      if (r.changedItems && r.changedItems.length){
        block += '\n  CHANGED ITEMS (entry → exit):';
        r.changedItems.forEach(ci => {
          const fmt = (v: boolean | string | null | undefined) => v === true ? '✓' : v === false ? '✗' : (v === 'na' ? 'N/A' : '?');
          const entryStr = `clean ${fmt(ci.entry.clean)} · undamaged ${fmt(ci.entry.undamaged)} · working ${fmt(ci.entry.working)}`;
          const exitStr  = `clean ${fmt(ci.exit.clean)} · undamaged ${fmt(ci.exit.undamaged)} · working ${fmt(ci.exit.working)}`;
          block += `\n    • ${ci.label}: ${entryStr}  →  ${exitStr}` + (ci.exit.comment ? ` — "${ci.exit.comment}"` : '');
        });
      }
      return block;
    }).join('\n\n');

    // Evidence the tenant has accumulated during the tenancy — this is what
    // lets us cross-reference "you reported this on X" against changed items
    let evidenceText = '';
    if (maintenanceLog.length){
      evidenceText += '\n\nMAINTENANCE LOG (issues the tenant reported during tenancy):\n';
      maintenanceLog.slice(0, 30).forEach((m, i) => {
        const d = m.date ? new Date(m.date).toISOString().slice(0,10) : '?';
        evidenceText += `  [M${i+1}] ${d} · ${m.status || 'pending'} · ${m.description}\n`;
      });
    }
    if (communications.length){
      evidenceText += '\nCOMMUNICATIONS WITH AGENT/LANDLORD:\n';
      communications.slice(0, 30).forEach((c, i) => {
        const d = c.date ? new Date(c.date).toISOString().slice(0,10) : '?';
        evidenceText += `  [C${i+1}] ${d} · ${c.type || 'message'} · ${c.subject || ''}` +
          (c.bodyPreview ? ` — "${c.bodyPreview.slice(0,140)}${c.bodyPreview.length>140?'…':''}"` : '') + '\n';
      });
    }
    if (routineHistory.length){
      evidenceText += '\nROUTINE INSPECTIONS (agency-led):\n';
      routineHistory.slice(0, 10).forEach((r, i) => {
        const d = r.date ? new Date(r.date).toISOString().slice(0,10) : '?';
        evidenceText += `  [R${i+1}] ${d}` + (r.agency?` · ${r.agency}`:'') + (r.itemsCount?` · ${r.itemsCount} items`:'');
        if (r.topConcerns && r.topConcerns.length) evidenceText += ` · key concerns: ${r.topConcerns.join('; ')}`;
        evidenceText += '\n';
      });
    }
    if (agencyEntryReport && agencyEntryReport.fileName){
      evidenceText += `\nAGENT'S MOVE-IN REPORT on file: ${agencyEntryReport.fileName}\n`;
    }
    if (agencyExitReport && agencyExitReport.fileName){
      evidenceText += `AGENT'S MOVE-OUT REPORT on file: ${agencyExitReport.fileName}\n`;
    }

    const userPrompt = `Compare the move-in and exit condition for a rental property in ${state}, Australia.
Property: ${propertyAddress || 'Rental property'}

ROOM-BY-ROOM COMPARISON:

${roomsText}
${evidenceText}

For each genuine change between move-in and exit, decide one of:
- "match" — fair wear and tear or no real change, no concern
- "review" — worth checking, the agent might query it but it's defensible
- "chargeable" — the agent is likely to claim against the bond unless explained or evidenced

When something appears chargeable, scan the maintenance log + communications above to see if the tenant ALREADY reported the issue during the tenancy. If they did, mention that as an "evidence" reference like [M3] or [C7] in the description — the renter is going to use this to defend against a claim, so the cross-reference is gold.

Suggest practical, cost-effective fixes for chargeable items only.`;

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
      return NextResponse.json(getMockComparison(rooms));
    }
  } catch (error) {
    console.error('Exit comparison error:', error);
    return NextResponse.json(
      { error: 'Failed to compare exit reports' },
      { status: 500 }
    );
  }
}

function getMockComparison(rooms: RoomSummary[]) {
  const poorRooms = rooms.filter(r => r.exitCondition === 'poor');
  const fairRooms = rooms.filter(r => r.exitCondition === 'fair');
  const flagged = [...poorRooms, ...fairRooms].slice(0, 2);
  const matchCount = rooms.length - flagged.length;

  const areas: AreaResult[] = rooms.map(r => ({
    room: r.name,
    emoji: r.emoji,
    status: flagged.some(f => f.name === r.name) ? 'review' : 'match',
  }));

  const discrepancies: Discrepancy[] = flagged.map(r => ({
    room: r.name,
    emoji: r.emoji,
    description: r.exitNotes
      ? `Exit notes indicate: "${r.exitNotes}". This differs from the move-in condition recorded as ${r.entryCondition || 'good'}.`
      : `The ${r.name} was marked as needing attention at exit. Compare this against your move-in photos to confirm.`,
    entryContext: r.entryNotes || 'Good condition at move-in',
    exitContext: r.exitNotes || `Condition noted as ${r.exitCondition} at exit`,
    severity: r.exitCondition === 'poor' ? 'moderate' : 'minor',
  }));

  const bondRecovery: BondRecoveryItem[] = flagged.map(r => ({
    room: r.name,
    emoji: r.emoji,
    issue: r.exitNotes || `${r.name} needs attention before key handover`,
    suggestion: `Thoroughly clean the ${r.name} and address any marks or damage. Document your repairs with before-and-after photos and save them to your Vault as evidence. For stubborn stains, consider a professional clean — many companies offer single-room cleans from $60–$120.`,
    timeEst: r.exitCondition === 'poor' ? '2–4 hours' : '30–60 mins',
    costEst: r.exitCondition === 'poor' ? '$60–$150' : '$0–$30',
    difficulty: r.exitCondition === 'poor' ? 'Professional recommended' : 'Easy',
  }));

  return {
    summary: { areasChecked: rooms.length, matches: matchCount, discrepancies: flagged.length },
    areas,
    discrepancies,
    bondRecovery,
  };
}

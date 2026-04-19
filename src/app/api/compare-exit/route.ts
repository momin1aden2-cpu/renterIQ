import { NextResponse } from 'next/server';
import { requireAuth, aiKillSwitch } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-gate';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface RoomSummary {
  name: string;
  emoji: string;
  entryCondition: string;
  entryNotes: string;
  exitCondition: string;
  exitNotes: string;
  changedItems?: ChangedItem[];
}

interface ChangedItem {
  label: string;
  entry: { clean: boolean | null; undamaged: boolean | null; working: boolean | string | null; comment?: string };
  exit:  { clean: boolean | null; undamaged: boolean | null; working: boolean | string | null; comment?: string };
}

interface AgencyItem {
  label: string;
  clean: boolean | null;
  undamaged: boolean | null;
  working: boolean | string | null;
  comment: string;
}

interface AgencyRoom {
  name: string;
  emoji: string;
  condition: string;
  items: AgencyItem[];
}

interface AgencyExtraction {
  rooms: AgencyRoom[];
  propertyAddress?: string | null;
  reportDate?: string | null;
  agentName?: string | null;
  tenantName?: string | null;
  totalItems?: number;
}

interface MaintenanceRef {
  date: string;
  description: string;
  status: 'pending' | 'resolved';
  threadId?: string;
}

interface CommunicationRef {
  date: string;
  type: string;
  subject: string;
  bodyPreview: string;
  threadId?: string;
}

interface RoutineRef {
  date: string;
  agency?: string;
  itemsCount?: number;
  topConcerns?: string[];
}

interface AgencyDoc {
  fileName?: string;
  url?: string;
  uploadedAt?: number;
}

const SYSTEM_PROMPT = `You are a friendly, practical move-out comparison helper for RenterIQ. You are NOT a legal advisor or tenancy expert. You compare FOUR sets of condition data to help a renter understand exactly where they stand before bond return.

The four data sources are:
1. RENTER'S OWN MOVE-IN RECORD — timestamped, with photos. The renter's personal baseline.
2. AGENT'S MOVE-IN REPORT — the official condition report provided by the real estate agency at the start of the tenancy (extracted from their PDF/document).
3. RENTER'S OWN EXIT RECORD — the renter's walkthrough at move-out.
4. AGENT'S EXIT REPORT — the official outgoing inspection by the agency (extracted from their PDF/document).

Not all four sources may be present. Work with whatever is available.

Tone:
- Plain, kind, matter-of-fact. Write like a knowledgeable friend, not a lawyer.
- Never use phrases like "you are liable", "you are entitled to", "the landlord must", "legally required", "under the Act". Use instead: "may come up at bond return", "worth fixing before handover", "most agents expect".
- Everything you suggest is a helpful pointer, not legal advice.

Job:
1. For each room, cross-reference all available sources.
2. Ignore normal fair wear and tear (minor scuffs, light carpet wear, small nail holes, small marks around door handles, paint fading).
3. Flag items that show a meaningful difference between move-in and exit.
4. CRITICAL: When the AGENT'S exit report claims damage but the AGENT'S OWN entry report shows the same issue already existed at move-in — highlight this contradiction. This is the renter's strongest defence.
5. When the renter's move-in photos/record show pre-existing damage that the agent's entry report missed — note this too.
6. Cross-reference the maintenance log and communications. If the renter reported an issue during the tenancy and can prove it, flag that evidence.
7. For each genuinely chargeable item, suggest practical, cost-effective fixes.

For each discrepancy, include a "sources" object showing what each of the four sources says about this item (or null if that source doesn't mention it).

Return ONLY valid JSON in exactly this format:
{
  "summary": {
    "areasChecked": number,
    "matches": number,
    "reviewItems": number,
    "chargeableItems": number,
    "contradictions": number,
    "bondAtRiskEstimate": "e.g. $0–$120" or null,
    "hasAgencyEntry": boolean,
    "hasAgencyExit": boolean
  },
  "areas": [
    { "room": "Room Name", "emoji": "emoji", "status": "match" | "review" | "chargeable" | "contradiction" }
  ],
  "discrepancies": [
    {
      "room": "Room Name",
      "emoji": "emoji",
      "itemLabel": "Specific item name",
      "description": "Friendly 2-3 sentence summary",
      "severity": "match" | "review" | "chargeable" | "contradiction",
      "sources": {
        "renterEntry": "Brief state or null",
        "agentEntry": "Brief state or null",
        "renterExit": "Brief state or null",
        "agentExit": "Brief state or null"
      },
      "evidenceRefs": ["M3", "C7"],
      "evidenceNote": "One-line note about evidence (e.g. 'You reported this on 8 March and the agent confirmed receipt')",
      "contradictionNote": "If agent exit claims damage but agent entry shows same issue — explain the contradiction here. Otherwise null."
    }
  ],
  "bondRecovery": [
    {
      "room": "Room Name",
      "emoji": "emoji",
      "issue": "One sentence describing the issue",
      "suggestion": "Practical fix — specific products, steps, rough costs",
      "timeEst": "e.g. 30 mins",
      "costEst": "e.g. $0–$30",
      "difficulty": "Easy" | "Medium" | "Professional recommended"
    }
  ]
}

Severity guide:
- "match" — no real change, fair wear and tear, nothing to worry about
- "review" — minor difference, agent might ask but it's defensible
- "chargeable" — agent is likely to claim against the bond unless addressed
- "contradiction" — the agent's OWN reports contradict each other (entry vs exit), which strongly supports the renter

If everything matches, return empty discrepancies and bondRecovery arrays with all areas as "match".
Australian context: reference Australian stores (Bunnings, Woolworths), common AU cleaning products, and typical expectations — never frame as law.`;

export async function POST(request: Request) {
  const killed = aiKillSwitch();
  if (killed) return killed;
  const auth = await requireAuth(request, { limit: 10 });
  if (!auth.ok) return auth.response;
  const gate = await requireFeature(auth.uid, 'exit_bond_shield');
  if (!gate.ok) return gate.response;

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
      agencyEntryItems,
      agencyExitItems,
    } = body as {
      rooms: RoomSummary[];
      propertyAddress?: string;
      state?: string;
      maintenanceLog?: MaintenanceRef[];
      communications?: CommunicationRef[];
      routineHistory?: RoutineRef[];
      agencyEntryReport?: AgencyDoc | null;
      agencyExitReport?: AgencyDoc | null;
      agencyEntryItems?: AgencyExtraction | null;
      agencyExitItems?: AgencyExtraction | null;
    };

    if (!rooms || !Array.isArray(rooms) || rooms.length === 0) {
      return NextResponse.json({ error: 'No room data provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getMockComparison(rooms, !!agencyEntryItems, !!agencyExitItems));
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const fmt = (v: boolean | string | null | undefined) => v === true ? '✓' : v === false ? '✗' : (v === 'na' ? 'N/A' : '?');

    // ── Source 1 + 3: Renter's own entry + exit ──
    const roomsText = rooms.map(r => {
      let block = `ROOM: ${r.emoji || ''} ${r.name}\n` +
        `  Renter move-in overall: ${r.entryCondition || 'Good'}\n` +
        `  Renter move-in notes: ${r.entryNotes || '(none)'}\n` +
        `  Renter exit overall: ${r.exitCondition || 'Good'}\n` +
        `  Renter exit notes: ${r.exitNotes || '(none)'}`;
      if (r.changedItems && r.changedItems.length) {
        block += '\n  CHANGED ITEMS (renter entry → renter exit):';
        r.changedItems.forEach(ci => {
          const entryStr = `clean ${fmt(ci.entry.clean)} · undamaged ${fmt(ci.entry.undamaged)} · working ${fmt(ci.entry.working)}`;
          const exitStr  = `clean ${fmt(ci.exit.clean)} · undamaged ${fmt(ci.exit.undamaged)} · working ${fmt(ci.exit.working)}`;
          block += `\n    • ${ci.label}: ${entryStr}  →  ${exitStr}` + (ci.exit.comment ? ` — "${ci.exit.comment}"` : '');
        });
      }
      return block;
    }).join('\n\n');

    // ── Source 2: Agent's entry report (extracted) ──
    let agencyEntryText = '';
    if (agencyEntryItems && agencyEntryItems.rooms && agencyEntryItems.rooms.length) {
      agencyEntryText = '\n\n══ AGENT\'S MOVE-IN REPORT (extracted from their document) ══\n';
      if (agencyEntryItems.reportDate) agencyEntryText += `Report date: ${agencyEntryItems.reportDate}\n`;
      if (agencyEntryItems.agentName) agencyEntryText += `Agent: ${agencyEntryItems.agentName}\n`;
      agencyEntryItems.rooms.forEach(r => {
        agencyEntryText += `\nROOM: ${r.emoji || ''} ${r.name} (agent says: ${r.condition})\n`;
        (r.items || []).forEach(it => {
          agencyEntryText += `  • ${it.label}: clean ${fmt(it.clean)} · undamaged ${fmt(it.undamaged)} · working ${fmt(it.working)}` +
            (it.comment ? ` — "${it.comment}"` : '') + '\n';
        });
      });
    } else if (agencyEntryReport && agencyEntryReport.fileName) {
      agencyEntryText = `\n\nAGENT'S MOVE-IN REPORT on file: ${agencyEntryReport.fileName} (not extracted — metadata only)\n`;
    }

    // ── Source 4: Agent's exit report (extracted) ──
    let agencyExitText = '';
    if (agencyExitItems && agencyExitItems.rooms && agencyExitItems.rooms.length) {
      agencyExitText = '\n\n══ AGENT\'S EXIT REPORT (extracted from their document) ══\n';
      if (agencyExitItems.reportDate) agencyExitText += `Report date: ${agencyExitItems.reportDate}\n`;
      if (agencyExitItems.agentName) agencyExitText += `Agent: ${agencyExitItems.agentName}\n`;
      agencyExitItems.rooms.forEach(r => {
        agencyExitText += `\nROOM: ${r.emoji || ''} ${r.name} (agent says: ${r.condition})\n`;
        (r.items || []).forEach(it => {
          agencyExitText += `  • ${it.label}: clean ${fmt(it.clean)} · undamaged ${fmt(it.undamaged)} · working ${fmt(it.working)}` +
            (it.comment ? ` — "${it.comment}"` : '') + '\n';
        });
      });
    } else if (agencyExitReport && agencyExitReport.fileName) {
      agencyExitText = `\nAGENT'S EXIT REPORT on file: ${agencyExitReport.fileName} (not extracted — metadata only)\n`;
    }

    // ── Evidence trail ──
    let evidenceText = '';
    if (maintenanceLog.length) {
      evidenceText += '\n\nMAINTENANCE LOG (issues the tenant reported during tenancy):\n';
      maintenanceLog.slice(0, 30).forEach((m, i) => {
        const d = m.date ? new Date(m.date).toISOString().slice(0, 10) : '?';
        evidenceText += `  [M${i + 1}] ${d} · ${m.status || 'pending'} · ${m.description}\n`;
      });
    }
    if (communications.length) {
      evidenceText += '\nCOMMUNICATIONS WITH AGENT/LANDLORD:\n';
      communications.slice(0, 30).forEach((c, i) => {
        const d = c.date ? new Date(c.date).toISOString().slice(0, 10) : '?';
        evidenceText += `  [C${i + 1}] ${d} · ${c.type || 'message'} · ${c.subject || ''}` +
          (c.bodyPreview ? ` — "${c.bodyPreview.slice(0, 140)}${c.bodyPreview.length > 140 ? '…' : ''}"` : '') + '\n';
      });
    }
    if (routineHistory.length) {
      evidenceText += '\nROUTINE INSPECTIONS (agency-led):\n';
      routineHistory.slice(0, 10).forEach((r, i) => {
        const d = r.date ? new Date(r.date).toISOString().slice(0, 10) : '?';
        evidenceText += `  [R${i + 1}] ${d}` + (r.agency ? ` · ${r.agency}` : '') + (r.itemsCount ? ` · ${r.itemsCount} items` : '');
        if (r.topConcerns && r.topConcerns.length) evidenceText += ` · key concerns: ${r.topConcerns.join('; ')}`;
        evidenceText += '\n';
      });
    }

    const hasAgencyEntry = !!(agencyEntryItems && agencyEntryItems.rooms && agencyEntryItems.rooms.length);
    const hasAgencyExit = !!(agencyExitItems && agencyExitItems.rooms && agencyExitItems.rooms.length);

    let comparisonMode = 'two-way (renter entry vs renter exit only)';
    if (hasAgencyEntry && hasAgencyExit) comparisonMode = 'FOUR-WAY (renter entry + agent entry + renter exit + agent exit)';
    else if (hasAgencyEntry) comparisonMode = 'three-way (renter entry + agent entry + renter exit)';
    else if (hasAgencyExit) comparisonMode = 'three-way (renter entry + renter exit + agent exit)';

    const userPrompt = `Compare the move-in and exit condition for a rental property in ${state}, Australia.
Property: ${propertyAddress || 'Rental property'}
Comparison mode: ${comparisonMode}

══ RENTER'S OWN RECORDS ══

${roomsText}
${agencyEntryText}
${agencyExitText}
${evidenceText}

INSTRUCTIONS:
${hasAgencyEntry && hasAgencyExit ? `
This is a FOUR-WAY comparison. For each item that differs:
1. Check renter entry vs agent entry — did they agree at move-in? If not, note it.
2. Check renter exit vs agent exit — do they agree at move-out? If not, note it.
3. CRITICALLY: If the agent's EXIT report claims damage but the agent's OWN ENTRY report shows the SAME issue already existed — that is a CONTRADICTION. Mark severity as "contradiction" and explain in contradictionNote. This is the renter's strongest defence.
4. If the renter's move-in record shows pre-existing damage that the agent's entry report missed, note that — the renter's timestamped photos support their case.
` : `
Compare renter entry vs exit${hasAgencyEntry ? ' and cross-check against the agent\'s entry baseline' : ''}${hasAgencyExit ? ' and compare against the agent\'s exit findings' : ''}.
`}

For each genuine change, decide severity:
- "match" — fair wear and tear or no real change
- "review" — agent might ask, but it's defensible
- "chargeable" — agent is likely to claim against bond unless addressed
- "contradiction" — agent's own reports contradict each other (strongest renter defence)

Cross-reference the maintenance log + communications. If the tenant reported an issue and can prove it, that's gold — include the [M] or [C] reference.

Suggest practical, cost-effective fixes for chargeable items only (not contradictions — those are the agent's problem).`;

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: userPrompt },
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (jsonMatch[1] || text).trim();

    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.summary) {
        parsed.summary.hasAgencyEntry = hasAgencyEntry;
        parsed.summary.hasAgencyExit = hasAgencyExit;
      }
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json(getMockComparison(rooms, hasAgencyEntry, hasAgencyExit));
    }
  } catch (error) {
    console.error('Exit comparison error:', error);
    return NextResponse.json(
      { error: 'Failed to compare exit reports' },
      { status: 500 }
    );
  }
}

function getMockComparison(rooms: RoomSummary[], hasAgencyEntry: boolean, hasAgencyExit: boolean) {
  const poorRooms = rooms.filter(r => r.exitCondition === 'poor');
  const fairRooms = rooms.filter(r => r.exitCondition === 'fair');
  const flagged = [...poorRooms, ...fairRooms].slice(0, 2);
  const matchCount = rooms.length - flagged.length;

  const areas = rooms.map(r => ({
    room: r.name,
    emoji: r.emoji,
    status: (flagged.some(f => f.name === r.name) ? 'review' : 'match') as 'match' | 'review',
  }));

  const discrepancies = flagged.map(r => ({
    room: r.name,
    emoji: r.emoji,
    itemLabel: 'General condition',
    description: r.exitNotes
      ? `Exit notes indicate: "${r.exitNotes}". This differs from the move-in condition.`
      : `The ${r.name} was marked as needing attention at exit. Compare against your move-in photos.`,
    severity: 'review' as const,
    sources: {
      renterEntry: r.entryNotes || 'Good condition',
      agentEntry: hasAgencyEntry ? 'See agent report' : null,
      renterExit: r.exitNotes || r.exitCondition || 'Fair',
      agentExit: hasAgencyExit ? 'See agent report' : null,
    },
    evidenceRefs: [] as string[],
    evidenceNote: null as string | null,
    contradictionNote: null as string | null,
  }));

  const bondRecovery = flagged.map(r => ({
    room: r.name,
    emoji: r.emoji,
    issue: r.exitNotes || `${r.name} needs attention before handover`,
    suggestion: `Thoroughly clean the ${r.name} and address marks or damage. Document repairs with photos. For stubborn stains, consider a professional clean from $60–$120.`,
    timeEst: r.exitCondition === 'poor' ? '2–4 hours' : '30–60 mins',
    costEst: r.exitCondition === 'poor' ? '$60–$150' : '$0–$30',
    difficulty: r.exitCondition === 'poor' ? 'Professional recommended' : 'Easy',
  }));

  return {
    summary: {
      areasChecked: rooms.length,
      matches: matchCount,
      reviewItems: flagged.length,
      chargeableItems: 0,
      contradictions: 0,
      bondAtRiskEstimate: null,
      hasAgencyEntry,
      hasAgencyExit,
    },
    areas,
    discrepancies,
    bondRecovery,
  };
}

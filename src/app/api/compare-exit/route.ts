import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface RoomSummary {
  name: string;
  emoji: string;
  entryCondition: string;
  entryNotes: string;
  exitCondition: string;
  exitNotes: string;
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

const SYSTEM_PROMPT = `You are an expert Australian tenancy advisor helping a tenant compare their move-in and move-out property condition.

You will receive a list of rooms with their entry condition (move-in notes) and exit condition (move-out notes). Your job is to:
1. Identify any genuine discrepancies — things that appear worse at exit compared to move-in
2. Ignore normal fair wear and tear (minor scuffs, light carpet wear, small nail holes)
3. Flag actual damage or deterioration the tenant may be liable for
4. Suggest practical, cost-effective fixes to recover their bond

Return ONLY valid JSON in exactly this format:
{
  "summary": {
    "areasChecked": number,
    "matches": number,
    "discrepancies": number
  },
  "areas": [
    { "room": "Room Name", "emoji": "emoji", "status": "match" | "review" }
  ],
  "discrepancies": [
    {
      "room": "Room Name",
      "emoji": "emoji",
      "description": "What RenterIQ noticed — 2-3 sentences comparing entry vs exit",
      "entryContext": "Brief summary of move-in condition",
      "exitContext": "Brief summary of exit condition",
      "severity": "minor" | "moderate" | "significant"
    }
  ],
  "bondRecovery": [
    {
      "room": "Room Name",
      "emoji": "emoji",
      "issue": "One sentence describing the issue",
      "suggestion": "Detailed practical fix suggestion — specific products, steps, costs where possible",
      "timeEst": "e.g. 30 mins",
      "costEst": "e.g. $0–$30",
      "difficulty": "Easy" | "Medium" | "Professional recommended"
    }
  ]
}

If there are NO discrepancies, return empty arrays for discrepancies and bondRecovery, with all areas as "match".
Australian context: reference Australian stores (Bunnings, Woolworths), Australian cleaning products, and fair wear and tear standards under Australian tenancy law.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rooms, propertyAddress, state = 'VIC' } = body as {
      rooms: RoomSummary[];
      propertyAddress?: string;
      state?: string;
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

    const roomsText = rooms.map(r =>
      `ROOM: ${r.emoji} ${r.name}\n` +
      `  Move-in condition: ${r.entryCondition || 'Good'}\n` +
      `  Move-in notes: ${r.entryNotes || 'No issues noted'}\n` +
      `  Exit condition: ${r.exitCondition || 'Good'}\n` +
      `  Exit notes: ${r.exitNotes || 'No issues noted'}`
    ).join('\n\n');

    const userPrompt = `Compare the move-in and exit condition for a rental property in ${state}, Australia.
Property: ${propertyAddress || 'Rental property'}

ROOM-BY-ROOM COMPARISON:

${roomsText}

Identify any genuine discrepancies (beyond normal fair wear and tear) and suggest practical fixes to help the tenant recover their bond.`;

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
      { error: 'Failed to compare exit reports', details: String(error) },
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

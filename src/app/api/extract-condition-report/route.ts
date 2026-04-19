import { NextResponse } from 'next/server';
import { requireAuth, aiKillSwitch } from '@/lib/api-auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ExtractedItem {
  label: string;
  clean: boolean | null;
  undamaged: boolean | null;
  working: boolean | string | null;
  comment: string;
}

interface ExtractedRoom {
  name: string;
  emoji: string;
  condition: 'good' | 'issues' | 'fair' | 'poor';
  items: ExtractedItem[];
}

interface ExtractionResult {
  rooms: ExtractedRoom[];
  propertyAddress: string | null;
  reportDate: string | null;
  agentName: string | null;
  tenantName: string | null;
  totalItems: number;
}

const SYSTEM_PROMPT = `You are a document extraction tool for RenterIQ. You read Australian residential tenancy condition reports (move-in or move-out) and extract structured data from them.

These reports come from real estate agencies and follow formats used by REIV (Victoria), REIQ (Queensland), REIWA (Western Australia), and similar bodies. They typically contain:
- A property address and date
- Agent/landlord and tenant names
- Room-by-room tables with items and condition markings
- Condition columns like: Clean, Undamaged, Working, Good condition, Satisfactory
- Comments or notes per item
- Sometimes checkboxes, ticks (✓), crosses (✗), Y/N, or descriptive text

Your job is to extract EVERY room and EVERY item from the report into a structured format.

Mapping rules for condition columns:
- "Clean" / "Satisfactory" / "Good" / "Yes" / "Y" / "✓" / ticked checkbox → true
- "Not clean" / "No" / "N" / "✗" / crossed checkbox / any negative → false
- Empty / blank / unmarked / "N/A" / not applicable → null
- For the "working" field: if the item is not something that works (e.g. walls, floors) → "na"

Room name mapping — normalise to these standard names where possible:
- Kitchen, Living Room, Bedroom 1, Bedroom 2, Bedroom 3, Bathroom, Ensuite, Laundry, Hallway/Entry, Garage/Carport, Outdoor/Garden, Toilet, Study/Office

For each room, derive an overall condition:
- "good" if all items are true or null (nothing marked as an issue)
- "issues" if any item has a false marking or a comment noting damage/concern
- "fair" if a few items have issues
- "poor" if many items have issues

Return ONLY valid JSON in this exact format:
{
  "propertyAddress": "Full address or null if not found",
  "reportDate": "ISO date string or null",
  "agentName": "Agent/agency name or null",
  "tenantName": "Tenant name or null",
  "rooms": [
    {
      "name": "Kitchen",
      "emoji": "🍳",
      "condition": "good",
      "items": [
        {
          "label": "Sink & Taps",
          "clean": true,
          "undamaged": true,
          "working": true,
          "comment": "Minor water marks noted"
        }
      ]
    }
  ],
  "totalItems": 47
}

Standard emoji mapping: Kitchen 🍳, Living Room 🛋️, Bedroom 🛏️, Bathroom 🚿, Ensuite 🚿, Laundry 🧺, Hallway/Entry 🚪, Garage/Carport 🚗, Outdoor/Garden 🌿, Toilet 🚽, Study/Office 📚

Extract EVERYTHING — do not summarise or skip items. Every row in every table in the report should appear as an item.`;

export async function POST(request: Request) {
  const killed = aiKillSwitch();
  if (killed) return killed;
  const auth = await requireAuth(request, { limit: 8 });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { fileData, mimeType, fileName } = body as {
      fileData: string;
      mimeType: string;
      fileName?: string;
    };

    if (!fileData) {
      return NextResponse.json({ error: 'No file data provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getMockExtraction(fileName));
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    });

    const base64Clean = fileData.includes(',')
      ? fileData.split(',')[1]
      : fileData;

    const resolvedMime = mimeType || 'application/pdf';

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      {
        inlineData: {
          mimeType: resolvedMime,
          data: base64Clean,
        },
      },
      {
        text: `Extract every room and every item from this ${fileName ? `"${fileName}" ` : ''}condition report. Return the full JSON extraction.`,
      },
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (jsonMatch[1] || text).trim();

    try {
      const parsed = JSON.parse(jsonStr) as ExtractionResult;

      if (!parsed.rooms || !Array.isArray(parsed.rooms)) {
        return NextResponse.json(
          { error: 'Could not extract room data from this document. Try a clearer photo or PDF.' },
          { status: 422 }
        );
      }

      parsed.totalItems = parsed.rooms.reduce(
        (sum, r) => sum + (r.items ? r.items.length : 0),
        0
      );

      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json(
        { error: 'Could not parse the extracted data. The document may be in an unsupported format.' },
        { status: 422 }
      );
    }
  } catch (error) {
    const err = error as Error;
    console.error('[extract-condition-report] fatal:', err?.stack || err);
    return NextResponse.json(
      { error: err?.message ? `Extraction failed: ${err.message}` : 'Could not extract condition report.' },
      { status: 500 }
    );
  }
}

function getMockExtraction(fileName?: string): ExtractionResult {
  return {
    propertyAddress: null,
    reportDate: null,
    agentName: null,
    tenantName: null,
    rooms: [
      {
        name: 'Kitchen',
        emoji: '🍳',
        condition: 'good',
        items: [
          { label: 'Walls', clean: true, undamaged: true, working: 'na', comment: '' },
          { label: 'Floor', clean: true, undamaged: true, working: 'na', comment: '' },
          { label: 'Sink & Taps', clean: true, undamaged: true, working: true, comment: '' },
          { label: 'Stove / Oven', clean: true, undamaged: true, working: true, comment: '' },
          { label: 'Cupboards', clean: true, undamaged: true, working: true, comment: '' },
        ],
      },
      {
        name: 'Living Room',
        emoji: '🛋️',
        condition: 'good',
        items: [
          { label: 'Walls', clean: true, undamaged: true, working: 'na', comment: '' },
          { label: 'Floor / Carpet', clean: true, undamaged: true, working: 'na', comment: '' },
          { label: 'Windows', clean: true, undamaged: true, working: true, comment: '' },
          { label: 'Lights', clean: true, undamaged: true, working: true, comment: '' },
        ],
      },
      {
        name: 'Bathroom',
        emoji: '🚿',
        condition: 'good',
        items: [
          { label: 'Shower', clean: true, undamaged: true, working: true, comment: '' },
          { label: 'Toilet', clean: true, undamaged: true, working: true, comment: '' },
          { label: 'Basin', clean: true, undamaged: true, working: true, comment: '' },
          { label: 'Mirror', clean: true, undamaged: true, working: 'na', comment: '' },
        ],
      },
    ],
    totalItems: 13,
  };
}

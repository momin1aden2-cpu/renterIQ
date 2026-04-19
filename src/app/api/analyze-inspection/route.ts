import { NextResponse } from 'next/server';
import { requireAuth, aiKillSwitch } from '@/lib/api-auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are an Australian rental inspection report analyst for RenterIQ.
You receive routine inspection report text from a tenant. Your job is to:

1. Extract every action item from the report
2. Categorise each item as either "tenant" or "owner" responsibility based on Australian Residential Tenancies law
3. Assign a priority: "high", "medium", or "low"
4. Suggest a deadline in days (from today) for tenant items
5. Provide a brief plain-English explanation of WHY it falls under that party's responsibility
6. For tenant items, provide a short actionable instruction on how to fix it

Respond ONLY with valid JSON in this exact format:
{
  "items": [
    {
      "description": "Short description of the item",
      "responsibility": "tenant" | "owner",
      "priority": "high" | "medium" | "low",
      "deadline_days": number or null,
      "explanation": "Why this is tenant/owner responsibility under Australian law",
      "action": "What to do about it (for tenant items) or what to tell the agent (for owner items)",
      "category": "cleaning" | "garden" | "repairs" | "maintenance" | "damage" | "safety" | "other"
    }
  ],
  "summary": {
    "total": number,
    "tenant_count": number,
    "owner_count": number,
    "urgent_count": number
  },
  "suggested_response_deadline_days": 14
}

Rules:
- Plumbing, electrical, structural, roofing, hot water, heating/cooling, locks, security = OWNER
- Mowing, general cleaning, mould from poor ventilation, oven/stove cleaning, carpet stains from tenant use = TENANT
- If unclear, default to OWNER and note it should be confirmed
- Reference common Australian tenancy expectations (don't quote specific Act sections)
- Be practical and fair in your assessments

Limits & quality:
- Aim for clarity, not maximum count. Return ONLY items that genuinely need action (skip "Satisfactory", "OK", "Good condition" rows entirely — those are not action items).
- Soft cap: typically 15–25 items is right for most inspections. A large home with many real defects can legitimately produce 30–45 items — that's fine, return them all if they are real and actionable.
- Hard cap: 60 items absolute maximum. If the report has more than that, prioritise by severity and merge low-priority cleaning items by room ("Bedroom 2: dust skirtings, cobwebs in corner, wipe window sill" as one item).
- Merge duplicates aggressively. Multiple "clean grease from rangehood" entries → one item. "Wipe skirting boards in living, dining, hallway" → "Wipe skirting boards throughout main living areas."
- Skip headers, room labels, page numbers, and "general comment" rows that aren't actionable.
- If you have to merge or summarise, mention the room/area in the description so the renter still knows where to act.

Input format notes:
- Agency reports commonly arrive as scanned PDFs or photos of a multi-column table with columns like "Item / Comment / Action Required / By Whom / Due Date". Read the table row-by-row and map each row to one item — do not skip rows that span multiple lines.
- Some agencies include a summary / covering page with a single overall due-back date ("please return within 14 days"). Use that for \`suggested_response_deadline_days\` if found.
- If the report includes per-item due dates (e.g. "by 30 March"), convert to days-from-today for \`deadline_days\`.
- Bullet-list or plain-text reports should be parsed the same way: every bullet = one item.
- Handwritten notes on scanned forms should still be read — include them as items even if legibility is uncertain.`;

export async function POST(request: Request) {
  const killed = aiKillSwitch();
  if (killed) return killed;
  const auth = await requireAuth(request, { limit: 10 });
  if (!auth.ok) return auth.response;

  let reportText = '';
  try {
    const contentType = request.headers.get('content-type') || '';
    let imageData: { data: string; mimeType: string } | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      reportText = (formData.get('text') as string) || '';
      const file = formData.get('file') as File | null;

      if (file) {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        let mimeType = file.type || '';

        // iOS often leaves .heic uploads with an empty mime type — fall back
        // to the extension so Gemini still accepts the file.
        if (!mimeType) {
          const name = (file.name || '').toLowerCase();
          if (name.endsWith('.heic')) mimeType = 'image/heic';
          else if (name.endsWith('.heif')) mimeType = 'image/heif';
          else if (name.endsWith('.pdf')) mimeType = 'application/pdf';
          else if (name.endsWith('.webp')) mimeType = 'image/webp';
          else if (name.endsWith('.png')) mimeType = 'image/png';
          else mimeType = 'image/jpeg';
        }

        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
        if (!allowed.includes(mimeType)) {
          return NextResponse.json(
            { error: `Unsupported file type "${mimeType || file.type || 'unknown'}". Please upload a PDF or JPG/PNG/WebP/HEIC image of the inspection report.` },
            { status: 400 }
          );
        }

        imageData = { data: base64, mimeType };
      }
    } else {
      const body = await request.json();
      reportText = body.text || '';
    }

    if (!reportText && !imageData) {
      return NextResponse.json(
        { error: 'No report text or file provided' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Return mock data when no API key is configured
      return NextResponse.json(getMockAnalysis(reportText));
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

    parts.push({ text: SYSTEM_PROMPT });

    if (imageData) {
      parts.push({
        inlineData: {
          data: imageData.data,
          mimeType: imageData.mimeType,
        },
      });
      parts.push({
        text: 'Please extract and analyse all items from this routine inspection report image. If there is also text provided, use both sources.',
      });
    }

    if (reportText) {
      parts.push({
        text: `Here is the routine inspection report text:\n\n${reportText}`,
      });
    }

    const result = await model.generateContent(parts);
    const response = result.response;
    const text = response.text();

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (jsonMatch[1] || text).trim();

    try {
      const analysis = JSON.parse(jsonStr);
      return NextResponse.json(analysis);
    } catch {
      console.error('Failed to parse AI response as JSON:', text);
      return NextResponse.json(
        { error: 'Failed to parse AI analysis', raw: text },
        { status: 500 }
      );
    }
  } catch (error) {
    const err = error as Error;
    console.error('[analyze-inspection] fatal:', err?.stack || err);
    // Fall back to mock analysis on any error so the UI still shows something
    // useful, but surface the real message + stack for debugging.
    const mock = getMockAnalysis(reportText) as Record<string, unknown>;
    mock._warning = err?.message ? `Live AI unavailable — fell back to heuristic parse: ${err.message}` : 'Live AI unavailable — fell back to heuristic parse';
    return NextResponse.json(mock);
  }
}

function getMockAnalysis(text: string) {
  // Parse manual items if provided as line-separated text
  const lines = text
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 3);

  if (lines.length === 0) {
    // Default demo items
    return getDefaultMock();
  }

  // Generate mock categorisation for each line
  const tenantKeywords = ['clean', 'mow', 'garden', 'dust', 'mould', 'oven', 'stove', 'carpet', 'tidy', 'weeds', 'cobweb', 'grease', 'scrub'];
  const ownerKeywords = ['leak', 'crack', 'broken', 'plumb', 'electric', 'heater', 'hot water', 'roof', 'gutter', 'lock', 'window crack', 'structural', 'pest', 'damp'];

  const items = lines.map((line: string, i: number) => {
    const lower = line.toLowerCase();
    const isOwner = ownerKeywords.some((k: string) => lower.includes(k));
    const isTenant = tenantKeywords.some((k: string) => lower.includes(k));
    const responsibility = isOwner ? 'owner' : isTenant ? 'tenant' : (i % 2 === 0 ? 'tenant' : 'owner');

    return {
      description: line,
      responsibility,
      priority: isOwner ? 'high' : (i < 2 ? 'high' : i < 4 ? 'medium' : 'low'),
      deadline_days: responsibility === 'tenant' ? 7 + (i * 3) : null,
      explanation: responsibility === 'owner'
        ? 'Structural/mechanical repairs are the landlord\'s responsibility under the Residential Tenancies Act.'
        : 'General cleanliness and garden maintenance are the tenant\'s responsibility during the tenancy.',
      action: responsibility === 'owner'
        ? 'Report to agent and request repair within 14 days.'
        : 'Complete before the response deadline.',
      category: isOwner ? 'repairs' : (lower.includes('garden') || lower.includes('mow') ? 'garden' : 'cleaning'),
    };
  });

  const tenantCount = items.filter((it: { responsibility: string }) => it.responsibility === 'tenant').length;
  const ownerCount = items.filter((it: { responsibility: string }) => it.responsibility === 'owner').length;

  return {
    items,
    summary: {
      total: items.length,
      tenant_count: tenantCount,
      owner_count: ownerCount,
      urgent_count: items.filter((it: { priority: string }) => it.priority === 'high').length,
    },
    suggested_response_deadline_days: 14,
  };
}

function getDefaultMock() {
  return {
    items: [
      {
        description: 'Front garden needs mowing and edging',
        responsibility: 'tenant',
        priority: 'high',
        deadline_days: 5,
        explanation: 'Garden maintenance is the tenant\'s responsibility unless the lease states otherwise.',
        action: 'Mow lawn, trim edges, remove weeds from garden beds.',
        category: 'garden',
      },
      {
        description: 'Kitchen tap leaking under sink',
        responsibility: 'owner',
        priority: 'high',
        deadline_days: null,
        explanation: 'Plumbing repairs are the landlord\'s responsibility under the Residential Tenancies Act.',
        action: 'Report to agent — request urgent plumber within 14 days.',
        category: 'repairs',
      },
      {
        description: 'Bathroom ceiling has mould spots',
        responsibility: 'tenant',
        priority: 'medium',
        deadline_days: 7,
        explanation: 'Minor mould from poor ventilation is typically the tenant\'s responsibility to clean.',
        action: 'Apply mould removal spray to ceiling. Use exhaust fan during showers.',
        category: 'cleaning',
      },
      {
        description: 'Bedroom window cracked',
        responsibility: 'owner',
        priority: 'high',
        deadline_days: null,
        explanation: 'Window repairs are the owner\'s obligation unless damage was caused by the tenant.',
        action: 'Report to agent — security concern, request urgent glazier.',
        category: 'repairs',
      },
      {
        description: 'Oven needs deep clean',
        responsibility: 'tenant',
        priority: 'low',
        deadline_days: 10,
        explanation: 'Keeping appliances clean is part of maintaining the property in reasonable condition.',
        action: 'Remove racks and soak. Use oven cleaner on interior surfaces.',
        category: 'cleaning',
      },
    ],
    summary: {
      total: 5,
      tenant_count: 3,
      owner_count: 2,
      urgent_count: 2,
    },
    suggested_response_deadline_days: 14,
  };
}

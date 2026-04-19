import { NextResponse } from 'next/server';
import { requireAuth, aiKillSwitch } from '@/lib/api-auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are a helpful Australian rental maintenance assistant for RenterIQ.
A tenant is reporting a maintenance issue to their landlord or agent. You receive:
- A plain-English description of the issue
- The category the tenant picked (or "other")
- The urgency they picked (emergency / urgent / routine)
- Optional photos of the problem
- The property address and (optionally) the tenant's name + agent details

Your job is to help the tenant communicate clearly and professionally with the agent.
You are NOT providing legal advice. You are NOT writing legal correspondence. You are helping
the tenant draft a friendly, clear, factual email.

Respond ONLY with valid JSON in this exact shape:
{
  "category": "plumbing | electrical | heating_cooling | appliance | structural | pest | locks_security | water_damage | mould | safety | other",
  "severity": "emergency | urgent | routine",
  "severity_reason": "One short sentence explaining why this severity is appropriate",
  "subject": "Email subject line (under 80 chars)",
  "body": "Full draft email body — plain text, not HTML. Start with Hi <agent name> (or 'Hi there' if none). End with 'Kind regards,\\n<tenant name>' or '[Your name]'.",
  "tenant_tips": ["Up to 3 short, practical tips for the tenant — what to do right now, what to check, what to keep a record of"],
  "follow_up_days": number,
  "expected_response_days": number
}

Rules:
- Tone: friendly, factual, respectful. No threats, no demands. No legal language.
- Email body must include: what the issue is, when the tenant first noticed it, how it affects daily living, photos attached (if any), the urgency, and a polite ask for response.
- NEVER cite specific sections of the Residential Tenancies Act. NEVER mention tribunals, VCAT, CTTT, NCAT, QCAT, WAT, etc.
- NEVER use phrases like "I require", "I demand", "I am entitled to", "legally obliged".
- DO use phrases like "I'd appreciate", "could you please", "let me know", "at your convenience".
- expected_response_days: emergency = 1, urgent = 2-3, routine = 7-14
- follow_up_days: the number of days after which the tenant should send a polite follow-up if no response (typically expected_response_days + 2-3)
- tenant_tips should be practical — e.g. "Turn off the water at the main if the leak worsens" or "Keep a bucket under it and a dated photo of the level"
- severity: only upgrade to "emergency" if the issue makes the property unsafe or unlivable (no running water, no power, gas leak, sewage, no secure entry, no working fridge, no hot water in winter, structural collapse risk). Everything else is urgent or routine.`;

type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } };

export async function POST(request: Request) {
  const killed = aiKillSwitch();
  if (killed) return killed;
  const auth = await requireAuth(request, { limit: 10 });
  if (!auth.ok) return auth.response;

  try {
    const contentType = request.headers.get('content-type') || '';
    let description = '';
    let category = 'other';
    let tenantUrgency = 'routine';
    let address = '';
    let tenantName = '';
    let agentName = '';
    const photoParts: GeminiPart[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      description = (formData.get('description') as string) || '';
      category = (formData.get('category') as string) || 'other';
      tenantUrgency = (formData.get('urgency') as string) || 'routine';
      address = (formData.get('address') as string) || '';
      tenantName = (formData.get('tenantName') as string) || '';
      agentName = (formData.get('agentName') as string) || '';

      const files = formData.getAll('photos');
      for (const file of files) {
        if (!(file instanceof File)) continue;
        if (file.size === 0) continue;
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        let mimeType = file.type || '';
        if (!mimeType) {
          const lower = (file.name || '').toLowerCase();
          if (lower.endsWith('.heic')) mimeType = 'image/heic';
          else if (lower.endsWith('.heif')) mimeType = 'image/heif';
          else if (lower.endsWith('.png')) mimeType = 'image/png';
          else if (lower.endsWith('.webp')) mimeType = 'image/webp';
          else mimeType = 'image/jpeg';
        }
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
        if (!allowed.includes(mimeType)) continue;
        photoParts.push({ inlineData: { data: base64, mimeType } });
      }
    } else {
      const body = await request.json();
      description = body.description || '';
      category = body.category || 'other';
      tenantUrgency = body.urgency || 'routine';
      address = body.address || '';
      tenantName = body.tenantName || '';
      agentName = body.agentName || '';
    }

    if (!description.trim()) {
      return NextResponse.json({ error: 'Please describe the issue.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getMockDraft({ description, category, tenantUrgency, address, tenantName, agentName }));
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0,
      },
    });

    const contextLines = [
      `DESCRIPTION: ${description}`,
      `TENANT-PICKED CATEGORY: ${category}`,
      `TENANT-PICKED URGENCY: ${tenantUrgency}`,
      address ? `PROPERTY: ${address}` : '',
      tenantName ? `TENANT NAME: ${tenantName}` : '',
      agentName ? `AGENT NAME: ${agentName}` : '',
      photoParts.length ? `PHOTOS ATTACHED: ${photoParts.length}` : 'PHOTOS ATTACHED: 0',
    ].filter(Boolean).join('\n');

    const parts: GeminiPart[] = [
      { text: SYSTEM_PROMPT },
      { text: contextLines },
      ...photoParts,
      { text: 'Please analyse this maintenance report and return the JSON object described above.' },
    ];

    const result = await model.generateContent(parts);
    const text = result.response.text();
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (jsonMatch[1] || text).trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return NextResponse.json(parsed);
    } catch {
      console.error('[maintenance-issue] AI returned non-JSON:', text);
      return NextResponse.json(getMockDraft({ description, category, tenantUrgency, address, tenantName, agentName }));
    }
  } catch (error) {
    const err = error as Error;
    console.error('[maintenance-issue] fatal:', err?.stack || err);
    return NextResponse.json(
      { error: 'Could not draft the message.' },
      { status: 500 }
    );
  }
}

type MockCtx = {
  description: string; category: string; tenantUrgency: string; address: string; tenantName: string; agentName: string;
};

function getMockDraft(ctx: MockCtx) {
  const emergency = ctx.tenantUrgency === 'emergency';
  const urgent = ctx.tenantUrgency === 'urgent';
  const greeting = ctx.agentName ? `Hi ${ctx.agentName},` : 'Hi there,';
  const closing = ctx.tenantName || '[Your name]';
  const addressLine = ctx.address ? ` at ${ctx.address}` : '';
  const urgencyLine = emergency
    ? "It's affecting daily living, so I'd really appreciate someone attending as soon as possible."
    : urgent
      ? "It's causing some inconvenience, so I'd appreciate a look within the next few days."
      : "There's no rush, but I'd appreciate it being looked at when convenient.";

  const body = [
    greeting,
    '',
    `I wanted to let you know about a maintenance issue${addressLine}:`,
    '',
    ctx.description.trim(),
    '',
    urgencyLine,
    '',
    "I've attached photos to help show what's going on. Please let me know how you'd like to proceed, and if I need to do anything from my end while this is being sorted.",
    '',
    'Thanks for your help.',
    '',
    'Kind regards,',
    closing,
  ].join('\n');

  return {
    category: ctx.category,
    severity: ctx.tenantUrgency,
    severity_reason: emergency
      ? 'Tenant flagged as emergency; AI unavailable, matched to input.'
      : 'Based on tenant input (AI fallback).',
    subject: `Maintenance request${addressLine ? ' — ' + ctx.address : ''}`,
    body,
    tenant_tips: [
      'Keep a dated note of when the issue started.',
      'Take photos before and after any attempts to manage it.',
      "Don't carry out major repairs yourself — report first and wait for guidance.",
    ],
    follow_up_days: emergency ? 2 : urgent ? 5 : 10,
    expected_response_days: emergency ? 1 : urgent ? 3 : 7,
    _warning: 'Live AI unavailable — used a template draft. Please review and edit before sending.',
  };
}

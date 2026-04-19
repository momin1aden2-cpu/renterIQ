import { NextResponse } from 'next/server';
import { requireAuth, aiKillSwitch } from '@/lib/api-auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are a friendly rental maintenance helper for RenterIQ.

A tenant reported a maintenance issue to their agent some days ago and hasn't heard back. They want a polite, short follow-up message. You are NOT a legal advisor. You write warm, factual follow-ups that nudge without nagging.

Tone rules:
- Friendly, respectful, patient. No demands. No threats. No legal language.
- NEVER use phrases like "I require", "I demand", "I'm entitled to", "legally obliged", "Residential Tenancies Act", "tribunal", "VCAT/NCAT/QCAT".
- DO use "just checking in", "wondering if there's an update", "happy to help if I can", "let me know".

Job:
- Write a short follow-up email (3–5 short paragraphs max) referencing the original issue, noting it's been N days, and asking for an update.
- Keep it warm and brief. The goal is to re-surface the request, not to escalate.
- If the original issue was flagged urgent and enough time has passed, the follow-up can politely acknowledge the impact ("it's starting to affect daily use") without making demands.

Respond ONLY with valid JSON in this exact shape:
{
  "subject": "Email subject line under 80 chars",
  "body": "Full email body plain text. Start with 'Hi <agent name>' (or 'Hi there' if no name). End with 'Kind regards,\\n<tenant name>' or '[Your name]'.",
  "tone_used": "gentle | firmer"
}`;

type Payload = {
  originalDescription: string;
  originalCategory?: string;
  originalUrgency?: string;
  daysSinceContact: number;
  priorMessages?: { subject: string; body: string; date: number }[];
  address?: string;
  tenantName?: string;
  agentName?: string;
};

export async function POST(request: Request) {
  const killed = aiKillSwitch();
  if (killed) return killed;
  const auth = await requireAuth(request, { limit: 10 });
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as Payload;
    if (!body.originalDescription) {
      return NextResponse.json({ error: 'Missing original issue description.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getMockFollowUp(body));
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0,
      },
    });

    const priorSummary =
      (body.priorMessages || [])
        .sort((a, b) => (a.date || 0) - (b.date || 0))
        .map((m, i) => `--- Message ${i + 1} (${new Date(m.date).toISOString().slice(0, 10)}) ---\nSubject: ${m.subject || ''}\n${m.body || ''}`)
        .join('\n\n') || '(no prior messages)';

    const contextLines = [
      `ORIGINAL ISSUE: ${body.originalDescription}`,
      body.originalCategory ? `CATEGORY: ${body.originalCategory}` : '',
      body.originalUrgency ? `URGENCY WHEN REPORTED: ${body.originalUrgency}` : '',
      `DAYS SINCE LAST CONTACT: ${body.daysSinceContact}`,
      body.address ? `PROPERTY: ${body.address}` : '',
      body.tenantName ? `TENANT NAME: ${body.tenantName}` : '',
      body.agentName ? `AGENT NAME: ${body.agentName}` : '',
      '',
      'PRIOR MESSAGES SENT:',
      priorSummary,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: contextLines },
      { text: 'Draft the JSON follow-up now.' },
    ]);
    const text = result.response.text();
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (match[1] || text).trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return NextResponse.json(parsed);
    } catch {
      console.error('[maintenance-followup] non-JSON response:', text);
      return NextResponse.json(getMockFollowUp(body));
    }
  } catch (error) {
    const err = error as Error;
    console.error('[maintenance-followup] fatal:', err?.stack || err);
    return NextResponse.json(
      { error: err?.message ? `Draft failed: ${err.message}` : 'Could not draft the follow-up.' },
      { status: 500 }
    );
  }
}

function getMockFollowUp(ctx: Payload) {
  const greeting = ctx.agentName ? `Hi ${ctx.agentName},` : 'Hi there,';
  const closing = ctx.tenantName || '[Your name]';
  const addressLine = ctx.address ? ` at ${ctx.address}` : '';
  const firmer = ctx.daysSinceContact >= 14;
  const body = [
    greeting,
    '',
    `Just checking in on the maintenance request I sent through ${ctx.daysSinceContact} days ago${addressLine}:`,
    '',
    `"${ctx.originalDescription.trim()}"`,
    '',
    firmer
      ? "It's been a little while, so I wanted to see where things are at. Happy to answer any questions or help arrange access if that's what's holding things up."
      : 'I know things get busy, so I just wanted to pop this back on your radar. Let me know if there\'s anything you need from me.',
    '',
    'Thanks for your help.',
    '',
    'Kind regards,',
    closing,
  ].join('\n');
  return {
    subject: `Checking in — maintenance request${addressLine ? ' at ' + ctx.address : ''}`,
    body,
    tone_used: firmer ? 'firmer' : 'gentle',
    _warning: 'Live AI unavailable — used a template draft. Please review before sending.',
  };
}

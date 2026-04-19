import { NextResponse } from 'next/server';
import { requireAuth, aiKillSwitch } from '@/lib/api-auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are a friendly bond-return email drafter for RenterIQ. You help an Australian renter ask for their bond back politely and confidently after they've moved out.

You are NOT a legal advisor and you write nothing that sounds like one. The renter is going to send this email to their agent.

Tone rules:
- Warm, professional, brief. No demands. No threats. No legal jargon.
- NEVER write phrases like "I am entitled to", "as required by the Act", "you are obliged to", "tribunal", "VCAT/NCAT/QCAT", "lodge a claim".
- DO write phrases like "I'd appreciate", "could you please", "happy to discuss", "let me know if anything else is needed".
- The renter has done a thorough move-out walkthrough and may have evidence (maintenance log, comms thread, photos) — reference this confidently but humbly.

Job:
- Draft a short bond-return request email (4–6 short paragraphs).
- Open with thanks, mention the move-out date and that the property has been cleaned and vacated.
- If there are NO chargeable items: ask for full bond return.
- If there ARE chargeable items the renter has already addressed (cleaned, fixed, repaired): list them briefly with a one-line note that they've been resolved.
- If there are chargeable items the renter disputes: list them briefly with a polite reference to the evidence ("I reported the leak on 8 March — see message in our records"). Do NOT say "I won't pay" — just provide context.
- End with thanks + contact info placeholder.

Respond ONLY with valid JSON in this exact shape:
{
  "subject": "Email subject line under 80 chars",
  "body": "Full email body, plain text. Start with 'Hi <agent name>,' (or 'Hi there,' if no name). End with 'Kind regards,\\n<tenant name>' or '[Your name]'.",
  "tone_used": "confident | conciliatory"
}`;

type ChargeableSummary = {
  room?: string;
  itemLabel?: string;
  description?: string;
  evidenceRefs?: string[];
  evidenceNote?: string;
};

type Payload = {
  propertyAddress?: string;
  moveOutDate?: string;            // ISO date
  agentName?: string;
  tenantName?: string;
  bondAtRisk?: string;              // already-formatted estimate from comparison API
  chargeableItems?: ChargeableSummary[];
  reviewItems?: ChargeableSummary[];
  hasFullBondReturnExpectation?: boolean;
};

export async function POST(request: Request) {
  const killed = aiKillSwitch();
  if (killed) return killed;
  const auth = await requireAuth(request, { limit: 10 });
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as Payload;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getMockBondReturn(body));
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0,
      },
    });

    const moveOutDateStr = body.moveOutDate
      ? new Date(body.moveOutDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'recently';

    const ctx: string[] = [
      `PROPERTY: ${body.propertyAddress || '(address)'}`,
      `MOVE-OUT DATE: ${moveOutDateStr}`,
      body.tenantName ? `TENANT NAME: ${body.tenantName}` : '',
      body.agentName ? `AGENT NAME: ${body.agentName}` : '',
      body.bondAtRisk ? `BOND AT RISK ESTIMATE: ${body.bondAtRisk}` : '',
      `EXPECT FULL BOND RETURN: ${body.hasFullBondReturnExpectation ? 'yes' : 'no'}`,
    ].filter(Boolean);

    if (body.chargeableItems && body.chargeableItems.length){
      ctx.push('\nCHARGEABLE ITEMS (renter has handled or may need to defend):');
      body.chargeableItems.forEach((c, i) => {
        ctx.push(`  ${i+1}. ${c.room ? '[' + c.room + '] ' : ''}${c.itemLabel || ''} — ${c.description || ''}` + (c.evidenceRefs && c.evidenceRefs.length ? ` (evidence: ${c.evidenceRefs.join(', ')})` : ''));
      });
    }
    if (body.reviewItems && body.reviewItems.length){
      ctx.push('\nWORTH-CHECKING ITEMS (likely fair wear & tear):');
      body.reviewItems.forEach((c, i) => {
        ctx.push(`  ${i+1}. ${c.room ? '[' + c.room + '] ' : ''}${c.itemLabel || ''} — ${c.description || ''}`);
      });
    }

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: ctx.join('\n') },
      { text: 'Draft the JSON bond-return request now.' },
    ]);
    const text = result.response.text();
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (m[1] || text).trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json(getMockBondReturn(body));
    }
  } catch (error) {
    const err = error as Error;
    console.error('[bond-return-email] fatal:', err?.stack || err);
    return NextResponse.json(
      { error: err?.message ? `Draft failed: ${err.message}` : 'Could not draft bond-return email.' },
      { status: 500 }
    );
  }
}

function getMockBondReturn(ctx: Payload) {
  const greeting = ctx.agentName ? `Hi ${ctx.agentName},` : 'Hi there,';
  const closing = ctx.tenantName || '[Your name]';
  const moveOutDate = ctx.moveOutDate
    ? new Date(ctx.moveOutDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'recently';
  const addressLine = ctx.propertyAddress ? ` at ${ctx.propertyAddress}` : '';

  let body = greeting + '\n\n';
  body += `Thanks for your help over the tenancy${addressLine}.\n\n`;
  body += `As of ${moveOutDate}, I've moved out, returned the keys, and left the property cleaned. I've also done a thorough move-out walkthrough and saved a record on my end.\n\n`;

  if (ctx.chargeableItems && ctx.chargeableItems.length){
    body += `A couple of items I want to mention upfront so we're on the same page:\n`;
    ctx.chargeableItems.slice(0, 5).forEach(c => {
      body += `  • ${c.itemLabel || c.description || 'Item'}${c.room ? ' (' + c.room + ')' : ''}\n`;
    });
    body += '\nI\'ve done what I could to address each, and have records and photos if you need them.\n\n';
  } else {
    body += `From my end everything matches the move-in record, and I\'d appreciate the bond being returned in full.\n\n`;
  }

  body += `Let me know if there\'s anything else you need from me to wrap things up.\n\n`;
  body += `Thanks again,\n${closing}`;

  return {
    subject: `Bond return — ${ctx.propertyAddress || 'tenancy'}${ctx.moveOutDate ? ' (vacated ' + new Date(ctx.moveOutDate).toLocaleDateString('en-AU') + ')' : ''}`,
    body,
    tone_used: ctx.hasFullBondReturnExpectation ? 'confident' : 'conciliatory',
    _warning: 'Live AI unavailable — used a template draft. Please review before sending.'
  };
}

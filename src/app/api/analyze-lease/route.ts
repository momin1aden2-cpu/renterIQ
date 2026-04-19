import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireAuth, aiKillSwitch } from '@/lib/api-auth';

const STATE_CONTEXT: Record<string, { name: string; act: string; authority: string; bondWeeks: number; bondAuthority: string }> = {
  NSW: { name: 'New South Wales', act: 'Residential Tenancies Act 2010 (NSW)', authority: 'NSW Fair Trading', bondWeeks: 4, bondAuthority: 'Rental Bond Board' },
  VIC: { name: 'Victoria', act: 'Residential Tenancies Act 1997 (Vic)', authority: 'Consumer Affairs Victoria', bondWeeks: 4, bondAuthority: 'Residential Tenancies Bond Authority (RTBA)' },
  QLD: { name: 'Queensland', act: 'Residential Tenancies and Rooming Accommodation Act 2008 (Qld)', authority: 'Residential Tenancies Authority (RTA)', bondWeeks: 4, bondAuthority: 'RTA Queensland' },
  WA:  { name: 'Western Australia', act: 'Residential Tenancies Act 1987 (WA)', authority: 'Consumer Protection WA', bondWeeks: 4, bondAuthority: 'Bond Administrator (Consumer Protection WA)' },
  SA:  { name: 'South Australia', act: 'Residential Tenancies Act 1995 (SA)', authority: 'Consumer and Business Services (CBS) SA', bondWeeks: 4, bondAuthority: 'Consumer and Business Services' },
  TAS: { name: 'Tasmania', act: 'Residential Tenancy Act 1997 (Tas)', authority: 'Consumer, Building and Occupational Services (CBOS)', bondWeeks: 4, bondAuthority: 'Rental Deposit Authority' },
  ACT: { name: 'Australian Capital Territory', act: 'Residential Tenancies Act 1997 (ACT)', authority: 'ACT Civil and Administrative Tribunal (ACAT)', bondWeeks: 4, bondAuthority: 'Office of Rental Bonds (ACT)' },
  NT:  { name: 'Northern Territory', act: 'Residential Tenancies Act 1999 (NT)', authority: 'NT Consumer Affairs', bondWeeks: 4, bondAuthority: 'NT Consumer Affairs' }
};

function buildStatePrefix(stateCode: string | null): string {
  const code = (stateCode || '').toUpperCase();
  const ctx = code && STATE_CONTEXT[code];
  if (!ctx) {
    return 'This lease is for an Australian residential tenancy. If the lease does not explicitly name the state or territory, infer it from the property address (postcode ranges: 2xxx NSW/ACT, 3xxx VIC, 4xxx QLD, 5xxx SA, 6xxx WA, 7xxx TAS, 0800-0899 NT). If the state is still indeterminable, analyse cautiously and note the uncertainty in key_concerns.';
  }
  return [
    'IMPORTANT — jurisdiction:',
    `This lease is governed by the law of ${ctx.name} (${code}). You MUST compare every clause to ${ctx.name} residential tenancy practice and to the ${ctx.act}.`,
    `The tenancy authority is ${ctx.authority}. The bond authority is ${ctx.bondAuthority}.`,
    `Do NOT reference Victorian, NSW or other state acts unless you are specifically comparing. When you cite a law_reference it must be the ${ctx.act}.`,
    `When extracting bond_authority_state, set it to "${code}" unless the property address clearly places the tenancy in another state.`,
    ''
  ].join('\n');
}

const SYSTEM_PROMPT = `You are an Australian tenancy lease analyst for RenterIQ.
You receive a residential lease/tenancy agreement from an Australian renter. Be thorough and accurate — this record becomes the tenant's evidence trail.

Your job:

1. Extract every substantive clause. Do not skip routine ones. Include at minimum: rent, bond, term, entry/inspection, maintenance & repairs, pets, alterations/fixtures, break lease / early termination, utilities, insurance, cleaning at end of tenancy, smoke alarms, subletting. If the lease contains any of these, a clause MUST appear. If truly absent, mark as absent in key_concerns.
2. For each clause, determine "standard", "unusual", or "warning" (potentially unfair or overly one-sided against the renter)
3. Provide a plain-English explanation of what each clause means
4. Flag any clauses that deviate from the typical Australian residential tenancy norms for the relevant state
5. Give an overall risk rating: "low", "medium", or "high"
6. Extract every tenancy key term listed in the summary schema. Check the standard form fields at the front of the lease first (Landlord/Lessor, Tenant, Premises, Term, Rent, Bond, Bond Authority, Day Rent is Payable, Bank Details, Agent). Then scan the body for break-lease clauses, notice periods, and bond authority references. Extract what you can find — leave only truly indeterminable fields as null.

Respond ONLY with valid JSON in this exact format:
{
  "clauses": [
    {
      "number": 1,
      "title": "Short title of the clause",
      "original": "Original clause text. Keep to 400 characters max — quote the key operative sentence, not the whole paragraph. If longer, end with … so we know it was trimmed.",
      "explanation": "Plain-English explanation of what this means for you as a renter",
      "rating": "standard" | "unusual" | "warning",
      "flag": "Optional — why this clause is unusual or concerning (null if standard)",
      "law_reference": "Relevant section of the Residential Tenancies Act if applicable"
    }
  ],
  "summary": {
    "total_clauses": number,
    "standard_count": number,
    "unusual_count": number,
    "warning_count": number,
    "overall_risk": "low" | "medium" | "high",
    "key_concerns": ["Short bullet point of each major concern"],
    "rent_amount": "Extracted rent amount as a dollar string (e.g. '$650') or null",
    "rent_frequency": "'weekly' | 'fortnightly' | 'monthly' — how often rent is paid, or null",
    "rent_due_day": "Day rent is due. Integer 0-6 for weekly/fortnightly (0=Sunday, 1=Monday … 6=Saturday), OR integer 1-28 for monthly. Null if unclear",
    "rent_payment_method": "'direct debit' | 'BPAY' | 'bank transfer' | 'agency portal' | 'other', or null",
    "rent_first_payment_date": "ISO date (YYYY-MM-DD) of first rent payment if stated, else null",
    "bond_amount": "Extracted bond amount as a dollar string (e.g. '$2,600') or null",
    "bond_authority_state": "One of 'NSW','VIC','QLD','WA','SA','TAS','ACT','NT'. Infer from the property address or jurisdiction if not explicitly stated. Null only if truly indeterminable",
    "bond_authority_name": "Plain-English name of the bond authority mentioned in the lease if any (e.g. 'RTBA', 'Rental Bond Board', 'RTA Queensland'), else null",
    "bond_reference": "Bond lodgement reference number if stated in the lease, else null",
    "bond_lodge_date": "ISO date (YYYY-MM-DD) of bond lodgement if stated, else null",
    "lease_start": "ISO date (YYYY-MM-DD) or null",
    "lease_end": "ISO date (YYYY-MM-DD) or null",
    "lease_type": "'fixed term' | 'periodic' | 'rolling', or null",
    "notice_period": "Notice period in days if stated, or null",
    "break_clause": "Brief plain-English summary of the break-lease terms, or null",
    "property_address": "Extracted address if found, or null",
    "landlord_name": "Landlord's name if found, or null",
    "agency_name": "Managing agency if found, or null",
    "agent_name": "Property manager / agent full name if found, or null",
    "agent_email": "Property manager email if found, or null",
    "agent_phone": "Property manager phone if found, or null"
  }
}

Rules:
- Compare clauses to the tenancy practice of the specific state/territory named in the jurisdiction context above. If no state is supplied, infer from the property address. Never assume Victoria as a default.
- Phrase every flag as a flag, never as advice. Use soft language: "looks unusual", "worth asking the agent about", "check with [state] Consumer Affairs before signing" — never "this is illegal", "you cannot be required to", "you are entitled to", or similar absolute legal claims
- Be practical and fair — most standard lease terms are fine
- Always provide the plain-English explanation even for standard clauses
- This is a plain-English understanding helper, NEVER legal advice. Do not cite specific Act section numbers inline in explanations. law_reference may name the Act in passing but MUST match the jurisdiction stated at the top of this prompt — never assume or substitute a different state's Act. Never quote specific section numbers that sound prescriptive.

Deterministic flagging — apply these rules consistently so the same lease always produces the same output. Rate a clause:

"warning" ONLY when one or more of these is true:
  • Break fee exceeds 6 weeks rent or scales open-endedly with the remaining term
  • Tenant is required to pay for normal wear and tear, professional cleaning, or steam cleaning of carpets with no conditional trigger
  • Rent increases are allowed more than once per 12 months, or with under 60 days notice
  • Landlord entry is allowed without notice, or with under 24 hours notice
  • The lease purports to waive a statutory tenant right (repairs, quiet enjoyment, bond lodgement)
  • A blanket ban on pets or modifications is stated as absolute with no review process
  • Bond exceeds 4 weeks rent in states where that is the statutory cap
  • Tenant is required to pay the landlord's insurance, rates, or body corporate fees

"unusual" when the clause is non-standard but not clearly against the tenant's interest:
  • Garden / lawn maintenance requirements that are more detailed than typical
  • Specific painting / colour restrictions
  • Unusual utility or service arrangements
  • Approval required for normal-use things (e.g. hanging a picture) — but with a review process
  • Requirements that look odd in wording but match normal tenancy practice

"standard" for all other clauses. The default rating is "standard" unless a rule above applies.

If a clause doesn't match any warning or unusual rule, it must be "standard". Do not invent concerns.
- Aim for 15-25 clauses for a typical residential lease. Do not cap at 12. If the lease is genuinely short, return fewer; if it is long and dense, return more.
- For bond_authority_state, map the property's state to the code: NSW, VIC, QLD, WA, SA, TAS, ACT, NT. If the lease names an authority (e.g. "RTBA", "Rental Bond Board", "RTA") still set the corresponding state code
- Dates must be ISO format (YYYY-MM-DD). Convert Australian date formats (dd/mm/yyyy) when reading
- Be precise, not cautious. For the key-term fields below, extract whenever the value is stated anywhere in the document. Only return null when the field is truly not mentioned.

Extraction heuristics — where to look:

• rent_amount: usually listed in the standard-form "Rent" field at the front. Often stated as "$X per week", "$X per fortnight" or "$X per calendar month". Convert to weekly where sensible (fortnightly → divide by 2, monthly → multiply by 12 and divide by 52). Return as a dollar string like "$650".
• rent_frequency: read directly — "per week" → "weekly", "per fortnight" → "fortnightly", "per calendar month" / "per month" → "monthly".
• rent_due_day: the lease will state "payable on the Nth of each month" or "every [Weekday]". Return integer 1-28 for monthly, 0-6 for weekly/fortnightly (0=Sunday … 6=Saturday).
• rent_payment_method: look for "by direct debit", "via [Agency] portal", "BPAY", "electronic funds transfer". Return one of: 'direct debit' | 'BPAY' | 'bank transfer' | 'agency portal' | 'other'.
• rent_first_payment_date: the first rent date — may be stated separately from the lease start date. ISO format.
• bond_amount: the "Bond" or "Security Deposit" field. Usually equals 4 weeks rent. Return as dollar string.
• bond_authority_state: infer from the Premises address if not named. Postcode ranges: 1000-2999 NSW/ACT (ACT uses 2600-2618, 2900-2920), 3000-3999 VIC, 4000-4999 QLD, 5000-5999 SA, 6000-6999 WA, 7000-7999 TAS, 0800-0899 NT.
• bond_authority_name: look for named authorities — RTBA, Rental Bond Board, RTA Queensland, Consumer Protection (WA), CBS (SA), Rental Deposit Authority (TAS), NT Consumer Affairs, Office of Rental Bonds (ACT).
• bond_reference / bond_lodge_date: often NOT in the lease itself — usually issued after lodgement. Return null if not present.
• notice_period: the break-lease notice period in days (e.g. "28 days notice" → 28).
• break_clause: a one-sentence plain-English summary of what breaking the lease costs.
• agent_name / agent_email / agent_phone: the property manager's details at the top of the lease or in the contact section.

Stay consistent with the schema keys above — do not invent new keys.`;

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]);

const MAX_FILE_BYTES = 18 * 1024 * 1024; // Gemini inlineData hard cap is ~20MB; leave headroom

export async function POST(request: Request) {
  const killed = aiKillSwitch();
  if (killed) return killed;
  const auth = await requireAuth(request, { limit: 10 });
  if (!auth.ok) return auth.response;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getMockLeaseAnalysis());
    }

    const contentType = request.headers.get('content-type') || '';
    let leaseText = '';
    let file: File | null = null;
    let stateCode = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      file = (formData.get('file') as File) || null;
      leaseText = (formData.get('text') as string) || '';
      stateCode = (formData.get('state') as string) || '';
    } else {
      const body = await request.json();
      leaseText = body.text || '';
      stateCode = body.state || '';
    }

    // No file AND no text → demo mode
    if (!file && !leaseText) {
      return NextResponse.json(getMockLeaseAnalysis());
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0,
        topP: 0.8,
        // A dense lease produces 15-25 clauses each with title, original, explanation
        // and metadata. 8k tokens was truncating mid-response. 32k gives headroom.
        maxOutputTokens: 32768,
        responseMimeType: 'application/json',
      },
    });

    const statePrefix = buildStatePrefix(stateCode);
    const code = (stateCode || '').toUpperCase();
    const ctx = code && STATE_CONTEXT[code];
    const stateReminder = ctx
      ? `\n\nFINAL REMINDER: every law_reference in your response MUST be "${ctx.act}". The bond_authority_state MUST be "${code}". Do not output any reference to any other state's Act in this analysis.`
      : '\n\nFINAL REMINDER: infer the state from the property address (postcode or suburb), then use the Residential Tenancies Act for THAT state in every law_reference. Never use Victoria as a fallback.';
    const parts: GeminiPart[] = [{ text: statePrefix + '\n\n' + SYSTEM_PROMPT + stateReminder }];

    if (file) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: 'File too large', details: `Maximum ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB` },
          { status: 413 }
        );
      }
      const mimeType = file.type || 'application/octet-stream';
      if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
        return NextResponse.json(
          { error: 'Unsupported file type', details: `Got ${mimeType}. Supported: PDF, JPG, PNG, HEIC, WEBP` },
          { status: 415 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString('base64');
      parts.push({ text: 'Analyse the attached residential lease agreement and return the structured JSON described above.' });
      parts.push({ inlineData: { mimeType, data: base64 } });
    } else {
      parts.push({ text: `Here is the lease/tenancy agreement text:\n\n${leaseText}` });
    }

    const result = await model.generateContent(parts);
    const text = result.response.text();
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (jsonMatch[1] || text).trim();

    try {
      const analysis = JSON.parse(jsonStr);
      return NextResponse.json(analysis);
    } catch {
      // If the response was truncated mid-clause, try to salvage it by finding
      // the last complete clause and closing the JSON manually.
      const recovered = tryRecoverTruncatedJson(jsonStr);
      if (recovered) {
        return NextResponse.json(recovered);
      }
      console.error('Failed to parse lease analysis JSON:', text.slice(0, 500));
      return NextResponse.json(
        { error: 'The analyser returned an incomplete response. Please try again.' },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('Lease analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyse lease' },
      { status: 500 }
    );
  }
}

// Attempt to recover a truncated JSON response by finding the last complete
// clause object and closing the structure. Returns null if no salvageable
// data is found.
function tryRecoverTruncatedJson(raw: string): unknown {
  try {
    const start = raw.indexOf('{');
    if (start === -1) return null;
    const body = raw.slice(start);
    // Find the position just after the last complete clause object inside the
    // clauses array. A complete clause ends with "}," or "}]".
    const clausesMatch = body.match(/"clauses"\s*:\s*\[/);
    if (!clausesMatch) return null;
    const clausesStart = (clausesMatch.index || 0) + clausesMatch[0].length;

    let depth = 0;
    let inString = false;
    let escape = false;
    let lastGoodEnd = -1;

    for (let i = clausesStart; i < body.length; i++) {
      const ch = body[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) lastGoodEnd = i; // end of a complete clause object
      }
      else if (ch === ']' && depth === 0) break; // closed array — already valid
    }

    if (lastGoodEnd === -1) return null;
    // Build a minimal valid JSON: array of complete clauses, no summary.
    const clausesSegment = body.slice(clausesStart, lastGoodEnd + 1);
    const patched = '{"clauses":[' + clausesSegment + ']}';
    return JSON.parse(patched);
  } catch {
    return null;
  }
}

function getMockLeaseAnalysis() {
  return {
    clauses: [
      {
        number: 1,
        title: 'Rent Amount & Payment',
        original: 'The tenant agrees to pay $520 per week, due every Monday by direct debit.',
        explanation: 'You pay $520/week rent via automatic bank transfer each Monday. This is a standard payment arrangement.',
        rating: 'standard',
        flag: null,
        law_reference: 'Residential Tenancies Act 1997 (VIC) s.39'
      },
      {
        number: 2,
        title: 'Bond / Security Deposit',
        original: 'A bond of $2,260 is required, to be lodged with the RTBA.',
        explanation: 'Your bond is $2,260 (about 4.3 weeks rent). In VIC, bond cannot exceed one month\'s rent. This is lodged with the Residential Tenancies Bond Authority for protection.',
        rating: 'standard',
        flag: null,
        law_reference: 'Residential Tenancies Act 1997 (VIC) s.31'
      },
      {
        number: 3,
        title: 'Lease Duration',
        original: 'Fixed term of 12 months commencing 1 July 2025 and ending 30 June 2026.',
        explanation: 'You\'re locked in for 12 months. After this, it automatically becomes month-to-month unless you sign a new lease.',
        rating: 'standard',
        flag: null,
        law_reference: 'Residential Tenancies Act 1997 (VIC) s.91'
      },
      {
        number: 4,
        title: 'Rent Increase',
        original: 'Rent may be increased once every 12 months with 60 days written notice.',
        explanation: 'The landlord can raise rent once a year with 60 days notice. This is the legal minimum notice period in VIC.',
        rating: 'standard',
        flag: null,
        law_reference: 'Residential Tenancies Act 1997 (VIC) s.44'
      },
      {
        number: 5,
        title: 'Maintenance & Repairs',
        original: 'The landlord shall maintain the premises in good repair. The tenant must report damage promptly.',
        explanation: 'The landlord must fix things that break from normal use. You need to tell them about any damage quickly so it doesn\'t get worse.',
        rating: 'standard',
        flag: null,
        law_reference: 'Residential Tenancies Act 1997 (VIC) s.68'
      },
      {
        number: 6,
        title: 'Professional Carpet Cleaning',
        original: 'The tenant must arrange professional carpet cleaning at their expense upon vacating.',
        explanation: 'You must pay for professional carpet cleaning when you move out. This is common but technically the landlord cannot require it if carpets are returned in reasonable condition accounting for fair wear and tear.',
        rating: 'unusual',
        flag: 'Mandatory professional cleaning clauses may be unenforceable if the carpet only shows normal wear. You can challenge this at VCAT.',
        law_reference: 'Residential Tenancies Act 1997 (VIC) s.61 — fair wear and tear'
      },
      {
        number: 7,
        title: 'Pets',
        original: 'No pets are permitted without prior written consent of the landlord, which shall not be unreasonably withheld.',
        explanation: 'You need written permission to have pets, but the landlord can\'t say no without a good reason. In VIC, rental law now supports pet ownership.',
        rating: 'standard',
        flag: null,
        law_reference: 'Residential Tenancies Amendment Act 2018 (VIC) s.71A'
      },
      {
        number: 8,
        title: 'Entry & Inspections',
        original: 'The landlord or agent may inspect the property no more than once every 6 months with at least 7 days notice.',
        explanation: 'Inspections can happen every 6 months max, with a week\'s notice. This is stricter than the law requires (law says once every 6 months with 24hrs notice), which is actually in your favour.',
        rating: 'standard',
        flag: null,
        law_reference: 'Residential Tenancies Act 1997 (VIC) s.86'
      },
      {
        number: 9,
        title: 'Subletting',
        original: 'The tenant must not sublet or assign the lease without written consent.',
        explanation: 'You can\'t rent out a room or transfer the lease without permission. The landlord must respond within 28 days.',
        rating: 'standard',
        flag: null,
        law_reference: 'Residential Tenancies Act 1997 (VIC) s.81'
      },
      {
        number: 10,
        title: 'Break Lease Fee',
        original: 'If the tenant terminates the lease early, a break fee equivalent to 6 weeks rent plus re-letting costs applies.',
        explanation: 'Breaking the lease costs you 6 weeks rent plus advertising/re-letting fees. In VIC, break fees are now regulated and should not exceed specified amounts based on how much of the lease is left.',
        rating: 'warning',
        flag: '6 weeks break fee may exceed the regulated maximum. VIC law caps break fees at 4 weeks if more than half the lease remains. Negotiate this down.',
        law_reference: 'Residential Tenancies Act 1997 (VIC) s.91ZB'
      },
      {
        number: 11,
        title: 'Modifications & Fixtures',
        original: 'The tenant must not make any alterations, additions or modifications without prior written consent.',
        explanation: 'You can\'t make changes (painting, shelves, etc.) without permission. In VIC, landlords must consider reasonable requests for minor modifications.',
        rating: 'standard',
        flag: null,
        law_reference: 'Residential Tenancies Act 1997 (VIC) s.64'
      },
      {
        number: 12,
        title: 'Garden Maintenance',
        original: 'The tenant is responsible for all garden and lawn maintenance including watering, mowing, weeding, and replacing any dead plants.',
        explanation: 'You must maintain the garden, mow the lawn, and replace dead plants. Replacing plants goes beyond normal maintenance — you\'re only required to maintain, not replace at your cost.',
        rating: 'unusual',
        flag: 'Requiring replacement of dead plants at tenant expense is unusual. Normal wear applies to gardens too. You\'re responsible for maintenance, not replacement.',
        law_reference: 'Residential Tenancies Act 1997 (VIC) s.61'
      }
    ],
    summary: {
      total_clauses: 12,
      standard_count: 8,
      unusual_count: 2,
      warning_count: 2,
      overall_risk: 'medium',
      key_concerns: [
        'Break lease fee of 6 weeks may exceed VIC regulated maximum',
        'Professional carpet cleaning requirement may be unenforceable',
        'Garden maintenance clause includes plant replacement at tenant cost'
      ],
      rent_amount: '$520',
      rent_frequency: 'weekly',
      rent_due_day: 1,
      rent_payment_method: 'direct debit',
      rent_first_payment_date: null,
      bond_amount: '$2,260',
      bond_authority_state: 'VIC',
      bond_authority_name: 'RTBA',
      bond_reference: null,
      bond_lodge_date: null,
      lease_start: '2025-07-01',
      lease_end: '2026-06-30',
      lease_type: 'fixed term',
      notice_period: null,
      break_clause: 'Early exit may require up to 6 weeks rent as a break fee',
      property_address: '12 Smith Street, Richmond VIC 3121',
      landlord_name: null,
      agency_name: 'Ray White Richmond',
      agent_name: 'Sarah Chen',
      agent_email: null,
      agent_phone: '03 9427 1000'
    }
  };
}

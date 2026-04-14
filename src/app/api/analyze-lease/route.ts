import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireAuth } from '@/lib/api-auth';

const SYSTEM_PROMPT = `You are an Australian tenancy lease analyst for RenterIQ.
You receive lease/tenancy agreement text from a renter. Your job is to:

1. Break the lease into individual clauses
2. For each clause, determine if it is "standard", "unusual", or "warning" (potentially unfair or illegal)
3. Provide a plain-English explanation of what each clause means
4. Flag any clauses that deviate from the standard Residential Tenancy Agreement for the relevant Australian state
5. Give an overall risk rating: "low", "medium", or "high"

Respond ONLY with valid JSON in this exact format:
{
  "clauses": [
    {
      "number": 1,
      "title": "Short title of the clause",
      "original": "Original clause text (abbreviated if very long)",
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
- Compare clauses to common Australian tenancy practice (default to VIC if state not specified)
- Flag clauses that look unusual, one-sided, or worth double-checking with the state tenancy authority — but phrase it as a flag, never as advice. Use soft language: "looks unusual", "worth asking the agent about", "check with [state] Consumer Affairs before signing" — never "this is illegal", "you cannot be required to", "you are entitled to", or similar absolute legal claims
- Flag excessive break fees, unreasonable inspection access, or non-standard cleaning requirements as "worth a closer look" rather than legally invalid
- Flag clauses about tenant paying for normal wear and tear as unusual — suggest the renter asks the agent about it
- Be practical and fair — most standard lease terms are fine
- Always provide the plain-English explanation even for standard clauses
- This is a plain-English understanding helper, NEVER legal advice. Do not cite specific Act section numbers inline in explanations. law_reference may name the Act in passing ("Residential Tenancies Act 1997 (Vic)") but never quote specific section numbers that sound prescriptive
- Limit to the 12 most important clauses if the lease is very long
- For bond_authority_state, map the property's state to the code: NSW, VIC, QLD, WA, SA, TAS, ACT, NT. If the lease names an authority (e.g. "RTBA"), still set the state code
- Dates must be ISO format (YYYY-MM-DD) so the app can use them directly
- Be conservative — if a field is not clearly stated, return null rather than guess. The app will fall back to asking the user`;

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
  const auth = await requireAuth(request, { limit: 10, allowAnonymous: true });
  if (!auth.ok) return auth.response;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getMockLeaseAnalysis());
    }

    const contentType = request.headers.get('content-type') || '';
    let leaseText = '';
    let file: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      file = (formData.get('file') as File) || null;
      leaseText = (formData.get('text') as string) || '';
    } else {
      const body = await request.json();
      leaseText = body.text || '';
    }

    // No file AND no text → demo mode
    if (!file && !leaseText) {
      return NextResponse.json(getMockLeaseAnalysis());
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const parts: GeminiPart[] = [{ text: SYSTEM_PROMPT }];

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
      console.error('Failed to parse lease analysis JSON:', text);
      return NextResponse.json(
        { error: 'Failed to parse AI analysis', raw: text },
        { status: 500 }
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
      rent_amount: '$520/week',
      bond_amount: '$2,260',
      lease_start: '1 July 2025',
      lease_end: '30 June 2026',
      property_address: null
    }
  };
}

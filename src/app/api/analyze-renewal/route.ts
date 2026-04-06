import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are an Australian tenancy lease renewal analyst for RenterIQ.
You receive TWO lease texts from a renter — their previous lease and their new/renewed lease.
Your job is to compare them and highlight what changed.

1. Identify every clause that changed between the old and new lease
2. For each change, explain the impact on the tenant in plain English
3. Flag any changes that are unfavourable to the tenant
4. Note any new clauses added or old clauses removed
5. Check if rent increase is within legal limits

Respond ONLY with valid JSON in this exact format:
{
  "changes": [
    {
      "number": 1,
      "title": "Short title of the changed clause",
      "old_text": "What the old lease said (abbreviated)",
      "new_text": "What the new lease says (abbreviated)",
      "impact": "positive" | "neutral" | "negative",
      "explanation": "Plain-English explanation of what this change means for you",
      "action_needed": "What you should do about this (or null if no action needed)"
    }
  ],
  "new_clauses": [
    {
      "title": "Title of newly added clause",
      "text": "The clause text (abbreviated)",
      "rating": "standard" | "unusual" | "warning",
      "explanation": "What this new clause means for you"
    }
  ],
  "removed_clauses": [
    {
      "title": "Title of removed clause",
      "explanation": "What the removal of this clause means for you"
    }
  ],
  "summary": {
    "total_changes": number,
    "positive_count": number,
    "neutral_count": number,
    "negative_count": number,
    "new_clauses_count": number,
    "removed_clauses_count": number,
    "rent_change": "e.g. '$480/wk → $520/wk (+8.3%)' or 'No change'",
    "rent_increase_legal": true | false,
    "bond_change": "e.g. 'No change' or '$1,920 → $2,080'",
    "lease_duration_change": "e.g. '12 months → 12 months (no change)' or '12 months → 6 months'",
    "overall_assessment": "A 1-2 sentence overall assessment of the renewal"
  }
}

Rules:
- Compare clause by clause, focusing on material changes
- In VIC, rent can only be increased once every 12 months with 60 days notice
- Flag any rent increase above 10% as potentially excessive
- Flag any new restrictions that weren't in the original lease
- Be practical — minor wording changes are neutral
- If only one lease is provided, analyse it as if comparing to a standard VIC lease`;

export async function POST(request: Request) {
  let oldLeaseText = '';
  let newLeaseText = '';
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      oldLeaseText = (formData.get('oldText') as string) || '';
      newLeaseText = (formData.get('newText') as string) || (formData.get('text') as string) || '';
    } else {
      const body = await request.json();
      oldLeaseText = body.oldText || '';
      newLeaseText = body.newText || body.text || '';
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!newLeaseText || !apiKey) {
      return NextResponse.json(getMockRenewalAnalysis());
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

    let prompt = SYSTEM_PROMPT + '\n\n';
    if (oldLeaseText) {
      prompt += `PREVIOUS LEASE:\n${oldLeaseText}\n\nNEW/RENEWED LEASE:\n${newLeaseText}`;
    } else {
      prompt += `NEW LEASE (compare to standard VIC residential tenancy agreement):\n${newLeaseText}`;
    }

    const result = await model.generateContent([{ text: prompt }]);
    const response = result.response;
    const text = response.text();

    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (jsonMatch[1] || text).trim();

    try {
      const analysis = JSON.parse(jsonStr);
      return NextResponse.json(analysis);
    } catch {
      console.error('Failed to parse renewal analysis JSON:', text);
      return NextResponse.json(
        { error: 'Failed to parse AI analysis', raw: text },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Renewal analysis error:', error);
    return NextResponse.json(getMockRenewalAnalysis());
  }
}

function getMockRenewalAnalysis() {
  return {
    changes: [
      {
        number: 1,
        title: 'Rent Increase',
        old_text: 'Rent: $480 per week',
        new_text: 'Rent: $520 per week',
        impact: 'negative',
        explanation: 'Your rent has increased by $40/week ($2,080/year). This is an 8.3% increase, which is above CPI but within legal limits.',
        action_needed: 'Check that you received at least 60 days written notice. You can challenge excessive increases at VCAT.'
      },
      {
        number: 2,
        title: 'Lease Duration',
        old_text: 'Fixed term: 12 months',
        new_text: 'Fixed term: 12 months',
        impact: 'neutral',
        explanation: 'Lease duration stays the same at 12 months. No change here.',
        action_needed: null
      },
      {
        number: 3,
        title: 'Pet Policy Updated',
        old_text: 'No pets permitted.',
        new_text: 'Pets permitted with prior written consent, not to be unreasonably withheld.',
        impact: 'positive',
        explanation: 'The new lease now aligns with VIC law — you can request to keep a pet and the landlord must have a valid reason to refuse.',
        action_needed: null
      },
      {
        number: 4,
        title: 'Garden Maintenance Expanded',
        old_text: 'Tenant to maintain lawn and garden.',
        new_text: 'Tenant to maintain lawn, garden, and replace any dead plants or shrubs.',
        impact: 'negative',
        explanation: 'A new requirement to replace dead plants has been added. This goes beyond normal maintenance obligations.',
        action_needed: 'Consider negotiating this — you\'re responsible for maintenance, not replacement at your expense.'
      }
    ],
    new_clauses: [
      {
        title: 'Professional End-of-Lease Cleaning',
        text: 'Tenant must arrange professional end-of-lease cleaning at their expense.',
        rating: 'unusual',
        explanation: 'This is a new clause not in your previous lease. While common, it may be unenforceable if you return the property in the same condition minus fair wear and tear.'
      }
    ],
    removed_clauses: [],
    summary: {
      total_changes: 4,
      positive_count: 1,
      neutral_count: 1,
      negative_count: 2,
      new_clauses_count: 1,
      removed_clauses_count: 0,
      rent_change: '$480/wk → $520/wk (+8.3%)',
      rent_increase_legal: true,
      bond_change: 'No change',
      lease_duration_change: '12 months → 12 months (no change)',
      overall_assessment: 'The renewal includes a moderate rent increase and some new maintenance obligations. The pet policy improvement is positive. Review the garden and cleaning clauses before signing.'
    }
  };
}

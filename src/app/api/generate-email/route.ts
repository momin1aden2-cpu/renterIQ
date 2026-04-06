import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are a professional email assistant for Australian renters using RenterIQ.
Your job is to draft professional, polite, and effective emails to property managers, landlords, or agents based on the documents and context provided.

Guidelines:
- Tone: Professional, respectful, but firm when asserting tenant rights
- Structure: Clear subject line, greeting, body with key points, specific requests, and professional closing
- Include relevant document references (inspection reports, lease clauses, receipts, etc.)
- Reference Australian tenancy law where applicable (Residential Tenancies Act by state)
- Keep emails concise but complete — 3-5 short paragraphs maximum
- Always include a specific call-to-action (what response/action is needed)

Respond ONLY with valid JSON in this exact format:
{
  "subject": "Professional subject line (max 10 words)",
  "body": "Full email body with greeting, paragraphs, and sign-off. Use \\n\\n for paragraph breaks.",
  "tone": "polite|firm|urgent",
  "keyPoints": ["Bullet list of key points covered in the email"],
  "attachmentsMentioned": ["List of documents referenced in the email"]
}

Rules:
- Default to Victorian (VIC) tenancy law if state not specified
- Mention specific dates, amounts, and document names when provided
- Suggest reasonable deadlines for responses (7-14 days typical)
- Never include legal threats — instead reference rights and obligations clearly`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { items, recipient, purpose, context, state = 'VIC' } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'No items selected for email generation' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getMockEmail(items, recipient, purpose, state));
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

    const itemSummary = items.map((item: any, i: number) => 
      `${i + 1}. ${item.type || 'Document'}: ${item.name || item.title || 'Untitled'} (${item.date || 'No date'})`
    ).join('\n');

    const userPrompt = `Draft a professional email for an Australian renter.

STATE: ${state}
RECIPIENT TYPE: ${recipient || 'Property Manager'}
PURPOSE: ${purpose || 'General inquiry regarding tenancy matters'}
${context ? `ADDITIONAL CONTEXT: ${context}\n` : ''}

DOCUMENTS/ITEMS TO REFERENCE:
${itemSummary}

Generate a professional email that references these documents appropriately.`;

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: userPrompt }
    ]);

    const response = result.response;
    const text = response.text();

    // Try to parse JSON from response
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (jsonMatch[1] || text).trim();

    try {
      const emailDraft = JSON.parse(jsonStr);
      return NextResponse.json(emailDraft);
    } catch {
      // If JSON parsing fails, wrap the raw text
      return NextResponse.json({
        subject: purpose || 'Tenancy Matter',
        body: text,
        tone: 'polite',
        keyPoints: ['Email draft generated'],
        attachmentsMentioned: items.map((i: any) => i.name || i.title || 'Document')
      });
    }
  } catch (error) {
    console.error('Email generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate email', details: String(error) },
      { status: 500 }
    );
  }
}

function getMockEmail(items: any[], recipient?: string, purpose?: string, state: string = 'VIC') {
  const itemNames = items.map(i => i.name || i.title || 'Document').join(', ');
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  
  const purposes: Record<string, any> = {
    'maintenance': {
      subject: 'Urgent: Maintenance Request for Property',
      body: `Dear ${recipient || 'Property Manager'},

I am writing to formally request repairs and maintenance at my rental property, as documented in the attached inspection reports and photos dated ${today}.

The issues requiring attention include those detailed in my saved condition reports (${itemNames}). Under the Residential Tenancies Act ${state === 'VIC' ? '1997 (VIC) Section 68' : 'relevant section'}, urgent repairs must be addressed immediately and non-urgent repairs within 14 days of written notice.

Please arrange for the necessary repairs to be carried out as soon as possible. I am available to provide access on weekdays between 9am-5pm with 48 hours notice.

I look forward to your confirmation within 7 days.

Kind regards,
[Your Name]
[Your Phone Number]`,
      tone: 'firm',
      keyPoints: ['Maintenance request submitted', 'Legal obligations referenced', 'Access availability provided', '7-day response requested'],
      attachmentsMentioned: itemNames.split(', ')
    },
    'bond': {
      subject: 'Bond Refund Request - Exit Inspection Complete',
      body: `Dear ${recipient || 'Property Manager'},

I am writing regarding the refund of my rental bond following the completion of my tenancy and exit inspection on ${today}.

As documented in my attached exit condition report and photos (${itemNames}), the property has been returned in the same condition as at entry, accounting for fair wear and tear.

Under the Residential Tenancies Act, my bond should be refunded promptly. I have completed all obligations including:
- Final cleaning and property handover
- All keys returned
- No outstanding rent or charges

Please process my full bond refund within 10 business days. I have attached all supporting documentation for your review.

Kind regards,
[Your Name]
[Your Phone Number]`,
      tone: 'polite',
      keyPoints: ['Bond refund requested', 'Exit condition documented', 'Tenancy obligations completed', '10-day refund deadline referenced'],
      attachmentsMentioned: itemNames.split(', ')
    },
    'lease': {
      subject: 'Request for Lease Renewal Discussion',
      body: `Dear ${recipient || 'Property Manager'},

I am writing to discuss the renewal of my lease, which is due to expire soon. I have reviewed my current lease agreement (${itemNames}) and would like to confirm the terms for another fixed-term period.

I have been a reliable tenant with:
- Rent paid on time throughout the tenancy
- Property well-maintained
- All lease terms complied with

Could you please confirm:
1. The proposed rent for the renewal period
2. The duration of the new lease term
3. Any changes to lease conditions

I would appreciate a response within 7 days so I can make appropriate arrangements.

Kind regards,
[Your Name]
[Your Phone Number]`,
      tone: 'polite',
      keyPoints: ['Lease renewal interest expressed', 'Good tenancy record highlighted', 'Specific questions asked', '7-day response requested'],
      attachmentsMentioned: itemNames.split(', ')
    }
  };

  // Default/generic email
  const defaultEmail = {
    subject: purpose || 'Tenancy Documentation & Records',
    body: `Dear ${recipient || 'Property Manager'},

I am writing regarding my tenancy records and documentation, as referenced in the attached files: ${itemNames}.

These documents form part of my comprehensive tenancy record maintained in accordance with the Residential Tenancies Act. I am requesting your review and acknowledgment of the matters contained herein.

Please find all relevant documentation attached. Should you require any additional information or clarification, I am happy to provide it.

I would appreciate a response within 14 days.

Kind regards,
[Your Name]
[Your Phone Number]`,
    tone: 'polite',
    keyPoints: ['Tenancy documentation referenced', 'Legal compliance noted', '14-day response requested'],
    attachmentsMentioned: itemNames.split(', ')
  };

  return purposes[purpose || ''] || defaultEmail;
}

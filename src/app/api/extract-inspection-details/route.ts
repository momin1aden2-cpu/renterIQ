import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are an Australian rental property detail extractor for RenterIQ.
You receive a screenshot that could be ANY of:
- A property listing page (realestate.com.au, Domain.com.au, REIWA, Rent.com.au)
- An inspection booking confirmation
- An agency email, SMS, or flyer
- A property search result
- A property details page

Your job is to extract ALL visible property and inspection details from the image.

Respond ONLY with valid JSON in this exact format:
{
  "address": "Full property address (e.g. 12 Smith St, Fitzroy VIC 3065)",
  "date": "Inspection/open home date in YYYY-MM-DD format if visible",
  "time": "Inspection time in HH:MM (24hr) format if visible",
  "time_display": "Human readable time (e.g. 10:30 AM) if visible",
  "agent_name": "Agent or agency name if visible",
  "agent_phone": "Agent phone number if visible",
  "agent_email": "Agent email if visible",
  "property_type": "house | apartment | unit | townhouse | studio | other",
  "bedrooms": "Number of bedrooms if visible (as a string, e.g. '3')",
  "bathrooms": "Number of bathrooms if visible",
  "rent_weekly": "Weekly rent if visible (e.g. '$520')",
  "parking": "Number of parking spaces if visible",
  "source": "realestate.com.au | domain.com.au | reiwa.com.au | rent.com.au | agency | other",
  "notes": "Any other relevant details (e.g. pet friendly, open home, furnished, bond amount, available date)",
  "confidence": "high | medium | low"
}

Rules:
- Extract as much as possible — leave fields as null if not found
- This could be a listing page, not just a booking confirmation — extract property details even without a booked inspection
- For dates, interpret Australian date formats (DD/MM/YYYY)
- If you see a date range (e.g. "Sat 12 Apr, 10:00 - 10:30"), use the start time
- If the image is unclear, set confidence to "low" and extract what you can
- For address, include suburb, state, and postcode if visible
- If rent is shown as per month, convert to weekly (divide by 4.33 and round)
- If the screenshot shows multiple properties, extract the one most prominently displayed
- Always try to extract at least the address
- Look for property features like bedrooms/bathrooms/parking icons (bed, bath, car symbols)`;

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let imageData: { data: string; mimeType: string } | null = null;
    let textHint = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      textHint = (formData.get('hint') as string) || '';

      if (file) {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        imageData = {
          data: base64,
          mimeType: file.type || 'image/jpeg',
        };
      }
    } else {
      const body = await request.json();
      if (body.image) {
        // Handle base64 image from data URL
        const matches = body.image.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          imageData = {
            data: matches[2],
            mimeType: matches[1],
          };
        }
      }
      textHint = body.hint || '';
    }

    if (!imageData) {
      return NextResponse.json(
        { error: 'No image provided. Please upload a screenshot of your booking confirmation.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Return mock data when no API key is configured
      return NextResponse.json(getMockExtraction());
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

    parts.push({ text: SYSTEM_PROMPT });
    parts.push({
      inlineData: {
        data: imageData.data,
        mimeType: imageData.mimeType,
      },
    });

    if (textHint) {
      parts.push({
        text: `Additional context from user: ${textHint}`,
      });
    }

    parts.push({
      text: 'Please extract all inspection booking details from this screenshot.',
    });

    const result = await model.generateContent(parts);
    const response = result.response;
    const text = response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (jsonMatch[1] || text).trim();

    try {
      const extracted = JSON.parse(jsonStr);
      return NextResponse.json(extracted);
    } catch {
      console.error('Failed to parse extraction JSON:', text);
      return NextResponse.json(
        { error: 'Could not parse the screenshot. Please try a clearer image.', raw: text },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Inspection extraction error:', error);
    return NextResponse.json(
      { error: 'Failed to process screenshot', details: String(error) },
      { status: 500 }
    );
  }
}

function getMockExtraction() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 3);
  const dateStr = tomorrow.toISOString().split('T')[0];

  return {
    address: '42 Harbour View Terrace, Southbank VIC 3006',
    date: dateStr,
    time: '10:30',
    time_display: '10:30 AM',
    agent_name: 'Ray White Southbank',
    agent_phone: '03 9000 1234',
    agent_email: 'rentals@rwsouthbank.com.au',
    property_type: 'apartment',
    bedrooms: '2',
    bathrooms: '1',
    rent_weekly: '$580',
    parking: '1',
    source: 'domain.com.au',
    notes: 'Open home inspection. 15 minute time slot.',
    confidence: 'high',
  };
}

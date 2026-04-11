import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { image, resume } = body;

    if (!image) {
      return NextResponse.json({ error: 'No form image provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getMockPrefill(resume || {}));
    }

    const matches = image.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json({ error: 'Invalid image format' }, { status: 400 });
    }

    const r = resume || {};

    const prompt = `You are a rental application form assistant for Australian renters.

The user has uploaded an agent's rental application form. Your job:
1. Read every field/question on the form
2. Match each field to the user's saved profile data provided below
3. Output the pre-filled form as clean text — field name followed by the answer

USER'S SAVED DATA:
Name: ${r.fullName || ''}
Date of Birth: ${r.dob || ''}
Email: ${r.email || ''}
Mobile: ${r.mobile || ''}
Current Address: ${r.currentAddress || ''}
Time at Current Address: ${r.timeAtAddress || ''}
Reason for Moving: ${r.reasonMoving || ''}
Employment Status: ${r.employmentStatus || ''}
Employer: ${r.employer || ''}
Job Title: ${r.jobTitle || ''}
Employment Duration: ${r.empDuration || ''}
Income: ${r.income || ''}
Previous Address: ${r.prevAddress || ''}
Previous Rent: ${r.prevRent || ''}
Previous Agency: ${r.prevAgency || ''}
Previous Agent Contact: ${r.prevContact || ''}
Previous Duration: ${r.prevDuration || ''}
Reason for Leaving: ${r.prevReason || ''}
Has Pets: ${r.hasPets ? 'Yes' : 'No'}
Pet Type: ${r.petType || ''}
Pet Breed: ${r.petBreed || ''}
Pet Age: ${r.petAge || ''}
Pet Registration: ${r.petRego || ''}
Vehicles: ${r.vehicle1 || ''}${r.vehicle1Rego ? ' (Rego: ' + r.vehicle1Rego + ')' : ''}
Number of Occupants: ${r.occupantCount || '1'}
Reference 1: ${r.ref1Name || ''} — ${r.ref1Agency || ''} — ${r.ref1Phone || ''} — ${r.ref1Email || ''}
Reference 2: ${r.ref2Name || ''} — ${r.ref2Company || ''} — ${r.ref2Phone || ''} — ${r.ref2Email || ''}
Reference 3: ${r.ref3Name || ''} — ${r.ref3Company || ''} — ${r.ref3Phone || ''} — ${r.ref3Email || ''}

INSTRUCTIONS:
- For each field on the form, write: "Field Name: Value"
- If you have the data, fill it in from the user's profile above
- If you don't have the data, write: "Field Name: [NOT IN PROFILE — please fill manually]"
- Keep the same order as the form
- Use Australian date format (DD/MM/YYYY) where dates are needed
- For yes/no questions, answer based on the profile data
- Be concise — one line per field
- Do NOT add commentary or explanations, just the pre-filled fields`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          data: matches[2],
          mimeType: matches[1],
        },
      },
      { text: 'Please read every field on this form and pre-fill it with the user data provided above.' },
    ]);

    const text = result.response.text();

    return NextResponse.json({ prefilled: text });
  } catch (error) {
    console.error('Prefill form error:', error);
    return NextResponse.json(
      { error: 'Failed to process form', details: String(error) },
      { status: 500 }
    );
  }
}

function getMockPrefill(r: Record<string, string>) {
  const lines = [
    `Full Name: ${r.fullName || '[NOT IN PROFILE]'}`,
    `Date of Birth: ${r.dob || '[NOT IN PROFILE]'}`,
    `Email Address: ${r.email || '[NOT IN PROFILE]'}`,
    `Mobile Number: ${r.mobile || '[NOT IN PROFILE]'}`,
    `Current Address: ${r.currentAddress || '[NOT IN PROFILE]'}`,
    `Time at Address: ${r.timeAtAddress || '[NOT IN PROFILE]'}`,
    `Reason for Moving: ${r.reasonMoving || '[NOT IN PROFILE]'}`,
    `Employment Status: ${r.employmentStatus || '[NOT IN PROFILE]'}`,
    `Employer Name: ${r.employer || '[NOT IN PROFILE]'}`,
    `Position/Title: ${r.jobTitle || '[NOT IN PROFILE]'}`,
    `Annual Income: ${r.income || '[NOT IN PROFILE]'}`,
    `Previous Rental Address: ${r.prevAddress || '[NOT IN PROFILE]'}`,
    `Previous Rent Amount: ${r.prevRent || '[NOT IN PROFILE]'}`,
    `Previous Agent/Agency: ${r.prevAgency || '[NOT IN PROFILE]'}`,
    `Previous Agent Contact: ${r.prevContact || '[NOT IN PROFILE]'}`,
    `Pets: ${r.hasPets ? 'Yes — ' + (r.petType || '') + ' ' + (r.petBreed || '') : 'No'}`,
    `Number of Occupants: ${r.occupantCount || '1'}`,
    `Reference 1: ${r.ref1Name || '[NOT IN PROFILE]'} — ${r.ref1Phone || ''}`,
    `Reference 2: ${r.ref2Name || '[NOT IN PROFILE]'} — ${r.ref2Phone || ''}`,
  ];
  return { prefilled: lines.join('\n') };
}

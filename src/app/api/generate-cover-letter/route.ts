import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are an expert rental application coach for Australian tenants.
Write a genuine, warm, professional cover letter for a rental application.
The letter should feel human-written — not corporate or generic.
It must be concise (3-4 paragraphs), personal, and compelling.

Guidelines:
- Address it to "Dear Property Manager,"
- First paragraph: who they are, their situation, why they're moving
- Second paragraph: why this specific property appeals to them, what they value in a home
- Third paragraph: what makes them an ideal tenant (employment stability, care for property, lifestyle)
- Short closing with contact invitation and "Kind regards,"
- Do NOT include placeholder brackets like [Your Name] — leave the sign-off as just "Kind regards,"
- Do NOT mention bond, legalities, or reference the RTA
- Tone: warm, genuine, professional — like a real person wrote it
- Length: 180–260 words

Respond ONLY with valid JSON:
{
  "letter": "Full letter text with \\n\\n between paragraphs",
  "subject": "Rental Application — [address or 'Your Property']"
}`;

export async function POST(request: Request) {
  const auth = await requireAuth(request, { limit: 10, allowAnonymous: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      name,
      employer,
      jobTitle,
      income,
      whoYouAre,
      whyThisProperty,
      situation,
      propertyAddress,
      state = 'VIC',
    } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getMockLetter({ name, employer, jobTitle, whoYouAre, whyThisProperty, situation, propertyAddress }));
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const userPrompt = `Write a rental application cover letter for an Australian tenant.

APPLICANT PROFILE:
- Name: ${name || 'not provided'}
- Employment: ${jobTitle ? `${jobTitle} at ${employer}` : employer || 'employed'}
- Income: ${income || 'not provided'}
- State: ${state}

IN THEIR WORDS:
- About themselves: ${whoYouAre || 'A reliable, responsible tenant'}
- Why this property: ${whyThisProperty || 'Looking for a great home in the area'}
- Their situation: ${situation || 'Non-smoker, respectful of property'}

PROPERTY: ${propertyAddress || 'the advertised property'}

Write a genuine, compelling cover letter using the guidelines provided.`;

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: userPrompt },
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (jsonMatch[1] || text).trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({
        letter: text,
        subject: `Rental Application — ${propertyAddress || 'Your Property'}`,
      });
    }
  } catch (error) {
    console.error('Cover letter generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate cover letter' },
      { status: 500 }
    );
  }
}

function getMockLetter({
  name,
  employer,
  jobTitle,
  whoYouAre,
  whyThisProperty,
  situation,
  propertyAddress,
}: {
  name?: string;
  employer?: string;
  jobTitle?: string;
  whoYouAre?: string;
  whyThisProperty?: string;
  situation?: string;
  propertyAddress?: string;
}) {
  const role = jobTitle && employer ? `${jobTitle} at ${employer}` : employer || 'a stable full-time position';
  const who = whoYouAre || 'a reliable and responsible professional';
  const why = whyThisProperty || 'the property feels like the right fit for my lifestyle and needs';
  const sit = situation || 'non-smoker, no pets, and I take great pride in looking after the places I call home';

  return {
    letter: `Dear Property Manager,

I am writing to express my genuine interest in the${propertyAddress ? ` property at ${propertyAddress}` : ' advertised property'}. I am ${who}, currently working as ${role}, and I am looking for a home I can truly settle into for the long term.

${why}. I value a clean, well-maintained home and take my responsibilities as a tenant seriously — always ensuring rent is paid on time and communicating promptly with property managers when anything needs attention.

I am ${sit}. I have a strong rental history and am happy to provide references who can speak to my reliability as a tenant. I am flexible on move-in dates and would welcome the opportunity to discuss the property further.

Thank you sincerely for considering my application. I look forward to hearing from you.

Kind regards,
${name || ''}`,
    subject: `Rental Application — ${propertyAddress || 'Your Property'}`,
  };
}

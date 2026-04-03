'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function analyzeLease(leaseText: string, state: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  const prompt = `Analyze this Australian ${state} residential lease agreement and identify:
1. Any unfair or unusual clauses
2. Rent increase terms and frequency
3. Bond/security deposit requirements
4. Maintenance responsibilities
5. Termination notice periods
6. Any clauses that may conflict with ${state} tenancy laws

Format the response in clear sections with risk ratings (Low/Medium/High) for each clause.

Lease text:
${leaseText}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2000,
      },
    });

    return result.response.text();
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw new Error('Unable to analyze lease at this time');
  }
}

export async function generateInspectionReport(roomData: Record<string, any>, photos: string[]) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  const prompt = `Generate a professional rental property inspection report based on the following room-by-room data:

${JSON.stringify(roomData, null, 2)}

Photos provided: ${photos.length} images

Create a detailed report with:
1. Executive summary
2. Room-by-room condition assessment
3. Any maintenance concerns
4. Overall property condition rating
5. Recommendations for tenant

Format as a professional PDF-ready document.`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 3000,
      },
    });

    return result.response.text();
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw new Error('Unable to generate report at this time');
  }
}

export async function compareBondPhotos(entryPhotos: Record<string, any>, exitPhotos: Record<string, any>) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  const prompt = `Compare these property condition descriptions:

ENTRY CONDITION:
${JSON.stringify(entryPhotos, null, 2)}

EXIT CONDITION:
${JSON.stringify(exitPhotos, null, 2)}

Identify:
1. Any new damage
2. Wear and tear vs tenant damage
3. Fair bond deduction recommendations
4. Evidence for bond dispute
5. Areas where tenant may be liable

Provide a fair assessment based on Australian tenancy standards.`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2000,
      },
    });

    return result.response.text();
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw new Error('Unable to compare photos at this time');
  }
}

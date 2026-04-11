import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFDocument } from 'pdf-lib';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { image, resume } = body;

    if (!image) {
      return NextResponse.json({ error: 'No form image provided' }, { status: 400 });
    }

    const matches = image.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json({ error: 'Invalid image format' }, { status: 400 });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const r = resume || {};

    // If it's a PDF, try to fill form fields directly with pdf-lib
    if (mimeType === 'application/pdf') {
      try {
        const pdfBytes = Buffer.from(base64Data, 'base64');
        const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const form = pdfDoc.getForm();
        const fields = form.getFields();

        if (fields.length > 0) {
          // This PDF has fillable form fields — fill them
          const fieldMap = buildFieldMap(r);

          let filledCount = 0;
          for (const field of fields) {
            const name = field.getName().toLowerCase();
            const value = matchFieldToProfile(name, fieldMap);
            if (value) {
              try {
                const textField = form.getTextField(field.getName());
                textField.setText(value);
                filledCount++;
              } catch {
                // Field might not be a text field (checkbox, dropdown etc.) — skip
              }
            }
          }

          if (filledCount > 0) {
            // Flatten so fields aren't editable (looks cleaner)
            // Don't flatten — leave editable so user can fix/add missing fields
            const filledPdfBytes = await pdfDoc.save();
            const filledBase64 = Buffer.from(filledPdfBytes).toString('base64');

            return NextResponse.json({
              type: 'filled_pdf',
              pdf: 'data:application/pdf;base64,' + filledBase64,
              fieldsFound: fields.length,
              fieldsFilled: filledCount,
              message: filledCount + ' of ' + fields.length + ' fields pre-filled from your profile'
            });
          }
        }
      } catch (pdfError) {
        // pdf-lib couldn't handle it — fall through to Gemini
        console.warn('pdf-lib fill failed, falling back to Gemini:', pdfError);
      }
    }

    // Fallback: use Gemini to read the form and output pre-filled text
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getMockPrefill(r));
    }

    const prompt = buildGeminiPrompt(r);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { data: base64Data, mimeType } },
      { text: 'Please read every field on this form and pre-fill it with the user data provided above.' },
    ]);

    const text = result.response.text();
    return NextResponse.json({ type: 'text', prefilled: text });
  } catch (error) {
    console.error('Prefill form error:', error);
    return NextResponse.json(
      { error: 'Failed to process form', details: String(error) },
      { status: 500 }
    );
  }
}

function buildFieldMap(r: Record<string, string>): Record<string, string> {
  return {
    // Name variations
    'name': r.fullName || '', 'full name': r.fullName || '', 'full_name': r.fullName || '',
    'applicant name': r.fullName || '', 'tenant name': r.fullName || '',
    'first name': (r.fullName || '').split(' ')[0] || '',
    'surname': (r.fullName || '').split(' ').slice(1).join(' ') || '',
    'last name': (r.fullName || '').split(' ').slice(1).join(' ') || '',
    // DOB
    'date of birth': r.dob || '', 'dob': r.dob || '', 'birth date': r.dob || '',
    // Contact
    'email': r.email || '', 'email address': r.email || '',
    'mobile': r.mobile || '', 'phone': r.mobile || '', 'mobile number': r.mobile || '',
    'contact number': r.mobile || '', 'telephone': r.mobile || '',
    // Address
    'current address': r.currentAddress || '', 'address': r.currentAddress || '',
    'residential address': r.currentAddress || '', 'home address': r.currentAddress || '',
    'time at address': r.timeAtAddress || '', 'duration at address': r.timeAtAddress || '',
    'reason for moving': r.reasonMoving || '', 'reason for leaving': r.reasonMoving || '',
    // Employment
    'employer': r.employer || '', 'employer name': r.employer || '', 'company': r.employer || '',
    'occupation': r.jobTitle || '', 'position': r.jobTitle || '', 'job title': r.jobTitle || '',
    'employment duration': r.empDuration || '', 'time employed': r.empDuration || '',
    'income': r.income || '', 'annual income': r.income || '', 'salary': r.income || '',
    'weekly income': r.income || '',
    // Previous rental
    'previous address': r.prevAddress || '', 'previous rental address': r.prevAddress || '',
    'previous rent': r.prevRent || '', 'rent paid': r.prevRent || '',
    'previous agent': r.prevAgency || '', 'previous agency': r.prevAgency || '',
    'landlord name': r.prevAgency || '', 'property manager': r.prevAgency || '',
    'agent contact': r.prevContact || '', 'landlord contact': r.prevContact || '',
    'tenancy duration': r.prevDuration || '', 'length of tenancy': r.prevDuration || '',
    // Pets
    'pets': r.hasPets ? 'Yes' : 'No', 'pet type': r.petType || '', 'pet breed': r.petBreed || '',
    // Vehicles
    'vehicle': r.vehicle1 || '', 'vehicle registration': r.vehicle1Rego || '',
    'car registration': r.vehicle1Rego || '',
    // Occupants
    'number of occupants': r.occupantCount || '1', 'occupants': r.occupantCount || '1',
    // References
    'reference 1': r.ref1Name || '', 'reference 1 name': r.ref1Name || '',
    'reference 1 phone': r.ref1Phone || '', 'reference 1 email': r.ref1Email || '',
    'reference 2': r.ref2Name || '', 'reference 2 name': r.ref2Name || '',
    'reference 2 phone': r.ref2Phone || '', 'reference 2 email': r.ref2Email || '',
  };
}

function matchFieldToProfile(fieldName: string, fieldMap: Record<string, string>): string {
  const normalized = fieldName.toLowerCase().replace(/[_\-\.]/g, ' ').trim();

  // Exact match
  if (fieldMap[normalized]) return fieldMap[normalized];

  // Partial match — find the best matching key
  for (const key of Object.keys(fieldMap)) {
    if (fieldMap[key] && (normalized.includes(key) || key.includes(normalized))) {
      return fieldMap[key];
    }
  }

  return '';
}

function buildGeminiPrompt(r: Record<string, string>): string {
  return `You are a rental application form assistant for Australian renters.

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
- Be concise — one line per field`;
}

function getMockPrefill(r: Record<string, string>) {
  const lines = [
    `Full Name: ${r.fullName || '[NOT IN PROFILE]'}`,
    `Date of Birth: ${r.dob || '[NOT IN PROFILE]'}`,
    `Email Address: ${r.email || '[NOT IN PROFILE]'}`,
    `Mobile Number: ${r.mobile || '[NOT IN PROFILE]'}`,
    `Current Address: ${r.currentAddress || '[NOT IN PROFILE]'}`,
    `Employment Status: ${r.employmentStatus || '[NOT IN PROFILE]'}`,
    `Employer Name: ${r.employer || '[NOT IN PROFILE]'}`,
    `Position/Title: ${r.jobTitle || '[NOT IN PROFILE]'}`,
    `Annual Income: ${r.income || '[NOT IN PROFILE]'}`,
    `Previous Address: ${r.prevAddress || '[NOT IN PROFILE]'}`,
    `Previous Agency: ${r.prevAgency || '[NOT IN PROFILE]'}`,
    `Pets: ${r.hasPets ? 'Yes' : 'No'}`,
    `Reference 1: ${r.ref1Name || '[NOT IN PROFILE]'} — ${r.ref1Phone || ''}`,
    `Reference 2: ${r.ref2Name || '[NOT IN PROFILE]'} — ${r.ref2Phone || ''}`,
  ];
  return { type: 'text', prefilled: lines.join('\n') };
}

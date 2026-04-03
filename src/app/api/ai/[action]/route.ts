import { NextRequest, NextResponse } from 'next/server';
import { analyzeLease, generateInspectionReport, compareBondPhotos } from '@/app/actions/ai';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;
  const body = await request.json();

  try {
    let result: string;

    switch (action) {
      case 'analyze-lease':
        result = await analyzeLease(body.leaseText, body.state);
        return NextResponse.json({ text: result });

      case 'generate-report':
        result = await generateInspectionReport(body.roomData, body.photos);
        return NextResponse.json({ text: result });

      case 'compare-bond':
        result = await compareBondPhotos(body.entryPhotos, body.exitPhotos);
        return NextResponse.json({ text: result });

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('AI API Error:', error);
    return NextResponse.json(
      { error: 'Failed to process AI request' },
      { status: 500 }
    );
  }
}

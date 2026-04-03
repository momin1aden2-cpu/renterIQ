import { NextRequest, NextResponse } from 'next/server';

const DOMAIN_API_BASE = 'https://api.domain.com.au/v1';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const location = searchParams.get('location') || 'Melbourne VIC';
  const minBedrooms = searchParams.get('minBedrooms');
  const maxPrice = searchParams.get('maxPrice');
  const propertyType = searchParams.get('propertyType');

  const clientId = process.env.DOMAIN_CLIENT_ID;
  const clientSecret = process.env.DOMAIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Domain API credentials not configured' },
      { status: 500 }
    );
  }

  try {
    // Get access token
    const tokenResponse = await fetch(`${DOMAIN_API_BASE}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Domain access token');
    }

    const { access_token } = await tokenResponse.json();

    // Build search params
    const params = new URLSearchParams({
      listingType: 'Rent',
      pageSize: '20',
      location: location,
      ...(minBedrooms && { minBedrooms }),
      ...(maxPrice && { maxPrice }),
      ...(propertyType && { propertyType }),
    });

    // Search listings
    const response = await fetch(
      `${DOMAIN_API_BASE}/listings/residential/search?${params}`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    if (!response.ok) {
      throw new Error('Domain API search failed');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Domain API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listings', listings: [] },
      { status: 500 }
    );
  }
}

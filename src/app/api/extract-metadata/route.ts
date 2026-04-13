import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: Request) {
  const auth = await requireAuth(request, { limit: 60, allowAnonymous: true });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { error: 'URL parameter is required' },
      { status: 400 }
    );
  }

  try {
    const urlObj = new URL(url);
    if (urlObj.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only https URLs are supported' }, { status: 400 });
    }

    const allowedDomains = [
      'realestate.com.au',
      'domain.com.au',
      'reiwa.com.au',
      'rent.com.au'
    ];

    const host = urlObj.hostname.toLowerCase();
    const isAllowed = allowedDomains.some(d => host === d || host.endsWith('.' + d));

    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Domain not supported' },
        { status: 400 }
      );
    }

    // Fetch the page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      next: { revalidate: 0 }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // Extract metadata
    const metadata = extractMetadata(html, url);

    return NextResponse.json(metadata);

  } catch (error) {
    console.error('Metadata extraction error:', error);
    
    // Return fallback data
    return NextResponse.json({
      title: extractAddressFromUrl(url),
      address: extractAddressFromUrl(url),
      price: extractPriceFromUrl(url),
      description: '',
      image: '',
      source: detectSource(url)
    });
  }
}

function extractMetadata(html: string, url: string) {
  // Extract Open Graph and meta tags
  const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"|<title>([^<]*)<\/title>/i);
  const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"|<meta[^>]*name="description"[^>]*content="([^"]*)"/i);
  const imageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
  const priceMatch = html.match(/\$[\d,]+(?:\s*(?:per|p\/w|pw|week))?|<meta[^>]*price[^>]*content="([^"]*)"/i);

  const title = titleMatch?.[1] || titleMatch?.[2] || '';
  
  return {
    title: title.trim(),
    address: extractAddress(title, url),
    price: priceMatch?.[0] || extractPriceFromUrl(url),
    description: descMatch?.[1] || descMatch?.[2] || '',
    image: imageMatch?.[1] || '',
    source: detectSource(url)
  };
}

function extractAddress(title: string, url: string): string {
  // Try to extract address from title or URL
  const addressPatterns = [
    /(\d+[^,]+,\s*[^,]+(?:\s+\w+)?)/,  // "123 Street Name, Suburb"
    /([^|]+)(?:\s*\||\s+-)/,            // "Address | Site Name"
    /([^-]+)(?:\s*-\s*\$)/               // "Address - $Price"
  ];
  
  for (const pattern of addressPatterns) {
    const match = title.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return extractAddressFromUrl(url);
}

function extractAddressFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/').filter(p => p.length > 5);
    if (parts.length > 0) {
      return parts[parts.length - 1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    }
    return 'Property Listing';
  } catch {
    return 'Property Listing';
  }
}

function extractPriceFromUrl(url: string): string {
  // Try to extract price from URL parameters or path
  const priceMatch = url.match(/price[_-]?(\d+)/i);
  if (priceMatch) {
    return `$${parseInt(priceMatch[1]).toLocaleString()}`;
  }
  return 'Price on request';
}

function detectSource(url: string): string {
  if (url.includes('realestate.com.au')) return 'realestate';
  if (url.includes('domain.com.au')) return 'domain';
  if (url.includes('reiwa.com.au')) return 'reiwa';
  if (url.includes('rent.com.au')) return 'rent';
  return 'unknown';
}

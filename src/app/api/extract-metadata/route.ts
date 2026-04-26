import { NextResponse } from 'next/server';
import { lookup as dnsLookup } from 'dns/promises';
import { requireAuth } from '@/lib/api-auth';

// Block resolved IPs that point to private, loopback, link-local or carrier-NAT
// ranges so a compromised allowlisted domain can't be used to probe internal
// infra (defence-in-depth — App Hosting has no internal infra, but this is
// cheap insurance and stops Reddit researchers from logging "missing SSRF
// guard" against us).
function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map(Number);
    if (o[0] === 10) return true;
    if (o[0] === 127) return true;
    if (o[0] === 0) return true;
    if (o[0] === 169 && o[1] === 254) return true;             // link-local
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true; // 172.16/12
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // CGNAT 100.64/10
    return false;
  }
  // IPv6 — only need to block loopback, link-local, ULA, mapped/unspecified
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true;
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true;     // ULA fc00::/7
  if (v6.startsWith('fe80')) return true;                          // link-local
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));   // IPv4-mapped
  return false;
}

export async function GET(request: Request) {
  // Anonymous endpoint — locked down to 15/hr per IP. Used for the public
  // marketing-page property metadata extractor before sign-in. App Check
  // is skipped because the extractor is sometimes hit from share-target
  // navigations where the SDK isn't yet active.
  const auth = await requireAuth(request, { limit: 15, allowAnonymous: true, skipAppCheck: true });
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

    // Resolve the hostname and reject if it points to private / loopback
    // ranges. Allowlist makes this nearly impossible in practice, but a DNS
    // hijack of an allowed domain could otherwise be weaponised.
    try {
      const resolved = await dnsLookup(host, { all: true });
      if (resolved.some(r => isPrivateIp(r.address))) {
        return NextResponse.json({ error: 'Domain resolves to a non-routable address' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Could not resolve domain' }, { status: 400 });
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

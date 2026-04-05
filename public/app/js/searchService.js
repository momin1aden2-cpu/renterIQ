/**
 * Smart Search Service - RenterIQ
 * Generates search URLs and manages tracked properties
 */

const SearchService = {
  PROVIDERS: [
    { key: 'realestate', name: 'realestate.com.au', color: '#0066CC', logo: '🏠', description: 'Australia\'s #1 property site' },
    { key: 'domain', name: 'Domain.com.au', color: '#2E3192', logo: '🔷', description: 'Smart property search' },
    { key: 'reiwa', name: 'REIWA', color: '#E60028', logo: '🏘️', description: 'WA local specialists' },
    { key: 'rent', name: 'Rent.com.au', color: '#FF6B35', logo: '🔑', description: 'Simple rental search' }
  ],

  STORAGE_KEY: 'renteriq_tracked_properties',

  generateSearchUrls(suburb, postcode) {
    const formattedSuburb = suburb.toLowerCase().trim().replace(/\s+/g, '-');
    const cleanPostcode = postcode.trim();
    
    return {
      realestate: `https://www.realestate.com.au/rent/in-${formattedSuburb},+wa+${cleanPostcode}/list-1`,
      domain: `https://www.domain.com.au/rent/${formattedSuburb}-wa-${cleanPostcode}/`,
      reiwa: `https://reiwa.com.au/rental-properties/${formattedSuburb}/`,
      rent: `https://www.rent.com.au/rentals/${formattedSuburb}-wa-${cleanPostcode}`
    };
  },

  detectSource(url) {
    if (url.includes('realestate.com.au')) return 'realestate';
    if (url.includes('domain.com.au')) return 'domain';
    if (url.includes('reiwa.com.au')) return 'reiwa';
    if (url.includes('rent.com.au')) return 'rent';
    return 'realestate';
  },

  getSourceName(source) {
    const names = { realestate: 'realestate.com.au', domain: 'Domain.com.au', reiwa: 'REIWA', rent: 'Rent.com.au' };
    return names[source] || 'Unknown';
  },

  saveProperty(property) {
    const existing = this.getTrackedProperties();
    existing.push(property);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing));
  },

  getTrackedProperties() {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (!stored) return [];
    try {
      return JSON.parse(stored).map(p => ({ ...p, savedAt: new Date(p.savedAt) }));
    } catch { return []; }
  },

  deleteProperty(id) {
    const existing = this.getTrackedProperties();
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing.filter(p => p.id !== id)));
  },

  updatePropertyStatus(id, status) {
    const existing = this.getTrackedProperties();
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(
      existing.map(p => p.id === id ? { ...p, status } : p)
    ));
  },

  isPropertyPage(url) {
    return [/\/property\//, /\/rent\//, /\/listing\//, /-\d{4,}/].some(p => p.test(url));
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  async extractPropertyMetadata(url) {
    try {
      const response = await fetch(`/api/extract-metadata?url=${encodeURIComponent(url)}`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      
      return {
        address: data.address || data.title || 'Unknown Address',
        price: data.price || 'Price not available',
        description: data.description || '',
        imageUrl: data.image || '',
        source: this.detectSource(url),
        url: url
      };
    } catch (error) {
      return {
        address: this.extractAddressFromUrl(url),
        price: 'Price not available',
        description: '',
        imageUrl: '',
        source: this.detectSource(url),
        url: url
      };
    }
  },

  extractAddressFromUrl(url) {
    try {
      const parts = new URL(url).pathname.split('/');
      for (const part of parts) {
        if (part && part.length > 5 && /[a-z]/i.test(part)) {
          return part.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
      }
      return 'Property Listing';
    } catch { return 'Property Listing'; }
  }
};

// Make available globally
window.SearchService = SearchService;

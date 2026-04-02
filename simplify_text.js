const fs = require('fs');

let text = fs.readFileSync('public/index.html', 'utf8');

// 1. Remove hero-btns under the search
const heroBtnsRegex = /<div class="hero-btns">\s*<a href="#how-it-works" class="btn-outline">See How It Works<\/a>\s*<a href="\/dashboard" class="btn-teal install-btn">.*?Get the App<\/a>\s*<\/div>/g;
text = text.replace(heroBtnsRegex, '');

// 2. Simplify the "Core Features" text
text = text.replace(
    /<p>A verbal 'the place was fine when I moved in' won't hold up when someone disagrees.*?<\/p>/s,
    '<p>A professionally formatted, AI-generated PDF report with timestamped photo evidence. Produced in seconds — at any inspection, at any stage of your tenancy.</p>'
);

text = text.replace(
    /<p>Tenancy agreements are written by lawyers, for landlords.*?<\/p>/s,
    '<p>Tenancy agreements are written by lawyers, for landlords. RenterIQ\'s AI translates every clause into simple English before you sign.</p>'
);

text = text.replace(
    /<p>Bond disputes almost always come down to one thing.*?<\/p>/s,
    '<p>Bond disputes come down to documentation. At exit, our AI compares your photos against your move-in record and flags any differences for you to securely handle.</p>'
);

// Simplify the "How It Works" text blocks slightly
text = text.replace(
    /<p>Live listings from Australia's major platforms, all in one place\. Filter by suburb, price, bedrooms, and inspection times without bouncing between tabs\.<\/p>/s,
    '<p>Live listings from Australia\'s major platforms, all in one place. No more bouncing between tabs.</p>'
);

text = text.replace(
    /<p>See inspection times, book directly with the agency, and RenterIQ saves the property to your profile automatically\. No more tracking everything in your notes app\.<\/p>/s,
    '<p>Book directly with the agency. RenterIQ saves the property to your profile automatically.</p>'
);

text = text.replace(
    /<p>At the property, RenterIQ walks you through every room\. Photograph anything that matters, add notes on the spot, and leave with a complete record every single time\.<\/p>/s,
    '<p>We walk you through every room. Photograph anything that matters, add notes, and leave with a complete record.</p>'
);

text = text.replace(
    /<p>Tap complete and RenterIQ's AI compiles your photos and notes into a professional, timestamped PDF — the kind of documentation that holds up in a dispute\.<\/p>/s,
    '<p>Tap complete and AI compiles your photos into a professional, timestamped PDF.</p>'
);

text = text.replace(
    /<p>Ready to apply\? RenterIQ guides you through the process, helps you organise supporting documents, and lets you sign digitally from your phone — nothing missed, nothing delayed\.<\/p>/s,
    '<p>RenterIQ guides you through the process, helps you organise documents, and lets you sign digitally.</p>'
);

text = text.replace(
    /<p>Upload your tenancy agreement and RenterIQ's AI reads every clause, explains them in plain English, and flags anything unusual before you sign your name to it\.<\/p>/s,
    '<p>Upload your tenancy agreement and AI reads every clause, explaining them in plain English before you sign.</p>'
);

text = text.replace(
    /<p>Before a single box goes through the door, document the entire property room by room with timestamped photos\. Compare directly against the agency's report\. This is your insurance policy\.<\/p>/s,
    '<p>Document the property room by room with timestamped photos. This is your insurance policy.</p>'
);

text = text.replace(
    /<p>Complete a full exit inspection and RenterIQ compares it against your move-in record in the background\. Where the AI spots a potential difference, it asks you — you confirm, dismiss, or add context\. Your report, your call\.<\/p>/s,
    '<p>Complete an exit inspection. AI compares it against your move-in record and spots any differences.</p>'
);

// 3. Fix PWA install buttons and text
const pwaButtonsRegex = /<div class="pwa-btns">\s*<button class="btn-white install-btn">.*?<\/button>\s*<a href="\/dashboard" class="btn-ghost">.*?<\/a>\s*<\/div>/g;
const newPwaButtons = `<div class="pwa-btns" style="display:flex; justify-content:center; gap:16px; margin: 24px 0;">
      <button class="install-btn" style="background: linear-gradient(135deg, var(--blue), var(--teal)); color: #fff; padding: 16px 32px; border-radius: 100px; font-family: 'Sora', sans-serif; font-weight: 700; border: none; font-size:15px; cursor: pointer; box-shadow: var(--shadow-neon);">📲 Download the App</button>
      <a href="/dashboard" style="background: rgba(255,255,255,0.05); color: var(--text); padding: 16px 32px; border-radius: 100px; font-family: 'Sora', sans-serif; font-weight: 700; border: 1px solid var(--border); font-size:15px; text-decoration: none; display:flex; align-items:center;">Open in Web</a>
    </div>`;

text = text.replace(pwaButtonsRegex, newPwaButtons);

fs.writeFileSync('public/index.html', text, 'utf8');

console.log('Modifications complete');

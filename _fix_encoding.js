const fs = require('fs');
const path = require('path');

const files = [
  'admin.js','profile.html','supabase-schema.sql','vote.css','choose.css','choose.html',
  'cinema.html','home.css','profile.css','profile.js','forgot-password.html','home.html',
  'index.html','register.html','supabase-admin-schema.sql','supabase-admin-vote.sql',
  'vote.html','wallet.html','admin.html','auth.js'
];

for (const f of files) {
  const p = path.join(__dirname, f);
  // Read raw bytes
  let buf = fs.readFileSync(p);
  // Strip UTF-8 BOM if present
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    buf = buf.slice(3);
  }
  // Decode as UTF-8 (gives mojibake string)
  const mojibake = buf.toString('utf8');
  // Re-encode mojibake chars as Latin-1 bytes (their codepoints == original UTF-8 byte values)
  const latin1Buf = Buffer.from(mojibake, 'latin1');
  // Decode those bytes as UTF-8 (the real original text)
  const fixed = latin1Buf.toString('utf8');
  // Write back as UTF-8 without BOM
  fs.writeFileSync(p, fixed, { encoding: 'utf8' });
  console.log('fixed:', f);
}

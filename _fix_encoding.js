const fs = require('fs');
const path = require('path');

// Sửa lỗi double-encoded UTF-8 (mojibake) — ví dụ "ÄÄƒng nháº­p" -> "Đăng nhập".
// Nguyên nhân: bytes UTF-8 gốc bị giải mã nhầm bằng Windows-1252 rồi lưu lại thành UTF-8.
// Cách sửa: mojibake string -> bytes (đảo ngược Windows-1252) -> decode UTF-8.
// AN TOÀN: tự nhận diện, chỉ sửa file đang mojibake; bỏ qua file đã đúng. Idempotent.
// Dùng:  node _fix_encoding.js          -> ghi đè file
//        node _fix_encoding.js --dry    -> chỉ xem trước, không ghi

const DRY = process.argv.includes('--dry');
const EXTS = new Set(['.html', '.js', '.css', '.sql']);
const SKIP_FILES = new Set(['_fix_encoding.js']);

// Windows-1252: codepoint hiển thị -> byte gốc (khoảng 0x80–0x9F).
const CP1252 = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F,
};

// Ký tự CHỈ có trong tiếng Việt đúng (đều > U+00FF) — mojibake không bao giờ chứa.
const REAL_VN = /[ĂăĐđƠơƯưẠ-ỿ]/;
const MOJIBAKE = /Ã.|Ä.|Æ.|á».|áº.|â€|Â./;

// Đảo ngược Windows-1252: chuỗi mojibake -> Buffer bytes gốc. null nếu có ký tự không hợp lệ.
function toBytes(s) {
  const out = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp in CP1252) out.push(CP1252[cp]);
    else if (cp <= 0xFF) out.push(cp);
    else return null; // ký tự > U+00FF không thuộc cp1252 -> không phải mojibake thuần
  }
  return Buffer.from(out);
}

const dir = __dirname;
let fixed = 0, skipped = 0;

for (const f of fs.readdirSync(dir)) {
  if (SKIP_FILES.has(f)) continue;
  if (!EXTS.has(path.extname(f).toLowerCase())) continue;
  const p = path.join(dir, f);
  if (!fs.statSync(p).isFile()) continue;

  let buf = fs.readFileSync(p);
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) buf = buf.slice(3);
  const s = buf.toString('utf8');

  if (REAL_VN.test(s)) { skipped++; continue; }   // đã đúng
  if (!MOJIBAKE.test(s)) { skipped++; continue; } // không có text VN

  const bytes = toBytes(s);
  if (!bytes) { console.log('GIỮ NGUYÊN (ký tự lạ):', f); skipped++; continue; }
  const recovered = bytes.toString('utf8');

  // An toàn cuối: kết quả phải là tiếng Việt thật và không có ký tự thay thế.
  if (!REAL_VN.test(recovered) || recovered.includes('�')) {
    console.log('GIỮ NGUYÊN (không chắc chắn):', f);
    skipped++;
    continue;
  }
  if (!DRY) fs.writeFileSync(p, recovered, { encoding: 'utf8' });
  console.log((DRY ? 'SẼ sửa: ' : 'đã sửa: ') + f);
  fixed++;
}

console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Xong. ${DRY ? 'Sẽ sửa' : 'Sửa'} ${fixed} file, bỏ qua ${skipped} file.`);

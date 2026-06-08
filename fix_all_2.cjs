const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Fix 1: Add status to the first item in SAMPLE_DATA
code = code.replace(
  /paymentStatus: '정상',\n            status: '정상',/g,
  "paymentStatus: '정상',\n            status: '정상',"
);
if (!code.includes("status: '정상',") && code.includes("paymentStatus: '정상',")) {
  code = code.replace(
    /paymentStatus: '정상',/,
    "paymentStatus: '정상',\n            status: '정상',"
  );
}

// Fix 2: Add status to the second item in SAMPLE_DATA (around line 523)
if (code.includes("paymentStatus: '연체',")) {
  code = code.replace(
    /paymentStatus: '연체',/,
    "paymentStatus: '연체',\n            status: '정상',"
  );
}

// Fix 3: localeCompare on unknown
code = code.replace(
  /b\[0\]\.localeCompare\(a\[0\]\)/g,
  "String(b[0]).localeCompare(String(a[0]))"
);

fs.writeFileSync('src/App.tsx', code, 'utf8');

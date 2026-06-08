const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n');

// Fix 1: Add '개인/프리랜서' to settlementType
code = code.replace(
  /settlementType: '사업자' \| '개인';/,
  "settlementType: '사업자' | '개인' | '개인/프리랜서';"
);

// Fix 2: Add hcPaidCount to ERPDataItem
code = code.replace(
  /raw: any\[\];\n\}/,
  "raw: any[];\n  hcPaidCount?: number;\n}"
);

// Fix 3: Add status to mock data around line 522
code = code.replace(
  /paymentStatus: '정상',/,
  "paymentStatus: '정상',\n            status: '정상',"
);

// Fix 4: Inject kwonFixedPay definition
const jaeyunGapTarget = `    let jaeyunGap = 0;
    if (isSettlementDate) {
      if (!hqSummary['조재윤']) hqSummary['조재윤'] = { count: 0, amount: 0 };
      const jaeyunTotal = hqSummary['조재윤'].amount;
      if (jaeyunTotal < 2000000) {
        jaeyunGap = 2000000 - jaeyunTotal;
        hqSummary['조재윤'].amount = 2000000;
        totalAmount += jaeyunGap;
        totalPendingAmount += jaeyunGap;
      }
    }`;

const kwonFixedPayReplacement = `${jaeyunGapTarget}

    const kwonFixedPay = isSettlementDate ? 150000 : 0;
    if (kwonFixedPay > 0) {
      if (!hqSummary['권성훈']) hqSummary['권성훈'] = { count: 0, amount: 0 };
      hqSummary['권성훈'].amount += kwonFixedPay;
      totalAmount += kwonFixedPay;
      totalPendingAmount += kwonFixedPay;
    }`;

if (!code.includes('const kwonFixedPay = isSettlementDate ? 150000 : 0;')) {
  code = code.replace(jaeyunGapTarget, kwonFixedPayReplacement);
}

// Fix 5: localeCompare on unknown
code = code.replace(
  /b\[0\]\.localeCompare\(a\[0\]\)/g,
  "String(b[0]).localeCompare(String(a[0]))"
);

fs.writeFileSync('src/App.tsx', code, 'utf8');
console.log('Fixed syntax and type errors in App.tsx');

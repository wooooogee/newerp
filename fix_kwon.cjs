const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target = `    let jaeyunGap = 0;
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

const replacement = `    let jaeyunGap = 0;
    if (isSettlementDate) {
      if (!hqSummary['조재윤']) hqSummary['조재윤'] = { count: 0, amount: 0 };
      const jaeyunTotal = hqSummary['조재윤'].amount;
      if (jaeyunTotal < 2000000) {
        jaeyunGap = 2000000 - jaeyunTotal;
        hqSummary['조재윤'].amount = 2000000;
        totalAmount += jaeyunGap;
        totalPendingAmount += jaeyunGap;
      }
    }

    const kwonFixedPay = isSettlementDate ? 150000 : 0;
    if (kwonFixedPay > 0) {
      if (!hqSummary['권성훈']) hqSummary['권성훈'] = { count: 0, amount: 0 };
      hqSummary['권성훈'].amount += kwonFixedPay;
      totalAmount += kwonFixedPay;
      totalPendingAmount += kwonFixedPay;
    }`;

code = code.replace(target, replacement);

fs.writeFileSync('src/App.tsx', code, 'utf8');

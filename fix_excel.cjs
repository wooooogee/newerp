const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Rename function and adjust arguments
content = content.replace(
  /const export25thPayStatusExcel = \(\s*newContractItems: any\[\],\s*eligibleItems: any\[\],\s*overdueItems: any\[\],\s*fixedPayItems: any\[\]\s*\) => \{/g,
  "const exportMaintenanceStatusExcel = (\n    eligibleItems: any[],\n    overdueItems: any[]\n  ) => {"
);

// Remove fixed sheet block
content = content.replace(/\/\/ 3\. 고정지급 시트 작성.*?const fixedWorksheet = XLSX\.utils\.aoa_to_sheet\(\[\n\s*fixedTitle,\n\s*fixedSub,\n\s*\[\],\n\s*fixedHeaders,\n\s*\.\.\.fixedRows\n\s*\]\);/gs, '');

// Remove newContract sheet block
content = content.replace(/\/\/ 4\. 신규계약건 시트 작성.*?const newContractWorksheet = XLSX\.utils\.aoa_to_sheet\(\[\n\s*newContractTitle,\n\s*newContractSub,\n\s*\[\],\n\s*newContractHeaders,\n\s*\.\.\.newContractRows\n\s*\]\);/gs, '');

// Adjust applyStyles calls
content = content.replace(/applyStyles\(fixedWorksheet, 9\);\s*/g, '');
content = content.replace(/applyStyles\(newContractWorksheet, 8\);\s*/g, '');

// Adjust book_append_sheet calls
content = content.replace(/XLSX\.utils\.book_append_sheet\(workbook, fixedWorksheet, "고정지급"\);\s*/g, '');
content = content.replace(/XLSX\.utils\.book_append_sheet\(workbook, newContractWorksheet, "신규계약건"\);\s*/g, '');

// Change output filename
content = content.replace(/executeDownload\(blob, `25일지급현황상세_\$\{cleanPayDate\}_\$\{today\}\.xlsx`\);/g, 'executeDownload(blob, `유지수수료상세_${cleanPayDate}_${today}.xlsx`);');
content = content.replace(/25일 지급현황/g, '유지수수료 현황');

fs.writeFileSync('src/App.tsx', content, 'utf8');

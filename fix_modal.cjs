const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Remove setPay25Tab from the sidebar button
content = content.replace(
  /setPay25Tab\('maintenance'\);\s*setMaintenanceTab\('eligible'\);\s*setIsMaintenanceStatusModalOpen\(true\);/,
  "setMaintenanceTab('eligible'); setIsMaintenanceStatusModalOpen(true);"
);

// 2. Change sidebar button text back
content = content.replace(
  /'25일 지급현황 조회'/,
  "'유지수수료 현황 조회'"
);

// 3. Change Modal Title
content = content.replace(/<h3 className="text-xl font-black text-slate-900">25일 지급현황 상세 조회<\/h3>/g, '<h3 className="text-xl font-black text-slate-900">유지수수료 현황 조회</h3>');

// 4. Remove pay25Tab state
content = content.replace(/const \[pay25Tab, setPay25Tab\] = useState.*?\n/, '');

// 5. Remove the "대분류 탭 네비게이션" block and replace with just the maintenance tab section
content = content.replace(/\{\/\* 대분류 탭 네비게이션 \*\/\}.*?\{\/\* 소분류 탭 네비게이션 \(유지수수료일 때만 노출\) \*\/\}/s, '{/* 유지수수료 탭 네비게이션 */}');

// 6. Clean up maintenanceTab references
content = content.replace(/\{pay25Tab === 'maintenance' && \(/g, '{true && (');
content = content.replace(/pay25Tab === 'maintenance' && /g, '');
content = content.replace(/pay25Tab === 'maintenance' \? /g, '');

// 7. Clean up currentList assignment
content = content.replace(
/const currentList =\s*pay25Tab === 'maintenance'\s*\?\s*\(maintenanceTab === 'eligible' \? eligibleItems : overdueItems\)\s*:\s*pay25Tab === 'fixed'\s*\?\s*fixedPayItems\s*:\s*newContractItems;/g,
`const currentList = maintenanceTab === 'eligible' ? eligibleItems : overdueItems;`
);

// 8. Empty Msg cleanup
content = content.replace(
/let emptyMsg = '';\s*if \(pay25Tab === 'maintenance'\) \{\s*emptyMsg = maintenanceTab === 'eligible'\s*\?\s*'해당 지급일에 해당하는 유지수수료 지급 대상자가 없습니다.'\s*:\s*'해당 지급일에 해당하는 유지수수료 지급 보류\(연체\) 대상자가 없습니다.';\s*\} else if \(pay25Tab === 'fixed'\) \{\s*emptyMsg = '해당 지급일에 해당하는 고정지급 대상자가 없습니다.';\s*\} else \{\s*emptyMsg = '해당 지급일에 해당하는 신규계약 대상자가 없습니다.';\s*\}/g,
`let emptyMsg = maintenanceTab === 'eligible' ? '해당 지급일에 해당하는 유지수수료 지급 대상자가 없습니다.' : '해당 지급일에 해당하는 유지수수료 지급 보류(연체) 대상자가 없습니다.';`
);

// 9. ColSpan cleanup
content = content.replace(
/const colSpanCount = pay25Tab === 'maintenance'\s*\?\s*\(maintenanceTab === 'overdue' \? 10 : 9\)\s*:\s*\(pay25Tab === 'fixed' \? 9 : 8\);/g,
`const colSpanCount = maintenanceTab === 'overdue' ? 10 : 9;`
);

// 10. Clean up export button (remove newContractItems, fixedPayItems from args)
content = content.replace(
/export25thPayStatusExcel\(\s*newContractItems,\s*eligibleItems,\s*overdueItems,\s*fixedPayItems\s*\)/g,
`exportMaintenanceStatusExcel(eligibleItems, overdueItems)`
);

content = content.replace(
/25일 지급현황 상세 다운로드 \(Excel\)/g,
`유지수수료 현황 상세 다운로드 (Excel)`
);

// Remove fixed and newContract specific rendering blocks (cards)
content = content.replace(/\{pay25Tab === 'fixed' && \(.*?\}\)/s, '');
content = content.replace(/\{pay25Tab === 'newContract' && \(.*?\}\)/s, '');

// Remove fixed and newContract text blocks for sums
content = content.replace(/<div>\s*\{pay25Tab === 'fixed'.*?<\/div>/s, '');
content = content.replace(/\{pay25Tab === 'fixed'.*?\}/g, '');
content = content.replace(/\{pay25Tab === 'newContract'.*?\}/g, '');

// Clean up any remaining table headers for fixed/newContract
content = content.replace(/\{pay25Tab === 'fixed' && \(\s*<th.*?>구분<\/th>\s*\)\}/g, '');

// Clean up table cells
content = content.replace(/\{pay25Tab === 'fixed' && \(\s*<td.*?\{fixedType\} 고정.*?<\/td>\s*\)\}/s, '');

// Write to file
fs.writeFileSync('src/App.tsx', content, 'utf8');

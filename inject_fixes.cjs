const fs = require('fs');

let appData = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Add state variable
if (!appData.includes('isMaintenanceStatusModalOpen')) {
  appData = appData.replace(
    /const \[isHealthcareModalOpen, setIsHealthcareModalOpen\] = useState\(false\);/,
    `const [isHealthcareModalOpen, setIsHealthcareModalOpen] = useState(false);\n  const [isMaintenanceStatusModalOpen, setIsMaintenanceStatusModalOpen] = useState(false);\n  const [maintenanceTab, setMaintenanceTab] = useState<'eligible' | 'overdue'>('eligible');`
  );
}

// 2. Add Sidebar Button under Healthcare
const sidebarBtnHtml = `
                    <button
                      onClick={() => {
                        setMaintenanceTab('eligible');
                        setIsMaintenanceStatusModalOpen(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition-all font-medium flex items-center group text-sm"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-emerald-500 mr-2 transition-colors" />
                      유지수수료 현황 조회
                    </button>
`;
if (!appData.includes('유지수수료 현황 조회')) {
  appData = appData.replace(
    /onClick=\{\(\) => setIsHealthcareModalOpen\(true\)\}[\s\S]*?<\/button>/,
    `$&${sidebarBtnHtml}`
  );
}

// 3. Add getHealthcareMaintenanceInfo function above ERP_Dashboard component
const getHcFunc = `
const getHealthcareMaintenanceInfo = (item: ERPDataItem, filterStr: string) => {
  const normProd = item.prodName.replace(/[\\s()]/g, '');
  const isHc = normProd.includes('헬스케어80');
  if (!isHc) return null;

  if (item.status.includes('해약') || item.status.includes('취소')) return null;

  const today = new Date();
  let baseYear = today.getFullYear();
  let baseMonth = today.getMonth() + 1;

  if (filterStr) {
    const clean = filterStr.replace(/[-./\\s]/g, '');
    if (clean.length === 6) {
      baseYear = parseInt('20' + clean.substring(0, 2));
      baseMonth = parseInt(clean.substring(2, 4));
    } else if (clean.length === 8) {
      baseYear = parseInt(clean.substring(0, 4));
      baseMonth = parseInt(clean.substring(4, 6));
    }
  }

  const cDateRaw = item.contractDate.replace(/[.\\s]/g, '-');
  const cDateObj = new Date(cDateRaw);
  if (isNaN(cDateObj.getTime())) return null;
  
  const tDate = new Date(baseYear, baseMonth - 1, 25);
  const compareCDate = new Date(cDateObj.getFullYear(), cDateObj.getMonth(), 25);
  
  const monthsDiff = (tDate.getFullYear() - compareCDate.getFullYear()) * 12 + (tDate.getMonth() - compareCDate.getMonth());

  if (monthsDiff >= 1 && monthsDiff <= 37) {
    const overdue = parseInt(item.memo || '0') || 0;
    const isOverdue = overdue > 0;
    
    let payCount = 1;
    if (!isOverdue) {
      const paidCount = item.hcPaidCount || 0;
      if (paidCount > 0) {
        payCount = Math.max(0, monthsDiff - paidCount);
      } else {
        payCount = 1;
      }
    } else {
      payCount = 0;
    }
    
    if (monthsDiff === 1) {
      if (item.payDate) {
        const itemPayClean = (item.payDate || '').replace(/[-./]/g, '');
        const itemPay6 = itemPayClean.substring(itemPayClean.length - 6);
        const filterClean = \`\${String(baseYear).substring(2)}\${String(baseMonth).padStart(2, '0')}25\`;
        if (itemPay6 === filterClean) {
          return { interval: 1, overdueCount: overdue, isOverdue, payCount };
        }
      } else {
        return { interval: 1, overdueCount: overdue, isOverdue, payCount };
      }
    } else {
      return { interval: monthsDiff, overdueCount: overdue, isOverdue, payCount };
    }
  }
  return null;
};
`;
if (!appData.includes('getHealthcareMaintenanceInfo')) {
  appData = appData.replace(
    /const ERP_Dashboard = \(\) => \{/,
    `${getHcFunc}\nconst ERP_Dashboard = () => {`
  );
}

// 4. Add exportMaintenanceStatusExcel function
const exportFunc = `
  const exportMaintenanceStatusExcel = (eligibleItems: any[], overdueItems: any[]) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const workbook = XLSX.utils.book_new();

      // 1. 유지수수료 지급 대상 시트 작성
      let totalEligibleSum = 0;
      const eligibleRows = eligibleItems.map((x, idx) => {
        totalEligibleSum += x.totalCommission;
        const intervalStr = x.payCount > 1 ? \`\${x.hcInterval}회차(소급 \${x.payCount}개월)\` : \`\${x.hcInterval}회차\`;
        return [
          idx + 1, x.item.hq, x.item.branch, x.item.empName, x.item.memName, x.item.contractDate, x.item.prodName, intervalStr,
          { v: x.totalCommission, t: 'n', z: '#,##0' }
        ];
      });
      eligibleRows.push(['합계', '', '', '', '', '', '', '', { v: totalEligibleSum, t: 'n', z: '#,##0' }]);

      const eligibleWorksheet = XLSX.utils.aoa_to_sheet([
        ['[ 헬스케어80 유지수수료 지급 대상 현황 ]'],
        [\`수수료 지급일: \${payDateFilter || today} | 보고서 생성일: \${today}\`],
        [],
        ['순번', '본부명', '지사명', '사원명', '고객명', '계약일자', '상품명', '회차', '유지수수료'],
        ...eligibleRows
      ]);

      // 2. 유지수수료 지급 보류(연체) 시트 작성
      let totalOverdueSum = 0;
      const overdueRows = overdueItems.map((x, idx) => {
        totalOverdueSum += x.pendingCommission;
        return [
          idx + 1, x.item.hq, x.item.branch, x.item.empName, \`\${x.overdueCount}회\`, x.item.memName, x.item.contractDate, x.item.prodName, \`\${x.hcInterval}회차\`,
          { v: x.pendingCommission, t: 'n', z: '#,##0' }
        ];
      });
      overdueRows.push(['합계', '', '', '', '', '', '', '', '', { v: totalOverdueSum, t: 'n', z: '#,##0' }]);

      const overdueWorksheet = XLSX.utils.aoa_to_sheet([
        ['[ 헬스케어80 유지수수료 지급 보류(연체) 현황 ]'],
        [\`수수료 지급일: \${payDateFilter || today} | 보고서 생성일: \${today}\`],
        [],
        ['순번', '본부명', '지사명', '사원명', '연체횟수', '고객명', '계약일자', '상품명', '회차', '보류 수수료'],
        ...overdueRows
      ]);

      const applyStyles = (worksheet: any, colCount: number) => {
        const headerStyle = { fill: { fgColor: { rgb: "E7E6E6" } }, font: { bold: true, size: 10 }, alignment: { horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
        const bodyStyle = { font: { size: 10 }, alignment: { horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        for (let r = range.s.r; r <= range.e.r; r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cellAddress = XLSX.utils.encode_cell({ r, c });
            if (!worksheet[cellAddress]) continue;
            if (r > 2) worksheet[cellAddress].s = r === 3 ? headerStyle : bodyStyle;
          }
        }
        worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } }];
        worksheet['!cols'] = Array(colCount).fill({ wch: 13 });
      };

      applyStyles(eligibleWorksheet, 9);
      applyStyles(overdueWorksheet, 10);

      XLSX.utils.book_append_sheet(workbook, eligibleWorksheet, "유지수수료 지급대상");
      XLSX.utils.book_append_sheet(workbook, overdueWorksheet, "유지수수료 지급보류");

      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const cleanPayDate = (payDateFilter || today).replace(/[.-]/g, '');
      const executeDownload = (blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      };
      executeDownload(blob, \`유지수수료현황_\${cleanPayDate}_\${today}.xlsx\`);
    } catch (err) {
      console.error(err);
      alert('엑셀 추출 중 오류가 발생했습니다.');
    }
  };
`;
if (!appData.includes('exportMaintenanceStatusExcel')) {
  appData = appData.replace(
    /const exportHealthcareExcel = /,
    `${exportFunc}\n  const exportHealthcareExcel = `
  );
}

// 5. Add Maintenance Modal UI
const modalUI = `
        <AnimatePresence>
          {isMaintenanceStatusModalOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMaintenanceStatusModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-8 flex flex-col h-full overflow-hidden">
                  <div className="flex justify-between items-center mb-6 shrink-0">
                    <div className="flex flex-col">
                      <h3 className="text-xl font-black text-slate-900">유지수수료 현황 조회</h3>
                    </div>
                    <button onClick={() => setIsMaintenanceStatusModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                  </div>
                  {(() => {
                    const targetPayDate = payDateFilter || new Date().toISOString().split('T')[0];
                    const cleanTarget = targetPayDate.replace(/[-./]/g, '');
                    const maintenanceItems = data.map(item => {
                      const hcInfo = getHealthcareMaintenanceInfo(item, targetPayDate);
                      if (!hcInfo) return null;
                      
                      const statsMap = new Map<string, number>();
                      const details = calculateCommissionDetails(item, statsMap);
                      
                      // 3회 연체시 30,000원으로 고정
                      let pendingCommission = details.unitPrice;
                      if (hcInfo.isOverdue && hcInfo.overdueCount >= 3) {
                         pendingCommission = 30000;
                      }
                      
                      return {
                        item,
                        hcInterval: hcInfo.interval,
                        isOverdue: hcInfo.isOverdue,
                        overdueCount: hcInfo.overdueCount,
                        payCount: hcInfo.payCount || 1,
                        totalCommission: details.unitPrice * (hcInfo.payCount || 1),
                        pendingCommission: pendingCommission
                      };
                    }).filter(Boolean);

                    const eligibleItems = maintenanceItems.filter((x: any) => !x.isOverdue);
                    const overdueItems = maintenanceItems.filter((x: any) => x.isOverdue);

                    const totalEligibleSum = eligibleItems.reduce((sum: number, x: any) => sum + x.totalCommission, 0);
                    const totalOverdueSum = overdueItems.reduce((sum: number, x: any) => sum + x.pendingCommission, 0);

                    const currentList = maintenanceTab === 'eligible' ? eligibleItems : overdueItems;

                    return (
                      <>
                        <div className="flex gap-2 mb-6 border-b border-slate-100 pb-3 shrink-0">
                          <button onClick={() => setMaintenanceTab('eligible')} className={\`px-4 py-2 rounded-xl text-[13px] font-extrabold transition-all \${maintenanceTab === 'eligible' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}\`}>
                            지급 대상 ({eligibleItems.length}건)
                          </button>
                          <button onClick={() => setMaintenanceTab('overdue')} className={\`px-4 py-2 rounded-xl text-[13px] font-extrabold transition-all \${maintenanceTab === 'overdue' ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}\`}>
                            지급 보류/연체 ({overdueItems.length}건)
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-6 shrink-0">
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                            <span className="text-[10px] font-bold text-slate-400 block mb-1">총 지급예정액 (대상)</span>
                            <span className="text-base font-black text-emerald-700">{totalEligibleSum.toLocaleString()}원</span>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                            <span className="text-[10px] font-bold text-slate-400 block mb-1">총 지급보류 (연체)</span>
                            <span className="text-base font-black text-rose-700">{totalOverdueSum.toLocaleString()}원</span>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                            <span className="text-[10px] font-bold text-slate-400 block mb-1">전체 합계</span>
                            <span className="text-base font-black text-slate-800">{(totalEligibleSum + totalOverdueSum).toLocaleString()}원</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center mb-4 shrink-0">
                          <button onClick={() => exportMaintenanceStatusExcel(eligibleItems, overdueItems)} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[12px] font-bold shadow-md transition-all">
                            <Download size={14} /> 유지수수료 현황 상세 다운로드 (Excel)
                          </button>
                        </div>
                        <div className="flex-1 overflow-auto border border-slate-100 rounded-2xl">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50/70 border-b border-slate-100 sticky top-0 z-10">
                                <th className="p-3 text-[11px] font-bold text-slate-400">본부명</th>
                                <th className="p-3 text-[11px] font-bold text-slate-400">지사명</th>
                                <th className="p-3 text-[11px] font-bold text-slate-400">사원명</th>
                                {maintenanceTab === 'overdue' && <th className="p-3 text-[11px] font-bold text-rose-500">연체횟수</th>}
                                <th className="p-3 text-[11px] font-bold text-slate-400">고객명</th>
                                <th className="p-3 text-[11px] font-bold text-slate-400">계약일자</th>
                                <th className="p-3 text-[11px] font-bold text-slate-400">상품명</th>
                                <th className="p-3 text-[11px] font-bold text-slate-400">회차</th>
                                <th className="p-3 text-[11px] font-bold text-slate-400 text-right">{maintenanceTab === 'eligible' ? '지급 수수료' : '보류 수수료'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {currentList.map((x: any, i: number) => (
                                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                                  <td className="p-3 text-[13px] font-bold text-slate-800">{x.item.hq}</td>
                                  <td className="p-3 text-[13px] text-slate-600">{x.item.branch}</td>
                                  <td className="p-3 text-[13px] text-slate-700">{x.item.empName}</td>
                                  {maintenanceTab === 'overdue' && <td className="p-3 text-[13px] text-rose-600 font-bold">{x.overdueCount}회</td>}
                                  <td className="p-3 text-[13px] font-bold text-slate-800">{x.item.memName}</td>
                                  <td className="p-3 text-[13px] font-mono text-slate-500">{x.item.contractDate}</td>
                                  <td className="p-3 text-[13px] text-slate-600">{x.item.prodName}</td>
                                  <td className="p-3 text-[13px] text-blue-600 font-bold">{x.hcInterval}회차</td>
                                  <td className="p-3 text-[13px] font-black text-slate-900 text-right">{(maintenanceTab === 'eligible' ? x.totalCommission : x.pendingCommission).toLocaleString()}원</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
`;
if (!appData.includes('isMaintenanceStatusModalOpen &&')) {
  appData = appData.replace(
    /\{\/\* 모달 영역 \*\/\}/,
    `{/* 모달 영역 */}\n${modalUI}`
  );
}

// 6. Kwon Seong-hun Fixed Pay logic in calculateSettlementStats
const kwonFixLogic = `
    const kwonFixedPay = isSettlementDate ? 150000 : 0;
    if (kwonFixedPay > 0) {
      if (!hqSummary['권성훈']) hqSummary['권성훈'] = { count: 0, amount: 0 };
      hqSummary['권성훈'].amount += kwonFixedPay;
      totalAmount += kwonFixedPay;
      totalPendingAmount += kwonFixedPay;
    }
`;
if (!appData.includes("kwonFixedPay")) {
  appData = appData.replace(
    /const minkyungIncentive.*?;\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n/,
    `$&${kwonFixLogic}`
  );
  
  appData = appData.replace(
    /minkyungIncentive,/,
    `minkyungIncentive,\n      kwonFixedPay,`
  );
  
  appData = appData.replace(
    /if \(settlementStats\.minkyungIncentive > 0\) specialAdditions\['조민경'\] = \(specialAdditions\['조민경'\] \|\| 0\) \+ settlementStats\.minkyungIncentive;/,
    `$&\n      if (settlementStats.kwonFixedPay > 0) specialAdditions['권성훈'] = (specialAdditions['권성훈'] || 0) + settlementStats.kwonFixedPay;`
  );
}

fs.writeFileSync('src/App.tsx', appData, 'utf8');

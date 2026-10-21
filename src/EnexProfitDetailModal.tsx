import React, { useState, useMemo } from 'react';
import { X, Download, Search, FileText, Calendar, Building, DollarSign, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// @ts-ignore
const XLSX = (window as any).XLSX;

export interface EnexDetailTarget {
  title: string;
  subtitle?: string;
  targetName: string;
  category: string;
  count: number | string;
  amount: number;
  type: 'INCENTIVE' | 'MAINTENANCE';
  items: any[];
}

interface EnexProfitDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: EnexDetailTarget | null;
  payoutMonthDisplay: string;
}

export const EnexProfitDetailModal: React.FC<EnexProfitDetailModalProps> = ({
  isOpen,
  onClose,
  target,
  payoutMonthDisplay
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredItems = useMemo(() => {
    if (!target?.items) return [];
    if (!searchTerm.trim()) return target.items;

    const term = searchTerm.toLowerCase();
    return target.items.filter((item: any) => {
      if (target.type === 'INCENTIVE') {
        return (
          String(item.rentalNo || '').toLowerCase().includes(term) ||
          String(item.memName || '').toLowerCase().includes(term) ||
          String(item.hq || '').toLowerCase().includes(term) ||
          String(item.branch || '').toLowerCase().includes(term) ||
          String(item.empName || '').toLowerCase().includes(term) ||
          String(item.prodName || '').toLowerCase().includes(term) ||
          String(item.rentalProd || '').toLowerCase().includes(term)
        );
      } else {
        return (
          String(item.customerName || '').toLowerCase().includes(term) ||
          String(item.memNo || item.rentalNo || '').toLowerCase().includes(term) ||
          String(item.hq || '').toLowerCase().includes(term) ||
          String(item.branch || '').toLowerCase().includes(term) ||
          String(item.empName || '').toLowerCase().includes(term) ||
          String(item.productName || '').toLowerCase().includes(term)
        );
      }
    });
  }, [target, searchTerm]);

  const filteredTotalAmount = useMemo(() => {
    return filteredItems.reduce((sum: number, item: any) => {
      const amt = target?.type === 'INCENTIVE' ? (item.commission || 0) : (item.amount || 0);
      return sum + Number(amt || 0);
    }, 0);
  }, [filteredItems, target]);

  // 개별 엑셀 다운로드
  const handleExportExcel = () => {
    if (!target || filteredItems.length === 0) return;

    const isInc = target.type === 'INCENTIVE';
    const wb = XLSX.utils.book_new();

    const titleRow = [`[ ${target.targetName} 수수료 지급 상세 명세서 - ${payoutMonthDisplay} 지급분 (${filteredItems.length}건) ]`];
    const emptyRow: any[] = [];
    const headers = isInc
      ? ['순번', '계약ID(렌탈번호)', '고객명', '본부명', '지사명', '사원명', '상품명', '제품명', '계약일자', '배송일자', '수수료지급일자', '수수료명', '지급금액']
      : ['순번', '지급일자', '본부명', '지사명', '사원명', '고객명', '회원번호/계약ID', '상품명', '회차구간', '직전지급일자', '유지수수료금액'];

    const rows: any[][] = [titleRow, emptyRow, headers];

    filteredItems.forEach((item: any, idx: number) => {
      if (isInc) {
        rows.push([
          idx + 1,
          item.rentalNo || '-',
          item.memName || '-',
          item.hq || '-',
          item.branch || '-',
          item.empName || '-',
          item.prodName || '-',
          item.rentalProd || '-',
          item.contractDate || '-',
          item.deliveryDate || '-',
          item.payDate || '-',
          item.ruleName || target.title,
          { v: Number(item.commission || 0), t: 'n', z: '#,##0' }
        ]);
      } else {
        const roundStr = item.fromInstallment === item.toInstallment 
          ? `${item.fromInstallment}회차` 
          : `${item.fromInstallment}회차 ~ ${item.toInstallment}회차`;
        rows.push([
          idx + 1,
          item.payDate || '-',
          item.hq || '-',
          item.branch || '-',
          item.empName || '-',
          item.customerName || '-',
          item.memNo || item.rentalNo || '-',
          item.productName || '-',
          roundStr,
          item.lastPayDate || '-',
          { v: Number(item.amount || 0), t: 'n', z: '#,##0' }
        ]);
      }
    });

    // 합계 행 (수식 적용)
    const dataStartRow = 4;
    const dataEndRow = 3 + filteredItems.length;

    if (isInc) {
      rows.push([
        '합계',
        `${filteredItems.length}건`,
        '', '', '', '', '', '', '', '', '', '',
        filteredItems.length > 0 ? { f: `SUM(M${dataStartRow}:M${dataEndRow})`, v: filteredTotalAmount, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' }
      ]);
    } else {
      rows.push([
        '합계',
        `${filteredItems.length}건`,
        '', '', '', '', '', '', '', '',
        filteredItems.length > 0 ? { f: `SUM(K${dataStartRow}:K${dataEndRow})`, v: filteredTotalAmount, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' }
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // 열 너비
    ws['!cols'] = isInc
      ? [
          { wch: 6 },  { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
          { wch: 10 }, { wch: 22 }, { wch: 24 }, { wch: 12 }, { wch: 12 },
          { wch: 14 }, { wch: 16 }, { wch: 16 }
        ]
      : [
          { wch: 6 },  { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
          { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 14 },
          { wch: 16 }
        ];

    // 스타일
    const headerStyle = { fill: { fgColor: { rgb: "2F5597" } }, font: { color: { rgb: "FFFFFF" }, bold: true, sz: 10 }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
    const totalStyle = { fill: { fgColor: { rgb: "E2EFDA" } }, font: { bold: true, sz: 10, color: { rgb: "276749" } }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "double" }, left: { style: "thin" }, right: { style: "thin" } } };
    const totalNumStyle = { fill: { fgColor: { rgb: "E2EFDA" } }, font: { bold: true, sz: 10, color: { rgb: "276749" } }, alignment: { vertical: "center", horizontal: "right" }, border: { top: { style: "thin" }, bottom: { style: "double" }, left: { style: "thin" }, right: { style: "thin" } }, numFmt: "#,##0" };
    const cellStyle = { font: { sz: 9 }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
    const numStyle = { font: { sz: 9 }, alignment: { vertical: "center", horizontal: "right" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }, numFmt: "#,##0" };

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const isTitle = R === 0;
      const isHdr = R === 2;
      const isTot = R === range.e.r;

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;

        if (isTitle) {
          ws[addr].s = { font: { bold: true, sz: 12, color: { rgb: "1E293B" } }, alignment: { vertical: "center", horizontal: "left" } };
          continue;
        }
        if (isHdr) {
          ws[addr].s = headerStyle;
          continue;
        }
        if (isTot) {
          ws[addr].s = ws[addr].t === 'n' ? totalNumStyle : totalStyle;
          continue;
        }
        ws[addr].s = ws[addr].t === 'n' ? numStyle : cellStyle;
      }
    }

    const cleanSheetName = (target.targetName || '상세명세').replace(/[\\/*?:[\]]/g, '').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, cleanSheetName);

    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.CalcPr) wb.Workbook.CalcPr = {};
    wb.Workbook.CalcPr.fullCalcOnLoad = true;

    const fileName = `${target.targetName}_수수료상세명세_${payoutMonthDisplay.replace(/\s+/g, '')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  if (!isOpen || !target) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200"
        >
          {/* Header */}
          <div className="p-4 px-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                <FileText size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-slate-800">
                    {target.targetName} 수수료 지급 상세 명세서
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {target.category || target.title}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  지급월: <span className="font-bold text-slate-700">{payoutMonthDisplay}</span> · 해당 항목의 건별 지급 내역과 산출 근거 명세서입니다.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                title="이 항목의 상세 내역을 엑셀 파일로 다운로드합니다."
              >
                <Download size={14} />
                <span>엑셀 다운로드</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Top KPI Cards & Search Bar */}
          <div className="p-4 px-6 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-4">
            {/* KPI Badges */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                <User size={14} className="text-slate-500" />
                <span className="text-xs text-slate-500 font-bold">대상자 / 항목:</span>
                <span className="text-xs font-black text-slate-800">{target.targetName}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl">
                <Calendar size={14} className="text-blue-600" />
                <span className="text-xs text-blue-700 font-bold">총 건수:</span>
                <span className="text-xs font-black font-mono text-blue-900">
                  {filteredItems.length.toLocaleString()}건
                  {filteredItems.length !== (target.items?.length || 0) && (
                    <span className="text-slate-400 font-normal ml-1">/ 전체 {target.items?.length || 0}건</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <DollarSign size={14} className="text-emerald-600" />
                <span className="text-xs text-emerald-700 font-bold">총 지급금액:</span>
                <span className="text-sm font-black font-mono text-emerald-900">
                  {filteredTotalAmount.toLocaleString()}원
                </span>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="고객명, 계약번호, 본부, 사원 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Table Content */}
          <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                      <th className="p-3 pl-4 text-center w-12">순번</th>
                      {target.type === 'INCENTIVE' ? (
                        <>
                          <th className="p-3 font-mono">계약ID(렌탈번호)</th>
                          <th className="p-3">고객명</th>
                          <th className="p-3">본부명</th>
                          <th className="p-3">지사명</th>
                          <th className="p-3">사원명</th>
                          <th className="p-3">상품명</th>
                          <th className="p-3">제품명</th>
                          <th className="p-3 font-mono">계약일자</th>
                          <th className="p-3 font-mono">배송일자</th>
                          <th className="p-3 font-mono">수수료지급일자</th>
                          <th className="p-3">수수료명</th>
                          <th className="p-3 pr-4 text-right font-black text-indigo-900">지급금액</th>
                        </>
                      ) : (
                        <>
                          <th className="p-3 font-mono">지급일자</th>
                          <th className="p-3">본부명</th>
                          <th className="p-3">지사명</th>
                          <th className="p-3">사원명</th>
                          <th className="p-3">고객명</th>
                          <th className="p-3 font-mono">회원번호 / 계약ID</th>
                          <th className="p-3">상품명</th>
                          <th className="p-3 text-center">회차구간</th>
                          <th className="p-3 font-mono">직전지급일자</th>
                          <th className="p-3 pr-4 text-right font-black text-indigo-900">유지수수료금액</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={target.type === 'INCENTIVE' ? 13 : 11} className="py-12 text-center text-slate-400 whitespace-nowrap">
                          해당 조건에 부합하는 상세 지급 내역이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                          <td className="p-3 pl-4 text-center font-mono text-slate-400">{idx + 1}</td>
                          {target.type === 'INCENTIVE' ? (
                            <>
                              <td className="p-3 font-mono font-bold text-indigo-700">{item.rentalNo || '-'}</td>
                              <td className="p-3 font-bold text-slate-900">{item.memName || '-'}</td>
                              <td className="p-3 font-bold text-slate-800">{item.hq || '-'}</td>
                              <td className="p-3 text-slate-600">{item.branch || '-'}</td>
                              <td className="p-3 text-slate-600">{item.empName || '-'}</td>
                              <td className="p-3 text-slate-800 font-medium">{item.prodName || '-'}</td>
                              <td className="p-3 text-slate-600">{item.rentalProd || '-'}</td>
                              <td className="p-3 font-mono text-slate-500">{item.contractDate || '-'}</td>
                              <td className="p-3 font-mono font-bold text-emerald-700">{item.deliveryDate || '-'}</td>
                              <td className="p-3 font-mono font-bold text-indigo-700">{item.payDate || '-'}</td>
                              <td className="p-3 text-slate-700 font-semibold">{item.ruleName || target.title}</td>
                              <td className="p-3 pr-4 text-right font-mono font-black text-indigo-700 text-sm">
                                {Number(item.commission || 0).toLocaleString()}원
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="p-3 font-mono font-bold text-indigo-700">{item.payDate || '-'}</td>
                              <td className="p-3 font-bold text-slate-800">{item.hq || '-'}</td>
                              <td className="p-3 text-slate-600">{item.branch || '-'}</td>
                              <td className="p-3 text-slate-600">{item.empName || '-'}</td>
                              <td className="p-3 font-bold text-slate-900">{item.customerName || '-'}</td>
                              <td className="p-3 font-mono text-slate-700">{item.memNo || item.rentalNo || '-'}</td>
                              <td className="p-3 text-slate-800 font-medium">{item.productName || '-'}</td>
                              <td className="p-3 text-center font-mono font-bold text-emerald-700">
                                {item.fromInstallment === item.toInstallment 
                                  ? `${item.fromInstallment}회차` 
                                  : `${item.fromInstallment}회차 ~ ${item.toInstallment}회차`}
                              </td>
                              <td className="p-3 font-mono text-slate-500">{item.lastPayDate || '-'}</td>
                              <td className="p-3 pr-4 text-right font-mono font-black text-indigo-700 text-sm">
                                {Number(item.amount || 0).toLocaleString()}원
                              </td>
                            </>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredItems.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 whitespace-nowrap">
                        <td className="p-3 pl-4 text-center font-mono" colSpan={target.type === 'INCENTIVE' ? 12 : 10}>
                          합계 ({filteredItems.length.toLocaleString()}건)
                        </td>
                        <td className="p-3 pr-4 text-right font-mono font-black text-indigo-900 text-base">
                          {filteredTotalAmount.toLocaleString()}원
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 px-6 border-t border-slate-200 bg-white flex justify-between items-center">
            <span className="text-xs text-slate-400">
              ※ 해당 상세 명세 데이터는 당월 수수료 산출 공식 및 실적 데이터에 근거하여 생성되었습니다.
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              닫기
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

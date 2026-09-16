import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, Calendar, Download, Search, Building2, ChevronRight, ChevronDown, FileSpreadsheet, Layers, CreditCard, ArrowUpDown, Filter, Check, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// @ts-ignore
const XLSX = (window as any).XLSX;

export interface MonthlySettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[];
  hqSettings: any[];
  divisionSettings: any[];
  maintenancePayouts: any[];
  globalIncentiveRules: any[];
  calculateCommissionDetails: (item: any, countMap: Map<string, number>) => any;
  onExportHqSettlement?: (hqName: string) => Promise<void>;
}

interface HqMonthlyStat {
  hqName: string;
  count: number;
  salesSum: number;
  promoSum: number;
  generalSum: number;
  maintenanceSum: number;
  specialSum: number;
  grossTotal: number;
  tax: number;
  netTotal: number;
  settlementType: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  items: any[];
}

export const MonthlySettlementModal: React.FC<MonthlySettlementModalProps> = ({
  isOpen,
  onClose,
  data,
  hqSettings,
  divisionSettings,
  maintenancePayouts,
  globalIncentiveRules,
  calculateCommissionDetails,
  onExportHqSettlement
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | '사업자' | '개인'>('all');
  const [selectedHqDetail, setSelectedHqDetail] = useState<HqMonthlyStat | null>(null);
  const [sortField, setSortField] = useState<'netTotal' | 'count' | 'hqName'>('netTotal');
  const [sortAsc, setSortAsc] = useState(false);

  // 본부 다중 선택 상태
  const [selectedHqs, setSelectedHqs] = useState<string[]>([]);
  const [isHqDropdownOpen, setIsHqDropdownOpen] = useState(false);
  const [hqSearchInput, setHqSearchInput] = useState('');
  const hqDropdownRef = useRef<HTMLDivElement>(null);

  // 1. 데이터에서 존재하는 모든 월(YYYY-MM) 목록 추출 (최신순 정렬)
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    
    (data || []).forEach(item => {
      const pDate = item.payDate || '';
      const m = pDate.match(/(\d{4})[-./](\d{1,2})/);
      if (m) {
        months.add(`${m[1]}-${m[2].padStart(2, '0')}`);
      }
    });

    (maintenancePayouts || []).forEach(mItem => {
      const m = (mItem.month || mItem.payDate || '').match(/(\d{4})[-./](\d{1,2})/);
      if (m) {
        months.add(`${m[1]}-${m[2].padStart(2, '0')}`);
      }
    });

    const sorted = Array.from(months).sort().reverse();
    return sorted;
  }, [data, maintenancePayouts]);

  // 기본 선택 월 설정 (최신 월)
  React.useEffect(() => {
    if (availableMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  // 2. 전체 데이터 통계 맵 (수수료 단가 산출용)
  const globalStatsMap = useMemo(() => {
    const stats = new Map<string, number>();
    (data || []).forEach(item => {
      if ((item.status?.includes('취소') || item.status?.includes('해약')) && !item.payDate?.trim()) return;
      const key = `${item.hq}_${item.prodName}_${item.payDate}`;
      stats.set(key, (stats.get(key) || 0) + 1);
    });
    return stats;
  }, [data]);

  // 3. 선택된 월에 해당하는 본부별 정산 집계 계산
  const hqMonthlyStats = useMemo(() => {
    if (!selectedMonth) return [];

    const statsMap = new Map<string, HqMonthlyStat>();

    // 1) 해당 월의 계약 건 필터링 및 본부별 수수료 집계
    (data || []).forEach(item => {
      if ((item.status?.includes('취소') || item.status?.includes('해약')) && !item.payDate?.trim()) return;

      const pDate = item.payDate || '';
      const m = pDate.match(/(\d{4})[-./](\d{1,2})/);
      const itemMonth = m ? `${m[1]}-${m[2].padStart(2, '0')}` : '';

      if (itemMonth !== selectedMonth) return;

      const hq = item.hq || '미지정';
      if (!statsMap.has(hq)) {
        const setting = (hqSettings || []).find(s => s.hqName === hq);
        const isIndiv = setting?.settlementType?.includes('개인') || hq === '글로씨';
        statsMap.set(hq, {
          hqName: hq,
          count: 0,
          salesSum: 0,
          promoSum: 0,
          generalSum: 0,
          maintenanceSum: 0,
          specialSum: 0,
          grossTotal: 0,
          tax: 0,
          netTotal: 0,
          settlementType: setting?.settlementType || (isIndiv ? '개인' : '사업자'),
          bankName: setting?.bankName || '-',
          accountNumber: setting?.accountNumber || '-',
          accountHolder: setting?.accountHolder || '-',
          items: []
        });
      }

      const stat = statsMap.get(hq)!;
      const { totalCommission, salesComm } = calculateCommissionDetails(item, globalStatsMap);
      const promo = totalCommission - salesComm;

      stat.count += 1;
      stat.salesSum += salesComm;
      stat.promoSum += promo;
      stat.generalSum += totalCommission;
      stat.items.push(item);
    });

    // 2) 유지수수료 집계
    (maintenancePayouts || []).forEach(mItem => {
      const m = (mItem.month || mItem.payDate || '').match(/(\d{4})[-./](\d{1,2})/);
      const mMonth = m ? `${m[1]}-${m[2].padStart(2, '0')}` : '';

      if (mMonth !== selectedMonth) return;

      const hq = mItem.hq || '미지정';
      if (!statsMap.has(hq)) {
        const setting = (hqSettings || []).find(s => s.hqName === hq);
        const isIndiv = setting?.settlementType?.includes('개인') || hq === '글로씨';
        statsMap.set(hq, {
          hqName: hq,
          count: 0,
          salesSum: 0,
          promoSum: 0,
          generalSum: 0,
          maintenanceSum: 0,
          specialSum: 0,
          grossTotal: 0,
          tax: 0,
          netTotal: 0,
          settlementType: setting?.settlementType || (isIndiv ? '개인' : '사업자'),
          bankName: setting?.bankName || '-',
          accountNumber: setting?.accountNumber || '-',
          accountHolder: setting?.accountHolder || '-',
          items: []
        });
      }

      const stat = statsMap.get(hq)!;
      stat.maintenanceSum += (mItem.amount || 0);
    });

    // 3) 세금 및 최종 실지급액 계산
    statsMap.forEach(stat => {
      stat.grossTotal = stat.generalSum + stat.maintenanceSum + stat.specialSum;
      const isPersonal = stat.settlementType.includes('개인');
      stat.tax = isPersonal ? Math.floor(stat.grossTotal * 0.033) : 0;
      stat.netTotal = stat.grossTotal - stat.tax;
    });

    return Array.from(statsMap.values());
  }, [data, selectedMonth, hqSettings, maintenancePayouts, calculateCommissionDetails, globalStatsMap]);

  // 3-1. 현재 월의 전체 고유 본부 목록
  const allAvailableHqs = useMemo(() => {
    return Array.from(new Set(hqMonthlyStats.map(s => s.hqName))).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [hqMonthlyStats]);

  // 3-2. 본부명 -> 통계 빠른 조회를 위한 맵
  const hqStatMap = useMemo(() => {
    const map = new Map<string, HqMonthlyStat>();
    hqMonthlyStats.forEach(s => map.set(s.hqName, s));
    return map;
  }, [hqMonthlyStats]);

  // 3-3. 월 변경 또는 초기 로드 시 본부 선택 목록 초기화/동기화
  const prevMonthRef = useRef<string>('');
  useEffect(() => {
    if (allAvailableHqs.length === 0) return;

    if (prevMonthRef.current !== selectedMonth) {
      // 월이 변경되었을 때: 새로운 월의 전체 본부를 기본 선택
      prevMonthRef.current = selectedMonth;
      setSelectedHqs(allAvailableHqs);
    } else {
      // 데이터 업데이트 등으로 본부 목록이 달라졌을 때
      setSelectedHqs(prev => {
        if (prev.length === 0) return allAvailableHqs;
        const valid = prev.filter(h => allAvailableHqs.includes(h));
        return valid.length > 0 ? valid : allAvailableHqs;
      });
    }
  }, [selectedMonth, allAvailableHqs]);

  // 3-4. 드롭다운 팝오버 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (hqDropdownRef.current && !hqDropdownRef.current.contains(e.target as Node)) {
        setIsHqDropdownOpen(false);
      }
    };
    if (isHqDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isHqDropdownOpen]);

  // 3-5. 본부 선택 토글 핸들러
  const handleToggleHq = (hq: string) => {
    setSelectedHqs(prev => {
      if (prev.includes(hq)) {
        return prev.filter(h => h !== hq);
      } else {
        return [...prev, hq];
      }
    });
  };

  const handleSelectAllHqs = () => {
    setSelectedHqs(allAvailableHqs);
  };

  const handleDeselectAllHqs = () => {
    setSelectedHqs([]);
  };

  // 3-6. 드롭다운 팝오버 내부 검색 필터
  const dropdownFilteredHqs = useMemo(() => {
    if (!hqSearchInput.trim()) return allAvailableHqs;
    const term = hqSearchInput.trim().toLowerCase();
    return allAvailableHqs.filter(h => h.toLowerCase().includes(term));
  }, [allAvailableHqs, hqSearchInput]);

  // 필터링 및 정렬된 본부 목록
  const filteredAndSortedStats = useMemo(() => {
    let list = hqMonthlyStats.filter(stat => {
      // 1. 본부 다중 선택 필터
      if (!selectedHqs.includes(stat.hqName)) {
        return false;
      }
      // 2. 정산유형 필터
      if (typeFilter !== 'all') {
        if (typeFilter === '개인' && !stat.settlementType.includes('개인')) return false;
        if (typeFilter === '사업자' && stat.settlementType.includes('개인')) return false;
      }
      // 3. 검색어 필터
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchHq = stat.hqName.toLowerCase().includes(term);
        const matchHolder = stat.accountHolder.toLowerCase().includes(term);
        const matchBank = stat.bankName.toLowerCase().includes(term);
        return matchHq || matchHolder || matchBank;
      }
      return true;
    });

    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB, 'ko') : valB.localeCompare(valA, 'ko');
      }
      return sortAsc ? valA - valB : valB - valA;
    });

    return list;
  }, [hqMonthlyStats, selectedHqs, typeFilter, searchTerm, sortField, sortAsc]);

  // 테이블 내 현재 표시된 본부들의 전체 선택 여부 판별
  const visibleHqNames = useMemo(() => filteredAndSortedStats.map(s => s.hqName), [filteredAndSortedStats]);
  const isAllVisibleSelected = visibleHqNames.length > 0 && visibleHqNames.every(h => selectedHqs.includes(h));
  const isSomeVisibleSelected = visibleHqNames.some(h => selectedHqs.includes(h)) && !isAllVisibleSelected;

  const handleToggleAllVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedHqs(prev => prev.filter(h => !visibleHqNames.includes(h)));
    } else {
      setSelectedHqs(prev => Array.from(new Set([...prev, ...visibleHqNames])));
    }
  };

  // 전체 요약 KPI 계산
  const summaryTotals = useMemo(() => {
    let totalCount = 0;
    let totalSales = 0;
    let totalPromo = 0;
    let totalGeneral = 0;
    let totalMaintenance = 0;
    let totalSpecial = 0;
    let totalGross = 0;
    let totalTax = 0;
    let totalNet = 0;

    filteredAndSortedStats.forEach(s => {
      totalCount += s.count;
      totalSales += s.salesSum;
      totalPromo += s.promoSum;
      totalGeneral += s.generalSum;
      totalMaintenance += s.maintenanceSum;
      totalSpecial += s.specialSum;
      totalGross += s.grossTotal;
      totalTax += s.tax;
      totalNet += s.netTotal;
    });

    return {
      hqCount: filteredAndSortedStats.length,
      totalCount,
      totalSales,
      totalPromo,
      totalGeneral,
      totalMaintenance,
      totalSpecial,
      totalGross,
      totalTax,
      totalNet
    };
  }, [filteredAndSortedStats]);

  // 정렬 핸들러
  const handleSort = (field: 'netTotal' | 'count' | 'hqName') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // 엑셀 다운로드 핸들러
  const handleExportExcel = () => {
    if (!XLSX) {
      alert('XLSX 라이브러리를 로드하지 못했습니다.');
      return;
    }

    const headerStyle = {
      fill: { fgColor: { rgb: "2F5597" } },
      font: { color: { rgb: "FFFFFF" }, bold: true, sz: 10 },
      alignment: { vertical: "center", horizontal: "center" },
      border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
    };
    const cellStyle = {
      font: { sz: 9 },
      alignment: { vertical: "center", horizontal: "center" },
      border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
    };
    const numberStyle = {
      ...cellStyle,
      alignment: { vertical: "center", horizontal: "right" }
    };
    const graySubtotalStyle = {
      fill: { fgColor: { rgb: "F2F2F2" } },
      font: { bold: true, sz: 9, color: { rgb: "1E293B" } },
      alignment: { vertical: "center", horizontal: "center" },
      border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
    };
    const titleStyle = {
      font: { bold: true, sz: 16 },
      alignment: { vertical: "center", horizontal: "center" }
    };

    const wb = XLSX.utils.book_new();

    // 1. 본부별 정산 집계표 시트
    const summaryRows: any[][] = [
      [`【 ${selectedMonth} 본부별 수수료 정산 집계 보고서 】`],
      [`■ 조회 기준월: ${selectedMonth}  |  작성일시: ${new Date().toLocaleDateString('ko-KR')}`],
      [],
      [
        '순번', '본부명', '정산유형', '실적건수', '판매수수료', '촉진비',
        '수수료 소계', '유지수수료', '특수수당', '총 발생액', '원천세(3.3%)',
        '최종 실지급액', '입금은행', '계좌번호', '예금주'
      ]
    ];

    filteredAndSortedStats.forEach((stat, idx) => {
      summaryRows.push([
        idx + 1,
        stat.hqName,
        stat.settlementType,
        { v: stat.count, t: 'n', z: '#,##0' },
        { v: stat.salesSum, t: 'n', z: '#,##0' },
        { v: stat.promoSum, t: 'n', z: '#,##0' },
        { v: stat.generalSum, t: 'n', z: '#,##0' },
        { v: stat.maintenanceSum, t: 'n', z: '#,##0' },
        { v: stat.specialSum, t: 'n', z: '#,##0' },
        { v: stat.grossTotal, t: 'n', z: '#,##0' },
        { v: stat.tax, t: 'n', z: '#,##0' },
        { v: stat.netTotal, t: 'n', z: '#,##0' },
        stat.bankName,
        stat.accountNumber,
        stat.accountHolder
      ]);
    });

    // 총합계 행 추가
    summaryRows.push([
      '총합계',
      `${filteredAndSortedStats.length}개 본부`,
      '-',
      { v: summaryTotals.totalCount, t: 'n', z: '#,##0' },
      { v: summaryTotals.totalSales, t: 'n', z: '#,##0' },
      { v: summaryTotals.totalPromo, t: 'n', z: '#,##0' },
      { v: summaryTotals.totalGeneral, t: 'n', z: '#,##0' },
      { v: summaryTotals.totalMaintenance, t: 'n', z: '#,##0' },
      { v: summaryTotals.totalSpecial, t: 'n', z: '#,##0' },
      { v: summaryTotals.totalGross, t: 'n', z: '#,##0' },
      { v: summaryTotals.totalTax, t: 'n', z: '#,##0' },
      { v: summaryTotals.totalNet, t: 'n', z: '#,##0' },
      '', '', ''
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 14 } }];

    // 컬럼 너비 계산
    const colWidths = summaryRows.reduce((acc, row) => {
      row.forEach((cell, i) => {
        let str = '';
        if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
        else if (cell !== null && cell !== undefined) str = cell.toString();
        const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
        if (!acc[i] || len > acc[i]) acc[i] = len;
      });
      return acc;
    }, [] as number[]);
    wsSummary['!cols'] = colWidths.map(w => ({ wch: Math.min(Math.max(w + 4, 10), 40) }));

    // 스타일 적용
    const rangeSummary = XLSX.utils.decode_range(wsSummary['!ref'] || 'A1:A1');
    for (let R = rangeSummary.s.r; R <= rangeSummary.e.r; ++R) {
      const isHeaderRow = R === 3;
      const isTotalRow = R === summaryRows.length - 1;

      for (let C = rangeSummary.s.c; C <= rangeSummary.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!wsSummary[addr]) continue;

        if (R === 0) {
          wsSummary[addr].s = titleStyle;
          continue;
        }
        if (R === 1) {
          wsSummary[addr].s = { font: { sz: 10, bold: true, color: { rgb: "475569" } }, alignment: { vertical: "center", horizontal: "left" } };
          continue;
        }
        if (isHeaderRow) {
          wsSummary[addr].s = headerStyle;
          continue;
        }
        if (isTotalRow) {
          wsSummary[addr].s = { ...graySubtotalStyle };
          if (wsSummary[addr].t === 'n') {
            wsSummary[addr].s.alignment = { vertical: 'center', horizontal: 'right' };
          }
          continue;
        }

        wsSummary[addr].s = { ...cellStyle };
        if (wsSummary[addr].t === 'n') {
          wsSummary[addr].s = { ...numberStyle };
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, wsSummary, '본부별정산집계');

    // 2. 전체 계약 상세 명세 시트
    const detailRows: any[][] = [
      ['본부명', '회원명', '계약일자', '상품명', '상태', '지사', '영업사원', '판매수수료', '촉진비', '총수수료', '지급일']
    ];

    filteredAndSortedStats.forEach(stat => {
      stat.items.forEach(item => {
        const { totalCommission, salesComm } = calculateCommissionDetails(item, globalStatsMap);
        detailRows.push([
          item.hq,
          item.memName,
          item.contractDate,
          item.prodName,
          item.status,
          item.branch,
          item.empName,
          { v: salesComm, t: 'n', z: '#,##0' },
          { v: totalCommission - salesComm, t: 'n', z: '#,##0' },
          { v: totalCommission, t: 'n', z: '#,##0' },
          item.payDate
        ]);
      });
    });

    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    const detailColWidths = detailRows.reduce((acc, row) => {
      row.forEach((cell, i) => {
        let str = '';
        if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
        else if (cell !== null && cell !== undefined) str = cell.toString();
        const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
        if (!acc[i] || len > acc[i]) acc[i] = len;
      });
      return acc;
    }, [] as number[]);
    wsDetail['!cols'] = detailColWidths.map(w => ({ wch: Math.min(Math.max(w + 4, 10), 40) }));

    const rangeDetail = XLSX.utils.decode_range(wsDetail['!ref'] || 'A1:A1');
    for (let R = rangeDetail.s.r; R <= rangeDetail.e.r; ++R) {
      for (let C = rangeDetail.s.c; C <= rangeDetail.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!wsDetail[addr]) continue;
        if (R === 0) {
          wsDetail[addr].s = headerStyle;
        } else {
          wsDetail[addr].s = { ...cellStyle };
          if (wsDetail[addr].t === 'n') {
            wsDetail[addr].s = { ...numberStyle };
          }
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, wsDetail, '계약상세명세');

    const s2ab = (s: string) => {
      const buf = new ArrayBuffer(s.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i !== s.length; ++i) view[i] = s.charCodeAt(i) & 0xFF;
      return buf;
    };

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
    const blob = new Blob([s2ab(wbout)], { type: 'application/octet-stream' });
    const fileName = `[월별본부정산]_${selectedMonth}_집계표.xlsx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 md:p-6 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 15 }}
          className="bg-white border border-slate-200 text-slate-800 w-full max-w-[1700px] h-[94vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 text-white">
                <Building2 className="w-5.5 h-5.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">월별 본부 정산서 조회</h2>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-bold">
                    월별 본부별 지급 총액 집계
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  선택한 월에 어떤 본부에 얼마의 수수료 및 수당이 정산되었는지 한눈에 파악합니다.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                title="선택 월 집계표 엑셀 다운로드"
              >
                <FileSpreadsheet size={15} />
                월별 집계 엑셀 다운로드
              </button>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* 월 선택 */}
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                <div className="flex items-center gap-1 pl-2 text-slate-600 font-bold">
                  <Calendar size={14} className="text-blue-600" />
                  <span>정산월:</span>
                </div>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer border-0 bg-white text-blue-700 shadow-2xs focus:outline-hidden"
                >
                  {availableMonths.map(m => (
                    <option key={m} value={m}>
                      {m.replace('-', '년 ')}월 정산
                    </option>
                  ))}
                </select>
              </div>

              {/* 본부 다중 선택 드롭다운 */}
              <div className="relative" ref={hqDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsHqDropdownOpen(!isHqDropdownOpen)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                    selectedHqs.length !== allAvailableHqs.length
                      ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-500/20'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200/80'
                  }`}
                >
                  <Building2 size={14} className={selectedHqs.length !== allAvailableHqs.length ? 'text-blue-600' : 'text-slate-500'} />
                  <span>
                    {selectedHqs.length === allAvailableHqs.length
                      ? `본부 선택: 전체 (${allAvailableHqs.length}개)`
                      : selectedHqs.length === 0
                        ? '본부 선택: 0개'
                        : selectedHqs.length === 1
                          ? `${selectedHqs[0]}`
                          : `${selectedHqs[0]} 외 ${selectedHqs.length - 1}개 (${selectedHqs.length}/${allAvailableHqs.length})`}
                  </span>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${isHqDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Popover */}
                {isHqDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1.5 z-50 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-black text-slate-800">조회할 본부 선택</span>
                      <span className="text-[11px] text-blue-600 font-bold">
                        {selectedHqs.length} / {allAvailableHqs.length}개 선택
                      </span>
                    </div>

                    {/* 본부 검색 */}
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="본부명 검색..."
                        value={hqSearchInput}
                        onChange={(e) => setHqSearchInput(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                      />
                      {hqSearchInput && (
                        <button
                          type="button"
                          onClick={() => setHqSearchInput('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {/* 전체 선택 / 해제 버튼 */}
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSelectAllHqs}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 font-bold transition-colors cursor-pointer"
                        >
                          전체 선택
                        </button>
                        <button
                          type="button"
                          onClick={handleDeselectAllHqs}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-600 font-bold transition-colors cursor-pointer"
                        >
                          전체 해제
                        </button>
                      </div>
                      {selectedHqs.length !== allAvailableHqs.length && (
                        <button
                          type="button"
                          onClick={handleSelectAllHqs}
                          className="text-[10.5px] text-blue-600 hover:underline font-bold cursor-pointer"
                        >
                          초기화
                        </button>
                      )}
                    </div>

                    {/* 본부 체크박스 목록 */}
                    <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar pr-1">
                      {dropdownFilteredHqs.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">
                          검색된 본부가 없습니다.
                        </div>
                      ) : (
                        dropdownFilteredHqs.map(hq => {
                          const isChecked = selectedHqs.includes(hq);
                          const stat = hqStatMap.get(hq);
                          return (
                            <label
                              key={hq}
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs select-none transition-colors ${
                                isChecked ? 'bg-blue-50/70 font-semibold' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleHq(hq)}
                                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                                <span className={isChecked ? 'text-blue-950 font-bold' : 'text-slate-700'}>
                                  {hq}
                                </span>
                              </div>
                              {stat && (
                                <span className="text-[10px] font-mono text-slate-400">
                                  {stat.count}건
                                </span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>

                    {/* 하단 확인 버튼 */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">
                        {selectedHqs.length === 0 ? '선택된 본부 없음' : `${selectedHqs.length}개 선택됨`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsHqDropdownOpen(false)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                      >
                        적용 및 닫기
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 정산유형 필터 */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${typeFilter === 'all' ? 'bg-white text-blue-700 font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  전체 본부 ({hqMonthlyStats.length})
                </button>
                <button
                  onClick={() => setTypeFilter('사업자')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${typeFilter === '사업자' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  사업자 ({hqMonthlyStats.filter(s => !s.settlementType.includes('개인')).length})
                </button>
                <button
                  onClick={() => setTypeFilter('개인')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${typeFilter === '개인' ? 'bg-purple-600 text-white font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  개인 3.3% ({hqMonthlyStats.filter(s => s.settlementType.includes('개인')).length})
                </button>
              </div>
            </div>

            {/* 검색창 */}
            <div className="relative min-w-[260px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="본부명, 예금주, 은행명 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          {/* 선택된 본부 태그 칩 바 (일부 본부만 선택되었을 때 노출) */}
          {selectedHqs.length > 0 && selectedHqs.length < allAvailableHqs.length && (
            <div className="px-6 py-2 bg-blue-50/60 border-b border-blue-100 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-blue-800 font-bold flex items-center gap-1 text-[11px] shrink-0">
                <Filter size={12} />
                선택된 본부 ({selectedHqs.length}개):
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedHqs.map(hq => (
                  <span
                    key={hq}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-blue-200 text-blue-700 text-[11px] font-bold shadow-2xs"
                  >
                    <span>{hq}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleHq(hq)}
                      className="text-blue-400 hover:text-blue-800 rounded-full hover:bg-blue-100 p-0.5 cursor-pointer transition-colors"
                      title="선택 해제"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={handleSelectAllHqs}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-bold underline ml-auto cursor-pointer shrink-0"
              >
                전체 본부 보기로 초기화
              </button>
            </div>
          )}

          {/* 본부가 0개 선택되었을 때 경고 배너 */}
          {selectedHqs.length === 0 && allAvailableHqs.length > 0 && (
            <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between text-xs text-amber-800">
              <span>선택된 본부가 없습니다. 상단 '본부 선택'에서 조회할 본부를 선택해 주세요.</span>
              <button
                type="button"
                onClick={handleSelectAllHqs}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] cursor-pointer transition-colors"
              >
                모든 본부 선택하기
              </button>
            </div>
          )}

          {/* KPI Dashboard Summary Cards */}
          <div className="px-6 py-3.5 bg-slate-50/60 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
                <span>총 실지급액 합계</span>
                <CreditCard size={14} className="text-blue-500" />
              </div>
              <div className="text-xl font-black text-blue-700 mt-1 font-mono tracking-tight">
                {summaryTotals.totalNet.toLocaleString()}
                <span className="text-xs font-bold text-slate-500 ml-1">원</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                총 발생액: {summaryTotals.totalGross.toLocaleString()}원
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
                <span>정산 참여 본부수</span>
                <Building2 size={14} className="text-indigo-500" />
              </div>
              <div className="text-xl font-black text-slate-800 mt-1 font-mono">
                {summaryTotals.hqCount}
                <span className="text-xs font-bold text-slate-500 ml-1">개 본부</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                총 실적 건수: {summaryTotals.totalCount.toLocaleString()}건
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
                <span>수수료 소계 (판매+촉진)</span>
                <Layers size={14} className="text-emerald-500" />
              </div>
              <div className="text-xl font-black text-emerald-600 mt-1 font-mono tracking-tight">
                {summaryTotals.totalGeneral.toLocaleString()}
                <span className="text-xs font-bold text-slate-500 ml-1">원</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                판매: {summaryTotals.totalSales.toLocaleString()} | 촉진: {summaryTotals.totalPromo.toLocaleString()}
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
                <span>기타 수당 (유지+특수)</span>
                <ArrowUpDown size={14} className="text-purple-500" />
              </div>
              <div className="text-xl font-black text-purple-600 mt-1 font-mono tracking-tight">
                {(summaryTotals.totalMaintenance + summaryTotals.totalSpecial).toLocaleString()}
                <span className="text-xs font-bold text-slate-500 ml-1">원</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                유지: {summaryTotals.totalMaintenance.toLocaleString()} | 특수: {summaryTotals.totalSpecial.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Main Table */}
          <div className="flex-1 overflow-auto p-6 custom-scrollbar">
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="px-2.5 py-3 text-center w-10 border-r border-slate-200">
                      <input
                        type="checkbox"
                        checked={isAllVisibleSelected}
                        ref={input => {
                          if (input) {
                            input.indeterminate = isSomeVisibleSelected;
                          }
                        }}
                        onChange={handleToggleAllVisible}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title={isAllVisibleSelected ? "전체 해제" : "현재 표시된 본부 전체 선택"}
                      />
                    </th>
                    <th className="px-3 py-3 text-center w-12 border-r border-slate-200">No</th>
                    <th 
                      onClick={() => handleSort('hqName')}
                      className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors border-r border-slate-200"
                    >
                      <div className="flex items-center gap-1">
                        <span>본부명</span>
                        <ArrowUpDown size={12} className="text-slate-400" />
                      </div>
                    </th>
                    <th className="px-3 py-3 text-center border-r border-slate-200">정산유형</th>
                    <th 
                      onClick={() => handleSort('count')}
                      className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors border-r border-slate-200"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>실적건수</span>
                        <ArrowUpDown size={12} className="text-slate-400" />
                      </div>
                    </th>
                    <th className="px-3 py-3 text-right border-r border-slate-200">판매수수료</th>
                    <th className="px-3 py-3 text-right border-r border-slate-200">촉진비</th>
                    <th className="px-3 py-3 text-right bg-blue-50/50 text-blue-900 border-r border-slate-200">수수료 소계</th>
                    <th className="px-3 py-3 text-right border-r border-slate-200">유지수수료</th>
                    <th className="px-3 py-3 text-right border-r border-slate-200">특수수당</th>
                    <th className="px-3 py-3 text-right border-r border-slate-200">총 발생액</th>
                    <th className="px-3 py-3 text-right border-r border-slate-200 text-rose-600">원천세(3.3%)</th>
                    <th 
                      onClick={() => handleSort('netTotal')}
                      className="px-3 py-3 text-right bg-indigo-50/60 text-indigo-900 font-black cursor-pointer hover:bg-indigo-100/60 transition-colors border-r border-slate-200"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>최종 실지급액</span>
                        <ArrowUpDown size={12} className="text-indigo-400" />
                      </div>
                    </th>
                    <th className="px-3 py-3 border-r border-slate-200">지급 계좌정보</th>
                    <th className="px-3 py-3 text-center w-24">상세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredAndSortedStats.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="px-6 py-12 text-center text-slate-400 font-medium">
                        {selectedHqs.length === 0 
                          ? '선택된 본부가 없습니다. 상단 본부 선택 필터에서 조회할 본부를 선택해 주세요.' 
                          : `${selectedMonth} 월에 조회된 본부별 정산 내역이 없습니다.`}
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedStats.map((stat, idx) => (
                      <tr 
                        key={stat.hqName} 
                        className={`hover:bg-blue-50/40 transition-colors cursor-pointer group ${selectedHqs.includes(stat.hqName) ? 'bg-blue-50/15' : ''}`}
                        onClick={() => setSelectedHqDetail(stat)}
                      >
                        <td 
                          className="px-2.5 py-2.5 text-center border-r border-slate-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedHqs.includes(stat.hqName)}
                            onChange={() => handleToggleHq(stat.hqName)}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-400 font-medium border-r border-slate-100">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-slate-900 border-r border-slate-100 flex items-center gap-1.5">
                          <Building2 size={13} className="text-blue-500 opacity-70" />
                          <span className="group-hover:text-blue-600 transition-colors">{stat.hqName}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center border-r border-slate-100">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${stat.settlementType.includes('개인') ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>
                            {stat.settlementType}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800 border-r border-slate-100">
                          {stat.count.toLocaleString()}건
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-600 border-r border-slate-100">
                          {stat.salesSum.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-600 border-r border-slate-100">
                          {stat.promoSum.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-blue-700 bg-blue-50/30 border-r border-slate-100">
                          {stat.generalSum.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-emerald-600 border-r border-slate-100">
                          {stat.maintenanceSum > 0 ? stat.maintenanceSum.toLocaleString() : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-purple-600 border-r border-slate-100">
                          {stat.specialSum > 0 ? stat.specialSum.toLocaleString() : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-800 border-r border-slate-100">
                          {stat.grossTotal.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-rose-600 border-r border-slate-100">
                          {stat.tax > 0 ? `-${stat.tax.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-extrabold text-indigo-700 bg-indigo-50/40 border-r border-slate-100">
                          {stat.netTotal.toLocaleString()}원
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 border-r border-slate-100">
                          <span className="text-[11px] truncate block max-w-[200px]">
                            {stat.bankName} {stat.accountNumber} ({stat.accountHolder})
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedHqDetail(stat);
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 text-[11px] font-bold transition-all shadow-2xs cursor-pointer"
                          >
                            명세보기
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredAndSortedStats.length > 0 && (
                  <tfoot className="bg-slate-100/90 font-black text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-center border-r border-slate-200">
                        총합계 ({filteredAndSortedStats.length}개 본부)
                      </td>
                      <td className="px-3 py-3 text-right font-mono border-r border-slate-200">
                        {summaryTotals.totalCount.toLocaleString()}건
                      </td>
                      <td className="px-3 py-3 text-right font-mono border-r border-slate-200">
                        {summaryTotals.totalSales.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono border-r border-slate-200">
                        {summaryTotals.totalPromo.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-blue-700 border-r border-slate-200">
                        {summaryTotals.totalGeneral.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-emerald-600 border-r border-slate-200">
                        {summaryTotals.totalMaintenance.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-purple-600 border-r border-slate-200">
                        {summaryTotals.totalSpecial.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono border-r border-slate-200">
                        {summaryTotals.totalGross.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-rose-600 border-r border-slate-200">
                        {summaryTotals.totalTax > 0 ? `-${summaryTotals.totalTax.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-indigo-900 bg-indigo-100/60 border-r border-slate-200">
                        {summaryTotals.totalNet.toLocaleString()}원
                      </td>
                      <td colSpan={2} className="px-3 py-3 text-center text-slate-400 font-normal">
                        -
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* 본부 상세 명세 드릴다운 모달/드로어 */}
          <AnimatePresence>
            {selectedHqDetail && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
              >
                <motion.div
                  initial={{ scale: 0.95, y: 15 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 15 }}
                  className="bg-white w-full max-w-5xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
                >
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-2.5">
                      <Building2 className="w-5 h-5 text-blue-600" />
                      <h3 className="text-base font-bold text-slate-900">
                        [{selectedHqDetail.hqName}] {selectedMonth} 정산 상세 명세
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">
                        {selectedHqDetail.count}건
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {onExportHqSettlement && (
                        <button
                          onClick={() => onExportHqSettlement(selectedHqDetail.hqName)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                        >
                          <Download size={13} />
                          본부 정산서 다운로드
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedHqDetail(null)}
                        className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-all cursor-pointer"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-wrap gap-4 text-xs">
                    <div><span className="text-slate-400">판매수수료:</span> <strong className="font-mono text-slate-800">{selectedHqDetail.salesSum.toLocaleString()}원</strong></div>
                    <div><span className="text-slate-400">촉진비:</span> <strong className="font-mono text-slate-800">{selectedHqDetail.promoSum.toLocaleString()}원</strong></div>
                    <div><span className="text-slate-400">유지수수료:</span> <strong className="font-mono text-emerald-600">{selectedHqDetail.maintenanceSum.toLocaleString()}원</strong></div>
                    <div><span className="text-slate-400">최종 실지급액:</span> <strong className="font-mono text-indigo-700 text-sm">{selectedHqDetail.netTotal.toLocaleString()}원</strong></div>
                    <div className="ml-auto text-slate-500">
                      <span>계좌: {selectedHqDetail.bankName} {selectedHqDetail.accountNumber} ({selectedHqDetail.accountHolder})</span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                    <table className="w-full text-xs text-left border border-slate-200 rounded-lg overflow-hidden">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-center w-10">No</th>
                          <th className="px-3 py-2">회원명</th>
                          <th className="px-3 py-2">계약일자</th>
                          <th className="px-3 py-2">상품명</th>
                          <th className="px-3 py-2">지사</th>
                          <th className="px-3 py-2">영업사원</th>
                          <th className="px-3 py-2 text-right">판매수수료</th>
                          <th className="px-3 py-2 text-right">촉진비</th>
                          <th className="px-3 py-2 text-right">총수수료</th>
                          <th className="px-3 py-2 text-center">지급일</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedHqDetail.items.map((item, i) => {
                          const { totalCommission, salesComm } = calculateCommissionDetails(item, globalStatsMap);
                          return (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-center text-slate-400">{i + 1}</td>
                              <td className="px-3 py-2 font-bold text-slate-800">{item.memName}</td>
                              <td className="px-3 py-2 text-slate-600">{item.contractDate}</td>
                              <td className="px-3 py-2 text-slate-800">{item.prodName}</td>
                              <td className="px-3 py-2 text-slate-600">{item.branch || '-'}</td>
                              <td className="px-3 py-2 text-slate-600">{item.empName || '-'}</td>
                              <td className="px-3 py-2 text-right font-mono">{salesComm.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right font-mono">{(totalCommission - salesComm).toLocaleString()}</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-blue-600">{totalCommission.toLocaleString()}</td>
                              <td className="px-3 py-2 text-center text-slate-500">{item.payDate}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

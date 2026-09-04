import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, RefreshCw, Search, CheckCircle, AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ERPDataItem {
  memNo: string;
  memName?: string;
  prodName?: string;
  rentalProd?: string;
  hq?: string;
  hcRegDate?: string;
  raw: any[];
  [key: string]: any;
}

interface HealthcareReconModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterData: ERPDataItem[];
  initialMonth?: string; // 예: '2026-08'
  title?: string;
  defaultSheetName?: string;
}

export type ReconStatus = 'MATCH' | 'DATE_MISMATCH' | 'MISSING_IN_MASTER' | 'NOT_IN_KB';

export interface ReconRow {
  contractNo: string;
  memName: string;
  prodName: string;
  hqName: string;
  masterHcRegDate: string; // 관리대장 S열
  kbServiceDate: string;   // KB시트 F열
  status: ReconStatus;
  statusText: string;
  diffDays?: number;
  overdueCount?: number;
  lastPaymentDate?: string;
  kbRowRaw?: any[];
  masterRaw?: any;
}

export const HealthcareReconModal: React.FC<HealthcareReconModalProps> = ({
  isOpen,
  onClose,
  masterData,
  initialMonth = '',
  title = '헬스케어 명단 대사작업',
  defaultSheetName = 'KB헬스케어대상자'
}) => {
  const [loading, setLoading] = useState(false);
  const [kbRows, setKbRows] = useState<any[][]>([]);
  const [sheetTitle, setSheetTitle] = useState(defaultSheetName);
  const [allSheetTitles, setAllSheetTitles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'ISSUES' | 'DATE_MISMATCH' | 'MISSING_IN_MASTER' | 'NOT_IN_KB'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [targetMonth, setTargetMonth] = useState<string>(initialMonth || '');

  useEffect(() => {
    setTargetMonth(initialMonth || '');
  }, [initialMonth, isOpen]);

  useEffect(() => {
    if (defaultSheetName) {
      setSheetTitle(defaultSheetName);
    }
  }, [defaultSheetName, isOpen]);

  // 1. 구글 시트 KB헬스케어 데이터 로드
  const fetchKbData = async (overrideTabName?: string) => {
    setLoading(true);
    try {
      const targetTab = overrideTabName || sheetTitle || defaultSheetName || '';
      const url = targetTab ? `/api/sheets/kb-healthcare-data?tabName=${encodeURIComponent(targetTab)}` : '/api/sheets/kb-healthcare-data';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setSheetTitle(json.sheetTitle || defaultSheetName);
        setAllSheetTitles(json.allSheetTitles || []);
        setKbRows(json.rows || []);
      }
    } catch (e) {
      console.error('Fetch KB healthcare data error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchKbData(defaultSheetName);
    }
  }, [isOpen, defaultSheetName]);

  // 날짜 정규화 헬퍼 (YYYY-MM-DD 또는 YYYY.MM.DD -> YYYY-MM-DD)
  const normalizeDateStr = (dateStr: any): string => {
    if (!dateStr) return '';
    const str = String(dateStr).trim();
    if (!str) return '';
    const cleaned = str.replace(/[./]/g, '-');
    const parts = cleaned.split('-');
    if (parts.length >= 3) {
      const y = parts[0].length === 2 ? `20${parts[0]}` : parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return cleaned;
  };

  // 2. 대사 엔진 (1:1 대조 분석)
  const reconResults = useMemo(() => {
    const results: ReconRow[] = [];
    const kbMap = new Map<string, { raw: any[]; serviceDate: string; memName: string; prodName: string }>();

    // KB시트 파싱
    if (Array.isArray(kbRows) && kbRows.length > 0) {
      // 헤더 행 위치 자동 감지 (처음 5개 행 중 '계약' '상품' '일' 키워드가 많은 행)
      let headerRowIdx = 0;
      for (let r = 0; r < Math.min(kbRows.length, 5); r++) {
        const rStr = (kbRows[r] || []).join(' ');
        if (rStr.includes('계약') || rStr.includes('회원') || rStr.includes('코드') || rStr.includes('제공') || rStr.includes('상품')) {
          headerRowIdx = r;
          break;
        }
      }

      const headerRow = (kbRows[headerRowIdx] || []).map((h: any) => String(h || '').trim());
      const findCol = (keywords: string[], defaultIdx: number) => {
        const found = headerRow.findIndex((h: string) => keywords.some((kw) => h === kw || h.includes(kw)));
        return found !== -1 ? found : defaultIdx;
      };

      const contractNoCol = findCol(['계약번호', '고객가입코드', '회원번호', '계약', '코드'], 2); // 기본 C열 (index 2)
      const serviceDateCol = findCol(['서비스제공일', '서비스시작일', '제공일', '제공일자', '등록일'], 5); // 기본 F열 (index 5)
      const memNameCol = findCol(['피보험자명', '회원명', '고객명', '성명', '이름'], 4); // 기본 E열 (index 4)
      const prodNameCol = findCol(['가입상품명', '상품명', '상품'], 3); // 기본 D열 (index 3)

      kbRows.slice(headerRowIdx + 1).forEach((row) => {
        // C열(index 2) 또는 매칭 열
        const contractNo = String(row[contractNoCol] ?? row[2] ?? '').trim().toUpperCase();
        if (!contractNo || contractNo === '계약번호' || contractNo === 'C열') return;

        const serviceDate = normalizeDateStr(row[serviceDateCol] ?? row[5] ?? '');
        const memName = String(row[memNameCol] ?? row[4] ?? '').trim();
        const prodName = String(row[prodNameCol] ?? row[3] ?? '').trim();

        kbMap.set(contractNo, {
          raw: row,
          serviceDate,
          memName,
          prodName
        });
      });
    }

    const matchedKbContractNos = new Set<string>();

    const isInTargetMonth = (dStr: string) => {
      if (!targetMonth) return true;
      return dStr.startsWith(targetMonth);
    };

    const getOverdue = (item: any) => {
      if (!item) return { overdueCount: 0, lastPaymentDate: '' };
      if (typeof item.overdueCount === 'number') {
        return {
          overdueCount: item.overdueCount,
          lastPaymentDate: item.lastPaymentDate || String(item.raw?.[22] || '').trim()
        };
      }
      const uCol = String(item.raw?.[20] || item.overdueRaw || '').trim();
      const num = parseInt(uCol.replace(/[^0-9]/g, ''), 10);
      const overdueCount = isNaN(num) ? 0 : num;
      const lastPaymentDate = String(item.raw?.[22] || item.lastPaymentDate || '').trim();
      return { overdueCount, lastPaymentDate };
    };

    // 관리대장 시트 순회 (지정된 월의 헬스케어 등록일이 있거나 KB시트 대상건)
    masterData.forEach((item) => {
      const contractNo = String(item.memNo || item.raw?.[2] || '').trim().toUpperCase();
      if (!contractNo) return;

      const masterHcDate = normalizeDateStr(item.hcRegDate || item.raw?.[18] || '');
      const kbMatch = kbMap.get(contractNo);
      const kbDate = kbMatch ? kbMatch.serviceDate : '';

      // 선택한 월 범위 데이터만 대사 대상에 포함 (관리대장 등록일 또는 KB 서비스제공일이 해당월인 건)
      const isMasterInMonth = isInTargetMonth(masterHcDate);
      const isKbInMonth = isInTargetMonth(kbDate);

      if (!isMasterInMonth && !isKbInMonth) return;

      const { overdueCount, lastPaymentDate } = getOverdue(item);

      if (kbMatch) {
        matchedKbContractNos.add(contractNo);

        if (masterHcDate && kbDate && masterHcDate === kbDate) {
          results.push({
            contractNo,
            memName: item.memName || kbMatch.memName || '-',
            prodName: item.prodName || kbMatch.prodName || '-',
            hqName: item.hq || '-',
            masterHcRegDate: masterHcDate,
            kbServiceDate: kbDate,
            status: 'MATCH',
            statusText: '✅ 정상 (일치)',
            overdueCount,
            lastPaymentDate,
            masterRaw: item,
            kbRowRaw: kbMatch.raw
          });
        } else {
          results.push({
            contractNo,
            memName: item.memName || kbMatch.memName || '-',
            prodName: item.prodName || kbMatch.prodName || '-',
            hqName: item.hq || '-',
            masterHcRegDate: masterHcDate || '미기입',
            kbServiceDate: kbDate || '미기입',
            status: 'DATE_MISMATCH',
            statusText: '⚠️ 날짜 불일치',
            overdueCount,
            lastPaymentDate,
            masterRaw: item,
            kbRowRaw: kbMatch.raw
          });
        }
      } else if (isMasterInMonth) {
        // 관리대장에는 해당월 헬스케어 등록일이 있으나 KB시트에는 없음
        results.push({
          contractNo,
          memName: item.memName || '-',
          prodName: item.prodName || '-',
          hqName: item.hq || '-',
          masterHcRegDate: masterHcDate,
          kbServiceDate: 'KB시트 미등록',
          status: 'NOT_IN_KB',
          statusText: '❓ KB시트 미등록',
          overdueCount,
          lastPaymentDate,
          masterRaw: item
        });
      }
    });

    // KB시트에는 존재하지만 관리대장에 계약번호가 없는 건 (해당 월 건만)
    kbMap.forEach((kbVal, cNo) => {
      if (!matchedKbContractNos.has(cNo)) {
        if (isInTargetMonth(kbVal.serviceDate)) {
          results.push({
            contractNo: cNo,
            memName: kbVal.memName || '-',
            prodName: kbVal.prodName || '-',
            hqName: '-',
            masterHcRegDate: '관리대장 누락',
            kbServiceDate: kbVal.serviceDate || '-',
            status: 'MISSING_IN_MASTER',
            statusText: '❌ 관리대장 누락',
            kbRowRaw: kbVal.raw
          });
        }
      }
    });

    return results;
  }, [kbRows, masterData, targetMonth]);

  // 카운트 집계
  const counts = useMemo(() => {
    const total = reconResults.length;
    const match = reconResults.filter((r) => r.status === 'MATCH').length;
    const dateMismatch = reconResults.filter((r) => r.status === 'DATE_MISMATCH').length;
    const missingInMaster = reconResults.filter((r) => r.status === 'MISSING_IN_MASTER').length;
    const notInKb = reconResults.filter((r) => r.status === 'NOT_IN_KB').length;
    const issues = dateMismatch + missingInMaster + notInKb;
    return { total, match, dateMismatch, missingInMaster, notInKb, issues };
  }, [reconResults]);

  // 필터링 및 검색 적용
  const filteredResults = useMemo(() => {
    return reconResults.filter((item) => {
      // 탭 필터
      if (activeTab === 'ISSUES' && item.status === 'MATCH') return false;
      if (activeTab === 'DATE_MISMATCH' && item.status !== 'DATE_MISMATCH') return false;
      if (activeTab === 'MISSING_IN_MASTER' && item.status !== 'MISSING_IN_MASTER') return false;
      if (activeTab === 'NOT_IN_KB' && item.status !== 'NOT_IN_KB') return false;

      // 검색어 필터
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchCNo = item.contractNo.toLowerCase().includes(term);
        const matchName = item.memName.toLowerCase().includes(term);
        const matchProd = item.prodName.toLowerCase().includes(term);
        const matchHq = item.hqName.toLowerCase().includes(term);
        return matchCNo || matchName || matchProd || matchHq;
      }

      return true;
    });
  }, [reconResults, activeTab, searchTerm]);

  // 엑셀 다운로드
  const handleExportExcel = () => {
    const exportData = filteredResults.map((item, idx) => ({
      순번: idx + 1,
      대사상태: item.statusText,
      계약번호: item.contractNo,
      회원명: item.memName,
      가입상품명: item.prodName,
      본부명: item.hqName,
      '관리대장 등록일(S열)': item.masterHcRegDate,
      'KB시트 서비스제공일(F열)': item.kbServiceDate,
      '연체수': (item.overdueCount && item.overdueCount > 0) ? `${item.overdueCount}회 연체` : '정상(0)',
      '최종 납입일': item.lastPaymentDate || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    const cleanTitle = (title || '헬스케어_대사결과').replace(/\s+/g, '_');
    XLSX.utils.book_append_sheet(wb, ws, cleanTitle.slice(0, 30));
    XLSX.writeFile(wb, `${cleanTitle}_${targetMonth || '전체'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative bg-white w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh] z-10"
        >
          {/* Header */}
          <div className="px-8 py-5 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-2xl">
                <RefreshCw size={22} className={loading ? 'animate-spin' : ''} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  {title}
                  {!title.includes('월납') && !defaultSheetName.includes('월납') && (
                    <span className="text-xs font-semibold px-2 py-0.5 bg-blue-500/25 text-blue-300 rounded-md border border-blue-400/30">
                      시트: {sheetTitle}
                    </span>
                  )}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!title.includes('월납') && !defaultSheetName.includes('월납') && allSheetTitles.length > 0 && (
                <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 text-xs">
                  <span className="text-slate-400 font-bold">시트:</span>
                  <select
                    value={sheetTitle}
                    onChange={(e) => {
                      const newTab = e.target.value;
                      setSheetTitle(newTab);
                      fetchKbData(newTab);
                    }}
                    className="bg-slate-900 text-cyan-300 font-bold px-2 py-1 rounded-lg border border-slate-600 outline-none cursor-pointer"
                  >
                    {allSheetTitles.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
              {!title.includes('월납') && !defaultSheetName.includes('월납') && (
                <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700">
                  <span className="text-sm">📅</span>
                  <button
                    onClick={() => setTargetMonth('')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                      !targetMonth
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white bg-slate-700/50'
                    }`}
                    title="월 제한 없이 전체 대사"
                  >
                    전체
                  </button>
                  <input
                    type="month"
                    value={targetMonth}
                    onChange={(e) => setTargetMonth(e.target.value)}
                    className="bg-slate-900 text-amber-400 border border-slate-600 px-2 py-0.5 rounded-lg text-xs font-black font-mono outline-none focus:border-amber-400 cursor-pointer shadow-xs"
                  />
                </div>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 overflow-hidden flex flex-col flex-1 bg-slate-50/60 gap-4">
            {/* Top Stat Summary Cards */}
            <div className="grid grid-cols-5 gap-3 shrink-0">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400">총 대사 대상건</div>
                <div className="text-xl font-black text-slate-800 mt-1">{counts.total}건</div>
              </div>

              <button
                onClick={() => setActiveTab('ALL')}
                className={`p-3.5 rounded-2xl border transition-all text-left cursor-pointer ${
                  activeTab === 'ALL' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md font-bold' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-[11px] font-bold opacity-80 flex items-center gap-1">
                  <CheckCircle size={13} /> ✅ 정상 일치
                </div>
                <div className="text-xl font-black mt-1">{counts.match}건</div>
              </button>

              <button
                onClick={() => setActiveTab('DATE_MISMATCH')}
                className={`p-3.5 rounded-2xl border transition-all text-left cursor-pointer ${
                  activeTab === 'DATE_MISMATCH' ? 'bg-amber-500 text-white border-amber-500 shadow-md font-bold' : 'bg-white border-amber-200/80 text-amber-800 hover:bg-amber-50/50'
                }`}
              >
                <div className="text-[11px] font-bold flex items-center gap-1">
                  <AlertTriangle size={13} /> ⚠️ 날짜 불일치
                </div>
                <div className="text-xl font-black mt-1">{counts.dateMismatch}건</div>
              </button>

              <button
                onClick={() => setActiveTab('MISSING_IN_MASTER')}
                className={`p-3.5 rounded-2xl border transition-all text-left cursor-pointer ${
                  activeTab === 'MISSING_IN_MASTER' ? 'bg-rose-600 text-white border-rose-600 shadow-md font-bold' : 'bg-white border-rose-200/80 text-rose-800 hover:bg-rose-50/50'
                }`}
              >
                <div className="text-[11px] font-bold flex items-center gap-1">
                  <AlertCircle size={13} /> ❌ 관리대장 누락
                </div>
                <div className="text-xl font-black mt-1">{counts.missingInMaster}건</div>
              </button>

              <button
                onClick={() => setActiveTab('NOT_IN_KB')}
                className={`p-3.5 rounded-2xl border transition-all text-left cursor-pointer ${
                  activeTab === 'NOT_IN_KB' ? 'bg-purple-600 text-white border-purple-600 shadow-md font-bold' : 'bg-white border-purple-200/80 text-purple-800 hover:bg-purple-50/50'
                }`}
              >
                <div className="text-[11px] font-bold flex items-center gap-1">
                  <HelpCircle size={13} /> ❓ KB시트 미등록
                </div>
                <div className="text-xl font-black mt-1">{counts.notInKb}건</div>
              </button>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-slate-200 shrink-0">
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                <button
                  onClick={() => setActiveTab('ALL')}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  전체 ({counts.total})
                </button>
                <button
                  onClick={() => setActiveTab('ISSUES')}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'ISSUES' ? 'bg-orange-500 text-white shadow-xs' : 'text-orange-600 hover:bg-orange-50'
                  }`}
                >
                  🔥 이상 항목만 보기 ({counts.issues})
                </button>
                <button
                  onClick={() => setActiveTab('DATE_MISMATCH')}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'DATE_MISMATCH' ? 'bg-amber-500 text-white shadow-xs' : 'text-amber-700 hover:bg-amber-50'
                  }`}
                >
                  날짜 불일치 ({counts.dateMismatch})
                </button>
                <button
                  onClick={() => setActiveTab('MISSING_IN_MASTER')}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'MISSING_IN_MASTER' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-700 hover:bg-rose-50'
                  }`}
                >
                  관리대장 누락 ({counts.missingInMaster})
                </button>
              </div>

              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="계약번호, 회원명, 상품명, 본부명 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <button
                  onClick={fetchKbData}
                  disabled={loading}
                  className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-slate-200 bg-white"
                  title="시트 재불러오기"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={handleExportExcel}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0"
                >
                  <Download size={14} /> 엑셀 다운로드
                </button>
              </div>
            </div>

            {/* Reconciliation Results Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex-1 flex flex-col shadow-xs">
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-900 text-white z-10">
                    <tr>
                      <th className="p-3 text-center w-12">순번</th>
                      <th className="p-3 text-center w-36">대사 판정</th>
                      <th className="p-3">계약번호 (C열)</th>
                      <th className="p-3">회원명</th>
                      <th className="p-3">가입상품명</th>
                      <th className="p-3">본부명</th>
                      <th className="p-3 bg-slate-800 text-amber-300 font-bold border-l border-slate-700">
                        관리대장 S열 (등록일)
                      </th>
                      <th className="p-3 bg-slate-800 text-blue-300 font-bold border-l border-slate-700">
                        KB시트 F열 (서비스제공일)
                      </th>
                      <th className="p-3 bg-slate-800 text-rose-300 font-bold border-l border-slate-700 text-center w-32">
                        연체 현황
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredResults.length > 0 ? (
                      filteredResults.map((item, idx) => {
                        let rowBg = 'hover:bg-slate-50/80';
                        if (item.status === 'DATE_MISMATCH') rowBg = 'bg-amber-50/60 hover:bg-amber-100/50';
                        if (item.status === 'MISSING_IN_MASTER') rowBg = 'bg-rose-50/60 hover:bg-rose-100/50';
                        if (item.status === 'NOT_IN_KB') rowBg = 'bg-purple-50/60 hover:bg-purple-100/50';

                        return (
                          <tr key={idx} className={rowBg}>
                            <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                            <td className="p-3 text-center font-extrabold whitespace-nowrap">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[11px] inline-block ${
                                  item.status === 'MATCH'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : item.status === 'DATE_MISMATCH'
                                    ? 'bg-amber-200 text-amber-900 border border-amber-300'
                                    : item.status === 'MISSING_IN_MASTER'
                                    ? 'bg-rose-200 text-rose-900 border border-rose-300'
                                    : 'bg-purple-200 text-purple-900 border border-purple-300'
                                }`}
                              >
                                {item.statusText}
                              </span>
                            </td>
                            <td className="p-3 font-mono font-bold text-blue-600">{item.contractNo}</td>
                            <td className="p-3 font-bold text-slate-900">{item.memName}</td>
                            <td className="p-3 text-slate-700">{item.prodName}</td>
                            <td className="p-3 text-slate-500">{item.hqName}</td>
                            <td className="p-3 font-mono font-bold text-slate-800 bg-amber-50/30 border-l border-slate-100">
                              {item.masterHcRegDate}
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-800 bg-blue-50/30 border-l border-slate-100">
                              {item.kbServiceDate}
                            </td>
                            <td className="p-3 text-center font-mono border-l border-slate-100 whitespace-nowrap">
                              {(item.overdueCount && item.overdueCount > 0) ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-100 text-rose-700 border border-rose-300 shadow-2xs">
                                    <AlertCircle size={12} className="text-rose-600" />
                                    {item.overdueCount}회 연체
                                  </span>
                                  {item.lastPaymentDate && (
                                    <span className="text-[10px] text-slate-400 font-medium">
                                      (납입: {item.lastPaymentDate})
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    정상 (0)
                                  </span>
                                  {item.lastPaymentDate && (
                                    <span className="text-[10px] text-slate-400 font-medium">
                                      (납입: {item.lastPaymentDate})
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-slate-400 font-bold">
                          {loading ? `구글 시트 [${sheetTitle}] 데이터를 불러오는 중입니다...` : '대사 결과가 없습니다.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

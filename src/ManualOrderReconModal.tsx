import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, RefreshCw, Search, CheckCircle, AlertCircle, HelpCircle, PackageCheck } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ManualOrderItem {
  memNo?: string;
  contractNo?: string;
  memName?: string;
  prodName?: string;
  storeName?: string;
  deliveryStatus?: string;
  delDate?: string;
  raw?: any[];
  [key: string]: any;
}

interface ManualOrderReconModalProps {
  isOpen: boolean;
  onClose: () => void;
  manualOrders: ManualOrderItem[];
}

export type ReconStatus = 'MATCH' | 'MISSING_IN_MANUAL' | 'NOT_IN_SUPPLIER';

export interface SupplierReconRow {
  contractNo: string;
  memName: string;
  prodName: string;
  storeName: string;
  deliveryStatus: string;
  status: ReconStatus;
  statusText: string;
  note: string;
  manualRaw?: any;
  supplierRaw?: any[];
}

export const ManualOrderReconModal: React.FC<ManualOrderReconModalProps> = ({
  isOpen,
  onClose,
  manualOrders
}) => {
  const [loading, setLoading] = useState(false);
  const [supplierRows, setSupplierRows] = useState<any[][]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'ISSUES' | 'MATCH' | 'MISSING' | 'NOT_REGISTERED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // 1. 공급사대사작업 시트 데이터 로드 (무조건 '공급사대사작업' 시트 사용)
  const fetchSupplierData = async () => {
    setLoading(true);
    try {
      const url = `/api/sheets/supplier-recon-data?tabName=${encodeURIComponent('공급사대사작업')}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setSupplierRows(json.rows || []);
      }
    } catch (e) {
      console.error('Fetch supplier recon data error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSupplierData();
    }
  }, [isOpen]);

  // 2. 계약번호 개수 대사 엔진
  const reconResults = useMemo(() => {
    const results: SupplierReconRow[] = [];
    const supplierMap = new Map<string, { raw: any[]; memName: string; prodName: string; rowCellKeys: string[] }>();

    const cleanKey = (str: any): string => {
      if (!str) return '';
      return String(str).replace(/[\s\-_]/g, '').toUpperCase();
    };

    // 공급사대사작업 시트 파싱
    if (Array.isArray(supplierRows) && supplierRows.length > 0) {
      let headerRowIdx = 0;
      for (let r = 0; r < Math.min(supplierRows.length, 5); r++) {
        const rStr = (supplierRows[r] || []).join(' ');
        if (rStr.includes('계약') || rStr.includes('코드') || rStr.includes('회원') || rStr.includes('상품')) {
          headerRowIdx = r;
          break;
        }
      }

      const headerRow = (supplierRows[headerRowIdx] || []).map((h: any) => String(h || '').trim());
      const findCol = (keywords: string[], defaultIdx: number) => {
        const found = headerRow.findIndex((h: string) => keywords.some((kw) => h === kw || h.includes(kw)));
        return found !== -1 ? found : defaultIdx;
      };

      const contractNoCol = findCol(['계약번호', '계약', '코드', '회원번호'], 0);
      const memNameCol = findCol(['회원명', '고객명', '성명', '피보험자명'], 1);
      const prodNameCol = findCol(['상품명', '가입상품명', '상품'], 2);

      supplierRows.slice(headerRowIdx + 1).forEach((row) => {
        const rawContractNo = String(row[contractNoCol] ?? row[0] ?? '').trim();
        const key = cleanKey(rawContractNo);
        if (!key || key === '계약번호' || key === 'A열') return;

        const memName = String(row[memNameCol] ?? '').trim();
        const prodName = String(row[prodNameCol] ?? '').trim();
        const rowCellKeys = row.map((cell) => cleanKey(cell)).filter(Boolean);

        supplierMap.set(key, {
          raw: row,
          memName,
          prodName,
          rowCellKeys
        });
      });
    }

    const matchedSupplierContractNos = new Set<string>();

    // 수기발주 목록 전체 매칭
    manualOrders.forEach((item) => {
      const rawContractNo = String(item.contractNo || item.memNo || item.raw?.[2] || '').trim();
      const targetKey = cleanKey(rawContractNo);
      if (!targetKey) return;

      const delStatus = item.deliveryStatus || '발주대기';

      // 1차 검색: 키 직접 일치
      let supplierMatchKey = supplierMap.has(targetKey) ? targetKey : null;

      // 2차 검색: 맵 전체 행 셀 탐색
      if (!supplierMatchKey) {
        for (const [supKey, supVal] of supplierMap.entries()) {
          if (supKey === targetKey || supVal.rowCellKeys.includes(targetKey)) {
            supplierMatchKey = supKey;
            break;
          }
        }
      }

      if (supplierMatchKey) {
        matchedSupplierContractNos.add(supplierMatchKey);
        const supplierMatch = supplierMap.get(supplierMatchKey)!;

        results.push({
          contractNo: rawContractNo,
          memName: item.memName || supplierMatch.memName || '-',
          prodName: item.prodName || supplierMatch.prodName || '-',
          storeName: item.storeName || '-',
          deliveryStatus: delStatus,
          status: 'MATCH',
          statusText: '✅ 정상 (매칭 일치)',
          note: '정상 일치',
          manualRaw: item,
          supplierRaw: supplierMatch.raw
        });
      } else {
        // 수기발주에는 있으나 공급사 시트에는 없음
        results.push({
          contractNo: rawContractNo,
          memName: item.memName || '-',
          prodName: item.prodName || '-',
          storeName: item.storeName || '-',
          deliveryStatus: delStatus,
          status: 'NOT_IN_SUPPLIER',
          statusText: '❓ 시트 미등록',
          note: '시트 미등록',
          manualRaw: item
        });
      }
    });

    // 공급사 시트에는 있으나 수기발주 대장에 없음
    supplierMap.forEach((supVal, cNo) => {
      if (!matchedSupplierContractNos.has(cNo)) {
        results.push({
          contractNo: cNo,
          memName: supVal.memName || '-',
          prodName: supVal.prodName || '-',
          storeName: '-',
          deliveryStatus: '-',
          status: 'MISSING_IN_MANUAL',
          statusText: '❌ 수기발주 누락',
          note: '수기발주 누락',
          supplierRaw: supVal.raw
        });
      }
    });

    return results;
  }, [supplierRows, manualOrders]);

  // 집계 수치
  const counts = useMemo(() => {
    const total = reconResults.length;
    const match = reconResults.filter((r) => r.status === 'MATCH').length;
    const missingInManual = reconResults.filter((r) => r.status === 'MISSING_IN_MANUAL').length;
    const notInSupplier = reconResults.filter((r) => r.status === 'NOT_IN_SUPPLIER').length;
    const issues = missingInManual + notInSupplier;
    return { total, match, missingInManual, notInSupplier, issues };
  }, [reconResults]);

  // 필터링 적용
  const filteredResults = useMemo(() => {
    return reconResults.filter((item) => {
      if (activeTab === 'MATCH' && item.status !== 'MATCH') return false;
      if (activeTab === 'ISSUES' && item.status === 'MATCH') return false;
      if (activeTab === 'MISSING' && item.status !== 'MISSING_IN_MANUAL') return false;
      if (activeTab === 'NOT_REGISTERED' && item.status !== 'NOT_IN_SUPPLIER') return false;

      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        return (
          item.contractNo.toLowerCase().includes(term) ||
          item.memName.toLowerCase().includes(term) ||
          item.prodName.toLowerCase().includes(term) ||
          item.deliveryStatus.toLowerCase().includes(term) ||
          item.storeName.toLowerCase().includes(term)
        );
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
      배송상태: item.deliveryStatus,
      비고: item.note
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '수기발주_공급사대사결과');
    XLSX.writeFile(wb, `수기발주_공급사대사결과_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
          className="relative bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[85vh] z-10"
        >
          {/* Header */}
          <div className="px-8 py-5 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl">
                <PackageCheck size={22} className={loading ? 'animate-spin' : ''} />
              </div>
              <div>
                <h3 className="text-lg font-bold">수기발주 명단 대사작업</h3>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <X size={22} />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 overflow-hidden flex flex-col flex-1 bg-slate-50/60 gap-4">
            {/* Top Stat Summary Cards */}
            <div className="grid grid-cols-4 gap-3 shrink-0">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400">총 대사 건수 (배송완료+시트)</div>
                <div className="text-2xl font-black text-slate-800 mt-1">{counts.total}건</div>
              </div>

              <button
                onClick={() => setActiveTab('MATCH')}
                className={`p-4 rounded-2xl border transition-all text-left cursor-pointer ${
                  activeTab === 'MATCH' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md font-bold' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-[11px] font-bold opacity-80 flex items-center gap-1">
                  <CheckCircle size={14} /> ✅ 정상 매칭 일치
                </div>
                <div className="text-2xl font-black mt-1">{counts.match}건</div>
              </button>

              <button
                onClick={() => setActiveTab('MISSING')}
                className={`p-4 rounded-2xl border transition-all text-left cursor-pointer ${
                  activeTab === 'MISSING' ? 'bg-rose-600 text-white border-rose-600 shadow-md font-bold' : 'bg-white border-rose-200/80 text-rose-800 hover:bg-rose-50/50'
                }`}
              >
                <div className="text-[11px] font-bold flex items-center gap-1">
                  <AlertCircle size={14} /> ❌ 수기발주 누락
                </div>
                <div className="text-2xl font-black mt-1">{counts.missingInManual}건</div>
              </button>

              <button
                onClick={() => setActiveTab('NOT_REGISTERED')}
                className={`p-4 rounded-2xl border transition-all text-left cursor-pointer ${
                  activeTab === 'NOT_REGISTERED' ? 'bg-purple-600 text-white border-purple-600 shadow-md font-bold' : 'bg-white border-purple-200/80 text-purple-800 hover:bg-purple-50/50'
                }`}
              >
                <div className="text-[11px] font-bold flex items-center gap-1">
                  <HelpCircle size={14} /> ❓ 시트 미등록
                </div>
                <div className="text-2xl font-black mt-1">{counts.notInSupplier}건</div>
              </button>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-slate-200 shrink-0">
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                <button
                  onClick={() => setActiveTab('ALL')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  전체 ({counts.total})
                </button>
                <button
                  onClick={() => setActiveTab('MATCH')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'MATCH' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  정상 일치 ({counts.match})
                </button>
                <button
                  onClick={() => setActiveTab('ISSUES')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'ISSUES' ? 'bg-orange-500 text-white shadow-xs' : 'text-orange-600 hover:bg-orange-50'
                  }`}
                >
                  🔥 누락/미등록만 보기 ({counts.issues})
                </button>
              </div>

              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="계약번호, 회원명, 상품명, 배송상태 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <button
                  onClick={() => fetchSupplierData()}
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

            {/* Reconciliation Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex-1 flex flex-col shadow-xs">
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-900 text-white z-10">
                    <tr>
                      <th className="p-3 text-center w-14">순번</th>
                      <th className="p-3 text-center w-36">대사 판정</th>
                      <th className="p-3">계약번호</th>
                      <th className="p-3">회원명</th>
                      <th className="p-3">가입상품명</th>
                      <th className="p-3 text-center w-28">배송상태</th>
                      <th className="p-3 border-l border-slate-700">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredResults.length > 0 ? (
                      filteredResults.map((item, idx) => {
                        let rowBg = 'hover:bg-slate-50/80';
                        if (item.status === 'MISSING_IN_MANUAL') rowBg = 'bg-rose-50/60 hover:bg-rose-100/50';
                        if (item.status === 'NOT_IN_SUPPLIER') rowBg = 'bg-purple-50/60 hover:bg-purple-100/50';

                        // 배송상태 뱃지 색상
                        let deliveryBadgeClass = 'bg-slate-100 text-slate-600';
                        if (item.deliveryStatus === '배송완료') deliveryBadgeClass = 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-200';
                        else if (item.deliveryStatus === '배송중') deliveryBadgeClass = 'bg-blue-100 text-blue-800 font-bold border border-blue-200';
                        else if (item.deliveryStatus === '발주완료') deliveryBadgeClass = 'bg-purple-100 text-purple-800 font-bold border border-purple-200';
                        else if (item.deliveryStatus === '발주대기') deliveryBadgeClass = 'bg-amber-100 text-amber-800 font-bold border border-amber-200';

                        return (
                          <tr key={idx} className={rowBg}>
                            <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                            <td className="p-3 text-center font-extrabold whitespace-nowrap">
                              <span
                                className={`px-3 py-1 rounded-full text-[11px] inline-block ${
                                  item.status === 'MATCH'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : item.status === 'MISSING_IN_MANUAL'
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
                            <td className="p-3 text-center whitespace-nowrap">
                              <span className={`px-2.5 py-0.5 rounded-md text-[11px] ${deliveryBadgeClass}`}>
                                {item.deliveryStatus}
                              </span>
                            </td>
                            <td className="p-3 text-slate-600 font-bold border-l border-slate-100">{item.note}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-16 text-center text-slate-400 font-bold">
                          {loading ? '구글 시트 공급사대사작업 데이터를 불러오는 중입니다...' : '대사 결과가 없습니다.'}
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

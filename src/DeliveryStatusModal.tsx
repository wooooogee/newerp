import React, { useState, useMemo } from 'react';
import { X, Calendar, Download, Search, Truck, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MultiSelectDropdown } from './MultiSelectDropdown';

// ERPDataItem 타입 임포트 대신 필요한 속성만 정의하거나 any로 처리 가능하지만, 
// 여기서는 App.tsx에서 넘겨받는 데이터 구조를 그대로 사용합니다.
interface DeliveryStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[]; // ERPDataItem[]
  onUpdateDeliveryMemo: (rowIdx: number, val: string) => void;
  onBatchUpdateDeliveryMemos?: (updates: { rowIdx: number, val: string }[]) => void;
}

export const DeliveryStatusModal: React.FC<DeliveryStatusModalProps> = ({ 
  isOpen, 
  onClose, 
  data, 
  onUpdateDeliveryMemo,
  onBatchUpdateDeliveryMemos 
}) => {
  const [filterMonth, setFilterMonth] = useState<string[]>([]); // YYYY-MM
  const [productFilter, setProductFilter] = useState<string[]>([]);
  const [hqFilter, setHqFilter] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isUnpaidRental, setIsUnpaidRental] = useState(false);
  const [isUnpaidMutualAid, setIsUnpaidMutualAid] = useState(false);
  const [isDeliveryCompleted, setIsDeliveryCompleted] = useState(false);
  const [memoDrafts, setMemoDrafts] = useState<Record<string, string>>({});
  const itemsPerPage = 12;

  // 필터가 변경될 때 페이지 1로 초기화
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterMonth, productFilter, hqFilter, searchTerm, sortOrder, isUnpaidRental, isUnpaidMutualAid, isDeliveryCompleted]);

  // 조건: 상태가 '가입'이고 (배송완료 체크 시 '배송완료', 미체크 시 '배송대기') 데이터 + 렌탈번호 중복 제거
  const baseData = useMemo(() => {
    const rawFiltered = data.filter(item => {
      if (item.status !== '가입') return false;
      if (isDeliveryCompleted) {
        return item.deliveryStatus === '배송완료' || (item.deliveryStatus && item.deliveryStatus.includes('배송완료'));
      } else {
        return item.deliveryStatus === '배송대기';
      }
    });
    
    const uniqueMap = new Map();
    rawFiltered.forEach(item => {
      if (item.rentalNo && !uniqueMap.has(item.rentalNo)) {
        uniqueMap.set(item.rentalNo, item);
      } else if (!item.rentalNo) {
        uniqueMap.set(item.uniqueKey as string, item);
      }
    });
    return Array.from(uniqueMap.values());
  }, [data, isDeliveryCompleted]);

  // 수정된 메모 항목 추적
  const modifiedUpdates = useMemo(() => {
    const updates: { rowIdx: number, val: string }[] = [];
    Object.entries(memoDrafts).forEach(([key, draftVal]) => {
      const originalItem = baseData.find(item => (item.uniqueKey as string) === key);
        if (originalItem && (originalItem.deliveryMemo || '') !== draftVal) {
          updates.push({
            rowIdx: originalItem.originalRowIdx as number,
            val: draftVal as string
          });
        }
    });
    return updates;
  }, [memoDrafts, baseData]);

  // 일괄 저장 핸들러
  const handleBatchSave = () => {
    if (modifiedUpdates.length === 0) {
      alert('수정된 메모 내용이 없습니다.');
      return;
    }
    if (onBatchUpdateDeliveryMemos) {
      onBatchUpdateDeliveryMemos(modifiedUpdates);
      setMemoDrafts({});
    } else {
      modifiedUpdates.forEach(u => onUpdateDeliveryMemo(u.rowIdx, u.val));
      setMemoDrafts({});
    }
  };

  // 필터에 사용할 고유 값 추출
  const uniqueMonths = useMemo(() => {
    const months = new Set(
      baseData
        .map(item => {
          const m = item.contractDate.match(/^(\d{4})[-./]?(\d{2})/);
          return m ? `${m[1]}-${m[2]}` : null;
        })
        .filter(Boolean) as string[]
    );
    return Array.from(months).sort().reverse();
  }, [baseData]);

  const uniqueProducts = useMemo(() => {
    return Array.from(new Set(baseData.map(item => item.prodName).filter(Boolean))).sort();
  }, [baseData]);

  const uniqueHqs = useMemo(() => {
    return Array.from(new Set(baseData.map(item => item.hq).filter(Boolean))).sort();
  }, [baseData]);

  // 최종 필터링된 데이터
  const filteredData = useMemo(() => {
    return baseData.filter(item => {
      // 월별 필터 (계약일 기준)
      if (filterMonth.length > 0) {
        const m = item.contractDate.match(/^(\d{4})[-./]?(\d{2})/);
        const itemMonth = m ? `${m[1]}-${m[2]}` : '';
        if (!filterMonth.includes(itemMonth)) return false;
      }

      // 상품/본부 다중 필터
      if (productFilter.length > 0 && !productFilter.includes(item.prodName)) return false;
      if (hqFilter.length > 0 && !hqFilter.includes(item.hq)) return false;

      // 검색어 필터 (회원명, 렌탈번호, 지사명 등)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const searchString = `${item.memName} ${item.rentalNo} ${item.branch} ${item.empName}`.toLowerCase();
        if (!searchString.includes(term)) return false;
      }

      // 렌탈 미출금 필터 (Y열 deliveryMemo / row[24] 및 AA열 row[26] 기준 출금날짜 유무 검사)
      if (isUnpaidRental) {
        const deliveryMemoVal = (item.deliveryMemo || '').trim();
        const rawAAVal = item.raw && item.raw[26] ? String(item.raw[26]).trim() : '';
        const rawYVal = item.raw && item.raw[24] ? String(item.raw[24]).trim() : '';
        
        // Y열 또는 AA열 중 하나라도 4자리 연도(날짜)가 포함되어 있으면 출금 완료건
        const hasRentalPayDate = /\d{4}/.test(deliveryMemoVal) || /\d{4}/.test(rawAAVal) || /\d{4}/.test(rawYVal);
        if (hasRentalPayDate) return false;
      }

      // 상조 미출금 필터 (관리대장 시트 V열 row[21] 상조출금 값이 출금날짜가 아니고 하이픈/공백/빈값인 경우)
      if (isUnpaidMutualAid) {
        const firstPayVal = item.raw && item.raw[21] ? String(item.raw[21]).trim() : '';
        const isUnpaid = !firstPayVal || firstPayVal.includes('-') || !/\d{4}/.test(firstPayVal);
        if (!isUnpaid) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortOrder === 'desc') {
        return b.contractDate.localeCompare(a.contractDate);
      } else {
        return a.contractDate.localeCompare(b.contractDate);
      }
    });
  }, [baseData, filterMonth, productFilter, hqFilter, searchTerm, sortOrder, isUnpaidRental, isUnpaidMutualAid]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  // 통계
  const totalCount = filteredData.length;
  const summaryByProduct = filteredData.reduce((acc, curr) => {
    const key = curr.prodName || '기타';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleExport = () => {
    const exportData = filteredData.map(item => ({
      '계약일자': item.contractDate,
      '상품명': item.prodName,
      '회원명': item.memName,
      '렌탈번호': item.rentalNo,
      '렌탈상품명': item.rentalProd || '',
      '배송현황': item.deliveryStatus,
      '본부명': item.hq,
      '지사명': item.branch || '',
      '사원명': item.empName,
      '상조출금일': (item.raw && item.raw[21]) ? String(item.raw[21]).trim() : '-',
      '렌탈출금일': (item.raw && item.raw[26]) ? String(item.raw[26]).trim() : '-',
      '배송완료일': item.deliveryDate || (item.raw && item.raw[13] ? String(item.raw[13]).trim() : '-'),
      '배송관련 메모': item.deliveryMemo || ''
    }));

    const ws = (window as any).XLSX.utils.json_to_sheet(exportData);
    
    // 화면과 동일한 순서의 기본 셀 너비 설정
    const colWidths = [
      { wch: 16 }, // 계약일자
      { wch: 30 }, // 상품명
      { wch: 16 }, // 회원명
      { wch: 18 }, // 렌탈번호
      { wch: 45 }, // 렌탈상품명
      { wch: 15 }, // 배송현황
      { wch: 22 }, // 본부명
      { wch: 22 }, // 지사명
      { wch: 16 }, // 사원명
      { wch: 18 }, // 상조출금일
      { wch: 18 }, // 렌탈출금일
      { wch: 18 }, // 배송완료일
      { wch: 35 }  // 배송관련 메모
    ];

    // 실제 데이터 텍스트 길이에 맞춰 셀 너비를 넉넉하게 자동 확장 (텍스트 잘림 방지)
    if (exportData.length > 0) {
      const keys = Object.keys(exportData[0]);
      keys.forEach((key, colIdx) => {
        let maxLen = key.length * 2;
        exportData.forEach(row => {
          const val = String((row as any)[key] || '');
          const len = val.split('').reduce((acc, char) => acc + (char.charCodeAt(0) > 128 ? 2 : 1), 0);
          if (len > maxLen) maxLen = len;
        });
        const currentMin = colWidths[colIdx]?.wch || 15;
        colWidths[colIdx] = { wch: Math.max(currentMin, maxLen + 4) };
      });
    }

    ws['!cols'] = colWidths;

    const wb = (window as any).XLSX.utils.book_new();
    (window as any).XLSX.utils.book_append_sheet(wb, ws, "배송현황");
    (window as any).XLSX.writeFile(wb, `배송현황_${new Date().getTime()}.xlsx`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex justify-end"
        >
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="w-full max-w-[96vw] h-full bg-slate-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="bg-white px-8 py-5 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Truck className="text-blue-600" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    배송현황 관리
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    상태가 '가입'이고 {isDeliveryCompleted ? "'배송완료'" : "'배송대기'"}인 데이터 목록입니다.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Filters */}
            <div className="p-4 border-b border-slate-200 bg-white shadow-sm flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <MultiSelectDropdown 
                  label="계약 월별 조회" 
                  options={uniqueMonths} 
                  selectedOptions={filterMonth} 
                  onChange={setFilterMonth} 
                />

                <MultiSelectDropdown 
                  label="상품" 
                  options={uniqueProducts} 
                  selectedOptions={productFilter} 
                  onChange={setProductFilter} 
                />
                
                <MultiSelectDropdown 
                  label="본부" 
                  options={uniqueHqs} 
                  selectedOptions={hqFilter} 
                  onChange={setHqFilter} 
                />

                <div className="flex items-center gap-4 ml-2 border-l border-slate-200 pl-4">
                  <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer hover:text-slate-900">
                    <input 
                      type="checkbox" 
                      checked={isUnpaidRental}
                      onChange={(e) => setIsUnpaidRental(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-blue-600 font-medium">렌탈 미출금</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer hover:text-slate-900">
                    <input 
                      type="checkbox" 
                      checked={isUnpaidMutualAid}
                      onChange={(e) => setIsUnpaidMutualAid(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
                    />
                    <span className="text-red-600 font-medium">상조 미출금</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer hover:text-slate-900">
                    <input 
                      type="checkbox" 
                      checked={isDeliveryCompleted}
                      onChange={(e) => setIsDeliveryCompleted(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-emerald-700 font-medium">배송완료</span>
                  </label>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="회원명, 렌탈번호 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  </div>
                  <button
                    onClick={handleBatchSave}
                    disabled={modifiedUpdates.length === 0}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all shadow-sm text-sm font-bold ${
                      modifiedUpdates.length > 0 
                        ? 'bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-400/50 animate-pulse cursor-pointer' 
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Save size={16} />
                    {modifiedUpdates.length > 0 ? `일괄 저장 (${modifiedUpdates.length}건)` : '일괄 저장'}
                  </button>
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm text-sm font-medium"
                  >
                    <Download size={16} />
                    엑셀 다운로드
                  </button>
                </div>
              </div>

              {/* Summary */}
              <div className="flex flex-wrap items-center gap-2 text-[13px] bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                <span className="font-black text-blue-600 bg-blue-100/50 px-2 py-0.5 rounded text-[12px]">총 {totalCount}건</span>
                {Object.keys(summaryByProduct).length > 0 && <span className="text-slate-300">|</span>}
                {Object.entries(summaryByProduct).map(([key, count], i) => (
                   <span key={i} className="text-slate-600 font-medium text-[12px]">
                     {key}: <span className="font-bold text-slate-900">{count}건</span>
                   </span>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto bg-slate-50 p-6">
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      <th 
                        className="p-2.5 font-bold cursor-pointer hover:text-blue-600 transition-colors"
                        onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                      >
                        <div className="flex items-center gap-1">
                          계약일자 {sortOrder === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
                        </div>
                      </th>
                      <th className="p-2.5 font-bold">상품명</th>
                      <th className="p-2.5 font-bold">회원명</th>
                      <th className="p-2.5 font-bold">렌탈번호</th>
                      <th className="p-2.5 font-bold">렌탈상품명</th>
                      <th className="p-2.5 font-bold">배송현황</th>
                      <th className="p-2.5 font-bold">본부명</th>
                      <th className="p-2.5 font-bold">지사명</th>
                      <th className="p-2.5 font-bold">사원명</th>
                      <th className="p-2.5 font-bold text-center">상조출금일</th>
                      <th className="p-2.5 font-bold text-center">렌탈출금일</th>
                      <th className="p-2.5 font-bold text-center">배송완료일</th>
                      <th className="p-2.5 font-bold">배송관련 메모</th>
                      <th className="p-2.5 font-bold text-center">저장</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px] whitespace-nowrap">
                    {paginatedData.length === 0 ? (
                      <tr>
                        <td colSpan={14} className="p-8 text-center text-slate-400">조회된 데이터가 없습니다.</td>
                      </tr>
                    ) : (
                      paginatedData.map((item, idx) => {
                        const isOverdue = parseInt(item.memo || '0', 10) >= 1;
                        const mutualAidPayVal = item.raw && item.raw[21] ? String(item.raw[21]).trim() : '-';
                        const rentalPayVal = item.raw && item.raw[26] ? String(item.raw[26]).trim() : '-';
                        const deliveryDateVal = item.deliveryDate || (item.raw && item.raw[13] ? String(item.raw[13]).trim() : '-');

                        return (
                        <tr key={item.uniqueKey} className={`transition-colors ${isOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}`}>
                          <td className={`p-2.5 font-mono ${isOverdue ? 'text-red-700 font-bold' : 'text-slate-600'}`}>{item.contractDate}</td>
                          <td className="p-2.5 font-bold text-slate-800">{item.prodName}</td>
                          <td className="p-2.5 font-medium text-slate-700">{item.memName}</td>
                          <td className="p-2.5 font-mono text-blue-600 font-bold">{item.rentalNo}</td>
                          <td className="p-2.5 font-medium text-slate-800 max-w-[220px] truncate" title={item.rentalProd}>{item.rentalProd}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 font-bold rounded border text-[11px] ${
                              item.deliveryStatus === '배송완료' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-orange-50 text-orange-600 border-orange-100'
                            }`}>
                              {item.deliveryStatus}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-600">{item.hq}</td>
                          <td className="p-2.5 text-slate-600">{item.branch || '-'}</td>
                          <td className="p-2.5 text-slate-600">{item.empName}</td>
                          <td className="p-2.5 text-center font-mono text-slate-700">{mutualAidPayVal}</td>
                          <td className="p-2.5 text-center font-mono text-slate-700">{rentalPayVal}</td>
                          <td className="p-2.5 text-center font-mono text-emerald-700 font-medium">{deliveryDateVal}</td>
                          <td className="p-2 min-w-[140px]">
                            {(() => {
                              const itemKey = item.uniqueKey;
                              const currentMemoVal = memoDrafts[itemKey] !== undefined ? memoDrafts[itemKey] : (item.deliveryMemo || '');
                              const isModified = memoDrafts[itemKey] !== undefined && memoDrafts[itemKey] !== (item.deliveryMemo || '');
                              return (
                                <input
                                  type="text"
                                  value={currentMemoVal}
                                  placeholder="YYYY-MM-DD 등 기입"
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setMemoDrafts(prev => ({ ...prev, [itemKey]: val }));
                                  }}
                                  className={`w-full px-2 py-1 border rounded outline-none text-[11px] transition-colors ${
                                    isModified
                                      ? 'border-blue-500 bg-blue-50/50 font-bold text-blue-900'
                                      : 'border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                                  }`}
                                />
                              );
                            })()}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => {
                                const itemKey = item.uniqueKey;
                                const finalVal = memoDrafts[itemKey] !== undefined ? memoDrafts[itemKey] : (item.deliveryMemo || '');
                                onUpdateDeliveryMemo(item.originalRowIdx, finalVal);
                              }}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded font-bold text-[11px] transition-colors cursor-pointer"
                            >
                              저장
                            </button>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed bg-slate-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-medium text-slate-600 px-4">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed bg-slate-50"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

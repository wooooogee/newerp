import React, { useState, useMemo } from 'react';
import { X, Calendar, Download, Search, Truck, ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MultiSelectDropdown } from './MultiSelectDropdown';

// ERPDataItem 타입 임포트 대신 필요한 속성만 정의하거나 any로 처리 가능하지만, 
// 여기서는 App.tsx에서 넘겨받는 데이터 구조를 그대로 사용합니다.
interface DeliveryStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[]; // ERPDataItem[]
  onUpdateDeliveryMemo: (rowIdx: number, val: string) => void;
}

export const DeliveryStatusModal: React.FC<DeliveryStatusModalProps> = ({ isOpen, onClose, data, onUpdateDeliveryMemo }) => {
  const [filterMonth, setFilterMonth] = useState<string[]>([]); // YYYY-MM
  const [productFilter, setProductFilter] = useState<string[]>([]);
  const [hqFilter, setHqFilter] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // 필터가 변경될 때 페이지 1로 초기화
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterMonth, productFilter, hqFilter, searchTerm, sortOrder]);

  // 조건: 상태가 '가입'이고 배송현황이 '배송대기'인 데이터 + 렌탈번호 중복 제거
  const baseData = useMemo(() => {
    const rawFiltered = data.filter(item => 
      item.status === '가입' && 
      item.deliveryStatus === '배송대기'
    );
    
    const uniqueMap = new Map();
    rawFiltered.forEach(item => {
      if (item.rentalNo && !uniqueMap.has(item.rentalNo)) {
        uniqueMap.set(item.rentalNo, item);
      } else if (!item.rentalNo) {
        uniqueMap.set(item.uniqueKey, item);
      }
    });
    return Array.from(uniqueMap.values());
  }, [data]);

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

      return true;
    }).sort((a, b) => {
      if (sortOrder === 'desc') {
        return b.contractDate.localeCompare(a.contractDate);
      } else {
        return a.contractDate.localeCompare(b.contractDate);
      }
    });
  }, [baseData, filterMonth, productFilter, hqFilter, searchTerm, sortOrder]);

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
      '배송현황': item.deliveryStatus,
      '본부명': item.hq,
      '지사명': item.branch,
      '사원명': item.empName,
      '배송관련 메모': item.deliveryMemo || ''
    }));

    const ws = (window as any).XLSX.utils.json_to_sheet(exportData);
    
    // 엑셀파일 셀 너비(폭) 여유있게 설정
    ws['!cols'] = [
      { wch: 15 }, // 계약일자
      { wch: 25 }, // 상품명
      { wch: 15 }, // 회원명
      { wch: 20 }, // 렌탈번호
      { wch: 12 }, // 배송현황
      { wch: 15 }, // 본부명
      { wch: 15 }, // 지사명
      { wch: 12 }, // 사원명
      { wch: 30 }  // 배송관련 메모
    ];

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
            className="w-full max-w-7xl h-full bg-slate-50 flex flex-col shadow-2xl"
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
                  <p className="text-sm text-slate-500 mt-1">상태가 '가입'이고 '배송대기'인 데이터 목록입니다.</p>
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
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                      <th 
                        className="p-3 font-bold cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-1"
                        onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                      >
                        계약일자 {sortOrder === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
                      </th>
                      <th className="p-3 font-bold">상품명</th>
                      <th className="p-3 font-bold">회원명</th>
                      <th className="p-3 font-bold">렌탈번호</th>
                      <th className="p-3 font-bold">렌탈상품명</th>
                      <th className="p-3 font-bold">배송현황</th>
                      <th className="p-3 font-bold">본부명</th>
                      <th className="p-3 font-bold">사원명</th>
                      <th className="p-3 font-bold">배송관련 메모</th>
                      <th className="p-3 font-bold text-center">저장</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[12px]">
                    {paginatedData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-400">조회된 데이터가 없습니다.</td>
                      </tr>
                    ) : (
                      paginatedData.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-mono text-slate-600">{item.contractDate}</td>
                          <td className="p-3 font-bold text-slate-800">{item.prodName}</td>
                          <td className="p-3 font-medium text-slate-700">{item.memName}</td>
                          <td className="p-3 font-mono text-blue-600 font-bold">{item.rentalNo}</td>
                          <td className="p-3 font-medium text-slate-800 max-w-[200px] truncate" title={item.rentalProd}>{item.rentalProd}</td>
                          <td className="p-3">
                            <span className="px-2 py-1 bg-orange-50 text-orange-600 font-bold rounded border border-orange-100 text-[11px]">
                              {item.deliveryStatus}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">{item.hq}</td>
                          <td className="p-3 text-slate-600">{item.empName}</td>
                          <td className="p-2">
                            <input
                              type="text"
                              id={`delivery-memo-${item.uniqueKey}`}
                              defaultValue={item.deliveryMemo}
                              placeholder="YYYY-MM-DD 등 기입"
                              className="w-full px-2 py-1.5 border border-slate-200 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[12px]"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => {
                                const inputElement = document.getElementById(`delivery-memo-${item.uniqueKey}`) as HTMLInputElement;
                                if (inputElement) {
                                  onUpdateDeliveryMemo(item.originalRowIdx, inputElement.value);
                                  // 업데이트 후 입력창 시각적 피드백 제공 (Optional)
                                  inputElement.classList.add('bg-green-50');
                                  setTimeout(() => inputElement.classList.remove('bg-green-50'), 1000);
                                }
                              }}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded font-bold transition-colors"
                            >
                              저장
                            </button>
                          </td>
                        </tr>
                      ))
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

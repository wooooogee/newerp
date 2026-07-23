import React, { useState, useMemo } from 'react';
import { X, Search, Download, ChevronLeft, ChevronRight, Truck, AlertCircle, Plus, ArrowLeft, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ERPDataItem {
  uniqueKey: string;
  originalRowIdx: number;
  contractDate: string; 
  memNo: string;        
  memName: string;      
  resNo: string;        
  phone: string;        
  prodName: string;     
  rentalProd: string;   
  rentalNo: string;     
  deliveryStatus: string; 
  deliveryDate: string;   
  payDate: string;        
  hq: string;             
  branch: string;         
  empName: string;        
  status: string;         
  raw: any[];
}

interface DashboardDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ERPDataItem[];
  type: 'delivery' | 'cancel' | null;
  month: string;
  mode: '구좌수' | '상품개수';
  onUpdateCell: (rowIdx: number, colIdx: number, newValue: string) => Promise<void> | void;
  onBatchUpdateCells: (updates: { rowIdx: number, colIdx: number, newValue: string }[]) => Promise<void> | void;
}

export const DashboardDetailModal: React.FC<DashboardDetailModalProps> = ({
  isOpen,
  onClose,
  data,
  type,
  month,
  mode,
  onUpdateCell,
  onBatchUpdateCells,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 전체 기간 보기 토글 상태
  const [viewAllMonths, setViewAllMonths] = useState(false);

  // 신규 취소/해약 등록 모드 관련 상태
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContracts, setSelectedContracts] = useState<ERPDataItem[]>([]);
  const [newStatus, setNewStatus] = useState('취소');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 검색어 변경이나 모드 변경 시 페이지네이션 초기화
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, mode]);

  // 타입/달 변경 및 모달 개폐 시 상태 리셋
  React.useEffect(() => {
    setCurrentPage(1);
    setIsRegisterMode(false);
    setSelectedContracts([]);
    setSearchQuery('');
    setViewAllMonths(false);
  }, [type, month, isOpen]);

  // 가입 상태인 계약건들
  const activeContracts = useMemo(() => {
    return data.filter(d => d.status === '가입');
  }, [data]);

  // 가입 상태 계약 조회 결과
  const searchedActiveContracts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return activeContracts.filter(item => {
      const name = item.memName ? item.memName.toLowerCase() : '';
      const memNo = item.memNo ? item.memNo.toLowerCase() : '';
      const rentalNo = item.rentalNo ? item.rentalNo.toLowerCase() : '';
      return name.includes(q) || memNo.includes(q) || rentalNo.includes(q);
    }).slice(0, 20); // 다중선택을 감안해 목록 제한을 20개로 완화
  }, [activeContracts, searchQuery]);

  // 다중선택 토글 함수
  const toggleSelectContract = (contract: ERPDataItem) => {
    setSelectedContracts(prev => {
      const exists = prev.some(c => c.uniqueKey === contract.uniqueKey);
      if (exists) {
        return prev.filter(c => c.uniqueKey !== contract.uniqueKey);
      } else {
        return [...prev, contract];
      }
    });
  };

  // 검색 결과 전체 선택/해제 토글
  const isAllSearchedSelected = useMemo(() => {
    if (searchedActiveContracts.length === 0) return false;
    return searchedActiveContracts.every(item => 
      selectedContracts.some(c => c.uniqueKey === item.uniqueKey)
    );
  }, [searchedActiveContracts, selectedContracts]);

  const handleToggleSelectAllSearched = () => {
    if (isAllSearchedSelected) {
      // 이미 모두 선택되어 있으면 해제
      setSelectedContracts(prev => 
        prev.filter(c => !searchedActiveContracts.some(item => item.uniqueKey === c.uniqueKey))
      );
    } else {
      // 모두 선택
      setSelectedContracts(prev => {
        const newItems = searchedActiveContracts.filter(item => 
          !prev.some(c => c.uniqueKey === item.uniqueKey)
        );
        return [...prev, ...newItems];
      });
    }
  };

  // 등록 제출 (일괄 업데이트)
  const handleSubmit = async () => {
    if (selectedContracts.length === 0) return;
    setIsSubmitting(true);
    try {
      // 구글시트 B열 (status, 인덱스 1) 일괄 업데이트 데이터 생성
      const updates = selectedContracts.map(c => ({
        rowIdx: c.originalRowIdx,
        colIdx: 1, // B열 (status)
        newValue: newStatus,
      }));

      // 일괄 처리 API 호출
      await onBatchUpdateCells(updates);
      
      alert(`[성공] 선택한 ${selectedContracts.length}개 계약의 상태가 '${newStatus}'(으)로 일괄 변경되었습니다.`);
      
      // 상태 리셋 및 복귀
      setSelectedContracts([]);
      setSearchQuery('');
      setIsRegisterMode(false);
    } catch (err) {
      console.error(err);
      alert('상태 변경 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 해당 타입 및 조건에 맞는 데이터 필터링 (목록용)
  const filteredData = useMemo(() => {
    if (!type) return [];

    let temp = data.filter(d => {
      const contractDateStr = d.contractDate ? d.contractDate.replace(/\./g, '-').substring(0, 7) : '';
      const deliveryDateStr = d.deliveryDate ? d.deliveryDate.replace(/\./g, '-').substring(0, 7) : '';

      if (type === 'delivery') {
        // 배송완료 조건: 전체 기간 보기 활성화 시 날짜 필터 무시
        if (viewAllMonths) {
          return d.deliveryStatus === '배송완료';
        }
        return d.deliveryStatus === '배송완료' && deliveryDateStr === month;
      } else {
        // 취소/해약 조건: 전체 기간 보기 활성화 시 날짜 필터 무시
        const isCancelled = d.status.includes('취소') || d.status.includes('해약') || d.deliveryStatus.includes('취소') || d.deliveryStatus.includes('반품');
        if (viewAllMonths) {
          return isCancelled;
        }
        return contractDateStr === month && isCancelled;
      }
    });

    // 렌탈번호 기준으로 그룹핑하여 데이터 병합 (모드에 상관없이 항상 중복 렌탈번호 묶기 적용)
    const groups = new Map<string, ERPDataItem[]>();
    const nonRentalItems: ERPDataItem[] = [];

    temp.forEach(d => {
      if (d.rentalNo) {
        if (!groups.has(d.rentalNo)) {
          groups.set(d.rentalNo, []);
        }
        groups.get(d.rentalNo)!.push(d);
      } else {
        nonRentalItems.push(d);
      }
    });

    const groupedItems: ERPDataItem[] = [];
    groups.forEach((items, rentalNo) => {
      if (items.length === 1) {
        groupedItems.push(items[0]);
      } else {
        // 중복되는 경우 회원번호와 회원명 묶어서 콤마로 표시
        const mergedMemNos = Array.from(new Set(items.map(i => i.memNo).filter(Boolean))).sort().join(', ');
        const mergedMemNames = Array.from(new Set(items.map(i => i.memName).filter(Boolean))).sort().join(', ');
        const mergedRentalProds = Array.from(new Set(items.map(i => i.rentalProd).filter(Boolean))).sort().join(', ');
        const mergedProdNames = Array.from(new Set(items.map(i => i.prodName).filter(Boolean))).sort().join(', ');
        
        groupedItems.push({
          ...items[0],
          memNo: mergedMemNos,
          memName: mergedMemNames,
          rentalProd: mergedRentalProds,
          prodName: mergedProdNames,
        });
      }
    });

    temp = [...groupedItems, ...nonRentalItems];

    // 검색어 필터링
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      temp = temp.filter(item => {
        const name = item.memName ? item.memName.toLowerCase() : '';
        const rentalNo = item.rentalNo ? item.rentalNo.toLowerCase() : '';
        const hq = item.hq ? item.hq.toLowerCase() : '';
        const prod = item.prodName ? item.prodName.toLowerCase() : '';
        const rentalProd = item.rentalProd ? item.rentalProd.toLowerCase() : '';
        const empName = item.empName ? item.empName.toLowerCase() : '';
        return (
          name.includes(term) ||
          rentalNo.includes(term) ||
          hq.includes(term) ||
          prod.includes(term) ||
          rentalProd.includes(term) ||
          empName.includes(term)
        );
      });
    }

    // 계약일 기준 정렬
    return temp.sort((a, b) => b.contractDate.localeCompare(a.contractDate));
  }, [data, type, month, mode, searchTerm, viewAllMonths]);

  // 페이지네이션 처리
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  const handleExportExcel = () => {
    const XLSX = (window as any).XLSX;
    if (!XLSX) {
      alert('엑셀 라이브러리가 로드되지 않았습니다.');
      return;
    }

    const titleText = type === 'delivery' ? '배송완료' : '취소및해약';
    const exportData = filteredData.map((item, index) => {
      if (type === 'delivery') {
        return {
          '순번': index + 1,
          '계약일자': item.contractDate,
          '배송일자': item.deliveryDate || '',
          '회원번호': item.memNo || '',
          '회원명': item.memName || '',
          '렌탈번호': item.rentalNo || '',
          '상품명': item.prodName || '',
          '제품명': item.rentalProd || '',
          '본부': item.hq || '',
          '사원명': item.empName || '',
          '계약상태': item.status || '',
          '배송상태': item.deliveryStatus || '',
        };
      } else {
        // 취소/해약인 경우 순번 -> 계약상태 -> 계약일자 순으로 배치 및 배송상태 제외
        return {
          '순번': index + 1,
          '계약상태': item.status || '',
          '계약일자': item.contractDate,
          '회원번호': item.memNo || '',
          '회원명': item.memName || '',
          '렌탈번호': item.rentalNo || '',
          '상품명': item.prodName || '',
          '제품명': item.rentalProd || '',
          '본부': item.hq || '',
          '사원명': item.empName || '',
        };
      }
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // 열 폭 조정
    if (type === 'delivery') {
      ws['!cols'] = [
        { wch: 6 },  // 순번
        { wch: 15 }, // 계약일자
        { wch: 15 }, // 배송일자
        { wch: 15 }, // 회원번호
        { wch: 12 }, // 회원명
        { wch: 20 }, // 렌탈번호
        { wch: 25 }, // 상품명
        { wch: 25 }, // 제품명
        { wch: 15 }, // 본부
        { wch: 12 }, // 사원명
        { wch: 12 }, // 계약상태
        { wch: 12 }, // 배송상태
      ];
    } else {
      ws['!cols'] = [
        { wch: 6 },  // 순번
        { wch: 12 }, // 계약상태
        { wch: 15 }, // 계약일자
        { wch: 25 }, // 회원번호 (묶일 경우 대비 폭 확장)
        { wch: 18 }, // 회원명 (묶일 경우 대비 폭 확장)
        { wch: 20 }, // 렌탈번호
        { wch: 25 }, // 상품명
        { wch: 25 }, // 제품명
        { wch: 15 }, // 본부
        { wch: 12 }, // 사원명
      ];
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, titleText);
    const timePrefix = viewAllMonths ? '전체기간' : month;
    XLSX.writeFile(wb, `${timePrefix}_상세내역_${titleText}_${new Date().getTime()}.xlsx`);
  };

  if (!isOpen || !type) return null;

  const isDelivery = type === 'delivery';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-7xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* 헤더 */}
          <div className={`px-6 py-4 flex items-center justify-between text-white ${isDelivery ? 'bg-sky-600' : 'bg-rose-600'}`}>
            <div className="flex items-center gap-2">
              {isRegisterMode ? (
                <button 
                  onClick={() => {
                    setIsRegisterMode(false);
                    setSelectedContracts([]);
                    setSearchQuery('');
                  }}
                  className="mr-2 p-1 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-1 text-xs"
                >
                  <ArrowLeft size={16} /> 목록으로
                </button>
              ) : isDelivery ? (
                <Truck size={20} />
              ) : (
                <AlertCircle size={20} />
              )}
              <h2 className="text-lg font-bold">
                {isRegisterMode 
                  ? `[일괄 등록] 취소 및 해약 신청`
                  : `[${viewAllMonths ? '전체 기간' : month}] ${isDelivery ? '배송완료' : '취소 및 해약'} 상세 내역 (${mode} 기준)`
                }
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* 메인 콘텐츠 영역 */}
          {isRegisterMode ? (
            /* ========================================================
               [신규 취소 및 해약 일괄 등록 양식 폼 UI]
               ======================================================== */
            <div className="p-6 overflow-y-auto flex-1 flex flex-col md:flex-row gap-6 bg-slate-50/50">
              {/* 왼쪽: 가입 상태 회원 다중 검색부 */}
              <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col min-h-[380px]">
                <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <Search size={16} className="text-rose-500" /> 대상 회원 검색 (다중선택)
                  </h3>
                  
                  {/* 전체 선택 토글 버튼 */}
                  {searchedActiveContracts.length > 0 && (
                    <button
                      onClick={handleToggleSelectAllSearched}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/70 px-2.5 py-1 rounded-md transition-colors"
                    >
                      {isAllSearchedSelected ? '검색결과 전체 해제' : '검색결과 전체 선택'}
                    </button>
                  )}
                </div>

                <div className="relative mb-3">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="회원명, 회원번호, 렌탈번호 검색 ('가입' 상태 대상)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[320px] custom-scrollbar">
                  {searchQuery.trim() === '' ? (
                    <div className="text-xs text-slate-400 text-center py-12">
                      회원명, 회원번호 또는 렌탈번호를 입력하여 검색해 주세요.
                    </div>
                  ) : searchedActiveContracts.length > 0 ? (
                    searchedActiveContracts.map((item) => {
                      const isSelected = selectedContracts.some(c => c.uniqueKey === item.uniqueKey);
                      return (
                        <div
                          key={item.uniqueKey}
                          onClick={() => toggleSelectContract(item)}
                          className={`p-3 border rounded-lg cursor-pointer transition-all flex items-center gap-3 ${
                            isSelected
                              ? 'border-rose-500 bg-rose-50/20'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                          }`}
                        >
                          {/* 체크박스 */}
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected ? 'bg-rose-600 border-rose-600 text-white' : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <Check size={10} strokeWidth={4} />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-bold text-slate-800 text-xs">{item.memName}</span>
                              <span className="text-[10px] font-semibold text-slate-400 shrink-0">계약일: {item.contractDate}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 space-y-0.5">
                              <div>회원번호: <span className="font-medium text-slate-700">{item.memNo}</span></div>
                              <div>렌탈번호: <span className="font-medium text-slate-700">{item.rentalNo || '-'}</span></div>
                              <div className="truncate">상품명: <span className="font-medium text-slate-700">{item.prodName}</span></div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-xs text-slate-400 text-center py-12">
                      일치하는 '가입' 상태의 계약 건이 없습니다.
                    </div>
                  )}
                </div>
              </div>

              {/* 오른쪽: 취소 및 해약 일괄 처리 양식 */}
              <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col">
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <AlertCircle size={16} className="text-rose-500" /> 취소 및 해약 신청 양식
                </h3>

                {selectedContracts.length > 0 ? (
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="space-y-4">
                      {/* 선택된 회원 요약 리스트 */}
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="flex justify-between items-center text-[11px] font-bold text-slate-500 mb-2">
                          <span>선택 회원 정보 (총 {selectedContracts.length}명)</span>
                          <button 
                            onClick={() => setSelectedContracts([])}
                            className="text-slate-400 hover:text-slate-600 text-[10px] font-normal underline"
                          >
                            전체 선택 해제
                          </button>
                        </div>
                        
                        {/* 칩 리스트 */}
                        <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
                          {selectedContracts.map(c => (
                            <div 
                              key={c.uniqueKey}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded text-[10px] font-medium"
                            >
                              <span>{c.memName}({c.memNo.substring(c.memNo.length - 6)})</span>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelectContract(c);
                                }}
                                className="text-rose-400 hover:text-rose-600 p-0.5"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 입력 폼 */}
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">변경할 계약상태</label>
                          <select
                            value={newStatus}
                            onChange={(e) => setNewStatus(e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white font-medium"
                          >
                            <option value="취소">취소</option>
                            <option value="해약">해약</option>
                          </select>
                          <p className="text-[10px] text-slate-400 mt-1">
                            * 상태를 변경하면 구글 스프레드시트의 '관리대장' 시트 B열 값이 일괄 변경됩니다.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 등록 액션 */}
                    <div className="mt-6">
                      <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-bold rounded-lg shadow-sm text-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Check size={14} />
                        {isSubmitting ? '저장 중...' : `선택된 ${selectedContracts.length}명 일괄 등록 완료`}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-100 rounded-xl p-8">
                    <div className="text-center text-xs text-slate-400">
                      왼쪽에서 취소 및 해약 처리할 대상 회원을<br/>
                      검색하여 한 명 이상 선택해 주세요.
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ========================================================
               [기존 목록 리스트 조회 UI]
               ======================================================== */
            <>
              {/* 필터 및 검색어 영역 */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-slate-600">
                    총 <span className={isDelivery ? 'text-sky-600 font-bold' : 'text-rose-600 font-bold'}>{filteredData.length}</span> 건
                  </span>

                  {/* 전체 기간 보기 토글 체크박스 */}
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-slate-500 select-none hover:text-slate-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={viewAllMonths}
                      onChange={(e) => setViewAllMonths(e.target.checked)}
                      className={`w-3.5 h-3.5 rounded border-slate-300 transition-colors focus:ring-offset-0 ${
                        isDelivery 
                          ? 'text-sky-600 focus:ring-sky-500' 
                          : 'text-rose-600 focus:ring-rose-500'
                      }`}
                    />
                    전체 기간 보기
                  </label>
                </div>

                <div className="flex w-full sm:w-auto items-center gap-2">
                  <div className="relative flex-1 sm:w-64">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="회원명, 렌탈번호, 본부, 상품명/제품명 검색"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                    />
                  </div>
                  
                  {/* 취소/해약인 경우 등록하기 버튼 노출 */}
                  {!isDelivery && (
                    <button
                      onClick={() => setIsRegisterMode(true)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors shrink-0"
                    >
                      <Plus size={15} />
                      취소 및 해약하기
                    </button>
                  )}

                  <button
                    onClick={handleExportExcel}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors shrink-0"
                  >
                    <Download size={15} />
                    엑셀 다운로드
                  </button>
                </div>
              </div>

              {/* 테이블 영역 */}
              <div className="flex-1 overflow-x-auto min-h-[300px]">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="px-3 py-2 text-center">순번</th>
                      {!isDelivery && <th className="px-3 py-2 text-center">계약상태</th>}
                      <th className="px-3 py-2">계약일자</th>
                      {isDelivery && <th className="px-3 py-2">배송일자</th>}
                      <th className="px-3 py-2">회원번호</th>
                      <th className="px-3 py-2">회원명</th>
                      <th className="px-3 py-2">렌탈번호</th>
                      <th className="px-3 py-2">상품명</th>
                      <th className="px-3 py-2">제품명</th>
                      <th className="px-3 py-2">본부</th>
                      <th className="px-3 py-2">사원명</th>
                      {isDelivery && <th className="px-3 py-2 text-center">계약상태</th>}
                      {isDelivery && <th className="px-3 py-2 text-center">배송상태</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedData.length > 0 ? (
                      paginatedData.map((item, idx) => {
                        const globalIdx = (currentPage - 1) * itemsPerPage + idx + 1;
                        return (
                          <tr key={item.uniqueKey} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-3 py-1.5 text-center text-slate-400 font-medium">{globalIdx}</td>
                            {!isDelivery && (
                              <td className="px-3 py-1.5 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  item.status.includes('취소') || item.status.includes('해약')
                                    ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                    : 'bg-green-50 text-green-600 border border-green-100'
                                }`}>
                                  {item.status}
                                </span>
                              </td>
                            )}
                            <td className="px-3 py-1.5 font-medium text-slate-600">{item.contractDate}</td>
                            {isDelivery && <td className="px-3 py-1.5 font-medium text-sky-600">{item.deliveryDate || '-'}</td>}
                            <td className="px-3 py-1.5 text-slate-500 max-w-[150px] break-all">{item.memNo}</td>
                            <td className="px-3 py-1.5 font-bold text-slate-800 max-w-[120px] break-all">{item.memName}</td>
                            <td className="px-3 py-1.5 font-mono text-slate-600">{item.rentalNo || '-'}</td>
                            <td className="px-3 py-1.5 text-slate-700 font-medium max-w-[150px] truncate" title={item.prodName}>{item.prodName}</td>
                            <td className="px-3 py-1.5 text-slate-700 font-medium max-w-[150px] truncate" title={item.rentalProd}>{item.rentalProd || '-'}</td>
                            <td className="px-3 py-1.5 text-slate-600">{item.hq}</td>
                            <td className="px-3 py-1.5 text-slate-600">{item.empName}</td>
                            {isDelivery && (
                              <td className="px-3 py-1.5 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  item.status.includes('취소') || item.status.includes('해약')
                                    ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                    : 'bg-green-50 text-green-600 border border-green-100'
                                }`}>
                                  {item.status}
                                </span>
                              </td>
                            )}
                            {isDelivery && (
                              <td className="px-3 py-1.5 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  item.deliveryStatus === '배송완료'
                                    ? 'bg-sky-50 text-sky-600 border border-sky-100'
                                    : item.deliveryStatus.includes('취소') || item.deliveryStatus.includes('반품')
                                    ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                    : 'bg-slate-50 text-slate-600 border border-slate-100'
                                }`}>
                                  {item.deliveryStatus}
                                </span>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={isDelivery ? 12 : 10} className="px-3 py-12 text-center text-slate-400 font-semibold">
                          검색 조건에 맞는 내역이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* 페이지네이션 */}
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs text-slate-500">
                  {filteredData.length}건 중 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredData.length)} 표시
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages)
                    .map((p, idx, arr) => {
                      const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
                      return (
                        <React.Fragment key={p}>
                          {showEllipsis && <span className="px-1.5 text-slate-400">...</span>}
                          <button
                            onClick={() => setCurrentPage(p)}
                            className={`min-w-8 h-8 px-2 text-xs font-bold rounded-lg border transition-colors ${
                              currentPage === p
                                ? isDelivery
                                  ? 'bg-sky-600 border-sky-600 text-white shadow-sm'
                                  : 'bg-rose-600 border-rose-600 text-white shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      );
                    })}
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

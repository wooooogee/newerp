import React, { useState, useMemo } from 'react';
import { X, Calendar, Download, Search, Truck, CheckCircle2, Clock, BarChart3, ChevronRight, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { MultiSelectDropdown } from './MultiSelectDropdown';

interface ContractMonthDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[];
}

// 날짜 통일 포맷터 (YYYY-MM-DD)
const formatDate = (val: any): string => {
  if (!val) return '-';
  const s = String(val).trim();
  if (!s || s === '-' || s === 'null' || s === 'undefined') return '-';
  const m = s.match(/(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  const mDigits = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (mDigits) {
    return `${mDigits[1]}-${mDigits[2]}-${mDigits[3]}`;
  }
  return s;
};

export const ContractMonthDeliveryModal: React.FC<ContractMonthDeliveryModalProps> = ({
  isOpen,
  onClose,
  data
}) => {
  // 필터 상태
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // 'all' or 'YYYY-MM'
  const [viewFilter, setViewFilter] = useState<'completed' | 'all' | 'waiting'>('completed'); // 기본: 배송완료건만 보기
  const [productFilter, setProductFilter] = useState<string[]>([]);
  const [hqFilter, setHqFilter] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 1. 가입 상태인 기본 데이터 추출 (렌탈번호 기준 유니크 처리)
  const validData = useMemo(() => {
    const rawFiltered = (data || []).filter(item => item.status === '가입' && item.contractDate);
    
    const uniqueMap = new Map();
    rawFiltered.forEach(item => {
      const key = item.rentalNo || item.uniqueKey || `${item.memName}_${item.contractDate}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    });
    return Array.from(uniqueMap.values());
  }, [data]);

  // 2. 전체 계약월 목록 추출 (YYYY-MM 내림차순)
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    validData.forEach(item => {
      const m = item.contractDate?.match(/^(\d{4})[-./]?(\d{2})/);
      if (m) months.add(`${m[1]}-${m[2]}`);
    });
    return Array.from(months).sort().reverse();
  }, [validData]);

  // 3. 계약월별 코호트 배송 통계 계산
  const monthlyCohortStats = useMemo(() => {
    return availableMonths.map(month => {
      const monthOrders = validData.filter(item => {
        const m = item.contractDate?.match(/^(\d{4})[-./]?(\d{2})/);
        return m ? `${m[1]}-${m[2]}` === month : false;
      });

      const total = monthOrders.length;
      const completed = monthOrders.filter(item => 
        item.deliveryStatus === '배송완료' || (item.deliveryStatus && item.deliveryStatus.includes('배송완료'))
      ).length;
      const waiting = monthOrders.filter(item => item.deliveryStatus === '배송대기').length;
      const rate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';

      return {
        month,
        total,
        completed,
        waiting,
        rate: parseFloat(rate)
      };
    });
  }, [validData, availableMonths]);

  // 전체 통계
  const overallStats = useMemo(() => {
    const total = validData.length;
    const completed = validData.filter(item => 
      item.deliveryStatus === '배송완료' || (item.deliveryStatus && item.deliveryStatus.includes('배송완료'))
    ).length;
    const waiting = validData.filter(item => item.deliveryStatus === '배송대기').length;
    const rate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';
    return { total, completed, waiting, rate };
  }, [validData]);

  // 고유 옵션
  const uniqueProducts = useMemo(() => {
    return Array.from(new Set(validData.map(item => item.prodName).filter(Boolean))).sort();
  }, [validData]);

  const uniqueHqs = useMemo(() => {
    return Array.from(new Set(validData.map(item => item.hq).filter(Boolean))).sort();
  }, [validData]);

  // 4. 최종 필터링된 상세 목록
  const filteredList = useMemo(() => {
    return validData.filter(item => {
      // 1) 계약월 필터
      if (selectedMonth !== 'all') {
        const m = item.contractDate?.match(/^(\d{4})[-./]?(\d{2})/);
        const itemMonth = m ? `${m[1]}-${m[2]}` : '';
        if (itemMonth !== selectedMonth) return false;
      }

      // 2) 배송 상태 필터 (completed: 배송완료, waiting: 배송대기, all: 전체)
      const isComplete = item.deliveryStatus === '배송완료' || (item.deliveryStatus && item.deliveryStatus.includes('배송완료'));
      if (viewFilter === 'completed' && !isComplete) return false;
      if (viewFilter === 'waiting' && item.deliveryStatus !== '배송대기') return false;

      // 3) 상품 / 본부 다중 선택 필터
      if (productFilter.length > 0 && !productFilter.includes(item.prodName)) return false;
      if (hqFilter.length > 0 && !hqFilter.includes(item.hq)) return false;

      // 4) 검색어 필터
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const searchTarget = `${item.memName || ''} ${item.rentalNo || ''} ${item.empName || ''} ${item.rentalProd || ''} ${item.prodName || ''} ${item.branch || ''}`.toLowerCase();
        if (!searchTarget.includes(term)) return false;
      }

      return true;
    }).sort((a, b) => {
      // 계약일자 내림차순 정렬
      return String(b.contractDate || '').localeCompare(String(a.contractDate || ''));
    });
  }, [validData, selectedMonth, viewFilter, productFilter, hqFilter, searchTerm]);

  // 엑셀 다운로드
  const handleDownloadExcel = () => {
    const rows = filteredList.map((item, index) => {
      const m = item.contractDate?.match(/^(\d{4})[-./]?(\d{2})/);
      const contractMonth = m ? `${m[1]}-${m[2]}` : '';
      const deliveryCompleteDate = formatDate(item.deliveryDate || (item.raw && item.raw[13]));

      return {
        '순번': index + 1,
        '계약월': contractMonth,
        '계약일자': formatDate(item.contractDate),
        '계약번호': item.rentalNo || '-',
        '고객명': item.memName || '-',
        '본부': item.hq || '-',
        '지사': item.branch || '-',
        '영업사원': item.empName || '-',
        '가입상품명': item.prodName || '-',
        '렌탈상품(배송제품)': item.rentalProd || '-',
        '배송상태': item.deliveryStatus || '배송대기',
        '배송완료일자': deliveryCompleteDate,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '계약월별_배송완료내역');
    const filename = `계약월별_배송완료_${selectedMonth === 'all' ? '전체' : selectedMonth}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-[96vw] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 h-[94vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Truck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">계약월별 배송완료 현황</h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  코호트 배송 추적
                </span>
              </div>
              <p className="text-xs text-slate-500">
                계약이 체결된 '계약월'을 기준으로 실제 배송완료된 건수와 완료율을 누적 집계하여 상세내용과 함께 표시합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Download size={14} />
              <span>엑셀 다운로드 ({filteredList.length}건)</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Sub-Header: 계약월별 요약 카드 슬라이더 / 그리드 */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BarChart3 size={15} className="text-emerald-600" />
              <span className="text-xs font-bold text-slate-800">계약월별 배송완료 진행률 (클릭 시 해당 월 상세 조회)</span>
            </div>
            <div className="text-xs text-slate-500">
              전체 누적: 계약 <strong className="text-slate-900 font-mono font-bold">{overallStats.total}</strong>건 중{' '}
              배송완료 <strong className="text-emerald-600 font-mono font-bold">{overallStats.completed}</strong>건{' '}
              <span className="text-slate-400 font-normal">({overallStats.rate}%)</span>
            </div>
          </div>

          {/* 월별 요약 카드 리스트 */}
          <div className="flex gap-2.5 overflow-x-auto pb-1.5 custom-scrollbar">
            {/* 전체 버튼 카드 */}
            <button
              onClick={() => setSelectedMonth('all')}
              className={`px-3.5 py-2.5 rounded-xl border text-left shrink-0 transition-all cursor-pointer min-w-[130px] ${
                selectedMonth === 'all'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span>전체 계약월</span>
                {selectedMonth === 'all' && <CheckCircle2 size={13} />}
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className={`text-base font-extrabold font-mono ${selectedMonth === 'all' ? 'text-white' : 'text-slate-900'}`}>
                  {overallStats.completed}
                  <span className="text-xs font-normal opacity-80">/{overallStats.total}건</span>
                </span>
                <span className={`text-xs font-bold ${selectedMonth === 'all' ? 'text-emerald-100' : 'text-emerald-600'}`}>
                  {overallStats.rate}%
                </span>
              </div>
            </button>

            {/* 각 계약월 카드 */}
            {monthlyCohortStats.map((stat) => {
              const isSelected = selectedMonth === stat.month;
              return (
                <button
                  key={stat.month}
                  onClick={() => setSelectedMonth(stat.month)}
                  className={`px-3.5 py-2.5 rounded-xl border text-left shrink-0 transition-all cursor-pointer min-w-[145px] ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span>{stat.month} 계약</span>
                    {isSelected && <CheckCircle2 size={13} />}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-1.5">
                    <span className={`text-base font-extrabold font-mono ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {stat.completed}
                      <span className="text-xs font-normal opacity-80">/{stat.total}건</span>
                    </span>
                    <span className={`text-xs font-bold ${isSelected ? 'text-emerald-100' : 'text-emerald-600'}`}>
                      {stat.rate}%
                    </span>
                  </div>
                  {/* 미니 프로그레스 바 */}
                  <div className={`mt-1.5 w-full h-1.5 rounded-full overflow-hidden ${isSelected ? 'bg-emerald-800' : 'bg-slate-100'}`}>
                    <div
                      className={`h-full rounded-full transition-all ${isSelected ? 'bg-white' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(stat.rate, 100)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* 상태 필터 세그먼트 (전체 / 배송완료 / 배송대기) */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewFilter('all')}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewFilter === 'all'
                    ? 'bg-slate-800 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                전체
              </button>
              <button
                type="button"
                onClick={() => setViewFilter('completed')}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewFilter === 'completed'
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckCircle2 size={13} />
                <span>배송완료</span>
              </button>
              <button
                type="button"
                onClick={() => setViewFilter('waiting')}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewFilter === 'waiting'
                    ? 'bg-amber-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock size={13} />
                <span>배송대기</span>
              </button>
            </div>

            {/* 상품 필터 */}
            <MultiSelectDropdown
              label="상품"
              options={uniqueProducts}
              selectedOptions={productFilter}
              onChange={setProductFilter}
            />

            {/* 본부 필터 */}
            <MultiSelectDropdown
              label="본부"
              options={uniqueHqs}
              selectedOptions={hqFilter}
              onChange={setHqFilter}
            />
          </div>

          {/* 검색창 */}
          <div className="relative w-64">
            <input
              type="text"
              placeholder="고객명, 계약번호, 사원명 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-2xs"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          </div>
        </div>

        {/* Table Content Area */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-100/80 sticky top-0 z-20 text-slate-600 font-bold border-b border-slate-200 shadow-2xs backdrop-blur-xs">
              <tr>
                <th className="py-3 px-3 text-center w-12 shrink-0">No</th>
                <th className="py-3 px-3 text-center w-28 shrink-0">계약일자</th>
                <th className="py-3 px-3 text-center w-28 shrink-0">계약번호</th>
                <th className="py-3 px-3 w-28 shrink-0">고객명</th>
                <th className="py-3 px-3 min-w-[180px] max-w-[280px]">가입상품명</th>
                <th className="py-3 px-3 min-w-[240px]">렌탈상품 (배송제품)</th>
                <th className="py-3 px-3 w-32 shrink-0">본부 / 지사</th>
                <th className="py-3 px-3 w-24 shrink-0">영업사원</th>
                <th className="py-3 px-3 text-center w-24 shrink-0">배송상태</th>
                <th className="py-3 px-3 text-center w-28 shrink-0 bg-emerald-50/60 text-emerald-900 border-l border-emerald-100">
                  배송완료일
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredList.length > 0 ? (
                filteredList.map((item, index) => {
                  const deliveryDateStr = formatDate(item.deliveryDate || (item.raw && item.raw[13]));
                  const isCompleted = item.deliveryStatus === '배송완료' || (item.deliveryStatus && item.deliveryStatus.includes('배송완료'));

                  return (
                    <tr key={item.uniqueKey || index} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400">{index + 1}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                        {formatDate(item.contractDate)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-800">
                        {item.rentalNo ? (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(item.rentalNo, item.uniqueKey)}
                            className="inline-flex items-center gap-1 hover:text-emerald-600 transition-colors cursor-pointer group"
                            title="클릭하여 계약번호 복사"
                          >
                            <span>{item.rentalNo}</span>
                            {copiedKey === item.uniqueKey ? (
                              <Check size={11} className="text-emerald-600" />
                            ) : (
                              <Copy size={11} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{item.memName || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-700 truncate max-w-[280px]" title={item.prodName}>
                        {item.prodName || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 font-medium whitespace-nowrap" title={item.rentalProd}>
                        {item.rentalProd || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        <span className="font-semibold text-slate-800">{item.hq || '-'}</span>
                        {item.branch && (
                          <span className="text-[11px] text-slate-400 ml-1.5">({item.branch})</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">{item.empName || '-'}</td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${
                            isCompleted
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {item.deliveryStatus || '배송대기'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-700 bg-emerald-50/20 border-l border-emerald-100 whitespace-nowrap">
                        {isCompleted ? deliveryDateStr : '-'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-400 italic">
                    선택한 조건에 부합하는 배송 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div>
            조회된 결과: <strong className="text-slate-900 font-bold">{filteredList.length}</strong>건{' '}
            (선택 계약월: <strong className="text-emerald-700 font-bold">{selectedMonth === 'all' ? '전체 기간' : `${selectedMonth} 계약`}</strong>)
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-all cursor-pointer shadow-xs"
          >
            닫기
          </button>
        </div>
      </motion.div>
    </div>
  );
};

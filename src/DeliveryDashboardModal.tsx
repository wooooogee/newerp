import React, { useMemo, useState } from 'react';
import { X, BarChart3, TrendingUp, Clock, CalendarDays, Search, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { MultiSelectDropdown } from './MultiSelectDropdown';

interface DeliveryDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[];
}

export const DeliveryDashboardModal: React.FC<DeliveryDashboardModalProps> = ({ isOpen, onClose, data }) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // 'all' or 'YYYY-MM'
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState<string[]>([]);

  // 가입 상태인 데이터만 필터링
  const validData = useMemo(() => {
    return data.filter(item => item.status === '가입');
  }, [data]);

  // 계약일자 월 목록 추출 (YYYY-MM)
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    validData.forEach(item => {
      if (item.contractDate) {
        const m = item.contractDate.match(/^(\d{4})[-./]?(\d{2})/);
        if (m) months.add(`${m[1]}-${m[2]}`);
      }
    });
    return Array.from(months).sort().reverse();
  }, [validData]);

  // 상품명 목록 추출
  const uniqueProducts = useMemo(() => {
    return Array.from(new Set(validData.map(item => item.prodName).filter(Boolean))).sort();
  }, [validData]);

  // 배송 소요일 통계 (렌탈상품별)
  const deliveryDaysStats = useMemo(() => {
    const stats: Record<string, { totalDays: number; count: number }> = {};

    validData.forEach(item => {
      // 선택된 월 필터링
      if (selectedMonth !== 'all') {
        const m = item.contractDate?.match(/^(\d{4})[-./]?(\d{2})/);
        const itemMonth = m ? `${m[1]}-${m[2]}` : '';
        if (itemMonth !== selectedMonth) return;
      }

      const prod = item.rentalProd || '알 수 없음';
      
      // 상품명(prodName) 필터링
      if (productFilter.length > 0 && !productFilter.includes(item.prodName)) return;

      // 검색어 필터링
      if (searchTerm && !prod.toLowerCase().includes(searchTerm.toLowerCase())) return;

      const parseDate = (dStr: any) => {
        if (!dStr) return new Date(NaN);
        const s = String(dStr).trim().replace(/\./g, '-');
        return new Date(s);
      };

      const cDate = parseDate(item.contractDate);
      const dDate = parseDate(item.deliveryDate);

      // 날짜가 모두 유효한 경우에만 계산
      if (!isNaN(cDate.getTime()) && !isNaN(dDate.getTime()) && item.deliveryDate) {
        if (!stats[prod]) {
          stats[prod] = { totalDays: 0, count: 0 };
        }
        const diffTime = dDate.getTime() - cDate.getTime();
        const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

        stats[prod].totalDays += diffDays;
        stats[prod].count += 1;
      }
    });

    const result = Object.entries(stats)
      .filter(([_, data]) => data.count > 0) // 0건 미노출
      .map(([prod, data]) => ({
        product: prod,
        avgDays: (data.totalDays / data.count).toFixed(1),
        count: data.count
      }));

    // 소요일이 짧은 순서대로 정렬 (오름차순)
    return result.sort((a, b) => parseFloat(a.avgDays) - parseFloat(b.avgDays));
  }, [validData, selectedMonth, searchTerm, productFilter]);

  // 판매량 통계 (렌탈상품별)
  const salesStats = useMemo(() => {
    const stats: Record<string, number> = {};

    validData.forEach(item => {
      if (selectedMonth !== 'all') {
        const m = item.contractDate?.match(/^(\d{4})[-./]?(\d{2})/);
        const itemMonth = m ? `${m[1]}-${m[2]}` : '';
        if (itemMonth !== selectedMonth) return;
      }

      const prod = item.rentalProd || '알 수 없음';

      // 상품명(prodName) 필터링
      if (productFilter.length > 0 && !productFilter.includes(item.prodName)) return;

      // 검색어 필터링
      if (searchTerm && !prod.toLowerCase().includes(searchTerm.toLowerCase())) return;

      stats[prod] = (stats[prod] || 0) + 1;
    });

    const result = Object.entries(stats)
      .filter(([_, count]) => count > 0) // 0건 미노출
      .map(([prod, count]) => ({
        product: prod,
        count
      }));

    // 판매량이 많은 순서대로 정렬
    return result.sort((a, b) => b.count - a.count);
  }, [validData, selectedMonth, searchTerm, productFilter]);

  // 가장 큰 값을 찾아서 그래프 바 길이에 활용
  const maxAvgDays = Math.max(...deliveryDaysStats.map(s => parseFloat(s.avgDays)), 1);
  const maxSales = Math.max(...salesStats.map(s => s.count), 1);

  // 엑셀 다운로드 기능
  const handleExportExcel = () => {
    // 1. 누적 판매량 순위 시트
    const salesSheetData = salesStats.map((item, idx) => ({
      '순위': idx + 1,
      '렌탈상품명': item.product,
      '누적 판매량(건)': item.count,
    }));

    // 2. 평균 배송 소요일 시트
    const deliverySheetData = deliveryDaysStats.map((item, idx) => ({
      '순위': idx + 1,
      '렌탈상품명': item.product,
      '평균 배송 소요일(일)': `${item.avgDays}일`,
      '배송 완료 건수': item.count,
    }));

    const wb = XLSX.utils.book_new();
    const wsSales = XLSX.utils.json_to_sheet(salesSheetData);
    const wsDelivery = XLSX.utils.json_to_sheet(deliverySheetData);

    wsSales['!cols'] = [{ wch: 8 }, { wch: 50 }, { wch: 18 }];
    wsDelivery['!cols'] = [{ wch: 8 }, { wch: 50 }, { wch: 22 }, { wch: 15 }];

    XLSX.utils.book_append_sheet(wb, wsSales, '누적 판매량 순위');
    XLSX.utils.book_append_sheet(wb, wsDelivery, '평균 배송 소요일');

    const monthLabel = selectedMonth === 'all' ? '전체' : selectedMonth;
    XLSX.writeFile(wb, `배송대시보드_통계_${monthLabel}.xlsx`);
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
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-[1100px] max-w-[95vw] h-full bg-slate-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 bg-white border-b border-slate-200">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <BarChart3 className="text-indigo-600" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">배송 대시보드</h2>
                  <p className="text-sm text-slate-500 mt-1">렌탈상품별 평균 배송 소요일 및 월별 판매량</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm cursor-pointer"
                  title="대시보드 통계 엑셀 다운로드"
                >
                  <Download size={18} />
                  <span>엑셀 다운로드</span>
                </button>
                <button
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
              {/* Filter */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <CalendarDays size={18} className="text-slate-400" />
                    <span className="text-sm font-bold text-slate-600">기준 월 선택</span>
                  </div>
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="all">전체 (모든 월 누적)</option>
                    {availableMonths.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  
                  <div className="w-px h-6 bg-slate-200 mx-1"></div>
                  
                  <MultiSelectDropdown 
                    label="상품명" 
                    options={uniqueProducts} 
                    selectedOptions={productFilter} 
                    onChange={setProductFilter} 
                  />
                </div>
                
                <div className="flex items-center gap-2 relative">
                  <Search size={16} className="text-slate-400 absolute left-3" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="렌탈상품명 검색..."
                    className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-[250px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* 1. 판매량 (왼쪽) */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                  <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                    <TrendingUp size={18} className="text-indigo-500" />
                    <h3 className="font-bold text-slate-800">렌탈상품별 누적 판매량 순위</h3>
                  </div>
                  <div className="p-4 overflow-auto max-h-[600px]">
                    {salesStats.length === 0 ? (
                      <p className="text-center text-slate-400 py-10">데이터가 없습니다.</p>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {salesStats.map((stat, idx) => {
                          const percentage = (stat.count / maxSales) * 100;
                          return (
                            <div key={idx} className="flex flex-col gap-1">
                              <div className="flex justify-between items-start gap-2">
                                <span className="text-[12px] font-medium text-slate-700 break-words flex-1" title={stat.product}>
                                  {idx + 1}. {stat.product}
                                </span>
                                <span className="text-[11px] text-slate-400 font-medium shrink-0 pt-0.5">{stat.count}건 판매</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2">
                                <div 
                                  className="bg-indigo-500 h-2 rounded-full transition-all duration-500" 
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. 평균 배송 소요일 (오른쪽) */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                  <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                    <Clock size={18} className="text-amber-500" />
                    <h3 className="font-bold text-slate-800">렌탈상품별 평균 배송 소요일</h3>
                  </div>
                  <div className="p-4 overflow-auto max-h-[600px]">
                    {deliveryDaysStats.length === 0 ? (
                      <p className="text-center text-slate-400 py-10">데이터가 없습니다.</p>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {deliveryDaysStats.map((stat, idx) => {
                          const percentage = (parseFloat(stat.avgDays) / maxAvgDays) * 100;
                          return (
                            <div key={idx} className="flex flex-col gap-1">
                              <div className="flex justify-between items-start gap-2">
                                <span className="text-[12px] font-medium text-slate-700 break-words flex-1" title={stat.product}>
                                  {stat.product}
                                </span>
                                <span className="text-[11px] text-slate-400 font-medium shrink-0 pt-0.5">평균 {stat.avgDays}일 ({stat.count}건 기준)</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2">
                                <div 
                                  className="bg-amber-400 h-2 rounded-full transition-all duration-500" 
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

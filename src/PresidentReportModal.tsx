import React, { useState, useMemo, useEffect } from 'react';
import { X, Printer, Calendar, Settings, FileText, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

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
  hc: string;
  hcRegDate: string;
  paymentStatus: string;
  status: string;
  memo: string;
  deliveryMemo: string;
  raw: any[];
}

interface PresidentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ERPDataItem[];
}

export function PresidentReportModal({ isOpen, onClose, data }: PresidentReportModalProps) {
  // 1. 출력일자 지정 (기본값: 오늘)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  // 2. 추가 지표 입력 (부고온, 상조행사 등) - 로컬스토리지 동적 리스트 복구 및 마이그레이션
  const [extraMetrics, setExtraMetrics] = useState<{ id: string; label: string; value: number }[]>(() => {
    const saved = localStorage.getItem('report_extra_metrics');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    
    // 이전 개별 저장값 백업 복구 (마이그레이션)
    const oldBugoonCount = localStorage.getItem('report_bugoon_count');
    const oldBugoonLabel = localStorage.getItem('report_bugoon_label');
    const oldFuneralCount = localStorage.getItem('report_funeral_count');
    const oldFuneralLabel = localStorage.getItem('report_funeral_label');

    const bugoonVal = oldBugoonCount !== null ? Math.max(0, parseInt(oldBugoonCount, 10) || 0) : 0;
    const bugoonLbl = oldBugoonLabel || '부고온 (모바일 부고장 생성 횟수)';
    const funeralVal = oldFuneralCount !== null ? Math.max(0, parseInt(oldFuneralCount, 10) || 0) : 0;
    const funeralLbl = oldFuneralLabel || '상조행사 (진행 및 완료 건수)';

    return [
      { id: 'metric-bugoon', label: bugoonLbl, value: bugoonVal },
      { id: 'metric-funeral', label: funeralLbl, value: funeralVal }
    ];
  });

  // 3. 실적 0건인 본부 숨기기 필터 - 로컬스토리지 복구 지원
  const [hideZeroHqs, setHideZeroHqs] = useState<boolean>(() => {
    const saved = localStorage.getItem('report_hide_zero_hqs');
    return saved !== null ? saved === 'true' : false;
  });

  // 4. 추가 입력칸 내용 - 로컬스토리지 복구 지원
  const [additionalMemo, setAdditionalMemo] = useState<string>(() => {
    const saved = localStorage.getItem('report_additional_memo');
    return saved !== null ? saved : '※ 특이사항:\n- 당월 목표 대비 순항 중이며, 배송완료 건은 순차적으로 해피콜 진행 예정입니다.';
  });

  // 5. 미노출 본부 설정 (숨길 본부 목록) - 로컬스토리지 복구 지원
  const [hiddenHqs, setHiddenHqs] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('report_hidden_hqs');
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch (e) {
        return new Set();
      }
    }
    return new Set();
  });

  // ----------------------------------------------------
  // 상태 변경 시 LocalStorage에 영구 저장하는 Side Effects
  // ----------------------------------------------------
  useEffect(() => {
    localStorage.setItem('report_extra_metrics', JSON.stringify(extraMetrics));
  }, [extraMetrics]);

  useEffect(() => {
    localStorage.setItem('report_hide_zero_hqs', String(hideZeroHqs));
  }, [hideZeroHqs]);

  useEffect(() => {
    localStorage.setItem('report_additional_memo', additionalMemo);
  }, [additionalMemo]);

  useEffect(() => {
    localStorage.setItem('report_hidden_hqs', JSON.stringify(Array.from(hiddenHqs)));
  }, [hiddenHqs]);

  // 날짜 비교용 파싱 함수
  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const normalized = dateStr.replace(/\s+/g, '').replace(/\./g, '-');
    const parts = normalized.split('-');
    if (parts.length >= 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) return date;
    }
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  };

  // 집계 대상 기간 계산 (1일 ~ 지정일)
  const dateRange = useMemo(() => {
    const dateObj = new Date(selectedDate);
    if (isNaN(dateObj.getTime())) return null;

    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const day = dateObj.getDate();

    const startDate = new Date(year, month, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, day, 23, 59, 59, 999);

    return { startDate, endDate, year, month: month + 1, day };
  }, [selectedDate]);

  // 데이터 및 정산 설정 내 모든 등록된 본부 수집
  const allHqs = useMemo(() => {
    // 1. 특수수당 대상 본부 목록 수집 (제외 대상)
    const specialHqs = new Set<string>();
    const savedIncentives = localStorage.getItem('erp_global_incentives');
    if (savedIncentives) {
      try {
        const rules = JSON.parse(savedIncentives);
        if (Array.isArray(rules)) {
          rules.forEach((r: any) => {
            if (r.targetName) {
              specialHqs.add(r.targetName.trim());
            }
          });
        }
      } catch (e) {}
    }

    const hqs = new Set<string>();

    // 2. 본부별 정산 설정(erp_hq_settings_v2)에 등록된 본부 수집
    const savedHqSettings = localStorage.getItem('erp_hq_settings_v2');
    if (savedHqSettings) {
      try {
        const settings = JSON.parse(savedHqSettings);
        if (Array.isArray(settings)) {
          settings.forEach((s: any) => {
            if (s.hqName) {
              const name = s.hqName.trim();
              if (!specialHqs.has(name)) {
                hqs.add(name);
              }
            }
          });
        }
      } catch (e) {}
    }

    // 3. 가입대장 데이터(data) 내 기재된 본부 추가 수집
    data.forEach(item => {
      if (item.hq) {
        const trimmedHq = item.hq.trim();
        if (!specialHqs.has(trimmedHq)) {
          hqs.add(trimmedHq);
        }
      }
    });

    return Array.from(hqs).sort();
  }, [data]);

  const toggleHqVisibility = (hqName: string) => {
    setHiddenHqs(prev => {
      const next = new Set(prev);
      if (next.has(hqName)) {
        next.delete(hqName);
      } else {
        next.add(hqName);
      }
      return next;
    });
  };

  const showAllHqs = () => {
    setHiddenHqs(new Set());
  };

  const hideAllHqs = () => {
    setHiddenHqs(new Set(allHqs));
  };

  // 집계 연산
  const stats = useMemo(() => {
    if (!dateRange) return null;
    const { startDate, endDate } = dateRange;

    // 상품별/본부별 통계 맵 생성
    const productDataMap: Record<string, { salesRows: ERPDataItem[]; deliveryRows: ERPDataItem[] }> = {};
    const hqDataMap: Record<string, { salesRows: ERPDataItem[]; deliveryRows: ERPDataItem[] }> = {};

    // 기본 본부 데이터 초기화 (0건인 본부 표시 목적)
    allHqs.forEach(hq => {
      if (!hiddenHqs.has(hq)) {
        hqDataMap[hq] = { salesRows: [], deliveryRows: [] };
      }
    });

    data.forEach(item => {
      // 1. 판매건수 판단 (계약일자 기준 & 취소 제외)
      const cDate = parseDate(item.contractDate);
      const isCancelled =
        (item.status && (item.status.includes('취소') || item.status.includes('해약'))) ||
        (item.deliveryStatus && (item.deliveryStatus.includes('취소') || item.deliveryStatus.includes('반품')));

      if (cDate && cDate >= startDate && cDate <= endDate && !isCancelled) {
        const prod = (item.prodName || '미지정').trim();
        const hq = (item.hq || '미지정').trim();

        if (!productDataMap[prod]) {
          productDataMap[prod] = { salesRows: [], deliveryRows: [] };
        }
        productDataMap[prod].salesRows.push(item);

        if (!hiddenHqs.has(hq)) {
          if (!hqDataMap[hq]) {
            hqDataMap[hq] = { salesRows: [], deliveryRows: [] };
          }
          hqDataMap[hq].salesRows.push(item);
        }
      }

      // 2. 배송완료건수 판단 (배송상태 '배송완료' & 배송일자 기준)
      const dDate = parseDate(item.deliveryDate);
      const isDeliveryComplete = item.deliveryStatus === '배송완료';

      if (isDeliveryComplete && dDate && dDate >= startDate && dDate <= endDate) {
        const prod = (item.prodName || '미지정').trim();
        const hq = (item.hq || '미지정').trim();

        if (!productDataMap[prod]) {
          productDataMap[prod] = { salesRows: [], deliveryRows: [] };
        }
        productDataMap[prod].deliveryRows.push(item);

        if (!hiddenHqs.has(hq)) {
          if (!hqDataMap[hq]) {
            hqDataMap[hq] = { salesRows: [], deliveryRows: [] };
          }
          hqDataMap[hq].deliveryRows.push(item);
        }
      }
    });

    // 구좌수/상품개수 세부 계산 헬퍼 함수
    const calculateCounts = (rows: ERPDataItem[]) => {
      const guzwaCount = rows.length; // 1 Row = 1 구좌
      
      const seenRentalNos = new Set<string>();
      let productCount = 0;

      rows.forEach(r => {
        const rentalNo = r.rentalNo ? r.rentalNo.trim() : '';
        if (rentalNo) {
          if (!seenRentalNos.has(rentalNo)) {
            seenRentalNos.add(rentalNo);
            productCount++;
          }
        } else {
          productCount++;
        }
      });

      return { guzwaCount, productCount };
    };

    // 상품별 결과 배열 변환
    const productStats = Object.entries(productDataMap).map(([prodName, { salesRows, deliveryRows }]) => {
      const sales = calculateCounts(salesRows);
      const delivery = calculateCounts(deliveryRows);
      return {
        name: prodName,
        salesGuzwa: sales.guzwaCount,
        salesProd: sales.productCount,
        deliveryGuzwa: delivery.guzwaCount,
        deliveryProd: delivery.productCount,
      };
    }).sort((a, b) => b.salesGuzwa - a.salesGuzwa);

    // 본부별 결과 배열 변환 (미노출 제외됨)
    let hqStats = Object.entries(hqDataMap).map(([hqName, { salesRows, deliveryRows }]) => {
      const sales = calculateCounts(salesRows);
      const delivery = calculateCounts(deliveryRows);
      return {
        name: hqName,
        salesGuzwa: sales.guzwaCount,
        salesProd: sales.productCount,
        deliveryGuzwa: delivery.guzwaCount,
        deliveryProd: delivery.productCount,
      };
    }).sort((a, b) => b.salesGuzwa - a.salesGuzwa);

    // 실적 0건인 본부 숨기기 필터링 적용
    if (hideZeroHqs) {
      hqStats = hqStats.filter(item => item.salesGuzwa > 0 || item.deliveryGuzwa > 0);
    }

    // 총합 계산
    const totals = {
      salesGuzwa: hqStats.reduce((acc, curr) => acc + curr.salesGuzwa, 0),
      salesProd: hqStats.reduce((acc, curr) => acc + curr.salesProd, 0),
      deliveryGuzwa: hqStats.reduce((acc, curr) => acc + curr.deliveryGuzwa, 0),
      deliveryProd: hqStats.reduce((acc, curr) => acc + curr.deliveryProd, 0),
    };

    return { productStats, hqStats, totals };
  }, [data, dateRange, hiddenHqs, allHqs, hideZeroHqs]);

  // 인쇄 실행 함수
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm print:bg-white print:p-0 president-report-modal-parent">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="relative bg-slate-50 w-full max-w-[290mm] h-full sm:h-[95vh] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col print:h-auto print:w-full print:rounded-none print:shadow-none print:bg-white print:overflow-visible print:block"
      >
        {/* 모달 헤더 - 인쇄 시 숨김 */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center print:hidden shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-rose-600 p-2 rounded-xl text-white shadow-md shadow-rose-100">
              <Printer size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">대표님 보고서 출력 양식</h3>
              <p className="text-[11px] text-slate-400 font-medium">A4 단일 페이지 인쇄 전용 레이아웃입니다.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* 메인 레이아웃: 설정 패널(좌측) + 인쇄 미리보기(우측) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden print:overflow-visible print:block">
          
          {/* 1. 설정 패널 - 인쇄 시 숨김 */}
          <div className="w-full md:w-80 bg-white border-r border-slate-200 p-5 overflow-y-auto space-y-5 print:hidden shrink-0">
            
            {/* 날짜 선택 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={14} className="text-rose-500" />
                보고 기준일 지정
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all"
              />
              {dateRange && (
                <p className="text-[10px] text-slate-400 font-bold">
                  집계 기간: {dateRange.year}.{String(dateRange.month).padStart(2, '0')}.01 ~ {String(dateRange.day).padStart(2, '0')}
                </p>
              )}
            </div>

            <hr className="border-slate-100" />

            {/* 수치 직접 입력란 (동적 목록) */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Settings size={14} className="text-blue-500" />
                  추가 지표 입력
                </label>
                <button
                  onClick={() => {
                    setExtraMetrics(prev => [...prev, { id: String(Date.now()), label: '', value: 0 }]);
                  }}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-500 flex items-center gap-0.5 border border-blue-500/20 px-2 py-0.5 rounded bg-blue-50/50 transition-colors"
                >
                  <Plus size={10} />
                  지표 추가
                </button>
              </div>
              
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {extraMetrics.map((metric, idx) => (
                  <div key={metric.id} className="p-2 bg-slate-50 border border-slate-100 rounded-lg space-y-1.5 relative group">
                    <button
                      onClick={() => {
                        setExtraMetrics(prev => prev.filter(m => m.id !== metric.id));
                      }}
                      className="absolute right-2 top-2 text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                    <input
                      type="text"
                      value={metric.label}
                      onChange={e => {
                        const val = e.target.value;
                        setExtraMetrics(prev => prev.map(m => m.id === metric.id ? { ...m, label: val } : m));
                      }}
                      className="w-[85%] text-[10px] font-bold text-slate-500 bg-transparent border-b border-slate-200 focus:border-blue-500 focus:outline-none pb-0.5"
                      placeholder={`지표명 입력 (예: 지표 ${idx + 1})`}
                    />
                    <div className="relative flex items-center w-[50%]">
                      <input
                        type="number"
                        value={metric.value}
                        onChange={e => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setExtraMetrics(prev => prev.map(m => m.id === metric.id ? { ...m, value: val } : m));
                        }}
                        className="w-full pl-2 pr-6 py-0.5 border border-slate-200 rounded text-[10px] font-bold text-slate-700 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                      <span className="absolute right-2 text-[9px] text-slate-400 font-bold">건</span>
                    </div>
                  </div>
                ))}
                {extraMetrics.length === 0 && (
                  <p className="text-[10px] text-slate-400 italic text-center py-4">등록된 추가 지표가 없습니다.</p>
                )}
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* 본부 노출 설정 */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Settings size={14} className="text-emerald-500" />
                  본부 노출 여부 설정
                </label>
                <div className="flex gap-1.5">
                  <button onClick={showAllHqs} className="text-[9px] font-bold text-blue-600 hover:underline">모두 표시</button>
                  <span className="text-slate-300 text-[9px]">|</span>
                  <button onClick={hideAllHqs} className="text-[9px] font-bold text-slate-400 hover:underline">모두 숨김</button>
                </div>
              </div>

              {/* 실적 0건 본부 자동 숨기기 필터 */}
              <label className="flex items-center gap-2 px-2 py-1.5 border border-dashed border-rose-200 bg-rose-50/50 rounded-lg cursor-pointer transition-colors text-[11px] font-bold text-rose-700">
                <input
                  type="checkbox"
                  checked={hideZeroHqs}
                  onChange={e => setHideZeroHqs(e.target.checked)}
                  className="rounded border-rose-300 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
                />
                <span>실적 0건인 본부 자동 숨기기</span>
              </label>
              
              <div className="border border-slate-100 rounded-xl max-h-40 overflow-y-auto p-2 bg-slate-50 space-y-1.5 custom-scrollbar">
                {allHqs.map(hq => {
                  const isVisible = !hiddenHqs.has(hq);
                  return (
                    <label key={hq} className="flex items-center gap-2 px-2 py-1 hover:bg-white rounded cursor-pointer transition-colors text-[11px] font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => toggleHqVisibility(hq)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3 h-3"
                      />
                      <span className={isVisible ? 'text-slate-900 font-bold' : 'text-slate-400 line-through font-normal'}>
                        {hq}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* 하단 추가 입력칸 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={14} className="text-indigo-500" />
                하단 추가 의견 작성
              </label>
              <textarea
                value={additionalMemo}
                onChange={e => setAdditionalMemo(e.target.value)}
                rows={4}
                placeholder="보고서 하단에 인쇄될 추가 의견을 입력해 주세요."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none leading-relaxed"
              />
            </div>

            <div className="pt-1">
              <button
                onClick={handlePrint}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-100 flex items-center justify-center gap-2 transition-all"
              >
                <Printer size={16} />
                보고서 인쇄 (PDF 저장)
              </button>
            </div>
          </div>

          {/* 2. 인쇄 미리보기 패널 */}
          <div className="flex-1 overflow-auto p-4 sm:p-8 bg-slate-200/80 flex justify-center items-start print:bg-white print:p-0 print:overflow-visible">
            
            {/* 용지 규격 (A4 세로형 크기, 가로폭 잘림 방지를 위해 table layout 제어 및 margin 조정) */}
            <div className="w-full max-w-[210mm] bg-white shadow-xl p-[12mm] border border-slate-300 flex flex-col justify-between print:shadow-none print:border-none print:p-0 print:max-w-none print:w-full print:min-h-0 print:block sheet-container">
              
              <div className="space-y-6 print:space-y-6">
                
                {/* 겉보기 테이블 (Flex 대신 table을 써서 인쇄 시 가로 배치와 너비 깨짐 원천 차단) */}
                <table className="w-full border-none border-collapse m-0 print:m-0 w-full-table">
                  <tbody>
                    <tr className="border-none">
                      {/* 제목 정보 셀 */}
                      <td className="border-none p-0 align-bottom text-left pb-1">
                        <h2 className="text-xl font-black text-slate-900 tracking-wide inline-block border-b-2 border-slate-900 pb-0.5 m-0 whitespace-nowrap">
                          판 매 실 적 보 고
                        </h2>
                        {dateRange && (
                          <p className="text-[10px] font-bold text-slate-500 mt-1 m-0">
                            기간: {dateRange.year}. {String(dateRange.month).padStart(2, '0')}. 01 ~ {dateRange.year}. {String(dateRange.month).padStart(2, '0')}. {String(dateRange.day).padStart(2, '0')}
                          </p>
                        )}
                      </td>
                      {/* 결재선 양식 셀 */}
                      <td className="border-none p-0 align-top text-right w-[225px]">
                        <table className="border-collapse border border-slate-400 text-center text-[10px] font-bold text-slate-800 table-fixed w-[220px] ml-auto select-none">
                          <thead>
                            <tr>
                              <th rowSpan={2} className="border border-slate-400 w-[28px] bg-slate-50 text-[10px] font-black p-0.5 leading-tight font-normal">
                                결<br/>재
                              </th>
                              <th className="border border-slate-400 w-[64px] py-1 bg-slate-50 text-[10px] font-extrabold font-normal">담당자</th>
                              <th className="border border-slate-400 w-[64px] py-1 bg-slate-50 text-[10px] font-extrabold font-normal">본부장</th>
                              <th className="border border-slate-400 w-[64px] py-1 bg-slate-50 text-[10px] font-extrabold font-normal">대 표</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="border border-slate-400 h-14 w-[64px]"></td>
                              <td className="border border-slate-400 h-14 w-[64px]"></td>
                              <td className="border border-slate-400 h-14 w-[64px]"></td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* 1. 상품별 통계 */}
                <div className="space-y-1">
                  <h4 className="text-[11px] font-black text-slate-900 flex items-center gap-1 pl-1.5 border-l-[3px] border-rose-600 select-none">
                    1. 상품별 실적 (판매 및 배송 완료)
                  </h4>
                  <table className="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
                    <thead>
                      <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-300 text-center select-none">
                        <th className="border border-slate-300 py-1 px-2 text-left w-[40%]">상품명</th>
                        <th className="border border-slate-300 py-1 px-1 w-[30%]" colSpan={2}>판매 건수</th>
                        <th className="border border-slate-300 py-1 px-1 w-[30%]" colSpan={2}>배송완료 건수</th>
                      </tr>
                      <tr className="bg-slate-100/50 text-slate-600 font-semibold border-b border-slate-300 text-[9px] text-center select-none">
                        <th className="border border-slate-300 py-0.5 px-2"></th>
                        <th className="border border-slate-300 py-0.5 px-1 w-[15%]">구좌수</th>
                        <th className="border border-slate-300 py-0.5 px-1 w-[15%]">상품개수</th>
                        <th className="border border-slate-300 py-0.5 px-1 w-[15%]">구좌수</th>
                        <th className="border border-slate-300 py-0.5 px-1 w-[15%]">상품개수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats?.productStats && stats.productStats.length > 0 ? (
                        stats.productStats.map(item => (
                          <tr key={item.name} className="border-b border-slate-200 hover:bg-slate-50/50 transition-colors text-center font-medium">
                            <td className="border border-slate-300 py-1 px-2 text-left font-bold text-slate-800 truncate" title={item.name}>{item.name}</td>
                            <td className="border border-slate-300 py-1 px-1 text-slate-700">{item.salesGuzwa.toLocaleString()}</td>
                            <td className="border border-slate-300 py-1 px-1 text-slate-700">{item.salesProd.toLocaleString()}</td>
                            <td className="border border-slate-300 py-1 px-1 text-emerald-700 font-semibold">{item.deliveryGuzwa.toLocaleString()}</td>
                            <td className="border border-slate-300 py-1 px-1 text-emerald-700 font-semibold">{item.deliveryProd.toLocaleString()}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="border border-slate-300 py-4 text-center text-slate-400 font-bold select-none">집계 기간 내 상품 데이터가 존재하지 않습니다.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 2. 본부별 통계 */}
                <div className="space-y-1">
                  <h4 className="text-[11px] font-black text-slate-900 flex items-center gap-1 pl-1.5 border-l-[3px] border-emerald-600 select-none">
                    2. 본부별 실적 (판매 및 배송 완료)
                  </h4>
                  <table className="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
                    <thead>
                      <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-300 text-center select-none">
                        <th className="border border-slate-300 py-1 px-2 text-left w-[40%]">본부명</th>
                        <th className="border border-slate-300 py-1 px-1 w-[30%]" colSpan={2}>판매 건수</th>
                        <th className="border border-slate-300 py-1 px-1 w-[30%]" colSpan={2}>배송완료 건수</th>
                      </tr>
                      <tr className="bg-slate-100/50 text-slate-600 font-semibold border-b border-slate-300 text-[9px] text-center select-none">
                        <th className="border border-slate-300 py-0.5 px-2"></th>
                        <th className="border border-slate-300 py-0.5 px-1 w-[15%]">구좌수</th>
                        <th className="border border-slate-300 py-0.5 px-1 w-[15%]">상품개수</th>
                        <th className="border border-slate-300 py-0.5 px-1 w-[15%]">구좌수</th>
                        <th className="border border-slate-300 py-0.5 px-1 w-[15%]">상품개수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats?.hqStats && stats.hqStats.length > 0 ? (
                        <>
                          {stats.hqStats.map(item => (
                            <tr key={item.name} className="border-b border-slate-200 hover:bg-slate-50/50 transition-colors text-center font-medium">
                              <td className="border border-slate-300 py-1 px-2 text-left font-bold text-slate-800 truncate" title={item.name}>{item.name}</td>
                              <td className="border border-slate-300 py-1 px-1 text-slate-700">{item.salesGuzwa.toLocaleString()}</td>
                              <td className="border border-slate-300 py-1 px-1 text-slate-700">{item.salesProd.toLocaleString()}</td>
                              <td className="border border-slate-300 py-1 px-1 text-emerald-700 font-semibold">{item.deliveryGuzwa.toLocaleString()}</td>
                              <td className="border border-slate-300 py-1 px-1 text-emerald-700 font-semibold">{item.deliveryProd.toLocaleString()}</td>
                            </tr>
                          ))}
                          {/* 합계 행 */}
                          <tr className="bg-slate-100/70 font-black border-t border-slate-300 text-center text-slate-900">
                            <td className="border border-slate-300 py-1 px-2 text-left select-none">합 계</td>
                            <td className="border border-slate-300 py-1 px-1 text-blue-700">{stats.totals.salesGuzwa.toLocaleString()}</td>
                            <td className="border border-slate-300 py-1 px-1 text-blue-700">{stats.totals.salesProd.toLocaleString()}</td>
                            <td className="border border-slate-300 py-1 px-1 text-emerald-700">{stats.totals.deliveryGuzwa.toLocaleString()}</td>
                            <td className="border border-slate-300 py-1 px-1 text-emerald-700">{stats.totals.deliveryProd.toLocaleString()}</td>
                          </tr>
                        </>
                      ) : (
                        <tr>
                          <td colSpan={5} className="border border-slate-300 py-4 text-center text-slate-400 font-bold select-none">노출 설정된 본부의 데이터가 존재하지 않습니다.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 3. 기타 실적 지표 (부고온, 상조행사) */}
                <div className="space-y-1">
                  <h4 className="text-[11px] font-black text-slate-900 flex items-center gap-1 pl-1.5 border-l-[3px] border-blue-600 select-none">
                    3. 기타 운영 실적 현황
                  </h4>
                  <table className="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
                    <thead>
                      <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-300 text-center select-none">
                        <th className="border border-slate-300 py-1 px-2 text-left w-[50%]">실적 지표명</th>
                        <th className="border border-slate-300 py-1 px-2 w-[50%]">실적 건수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extraMetrics.map((metric, idx) => (
                        <tr key={metric.id} className="border-b border-slate-200 text-center font-medium">
                          <td className="border border-slate-300 py-1 px-2 text-left font-bold text-slate-800">{metric.label || `지표 ${idx + 1}`}</td>
                          <td className={`border border-slate-300 py-1 px-2 font-bold ${idx % 2 === 0 ? 'text-blue-700' : 'text-emerald-700'}`}>
                            {metric.value.toLocaleString()} 건
                          </td>
                        </tr>
                      ))}
                      {extraMetrics.length === 0 && (
                        <tr>
                          <td colSpan={2} className="border border-slate-300 py-2 text-center text-slate-400 font-bold select-none">
                            등록된 기타 운영 실적 현황이 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 하단 추가 메모 영역 */}
              {additionalMemo.trim() && (
                <div className="mt-4 pt-3 border-t border-dashed border-slate-300 text-[9px] text-slate-600 leading-relaxed font-semibold">
                  <div className="whitespace-pre-wrap">{additionalMemo}</div>
                </div>
              )}

              {/* 인쇄 및 화면 겹침 해결용 CSS 스타일링 */}
              <style dangerouslySetInnerHTML={{__html: `
                .sheet-container, .sheet-container * {
                  box-sizing: border-box !important;
                }
                
                .w-full-table {
                  width: 100% !important;
                  max-width: 100% !important;
                  table-layout: fixed !important;
                }

                @media print {
                  @page {
                    size: A4 portrait;
                    margin: 12mm 15mm;
                  }

                  body * {
                    visibility: hidden !important;
                  }
                  
                  .president-report-modal-parent,
                  .president-report-modal-parent *,
                  .sheet-container,
                  .sheet-container * {
                    visibility: visible !important;
                  }
                  
                  .president-report-modal-parent {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    height: auto !important;
                    background: white !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    box-shadow: none !important;
                    z-index: 9999 !important;
                    overflow: visible !important;
                    display: block !important;
                  }
                  
                  .sheet-container {
                    position: relative !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    border: none !important;
                    padding: 0 !important; 
                    margin: 0 !important;
                    box-shadow: none !important;
                    background: white !important;
                    display: block !important;
                  }

                  .print\\:hidden,
                  button,
                  input,
                  textarea {
                    display: none !important;
                  }

                  table {
                    width: 100% !important;
                    table-layout: fixed !important;
                  }
                  td, th {
                    word-wrap: break-word !important;
                    white-space: normal !important;
                  }
                  
                  h2 {
                    white-space: nowrap !important;
                    display: inline-block !important;
                  }

                  table, tr, td, th {
                    page-break-inside: avoid !important;
                  }
                }
              `}} />

            </div>
          </div>

        </div>
      </motion.div>
    </div>
  );
}

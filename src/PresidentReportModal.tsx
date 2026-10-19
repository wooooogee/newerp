import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Printer,
  Calendar,
  Settings,
  FileText,
  Plus,
  Trash2,
  FileSpreadsheet,
  RotateCcw,
  Building,
  Edit3,
  Layers,
  ChevronDown,
  RefreshCw
} from 'lucide-react';
import { motion } from 'motion/react';

export interface ERPDataItem {
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
  enexProfitSummary?: any;
  hqSettings?: any[];
  divisionSettings?: any[];
  globalIncentiveRules?: any[];
  maintenancePayouts?: any[];
}

// ----------------------------------------------------
// 인라인 직접 수정 가능한 텍스트 컴포넌트
// ----------------------------------------------------
function EditableText({
  value,
  onChange,
  className = '',
  placeholder = '-',
  isPrint = false,
  align = 'center'
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  isPrint?: boolean;
  align?: 'left' | 'center' | 'right';
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  if (isEditing && !isPrint) {
    return (
      <input
        type="text"
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => {
          setIsEditing(false);
          onChange(text);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            setIsEditing(false);
            onChange(text);
          } else if (e.key === 'Escape') {
            setText(value);
            setIsEditing(false);
          }
        }}
        className={`w-full px-1.5 py-0.5 border border-rose-500 rounded bg-white text-slate-900 font-bold focus:outline-none text-${align} shadow-xs text-xs whitespace-nowrap`}
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      title="클릭하여 직접 수정"
      className={`cursor-pointer hover:bg-amber-100 hover:text-slate-950 transition-colors rounded px-1 py-0.5 inline-block whitespace-nowrap ${className}`}
    >
      {value || placeholder}
    </span>
  );
}

// ----------------------------------------------------
// 인라인 직접 수정 가능한 숫자 컴포넌트 (줄바꿈 원천 방지)
// ----------------------------------------------------
// ----------------------------------------------------
// 인라인 직접 수정 가능한 숫자 컴포넌트 (줄바꿈 원천 방지 및 직접 입력 공란 지원)
// ----------------------------------------------------
function EditableNumber({
  value,
  onChange,
  className = '',
  unit = '',
  isPrint = false,
  showZeroAsBlank = false,
  placeholder = '직접 입력'
}: {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  unit?: string;
  isPrint?: boolean;
  showZeroAsBlank?: boolean;
  placeholder?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value === 0 && showZeroAsBlank ? '' : String(value));

  useEffect(() => {
    setTempVal(value === 0 && showZeroAsBlank ? '' : String(value));
  }, [value, showZeroAsBlank]);

  if (isEditing && !isPrint) {
    return (
      <input
        type="number"
        autoFocus
        placeholder="금액 입력"
        value={tempVal}
        onChange={e => setTempVal(e.target.value)}
        onBlur={() => {
          setIsEditing(false);
          const parsed = parseInt(tempVal, 10);
          onChange(isNaN(parsed) ? 0 : parsed);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            setIsEditing(false);
            const parsed = parseInt(tempVal, 10);
            onChange(isNaN(parsed) ? 0 : parsed);
          } else if (e.key === 'Escape') {
            setTempVal(value === 0 && showZeroAsBlank ? '' : String(value));
            setIsEditing(false);
          }
        }}
        className="w-full px-1.5 py-0.5 border border-rose-500 rounded bg-white text-slate-900 font-mono font-bold focus:outline-none text-right shadow-xs text-xs whitespace-nowrap"
      />
    );
  }

  const isBlank = showZeroAsBlank && (value === 0 || isNaN(value));

  if (isBlank) {
    if (isPrint) {
      return <span className="text-slate-400 font-mono">-</span>;
    }
    return (
      <span
        onClick={() => setIsEditing(true)}
        title="클릭하여 직접 입력"
        className={`cursor-pointer border border-dashed border-rose-400 bg-rose-50/70 hover:bg-rose-100 hover:border-rose-500 text-rose-600 transition-all rounded px-2 py-0.5 font-sans font-bold whitespace-nowrap inline-flex items-center justify-center gap-1 select-none text-[11px] shadow-2xs ${className}`}
      >
        <Edit3 size={11} className="text-rose-500 shrink-0" />
        <span>{placeholder}</span>
      </span>
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      title="클릭하여 직접 수정"
      className={`cursor-pointer hover:bg-amber-100 hover:text-slate-950 transition-colors rounded px-1 py-0.5 font-mono whitespace-nowrap inline-flex items-center justify-end gap-0.5 select-none ${className}`}
    >
      <span>{value.toLocaleString()}</span>
      {unit && <span className="text-[10px] text-slate-600 font-medium shrink-0 ml-0.5">{unit}</span>}
    </span>
  );
}


// ----------------------------------------------------
// 메인 모달 컴포넌트
// ----------------------------------------------------
export function PresidentReportModal({
  isOpen,
  onClose,
  data,
  enexProfitSummary,
  hqSettings = [],
  divisionSettings = [],
  globalIncentiveRules = [],
  maintenancePayouts = []
}: PresidentReportModalProps) {
  // 시트(탭) 선택: 'PERFORMANCE' (실적보고서) vs 'MONTH_END' (월말보고서)
  const [activeTab, setActiveTab] = useState<'PERFORMANCE' | 'MONTH_END'>('MONTH_END');

  // ====================================================
  // [1. 실적보고서 관련 상태]
  // ====================================================
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  const [extraMetrics, setExtraMetrics] = useState<{ id: string; label: string; value: number }[]>(() => {
    const saved = localStorage.getItem('report_extra_metrics');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [
      { id: 'metric-bugoon', label: '부고온 (모바일 부고장 생성 횟수)', value: 0 },
      { id: 'metric-funeral', label: '상조행사 (진행 및 완료 건수)', value: 0 }
    ];
  });

  const [hideZeroHqs, setHideZeroHqs] = useState<boolean>(() => {
    const saved = localStorage.getItem('report_hide_zero_hqs');
    return saved !== null ? saved === 'true' : false;
  });

  const [additionalMemo, setAdditionalMemo] = useState<string>(() => {
    const saved = localStorage.getItem('report_additional_memo');
    return saved !== null ? saved : '※ 특이사항:\n- 당월 목표 대비 순항 중이며, 배송완료 건은 순차적으로 해피콜 진행 예정입니다.';
  });

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

  const allHqs = useMemo(() => {
    const specialHqs = new Set<string>();
    const savedIncentives = localStorage.getItem('erp_global_incentives');
    if (savedIncentives) {
      try {
        const rules = JSON.parse(savedIncentives);
        if (Array.isArray(rules)) {
          rules.forEach((r: any) => {
            if (r.targetName && r.targetName !== 'SELF_HQ' && r.targetName !== '판매본부' && r.targetName !== '해당본부') {
              specialHqs.add(r.targetName.trim());
            }
          });
        }
      } catch (e) {}
    }

    const hqs = new Set<string>();
    const savedHqSettings = localStorage.getItem('erp_hq_settings_v2');
    if (savedHqSettings) {
      try {
        const settings = JSON.parse(savedHqSettings);
        if (Array.isArray(settings)) {
          settings.forEach((s: any) => {
            if (s.hqName) {
              const name = s.hqName.trim();
              if (!specialHqs.has(name)) hqs.add(name);
            }
          });
        }
      } catch (e) {}
    }

    data.forEach(item => {
      if (item.hq) {
        const trimmedHq = item.hq.trim();
        if (!specialHqs.has(trimmedHq)) hqs.add(trimmedHq);
      }
    });

    return Array.from(hqs).sort();
  }, [data]);

  const toggleHqVisibility = (hqName: string) => {
    setHiddenHqs(prev => {
      const next = new Set(prev);
      if (next.has(hqName)) next.delete(hqName);
      else next.add(hqName);
      return next;
    });
  };

  const showAllHqs = () => setHiddenHqs(new Set());
  const hideAllHqs = () => setHiddenHqs(new Set(allHqs));

  const stats = useMemo(() => {
    if (!dateRange) return null;
    const { startDate, endDate } = dateRange;

    const productDataMap: Record<string, { salesRows: ERPDataItem[]; deliveryRows: ERPDataItem[] }> = {};
    const hqDataMap: Record<string, { salesRows: ERPDataItem[]; deliveryRows: ERPDataItem[] }> = {};

    allHqs.forEach(hq => {
      if (!hiddenHqs.has(hq)) {
        hqDataMap[hq] = { salesRows: [], deliveryRows: [] };
      }
    });

    data.forEach(item => {
      const cDate = parseDate(item.contractDate);
      const isCancelled =
        (item.status && (item.status.includes('취소') || item.status.includes('해약'))) ||
        (item.deliveryStatus && (item.deliveryStatus.includes('취소') || item.deliveryStatus.includes('반품')));

      if (cDate && cDate >= startDate && cDate <= endDate && !isCancelled) {
        const prod = (item.prodName || '미지정').trim();
        const hq = (item.hq || '미지정').trim();
        if (!productDataMap[prod]) productDataMap[prod] = { salesRows: [], deliveryRows: [] };
        productDataMap[prod].salesRows.push(item);

        if (!hiddenHqs.has(hq)) {
          if (!hqDataMap[hq]) hqDataMap[hq] = { salesRows: [], deliveryRows: [] };
          hqDataMap[hq].salesRows.push(item);
        }
      }

      const dDate = parseDate(item.deliveryDate);
      const isDeliveryComplete = item.deliveryStatus === '배송완료' && item.status === '가입';

      if (isDeliveryComplete && dDate && dDate >= startDate && dDate <= endDate) {
        const prod = (item.prodName || '미지정').trim();
        const hq = (item.hq || '미지정').trim();
        if (!productDataMap[prod]) productDataMap[prod] = { salesRows: [], deliveryRows: [] };
        productDataMap[prod].deliveryRows.push(item);

        if (!hiddenHqs.has(hq)) {
          if (!hqDataMap[hq]) hqDataMap[hq] = { salesRows: [], deliveryRows: [] };
          hqDataMap[hq].deliveryRows.push(item);
        }
      }
    });

    const calculateCounts = (rows: ERPDataItem[]) => {
      const guzwaCount = rows.length;
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

    if (hideZeroHqs) {
      hqStats = hqStats.filter(item => item.salesGuzwa > 0 || item.deliveryGuzwa > 0);
    }

    const totals = {
      salesGuzwa: hqStats.reduce((acc, curr) => acc + curr.salesGuzwa, 0),
      salesProd: hqStats.reduce((acc, curr) => acc + curr.salesProd, 0),
      deliveryGuzwa: hqStats.reduce((acc, curr) => acc + curr.deliveryGuzwa, 0),
      deliveryProd: hqStats.reduce((acc, curr) => acc + curr.deliveryProd, 0),
    };

    return { productStats, hqStats, totals };
  }, [data, dateRange, hiddenHqs, allHqs, hideZeroHqs]);

  // ====================================================
  // [2. 월말보고서 관련 상태 및 개선된 데이터 구조]
  // ====================================================
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  });

  // 1. 핵심 손익 지표 (A ~ I)
  // 에넥스 입금액(A) 및 에넥스 공급가 입금액(E) 초기값 공란(0) -> 사용자가 직접 입력 지원
  const [metrics, setMetrics] = useState({
    a_enexDeposit: 0,
    b_salesCommission: 368410000,
    c_specialAndMaintenance: 25918000,
    d_operatingProfit: 0,
    e_richwelfareDeposit: 0,
    f_richwelfareSupplyPrice: 41750000,
    g_supplyCommission: 5850000,
    h_supplyProfit: 0,
    i_finalNetProfit: 0,
  });

  // 2. [통합] 본부별 / 상품별 영업 실적 및 수수료 지급 현황 (요청 2, 3 반영)
  // 언바운드컴퍼니 예: 540플러스 355건(건당 74만), 540 27건(건당 75만) -> 총 282,950,000원 등
  const [hqProductSalesList, setHqProductSalesList] = useState<Array<{
    id: string;
    hqName: string;
    prodName: string;
    count: number;
    unitCommission: number; // 상품별 건당 수수료(설정값)
    totalCommission: number; // count * unitCommission
    note: string;
  }>>([]);

  // 3. 특수수당 및 본사 지출 내역 요약 (요청 4 반영)
  const [specialExpenseList, setSpecialExpenseList] = useState<Array<{
    id: string;
    category: string;
    name: string;
    count: number | string;
    amount: number;
    note: string;
  }>>([]);

  // 4. 공급사 정산관리 - [공급사별 총괄 요약] (에넥스 총 입금액 & 공급사 지급 공급가액 총액) (요청 5 반영)
  const [supplierSummaryList, setSupplierSummaryList] = useState<Array<{
    id: string;
    supplierName: string;
    count: number;
    depositPrice: number;     // 에넥스 총 입금액 (E) - 초기값 공란
    supplyPrice: number;      // 공급사별 지급 공급가액 (F)
    supplyCommission: number; // 공급수수료 (G)
    unitMargin: number;       // 공급가 순익 (H)
    settlementCondition: string; // 정산조건 / 비고
  }>>([]);

  // 5. 공급사 정산관리 - [제품별 세부 정산 내역] (제품별 에넥스 입금액 & 제품별 공급단가) (요청 6 반영)
  const [supplierProductDetailList, setSupplierProductDetailList] = useState<Array<{
    id: string;
    supplierName: string;
    prodName: string;
    count: number;
    unitDeposit: number;      // 제품별 에넥스 건당 입금액 - 초기값 공란
    unitSupplyPrice: number;  // 제품별 공급단가 (발주관리/공급사 마스터 공급단가)
    unitCommission: number;   // 제품별 공급수수료
    unitMargin: number;       // 제품별 건당 마진
    totalSupplyPrice: number; // 제품별 총 공급가액
    totalMargin: number;      // 제품별 총 마진
    note: string;
  }>>([]);

  // 6. 대표님 보고 종합 의견
  const [monthEndMemo, setMonthEndMemo] = useState<string>(() => {
    return '※ 렌탈 영업 순익 및 리치웰 공급가 마진이 정상 반영된 최종 결산 보고입니다.\n※ 설치확인서 등록 및 배송 완료 건을 기준으로 지급이 확정되었습니다.';
  });

  // ----------------------------------------------------
  // ERP 원본 데이터 기반 월말보고서 기본값 자동 산출 엔진
  // ----------------------------------------------------
  const computeMonthEndDefaults = () => {
    const targetMonthClean = selectedMonth.replace(/[^0-9]/g, '');
    const validItems = (data || []).filter(item => {
      if (item.status?.includes('취소') || item.status?.includes('해약')) return false;
      const isDelivered = (item.deliveryStatus && item.deliveryStatus.includes('완료')) ||
                          (item.deliveryDate && item.deliveryDate !== '-' && item.deliveryDate.trim() !== '');
      if (!isDelivered) return false;
      
      const pDate = item.payDate || '';
      const dDate = item.deliveryDate || '';
      const matchMonth = (pDate && pDate.replace(/[^0-9]/g, '').startsWith(targetMonthClean)) ||
                         (!pDate && dDate && dDate.replace(/[^0-9]/g, '').startsWith(targetMonthClean));
      return matchMonth;
    });

    // -----------------------------------------------------------------
    // 1. 사업단 및 본부 매핑 집합: 굿라이프(신동우)와 굿라이프(꿈잇다) 산하 22개 본부 통합
    // -----------------------------------------------------------------
    const defaultGoodlifeHqs = [
      '최강본부', '가치온본부', '1본부', '새빛본부', '온누리본부', '명품본부', '이음본부',
      '무한본부', '꿈잇다', '서울중앙본부', '스마일본부', '아우라본부', '챔피언본부', '두드림본부', '조이본부',
      '다보다', '더굿라이프', '노반AI', 'LS지사', '신동우 대표', '더굿', 'KMN솔루션'
    ];
    const goodlifeSet = new Set<string>(defaultGoodlifeHqs.map(h => h.trim()));

    let divisions = divisionSettings;
    if (!divisions || divisions.length === 0) {
      try {
        const saved = localStorage.getItem('erp_division_settings');
        if (saved) divisions = JSON.parse(saved);
      } catch (e) {}
    }
    if (Array.isArray(divisions)) {
      divisions.forEach((div: any) => {
        if (div.name && div.name.includes('굿라이프') && Array.isArray(div.hqNames)) {
          div.hqNames.forEach((h: string) => goodlifeSet.add(h.trim()));
        }
      });
    }

    // 본부명 표준화 (굿라이프 산하 본부는 무조건 '굿라이프'로 통합, 5대 조직 분류)
    const normalizeHq = (rawHq: string): string => {
      const h = (rawHq || '').trim();
      if (!h) return '기타본부';
      if (goodlifeSet.has(h) || h.includes('굿라이프') || h.includes('신동우')) {
        return '굿라이프';
      }
      if (h.includes('언바운드')) return '언바운드컴퍼니';
      if (h.includes('피티엠에스') || h.toUpperCase().includes('PTMS')) return '피티엠에스';
      if (h.includes('해랑')) return '해랑인터내셔널';
      if (h.includes('맥스')) return '맥스';
      return h;
    };

    // -----------------------------------------------------------------
    // 2. 본부별 수수료 설정값(hqSettings) 연동 및 수수료 단가 결정 로직
    // -----------------------------------------------------------------
    let allHqSettings = hqSettings;
    if (!allHqSettings || allHqSettings.length === 0) {
      try {
        const saved = localStorage.getItem('erp_hq_settings_v2');
        if (saved) allHqSettings = JSON.parse(saved);
      } catch (e) {}
    }

    const getUnitComm = (normHq: string, prod: string, rawHq?: string): number => {
      const cleanProd = prod.replace(/\s+/g, '');

      // 1) 굿라이프: 실버 71만원, 골드 75만원, 올인원 75만원
      if (normHq === '굿라이프') {
        if (cleanProd.includes('실버')) return 710000;
        if (cleanProd.includes('골드')) return 750000;
        if (cleanProd.includes('올인원')) return 750000;
        return 750000;
      }

      // 2) 언바운드컴퍼니: 540플러스 74만원, 540 75만원
      if (normHq === '언바운드컴퍼니') {
        if (cleanProd.includes('540플러스') || cleanProd.includes('540plus')) return 740000;
        if (cleanProd.includes('540')) return 750000;
      }

      // 3) hqSettings의 productRules 조회
      if (Array.isArray(allHqSettings) && allHqSettings.length > 0) {
        const targetHq = allHqSettings.find((s: any) =>
          (s.hqName && normHq.includes(s.hqName)) ||
          (s.hqName && s.hqName.includes(normHq)) ||
          (rawHq && s.hqName && rawHq.includes(s.hqName))
        );
        if (targetHq && Array.isArray(targetHq.productRules)) {
          const matched = targetHq.productRules.find((r: any) => {
            const rProd = (r.productName || '').replace(/\s+/g, '');
            return rProd && (cleanProd.includes(rProd) || rProd.includes(cleanProd));
          });
          if (matched && typeof matched.totalAmount === 'number' && matched.totalAmount > 0) {
            return matched.totalAmount;
          }
        }
      }

      // 4) 5대 본부 기본값 보정
      if (normHq === '피티엠에스') {
        if (cleanProd.includes('698')) return 680000;
        if (cleanProd.includes('540')) return 580000;
      }
      if (normHq === '해랑인터내셔널') {
        if (cleanProd.includes('698')) return 650000;
        if (cleanProd.includes('540')) return 600000;
      }
      if (normHq === '맥스') {
        if (cleanProd.includes('698')) return 680000;
        if (cleanProd.includes('540')) return 650000;
      }

      return 750000;
    };

    // -----------------------------------------------------------------
    // 3. 실제 ERP 데이터 기반 본부·사업단별 / 상품별 실적 집계
    // -----------------------------------------------------------------
    const hqProdMap = new Map<string, { hqName: string; prodName: string; count: number; rawHqs: Set<string> }>();
    if (validItems.length > 0) {
      validItems.forEach(it => {
        const normHq = normalizeHq(it.hq);
        const prod = (it.prodName || '더좋은프리미엄540').trim();
        const key = `${normHq}___${prod}`;
        const existing = hqProdMap.get(key) || { hqName: normHq, prodName: prod, count: 0, rawHqs: new Set() };
        existing.count++;
        if (it.hq) existing.rawHqs.add(it.hq.trim());
        hqProdMap.set(key, existing);
      });
    }

    const calculatedHqProdList: typeof hqProductSalesList = [];
    if (hqProdMap.size > 0) {
      Array.from(hqProdMap.values()).forEach((item, idx) => {
        const firstRaw = Array.from(item.rawHqs)[0];
        const unit = getUnitComm(item.hqName, item.prodName, firstRaw);
        calculatedHqProdList.push({
          id: `hp-calc-${idx}`,
          hqName: item.hqName,
          prodName: item.prodName,
          count: item.count,
          unitCommission: unit,
          totalCommission: item.count * unit,
          note: item.hqName === '굿라이프' ? '신동우/꿈잇다 통합 정산' : '정상 정산'
        });
      });

      // 5대 조직 순서 우선 정렬 (언바운드컴퍼니 -> 굿라이프 -> 피티엠에스 -> 해랑인터내셔널 -> 맥스)
      const priorityOrder = ['언바운드컴퍼니', '굿라이프', '피티엠에스', '해랑인터내셔널', '맥스'];
      calculatedHqProdList.sort((a, b) => {
        const idxA = priorityOrder.indexOf(a.hqName);
        const idxB = priorityOrder.indexOf(b.hqName);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.hqName.localeCompare(b.hqName);
      });
    }

    let initialHqProductList: typeof hqProductSalesList = [];
    if (calculatedHqProdList.length > 0) {
      initialHqProductList = calculatedHqProdList;
    } else {
      // 10월 결산 5대 조직 기본값 세팅 (사용자 지정 수수료 및 건수 완벽 반영)
      initialHqProductList = [
        {
          id: 'hp-1',
          hqName: '언바운드컴퍼니',
          prodName: '더좋은프리미엄540플러스',
          count: 355,
          unitCommission: 740000,
          totalCommission: 355 * 740000, // 262,700,000
          note: '300건 초과 구간 수수료 (74만원)'
        },
        {
          id: 'hp-2',
          hqName: '언바운드컴퍼니',
          prodName: '더좋은프리미엄540',
          count: 27,
          unitCommission: 750000,
          totalCommission: 27 * 750000, // 20,250,000
          note: '기본 단가 (75만원)'
        },
        {
          id: 'hp-gl-1',
          hqName: '굿라이프',
          prodName: '굿라이프헬스케어실버',
          count: 42,
          unitCommission: 710000,
          totalCommission: 42 * 710000, // 29,820,000
          note: '신동우/꿈잇다 통합 정산 (71만원)'
        },
        {
          id: 'hp-gl-2',
          hqName: '굿라이프',
          prodName: '굿라이프헬스케어골드',
          count: 28,
          unitCommission: 750000,
          totalCommission: 28 * 750000, // 21,000,000
          note: '신동우/꿈잇다 통합 정산 (75만원)'
        },
        {
          id: 'hp-gl-3',
          hqName: '굿라이프',
          prodName: '굿라이프헬스케어올인원',
          count: 14,
          unitCommission: 750000,
          totalCommission: 14 * 750000, // 10,500,000
          note: '신동우/꿈잇다 통합 정산 (75만원)'
        },
        {
          id: 'hp-3',
          hqName: '피티엠에스',
          prodName: '더좋은프리미엄540',
          count: 18,
          unitCommission: 580000,
          totalCommission: 18 * 580000, // 10,440,000
          note: '정상 정산 (본부 설정값 58만원)'
        },
        {
          id: 'hp-4',
          hqName: '해랑인터내셔널',
          prodName: '더좋은프리미엄540',
          count: 12,
          unitCommission: 600000,
          totalCommission: 12 * 600000, // 7,200,000
          note: '정상 정산 (본부 설정값 60만원)'
        },
        {
          id: 'hp-5',
          hqName: '맥스',
          prodName: '더좋은프리미엄540',
          count: 10,
          unitCommission: 650000,
          totalCommission: 10 * 650000, // 6,500,000
          note: '정상 정산 (본부 설정값 65만원)'
        }
      ];
    }
    setHqProductSalesList(initialHqProductList);

    // -----------------------------------------------------------------
    // 4. 특수수당 및 본사 지출 내역
    // -----------------------------------------------------------------
    let initialSpecialList: typeof specialExpenseList = [];
    if (enexProfitSummary?.extraDeductions && Array.isArray(enexProfitSummary.extraDeductions) && enexProfitSummary.extraDeductions.length > 0) {
      initialSpecialList = enexProfitSummary.extraDeductions.map((e: any, idx: number) => ({
        id: `spec-${idx}`,
        category: e.category || '지출차감',
        name: e.name || '지출항목',
        count: e.count || 1,
        amount: e.amount || 0,
        note: e.remark || e.accountInfo || '10월 지급 수수료'
      }));
    } else {
      initialSpecialList = [
        { id: 's-1', category: '특수수당', name: '신동우 대표', count: '208', amount: 16600000, note: '10월 지급 수수료' },
        { id: 's-2', category: '컨설팅', name: '이종연', count: '3', amount: 90000, note: '10월 지급 수수료' },
        { id: 's-3', category: '유지보수', name: '권성훈', count: '602', amount: 150000, note: '10월 지급 수수료' },
        { id: 's-4', category: '컨설팅', name: '조민경', count: '598', amount: 2990000, note: '10월 지급 수수료' },
        { id: 's-5', category: '모델비', name: '조재윤', count: '598', amount: 5980000, note: '10월 지급 수수료' },
        { id: 's-6', category: '유지수수료', name: '본부 유지수수료', count: '10', amount: 108000, note: '10월 회차 유지수수료' }
      ];
    }
    setSpecialExpenseList(initialSpecialList);

    // -----------------------------------------------------------------
    // 5. 공급사 관리 데이터 연동 (4번 총괄 및 5번 세부)
    // -----------------------------------------------------------------
    // -----------------------------------------------------------------
    // 5. 공급사 관리 데이터 연동 (4번 총괄 및 5번 세부)
    // -----------------------------------------------------------------
    // 발주관리/공급사 마스터(erp_suppliers_master_v3) 조회 및 제품별 에넥스 입금가 & 공급단가 연동
    let masterSuppliers: any[] = [];
    try {
      const savedSupp = localStorage.getItem('erp_suppliers_master_v3');
      if (savedSupp) masterSuppliers = JSON.parse(savedSupp);
    } catch (e) {}

    // 공급사 마스터에 등록된 제품별 enexPrice, supplyPrice 맵 구축
    const suppProdMap = new Map<string, { enexPrice: number; supplyPrice: number; commission: number; supplierName: string }>();
    if (Array.isArray(masterSuppliers)) {
      masterSuppliers.forEach((s: any) => {
        (s.products || []).forEach((p: any) => {
          const info = {
            enexPrice: Number(p.enexPrice) || 0,
            supplyPrice: Number(p.supplyPrice) || 0,
            commission: Number(p.supplyCommission) || 0,
            supplierName: s.name || ''
          };
          if (p.productName) suppProdMap.set(p.productName.trim(), info);
          if (p.productKeyword) suppProdMap.set(p.productKeyword.trim(), info);
        });
      });
    }

    const findMasterPrice = (prodName: string, defaultSupply: number, defaultDeposit: number = 0) => {
      let matchedEnex = defaultDeposit;
      let matchedSupply = defaultSupply;
      for (const [key, val] of suppProdMap.entries()) {
        if (prodName.includes(key) || key.includes(prodName)) {
          if (val.enexPrice > 0) matchedEnex = val.enexPrice;
          if (val.supplyPrice > 0) matchedSupply = val.supplyPrice;
          break;
        }
      }
      return { enexPrice: matchedEnex, supplyPrice: matchedSupply };
    };

    // 5번 기본 품목에 공급사 설정값 우선 적용
    const p1 = findMasterPrice('팔콘 안마의자', 1150000, 0);
    const p2 = findMasterPrice('팬텀 로보 안마의자', 1533333, 0);
    const p3 = findMasterPrice('리클라이너 소파 4인', 1531250, 0);
    const p4 = findMasterPrice('프리미엄 호텔 침대', 1466667, 0);

    const initialProductDetail: typeof supplierProductDetailList = [
      {
        id: 'sp-1',
        supplierName: '바디프랜드',
        prodName: '팔콘 안마의자',
        count: 12,
        unitDeposit: p1.enexPrice, // 공급사 관리 에넥스입금가 우선 연동 (없으면 0 공란)
        unitSupplyPrice: p1.supplyPrice, // 공급사 관리 공급단가 연동
        unitCommission: 170000,
        unitMargin: p1.enexPrice > 0 ? p1.enexPrice - p1.supplyPrice - 170000 : 0,
        totalSupplyPrice: 12 * p1.supplyPrice,
        totalMargin: p1.enexPrice > 0 ? 12 * (p1.enexPrice - p1.supplyPrice - 170000) : 0,
        note: p1.enexPrice > 0 ? '공급사관리 입금가 연동' : '설치확인서 등록 12건'
      },
      {
        id: 'sp-2',
        supplierName: '바디프랜드',
        prodName: '팬텀 로보 안마의자',
        count: 6,
        unitDeposit: p2.enexPrice,
        unitSupplyPrice: p2.supplyPrice,
        unitCommission: 200000,
        unitMargin: p2.enexPrice > 0 ? p2.enexPrice - p2.supplyPrice - 200000 : 0,
        totalSupplyPrice: 6 * p2.supplyPrice,
        totalMargin: p2.enexPrice > 0 ? 6 * (p2.enexPrice - p2.supplyPrice - 200000) : 0,
        note: p2.enexPrice > 0 ? '공급사관리 입금가 연동' : '프리미엄 라인'
      },
      {
        id: 'sp-3',
        supplierName: '(주)리치웰',
        prodName: '리클라이너 소파 4인',
        count: 8,
        unitDeposit: p3.enexPrice,
        unitSupplyPrice: p3.supplyPrice,
        unitCommission: 206250,
        unitMargin: p3.enexPrice > 0 ? p3.enexPrice - p3.supplyPrice - 206250 : 0,
        totalSupplyPrice: 8 * p3.supplyPrice,
        totalMargin: p3.enexPrice > 0 ? 8 * (p3.enexPrice - p3.supplyPrice - 206250) : 0,
        note: p3.enexPrice > 0 ? '공급사관리 입금가 연동' : '익월 말일 지급'
      },
      {
        id: 'sp-4',
        supplierName: '(주)리치웰',
        prodName: '프리미엄 호텔 침대',
        count: 6,
        unitDeposit: p4.enexPrice,
        unitSupplyPrice: p4.supplyPrice,
        unitCommission: 190000,
        unitMargin: p4.enexPrice > 0 ? p4.enexPrice - p4.supplyPrice - 190000 : 0,
        totalSupplyPrice: 6 * p4.supplyPrice,
        totalMargin: p4.enexPrice > 0 ? 6 * (p4.enexPrice - p4.supplyPrice - 190000) : 0,
        note: p4.enexPrice > 0 ? '공급사관리 입금가 연동' : '매트리스 결합'
      }
    ];

    // 사용자가 공급사 관리에 추가한 다른 제품들(가스트로플러스 등)도 목록에 반영
    if (Array.isArray(masterSuppliers)) {
      let addIdx = 10;
      masterSuppliers.forEach((supp: any) => {
        if (!supp.isActive && supp.isActive !== undefined) return;
        (supp.products || []).forEach((prod: any) => {
          const pName = prod.productName || prod.productKeyword;
          const exists = initialProductDetail.some(it => it.prodName.includes(pName) || pName.includes(it.prodName));
          if (!exists) {
            const enex = Number(prod.enexPrice) || 0;
            const supply = Number(prod.supplyPrice) || 0;
            const comm = Number(prod.supplyCommission) || 0;
            const cnt = 1;
            const margin = enex > 0 ? enex - supply - comm : 0;
            initialProductDetail.push({
              id: `sp-dyn-${addIdx++}`,
              supplierName: supp.name || '공급사',
              prodName: pName,
              count: cnt,
              unitDeposit: enex,
              unitSupplyPrice: supply,
              unitCommission: comm,
              unitMargin: margin,
              totalSupplyPrice: cnt * supply,
              totalMargin: cnt * margin,
              note: enex > 0 ? '공급사관리 입금가 연동' : '공급사관리 등록 제품'
            });
          }
        });
      });
    }

    setSupplierProductDetailList(initialProductDetail);

    // 4번: 공급사 정산관리 총괄 요약 (5번 제품들의 에넥스 입금가 및 공급가액 합계 자동 연동)
    const bodyfriendProds = initialProductDetail.filter(p => p.supplierName.includes('바디프랜드'));
    const bfDeposit = bodyfriendProds.reduce((s, r) => s + (r.unitDeposit * r.count), 0);
    const bfSupply = bodyfriendProds.reduce((s, r) => s + r.totalSupplyPrice, 0);
    const bfComm = bodyfriendProds.reduce((s, r) => s + (r.unitCommission * r.count), 0);

    const richProds = initialProductDetail.filter(p => p.supplierName.includes('리치웰'));
    const richDeposit = richProds.reduce((s, r) => s + (r.unitDeposit * r.count), 0);
    const richSupply = richProds.reduce((s, r) => s + r.totalSupplyPrice, 0);
    const richComm = richProds.reduce((s, r) => s + (r.unitCommission * r.count), 0);

    const initialSupplierSummary: typeof supplierSummaryList = [
      {
        id: 'supp-sum-1',
        supplierName: '바디프랜드',
        count: bodyfriendProds.reduce((s, r) => s + r.count, 0) || 18,
        depositPrice: bfDeposit,
        supplyPrice: bfSupply || 20700000,
        supplyCommission: bfComm || 3060000,
        unitMargin: bfDeposit > 0 ? bfDeposit - bfSupply - bfComm : 0,
        settlementCondition: '당월 말일 결제 (확인서 등록건)'
      },
      {
        id: 'supp-sum-2',
        supplierName: '(주)리치웰',
        count: richProds.reduce((s, r) => s + r.count, 0) || 14,
        depositPrice: richDeposit,
        supplyPrice: richSupply || 21050000,
        supplyCommission: richComm || 2790000,
        unitMargin: richDeposit > 0 ? richDeposit - richSupply - richComm : 0,
        settlementCondition: '익월 말일 세금계산서 발행 지급'
      }
    ];

    // 기타 공급사 추가
    const otherSuppliers = Array.from(new Set(
      initialProductDetail
        .map(p => p.supplierName)
        .filter(name => !name.includes('바디프랜드') && !name.includes('리치웰'))
    ));
    otherSuppliers.forEach((sName, sIdx) => {
      const prods = initialProductDetail.filter(p => p.supplierName === sName);
      const dep = prods.reduce((s, r) => s + (r.unitDeposit * r.count), 0);
      const sup = prods.reduce((s, r) => s + r.totalSupplyPrice, 0);
      const comm = prods.reduce((s, r) => s + (r.unitCommission * r.count), 0);
      initialSupplierSummary.push({
        id: `supp-sum-dyn-${sIdx}`,
        supplierName: sName,
        count: prods.reduce((s, r) => s + r.count, 0),
        depositPrice: dep,
        supplyPrice: sup,
        supplyCommission: comm,
        unitMargin: dep > 0 ? dep - sup - comm : 0,
        settlementCondition: '공급사 계약조건 준수'
      });
    });

    setSupplierSummaryList(initialSupplierSummary);

    // -----------------------------------------------------------------
    // 6. 1번 핵심 손익 지표 계산 및 연동
    //    - 에넥스 입금액 [A]는 초기값 0 (직접 입력)
    //    - 에넥스 공급가 입금액 [E]는 공급사 관리에서 설정된 에넥스 총 입금액 반영 (없으면 0)
    //    - [B]는 2번 표 총합, [C]는 3번 표 총합, [F]는 4번 표 총합 자동 연동
    // -----------------------------------------------------------------
    const b_sales = initialHqProductList.reduce((acc, cur) => acc + cur.totalCommission, 0);
    const c_special = initialSpecialList.reduce((acc, cur) => acc + cur.amount, 0);
    const f_rich_sup = initialSupplierSummary.reduce((acc, cur) => acc + cur.supplyPrice, 0);
    const g_rich_comm = initialSupplierSummary.reduce((acc, cur) => acc + cur.supplyCommission, 0) || 5850000;

    const a_enex = 0;
    const e_rich_dep = initialSupplierSummary.reduce((acc, cur) => acc + cur.depositPrice, 0);
    const d_operating = a_enex > 0 ? a_enex - b_sales - c_special : 0;
    const h_supp_profit = e_rich_dep > 0 ? e_rich_dep - f_rich_sup - g_rich_comm : 0;
    const i_final = d_operating + h_supp_profit;

    setMetrics({
      a_enexDeposit: a_enex,
      b_salesCommission: b_sales,
      c_specialAndMaintenance: c_special,
      d_operatingProfit: d_operating,
      e_richwelfareDeposit: e_rich_dep,
      f_richwelfareSupplyPrice: f_rich_sup,
      g_supplyCommission: g_rich_comm,
      h_supplyProfit: h_supp_profit,
      i_finalNetProfit: i_final,
    });
  };

  useEffect(() => {
    if (isOpen) {
      computeMonthEndDefaults();
    }
  }, [isOpen, selectedMonth]);

  // A, B, C 수정 시 D 자동 갱신 (A가 0이면 D는 0 또는 수동값, A가 입력되면 A - B - C)
  const handleUpdateA = (val: number) => {
    setMetrics(prev => {
      const d = val > 0 ? val - prev.b_salesCommission - prev.c_specialAndMaintenance : 0;
      return { ...prev, a_enexDeposit: val, d_operatingProfit: d, i_finalNetProfit: d + prev.h_supplyProfit };
    });
  };
  const handleUpdateB = (val: number) => {
    setMetrics(prev => {
      const d = prev.a_enexDeposit > 0 ? prev.a_enexDeposit - val - prev.c_specialAndMaintenance : 0;
      return { ...prev, b_salesCommission: val, d_operatingProfit: d, i_finalNetProfit: d + prev.h_supplyProfit };
    });
  };
  const handleUpdateC = (val: number) => {
    setMetrics(prev => {
      const d = prev.a_enexDeposit > 0 ? prev.a_enexDeposit - prev.b_salesCommission - val : 0;
      return { ...prev, c_specialAndMaintenance: val, d_operatingProfit: d, i_finalNetProfit: d + prev.h_supplyProfit };
    });
  };

  // E, F, G 수정 시 H 자동 갱신 (E가 0이면 H는 0, E가 입력되면 E - F - G)
  const handleUpdateE = (val: number) => {
    setMetrics(prev => {
      const h = val > 0 ? val - prev.f_richwelfareSupplyPrice - prev.g_supplyCommission : 0;
      return { ...prev, e_richwelfareDeposit: val, h_supplyProfit: h, i_finalNetProfit: prev.d_operatingProfit + h };
    });
  };
  const handleUpdateF = (val: number) => {
    setMetrics(prev => {
      const h = prev.e_richwelfareDeposit > 0 ? prev.e_richwelfareDeposit - val - prev.g_supplyCommission : 0;
      return { ...prev, f_richwelfareSupplyPrice: val, h_supplyProfit: h, i_finalNetProfit: prev.d_operatingProfit + h };
    });
  };
  const handleUpdateG = (val: number) => {
    setMetrics(prev => {
      const h = prev.e_richwelfareDeposit > 0 ? prev.e_richwelfareDeposit - prev.f_richwelfareSupplyPrice - val : 0;
      return { ...prev, g_supplyCommission: val, h_supplyProfit: h, i_finalNetProfit: prev.d_operatingProfit + h };
    });
  };

  // 공급사 관리(erp_suppliers_master_v3)에서 최신 에넥스 입금가 및 공급단가 즉시 동기화
  const handleSyncSupplierPrices = () => {
    try {
      const saved = localStorage.getItem('erp_suppliers_master_v3');
      if (!saved) {
        alert('공급사 관리에 등록된 설정 데이터가 없습니다.');
        return;
      }
      const suppliers = JSON.parse(saved);
      if (!Array.isArray(suppliers) || suppliers.length === 0) {
        alert('공급사 관리에 등록된 제품 설정이 없습니다.');
        return;
      }

      const priceMap = new Map<string, { enexPrice: number; supplyPrice: number; commission: number; supplierName: string }>();
      suppliers.forEach((s: any) => {
        (s.products || []).forEach((p: any) => {
          const info = {
            enexPrice: Number(p.enexPrice) || 0,
            supplyPrice: Number(p.supplyPrice) || 0,
            commission: Number(p.supplyCommission) || 0,
            supplierName: s.name || ''
          };
          if (p.productName) priceMap.set(p.productName.trim(), info);
          if (p.productKeyword) priceMap.set(p.productKeyword.trim(), info);
        });
      });

      let updatedCount = 0;
      const nextDetail = supplierProductDetailList.map(item => {
        let matched: any = null;
        for (const [key, val] of priceMap.entries()) {
          if (item.prodName.includes(key) || key.includes(item.prodName)) {
            matched = val;
            break;
          }
        }
        if (matched) {
          updatedCount++;
          const newDep = matched.enexPrice > 0 ? matched.enexPrice : item.unitDeposit;
          const newSup = matched.supplyPrice > 0 ? matched.supplyPrice : item.unitSupplyPrice;
          const newComm = matched.commission > 0 ? matched.commission : item.unitCommission;
          const newMargin = newDep > 0 ? newDep - newSup - newComm : 0;
          return {
            ...item,
            unitDeposit: newDep,
            unitSupplyPrice: newSup,
            unitCommission: newComm,
            totalSupplyPrice: item.count * newSup,
            unitMargin: newMargin,
            totalMargin: item.count * newMargin,
            note: matched.enexPrice > 0 ? '공급사관리 입금가 연동됨' : item.note
          };
        }
        return item;
      });

      setSupplierProductDetailList(nextDetail);

      // 4번 공급사 총괄 요약도 동기화
      const nextSummary = supplierSummaryList.map(sum => {
        const related = nextDetail.filter(d => d.supplierName === sum.supplierName);
        if (related.length > 0) {
          const sumDep = related.reduce((s, r) => s + (r.unitDeposit * r.count), 0);
          const sumSup = related.reduce((s, r) => s + r.totalSupplyPrice, 0);
          const sumComm = related.reduce((s, r) => s + (r.unitCommission * r.count), 0);
          return {
            ...sum,
            count: related.reduce((s, r) => s + r.count, 0),
            depositPrice: sumDep,
            supplyPrice: sumSup,
            supplyCommission: sumComm,
            unitMargin: sumDep > 0 ? sumDep - sumSup - sumComm : 0
          };
        }
        return sum;
      });
      setSupplierSummaryList(nextSummary);

      // 1번 핵심 손익 [E], [F] 동기화
      const totalDep = nextSummary.reduce((s, r) => s + r.depositPrice, 0);
      const totalSup = nextSummary.reduce((s, r) => s + r.supplyPrice, 0);
      handleUpdateE(totalDep);
      handleUpdateF(totalSup);

      alert(`공급사 관리에서 ${updatedCount}개 제품의 에넥스 입금가 및 공급단가를 동기화했습니다.`);
    } catch (e: any) {
      console.error(e);
      alert('동기화 실패: ' + (e.message || ''));
    }
  };

  // 본부별/상품별 그룹핑 계산 (본부별 소계)
  const groupedHqSales = useMemo(() => {
    const map = new Map<string, typeof hqProductSalesList>();
    hqProductSalesList.forEach(item => {
      const list = map.get(item.hqName) || [];
      list.push(item);
      map.set(item.hqName, list);
    });
    return Array.from(map.entries()).map(([hqName, items]) => {
      const subtotalCount = items.reduce((s, it) => s + it.count, 0);
      const subtotalCommission = items.reduce((s, it) => s + it.totalCommission, 0);
      return { hqName, items, subtotalCount, subtotalCommission };
    });
  }, [hqProductSalesList]);

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-3 bg-slate-900/60 backdrop-blur-sm print:bg-white print:p-0 president-report-modal-parent">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="relative bg-slate-50 w-full max-w-[98vw] xl:max-w-[1440px] h-full sm:h-[97vh] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col print:h-auto print:w-full print:rounded-none print:shadow-none print:bg-white print:overflow-visible print:block"
      >
        {/* ==================================================== */}
        {/* 모달 상단 헤더 & 탭 네비게이션 (인쇄 시 숨김) */}
        {/* ==================================================== */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap justify-between items-center print:hidden shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-rose-600 p-2 rounded-xl text-white shadow-md shadow-rose-100">
              <Printer size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-800">대표님 보고서 출력 양식</h3>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  {activeTab === 'PERFORMANCE' ? '실적보고서' : '월말보고서'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                모든 표의 수치와 텍스트는 클릭하여 직접 수정할 수 있으며, 수정된 값으로 바로 인쇄(PDF)됩니다.
              </p>
            </div>
          </div>

          {/* 시트(탭) 전환 버튼 */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              onClick={() => setActiveTab('PERFORMANCE')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'PERFORMANCE'
                  ? 'bg-white text-rose-600 shadow-sm border border-rose-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FileText size={14} />
              <span>실적보고서</span>
            </button>
            <button
              onClick={() => setActiveTab('MONTH_END')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'MONTH_END'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FileSpreadsheet size={14} />
              <span>월말보고서</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Printer size={14} />
              <span>보고서 인쇄 (PDF 저장)</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ==================================================== */}
        {/* 메인 레이아웃: 좌측 설정 패널 + 우측 A4 인쇄 미리보기 */}
        {/* ==================================================== */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden print:overflow-visible print:block">
          
          {/* 1. 좌측 설정 패널 (인쇄 시 숨김) */}
          <div className="w-full md:w-72 bg-white border-r border-slate-200 p-4 overflow-y-auto space-y-4 print:hidden shrink-0">
            
            {activeTab === 'PERFORMANCE' ? (
              /* [실적보고서 전용 설정] */
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar size={14} className="text-rose-500" />
                    실적 집계 기준일 지정
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

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Settings size={14} className="text-blue-500" />
                      기타 운영 실적 지표
                    </label>
                    <button
                      onClick={() => setExtraMetrics(prev => [...prev, { id: String(Date.now()), label: '', value: 0 }])}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-500 flex items-center gap-0.5 border border-blue-500/20 px-2 py-0.5 rounded bg-blue-50/50 cursor-pointer"
                    >
                      <Plus size={10} /> 추가
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {extraMetrics.map(metric => (
                      <div key={metric.id} className="p-2 bg-slate-50 border border-slate-100 rounded-lg space-y-1.5 relative group">
                        <button
                          onClick={() => setExtraMetrics(prev => prev.filter(m => m.id !== metric.id))}
                          className="absolute right-2 top-2 text-slate-400 hover:text-rose-500"
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
                          className="w-[85%] text-[10px] font-bold text-slate-600 bg-transparent border-b border-slate-200 focus:border-blue-500 focus:outline-none pb-0.5"
                          placeholder="지표명"
                        />
                        <div className="relative flex items-center w-[60%]">
                          <input
                            type="number"
                            value={metric.value}
                            onChange={e => {
                              const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                              setExtraMetrics(prev => prev.map(m => m.id === metric.id ? { ...m, value: val } : m));
                            }}
                            className="w-full pl-2 pr-6 py-0.5 border border-slate-200 rounded text-[10px] font-bold text-slate-700 bg-white focus:outline-none"
                          />
                          <span className="absolute right-2 text-[9px] text-slate-400 font-bold">건</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <hr className="border-slate-100" />

                <div className="space-y-2">
                  <label className="flex items-center gap-2 px-2 py-1.5 border border-dashed border-rose-200 bg-rose-50/50 rounded-lg cursor-pointer text-[11px] font-bold text-rose-700">
                    <input
                      type="checkbox"
                      checked={hideZeroHqs}
                      onChange={e => setHideZeroHqs(e.target.checked)}
                      className="rounded border-rose-300 text-rose-600 w-3.5 h-3.5"
                    />
                    <span>실적 0건인 본부 자동 숨기기</span>
                  </label>
                </div>

                <hr className="border-slate-100" />

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={14} className="text-indigo-500" />
                    하단 추가 메모
                  </label>
                  <textarea
                    value={additionalMemo}
                    onChange={e => setAdditionalMemo(e.target.value)}
                    rows={3}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 bg-slate-50 focus:outline-none resize-none leading-relaxed"
                  />
                </div>
              </>
            ) : (
              /* [월말보고서 전용 설정] */
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar size={14} className="text-rose-500" />
                    월말 결산 기준월 지정
                  </label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all"
                  />
                  <p className="text-[10px] text-slate-400 font-bold">
                    지정된 결산월 기준으로 ERP 정산 데이터가 자동 연동됩니다.
                  </p>
                </div>

                <button
                  onClick={computeMonthEndDefaults}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-slate-300/70 cursor-pointer"
                  title="수정한 수치를 취소하고 원본 ERP 계산값으로 복원합니다."
                >
                  <RotateCcw size={13} />
                  <span>자동 계산값으로 복원</span>
                </button>

                <hr className="border-slate-100" />

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 space-y-1.5 text-amber-900">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-800">
                    <Edit3 size={13} />
                    <span>클릭하여 직접 수정 안내</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    보고서의 <strong>모든 숫자, 금액, 항목명</strong>은 클릭하여 원하는 수치로 바로 수정할 수 있습니다.
                  </p>
                  <p className="text-[10px] text-amber-700 leading-tight">
                    • A, B, C 수정 시 순익 D 실시간 자동 계산<br />
                    • E, F, G 수정 시 공급순익 H 실시간 자동 계산<br />
                    • 최종 순익 I = D + H 자동 연동
                  </p>
                </div>

                <hr className="border-slate-100" />

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={14} className="text-indigo-500" />
                    대표님 보고 종합 의견
                  </label>
                  <textarea
                    value={monthEndMemo}
                    onChange={e => setMonthEndMemo(e.target.value)}
                    rows={4}
                    placeholder="대표님께 보고할 핵심 요약 코멘트 입력"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 bg-slate-50 focus:outline-none resize-none leading-relaxed"
                  />
                </div>
              </>
            )}

            <div className="pt-2">
              <button
                onClick={handlePrint}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-100 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Printer size={16} />
                <span>보고서 인쇄 (PDF 저장)</span>
              </button>
            </div>
          </div>

          {/* ==================================================== */}
          {/* 2. 우측 인쇄 미리보기 패널 (화면 대폭 확장 및 줄바꿈 차단) */}
          {/* ==================================================== */}
          <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-200/80 flex justify-center items-start print:bg-white print:p-0 print:overflow-visible custom-scrollbar">
            
            {/* 용지 규격 컨테이너: 화면에서는 넉넉한 1000px로 표시되어 줄바꿈이 전혀 일어나지 않고, 인쇄 시에는 A4 규격으로 자동 최적화됨 */}
            <div className="w-full max-w-[1020px] bg-white shadow-xl p-[8mm] sm:p-[12mm] border border-slate-300 flex flex-col justify-between print:shadow-none print:border-none print:p-0 print:max-w-none print:w-full print:min-h-0 print:block sheet-container">
              
              {activeTab === 'PERFORMANCE' ? (
                /* ==================================================== */
                /* [시트 1: 실 적 보 고 서] */
                /* ==================================================== */
                <div className="space-y-6 print:space-y-6">
                  {/* 상단 타이틀 및 결재선 */}
                  <table className="w-full border-none border-collapse m-0 print:m-0 w-full-table">
                    <tbody>
                      <tr className="border-none">
                        <td className="border-none p-0 align-bottom text-left pb-1">
                          <h2 className="text-2xl sm:text-3xl font-black text-black tracking-wider inline-block border-b-2 border-black pb-1 m-0 whitespace-nowrap">
                            실 적 보 고 서
                          </h2>
                          {dateRange && (
                            <p className="text-xs sm:text-sm font-bold text-slate-700 mt-1 m-0">
                              기간: {dateRange.year}. {String(dateRange.month).padStart(2, '0')}. 01 ~ {dateRange.year}. {String(dateRange.month).padStart(2, '0')}. {String(dateRange.day).padStart(2, '0')}
                            </p>
                          )}
                        </td>
                        <td className="border-none p-0 align-top text-right w-[245px]">
                          <table className="border-collapse border border-slate-400 text-center text-xs font-bold text-slate-900 table-fixed w-[240px] ml-auto select-none">
                            <thead>
                              <tr>
                                <th rowSpan={2} className="border border-slate-400 w-[30px] bg-slate-50 text-xs font-black p-0.5 leading-tight">
                                  결<br/>재
                                </th>
                                <th className="border border-slate-400 w-[70px] py-1 bg-slate-50 text-xs font-extrabold">담당자</th>
                                <th className="border border-slate-400 w-[70px] py-1 bg-slate-50 text-xs font-extrabold">본부장</th>
                                <th className="border border-slate-400 w-[70px] py-1 bg-slate-50 text-xs font-extrabold">대 표</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="border border-slate-400 h-14 w-[70px]"></td>
                                <td className="border border-slate-400 h-14 w-[70px]"></td>
                                <td className="border border-slate-400 h-14 w-[70px]"></td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* 1. 상품별 통계 */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs sm:text-sm font-black text-black flex items-center gap-1 pl-2 border-l-[4px] border-black select-none">
                      1. 상품별 실적 (판매 및 배송 완료)
                    </h4>
                    <table className="w-full text-left border-collapse border border-slate-400 text-xs table-fixed">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-black border-b border-slate-400 text-center select-none">
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[40%]">상품명</th>
                          <th className="border border-slate-400 py-1.5 px-1 w-[30%]" colSpan={2}>판매 건수</th>
                          <th className="border border-slate-400 py-1.5 px-1 w-[30%]" colSpan={2}>배송완료 건수</th>
                        </tr>
                        <tr className="bg-slate-50 text-slate-800 font-bold border-b border-slate-400 text-[11px] text-center select-none">
                          <th className="border border-slate-400 py-1 px-2"></th>
                          <th className="border border-slate-400 py-1 px-1 w-[15%]">구좌수</th>
                          <th className="border border-slate-400 py-1 px-1 w-[15%]">상품개수</th>
                          <th className="border border-slate-400 py-1 px-1 w-[15%]">구좌수</th>
                          <th className="border border-slate-400 py-1 px-1 w-[15%]">상품개수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats?.productStats && stats.productStats.length > 0 ? (
                          stats.productStats.map(item => (
                            <tr key={item.name} className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors text-center font-medium">
                              <td className="border border-slate-300 py-1.5 px-2 text-left font-bold text-slate-900 truncate" title={item.name}>{item.name}</td>
                              <td className="border border-slate-300 py-1.5 px-1 text-black font-semibold">{item.salesGuzwa.toLocaleString()}</td>
                              <td className="border border-slate-300 py-1.5 px-1 text-black font-semibold">{item.salesProd.toLocaleString()}</td>
                              <td className="border border-slate-300 py-1.5 px-1 text-black font-bold">{item.deliveryGuzwa.toLocaleString()}</td>
                              <td className="border border-slate-300 py-1.5 px-1 text-black font-bold">{item.deliveryProd.toLocaleString()}</td>
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
                  <div className="space-y-1.5">
                    <h4 className="text-xs sm:text-sm font-black text-black flex items-center gap-1 pl-2 border-l-[4px] border-black select-none">
                      2. 본부별 실적 (판매 및 배송 완료)
                    </h4>
                    <table className="w-full text-left border-collapse border border-slate-400 text-xs table-fixed">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-black border-b border-slate-400 text-center select-none">
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[40%]">본부명</th>
                          <th className="border border-slate-400 py-1.5 px-1 w-[30%]" colSpan={2}>판매 건수</th>
                          <th className="border border-slate-400 py-1.5 px-1 w-[30%]" colSpan={2}>배송완료 건수</th>
                        </tr>
                        <tr className="bg-slate-50 text-slate-800 font-bold border-b border-slate-400 text-[11px] text-center select-none">
                          <th className="border border-slate-400 py-1 px-2"></th>
                          <th className="border border-slate-400 py-1 px-1 w-[15%]">구좌수</th>
                          <th className="border border-slate-400 py-1 px-1 w-[15%]">상품개수</th>
                          <th className="border border-slate-400 py-1 px-1 w-[15%]">구좌수</th>
                          <th className="border border-slate-400 py-1 px-1 w-[15%]">상품개수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats?.hqStats && stats.hqStats.length > 0 ? (
                          <>
                            {stats.hqStats.map(item => (
                              <tr key={item.name} className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors text-center font-medium">
                                <td className="border border-slate-300 py-1.5 px-2 text-left font-bold text-slate-900 truncate" title={item.name}>{item.name}</td>
                                <td className="border border-slate-300 py-1.5 px-1 text-black font-semibold">{item.salesGuzwa.toLocaleString()}</td>
                                <td className="border border-slate-300 py-1.5 px-1 text-black font-semibold">{item.salesProd.toLocaleString()}</td>
                                <td className="border border-slate-300 py-1.5 px-1 text-black font-bold">{item.deliveryGuzwa.toLocaleString()}</td>
                                <td className="border border-slate-300 py-1.5 px-1 text-black font-bold">{item.deliveryProd.toLocaleString()}</td>
                              </tr>
                            ))}
                            <tr className="bg-slate-200/80 font-black border-t-2 border-slate-400 text-center text-black">
                              <td className="border border-slate-400 py-1.5 px-2 text-left select-none">합 계</td>
                              <td className="border border-slate-400 py-1.5 px-1 text-black">{stats.totals.salesGuzwa.toLocaleString()}</td>
                              <td className="border border-slate-400 py-1.5 px-1 text-black">{stats.totals.salesProd.toLocaleString()}</td>
                              <td className="border border-slate-400 py-1.5 px-1 text-black">{stats.totals.deliveryGuzwa.toLocaleString()}</td>
                              <td className="border border-slate-400 py-1.5 px-1 text-black">{stats.totals.deliveryProd.toLocaleString()}</td>
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

                  {/* 3. 기타 실적 지표 */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs sm:text-sm font-black text-black flex items-center gap-1 pl-2 border-l-[4px] border-black select-none">
                      3. 기타 운영 실적 현황
                    </h4>
                    <table className="w-full text-left border-collapse border border-slate-400 text-xs table-fixed">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-black border-b border-slate-400 text-center select-none">
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[50%]">실적 지표명</th>
                          <th className="border border-slate-400 py-1.5 px-2 w-[50%]">실적 건수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extraMetrics.map((metric, idx) => (
                          <tr key={metric.id} className="border-b border-slate-300 text-center font-medium">
                            <td className="border border-slate-300 py-1.5 px-2 text-left font-bold text-slate-900">{metric.label || `지표 ${idx + 1}`}</td>
                            <td className="border border-slate-300 py-1.5 px-2 font-bold text-black">
                              {metric.value.toLocaleString()} 건
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {additionalMemo.trim() && (
                    <div className="mt-4 pt-3 border-t border-dashed border-slate-400 text-xs text-slate-800 leading-relaxed font-semibold">
                      <div className="whitespace-pre-wrap">{additionalMemo}</div>
                    </div>
                  )}
                </div>
              ) : (
                /* ==================================================== */
                /* [시트 2: 월 말 결 산 보 고 서] (개선 및 통합 버전) */
                /* ==================================================== */
                <div className="space-y-5 print:space-y-5">
                  {/* 상단 타이틀 및 결재선 */}
                  <table className="w-full border-none border-collapse m-0 print:m-0 w-full-table">
                    <tbody>
                      <tr className="border-none">
                        <td className="border-none p-0 align-bottom text-left pb-1">
                          <h2 className="text-2xl sm:text-3xl font-black text-black tracking-wider inline-block border-b-2 border-black pb-1 m-0 whitespace-nowrap">
                            월 말 결 산 보 고 서
                          </h2>
                          <p className="text-xs sm:text-sm font-bold text-slate-700 mt-1 m-0">
                            귀속월: {selectedMonth.substring(0, 4)}년 {selectedMonth.substring(5, 7)}월 | 출력일시: {new Date().toLocaleDateString('ko-KR')}
                          </p>
                        </td>
                        <td className="border-none p-0 align-top text-right w-[245px]">
                          <table className="border-collapse border border-slate-400 text-center text-xs font-bold text-slate-900 table-fixed w-[240px] ml-auto select-none">
                            <thead>
                              <tr>
                                <th rowSpan={2} className="border border-slate-400 w-[30px] bg-slate-50 text-xs font-black p-0.5 leading-tight">
                                  결<br/>재
                                </th>
                                <th className="border border-slate-400 w-[70px] py-1 bg-slate-50 text-xs font-extrabold">담당자</th>
                                <th className="border border-slate-400 w-[70px] py-1 bg-slate-50 text-xs font-extrabold">본부장</th>
                                <th className="border border-slate-400 w-[70px] py-1 bg-slate-50 text-xs font-extrabold">대 표</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="border border-slate-400 h-14 w-[70px]"></td>
                                <td className="border border-slate-400 h-14 w-[70px]"></td>
                                <td className="border border-slate-400 h-14 w-[70px]"></td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* ---------------------------------------------------- */}
                  {/* [1] 핵심 손익 결산 요약 (A ~ I 지표) */}
                  {/* ---------------------------------------------------- */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs sm:text-sm font-black text-black flex items-center gap-1 pl-2 border-l-[4px] border-black select-none">
                        1. 월말 종합 손익 결산 요약 (A ~ I)
                      </h4>
                      <span className="text-[10px] text-slate-400 font-bold print:hidden">
                        ※ 수치를 클릭하여 직접 수정할 수 있습니다.
                      </span>
                    </div>

                    <table className="w-full text-left border-collapse border border-slate-400 text-xs table-fixed">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-black border-b border-slate-400 text-center select-none">
                          <th className="border border-slate-400 py-1.5 px-2 w-[8%] whitespace-nowrap">구분</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[28%] whitespace-nowrap">항목명</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-right w-[24%] whitespace-nowrap">금액 (원)</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[40%] whitespace-nowrap">산출 공식 및 세부 설명</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* 1부: 에넥스 렌탈 영업 부문 (A ~ D) */}
                        <tr className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors">
                          <td className="border border-slate-300 py-1 px-2 text-center font-bold text-slate-700 bg-slate-50/60 whitespace-nowrap">[A]</td>
                          <td className="border border-slate-300 py-1 px-2 font-bold text-slate-900 whitespace-nowrap">에넥스 입금액</td>
                          <td className="border border-slate-300 py-1 px-2 text-right font-black text-emerald-700 whitespace-nowrap">
                            <EditableNumber
                              value={metrics.a_enexDeposit}
                              onChange={handleUpdateA}
                              unit="원"
                              showZeroAsBlank={true}
                              placeholder="직접 입력"
                            />
                          </td>
                          <td className="border border-slate-300 py-1 px-2 text-slate-600 text-[11px] truncate">
                            유통사(에넥스) 거래처 수납 총액
                          </td>
                        </tr>
                        <tr className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors">
                          <td className="border border-slate-300 py-1 px-2 text-center font-bold text-slate-700 bg-slate-50/60 whitespace-nowrap">[B]</td>
                          <td className="border border-slate-300 py-1 px-2 font-bold text-slate-900 whitespace-nowrap">본부·사업단별 영업수수료</td>
                          <td className="border border-slate-300 py-1 px-2 text-right font-bold text-blue-700 whitespace-nowrap">
                            <EditableNumber value={metrics.b_salesCommission} onChange={handleUpdateB} unit="원" />
                          </td>
                          <td className="border border-slate-300 py-1 px-2 text-slate-600 text-[11px] truncate">
                            각 사업단 및 본부 영업조직 실적 수수료 합계 (하단 2번 상세 집계)
                          </td>
                        </tr>
                        <tr className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors">
                          <td className="border border-slate-300 py-1 px-2 text-center font-bold text-slate-700 bg-slate-50/60 whitespace-nowrap">[C]</td>
                          <td className="border border-slate-300 py-1 px-2 font-bold text-slate-900 whitespace-nowrap">특수수당 및 유지수수료</td>
                          <td className="border border-slate-300 py-1 px-2 text-right font-bold text-purple-700 whitespace-nowrap">
                            <EditableNumber value={metrics.c_specialAndMaintenance} onChange={handleUpdateC} unit="원" />
                          </td>
                          <td className="border border-slate-300 py-1 px-2 text-slate-600 text-[11px] truncate">
                            신동우, 모델비, 유지비, 직급수당 등 차감 (하단 3번 상세 집계)
                          </td>
                        </tr>
                        <tr className="border-b-2 border-slate-400 bg-blue-50/60 font-black">
                          <td className="border border-slate-400 py-1.5 px-2 text-center font-bold text-blue-900 bg-blue-100/60 whitespace-nowrap">[D]</td>
                          <td className="border border-slate-400 py-1.5 px-2 font-black text-blue-900 whitespace-nowrap">렌탈 영업 순익</td>
                          <td className="border border-slate-400 py-1.5 px-2 text-right font-black text-blue-900 whitespace-nowrap">
                            <EditableNumber
                              value={metrics.d_operatingProfit}
                              onChange={val => {
                                setMetrics(prev => ({ ...prev, d_operatingProfit: val, i_finalNetProfit: val + prev.h_supplyProfit }));
                              }}
                              unit="원"
                            />
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-blue-900 text-[11px] font-bold truncate">
                            [A] 에넥스 입금액 - [B] 영업수수료 - [C] 특수/유지수수료
                          </td>
                        </tr>

                        {/* 2부: 리치웰 공급가 부문 (E ~ H) */}
                        <tr className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors">
                          <td className="border border-slate-300 py-1 px-2 text-center font-bold text-slate-700 bg-slate-50/60 whitespace-nowrap">[E]</td>
                          <td className="border border-slate-300 py-1 px-2 font-bold text-slate-900 whitespace-nowrap">에넥스 공급가 입금액(리치웰)</td>
                          <td className="border border-slate-300 py-1 px-2 text-right font-black text-emerald-700 whitespace-nowrap">
                            <EditableNumber
                              value={metrics.e_richwelfareDeposit}
                              onChange={handleUpdateE}
                              unit="원"
                              showZeroAsBlank={true}
                              placeholder="직접 입력"
                            />
                          </td>
                          <td className="border border-slate-300 py-1 px-2 text-slate-600 text-[11px] truncate">
                            에넥스에서 수납된 결합원가 공급가 합계 (하단 4번 상세 집계)
                          </td>
                        </tr>
                        <tr className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors">
                          <td className="border border-slate-300 py-1 px-2 text-center font-bold text-slate-700 bg-slate-50/60 whitespace-nowrap">[F]</td>
                          <td className="border border-slate-300 py-1 px-2 font-bold text-slate-900 whitespace-nowrap">리치웰 공급가액</td>
                          <td className="border border-slate-300 py-1 px-2 text-right font-bold text-slate-800 whitespace-nowrap">
                            <EditableNumber value={metrics.f_richwelfareSupplyPrice} onChange={handleUpdateF} unit="원" />
                          </td>
                          <td className="border border-slate-300 py-1 px-2 text-slate-600 text-[11px] truncate">
                            공급사(바디프랜드 등)에 우리가 지급해야 되는 공급물품대금 합계
                          </td>
                        </tr>
                        <tr className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors">
                          <td className="border border-slate-300 py-1 px-2 text-center font-bold text-slate-700 bg-slate-50/60 whitespace-nowrap">[G]</td>
                          <td className="border border-slate-300 py-1 px-2 font-bold text-slate-900 whitespace-nowrap">공급수수료</td>
                          <td className="border border-slate-300 py-1 px-2 text-right font-bold text-rose-700 whitespace-nowrap">
                            <EditableNumber value={metrics.g_supplyCommission} onChange={handleUpdateG} unit="원" />
                          </td>
                          <td className="border border-slate-300 py-1 px-2 text-slate-600 text-[11px] truncate">
                            설치확인서 등록건 기준 공급수수료 지급액 합계
                          </td>
                        </tr>
                        <tr className="border-b-2 border-slate-400 bg-amber-50/60 font-black">
                          <td className="border border-slate-400 py-1.5 px-2 text-center font-bold text-amber-900 bg-amber-100/60 whitespace-nowrap">[H]</td>
                          <td className="border border-slate-400 py-1.5 px-2 font-black text-amber-900 whitespace-nowrap">공급가 순익</td>
                          <td className="border border-slate-400 py-1.5 px-2 text-right font-black text-amber-900 whitespace-nowrap">
                            <EditableNumber
                              value={metrics.h_supplyProfit}
                              onChange={val => {
                                setMetrics(prev => ({ ...prev, h_supplyProfit: val, i_finalNetProfit: prev.d_operatingProfit + val }));
                              }}
                              unit="원"
                            />
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-amber-900 text-[11px] font-bold truncate">
                            [E] 공급가 입금액 - [F] 공급가액 - [G] 공급수수료
                          </td>
                        </tr>

                        {/* 3부: 최종 합산 순익 (I = D + H) */}
                        <tr className="bg-emerald-100/90 font-black border-t-2 border-b-2 border-slate-600 text-black">
                          <td className="border border-slate-600 py-2.5 px-2 text-center font-black text-emerald-950 bg-emerald-200/90 whitespace-nowrap">[I]</td>
                          <td className="border border-slate-600 py-2.5 px-2 font-black text-emerald-950 whitespace-nowrap">
                            더좋은라이프 최종 순익
                          </td>
                          <td className="border border-slate-600 py-2.5 px-2 text-right font-black text-emerald-950 whitespace-nowrap">
                            <EditableNumber
                              value={metrics.i_finalNetProfit}
                              onChange={val => setMetrics(prev => ({ ...prev, i_finalNetProfit: val }))}
                              unit="원"
                              className="font-black text-emerald-950 text-sm"
                            />
                          </td>
                          <td className="border border-slate-600 py-2.5 px-2 text-emerald-950 text-xs font-black truncate">
                            ★ [D] 렌탈 영업 순익 + [H] 공급가 순익 (당월 최종 실현 순익)
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* ---------------------------------------------------- */}
                  {/* [2] 본부·사업단별 / 상품별 영업 실적 및 수수료 지급 현황 (요청 2, 3 통합) */}
                  {/* ---------------------------------------------------- */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs sm:text-sm font-black text-black flex items-center gap-1 pl-2 border-l-[4px] border-black select-none">
                        2. 본부·사업단별 / 상품별 영업 실적 및 수수료 지급 현황
                      </h4>
                      <button
                        onClick={() => {
                          setHqProductSalesList(prev => [
                            ...prev,
                            { id: `hp-${Date.now()}`, hqName: '신규조직', prodName: '더좋은프리미엄540', count: 1, unitCommission: 750000, totalCommission: 750000, note: '-' }
                          ]);
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 print:hidden border border-blue-200 px-2 py-0.5 rounded bg-blue-50 cursor-pointer"
                      >
                        <Plus size={10} /> 행 추가
                      </button>
                    </div>

                    <table className="w-full text-left border-collapse border border-slate-400 text-xs table-fixed">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-black border-b border-slate-400 text-center select-none">
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[20%] whitespace-nowrap">본부 / 사업단</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[26%] whitespace-nowrap">판매 상품명</th>
                          <th className="border border-slate-400 py-1.5 px-1 text-center w-[10%] whitespace-nowrap">건수</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-right w-[18%] whitespace-nowrap">건당 수수료 (설정값)</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-right w-[20%] whitespace-nowrap">지급 수수료 합계</th>
                          <th className="border border-slate-400 py-1.5 px-1 text-center w-[6%] print:hidden">관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedHqSales.map(group => (
                          <React.Fragment key={group.hqName}>
                            {group.items.map((item, idx) => (
                              <tr key={item.id} className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors group">
                                {idx === 0 && (
                                  <td
                                    rowSpan={group.items.length + 1}
                                    className="border border-slate-300 py-1.5 px-2 font-bold text-slate-900 bg-slate-50/70 align-top"
                                  >
                                    <div className="flex flex-col h-full justify-between">
                                      <EditableText
                                        value={group.hqName}
                                        onChange={val => {
                                          setHqProductSalesList(p => p.map(it => it.hqName === group.hqName ? { ...it, hqName: val } : it));
                                        }}
                                        align="left"
                                        className="font-bold text-slate-950"
                                      />
                                      <div className="mt-2 text-[10px] text-slate-500 font-medium">
                                        소계: <strong className="text-blue-700 font-bold">{group.subtotalCount}건</strong>
                                      </div>
                                    </div>
                                  </td>
                                )}
                                <td className="border border-slate-300 py-1 px-2 font-semibold text-slate-800 truncate">
                                  <EditableText
                                    value={item.prodName}
                                    onChange={val => setHqProductSalesList(p => p.map(r => r.id === item.id ? { ...r, prodName: val } : r))}
                                    align="left"
                                  />
                                </td>
                                <td className="border border-slate-300 py-1 px-1 text-center font-bold text-slate-900 whitespace-nowrap">
                                  <EditableNumber
                                    value={item.count}
                                    onChange={val => setHqProductSalesList(p => p.map(r => r.id === item.id ? { ...r, count: val, totalCommission: val * r.unitCommission } : r))}
                                    unit="건"
                                  />
                                </td>
                                <td className="border border-slate-300 py-1 px-2 text-right font-medium text-slate-700 whitespace-nowrap">
                                  <EditableNumber
                                    value={item.unitCommission}
                                    onChange={val => setHqProductSalesList(p => p.map(r => r.id === item.id ? { ...r, unitCommission: val, totalCommission: r.count * val } : r))}
                                    unit="원"
                                  />
                                </td>
                                <td className="border border-slate-300 py-1 px-2 text-right font-bold text-blue-700 whitespace-nowrap">
                                  <EditableNumber
                                    value={item.totalCommission}
                                    onChange={val => setHqProductSalesList(p => p.map(r => r.id === item.id ? { ...r, totalCommission: val } : r))}
                                    unit="원"
                                  />
                                </td>
                                <td className="border border-slate-300 py-1 px-1 text-center print:hidden">
                                  <button
                                    onClick={() => setHqProductSalesList(p => p.filter(r => r.id !== item.id))}
                                    className="text-slate-300 hover:text-rose-600 transition-colors p-1"
                                    title="삭제"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {/* 본부/사업단별 소계 행 */}
                            <tr className="bg-slate-100/90 font-bold border-b-2 border-slate-300 text-slate-900">
                              <td className="border border-slate-300 py-1 px-2 text-left text-slate-700 text-[11px]" colSpan={2}>
                                └ <strong className="text-slate-950 font-bold">{group.hqName}</strong> 총 지급 합계 ({group.subtotalCount}건)
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right text-blue-900 font-black whitespace-nowrap" colSpan={2}>
                                {group.subtotalCommission.toLocaleString()} 원
                              </td>
                              <td className="border border-slate-300 py-1 px-1 print:hidden"></td>
                            </tr>
                          </React.Fragment>
                        ))}

                        {/* 전체 총합계 행 */}
                        <tr className="bg-slate-200 font-black border-t-2 border-slate-500 text-black">
                          <td className="border border-slate-400 py-1.5 px-2 text-left whitespace-nowrap" colSpan={2}>
                            전체 본부·사업단 영업수수료 총 합계 ([B])
                          </td>
                          <td className="border border-slate-400 py-1.5 px-1 text-center whitespace-nowrap">
                            {hqProductSalesList.reduce((s, r) => s + r.count, 0).toLocaleString()} 건
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-right text-[11px] text-slate-600 font-normal whitespace-nowrap">
                            총 {groupedHqSales.length}개 조직
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-right text-blue-950 font-black whitespace-nowrap">
                            {hqProductSalesList.reduce((s, r) => s + r.totalCommission, 0).toLocaleString()} 원
                          </td>
                          <td className="border border-slate-400 py-1.5 px-1 print:hidden"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* ---------------------------------------------------- */}
                  {/* [3] 특수수당 및 본사 지출 내역 요약 (요청 4 반영) */}
                  {/* ---------------------------------------------------- */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs sm:text-sm font-black text-black flex items-center gap-1 pl-2 border-l-[4px] border-black select-none">
                        3. 특수수당 및 본사 지출 내역 요약 ([C] 차감 상세)
                      </h4>
                      <button
                        onClick={() => {
                          setSpecialExpenseList(prev => [
                            ...prev,
                            { id: `s-${Date.now()}`, category: '추가지출', name: '항목명', count: 1, amount: 0, note: '-' }
                          ]);
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 print:hidden border border-blue-200 px-2 py-0.5 rounded bg-blue-50 cursor-pointer"
                      >
                        <Plus size={10} /> 행 추가
                      </button>
                    </div>

                    <table className="w-full text-left border-collapse border border-slate-400 text-xs table-fixed">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-black border-b border-slate-400 text-center select-none">
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[18%] whitespace-nowrap">구분</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[28%] whitespace-nowrap">지출 항목명 / 대상</th>
                          <th className="border border-slate-400 py-1.5 px-1 text-center w-[12%] whitespace-nowrap">건수</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-right w-[20%] whitespace-nowrap">지출 금액</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[18%] whitespace-nowrap">비고</th>
                          <th className="border border-slate-400 py-1.5 px-1 text-center w-[4%] print:hidden"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {specialExpenseList.map(row => (
                          <tr key={row.id} className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors group">
                            <td className="border border-slate-300 py-1 px-2 font-bold text-slate-700 whitespace-nowrap">
                              <EditableText
                                value={row.category}
                                onChange={val => setSpecialExpenseList(p => p.map(r => r.id === row.id ? { ...r, category: val } : r))}
                                align="left"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-2 font-bold text-slate-900 truncate">
                              <EditableText
                                value={row.name}
                                onChange={val => setSpecialExpenseList(p => p.map(r => r.id === row.id ? { ...r, name: val } : r))}
                                align="left"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-1 text-center text-slate-700 whitespace-nowrap">
                              <EditableText
                                value={String(row.count)}
                                onChange={val => setSpecialExpenseList(p => p.map(r => r.id === row.id ? { ...r, count: val } : r))}
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-bold text-purple-700 whitespace-nowrap">
                              <EditableNumber
                                value={row.amount}
                                onChange={val => setSpecialExpenseList(p => p.map(r => r.id === row.id ? { ...r, amount: val } : r))}
                                unit="원"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-slate-600 text-[11px] truncate">
                              <EditableText
                                value={row.note}
                                onChange={val => setSpecialExpenseList(p => p.map(r => r.id === row.id ? { ...r, note: val } : r))}
                                align="left"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-1 text-center print:hidden">
                              <button
                                onClick={() => setSpecialExpenseList(p => p.filter(r => r.id !== row.id))}
                                className="text-slate-300 hover:text-rose-600"
                                title="삭제"
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {/* 합계 행 */}
                        <tr className="bg-slate-200/90 font-black border-t-2 border-slate-400 text-black">
                          <td className="border border-slate-400 py-1.5 px-2 text-left whitespace-nowrap" colSpan={3}>
                            본사 추가 지출 소계 ([C] 합계)
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-right text-purple-950 font-black whitespace-nowrap">
                            {specialExpenseList.reduce((s, r) => s + r.amount, 0).toLocaleString()} 원
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-slate-600 text-[11px] font-normal" colSpan={2}>
                            총 {specialExpenseList.length}건
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* ---------------------------------------------------- */}
                  {/* [4] 공급사 정산관리 총괄 요약 (에넥스 총 입금액 & 공급사별 총 공급가액) (요청 5 반영) */}
                  {/* ---------------------------------------------------- */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs sm:text-sm font-black text-black flex items-center gap-1 pl-2 border-l-[4px] border-black select-none">
                        4. 공급사 정산관리 총괄 요약 (에넥스 총 입금액 및 공급사 지급 공급가액)
                      </h4>
                      <button
                        onClick={() => {
                          setSupplierSummaryList(prev => [
                            ...prev,
                            { id: `supp-${Date.now()}`, supplierName: '신규공급사', count: 0, depositPrice: 0, supplyPrice: 0, supplyCommission: 0, unitMargin: 0, settlementCondition: '-' }
                          ]);
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 print:hidden border border-blue-200 px-2 py-0.5 rounded bg-blue-50 cursor-pointer"
                      >
                        <Plus size={10} /> 행 추가
                      </button>
                    </div>

                    <table className="w-full text-left border-collapse border border-slate-400 text-xs table-fixed">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-black border-b border-slate-400 text-center select-none">
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[32%] whitespace-nowrap">공급사명</th>
                          <th className="border border-slate-400 py-1.5 px-1 text-center w-[14%] whitespace-nowrap">정산 건수</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-right w-[27%] whitespace-nowrap">에넥스 총 입금액(E)</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-right w-[27%] whitespace-nowrap">공급사 지급 공급가액(F)</th>
                          <th className="border border-slate-400 py-1.5 px-1 text-center w-[4%] print:hidden"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {supplierSummaryList.map(row => (
                          <tr key={row.id} className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors group">
                            <td className="border border-slate-300 py-1 px-2 font-bold text-slate-900 whitespace-nowrap truncate">
                              <EditableText
                                value={row.supplierName}
                                onChange={val => setSupplierSummaryList(p => p.map(r => r.id === row.id ? { ...r, supplierName: val } : r))}
                                align="left"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-1 text-center font-bold text-slate-900 whitespace-nowrap">
                              <EditableNumber
                                value={row.count}
                                onChange={val => setSupplierSummaryList(p => p.map(r => r.id === row.id ? { ...r, count: val } : r))}
                                unit="건"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-black text-emerald-700 whitespace-nowrap">
                              <EditableNumber
                                value={row.depositPrice}
                                onChange={val => setSupplierSummaryList(p => p.map(r => r.id === row.id ? { ...r, depositPrice: val, unitMargin: val > 0 ? val - r.supplyPrice - r.supplyCommission : 0 } : r))}
                                unit="원"
                                showZeroAsBlank={true}
                                placeholder="직접 입력"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-bold text-slate-800 whitespace-nowrap">
                              <EditableNumber
                                value={row.supplyPrice}
                                onChange={val => setSupplierSummaryList(p => p.map(r => r.id === row.id ? { ...r, supplyPrice: val } : r))}
                                unit="원"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-1 text-center print:hidden">
                              <button
                                onClick={() => setSupplierSummaryList(p => p.filter(r => r.id !== row.id))}
                                className="text-slate-300 hover:text-rose-600"
                                title="삭제"
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {/* 합계 행 */}
                        <tr className="bg-slate-200/90 font-black border-t-2 border-slate-400 text-black">
                          <td className="border border-slate-400 py-1.5 px-2 text-left whitespace-nowrap">공급사 정산 총계</td>
                          <td className="border border-slate-400 py-1.5 px-1 text-center whitespace-nowrap">
                            {supplierSummaryList.reduce((s, r) => s + r.count, 0).toLocaleString()} 건
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-right text-emerald-900 whitespace-nowrap font-black">
                            {supplierSummaryList.reduce((s, r) => s + r.depositPrice, 0).toLocaleString()} 원
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-right text-slate-900 whitespace-nowrap font-black">
                            {supplierSummaryList.reduce((s, r) => s + r.supplyPrice, 0).toLocaleString()} 원
                          </td>
                          <td className="border border-slate-400 py-1.5 px-1 print:hidden"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* ---------------------------------------------------- */}
                  {/* [5] 공급사 제품별 세부 정산 내역 (제품별 에넥스 입금액 & 제품별 공급단가) (요청 6 반영) */}
                  {/* ---------------------------------------------------- */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs sm:text-sm font-black text-black flex items-center gap-1 pl-2 border-l-[4px] border-black select-none">
                        5. 공급사 제품별 세부 정산 내역 (제품별 에넥스 입금액 및 제품별 공급단가)
                      </h4>
                      <div className="flex items-center gap-1.5 print:hidden">
                        <button
                          onClick={handleSyncSupplierPrices}
                          title="공급사 관리에서 설정된 최신 에넥스 입금가 및 공급단가를 다시 불러와 적용합니다."
                          className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 border border-emerald-300 px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 cursor-pointer shadow-2xs transition-colors"
                        >
                          <RefreshCw size={10} className="text-emerald-600" />
                          <span>공급사 설정 동기화</span>
                        </button>
                        <button
                          onClick={() => {
                            setSupplierProductDetailList(prev => [
                              ...prev,
                              { id: `sp-${Date.now()}`, supplierName: '공급사', prodName: '취급제품명', count: 1, unitDeposit: 0, unitSupplyPrice: 1150000, unitCommission: 170000, unitMargin: 0, totalSupplyPrice: 1150000, totalMargin: 0, note: '-' }
                            ]);
                          }}
                          className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 border border-blue-200 px-2 py-0.5 rounded bg-blue-50 cursor-pointer"
                        >
                          <Plus size={10} /> 행 추가
                        </button>
                      </div>
                    </div>

                    <table className="w-full text-left border-collapse border border-slate-400 text-xs table-fixed">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-black border-b border-slate-400 text-center select-none">
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[14%] whitespace-nowrap">공급사</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[20%] whitespace-nowrap">취급 제품명</th>
                          <th className="border border-slate-400 py-1.5 px-1 text-center w-[7%] whitespace-nowrap">건수</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-right w-[15%] whitespace-nowrap">건당 에넥스입금</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-right w-[15%] whitespace-nowrap">제품별 공급단가</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-right w-[14%] whitespace-nowrap">총 공급가액</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-right w-[15%] whitespace-nowrap">총 공급마진(순익)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {supplierProductDetailList.map(row => (
                          <tr key={row.id} className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors group">
                            <td className="border border-slate-300 py-1 px-2 font-bold text-slate-700 whitespace-nowrap truncate">
                              <EditableText
                                value={row.supplierName}
                                onChange={val => setSupplierProductDetailList(p => p.map(r => r.id === row.id ? { ...r, supplierName: val } : r))}
                                align="left"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-2 font-bold text-slate-900 truncate">
                              <EditableText
                                value={row.prodName}
                                onChange={val => setSupplierProductDetailList(p => p.map(r => r.id === row.id ? { ...r, prodName: val } : r))}
                                align="left"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-1 text-center font-bold text-slate-900 whitespace-nowrap">
                              <EditableNumber
                                value={row.count}
                                onChange={val => setSupplierProductDetailList(p => p.map(r => r.id === row.id ? {
                                  ...r,
                                  count: val,
                                  totalSupplyPrice: val * r.unitSupplyPrice,
                                  totalMargin: val > 0 && r.unitDeposit > 0 ? val * (r.unitDeposit - r.unitSupplyPrice - r.unitCommission) : 0
                                } : r))}
                                unit="건"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-medium text-emerald-700 whitespace-nowrap">
                              <EditableNumber
                                value={row.unitDeposit}
                                onChange={val => setSupplierProductDetailList(p => p.map(r => r.id === row.id ? {
                                  ...r,
                                  unitDeposit: val,
                                  unitMargin: val > 0 ? val - r.unitSupplyPrice - r.unitCommission : 0,
                                  totalMargin: val > 0 ? r.count * (val - r.unitSupplyPrice - r.unitCommission) : 0
                                } : r))}
                                unit="원"
                                showZeroAsBlank={true}
                                placeholder="직접 입력"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-bold text-slate-800 whitespace-nowrap">
                              <EditableNumber
                                value={row.unitSupplyPrice}
                                onChange={val => setSupplierProductDetailList(p => p.map(r => r.id === row.id ? {
                                  ...r,
                                  unitSupplyPrice: val,
                                  totalSupplyPrice: r.count * val,
                                  unitMargin: r.unitDeposit > 0 ? r.unitDeposit - val - r.unitCommission : 0,
                                  totalMargin: r.unitDeposit > 0 ? r.count * (r.unitDeposit - val - r.unitCommission) : 0
                                } : r))}
                                unit="원"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-semibold text-slate-900 whitespace-nowrap">
                              <EditableNumber
                                value={row.totalSupplyPrice}
                                onChange={val => setSupplierProductDetailList(p => p.map(r => r.id === row.id ? { ...r, totalSupplyPrice: val } : r))}
                                unit="원"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-black text-amber-950 whitespace-nowrap">
                              <EditableNumber
                                value={row.totalMargin}
                                onChange={val => setSupplierProductDetailList(p => p.map(r => r.id === row.id ? { ...r, totalMargin: val } : r))}
                                unit="원"
                              />
                            </td>
                          </tr>
                        ))}
                        {/* 합계 행 */}
                        <tr className="bg-slate-200/90 font-black border-t-2 border-slate-400 text-black">
                          <td className="border border-slate-400 py-1.5 px-2 text-left whitespace-nowrap" colSpan={2}>
                            제품별 세부 합계
                          </td>
                          <td className="border border-slate-400 py-1.5 px-1 text-center whitespace-nowrap">
                            {supplierProductDetailList.reduce((s, r) => s + r.count, 0).toLocaleString()} 건
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-right text-slate-500 text-[11px] font-normal whitespace-nowrap" colSpan={2}>
                            총 {supplierProductDetailList.length}개 품목
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-right text-slate-950 font-black whitespace-nowrap">
                            {supplierProductDetailList.reduce((s, r) => s + r.totalSupplyPrice, 0).toLocaleString()} 원
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-right text-amber-950 font-black whitespace-nowrap">
                            {supplierProductDetailList.reduce((s, r) => s + r.totalMargin, 0).toLocaleString()} 원
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* ---------------------------------------------------- */}
                  {/* [6] 하단 대표님 보고 의견 메모 */}
                  {/* ---------------------------------------------------- */}
                  {monthEndMemo.trim() && (
                    <div className="mt-4 pt-3 border-t border-dashed border-slate-400 text-xs text-slate-800 leading-relaxed font-semibold">
                      <div className="whitespace-pre-wrap">{monthEndMemo}</div>
                    </div>
                  )}
                </div>
              )}

              {/* ==================================================== */}
              {/* 인쇄 전용 CSS 스타일링 (A4 최적화 & 두 줄 잘림 방지) */}
              {/* ==================================================== */}
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
                    margin: 8mm 10mm;
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
                    word-wrap: normal !important;
                    white-space: nowrap !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                  }

                  .whitespace-nowrap {
                    white-space: nowrap !important;
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

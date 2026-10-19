import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  RefreshCw,
  Download,
  Save
} from 'lucide-react';
import * as XLSXModule from 'xlsx';
const XLSX = (window as any).XLSX || XLSXModule;
import { motion } from 'motion/react';
import {
  SupplierItem,
  SupplierProductSetting,
  loadSuppliersFromStorage,
  saveSuppliersToStorage
} from './SupplierManagementModal';

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
  align = 'center',
  allowWrap = false
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  isPrint?: boolean;
  align?: 'left' | 'center' | 'right';
  allowWrap?: boolean;
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
        className={`w-full px-1.5 py-0.5 border border-rose-500 rounded bg-white text-slate-900 font-bold focus:outline-none text-${align} shadow-xs text-xs ${allowWrap ? 'whitespace-normal' : 'whitespace-nowrap'}`}
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      title="클릭하여 직접 수정"
      className={`cursor-pointer hover:bg-amber-100 hover:text-slate-950 transition-colors rounded px-1 py-0.5 ${allowWrap ? 'inline break-words leading-tight whitespace-normal' : 'inline-block whitespace-nowrap'} ${className}`}
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
      className={`cursor-pointer hover:bg-amber-100 hover:text-slate-950 transition-colors rounded px-0.5 py-0.5 font-mono tracking-tight whitespace-nowrap inline-flex items-center justify-end gap-0.5 select-none ${className}`}
    >
      <span>{value.toLocaleString()}</span>
      {unit && <span className="text-[10px] text-slate-500 font-medium shrink-0 ml-0.5">{unit}</span>}
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
    unitDeposit: number;          // 제품별 에넥스 건당 입금액 - 초기값 공란
    unitSupplyPrice: number;      // 제품별 공급단가 (발주관리/공급사 마스터 공급단가)
    unitCommission: number;       // 제품별 건당 공급수수료
    totalSupplyPrice: number;     // 제품별 총 공급가액
    totalSupplyCommission: number;// 제품별 총 공급수수료 (count * unitCommission)
    unitMargin: number;           // 제품별 건당 마진
    totalMargin: number;          // 제품별 총 마진
    note: string;
  }>>([]);

  // 6. 대표님 보고 종합 의견
  const [monthEndMemo, setMonthEndMemo] = useState<string>(() => {
    return '※ 렌탈 영업 순익 및 리치웰 공급가 마진이 정상 반영된 최종 결산 보고입니다.\n※ 설치확인서 등록 및 배송 완료 건을 기준으로 지급이 확정되었습니다.';
  });

  // 사용자 직접 수정 내용 보존 및 자동 복원 관련 상태/Ref
  const [hasCustomSavedData, setHasCustomSavedData] = useState(false);
  const isInitializedRef = useRef(false);
  const isAutoComputingRef = useRef(false);
  const getReportCacheKey = (month: string) => `erp_month_end_report_custom_v3_${month}`;

  // 공급사 마스터 상태 및 서버 비동기 로딩 상태
  const [suppliersData, setSuppliersData] = useState<SupplierItem[]>(() => loadSuppliersFromStorage());
  const [isSyncingSuppliers, setIsSyncingSuppliers] = useState(false);

  // 서버(/api/sheets/suppliers/load)에서 최신 공급사 및 제품/단가 설정을 가져와 로컬스토리지에 캐시
  const fetchAndSyncSuppliers = async (): Promise<SupplierItem[]> => {
    try {
      setIsSyncingSuppliers(true);
      const res = await fetch('/api/sheets/suppliers/load');
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.suppliers) && json.suppliers.length > 0) {
          saveSuppliersToStorage(json.suppliers);
          setSuppliersData(json.suppliers);
          return json.suppliers;
        }
      }
    } catch (e) {
      console.warn('[월말보고서] 공급사 서버 로드 실패:', e);
    } finally {
      setIsSyncingSuppliers(false);
    }
    return loadSuppliersFromStorage();
  };

  // ----------------------------------------------------
  // ERP 원본 데이터 기반 월말보고서 기본값 자동 산출 엔진
  // ----------------------------------------------------
  const computeMonthEndDefaults = (overrideSuppliers?: SupplierItem[]) => {
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
    // 발주관리/공급사 마스터(erp_suppliers_master_v3) 조회 및 제품별 에넥스 입금가 & 공급단가 연동
    let masterSuppliers: SupplierItem[] = [];
    if (overrideSuppliers && overrideSuppliers.length > 0) {
      masterSuppliers = overrideSuppliers;
    } else if (suppliersData && suppliersData.length > 0) {
      masterSuppliers = suppliersData;
    } else {
      masterSuppliers = loadSuppliersFromStorage();
    }

    // 10월 결산 유효 배송완료 건(validItems)에서 공급사 취급제품 매칭 및 실제 건수 집계
    const seenRentalNos = new Set<string>();
    const productCountMap = new Map<string, number>();
    const productCommissionSumMap = new Map<string, number>();

    validItems.forEach(item => {
      const rNo = (item.rentalNo || '').trim();
      if (rNo && rNo !== '-' && rNo !== 'null' && rNo !== 'undefined') {
        if (seenRentalNos.has(rNo)) return;
        seenRentalNos.add(rNo);
      }

      const targetProdString = `${item.rentalProd || ''} ${item.prodName || ''}`.toLowerCase();

      for (const supp of masterSuppliers) {
        if (!supp.isActive && supp.isActive !== undefined) continue;
        for (const prod of (supp.products || [])) {
          const kw = (prod.productKeyword || prod.productName || '').trim().toLowerCase();
          if (kw && targetProdString.includes(kw)) {
            const pKey = `${supp.name || supp.id}___${prod.productName || prod.productKeyword}`;
            productCountMap.set(pKey, (productCountMap.get(pKey) || 0) + 1);

            // 공급수수료 매칭 (본부별 수수료 우선 매칭, 없으면 대표 단일 수수료)
            let itemComm = 0;
            if (Array.isArray(prod.hqCommissions) && prod.hqCommissions.length > 0) {
              const targetHq = prod.hqCommissions.find((h: any) => h.hqName && item.hq && (item.hq.includes(h.hqName) || h.hqName.includes(item.hq)));
              itemComm = targetHq ? (Number(targetHq.commission) || 0) : (Number(prod.hqCommissions[0]?.commission) || 0);
            } else {
              itemComm = Number(prod.supplyCommission) || 0;
            }
            productCommissionSumMap.set(pKey, (productCommissionSumMap.get(pKey) || 0) + itemComm);
            return; // 1개 계약건당 1개 제품만 매칭
          }
        }
      }
    });

    // 5번 제품별 세부 목록 동적 생성
    const initialProductDetail: typeof supplierProductDetailList = [];
    let pIdx = 1;

    if (Array.isArray(masterSuppliers) && masterSuppliers.length > 0) {
      masterSuppliers.forEach(supp => {
        if (!supp.isActive && supp.isActive !== undefined) return;
        (supp.products || []).forEach(prod => {
          const pName = prod.productName || prod.productKeyword || '제품';
          const pKey = `${supp.name || supp.id}___${pName}`;
          const actualCount = productCountMap.get(pKey) || 0;

          // 사용자의 요청: 0건인 내용은 표기하지 않음
          if (actualCount <= 0) return;

          const enex = Number(prod.enexPrice) || 0;
          const supply = Number(prod.supplyPrice) || 0;

          // 공급수수료 단가 및 총액 연동 (단일 수수료 또는 본부별 수수료 설정값 활용)
          let defaultUnitComm = Number(prod.supplyCommission) || 0;
          if (defaultUnitComm === 0 && Array.isArray(prod.hqCommissions) && prod.hqCommissions.length > 0) {
            defaultUnitComm = Number(prod.hqCommissions[0]?.commission) || 0;
          }

          const commTotal = productCommissionSumMap.has(pKey)
            ? (productCommissionSumMap.get(pKey) || 0)
            : actualCount * defaultUnitComm;
          const commUnit = actualCount > 0 ? Math.round(commTotal / actualCount) : defaultUnitComm;

          const supTotal = actualCount * supply;
          const margin = enex > 0 ? (actualCount * enex) - supTotal - commTotal : 0;

          initialProductDetail.push({
            id: `sp-${pIdx++}`,
            supplierName: supp.name || '공급사',
            prodName: pName,
            count: actualCount,
            unitDeposit: enex,
            unitSupplyPrice: supply,
            unitCommission: commUnit,
            totalSupplyPrice: supTotal,
            totalSupplyCommission: commTotal,
            unitMargin: enex > 0 ? enex - supply - commUnit : 0,
            totalMargin: margin,
            note: enex > 0 ? '공급사관리 에넥스입금가 연동' : `배송완료 ${actualCount}건`
          });
        });
      });

      // [요청 5] 공급사별 우선 정렬 (공급사명 기준 묶음 후 건수 내림차순 및 제품명 정렬)
      initialProductDetail.sort((a, b) => {
        const suppComp = (a.supplierName || '').localeCompare(b.supplierName || '');
        if (suppComp !== 0) return suppComp;
        if (b.count !== a.count) return b.count - a.count;
        return (a.prodName || '').localeCompare(b.prodName || '');
      });
    }

    // 만약 공급사 마스터가 전혀 비어있거나 실적 품목이 전혀 없는 경우에만 최소 fallback 1개 구성
    if (initialProductDetail.length === 0) {
      initialProductDetail.push(
        {
          id: 'sp-1',
          supplierName: '바디프랜드',
          prodName: '2구좌_[바디프랜드]안마의자(파밀레S(A))',
          count: 14,
          unitDeposit: 0,
          unitSupplyPrice: 1400000,
          unitCommission: 0,
          totalSupplyPrice: 14 * 1400000,
          totalSupplyCommission: 0,
          unitMargin: 0,
          totalMargin: 0,
          note: '설치확인서 등록 14건'
        }
      );
    }

    setSupplierProductDetailList(initialProductDetail);

    // 4번: 공급사 정산관리 총괄 요약 (5번 제품 목록을 공급사별로 자동 그룹핑 집계, 0건 공급사 제외)
    const suppSummaryMap = new Map<string, {
      supplierName: string;
      count: number;
      depositPrice: number;
      supplyPrice: number;
      supplyCommission: number;
    }>();

    initialProductDetail.forEach(p => {
      const cur = suppSummaryMap.get(p.supplierName) || {
        supplierName: p.supplierName,
        count: 0,
        depositPrice: 0,
        supplyPrice: 0,
        supplyCommission: 0
      };
      cur.count += p.count;
      cur.depositPrice += (p.unitDeposit * p.count);
      cur.supplyPrice += p.totalSupplyPrice;
      cur.supplyCommission += p.totalSupplyCommission;
      suppSummaryMap.set(p.supplierName, cur);
    });

    // 0건인 공급사는 제외하고 실적(count > 0) 공급사만 총괄 요약에 표시
    const initialSupplierSummary: typeof supplierSummaryList = Array.from(suppSummaryMap.values())
      .filter(s => s.count > 0)
      .map((s, idx) => ({
        id: `supp-sum-${idx + 1}`,
        supplierName: s.supplierName,
        count: s.count,
        depositPrice: s.depositPrice,
        supplyPrice: s.supplyPrice,
        supplyCommission: s.supplyCommission,
        unitMargin: s.depositPrice > 0 ? s.depositPrice - s.supplyPrice - s.supplyCommission : 0,
        settlementCondition: s.supplierName.includes('바디프랜드') ? '당월 말일 결제 (확인서 등록건)' : '익월 말일 세금계산서 발행 지급'
      }));

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
    const g_rich_comm = initialSupplierSummary.reduce((acc, cur) => acc + cur.supplyCommission, 0);

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

  // ----------------------------------------------------
  // 실시간 연동 헬퍼: 5번 제품별 세부 수정 시 -> 4번 요약 및 1번 손익 [E, F, G, H, I] 동기화
  // ----------------------------------------------------
  const syncFromProductDetails = (
    newDetails: typeof supplierProductDetailList,
    currentSummaryList: typeof supplierSummaryList = supplierSummaryList
  ) => {
    const suppMap = new Map<string, { count: number; depositPrice: number; supplyPrice: number; supplyCommission: number }>();
    newDetails.forEach(p => {
      if (p.count <= 0) return;
      const cur = suppMap.get(p.supplierName) || { count: 0, depositPrice: 0, supplyPrice: 0, supplyCommission: 0 };
      cur.count += p.count;
      cur.depositPrice += (p.unitDeposit * p.count);
      cur.supplyPrice += p.totalSupplyPrice;
      cur.supplyCommission += p.totalSupplyCommission;
      suppMap.set(p.supplierName, cur);
    });

    const nextSummary = Array.from(suppMap.entries()).map(([sName, data], idx) => {
      const existing = currentSummaryList.find(s => s.supplierName === sName);
      return {
        id: existing?.id || `supp-sum-${idx + 1}`,
        supplierName: sName,
        count: data.count,
        depositPrice: data.depositPrice,
        supplyPrice: data.supplyPrice,
        supplyCommission: data.supplyCommission,
        unitMargin: data.depositPrice > 0 ? data.depositPrice - data.supplyPrice - data.supplyCommission : 0,
        settlementCondition: existing?.settlementCondition || (sName.includes('바디프랜드') ? '당월 말일 결제 (확인서 등록건)' : '익월 말일 세금계산서 발행 지급')
      };
    });

    setSupplierSummaryList(nextSummary);

    // 1번 핵심 손익 지표 [E, F, G, H, I] 동기화
    const totalDep = nextSummary.reduce((s, r) => s + r.depositPrice, 0);
    const totalSup = nextSummary.reduce((s, r) => s + r.supplyPrice, 0);
    const totalComm = nextSummary.reduce((s, r) => s + r.supplyCommission, 0);
    const totalMargin = totalDep > 0 ? totalDep - totalSup - totalComm : 0;

    setMetrics(prev => {
      const d = prev.a_enexDeposit > 0 ? prev.a_enexDeposit - prev.b_salesCommission - prev.c_specialAndMaintenance : 0;
      return {
        ...prev,
        e_richwelfareDeposit: totalDep,
        f_richwelfareSupplyPrice: totalSup,
        g_supplyCommission: totalComm,
        h_supplyProfit: totalMargin,
        d_operatingProfit: d,
        i_finalNetProfit: d + totalMargin
      };
    });
  };

  // 4번 공급사 총괄 요약 수정 시 -> 1번 손익 [E, F, G, H, I] 동기화
  const syncFromSupplierSummary = (newSummaries: typeof supplierSummaryList) => {
    const totalDep = newSummaries.reduce((s, r) => s + r.depositPrice, 0);
    const totalSup = newSummaries.reduce((s, r) => s + r.supplyPrice, 0);
    const totalComm = newSummaries.reduce((s, r) => s + r.supplyCommission, 0);
    const totalMargin = totalDep > 0 ? totalDep - totalSup - totalComm : 0;

    setMetrics(prev => {
      const d = prev.a_enexDeposit > 0 ? prev.a_enexDeposit - prev.b_salesCommission - prev.c_specialAndMaintenance : 0;
      return {
        ...prev,
        e_richwelfareDeposit: totalDep,
        f_richwelfareSupplyPrice: totalSup,
        g_supplyCommission: totalComm,
        h_supplyProfit: totalMargin,
        d_operatingProfit: d,
        i_finalNetProfit: d + totalMargin
      };
    });
  };

  // 2번 본부별 영업실적 수정 핸들러
  const updateHqProductSalesList = (newItems: typeof hqProductSalesList) => {
    setHqProductSalesList(newItems);
    const newB = newItems.reduce((s, r) => s + r.totalCommission, 0);
    setMetrics(m => {
      const d = m.a_enexDeposit > 0 ? m.a_enexDeposit - newB - m.c_specialAndMaintenance : 0;
      return { ...m, b_salesCommission: newB, d_operatingProfit: d, i_finalNetProfit: d + m.h_supplyProfit };
    });
  };

  // 3번 특수수당 및 지출내역 수정 핸들러
  const updateSpecialExpenseList = (newItems: typeof specialExpenseList) => {
    setSpecialExpenseList(newItems);
    const newC = newItems.reduce((s, r) => s + r.amount, 0);
    setMetrics(m => {
      const d = m.a_enexDeposit > 0 ? m.a_enexDeposit - m.b_salesCommission - newC : 0;
      return { ...m, c_specialAndMaintenance: newC, d_operatingProfit: d, i_finalNetProfit: d + m.h_supplyProfit };
    });
  };

  // 4번 공급사 요약 수정 핸들러
  const updateSupplierSummary = (newItems: typeof supplierSummaryList) => {
    setSupplierSummaryList(newItems);
    syncFromSupplierSummary(newItems);
  };

  // 5번 제품별 상세 수정 핸들러
  const updateSupplierProductDetails = (newItems: typeof supplierProductDetailList) => {
    setSupplierProductDetailList(newItems);
    syncFromProductDetails(newItems);
  };

  // ----------------------------------------------------
  // 모달 닫힘 감지 시 Ref 리셋 (재오픈 시 빈 상태 덮어쓰기 방지)
  // ----------------------------------------------------
  useEffect(() => {
    if (!isOpen) {
      isInitializedRef.current = false;
      isAutoComputingRef.current = false;
    }
  }, [isOpen]);

  // ----------------------------------------------------
  // 모달 오픈 시: 저장된 수정본(기본값)이 있으면 우선 복원, 없으면 자동 계산
  // ----------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    const cacheKey = getReportCacheKey(selectedMonth);
    const cachedStr = localStorage.getItem(cacheKey);

    if (cachedStr) {
      try {
        const cached = JSON.parse(cachedStr);
        if (cached && cached.metrics) {
          isAutoComputingRef.current = true;
          setMetrics(cached.metrics);
          if (Array.isArray(cached.hqProductSalesList)) setHqProductSalesList(cached.hqProductSalesList);
          if (Array.isArray(cached.specialExpenseList)) setSpecialExpenseList(cached.specialExpenseList);
          if (Array.isArray(cached.supplierSummaryList)) setSupplierSummaryList(cached.supplierSummaryList);
          if (Array.isArray(cached.supplierProductDetailList)) setSupplierProductDetailList(cached.supplierProductDetailList);
          if (cached.monthEndMemo) setMonthEndMemo(cached.monthEndMemo);
          setHasCustomSavedData(true);
          setTimeout(() => {
            isAutoComputingRef.current = false;
            isInitializedRef.current = true;
          }, 100);
          return;
        }
      } catch (e) {
        console.warn('[월말보고서 캐시 로드 실패]', e);
      }
    }

    // 캐시가 없으면 ERP 원본 데이터 기반 자동 계산값 산출
    setHasCustomSavedData(false);
    isAutoComputingRef.current = true;
    computeMonthEndDefaults();
    fetchAndSyncSuppliers().then(latest => {
      if (latest && latest.length > 0) {
        computeMonthEndDefaults(latest);
      }
      setTimeout(() => {
        isAutoComputingRef.current = false;
        isInitializedRef.current = true;
      }, 100);
    });
  }, [isOpen, selectedMonth]);

  // ----------------------------------------------------
  // 사용자 수정 내용 로컬 영구 보관 (화면 닫았다 다시 열어도 기본값으로 완벽 유지)
  // ----------------------------------------------------
  useEffect(() => {
    if (!isInitializedRef.current || isAutoComputingRef.current) return;
    if (!isOpen) return;

    try {
      const key = getReportCacheKey(selectedMonth);
      const payload = {
        metrics,
        hqProductSalesList,
        specialExpenseList,
        supplierSummaryList,
        supplierProductDetailList,
        monthEndMemo,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(key, JSON.stringify(payload));
      setHasCustomSavedData(true);
    } catch (e) {
      console.warn('[월말보고서 캐시 저장 실패]', e);
    }
  }, [
    metrics,
    hqProductSalesList,
    specialExpenseList,
    supplierSummaryList,
    supplierProductDetailList,
    monthEndMemo,
    selectedMonth,
    isOpen
  ]);

  // ----------------------------------------------------
  // [기본값으로 저장] 사용자가 수정한 내용을 공식 기본값으로 저장
  // ----------------------------------------------------
  const handleSaveAsDefault = () => {
    try {
      const key = getReportCacheKey(selectedMonth);
      const payload = {
        metrics,
        hqProductSalesList,
        specialExpenseList,
        supplierSummaryList,
        supplierProductDetailList,
        monthEndMemo,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(key, JSON.stringify(payload));
      setHasCustomSavedData(true);
      alert(`[${selectedMonth}] 월말보고서 내용이 공식 기본값으로 저장되었습니다.\n\n화면을 닫거나 새로고침해도 이 수정본이 항상 기본값으로 표시됩니다.`);
    } catch (e) {
      console.error('[월말보고서 저장 오류]', e);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  // ----------------------------------------------------
  // [복원] 사용자가 원할 때 언제든 ERP 원본 자동 계산값으로 초기화
  // ----------------------------------------------------
  const handleResetToAutoComputed = () => {
    if (!window.confirm('ERP 원본 계약 데이터 기반의 자동 계산값으로 복원하시겠습니까?\n\n직접 수정한 내용과 입력한 에넥스 입금액이 초기화되고 최초 산출값으로 되돌아갑니다.')) {
      return;
    }
    try {
      const cacheKey = getReportCacheKey(selectedMonth);
      localStorage.removeItem(cacheKey);
    } catch (e) {}
    setHasCustomSavedData(false);
    isAutoComputingRef.current = true;
    computeMonthEndDefaults();
    fetchAndSyncSuppliers().then(latest => {
      if (latest && latest.length > 0) {
        computeMonthEndDefaults(latest);
      }
      setTimeout(() => {
        isAutoComputingRef.current = false;
        isInitializedRef.current = true;
      }, 100);
    });
    alert('ERP 원본 자동 계산값으로 복원되었습니다.');
  };

  // ----------------------------------------------------
  // [엑셀 다운로드] 월말보고서 5대 정산표 전체를 .xlsx 로 내보내기
  // ----------------------------------------------------
  const handleExportExcel = () => {
    try {
      if (!XLSX || !XLSX.utils) {
        alert('엑셀 변환 라이브러리를 불러오지 못했습니다.');
        return;
      }

      const wb = XLSX.utils.book_new();

      // 통계 합계 계산
      const totalHqCount = hqProductSalesList.reduce((acc, h) => acc + h.count, 0);
      const totalHqComm = hqProductSalesList.reduce((acc, h) => acc + h.totalCommission, 0);
      const totalSpecialAmount = specialExpenseList.reduce((acc, s) => acc + s.amount, 0);
      const totalSuppCount = supplierSummaryList.reduce((acc, s) => acc + s.count, 0);
      const totalSuppDeposit = supplierSummaryList.reduce((acc, s) => acc + s.depositPrice, 0);
      const totalSuppPrice = supplierSummaryList.reduce((acc, s) => acc + s.supplyPrice, 0);
      const totalSuppComm = supplierSummaryList.reduce((acc, s) => acc + s.supplyCommission, 0);
      const totalSuppMargin = supplierSummaryList.reduce((acc, s) => acc + s.unitMargin, 0);
      const totalProdCount = supplierProductDetailList.reduce((acc, p) => acc + p.count, 0);
      const totalProdSupplyPrice = supplierProductDetailList.reduce((acc, p) => acc + p.totalSupplyPrice, 0);
      const totalProdSupplyComm = supplierProductDetailList.reduce((acc, p) => acc + p.totalSupplyCommission, 0);
      const totalProdMargin = supplierProductDetailList.reduce((acc, p) => acc + p.totalMargin, 0);

      // [Sheet 1: 월말보고서_종합]
      const summaryAoa: any[][] = [
        [`더좋은라이프 월말 종합 결산보고서 (${selectedMonth})`],
        [`보고서 생성일시: ${new Date().toLocaleDateString('ko-KR')} | 기본값 저장 상태: ${hasCustomSavedData ? '저장된 기본값 적용 중' : 'ERP 원본 자동산출'}`],
        [],
        ['========================================================================================'],
        ['1. 당월 핵심 손익 요약'],
        ['========================================================================================'],
        ['구분', '항목', '금액(원)', '산출공식 및 세부설명'],
        ['렌탈 영업부문', '에넥스 총 입금액 [A]', metrics.a_enexDeposit, '에넥스 본사 총 입금 승인액'],
        ['렌탈 영업부문', '영업본부 수수료 지급액 [B]', metrics.b_salesCommission, '영업본부·사업단 지급 수수료 총액 (2번 표 총합)'],
        ['렌탈 영업부문', '특수수당 및 본사지출 [C]', metrics.c_specialAndMaintenance, '직급/직책수당 및 본사 유지비용 (3번 표 총합)'],
        ['렌탈 영업부문', '영업 순이익 [D = A - B - C]', metrics.d_operatingProfit, '에넥스 입금액 - 본부수수료 - 특수수당'],
        ['공급사 정산부문', '에넥스 공급가 입금액 [E]', metrics.e_richwelfareDeposit, '에넥스 입금 공급가 총액 (4번 표 총합)'],
        ['공급사 정산부문', '공급사 지급 공급가액 [F]', metrics.f_richwelfareSupplyPrice, '가스트로플러스/바디프랜드 등 공급가 (4번 표 총합)'],
        ['공급사 정산부문', '공급수수료 [G]', metrics.g_supplyCommission, '공급사 지급 수수료 총액 (4번 표 총합)'],
        ['공급사 정산부문', '공급가 마진 순익 [H = E - F - G]', metrics.h_supplyProfit, '에넥스 공급가 입금액 - 공급가액 - 공급수수료'],
        ['최종 결산', '당월 최종 순이익 [I = D + H]', metrics.i_finalNetProfit, '렌탈 영업 순익(D) + 공급가 마진 순익(H)'],
        [],
        ['========================================================================================'],
        ['2. 본부·사업단별/상품별 영업실적 및 수수료 지급현황'],
        ['========================================================================================'],
        ['영업본부/사업단', '취급 상품명', '건수', '건당 수수료(원)', '총 지급 수수료(원)', '정산 비고'],
        ...hqProductSalesList.map(h => [h.hqName, h.prodName, h.count, h.unitCommission, h.totalCommission, h.note]),
        ['합계', '-', totalHqCount, '-', totalHqComm, '전체 본부 수수료 합계 [B]'],
        [],
        ['========================================================================================'],
        ['3. 특수수당 및 본사 지출 내역 요약'],
        ['========================================================================================'],
        ['지출 구분', '항목명 / 대상자', '수량 / 인원', '총 지출액(원)', '비고 및 산출기준'],
        ...specialExpenseList.map(s => [s.category, s.name, s.count, s.amount, s.note]),
        ['합계', '-', '-', totalSpecialAmount, '본사 특수수당/지출 총합 [C]'],
        [],
        ['========================================================================================'],
        ['4. 공급사 정산 총괄 (총 입금액 & 지급 공급가액)'],
        ['========================================================================================'],
        ['공급사명', '총 발주건수', '에넥스 총 입금액(원)', '지급 공급가액(원)', '공급수수료(원)', '공급 순마진(원)', '정산조건 / 비고'],
        ...supplierSummaryList.map(s => [s.supplierName, s.count, s.depositPrice, s.supplyPrice, s.supplyCommission, s.unitMargin, s.settlementCondition]),
        ['합계', totalSuppCount, totalSuppDeposit, totalSuppPrice, totalSuppComm, totalSuppMargin, '공급사 정산 총괄 합계 [E, F, G, H]'],
        [],
        ['========================================================================================'],
        ['5. 공급사 제품별 세부 정산 내역 (입금단가 & 공급단가)'],
        ['========================================================================================'],
        ['공급사', '제품명', '건수', '에넥스 입금단가(원)', '공급단가(원)', '건당 공급수수료(원)', '총 공급가액(원)', '총 공급수수료(원)', '총 공급마진(원)', '비고'],
        ...supplierProductDetailList.map(p => [p.supplierName, p.prodName, p.count, p.unitDeposit, p.unitSupplyPrice, p.unitCommission, p.totalSupplyPrice, p.totalSupplyCommission, p.totalMargin, p.note]),
        ['합계', '-', totalProdCount, '-', '-', '-', totalProdSupplyPrice, totalProdSupplyComm, totalProdMargin, '제품별 정산 총합'],
        [],
        ['========================================================================================'],
        ['6. 대표님 보고 종합 의견'],
        ['========================================================================================'],
        [monthEndMemo]
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
      wsSummary['!cols'] = [
        { wch: 18 },
        { wch: 32 },
        { wch: 16 },
        { wch: 18 },
        { wch: 20 },
        { wch: 22 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(wb, wsSummary, '월말보고서_종합');

      // [Sheet 2: 1_핵심손익지표]
      const sheet1Aoa = [
        ['구분', '항목', '금액(원)', '세부 설명'],
        ['렌탈 영업부문', '에넥스 총 입금액 [A]', metrics.a_enexDeposit, '에넥스 본사 총 입금 승인액'],
        ['렌탈 영업부문', '영업본부 수수료 지급액 [B]', metrics.b_salesCommission, '영업본부·사업단 지급 수수료 총액 (2번 표 총합)'],
        ['렌탈 영업부문', '특수수당 및 본사지출 [C]', metrics.c_specialAndMaintenance, '직급/직책수당 및 본사 유지비용 (3번 표 총합)'],
        ['렌탈 영업부문', '영업 순이익 [D = A - B - C]', metrics.d_operatingProfit, '에넥스 입금액 - 본부수수료 - 특수수당'],
        ['공급사 정산부문', '에넥스 공급가 입금액 [E]', metrics.e_richwelfareDeposit, '에넥스 입금 공급가 총액 (4번 표 총합)'],
        ['공급사 정산부문', '공급사 지급 공급가액 [F]', metrics.f_richwelfareSupplyPrice, '가스트로플러스/바디프랜드 등 공급가 (4번 표 총합)'],
        ['공급사 정산부문', '공급수수료 [G]', metrics.g_supplyCommission, '공급사 지급 수수료 총액 (4번 표 총합)'],
        ['공급사 정산부문', '공급가 마진 순익 [H = E - F - G]', metrics.h_supplyProfit, '에넥스 공급가 입금액 - 공급가액 - 공급수수료'],
        ['최종 결산', '당월 최종 순이익 [I = D + H]', metrics.i_finalNetProfit, '렌탈 영업 순익(D) + 공급가 마진 순익(H)']
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(sheet1Aoa);
      ws1['!cols'] = [{ wch: 18 }, { wch: 32 }, { wch: 18 }, { wch: 45 }];
      XLSX.utils.book_append_sheet(wb, ws1, '1_핵심손익지표');

      // [Sheet 3: 2_영업실적및수수료]
      const sheet2Aoa = [
        ['영업본부/사업단', '취급 상품명', '건수', '건당 수수료(원)', '총 지급 수수료(원)', '정산 비고'],
        ...hqProductSalesList.map(h => [h.hqName, h.prodName, h.count, h.unitCommission, h.totalCommission, h.note]),
        ['합계', '-', totalHqCount, '-', totalHqComm, '전체 본부 수수료 합계 [B]']
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(sheet2Aoa);
      ws2['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws2, '2_영업실적및수수료');

      // [Sheet 4: 3_특수수당및본사지출]
      const sheet3Aoa = [
        ['지출 구분', '항목명 / 대상자', '수량 / 인원', '총 지출액(원)', '비고 및 산출기준'],
        ...specialExpenseList.map(s => [s.category, s.name, s.count, s.amount, s.note]),
        ['합계', '-', '-', totalSpecialAmount, '본사 특수수당/지출 총합 [C]']
      ];
      const ws3 = XLSX.utils.aoa_to_sheet(sheet3Aoa);
      ws3['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 35 }];
      XLSX.utils.book_append_sheet(wb, ws3, '3_특수수당및본사지출');

      // [Sheet 5: 4_공급사정산총괄]
      const sheet4Aoa = [
        ['공급사명', '총 발주건수', '에넥스 총 입금액(원)', '지급 공급가액(원)', '공급수수료(원)', '공급 순마진(원)', '정산조건 / 비고'],
        ...supplierSummaryList.map(s => [s.supplierName, s.count, s.depositPrice, s.supplyPrice, s.supplyCommission, s.unitMargin, s.settlementCondition]),
        ['합계', totalSuppCount, totalSuppDeposit, totalSuppPrice, totalSuppComm, totalSuppMargin, '공급사 정산 총괄 합계 [E, F, G, H]']
      ];
      const ws4 = XLSX.utils.aoa_to_sheet(sheet4Aoa);
      ws4['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 35 }];
      XLSX.utils.book_append_sheet(wb, ws4, '4_공급사정산총괄');

      // [Sheet 6: 5_제품별세부정산]
      const sheet5Aoa = [
        ['공급사', '제품명', '건수', '에넥스 입금단가(원)', '공급단가(원)', '건당 공급수수료(원)', '총 공급가액(원)', '총 공급수수료(원)', '총 공급마진(원)', '비고'],
        ...supplierProductDetailList.map(p => [p.supplierName, p.prodName, p.count, p.unitDeposit, p.unitSupplyPrice, p.unitCommission, p.totalSupplyPrice, p.totalSupplyCommission, p.totalMargin, p.note]),
        ['합계', '-', totalProdCount, '-', '-', '-', totalProdSupplyPrice, totalProdSupplyComm, totalProdMargin, '제품별 정산 총합']
      ];
      const ws5 = XLSX.utils.aoa_to_sheet(sheet5Aoa);
      ws5['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(wb, ws5, '5_제품별세부정산');

      // 파일 다운로드
      const filename = `더좋은라이프_월말보고서_${selectedMonth}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (e) {
      console.error('[엑셀 다운로드 오류]', e);
      alert('엑셀 파일 생성 중 오류가 발생했습니다.');
    }
  };

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

  // 공급사 관리(서버 및 erp_suppliers_master_v3)에서 최신 에넥스 입금가 및 공급단가 즉시 동기화
  const handleSyncSupplierPrices = async () => {
    try {
      setIsSyncingSuppliers(true);
      const latest = await fetchAndSyncSuppliers();
      computeMonthEndDefaults(latest);
      alert(`공급사 관리에서 최신 설정(총 ${latest.length}개 공급사) 및 제품 단가를 성공적으로 동기화했습니다.`);
    } catch (e: any) {
      console.error(e);
      alert('동기화 실패: ' + (e.message || ''));
    } finally {
      setIsSyncingSuppliers(false);
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

  // 5번 공급사 제품별 목록: 항상 공급사별로 먼저 묶이고, 동일 공급사 내에서는 건수 및 제품명 순 정렬
  const sortedSupplierProducts = useMemo(() => {
    return [...supplierProductDetailList].sort((a, b) => {
      const suppComp = (a.supplierName || '').localeCompare(b.supplierName || '');
      if (suppComp !== 0) return suppComp;
      if (b.count !== a.count) return b.count - a.count;
      return (a.prodName || '').localeCompare(b.prodName || '');
    });
  }, [supplierProductDetailList]);

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
            {activeTab === 'MONTH_END' && hasCustomSavedData && (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs">
                <span>💾 저장된 기본값 적용 중</span>
              </span>
            )}
            {activeTab === 'MONTH_END' && (
              <>
                <button
                  onClick={handleSaveAsDefault}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                  title="현재 수정한 모든 표와 수치를 공식 기본값으로 저장합니다. (재접속 시 자동 유지)"
                >
                  <Save size={13} />
                  <span>기본값으로 저장</span>
                </button>
                <button
                  onClick={handleExportExcel}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                  title="월말보고서 5대 정산표 전체를 엑셀 파일(.xlsx)로 다운로드합니다."
                >
                  <Download size={13} />
                  <span>엑셀 다운로드</span>
                </button>
                <button
                  onClick={handleResetToAutoComputed}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-300 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                  title="모든 수정 내용을 지우고 ERP 원본 데이터 기반 자동 계산값으로 복원합니다."
                >
                  <RotateCcw size={13} className="text-slate-500" />
                  <span>자동 계산값으로 복원</span>
                </button>
              </>
            )}
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
                          <th className="border border-slate-400 py-1.5 px-2 w-[12%] whitespace-nowrap text-center">구분</th>
                          <th className="border border-slate-400 py-1.5 px-3 text-left w-[50%] whitespace-nowrap">항목명</th>
                          <th className="border border-slate-400 py-1.5 px-3 text-right w-[38%] whitespace-nowrap">금액 (단위: 원)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* 1부: 에넥스 렌탈 영업 부문 (A ~ D) */}
                        <tr className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors">
                          <td className="border border-slate-300 py-1.5 px-2 text-center font-bold text-slate-700 bg-slate-50/60 whitespace-nowrap">[A]</td>
                          <td className="border border-slate-300 py-1.5 px-3 font-bold text-slate-900 whitespace-nowrap">에넥스 입금액</td>
                          <td className="border border-slate-300 py-1.5 px-3 text-right font-black text-emerald-700 whitespace-nowrap tracking-tight">
                            <EditableNumber
                              value={metrics.a_enexDeposit}
                              onChange={handleUpdateA}
                              showZeroAsBlank={true}
                              placeholder="직접 입력"
                            />
                          </td>
                        </tr>
                        <tr className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors">
                          <td className="border border-slate-300 py-1.5 px-2 text-center font-bold text-slate-700 bg-slate-50/60 whitespace-nowrap">[B]</td>
                          <td className="border border-slate-300 py-1.5 px-3 font-bold text-slate-900 whitespace-nowrap">본부·사업단별 영업수수료</td>
                          <td className="border border-slate-300 py-1.5 px-3 text-right font-bold text-blue-700 whitespace-nowrap tracking-tight">
                            <EditableNumber value={metrics.b_salesCommission} onChange={handleUpdateB} />
                          </td>
                        </tr>
                        <tr className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors">
                          <td className="border border-slate-300 py-1.5 px-2 text-center font-bold text-slate-700 bg-slate-50/60 whitespace-nowrap">[C]</td>
                          <td className="border border-slate-300 py-1.5 px-3 font-bold text-slate-900 whitespace-nowrap">특수수당 및 유지수수료</td>
                          <td className="border border-slate-300 py-1.5 px-3 text-right font-bold text-purple-700 whitespace-nowrap tracking-tight">
                            <EditableNumber value={metrics.c_specialAndMaintenance} onChange={handleUpdateC} />
                          </td>
                        </tr>
                        <tr className="border-b-2 border-slate-400 bg-blue-50/60 font-black">
                          <td className="border border-slate-400 py-2 px-2 text-center font-bold text-blue-900 bg-blue-100/60 whitespace-nowrap">[D]</td>
                          <td className="border border-slate-400 py-2 px-3 font-black text-blue-900 whitespace-nowrap">렌탈 영업 순익</td>
                          <td className="border border-slate-400 py-2 px-3 text-right font-black text-blue-900 whitespace-nowrap tracking-tight text-sm">
                            <EditableNumber
                              value={metrics.d_operatingProfit}
                              onChange={val => {
                                setMetrics(prev => ({ ...prev, d_operatingProfit: val, i_finalNetProfit: val + prev.h_supplyProfit }));
                              }}
                            />
                          </td>
                        </tr>

                        {/* 2부: 리치웰 공급가 부문 (E ~ H) */}
                        <tr className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors">
                          <td className="border border-slate-300 py-1.5 px-2 text-center font-bold text-slate-700 bg-slate-50/60 whitespace-nowrap">[E]</td>
                          <td className="border border-slate-300 py-1.5 px-3 font-bold text-slate-900 whitespace-nowrap">에넥스 공급가 입금액 (리치웰)</td>
                          <td className="border border-slate-300 py-1.5 px-3 text-right font-black text-emerald-700 whitespace-nowrap tracking-tight">
                            <EditableNumber
                              value={metrics.e_richwelfareDeposit}
                              onChange={handleUpdateE}
                              showZeroAsBlank={true}
                              placeholder="직접 입력"
                            />
                          </td>
                        </tr>
                        <tr className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors">
                          <td className="border border-slate-300 py-1.5 px-2 text-center font-bold text-slate-700 bg-slate-50/60 whitespace-nowrap">[F]</td>
                          <td className="border border-slate-300 py-1.5 px-3 font-bold text-slate-900 whitespace-nowrap">리치웰 공급가액</td>
                          <td className="border border-slate-300 py-1.5 px-3 text-right font-bold text-slate-800 whitespace-nowrap tracking-tight">
                            <EditableNumber value={metrics.f_richwelfareSupplyPrice} onChange={handleUpdateF} />
                          </td>
                        </tr>
                        <tr className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors">
                          <td className="border border-slate-300 py-1.5 px-2 text-center font-bold text-slate-700 bg-slate-50/60 whitespace-nowrap">[G]</td>
                          <td className="border border-slate-300 py-1.5 px-3 font-bold text-slate-900 whitespace-nowrap">공급수수료</td>
                          <td className="border border-slate-300 py-1.5 px-3 text-right font-bold text-rose-700 whitespace-nowrap tracking-tight">
                            <EditableNumber value={metrics.g_supplyCommission} onChange={handleUpdateG} />
                          </td>
                        </tr>
                        <tr className="border-b-2 border-slate-400 bg-amber-50/60 font-black">
                          <td className="border border-slate-400 py-2 px-2 text-center font-bold text-amber-900 bg-amber-100/60 whitespace-nowrap">[H]</td>
                          <td className="border border-slate-400 py-2 px-3 font-black text-amber-900 whitespace-nowrap">공급가 순익</td>
                          <td className="border border-slate-400 py-2 px-3 text-right font-black text-amber-900 whitespace-nowrap tracking-tight text-sm">
                            <EditableNumber
                              value={metrics.h_supplyProfit}
                              onChange={val => {
                                setMetrics(prev => ({ ...prev, h_supplyProfit: val, i_finalNetProfit: prev.d_operatingProfit + val }));
                              }}
                            />
                          </td>
                        </tr>

                        {/* 3부: 최종 합산 순익 (I = D + H) */}
                        <tr className="bg-emerald-100/90 font-black border-t-2 border-b-2 border-slate-600 text-black">
                          <td className="border border-slate-600 py-2.5 px-2 text-center font-black text-emerald-950 bg-emerald-200/90 whitespace-nowrap">[I]</td>
                          <td className="border border-slate-600 py-2.5 px-3 font-black text-emerald-950 whitespace-nowrap text-sm">
                            더좋은라이프 최종 순익
                          </td>
                          <td className="border border-slate-600 py-2.5 px-3 text-right font-black text-emerald-950 whitespace-nowrap tracking-tight text-base">
                            <EditableNumber
                              value={metrics.i_finalNetProfit}
                              onChange={val => setMetrics(prev => ({ ...prev, i_finalNetProfit: val }))}
                              className="font-black text-emerald-950 text-base"
                            />
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
                          updateHqProductSalesList(prev => [
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
                          <th className="border border-slate-400 py-1.5 px-2 text-right w-[18%] whitespace-nowrap">건당 수수료</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-right w-[20%] whitespace-nowrap">수수료 합계</th>
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
                                          updateHqProductSalesList(p => p.map(it => it.hqName === group.hqName ? { ...it, hqName: val } : it));
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
                                    onChange={val => updateHqProductSalesList(p => p.map(r => r.id === item.id ? { ...r, prodName: val } : r))}
                                    align="left"
                                  />
                                </td>
                                <td className="border border-slate-300 py-1 px-1 text-center font-bold text-slate-900 whitespace-nowrap">
                                  <EditableNumber
                                    value={item.count}
                                    onChange={val => updateHqProductSalesList(p => p.map(r => r.id === item.id ? { ...r, count: val, totalCommission: val * r.unitCommission } : r))}
                                    unit="건"
                                  />
                                </td>
                                <td className="border border-slate-300 py-1 px-2 text-right font-medium text-slate-700 whitespace-nowrap">
                                  <EditableNumber
                                    value={item.unitCommission}
                                    onChange={val => updateHqProductSalesList(p => p.map(r => r.id === item.id ? { ...r, unitCommission: val, totalCommission: r.count * val } : r))}
                                  />
                                </td>
                                <td className="border border-slate-300 py-1 px-2 text-right font-bold text-blue-700 whitespace-nowrap">
                                  <EditableNumber
                                    value={item.totalCommission}
                                    onChange={val => updateHqProductSalesList(p => p.map(r => r.id === item.id ? { ...r, totalCommission: val } : r))}
                                  />
                                </td>
                                <td className="border border-slate-300 py-1 px-1 text-center print:hidden">
                                  <button
                                    onClick={() => updateHqProductSalesList(p => p.filter(r => r.id !== item.id))}
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
                                {group.subtotalCommission.toLocaleString()}
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
                            {hqProductSalesList.reduce((s, r) => s + r.totalCommission, 0).toLocaleString()}
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
                        3. 특수수당 및 본사 지출 내역 요약
                      </h4>
                      <button
                        onClick={() => {
                          updateSpecialExpenseList(prev => [
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
                                onChange={val => updateSpecialExpenseList(p => p.map(r => r.id === row.id ? { ...r, category: val } : r))}
                                align="left"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-2 font-bold text-slate-900 truncate">
                              <EditableText
                                value={row.name}
                                onChange={val => updateSpecialExpenseList(p => p.map(r => r.id === row.id ? { ...r, name: val } : r))}
                                align="left"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-1 text-center text-slate-700 whitespace-nowrap">
                              <EditableText
                                value={String(row.count)}
                                onChange={val => updateSpecialExpenseList(p => p.map(r => r.id === row.id ? { ...r, count: val } : r))}
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-bold text-purple-700 whitespace-nowrap">
                              <EditableNumber
                                value={row.amount}
                                onChange={val => updateSpecialExpenseList(p => p.map(r => r.id === row.id ? { ...r, amount: val } : r))}
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-slate-600 text-[11px] truncate">
                              <EditableText
                                value={row.note}
                                onChange={val => updateSpecialExpenseList(p => p.map(r => r.id === row.id ? { ...r, note: val } : r))}
                                align="left"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-1 text-center print:hidden">
                              <button
                                onClick={() => updateSpecialExpenseList(p => p.filter(r => r.id !== row.id))}
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
                            {specialExpenseList.reduce((s, r) => s + r.amount, 0).toLocaleString()}
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-slate-600 text-[11px] font-normal" colSpan={2}>
                            총 {specialExpenseList.length}건
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* ---------------------------------------------------- */}
                  {/* ---------------------------------------------------- */}
                  {/* ---------------------------------------------------- */}
                  {/* [4] 공급사 정산관리 총괄 요약 (요청 4 반영) */}
                  {/* ---------------------------------------------------- */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs sm:text-sm font-black text-black flex items-center gap-1 pl-2 border-l-[4px] border-black select-none">
                        4. 공급사 정산관리 총괄 요약
                      </h4>
                      <button
                        onClick={() => {
                          updateSupplierSummary(prev => [
                            ...prev,
                            { id: `supp-${Date.now()}`, supplierName: '신규공급사', count: 1, depositPrice: 0, supplyPrice: 0, supplyCommission: 0, unitMargin: 0, settlementCondition: '-' }
                          ]);
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 print:hidden border border-blue-200 px-2 py-0.5 rounded bg-blue-50 cursor-pointer"
                      >
                        <Plus size={10} /> 공급사 추가
                      </button>
                    </div>

                    <table className="w-full text-left border-collapse border border-slate-400 text-xs table-fixed">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-black border-b border-slate-400 text-center select-none">
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[28%] whitespace-nowrap">공급사명</th>
                          <th className="border border-slate-400 py-1.5 px-1 text-center w-[12%] whitespace-nowrap">정산 건수</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-right w-[28%] whitespace-nowrap">공급사 지급 공급가액</th>
                          <th className="border border-slate-400 py-1.5 px-2 text-left w-[28%] whitespace-nowrap">비고</th>
                          <th className="border border-slate-400 py-1.5 px-1 text-center w-[4%] print:hidden"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {supplierSummaryList.filter(row => row.count > 0).map(row => (
                          <tr key={row.id} className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors group">
                            <td className="border border-slate-300 py-1.5 px-2 font-bold text-slate-900 whitespace-nowrap">
                              <EditableText
                                value={row.supplierName}
                                onChange={val => updateSupplierSummary(p => p.map(r => r.id === row.id ? { ...r, supplierName: val } : r))}
                                align="left"
                              />
                            </td>
                            <td className="border border-slate-300 py-1.5 px-1 text-center font-bold text-slate-900 whitespace-nowrap">
                              <EditableNumber
                                value={row.count}
                                onChange={val => updateSupplierSummary(p => p.map(r => r.id === row.id ? { ...r, count: val } : r))}
                                unit="건"
                              />
                            </td>
                            <td className="border border-slate-300 py-1.5 px-2 text-right font-black text-slate-900 whitespace-nowrap tracking-tight">
                              <EditableNumber
                                value={row.supplyPrice}
                                onChange={val => updateSupplierSummary(p => p.map(r => r.id === row.id ? { ...r, supplyPrice: val } : r))}
                              />
                            </td>
                            <td className="border border-slate-300 py-1.5 px-2 text-slate-600 text-[11px] leading-tight">
                              <EditableText
                                value={row.settlementCondition || '-'}
                                onChange={val => updateSupplierSummary(p => p.map(r => r.id === row.id ? { ...r, settlementCondition: val } : r))}
                                align="left"
                                allowWrap={true}
                              />
                            </td>
                            <td className="border border-slate-300 py-1.5 px-1 text-center print:hidden">
                              <button
                                onClick={() => updateSupplierSummary(p => p.filter(r => r.id !== row.id))}
                                className="text-slate-300 hover:text-rose-600 cursor-pointer"
                                title="삭제"
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}

                        {/* 합계 및 단일 에넥스 입금액 차감 정산 블록 */}
                        {(() => {
                          const validSummaries = supplierSummaryList.filter(row => row.count > 0);
                          const totalSupCount = validSummaries.reduce((s, r) => s + r.count, 0);
                          const totalSupPrice = validSummaries.reduce((s, r) => s + r.supplyPrice, 0);
                          const enexDeposit = metrics.e_richwelfareDeposit;
                          const totalComm = metrics.g_supplyCommission;
                          const netSupplyMargin = enexDeposit > 0 ? (enexDeposit - totalSupPrice - totalComm) : 0;

                          return (
                            <>
                              {/* 1) 공급사 지급 합계 소계 */}
                              <tr className="bg-slate-100 font-extrabold border-t-2 border-slate-400 text-slate-900">
                                <td className="border border-slate-400 py-1.5 px-2 text-left whitespace-nowrap">공급사 지급 합계</td>
                                <td className="border border-slate-400 py-1.5 px-1 text-center whitespace-nowrap">{totalSupCount.toLocaleString()} 건</td>
                                <td className="border border-slate-400 py-1.5 px-2 text-right text-slate-950 font-black whitespace-nowrap tracking-tight">
                                  {totalSupPrice.toLocaleString()}
                                </td>
                                <td className="border border-slate-400 py-1.5 px-2 text-slate-400 text-[11px] text-center" colSpan={2}>
                                  -
                                </td>
                              </tr>

                              {/* 2) 에넥스 총 입금액 (한번만 입력) */}
                              <tr className="bg-emerald-50/70 border-t border-slate-300">
                                <td className="border border-slate-400 py-1.5 px-2 text-left font-black text-emerald-900 whitespace-nowrap" colSpan={2}>
                                  [E] 에넥스 총 입금액
                                </td>
                                <td className="border border-slate-400 py-1.5 px-2 text-right text-emerald-800 font-black whitespace-nowrap tracking-tight">
                                  <EditableNumber
                                    value={metrics.e_richwelfareDeposit}
                                    onChange={handleUpdateE}
                                    showZeroAsBlank={true}
                                    placeholder="직접 입력"
                                    className="font-black text-emerald-700"
                                  />
                                </td>
                                <td className="border border-slate-400 py-1.5 px-2 text-slate-400 text-[11px] text-center" colSpan={2}>
                                  -
                                </td>
                              </tr>

                              {/* 3) 공급가 차감 순익 결과 행 */}
                              <tr className="bg-amber-100/90 font-black border-t-2 border-slate-400 text-amber-950">
                                <td className="border border-slate-400 py-1.5 px-2 text-left whitespace-nowrap" colSpan={2}>
                                  [H] 공급가 정산 순익
                                </td>
                                <td className="border border-slate-400 py-1.5 px-2 text-right text-amber-950 font-black whitespace-nowrap text-sm tracking-tight">
                                  {netSupplyMargin.toLocaleString()}
                                </td>
                                <td className="border border-slate-400 py-1.5 px-2 text-slate-400 text-[11px] text-center" colSpan={2}>
                                  -
                                </td>
                              </tr>
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* ---------------------------------------------------- */}
                  {/* ---------------------------------------------------- */}
                  {/* [5] 공급사 제품별 세부 정산 내역 (요청 5 반영) */}
                  {/* ---------------------------------------------------- */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs sm:text-sm font-black text-black flex items-center gap-1 pl-2 border-l-[4px] border-black select-none">
                        5. 공급사 제품별 세부 정산 내역
                      </h4>
                      <div className="flex items-center gap-1.5 print:hidden">
                        <button
                          onClick={handleSyncSupplierPrices}
                          disabled={isSyncingSuppliers}
                          title="공급사 관리에서 설정된 최신 에넥스 입금가 및 공급단가를 서버에서 다시 불러와 적용합니다."
                          className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 border border-emerald-300 px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 cursor-pointer shadow-2xs transition-colors disabled:opacity-60"
                        >
                          <RefreshCw size={10} className={`text-emerald-600 ${isSyncingSuppliers ? 'animate-spin' : ''}`} />
                          <span>{isSyncingSuppliers ? '동기화 중...' : '공급사 설정 동기화'}</span>
                        </button>
                        <button
                          onClick={() => {
                            updateSupplierProductDetails(prev => [
                              ...prev,
                              {
                                id: `sp-${Date.now()}`,
                                supplierName: '공급사',
                                prodName: '취급제품명',
                                count: 1,
                                unitDeposit: 0,
                                unitSupplyPrice: 1150000,
                                unitCommission: 0,
                                totalSupplyPrice: 1150000,
                                totalSupplyCommission: 0,
                                unitMargin: 0,
                                totalMargin: 0,
                                note: '-'
                              }
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
                        <tr className="bg-slate-100 text-slate-900 font-black border-b border-slate-400 text-center select-none text-[11px]">
                          <th className="border border-slate-400 py-1 px-1 text-left w-[13%] whitespace-nowrap">공급사</th>
                          <th className="border border-slate-400 py-1 px-1.5 text-left w-[25%] whitespace-nowrap">취급 제품명</th>
                          <th className="border border-slate-400 py-1 px-0.5 text-center w-[5%] whitespace-nowrap">건수</th>
                          <th className="border border-slate-400 py-1 px-1 text-right w-[11%] leading-tight">건당<br/>에넥스입금</th>
                          <th className="border border-slate-400 py-1 px-1 text-right w-[11%] leading-tight">제품별<br/>공급단가</th>
                          <th className="border border-slate-400 py-1 px-1 text-right w-[12%] leading-tight">총<br/>공급가액</th>
                          <th className="border border-slate-400 py-1 px-1 text-right w-[11%] leading-tight">공급<br/>수수료</th>
                          <th className="border border-slate-400 py-1 px-1 text-right w-[12%] leading-tight">총 공급마진</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSupplierProducts.filter(row => row.count > 0).map(row => (
                          <tr key={row.id} className="border-b border-slate-300 hover:bg-slate-50/50 transition-colors group">
                            <td className="border border-slate-300 py-1 px-1 font-bold text-slate-800 text-[11px] whitespace-nowrap">
                              <div className="flex items-center justify-between gap-0.5">
                                <div className="flex-1 min-w-0">
                                  <EditableText
                                    value={row.supplierName}
                                    onChange={val => updateSupplierProductDetails(p => p.map(r => r.id === row.id ? { ...r, supplierName: val } : r))}
                                    align="left"
                                  />
                                </div>
                                <button
                                  onClick={() => updateSupplierProductDetails(p => p.filter(r => r.id !== row.id))}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 transition-opacity print:hidden cursor-pointer shrink-0"
                                  title="행 삭제"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 font-bold text-slate-900 text-[11px] leading-tight break-words product-name-cell">
                              <EditableText
                                value={row.prodName}
                                onChange={val => updateSupplierProductDetails(p => p.map(r => r.id === row.id ? { ...r, prodName: val } : r))}
                                align="left"
                                allowWrap={true}
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-0.5 text-center font-bold text-slate-900 whitespace-nowrap text-[11px]">
                              <EditableNumber
                                value={row.count}
                                onChange={val => updateSupplierProductDetails(p => p.map(r => r.id === row.id ? {
                                  ...r,
                                  count: val,
                                  totalSupplyPrice: val * r.unitSupplyPrice,
                                  totalSupplyCommission: val * r.unitCommission,
                                  totalMargin: r.unitDeposit > 0 ? (val * r.unitDeposit) - (val * r.unitSupplyPrice) - (val * r.unitCommission) : 0
                                } : r))}
                                unit="건"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-1 text-right font-medium text-emerald-700 whitespace-nowrap text-[11px]">
                              <EditableNumber
                                value={row.unitDeposit}
                                onChange={val => updateSupplierProductDetails(p => p.map(r => r.id === row.id ? {
                                  ...r,
                                  unitDeposit: val,
                                  unitMargin: val > 0 ? val - r.unitSupplyPrice - r.unitCommission : 0,
                                  totalMargin: val > 0 ? (r.count * val) - r.totalSupplyPrice - r.totalSupplyCommission : 0
                                } : r))}
                                showZeroAsBlank={true}
                                placeholder="직접 입력"
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-1 text-right font-bold text-slate-800 whitespace-nowrap text-[11px]">
                              <EditableNumber
                                value={row.unitSupplyPrice}
                                onChange={val => updateSupplierProductDetails(p => p.map(r => r.id === row.id ? {
                                  ...r,
                                  unitSupplyPrice: val,
                                  totalSupplyPrice: r.count * val,
                                  unitMargin: r.unitDeposit > 0 ? r.unitDeposit - val - r.unitCommission : 0,
                                  totalMargin: r.unitDeposit > 0 ? (r.count * r.unitDeposit) - (r.count * val) - r.totalSupplyCommission : 0
                                } : r))}
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-1 text-right font-semibold text-slate-900 whitespace-nowrap text-[11px]">
                              <EditableNumber
                                value={row.totalSupplyPrice}
                                onChange={val => updateSupplierProductDetails(p => p.map(r => r.id === row.id ? {
                                  ...r,
                                  totalSupplyPrice: val,
                                  totalMargin: r.unitDeposit > 0 ? (r.count * r.unitDeposit) - val - r.totalSupplyCommission : 0
                                } : r))}
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-1 text-right font-semibold text-rose-700 whitespace-nowrap text-[11px]">
                              <EditableNumber
                                value={row.totalSupplyCommission}
                                onChange={val => updateSupplierProductDetails(p => p.map(r => r.id === row.id ? {
                                  ...r,
                                  totalSupplyCommission: val,
                                  totalMargin: r.unitDeposit > 0 ? (r.count * r.unitDeposit) - r.totalSupplyPrice - val : 0
                                } : r))}
                              />
                            </td>
                            <td className="border border-slate-300 py-1 px-1 text-right font-black text-amber-950 whitespace-nowrap text-[11px]">
                              <EditableNumber
                                value={row.totalMargin}
                                onChange={val => updateSupplierProductDetails(p => p.map(r => r.id === row.id ? { ...r, totalMargin: val } : r))}
                              />
                            </td>
                          </tr>
                        ))}
                        {/* 합계 행 */}
                        {(() => {
                          const validProducts = sortedSupplierProducts.filter(row => row.count > 0);
                          return (
                            <tr className="bg-slate-200/90 font-black border-t-2 border-slate-400 text-black text-[11px]">
                              <td className="border border-slate-400 py-1.5 px-1 text-left whitespace-nowrap" colSpan={2}>
                                제품별 세부 합계 (총 {validProducts.length}개 품목)
                              </td>
                              <td className="border border-slate-400 py-1.5 px-0.5 text-center whitespace-nowrap font-black">
                                {validProducts.reduce((s, r) => s + r.count, 0).toLocaleString()} 건
                              </td>
                              <td className="border border-slate-400 py-1.5 px-1 text-right text-slate-500 text-[10px] whitespace-nowrap" colSpan={2}>
                                -
                              </td>
                              <td className="border border-slate-400 py-1.5 px-1 text-right text-slate-950 font-black whitespace-nowrap tracking-tight">
                                {validProducts.reduce((s, r) => s + r.totalSupplyPrice, 0).toLocaleString()}
                              </td>
                              <td className="border border-slate-400 py-1.5 px-1 text-right text-rose-950 font-black whitespace-nowrap tracking-tight">
                                {validProducts.reduce((s, r) => s + (r.totalSupplyCommission || 0), 0).toLocaleString()}
                              </td>
                              <td className="border border-slate-400 py-1.5 px-1 text-right text-amber-950 font-black whitespace-nowrap tracking-tight">
                                {validProducts.reduce((s, r) => s + r.totalMargin, 0).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })()}
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
                    word-wrap: break-word !important;
                    overflow: visible !important;
                    text-overflow: clip !important;
                  }

                  .product-name-cell,
                  .product-name-cell * {
                    white-space: normal !important;
                    word-break: break-all !important;
                    overflow: visible !important;
                    text-overflow: clip !important;
                    line-height: 1.2 !important;
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

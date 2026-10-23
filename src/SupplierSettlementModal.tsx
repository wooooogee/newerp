import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, Calculator, Building, Calendar, Download, RefreshCw, 
  Search, CheckCircle, Package, DollarSign, Filter, FileSpreadsheet, 
  ChevronRight, ChevronDown, ExternalLink, AlertCircle, ArrowUpRight, CheckSquare, Square,
  Tag, Info, Layers, Receipt, Coins, FileText, TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SupplierItem, SupplierProductSetting, loadSuppliersFromStorage } from './SupplierManagementModal';
import { checkInstallCertEligibility, getManualOrderInfo, ManualOrderInfo, getNextMonthStr, mergeManualOrderStores, isManualTargetProduct } from './manualOrderUtils';
import { 
  CommissionSettlementDetailModal, 
  exportCommissionStatementExcel, 
  SettlementDetailItem, 
  CommissionDetailTarget,
  numberToKorean
} from './CommissionSettlementDetailModal';
import { autoFitColWidths, applyTableExcelStyle } from './excelStyleUtils';

// @ts-ignore
const XLSX = (window as any).XLSX;

function formatSettlementDate(yearMonth: string, settlementDay: number = 31): string {
  if (!yearMonth || !yearMonth.includes('-')) return '';
  const parts = yearMonth.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(y) || isNaN(m)) return '';
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(settlementDay, lastDay);
  return `${parts[0]}-${parts[1].padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getPrevMonthStr(yearMonth: string): string {
  if (!yearMonth || !yearMonth.includes('-')) return '';
  const parts = yearMonth.split('-');
  let y = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10);
  if (isNaN(y) || isNaN(m)) return '';
  m -= 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function extractYearMonth(dateStr: string): string {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4})[-./\s]+(\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}`;
  }
  return '';
}

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
  cancelDate?: string;
  raw: any[];
}

// 렌탈계약번호 및 상품개수 기준 정산 아이템
interface SupplierSettlementItem {
  uniqueKey: string;
  rentalNo: string;           // 핵심 식별자: 렌탈계약번호 (회원번호 미사용)
  contractDate: string;
  memName: string;            // 고객명/회원명
  phone: string;
  prodName: string;
  rentalProdRaw: string;
  matchedSupplierId: string;
  matchedSupplierName: string;
  matchedProductId: string;
  matchedProductName: string;
  quantity: number;           // 상품개수 (기본: 1개)
  supplyPrice: number;        // 공급단가 (VAT포함)
  totalSupplyPrice: number;   // 공급 물품대금 = 공급단가 * 수량 (VAT포함)
  supplyCommission: number;   // 공급 수수료 단가 (VAT포함)
  totalCommission: number;    // 공급 수수료 합계 = 수수료 단가 * 수량 (VAT포함)
  isHqDifferentiated?: boolean;// 본부별 차등 수수료 적용 여부 (호환용)
  appliedHqName?: string;     // 차등 적용된 본부명 (호환용)
  commissionRecipient: string;// 수수료 수령자/처
  recipientBank?: string;
  recipientAccount?: string;
  recipientHolder?: string;
  deliveryDate: string;       // 배송일
  deliveryStatus: string;     // 배송완료
  
  // 설치확인서 관련 핵심 필드
  installCertStatus: '등록' | '미등록'; // 설치확인서 등록 여부
  installCertDate?: string;   // 설치확인일자 (YYYY-MM-DD)
  installCertMonth?: string;  // 설치확인서 정산 마감월 (YYYY-MM)
  
  // 공급수수료 지급일자 및 정산월 (설치확인서 등록유무에 따라 결정)
  payoutDate: string;         // 공급수수료 지급(예정)일자 (예: 2026-10-31)
  payoutMonth: string;        // 공급수수료 정산월 (예: 2026-10)
  isCommissionPayable: boolean;// 해당 월 정산 지급 대상 여부 (확인서 등록 + 정산월 일치 + 수수료 > 0)
  isCertHold: boolean;        // 설치확인서 미등록으로 인한 보류 여부
  commissionHoldReason?: string; // 보류/미지급 사유
  
  // 물품대금 정산 해당 여부
  isSupplyPricePayable: boolean;
  isManualOrderTarget?: boolean; // 수기발주/설치확인서 관리 대상 여부

  // 리치웰페어 입금 및 손익 결산 필드
  richwelfareDeposit: number;        // [A] 리치웰페어 입금액 (I열 결합원가, VAT포함)
  richwelfareTaxDate?: string;       // W열 세금계산서 작성일
  richwelfareDepositMonth?: string;  // W열 세금계산서 작성일 기준 익월(다음달) 입금월 (YYYY-MM)
  isRichwelfareMatched?: boolean;    // 리치웰페어 시트에 등록된 계약번호 매칭 여부
  netProfit: number;                 // [D] 실질 순수익 = [A] - [B]물품대금 - [C]공급수수료
  marginRate: number;                // 순수익률(%)

  hq: string;
  branch: string;
  empName: string;
}

// 1. [물품 대금] 공급사별 요약
interface SupplyPriceSummary {
  supplierId: string;
  supplierName: string;
  businessNo: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  settlementDay: number;
  productCount: number;          // 정산 상품개수 (전월 배송완료 건수)
  certRegisteredCount: number;   // 설치확인서 등록 건수
  certUnregisteredCount: number; // 설치확인서 미등록 건수
  totalSupplyAmount: number;     // 공급 물품 대금 합계 (VAT포함)
  items: SupplierSettlementItem[];
}

// 2. [공급 수수료] 공급사/수령처별 요약
interface CommissionSummary {
  recipientKey: string;
  supplierId: string;
  supplierName: string;
  commissionRecipient: string;// 수령처/인
  recipientBank: string;
  recipientAccount: string;
  recipientHolder: string;
  productCount: number;       // 수수료 지급 대상 상품개수 (확인서 등록 완료 건)
  totalCommissionAmount: number; // 공급 수수료 합계 (VAT포함)
  holdCount: number;          // 설치확인서 미등록 보류 건수
  holdCommissionAmount: number;// 설치확인서 미등록 보류 수수료 합계
  items: SupplierSettlementItem[];
}

interface SupplierSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ERPDataItem[];
  onOpenSupplierManagementModal?: () => void;
}

export const SupplierSettlementModal: React.FC<SupplierSettlementModalProps> = ({
  isOpen,
  onClose,
  data,
  onOpenSupplierManagementModal
}) => {
  // 기준 정산월 (기본: 이번 달 YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().substring(0, 7);
  });

  // 정산 대상 배송완료월: 정산기준월 M의 전월 (M-1월) - 예: 10월 정산기준월 -> 9월 배송완료건 집계
  const targetDeliveryMonth = useMemo(() => getPrevMonthStr(selectedMonth), [selectedMonth]);

  // 메인 탭: 물품 대금 정산 vs 공급 수수료 정산 vs 리치웰페어 손익 결산 (완전 분리)
  const [mainTab, setMainTab] = useState<'SUPPLY_PRICE' | 'COMMISSION' | 'PROFIT_REPORT'>('SUPPLY_PRICE');

  // 서브 뷰 탭: 총괄 요약표 vs 건별 상세 내역
  const [viewMode, setViewMode] = useState<'SUMMARY' | 'DETAIL'>('SUMMARY');

  // 설치확인서 기준 공급수수료 지급월 판정 모드
  // 'CERT_MONTH': 설치확인서 마감월 당월 정산 (말일/정산일 지급) - 기본값
  // 'NEXT_MONTH': 설치확인서 마감월 익월 지급 (다음달 지급)
  const [payoutRuleMode, setPayoutRuleMode] = useState<'CERT_MONTH' | 'NEXT_MONTH'>('CERT_MONTH');

  // 공급 수수료 탭 필터
  const [certFilter, setCertFilter] = useState<'ALL' | 'PAYABLE' | 'HOLD'>('ALL');

  // 공급 수수료 집계 기준: 수령처별 통합(기본) vs 관련 공급사 기준별
  const [commissionGroupMode, setCommissionGroupMode] = useState<'SUPPLIER_BASED' | 'RECIPIENT_BASED'>('RECIPIENT_BASED');

  // 수령처별 상세 내역 인라인 펼침 토글 상태
  const [expandedRecipientKeys, setExpandedRecipientKeys] = useState<Set<string>>(new Set());
  const toggleExpandRecipient = (key: string) => {
    setExpandedRecipientKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 상세 내역 모달 상태
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailModalTarget, setDetailModalTarget] = useState<CommissionDetailTarget | null>(null);
  const [detailRecipientAllItems, setDetailRecipientAllItems] = useState<SettlementDetailItem[]>([]);

  const [suppliers, setSuppliers] = useState<SupplierItem[]>(() => loadSuppliersFromStorage());
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('ALL'); // 'ALL' 또는 개별 공급사 ID
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // 구글 시트 / 클라우드 설정에서 최신 수기발주 대장 및 설치확인서 정보 백그라운드 동기화
  const [cloudOrderStores, setCloudOrderStores] = useState<Record<string, ManualOrderInfo>>({});

  // 리치웰페어 구글 시트 데이터 (결합매출액 / 거래처 수수료 입금액)
  const [richwelfareRows, setRichwelfareRows] = useState<any[][]>([]);
  const [loadingRichwelfare, setLoadingRichwelfare] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const fetchRichwelfare = async () => {
      setLoadingRichwelfare(true);
      try {
        const res = await fetch('/api/sheets/richwelfare-data');
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.rows) && json.rows.length > 0) {
            setRichwelfareRows(json.rows);
          }
        }
      } catch (e) {
        console.warn('리치웰페어 시트 데이터 로드 실패:', e);
      } finally {
        setLoadingRichwelfare(false);
      }
    };
    fetchRichwelfare();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchLatestManualStores = async () => {
      try {
        const res = await fetch('/api/sheets/settings/load');
        if (res.ok) {
          const cloudData = await res.json();
          if (cloudData.manualOrderStores && typeof cloudData.manualOrderStores === 'object') {
            setCloudOrderStores((prev) => mergeManualOrderStores(prev, cloudData.manualOrderStores));
            try {
              let curLocal = {};
              const cur = localStorage.getItem('erp_manual_orders_saved_store_v1');
              if (cur) curLocal = JSON.parse(cur);
              const merged = mergeManualOrderStores(curLocal, cloudData.manualOrderStores);
              localStorage.setItem('erp_manual_orders_saved_store_v1', JSON.stringify(merged));
            } catch (e) {}
          }
        }
      } catch (e) {
        console.warn('공급사 정산 모달: 클라우드 수기발주 설정 동기화 실패', e);
      }
    };
    fetchLatestManualStores();
  }, [isOpen]);

  // 모달 오픈 시 최신 공급사 정보 재로드
  useEffect(() => {
    if (isOpen) {
      setSuppliers(loadSuppliersFromStorage());
    }
  }, [isOpen]);

  // 로컬스토리지 수기발주 데이터 보정 맵 및 저장소 로드
  const manualOrderStores = useMemo(() => {
    let stores: Record<string, ManualOrderInfo> = {};
    try {
      const saved = localStorage.getItem('erp_manual_orders_saved_store_v1');
      if (saved) stores = JSON.parse(saved);
      const legacySaved = localStorage.getItem('erp_manual_orders_v1');
      if (legacySaved) {
        const parsed = JSON.parse(legacySaved);
        if (Array.isArray(parsed)) {
          parsed.forEach((o: any) => {
            const key = o.contractNo || o.rentalNo || o.memNo;
            if (key && !stores[key]) {
              stores[key] = {
                deliveryDate: o.deliveryDate || '',
                deliveryState: o.deliveryState || '',
                installCertStatus: o.installCertStatus || '미등록',
                installCertDate: o.installCertDate || '',
                installCertMonth: o.installCertMonth || '',
              };
            }
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
    return stores;
  }, [isOpen]);

  // 로컬 + 클라우드 병합 수기발주 대장 스토어
  const effectiveManualStores = useMemo(() => {
    return mergeManualOrderStores(manualOrderStores, cloudOrderStores);
  }, [manualOrderStores, cloudOrderStores]);

  const manualOrderTargetProducts = useMemo(() => {
    try {
      const saved = localStorage.getItem('erp_manual_order_target_products_v1');
      if (saved) return JSON.parse(saved) as string[];
    } catch (e) {
      console.error(e);
    }
    return [];
  }, [isOpen]);

  // 리치웰페어 구글 시트 데이터 기반 계약번호 매핑 맵
  // 핵심 요구사항 반영:
  // - I열(Col 8) 결합원가(VAT포함) 합계가 리치웰페어 입금 금액
  // - W열(Col 22) 세금계산서 작성일 기준 다음달(익월)에 입금 적용
  const richwelfareMap = useMemo(() => {
    const map = new Map<string, {
      depositAmount: number;
      combinedCost: number;
      combinedRev: number;
      settlementTerm: string;
      certDate: string;
      taxInvoiceDate: string;
      expectedDepositMonth: string;
      raw: any[];
    }>();
    if (!richwelfareRows || richwelfareRows.length < 2) return map;

    const headerRow = (richwelfareRows[0] || []).map((h: any) => String(h || '').trim());
    const findExactOrIncludesCol = (exactKeywords: string[], includeKeywords: string[], defaultIdx: number) => {
      // 1. 정확히 일치하는 열 우선 탐색
      let idx = headerRow.findIndex((h: string) => exactKeywords.some(k => h === k));
      if (idx !== -1) return idx;
      // 2. 부분 일치 탐색
      idx = headerRow.findIndex((h: string) => includeKeywords.some(k => h.includes(k)));
      return idx !== -1 ? idx : defaultIdx;
    };

    const contractNoCol = findExactOrIncludesCol(['계약번호'], ['계약번호', '렌탈번호', '주문번호'], 0);
    // H열이 '결합원가(VAT제외)'(index 7), I열이 '결합원가(VAT포함)'(index 8)이므로 반드시 VAT포함이 우선 매칭되어야 함
    const combinedCostCol = findExactOrIncludesCol(['결합원가(VAT포함)', '결합원가 (VAT포함)'], ['결합원가(VAT포함)', '결합원가 (VAT포함)'], 8); // I열: 입금 금액
    const combinedRevCol = findExactOrIncludesCol(['결합매출액(VAT포함)', '결합매출액 (VAT포함)'], ['결합매출액(VAT포함)', '결합매출액 (VAT포함)'], 10); // K열
    const delDateCol = findExactOrIncludesCol(['배송일'], ['배송일', '배송일자'], 14);
    const certDateCol = findExactOrIncludesCol(['설치확인서등록일'], ['설치확인서등록일', '확인서등록일', '확인서일자'], 20);
    const settlementCol = findExactOrIncludesCol(['정산(+)'], ['정산(+)', '정산'], 21);
    const taxInvoiceDateCol = findExactOrIncludesCol(['세금계산서 작성일', '세금계산서작성일'], ['세금계산서 작성일', '세금계산서작성일', '세금계산서'], 22); // W열: 세금계산서 작성일

    richwelfareRows.slice(1).forEach((row) => {
      const cNo = String(row[contractNoCol] || '').trim();
      if (!cNo) return;

      const rawCost = String(row[combinedCostCol] || '').replace(/[^0-9.-]/g, '');
      const rawRev = String(row[combinedRevCol] || '').replace(/[^0-9.-]/g, '');
      const cost = parseFloat(rawCost) || 0; // I열 결합원가(VAT포함) = 더좋은라이프 입금 금액
      const rev = parseFloat(rawRev) || 0;
      const term = String(row[settlementCol] || '').trim();
      const certDate = String(row[certDateCol] || '').trim();
      const taxInvoiceDate = String(row[taxInvoiceDateCol] || '').trim();

      // W열 세금계산서 작성일 기준 다음달(익월) 입금월 산출 (예: 2026-09-30 -> 2026-10)
      let expectedDepositMonth = '';
      if (taxInvoiceDate) {
        const match = taxInvoiceDate.match(/(\d{4})[-./](\d{1,2})/);
        if (match) {
          const y = match[1];
          const m = match[2].padStart(2, '0');
          expectedDepositMonth = getNextMonthStr(`${y}-${m}`);
        }
      }

      // 세금계산서 작성일이 비어있는 경우 정산(+) 열(예: "2026년 09월 2차")의 익월을 fallback
      if (!expectedDepositMonth && term) {
        const match = term.match(/(\d{4})[^\d]+(\d{1,2})/);
        if (match) {
          const y = match[1];
          const m = match[2].padStart(2, '0');
          expectedDepositMonth = getNextMonthStr(`${y}-${m}`);
        }
      }

      // 확인서 등록일의 익월 fallback
      if (!expectedDepositMonth && certDate) {
        const match = certDate.match(/(\d{4})[-./](\d{1,2})/);
        if (match) {
          const y = match[1];
          const m = match[2].padStart(2, '0');
          expectedDepositMonth = getNextMonthStr(`${y}-${m}`);
        }
      }

      const obj = {
        depositAmount: cost, // I열 결합원가 = 입금 금액
        combinedCost: cost,
        combinedRev: rev,
        settlementTerm: term,
        certDate,
        taxInvoiceDate,
        expectedDepositMonth,
        raw: row
      };

      map.set(cNo, obj);
      const digits = cNo.replace(/[^0-9]/g, '');
      if (digits && digits !== cNo) map.set(digits, obj);
    });

    return map;
  }, [richwelfareRows]);

  // 정산 대상 데이터 추출 및 공급사 매핑 엔진
  // 핵심 요구사항:
  // 1) 배송완료 상태
  // 2) 공급사 취급제품 매칭 및 렌탈계약번호 기준 상품개수 1개씩 운영
  // 3) 공급수수료는 설치확인서 등록유무에 따라 지급일자/정산월 결정:
  //    - 설치확인서 등록완료 건: 마감월/지급월에 공급사 정산일자로 정상 지급 대상
  //    - 설치확인서 미등록 건: 지급 보류 (합계 제외, 보류 현황 별도 표시)
  // 4) 본부별 차등 공급수수료 우선 매칭 (미지정 본부는 0원 미지급)
  // 5) 리치웰페어 입금액[A] - 공급사 물품대금[B] - 공급수수료[C] = 실질 순수익[D] 산출
  const allSettlementItems = useMemo<SupplierSettlementItem[]>(() => {
    if (!data || data.length === 0 || suppliers.length === 0) return [];

    const result: SupplierSettlementItem[] = [];
    const seenRentalNos = new Set<string>(); // 렌탈계약번호 기준 상품개수 중복 방지

    data.forEach((item) => {
      // 1. 상태 판별 (취소/해약/반품/철회 제외)
      const isCancelled = 
        item.status?.includes('취소') ||
        item.status?.includes('해약') ||
        item.status?.includes('반품') ||
        item.status?.includes('철회') ||
        item.deliveryStatus?.includes('취소');
      if (isCancelled) return;

      // 2. 수기발주 및 배송 상태 판정
      const manualInfo = getManualOrderInfo(item, effectiveManualStores);
      const effectiveDeliveryStatus = manualInfo?.deliveryState || item.deliveryStatus || '';
      const effectiveDeliveryDate = manualInfo?.deliveryDate || item.deliveryDate || '';

      // 배송완료 상태여야 정산 대상
      if (!effectiveDeliveryStatus.includes('완료') && effectiveDeliveryStatus !== '배송완료') {
        return;
      }

      // 3. 공급사 및 취급 제품 매칭 (렌탈상품명 또는 제품명 대조)
      const targetProdString = `${item.rentalProd || ''} ${item.prodName || ''}`.toLowerCase();

      let matchedSupplier: SupplierItem | null = null;
      let matchedProductSetting: SupplierProductSetting | null = null;

      for (const supp of suppliers) {
        if (!supp.isActive) continue;
        for (const prod of (supp.products || [])) {
          const keyword = (prod.productKeyword || '').trim().toLowerCase();
          if (keyword && targetProdString.includes(keyword)) {
            matchedSupplier = supp;
            matchedProductSetting = prod;
            break;
          }
        }
        if (matchedSupplier) break;
      }

      if (!matchedSupplier || !matchedProductSetting) return;

      // 4. 렌탈계약번호 기준 상품개수 운영 (동일 렌탈계약번호 중복 제거)
      const cleanRentalNo = (item.rentalNo || '').trim();
      if (cleanRentalNo && cleanRentalNo !== '-' && cleanRentalNo !== 'null' && cleanRentalNo !== 'undefined') {
        if (seenRentalNos.has(cleanRentalNo)) {
          return;
        }
        seenRentalNos.add(cleanRentalNo);
      }

      // 리치웰페어 정보 선행 조회 (설치확인서 및 입금액 연동)
      const cleanNo = cleanRentalNo || item.rentalNo || '';
      const richInfo = richwelfareMap.get(cleanNo) || (cleanNo.replace(/[^0-9]/g, '') ? richwelfareMap.get(cleanNo.replace(/[^0-9]/g, '')) : null);

      // 5. 설치확인서 등록 여부 및 마감월 정밀 판정
      const rawCertStatus = manualInfo?.installCertStatus;
      const certDate = manualInfo?.installCertDate || richInfo?.certDate || '';
      let certMonth = manualInfo?.installCertMonth || (certDate ? extractYearMonth(certDate) : '');

      // 보조 헬퍼 확인
      const certEligibility = checkInstallCertEligibility(item, effectiveManualStores, manualOrderTargetProducts);
      if (!certMonth && certEligibility?.certMonth) {
        certMonth = certEligibility.certMonth;
      }

      const isManualTarget = !!certEligibility?.isTargetOrder || isManualTargetProduct(item.prodName, item.rentalProd, manualOrderTargetProducts) || !!manualInfo;
      const isCertRegistered = (rawCertStatus === '등록' || !!certDate || !!certMonth) && !!certMonth;
      const finalCertStatus: '등록' | '미등록' = isCertRegistered ? '등록' : '미등록';

      // 6. 공급사 정산일 및 지급일자/지급월 계산
      const sDay = matchedSupplier.settlementDay || 31;
      let pMonth = '';
      let pDate = '';

      if (isCertRegistered && certMonth) {
        pMonth = payoutRuleMode === 'NEXT_MONTH' ? getNextMonthStr(certMonth) : certMonth;
        pDate = formatSettlementDate(pMonth, sDay);
      } else {
        pMonth = '';
        pDate = '지급 보류 (확인서 미등록)';
      }

      // 7. 공급사 상품별 수수료 단가 산출 (본부차등적용 없이 상품에 책정된 수수료 일괄 적용)
      let finalCommission = matchedProductSetting.supplyCommission || 0;
      // 기존 hqCommissions 데이터가 등록되어 있는 경우 호환 지원
      if (!finalCommission && matchedProductSetting.hqCommissions && matchedProductSetting.hqCommissions.length > 0) {
        finalCommission = matchedProductSetting.hqCommissions[0]?.commission || 0;
      }

      // 8. 물품대금 및 공급수수료 적격성/보류 여부 판별
      const delMonth = extractYearMonth(effectiveDeliveryDate);

      // ⭐ 정산기준월이 M월이면 전월(M-1월) 배송완료 건이 집계 대상
      // 예: 정산기준월 10월 -> 9월달 배송완료 건 집계
      // 이때 설치확인서 등록여부는 finalCertStatus ('등록' | '미등록')로 집계 및 카운트
      const isSupplyPricePayable = !!targetDeliveryMonth && delMonth === targetDeliveryMonth;

      let isCommPayable = false;
      let isCertHold = false;
      let holdReason = '';

      if (!isCertRegistered) {
        // 배송완료 처리된 건 중 설치확인서 미등록 건은 모두 '확인서 미등록 보류'
        isCertHold = true;
        holdReason = '설치확인서 미등록 (지급보류)';
      } else if (finalCommission <= 0) {
        holdReason = '수수료 미설정 (0원)';
      } else if (pMonth === selectedMonth) {
        isCommPayable = true;
      } else {
        holdReason = `정산월 불일치 (지급월: ${pMonth})`;
      }

      const qty = 1; // 렌탈계약번호 1건 = 상품개수 1개
      const sPrice = matchedProductSetting.supplyPrice || 0;
      const totalSupplyAmt = sPrice * qty;
      const totalCommAmt = finalCommission * qty;

      // 9. 리치웰페어 입금 수수료 [A] 및 손익 [D] 계산
      // 핵심: 리치웰페어 시트 I열 결합원가(VAT포함)가 입금 금액이며, W열 세금계산서 작성일 기준 다음달에 입금
      let richDeposit = 0;
      let richTaxDate = '';
      let richDepositMonth = '';
      let isRichMatched = false;

      if (richInfo && (richInfo.depositAmount > 0 || richInfo.combinedCost > 0)) {
        richDeposit = richInfo.depositAmount || richInfo.combinedCost; // I열 결합원가(VAT포함) 합계
        richTaxDate = richInfo.taxInvoiceDate;
        richDepositMonth = richInfo.expectedDepositMonth;
        isRichMatched = true;
      } else {
        // 리치웰페어 시트에 미등록된 건은 입금액 0원 및 세금계산서 작성일 없음
        richDeposit = 0;
        richTaxDate = '';
        richDepositMonth = '';
      }

      // [D] 건별 순수익 = [A] 리치웰페어 입금액 - [B] 공급 물품대금 - [C] 공급수수료
      const itemNetProfit = richDeposit - totalSupplyAmt - totalCommAmt;
      const itemMarginRate = richDeposit > 0 ? (itemNetProfit / richDeposit) * 100 : 0;

      result.push({
        uniqueKey: cleanRentalNo || item.uniqueKey || `item-${Date.now()}-${Math.random()}`,
        rentalNo: cleanRentalNo || item.rentalNo || '-',
        contractDate: item.contractDate || '-',
        memName: item.memName || '-',
        phone: item.phone || '-',
        prodName: item.prodName || '-',
        rentalProdRaw: item.rentalProd || item.prodName || '-',
        matchedSupplierId: matchedSupplier.id,
        matchedSupplierName: matchedSupplier.name,
        matchedProductId: matchedProductSetting.id,
        matchedProductName: matchedProductSetting.productName || matchedProductSetting.productKeyword,
        quantity: qty,
        supplyPrice: sPrice,
        totalSupplyPrice: totalSupplyAmt,
        supplyCommission: finalCommission,
        totalCommission: totalCommAmt,
        isHqDifferentiated: false,
        commissionRecipient: matchedProductSetting.commissionRecipient || matchedSupplier.name,
        recipientBank: matchedProductSetting.recipientBank || matchedSupplier.bankName,
        recipientAccount: matchedProductSetting.recipientAccount || matchedSupplier.accountNumber,
        recipientHolder: matchedProductSetting.recipientHolder || matchedSupplier.accountHolder,
        deliveryDate: effectiveDeliveryDate,
        deliveryStatus: '배송완료',
        installCertStatus: finalCertStatus,
        installCertDate: certDate || undefined,
        installCertMonth: certMonth || undefined,
        payoutDate: pDate,
        payoutMonth: pMonth,
        isCommissionPayable: isCommPayable,
        isCertHold,
        commissionHoldReason: holdReason,
        isSupplyPricePayable,
        isManualOrderTarget: isManualTarget,
        richwelfareDeposit: richDeposit,
        richwelfareTaxDate: richTaxDate || undefined,
        richwelfareDepositMonth: richDepositMonth || undefined,
        isRichwelfareMatched: isRichMatched,
        netProfit: itemNetProfit,
        marginRate: itemMarginRate,
        hq: item.hq || '-',
        branch: item.branch || '-',
        empName: item.empName || '-'
      });
    });

    return result;
  }, [data, suppliers, selectedMonth, targetDeliveryMonth, effectiveManualStores, manualOrderTargetProducts, payoutRuleMode, richwelfareMap]);

  // ==========================================
  // [1] 물품 대금 집계 (공급사별) - 전월(targetDeliveryMonth) 배송완료 기준
  // ==========================================
  const supplyPriceSummaries = useMemo<SupplyPriceSummary[]>(() => {
    const summaryMap = new Map<string, SupplyPriceSummary>();

    // 등록된 공급사 기준 초기화
    suppliers.forEach((s) => {
      summaryMap.set(s.id, {
        supplierId: s.id,
        supplierName: s.name,
        businessNo: s.businessNo || '-',
        bankName: s.bankName || '-',
        accountNumber: s.accountNumber || '-',
        accountHolder: s.accountHolder || '-',
        settlementDay: s.settlementDay || 31,
        productCount: 0,
        certRegisteredCount: 0,
        certUnregisteredCount: 0,
        totalSupplyAmount: 0,
        items: []
      });
    });

    allSettlementItems.forEach((item) => {
      // 물품대금은 배송완료월이 targetDeliveryMonth(전월)인 건만 집계
      if (!item.isSupplyPricePayable) return;

      let supp = summaryMap.get(item.matchedSupplierId);
      if (!supp) {
        supp = {
          supplierId: item.matchedSupplierId,
          supplierName: item.matchedSupplierName,
          businessNo: '-',
          bankName: '-',
          accountNumber: '-',
          accountHolder: '-',
          settlementDay: 31,
          productCount: 0,
          certRegisteredCount: 0,
          certUnregisteredCount: 0,
          totalSupplyAmount: 0,
          items: []
        };
        summaryMap.set(item.matchedSupplierId, supp);
      }

      supp.productCount += item.quantity;
      if (item.installCertStatus === '등록') {
        supp.certRegisteredCount += item.quantity;
      } else {
        supp.certUnregisteredCount += item.quantity;
      }
      supp.totalSupplyAmount += item.totalSupplyPrice;
      supp.items.push(item);
    });

    return Array.from(summaryMap.values());
  }, [suppliers, allSettlementItems]);

  // 물품 대금 전체 KPI (배송완료 상품수, 설치확인서 등록/미등록 건수, 총 물품대금)
  const supplyPriceTotalStats = useMemo(() => {
    let productCount = 0;
    let certRegisteredCount = 0;
    let certUnregisteredCount = 0;
    let totalSupplyAmount = 0;
    supplyPriceSummaries.forEach(s => {
      productCount += s.productCount;
      certRegisteredCount += s.certRegisteredCount;
      certUnregisteredCount += s.certUnregisteredCount;
      totalSupplyAmount += s.totalSupplyAmount;
    });
    return { productCount, certRegisteredCount, certUnregisteredCount, totalSupplyAmount };
  }, [supplyPriceSummaries]);

  // 선택된 특정 공급사 요약 정보
  const selectedSupplierSummary = useMemo(() => {
    if (selectedSupplierId === 'ALL') return null;
    return supplyPriceSummaries.find(s => s.supplierId === selectedSupplierId) || null;
  }, [selectedSupplierId, supplyPriceSummaries]);

  // ==========================================
  // [2] 공급 수수료(특수수당) 집계 (관련 공급사 기준별)
  // 지급 대상 건만 정상 집계 (확인서 미등록 보류 분리 제거)
  // ==========================================
  const commissionSummaries = useMemo<CommissionSummary[]>(() => {
    const summaryMap = new Map<string, CommissionSummary>();

    allSettlementItems.forEach((item) => {
      // 수수료 0원인 건은 제외
      if (item.totalCommission <= 0) return;

      const recipientName = item.commissionRecipient || item.matchedSupplierName;
      const key = `${item.matchedSupplierId}_${recipientName}`;

      let comm = summaryMap.get(key);
      if (!comm) {
        comm = {
          recipientKey: key,
          supplierId: item.matchedSupplierId,
          supplierName: item.matchedSupplierName,
          commissionRecipient: recipientName,
          recipientBank: item.recipientBank || '-',
          recipientAccount: item.recipientAccount || '-',
          recipientHolder: item.recipientHolder || '-',
          productCount: 0,
          totalCommissionAmount: 0,
          holdCount: 0,
          holdCommissionAmount: 0,
          items: []
        };
        summaryMap.set(key, comm);
      }

      if (item.isCommissionPayable) {
        comm.productCount += item.quantity;
        comm.totalCommissionAmount += item.totalCommission;
        comm.items.push(item);
      }
    });

    return Array.from(summaryMap.values());
  }, [allSettlementItems]);

  // ==========================================
  // [2-1] 수령처별 통합 집계 (리치웰페어 -> 수령처 직접 지급 기준)
  // 동일 수령처의 모든 관련 공급사 건을 1건으로 통합
  // ==========================================
  const commissionRecipientSummaries = useMemo<CommissionSummary[]>(() => {
    const summaryMap = new Map<string, CommissionSummary>();

    allSettlementItems.forEach((item) => {
      if (item.totalCommission <= 0) return;
      if (!item.isCommissionPayable) return;

      const recipientName = item.commissionRecipient || item.matchedSupplierName;
      const key = recipientName;

      let comm = summaryMap.get(key);
      if (!comm) {
        comm = {
          recipientKey: key,
          supplierId: item.matchedSupplierId,
          supplierName: item.matchedSupplierName,
          commissionRecipient: recipientName,
          recipientBank: item.recipientBank || '-',
          recipientAccount: item.recipientAccount || '-',
          recipientHolder: item.recipientHolder || '-',
          productCount: 0,
          totalCommissionAmount: 0,
          holdCount: 0,
          holdCommissionAmount: 0,
          items: []
        };
        summaryMap.set(key, comm);
      }

      comm.productCount += item.quantity;
      comm.totalCommissionAmount += item.totalCommission;
      comm.items.push(item);
    });

    const list = Array.from(summaryMap.values());
    list.forEach(c => {
      // 공급사별(가나다순) -> 제품명 -> 계약번호/배송일자 순 정렬
      c.items.sort((a, b) => {
        const suppDiff = (a.matchedSupplierName || '').localeCompare(b.matchedSupplierName || '', 'ko');
        if (suppDiff !== 0) return suppDiff;
        const prodDiff = (a.matchedProductName || '').localeCompare(b.matchedProductName || '', 'ko');
        if (prodDiff !== 0) return prodDiff;
        return (b.rentalNo || '').localeCompare(a.rentalNo || '');
      });

      const suppSet = Array.from(new Set(c.items.map(i => i.matchedSupplierName))).filter(Boolean);
      if (suppSet.length > 1) {
        c.supplierName = `${suppSet.join(', ')} (${suppSet.length}개 공급사)`;
      } else if (suppSet.length === 1) {
        c.supplierName = suppSet[0];
      }
    });

    return list;
  }, [allSettlementItems]);

  // 현재 집계 모드에 따른 표시 목록 (관련 공급사 기준별 vs 수령처별 통합)
  const displayedCommissionSummaries = useMemo(() => {
    return commissionGroupMode === 'RECIPIENT_BASED'
      ? commissionRecipientSummaries
      : commissionSummaries;
  }, [commissionGroupMode, commissionRecipientSummaries, commissionSummaries]);

  // 공급 수수료 전체 KPI (세금계산서 공급가액 및 부가세 산출)
  const commissionTotalStats = useMemo(() => {
    let productCount = 0;
    let totalCommissionAmount = 0;

    commissionSummaries.forEach(c => {
      productCount += c.productCount;
      totalCommissionAmount += c.totalCommissionAmount;
    });

    const supplyPrice = Math.round(totalCommissionAmount / 1.1);
    const vat = totalCommissionAmount - supplyPrice;

    return { 
      productCount, 
      totalCommissionAmount, 
      supplyPrice,
      vat,
      recipientCount: new Set(commissionSummaries.map(c => c.commissionRecipient)).size,
      holdCount: 0, 
      holdCommissionAmount: 0 
    };
  }, [commissionSummaries]);

  // 상세 내역 모달 열기 핸들러
  const handleOpenDetailModal = (summary: CommissionSummary) => {
    const recipientItems = allSettlementItems.filter(
      i => (i.commissionRecipient || i.matchedSupplierName) === summary.commissionRecipient && i.isCommissionPayable
    );
    setDetailModalTarget({
      recipientKey: summary.recipientKey,
      supplierId: summary.supplierId,
      supplierName: summary.supplierName,
      commissionRecipient: summary.commissionRecipient,
      recipientBank: summary.recipientBank,
      recipientAccount: summary.recipientAccount,
      recipientHolder: summary.recipientHolder,
      productCount: summary.productCount,
      totalCommissionAmount: summary.totalCommissionAmount,
      items: summary.items as SettlementDetailItem[]
    });
    setDetailRecipientAllItems(recipientItems as SettlementDetailItem[]);
    setIsDetailModalOpen(true);
  };

  // 개별 명세서 엑셀 다운로드 핸들러
  const handleExportSingleCommissionStatement = (summary: CommissionSummary) => {
    exportCommissionStatementExcel(
      summary.commissionRecipient,
      summary.recipientBank,
      summary.recipientAccount,
      summary.recipientHolder,
      selectedMonth,
      summary.items as SettlementDetailItem[],
      commissionGroupMode === 'SUPPLIER_BASED' ? summary.supplierName : undefined
    );
  };

  // ==========================================
  // [3] 리치웰페어 수기발주 손익 결산 종합 및 공급사별 요약
  // [A] 리치웰페어 총 입금액 - [B] 공급 물품대금 - [C] 공급수수료 = [D] 최종 실질 순이익
  // ==========================================
  const richwelfareProfitSummary = useMemo(() => {
    // 해당 정산월(selectedMonth)의 손익 결산 대상:
    // 핵심 규칙: W열 세금계산서 작성일이 존재하고, 그 익월 입금월이 selectedMonth와 일치하며, I열 결합원가 입금액이 0보다 큰 건만 포함!
    // (세금계산서 작성일이 없거나 입금액이 없는 미입금건은 손익 결산 대상에서 제외)
    const targetItems = allSettlementItems.filter(item => {
      return !!item.richwelfareTaxDate &&
             item.richwelfareDepositMonth === selectedMonth &&
             (item.richwelfareDeposit || 0) > 0;
    });

    // 공급사별(가나다순) -> 제품명 -> 계약번호 순 정렬
    targetItems.sort((a, b) => {
      const suppDiff = (a.matchedSupplierName || '').localeCompare(b.matchedSupplierName || '', 'ko');
      if (suppDiff !== 0) return suppDiff;
      const prodDiff = (a.matchedProductName || '').localeCompare(b.matchedProductName || '', 'ko');
      if (prodDiff !== 0) return prodDiff;
      return (b.rentalNo || '').localeCompare(a.rentalNo || '');
    });

    let totalDeposit = 0;      // [A] 리치웰페어 총 입금액 (I열 결합원가 합계, W열 세금계산서 작성일 익월 입금)
    let totalSupplyPrice = 0;  // [B] 공급 물품대금 합계
    let totalCommission = 0;   // [C] 공급 수수료 합계
    let totalNetProfit = 0;    // [D] 최종 순수익
    const count = targetItems.length;

    // 공급사별 손익 요약 맵
    const supplierProfitMap = new Map<string, {
      supplierId: string;
      supplierName: string;
      count: number;
      productCount: number;
      depositAmount: number;
      supplyPriceAmount: number;
      commissionAmount: number;
      netProfitAmount: number;
      marginRate: string;
    }>();

    targetItems.forEach(item => {
      const dep = item.richwelfareDeposit || 0;
      const supp = item.totalSupplyPrice || 0;
      const comm = item.totalCommission || 0;
      const net = dep - supp - comm;

      totalDeposit += dep;
      totalSupplyPrice += supp;
      totalCommission += comm;
      totalNetProfit += net;

      let sp = supplierProfitMap.get(item.matchedSupplierId);
      if (!sp) {
        sp = {
          supplierId: item.matchedSupplierId,
          supplierName: item.matchedSupplierName,
          count: 0,
          productCount: 0,
          depositAmount: 0,
          supplyPriceAmount: 0,
          commissionAmount: 0,
          netProfitAmount: 0,
          marginRate: '0.0'
        };
        supplierProfitMap.set(item.matchedSupplierId, sp);
      }

      sp.count += 1;
      sp.productCount += item.quantity;
      sp.depositAmount += dep;
      sp.supplyPriceAmount += supp;
      sp.commissionAmount += comm;
      sp.netProfitAmount += net;
    });

    const supplierProfitList = Array.from(supplierProfitMap.values()).map(sp => {
      const rate = sp.depositAmount > 0 ? ((sp.netProfitAmount / sp.depositAmount) * 100).toFixed(1) : '0.0';
      return { ...sp, marginRate: rate };
    });

    const totalMarginRate = totalDeposit > 0 ? ((totalNetProfit / totalDeposit) * 100).toFixed(1) : '0.0';

    return {
      targetItems,
      count,
      totalDeposit,
      totalSupplyPrice,
      totalCommission,
      totalNetProfit,
      totalMarginRate,
      supplierProfitList
    };
  }, [allSettlementItems, selectedMonth]);

  // 필터링된 상세 건별 목록 (검색, 공급사, 탭, 설치확인서 필터 연동)
  const filteredDetailItems = useMemo(() => {
    const list = allSettlementItems.filter((item) => {
      const matchSupplier = selectedSupplierId === 'ALL' || item.matchedSupplierId === selectedSupplierId;
      if (!matchSupplier) return false;

      // 물품대금 탭인 경우 (전월 배송완료 건)
      if (mainTab === 'SUPPLY_PRICE') {
        if (!item.isSupplyPricePayable) return false;
        if (certFilter === 'PAYABLE') {
          if (item.installCertStatus !== '등록') return false;
        } else if (certFilter === 'HOLD') {
          if (item.installCertStatus === '등록') return false;
        }
      }

      // 공급 수수료 탭인 경우
      if (mainTab === 'COMMISSION') {
        if (item.totalCommission <= 0) return false;

        // 설치확인서 필터 적용
        if (certFilter === 'PAYABLE') {
          if (!item.isCommissionPayable) return false;
        } else if (certFilter === 'HOLD') {
          if (!item.isCertHold) return false;
        } else {
          // ALL 모드: 해당월 지급 대상 또는 배송완료 확인서 미등록 보류 건
          const isRelevant = item.isCommissionPayable || item.isCertHold;
          if (!isRelevant) return false;
        }
      }

      // 리치웰페어 손익 결산 보고서 탭인 경우: 세금계산서 작성일이 있고 익월 입금월이 일치하며 입금액이 있는 건만 표시
      if (mainTab === 'PROFIT_REPORT') {
        const isDepositConfirmed = !!item.richwelfareTaxDate &&
                                  item.richwelfareDepositMonth === selectedMonth &&
                                  (item.richwelfareDeposit || 0) > 0;
        if (!isDepositConfirmed) return false;
      }

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        item.rentalNo.toLowerCase().includes(term) ||
        item.memName.toLowerCase().includes(term) ||
        item.matchedSupplierName.toLowerCase().includes(term) ||
        item.matchedProductName.toLowerCase().includes(term) ||
        item.hq.toLowerCase().includes(term) ||
        item.empName.toLowerCase().includes(term) ||
        item.commissionRecipient.toLowerCase().includes(term)
      );
    });

    // 모든 건별 상세 리스트 기본 정렬: 공급사별(가나다순) -> 제품명 -> 계약번호 순 정렬
    return list.sort((a, b) => {
      const suppDiff = (a.matchedSupplierName || '').localeCompare(b.matchedSupplierName || '', 'ko');
      if (suppDiff !== 0) return suppDiff;
      const prodDiff = (a.matchedProductName || '').localeCompare(b.matchedProductName || '', 'ko');
      if (prodDiff !== 0) return prodDiff;
      return (b.rentalNo || '').localeCompare(a.rentalNo || '');
    });
  }, [allSettlementItems, selectedSupplierId, searchTerm, mainTab, certFilter, selectedMonth]);

  // ==========================================
  // [엑셀 다운로드 1] 물품 대금 전용 정산서
  // ==========================================
  const handleExportSupplyPriceExcel = (targetSupplierId?: string) => {
    if (!XLSX) {
      alert('엑셀 라이브러리를 로드할 수 없습니다.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // 1. 공급사별 물품대금 총괄 요약 시트
    const summaryRows: any[][] = [
      [`리치웰페어 - 공급 물품대금 정산 총괄표 (${selectedMonth} 기준 - ${targetDeliveryMonth} 배송완료분)`],
      [`정산 기준: 정산기준월 ${selectedMonth} (전월 ${targetDeliveryMonth} 배송완료 건 집계, VAT 부가세 포함, 상품개수 기준)`],
      [`출력일시: ${new Date().toLocaleString()}`],
      [],
      ['공급사명', '사업자등록번호', '정산은행', '계좌번호', '예금주', '정산일', '배송완료 상품수', '설치확인서 등록', '설치확인서 미등록', '총 공급 물품대금 (VAT포함)']
    ];

    const targetSummaries = targetSupplierId && targetSupplierId !== 'ALL'
      ? supplyPriceSummaries.filter(s => s.supplierId === targetSupplierId)
      : supplyPriceSummaries;

    let subTotalCount = 0;
    let subTotalCertReg = 0;
    let subTotalCertUnreg = 0;
    let subTotalAmount = 0;

    targetSummaries.forEach((s) => {
      subTotalCount += s.productCount;
      subTotalCertReg += s.certRegisteredCount;
      subTotalCertUnreg += s.certUnregisteredCount;
      subTotalAmount += s.totalSupplyAmount;
      summaryRows.push([
        s.supplierName,
        s.businessNo,
        s.bankName,
        s.accountNumber,
        s.accountHolder,
        `매월 ${s.settlementDay}일`,
        { v: s.productCount, t: 'n', z: '#,##0' },
        { v: s.certRegisteredCount, t: 'n', z: '#,##0' },
        { v: s.certUnregisteredCount, t: 'n', z: '#,##0' },
        { v: s.totalSupplyAmount, t: 'n', z: '#,##0' }
      ]);
    });

    const sumStartRow = 5; // row 1-5: Title, Sub, Date, Blank, Header
    const sumEndRow = 4 + targetSummaries.length;
    summaryRows.push([
      '합계',
      '',
      '',
      '',
      '',
      '',
      targetSummaries.length > 0 ? { f: `SUM(G5:G${sumEndRow})`, v: subTotalCount, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      targetSummaries.length > 0 ? { f: `SUM(H5:H${sumEndRow})`, v: subTotalCertReg, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      targetSummaries.length > 0 ? { f: `SUM(I5:I${sumEndRow})`, v: subTotalCertUnreg, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      targetSummaries.length > 0 ? { f: `SUM(J5:J${sumEndRow})`, v: subTotalAmount, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' }
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = autoFitColWidths(summaryRows, 12, 45);
    applyTableExcelStyle(wsSummary, 'BLUE');
    XLSX.utils.book_append_sheet(wb, wsSummary, '물품대금총괄표');

    // 2. 건별 물품대금 상세 명세 시트 (공급사별 가나다순 -> 제품명 -> 계약번호 순 정렬)
    const rawItemsToExport = targetSupplierId && targetSupplierId !== 'ALL'
      ? allSettlementItems.filter(i => i.matchedSupplierId === targetSupplierId && i.isSupplyPricePayable)
      : allSettlementItems.filter(i => i.isSupplyPricePayable);

    const itemsToExport = [...rawItemsToExport].sort((a, b) => {
      const suppDiff = (a.matchedSupplierName || '').localeCompare(b.matchedSupplierName || '', 'ko');
      if (suppDiff !== 0) return suppDiff;
      const prodDiff = (a.matchedProductName || '').localeCompare(b.matchedProductName || '', 'ko');
      if (prodDiff !== 0) return prodDiff;
      return (b.rentalNo || '').localeCompare(a.rentalNo || '');
    });

    const detailRows: any[][] = [
      [`공급 물품대금 상세 명세서 (${selectedMonth} 기준 - ${targetDeliveryMonth} 배송완료분)`],
      ['순번', '렌탈계약번호', '계약일자', '배송완료일', '설치확인서 등록여부', '설치확인일자/마감월', '공급사명', '고객명', '매칭 제품명', '상품개수', '공급단가 (VAT포함)', '공급 물품대금 (VAT포함)', '본부', '지사', '영업사원']
    ];

    let totalDetailQty = 0;
    let totalDetailAmount = 0;

    itemsToExport.forEach((item, idx) => {
      const r = idx + 3; // 1-based row index in Excel (Row 1: Title, Row 2: Header)
      totalDetailQty += item.quantity || 1;
      totalDetailAmount += item.totalSupplyPrice || 0;

      detailRows.push([
        idx + 1,
        item.rentalNo,
        item.contractDate,
        item.deliveryDate,
        item.installCertStatus === '등록' ? '등록' : '미등록',
        item.installCertDate || item.installCertMonth || '-',
        item.matchedSupplierName,
        item.memName,
        item.matchedProductName,
        { v: item.quantity, t: 'n', z: '#,##0' },
        { v: item.supplyPrice, t: 'n', z: '#,##0' },
        { f: `J${r}*K${r}`, v: item.totalSupplyPrice, t: 'n', z: '#,##0' },
        item.hq,
        item.branch,
        item.empName
      ]);
    });

    if (itemsToExport.length > 0) {
      const lastDetailRow = itemsToExport.length + 2;
      detailRows.push([
        '합계',
        '', '', '', '', '', '', '', '',
        { f: `SUM(J3:J${lastDetailRow})`, v: totalDetailQty, t: 'n', z: '#,##0' },
        '',
        { f: `SUM(L3:L${lastDetailRow})`, v: totalDetailAmount, t: 'n', z: '#,##0' },
        '', '', ''
      ]);
    }

    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    wsDetail['!cols'] = autoFitColWidths(detailRows, 10, 40);
    applyTableExcelStyle(wsDetail, 'BLUE');
    XLSX.utils.book_append_sheet(wb, wsDetail, '물품대금상세명세');

    const fileName = targetSupplierId && targetSupplierId !== 'ALL'
      ? `${supplyPriceSummaries.find(s => s.supplierId === targetSupplierId)?.supplierName || '공급사'}_물품대금정산서_${selectedMonth}.xlsx`
      : `리치웰페어_공급물품대금정산서_${selectedMonth}.xlsx`;

    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.CalcPr) wb.Workbook.CalcPr = {};
    wb.Workbook.CalcPr.fullCalcOnLoad = true;

    XLSX.writeFile(wb, fileName);
  };

  // ==========================================
  // [엑셀 다운로드 2] 공급 수수료(특수수당) 전용 정산서
  // 수령처 기준으로 공급사 나열 및 지급대상 / 총지급수수료 상세내역 반영
  // ==========================================
  const handleExportCommissionExcel = (targetSupplierId?: string) => {
    if (!XLSX) {
      alert('엑셀 라이브러리를 로드할 수 없습니다.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // 1. [시트 1] 수령처별 공급 수수료 총괄 요약 시트
    const summaryRows: any[][] = [
      [`리치웰페어 - 공급 수수료(특수수당) 정산 총괄표 (${selectedMonth} 기준)`],
      [`지급 주체: (주)리치웰페어  |  정산 기준: 배송완료 및 당월 말일 설치확인 건 (금액: VAT 포함)  |  수령처 기준 정산`],
      [`※ 관련 공급사는 정산 산정 기준 표기이며, (주)리치웰페어에서 수령처 계좌로 직접 지급합니다.`],
      [`출력일시: ${new Date().toLocaleString()}`],
      [],
      ['순번', '수수료 수령처', '정산은행', '계좌번호', '예금주', '관련 공급사 (나열)', '지급 대상 건수', '공급가액 (VAT제외)', '부가세 (10%)', '총 지급 수수료 (VAT포함)']
    ];

    // 수령처별 통합 요약 대상 (또는 특정 공급사 필터 적용 시 해당 공급사 건만)
    const targetRecipientSummaries = targetSupplierId && targetSupplierId !== 'ALL'
      ? commissionRecipientSummaries.filter(c => c.items.some(i => i.matchedSupplierId === targetSupplierId))
      : commissionRecipientSummaries;

    let subTotalCount = 0;
    let subTotalAmount = 0;
    let subTotalSupply = 0;
    let subTotalVat = 0;

    targetRecipientSummaries.forEach((c, idx) => {
      // 특정 공급사 필터 시 해당 공급사 아이템만 집계
      const relevantItems = targetSupplierId && targetSupplierId !== 'ALL'
        ? c.items.filter(i => i.matchedSupplierId === targetSupplierId && i.isCommissionPayable)
        : c.items.filter(i => i.isCommissionPayable);

      const pCount = relevantItems.reduce((acc, cur) => acc + (cur.quantity || 1), 0);
      const tAmount = relevantItems.reduce((acc, cur) => acc + (cur.totalCommission || 0), 0);
      const supply = Math.round(tAmount / 1.1);
      const vat = tAmount - supply;

      // 관련 공급사 목록 쉼표 나열
      const suppNames = Array.from(new Set(relevantItems.map(i => i.matchedSupplierName))).filter(Boolean).join(', ');

      subTotalCount += pCount;
      subTotalAmount += tAmount;
      subTotalSupply += supply;
      subTotalVat += vat;

      summaryRows.push([
        idx + 1,
        c.commissionRecipient,
        c.recipientBank,
        c.recipientAccount,
        c.recipientHolder,
        suppNames || c.supplierName,
        { v: pCount, t: 'n', z: '#,##0' },
        { v: supply, t: 'n', z: '#,##0' },
        { v: vat, t: 'n', z: '#,##0' },
        { v: tAmount, t: 'n', z: '#,##0' }
      ]);
    });

    const sumStartRow = 7;
    const sumEndRow = 6 + targetRecipientSummaries.length;
    summaryRows.push([
      '합계',
      '',
      '',
      '',
      '',
      '',
      targetRecipientSummaries.length > 0 ? { f: `SUM(G7:G${sumEndRow})`, v: subTotalCount, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      targetRecipientSummaries.length > 0 ? { f: `SUM(H7:H${sumEndRow})`, v: subTotalSupply, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      targetRecipientSummaries.length > 0 ? { f: `SUM(I7:I${sumEndRow})`, v: subTotalVat, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      targetRecipientSummaries.length > 0 ? { f: `SUM(J7:J${sumEndRow})`, v: subTotalAmount, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' }
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = autoFitColWidths(summaryRows, 12, 45);
    applyTableExcelStyle(wsSummary, 'PURPLE');
    XLSX.utils.book_append_sheet(wb, wsSummary, '수령처별총괄표');

    // 2. [시트 2] 수령처별 건별 상세 내역 시트 (수령처 기준 공급사 나열 및 상세내역)
    const detailRows: any[][] = [
      [`공급 수수료(특수수당) 수령처별 상세 명세서 (${selectedMonth} 기준)`],
      [`지급 주체: (주)리치웰페어  |  수령처별 지급 상세 내역 (VAT포함)`],
      [`출력일시: ${new Date().toLocaleString()}`],
      []
    ];

    let overallDetailCount = 0;
    let overallDetailAmount = 0;

    targetRecipientSummaries.forEach((rec, recIdx) => {
      const items = (targetSupplierId && targetSupplierId !== 'ALL'
        ? rec.items.filter(i => i.matchedSupplierId === targetSupplierId && i.isCommissionPayable)
        : rec.items.filter(i => i.isCommissionPayable)
      );
      if (items.length === 0) return;

      // 공급사별(가나다순) -> 제품명 -> 계약번호 순 확실한 정렬
      items.sort((a, b) => {
        const suppDiff = (a.matchedSupplierName || '').localeCompare(b.matchedSupplierName || '', 'ko');
        if (suppDiff !== 0) return suppDiff;
        const prodDiff = (a.matchedProductName || '').localeCompare(b.matchedProductName || '', 'ko');
        if (prodDiff !== 0) return prodDiff;
        return (b.rentalNo || '').localeCompare(a.rentalNo || '');
      });

      const suppListStr = Array.from(new Set(items.map(i => i.matchedSupplierName))).filter(Boolean).join(', ');

      // 수령처 섹션 헤더
      detailRows.push([`[ ${recIdx + 1}. 수령처: ${rec.commissionRecipient}  |  예금주: ${rec.recipientHolder} (${rec.recipientBank} ${rec.recipientAccount})  |  관련 공급사: ${suppListStr} ]`]);
      detailRows.push([
        '순번', '관련 공급사', '렌탈계약번호', '계약일자', '배송완료일', '설치확인일자', 
        '고객명', '상품명', '제품명', '수량', '수수료 단가 (VAT포함)', '지급 수수료 (VAT포함)', '본부', '사원명'
      ]);

      const subStartRow = detailRows.length + 1; // 1-based index in Excel
      let recCount = 0;
      let recAmount = 0;

      items.forEach((item, itemIdx) => {
        const r = detailRows.length + 1;
        recCount += (item.quantity || 1);
        recAmount += (item.totalCommission || 0);
        overallDetailCount += (item.quantity || 1);
        overallDetailAmount += (item.totalCommission || 0);

        detailRows.push([
          itemIdx + 1,
          item.matchedSupplierName,
          item.rentalNo,
          item.contractDate || '-',
          item.deliveryDate || '-',
          item.installCertDate || item.installCertMonth || '-',
          item.memName,
          item.prodName,
          item.matchedProductName || item.rentalProdRaw || item.prodName,
          { v: item.quantity, t: 'n', z: '#,##0' },
          { v: item.supplyCommission, t: 'n', z: '#,##0' },
          { f: `J${r}*K${r}`, v: item.totalCommission, t: 'n', z: '#,##0' },
          item.hq || '-',
          item.empName || '-'
        ]);
      });

      const subEndRow = detailRows.length;
      detailRows.push([
        `[${rec.commissionRecipient}] 소계`,
        '', '', '', '', '', '', '', '',
        { f: `SUM(J${subStartRow}:J${subEndRow})`, v: recCount, t: 'n', z: '#,##0' },
        '',
        { f: `SUM(L${subStartRow}:L${subEndRow})`, v: recAmount, t: 'n', z: '#,##0' },
        '', ''
      ]);
      detailRows.push([]); // 빈 행
    });

    // 전체 총합계 행
    detailRows.push([
      '총합계',
      '', '', '', '', '', '', '', '',
      { v: overallDetailCount, t: 'n', z: '#,##0' },
      '',
      { v: overallDetailAmount, t: 'n', z: '#,##0' },
      '', ''
    ]);

    const wsRecipientDetail = XLSX.utils.aoa_to_sheet(detailRows);
    wsRecipientDetail['!cols'] = autoFitColWidths(detailRows, 10, 42);
    applyTableExcelStyle(wsRecipientDetail, 'PURPLE');
    XLSX.utils.book_append_sheet(wb, wsRecipientDetail, '수령처별상세내역');

    // 3. [시트 3] 영업조직별 특수수당 상세 명세 시트 (본부별 수수료 특수수당 운영 양식)
    const payableItems = allSettlementItems.filter(i => {
      const matchSupp = !targetSupplierId || targetSupplierId === 'ALL' || i.matchedSupplierId === targetSupplierId;
      return matchSupp && i.totalCommission > 0 && i.isCommissionPayable;
    });

    const sortedPayableItems = [...payableItems].sort((a, b) => {
      const prodA = a.matchedProductName || a.rentalProdRaw || a.prodName || '';
      const prodB = b.matchedProductName || b.rentalProdRaw || b.prodName || '';
      const prodDiff = prodA.localeCompare(prodB, 'ko');
      if (prodDiff !== 0) return prodDiff;
      const hqDiff = (a.hq || '').localeCompare(b.hq || '', 'ko');
      if (hqDiff !== 0) return hqDiff;
      return (a.memName || '').localeCompare(b.memName || '', 'ko');
    });

    const specialRows: any[][] = [
      [`영업조직별 특수수당 상세 명세서 (${selectedMonth} 기준)`],
      [`지급 주체: (주)리치웰페어  |  본부/영업조직별 지급 상세 내역`],
      [`출력일시: ${new Date().toLocaleString()}`],
      [],
      ['본부', '지사', '사원명', '고객명', '관련 공급사', '상품명', '제품명', '계약일자', '배송일자', '수수료 (VAT포함)']
    ];

    let currentProdKey = '';
    let prodSubCount = 0;
    let prodSubAmount = 0;
    let totalSpecialCount = 0;
    let totalSpecialAmount = 0;
    let groupStartRow = 6; // 1-based index
    const subtotalRowNumbers: number[] = [];

    sortedPayableItems.forEach((sp, idx) => {
      const prodKey = sp.matchedProductName || sp.rentalProdRaw || sp.prodName || '기타제품';

      if (idx > 0 && currentProdKey !== prodKey) {
        const subRowNo = specialRows.length + 1;
        const subEndRow = subRowNo - 1;
        subtotalRowNumbers.push(subRowNo);
        specialRows.push([
          `[${currentProdKey}] 소계`,
          '', '', '', '', '', '', '',
          `${prodSubCount}건`,
          { f: `SUM(J${groupStartRow}:J${subEndRow})`, v: prodSubAmount, t: 'n', z: '#,##0' }
        ]);
        prodSubCount = 0;
        prodSubAmount = 0;
        groupStartRow = subRowNo + 1;
      }

      currentProdKey = prodKey;
      prodSubCount++;
      prodSubAmount += sp.totalCommission;
      totalSpecialCount++;
      totalSpecialAmount += sp.totalCommission;

      specialRows.push([
        sp.hq || '-',
        sp.branch || '-',
        sp.empName || '-',
        sp.memName || '-',
        sp.matchedSupplierName || '-',
        sp.prodName || '-',
        sp.rentalProdRaw || sp.matchedProductName || sp.prodName || '-',
        sp.contractDate || '-',
        sp.deliveryDate || '-',
        { v: sp.totalCommission, t: 'n', z: '#,##0' }
      ]);
    });

    if (prodSubCount > 0) {
      const subRowNo = specialRows.length + 1;
      const subEndRow = subRowNo - 1;
      subtotalRowNumbers.push(subRowNo);
      specialRows.push([
        `[${currentProdKey}] 소계`,
        '', '', '', '', '', '', '',
        `${prodSubCount}건`,
        { f: `SUM(J${groupStartRow}:J${subEndRow})`, v: prodSubAmount, t: 'n', z: '#,##0' }
      ]);
    }

    if (totalSpecialCount > 0) {
      const totalFormula = subtotalRowNumbers.length > 0
        ? subtotalRowNumbers.map(r => `J${r}`).join('+')
        : `SUM(J6:J${specialRows.length})`;
      specialRows.push([
        '총합계',
        '', '', '', '', '', '', '',
        `${totalSpecialCount}건`,
        { f: totalFormula, v: totalSpecialAmount, t: 'n', z: '#,##0' }
      ]);
    }

    const wsSpecial = XLSX.utils.aoa_to_sheet(specialRows);
    wsSpecial['!cols'] = autoFitColWidths(specialRows, 10, 40);
    applyTableExcelStyle(wsSpecial, 'PURPLE');
    XLSX.utils.book_append_sheet(wb, wsSpecial, "영업조직별상세");

    const fileName = targetSupplierId && targetSupplierId !== 'ALL'
      ? `${suppliers.find(s => s.id === targetSupplierId)?.name || '공급사'}_공급수수료정산서_${selectedMonth}.xlsx`
      : `리치웰페어_수령처별_공급수수료정산서_${selectedMonth}.xlsx`;

    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.CalcPr) wb.Workbook.CalcPr = {};
    wb.Workbook.CalcPr.fullCalcOnLoad = true;

    XLSX.writeFile(wb, fileName);
  };

  // ==========================================
  // [엑셀 다운로드 3] 리치웰페어 손익 결산 보고서 전용 엑셀 다운로드
  // 에넥스 유통사 대사 손익보고서와 100% 동일한 양식 및 시트 구조
  // 시트 1: 정산보고서 (손익 결산 종합 및 공급사별 요약)
  // 시트 2: 대사보고 (건별 전체 상세 명세서 - 13열)
  // 시트 3~N: 공급사별 상세 명세 시트
  // ==========================================
  const handleExportRichwelfareProfitExcel = (targetSupplierId?: string) => {
    if (!XLSX) {
      alert('엑셀 라이브러리를 로드할 수 없습니다.');
      return;
    }

    const wb = XLSX.utils.book_new();

    const targetItems = targetSupplierId && targetSupplierId !== 'ALL'
      ? richwelfareProfitSummary.targetItems.filter(i => i.matchedSupplierId === targetSupplierId)
      : richwelfareProfitSummary.targetItems;

    let totDeposit = 0;
    let totSuppPrice = 0;
    let totComm = 0;
    let totNet = 0;

    targetItems.forEach(i => {
      totDeposit += i.richwelfareDeposit || 0;
      totSuppPrice += i.totalSupplyPrice || 0;
      totComm += i.totalCommission || 0;
      totNet += (i.richwelfareDeposit || 0) - (i.totalSupplyPrice || 0) - (i.totalCommission || 0);
    });

    const totMarginRate = totDeposit > 0 ? ((totNet / totDeposit) * 100).toFixed(1) : '0.0';

    // --- 시트 1: 정산보고서 ---
    const summaryRows: any[][] = [
      ['[ 리치웰페어 수기발주 대사 및 더좋은라이프 손익 결산 보고서 ]'],
      [`정산기준: ${selectedMonth} 기준 (설치확인 마감월 기준) | 출력일시: ${new Date().toLocaleDateString('ko-KR')}`],
      [],
      ['1. 리치웰페어 수기발주 실적 및 1차 영업수익 요약'],
      ['구분', '정산건수', '상품개수', '리치웰페어 입금액 [A]', '공급 물품대금 [B]', '공급 수수료 [C]', '실질 순수익 [D]', '비고'],
      [
        '수기발주 정산 건',
        targetItems.length,
        targetItems.reduce((acc, i) => acc + i.quantity, 0),
        { v: totDeposit, t: 'n', z: '#,##0' },
        { v: totSuppPrice, t: 'n', z: '#,##0' },
        { v: totComm, t: 'n', z: '#,##0' },
        { f: 'D6-E6-F6', v: totNet, t: 'n', z: '#,##0' },
        `영업이익률: ${totMarginRate}%`
      ],
      [],
      ['2. 공급사별 실적 및 손익 명세'],
      ['공급사명', '정산건수', '상품개수', '리치웰페어 입금액 [A]', '공급 물품대금 [B]', '공급 수수료 [C]', '실질 순수익 [D]', '수익률(%)']
    ];

    const targetSupplierList = targetSupplierId && targetSupplierId !== 'ALL'
      ? richwelfareProfitSummary.supplierProfitList.filter(s => s.supplierId === targetSupplierId)
      : richwelfareProfitSummary.supplierProfitList;

    const suppTableStartRow = 10;
    targetSupplierList.forEach((sp, i) => {
      const r = suppTableStartRow + i;
      summaryRows.push([
        sp.supplierName,
        sp.count,
        sp.productCount,
        { v: sp.depositAmount, t: 'n', z: '#,##0' },
        { v: sp.supplyPriceAmount, t: 'n', z: '#,##0' },
        { v: sp.commissionAmount, t: 'n', z: '#,##0' },
        { f: `D${r}-E${r}-F${r}`, v: sp.netProfitAmount, t: 'n', z: '#,##0' },
        `${sp.marginRate}%`
      ]);
    });

    const suppTableEndRow = suppTableStartRow + targetSupplierList.length - 1;
    const suppSubtotalRow = suppTableEndRow + 1;
    summaryRows.push([
      '공급사 소계',
      targetItems.length,
      targetItems.reduce((acc, i) => acc + i.quantity, 0),
      targetSupplierList.length > 0 ? { f: `SUM(D${suppTableStartRow}:D${suppTableEndRow})`, v: totDeposit, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      targetSupplierList.length > 0 ? { f: `SUM(E${suppTableStartRow}:E${suppTableEndRow})`, v: totSuppPrice, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      targetSupplierList.length > 0 ? { f: `SUM(F${suppTableStartRow}:F${suppTableEndRow})`, v: totComm, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      targetSupplierList.length > 0 ? { f: `D${suppSubtotalRow}-E${suppSubtotalRow}-F${suppSubtotalRow}`, v: totNet, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      `${totMarginRate}%`
    ]);

    summaryRows.push([]);
    summaryRows.push(['3. 최종 손익 정산 결산 종합']);
    summaryRows.push(['구분', '항목명', '금액', '비율(%)', '산출 공식 / 세부 내역', '비고']);
    
    const finalStartRow = suppSubtotalRow + 4; // Row of [A]
    const rowA = finalStartRow;
    const rowB = finalStartRow + 1;
    const rowC = finalStartRow + 2;
    const rowD = finalStartRow + 3;

    summaryRows.push([
      '[A] 총 입금액',
      '리치웰페어 결합원가 총 입금액',
      { v: totDeposit, t: 'n', z: '#,##0' },
      '100.0%',
      '리치웰페어 구글 시트 I열 결합원가(VAT포함) 합계 (W열 세금계산서 작성일 익월 입금)',
      '수익 원천'
    ]);
    summaryRows.push([
      '[B] 물품 대금',
      '공급사 지급 물품대금',
      { v: totSuppPrice, t: 'n', z: '#,##0' },
      totDeposit > 0 ? `${((totSuppPrice / totDeposit) * 100).toFixed(1)}%` : '0.0%',
      '바디프랜드, 쿠쿠, 가스트로플러스 등 공급사 원가',
      '1차 비용'
    ]);
    summaryRows.push([
      '[C] 공급 수수료',
      '본부 및 특수수당 지급액',
      { v: totComm, t: 'n', z: '#,##0' },
      totDeposit > 0 ? `${((totComm / totDeposit) * 100).toFixed(1)}%` : '0.0%',
      '본부 및 지정 수령처 지급 공급수수료 합계',
      '2차 비용'
    ]);
    summaryRows.push([
      '[D] 최종 순이익',
      '더좋은라이프 실질 순이익',
      { f: `C${rowA}-C${rowB}-C${rowC}`, v: totNet, t: 'n', z: '#,##0' },
      `${totMarginRate}%`,
      '[A] 총 입금액 - [B] 물품대금 - [C] 공급수수료',
      '최종 실현 순익'
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = autoFitColWidths(summaryRows, 12, 45);
    applyTableExcelStyle(wsSummary, 'EMERALD');
    XLSX.utils.book_append_sheet(wb, wsSummary, '정산보고서');

    // --- 시트 2: 대사보고 (15열 건별 상세 - 공급사별 정렬) ---
    const headers = [
      '계약일자', '배송일자', '세금계산서작성일(W열)', '입금월', '설치확인일자',
      '계약ID', '고객명', '본부명', '상품명', '제품명',
      '구좌수', '리치웰페어입금액(I열)', '공급물품대금', '공급수수료', '최종순수익', '비고'
    ];
    const detailRows: any[][] = [
      [`[ 리치웰페어 수기발주 대사보고 상세 명세서 (${selectedMonth} 기준) ]`],
      [`정산기준: ${selectedMonth} (설치확인 마감월 기준)  |  공급사별 정렬  |  출력일시: ${new Date().toLocaleDateString('ko-KR')}`],
      [],
      headers
    ];

    const sortedProfitTargetItems = [...targetItems].sort((a, b) => {
      const suppDiff = (a.matchedSupplierName || '').localeCompare(b.matchedSupplierName || '', 'ko');
      if (suppDiff !== 0) return suppDiff;
      const prodDiff = (a.matchedProductName || '').localeCompare(b.matchedProductName || '', 'ko');
      if (prodDiff !== 0) return prodDiff;
      return (b.rentalNo || '').localeCompare(a.rentalNo || '');
    });

    sortedProfitTargetItems.forEach((item, idx) => {
      const r = idx + 5; // Row 1: Title, Row 2: Sub, Row 3: Blank, Row 4: Header -> Data starts at row 5
      const net = (item.richwelfareDeposit || 0) - (item.totalSupplyPrice || 0) - (item.totalCommission || 0);
      detailRows.push([
        item.contractDate || '-',
        item.deliveryDate || '-',
        item.richwelfareTaxDate || '-',
        item.richwelfareDepositMonth || selectedMonth,
        item.installCertDate || item.payoutDate || '-',
        item.rentalNo,
        item.memName,
        item.hq || '-',
        item.prodName || '-',
        item.matchedProductName || item.rentalProdRaw || '-',
        item.quantity,
        { v: item.richwelfareDeposit || 0, t: 'n', z: '#,##0' },
        { v: item.totalSupplyPrice || 0, t: 'n', z: '#,##0' },
        { v: item.totalCommission || 0, t: 'n', z: '#,##0' },
        { f: `L${r}-M${r}-N${r}`, v: net, t: 'n', z: '#,##0' },
        item.installCertStatus === '등록' ? `정상 (${item.installCertMonth || '마감'})` : '확인서 미등록'
      ]);
    });

    const detailLastRow = 4 + sortedProfitTargetItems.length;
    detailRows.push([
      '총계', '', '', '', '', `${sortedProfitTargetItems.length}건`, '', '', '', '',
      sortedProfitTargetItems.length > 0 ? { f: `SUM(K5:K${detailLastRow})`, v: sortedProfitTargetItems.reduce((acc, i) => acc + i.quantity, 0), t: 'n', z: '#,##0' } : 0,
      sortedProfitTargetItems.length > 0 ? { f: `SUM(L5:L${detailLastRow})`, v: totDeposit, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      sortedProfitTargetItems.length > 0 ? { f: `SUM(M5:M${detailLastRow})`, v: totSuppPrice, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      sortedProfitTargetItems.length > 0 ? { f: `SUM(N5:N${detailLastRow})`, v: totComm, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      sortedProfitTargetItems.length > 0 ? { f: `SUM(O5:O${detailLastRow})`, v: totNet, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      `영업이익률: ${totMarginRate}%`
    ]);

    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    wsDetail['!cols'] = autoFitColWidths(detailRows, 10, 38);
    applyTableExcelStyle(wsDetail, 'EMERALD');
    XLSX.utils.book_append_sheet(wb, wsDetail, '대사보고');

    // --- 시트 3~N: 공급사별 상세 명세 시트 ---
    const suppGroups = new Map<string, SupplierSettlementItem[]>();
    targetItems.forEach(i => {
      const g = suppGroups.get(i.matchedSupplierName) || [];
      g.push(i);
      suppGroups.set(i.matchedSupplierName, g);
    });

    suppGroups.forEach((items, suppName) => {
      const suppRows: any[][] = [
        [`[ ${suppName} 공급 물품 및 수수료 정산 상세 명세서 - ${selectedMonth} ]`],
        [`정산 건수: ${items.length}건  |  출력일시: ${new Date().toLocaleDateString('ko-KR')}`],
        [],
        ['순번', '계약번호', '계약일자', '배송일자', '설치확인서/마감월', '고객명', '제품명', '수량', '리치웰페어입금액', '물품공급가', '공급수수료', '건별순익', '본부', '사원명']
      ];

      let subDep = 0;
      let subSupp = 0;
      let subComm = 0;
      let subNet = 0;

      items.forEach((item, idx) => {
        const r = idx + 5; // Rows 1-4 are Title, Info, Blank, Header
        const net = (item.richwelfareDeposit || 0) - (item.totalSupplyPrice || 0) - (item.totalCommission || 0);
        subDep += item.richwelfareDeposit || 0;
        subSupp += item.totalSupplyPrice || 0;
        subComm += item.totalCommission || 0;
        subNet += net;

        suppRows.push([
          idx + 1,
          item.rentalNo,
          item.contractDate || '-',
          item.deliveryDate || '-',
          item.installCertStatus === '등록' ? `등록완료 (${item.installCertMonth || '-'})` : '미등록',
          item.memName,
          item.matchedProductName,
          item.quantity,
          { v: item.richwelfareDeposit || 0, t: 'n', z: '#,##0' },
          { v: item.totalSupplyPrice || 0, t: 'n', z: '#,##0' },
          { v: item.totalCommission || 0, t: 'n', z: '#,##0' },
          { f: `I${r}-J${r}-K${r}`, v: net, t: 'n', z: '#,##0' },
          item.hq || '-',
          item.empName || '-'
        ]);
      });

      const suppItemsEndRow = items.length + 4;
      suppRows.push([
        '합계', '', '', '', '', '', '',
        items.length > 0 ? { f: `SUM(H5:H${suppItemsEndRow})`, v: items.reduce((acc, i) => acc + i.quantity, 0), t: 'n', z: '#,##0' } : 0,
        items.length > 0 ? { f: `SUM(I5:I${suppItemsEndRow})`, v: subDep, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
        items.length > 0 ? { f: `SUM(J5:J${suppItemsEndRow})`, v: subSupp, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
        items.length > 0 ? { f: `SUM(K5:K${suppItemsEndRow})`, v: subComm, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
        items.length > 0 ? { f: `SUM(L5:L${suppItemsEndRow})`, v: subNet, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
        '', ''
      ]);

      const wsSupp = XLSX.utils.aoa_to_sheet(suppRows);
      wsSupp['!cols'] = autoFitColWidths(suppRows, 8, 35);
      applyTableExcelStyle(wsSupp, 'EMERALD');
      const safeTitle = `${suppName.slice(0, 20)}_상세`;
      XLSX.utils.book_append_sheet(wb, wsSupp, safeTitle);
    });

    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.CalcPr) wb.Workbook.CalcPr = {};
    wb.Workbook.CalcPr.fullCalcOnLoad = true;

    const fileName = `리치웰페어_수기발주_손익결산보고서_${selectedMonth}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="bg-white rounded-2xl shadow-2xl w-[98vw] max-w-[1750px] h-[95vh] max-h-[95vh] flex flex-col overflow-hidden border border-slate-200"
      >
        {/* 모달 상단 헤더 */}
        <div className="px-6 py-3.5 bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-300 shadow-xs shrink-0">
              <Calculator size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-black tracking-tight whitespace-nowrap">
                  공급사 정산 관리
                </h2>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 whitespace-nowrap">
                  VAT(부가세) 포함
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 whitespace-nowrap">
                  렌탈계약번호 / 상품개수 기준
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/30 whitespace-nowrap">
                  물품대금 · 공급수수료 분리 운영
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 whitespace-nowrap">
                배송완료 및 당월 말일 설치확인 기준으로 공급사 '물품 대금'과 '공급 수수료(특수수당)'를 완전 분리하여 정산합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 whitespace-nowrap">
            {onOpenSupplierManagementModal && (
              <button
                onClick={onOpenSupplierManagementModal}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap"
                title="공급사 및 취급제품/단가/수수료 설정 관리"
              >
                <Building size={14} />
                <span>공급사 관리</span>
              </button>
            )}

            {/* 메인 탭에 따라 전용 엑셀 다운로드 실행 */}
            {mainTab === 'SUPPLY_PRICE' ? (
              <button
                onClick={() => handleExportSupplyPriceExcel(selectedSupplierId)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all whitespace-nowrap"
                title="물품 대금 정산서 엑셀 다운로드"
              >
                <FileSpreadsheet size={14} />
                <span>물품대금 정산서 엑셀 다운로드</span>
              </button>
            ) : mainTab === 'COMMISSION' ? (
              <button
                onClick={() => handleExportCommissionExcel(selectedSupplierId)}
                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all whitespace-nowrap"
                title="공급 수수료 정산서 엑셀 다운로드"
              >
                <FileSpreadsheet size={14} />
                <span>공급수수료 정산서 엑셀 다운로드</span>
              </button>
            ) : (
              <button
                onClick={() => handleExportRichwelfareProfitExcel(selectedSupplierId)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all whitespace-nowrap"
                title="리치웰페어 수기발주 손익 결산 보고서 엑셀 다운로드 (정산보고서 + 대사보고 + 공급사별상세)"
              >
                <FileSpreadsheet size={14} />
                <span>손익 결산 보고서 엑셀 다운로드</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer ml-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 메인 탭 네비게이션: 물품 대금 정산 vs 공급 수수료 정산 vs 손익 결산 (완전 분리) */}
        <div className="px-6 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setMainTab('SUPPLY_PRICE');
                setViewMode('SUMMARY');
              }}
              className={`px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                mainTab === 'SUPPLY_PRICE'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'
              }`}
            >
              <Package size={15} />
              <span>[1] 공급 물품대금 정산</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/20 text-white font-mono">
                {supplyPriceTotalStats.productCount}개 상품
              </span>
            </button>

            <button
              onClick={() => {
                setMainTab('COMMISSION');
                setViewMode('SUMMARY');
              }}
              className={`px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                mainTab === 'COMMISSION'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'
              }`}
            >
              <Coins size={15} />
              <span>[2] 공급 수수료(특수수당) 정산</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/20 text-white font-mono">
                {commissionTotalStats.productCount}개 상품
              </span>
            </button>

            <button
              onClick={() => {
                setMainTab('PROFIT_REPORT');
                setViewMode('SUMMARY');
              }}
              className={`px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                mainTab === 'PROFIT_REPORT'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'
              }`}
            >
              <Calculator size={15} />
              <span>[3] 리치웰페어 손익 결산 (통합)</span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/20 text-white font-mono font-bold">
                순익 {richwelfareProfitSummary.totalNetProfit.toLocaleString()}원
              </span>
            </button>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
            <Info size={14} className="text-indigo-400" />
            <span>회원번호 없이 <strong>렌탈계약번호</strong> 기준으로 상품개수(수량)가 집계됩니다.</span>
          </div>
        </div>

        {/* 컨트롤 필터 툴바 */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 whitespace-nowrap">
          <div className="flex flex-wrap items-center gap-3">
            {/* 정산 기준월 선택 */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                <Calendar size={14} className="text-indigo-600" />
                정산 기준월:
              </span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200/70 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none cursor-pointer"
              />
              {mainTab === 'SUPPLY_PRICE' && targetDeliveryMonth && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 shadow-2xs">
                  <span>배송완료 대상월:</span>
                  <strong className="text-blue-900 font-mono">{targetDeliveryMonth}</strong>
                  <span className="text-[10px] text-blue-500 font-medium">(전월)</span>
                </span>
              )}
            </div>

            {/* 공급사 필터 드롭다운 */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                <Building size={14} className="text-indigo-600" />
                공급사:
              </span>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none cursor-pointer"
              >
                <option value="ALL">전체 공급사 ({suppliers.length}개사)</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* 물품대금 탭 전용: 설치확인서 등록/미등록 필터 */}
            {mainTab === 'SUPPLY_PRICE' && (
              <>
                <div className="h-4 w-px bg-slate-200 mx-0.5" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <Filter size={13} className="text-blue-600" />
                    설치확인서:
                  </span>
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                    <button
                      onClick={() => setCertFilter('ALL')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        certFilter === 'ALL'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      전체 ({supplyPriceTotalStats.productCount})
                    </button>
                    <button
                      onClick={() => setCertFilter('PAYABLE')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                        certFilter === 'PAYABLE'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <CheckCircle size={11} />
                      <span>등록 ({supplyPriceTotalStats.certRegisteredCount})</span>
                    </button>
                    <button
                      onClick={() => setCertFilter('HOLD')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                        certFilter === 'HOLD'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <AlertCircle size={11} />
                      <span>미등록 ({supplyPriceTotalStats.certUnregisteredCount})</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* 공급수수료 탭 전용: 집계 기준 토글 및 지급규칙 선택 */}
            {mainTab === 'COMMISSION' && (
              <>
                <div className="h-4 w-px bg-slate-200 mx-0.5" />

                {/* 집계 방식 토글: 관련 공급사 기준별 vs 수령처별 통합 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <Layers size={13} className="text-purple-600" />
                    집계 방식:
                  </span>
                  <div className="flex items-center bg-purple-50 p-0.5 rounded-xl border border-purple-200">
                    <button
                      onClick={() => setCommissionGroupMode('SUPPLIER_BASED')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        commissionGroupMode === 'SUPPLIER_BASED'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-purple-800 hover:text-purple-950'
                      }`}
                      title="관련 공급사(기준)별로 각 행 분리 표기"
                    >
                      관련 공급사 기준별
                    </button>
                    <button
                      onClick={() => setCommissionGroupMode('RECIPIENT_BASED')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                        commissionGroupMode === 'RECIPIENT_BASED'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-purple-800 hover:text-purple-950'
                      }`}
                      title="리치웰페어에서 수령처로 지급하는 실지급 수령처별 통합 표기"
                    >
                      <CheckCircle size={12} />
                      <span>수령처별 통합</span>
                    </button>
                  </div>
                </div>

                {/* 지급월 판정 규칙 토글 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <Calendar size={13} className="text-indigo-600" />
                    지급기준:
                  </span>
                  <select
                    value={payoutRuleMode}
                    onChange={(e) => setPayoutRuleMode(e.target.value as any)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none cursor-pointer"
                    title="설치확인서 마감월 당월 정산일 지급 vs 익월 지급 선택"
                  >
                    <option value="CERT_MONTH">마감월 당월 정산 (기본: 말일)</option>
                    <option value="NEXT_MONTH">마감월 익월(다음달) 정산 지급</option>
                  </select>
                </div>
              </>
            )}

            <div className="h-4 w-px bg-slate-200 mx-0.5" />

            {/* 뷰 모드 토글 (총괄 요약 / 건별 상세 내역) */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('SUMMARY')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  viewMode === 'SUMMARY'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mainTab === 'SUPPLY_PRICE' ? '공급사별 총괄' : mainTab === 'COMMISSION' ? '수령처별 총괄' : '손익 종합 요약'}
              </button>
              <button
                onClick={() => setViewMode('DETAIL')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  viewMode === 'DETAIL'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                건별 상세 내역 ({filteredDetailItems.length}건)
              </button>
            </div>
          </div>

          {/* 우측 검색창 */}
          {viewMode === 'DETAIL' && (
            <div className="relative w-72 flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="렌탈계약번호/고객명/본부/제품 (Enter)..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSearchTerm(searchInput.trim());
                    }
                  }}
                  className="w-full pl-8.5 pr-7 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition-all"
                />
                {(searchInput || searchTerm) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setSearchTerm('');
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                    title="검색어 지우기"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSearchTerm(searchInput.trim())}
                className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-2xs whitespace-nowrap cursor-pointer shrink-0"
              >
                검색
              </button>
            </div>
          )}
        </div>

        {/* 상단 KPI 요약 카드 영역 (메인 탭에 따라 완전 분리) */}
        {mainTab === 'SUPPLY_PRICE' ? (
          /* [물품 대금 전용 KPI 카드] */
          <div className="px-6 py-3 bg-blue-50/50 border-b border-blue-100 grid grid-cols-3 gap-4 shrink-0 whitespace-nowrap">
            {/* 카드 1: 전월 배송완료 상품수 및 설치확인서 등록/미등록 카운트 */}
            <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <span>{targetDeliveryMonth ? `${targetDeliveryMonth}월 배송완료` : '전월 배송완료'} 상품</span>
                  {selectedSupplierSummary && (
                    <span className="text-blue-600 font-bold">({selectedSupplierSummary.supplierName})</span>
                  )}
                </p>
                <h3 className="text-xl font-black text-slate-900 mt-0.5 font-mono">
                  {(selectedSupplierSummary ? selectedSupplierSummary.productCount : supplyPriceTotalStats.productCount).toLocaleString()} <span className="text-xs font-bold text-slate-500">개</span>
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                    <CheckCircle size={10} />
                    <span>등록 {(selectedSupplierSummary ? selectedSupplierSummary.certRegisteredCount : supplyPriceTotalStats.certRegisteredCount).toLocaleString()}건</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 text-[10px] font-bold">
                    <AlertCircle size={10} />
                    <span>미등록 {(selectedSupplierSummary ? selectedSupplierSummary.certUnregisteredCount : supplyPriceTotalStats.certUnregisteredCount).toLocaleString()}건</span>
                  </span>
                </div>
              </div>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Package size={18} />
              </div>
            </div>

            {/* 카드 2: 총 공급 물품대금 합계 (전체) */}
            <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-blue-700 uppercase">총 공급 물품대금 합계 (전체)</p>
                <h3 className="text-xl font-black text-blue-700 mt-0.5 font-mono">
                  {supplyPriceTotalStats.totalSupplyAmount.toLocaleString()} <span className="text-xs font-bold text-blue-500">원</span>
                </h3>
                <p className="text-[10px] text-blue-500 mt-0.5 font-medium">
                  {targetDeliveryMonth ? `${targetDeliveryMonth}월` : '전월'} 배송완료 {supplyPriceTotalStats.productCount}건 전체 합계 (VAT포함)
                </p>
              </div>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <DollarSign size={18} />
              </div>
            </div>

            {/* 카드 3: 공급사 선택 시 해당 공급사별 물품대금 합계 및 확인서 현황 */}
            <div className={`p-3.5 rounded-xl shadow-2xs flex items-center justify-between transition-all ${
              selectedSupplierSummary
                ? 'bg-linear-to-br from-blue-900 via-indigo-900 to-slate-900 text-white'
                : 'bg-white border border-blue-100 text-slate-700'
            }`}>
              <div>
                <p className={`text-[11px] font-bold uppercase ${selectedSupplierSummary ? 'text-blue-200' : 'text-slate-500'}`}>
                  {selectedSupplierSummary ? `[${selectedSupplierSummary.supplierName}] 물품대금 합계` : '해당 공급사별 물품대금 합계'}
                </p>
                {selectedSupplierSummary ? (
                  <>
                    <h3 className="text-xl font-black text-amber-300 mt-0.5 font-mono">
                      {selectedSupplierSummary.totalSupplyAmount.toLocaleString()} <span className="text-xs font-bold text-blue-200">원</span>
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-emerald-300 font-bold">
                        확인서 등록: {selectedSupplierSummary.certRegisteredCount}건
                      </span>
                      <span className="text-[10px] text-slate-400">/</span>
                      <span className="text-[10px] text-amber-300 font-bold">
                        미등록: {selectedSupplierSummary.certUnregisteredCount}건
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-bold text-slate-400 mt-1">
                      공급사를 선택하세요
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      상단 공급사 필터 선택 시 해당 공급사 대금 및 확인서 현황 표시
                    </p>
                  </>
                )}
              </div>
              <div className={`p-2 rounded-lg ${selectedSupplierSummary ? 'bg-white/10 text-amber-300' : 'bg-slate-100 text-slate-400'}`}>
                <Building size={18} />
              </div>
            </div>
          </div>
        ) : mainTab === 'COMMISSION' ? (
          /* [공급 수수료 전용 KPI 카드 - 3개 그리드로 개편] */
          <div className="px-6 py-3 bg-purple-50/50 border-b border-purple-100 grid grid-cols-3 gap-4 shrink-0 whitespace-nowrap">
            {/* 카드 1: 실제 지급 대상 상품개수 */}
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-2xs flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <p className="text-[11px] font-bold text-emerald-800 uppercase">수수료 지급 대상 상품</p>
                </div>
                <h3 className="text-xl font-black text-emerald-700 mt-0.5 font-mono">
                  {commissionTotalStats.productCount.toLocaleString()} <span className="text-xs font-bold text-emerald-600">개</span>
                </h3>
                <p className="text-[10px] text-emerald-600 mt-0.5 font-medium">설치확인서 등록 완료 건</p>
              </div>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <CheckCircle size={18} />
              </div>
            </div>

            {/* 카드 2: 총 지급 수수료 합계 */}
            <div className="bg-white p-3.5 rounded-xl border border-purple-100 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-purple-700 uppercase">총 공급 수수료(특수수당) 지급액</p>
                <h3 className="text-xl font-black text-purple-700 mt-0.5 font-mono">
                  {commissionTotalStats.totalCommissionAmount.toLocaleString()} <span className="text-xs font-bold text-purple-500">원</span>
                </h3>
                <p className="text-[10px] text-purple-400 mt-0.5 font-medium">정산 대상 실지급 합계 (VAT포함)</p>
              </div>
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <DollarSign size={18} />
              </div>
            </div>

            {/* 카드 3: 세금계산서 발행 내역 (부가세 포함된 금액으로 부가세와 공급가 표기) */}
            <div className="bg-white p-3.5 rounded-xl border border-indigo-200 shadow-2xs flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <Receipt size={13} className="text-indigo-600" />
                  <p className="text-[11px] font-bold uppercase text-indigo-900">
                    세금계산서 발행 합계 (리치웰페어 → 수령처)
                  </p>
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xs font-bold text-slate-500">공급가</span>
                  <span className="text-base font-black text-slate-800 font-mono">
                    {commissionTotalStats.supplyPrice.toLocaleString()}원
                  </span>
                  <span className="text-xs font-bold text-slate-400">+</span>
                  <span className="text-xs font-bold text-indigo-600">부가세</span>
                  <span className="text-base font-black text-indigo-700 font-mono">
                    {commissionTotalStats.vat.toLocaleString()}원
                  </span>
                </div>
                <p className="text-[10px] mt-0.5 font-medium text-slate-500">
                  합계: <strong className="text-purple-700 font-mono">{commissionTotalStats.totalCommissionAmount.toLocaleString()}원</strong> (VAT포함) · 총 {commissionTotalStats.recipientCount}개 수령처
                </p>
              </div>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Receipt size={18} />
              </div>
            </div>
          </div>
        ) : (
          /* [리치웰페어 손익 결산 전용 KPI 카드 - 4개 그리드] */
          <div className="px-6 py-3 bg-emerald-50/50 border-b border-emerald-100 grid grid-cols-4 gap-4 shrink-0 whitespace-nowrap">
            {/* 카드 1: [A] 리치웰페어 총 입금액 (I열 결합원가) */}
            <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-2xs flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <p className="text-[11px] font-bold text-blue-800 uppercase">[A] 리치웰페어 총 입금액</p>
                </div>
                <h3 className="text-xl font-black text-blue-700 mt-0.5 font-mono">
                  {richwelfareProfitSummary.totalDeposit.toLocaleString()} <span className="text-xs font-bold text-blue-500">원</span>
                </h3>
                <p className="text-[10px] text-blue-500 mt-0.5 font-medium">I열 결합원가 (세금계산서 익월 입금, VAT포함)</p>
              </div>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <DollarSign size={18} />
              </div>
            </div>

            {/* 카드 2: [B] 공급 물품대금 합계 (1차 원가) */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  <p className="text-[11px] font-bold text-slate-700 uppercase">[B] 공급 물품대금 합계</p>
                </div>
                <h3 className="text-xl font-black text-slate-800 mt-0.5 font-mono">
                  {richwelfareProfitSummary.totalSupplyPrice.toLocaleString()} <span className="text-xs font-bold text-slate-500">원</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5 font-medium">공급사 지급 물품 원가 (VAT포함)</p>
              </div>
              <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
                <Package size={18} />
              </div>
            </div>

            {/* 카드 3: [C] 공급 수수료 합계 (2차 수당) */}
            <div className="bg-white p-3.5 rounded-xl border border-purple-200 shadow-2xs flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <p className="text-[11px] font-bold text-purple-800 uppercase">[C] 공급 수수료 합계</p>
                </div>
                <h3 className="text-xl font-black text-purple-700 mt-0.5 font-mono">
                  {richwelfareProfitSummary.totalCommission.toLocaleString()} <span className="text-xs font-bold text-purple-500">원</span>
                </h3>
                <p className="text-[10px] text-purple-500 mt-0.5 font-medium">본부 및 특수수당 지급액 (VAT포함)</p>
              </div>
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <Coins size={18} />
              </div>
            </div>

            {/* 카드 4: [D] 더좋은라이프 실질 순이익 (최종 순익) */}
            <div className="bg-linear-to-br from-emerald-600 to-teal-700 text-white p-3.5 rounded-xl shadow-xs flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-200" />
                  <p className="text-[11px] font-bold text-emerald-100 uppercase">[D] 더좋은라이프 최종 순익</p>
                </div>
                <h3 className="text-xl font-black text-white mt-0.5 font-mono">
                  {richwelfareProfitSummary.totalNetProfit.toLocaleString()} <span className="text-xs font-bold text-emerald-200">원</span>
                </h3>
                <p className="text-[10px] text-emerald-100 mt-0.5 font-medium">
                  영업이익률: <strong>{richwelfareProfitSummary.totalMarginRate}%</strong> ([A] - [B] - [C])
                </p>
              </div>
              <div className="p-2 bg-white/20 text-white rounded-lg">
                <CheckCircle size={18} />
              </div>
            </div>
          </div>
        )}

        {/* 본문 테이블 영역 */}
        <div className="flex-1 overflow-auto p-6 bg-slate-50 custom-scrollbar min-h-0">
          {suppliers.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <Building size={48} className="text-slate-300 mb-3" />
              <h3 className="text-base font-black text-slate-700">등록된 공급사가 없습니다</h3>
              <p className="text-xs text-slate-400 mt-1 mb-4 leading-relaxed">
                공급사와 취급 제품 키워드를 먼저 등록해야 배송완료 건과 매칭되어 정산이 이루어집니다.
              </p>
              {onOpenSupplierManagementModal && (
                <button
                  onClick={onOpenSupplierManagementModal}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Building size={14} />
                  <span>공급사 관리로 이동하여 등록하기</span>
                </button>
              )}
            </div>
          ) : mainTab === 'SUPPLY_PRICE' ? (
            /* ======================================================== */
            /* [메인 탭 1] 공급 물품 대금 정산 영역                     */
            /* ======================================================== */
            viewMode === 'SUMMARY' ? (
              /* 공급사별 물품대금 총괄표 */
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-blue-50/40 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Package className="text-blue-600" size={16} />
                    <h3 className="text-sm font-black text-slate-800">
                      공급사별 {selectedMonth} 물품대금 정산 총괄 현황
                    </h3>
                    {targetDeliveryMonth && (
                      <span className="text-xs text-blue-700 font-bold px-2 py-0.5 bg-blue-100 border border-blue-200 rounded-md">
                        배송완료 대상월: {targetDeliveryMonth} (전월)
                      </span>
                    )}
                    <span className="text-xs text-slate-500 font-medium">
                      (렌탈계약번호 기준 1건 집계 · 설치확인서 등록여부 카운트 · VAT 포함)
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-500">
                    총 {supplyPriceSummaries.length}개 공급사
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                        <th className="p-3.5 pl-5">공급사명</th>
                        <th className="p-3.5">사업자등록번호</th>
                        <th className="p-3.5">정산 지급계좌</th>
                        <th className="p-3.5 text-center">정산일</th>
                        <th className="p-3.5 text-right font-black text-slate-900">배송완료 상품수</th>
                        <th className="p-3.5 text-center font-black text-emerald-800">설치확인서 등록</th>
                        <th className="p-3.5 text-center font-black text-amber-800">설치확인서 미등록</th>
                        <th className="p-3.5 text-right font-black text-blue-900 pr-5">공급 물품대금 합계 (VAT포함)</th>
                        <th className="p-3.5 text-center w-28">명세서 다운로드</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {supplyPriceSummaries.map((s) => (
                        <tr key={s.supplierId} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                          <td className="p-3.5 pl-5 font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                              <span>{s.supplierName}</span>
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                            {s.businessNo}
                          </td>
                          <td className="p-3.5 text-slate-700 font-mono text-[11px]">
                            {s.bankName} {s.accountNumber} <span className="text-slate-400">({s.accountHolder})</span>
                          </td>
                          <td className="p-3.5 text-center font-bold text-slate-600">
                            매월 {s.settlementDay}일
                          </td>
                          <td className="p-3.5 text-right font-bold font-mono text-slate-900">
                            {s.productCount.toLocaleString()}개
                          </td>
                          <td className="p-3.5 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              s.certRegisteredCount > 0
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'text-slate-400'
                            }`}>
                              {s.certRegisteredCount > 0 && <CheckCircle size={11} />}
                              {s.certRegisteredCount.toLocaleString()}건
                            </span>
                          </td>
                          <td className="p-3.5 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              s.certUnregisteredCount > 0
                                ? 'bg-amber-50 text-amber-800 border border-amber-300 font-black'
                                : 'text-slate-400'
                            }`}>
                              {s.certUnregisteredCount > 0 && <AlertCircle size={11} />}
                              {s.certUnregisteredCount.toLocaleString()}건
                            </span>
                          </td>
                          <td className="p-3.5 text-right font-mono font-black text-blue-700 text-sm pr-5">
                            {s.totalSupplyAmount.toLocaleString()}원
                          </td>
                          <td className="p-3.5 text-center">
                            <button
                              onClick={() => handleExportSupplyPriceExcel(s.supplierId)}
                              disabled={s.productCount === 0}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 rounded-lg text-[11px] font-bold border border-slate-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 mx-auto"
                              title="이 공급사 물품대금 정산명세서 다운로드"
                            >
                              <Download size={11} />
                              <span>명세서</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {supplyPriceSummaries.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 whitespace-nowrap">
                          <td className="p-3.5 pl-5" colSpan={4}>합계</td>
                          <td className="p-3.5 text-right font-mono">{supplyPriceTotalStats.productCount.toLocaleString()}개</td>
                          <td className="p-3.5 text-center font-mono text-emerald-700">{supplyPriceTotalStats.certRegisteredCount.toLocaleString()}건</td>
                          <td className="p-3.5 text-center font-mono text-amber-700">{supplyPriceTotalStats.certUnregisteredCount.toLocaleString()}건</td>
                          <td className="p-3.5 text-right font-mono text-blue-900 text-sm pr-5">{supplyPriceTotalStats.totalSupplyAmount.toLocaleString()}원</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            ) : (
              /* 건별 물품대금 상세 명세 */
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-blue-50/40 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Package className="text-blue-600" size={16} />
                    <h3 className="text-sm font-black text-slate-800">
                      건별 공급 물품대금 상세 명세 ({filteredDetailItems.length}건)
                    </h3>
                    {targetDeliveryMonth && (
                      <span className="text-xs text-blue-700 font-bold px-2 py-0.5 bg-blue-100 border border-blue-200 rounded-md">
                        배송완료 대상월: {targetDeliveryMonth} (전월)
                      </span>
                    )}
                    <span className="text-xs text-slate-500 font-medium">
                      (회원번호 불필요 · 렌탈계약번호 기준 상품개수 1개 운영)
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                        <th className="p-3 pl-4 font-mono">렌탈계약번호</th>
                        <th className="p-3">계약일자</th>
                        <th className="p-3">배송완료일</th>
                        <th className="p-3 text-center">설치확인서 등록여부</th>
                        <th className="p-3 text-center">확인일자 / 마감월</th>
                        <th className="p-3">공급사</th>
                        <th className="p-3">고객명</th>
                        <th className="p-3">매칭 제품명</th>
                        <th className="p-3 text-center">상품개수</th>
                        <th className="p-3 text-right">공급단가 (VAT포함)</th>
                        <th className="p-3 text-right font-black text-blue-900">물품대금 합계</th>
                        <th className="p-3">본부</th>
                        <th className="p-3">지사</th>
                        <th className="p-3 pr-4">영업사원</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDetailItems.length === 0 ? (
                        <tr>
                          <td colSpan={14} className="py-12 text-center text-slate-400 whitespace-nowrap">
                            해당 조건에 부합하는 물품대금 정산 대상 건이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        filteredDetailItems.map((item) => (
                          <tr key={item.uniqueKey} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                            <td className="p-3 pl-4 font-mono font-bold text-indigo-700">{item.rentalNo}</td>
                            <td className="p-3 font-mono text-slate-500">{item.contractDate}</td>
                            <td className="p-3 font-mono font-bold text-emerald-700">{item.deliveryDate}</td>
                            <td className="p-3 text-center">
                              {item.installCertStatus === '등록' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                                  <CheckCircle size={10} />
                                  <span>등록</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 text-[11px] font-bold">
                                  <AlertCircle size={10} />
                                  <span>미등록</span>
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center font-mono text-[11px] text-slate-500">
                              {item.installCertDate || item.installCertMonth || '-'}
                            </td>
                            <td className="p-3 font-bold text-slate-800">{item.matchedSupplierName}</td>
                            <td className="p-3 font-bold text-slate-900">{item.memName}</td>
                            <td className="p-3 font-medium text-slate-800">{item.matchedProductName}</td>
                            <td className="p-3 text-center font-bold font-mono text-slate-900">
                              <span className="px-2 py-0.5 bg-slate-100 rounded-md">
                                {item.quantity}개
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-slate-800">
                              {item.supplyPrice.toLocaleString()}원
                            </td>
                            <td className="p-3 text-right font-mono font-black text-blue-700">
                              {item.totalSupplyPrice.toLocaleString()}원
                            </td>
                            <td className="p-3 text-slate-700 font-semibold">{item.hq}</td>
                            <td className="p-3 text-slate-600">{item.branch}</td>
                            <td className="p-3 pr-4 text-slate-600">{item.empName}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : mainTab === 'COMMISSION' ? (
            /* ======================================================== */
            /* [메인 탭 2] 공급 수수료(특수수당) 정산 영역             */
            /* ======================================================== */
            viewMode === 'SUMMARY' ? (
              /* 공급 수수료(특수수당) 수령처별 총괄표 */
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-purple-50/40 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Coins className="text-purple-600" size={16} />
                    <h3 className="text-sm font-black text-slate-800">
                      수령처별 {selectedMonth} 공급 수수료(특수수당) 정산 총괄 현황
                    </h3>
                    <span className="text-xs text-purple-700 font-bold px-2 py-0.5 bg-purple-100 border border-purple-200 rounded-md">
                      수령처 기준 정산
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      (지급처: (주)리치웰페어 · 수령처별 관련 공급사 나열 및 건별 상세 제공 · VAT 포함)
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-500">
                    총 {displayedCommissionSummaries.length}개 대상 ({commissionGroupMode === 'RECIPIENT_BASED' ? '수령처별 통합' : '관련 공급사 기준'})
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                        <th className="p-3.5 pl-5">수수료 수령처</th>
                        <th className="p-3.5">정산 지급계좌</th>
                        <th className="p-3.5">관련 공급사 (나열)</th>
                        <th className="p-3.5 text-right font-black text-emerald-800">지급 대상 상품수</th>
                        <th className="p-3.5 text-right font-bold text-slate-600">공급가액</th>
                        <th className="p-3.5 text-right font-bold text-slate-500">부가세 (10%)</th>
                        <th className="p-3.5 text-right font-black text-purple-900 pr-5">총 지급 수수료 (VAT포함)</th>
                        <th className="p-3.5 text-center w-36">상세내역 / 명세서</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedCommissionSummaries.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400 whitespace-nowrap">
                            해당 조건에 부합하는 공급 수수료 정산 대상 건이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        displayedCommissionSummaries.map((c) => {
                          const isExpanded = expandedRecipientKeys.has(c.recipientKey);
                          const supplyPrice = Math.round(c.totalCommissionAmount / 1.1);
                          const vat = c.totalCommissionAmount - supplyPrice;
                          const suppList = Array.from(new Set(c.items.map(i => i.matchedSupplierName))).filter(Boolean);

                          return (
                            <React.Fragment key={c.recipientKey}>
                              <tr className={`transition-colors whitespace-nowrap ${isExpanded ? 'bg-purple-50/40' : 'hover:bg-slate-50/80'}`}>
                                <td className="p-3.5 pl-5 font-bold text-purple-950">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => toggleExpandRecipient(c.recipientKey)}
                                      className="p-1 text-purple-600 hover:text-purple-900 hover:bg-purple-100/70 rounded-md transition-colors cursor-pointer"
                                      title={isExpanded ? "상세내역 접기" : "수령처 상세내역 펼치기"}
                                    >
                                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                    <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0" />
                                    <span className="font-extrabold text-sm">{c.commissionRecipient}</span>
                                  </div>
                                </td>
                                <td className="p-3.5 text-slate-700 font-mono text-[11px]">
                                  <span className="font-bold text-slate-800">{c.recipientBank}</span> {c.recipientAccount} 
                                  <span className="text-slate-500 font-sans ml-1">({c.recipientHolder})</span>
                                </td>
                                <td className="p-3.5">
                                  <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
                                    {suppList.map((supp, sIdx) => (
                                      <span key={sIdx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 text-[11px] font-bold">
                                        <Building size={10} className="text-purple-600" />
                                        <span>{supp}</span>
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="p-3.5 text-right font-bold font-mono text-emerald-700">
                                  {c.productCount.toLocaleString()}개
                                </td>
                                <td className="p-3.5 text-right font-mono text-slate-600">
                                  {supplyPrice.toLocaleString()}원
                                </td>
                                <td className="p-3.5 text-right font-mono text-slate-500 text-[11px]">
                                  {vat.toLocaleString()}원
                                </td>
                                <td className="p-3.5 text-right font-mono font-black text-purple-700 text-sm pr-5">
                                  {c.totalCommissionAmount.toLocaleString()}원
                                </td>
                                <td className="p-3.5 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => toggleExpandRecipient(c.recipientKey)}
                                      className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                                        isExpanded
                                          ? 'bg-purple-600 text-white border-purple-600'
                                          : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                                      }`}
                                      title="이 수령처의 공급사별/건별 상세내역 펼치기"
                                    >
                                      <FileText size={11} />
                                      <span>{isExpanded ? '닫기' : '상세내역'}</span>
                                    </button>
                                    <button
                                      onClick={() => handleExportSingleCommissionStatement(c)}
                                      disabled={c.productCount === 0}
                                      className="px-2 py-1 bg-slate-100 hover:bg-purple-50 hover:text-purple-600 text-slate-600 rounded-lg text-[11px] font-bold border border-slate-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                      title="이 수령처 정산명세서 엑셀 다운로드"
                                    >
                                      <Download size={11} />
                                      <span>명세서</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* 인라인 아코디언: 수령처 기준 공급사별/상품별 상세 내역 */}
                              {isExpanded && (
                                <tr className="bg-purple-50/20">
                                  <td colSpan={8} className="p-3 pl-8 pr-5 border-y border-purple-100">
                                    <div className="bg-white rounded-xl border border-purple-200 p-3 shadow-xs">
                                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-purple-100">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-black text-purple-900 flex items-center gap-1">
                                            <FileText size={13} className="text-purple-600" />
                                            <span>[{c.commissionRecipient}] 공급사별 상세 내역</span>
                                          </span>
                                          <span className="text-[11px] text-slate-500">
                                            (총 {c.productCount}건 · {c.totalCommissionAmount.toLocaleString()}원)
                                          </span>
                                        </div>
                                        <button
                                          onClick={() => handleOpenDetailModal(c)}
                                          className="text-[11px] font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer"
                                        >
                                          <span>전체 모달창으로 보기</span>
                                          <ExternalLink size={11} />
                                        </button>
                                      </div>

                                      <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs border-collapse">
                                          <thead>
                                            <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold text-[11px]">
                                              <th className="p-2 pl-3">순번</th>
                                              <th className="p-2">관련 공급사</th>
                                              <th className="p-2">렌탈계약번호</th>
                                              <th className="p-2">계약일자</th>
                                              <th className="p-2">배송완료일</th>
                                              <th className="p-2">고객명</th>
                                              <th className="p-2">제품명</th>
                                              <th className="p-2 text-center">수량</th>
                                              <th className="p-2 text-right">수수료 단가</th>
                                              <th className="p-2 text-right font-black text-purple-800 pr-3">지급 수수료</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100 text-[11px]">
                                            {c.items.map((item, itemIdx) => (
                                              <tr key={item.uniqueKey || itemIdx} className="hover:bg-purple-50/30">
                                                <td className="p-2 pl-3 text-slate-400 font-mono">{itemIdx + 1}</td>
                                                <td className="p-2 font-bold text-slate-800">{item.matchedSupplierName}</td>
                                                <td className="p-2 font-mono font-bold text-indigo-700">{item.rentalNo}</td>
                                                <td className="p-2 font-mono text-slate-500">{item.contractDate}</td>
                                                <td className="p-2 font-mono text-emerald-700 font-medium">{item.deliveryDate}</td>
                                                <td className="p-2 font-bold text-slate-900">{item.memName}</td>
                                                <td className="p-2 text-slate-700">{item.matchedProductName || item.rentalProdRaw || item.prodName}</td>
                                                <td className="p-2 text-center font-mono font-bold">{item.quantity}</td>
                                                <td className="p-2 text-right font-mono text-slate-700">{item.supplyCommission.toLocaleString()}원</td>
                                                <td className="p-2 text-right font-mono font-black text-purple-700 pr-3">{item.totalCommission.toLocaleString()}원</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr className="bg-purple-50/70 font-black text-slate-900 border-t border-purple-200 text-[11px]">
                                              <td colSpan={7} className="p-2 pl-3">소계</td>
                                              <td className="p-2 text-center font-mono">{c.productCount}</td>
                                              <td></td>
                                              <td className="p-2 text-right font-mono text-purple-900 pr-3">{c.totalCommissionAmount.toLocaleString()}원</td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                    {displayedCommissionSummaries.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 whitespace-nowrap">
                          <td className="p-3.5 pl-5" colSpan={3}>합계</td>
                          <td className="p-3.5 text-right font-mono text-emerald-800">{commissionTotalStats.productCount.toLocaleString()}개</td>
                          <td className="p-3.5 text-right font-mono text-slate-700">{commissionTotalStats.supplyPrice.toLocaleString()}원</td>
                          <td className="p-3.5 text-right font-mono text-slate-600 text-xs">{commissionTotalStats.vat.toLocaleString()}원</td>
                          <td className="p-3.5 text-right font-mono text-purple-900 text-sm pr-5">{commissionTotalStats.totalCommissionAmount.toLocaleString()}원</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            ) : (
              /* 건별 공급 수수료 상세 명세 */
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-purple-50/40 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Coins className="text-purple-600" size={16} />
                    <h3 className="text-sm font-black text-slate-800">
                      건별 공급 수수료(특수수당) 상세 명세 ({filteredDetailItems.length}건)
                    </h3>
                    <span className="text-xs text-slate-500 font-medium">
                      (설치확인서 등록유무에 따라 지급일자 자동 산출 · 상품개수 기준)
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                        <th className="p-3 pl-4 font-mono">렌탈계약번호</th>
                        <th className="p-3">계약일자</th>
                        <th className="p-3">배송완료일</th>
                        <th className="p-3 text-center">설치확인서 상태</th>
                        <th className="p-3 font-mono font-bold text-indigo-700">수수료 지급일자</th>
                        <th className="p-3 text-center">지급 상태</th>
                        <th className="p-3">공급사</th>
                        <th className="p-3">고객명</th>
                        <th className="p-3">매칭 제품명</th>
                        <th className="p-3 font-semibold text-slate-900">소속 본부</th>
                        <th className="p-3 text-center">상품개수</th>
                        <th className="p-3 text-right">수수료 단가 (VAT포함)</th>
                        <th className="p-3 text-right font-black text-purple-900">공급 수수료 합계</th>
                        <th className="p-3">수령처 / 계좌정보</th>
                        <th className="p-3">지사</th>
                        <th className="p-3 pr-4">영업사원</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDetailItems.length === 0 ? (
                        <tr>
                          <td colSpan={16} className="py-12 text-center text-slate-400 whitespace-nowrap">
                            해당 조건에 부합하는 공급 수수료 정산 대상 건이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        filteredDetailItems.map((item) => (
                          <tr key={item.uniqueKey} className={`hover:bg-slate-50/80 transition-colors whitespace-nowrap ${
                            item.isCertHold ? 'bg-amber-50/30' : ''
                          }`}>
                            <td className="p-3 pl-4 font-mono font-bold text-indigo-700">{item.rentalNo}</td>
                            <td className="p-3 font-mono text-slate-500">{item.contractDate}</td>
                            <td className="p-3 font-mono font-bold text-emerald-700">{item.deliveryDate}</td>
                            
                            {/* 설치확인서 등록 상태 */}
                            <td className="p-3 text-center">
                              {item.installCertStatus === '등록' ? (
                                <div className="inline-flex flex-col items-center">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                                    <CheckCircle size={10} />
                                    <span>등록완료 ({item.installCertMonth || '마감'})</span>
                                  </span>
                                  {item.installCertDate && (
                                    <span className="text-[10px] text-slate-400 font-mono mt-0.5">{item.installCertDate}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 text-[11px] font-bold">
                                  <AlertCircle size={10} />
                                  <span>미등록 (보류)</span>
                                </span>
                              )}
                            </td>

                            {/* 공급수수료 지급일자 */}
                            <td className="p-3 font-mono font-bold">
                              {item.isCommissionPayable ? (
                                <span className="text-indigo-700">{item.payoutDate}</span>
                              ) : item.isCertHold ? (
                                <span className="text-amber-700 text-[11px]">- (확인서 등록 대기)</span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">-</span>
                              )}
                            </td>

                            {/* 지급 상태 배지 */}
                            <td className="p-3 text-center">
                              {item.isCommissionPayable ? (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[11px] font-bold">
                                  지급 대상
                                </span>
                              ) : item.isCertHold ? (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[11px] font-bold" title={item.commissionHoldReason}>
                                  지급 보류
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[11px] font-medium" title={item.commissionHoldReason}>
                                  {item.commissionHoldReason || '미지급'}
                                </span>
                              )}
                            </td>

                            <td className="p-3 font-bold text-slate-800">{item.matchedSupplierName}</td>
                            <td className="p-3 font-bold text-slate-900">{item.memName}</td>
                            <td className="p-3 font-medium text-slate-800">{item.matchedProductName}</td>
                            <td className="p-3 font-bold text-slate-800">{item.hq}</td>
                            <td className="p-3 text-center font-bold font-mono text-slate-900">
                              <span className="px-2 py-0.5 bg-slate-100 rounded-md">
                                {item.quantity}개
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-purple-700">
                              {item.supplyCommission.toLocaleString()}원
                            </td>
                            <td className="p-3 text-right font-mono font-black text-purple-700">
                              {item.totalCommission.toLocaleString()}원
                            </td>
                            <td className="p-3 text-slate-600 text-[11px]">
                              <span>{item.commissionRecipient}</span>
                              {item.recipientBank && (
                                <span className="text-slate-400 block font-mono text-[10px]">
                                  {item.recipientBank} {item.recipientAccount} ({item.recipientHolder})
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-slate-600">{item.branch}</td>
                            <td className="p-3 pr-4 text-slate-600">{item.empName}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : (
            /* ======================================================== */
            /* [메인 탭 3] 리치웰페어 수기발주 손익 결산 (통합) 영역   */
            /* ======================================================== */
            viewMode === 'SUMMARY' ? (
              <div className="space-y-6">
                {/* 1. 리치웰페어 손익 정산 결산 종합 요약표 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50/50 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="text-emerald-600" size={16} />
                      <h3 className="text-sm font-black text-slate-800">
                        {selectedMonth} 리치웰페어 수기발주 손익 정산 결산 종합
                      </h3>
                      <span className="text-xs text-slate-500 font-medium">
                        (리치웰페어 총 입금액 - 공급 물품대금 - 공급 수수료 = 최종 실질 순이익)
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-500">
                      총 {richwelfareProfitSummary.count}건 정산 대상
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                          <th className="p-3.5 pl-5">구분</th>
                          <th className="p-3.5">항목명</th>
                          <th className="p-3.5 text-right">금액 (VAT포함)</th>
                          <th className="p-3.5 text-center">비율(%)</th>
                          <th className="p-3.5">산출 공식 및 세부 내역</th>
                          <th className="p-3.5 pr-5">비고</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                          <td className="p-3.5 pl-5 font-bold text-emerald-800">[A] 총 입금액</td>
                          <td className="p-3.5 font-bold text-slate-800">리치웰페어 거래처 총 입금액 (I열 결합원가)</td>
                          <td className="p-3.5 text-right font-mono font-black text-emerald-700 text-sm">
                            {richwelfareProfitSummary.totalDeposit.toLocaleString()}원
                          </td>
                          <td className="p-3.5 text-center font-bold font-mono text-slate-600">100.0%</td>
                          <td className="p-3.5 text-slate-600">구글 시트 '리치웰페어' 탭 I열 결합원가(VAT포함) 합계 (W열 세금계산서 작성일 익월 입금)</td>
                          <td className="p-3.5 pr-5 text-emerald-600 font-bold">수익 원천</td>
                        </tr>
                        <tr className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                          <td className="p-3.5 pl-5 font-bold text-blue-800">[B] 물품대금 원가</td>
                          <td className="p-3.5 font-bold text-slate-800">공급사별 지급 물품대금 원가</td>
                          <td className="p-3.5 text-right font-mono font-black text-blue-700 text-sm">
                            {richwelfareProfitSummary.totalSupplyPrice.toLocaleString()}원
                          </td>
                          <td className="p-3.5 text-center font-bold font-mono text-slate-600">
                            {richwelfareProfitSummary.totalDeposit > 0
                              ? ((richwelfareProfitSummary.totalSupplyPrice / richwelfareProfitSummary.totalDeposit) * 100).toFixed(1)
                              : '0.0'}%
                          </td>
                          <td className="p-3.5 text-slate-600">바디프랜드 등 공급사에 지급할 물품대금 합계</td>
                          <td className="p-3.5 pr-5 text-blue-600 font-bold">1차 제조/매입원가</td>
                        </tr>
                        <tr className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                          <td className="p-3.5 pl-5 font-bold text-purple-800">[C] 공급 수수료</td>
                          <td className="p-3.5 font-bold text-slate-800">본부 및 영업 특수수당 지급액</td>
                          <td className="p-3.5 text-right font-mono font-black text-purple-700 text-sm">
                            {richwelfareProfitSummary.totalCommission.toLocaleString()}원
                          </td>
                          <td className="p-3.5 text-center font-bold font-mono text-slate-600">
                            {richwelfareProfitSummary.totalDeposit > 0
                              ? ((richwelfareProfitSummary.totalCommission / richwelfareProfitSummary.totalDeposit) * 100).toFixed(1)
                              : '0.0'}%
                          </td>
                          <td className="p-3.5 text-slate-600">본부 및 수령처별 공급 수수료(특수수당) 합계</td>
                          <td className="p-3.5 pr-5 text-purple-600 font-bold">영업 비용</td>
                        </tr>
                        <tr className="bg-emerald-50/60 font-black text-slate-900 border-t-2 border-emerald-200 whitespace-nowrap">
                          <td className="p-3.5 pl-5 font-black text-emerald-900 text-sm">[D] 최종 순이익</td>
                          <td className="p-3.5 font-black text-emerald-950 text-sm">더좋은라이프 최종 실질 순이익</td>
                          <td className="p-3.5 text-right font-mono font-black text-emerald-900 text-base">
                            {richwelfareProfitSummary.totalNetProfit.toLocaleString()}원
                          </td>
                          <td className="p-3.5 text-center font-black font-mono text-emerald-900 text-sm">
                            {richwelfareProfitSummary.totalMarginRate}%
                          </td>
                          <td className="p-3.5 text-emerald-800 font-medium">
                            [A] 총 입금액 - [B] 물품대금 - [C] 공급수수료 (마진율 {richwelfareProfitSummary.totalMarginRate}%)
                          </td>
                          <td className="p-3.5 pr-5 text-emerald-800 font-black">최종 정산 순익</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. 공급사별 실적 및 손익 명세 요약표 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Layers className="text-slate-600" size={16} />
                      <h3 className="text-sm font-black text-slate-800">
                        공급사별 실적 및 손익 명세 현황
                      </h3>
                      <span className="text-xs text-slate-500 font-medium">
                        (공급사별 입금액, 물품대금, 공급수수료, 순이익 및 마진율 비교)
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-500">
                      총 {richwelfareProfitSummary.supplierProfitList.length}개 공급사
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                          <th className="p-3.5 pl-5">공급사명</th>
                          <th className="p-3.5 text-center">건수</th>
                          <th className="p-3.5 text-center">상품수량</th>
                          <th className="p-3.5 text-right font-bold text-emerald-800">[A] 리치웰 입금액</th>
                          <th className="p-3.5 text-right font-bold text-blue-800">[B] 공급 물품대금</th>
                          <th className="p-3.5 text-right font-bold text-purple-800">[C] 공급 수수료</th>
                          <th className="p-3.5 text-right font-black text-slate-900">[D] 실질 순이익</th>
                          <th className="p-3.5 text-center font-bold text-emerald-700 pr-5">마진율(%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {richwelfareProfitSummary.supplierProfitList.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-12 text-center text-slate-400 whitespace-nowrap">
                              해당 정산월에 손익 정산 대상 건이 없습니다.
                            </td>
                          </tr>
                        ) : (
                          richwelfareProfitSummary.supplierProfitList.map(sp => (
                            <tr key={sp.supplierId} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                              <td className="p-3.5 pl-5 font-bold text-slate-900">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                  <span>{sp.supplierName}</span>
                                </div>
                              </td>
                              <td className="p-3.5 text-center font-mono font-bold text-slate-700">
                                {sp.count.toLocaleString()}건
                              </td>
                              <td className="p-3.5 text-center font-mono font-bold text-slate-800">
                                {sp.productCount.toLocaleString()}개
                              </td>
                              <td className="p-3.5 text-right font-mono font-bold text-emerald-700">
                                {sp.depositAmount.toLocaleString()}원
                              </td>
                              <td className="p-3.5 text-right font-mono font-bold text-blue-700">
                                {sp.supplyPriceAmount.toLocaleString()}원
                              </td>
                              <td className="p-3.5 text-right font-mono font-bold text-purple-700">
                                {sp.commissionAmount.toLocaleString()}원
                              </td>
                              <td className={`p-3.5 text-right font-mono font-black text-sm ${
                                sp.netProfitAmount >= 0 ? 'text-emerald-700' : 'text-rose-600'
                              }`}>
                                {sp.netProfitAmount.toLocaleString()}원
                              </td>
                              <td className="p-3.5 text-center font-mono font-bold text-slate-700 pr-5">
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                                  Number(sp.marginRate) >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}>
                                  {sp.marginRate}%
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {richwelfareProfitSummary.supplierProfitList.length > 0 && (
                        <tfoot>
                          <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 whitespace-nowrap">
                            <td className="p-3.5 pl-5">합계</td>
                            <td className="p-3.5 text-center font-mono">{richwelfareProfitSummary.count.toLocaleString()}건</td>
                            <td className="p-3.5 text-center font-mono">
                              {richwelfareProfitSummary.supplierProfitList.reduce((acc, s) => acc + s.productCount, 0).toLocaleString()}개
                            </td>
                            <td className="p-3.5 text-right font-mono text-emerald-800">{richwelfareProfitSummary.totalDeposit.toLocaleString()}원</td>
                            <td className="p-3.5 text-right font-mono text-blue-800">{richwelfareProfitSummary.totalSupplyPrice.toLocaleString()}원</td>
                            <td className="p-3.5 text-right font-mono text-purple-800">{richwelfareProfitSummary.totalCommission.toLocaleString()}원</td>
                            <td className="p-3.5 text-right font-mono text-slate-900 text-sm">{richwelfareProfitSummary.totalNetProfit.toLocaleString()}원</td>
                            <td className="p-3.5 text-center font-mono text-emerald-800 pr-5">{richwelfareProfitSummary.totalMarginRate}%</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              /* 건별 수기발주 손익 정산 상세 명세 */
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50/40 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="text-emerald-600" size={16} />
                    <h3 className="text-sm font-black text-slate-800">
                      건별 수기발주(리치웰페어) 손익 정산 상세 명세 ({filteredDetailItems.length}건)
                    </h3>
                    <span className="text-xs text-slate-500 font-medium">
                      (리치웰페어 입금액 [A] - 물품대금 [B] - 공급수수료 [C] = 건별 순이익 [D])
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-500">
                    전체 {filteredDetailItems.length}건 표시
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                        <th className="p-3 pl-4 font-mono">렌탈계약번호</th>
                        <th className="p-3">계약일자</th>
                        <th className="p-3">배송완료일</th>
                        <th className="p-3 text-center">세금계산서작성일(W열)</th>
                        <th className="p-3 text-center">입금월(익월)</th>
                        <th className="p-3 text-center">설치마감월</th>
                        <th className="p-3">공급사</th>
                        <th className="p-3">고객명</th>
                        <th className="p-3">매칭 제품명</th>
                        <th className="p-3 text-center">수량</th>
                        <th className="p-3 text-right font-bold text-emerald-700">[A] 입금액(I열 결합원가)</th>
                        <th className="p-3 text-right font-bold text-blue-700">[B] 물품대금</th>
                        <th className="p-3 text-right font-bold text-purple-700">[C] 공급수수료</th>
                        <th className="p-3 text-right font-black text-slate-900">[D] 건별 순수익</th>
                        <th className="p-3 text-center font-bold text-slate-700">마진율</th>
                        <th className="p-3">소속 본부</th>
                        <th className="p-3 pr-4">영업사원</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDetailItems.length === 0 ? (
                        <tr>
                          <td colSpan={17} className="py-12 text-center text-slate-400 whitespace-nowrap">
                            해당 조건에 부합하는 손익 정산 대상 건이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        filteredDetailItems.map((item) => (
                          <tr key={item.uniqueKey} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                            <td className="p-3 pl-4 font-mono font-bold text-indigo-700">{item.rentalNo}</td>
                            <td className="p-3 font-mono text-slate-500">{item.contractDate}</td>
                            <td className="p-3 font-mono font-bold text-slate-700">{item.deliveryDate}</td>
                            <td className="p-3 text-center font-mono text-slate-600">
                              {item.richwelfareTaxDate ? (
                                item.richwelfareTaxDate
                              ) : (
                                <span className="text-slate-400 text-[10px]">시트 미등록</span>
                              )}
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-indigo-700 bg-indigo-50/50">
                              {item.richwelfareDepositMonth || selectedMonth}
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-emerald-700">
                              {item.installCertMonth || '-'}
                            </td>
                            <td className="p-3 font-bold text-slate-800">{item.matchedSupplierName}</td>
                            <td className="p-3 font-bold text-slate-900">{item.memName}</td>
                            <td className="p-3 font-medium text-slate-800">{item.matchedProductName}</td>
                            <td className="p-3 text-center font-bold font-mono text-slate-900">
                              <span className="px-2 py-0.5 bg-slate-100 rounded-md">
                                {item.quantity}개
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-700">
                              <div>{(item.richwelfareDeposit || 0).toLocaleString()}원</div>
                              {!item.isRichwelfareMatched && (
                                <span className="inline-block text-[10px] text-amber-600 bg-amber-50 px-1 py-0.5 rounded border border-amber-200 font-normal mt-0.5">
                                  시트 미등록
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-blue-700">
                              {item.totalSupplyPrice.toLocaleString()}원
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-purple-700">
                              {item.totalCommission.toLocaleString()}원
                            </td>
                            <td className={`p-3 text-right font-mono font-black ${
                              (item.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}>
                              {(item.netProfit || 0).toLocaleString()}원
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-slate-700">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                Number(item.marginRate || 0) >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {item.marginRate || '0.0'}%
                              </span>
                            </td>
                            <td className="p-3 text-slate-700 font-semibold">{item.hq}</td>
                            <td className="p-3 pr-4 text-slate-600">{item.empName}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {filteredDetailItems.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 whitespace-nowrap">
                          <td className="p-3 pl-4" colSpan={9}>합계 ({filteredDetailItems.length}건)</td>
                          <td className="p-3 text-center font-mono">
                            {filteredDetailItems.reduce((acc, i) => acc + i.quantity, 0).toLocaleString()}개
                          </td>
                          <td className="p-3 text-right font-mono text-emerald-800">
                            {filteredDetailItems.reduce((acc, i) => acc + (i.richwelfareDeposit || 0), 0).toLocaleString()}원
                          </td>
                          <td className="p-3 text-right font-mono text-blue-800">
                            {filteredDetailItems.reduce((acc, i) => acc + i.totalSupplyPrice, 0).toLocaleString()}원
                          </td>
                          <td className="p-3 text-right font-mono text-purple-800">
                            {filteredDetailItems.reduce((acc, i) => acc + i.totalCommission, 0).toLocaleString()}원
                          </td>
                          <td className="p-3 text-right font-mono text-slate-900 text-sm">
                            {filteredDetailItems.reduce((acc, i) => acc + (i.netProfit || 0), 0).toLocaleString()}원
                          </td>
                          <td className="p-3 text-center font-mono text-emerald-800">-</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )
          )}
        </div>
      </motion.div>

      {/* 공급수수료 상세 내역 및 명세서 모달창 */}
      <CommissionSettlementDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        target={detailModalTarget}
        allRecipientItems={detailRecipientAllItems}
        selectedMonth={selectedMonth}
      />
    </div>
  );
};

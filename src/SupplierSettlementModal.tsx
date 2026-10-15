import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, Calculator, Building, Calendar, Download, RefreshCw, 
  Search, CheckCircle, Package, DollarSign, Filter, FileSpreadsheet, 
  ChevronRight, ExternalLink, AlertCircle, ArrowUpRight, CheckSquare, Square,
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
  richwelfareDeposit: number;     // [A] 리치웰페어 입금 수수료(결합매출액, VAT포함)
  netProfit: number;              // [D] 실질 순수익 = [A] - [B]물품대금 - [C]공급수수료
  marginRate: number;             // 순수익률(%)

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
  productCount: number;       // 정산 상품개수
  totalSupplyAmount: number;  // 공급 물품 대금 합계 (VAT포함)
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

  // 공급 수수료 집계 기준: 관련 공급사 기준별 vs 수령처별 통합
  const [commissionGroupMode, setCommissionGroupMode] = useState<'SUPPLIER_BASED' | 'RECIPIENT_BASED'>('SUPPLIER_BASED');

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
  const richwelfareMap = useMemo(() => {
    const map = new Map<string, { combinedRev: number; combinedCost: number; settlementTerm: string; certDate: string; raw: any[] }>();
    if (!richwelfareRows || richwelfareRows.length < 2) return map;

    const headerRow = (richwelfareRows[0] || []).map((h: any) => String(h || '').trim());
    const findCol = (keywords: string[], defaultIdx: number) => {
      const idx = headerRow.findIndex((h: string) => keywords.some(k => h === k || h.includes(k)));
      return idx !== -1 ? idx : defaultIdx;
    };

    const contractNoCol = findCol(['계약번호', '렌탈번호', '주문번호'], 0);
    const combinedCostCol = findCol(['결합원가(VAT포함)', '결합원가'], 8);
    const combinedRevCol = findCol(['결합매출액(VAT포함)', '결합매출액', '매출액', '입금액'], 10);
    const delDateCol = findCol(['배송일', '배송일자'], 14);
    const certDateCol = findCol(['설치확인서등록일', '확인서등록일', '확인서일자'], 20);
    const settlementCol = findCol(['정산(+)', '정산'], 21);

    richwelfareRows.slice(1).forEach((row) => {
      const cNo = String(row[contractNoCol] || '').trim();
      if (!cNo) return;

      const rawRev = String(row[combinedRevCol] || '').replace(/[^0-9.-]/g, '');
      const rawCost = String(row[combinedCostCol] || '').replace(/[^0-9.-]/g, '');
      const rev = parseFloat(rawRev) || 0;
      const cost = parseFloat(rawCost) || 0;
      const term = String(row[settlementCol] || '').trim();
      const certDate = String(row[certDateCol] || '').trim();

      const obj = {
        combinedRev: rev,
        combinedCost: cost,
        settlementTerm: term,
        certDate,
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

      // 5. 설치확인서 등록 여부 및 마감월 정밀 판정
      const rawCertStatus = manualInfo?.installCertStatus;
      const certDate = manualInfo?.installCertDate || '';
      let certMonth = manualInfo?.installCertMonth || (certDate ? certDate.substring(0, 7) : '');

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
      const normalizedDelDate = effectiveDeliveryDate.replace(/[./]/g, '-');
      const delMonth = normalizedDelDate.substring(0, 7);

      // ⭐ 물품대금 정산 기준월:
      // 수기발주/설치확인서 관리 대상 품목(바디프랜드 등)은 배송일이 아닌 '설치확인서 정산 마감월(certMonth)' 기준!
      // 설치확인서 미등록 건은 물품대금 지급 보류
      let isSupplyPricePayable = false;
      if (isManualTarget) {
        if (isCertRegistered && certMonth) {
          isSupplyPricePayable = certMonth === selectedMonth;
        } else {
          isSupplyPricePayable = false; // 설치확인서 미등록 시 물품대금 지급 보류
        }
      } else {
        // 일반 상품: 배송완료월 기준
        isSupplyPricePayable = delMonth === selectedMonth;
      }

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
      let richDeposit = 0;
      const cleanNo = cleanRentalNo || item.rentalNo || '';
      const richInfo = richwelfareMap.get(cleanNo) || (cleanNo.replace(/[^0-9]/g, '') ? richwelfareMap.get(cleanNo.replace(/[^0-9]/g, '')) : null);
      if (richInfo && richInfo.combinedRev > 0) {
        richDeposit = richInfo.combinedRev;
      } else {
        // 리치웰페어 시트에 미등록된 경우 ERP 원장 입금액 또는 단가 대조
        const rawDep = (item as any).extDeposit || (item as any).rentalProdPrice;
        if (rawDep) {
          richDeposit = typeof rawDep === 'number' ? rawDep : parseFloat(String(rawDep).replace(/[^0-9.-]/g, '')) || 0;
        }
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
        netProfit: itemNetProfit,
        marginRate: itemMarginRate,
        hq: item.hq || '-',
        branch: item.branch || '-',
        empName: item.empName || '-'
      });
    });

    return result;
  }, [data, suppliers, selectedMonth, effectiveManualStores, manualOrderTargetProducts, payoutRuleMode, richwelfareMap]);

  // ==========================================
  // [1] 물품 대금 집계 (공급사별) - 배송완료월 기준
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
        totalSupplyAmount: 0,
        items: []
      });
    });

    allSettlementItems.forEach((item) => {
      // 물품대금은 배송완료월이 selectedMonth인 건만 집계
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
          totalSupplyAmount: 0,
          items: []
        };
        summaryMap.set(item.matchedSupplierId, supp);
      }

      supp.productCount += item.quantity;
      supp.totalSupplyAmount += item.totalSupplyPrice;
      supp.items.push(item);
    });

    return Array.from(summaryMap.values());
  }, [suppliers, allSettlementItems]);

  // 물품 대금 전체 KPI
  const supplyPriceTotalStats = useMemo(() => {
    let productCount = 0;
    let totalSupplyAmount = 0;
    supplyPriceSummaries.forEach(s => {
      productCount += s.productCount;
      totalSupplyAmount += s.totalSupplyAmount;
    });
    return { productCount, totalSupplyAmount };
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
    // 해당 정산월(selectedMonth)의 정산 대상 아이템 집계
    const targetItems = allSettlementItems.filter(item => {
      return item.isSupplyPricePayable || item.isCommissionPayable || (item.installCertMonth === selectedMonth);
    });

    let totalDeposit = 0;      // [A] 리치웰페어 총 입금액 (결합매출액)
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
    return allSettlementItems.filter((item) => {
      const matchSupplier = selectedSupplierId === 'ALL' || item.matchedSupplierId === selectedSupplierId;
      if (!matchSupplier) return false;

      // 물품대금 탭인 경우
      if (mainTab === 'SUPPLY_PRICE') {
        if (!item.isSupplyPricePayable) return false;
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

      // 리치웰페어 손익 결산 보고서 탭인 경우
      if (mainTab === 'PROFIT_REPORT') {
        const isTarget = item.isSupplyPricePayable || item.isCommissionPayable || (item.installCertMonth === selectedMonth);
        if (!isTarget) return false;
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
      [`리치웰페어 - 공급 물품대금 정산 총괄표 (${selectedMonth} 기준)`],
      [`정산 기준: 배송완료 및 ${selectedMonth} 말일까지 설치확인된 건 (금액: VAT 부가세 포함, 상품개수 기준)`],
      [`출력일시: ${new Date().toLocaleString()}`],
      [],
      ['공급사명', '사업자등록번호', '정산은행', '계좌번호', '예금주', '정산일', '정산 상품개수', '총 공급 물품대금 (VAT포함)']
    ];

    const targetSummaries = targetSupplierId && targetSupplierId !== 'ALL'
      ? supplyPriceSummaries.filter(s => s.supplierId === targetSupplierId)
      : supplyPriceSummaries;

    let subTotalCount = 0;
    let subTotalAmount = 0;

    targetSummaries.forEach((s) => {
      subTotalCount += s.productCount;
      subTotalAmount += s.totalSupplyAmount;
      summaryRows.push([
        s.supplierName,
        s.businessNo,
        s.bankName,
        s.accountNumber,
        s.accountHolder,
        `매월 ${s.settlementDay}일`,
        s.productCount,
        s.totalSupplyAmount
      ]);
    });

    summaryRows.push([
      '합계',
      '',
      '',
      '',
      '',
      '',
      subTotalCount,
      subTotalAmount
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, '물품대금총괄표');

    // 2. 건별 물품대금 상세 명세 시트
    const itemsToExport = targetSupplierId && targetSupplierId !== 'ALL'
      ? allSettlementItems.filter(i => i.matchedSupplierId === targetSupplierId && i.isSupplyPricePayable)
      : allSettlementItems.filter(i => i.isSupplyPricePayable);

    const detailRows = [
      [`공급 물품대금 상세 명세서 (${selectedMonth})`],
      ['렌탈계약번호', '계약일자', '배송완료일', '설치확인서/마감월', '공급사명', '고객명', '매칭 제품명', '상품개수', '공급단가 (VAT포함)', '공급 물품대금 (VAT포함)', '본부', '지사', '영업사원']
    ];

    itemsToExport.forEach((item) => {
      const certInfo = item.isManualOrderTarget
        ? (item.installCertStatus === '등록' ? `등록완료 (${item.installCertMonth || '-'})` : '미등록 (보류)')
        : '-';

      detailRows.push([
        item.rentalNo,
        item.contractDate,
        item.deliveryDate,
        certInfo,
        item.matchedSupplierName,
        item.memName,
        item.matchedProductName,
        item.quantity,
        item.supplyPrice,
        item.totalSupplyPrice,
        item.hq,
        item.branch,
        item.empName
      ]);
    });

    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetail, '물품대금상세명세');

    const fileName = targetSupplierId && targetSupplierId !== 'ALL'
      ? `${supplyPriceSummaries.find(s => s.supplierId === targetSupplierId)?.supplierName || '공급사'}_물품대금정산서_${selectedMonth}.xlsx`
      : `리치웰페어_공급물품대금정산서_${selectedMonth}.xlsx`;

    XLSX.writeFile(wb, fileName);
  };

  // ==========================================
  // [엑셀 다운로드 2] 공급 수수료(특수수당) 전용 정산서
  // 본부별 수수료 특수수당(공급수수료) 운영 양식 100% 동일 적용
  // ==========================================
  const handleExportCommissionExcel = (targetSupplierId?: string) => {
    if (!XLSX) {
      alert('엑셀 라이브러리를 로드할 수 없습니다.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // 공통 엑셀 스타일 정의 (App.tsx 특수수당상세 스타일 동일)
    const headerStyle = {
      fill: { fgColor: { rgb: "2F5597" } },
      font: { color: { rgb: "FFFFFF" }, bold: true, sz: 10 },
      alignment: { vertical: "center", horizontal: "center" },
      border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
    };
    const cellStyle = { font: { sz: 9 }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
    const graySubtotalStyle = {
      fill: { fgColor: { rgb: "F2F2F2" } },
      font: { bold: true, sz: 9, color: { rgb: "1E293B" } },
      alignment: { vertical: "center", horizontal: "center" },
      border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
    };

    const applyDetailSheetStyles = (ws: any) => {
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        let isSubtotalRow = false;
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const checkAddr = XLSX.utils.encode_cell({ r: R, c: C });
          const cellVal = ws[checkAddr] ? String(ws[checkAddr].v || '') : '';
          if (cellVal.includes('소계') || cellVal === '총합계' || cellVal.includes('합계')) {
            isSubtotalRow = true;
            break;
          }
        }

        for (let C = range.s.c; C <= range.e.c; ++C) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[addr]) continue;

          if (R === 0) {
            ws[addr].s = { ...headerStyle };
            continue;
          }

          if (isSubtotalRow) {
            ws[addr].s = { ...graySubtotalStyle };
            if (ws[addr].t === 'n') {
              ws[addr].s.alignment = { horizontal: 'right', vertical: 'center' };
            }
            continue;
          }

          ws[addr].s = { ...cellStyle };
          if (ws[addr].t === 'n') {
            ws[addr].s.alignment = { horizontal: 'right', vertical: 'center' };
          }
        }
      }
    };

    // 1. 공급 수수료 총괄 요약 시트
    const summaryRows: any[][] = [
      [`리치웰페어 - 공급 수수료(특수수당) 정산 총괄표 (${selectedMonth} 기준)`],
      [`지급 주체: (주)리치웰페어  |  정산 기준: 배송완료 및 설치확인 건 (금액: VAT 포함)`],
      [`※ 관련 공급사는 정산 산정 기준 표기이며, (주)리치웰페어에서 수령처 계좌로 직접 지급합니다.`],
      [`출력일시: ${new Date().toLocaleString()}`],
      [],
      ['관련 공급사 (기준)', '수수료 수령처', '정산은행', '계좌번호', '예금주', '지급 대상 건수', '공급가액', '부가세 (10%)', '총 지급 수수료 (VAT포함)']
    ];

    const targetSummaries = targetSupplierId && targetSupplierId !== 'ALL'
      ? commissionSummaries.filter(c => c.supplierId === targetSupplierId)
      : (commissionGroupMode === 'RECIPIENT_BASED' ? commissionRecipientSummaries : commissionSummaries);

    let subTotalCount = 0;
    let subTotalAmount = 0;
    let subTotalSupply = 0;
    let subTotalVat = 0;

    targetSummaries.forEach((c) => {
      const supply = Math.round(c.totalCommissionAmount / 1.1);
      const vat = c.totalCommissionAmount - supply;

      subTotalCount += c.productCount;
      subTotalAmount += c.totalCommissionAmount;
      subTotalSupply += supply;
      subTotalVat += vat;

      summaryRows.push([
        c.supplierName,
        c.commissionRecipient,
        c.recipientBank,
        c.recipientAccount,
        c.recipientHolder,
        c.productCount,
        { v: supply, t: 'n', z: '#,##0' },
        { v: vat, t: 'n', z: '#,##0' },
        { v: c.totalCommissionAmount, t: 'n', z: '#,##0' }
      ]);
    });

    summaryRows.push([
      '합계',
      '',
      '',
      '',
      '',
      subTotalCount,
      { v: subTotalSupply, t: 'n', z: '#,##0' },
      { v: subTotalVat, t: 'n', z: '#,##0' },
      { v: subTotalAmount, t: 'n', z: '#,##0' }
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    const summaryColWidths = summaryRows.reduce((acc, row) => {
      row.forEach((cell, i) => {
        let str = '';
        if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
        else if (cell !== null && cell !== undefined) str = cell.toString();
        const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
        if (!acc[i] || len > acc[i]) acc[i] = len;
      });
      return acc;
    }, [] as number[]);
    wsSummary['!cols'] = summaryColWidths.map(w => ({ wch: Math.min(Math.max(w + 4, 12), 40) }));
    XLSX.utils.book_append_sheet(wb, wsSummary, '공급수수료총괄표');

    // 2. 특수수당 상세 명세 시트 (본부별 수수료 특수수당 운영 양식 100% 동일)
    // 헤더: ['본부', '지사', '사원명', '고객명', '상품명', '제품명', '계약일자', '배송일자', '수수료']
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

    const specialRows: any[][] = [['본부', '지사', '사원명', '고객명', '상품명', '제품명', '계약일자', '배송일자', '수수료']];
    let currentProdKey = '';
    let prodSubCount = 0;
    let prodSubAmount = 0;
    let totalSpecialCount = 0;
    let totalSpecialAmount = 0;

    sortedPayableItems.forEach((sp, idx) => {
      const prodKey = sp.matchedProductName || sp.rentalProdRaw || sp.prodName || '기타제품';

      if (idx > 0 && currentProdKey !== prodKey) {
        specialRows.push([
          `[${currentProdKey}] 소계`,
          '', '', '', '', '', '',
          `${prodSubCount}건`,
          { v: prodSubAmount, t: 'n', z: '#,##0' }
        ]);
        prodSubCount = 0;
        prodSubAmount = 0;
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
        sp.prodName || '-',
        sp.rentalProdRaw || sp.matchedProductName || sp.prodName || '-',
        sp.contractDate || '-',
        sp.deliveryDate || '-',
        { v: sp.totalCommission, t: 'n', z: '#,##0' }
      ]);
    });

    if (prodSubCount > 0) {
      specialRows.push([
        `[${currentProdKey}] 소계`,
        '', '', '', '', '', '',
        `${prodSubCount}건`,
        { v: prodSubAmount, t: 'n', z: '#,##0' }
      ]);
    }

    if (totalSpecialCount > 0) {
      specialRows.push([
        '총합계',
        '', '', '', '', '', '',
        `${totalSpecialCount}건`,
        { v: totalSpecialAmount, t: 'n', z: '#,##0' }
      ]);
    }

    const wsSpecial = XLSX.utils.aoa_to_sheet(specialRows);
    const specialColWidths = specialRows.reduce((acc, row) => {
      row.forEach((cell, i) => {
        let str = '';
        if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
        else if (cell !== null && cell !== undefined) str = cell.toString();
        const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
        if (!acc[i] || len > acc[i]) acc[i] = len;
      });
      return acc;
    }, [] as number[]);
    wsSpecial['!cols'] = specialColWidths.map(w => ({ wch: Math.min(Math.max(w + 4, 10), 40) }));
    applyDetailSheetStyles(wsSpecial);
    XLSX.utils.book_append_sheet(wb, wsSpecial, "특수수당상세");

    const fileName = targetSupplierId && targetSupplierId !== 'ALL'
      ? `${suppliers.find(s => s.id === targetSupplierId)?.name || '공급사'}_공급수수료정산서_${selectedMonth}.xlsx`
      : `리치웰페어_공급수수료정산서_${selectedMonth}.xlsx`;

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
        { v: totNet, t: 'n', z: '#,##0' },
        `영업이익률: ${totMarginRate}%`
      ],
      [],
      ['2. 공급사별 실적 및 손익 명세'],
      ['공급사명', '정산건수', '상품개수', '리치웰페어 입금액 [A]', '공급 물품대금 [B]', '공급 수수료 [C]', '실질 순수익 [D]', '수익률(%)']
    ];

    const targetSupplierList = targetSupplierId && targetSupplierId !== 'ALL'
      ? richwelfareProfitSummary.supplierProfitList.filter(s => s.supplierId === targetSupplierId)
      : richwelfareProfitSummary.supplierProfitList;

    targetSupplierList.forEach(sp => {
      summaryRows.push([
        sp.supplierName,
        sp.count,
        sp.productCount,
        { v: sp.depositAmount, t: 'n', z: '#,##0' },
        { v: sp.supplyPriceAmount, t: 'n', z: '#,##0' },
        { v: sp.commissionAmount, t: 'n', z: '#,##0' },
        { v: sp.netProfitAmount, t: 'n', z: '#,##0' },
        `${sp.marginRate}%`
      ]);
    });

    summaryRows.push([
      '공급사 소계',
      targetItems.length,
      targetItems.reduce((acc, i) => acc + i.quantity, 0),
      { v: totDeposit, t: 'n', z: '#,##0' },
      { v: totSuppPrice, t: 'n', z: '#,##0' },
      { v: totComm, t: 'n', z: '#,##0' },
      { v: totNet, t: 'n', z: '#,##0' },
      `${totMarginRate}%`
    ]);

    summaryRows.push([]);
    summaryRows.push(['3. 최종 손익 정산 결산 종합']);
    summaryRows.push(['구분', '항목명', '금액', '비율(%)', '산출 공식 / 세부 내역', '비고']);
    summaryRows.push([
      '[A] 총 입금액',
      '리치웰페어 결합매출 총 입금액',
      { v: totDeposit, t: 'n', z: '#,##0' },
      '100.0%',
      '리치웰페어 구글 시트 결합매출액(VAT포함) 기준',
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
      { v: totNet, t: 'n', z: '#,##0' },
      `${totMarginRate}%`,
      '[A] 총 입금액 - [B] 물품대금 - [C] 공급수수료',
      '최종 실현 순익'
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [
      { wch: 18 }, { wch: 32 }, { wch: 16 }, { wch: 12 }, { wch: 45 }, { wch: 18 }, { wch: 18 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, '정산보고서');

    // --- 시트 2: 대사보고 (13열 건별 상세) ---
    const headers = ['계약일자', '배송일자', '정산일자', '계약ID', '고객명', '본부명', '상품명', '제품명', '구좌수', '거래처입금액', '공급물품대금', '공급수수료', '최종순수익', '비고'];
    const detailRows: any[][] = [headers];

    targetItems.forEach(item => {
      const net = (item.richwelfareDeposit || 0) - (item.totalSupplyPrice || 0) - (item.totalCommission || 0);
      detailRows.push([
        item.contractDate || '-',
        item.deliveryDate || '-',
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
        { v: net, t: 'n', z: '#,##0' },
        item.installCertStatus === '등록' ? `정상 (${item.installCertMonth || '마감'})` : '확인서 미등록'
      ]);
    });

    detailRows.push([
      '총계', '', '', `${targetItems.length}건`, '', '', '', '',
      targetItems.reduce((acc, i) => acc + i.quantity, 0),
      { v: totDeposit, t: 'n', z: '#,##0' },
      { v: totSuppPrice, t: 'n', z: '#,##0' },
      { v: totComm, t: 'n', z: '#,##0' },
      { v: totNet, t: 'n', z: '#,##0' },
      `영업이익률: ${totMarginRate}%`
    ]);

    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    wsDetail['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 12 },
      { wch: 22 }, { wch: 35 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }
    ];
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
          { v: net, t: 'n', z: '#,##0' },
          item.hq || '-',
          item.empName || '-'
        ]);
      });

      suppRows.push([
        '합계', '', '', '', '', '', '',
        items.reduce((acc, i) => acc + i.quantity, 0),
        { v: subDep, t: 'n', z: '#,##0' },
        { v: subSupp, t: 'n', z: '#,##0' },
        { v: subComm, t: 'n', z: '#,##0' },
        { v: subNet, t: 'n', z: '#,##0' },
        '', ''
      ]);

      const wsSupp = XLSX.utils.aoa_to_sheet(suppRows);
      wsSupp['!cols'] = [
        { wch: 6 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 10 },
        { wch: 32 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }
      ];
      const safeTitle = `${suppName.slice(0, 20)}_상세`;
      XLSX.utils.book_append_sheet(wb, wsSupp, safeTitle);
    });

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
            {/* 카드 1: 상품개수 */}
            <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase">
                  {selectedSupplierSummary ? `${selectedSupplierSummary.supplierName} 상품개수` : '정산 대상 총 상품개수'}
                </p>
                <h3 className="text-xl font-black text-slate-900 mt-0.5 font-mono">
                  {(selectedSupplierSummary ? selectedSupplierSummary.productCount : supplyPriceTotalStats.productCount).toLocaleString()} <span className="text-xs font-bold text-slate-500">개</span>
                </h3>
                {selectedSupplierSummary && (
                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium">전체 {supplyPriceTotalStats.productCount.toLocaleString()}개 중</p>
                )}
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
                <p className="text-[10px] text-blue-400 mt-0.5 font-medium">전체 공급사 총 합계 (VAT포함)</p>
              </div>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <DollarSign size={18} />
              </div>
            </div>

            {/* 카드 3: 공급사 선택 시 해당 공급사별 물품대금 합계 */}
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
                    <p className="text-[10px] text-blue-300 mt-0.5 font-medium">
                      해당 공급사 물품대금 (VAT포함)
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-bold text-slate-400 mt-1">
                      공급사를 선택하세요
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      상단 공급사 필터 선택 시 해당 대금 표시
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
            {/* 카드 1: [A] 리치웰페어 총 입금액 (거래처 매출) */}
            <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-2xs flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <p className="text-[11px] font-bold text-blue-800 uppercase">[A] 리치웰페어 총 입금액</p>
                </div>
                <h3 className="text-xl font-black text-blue-700 mt-0.5 font-mono">
                  {richwelfareProfitSummary.totalDeposit.toLocaleString()} <span className="text-xs font-bold text-blue-500">원</span>
                </h3>
                <p className="text-[10px] text-blue-500 mt-0.5 font-medium">리치웰페어 결합매출 기준 (VAT포함)</p>
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
                    <span className="text-xs text-slate-500 font-medium">
                      (배송완료월 기준 · 렌탈계약번호 상품개수 1개 집계 · VAT 포함)
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
                        <th className="p-3.5 text-right font-black text-slate-900">상품개수</th>
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
                        <th className="p-3 text-center">설치확인서 / 마감월</th>
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
                          <td colSpan={13} className="py-12 text-center text-slate-400 whitespace-nowrap">
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
                              {item.isManualOrderTarget ? (
                                item.installCertStatus === '등록' ? (
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
                                )
                              ) : (
                                <span className="text-[11px] text-slate-400 font-medium">일반배송</span>
                              )}
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
                    <span className="text-xs text-slate-500 font-medium">
                      (지급처: (주)리치웰페어 · 관련 공급사는 기준 표기 · 상품개수 기준 · VAT 포함)
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
                        <th className="p-3.5 pl-5">관련 공급사 (기준)</th>
                        <th className="p-3.5">수수료 수령처</th>
                        <th className="p-3.5">수령 은행</th>
                        <th className="p-3.5">수령 계좌번호</th>
                        <th className="p-3.5">예금주</th>
                        <th className="p-3.5 text-right font-black text-emerald-800">지급 대상 개수</th>
                        <th className="p-3.5 text-right font-black text-purple-900 pr-5">총 지급 수수료 (VAT포함)</th>
                        <th className="p-3.5 text-center w-24 text-purple-900">상세 내역</th>
                        <th className="p-3.5 text-center w-28">명세서 다운로드</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedCommissionSummaries.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-slate-400 whitespace-nowrap">
                            해당 조건에 부합하는 공급 수수료 정산 대상 건이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        displayedCommissionSummaries.map((c) => (
                          <tr key={c.recipientKey} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                            <td className="p-3.5 pl-5 font-bold text-slate-900">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                                <span>{c.supplierName}</span>
                              </div>
                            </td>
                            <td className="p-3.5 font-bold text-purple-900">
                              {c.commissionRecipient}
                            </td>
                            <td className="p-3.5 text-slate-700 font-mono text-[11px]">
                              {c.recipientBank}
                            </td>
                            <td className="p-3.5 text-slate-700 font-mono text-[11px]">
                              {c.recipientAccount}
                            </td>
                            <td className="p-3.5 text-slate-700 font-medium">
                              {c.recipientHolder}
                            </td>
                            <td className="p-3.5 text-right font-bold font-mono text-emerald-700">
                              {c.productCount.toLocaleString()}개
                            </td>
                            <td className="p-3.5 text-right font-mono font-black text-purple-700 text-sm pr-5">
                              {c.totalCommissionAmount.toLocaleString()}원
                            </td>
                            {/* 상세 내역 모달창 호출 버튼 */}
                            <td className="p-3.5 text-center">
                              <button
                                onClick={() => handleOpenDetailModal(c)}
                                className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-[11px] font-bold border border-purple-200 transition-colors cursor-pointer flex items-center gap-1 mx-auto shadow-2xs"
                                title="상세 내역 및 세금계산서 명세서 모달창 보기"
                              >
                                <FileText size={11} className="text-purple-600" />
                                <span>상세내역</span>
                              </button>
                            </td>
                            {/* 명세서 다운로드 버튼 */}
                            <td className="p-3.5 text-center">
                              <button
                                onClick={() => handleExportSingleCommissionStatement(c)}
                                disabled={c.productCount === 0}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-purple-50 hover:text-purple-600 text-slate-600 rounded-lg text-[11px] font-bold border border-slate-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 mx-auto"
                                title="이 수령처 정산명세서 엑셀 다운로드 (계좌정보, 세금계산서, 상품별, 상세)"
                              >
                                <Download size={11} />
                                <span>명세서</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {displayedCommissionSummaries.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 whitespace-nowrap">
                          <td className="p-3.5 pl-5" colSpan={5}>합계</td>
                          <td className="p-3.5 text-right font-mono text-emerald-800">{commissionTotalStats.productCount.toLocaleString()}개</td>
                          <td className="p-3.5 text-right font-mono text-purple-900 text-sm pr-5">{commissionTotalStats.totalCommissionAmount.toLocaleString()}원</td>
                          <td></td>
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
                          <td className="p-3.5 font-bold text-slate-800">리치웰페어 거래처 총 입금액 (결합매출액)</td>
                          <td className="p-3.5 text-right font-mono font-black text-emerald-700 text-sm">
                            {richwelfareProfitSummary.totalDeposit.toLocaleString()}원
                          </td>
                          <td className="p-3.5 text-center font-bold font-mono text-slate-600">100.0%</td>
                          <td className="p-3.5 text-slate-600">구글 시트 '리치웰페어' 탭 결합매출액 합계</td>
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
                        <th className="p-3 text-center">정산마감월</th>
                        <th className="p-3">공급사</th>
                        <th className="p-3">고객명</th>
                        <th className="p-3">매칭 제품명</th>
                        <th className="p-3 text-center">수량</th>
                        <th className="p-3 text-right font-bold text-emerald-700">[A] 입금액</th>
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
                          <td colSpan={15} className="py-12 text-center text-slate-400 whitespace-nowrap">
                            해당 조건에 부합하는 손익 정산 대상 건이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        filteredDetailItems.map((item) => (
                          <tr key={item.uniqueKey} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                            <td className="p-3 pl-4 font-mono font-bold text-indigo-700">{item.rentalNo}</td>
                            <td className="p-3 font-mono text-slate-500">{item.contractDate}</td>
                            <td className="p-3 font-mono font-bold text-slate-700">{item.deliveryDate}</td>
                            <td className="p-3 text-center font-mono font-bold text-emerald-700">
                              {item.installCertMonth || selectedMonth}
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
                              {(item.richwelfareDeposit || 0).toLocaleString()}원
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
                          <td className="p-3 pl-4" colSpan={7}>합계 ({filteredDetailItems.length}건)</td>
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

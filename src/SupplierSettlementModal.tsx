import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, Calculator, Building, Calendar, Download, RefreshCw, 
  Search, CheckCircle, Package, DollarSign, Filter, FileSpreadsheet, 
  ChevronRight, ExternalLink, AlertCircle, ArrowUpRight, CheckSquare, Square,
  Tag, Info, Layers, Receipt, Coins
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SupplierItem, SupplierProductSetting, loadSuppliersFromStorage } from './SupplierManagementModal';

// @ts-ignore
const XLSX = (window as any).XLSX;

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
  supplyCommission: number;   // 공급 수수료 단가 (VAT포함, 본부별 차등 반영)
  totalCommission: number;    // 공급 수수료 합계 = 수수료 단가 * 수량 (VAT포함)
  isHqDifferentiated: boolean;// 본부별 차등 수수료 적용 여부
  appliedHqName?: string;     // 차등 적용된 본부명
  commissionRecipient: string;// 수수료 수령자/처
  recipientBank?: string;
  recipientAccount?: string;
  recipientHolder?: string;
  deliveryDate: string;       // 배송일/설치확인일
  deliveryStatus: string;     // 배송완료
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
  productCount: number;       // 수수료 대상 상품개수
  totalCommissionAmount: number; // 공급 수수료 합계 (VAT포함)
  hqDiffCount: number;        // 본부 차등 적용 건수
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

  // 메인 탭: 물품 대금 정산 vs 공급 수수료 정산 (완전 분리)
  const [mainTab, setMainTab] = useState<'SUPPLY_PRICE' | 'COMMISSION'>('SUPPLY_PRICE');

  // 서브 뷰 탭: 총괄 요약표 vs 건별 상세 내역
  const [viewMode, setViewMode] = useState<'SUMMARY' | 'DETAIL'>('SUMMARY');

  const [suppliers, setSuppliers] = useState<SupplierItem[]>(() => loadSuppliersFromStorage());
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('ALL'); // 'ALL' 또는 개별 공급사 ID
  const [searchTerm, setSearchTerm] = useState('');

  // 모달 오픈 시 최신 공급사 정보 재로드
  useEffect(() => {
    if (isOpen) {
      setSuppliers(loadSuppliersFromStorage());
    }
  }, [isOpen]);

  // 로컬스토리지 수기발주 데이터 보정 맵 (수기발주에서 직접 수정한 배송일자/상태가 있을 경우 반영)
  const manualOrderOverrideMap = useMemo(() => {
    const map = new Map<string, { deliveryDate: string; deliveryState: string }>();
    try {
      const saved = localStorage.getItem('erp_manual_orders_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed.forEach((o: any) => {
            const key = o.contractNo || o.rentalNo || o.memNo;
            if (key) {
              map.set(key, {
                deliveryDate: o.deliveryDate || '',
                deliveryState: o.deliveryState || ''
              });
            }
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
    return map;
  }, [isOpen]);

  // 정산 대상 데이터 추출 및 공급사 매핑 엔진
  // 요구사항:
  // 1) 배송완료 상태
  // 2) 해당 월 말일까지 배송일/설치확인일 등록 완료된 건
  // 3) 회원번호 불필요 -> 고유 렌탈계약번호(rentalNo) 기준으로 상품개수 1개씩 운영
  // 4) 본부별 차등 공급 수수료 우선 매칭
  const settlementItems = useMemo<SupplierSettlementItem[]>(() => {
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

      // 2. 수기발주 오버라이드 확인
      const override = manualOrderOverrideMap.get(item.rentalNo) || 
                       manualOrderOverrideMap.get(item.memNo) ||
                       manualOrderOverrideMap.get(item.uniqueKey);

      const effectiveDeliveryStatus = override?.deliveryState || item.deliveryStatus || '';
      const effectiveDeliveryDate = override?.deliveryDate || item.deliveryDate || '';

      // 조건: 배송완료 상태여야 함
      if (!effectiveDeliveryStatus.includes('완료') && effectiveDeliveryStatus !== '배송완료') {
        return;
      }

      // 조건: 해당 월(YYYY-MM) 내 배송/설치확인 완료 건 (말일까지 설치확인서 등록 기준)
      if (!effectiveDeliveryDate) return;
      const normalizedDelDate = effectiveDeliveryDate.replace(/[./]/g, '-');
      const delMonth = normalizedDelDate.substring(0, 7);
      if (delMonth !== selectedMonth) return;

      // 3. 렌탈계약번호 기준 상품개수 운영 (동일 렌탈계약번호 중복 제거)
      const cleanRentalNo = (item.rentalNo || '').trim();
      if (cleanRentalNo && cleanRentalNo !== '-' && cleanRentalNo !== 'null' && cleanRentalNo !== 'undefined') {
        if (seenRentalNos.has(cleanRentalNo)) {
          return; // 이미 집계된 렌탈계약번호 건은 중복 상품 카운트 방지
        }
        seenRentalNos.add(cleanRentalNo);
      }

      // 4. 공급사 및 취급 제품 매칭 (렌탈상품명 또는 제품명 대조)
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

      // 공급사에 매칭된 제품만 정산 대상에 포함
      if (matchedSupplier && matchedProductSetting) {
        // 본부별 차등 공급수수료 계산
        let finalCommission = matchedProductSetting.supplyCommission || 0;
        let isHqDiff = false;
        let appliedHq = '';

        if (matchedProductSetting.hqCommissions && matchedProductSetting.hqCommissions.length > 0) {
          const itemHqName = (item.hq || '').trim().toLowerCase();
          if (itemHqName) {
            const hqMatch = matchedProductSetting.hqCommissions.find(hc => {
              const ruleHq = (hc.hqName || '').trim().toLowerCase();
              return ruleHq && (itemHqName.includes(ruleHq) || ruleHq.includes(itemHqName));
            });
            if (hqMatch) {
              finalCommission = hqMatch.commission;
              isHqDiff = true;
              appliedHq = hqMatch.hqName;
            }
          }
        }

        const qty = 1; // 렌탈계약번호 1건 = 상품개수 1개
        const sPrice = matchedProductSetting.supplyPrice || 0;

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
          totalSupplyPrice: sPrice * qty,
          supplyCommission: finalCommission,
          totalCommission: finalCommission * qty,
          isHqDifferentiated: isHqDiff,
          appliedHqName: appliedHq,
          commissionRecipient: matchedProductSetting.commissionRecipient || matchedSupplier.name,
          recipientBank: matchedProductSetting.recipientBank || matchedSupplier.bankName,
          recipientAccount: matchedProductSetting.recipientAccount || matchedSupplier.accountNumber,
          recipientHolder: matchedProductSetting.recipientHolder || matchedSupplier.accountHolder,
          deliveryDate: effectiveDeliveryDate,
          deliveryStatus: '배송완료',
          hq: item.hq || '-',
          branch: item.branch || '-',
          empName: item.empName || '-'
        });
      }
    });

    return result;
  }, [data, suppliers, selectedMonth, manualOrderOverrideMap]);

  // ==========================================
  // [1] 물품 대금 집계 (공급사별)
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

    settlementItems.forEach((item) => {
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
  }, [suppliers, settlementItems]);

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

  // ==========================================
  // [2] 공급 수수료(특수수당) 집계 (공급사/수령처별)
  // ==========================================
  const commissionSummaries = useMemo<CommissionSummary[]>(() => {
    const summaryMap = new Map<string, CommissionSummary>();

    settlementItems.forEach((item) => {
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
          hqDiffCount: 0,
          items: []
        };
        summaryMap.set(key, comm);
      }

      comm.productCount += item.quantity;
      comm.totalCommissionAmount += item.totalCommission;
      if (item.isHqDifferentiated) {
        comm.hqDiffCount += item.quantity;
      }
      comm.items.push(item);
    });

    return Array.from(summaryMap.values());
  }, [settlementItems]);

  // 공급 수수료 전체 KPI
  const commissionTotalStats = useMemo(() => {
    let productCount = 0;
    let totalCommissionAmount = 0;
    let hqDiffCount = 0;
    commissionSummaries.forEach(c => {
      productCount += c.productCount;
      totalCommissionAmount += c.totalCommissionAmount;
      hqDiffCount += c.hqDiffCount;
    });
    return { productCount, totalCommissionAmount, hqDiffCount };
  }, [commissionSummaries]);

  // 필터링된 상세 건별 목록 (검색 및 공급사 필터)
  const filteredDetailItems = useMemo(() => {
    return settlementItems.filter((item) => {
      const matchSupplier = selectedSupplierId === 'ALL' || item.matchedSupplierId === selectedSupplierId;
      if (!matchSupplier) return false;

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
  }, [settlementItems, selectedSupplierId, searchTerm]);

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
    const summaryRows = [
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
      ? settlementItems.filter(i => i.matchedSupplierId === targetSupplierId)
      : settlementItems;

    const detailRows = [
      [`공급 물품대금 상세 명세서 (${selectedMonth})`],
      ['렌탈계약번호', '계약일자', '배송/설치확인일', '공급사명', '고객명', '매칭 제품명', '상품개수', '공급단가 (VAT포함)', '공급 물품대금 (VAT포함)', '본부', '지사', '영업사원']
    ];

    itemsToExport.forEach((item) => {
      detailRows.push([
        item.rentalNo,
        item.contractDate,
        item.deliveryDate,
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
  // ==========================================
  const handleExportCommissionExcel = (targetSupplierId?: string) => {
    if (!XLSX) {
      alert('엑셀 라이브러리를 로드할 수 없습니다.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // 1. 공급 수수료 총괄 요약 시트
    const summaryRows = [
      [`리치웰페어 - 공급 수수료(특수수당) 정산 총괄표 (${selectedMonth} 기준)`],
      [`정산 기준: 배송완료 및 ${selectedMonth} 말일까지 설치확인된 건 (금액: VAT 부가세 포함, 본부별 차등 반영)`],
      [`출력일시: ${new Date().toLocaleString()}`],
      [],
      ['공급사명', '수수료 수령처/인', '정산은행', '계좌번호', '예금주', '수수료 대상 상품개수', '본부차등적용 개수', '총 공급 수수료 (VAT포함)']
    ];

    const targetSummaries = targetSupplierId && targetSupplierId !== 'ALL'
      ? commissionSummaries.filter(c => c.supplierId === targetSupplierId)
      : commissionSummaries;

    let subTotalCount = 0;
    let subTotalHqDiff = 0;
    let subTotalAmount = 0;

    targetSummaries.forEach((c) => {
      subTotalCount += c.productCount;
      subTotalHqDiff += c.hqDiffCount;
      subTotalAmount += c.totalCommissionAmount;
      summaryRows.push([
        c.supplierName,
        c.commissionRecipient,
        c.recipientBank,
        c.recipientAccount,
        c.recipientHolder,
        c.productCount,
        c.hqDiffCount,
        c.totalCommissionAmount
      ]);
    });

    summaryRows.push([
      '합계',
      '',
      '',
      '',
      '',
      subTotalCount,
      subTotalHqDiff,
      subTotalAmount
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, '공급수수료총괄표');

    // 2. 건별 공급 수수료 상세 명세 시트
    const itemsToExport = targetSupplierId && targetSupplierId !== 'ALL'
      ? settlementItems.filter(i => i.matchedSupplierId === targetSupplierId)
      : settlementItems;

    const detailRows = [
      [`공급 수수료(특수수당) 상세 명세서 (${selectedMonth})`],
      ['렌탈계약번호', '계약일자', '배송/설치확인일', '공급사명', '고객명', '매칭 제품명', '소속본부', '수수료유형', '상품개수', '수수료단가 (VAT포함)', '공급 수수료 합계 (VAT포함)', '수령처/계좌', '지사', '영업사원']
    ];

    itemsToExport.forEach((item) => {
      detailRows.push([
        item.rentalNo,
        item.contractDate,
        item.deliveryDate,
        item.matchedSupplierName,
        item.memName,
        item.matchedProductName,
        item.hq,
        item.isHqDifferentiated ? `${item.appliedHqName}본부 차등` : '기본',
        item.quantity,
        item.supplyCommission,
        item.totalCommission,
        `${item.commissionRecipient} (${item.recipientBank} ${item.recipientAccount})`,
        item.branch,
        item.empName
      ]);
    });

    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetail, '공급수수료상세명세');

    const fileName = targetSupplierId && targetSupplierId !== 'ALL'
      ? `${suppliers.find(s => s.id === targetSupplierId)?.name || '공급사'}_공급수수료정산서_${selectedMonth}.xlsx`
      : `리치웰페어_공급수수료정산서_${selectedMonth}.xlsx`;

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
            ) : (
              <button
                onClick={() => handleExportCommissionExcel(selectedSupplierId)}
                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all whitespace-nowrap"
                title="공급 수수료 정산서 엑셀 다운로드"
              >
                <FileSpreadsheet size={14} />
                <span>공급수수료 정산서 엑셀 다운로드</span>
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

        {/* 메인 탭 네비게이션: 물품 대금 정산 vs 공급 수수료 정산 (완전 분리) */}
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
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
            <Info size={14} className="text-indigo-400" />
            <span>회원번호 없이 <strong>렌탈계약번호</strong> 기준으로 상품개수(수량)가 집계됩니다.</span>
          </div>
        </div>

        {/* 컨트롤 필터 툴바 */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-4">
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
                공급사 필터:
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

            {/* 뷰 모드 토글 (총괄 요약 / 건별 상세 내역) */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('SUMMARY')}
                className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  viewMode === 'SUMMARY'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mainTab === 'SUPPLY_PRICE' ? '공급사별 물품대금 총괄' : '수령처별 수수료 총괄'}
              </button>
              <button
                onClick={() => setViewMode('DETAIL')}
                className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
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
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="렌탈계약번호/고객명/본부/제품 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8.5 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>

        {/* 상단 KPI 요약 카드 영역 (메인 탭에 따라 완전 분리) */}
        {mainTab === 'SUPPLY_PRICE' ? (
          /* [물품 대금 전용 KPI 카드] */
          <div className="px-6 py-3 bg-blue-50/50 border-b border-blue-100 grid grid-cols-3 gap-4 shrink-0 whitespace-nowrap">
            <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase">정산 대상 총 상품개수</p>
                <h3 className="text-xl font-black text-slate-900 mt-0.5 font-mono">
                  {supplyPriceTotalStats.productCount.toLocaleString()} <span className="text-xs font-bold text-slate-500">개</span>
                </h3>
              </div>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Package size={18} />
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-blue-700 uppercase">총 공급 물품대금 합계 (VAT포함)</p>
                <h3 className="text-xl font-black text-blue-700 mt-0.5 font-mono">
                  {supplyPriceTotalStats.totalSupplyAmount.toLocaleString()} <span className="text-xs font-bold text-blue-500">원</span>
                </h3>
              </div>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <DollarSign size={18} />
              </div>
            </div>

            <div className="bg-linear-to-br from-blue-900 to-indigo-950 text-white p-3.5 rounded-xl shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-blue-200 uppercase">평균 공급 단가 (상품당)</p>
                <h3 className="text-xl font-black text-amber-300 mt-0.5 font-mono">
                  {supplyPriceTotalStats.productCount > 0 
                    ? Math.round(supplyPriceTotalStats.totalSupplyAmount / supplyPriceTotalStats.productCount).toLocaleString() 
                    : 0} <span className="text-xs font-bold text-blue-200">원</span>
                </h3>
              </div>
              <div className="p-2 bg-white/10 text-amber-300 rounded-lg">
                <Receipt size={18} />
              </div>
            </div>
          </div>
        ) : (
          /* [공급 수수료 전용 KPI 카드] */
          <div className="px-6 py-3 bg-purple-50/50 border-b border-purple-100 grid grid-cols-3 gap-4 shrink-0 whitespace-nowrap">
            <div className="bg-white p-3.5 rounded-xl border border-purple-100 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase">수수료 대상 상품개수</p>
                <h3 className="text-xl font-black text-slate-900 mt-0.5 font-mono">
                  {commissionTotalStats.productCount.toLocaleString()} <span className="text-xs font-bold text-slate-500">개</span>
                </h3>
              </div>
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <Coins size={18} />
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-purple-100 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-purple-700 uppercase">총 공급 수수료(특수수당) 합계 (VAT포함)</p>
                <h3 className="text-xl font-black text-purple-700 mt-0.5 font-mono">
                  {commissionTotalStats.totalCommissionAmount.toLocaleString()} <span className="text-xs font-bold text-purple-500">원</span>
                </h3>
              </div>
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <Tag size={18} />
              </div>
            </div>

            <div className="bg-linear-to-br from-purple-900 to-indigo-950 text-white p-3.5 rounded-xl shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-purple-200 uppercase">본부별 차등 수수료 적용 상품개수</p>
                <h3 className="text-xl font-black text-amber-300 mt-0.5 font-mono">
                  {commissionTotalStats.hqDiffCount.toLocaleString()} <span className="text-xs font-bold text-purple-200">개</span>
                </h3>
              </div>
              <div className="p-2 bg-white/10 text-amber-300 rounded-lg">
                <Layers size={18} />
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
                      (렌탈계약번호 기준 상품개수 집계 · VAT 포함)
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
                        <th className="p-3">배송/설치확인일</th>
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
                          <td colSpan={12} className="py-12 text-center text-slate-400 whitespace-nowrap">
                            해당 조건에 부합하는 물품대금 정산 대상 건이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        filteredDetailItems.map((item) => (
                          <tr key={item.uniqueKey} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                            <td className="p-3 pl-4 font-mono font-bold text-indigo-700">{item.rentalNo}</td>
                            <td className="p-3 font-mono text-slate-500">{item.contractDate}</td>
                            <td className="p-3 font-mono font-bold text-emerald-700">{item.deliveryDate}</td>
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
          ) : (
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
                      (본부별 차등 수수료 우선 반영 · 상품개수 기준)
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-500">
                    총 {commissionSummaries.length}개 수령처
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                        <th className="p-3.5 pl-5">관련 공급사</th>
                        <th className="p-3.5">수수료 수령처/인</th>
                        <th className="p-3.5">수령 은행</th>
                        <th className="p-3.5">수령 계좌번호</th>
                        <th className="p-3.5">예금주</th>
                        <th className="p-3.5 text-right font-black text-slate-900">수수료 대상 상품개수</th>
                        <th className="p-3.5 text-center text-purple-700">본부차등 적용</th>
                        <th className="p-3.5 text-right font-black text-purple-900 pr-5">총 공급 수수료 (VAT포함)</th>
                        <th className="p-3.5 text-center w-28">명세서 다운로드</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {commissionSummaries.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-slate-400 whitespace-nowrap">
                            해당 조건에 부합하는 공급 수수료 정산 대상 건이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        commissionSummaries.map((c) => (
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
                            <td className="p-3.5 text-right font-bold font-mono text-slate-900">
                              {c.productCount.toLocaleString()}개
                            </td>
                            <td className="p-3.5 text-center">
                              {c.hqDiffCount > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-bold">
                                  <Tag size={10} />
                                  <span>{c.hqDiffCount}개 차등</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">기본 적용</span>
                              )}
                            </td>
                            <td className="p-3.5 text-right font-mono font-black text-purple-700 text-sm pr-5">
                              {c.totalCommissionAmount.toLocaleString()}원
                            </td>
                            <td className="p-3.5 text-center">
                              <button
                                onClick={() => handleExportCommissionExcel(c.supplierId)}
                                disabled={c.productCount === 0}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-purple-50 hover:text-purple-600 text-slate-600 rounded-lg text-[11px] font-bold border border-slate-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 mx-auto"
                                title="이 공급사/수령처 공급수수료 정산명세서 다운로드"
                              >
                                <Download size={11} />
                                <span>명세서</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {commissionSummaries.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 whitespace-nowrap">
                          <td className="p-3.5 pl-5" colSpan={5}>합계</td>
                          <td className="p-3.5 text-right font-mono">{commissionTotalStats.productCount.toLocaleString()}개</td>
                          <td className="p-3.5 text-center font-mono text-purple-700">{commissionTotalStats.hqDiffCount}개 차등</td>
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
                      (본부별 차등 수수료 자동 적용 · 상품개수 기준)
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                        <th className="p-3 pl-4 font-mono">렌탈계약번호</th>
                        <th className="p-3">계약일자</th>
                        <th className="p-3">배송/설치확인일</th>
                        <th className="p-3">공급사</th>
                        <th className="p-3">고객명</th>
                        <th className="p-3">매칭 제품명</th>
                        <th className="p-3 font-semibold text-slate-900">소속 본부</th>
                        <th className="p-3">수수료 유형</th>
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
                          <td colSpan={14} className="py-12 text-center text-slate-400 whitespace-nowrap">
                            해당 조건에 부합하는 공급 수수료 정산 대상 건이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        filteredDetailItems.map((item) => (
                          <tr key={item.uniqueKey} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                            <td className="p-3 pl-4 font-mono font-bold text-indigo-700">{item.rentalNo}</td>
                            <td className="p-3 font-mono text-slate-500">{item.contractDate}</td>
                            <td className="p-3 font-mono font-bold text-emerald-700">{item.deliveryDate}</td>
                            <td className="p-3 font-bold text-slate-800">{item.matchedSupplierName}</td>
                            <td className="p-3 font-bold text-slate-900">{item.memName}</td>
                            <td className="p-3 font-medium text-slate-800">{item.matchedProductName}</td>
                            <td className="p-3 font-bold text-slate-800">{item.hq}</td>
                            <td className="p-3">
                              {item.isHqDifferentiated ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-bold">
                                  <Tag size={10} />
                                  <span>{item.appliedHqName} 차등</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">기본 수수료</span>
                              )}
                            </td>
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
          )}
        </div>
      </motion.div>
    </div>
  );
};

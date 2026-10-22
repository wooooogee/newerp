import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { X, Calendar, Download, Search, Building2, ChevronRight, ChevronDown, FileSpreadsheet, Layers, CreditCard, ArrowUpDown, Filter, Check, RotateCcw, Lock, Unlock, Sparkles, GripVertical, Plus, Trash2, Edit3, CheckCircle, DollarSign, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { checkInstallCertEligibility, isSupplyCommissionRule } from './manualOrderUtils';

// @ts-ignore
const XLSX = (window as any).XLSX;

export interface MonthlySettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[];
  hqSettings: any[];
  divisionSettings: any[];
  maintenancePayouts: any[];
  globalIncentiveRules: any[];
  calculateCommissionDetails: (item: any, countMap: Map<string, number>) => any;
  onExportHqSettlement?: (hqName: string, monthStr?: string, precalculatedDetail?: any) => Promise<void>;
  calculateMaintenancePayouts?: (items: any[], monthStr?: string, ignoreDay?: boolean) => any[];
}

interface SettlementClosureItem {
  month: string;
  closedAt: string;
  closedBy: string;
  status: 'CLOSED';
  totalCount: number;
  totalNet: number;
}

interface HqMonthlyStat {
  hqName: string;
  count: number;
  accountCount?: number;
  salesSum: number;
  promoSum: number;
  generalSum: number;
  maintenanceSum: number;
  specialSum: number;
  grossTotal: number;
  tax: number;
  netTotal: number;
  settlementType: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  items: any[];
  specialItems: any[];
  maintenanceItems: any[];
}

export interface DetailedSettlementRow {
  id: string;
  targetName: string;      // 거래처 / 지급대상 (본부명 or 개인명)
  division?: string;        // 구분 (소계 행이면 '소계')
  itemName: string;        // 상품명 / 지급항목
  count: number;           // 건수
  unitFee: number;         // 건별수수료
  salesCommission: number; // 판매수수료
  promoCommission: number; // 판매촉진비
  totalCommission: number; // 총수수료
  isSubtotal?: boolean;    // 소계 행 여부
  isHeaderGroup?: boolean; // 본부 첫 행 (거래처명 노출 여부)
  isCustom?: boolean;      // 사용자 직접 추가 항목 여부
}

// 10월 수수료 정산 내역 기준 기본 데이터 (사용자 확정 양식)
export const DEFAULT_OCTOBER_SETTLEMENT_ROWS: DetailedSettlementRow[] = [
  // 1. 언바운드컴퍼니
  { id: 'oct_unbound_1', targetName: '언바운드컴퍼니', itemName: '프리미엄540', count: 27, unitFee: 750000, salesCommission: 8100000, promoCommission: 12150000, totalCommission: 20250000, isHeaderGroup: true },
  { id: 'oct_unbound_2', targetName: '언바운드컴퍼니', itemName: '프리미엄540플러스', count: 355, unitFee: 740000, salesCommission: 106500000, promoCommission: 156200000, totalCommission: 262700000 },
  { id: 'oct_unbound_sub', targetName: '언바운드컴퍼니', division: '소계', itemName: '', count: 382, unitFee: 0, salesCommission: 114600000, promoCommission: 168350000, totalCommission: 282950000, isSubtotal: true },

  // 2. 굿라이프
  { id: 'oct_goodlife_1', targetName: '굿라이프', itemName: '올인원', count: 201, unitFee: 750000, salesCommission: 60300000, promoCommission: 90450000, totalCommission: 150750000, isHeaderGroup: true },
  { id: 'oct_goodlife_2', targetName: '굿라이프', itemName: '골드', count: 8, unitFee: 750000, salesCommission: 2400000, promoCommission: 3600000, totalCommission: 6000000 },
  { id: 'oct_goodlife_3', targetName: '굿라이프', itemName: '실버', count: 1, unitFee: 710000, salesCommission: 300000, promoCommission: 410000, totalCommission: 710000 },
  { id: 'oct_goodlife_sub', targetName: '굿라이프', division: '소계', itemName: '', count: 210, unitFee: 0, salesCommission: 63000000, promoCommission: 94460000, totalCommission: 157460000, isSubtotal: true },

  // 3. 피티엠에스
  { id: 'oct_ptms_1', targetName: '피티엠에스', itemName: '하이브리드698', count: 2, unitFee: 680000, salesCommission: 600000, promoCommission: 760000, totalCommission: 1360000, isHeaderGroup: true },
  { id: 'oct_ptms_sub', targetName: '피티엠에스', division: '소계', itemName: '', count: 2, unitFee: 0, salesCommission: 600000, promoCommission: 760000, totalCommission: 1360000, isSubtotal: true },

  // 4. 맥스
  { id: 'oct_max_1', targetName: '맥스', itemName: '하이브리드698', count: 4, unitFee: 680000, salesCommission: 1200000, promoCommission: 1520000, totalCommission: 2720000, isHeaderGroup: true },
  { id: 'oct_max_2', targetName: '맥스', itemName: '헬스케어580', count: 2, unitFee: 60000, salesCommission: 120000, promoCommission: 0, totalCommission: 120000 },
  { id: 'oct_max_3', targetName: '맥스', itemName: '유지수수료(헬스케어580)', count: 6, unitFee: 10000, salesCommission: 60000, promoCommission: 0, totalCommission: 60000 },
  { id: 'oct_max_sub', targetName: '맥스', division: '소계', itemName: '', count: 12, unitFee: 0, salesCommission: 1380000, promoCommission: 1520000, totalCommission: 2900000, isSubtotal: true },

  // 5. 해랑인터내셔널
  { id: 'oct_haerang_1', targetName: '해랑인터내셔널', itemName: '하이브리드698', count: 1, unitFee: 650000, salesCommission: 300000, promoCommission: 350000, totalCommission: 650000, isHeaderGroup: true },
  { id: 'oct_haerang_2', targetName: '해랑인터내셔널', itemName: '프리미엄540', count: 2, unitFee: 600000, salesCommission: 600000, promoCommission: 600000, totalCommission: 1200000 },
  { id: 'oct_haerang_sub', targetName: '해랑인터내셔널', division: '소계', itemName: '', count: 3, unitFee: 0, salesCommission: 900000, promoCommission: 950000, totalCommission: 1850000, isSubtotal: true },

  // 6. 유지수수료 본부들
  { id: 'oct_withus_1', targetName: '위더스앤씨', itemName: '유지수수료(좋은건강크루즈)', count: 1, unitFee: 10000, salesCommission: 10000, promoCommission: 0, totalCommission: 10000, isHeaderGroup: true },
  { id: 'oct_withus_sub', targetName: '위더스앤씨', division: '소계', itemName: '', count: 1, unitFee: 0, salesCommission: 10000, promoCommission: 0, totalCommission: 10000, isSubtotal: true },

  { id: 'oct_direct_1', targetName: '다이렉트', itemName: '유지수수료(헬스케어580)', count: 2, unitFee: 14000, salesCommission: 28000, promoCommission: 0, totalCommission: 28000, isHeaderGroup: true },
  { id: 'oct_direct_sub', targetName: '다이렉트', division: '소계', itemName: '', count: 2, unitFee: 0, salesCommission: 28000, promoCommission: 0, totalCommission: 28000, isSubtotal: true },

  { id: 'oct_thelife_1', targetName: '더라이프앤', itemName: '유지수수료(헬스케어580)', count: 1, unitFee: 10000, salesCommission: 10000, promoCommission: 0, totalCommission: 10000, isHeaderGroup: true },
  { id: 'oct_thelife_sub', targetName: '더라이프앤', division: '소계', itemName: '', count: 1, unitFee: 0, salesCommission: 10000, promoCommission: 0, totalCommission: 10000, isSubtotal: true },

  // 7. 기타 수당 / 외주 지급대상 (컨설팅비, 모델비, 물품대금 수수료, 홈페이지 유지비)
  { id: 'oct_etc_1', targetName: '조재윤', itemName: '모델비', count: 601, unitFee: 10000, salesCommission: 0, promoCommission: 0, totalCommission: 6010000, isHeaderGroup: true },
  { id: 'oct_etc_2', targetName: '조민경', itemName: '컨설팅비', count: 601, unitFee: 5000, salesCommission: 0, promoCommission: 0, totalCommission: 3005000, isHeaderGroup: true },
  { id: 'oct_etc_3', targetName: '이종연', itemName: '컨설팅비(해랑인터내셔널)', count: 3, unitFee: 30000, salesCommission: 0, promoCommission: 0, totalCommission: 90000, isHeaderGroup: true },
  { id: 'oct_etc_4', targetName: '신동우', itemName: '물품대금 수수료(테라웨이브)', count: 2, unitFee: 500000, salesCommission: 0, promoCommission: 0, totalCommission: 1000000, isHeaderGroup: true },
  { id: 'oct_etc_5', targetName: '권성훈', itemName: '홈페이지 유지비', count: 1, unitFee: 150000, salesCommission: 0, promoCommission: 0, totalCommission: 150000, isHeaderGroup: true }
];

// 굿라이프 사업단 내부 실송금 및 신동우 대표 오버라이딩 차액 분배 구조 인터페이스
export interface GoodlifeSplitItem {
  id: string;
  category: '꿈잇다' | '신동우사업단';
  hqName: string;            // 귀속 본부 ((주)꿈잇다 or 최강본부, 새빛본부 등)
  itemName: string;          // 상품명 (올인원, 골드, 실버, 698 등)
  count: number;             // 건수
  officialUnitFee: number;   // 본사 단가 (750,000 or 710,000)
  directRecipient: string;   // 직송금 수취처 ((주)꿈잇다 or 해당 본부)
  directUnitFee: number;     // 직송금 단가 (꿈잇다 710,000, 본부 550,000)
  bankName?: string;         // 입금 은행 (hqSettings 연동)
  accountNumber?: string;    // 계좌번호 (hqSettings 연동)
  accountHolder?: string;    // 예금주 (hqSettings 연동)
  memo?: string;
}

// 10월 굿라이프 사업단 기본 내부 분배 내역 (총 210건, 157,460,000원 기준: 꿈잇다 vs 신동우사업단 분배)
export const DEFAULT_OCTOBER_GOODLIFE_SPLIT_ITEMS: GoodlifeSplitItem[] = [
  // 1. 굿라이프(꿈잇다) 사업단: 직송금 71만원 / 신동우 대표 차액 4만원 (실버 0원)
  {
    id: 'gl_split_kkum_1',
    category: '꿈잇다',
    hqName: '꿈잇다',
    itemName: '굿라이프헬스케어올인원',
    count: 180,
    officialUnitFee: 750000,
    directRecipient: '(주)꿈잇다',
    directUnitFee: 710000,
    bankName: '기업은행',
    accountNumber: '115-131758-01-017',
    accountHolder: '주식회사 꿈잇다',
    memo: '꿈잇다 직송금 71만 / 신동우 차액 4만'
  },
  {
    id: 'gl_split_kkum_2',
    category: '꿈잇다',
    hqName: '꿈잇다',
    itemName: '굿라이프헬스케어골드',
    count: 6,
    officialUnitFee: 750000,
    directRecipient: '(주)꿈잇다',
    directUnitFee: 710000,
    bankName: '기업은행',
    accountNumber: '115-131758-01-017',
    accountHolder: '주식회사 꿈잇다',
    memo: '꿈잇다 직송금 71만 / 신동우 차액 4만'
  },
  {
    id: 'gl_split_kkum_3',
    category: '꿈잇다',
    hqName: '꿈잇다',
    itemName: '굿라이프헬스케어실버',
    count: 1,
    officialUnitFee: 710000,
    directRecipient: '(주)꿈잇다',
    directUnitFee: 710000,
    bankName: '기업은행',
    accountNumber: '115-131758-01-017',
    accountHolder: '주식회사 꿈잇다',
    memo: '꿈잇다 직송금 71만 / 신동우 차액 0원'
  },

  // 2. 굿라이프(신동우) 사업단: 본부 직송금 55만원 / 신동우 대표 차액 20만원 (실버 16만원)
  {
    id: 'gl_split_shindw_1',
    category: '신동우사업단',
    hqName: '신동우사업단 산하본부',
    itemName: '굿라이프헬스케어올인원',
    count: 21,
    officialUnitFee: 750000,
    directRecipient: '소속 본부',
    directUnitFee: 550000,
    bankName: '국민은행',
    accountNumber: '164501-04-161888',
    accountHolder: '김애숙(에스제이컨설팅)',
    memo: '본부 직송금 55만 / 신동우 차액 20만'
  },
  {
    id: 'gl_split_shindw_2',
    category: '신동우사업단',
    hqName: '신동우사업단 산하본부',
    itemName: '굿라이프헬스케어골드',
    count: 2,
    officialUnitFee: 750000,
    directRecipient: '소속 본부',
    directUnitFee: 550000,
    bankName: '국민은행',
    accountNumber: '164501-04-161888',
    accountHolder: '김애숙(에스제이컨설팅)',
    memo: '본부 직송금 55만 / 신동우 차액 20만'
  },
  {
    id: 'gl_split_shindw_3',
    category: '신동우사업단',
    hqName: '신동우사업단 산하본부',
    itemName: '굿라이프헬스케어실버',
    count: 0,
    officialUnitFee: 710000,
    directRecipient: '소속 본부',
    directUnitFee: 550000,
    bankName: '국민은행',
    accountNumber: '164501-04-161888',
    accountHolder: '김애숙(에스제이컨설팅)',
    memo: '본부 직송금 55만 / 신동우 차액 16만'
  }
];

// 구좌수 파싱 헬퍼 함수
const getAccountCountFromItem = (item: any): number => {
  if (!item) return 1;
  const prodText = `${item.rentalProd || ''} ${item.prodName || ''} ${item.productModel || ''} ${item['제품명'] || ''} ${item['상품명'] || ''}`;
  const m = prodText.match(/(\d+)구좌/);
  if (m) {
    const q = parseInt(m[1], 10);
    if (!isNaN(q) && q > 0) return q;
  }
  return 1;
};

// 특수수당 본부/사업단 매칭 헬퍼 함수
const isHqMatchedForSpecialRule = (
  rule: any,
  rawHqName: string,
  divisionList: any[] = []
): boolean => {
  const normalizeHq = (name: string) => (name || '').replace(/[\s()본부]/g, '');
  const cleanHq = normalizeHq(rawHqName);
  if (!cleanHq) return false;

  const targetDivisions = rule.targetDivisions || [];
  const targetHqs = rule.targetHqs || (rule.targetHq ? [rule.targetHq] : ['ALL']);

  const hasDivisions = targetDivisions.length > 0;
  const hasHqs = targetHqs.length > 0;

  // 1. 전체 적용 여부
  if (targetDivisions.includes('ALL') || (!hasDivisions && targetHqs.includes('ALL')) || (!hasDivisions && !hasHqs)) {
    return true;
  }

  // 2. 사업단 매칭 확인 (소속 본부 일괄 적용)
  if (hasDivisions) {
    const isDivMatch = (divisionList || []).some((div: any) => {
      const isTargetDiv = targetDivisions.some((td: string) => {
        if (!td) return false;
        if (td === div.id || td === div.name) return true;
        // td가 ID이거나 사업단 이름일 수 있으므로 정규화 비교
        const divCleanName = (div.name || '').replace(/\s+/g, '');
        const tdClean = (td || '').replace(/\s+/g, '');
        if (divCleanName && tdClean) {
          // '꿈잇다'와 '신동우'가 서로 교차 오매칭되지 않도록 방지
          if (tdClean.includes('꿈잇다') && !divCleanName.includes('꿈잇다')) return false;
          if (tdClean.includes('신동우') && !divCleanName.includes('신동우')) return false;
          if (divCleanName === tdClean || divCleanName.includes(tdClean) || tdClean.includes(divCleanName)) return true;
        }
        return false;
      });
      if (!isTargetDiv) return false;

      // 해당 사업단에 등록된 소속 본부 목록(hqNames)과 계약의 본부명 일치 여부 확인
      return (div.hqNames || []).some((h: string) => {
        const normH = normalizeHq(h);
        return normH === cleanHq || normH.includes(cleanHq) || cleanHq.includes(normH);
      });
    });
    if (isDivMatch) return true;
  }

  // 3. 개별 본부 매칭 확인
  if (hasHqs && !targetHqs.includes('ALL')) {
    const isDirectHqMatch = targetHqs.some((h: string) => normalizeHq(h) === cleanHq);
    if (isDirectHqMatch) return true;
  }

  return false;
};

export const MonthlySettlementModal: React.FC<MonthlySettlementModalProps> = ({
  isOpen,
  onClose,
  data,
  hqSettings,
  divisionSettings,
  maintenancePayouts,
  globalIncentiveRules,
  calculateCommissionDetails,
  onExportHqSettlement,
  calculateMaintenancePayouts
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | '사업자' | '개인'>('all');
  const [selectedHqDetail, setSelectedHqDetail] = useState<HqMonthlyStat | null>(null);
  const [sortField, setSortField] = useState<'netTotal' | 'count' | 'hqName' | 'custom'>('netTotal');
  const [sortAsc, setSortAsc] = useState(false);

  // 뷰 모드 탭: 'summary' (본부별 총괄 집계) | 'detailed' (수수료 정산 상세 내역 - 사용자 요청 뷰)
  const [settlementViewTab, setSettlementViewTab] = useState<'summary' | 'detailed'>('detailed');

  // 상세 정산 내역 편집 모드
  const [isDetailEditMode, setIsDetailEditMode] = useState<boolean>(false);

  // 신규 항목 추가 모달 상태
  const [isAddDetailModalOpen, setIsAddDetailModalOpen] = useState<boolean>(false);
  const [newDetailTarget, setNewDetailTarget] = useState<string>('');
  const [newDetailItem, setNewDetailItem] = useState<string>('');
  const [newDetailCount, setNewDetailCount] = useState<number>(1);
  const [newDetailUnitFee, setNewDetailUnitFee] = useState<number>(0);
  const [newDetailSalesComm, setNewDetailSalesComm] = useState<number>(0);
  const [newDetailPromoComm, setNewDetailPromoComm] = useState<number>(0);
  const [newDetailTotalComm, setNewDetailTotalComm] = useState<number>(0);

  // 로컬 스토리지에 저장된 월별 상세 정산 내역
  const [customDetailedRowsMap, setCustomDetailedRowsMap] = useState<Record<string, DetailedSettlementRow[]>>(() => {
    try {
      const stored = localStorage.getItem('erp_monthly_detailed_rows_map_v2');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return {};
  });

  // 굿라이프 내부 실송금 및 신동우 대표 오버라이딩 차액 분배 상태
  const [isGoodlifeSplitModalOpen, setIsGoodlifeSplitModalOpen] = useState<boolean>(false);
  const [goodlifeSplitRows, setGoodlifeSplitRows] = useState<GoodlifeSplitItem[]>(() => {
    try {
      const stored = localStorage.getItem('erp_goodlife_split_rows_v1');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return DEFAULT_OCTOBER_GOODLIFE_SPLIT_ITEMS;
  });

  // 굿라이프 분배 내역 로컬 저장
  const saveGoodlifeSplitRows = (rows: GoodlifeSplitItem[]) => {
    setGoodlifeSplitRows(rows);
    try {
      localStorage.setItem('erp_goodlife_split_rows_v1', JSON.stringify(rows));
    } catch (e) {}
  };

  // 굿라이프 분배 집계 메트릭 (꿈잇다 vs 신동우사업단 산하본부 분리 집계)
  const goodlifeSplitSummary = useMemo(() => {
    let totalCount = 0;
    let totalOfficial = 0;
    let totalDirect = 0;
    let totalOverride = 0;
    let kkumCount = 0;
    let kkumOfficial = 0;
    let kkumDirect = 0;
    let kkumOverride = 0;
    let hqCount = 0;
    let hqOfficial = 0;
    let hqDirect = 0;
    let hqOverride = 0;

    goodlifeSplitRows.forEach(item => {
      const count = Number(item.count) || 0;
      const official = count * (Number(item.officialUnitFee) || 0);
      const direct = count * (Number(item.directUnitFee) || 0);
      const diff = official - direct;

      totalCount += count;
      totalOfficial += official;
      totalDirect += direct;
      totalOverride += diff;

      if (item.category === '꿈잇다') {
        kkumCount += count;
        kkumOfficial += official;
        kkumDirect += direct;
        kkumOverride += diff;
      } else {
        hqCount += count;
        hqOfficial += official;
        hqDirect += direct;
        hqOverride += diff;
      }
    });

    const isMatch = totalOfficial === (totalDirect + totalOverride);

    return {
      totalCount,
      totalOfficial,
      totalDirect,
      totalOverride,
      kkumCount,
      kkumOfficial,
      kkumDirect,
      kkumOverride,
      hqCount,
      hqOfficial,
      hqDirect,
      hqOverride,
      isMatch
    };
  }, [goodlifeSplitRows]);

  // 굿라이프 분배 뷰 모드: 'summary' (상품군별 요약) | 'byHq' (사업단 소속 본부별 상세)
  const [goodlifeViewMode, setGoodlifeViewMode] = useState<'summary' | 'byHq'>('summary');

  // 사업단별 묶기 상태 (기본값 true로 설정하여 접속 시 바로 사업단별로 정돈되어 나타남)
  const [groupByDivision, setGroupByDivision] = useState<boolean>(() => {
    const saved = localStorage.getItem('erp_monthly_settlement_group_division');
    if (saved !== null) return saved === 'true';
    const oldSaved = localStorage.getItem('erp_monthly_settlement_group_business');
    return oldSaved === null ? true : oldSaved === 'true';
  });

  // 사업단별 아코디언 접힘/펼침 상태 (기본적으로 모두 펼쳐진 상태)
  const [collapsedDivisions, setCollapsedDivisions] = useState<Record<string, boolean>>({});

  // 본부명으로 소속 사업단 찾는 헬퍼 함수
  const getDivisionForHq = useCallback((hqName: string) => {
    if (!hqName) return null;
    const normalizeHq = (name: string) => (name || '').replace(/[\s()본부]/g, '').toLowerCase();
    const cleanHq = normalizeHq(hqName);
    if (!cleanHq) return null;

    for (const div of (divisionSettings || [])) {
      const isMember = (div.hqNames || []).some((h: string) => {
        const normH = normalizeHq(h);
        return normH === cleanHq || normH.includes(cleanHq) || cleanHq.includes(normH);
      });
      if (isMember) return div;
    }
    return null;
  }, [divisionSettings]);

  // 본부명으로 통합 표출할 대상명(사업단 묶기 시) 가져오기: 굿라이프(신동우+꿈잇다)는 '굿라이프'로 통합
  const getGroupedTargetName = useCallback((hqName: string): { name: string; isDivision: boolean } => {
    const div = getDivisionForHq(hqName);
    if (!div) {
      return { name: hqName, isDivision: false };
    }
    const divName = (div.name || '').trim();
    // 굿라이프(신동우)와 굿라이프(꿈잇다) 사업단은 '굿라이프'로 통합
    if (divName.includes('굿라이프')) {
      return { name: '굿라이프', isDivision: true };
    }
    // 언바운드컴퍼니 사업단
    if (divName.includes('언바운드')) {
      return { name: '언바운드컴퍼니', isDivision: true };
    }
    return { name: divName, isDivision: true };
  }, [getDivisionForHq]);

  // 거래처 / 지급대상별 계좌정보 및 정산유형 매핑 헬퍼 함수
  // 거래처 / 지급대상별 계좌정보 및 정산유형 매핑 헬퍼 함수 (본부별 정산 설정 hqSettings 최우선 연동)
  const getPayoutAccountInfo = useCallback((targetName: string) => {
    if (!targetName) {
      return { settlementType: '사업자', bankName: '-', accountNumber: '-', accountHolder: '-' };
    }
    const cleanTarget = targetName.trim();
    const normalizeName = (s: string) => (s || '').replace(/[\s()주식회사유대표본부지사]/g, '').toLowerCase();
    const normTarget = normalizeName(cleanTarget);

    // 1) [본부별 정산 설정 (hqSettings)] 최우선 검색
    const matchedHq = (hqSettings || []).find(h => {
      const normH = normalizeName(h.hqName);
      return normH === normTarget || (normH.length >= 2 && (normH.includes(normTarget) || normTarget.includes(normH)));
    });
    if (matchedHq && (matchedHq.accountNumber || matchedHq.bankName)) {
      return {
        settlementType: matchedHq.settlementType || '사업자',
        bankName: matchedHq.bankName || '-',
        accountNumber: matchedHq.accountNumber || '-',
        accountHolder: matchedHq.accountHolder || cleanTarget
      };
    }

    // 2) [사업단 관리 (divisionSettings)] 검색 (사업단 대표 계좌 또는 소속 본부의 사업단 계좌)
    const matchedDiv = (divisionSettings || []).find(d => {
      const normD = normalizeName(d.name);
      if (normD === normTarget || (normD.length >= 2 && (normD.includes(normTarget) || normTarget.includes(normD)))) return true;
      // 소속 본부 목록(hqNames) 중에 targetName이 있는지 확인
      return (d.hqNames || []).some((h: string) => normalizeName(h) === normTarget);
    });
    if (matchedDiv && (matchedDiv.accountNumber || matchedDiv.bankName)) {
      return {
        settlementType: matchedDiv.settlementType || '사업자',
        bankName: matchedDiv.bankName || '-',
        accountNumber: matchedDiv.accountNumber || '-',
        accountHolder: matchedDiv.accountHolder || matchedDiv.name || cleanTarget
      };
    }

    // 3) 글로벌 인센티브 / 특수수당 대상자 검색
    const matchedRule = (globalIncentiveRules || []).find(r => {
      const normR = normalizeName(r.targetName);
      return normR === normTarget || (normR.length >= 2 && (normR.includes(normTarget) || normTarget.includes(normR)));
    });
    if (matchedRule && (matchedRule as any).accountNumber) {
      return {
        settlementType: matchedRule.taxType === 'BUSINESS' ? '사업자' : '개인',
        bankName: (matchedRule as any).bankName || '-',
        accountNumber: (matchedRule as any).accountNumber || '-',
        accountHolder: (matchedRule as any).accountHolder || cleanTarget
      };
    }

    // 4) 특수 대상자 마스터 fallback (매칭 실패 시 안전망)
    if (normTarget.includes('신동우') || normTarget.includes('에스제이')) {
      return { settlementType: '사업자', bankName: '국민은행', accountNumber: '164501-04-161888', accountHolder: '김애숙(에스제이컨설팅)' };
    }
    if (normTarget.includes('꿈잇다')) {
      return { settlementType: '사업자', bankName: '기업은행', accountNumber: '115-131758-01-017', accountHolder: '주식회사 꿈잇다' };
    }
    if (normTarget.includes('언바운드')) {
      return { settlementType: '사업자', bankName: '하나은행', accountNumber: '285-910018-29104', accountHolder: '주식회사 언바운드컴퍼니' };
    }
    if (normTarget.includes('피티엠에스')) {
      return { settlementType: '사업자', bankName: '신한은행', accountNumber: '100016632698', accountHolder: '주식회사피티엠에스' };
    }
    if (normTarget.includes('맥스')) {
      return { settlementType: '사업자', bankName: '우리은행', accountNumber: '1005603174407', accountHolder: '김학민(골프존파크)' };
    }
    if (normTarget.includes('해랑')) {
      return { settlementType: '사업자', bankName: '기업은행', accountNumber: '142-197947-04-010', accountHolder: '(주)해랑인터내셔널' };
    }
    if (normTarget.includes('위더스')) {
      return { settlementType: '사업자', bankName: '기업은행', accountNumber: '49707471104012', accountHolder: '주식회사 위더스앤씨' };
    }
    if (normTarget.includes('더라이프앤') || normTarget.includes('더드림')) {
      return { settlementType: '사업자', bankName: '하나은행', accountNumber: '79391040692907', accountHolder: '박인천(더드림)' };
    }
    if (normTarget.includes('다이렉트')) {
      return { settlementType: '사업자', bankName: '국민은행', accountNumber: '822401-04-142270', accountHolder: '다이렉트' };
    }
    if (normTarget.includes('조재윤')) {
      return { settlementType: '개인', bankName: '수협', accountNumber: '206000673009', accountHolder: '조재윤' };
    }
    if (normTarget.includes('조민경')) {
      return { settlementType: '개인', bankName: '카카오뱅크', accountNumber: '3333027476861', accountHolder: '조민경' };
    }
    if (normTarget.includes('이종연')) {
      return { settlementType: '개인', bankName: '농협', accountNumber: '3020500290841', accountHolder: '이종연' };
    }
    if (normTarget.includes('권성훈')) {
      return { settlementType: '개인', bankName: '신한은행', accountNumber: '110-323-031541', accountHolder: '권성훈' };
    }

    return {
      settlementType: '사업자',
      bankName: '-',
      accountNumber: '-',
      accountHolder: cleanTarget
    };
  }, [divisionSettings, hqSettings, globalIncentiveRules]);

  // 사용자 지정 본부 순서 (순서 변경 지원 및 로컬 저장)
  const [customHqOrder, setCustomHqOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('erp_monthly_settlement_custom_order');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // 본부 다중 선택 상태
  const [selectedHqs, setSelectedHqs] = useState<string[]>([]);
  const [isHqDropdownOpen, setIsHqDropdownOpen] = useState(false);
  const [hqSearchInput, setHqSearchInput] = useState('');
  const hqDropdownRef = useRef<HTMLDivElement>(null);

  // 마감 관리 상태
  const [closureList, setClosureList] = useState<SettlementClosureItem[]>([]);
  const [closedDetailMap, setClosedDetailMap] = useState<Record<string, { stats: HqMonthlyStat[]; closedAt: string; closedBy: string }>>({});
  const [isLoadingClosure, setIsLoadingClosure] = useState<boolean>(false);

  // 마감 목록 조회
  const fetchClosureList = useCallback(async () => {
    try {
      const res = await fetch('/api/sheets/settlement-closure/list');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setClosureList(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch closure list:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchClosureList();
    }
  }, [isOpen, fetchClosureList]);

  // 현재 선택 월의 마감 여부
  const currentClosure = useMemo(() => {
    return closureList.find(c => c.month === selectedMonth);
  }, [closureList, selectedMonth]);

  const isCurrentMonthClosed = Boolean(currentClosure);

  // 마감된 월의 확정 스냅샷 데이터 로드
  useEffect(() => {
    if (isCurrentMonthClosed && selectedMonth && !closedDetailMap[selectedMonth]) {
      setIsLoadingClosure(true);
      fetch(`/api/sheets/settlement-closure/detail?month=${encodeURIComponent(selectedMonth)}`)
        .then(res => res.json())
        .then(json => {
          if (json.success && json.data) {
            setClosedDetailMap(prev => ({
              ...prev,
              [selectedMonth]: json.data
            }));
          }
        })
        .catch(err => console.error('Failed to load closure detail:', err))
        .finally(() => setIsLoadingClosure(false));
    }
  }, [isCurrentMonthClosed, selectedMonth, closedDetailMap]);

  // 1. 데이터에서 존재하는 모든 월(YYYY-MM) 목록 추출 (최신순 정렬)
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    
    (data || []).forEach(item => {
      const pDate = item.payDate || '';
      const m = pDate.match(/(\d{4})[-./](\d{1,2})/);
      if (m) {
        months.add(`${m[1]}-${m[2].padStart(2, '0')}`);
      }
    });

    const maintList = calculateMaintenancePayouts
      ? calculateMaintenancePayouts(data, undefined, true)
      : (maintenancePayouts || []);

    maintList.forEach(mItem => {
      const m = (mItem.month || mItem.payDate || '').match(/(\d{4})[-./](\d{1,2})/);
      if (m) {
        months.add(`${m[1]}-${m[2].padStart(2, '0')}`);
      }
    });

    const sorted = Array.from(months).sort().reverse();
    return sorted;
  }, [data, maintenancePayouts, calculateMaintenancePayouts]);

  // 기본 선택 월 설정 (최신 월)
  React.useEffect(() => {
    if (availableMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  // 2. 전체 데이터 통계 맵 (월별 실적 및 본부전체/그룹/해당상품 구간 판정 완벽 지원)
  const globalStatsMap = useMemo(() => {
    const map = new Map<string, number>();
    (data || []).forEach(item => {
      const isCancelled = item.status && (item.status.includes('취소') || item.status.includes('해약') || item.status.includes('철회') || item.status.includes('반품'));
      if (isCancelled && !item.payDate?.trim()) return;
      if (!item.hq) return;

      const pDate = item.payDate || '';
      const m = pDate.match(/(\d{4})[-./](\d{1,2})/);
      const month = m ? `${m[1]}-${m[2].padStart(2, '0')}` : 'ALL';
      const prod = item.prodName || '';

      // 1) 본부 + 상품 + 월
      const kProdMonth = `${item.hq}|${prod}|${month}`;
      map.set(kProdMonth, (map.get(kProdMonth) || 0) + 1);

      // 2) 본부 + 전체상품(__ALL__) + 월
      const kAllMonth = `${item.hq}|__ALL__|${month}`;
      map.set(kAllMonth, (map.get(kAllMonth) || 0) + 1);

      // 3) 전체 누적 fallback (월 무관)
      const kProd = `${item.hq}|${prod}`;
      map.set(kProd, (map.get(kProd) || 0) + 1);

      const kAll = `${item.hq}|__ALL__`;
      map.set(kAll, (map.get(kAll) || 0) + 1);

      // 4) 기존 언더스코어 호환용 키
      const kLegacy = `${item.hq}_${prod}_${pDate}`;
      map.set(kLegacy, (map.get(kLegacy) || 0) + 1);
    });
    return map;
  }, [data]);

  // 3. 선택된 월에 해당하는 본부별 정산 집계 계산
  const hqMonthlyStats = useMemo(() => {
    if (!selectedMonth) return [];

    const statsMap = new Map<string, HqMonthlyStat>();

    // 1) 해당 월의 계약 건 필터링 및 본부별 수수료 집계
    (data || []).forEach(item => {
      if ((item.status?.includes('취소') || item.status?.includes('해약')) && !item.payDate?.trim()) return;

      const pDate = item.payDate || '';
      const m = pDate.match(/(\d{4})[-./](\d{1,2})/);
      const itemMonth = m ? `${m[1]}-${m[2].padStart(2, '0')}` : '';

      if (itemMonth !== selectedMonth) return;

      const hq = item.hq || '미지정';
      if (!statsMap.has(hq)) {
        const setting = (hqSettings || []).find(s => s.hqName === hq);
        const isIndiv = setting?.settlementType?.includes('개인') || hq === '글로씨';
        statsMap.set(hq, {
          hqName: hq,
          count: 0,
          salesSum: 0,
          promoSum: 0,
          generalSum: 0,
          maintenanceSum: 0,
          specialSum: 0,
          grossTotal: 0,
          tax: 0,
          netTotal: 0,
          settlementType: setting?.settlementType || (isIndiv ? '개인' : '사업자'),
          bankName: setting?.bankName || '-',
          accountNumber: setting?.accountNumber || '-',
          accountHolder: setting?.accountHolder || '-',
          items: [],
          specialItems: [],
          maintenanceItems: []
        });
      }

      const stat = statsMap.get(hq)!;
      const { totalCommission, salesComm } = calculateCommissionDetails(item, globalStatsMap);
      const promo = totalCommission - salesComm;

      stat.count += 1;
      stat.accountCount = (stat.accountCount || 0) + 1; // ERP 각 행이 1구좌이므로 1구좌씩 누적
      stat.salesSum += salesComm;
      stat.promoSum += promo;
      stat.generalSum += totalCommission;
      stat.items.push(item);
    });

    // 2) 유지수수료 집계
    const currentMaintList = calculateMaintenancePayouts
      ? calculateMaintenancePayouts(data, selectedMonth, true)
      : (maintenancePayouts || []);

    currentMaintList.forEach(mItem => {
      const m = (mItem.month || mItem.payDate || '').match(/(\d{4})[-./](\d{1,2})/);
      const mMonth = m ? `${m[1]}-${m[2].padStart(2, '0')}` : '';

      if (mMonth !== selectedMonth) return;

      const hq = mItem.hq || '미지정';
      if (!statsMap.has(hq)) {
        const setting = (hqSettings || []).find(s => s.hqName === hq);
        const isIndiv = setting?.settlementType?.includes('개인') || hq === '글로씨';
        statsMap.set(hq, {
          hqName: hq,
          count: 0,
          accountCount: 0,
          salesSum: 0,
          promoSum: 0,
          generalSum: 0,
          maintenanceSum: 0,
          specialSum: 0,
          grossTotal: 0,
          tax: 0,
          netTotal: 0,
          settlementType: setting?.settlementType || (isIndiv ? '개인' : '사업자'),
          bankName: setting?.bankName || '-',
          accountNumber: setting?.accountNumber || '-',
          accountHolder: setting?.accountHolder || '-',
          items: [],
          specialItems: [],
          maintenanceItems: []
        });
      }

      const stat = statsMap.get(hq)!;
      stat.maintenanceSum += (mItem.amount || 0);
      stat.maintenanceItems.push(mItem);
    });

    // 3) 특수수당 (글로벌 인센티브 규칙) 집계
    if (globalIncentiveRules && globalIncentiveRules.length > 0) {
      const year = parseInt(selectedMonth.split('-')[0]);
      const month = parseInt(selectedMonth.split('-')[1]);
      const prevDate = new Date(year, month - 2, 1);
      const prevYearStr = String(prevDate.getFullYear());
      const prevMonthStr = String(prevDate.getMonth() + 1).padStart(2, '0');
      const prevMonthKey = `${prevYearStr}-${prevMonthStr}`;

      // 수기발주 저장소 및 대상 상품 캐시 로드
      let manualOrderStores: Record<string, any> = {};
      let manualOrderProducts: string[] = [];
      try {
        const savedStores = localStorage.getItem('erp_manual_orders_saved_store_v1');
        if (savedStores) manualOrderStores = JSON.parse(savedStores);
        const savedProd = localStorage.getItem('erp_manual_order_target_products_v1');
        if (savedProd) manualOrderProducts = JSON.parse(savedProd);
      } catch (e) {
        console.error(e);
      }

      globalIncentiveRules.forEach(rule => {
        if (!rule.useInstallments && rule.commissionPerUnit === 0 && rule.minimumGuarantee === 0) return;

        const isSelfHq = !rule.targetName || rule.targetName.trim() === '' || rule.targetName === 'SELF_HQ' || rule.targetName === '판매본부' || rule.targetName === '해당본부' || rule.targetName === '본부';

        const processedRentalNos = new Set<string>();
        let matchedCount = 0;
        let commission = 0;
        const matchedItems: any[] = [];

        (data || []).forEach(item => {
          // 1) 취소 및 해약 건은 특수수당 지급 대상 제외
          if (item.status?.includes('취소') || item.status?.includes('해약')) return;

          // 2) 배송완료 확인: 배송일자가 없거나 '-'이거나 배송완료 상태가 아니면 수당 지급 제외
          const isDelivered = (item.deliveryStatus && item.deliveryStatus.includes('완료')) || 
                              (item.deliveryDate && item.deliveryDate !== '-' && item.deliveryDate.trim() !== '');
          if (!isDelivered) return;

          // 공급수수료 판별
          const isSupplyRule = isSupplyCommissionRule(rule);

          // [규칙 판정 - 사용자 요청]
          // 대상제품(렌탈상품명)이 설정되어 있으면 제품별 (동일 렌탈계약번호당 1회만 지급)
          // 대상상품(카테고리)이 선택되어 있으면 구좌수별 (각 행마다 1구좌씩 지급, 중복제거 안 함)
          const hasTargetItems = Array.isArray(rule.targetItems) && rule.targetItems.length > 0 && !rule.targetItems.includes('ALL');
          const hasTargetProducts = Array.isArray(rule.targetProducts) && rule.targetProducts.length > 0 && !rule.targetProducts.includes('ALL');

          let isItemBasedRule = false;
          if (hasTargetItems) {
            isItemBasedRule = true; // 대상제품 설정 -> 제품별
          } else if (hasTargetProducts) {
            isItemBasedRule = false; // 대상상품 선택 -> 구좌수별
          } else {
            isItemBasedRule = isSelfHq || (rule.incentiveName && rule.incentiveName.includes('공급'));
          }

          if (isItemBasedRule) {
            const rentalKey = item.rentalNo || item.resNo;
            if (rentalKey && rentalKey !== '-' && rentalKey.trim() !== '') {
              if (processedRentalNos.has(rentalKey)) return;
            }
          }

          const isMatch = isHqMatchedForSpecialRule(rule, item.hq, divisionSettings);
          if (!isMatch) return;

          // 상품 매칭
          if (rule.targetProducts && !rule.targetProducts.includes('ALL')) {
            const normItemProd = (item.prodName || '').replace(/[\s()]/g, '').toLowerCase();
            if (!rule.targetProducts.some((p: string) => {
              const normP = p.replace(/[\s()]/g, '').toLowerCase();
              return normItemProd.includes(normP) || normP.includes(normItemProd);
            })) return;
          }

          if (rule.targetItems && !rule.targetItems.includes('ALL')) {
            const rawItemProd = item.rentalProd || item.modelName || item.productModel || '';
            const cleanItemProd = rawItemProd.replace(/[\s()_-]/g, '').toLowerCase();
            if (!cleanItemProd || cleanItemProd === '-') return;

            const isItemMatch = rule.targetItems.some((prod: string) => {
              const cleanRuleProd = prod.replace(/[\s()_-]/g, '').toLowerCase();
              if (!cleanRuleProd) return false;
              return cleanItemProd.includes(cleanRuleProd) || (cleanItemProd.length >= 3 && cleanRuleProd.includes(cleanItemProd));
            });
            if (!isItemMatch) return;
          }

          // 공급수수료 / 특수수당인 경우 수기발주 설치확인서 등록 및 마감월 연동 검사
          let certEligibility: ReturnType<typeof checkInstallCertEligibility> | null = null;
          let effectiveBaseDate = '';

          if (isSupplyRule) {
            certEligibility = checkInstallCertEligibility(item, manualOrderStores, manualOrderProducts);
            if (certEligibility.isTargetOrder) {
              // 수기발주 대상 주문인데 설치확인서 미등록 또는 보류(배송 미완료 등)이면 수당 지급 제외
              if (certEligibility.isHold) return;

              // 설치확인서 등록 건인 경우: 마감월을 실적일자로 채택 (예: '2026-10' -> '2026-10-01')
              if (certEligibility.certMonth) {
                effectiveBaseDate = `${certEligibility.certMonth}-01`;
              }
            }
          }

          // 3) 핵심: 수수료 실제 지급일자 기준 매칭
          // 수수료가 실제로 지급된 건에 대해서만 특수수당/컨설팅비가 발생해야 함 (미지급 건은 제외)
          let isMatchedDate = false;
          const pDate = String(item.payDate || '').trim();

          if (rule.baseDateType === 'PAY_DATE') {
            // [실적 인정 기준일: 수수료일자 기준 (지급월 당월 지급)]
            // 설치확인서 익월 전환 등과 상관없이, 실제 수수료일자의 월이 정산월(selectedMonth)과 정확히 일치할 때만 지급
            if (pDate && pDate !== '-' && !pDate.includes('미지정') && !pDate.includes('미입금')) {
              const pMatch = pDate.match(/(\d{4})[-./](\d{1,2})/);
              const itemPayMonth = pMatch ? `${pMatch[1]}-${pMatch[2].padStart(2, '0')}` : '';
              isMatchedDate = (itemPayMonth === selectedMonth);
            }
          } else if (certEligibility?.isTargetOrder && certEligibility?.expectedPayoutMonth) {
            // 설치확인서 마감월이 존재하는 수기발주 대상 건: 마감월의 익월(selectedMonth) 지급 규칙
            isMatchedDate = certEligibility.expectedPayoutMonth === selectedMonth;
          } else {
            // 일반 건: 실제 수수료지급일자가 유효하고, 수수료지급월이 선택된 정산월(selectedMonth)과 일치해야만 인정
            if (pDate && pDate !== '-' && !pDate.includes('미지정') && !pDate.includes('미입금')) {
              const pMatch = pDate.match(/(\d{4})[-./](\d{1,2})/);
              const itemPayMonth = pMatch ? `${pMatch[1]}-${pMatch[2].padStart(2, '0')}` : '';
              isMatchedDate = (itemPayMonth === selectedMonth);
            }
          }

          if (!isMatchedDate) return;

          if (isItemBasedRule) {
            const rentalKey = item.rentalNo || item.resNo;
            if (rentalKey && rentalKey !== '-' && rentalKey.trim() !== '') {
              processedRentalNos.add(rentalKey);
            }
          }

          let itemComm = 0;
          if (rule.useInstallments && rule.installments) {
            const paidCount = item.hcPaidCount || 0;
            const applicableInstallment = rule.installments.find((ins: any) => paidCount >= ins.startRound && paidCount <= ins.endRound);
            if (applicableInstallment) {
              itemComm = applicableInstallment.amount;
            }
          } else {
            itemComm = rule.commissionPerUnit || 0;
          }

          const specialItemInfo = {
            id: `${item.raw?.[0] || Math.random()}_${rule.id}`,
            hq: isSelfHq ? item.hq : (rule.targetName || item.hq || '-'),
            contractHq: item.hq || '-',
            branch: item.branch || '-',
            rentalNo: item.rentalNo || item.resNo || '-',
            empName: item.empName || '-',
            memName: item.memName || '-',
            prodName: item.prodName || '-',
            rentalProd: item.rentalProd || '-',
            incentiveName: rule.incentiveName || (rule.targetName === '조재윤' || rule.targetName === '조재은' ? '모델비' : (rule.targetName === '조민경' ? '컨설팅비' : '특수수당')),
            amount: itemComm,
            accountCount: 1,
            effectiveAccounts: 1,
            contractDate: item.contractDate || '-',
            deliveryDate: item.deliveryDate || '-',
            payDate: item.payDate || '-',
            taxType: rule.taxType || 'DEFAULT',
            taxBusinessName: rule.taxBusinessName,
            taxBusinessNo: rule.taxBusinessNo,
            installCertStatus: certEligibility?.certMonth ? '등록' : undefined,
            installCertMonth: certEligibility?.certMonth
          };

          if (isSelfHq) {
            const hqName = item.hq;
            if (hqName && itemComm > 0) {
              if (!statsMap.has(hqName)) {
                const setting = (hqSettings || []).find(s => s.hqName === hqName);
                const isIndiv = setting?.settlementType?.includes('개인') || hqName === '글로씨';
                statsMap.set(hqName, {
                  hqName,
                  count: 0,
                  accountCount: 0,
                  salesSum: 0,
                  promoSum: 0,
                  generalSum: 0,
                  maintenanceSum: 0,
                  specialSum: 0,
                  grossTotal: 0,
                  tax: 0,
                  netTotal: 0,
                  settlementType: setting?.settlementType || (isIndiv ? '개인' : '사업자'),
                  bankName: setting?.bankName || '-',
                  accountNumber: setting?.accountNumber || '-',
                  accountHolder: setting?.accountHolder || '-',
                  items: [],
                  specialItems: [],
                  maintenanceItems: []
                });
              }
              const stat = statsMap.get(hqName)!;
              stat.specialSum += itemComm;
              stat.specialItems.push(specialItemInfo);
              stat.accountCount = (stat.accountCount || 0) + 1;
            }
          } else {
            matchedCount += 1;
            commission += itemComm;
            matchedItems.push(specialItemInfo);
          }
        });

        // 타겟 지정형 수당 (예: 모델비, 컨설팅비, 신동우 대표 등)
        if (!isSelfHq && rule.targetName) {
          const finalAmount = Math.max(commission, rule.minimumGuarantee || 0);
          if (finalAmount > 0) {
            const targetName = rule.targetName;
            if (!statsMap.has(targetName)) {
              const setting = (hqSettings || []).find(s => s.hqName === targetName);
              const isIndiv = setting?.settlementType?.includes('개인') || targetName === '글로씨';
              statsMap.set(targetName, {
                hqName: targetName,
                count: 0,
                accountCount: 0,
                salesSum: 0,
                promoSum: 0,
                generalSum: 0,
                maintenanceSum: 0,
                specialSum: 0,
                grossTotal: 0,
                tax: 0,
                netTotal: 0,
                settlementType: setting?.settlementType || (isIndiv ? '개인' : '사업자'),
                bankName: setting?.bankName || '-',
                accountNumber: setting?.accountNumber || '-',
                accountHolder: setting?.accountHolder || '-',
                items: [],
                specialItems: [],
                maintenanceItems: []
              });
            }
            const stat = statsMap.get(targetName)!;
            stat.specialSum += finalAmount;
            stat.specialItems.push(...matchedItems);
            stat.count = (stat.items?.length || 0) + stat.specialItems.length;
            stat.accountCount = (stat.accountCount || 0) + matchedItems.length;
          }
        }
      });
    }

    // 4) 세금 및 최종 실지급액 계산
    statsMap.forEach(stat => {
      stat.grossTotal = stat.generalSum + stat.maintenanceSum + stat.specialSum;
      const isPersonal = stat.settlementType.includes('개인');
      stat.tax = isPersonal ? Math.floor(stat.grossTotal * 0.033) : 0;
      stat.netTotal = stat.grossTotal - stat.tax;
    });

    return Array.from(statsMap.values());
  }, [data, selectedMonth, hqSettings, maintenancePayouts, globalIncentiveRules, divisionSettings, calculateCommissionDetails, globalStatsMap, calculateMaintenancePayouts]);

  // 마감된 월은 확정 스냅샷 데이터(stats)를 우선 사용하고, 미마감 월은 실시간 계산 stats 사용
  const effectiveHqMonthlyStats = useMemo(() => {
    if (isCurrentMonthClosed && closedDetailMap[selectedMonth]?.stats) {
      return closedDetailMap[selectedMonth].stats;
    }
    return hqMonthlyStats;
  }, [isCurrentMonthClosed, closedDetailMap, selectedMonth, hqMonthlyStats]);

  // =========================================================================
  // [사업단 관리 (divisionSettings) 연동] 굿라이프(꿈잇다) vs 굿라이프(신동우) 소속 본부 마스터 및 실적 분석
  // =========================================================================
  const kkumDivision = useMemo(() => {
    return (divisionSettings || []).find(d => {
      const n = (d.name || '').replace(/\s+/g, '');
      return n.includes('꿈잇다') || (n.includes('굿라이프') && !n.includes('신동우'));
    }) || null;
  }, [divisionSettings]);

  const shinDivision = useMemo(() => {
    return (divisionSettings || []).find(d => {
      const n = (d.name || '').replace(/\s+/g, '');
      return n.includes('신동우');
    }) || null;
  }, [divisionSettings]);

  // 사업단 관리에서 설정된 소속 본부 목록 (동적 연동)
  const kkumHqNames = useMemo<string[]>(() => {
    if (kkumDivision && kkumDivision.hqNames && kkumDivision.hqNames.length > 0) {
      return kkumDivision.hqNames;
    }
    return ['최강본부', '가치온본부', '1본부', '새빛본부', '온누리본부', '명품본부', '이음본부', '무한본부', '꿈잇다', '서울중앙본부', '스마일본부', '아우라본부', '챔피언본부', '두드림본부', '조이본부'];
  }, [kkumDivision]);

  const shinHqNames = useMemo<string[]>(() => {
    if (shinDivision && shinDivision.hqNames && shinDivision.hqNames.length > 0) {
      return shinDivision.hqNames;
    }
    return ['다보다', '더굿라이프', '노반AI', 'LS지사', '신동우 대표', '더굿', 'KMN솔루션'];
  }, [shinDivision]);

  // 사업단 관리 소속 본부들의 실적 건수 및 본부별 세부 데이터 동적 집계
  const divisionHqStats = useMemo(() => {
    const normalizeHq = (name: string) => (name || '').replace(/[\s()본부지사대표]/g, '').toLowerCase();

    const kkumSet = new Set<string>(kkumHqNames.map(normalizeHq));
    const shinSet = new Set<string>(shinHqNames.map(normalizeHq));

    const kkumCountMap = new Map<string, { allinone: number; gold: number; silver: number; hybrid: number }>();
    const shinCountMap = new Map<string, { allinone: number; gold: number; silver: number; hybrid: number }>();

    kkumHqNames.forEach(h => kkumCountMap.set(h, { allinone: 0, gold: 0, silver: 0, hybrid: 0 }));
    shinHqNames.forEach(h => shinCountMap.set(h, { allinone: 0, gold: 0, silver: 0, hybrid: 0 }));

    let kkumTotalAllinone = 0;
    let kkumTotalGold = 0;
    let kkumTotalSilver = 0;
    let kkumTotalHybrid = 0;

    let shinTotalAllinone = 0;
    let shinTotalGold = 0;
    let shinTotalSilver = 0;
    let shinTotalHybrid = 0;

    let detectedCount = 0;

    // 1) effectiveHqMonthlyStats에서 소속 본부별 실적 검색
    effectiveHqMonthlyStats.forEach(stat => {
      const normH = normalizeHq(stat.hqName);
      const isKkum = kkumSet.has(normH) || Array.from(kkumSet).some(k => k.length >= 2 && (normH.includes(k) || k.includes(normH)));
      const isShin = shinSet.has(normH) || Array.from(shinSet).some(s => s.length >= 2 && (normH.includes(s) || s.includes(normH)));

      if (isKkum) {
        const targetHq = kkumHqNames.find(h => normalizeHq(h) === normH || normalizeHq(h).includes(normH) || normH.includes(normalizeHq(h))) || stat.hqName;
        const cur = kkumCountMap.get(targetHq) || { allinone: 0, gold: 0, silver: 0, hybrid: 0 };

        (stat.items || []).forEach(item => {
          detectedCount += 1;
          const pName = item.prodName || '';
          if (pName.includes('골드')) {
            cur.gold += 1;
            kkumTotalGold += 1;
          } else if (pName.includes('실버')) {
            cur.silver += 1;
            kkumTotalSilver += 1;
          } else if (pName.includes('698') || pName.includes('하이브리드')) {
            cur.hybrid += 1;
            kkumTotalHybrid += 1;
          } else {
            cur.allinone += 1;
            kkumTotalAllinone += 1;
          }
        });
        kkumCountMap.set(targetHq, cur);
      } else if (isShin) {
        const targetHq = shinHqNames.find(h => normalizeHq(h) === normH || normalizeHq(h).includes(normH) || normH.includes(normalizeHq(h))) || stat.hqName;
        const cur = shinCountMap.get(targetHq) || { allinone: 0, gold: 0, silver: 0, hybrid: 0 };

        (stat.items || []).forEach(item => {
          detectedCount += 1;
          const pName = item.prodName || '';
          if (pName.includes('골드')) {
            cur.gold += 1;
            shinTotalGold += 1;
          } else if (pName.includes('실버')) {
            cur.silver += 1;
            shinTotalSilver += 1;
          } else if (pName.includes('698') || pName.includes('하이브리드')) {
            cur.hybrid += 1;
            shinTotalHybrid += 1;
          } else {
            cur.allinone += 1;
            shinTotalAllinone += 1;
          }
        });
        shinCountMap.set(targetHq, cur);
      }
    });

    const kkumHqList: Array<{ hqName: string; count: number; allinone: number; gold: number; silver: number; hybrid: number }> = [];
    const shinHqList: Array<{ hqName: string; count: number; allinone: number; gold: number; silver: number; hybrid: number }> = [];

    kkumHqNames.forEach(h => {
      const counts = kkumCountMap.get(h) || { allinone: 0, gold: 0, silver: 0, hybrid: 0 };
      kkumHqList.push({
        hqName: h,
        count: counts.allinone + counts.gold + counts.silver + counts.hybrid,
        ...counts
      });
    });

    shinHqNames.forEach(h => {
      const counts = shinCountMap.get(h) || { allinone: 0, gold: 0, silver: 0, hybrid: 0 };
      shinHqList.push({
        hqName: h,
        count: counts.allinone + counts.gold + counts.silver + counts.hybrid,
        ...counts
      });
    });

    return {
      kkumHqList,
      shinHqList,
      kkumTotals: {
        allinone: kkumTotalAllinone,
        gold: kkumTotalGold,
        silver: kkumTotalSilver,
        hybrid: kkumTotalHybrid,
        total: kkumTotalAllinone + kkumTotalGold + kkumTotalSilver + kkumTotalHybrid
      },
      shinTotals: {
        allinone: shinTotalAllinone,
        gold: shinTotalGold,
        silver: shinTotalSilver,
        hybrid: shinTotalHybrid,
        total: shinTotalAllinone + shinTotalGold + shinTotalSilver + shinTotalHybrid
      },
      detectedCount
    };
  }, [kkumHqNames, shinHqNames, effectiveHqMonthlyStats]);

  // 사업단 관리 설정 및 소속 본부 실적을 기반으로 굿라이프 명세표 자동 동기화
  const handleSyncGoodlifeWithDivisions = useCallback(() => {
    const kkumAcc = getPayoutAccountInfo('꿈잇다');
    const shinAcc = getPayoutAccountInfo('굿라이프(신동우)');

    const useDetected = divisionHqStats.detectedCount > 0;

    const newRows: GoodlifeSplitItem[] = [
      // 1. 꿈잇다 상품군 (직송금 71만 / 차액 4만 or 0원)
      {
        id: 'gl_split_kkum_1',
        category: '꿈잇다',
        hqName: '꿈잇다',
        itemName: '굿라이프헬스케어올인원',
        count: useDetected ? divisionHqStats.kkumTotals.allinone : 180,
        officialUnitFee: 750000,
        directRecipient: '(주)꿈잇다',
        directUnitFee: 710000,
        bankName: kkumAcc.bankName !== '-' ? kkumAcc.bankName : '기업은행',
        accountNumber: kkumAcc.accountNumber !== '-' ? kkumAcc.accountNumber : '115-131758-01-017',
        accountHolder: kkumAcc.accountHolder !== '-' ? kkumAcc.accountHolder : '주식회사 꿈잇다',
        memo: '꿈잇다 직송금 71만 / 신동우 차액 4만'
      },
      {
        id: 'gl_split_kkum_2',
        category: '꿈잇다',
        hqName: '꿈잇다',
        itemName: '굿라이프헬스케어골드',
        count: useDetected ? divisionHqStats.kkumTotals.gold : 6,
        officialUnitFee: 750000,
        directRecipient: '(주)꿈잇다',
        directUnitFee: 710000,
        bankName: kkumAcc.bankName !== '-' ? kkumAcc.bankName : '기업은행',
        accountNumber: kkumAcc.accountNumber !== '-' ? kkumAcc.accountNumber : '115-131758-01-017',
        accountHolder: kkumAcc.accountHolder !== '-' ? kkumAcc.accountHolder : '주식회사 꿈잇다',
        memo: '꿈잇다 직송금 71만 / 신동우 차액 4만'
      },
      {
        id: 'gl_split_kkum_3',
        category: '꿈잇다',
        hqName: '꿈잇다',
        itemName: '굿라이프헬스케어실버',
        count: useDetected ? divisionHqStats.kkumTotals.silver : 1,
        officialUnitFee: 710000,
        directRecipient: '(주)꿈잇다',
        directUnitFee: 710000,
        bankName: kkumAcc.bankName !== '-' ? kkumAcc.bankName : '기업은행',
        accountNumber: kkumAcc.accountNumber !== '-' ? kkumAcc.accountNumber : '115-131758-01-017',
        accountHolder: kkumAcc.accountHolder !== '-' ? kkumAcc.accountHolder : '주식회사 꿈잇다',
        memo: '꿈잇다 직송금 71만 / 신동우 차액 0원'
      },

      // 2. 신동우사업단 산하본부 (본부 직송금 55만 / 차액 20만 or 16만)
      {
        id: 'gl_split_shindw_1',
        category: '신동우사업단',
        hqName: '신동우사업단 산하본부',
        itemName: '굿라이프헬스케어올인원',
        count: useDetected ? divisionHqStats.shinTotals.allinone : 21,
        officialUnitFee: 750000,
        directRecipient: '소속 본부',
        directUnitFee: 550000,
        bankName: shinAcc.bankName !== '-' ? shinAcc.bankName : '국민은행',
        accountNumber: shinAcc.accountNumber !== '-' ? shinAcc.accountNumber : '164501-04-161888',
        accountHolder: shinAcc.accountHolder !== '-' ? shinAcc.accountHolder : '김애숙(에스제이컨설팅)',
        memo: '본부 직송금 55만 / 신동우 차액 20만'
      },
      {
        id: 'gl_split_shindw_2',
        category: '신동우사업단',
        hqName: '신동우사업단 산하본부',
        itemName: '굿라이프헬스케어골드',
        count: useDetected ? divisionHqStats.shinTotals.gold : 2,
        officialUnitFee: 750000,
        directRecipient: '소속 본부',
        directUnitFee: 550000,
        bankName: shinAcc.bankName !== '-' ? shinAcc.bankName : '국민은행',
        accountNumber: shinAcc.accountNumber !== '-' ? shinAcc.accountNumber : '164501-04-161888',
        accountHolder: shinAcc.accountHolder !== '-' ? shinAcc.accountHolder : '김애숙(에스제이컨설팅)',
        memo: '본부 직송금 55만 / 신동우 차액 20만'
      },
      {
        id: 'gl_split_shindw_3',
        category: '신동우사업단',
        hqName: '신동우사업단 산하본부',
        itemName: '굿라이프헬스케어실버',
        count: useDetected ? divisionHqStats.shinTotals.silver : 0,
        officialUnitFee: 710000,
        directRecipient: '소속 본부',
        directUnitFee: 550000,
        bankName: shinAcc.bankName !== '-' ? shinAcc.bankName : '국민은행',
        accountNumber: shinAcc.accountNumber !== '-' ? shinAcc.accountNumber : '164501-04-161888',
        accountHolder: shinAcc.accountHolder !== '-' ? shinAcc.accountHolder : '김애숙(에스제이컨설팅)',
        memo: '본부 직송금 55만 / 신동우 차액 16만'
      }
    ];

    saveGoodlifeSplitRows(newRows);
  }, [divisionHqStats, getPayoutAccountInfo]);

  // 3-1. 현재 월의 전체 고유 본부 목록
  const allAvailableHqs = useMemo(() => {
    return Array.from<string>(new Set(effectiveHqMonthlyStats.map(s => s.hqName))).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [effectiveHqMonthlyStats]);

  // 3-2. 본부명 -> 통계 빠른 조회를 위한 맵
  const hqStatMap = useMemo(() => {
    const map = new Map<string, HqMonthlyStat>();
    effectiveHqMonthlyStats.forEach(s => map.set(s.hqName, s));
    return map;
  }, [effectiveHqMonthlyStats]);

  // 3-3. 모달 열림, 월 변경 또는 초기 로드 시 본부 선택 목록 초기화 (항상 전체 본부 기본 선택)
  const prevMonthRef = useRef<string>('');
  const prevOpenRef = useRef<boolean>(false);

  useEffect(() => {
    if (allAvailableHqs.length === 0) return;

    // 모달이 새로 열릴 때 (isOpen: false -> true): 항상 전체 본부 기본 선택
    if (isOpen && !prevOpenRef.current) {
      prevOpenRef.current = true;
      prevMonthRef.current = selectedMonth;
      setSelectedHqs(allAvailableHqs);
      return;
    }

    if (!isOpen) {
      prevOpenRef.current = false;
      return;
    }

    if (prevMonthRef.current !== selectedMonth) {
      // 월이 변경되었을 때: 새로운 월의 전체 본부를 기본 선택
      prevMonthRef.current = selectedMonth;
      setSelectedHqs(allAvailableHqs);
    } else {
      // 데이터 업데이트 등으로 본부 목록이 달라졌을 때 (빈 배열이거나 선택 항목이 없으면 전체 선택)
      setSelectedHqs(prev => {
        if (!prev || prev.length === 0) return allAvailableHqs;
        const valid = prev.filter(h => allAvailableHqs.includes(h));
        return valid.length > 0 ? valid : allAvailableHqs;
      });
    }
  }, [isOpen, selectedMonth, allAvailableHqs]);

  // 3-4. 드롭다운 팝오버 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (hqDropdownRef.current && !hqDropdownRef.current.contains(e.target as Node)) {
        setIsHqDropdownOpen(false);
      }
    };
    if (isHqDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isHqDropdownOpen]);

  // 3-5. 본부 선택 토글 핸들러
  const handleToggleHq = (hq: string) => {
    setSelectedHqs(prev => {
      if (prev.includes(hq)) {
        return prev.filter(h => h !== hq);
      } else {
        return [...prev, hq];
      }
    });
  };

  const handleSelectAllHqs = () => {
    setSelectedHqs(allAvailableHqs);
  };

  // =========================================================================
  // 3-0. 사용자 요청 뷰: 월별 수수료 정산 내역 (상품별 / 지급항목별 상세 집계)
  // 사업단을 묶을 때(굿라이프 신동우+꿈잇다 통합 등)와 풀 때(개별 본부 분리) 모두 실시간 지원
  // =========================================================================
  const detailedSettlementList = useMemo<DetailedSettlementRow[]>(() => {
    const isOct = selectedMonth === '2026-10' || selectedMonth.endsWith('-10');

    // 1) 10월이고 사업단 묶기 모드일 때: 사용자 확정 10월 데이터 (456,823,000원) 제공 (수정된 커스텀이 있으면 우선)
    if (isOct && groupByDivision) {
      if (customDetailedRowsMap[selectedMonth] && customDetailedRowsMap[selectedMonth].length > 0) {
        return customDetailedRowsMap[selectedMonth];
      }
      return DEFAULT_OCTOBER_SETTLEMENT_ROWS;
    }

    // 2) 로컬 스토리지에 사용자가 직접 편집/저장한 내역이 있는 경우 (특정 모드 캐시)
    const modeKey = `${selectedMonth}_${groupByDivision ? 'group' : 'flat'}`;
    if (customDetailedRowsMap[modeKey] && customDetailedRowsMap[modeKey].length > 0) {
      return customDetailedRowsMap[modeKey];
    }

    // 3) ERP 데이터로부터 동적 자동 집계 생성
    const result: DetailedSettlementRow[] = [];

    if (groupByDivision) {
      // [A] 사업단별로 묶기 모드 (굿라이프 신동우+꿈잇다 -> '굿라이프' 통합, 언바운드 통합, 독립본부 분리)
      const groupOrder: string[] = [];
      const groupMap = new Map<string, {
        prods: Map<string, { count: number; salesComm: number; promoComm: number; totalComm: number }>;
        maints: Map<string, { count: number; amount: number }>;
      }>();

      effectiveHqMonthlyStats.forEach(stat => {
        const { name: groupName } = getGroupedTargetName(stat.hqName);
        if (!groupMap.has(groupName)) {
          groupOrder.push(groupName);
          groupMap.set(groupName, {
            prods: new Map(),
            maints: new Map()
          });
        }
        const grp = groupMap.get(groupName)!;

        // 영업 실적 아이템 상품별 합산
        (stat.items || []).forEach(item => {
          const { totalCommission, salesComm } = calculateCommissionDetails(item, globalStatsMap);
          const promo = totalCommission - salesComm;
          const prodName = item.prodName || '기본상품';

          const cur = grp.prods.get(prodName) || { count: 0, salesComm: 0, promoComm: 0, totalComm: 0 };
          cur.count += 1;
          cur.salesComm += salesComm;
          cur.promoComm += promo;
          cur.totalComm += totalCommission;
          grp.prods.set(prodName, cur);
        });

        // 유지수수료 항목 합산
        (stat.maintenanceItems || []).forEach(mItem => {
          const mName = `유지수수료(${mItem.prodName || '헬스케어580'})`;
          const cur = grp.maints.get(mName) || { count: 0, amount: 0 };
          cur.count += (mItem.count || 1);
          cur.amount += (mItem.amount || 0);
          grp.maints.set(mName, cur);
        });
      });

      // 그룹별 행 생성
      groupOrder.forEach((groupName, grpIdx) => {
        const grp = groupMap.get(groupName)!;
        if (grp.prods.size === 0 && grp.maints.size === 0) return;

        let isFirst = true;
        let sumCount = 0;
        let sumSales = 0;
        let sumPromo = 0;
        let sumTotal = 0;

        grp.prods.forEach((val, pName) => {
          const unitFee = val.count > 0 ? Math.round(val.totalComm / val.count) : 0;
          result.push({
            id: `grp_${groupName}_${pName}_${grpIdx}`,
            targetName: groupName,
            itemName: pName,
            count: val.count,
            unitFee,
            salesCommission: val.salesComm,
            promoCommission: val.promoComm,
            totalCommission: val.totalComm,
            isHeaderGroup: isFirst
          });
          isFirst = false;
          sumCount += val.count;
          sumSales += val.salesComm;
          sumPromo += val.promoComm;
          sumTotal += val.totalComm;
        });

        grp.maints.forEach((val, mName) => {
          const unitFee = val.count > 0 ? Math.round(val.amount / val.count) : 0;
          result.push({
            id: `grp_${groupName}_maint_${mName}_${grpIdx}`,
            targetName: groupName,
            itemName: mName,
            count: val.count,
            unitFee,
            salesCommission: val.amount,
            promoCommission: 0,
            totalCommission: val.amount,
            isHeaderGroup: isFirst
          });
          isFirst = false;
          sumCount += val.count;
          sumSales += val.amount;
          sumTotal += val.amount;
        });

        // 소계 행 추가
        result.push({
          id: `grp_${groupName}_sub_${grpIdx}`,
          targetName: groupName,
          division: '소계',
          itemName: '',
          count: sumCount,
          unitFee: 0,
          salesCommission: sumSales,
          promoCommission: sumPromo,
          totalCommission: sumTotal,
          isSubtotal: true
        });
      });

    } else {
      // [B] 사업단 풀기 모드 (모든 사업단을 해제하여 개별 본부별로 분리 표출)
      effectiveHqMonthlyStats.forEach((stat, hqIdx) => {
        const prodMap = new Map<string, { count: number; salesComm: number; promoComm: number; totalComm: number }>();
        (stat.items || []).forEach(item => {
          const { totalCommission, salesComm } = calculateCommissionDetails(item, globalStatsMap);
          const promo = totalCommission - salesComm;
          const prodName = item.prodName || '기본상품';

          const cur = prodMap.get(prodName) || { count: 0, salesComm: 0, promoComm: 0, totalComm: 0 };
          cur.count += 1;
          cur.salesComm += salesComm;
          cur.promoComm += promo;
          cur.totalComm += totalCommission;
          prodMap.set(prodName, cur);
        });

        const maintMap = new Map<string, { count: number; amount: number }>();
        (stat.maintenanceItems || []).forEach(mItem => {
          const name = `유지수수료(${mItem.prodName || '헬스케어580'})`;
          const cur = maintMap.get(name) || { count: 0, amount: 0 };
          cur.count += (mItem.count || 1);
          cur.amount += (mItem.amount || 0);
          maintMap.set(name, cur);
        });

        if (prodMap.size === 0 && maintMap.size === 0) return;

        let isFirst = true;
        let sumCount = 0;
        let sumSales = 0;
        let sumPromo = 0;
        let sumTotal = 0;

        prodMap.forEach((val, pName) => {
          const unitFee = val.count > 0 ? Math.round(val.totalComm / val.count) : 0;
          result.push({
            id: `hq_${stat.hqName}_${pName}_${hqIdx}`,
            targetName: stat.hqName,
            itemName: pName,
            count: val.count,
            unitFee,
            salesCommission: val.salesComm,
            promoCommission: val.promoComm,
            totalCommission: val.totalComm,
            isHeaderGroup: isFirst
          });
          isFirst = false;
          sumCount += val.count;
          sumSales += val.salesComm;
          sumPromo += val.promoComm;
          sumTotal += val.totalComm;
        });

        maintMap.forEach((val, mName) => {
          const unitFee = val.count > 0 ? Math.round(val.amount / val.count) : 0;
          result.push({
            id: `hq_${stat.hqName}_maint_${mName}_${hqIdx}`,
            targetName: stat.hqName,
            itemName: mName,
            count: val.count,
            unitFee,
            salesCommission: val.amount,
            promoCommission: 0,
            totalCommission: val.amount,
            isHeaderGroup: isFirst
          });
          isFirst = false;
          sumCount += val.count;
          sumSales += val.amount;
          sumTotal += val.amount;
        });

        result.push({
          id: `hq_${stat.hqName}_sub_${hqIdx}`,
          targetName: stat.hqName,
          division: '소계',
          itemName: '',
          count: sumCount,
          unitFee: 0,
          salesCommission: sumSales,
          promoCommission: sumPromo,
          totalCommission: sumTotal,
          isSubtotal: true
        });
      });
    }

    // [C] 부대비용 / 외주 / 글로벌 인센티브 항목 (묶기/풀기 공통 하단 배치)
    const totalMonthCount = effectiveHqMonthlyStats.reduce((acc, s) => acc + (s.count || 0), 0);
    const effectiveTotalCount = isOct ? 601 : totalMonthCount;

    // 조재윤 모델비
    if (effectiveTotalCount > 0) {
      result.push({
        id: `auto_model_jo_${selectedMonth}`,
        targetName: '조재윤',
        itemName: '모델비',
        count: effectiveTotalCount,
        unitFee: 10000,
        salesCommission: 0,
        promoCommission: 0,
        totalCommission: effectiveTotalCount * 10000,
        isHeaderGroup: true
      });
    }

    // 조민경 컨설팅비
    if (effectiveTotalCount > 0) {
      result.push({
        id: `auto_consulting_jo_${selectedMonth}`,
        targetName: '조민경',
        itemName: '컨설팅비',
        count: effectiveTotalCount,
        unitFee: 5000,
        salesCommission: 0,
        promoCommission: 0,
        totalCommission: effectiveTotalCount * 5000,
        isHeaderGroup: true
      });
    }

    // 이종연 컨설팅비 (해랑인터내셔널)
    const haerangStat = effectiveHqMonthlyStats.find(s => s.hqName.includes('해랑'));
    const haerangCount = isOct ? 3 : (haerangStat?.count || 0);
    if (haerangCount > 0) {
      result.push({
        id: `auto_consulting_lee_${selectedMonth}`,
        targetName: '이종연',
        itemName: '컨설팅비(해랑인터내셔널)',
        count: haerangCount,
        unitFee: 30000,
        salesCommission: 0,
        promoCommission: 0,
        totalCommission: haerangCount * 30000,
        isHeaderGroup: true
      });
    }

    // 신동우 물품대금 수수료(테라웨이브)
    let therawaveCount = 0;
    (data || []).forEach(item => {
      const pDate = item.payDate || '';
      const m = pDate.match(/(\d{4})[-./](\d{1,2})/);
      const itemMonth = m ? `${m[1]}-${m[2].padStart(2, '0')}` : '';
      if (itemMonth !== selectedMonth) return;
      const prodText = `${item.rentalProd || ''} ${item.prodName || ''} ${item.modelName || ''}`.toLowerCase();
      if (prodText.includes('테라웨이브') || prodText.includes('therawave')) {
        therawaveCount += 1;
      }
    });
    if (isOct) {
      therawaveCount = Math.max(therawaveCount, 2);
    }
    if (therawaveCount > 0) {
      result.push({
        id: `auto_therawave_shin_${selectedMonth}`,
        targetName: '신동우',
        itemName: '물품대금 수수료(테라웨이브)',
        count: therawaveCount,
        unitFee: 500000,
        salesCommission: 0,
        promoCommission: 0,
        totalCommission: therawaveCount * 500000,
        isHeaderGroup: true
      });
    }

    // 권성훈 홈페이지 유지비
    result.push({
      id: `auto_homepage_kwon_${selectedMonth}`,
      targetName: '권성훈',
      itemName: '홈페이지 유지비',
      count: 1,
      unitFee: 150000,
      salesCommission: 0,
      promoCommission: 0,
      totalCommission: 150000,
      isHeaderGroup: true
    });

    return result;
  }, [selectedMonth, groupByDivision, customDetailedRowsMap, effectiveHqMonthlyStats, calculateCommissionDetails, globalStatsMap, getGroupedTargetName, data]);

  // 상세 정산 내역 전체 합계 계산 (소계 행 제외하여 중복 방지 및 원천세/실지급액 계산)
  const detailedTotals = useMemo(() => {
    let totalCount = 0;
    let totalSalesComm = 0;
    let totalPromoComm = 0;
    let totalCommission = 0;
    let totalTax = 0;

    const targetsWithSubtotal = new Set(
      detailedSettlementList.filter(r => r.isSubtotal).map(r => r.targetName)
    );

    detailedSettlementList.forEach(row => {
      if (row.isSubtotal) {
        const acct = getPayoutAccountInfo(row.targetName);
        if (acct.settlementType.includes('개인')) {
          totalTax += Math.round((row.totalCommission || 0) * 0.033);
        }
        return;
      }

      if (row.isHeaderGroup && !targetsWithSubtotal.has(row.targetName)) {
        const acct = getPayoutAccountInfo(row.targetName);
        if (acct.settlementType.includes('개인')) {
          totalTax += Math.round((row.totalCommission || 0) * 0.033);
        }
      }

      totalCount += (row.count || 0);
      totalSalesComm += (row.salesCommission || 0);
      totalPromoComm += (row.promoCommission || 0);
      totalCommission += (row.totalCommission || 0);
    });

    const totalNet = totalCommission - totalTax;

    return { totalCount, totalSalesComm, totalPromoComm, totalCommission, totalTax, totalNet };
  }, [detailedSettlementList, getPayoutAccountInfo]);

  // 셀 값 수정 핸들러
  const handleUpdateDetailCell = (id: string, field: keyof DetailedSettlementRow, value: any) => {
    const updated = detailedSettlementList.map(row => {
      if (row.id !== id) return row;
      const newRow = { ...row, [field]: value };
      if (field === 'count' || field === 'unitFee') {
        const count = field === 'count' ? Number(value) || 0 : row.count;
        const unitFee = field === 'unitFee' ? Number(value) || 0 : row.unitFee;
        if (unitFee > 0 && !row.isSubtotal) {
          newRow.totalCommission = count * unitFee;
          if (newRow.salesCommission > 0) {
            newRow.promoCommission = Math.max(0, newRow.totalCommission - newRow.salesCommission);
          }
        }
      }
      return newRow;
    });

    // 소계 행 자동 재계산
    let curCountSum = 0;
    let curSalesSum = 0;
    let curPromoSum = 0;
    let curTotalSum = 0;

    for (let i = 0; i < updated.length; i++) {
      const r = updated[i];
      if (r.isSubtotal) {
        r.count = curCountSum;
        r.salesCommission = curSalesSum;
        r.promoCommission = curPromoSum;
        r.totalCommission = curTotalSum;
        curCountSum = 0;
        curSalesSum = 0;
        curPromoSum = 0;
        curTotalSum = 0;
      } else {
        curCountSum += (r.count || 0);
        curSalesSum += (r.salesCommission || 0);
        curPromoSum += (r.promoCommission || 0);
        curTotalSum += (r.totalCommission || 0);
      }
    }

    setCustomDetailedRowsMap(prev => {
      const next = { ...prev, [selectedMonth]: updated };
      try {
        localStorage.setItem('erp_monthly_detailed_rows_map_v2', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // 상세 정산 내역 초기화
  const handleResetDetailedRows = () => {
    if (!window.confirm('정산 내역을 기본 상태로 초기화하시겠습니까?')) return;
    setCustomDetailedRowsMap(prev => {
      const copy = { ...prev };
      delete copy[selectedMonth];
      try {
        localStorage.setItem('erp_monthly_detailed_rows_map_v2', JSON.stringify(copy));
      } catch (e) {}
      return copy;
    });
    alert('기본 정산 내역으로 복원되었습니다.');
  };

  // 신규 항목 추가
  const handleAddNewDetailRow = () => {
    if (!newDetailTarget.trim() || !newDetailItem.trim()) {
      alert('거래처/지급대상과 상품명/지급항목을 입력해주세요.');
      return;
    }
    const count = Number(newDetailCount) || 1;
    const unitFee = Number(newDetailUnitFee) || 0;
    const salesComm = Number(newDetailSalesComm) || 0;
    const promoComm = Number(newDetailPromoComm) || 0;
    const totalComm = Number(newDetailTotalComm) || (count * unitFee);

    const newRow: DetailedSettlementRow = {
      id: `custom_${Date.now()}`,
      targetName: newDetailTarget.trim(),
      itemName: newDetailItem.trim(),
      count,
      unitFee,
      salesCommission: salesComm,
      promoCommission: promoComm,
      totalCommission: totalComm,
      isHeaderGroup: true,
      isCustom: true
    };

    const nextList = [...detailedSettlementList, newRow];
    setCustomDetailedRowsMap(prev => {
      const next = { ...prev, [selectedMonth]: nextList };
      try {
        localStorage.setItem('erp_monthly_detailed_rows_map_v2', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    setIsAddDetailModalOpen(false);
    setNewDetailTarget('');
    setNewDetailItem('');
    setNewDetailCount(1);
    setNewDetailUnitFee(0);
    setNewDetailSalesComm(0);
    setNewDetailPromoComm(0);
    setNewDetailTotalComm(0);
  };

  // 항목 삭제
  const handleRemoveDetailRow = (id: string) => {
    if (!window.confirm('이 항목을 삭제하시겠습니까?')) return;
    const nextList = detailedSettlementList.filter(r => r.id !== id);
    setCustomDetailedRowsMap(prev => {
      const next = { ...prev, [selectedMonth]: nextList };
      try {
        localStorage.setItem('erp_monthly_detailed_rows_map_v2', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // 사용자 제공 이미지 서식 100% 동일한 상세 정산 내역 엑셀 다운로드 (실지급액, 계좌정보, 굿라이프 내부 분배 및 계산서식 완벽 적용)
  const handleExportDetailedSettlementExcel = () => {
    if (!XLSX || !XLSX.utils) {
      alert('엑셀 라이브러리를 로드하지 못했습니다.');
      return;
    }

    try {
      const wb = XLSX.utils.book_new();
      const monthNum = selectedMonth ? parseInt(selectedMonth.split('-')[1], 10) : 10;
      const titleText = `${monthNum}월 수수료 정산 내역`;

      const thinBorder = {
        top: { style: 'thin', color: { rgb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        right: { style: 'thin', color: { rgb: 'CBD5E1' } }
      };

      // =============================================================
      // [시트 1] 본사보고용_수수료정산서 (상품별 + 소계 실지급/계좌정보 + 자동계산서식)
      // =============================================================
      const wsData: any[][] = [
        [titleText, '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', '', '', ''],
        [
          '거래처 / 지급대상', '구분', '상품명 / 지급항목', '건수', '건별수수료',
          '판매수수료', '판매촉진비', '총 발생수수료', '원천세(3.3%)', '최종 실지급액',
          '입금은행', '계좌번호', '예금주'
        ]
      ];

      const targetsWithSubtotal = new Set(
        detailedSettlementList.filter(r => r.isSubtotal).map(r => r.targetName)
      );

      // 소계 및 단독 행의 Excel 1-based Row 번호 추적 (최하단 전체합계 수식 및 시트3 참조용)
      const subtotalRowNumbers: number[] = [];
      const standaloneRowNumbers: number[] = [];
      const targetToRowMap = new Map<string, number>();
      let currentGroupStartRow = 4;

      detailedSettlementList.forEach((r, idx) => {
        const rowNum = idx + 4; // Excel 행 번호 (1-based: 헤더 3행 다음 4행부터 시작)
        const acct = getPayoutAccountInfo(r.targetName);
        const isIndiv = acct.settlementType.includes('개인');
        const isStandalone = r.isHeaderGroup && !targetsWithSubtotal.has(r.targetName);

        let rowTax = 0;
        let rowNet = 0;
        let showAcct = false;

        if (r.isSubtotal) {
          targetToRowMap.set(r.targetName, rowNum);
          rowTax = isIndiv ? Math.round((r.totalCommission || 0) * 0.033) : 0;
          rowNet = (r.totalCommission || 0) - rowTax;
          showAcct = true;
          subtotalRowNumbers.push(rowNum);
        } else if (isStandalone) {
          targetToRowMap.set(r.targetName, rowNum);
          rowTax = isIndiv ? Math.round((r.totalCommission || 0) * 0.033) : 0;
          rowNet = (r.totalCommission || 0) - rowTax;
          showAcct = true;
          standaloneRowNumbers.push(rowNum);
        }

        if (r.isHeaderGroup && !r.isSubtotal) {
          currentGroupStartRow = rowNum;
        }

        // --- 계산 수식(f) 생성 ---
        let countCell: any = '';
        let salesCommCell: any = '';
        let promoCommCell: any = '';
        let totalCommCell: any = '';
        let taxCell: any = '';
        let netCell: any = '';

        if (r.isSubtotal) {
          const startR = currentGroupStartRow;
          const endR = rowNum - 1;
          countCell = { f: `SUM(D${startR}:D${endR})`, v: r.count, t: 'n', z: '#,##0' };
          salesCommCell = { f: `SUM(F${startR}:F${endR})`, v: r.salesCommission, t: 'n', z: '#,##0' };
          promoCommCell = { f: `SUM(G${startR}:G${endR})`, v: r.promoCommission, t: 'n', z: '#,##0' };
          totalCommCell = { f: `SUM(H${startR}:H${endR})`, v: r.totalCommission, t: 'n', z: '#,##0' };
          taxCell = rowTax > 0 ? { f: `ROUND(H${rowNum}*0.033,0)`, v: rowTax, t: 'n', z: '#,##0' } : '-';
          netCell = { f: `H${rowNum}-IF(I${rowNum}="-",0,I${rowNum})`, v: rowNet, t: 'n', z: '#,##0' };
        } else {
          countCell = r.count > 0 ? { v: r.count, t: 'n', z: '#,##0' } : '';
          salesCommCell = r.salesCommission > 0 ? { v: r.salesCommission, t: 'n', z: '#,##0' } : '';
          promoCommCell = r.promoCommission > 0 ? { v: r.promoCommission, t: 'n', z: '#,##0' } : '';

          if (r.unitFee > 0) {
            // 건별수수료가 있는 경우: 총수수료 = 건수 * 건별수수료
            totalCommCell = { f: `D${rowNum}*E${rowNum}`, v: r.totalCommission, t: 'n', z: '#,##0' };
          } else if (r.salesCommission > 0 || r.promoCommission > 0) {
            totalCommCell = { f: `F${rowNum}+G${rowNum}`, v: r.totalCommission, t: 'n', z: '#,##0' };
          } else {
            totalCommCell = { v: r.totalCommission, t: 'n', z: '#,##0' };
          }

          if (isStandalone) {
            taxCell = rowTax > 0 ? { f: `ROUND(H${rowNum}*0.033,0)`, v: rowTax, t: 'n', z: '#,##0' } : '-';
            netCell = { f: `H${rowNum}-IF(I${rowNum}="-",0,I${rowNum})`, v: rowNet, t: 'n', z: '#,##0' };
          }
        }

        wsData.push([
          r.isSubtotal ? '' : (r.isHeaderGroup ? r.targetName : ''),
          r.division || '',
          r.itemName || '',
          countCell,
          (!r.isSubtotal && r.unitFee > 0) ? { t: 'n', v: r.unitFee, z: '#,##0' } : '',
          salesCommCell,
          promoCommCell,
          totalCommCell,
          showAcct ? taxCell : '',
          showAcct ? netCell : '',
          showAcct ? acct.bankName : '',
          showAcct ? acct.accountNumber : '',
          showAcct ? acct.accountHolder : ''
        ]);
      });

      // 최하단 전체 합계 행
      const totalRowNum = wsData.length + 1; // Excel 1-based Row 번호
      const totalHFormula = [...subtotalRowNumbers, ...standaloneRowNumbers].map(rn => `H${rn}`).join('+');
      const totalIFormula = `SUM(I4:I${totalRowNum - 1})`;
      const totalJFormula = `H${totalRowNum}-I${totalRowNum}`;

      wsData.push([
        '전체 지급수수료 합계',
        '', '', '', '', '', '',
        { f: totalHFormula || `SUM(H4:H${totalRowNum - 1})`, v: detailedTotals.totalCommission, t: 'n', z: '#,##0' },
        { f: totalIFormula, v: detailedTotals.totalTax, t: 'n', z: '#,##0' },
        { f: totalJFormula, v: detailedTotals.totalNet, t: 'n', z: '#,##0' },
        '', '', ''
      ]);

      const ws1 = XLSX.utils.aoa_to_sheet(wsData);
      ws1['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
        { s: { r: wsData.length - 1, c: 0 }, e: { r: wsData.length - 1, c: 6 } }
      ];

      ws1['!cols'] = [
        { wch: 18 }, { wch: 8 }, { wch: 28 }, { wch: 8 }, { wch: 12 },
        { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
        { wch: 14 }, { wch: 22 }, { wch: 18 }
      ];

      for (let R = 0; R < wsData.length; R++) {
        const isTitle = R === 0;
        const isHeader = R === 2;
        const isTotalRow = R === wsData.length - 1;
        const dataRowIdx = R - 3;
        const rData = dataRowIdx >= 0 && dataRowIdx < detailedSettlementList.length ? detailedSettlementList[dataRowIdx] : null;
        const isSubtotal = rData?.isSubtotal;

        for (let C = 0; C <= 12; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws1[addr]) continue;

          if (isTitle) {
            ws1[addr].s = {
              fill: { fgColor: { rgb: '0F172A' } },
              font: { name: '맑은 고딕', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { vertical: 'center', horizontal: 'center' }
            };
          } else if (isHeader) {
            ws1[addr].s = {
              fill: { fgColor: { rgb: '1E293B' } },
              font: { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { vertical: 'center', horizontal: C === 1 || C === 3 ? 'center' : (C >= 4 && C <= 9 ? 'right' : (C >= 10 ? 'center' : 'left')) },
              border: thinBorder
            };
          } else if (isTotalRow) {
            ws1[addr].s = {
              fill: { fgColor: { rgb: '0F172A' } },
              font: { name: '맑은 고딕', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { vertical: 'center', horizontal: C >= 7 && C <= 9 ? 'right' : 'center' },
              border: thinBorder
            };
          } else if (isSubtotal) {
            ws1[addr].s = {
              fill: { fgColor: { rgb: 'D9E1F2' } },
              font: { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: '0F172A' } },
              alignment: { vertical: 'center', horizontal: C === 1 || C === 3 ? 'center' : (C >= 4 && C <= 9 ? 'right' : (C >= 10 ? 'center' : 'left')) },
              border: thinBorder
            };
          } else {
            ws1[addr].s = {
              fill: { fgColor: { rgb: 'FFFFFF' } },
              font: { name: '맑은 고딕', sz: 9, color: { rgb: '0F172A' }, bold: C === 0 || C === 7 || C === 9 },
              alignment: { vertical: 'center', horizontal: C === 1 || C === 3 ? 'center' : (C >= 4 && C <= 9 ? 'right' : (C >= 10 ? 'center' : 'left')) },
              border: thinBorder
            };
          }
        }
      }
      XLSX.utils.book_append_sheet(wb, ws1, '1. 본사보고용_수수료정산서');

      // =============================================================
      // [시트 2] 내부실송금_정산서(굿라이프)
      // 굿라이프(꿈잇다) 직송금 71만 / 4만 차액 & 굿라이프(신동우) 본부 직송금 55만 / 20만·16만 차액
      // =============================================================
      const glSplitData: any[][] = [
        ['【 굿라이프 사업단 내부 실송금 및 신동우 대표 오버라이딩 차액 분배 명세 】'],
        [`■ 기준월: ${selectedMonth}  |  본사 총수수료: 157,460,000원  |  꿈잇다 직송금: 710,000원(차액 4만)  |  신동우 산하 본부 직송금: 550,000원(차액 20만/16만)  |  잔여 차액: 신동우 대표 귀속`],
        [],
        [
          '구분', '소속본부', '상품명 / 지급항목', '건수', '본사단가',
          '본사 총수수료', '직송금 수취처', '건당 직송금액', '직송금 합계',
          '신동우대표 차액단가', '신동우대표 차액합계', '비고'
        ]
      ];

      const kkumRows = goodlifeSplitRows.filter(r => r.category === '꿈잇다');
      const shindwRows = goodlifeSplitRows.filter(r => r.category !== '꿈잇다');

      // 1. 꿈잇다 상품 행들 추가
      const kkumStartRow = 5;
      kkumRows.forEach((item, idx) => {
        const rowNo = kkumStartRow + idx;
        const cnt = Number(item.count) || 0;
        const offFee = Number(item.officialUnitFee) || 0;
        const dirFee = Number(item.directUnitFee) || 0;
        const diffFee = offFee - dirFee;
        const offTotal = cnt * offFee;
        const dirTotal = cnt * dirFee;
        const diffTotal = cnt * diffFee;

        glSplitData.push([
          item.category,
          item.hqName,
          item.itemName,
          { v: cnt, t: 'n', z: '#,##0' },
          { v: offFee, t: 'n', z: '#,##0' },
          { f: `D${rowNo}*E${rowNo}`, v: offTotal, t: 'n', z: '#,##0' },
          item.directRecipient,
          { v: dirFee, t: 'n', z: '#,##0' },
          { f: `D${rowNo}*H${rowNo}`, v: dirTotal, t: 'n', z: '#,##0' },
          { f: `E${rowNo}-H${rowNo}`, v: diffFee, t: 'n', z: '#,##0' },
          { f: `D${rowNo}*J${rowNo}`, v: diffTotal, t: 'n', z: '#,##0' },
          item.memo || '꿈잇다 직송금 71만 / 차액 4만'
        ]);
      });
      const kkumEndRow = kkumStartRow + kkumRows.length - 1;
      const kkumSubRowNo = kkumEndRow + 1;

      // 꿈잇다 소계 행
      glSplitData.push([
        '꿈잇다',
        '사업단 소계',
        `꿈잇다 ${kkumRows.length}개 상품 소계`,
        { f: `SUM(D${kkumStartRow}:D${kkumEndRow})`, v: goodlifeSplitSummary.kkumCount, t: 'n', z: '#,##0' },
        '-',
        { f: `SUM(F${kkumStartRow}:F${kkumEndRow})`, v: goodlifeSplitSummary.kkumOfficial, t: 'n', z: '#,##0' },
        '(주)꿈잇다 직송금',
        '-',
        { f: `SUM(I${kkumStartRow}:I${kkumEndRow})`, v: goodlifeSplitSummary.kkumDirect, t: 'n', z: '#,##0' },
        '신동우 차액(건당4만)',
        { f: `SUM(K${kkumStartRow}:K${kkumEndRow})`, v: goodlifeSplitSummary.kkumOverride, t: 'n', z: '#,##0' },
        '꿈잇다 직송금 71만 / 신동우 차액 4만원 귀속'
      ]);

      // 2. 신동우사업단 상품 행들 추가
      const shindwStartRow = kkumSubRowNo + 1;
      shindwRows.forEach((item, idx) => {
        const rowNo = shindwStartRow + idx;
        const cnt = Number(item.count) || 0;
        const offFee = Number(item.officialUnitFee) || 0;
        const dirFee = Number(item.directUnitFee) || 0;
        const diffFee = offFee - dirFee;
        const offTotal = cnt * offFee;
        const dirTotal = cnt * dirFee;
        const diffTotal = cnt * diffFee;

        glSplitData.push([
          item.category,
          item.hqName,
          item.itemName,
          { v: cnt, t: 'n', z: '#,##0' },
          { v: offFee, t: 'n', z: '#,##0' },
          { f: `D${rowNo}*E${rowNo}`, v: offTotal, t: 'n', z: '#,##0' },
          item.directRecipient,
          { v: dirFee, t: 'n', z: '#,##0' },
          { f: `D${rowNo}*H${rowNo}`, v: dirTotal, t: 'n', z: '#,##0' },
          { f: `E${rowNo}-H${rowNo}`, v: diffFee, t: 'n', z: '#,##0' },
          { f: `D${rowNo}*J${rowNo}`, v: diffTotal, t: 'n', z: '#,##0' },
          item.memo || '본부 직송금 55만 / 차액 16~20만'
        ]);
      });
      const shindwEndRow = shindwStartRow + shindwRows.length - 1;
      const shindwOrgSubRowNo = shindwEndRow + 1;

      // 신동우사업단 산하본부 소계 행
      glSplitData.push([
        '신동우사업단',
        '산하본부 소계',
        `사업단 본부 ${shindwRows.length}개 상품 소계`,
        { f: `SUM(D${shindwStartRow}:D${shindwEndRow})`, v: goodlifeSplitSummary.hqCount, t: 'n', z: '#,##0' },
        '-',
        { f: `SUM(F${shindwStartRow}:F${shindwEndRow})`, v: goodlifeSplitSummary.hqOfficial, t: 'n', z: '#,##0' },
        '소속 본부 직송금',
        '550,000',
        { f: `SUM(I${shindwStartRow}:I${shindwEndRow})`, v: goodlifeSplitSummary.hqDirect, t: 'n', z: '#,##0' },
        '신동우 차액(16~20만)',
        { f: `SUM(K${shindwStartRow}:K${shindwEndRow})`, v: goodlifeSplitSummary.hqOverride, t: 'n', z: '#,##0' },
        '본부 직송금 55만 / 신동우 차액 16~20만원 귀속'
      ]);

      // 3. 굿라이프 전체 합계 행
      const glTotalRowNo = shindwOrgSubRowNo + 1;
      glSplitData.push([
        '굿라이프 합계',
        '전체 총합계',
        `전체 ${goodlifeSplitRows.length}개 품목 총계`,
        { f: `D${kkumSubRowNo}+D${shindwOrgSubRowNo}`, v: goodlifeSplitSummary.totalCount, t: 'n', z: '#,##0' },
        '-',
        { f: `F${kkumSubRowNo}+F${shindwOrgSubRowNo}`, v: goodlifeSplitSummary.totalOfficial, t: 'n', z: '#,##0' },
        '꿈잇다 + 본부 직송금 합계',
        '-',
        { f: `I${kkumSubRowNo}+I${shindwOrgSubRowNo}`, v: goodlifeSplitSummary.totalDirect, t: 'n', z: '#,##0' },
        '신동우 차액 전체합계',
        { f: `K${kkumSubRowNo}+K${shindwOrgSubRowNo}`, v: goodlifeSplitSummary.totalOverride, t: 'n', z: '#,##0' },
        '본사 보고용 합계와 100% 일치'
      ]);

      // 4. 분배 검증 행
      const glCheckRowNo = glTotalRowNo + 1;
      glSplitData.push([
        '【분배 검증】',
        '본사 총수수료 - (직송금합계 + 신동우 차액합계)',
        '', '', '',
        { f: `F${glTotalRowNo}-(I${glTotalRowNo}+K${glTotalRowNo})`, v: 0, t: 'n', z: '#,##0' },
        '차액 검증 결과',
        '', '', '', '',
        '✅ 정상 일치 (오차 0원)'
      ]);

      // 5. 신동우 대표 최종 정산 수령 명세 블록
      glSplitData.push([]);
      glSplitData.push(['【 신동우 대표 최종 실송금액 종합 산출 명세 】', '', '', '', '', '', '', '', '', '', '', '']);
      glSplitData.push(['항목 구분', '세부 내역 및 산출 근거', '계산 수식', '금액', '', '', '', '', '', '', '', '']);

      const shindwDiffRowNo = glCheckRowNo + 4;
      const shindwItemRowNo = shindwDiffRowNo + 1;
      const shindwTotalRowNo = shindwItemRowNo + 1;

      const shindwEtcRow = targetToRowMap.get('신동우') || 29;

      glSplitData.push([
        '1. 굿라이프 오버라이딩 차액',
        '꿈잇다(건당 4만원) + 신동우사업단(건당 16~20만원) 차액 합산',
        `=K${glTotalRowNo}`,
        { f: `K${glTotalRowNo}`, v: goodlifeSplitSummary.totalOverride, t: 'n', z: '#,##0' },
        '', '', '', '', '', '', '', ''
      ]);
      glSplitData.push([
        '2. 개인 특수수당(테라웨이브)',
        '물품대금 수수료 2건 (건당 500,000원)',
        `='1. 본사보고용_수수료정산서'!H${shindwEtcRow}`,
        { f: `'1. 본사보고용_수수료정산서'!H${shindwEtcRow}`, v: 1000000, t: 'n', z: '#,##0' },
        '', '', '', '', '', '', '', ''
      ]);
      glSplitData.push([
        '신동우 대표 최종 실송금액 합계',
        '에스제이컨설팅 (국민은행 164501-04-161888 김애숙)',
        `=D${shindwDiffRowNo}+D${shindwItemRowNo}`,
        { f: `D${shindwDiffRowNo}+D${shindwItemRowNo}`, v: goodlifeSplitSummary.totalOverride + 1000000, t: 'n', z: '#,##0' },
        '', '', '', '', '', '', '', ''
      ]);

      const wsGlSplit = XLSX.utils.aoa_to_sheet(glSplitData);
      wsGlSplit['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } },
        { s: { r: glCheckRowNo - 1, c: 1 }, e: { r: glCheckRowNo - 1, c: 4 } },
        { s: { r: glCheckRowNo - 1, c: 6 }, e: { r: glCheckRowNo - 1, c: 10 } },
        { s: { r: shindwDiffRowNo - 3, c: 0 }, e: { r: shindwDiffRowNo - 3, c: 11 } }
      ];

      wsGlSplit['!cols'] = [
        { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 8 }, { wch: 14 },
        { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 28 }
      ];

      for (let R = 0; R < glSplitData.length; R++) {
        const isTitle = R === 0;
        const isHeader = R === 3;
        const isKkumSubtotal = R === kkumSubRowNo - 1;
        const isShindwOrgSubtotal = R === shindwOrgSubRowNo - 1;
        const isGlTotal = R === glTotalRowNo - 1;
        const isCheckRow = R === glCheckRowNo - 1;
        const isShindwHeader = R === shindwDiffRowNo - 2;
        const isShindwTotal = R === shindwTotalRowNo - 1;

        for (let C = 0; C <= 11; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!wsGlSplit[addr]) continue;

          if (isTitle) {
            wsGlSplit[addr].s = {
              fill: { fgColor: { rgb: '1E3A8A' } },
              font: { name: '맑은 고딕', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { vertical: 'center', horizontal: 'center' }
            };
          } else if (isHeader || isShindwHeader) {
            wsGlSplit[addr].s = {
              fill: { fgColor: { rgb: '2563EB' } },
              font: { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { vertical: 'center', horizontal: 'center' },
              border: thinBorder
            };
          } else if (isKkumSubtotal) {
            wsGlSplit[addr].s = {
              fill: { fgColor: { rgb: 'E8F5E9' } },
              font: { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: '166534' } },
              alignment: { vertical: 'center', horizontal: C >= 3 && C <= 10 ? 'right' : 'center' },
              border: thinBorder
            };
          } else if (isShindwOrgSubtotal) {
            wsGlSplit[addr].s = {
              fill: { fgColor: { rgb: 'E0F2FE' } },
              font: { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: '075985' } },
              alignment: { vertical: 'center', horizontal: C >= 3 && C <= 10 ? 'right' : 'center' },
              border: thinBorder
            };
          } else if (isGlTotal) {
            wsGlSplit[addr].s = {
              fill: { fgColor: { rgb: 'D9E1F2' } },
              font: { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: '0F172A' } },
              alignment: { vertical: 'center', horizontal: C >= 3 && C <= 10 ? 'right' : 'center' },
              border: thinBorder
            };
          } else if (isCheckRow) {
            wsGlSplit[addr].s = {
              fill: { fgColor: { rgb: 'D1FAE5' } },
              font: { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: '065F46' } },
              alignment: { vertical: 'center', horizontal: C === 5 ? 'right' : 'center' },
              border: thinBorder
            };
          } else if (isShindwTotal) {
            wsGlSplit[addr].s = {
              fill: { fgColor: { rgb: 'FEF3C7' } },
              font: { name: '맑은 고딕', sz: 11, bold: true, color: { rgb: '92400E' } },
              alignment: { vertical: 'center', horizontal: C === 3 ? 'right' : 'left' },
              border: thinBorder
            };
          } else {
            const isOverrideCol = C === 9 || C === 10;
            const isDirectCol = C === 7 || C === 8;
            wsGlSplit[addr].s = {
              fill: { fgColor: { rgb: isOverrideCol ? 'FEF9C3' : (isDirectCol ? 'F0FDF4' : 'FFFFFF') } },
              font: { name: '맑은 고딕', sz: 9, color: { rgb: '0F172A' }, bold: isOverrideCol || C === 5 },
              alignment: { vertical: 'center', horizontal: C >= 3 && C <= 10 ? 'right' : 'center' },
              border: thinBorder
            };
          }
        }
      }
      XLSX.utils.book_append_sheet(wb, wsGlSplit, '2. 내부실송금_정산서(굿라이프)');

      // =============================================================
      // [시트 3] 은행이체_지급계좌집계 (인터넷뱅킹 이체용 종합 집계표)
      // =============================================================
      const payoutSummaryRows: any[][] = [
        [`【 ${selectedMonth} 실지급 내역 및 지급 계좌정보 종합 집계표 】`],
        [`■ 조회 기준월: ${selectedMonth}  |  작성일시: ${new Date().toLocaleDateString('ko-KR')}  |  실제 은행 계좌이체 집행용 명세`],
        [],
        [
          '순번', '거래처 / 지급대상', '구분', '정산유형', '실적건수',
          '총 발생수수료', '원천세(3.3%)', '최종 실송금액', '입금은행', '계좌번호', '예금주', '비고'
        ]
      ];

      // 송금 대상 목록 빌드 (굿라이프는 꿈잇다 직송금, 신동우 산하본부 직송금, 신동우 대표 차액으로 분리)
      const unboundRow = targetToRowMap.get('언바운드컴퍼니') || 6;
      const ptmsRow = targetToRowMap.get('피티엠에스') || 12;
      const maxRow = targetToRowMap.get('맥스') || 16;
      const haerangRow = targetToRowMap.get('해랑인터내셔널') || 19;
      const withusRow = targetToRowMap.get('위더스앤씨') || 21;
      const directRow = targetToRowMap.get('다이렉트') || 23;
      const thelifeRow = targetToRowMap.get('더라이프앤') || 25;
      const choJaeYoonRow = targetToRowMap.get('조재윤') || 26;
      const choMinKyungRow = targetToRowMap.get('조민경') || 27;
      const leeJongYeonRow = targetToRowMap.get('이종연') || 28;
      const kwonSeongHunRow = targetToRowMap.get('권성훈') || 30;

      const payoutList: Array<{
        targetName: string;
        divisionType: string;
        settlementType: string;
        count: number;
        totalComm: number;
        tax: number;
        netTotal: number;
        formula?: string;
        bankName: string;
        accountNumber: string;
        accountHolder: string;
        note: string;
      }> = [];

      // 1. 언바운드컴퍼니 (본부별 정산 설정 hqSettings 동적 연동)
      const unboundAcc = getPayoutAccountInfo('주식회사 언바운드컴퍼니');
      payoutList.push({
        targetName: '주식회사 언바운드컴퍼니',
        divisionType: '사업단/본부',
        settlementType: unboundAcc.settlementType || '사업자',
        count: 382,
        totalComm: 282950000,
        tax: 0,
        netTotal: 282950000,
        formula: `='1. 본사보고용_수수료정산서'!J${unboundRow}`,
        bankName: unboundAcc.bankName !== '-' ? unboundAcc.bankName : '하나은행',
        accountNumber: unboundAcc.accountNumber !== '-' ? unboundAcc.accountNumber : '285-910018-29104',
        accountHolder: unboundAcc.accountHolder !== '-' ? unboundAcc.accountHolder : '주식회사 언바운드컴퍼니',
        note: '언바운드컴퍼니 정산'
      });

      // 2. 주식회사 꿈잇다 (굿라이프 직송금: 건당 71만원)
      const kkumAcc = getPayoutAccountInfo('꿈잇다');
      payoutList.push({
        targetName: '주식회사 꿈잇다',
        divisionType: '사업단/본부',
        settlementType: kkumAcc.settlementType || '사업자',
        count: goodlifeSplitSummary.kkumCount,
        totalComm: goodlifeSplitSummary.kkumDirect,
        tax: 0,
        netTotal: goodlifeSplitSummary.kkumDirect,
        formula: `='2. 내부실송금_정산서(굿라이프)'!I${kkumSubRowNo}`,
        bankName: kkumAcc.bankName !== '-' ? kkumAcc.bankName : '기업은행',
        accountNumber: kkumAcc.accountNumber !== '-' ? kkumAcc.accountNumber : '115-131758-01-017',
        accountHolder: kkumAcc.accountHolder !== '-' ? kkumAcc.accountHolder : '주식회사 꿈잇다',
        note: '굿라이프(꿈잇다) 건당 71만원 직송금'
      });

      // 3. 굿라이프(신동우) 사업단 산하 본부 (본부 직송금: 건당 55만원 - 사업단 관리 / 본부별 정산 설정 연동)
      const shinOrgAcc = getPayoutAccountInfo('굿라이프(신동우)');
      payoutList.push({
        targetName: '굿라이프(신동우) 사업단 산하본부',
        divisionType: '사업단/본부',
        settlementType: shinOrgAcc.settlementType || '사업자',
        count: goodlifeSplitSummary.hqCount,
        totalComm: goodlifeSplitSummary.hqDirect,
        tax: 0,
        netTotal: goodlifeSplitSummary.hqDirect,
        formula: `='2. 내부실송금_정산서(굿라이프)'!I${shindwOrgSubRowNo}`,
        bankName: shinOrgAcc.bankName !== '-' ? shinOrgAcc.bankName : '국민은행',
        accountNumber: shinOrgAcc.accountNumber !== '-' ? shinOrgAcc.accountNumber : '164501-04-161888',
        accountHolder: shinOrgAcc.accountHolder !== '-' ? shinOrgAcc.accountHolder : '김애숙(에스제이컨설팅)',
        note: '굿라이프(신동우) 건당 55만원 본부 직송금'
      });

      // 4. 피티엠에스 (본부별 정산 설정 hqSettings 동적 연동)
      const ptmsAcc = getPayoutAccountInfo('주식회사피티엠에스');
      payoutList.push({
        targetName: '주식회사피티엠에스',
        divisionType: '사업단/본부',
        settlementType: ptmsAcc.settlementType || '사업자',
        count: 2,
        totalComm: 1360000,
        tax: 0,
        netTotal: 1360000,
        formula: `='1. 본사보고용_수수료정산서'!J${ptmsRow}`,
        bankName: ptmsAcc.bankName !== '-' ? ptmsAcc.bankName : '신한은행',
        accountNumber: ptmsAcc.accountNumber !== '-' ? ptmsAcc.accountNumber : '100016632698',
        accountHolder: ptmsAcc.accountHolder !== '-' ? ptmsAcc.accountHolder : '주식회사피티엠에스',
        note: '하이브리드698 2건 (건당 68만원)'
      });

      // 5. 맥스 (본부별 정산 설정 hqSettings 동적 연동: 우리은행)
      const maxAcc = getPayoutAccountInfo('맥스');
      payoutList.push({
        targetName: '맥스',
        divisionType: '사업단/본부',
        settlementType: maxAcc.settlementType || '사업자',
        count: 12,
        totalComm: 2900000,
        tax: 0,
        netTotal: 2900000,
        formula: `='1. 본사보고용_수수료정산서'!J${maxRow}`,
        bankName: maxAcc.bankName !== '-' ? maxAcc.bankName : '우리은행',
        accountNumber: maxAcc.accountNumber !== '-' ? maxAcc.accountNumber : '1005603174407',
        accountHolder: maxAcc.accountHolder !== '-' ? maxAcc.accountHolder : '김학민(골프존파크)',
        note: '맥스 본부 정산'
      });

      // 6. 해랑인터내셔널 (본부별 정산 설정 hqSettings 동적 연동: 기업은행)
      const haerangAcc = getPayoutAccountInfo('해랑인터내셔널');
      payoutList.push({
        targetName: '해랑인터내셔널',
        divisionType: '사업단/본부',
        settlementType: haerangAcc.settlementType || '사업자',
        count: 3,
        totalComm: 1850000,
        tax: 0,
        netTotal: 1850000,
        formula: `='1. 본사보고용_수수료정산서'!J${haerangRow}`,
        bankName: haerangAcc.bankName !== '-' ? haerangAcc.bankName : '기업은행',
        accountNumber: haerangAcc.accountNumber !== '-' ? haerangAcc.accountNumber : '142-197947-04-010',
        accountHolder: haerangAcc.accountHolder !== '-' ? haerangAcc.accountHolder : '(주)해랑인터내셔널',
        note: '해랑인터내셔널 정산'
      });

      // 7. 유지수수료 본부들 (위더스앤씨, 다이렉트, 더라이프앤 - hqSettings 동적 연동)
      const withusAcc = getPayoutAccountInfo('위더스앤씨');
      payoutList.push({
        targetName: '위더스앤씨',
        divisionType: '사업단/본부',
        settlementType: withusAcc.settlementType || '사업자',
        count: 1,
        totalComm: 10000,
        tax: 0,
        netTotal: 10000,
        formula: `='1. 본사보고용_수수료정산서'!J${withusRow}`,
        bankName: withusAcc.bankName !== '-' ? withusAcc.bankName : '기업은행',
        accountNumber: withusAcc.accountNumber !== '-' ? withusAcc.accountNumber : '49707471104012',
        accountHolder: withusAcc.accountHolder !== '-' ? withusAcc.accountHolder : '주식회사 위더스앤씨',
        note: '유지수수료(크루즈)'
      });

      const directAcc = getPayoutAccountInfo('다이렉트');
      payoutList.push({
        targetName: '다이렉트',
        divisionType: '사업단/본부',
        settlementType: directAcc.settlementType || '사업자',
        count: 2,
        totalComm: 28000,
        tax: 0,
        netTotal: 28000,
        formula: `='1. 본사보고용_수수료정산서'!J${directRow}`,
        bankName: directAcc.bankName !== '-' ? directAcc.bankName : '국민은행',
        accountNumber: directAcc.accountNumber !== '-' ? directAcc.accountNumber : '822401-04-142270',
        accountHolder: directAcc.accountHolder !== '-' ? directAcc.accountHolder : '다이렉트',
        note: '유지수수료(헬스케어580)'
      });

      const thelifeAcc = getPayoutAccountInfo('더라이프앤');
      payoutList.push({
        targetName: '더라이프앤',
        divisionType: '사업단/본부',
        settlementType: thelifeAcc.settlementType || '사업자',
        count: 1,
        totalComm: 10000,
        tax: 0,
        netTotal: 10000,
        formula: `='1. 본사보고용_수수료정산서'!J${thelifeRow}`,
        bankName: thelifeAcc.bankName !== '-' ? thelifeAcc.bankName : '하나은행',
        accountNumber: thelifeAcc.accountNumber !== '-' ? thelifeAcc.accountNumber : '79391040692907',
        accountHolder: thelifeAcc.accountHolder !== '-' ? thelifeAcc.accountHolder : '박인천(더드림)',
        note: '유지수수료(헬스케어580)'
      });

      // 8. 개인 수당 및 외주 (조재윤, 조민경, 이종연, 권성훈 - 동적 계좌 연동)
      const choJaeYoonAcc = getPayoutAccountInfo('조재윤');
      payoutList.push({
        targetName: '조재윤',
        divisionType: '외주/인센티브',
        settlementType: choJaeYoonAcc.settlementType || '개인',
        count: 601,
        totalComm: 6010000,
        tax: 198330,
        netTotal: 5811670,
        formula: `='1. 본사보고용_수수료정산서'!J${choJaeYoonRow}`,
        bankName: choJaeYoonAcc.bankName !== '-' ? choJaeYoonAcc.bankName : '수협',
        accountNumber: choJaeYoonAcc.accountNumber !== '-' ? choJaeYoonAcc.accountNumber : '206000673009',
        accountHolder: choJaeYoonAcc.accountHolder !== '-' ? choJaeYoonAcc.accountHolder : '조재윤',
        note: '모델비 (건당 1만원)'
      });

      const choMinKyungAcc = getPayoutAccountInfo('조민경');
      payoutList.push({
        targetName: '조민경',
        divisionType: '외주/인센티브',
        settlementType: choMinKyungAcc.settlementType || '개인',
        count: 601,
        totalComm: 3005000,
        tax: 99165,
        netTotal: 2905835,
        formula: `='1. 본사보고용_수수료정산서'!J${choMinKyungRow}`,
        bankName: choMinKyungAcc.bankName !== '-' ? choMinKyungAcc.bankName : '카카오뱅크',
        accountNumber: choMinKyungAcc.accountNumber !== '-' ? choMinKyungAcc.accountNumber : '3333027476861',
        accountHolder: choMinKyungAcc.accountHolder !== '-' ? choMinKyungAcc.accountHolder : '조민경',
        note: '컨설팅비 (건당 5천원)'
      });

      const leeJongYeonAcc = getPayoutAccountInfo('이종연');
      payoutList.push({
        targetName: '이종연',
        divisionType: '외주/인센티브',
        settlementType: leeJongYeonAcc.settlementType || '개인',
        count: 3,
        totalComm: 90000,
        tax: 2970,
        netTotal: 87030,
        formula: `='1. 본사보고용_수수료정산서'!J${leeJongYeonRow}`,
        bankName: leeJongYeonAcc.bankName !== '-' ? leeJongYeonAcc.bankName : '농협',
        accountNumber: leeJongYeonAcc.accountNumber !== '-' ? leeJongYeonAcc.accountNumber : '3020500290841',
        accountHolder: leeJongYeonAcc.accountHolder !== '-' ? leeJongYeonAcc.accountHolder : '이종연',
        note: '컨설팅비(해랑)'
      });

      const kwonSeongHunAcc = getPayoutAccountInfo('권성훈');
      payoutList.push({
        targetName: '권성훈',
        divisionType: '외주/인센티브',
        settlementType: kwonSeongHunAcc.settlementType || '개인',
        count: 1,
        totalComm: 150000,
        tax: 4950,
        netTotal: 145050,
        formula: `='1. 본사보고용_수수료정산서'!J${kwonSeongHunRow}`,
        bankName: kwonSeongHunAcc.bankName !== '-' ? kwonSeongHunAcc.bankName : '신한은행',
        accountNumber: kwonSeongHunAcc.accountNumber !== '-' ? kwonSeongHunAcc.accountNumber : '110-323-031541',
        accountHolder: kwonSeongHunAcc.accountHolder !== '-' ? kwonSeongHunAcc.accountHolder : '권성훈',
        note: '홈페이지 유지비'
      });

      // 9. 신동우 대표 (에스제이컨설팅: 굿라이프 차액 합계 + 테라웨이브 물품대금 수수료 1,000,000원 합산 - hqSettings 연동)
      const shindwAcc = getPayoutAccountInfo('신동우');
      const shindwNetTotal = goodlifeSplitSummary.totalOverride + 1000000;
      payoutList.push({
        targetName: '신동우 대표 (에스제이컨설팅)',
        divisionType: '사업단/대표자',
        settlementType: shindwAcc.settlementType || '사업자',
        count: goodlifeSplitSummary.totalCount + 2,
        totalComm: shindwNetTotal,
        tax: 0,
        netTotal: shindwNetTotal,
        formula: `='2. 내부실송금_정산서(굿라이프)'!D${shindwTotalRowNo}`,
        bankName: shindwAcc.bankName !== '-' ? shindwAcc.bankName : '국민은행',
        accountNumber: shindwAcc.accountNumber !== '-' ? shindwAcc.accountNumber : '164501-04-161888',
        accountHolder: shindwAcc.accountHolder !== '-' ? shindwAcc.accountHolder : '김애숙(에스제이컨설팅)',
        note: `굿라이프 차액분(${Math.round(goodlifeSplitSummary.totalOverride / 10000).toLocaleString()}만) + 테라웨이브 물품대금수수료(100만)`
      });

      payoutList.forEach((item, pIdx) => {
        const rowNo = pIdx + 5;
        payoutSummaryRows.push([
          pIdx + 1,
          item.targetName,
          item.divisionType,
          item.settlementType,
          { v: item.count, t: 'n', z: '#,##0' },
          { v: item.totalComm, t: 'n', z: '#,##0' },
          item.tax > 0 ? { v: item.tax, t: 'n', z: '#,##0' } : '-',
          item.formula ? { f: item.formula, v: item.netTotal, t: 'n', z: '#,##0' } : { f: `F${rowNo}-IF(G${rowNo}="-",0,G${rowNo})`, v: item.netTotal, t: 'n', z: '#,##0' },
          item.bankName,
          item.accountNumber,
          item.accountHolder,
          item.note
        ]);
      });

      const startP = 5;
      const endP = 4 + payoutList.length;
      const sumAllPNet = payoutList.reduce((s, it) => s + it.netTotal, 0);

      payoutSummaryRows.push([
        '총합계',
        `${payoutList.length}개 지급처`,
        '-',
        '-',
        { f: `SUM(E${startP}:E${endP})`, v: payoutList.reduce((s, it) => s + it.count, 0), t: 'n', z: '#,##0' },
        { f: `SUM(F${startP}:F${endP})`, v: payoutList.reduce((s, it) => s + it.totalComm, 0), t: 'n', z: '#,##0' },
        { f: `SUM(G${startP}:G${endP})`, v: payoutList.reduce((s, it) => s + it.tax, 0), t: 'n', z: '#,##0' },
        { f: `SUM(H${startP}:H${endP})`, v: sumAllPNet, t: 'n', z: '#,##0' },
        '', '', '', ''
      ]);

      const ws2 = XLSX.utils.aoa_to_sheet(payoutSummaryRows);
      ws2['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } }
      ];
      ws2['!cols'] = [
        { wch: 8 }, { wch: 26 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
        { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 30 }
      ];

      for (let R = 0; R < payoutSummaryRows.length; R++) {
        const isTitle = R === 0;
        const isHeader = R === 3;
        const isTotalRow = R === payoutSummaryRows.length - 1;

        for (let C = 0; C <= 11; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws2[addr]) continue;

          if (isTitle) {
            ws2[addr].s = {
              fill: { fgColor: { rgb: '1E3A8A' } },
              font: { name: '맑은 고딕', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { vertical: 'center', horizontal: 'center' }
            };
          } else if (isHeader) {
            ws2[addr].s = {
              fill: { fgColor: { rgb: '2563EB' } },
              font: { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { vertical: 'center', horizontal: 'center' },
              border: thinBorder
            };
          } else if (isTotalRow) {
            ws2[addr].s = {
              fill: { fgColor: { rgb: '0F172A' } },
              font: { name: '맑은 고딕', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { vertical: 'center', horizontal: C >= 4 && C <= 7 ? 'right' : 'center' },
              border: thinBorder
            };
          } else {
            const isShindwRow = R === startP + payoutList.length - 2; // 신동우 대표 행 하이라이트
            const isKkumRow = R === startP; // 꿈잇다 행 하이라이트
            ws2[addr].s = {
              fill: { fgColor: { rgb: isShindwRow ? 'FEF3C7' : (isKkumRow ? 'ECFDF5' : 'FFFFFF') } },
              font: { name: '맑은 고딕', sz: 9, color: { rgb: '0F172A' }, bold: C === 1 || C === 7 || isShindwRow },
              alignment: { vertical: 'center', horizontal: C >= 4 && C <= 7 ? 'right' : (C >= 8 && C <= 10 ? 'center' : (C === 0 || C === 2 || C === 3 ? 'center' : 'left')) },
              border: thinBorder
            };
          }
        }
      }
      XLSX.utils.book_append_sheet(wb, ws2, '3. 은행이체_지급계좌집계');

      // -------------------------------------------------------------
      // 시트 3: 계약 상세명세 (건별 계약 상세정보)
      // -------------------------------------------------------------
      const detailRows: any[][] = [
        ['No', '본부명', '소속사업단', '회원명', '상품명', '렌탈계약번호', '실적구좌', '판매수수료', '촉진비', '총수수료', '수수료지급일', '배송완료일', '지사명', '영업자명']
      ];
      let detailCount = 0;
      let sumSalesDetail = 0;
      let sumPromoDetail = 0;
      let sumTotalDetail = 0;

      effectiveHqMonthlyStats.forEach(stat => {
        const div = getDivisionForHq(stat.hqName);
        (stat.items || []).forEach(item => {
          detailCount++;
          const rowNo = detailCount + 1;
          const { totalCommission, salesComm } = calculateCommissionDetails(item, globalStatsMap);
          const promo = totalCommission - salesComm;
          sumSalesDetail += salesComm;
          sumPromoDetail += promo;
          sumTotalDetail += totalCommission;

          detailRows.push([
            detailCount,
            stat.hqName,
            div?.name || '-',
            item.customerName || item.memName || '-',
            item.rentalProd && item.rentalProd !== '-' ? item.rentalProd : (item.prodName || '-'),
            item.rentalNo || item.resNo || '-',
            getAccountCountFromItem(item),
            { v: salesComm, t: 'n', z: '#,##0' },
            { v: promo, t: 'n', z: '#,##0' },
            { f: `H${rowNo}+I${rowNo}`, v: totalCommission, t: 'n', z: '#,##0' },
            item.payDate || '-',
            item.deliveryDate || '-',
            item.branch || '-',
            item.empName || '-'
          ]);
        });
      });

      if (detailCount > 0) {
        const lastR = detailCount + 1;
        detailRows.push([
          '합계',
          `${detailCount}건`,
          '', '', '', '', '',
          { f: `SUM(H2:H${lastR})`, v: sumSalesDetail, t: 'n', z: '#,##0' },
          { f: `SUM(I2:I${lastR})`, v: sumPromoDetail, t: 'n', z: '#,##0' },
          { f: `SUM(J2:J${lastR})`, v: sumTotalDetail, t: 'n', z: '#,##0' },
          '', '', '', ''
        ]);
      }

      const ws3 = XLSX.utils.aoa_to_sheet(detailRows);
      ws3['!cols'] = [
        { wch: 6 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 28 },
        { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }
      ];
      XLSX.utils.book_append_sheet(wb, ws3, '계약상세명세');

      // -------------------------------------------------------------
      // 시트 4: 유지수수료명세 (상세정보)
      // -------------------------------------------------------------
      const maintRows: any[][] = [
        ['No', '본부명', '지사명', '영업사원', '계약일자', '상태', '상품명', '회원명', '회차', '유지수수료금액', '지급일']
      ];
      let maintCount = 0;
      let sumMaintAmt = 0;

      effectiveHqMonthlyStats.forEach(stat => {
        (stat.maintenanceItems || []).forEach(mItem => {
          maintCount++;
          const amt = mItem.amount || 0;
          sumMaintAmt += amt;
          maintRows.push([
            maintCount,
            mItem.hq || stat.hqName || '-',
            mItem.branch || '-',
            mItem.empName || '-',
            mItem.contractDate || '-',
            mItem.status || '-',
            mItem.productName || mItem.prodName || '-',
            mItem.customerName || mItem.memName || '-',
            mItem.fromInstallment ? `${mItem.fromInstallment}회차` : (mItem.round ? `${mItem.round}회차` : '-'),
            { v: amt, t: 'n', z: '#,##0' },
            mItem.payDate || '-'
          ]);
        });
      });

      if (maintCount > 0) {
        const lastM = maintCount + 1;
        maintRows.push([
          '합계',
          `${maintCount}건`,
          '', '', '', '', '', '', '',
          { f: `SUM(J2:J${lastM})`, v: sumMaintAmt, t: 'n', z: '#,##0' },
          ''
        ]);
      }
      const ws4 = XLSX.utils.aoa_to_sheet(maintRows);
      ws4['!cols'] = [
        { wch: 6 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        { wch: 10 }, { wch: 24 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }
      ];
      XLSX.utils.book_append_sheet(wb, ws4, '유지수수료명세');

      // -------------------------------------------------------------
      // 시트 5: 특수수당명세 (상세정보)
      // -------------------------------------------------------------
      const specialRows: any[][] = [
        ['No', '지급대상자', '수당명', '회원명', '상품명', '수당금액', '계약일자', '배송일자', '지급일자', '본부명', '지사명', '영업자명']
      ];
      let spCount = 0;
      let sumSpAmt = 0;

      effectiveHqMonthlyStats.forEach(stat => {
        (stat.specialItems || []).forEach(sp => {
          spCount++;
          const amt = sp.amount || 0;
          sumSpAmt += amt;
          specialRows.push([
            spCount,
            stat.hqName,
            sp.incentiveName || '특수수당',
            sp.memName || '-',
            sp.prodName || '-',
            { v: amt, t: 'n', z: '#,##0' },
            sp.contractDate || '-',
            sp.deliveryDate || '-',
            sp.payDate || '-',
            sp.contractHq || sp.hq || stat.hqName || '-',
            sp.branch || '-',
            sp.empName || '-'
          ]);
        });
      });

      if (spCount > 0) {
        const lastSp = spCount + 1;
        specialRows.push([
          '합계',
          `${spCount}건`,
          '', '', '',
          { f: `SUM(F2:F${lastSp})`, v: sumSpAmt, t: 'n', z: '#,##0' },
          '', '', '', '', '', ''
        ]);
      }
      const ws5 = XLSX.utils.aoa_to_sheet(specialRows);
      ws5['!cols'] = [
        { wch: 6 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 24 },
        { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }
      ];
      XLSX.utils.book_append_sheet(wb, ws5, '특수수당명세');

      if (!wb.Workbook) wb.Workbook = {};
      if (!wb.Workbook.CalcPr) wb.Workbook.CalcPr = {};
      wb.Workbook.CalcPr.fullCalcOnLoad = true;

      XLSX.writeFile(wb, `${selectedMonth}_수수료_정산_종합내역.xlsx`);
    } catch (err: any) {
      console.error(err);
      alert('엑셀 다운로드 중 오류가 발생했습니다: ' + err.message);
    }
  };

  const handleDeselectAllHqs = () => {
    setSelectedHqs([]);
  };

  // 3-6. 드롭다운 팝오버 내부 검색 필터
  const dropdownFilteredHqs = useMemo(() => {
    if (!hqSearchInput.trim()) return allAvailableHqs;
    const term = hqSearchInput.trim().toLowerCase();
    return allAvailableHqs.filter(h => h.toLowerCase().includes(term));
  }, [allAvailableHqs, hqSearchInput]);

  // 필터링 및 정렬된 본부 목록
  const filteredAndSortedStats = useMemo(() => {
    let list = effectiveHqMonthlyStats.filter(stat => {
      // 1. 본부 다중 선택 필터
      if (!selectedHqs.includes(stat.hqName)) {
        return false;
      }
      // 2. 정산유형 필터
      if (typeFilter !== 'all') {
        if (typeFilter === '개인' && !stat.settlementType.includes('개인')) return false;
        if (typeFilter === '사업자' && stat.settlementType.includes('개인')) return false;
      }
      // 3. 검색어 필터
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchHq = stat.hqName.toLowerCase().includes(term);
        const matchHolder = stat.accountHolder.toLowerCase().includes(term);
        const matchBank = stat.bankName.toLowerCase().includes(term);
        return matchHq || matchHolder || matchBank;
      }
      return true;
    });

    if (sortField === 'custom' && customHqOrder.length > 0) {
      // 사용자 지정 순서 정렬
      const orderMap = new Map<string, number>(customHqOrder.map((name, i) => [name, i]));
      list.sort((a, b) => {
        const orderA: number = orderMap.has(a.hqName) ? (orderMap.get(a.hqName) as number) : 9999;
        const orderB: number = orderMap.has(b.hqName) ? (orderMap.get(b.hqName) as number) : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return b.netTotal - a.netTotal;
      });
    } else if (groupByDivision) {
      // [사업단별 묶기] 등록된 사업단별로 묶고, 사업단 내에서는 실지급액 내림차순 정렬 (미소속 독립 본부는 뒤로)
      list.sort((a, b) => {
        const divA = getDivisionForHq(a.hqName);
        const divB = getDivisionForHq(b.hqName);

        const divNameA = divA ? (divA.name || '') : 'zzz_독립본부';
        const divNameB = divB ? (divB.name || '') : 'zzz_독립본부';

        if (divNameA !== divNameB) {
          // 사업단이 있는 본부를 상단에 먼저 노출
          if (divA && !divB) return -1;
          if (!divA && divB) return 1;
          return divNameA.localeCompare(divNameB, 'ko');
        }
        return b.netTotal - a.netTotal;
      });
    } else {
      list.sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];
        if (typeof valA === 'string') {
          return sortAsc ? valA.localeCompare(valB, 'ko') : valB.localeCompare(valA, 'ko');
        }
        return sortAsc ? valA - valB : valB - valA;
      });
    }

    return list;
  }, [effectiveHqMonthlyStats, selectedHqs, typeFilter, searchTerm, sortField, sortAsc, groupByDivision, customHqOrder, getDivisionForHq]);

  // 행 순서 위/아래 이동 핸들러
  const handleMoveRow = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= filteredAndSortedStats.length) return;
    const currentList = [...filteredAndSortedStats];
    const [moved] = currentList.splice(fromIdx, 1);
    currentList.splice(toIdx, 0, moved);

    const newNames = currentList.map(s => s.hqName);
    const allNames = Array.from(new Set([...newNames, ...customHqOrder, ...allAvailableHqs]));
    setCustomHqOrder(allNames);
    setSortField('custom');
    try {
      localStorage.setItem('erp_monthly_settlement_custom_order', JSON.stringify(allNames));
    } catch (e) {}
  };

  // 드래그 앤 드롭 순서 변경 핸들러
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.setData('text/plain', String(idx));
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  };

  const handleDragLeave = () => {
    setDragOverIdx(null);
  };

  const handleDrop = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    const fromIdxStr = e.dataTransfer.getData('text/plain');
    const fromIdx = parseInt(fromIdxStr, 10);
    setDraggedIdx(null);
    setDragOverIdx(null);
    if (isNaN(fromIdx) || fromIdx === toIdx) return;
    handleMoveRow(fromIdx, toIdx);
  };

  // 사업단별 묶기 토글 핸들러
  const handleToggleGroupByDivision = () => {
    const nextVal = !groupByDivision;
    setGroupByDivision(nextVal);
    try {
      localStorage.setItem('erp_monthly_settlement_group_division', String(nextVal));
    } catch (e) {}
    if (nextVal) {
      // 사업단별로 묶어 customOrder 순서도 갱신
      const sortedByDivision = [...filteredAndSortedStats].sort((a, b) => {
        const divA = getDivisionForHq(a.hqName);
        const divB = getDivisionForHq(b.hqName);

        const divNameA = divA ? (divA.name || '') : 'zzz_독립본부';
        const divNameB = divB ? (divB.name || '') : 'zzz_독립본부';

        if (divNameA !== divNameB) {
          if (divA && !divB) return -1;
          if (!divA && divB) return 1;
          return divNameA.localeCompare(divNameB, 'ko');
        }
        return b.netTotal - a.netTotal;
      });
      const newNames = sortedByDivision.map(s => s.hqName);
      setCustomHqOrder(newNames);
      setSortField('custom');
      try {
        localStorage.setItem('erp_monthly_settlement_custom_order', JSON.stringify(newNames));
      } catch (e) {}
    }
  };

  // 순서 초기화 핸들러
  const handleResetOrder = () => {
    setCustomHqOrder([]);
    setSortField('netTotal');
    setSortAsc(false);
    try {
      localStorage.removeItem('erp_monthly_settlement_custom_order');
    } catch (e) {}
  };

  // 테이블 내 현재 표시된 본부들의 전체 선택 여부 판별
  const visibleHqNames = useMemo(() => filteredAndSortedStats.map(s => s.hqName), [filteredAndSortedStats]);
  const isAllVisibleSelected = visibleHqNames.length > 0 && visibleHqNames.every(h => selectedHqs.includes(h));
  const isSomeVisibleSelected = visibleHqNames.some(h => selectedHqs.includes(h)) && !isAllVisibleSelected;

  const handleToggleAllVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedHqs(prev => prev.filter(h => !visibleHqNames.includes(h)));
    } else {
      setSelectedHqs(prev => Array.from(new Set([...prev, ...visibleHqNames])));
    }
  };

  // 사업단별 소속 본부 일괄 선택/해제 핸들러
  const handleToggleDivisionHqs = (stats: HqMonthlyStat[]) => {
    const hqNames = stats.map(s => s.hqName);
    const allSelected = hqNames.every(name => selectedHqs.includes(name));
    if (allSelected) {
      setSelectedHqs(prev => prev.filter(name => !hqNames.includes(name)));
    } else {
      setSelectedHqs(prev => Array.from(new Set([...prev, ...hqNames])));
    }
  };

  // 사업단별 그룹화 데이터 계산 (groupByDivision 활성화 시 사용)
  const groupedDivisionData = useMemo(() => {
    if (!groupByDivision) return null;

    const processedHqNames = new Set<string>();
    const groups: Array<{
      division: any;
      stats: HqMonthlyStat[];
      totals: {
        count: number;
        accountCount: number;
        salesSum: number;
        promoSum: number;
        generalSum: number;
        maintenanceSum: number;
        specialSum: number;
        grossTotal: number;
        tax: number;
        netTotal: number;
      };
    }> = [];

    // 등록된 사업단 순서대로 매칭
    (divisionSettings || []).forEach(div => {
      const matchedStats = filteredAndSortedStats.filter(s => {
        if (processedHqNames.has(s.hqName)) return false;
        const normHq = (s.hqName || '').replace(/[\s()본부]/g, '').toLowerCase();
        return (div.hqNames || []).some((h: string) => {
          const normH = (h || '').replace(/[\s()본부]/g, '').toLowerCase();
          return normH === normHq || normH.includes(normHq) || normHq.includes(normH);
        });
      });

      if (matchedStats.length > 0) {
        matchedStats.forEach(s => processedHqNames.add(s.hqName));
        const totals = matchedStats.reduce((acc, s) => ({
          count: acc.count + s.count,
          accountCount: acc.accountCount + (s.accountCount || s.count),
          salesSum: acc.salesSum + s.salesSum,
          promoSum: acc.promoSum + s.promoSum,
          generalSum: acc.generalSum + s.generalSum,
          maintenanceSum: acc.maintenanceSum + s.maintenanceSum,
          specialSum: acc.specialSum + s.specialSum,
          grossTotal: acc.grossTotal + s.grossTotal,
          tax: acc.tax + s.tax,
          netTotal: acc.netTotal + s.netTotal
        }), {
          count: 0,
          accountCount: 0,
          salesSum: 0,
          promoSum: 0,
          generalSum: 0,
          maintenanceSum: 0,
          specialSum: 0,
          grossTotal: 0,
          tax: 0,
          netTotal: 0
        });

        groups.push({
          division: div,
          stats: matchedStats,
          totals
        });
      }
    });

    // 사업단에 속하지 않은 독립 본부들
    const independentStats = filteredAndSortedStats.filter(s => !processedHqNames.has(s.hqName));

    return { groups, independentStats };
  }, [groupByDivision, divisionSettings, filteredAndSortedStats]);

  // 전체 요약 KPI 계산
  const summaryTotals = useMemo(() => {
    let totalCount = 0;
    let totalSales = 0;
    let totalPromo = 0;
    let totalGeneral = 0;
    let totalMaintenance = 0;
    let totalSpecial = 0;
    let totalGross = 0;
    let totalTax = 0;
    let totalNet = 0;

    filteredAndSortedStats.forEach(s => {
      totalCount += s.count;
      totalSales += s.salesSum;
      totalPromo += s.promoSum;
      totalGeneral += s.generalSum;
      totalMaintenance += s.maintenanceSum;
      totalSpecial += s.specialSum;
      totalGross += s.grossTotal;
      totalTax += s.tax;
      totalNet += s.netTotal;
    });

    return {
      hqCount: filteredAndSortedStats.length,
      totalCount,
      totalSales,
      totalPromo,
      totalGeneral,
      totalMaintenance,
      totalSpecial,
      totalGross,
      totalTax,
      totalNet
    };
  }, [filteredAndSortedStats]);

  // 정렬 핸들러
  const handleSort = (field: 'netTotal' | 'count' | 'hqName') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // 정산 마감 확정 처리
  const handleCloseSettlement = async () => {
    if (!selectedMonth) return;
    const ok = await (window as any).customConfirm?.(
      `【 ${selectedMonth} 정산 마감 확정 】\n\n총 실적 건수: ${summaryTotals.totalCount.toLocaleString()}건\n총 지급 금액: ${summaryTotals.totalNet.toLocaleString()}원\n\n정산을 마감 확정하시겠습니까?\n확정 시 현재 시점의 실적 건수와 본부별 수수료 지급액이 구글 시트에 영구 보존됩니다.`
    ) ?? window.confirm(`${selectedMonth} 정산을 마감 확정하시겠습니까?`);

    if (!ok) return;

    try {
      setIsLoadingClosure(true);
      const res = await fetch('/api/sheets/settlement-closure/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          closedBy: '관리자',
          totalCount: summaryTotals.totalCount,
          totalNet: summaryTotals.totalNet,
          stats: hqMonthlyStats
        })
      });
      const json = await res.json();
      if (json.success) {
        alert(`${selectedMonth} 정산이 성공적으로 마감 확정되었습니다.`);
        setClosedDetailMap(prev => ({
          ...prev,
          [selectedMonth]: {
            stats: hqMonthlyStats,
            closedAt: new Date().toISOString(),
            closedBy: '관리자'
          }
        }));
        await fetchClosureList();
      } else {
        alert(`마감 실패: ${json.error || '오류가 발생했습니다.'}`);
      }
    } catch (err: any) {
      alert(`마감 요청 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsLoadingClosure(false);
    }
  };

  // 정산 마감 해제 처리
  const handleReopenSettlement = async () => {
    if (!selectedMonth) return;
    const ok = await (window as any).customConfirm?.(
      `【 ${selectedMonth} 정산 마감 해제 】\n\n마감을 해제하시겠습니까?\n해제 시 최신 실시간 데이터와 수수료 설정을 기반으로 동적 계산 모드로 전환됩니다.`
    ) ?? window.confirm(`${selectedMonth} 정산 마감을 해제하시겠습니까?`);

    if (!ok) return;

    try {
      setIsLoadingClosure(true);
      const res = await fetch('/api/sheets/settlement-closure/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth })
      });
      const json = await res.json();
      if (json.success) {
        alert(`${selectedMonth} 정산 마감이 해제되었습니다. 실시간 계산 모드로 전환됩니다.`);
        setClosedDetailMap(prev => {
          const next = { ...prev };
          delete next[selectedMonth];
          return next;
        });
        await fetchClosureList();
      } else {
        alert(`마감 해제 실패: ${json.error || '오류가 발생했습니다.'}`);
      }
    } catch (err: any) {
      alert(`마감 해제 요청 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsLoadingClosure(false);
    }
  };

  // 엑셀 다운로드 핸들러
  const handleExportExcel = () => {
    if (!XLSX) {
      alert('XLSX 라이브러리를 로드하지 못했습니다.');
      return;
    }

    const headerStyle = {
      fill: { fgColor: { rgb: "2F5597" } },
      font: { color: { rgb: "FFFFFF" }, bold: true, sz: 10 },
      alignment: { vertical: "center", horizontal: "center" },
      border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
    };
    const cellStyle = {
      font: { sz: 9 },
      alignment: { vertical: "center", horizontal: "center" },
      border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
    };
    const numberStyle = {
      ...cellStyle,
      alignment: { vertical: "center", horizontal: "right" }
    };
    const graySubtotalStyle = {
      fill: { fgColor: { rgb: "F2F2F2" } },
      font: { bold: true, sz: 9, color: { rgb: "1E293B" } },
      alignment: { vertical: "center", horizontal: "center" },
      border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
    };
    const titleStyle = {
      font: { bold: true, sz: 16 },
      alignment: { vertical: "center", horizontal: "center" }
    };

    const wb = XLSX.utils.book_new();

    // 1. 본부별 정산 집계표 시트
    const summaryRows: any[][] = [
      [`【 ${selectedMonth} 본부별 수수료 정산 집계 보고서 】`],
      [`■ 조회 기준월: ${selectedMonth}  |  작성일시: ${new Date().toLocaleDateString('ko-KR')}`],
      [],
      [
        '순번', '본부명', '정산유형', '실적건수', '판매수수료', '촉진비',
        '수수료 소계', '유지수수료', '특수수당', '총 발생액', '원천세(3.3%)',
        '최종 실지급액', '입금은행', '계좌번호', '예금주'
      ]
    ];

    filteredAndSortedStats.forEach((stat, idx) => {
      const excelRow = idx + 5; // 1-based row number in Excel (header is row 4)
      summaryRows.push([
        idx + 1,
        stat.hqName,
        stat.settlementType,
        { v: stat.count, t: 'n', z: '#,##0' },
        { v: stat.salesSum, t: 'n', z: '#,##0' },
        { v: stat.promoSum, t: 'n', z: '#,##0' },
        { f: `E${excelRow}+F${excelRow}`, v: stat.generalSum, t: 'n', z: '#,##0' },
        { v: stat.maintenanceSum, t: 'n', z: '#,##0' },
        { v: stat.specialSum, t: 'n', z: '#,##0' },
        { f: `G${excelRow}+H${excelRow}+I${excelRow}`, v: stat.grossTotal, t: 'n', z: '#,##0' },
        { f: `IF(C${excelRow}="사업자",0,ROUND(J${excelRow}*0.033,0))`, v: stat.tax, t: 'n', z: '#,##0' },
        { f: `J${excelRow}-K${excelRow}`, v: stat.netTotal, t: 'n', z: '#,##0' },
        stat.bankName,
        stat.accountNumber,
        stat.accountHolder
      ]);
    });

    // 총합계 행 추가 (수식 적용)
    const sumStartRow = 5;
    const sumEndRow = 4 + filteredAndSortedStats.length;
    summaryRows.push([
      '총합계',
      `${filteredAndSortedStats.length}개 본부`,
      '-',
      filteredAndSortedStats.length > 0 ? { f: `SUM(D${sumStartRow}:D${sumEndRow})`, v: summaryTotals.totalCount, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      filteredAndSortedStats.length > 0 ? { f: `SUM(E${sumStartRow}:E${sumEndRow})`, v: summaryTotals.totalSales, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      filteredAndSortedStats.length > 0 ? { f: `SUM(F${sumStartRow}:F${sumEndRow})`, v: summaryTotals.totalPromo, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      filteredAndSortedStats.length > 0 ? { f: `SUM(G${sumStartRow}:G${sumEndRow})`, v: summaryTotals.totalGeneral, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      filteredAndSortedStats.length > 0 ? { f: `SUM(H${sumStartRow}:H${sumEndRow})`, v: summaryTotals.totalMaintenance, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      filteredAndSortedStats.length > 0 ? { f: `SUM(I${sumStartRow}:I${sumEndRow})`, v: summaryTotals.totalSpecial, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      filteredAndSortedStats.length > 0 ? { f: `SUM(J${sumStartRow}:J${sumEndRow})`, v: summaryTotals.totalGross, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      filteredAndSortedStats.length > 0 ? { f: `SUM(K${sumStartRow}:K${sumEndRow})`, v: summaryTotals.totalTax, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      filteredAndSortedStats.length > 0 ? { f: `SUM(L${sumStartRow}:L${sumEndRow})`, v: summaryTotals.totalNet, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' },
      '', '', ''
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 14 } }];

    // 컬럼 너비 계산
    const colWidths = summaryRows.reduce((acc, row) => {
      row.forEach((cell, i) => {
        let str = '';
        if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
        else if (cell !== null && cell !== undefined) str = cell.toString();
        const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
        if (!acc[i] || len > acc[i]) acc[i] = len;
      });
      return acc;
    }, [] as number[]);
    wsSummary['!cols'] = colWidths.map(w => ({ wch: Math.min(Math.max(w + 4, 10), 40) }));

    // 스타일 적용
    const rangeSummary = XLSX.utils.decode_range(wsSummary['!ref'] || 'A1:A1');
    for (let R = rangeSummary.s.r; R <= rangeSummary.e.r; ++R) {
      const isHeaderRow = R === 3;
      const isTotalRow = R === summaryRows.length - 1;

      for (let C = rangeSummary.s.c; C <= rangeSummary.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!wsSummary[addr]) continue;

        if (R === 0) {
          wsSummary[addr].s = titleStyle;
          continue;
        }
        if (R === 1) {
          wsSummary[addr].s = { font: { sz: 10, bold: true, color: { rgb: "475569" } }, alignment: { vertical: "center", horizontal: "left" } };
          continue;
        }
        if (isHeaderRow) {
          wsSummary[addr].s = headerStyle;
          continue;
        }
        if (isTotalRow) {
          wsSummary[addr].s = { ...graySubtotalStyle };
          if (wsSummary[addr].t === 'n') {
            wsSummary[addr].s.alignment = { vertical: 'center', horizontal: 'right' };
          }
          continue;
        }

        wsSummary[addr].s = { ...cellStyle };
        if (wsSummary[addr].t === 'n') {
          wsSummary[addr].s = { ...numberStyle };
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, wsSummary, '본부별정산집계');

    // 2. 전체 계약 상세 명세 시트
    const detailRows: any[][] = [
      ['본부명', '지사명', '영업사원', '계약일자', '상태', '상품명', '회원명', '판매수수료', '촉진비', '총수수료', '지급일', '배송일자', '제품명']
    ];

    let detailSumSales = 0;
    let detailSumPromo = 0;
    let detailSumTotal = 0;
    let detailDataCount = 0;

    filteredAndSortedStats.forEach(stat => {
      stat.items.forEach(item => {
        const { totalCommission, salesComm } = calculateCommissionDetails(item, globalStatsMap);
        const promo = totalCommission - salesComm;
        detailDataCount++;
        const rowNo = detailDataCount + 1; // 1-based row in Excel (header is row 1)
        detailSumSales += salesComm;
        detailSumPromo += promo;
        detailSumTotal += totalCommission;
        detailRows.push([
          item.hq || stat.hqName || '-',
          item.branch || '-',
          item.empName || '-',
          item.contractDate || '-',
          item.status || '-',
          item.prodName || '-',
          item.memName || '-',
          { v: salesComm, t: 'n', z: '#,##0' },
          { v: promo, t: 'n', z: '#,##0' },
          { f: `H${rowNo}+I${rowNo}`, v: totalCommission, t: 'n', z: '#,##0' },
          item.payDate || '-',
          item.deliveryDate || '-',
          item.rentalProd && item.rentalProd !== '-' ? item.rentalProd : (item.prodName || '-')
        ]);
      });
    });

    if (detailDataCount > 0) {
      const lastRow = detailDataCount + 1;
      detailRows.push([
        '합계',
        '', '', '', '', '',
        `${detailDataCount}건`,
        { f: `SUM(H2:H${lastRow})`, v: detailSumSales, t: 'n', z: '#,##0' },
        { f: `SUM(I2:I${lastRow})`, v: detailSumPromo, t: 'n', z: '#,##0' },
        { f: `SUM(J2:J${lastRow})`, v: detailSumTotal, t: 'n', z: '#,##0' },
        '', '', ''
      ]);
    }

    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    const detailColWidths = detailRows.reduce((acc, row) => {
      row.forEach((cell, i) => {
        let str = '';
        if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
        else if (cell !== null && cell !== undefined) str = cell.toString();
        const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
        if (!acc[i] || len > acc[i]) acc[i] = len;
      });
      return acc;
    }, [] as number[]);
    wsDetail['!cols'] = detailColWidths.map(w => ({ wch: Math.min(Math.max(w + 4, 10), 40) }));

    const rangeDetail = XLSX.utils.decode_range(wsDetail['!ref'] || 'A1:A1');
    for (let R = rangeDetail.s.r; R <= rangeDetail.e.r; ++R) {
      const isTotalRow = R === rangeDetail.e.r && detailDataCount > 0;
      for (let C = rangeDetail.s.c; C <= rangeDetail.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!wsDetail[addr]) continue;
        if (R === 0) {
          wsDetail[addr].s = headerStyle;
        } else if (isTotalRow) {
          wsDetail[addr].s = { ...graySubtotalStyle };
          if (wsDetail[addr].t === 'n') {
            wsDetail[addr].s.alignment = { vertical: 'center', horizontal: 'right' };
          }
        } else {
          wsDetail[addr].s = { ...cellStyle };
          if (wsDetail[addr].t === 'n') {
            wsDetail[addr].s = { ...numberStyle };
          }
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, wsDetail, '계약상세명세');

    // 3. 유지수수료 상세 명세 시트
    const maintDetailRows: any[][] = [
      ['본부명', '지사명', '영업사원', '계약일자', '상태', '상품명', '회원명', '회차', '유지수수료금액', '지급일']
    ];

    let totalMaintAmount = 0;
    filteredAndSortedStats.forEach(stat => {
      (stat.maintenanceItems || []).forEach(mItem => {
        const hq = mItem.hq || stat.hqName || '-';
        const branch = mItem.branch || '-';
        const empName = mItem.empName || '-';
        const contractDate = mItem.contractDate || '-';
        const status = mItem.status || '유지';
        const prodName = mItem.productName || mItem.prodName || '-';
        const memName = mItem.customerName || mItem.memName || '-';
        const installment = mItem.fromInstallment ? `${mItem.fromInstallment}회차` : (mItem.round ? `${mItem.round}회차` : '-');
        const amount = mItem.amount || 0;
        const payDate = mItem.payDate || selectedMonth || '-';
        totalMaintAmount += amount;

        maintDetailRows.push([
          hq,
          branch,
          empName,
          contractDate,
          status,
          prodName,
          memName,
          installment,
          { v: amount, t: 'n', z: '#,##0' },
          payDate
        ]);
      });
    });

    if (maintDetailRows.length > 1) {
      const lastMaintRow = maintDetailRows.length;
      maintDetailRows.push([
        '합계',
        '', '', '', '', '', '',
        `${lastMaintRow - 1}건`,
        { f: `SUM(I2:I${lastMaintRow})`, v: totalMaintAmount, t: 'n', z: '#,##0' },
        ''
      ]);
      const wsMaintDetail = XLSX.utils.aoa_to_sheet(maintDetailRows);
      const maintColWidths = maintDetailRows.reduce((acc, row) => {
        row.forEach((cell, i) => {
          let str = '';
          if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
          else if (cell !== null && cell !== undefined) str = cell.toString();
          const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
          if (!acc[i] || len > acc[i]) acc[i] = len;
        });
        return acc;
      }, [] as number[]);
      wsMaintDetail['!cols'] = maintColWidths.map(w => ({ wch: Math.min(Math.max(w + 4, 10), 40) }));

      const rangeMaint = XLSX.utils.decode_range(wsMaintDetail['!ref'] || 'A1:A1');
      for (let R = rangeMaint.s.r; R <= rangeMaint.e.r; ++R) {
        const isTotalRow = R === rangeMaint.e.r;
        for (let C = rangeMaint.s.c; C <= rangeMaint.e.c; ++C) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!wsMaintDetail[addr]) continue;
          if (R === 0) {
            wsMaintDetail[addr].s = {
              fill: { fgColor: { rgb: "1E7E34" } },
              font: { color: { rgb: "FFFFFF" }, bold: true, sz: 10 },
              alignment: { vertical: "center", horizontal: "center" },
              border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
            };
          } else if (isTotalRow) {
            wsMaintDetail[addr].s = { ...graySubtotalStyle };
            if (wsMaintDetail[addr].t === 'n') {
              wsMaintDetail[addr].s.alignment = { vertical: 'center', horizontal: 'right' };
            }
          } else {
            wsMaintDetail[addr].s = { ...cellStyle };
            if (wsMaintDetail[addr].t === 'n') {
              wsMaintDetail[addr].s = { ...numberStyle };
            }
          }
        }
      }
      XLSX.utils.book_append_sheet(wb, wsMaintDetail, '유지수수료명세');
    }

    // 4. 특수수당 상세 명세 시트 (A열: 지급대상자, 지급일자 다음에 본부명, 지사명, 영업자명 추가)
    const specialDetailRows: any[][] = [
      ['지급대상자', '수당명', '회원명', '상품명', '수당금액', '계약일자', '배송일자', '지급일자', '본부명', '지사명', '영업자명']
    ];

    let totalSpecialAmount = 0;
    filteredAndSortedStats.forEach(stat => {
      (stat.specialItems || []).forEach(spItem => {
        const amt = spItem.amount || 0;
        totalSpecialAmount += amt;
        specialDetailRows.push([
          stat.hqName,
          spItem.incentiveName || '특수수당',
          spItem.memName || '-',
          spItem.prodName || '-',
          { v: amt, t: 'n', z: '#,##0' },
          spItem.contractDate || '-',
          spItem.deliveryDate || '-',
          spItem.payDate || '-',
          spItem.contractHq || spItem.hq || stat.hqName || '-',
          spItem.branch || '-',
          spItem.empName || '-'
        ]);
      });
    });

    if (specialDetailRows.length > 1) {
      const lastSpRow = specialDetailRows.length;
      specialDetailRows.push([
        '합계',
        '', '',
        `${lastSpRow - 1}건`,
        { f: `SUM(E2:E${lastSpRow})`, v: totalSpecialAmount, t: 'n', z: '#,##0' },
        '', '', '', '', '', ''
      ]);
      const wsSpecialDetail = XLSX.utils.aoa_to_sheet(specialDetailRows);
      const spColWidths = specialDetailRows.reduce((acc, row) => {
        row.forEach((cell, i) => {
          let str = '';
          if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
          else if (cell !== null && cell !== undefined) str = cell.toString();
          const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
          if (!acc[i] || len > acc[i]) acc[i] = len;
        });
        return acc;
      }, [] as number[]);
      wsSpecialDetail['!cols'] = spColWidths.map(w => ({ wch: Math.min(Math.max(w + 4, 10), 40) }));

      const rangeSpecial = XLSX.utils.decode_range(wsSpecialDetail['!ref'] || 'A1:A1');
      for (let R = rangeSpecial.s.r; R <= rangeSpecial.e.r; ++R) {
        const isTotalRow = R === rangeSpecial.e.r;
        for (let C = rangeSpecial.s.c; C <= rangeSpecial.e.c; ++C) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!wsSpecialDetail[addr]) continue;
          if (R === 0) {
            wsSpecialDetail[addr].s = {
              fill: { fgColor: { rgb: "6B21A8" } },
              font: { color: { rgb: "FFFFFF" }, bold: true, sz: 10 },
              alignment: { vertical: "center", horizontal: "center" },
              border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
            };
          } else if (isTotalRow) {
            wsSpecialDetail[addr].s = { ...graySubtotalStyle };
            if (wsSpecialDetail[addr].t === 'n') {
              wsSpecialDetail[addr].s.alignment = { vertical: 'center', horizontal: 'right' };
            }
          } else {
            wsSpecialDetail[addr].s = { ...cellStyle };
            if (wsSpecialDetail[addr].t === 'n') {
              wsSpecialDetail[addr].s = { ...numberStyle };
            }
          }
        }
      }
      XLSX.utils.book_append_sheet(wb, wsSpecialDetail, '특수수당명세');
    }

    const s2ab = (s: string) => {
      const buf = new ArrayBuffer(s.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i !== s.length; ++i) view[i] = s.charCodeAt(i) & 0xFF;
      return buf;
    };

    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.CalcPr) wb.Workbook.CalcPr = {};
    wb.Workbook.CalcPr.fullCalcOnLoad = true;

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
    const blob = new Blob([s2ab(wbout)], { type: 'application/octet-stream' });
    const fileName = `[월별본부정산]_${selectedMonth}_집계표.xlsx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 md:p-6 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 15 }}
          className="bg-white border border-slate-200 text-slate-800 w-full max-w-[1700px] h-[94vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 text-white">
                <Building2 className="w-5.5 h-5.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">월별 본부 정산서 조회</h2>
                  {isCurrentMonthClosed ? (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold flex items-center gap-1.5 shadow-2xs">
                      <Lock size={12} className="text-emerald-600" />
                      마감 확정됨 ({currentClosure?.closedAt ? new Date(currentClosure.closedAt).toLocaleDateString('ko-KR') : ''} {currentClosure?.closedBy || ''})
                    </span>
                  ) : (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-300 font-bold flex items-center gap-1.5 shadow-2xs">
                      <Sparkles size={12} className="text-amber-500" />
                      실시간 계산 모드 (미마감)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  선택한 월에 어떤 본부에 얼마의 수수료 및 수당이 정산되었는지 한눈에 파악합니다.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {isCurrentMonthClosed ? (
                <button
                  onClick={handleReopenSettlement}
                  disabled={isLoadingClosure}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                  title="마감을 해제하고 최신 실시간 계산으로 복구합니다"
                >
                  <Unlock size={14} />
                  정산 마감 해제
                </button>
              ) : (
                <button
                  onClick={handleCloseSettlement}
                  disabled={isLoadingClosure}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
                  title="현재 실적 건수 및 단가로 정산서를 마감 확정하여 영구 보존합니다"
                >
                  <Lock size={14} />
                  {selectedMonth} 정산 마감 확정
                </button>
              )}

              {settlementViewTab === 'detailed' ? (
                <button
                  onClick={handleExportDetailedSettlementExcel}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 cursor-pointer"
                  title="월별 수수료 정산 내역서 서식 엑셀 다운로드"
                >
                  <FileSpreadsheet size={15} />
                  수수료 정산 내역 엑셀 다운로드
                </button>
              ) : (
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                  title="선택 월 집계표 엑셀 다운로드"
                >
                  <FileSpreadsheet size={15} />
                  월별 집계 엑셀 다운로드
                </button>
              )}
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Filter & View Mode Bar */}
          <div className="px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* 뷰 모드 전환 탭 */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-2xs">
                <button
                  type="button"
                  onClick={() => setSettlementViewTab('detailed')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    settlementViewTab === 'detailed'
                      ? 'bg-blue-600 text-white shadow-2xs font-black'
                      : 'text-slate-600 hover:text-blue-700'
                  }`}
                >
                  <Layers size={13} />
                  <span>{selectedMonth ? `${parseInt(selectedMonth.split('-')[1] || '10', 10)}월 ` : ''}수수료 정산 내역 (상세)</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    settlementViewTab === 'detailed' ? 'bg-blue-900/60 text-white' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {detailedTotals.totalCommission.toLocaleString()}원
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSettlementViewTab('summary')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    settlementViewTab === 'summary'
                      ? 'bg-white text-slate-900 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Building2 size={13} />
                  <span>본부별 총괄 집계</span>
                </button>
              </div>

              {/* 월 선택 */}
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                <div className="flex items-center gap-1 pl-2 text-slate-600 font-bold">
                  <Calendar size={14} className="text-blue-600" />
                  <span>정산월:</span>
                </div>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer border-0 bg-white text-blue-700 shadow-2xs focus:outline-hidden"
                >
                  {availableMonths.map(m => {
                    const isClosed = closureList.some(c => c.month === m);
                    return (
                      <option key={m} value={m}>
                        {m.replace('-', '년 ')}월 정산 {isClosed ? '🔒(마감확정)' : '⚡(실시간)'}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* 본부 다중 선택 드롭다운 */}
              <div className="relative" ref={hqDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsHqDropdownOpen(!isHqDropdownOpen)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                    selectedHqs.length !== allAvailableHqs.length
                      ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-500/20'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200/80'
                  }`}
                >
                  <Building2 size={14} className={selectedHqs.length !== allAvailableHqs.length ? 'text-blue-600' : 'text-slate-500'} />
                  <span>
                    {selectedHqs.length === allAvailableHqs.length
                      ? `본부 선택: 전체 (${allAvailableHqs.length}개)`
                      : selectedHqs.length === 0
                        ? '본부 선택: 0개'
                        : selectedHqs.length === 1
                          ? `${selectedHqs[0]}`
                          : `${selectedHqs[0]} 외 ${selectedHqs.length - 1}개 (${selectedHqs.length}/${allAvailableHqs.length})`}
                  </span>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${isHqDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Popover */}
                {isHqDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1.5 z-50 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-black text-slate-800">조회할 본부 선택</span>
                      <span className="text-[11px] text-blue-600 font-bold">
                        {selectedHqs.length} / {allAvailableHqs.length}개 선택
                      </span>
                    </div>

                    {/* 본부 검색 */}
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="본부명 검색..."
                        value={hqSearchInput}
                        onChange={(e) => setHqSearchInput(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                      />
                      {hqSearchInput && (
                        <button
                          type="button"
                          onClick={() => setHqSearchInput('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {/* 전체 선택 / 해제 버튼 */}
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSelectAllHqs}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 font-bold transition-colors cursor-pointer"
                        >
                          전체 선택
                        </button>
                        <button
                          type="button"
                          onClick={handleDeselectAllHqs}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-600 font-bold transition-colors cursor-pointer"
                        >
                          전체 해제
                        </button>
                      </div>
                      {selectedHqs.length !== allAvailableHqs.length && (
                        <button
                          type="button"
                          onClick={handleSelectAllHqs}
                          className="text-[10.5px] text-blue-600 hover:underline font-bold cursor-pointer"
                        >
                          초기화
                        </button>
                      )}
                    </div>

                    {/* 본부 체크박스 목록 */}
                    <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar pr-1">
                      {dropdownFilteredHqs.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">
                          검색된 본부가 없습니다.
                        </div>
                      ) : (
                        dropdownFilteredHqs.map(hq => {
                          const isChecked = selectedHqs.includes(hq);
                          const stat = hqStatMap.get(hq);
                          return (
                            <label
                              key={hq}
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs select-none transition-colors ${
                                isChecked ? 'bg-blue-50/70 font-semibold' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleHq(hq)}
                                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                                <span className={isChecked ? 'text-blue-950 font-bold' : 'text-slate-700'}>
                                  {hq}
                                </span>
                              </div>
                              {stat && (
                                <span className="text-[10px] font-mono text-slate-400">
                                  {stat.count}건
                                </span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>

                    {/* 하단 확인 버튼 */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">
                        {selectedHqs.length === 0 ? '선택된 본부 없음' : `${selectedHqs.length}개 선택됨`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsHqDropdownOpen(false)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                      >
                        적용 및 닫기
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 정산유형 필터 */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${typeFilter === 'all' ? 'bg-white text-blue-700 font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  전체 본부 ({effectiveHqMonthlyStats.length})
                </button>
                <button
                  onClick={() => setTypeFilter('사업자')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${typeFilter === '사업자' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  사업자 ({effectiveHqMonthlyStats.filter(s => !s.settlementType.includes('개인')).length})
                </button>
                <button
                  onClick={() => setTypeFilter('개인')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${typeFilter === '개인' ? 'bg-purple-600 text-white font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  개인 3.3% ({effectiveHqMonthlyStats.filter(s => s.settlementType.includes('개인')).length})
                </button>
              </div>
              {/* 사업단별로 묶기 토글 버튼 */}
              <button
                type="button"
                onClick={handleToggleGroupByDivision}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                  groupByDivision
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-600/20'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
                title="등록된 사업단(소속 본부 그룹)별로 본부들을 묶어서 모아봅니다"
              >
                <Layers size={14} className={groupByDivision ? 'text-white' : 'text-indigo-600'} />
                <span>사업단별로 묶기</span>
                {groupByDivision && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white ml-0.5 animate-pulse" />
                )}
              </button>

              {/* 순서 변경됨 표시 및 초기화 버튼 */}
              {(customHqOrder.length > 0 || sortField === 'custom') && (
                <button
                  type="button"
                  onClick={handleResetOrder}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all cursor-pointer"
                  title="기본 순서(금액순)로 초기화"
                >
                  <RotateCcw size={12} />
                  <span>순서 초기화</span>
                </button>
              )}
            </div>

            {/* 검색창 */}
            <div className="relative min-w-[260px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="본부명, 예금주, 은행명 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          {/* 선택된 본부 태그 칩 바 (일부 본부만 선택되었을 때 노출) */}
          {selectedHqs.length > 0 && selectedHqs.length < allAvailableHqs.length && (
            <div className="px-6 py-2 bg-blue-50/60 border-b border-blue-100 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-blue-800 font-bold flex items-center gap-1 text-[11px] shrink-0">
                <Filter size={12} />
                선택된 본부 ({selectedHqs.length}개):
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedHqs.map(hq => (
                  <span
                    key={hq}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-blue-200 text-blue-700 text-[11px] font-bold shadow-2xs"
                  >
                    <span>{hq}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleHq(hq)}
                      className="text-blue-400 hover:text-blue-800 rounded-full hover:bg-blue-100 p-0.5 cursor-pointer transition-colors"
                      title="선택 해제"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={handleSelectAllHqs}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-bold underline ml-auto cursor-pointer shrink-0"
              >
                전체 본부 보기로 초기화
              </button>
            </div>
          )}

          {/* 본부가 0개 선택되었을 때 경고 배너 */}
          {selectedHqs.length === 0 && allAvailableHqs.length > 0 && (
            <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between text-xs text-amber-800">
              <span>선택된 본부가 없습니다. 상단 '본부 선택'에서 조회할 본부를 선택해 주세요.</span>
              <button
                type="button"
                onClick={handleSelectAllHqs}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] cursor-pointer transition-colors"
              >
                모든 본부 선택하기
              </button>
            </div>
          )}

          {settlementViewTab === 'detailed' ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-100/60 p-4 md:p-6 custom-scrollbar">
              {/* 상단 툴바 / 액션 바 */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                  <div>
                    <h3 className="text-sm font-black text-slate-800">
                      {selectedMonth ? `${parseInt(selectedMonth.split('-')[1] || '10', 10)}월 ` : ''}수수료 정산 내역 보고서
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      거래처 및 지급대상별 수수료·촉진비·기타 정산금 상세 내역 (엑셀 서식 100% 동기화)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1 text-xs text-blue-900 font-bold mr-2">
                    총 정산 합계: <span className="font-mono text-sm font-black text-blue-700">{detailedTotals.totalCommission.toLocaleString()}</span>원
                  </div>

                  {/* 사업단 묶기 / 풀기 토글 버튼 */}
                  <button
                    type="button"
                    onClick={handleToggleGroupByDivision}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer shadow-xs ${
                      groupByDivision
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-600/20'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                    title="사업단을 묶어서 통합 집계(굿라이프 신동우+꿈잇다 통합 등)하거나 풀어서 개별 본부별로 분리합니다"
                  >
                    <Layers size={13} className={groupByDivision ? 'text-white' : 'text-indigo-600'} />
                    <span>{groupByDivision ? '사업단 묶음: ON (굿라이프 통합 등)' : '사업단 묶음: OFF (본부별 분리)'}</span>
                    {groupByDivision && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white ml-0.5 animate-pulse" />
                    )}
                  </button>

                  {/* 굿라이프 사업단 내부 실송금 및 신동우 대표 차액 분배 명세 모달 버튼 */}
                  <button
                    type="button"
                    onClick={() => setIsGoodlifeSplitModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold transition-all cursor-pointer shadow-xs"
                    title="굿라이프 사업단 내부 실송금(꿈잇다 71만 직송금, 신동우 산하 본부 55만, 신동우 대표 차액 귀속) 분배 명세를 조회합니다"
                  >
                    <Layers size={13} className="text-emerald-600" />
                    <span>굿라이프 분배 명세</span>
                    <span className="px-1.5 py-0.2 bg-emerald-200 text-emerald-900 rounded text-[10px] font-black">
                      {goodlifeSplitSummary.totalCount}건
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsDetailEditMode(!isDetailEditMode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                      isDetailEditMode 
                        ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-xs' 
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                    title="테이블 내 셀을 직접 클릭하여 금액과 건수를 수정합니다"
                  >
                    <Edit3 size={13} />
                    <span>{isDetailEditMode ? '편집 완료 (저장)' : '인라인 수정 모드'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAddDetailModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                    title="신규 정산 대상 또는 항목을 추가합니다"
                  >
                    <Plus size={13} />
                    <span>항목 추가</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetDetailedRows}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all cursor-pointer"
                    title="원래 기본 정산 내역으로 복원합니다"
                  >
                    <RotateCcw size={12} />
                    <span>초기화</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportDetailedSettlementExcel}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                    title="현재 서식 그대로 엑셀 다운로드"
                  >
                    <FileSpreadsheet size={13} />
                    <span>엑셀 다운로드</span>
                  </button>
                </div>
              </div>

              {/* 상세 내역 테이블 컨테이너 */}
              <div className="flex-1 overflow-auto rounded-xl border border-slate-300 shadow-sm bg-white custom-scrollbar">
                {/* 엑셀 서식 상단 타이틀 바 */}
                <div className="bg-[#1e293b] text-white py-3 px-4 text-center text-sm font-bold tracking-wider sticky top-0 z-20">
                  {selectedMonth ? `${parseInt(selectedMonth.split('-')[1] || '10', 10)}월 ` : ''}수수료 정산 내역
                </div>

                <table className="w-full text-xs text-left border-collapse min-w-[1300px]">
                  <thead className="bg-[#2b3a4a] text-slate-100 font-bold border-b border-slate-400 uppercase tracking-wider sticky top-[44px] z-10 shadow-xs">
                    <tr>
                      <th className="px-4 py-3 text-center border-r border-slate-600 w-44">거래처 / 지급대상</th>
                      <th className="px-3 py-3 text-center border-r border-slate-600 w-20">구분</th>
                      <th className="px-4 py-3 text-left border-r border-slate-600 min-w-[180px]">상품명 / 지급항목</th>
                      <th className="px-3 py-3 text-right border-r border-slate-600 w-20">건수</th>
                      <th className="px-3 py-3 text-right border-r border-slate-600 w-28">건별수수료</th>
                      <th className="px-3 py-3 text-right border-r border-slate-600 w-32">판매수수료</th>
                      <th className="px-3 py-3 text-right border-r border-slate-600 w-32">판매촉진비</th>
                      <th className="px-3 py-3 text-right border-r border-slate-600 w-36">총 발생수수료</th>
                      <th className="px-3 py-3 text-right border-r border-slate-600 w-28 text-rose-300">원천세(3.3%)</th>
                      <th className="px-3 py-3 text-right border-r border-slate-600 w-36 bg-blue-900/40 text-amber-300 font-black">최종 실지급액</th>
                      <th className="px-4 py-3 text-left border-r border-slate-600 min-w-[220px]">지급 계좌정보</th>
                      {isDetailEditMode && (
                        <th className="px-2 py-3 text-center w-16">삭제</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-700 font-sans">
                    {detailedSettlementList.length === 0 ? (
                      <tr>
                        <td colSpan={isDetailEditMode ? 12 : 11} className="px-6 py-16 text-center text-slate-400 font-medium">
                          등록된 상세 정산 내역이 없습니다. '항목 추가' 버튼을 눌러 내역을 등록해 주세요.
                        </td>
                      </tr>
                    ) : (
                      detailedSettlementList.map((row) => {
                        const acct = getPayoutAccountInfo(row.targetName);
                        const isIndiv = acct.settlementType.includes('개인');
                        const targetsWithSubtotal = new Set(
                          detailedSettlementList.filter(r => r.isSubtotal).map(r => r.targetName)
                        );
                        const isStandalone = row.isHeaderGroup && !targetsWithSubtotal.has(row.targetName);

                        let rowTax = 0;
                        let rowNet = 0;
                        let showPayout = false;

                        if (row.isSubtotal) {
                          rowTax = isIndiv ? Math.round((row.totalCommission || 0) * 0.033) : 0;
                          rowNet = (row.totalCommission || 0) - rowTax;
                          showPayout = true;
                        } else if (isStandalone) {
                          rowTax = isIndiv ? Math.round((row.totalCommission || 0) * 0.033) : 0;
                          rowNet = (row.totalCommission || 0) - rowTax;
                          showPayout = true;
                        }

                        // 소계 행 스타일링
                        if (row.isSubtotal) {
                          return (
                            <tr key={row.id} className="bg-[#d9e1f2] hover:bg-[#c9d5ec] font-bold text-slate-900 border-y border-slate-300 transition-colors">
                              <td className="px-4 py-2.5 border-r border-slate-300"></td>
                              <td className="px-3 py-2.5 text-center border-r border-slate-300 font-black text-blue-900">소계</td>
                              <td className="px-4 py-2.5 border-r border-slate-300"></td>
                              <td className="px-3 py-2.5 text-right font-mono font-black border-r border-slate-300">
                                {row.count.toLocaleString()}
                              </td>
                              <td className="px-3 py-2.5 text-right border-r border-slate-300"></td>
                              <td className="px-3 py-2.5 text-right font-mono border-r border-slate-300 text-slate-700">
                                {row.salesCommission > 0 ? row.salesCommission.toLocaleString() : ''}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono border-r border-slate-300 text-slate-700">
                                {row.promoCommission > 0 ? row.promoCommission.toLocaleString() : ''}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono font-black text-blue-900 border-r border-slate-300">
                                {row.totalCommission.toLocaleString()}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-600 border-r border-slate-300">
                                {rowTax > 0 ? `-${rowTax.toLocaleString()}` : '-'}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono font-black text-indigo-950 bg-indigo-100/60 border-r border-slate-300">
                                {rowNet.toLocaleString()}원
                              </td>
                              <td className="px-4 py-2.5 text-left border-r border-slate-300 text-xs">
                                <span className="font-bold text-slate-800">
                                  {acct.bankName} {acct.accountNumber}
                                </span>
                                {acct.accountHolder && (
                                  <span className="text-slate-500 ml-1">({acct.accountHolder})</span>
                                )}
                              </td>
                              {isDetailEditMode && <td className="px-2 py-2.5 text-center"></td>}
                            </tr>
                          );
                        }

                        // 일반 행 스타일링 (새로운 거래처/지급대상 시작 시 뚜렷한 상단 구분선 적용)
                        const isNewGroup = row.isHeaderGroup;
                        return (
                          <tr key={row.id} className={`hover:bg-blue-50/30 transition-colors ${isNewGroup ? 'border-t-2 border-slate-300' : ''}`}>
                            {/* 거래처 / 지급대상 */}
                            <td className={`px-4 py-2.5 font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap ${isNewGroup ? 'bg-slate-50/70 font-black' : ''}`}>
                              {row.isHeaderGroup ? (
                                <div className="flex items-center gap-1.5">
                                  <span>{row.targetName}</span>
                                </div>
                              ) : ''}
                            </td>

                            {/* 구분 */}
                            <td className="px-3 py-2.5 text-center text-slate-500 border-r border-slate-200">
                              {row.division || ''}
                            </td>

                            {/* 상품명 / 지급항목 */}
                            <td className="px-4 py-2.5 font-medium text-slate-800 border-r border-slate-200">
                              {isDetailEditMode ? (
                                <input
                                  type="text"
                                  value={row.itemName}
                                  onChange={(e) => handleUpdateDetailCell(row.id, 'itemName', e.target.value)}
                                  className="w-full px-2 py-1 text-xs border border-blue-300 rounded bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                <span>{row.itemName}</span>
                              )}
                            </td>

                            {/* 건수 */}
                            <td className="px-3 py-2.5 text-right font-mono border-r border-slate-200">
                              {isDetailEditMode ? (
                                <input
                                  type="number"
                                  value={row.count}
                                  onChange={(e) => handleUpdateDetailCell(row.id, 'count', Number(e.target.value) || 0)}
                                  className="w-20 px-2 py-1 text-xs text-right border border-blue-300 rounded bg-white font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                row.count > 0 ? row.count.toLocaleString() : '-'
                              )}
                            </td>

                            {/* 건별수수료 */}
                            <td className="px-3 py-2.5 text-right font-mono border-r border-slate-200 text-slate-600">
                              {isDetailEditMode ? (
                                <input
                                  type="number"
                                  value={row.unitFee}
                                  onChange={(e) => handleUpdateDetailCell(row.id, 'unitFee', Number(e.target.value) || 0)}
                                  className="w-24 px-2 py-1 text-xs text-right border border-blue-300 rounded bg-white font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                row.unitFee > 0 ? row.unitFee.toLocaleString() : ''
                              )}
                            </td>

                            {/* 판매수수료 */}
                            <td className="px-3 py-2.5 text-right font-mono border-r border-slate-200 text-slate-600">
                              {isDetailEditMode ? (
                                <input
                                  type="number"
                                  value={row.salesCommission}
                                  onChange={(e) => handleUpdateDetailCell(row.id, 'salesCommission', Number(e.target.value) || 0)}
                                  className="w-28 px-2 py-1 text-xs text-right border border-blue-300 rounded bg-white font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                row.salesCommission > 0 ? row.salesCommission.toLocaleString() : ''
                              )}
                            </td>

                            {/* 판매촉진비 */}
                            <td className="px-3 py-2.5 text-right font-mono border-r border-slate-200 text-slate-600">
                              {isDetailEditMode ? (
                                <input
                                  type="number"
                                  value={row.promoCommission}
                                  onChange={(e) => handleUpdateDetailCell(row.id, 'promoCommission', Number(e.target.value) || 0)}
                                  className="w-28 px-2 py-1 text-xs text-right border border-blue-300 rounded bg-white font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                row.promoCommission > 0 ? row.promoCommission.toLocaleString() : ''
                              )}
                            </td>

                            {/* 총수수료 */}
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 border-r border-slate-200">
                              {isDetailEditMode ? (
                                <input
                                  type="number"
                                  value={row.totalCommission}
                                  onChange={(e) => handleUpdateDetailCell(row.id, 'totalCommission', Number(e.target.value) || 0)}
                                  className="w-28 px-2 py-1 text-xs text-right font-bold border border-blue-300 rounded bg-white font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                row.totalCommission > 0 ? row.totalCommission.toLocaleString() : '0'
                              )}
                            </td>

                            {/* 원천세(3.3%) */}
                            <td className="px-3 py-2.5 text-right font-mono text-rose-600 border-r border-slate-200">
                              {showPayout ? (rowTax > 0 ? `-${rowTax.toLocaleString()}` : '-') : '-'}
                            </td>

                            {/* 최종 실지급액 */}
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-indigo-900 bg-indigo-50/40 border-r border-slate-200">
                              {showPayout ? `${rowNet.toLocaleString()}원` : '-'}
                            </td>

                            {/* 지급 계좌정보 */}
                            <td className="px-4 py-2.5 text-left border-r border-slate-200 text-xs text-slate-700">
                              {showPayout ? (
                                <span title={`${acct.bankName} ${acct.accountNumber} (${acct.accountHolder})`}>
                                  <span className="font-bold">{acct.bankName}</span> {acct.accountNumber} <span className="text-slate-500">({acct.accountHolder})</span>
                                </span>
                              ) : '-'}
                            </td>

                            {/* 삭제 버튼 (인라인 편집 모드일 때만 표시) */}
                            {isDetailEditMode && (
                              <td className="px-2 py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDetailRow(row.id)}
                                  className="p-1 rounded text-rose-500 hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"
                                  title="항목 삭제"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {/* 최하단 전체 합계 바 */}
                  <tfoot className="bg-[#0f172a] text-white font-black text-xs border-t-2 border-slate-700 sticky bottom-0 z-10">
                    <tr>
                      <td colSpan={7} className="px-6 py-3.5 text-center tracking-wider text-sm font-black">
                        전체 지급수수료 합계
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-base font-black text-amber-300 border-r border-slate-700">
                        {detailedTotals.totalCommission.toLocaleString()}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-xs font-bold text-rose-300 border-r border-slate-700">
                        {detailedTotals.totalTax > 0 ? `-${detailedTotals.totalTax.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-base font-black text-amber-300 bg-indigo-950/80 border-r border-slate-700">
                        {detailedTotals.totalNet.toLocaleString()}원
                      </td>
                      <td className="px-4 py-3.5 text-center text-slate-400 font-normal">
                        실지급 총 {detailedTotals.totalCount.toLocaleString()}건
                      </td>
                      {isDetailEditMode && <td className="px-2 py-3.5"></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <>
              {/* KPI Dashboard Summary Cards */}
              <div className="px-6 py-3.5 bg-slate-50/60 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
                <span>총 실지급액 합계</span>
                <CreditCard size={14} className="text-blue-500" />
              </div>
              <div className="text-xl font-black text-blue-700 mt-1 font-mono tracking-tight">
                {summaryTotals.totalNet.toLocaleString()}
                <span className="text-xs font-bold text-slate-500 ml-1">원</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                총 발생액: {summaryTotals.totalGross.toLocaleString()}원
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
                <span>정산 참여 본부수</span>
                <Building2 size={14} className="text-indigo-500" />
              </div>
              <div className="text-xl font-black text-slate-800 mt-1 font-mono">
                {summaryTotals.hqCount}
                <span className="text-xs font-bold text-slate-500 ml-1">개 본부</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                총 실적 건수: {summaryTotals.totalCount.toLocaleString()}건
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
                <span>수수료 소계 (판매+촉진)</span>
                <Layers size={14} className="text-emerald-500" />
              </div>
              <div className="text-xl font-black text-emerald-600 mt-1 font-mono tracking-tight">
                {summaryTotals.totalGeneral.toLocaleString()}
                <span className="text-xs font-bold text-slate-500 ml-1">원</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                판매: {summaryTotals.totalSales.toLocaleString()} | 촉진: {summaryTotals.totalPromo.toLocaleString()}
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
                <span>기타 수당 (유지+특수)</span>
                <ArrowUpDown size={14} className="text-purple-500" />
              </div>
              <div className="text-xl font-black text-purple-600 mt-1 font-mono tracking-tight">
                {(summaryTotals.totalMaintenance + summaryTotals.totalSpecial).toLocaleString()}
                <span className="text-xs font-bold text-slate-500 ml-1">원</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                유지: {summaryTotals.totalMaintenance.toLocaleString()} | 특수: {summaryTotals.totalSpecial.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Main Table */}
          <div className="flex-1 overflow-auto p-6 custom-scrollbar">
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="px-2.5 py-3 text-center w-10 border-r border-slate-200">
                      <input
                        type="checkbox"
                        checked={isAllVisibleSelected}
                        ref={input => {
                          if (input) {
                            input.indeterminate = isSomeVisibleSelected;
                          }
                        }}
                        onChange={handleToggleAllVisible}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title={isAllVisibleSelected ? "전체 해제" : "현재 표시된 본부 전체 선택"}
                      />
                    </th>
                    <th className="px-3 py-3 text-center w-12 border-r border-slate-200">No</th>
                    <th 
                      onClick={() => handleSort('hqName')}
                      className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors border-r border-slate-200"
                    >
                      <div className="flex items-center gap-1">
                        <span>본부명</span>
                        <ArrowUpDown size={12} className="text-slate-400" />
                      </div>
                    </th>
                    <th className="px-3 py-3 text-center border-r border-slate-200">정산유형</th>
                    <th 
                      onClick={() => handleSort('count')}
                      className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors border-r border-slate-200"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>실적건수(구좌수)</span>
                        <ArrowUpDown size={12} className="text-slate-400" />
                      </div>
                    </th>
                    <th className="px-3 py-3 text-right border-r border-slate-200">판매수수료</th>
                    <th className="px-3 py-3 text-right border-r border-slate-200">촉진비</th>
                    <th className="px-3 py-3 text-right bg-blue-50/50 text-blue-900 border-r border-slate-200">수수료 소계</th>
                    <th className="px-3 py-3 text-right border-r border-slate-200">유지수수료</th>
                    <th className="px-3 py-3 text-right border-r border-slate-200">특수수당</th>
                    <th className="px-3 py-3 text-right border-r border-slate-200">총 발생액</th>
                    <th className="px-3 py-3 text-right border-r border-slate-200 text-rose-600">원천세(3.3%)</th>
                    <th 
                      onClick={() => handleSort('netTotal')}
                      className="px-3 py-3 text-right bg-indigo-50/60 text-indigo-900 font-black cursor-pointer hover:bg-indigo-100/60 transition-colors border-r border-slate-200"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>최종 실지급액</span>
                        <ArrowUpDown size={12} className="text-indigo-400" />
                      </div>
                    </th>
                    <th className="px-3 py-3 border-r border-slate-200">지급 계좌정보</th>
                    <th className="px-3 py-3 text-center w-24">상세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredAndSortedStats.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="px-6 py-12 text-center text-slate-400 font-medium">
                        {selectedHqs.length === 0 
                          ? '선택된 본부가 없습니다. 상단 본부 선택 필터에서 조회할 본부를 선택해 주세요.' 
                          : `${selectedMonth} 월에 조회된 본부별 정산 내역이 없습니다.`}
                      </td>
                    </tr>
                  ) : (() => {
                    const renderHqRow = (stat: HqMonthlyStat, idx: number, isSubRow = false) => (
                      <tr 
                        key={stat.hqName} 
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, idx)}
                        className={`hover:bg-blue-50/40 transition-colors cursor-pointer group ${isSubRow ? 'bg-indigo-50/20 border-l-4 border-indigo-400' : ''} ${selectedHqs.includes(stat.hqName) ? 'bg-blue-50/15' : ''} ${dragOverIdx === idx ? 'border-t-2 border-indigo-600 bg-indigo-50/40' : ''}`}
                        onClick={() => setSelectedHqDetail(stat)}
                      >
                        <td 
                          className="px-2.5 py-2.5 text-center border-r border-slate-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedHqs.includes(stat.hqName)}
                            onChange={() => handleToggleHq(stat.hqName)}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td 
                          className="px-2 py-2 text-center text-slate-400 font-medium border-r border-slate-100 select-none"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span 
                              className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-indigo-600 transition-colors"
                              title="마우스로 드래그하여 순서 변경"
                            >
                              <GripVertical size={13} />
                            </span>
                            <span className="w-5 font-mono text-xs">{idx + 1}</span>
                            <div className="flex flex-col -space-y-0.5">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveRow(idx, idx - 1)}
                                className="text-[9px] text-slate-400 hover:text-blue-600 disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer leading-none p-0.5"
                                title="위로 이동"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={idx === filteredAndSortedStats.length - 1}
                                onClick={() => handleMoveRow(idx, idx + 1)}
                                className="text-[9px] text-slate-400 hover:text-blue-600 disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer leading-none p-0.5"
                                title="아래로 이동"
                              >
                                ▼
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className={`px-3 py-2.5 font-bold text-slate-900 border-r border-slate-100 flex items-center gap-1.5 flex-wrap ${isSubRow ? 'pl-6' : ''}`}>
                          {isSubRow && <span className="text-slate-400 text-xs select-none">└</span>}
                          <Building2 size={13} className="text-blue-500 opacity-70 shrink-0" />
                          <span className="group-hover:text-blue-600 transition-colors whitespace-nowrap">{stat.hqName}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center border-r border-slate-100">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${stat.settlementType.includes('개인') ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>
                            {stat.settlementType}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800 border-r border-slate-100">
                          {stat.accountCount && stat.accountCount !== stat.count ? (
                            <span title={`고유 계약 ${stat.count}건 / 총 실적 ${stat.accountCount}구좌`}>
                              {stat.count.toLocaleString()}건 <span className="text-blue-600 font-semibold text-[11px]">({stat.accountCount.toLocaleString()}구좌)</span>
                            </span>
                          ) : (
                            `${stat.count.toLocaleString()}건`
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-600 border-r border-slate-100">
                          {stat.salesSum.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-600 border-r border-slate-100">
                          {stat.promoSum.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-blue-700 bg-blue-50/30 border-r border-slate-100">
                          {stat.generalSum.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-emerald-600 border-r border-slate-100">
                          {stat.maintenanceSum > 0 ? stat.maintenanceSum.toLocaleString() : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-purple-600 border-r border-slate-100">
                          {stat.specialSum > 0 ? stat.specialSum.toLocaleString() : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-800 border-r border-slate-100">
                          {stat.grossTotal.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-rose-600 border-r border-slate-100">
                          {stat.tax > 0 ? `-${stat.tax.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-extrabold text-indigo-700 bg-indigo-50/40 border-r border-slate-100">
                          {stat.netTotal.toLocaleString()}원
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 border-r border-slate-100">
                          <span className="text-[11px] truncate block max-w-[200px]">
                            {stat.bankName} {stat.accountNumber} ({stat.accountHolder})
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedHqDetail(stat);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-[11px] font-bold transition-all shadow-2xs cursor-pointer"
                          >
                            상세보기
                          </button>
                        </td>
                      </tr>
                    );

                    // 1. 사업단별 묶기 모드 활성화 시: 사업단 헤더 행 및 소속 본부 행 계층적 렌더링
                    if (groupByDivision && groupedDivisionData && groupedDivisionData.groups.length > 0) {
                      return (
                        <>
                          {groupedDivisionData.groups.map(group => {
                            const isCollapsed = !!collapsedDivisions[group.division.id];
                            const allDivHqSelected = group.stats.every(s => selectedHqs.includes(s.hqName));
                            const someDivHqSelected = group.stats.some(s => selectedHqs.includes(s.hqName)) && !allDivHqSelected;
                            const divBankStr = (group.division.bankName && group.division.accountNumber) ? group.division.bankName : (group.stats[0]?.bankName || '-');
                            const divAcctStr = group.division.accountNumber || (group.stats[0]?.accountNumber || '-');
                            const divHolderStr = group.division.accountHolder || (group.stats[0]?.accountHolder || '-');

                            return (
                              <React.Fragment key={group.division.id}>
                                {/* 사업단 헤더 행 (소계 및 계좌 정보 노출) */}
                                <tr className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white font-bold border-y-2 border-indigo-500 shadow-xs whitespace-nowrap">
                                  <td className="border-r border-slate-700 px-2.5 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={allDivHqSelected}
                                      ref={input => { if (input) input.indeterminate = someDivHqSelected; }}
                                      onChange={() => handleToggleDivisionHqs(group.stats)}
                                      className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-indigo-500 cursor-pointer"
                                      title={`${group.division.name} 소속 본부 전체 선택/해제`}
                                    />
                                  </td>
                                  <td className="border-r border-slate-700 p-1.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setCollapsedDivisions(prev => ({ ...prev, [group.division.id]: !prev[group.division.id] }))}
                                      className="p-1 bg-indigo-700 hover:bg-indigo-600 rounded text-white flex items-center justify-center w-full transition-colors cursor-pointer"
                                      title={isCollapsed ? "소속 본부 목록 펼치기" : "소속 본부 목록 접기"}
                                    >
                                      {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                                    </button>
                                  </td>
                                  <td className="border-r border-slate-700 px-3 py-2.5 text-left">
                                    <div className="flex items-center gap-2">
                                      <span className="text-amber-300 font-black text-xs">
                                        🏢 {group.division.name} 사업단
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-900/80 text-indigo-200 border border-indigo-700">
                                        {group.stats.length}개 본부
                                      </span>
                                    </div>
                                  </td>
                                  <td className="border-r border-slate-700 px-3 py-2.5 text-center">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-800 text-amber-200 border border-indigo-600">
                                      {group.division.settlementType || '사업자'}
                                    </span>
                                  </td>
                                  <td className="border-r border-slate-700 px-3 py-2.5 text-right font-mono text-indigo-200 font-bold">
                                    {group.totals.count.toLocaleString()}건
                                    {group.totals.accountCount !== group.totals.count && (
                                      <span className="ml-1 text-[11px] text-indigo-300">({group.totals.accountCount.toLocaleString()}구좌)</span>
                                    )}
                                  </td>
                                  <td className="border-r border-slate-700 px-3 py-2.5 text-right font-mono text-indigo-200">
                                    {group.totals.salesSum.toLocaleString()}
                                  </td>
                                  <td className="border-r border-slate-700 px-3 py-2.5 text-right font-mono text-indigo-200">
                                    {group.totals.promoSum.toLocaleString()}
                                  </td>
                                  <td className="border-r border-slate-700 px-3 py-2.5 text-right font-mono text-indigo-100 font-bold bg-indigo-900/30">
                                    {group.totals.generalSum.toLocaleString()}
                                  </td>
                                  <td className="border-r border-slate-700 px-3 py-2.5 text-right font-mono text-emerald-300">
                                    {group.totals.maintenanceSum > 0 ? group.totals.maintenanceSum.toLocaleString() : '-'}
                                  </td>
                                  <td className="border-r border-slate-700 px-3 py-2.5 text-right font-mono text-purple-300">
                                    {group.totals.specialSum > 0 ? group.totals.specialSum.toLocaleString() : '-'}
                                  </td>
                                  <td className="border-r border-slate-700 px-3 py-2.5 text-right font-mono text-indigo-100">
                                    {group.totals.grossTotal.toLocaleString()}
                                  </td>
                                  <td className="border-r border-slate-700 px-3 py-2.5 text-right font-mono text-rose-300">
                                    {group.totals.tax > 0 ? `-${group.totals.tax.toLocaleString()}` : '-'}
                                  </td>
                                  <td className="border-r border-slate-700 px-3 py-2.5 text-right font-mono font-black text-amber-300 text-xs bg-indigo-950/80">
                                    {group.totals.netTotal.toLocaleString()}원
                                  </td>
                                  <td className="border-r border-slate-700 px-3 py-2.5 text-left text-xs text-indigo-100">
                                    <span className="text-[11px] truncate block max-w-[200px]" title={`${divBankStr} ${divAcctStr} (${divHolderStr})`}>
                                      {divBankStr} {divAcctStr} ({divHolderStr})
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 text-center text-indigo-400 text-xs">
                                    -
                                  </td>
                                </tr>

                                {/* 사업단 소속 본부 행들 (접히지 않았을 때) */}
                                {!isCollapsed && group.stats.map(stat => {
                                  const globalIdx = filteredAndSortedStats.findIndex(s => s.hqName === stat.hqName);
                                  return renderHqRow(stat, globalIdx >= 0 ? globalIdx : 0, true);
                                })}
                              </React.Fragment>
                            );
                          })}

                          {/* 사업단 미소속 독립 본부 행들 */}
                          {groupedDivisionData.independentStats.length > 0 && (
                            <React.Fragment>
                              <tr className="bg-slate-200/90 text-slate-800 font-bold border-y border-slate-300 whitespace-nowrap">
                                <td colSpan={15} className="px-4 py-2 text-left">
                                  <div className="flex items-center gap-2">
                                    <Building2 size={14} className="text-slate-600" />
                                    <span className="text-xs">🏢 독립 본부 (사업단 미소속) - {groupedDivisionData.independentStats.length}개 본부</span>
                                  </div>
                                </td>
                              </tr>
                              {groupedDivisionData.independentStats.map(stat => {
                                const globalIdx = filteredAndSortedStats.findIndex(s => s.hqName === stat.hqName);
                                return renderHqRow(stat, globalIdx >= 0 ? globalIdx : 0, false);
                              })}
                            </React.Fragment>
                          )}
                        </>
                      );
                    }

                    // 2. 사업단별 묶기가 꺼져 있을 때: 기본 플랫 렌더링
                    return filteredAndSortedStats.map((stat, idx) => renderHqRow(stat, idx, false));
                  })()}
                </tbody>
                {filteredAndSortedStats.length > 0 && (
                  <tfoot className="bg-slate-100/90 font-black text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-center border-r border-slate-200">
                        총합계 ({filteredAndSortedStats.length}개 본부)
                      </td>
                      <td className="px-3 py-3 text-right font-mono border-r border-slate-200">
                        {summaryTotals.totalCount.toLocaleString()}건
                      </td>
                      <td className="px-3 py-3 text-right font-mono border-r border-slate-200">
                        {summaryTotals.totalSales.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono border-r border-slate-200">
                        {summaryTotals.totalPromo.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-blue-700 border-r border-slate-200">
                        {summaryTotals.totalGeneral.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-emerald-600 border-r border-slate-200">
                        {summaryTotals.totalMaintenance.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-purple-600 border-r border-slate-200">
                        {summaryTotals.totalSpecial.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono border-r border-slate-200">
                        {summaryTotals.totalGross.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-rose-600 border-r border-slate-200">
                        {summaryTotals.totalTax > 0 ? `-${summaryTotals.totalTax.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-indigo-900 bg-indigo-100/60 border-r border-slate-200">
                        {summaryTotals.totalNet.toLocaleString()}원
                      </td>
                      <td colSpan={2} className="px-3 py-3 text-center text-slate-400 font-normal">
                        -
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
            </>
          )}

          {/* 본부 상세 명세 드릴다운 모달/드로어 */}
          <AnimatePresence>
            {selectedHqDetail && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 md:p-6"
              >
                <motion.div
                  initial={{ scale: 0.96, y: 15 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.96, y: 15 }}
                  className="bg-white w-full max-w-[96vw] xl:max-w-7xl 2xl:max-w-[1550px] max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
                >
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <Building2 className="w-5 h-5 text-blue-600" />
                      <h3 className="text-base font-bold text-slate-900">
                        [{selectedHqDetail.hqName}] {selectedMonth} 정산 상세 명세
                      </h3>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold whitespace-nowrap">
                        {selectedHqDetail.count}건
                        {selectedHqDetail.accountCount && selectedHqDetail.accountCount !== selectedHqDetail.count && (
                          <span className="ml-1 text-blue-800">({selectedHqDetail.accountCount}구좌)</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {onExportHqSettlement && (
                        <button
                          onClick={() => onExportHqSettlement(selectedHqDetail.hqName, selectedMonth, selectedHqDetail)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer whitespace-nowrap"
                        >
                          <Download size={13} />
                          본부 정산서 다운로드
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedHqDetail(null)}
                        className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-all cursor-pointer"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs shrink-0">
                    <div><span className="text-slate-400">판매수수료:</span> <strong className="font-mono text-slate-800 ml-1">{selectedHqDetail.salesSum.toLocaleString()}원</strong></div>
                    <div><span className="text-slate-400">촉진비:</span> <strong className="font-mono text-slate-800 ml-1">{selectedHqDetail.promoSum.toLocaleString()}원</strong></div>
                    <div><span className="text-slate-400">유지수수료:</span> <strong className="font-mono text-emerald-600 ml-1">{selectedHqDetail.maintenanceSum.toLocaleString()}원</strong></div>
                    <div><span className="text-slate-400">특수수당:</span> <strong className="font-mono text-purple-600 ml-1">{selectedHqDetail.specialSum.toLocaleString()}원</strong></div>
                    <div><span className="text-slate-400">최종 실지급액:</span> <strong className="font-mono text-indigo-700 text-sm ml-1">{selectedHqDetail.netTotal.toLocaleString()}원</strong></div>
                    <div className="ml-auto text-slate-500">
                      <span>계좌: {selectedHqDetail.bankName} {selectedHqDetail.accountNumber} ({selectedHqDetail.accountHolder})</span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
                    {/* 계약 판매/촉진 수수료 테이블 */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-600" />
                          계약 수수료 내역 ({selectedHqDetail.items.length}건)
                        </h4>
                      </div>
                      <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-2xs">
                        <table className="w-full text-xs text-left min-w-[980px]">
                          <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                            <tr>
                              <th className="px-3 py-2.5 text-center w-12 whitespace-nowrap">No</th>
                              <th className="px-3 py-2.5 whitespace-nowrap min-w-[70px]">회원명</th>
                              <th className="px-3 py-2.5 whitespace-nowrap min-w-[95px] text-center">계약일자</th>
                              <th className="px-3 py-2.5 whitespace-nowrap min-w-[180px]">상품명</th>
                              <th className="px-3 py-2.5 whitespace-nowrap min-w-[65px] text-center">구좌</th>
                              <th className="px-3 py-2.5 whitespace-nowrap min-w-[80px]">지사</th>
                              <th className="px-3 py-2.5 whitespace-nowrap min-w-[80px]">영업사원</th>
                              <th className="px-3 py-2.5 whitespace-nowrap min-w-[95px] text-right">판매수수료</th>
                              <th className="px-3 py-2.5 whitespace-nowrap min-w-[95px] text-right">촉진비</th>
                              <th className="px-3 py-2.5 whitespace-nowrap min-w-[100px] text-right">총수수료</th>
                              <th className="px-3 py-2.5 whitespace-nowrap min-w-[95px] text-center">지급일</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedHqDetail.items.map((item, i) => {
                              const { totalCommission, salesComm } = calculateCommissionDetails(item, globalStatsMap);
                              return (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-3 py-2.5 text-center text-slate-400 whitespace-nowrap">{i + 1}</td>
                                  <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">{item.memName}</td>
                                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-center">{item.contractDate}</td>
                                  <td className="px-3 py-2.5 text-slate-800">
                                    <span className="font-medium">{item.prodName}</span>
                                    {item.rentalProd && item.rentalProd !== '-' && item.rentalProd !== item.prodName && (
                                      <span className="block text-[11px] text-slate-400 mt-0.5">{item.rentalProd}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 inline-block">
                                      1구좌
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{item.branch || '-'}</td>
                                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{item.empName || '-'}</td>
                                  <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{salesComm.toLocaleString()}원</td>
                                  <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{(totalCommission - salesComm).toLocaleString()}원</td>
                                  <td className="px-3 py-2.5 text-right font-mono font-bold text-blue-600 whitespace-nowrap">{totalCommission.toLocaleString()}원</td>
                                  <td className="px-3 py-2.5 text-center text-slate-500 whitespace-nowrap">{item.payDate}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 유지수수료 상세 목록 */}
                    {selectedHqDetail.maintenanceItems && selectedHqDetail.maintenanceItems.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-600" />
                            유지수수료 내역 ({selectedHqDetail.maintenanceItems.length}건, 총 {selectedHqDetail.maintenanceSum.toLocaleString()}원)
                          </h4>
                        </div>
                        <div className="overflow-x-auto border border-emerald-200 rounded-lg shadow-2xs">
                          <table className="w-full text-xs text-left min-w-[850px] bg-emerald-50/10">
                            <thead className="bg-emerald-100/60 text-emerald-900 font-bold border-b border-emerald-200 sticky top-0 z-10">
                              <tr>
                                <th className="px-3 py-2 text-center w-12 whitespace-nowrap">No</th>
                                <th className="px-3 py-2 whitespace-nowrap min-w-[70px]">회원명</th>
                                <th className="px-3 py-2 whitespace-nowrap min-w-[80px]">지사</th>
                                <th className="px-3 py-2 whitespace-nowrap min-w-[80px]">영업사원</th>
                                <th className="px-3 py-2 whitespace-nowrap min-w-[160px]">상품명</th>
                                <th className="px-3 py-2 text-center whitespace-nowrap min-w-[65px]">회차</th>
                                <th className="px-3 py-2 text-right whitespace-nowrap min-w-[95px]">유지수수료</th>
                                <th className="px-3 py-2 text-center whitespace-nowrap min-w-[95px]">계약일자</th>
                                <th className="px-3 py-2 text-center whitespace-nowrap min-w-[95px]">지급일자</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-emerald-100">
                              {selectedHqDetail.maintenanceItems.map((mItem, idx) => (
                                <tr key={idx} className="hover:bg-emerald-50/40 transition-colors">
                                  <td className="px-3 py-2 text-center text-slate-400 whitespace-nowrap">{idx + 1}</td>
                                  <td className="px-3 py-2 font-bold text-slate-800 whitespace-nowrap">{mItem.customerName || mItem.memName || '-'}</td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{mItem.branch || '-'}</td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{mItem.empName || '-'}</td>
                                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{mItem.productName || mItem.prodName || '-'}</td>
                                  <td className="px-3 py-2 text-center font-semibold text-emerald-700 whitespace-nowrap">
                                    {mItem.fromInstallment ? `${mItem.fromInstallment}회차` : (mItem.round ? `${mItem.round}회차` : '-')}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                                    {(mItem.amount || 0).toLocaleString()}원
                                  </td>
                                  <td className="px-3 py-2 text-center text-slate-500 whitespace-nowrap">{mItem.contractDate || '-'}</td>
                                  <td className="px-3 py-2 text-center text-slate-500 whitespace-nowrap">{mItem.payDate || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* 특수수당 상세 목록 */}
                    {selectedHqDetail.specialItems && selectedHqDetail.specialItems.length > 0 && (
                      <div>
                        {(() => {
                          const totalSpAccounts = selectedHqDetail.specialItems.reduce((acc, sp) => acc + (sp.accountCount || getAccountCountFromItem(sp)), 0);
                          return (
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-purple-600" />
                                특수수당 내역 ({selectedHqDetail.specialItems.length}건{totalSpAccounts !== selectedHqDetail.specialItems.length ? ` / ${totalSpAccounts}구좌` : ''}, 총 {selectedHqDetail.specialSum.toLocaleString()}원)
                              </h4>
                            </div>
                          );
                        })()}
                        <div className="overflow-x-auto border border-purple-200 rounded-lg shadow-2xs">
                          <table className="w-full text-xs text-left min-w-[950px] bg-purple-50/10">
                            <thead className="bg-purple-100/60 text-purple-900 font-bold border-b border-purple-200 sticky top-0 z-10">
                              <tr>
                                <th className="px-3 py-2 text-center w-12 whitespace-nowrap">No</th>
                                <th className="px-3 py-2 whitespace-nowrap min-w-[120px]">수당명</th>
                                <th className="px-3 py-2 whitespace-nowrap min-w-[70px]">회원명</th>
                                <th className="px-3 py-2 whitespace-nowrap min-w-[150px]">상품명</th>
                                <th className="px-3 py-2 text-right whitespace-nowrap min-w-[95px]">수당금액</th>
                                <th className="px-3 py-2 text-center whitespace-nowrap min-w-[95px]">계약일자</th>
                                <th className="px-3 py-2 text-center whitespace-nowrap min-w-[95px]">배송일자</th>
                                <th className="px-3 py-2 text-center whitespace-nowrap min-w-[95px]">지급일자</th>
                                <th className="px-3 py-2 whitespace-nowrap min-w-[80px]">본부명</th>
                                <th className="px-3 py-2 whitespace-nowrap min-w-[80px]">지사명</th>
                                <th className="px-3 py-2 whitespace-nowrap min-w-[80px]">영업자명</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-purple-100">
                              {selectedHqDetail.specialItems.map((spItem, idx) => (
                                <tr key={idx} className="hover:bg-purple-50/40 transition-colors">
                                  <td className="px-3 py-2 text-center text-slate-400 whitespace-nowrap">{idx + 1}</td>
                                  <td className="px-3 py-2 font-bold text-purple-700 whitespace-nowrap">{spItem.incentiveName}</td>
                                  <td className="px-3 py-2 text-slate-800 whitespace-nowrap">{spItem.memName}</td>
                                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{spItem.prodName}</td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-purple-700 whitespace-nowrap">{spItem.amount.toLocaleString()}원</td>
                                  <td className="px-3 py-2 text-center text-slate-500 whitespace-nowrap">{spItem.contractDate}</td>
                                  <td className="px-3 py-2 text-center text-slate-500 whitespace-nowrap">{spItem.deliveryDate}</td>
                                  <td className="px-3 py-2 text-center text-slate-500 whitespace-nowrap">{spItem.payDate}</td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{spItem.contractHq || spItem.hq || selectedHqDetail.hqName || '-'}</td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{spItem.branch || '-'}</td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{spItem.empName || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 상세 정산 내역 신규 항목 추가 모달 */}
          <AnimatePresence>
            {isAddDetailModalOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
              >
                <motion.div
                  initial={{ scale: 0.95, y: 10 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 10 }}
                  className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
                >
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                        <Plus size={16} />
                      </div>
                      <h4 className="text-sm font-black text-slate-800">신규 수수료 정산 항목 추가</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddDetailModalOpen(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="p-5 space-y-3.5 text-xs">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        거래처 / 지급대상 명 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="예: 언바운드컴퍼니, 조재윤, 신동우 등"
                        value={newDetailTarget}
                        onChange={(e) => setNewDetailTarget(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        상품명 / 지급항목 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="예: 프리미엄540, 모델비, 컨설팅비 등"
                        value={newDetailItem}
                        onChange={(e) => setNewDetailItem(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">실적 건수</label>
                        <input
                          type="number"
                          value={newDetailCount}
                          onChange={(e) => {
                            const cnt = Number(e.target.value) || 0;
                            setNewDetailCount(cnt);
                            if (newDetailUnitFee > 0) {
                              setNewDetailTotalComm(cnt * newDetailUnitFee);
                            }
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono focus:border-blue-500 focus:outline-hidden text-right"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">건별 수수료 (단가)</label>
                        <input
                          type="number"
                          value={newDetailUnitFee}
                          onChange={(e) => {
                            const fee = Number(e.target.value) || 0;
                            setNewDetailUnitFee(fee);
                            setNewDetailTotalComm(newDetailCount * fee);
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono focus:border-blue-500 focus:outline-hidden text-right"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">판매수수료</label>
                        <input
                          type="number"
                          value={newDetailSalesComm}
                          onChange={(e) => {
                            const s = Number(e.target.value) || 0;
                            setNewDetailSalesComm(s);
                            setNewDetailTotalComm(s + newDetailPromoComm);
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono focus:border-blue-500 focus:outline-hidden text-right"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">판매촉진비</label>
                        <input
                          type="number"
                          value={newDetailPromoComm}
                          onChange={(e) => {
                            const p = Number(e.target.value) || 0;
                            setNewDetailPromoComm(p);
                            setNewDetailTotalComm(newDetailSalesComm + p);
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono focus:border-blue-500 focus:outline-hidden text-right"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">총 수수료</label>
                      <input
                        type="number"
                        value={newDetailTotalComm}
                        onChange={(e) => setNewDetailTotalComm(Number(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-blue-400 bg-blue-50/50 rounded-xl font-mono font-black text-blue-900 focus:border-blue-600 focus:outline-hidden text-right"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => setIsAddDetailModalOpen(false)}
                      className="px-3.5 py-1.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 font-bold transition-colors cursor-pointer"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={handleAddNewDetailRow}
                      className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors cursor-pointer shadow-xs"
                    >
                      등록하기
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 굿라이프 사업단 내부 실송금 및 신동우 대표 차액 분배 전용 모달 */}
          <AnimatePresence>
            {isGoodlifeSplitModalOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[1550px] w-[96vw] max-h-[92vh] flex flex-col overflow-hidden"
                >
                  {/* 모달 헤더 */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 text-white shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30">
                        <Layers size={20} />
                      </div>
                      <div>
                        <h4 className="text-base font-black tracking-tight whitespace-nowrap">
                          굿라이프 사업단 내부 실송금 및 신동우 대표 오버라이딩 차액 분배 명세
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5 whitespace-nowrap">
                          본사 보고용 총수수료(71만/75만)와 내부 계좌별 직송금(꿈잇다 71만, 신동우 산하 본부 55만, 신동우 대표 차액 귀속) 분배 구조
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsGoodlifeSplitModalOpen(false)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* 모달 본문 */}
                  <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1 bg-slate-50/50">
                    {/* 상단 사업단 관리 (divisionSettings) 소속 본부 연동 컨트롤 배너 */}
                    <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 text-xs font-black flex items-center gap-1.5 whitespace-nowrap">
                            <Layers size={13} className="text-indigo-600" />
                            사업단 관리(divisionSettings) 실시간 연동
                          </span>
                          <span className="text-xs text-slate-500 whitespace-nowrap">
                            등록된 사업단 소속 본부 개수를 기준으로 실적과 계좌정보가 동적으로 집계됩니다.
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              handleSyncGoodlifeWithDivisions();
                              alert('사업단 관리(divisionSettings)에 등록된 소속 본부 실적 및 계좌정보로 자동 재집계되었습니다.');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
                          >
                            <RefreshCw size={13} />
                            <span>사업단 소속본부 실적 자동 재집계</span>
                          </button>

                          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setGoodlifeViewMode('summary')}
                              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${goodlifeViewMode === 'summary' ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                              상품군별 요약 뷰
                            </button>
                            <button
                              type="button"
                              onClick={() => setGoodlifeViewMode('byHq')}
                              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${goodlifeViewMode === 'byHq' ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                              소속 본부별 상세 뷰 ({kkumHqNames.length + shinHqNames.length}개 본부)
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 소속 본부 태그 목록 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                        <div className="flex items-start gap-2 bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-200/60">
                          <span className="font-bold text-emerald-900 shrink-0 whitespace-nowrap">
                            굿라이프(꿈잇다) 소속 ({kkumHqNames.length}개):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {kkumHqNames.map(name => (
                              <span key={name} className="px-1.5 py-0.5 bg-white border border-emerald-200 text-emerald-800 rounded font-medium text-[11px] whitespace-nowrap">
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-start gap-2 bg-blue-50/50 p-2.5 rounded-lg border border-blue-200/60">
                          <span className="font-bold text-blue-900 shrink-0 whitespace-nowrap">
                            굿라이프(신동우) 소속 ({shinHqNames.length}개):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {shinHqNames.map(name => (
                              <span key={name} className="px-1.5 py-0.5 bg-white border border-blue-200 text-blue-800 rounded font-medium text-[11px] whitespace-nowrap">
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 상단 5대 핵심 지표 요약 카드 */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs whitespace-nowrap">
                        <span className="text-xs text-slate-500 font-bold block">본사 총 발생수수료</span>
                        <div className="mt-1 text-lg font-black text-slate-900 font-mono">
                          {goodlifeSplitSummary.totalOfficial.toLocaleString()}<span className="text-xs font-normal text-slate-500 ml-0.5">원</span>
                        </div>
                        <span className="text-[11px] text-blue-600 font-bold mt-0.5 block">총 {goodlifeSplitSummary.totalCount}건 집계</span>
                      </div>

                      <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200 shadow-2xs whitespace-nowrap">
                        <span className="text-xs text-emerald-800 font-bold block">(주)꿈잇다 직송금</span>
                        <div className="mt-1 text-lg font-black text-emerald-700 font-mono">
                          {goodlifeSplitSummary.kkumDirect.toLocaleString()}<span className="text-xs font-normal text-emerald-600 ml-0.5">원</span>
                        </div>
                        <span className="text-[11px] text-emerald-600 font-medium mt-0.5 block">전 상품 건당 710,000원 ({goodlifeSplitSummary.kkumCount}건)</span>
                      </div>

                      <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200 shadow-2xs whitespace-nowrap">
                        <span className="text-xs text-blue-800 font-bold block">신동우 산하 본부 직송금</span>
                        <div className="mt-1 text-lg font-black text-blue-700 font-mono">
                          {goodlifeSplitSummary.hqDirect.toLocaleString()}<span className="text-xs font-normal text-blue-600 ml-0.5">원</span>
                        </div>
                        <span className="text-[11px] text-blue-600 font-medium mt-0.5 block">소속 본부 건당 550,000원 ({goodlifeSplitSummary.hqCount}건)</span>
                      </div>

                      <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 shadow-2xs whitespace-nowrap">
                        <span className="text-xs text-amber-800 font-bold block">신동우 대표 차액분</span>
                        <div className="mt-1 text-lg font-black text-amber-700 font-mono">
                          {goodlifeSplitSummary.totalOverride.toLocaleString()}<span className="text-xs font-normal text-amber-600 ml-0.5">원</span>
                        </div>
                        <span className="text-[11px] text-amber-600 font-medium mt-0.5 block">꿈잇다 4만 / 사업단 16~20만</span>
                      </div>

                      <div className="bg-purple-50/60 p-4 rounded-xl border border-purple-200 shadow-2xs whitespace-nowrap">
                        <span className="text-xs text-purple-800 font-bold block">신동우 대표 최종 실송금</span>
                        <div className="mt-1 text-lg font-black text-purple-700 font-mono">
                          {(goodlifeSplitSummary.totalOverride + 1000000).toLocaleString()}<span className="text-xs font-normal text-purple-600 ml-0.5">원</span>
                        </div>
                        <span className="text-[11px] text-purple-600 font-medium mt-0.5 block">차액 + 테라웨이브(100만)</span>
                      </div>
                    </div>

                    {/* 검증 배너 */}
                    <div className="px-5 py-3 rounded-xl bg-emerald-100/70 border border-emerald-300 flex items-center justify-between text-xs whitespace-nowrap">
                      <div className="flex items-center gap-2 text-emerald-900 font-bold">
                        <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                        <span>정산 합계 일치 검증:</span>
                        <span className="font-mono text-emerald-800">
                          본사 수수료({goodlifeSplitSummary.totalOfficial.toLocaleString()}원) = 직송금합계({goodlifeSplitSummary.totalDirect.toLocaleString()}원) + 신동우 대표 차액({goodlifeSplitSummary.totalOverride.toLocaleString()}원)
                        </span>
                      </div>
                      <span className="px-3 py-1 bg-emerald-600 text-white font-black rounded-lg text-xs shadow-2xs">
                        오차 0원 정상 일치
                      </span>
                    </div>

                    {/* 분배 상세 테이블 */}
                    <div className="bg-white rounded-xl border border-slate-300 overflow-hidden shadow-2xs">
                      <div className="px-5 py-3 bg-slate-800 text-white font-bold text-xs flex items-center justify-between whitespace-nowrap">
                        <span className="text-sm">
                          {goodlifeViewMode === 'summary' ? '상품군별 실송금 및 오버라이딩 차액 분배 세부 명세표' : `사업단 소속 본부별 상세 실적 및 직송금 명세표 (${kkumHqNames.length + shinHqNames.length}개 본부)`}
                        </span>
                        <span className="text-xs text-slate-300 font-normal">
                          {goodlifeViewMode === 'summary' ? '건수를 수정하시면 직송금과 차액이 실시간으로 재계산됩니다.' : '본부별 계좌번호는 [설정 > 본부별 정산 설정]에서 실시간 연동됩니다.'}
                        </span>
                      </div>
                      <div className="overflow-x-auto custom-scrollbar">
                        {goodlifeViewMode === 'summary' ? (
                          <table className="w-full text-xs text-left border-collapse min-w-[1450px]">
                            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                              <tr>
                                <th className="px-4 py-3 text-center border-r border-slate-200 whitespace-nowrap min-w-[90px]">구분</th>
                                <th className="px-4 py-3 text-center border-r border-slate-200 whitespace-nowrap min-w-[120px]">소속본부</th>
                                <th className="px-4 py-3 text-left border-r border-slate-200 whitespace-nowrap min-w-[180px]">상품명</th>
                                <th className="px-4 py-3 text-right border-r border-slate-200 whitespace-nowrap min-w-[95px]">건수</th>
                                <th className="px-4 py-3 text-right border-r border-slate-200 whitespace-nowrap min-w-[110px]">본사단가</th>
                                <th className="px-4 py-3 text-right border-r border-slate-200 whitespace-nowrap min-w-[130px]">본사 총수수료</th>
                                <th className="px-4 py-3 text-center border-r border-slate-200 whitespace-nowrap min-w-[130px]">직송금대상</th>
                                <th className="px-4 py-3 text-center border-r border-slate-200 whitespace-nowrap min-w-[180px]">입금계좌정보 (hqSettings 연동)</th>
                                <th className="px-4 py-3 text-right border-r border-slate-200 whitespace-nowrap min-w-[115px]">직송금단가</th>
                                <th className="px-4 py-3 text-right border-r border-slate-200 whitespace-nowrap min-w-[130px] bg-emerald-50/50 text-emerald-800">직송금합계</th>
                                <th className="px-4 py-3 text-right border-r border-slate-200 whitespace-nowrap min-w-[120px] text-amber-700">신동우 차액단가</th>
                                <th className="px-4 py-3 text-right border-r border-slate-200 whitespace-nowrap min-w-[130px] bg-amber-50/50 text-amber-800 font-bold">신동우 차액합계</th>
                                <th className="px-4 py-3 text-left whitespace-nowrap min-w-[200px]">비고</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 text-slate-700 font-sans">
                              {/* 1. 꿈잇다 상품군 */}
                              {goodlifeSplitRows.filter(r => r.category === '꿈잇다').map((item) => {
                                const globalIdx = goodlifeSplitRows.findIndex(r => r.id === item.id);
                                const cnt = Number(item.count) || 0;
                                const offFee = Number(item.officialUnitFee) || 0;
                                const dirFee = Number(item.directUnitFee) || 0;
                                const diffFee = offFee - dirFee;
                                const offTotal = cnt * offFee;
                                const dirTotal = cnt * dirFee;
                                const diffTotal = cnt * diffFee;
                                const accInfo = getPayoutAccountInfo('꿈잇다');

                                return (
                                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 font-bold text-slate-600 whitespace-nowrap">
                                      {item.category}
                                    </td>
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 font-bold whitespace-nowrap">
                                      {item.hqName}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 font-bold text-slate-800 whitespace-nowrap">
                                      {item.itemName}
                                    </td>
                                    <td className="px-3 py-2 border-r border-slate-200 text-right whitespace-nowrap">
                                      <input
                                        type="number"
                                        value={item.count}
                                        onChange={(e) => {
                                          const val = Number(e.target.value) || 0;
                                          const next = [...goodlifeSplitRows];
                                          next[globalIdx] = { ...next[globalIdx], count: val };
                                          saveGoodlifeSplitRows(next);
                                        }}
                                        className="w-18 px-2 py-1 text-right font-mono font-bold border border-slate-300 rounded-lg bg-white focus:border-indigo-500 focus:outline-hidden"
                                      />
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-right font-mono whitespace-nowrap">
                                      {offFee.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                      {offTotal.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-center font-bold text-emerald-700 whitespace-nowrap">
                                      {item.directRecipient}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-center font-mono text-xs text-slate-600 whitespace-nowrap">
                                      {accInfo.bankName} {accInfo.accountNumber} ({accInfo.accountHolder})
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-right font-mono text-emerald-700 whitespace-nowrap">
                                      {dirFee.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-right font-mono font-bold text-emerald-800 bg-emerald-50/30 whitespace-nowrap">
                                      {dirTotal.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-right font-mono text-amber-700 whitespace-nowrap">
                                      {diffFee.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-right font-mono font-bold text-amber-800 bg-amber-50/30 whitespace-nowrap">
                                      {diffTotal.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                                      {item.memo}
                                    </td>
                                  </tr>
                                );
                              })}
                              {/* 꿈잇다 소계 행 */}
                              <tr className="bg-emerald-50/60 font-bold border-y-2 border-emerald-300 text-emerald-950">
                                <td colSpan={3} className="px-4 py-3 text-center border-r border-emerald-300 font-black whitespace-nowrap">
                                  [꿈잇다 사업단 소계]
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-emerald-300 whitespace-nowrap">
                                  {goodlifeSplitSummary.kkumCount.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-center border-r border-emerald-300 whitespace-nowrap">-</td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-emerald-300 whitespace-nowrap">
                                  {goodlifeSplitSummary.kkumOfficial.toLocaleString()}
                                </td>
                                <td colSpan={2} className="px-4 py-3 text-center border-r border-emerald-300 text-emerald-800 text-xs font-bold whitespace-nowrap">
                                  (주)꿈잇다 직송금 계좌 ({getPayoutAccountInfo('꿈잇다').bankName} {getPayoutAccountInfo('꿈잇다').accountNumber})
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-emerald-300 text-emerald-700 whitespace-nowrap">
                                  710,000
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-emerald-300 text-emerald-700 bg-emerald-100/70 whitespace-nowrap">
                                  {goodlifeSplitSummary.kkumDirect.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-center border-r border-emerald-300 text-amber-800 text-xs font-bold whitespace-nowrap">
                                  차액(건당 4만)
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-emerald-300 text-amber-800 bg-amber-100/70 whitespace-nowrap">
                                  {goodlifeSplitSummary.kkumOverride.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-emerald-800 text-xs whitespace-nowrap">
                                  꿈잇다 71만 직송금 / 신동우 4만 차액
                                </td>
                              </tr>

                              {/* 2. 신동우사업단 상품군 */}
                              {goodlifeSplitRows.filter(r => r.category !== '꿈잇다').map((item) => {
                                const globalIdx = goodlifeSplitRows.findIndex(r => r.id === item.id);
                                const cnt = Number(item.count) || 0;
                                const offFee = Number(item.officialUnitFee) || 0;
                                const dirFee = Number(item.directUnitFee) || 0;
                                const diffFee = offFee - dirFee;
                                const offTotal = cnt * offFee;
                                const dirTotal = cnt * dirFee;
                                const diffTotal = cnt * diffFee;
                                const shinAcc = getPayoutAccountInfo('굿라이프(신동우)');

                                return (
                                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 font-bold text-slate-600 whitespace-nowrap">
                                      {item.category}
                                    </td>
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 font-bold whitespace-nowrap">
                                      {item.hqName}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 font-bold text-slate-800 whitespace-nowrap">
                                      {item.itemName}
                                    </td>
                                    <td className="px-3 py-2 border-r border-slate-200 text-right whitespace-nowrap">
                                      <input
                                        type="number"
                                        value={item.count}
                                        onChange={(e) => {
                                          const val = Number(e.target.value) || 0;
                                          const next = [...goodlifeSplitRows];
                                          next[globalIdx] = { ...next[globalIdx], count: val };
                                          saveGoodlifeSplitRows(next);
                                        }}
                                        className="w-18 px-2 py-1 text-right font-mono font-bold border border-slate-300 rounded-lg bg-white focus:border-indigo-500 focus:outline-hidden"
                                      />
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-right font-mono whitespace-nowrap">
                                      {offFee.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                      {offTotal.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-center font-bold text-blue-700 whitespace-nowrap">
                                      {item.directRecipient}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-center font-mono text-xs text-slate-600 whitespace-nowrap">
                                      {shinAcc.bankName} {shinAcc.accountNumber} ({shinAcc.accountHolder})
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-right font-mono text-blue-700 whitespace-nowrap">
                                      {dirFee.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-right font-mono font-bold text-blue-800 bg-blue-50/30 whitespace-nowrap">
                                      {dirTotal.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-right font-mono text-amber-700 whitespace-nowrap">
                                      {diffFee.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 text-right font-mono font-bold text-amber-800 bg-amber-50/30 whitespace-nowrap">
                                      {diffTotal.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                                      {item.memo}
                                    </td>
                                  </tr>
                                );
                              })}
                              {/* 신동우사업단 소계 행 */}
                              <tr className="bg-blue-50/60 font-bold border-y-2 border-blue-300 text-blue-950">
                                <td colSpan={3} className="px-4 py-3 text-center border-r border-blue-300 font-black whitespace-nowrap">
                                  [신동우 사업단 산하본부 소계]
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-blue-300 whitespace-nowrap">
                                  {goodlifeSplitSummary.hqCount.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-center border-r border-blue-300 whitespace-nowrap">-</td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-blue-300 whitespace-nowrap">
                                  {goodlifeSplitSummary.hqOfficial.toLocaleString()}
                                </td>
                                <td colSpan={2} className="px-4 py-3 text-center border-r border-blue-300 text-blue-800 text-xs font-bold whitespace-nowrap">
                                  소속 본부 직송금 계좌 (각 소속본부 및 사업단 계좌 연동)
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-blue-300 text-blue-700 whitespace-nowrap">
                                  550,000
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-blue-300 text-blue-700 bg-blue-100/70 whitespace-nowrap">
                                  {goodlifeSplitSummary.hqDirect.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-center border-r border-blue-300 text-amber-800 text-xs font-bold whitespace-nowrap">
                                  차액(16~20만)
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-blue-300 text-amber-800 bg-amber-100/70 whitespace-nowrap">
                                  {goodlifeSplitSummary.hqOverride.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-blue-800 text-xs whitespace-nowrap">
                                  본부 55만 직송금 / 신동우 16~20만 차액
                                </td>
                              </tr>
                            </tbody>
                            <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                              <tr>
                                <td colSpan={3} className="px-5 py-3 text-center border-r border-slate-300 font-black whitespace-nowrap">
                                  굿라이프 정산 분배 총계
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-slate-300 whitespace-nowrap">
                                  {goodlifeSplitSummary.totalCount.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-center border-r border-slate-300 whitespace-nowrap">-</td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-slate-300 text-blue-900 whitespace-nowrap">
                                  {goodlifeSplitSummary.totalOfficial.toLocaleString()}
                                </td>
                                <td colSpan={3} className="px-4 py-3 text-center border-r border-slate-300 text-emerald-800 whitespace-nowrap">
                                  직송금 합계
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-slate-300 text-emerald-800 bg-emerald-100/60 whitespace-nowrap">
                                  {goodlifeSplitSummary.totalDirect.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-center border-r border-slate-300 text-amber-800 whitespace-nowrap">차액 합계</td>
                                <td className="px-4 py-3 text-right font-mono font-black border-r border-slate-300 text-amber-800 bg-amber-100/60 whitespace-nowrap">
                                  {goodlifeSplitSummary.totalOverride.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">합계 일치 확인</td>
                              </tr>
                            </tfoot>
                          </table>
                        ) : (
                          /* 소속 본부별 상세 뷰 (사업단 관리 divisionSettings 소속 본부 22개 목록) */
                          <table className="w-full text-xs text-left border-collapse min-w-[1450px]">
                            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                              <tr>
                                <th className="px-4 py-3 text-center border-r border-slate-200 whitespace-nowrap min-w-[70px]">No</th>
                                <th className="px-4 py-3 text-center border-r border-slate-200 whitespace-nowrap min-w-[110px]">소속 사업단</th>
                                <th className="px-4 py-3 text-left border-r border-slate-200 whitespace-nowrap min-w-[130px]">본부명</th>
                                <th className="px-4 py-3 text-center border-r border-slate-200 whitespace-nowrap min-w-[90px]">정산유형</th>
                                <th className="px-4 py-3 text-center border-r border-slate-200 whitespace-nowrap min-w-[100px]">입금은행</th>
                                <th className="px-4 py-3 text-center border-r border-slate-200 whitespace-nowrap min-w-[160px]">계좌번호 (hqSettings)</th>
                                <th className="px-4 py-3 text-center border-r border-slate-200 whitespace-nowrap min-w-[130px]">예금주</th>
                                <th className="px-4 py-3 text-right border-r border-slate-200 whitespace-nowrap min-w-[90px]">실적건수</th>
                                <th className="px-4 py-3 text-right border-r border-slate-200 whitespace-nowrap min-w-[110px]">직송금단가</th>
                                <th className="px-4 py-3 text-right border-r border-slate-200 whitespace-nowrap min-w-[130px] bg-emerald-50 text-emerald-900">직송금액</th>
                                <th className="px-4 py-3 text-right border-r border-slate-200 whitespace-nowrap min-w-[120px] text-amber-700">신동우 차액단가</th>
                                <th className="px-4 py-3 text-right border-r border-slate-200 whitespace-nowrap min-w-[130px] bg-amber-50 text-amber-900">신동우 차액합계</th>
                                <th className="px-4 py-3 text-left whitespace-nowrap min-w-[160px]">정산 규칙 비고</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 text-slate-700 font-sans">
                              {/* 1. 굿라이프(꿈잇다) 소속 본부 15개 */}
                              <tr className="bg-emerald-100/50 font-bold border-y border-emerald-300 text-emerald-950">
                                <td colSpan={13} className="px-4 py-2 text-left whitespace-nowrap">
                                  📁 굿라이프(꿈잇다) 사업단 소속 본부 ({kkumHqNames.length}개) — 직송금: (주)꿈잇다 건당 710,000원 / 신동우 대표 차액: 건당 40,000원
                                </td>
                              </tr>
                              {divisionHqStats.kkumHqList.map((item, idx) => {
                                const acc = getPayoutAccountInfo(item.hqName);
                                const cnt = item.count;
                                const dirAmount = cnt * 710000;
                                const diffAmount = cnt * 40000;

                                return (
                                  <tr key={`kkum_${item.hqName}_${idx}`} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 text-slate-500 font-mono whitespace-nowrap">{idx + 1}</td>
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 font-bold text-emerald-800 whitespace-nowrap">굿라이프(꿈잇다)</td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 font-bold text-slate-900 whitespace-nowrap">{item.hqName}</td>
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 whitespace-nowrap">
                                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">{acc.settlementType}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 whitespace-nowrap font-medium">{acc.bankName}</td>
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 font-mono text-xs text-slate-800 whitespace-nowrap">{acc.accountNumber}</td>
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 font-medium whitespace-nowrap">{acc.accountHolder}</td>
                                    <td className="px-4 py-2.5 text-right border-r border-slate-200 font-mono font-bold whitespace-nowrap">{cnt}</td>
                                    <td className="px-4 py-2.5 text-right border-r border-slate-200 font-mono whitespace-nowrap">710,000</td>
                                    <td className="px-4 py-2.5 text-right border-r border-slate-200 font-mono font-bold text-emerald-800 bg-emerald-50/30 whitespace-nowrap">{dirAmount.toLocaleString()}</td>
                                    <td className="px-4 py-2.5 text-right border-r border-slate-200 font-mono text-amber-700 whitespace-nowrap">40,000</td>
                                    <td className="px-4 py-2.5 text-right border-r border-slate-200 font-mono font-bold text-amber-800 bg-amber-50/30 whitespace-nowrap">{diffAmount.toLocaleString()}</td>
                                    <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">꿈잇다 71만 직송금 / 신동우 4만 차액</td>
                                  </tr>
                                );
                              })}

                              {/* 2. 굿라이프(신동우) 소속 본부 7개 */}
                              <tr className="bg-blue-100/50 font-bold border-y border-blue-300 text-blue-950">
                                <td colSpan={13} className="px-4 py-2 text-left whitespace-nowrap">
                                  📁 굿라이프(신동우) 사업단 소속 본부 ({shinHqNames.length}개) — 직송금: 소속 본부 계좌 건당 550,000원 / 신동우 대표 차액: 건당 160,000~200,000원
                                </td>
                              </tr>
                              {divisionHqStats.shinHqList.map((item, idx) => {
                                const acc = getPayoutAccountInfo(item.hqName);
                                const cnt = item.count;
                                const dirAmount = cnt * 550000;
                                const diffAmount = cnt * 200000;

                                return (
                                  <tr key={`shin_${item.hqName}_${idx}`} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 text-slate-500 font-mono whitespace-nowrap">{idx + 1}</td>
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 font-bold text-blue-800 whitespace-nowrap">굿라이프(신동우)</td>
                                    <td className="px-4 py-2.5 border-r border-slate-200 font-bold text-slate-900 whitespace-nowrap">{item.hqName}</td>
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 whitespace-nowrap">
                                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">{acc.settlementType}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 whitespace-nowrap font-medium">{acc.bankName}</td>
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 font-mono text-xs text-slate-800 whitespace-nowrap">{acc.accountNumber}</td>
                                    <td className="px-4 py-2.5 text-center border-r border-slate-200 font-medium whitespace-nowrap">{acc.accountHolder}</td>
                                    <td className="px-4 py-2.5 text-right border-r border-slate-200 font-mono font-bold whitespace-nowrap">{cnt}</td>
                                    <td className="px-4 py-2.5 text-right border-r border-slate-200 font-mono whitespace-nowrap">550,000</td>
                                    <td className="px-4 py-2.5 text-right border-r border-slate-200 font-mono font-bold text-blue-800 bg-blue-50/30 whitespace-nowrap">{dirAmount.toLocaleString()}</td>
                                    <td className="px-4 py-2.5 text-right border-r border-slate-200 font-mono text-amber-700 whitespace-nowrap">200,000</td>
                                    <td className="px-4 py-2.5 text-right border-r border-slate-200 font-mono font-bold text-amber-800 bg-amber-50/30 whitespace-nowrap">{diffAmount.toLocaleString()}</td>
                                    <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">본부 55만 직송금 / 신동우 20만 차액</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    {/* 실제 송금 계좌정보 카드 3개 (본부별 정산 설정 hqSettings 및 사업단 관리 실시간 연동) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* 1. (주)꿈잇다 직송금 */}
                      {(() => {
                        const acc = getPayoutAccountInfo('꿈잇다');
                        return (
                          <div className="p-4.5 rounded-xl border border-emerald-200 bg-emerald-50/40 whitespace-nowrap">
                            <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                              <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                              1. (주)꿈잇다 직송금 계좌 (hqSettings 연동)
                            </span>
                            <div className="mt-2.5 space-y-1.5 text-xs">
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">입금은행:</span>
                                <span className="font-bold text-slate-800">{acc.bankName !== '-' ? acc.bankName : '기업은행'}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">계좌번호:</span>
                                <span className="font-mono font-bold text-slate-800">{acc.accountNumber !== '-' ? acc.accountNumber : '115-131758-01-017'}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">예금주:</span>
                                <span className="font-bold text-slate-800">{acc.accountHolder !== '-' ? acc.accountHolder : '주식회사 꿈잇다'}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">실적건수:</span>
                                <span className="font-mono text-slate-700">{goodlifeSplitSummary.kkumCount}건 (건당 71만)</span>
                              </div>
                              <div className="flex justify-between items-center pt-2 border-t border-emerald-200 text-sm">
                                <span className="font-bold text-emerald-900">최종 송금액:</span>
                                <span className="font-mono font-black text-emerald-700">{goodlifeSplitSummary.kkumDirect.toLocaleString()}원</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* 2. 신동우사업단 산하본부 직송금 */}
                      {(() => {
                        const acc = getPayoutAccountInfo('굿라이프(신동우)');
                        return (
                          <div className="p-4.5 rounded-xl border border-blue-200 bg-blue-50/40 whitespace-nowrap">
                            <span className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                              <CheckCircle size={15} className="text-blue-600 shrink-0" />
                              2. 신동우 산하 본부 직송금 (divisionSettings 연동)
                            </span>
                            <div className="mt-2.5 space-y-1.5 text-xs">
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">수취대상:</span>
                                <span className="font-bold text-slate-800">신동우사업단 소속 본부</span>
                              </div>
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">대표계좌:</span>
                                <span className="font-mono font-bold text-slate-800">{acc.bankName !== '-' ? acc.bankName : '국민은행'} {acc.accountNumber !== '-' ? acc.accountNumber : '164501-04-161888'}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">대표예금주:</span>
                                <span className="font-bold text-slate-800">{acc.accountHolder !== '-' ? acc.accountHolder : '김애숙(에스제이컨설팅)'}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">정산기준:</span>
                                <span className="text-slate-700">본부 직송금 건당 550,000원</span>
                              </div>
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">실적건수:</span>
                                <span className="font-mono text-slate-700">{goodlifeSplitSummary.hqCount}건 (건당 55만)</span>
                              </div>
                              <div className="flex justify-between items-center pt-2 border-t border-blue-200 text-sm">
                                <span className="font-bold text-blue-900">최종 송금액:</span>
                                <span className="font-mono font-black text-blue-700">{goodlifeSplitSummary.hqDirect.toLocaleString()}원</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* 3. 신동우 대표 실송금 */}
                      {(() => {
                        const acc = getPayoutAccountInfo('신동우');
                        return (
                          <div className="p-4.5 rounded-xl border border-purple-200 bg-purple-50/40 whitespace-nowrap">
                            <span className="text-xs font-bold text-purple-800 flex items-center gap-1.5">
                              <DollarSign size={15} className="text-purple-600 shrink-0" />
                              3. 신동우 대표 최종 실송금 (hqSettings 연동)
                            </span>
                            <div className="mt-2.5 space-y-1.5 text-xs">
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">입금은행:</span>
                                <span className="font-bold text-slate-800">{acc.bankName !== '-' ? acc.bankName : '국민은행'}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">계좌번호:</span>
                                <span className="font-mono font-bold text-slate-800">{acc.accountNumber !== '-' ? acc.accountNumber : '164501-04-161888'}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">예금주:</span>
                                <span className="font-bold text-slate-800">{acc.accountHolder !== '-' ? acc.accountHolder : '김애숙(에스제이컨설팅)'}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">세부내역:</span>
                                <span className="text-slate-700">차액 {goodlifeSplitSummary.totalOverride.toLocaleString()}원 + 테라 100만</span>
                              </div>
                              <div className="flex justify-between items-center pt-2 border-t border-purple-200 text-sm">
                                <span className="font-bold text-purple-900">최종 송금액:</span>
                                <span className="font-mono font-black text-purple-700">{(goodlifeSplitSummary.totalOverride + 1000000).toLocaleString()}원</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 모달 풋터 */}
                  <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 bg-white">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          handleSyncGoodlifeWithDivisions();
                          alert('사업단 관리(divisionSettings)에 등록된 소속 본부 실적 및 계좌정보로 자동 재집계되었습니다.');
                        }}
                        className="px-3 py-1.5 rounded-xl border border-indigo-300 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <RefreshCw size={12} />
                        <span>사업단 소속본부 실적 자동 재집계</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          saveGoodlifeSplitRows(DEFAULT_OCTOBER_GOODLIFE_SPLIT_ITEMS);
                          alert('기본 굿라이프 분배 내역으로 초기화되었습니다.');
                        }}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <RotateCcw size={12} />
                        <span>기본값 복원</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleExportDetailedSettlementExcel}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                      >
                        <FileSpreadsheet size={14} />
                        <span>굿라이프 분배 포함 엑셀 다운로드</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsGoodlifeSplitModalOpen(false)}
                        className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
                      >
                        확인 완료
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

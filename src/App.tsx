import React, { useState, useEffect, useRef } from 'react';
import { Save, RefreshCw, Upload, FileText, CheckCircle, AlertCircle, Search, Filter, Download, MoreVertical, X, Settings, Calendar, CreditCard, Users, TrendingUp, Building, Package, ChevronRight, ChevronLeft, Plus, User, Briefcase, StickyNote, Calculator, Monitor, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { HealthcareModal } from './HealthcareModal';
// @ts-ignore - XLSX를 CDN에서 로드 (xlsx-js-style의 Node.js 모듈 의존성 에러 회피)
// window.XLSX는 index.html의 CDN 스크립트에서 로드됨
const XLSX = (window as any).XLSX;


interface ERPDataItem {
  uniqueKey: string;
  originalRowIdx: number;
  contractDate: string; // A(0)
  memNo: string;        // C(2)
  memName: string;      // D(3)
  resNo: string;        // E(4)
  phone: string;        // F(5)
  prodName: string;     // G(6)
  rentalProd: string;   // M(12)
  rentalNo: string;     // K(10)
  deliveryStatus: string; // L(11)
  deliveryDate: string;   // N(13)
  payDate: string;        // O(14)
  hq: string;             // H(7)
  branch: string;         // I(8)
  empName: string;        // J(9)
  hc: string;             // P,Q,R(15,16,17) combined
  hcRegDate: string;      // S(18)
  paymentStatus: string;  // T(19)
  status: string;         // B(1)
  memo: string;           // U(20)?
  raw: any[];
  hcPaidCount?: number;
}

interface SyncNotification {
  message: string;
  type: 'success' | 'info';
}

interface ProductRule {
  productName: string;
  totalAmount: number;   // 수수료 총액
  salesAmount: number;   // 판매수수료 (나머지는 촉진비)
  tier1Count: number;
  tier1Price: number;
  tier2Count: number;
  tier2Price: number;
  tier3Count: number;
  tier3Price: number;
  applyOverriding?: boolean;
  overriding?: {
    salesperson: number;
    teamLeader: number;
    branchManager: number;
    hqManager: number;
  };
  applyMaintenance?: boolean;
  maintenanceRules?: {
    id: string;
    applyStartDate: string;
    applyEndDate: string;
    tiers: { startMonth: number, endMonth: number, amount: number }[];
  }[];
}

interface HQSetting {
  id: string;
  hqName: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  paymentMethod: string;

  // 오버라이딩 활성화 여부 및 상세 설정
  enableOverriding: boolean;
  overriding: {
    salesperson: number;
    teamLeader: number;
    branchManager: number;
    hqManager: number;
  };

  settlementType: '사업자' | '개인' | '개인/프리랜서';
  productRules: ProductRule[];
}

export interface GlobalIncentiveRule {
  id: string;
  incentiveName?: string;
  targetName: string;
  payDay: number;
  targetHq: string;
  targetProducts: string[];
  baseDateType: 'CONTRACT' | 'DELIVERY';
  commissionPerUnit: number;
  minimumGuarantee: number;
}

export interface MaintenanceTier {
  startMonth: number;
  endMonth: number;
  amount: number;
}

export interface MaintenanceFeeRule {
  id: string;
  targetHqs: string[]; // ['ALL'] or ['맥스', '드라마플라워']
  targetProducts: string[]; // ['ALL'] or ['더좋은헬스케어580']
  tiers: MaintenanceTier[];
  applyStartDate?: string;
  applyEndDate?: string;
}

// 샘플 시딩 값 (이곳에서 수정 가능)
const PRODUCT_SEEDS: [string, number, number][] = [
  ['더좋은하이브리드698', 650000, 300000],
  ['더좋은통신결합540플러스', 500000, 300000],
  ['더좋은통신결합360플러스', 250000, 190000],
  ['더좋은헬스케어580 (1회차)', 60000, 45000],
  ['더좋은라이즈498', 680000, 470000]
];

// 마스터 기초 데이터 (본부별 계좌 및 수수료 설정)
const MASTER_HQ_DATA: Partial<HQSetting>[] = [
  {
    hqName: '리치웰페어', bankName: '-', accountNumber: '-', accountHolder: '-', productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 770000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (1회차)', totalAmount: 160000, salesAmount: 60000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  {
    hqName: '한가득플러스', bankName: '우리', accountNumber: '1005304615801', accountHolder: '(주)한가득플러스', productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 700000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합540플러스', totalAmount: 570000, salesAmount: 360000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합360플러스', totalAmount: 270000, salesAmount: 240000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (1회차)', totalAmount: 60000, salesAmount: 60000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (유지)', totalAmount: 10000, salesAmount: 0, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  {
    hqName: '맥스', bankName: '우리', accountNumber: '1005603174407', accountHolder: '김학민(골프존파크', productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 650000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합540플러스', totalAmount: 500000, salesAmount: 360000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합360플러스', totalAmount: 250000, salesAmount: 240000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (1회차)', totalAmount: 60000, salesAmount: 60000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (유지)', totalAmount: 10000, salesAmount: 0, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  {
    hqName: '더라이프앤', bankName: '하나', accountNumber: '79391040692907', accountHolder: '박인천(더드림)', productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 650000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합540플러스', totalAmount: 500000, salesAmount: 360000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합360플러스', totalAmount: 250000, salesAmount: 240000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (1회차)', totalAmount: 60000, salesAmount: 60000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (유지)', totalAmount: 10000, salesAmount: 0, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  {
    hqName: '더원시스템', bankName: '하나', accountNumber: '17291002173204', accountHolder: '주식회사 더원시스템', productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 700000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합540플러스', totalAmount: 500000, salesAmount: 360000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합360플러스', totalAmount: 250000, salesAmount: 240000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (1회차)', totalAmount: 60000, salesAmount: 60000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (유지)', totalAmount: 10000, salesAmount: 0, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  {
    hqName: '위더스앤씨', bankName: '기업', accountNumber: '49707471104012', accountHolder: '주식회사 위더스앤씨', productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 680000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은라이즈498', totalAmount: 680000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  {
    hqName: '커런시마켓', bankName: '하나', accountNumber: '77991002664704', accountHolder: '주식회사 커런시마켓', productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 720000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  {
    hqName: '드라마플라워', bankName: '-', accountNumber: '-', accountHolder: '-', productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 650000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합540플러스', totalAmount: 500000, salesAmount: 360000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합360플러스', totalAmount: 250000, salesAmount: 240000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (1회차)', totalAmount: 60000, salesAmount: 60000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (유지)', totalAmount: 10000, salesAmount: 0, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  {
    hqName: '파파쿡', bankName: 'MG새마을금고', accountNumber: '9003293506338', accountHolder: '박진우(파파쿡)', productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 650000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  {
    hqName: '글로씨', bankName: '카카오뱅크', accountNumber: '3333133132556', accountHolder: '이동현',
    settlementType: '개인/프리랜서', // 원천세 3.3% 대상
    productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 595000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  {
    hqName: '웰다잉라이프', bankName: '기업', accountNumber: '16417285904019', accountHolder: '박서영(웰다잉라이프)', productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 650000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  {
    hqName: '뷰티가이', bankName: '기업', accountNumber: '116-132917-01-018', accountHolder: '서정일 (뷰티가이)', productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 650000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합540플러스', totalAmount: 500000, salesAmount: 360000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합360플러스', totalAmount: 250000, salesAmount: 240000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (1회차)', totalAmount: 60000, salesAmount: 60000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (유지)', totalAmount: 10000, salesAmount: 0, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  {
    hqName: '파란하늘', bankName: '기업', accountNumber: '185-096869-02-019', accountHolder: '파란하늘(노은경)', productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 650000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합540플러스', totalAmount: 500000, salesAmount: 360000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합360플러스', totalAmount: 250000, salesAmount: 240000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (1회차)', totalAmount: 60000, salesAmount: 60000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은헬스케어580 (유지)', totalAmount: 10000, salesAmount: 0, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  { hqName: '조민경', bankName: '카카오뱅크', accountNumber: '3333027476861', accountHolder: '조민경', productRules: [] },
  { hqName: '조재윤', bankName: '수협', accountNumber: '206000673009', accountHolder: '조재윤', productRules: [] },
  {
    hqName: '다이렉트', bankName: '-', accountNumber: '-', accountHolder: '-',
    enableOverriding: true,
    overriding: { salesperson: 0, teamLeader: 0, branchManager: 0, hqManager: 0 },
    productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 665000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합540플러스', totalAmount: 500000, salesAmount: 360000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
      { productName: '더좋은통신결합360플러스', totalAmount: 250000, salesAmount: 240000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
  {
    hqName: '어센틱(구)', bankName: '-', accountNumber: '-', accountHolder: '-', productRules: [
      { productName: '더좋은하이브리드698', totalAmount: 665000, salesAmount: 300000, tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0 },
    ]
  },
];


const getHealthcareMaintenanceInfo = (item: ERPDataItem, filterStr: string) => {
  const normProd = item.prodName.replace(/[\s()]/g, '');
  const isHc = normProd.includes('헬스케어80');
  if (!isHc) return null;

  if (item.status.includes('해약') || item.status.includes('취소')) return null;

  const today = new Date();
  let baseYear = today.getFullYear();
  let baseMonth = today.getMonth() + 1;
  let filterDay = 0;

  if (filterStr) {
    const clean = filterStr.replace(/[-./\s]/g, '');
    if (clean.length === 6) {
      baseYear = parseInt('20' + clean.substring(0, 2));
      baseMonth = parseInt(clean.substring(2, 4));
    } else if (clean.length === 8) {
      baseYear = parseInt(clean.substring(0, 4));
      baseMonth = parseInt(clean.substring(4, 6));
      filterDay = parseInt(clean.substring(6, 8));
    } else {
      const match = filterStr.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
      if (match) {
        filterDay = parseInt(match[3]);
      }
    }
  }

  if (filterDay > 0) {
    const displayPayDate = getDisplayPayDate(item);
    const targetDateStr = displayPayDate || item.payDate || item.contractDate || item.deliveryDate;
    let itemDay = 0;
    if (targetDateStr) {
      const itemMatch = targetDateStr.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
      if (itemMatch) {
        itemDay = parseInt(itemMatch[3]);
      }
    }
    if (itemDay === 0 || itemDay !== filterDay) {
      return null;
    }
  }

  const cDateRaw = item.contractDate.replace(/[.\s]/g, '-');
  const cDateObj = new Date(cDateRaw);
  if (isNaN(cDateObj.getTime())) return null;
  
  const tDate = new Date(baseYear, baseMonth - 1, 25);
  const compareCDate = new Date(cDateObj.getFullYear(), cDateObj.getMonth(), 25);
  
  const monthsDiff = (tDate.getFullYear() - compareCDate.getFullYear()) * 12 + (tDate.getMonth() - compareCDate.getMonth());

  if (monthsDiff >= 1 && monthsDiff <= 37) {
    const overdue = parseInt(item.memo || '0') || 0;
    const isOverdue = overdue > 0;
    
    let payCount = 1;
    if (!isOverdue) {
      const paidCount = item.hcPaidCount || 0;
      if (paidCount > 0) {
        payCount = Math.max(0, monthsDiff - paidCount);
      } else {
        payCount = 1;
      }
    } else {
      payCount = 0;
    }
    
    if (monthsDiff === 1) {
      if (item.payDate) {
        const itemPayClean = (item.payDate || '').replace(/[-./]/g, '');
        const itemPay6 = itemPayClean.substring(itemPayClean.length - 6);
        const filterClean = `${String(baseYear).substring(2)}${String(baseMonth).padStart(2, '0')}25`;
        if (itemPay6 === filterClean) {
          return { interval: 1, overdueCount: overdue, isOverdue, payCount };
        }
      } else {
        return { interval: 1, overdueCount: overdue, isOverdue, payCount };
      }
    } else {
      return { interval: monthsDiff, overdueCount: overdue, isOverdue, payCount };
    }
  }
  return null;
};


export const getDisplayPayDate = (item: any) => {
  let displayPayDate = item.payDate;
  
  const isSpecialTarget = 
    item.empName?.includes('조민경') || 
    item.empName?.includes('조재윤') || 
    item.empName?.includes('권성훈') || 
    item.empName?.includes('황미주');

  if (isSpecialTarget && item.deliveryStatus && item.deliveryStatus.includes('완료') && item.deliveryDate) {
    const delivDate = item.deliveryDate.replace(/\./g, '-');
    const [y, m] = delivDate.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m)) {
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      displayPayDate = `${nextY}.${String(nextM).padStart(2, '0')}.25`;
    }
  }
  return displayPayDate;
};
const ERP_Dashboard = () => {
  const [data, setData] = useState<ERPDataItem[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('전체');
  const [hqFilter, setHqFilter] = useState('전체');
  const [branchFilter, setBranchFilter] = useState('전체');
  const [deliveryFilter, setDeliveryFilter] = useState('전체');
  const [payDateFilter, setPayDateFilter] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [dateFilterType, setDateFilterType] = useState<'payDate' | 'hcRegDate'>('payDate');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [lastUpdate, setLastUpdate] = useState('2026-04-17 05:30');
  const [notification, setNotification] = useState<SyncNotification | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ERPDataItem | null>(null);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [previewTabs, setPreviewTabs] = useState<Record<string, string>>({});
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveSettingsStatus, setSaveSettingsStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [isDailyDashboardModalOpen, setIsDailyDashboardModalOpen] = useState(false);
  const [isMonthlyDashboardModalOpen, setIsMonthlyDashboardModalOpen] = useState(false);
  const [dashboardView, setDashboardView] = useState<'product' | 'hq'>('product');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('전체');
  const [isMemoHistoryModalOpen, setIsMemoHistoryModalOpen] = useState(false);
  const [isManualSettlementModalOpen, setIsManualSettlementModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isHealthcareCalendarModalOpen, setIsHealthcareCalendarModalOpen] = useState(false);
  const [hcCalendarViewDate, setHcCalendarViewDate] = useState(new Date());
  const [isHealthcareListModalOpen, setIsHealthcareListModalOpen] = useState(false);
  const [healthcareFilter, setHealthcareFilter] = useState<{ type: 'date' | 'month', value: string } | null>(null);
  const [detailSource, setDetailSource] = useState<'main' | 'healthcare'>('main');
  const [isMaintenanceStatusModalOpen, setIsMaintenanceStatusModalOpen] = useState(false);
  const [maintenanceTab, setMaintenanceTab] = useState<'eligible' | 'overdue'>('eligible');
  const [isMaintenanceHistoryModalOpen, setIsMaintenanceHistoryModalOpen] = useState(false);
  const [isReconciliationModalOpen, setIsReconciliationModalOpen] = useState(false);
  const [isReconCalendarModalOpen, setIsReconCalendarModalOpen] = useState(false);
  const [reconCalendarViewDate, setReconCalendarViewDate] = useState(new Date());
  const [reconTab, setReconTab] = useState<'NEW' | 'HISTORY'>('NEW');
  const [reconDate, setReconDate] = useState('');
  const [reconData, setReconData] = useState<any[]>([]);
  const [reconHistoryDates, setReconHistoryDates] = useState<string[]>([]);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string>('');
  const [historyReconData, setHistoryReconData] = useState<any[]>([]);
  const [reconLoading, setReconLoading] = useState(false);
  const [activeHqId, setActiveHqId] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<string | null>(null);
  const [expandedHqs, setExpandedHqs] = useState<Record<string, boolean>>({});
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());
  const [topDashboardMonth, setTopDashboardMonth] = useState<string>(new Date().toISOString().substring(0, 7));
  const [topDashboardMode, setTopDashboardMode] = useState<'구좌수' | '상품개수'>('구좌수');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 정산 설정 비밀번호 처리 함수
  const handleOpenSettings = () => {
    setPasswordInput('');
    setPasswordError(false);
    setIsPasswordModalOpen(true);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === '880805') {
      setIsPasswordModalOpen(false);
      setPasswordError(false);
      setIsSettingsModalOpen(true);
    } else {
      setPasswordError(true);
      setPasswordInput('');
    }
  };

  // 유지수수료 내역 및 관리 모달 상태
  const [mHistoryProductFilter, setMHistoryProductFilter] = useState('전체');
  const [mHistoryMonthFilter, setMHistoryMonthFilter] = useState('전체');
  const [mHistorySearch, setMHistorySearch] = useState('');
  const [mHistoryPage, setMHistoryPage] = useState(1);
  const [mHistorySyncing, setMHistorySyncing] = useState(false);

  // 수동 수수료 정산 상태
  interface ManualProduct {
    id: string;
    productName: string;
    salesFee: number;
    promoFee: number;
    count: number;
  }
  const [manualDate, setManualDate] = useState('');
  const [manualHq, setManualHq] = useState('');
  const [manualAccount, setManualAccount] = useState('');
  const [manualBasis, setManualBasis] = useState<'사업자' | '개인'>('사업자');
  const [manualProducts, setManualProducts] = useState<ManualProduct[]>([]);

  // 셀 값 업데이트 (구글 시트 연동)
  const updateCell = async (rowIdx: number, colIdx: number, newValue: string) => {
    setIsUpdating(true);
    try {
      const res = await fetch('/api/sheets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIdx, colIdx, newValue })
      });

      if (!res.ok) {
        if (res.status === 401) {
          setIsAuthenticated(false);
          throw new Error('인증 세션이 만료되었습니다. 다시 연동해 주세요.');
        }
        const errorData = await res.json();
        throw new Error(errorData.error || '업데이트 실패');
      }

      setNotification({ message: '시트가 성공적으로 업데이트되었습니다.', type: 'success' });
      loadData(); // 데이터 새로고침
    } catch (err) {
      console.error(err);
      alert('업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };






  // 정산 설정 상태 (본부별) - v2 키 사용으로 강제 리셋 (최신 데이터 반영)
  const [hqSettings, setHqSettings] = useState<HQSetting[]>(() => {
    const saved = localStorage.getItem('erp_hq_settings_v2');
    if (saved) return JSON.parse(saved);

    // 초기 데이터가 없는 경우 마스터 데이터로 시딩
    return MASTER_HQ_DATA.map((m, idx) => ({
      id: `hq-${idx + 1}`,
      hqName: m.hqName || '신규본부',
      bankName: m.bankName || '-',
      accountNumber: m.accountNumber || '-',
      accountHolder: m.accountHolder || '-',
      paymentMethod: m.paymentMethod || '계좌이체',
      enableOverriding: m.enableOverriding ?? false,
      overriding: m.overriding || { salesperson: 0, teamLeader: 0, branchManager: 0, hqManager: 0 },
      settlementType: m.settlementType || '사업자',
      productRules: m.productRules || []
    }));
  });

  const [globalIncentiveRules, setGlobalIncentiveRules] = useState<GlobalIncentiveRule[]>(() => {
    const saved = localStorage.getItem('erp_global_incentives');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'jaeyun', targetName: '조재윤', payDay: 25, targetHq: 'ALL', targetProducts: ['ALL'], baseDateType: 'DELIVERY', commissionPerUnit: 10000, minimumGuarantee: 2000000 },
      { id: 'minkyung', targetName: '조민경', payDay: 25, targetHq: 'ALL', targetProducts: ['ALL'], baseDateType: 'DELIVERY', commissionPerUnit: 5000, minimumGuarantee: 0 },
      { id: 'sunghoon', targetName: '권성훈', payDay: 25, targetHq: 'ALL', targetProducts: ['ALL'], baseDateType: 'CONTRACT', commissionPerUnit: 0, minimumGuarantee: 2500000 }
    ];
  });

  const [settingsTab, setSettingsTab] = useState<'hq' | 'global_incentive' | 'maintenance'>('hq');

  const [maintenanceRules, setMaintenanceRules] = useState<MaintenanceFeeRule[]>(() => {
    const saved = localStorage.getItem('erp_maintenance_rules');
    if (saved) return JSON.parse(saved);
    return [];
  });

  const [maintenanceHistory, setMaintenanceHistory] = useState<any[]>([]);

  const loadMaintenanceHistory = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/sheets/maintenance/history');
      const data = await res.json();
      if (data.history) setMaintenanceHistory(data.history);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isAuthenticated) loadMaintenanceHistory();
  }, [isAuthenticated]);

  useEffect(() => {
    localStorage.setItem('erp_hq_settings_v2', JSON.stringify(hqSettings));
    localStorage.setItem('erp_global_incentives', JSON.stringify(globalIncentiveRules));
    localStorage.setItem('erp_maintenance_rules', JSON.stringify(maintenanceRules));
  }, [hqSettings, globalIncentiveRules, maintenanceRules]);

  const allDatesWithData = React.useMemo(() => {
    return new Set(data.map(item => {
      const dDate = getDisplayPayDate(item);
      return dDate ? dDate.replace(/[-/]/g, '.') : '';
    }).filter(Boolean));
  }, [data, globalIncentiveRules]);

  // 설정 모달 열릴 때 첫 번째 본부 자동 선택
  React.useEffect(() => {
    if (isSettingsModalOpen && !activeHqId && hqSettings.length > 0) {
      setActiveHqId(hqSettings[0].id);
    }
  }, [isSettingsModalOpen, activeHqId, hqSettings]);

  const saveSettingsToCloud = async () => {
    if (!isAuthenticated) return;
    setSaveSettingsStatus('saving');
    try {
      const res = await fetch('/api/sheets/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: hqSettings, globalIncentives: globalIncentiveRules, maintenanceRules })
      });
      if (!res.ok) throw new Error('Cloud save failed');
      setSaveSettingsStatus('success');
      setNotification({ message: '본부 및 전체 설정이 구글 시트에 저장되었습니다.', type: 'success' });
      setTimeout(() => setSaveSettingsStatus('idle'), 3000);
    } catch (err) {
      console.error(err);
      setSaveSettingsStatus('error');
      alert('설정 저장 중 오류가 발생했습니다.');
      setTimeout(() => setSaveSettingsStatus('idle'), 3000);
    }
  };

  const loadSettingsFromCloud = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/sheets/settings/load');
      const data = await res.json();
      if (data.settings) {
        setHqSettings(data.settings);
        if (data.globalIncentives && Array.isArray(data.globalIncentives)) {
          setGlobalIncentiveRules(data.globalIncentives);
        }
        if (data.maintenanceRules && Array.isArray(data.maintenanceRules)) {
          setMaintenanceRules(data.maintenanceRules);
        }
        setNotification({ message: '구글 시트에서 설정을 불러왔습니다.', type: 'success' });
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadSettingsFromCloud();
    }
  }, [isAuthenticated]);

  // 구글 시트 + 로컬 설정을 완전 초기화하고 MASTER_HQ_DATA로 재설정
  const resetSettingsToDefault = async () => {
    if (!window.confirm('⚠️ 주의: 모든 본부 설정(계좌정보, 수수료 등)이 초기값으로 리셋됩니다.\n기존에 저장된 모든 데이터가 삭제됩니다. 계속하시겠습니까?')) return;

    // 즉각적인 로컬 UI 초기화
    const defaultSettings = MASTER_HQ_DATA.map((m, idx) => ({
      id: `hq-${idx + 1}`,
      hqName: m.hqName || '신규본부',
      bankName: m.bankName || '-',
      accountNumber: m.accountNumber || '-',
      accountHolder: m.accountHolder || '-',
      paymentMethod: m.paymentMethod || '계좌이체',
      enableOverriding: m.enableOverriding ?? false,
      overriding: m.overriding || { salesperson: 0, teamLeader: 0, branchManager: 0, hqManager: 0 },
      settlementType: m.settlementType || '사업자',
      productRules: m.productRules || []
    }));

    setHqSettings(defaultSettings);
    localStorage.removeItem('erp_hq_settings_v2');
    setActiveHqId('hq-1'); // 첫 번째 본부로 선택 이동

    try {
      // 서버 데이터 초기화 요청
      if (isAuthenticated) {
        await fetch('/api/sheets/settings/reset', { method: 'POST' });
        setNotification({ message: '구글 시트와 로컬 설정이 모두 초기화되었습니다.', type: 'success' });
      } else {
        setNotification({ message: '로컬 설정이 초기화되었습니다. (구글 연동 안됨)', type: 'success' });
      }
    } catch (err) {
      console.error('Reset error:', err);
      setNotification({ message: '로컬은 초기화되었으나 구글 시트 삭제 중 오류가 발생했습니다.', type: 'error' });
    }
  };

  const [selectedHqIdForOv, setSelectedHqIdForOv] = useState<string | null>(null);
  const [selectedHqIdForRules, setSelectedHqIdForRules] = useState<string | null>(null);
  const [editingRuleInfo, setEditingRuleInfo] = useState<{ hqId: string, ruleIdx: number } | null>(null);

  useEffect(() => {
    localStorage.setItem('erp_hq_settings_v2', JSON.stringify(hqSettings));
  }, [hqSettings]);

  // 구글 연동 상태 체크
  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const { authenticated } = await res.json();
      setIsAuthenticated(authenticated);
    } catch (error) {
      console.error('Auth check fail:', error);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // 구글 연동 팝업
  const handleConnect = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const authData = await res.json();

      if (!res.ok) {
        const errorInfo = authData.error || '알 수 없는 서버 오류';
        alert(`[연동 준비 실패] ${errorInfo}\n\n리디렉션 URI 설정 문제일 수 있습니다.\n현재 앱의 리디렉션 URI: ${authData.redirectUri || '확인 불가'}`);
        return;
      }

      const popup = window.open(authData.url, 'google_auth', 'width=600,height=700');

      if (!popup) {
        alert('팝업 차단이 설정되어 있습니다. 팝업을 허용해 주세요.');
        return;
      }

      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
          setIsAuthenticated(true);
          setNotification({ message: '구글 시트가 성공적으로 연동되었습니다!', type: 'success' });
          loadData();
          window.removeEventListener('message', messageHandler);
        }
      };
      window.addEventListener('message', messageHandler);
    } catch (error) {
      console.error('Connection failed:', error);
      alert('연동 과정에서 예상치 못한 오류가 발생했습니다.');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setIsAuthenticated(false);
    setData([]);
  };

  // 날짜 형식 체크 함수 (YYYY-MM-DD 또는 YYYY.MM.DD 등 유연하게 체크)
  const isDate = (val: string) => {
    if (!val) return false;
    const datePattern = /^\d{2,4}[-./]\d{1,2}[-./]\d{1,2}/;
    return datePattern.test(val);
  };

  // 구글 시트 데이터 로드
  const loadReconHistory = async () => {
    try {
      setReconLoading(true);
      const res = await fetch('/api/sheets/reconciliation/load');
      const json = await res.json();
      if (json.history) {
        setHistoryReconData(json.history);
        const dates = Array.from(new Set(json.history.map((h: any) => h['정산기준일']))).sort().reverse();
        setReconHistoryDates(dates as string[]);
        if (dates.length > 0 && !selectedHistoryDate) {
          setSelectedHistoryDate(dates[0] as string);
        }
      }
    } catch (e) {
      console.error(e);
      setNotification({ message: '내역을 불러오지 못했습니다.', type: 'info' });
    } finally {
      setReconLoading(false);
    }
  };

  const fetchEnexData = async () => {
    if (!reconDate) {
      setNotification({ message: '정산기준일을 먼저 입력해주세요.', type: 'info' });
      return;
    }
    
    try {
      setReconLoading(true);
      const res = await fetch('/api/sheets/reconciliation/fetch-enex');
      const json = await res.json();
      
      if (!json.success) {
        setNotification({ message: json.message || '에넥스수수료 데이터를 불러오는데 실패했습니다.', type: 'info' });
        return;
      }
      
      const excelData = json.data;

      const localStatsMap = new Map<string, number>();
      data.forEach(d => {
        if (!d.hq || !d.prodName) return;
        const k = `${d.hq}|${d.prodName}`;
        localStatsMap.set(k, (localStatsMap.get(k) || 0) + 1);
      });

      const newReconData = excelData.map((row: any) => {
        const rentalNo = String(row['계약ID'] || row['계약ID(렌탈번호)'] || '').trim();
        if (!rentalNo) return null;
        
        const matchedInternals = data.filter(d => d.rentalNo === rentalNo);
        const extDeposit = Number((row['수수료 합계\n (TOTAL)'] || row['수수료 합계 (TOTAL)'] || row['수수료 합계(TOTAL)'] || row['수수료 합계'] || 0).toString().replace(/,/g, ''));
        
        if (matchedInternals.length > 0) {
          const firstMatch = matchedInternals[0];
          const hqName = firstMatch.hq;
          const branchName = firstMatch.branch;
          const empName = firstMatch.empName;
          const prodName = firstMatch.prodName;
          const custName = firstMatch.memName;
          const intContractDate = firstMatch.contractDate;
          const intDeliveryDate = firstMatch.deliveryDate;
          const payDate = firstMatch.payDate;
          const extDeliveryDate = row['배송일'] || '';
          const accountCount = matchedInternals.length; 
          
          let internalPayable = 0;
          matchedInternals.forEach(internalItem => {
              const commission = calculateCommissionDetails(internalItem, localStatsMap);
              internalPayable += commission.finalPayable || commission.totalCommission;
          });

          return {
            '계약ID(렌탈번호)': rentalNo,
            '고객명': custName || row['고객명'],
            '본부명': hqName,
            '지사명': branchName,
            '사원명': empName,
            '상품명': prodName,
            '계약일자': intContractDate,
            '거래처 배송일': extDeliveryDate,
            '내부 배송일자': intDeliveryDate,
            '수수료지급일자': payDate,
            '정산기준일': reconDate,
            '구좌수': accountCount,
            '거래처입금액': extDeposit,
            '내부지급액합계': internalPayable,
            '최종순수익': extDeposit - internalPayable,
            '비고': '정상'
          };
        } else {
          return {
            '계약ID(렌탈번호)': rentalNo,
            '고객명': row['고객명'],
            '본부명': '',
            '지사명': '',
            '사원명': '',
            '상품명': row['상품명'],
            '계약일자': '',
            '거래처 배송일': row['배송일'] || '',
            '내부 배송일자': '',
            '수수료지급일자': '',
            '정산기준일': reconDate,
            '구좌수': row['실적(건)'] || 1, 
            '거래처입금액': extDeposit,
            '내부지급액합계': 0,
            '최종순수익': extDeposit,
            '비고': '내부 데이터 누락'
          };
        }
      }).filter(Boolean);
      
      setReconData(newReconData);
      setNotification({ message: '에넥스수수료 데이터를 성공적으로 불러왔습니다.', type: 'success' });
    } catch (e) {
       console.error(e);
       setNotification({ message: '에넥스수수료 데이터를 불러오지 못했습니다.', type: 'info' });
    } finally {
      setReconLoading(false);
    }
  };

  const saveReconData = async () => {
    if (reconData.length === 0) return;
    try {
      setReconLoading(true);
      const rows = reconData.map(d => [
        d['정산기준일'], d['계약ID(렌탈번호)'], d['고객명'], d['본부명'],
        d['상품명'], d['계약일자'], d['내부 배송일자'],
        d['구좌수'], d['거래처입금액'], d['내부지급액합계'], d['최종순수익'], d['비고']
      ]);
      const res = await fetch('/api/sheets/reconciliation/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows })
      });
      const responseData = await res.json();
      if (responseData.success) {
        setNotification({ message: '대사 내역이 성공적으로 저장되었습니다.', type: 'success' });
        setReconData([]);
        setReconDate('');
        setReconTab('HISTORY');
        loadReconHistory();
      } else {
        setNotification({ message: '저장에 실패했습니다.', type: 'info' });
      }
    } catch (e) {
      console.error(e);
      setNotification({ message: '저장 중 오류가 발생했습니다.', type: 'info' });
    } finally {
      setReconLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (!isAuthenticated) {
        // Mock data if not authenticated for preview
        const initialData: ERPDataItem[] = [
          {
            uniqueKey: 'mock-1',
            originalRowIdx: 2,
            contractDate: '2026-04-16',
            memNo: 'M12345',
            memName: '홍길동',
            resNo: '800101-1',
            phone: '010-1234-5678',
            prodName: '더좋은하이브리드698',
            rentalProd: '브람스안마의자',
            rentalNo: 'R99990',
            deliveryStatus: '배송완료',
            status: '정상',
            deliveryDate: '2026-04-17',
            payDate: '2026-05-15',
            hq: '경기본부',
            branch: '수원지사',
            empName: '김철수',
            hc: '대상자, 보류, 기타',
            paymentStatus: '',
            hcRegDate: '2026-04-16',
            memo: '',
            raw: new Array(30).fill('보류 데이터')
          },
        ];
        setData(initialData);
        setLoading(false);
        return;
      }

      const res = await fetch('/api/sheets/data');
      if (!res.ok) {
        const errorData = await res.json();
        if (res.status === 401) {
          setIsAuthenticated(false);
        }
        throw new Error(errorData.error || 'Data fetch failed');
      }
      const sheetData = await res.json();
      const sheetHeaders = sheetData[0] || [];
      setHeaders(sheetHeaders);

      const formatted: ERPDataItem[] = sheetData.slice(1)
        .map((row: any[], idx: number) => ({ row, idx: idx + 1 })) // 원래 인덱스 유지 (헤더 제외하므로 +1)
        .filter(({ row }) => isDate(String(row[0]))) // A열이 날짜인 데이터만 (B열 취소 필터 제거)
        .map(({ row, idx }) => {
          let payDate = String(row[14] || '').trim();
          let paymentStatus = String(row[19] || '');

          // O열 수수료지급일이 4월 23일 이전건은 모두 지급완료 처리 및 날짜 포맷팅
          let normalizedPayDate = payDate.replace(/[./]/g, '-');
          if (normalizedPayDate.length === 5) {
            normalizedPayDate = `2026-${normalizedPayDate}`;
          } else if (normalizedPayDate.length > 5 && !normalizedPayDate.startsWith('20')) {
            const parts = normalizedPayDate.split('-');
            if (parts.length === 3 && parts[0].length === 2) {
              normalizedPayDate = `20${normalizedPayDate}`;
            }
          }

          if (normalizedPayDate && normalizedPayDate <= '2026-04-23' && payDate !== '') {
            paymentStatus = '지급완료';
          }

          // 일관된 날짜 비교를 위해 payDate 값을 포맷팅 (YYYY.MM.DD)
          if (normalizedPayDate && normalizedPayDate.length >= 10) {
            payDate = normalizedPayDate.replace(/-/g, '.');
          }

          return {
            uniqueKey: `sheet-${row[0]}-${idx}`,
            originalRowIdx: idx + 1, // Sheets API는 1부터 시작 (우리는 rawData[0]이 헤더이므로 row 2부터 데이터)
            contractDate: String(row[0] || ''),     // A(0)
            memNo: String(row[2] || ''),            // C(2)
            memName: String(row[3] || ''),          // D(3)
            resNo: String(row[4] || ''),            // E(4)
            phone: String(row[5] || ''),            // F(5)
            prodName: String(row[6] || ''),         // G(6)
            rentalProd: String(row[12] || ''),      // M(12)
            rentalNo: String(row[10] || ''),        // K(10)
            deliveryStatus: String(row[11] || ''),  // L(11)
            deliveryDate: String(row[13] || ''),    // N(13)
            payDate,                                // O(14)
            status: String(row[1] || '').trim() || '가입', // B(1) 공란이면 '가입'
            hq: String(row[7] || ''),               // H(7)
            branch: String(row[8] || ''),           // I(8)
            empName: String(row[9] || ''),          // J(9)
            hc: [row[15], row[16], row[17]].filter(Boolean).join(', '), // P,Q,R
            hcRegDate: String(row[18] || ''),       // S(18)
            paymentStatus: String(row[19] || ''),   // T(19)
            memo: String(row[20] || ''),            // U(20)
            raw: row.length < 30 ? [...row, ...new Array(30 - row.length).fill('')] : row,
          };
        }).filter((item: ERPDataItem) => item.contractDate);

      setData(formatted);
      setLastUpdate(new Date().toLocaleString('ko-KR', { hour12: false }));
    } catch (error: any) {
      console.error('Load fail:', error);
      const msg = error.message.includes('unauthorized_client')
        ? '인증 오류: Client ID/Secret를 확인하고 로그아웃 후 다시 연동해 주세요.'
        : '데이터 로드에 실패했습니다. 구글 시트 ID와 권한을 확인해 주세요.';
      setNotification({ message: msg, type: 'info' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
      loadReconHistory();
    }
  }, [isAuthenticated]);

  // 일괄 업데이트 기능 (지급완료/취소 등)
  const batchUpdateCells = async (updates: { rowIdx: number, colIdx: number, newValue: string }[]) => {
    if (updates.length === 0) return;
    setIsUpdating(true);
    try {
      const res = await fetch('/api/sheets/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });

      if (!res.ok) {
        if (res.status === 401) {
          setIsAuthenticated(false);
          throw new Error('인증 세션이 만료되었습니다.');
        }
        const errorData = await res.json();
        throw new Error(errorData.error || '일괄 업데이트 실패');
      }

      setNotification({ message: `${updates.length}건이 성공적으로 업데이트되었습니다.`, type: 'success' });
      loadData();
    } catch (err: any) {
      console.error(err);
      alert('일괄 업데이트 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // 공통 수수료 계산 로직
  const calculateCommissionDetails = (item: ERPDataItem, hqTotalCountMap: Map<string, number>) => {
    const setting = hqSettings.find(s => s.hqName === item.hq);
    const normalize = (s: string) => s.replace(/[\s()]/g, '').toLowerCase();

    // 상품 매칭
    let productRule = setting?.productRules?.find(r => normalize(r.productName) === normalize(item.prodName));

    // 헬스케어 580 유보적 매칭 및 폴백 로직
    if (!productRule && normalize(item.prodName).includes('헬스케어580')) {
      productRule = setting?.productRules?.find(r => normalize(r.productName).includes('1회차')) ||
        setting?.productRules?.find(r => normalize(r.productName).includes('유지')) ||
        setting?.productRules?.[0];
    }

    // 최종 폴백: 여전히 없는데 상품 규칙이 1개뿐이면 그거라도 사용, 아니면 첫번째 규칙 사용
    if (!productRule && setting?.productRules) {
      if (setting.productRules.length === 1) productRule = setting.productRules[0];
      else if (setting.productRules.length > 0) productRule = setting.productRules[0];
    }

    const count = hqTotalCountMap.get(`${item.hq}|${item.prodName}`) || 1;
    let unitPrice = productRule?.totalAmount || 0;
    let salesPart = productRule?.salesAmount || 0;
    let isSpecialFixedProduct = false;

    // 더좋은통신결합240, 360 특수 수수료 (건당 5만원 고정)
    if (normalize(item.prodName).includes('통신결합240') || normalize(item.prodName).includes('결합360')) {
      unitPrice = 50000;
      salesPart = 50000;
      isSpecialFixedProduct = true;
    }
    // 특수 규칙: 조민경, 조재윤
    else if (item.empName?.includes('조민경')) {
      unitPrice = 5000;
      salesPart = 5000;
    } else if (item.empName?.includes('조재윤')) {
      unitPrice = 10000;
      salesPart = 10000;
    } else if (productRule) {
      const pRule = productRule as ProductRule;
      if (pRule.tier3Count > 0 && count >= pRule.tier3Count) unitPrice = pRule.tier3Price;
      else if (pRule.tier2Count > 0 && count >= pRule.tier2Count) unitPrice = pRule.tier2Price;
      else if (pRule.tier1Count > 0 && count >= pRule.tier1Count) unitPrice = pRule.tier1Price;

      // [FIXED SALES FEE LOGIC - USER REQUESTED]
      const nProd = normalize(item.prodName);
      if (nProd.includes('하이브리드698') || nProd.includes('라이즈498')) {
        salesPart = 300000;
      } else if (nProd.includes('통신결합540')) {
        salesPart = 360000;
      } else if (nProd.includes('통신결합360')) {
        salesPart = 240000;
      } else {
        const ratio = pRule.totalAmount > 0 ? (pRule.salesAmount / pRule.totalAmount) : 1;
        salesPart = unitPrice * ratio;
      }
    }

    let totalCommission = unitPrice;
    let salesComm = salesPart;

    // 조재윤 최소 보장 로직 (개별 항목에 가중치 부여)
    if (item.empName?.includes('조재윤') && !isSpecialFixedProduct) {
      // 조재윤 사원 본인의 당월 실적(지급월이 같은 것) 전체 건수를 집계
      const targetPayDate = getDisplayPayDate(item);
      const jaeyunTotalCount = data.filter(x => 
        x.empName?.includes('조재윤') && 
        getDisplayPayDate(x) === targetPayDate &&
        !x.status.includes('취소')
      ).length;

      const jaeyunCalcTotal = jaeyunTotalCount * 10000;
      if (jaeyunCalcTotal < 2000000 && jaeyunTotalCount > 0) {
        const factor = 2000000 / jaeyunCalcTotal;
        totalCommission = 10000 * factor;
        salesComm = totalCommission; // 조재윤은 전체가 판매수수료 개념
      }
    }

    const promoFee = Math.max(0, totalCommission - salesComm);

    // 지급일자 산출 (글로벌 인센티브 및 조재윤, 조민경용)
    const displayPayDate = getDisplayPayDate(item);

    let settlementType = setting?.settlementType || '사업자';
    if (item.hq === '글로씨') settlementType = '개인/프리랜서';

    let vat = 0;
    let withholdingTax = 0;
    let supplyAmount = totalCommission; // 기본값은 전체수수료

    if (settlementType.includes('개인')) {
      // 개인: 설정액에서 3.3% 공제
      withholdingTax = Math.floor(totalCommission * 0.033);
      vat = 0;
      supplyAmount = totalCommission;
    } else {
      // 사업자: 설정액이 부가세 포함된 '최종액'이므로 공급가액과 부가세를 역산함
      supplyAmount = Math.round(totalCommission / 1.1); // 공급가액
      vat = totalCommission - supplyAmount; // 부가세
      withholdingTax = 0;
    }

    const finalPayable = totalCommission - withholdingTax; // 사업자는 totalCommission 그대로, 개인은 원천세 차감

    return {
      totalCommission,
      salesComm,
      promoFee,
      unitPrice,
      displayPayDate,
      setting,
      settlementType,
      vat,
      withholdingTax,
      finalPayable,
      supplyAmount,
      productRule
    };
  };

  // 바이너리 데이터 변환 유틸리티 (다운로드 호환성 해결)
  const s2ab = (s: string) => {
    const buf = new ArrayBuffer(s.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i !== s.length; ++i) view[i] = s.charCodeAt(i) & 0xFF;
    return buf;
  };

  const executeDownload = (blob: Blob, filename: string) => {
    // FileSaver.js의 saveAs 함수 사용 (파일명 보존 표준 방식)
    const saveAs = (window as any).saveAs;
    if (saveAs) {
      saveAs(blob, filename);
    } else {
      // FileSaver.js 미로드 시 폴백
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
    }
  };

  // 엑셀 수수료 정산서 출력 기능
  const exportCommissionToExcel = (targetMonth: string) => {
    try {
      // 1. 해당 월 데이터 필터링 
      const [year, month] = targetMonth.split('-').map(Number);
      const prevDate = new Date(year, month - 2, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

      const filteredForSettlement = data.filter(item => {
        const payMonth = item.payDate?.substring(0, 7);
        const isStandardTarget = payMonth === targetMonth;
        const isSpecialHq = !!(
          item.empName?.includes('조민경') || 
          item.empName?.includes('조재윤') || 
          item.empName?.includes('권성훈') || 
          item.empName?.includes('황미주')
        );
        const normalizedDeliveryDate = item.deliveryDate?.replace(/\./g, '-');
        let isPrevDelivered = false;
        if (item.deliveryDate && item.deliveryStatus?.includes('완료')) {
          const match = item.deliveryDate.match(/(\d{2,4})[^0-9]+(\d{1,2})/);
          if (match) {
            let y = match[1];
            if (y.length === 2) y = '20' + y;
            const m = match[2].padStart(2, '0');
            const targetY = String(prevDate.getFullYear());
            const targetM = String(prevDate.getMonth() + 1).padStart(2, '0');
            if (y === targetY && m === targetM) {
              isPrevDelivered = true;
            }
          }
        }
        const isNotCancelled = !item.status.includes('취소');
        return (isStandardTarget || (isSpecialHq && isPrevDelivered)) && isNotCancelled;
      });

      if (filteredForSettlement.length === 0) {
        alert(`${targetMonth} 데이터가 없습니다.`);
        return;
      }

      const stats = new Map<string, number>();
      filteredForSettlement.forEach(item => {
        const key = `${item.hq}|${item.prodName}`;
        stats.set(key, (stats.get(key) || 0) + 1);
      });

      const excelData = filteredForSettlement.map((item, idx) => {
        const { totalCommission, salesComm, promoFee, unitPrice, displayPayDate, setting, settlementType, vat, withholdingTax, finalPayable, productRule } = calculateCommissionDetails(item, stats);

        const isProductOvApplied = productRule ? productRule.applyOverriding === true : false;
        const actualOv = (isProductOvApplied && productRule?.overriding) 
          ? productRule.overriding 
          : { salesperson: totalCommission, teamLeader: 0, branchManager: 0, hqManager: 0 };

        let salespersonShare, teamLeaderShare, branchManagerShare, hqManagerShare;
        salespersonShare = actualOv.salesperson;
        teamLeaderShare = actualOv.teamLeader;
        branchManagerShare = actualOv.branchManager;
        hqManagerShare = actualOv.hqManager;

        return {
          '순번': idx + 1,
          '본부명': item.hq,
          '고객명': item.memName,
          '상품명': item.prodName,
          '계약일': item.contractDate,
          '배송현황': item.deliveryStatus,
          '수수료지급일': displayPayDate,
          '당월 실적(건)': stats.get(`${item.hq}|${item.prodName}`) || 1,
          '적용단가': Math.floor(unitPrice),
          '전체수수료': Math.floor(totalCommission),
          '판매수수료': Math.floor(salesComm),
          '판매촉진비': Math.floor(promoFee),
          '정산유형': settlementType,
          '정산금액(총액)': Math.floor(totalCommission),
          '부가세(사업자용)': settlementType === '사업자' ? '포함' : '-',
          '원천세(3.3%)': withholdingTax > 0 ? withholdingTax : '-',
          '최종지급액': finalPayable,
          '영업사원분': Math.floor(salespersonShare),
          '팀장분': Math.floor(teamLeaderShare),
          '지점장분': Math.floor(branchManagerShare),
          '본부장분': Math.floor(hqManagerShare),
          '지급방식': setting?.paymentMethod || '-',
          '은행': setting?.bankName || '-',
          '계좌번호': setting?.accountNumber || '-',
          '예금주': setting?.accountHolder || '-'
        };
      });

      const sheetRows: any[][] = [];
      sheetRows.push([
        '순번', '본부명', '고객명', '상품명', '계약일', '배송현황', '수수료지급일', '당월 실적(건)',
        '적용단가', '전체수수료', '판매수수료', '판매촉진비', '정산유형', '정산금액(총액)',
        '부가세/원천세', '최종지급액', '영업사원분', '팀장분', '지점장분', '본부장분',
        '지급방식', '은행', '계좌번호', '예금주'
      ]);

      excelData.forEach(r => {
        sheetRows.push([
          r['순번'], r['본부명'], r['고객명'], r['상품명'], r['계약일'], r['배송현황'], r['수수료지급일'], r['당월 실적(건)'],
          r['적용단가'], r['전체수수료'], r['판매수수료'], r['판매촉진비'], r['정산유형'], r['정산금액(총액)'],
          r['부가세(사업자용)'] === '포함' ? '부가세포함' : (r['원천세(3.3%)'] !== '-' ? r['원천세(3.3%)'] : '-'),
          r['최종지급액'], r['영업사원분'], r['팀장분'], r['지점장분'], r['본부장분'],
          r['지급방식'], r['은행'], r['계좌번호'], r['예금주']
        ]);
      });

      // 유지수수료 지급 리스트 추가
      if (maintenancePayouts.length > 0) {
        sheetRows.push([]);
        sheetRows.push(['[ 유지수수료 정산 내역 ]']);
        sheetRows.push(['No', '렌탈계약번호', '본부명', '고객명', '상품명', '지급회차', '지급금액']);
        maintenancePayouts.forEach((m, idx) => {
          sheetRows.push([
            idx + 1,
            m.resNo,
            m.hq,
            m.customerName,
            m.productName,
            m.fromInstallment === m.toInstallment ? `${m.fromInstallment}회차` : `${m.fromInstallment}회차 ~ ${m.toInstallment}회차`,
            m.amount
          ]);
        });
      }

      // 특수수당 지급 리스트 추가
      const specialIncentivesList = Object.entries(settlementStats.globalIncentivesSummary || {})
        .filter(([_, amt]) => (amt as number) > 0);
      if (specialIncentivesList.length > 0) {
        sheetRows.push([]);
        sheetRows.push(['[ 특수수당 정산 내역 ]']);
        sheetRows.push(['수급자명', '수당 종류', '지급 수량(구좌)', '최종 수당 금액']);
        specialIncentivesList.forEach(([name, amt]) => {
          const rule = globalIncentiveRules.find(r => r.targetName === name);
          const detail = rule?.incentiveName || (rule ? (rule.targetName === '조재윤' ? '모델비' : (rule.targetName === '조민경' ? '컨설팅비' : '글로벌인센티브')) : '특수수당');
          const matchedCount = settlementStats.hqSummary[name]?.count || 0;
          sheetRows.push([
            name,
            detail,
            matchedCount,
            amt
          ]);
        });
      }

      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "수수료정산");

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
      const blob = new Blob([s2ab(wbout)], { type: 'application/octet-stream' });
      executeDownload(blob, `${targetMonth}_수수료정산서.xlsx`);

      setNotification({ message: `${targetMonth} 정산서 다운로드 완료`, type: 'success' });
    } catch (error) {
      console.error('Export Error:', error);
      alert('정산서 생성 중 오류가 발생했습니다.');
    }
  };

  const filteredData = React.useMemo(() => {
    const result = data
      .filter(item => {
        const matchesSearch =
          item.memName.includes(searchTerm) ||
          item.contractDate.includes(searchTerm) ||
          item.prodName.includes(searchTerm);

        const matchesProduct = productFilter === '전체' || item.prodName === productFilter;
        const matchesHq = hqFilter === '전체' || item.hq === hqFilter;
        const matchesBranch = branchFilter === '전체' || item.branch === branchFilter;
        const matchesDelivery = deliveryFilter === '전체' || item.deliveryStatus === deliveryFilter;

        const isPaid = item.paymentStatus === '지급완료' || (item.hc && item.hc.includes('지급완료'));
        const matchesPaymentStatus =
          paymentStatusFilter === '전체' ||
          (paymentStatusFilter === '지급완료' && isPaid) ||
          (paymentStatusFilter === '지급예정' && !isPaid);

        // 지급일자 필터
        let matchesPayDate = !payDateFilter;
        if (payDateFilter) {
          const displayPayDate = getDisplayPayDate(item);
          const targetDateClean = payDateFilter.replace(/[-./]/g, '');
          const itemPayDateClean = (displayPayDate || '').replace(/[-./]/g, '');
          let normalizedPayFilter = payDateFilter.replace(/[-./]/g, '');

          if (/^\d{6}$/.test(normalizedPayFilter)) {
            const fullYearFilter = `20${normalizedPayFilter}`;
            matchesPayDate = itemPayDateClean === fullYearFilter || itemPayDateClean.includes(fullYearFilter);
          } else {
            matchesPayDate = itemPayDateClean.includes(normalizedPayFilter) || displayPayDate.includes(payDateFilter);
          }
          
          const isSpecialTarget = 
            item.empName?.includes('조민경') || 
            item.empName?.includes('조재윤') || 
            item.empName?.includes('권성훈') || 
            item.empName?.includes('황미주');

          if (!matchesPayDate && isSpecialTarget && targetDateClean.length >= 6) {
             let yStr = targetDateClean.substring(0, 4);
             if (targetDateClean.length === 6 && targetDateClean.startsWith('26')) {
                 yStr = '20' + targetDateClean.substring(0,2);
             }
             const mStr = targetDateClean.length >= 6 ? targetDateClean.substring(targetDateClean.length - 2) : '';
             if (yStr.length === 4 && mStr.length === 2) {
                 const year = parseInt(yStr);
                 const month = parseInt(mStr);
                 const prevDate = new Date(year, month - 2, 1);
                 
                 if (item.deliveryDate && item.deliveryStatus?.includes('완료')) {
                   const match = item.deliveryDate.match(/(\d{2,4})[^0-9]+(\d{1,2})/);
                   if (match) {
                     let y = match[1];
                     if (y.length === 2) y = '20' + y;
                     const m = match[2].padStart(2, '0');
                     const targetY = String(prevDate.getFullYear());
                     const targetM = String(prevDate.getMonth() + 1).padStart(2, '0');
                     if (y === targetY && m === targetM) {
                       matchesPayDate = true;
                     }
                   }
                 }
             }
          }
        }

        return matchesSearch && matchesProduct && matchesHq && matchesBranch && matchesDelivery && matchesPayDate && matchesPaymentStatus;
      })
      .sort((a, b) => {
        const parseDate = (d: string) => {
          const normalized = d.replace(/[./]/g, '-');
          const ts = new Date(normalized).getTime();
          return isNaN(ts) ? 0 : ts;
        };
        const dateA = parseDate(a.contractDate);
        const dateB = parseDate(b.contractDate);
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      });

    // 필터 변경 시 페이지 리셋
    return result;
  }, [data, searchTerm, productFilter, hqFilter, branchFilter, deliveryFilter, payDateFilter, paymentStatusFilter, sortOrder]);

  // 필터 변경 시 페이지 리셋
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, productFilter, hqFilter, branchFilter, deliveryFilter, payDateFilter, paymentStatusFilter]);

  const calculateMaintenancePayouts = React.useCallback((items: ERPDataItem[]) => {
    const payouts: any[] = [];
    if (maintenanceRules.length === 0 && hqSettings.every(h => h.productRules.every(p => !p.applyMaintenance))) return payouts;

    const filterClean = payDateFilter.replace(/[^0-9]/g, '');
    let currentYearMonth = filterClean.length >= 6 ? filterClean.substring(0, 6) : '';
    if (!currentYearMonth) {
      // 만약 조회 조건이 없으면 오늘 기준으로 산정
      const d = new Date();
      currentYearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    
    const currentYear = parseInt(currentYearMonth.substring(0, 4));
    const currentMonth = parseInt(currentYearMonth.substring(4, 6));

    // payDateFilter가 YYYY.MM.DD 형식일 경우 일(Day) 정보 추출
    let filterDay = 0;
    if (payDateFilter) {
      const clean = payDateFilter.replace(/[-./\s]/g, '');
      if (clean.length === 8) {
        filterDay = parseInt(clean.substring(6, 8));
      } else {
        const filterMatch = payDateFilter.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
        if (filterMatch) {
          filterDay = parseInt(filterMatch[3]);
        }
      }
    }

    items.forEach(item => {
      if (item.status.includes('취소') || item.status.includes('해약')) return;
      
      const overdueCount = parseInt(item.raw[20]) || 0; // U열
      if (overdueCount > 0) return; // 연체 시 미지급
      
      // 지급일의 일(Day) 기준 매칭
      if (filterDay > 0) {
        const displayPayDate = getDisplayPayDate(item);
        const targetDateStr = displayPayDate || item.payDate || item.contractDate || item.deliveryDate;
        let itemDay = 0;
        if (targetDateStr) {
          const itemMatch = targetDateStr.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
          if (itemMatch) {
            itemDay = parseInt(itemMatch[3]);
          }
        }
        if (itemDay === 0 || itemDay !== filterDay) {
          return; // 지급일(Day)이 불일치하므로 제외
        }
      }
      
      const hqName = item.hq;
      const prodName = item.prodName.replace(/[\s()]/g, '').toLowerCase();

      const hqSetting = hqSettings.find(h => h.hqName === hqName);
      const productRule = hqSetting?.productRules.find(p => p.productName.replace(/[\s()]/g, '').toLowerCase() === prodName);

      let activeRules: any[] = [];
      let usingProductRule = false;

      if (productRule?.applyMaintenance && productRule.maintenanceRules && productRule.maintenanceRules.length > 0) {
        usingProductRule = true;
        activeRules = productRule.maintenanceRules.filter(r => {
          const itemDateStr = item.contractDate || item.deliveryDate || '';
          const itemClean = itemDateStr.replace(/[^0-9]/g, '');
          if (itemClean) {
            if (r.applyStartDate) {
              const startClean = r.applyStartDate.replace(/[^0-9]/g, '');
              if (startClean && itemClean < startClean) return false;
            }
            if (r.applyEndDate) {
              const endClean = r.applyEndDate.replace(/[^0-9]/g, '');
              if (endClean && itemClean > endClean) return false;
            }
          }
          return true;
        });
      }

      if (!usingProductRule || activeRules.length === 0) {
        usingProductRule = false;
        activeRules = maintenanceRules.filter(r => {
          const hqMatch = r.targetHqs.includes('ALL') || r.targetHqs.includes(hqName);
          const prodMatch = r.targetProducts.includes('ALL') || r.targetProducts.some(p => prodName.includes(p.replace(/[\s()]/g, '').toLowerCase()));
          if (!hqMatch || !prodMatch) return false;

          // 계약일 범위 비교
          const itemDateStr = item.contractDate || item.deliveryDate || '';
          const itemClean = itemDateStr.replace(/[^0-9]/g, '');
          if (itemClean) {
            if (r.applyStartDate) {
              const startClean = r.applyStartDate.replace(/[^0-9]/g, '');
              if (startClean && itemClean < startClean) return false;
            }
            if (r.applyEndDate) {
              const endClean = r.applyEndDate.replace(/[^0-9]/g, '');
              if (endClean && itemClean > endClean) return false;
            }
          }
          return true;
        });
      }

      if (activeRules.length === 0) return;

      const baseDateStr = item.payDate || item.contractDate || item.deliveryDate;
      if (!baseDateStr) return;
      
      const bdMatch = baseDateStr.match(/(\d{4})[-\.](\d{1,2})/);
      if (!bdMatch) return;
      const bdYear = parseInt(bdMatch[1]);
      const bdMonth = parseInt(bdMatch[2]);
      
      let currentInstallment = (currentYear - bdYear) * 12 + (currentMonth - bdMonth) + 1;
      if (currentInstallment < 1) return;

      let lastPaid = 0;
      maintenanceHistory.forEach(h => {
        if (h.resNo === item.resNo && h.payInstallment > lastPaid) {
          lastPaid = h.payInstallment;
        }
      });

      if (currentInstallment <= lastPaid) return; // 이미 지급됨

      let totalAmount = 0;
      let paidFrom = lastPaid + 1;
      
      for (let i = lastPaid + 1; i <= currentInstallment; i++) {
        if (i === 1) continue; // 1회차는 일반수수료(1회차)를 받으므로 유지수수료 지급에서 제외
        let matchedTierAmount = 0;
        
        if (usingProductRule) {
          let tier = activeRules.flatMap(r => r.tiers).find(t => i >= t.startMonth && i <= t.endMonth);
          if (tier) matchedTierAmount = tier.amount;
        } else {
          // Find matching tier across all matched rules (prioritize specific hq rules over 'ALL')
          let specificRule = activeRules.find(r => !r.targetHqs.includes('ALL'));
          if (specificRule) {
            let tier = specificRule.tiers.find((t: any) => i >= t.startMonth && i <= t.endMonth);
            if (tier) matchedTierAmount = tier.amount;
          }
          
          if (!matchedTierAmount) {
            let allRule = activeRules.find(r => r.targetHqs.includes('ALL'));
            if (allRule) {
              let tier = allRule.tiers.find((t: any) => i >= t.startMonth && i <= t.endMonth);
              if (tier) matchedTierAmount = tier.amount;
            }
          }
        }

        if (matchedTierAmount > 0) {
          totalAmount += matchedTierAmount;
        }
      }

      if (totalAmount > 0) {
        payouts.push({
          resNo: item.resNo,
          customerName: item.memName,
          hq: hqName,
          productName: item.prodName,
          amount: totalAmount,
          fromInstallment: paidFrom,
          toInstallment: currentInstallment,
          empName: item.empName,
          branch: item.branch,
        });
      }
    });

    // 맥스 본부 이지안 고객 유지수수료 강제 주입 (7회차 - 2구좌)
    // 이지안 고객의 지급일은 25일이므로, filterDay가 지정되어 있고 25가 아닌 경우에는 주입하지 않음
    if (!filterDay || filterDay === 25) {
      for (let g = 1; g <= 2; g++) {
        const resNoForced = `MAX-LEE-FORCED-${g}`;
        const isLeeAlreadyPaid = maintenanceHistory.some(h => h.resNo === resNoForced && h.payInstallment === 7);
        if (!isLeeAlreadyPaid) {
          payouts.push({
            resNo: resNoForced,
            memNo: g === 1 ? "J2511010332" : "J2511010331",
            customerName: "이지안",
            hq: "맥스",
            productName: "더좋은헬스케어580",
            amount: 10000,
            fromInstallment: 7,
            toInstallment: 7,
            empName: "김학민",
            branch: "맥스",
          });
        }
      }
    }

    return payouts;
  }, [maintenanceRules, hqSettings, maintenanceHistory, payDateFilter]);

  const maintenanceFilteredData = React.useMemo(() => {
    return data.filter(item => {
      const matchesSearch =
        item.memName.includes(searchTerm) ||
        item.contractDate.includes(searchTerm) ||
        item.prodName.includes(searchTerm);

      const matchesProduct = productFilter === '전체' || item.prodName === productFilter;
      const matchesHq = hqFilter === '전체' || item.hq === hqFilter;
      const matchesBranch = branchFilter === '전체' || item.branch === branchFilter;
      const matchesDelivery = deliveryFilter === '전체' || item.deliveryStatus === deliveryFilter;

      return matchesSearch && matchesProduct && matchesHq && matchesBranch && matchesDelivery;
    });
  }, [data, searchTerm, productFilter, hqFilter, branchFilter, deliveryFilter]);

  const maintenancePayouts = React.useMemo(() => {
    return calculateMaintenancePayouts(maintenanceFilteredData);
  }, [maintenanceFilteredData, calculateMaintenancePayouts]);

  const settlementStats = React.useMemo(() => {
    const statsMap = new Map<string, number>();
    data.forEach(item => {
      if (item.status.includes('취소') || item.status.includes('해약')) return;
      const key = `${item.hq}_${item.prodName}_${getDisplayPayDate(item)}`;
      statsMap.set(key, (statsMap.get(key) || 0) + 1);
    });

    const summary: Record<string, { count: number, amount: number }> = {};
    const hqSummary: Record<string, { count: number, amount: number }> = {};
    const dailyMap: Record<string, { totalAmount: number, totalCount: number, products: Record<string, { count: number, amount: number }> }> = {};
    const hqGroups: Record<string, ERPDataItem[]> = {};
    let totalCount = 0;
    let totalAmount = 0;
    let totalPendingAmount = 0;
    let totalPendingEnexAmount = 0;
    let totalPendingCount = 0;

    filteredData.forEach(item => {
      if (item.status.includes('취소') || item.status.includes('해약')) return; // B열(status)에 '취소'나 '해약'이 포함된 경우 제외
      const date = item.payDate || '미지정';
      const hqSetting = hqSettings.find(h => h.hqName === item.hq);
      const normalize = (s: string) => s.replace(/[\s()]/g, '').toLowerCase();
      let rule = hqSetting?.productRules?.find(r => normalize(r.productName) === normalize(item.prodName));

      if (!rule && normalize(item.prodName).includes('헬스케어580')) {
        rule = hqSetting?.productRules?.find(r =>
          normalize(r.productName).includes('1회차')
        ) || hqSetting?.productRules?.find(r =>
          normalize(r.productName).includes('유지')
        ) || hqSetting?.productRules?.[0];
      } else if (!rule && hqSetting?.productRules) {
        if (hqSetting.productRules.length === 1) rule = hqSetting.productRules[0];
        else if (hqSetting.productRules.length > 0) rule = hqSetting.productRules[0];
      }

      let amount = rule?.totalAmount || 0;

      const normalizedProd = normalize(item.prodName);
      const isExcluded = normalizedProd.includes('통신결합240') || normalizedProd.includes('결합360') || normalizedProd.includes('에이모바일');

      if (normalizedProd.includes('통신결합240') || normalizedProd.includes('결합360')) {
        amount = 50000;
      }

      if (isExcluded) return;

      const isPaid = item.paymentStatus === '지급완료' || (item.hc && item.hc.includes('지급완료'));
      const comm = calculateCommissionDetails(item, statsMap);
      const salesPayable = comm.finalPayable || comm.totalCommission;

      if (!isPaid) {
        totalPendingAmount += salesPayable;
        totalPendingCount += 1;
      }

      if (!summary[item.prodName]) summary[item.prodName] = { count: 0, amount: 0 };
      summary[item.prodName].count += 1;
      summary[item.prodName].amount += amount;

      if (!hqSummary[item.hq]) hqSummary[item.hq] = { count: 0, amount: 0 };
      hqSummary[item.hq].count += 1;
      hqSummary[item.hq].amount += amount;

      totalCount += 1;
      totalAmount += amount;

      if (!dailyMap[date]) {
        dailyMap[date] = { totalAmount: 0, totalCount: 0, products: {} };
      }
      dailyMap[date].totalAmount += amount;
      dailyMap[date].totalCount += 1;
      if (!dailyMap[date].products[item.prodName]) dailyMap[date].products[item.prodName] = { count: 0, amount: 0 };
      dailyMap[date].products[item.prodName].count += 1;
      dailyMap[date].products[item.prodName].amount += amount;

      const groupKey = item.hq || '미지정본부';
      if (!hqGroups[groupKey]) hqGroups[groupKey] = [];
      hqGroups[groupKey].push(item);
    });

    const globalIncentivesSummary: Record<string, number> = {};

    globalIncentiveRules.forEach(rule => {
      let matchedCount = 0;
      const filterClean = payDateFilter.replace(/[-./]/g, '');
      if (filterClean.length >= 6) {
        const year = parseInt(filterClean.substring(0, 4));
        const month = parseInt(filterClean.substring(4, 6));
        const prevDate = new Date(year, month - 2, 1);
        const prevYearStr = String(prevDate.getFullYear());
        const prevMonthStr = String(prevDate.getMonth() + 1).padStart(2, '0');
        const targetPrefix1 = `${prevYearStr}-${prevMonthStr}`;
        const targetPrefix2 = `${prevYearStr}.${prevMonthStr}`;

        data.forEach(item => {
          if (item.status.includes('취소') || item.status.includes('해약')) return;
          if (rule.commissionPerUnit === 0 && rule.minimumGuarantee === 0) return;
          let isMatch = false;
          const normalizeHq = (name: string) => (name || '').replace(/[\s()본부]/g, '');
          if (rule.targetHq === 'ALL' || !rule.targetHq || rule.targetHq.trim() === '') {
            if (rule.targetName === '조재윤' || rule.targetName === '조민경') {
              isMatch = true;
            } else {
              isMatch = item.empName?.includes(rule.targetName) || false;
            }
          } else {
            isMatch = normalizeHq(item.hq) === normalizeHq(rule.targetHq);
          }
          if (!isMatch) return;

          if (!rule.targetProducts.includes('ALL')) {
            if (!rule.targetProducts.some((p: string) => item.prodName.includes(p))) return;
          }

          let dateStr = '';
          if (rule.baseDateType === 'DELIVERY') {
            dateStr = item.deliveryDate || '';
            if (!item.deliveryStatus?.includes('완료')) return;
          } else {
            dateStr = item.contractDate || '';
          }

          let isMatchedDate = false;
          const match = dateStr.match(/(\d{2,4})[^0-9]+(\d{1,2})/);
          if (match) {
            let y = match[1];
            if (y.length === 2) y = '20' + y;
            const m = match[2].padStart(2, '0');
            if (y === prevYearStr && m === prevMonthStr) {
              isMatchedDate = true;
            }
          }

          if (isMatchedDate) {
            matchedCount++;
          }
        });
      }

      let commission = matchedCount * rule.commissionPerUnit;
      const finalAmount = Math.max(commission, rule.minimumGuarantee);

      const payDayStr1 = `.${rule.payDay}`;
      const payDayStr2 = `-${rule.payDay.toString().padStart(2, '0')}`;
      const isSettlementDate = payDateFilter.includes(payDayStr1) || payDateFilter.includes(payDayStr2);

      if (isSettlementDate && finalAmount > 0) {
        globalIncentivesSummary[rule.targetName] = (globalIncentivesSummary[rule.targetName] || 0) + finalAmount;
        
        if (!hqSummary[rule.targetName]) hqSummary[rule.targetName] = { count: 0, amount: 0 };
        hqSummary[rule.targetName].amount += finalAmount;
        hqSummary[rule.targetName].count += matchedCount;
        
        const detail = rule.incentiveName || (rule.targetName === '조재윤' ? '모델비' : (rule.targetName === '조민경' ? '컨설팅비' : '특수수당'));
        const specialName = `[${detail}] ${rule.targetName}`;
        if (!summary[specialName]) summary[specialName] = { count: 0, amount: 0 };
        summary[specialName].amount += finalAmount;
        summary[specialName].count += matchedCount;
        
        totalAmount += finalAmount;
        totalPendingAmount += finalAmount;
        totalCount += matchedCount;
        totalPendingCount += matchedCount;
      }
    });

    maintenancePayouts.forEach(m => {
      if (!hqSummary[m.hq]) hqSummary[m.hq] = { count: 0, amount: 0 };
      hqSummary[m.hq].amount += m.amount;
      
      if (!summary[m.productName]) summary[m.productName] = { count: 0, amount: 0 };
      summary[m.productName].amount += m.amount;
      
      totalAmount += m.amount;
      
      // 이미 지급된 내역은 유지수수료 히스토리에 있으므로, payout 배열에 남은 것은 이번 달 미지급분(또는 지급예정)으로 간주
      // 또는 m.item.paymentStatus를 확인할 수 있으나 maintenancePayouts 자체가 지급 대상 목록임.
      // (기존 엑셀 로직에서도 maintenanceSum을 그대로 합계에 더하고 있음)
      totalPendingAmount += m.amount;
    });

    totalPendingEnexAmount = historyReconData
      .filter(d => d['정산기준일'] === payDateFilter)
      .reduce((acc, row) => acc + Number(row['거래처입금액'] || 0), 0);

    return {
      totalCount,
      totalAmount,
      totalPendingAmount,
      totalPendingEnexAmount,
      totalPendingCount,
      details: Object.entries(summary).sort((a, b) => b[1].amount - a[1].amount),
      hqDetails: Object.entries(hqSummary).sort((a, b) => b[1].amount - a[1].amount),
      daily: Object.entries(dailyMap).sort((a, b) => String(b[0]).localeCompare(String(a[0]))) as [string, { totalAmount: number, totalCount: number, products: Record<string, { count: number, amount: number }> }][],
      hqGroups,
      globalIncentivesSummary,
      hqSummary
    };
  }, [filteredData, hqSettings, historyReconData, payDateFilter]);

  const monthlyStats = React.useMemo(() => {
    const monthlyMap: Record<string, {
      totalAmount: number,
      totalCount: number,
      products: Record<string, { count: number, amount: number }>,
      hqs: Record<string, { count: number, amount: number }>
    }> = {};

    data.forEach(item => {
      if (item.status.includes('취소') || item.status.includes('해약')) return; // B열(status)에 '취소'나 '해약'이 포함된 경우 제외
      const displayPayDate = getDisplayPayDate(item);
      const month = displayPayDate?.substring(0, 7) || '미지정';
      const hqSetting = hqSettings.find(h => h.hqName === item.hq);
      const normalize = (s: string) => s.replace(/[\s()]/g, '').toLowerCase();
      let rule = hqSetting?.productRules?.find(r => normalize(r.productName) === normalize(item.prodName));

      if (!rule && normalize(item.prodName).includes('헬스케어580')) {
        rule = hqSetting?.productRules?.find(r =>
          normalize(r.productName).includes('1회차')
        ) || hqSetting?.productRules?.find(r =>
          normalize(r.productName).includes('유지')
        ) || hqSetting?.productRules?.[0];
      } else if (!rule && hqSetting?.productRules) {
        if (hqSetting.productRules.length === 1) rule = hqSetting.productRules[0];
        else if (hqSetting.productRules.length > 0) rule = hqSetting.productRules[0];
      }

      let amount = rule?.totalAmount || 0;
      const normalizedProd = normalize(item.prodName);
      
      if (amount === 0 && rule?.applyMaintenance) {
        if (rule.maintenanceRules && rule.maintenanceRules.length > 0) {
          const tier = rule.maintenanceRules[0].tiers?.find((t: any) => t.startMonth === 1 || t.startMonth <= 1);
          if (tier) amount = tier.amount;
        } else {
          const mRule = maintenanceRules.find(r => r.targetProducts.some(p => normalizedProd.includes(p.replace(/[\s()]/g, '').toLowerCase())));
          if (mRule) {
             const tier = mRule.tiers?.find((t: any) => t.startMonth === 1 || t.startMonth <= 1);
             if (tier) amount = tier.amount;
          }
        }
      }
      const isExcluded = normalizedProd.includes('통신결합240') || normalizedProd.includes('결합360') || normalizedProd.includes('에이모바일');

      if (normalizedProd.includes('통신결합240') || normalizedProd.includes('결합360')) {
        amount = 50000;
      }

      if (isExcluded) return;

      if (!monthlyMap[month]) {
        monthlyMap[month] = { totalAmount: 0, totalCount: 0, products: {}, hqs: {} };
      }

      const stat = monthlyMap[month];
      stat.totalAmount += amount;
      stat.totalCount += 1;

      if (!stat.products[item.prodName]) stat.products[item.prodName] = { count: 0, amount: 0 };
      stat.products[item.prodName].count += 1;
      stat.products[item.prodName].amount += amount;

      let hqKey = item.hq;
      if (item.empName?.includes('권성훈')) hqKey = '권성훈';
      else if (item.empName?.includes('황미주')) hqKey = '황미주';

      if (!stat.hqs[hqKey]) stat.hqs[hqKey] = { count: 0, amount: 0 };
      stat.hqs[hqKey].count += 1;
      stat.hqs[hqKey].amount += amount;
    });

    Object.keys(monthlyMap).forEach(month => {
      const stat = monthlyMap[month];
      const [y, m] = month.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        const prevDate = new Date(y, m - 2, 1);
        const prevYearStr = String(prevDate.getFullYear());
        const prevMonthStr = String(prevDate.getMonth() + 1).padStart(2, '0');

        globalIncentiveRules.forEach(rule => {
          if (rule.targetName !== '조재윤' && rule.targetName !== '조민경') return;

          let matchedCount = 0;
          data.forEach(item => {
            if (item.status.includes('취소') || item.status.includes('해약')) return;

            let isMatch = false;
            const normalizeHq = (name: string) => (name || '').replace(/[\s()본부]/g, '');
            if (rule.targetHq === 'ALL' || !rule.targetHq || rule.targetHq.trim() === '') {
              isMatch = true;
            } else {
              isMatch = normalizeHq(item.hq) === normalizeHq(rule.targetHq);
            }
            if (!isMatch) return;

            if (!rule.targetProducts.includes('ALL')) {
              if (!rule.targetProducts.some((p: string) => item.prodName.includes(p))) return;
            }

            let dateStr = '';
            if (rule.baseDateType === 'DELIVERY') {
              dateStr = item.deliveryDate || '';
              if (!item.deliveryStatus?.includes('완료')) return;
            } else {
              dateStr = item.contractDate || '';
            }

            let isMatchedDate = false;
            const match = dateStr.match(/(\d{2,4})[^0-9]+(\d{1,2})/);
            if (match) {
              let yVal = match[1];
              if (yVal.length === 2) yVal = '20' + yVal;
              const mVal = match[2].padStart(2, '0');
              if (yVal === prevYearStr && mVal === prevMonthStr) {
                isMatchedDate = true;
              }
            }

            if (isMatchedDate) {
              matchedCount++;
            }
          });

          let commission = matchedCount * rule.commissionPerUnit;
          const finalAmount = Math.max(commission, rule.minimumGuarantee);

          if (finalAmount > 0) {
            stat.hqs[rule.targetName] = { count: matchedCount, amount: finalAmount };
            stat.totalAmount += finalAmount;
          }
        });
      }
    });

    return Object.entries(monthlyMap).sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  }, [data, hqSettings]);

  const exportIntegratedSettlement = async () => {
    try {
      if (filteredData.length === 0) return alert('정산 대상 데이터가 없습니다.');

      setNotification({ message: '엑셀 보고서 생성을 위한 데이터를 불러오는 중...', type: 'info' });
      
      let employeeData: any[] = [];
      let orgData: any[] = [];
      try {
        const [resEmp, resOrg] = await Promise.all([
          fetch('/api/sheets/sheetData?sheetName=사원정보'),
          fetch('/api/sheets/sheetData?sheetName=다이렉트조직도')
        ]);
        if (resEmp.ok) employeeData = await resEmp.json();
        if (resOrg.ok) orgData = await resOrg.json();
      } catch (e) {
        console.error('Failed to load sheets', e);
      }

      const directOrgMap = new Map<string, { teamLeader: string, branchManager: string, hqManager: string }>();
      if (orgData.length > 0) {
        const headers: string[] = orgData[0];
        const hqIdx = headers.findIndex(h => h.includes('본부장'));
        const brIdx = headers.findIndex(h => h.includes('지점장'));
        const tmIdx = headers.findIndex(h => h.includes('팀장'));
        const empIdx = headers.findIndex(h => h.includes('사원') || h.includes('영업'));
        orgData.slice(1).forEach(row => {
          const empName = row[empIdx];
          if (empName) {
            directOrgMap.set(empName, {
              hqManager: hqIdx >= 0 ? row[hqIdx] : '',
              branchManager: brIdx >= 0 ? row[brIdx] : '',
              teamLeader: tmIdx >= 0 ? row[tmIdx] : ''
            });
          }
        });
      }

      const employeeBankMap = new Map<string, { bank: string, account: string, holder: string }>();
      if (employeeData.length > 1) {
        employeeData.slice(1).forEach((row: any[]) => {
          const hq = row[2] || ''; const branch = row[3] || ''; const name = row[5] || ''; 
          const holder = row[12] || name; const bank = row[14] || ''; const account = row[15] || '';
          if (name) {
            const bInfo = { bank: bank || '', account: account || '', holder: holder || '' };
            if (branch) {
              employeeBankMap.set(`${branch}_${name}`, bInfo);
            }
            employeeBankMap.set(name, bInfo);
          }
        });
      }

      const wb = XLSX.utils.book_new();
      const statsMap = new Map<string, number>();
      filteredData.forEach(item => {
        const key = `${item.hq}|${item.prodName}`;
        statsMap.set(key, (statsMap.get(key) || 0) + 1);
      });

      const payDateSample = filteredData[0].payDate || '';
      const today = new Date().toISOString().split('T')[0];

      const specialAdditions: Record<string, number> = {};
      Object.entries(settlementStats.globalIncentivesSummary || {}).forEach(([name, amt]) => {
        if ((amt as number) > 0) specialAdditions[name] = (specialAdditions[name] || 0) + (amt as number);
      });
      const combinedHqs = Array.from(new Set([
        ...Object.keys(settlementStats.hqGroups), 
        ...Object.keys(specialAdditions),
        ...maintenancePayouts.map(m => m.hq)
      ]));

      let totalNetPay = 0;
      combinedHqs.forEach(hq => {
        let hqGross = specialAdditions[hq] || 0;
        
        // 유지수수료 금액 가산
        const maintenanceSum = maintenancePayouts.filter(m => m.hq === hq).reduce((sum, m) => sum + m.amount, 0);
        hqGross += maintenanceSum;

        const items = settlementStats.hqGroups[hq] || [];
        items.forEach((item: any) => {
          const { totalCommission } = calculateCommissionDetails(item, statsMap);
          hqGross += totalCommission;
        });
        const setting = hqSettings.find(s => s.hqName === hq);
        const isIndiv = setting?.settlementType?.includes('개인') || hq === '글로씨';
        totalNetPay += isIndiv ? (hqGross - Math.floor(hqGross * 0.033)) : hqGross;
      });

      // --- 리포트용 통합 시트 데이터 ---
      const reportRows: any[][] = [
        ['[ 전사 통합 정산 종합 보고서 ]'],
        [`보고일자: ${today} | 지급기준: ${payDateSample.substring(0, 7)}`],
        [],
        ['1. 전체 정산 개요'],
        ['지급 기준일', '총 집계 본부수', '총 계약 구좌수', '총 실지급 합계액'],
        [payDateSample.substring(0, 7), combinedHqs.length, settlementStats.totalCount, { v: totalNetPay, t: 'n', z: '#,##0' }],
        [],
        ['2. 본부별 정산 현황'],
        ['본부명', '정산유형', '건수', '총합계액', '공급가액', '부가세/원천세', '실지급액', '지급계좌'],
      ];

      // 1. 본부별 정산 목록 출력 (순수 본부 정산)
      const generalHqs = combinedHqs.filter(hq => {
        const items = settlementStats.hqGroups[hq] || [];
        const maintenanceSum = maintenancePayouts.filter(m => m.hq === hq).reduce((sum, m) => sum + m.amount, 0);
        return items.length > 0 || maintenanceSum > 0;
      });

      generalHqs.forEach(hqName => {
        const items = settlementStats.hqGroups[hqName] || [];
        const maintenanceSum = maintenancePayouts.filter(m => m.hq === hqName).reduce((sum, m) => sum + m.amount, 0);
        
        let generalSum = 0;
        items.forEach((item: any) => {
          const { totalCommission } = calculateCommissionDetails(item, statsMap);
          generalSum += totalCommission;
        });

        const hqGross = generalSum + maintenanceSum;
        const setting = hqSettings.find(h => h.hqName === hqName);
        const isIndiv = setting?.settlementType?.includes('개인') || hqName === '글로씨';
        const supply = isIndiv ? hqGross : Math.round(hqGross / 1.1);
        const tax = isIndiv ? Math.floor(hqGross * 0.033) : (hqGross - supply);
        const net = hqGross - (isIndiv ? tax : 0);
        
        const maintCount = maintenancePayouts.filter(m => m.hq === hqName).length;
        const totalCountVal = items.length + maintCount;

        reportRows.push([
          hqName,
          isIndiv ? '개인' : '법인',
          totalCountVal,
          { v: hqGross, t: 'n', z: '#,##0' },
          { v: supply, t: 'n', z: '#,##0' },
          { v: isIndiv ? -tax : tax, t: 'n', z: '#,##0' },
          { v: net, t: 'n', z: '#,##0' },
          `${setting?.bankName || '-'} ${setting?.accountNumber || '-'} (${setting?.accountHolder || '-'})`
        ]);
      });

      // 2. 사원별 정산 현황
      reportRows.push([]);
      reportRows.push(['3. 사원별 지급 요약 (Overriding 포함)']);
      reportRows.push(['본부명', '사원명', '역할', '건수', '총합계액', '공급가액', '부가세/원천세', '실지급액', '지급계좌']);

      const hqEmpSummaryMap = new Map<string, any>();
      
      // 유지수수료 대상자도 사원별 요약에 세전 금액으로 합산
      maintenancePayouts.forEach(payout => {
        const originContract = filteredData.find(d => d.resNo === payout.resNo);
        if (!originContract && !payout.empName) return;

        // 본부 정산유형 체크 - 법인(사업자) 본부인 경우 사원별 지급 요약에서 제외
        const setting = hqSettings.find(s => s.hqName === payout.hq);
        const isIndiv = setting?.settlementType?.includes('개인') || payout.hq === '글로씨';
        if (!isIndiv) return;

        const role = '영업사원';
        const branchVal = payout.branch || (originContract ? originContract.branch : '-');
        const empNameVal = payout.empName || (originContract ? originContract.empName : '-');
        const key = `${payout.hq}|${branchVal}|${empNameVal}|${role}`;

        if (!hqEmpSummaryMap.has(key)) {
          hqEmpSummaryMap.set(key, { 
            hq: payout.hq, 
            branch: branchVal, 
            empName: empNameVal, 
            role, 
            count: 0,
            totalGross: 0 
          });
        }
        hqEmpSummaryMap.get(key).count += 1;
        hqEmpSummaryMap.get(key).totalGross += payout.amount;
      });

      // 일반 계약 및 오버라이딩 수수료 세전 금액으로 사원별 합산
      filteredData.forEach(item => {
        if (item.status.includes('취소')) return;
        const { totalCommission, productRule } = calculateCommissionDetails(item, statsMap);
        const setting = hqSettings.find(s => s.hqName === item.hq);
        const isIndiv = setting?.settlementType?.includes('개인') || item.hq === '글로씨';

        // 본부 정산유형 체크 - 법인(사업자) 본부인 경우 사원별 지급 요약에서 제외
        if (!isIndiv) return;

        const isProductOvApplied = productRule ? productRule.applyOverriding !== false : true;
        
        // org 변수 복원
        const org = directOrgMap.get(item.empName) || { teamLeader: '', branchManager: '', hqManager: '' };

        if (setting?.enableOverriding || item.hq === '다이렉트') {
          const defaultOv = setting?.overriding || { salesperson: totalCommission, teamLeader: 0, branchManager: 0, hqManager: 0 };
          const ov = (isProductOvApplied && productRule?.overriding) ? productRule.overriding : defaultOv;
          let sh = { sp: totalCommission, tl: 0, bm: 0, hm: 0 };
          if (setting?.enableOverriding && isProductOvApplied) {
            sh.sp = ov.salesperson; sh.tl = ov.teamLeader; sh.bm = ov.branchManager; sh.hm = ov.hqManager;
          }
          
          const add = (name: string, role: string, amount: number) => {
            if (amount <= 0 || !name) return;
            const key = `${item.hq}|${item.branch || '-'}|${name}|${role}`;
            if (!hqEmpSummaryMap.has(key)) {
              hqEmpSummaryMap.set(key, { 
                hq: item.hq, 
                branch: role === '영업사원' ? (item.branch || '-') : '-', 
                empName: name, 
                role, 
                count: 0,
                totalGross: 0 
              });
            }
            hqEmpSummaryMap.get(key).count += 1;
            hqEmpSummaryMap.get(key).totalGross += amount;
          };
          add(item.empName, '영업사원', sh.sp);
          add(org.teamLeader, '팀장', sh.tl);
          add(org.branchManager, '지점장', sh.bm);
          add(org.hqManager, '본부장', sh.hm);
        } else {
          // 오버라이딩 비활성화된 본부의 경우 수수료 전체가 영업사원에게 귀속
          const add = (name: string, role: string, amount: number) => {
            if (amount <= 0 || !name) return;
            const key = `${item.hq}|${item.branch || '-'}|${name}|${role}`;
            if (!hqEmpSummaryMap.has(key)) {
              hqEmpSummaryMap.set(key, { 
                hq: item.hq, 
                branch: role === '영업사원' ? (item.branch || '-') : '-', 
                empName: name, 
                role, 
                count: 0,
                totalGross: 0 
              });
            }
            hqEmpSummaryMap.get(key).count += 1;
            hqEmpSummaryMap.get(key).totalGross += amount;
          };
          add(item.empName, '영업사원', totalCommission);
        }
      });

      const roleWeight = (r: string) => ({ '영업사원': 1, '팀장': 2, '지점장': 3, '본부장': 4 }[r] || 5);
      Array.from(hqEmpSummaryMap.values())
        .sort((a, b) => a.hq.localeCompare(b.hq) || a.branch.localeCompare(b.branch) || roleWeight(a.role) - roleWeight(b.role) || a.empName.localeCompare(b.empName))
        .forEach(p => {
          const setting = hqSettings.find(s => s.hqName === p.hq);
          const isIndiv = setting?.settlementType?.includes('개인') || p.hq === '글로씨';
          
          const gross = p.totalGross;
          const supply = isIndiv ? gross : Math.round(gross / 1.1);
          const tax = isIndiv ? Math.floor(gross * 0.033) : (gross - supply);
          const net = gross - (isIndiv ? tax : 0);

          let b = '-', a = '-', h = '-';
          // 개인 정산 대상이거나 다이렉트인 경우 사원리스트에서 개별 계좌를 가져옴
          const bi = employeeBankMap.get(`${p.branch}_${p.empName}`) || employeeBankMap.get(p.empName);
          if (bi && (p.hq === '다이렉트' || isIndiv)) {
            b = bi.bank || '-'; 
            a = bi.account || '-'; 
            h = bi.holder || '-'; 
          } else { 
            b = setting?.bankName || '-'; 
            a = setting?.accountNumber || '-'; 
            h = setting?.accountHolder || '-'; 
          }
          
          reportRows.push([
            p.hq,
            p.empName,
            p.role,
            p.count,
            { v: gross, t: 'n', z: '#,##0' },
            { v: supply, t: 'n', z: '#,##0' },
            { v: isIndiv ? -tax : tax, t: 'n', z: '#,##0' },
            { v: net, t: 'n', z: '#,##0' },
            `${b} ${a} (${h})`
          ]);
        });

      // 3. 특수수당 정산 현황
      reportRows.push([]);
      reportRows.push(['4. 특수수당 지급 요약']);
      reportRows.push(['대상자명', '수당 종류', '건수', '총합계액', '공급가액', '부가세/원천세', '실지급액', '지급계좌']);

      Object.entries(specialAdditions).forEach(([hqName, amt]) => {
        const setting = hqSettings.find(s => s.hqName === hqName);
        const isIndiv = setting?.settlementType?.includes('개인') || hqName === '글로씨';
        
        const gross = amt;
        const supply = isIndiv ? gross : Math.round(gross / 1.1);
        const tax = isIndiv ? Math.floor(gross * 0.033) : (gross - supply);
        const net = gross - (isIndiv ? tax : 0);

        const rule = globalIncentiveRules.find(r => r.targetName === hqName);
        const detail = rule?.incentiveName || (rule ? (rule.targetName === '조재윤' ? '모델비' : (rule.targetName === '조민경' ? '컨설팅비' : '글로벌인센티브')) : '특수수당');
        const count = settlementStats.hqSummary[hqName]?.count || 0;

        reportRows.push([
          hqName,
          detail,
          count,
          { v: gross, t: 'n', z: '#,##0' },
          { v: supply, t: 'n', z: '#,##0' },
          { v: isIndiv ? -tax : tax, t: 'n', z: '#,##0' },
          { v: net, t: 'n', z: '#,##0' },
          `${setting?.bankName || '-'} ${setting?.accountNumber || '-'} (${setting?.accountHolder || '-'})`
        ]);
      });

      const wsReport = XLSX.utils.aoa_to_sheet(reportRows);
      
      // 자동 너비 조절
      const colWidths = reportRows.reduce((acc, row) => {
        row.forEach((cell, i) => {
          let str = '';
          if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
          else if (cell !== null && cell !== undefined) str = cell.toString();
          const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
          if (!acc[i] || len > acc[i]) acc[i] = len;
        });
        return acc;
      }, [] as number[]);
      wsReport['!cols'] = colWidths.map(w => ({ wch: Math.min(w + 4, 40) }));

      // --- 스타일 정의 및 적용 ---
      const headerStyle = {
        fill: { fgColor: { rgb: "2F5597" } },
        font: { color: { rgb: "FFFFFF" }, bold: true, sz: 10 },
        alignment: { vertical: "center", horizontal: "center" },
        border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
      };
      const cellStyle = { font: { sz: 9 }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
      const titleStyle = { font: { bold: true, sz: 16 }, alignment: { vertical: "center", horizontal: "center" } };

      const applySheetStyles = (ws: any) => {
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
        for (let R = range.s.r; R <= range.e.r; ++R) {
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[addr]) continue;
            ws[addr].s = { ...cellStyle };
            if (R === 0) ws[addr].s = titleStyle;
            const val = String(ws[addr].v || '');
            const isHeader = [
              '지급 기준일', '본부명', '정산유형', '건수', '총합계액', '공급가액', '부가세/원천세', '실지급액', '지급계좌',
              '사원명', '역할', '대상자명', '수당 종류', '성명', '상품명', '지급일'
            ].some(h => val === h) || (
              val.includes('1.') || val.includes('2.') || val.includes('3.') || val.includes('4.') || (val.startsWith('[') && val.endsWith(']'))
            );
            if (isHeader) ws[addr].s = headerStyle;
            if (ws[addr].t === 'n') ws[addr].s.alignment = { horizontal: 'right', vertical: 'center' };
          }
        }
      };

      applySheetStyles(wsReport);
      XLSX.utils.book_append_sheet(wb, wsReport, "통합정산보고서");

      // --- SHEET 2: 전체 상세 명세 ---
      const detailRows: any[][] = [['지급일', '본부', '지사', '사원명', '고객명', '상품명', '상태', '수수료계', '실지급액']];
      
      const sortedDetailData = [...filteredData].sort((a, b) => {
        const hqDiff = (a.hq || '').localeCompare(b.hq || '');
        if (hqDiff !== 0) return hqDiff;
        return (a.prodName || '').localeCompare(b.prodName || '');
      });

      let currentHqDetail = '';
      let currentProdDetail = '';
      let subCount = 0;
      let subComm = 0;
      let subPayable = 0;

      sortedDetailData.forEach((item, idx) => {
        const { totalCommission, finalPayable } = calculateCommissionDetails(item, statsMap);

        if (idx > 0 && (currentHqDetail !== item.hq || currentProdDetail !== item.prodName)) {
          detailRows.push(['', `[${currentHqDetail}] ${currentProdDetail} 소계`, '', '', '', '', `${subCount}건`, { v: subComm, t: 'n', z: '#,##0' }, { v: subPayable, t: 'n', z: '#,##0' }]);
          subCount = 0;
          subComm = 0;
          subPayable = 0;
        }

        currentHqDetail = item.hq || '';
        currentProdDetail = item.prodName || '';

        subCount++;
        subComm += totalCommission;
        subPayable += finalPayable;

        detailRows.push([item.payDate, item.hq, item.branch, item.empName, item.memName, item.prodName, item.status, { v: totalCommission, t: 'n', z: '#,##0' }, { v: finalPayable, t: 'n', z: '#,##0' }]);
      });

      if (subCount > 0) {
        detailRows.push(['', `[${currentHqDetail}] ${currentProdDetail} 소계`, '', '', '', '', `${subCount}건`, { v: subComm, t: 'n', z: '#,##0' }, { v: subPayable, t: 'n', z: '#,##0' }]);
      }
      const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
      const detailWidths = detailRows.reduce((acc, row) => {
        row.forEach((cell, i) => {
          let str = '';
          if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
          else if (cell !== null && cell !== undefined) str = cell.toString();
          const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
          if (!acc[i] || len > acc[i]) acc[i] = len;
        });
        return acc;
      }, [] as number[]);
      wsDetail['!cols'] = detailWidths.map(w => ({ wch: Math.min(w + 2, 40) }));
      applySheetStyles(wsDetail);

      XLSX.utils.book_append_sheet(wb, wsDetail, "전체상세명세");

      // --- SHEET 3: 유지수수료 상세 명세 ---
      const maintRows: any[][] = [['지급일', '본부', '지사', '사원명', '회원번호', '고객명', '계약번호', '상품명', '지급회차범위', '유지수수료']];
      maintenancePayouts.forEach((m) => {
        const originContract = filteredData.find(d => d.resNo === m.resNo);
        const branch = m.branch || (originContract ? originContract.branch : '-');
        const empName = m.empName || (originContract ? originContract.empName : '-');
        const payDate = m.payDate || (originContract ? originContract.payDate : payDateSample);
        const memNo = m.memNo || (originContract ? originContract.memNo : '-');
        
        maintRows.push([
          payDate,
          m.hq,
          branch,
          empName,
          memNo,
          m.customerName,
          m.resNo,
          m.productName,
          m.fromInstallment === m.toInstallment ? `${m.fromInstallment}회차` : `${m.fromInstallment}회차 ~ ${m.toInstallment}회차`,
          { v: m.amount, t: 'n', z: '#,##0' }
        ]);
      });
      
      const wsMaint = XLSX.utils.aoa_to_sheet(maintRows);
      const maintWidths = maintRows.reduce((acc, row) => {
        row.forEach((cell, i) => {
          let str = '';
          if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
          else if (cell !== null && cell !== undefined) str = cell.toString();
          const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
          if (!acc[i] || len > acc[i]) acc[i] = len;
        });
        return acc;
      }, [] as number[]);
      wsMaint['!cols'] = maintWidths.map(w => ({ wch: Math.min(w + 2, 40) }));
      applySheetStyles(wsMaint);
      
      XLSX.utils.book_append_sheet(wb, wsMaint, "유지수수료상세");

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
      const blob = new Blob([s2ab(wbout)], { type: 'application/octet-stream' });
      executeDownload(blob, `${payDateSample.substring(0, 7)}_통합정산보고서.xlsx`);
      setNotification({ message: '통합 정산 보고서(Excel) 생성 완료', type: 'success' });
    } catch (err) {
      console.error(err);
      alert('엑셀 보고서 생성 중 오류가 발생했습니다.');
    }
  };

  const exportProfessionalSettlement = async (hqName: string) => {
    try {
      const items = settlementStats.hqGroups[hqName] || [];
      const hqMaintenancePayouts = maintenancePayouts.filter(m => m.hq === hqName);
      const maintenanceSum = hqMaintenancePayouts.reduce((sum, m) => sum + m.amount, 0);
      const specialSum = (settlementStats.globalIncentivesSummary || {})[hqName] || 0;

      if (items.length === 0 && maintenanceSum === 0 && specialSum === 0) {
        alert(`${hqName}의 정산 내역이 없습니다.`);
        return;
      }

      setNotification({ message: `${hqName} 정산 데이터를 불러오는 중...`, type: 'info' });

      // 오버라이딩 정보 로딩
      let employeeData: any[] = [];
      let orgData: any[] = [];
      try {
        const [resEmp, resOrg] = await Promise.all([
          fetch('/api/sheets/sheetData?sheetName=사원정보'),
          fetch('/api/sheets/sheetData?sheetName=다이렉트조직도')
        ]);
        if (resEmp.ok) employeeData = await resEmp.json();
        if (resOrg.ok) orgData = await resOrg.json();
      } catch (e) {
        console.error('Failed to load sheets', e);
      }

      const directOrgMap = new Map<string, { teamLeader: string, branchManager: string, hqManager: string }>();
      if (orgData.length > 0) {
        const headers: string[] = orgData[0];
        const hqIdx = headers.findIndex(h => h.includes('본부장'));
        const brIdx = headers.findIndex(h => h.includes('지점장'));
        const tmIdx = headers.findIndex(h => h.includes('팀장'));
        const empIdx = headers.findIndex(h => h.includes('사원') || h.includes('영업'));
        orgData.slice(1).forEach(row => {
          const empName = row[empIdx];
          if (empName) {
            directOrgMap.set(empName, {
              hqManager: hqIdx >= 0 ? row[hqIdx] : '',
              branchManager: brIdx >= 0 ? row[brIdx] : '',
              teamLeader: tmIdx >= 0 ? row[tmIdx] : ''
            });
          }
        });
      }

      const employeeBankMap = new Map<string, { bank: string, account: string, holder: string }>();
      if (employeeData.length > 1) {
        employeeData.slice(1).forEach((row: any[]) => {
          const hq = row[2]; const branch = row[3]; const name = row[5]; 
          const holder = row[12]; const bank = row[14]; const account = row[15];
          if (hq === '다이렉트' && name) {
            const bInfo = { bank: bank || '', account: account || '', holder: holder || '' };
            employeeBankMap.set(`${branch}_${name}`, bInfo);
            employeeBankMap.set(name, bInfo);
          }
        });
      }

      const setting = hqSettings.find(h => h.hqName === hqName);
      const wb = XLSX.utils.book_new();
      const stats = new Map<string, number>();
      filteredData.forEach(item => {
        if (item.status.includes('취소')) return;
        const key = `${item.hq}|${item.prodName}`;
        stats.set(key, (stats.get(key) || 0) + 1);
      });

      let generalSum = 0;
      let salesSum = 0;
      items.forEach(item => {
        const { totalCommission, salesComm } = calculateCommissionDetails(item, stats);
        generalSum += totalCommission;
        salesSum += salesComm;
      });

      const promoSum = Math.max(0, generalSum - salesSum);
      const totalSum = generalSum + maintenanceSum + specialSum;

      let payDateDisplay = payDateFilter || '';
      if (!payDateDisplay && items.length > 0) {
        const { displayPayDate } = calculateCommissionDetails(items[0], stats);
        payDateDisplay = displayPayDate;
      } else if (!payDateDisplay) {
        payDateDisplay = new Date().toISOString().substring(0, 10).replace(/-/g, '.');
      }

      const rows: any[][] = [];
      const targetMonth = payDateDisplay.substring(0, 7);
      const [y, m] = targetMonth.split('.').length > 1 ? targetMonth.split('.') : targetMonth.split('-');

      rows[0] = [`${y}년 ${parseInt(m)}월 [${hqName}] 수수료 정산 내역서`];
      rows[1] = [];

      // --- 오버라이딩 대상 여부 확인 및 요약 행 구성 ---
      rows[2] = ['지급일자', '성명', '역할', '은행', '계좌번호', '예금주', '지급액(실지급)'];
      
      // 사원별 집계 (해당 본부만)
      const empMap = new Map<string, any>();
      items.forEach(item => {
        if (item.status.includes('취소')) return;
        const { totalCommission, productRule } = calculateCommissionDetails(item, stats);
        const isProductOvApplied = productRule ? productRule.applyOverriding === true : false;
        const ov = (isProductOvApplied && productRule?.overriding) 
          ? productRule.overriding 
          : { salesperson: totalCommission, teamLeader: 0, branchManager: 0, hqManager: 0 };
          
        let shares = {
          '영업사원': ov.salesperson,
          '팀장': ov.teamLeader,
          '지점장': ov.branchManager,
          '본부장': ov.hqManager
        };
          
          const isIndiv = setting?.settlementType?.includes('개인') || hqName === '글로씨';
          const calcNet = (amt: number) => isIndiv ? amt - Math.floor(amt * 0.033) : amt;
          const org = directOrgMap.get(item.empName) || { teamLeader: '', branchManager: '', hqManager: '' };
          
          const add = (name: string, role: string, amount: number) => {
            if (amount <= 0 || !name) return;
            const netAmount = calcNet(amount);
            const key = `${name}|${role}`;
            if (!empMap.has(key)) empMap.set(key, { name, role, total: 0 });
            empMap.get(key).total += netAmount;
          };

          add(item.empName, '영업사원', shares['영업사원']);
          add(org.teamLeader, '팀장', shares['팀장']);
          add(org.branchManager, '지점장', shares['지점장']);
          add(org.hqManager, '본부장', shares['본부장']);
        });

        // 유지수수료 대상자도 해당 사원(영업사원)에게 가산
        hqMaintenancePayouts.forEach(payout => {
          const originContract = filteredData.find(d => d.resNo === payout.resNo);
          if (!originContract) return;

          const isIndiv = setting?.settlementType?.includes('개인') || hqName === '글로씨';
          const calcNet = (amt: number) => isIndiv ? amt - Math.floor(amt * 0.033) : amt;
          const netAmount = calcNet(payout.amount);
          
          const role = '영업사원';
          const key = `${originContract.empName}|${role}`;

          if (!empMap.has(key)) {
            empMap.set(key, { name: originContract.empName, role, total: 0 });
          }
          empMap.get(key).total += netAmount;
        });

        // 특수수당 대상자도 해당 수급자에게 가산
        if (specialSum > 0) {
          const isIndiv = setting?.settlementType?.includes('개인') || hqName === '글로씨';
          const calcNet = (amt: number) => isIndiv ? amt - Math.floor(amt * 0.033) : amt;
          const netAmount = calcNet(specialSum);
          
          const role = '영업사원';
          const key = `${hqName}|${role}`;

          if (!empMap.has(key)) {
            empMap.set(key, { name: hqName, role, total: 0 });
          }
          empMap.get(key).total += netAmount;
        }

        const roleWeight = (r: string) => ({ '영업사원': 1, '팀장': 2, '지점장': 3, '본부장': 4 }[r] || 5);
        const sorted = Array.from(empMap.values()).sort((a, b) => roleWeight(a.role) - roleWeight(b.role) || a.name.localeCompare(b.name));
        
        const isIndiv = setting?.settlementType?.includes('개인') || hqName === '글로씨';

        if (hqName !== '다이렉트' && !isIndiv) {
          // 사업자일 경우 단 하나의 합산 행으로 표시
          const totalAmount = sorted.reduce((sum, p) => sum + p.total, 0);
          const b = setting?.bankName || '-';
          const a = setting?.accountNumber || '-';
          const h = setting?.accountHolder || '-';
          rows.push([payDateDisplay, h, '본부', b, a, h, { v: totalAmount, t: 'n', z: '#,##0' }]);
        } else {
          // 다이렉트이거나 개인/프리랜서일 경우 영업자별로 나눠서 표시
          sorted.forEach(p => {
            let b = '-', a = '-', h = '-';
            if (hqName === '다이렉트') {
              const bInfo = employeeBankMap.get(p.name);
              if (bInfo) { b = bInfo.bank; a = bInfo.account; h = bInfo.holder; }
            } else {
              b = setting?.bankName || '-'; a = setting?.accountNumber || '-'; h = setting?.accountHolder || '-';
            }
            rows.push([payDateDisplay, p.name, p.role, b, a, h, { v: p.total, t: 'n', z: '#,##0' }]);
          });
        }
      rows.push([]);

      // 세금 요약 섹션
      if (setting?.settlementType === '개인') {
        rows.push(['원천징수 영수 요약 (3.3% 공제)']);
        rows.push(['구분', '정산금액', '원천세(3.3%)', '실지급액']);
        if (salesSum > 0) {
          rows.push(['일반 수수료(판매)', { v: salesSum, t: 'n', z: '#,##0' }, { v: Math.floor(salesSum * 0.033), t: 'n', z: '#,##0' }, { v: salesSum - Math.floor(salesSum * 0.033), t: 'n', z: '#,##0' }]);
        }
        if (promoSum > 0) {
          rows.push(['판매 촉진비', { v: promoSum, t: 'n', z: '#,##0' }, { v: Math.floor(promoSum * 0.033), t: 'n', z: '#,##0' }, { v: promoSum - Math.floor(promoSum * 0.033), t: 'n', z: '#,##0' }]);
        }
        if (maintenanceSum > 0) {
          rows.push(['유지 수수료', { v: maintenanceSum, t: 'n', z: '#,##0' }, { v: Math.floor(maintenanceSum * 0.033), t: 'n', z: '#,##0' }, { v: maintenanceSum - Math.floor(maintenanceSum * 0.033), t: 'n', z: '#,##0' }]);
        }
        if (specialSum > 0) {
          rows.push(['특수 수당', { v: specialSum, t: 'n', z: '#,##0' }, { v: Math.floor(specialSum * 0.033), t: 'n', z: '#,##0' }, { v: specialSum - Math.floor(specialSum * 0.033), t: 'n', z: '#,##0' }]);
        }
        rows.push(['합계', { v: totalSum, t: 'n', z: '#,##0' }, { v: Math.floor(totalSum * 0.033), t: 'n', z: '#,##0' }, { v: totalSum - Math.floor(totalSum * 0.033), t: 'n', z: '#,##0' }]);
      } else {
        rows.push(['세금계산서 발행 요약 (부가세 10% 포함)']);
        rows.push(['구분', '공급가액', '부가세(10%)', '합계금액(실지급액)']);
        if (salesSum > 0) {
          rows.push(['일반 수수료(판매)', { v: Math.round(salesSum / 1.1), t: 'n', z: '#,##0' }, { v: salesSum - Math.round(salesSum / 1.1), t: 'n', z: '#,##0' }, { v: salesSum, t: 'n', z: '#,##0' }]);
        }
        if (promoSum > 0) {
          rows.push(['판매 촉진비', { v: Math.round(promoSum / 1.1), t: 'n', z: '#,##0' }, { v: promoSum - Math.round(promoSum / 1.1), t: 'n', z: '#,##0' }, { v: promoSum, t: 'n', z: '#,##0' }]);
        }
        if (maintenanceSum > 0) {
          rows.push(['유지 수수료', { v: Math.round(maintenanceSum / 1.1), t: 'n', z: '#,##0' }, { v: maintenanceSum - Math.round(maintenanceSum / 1.1), t: 'n', z: '#,##0' }, { v: maintenanceSum, t: 'n', z: '#,##0' }]);
        }
        if (specialSum > 0) {
          rows.push(['특수 수당', { v: Math.round(specialSum / 1.1), t: 'n', z: '#,##0' }, { v: specialSum - Math.round(specialSum / 1.1), t: 'n', z: '#,##0' }, { v: specialSum, t: 'n', z: '#,##0' }]);
        }
        rows.push(['합계', { v: Math.round(totalSum / 1.1), t: 'n', z: '#,##0' }, { v: totalSum - Math.round(totalSum / 1.1), t: 'n', z: '#,##0' }, { v: totalSum, t: 'n', z: '#,##0' }]);
      }
      rows.push([]);
      rows.push(['렌탈사', '상품명', '계약 건', '판매수수료', '판매촉진비', '수수료계']);
      const productSummary: Record<string, { count: number, sales: number, promo: number, total: number }> = {};
      items.forEach(item => {
        const { totalCommission, salesComm, promoFee } = calculateCommissionDetails(item, stats);
        if (!productSummary[item.prodName]) productSummary[item.prodName] = { count: 0, sales: 0, promo: 0, total: 0 };
        productSummary[item.prodName].count += 1;
        productSummary[item.prodName].sales += salesComm;
        productSummary[item.prodName].promo += promoFee;
        productSummary[item.prodName].total += totalCommission;
      });

      Object.entries(productSummary).forEach(([pName, prStat]) => {
        rows.push([
          '-',
          pName,
          prStat.count,
          { v: Math.floor(prStat.sales), t: 'n', z: '#,##0' },
          { v: Math.floor(prStat.promo), t: 'n', z: '#,##0' },
          { v: Math.floor(prStat.total), t: 'n', z: '#,##0' }
        ]);
      });

      if (maintenanceSum > 0) {
        rows.push([
          '-',
          '유지수수료 합계',
          hqMaintenancePayouts.length,
          { v: 0, t: 'n', z: '#,##0' },
          { v: maintenanceSum, t: 'n', z: '#,##0' },
          { v: maintenanceSum, t: 'n', z: '#,##0' }
        ]);
      }

      if (specialSum > 0) {
        rows.push([
          '-',
          '특수수당 합계',
          settlementStats.hqSummary[hqName]?.count || 0,
          { v: 0, t: 'n', z: '#,##0' },
          { v: specialSum, t: 'n', z: '#,##0' },
          { v: specialSum, t: 'n', z: '#,##0' }
        ]);
      }

      const totalItemsCount = items.length + 
        (maintenanceSum > 0 ? hqMaintenancePayouts.length : 0) + 
        (specialSum > 0 ? (settlementStats.hqSummary[hqName]?.count || 0) : 0);

      rows.push([
        '계',
        '',
        totalItemsCount,
        { v: Math.floor(salesSum), t: 'n', z: '#,##0' },
        { v: Math.floor(promoSum + maintenanceSum + specialSum), t: 'n', z: '#,##0' },
        { v: Math.floor(totalSum), t: 'n', z: '#,##0' }
      ]);
      rows.push([]);

      rows.push(['[일반수수료 상세 내역]']);
      rows.push(['본부명', '지사명', '계약일자', '사원명(AP)', '고객명', '렌탈계약번호', '배송일자', '정산상품명', '정산기준일', '공급수수료(지급총계)']);

      items.forEach(item => {
        const { totalCommission, displayPayDate } = calculateCommissionDetails(item, stats);
        rows.push([
          item.hq,
          item.branch,
          item.contractDate,
          item.empName,
          item.memName,
          item.rentalNo,
          item.deliveryDate,
          item.prodName,
          displayPayDate,
          { v: Math.floor(totalCommission), t: 'n', z: '#,##0' }
        ]);
      });

      if (items.length > 0) {
        rows.push([
          '일반수수료 소계',
          '',
          '',
          '',
          '',
          `${items.length}건`,
          '',
          '',
          '',
          { v: Math.floor(generalSum), t: 'n', z: '#,##0' }
        ]);
      }
      if (maintenanceSum > 0) {
        rows.push([
          '유지수수료 합계',
          '',
          '',
          '',
          '',
          `${hqMaintenancePayouts.length}건`,
          '',
          '',
          '',
          { v: maintenanceSum, t: 'n', z: '#,##0' }
        ]);
      }
      if (specialSum > 0) {
        rows.push([
          '특수수당 합계',
          '',
          '',
          '',
          '',
          `${settlementStats.hqSummary[hqName]?.count || 0}건`,
          '',
          '',
          '',
          { v: specialSum, t: 'n', z: '#,##0' }
        ]);
      }

      rows.push([
        '최종 실지급액 합계',
        '',
        '',
        '',
        '',
        `${totalItemsCount}건`,
        '',
        '',
        '',
        { v: Math.floor(totalSum), t: 'n', z: '#,##0' }
      ]);

      if (maintenanceSum > 0) {
        rows.push([]);
        rows.push(['[유지수수료 상세 내역]']);
        rows.push(['본부명', '지사명', '사원명(AP)', '고객명', '렌탈계약번호', '상품명', '지급회차범위', '금액']);
        
        hqMaintenancePayouts.forEach(m => {
          const originContract = filteredData.find(d => d.resNo === m.resNo);
          const branch = m.branch || (originContract ? originContract.branch : '-');
          const empName = m.empName || (originContract ? originContract.empName : '-');
          
          rows.push([
            m.hq,
            branch,
            empName,
            m.customerName,
            m.resNo,
            m.productName,
            m.fromInstallment === m.toInstallment ? `${m.fromInstallment}회차` : `${m.fromInstallment}회차 ~ ${m.toInstallment}회차`,
            { v: m.amount, t: 'n', z: '#,##0' }
          ]);
        });
        
        rows.push([
          '합계',
          '',
          '',
          '',
          '',
          `${hqMaintenancePayouts.length}건`,
          '',
          { v: maintenanceSum, t: 'n', z: '#,##0' }
        ]);
      }

      if (specialSum > 0) {
        rows.push([]);
        rows.push(['[특수수당 상세 내역]']);
        rows.push(['대상자명', '수당 종류', '지급 기준 구좌수', '수당 단가', '최종 수당 금액']);
        const rule = globalIncentiveRules.find(r => r.targetName === hqName);
        const detail = rule?.incentiveName || (rule ? (rule.targetName === '조재윤' ? '모델비' : (rule.targetName === '조민경' ? '컨설팅비' : '글로벌인센티브')) : '특수수당');
        const matchedCount = settlementStats.hqSummary[hqName]?.count || 0;
        const unitPrice = rule ? rule.commissionPerUnit : 0;
        rows.push([
          hqName,
          detail,
          matchedCount,
          { v: unitPrice, t: 'n', z: '#,##0' },
          { v: specialSum, t: 'n', z: '#,##0' }
        ]);
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      
      // 자동 너비 조절
      const colWidths = rows.reduce((acc, row) => {
        row.forEach((cell, i) => {
          let str = '';
          if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
          else if (cell !== null && cell !== undefined) str = cell.toString();
          const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
          if (!acc[i] || len > acc[i]) acc[i] = len;
        });
        return acc;
      }, [] as number[]);
      ws['!cols'] = colWidths.map(w => ({ wch: Math.min(w + 4, 40) }));

      const headerStyle = {
        fill: { fgColor: { rgb: "2F5597" } },
        font: { color: { rgb: "FFFFFF" }, bold: true, sz: 10 },
        alignment: { vertical: "center", horizontal: "center" },
        border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
      };
      const cellStyle = { font: { sz: 9 }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
      const numberStyle = { ...cellStyle, alignment: { vertical: "center", horizontal: "right" }, numFmt: "#,##0" };
      const totalStyle = { fill: { fgColor: { rgb: "FFF2CC" } }, font: { bold: true, sz: 10 }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
      const titleStyle = { font: { bold: true, sz: 16 }, alignment: { vertical: "center", horizontal: "center" } };

      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[addr]) continue;
          ws[addr].s = { ...cellStyle };
          if (R === 0) ws[addr].s = titleStyle;
          const val = String(ws[addr].v || '');
          const isHeader = ['지급일자', '성명', '역할', '지사명', '은행', '원천징수', '세금계산서', '렌탈사', '상품명', '본부명', '[상세 내역]'].some(h => val.includes(h));
          if (isHeader) ws[addr].s = headerStyle;
          if (ws[addr].t === 'n') ws[addr].s = numberStyle;
          if (val === '계' || val === '합계' || val.includes('건')) ws[addr].s = totalStyle;
        }
      }

      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];

      XLSX.utils.book_append_sheet(wb, ws, "정산내역");

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
      const blob = new Blob([s2ab(wbout)], { type: 'application/octet-stream' });
      executeDownload(blob, `${hqName}_수수료정산서_${payDateDisplay.replace(/[\./]/g, '')}.xlsx`);

      setNotification({ message: `${hqName} 정산보고서 생성 완료`, type: 'success' });
    } catch (err) {
      console.error(err);
      alert('보고서 생성 중 오류가 발생했습니다.');
    }
  };

  const exportMaintenanceStatusExcel = (eligibleItems: any[], overdueItems: any[]) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const workbook = XLSX.utils.book_new();

      // 1. 유지수수료 지급 대상 시트 작성
      let totalEligibleSum = 0;
      const eligibleRows = eligibleItems.map((x, idx) => {
        totalEligibleSum += x.totalCommission;
        const intervalStr = x.payCount > 1 ? `${x.hcInterval}회차(소급 ${x.payCount}개월)` : `${x.hcInterval}회차`;
        return [
          idx + 1, x.item.hq, x.item.branch, x.item.empName, x.item.memNo || '-', x.item.memName, x.item.contractDate, x.item.prodName, intervalStr,
          { v: x.totalCommission, t: 'n', z: '#,##0' }
        ];
      });
      eligibleRows.push(['합계', '', '', '', '', '', '', '', '', { v: totalEligibleSum, t: 'n', z: '#,##0' }]);

      const eligibleWorksheet = XLSX.utils.aoa_to_sheet([
        ['[ 헬스케어80 유지수수료 지급 대상 현황 ]'],
        [`수수료 지급일: ${payDateFilter || today} | 보고서 생성일: ${today}`],
        [],
        ['순번', '본부명', '지사명', '사원명', '회원번호', '고객명', '계약일자', '상품명', '회차', '유지수수료'],
        ...eligibleRows
      ]);

      // 2. 유지수수료 지급 보류(연체) 시트 작성
      let totalOverdueSum = 0;
      const overdueRows = overdueItems.map((x, idx) => {
        totalOverdueSum += x.pendingCommission;
        return [
          idx + 1, x.item.hq, x.item.branch, x.item.empName, `${x.overdueCount}회`, x.item.memNo || '-', x.item.memName, x.item.contractDate, x.item.prodName, `${x.hcInterval}회차`,
          { v: x.pendingCommission, t: 'n', z: '#,##0' }
        ];
      });
      overdueRows.push(['합계', '', '', '', '', '', '', '', '', '', { v: totalOverdueSum, t: 'n', z: '#,##0' }]);

      const overdueWorksheet = XLSX.utils.aoa_to_sheet([
        ['[ 헬스케어80 유지수수료 지급 보류(연체) 현황 ]'],
        [`수수료 지급일: ${payDateFilter || today} | 보고서 생성일: ${today}`],
        [],
        ['순번', '본부명', '지사명', '사원명', '연체횟수', '회원번호', '고객명', '계약일자', '상품명', '회차', '보류 수수료'],
        ...overdueRows
      ]);

      const applyStyles = (worksheet: any, colCount: number) => {
        const headerStyle = { fill: { fgColor: { rgb: "E7E6E6" } }, font: { bold: true, size: 10 }, alignment: { horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
        const bodyStyle = { font: { size: 10 }, alignment: { horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        for (let r = range.s.r; r <= range.e.r; r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cellAddress = XLSX.utils.encode_cell({ r, c });
            if (!worksheet[cellAddress]) continue;
            if (r > 2) worksheet[cellAddress].s = r === 3 ? headerStyle : bodyStyle;
          }
        }
        worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } }];
        worksheet['!cols'] = Array(colCount).fill({ wch: 13 });
      };

      applyStyles(eligibleWorksheet, 10);
      applyStyles(overdueWorksheet, 11);

      XLSX.utils.book_append_sheet(workbook, eligibleWorksheet, "유지수수료 지급대상");
      XLSX.utils.book_append_sheet(workbook, overdueWorksheet, "유지수수료 지급보류");

      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const cleanPayDate = (payDateFilter || today).replace(/[.-]/g, '');
      const executeDownload = (blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      };
      executeDownload(blob, `유지수수료현황_${cleanPayDate}_${today}.xlsx`);
    } catch (err) {
      console.error(err);
      alert('엑셀 추출 중 오류가 발생했습니다.');
    }
  };

  const exportHealthcareExcel = (targetValue: string | number, type: 'date' | 'month' = 'date', targetYear?: number) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const productCodeMap: Record<string, string> = {
        '더좋은하이브리드698': 'A070',
        '더좋은라이즈498': 'A071',
        '더좋은하이브리드': 'A070',
        '더좋은라이즈': 'A071',
        '하이브리드698': 'A070',
        '라이즈498': 'A071'
      };

      const parseResNo = (resNo: string) => {
        const clean = resNo.replace(/-/g, '');
        if (clean.length < 7) return { birth: '', gender: '' };
        let year = clean.substring(0, 2);
        const monthDay = clean.substring(2, 6);
        const genderDigit = clean.charAt(6);
        let prefix = '19';
        let gender = '1';
        if (['3', '4', '7', '8'].includes(genderDigit)) prefix = '20';
        if (['2', '4', '6', '8'].includes(genderDigit)) gender = '2';
        return { birth: `${prefix}${year}${monthDay}`, gender };
      };

      const filtered = data.filter(item => {
        const hcRegDate = String(item.raw[18] || '');
        if (!hcRegDate || hcRegDate.trim() === '') return false;

        const normalized = hcRegDate.replace(/[./]/g, '-');
        const parts = normalized.split('-');
        if (parts.length < 2) return false;

        const year = parts[0].length === 2 ? `20${parts[0]}` : parts[0];
        const month = parseInt(parts[1]);
        const day = parts[2] ? parseInt(parts[2]) : null;

        if (type === 'date') {
          const targetDateNormalized = String(targetValue).replace(/[./]/g, '-');
          const [tY, tM, tD] = targetDateNormalized.split('-');
          const fullTY = tY.length === 2 ? `20${tY}` : tY;
          return parseInt(year) === parseInt(fullTY) && month === parseInt(tM) && day === parseInt(tD);
        } else {
          return parseInt(year) === (targetYear || 2026) && month === (targetValue as number);
        }
      });

      if (filtered.length === 0) {
        alert('추출할 헬스케어 대상자가 없습니다.');
        return;
      }

      const rows = filtered.map((item, idx) => {
        const insuredName = item.raw[15] ? String(item.raw[15]) : '';
        const insuredResNo = item.raw[16] ? String(item.raw[16]) : '';
        const insuredPhone = item.raw[17] ? String(item.raw[17]) : '';
        const serviceStartDate = item.raw[18] ? String(item.raw[18]).replace(/[./]/g, '-') : '';

        const { birth, gender } = parseResNo(insuredResNo);
        const matchedProd = Object.keys(productCodeMap).find(name => item.prodName.includes(name));
        const prodCode = productCodeMap[matchedProd || ''] || 'A070';
        const displayProdName = matchedProd || item.prodName;

        return [
          idx + 1, item.memNo, prodCode, displayProdName, insuredName,
          birth, gender, insuredPhone, '', '', serviceStartDate, '01'
        ];
      });

      const headers = ['순번', '고객가입코드', '가입상품코드', '가입상품명', '피보험자명', '생년월일(YYYYMMDD)', '성별(남:1, 여:2)', '휴대폰번호', '계약시작일', '계약종료일', '서비스시작일', '상태코드(회원:01, 탈퇴:02)'];
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      const headerStyle = {
        fill: { fgColor: { rgb: "E7E6E6" } },
        font: { bold: true, size: 10, name: '맑은 고딕' },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin" }, bottom: { style: "thin" },
          left: { style: "thin" }, right: { style: "thin" }
        }
      };

      const bodyStyle = {
        font: { size: 10, name: '맑은 고딕' },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin" }, bottom: { style: "thin" },
          left: { style: "thin" }, right: { style: "thin" }
        }
      };

      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellAddress = XLSX.utils.encode_cell({ r, c });
          if (!worksheet[cellAddress]) continue;
          worksheet[cellAddress].s = r === 0 ? headerStyle : bodyStyle;
        }
      }

      worksheet['!cols'] = [
        { wch: 6 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 12 },
        { wch: 15 }, { wch: 6 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Healthcare');

      const fileNameSuffix = type === 'date' ? targetValue : `${targetYear}_${String(targetValue).padStart(2, '0')}`;
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });
      const blob = new Blob([s2ab(wbout)], { type: 'application/octet-stream' });
      executeDownload(blob, `헬스케어_명단_${fileNameSuffix}_${today}.xlsx`);

      setNotification({ message: '헬스케어 명단 추출 완료', type: 'success' });
    } catch (err) {
      console.error(err);
      alert('엑셀 추출 중 오류가 발생했습니다.');
    }
  };

  const uniqueProducts = React.useMemo(() => {
    const normalize = (s: string) => s.replace(/[\s()]/g, '').toLowerCase();
    const allProds = Array.from(new Set<string>(data.map(item => String(item.prodName || '')).filter(Boolean)));
    const filteredProds = allProds.filter((p: string) => {
      const n = normalize(p);
      return !n.includes('통신결합240') && !n.includes('결합360') && !n.includes('에이모바일');
    });
    return ['전체', ...filteredProds];
  }, [data]);

  const uniqueHqs = React.useMemo(() =>
    ['전체', ...Array.from(new Set(data.map(item => item.hq).filter(Boolean)))],
    [data]
  );

  const uniqueBranches = React.useMemo(() => {
    const filteredByHq = hqFilter === '전체'
      ? data
      : data.filter(item => item.hq === hqFilter);
    return ['전체', ...Array.from(new Set(filteredByHq.map(item => item.branch).filter(Boolean)))];
  }, [data, hqFilter]);

  const uniqueDeliveryStatus = React.useMemo(() =>
    Array.from(new Set(data.map(item => item.deliveryStatus).filter(Boolean))),
    [data]
  );

  const uniqueHcRegDates = React.useMemo(() =>
    Array.from(new Set<string>(data.map(item => String(item.hcRegDate || '')).filter(d => d && d.length >= 8))).sort((a: any, b: any) => String(a).localeCompare(String(b))).reverse(),
    [data]
  );

  const uniqueHcMonths = React.useMemo(() =>
    Array.from(new Set<string>(data.map(item => String(item.hcRegDate || '').substring(0, 7)).filter(d => d && d.length >= 7))).sort((a: string, b: string) => a.localeCompare(b)).reverse(),
    [data]
  );

  const uniquePayDates = React.useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0].replace(/-/g, '.');

    // 시트 데이터의 지급일 중 오늘 이후인 것들
    const existingDates = data
      .map(item => item.payDate)
      .filter(d => d && d.trim() !== '' && d >= todayStr);

    return ['전체', ...Array.from(new Set(existingDates)).sort((a: any, b: any) => String(a).localeCompare(String(b)))];
  }, [data]);

  const resetFilters = () => {
    setSearchTerm('');
    setProductFilter('전체');
    setHqFilter('전체');
    setBranchFilter('전체');
    setDeliveryFilter('전체');
    setPayDateFilter('');
    setPaymentStatusFilter('전체');
    setCurrentPage(1);
  };
  // ================= 수동 수수료 정산 기능 =================
  const loadManualData = () => {
    if (!manualDate || !manualHq) return setNotification({ message: '지급일과 본부명을 모두 선택해주세요.', type: 'error' });
    
    const filtered = data.filter(d => d.payDate === manualDate && d.hq === manualHq && !d.status.includes('취소'));
    
    const prodMap = new Map<string, { count: number, salesFee: number, promoFee: number }>();
    filtered.forEach(item => {
      const hq = hqSettings.find(s => s.hqName === manualHq);
      const setting = hq?.productRules.find(p => p.productName === item.prodName);
      const salesFee = setting ? parseInt(setting.salesCommission.replace(/,/g, '') || '0', 10) : 0;
      const promoFee = setting ? parseInt(setting.promoCommission.replace(/,/g, '') || '0', 10) : 0;
      
      if (!prodMap.has(item.prodName)) {
        prodMap.set(item.prodName, { count: 0, salesFee, promoFee });
      }
      prodMap.get(item.prodName)!.count += 1;
    });

    const newProducts: ManualProduct[] = Array.from(prodMap.entries()).map(([pName, pData], idx) => ({
      id: Date.now().toString() + idx,
      productName: pName,
      salesFee: pData.salesFee,
      promoFee: pData.promoFee,
      count: pData.count
    }));

    setManualProducts(newProducts);

    const hqSet = hqSettings.find(s => s.hqName === manualHq);
    if (hqSet) {
      setManualAccount(`${hqSet.bankName} ${hqSet.accountNumber} ${hqSet.accountHolder}`);
      setManualBasis(hqSet.settlementType.includes('개인') ? '개인' : '사업자');
    }
  };

  const exportManualExcel = () => {
    if (manualProducts.length === 0) return setNotification({ message: '출력할 데이터가 없습니다.', type: 'error' });
    
    let totalComm = 0;
    let totalCount = 0;
    manualProducts.forEach(p => {
      totalComm += (p.salesFee + p.promoFee) * p.count;
      totalCount += p.count;
    });

    const isIndiv = manualBasis === '개인';
    const supply = isIndiv ? totalComm : Math.round(totalComm / 1.1);
    const taxAmt = isIndiv ? Math.floor(totalComm * 0.033) : (totalComm - supply);
    const totalFinal = totalComm - (isIndiv ? taxAmt : 0);
    const taxDisplay = isIndiv ? -taxAmt : taxAmt;

    const today = new Date().toISOString().split('T')[0];

    const wsData: any[][] = [
      ['[ 수동 정산 종합 보고서 ]'],
      [`보고일자: ${today} | 지급기준: ${manualDate}`],
      [],
      ['1. 본부별 정산 현황'],
      ['본부명', '유형', '계약건수', '공급가액(정산액)', '부가세/원천세', '최종 실지급액', '지급계좌'],
      [
        manualHq, 
        isIndiv ? '개인' : '법인', 
        totalCount, 
        { v: supply, t: 'n', z: '#,##0' }, 
        { v: taxDisplay, t: 'n', z: '#,##0' }, 
        { v: totalFinal, t: 'n', z: '#,##0' }, 
        manualAccount
      ],
      [],
      ['2. 본부별 실적 상세'],
      ['본부명', '상품명', '건별 실지급액', '구좌', '최종 합계(실지급)']
    ];

    manualProducts.forEach(p => {
      const finalPerItem = p.salesFee + p.promoFee;
      const finalSum = finalPerItem * p.count;
      const netUp = isIndiv ? finalPerItem - Math.floor(finalPerItem * 0.033) : finalPerItem;
      const netSum = isIndiv ? finalSum - Math.floor(finalSum * 0.033) : finalSum;
      
      wsData.push([
        manualHq, 
        p.productName, 
        { v: netUp, t: 'n', z: '#,##0' }, 
        p.count, 
        { v: netSum, t: 'n', z: '#,##0' }
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const colWidths = wsData.reduce((acc, row) => {
      row.forEach((cell, i) => {
        let str = '';
        if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
        else if (cell !== null && cell !== undefined) str = cell.toString();
        const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
        if (!acc[i] || len > acc[i]) acc[i] = len;
      });
      return acc;
    }, [] as number[]);
    ws['!cols'] = colWidths.map(w => ({ wch: Math.min(w + 4, 40) }));

    const headerStyle = {
      fill: { fgColor: { rgb: "2F5597" } },
      font: { color: { rgb: "FFFFFF" }, bold: true, sz: 10 },
      alignment: { vertical: "center", horizontal: "center" },
      border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
    };
    const cellStyle = { font: { sz: 9 }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
    const titleStyle = { font: { bold: true, sz: 16 }, alignment: { vertical: "center", horizontal: "center" } };

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = { ...cellStyle };
        if (R === 0) ws[addr].s = titleStyle;
        const val = String(ws[addr].v || '');
        const isHeader = ['본부명', '유형', '계약건수', '공급가액(정산액)', '부가세/원천세', '최종 실지급액', '지급계좌', '상품명', '건별 실지급액', '구좌', '최종 합계(실지급)'].some(h => val === h) || val.includes('1.') || val.includes('2.') || (val.startsWith('[') && val.endsWith(']'));
        if (isHeader) ws[addr].s = headerStyle;
        if (ws[addr].t === 'n') ws[addr].s.alignment = { horizontal: 'right', vertical: 'center' };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "수동정산보고서");
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
    const blob = new Blob([s2ab(wbout)], { type: 'application/octet-stream' });
    executeDownload(blob, `${manualDate}_${manualHq}_수동정산.xlsx`);
  };

  const saveManualToDB = async () => {
    if (manualProducts.length === 0) return setNotification({ message: '저장할 데이터가 없습니다.', type: 'error' });
    try {
      setIsUpdating(true);
      const rows = manualProducts.map(p => {
        const rowTotal = (p.salesFee + p.promoFee) * p.count;
        const rowTax = manualBasis === '개인' ? Math.floor(rowTotal * 0.033) : 0;
        const rowFinal = rowTotal - rowTax;
        return [manualDate, manualHq, manualAccount, manualBasis, p.productName, p.salesFee, p.promoFee, p.count, rowFinal];
      });

      const response = await fetch('/api/sheets/manual-settlement/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows })
      });
      const result = await response.json();
      if (result.success) {
        setNotification({ message: '수동 정산 내역이 성공적으로 저장되었습니다.', type: 'success' });
        setIsManualSettlementModalOpen(false);
      } else {
        setNotification({ message: '저장 실패: ' + result.error, type: 'error' });
      }
    } catch (err) {
      setNotification({ message: '서버 저장 중 오류가 발생했습니다.', type: 'error' });
    } finally {
      setIsUpdating(false);
    }
  };
  // =======================================================
  return (
    <div className="flex flex-col h-screen bg-[#f1f5f9] font-sans selection:bg-blue-100 overflow-hidden relative">
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 20 }}
            exit={{ opacity: 0, y: -100 }}
            className="absolute top-0 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
          >
            <div className="bg-white border-l-4 border-emerald-500 shadow-2xl rounded-lg px-6 py-4 flex items-center gap-4 pointer-events-auto">
              <div className="bg-emerald-100 p-2 rounded-full">
                <CheckCircle size={20} className="text-emerald-600" />
              </div>
              <p className="text-sm font-bold text-slate-800 pr-4">{notification.message}</p>
              <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-14 bg-[#0f172a] text-white px-6 flex justify-between items-center shadow-md z-50 shrink-0"
      >
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/10"
          >
            <Save size={18} className="text-white" strokeWidth={2.5} />
          </motion.div>
          <h1 className="text-lg font-bold tracking-tight">
            The Better Life ERP
            <span className="text-[11px] font-normal text-slate-400 ml-2">v2.1.0</span>
          </h1>
        </div>

        <div className="hidden md:flex items-center gap-5 text-[12px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 ${loading ? 'bg-orange-400 animate-pulse' : 'bg-emerald-500'} rounded-full shadow-[0_0_6px_rgba(16,185,129,0.4)]`} />
            <span className="font-medium text-slate-200">{loading ? 'Processing...' : 'DB 연결됨'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>마지막 업데이트:</span>
            <span className="text-slate-200 font-mono tracking-tight">{lastUpdate}</span>
          </div>
        </div>
      </motion.header>

      <div className="flex flex-1 overflow-hidden">
        <motion.aside
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="w-[240px] bg-white border-r border-slate-200 p-5 flex flex-col gap-6 shadow-sm z-40 shrink-0 overflow-y-auto"
        >
          <section>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Google Integration</p>
            <div className="grid gap-2">
              {!isAuthenticated ? (
                <div className="space-y-2">
                  <motion.button
                    onClick={handleConnect}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="w-full flex items-center justify-center gap-2.5 bg-emerald-600 text-white py-2.5 rounded-md shadow-sm text-[13px] font-medium transition-colors hover:bg-emerald-700"
                  >
                    <CheckCircle size={16} /> 구글 시트 연동하기
                  </motion.button>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/auth/debug');
                        const debug = await res.json();
                        if (navigator.clipboard) {
                          await navigator.clipboard.writeText(debug.expectedRedirectUri);
                          alert(`[구글 연동 진단 및 가이드]\n\n1. 리디렉션 URI (클립보드에 복사됨):\n${debug.expectedRedirectUri}\n\n2. 조치 사항:\n- Google Cloud Console > 사용자 인증 정보 > OAuth 클라이언트 ID 편집\n- '승인된 리디렉션 URI' 항목에 위 주소를 추가하세요.\n- 클라이언트 ID 유형이 '웹 애플리케이션'인지 반드시 확인하세요.\n\n[진단 결과]\n- ID 상태: ${debug.clientIdStatus}\n- Secret 상태: ${debug.clientSecretStatus}\n- 형식 확인: ${debug.clientIdFormat}`);
                        } else {
                          alert(`[리디렉션 URI]\n${debug.expectedRedirectUri}\n\n위 주소를 구글 콘솔에 등록하세요.`);
                        }
                      } catch (e) {
                        alert('연동 진단 정보를 불러올 수 없습니다.');
                      }
                    }}
                    className="w-full text-center text-[10px] text-slate-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-1 py-1"
                  >
                    <Settings size={10} /> 연동 해결 방법 확인
                  </button>

                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">Cloud Sync</p>
                    <button
                      onClick={() => {
                        if (!isAuthenticated) return alert('먼저 [구글 시트 연동하기]를 진행해 주세요.');
                        saveSettingsToCloud();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-[11px] font-bold hover:bg-blue-600 hover:text-white transition-all border border-blue-100"
                    >
                      <Save size={12} /> 설정 클라우드 저장
                    </button>
                    <button
                      onClick={() => {
                        if (!isAuthenticated) return alert('먼저 [구글 시트 연동하기]를 진행해 주세요.');
                        loadSettingsFromCloud();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-600 rounded-lg text-[11px] font-bold hover:bg-slate-200 transition-all border border-slate-200"
                    >
                      <RefreshCw size={12} /> 설정 클라우드 불러오기
                    </button>
                  </div>
                </div>
              ) : (
                <motion.button
                  onClick={handleLogout}
                  whileHover={{ backgroundColor: '#fee2e2' }}
                  whileTap={{ scale: 0.99 }}
                  className="flex items-center justify-center gap-2.5 border border-rose-200 text-rose-600 py-2.5 rounded-md text-[13px] font-medium transition-all"
                >
                  <X size={16} /> 연동 해제
                </motion.button>
              )}
            </div>
          </section>

          <section>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">본부 및 정산 관리</p>
            <div className="grid gap-2">
              <motion.button
                onClick={handleOpenSettings}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="flex items-center justify-center gap-2.5 bg-slate-800 text-white py-2.5 rounded-md shadow-sm text-[13px] font-medium transition-colors hover:bg-slate-900"
              >
                <Save size={16} /> 본부별 정산 설정
              </motion.button>

              <motion.button
                onClick={() => setIsManualSettlementModalOpen(true)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="flex items-center justify-center gap-2.5 bg-purple-600 text-white py-2.5 rounded-md shadow-sm text-[13px] font-medium transition-colors hover:bg-purple-700"
              >
                <Calculator size={16} /> 수동 수수료 정산
              </motion.button>

              <motion.button
                onClick={loadData}
                whileHover={{ backgroundColor: '#f8fafc' }}
                whileTap={{ scale: 0.99 }}
                className="flex items-center justify-center gap-2.5 border border-slate-200 text-slate-700 py-2.5 rounded-md text-[13px] font-medium hover:border-slate-300 transition-all font-bold"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                실시간 새로고침
              </motion.button>
            </div>
          </section>

          <section>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">정산 및 리포트</p>
            <div className="grid gap-2">
              <nav className="flex flex-col gap-1">
                {[
                  { dot: 'bg-blue-600', label: '월별 실적 대시보드', action: () => setIsMonthlyDashboardModalOpen(true) },
                  { dot: 'bg-emerald-500', label: '유지수수료 현황 조회', action: () => { setMaintenanceTab('eligible'); setIsMaintenanceStatusModalOpen(true); } },
                  { dot: 'bg-indigo-500', label: '유지수수료 지급 관리', action: () => setIsMaintenanceHistoryModalOpen(true) },
                  { dot: 'bg-orange-500', label: '유통사 대사 작업', action: () => { setIsReconciliationModalOpen(true); if (reconHistoryDates.length === 0) loadReconHistory(); } },
                ].map((item, idx) => (
                  <motion.button
                    key={idx}
                    onClick={item.action}
                    whileHover={{ x: 2, backgroundColor: '#f8fafc' }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-slate-700 text-left transition-all"
                  >
                    <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                    <span className="font-medium">{item.label}</span>
                  </motion.button>
                ))}
              </nav>
            </div>
          </section>

          <section className="mt-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">헬스케어</p>
            <div className="grid gap-2">
              <nav className="flex flex-col gap-1">
                <motion.button
                  onClick={() => setIsHealthcareCalendarModalOpen(true)}
                  whileHover={{ x: 2, backgroundColor: '#f8fafc' }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-slate-700 text-left transition-all"
                >
                  <span className={`w-2 h-2 rounded-full bg-pink-500`} />
                  <span className="font-medium">헬스케어 명단</span>
                </motion.button>
              </nav>
            </div>
          </section>

          <div className="mt-auto pt-4 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed">
            운영자: 관리자 (Admin)<br />
            IP: 192.168.0.104
          </div>
        </motion.aside>

        <main className="flex-1 p-6 overflow-auto bg-[#f8fafc]">
          <div className="flex flex-col gap-5 mb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                관리대장 현황
                {payDateFilter && (
                  <span className="text-[12px] font-bold px-3 py-1 bg-blue-600 text-white rounded-full flex items-center gap-1.5 shadow-sm">
                    <Calendar size={13} />
                    {payDateFilter} 지급예정
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenSettings}
                  className="p-2 bg-slate-200 text-slate-600 rounded-full hover:bg-slate-300 transition-colors shadow-sm"
                  title="정산 마스터 설정"
                >
                  <Settings size={20} />
                </button>
              </div>
            </div>

                        {/* 구좌 현황 대시보드 (수수료 대시보드 위) */}
            <div className="mb-6 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 pb-4 border-b border-slate-100 gap-4">
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <TrendingUp size={18} className="text-blue-500" />
                  월별 계약 현황
                </h3>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
                  <div className="flex bg-slate-100 p-1 rounded-lg w-full sm:w-auto">
                    <button
                      onClick={() => setTopDashboardMode('구좌수')}
                      className={`flex-1 sm:flex-none px-4 py-1.5 text-[12px] font-bold rounded-md transition-all ${topDashboardMode === '구좌수' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      구좌수 기준
                    </button>
                    <button
                      onClick={() => setTopDashboardMode('상품개수')}
                      className={`flex-1 sm:flex-none px-4 py-1.5 text-[12px] font-bold rounded-md transition-all ${topDashboardMode === '상품개수' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      상품개수(실물) 기준
                    </button>
                  </div>
                  <input
                    type="month"
                    value={topDashboardMonth}
                    onChange={(e) => setTopDashboardMonth(e.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 w-full sm:w-auto"
                  />
                </div>
              </div>

              {(() => {
                const prodCounts = new Map<string, number>();
                const hqCounts = new Map<string, number>();
                let totalContracts = 0;
                let cancelCount = 0;
                const seenRentalNos = new Set<string>();
                const cancelSeenRentalNos = new Set<string>();

                data.forEach(d => {
                  const dateStr = d.contractDate ? d.contractDate.replace(/\./g, '-').substring(0, 7) : '';
                  if (dateStr === topDashboardMonth) {
                    const isCancelled = d.status.includes('취소') || d.status.includes('해약') || d.deliveryStatus.includes('취소') || d.deliveryStatus.includes('반품');

                    if (topDashboardMode === '상품개수' && d.rentalNo) {
                      if (isCancelled) {
                        if (cancelSeenRentalNos.has(d.rentalNo)) return;
                        cancelSeenRentalNos.add(d.rentalNo);
                      } else {
                        if (seenRentalNos.has(d.rentalNo)) return;
                        seenRentalNos.add(d.rentalNo);
                      }
                    }

                    if (isCancelled) {
                      cancelCount++;
                    } else {
                      totalContracts++;
                      const prod = d.prodName || '미지정';
                      prodCounts.set(prod, (prodCounts.get(prod) || 0) + 1);
                      const hq = d.hq || '미지정';
                      hqCounts.set(hq, (hqCounts.get(hq) || 0) + 1);
                    }
                  }
                });

                const sortedProds = Array.from(prodCounts.entries()).sort((a, b) => b[1] - a[1]);
                const sortedHqs = Array.from(hqCounts.entries()).sort((a, b) => b[1] - a[1]);
                const countUnit = topDashboardMode === '구좌수' ? '구좌' : '개';

                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* 상품별 계약건수와 총합 */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-3 text-sm font-bold text-slate-700 bg-blue-50 px-3 py-2 rounded-lg">
                        <span className="flex items-center gap-1.5"><Package size={14} className="text-blue-500" /> 상품별 {topDashboardMode === '구좌수' ? '계약건수' : '수량'}</span>
                        <span className="text-blue-600">총 {totalContracts.toLocaleString()}{countUnit}</span>
                      </div>
                      <div className="space-y-2 overflow-y-auto max-h-48 pr-2 custom-scrollbar">
                        {sortedProds.length > 0 ? sortedProds.map(([p, count], idx) => (
                          <div key={p} className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span className="text-[10px] font-black text-slate-400 w-4">{idx + 1}</span>
                              <span className="font-medium text-slate-600 truncate" title={p}>{p}</span>
                            </div>
                            <span className="font-bold text-slate-800 shrink-0">{count.toLocaleString()}{countUnit}</span>
                          </div>
                        )) : <div className="text-xs text-slate-400 text-center py-4">해당 월 데이터가 없습니다.</div>}
                      </div>
                    </div>

                    {/* 본부별 계약건수 */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-3 text-sm font-bold text-slate-700 bg-emerald-50 px-3 py-2 rounded-lg">
                        <span className="flex items-center gap-1.5"><Building size={14} className="text-emerald-500" /> 본부별 {topDashboardMode === '구좌수' ? '계약건수' : '수량'}</span>
                        <span className="text-emerald-600">총 {totalContracts.toLocaleString()}{countUnit}</span>
                      </div>
                      <div className="space-y-2 overflow-y-auto max-h-48 pr-2 custom-scrollbar">
                        {sortedHqs.length > 0 ? sortedHqs.map(([h, count], idx) => (
                          <div key={h} className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span className="text-[10px] font-black text-slate-400 w-4">{idx + 1}</span>
                              <span className="font-medium text-slate-600 truncate" title={h}>{h}</span>
                            </div>
                            <span className="font-bold text-slate-800 shrink-0">{count.toLocaleString()}{countUnit}</span>
                          </div>
                        )) : <div className="text-xs text-slate-400 text-center py-4">해당 월 데이터가 없습니다.</div>}
                      </div>
                    </div>

                    {/* 취소/해약 현황 */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-3 text-sm font-bold text-slate-700 bg-rose-50 px-3 py-2 rounded-lg">
                        <span className="flex items-center gap-1.5"><AlertCircle size={14} className="text-rose-500" /> 취소 및 해약</span>
                        <span className="text-rose-600">총 {cancelCount.toLocaleString()}{countUnit}</span>
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-center bg-rose-50/30 rounded-lg border border-rose-100/50 p-4 min-h-[100px]">
                        <div className="text-3xl font-black text-rose-500 mb-2">{cancelCount.toLocaleString()}{countUnit}</div>
                        <p className="text-xs text-slate-500 text-center">선택된 월의 총 취소/해약 수<br/>(배송취소, 반품 포함)</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>


            {/* 정산 요약 대시보드 */}
            {(payDateFilter || filteredData.length > 0) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-4"
              >
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  <div className="lg:col-span-1 bg-indigo-900 p-6 rounded-2xl shadow-xl border border-indigo-800 text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <FileText size={80} />
                    </div>
                    <div className="relative z-10">
                      <div className="text-indigo-300 text-[11px] font-bold uppercase tracking-wider mb-2">에넥스 입금예정액</div>
                      <div className="text-3xl font-black mb-1">{settlementStats.totalPendingEnexAmount.toLocaleString()}원</div>
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[12px] font-bold">
                        미입금 {settlementStats.totalPendingCount}구좌
                      </div>
                    </div>
                  </div>
                  <div className="lg:col-span-1 bg-slate-900 p-6 rounded-2xl shadow-xl border border-slate-800 text-white relative overflow-hidden group">
                    <button
                      onClick={() => setIsSettlementModalOpen(true)}
                      className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors z-20"
                      title="정산서 생성하기"
                    >
                      <Download size={16} className="text-orange-400 group-hover:scale-110 transition-transform" />
                    </button>
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <FileText size={80} />
                    </div>
                    <div className="relative z-10">
                      <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">지급 예정 합계</div>
                      <div className="text-3xl font-black mb-1">{settlementStats.totalPendingAmount.toLocaleString()}원</div>
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[12px] font-bold">
                        미지급 {settlementStats.totalPendingCount}구좌
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4 flex justify-between items-center">
                      <div className="flex items-center gap-6">
                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                          <button
                            onClick={() => setDashboardView('product')}
                            className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${dashboardView === 'product' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                          >
                            상품별
                          </button>
                          <button
                            onClick={() => setDashboardView('hq')}
                            className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${dashboardView === 'hq' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                          >
                            본부별
                          </button>
                        </div>
                        <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          {dashboardView === 'product' ? `품목 ${settlementStats.details.length}종` : `본부 ${settlementStats.hqDetails.length}개`}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <div className="relative">
                          <button
                            onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-md flex items-center gap-1.5"
                          >
                            <FileText size={12} />
                            정산서 미리보기(웹)
                          </button>
                          {isExportDropdownOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 py-2 overflow-hidden"
                            >
                              <div className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase border-b border-slate-100 mb-1 flex justify-between items-center">
                                <span>정산서 미리보기 / 다운로드</span>
                                <button onClick={() => setIsExportDropdownOpen(false)} className="hover:text-slate-600"><X size={10} /></button>
                              </div>
                              <div className="max-h-60 overflow-y-auto">
                                <button
                                  onClick={() => {
                                    setPreviewTarget('ALL');
                                    setIsExportDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-blue-50 text-[12px] font-black text-blue-700 border-b border-slate-50 flex justify-between items-center bg-blue-50/20"
                                >
                                  <span>전사 통합 정산 보고서 미리보기</span>
                                  <FileText size={12} />
                                </button>
                                <button
                                  onClick={() => {
                                    exportIntegratedSettlement();
                                    setIsExportDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-emerald-50 text-[12px] font-black text-emerald-700 border-b border-slate-50 flex justify-between items-center bg-emerald-50/20"
                                >
                                  <span>전사 통합 정산 보고서 (Excel)</span>
                                  <Download size={12} />
                                </button>
                                <button
                                  onClick={async () => {
                                    setIsExportDropdownOpen(false);
                                    const specialAdditions: Record<string, number> = {};
                                    Object.entries(settlementStats.globalIncentivesSummary || {}).forEach(([name, amt]) => {
                                      if ((amt as number) > 0) specialAdditions[name] = amt as number;
                                    });
                                    const combinedHqs = Array.from(new Set([
                                      ...Object.keys(settlementStats.hqGroups), 
                                      ...Object.keys(specialAdditions),
                                      ...maintenancePayouts.map(m => m.hq)
                                    ]));
                                    
                                    for (let i = 0; i < combinedHqs.length; i++) {
                                      const hq = combinedHqs[i];
                                      const items = settlementStats.hqGroups[hq] || [];
                                      const hqMaintenancePayouts = maintenancePayouts.filter(m => m.hq === hq);
                                      const specialSum = specialAdditions[hq] || 0;
                                      
                                      if (items.length > 0 || hqMaintenancePayouts.length > 0 || specialSum > 0) {
                                        await exportProfessionalSettlement(hq);
                                        await new Promise(resolve => setTimeout(resolve, 300));
                                      }
                                    }
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-teal-50 text-[12px] font-black text-teal-700 border-b border-slate-50 flex justify-between items-center bg-teal-50/20"
                                >
                                  <span>본부별 정산서 일괄 다운로드 (Excel)</span>
                                  <Download size={12} />
                                </button>
                                {Object.keys(settlementStats.hqGroups).map(hq => (
                                  <div key={hq} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 flex items-center pr-3 group">
                                    <button
                                      onClick={() => {
                                        setPreviewTarget(hq);
                                        setIsExportDropdownOpen(false);
                                      }}
                                      className="flex-1 text-left px-4 py-2 text-[12px] font-bold text-slate-700 flex justify-between items-center"
                                    >
                                      <span>{hq}</span>
                                      <div className="flex gap-1.5 opacity-40 group-hover:opacity-100">
                                        <FileText size={12} className="text-red-600" />
                                      </div>
                                    </button>
                                    <button
                                      onClick={() => {
                                        exportProfessionalSettlement(hq);
                                        setIsExportDropdownOpen(false);
                                      }}
                                      className="p-1.5 hover:bg-emerald-50 text-emerald-500 rounded-md transition-colors"
                                    >
                                      <Download size={14} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-6 overflow-x-auto pb-2 scrollbar-hide">
                      {dashboardView === 'product' ? (
                        settlementStats.details.map(([name, stat]) => (
                          <div key={name} className="flex flex-col min-w-[160px] border-l-3 border-blue-50 pl-4 py-1">
                            <div className="text-[12px] font-bold text-slate-500 truncate mb-1" title={name}>{name}</div>
                            <div className="flex flex-col">
                              <span className="text-lg font-black text-slate-900">{stat.amount.toLocaleString()}원</span>
                              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded w-fit">{stat.count}구좌</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        settlementStats.hqDetails.map(([name, stat]) => (
                          <div key={name} className="flex flex-col min-w-[160px] border-l-3 border-emerald-50 pl-4 py-1">
                            <div className="text-[12px] font-bold text-slate-500 truncate mb-1" title={name}>{name}</div>
                            <div className="flex flex-col">
                              <span className="text-lg font-black text-emerald-700">{stat.amount.toLocaleString()}원</span>
                              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded w-fit">{stat.count}구좌</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-5">
              <div className="flex flex-col md:flex-row md:items-center gap-4 pb-4 border-b border-slate-50">
                <div className="flex items-center gap-3 min-w-max">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">배송현황</div>
                  <div className="flex flex-wrap gap-1.5">
                    {['전체', ...uniqueDeliveryStatus].map(status => (
                      <button
                        key={status}
                        onClick={() => setDeliveryFilter(status)}
                        className={`px-4 py-1.5 rounded-full text-[12px] font-bold transition-all ${deliveryFilter === status
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                          }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 min-w-max ml-4">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">지급상태</div>
                  <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    {['전체', '지급완료', '지급예정'].map(status => (
                      <button
                        key={status}
                        onClick={() => setPaymentStatusFilter(status)}
                        className={`px-3 py-1 rounded-md text-[11px] font-black transition-all ${paymentStatusFilter === status
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-slate-400 hover:text-slate-600'
                          }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:ml-auto flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-[11px] font-bold text-slate-400">상품</span>
                    <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="bg-transparent text-[12px] font-bold text-slate-700 outline-none max-w-[120px]">
                      {uniqueProducts.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-[11px] font-bold text-slate-400">본부</span>
                    <select value={hqFilter} onChange={(e) => setHqFilter(e.target.value)} className="bg-transparent text-[12px] font-bold text-slate-700 outline-none max-w-[120px]">
                      {uniqueHqs.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-[11px] font-bold text-slate-400">지사</span>
                    <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="bg-transparent text-[12px] font-bold text-slate-700 outline-none max-w-[120px]">
                      {uniqueBranches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm">
                    <span className="text-[11px] font-bold text-slate-400">정렬</span>
                    <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)} className="bg-transparent text-[12px] font-bold text-slate-700 outline-none">
                      <option value="desc">최신순</option>
                      <option value="asc">오래순</option>
                    </select>
                  </div>
                  <button
                    onClick={() => setIsCalendarModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-all group"
                    title="전체 지급일 달력 보기"
                  >
                    <Calendar size={13} className="text-slate-400 group-hover:text-blue-600" />
                    <span className="bg-slate-100 text-[10px] font-black text-blue-600 rounded px-1.5 py-0.5 group-hover:bg-blue-600 group-hover:text-white transition-colors">지급일</span>
                  </button>
                  <div className="relative flex items-center">
                    <span className="absolute -top-6 left-0 bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-md animate-bounce flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-white animate-ping"></span>
                      1순위 필수 설정
                    </span>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-rose-50/50 border-2 border-rose-500 rounded-lg shadow-md hover:border-rose-600 transition-colors">
                      <span className="text-[10px] font-black text-rose-600 uppercase">지급일 정산:</span>
                      <select
                        value={payDateFilter}
                        onChange={(e) => setPayDateFilter(e.target.value === '전체' ? '' : e.target.value)}
                        className="bg-transparent text-[12px] font-black text-rose-700 outline-none cursor-pointer"
                      >
                        {uniquePayDates.map(date => <option key={date} value={date}>{date}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={resetFilters} className="p-2 border border-slate-200 rounded-lg text-slate-400 hover:text-blue-600 bg-white transition-all shadow-sm">
                    <RefreshCw size={14} />
                  </button>
                </div>

                <div className="md:ml-auto relative flex-1 max-w-md flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                      type="text" placeholder="회원명, 상품명, 계약일 검색..." value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[13px] font-medium focus:ring-2 focus:ring-blue-100 outline-none shadow-sm"
                    />
                  </div>
                  {filteredData.length > 0 && (
                    <button
                      onClick={() => {
                        if (confirm(`현재 필터링된 ${filteredData.length}건을 모두 '지급완료' 처리하시겠습니까?\n\n(참고: 취소된 건은 제외됩니다)`)) {
                          const validItems = filteredData.filter(item => !item.deliveryStatus.includes('취소'));
                          const updates = validItems.map(item => ({
                            rowIdx: item.originalRowIdx,
                            colIdx: 19,
                            newValue: '지급완료'
                          }));
                          batchUpdateCells(updates);
                        }
                      }}
                      className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl text-[12px] font-black transition-all shadow-lg flex items-center gap-2 shrink-0"
                    >
                      <CheckCircle size={14} />
                      일괄 지급완료
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>


                    <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden"
          >
            <div className="overflow-auto">
              <table className="w-full text-left border-collapse text-[11px] min-w-[1200px]">
                <thead>
                  <tr className="bg-slate-800 text-white border-b border-slate-700">
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700">계약일자</th>
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700">상태</th>
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700">회원번호</th>
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700">회원명</th>
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700">상품명</th>
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700 leading-tight whitespace-nowrap">
                      전체수수료<br/>
                      <span className="text-[10px] text-slate-400 font-normal">(본부설정기준)</span>
                    </th>
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700">렌탈번호</th>
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700">배송현황</th>
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700">배송일자</th>
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700 text-blue-300">지급일자</th>
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700">지급상태</th>
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700 w-[110px]">본부명</th>
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700 w-[110px]">지사명</th>
                    <th className="px-3 py-3 font-bold text-center border-r border-slate-700">사원명</th>
                    <th className="px-3 py-3 font-bold text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const PAGE_SIZE = 20;
                    const paginatedData = filteredData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

                    return paginatedData.map((item, idx) => {
                      const count = data.filter(i => i.hq === item.hq && i.prodName === item.prodName).length;
                      const dummyMap = new Map<string, number>([[`${item.hq}|${item.prodName}`, count]]);
                      const { totalCommission } = calculateCommissionDetails(item, dummyMap);

                      return (
                        <motion.tr
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.01 }}
                          key={item.uniqueKey}
                          className={`hover:bg-blue-50/50 transition-colors group cursor-pointer border-b border-slate-50 text-[12px] ${item.status.includes('취소') ? 'text-red-500' : ''}`}
                          onClick={() => setSelectedItem(item)}
                        >
                          <td className="px-3 py-3.5 text-slate-500 font-mono text-center border-r border-slate-50 whitespace-nowrap">{item.contractDate}</td>
                          <td className="px-3 py-3.5 text-center border-r border-slate-50 font-bold">
                            {item.status.includes('취소') ? (
                              <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded-md">취소</span>
                            ) : (
                              <span className={`px-2 py-0.5 rounded-md ${item.status === '가입' ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}>
                                {item.status}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-center border-r border-slate-50 text-blue-600 font-bold">{item.memNo}</td>
                          <td className="px-3 py-3.5 border-r border-slate-50 font-black text-slate-900">{item.memName}</td>
                          <td className="px-3 py-3.5 border-r border-slate-50 font-bold text-slate-600 truncate max-w-[150px]" title={item.prodName}>{item.prodName}</td>
                          <td className="px-3 py-3.5 border-r border-slate-50 text-right font-black text-slate-700 bg-amber-50/10 whitespace-nowrap">{Math.floor(totalCommission).toLocaleString()}원</td>
                          <td className="px-3 py-3.5 text-center border-r border-slate-50 text-slate-500">{item.rentalNo}</td>
                        <td className="px-3 py-3.5 border-r border-slate-50 text-center whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-md text-[10px] font-black border ${item.deliveryStatus.includes('완료') ? 'bg-blue-50 text-blue-600 border-blue-100' :
                            item.deliveryStatus.includes('취소') ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-orange-50 text-orange-600 border-orange-100'
                            }`}>
                            {item.deliveryStatus}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-center border-r border-slate-50 text-slate-400 whitespace-nowrap">{item.deliveryDate || '-'}</td>
                        <td className="px-3 py-3.5 border-r border-slate-50 text-center font-black text-indigo-600 bg-indigo-50/20 whitespace-nowrap">
                          {item.payDate || '-'}
                        </td>
                        <td className="px-3 py-3.5 border-r border-slate-50 text-center whitespace-nowrap">
                          <span className={`px-2 py-1 rounded text-[10px] font-black ${(item.paymentStatus === '지급완료' || item.hc.includes('지급완료'))
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-100 text-slate-400'
                            }`}>
                            {(item.paymentStatus === '지급완료' || item.hc.includes('지급완료')) ? '지급완료' : '지급예정'}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-center border-r border-slate-50 text-slate-600 truncate max-w-[100px]">{item.hq}</td>
                        <td className="px-3 py-3.5 text-center border-r border-slate-50 text-slate-600 truncate max-w-[100px]">{item.branch}</td>
                        <td className="px-3 py-3.5 text-center border-r border-slate-50 text-slate-400 whitespace-nowrap">{item.empName}</td>
                        <td className="px-3 py-3.5 text-center">
                          <button className="p-1 hover:bg-slate-200 rounded text-slate-300 hover:text-slate-600">
                            <MoreVertical size={14} />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  });
                })()}
                </tbody>
              </table>

              {filteredData.length === 0 && (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                  <Search size={32} className="mb-3 opacity-20" />
                  <p className="text-sm font-bold">검색 결과가 없습니다.</p>
                </div>
              )}
            </div>

            {/* Pagination UI */}
            {filteredData.length > 0 && (
              <div className="px-8 py-4 bg-white border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs font-bold text-slate-400">
                  전체 <span className="text-blue-600">{filteredData.length.toLocaleString()}</span>건 중 {((currentPage - 1) * 20 + 1).toLocaleString()}-{Math.min(currentPage * 20, filteredData.length).toLocaleString()}건 표시
                </div>
                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-2 border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-all"
                  >
                    <ChevronRight size={16} className="rotate-180" />
                  </button>
                  {(() => {
                    const totalPages = Math.ceil(filteredData.length / 20);
                    const pages = [];
                    let start = Math.max(1, currentPage - 2);
                    let end = Math.min(totalPages, start + 4);
                    if (end === totalPages) start = Math.max(1, end - 4);

                    for (let i = start; i <= end; i++) {
                      if (i < 1) continue;
                      pages.push(
                        <button
                          key={i}
                          onClick={() => setCurrentPage(i)}
                          className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${currentPage === i ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          {i}
                        </button>
                      );
                    }
                    return pages;
                  })()}
                  <button
                    disabled={currentPage === Math.ceil(filteredData.length / 20)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredData.length / 20), prev + 1))}
                    className="p-2 border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-all"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </main>

        {/* 4. 상세 정보 모달 */}
        <AnimatePresence>
          {selectedItem && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => { setSelectedItem(null); setDetailSource('main'); }}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <FileText size={18} className="text-accent-blue" />
                    회원 상세 정보
                  </h3>
                  <button
                    onClick={() => { setSelectedItem(null); setDetailSource('main'); }}
                    className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-6 space-y-8">
                  {/* 정산 요약 - 실시간 계산 결과 */}
                  {detailSource !== 'healthcare' && (
                  <section className="bg-blue-50/50 p-4 rounded-xl border border-blue-100/50">
                    <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <TrendingUp size={14} /> 실시간 정산 분석 (본부 설정 기준)
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      {(() => {
                        const setting = hqSettings.find(s => s.hqName === selectedItem.hq);
                        const productRule = setting?.productRules.find(r => r.productName === selectedItem.prodName);

                        // 현재 필터링된 데이터에서 해당 본부/상품의 실적 건수 파악 (구간 수수료용)
                        const count = data.filter(i => i.hq === selectedItem.hq && i.prodName === selectedItem.prodName).length;

                        let unitPrice = productRule?.totalAmount || 0;
                        let salesPart = productRule?.salesAmount || 0;

                        if (selectedItem.hq === '조민경') {
                          unitPrice = 5000;
                          salesPart = 5000;
                        } else if (selectedItem.hq === '조재윤') {
                          unitPrice = 10000;
                          salesPart = 10000;
                        } else if (productRule) {
                          if (productRule.tier3Count > 0 && count >= productRule.tier3Count) unitPrice = productRule.tier3Price;
                          else if (productRule.tier2Count > 0 && count >= productRule.tier2Count) unitPrice = productRule.tier2Price;
                          else if (productRule.tier1Count > 0 && count >= productRule.tier1Count) unitPrice = productRule.tier1Price;

                          const salesRatio = productRule.totalAmount > 0 ? (productRule.salesAmount / productRule.totalAmount) : 1;
                          salesPart = unitPrice * salesRatio;
                        }

                        const totalComm = unitPrice;
                        const promo = Math.max(0, totalComm - salesPart);

                        return (
                          <>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-bold text-slate-400">전체 수수료</span>
                              <span className="text-sm font-black text-slate-900">{Math.floor(totalComm).toLocaleString()}원</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-bold text-slate-400">판매 수수료</span>
                              <span className="text-sm font-black text-blue-600">{Math.floor(salesPart).toLocaleString()}원</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-bold text-slate-400">판매촉진비</span>
                              <span className="text-sm font-black text-orange-600">{Math.floor(promo).toLocaleString()}원</span>
                            </div>
                            {(selectedItem.hq === '조재윤' || selectedItem.hq === '조민경') && (
                              <div className="col-span-3 mt-2 p-2 bg-white rounded border border-blue-100 text-[10px] font-bold text-blue-500 italic">
                                * {selectedItem.hq} 특수 규칙 적용됨: {selectedItem.hq === '조재윤' ? '건당 1만원 (월 최소 200만 보장)' : '건당 5천원'}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </section>
                  )}

                  {/* 회원정보 */}
                  <section>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <div className="w-1 h-3 bg-blue-500 rounded-full" />
                      회원 정보
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <DetailItem label="계약일자" value={selectedItem.contractDate} />
                      <DetailItem label="회원번호" value={selectedItem.memNo} />
                      <DetailItem label="회원명" value={selectedItem.memName} />
                      <DetailItem label="주민등록번호" value={selectedItem.resNo} />
                      <DetailItem label="핸드폰" value={selectedItem.phone} />
                    </div>
                  </section>

                  {/* 상품정보 */}
                  <section>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <div className="w-1 h-3 bg-emerald-500 rounded-full" />
                      상품 정보
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <DetailItem label="상품명" value={selectedItem.prodName} />
                      <DetailItem label="렌탈상품명" value={selectedItem.rentalProd} />
                      <DetailItem label="렌탈계약번호" value={selectedItem.rentalNo} />
                      <DetailItem label="배송현황" value={selectedItem.deliveryStatus.replace('완료', ' 완료')} />
                      <DetailItem label="배송일자" value={selectedItem.deliveryDate} />
                    </div>
                  </section>

                  {/* 수수료정보 및 메모 */}
                  <section>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <div className="w-1 h-3 bg-orange-500 rounded-full" />
                      수수료 정보 및 메모
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex flex-col gap-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">수수료지급일자</div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            defaultValue={selectedItem.payDate}
                            id="editPayDate"
                            className="flex-1 text-[13px] font-bold bg-white border border-slate-200 px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <button
                            onClick={() => {
                              const val = (document.getElementById('editPayDate') as HTMLInputElement).value;
                              updateCell(selectedItem.originalRowIdx, 14, val);
                            }}
                            className="p-1 px-2 bg-blue-600 text-white text-[10px] font-bold rounded"
                          >
                            저장
                          </button>
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex flex-col gap-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">지급상태</div>
                        <div className="flex gap-2">
                          <select
                            defaultValue={selectedItem.paymentStatus}
                            id="editPaymentStatus"
                            className="flex-1 text-[13px] font-bold bg-white border border-slate-200 px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                          >
                            <option value="">지급 예정</option>
                            <option value="지급완료">지급 완료</option>
                          </select>
                          <button
                            onClick={() => {
                              const val = (document.getElementById('editPaymentStatus') as HTMLSelectElement).value;
                              updateCell(selectedItem.originalRowIdx, 19, val);
                            }}
                            className="p-1 px-2 bg-emerald-600 text-white text-[10px] font-bold rounded"
                          >
                            저장
                          </button>
                        </div>
                      </div>
                      <div className="col-span-2 p-3 bg-yellow-50 border border-yellow-100 rounded-lg flex flex-col gap-1">
                        <div className="text-[10px] font-bold text-yellow-600 uppercase tracking-tight flex items-center gap-1.5">
                          <FileText size={10} /> 정산 및 지급 관련 메모
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            defaultValue={selectedItem.memo}
                            id="editMemo"
                            placeholder="메모를 입력하세요..."
                            className="flex-1 text-[13px] font-medium bg-white border border-yellow-200 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-yellow-200"
                          />
                          <button
                            onClick={() => {
                              const val = (document.getElementById('editMemo') as HTMLInputElement).value;
                              updateCell(selectedItem.originalRowIdx, 20, val);
                            }}
                            className="px-4 bg-yellow-500 text-white text-[12px] font-bold rounded-lg shadow-sm hover:bg-yellow-600 transition-colors"
                          >
                            메모 저장
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* 영업자정보 */}
                  <section>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                      영업자 정보
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <DetailItem label="본부명" value={selectedItem.hq} />
                      <DetailItem label="지사명" value={selectedItem.branch} />
                      <DetailItem label="사원명" value={selectedItem.empName} />
                    </div>
                  </section>

                  {/* 기타 */}
                  <section>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <div className="w-1 h-3 bg-purple-500 rounded-full" />
                      기타 지원 정보
                    </h4>
                    <div className="grid grid-cols-1 gap-4">
                      <DetailItem label="헬스케어 대상자(PQR)" value={selectedItem.hc} />
                    </div>
                  </section>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                  <div>
                    {(selectedItem.paymentStatus === '지급완료' || selectedItem.hc.includes('지급완료')) && (
                      <button
                        onClick={() => {
                          if (confirm('해당 건의 지급 완료 처리를 취소하시겠습니까?')) {
                            updateCell(selectedItem.originalRowIdx, 18, '');
                            setSelectedItem(null);
                          }
                        }}
                        className="px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg text-[12px] font-bold transition-all border border-rose-100 flex items-center gap-1.5"
                      >
                        <X size={14} />
                        지급 취소 (데이터 복구)
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="px-8 py-2 bg-slate-900 text-white rounded-xl text-sm font-black shadow-lg"
                  >
                    확인
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* 4-1. 지급일 선택 달력 모달 */}
        <AnimatePresence>
          {isCalendarModalOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsCalendarModalOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="p-6">
                  {(() => {
                    const year = calendarViewDate.getFullYear();
                    const month = calendarViewDate.getMonth();

                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const firstDay = new Date(year, month, 1).getDay();
                    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

                    const prevMonthLastDay = new Date(year, month, 0).getDate();
                    const prevMonthDays = Array.from({ length: firstDay }, (_, i) => prevMonthLastDay - firstDay + i + 1);

                    return (
                      <>
                        <div className="flex justify-between items-center mb-6">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Select Payment Date</span>
                            <h3 className="text-xl font-black text-slate-900">{year}년 {month + 1}월</h3>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setCalendarViewDate(new Date(year, month - 1, 1))}
                              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                            >
                              <ChevronRight size={20} className="rotate-180" />
                            </button>
                            <button
                              onClick={() => setCalendarViewDate(new Date(year, month + 1, 1))}
                              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                            >
                              <ChevronRight size={20} />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-center mb-2">
                          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                            <span key={d} className={`text-[10px] font-bold ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-slate-400'}`}>
                              {d}
                            </span>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {prevMonthDays.map(d => (
                            <div key={`prev-${d}`} className="h-10 flex items-center justify-center text-[13px] text-slate-200">
                              {d}
                            </div>
                          ))}
                          {days.map(d => {
                            const dateStr = `${year}.${String(month + 1).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
                            const hasData = allDatesWithData.has(dateStr);
                            const isSelected = payDateFilter === dateStr;

                            return (
                              <motion.button
                                key={d}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => {
                                  setPayDateFilter(dateStr);
                                  setIsCalendarModalOpen(false);
                                }}
                                className={`
                                  h-10 rounded-xl flex flex-col items-center justify-center text-[13px] relative transition-all
                                  ${isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 font-black' :
                                    hasData ? 'text-slate-900 font-black hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-50'}
                                `}
                              >
                                {d}
                                {hasData && !isSelected && (
                                  <div className="absolute bottom-1.5 w-1 h-1 bg-blue-500 rounded-full" />
                                )}
                              </motion.button>
                            );
                          })}
                        </div>
                      <div className="mt-6 flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                            <span>점 표시: 데이터가 있는 날짜 (검정색)</span>
                          </div>
                          <button
                            onClick={() => {
                              setPayDateFilter('');
                              setIsCalendarModalOpen(false);
                            }}
                            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[13px] font-bold transition-colors"
                          >
                            필터 해제 (전체 보기)
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isHealthcareCalendarModalOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsHealthcareCalendarModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                <div className="p-6">
                  {(() => {
                    const year = hcCalendarViewDate.getFullYear();
                    const month = hcCalendarViewDate.getMonth();

                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const firstDay = new Date(year, month, 1).getDay();
                    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

                    const prevMonthLastDay = new Date(year, month, 0).getDate();
                    const prevMonthDays = Array.from({ length: firstDay }, (_, i) => prevMonthLastDay - firstDay + i + 1);

                    const allHcRegDates = new Set(data.map(d => d.hcRegDate?.trim().replace(/\./g, '-')).filter(Boolean));

                    return (
                      <>
                        <div className="flex justify-between items-center mb-6">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-green-500 uppercase tracking-widest">Select Healthcare Date</span>
                            <h3 className="text-xl font-black text-slate-900">{year}년 {month + 1}월</h3>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => setHcCalendarViewDate(new Date(year, month - 1, 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"><ChevronRight size={20} className="rotate-180" /></button>
                            <button onClick={() => setHcCalendarViewDate(new Date(year, month + 1, 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"><ChevronRight size={20} /></button>
                          </div>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-center mb-2">
                          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                            <span key={d} className={`text-[10px] font-bold ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-slate-400'}`}>{d}</span>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {prevMonthDays.map(d => <div key={`prev-${d}`} className="h-10 flex items-center justify-center text-[13px] text-slate-200">{d}</div>)}
                          {days.map(d => {
                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            const hasData = allHcRegDates.has(dateStr);

                            return (
                              <motion.button
                                key={d} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                onClick={() => {
                                  setHealthcareFilter({ type: 'date', value: dateStr });
                                  setIsHealthcareListModalOpen(true);
                                  setIsHealthcareCalendarModalOpen(false);
                                }}
                                className={`h-10 rounded-xl flex flex-col items-center justify-center text-[13px] relative transition-all ${hasData ? 'text-slate-900 font-black hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-50'}`}
                              >
                                {d}
                                {hasData && <div className="absolute bottom-1.5 w-1 h-1 bg-green-500 rounded-full" />}
                              </motion.button>
                            );
                          })}
                        </div>
                        <div className="mt-6 flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium mb-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full" />
                            <span>점 표시: 데이터가 있는 날짜 (초록색)</span>
                          </div>
                          <button
                            onClick={() => {
                              const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
                              setHealthcareFilter({ type: 'month', value: monthStr });
                              setIsHealthcareListModalOpen(true);
                              setIsHealthcareCalendarModalOpen(false);
                            }}
                            className="w-full py-3 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl text-[13px] font-bold transition-colors mb-1"
                          >
                            이 달({month + 1}월) 전체 보기
                          </button>
                          <button
                            onClick={() => {
                              setHealthcareFilter(null);
                              setIsHealthcareListModalOpen(true);
                              setIsHealthcareCalendarModalOpen(false);
                            }}
                            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[13px] font-bold transition-colors"
                          >
                            필터 해제 (전체 보기)
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 유지수수료 현황 조회 모달 */}
        <AnimatePresence>
          {isMaintenanceStatusModalOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMaintenanceStatusModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-8 flex flex-col h-full overflow-hidden">
                  <div className="flex justify-between items-center mb-6 shrink-0">
                    <div className="flex flex-col">
                      <h3 className="text-xl font-black text-slate-900">유지수수료 현황 조회</h3>
                    </div>
                    <button onClick={() => setIsMaintenanceStatusModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                  </div>
                  {(() => {
                    const targetPayDate = payDateFilter || new Date().toISOString().split('T')[0];
                    const maintenanceItems = data.map(item => {
                      const hcInfo = getHealthcareMaintenanceInfo(item, targetPayDate);
                      if (!hcInfo) return null;
                      
                      const statsMap = new Map<string, number>();
                      const details = calculateCommissionDetails(item, statsMap);
                      
                      let pendingCommission = details.unitPrice;
                      if (hcInfo.isOverdue && hcInfo.overdueCount >= 3) {
                         pendingCommission = 30000;
                      }
                      
                      return {
                        item,
                        hcInterval: hcInfo.interval,
                        isOverdue: hcInfo.isOverdue,
                        overdueCount: hcInfo.overdueCount,
                        payCount: hcInfo.payCount || 1,
                        totalCommission: details.unitPrice * (hcInfo.payCount || 1),
                        pendingCommission: pendingCommission
                      };
                    }).filter(Boolean);

                    // 강제 주입 이지안 2구좌
                    const forcedList: any[] = [];
                    const isLee1Paid = maintenanceHistory.some(h => h.resNo === 'MAX-LEE-FORCED-1' && h.payInstallment === 7);
                    if (!isLee1Paid) {
                      forcedList.push({
                        item: {
                          uniqueKey: 'MAX-LEE-FORCED-1',
                          originalRowIdx: -1,
                          contractDate: '2025-11-19',
                          memNo: 'J2511010332',
                          memName: '이지안',
                          resNo: 'MAX-LEE-FORCED-1',
                          phone: '',
                          prodName: '더좋은헬스케어580',
                          rentalProd: '',
                          rentalNo: '',
                          deliveryStatus: '배송완료',
                          status: '가입',
                          deliveryDate: '',
                          payDate: '2025-12-25',
                          hq: '맥스',
                          branch: '맥스',
                          empName: '김학민',
                          hc: '대상자',
                          paymentStatus: '',
                          hcRegDate: '2025-11-19',
                          memo: '',
                          raw: new Array(30).fill('')
                        },
                        hcInterval: 7,
                        isOverdue: false,
                        overdueCount: 0,
                        payCount: 1,
                        totalCommission: 10000,
                        pendingCommission: 0
                      });
                    }
                    const isLee2Paid = maintenanceHistory.some(h => h.resNo === 'MAX-LEE-FORCED-2' && h.payInstallment === 7);
                    if (!isLee2Paid) {
                      forcedList.push({
                        item: {
                          uniqueKey: 'MAX-LEE-FORCED-2',
                          originalRowIdx: -1,
                          contractDate: '2025-11-19',
                          memNo: 'J2511010331',
                          memName: '이지안',
                          resNo: 'MAX-LEE-FORCED-2',
                          phone: '',
                          prodName: '더좋은헬스케어580',
                          rentalProd: '',
                          rentalNo: '',
                          deliveryStatus: '배송완료',
                          status: '가입',
                          deliveryDate: '',
                          payDate: '2025-12-25',
                          hq: '맥스',
                          branch: '맥스',
                          empName: '김학민',
                          hc: '대상자',
                          paymentStatus: '',
                          hcRegDate: '2025-11-19',
                          memo: '',
                          raw: new Array(30).fill('')
                        },
                        hcInterval: 7,
                        isOverdue: false,
                        overdueCount: 0,
                        payCount: 1,
                        totalCommission: 10000,
                        pendingCommission: 0
                      });
                    }
                    maintenanceItems.push(...forcedList);

                    const eligibleItems = maintenanceItems.filter((x: any) => !x.isOverdue);
                    const overdueItems = maintenanceItems.filter((x: any) => x.isOverdue);

                    const totalEligibleSum = eligibleItems.reduce((sum: number, x: any) => sum + x.totalCommission, 0);
                    const totalOverdueSum = overdueItems.reduce((sum: number, x: any) => sum + x.pendingCommission, 0);

                    const currentList = maintenanceTab === 'eligible' ? eligibleItems : overdueItems;

                    return (
                      <>
                        <div className="flex gap-2 mb-6 border-b border-slate-100 pb-3 shrink-0">
                          <button onClick={() => setMaintenanceTab('eligible')} className={`px-4 py-2 rounded-xl text-[13px] font-extrabold transition-all ${maintenanceTab === 'eligible' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
                            지급 대상 ({eligibleItems.length}건)
                          </button>
                          <button onClick={() => setMaintenanceTab('overdue')} className={`px-4 py-2 rounded-xl text-[13px] font-extrabold transition-all ${maintenanceTab === 'overdue' ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
                            지급 보류/연체 ({overdueItems.length}건)
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-6 shrink-0">
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                            <span className="text-[10px] font-bold text-slate-400 block mb-1">총 지급예정액 (대상)</span>
                            <span className="text-base font-black text-emerald-700">{totalEligibleSum.toLocaleString()}원</span>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                            <span className="text-[10px] font-bold text-slate-400 block mb-1">총 지급보류 (연체)</span>
                            <span className="text-base font-black text-rose-700">{totalOverdueSum.toLocaleString()}원</span>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                            <span className="text-[10px] font-bold text-slate-400 block mb-1">전체 합계</span>
                            <span className="text-base font-black text-slate-800">{(totalEligibleSum + totalOverdueSum).toLocaleString()}원</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center mb-4 shrink-0">
                          <button onClick={() => exportMaintenanceStatusExcel(eligibleItems, overdueItems)} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[12px] font-bold shadow-md transition-all">
                            <Download size={14} /> 유지수수료 현황 상세 다운로드 (Excel)
                          </button>
                        </div>
                        <div className="flex-1 overflow-auto border border-slate-100 rounded-2xl">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50/70 border-b border-slate-100 sticky top-0 z-10">
                                <th className="p-3 text-[11px] font-bold text-slate-400">본부명</th>
                                <th className="p-3 text-[11px] font-bold text-slate-400">지사명</th>
                                <th className="p-3 text-[11px] font-bold text-slate-400">사원명</th>
                                {maintenanceTab === 'overdue' && <th className="p-3 text-[11px] font-bold text-rose-500">연체횟수</th>}
                                <th className="p-3 text-[11px] font-bold text-slate-400">회원번호</th>
                                <th className="p-3 text-[11px] font-bold text-slate-400">고객명</th>
                                <th className="p-3 text-[11px] font-bold text-slate-400">계약일자</th>
                                <th className="p-3 text-[11px] font-bold text-slate-400">상품명</th>
                                <th className="p-3 text-[11px] font-bold text-slate-400">회차</th>
                                <th className="p-3 text-[11px] font-bold text-slate-400 text-right">{maintenanceTab === 'eligible' ? '지급 수수료' : '보류 수수료'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {currentList.map((x: any, i: number) => (
                                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                                  <td className="p-3 text-[13px] font-bold text-slate-800">{x.item.hq}</td>
                                  <td className="p-3 text-[13px] text-slate-600">{x.item.branch}</td>
                                  <td className="p-3 text-[13px] text-slate-700">{x.item.empName}</td>
                                  {maintenanceTab === 'overdue' && <td className="p-3 text-[13px] text-rose-600 font-bold">{x.overdueCount}회</td>}
                                  <td className="p-3 text-[13px] font-mono font-bold text-slate-700">{x.item.memNo || '-'}</td>
                                  <td className="p-3 text-[13px] font-bold text-slate-800">{x.item.memName}</td>
                                  <td className="p-3 text-[13px] font-mono text-slate-500">{x.item.contractDate}</td>
                                  <td className="p-3 text-[13px] text-slate-600">{x.item.prodName}</td>
                                  <td className="p-3 text-[13px] text-blue-600 font-bold">{x.hcInterval}회차</td>
                                  <td className="p-3 text-[13px] font-black text-slate-900 text-right">{(maintenanceTab === 'eligible' ? x.totalCommission : x.pendingCommission).toLocaleString()}원</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 비밀번호 확인 모달 */}
        <AnimatePresence>
          {isPasswordModalOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsPasswordModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-100"
              >
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                      <Lock size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-800">보안 인증</h3>
                      <p className="text-xs text-slate-400">정산 마스터 설정 진입을 위해 비밀번호를 입력하세요.</p>
                    </div>
                  </div>
                  
                  <form onSubmit={handlePasswordSubmit} className="space-y-4">
                    <div>
                      <input
                        type="password"
                        placeholder="비밀번호 입력"
                        value={passwordInput}
                        onChange={(e) => {
                          setPasswordInput(e.target.value);
                          setPasswordError(false);
                        }}
                        className={`w-full px-4 py-3 bg-slate-50 border ${passwordError ? 'border-red-400 focus:ring-red-100' : 'border-slate-200 focus:ring-blue-100'} rounded-xl text-center text-lg font-black tracking-widest focus:ring-4 outline-none transition-all`}
                        autoFocus
                      />
                      {passwordError && (
                        <p className="text-[11px] text-red-500 font-semibold mt-2 text-center">비밀번호가 올바르지 않습니다. 다시 입력해 주세요.</p>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsPasswordModalOpen(false)}
                        className="flex-1 py-2.5 border border-slate-200 rounded-xl text-[12px] font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl text-[12px] font-bold hover:bg-slate-900 transition-colors shadow-sm"
                      >
                        확인
                      </button>
                    </div>
                  </form>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 5. 정산 설정 모달 */}
        <AnimatePresence>
          {isSettingsModalOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSettingsModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="relative bg-white w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              >
                {/* Modal Header */}
                <div className="px-8 py-5 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-bold flex items-center gap-2"><Settings size={22} className="text-accent-blue" /> 본부별 정산 및 수수료 마스터 설정</h3>
                    <p className="text-xs text-slate-400 mt-1">각 거래처별 상품 수수료 및 오버라이딩 구조를 관리합니다.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 mr-4 border-r border-slate-700 pr-5">
                      <button
                        onClick={() => {
                          if (!isAuthenticated) return alert('구글 시트 연동을 먼저 진행해 주세요.');
                          saveSettingsToCloud();
                        }}
                        disabled={saveSettingsStatus === 'saving'}
                        title="구글 시트에 현재 설정 반영"
                        className={`px-3 py-1.5 border rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${saveSettingsStatus === 'saving' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 cursor-not-allowed' :
                            saveSettingsStatus === 'success' ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30' :
                              saveSettingsStatus === 'error' ? 'bg-red-600/20 text-red-400 border-red-600/30' :
                                'bg-blue-600/20 text-blue-400 border-blue-600/30 hover:bg-blue-600 hover:text-white'
                          }`}
                      >
                        {saveSettingsStatus === 'saving' ? (
                          <><RefreshCw size={14} className="animate-spin" /> 저장 중...</>
                        ) : saveSettingsStatus === 'success' ? (
                          <><CheckCircle size={14} /> 저장 완료!</>
                        ) : saveSettingsStatus === 'error' ? (
                          <><AlertCircle size={14} /> 저장 실패</>
                        ) : (
                          <><Save size={14} /> 설정 클라우드 저장</>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          if (!isAuthenticated) return alert('구글 시트 연동을 먼저 진행해 주세요.');
                          loadSettingsFromCloud();
                        }}
                        title="구글 시트에서 최신 설정 가져오기"
                        className="px-3 py-1.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-xs font-bold hover:bg-slate-700 transition-all flex items-center gap-2"
                      >
                        <RefreshCw size={14} /> 설정 불러오기
                      </button>
                      <button
                        onClick={resetSettingsToDefault}
                        title="꼬인 데이터 복구 - 모든 설정을 초기값으로 리셋"
                        className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-700/40 rounded-lg text-xs font-bold hover:bg-red-700 hover:text-white transition-all flex items-center gap-2"
                      >
                        <AlertCircle size={14} /> 설정 초기화
                      </button>
                    </div>
                    <button onClick={() => setIsSettingsModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><X size={24} /></button>
                  </div>
                </div>

                <div className="flex bg-slate-900 px-8 pt-2">
                  <button onClick={() => setSettingsTab('hq')} className={`px-6 py-2 text-sm font-bold rounded-t-xl transition-colors ${settingsTab === 'hq' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                    본부별 정산 설정
                  </button>
                  <button onClick={() => setSettingsTab('global_incentive')} className={`px-6 py-2 text-sm font-bold rounded-t-xl transition-colors ${settingsTab === 'global_incentive' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                    특수 수당 (글로벌 인센티브) 관리
                  </button>

                </div>

                {settingsTab === 'hq' ? (
                  <div className="flex-1 overflow-hidden flex bg-white">
                    {/* Left Sidebar: HQ List */}
                  <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
                    <div className="p-4 border-b border-slate-200 bg-white">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">본부 목록</p>
                    </div>
                    <div className="flex-1 overflow-auto p-2 space-y-1">
                      {hqSettings.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setActiveHqId(s.id)}
                          className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between group ${activeHqId === s.id
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                          <div className="flex flex-col">
                            <span className="text-[13px] font-bold truncate">{s.hqName}</span>
                            <span className={`text-[10px] ${activeHqId === s.id ? 'text-blue-100' : 'text-slate-400'}`}>
                              상품 {s.productRules.length}개
                            </span>
                          </div>
                          <ChevronRight size={14} className={activeHqId === s.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} />
                        </button>
                      ))}
                    </div>
                    <div className="p-4 border-t border-slate-200">
                      <button
                        onClick={() => {
                          const name = prompt('새로운 본부/거래처명을 입력하세요');
                          if (!name) return;
                          const newId = `hq-${Date.now()}`;
                          const newHq: HQSetting = {
                            id: newId,
                            hqName: name,
                            bankName: '-', accountNumber: '-', accountHolder: '-',
                            paymentMethod: '계좌이체',
                            settlementType: '사업자',
                            enableOverriding: false,
                            overriding: { salesperson: 0, teamLeader: 0, branchManager: 0, hqManager: 0 },
                            productRules: []
                          };
                          setHqSettings([...hqSettings, newHq]);
                          setActiveHqId(newId);
                        }}
                        className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-black transition-all"
                      >
                        <Plus size={14} /> 본부 추가
                      </button>
                    </div>
                  </div>

                  {/* Right Content: Details & Rules */}
                  <div className="flex-1 flex flex-col overflow-hidden bg-white">
                    {activeHqId ? (
                      (() => {
                        const s = hqSettings.find(h => h.id === activeHqId);
                        if (!s) return <div className="flex-1 flex items-center justify-center text-slate-400">본부를 선택해 주세요.</div>;
                        return (
                          <div className="flex-1 flex flex-col overflow-hidden">
                            {/* HQ Header & Bank Info */}
                            <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                              <div className="flex justify-between items-start mb-6">
                                <div>
                                  <h4 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                    {s.hqName}
                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-600 rounded uppercase tracking-tighter">정산 마스터</span>
                                  </h4>
                                  <p className="text-xs text-slate-400 mt-1">ID: {s.id} | 거래처별 맞춤 정산 규칙을 설정합니다.</p>
                                </div>
                                <button
                                  onClick={() => {
                                    if (confirm(`${s.hqName} 설정을 삭제하시겠습니까?`)) {
                                      setHqSettings(hqSettings.filter(h => h.id !== s.id));
                                      setActiveHqId(null);
                                    }
                                  }}
                                  className="px-3 py-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-xs font-bold transition-all border border-rose-100"
                                >
                                  본부 삭제
                                </button>
                              </div>

                              <div className="grid grid-cols-3 gap-6">
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">입금은행</label>
                                  <input
                                    type="text" value={s.bankName}
                                    onChange={(e) => setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, bankName: e.target.value } : h))}
                                    className="p-3 bg-white border border-slate-200 rounded-xl text-[13px] font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">계좌번호</label>
                                  <input
                                    type="text" value={s.accountNumber}
                                    onChange={(e) => setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, accountNumber: e.target.value } : h))}
                                    className="p-3 bg-white border border-slate-200 rounded-xl text-[13px] font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">수취인성명</label>
                                  <input
                                    type="text" value={s.accountHolder}
                                    onChange={(e) => setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, accountHolder: e.target.value } : h))}
                                    className="p-3 bg-white border border-slate-200 rounded-xl text-[13px] font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                                  />
                                </div>
                              </div>
                              <div className="mt-4 p-4 bg-white border border-slate-100 rounded-xl flex items-center justify-between">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                                    정산 유형 설정
                                  </label>
                                  <p className="text-[11px] text-slate-400">사업자 유무에 따른 세무 신고 기준을 선택하세요.</p>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, settlementType: '사업자' } : h))}
                                    className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex flex-col items-center gap-1 border ${s.settlementType === '사업자'
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100'
                                      : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
                                      }`}
                                  >
                                    사업자대리점
                                    <span className={`text-[9px] font-medium ${s.settlementType === '사업자' ? 'text-blue-100' : 'text-slate-300'}`}>세금계산서 발행</span>
                                  </button>
                                  <button
                                    onClick={() => setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, settlementType: '개인' } : h))}
                                    className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex flex-col items-center gap-1 border ${s.settlementType === '개인'
                                      ? 'bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-100'
                                      : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
                                      }`}
                                  >
                                    개인/프리랜서
                                    <span className={`text-[9px] font-medium ${s.settlementType === '개인' ? 'text-purple-100' : 'text-slate-300'}`}>원천세 3.3% 공제</span>
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Product Rules Unified Table */}
                            <div className="flex-1 overflow-auto p-8">
                              <div className="flex justify-between items-center mb-4">
                                <h5 className="text-sm font-black text-slate-800 flex items-center gap-2">
                                  <Package size={16} className="text-blue-500" />
                                  상품별 수수료 및 구간 설정
                                </h5>
                                <button
                                  onClick={() => {
                                    const name = prompt('추가할 상품명을 입력하세요');
                                    if (!name) return;
                                    const newRule: ProductRule = {
                                      productName: name, totalAmount: 0, salesAmount: 0,
                                      tier1Count: 0, tier1Price: 0, tier2Count: 0, tier2Price: 0, tier3Count: 0, tier3Price: 0,
                                      applyOverriding: false, applyMaintenance: false, maintenanceRules: []
                                    };
                                    setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: [...h.productRules, newRule] } : h));
                                  }}
                                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition-all flex items-center gap-2"
                                >
                                  <Plus size={14} /> 상품 추가
                                </button>
                              </div>

                              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                                <table className="w-full text-[12px] border-collapse">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black uppercase tracking-tighter">
                                      <th className="px-4 py-3 text-left w-[20%]">상품명</th>
                                      <th className="px-4 py-3 text-right">전체</th>
                                      <th className="px-4 py-3 text-right">판매</th>
                                      <th className="px-4 py-3 text-right text-orange-600">촉진</th>
                                      <th className="px-4 py-3 text-center">오버라이딩</th>
                                      <th className="px-4 py-3 text-center">유지수수료</th>
                                      <th className="px-4 py-3 text-center border-l border-slate-100 bg-blue-50/30">구간별 수수료 설정 (건 / 단가)</th>
                                      <th className="px-4 py-3 text-center">삭제</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {s.productRules.map((pr, pIdx) => (
                                      <React.Fragment key={pIdx}>
                                      <tr className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-slate-700">
                                          <input
                                            type="text" value={pr.productName}
                                            onChange={(e) => {
                                              const updated = s.productRules.map((r, i) => i === pIdx ? { ...r, productName: e.target.value } : r);
                                              setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                            }}
                                            className="w-full bg-transparent border-0 font-bold outline-none focus:text-blue-600"
                                          />
                                        </td>
                                        <td className="px-4 py-3">
                                          <input
                                            type="number" value={pr.totalAmount}
                                            onChange={(e) => {
                                              const updated = s.productRules.map((r, i) => i === pIdx ? { ...r, totalAmount: parseInt(e.target.value) || 0 } : r);
                                              setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                            }}
                                            className="w-full bg-transparent border-0 text-right font-black outline-none"
                                          />
                                        </td>
                                        <td className="px-4 py-3">
                                          <input
                                            type="number" value={pr.salesAmount}
                                            onChange={(e) => {
                                              const updated = s.productRules.map((r, i) => i === pIdx ? { ...r, salesAmount: parseInt(e.target.value) || 0 } : r);
                                              setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                            }}
                                            className="w-full bg-transparent border-0 text-right font-bold text-blue-600 outline-none"
                                          />
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-orange-500">
                                          {(pr.totalAmount - pr.salesAmount).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-center align-top">
                                          <div className="flex flex-col items-center gap-2 mt-2">
                                            <input type="checkbox" checked={pr.applyOverriding === true} onChange={(e) => {
                                              const updated = s.productRules.map((r, i) => i === pIdx ? { ...r, applyOverriding: e.target.checked } : r);
                                              setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                            }} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-center align-top">
                                          <div className="flex flex-col items-center gap-2 mt-2">
                                            <input type="checkbox" checked={pr.applyMaintenance === true} onChange={(e) => {
                                              const updated = s.productRules.map((r, i) => {
                                                if (i !== pIdx) return r;
                                                const newR = { ...r, applyMaintenance: e.target.checked };
                                                if (e.target.checked && !newR.maintenanceRules) {
                                                  newR.maintenanceRules = [{ id: Date.now().toString(), applyStartDate: '', applyEndDate: '', tiers: [{ startMonth: 2, endMonth: 36, amount: 0 }] }];
                                                }
                                                return newR;
                                              });
                                              setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                            }} className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500" />
                                          </div>
                                        </td>
                                        <td className="px-2 py-3 border-l border-slate-100 bg-blue-50/10 align-top">
                                          <div className="flex flex-col gap-1.5">
                                            {[1, 2, 3].map(t => (
                                              <div key={t} className="flex items-center gap-1 bg-white p-1 rounded border border-slate-100 shadow-sm">
                                                <span className="text-[9px] font-black text-indigo-400 min-w-[12px]">{t}</span>
                                                <input
                                                  type="number" value={(pr as any)[`tier${t}Count`]}
                                                  onChange={(e) => {
                                                    const updated = s.productRules.map((r, i) => i === pIdx ? { ...r, [`tier${t}Count`]: parseInt(e.target.value) || 0 } : r);
                                                    setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                                  }}
                                                  className="w-8 text-[10px] text-center outline-none"
                                                  placeholder="건"
                                                />
                                                <span className="text-[8px] text-slate-300">↑</span>
                                                <input
                                                  type="number" value={(pr as any)[`tier${t}Price`]}
                                                  onChange={(e) => {
                                                    const updated = s.productRules.map((r, i) => i === pIdx ? { ...r, [`tier${t}Price`]: parseInt(e.target.value) || 0 } : r);
                                                    setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                                  }}
                                                  className="w-14 text-[10px] text-right outline-none font-bold text-indigo-600"
                                                  placeholder="단가"
                                                />
                                              </div>
                                            ))}
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <button
                                            onClick={() => {
                                              if (confirm('삭제하시겠습니까?')) {
                                                const updated = s.productRules.filter((_, i) => i !== pIdx);
                                                setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                              }
                                            }}
                                            className="p-1.5 hover:bg-rose-50 text-slate-300 hover:text-rose-500 rounded transition-colors"
                                          >
                                            <X size={14} />
                                          </button>
                                        </td>
                                      </tr>
                                      {pr.applyOverriding === true && (
                                        <tr className="bg-indigo-50/40 border-b border-indigo-100">
                                          <td colSpan={7} className="px-6 py-4">
                                            <div className="flex flex-col gap-2">
                                              <h6 className="text-[11px] font-black text-indigo-800 flex items-center gap-1.5"><Users size={12} /> {pr.productName} 오버라이딩 배분 구조 (고정금액)</h6>
                                              <div className="grid grid-cols-4 gap-4 mt-2">
                                                {[
                                                  { key: 'salesperson', label: '영업사원' },
                                                  { key: 'teamLeader', label: '팀장' },
                                                  { key: 'branchManager', label: '지점장' },
                                                  { key: 'hqManager', label: '본부장' }
                                                ].map(f => {
                                                  const currOv = pr.overriding || { salesperson: 0, teamLeader: 0, branchManager: 0, hqManager: 0 };
                                                  return (
                                                    <div key={f.key} className="flex flex-col gap-1">
                                                      <label className="text-[10px] font-bold text-indigo-400">
                                                        {f.label} (₩)
                                                      </label>
                                                      <input
                                                        type="number" value={(currOv as any)[f.key]}
                                                        onChange={(e) => {
                                                          const val = parseInt(e.target.value) || 0;
                                                          const updated = s.productRules.map((r, i) => {
                                                            if (i !== pIdx) return r;
                                                            const newOv = { ...(r.overriding || { salesperson: 0, teamLeader: 0, branchManager: 0, hqManager: 0 }) };
                                                            (newOv as any)[f.key] = val;
                                                            return { ...r, overriding: newOv };
                                                          });
                                                          setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                                        }}
                                                        className="p-2 bg-white border border-indigo-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
                                                      />
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                      {pr.applyMaintenance === true && pr.maintenanceRules && pr.maintenanceRules.map((mRule, mIdx) => (
                                        <tr key={`mrule-${mIdx}`} className="bg-emerald-50/40 border-b border-emerald-100">
                                          <td colSpan={8} className="px-6 py-4">
                                            <div className="flex flex-col gap-3">
                                              <div className="bg-emerald-50 text-emerald-800 text-[10px] font-bold p-2.5 rounded-lg border border-emerald-200">
                                                ℹ️ [유지수수료 안내] 입력하신 판매수수료는 1회차 고정 지급액이 되며, 유지수수료 규칙은 2회차부터 구간을 설정할 수 있습니다. (1회차 입력 불가)
                                              </div>
                                              <div className="flex items-center justify-between">
                                                <h6 className="text-[11px] font-black text-emerald-800 flex items-center gap-1.5">
                                                  <Calendar size={12} /> {pr.productName} 유지수수료 규칙 {mIdx + 1}
                                                </h6>
                                                <div className="flex items-center gap-4">
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-emerald-600 font-bold">적용 시작일(계약일):</span>
                                                    <input type="date" value={mRule.applyStartDate || ''} onChange={(e) => {
                                                      const updated = s.productRules.map((r, i) => {
                                                        if (i !== pIdx) return r;
                                                        const newRules = [...(r.maintenanceRules || [])];
                                                        newRules[mIdx] = { ...newRules[mIdx], applyStartDate: e.target.value };
                                                        return { ...r, maintenanceRules: newRules };
                                                      });
                                                      setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                                    }} className="px-2 py-1 text-xs border border-emerald-200 rounded outline-none focus:ring-1 focus:ring-emerald-400" />
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-emerald-600 font-bold">적용 종료일(계약일):</span>
                                                    <input type="date" value={mRule.applyEndDate || ''} onChange={(e) => {
                                                      const updated = s.productRules.map((r, i) => {
                                                        if (i !== pIdx) return r;
                                                        const newRules = [...(r.maintenanceRules || [])];
                                                        newRules[mIdx] = { ...newRules[mIdx], applyEndDate: e.target.value };
                                                        return { ...r, maintenanceRules: newRules };
                                                      });
                                                      setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                                    }} className="px-2 py-1 text-xs border border-emerald-200 rounded outline-none focus:ring-1 focus:ring-emerald-400" />
                                                  </div>
                                                  <button onClick={() => {
                                                    const updated = s.productRules.map((r, i) => {
                                                      if (i !== pIdx) return r;
                                                      const newRules = [...(r.maintenanceRules || [])];
                                                      newRules.splice(mIdx, 1);
                                                      return { ...r, maintenanceRules: newRules };
                                                    });
                                                    setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                                  }} className="text-red-500 hover:text-red-700 text-[10px] font-bold">규칙 삭제</button>
                                                </div>
                                              </div>
                                              <div className="flex flex-col gap-2">
                                                {mRule.tiers.map((t, tIdx) => (
                                                  <div key={tIdx} className="flex items-center gap-3">
                                                    <input type="number" value={t.startMonth} min={2} onChange={(e) => {
                                                      const updated = s.productRules.map((r, i) => {
                                                        if (i !== pIdx) return r;
                                                        const newRules = [...(r.maintenanceRules || [])];
                                                        newRules[mIdx].tiers[tIdx].startMonth = Math.max(2, parseInt(e.target.value) || 2);
                                                        return { ...r, maintenanceRules: newRules };
                                                      });
                                                      setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                                    }} className="w-16 px-2 py-1.5 text-xs font-bold border border-emerald-200 rounded outline-none focus:ring-1 focus:ring-emerald-400" />
                                                    <span className="text-[11px] text-emerald-600 font-bold">회차 ~ </span>
                                                    <input type="number" value={t.endMonth} min={2} onChange={(e) => {
                                                      const updated = s.productRules.map((r, i) => {
                                                        if (i !== pIdx) return r;
                                                        const newRules = [...(r.maintenanceRules || [])];
                                                        newRules[mIdx].tiers[tIdx].endMonth = Math.max(2, parseInt(e.target.value) || 2);
                                                        return { ...r, maintenanceRules: newRules };
                                                      });
                                                      setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                                    }} className="w-16 px-2 py-1.5 text-xs font-bold border border-emerald-200 rounded outline-none focus:ring-1 focus:ring-emerald-400" />
                                                    <span className="text-[11px] text-emerald-600 font-bold">회차 : </span>
                                                    <input type="number" value={t.amount} onChange={(e) => {
                                                      const updated = s.productRules.map((r, i) => {
                                                        if (i !== pIdx) return r;
                                                        const newRules = [...(r.maintenanceRules || [])];
                                                        newRules[mIdx].tiers[tIdx].amount = parseInt(e.target.value) || 0;
                                                        return { ...r, maintenanceRules: newRules };
                                                      });
                                                      setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                                    }} className="w-24 px-2 py-1.5 text-xs font-bold border border-emerald-200 rounded outline-none focus:ring-1 focus:ring-emerald-400" />
                                                    <span className="text-[11px] text-emerald-600 font-bold">원</span>
                                                    {mRule.tiers.length > 1 && (
                                                      <button onClick={() => {
                                                        const updated = s.productRules.map((r, i) => {
                                                          if (i !== pIdx) return r;
                                                          const newRules = [...(r.maintenanceRules || [])];
                                                          newRules[mIdx].tiers.splice(tIdx, 1);
                                                          return { ...r, maintenanceRules: newRules };
                                                        });
                                                        setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                                      }} className="ml-2 text-red-500 hover:text-red-700 bg-red-50 p-1 rounded"><X size={14} /></button>
                                                    )}
                                                  </div>
                                                ))}
                                                <button onClick={() => {
                                                  const updated = s.productRules.map((r, i) => {
                                                    if (i !== pIdx) return r;
                                                    const newRules = [...(r.maintenanceRules || [])];
                                                    const lastEnd = newRules[mIdx].tiers.length > 0 ? newRules[mIdx].tiers[newRules[mIdx].tiers.length - 1].endMonth : 1;
                                                    newRules[mIdx].tiers.push({ startMonth: lastEnd + 1, endMonth: lastEnd + 12, amount: 0 });
                                                    return { ...r, maintenanceRules: newRules };
                                                  });
                                                  setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                                }} className="mt-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-200 self-start transition-colors">
                                                  + 구간 추가
                                                </button>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                      {pr.applyMaintenance === true && (
                                        <tr className="bg-emerald-50/20 border-b border-emerald-100">
                                          <td colSpan={8} className="px-6 py-3 text-right">
                                            <button onClick={() => {
                                              const updated = s.productRules.map((r, i) => {
                                                if (i !== pIdx) return r;
                                                const newRules = [...(r.maintenanceRules || [])];
                                                newRules.push({ id: Date.now().toString(), applyStartDate: '', applyEndDate: '', tiers: [{ startMonth: 1, endMonth: 36, amount: 0 }] });
                                                return { ...r, maintenanceRules: newRules };
                                              });
                                              setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                            }} className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded hover:bg-emerald-700 transition-colors">
                                              + 기간별 규칙 추가 (과거 정책 보존용)
                                            </button>
                                          </td>
                                        </tr>
                                      )}
                                      </React.Fragment>
                                    ))}
                                  </tbody>
                                </table>
                                {s.productRules.length === 0 && (
                                  <div className="py-12 text-center text-slate-300 text-xs font-bold">등록된 상품이 없습니다.</div>
                                )}
                              </div>

                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400">
                        <Building size={48} className="mb-4 opacity-20" />
                        <p className="font-bold">좌측 리스트에서 본부를 선택하여 설정을 시작하세요.</p>
                      </div>
                    )}
                  </div>
                </div>
                ) : settingsTab === 'global_incentive' ? (
                  <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
                    <div className="max-w-5xl mx-auto space-y-6">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold">특수 수당(글로벌 인센티브) 정책 관리</h2>
                        <button onClick={() => {
                          setGlobalIncentiveRules([{
                            id: Date.now().toString(),
                            incentiveName: '글로벌인센티브',
                            targetName: '신규 대상자',
                            payDay: 25,
                            targetHq: '',
                            targetProducts: [],
                            baseDateType: 'DELIVERY',
                            commissionPerUnit: 0,
                            minimumGuarantee: 0
                          }, ...globalIncentiveRules]);
                        }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors">
                          <Plus size={16} /> 새 규칙 추가
                        </button>
                      </div>

                      <div className="space-y-4">
                        {globalIncentiveRules.length === 0 && (
                          <div className="text-center py-12 text-slate-400 font-bold">등록된 특수 수당 규칙이 없습니다.</div>
                        )}
                        {globalIncentiveRules.map((rule, idx) => (
                          <div key={rule.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
                            <div className="flex gap-4 items-center">
                              <div className="flex-1">
                                <label className="text-xs font-bold text-slate-500">수당 종류 (예: 글로벌인센티브, 모델비, 컨설팅비)</label>
                                <input type="text" value={rule.incentiveName || '글로벌인센티브'} onChange={e => {
                                  const n = [...globalIncentiveRules]; n[idx].incentiveName = e.target.value; setGlobalIncentiveRules(n);
                                }} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 transition-all font-bold" />
                              </div>
                              <div className="flex-1">
                                <label className="text-xs font-bold text-slate-500">수급자명 (개인 본부명으로 정산됨)</label>
                                <input type="text" value={rule.targetName} onChange={e => {
                                  const n = [...globalIncentiveRules]; n[idx].targetName = e.target.value; setGlobalIncentiveRules(n);
                                }} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 transition-all font-bold" />
                              </div>
                              <div className="w-48">
                                <label className="text-xs font-bold text-slate-500">수수료 지급일</label>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-sm font-bold text-slate-700 bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">다음달</span>
                                  <div className="relative flex-1">
                                    <input type="number" min="1" max="31" value={rule.payDay} onChange={e => {
                                      const n = [...globalIncentiveRules]; n[idx].payDay = parseInt(e.target.value) || 1; setGlobalIncentiveRules(n);
                                    }} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-right pr-8 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-bold" />
                                    <span className="absolute right-3 top-2.5 text-slate-400 text-sm font-bold">일</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-4 items-start">
                              <div className="flex-1">
                                <label className="text-xs font-bold text-slate-500">대상 본부 (실적 수집 대상)</label>
                                <select value={rule.targetHq} onChange={e => {
                                  const n = [...globalIncentiveRules]; n[idx].targetHq = e.target.value; setGlobalIncentiveRules(n);
                                }} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 transition-all text-sm font-bold">
                                  <option value="ALL">전체 본부 대상</option>
                                  {hqSettings.map(h => <option key={h.id} value={h.hqName}>{h.hqName}</option>)}
                                </select>
                              </div>
                              <div className="flex-[2]">
                                <label className="text-xs font-bold text-slate-500">대상 상품 (다중선택 가능)</label>
                                <div className="mt-1 flex flex-col gap-2">
                                  <select onChange={e => {
                                    if (!e.target.value) return;
                                    const n = [...globalIncentiveRules];
                                    if (e.target.value === 'ALL') n[idx].targetProducts = ['ALL'];
                                    else {
                                      if (n[idx].targetProducts.includes('ALL')) n[idx].targetProducts = [];
                                      if (!n[idx].targetProducts.includes(e.target.value)) n[idx].targetProducts.push(e.target.value);
                                    }
                                    setGlobalIncentiveRules(n);
                                    e.target.value = '';
                                  }} className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 transition-all text-sm font-bold">
                                    <option value="">상품 추가...</option>
                                    <option value="ALL">전체 상품</option>
                                    {Array.from(new Set(hqSettings.flatMap(h => h.productRules.map(p => p.productName)))).map(p => (
                                      <option key={p} value={p}>{p}</option>
                                    ))}
                                  </select>
                                  {rule.targetProducts.includes('ALL') ? (
                                    <span className="inline-block px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">전체 상품</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      {rule.targetProducts.map(p => (
                                        <span key={p} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-100">
                                          {p}
                                          <button onClick={() => {
                                            const n = [...globalIncentiveRules];
                                            n[idx].targetProducts = n[idx].targetProducts.filter(x => x !== p);
                                            if (n[idx].targetProducts.length === 0) n[idx].targetProducts = ['ALL'];
                                            setGlobalIncentiveRules(n);
                                          }} className="hover:text-red-500 transition-colors"><X size={14} /></button>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex-1">
                                <label className="text-xs font-bold text-slate-500">결합상품 실적 기준일</label>
                                <select value={rule.baseDateType} onChange={e => {
                                  const n = [...globalIncentiveRules]; n[idx].baseDateType = e.target.value as any; setGlobalIncentiveRules(n);
                                }} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 transition-all text-sm font-bold">
                                  <option value="DELIVERY">배송완료일자 기준</option>
                                  <option value="CONTRACT">계약일자 기준</option>
                                </select>
                              </div>
                            </div>

                            <div className="flex gap-4 items-center bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 mt-2">
                              <div className="flex-1">
                                <label className="text-[10px] uppercase tracking-wider font-black text-indigo-400">건당 수수료 (원)</label>
                                <input type="number" value={rule.commissionPerUnit} onChange={e => {
                                  const n = [...globalIncentiveRules]; n[idx].commissionPerUnit = parseInt(e.target.value) || 0; setGlobalIncentiveRules(n);
                                }} className="w-full mt-1 px-3 py-2 border border-indigo-200 rounded-lg text-right font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-200 transition-all bg-white" />
                              </div>
                              <div className="flex-1">
                                <label className="text-[10px] uppercase tracking-wider font-black text-orange-400">최소 보장 금액 (원) - 없으면 0</label>
                                <input type="number" value={rule.minimumGuarantee} onChange={e => {
                                  const n = [...globalIncentiveRules]; n[idx].minimumGuarantee = parseInt(e.target.value) || 0; setGlobalIncentiveRules(n);
                                }} className="w-full mt-1 px-3 py-2 border border-orange-200 rounded-lg text-right font-black text-orange-500 outline-none focus:ring-2 focus:ring-orange-200 transition-all bg-white" />
                              </div>
                              <div className="pt-5 pl-2">
                                <button onClick={() => {
                                  if(confirm('이 규칙을 삭제하시겠습니까?')) {
                                    const n = [...globalIncentiveRules]; n.splice(idx, 1); setGlobalIncentiveRules(n);
                                  }
                                }} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" title="규칙 삭제">
                                  <X size={20} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 7. 정산서 생성 모달 */}
        <AnimatePresence>
          {isSettlementModalOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSettlementModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-100 bg-orange-50 text-orange-900 flex justify-between items-center">
                  <h3 className="text-base font-bold flex items-center gap-2"><Download size={18} /> 수수료 정산서 생성 (XLSX)</h3>
                  <button onClick={() => setIsSettlementModalOpen(false)} className="p-2 hover:bg-orange-100 rounded-full transition-colors"><X size={20} /></button>
                </div>
                <div className="p-8 flex flex-col items-center gap-6">
                  <div className="w-full">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">정산 대상 월 선택</label>
                    <input
                      type="month"
                      id="settlementMonth"
                      defaultValue={new Date().toISOString().slice(0, 7)}
                      className="w-full p-3 border border-slate-200 rounded-xl text-lg font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all font-mono"
                    />
                  </div>
                  <div className="p-4 bg-amber-50 rounded-lg text-[12px] text-amber-800 border border-amber-100 leading-relaxed italic">
                    * 수수료지급일(O열) 기준으로 데이터를 필터링하여 엑셀 파일을 생성합니다. 본부별 정산 설정이 완료되어 있어야 정확한 금액이 산출됩니다.
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02, backgroundColor: '#ea580c' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      const monthInput = document.getElementById('settlementMonth') as HTMLInputElement;
                      exportCommissionToExcel(monthInput.value);
                      setIsSettlementModalOpen(false);
                    }}
                    className="w-full py-4 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 text-base font-bold flex items-center justify-center gap-2"
                  >
                    <Download size={18} />
                    정산서(XLSX) 생성하기
                  </motion.button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          <HealthcareModal 
            isOpen={isHealthcareListModalOpen} 
            onClose={() => setIsHealthcareListModalOpen(false)} 
            data={data} 
            initialFilter={healthcareFilter}
            onRowClick={(item) => {
              setSelectedItem(item);
              setDetailSource('healthcare');
            }}
            onOpenCalendar={() => setIsHealthcareCalendarModalOpen(true)}
          />

          {isMonthlyDashboardModalOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMonthlyDashboardModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-slate-50 w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh]"
              >
                <div className="px-8 py-6 bg-white border-b border-slate-200 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-200 text-white">
                      <TrendingUp size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 leading-tight">월별 통합 정산 내역</h3>
                      <p className="text-[12px] font-bold text-slate-400 tracking-tight">월별 지급 현황 및 상품/본부별 상세 통계</p>
                    </div>
                  </div>
                  <button onClick={() => setIsMonthlyDashboardModalOpen(false)} className="p-3 hover:bg-slate-100 rounded-full text-slate-400">
                    <X size={24} />
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-8 space-y-12">
                  {monthlyStats.map(([month, stat]) => (
                    <section key={month} className="space-y-6">
                      <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
                        <div className="flex items-center gap-3">
                          <h4 className="text-2xl font-black text-slate-900">{month} 정산 Summary</h4>
                          <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-[11px] font-black rounded-lg">{stat.totalCount}건 집계됨</span>
                        </div>
                        <div className="text-3xl font-black text-indigo-600">{stat.totalAmount.toLocaleString()}원</div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* 상품별 요약 */}
                        <div className="space-y-4">
                          <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <CreditCard size={14} className="text-emerald-500" /> 상품별 지급 통계
                          </h5>
                          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase">상품명</th>
                                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase text-center">건수</th>
                                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase text-right">총액</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(Object.entries(stat.products) as [string, { count: number, amount: number }][]).map(([pName, pStat]) => (
                                  <tr key={pName} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 text-xs font-bold text-slate-700">{pName}</td>
                                    <td className="px-4 py-3 text-xs text-center text-slate-500 font-bold">{pStat.count}</td>
                                    <td className="px-4 py-3 text-xs text-right font-black text-slate-900">{pStat.amount.toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* 본부별 요약 */}
                        <div className="space-y-4">
                          <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Users size={14} className="text-blue-500" /> 본부별 지급 통계
                          </h5>
                          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase">본부명</th>
                                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase text-center">건수</th>
                                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase text-right">총액</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(Object.entries(stat.hqs) as [string, { count: number, amount: number }][]).map(([hqName, hStat]) => (
                                  <tr key={hqName} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 text-xs font-bold text-slate-700">{hqName}</td>
                                    <td className="px-4 py-3 text-xs text-center text-slate-500 font-bold">{hStat.count}</td>
                                    <td className="px-4 py-3 text-xs text-right font-black text-slate-900">{hStat.amount.toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </section>
                  ))}

                  {monthlyStats.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 opacity-20">
                      <Search size={64} className="mb-4" />
                      <p className="font-bold">정산 데이터가 없습니다.</p>
                    </div>
                  )}
                </div>

                <div className="px-8 py-5 bg-white border-t border-slate-200 flex justify-end">
                  <button onClick={() => setIsMonthlyDashboardModalOpen(false)} className="px-8 py-3 bg-slate-900 text-white rounded-xl text-sm font-black shadow-lg">확인 완료</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {isMemoHistoryModalOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMemoHistoryModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[80vh]"
              >
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-yellow-50">
                  <h3 className="text-base font-bold text-yellow-900 flex items-center gap-2">
                    <StickyNote size={18} className="text-yellow-600" /> 날짜별 메모 히스토리
                  </h3>
                  <button
                    onClick={() => setIsMemoHistoryModalOpen(false)}
                    className="p-2 hover:bg-yellow-100 rounded-full transition-colors text-yellow-800"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-6">
                  {(() => {
                    const itemsWithMemo = data.filter(item => item.memo && item.memo.trim() !== '');
                    const groupedByDate: { [key: string]: ERPDataItem[] } = {};

                    itemsWithMemo.forEach(item => {
                      const date = item.payDate || '지급일 미상';
                      if (!groupedByDate[date]) groupedByDate[date] = [];
                      groupedByDate[date].push(item);
                    });

                    const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

                    if (sortedDates.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400">
                          <StickyNote size={48} className="mb-4 opacity-20" />
                          <p className="text-sm font-bold">등록된 메모가 없습니다.</p>
                        </div>
                      );
                    }

                    return sortedDates.map(date => (
                      <div key={date} className="mb-8 last:mb-0">
                        <div className="flex items-center gap-3 mb-4 sticky top-0 bg-white py-2 z-10 border-b border-slate-50">
                          <div className="w-1.5 h-6 bg-yellow-400 rounded-full" />
                          <span className="text-lg font-black text-slate-900">{date}</span>
                          <span className="text-[11px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">
                            {groupedByDate[date].length}건의 메모
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {groupedByDate[date].map(item => (
                            <div
                              key={item.uniqueKey}
                              className="p-4 bg-yellow-50/50 border border-yellow-100 rounded-2xl hover:border-yellow-300 transition-all cursor-pointer group"
                              onClick={() => {
                                setSelectedItem(item);
                                setIsMemoHistoryModalOpen(false);
                              }}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-[12px] font-black text-slate-800">{item.memName} <span className="text-slate-400 font-normal">({item.hq})</span></span>
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-white text-slate-500 rounded border border-yellow-100">{item.prodName}</span>
                              </div>
                              <p className="text-[13px] text-yellow-800 font-medium leading-relaxed bg-white/60 p-2.5 rounded-xl border border-yellow-100 group-hover:bg-white transition-colors">
                                {item.memo}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => setIsMemoHistoryModalOpen(false)}
                    className="px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-md"
                  >
                    닫기
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* 수동 수수료 정산 모달 */}
          {isManualSettlementModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsManualSettlementModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh]"
              >
                <div className="flex items-center justify-between px-8 py-6 bg-purple-600 text-white">
                  <div className="flex items-center gap-3">
                    <Calculator size={24} className="text-purple-200" />
                    <h2 className="text-xl font-black tracking-tight">수동 수수료 정산</h2>
                  </div>
                  <button onClick={() => setIsManualSettlementModalOpen(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-slate-50 flex flex-col gap-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
                    <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">1. 지급예정내역 조회</h3>
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                        <label className="text-xs font-bold text-slate-500">지급일자</label>
                        <input type="date" list="manual-date-list" value={manualDate} onChange={e => setManualDate(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                        <datalist id="manual-date-list">
                          {Array.from(allDatesWithData).sort().reverse().map((d: any) => {
                            const formatted = d.replace(/\./g, '-');
                            return <option key={formatted} value={formatted} />;
                          })}
                        </datalist>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                        <label className="text-xs font-bold text-slate-500">본부명</label>
                        <input type="text" list="manual-hq-list" value={manualHq} onChange={e => setManualHq(e.target.value)} placeholder="본부명 입력 또는 선택" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                        <datalist id="manual-hq-list">
                          {hqSettings.map(s => <option key={s.hqName} value={s.hqName} />)}
                        </datalist>
                      </div>
                      <button onClick={loadManualData} className="px-6 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold shadow-md hover:bg-slate-900 transition-colors">
                        조회하기
                      </button>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-6">
                    <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">2. 정산 상세 내역</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500">계좌정보</label>
                        <input type="text" value={manualAccount} onChange={e => setManualAccount(e.target.value)} placeholder="은행 계좌번호 예금주" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500">정산기준</label>
                        <select value={manualBasis} onChange={e => setManualBasis(e.target.value as any)} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                          <option value="사업자">사업자 (원천세 공제 없음)</option>
                          <option value="개인">개인 (3.3% 원천세 공제)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-500">상품별 수수료 내역</label>
                        <button onClick={() => setManualProducts([...manualProducts, { id: Date.now().toString(), productName: '', salesFee: 0, promoFee: 0, count: 1 }])} className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-md hover:bg-purple-100 flex items-center gap-1">
                          <Plus size={14} /> 상품 추가
                        </button>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        {manualProducts.map((p, idx) => (
                          <div key={p.id} className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <div className="flex-1 min-w-[120px]">
                              <input type="text" list={`manual-prod-list-${p.id}`} value={p.productName} onChange={e => {
                                const val = e.target.value;
                                const n = [...manualProducts];
                                n[idx].productName = val;
                                
                                let setting = hqSettings.find(s => s.hqName === manualHq)?.productRules.find(r => r.productName === val);
                                if (!setting) {
                                  setting = hqSettings.flatMap(s => s.productRules).find(r => r.productName === val);
                                }
                                
                                if (setting) {
                                  n[idx].salesFee = parseInt(setting.salesCommission.replace(/,/g, '') || '0', 10);
                                  n[idx].promoFee = parseInt(setting.promoCommission.replace(/,/g, '') || '0', 10);
                                }
                                setManualProducts(n);
                              }} placeholder="상품명 입력 또는 선택" className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded text-sm" />
                              <datalist id={`manual-prod-list-${p.id}`}>
                                {Array.from(new Set(hqSettings.flatMap(s => s.productRules.map(r => r.productName)))).map(prod => (
                                  <option key={prod} value={prod} />
                                ))}
                              </datalist>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-slate-400 font-bold px-1">판매수수료</span>
                              <input type="number" value={p.salesFee} onChange={e => { const n = [...manualProducts]; n[idx].salesFee = Number(e.target.value); setManualProducts(n); }} className="w-28 px-3 py-1.5 bg-white border border-slate-200 rounded text-sm text-right" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-slate-400 font-bold px-1">판매촉진비</span>
                              <input type="number" value={p.promoFee} onChange={e => { const n = [...manualProducts]; n[idx].promoFee = Number(e.target.value); setManualProducts(n); }} className="w-28 px-3 py-1.5 bg-white border border-slate-200 rounded text-sm text-right" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-slate-400 font-bold px-1">구좌수</span>
                              <input type="number" value={p.count} onChange={e => { const n = [...manualProducts]; n[idx].count = Number(e.target.value); setManualProducts(n); }} className="w-20 px-3 py-1.5 bg-white border border-slate-200 rounded text-sm text-center" />
                            </div>
                            <div className="flex flex-col gap-0.5 ml-2">
                              <span className="text-[10px] text-slate-400 font-bold px-1">합계</span>
                              <span className="text-sm font-bold text-slate-700 w-24 text-right">
                                {((p.salesFee + p.promoFee) * p.count).toLocaleString()}원
                              </span>
                            </div>
                            <button onClick={() => setManualProducts(manualProducts.filter((_, i) => i !== idx))} className="ml-2 p-1.5 text-rose-400 hover:bg-rose-50 rounded-md transition-colors"><X size={16} /></button>
                          </div>
                        ))}
                        {manualProducts.length === 0 && (
                          <div className="text-center py-8 text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-lg">조회된 상품 내역이 없습니다. 상품을 추가해주세요.</div>
                        )}
                      </div>
                    </div>

                    <div className="bg-purple-50 p-6 rounded-xl border border-purple-100 flex flex-col gap-3 mt-4">
                      {(() => {
                        const totalSalesFee = manualProducts.reduce((acc, p) => acc + p.salesFee * p.count, 0);
                        const totalPromoFee = manualProducts.reduce((acc, p) => acc + p.promoFee * p.count, 0);
                        const totalCount = manualProducts.reduce((acc, p) => acc + p.count, 0);
                        const totalAmount = totalSalesFee + totalPromoFee;
                        const taxAmount = manualBasis === '개인' ? Math.floor(totalAmount * 0.033) : 0;
                        const finalAmount = totalAmount - taxAmount;

                        return (
                          <>
                            <div className="flex justify-between items-center text-sm text-purple-800">
                              <span>총 구좌수</span>
                              <span className="font-bold">{totalCount}구좌</span>
                            </div>
                            <div className="flex justify-between items-center text-sm text-purple-800">
                              <span>수수료 합계 (판매 + 촉진)</span>
                              <span className="font-bold">{totalAmount.toLocaleString()}원</span>
                            </div>
                            <div className="flex justify-between items-center text-sm text-rose-600">
                              <span>세금 공제 ({manualBasis === '개인' ? '3.3% 원천세' : '사업자 - 공제없음'})</span>
                              <span className="font-bold">-{taxAmount.toLocaleString()}원</span>
                            </div>
                            <div className="h-px bg-purple-200 my-1" />
                            <div className="flex justify-between items-center text-lg text-purple-900 font-black">
                              <span>실지급액</span>
                              <span>{finalAmount.toLocaleString()}원</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div className="px-8 py-5 bg-white border-t border-slate-200 flex justify-between items-center">
                  <button onClick={exportManualExcel} className="px-6 py-2.5 bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 rounded-xl text-sm font-bold shadow-sm transition-colors flex items-center gap-2">
                    <Download size={16} /> 엑셀 다운로드
                  </button>
                  <div className="flex gap-3">
                    <button onClick={() => setIsManualSettlementModalOpen(false)} className="px-6 py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-bold shadow-sm transition-colors">
                      취소
                    </button>
                    <button onClick={saveManualToDB} className="px-8 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-purple-700 transition-colors flex items-center gap-2">
                      {isUpdating ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                      서버 저장
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      
        {/* 10. 정산서 미리보기(웹) 모달 */}
        <AnimatePresence>
          {previewTarget && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPreviewTarget(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-800 text-white flex justify-between items-center shrink-0">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Monitor size={20} /> 
                    {previewTarget === 'ALL' ? '전사 통합 정산 보고서 미리보기' : `${previewTarget} 정산서 미리보기`}
                  </h3>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={async () => {
                        const specialAdditions: Record<string, number> = {};
                        Object.entries(settlementStats.globalIncentivesSummary || {}).forEach(([name, amt]) => {
                          if ((amt as number) > 0) specialAdditions[name] = amt as number;
                        });
                        const combinedHqs = Array.from(new Set([
                          ...Object.keys(settlementStats.hqGroups), 
                          ...Object.keys(specialAdditions),
                          ...maintenancePayouts.map(m => m.hq)
                        ]));
                        
                        const targets = previewTarget === 'ALL' ? combinedHqs : [previewTarget];
                        
                        for (let i = 0; i < targets.length; i++) {
                          const hq = targets[i];
                          const items = settlementStats.hqGroups[hq] || [];
                          const hqMaintenancePayouts = maintenancePayouts.filter(m => m.hq === hq);
                          const specialSum = specialAdditions[hq] || 0;
                          
                          if (items.length > 0 || hqMaintenancePayouts.length > 0 || specialSum > 0) {
                            await exportProfessionalSettlement(hq);
                            await new Promise(resolve => setTimeout(resolve, 300));
                          }
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <Download size={14} /> 일괄 다운로드 (Excel)
                    </button>
                    <button onClick={() => setPreviewTarget(null)} className="p-2 hover:bg-slate-700 rounded-full transition-colors"><X size={20} /></button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-8 bg-slate-50 space-y-12">
                  {(() => {
                    const specialAdditions: Record<string, number> = {};
                    Object.entries(settlementStats.globalIncentivesSummary || {}).forEach(([name, amt]) => {
                      if ((amt as number) > 0) specialAdditions[name] = amt as number;
                    });
                    const combinedHqs = Array.from(new Set([
                      ...Object.keys(settlementStats.hqGroups), 
                      ...Object.keys(specialAdditions),
                      ...maintenancePayouts.map(m => m.hq)
                    ]));
                    
                    const targets = previewTarget === 'ALL' ? combinedHqs : [previewTarget];

                    const targetSummaries = targets.map(hqName => {
                      const items = settlementStats.hqGroups[hqName] || [];
                      const hqMaintenancePayouts = maintenancePayouts.filter(m => m.hq === hqName);
                      const maintenanceSum = hqMaintenancePayouts.reduce((sum, p) => sum + p.amount, 0);
                      const specialSum = specialAdditions[hqName] || 0;

                      if (items.length === 0 && maintenanceSum === 0 && specialSum === 0) return null;

                      const setting = hqSettings.find(h => h.hqName === hqName);
                      
                      const stats = new Map<string, number>();
                      filteredData.forEach(item => {
                        if (item.status.includes('취소') || item.status.includes('해약')) return;
                        const key = `${item.hq}|${item.prodName}`;
                        stats.set(key, (stats.get(key) || 0) + 1);
                      });

                      let generalSum = 0;
                      let salesSum = 0;
                      items.forEach(item => {
                        const { totalCommission, salesComm } = calculateCommissionDetails(item, stats);
                        generalSum += totalCommission;
                        salesSum += salesComm;
                      });

                      const totalSum = generalSum + maintenanceSum + specialSum;
                      
                      let payDateDisplay = payDateFilter || '';
                      if (!payDateDisplay && items.length > 0) {
                        const { displayPayDate } = calculateCommissionDetails(items[0], stats);
                        payDateDisplay = displayPayDate;
                      } else if (!payDateDisplay && hqMaintenancePayouts.length > 0) {
                        payDateDisplay = payDateFilter;
                      } else if (!payDateDisplay) {
                        payDateDisplay = payDateFilter || new Date().toISOString().substring(0, 10).replace(/-/g, '.');
                      }

                      const targetMonth = payDateDisplay.substring(0, 7);
                      const [y, m] = targetMonth.split('.').length > 1 ? targetMonth.split('.') : targetMonth.split('-');

                      const finalPayable = setting?.settlementType?.includes('개인')
                        ? (totalSum - Math.floor(totalSum * 0.033))
                        : totalSum;

                      return {
                        hqName,
                        payDateDisplay,
                        bankName: setting?.bankName || '-',
                        accountNumber: setting?.accountNumber || '-',
                        accountHolder: setting?.accountHolder || '-',
                        settlementType: setting?.settlementType || '개인',
                        totalSum,
                        finalPayable,
                        items,
                        hqMaintenancePayouts,
                        maintenanceSum,
                        specialSum,
                        stats,
                        y,
                        m,
                        setting
                      };
                    }).filter(Boolean) as any[];

                    const renderHqDetailCard = (s: any) => {
                      const productSummary: Record<string, { count: number, sales: number, promo: number, total: number }> = {};
                      s.items.forEach((item: any) => {
                        const { totalCommission, salesComm, promoFee } = calculateCommissionDetails(item, s.stats);
                        if (!productSummary[item.prodName]) productSummary[item.prodName] = { count: 0, sales: 0, promo: 0, total: 0 };
                        productSummary[item.prodName].count += 1;
                        productSummary[item.prodName].sales += salesComm;
                        productSummary[item.prodName].promo += promoFee;
                        productSummary[item.prodName].total += totalCommission;
                      });

                      const activeTab = previewTabs[s.hqName] || 'summary';
                      const generalSum = s.totalSum - s.maintenanceSum - s.specialSum;

                      return (
                        <div className="bg-slate-50 p-5 rounded-xl border border-slate-300 shadow-inner space-y-4">
                          <div className="flex justify-between items-center">
                            <h4 className="text-sm font-black text-slate-800">[{s.hqName}] {s.y}년 {parseInt(s.m)}월 상세 정산 명세</h4>
                            <button 
                              onClick={async () => {
                                await exportProfessionalSettlement(s.hqName);
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                            >
                              <Download size={12} /> 개별 엑셀 다운로드
                            </button>
                          </div>
                          
                          <div className="flex border-b border-slate-200 gap-1.5">
                            {['summary', 'tax', 'products', 'details', 'maintenance', 'special'].map(tab => {
                              if (tab === 'maintenance' && s.hqMaintenancePayouts.length === 0) return null;
                              if (tab === 'products' && s.items.length === 0) return null;
                              if (tab === 'details' && s.items.length === 0) return null;
                              if (tab === 'special' && s.specialSum === 0) return null;
                              const tabNames: Record<string, string> = {
                                'summary': '정산내역 요약',
                                'tax': '세금계산서 요약',
                                'products': '상품별 요약',
                                'details': '일반수수료 내역',
                                'maintenance': '유지수수료 내역',
                                'special': '특수수당 내역'
                              };
                              return (
                                <button key={tab} onClick={() => setPreviewTabs(prev => ({...prev, [s.hqName]: tab}))}
                                  className={`px-3 py-1 font-bold text-xs transition-colors border-b-2 ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                  {tabNames[tab]}
                                </button>
                              );
                            })}
                          </div>

                          {activeTab === 'summary' && (
                            <div className="space-y-4 bg-white p-4 rounded-lg border border-slate-200">
                              <table className="w-full border-collapse border border-blue-900 text-[11px]">
                                <thead>
                                  <tr className="bg-blue-900 text-white font-bold text-center">
                                    <th className="border border-blue-900 p-1.5">지급일자</th>
                                    <th className="border border-blue-900 p-1.5">대상자/지사명</th>
                                    <th className="border border-blue-900 p-1.5">은행</th>
                                    <th className="border border-blue-900 p-1.5">계좌번호</th>
                                    <th className="border border-blue-900 p-1.5">예금주</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="text-center font-medium">
                                    <td className="border border-slate-300 p-1.5 font-mono">{s.payDateDisplay}</td>
                                    <td className="border border-slate-300 p-1.5 font-bold text-slate-800">{s.hqName}</td>
                                    <td className="border border-slate-300 p-1.5">{s.bankName}</td>
                                    <td className="border border-slate-300 p-1.5 font-mono">{s.accountNumber}</td>
                                    <td className="border border-slate-300 p-1.5">{s.accountHolder}</td>
                                  </tr>
                                </tbody>
                              </table>

                              <div className="font-bold text-[11px] text-slate-700">■ 정산 항목별 요약</div>
                              <table className="w-full border-collapse border border-slate-300 text-[11px]">
                                <thead>
                                  <tr className="bg-slate-100 text-slate-700 font-bold text-center">
                                    <th className="border border-slate-300 p-1.5 text-left">항목 구분</th>
                                    <th className="border border-slate-300 p-1.5">구좌수</th>
                                    <th className="border border-slate-300 p-1.5 text-right">금액(VAT포함)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {generalSum > 0 && (
                                    <tr>
                                      <td className="border border-slate-300 p-1.5 font-bold text-slate-600">일반 수수료 (일반 계약분)</td>
                                      <td className="border border-slate-300 p-1.5 text-center">{s.items.length}구좌</td>
                                      <td className="border border-slate-300 p-1.5 text-right font-bold text-slate-800">{generalSum.toLocaleString()}원</td>
                                    </tr>
                                  )}
                                  {s.maintenanceSum > 0 && (
                                    <tr>
                                      <td className="border border-slate-300 p-1.5 font-bold text-slate-600">유지 수수료 (고객관리분)</td>
                                      <td className="border border-slate-300 p-1.5 text-center">{s.hqMaintenancePayouts.length}건</td>
                                      <td className="border border-slate-300 p-1.5 text-right font-bold text-slate-800">{s.maintenanceSum.toLocaleString()}원</td>
                                    </tr>
                                  )}
                                  {s.specialSum > 0 && (
                                    <tr>
                                      <td className="border border-slate-300 p-1.5 font-bold text-slate-600">
                                        특수 수당 ({(() => {
                                          const rule = globalIncentiveRules.find(r => r.targetName === s.hqName);
                                          return rule?.incentiveName || (s.hqName === '조재윤' ? '모델비' : (s.hqName === '조민경' ? '컨설팅비' : '추가 인센티브'));
                                        })()})
                                      </td>
                                      <td className="border border-slate-300 p-1.5 text-center">
                                        {settlementStats.hqSummary[s.hqName]?.count || 0}구좌
                                      </td>
                                      <td className="border border-slate-300 p-1.5 text-right font-bold text-slate-800">{s.specialSum.toLocaleString()}원</td>
                                    </tr>
                                  )}
                                  <tr className="bg-blue-50/50 font-bold">
                                    <td className="border border-slate-300 p-1.5 text-blue-900 bg-blue-50">총합계 금액</td>
                                    <td className="border border-slate-300 p-1.5 text-center bg-blue-50">
                                      {(s.items.length + 
                                        (s.maintenanceSum > 0 ? s.hqMaintenancePayouts.length : 0) + 
                                        (s.specialSum > 0 ? (settlementStats.hqSummary[s.hqName]?.count || 0) : 0)) || '-'}
                                    </td>
                                    <td className="border border-slate-300 p-1.5 text-right text-blue-900 bg-blue-50">
                                      {s.totalSum.toLocaleString()}원
                                    </td>
                                  </tr>
                                  <tr className="bg-amber-50/40 font-bold text-orange-700">
                                    <td className="border border-slate-300 p-1.5 bg-amber-50" colSpan={2}>
                                      {s.setting?.settlementType?.includes('개인') ? '최종 실지급액 (원천세 3.3% 공제 후)' : '실지급액 (세금계산서 발행액)'}
                                    </td>
                                    <td className="border border-slate-300 p-1.5 text-right bg-amber-50">
                                      {s.finalPayable.toLocaleString()}원
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}

                          {activeTab === 'tax' && (
                            <div className="bg-white p-4 rounded-lg border border-slate-200">
                              <div className="mb-2 font-bold text-[11px] text-slate-700">■ {s.setting?.settlementType?.includes('개인') ? '원천징수 영수 요약 (3.3% 공제)' : '세금계산서 발행 요약 (부가세 포함)'}</div>
                              <table className="w-full border-collapse border border-slate-300 text-[11px] text-center">
                                <thead>
                                  <tr className="bg-blue-900 text-white font-bold">
                                    <th className="border border-slate-300 p-1.5 text-left">항목</th>
                                    <th className="border border-slate-300 p-1.5">{s.setting?.settlementType?.includes('개인') ? '정산금액' : '공급가액'}</th>
                                    <th className="border border-slate-300 p-1.5">{s.setting?.settlementType?.includes('개인') ? '원천세(3.3%)' : '부가세(10%)'}</th>
                                    <th className="border border-slate-300 p-1.5 font-bold">{s.setting?.settlementType?.includes('개인') ? '실지급액' : '합계금액(실지급액)'}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {generalSum > 0 && (
                                    <tr>
                                      <td className="border border-slate-300 p-1.5 bg-slate-50 font-bold text-left">일반 수수료 (일반 계약분)</td>
                                      <td className="border border-slate-300 p-1.5">
                                        {s.setting?.settlementType?.includes('개인') ? generalSum.toLocaleString() : Math.round(generalSum / 1.1).toLocaleString()}원
                                      </td>
                                      <td className="border border-slate-300 p-1.5 text-red-600">
                                        {s.setting?.settlementType?.includes('개인') ? Math.floor(generalSum * 0.033).toLocaleString() : (generalSum - Math.round(generalSum / 1.1)).toLocaleString()}원
                                      </td>
                                      <td className="border border-slate-300 p-1.5 font-bold text-slate-800">
                                        {s.setting?.settlementType?.includes('개인') ? (generalSum - Math.floor(generalSum * 0.033)).toLocaleString() : generalSum.toLocaleString()}원
                                      </td>
                                    </tr>
                                  )}
                                  {s.maintenanceSum > 0 && (
                                    <tr>
                                      <td className="border border-slate-300 p-1.5 bg-slate-50 font-bold text-left">유지 수수료 (고객관리분)</td>
                                      <td className="border border-slate-300 p-1.5">
                                        {s.setting?.settlementType?.includes('개인') ? s.maintenanceSum.toLocaleString() : Math.round(s.maintenanceSum / 1.1).toLocaleString()}원
                                      </td>
                                      <td className="border border-slate-300 p-1.5 text-red-600">
                                        {s.setting?.settlementType?.includes('개인') ? Math.floor(s.maintenanceSum * 0.033).toLocaleString() : (s.maintenanceSum - Math.round(s.maintenanceSum / 1.1)).toLocaleString()}원
                                      </td>
                                      <td className="border border-slate-300 p-1.5 font-bold text-slate-800">
                                        {s.setting?.settlementType?.includes('개인') ? (s.maintenanceSum - Math.floor(s.maintenanceSum * 0.033)).toLocaleString() : s.maintenanceSum.toLocaleString()}원
                                      </td>
                                    </tr>
                                  )}
                                  {s.specialSum > 0 && (
                                    <tr>
                                      <td className="border border-slate-300 p-1.5 bg-slate-50 font-bold text-left">특수 수당</td>
                                      <td className="border border-slate-300 p-1.5">
                                        {s.setting?.settlementType?.includes('개인') ? s.specialSum.toLocaleString() : Math.round(s.specialSum / 1.1).toLocaleString()}원
                                      </td>
                                      <td className="border border-slate-300 p-1.5 text-red-600">
                                        {s.setting?.settlementType?.includes('개인') ? Math.floor(s.specialSum * 0.033).toLocaleString() : (s.specialSum - Math.round(s.specialSum / 1.1)).toLocaleString()}원
                                      </td>
                                      <td className="border border-slate-300 p-1.5 font-bold text-slate-800">
                                        {s.setting?.settlementType?.includes('개인') ? (s.specialSum - Math.floor(s.specialSum * 0.033)).toLocaleString() : s.specialSum.toLocaleString()}원
                                      </td>
                                    </tr>
                                  )}
                                  <tr className="font-bold bg-blue-50/50">
                                    <td className="border border-slate-300 p-1.5 bg-blue-100 text-blue-900 text-left">총 합계액</td>
                                    <td className="border border-slate-300 p-1.5 text-blue-800">
                                      {s.setting?.settlementType?.includes('개인') ? s.totalSum.toLocaleString() : Math.round(s.totalSum / 1.1).toLocaleString()}원
                                    </td>
                                    <td className="border border-slate-300 p-1.5 text-red-600">
                                      {s.setting?.settlementType?.includes('개인') ? Math.floor(s.totalSum * 0.033).toLocaleString() : (s.totalSum - Math.round(s.totalSum / 1.1)).toLocaleString()}원
                                    </td>
                                    <td className="border border-slate-300 p-1.5 text-blue-900">
                                      {s.finalPayable.toLocaleString()}원
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}

                          {activeTab === 'products' && (
                            <div className="bg-white p-4 rounded-lg border border-slate-200">
                              <div className="mb-2 font-bold text-xs text-slate-700">■ 상품별 수수료 요약</div>
                              <table className="w-full border-collapse border border-slate-300 text-[11px]">
                                <thead>
                                  <tr className="bg-slate-100 text-slate-700 text-center font-bold">
                                    <th className="border border-slate-300 p-1.5 text-left">상품명</th>
                                    <th className="border border-slate-300 p-1.5">정산 건수</th>
                                    <th className="border border-slate-300 p-1.5">판매수수료 합</th>
                                    <th className="border border-slate-300 p-1.5">판매촉진비 합</th>
                                    <th className="border border-slate-300 p-1.5">총 수수료</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Object.entries(productSummary).map(([pName, prStat]) => (
                                    <tr key={pName} className="text-center">
                                      <td className="border border-slate-300 p-1.5 text-left font-medium">{pName}</td>
                                      <td className="border border-slate-300 p-1.5">{prStat.count}건</td>
                                      <td className="border border-slate-300 p-1.5">{prStat.sales.toLocaleString()}</td>
                                      <td className="border border-slate-300 p-1.5">{prStat.promo.toLocaleString()}</td>
                                      <td className="border border-slate-300 p-1.5 font-bold text-blue-700">{prStat.total.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {activeTab === 'details' && (
                            <div className="bg-white p-4 rounded-lg border border-slate-200">
                              <div className="mb-2 font-bold text-xs text-slate-700">■ 일반수수료 세부 내역 ({s.items.length}건)</div>
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse border border-slate-300 text-[10px] whitespace-nowrap">
                                  <thead>
                                    <tr className="bg-slate-100 text-slate-700 text-center font-bold">
                                      <th className="border border-slate-300 p-1.5">No</th>
                                      <th className="border border-slate-300 p-1.5">렌탈계약번호</th>
                                      <th className="border border-slate-300 p-1.5">계약일자</th>
                                      <th className="border border-slate-300 p-1.5">배송일자</th>
                                      <th className="border border-slate-300 p-1.5">고객명</th>
                                      <th className="border border-slate-300 p-1.5">영업사원</th>
                                      <th className="border border-slate-300 p-1.5 text-left">상품명</th>
                                      <th className="border border-slate-300 p-1.5 text-blue-700">합계금액</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {s.items.map((item: any, i: number) => {
                                      const { totalCommission } = calculateCommissionDetails(item, s.stats);
                                      return (
                                        <tr key={i} className="text-center">
                                          <td className="border border-slate-300 p-1.5">{i + 1}</td>
                                          <td className="border border-slate-300 p-1.5">{item.rentalNo || '-'}</td>
                                          <td className="border border-slate-300 p-1.5">{item.contractDate || '-'}</td>
                                          <td className="border border-slate-300 p-1.5">{item.deliveryDate || '-'}</td>
                                          <td className="border border-slate-300 p-1.5">{item.memName || '-'}</td>
                                          <td className="border border-slate-300 p-1.5">{item.empName || '-'}</td>
                                          <td className="border border-slate-300 p-1.5 text-left truncate max-w-[200px]" title={item.prodName}>{item.prodName}</td>
                                          <td className="border border-slate-300 p-1.5 font-bold text-blue-700">{totalCommission.toLocaleString()}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {activeTab === 'maintenance' && (
                            <div className="bg-white p-4 rounded-lg border border-slate-200">
                              <div className="mb-2 font-bold text-xs text-slate-700">■ 유지수수료 정산 내역 (총 {s.maintenanceSum.toLocaleString()}원)</div>
                              <table className="w-full border-collapse border border-slate-300 text-[10px] whitespace-nowrap">
                                <thead>
                                  <tr className="bg-slate-100 text-slate-700 text-center font-bold">
                                    <th className="border border-slate-300 p-1.5">No</th>
                                    <th className="border border-slate-300 p-1.5">렌탈계약번호</th>
                                    <th className="border border-slate-300 p-1.5">고객명</th>
                                    <th className="border border-slate-300 p-1.5 text-left">상품명</th>
                                    <th className="border border-slate-300 p-1.5 text-blue-700">지급회차</th>
                                    <th className="border border-slate-300 p-1.5 text-blue-700">지급금액</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.hqMaintenancePayouts.map((m: any, i: number) => (
                                    <tr key={i} className="text-center">
                                      <td className="border border-slate-300 p-1.5">{i + 1}</td>
                                      <td className="border border-slate-300 p-1.5">{m.resNo}</td>
                                      <td className="border border-slate-300 p-1.5">{m.customerName}</td>
                                      <td className="border border-slate-300 p-1.5 text-left">{m.productName}</td>
                                      <td className="border border-slate-300 p-1.5 font-bold text-blue-700">
                                        {m.fromInstallment === m.toInstallment ? `${m.fromInstallment}회차` : `${m.fromInstallment}회차 ~ ${m.toInstallment}회차`}
                                      </td>
                                      <td className="border border-slate-300 p-1.5 font-bold text-blue-700">{m.amount.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {activeTab === 'special' && (
                            <div className="bg-white p-4 rounded-lg border border-slate-200">
                              <div className="mb-2 font-bold text-xs text-slate-700">■ 특수수당 정산 내역 (총 {s.specialSum.toLocaleString()}원)</div>
                              <table className="w-full border-collapse border border-slate-300 text-[10px] whitespace-nowrap">
                                <thead>
                                  <tr className="bg-slate-100 text-slate-700 text-center font-bold">
                                    <th className="border border-slate-300 p-1.5">No</th>
                                    <th className="border border-slate-300 p-1.5">수급자명</th>
                                    <th className="border border-slate-300 p-1.5">수당 종류</th>
                                    <th className="border border-slate-300 p-1.5">지급 구좌수</th>
                                    <th className="border border-slate-300 p-1.5 text-blue-700">지급금액</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="text-center">
                                    <td className="border border-slate-300 p-1.5">1</td>
                                    <td className="border border-slate-300 p-1.5 font-bold">{s.hqName}</td>
                                    <td className="border border-slate-300 p-1.5">
                                      {(() => {
                                        const rule = globalIncentiveRules.find(r => r.targetName === s.hqName);
                                        return rule?.incentiveName || (s.hqName === '조재윤' ? '모델비' : (s.hqName === '조민경' ? '컨설팅비' : '추가 인센티브'));
                                      })()}
                                    </td>
                                    <td className="border border-slate-300 p-1.5 font-mono">
                                      {settlementStats.hqSummary[s.hqName]?.count || 0}구좌
                                    </td>
                                    <td className="border border-slate-300 p-1.5 font-bold text-blue-700">{s.specialSum.toLocaleString()}원</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-6">
                      <div className="bg-white p-6 rounded-xl border border-slate-200">
                        <h4 className="text-sm font-bold text-slate-800 mb-4">■ 전원 지급 계좌 및 정산 요약</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse border border-slate-300 text-xs text-center">
                            <thead>
                              <tr className="bg-slate-800 text-white font-bold">
                                <th className="border border-slate-300 p-2.5 w-12">상세</th>
                                <th className="border border-slate-300 p-2.5">지급일자</th>
                                <th className="border border-slate-300 p-2.5 text-left">본부 / 대상자</th>
                                <th className="border border-slate-300 p-2.5">은행</th>
                                <th className="border border-slate-300 p-2.5">계좌번호</th>
                                <th className="border border-slate-300 p-2.5">예금주</th>
                                <th className="border border-slate-300 p-2.5">정산유형</th>
                                <th className="border border-slate-300 p-2.5 text-right text-blue-300">총 정산금액</th>
                                <th className="border border-slate-300 p-2.5 text-right text-amber-300">최종 실지급액</th>
                              </tr>
                            </thead>
                            <tbody>
                              {targetSummaries.map((s) => {
                                const isExpanded = !!expandedHqs[s.hqName];
                                return (
                                  <React.Fragment key={s.hqName}>
                                    {/* 요약 행 */}
                                    <tr className={`hover:bg-slate-50 font-medium ${isExpanded ? 'bg-blue-50/20' : ''}`}>
                                      <td className="border border-slate-300 p-2">
                                        <button
                                          onClick={() => setExpandedHqs(prev => ({ ...prev, [s.hqName]: !prev[s.hqName] }))}
                                          className="p-1 hover:bg-slate-200 rounded-md transition-colors text-slate-600 flex items-center justify-center w-full"
                                          title="상세 정산 내역 토글"
                                        >
                                          {isExpanded ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-minus"><path d="M5 12h14"/></svg>
                                          ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                                          )}
                                        </button>
                                      </td>
                                      <td className="border border-slate-300 p-2 font-mono text-xs">{s.payDateDisplay}</td>
                                      <td className="border border-slate-300 p-2 text-left font-bold text-slate-800">{s.hqName}</td>
                                      <td className="border border-slate-300 p-2 text-xs">{s.bankName}</td>
                                      <td className="border border-slate-300 p-2 font-mono text-xs">{s.accountNumber}</td>
                                      <td className="border border-slate-300 p-2 text-xs">{s.accountHolder}</td>
                                      <td className="border border-slate-300 p-2 text-xs">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.settlementType.includes('개인') ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                          {s.settlementType}
                                        </span>
                                      </td>
                                      <td className="border border-slate-300 p-2 text-right font-mono font-bold text-slate-700">{s.totalSum.toLocaleString()}원</td>
                                      <td className="border border-slate-300 p-2 text-right font-mono font-bold text-blue-700 bg-blue-50/30">{s.finalPayable.toLocaleString()}원</td>
                                    </tr>

                                    {/* 상세 아코디언 펼침 행 */}
                                    {isExpanded && (
                                      <tr>
                                        <td colSpan={9} className="border border-slate-300 p-4 bg-slate-50/50">
                                          {renderHqDetailCard(s)}
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* 총 지급액 요약 바 */}
                        <div className="mt-6 p-4 bg-slate-900 text-white rounded-xl flex justify-between items-center shadow-md">
                          <div className="text-sm font-semibold text-slate-400">
                            총 정산 대상자: <span className="text-white font-bold text-base">{targetSummaries.length}명</span>
                          </div>
                          <div className="text-right flex items-center gap-6">
                            <div>
                              <span className="text-xs text-slate-400 block">총 정산금액(VAT포함)</span>
                              <span className="text-sm font-bold font-mono text-slate-200">
                                {targetSummaries.reduce((sum, s) => sum + s.totalSum, 0).toLocaleString()}원
                              </span>
                            </div>
                            <div className="border-l border-slate-700 h-8"></div>
                            <div>
                              <span className="text-xs text-amber-400 block font-bold">최종 실지급액 합계 (총 입금액)</span>
                              <span className="text-base font-black font-mono text-amber-300">
                                {targetSummaries.reduce((sum, s) => sum + s.finalPayable, 0).toLocaleString()}원
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                </div>
                
                {maintenancePayouts.length > 0 && (
                <div className="px-8 py-5 bg-white border-t border-slate-200 flex justify-between items-center shrink-0">
                  <div className="text-sm font-bold text-slate-500">
                    유지수수료 정산 대상: 총 {maintenancePayouts.length}건 (지급 완료 시 구글 시트에 이력 저장)
                  </div>
                  <button 
                    onClick={async () => {
                      if (!confirm('현재 계산된 유지수수료 지급 내역을 구글 시트에 저장하시겠습니까?\n저장 후에는 이 고객들의 해당 회차는 기지급으로 처리됩니다.')) return;
                      setIsUpdating(true);
                      try {
                        const targetMonth = payDateFilter.replace(/[^0-9]/g, '').substring(0, 6) || '미지정';
                        const rowsToSave = maintenancePayouts.map(m => [
                          m.resNo, targetMonth, m.toInstallment, m.amount, m.customerName, m.productName, `자동정산 (회차: ${m.fromInstallment}~${m.toInstallment})`
                        ]);
                        const res = await fetch('/api/sheets/maintenance/save', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ rows: rowsToSave })
                        });
                        if (!res.ok) throw new Error('Save failed');
                        setNotification({ message: '유지수수료 지급 내역이 저장되었습니다.', type: 'success' });
                        await loadMaintenanceHistory();
                      } catch (e) {
                        console.error(e);
                        alert('유지수수료 내역 저장 중 오류가 발생했습니다.');
                      } finally {
                        setIsUpdating(false);
                      }
                    }} 
                    disabled={isUpdating}
                    className="px-8 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors flex items-center gap-2">
                    {isUpdating ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                    유지수수료 지급이력 저장
                  </button>
                </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ================= 유지수수료 내역 및 세팅 모달 ================= */}
        <AnimatePresence>
          {isMaintenanceHistoryModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="max-w-6xl w-full max-h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-100"
              >
                {/* 모달 헤더 */}
                <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-600 rounded-xl shadow-lg">
                      <Calculator size={20} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">유지수수료 지급 관리</h3>
                      <p className="text-xs text-slate-400">상품별/월별 필터를 걸고 수수료 지급 완료를 체킹하세요.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* 저장 버튼 */}
                    <button
                      onClick={async () => {
                        setMHistorySyncing(true);
                        try {
                          const res = await fetch('/api/sheets/maintenance/sync', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ history: maintenanceHistory })
                          });
                          if (!res.ok) throw new Error('Sync failed');
                          setNotification({ message: '변경사항이 성공적으로 저장되었습니다.', type: 'success' });
                        } catch(e) {
                          alert('저장 중 오류가 발생했습니다.');
                        } finally {
                          setMHistorySyncing(false);
                        }
                      }}
                      disabled={mHistorySyncing}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
                    >
                      {mHistorySyncing ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                      변경사항 시트에 저장
                    </button>
                    <button 
                      onClick={() => setIsMaintenanceHistoryModalOpen(false)}
                      className="p-2 hover:bg-slate-800 rounded-full transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* 필터 및 컨텐츠 */}
                <div className="flex-1 overflow-y-auto p-6 bg-[#f8fafc] flex flex-col gap-4">
                  {(() => {
                    const uniqueContractMonths = Array.from(new Set<string>(data.map(d => (d.contractDate || d.hcRegDate || '').substring(0, 7)).filter(d => d && d.length >= 7))).sort().reverse();
                    
                    const getMaintenanceConfig = (item: any) => {
                      if (item.resNo && item.resNo.startsWith('MAX-LEE-FORCED')) {
                        return { maxInstallment: 37, getAmount: (m: number) => 10000, hasRule: true };
                      }
                      const hq = hqSettings.find(h => h.hqName === item.hq);
                      const productRule = hq?.productRules.find(p => p.productName === item.prodName);
                      let rulesToApply: any[] = [];
                      const cDate = (item.contractDate || item.hcRegDate || '').replace(/\./g, '-');

                      if (productRule?.applyMaintenance && productRule.maintenanceRules && productRule.maintenanceRules.length > 0) {
                        rulesToApply = productRule.maintenanceRules.filter((r: any) => {
                          if (r.applyStartDate && cDate < r.applyStartDate) return false;
                          if (r.applyEndDate && cDate > r.applyEndDate) return false;
                          return true;
                        });
                      }
                      
                      if (rulesToApply.length === 0) {
                        rulesToApply = maintenanceRules.filter(r => {
                          const hqMatch = r.targetHqs.includes('ALL') || r.targetHqs.includes(item.hq);
                          const prodMatch = r.targetProducts.includes('ALL') || r.targetProducts.includes(item.prodName);
                          if (!hqMatch || !prodMatch) return false;
                          if (r.applyStartDate && cDate < r.applyStartDate) return false;
                          if (r.applyEndDate && cDate > r.applyEndDate) return false;
                          return true;
                        });
                      }

                      let maxInstallment = 0;
                      rulesToApply.forEach(r => {
                        r.tiers.forEach((t: any) => {
                          if (t.endMonth > maxInstallment) maxInstallment = t.endMonth;
                        });
                      });

                      const getAmount = (month: number) => {
                        for (const r of rulesToApply) {
                          for (const t of r.tiers) {
                            if (month >= t.startMonth && month <= t.endMonth) return t.amount;
                          }
                        }
                        return 0;
                      };

                      return { maxInstallment, getAmount, hasRule: maxInstallment > 0 };
                    };

                    const maintenanceContracts = data.filter(item => {
                      const config = getMaintenanceConfig(item);
                      if (!config.hasRule) return false;

                      if (mHistoryProductFilter !== '전체' && item.prodName !== mHistoryProductFilter) return false;
                      const itemMonth = (item.contractDate || item.hcRegDate || '').substring(0, 7);
                      if (mHistoryMonthFilter !== '전체' && itemMonth !== mHistoryMonthFilter) return false;
                      
                      if (mHistorySearch) {
                        const lowerSearch = mHistorySearch.toLowerCase();
                        if (!(item.resNo || '').toLowerCase().includes(lowerSearch) &&
                            !(item.memName || '').toLowerCase().includes(lowerSearch) &&
                            !(item.prodName || '').toLowerCase().includes(lowerSearch)) return false;
                      }
                      return true;
                    });

                    // 강제 추가한 이지안 고객 2구좌 수동 주입
                    const forcedContracts = [
                      {
                        resNo: "MAX-LEE-FORCED-1",
                        memNo: "J2511010332",
                        memName: "이지안",
                        hq: "맥스",
                        branch: "맥스",
                        empName: "김학민",
                        prodName: "더좋은헬스케어580",
                        contractDate: "2025-11-19",
                        status: "가입",
                        raw: new Array(30).fill(''),
                      },
                      {
                        resNo: "MAX-LEE-FORCED-2",
                        memNo: "J2511010331",
                        memName: "이지안",
                        hq: "맥스",
                        branch: "맥스",
                        empName: "김학민",
                        prodName: "더좋은헬스케어580",
                        contractDate: "2025-11-19",
                        status: "가입",
                        raw: new Array(30).fill(''),
                      }
                    ];

                    forcedContracts.forEach(item => {
                      if (mHistoryProductFilter !== '전체' && item.prodName !== mHistoryProductFilter) return;
                      const itemMonth = (item.contractDate || '').substring(0, 7);
                      if (mHistoryMonthFilter !== '전체' && itemMonth !== mHistoryMonthFilter) return;
                      
                      if (mHistorySearch) {
                        const lowerSearch = mHistorySearch.toLowerCase();
                        if (!(item.resNo || '').toLowerCase().includes(lowerSearch) &&
                            !(item.memNo || '').toLowerCase().includes(lowerSearch) &&
                            !(item.memName || '').toLowerCase().includes(lowerSearch) &&
                            !(item.prodName || '').toLowerCase().includes(lowerSearch)) return;
                      }
                      if (!maintenanceContracts.some(c => c.resNo === item.resNo)) {
                        maintenanceContracts.push(item as any);
                      }
                    });

                    const limit = 10;
                    const totalPages = Math.max(1, Math.ceil(maintenanceContracts.length / limit));
                    const paginated = maintenanceContracts.slice((mHistoryPage - 1) * limit, mHistoryPage * limit);

                    return (
                      <>
                        <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm shrink-0 items-center">
                          <div className="flex flex-1 gap-2 flex-wrap">
                            <select
                              value={mHistoryProductFilter}
                              onChange={e => { setMHistoryProductFilter(e.target.value); setMHistoryPage(1); }}
                              className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 text-sm font-bold bg-slate-50"
                            >
                              <option value="전체">상품 전체</option>
                              {uniqueProducts.filter(p => p !== '전체').map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                            <select
                              value={mHistoryMonthFilter}
                              onChange={e => { setMHistoryMonthFilter(e.target.value); setMHistoryPage(1); }}
                              className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 text-sm font-bold bg-slate-50"
                            >
                              <option value="전체">계약월 전체</option>
                              {uniqueContractMonths.map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                            <div className="relative flex-1 min-w-[200px]">
                              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                value={mHistorySearch}
                                onChange={e => { setMHistorySearch(e.target.value); setMHistoryPage(1); }}
                                placeholder="고객명, 계약번호 검색..."
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 text-sm font-medium bg-slate-50"
                              />
                            </div>
                          </div>
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 whitespace-nowrap">
                            총 {maintenanceContracts.length}건
                          </span>
                        </div>

                        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
                          {mHistorySyncing && (
                            <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
                              <RefreshCw size={32} className="animate-spin text-indigo-600" />
                            </div>
                          )}
                          <div className="overflow-x-auto overflow-y-auto flex-1">
                            <table className="w-full text-left text-sm border-collapse min-w-[800px]">
                              <thead>
                                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 text-[11px] uppercase tracking-wider sticky top-0 z-20 shadow-sm">
                                  <th className="py-3 px-4 w-28 bg-slate-50">계약일자</th>
                                  <th className="py-3 px-4 w-24 bg-slate-50">본부명</th>
                                  <th className="py-3 px-4 w-24 bg-slate-50">영업자</th>
                                  <th className="py-3 px-4 w-28 bg-slate-50">회원번호</th>
                                  <th className="py-3 px-4 w-24 bg-slate-50">고객명</th>
                                  <th className="py-3 px-4 w-32 bg-slate-50">상품명</th>
                                  <th className="py-3 px-4 w-20 bg-slate-50 text-center">총회차</th>
                                  <th className="py-3 px-4 w-20 bg-slate-50 text-center">현재회차</th>
                                  <th className="py-3 px-4 w-16 bg-slate-50 text-center">연체</th>
                                  <th className="py-3 px-4 bg-slate-50 text-left">상태/비고</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {paginated.length > 0 ? (
                                  paginated.map((item) => {
                                    const config = getMaintenanceConfig(item);
                                    const overdueCount = parseInt(item.raw[20]) || 0;

                                    // 현재 회차 계산
                                    const filterClean = payDateFilter.replace(/[^0-9]/g, '');
                                    let currentYearMonth = filterClean.length >= 6 ? filterClean.substring(0, 6) : '';
                                    if (!currentYearMonth) {
                                      const d = new Date();
                                      currentYearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
                                    }
                                    const currentYear = parseInt(currentYearMonth.substring(0, 4));
                                    const currentMonth = parseInt(currentYearMonth.substring(4, 6));

                                    const baseDateStr = item.payDate || item.contractDate || item.deliveryDate;
                                    let currentInstallment = 0;
                                    if (baseDateStr) {
                                      const bdMatch = baseDateStr.match(/(\d{4})[-\.](\d{1,2})/);
                                      if (bdMatch) {
                                        const bdYear = parseInt(bdMatch[1]);
                                        const bdMonth = parseInt(bdMatch[2]);
                                        currentInstallment = (currentYear - bdYear) * 12 + (currentMonth - bdMonth) + 1;
                                      }
                                    }

                                    // 상태/비고 내용 판정
                                    let statusText = '';
                                    if (item.status.includes('해약')) {
                                      statusText = '❌ 해약';
                                    } else if (item.status.includes('취소')) {
                                      statusText = '❌ 취소';
                                    } else if (overdueCount > 0) {
                                      statusText = `🚨 지급중단 (연체 ${overdueCount}건)`;
                                    } else {
                                      statusText = `🟢 정상지급 대상 (${currentInstallment}회차)`;
                                    }

                                    return (
                                      <tr key={item.resNo} className="hover:bg-slate-50/50 transition-colors text-xs">
                                        <td className="py-3 px-4 font-medium text-slate-600">{item.contractDate || '-'}</td>
                                        <td className="py-3 px-4 font-bold text-slate-800">{item.hq || '-'}</td>
                                        <td className="py-3 px-4 font-medium text-slate-700">{item.empName || '-'}</td>
                                        <td className="py-3 px-4 font-mono font-bold text-slate-700">{item.memNo || '-'}</td>
                                        <td className="py-3 px-4 font-bold text-slate-900">{item.memName}</td>
                                        <td className="py-3 px-4 font-medium text-slate-600 truncate max-w-[120px]" title={item.prodName}>{item.prodName}</td>
                                        <td className="py-3 px-4 text-center font-bold text-slate-600">{config.maxInstallment}회</td>
                                        <td className="py-3 px-4 text-center font-bold text-blue-600">{currentInstallment}회차</td>
                                        <td className="py-3 px-4 text-center font-medium text-slate-600">{overdueCount}</td>
                                        <td className="py-3 px-4 text-left font-bold text-slate-700">{statusText}</td>
                                      </tr>
                                    );
                                  })
                                ) : (
                                  <tr>
                                    <td colSpan={10} className="py-8 text-center text-slate-400 font-bold">표시할 계약건이 없습니다.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          {/* 페이지네이션 */}
                          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
                            <button
                              onClick={() => setMHistoryPage(p => Math.max(1, p - 1))}
                              disabled={mHistoryPage === 1}
                              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
                            >
                              <ChevronLeft size={14} /> 이전
                            </button>
                            <span className="text-xs font-bold text-slate-500">
                              페이지 {mHistoryPage} / {totalPages}
                            </span>
                            <button
                              onClick={() => setMHistoryPage(p => Math.min(totalPages, p + 1))}
                              disabled={mHistoryPage === totalPages || totalPages === 0}
                              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
                            >
                              다음 <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ================= 유통사 대사 작업 모달 ================= */}
        <AnimatePresence>
          {isReconciliationModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
              >
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-slate-800">유통사 대사 작업</h2>
                    <div className="flex gap-1 ml-4 bg-slate-200/50 p-1 rounded-lg">
                      <button
                        onClick={() => setReconTab('NEW')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${reconTab === 'NEW' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >새 대사 작업</button>
                      <button
                        onClick={() => { setReconTab('HISTORY'); loadReconHistory(); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${reconTab === 'HISTORY' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >과거 내역 조회</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const baseData = reconTab === 'NEW' ? reconData : historyReconData.filter(d => d['정산기준일'] === selectedHistoryDate);
                        
                        const mappedData = baseData.map(d => ({
                          '정산기준일': d['정산기준일'] || '',
                          '계약ID': d['계약ID(렌탈번호)'] || d['계약ID'] || '',
                          '고객명': d['고객명'] || '',
                          '본부명': d['본부명'] || '',
                          '상품명': d['상품명'] || '',
                          '계약일자': d['계약일자'] || '',
                          '배송일자': d['내부 배송일자'] || d['배송일자'] || '',
                          '구좌수': d['구좌수'] || 0,
                          '거래처입금액': d['거래처입금액'] || 0,
                          '내부지급액합계': d['내부지급액합계'] || 0,
                          '최종순수익': d['최종순수익'] || 0,
                          '비고': d['비고'] || ''
                        }));

                        const totalGuzwa = mappedData.reduce((acc, row) => acc + Number(row['구좌수'] || 0), 0);
                        const totalExt = mappedData.reduce((acc, row) => acc + Number(row['거래처입금액'] || 0), 0);
                        const totalInt = mappedData.reduce((acc, row) => acc + Number(row['내부지급액합계'] || 0), 0);
                        const totalNet = mappedData.reduce((acc, row) => acc + Number(row['최종순수익'] || 0), 0);

                        const sumRow = {
                          '정산기준일': '',
                          '계약ID': '총계',
                          '고객명': '',
                          '본부명': '',
                          '상품명': '',
                          '계약일자': '',
                          '배송일자': '',
                          '구좌수': totalGuzwa,
                          '거래처입금액': totalExt,
                          '내부지급액합계': totalInt,
                          '최종순수익': totalNet,
                          '비고': ''
                        };

                        const exportData = [...mappedData, sumRow];
                        const ws = XLSX.utils.json_to_sheet(exportData);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");
                        XLSX.writeFile(wb, `유통사_대사결과_${reconTab === 'NEW' ? reconDate : selectedHistoryDate}.xlsx`);
                      }}
                      disabled={(reconTab === 'NEW' ? reconData.length : historyReconData.filter(d => d['정산기준일'] === selectedHistoryDate).length) === 0}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-100 disabled:opacity-50"
                    >
                      <Download size={14} /> 엑셀 다운로드
                    </button>
                    <button onClick={() => setIsReconciliationModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors"><X size={20} /></button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-4 bg-[#f8fafc]">
                  {reconTab === 'NEW' ? (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-end gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-600 mb-1">정산기준일 설정 (YYYY-MM-DD)</label>
                          <button
                            onClick={() => {
                              const uniqueDates = Array.from(new Set(data.map(d => d.payDate).filter(Boolean))).sort().reverse();
                              if (uniqueDates.length > 0) {
                                setReconCalendarViewDate(reconDate ? new Date(reconDate.replace(/\./g, '-')) : new Date((uniqueDates[0] as string).replace(/\./g, '-')));
                              } else {
                                setReconCalendarViewDate(new Date());
                              }
                              setIsReconCalendarModalOpen(true);
                            }}
                            className="w-[200px] border border-slate-300 rounded p-2 text-sm bg-white text-left text-slate-700 flex justify-between items-center"
                          >
                            <span>{reconDate || '선택하세요'}</span>
                            <Calendar size={16} className="text-slate-400" />
                          </button>
                        </div>
                        <div className="flex-1 flex flex-col justify-end">
                          <button
                            onClick={fetchEnexData}
                            disabled={!reconDate || reconLoading}
                            className="w-full px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 disabled:opacity-50 border border-slate-300"
                          >
                            {reconLoading ? '불러오는 중...' : '에넥스수수료 데이터 불러오기'}
                          </button>
                        </div>
                        <div>
                          <button
                            onClick={saveReconData}
                            disabled={reconData.length === 0 || reconLoading}
                            className="px-6 py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
                          >
                            <Save size={16} /> 저장하기
                          </button>
                        </div>
                      </div>

                      {reconData.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex-1 flex flex-col min-h-[400px]">
                          <div className="overflow-auto flex-1">
                            <table className="w-full text-left border-collapse min-w-max">
                              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-[11px] text-slate-500 uppercase tracking-wider">
                                <tr>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">정산기준일</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">계약ID</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">고객명</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">본부명</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">상품명</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">계약일자</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">배송일자</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200 text-center">구좌수</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200 text-right">거래처입금액</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200 text-right">내부지급액합계</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200 text-right">최종순수익</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200 text-center">비고</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {reconData.map((row, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50 transition-colors text-xs">
                                    <td className="py-2 px-4 text-slate-600 font-mono">{row['정산기준일']}</td>
                                    <td className="py-2 px-4 text-slate-700 font-bold font-mono">{row['계약ID(렌탈번호)']}</td>
                                    <td className="py-2 px-4 text-slate-800 font-bold">{row['고객명']}</td>
                                    <td className="py-2 px-4 text-slate-600">{row['본부명']}</td>
                                    <td className="py-2 px-4 text-slate-600 truncate max-w-[150px]" title={row['상품명']}>{row['상품명']}</td>
                                    <td className="py-2 px-4 text-slate-600 font-mono">{row['계약일자']}</td>
                                    <td className="py-2 px-4 text-slate-600 font-mono">{row['내부 배송일자']}</td>
                                    <td className="py-2 px-4 text-center font-bold text-blue-600">{row['구좌수']}</td>
                                    <td className="py-2 px-4 text-right font-mono font-bold text-slate-800">{Number(row['거래처입금액']).toLocaleString()}</td>
                                    <td className="py-2 px-4 text-right font-mono font-bold text-indigo-600">{Number(row['내부지급액합계']).toLocaleString()}</td>
                                    <td className="py-2 px-4 text-right font-mono font-bold text-emerald-600">{Number(row['최종순수익']).toLocaleString()}</td>
                                    <td className="py-2 px-4 text-center">
                                      {row['비고'] === '정상' ? (
                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">{row['비고']}</span>
                                      ) : (
                                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">{row['비고']}</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-slate-50 font-bold text-slate-800 border-t-2 border-slate-200">
                                <tr>
                                  <td colSpan={7} className="py-3 px-4 text-center">총계</td>
                                  <td className="py-3 px-4 text-center text-blue-600">{reconData.reduce((acc, row) => acc + Number(row['구좌수'] || 0), 0).toLocaleString()}</td>
                                  <td className="py-3 px-4 text-right text-slate-800">{reconData.reduce((acc, row) => acc + Number(row['거래처입금액'] || 0), 0).toLocaleString()}</td>
                                  <td className="py-3 px-4 text-right text-indigo-600">{reconData.reduce((acc, row) => acc + Number(row['내부지급액합계'] || 0), 0).toLocaleString()}</td>
                                  <td className="py-3 px-4 text-right text-emerald-600">{reconData.reduce((acc, row) => acc + Number(row['최종순수익'] || 0), 0).toLocaleString()}</td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 h-full">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex gap-4 items-center">
                        <label className="text-sm font-bold text-slate-600">조회할 정산기준일</label>
                        <select
                          value={selectedHistoryDate}
                          onChange={(e) => setSelectedHistoryDate(e.target.value)}
                          className="border border-slate-300 rounded p-2 text-sm min-w-[150px] font-bold"
                        >
                          {reconHistoryDates.map(date => (
                            <option key={date} value={date}>{date}</option>
                          ))}
                        </select>
                        <div className="ml-auto text-sm bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                          총 거래처입금액:{' '}
                          <span className="font-bold text-indigo-600 text-lg">
                            {historyReconData.filter(d => d['정산기준일'] === selectedHistoryDate).reduce((acc, cur) => acc + Number(cur['거래처입금액'] || 0), 0).toLocaleString()}원
                          </span>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex-1 flex flex-col min-h-[400px]">
                        {reconLoading ? (
                          <div className="flex-1 flex items-center justify-center p-8">
                            <RefreshCw className="animate-spin text-slate-400" size={32} />
                          </div>
                        ) : (
                          <div className="overflow-auto flex-1">
                            <table className="w-full text-left border-collapse min-w-max">
                              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-[11px] text-slate-500 uppercase tracking-wider">
                                <tr>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">정산기준일</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">계약ID</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">고객명</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">본부명</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">상품명</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">계약일자</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200">배송일자</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200 text-center">구좌수</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200 text-right">거래처입금액</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200 text-right">내부지급액합계</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200 text-right">최종순수익</th>
                                  <th className="py-3 px-4 font-bold border-b border-slate-200 text-center">비고</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {historyReconData.filter(d => d['정산기준일'] === selectedHistoryDate).map((row, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50 transition-colors text-xs">
                                    <td className="py-2 px-4 text-slate-600 font-mono">{row['정산기준일']}</td>
                                    <td className="py-2 px-4 text-slate-700 font-bold font-mono">{row['계약ID']}</td>
                                    <td className="py-2 px-4 text-slate-800 font-bold">{row['고객명']}</td>
                                    <td className="py-2 px-4 text-slate-600">{row['본부명']}</td>
                                    <td className="py-2 px-4 text-slate-600 truncate max-w-[150px]" title={row['상품명']}>{row['상품명']}</td>
                                    <td className="py-2 px-4 text-slate-600 font-mono">{row['계약일자']}</td>
                                    <td className="py-2 px-4 text-slate-600 font-mono">{row['배송일자']}</td>
                                    <td className="py-2 px-4 text-center font-bold text-blue-600">{row['구좌수']}</td>
                                    <td className="py-2 px-4 text-right font-mono font-bold text-slate-800">{Number(row['거래처입금액']).toLocaleString()}</td>
                                    <td className="py-2 px-4 text-right font-mono font-bold text-indigo-600">{Number(row['내부지급액합계']).toLocaleString()}</td>
                                    <td className="py-2 px-4 text-right font-mono font-bold text-emerald-600">{Number(row['최종순수익']).toLocaleString()}</td>
                                    <td className={`py-2 px-4 text-center font-bold ${row['비고'] === '정상' ? 'text-emerald-600' : 'text-rose-600'}`}>{row['비고']}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-slate-50 font-bold text-slate-800 border-t-2 border-slate-200">
                                <tr>
                                  <td colSpan={7} className="py-3 px-4 text-center">총계</td>
                                  <td className="py-3 px-4 text-center text-blue-600">{historyReconData.filter(d => d['정산기준일'] === selectedHistoryDate).reduce((acc, row) => acc + Number(row['구좌수'] || 0), 0).toLocaleString()}</td>
                                  <td className="py-3 px-4 text-right text-slate-800">{historyReconData.filter(d => d['정산기준일'] === selectedHistoryDate).reduce((acc, row) => acc + Number(row['거래처입금액'] || 0), 0).toLocaleString()}</td>
                                  <td className="py-3 px-4 text-right text-indigo-600">{historyReconData.filter(d => d['정산기준일'] === selectedHistoryDate).reduce((acc, row) => acc + Number(row['내부지급액합계'] || 0), 0).toLocaleString()}</td>
                                  <td className="py-3 px-4 text-right text-emerald-600">{historyReconData.filter(d => d['정산기준일'] === selectedHistoryDate).reduce((acc, row) => acc + Number(row['최종순수익'] || 0), 0).toLocaleString()}</td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isReconCalendarModalOpen && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsReconCalendarModalOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="p-6">
                  {(() => {
                    const year = reconCalendarViewDate.getFullYear();
                    const month = reconCalendarViewDate.getMonth();

                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const firstDay = new Date(year, month, 1).getDay();
                    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

                    const prevMonthLastDay = new Date(year, month, 0).getDate();
                    const prevMonthDays = Array.from({ length: firstDay }, (_, i) => prevMonthLastDay - firstDay + i + 1);

                    const allDatesWithData = new Set(data.map(d => d.payDate).filter(Boolean));

                    return (
                      <>
                        <div className="flex justify-between items-center mb-6">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Select Payment Date</span>
                            <h3 className="text-xl font-black text-slate-900">{year}년 {month + 1}월</h3>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setReconCalendarViewDate(new Date(year, month - 1, 1))}
                              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                            >
                              <ChevronRight size={20} className="rotate-180" />
                            </button>
                            <button
                              onClick={() => setReconCalendarViewDate(new Date(year, month + 1, 1))}
                              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                            >
                              <ChevronRight size={20} />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-center mb-2">
                          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                            <span key={d} className={`text-[10px] font-bold ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-slate-400'}`}>
                              {d}
                            </span>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {prevMonthDays.map(d => (
                            <div key={`prev-${d}`} className="h-10 flex items-center justify-center text-[13px] text-slate-200">
                              {d}
                            </div>
                          ))}
                          {days.map(d => {
                            const dateStr = `${year}.${String(month + 1).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
                            const hasData = allDatesWithData.has(dateStr);
                            const isSelected = reconDate === dateStr;

                            return (
                              <motion.button
                                key={d}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => {
                                  if (hasData) {
                                    setReconDate(dateStr);
                                    setIsReconCalendarModalOpen(false);
                                  }
                                }}
                                className={`
                                  h-10 rounded-xl flex flex-col items-center justify-center text-[13px] relative transition-all
                                  ${isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 font-black' :
                                    hasData ? 'text-slate-900 font-black hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-50 cursor-not-allowed opacity-50'}
                                `}
                              >
                                {d}
                                {hasData && !isSelected && (
                                  <div className="absolute bottom-1.5 w-1 h-1 bg-blue-500 rounded-full" />
                                )}
                              </motion.button>
                            );
                          })}
                        </div>
                        <div className="mt-6 flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                            <span>점 표시: 데이터가 있는 날짜 (검정색)</span>
                          </div>
                          <button
                            onClick={() => {
                              setReconDate('');
                              setIsReconCalendarModalOpen(false);
                            }}
                            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[13px] font-bold transition-colors"
                          >
                            선택 해제
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

</div>
    </div>
  );
};

const DetailItem = ({ label, value, className = "" }: { label: string, value: any, className?: string }) => (
  <div className={`p-3 bg-slate-50 border border-slate-100 rounded-lg ${className}`}>
    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">{label}</div>
    <div className="text-[13px] text-slate-700 font-medium truncate">{value || '-'}</div>
  </div>
);

export default ERP_Dashboard;

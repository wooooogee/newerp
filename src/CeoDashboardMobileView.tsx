import React, { useState, useMemo, useEffect } from 'react';
import { 
  Building, Calendar, TrendingUp, Award, DollarSign, Package, 
  Users, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, 
  RefreshCw, LogOut, KeyRound, Truck, BarChart3, PieChart, ShieldAlert, 
  Store, UserCheck, ArrowUpRight, Layers, FileSpreadsheet, ChevronDown, ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChangePasswordModal } from './ChangePasswordModal';
import { loadSuppliersFromStorage, SupplierItem } from './SupplierManagementModal';
import { checkInstallCertEligibility, getManualOrderInfo, ManualOrderInfo, mergeManualOrderStores } from './manualOrderUtils';

interface CeoDashboardMobileViewProps {
  currentUser: {
    username: string;
    role: string;
    orgName: string;
    orgs?: { role: string; orgName: string; }[];
  };
  data: any[];
  hqSettings: any[];
  globalIncentiveRules: any[];
  divisionSettings: any[];
  calculateCommissionDetails: (item: any, countMap: Map<string, number>) => any;
  loading: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

// 원화 포맷 헬퍼
const formatWon = (val: number): string => {
  return new Intl.NumberFormat('ko-KR').format(Math.round(val || 0));
};

// 날짜에서 YYYY-MM 추출 헬퍼
const getYearMonth = (dateStr: any): string => {
  if (!dateStr) return '';
  const s = String(dateStr).trim();
  const m = s.match(/(\d{4})[-./](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}`;
  }
  return '';
};

// 전월 YYYY-MM 구하기
const getPrevMonthStr = (ym: string): string => {
  if (!ym || !ym.includes('-')) return '';
  const [yStr, mStr] = ym.split('-');
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10) - 1;
  if (m === 0) {
    y -= 1;
    m = 12;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
};

// 익월 YYYY-MM 구하기
const getNextMonthStr = (ym: string): string => {
  if (!ym || !ym.includes('-')) return '';
  const [yStr, mStr] = ym.split('-');
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10) + 1;
  if (m === 13) {
    y += 1;
    m = 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
};

export const CeoDashboardMobileView: React.FC<CeoDashboardMobileViewProps> = ({
  currentUser,
  data = [],
  hqSettings = [],
  globalIncentiveRules = [],
  divisionSettings = [],
  calculateCommissionDetails,
  loading,
  onRefresh,
  onLogout
}) => {
  // 메인 시트(탭) 상태: 'overview' (핵심현황) | 'ranking' (Top 10 순위) | 'settlement' (수수료 및 공급사 정산)
  const [activeTab, setActiveTab] = useState<'overview' | 'ranking' | 'settlement'>('overview');

  // 기준월 선택 상태 (기본값: 오늘 기준 YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  // Top 10 서브탭 상태: 'product' | 'hq' | 'branch' | 'salesperson'
  const [rankingCategory, setRankingCategory] = useState<'product' | 'hq' | 'branch' | 'salesperson'>('product');

  // 정산 뷰 서브탭: 'hq_commission' (본부별 수수료) | 'supplier_price' (공급사 물품대금) | 'supply_comm' (공급수수료)
  const [settlementSubTab, setSettlementSubTab] = useState<'hq_commission' | 'supplier_price' | 'supply_comm'>('hq_commission');

  // 비밀번호 변경 모달 상태
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // 공급사 목록 로드 (로컬스토리지)
  const [suppliers, setSuppliers] = useState<SupplierItem[]>(() => loadSuppliersFromStorage());

  // 수기발주 설정 로드
  const [manualOrderStores, setManualOrderStores] = useState<Record<string, ManualOrderInfo>>(() => {
    try {
      const saved = localStorage.getItem('erp_manual_orders_saved_store_v1');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    setSuppliers(loadSuppliersFromStorage());
  }, [activeTab]);

  // 기준월 전월 산출 (수수료 및 정산 실적 기준월)
  const perfMonth = useMemo(() => getPrevMonthStr(selectedMonth), [selectedMonth]);

  // 월 이동 헬퍼
  const handlePrevMonth = () => {
    setSelectedMonth(prev => getPrevMonthStr(prev));
  };
  const handleNextMonth = () => {
    setSelectedMonth(prev => getNextMonthStr(prev));
  };

  // -------------------------------------------------------------
  // [1] 시트 1: 핵심 현황 집계 (선택된 월 기준)
  // -------------------------------------------------------------
  const overviewStats = useMemo(() => {
    // 1) 해당월 총 계약 (계약일자 contractDate 기준)
    const monthContracts = data.filter(item => {
      const ym = getYearMonth(item.contractDate);
      return ym === selectedMonth;
    });

    const totalAccounts = monthContracts.length; // 전체 구좌수
    const totalContractNos = new Set(
      monthContracts.map(item => item.rentalNo ? String(item.rentalNo).trim() : item.uniqueKey).filter(Boolean)
    ).size; // 고유 계약건수

    // 2) 정상 가입 구좌수
    const activeContracts = monthContracts.filter(item => {
      const st = String(item.status || '').trim();
      return !st.includes('취소') && !st.includes('해약') && !st.includes('반품');
    });
    const activeAccounts = activeContracts.length;

    // 3) 배송완료 구좌수 (해당월 계약건 중 배송완료된 건)
    const deliveredInMonthContracts = activeContracts.filter(item => {
      const delSt = String(item.deliveryStatus || '').trim();
      const delDate = String(item.deliveryDate || '').trim();
      return delSt.includes('완료') || (delDate !== '' && delDate !== '-');
    });
    const deliveredAccounts = deliveredInMonthContracts.length;
    const deliveredContractNos = new Set(
      deliveredInMonthContracts.map(item => item.rentalNo ? String(item.rentalNo).trim() : item.uniqueKey).filter(Boolean)
    ).size;

    // 추가: 해당월 실제 배송완료된 전체 구좌수 (배송일자 deliveryDate가 해당월인 건)
    const actualDeliveryAccounts = data.filter(item => {
      const st = String(item.status || '').trim();
      if (st.includes('취소') || st.includes('해약')) return false;
      const delYm = getYearMonth(item.deliveryDate);
      const isDel = String(item.deliveryStatus || '').includes('완료') || (item.deliveryDate && item.deliveryDate !== '-');
      return isDel && delYm === selectedMonth;
    }).length;

    // 4) 취소 및 해약 건수 (구좌수)
    const cancelledContracts = monthContracts.filter(item => {
      const st = String(item.status || '').trim();
      return st.includes('취소') || st.includes('해약') || st.includes('반품');
    });
    const cancelledAccounts = cancelledContracts.length;
    const cancelledContractNos = new Set(
      cancelledContracts.map(item => item.rentalNo ? String(item.rentalNo).trim() : item.uniqueKey).filter(Boolean)
    ).size;

    // 비율 계산
    const deliveryRate = totalAccounts > 0 ? Math.round((deliveredAccounts / totalAccounts) * 100) : 0;
    const cancelRate = totalAccounts > 0 ? Math.round((cancelledAccounts / totalAccounts) * 100) : 0;

    return {
      totalAccounts,
      totalContractNos,
      activeAccounts,
      deliveredAccounts,
      deliveredContractNos,
      actualDeliveryAccounts,
      cancelledAccounts,
      cancelledContractNos,
      deliveryRate,
      cancelRate,
      monthContracts
    };
  }, [data, selectedMonth]);

  // -------------------------------------------------------------
  // [1-2] 최근 5일간 신계약 추이 (금일까지 표기)
  // -------------------------------------------------------------
  const recent5DaysData = useMemo(() => {
    // 오늘 날짜 구하기
    const today = new Date();
    const days: { dateStr: string; label: string; isToday: boolean; count: number }[] = [];

    // 최근 5일 날짜 생성 (4일 전부터 오늘까지)
    for (let i = 4; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      const label = `${parseInt(m)}/${parseInt(day)}`;

      days.push({
        dateStr,
        label,
        isToday: i === 0,
        count: 0
      });
    }

    // 각 날짜별 신계약 구좌수 집계 (취소/해약 포함하지 않는 정상 계약 기준 or 전체 신계약)
    data.forEach(item => {
      if (!item.contractDate) return;
      const ym = item.contractDate.replace(/[./]/g, '-');
      const targetDay = days.find(d => ym.startsWith(d.dateStr));
      if (targetDay) {
        targetDay.count += 1;
      }
    });

    const maxCount = Math.max(...days.map(d => d.count), 1);
    const total5Days = days.reduce((sum, d) => sum + d.count, 0);
    const avg5Days = (total5Days / 5).toFixed(1);

    return {
      days,
      maxCount,
      total5Days,
      avg5Days
    };
  }, [data]);

  // -------------------------------------------------------------
  // [2] 시트 2: 순위 분석 (Top 10)
  // -------------------------------------------------------------
  const top10Rankings = useMemo(() => {
    // 선택된 월의 계약 데이터 기준 (취소/해약 제외)
    const validItems = (overviewStats.monthContracts || []).filter(item => {
      const st = String(item.status || '').trim();
      return !st.includes('취소') && !st.includes('해약');
    });

    const calcRankList = (keyExtractor: (item: any) => string) => {
      const map = new Map<string, { name: string; accounts: number; contractNos: Set<string> }>();
      validItems.forEach(item => {
        const name = keyExtractor(item)?.trim() || '미지정';
        if (!name || name === '-') return;
        const entry = map.get(name) || { name, accounts: 0, contractNos: new Set<string>() };
        entry.accounts += 1;
        if (item.rentalNo) entry.contractNos.add(String(item.rentalNo).trim());
        map.set(name, entry);
      });

      const list = Array.from(map.values())
        .sort((a, b) => b.accounts - a.accounts)
        .slice(0, 10);

      const totalValid = validItems.length || 1;
      return list.map(item => ({
        ...item,
        contractCount: item.contractNos.size || item.accounts,
        share: Math.round((item.accounts / totalValid) * 100)
      }));
    };

    return {
      products: calcRankList(item => item.rentalProd || item.prodName || '기타상품'),
      hqs: calcRankList(item => item.hq || '기타본부'),
      branches: calcRankList(item => item.branch || '기타지사'),
      salespersons: calcRankList(item => item.empName || '기타사원'),
      totalValidAccounts: validItems.length
    };
  }, [overviewStats.monthContracts]);

  // -------------------------------------------------------------
  // [3] 시트 3: 수수료 및 정산 내역 집계
  // 기준: 10월이면 전월(9월 1일 ~ 말일 배송완료) 기준으로 10월 25일 지급 대상
  // -------------------------------------------------------------
  const settlementData = useMemo(() => {
    // 1) 전월(perfMonth) 배송완료 건 추출 (취소/해약 제외)
    const deliveredItems = data.filter(item => {
      const st = String(item.status || '').trim();
      if (st.includes('취소') || st.includes('해약')) return false;

      const isDel = String(item.deliveryStatus || '').includes('완료') || (item.deliveryDate && item.deliveryDate !== '-' && item.deliveryDate.trim() !== '');
      if (!isDel) return false;

      const delYm = getYearMonth(item.deliveryDate);
      return delYm === perfMonth;
    });

    // 본부별 카운트 맵 구축 (calculateCommissionDetails 지원용)
    const hqCountMap = new Map<string, number>();
    deliveredItems.forEach(item => {
      const hq = item.hq || '';
      hqCountMap.set(`${hq}|__ALL__|${selectedMonth}`, (hqCountMap.get(`${hq}|__ALL__|${selectedMonth}`) || 0) + 1);
      hqCountMap.set(`${hq}|${item.prodName}|${selectedMonth}`, (hqCountMap.get(`${hq}|${item.prodName}|${selectedMonth}`) || 0) + 1);
    });

    // 2) 본부별 수수료 집계
    const hqMap = new Map<string, {
      hqName: string;
      accounts: number;
      salesComm: number;
      specialComm: number;
      totalPayable: number;
      bankName: string;
      accountNumber: string;
      accountHolder: string;
    }>();

    // 본부 설정 초기화
    hqSettings.forEach(s => {
      if (!s.hqName) return;
      hqMap.set(s.hqName, {
        hqName: s.hqName,
        accounts: 0,
        salesComm: 0,
        specialComm: 0,
        totalPayable: 0,
        bankName: s.bankName || '-',
        accountNumber: s.accountNumber || '-',
        accountHolder: s.accountHolder || '-'
      });
    });

    // 판매 수수료 계산
    deliveredItems.forEach(item => {
      const hq = item.hq || '기타본부';
      let entry = hqMap.get(hq);
      if (!entry) {
        entry = {
          hqName: hq,
          accounts: 0,
          salesComm: 0,
          specialComm: 0,
          totalPayable: 0,
          bankName: '-',
          accountNumber: '-',
          accountHolder: '-'
        };
        hqMap.set(hq, entry);
      }

      entry.accounts += 1;
      let comm = 0;
      if (calculateCommissionDetails) {
        const res = calculateCommissionDetails(item, hqCountMap);
        comm = res.finalPayable || res.totalCommission || 0;
      }
      entry.salesComm += comm;
      entry.totalPayable += comm;
    });

    // 3) 본부 귀속 공급수수료(특수수당) 가산
    // 규칙: globalIncentiveRules 중 본부 몫 (targetName === 'SELF_HQ' 등) 매칭
    const specialRules = globalIncentiveRules.filter(r => {
      return !r.targetName || r.targetName === 'SELF_HQ' || r.targetName === '판매본부' || r.targetName === '해당본부' || r.targetName === '본부';
    });

    specialRules.forEach(rule => {
      deliveredItems.forEach(item => {
        const hq = item.hq;
        if (!hq || !hqMap.has(hq)) return;

        // 상품 일치 검사
        if (rule.targetProducts && !rule.targetProducts.includes('ALL')) {
          const normP = (item.prodName || '').replace(/[\s()]/g, '').toLowerCase();
          if (!rule.targetProducts.some((tp: string) => normP.includes(tp.replace(/[\s()]/g, '').toLowerCase()))) return;
        }

        const unitComm = rule.commissionPerUnit || 0;
        if (unitComm > 0) {
          const entry = hqMap.get(hq)!;
          entry.specialComm += unitComm;
          entry.totalPayable += unitComm;
        }
      });
    });

    const hqList = Array.from(hqMap.values())
      .filter(h => h.accounts > 0 || h.totalPayable > 0)
      .sort((a, b) => b.totalPayable - a.totalPayable);

    const totalHqPayout = hqList.reduce((sum, h) => sum + h.totalPayable, 0);
    const totalHqAccounts = hqList.reduce((sum, h) => sum + h.accounts, 0);

    // 4) 공급사별 물품대금 및 공급수수료 집계
    const supplierMap = new Map<string, {
      supplierId: string;
      supplierName: string;
      accounts: number;
      totalSupplyPrice: number;
      totalCommission: number;
      settlementDay: number;
      bankName: string;
      accountNumber: string;
      accountHolder: string;
    }>();

    // 공급사 초기화
    suppliers.forEach(s => {
      supplierMap.set(s.id, {
        supplierId: s.id,
        supplierName: s.name,
        accounts: 0,
        totalSupplyPrice: 0,
        totalCommission: 0,
        settlementDay: s.settlementDay || 31,
        bankName: s.bankName || '-',
        accountNumber: s.accountNumber || '-',
        accountHolder: s.accountHolder || '-'
      });
    });

    deliveredItems.forEach(item => {
      const prodText = `${item.rentalProd || ''} ${item.prodName || ''}`.toLowerCase();
      for (const supp of suppliers) {
        if (!supp.isActive) continue;
        for (const p of supp.products || []) {
          const kw = (p.productKeyword || '').trim().toLowerCase();
          if (kw && prodText.includes(kw)) {
            const entry = supplierMap.get(supp.id);
            if (entry) {
              entry.accounts += 1;
              entry.totalSupplyPrice += (p.supplyPrice || 0);
              entry.totalCommission += (p.supplyCommission || 0);
            }
            return;
          }
        }
      }
    });

    const supplierList = Array.from(supplierMap.values())
      .filter(s => s.accounts > 0 || s.totalSupplyPrice > 0)
      .sort((a, b) => b.totalSupplyPrice - a.totalSupplyPrice);

    const totalSupplierPrice = supplierList.reduce((sum, s) => sum + s.totalSupplyPrice, 0);
    const totalSupplierCommission = supplierList.reduce((sum, s) => sum + s.totalCommission, 0);
    const totalSupplierAccounts = supplierList.reduce((sum, s) => sum + s.accounts, 0);

    return {
      perfMonth,
      deliveredItemsCount: deliveredItems.length,
      hqList,
      totalHqPayout,
      totalHqAccounts,
      supplierList,
      totalSupplierPrice,
      totalSupplierCommission,
      totalSupplierAccounts
    };
  }, [data, selectedMonth, perfMonth, hqSettings, globalIncentiveRules, suppliers, calculateCommissionDetails]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-slate-100 font-sans pb-24 selection:bg-blue-600 selection:text-white">
      {/* 1. 상단 글로벌 헤더 */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <BarChart3 size={18} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-extrabold text-white tracking-tight">대표이사 대시보드</span>
              <span className="text-[10px] bg-blue-500/20 text-blue-400 font-black px-1.5 py-0.5 rounded border border-blue-500/30">
                경영모바일
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">실시간 전사 영업 및 정산 현황</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition active:scale-95 border border-slate-700/50"
            title="새로고침"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-blue-400' : ''} />
          </button>
          <button
            onClick={() => setIsPasswordModalOpen(true)}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition active:scale-95 border border-slate-700/50"
            title="비밀번호 변경"
          >
            <KeyRound size={15} />
          </button>
          <button
            onClick={onLogout}
            className="p-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition active:scale-95 border border-rose-500/20 ml-0.5"
            title="로그아웃"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* 2. 기준월 선택 바 */}
      <div className="px-4 py-2.5 bg-slate-850/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
          <Calendar size={13} className="text-blue-400" />
          <span>기준 정산월:</span>
        </div>
        <div className="flex items-center gap-1 bg-slate-800 px-1.5 py-1 rounded-xl border border-slate-700">
          <button
            onClick={handlePrevMonth}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-black text-white px-2 tracking-wide">
            {selectedMonth.replace('-', '년 ')}월
          </span>
          <button
            onClick={handleNextMonth}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* 3. 본문 컨텐츠 (탭별 렌더링) */}
      <main className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* ======================================================== */}
        {/* 시트 1: 핵심 현황 (Overview) */}
        {/* ======================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* 상단 월 타이틀 안내 */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                {selectedMonth} 월간 핵심 지표
              </span>
              <span className="text-[11px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                구좌수 기준
              </span>
            </div>

            {/* 3대 핵심 KPI 카드 (구좌수 기준) */}
            <div className="grid grid-cols-1 gap-3">
              {/* 1. 총 계약건수 (구좌수) */}
              <div className="relative overflow-hidden bg-gradient-to-br from-blue-900/40 via-slate-800/80 to-slate-850 p-4 rounded-2xl border border-blue-500/30 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                      <FileSpreadsheet size={15} />
                    </div>
                    <span className="text-xs font-bold text-slate-300">총 계약건수 (구좌수)</span>
                  </div>
                  <span className="text-[10px] font-black text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-800">
                    전체 체결
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black text-white tracking-tight">
                      {formatWon(overviewStats.totalAccounts)}
                    </span>
                    <span className="text-sm font-bold text-blue-300">구좌</span>
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    고유 {overviewStats.totalContractNos}건
                  </span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span>정상 유지 구좌</span>
                  <span className="font-extrabold text-blue-300">{formatWon(overviewStats.activeAccounts)} 구좌</span>
                </div>
              </div>

              {/* 2. 배송완료 계약건수 (구좌수) */}
              <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900/30 via-slate-800/80 to-slate-850 p-4 rounded-2xl border border-emerald-500/30 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                      <Truck size={15} />
                    </div>
                    <span className="text-xs font-bold text-slate-300">배송완료 계약건수 (구좌수)</span>
                  </div>
                  <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800">
                    완료율 {overviewStats.deliveryRate}%
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black text-white tracking-tight">
                      {formatWon(overviewStats.deliveredAccounts)}
                    </span>
                    <span className="text-sm font-bold text-emerald-300">구좌</span>
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    고유 {overviewStats.deliveredContractNos}건
                  </span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span>당월 실배송 완료 구좌</span>
                  <span className="font-extrabold text-emerald-300">{formatWon(overviewStats.actualDeliveryAccounts)} 구좌</span>
                </div>
              </div>

              {/* 3. 취소 및 해약 건수 (구좌수) */}
              <div className="relative overflow-hidden bg-gradient-to-br from-rose-900/30 via-slate-800/80 to-slate-850 p-4 rounded-2xl border border-rose-500/30 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                      <ShieldAlert size={15} />
                    </div>
                    <span className="text-xs font-bold text-slate-300">취소 및 해약 건수 (구좌수)</span>
                  </div>
                  <span className="text-[10px] font-black text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-800">
                    해약률 {overviewStats.cancelRate}%
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black text-white tracking-tight">
                      {formatWon(overviewStats.cancelledAccounts)}
                    </span>
                    <span className="text-sm font-bold text-rose-300">구좌</span>
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    고유 {overviewStats.cancelledContractNos}건
                  </span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span>정상 계약 대비 이탈</span>
                  <span className="font-extrabold text-rose-300">-{overviewStats.cancelledAccounts} 구좌</span>
                </div>
              </div>
            </div>

            {/* 4. 최근 5일 신계약 갯수 그래프 (금일까지 표기) */}
            <div className="bg-slate-850 p-4 rounded-2xl border border-slate-800 shadow-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-blue-400" />
                  <span className="text-xs font-black text-white">최근 5일 신계약 추이</span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold border border-indigo-500/30">
                    금일 포함
                  </span>
                </div>
                <span className="text-[11px] font-extrabold text-slate-400">
                  5일 합계: <b className="text-white">{recent5DaysData.total5Days}</b>구좌
                </span>
              </div>

              {/* 막대 차트 (Bar Chart) */}
              <div className="pt-4 pb-2">
                <div className="grid grid-cols-5 gap-2 items-end h-36 border-b border-slate-700/80 pb-2">
                  {recent5DaysData.days.map((item, idx) => {
                    const heightPct = Math.max(Math.round((item.count / recent5DaysData.maxCount) * 100), 8);
                    return (
                      <div key={idx} className="flex flex-col items-center h-full justify-end group">
                        {/* 수치 라벨 */}
                        <span className={`text-[11px] font-black mb-1.5 transition ${
                          item.isToday ? 'text-blue-400 scale-105' : 'text-slate-300'
                        }`}>
                          {item.count}
                        </span>

                        {/* 막대 바 */}
                        <div className="w-full bg-slate-800/80 rounded-t-xl h-full flex items-end p-0.5 overflow-hidden">
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${heightPct}%` }}
                            transition={{ duration: 0.5, delay: idx * 0.08 }}
                            className={`w-full rounded-t-lg transition-all ${
                              item.isToday 
                                ? 'bg-gradient-to-t from-blue-600 via-indigo-500 to-cyan-400 shadow-lg shadow-blue-500/30' 
                                : 'bg-gradient-to-t from-slate-700 to-slate-500 hover:from-slate-600 hover:to-slate-400'
                            }`}
                          />
                        </div>

                        {/* 날짜 라벨 */}
                        <div className="mt-2 text-center">
                          <span className={`text-[10px] block font-bold ${
                            item.isToday ? 'text-blue-400 font-black' : 'text-slate-400'
                          }`}>
                            {item.label}
                          </span>
                          {item.isToday && (
                            <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1 rounded font-black mt-0.5 block border border-blue-500/30">
                              오늘
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span>일평균 신계약: <strong className="text-white">{recent5DaysData.avg5Days}구좌</strong></span>
                <span className="text-[10px] text-slate-500">당일 실적 실시간 반영</span>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 시트 2: 순위 분석 (Top 10) */}
        {/* ======================================================== */}
        {activeTab === 'ranking' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Top 10 서브탭 선택 버튼 */}
            <div className="grid grid-cols-4 gap-1.5 bg-slate-800/90 p-1 rounded-2xl border border-slate-700">
              {[
                { id: 'product', label: '상품별' },
                { id: 'hq', label: '본부별' },
                { id: 'branch', label: '지사별' },
                { id: 'salesperson', label: '사원별' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setRankingCategory(tab.id as any)}
                  className={`py-2 text-xs font-black rounded-xl transition ${
                    rankingCategory === tab.id
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Top 10 요약 배너 */}
            <div className="bg-slate-850 px-4 py-3 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award size={16} className="text-amber-400" />
                <span className="text-xs font-black text-white">
                  {selectedMonth} {rankingCategory === 'product' ? '상품' : rankingCategory === 'hq' ? '본부' : rankingCategory === 'branch' ? '지사' : '영업사원'} 실적 Top 10
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-bold">
                유효 구좌 기준
              </span>
            </div>

            {/* 랭킹 리스트 */}
            <div className="space-y-2">
              {(() => {
                const currentList = 
                  rankingCategory === 'product' ? top10Rankings.products :
                  rankingCategory === 'hq' ? top10Rankings.hqs :
                  rankingCategory === 'branch' ? top10Rankings.branches :
                  top10Rankings.salespersons;

                if (!currentList || currentList.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-500 text-xs font-bold">
                      해당 월의 실적 데이터가 없습니다.
                    </div>
                  );
                }

                return currentList.map((item, idx) => {
                  const rank = idx + 1;
                  const isTop3 = rank <= 3;
                  const rankBadgeColor = 
                    rank === 1 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                    rank === 2 ? 'bg-slate-300/20 text-slate-200 border-slate-400/40' :
                    rank === 3 ? 'bg-amber-700/20 text-amber-500 border-amber-700/40' :
                    'bg-slate-800 text-slate-400 border-slate-700';

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-2xl border transition ${
                        isTop3 
                          ? 'bg-slate-850 border-slate-700/80 shadow-sm' 
                          : 'bg-slate-850/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center border ${rankBadgeColor}`}>
                            {rank}
                          </span>
                          <span className="text-xs font-bold text-white truncate max-w-[170px]">
                            {item.name}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="flex items-baseline gap-1 justify-end">
                            <span className="text-sm font-black text-white">{item.accounts}</span>
                            <span className="text-[10px] text-slate-400 font-bold">구좌</span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {item.contractCount}건 ({item.share}%)
                          </span>
                        </div>
                      </div>

                      {/* 프로그레스 바 */}
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mt-1">
                        <div
                          className={`h-full rounded-full ${
                            rank === 1 ? 'bg-amber-400' :
                            rank === 2 ? 'bg-slate-300' :
                            rank === 3 ? 'bg-amber-600' :
                            'bg-blue-500'
                          }`}
                          style={{ width: `${Math.min(item.share * 1.5, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 시트 3: 수수료 및 정산 내역 (본부별 수수료 & 공급사 정산) */}
        {/* ======================================================== */}
        {activeTab === 'settlement' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* 정산 기준 안내 배너 */}
            <div className="bg-gradient-to-r from-blue-950/60 to-indigo-950/60 p-3.5 rounded-2xl border border-blue-500/30 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={15} className="text-blue-400" />
                <span className="font-black text-white">
                  {selectedMonth.split('-')[1]}월 정산 지급 명세
                </span>
                <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-extrabold border border-blue-500/30">
                  실적: {settlementData.perfMonth}월 배송완료 건
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                전월({settlementData.perfMonth}월) 배송완료된 <b>{settlementData.deliveredItemsCount}구좌</b>에 대해 당월({selectedMonth.split('-')[1]}월 25일/말일) 지급할 정산 내역입니다.
              </p>
            </div>

            {/* 정산 서브탭 전환 버튼 */}
            <div className="grid grid-cols-3 gap-1 bg-slate-800/90 p-1 rounded-2xl border border-slate-700 text-xs font-black">
              <button
                onClick={() => setSettlementSubTab('hq_commission')}
                className={`py-2 rounded-xl transition ${
                  settlementSubTab === 'hq_commission'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                본부별 수수료
              </button>
              <button
                onClick={() => setSettlementSubTab('supplier_price')}
                className={`py-2 rounded-xl transition ${
                  settlementSubTab === 'supplier_price'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                공급사 정산
              </button>
              <button
                onClick={() => setSettlementSubTab('supply_comm')}
                className={`py-2 rounded-xl transition ${
                  settlementSubTab === 'supply_comm'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                공급수수료
              </button>
            </div>

            {/* 3-1. 본부별 수수료 화면 */}
            {settlementSubTab === 'hq_commission' && (
              <div className="space-y-3">
                {/* 본부 수수료 총합 카드 */}
                <div className="bg-slate-850 p-4 rounded-2xl border border-blue-500/30 shadow-md">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>본부 총 지급 수수료</span>
                    <span className="font-bold text-blue-400">{settlementData.totalHqAccounts} 구좌 대상</span>
                  </div>
                  <div className="text-2xl font-black text-white">
                    ₩ {formatWon(settlementData.totalHqPayout)}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                    <span>지급 예정일</span>
                    <span className="font-bold text-blue-300">{selectedMonth}-25 (익월 25일)</span>
                  </div>
                </div>

                {/* 본부별 리스트 */}
                <div className="space-y-2">
                  {settlementData.hqList.length === 0 ? (
                    <div className="py-10 text-center text-slate-500 text-xs font-bold">
                      해당 월 배송완료 실적이 있는 본부가 없습니다.
                    </div>
                  ) : (
                    settlementData.hqList.map((hq, idx) => (
                      <div key={idx} className="bg-slate-850/80 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-white">{hq.hqName}</span>
                          <span className="text-xs font-black text-blue-400">
                            ₩ {formatWon(hq.totalPayable)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>배송 실적: {hq.accounts}구좌</span>
                          <span>기본: ₩{formatWon(hq.salesComm)} | 공급수당: ₩{formatWon(hq.specialComm)}</span>
                        </div>
                        {hq.bankName !== '-' && (
                          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800 flex items-center justify-between">
                            <span>계좌: {hq.bankName} {hq.accountNumber}</span>
                            <span>({hq.accountHolder})</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 3-2. 공급사 정산 내역 (물품대금) 화면 */}
            {settlementSubTab === 'supplier_price' && (
              <div className="space-y-3">
                {/* 공급사 물품대금 총합 카드 */}
                <div className="bg-slate-850 p-4 rounded-2xl border border-emerald-500/30 shadow-md">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>공급사 총 물품대금 (VAT포함)</span>
                    <span className="font-bold text-emerald-400">{settlementData.totalSupplierAccounts} 구좌 대상</span>
                  </div>
                  <div className="text-2xl font-black text-white">
                    ₩ {formatWon(settlementData.totalSupplierPrice)}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                    <span>정산 기준</span>
                    <span className="font-bold text-emerald-300">{settlementData.perfMonth}월 배송완료분</span>
                  </div>
                </div>

                {/* 공급사별 리스트 */}
                <div className="space-y-2">
                  {settlementData.supplierList.length === 0 ? (
                    <div className="py-10 text-center text-slate-500 text-xs font-bold">
                      매칭된 공급사 정산 내역이 없습니다.
                    </div>
                  ) : (
                    settlementData.supplierList.map((supp, idx) => (
                      <div key={idx} className="bg-slate-850/80 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-white">{supp.supplierName}</span>
                          <span className="text-xs font-black text-emerald-400">
                            ₩ {formatWon(supp.totalSupplyPrice)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>정산 수량: {supp.accounts}구좌</span>
                          <span>정산일: 매월 {supp.settlementDay}일</span>
                        </div>
                        {supp.bankName !== '-' && (
                          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800 flex items-center justify-between">
                            <span>계좌: {supp.bankName} {supp.accountNumber}</span>
                            <span>({supp.accountHolder})</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 3-3. 공급수수료 화면 */}
            {settlementSubTab === 'supply_comm' && (
              <div className="space-y-3">
                {/* 공급수수료 총합 카드 */}
                <div className="bg-slate-850 p-4 rounded-2xl border border-indigo-500/30 shadow-md">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>공급수수료 총액 (VAT포함)</span>
                    <span className="font-bold text-indigo-400">공급사 제품 발생분</span>
                  </div>
                  <div className="text-2xl font-black text-white">
                    ₩ {formatWon(settlementData.totalSupplierCommission)}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                    <span>정산 대상 구좌</span>
                    <span className="font-bold text-indigo-300">{settlementData.totalSupplierAccounts} 구좌</span>
                  </div>
                </div>

                {/* 공급사별 공급수수료 리스트 */}
                <div className="space-y-2">
                  {settlementData.supplierList.filter(s => s.totalCommission > 0).length === 0 ? (
                    <div className="py-10 text-center text-slate-500 text-xs font-bold">
                      발생한 공급수수료가 없습니다.
                    </div>
                  ) : (
                    settlementData.supplierList.filter(s => s.totalCommission > 0).map((supp, idx) => (
                      <div key={idx} className="bg-slate-850/80 p-3 rounded-2xl border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-white">{supp.supplierName}</span>
                          <span className="text-xs font-black text-indigo-400">
                            ₩ {formatWon(supp.totalCommission)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>적용 수량: {supp.accounts}구좌</span>
                          <span>평균 단가: ₩{supp.accounts > 0 ? formatWon(supp.totalCommission / supp.accounts) : 0}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 4. 하단 고정 탭 네비게이션 바 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-6 py-2">
        <div className="max-w-lg mx-auto flex items-center justify-around">
          {/* 탭 1: 핵심 현황 */}
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
              activeTab === 'overview'
                ? 'text-blue-400 font-black'
                : 'text-slate-400 hover:text-slate-200 font-bold'
            }`}
          >
            <BarChart3 size={20} className={activeTab === 'overview' ? 'scale-110' : ''} />
            <span className="text-[11px]">핵심현황</span>
          </button>

          {/* 탭 2: 순위 분석 */}
          <button
            onClick={() => setActiveTab('ranking')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
              activeTab === 'ranking'
                ? 'text-blue-400 font-black'
                : 'text-slate-400 hover:text-slate-200 font-bold'
            }`}
          >
            <Award size={20} className={activeTab === 'ranking' ? 'scale-110' : ''} />
            <span className="text-[11px]">Top 10</span>
          </button>

          {/* 탭 3: 수수료 & 정산 */}
          <button
            onClick={() => setActiveTab('settlement')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
              activeTab === 'settlement'
                ? 'text-blue-400 font-black'
                : 'text-slate-400 hover:text-slate-200 font-bold'
            }`}
          >
            <DollarSign size={20} className={activeTab === 'settlement' ? 'scale-110' : ''} />
            <span className="text-[11px]">수수료·정산</span>
          </button>
        </div>
      </nav>

      {/* 비밀번호 변경 모달 */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        currentUser={currentUser}
      />
    </div>
  );
};

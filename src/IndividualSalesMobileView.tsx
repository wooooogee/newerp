import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, LogOut, RefreshCw, Calendar, User, Package, Truck, FileText, Check, X, Edit2, ChevronDown, ArrowUp, KeyRound, CreditCard, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChangePasswordModal } from './ChangePasswordModal';

interface IndividualSalesMobileViewProps {
  currentUser: {
    username: string;
    role: string;
    orgName: string;
    orgs?: { role: string; orgName: string; }[];
  };
  data: any[]; // 본인의 데이터만 필터링되어 넘어옴
  onUpdateDeliveryMemo: (rowIdx: number, val: string) => Promise<void> | void;
  onLogout: () => void;
  loading: boolean;
  onRefresh: () => void;
}

export const IndividualSalesMobileView: React.FC<IndividualSalesMobileViewProps> = ({
  currentUser,
  data,
  onUpdateDeliveryMemo,
  onLogout,
  loading,
  onRefresh
}) => {
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [statusFilter, setStatusFilter] = useState('전체'); // 전체, 가입, 해약, 취소
  const [deliveryFilter, setDeliveryFilter] = useState('전체'); // 전체, 배송대기, 배송완료
  const [monthFilter, setMonthFilter] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }); // 기본값: 현재 월 (YYYY-MM)
  const [displayMode, setDisplayMode] = useState<'구좌수' | '상품건수'>('구좌수'); // 구좌수, 상품건수
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [editMemoValue, setEditMemoValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 탭 상태 (상세 계약 vs 요약 보고서)
  const [activeTab, setActiveTab] = useState<'detail' | 'report'>('detail');

  // 실적 0건 본부 숨기기 상태
  const [hideZeroHq, setHideZeroHq] = useState(true);

  // 실적 요약 상세 아코디언 상태
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  // 렌탈 미출금 / 상조 미출금 필터 상태
  const [isUnpaidRental, setIsUnpaidRental] = useState(false);
  const [isUnpaidMutualAid, setIsUnpaidMutualAid] = useState(false);

  // 본부모바일 / 지사모바일 / 관리자모바일 권한 판별
  const isHqMobile = useMemo(() => {
    return currentUser.role === '본부모바일' || currentUser.role === '본부' || 
      (currentUser.orgs && currentUser.orgs.some(o => o.role === '본부모바일' || o.role === '본부'));
  }, [currentUser]);

  const isBranchMobile = useMemo(() => {
    return currentUser.role === '지사모바일' || currentUser.role === '지사' || 
      (currentUser.orgs && currentUser.orgs.some(o => o.role === '지사모바일' || o.role === '지사'));
  }, [currentUser]);

  const isAdminMobile = useMemo(() => {
    return currentUser.role === 'admin모바일' || currentUser.role === '관리자모바일' || currentUser.role === 'admin' || currentUser.role === '관리자' ||
      (currentUser.orgs && currentUser.orgs.some(o => ['admin모바일', '관리자모바일', 'admin', '관리자'].includes(o.role)));
  }, [currentUser]);

  // 본부/지사/관리자용 서브 필터 상태
  const [hqFilter, setHqFilter] = useState('전체');
  const [branchFilter, setBranchFilter] = useState('전체');
  const [empFilter, setEmpFilter] = useState('전체');

  // 상세 계약 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);

  // 검색어나 필터 조건 변경 시 페이지 번호를 1페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, monthFilter, statusFilter, deliveryFilter, hqFilter, branchFilter, empFilter, displayMode, isUnpaidRental, isUnpaidMutualAid]);

  // 스크롤 탑 이동을 위한 스크롤 컨테이너 Ref
  const containerRef = useRef<HTMLDivElement>(null);

  // 위로가기 플로팅 버튼 활성화 상태
  const [showScrollTopBtn, setShowScrollTopBtn] = useState(false);

  // 스크롤 핸들러 (200px 이상 아래로 내려갈 시 플로팅 버튼 노출)
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setShowScrollTopBtn(scrollTop > 200);
  };

  // 계정 권한 및 소속 조직(orgs) 기반 사용 가능 본부 옵션 생성
  const availableHqOptions = useMemo(() => {
    if (isAdminMobile) {
      const hqs = new Set<string>();
      data.forEach(item => {
        if (item.hq && item.hq.trim()) hqs.add(item.hq.trim());
      });
      const list = Array.from(hqs).sort();
      return list.length > 1 ? ['전체', ...list] : list;
    }

    const normOrg = (s: string) => (s || '').replace(/[\s()본부지사지점모바일]/g, '').toLowerCase();
    const userHqNames = new Set<string>();

    if (currentUser.orgs && currentUser.orgs.length > 0) {
      currentUser.orgs.forEach(o => {
        const name = (o.orgName || '').trim();
        if (name && !['관리자', '시스템관리자'].includes(name)) {
          if (['본부', '총무', '본부모바일'].includes(o.role)) {
            userHqNames.add(name);
          }
        }
      });
    }
    const mainName = (currentUser.orgName || '').trim();
    if (mainName && !['관리자', '시스템관리자'].includes(mainName)) {
      if (['본부', '총무', '본부모바일'].includes(currentUser.role)) {
        userHqNames.add(mainName);
      }
    }

    const matchedHqs = new Set<string>();
    data.forEach(item => {
      if (item.hq && item.hq.trim()) {
        const cleanHq = item.hq.trim();
        if (userHqNames.size > 0) {
          const cleanHqNorm = normOrg(cleanHq);
          if (Array.from(userHqNames).some(h => {
            const hNorm = normOrg(h);
            return hNorm === cleanHqNorm || (hNorm !== '' && cleanHqNorm.includes(hNorm)) || (cleanHqNorm !== '' && hNorm.includes(cleanHqNorm));
          })) {
            matchedHqs.add(cleanHq);
          }
        } else {
          matchedHqs.add(cleanHq);
        }
      }
    });

    const list = Array.from(matchedHqs).sort();
    return list.length > 1 ? ['전체', ...list] : list;
  }, [data, currentUser, isAdminMobile]);

  // 지사 선택 옵션 (본부 선택 hqFilter 반영)
  const branchOptions = useMemo(() => {
    const branches = new Set<string>();
    data.forEach(item => {
      if (hqFilter !== '전체' && (item.hq || '').trim() !== hqFilter) return;
      if (item.branch) branches.add(item.branch.trim());
    });
    return ['전체', ...Array.from(branches).sort()];
  }, [data, hqFilter]);

  // 영업사원 선택 옵션 (본부 선택 hqFilter 및 지사 선택 branchFilter 반영)
  const empOptions = useMemo(() => {
    const emps = new Set<string>();
    data.forEach(item => {
      if (hqFilter !== '전체' && (item.hq || '').trim() !== hqFilter) return;
      if (branchFilter !== '전체' && (item.branch || '').trim() !== branchFilter) return;
      if (item.empName) emps.add(item.empName.trim());
    });
    return ['전체', ...Array.from(emps).sort()];
  }, [data, hqFilter, branchFilter]);

  // 데이터 내 존재하는 고유 계약월 및 배송월 목록 동적 추출 (YYYY-MM)
  const uniqueMonths = useMemo(() => {
    const months = new Set<string>();
    data.forEach(item => {
      if (item.contractDate) {
        const clean = item.contractDate.replace(/[./]/g, '-');
        const match = clean.match(/^(\d{4})-(\d{2})/);
        if (match) {
          months.add(`${match[1]}-${match[2]}`);
        }
      }
      if (item.deliveryDate) {
        const clean = item.deliveryDate.replace(/[./]/g, '-');
        const match = clean.match(/^(\d{4})-(\d{2})/);
        if (match) {
          months.add(`${match[1]}-${match[2]}`);
        }
      }
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a)); // 최신 월 순 정렬
  }, [data]);

  // data 내 존재하는 계약월 목록에 현재 monthFilter가 없으면 최신월로 자동 지정
  useEffect(() => {
    if (uniqueMonths.length > 0 && !uniqueMonths.includes(monthFilter)) {
      setMonthFilter(uniqueMonths[0]);
    }
  }, [uniqueMonths]);

  // 1-1. 계약월 필터가 반영된 1차 가공 데이터 (계약일자 기준)
  const contractMonthFilteredData = useMemo(() => {
    return data.filter(item => {
      if (monthFilter !== '전체') {
        const cleanDate = (item.contractDate || '').replace(/[./]/g, '-');
        if (!cleanDate.startsWith(monthFilter)) return false;
      }
      return true;
    });
  }, [data, monthFilter]);

  // 1-2. 배송월 필터가 반영된 1차 가공 데이터 (배송완료 & N열 배송일자 기준)
  const deliveryCompletedMonthData = useMemo(() => {
    return data.filter(item => {
      const isDeliveryComplete = (item.deliveryStatus || '').trim() === '배송완료';
      if (!isDeliveryComplete) return false;
      if (monthFilter !== '전체') {
        const cleanDate = (item.deliveryDate || '').replace(/[./]/g, '-');
        if (!cleanDate.startsWith(monthFilter)) return false;
      }
      return true;
    });
  }, [data, monthFilter]);

  // 2. 보기 방식(구좌수/상품건수)에 따른 중복 제거 처리 데이터
  const contractModeProcessedData = useMemo(() => {
    if (displayMode === '구좌수') {
      return contractMonthFilteredData;
    }
    // 상품건수 기준: 동일한 rentalNo 중복 제거
    const uniqueMap = new Map();
    contractMonthFilteredData.forEach(item => {
      if (item.rentalNo && !uniqueMap.has(item.rentalNo)) {
        uniqueMap.set(item.rentalNo, item);
      } else if (!item.rentalNo) {
        uniqueMap.set(item.uniqueKey, item);
      }
    });
    return Array.from(uniqueMap.values());
  }, [contractMonthFilteredData, displayMode]);

  const deliveryModeProcessedData = useMemo(() => {
    if (displayMode === '구좌수') {
      return deliveryCompletedMonthData;
    }
    // 상품건수 기준: 동일한 rentalNo 중복 제거
    const uniqueMap = new Map();
    deliveryCompletedMonthData.forEach(item => {
      if (item.rentalNo && !uniqueMap.has(item.rentalNo)) {
        uniqueMap.set(item.rentalNo, item);
      } else if (!item.rentalNo) {
        uniqueMap.set(item.uniqueKey, item);
      }
    });
    return Array.from(uniqueMap.values());
  }, [deliveryCompletedMonthData, displayMode]);

  // 3. 선택된 본부(hqFilter) 필터가 반영된 데이터 (대시보드 상단 통계, 목록, 보고서의 공통 모수)
  const normOrg = (s: string) => (s || '').replace(/[\s()본부지사지점모바일]/g, '').toLowerCase();

  const hqFilteredContractData = useMemo(() => {
    if (hqFilter === '전체') return contractModeProcessedData;
    const filterNorm = normOrg(hqFilter);
    return contractModeProcessedData.filter(item => {
      const itemHqNorm = normOrg(item.hq);
      return itemHqNorm === filterNorm || (filterNorm !== '' && itemHqNorm.includes(filterNorm)) || (itemHqNorm !== '' && filterNorm.includes(itemHqNorm));
    });
  }, [contractModeProcessedData, hqFilter]);

  const hqFilteredDeliveryData = useMemo(() => {
    if (hqFilter === '전체') return deliveryModeProcessedData;
    const filterNorm = normOrg(hqFilter);
    return deliveryModeProcessedData.filter(item => {
      const itemHqNorm = normOrg(item.hq);
      return itemHqNorm === filterNorm || (filterNorm !== '' && itemHqNorm.includes(filterNorm)) || (itemHqNorm !== '' && filterNorm.includes(itemHqNorm));
    });
  }, [deliveryModeProcessedData, hqFilter]);

  // 4. 요약 통계 계산 (계약일자 기준 계약/가입/해약/취소/배송대기 + N열 배송일자 기준 해당월 배송완료)
  const summary = useMemo(() => {
    const activeContractData = hqFilteredContractData.filter(item => (item.status || '').trim() === '가입');
    const activeDeliveryData = hqFilteredDeliveryData.filter(item => (item.status || '').trim() === '가입');

    const total = activeContractData.length;
    const waiting = activeContractData.filter(item => (item.deliveryStatus || '').trim() === '배송대기').length;
    const completed = activeDeliveryData.length; // N열 배송일자 기준 해당 월 배송완료 건수
    
    // 배송 미해당 건수 산출 (계약 건 중 배송대기/배송완료가 아닌 상품군)
    const contractCompletedCount = activeContractData.filter(item => (item.deliveryStatus || '').trim() === '배송완료').length;
    const noDelivery = total - (waiting + contractCompletedCount);

    // 가입 상태별 통계 (hqFilteredContractData 기준)
    const signed = activeContractData.length;
    const terminated = hqFilteredContractData.filter(item => (item.status || '').trim().includes('해약')).length;
    const cancelled = hqFilteredContractData.filter(item => (item.status || '').trim().includes('취소')).length;

    return { total, waiting, completed, signed, terminated, cancelled, noDelivery };
  }, [hqFilteredContractData, hqFilteredDeliveryData]);

  // 5. 검색 및 지사/사원/가입/배송 필터링된 최종 렌더링 데이터
  const filteredData = useMemo(() => {
    // deliveryFilter가 '배송완료'인 경우 N열 배송일자 기준 데이터(hqFilteredDeliveryData) 사용
    const targetSource = deliveryFilter === '배송완료' ? hqFilteredDeliveryData : hqFilteredContractData;

    return targetSource.filter(item => {
      // 지사 필터링
      if (branchFilter !== '전체') {
        if ((item.branch || '').trim() !== branchFilter) return false;
      }

      // 영업사원 필터링
      if (empFilter !== '전체') {
        if ((item.empName || '').trim() !== empFilter) return false;
      }

      // 가입상태 필터링
      if (statusFilter !== '전체') {
        const itemStatus = (item.status || '').trim();
        if (statusFilter === '해약' && !itemStatus.includes('해약')) return false;
        if (statusFilter === '취소' && !itemStatus.includes('취소')) return false;
        if (statusFilter === '가입' && itemStatus !== '가입') return false;
      }

      // 배송상태 필터링 (deliveryFilter가 '배송대기' 등인 경우)
      if (deliveryFilter !== '전체' && deliveryFilter !== '배송완료') {
        const itemDelivery = (item.deliveryStatus || '').trim();
        if (itemDelivery !== deliveryFilter) return false;
      }

      // 검색어 필터링 (회원명, 상품명, 렌탈상품명)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const searchString = `${item.memName} ${item.prodName} ${item.rentalProd} ${item.rentalNo}`.toLowerCase();
        if (!searchString.includes(term)) return false;
      }

      // 렌탈 미출금 필터링 (Y열 deliveryMemo/row[24] 및 AA열 row[26] 기준 출금날짜 유무 검사)
      if (isUnpaidRental) {
        const deliveryMemoVal = (item.deliveryMemo || '').trim();
        const rawAAVal = item.raw && item.raw[26] ? String(item.raw[26]).trim() : '';
        const rawYVal = item.raw && item.raw[24] ? String(item.raw[24]).trim() : '';
        
        // Y열 또는 AA열 중 하나라도 4자리 연도(날짜)가 포함되어 있으면 출금 완료건
        const hasRentalPayDate = /\d{4}/.test(deliveryMemoVal) || /\d{4}/.test(rawAAVal) || /\d{4}/.test(rawYVal);
        if (hasRentalPayDate) return false;
      }

      // 상조 미출금 필터링 (관리대장 시트 V열 row[21] 상조출금 값 기준 하이픈/공백/미출금)
      if (isUnpaidMutualAid) {
        const firstPayVal = item.raw && item.raw[21] ? String(item.raw[21]).trim() : '';
        const isUnpaid = !firstPayVal || firstPayVal.includes('-') || !/\d{4}/.test(firstPayVal);
        if (!isUnpaid) return false;
      }

      return true;
    }).sort((a, b) => {
      if (deliveryFilter === '배송완료') {
        return String(b.deliveryDate || '').localeCompare(String(a.deliveryDate || ''));
      }
      return String(b.contractDate || '').localeCompare(String(a.contractDate || ''));
    });
  }, [hqFilteredContractData, hqFilteredDeliveryData, searchTerm, statusFilter, deliveryFilter, branchFilter, empFilter, isUnpaidRental, isUnpaidMutualAid]);

  // 1페이지당 10개 아이템 기준 전체 페이지 계산
  const totalPages = useMemo(() => {
    return Math.ceil(filteredData.length / 10) || 1;
  }, [filteredData]);

  // 현재 페이지에 렌더링할 10개 아이템 배열 추출
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * 10;
    return filteredData.slice(startIndex, startIndex + 10);
  }, [filteredData, currentPage]);

  // 6. 요약 보고서 전용 집계 데이터
  // 6-1. 본부별 집계 (sales: 계약월 기준, deliveryCompleted: N열 배송일자 기준)
  const hqReportData = useMemo(() => {
    const map = new Map<string, { hq: string; sales: number; deliveryCompleted: number }>();

    hqFilteredContractData.forEach(item => {
      const hq = item.hq || '미지정본부';
      if (!map.has(hq)) {
        map.set(hq, { hq, sales: 0, deliveryCompleted: 0 });
      }
      const entry = map.get(hq)!;
      if ((item.status || '').trim() === '가입') {
        entry.sales += 1;
      }
    });

    hqFilteredDeliveryData.forEach(item => {
      const hq = item.hq || '미지정본부';
      if (!map.has(hq)) {
        map.set(hq, { hq, sales: 0, deliveryCompleted: 0 });
      }
      const entry = map.get(hq)!;
      if ((item.status || '').trim() === '가입') {
        entry.deliveryCompleted += 1;
      }
    });

    let list = Array.from(map.values());
    if (hideZeroHq) {
      list = list.filter(item => item.sales > 0 || item.deliveryCompleted > 0);
    }
    return list.sort((a, b) => b.sales - a.sales);
  }, [hqFilteredContractData, hqFilteredDeliveryData, hideZeroHq]);

  // 6-2. 상품별 집계 (sales: 계약월 기준, deliveryCompleted: N열 배송일자 기준)
  const prodReportData = useMemo(() => {
    const map = new Map<string, { prodName: string; sales: number; deliveryCompleted: number }>();

    hqFilteredContractData.forEach(item => {
      const prodName = item.prodName || '미지정상품';
      if (!map.has(prodName)) {
        map.set(prodName, { prodName, sales: 0, deliveryCompleted: 0 });
      }
      const entry = map.get(prodName)!;
      if ((item.status || '').trim() === '가입') {
        entry.sales += 1;
      }
    });

    hqFilteredDeliveryData.forEach(item => {
      const prodName = item.prodName || '미지정상품';
      if (!map.has(prodName)) {
        map.set(prodName, { prodName, sales: 0, deliveryCompleted: 0 });
      }
      const entry = map.get(prodName)!;
      if ((item.status || '').trim() === '가입') {
        entry.deliveryCompleted += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }, [hqFilteredContractData, hqFilteredDeliveryData]);

  // 메모 편집 시작
  const handleStartEdit = (rowIdx: number, currentMemo: string) => {
    setEditingRowIdx(rowIdx);
    setEditMemoValue(currentMemo);
  };

  // 메모 저장 수행
  const handleSaveMemo = async (rowIdx: number) => {
    setIsSaving(true);
    try {
      await onUpdateDeliveryMemo(rowIdx, editMemoValue);
      setEditingRowIdx(null);
    } catch (err) {
      alert('메모 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // 배송상태에 따른 배지 스타일 (화이트 모드 테마)
  const getDeliveryBadgeClass = (status: string) => {
    const cleanStatus = (status || '').trim();
    switch (cleanStatus) {
      case '배송대기':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case '배송완료':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-300';
    }
  };

  // 가입상태에 따른 배지 스타일 (화이트 모드 테마)
  const getStatusBadgeClass = (status: string) => {
    const cleanStatus = (status || '').trim();
    if (cleanStatus === '가입') {
      return 'bg-teal-100 text-teal-800 border-teal-300';
    } else if (cleanStatus.includes('취소') || cleanStatus.includes('해약')) {
      return 'bg-rose-100 text-rose-800 border-rose-300';
    }
    return 'bg-slate-100 text-slate-600 border-slate-300';
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 text-slate-900 font-sans overflow-hidden max-w-md mx-auto shadow-2xl relative border-x border-slate-200">
      {/* Header */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex justify-between items-center z-50 shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/20">
            <Truck size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900">The Better Life ERP</h1>
            <p className="text-[10px] text-slate-500">영업사원 배송관리</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onRefresh}
            disabled={loading}
            className={`p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors ${loading ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={onLogout}
            className="flex items-center justify-center p-2 text-rose-600 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
        {/* User Card */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center">
                <User className="text-blue-600" size={20} />
              </div>
              <div>
                <div className="text-[11px] text-slate-500 font-semibold tracking-wider uppercase">Welcome Back</div>
                <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  {currentUser?.username || '영업사원'} 님
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsChangePasswordOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition-all border border-blue-200 shrink-0 shadow-sm"
              title="비밀번호 변경"
            >
              <KeyRound size={14} className="text-blue-600" />
              <span>비번 변경</span>
            </button>
          </div>

          {/* 본부 선택 셀렉터 (다중 본부 보유 계정이거나 본부 선택이 가능한 경우) */}
          {availableHqOptions.length > 1 && (
            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-600 font-bold shrink-0 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                </span>
                접속 본부 선택:
              </span>
              <select
                value={hqFilter}
                onChange={(e) => {
                  setHqFilter(e.target.value);
                  setBranchFilter('전체');
                  setEmpFilter('전체');
                }}
                className="flex-1 max-w-[200px] bg-blue-50/80 border border-blue-200 text-blue-900 rounded-xl py-1.5 px-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all cursor-pointer shadow-sm"
              >
                {availableHqOptions.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* View Mode Toggle Switch */}
        <div className="flex bg-slate-200/70 p-1.5 rounded-2xl border border-slate-300 shadow-inner">
          <button
            onClick={() => setDisplayMode('구좌수')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              displayMode === '구좌수' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            구좌수 기준으로 보기
          </button>
          <button
            onClick={() => setDisplayMode('상품건수')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              displayMode === '상품건수' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            상품건수로 보기
          </button>
        </div>

        {/* Dashboard Count Cards (3 Columns) & Accordion Switch */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm space-y-2 relative">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '전체', filterKey: '전체', count: summary.total, color: 'border-slate-200 bg-slate-50 text-slate-800' },
              { label: '배송대기', filterKey: '배송대기', count: summary.waiting, color: 'border-amber-200 bg-amber-50 text-amber-800' },
              { label: '배송완료', filterKey: '배송완료', count: summary.completed, color: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
            ].map((item, i) => (
              <div
                key={i}
                onClick={() => setDeliveryFilter(item.filterKey)}
                className={`p-2.5 border rounded-xl flex flex-col items-center justify-center shadow-sm cursor-pointer hover:opacity-90 active:scale-95 transition-all ${
                  deliveryFilter === item.filterKey ? 'ring-2 ring-blue-500 font-bold' : ''
                } ${item.color}`}
              >
                <span className="text-[10px] text-slate-500 font-medium">{item.label}</span>
                <span className="text-base font-extrabold mt-1">{item.count}</span>
              </div>
            ))}
          </div>

          {/* Toggle button positioned neatly at the bottom right */}
          <div className="flex justify-end pt-1">
            <button
              onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
              className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-900 transition-colors py-1 px-2.5 bg-slate-100 border border-slate-200 rounded-full shadow-sm"
            >
              <span>상세 실적 현황</span>
              <ChevronDown 
                size={12} 
                className={`transition-transform duration-200 ${isSummaryExpanded ? 'rotate-180' : 'rotate-0'}`} 
              />
            </button>
          </div>

          {/* Collapsible statistics panel */}
          <AnimatePresence>
            {isSummaryExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  {/* 계약/가입 현황 */}
                  <div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1 px-0.5">계약 현황</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 border border-slate-200 p-2 rounded-xl flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 font-medium">총 접수건</span>
                        <strong className="text-xs font-bold text-slate-900">{contractModeProcessedData.length}건</strong>
                      </div>
                      <div className="bg-teal-50 border border-teal-200 p-2 rounded-xl flex justify-between items-center">
                        <span className="text-[10px] text-teal-700 font-medium">가입 건수</span>
                        <strong className="text-xs font-bold text-teal-700">{summary.signed}건</strong>
                      </div>
                      <div className="bg-rose-50 border border-rose-200 p-2 rounded-xl flex justify-between items-center">
                        <span className="text-[10px] text-rose-700 font-medium">해약 건수</span>
                        <strong className="text-xs font-bold text-rose-700">{summary.terminated}건</strong>
                      </div>
                      <div className="bg-red-50 border border-red-200 p-2 rounded-xl flex justify-between items-center">
                        <span className="text-[10px] text-red-700 font-medium">취소 건수</span>
                        <strong className="text-xs font-bold text-red-700">{summary.cancelled}건</strong>
                      </div>
                    </div>
                  </div>

                  {/* 배송 세부 현황 */}
                  <div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1 px-0.5">배송 세부 현황 (가입 건 기준)</div>
                    <div className="grid grid-cols-3 gap-1.5 text-xs">
                      <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-[9px] text-amber-700 font-medium">배송 대기</span>
                        <strong className="text-xs font-bold text-amber-700 mt-0.5">{summary.waiting}건</strong>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-[9px] text-emerald-700 font-medium">배송 완료</span>
                        <strong className="text-xs font-bold text-emerald-700 mt-0.5">{summary.completed}건</strong>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-[9px] text-slate-500 font-medium">배송 미해당</span>
                        <strong className="text-xs font-bold text-slate-800 mt-0.5">{summary.noDelivery}건</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* activeTab 분기에 따른 필터 영역 제어 */}
        {activeTab === 'detail' ? (
          /* 상세 계약 탭일 때의 기존 필터 상세 설정 */
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">필터 상세 설정</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {/* 계약월 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-500 font-bold">계약 월</label>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="전체">전체</option>
                  {uniqueMonths.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              {/* 가입상태 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-500 font-bold">가입상태</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="전체">전체</option>
                  <option value="가입">가입</option>
                  <option value="해약">해약</option>
                  <option value="취소">취소</option>
                </select>
              </div>
              {/* 배송상태 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-500 font-bold">배송상태</label>
                <select
                  value={deliveryFilter}
                  onChange={(e) => setDeliveryFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="전체">전체</option>
                  <option value="배송대기">배송대기</option>
                  <option value="배송완료">배송완료</option>
                </select>
              </div>
            </div>

            {/* 본부/지사/관리자모바일용 하위 조직 필터링 */}
            {(isHqMobile || isBranchMobile || isAdminMobile || availableHqOptions.length > 1) && (
              <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
                {availableHqOptions.length > 1 && (
                  <div className="flex flex-col gap-1.5 text-xs">
                    <label className="text-[10px] text-slate-500 font-bold">본부 선택</label>
                    <select
                      value={hqFilter}
                      onChange={(e) => {
                        setHqFilter(e.target.value);
                        setBranchFilter('전체');
                        setEmpFilter('전체');
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      {availableHqOptions.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(isHqMobile || isAdminMobile) && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-slate-500 font-bold">지사/지점 선택</label>
                      <select
                        value={branchFilter}
                        onChange={(e) => {
                          setBranchFilter(e.target.value);
                          setEmpFilter('전체');
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-colors"
                      >
                        {branchOptions.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className={`flex flex-col gap-1.5 ${(isHqMobile || isAdminMobile) ? 'col-span-1' : 'col-span-2'}`}>
                    <label className="text-[10px] text-slate-500 font-bold">영업사원 선택</label>
                    <select
                      value={empFilter}
                      onChange={(e) => setEmpFilter(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      {empOptions.map(e => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 렌탈/상조 특별 필터 */}
            <div className="flex items-center gap-4 pt-3 border-t border-slate-100 text-xs text-slate-700">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isUnpaidRental}
                  onChange={(e) => setIsUnpaidRental(e.target.checked)}
                  className="w-4 h-4 bg-slate-50 border-slate-300 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-blue-600 font-medium">렌탈 미출금</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isUnpaidMutualAid}
                  onChange={(e) => setIsUnpaidMutualAid(e.target.checked)}
                  className="w-4 h-4 bg-slate-50 border-slate-300 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-red-600 font-semibold">상조 미출금</span>
              </label>
            </div>
          </div>
        ) : (
          /* 요약 보고서 탭일 때의 간소화된 월 선택 필터 및 0건 숨기기 토글 */
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between gap-4">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-500 font-bold">계약 월 선택</label>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="전체">전체</option>
                {uniqueMonths.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            
            <div className="flex flex-col items-end gap-1.5 pt-4">
              <span className="text-[10px] text-slate-500 font-bold">0건 본부 숨기기</span>
              <button
                type="button"
                onClick={() => setHideZeroHq(!hideZeroHq)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  hideZeroHq ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    hideZeroHq ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'detail' ? (
          <>
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="회원명, 상품명 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* List Header */}
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
              <span>검색 결과: <strong className="text-slate-900 font-semibold">{filteredData.length}</strong>건</span>
            </div>

            {/* Card List */}
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {paginatedData.length > 0 ? (
                  paginatedData.map((item) => {
                    const mutualAidPayVal = (item.raw && item.raw[21]) ? String(item.raw[21]).trim() : '-';
                    const rentalPayVal = (item.raw && item.raw[26]) ? String(item.raw[26]).trim() : '-';

                    return (
                      <motion.div
                        key={item.uniqueKey}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-2.5"
                      >
                        {/* Card Title Line */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-900">{item.memName || '-'}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${getStatusBadgeClass(item.status)}`}>
                              {item.status || '가입'}
                            </span>
                          </div>
                          <span className={`text-[10px] px-2.5 py-0.5 rounded font-semibold border ${getDeliveryBadgeClass(item.deliveryStatus)}`}>
                            {item.deliveryStatus || '배송대기'}
                          </span>
                        </div>

                        {/* Card Body Details */}
                        <div className="border-t border-slate-100 pt-2.5 space-y-2 text-[11px]">
                          <div className="grid grid-cols-2 gap-x-3">
                            {/* 왼쪽: 계약 및 상조 정보 */}
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-center gap-1.5 text-slate-500">
                                <Calendar size={12} className="text-slate-400 shrink-0" />
                                <span className="truncate">계약일자: <strong className="text-slate-800">{item.contractDate || '-'}</strong></span>
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-500">
                                <Package size={12} className="text-slate-400 shrink-0" />
                                <span className="truncate">상 조: <strong className="text-slate-800" title={item.prodName}>{item.prodName || '-'}</strong></span>
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-500">
                                <CreditCard size={12} className="text-slate-400 shrink-0" />
                                <span className="truncate">상조출금일: <strong className="text-slate-800">{mutualAidPayVal}</strong></span>
                              </div>
                            </div>

                            {/* 오른쪽: 배송 및 렌탈 정보 */}
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-center gap-1.5 text-slate-500">
                                <Truck size={12} className="text-blue-500 shrink-0" />
                                <span className="truncate">배송일자: <strong className="text-blue-700 font-semibold">{item.deliveryDate || '-'}</strong></span>
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-500">
                                <Hash size={12} className="text-indigo-400 shrink-0" />
                                <span className="truncate">렌탈번호: <strong className="font-mono text-indigo-600 font-semibold">{item.rentalNo || '-'}</strong></span>
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-500">
                                <CreditCard size={12} className="text-indigo-400 shrink-0" />
                                <span className="truncate">렌탈출금일: <strong className="text-slate-800">{rentalPayVal}</strong></span>
                              </div>
                            </div>
                          </div>

                          {/* 렌탈상품 단독 Full-Width 행 (상조출금일 & 렌탈출금일 바로 아래에 전체 상품명 100% 노출) */}
                          <div className="flex items-start gap-1.5 text-slate-500 bg-slate-50/80 p-2 rounded-xl border border-slate-100/80 mt-1">
                            <Package size={13} className="text-indigo-500 shrink-0 mt-0.5" />
                            <div className="flex-1 text-[11px] leading-tight">
                              <span className="font-medium text-slate-500">렌탈상품: </span>
                              <strong className="text-slate-900 font-bold break-all">{item.rentalProd || '-'}</strong>
                            </div>
                          </div>
                        </div>

                        {/* Delivery Memo Area */}
                        <div className="bg-slate-50 border border-slate-200 px-2.5 py-2 rounded-xl space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-[9.5px] text-slate-500 font-bold uppercase tracking-wider">
                              <FileText size={11} className="text-slate-400" />
                              <span>배송관련 메모</span>
                            </div>
                            {editingRowIdx !== item.originalRowIdx && (
                              <button
                                onClick={() => handleStartEdit(item.originalRowIdx, item.deliveryMemo || '')}
                                className="p-0.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition-colors"
                              >
                                <Edit2 size={11} />
                              </button>
                            )}
                          </div>

                          {editingRowIdx === item.originalRowIdx ? (
                            <div className="space-y-1.5 pt-0.5">
                              <textarea
                                rows={2}
                                value={editMemoValue}
                                onChange={(e) => setEditMemoValue(e.target.value)}
                                placeholder="배송 관련 메모를 입력하세요..."
                                className="w-full bg-white border border-slate-300 rounded-md p-1.5 text-[11px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
                              />
                              <div className="flex justify-end gap-1">
                                <button
                                  disabled={isSaving}
                                  onClick={() => setEditingRowIdx(null)}
                                  className="px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:text-slate-900 border border-slate-300 rounded transition-colors"
                                >
                                  취소
                                </button>
                                <button
                                  disabled={isSaving}
                                  onClick={() => handleSaveMemo(item.originalRowIdx)}
                                  className="px-2 py-0.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center gap-1 shadow-sm transition-all active:scale-95"
                                >
                                  {isSaving ? (
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <>
                                      <Check size={11} />
                                      저장
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-700 whitespace-pre-wrap leading-tight">
                              {item.deliveryMemo ? item.deliveryMemo : (
                                <span className="text-slate-400 italic text-[10px]">등록된 메모가 없습니다.</span>
                              )}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2.5"
                  >
                    <FileText size={32} className="text-slate-300" />
                    <p className="text-xs font-semibold">조건에 맞는 배송 정보가 없습니다.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-white border border-slate-200 px-4 py-2.5 rounded-2xl shadow-sm text-xs mt-2 shrink-0">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-700 disabled:text-slate-400 disabled:bg-slate-50 rounded-lg font-bold transition-all active:scale-95"
                >
                  이전
                </button>
                <span className="text-slate-500 font-semibold">
                  <strong className="text-slate-900">{currentPage}</strong> / {totalPages} 페이지
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-700 disabled:text-slate-400 disabled:bg-slate-50 rounded-lg font-bold transition-all active:scale-95"
                >
                  다음
                </button>
              </div>
            )}
          </>
        ) : (
          /* 요약 보고서 (대표님 보고서) 전용 뷰 */
          <div className="space-y-4">
            {/* 본부별 실적 표 */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">본부별 실적</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-700">
                  <thead>
                    <tr className="text-[10px] text-slate-500 uppercase border-b border-slate-100 font-bold bg-slate-50">
                      <th className="py-2.5 px-2">본부명</th>
                      <th className="py-2.5 px-2 text-right">판매건수 ({displayMode})</th>
                      <th className="py-2.5 px-2 text-right">배송완료건수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {hqReportData.length > 0 ? (
                      hqReportData.map((s, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-2 font-bold text-slate-900">{s.hq}</td>
                          <td className="py-2.5 px-2 text-right font-semibold text-blue-600">{s.sales}</td>
                          <td className="py-2.5 px-2 text-right font-semibold text-emerald-600">{s.deliveryCompleted}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-400 italic">집계할 본부 데이터가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 상품별 실적 표 */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">상품별 실적</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-700">
                  <thead>
                    <tr className="text-[10px] text-slate-500 uppercase border-b border-slate-100 font-bold bg-slate-50">
                      <th className="py-2.5 px-2">상품명</th>
                      <th className="py-2.5 px-2 text-right">판매건수 ({displayMode})</th>
                      <th className="py-2.5 px-2 text-right">배송완료건수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {prodReportData.length > 0 ? (
                      prodReportData.map((s, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-2 font-semibold text-slate-900 truncate max-w-[120px]">{s.prodName}</td>
                          <td className="py-2.5 px-2 text-right font-semibold text-blue-600">{s.sales}</td>
                          <td className="py-2.5 px-2 text-right font-semibold text-emerald-600">{s.deliveryCompleted}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-400 italic">집계할 상품 데이터가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tab Navigation Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-6 py-2 flex items-center justify-around z-50 shrink-0 shadow-lg">
        <button
          onClick={() => setActiveTab('detail')}
          className={`flex flex-col items-center justify-center gap-1 transition-all w-24 ${
            activeTab === 'detail' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <FileText size={16} />
          <span className="text-[10px]">상세 계약</span>
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`flex flex-col items-center justify-center gap-1 transition-all w-24 ${
            activeTab === 'report' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <div className="flex items-center gap-1">
            <span className="text-[10px]">요약 보고서</span>
            {showScrollTopBtn && (
              <span
                onClick={(e) => {
                  e.stopPropagation(); // 탭 이동 이벤트 전파 방지
                  if (containerRef.current) {
                    containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="p-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center transition-colors cursor-pointer"
                title="맨 위로"
              >
                <ArrowUp size={8} />
              </span>
            )}
          </div>
        </button>
      </div>

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        username={currentUser.username}
      />
    </div>
  );
};

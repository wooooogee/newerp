import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, LogOut, RefreshCw, Calendar, User, Package, Truck, FileText, Check, X, Edit2, ChevronDown, ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
  const [hideZeroHq, setHideZeroHq] = useState(false);

  // 실적 요약 상세 아코디언 상태
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  // 본부모바일 / 지사모바일 / 관리자모바일 권한 판별
  const isHqMobile = useMemo(() => {
    return currentUser.role === '본부모바일' || 
      (currentUser.orgs && currentUser.orgs.some(o => o.role === '본부모바일'));
  }, [currentUser]);

  const isBranchMobile = useMemo(() => {
    return currentUser.role === '지사모바일' || 
      (currentUser.orgs && currentUser.orgs.some(o => o.role === '지사모바일'));
  }, [currentUser]);

  const isAdminMobile = useMemo(() => {
    return currentUser.role === 'admin모바일' || currentUser.role === '관리자모바일' ||
      (currentUser.orgs && currentUser.orgs.some(o => o.role === 'admin모바일' || o.role === '관리자모바일'));
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
  }, [searchTerm, monthFilter, statusFilter, deliveryFilter, hqFilter, branchFilter, empFilter, displayMode]);

  // 스크롤 탑 이동을 위한 스크롤 컨테이너 Ref
  const containerRef = useRef<HTMLDivElement>(null);

  // 위로가기 플로팅 버튼 활성화 상태
  const [showScrollTopBtn, setShowScrollTopBtn] = useState(false);

  // 스크롤 핸들러 (200px 이상 아래로 내려갈 시 플로팅 버튼 노출)
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setShowScrollTopBtn(scrollTop > 200);
  };

  // 본부 선택 옵션 (관리자모바일 권한일 때만 유의미)
  const hqOptions = useMemo(() => {
    const hqs = new Set<string>();
    data.forEach(item => {
      if (item.hq) hqs.add(item.hq.trim());
    });
    return ['전체', ...Array.from(hqs).sort()];
  }, [data]);

  // 지사 선택 옵션 (관리자/본부모바일 권한일 때만 유의미)
  const branchOptions = useMemo(() => {
    const branches = new Set<string>();
    data.forEach(item => {
      // 관리자모바일인데 특정 본부가 선택되었다면 매칭되는 본부의 지사만 추출
      if (isAdminMobile && hqFilter !== '전체' && item.hq !== hqFilter) return;
      if (item.branch) branches.add(item.branch.trim());
    });
    return ['전체', ...Array.from(branches).sort()];
  }, [data, isAdminMobile, hqFilter]);

  // 영업사원 선택 옵션 (관리자/본부/지사모바일 권한일 때만 유의미)
  const empOptions = useMemo(() => {
    const emps = new Set<string>();
    data.forEach(item => {
      // 관리자모바일인데 특정 본부가 선택되어 있다면 매칭되는 본부의 영업사원만 추출
      if (isAdminMobile && hqFilter !== '전체' && item.hq !== hqFilter) return;
      // 본부모바일(혹은 관리자모바일)인데 특정 지사가 선택되어 있다면 매칭되는 지사의 영업사원만 추출
      if ((isHqMobile || isAdminMobile) && branchFilter !== '전체' && item.branch !== branchFilter) return;
      if (item.empName) emps.add(item.empName.trim());
    });
    return ['전체', ...Array.from(emps).sort()];
  }, [data, isHqMobile, isAdminMobile, hqFilter, branchFilter]);

  // 데이터 내 존재하는 고유 계약월 목록 동적 추출 (YYYY-MM)
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
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a)); // 최신 월 순 정렬
  }, [data]);

  // 1. 계약월 필터가 반영된 1차 가공 데이터
  const monthFilteredData = useMemo(() => {
    return data.filter(item => {
      if (monthFilter !== '전체') {
        const cleanDate = (item.contractDate || '').replace(/[./]/g, '-');
        if (!cleanDate.startsWith(monthFilter)) return false;
      }
      return true;
    });
  }, [data, monthFilter]);

  // 2. 보기 방식(구좌수/상품건수)에 따른 중복 제거 처리 데이터
  const modeProcessedData = useMemo(() => {
    if (displayMode === '구좌수') {
      return monthFilteredData;
    }
    // 상품건수 기준: 동일한 rentalNo 중복 제거
    const uniqueMap = new Map();
    monthFilteredData.forEach(item => {
      if (item.rentalNo && !uniqueMap.has(item.rentalNo)) {
        uniqueMap.set(item.rentalNo, item);
      } else if (!item.rentalNo) {
        uniqueMap.set(item.uniqueKey, item);
      }
    });
    return Array.from(uniqueMap.values());
  }, [monthFilteredData, displayMode]);

  // 3. 요약 통계 계산 (선택된 계약월 및 중복제거 조건이 반영된 데이터 기준)
  const summary = useMemo(() => {
    // 가입 상태가 '가입'인 데이터들로만 필터링하여 대시보드 통계의 모수로 사용 (해약, 취소 제외)
    const activeData = modeProcessedData.filter(item => (item.status || '').trim() === '가입');

    const total = activeData.length;
    const waiting = activeData.filter(item => (item.deliveryStatus || '').trim() === '배송대기').length;
    const completed = activeData.filter(item => (item.deliveryStatus || '').trim() === '배송완료').length;
    
    // 배송 미해당 건수 산출 (배송이 없는 상품군)
    const noDelivery = total - (waiting + completed);

    // 가입 상태별 통계 (이것은 전체 접수 건수 modeProcessedData 기준)
    const signed = modeProcessedData.filter(item => (item.status || '').trim() === '가입').length;
    const terminated = modeProcessedData.filter(item => (item.status || '').trim().includes('해약')).length;
    const cancelled = modeProcessedData.filter(item => (item.status || '').trim().includes('취소')).length;

    return { total, waiting, completed, signed, terminated, cancelled, noDelivery };
  }, [modeProcessedData]);

  // 4. 검색 및 가입/배송 필터링된 최종 렌더링 데이터
  const filteredData = useMemo(() => {
    return modeProcessedData.filter(item => {
      // 관리자모바일 본부 필터링
      if (isAdminMobile && hqFilter !== '전체') {
        if ((item.hq || '').trim() !== hqFilter) return false;
      }

      // 본부모바일(혹은 관리자모바일) 지사 필터링
      if ((isHqMobile || isAdminMobile) && branchFilter !== '전체') {
        if ((item.branch || '').trim() !== branchFilter) return false;
      }

      // 영업사원 필터링 (본부모바일 또는 지사모바일 또는 관리자모바일인 경우)
      if ((isHqMobile || isBranchMobile || isAdminMobile) && empFilter !== '전체') {
        if ((item.empName || '').trim() !== empFilter) return false;
      }

      // 가입상태 필터링
      if (statusFilter !== '전체') {
        const itemStatus = (item.status || '').trim();
        if (statusFilter === '해약' && !itemStatus.includes('해약')) return false;
        if (statusFilter === '취소' && !itemStatus.includes('취소')) return false;
        if (statusFilter === '가입' && itemStatus !== '가입') return false;
      }

      // 배송상태 필터링
      if (deliveryFilter !== '전체') {
        const itemDelivery = (item.deliveryStatus || '').trim();
        if (itemDelivery !== deliveryFilter) return false;
      }

      // 검색어 필터링 (회원명, 상품명, 렌탈상품명)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const searchString = `${item.memName} ${item.prodName} ${item.rentalProd} ${item.rentalNo}`.toLowerCase();
        if (!searchString.includes(term)) return false;
      }

      return true;
    }).sort((a, b) => {
      // 계약일 최신순 정렬
      return String(b.contractDate || '').localeCompare(String(a.contractDate || ''));
    });
  }, [modeProcessedData, searchTerm, statusFilter, deliveryFilter, isHqMobile, isBranchMobile, isAdminMobile, hqFilter, branchFilter, empFilter]);

  // 1페이지당 10개 아이템 기준 전체 페이지 계산
  const totalPages = useMemo(() => {
    return Math.ceil(filteredData.length / 10) || 1;
  }, [filteredData]);

  // 현재 페이지에 해당하는 데이터만 추출
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * 10;
    return filteredData.slice(startIndex, startIndex + 10);
  }, [filteredData, currentPage]);

  // 전체 데이터(data) 내에 존재하는 고유 본부 목록 추출 (0건 실적 본부 표시용)
  const allHqOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach(item => {
      if (item.hq) {
        set.add(item.hq.trim());
      }
    });
    return Array.from(set).sort();
  }, [data]);

  // 본부별 통계 집계 데이터 생성 (상세 필터 영향 배제하고 modeProcessedData 기준 집계)
  const hqReportData = useMemo(() => {
    const map = new Map<string, { hq: string; sales: number; deliveryCompleted: number }>();
    
    // 1. 전체 본부 목록으로 0건 초기화 세팅
    allHqOptions.forEach(hqName => {
      map.set(hqName, { hq: hqName, sales: 0, deliveryCompleted: 0 });
    });

    // 2. 현재 선택된 월의 데이터(modeProcessedData)로 실적 카운트
    modeProcessedData.forEach(item => {
      const hqName = (item.hq || '').trim();
      if (hqName) {
        if (!map.has(hqName)) {
          map.set(hqName, { hq: hqName, sales: 0, deliveryCompleted: 0 });
        }
        const val = map.get(hqName)!;
        val.sales += 1;
        if ((item.deliveryStatus || '').trim() === '배송완료') {
          val.deliveryCompleted += 1;
        }
      }
    });
    
    let list = Array.from(map.values());
    if (hideZeroHq) {
      list = list.filter(h => h.sales > 0);
    }
    return list.sort((a, b) => b.sales - a.sales);
  }, [allHqOptions, modeProcessedData, hideZeroHq]);

  // 상품별 통계 집계 데이터 생성 (modeProcessedData 기준 집계)
  const prodReportData = useMemo(() => {
    const map = new Map<string, { prodName: string; sales: number; deliveryCompleted: number }>();
    modeProcessedData.forEach(item => {
      const prodName = (item.prodName || '기타/미지정').trim();
      if (!map.has(prodName)) {
        map.set(prodName, { prodName, sales: 0, deliveryCompleted: 0 });
      }
      const val = map.get(prodName)!;
      val.sales += 1;
      if ((item.deliveryStatus || '').trim() === '배송완료') {
        val.deliveryCompleted += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }, [modeProcessedData]);

  // 메모 편집 시작
  const handleStartEdit = (rowIdx: number, currentMemo: string) => {
    setEditingRowIdx(rowIdx);
    setEditMemoValue(currentMemo);
  };

  // 메모 저장
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

  // 배송상태에 따른 배지 스타일
  const getDeliveryBadgeClass = (status: string) => {
    const cleanStatus = (status || '').trim();
    switch (cleanStatus) {
      case '배송대기':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
      case '배송완료':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  // 가입상태에 따른 배지 스타일
  const getStatusBadgeClass = (status: string) => {
    const cleanStatus = (status || '').trim();
    if (cleanStatus === '가입') {
      return 'bg-teal-500/15 text-teal-400 border border-teal-500/20';
    } else if (cleanStatus.includes('취소') || cleanStatus.includes('해약')) {
      return 'bg-rose-500/15 text-rose-400 border border-rose-500/20';
    }
    return 'bg-slate-800 text-slate-400 border border-slate-700';
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden max-w-md mx-auto shadow-2xl relative border-x border-slate-800">
      {/* Header */}
      <header className="h-14 bg-slate-950 border-b border-slate-800 px-4 flex justify-between items-center z-50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Truck size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white">The Better Life ERP</h1>
            <p className="text-[10px] text-slate-400">영업사원 배송관리</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onRefresh}
            disabled={loading}
            className={`p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ${loading ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={onLogout}
            className="flex items-center justify-center p-2 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-rose-950/30 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
        {/* User Card */}
        <div className="p-4 bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800/80 rounded-2xl shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/10 border border-blue-500/20 rounded-xl flex items-center justify-center">
              <User className="text-blue-400" size={20} />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-semibold tracking-wider uppercase">Welcome Back</div>
              <div className="text-sm font-bold text-white flex items-center gap-1.5">
                {currentUser.orgName || '영업사원'} 님
                <span className="text-[10px] font-normal text-slate-400 px-1.5 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                  {currentUser.username}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* View Mode Toggle Switch */}
        <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800/80 shadow-md">
          <button
            onClick={() => setDisplayMode('구좌수')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              displayMode === '구좌수' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/15' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            구좌수 기준으로 보기
          </button>
          <button
            onClick={() => setDisplayMode('상품건수')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              displayMode === '상품건수' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/15' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            상품건수로 보기
          </button>
        </div>

        {/* Dashboard Count Cards (3 Columns) & Accordion Switch */}
        <div className="bg-slate-950/20 border border-slate-800/60 rounded-2xl p-3 shadow-md space-y-2 relative">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '전체', count: summary.total, color: 'border-slate-800 bg-slate-950/40 text-slate-300' },
              { label: '배송대기', count: summary.waiting, color: 'border-amber-900/30 bg-amber-950/10 text-amber-400' },
              { label: '배송완료', count: summary.completed, color: 'border-emerald-900/30 bg-emerald-950/10 text-emerald-400' }
            ].map((item, i) => (
              <div
                key={i}
                className={`p-2.5 border rounded-xl flex flex-col items-center justify-center shadow-sm ${item.color}`}
              >
                <span className="text-[10px] text-slate-400 font-medium">{item.label}</span>
                <span className="text-base font-extrabold mt-1">{item.count}</span>
              </div>
            ))}
          </div>

          {/* Toggle button positioned neatly at the bottom right */}
          <div className="flex justify-end pt-1">
            <button
              onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors py-1 px-2.5 bg-slate-900/80 border border-slate-800 rounded-full shadow-sm"
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
                <div className="space-y-3 pt-3 border-t border-slate-900/80">
                  {/* 계약/가입 현황 */}
                  <div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1 px-0.5">계약 현황</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-900/60 border border-slate-900 p-2 rounded-xl flex justify-between items-center">
                        <span className="text-[10px] text-slate-400 font-medium">총 접수건</span>
                        <strong className="text-xs font-bold text-white">{modeProcessedData.length}건</strong>
                      </div>
                      <div className="bg-teal-950/10 border border-teal-900/30 p-2 rounded-xl flex justify-between items-center">
                        <span className="text-[10px] text-teal-400 font-medium">가입 건수</span>
                        <strong className="text-xs font-bold text-teal-400">{summary.signed}건</strong>
                      </div>
                      <div className="bg-rose-950/10 border border-rose-900/30 p-2 rounded-xl flex justify-between items-center">
                        <span className="text-[10px] text-rose-400 font-medium">해약 건수</span>
                        <strong className="text-xs font-bold text-rose-400">{summary.terminated}건</strong>
                      </div>
                      <div className="bg-red-950/10 border border-red-900/30 p-2 rounded-xl flex justify-between items-center">
                        <span className="text-[10px] text-red-400 font-medium">취소 건수</span>
                        <strong className="text-xs font-bold text-red-400">{summary.cancelled}건</strong>
                      </div>
                    </div>
                  </div>

                  {/* 배송 세부 현황 */}
                  <div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1 px-0.5">배송 세부 현황 (가입 건 기준)</div>
                    <div className="grid grid-cols-3 gap-1.5 text-xs">
                      <div className="bg-amber-950/10 border border-amber-900/20 p-2.5 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-[9px] text-amber-400 font-medium">배송 대기</span>
                        <strong className="text-xs font-bold text-amber-400 mt-0.5">{summary.waiting}건</strong>
                      </div>
                      <div className="bg-emerald-950/10 border border-emerald-900/20 p-2.5 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-[9px] text-emerald-400 font-medium">배송 완료</span>
                        <strong className="text-xs font-bold text-emerald-400 mt-0.5">{summary.completed}건</strong>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-[9px] text-slate-400 font-medium">배송 미해당</span>
                        <strong className="text-xs font-bold text-slate-200 mt-0.5">{summary.noDelivery}건</strong>
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
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl shadow-md space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-900 pb-2">필터 상세 설정</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {/* 계약월 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400 font-bold">계약 월</label>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="전체">전체</option>
                  {uniqueMonths.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              {/* 가입상태 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400 font-bold">가입상태</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="전체">전체</option>
                  <option value="가입">가입</option>
                  <option value="해약">해약</option>
                  <option value="취소">취소</option>
                </select>
              </div>
              {/* 배송상태 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400 font-bold">배송상태</label>
                <select
                  value={deliveryFilter}
                  onChange={(e) => setDeliveryFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="전체">전체</option>
                  <option value="배송대기">배송대기</option>
                  <option value="배송완료">배송완료</option>
                </select>
              </div>
            </div>

            {/* 본부/지사/관리자모바일용 하위 조직 필터링 */}
            {(isHqMobile || isBranchMobile || isAdminMobile) && (
              <div className="flex flex-col gap-2 pt-3 border-t border-slate-900/60">
                {isAdminMobile && (
                  <div className="flex flex-col gap-1.5 text-xs">
                    <label className="text-[10px] text-slate-400 font-bold">본부 선택</label>
                    <select
                      value={hqFilter}
                      onChange={(e) => {
                        setHqFilter(e.target.value);
                        setBranchFilter('전체');
                        setEmpFilter('전체');
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      {hqOptions.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(isHqMobile || isAdminMobile) && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-slate-400 font-bold">지사/지점 선택</label>
                      <select
                        value={branchFilter}
                        onChange={(e) => {
                          setBranchFilter(e.target.value);
                          setEmpFilter('전체');
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                      >
                        {branchOptions.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className={`flex flex-col gap-1.5 ${(isHqMobile || isAdminMobile) ? 'col-span-1' : 'col-span-2'}`}>
                    <label className="text-[10px] text-slate-400 font-bold">영업사원 선택</label>
                    <select
                      value={empFilter}
                      onChange={(e) => setEmpFilter(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      {empOptions.map(e => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* 요약 보고서 탭일 때의 간소화된 월 선택 필터 및 0건 숨기기 토글 */
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl shadow-md flex items-center justify-between gap-4">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 font-bold">계약 월 선택</label>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="전체">전체</option>
                {uniqueMonths.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            
            <div className="flex flex-col items-end gap-1.5 pt-4">
              <span className="text-[10px] text-slate-400 font-bold">0건 본부 숨기기</span>
              <button
                type="button"
                onClick={() => setHideZeroHq(!hideZeroHq)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  hideZeroHq ? 'bg-blue-600' : 'bg-slate-800'
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
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* List Header */}
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
              <span>검색 결과: <strong className="text-white font-semibold">{filteredData.length}</strong>건</span>
            </div>

            {/* Card List */}
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {paginatedData.length > 0 ? (
                  paginatedData.map((item) => (
                    <motion.div
                      key={item.uniqueKey}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="p-4 bg-slate-950 border border-slate-800/80 rounded-2xl shadow-md space-y-3"
                    >
                      {/* Card Title Line */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-white">{item.memName || '-'}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${getStatusBadgeClass(item.status)}`}>
                            {item.status || '가입'}
                          </span>
                        </div>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded font-semibold border ${getDeliveryBadgeClass(item.deliveryStatus)}`}>
                          {item.deliveryStatus || '배송대기'}
                        </span>
                      </div>

                      {/* Card Body Details */}
                      <div className="grid grid-cols-2 gap-y-2 gap-x-4 border-t border-slate-900/60 pt-3 text-[11px]">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Calendar size={13} className="text-slate-500" />
                          <span>계약일자: <strong className="text-slate-200">{item.contractDate || '-'}</strong></span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <Package size={13} className="text-slate-500" />
                          <span className="truncate">상 조: <strong className="text-slate-200" title={item.prodName}>{item.prodName || '-'}</strong></span>
                        </div>
                        <div className="col-span-2 flex items-center gap-2 text-slate-400">
                          <Truck size={13} className="text-slate-500" />
                          <span className="truncate">렌탈상품: <strong className="text-slate-200" title={item.rentalProd}>{item.rentalProd || '-'}</strong></span>
                        </div>
                      </div>

                      {/* Delivery Memo Area */}
                      <div className="bg-slate-900/60 border border-slate-900 p-3 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            <FileText size={12} className="text-slate-500" />
                            <span>배송관련 메모</span>
                          </div>
                          {editingRowIdx !== item.originalRowIdx && (
                            <button
                              onClick={() => handleStartEdit(item.originalRowIdx, item.deliveryMemo || '')}
                              className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
                            >
                              <Edit2 size={12} />
                            </button>
                          )}
                        </div>

                        {editingRowIdx === item.originalRowIdx ? (
                          <div className="space-y-2">
                            <textarea
                              rows={2}
                              value={editMemoValue}
                              onChange={(e) => setEditMemoValue(e.target.value)}
                              placeholder="배송 관련 메모를 입력하세요..."
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                disabled={isSaving}
                                onClick={() => setEditingRowIdx(null)}
                                className="px-2.5 py-1 text-[10px] font-bold text-slate-400 hover:text-white border border-slate-800 rounded-md transition-colors"
                              >
                                취소
                              </button>
                              <button
                                disabled={isSaving}
                                onClick={() => handleSaveMemo(item.originalRowIdx)}
                                className="px-2.5 py-1 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-md flex items-center gap-1 shadow-md transition-all active:scale-95"
                              >
                                {isSaving ? (
                                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <Check size={12} />
                                    저장
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {item.deliveryMemo ? item.deliveryMemo : (
                              <span className="text-slate-600 italic">등록된 메모가 없습니다.</span>
                            )}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2.5"
                  >
                    <FileText size={32} className="text-slate-700" />
                    <p className="text-xs font-semibold">조건에 맞는 배송 정보가 없습니다.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-slate-950 border border-slate-800/80 px-4 py-2.5 rounded-2xl shadow-md text-xs mt-2 shrink-0">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-300 disabled:text-slate-600 disabled:bg-slate-950 rounded-lg font-bold transition-all active:scale-95"
                >
                  이전
                </button>
                <span className="text-slate-400 font-semibold">
                  <strong className="text-white">{currentPage}</strong> / {totalPages} 페이지
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-300 disabled:text-slate-600 disabled:bg-slate-950 rounded-lg font-bold transition-all active:scale-95"
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
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl shadow-md space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-900 pb-2">본부별 실적</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-300">
                  <thead>
                    <tr className="text-[10px] text-slate-500 uppercase border-b border-slate-900 font-bold">
                      <th className="py-2">본부명</th>
                      <th className="py-2 text-right">판매건수 ({displayMode})</th>
                      <th className="py-2 text-right">배송완료건수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60">
                    {hqReportData.length > 0 ? (
                      hqReportData.map((s, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/30 transition-colors">
                          <td className="py-2.5 font-bold text-white">{s.hq}</td>
                          <td className="py-2.5 text-right font-semibold text-blue-400">{s.sales}</td>
                          <td className="py-2.5 text-right font-semibold text-emerald-400">{s.deliveryCompleted}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-600 italic">집계할 본부 데이터가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 상품별 실적 표 */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl shadow-md space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-900 pb-2">상품별 실적</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-300">
                  <thead>
                    <tr className="text-[10px] text-slate-500 uppercase border-b border-slate-900 font-bold">
                      <th className="py-2">상품명</th>
                      <th className="py-2 text-right">판매건수 ({displayMode})</th>
                      <th className="py-2 text-right">배송완료건수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60">
                    {prodReportData.length > 0 ? (
                      prodReportData.map((s, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/30 transition-colors">
                          <td className="py-2.5 font-semibold text-white truncate max-w-[120px]">{s.prodName}</td>
                          <td className="py-2.5 text-right font-semibold text-blue-400">{s.sales}</td>
                          <td className="py-2.5 text-right font-semibold text-emerald-400">{s.deliveryCompleted}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-600 italic">집계할 상품 데이터가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scroll To Top Floating Button */}
      <AnimatePresence>
        {showScrollTopBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => {
              if (containerRef.current) {
                containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="fixed bottom-20 right-6 w-10 h-10 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg border border-blue-400/20 z-50 transition-all active:scale-95"
            title="맨 위로"
          >
            <ArrowUp size={20} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Tab Navigation Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-14 bg-slate-950/95 border-t border-slate-900 px-6 py-2 flex items-center justify-around z-50 shrink-0">
        <button
          onClick={() => setActiveTab('detail')}
          className={`flex flex-col items-center justify-center gap-1 transition-all w-24 ${
            activeTab === 'detail' ? 'text-blue-500 font-bold' : 'text-slate-500 hover:text-slate-400'
          }`}
        >
          <FileText size={16} />
          <span className="text-[10px]">상세 계약</span>
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`flex flex-col items-center justify-center gap-1 transition-all w-24 ${
            activeTab === 'report' ? 'text-blue-500 font-bold' : 'text-slate-500 hover:text-slate-400'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <span className="text-[10px]">요약 보고서</span>
        </button>
      </div>
    </div>
  );
};

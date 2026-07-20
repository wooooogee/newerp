import React, { useState, useMemo } from 'react';
import { Search, LogOut, RefreshCw, Calendar, User, Package, Truck, FileText, Check, X, Edit2 } from 'lucide-react';
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
  const [monthFilter, setMonthFilter] = useState('전체'); // 전체, YYYY-MM
  const [displayMode, setDisplayMode] = useState<'구좌수' | '상품건수'>('구좌수'); // 구좌수, 상품건수
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [editMemoValue, setEditMemoValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 본부모바일 / 지사모바일 권한 판별
  const isHqMobile = useMemo(() => {
    return currentUser.role === '본부모바일' || 
      (currentUser.orgs && currentUser.orgs.some(o => o.role === '본부모바일'));
  }, [currentUser]);

  const isBranchMobile = useMemo(() => {
    return currentUser.role === '지사모바일' || 
      (currentUser.orgs && currentUser.orgs.some(o => o.role === '지사모바일'));
  }, [currentUser]);

  // 본부/지사용 서브 필터 상태
  const [branchFilter, setBranchFilter] = useState('전체');
  const [empFilter, setEmpFilter] = useState('전체');

  // 지사 선택 옵션 (본부모바일 권한일 때만 유의미)
  const branchOptions = useMemo(() => {
    const branches = new Set<string>();
    data.forEach(item => {
      if (item.branch) branches.add(item.branch.trim());
    });
    return ['전체', ...Array.from(branches).sort()];
  }, [data]);

  // 영업사원 선택 옵션 (본부/지사모바일 권한일 때만 유의미)
  const empOptions = useMemo(() => {
    const emps = new Set<string>();
    data.forEach(item => {
      // 본부모바일인데 특정 지사가 선택되어 있다면 매칭되는 지사의 영업사원만 추출
      if (isHqMobile && branchFilter !== '전체' && item.branch !== branchFilter) return;
      if (item.empName) emps.add(item.empName.trim());
    });
    return ['전체', ...Array.from(emps).sort()];
  }, [data, isHqMobile, branchFilter]);

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
    const total = modeProcessedData.length;
    const waiting = modeProcessedData.filter(item => (item.deliveryStatus || '').trim() === '배송대기').length;
    const completed = modeProcessedData.filter(item => (item.deliveryStatus || '').trim() === '배송완료').length;
    return { total, waiting, completed };
  }, [modeProcessedData]);

  // 4. 검색 및 가입/배송 필터링된 최종 렌더링 데이터
  const filteredData = useMemo(() => {
    return modeProcessedData.filter(item => {
      // 본부모바일 지사 필터링
      if (isHqMobile && branchFilter !== '전체') {
        if ((item.branch || '').trim() !== branchFilter) return false;
      }

      // 영업사원 필터링 (본부모바일 또는 지사모바일인 경우)
      if ((isHqMobile || isBranchMobile) && empFilter !== '전체') {
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
  }, [modeProcessedData, searchTerm, statusFilter, deliveryFilter, isHqMobile, isBranchMobile, branchFilter, empFilter]);

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
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
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

        {/* Dashboard Count Cards (3 Columns) */}
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

        {/* Filters Select Area */}
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

          {/* 본부/지사모바일용 하위 조직 필터링 */}
          {(isHqMobile || isBranchMobile) && (
            <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-slate-900/60">
              {isHqMobile && (
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
              <div className={`flex flex-col gap-1.5 ${isHqMobile ? 'col-span-1' : 'col-span-2'}`}>
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
          )}
        </div>

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
            {filteredData.length > 0 ? (
              filteredData.map((item) => (
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
      </div>
    </div>
  );
};

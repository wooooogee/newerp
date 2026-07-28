import React, { useState, useMemo } from 'react';
import { X, Calendar, Building2, CheckSquare, Filter, Download, Check, ListFilter, BarChart3 } from 'lucide-react';
import { motion } from 'motion/react';

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
  hq: string;           // H(7)
  branch: string;       // I(8)
  salesperson?: string; // J(9)
  empName?: string;     // J(9)
  status: string;       // B(1)
  deliveryStatus?: string; // L(11)
  paymentStatus?: string;  // T(19) - 상조가입신청서 (O,X)
  deliveryMemo?: string;   // Y(24) - 렌탈출금/메모
  raw?: any[];
}

interface AdvancedSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ERPDataItem[];
  allHqs: string[];
}

export const AdvancedSearchModal: React.FC<AdvancedSearchModalProps> = ({
  isOpen,
  onClose,
  data,
  allHqs,
}) => {
  // 탭 상태: 'summary' (요약 및 본부별 실적) | 'details' (상세 계약 목록 페이지)
  const [activeTab, setActiveTab] = useState<'summary' | 'details'>('summary');

  // 1. 기간 선택 (YYYY-MM-DD)
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // 2. 본부 다중 선택 (기본: 전체 선택)
  const [selectedHqs, setSelectedHqs] = useState<string[]>([]);

  // 3. 조건 선택 (가입건, 배송완료건, 취소/해약건)
  const [conditionJoin, setConditionJoin] = useState<boolean>(true);
  const [conditionDelivery, setConditionDelivery] = useState<boolean>(true);
  const [conditionCancel, setConditionCancel] = useState<boolean>(true);

  // 모달이 처음 열릴 때 초기화
  React.useEffect(() => {
    if (isOpen && selectedHqs.length === 0 && allHqs.length > 0) {
      setSelectedHqs([...allHqs]);
    }
  }, [isOpen, allHqs]);

  // 빠른 기간 설정 핸들러
  const handleQuickPeriod = (type: 'today' | 'thisMonth' | 'lastMonth' | '3months' | 'all') => {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().substring(0, 10);

    if (type === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }

    if (type === 'today') {
      const dateStr = formatDate(today);
      setStartDate(dateStr);
      setEndDate(dateStr);
      return;
    }

    if (type === 'thisMonth') {
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      setStartDate(`${y}-${m}-01`);
      setEndDate(formatDate(today));
      return;
    }

    if (type === 'lastMonth') {
      const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDayOfLastMonth = new Date(firstOfThisMonth.getTime() - 86400000);
      const firstDayOfLastMonth = new Date(lastDayOfLastMonth.getFullYear(), lastDayOfLastMonth.getMonth(), 1);
      setStartDate(formatDate(firstDayOfLastMonth));
      setEndDate(formatDate(lastDayOfLastMonth));
      return;
    }

    if (type === '3months') {
      const d = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      setStartDate(formatDate(d));
      setEndDate(formatDate(today));
      return;
    }
  };

  // 본부 전체 선택 / 해제
  const toggleSelectAllHqs = () => {
    if (selectedHqs.length === allHqs.length) {
      setSelectedHqs([]);
    } else {
      setSelectedHqs([...allHqs]);
    }
  };

  const toggleHq = (hq: string) => {
    setSelectedHqs(prev =>
      prev.includes(hq) ? prev.filter(h => h !== hq) : [...prev, hq]
    );
  };

  // 필터링된 결과 데이터 계산
  const filteredResults = useMemo(() => {
    if (!isOpen) return [];

    return data.filter(item => {
      // 1. 기간 필터
      if (startDate || endDate) {
        const itemDate = (item.contractDate || '').replace(/\./g, '-');
        if (startDate && itemDate < startDate) return false;
        if (endDate && itemDate > endDate) return false;
      }

      // 2. 본부 필터
      if (selectedHqs.length > 0 && !selectedHqs.includes(item.hq)) {
        return false;
      }

      // 3. 조건 필터 (가입, 배송완료, 취소해약)
      const isCancel = item.status.includes('취소') || item.status.includes('해약') || item.status.includes('철회') || item.status.includes('반품');
      const isDelivery = (item.deliveryStatus && item.deliveryStatus.includes('배송완료')) || item.status.includes('배송');
      const isJoin = !isCancel; // 정상 가입/유효건

      let matchCondition = false;
      if (conditionJoin && isJoin) matchCondition = true;
      if (conditionDelivery && isDelivery) matchCondition = true;
      if (conditionCancel && isCancel) matchCondition = true;

      // 만약 세 가지 조건 체크박스가 모두 해제되어 있으면 전체 제외
      if (!conditionJoin && !conditionDelivery && !conditionCancel) return false;

      return matchCondition;
    });
  }, [data, startDate, endDate, selectedHqs, conditionJoin, conditionDelivery, conditionCancel, isOpen]);

  // 본부별 요약 통계 계산
  const hqSummaryStats = useMemo(() => {
    const map = new Map<string, { join: number; delivery: number; cancel: number; total: number }>();

    filteredResults.forEach(item => {
      const hq = item.hq || '기타';
      if (!map.has(hq)) {
        map.set(hq, { join: 0, delivery: 0, cancel: 0, total: 0 });
      }
      const stat = map.get(hq)!;
      stat.total += 1;

      const isCancel = item.status.includes('취소') || item.status.includes('해약') || item.status.includes('철회') || item.status.includes('반품');
      const isDelivery = (item.deliveryStatus && item.deliveryStatus.includes('배송완료')) || item.status.includes('배송');

      if (isCancel) {
        stat.cancel += 1;
      } else {
        stat.join += 1;
      }
      if (isDelivery) {
        stat.delivery += 1;
      }
    });

    return Array.from(map.entries()).map(([hqName, stats]) => ({
      hqName,
      ...stats
    })).sort((a, b) => b.total - a.total);
  }, [filteredResults]);

  // 총계 통계
  const totalJoinCount = filteredResults.filter(i => !(i.status.includes('취소') || i.status.includes('해약') || i.status.includes('철회') || i.status.includes('반품'))).length;
  const totalDeliveryCount = filteredResults.filter(i => (i.deliveryStatus && i.deliveryStatus.includes('배송완료')) || i.status.includes('배송')).length;
  const totalCancelCount = filteredResults.filter(i => i.status.includes('취소') || i.status.includes('해약') || i.status.includes('철회') || i.status.includes('반품')).length;

  // 엑셀 내보내기
  const exportToExcel = () => {
    const XLSX = (window as any).XLSX;
    if (!XLSX) {
      alert('엑셀 라이브러리를 로드할 수 없습니다.');
      return;
    }

    const rows = filteredResults.map((item, idx) => ({
      '순번': idx + 1,
      '계약일자': item.contractDate || '',
      '회원번호': item.memNo || '',
      '회원명': item.memName || '',
      '본부': item.hq || '',
      '사원명': item.salesperson || item.empName || '',
      '상품명': item.prodName || '',
      '제품명': item.rentalProd || '',
      '계약상태': item.status || '',
      '배송상태': item.deliveryStatus || '',
      '상조가입신청서': item.paymentStatus || (item.raw && item.raw[19]) || '',
      '상조출금': (item.raw && item.raw[21]) ? String(item.raw[21]).trim() : '',
      '렌탈출금': item.deliveryMemo || (item.raw && item.raw[24]) ? String(item.raw[24]).trim() : ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // 열 크기(너비) 자동 조절 (텍스트 잘림 방지)
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      const colWidths = keys.map(key => {
        let maxLen = key.split('').reduce((acc, c) => acc + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
        rows.forEach(row => {
          const val = (row as any)[key] !== undefined && (row as any)[key] !== null ? String((row as any)[key]) : '';
          const len = val.split('').reduce((acc, c) => acc + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
          if (len > maxLen) maxLen = len;
        });
        return { wch: Math.max(Math.ceil(maxLen + 4), 10) };
      });
      ws['!cols'] = colWidths;
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '조건별검색결과');
    XLSX.writeFile(wb, `조건별검색결과_${new Date().toISOString().substring(0, 10)}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* 백드롭 */}
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

      {/* 모달 컨테이너 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-white w-full max-w-5xl h-[88vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10"
      >
        {/* 헤더 */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Filter className="text-blue-400" size={20} />
            <h2 className="text-base font-black tracking-tight">조건별 통합 검색 및 통계 조회</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* 탭 메뉴 전환 바 (페이지 1: 요약 및 본부별 실적, 페이지 2: 상세 계약 목록) */}
        <div className="flex bg-slate-900 border-b border-slate-800 px-6 shrink-0">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-5 py-2.5 text-xs font-black transition-colors border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'summary'
                ? 'border-blue-500 text-white bg-slate-800/80'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <BarChart3 size={14} className={activeTab === 'summary' ? 'text-blue-400' : 'text-slate-400'} />
            조건 설정 및 요약 통계
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={`px-5 py-2.5 text-xs font-black transition-colors border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'details'
                ? 'border-blue-500 text-white bg-slate-800/80'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <ListFilter size={14} className={activeTab === 'details' ? 'text-blue-400' : 'text-slate-400'} />
            상세 계약 목록 페이지 ({filteredResults.length}건)
          </button>
        </div>

        {/* 바디 영역 */}
        <div className="flex-1 overflow-y-auto flex flex-col p-6 gap-6 bg-slate-50">
          {/* ================= 탭 1: 조건 설정 및 요약 통계 페이지 ================= */}
          {activeTab === 'summary' && (
            <>
              {/* 1. 조건 설정 필터 패널 */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col gap-4">
                {/* 1행: 기간 설정 */}
                <div className="flex flex-col md:flex-row md:items-center gap-3 border-b border-slate-100 pb-4">
                  <span className="text-xs font-black text-slate-700 w-28 shrink-0 flex items-center gap-1.5">
                    <Calendar size={14} className="text-blue-600" /> 기간 설정
                  </span>
                  <div className="flex items-center gap-2 flex-wrap flex-1">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                    />
                    <span className="text-xs text-slate-400 font-bold">~</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                    />
                    <div className="flex items-center gap-1 ml-auto flex-wrap">
                      <button onClick={() => handleQuickPeriod('today')} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold cursor-pointer">오늘</button>
                      <button onClick={() => handleQuickPeriod('thisMonth')} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold cursor-pointer">이번 달</button>
                      <button onClick={() => handleQuickPeriod('lastMonth')} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold cursor-pointer">지난 달</button>
                      <button onClick={() => handleQuickPeriod('3months')} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold cursor-pointer">최근 3개월</button>
                      <button onClick={() => handleQuickPeriod('all')} className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-[11px] font-bold cursor-pointer">전체 기간</button>
                    </div>
                  </div>
                </div>

                {/* 2행: 조건 선택 (가입, 배송완료, 취소해약) */}
                <div className="flex flex-col md:flex-row md:items-center gap-3 border-b border-slate-100 pb-4">
                  <span className="text-xs font-black text-slate-700 w-28 shrink-0 flex items-center gap-1.5">
                    <CheckSquare size={14} className="text-emerald-600" /> 조건 선택
                  </span>
                  <div className="flex items-center gap-6 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={conditionJoin}
                        onChange={(e) => setConditionJoin(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>가입 건수 (정상/유효)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={conditionDelivery}
                        onChange={(e) => setConditionDelivery(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                      />
                      <span>배송완료 건수</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={conditionCancel}
                        onChange={(e) => setConditionCancel(e.target.checked)}
                        className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                      />
                      <span>취소 및 해약 건수</span>
                    </label>
                  </div>
                </div>

                {/* 3행: 본부 선택 (다중 선택 가능) */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                      <Building2 size={14} className="text-indigo-600" /> 본부 선택 (다중선택 가능)
                      <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {selectedHqs.length}개 선택됨
                      </span>
                    </span>
                    <button
                      onClick={toggleSelectAllHqs}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                    >
                      {selectedHqs.length === allHqs.length ? '전체 해제' : '전체 선택'}
                    </button>
                  </div>

                  {/* 본부 칩 태그 리스트 */}
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    {allHqs.map((hq) => {
                      const isSelected = selectedHqs.includes(hq);
                      return (
                        <button
                          key={hq}
                          onClick={() => toggleHq(hq)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all flex items-center gap-1 border cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {isSelected && <Check size={12} />}
                          {hq}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 2. 요약 통계 집계 카드 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                  <span className="text-xs font-bold text-slate-500">총 조회 결과</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {filteredResults.length.toLocaleString()}<span className="text-sm font-normal text-slate-500 ml-1">건</span>
                  </div>
                </div>
                <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 shadow-xs flex flex-col justify-between">
                  <span className="text-xs font-bold text-emerald-700">가입 건수</span>
                  <div className="text-2xl font-black text-emerald-600 mt-1">
                    {totalJoinCount.toLocaleString()}<span className="text-sm font-normal text-emerald-700 ml-1">건</span>
                  </div>
                </div>
                <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 shadow-xs flex flex-col justify-between">
                  <span className="text-xs font-bold text-blue-700">배송완료 건수</span>
                  <div className="text-2xl font-black text-blue-600 mt-1">
                    {totalDeliveryCount.toLocaleString()}<span className="text-sm font-normal text-blue-700 ml-1">건</span>
                  </div>
                </div>
                <div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-100 shadow-xs flex flex-col justify-between">
                  <span className="text-xs font-bold text-rose-700">취소/해약 건수</span>
                  <div className="text-2xl font-black text-rose-600 mt-1">
                    {totalCancelCount.toLocaleString()}<span className="text-sm font-normal text-rose-700 ml-1">건</span>
                  </div>
                </div>
              </div>

              {/* 3. 본부별 실적 현황 요약 카드 */}
              {hqSummaryStats.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800">■ 선택 본부별 실적 현황 요약</span>
                    <button
                      onClick={() => setActiveTab('details')}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                    >
                      상세 계약 목록 페이지로 이동 &rarr;
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                    {hqSummaryStats.map(stat => (
                      <div key={stat.hqName} className="bg-slate-50/70 p-3 rounded-xl border border-slate-200 text-xs flex flex-col gap-1.5">
                        <span className="font-extrabold text-slate-900 truncate">{stat.hqName}</span>
                        <div className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                          <div className="flex justify-between"><span>가입:</span> <strong className="text-emerald-600">{stat.join}건</strong></div>
                          <div className="flex justify-between"><span>배송:</span> <strong className="text-blue-600">{stat.delivery}건</strong></div>
                          <div className="flex justify-between"><span>취소:</span> <strong className="text-rose-500">{stat.cancel}건</strong></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ================= 탭 2: 상세 계약 목록 전용 페이지 ================= */}
          {activeTab === 'details' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden flex-1">
              {/* 테이블 상단 헤더 툴바 */}
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-800">상세 계약 목록 데이터</span>
                  <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[11px] font-black">
                    총 {filteredResults.length.toLocaleString()}건
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveTab('summary')}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    &larr; 조건 설정으로 이동
                  </button>
                  <button
                    onClick={exportToExcel}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Download size={13} /> 엑셀 다운로드
                  </button>
                </div>
              </div>

              {/* 상세 테이블 데이터 페이지 */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 border-b border-slate-200 z-10">
                    <tr>
                      <th className="p-3 text-center w-12 whitespace-nowrap">순번</th>
                      <th className="p-3 whitespace-nowrap">계약일자</th>
                      <th className="p-3 whitespace-nowrap">회원번호</th>
                      <th className="p-3 whitespace-nowrap">회원명</th>
                      <th className="p-3 whitespace-nowrap">본부</th>
                      <th className="p-3 whitespace-nowrap">사원명</th>
                      <th className="p-3 whitespace-nowrap">상품명</th>
                      <th className="p-3 whitespace-nowrap">제품명</th>
                      <th className="p-3 text-center whitespace-nowrap">계약상태</th>
                      <th className="p-3 text-center whitespace-nowrap">배송상태</th>
                      <th className="p-3 text-center whitespace-nowrap">상조가입신청서</th>
                      <th className="p-3 text-center whitespace-nowrap">상조출금</th>
                      <th className="p-3 text-center whitespace-nowrap">렌탈출금</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredResults.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="p-16 text-center text-slate-400 font-bold">
                          선택하신 조건에 부합하는 상세 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredResults.slice(0, 500).map((item, idx) => {
                        const isCancel = item.status.includes('취소') || item.status.includes('해약') || item.status.includes('철회') || item.status.includes('반품');
                        const mutualAidApp = item.paymentStatus || (item.raw && item.raw[19]) || '-';
                        const mutualAidWithdrawal = (item.raw && item.raw[21]) ? String(item.raw[21]).trim() : '-';
                        const rentalWithdrawal = item.deliveryMemo || (item.raw && item.raw[24]) ? String(item.raw[24]).trim() : '-';

                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                            <td className="p-3 font-semibold whitespace-nowrap">{item.contractDate || '-'}</td>
                            <td className="p-3 font-mono font-medium whitespace-nowrap">{item.memNo || '-'}</td>
                            <td className="p-3 font-bold text-slate-900 whitespace-nowrap">{item.memName || '-'}</td>
                            <td className="p-3 font-semibold whitespace-nowrap">{item.hq || '-'}</td>
                            <td className="p-3 text-slate-600 whitespace-nowrap">{item.salesperson || item.empName || '-'}</td>
                            <td className="p-3 font-medium truncate max-w-[160px]" title={item.prodName}>{item.prodName || '-'}</td>
                            <td className="p-3 font-medium truncate max-w-[160px]" title={item.rentalProd}>{item.rentalProd || '-'}</td>
                            <td className="p-3 text-center whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                isCancel
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                {item.status || '정상'}
                              </span>
                            </td>
                            <td className="p-3 text-center whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                (item.deliveryStatus && item.deliveryStatus.includes('배송완료'))
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}>
                                {item.deliveryStatus || '-'}
                              </span>
                            </td>
                            <td className="p-3 text-center whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                                mutualAidApp === 'O' || mutualAidApp === 'o'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : mutualAidApp === 'X' || mutualAidApp === 'x'
                                  ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                  : 'text-slate-500'
                              }`}>
                                {mutualAidApp}
                              </span>
                            </td>
                            <td className="p-3 text-center whitespace-nowrap font-medium text-slate-700">
                              {mutualAidWithdrawal}
                            </td>
                            <td className="p-3 text-center whitespace-nowrap font-medium text-slate-700 max-w-[140px] truncate" title={rentalWithdrawal}>
                              {rentalWithdrawal}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                {filteredResults.length > 500 && (
                  <div className="p-3 text-center text-xs text-slate-400 font-bold bg-slate-50 border-t border-slate-100">
                    ⚠️ 화면에는 상위 500건까지 표시됩니다. 전체 {filteredResults.length.toLocaleString()}건은 [엑셀 다운로드] 버튼으로 전체 추출할 수 있습니다.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            💡 상단 탭(조건 설정 / 상세 계약 목록 페이지)을 클릭하여 화면을 자유롭게 전환할 수 있습니다.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            닫기
          </button>
        </div>
      </motion.div>
    </div>
  );
};

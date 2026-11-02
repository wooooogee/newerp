import React, { useState, useEffect, useMemo } from 'react';
import {
  Download,
  Search,
  RefreshCw,
  AlertCircle,
  Calendar,
  Building2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Layers,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  CreditCard
} from 'lucide-react';
import { autoFitColWidths, applyTableExcelStyle } from './excelStyleUtils';

// @ts-ignore
const getXLSX = () => (window as any).XLSX;

export interface FirstPayUnpaidItem {
  contractDate: string;
  status: string;
  memName: string;
  memberNo: string;
  productName: string;
  rentalNo: string;
  productModel: string;
  hq: string;
  branch: string;
  employee: string;
  sangjoFirstPayDate: string;
  rentalWithdrawDate: string;
  isSangjoPaid: boolean;
  isRentalPaid: boolean;
}

export interface DivisionOption {
  id: string;
  name: string;
  hqNames: string[];
}

interface FilterOptions {
  divisions: DivisionOption[];
  hqs: string[];
  branches: string[];
  products: string[];
  statuses: string[];
}

interface FirstPaySummary {
  totalCount: number;
  totalUnpaidCount: number;
  sangjoUnpaidCount: number;
  sangjoPaidCount: number;
  rentalUnpaidCount: number;
  rentalPaidCount: number;
  bothUnpaidCount: number;
  bothPaidCount: number;
}

export type PayFilterType =
  | 'ALL'
  | 'ALL_UNPAID'
  | 'SANGJO_UNPAID'
  | 'SANGJO_PAID'
  | 'RENTAL_UNPAID'
  | 'RENTAL_PAID'
  | 'BOTH_UNPAID'
  | 'BOTH_PAID';

interface FirstPayUnpaidTabProps {
  onRefreshParent?: () => void;
}

export const FirstPayUnpaidTab: React.FC<FirstPayUnpaidTabProps> = () => {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [items, setItems] = useState<FirstPayUnpaidItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    divisions: [],
    hqs: [],
    branches: [],
    products: [],
    statuses: [],
  });
  const [summary, setSummary] = useState<FirstPaySummary>({
    totalCount: 0,
    totalUnpaidCount: 0,
    sangjoUnpaidCount: 0,
    sangjoPaidCount: 0,
    rentalUnpaidCount: 0,
    rentalPaidCount: 0,
    bothUnpaidCount: 0,
    bothPaidCount: 0,
  });

  // 필터 조건 상태
  const [startMonth, setStartMonth] = useState('2026-05');
  const [endMonth, setEndMonth] = useState('');
  const [payFilter, setPayFilter] = useState<PayFilterType>('ALL');

  // 계층 필터
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedHq, setSelectedHq] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 정렬 상태 (기본 계약일 내림차순)
  const [sortField, setSortField] = useState<keyof FirstPayUnpaidItem>('contractDate');
  const [sortAsc, setSortAsc] = useState(false);

  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // 사업단 캐스케이딩 본부 목록
  const availableHqs = useMemo(() => {
    if (!selectedDivision) return filterOptions.hqs;
    const div = filterOptions.divisions.find(d => d.id === selectedDivision || d.name === selectedDivision);
    if (!div || !Array.isArray(div.hqNames) || div.hqNames.length === 0) {
      return filterOptions.hqs;
    }
    const hqNameList: string[] = div.hqNames.map(h => String(h || '').trim().toLowerCase());
    const set = new Set<string>(hqNameList);
    return filterOptions.hqs.filter(hq => {
      const cleanHq = hq.trim().toLowerCase();
      if (set.has(cleanHq)) return true;
      for (const dHq of hqNameList) {
        if (cleanHq.includes(dHq) || dHq.includes(cleanHq)) return true;
      }
      return false;
    });
  }, [selectedDivision, filterOptions.divisions, filterOptions.hqs]);

  const handleDivisionChange = (divVal: string) => {
    setSelectedDivision(divVal);
    setSelectedHq('');
  };

  // 데이터 로드
  const fetchData = async (forceSync = false) => {
    if (forceSync) setSyncing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (startMonth) params.append('startContractDate', startMonth);
      if (endMonth) params.append('endContractDate', endMonth);
      if (payFilter) params.append('payFilter', payFilter);
      if (selectedDivision) params.append('division', selectedDivision);
      if (selectedHq) params.append('hq', selectedHq);
      if (selectedBranch) params.append('branch', selectedBranch);
      if (selectedProduct) params.append('product', selectedProduct);
      if (selectedStatus) params.append('status', selectedStatus);
      if (searchKeyword.trim()) params.append('search', searchKeyword.trim());
      if (forceSync) params.append('forceSync', 'true');

      const res = await fetch(`/api/sheets/first-pay-unpaid?${params.toString()}`);
      if (!res.ok) throw new Error('초회납 관리 데이터 조회에 실패했습니다.');

      const data = await res.json();
      setItems(data.items || []);
      if (data.filterOptions) setFilterOptions(data.filterOptions);
      if (data.summary) setSummary(data.summary);
      setCurrentPage(1);
    } catch (err: any) {
      console.error('Fetch first-pay unpaid error:', err);
      alert(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startMonth, endMonth, payFilter, selectedDivision, selectedHq, selectedBranch, selectedProduct, selectedStatus]);

  // 검색어 디바운스
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 350);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // 프리셋 기간 핸들러
  const handlePresetDate = (type: '2026-05' | '2026-ALL' | 'LAST-1YEAR' | 'ALL') => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentYM = `${curYear}-${curMonth}`;

    if (type === '2026-05') {
      setStartMonth('2026-05');
      setEndMonth('');
    } else if (type === '2026-ALL') {
      setStartMonth('2026-01');
      setEndMonth('2026-12');
    } else if (type === 'LAST-1YEAR') {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const pastYM = `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}`;
      setStartMonth(pastYM);
      setEndMonth(currentYM);
    } else if (type === 'ALL') {
      setStartMonth('');
      setEndMonth('');
    }
  };

  // 정렬 핸들러
  const handleSort = (field: keyof FirstPayUnpaidItem) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // 정렬된 리스트
  const sortedItems = useMemo(() => {
    const list = [...items];
    return list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (typeof valA === 'string') {
        const cmp = (valA || '').localeCompare(valB || '', 'ko');
        return sortAsc ? cmp : -cmp;
      }
      if (typeof valA === 'boolean') {
        const numA = valA ? 1 : 0;
        const numB = valB ? 1 : 0;
        return sortAsc ? numA - numB : numB - numA;
      }
      valA = valA || 0;
      valB = valB || 0;
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [items, sortField, sortAsc]);

  // 페이지네이션
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, currentPage, pageSize]);

  // 엑셀 다운로드
  const handleExportExcel = () => {
    const XLSX = getXLSX();
    if (!XLSX) {
      alert('엑셀 라이브러리를 로드할 수 없습니다.');
      return;
    }

    if (sortedItems.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const wb = XLSX.utils.book_new();

    const titleText = '더좋은라이프 초회납 관리 대장 (상조/렌탈)';
    const filterLabelMap: Record<PayFilterType, string> = {
      ALL: '전체',
      ALL_UNPAID: '초회 미납자 전체(상조 or 렌탈 미납)',
      SANGJO_UNPAID: '상조 미납자',
      SANGJO_PAID: '상조 정상납입자',
      RENTAL_UNPAID: '렌탈 미납자',
      RENTAL_PAID: '렌탈 정상납입(출금)자',
      BOTH_UNPAID: '동시 미납자(상조&렌탈 미납)',
      BOTH_PAID: '동시 완납자(상조&렌탈 납입완료)',
    };

    const periodText = `조회기간: ${startMonth || '전체'} ~ ${endMonth || '현재'} | 필터구분: ${filterLabelMap[payFilter]} | 총 건수: ${sortedItems.length.toLocaleString()}건 (상조미납: ${summary.sangjoUnpaidCount}건, 렌탈미납: ${summary.rentalUnpaidCount}건) | 작성일: ${new Date().toLocaleDateString('ko-KR')}`;

    const excelRows: any[][] = [];
    excelRows.push([titleText]);
    excelRows.push([periodText]);
    excelRows.push([]); // 빈 줄

    // 사용자 요구 컬럼 순서 12개:
    // 계약일 회원상태 회원명 회원번호 상품명 렌탈번호 제품명 본부 지사 영업사원 최초납입일 렌탈출금일
    excelRows.push([
      '순번',
      '계약일',
      '회원상태',
      '회원명',
      '회원번호',
      '상품명',
      '렌탈번호',
      '제품명',
      '본부',
      '지사',
      '영업사원',
      '최초납입일(상조)',
      '렌탈출금일(렌탈)',
      '상조납입여부',
      '렌탈출금여부'
    ]);

    sortedItems.forEach((item, idx) => {
      excelRows.push([
        idx + 1,
        item.contractDate || '-',
        item.status || '가입',
        item.memName || '-',
        item.memberNo || '-',
        item.productName || '-',
        item.rentalNo || '-',
        item.productModel || '-',
        item.hq || '-',
        item.branch || '-',
        item.employee || '-',
        item.sangjoFirstPayDate || '미납',
        item.rentalWithdrawDate || '미납',
        item.isSangjoPaid ? '납입완료' : '미납',
        item.isRentalPaid ? '출금완료' : '미납',
      ]);
    });

    // 합계/요약 행
    excelRows.push([
      '총합계',
      `${sortedItems.length}건`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      `미납 ${sortedItems.filter(i => !i.isSangjoPaid).length}건`,
      `미납 ${sortedItems.filter(i => !i.isRentalPaid).length}건`,
      '',
      ''
    ]);

    const ws = XLSX.utils.aoa_to_sheet(excelRows);
    ws['!cols'] = autoFitColWidths(excelRows, 12, 40);
    applyTableExcelStyle(ws, 'PURPLE');

    XLSX.utils.book_append_sheet(wb, ws, '초회납관리');
    const fileName = `초회납관리_대장_${todayStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ========================================================= */}
      {/* 1. 상단 통계 요약 카드 */}
      {/* ========================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 p-4 bg-slate-50 border-b border-slate-200 shrink-0">
        {/* 전체 건수 */}
        <div 
          onClick={() => setPayFilter('ALL')}
          className={`p-3 bg-white rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-xs ${
            payFilter === 'ALL' ? 'ring-2 ring-indigo-500 border-indigo-400' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>조회 계약</span>
            <FileSpreadsheet size={14} className="text-slate-400" />
          </div>
          <div className="text-lg font-bold text-slate-800 font-mono">
            {summary.totalCount.toLocaleString()} <span className="text-xs font-normal text-slate-500">건</span>
          </div>
        </div>

        {/* 초회 미납 합계 (상조 or 렌탈) */}
        <div 
          onClick={() => setPayFilter('ALL_UNPAID')}
          className={`p-3 bg-rose-50/70 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-xs ${
            payFilter === 'ALL_UNPAID' ? 'ring-2 ring-rose-500 border-rose-400' : 'border-rose-200/80'
          }`}
        >
          <div className="flex items-center justify-between text-rose-700 text-xs font-semibold mb-1">
            <span>초회 미납(전체)</span>
            <AlertCircle size={14} className="text-rose-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-rose-700 font-mono">
              {summary.totalUnpaidCount.toLocaleString()}
            </span>
            <span className="text-xs text-rose-500">건</span>
            {summary.totalCount > 0 && (
              <span className="text-[11px] font-semibold text-rose-600 ml-auto">
                {((summary.totalUnpaidCount / summary.totalCount) * 100).toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* 상조 미납 건수 */}
        <div 
          onClick={() => setPayFilter('SANGJO_UNPAID')}
          className={`p-3 bg-amber-50/70 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-xs ${
            payFilter === 'SANGJO_UNPAID' ? 'ring-2 ring-amber-500 border-amber-400' : 'border-amber-200/80'
          }`}
        >
          <div className="flex items-center justify-between text-amber-800 text-xs font-semibold mb-1">
            <span>상조부금 미납</span>
            <XCircle size={14} className="text-amber-600" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-amber-900 font-mono">
              {summary.sangjoUnpaidCount.toLocaleString()}
            </span>
            <span className="text-xs text-amber-700">건</span>
            <span className="text-[10px] text-amber-600 ml-auto font-medium">관리대장 V열</span>
          </div>
        </div>

        {/* 렌탈 미납 건수 */}
        <div 
          onClick={() => setPayFilter('RENTAL_UNPAID')}
          className={`p-3 bg-orange-50/70 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-xs ${
            payFilter === 'RENTAL_UNPAID' ? 'ring-2 ring-orange-500 border-orange-400' : 'border-orange-200/80'
          }`}
        >
          <div className="flex items-center justify-between text-orange-800 text-xs font-semibold mb-1">
            <span>렌탈 초회 미납</span>
            <CreditCard size={14} className="text-orange-600" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-orange-900 font-mono">
              {summary.rentalUnpaidCount.toLocaleString()}
            </span>
            <span className="text-xs text-orange-700">건</span>
            <span className="text-[10px] text-orange-600 ml-auto font-medium">관리대장 AA열</span>
          </div>
        </div>

        {/* 둘 다 미납 건수 */}
        <div 
          onClick={() => setPayFilter('BOTH_UNPAID')}
          className={`p-3 bg-red-50/70 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-xs ${
            payFilter === 'BOTH_UNPAID' ? 'ring-2 ring-red-500 border-red-400' : 'border-red-200/80'
          }`}
        >
          <div className="flex items-center justify-between text-red-800 text-xs font-semibold mb-1">
            <span>상조&렌탈 동시미납</span>
            <Clock size={14} className="text-red-600" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-red-900 font-mono">
              {summary.bothUnpaidCount.toLocaleString()}
            </span>
            <span className="text-xs text-red-700">건</span>
          </div>
        </div>

        {/* 정상 납입(둘 다 완납) */}
        <div 
          onClick={() => setPayFilter('BOTH_PAID')}
          className={`p-3 bg-emerald-50/70 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-xs ${
            payFilter === 'BOTH_PAID' ? 'ring-2 ring-emerald-500 border-emerald-400' : 'border-emerald-200/80'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold mb-1">
            <span>초회 정상 납입</span>
            <CheckCircle2 size={14} className="text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-emerald-900 font-mono">
              {summary.bothPaidCount.toLocaleString()}
            </span>
            <span className="text-xs text-emerald-700">건</span>
            {summary.totalCount > 0 && (
              <span className="text-[11px] font-semibold text-emerald-600 ml-auto">
                {((summary.bothPaidCount / summary.totalCount) * 100).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. 필터 컨트롤 바 */}
      {/* ========================================================= */}
      <div className="p-4 bg-white border-b border-slate-200 space-y-3 shrink-0">
        {/* 1행: 계약기간 + 상태 필터 탭 + 엑셀 다운로드 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 계약기간 선택 및 프리셋 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 text-xs text-slate-700 font-bold">
              <Calendar size={14} className="text-indigo-600" />
              <span>계약기간</span>
            </div>

            <input
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-indigo-500 shadow-2xs"
            />
            <span className="text-slate-400 text-xs">~</span>
            <input
              type="month"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              placeholder="현재"
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-indigo-500 shadow-2xs"
            />

            {/* 프리셋 버튼 */}
            <div className="flex items-center gap-1 ml-1">
              <button
                type="button"
                onClick={() => handlePresetDate('2026-05')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                  startMonth === '2026-05' && !endMonth
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                }`}
              >
                26년 5월~
              </button>
              <button
                type="button"
                onClick={() => handlePresetDate('2026-ALL')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                  startMonth === '2026-01' && endMonth === '2026-12'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                }`}
              >
                2026년 전체
              </button>
              <button
                type="button"
                onClick={() => handlePresetDate('LAST-1YEAR')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                  startMonth && endMonth && startMonth !== '2026-01' && startMonth !== '2026-05'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                }`}
              >
                최근 1년
              </button>
              <button
                type="button"
                onClick={() => handlePresetDate('ALL')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                  !startMonth && !endMonth
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                }`}
              >
                전체 기간
              </button>
            </div>
          </div>

          {/* 우측 액션: 시트 동기화 & 엑셀 다운로드 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(true)}
              disabled={syncing || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 border border-slate-300 transition-all cursor-pointer disabled:opacity-50"
              title="구글 시트 '관리대장' 시트로부터 최신 데이터를 즉시 다시 읽어옵니다."
            >
              <RefreshCw size={13} className={syncing ? 'animate-spin text-indigo-600' : ''} />
              <span>{syncing ? '동기화 중...' : '시트 동기화'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
            >
              <Download size={14} />
              <span>초회납 엑셀 다운로드 (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* 2행: 핵심 미납/납입 상태 필터 탭 바 (사용자 지시: 상조미납자, 렌탈미납자, 납입자 필터) */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1 text-xs font-bold text-slate-600 mr-2">
            <Filter size={13} className="text-indigo-600" />
            <span>납부상태:</span>
          </div>

          {[
            { key: 'ALL', label: '전체 보기' },
            { key: 'ALL_UNPAID', label: '초회 미납자 전체', badge: summary.totalUnpaidCount, color: 'text-rose-600 bg-rose-50 border-rose-200' },
            { key: 'SANGJO_UNPAID', label: '상조부금 미납자', badge: summary.sangjoUnpaidCount, color: 'text-amber-700 bg-amber-50 border-amber-200' },
            { key: 'RENTAL_UNPAID', label: '렌탈 미납자', badge: summary.rentalUnpaidCount, color: 'text-orange-700 bg-orange-50 border-orange-200' },
            { key: 'BOTH_UNPAID', label: '동시 미납자', badge: summary.bothUnpaidCount, color: 'text-red-700 bg-red-50 border-red-200' },
            { key: 'SANGJO_PAID', label: '상조 납입완료', badge: summary.sangjoPaidCount, color: 'text-blue-700 bg-blue-50 border-blue-200' },
            { key: 'RENTAL_PAID', label: '렌탈 출금완료', badge: summary.rentalPaidCount, color: 'text-cyan-700 bg-cyan-50 border-cyan-200' },
            { key: 'BOTH_PAID', label: '동시 완납자', badge: summary.bothPaidCount, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          ].map(opt => {
            const isSelected = payFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPayFilter(opt.key as PayFilterType)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{opt.label}</span>
                {opt.badge !== undefined && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isSelected ? 'bg-white/25 text-white' : (opt.color || 'bg-slate-100 text-slate-600')
                  }`}>
                    {opt.badge.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 3행: [사업단] -> [본부] -> [지사] -> [상품명] -> [회원상태] + 검색창 */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-1 border-t border-slate-100">
          {/* 사업단 필터 */}
          <div className="relative">
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-600">
              <Layers size={13} />
            </div>
            <select
              value={selectedDivision}
              onChange={(e) => handleDivisionChange(e.target.value)}
              className="w-full pl-7 pr-2.5 py-1.5 bg-indigo-50/50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-900 focus:outline-hidden focus:border-indigo-500 shadow-2xs"
            >
              <option value="">전체 사업단 ({filterOptions.divisions.length})</option>
              {filterOptions.divisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* 본부 필터 */}
          <div className="relative">
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
              <Building2 size={13} />
            </div>
            <select
              value={selectedHq}
              onChange={(e) => setSelectedHq(e.target.value)}
              className="w-full pl-7 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="">
                {selectedDivision ? `소속 본부 (${availableHqs.length})` : `전체 본부 (${filterOptions.hqs.length})`}
              </option>
              {availableHqs.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          {/* 지사 필터 */}
          <div className="relative">
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
              <MapPin size={13} />
            </div>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full pl-7 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="">전체 지사 ({filterOptions.branches.length})</option>
              {filterOptions.branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* 상품명 필터 */}
          <div>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="">전체 상품 ({filterOptions.products.length})</option>
              {filterOptions.products.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* 회원상태 필터 */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="">전체 상태 ({filterOptions.statuses.length})</option>
              {filterOptions.statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* 실시간 검색창 */}
          <div className="relative">
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="회원명, 회원번호, 렌탈번호, 제품명..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-indigo-500"
            />
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. 데이터 테이블 본문 */}
      {/* 사용자 지정 컬럼:
          계약일 회원상태 회원명 회원번호 상품명 렌탈번호 제품명 본부 지사 영업사원 최초납입일 렌탈출금일
      */}
      {/* ========================================================= */}
      <div className="flex-1 overflow-auto bg-slate-100/50">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <RefreshCw size={36} className="animate-spin text-indigo-500 mb-3" />
            <p className="text-sm font-semibold text-slate-600">관리대장 시트의 초회납 데이터를 분석하여 불러오는 중입니다...</p>
          </div>
        ) : paginatedItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16">
            <AlertCircle size={40} className="text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-600">조건에 부합하는 초회납 관리 데이터가 없습니다.</p>
            <p className="text-xs text-slate-400 mt-1">계약기간이나 납부상태 필터 조건을 변경해 보세요.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs bg-white">
            <thead className="sticky top-0 z-10 bg-slate-800 text-white shadow-xs">
              <tr>
                <th className="py-2.5 px-3 font-semibold text-center w-12 border-b border-slate-700">순번</th>
                
                {/* 1. 계약일 */}
                <th 
                  onClick={() => handleSort('contractDate')}
                  className="py-2.5 px-3 font-semibold cursor-pointer hover:bg-slate-700 border-b border-slate-700 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>계약일</span>
                    <ArrowUpDown size={12} className={sortField === 'contractDate' ? 'text-indigo-400' : 'text-slate-500'} />
                  </div>
                </th>

                {/* 2. 회원상태 */}
                <th className="py-2.5 px-3 font-semibold text-center border-b border-slate-700 whitespace-nowrap">
                  회원상태
                </th>

                {/* 3. 회원명 */}
                <th 
                  onClick={() => handleSort('memName')}
                  className="py-2.5 px-3 font-semibold cursor-pointer hover:bg-slate-700 border-b border-slate-700 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>회원명</span>
                    <ArrowUpDown size={12} className={sortField === 'memName' ? 'text-indigo-400' : 'text-slate-500'} />
                  </div>
                </th>

                {/* 4. 회원번호 */}
                <th className="py-2.5 px-3 font-semibold border-b border-slate-700 whitespace-nowrap">
                  회원번호
                </th>

                {/* 5. 상품명 */}
                <th className="py-2.5 px-3 font-semibold border-b border-slate-700 whitespace-nowrap">
                  상품명
                </th>

                {/* 6. 렌탈번호 */}
                <th className="py-2.5 px-3 font-semibold border-b border-slate-700 whitespace-nowrap">
                  렌탈번호
                </th>

                {/* 7. 제품명 */}
                <th className="py-2.5 px-3 font-semibold border-b border-slate-700 whitespace-nowrap">
                  제품명
                </th>

                {/* 8. 본부 */}
                <th className="py-2.5 px-3 font-semibold border-b border-slate-700 whitespace-nowrap">
                  본부
                </th>

                {/* 9. 지사 */}
                <th className="py-2.5 px-3 font-semibold border-b border-slate-700 whitespace-nowrap">
                  지사
                </th>

                {/* 10. 영업사원 */}
                <th className="py-2.5 px-3 font-semibold border-b border-slate-700 whitespace-nowrap">
                  영업사원
                </th>

                {/* 11. 최초납입일 (관리대장 V열, 상조부금) */}
                <th 
                  onClick={() => handleSort('sangjoFirstPayDate')}
                  className="py-2.5 px-3 font-semibold text-center cursor-pointer hover:bg-slate-700 border-b border-slate-700 whitespace-nowrap bg-amber-950/40 text-amber-200"
                  title="관리대장 시트 V열: 상조 최초납입일"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>최초납입일 (상조 V열)</span>
                    <ArrowUpDown size={12} className={sortField === 'sangjoFirstPayDate' ? 'text-amber-400' : 'text-slate-500'} />
                  </div>
                </th>

                {/* 12. 렌탈출금일 (관리대장 AA열, 렌탈초회) */}
                <th 
                  onClick={() => handleSort('rentalWithdrawDate')}
                  className="py-2.5 px-3 font-semibold text-center cursor-pointer hover:bg-slate-700 border-b border-slate-700 whitespace-nowrap bg-cyan-950/40 text-cyan-200"
                  title="관리대장 시트 AA열: 렌탈출금일"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>렌탈출금일 (렌탈 AA열)</span>
                    <ArrowUpDown size={12} className={sortField === 'rentalWithdrawDate' ? 'text-cyan-400' : 'text-slate-500'} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedItems.map((item, idx) => {
                const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                const isBothUnpaid = !item.isSangjoPaid && !item.isRentalPaid;
                const isEitherUnpaid = !item.isSangjoPaid || !item.isRentalPaid;

                return (
                  <tr 
                    key={`${item.memberNo}-${idx}`}
                    className={`hover:bg-slate-50 transition-colors ${
                      isBothUnpaid ? 'bg-red-50/25' : isEitherUnpaid ? 'bg-rose-50/15' : ''
                    }`}
                  >
                    {/* 순번 */}
                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                      {globalIdx}
                    </td>

                    {/* 계약일 */}
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-700 whitespace-nowrap">
                      {item.contractDate || '-'}
                    </td>

                    {/* 회원상태 */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        item.status === '가입' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : item.status.includes('해약') || item.status.includes('실효') || item.status.includes('취소')
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {item.status || '가입'}
                      </span>
                    </td>

                    {/* 회원명 */}
                    <td className="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">
                      {item.memName || '-'}
                    </td>

                    {/* 회원번호 */}
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap text-[11px]">
                      {item.memberNo || '-'}
                    </td>

                    {/* 상품명 */}
                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap max-w-[180px] truncate font-medium" title={item.productName}>
                      {item.productName || '-'}
                    </td>

                    {/* 렌탈번호 */}
                    <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap text-[11px]">
                      {item.rentalNo || '-'}
                    </td>

                    {/* 제품명 */}
                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap max-w-[220px] truncate font-medium" title={item.productModel}>
                      {item.productModel || '-'}
                    </td>

                    {/* 본부 */}
                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap font-medium">
                      {item.hq || '-'}
                    </td>

                    {/* 지사 */}
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                      {item.branch || '-'}
                    </td>

                    {/* 영업사원 */}
                    <td className="py-2.5 px-3 text-slate-700 font-medium whitespace-nowrap">
                      {item.employee || '-'}
                    </td>

                    {/* 최초납입일 (상조 V열) */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {item.isSangjoPaid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={11} className="text-emerald-500" />
                          <span>{item.sangjoFirstPayDate}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                          <XCircle size={11} className="text-rose-500" />
                          <span>미납 {item.sangjoFirstPayDate && item.sangjoFirstPayDate !== '-' ? `(${item.sangjoFirstPayDate})` : ''}</span>
                        </span>
                      )}
                    </td>

                    {/* 렌탈출금일 (렌탈 AA열) */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {item.isRentalPaid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                          <CheckCircle2 size={11} className="text-cyan-500" />
                          <span>{item.rentalWithdrawDate}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                          <XCircle size={11} className="text-rose-500" />
                          <span>미납 {item.rentalWithdrawDate && item.rentalWithdrawDate !== '-' ? `(${item.rentalWithdrawDate})` : ''}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ========================================================= */}
      {/* 4. 하단 페이지네이션 & 정보 바 */}
      {/* ========================================================= */}
      <div className="flex flex-wrap items-center justify-between px-6 py-3 bg-white border-t border-slate-200 text-xs text-slate-600 shrink-0">
        <div className="flex items-center gap-3">
          <span>
            총 <strong className="text-slate-900 font-mono">{sortedItems.length.toLocaleString()}</strong>건 중{' '}
            <strong className="text-indigo-600 font-mono">
              {sortedItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} ~ {Math.min(currentPage * pageSize, sortedItems.length)}
            </strong>
            건 표시
          </span>

          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-semibold text-slate-700 focus:outline-hidden"
          >
            <option value={20}>20건씩 보기</option>
            <option value={50}>50건씩 보기</option>
            <option value={100}>100건씩 보기</option>
            <option value={200}>200건씩 보기</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded-md border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>

          <span className="px-2 font-mono font-bold text-slate-800">
            {currentPage} / {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-1 rounded-md border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

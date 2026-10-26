import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Download, 
  Search, 
  Filter, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Calendar, 
  Building2, 
  User, 
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Coins,
  ArrowUpDown
} from 'lucide-react';
import { autoFitColWidths, applyTableExcelStyle } from './excelStyleUtils';

// @ts-ignore
const getXLSX = () => (window as any).XLSX;

export interface UnpaidItem {
  contractDate: string;
  status: string;
  memName: string;
  memberNo: string;
  productName: string;
  totalAmount: number;
  contractInstallment: number;
  monthlyPayment: number;
  depositInstallment: number;
  depositAmount: number;
  remainInstallment: number;
  balance: number;
  delayCount: number;
  delayAmount: number;
  lastPayDate: string;
  hq: string;
  branch: string;
  employee: string;
  isUnpaid: boolean;
}

interface FilterOptions {
  hqs: string[];
  branches: string[];
  products: string[];
  statuses: string[];
}

interface SummaryData {
  totalCount: number;
  unpaidCount: number;
  totalUnpaidAmt: number;
  totalBalanceAmt: number;
}

interface UnpaidManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UnpaidManagementModal: React.FC<UnpaidManagementModalProps> = ({ isOpen, onClose }) => {
  // 상태 관리
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [items, setItems] = useState<UnpaidItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    hqs: [],
    branches: [],
    products: [],
    statuses: [],
  });
  const [summary, setSummary] = useState<SummaryData>({
    totalCount: 0,
    unpaidCount: 0,
    totalUnpaidAmt: 0,
    totalBalanceAmt: 0,
  });

  // 필터 조건 상태
  const [startMonth, setStartMonth] = useState('2026-01');
  const [endMonth, setEndMonth] = useState('');
  const [onlyUnpaid, setOnlyUnpaid] = useState(true); // 기본값: 미납데이터만 보기 활성화
  const [selectedHq, setSelectedHq] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 정렬 상태
  const [sortField, setSortField] = useState<keyof UnpaidItem>('delayAmount');
  const [sortAsc, setSortAsc] = useState(false); // 연체액 높은 순 기본 정렬

  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // 데이터 로드 함수
  const fetchData = async (forceSync = false) => {
    if (forceSync) setSyncing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (startMonth) params.append('startContractDate', startMonth);
      if (endMonth) params.append('endContractDate', endMonth);
      if (onlyUnpaid) params.append('onlyUnpaid', 'true');
      if (selectedHq) params.append('hq', selectedHq);
      if (selectedBranch) params.append('branch', selectedBranch);
      if (selectedProduct) params.append('product', selectedProduct);
      if (selectedStatus) params.append('status', selectedStatus);
      if (searchKeyword.trim()) params.append('search', searchKeyword.trim());
      if (forceSync) params.append('forceSync', 'true');

      const res = await fetch(`/api/sheets/unpaid-management?${params.toString()}`);
      if (!res.ok) throw new Error('미납 관리 데이터 조회에 실패했습니다.');

      const data = await res.json();
      setItems(data.items || []);
      if (data.filterOptions) {
        setFilterOptions(data.filterOptions);
      }
      if (data.summary) {
        setSummary(data.summary);
      }
      setCurrentPage(1);
    } catch (err: any) {
      console.error('Fetch unpaid management error:', err);
      alert(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  // 모달 열릴 때 및 필터 변경 시 자동 조회
  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, startMonth, endMonth, onlyUnpaid, selectedHq, selectedBranch, selectedProduct, selectedStatus]);

  // 검색어 입력 시 디바운스 적용
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetchData();
    }, 350);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // 기간 빠른 선택 프리셋 핸들러
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
  const handleSort = (field: keyof UnpaidItem) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // 새로 선택된 필드는 내림차순(높은 순) 기본
    }
  };

  // 정렬된 아이템
  const sortedItems = useMemo(() => {
    const list = [...items];
    return list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB || '', 'ko');
        return sortAsc ? cmp : -cmp;
      }
      valA = valA || 0;
      valB = valB || 0;
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [items, sortField, sortAsc]);

  // 페이지네이션 처리
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, currentPage, pageSize]);

  // ==========================================
  // [엑셀 다운로드] 세련된 서식 적용
  // ==========================================
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

    const titleText = onlyUnpaid 
      ? `더좋은라이프 미납 관리 대장 (미납건)` 
      : `더좋은라이프 통합원장 관리 대장 (전체)`;

    const periodText = `조회기간: ${startMonth || '전체'} ~ ${endMonth || '현재'} | 작성일자: ${new Date().toLocaleDateString('ko-KR')} | 총 건수: ${sortedItems.length.toLocaleString()}건`;

    const excelRows: any[][] = [];

    // 타이틀 및 메타 정보 행
    excelRows.push([titleText]);
    excelRows.push([periodText]);
    excelRows.push([]); // 빈 줄

    if (onlyUnpaid) {
      // 미납데이터만 보기 11개 컬럼
      excelRows.push([
        '순번',
        '계약일자',
        '회원상태',
        '회원명',
        '회원번호',
        '상품명',
        '연체차',
        '연체액',
        '최종납입일',
        '본부',
        '지사',
        '영업사원',
      ]);

      sortedItems.forEach((item, idx) => {
        excelRows.push([
          idx + 1,
          item.contractDate || '-',
          item.status || '정상',
          item.memName,
          item.memberNo,
          item.productName,
          { v: item.delayCount || 0, t: 'n', z: '#,##0' },
          { v: item.delayAmount || 0, t: 'n', z: '#,##0' },
          item.lastPayDate || '-',
          item.hq || '-',
          item.branch || '-',
          item.employee || '-',
        ]);
      });

      // 합계 행
      const totalDelayAmt = sortedItems.reduce((acc, cur) => acc + (cur.delayAmount || 0), 0);
      const totalDelayCnt = sortedItems.reduce((acc, cur) => acc + (cur.delayCount || 0), 0);
      excelRows.push([
        '총합계',
        `${sortedItems.length}건`,
        '',
        '',
        '',
        '',
        { v: totalDelayCnt, t: 'n', z: '#,##0' },
        { v: totalDelayAmt, t: 'n', z: '#,##0' },
        '',
        '',
        '',
        '',
      ]);
    } else {
      // 18개 전체 컬럼
      excelRows.push([
        '순번',
        '계약일자',
        '회원상태',
        '회원명',
        '회원번호',
        '상품명',
        '상품총액',
        '계약회차',
        '월불입액',
        '입금차',
        '입금액',
        '잔여차',
        '회비잔액',
        '연체차',
        '연체액',
        '최종납입일',
        '본부',
        '지사',
        '영업사원',
      ]);

      sortedItems.forEach((item, idx) => {
        excelRows.push([
          idx + 1,
          item.contractDate || '-',
          item.status || '정상',
          item.memName,
          item.memberNo,
          item.productName,
          { v: item.totalAmount || 0, t: 'n', z: '#,##0' },
          { v: item.contractInstallment || 0, t: 'n', z: '#,##0' },
          { v: item.monthlyPayment || 0, t: 'n', z: '#,##0' },
          { v: item.depositInstallment || 0, t: 'n', z: '#,##0' },
          { v: item.depositAmount || 0, t: 'n', z: '#,##0' },
          { v: item.remainInstallment || 0, t: 'n', z: '#,##0' },
          { v: item.balance || 0, t: 'n', z: '#,##0' },
          { v: item.delayCount || 0, t: 'n', z: '#,##0' },
          { v: item.delayAmount || 0, t: 'n', z: '#,##0' },
          item.lastPayDate || '-',
          item.hq || '-',
          item.branch || '-',
          item.employee || '-',
        ]);
      });

      // 합계 행
      const sumTotalAmt = sortedItems.reduce((acc, cur) => acc + (cur.totalAmount || 0), 0);
      const sumDepositAmt = sortedItems.reduce((acc, cur) => acc + (cur.depositAmount || 0), 0);
      const sumBalance = sortedItems.reduce((acc, cur) => acc + (cur.balance || 0), 0);
      const sumDelayAmt = sortedItems.reduce((acc, cur) => acc + (cur.delayAmount || 0), 0);

      excelRows.push([
        '총합계',
        `${sortedItems.length}건`,
        '',
        '',
        '',
        '',
        { v: sumTotalAmt, t: 'n', z: '#,##0' },
        '',
        '',
        '',
        { v: sumDepositAmt, t: 'n', z: '#,##0' },
        '',
        { v: sumBalance, t: 'n', z: '#,##0' },
        '',
        { v: sumDelayAmt, t: 'n', z: '#,##0' },
        '',
        '',
        '',
        '',
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(excelRows);
    ws['!cols'] = autoFitColWidths(excelRows, 11, 40);
    applyTableExcelStyle(ws, onlyUnpaid ? 'PURPLE' : 'BLUE');

    const sheetName = onlyUnpaid ? '미납관리대장' : '원장전체대장';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const fileName = onlyUnpaid 
      ? `미납관리_상세리스트_${todayStr}.xlsx` 
      : `통합원장_관리리스트_${todayStr}.xlsx`;

    XLSX.writeFile(wb, fileName);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="relative w-full max-w-7xl h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* ========================================================= */}
        {/* 모달 상단 헤더 */}
        {/* ========================================================= */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/20 text-rose-300 rounded-xl border border-rose-500/30">
              <Coins size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">미납 관리 대장</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  통합원장 연동
                </span>
                {onlyUnpaid && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                    미납 데이터만 보기 모드
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                계약일자별 원장 데이터를 기반으로 연체차수 및 미납액을 분석하고 관리합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(true)}
              disabled={syncing || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/80 hover:bg-slate-600 text-xs font-semibold text-slate-200 border border-slate-600/80 transition-all cursor-pointer disabled:opacity-50"
              title="구글 시트 '통합원장' 시트로부터 최신 원장 데이터를 즉시 다시 읽어옵니다."
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin text-rose-400' : ''} />
              <span>{syncing ? '원장 동기화 중...' : '시트 최신 동기화'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 상단 통계 카드 바 */}
        {/* ========================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
              <span>조회 대상 건수</span>
              <FileSpreadsheet size={15} className="text-slate-400" />
            </div>
            <div className="text-lg font-bold text-slate-800 font-mono">
              {summary.totalCount.toLocaleString()} <span className="text-xs font-normal text-slate-500">건</span>
            </div>
          </div>

          <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-rose-700 text-xs font-semibold mb-1">
              <span>연체 / 미납 건수</span>
              <AlertCircle size={15} className="text-rose-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-rose-700 font-mono">
                {summary.unpaidCount.toLocaleString()} <span className="text-xs font-normal">건</span>
              </span>
              {summary.totalCount > 0 && (
                <span className="text-xs font-semibold text-rose-500">
                  ({((summary.unpaidCount / summary.totalCount) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          </div>

          <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-amber-800 text-xs font-semibold mb-1">
              <span>총 연체액 합계</span>
              <Coins size={15} className="text-amber-600" />
            </div>
            <div className="text-lg font-bold text-amber-900 font-mono">
              {summary.totalUnpaidAmt.toLocaleString()} <span className="text-xs font-normal text-amber-700">원</span>
            </div>
          </div>

          <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-indigo-800 text-xs font-semibold mb-1">
              <span>총 회비잔액 합계</span>
              <TrendingDown size={15} className="text-indigo-600" />
            </div>
            <div className="text-lg font-bold text-indigo-900 font-mono">
              {summary.totalBalanceAmt.toLocaleString()} <span className="text-xs font-normal text-indigo-700">원</span>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 컨트롤 필터 바 */}
        {/* ========================================================= */}
        <div className="p-4 bg-white border-b border-slate-200 space-y-3 shrink-0">
          {/* 1행: 계약일자 기간 선택 + 프리셋 + 미납데이터만 보기 스위치 + 엑셀 다운로드 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* 계약일자 선택 및 퀵 프리셋 */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 text-xs text-slate-700 font-bold">
                <Calendar size={14} className="text-indigo-600" />
                <span>계약일자</span>
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
                  className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                    startMonth === '2026-05' && !endMonth
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  26년 5월~
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetDate('2026-ALL')}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                    startMonth === '2026-01' && endMonth === '2026-12'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  2026년 전체
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetDate('LAST-1YEAR')}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                    startMonth && endMonth && startMonth !== '2026-01'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  최근 1년
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetDate('ALL')}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                    !startMonth && !endMonth
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  전체 기간
                </button>
              </div>
            </div>

            {/* 우측 액션: 미납데이터만 보기 스위치 & 엑셀 다운로드 */}
            <div className="flex items-center gap-3">
              {/* 미납데이터만 보기 토글 버튼 */}
              <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer select-none transition-all shadow-2xs font-bold text-xs bg-white hover:bg-slate-50 border-slate-200">
                <input
                  type="checkbox"
                  checked={onlyUnpaid}
                  onChange={(e) => setOnlyUnpaid(e.target.checked)}
                  className="w-4 h-4 text-rose-600 rounded focus:ring-rose-500 accent-rose-600 cursor-pointer"
                />
                <span className={onlyUnpaid ? 'text-rose-600 font-extrabold' : 'text-slate-600'}>
                  미납데이터만 보기
                </span>
                {onlyUnpaid && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                )}
              </label>

              {/* 엑셀 다운로드 버튼 */}
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
              >
                <Download size={14} />
                <span>엑셀 다운로드 (.xlsx)</span>
              </button>
            </div>
          </div>

          {/* 2행: 본부, 사업단(지사), 상품, 회원상태 필터 + 검색창 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
            {/* 본부 필터 */}
            <div>
              <select
                value={selectedHq}
                onChange={(e) => setSelectedHq(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-indigo-500"
              >
                <option value="">전체 본부 ({filterOptions.hqs.length})</option>
                {filterOptions.hqs.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            {/* 사업단 / 지사 필터 */}
            <div>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-indigo-500"
              >
                <option value="">전체 사업단/지사 ({filterOptions.branches.length})</option>
                {filterOptions.branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* 상품 필터 */}
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

            {/* 통합 검색창 */}
            <div className="relative">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="회원명, 회원번호, 영업사원 검색..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-indigo-500"
              />
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 데이터 테이블 본문 */}
        {/* ========================================================= */}
        <div className="flex-1 overflow-auto bg-slate-100/50">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <RefreshCw size={36} className="animate-spin text-indigo-500 mb-3" />
              <p className="text-sm font-semibold text-slate-600">원장 데이터를 고속 분석하여 불러오는 중입니다...</p>
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16">
              <AlertCircle size={40} className="text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-600">조건에 부합하는 데이터가 없습니다.</p>
              <p className="text-xs text-slate-400 mt-1">계약일자 기간이나 필터 조건을 변경해 보세요.</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs bg-white">
              <thead className="sticky top-0 z-10 bg-slate-800 text-white shadow-xs">
                <tr>
                  <th className="py-2.5 px-3 font-semibold text-center w-12 border-b border-slate-700">순번</th>
                  
                  <th 
                    onClick={() => handleSort('contractDate')}
                    className="py-2.5 px-3 font-semibold cursor-pointer hover:bg-slate-700 border-b border-slate-700 whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>계약일자</span>
                      <ArrowUpDown size={12} className={sortField === 'contractDate' ? 'text-indigo-400' : 'text-slate-500'} />
                    </div>
                  </th>

                  <th className="py-2.5 px-3 font-semibold text-center border-b border-slate-700 whitespace-nowrap">회원상태</th>

                  <th 
                    onClick={() => handleSort('memName')}
                    className="py-2.5 px-3 font-semibold cursor-pointer hover:bg-slate-700 border-b border-slate-700 whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>회원명</span>
                      <ArrowUpDown size={12} className={sortField === 'memName' ? 'text-indigo-400' : 'text-slate-500'} />
                    </div>
                  </th>

                  <th className="py-2.5 px-3 font-semibold border-b border-slate-700 whitespace-nowrap">회원번호</th>
                  <th className="py-2.5 px-3 font-semibold border-b border-slate-700 whitespace-nowrap">상품명</th>

                  {/* 전체 보기 모드에서만 나타나는 컬럼들 */}
                  {!onlyUnpaid && (
                    <>
                      <th className="py-2.5 px-3 font-semibold text-right border-b border-slate-700 whitespace-nowrap">상품총액</th>
                      <th className="py-2.5 px-3 font-semibold text-center border-b border-slate-700 whitespace-nowrap">계약회차</th>
                      <th className="py-2.5 px-3 font-semibold text-right border-b border-slate-700 whitespace-nowrap">월불입액</th>
                      <th className="py-2.5 px-3 font-semibold text-center border-b border-slate-700 whitespace-nowrap">입금차</th>
                      <th className="py-2.5 px-3 font-semibold text-right border-b border-slate-700 whitespace-nowrap">입금액</th>
                      <th className="py-2.5 px-3 font-semibold text-center border-b border-slate-700 whitespace-nowrap">잔여차</th>
                      <th className="py-2.5 px-3 font-semibold text-right border-b border-slate-700 whitespace-nowrap">회비잔액</th>
                    </>
                  )}

                  {/* 연체차 / 연체액 */}
                  <th 
                    onClick={() => handleSort('delayCount')}
                    className="py-2.5 px-3 font-semibold text-center cursor-pointer hover:bg-slate-700 border-b border-slate-700 whitespace-nowrap bg-rose-950/40 text-rose-300"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>연체차</span>
                      <ArrowUpDown size={12} className={sortField === 'delayCount' ? 'text-rose-400' : 'text-slate-500'} />
                    </div>
                  </th>

                  <th 
                    onClick={() => handleSort('delayAmount')}
                    className="py-2.5 px-3 font-semibold text-right cursor-pointer hover:bg-slate-700 border-b border-slate-700 whitespace-nowrap bg-rose-950/40 text-rose-300"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>연체액</span>
                      <ArrowUpDown size={12} className={sortField === 'delayAmount' ? 'text-rose-400' : 'text-slate-500'} />
                    </div>
                  </th>

                  <th className="py-2.5 px-3 font-semibold text-center border-b border-slate-700 whitespace-nowrap">최종납입일</th>
                  <th className="py-2.5 px-3 font-semibold border-b border-slate-700 whitespace-nowrap">본부</th>
                  <th className="py-2.5 px-3 font-semibold border-b border-slate-700 whitespace-nowrap">지사</th>
                  <th className="py-2.5 px-3 font-semibold border-b border-slate-700 whitespace-nowrap">영업사원</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedItems.map((item, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                  const hasDelay = item.delayCount > 0 || item.delayAmount > 0;

                  return (
                    <tr 
                      key={`${item.memberNo}-${idx}`}
                      className={`hover:bg-slate-50 transition-colors ${
                        hasDelay ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {globalIdx}
                      </td>

                      <td className="py-2.5 px-3 font-mono font-medium text-slate-700 whitespace-nowrap">
                        {item.contractDate || '-'}
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          item.status === '가입' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : item.status.includes('해약') || item.status.includes('실효') || item.status.includes('취소')
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {item.status || '정상'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">
                        {item.memName}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap text-[11px]">
                        {item.memberNo}
                      </td>

                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap max-w-[200px] truncate" title={item.productName}>
                        {item.productName}
                      </td>

                      {/* 전체 보기 모드 컬럼 데이터 */}
                      {!onlyUnpaid && (
                        <>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                            {item.totalAmount ? item.totalAmount.toLocaleString() : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600 whitespace-nowrap">
                            {item.contractInstallment || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                            {item.monthlyPayment ? item.monthlyPayment.toLocaleString() : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600 whitespace-nowrap">
                            {item.depositInstallment || '0'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold whitespace-nowrap">
                            {item.depositAmount ? item.depositAmount.toLocaleString() : '0'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600 whitespace-nowrap">
                            {item.remainInstallment || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-800 font-semibold whitespace-nowrap">
                            {item.balance ? item.balance.toLocaleString() : '0'}
                          </td>
                        </>
                      )}

                      {/* 연체차 / 연체액 */}
                      <td className={`py-2.5 px-3 text-center font-mono font-bold whitespace-nowrap ${
                        item.delayCount > 0 ? 'text-rose-600 bg-rose-50/50' : 'text-slate-400'
                      }`}>
                        {item.delayCount > 0 ? `${item.delayCount}차` : '-'}
                      </td>

                      <td className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${
                        item.delayAmount > 0 ? 'text-rose-600 bg-rose-50/50' : 'text-slate-400'
                      }`}>
                        {item.delayAmount > 0 ? `${item.delayAmount.toLocaleString()}원` : '-'}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono text-slate-600 whitespace-nowrap text-[11px]">
                        {item.lastPayDate || '-'}
                      </td>

                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {item.hq || '-'}
                      </td>

                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {item.branch || '-'}
                      </td>

                      <td className="py-2.5 px-3 text-slate-700 font-medium whitespace-nowrap">
                        {item.employee || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ========================================================= */}
        {/* 하단 페이지네이션 & 정보 바 */}
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
    </div>
  );
};

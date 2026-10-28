import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  X, Search, Download, ChevronLeft, ChevronRight, Truck, AlertCircle, 
  Plus, Check, Clock, CheckCircle2, RotateCcw, Filter, FileText, 
  Building2, User, RefreshCw, Calendar, Tag, ShieldCheck, Copy,
  CheckSquare, Square, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface ERPDataItem {
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
  raw: any[];
  cancelProcessedAt?: string; // 취소/해약 처리일시
  cancelCreatedAt?: string;   // 접수일시
  cancelReceiptType?: string; // 취소접수처
  cancelProcessStatus?: string;
  accountCount?: number;      // 구좌수 (동일 렌탈번호 묶음 건수)
}

export interface CancelRecord {
  id: string;
  createdAt: string;
  processStatus: string;
  receiptType: string;
  targetStatus: string;
  contractDate: string;
  statusBefore: string;
  rentalNo: string;
  memName: string;
  memNo: string;
  prodName: string;
  rentalProd: string;
  hq: string;
  branch: string;
  empName: string;
  firstPayDateSangjo?: string;
  rentalWithdrawDate?: string;
  notes: string;
  operator?: string;
  processedAt?: string; // 취소/해약 처리일시
  rowIdx?: number;
}

interface DashboardDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ERPDataItem[];
  type: 'delivery' | 'cancel' | null;
  month: string;
  mode: '구좌수' | '상품개수';
  onUpdateCell: (rowIdx: number, colIdx: number, newValue: string, expectedMemNo?: string, expectedRentalNo?: string) => Promise<void> | void;
  onBatchUpdateCells: (updates: { rowIdx: number, colIdx: number, newValue: string, expectedMemNo?: string, expectedRentalNo?: string }[]) => Promise<void> | void;
  isAdmin: boolean;
  currentUser?: any;
}

const DEFAULT_TARGET_PRODUCTS = [
  '뉴스카이타워G9 3in1',
  'G210NW',
  'CRVC-CAC1620W',
  '가스트로플러스',
  '쿠쿠',
];

const LOCAL_STORAGE_KEY = 'erp_manual_order_target_products_v1';

// ----------------------------------------------------
// 텍스트(렌탈계약번호, 회원번호 등) 원클릭 복사 컴포넌트
// ----------------------------------------------------
export const CopyableText: React.FC<{ 
  text?: string; 
  displayText?: string;
  className?: string; 
  iconColor?: string;
  tooltipText?: string;
}> = ({ text, displayText, className = '', iconColor = 'text-slate-400 group-hover:text-rose-600', tooltipText = '클릭 시 복사됩니다' }) => {
  const [copied, setCopied] = useState(false);

  if (!text || text.trim() === '' || text === '-') {
    return <span className="text-slate-400 font-mono">-</span>;
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={tooltipText}
      className={`inline-flex items-center gap-1 hover:bg-slate-100 px-1 py-0.5 rounded transition-all group relative cursor-pointer text-left ${className}`}
    >
      <span className="truncate">{displayText || text}</span>
      {copied ? (
        <Check size={12} className="text-emerald-600 shrink-0 stroke-[3]" />
      ) : (
        <Copy size={11} className={`${iconColor} shrink-0 transition-colors opacity-70 group-hover:opacity-100`} />
      )}
      {copied && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-50 animate-fade-in pointer-events-none">
          복사완료!
        </span>
      )}
    </button>
  );
};

// 쉼표로 연결된 복수 회원번호를 개별 복사 버튼 및 일괄 복사 버튼으로 렌더링하는 컴포넌트
export const CopyableMemNos: React.FC<{ 
  memNosStr?: string; 
  className?: string;
  layout?: 'col' | 'row';
}> = ({ memNosStr, className = '', layout = 'col' }) => {
  const [copiedAll, setCopiedAll] = useState(false);

  const list = useMemo(() => {
    if (!memNosStr || memNosStr.trim() === '' || memNosStr === '-') return [];
    // 낮은 회원번호가 위(앞)로 가도록 오름차순 자연 정렬
    return Array.from(new Set(memNosStr.split(',').map(s => s.trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [memNosStr]);

  if (list.length === 0) return <span className="text-slate-400 font-mono">-</span>;

  const handleCopyAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const allText = list.join(', ');
    navigator.clipboard.writeText(allText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  if (list.length === 1) {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <CopyableText 
          text={list[0]}
          className="font-mono text-slate-700 bg-slate-50 border border-slate-200/70 hover:border-slate-300 font-medium px-1.5 py-0.5 rounded text-[11px]"
          tooltipText={`회원번호 ${list[0]} 복사`}
        />
      </div>
    );
  }

  const isCol = layout === 'col';

  return (
    <div className={`${isCol ? 'inline-flex flex-col items-start gap-1 py-0.5' : 'inline-flex flex-wrap items-center gap-1.5'} ${className}`}>
      {/* 2개 이상일 때 일괄 복사 버튼: J2610013717, J2610013718, J2610013719 형태로 원클릭 복사 */}
      <button
        type="button"
        onClick={handleCopyAll}
        title={`전체 회원번호 일괄 복사 (${list.join(', ')})`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer shadow-2xs ${
          copiedAll
            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
            : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200/80 hover:border-rose-300'
        }`}
      >
        {copiedAll ? (
          <>
            <Check size={11} className="text-emerald-600 stroke-[2.5]" />
            <span>일괄 복사됨!</span>
          </>
        ) : (
          <>
            <Copy size={11} className="text-rose-600" />
            <span>일괄 복사</span>
          </>
        )}
      </button>

      {/* 낮은 회원번호가 위(앞)로 정렬된 개별 회원번호 목록 */}
      <div className={isCol ? 'flex flex-col items-start gap-1' : 'inline-flex flex-wrap items-center gap-1.5'}>
        {list.map((mNo) => (
          <CopyableText 
            key={mNo}
            text={mNo}
            className="font-mono text-slate-700 bg-slate-50 border border-slate-200/70 hover:border-slate-300 font-medium px-1.5 py-0.5 rounded text-[11px]"
            tooltipText={`회원번호 ${mNo} 개별 복사`}
          />
        ))}
      </div>
    </div>
  );
};

export const DashboardDetailModal: React.FC<DashboardDetailModalProps> = ({
  isOpen,
  onClose,
  data,
  type,
  month,
  mode,
  onUpdateCell,
  onBatchUpdateCells,
  isAdmin,
  currentUser,
}) => {
  // 모달 탭 상태: 1번 요구(접수 화면이 첫화면으로 열림)
  const [cancelTab, setCancelTab] = useState<'register' | 'pending' | 'list'>('register');

  // 취소 및 해약 완료 목록 상태
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [viewAllMonths, setViewAllMonths] = useState(false);
  const [manualOrderFilter, setManualOrderFilter] = useState<'all' | 'manual' | 'normal'>('all');
  const [selectedHqFilter, setSelectedHqFilter] = useState<string>('전체');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('전체');

  // 구글 시트 '취소및해약' 접수 대장 상태
  const [cancelRecords, setCancelRecords] = useState<CancelRecord[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [pendingFilter, setPendingFilter] = useState<'all' | '접수중' | '처리완료'>('all');
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingPage, setPendingPage] = useState(1);
  const pendingItemsPerPage = 10;

  // 접수중 내역 일괄 선택 상태
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // 신규 취소/해약 등록 폼 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContract, setSelectedContract] = useState<ERPDataItem | null>(null);
  const [receiptType, setReceiptType] = useState<'더좋은라이프' | '에넥스' | '영업조직'>('더좋은라이프');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 수기발주 대상 상품 목록 로드
  const targetProducts = useMemo(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_TARGET_PRODUCTS;
  }, []);

  const checkIsManualOrder = (item: ERPDataItem) => {
    const rawProdName = (item.rentalProd || item.prodName || '').trim();
    if (!rawProdName) return false;
    const cleanProdName = rawProdName.replace(/^[0-9]+구좌[_\s]*/g, '').trim();
    return targetProducts.some(
      (tp: string) => tp && (rawProdName.toLowerCase().includes(tp.toLowerCase()) || cleanProdName.toLowerCase().includes(tp.toLowerCase()))
    );
  };

  // 구글 시트 '취소및해약' 데이터 로드
  const fetchCancelRecords = useCallback(async () => {
    if (!isOpen || type !== 'cancel') return;
    setIsLoadingRecords(true);
    try {
      const res = await fetch('/api/sheets/cancel-records');
      if (res.ok) {
        const json = await res.json();
        setCancelRecords(json.records || []);
      }
    } catch (err) {
      console.error('취소/해약 시트 데이터 로드 실패:', err);
    } finally {
      setIsLoadingRecords(false);
    }
  }, [isOpen, type]);

  // 모달 개폐 시 항상 'register'(취소 및 해약 접수)가 첫화면으로 열림
  useEffect(() => {
    if (isOpen) {
      setCurrentPage(1);
      setPendingPage(1);
      setSearchTerm('');
      setPendingSearch('');
      setCancelTab('register'); // 취소 및 해약 접수가 첫번째 기본 화면
      setSelectedContract(null);
      setSearchQuery('');
      setNotes('');
      setReceiptType('더좋은라이프');
      setViewAllMonths(type === 'cancel'); // 배송완료는 해당월을 기본으로 표시, 취소/해약은 전체기간 기본
      setManualOrderFilter('all');
      setSelectedHqFilter('전체');
      setSelectedBranchFilter('전체');
      setSelectedPendingIds(new Set());

      if (type === 'cancel') {
        fetchCancelRecords();
      }
    }
  }, [isOpen, type, month, fetchCancelRecords]);

  // 가입 상태인 계약건들 (취소/해약 접수 대상)
  const activeContracts = useMemo(() => {
    return data.filter(d => d.status === '가입');
  }, [data]);

  // ----------------------------------------------------
  // 2번 요구: 동일 렌탈번호인 경우 하나로 통합 노출 + 옆에 회원번호 나열(괄호 없음)
  // ----------------------------------------------------
  const groupedSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();

    // 1차 필터링
    const matched = activeContracts.filter(item => {
      const name = item.memName ? item.memName.toLowerCase() : '';
      const rentalNo = item.rentalNo ? item.rentalNo.toLowerCase() : '';
      const memNo = item.memNo ? item.memNo.toLowerCase() : '';
      return name.includes(q) || rentalNo.includes(q) || memNo.includes(q);
    });

    // 동일 렌탈번호 그룹화 (렌탈번호가 없으면 memNo 기준)
    const groupedMap = new Map<string, ERPDataItem[]>();
    matched.forEach(item => {
      const key = (item.rentalNo && item.rentalNo.trim()) 
        ? `rental-${item.rentalNo.trim()}` 
        : `mem-${item.memNo}-${item.uniqueKey}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, []);
      }
      groupedMap.get(key)!.push(item);
    });

    const results: {
      representative: ERPDataItem;
      allMembers: { memNo: string; memName: string }[];
      memNosList: string[];
      mergedMemNos: string;
      count: number;
    }[] = [];

    groupedMap.forEach(items => {
      const rep = items[0];
      const uniqueMemNos = Array.from(new Set(items.map(i => i.memNo).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      results.push({
        representative: rep,
        allMembers: items.map(i => ({ memNo: i.memNo, memName: i.memName })),
        memNosList: uniqueMemNos,
        mergedMemNos: uniqueMemNos.join(', '),
        count: items.length
      });
    });

    return results.slice(0, 30);
  }, [activeContracts, searchQuery]);

  // 선택된 계약과 동일한 렌탈번호를 가진 모든 구좌들
  const matchingContracts = useMemo(() => {
    if (!selectedContract) return [];
    if (!selectedContract.rentalNo) return [selectedContract];
    const matched = data.filter(d => d.rentalNo && d.rentalNo === selectedContract.rentalNo);
    return matched.length > 0 ? matched : [selectedContract];
  }, [selectedContract, data]);

  // 선택된 계약건의 통합 회원번호 문자열 (낮은 번호 우선 오름차순 나열)
  const selectedMergedMemNos = useMemo(() => {
    if (matchingContracts.length === 0) return '';
    return Array.from(new Set(matchingContracts.map(c => c.memNo).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .join(', ');
  }, [matchingContracts]);

  // ----------------------------------------------------
  // 3번 요구: 관리대장 V열 '최초납입일(상조)' 및 AA열 '렌탈출금일' 추출 (렌탈계약번호 매칭)
  // ----------------------------------------------------
  const contractExtraDates = useMemo(() => {
    if (matchingContracts.length === 0) {
      return { firstPayDateSangjo: '-', rentalWithdrawDate: '-' };
    }

    let firstPayDateSangjo = '';
    let rentalWithdrawDate = '';

    for (const c of matchingContracts) {
      // V열: index 21 (최초납입일(상조))
      if (!firstPayDateSangjo && c.raw && c.raw[21] != null) {
        const val = String(c.raw[21]).trim();
        if (val) firstPayDateSangjo = val;
      }
      // AA열: index 26 (렌탈출금일)
      if (!rentalWithdrawDate && c.raw && c.raw[26] != null) {
        const val = String(c.raw[26]).trim();
        if (val) rentalWithdrawDate = val;
      }
      if (firstPayDateSangjo && rentalWithdrawDate) break;
    }

    return {
      firstPayDateSangjo: firstPayDateSangjo || '-',
      rentalWithdrawDate: rentalWithdrawDate || '-'
    };
  }, [matchingContracts]);

  // ----------------------------------------------------
  // 취소 접수 등록 (관리대장은 변경하지 않고 구글 시트에 [접수중] 기록)
  // ----------------------------------------------------
  const handleSubmitCancel = async () => {
    if (!selectedContract) {
      alert('취소 접수할 계약건을 선택해 주세요.');
      return;
    }

    const count = matchingContracts.length;
    const confirmMsg = `[취소 접수 등록 확인]\n\n` +
      `• 회원명: ${selectedContract.memName}\n` +
      `• 회원번호: ${selectedMergedMemNos || selectedContract.memNo}\n` +
      `• 렌탈계약번호: ${selectedContract.rentalNo || '-'}\n` +
      `• 상품명: ${selectedContract.prodName}\n` +
      `• 취소 접수처: ${receiptType}\n` +
      `• 최초납입일(상조): ${contractExtraDates.firstPayDateSangjo}\n` +
      `• 렌탈출금일: ${contractExtraDates.rentalWithdrawDate}\n` +
      (notes.trim() ? `• 특이사항: ${notes.trim()}\n\n` : '\n') +
      `영업사원이 취소 방어할 수 있도록 관리대장의 가입상태는 유지하며,\n` +
      `구글 시트 '취소및해약'에 [접수중]으로 기록하시겠습니까?`;

    const isConfirmed = (window as any).customConfirm
      ? await (window as any).customConfirm(confirmMsg, '취소 접수 등록')
      : window.confirm(confirmMsg);

    if (!isConfirmed) return;

    setIsSubmitting(true);
    try {
      const now = new Date();
      const kstTime = new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul'
      }).format(now).replace(/\. /g, '-').replace('.', '');

      const newRecord: CancelRecord = {
        id: `CNCL-${Date.now()}`,
        createdAt: kstTime,
        processStatus: '접수중',
        receiptType,
        targetStatus: '접수대기',
        contractDate: selectedContract.contractDate || '',
        statusBefore: selectedContract.status || '가입',
        rentalNo: selectedContract.rentalNo || '',
        memName: selectedContract.memName || '',
        memNo: selectedMergedMemNos || selectedContract.memNo || '',
        prodName: selectedContract.prodName || '',
        rentalProd: selectedContract.rentalProd || '',
        hq: selectedContract.hq || '',
        branch: selectedContract.branch || '',
        empName: selectedContract.empName || '',
        firstPayDateSangjo: contractExtraDates.firstPayDateSangjo !== '-' ? contractExtraDates.firstPayDateSangjo : '',
        rentalWithdrawDate: contractExtraDates.rentalWithdrawDate !== '-' ? contractExtraDates.rentalWithdrawDate : '',
        notes: notes.trim(),
        operator: currentUser?.username || currentUser?.name || '관리자'
      };

      const saveRes = await fetch('/api/sheets/cancel-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: newRecord })
      });

      if (!saveRes.ok) {
        const errJson = await saveRes.json().catch(() => ({}));
        throw new Error(errJson.error || '구글 시트 저장 실패');
      }

      alert(`[접수 완료] '${selectedContract.memName}' 고객의 취소 건이 구글 시트 '취소및해약'에 [접수중]으로 기록되었습니다.\n영업사원 소통 후 [접수중 내역] 탭에서 취소/해약으로 확정 변경하실 수 있습니다.`);

      setSelectedContract(null);
      setSearchQuery('');
      setNotes('');
      setReceiptType('더좋은라이프');
      
      await fetchCancelRecords();
      setCancelTab('pending');
      setPendingFilter('접수중');
    } catch (err: any) {
      console.error(err);
      alert('취소 접수 중 오류가 발생했습니다: ' + (err.message || '다시 시도해 주세요.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // 관리자 전용: 관리대장 계약상태 즉시 '취소'/'해약' 적용 및 구글시트 완료 기록
  // ----------------------------------------------------
  const handleDirectApplyCancelOrTerminate = async (targetStatus: '취소' | '해약') => {
    if (!selectedContract) {
      alert('취소/해약 처리할 계약건을 선택해 주세요.');
      return;
    }

    const count = matchingContracts.length;
    const confirmMsg = `[관리자 즉시 '${targetStatus}' 적용 확인]\n\n` +
      `• 회원명: ${selectedContract.memName}\n` +
      `• 회원번호: ${selectedMergedMemNos || selectedContract.memNo}\n` +
      `• 렌탈계약번호: ${selectedContract.rentalNo || '-'}\n` +
      `• 대상 구좌수: 총 ${count}개 구좌\n` +
      `• 취소 접수처: ${receiptType}\n` +
      (notes.trim() ? `• 특이사항: ${notes.trim()}\n\n` : '\n') +
      `방어 대기 없이 관리대장의 계약상태를 즉시 '${targetStatus}'(으)로 일괄 변경하고,\n` +
      `구글 시트 '취소및해약'에도 [${targetStatus}완료]로 기록하시겠습니까?`;

    const isConfirmed = (window as any).customConfirm
      ? await (window as any).customConfirm(confirmMsg, `즉시 '${targetStatus}' 적용`)
      : window.confirm(confirmMsg);

    if (!isConfirmed) return;

    setIsSubmitting(true);
    try {
      // 1. 관리대장 원장 상태 변경 (B열: colIdx = 1)
      const statusUpdates = matchingContracts.map(c => ({
        rowIdx: c.originalRowIdx,
        colIdx: 1, // B열 (가입상태)
        newValue: targetStatus,
        expectedMemNo: c.memNo,
        expectedRentalNo: c.rentalNo
      }));

      if (statusUpdates.length > 0) {
        await onBatchUpdateCells(statusUpdates);
      }

      // 2. 구글 시트 '취소및해약' 탭에 완료 기록
      const now = new Date();
      const kstTime = new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul'
      }).format(now).replace(/\. /g, '-').replace('.', '');

      const newRecord: CancelRecord = {
        id: `CNCL-${Date.now()}`,
        createdAt: kstTime,
        processedAt: kstTime, // 관리자 즉시 처리일시 반영
        processStatus: `${targetStatus}완료`,
        receiptType,
        targetStatus,
        contractDate: selectedContract.contractDate || '',
        statusBefore: selectedContract.status || '가입',
        rentalNo: selectedContract.rentalNo || '',
        memName: selectedContract.memName || '',
        memNo: selectedMergedMemNos || selectedContract.memNo || '',
        prodName: selectedContract.prodName || '',
        rentalProd: selectedContract.rentalProd || '',
        hq: selectedContract.hq || '',
        branch: selectedContract.branch || '',
        empName: selectedContract.empName || '',
        firstPayDateSangjo: contractExtraDates.firstPayDateSangjo !== '-' ? contractExtraDates.firstPayDateSangjo : '',
        rentalWithdrawDate: contractExtraDates.rentalWithdrawDate !== '-' ? contractExtraDates.rentalWithdrawDate : '',
        notes: notes.trim(),
        operator: currentUser?.username || currentUser?.name || '관리자'
      };

      const saveRes = await fetch('/api/sheets/cancel-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: newRecord })
      });

      if (!saveRes.ok) {
        const errJson = await saveRes.json().catch(() => ({}));
        throw new Error(errJson.error || '구글 시트 저장 실패');
      }

      alert(`[적용 완료] '${selectedContract.memName}' 고객의 계약(총 ${count}구좌)이 관리대장 및 구글 시트에 즉시 '${targetStatus}'(으)로 적용되었습니다.`);

      setSelectedContract(null);
      setSearchQuery('');
      setNotes('');
      setReceiptType('더좋은라이프');
      
      await fetchCancelRecords();
      setCancelTab('list');
    } catch (err: any) {
      console.error(err);
      alert('취소/해약 적용 중 오류가 발생했습니다: ' + (err.message || '다시 시도해 주세요.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // 접수중 내역에서 렌탈계약번호 매칭 취소/해약 일괄 변경
  // ----------------------------------------------------
  const handleBatchChangeStatus = async (targetStatus: '취소' | '해약') => {
    if (selectedPendingIds.size === 0) {
      alert('상태를 변경할 접수 건을 1개 이상 선택해 주세요.');
      return;
    }

    const targetRecords = cancelRecords.filter(r => selectedPendingIds.has(r.id));
    if (targetRecords.length === 0) return;

    // 렌탈계약번호 매칭: 엉뚱한 정보가 변경되지 않도록 유효 렌탈계약번호로 관리대장 행 매칭
    const targetRentalNos = new Set(targetRecords.map(r => r.rentalNo?.trim()).filter(Boolean));
    const targetMemNos = new Set(
      targetRecords.flatMap(r => (r.memNo || '').split(',').map(s => s.trim()).filter(Boolean))
    );

    const matchedERPItems: ERPDataItem[] = [];
    data.forEach(item => {
      const itemRentalNo = (item.rentalNo || '').trim();
      const itemMemNo = (item.memNo || '').trim();

      if (itemRentalNo && targetRentalNos.has(itemRentalNo)) {
        matchedERPItems.push(item);
      } else if (!itemRentalNo && itemMemNo && targetMemNos.has(itemMemNo)) {
        matchedERPItems.push(item);
      }
    });

    const summaryText = targetRecords.map(r => `• ${r.memName} (렌탈: ${r.rentalNo || '-'}, 회원: ${r.memNo})`).join('\n');
    const confirmMsg = `[주의: 가입상태 일괄 '${targetStatus}' 변경]\n\n` +
      `선택된 접수 ${targetRecords.length}건에 대해 렌탈계약번호로 매칭된 관리대장 총 ${matchedERPItems.length}개 구좌의 가입상태를 '${targetStatus}'(으)로 일괄 변경하시겠습니까?\n\n` +
      `<대상 접수 목록>\n${summaryText}\n\n` +
      `* 변경 시 관리대장 B열이 '${targetStatus}'(으)로 변경되며, 구글 시트 '취소및해약'의 처리상태도 '${targetStatus}완료'로 갱신됩니다.`;

    const isConfirmed = (window as any).customConfirm
      ? await (window as any).customConfirm(confirmMsg, `일괄 '${targetStatus}' 확정 변경`)
      : window.confirm(confirmMsg);

    if (!isConfirmed) return;

    setIsBatchProcessing(true);
    try {
      const updates = matchedERPItems.map(c => ({
        rowIdx: c.originalRowIdx,
        colIdx: 1, // B열 (가입상태)
        newValue: targetStatus,
        expectedMemNo: c.memNo,
        expectedRentalNo: c.rentalNo
      }));

      if (updates.length > 0) {
        await onBatchUpdateCells(updates);
      }

      const now = new Date();
      const kstTime = new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul'
      }).format(now).replace(/\. /g, '-').replace('.', '');

      const statusUpdates = targetRecords.map(r => ({
        id: r.id,
        newStatus: `${targetStatus}완료`,
        processedAt: kstTime
      }));

      await fetch('/api/sheets/cancel-records/batch-update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: statusUpdates })
      });

      alert(`[성공] 선택된 ${targetRecords.length}건(관리대장 ${matchedERPItems.length}구좌)이 성공적으로 '${targetStatus}' 처리되었습니다.`);

      setSelectedPendingIds(new Set());
      await fetchCancelRecords();
    } catch (err: any) {
      console.error(err);
      alert('일괄 상태 변경 중 오류가 발생했습니다: ' + (err.message || '다시 시도해 주세요.'));
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // 방어 성공 처리
  const handleBatchDefenseSuccess = async () => {
    if (selectedPendingIds.size === 0) {
      alert('방어 성공 처리할 접수 건을 1개 이상 선택해 주세요.');
      return;
    }

    const targetRecords = cancelRecords.filter(r => selectedPendingIds.has(r.id));
    const confirmMsg = `선택된 ${targetRecords.length}건을 [방어성공(취소철회)] 상태로 종결하시겠습니까?\n(관리대장의 가입 상태는 그대로 유지됩니다)`;

    const isConfirmed = (window as any).customConfirm
      ? await (window as any).customConfirm(confirmMsg, '방어 성공 처리')
      : window.confirm(confirmMsg);

    if (!isConfirmed) return;

    setIsBatchProcessing(true);
    try {
      const now = new Date();
      const kstTime = new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul'
      }).format(now).replace(/\. /g, '-').replace('.', '');

      const statusUpdates = targetRecords.map(r => ({
        id: r.id,
        newStatus: '방어성공',
        processedAt: kstTime
      }));

      await fetch('/api/sheets/cancel-records/batch-update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: statusUpdates })
      });

      alert(`선택된 ${targetRecords.length}건이 '방어성공'으로 종결되었습니다.`);
      setSelectedPendingIds(new Set());
      await fetchCancelRecords();
    } catch (err: any) {
      alert('처리 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // 접수 대장 개별 상태 토글
  const handleToggleRecordStatus = async (record: CancelRecord) => {
    const nextStatus = record.processStatus === '접수중' ? '처리완료' : '접수중';
    const confirmMsg = `'${record.memName}' 고객의 처리상태를 '${nextStatus}'(으)로 변경하시겠습니까?`;
    
    const isConfirmed = (window as any).customConfirm
      ? await (window as any).customConfirm(confirmMsg, '처리상태 변경')
      : window.confirm(confirmMsg);

    if (!isConfirmed) return;

    try {
      const res = await fetch('/api/sheets/cancel-records/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, newStatus: nextStatus })
      });

      if (!res.ok) throw new Error('상태 변경 실패');
      setCancelRecords(prev => prev.map(r => r.id === record.id ? { ...r, processStatus: nextStatus } : r));
    } catch (err: any) {
      alert('상태 변경 중 오류가 발생했습니다: ' + err.message);
    }
  };

  // 기준 기간/상태에 따른 기본 데이터 목록 (본부/지사 드롭다운 목록 생성용)
  const baseListForFilters = useMemo(() => {
    if (!type) return [];
    return data.filter(d => {
      const contractDateStr = d.contractDate ? d.contractDate.replace(/\./g, '-').substring(0, 7) : '';
      const deliveryDateStr = d.deliveryDate ? d.deliveryDate.replace(/\./g, '-').substring(0, 7) : '';

      if (type === 'delivery') {
        const isJoined = d.status === '가입';
        if (viewAllMonths) {
          return d.deliveryStatus === '배송완료' && isJoined;
        }
        return d.deliveryStatus === '배송완료' && deliveryDateStr === month && isJoined;
      } else {
        const isCancelled = d.status.includes('취소') || d.status.includes('해약') || d.deliveryStatus.includes('취소') || d.deliveryStatus.includes('반품');
        if (viewAllMonths) {
          return isCancelled;
        }
        return contractDateStr === month && isCancelled;
      }
    });
  }, [data, type, month, viewAllMonths]);

  // 가용 본부 목록 (오름차순 정렬)
  const availableHqs = useMemo(() => {
    const set = new Set<string>();
    baseListForFilters.forEach(item => {
      if (item.hq && item.hq.trim()) set.add(item.hq.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [baseListForFilters]);

  // 가용 지사 목록 (선택된 본부 기반, 오름차순 정렬)
  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    baseListForFilters.forEach(item => {
      if (selectedHqFilter === '전체' || item.hq === selectedHqFilter) {
        if (item.branch && item.branch.trim()) set.add(item.branch.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [baseListForFilters, selectedHqFilter]);

  // 본부 변경 등으로 지사 목록에 없어진 경우 리셋
  useEffect(() => {
    if (selectedBranchFilter !== '전체' && !availableBranches.includes(selectedBranchFilter)) {
      setSelectedBranchFilter('전체');
    }
  }, [availableBranches, selectedBranchFilter]);

  // 기존 관리대장 기반 취소/해약 데이터 필터링
  const filteredData = useMemo(() => {
    if (!type) return [];

    let temp = data.filter(d => {
      const contractDateStr = d.contractDate ? d.contractDate.replace(/\./g, '-').substring(0, 7) : '';
      const deliveryDateStr = d.deliveryDate ? d.deliveryDate.replace(/\./g, '-').substring(0, 7) : '';

      if (type === 'delivery') {
        const isJoined = d.status === '가입';
        if (viewAllMonths) {
          return d.deliveryStatus === '배송완료' && isJoined;
        }
        return d.deliveryStatus === '배송완료' && deliveryDateStr === month && isJoined;
      } else {
        const isCancelled = d.status.includes('취소') || d.status.includes('해약') || d.deliveryStatus.includes('취소') || d.deliveryStatus.includes('반품');
        if (viewAllMonths) {
          return isCancelled;
        }
        return contractDateStr === month && isCancelled;
      }
    });

    const groups = new Map<string, ERPDataItem[]>();
    const nonRentalItems: ERPDataItem[] = [];

    temp.forEach(d => {
      if (d.rentalNo) {
        if (!groups.has(d.rentalNo)) {
          groups.set(d.rentalNo, []);
        }
        groups.get(d.rentalNo)!.push(d);
      } else {
        nonRentalItems.push(d);
      }
    });

    const groupedItems: ERPDataItem[] = [];
    groups.forEach((items, rentalNo) => {
      if (items.length === 1) {
        groupedItems.push({
          ...items[0],
          accountCount: 1,
        });
      } else {
        const mergedMemNos = Array.from(new Set(items.map(i => i.memNo).filter(Boolean))).sort().join(', ');
        const mergedMemNames = Array.from(new Set(items.map(i => i.memName).filter(Boolean))).sort().join(', ');
        const mergedRentalProds = Array.from(new Set(items.map(i => i.rentalProd).filter(Boolean))).sort().join(', ');
        const mergedProdNames = Array.from(new Set(items.map(i => i.prodName).filter(Boolean))).sort().join(', ');
        
        groupedItems.push({
          ...items[0],
          memNo: mergedMemNos,
          memName: mergedMemNames,
          rentalProd: mergedRentalProds,
          prodName: mergedProdNames,
          accountCount: items.length,
        });
      }
    });

    const nonRentalWithCount = nonRentalItems.map(i => ({ ...i, accountCount: 1 }));
    temp = [...groupedItems, ...nonRentalWithCount];

    if (manualOrderFilter === 'manual') {
      temp = temp.filter(item => checkIsManualOrder(item));
    } else if (manualOrderFilter === 'normal') {
      temp = temp.filter(item => !checkIsManualOrder(item));
    }

    if (selectedHqFilter !== '전체') {
      temp = temp.filter(item => (item.hq || '').trim() === selectedHqFilter);
    }

    if (selectedBranchFilter !== '전체') {
      temp = temp.filter(item => (item.branch || '').trim() === selectedBranchFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      temp = temp.filter(item => {
        const name = item.memName ? item.memName.toLowerCase() : '';
        const rentalNo = item.rentalNo ? item.rentalNo.toLowerCase() : '';
        const hq = item.hq ? item.hq.toLowerCase() : '';
        const branch = item.branch ? item.branch.toLowerCase() : '';
        const prod = item.prodName ? item.prodName.toLowerCase() : '';
        const rentalProd = item.rentalProd ? item.rentalProd.toLowerCase() : '';
        const empName = item.empName ? item.empName.toLowerCase() : '';
        return (
          name.includes(term) ||
          rentalNo.includes(term) ||
          hq.includes(term) ||
          branch.includes(term) ||
          prod.includes(term) ||
          rentalProd.includes(term) ||
          empName.includes(term)
        );
      });
    }

    // 취소/해약 구글시트 연동 매칭 맵 (렌탈번호 및 회원번호 매칭)
    const cancelMapByRentalNo = new Map<string, CancelRecord>();
    const cancelMapByMemNo = new Map<string, CancelRecord>();

    cancelRecords.forEach(r => {
      const rNo = (r.rentalNo || '').trim();
      const pTime = r.processedAt || (r.processStatus !== '접수중' ? r.createdAt : '') || '';
      if (rNo) {
        const exist = cancelMapByRentalNo.get(rNo);
        const existTime = exist ? (exist.processedAt || (exist.processStatus !== '접수중' ? exist.createdAt : '') || '') : '';
        if (!exist || pTime.localeCompare(existTime) > 0) {
          cancelMapByRentalNo.set(rNo, r);
        }
      }
      const memNos = (r.memNo || '').split(',').map(s => s.trim()).filter(Boolean);
      memNos.forEach(m => {
        const exist = cancelMapByMemNo.get(m);
        const existTime = exist ? (exist.processedAt || (exist.processStatus !== '접수중' ? exist.createdAt : '') || '') : '';
        if (!exist || pTime.localeCompare(existTime) > 0) {
          cancelMapByMemNo.set(m, r);
        }
      });
    });

    const enrichedItems: ERPDataItem[] = temp.map(item => {
      const rentalKey = (item.rentalNo || '').trim();
      let matchedRecord = rentalKey ? cancelMapByRentalNo.get(rentalKey) : undefined;
      if (!matchedRecord && item.memNo) {
        const mList = item.memNo.split(',').map(s => s.trim()).filter(Boolean);
        for (const m of mList) {
          if (cancelMapByMemNo.has(m)) {
            matchedRecord = cancelMapByMemNo.get(m);
            break;
          }
        }
      }

      if (matchedRecord) {
        const pTime = matchedRecord.processedAt || (matchedRecord.processStatus !== '접수중' ? matchedRecord.createdAt : '');
        return {
          ...item,
          cancelProcessedAt: pTime || '',
          cancelCreatedAt: matchedRecord.createdAt || '',
          cancelReceiptType: matchedRecord.receiptType || '',
          cancelProcessStatus: matchedRecord.processStatus || ''
        };
      }
      return {
        ...item,
        cancelProcessedAt: '',
        cancelCreatedAt: '',
        cancelReceiptType: '',
        cancelProcessStatus: ''
      };
    });

    // 취소 및 해약 완료 목록은 처리일시(가장 최근 처리한 건) 기준으로 내림차순 정렬
    if (type === 'cancel') {
      return enrichedItems.sort((a, b) => {
        const timeA = a.cancelProcessedAt || '';
        const timeB = b.cancelProcessedAt || '';

        // 1. 처리일시가 있는 건들 중 가장 최근 처리일시 우선 정렬
        if (timeA && timeB) {
          return timeB.localeCompare(timeA);
        }
        if (timeA && !timeB) return -1;
        if (!timeA && timeB) return 1;

        // 2. 처리일시가 없는 과거 원장 데이터는 계약일자 최신순
        return (b.contractDate || '').localeCompare(a.contractDate || '');
      });
    }

    return enrichedItems.sort((a, b) => (b.contractDate || '').localeCompare(a.contractDate || ''));
  }, [data, type, month, searchTerm, viewAllMonths, manualOrderFilter, selectedHqFilter, selectedBranchFilter, targetProducts, cancelRecords]);

  // 필터링된 전체 구좌수 합계 계산
  const totalAccountCount = useMemo(() => {
    return filteredData.reduce((acc, cur) => acc + (cur.accountCount || 1), 0);
  }, [filteredData]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  // 구글 시트 접수 대장 필터링
  const filteredCancelRecords = useMemo(() => {
    let list = [...cancelRecords];

    if (pendingFilter === '접수중') {
      list = list.filter(r => r.processStatus === '접수중');
    } else if (pendingFilter === '처리완료') {
      list = list.filter(r => r.processStatus !== '접수중');
    }

    if (pendingSearch.trim()) {
      const q = pendingSearch.trim().toLowerCase();
      list = list.filter(r => 
        (r.memName && r.memName.toLowerCase().includes(q)) ||
        (r.rentalNo && r.rentalNo.toLowerCase().includes(q)) ||
        (r.memNo && r.memNo.toLowerCase().includes(q)) ||
        (r.prodName && r.prodName.toLowerCase().includes(q)) ||
        (r.receiptType && r.receiptType.toLowerCase().includes(q)) ||
        (r.notes && r.notes.toLowerCase().includes(q)) ||
        (r.empName && r.empName.toLowerCase().includes(q)) ||
        (r.hq && r.hq.toLowerCase().includes(q))
      );
    }

    // 처리일시(또는 접수일시) 최신순으로 정렬
    return list.sort((a, b) => {
      const timeA = a.processedAt || a.createdAt || '';
      const timeB = b.processedAt || b.createdAt || '';
      return timeB.localeCompare(timeA);
    });
  }, [cancelRecords, pendingFilter, pendingSearch]);

  const totalPendingPages = Math.ceil(filteredCancelRecords.length / pendingItemsPerPage) || 1;
  // 렌탈번호로 관리대장(data)에서 일치하는 모든 회원번호 목록 동적 추출 (낮은 회원번호 우선 오름차순)
  const getDisplayMemNos = useCallback((record: CancelRecord) => {
    const rentalNo = (record.rentalNo || '').trim();
    if (rentalNo && data && data.length > 0) {
      const matched = data.filter(d => (d.rentalNo || '').trim() === rentalNo);
      if (matched.length > 0) {
        const uniqueMemNos = Array.from(new Set(matched.map(d => d.memNo).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        if (uniqueMemNos.length > 0) {
          return uniqueMemNos.join(', ');
        }
      }
    }
    const fallbackList = (record.memNo || '').split(',').map(s => s.trim()).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    return fallbackList.length > 0 ? fallbackList.join(', ') : '-';
  }, [data]);

  const paginatedPendingRecords = useMemo(() => {
    const start = (pendingPage - 1) * pendingItemsPerPage;
    return filteredCancelRecords.slice(start, start + pendingItemsPerPage);
  }, [filteredCancelRecords, pendingPage]);

  // 접수 대장 전체 선택 토글
  const isAllPendingSelected = useMemo(() => {
    if (paginatedPendingRecords.length === 0) return false;
    return paginatedPendingRecords.every(r => selectedPendingIds.has(r.id));
  }, [paginatedPendingRecords, selectedPendingIds]);

  const toggleSelectAllPending = () => {
    setSelectedPendingIds(prev => {
      const next = new Set(prev);
      if (isAllPendingSelected) {
        paginatedPendingRecords.forEach(r => next.delete(r.id));
      } else {
        paginatedPendingRecords.forEach(r => next.add(r.id));
      }
      return next;
    });
  };

  const toggleSelectPendingItem = (id: string) => {
    setSelectedPendingIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pendingCount = useMemo(() => cancelRecords.filter(r => r.processStatus === '접수중').length, [cancelRecords]);
  const completedCount = useMemo(() => cancelRecords.filter(r => r.processStatus !== '접수중').length, [cancelRecords]);

  // 엑셀 다운로드 (기존 완료 목록)
  const handleExportExcel = () => {
    const XLSX = (window as any).XLSX;
    if (!XLSX) {
      alert('엑셀 라이브러리가 로드되지 않았습니다.');
      return;
    }

    const titleText = type === 'delivery' ? '배송완료' : '취소및해약';
    const exportData = filteredData.map((item, index) => {
      if (type === 'delivery') {
        return {
          '순번': index + 1,
          '발주구분': checkIsManualOrder(item) ? '수기발주' : '일반',
          '계약일자': item.contractDate,
          '배송일자': item.deliveryDate || '',
          '회원번호': item.memNo || '',
          '회원명': item.memName || '',
          '렌탈번호': item.rentalNo || '',
          '구좌수': item.accountCount || 1,
          '상품명': item.prodName || '',
          '제품명': item.rentalProd || '',
          '본부': item.hq || '',
          '지사': item.branch || '',
          '사원명': item.empName || '',
          '계약상태': item.status || '',
          '배송상태': item.deliveryStatus || '',
        };
      } else {
        return {
          '순번': index + 1,
          '계약상태': item.status || '',
          '처리일시': item.cancelProcessedAt || '',
          '접수일시': item.cancelCreatedAt || '',
          '계약일자': item.contractDate,
          '회원번호': item.memNo || '',
          '회원명': item.memName || '',
          '렌탈번호': item.rentalNo || '',
          '구좌수': item.accountCount || 1,
          '상품명': item.prodName || '',
          '제품명': item.rentalProd || '',
          '본부': item.hq || '',
          '지사': item.branch || '',
          '사원명': item.empName || '',
        };
      }
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, titleText);
    const timePrefix = viewAllMonths ? '전체기간' : month;
    XLSX.writeFile(wb, `${timePrefix}_상세내역_${titleText}_${new Date().getTime()}.xlsx`);
  };

  // 엑셀 다운로드 (접수 대장)
  const handleExportPendingExcel = () => {
    const XLSX = (window as any).XLSX;
    if (!XLSX) {
      alert('엑셀 라이브러리가 로드되지 않았습니다.');
      return;
    }

    const exportData = filteredCancelRecords.map((item, index) => ({
      '순번': index + 1,
      '접수ID': item.id,
      '접수일시': item.createdAt,
      '처리일시': item.processedAt || (item.processStatus !== '접수중' ? item.createdAt : ''),
      '처리상태': item.processStatus,
      '취소접수처': item.receiptType,
      '계약일자': item.contractDate,
      '가입상태': item.statusBefore,
      '렌탈계약번호': item.rentalNo,
      '회원명': item.memName,
      '회원번호': getDisplayMemNos(item),
      '상품명': item.prodName,
      '제품명': item.rentalProd,
      '본부': item.hq,
      '지사': item.branch,
      '사원명': item.empName,
      '최초납입일(상조)': item.firstPayDateSangjo || '',
      '렌탈출금일': item.rentalWithdrawDate || '',
      '특이사항': item.notes,
      '접수자': item.operator || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '취소및해약_접수대장');
    XLSX.writeFile(wb, `취소및해약_접수대장_${new Date().getTime()}.xlsx`);
  };

  if (!isOpen || !type) return null;

  const isDelivery = type === 'delivery';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="bg-white rounded-2xl shadow-2xl w-[98vw] max-w-[1720px] overflow-hidden flex flex-col max-h-[94vh] border border-slate-200"
        >
          {/* 헤더 */}
          <div className={`px-6 py-4 flex items-center justify-between text-white ${isDelivery ? 'bg-sky-600' : 'bg-linear-to-r from-rose-600 via-rose-700 to-red-700'}`}>
            <div className="flex items-center gap-3">
              {isDelivery ? (
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                  <Truck size={20} />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                  <AlertCircle size={20} />
                </div>
              )}
              <div>
                <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                  {isDelivery 
                    ? `[${viewAllMonths ? '전체 기간' : month}] 배송완료 상세 내역`
                    : `취소 및 해약 관리 대장`
                  }
                  {!isDelivery && (
                    <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-xs">
                      구글시트 실시간 연동
                    </span>
                  )}
                </h2>
                <p className="text-[11px] text-white/80 font-medium">
                  {isDelivery 
                    ? `배송완료된 계약건 목록 및 수기발주 여부를 조회합니다.`
                    : `취소 접수 기록 ➔ 취소 방어 기간 ➔ [접수중 내역]에서 일괄 취소/해약 확정 처리`
                  }
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/15 transition-colors text-white/90 hover:text-white"
                title="닫기"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* 취소/해약 전용 상단 탭 네비게이션: 1번째 취소 및 해약 접수, 2번째 접수중 내역, 3번째 완료 목록 */}
          {!isDelivery && (
            <div className="bg-slate-100/90 px-6 pt-3 pb-0 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                
                {/* 1번째 탭: 취소 및 해약 접수 */}
                <button
                  type="button"
                  onClick={() => setCancelTab('register')}
                  className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-t border-x ${
                    cancelTab === 'register'
                      ? 'bg-white text-rose-700 border-slate-200 shadow-xs translate-y-[1px]'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Plus size={15} className="text-rose-600" />
                  <span>취소 및 해약 접수</span>
                </button>

                {/* 2번째 탭: 접수중 내역 */}
                <button
                  type="button"
                  onClick={() => setCancelTab('pending')}
                  className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-t border-x ${
                    cancelTab === 'pending'
                      ? 'bg-white text-rose-700 border-slate-200 shadow-xs translate-y-[1px]'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Clock size={15} className={pendingCount > 0 ? 'text-amber-500 animate-pulse' : ''} />
                  <span>접수중 내역 (취소및해약 시트)</span>
                  {pendingCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white shadow-2xs">
                      {pendingCount}건 접수중
                    </span>
                  )}
                </button>

                {/* 3번째 탭: 취소 및 해약 완료 목록 */}
                <button
                  type="button"
                  onClick={() => setCancelTab('list')}
                  className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-t border-x ${
                    cancelTab === 'list'
                      ? 'bg-white text-rose-700 border-slate-200 shadow-xs translate-y-[1px]'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <FileText size={15} />
                  <span>취소 및 해약 완료 목록</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    cancelTab === 'list' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {filteredData.length}
                  </span>
                </button>

              </div>

              <div className="pb-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchCancelRecords()}
                  disabled={isLoadingRecords}
                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                  title="구글 시트 데이터 새로고침"
                >
                  <RefreshCw size={13} className={isLoadingRecords ? 'animate-spin text-rose-600' : ''} />
                  시트 동기화
                </button>
              </div>
            </div>
          )}

          {/* ========================================================
             메인 콘텐츠 영역
             ======================================================== */}
          <div className="flex-1 overflow-y-auto flex flex-col bg-slate-50/50">

            {/* TAB 1: 신규 취소 및 해약 접수 폼 */}
            {!isDelivery && cancelTab === 'register' && (
              <div className="p-6 max-w-5xl mx-auto w-full space-y-5">
                
                {/* 1. 계약 검색창 */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800 flex items-center gap-2">
                      <Search size={15} className="text-rose-600" />
                      <span>취소 접수 대상 검색 (렌탈계약번호 혹은 회원명)</span>
                    </label>
                    <span className="text-[11px] text-slate-400 font-medium">
                      * 현재 '가입' 상태인 계약 건만 검색 대상입니다.
                    </span>
                  </div>

                  <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="렌탈계약번호 혹은 회원명을 입력하세요 (예: 2026..., 박정은, J26...)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium bg-slate-50/40 focus:bg-white transition-all"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* 2번 요구: 동일 렌탈번호는 하나만 노출 + 옆에 회원번호 나열(괄호 없음) */}
                  {searchQuery.trim() && (
                    <div className="border border-slate-200 rounded-lg bg-white shadow-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {groupedSearchResults.length > 0 ? (
                        groupedSearchResults.map(group => {
                          const item = group.representative;
                          const isSelected = selectedContract?.rentalNo && selectedContract.rentalNo === item.rentalNo;
                          return (
                            <div
                              key={item.uniqueKey}
                              onClick={() => {
                                setSelectedContract(item);
                                setSearchQuery('');
                              }}
                              className={`p-2.5 hover:bg-rose-50/40 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                                isSelected ? 'bg-rose-50/70 border-l-4 border-rose-600' : ''
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                                <span className="font-bold text-slate-900 text-xs shrink-0">{item.memName}</span>
                                
                                {/* 2번 요구: 회원번호 괄호 없이 나열 & 원클릭 복사 */}
                                <span className="text-[11px] text-slate-600 shrink-0 flex items-center gap-1">
                                  <CopyableMemNos memNosStr={group.mergedMemNos} layout="row" />
                                </span>
                                
                                <span className="text-[11px] text-slate-300 shrink-0">|</span>
                                
                                <span className="text-[11px] font-mono font-bold text-rose-600 shrink-0 flex items-center gap-1">
                                  <span>렌탈:</span>
                                  <CopyableText text={item.rentalNo} className="text-rose-600 font-mono font-bold" />
                                </span>

                                <span className="text-[11px] text-slate-600 truncate max-w-[200px]" title={item.prodName}>
                                  {item.prodName}
                                </span>

                                <span className="text-[10px] text-slate-400 shrink-0">({item.hq} {item.branch})</span>

                                {group.count > 1 && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                                    {group.count}구좌
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold shrink-0 transition-colors"
                              >
                                선택
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-6 text-center text-slate-400 text-xs font-medium">
                          일치하는 가입 상태의 계약건이 없습니다.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2번 & 3번 요구: 선택된 계약 정보 컴팩트 2줄 테이블 */}
                {selectedContract ? (
                  <div className="bg-white rounded-xl border border-rose-200 shadow-sm p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-rose-600" />
                        <h3 className="text-xs font-black text-slate-900">선택된 계약 상세 정보</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {matchingContracts.length > 1 && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                            <Tag size={11} />
                            동일 렌탈번호 총 {matchingContracts.length}구좌 매칭
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedContract(null)}
                          className="px-2 py-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded text-[11px] font-bold transition-colors"
                        >
                          다시 선택
                        </button>
                      </div>
                    </div>

                    {/* 1번, 2번, 3번 요구 반영 테이블:
                        - (원클릭 복사) 텍스트 일체 삭제!
                        - 회원번호 괄호 없이 나열 및 원클릭 복사
                        - V열 최초납입일(상조), AA열 렌탈출금일 표시 (렌탈계약번호 매칭)
                        - 슬림한 2줄(2행 5열) 테이블 */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                            <th className="px-3.5 py-2 w-[18%] whitespace-nowrap">계약일자 / 계약상태</th>
                            <th className="px-3.5 py-2 w-[22%] whitespace-nowrap">회원명 / 회원번호</th>
                            <th className="px-3.5 py-2 w-[20%] whitespace-nowrap">렌탈계약번호 / 렌탈출금일</th>
                            <th className="px-3.5 py-2 w-[20%] whitespace-nowrap">상품명 / 제품명</th>
                            <th className="px-3.5 py-2 w-[20%] whitespace-nowrap">최초납입일(상조) / 본부·지사·사원</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {/* 1행: 계약일자, 회원명, 렌탈계약번호, 상품명, 최초납입일(상조, V열) */}
                          <tr className="bg-white">
                            <td className="px-3.5 py-2 font-mono font-bold text-slate-800">
                              <span className="text-[10px] text-slate-400 block font-normal">계약일자</span>
                              {selectedContract.contractDate || '-'}
                            </td>
                            <td className="px-3.5 py-2 font-bold text-slate-900">
                              <span className="text-[10px] text-slate-400 block font-normal">회원명</span>
                              <span>{selectedContract.memName}</span>
                            </td>
                            <td className="px-3.5 py-2">
                              <span className="text-[10px] text-slate-400 block font-normal">렌탈계약번호</span>
                              <CopyableText text={selectedContract.rentalNo} className="text-rose-600 font-mono font-bold" />
                            </td>
                            <td className="px-3.5 py-2 font-bold text-slate-800">
                              <span className="text-[10px] text-slate-400 block font-normal">상품명</span>
                              <span className="truncate block max-w-[200px]" title={selectedContract.prodName}>{selectedContract.prodName || '-'}</span>
                            </td>
                            <td className="px-3.5 py-2 font-bold text-sky-800 font-mono">
                              <span className="text-[10px] text-slate-400 block font-normal">최초납입일(상조) [V열]</span>
                              {contractExtraDates.firstPayDateSangjo}
                            </td>
                          </tr>

                          {/* 2행: 계약상태, 회원번호(괄호없음/복사), 렌탈출금일(AA열), 제품명, 본부/지사/사원명 */}
                          <tr className="bg-slate-50/60 border-t border-slate-100">
                            <td className="px-3.5 py-2">
                              <span className="text-[10px] text-slate-400 block font-normal">가입상태 (현재)</span>
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {selectedContract.status || '가입'}
                              </span>
                            </td>
                            <td className="px-3.5 py-2">
                              <span className="text-[10px] text-slate-400 block font-normal">회원번호</span>
                              {/* 2번 & 5번 요구: 회원번호 괄호 없이 나열 & 원클릭 복사 */}
                              <CopyableMemNos memNosStr={selectedMergedMemNos || selectedContract.memNo} />
                            </td>
                            <td className="px-3.5 py-2 font-mono font-bold text-emerald-700">
                              <span className="text-[10px] text-slate-400 block font-normal">렌탈출금일 [AA열]</span>
                              {contractExtraDates.rentalWithdrawDate}
                            </td>
                            <td className="px-3.5 py-2 text-slate-600">
                              <span className="text-[10px] text-slate-400 block font-normal">제품명</span>
                              <span className="truncate block max-w-[200px]" title={selectedContract.rentalProd}>{selectedContract.rentalProd || '-'}</span>
                            </td>
                            <td className="px-3.5 py-2 text-slate-700 font-medium">
                              <span className="text-[10px] text-slate-400 block font-normal">본부 / 지사 / 사원명</span>
                              <span className="truncate block max-w-[200px]">
                                {selectedContract.hq || '-'} {selectedContract.branch ? `/ ${selectedContract.branch}` : ''} ({selectedContract.empName || '-'})
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* 취소 접수처 선택 + 특이사항 입력 */}
                    <div className="space-y-3.5 pt-2">
                      <div>
                        <label className="block text-xs font-black text-slate-700 mb-1.5">
                          취소 접수처 <span className="text-rose-500">*</span>
                        </label>
                        <div className="grid grid-cols-3 gap-2.5">
                          {(['더좋은라이프', '에넥스', '영업조직'] as const).map(option => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setReceiptType(option)}
                              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                                receiptType === option
                                  ? 'bg-rose-50 border-rose-600 text-rose-700 shadow-2xs font-black'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                                receiptType === option ? 'border-rose-600 bg-rose-600' : 'border-slate-300'
                              }`}>
                                {receiptType === option && <div className="w-1 h-1 rounded-full bg-white" />}
                              </div>
                              <span>{option}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-black text-slate-700 mb-1.5">
                          특이사항
                        </label>
                        <textarea
                          rows={2}
                          placeholder="취소 사유, 고객 소통 내용, 반품/위약금 관련 특이사항을 입력하세요."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium bg-slate-50/30 focus:bg-white transition-all resize-none"
                        />
                      </div>

                      {isAdmin ? (
                        <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg text-[11px] text-indigo-950 flex items-start gap-2">
                          <ShieldCheck size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <strong className="text-indigo-900 block font-black">관리자 전용 즉시 적용 권한:</strong>
                            <p className="text-indigo-800 leading-relaxed">
                              취소 방어 기간 부여가 필요한 경우 <strong>[접수만 등록]</strong>을 선택하시고, 즉시 원장 상태까지 변경하시려면 하단의 <strong>[관리대장 즉시 '취소' 적용]</strong> 또는 <strong>['해약' 적용]</strong>을 클릭하세요.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
                          <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <strong>영업사원 취소 방어 기간 부여:</strong> 지금 접수하시면 관리대장의 가입상태는 변경되지 않고 구글 시트 <strong>'취소및해약'</strong>에 <strong>[접수중]</strong>으로만 안전하게 기록됩니다.
                            영업사원 소통 후 방어 실패 시 <strong>[접수중 내역]</strong> 탭에서 일괄 취소/해약으로 확정 변경하실 수 있습니다.
                          </div>
                        </div>
                      )}

                      {isAdmin ? (
                        <div className="space-y-2 pt-1">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleDirectApplyCancelOrTerminate('취소')}
                              disabled={isSubmitting}
                              className="py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-black text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Check size={15} />
                              <span>관리대장 즉시 '취소' 적용</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDirectApplyCancelOrTerminate('해약')}
                              disabled={isSubmitting}
                              className="py-3 bg-purple-700 hover:bg-purple-800 disabled:bg-purple-400 text-white font-black text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Check size={15} />
                              <span>관리대장 즉시 '해약' 적용</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={handleSubmitCancel}
                            disabled={isSubmitting}
                            className="w-full py-2.5 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-slate-200 font-bold text-xs rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-600"
                          >
                            <Clock size={14} className="text-amber-400" />
                            <span>취소 접수만 등록 (방어 기간 부여 / [접수중] 기록)</span>
                          </button>
                        </div>
                      ) : (
                        <div>
                          <button
                            type="button"
                            onClick={handleSubmitCancel}
                            disabled={isSubmitting}
                            className="w-full py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-black text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            {isSubmitting ? (
                              <>
                                <RefreshCw size={15} className="animate-spin" />
                                <span>구글 시트 '취소및해약' 저장 중...</span>
                              </>
                            ) : (
                              <>
                                <Check size={15} />
                                <span>취소 접수 등록 (접수중 기록)</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                ) : (
                  <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center bg-white">
                    <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-2 shadow-inner">
                      <Search size={22} />
                    </div>
                    <h4 className="text-xs font-bold text-slate-700 mb-1">
                      취소 접수할 계약건을 검색해 주세요
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      상단 검색창에 렌탈계약번호 또는 회원명을 입력하여 대상을 선택하시면 컴팩트한 상세 정보와 접수 폼이 나타납니다.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: 접수중 내역 (4번 요구: 두 줄로 회원명/회원번호 따로, 상품명 아래 제품명, 본부/지사 아래 사원명) */}
            {!isDelivery && cancelTab === 'pending' && (
              <div className="flex-1 flex flex-col">
                
                {/* 일괄 액션 바 */}
                {selectedPendingIds.size > 0 && (
                  <div className="bg-linear-to-r from-rose-50 via-amber-50 to-rose-50 border-b border-rose-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-fade-in">
                    <div className="flex items-center gap-2 text-xs font-black text-rose-900">
                      <CheckSquare size={16} className="text-rose-600" />
                      <span>선택된 <strong className="underline text-rose-700">{selectedPendingIds.size}건</strong>에 대해 (렌탈계약번호 매칭):</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleBatchChangeStatus('취소')}
                        disabled={isBatchProcessing}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                      >
                        <Check size={13} />
                        <span>선택 건 '취소'로 일괄 변경</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleBatchChangeStatus('해약')}
                        disabled={isBatchProcessing}
                        className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 disabled:bg-purple-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                      >
                        <Check size={13} />
                        <span>선택 건 '해약'으로 일괄 변경</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleBatchDefenseSuccess}
                        disabled={isBatchProcessing}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                        title="취소 방어 성공 시 가입 유지 종결"
                      >
                        <ShieldCheck size={13} />
                        <span>방어 성공(취소철회) 처리</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          if (selectedPendingIds.size === 0) return;
                          const targetRecords = cancelRecords.filter(r => selectedPendingIds.has(r.id));
                          const isConfirmed = window.confirm(`선택된 ${targetRecords.length}건을 [접수중] 상태로 다시 환원하시겠습니까?`);
                          if (!isConfirmed) return;
                          try {
                            const statusUpdates = targetRecords.map(r => ({ id: r.id, newStatus: '접수중' }));
                            await fetch('/api/sheets/cancel-records/batch-update-status', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ updates: statusUpdates })
                            });
                            alert(`선택된 ${targetRecords.length}건이 '접수중'으로 환원되었습니다.`);
                            setSelectedPendingIds(new Set());
                            await fetchCancelRecords();
                          } catch (e: any) {
                            alert('오류 발생: ' + e.message);
                          }
                        }}
                        disabled={isBatchProcessing}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                        title="처리완료된 건을 다시 접수중 상태로 변경"
                      >
                        <RotateCcw size={13} />
                        <span>선택 건 '접수중'으로 환원</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedPendingIds(new Set())}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-300 transition-colors"
                      >
                        선택 해제
                      </button>
                    </div>
                  </div>
                )}

                {/* 필터 및 통계 바 */}
                <div className="p-4 border-b border-slate-200 bg-white flex flex-col sm:flex-row gap-3 items-center justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-bold border border-slate-200/80">
                      <button
                        type="button"
                        onClick={() => { setPendingFilter('all'); setPendingPage(1); }}
                        className={`px-3 py-1.5 rounded-md transition-all ${
                          pendingFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        전체 ({cancelRecords.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPendingFilter('접수중'); setPendingPage(1); }}
                        className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                          pendingFilter === '접수중' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Clock size={12} />
                        접수중 ({pendingCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPendingFilter('처리완료'); setPendingPage(1); }}
                        className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                          pendingFilter === '처리완료' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Check size={12} />
                        처리완료 ({completedCount})
                      </button>
                    </div>

                    <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                      | 총 <strong className="text-slate-800">{filteredCancelRecords.length}</strong>건
                    </span>
                  </div>

                  <div className="flex w-full sm:w-auto items-center gap-2">
                    <div className="relative flex-1 sm:w-72">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="회원명, 렌탈번호, 접수처, 특이사항 검색"
                        value={pendingSearch}
                        onChange={(e) => { setPendingSearch(e.target.value); setPendingPage(1); }}
                        className="w-full pl-9 pr-4 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50/50"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setCancelTab('register')}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors shrink-0"
                    >
                      <Plus size={14} />
                      <span>신규 접수</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportPendingExcel}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors shrink-0"
                    >
                      <Download size={14} />
                      <span>엑셀 다운로드</span>
                    </button>
                  </div>
                </div>

                {/* 4번 요구: 접수중 내역 테이블도 두 줄(위/아래)로 구성!
                    - 회원명, 회원번호 따로 (원클릭 복사)
                    - 상품명 아래 제품명
                    - 본부/지사 아래 사원명
                    - 렌탈번호 아래 계약일자 */}
                <div className="flex-1 overflow-x-auto min-h-[350px]">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <th className="px-3 py-2.5 text-center w-10">
                          <input
                            type="checkbox"
                            checked={isAllPendingSelected}
                            onChange={toggleSelectAllPending}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                        </th>
                        <th className="px-3 py-2.5 text-center w-24 whitespace-nowrap">순번 / 처리상태</th>
                        <th className="px-3 py-2.5 w-36 whitespace-nowrap">접수일시 / 접수처</th>
                        <th className="px-3 py-2.5 w-36 whitespace-nowrap">처리일시</th>
                        <th className="px-3 py-2.5 w-36 whitespace-nowrap">렌탈계약번호 / 계약일자</th>
                        <th className="px-3 py-2.5 w-24 whitespace-nowrap">회원명</th>
                        <th className="px-3 py-2.5 w-44 whitespace-nowrap">회원번호</th>
                        <th className="px-3 py-2.5 w-72 min-w-[200px] whitespace-nowrap">상품명 / 제품명</th>
                        <th className="px-3 py-2.5 w-44 min-w-[140px] whitespace-nowrap">본부 지사 / 사원명</th>
                        <th className="px-3 py-2.5 w-44 max-w-[180px] whitespace-nowrap">특이사항</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {paginatedPendingRecords.length > 0 ? (
                        paginatedPendingRecords.map((r, idx) => {
                          const globalIdx = (pendingPage - 1) * pendingItemsPerPage + idx + 1;
                          const isPending = r.processStatus === '접수중';
                          const isSelected = selectedPendingIds.has(r.id);
                          return (
                            <tr
                              key={r.id || idx}
                              onClick={() => toggleSelectPendingItem(r.id)}
                              className={`transition-colors cursor-pointer ${
                                isSelected ? 'bg-rose-50/60' : 'hover:bg-slate-50/70'
                              }`}
                            >
                              <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectPendingItem(r.id)}
                                  className="w-3.5 h-3.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                />
                              </td>
                              
                              {/* 1. 순번 / 처리상태 */}
                              <td className="px-3 py-2 text-center whitespace-nowrap">
                                <div className="font-mono text-slate-400">{globalIdx}</div>
                                <div className="mt-0.5">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${
                                    isPending
                                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                      : r.processStatus.includes('취소')
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : r.processStatus.includes('해약')
                                      ? 'bg-purple-100 text-purple-800 border border-purple-300'
                                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  }`}>
                                    {isPending ? <Clock size={10} /> : <Check size={10} />}
                                    {r.processStatus}
                                  </span>
                                </div>
                              </td>

                              {/* 2. 접수일시 / 접수처 */}
                              <td className="px-3 py-2 whitespace-nowrap">
                                <div className="font-mono text-slate-600">{r.createdAt}</div>
                                <div className="mt-0.5">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    {r.receiptType || '-'}
                                  </span>
                                </div>
                              </td>

                              {/* 2-1. 처리일시 */}
                              <td className="px-3 py-2 whitespace-nowrap">
                                {isPending ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    대기중 (방어기간)
                                  </span>
                                ) : (
                                  <div className="font-mono font-bold text-purple-700 text-[11px]">
                                    {r.processedAt || r.createdAt}
                                  </div>
                                )}
                              </td>

                              {/* 3. 렌탈계약번호 / 계약일자 */}
                              <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <div>
                                  <CopyableText text={r.rentalNo} className="text-rose-600 font-mono font-bold" />
                                </div>
                                <div className="font-mono text-slate-400 text-[10px] mt-0.5">
                                  {r.contractDate || '-'}
                                </div>
                              </td>

                              {/* 4. 회원명 (단독 열 분리) */}
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className="font-bold text-slate-900 text-xs">{r.memName}</span>
                              </td>

                              {/* 5. 회원번호 (단독 열 분리 & 원클릭 복사) */}
                              <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <CopyableMemNos memNosStr={getDisplayMemNos(r)} />
                              </td>

                              {/* 6. 상품명 / 제품명 */}
                              <td className="px-3 py-2">
                                <div className="text-slate-800 font-bold truncate max-w-[260px]" title={r.prodName}>
                                  {r.prodName || '-'}
                                </div>
                                <div className="text-slate-500 truncate max-w-[260px] text-[10px] mt-0.5" title={r.rentalProd}>
                                  {r.rentalProd || '-'}
                                </div>
                              </td>

                              {/* 7. 본부/지사 / 사원명 */}
                              <td className="px-3 py-2 whitespace-nowrap">
                                <div className="text-slate-700 font-medium truncate max-w-[150px]">
                                  {r.hq} {r.branch ? `/ ${r.branch}` : ''}
                                </div>
                                <div className="text-slate-600 font-medium text-[10px] mt-0.5">
                                  {r.empName || '-'}
                                </div>
                              </td>

                              {/* 8. 특이사항 (사용자 요구: 특이사항칸 좀 줄여줘) */}
                              <td className="px-3 py-2 text-slate-700 max-w-[180px]" title={r.notes}>
                                <div className="truncate text-xs">{r.notes || '-'}</div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={8} className="px-4 py-16 text-center text-slate-400 font-medium">
                            {isLoadingRecords ? (
                              <div className="flex items-center justify-center gap-2">
                                <RefreshCw size={16} className="animate-spin text-rose-600" />
                                <span>구글 시트 '취소및해약' 데이터를 불러오는 중...</span>
                              </div>
                            ) : (
                              '등록된 취소 및 해약 접수 내역이 없습니다.'
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 페이지네이션 (접수 대장) */}
                <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between bg-white">
                  <span className="text-xs text-slate-500">
                    {filteredCancelRecords.length}건 중 {filteredCancelRecords.length > 0 ? (pendingPage - 1) * pendingItemsPerPage + 1 : 0} - {Math.min(pendingPage * pendingItemsPerPage, filteredCancelRecords.length)} 표시
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPendingPage(prev => Math.max(prev - 1, 1))}
                      disabled={pendingPage === 1}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {Array.from({ length: totalPendingPages }, (_, i) => i + 1)
                      .filter(p => Math.abs(p - pendingPage) <= 2 || p === 1 || p === totalPendingPages)
                      .map((p, idx, arr) => {
                        const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
                        return (
                          <React.Fragment key={p}>
                            {showEllipsis && <span className="px-1.5 text-slate-400">...</span>}
                            <button
                              onClick={() => setPendingPage(p)}
                              className={`min-w-8 h-8 px-2 text-xs font-bold rounded-lg border transition-colors ${
                                pendingPage === p
                                  ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {p}
                            </button>
                          </React.Fragment>
                        );
                      })}
                    <button
                      onClick={() => setPendingPage(prev => Math.min(prev + 1, totalPendingPages))}
                      disabled={pendingPage === totalPendingPages}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 3: 기존 목록 리스트 (취소/해약 완료 목록 or 배송완료 목록) */}
            {(isDelivery || cancelTab === 'list') && (
              <>
                {/* 필터 및 검색 바 */}
                <div className="p-4 border-b border-slate-200 bg-white flex flex-col xl:flex-row gap-3 items-start xl:items-center justify-between">
                  <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                    <span className="text-sm font-semibold text-slate-600 shrink-0">
                      총 <span className={isDelivery ? 'text-sky-600 font-black' : 'text-rose-600 font-black'}>{filteredData.length.toLocaleString()}</span>건
                      <span className="ml-1 text-slate-500 font-bold">
                        ({totalAccountCount.toLocaleString()}구좌)
                      </span>
                    </span>

                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-600 select-none hover:text-slate-800 transition-colors shrink-0">
                      <input
                        type="checkbox"
                        checked={viewAllMonths}
                        onChange={(e) => setViewAllMonths(e.target.checked)}
                        className={`w-3.5 h-3.5 rounded border-slate-300 transition-colors focus:ring-offset-0 ${
                          isDelivery 
                            ? 'text-sky-600 focus:ring-sky-500' 
                            : 'text-rose-600 focus:ring-rose-500'
                        }`}
                      />
                      전체 기간 보기
                    </label>

                    {isDelivery && (
                      <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-bold border border-slate-200/80 shrink-0">
                        <button
                          type="button"
                          onClick={() => setManualOrderFilter('all')}
                          className={`px-2.5 py-1 rounded-md transition-all ${
                            manualOrderFilter === 'all'
                              ? 'bg-white text-slate-800 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          전체
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualOrderFilter('manual')}
                          className={`px-2.5 py-1 rounded-md transition-all ${
                            manualOrderFilter === 'manual'
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          수기발주
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualOrderFilter('normal')}
                          className={`px-2.5 py-1 rounded-md transition-all ${
                            manualOrderFilter === 'normal'
                              ? 'bg-white text-slate-800 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          일반
                        </button>
                      </div>
                    )}

                    {/* 본부별 / 지사별 선택 드롭다운 */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        value={selectedHqFilter}
                        onChange={(e) => {
                          setSelectedHqFilter(e.target.value);
                          setSelectedBranchFilter('전체');
                          setCurrentPage(1);
                        }}
                        className={`py-1.5 px-2.5 text-xs font-bold rounded-lg border transition-all cursor-pointer outline-none ${
                          selectedHqFilter !== '전체'
                            ? isDelivery 
                              ? 'bg-sky-50 border-sky-300 text-sky-800 ring-1 ring-sky-200' 
                              : 'bg-rose-50 border-rose-300 text-rose-800 ring-1 ring-rose-200'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <option value="전체">본부: 전체</option>
                        {availableHqs.map(hq => (
                          <option key={hq} value={hq}>{hq}</option>
                        ))}
                      </select>

                      <select
                        value={selectedBranchFilter}
                        onChange={(e) => {
                          setSelectedBranchFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        className={`py-1.5 px-2.5 text-xs font-bold rounded-lg border transition-all cursor-pointer outline-none ${
                          selectedBranchFilter !== '전체'
                            ? isDelivery 
                              ? 'bg-sky-50 border-sky-300 text-sky-800 ring-1 ring-sky-200' 
                              : 'bg-rose-50 border-rose-300 text-rose-800 ring-1 ring-rose-200'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <option value="전체">지사: 전체</option>
                        {availableBranches.map(branch => (
                          <option key={branch} value={branch}>{branch}</option>
                        ))}
                      </select>

                      {(selectedHqFilter !== '전체' || selectedBranchFilter !== '전체') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedHqFilter('전체');
                            setSelectedBranchFilter('전체');
                            setCurrentPage(1);
                          }}
                          className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                          title="본부/지사 필터 초기화"
                        >
                          초기화
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex w-full xl:w-auto items-center gap-2 justify-end">
                    <div className="relative flex-1 sm:w-64">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="회원명, 렌탈번호, 본부, 지사, 상품명 검색"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full pl-9 pr-4 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-slate-400 bg-slate-50/50"
                      />
                    </div>
                    
                    {!isDelivery && (
                      <button
                        onClick={() => {
                          setSelectedContract(null);
                          setSearchQuery('');
                          setCancelTab('register');
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors shrink-0"
                      >
                        <Plus size={14} />
                        취소 접수하기
                      </button>
                    )}

                    <button
                      onClick={handleExportExcel}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors shrink-0"
                    >
                      <Download size={14} />
                      엑셀 다운로드
                    </button>
                  </div>
                </div>

                {/* 테이블 영역 (회원번호 및 렌탈번호 원클릭 복사 적용) */}
                <div className="flex-1 overflow-x-auto min-h-[350px]">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <th className="px-3 py-2 text-center whitespace-nowrap">순번</th>
                        {isDelivery && <th className="px-3 py-2 text-center whitespace-nowrap">발주구분</th>}
                        {!isDelivery && <th className="px-3 py-2 text-center whitespace-nowrap">계약상태</th>}
                        {!isDelivery && <th className="px-3 py-2 whitespace-nowrap">처리일시</th>}
                        {!isDelivery && <th className="px-3 py-2 whitespace-nowrap">접수일시</th>}
                        <th className="px-3 py-2 whitespace-nowrap">계약일자</th>
                        {isDelivery && <th className="px-3 py-2 whitespace-nowrap">배송일자</th>}
                        <th className="px-3 py-2 whitespace-nowrap">회원번호</th>
                        <th className="px-3 py-2 whitespace-nowrap">회원명</th>
                        <th className="px-3 py-2 whitespace-nowrap">렌탈계약번호</th>
                        <th className="px-3 py-2 text-center whitespace-nowrap">구좌</th>
                        <th className="px-3 py-2 whitespace-nowrap">상품명</th>
                        <th className="px-3 py-2 whitespace-nowrap">제품명</th>
                        <th className="px-3 py-2 whitespace-nowrap">본부</th>
                        <th className="px-3 py-2 whitespace-nowrap">지사</th>
                        <th className="px-3 py-2 whitespace-nowrap">사원명</th>
                        {isDelivery && <th className="px-3 py-2 text-center whitespace-nowrap">계약상태</th>}
                        {isDelivery && <th className="px-3 py-2 text-center whitespace-nowrap">배송상태</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {paginatedData.length > 0 ? (
                        paginatedData.map((item, idx) => {
                          const globalIdx = (currentPage - 1) * itemsPerPage + idx + 1;
                          const isManual = checkIsManualOrder(item);
                          return (
                            <tr key={item.uniqueKey} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-3 py-2 text-center text-slate-400 font-mono font-medium whitespace-nowrap">{globalIdx}</td>
                              {isDelivery && (
                                <td className="px-3 py-2 text-center whitespace-nowrap">
                                  {isManual ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                      수기발주
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                      일반
                                    </span>
                                  )}
                                </td>
                              )}
                              {!isDelivery && (
                                <td className="px-3 py-2 text-center whitespace-nowrap">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    item.status.includes('해약')
                                      ? 'bg-purple-100 text-purple-800 border border-purple-300'
                                      : item.status.includes('취소')
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : 'bg-green-50 text-green-600 border border-green-200'
                                  }`}>
                                    {item.status}
                                  </span>
                                </td>
                              )}
                              {!isDelivery && (
                                <td className="px-3 py-2 font-mono whitespace-nowrap">
                                  {item.cancelProcessedAt && item.cancelProcessedAt !== '-' ? (
                                    <span className="font-bold text-purple-700 text-[11px] font-mono">
                                      {item.cancelProcessedAt}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 text-xs">-</span>
                                  )}
                                </td>
                              )}
                              {!isDelivery && (
                                <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap text-[11px]">
                                  {item.cancelCreatedAt && item.cancelCreatedAt !== '-' ? (
                                    item.cancelCreatedAt
                                  ) : (
                                    <span className="text-slate-300 text-xs">-</span>
                                  )}
                                </td>
                              )}
                              <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{item.contractDate}</td>
                              {isDelivery && <td className="px-3 py-2 font-mono text-sky-600 whitespace-nowrap">{item.deliveryDate || '-'}</td>}
                              <td className="px-3 py-2 whitespace-nowrap">
                                <CopyableMemNos memNosStr={item.memNo} />
                              </td>
                              <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">{item.memName}</td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <CopyableText text={item.rentalNo} className="text-rose-600 font-mono font-bold" />
                              </td>
                              <td className="px-3 py-2 text-center whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  (item.accountCount || 1) > 1 
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}>
                                  {item.accountCount || 1}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-700 truncate max-w-[170px]" title={item.prodName}>{item.prodName}</td>
                              <td className="px-3 py-2 text-slate-700 truncate max-w-[170px]" title={item.rentalProd}>{item.rentalProd || '-'}</td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{item.hq}</td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{item.branch || '-'}</td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{item.empName}</td>
                              {isDelivery && (
                                <td className="px-3 py-2 text-center whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    item.status.includes('취소') || item.status.includes('해약')
                                      ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                      : 'bg-green-50 text-green-600 border border-green-200'
                                  }`}>
                                    {item.status}
                                  </span>
                                </td>
                              )}
                              {isDelivery && (
                                <td className="px-3 py-2 text-center whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    item.deliveryStatus === '배송완료'
                                      ? 'bg-sky-50 text-sky-600 border border-sky-200'
                                      : item.deliveryStatus.includes('취소') || item.deliveryStatus.includes('반품')
                                      ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                      : 'bg-slate-50 text-slate-600 border border-slate-200'
                                  }`}>
                                    {item.deliveryStatus}
                                  </span>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={isDelivery ? 15 : 12} className="px-4 py-16 text-center text-slate-400 font-medium">
                            검색 조건에 맞는 내역이 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 페이지네이션 (기존 완료 목록) */}
                <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between bg-white">
                  <span className="text-xs text-slate-500">
                    {filteredData.length}건 중 {filteredData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - {Math.min(currentPage * itemsPerPage, filteredData.length)} 표시
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages)
                      .map((p, idx, arr) => {
                        const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
                        return (
                          <React.Fragment key={p}>
                            {showEllipsis && <span className="px-1.5 text-slate-400">...</span>}
                            <button
                              onClick={() => setCurrentPage(p)}
                              className={`min-w-8 h-8 px-2 text-xs font-bold rounded-lg border transition-colors ${
                                currentPage === p
                                  ? isDelivery
                                    ? 'bg-sky-600 border-sky-600 text-white shadow-xs'
                                    : 'bg-rose-600 border-rose-600 text-white shadow-xs'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {p}
                            </button>
                          </React.Fragment>
                        );
                      })}
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}

          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};

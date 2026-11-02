import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  FileCheck,
  Search,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Filter,
  Save,
  Calendar,
  ExternalLink,
  ChevronDown,
  Building,
  Maximize2,
  Minimize2,
  Copy,
  Check
} from 'lucide-react';
import * as XLSX from 'xlsx';

export interface InstallCertItem {
  contractNo: string;
  contractDate: string;
  memName: string;
  recipientName: string;
  phone?: string;
  rentalProd: string;
  supplierName?: string;
  deliveryDate?: string;
  deliveryState?: string;
  installCertStatus: '등록' | '미등록';
  installCertDate: string;   // 확인서 등록일 (YYYY-MM-DD)
  installCertMonth: string;  // 정산 마감월 (YYYY-MM)
  payoutMonth?: string;      // 지급월 (YYYY-MM)
  payoutDate?: string;       // 지급일 (예: 11월 25일 지급)
  rowIdx?: number;           // 구글 시트 행 번호
  raw?: any;
}

interface InstallCertStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  items?: InstallCertItem[];
  onSave?: (updatedItems: Record<string, { installCertStatus: '등록' | '미등록'; installCertDate: string; installCertMonth: string }>) => Promise<void>;
  onSyncSuccess?: () => Promise<void>;
}

export const InstallCertStatusModal: React.FC<InstallCertStatusModalProps> = ({
  isOpen,
  onClose,
  items: propItems,
  onSave,
  onSyncSuccess
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 내부 로드 데이터 (propItems가 없을 경우 자체 로드)
  const [fetchedItems, setFetchedItems] = useState<InstallCertItem[]>([]);
  
  // 편집 상태
  const [editedValues, setEditedValues] = useState<Record<string, {
    installCertStatus: '등록' | '미등록';
    installCertDate: string;
    installCertMonth: string;
  }>>({});

  // 필터 상태
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'REGISTERED' | 'UNREGISTERED'>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL'); // 정산 마감월
  const [payoutFilter, setPayoutFilter] = useState<string>('ALL'); // 지급월
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');

  // 복사 툴팁
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 지급월 계산 헬퍼: certMonth(YYYY-MM) -> 익월 25일 지급
  const calcPayout = (certMonth: string) => {
    if (!certMonth) return { payoutMonth: '', payoutDate: '지급 보류 (미등록)' };
    const parts = certMonth.split('-');
    if (parts.length === 2) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const nextY = m === 12 ? y + 1 : y;
      const nextM = m === 12 ? 1 : m + 1;
      const pMonthStr = `${nextY}-${String(nextM).padStart(2, '0')}`;
      return {
        payoutMonth: pMonthStr,
        payoutDate: `${nextM}월 25일 지급`
      };
    }
    return { payoutMonth: '', payoutDate: '익월 25일 지급' };
  };

  // 자체 수기발주 데이터 로드 (propItems 미제공 시)
  const loadData = async () => {
    if (propItems && propItems.length > 0) return;
    setLoading(true);
    try {
      const timestamp = Date.now();
      const res = await fetch(`/api/sheets/sheetData?sheetName=${encodeURIComponent('수기발주')}&t=${timestamp}`);
      if (!res.ok) throw new Error('수기발주 데이터를 불러오지 못했습니다.');
      const json = await res.json();
      const rows = json.data || [];

      // 설정 로드
      let savedStores: Record<string, any> = {};
      try {
        const setRes = await fetch('/api/sheets/settings/load');
        if (setRes.ok) {
          const setData = await setRes.json();
          savedStores = setData.manualOrderStores || {};
        }
      } catch (e) {}

      if (Array.isArray(rows) && rows.length > 1) {
        const header = rows[0] || [];
        const findCol = (kw: string[], def: number) => {
          const idx = header.findIndex((h: any) => kw.some(k => String(h || '').trim().includes(k)));
          return idx !== -1 ? idx : def;
        };

        const cDateCol = findCol(['접수일', '계약일'], 0);
        const cNoCol = findCol(['계약번호', '렌탈계약번호'], 1);
        const memCol = findCol(['고객명', '회원명', '성명'], 2);
        const recCol = findCol(['수취인', '수취인명', '받는분'], 7);
        const prodCol = findCol(['상품명', '렌탈상품명', '제품명'], 5);
        const delDateCol = findCol(['배송일', '설치일'], 20);
        const delStateCol = findCol(['배송상태', '상태'], 23);
        const certDateCol = findCol(['설치확인서등록일', '확인서등록일'], 24);
        const certMonthCol = findCol(['설치확인서마감월', '정산마감월'], 25);

        const list: InstallCertItem[] = [];

        rows.slice(1).forEach((row, idx) => {
          const cNo = String(row[cNoCol] || '').trim();
          if (!cNo) return;

          const saved = savedStores[cNo] || savedStores[cNo.toUpperCase()] || {};

          let certStatus: '등록' | '미등록' = (saved.installCertStatus || (row[certDateCol] || row[certMonthCol] ? '등록' : '미등록')) as any;
          let certDate = String(saved.installCertDate || row[certDateCol] || '').trim();
          let certMonth = String(saved.installCertMonth || row[certMonthCol] || '').trim();

          if (certDate && !certMonth) certMonth = certDate.substring(0, 7);
          if (certStatus === '등록' && !certMonth && row[delDateCol]) {
            certMonth = String(row[delDateCol]).trim().substring(0, 7);
          }

          const { payoutMonth, payoutDate } = certStatus === '등록' && certMonth
            ? calcPayout(certMonth)
            : { payoutMonth: '', payoutDate: '지급 보류 (미등록)' };

          // 공급사 추정
          const pName = String(row[prodCol] || '');
          let sName = '기타 공급사';
          if (pName.includes('바디프랜드')) sName = '바디프랜드';
          else if (pName.includes('쿠쿠')) sName = '쿠쿠';
          else if (pName.includes('가스트로')) sName = '가스트로플러스';
          else if (pName.includes('케이앤제이')) sName = '(주)케이앤제이컴퍼니';
          else if (pName.includes('이츠이크')) sName = '이츠이크';

          list.push({
            contractNo: cNo,
            contractDate: String(row[cDateCol] || '-').trim(),
            memName: String(row[memCol] || '-').trim(),
            recipientName: String(row[recCol] || row[memCol] || '-').trim(),
            phone: String(row[9] || '').trim(),
            rentalProd: pName || '-',
            supplierName: sName,
            deliveryDate: String(row[delDateCol] || '-').trim(),
            deliveryState: String(row[delStateCol] || saved.deliveryState || '배송완료').trim(),
            installCertStatus: certStatus,
            installCertDate: certDate,
            installCertMonth: certMonth,
            payoutMonth,
            payoutDate,
            rowIdx: idx + 2,
            raw: row
          });
        });

        setFetchedItems(list);
      }
    } catch (e: any) {
      console.error(e);
      setNotification({ message: '데이터 로드 실패: ' + e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setEditedValues({});
      setNotification(null);
    }
  }, [isOpen, propItems]);

  // 원본 리스트 (props 우선, 없으면 fetched)
  const baseItems = useMemo(() => {
    if (propItems && propItems.length > 0) return propItems;
    return fetchedItems;
  }, [propItems, fetchedItems]);

  // 편집된 값 반영 리스트
  const currentItems = useMemo(() => {
    return baseItems.map(item => {
      const edited = editedValues[item.contractNo];
      if (!edited) return item;

      const newStatus = edited.installCertStatus;
      const newDate = edited.installCertDate;
      const newMonth = edited.installCertMonth;
      const { payoutMonth, payoutDate } = newStatus === '등록' && newMonth
        ? calcPayout(newMonth)
        : { payoutMonth: '', payoutDate: '지급 보류 (미등록)' };

      return {
        ...item,
        installCertStatus: newStatus,
        installCertDate: newDate,
        installCertMonth: newMonth,
        payoutMonth,
        payoutDate
      };
    });
  }, [baseItems, editedValues]);

  // 마감월 및 공급사 목록 (필터 드롭다운용)
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    currentItems.forEach(i => {
      if (i.installCertMonth) months.add(i.installCertMonth);
    });
    return Array.from(months).sort().reverse();
  }, [currentItems]);

  const availablePayouts = useMemo(() => {
    const payouts = new Set<string>();
    currentItems.forEach(i => {
      if (i.payoutDate && !i.payoutDate.includes('보류')) payouts.add(i.payoutDate);
    });
    return Array.from(payouts).sort();
  }, [currentItems]);

  const availableSuppliers = useMemo(() => {
    const supps = new Set<string>();
    currentItems.forEach(i => {
      if (i.supplierName) supps.add(i.supplierName);
    });
    return Array.from(supps).sort();
  }, [currentItems]);

  // 필터링 및 검색 적용 리스트
  const filteredItems = useMemo(() => {
    return currentItems.filter(item => {
      // 1. 등록유무 필터
      if (statusFilter === 'REGISTERED' && item.installCertStatus !== '등록') return false;
      if (statusFilter === 'UNREGISTERED' && item.installCertStatus !== '미등록') return false;

      // 2. 마감월 필터
      if (monthFilter !== 'ALL' && item.installCertMonth !== monthFilter) return false;

      // 3. 지급월 필터
      if (payoutFilter !== 'ALL' && item.payoutDate !== payoutFilter) return false;

      // 4. 공급사 필터
      if (supplierFilter !== 'ALL' && item.supplierName !== supplierFilter) return false;

      // 5. 검색어
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const matchCNo = item.contractNo.toLowerCase().includes(q);
        const matchMem = item.memName.toLowerCase().includes(q);
        const matchRec = item.recipientName.toLowerCase().includes(q);
        const matchProd = item.rentalProd.toLowerCase().includes(q);
        const matchSupp = (item.supplierName || '').toLowerCase().includes(q);
        if (!matchCNo && !matchMem && !matchRec && !matchProd && !matchSupp) return false;
      }

      return true;
    });
  }, [currentItems, statusFilter, monthFilter, payoutFilter, supplierFilter, searchTerm]);

  // 통계 계산
  const stats = useMemo(() => {
    const total = currentItems.length;
    const registered = currentItems.filter(i => i.installCertStatus === '등록').length;
    const unregistered = total - registered;
    
    // 이달(현재 선택 마감월의 익월) 또는 주요 지급월 카운트
    const payoutCounts = new Map<string, number>();
    currentItems.forEach(i => {
      if (i.installCertStatus === '등록' && i.payoutDate && !i.payoutDate.includes('보류')) {
        payoutCounts.set(i.payoutDate, (payoutCounts.get(i.payoutDate) || 0) + 1);
      }
    });

    return { total, registered, unregistered, payoutCounts };
  }, [currentItems]);

  // 인라인 수정 핸들러
  const handleItemChange = (contractNo: string, field: 'installCertStatus' | 'installCertDate' | 'installCertMonth', value: string) => {
    const existing = editedValues[contractNo] || {
      installCertStatus: baseItems.find(i => i.contractNo === contractNo)?.installCertStatus || '미등록',
      installCertDate: baseItems.find(i => i.contractNo === contractNo)?.installCertDate || '',
      installCertMonth: baseItems.find(i => i.contractNo === contractNo)?.installCertMonth || '',
    };

    let next = { ...existing, [field]: value };

    // 날짜 입력 시 마감월 자동 유추
    if (field === 'installCertDate' && value) {
      if (!next.installCertMonth) {
        next.installCertMonth = value.substring(0, 7);
      }
      next.installCertStatus = '등록';
    }

    if (field === 'installCertStatus' && value === '미등록') {
      next.installCertDate = '';
      next.installCertMonth = '';
    } else if (field === 'installCertStatus' && value === '등록') {
      if (!next.installCertDate) {
        next.installCertDate = new Date().toISOString().substring(0, 10);
      }
      if (!next.installCertMonth) {
        next.installCertMonth = next.installCertDate.substring(0, 7);
      }
    }

    setEditedValues(prev => ({ ...prev, [contractNo]: next }));
  };

  // 변경사항 저장 핸들러
  const handleSave = async () => {
    const keys = Object.keys(editedValues);
    if (keys.length === 0) {
      setNotification({ message: '변경된 항목이 없습니다.', type: 'error' });
      return;
    }

    setSaving(true);
    setNotification(null);

    try {
      if (onSave) {
        await onSave(editedValues);
      } else {
        // 자체 구글 시트 저장 로직
        const sheetUpdates: { rowIdx: number; colIdx: number; newValue: string }[] = [];
        keys.forEach(cNo => {
          const item = currentItems.find(i => i.contractNo === cNo);
          if (item?.rowIdx) {
            const ed = editedValues[cNo];
            sheetUpdates.push({ rowIdx: item.rowIdx, colIdx: 24, newValue: ed.installCertDate });
            sheetUpdates.push({ rowIdx: item.rowIdx, colIdx: 25, newValue: ed.installCertMonth });
          }
        });

        if (sheetUpdates.length > 0) {
          const res = await fetch('/api/sheets/batch-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sheetName: '수기발주', updates: sheetUpdates })
          });
          if (!res.ok) throw new Error('구글 시트 저장 실패');
        }

        // 클라우드 세팅 저장
        try {
          const setRes = await fetch('/api/sheets/settings/load');
          let prevStores = {};
          if (setRes.ok) {
            const sData = await setRes.json();
            prevStores = sData.manualOrderStores || {};
          }
          const nextStores = { ...prevStores };
          keys.forEach(cNo => {
            const ed = editedValues[cNo];
            nextStores[cNo] = { ...(nextStores[cNo] || {}), ...ed };
          });
          await fetch('/api/sheets/settings/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ manualOrderStores: nextStores })
          });
        } catch (e) {}
      }

      setNotification({ message: `총 ${keys.length}건의 설치확인서 정보가 안전하게 저장되었습니다!`, type: 'success' });
      setEditedValues({});
      if (onSyncSuccess) await onSyncSuccess();
    } catch (err: any) {
      console.error(err);
      setNotification({ message: '저장 중 오류 발생: ' + err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // 엑셀 다운로드
  const handleExportExcel = () => {
    if (!XLSX) return;

    const rows: any[][] = [
      ['[ 설치확인서 등록 현황 및 정산·지급월 명세서 ]'],
      [`조회일시: ${new Date().toLocaleString('ko-KR')} | 총 건수: ${filteredItems.length}건`],
      [],
      ['No', '계약일', '계약번호', '회원명', '수취인', '연락처', '렌탈상품명', '공급사', '배송일', '배송상태', '설치확인서상태', '확인서등록일', '정산마감월', '지급월', '지급일정']
    ];

    filteredItems.forEach((item, idx) => {
      rows.push([
        idx + 1,
        item.contractDate || '-',
        item.contractNo,
        item.memName || '-',
        item.recipientName || '-',
        item.phone || '-',
        item.rentalProd || '-',
        item.supplierName || '-',
        item.deliveryDate || '-',
        item.deliveryState || '-',
        item.installCertStatus,
        item.installCertDate || '-',
        item.installCertMonth || '-',
        item.payoutMonth || '-',
        item.payoutDate || '-'
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },  // No
      { wch: 12 }, // 계약일
      { wch: 16 }, // 계약번호
      { wch: 12 }, // 회원명
      { wch: 12 }, // 수취인
      { wch: 15 }, // 연락처
      { wch: 28 }, // 렌탈상품명
      { wch: 16 }, // 공급사
      { wch: 12 }, // 배송일
      { wch: 10 }, // 배송상태
      { wch: 14 }, // 확인서상태
      { wch: 14 }, // 등록일
      { wch: 14 }, // 마감월
      { wch: 12 }, // 지급월
      { wch: 16 }  // 지급일정
    ];
    XLSX.utils.book_append_sheet(wb, ws, '설치확인서_현황');
    XLSX.writeFile(wb, `설치확인서_등록현황_${new Date().toISOString().substring(0, 10)}.xlsx`);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  if (!isOpen) return null;

  const editedCount = Object.keys(editedValues).length;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className={`bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 transition-all ${
          isFullscreen ? 'w-full h-full rounded-none' : 'w-[96vw] max-w-[1440px] h-[92vh]'
        }`}
      >
        {/* 1. 상단 헤더 */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-300">
              <FileCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-white">
                  설치확인서 등록 현황 및 정산·지급월 대장
                </h2>
                <span className="px-2 py-0.5 bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 text-xs font-bold rounded-full">
                  정산 마감 ➔ 익월 25일 지급 연동
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                계약일, 계약번호, 회원명/수취인, 렌탈상품명, 확인서 등록일, 정산 마감월, 최종 지급월을 통합 관리합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={14} />
              <span>엑셀 다운로드</span>
            </button>

            {editedCount > 0 && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition-all shadow-md flex items-center gap-1.5 cursor-pointer animate-pulse"
              >
                <Save size={14} />
                <span>{saving ? '저장 중...' : `변경사항 저장 (${editedCount}건)`}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => { loadData(); setEditedValues({}); }}
              disabled={loading}
              className="p-2 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="새로고침"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={isFullscreen ? '창 복원' : '전체화면'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 rounded-xl transition-colors cursor-pointer"
              title="닫기"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 알림 메시지 */}
        {notification && (
          <div className={`px-6 py-2.5 text-xs font-bold flex items-center justify-between ${
            notification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' : 'bg-rose-50 text-rose-800 border-b border-rose-200'
          }`}>
            <span>{notification.message}</span>
            <button type="button" onClick={() => setNotification(null)} className="cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        {/* 2. 상단 KPI 통계 요약 바 */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-500 block">전체 관리 주문</span>
              <strong className="text-base font-black text-slate-900">{stats.total.toLocaleString()}건</strong>
            </div>
            <span className="p-2 rounded-lg bg-slate-100 text-slate-600">
              <FileCheck size={18} />
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-emerald-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-emerald-700 block">📄 설치확인서 등록 완료</span>
              <strong className="text-base font-black text-emerald-800">{stats.registered.toLocaleString()}건</strong>
            </div>
            <span className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 size={18} />
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-rose-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-rose-700 block">❌ 확인서 미등록 (지급보류)</span>
              <strong className="text-base font-black text-rose-800">{stats.unregistered.toLocaleString()}건</strong>
            </div>
            <span className="p-2 rounded-lg bg-rose-100 text-rose-700">
              <AlertCircle size={18} />
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-indigo-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-indigo-700 block">익월 25일 지급 예정건</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {Array.from(stats.payoutCounts.entries()).slice(0, 2).map(([pDate, cnt]) => (
                  <span key={pDate} className="text-xs font-bold text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                    {pDate.replace('지급', '')}: <strong>{cnt}건</strong>
                  </span>
                ))}
                {stats.payoutCounts.size === 0 && <span className="text-xs text-slate-400">지급 대상 없음</span>}
              </div>
            </div>
            <span className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
              <Clock size={18} />
            </span>
          </div>
        </div>

        {/* 3. 검색 및 필터 컨트롤 바 */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* 상태 탭 필터 */}
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs font-black' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                전체 ({currentItems.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('REGISTERED')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'REGISTERED' ? 'bg-emerald-600 text-white shadow-2xs font-black' : 'text-slate-600 hover:text-emerald-700'
                }`}
              >
                등록완료 ({stats.registered})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('UNREGISTERED')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'UNREGISTERED' ? 'bg-rose-600 text-white shadow-2xs font-black' : 'text-slate-600 hover:text-rose-700'
                }`}
              >
                미등록 ({stats.unregistered})
              </button>
            </div>

            {/* 정산 마감월 필터 */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200 text-xs">
              <Calendar size={13} className="text-indigo-600" />
              <span className="font-bold text-slate-600">마감월:</span>
              <select
                value={monthFilter}
                onChange={e => setMonthFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value="ALL">전체 마감월</option>
                {availableMonths.map(m => (
                  <option key={m} value={m}>{m} 마감</option>
                ))}
              </select>
            </div>

            {/* 지급일정 필터 */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200 text-xs">
              <Clock size={13} className="text-emerald-600" />
              <span className="font-bold text-slate-600">지급월:</span>
              <select
                value={payoutFilter}
                onChange={e => setPayoutFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value="ALL">전체 지급월</option>
                {availablePayouts.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* 공급사 필터 */}
            {availableSuppliers.length > 1 && (
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200 text-xs">
                <Building size={13} className="text-purple-600" />
                <span className="font-bold text-slate-600">공급사:</span>
                <select
                  value={supplierFilter}
                  onChange={e => setSupplierFilter(e.target.value)}
                  className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
                >
                  <option value="ALL">전체 공급사</option>
                  {availableSuppliers.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 통합 검색창 */}
          <div className="relative min-w-[240px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="계약번호, 회원명, 수취인, 상품명 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* 4. 데이터 테이블 영역 (요구 컬럼 100% 배치) */}
        <div className="flex-1 overflow-auto bg-slate-100/40">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-200/80 text-slate-700 sticky top-0 z-10 border-b border-slate-300 font-black select-none">
              <tr>
                <th className="py-2.5 px-3 text-center w-12">No</th>
                <th className="py-2.5 px-3 w-24">계약일</th>
                <th className="py-2.5 px-3 w-32">계약번호</th>
                <th className="py-2.5 px-3 w-36">회원명 / 수취인</th>
                <th className="py-2.5 px-3 min-w-[200px]">렌탈상품명</th>
                <th className="py-2.5 px-3 w-28">공급사</th>
                <th className="py-2.5 px-3 text-center w-28">확인서 등록유무</th>
                <th className="py-2.5 px-3 text-center w-32 bg-indigo-50/60 text-indigo-950">확인서 등록일</th>
                <th className="py-2.5 px-3 text-center w-32 bg-indigo-50/60 text-indigo-950">정산 마감월</th>
                <th className="py-2.5 px-3 text-center w-36 bg-emerald-50/60 text-emerald-950">지급월 (일정)</th>
                <th className="py-2.5 px-3 text-center w-24">배송상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-400">
                    <FileCheck size={36} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-bold">조건에 해당하는 설치확인서 내역이 없습니다.</p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const isEdited = !!editedValues[item.contractNo];
                  const isReg = item.installCertStatus === '등록';

                  return (
                    <tr
                      key={item.contractNo}
                      className={`hover:bg-indigo-50/30 transition-colors ${
                        isEdited ? 'bg-amber-50/40 font-medium' : ''
                      }`}
                    >
                      {/* No */}
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      {/* 1. 계약일 */}
                      <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                        {item.contractDate || '-'}
                      </td>

                      {/* 2. 계약번호 */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-slate-900">{item.contractNo}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(item.contractNo, item.contractNo)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            title="계약번호 복사"
                          >
                            {copiedKey === item.contractNo ? (
                              <Check size={12} className="text-emerald-600" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 3. 회원명 / 수취인 */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">{item.memName || '-'}</span>
                          {item.recipientName && item.recipientName !== item.memName && (
                            <span className="text-[10px] text-slate-500 font-medium">수취: {item.recipientName}</span>
                          )}
                        </div>
                      </td>

                      {/* 4. 렌탈상품명 */}
                      <td className="py-2.5 px-3">
                        <span className="font-medium text-slate-800 line-clamp-2" title={item.rentalProd}>
                          {item.rentalProd}
                        </span>
                      </td>

                      {/* 공급사 */}
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold">
                          {item.supplierName || '-'}
                        </span>
                      </td>

                      {/* 5. 확인서 등록 유무 (선택창) */}
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        <select
                          value={item.installCertStatus}
                          onChange={e => handleItemChange(item.contractNo, 'installCertStatus', e.target.value as any)}
                          className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            isReg
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border-rose-300'
                          }`}
                        >
                          <option value="등록">📄 등록 완료</option>
                          <option value="미등록">❌ 미등록 (보류)</option>
                        </select>
                      </td>

                      {/* 6. 확인서 등록일 (인라인 입력) */}
                      <td className="py-2 px-2 text-center bg-indigo-50/20 whitespace-nowrap">
                        <input
                          type="date"
                          value={item.installCertDate || ''}
                          disabled={!isReg}
                          onChange={e => handleItemChange(item.contractNo, 'installCertDate', e.target.value)}
                          className={`px-2 py-1 bg-white border rounded-lg text-xs font-mono text-center transition-all ${
                            !isReg
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : 'border-slate-300 text-slate-800 focus:border-indigo-500'
                          }`}
                        />
                      </td>

                      {/* 7. 정산 마감월 (인라인 입력) */}
                      <td className="py-2 px-2 text-center bg-indigo-50/20 whitespace-nowrap">
                        <input
                          type="month"
                          value={item.installCertMonth || ''}
                          disabled={!isReg}
                          onChange={e => handleItemChange(item.contractNo, 'installCertMonth', e.target.value)}
                          className={`px-2 py-1 bg-white border rounded-lg text-xs font-mono font-bold text-center transition-all ${
                            !isReg
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : 'border-indigo-300 text-indigo-900 focus:border-indigo-500'
                          }`}
                        />
                      </td>

                      {/* 8. 지급월 / 지급일정 (자동 계산) */}
                      <td className="py-2.5 px-3 text-center bg-emerald-50/20 whitespace-nowrap">
                        {isReg && item.payoutDate ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold font-mono text-xs shadow-2xs">
                            <Clock size={12} className="text-emerald-700" />
                            <span>{item.payoutDate}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">지급보류</span>
                        )}
                      </td>

                      {/* 배송상태 */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          item.deliveryState === '배송완료'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {item.deliveryState || '배송완료'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 5. 하단 푸터 바 */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span>표시 중: <strong>{filteredItems.length}건</strong> / 전체 {currentItems.length}건</span>
            {editedCount > 0 && (
              <span className="text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded">
                • {editedCount}건 수정됨 (저장 필요)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold transition-all cursor-pointer"
            >
              닫기
            </button>
            {editedCount > 0 && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save size={14} />
                <span>{saving ? '저장 중...' : '변경사항 저장하기'}</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

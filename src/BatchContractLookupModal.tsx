import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { X, Search, Download, Copy, Check, RefreshCw, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileSpreadsheet, Sparkles, Filter, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { applyTableExcelStyle, autoFitColWidths } from './excelStyleUtils';

// @ts-ignore
const XLSX = (window as any).XLSX;

export interface BatchContractLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[]; // App.tsx의 data (ERPDataItem[] 또는 raw rows)
  headers?: string[]; // 관리대장 시트 헤더
}

export interface ExtractedContractItem {
  rawRowIdx?: number;
  status: string;             // 1. 가입상태 (B열)
  memNo: string;              // 2. 회원번호 (C열)
  rentalNo: string;           // 3. 렌탈번호 (K열)
  memName: string;            // 4. 회원명 (D열)
  prodName: string;           // 5. 상품명 (G열)
  rentalProd: string;         // 6. 렌탈상품명 (M열)
  firstPayDate: string;       // 7. 최초납입일 (V열)
  rentalWithdrawDate: string; // 8. 렌탈출금일 (AA열)
  expectedDeliveryDate: string; // 9. 배송예정일 (AC열)
  deliveryDate: string;       // 10. 배송일자 (N열)
  hq: string;                 // 11. 본부명 (H열)
  branch: string;             // 12. 지사명 (I열)
  empName: string;            // 13. 사원명 (J열)
  raw?: any[];
}

export interface LookupResultRow {
  seq: number;
  inputKey: string;
  matched: boolean;
  matchType?: '회원번호' | '렌탈번호' | '미조회';
  data: ExtractedContractItem;
}

// 헤더 인덱스 동적 탐색 헬퍼
function findColIndex(headers: string[] | undefined, candidates: string[], fallback: number): number {
  if (!headers || headers.length === 0) return fallback;
  const normalized = headers.map(h => String(h || '').replace(/[\s_\-·()]/g, '').toLowerCase());
  for (const c of candidates) {
    const target = c.replace(/[\s_\-·()]/g, '').toLowerCase();
    const idx = normalized.findIndex(h => h.includes(target) || target.includes(h));
    if (idx !== -1) return idx;
  }
  return fallback;
}

// 질문에서 제공된 대표 샘플 번호 목록
const SAMPLE_INPUT_KEYS = [
  "J2610013827", "J2610013826", "J2610013710", "J2610013698", "J2610013697",
  "J2610013693", "J2610013692", "J2610013691", "J2610013688", "J2610013684",
  "J2610013664", "J2610013663", "J2610013657", "J2610013656", "J2610013646",
  "J2610013644", "J2610013625", "J2610013624", "J2610013611", "J2610013610",
  "J2610013606", "J2610013598", "J2610013597", "J2610013591", "J2610013590",
  "J2610013577", "J2610013576", "J2610013575", "J2610013574", "J2610013551",
  "J2610013550", "J2610013549", "J2610013548", "J2610013539", "J2610013538",
  "J2610013530", "J2610013522", "J2610013521", "J2610013513", "J2610013512",
  "J2610013509", "J2610013508", "J2610013507", "J2610013502", "J2610013501"
];

export const BatchContractLookupModal: React.FC<BatchContractLookupModalProps> = ({
  isOpen,
  onClose,
  data,
  headers = []
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [isInputCollapsed, setIsInputCollapsed] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [subSearch, setSubSearch] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [freshSheetRows, setFreshSheetRows] = useState<any[][] | null>(null);
  const [freshHeaders, setFreshHeaders] = useState<string[] | null>(null);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [copyAllSuccess, setCopyAllSuccess] = useState<boolean>(false);

  // 구글 시트 원본 최신 데이터 로딩
  const handleRefreshSheet = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/sheets/data?fresh=true&t=${Date.now()}`);
      if (!res.ok) throw new Error('시트 데이터를 가져오지 못했습니다.');
      const sheetData = await res.json();
      if (Array.isArray(sheetData) && sheetData.length > 1) {
        setFreshHeaders(sheetData[0] || []);
        setFreshSheetRows(sheetData.slice(1));
      }
    } catch (e: any) {
      alert(`최신 관리대장 로딩 실패: ${e?.message || e}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 활성 헤더
  const activeHeaders = freshHeaders || headers || [];

  // 컬럼 인덱스 매핑 (동적 탐색 + 기본값 안전 매핑)
  const colIndexes = useMemo(() => {
    return {
      status: findColIndex(activeHeaders, ['회원상태', '계약상태', '가입상태', '상태'], 1),
      memNo: findColIndex(activeHeaders, ['회원번호', '계약번호', '회원코드'], 2),
      memName: findColIndex(activeHeaders, ['회원명', '고객명', '성함', '가입자명'], 3),
      prodName: findColIndex(activeHeaders, ['상품명', '상조상품', '가입상품'], 6),
      hq: findColIndex(activeHeaders, ['본부명', '본부'], 7),
      branch: findColIndex(activeHeaders, ['지사명', '지사', '지점'], 8),
      empName: findColIndex(activeHeaders, ['사원명', '영업사원', '사원', '담당자'], 9),
      rentalNo: findColIndex(activeHeaders, ['렌탈계약번호', '렌탈번호', '렌탈코드', '주문번호'], 10),
      rentalProd: findColIndex(activeHeaders, ['렌탈상품명', '렌탈상품', '지원상품', '구좌수'], 12),
      deliveryDate: findColIndex(activeHeaders, ['배송일자', '배송완료일', '배송일'], 13),
      firstPayDate: findColIndex(activeHeaders, ['최초납입일', '상조출금', '초회납입일', '초회납', '1회차납입일'], 21),
      rentalWithdrawDate: findColIndex(activeHeaders, ['출금일자', '렌탈출금일', '렌탈출금', '렌탈납입일'], 26),
      expectedDeliveryDate: findColIndex(activeHeaders, ['배송예정일', '배송예정일자', '배송예정'], 28),
    };
  }, [activeHeaders]);

  // 관리대장 전체 레코드 정규화 목록
  const normalizedRecords = useMemo<ExtractedContractItem[]>(() => {
    // 1) freshSheetRows가 있으면 구글시트 최신 원본 우선
    if (freshSheetRows && freshSheetRows.length > 0) {
      return freshSheetRows.map((row, idx) => {
        const getVal = (col: number) => {
          const val = row[col];
          if (val === undefined || val === null) return '';
          const s = String(val).trim();
          return s === 'undefined' || s === 'null' ? '' : s;
        };
        return {
          rawRowIdx: idx + 2,
          status: getVal(colIndexes.status) || '가입',
          memNo: getVal(colIndexes.memNo),
          rentalNo: getVal(colIndexes.rentalNo),
          memName: getVal(colIndexes.memName),
          prodName: getVal(colIndexes.prodName),
          rentalProd: getVal(colIndexes.rentalProd),
          firstPayDate: getVal(colIndexes.firstPayDate),
          rentalWithdrawDate: getVal(colIndexes.rentalWithdrawDate),
          expectedDeliveryDate: getVal(colIndexes.expectedDeliveryDate),
          deliveryDate: getVal(colIndexes.deliveryDate),
          hq: getVal(colIndexes.hq),
          branch: getVal(colIndexes.branch),
          empName: getVal(colIndexes.empName),
          raw: row
        };
      });
    }

    // 2) App.tsx의 data 사용
    if (!data || data.length === 0) return [];

    return data.map((item, idx) => {
      const getVal = (col: number, fallbackProp?: string) => {
        if (item.raw && item.raw[col] !== undefined && item.raw[col] !== null) {
          const s = String(item.raw[col]).trim();
          if (s && s !== 'undefined' && s !== 'null') return s;
        }
        if (Array.isArray(item)) {
          const s = String(item[col] || '').trim();
          return s === 'undefined' || s === 'null' ? '' : s;
        }
        if (fallbackProp && item[fallbackProp] !== undefined && item[fallbackProp] !== null) {
          const s = String(item[fallbackProp]).trim();
          if (s && s !== 'undefined' && s !== 'null') return s;
        }
        return '';
      };

      return {
        rawRowIdx: item.originalRowIdx || idx + 2,
        status: getVal(colIndexes.status, 'status') || '가입',
        memNo: getVal(colIndexes.memNo, 'memNo'),
        rentalNo: getVal(colIndexes.rentalNo, 'rentalNo'),
        memName: getVal(colIndexes.memName, 'memName'),
        prodName: getVal(colIndexes.prodName, 'prodName'),
        rentalProd: getVal(colIndexes.rentalProd, 'rentalProd'),
        firstPayDate: getVal(colIndexes.firstPayDate),
        rentalWithdrawDate: getVal(colIndexes.rentalWithdrawDate),
        expectedDeliveryDate: getVal(colIndexes.expectedDeliveryDate, 'expectedDeliveryDate'),
        deliveryDate: getVal(colIndexes.deliveryDate, 'deliveryDate'),
        hq: getVal(colIndexes.hq, 'hq'),
        branch: getVal(colIndexes.branch, 'branch'),
        empName: getVal(colIndexes.empName, 'empName'),
        raw: item.raw || item
      };
    });
  }, [freshSheetRows, data, colIndexes]);

  // 빠른 매칭을 위한 Map 생성 (대소문자/공백 무시)
  const lookupMaps = useMemo(() => {
    const memNoMap = new Map<string, ExtractedContractItem[]>();
    const rentalNoMap = new Map<string, ExtractedContractItem[]>();
    const looseMemNoMap = new Map<string, ExtractedContractItem[]>();
    const looseRentalNoMap = new Map<string, ExtractedContractItem[]>();

    normalizedRecords.forEach(rec => {
      // 1. 회원번호 매핑
      if (rec.memNo) {
        const mKey = rec.memNo.trim().toUpperCase();
        if (!memNoMap.has(mKey)) memNoMap.set(mKey, []);
        memNoMap.get(mKey)!.push(rec);

        const looseKey = mKey.replace(/[^A-Z0-9]/g, '');
        if (looseKey) {
          if (!looseMemNoMap.has(looseKey)) looseMemNoMap.set(looseKey, []);
          looseMemNoMap.get(looseKey)!.push(rec);
        }
      }

      // 2. 렌탈번호 매핑
      if (rec.rentalNo) {
        const rKey = rec.rentalNo.trim().toUpperCase();
        if (!rentalNoMap.has(rKey)) rentalNoMap.set(rKey, []);
        rentalNoMap.get(rKey)!.push(rec);

        const looseKey = rKey.replace(/[^A-Z0-9]/g, '');
        if (looseKey) {
          if (!looseRentalNoMap.has(looseKey)) looseRentalNoMap.set(looseKey, []);
          looseRentalNoMap.get(looseKey)!.push(rec);
        }
      }
    });

    return { memNoMap, rentalNoMap, looseMemNoMap, looseRentalNoMap };
  }, [normalizedRecords]);

  // 입력된 텍스트 파싱
  const parsedKeys = useMemo(() => {
    if (!inputText) return [];
    // 줄바꿈, 쉼표, 탭, 세미콜론, 공백 분리
    const lines = inputText.split(/[\r\n,;\t]+/);
    const keys: string[] = [];
    const seen = new Set<string>();

    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        keys.push(trimmed);
      }
    });
    return keys;
  }, [inputText]);

  // 검색 결과 생성
  const lookupResults = useMemo<LookupResultRow[]>(() => {
    if (parsedKeys.length === 0) return [];

    const { memNoMap, rentalNoMap, looseMemNoMap, looseRentalNoMap } = lookupMaps;
    const results: LookupResultRow[] = [];
    let seq = 1;

    parsedKeys.forEach(inputKey => {
      const cleanKey = inputKey.trim().toUpperCase();
      const looseKey = cleanKey.replace(/[^A-Z0-9]/g, '');

      // 1. 회원번호 일치 확인
      let matchedItems = memNoMap.get(cleanKey);
      let matchType: '회원번호' | '렌탈번호' | '미조회' = '회원번호';

      // 2. 렌탈번호 일치 확인
      if (!matchedItems || matchedItems.length === 0) {
        matchedItems = rentalNoMap.get(cleanKey);
        if (matchedItems && matchedItems.length > 0) {
          matchType = '렌탈번호';
        }
      }

      // 3. 루즈 매칭 (특수문자 제외)
      if (!matchedItems || matchedItems.length === 0) {
        matchedItems = looseMemNoMap.get(looseKey);
        if (matchedItems && matchedItems.length > 0) {
          matchType = '회원번호';
        }
      }

      if (!matchedItems || matchedItems.length === 0) {
        matchedItems = looseRentalNoMap.get(looseKey);
        if (matchedItems && matchedItems.length > 0) {
          matchType = '렌탈번호';
        }
      }

      // 4. 'J' 접두사 유연 매칭 (예: 2610013827 입력 시 J2610013827 매칭)
      if (!matchedItems || matchedItems.length === 0) {
        const withJ = 'J' + cleanKey;
        matchedItems = memNoMap.get(withJ) || looseMemNoMap.get(withJ);
        if (matchedItems && matchedItems.length > 0) {
          matchType = '회원번호';
        }
      }

      if (matchedItems && matchedItems.length > 0) {
        // 일치 항목 추가 (복수 구좌인 경우 각각 한 행씩 표시)
        matchedItems.forEach(item => {
          results.push({
            seq: seq++,
            inputKey,
            matched: true,
            matchType,
            data: item
          });
        });
      } else {
        // 일치 항목 없음 (미조회 표시)
        results.push({
          seq: seq++,
          inputKey,
          matched: false,
          matchType: '미조회',
          data: {
            status: '미조회',
            memNo: inputKey.startsWith('J') ? inputKey : '',
            rentalNo: !inputKey.startsWith('J') ? inputKey : '',
            memName: '-',
            prodName: '-',
            rentalProd: '-',
            firstPayDate: '-',
            rentalWithdrawDate: '-',
            expectedDeliveryDate: '-',
            deliveryDate: '-',
            hq: '-',
            branch: '-',
            empName: '-'
          }
        });
      }
    });

    return results;
  }, [parsedKeys, lookupMaps]);

  // 필터링 적용된 결과 목록
  const filteredResults = useMemo(() => {
    return lookupResults.filter(row => {
      // 1. 탭 필터 (전체/성공/미조회)
      if (filterTab === 'matched' && !row.matched) return false;
      if (filterTab === 'unmatched' && row.matched) return false;

      // 2. 가입상태 필터
      if (statusFilter !== 'all') {
        if (statusFilter === '가입' && !row.data.status.includes('가입') && !row.data.status.includes('정상')) return false;
        if (statusFilter === '취소해약' && !row.data.status.includes('해약') && !row.data.status.includes('취소')) return false;
        if (statusFilter === '기타' && (row.data.status.includes('가입') || row.data.status.includes('해약') || row.data.status.includes('취소'))) return false;
      }

      // 3. 2차 검색어 (회원명, 지사명, 상품명, 사원명 등)
      if (subSearch.trim()) {
        const q = subSearch.trim().toLowerCase();
        const d = row.data;
        const text = `${row.inputKey} ${d.memNo} ${d.rentalNo} ${d.memName} ${d.prodName} ${d.rentalProd} ${d.hq} ${d.branch} ${d.empName} ${d.status}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [lookupResults, filterTab, statusFilter, subSearch]);

  // 통계 요약
  const stats = useMemo(() => {
    const total = lookupResults.length;
    const matched = lookupResults.filter(r => r.matched).length;
    const unmatched = total - matched;
    const joinCount = lookupResults.filter(r => r.matched && (r.data.status.includes('가입') || r.data.status.includes('정상'))).length;
    const cancelCount = lookupResults.filter(r => r.matched && (r.data.status.includes('해약') || r.data.status.includes('취소'))).length;
    return { total, matched, unmatched, joinCount, cancelCount };
  }, [lookupResults]);

  // 샘플 데이터 삽입
  const handleInsertSample = () => {
    setInputText(SAMPLE_INPUT_KEYS.join('\n'));
    setIsInputCollapsed(false);
  };

  // 클립보드 전체 복사 (엑셀 친화적 TSV 형식)
  const handleCopyAllToClipboard = async () => {
    if (filteredResults.length === 0) {
      alert('복사할 데이터가 없습니다.');
      return;
    }

    const tsvHeaders = [
      'No', '입력번호', '매칭구분', '가입상태', '회원번호', '렌탈번호', '회원명', '상품명',
      '렌탈상품명', '최초납입일', '렌탈출금일', '배송예정일', '배송일자', '본부명', '지사명', '사원명'
    ].join('\t');

    const tsvRows = filteredResults.map(r => {
      const d = r.data;
      return [
        r.seq,
        r.inputKey,
        r.matchType || '-',
        d.status,
        d.memNo,
        d.rentalNo,
        d.memName,
        d.prodName,
        d.rentalProd,
        d.firstPayDate,
        d.rentalWithdrawDate,
        d.expectedDeliveryDate,
        d.deliveryDate,
        d.hq,
        d.branch,
        d.empName
      ].map(v => String(v || '').replace(/[\t\n\r]/g, ' ')).join('\t');
    }).join('\n');

    try {
      await navigator.clipboard.writeText(`${tsvHeaders}\n${tsvRows}`);
      setCopyAllSuccess(true);
      setTimeout(() => setCopyAllSuccess(false), 2000);
    } catch (e) {
      alert('클립보드 복사 중 오류가 발생했습니다.');
    }
  };

  // 단일 셀 클릭 복사
  const handleCopyCell = (text: string, cellId: string) => {
    if (!text || text === '-') return;
    navigator.clipboard.writeText(text);
    setCopiedCell(cellId);
    setTimeout(() => setCopiedCell(null), 1500);
  };

  // 엑셀 다운로드 (xlsx-js-style 서식 적용)
  const handleExportExcel = () => {
    if (!XLSX) {
      alert('엑셀 라이브러리가 준비되지 않았습니다.');
      return;
    }
    if (filteredResults.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }

    const excelRows = [
      [
        'No', '입력번호', '매칭구분', '가입상태', '회원번호', '렌탈번호', '회원명', '상품명',
        '렌탈상품명', '최초납입일', '렌탈출금일', '배송예정일', '배송일자', '본부명', '지사명', '사원명'
      ],
      ...filteredResults.map(r => {
        const d = r.data;
        return [
          r.seq,
          r.inputKey,
          r.matchType || '-',
          d.status,
          d.memNo,
          d.rentalNo,
          d.memName,
          d.prodName,
          d.rentalProd,
          d.firstPayDate,
          d.rentalWithdrawDate,
          d.expectedDeliveryDate,
          d.deliveryDate,
          d.hq,
          d.branch,
          d.empName
        ];
      })
    ];

    const ws = XLSX.utils.aoa_to_sheet(excelRows);
    ws['!cols'] = autoFitColWidths(excelRows, 10, 40);
    applyTableExcelStyle(ws, 'EMERALD');

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '일괄조회결과');

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    XLSX.writeFile(wb, `계약_렌탈번호_일괄조회_${dateStr}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-3 overflow-hidden">
      {/* 백드롭 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
      />

      {/* 초대형 와이드 모달 컨테이너 (화면 가득 채우기) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ duration: 0.18 }}
        className="relative bg-white w-[99vw] max-w-[1920px] h-[95vh] flex flex-col rounded-2xl shadow-2xl border border-slate-700/20 overflow-hidden z-10"
      >
        {/* ========================================================
            헤더 바 (다크 프리미엄 테마)
        ======================================================== */}
        <div className="px-5 py-3 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-md shadow-teal-900/30">
              <Search className="text-white" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                  계약번호 / 렌탈번호 일괄 상세조회
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  관리대장 실시간 연동
                </span>
                {stats.total > 0 && (
                  <span className="text-xs text-slate-300 font-semibold">
                    (총 <strong className="text-white font-black">{stats.total}</strong>건 중 일치{' '}
                    <strong className="text-emerald-400 font-black">{stats.matched}</strong>건, 미조회{' '}
                    <strong className={stats.unmatched > 0 ? "text-rose-400 font-black" : "text-slate-400 font-black"}>{stats.unmatched}</strong>건)
                  </span>
                )}
              </div>
              <p className="text-[12px] text-slate-400">
                계약번호(회원번호) 또는 렌탈번호를 한 줄에 하나씩 입력하면 관리대장의 13개 핵심 정보를 한 줄에 일괄 표시합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 최신 관리대장 새로고침 */}
            <button
              onClick={handleRefreshSheet}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
              title="구글 시트 '관리대장'의 가장 최신 데이터를 다시 불러옵니다"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-teal-400' : 'text-teal-400'} />
              <span>{isRefreshing ? '시트 갱신 중...' : '관리대장 최신화'}</span>
            </button>

            {/* 클립보드 전체 복사 */}
            <button
              onClick={handleCopyAllToClipboard}
              disabled={filteredResults.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer disabled:opacity-40"
              title="현재 조회된 전체 테이블을 엑셀에 바로 붙여넣을 수 있는 형태로 클립보드에 복사합니다"
            >
              {copyAllSuccess ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} className="text-blue-400" />}
              <span>{copyAllSuccess ? '복사 완료!' : '클립보드 복사'}</span>
            </button>

            {/* 엑셀 다운로드 */}
            <button
              onClick={handleExportExcel}
              disabled={filteredResults.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm transition-all cursor-pointer disabled:opacity-40"
              title="조회된 결과를 엑셀(.xlsx) 파일로 다운로드합니다"
            >
              <FileSpreadsheet size={13} />
              <span>엑셀 다운로드</span>
            </button>

            {/* 닫기 버튼 */}
            <button
              onClick={onClose}
              className="p-1.5 ml-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="닫기 (ESC)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ========================================================
            입력 패널 (Collapsible Textarea)
        ======================================================== */}
        <div className="bg-slate-100/90 border-b border-slate-200 p-3 sm:px-5 sm:py-3 transition-all shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1">
                <Search size={14} className="text-teal-600" />
                조회 대상 번호 입력
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                (계약번호 / 회원번호 또는 렌탈계약번호를 엔터나 쉼표로 구분하여 여러 개 붙여넣으세요)
              </span>
              {parsedKeys.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-slate-900 text-white">
                  입력: {parsedKeys.length}건
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleInsertSample}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-teal-800 bg-teal-100 hover:bg-teal-200 rounded-lg transition-colors cursor-pointer"
                title="요청하신 질문의 샘플 계약번호들을 입력창에 자동 입력합니다"
              >
                <Sparkles size={13} className="text-teal-700" />
                샘플 번호 넣기
              </button>
              {inputText && (
                <button
                  onClick={() => setInputText('')}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  title="입력창 비우기"
                >
                  <Trash2 size={13} />
                  초기화
                </button>
              )}
              <button
                onClick={() => setIsInputCollapsed(!isInputCollapsed)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                title={isInputCollapsed ? "입력창 펼치기" : "입력창 접고 테이블 넓게 보기"}
              >
                {isInputCollapsed ? (
                  <>
                    <span>입력창 펼치기</span>
                    <ChevronDown size={14} />
                  </>
                ) : (
                  <>
                    <span>입력창 접기</span>
                    <ChevronUp size={14} />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 접이식 텍스트 영역 */}
          {!isInputCollapsed ? (
            <div className="relative">
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                rows={4}
                placeholder={`조회할 계약번호(회원번호) 또는 렌탈번호를 한 줄에 하나씩 입력하거나 엑셀에서 복사하여 붙여넣으세요.\n\n예시:\nJ2610013827\nJ2610013826\nJ2610013710\n12269608`}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-800 placeholder:text-slate-400 resize-y shadow-inner leading-relaxed"
              />
            </div>
          ) : (
            <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-600">
              <span className="truncate max-w-3xl font-mono text-slate-700">
                {inputText ? inputText.split(/[\r\n,;\t]+/).filter(Boolean).slice(0, 8).join(', ') + (parsedKeys.length > 8 ? ` 외 ${parsedKeys.length - 8}건` : '') : '입력된 번호가 없습니다.'}
              </span>
              <button
                onClick={() => setIsInputCollapsed(false)}
                className="text-teal-700 hover:underline font-bold text-[11px] ml-2 shrink-0"
              >
                수정하기
              </button>
            </div>
          )}
        </div>

        {/* ========================================================
            툴바 & 필터 바
        ======================================================== */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* 좌측: 탭 & 상태 필터 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200 text-xs font-bold">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterTab === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                전체보기 ({stats.total}건)
              </button>
              <button
                onClick={() => setFilterTab('matched')}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterTab === 'matched'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-emerald-700'
                }`}
              >
                <CheckCircle2 size={12} className="text-emerald-600" />
                조회 성공 ({stats.matched}건)
              </button>
              <button
                onClick={() => setFilterTab('unmatched')}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterTab === 'unmatched'
                    ? 'bg-white text-rose-700 shadow-xs'
                    : 'text-slate-600 hover:text-rose-700'
                }`}
              >
                <AlertTriangle size={12} className="text-rose-600" />
                미조회 ({stats.unmatched}건)
              </button>
            </div>

            {/* 가입상태 빠른 필터 */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 text-xs">
              <span className="text-slate-500 font-bold">상태:</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
              >
                <option value="all">전체 상태</option>
                <option value="가입">가입 / 유지 ({stats.joinCount}건)</option>
                <option value="취소해약">해약 / 취소 ({stats.cancelCount}건)</option>
                <option value="기타">기타 상태</option>
              </select>
            </div>
          </div>

          {/* 우측: 결과 내 빠른 검색 */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={subSearch}
                onChange={e => setSubSearch(e.target.value)}
                placeholder="결과 내 검색 (회원명, 지사, 사원 등)..."
                className="pl-8 pr-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 w-52 sm:w-64 text-slate-800 placeholder:text-slate-400"
              />
              {subSearch && (
                <button
                  onClick={() => setSubSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <span className="text-xs text-slate-500 font-medium">
              표시 중: <strong className="text-slate-900 font-bold">{filteredResults.length}</strong>건
            </span>
          </div>
        </div>

        {/* ========================================================
            대형 결과 테이블 영역 (한 줄에 모든 값 표시)
        ======================================================== */}
        <div className="flex-1 overflow-auto bg-slate-50 relative">
          {lookupResults.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-3 text-slate-300">
                <Search size={32} />
              </div>
              <p className="text-sm font-bold text-slate-700 mb-1">
                조회할 계약번호 또는 렌탈번호를 입력해주세요
              </p>
              <p className="text-xs text-slate-500 mb-4 text-center max-w-md">
                상단 입력창에 번호를 붙여넣으시거나, 아래 버튼을 눌러 예시 데이터를 바로 확인해보실 수 있습니다.
              </p>
              <button
                onClick={handleInsertSample}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
              >
                <Sparkles size={14} />
                샘플 계약번호로 즉시 조회하기
              </button>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
              <AlertTriangle size={32} className="text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-600">조건에 일치하는 결과가 없습니다.</p>
              <p className="text-xs text-slate-400 mt-1">필터 또는 검색어를 변경해보세요.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse table-auto">
              {/* 테이블 헤더: Sticky */}
              <thead className="sticky top-0 z-20 bg-slate-900 text-slate-200 text-[12px] font-black uppercase tracking-wider shadow-sm">
                <tr>
                  <th className="px-2.5 py-2.5 text-center w-12 border-b border-slate-800 whitespace-nowrap">No</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-800 whitespace-nowrap">입력번호</th>
                  <th className="px-2.5 py-2.5 text-center border-b border-slate-800 whitespace-nowrap">매칭구분</th>
                  <th className="px-3 py-2.5 text-center border-b border-slate-800 whitespace-nowrap">가입상태</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-800 whitespace-nowrap">회원번호(계약번호)</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-800 whitespace-nowrap">렌탈번호</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-800 whitespace-nowrap">회원명</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-800 whitespace-nowrap min-w-[130px]">상품명</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-800 whitespace-nowrap min-w-[160px]">렌탈상품명</th>
                  <th className="px-3 py-2.5 text-center border-b border-slate-800 whitespace-nowrap bg-indigo-950/40 text-indigo-200">최초납입일(상조)</th>
                  <th className="px-3 py-2.5 text-center border-b border-slate-800 whitespace-nowrap bg-teal-950/40 text-teal-200">렌탈출금일</th>
                  <th className="px-3 py-2.5 text-center border-b border-slate-800 whitespace-nowrap bg-blue-950/40 text-blue-200">배송예정일</th>
                  <th className="px-3 py-2.5 text-center border-b border-slate-800 whitespace-nowrap bg-sky-950/40 text-sky-200">배송일자</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-800 whitespace-nowrap">본부명</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-800 whitespace-nowrap">지사명</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-800 whitespace-nowrap">사원명</th>
                </tr>
              </thead>

              {/* 테이블 본문 */}
              <tbody className="divide-y divide-slate-200 text-[12px] bg-white font-medium text-slate-700">
                {filteredResults.map(r => {
                  const d = r.data;
                  const isUnmatched = !r.matched;
                  const isJoin = d.status.includes('가입') || d.status.includes('정상');
                  const isCancel = d.status.includes('해약') || d.status.includes('취소') || d.status.includes('중도해지');

                  return (
                    <tr
                      key={`${r.seq}-${r.inputKey}-${d.memNo}-${d.rentalNo}`}
                      className={`hover:bg-teal-50/60 transition-colors ${
                        isUnmatched ? 'bg-rose-50/40' : r.seq % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'
                      }`}
                    >
                      {/* 순번 */}
                      <td className="px-2.5 py-2 text-center text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {r.seq}
                      </td>

                      {/* 입력번호 */}
                      <td
                        onClick={() => handleCopyCell(r.inputKey, `inp-${r.seq}`)}
                        className="px-3 py-2 font-mono font-bold text-slate-900 cursor-pointer hover:text-teal-600 whitespace-nowrap"
                        title="클릭하여 복사"
                      >
                        <div className="flex items-center gap-1">
                          <span>{r.inputKey}</span>
                          {copiedCell === `inp-${r.seq}` && (
                            <span className="text-[10px] text-teal-600 font-bold">복사됨</span>
                          )}
                        </div>
                      </td>

                      {/* 매칭구분 */}
                      <td className="px-2.5 py-2 text-center whitespace-nowrap">
                        {r.matched ? (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              r.matchType === '회원번호'
                                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                : 'bg-purple-100 text-purple-700 border border-purple-200'
                            }`}
                          >
                            {r.matchType}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200">
                            미조회
                          </span>
                        )}
                      </td>

                      {/* 1. 가입상태 */}
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        {isUnmatched ? (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-slate-100 text-slate-400">
                            미조회
                          </span>
                        ) : (
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                              isJoin
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : isCancel
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}
                          >
                            {d.status || '가입'}
                          </span>
                        )}
                      </td>

                      {/* 2. 회원번호 */}
                      <td
                        onClick={() => handleCopyCell(d.memNo, `mem-${r.seq}`)}
                        className="px-3 py-2 font-mono font-black text-slate-900 cursor-pointer hover:text-teal-600 whitespace-nowrap"
                        title="클릭하여 복사"
                      >
                        <div className="flex items-center gap-1">
                          <span>{d.memNo || '-'}</span>
                          {copiedCell === `mem-${r.seq}` && (
                            <span className="text-[10px] text-teal-600 font-bold">복사됨</span>
                          )}
                        </div>
                      </td>

                      {/* 3. 렌탈번호 */}
                      <td
                        onClick={() => handleCopyCell(d.rentalNo, `rent-${r.seq}`)}
                        className="px-3 py-2 font-mono font-semibold text-slate-700 cursor-pointer hover:text-teal-600 whitespace-nowrap"
                        title="클릭하여 복사"
                      >
                        <div className="flex items-center gap-1">
                          <span>{d.rentalNo || '-'}</span>
                          {copiedCell === `rent-${r.seq}` && (
                            <span className="text-[10px] text-teal-600 font-bold">복사됨</span>
                          )}
                        </div>
                      </td>

                      {/* 4. 회원명 */}
                      <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">
                        {d.memName || '-'}
                      </td>

                      {/* 5. 상품명 */}
                      <td className="px-3 py-2 text-slate-800 whitespace-nowrap" title={d.prodName}>
                        {d.prodName || '-'}
                      </td>

                      {/* 6. 렌탈상품명 */}
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap" title={d.rentalProd}>
                        {d.rentalProd || '-'}
                      </td>

                      {/* 7. 최초납입일 (상조) */}
                      <td className="px-3 py-2 text-center font-mono whitespace-nowrap bg-indigo-50/30">
                        {d.firstPayDate ? (
                          <span className="font-bold text-indigo-700">{d.firstPayDate}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* 8. 렌탈출금일 */}
                      <td className="px-3 py-2 text-center font-mono whitespace-nowrap bg-teal-50/30">
                        {d.rentalWithdrawDate ? (
                          <span className="font-bold text-teal-700">{d.rentalWithdrawDate}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* 9. 배송예정일 */}
                      <td className="px-3 py-2 text-center font-mono whitespace-nowrap bg-blue-50/30">
                        {d.expectedDeliveryDate ? (
                          <span className="font-bold text-blue-700">{d.expectedDeliveryDate}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* 10. 배송일자 */}
                      <td className="px-3 py-2 text-center font-mono whitespace-nowrap bg-sky-50/30">
                        {d.deliveryDate ? (
                          <span className="font-bold text-sky-800">{d.deliveryDate}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* 11. 본부명 */}
                      <td className="px-3 py-2 text-slate-800 whitespace-nowrap">
                        {d.hq || '-'}
                      </td>

                      {/* 12. 지사명 */}
                      <td className="px-3 py-2 text-slate-800 whitespace-nowrap font-semibold">
                        {d.branch || '-'}
                      </td>

                      {/* 13. 사원명 */}
                      <td className="px-3 py-2 text-slate-800 whitespace-nowrap">
                        {d.empName || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ========================================================
            하단 푸터 바
        ======================================================== */}
        <div className="px-5 py-2.5 bg-slate-900 text-white flex items-center justify-between text-xs shrink-0 border-t border-slate-800">
          <div className="flex items-center gap-4 text-slate-400">
            <span>
              💡 테이블의 회원번호나 렌탈번호를 클릭하시면 즉시 클립보드에 복사됩니다.
            </span>
            <span className="hidden md:inline">
              | [엑셀 다운로드] 또는 [클립보드 복사]를 통해 원본 그대로 엑셀에서 작업하실 수 있습니다.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-300 font-semibold">
              총 결과: <strong className="text-white font-black">{filteredResults.length}</strong>건
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  CreditCard,
  Copy,
  Check,
  Search,
  Download,
  Calendar,
  User,
  Hash,
  Building2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface CmsRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  data?: any[]; // 관리대장 데이터 (교차 검증용)
}

export interface CmsRecord {
  id: string | number;
  memberNo: string;        // B열 (Index 1) 회원번호
  contractDate: string;    // C열 (Index 2) 계약일자 (YYYY-MM-DD)
  monthStr: string;        // YYYY-MM
  memberName: string;      // F열 (Index 5) 회원명
  status: string;          // I열 (Index 8) 계약/회원상태
  payMethod: string;       // T열 (Index 19) 수납방법 ("CMS")
  bankCode: string;        // W열 (Index 22) 은행코드 (3자리 포맷팅, e.g. 011)
  bankName: string;        // 은행명 (은행코드 기반 친절 매핑)
  accountNo: string;       // Y열 (Index 24) 계좌번호
  ownerBirth6: string;     // AA열 (Index 26) 예금주 생년월일 6자리
  raw: any[];
}

// 한국 주요 금융기관 코드 매핑 (참고용 친절 표시)
const BANK_CODE_NAMES: Record<string, string> = {
  '002': '산업은행',
  '003': '기업은행',
  '004': '국민은행',
  '007': '수협은행',
  '011': '농협은행',
  '012': '농·축협',
  '020': '우리은행',
  '023': 'SC제일은행',
  '027': '한국씨티은행',
  '031': '대구은행',
  '032': '부산은행',
  '034': '광주은행',
  '035': '제주은행',
  '037': '전북은행',
  '039': '경남은행',
  '045': '새마을금고',
  '048': '신협',
  '050': '저축은행',
  '064': '산림조합',
  '071': '우체국',
  '081': '하나은행',
  '088': '신한은행',
  '089': '케이뱅크',
  '090': '카카오뱅크',
  '092': '토스뱅크'
};

// 생년월일 6자리 정규화 (13자리 주민번호, 8자리 생년월일, 6자리 생년월일 등 대응)
const extractBirth6 = (rawVal: any): string => {
  if (!rawVal) return '';
  const str = String(rawVal).trim();
  const digits = str.replace(/[^0-9]/g, '');

  if (digits.length === 13) {
    // 9501011234567 -> 950101
    return digits.slice(0, 6);
  }
  if (digits.length === 8) {
    // 19950101 -> 950101
    return digits.slice(2, 8);
  }
  if (digits.length === 6) {
    return digits;
  }
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts[0] && parts[0].replace(/[^0-9]/g, '').length === 6) {
      return parts[0].replace(/[^0-9]/g, '');
    }
  }
  return digits.slice(0, 6);
};

// 은행코드 3자리 패딩 포맷팅 (예: 11 -> 011, 4 -> 004, 88 -> 088)
const formatBankCode = (rawVal: any): string => {
  if (!rawVal) return '';
  const digits = String(rawVal).replace(/[^0-9]/g, '');
  if (!digits) return String(rawVal).trim();
  return digits.padStart(3, '0');
};

// 계약일자 정규화 (YYYY-MM-DD 및 YYYY-MM 추출)
const parseContractDate = (val: any): { dateStr: string; monthStr: string } => {
  if (!val) return { dateStr: '', monthStr: '' };
  const str = String(val).trim();
  const digits = str.replace(/[^0-9]/g, '');

  if (digits.length >= 8) {
    const yyyy = digits.substring(0, 4);
    const mm = digits.substring(4, 6);
    const dd = digits.substring(6, 8);
    return {
      dateStr: `${yyyy}-${mm}-${dd}`,
      monthStr: `${yyyy}-${mm}`
    };
  }
  if (str.includes('-') || str.includes('.') || str.includes('/')) {
    const parts = str.split(/[-./]/);
    if (parts.length >= 2) {
      const yyyy = parts[0].padStart(4, '20');
      const mm = parts[1].padStart(2, '0');
      const dd = parts[2] ? parts[2].padStart(2, '0') : '01';
      return {
        dateStr: `${yyyy}-${mm}-${dd}`,
        monthStr: `${yyyy}-${mm}`
      };
    }
  }
  return { dateStr: str, monthStr: '' };
};

export const CmsRegistrationModal: React.FC<CmsRegistrationModalProps> = ({
  isOpen,
  onClose,
  data: managementData
}) => {
  const [sheet1Rows, setSheet1Rows] = useState<any[][]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 시트1 데이터 로드
  useEffect(() => {
    if (!isOpen) return;

    const fetchSheet1Data = async () => {
      setIsLoading(true);
      try {
        const timestamp = Date.now();
        const res = await fetch(`/api/sheets/sheetData?sheetName=시트1&t=${timestamp}`);
        if (!res.ok) {
          throw new Error('시트1 데이터를 가져오는데 실패했습니다.');
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          setSheet1Rows(data);
        }
      } catch (err: any) {
        console.error('[CmsRegistrationModal Error]', err);
        alert(err.message || '시트1 데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSheet1Data();
  }, [isOpen]);

  // 클립보드 복사 헬퍼
  const handleCopy = (text: string, label: string, cellKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(cellKey);
      setToastMessage(`✓ ${label} 복사됨: ${text}`);
      setTimeout(() => setCopiedKey(null), 1500);
      setTimeout(() => setToastMessage(null), 2500);
    }).catch(err => {
      console.error('클립보드 복사 실패:', err);
    });
  };

  // 행 전체 복사 헬퍼 (탭 구분)
  const handleCopyRow = (item: CmsRecord) => {
    const rowText = `${item.memberName}\t${item.memberNo}\t${item.bankCode}\t${item.accountNo}\t${item.ownerBirth6}`;
    navigator.clipboard.writeText(rowText).then(() => {
      setToastMessage(`✓ [${item.memberName}] 전체 정보가 복사되었습니다.`);
      setTimeout(() => setToastMessage(null), 2500);
    });
  };

  // 관리대장의 수기 취소/해약 회원번호 맵 (교차 검증용)
  const manualCancelledMap = useMemo(() => {
    const set = new Set<string>();
    if (managementData && Array.isArray(managementData)) {
      managementData.forEach(item => {
        const mNo = String(item.memNo || '').trim().toUpperCase();
        const status = String(item.status || '').trim();
        if (mNo && (status.includes('해약') || status.includes('취소') || status.includes('철회') || status.includes('만기'))) {
          set.add(mNo);
        }
      });
    }
    return set;
  }, [managementData]);

  // 시트1에서 CMS 대상자 레코드 파싱 및 필터링
  const { records, availableMonths } = useMemo(() => {
    if (!sheet1Rows || sheet1Rows.length < 2) {
      return { records: [], availableMonths: [] };
    }

    const headers = (sheet1Rows[0] || []).map(h => String(h || '').trim());
    
    // 헤더 동적 인덱스 탐색 (기본값: B=1, C=2, F=5, I=8, T=19, W=22, Y=24, AA=26)
    let idxMemberNo = headers.indexOf('회원번호');
    if (idxMemberNo === -1) idxMemberNo = 1;

    let idxContractDate = headers.indexOf('계약일자');
    if (idxContractDate === -1) idxContractDate = 2;

    let idxMemberName = headers.indexOf('회원명');
    if (idxMemberName === -1) idxMemberName = 5;

    let idxStatus = headers.indexOf('회원상태');
    if (idxStatus === -1) idxStatus = headers.indexOf('계약상태');
    if (idxStatus === -1) idxStatus = 8;

    let idxPayMethod = headers.indexOf('수납방법');
    if (idxPayMethod === -1) idxPayMethod = 19;

    let idxBankCode = headers.indexOf('은행코드');
    if (idxBankCode === -1) idxBankCode = 22;

    let idxAccountNo = headers.indexOf('계좌번호');
    if (idxAccountNo === -1) idxAccountNo = 24;

    let idxOwnerResNo = headers.indexOf('예금주주민번호');
    if (idxOwnerResNo === -1) idxOwnerResNo = headers.indexOf('예금주주민등록번호');
    if (idxOwnerResNo === -1) idxOwnerResNo = 26;

    const parsedList: CmsRecord[] = [];
    const monthSet = new Set<string>();

    for (let r = 1; r < sheet1Rows.length; r++) {
      const row = sheet1Rows[r];
      if (!row || row.length === 0) continue;

      // 1. T열 수납방법이 "CMS"인 건만 필터
      const payMethodVal = String(row[idxPayMethod] || '').trim().toUpperCase();
      if (payMethodVal !== 'CMS') continue;

      // 2. 계약상태 "가입"된 값만 필터 (해약/취소/탈퇴 등 제외)
      const statusVal = String(row[idxStatus] || '').trim();
      const isCancelled = statusVal.includes('해약') || 
                          statusVal.includes('취소') || 
                          statusVal.includes('탈퇴') || 
                          statusVal.includes('만기') || 
                          statusVal.includes('철회');
      if (isCancelled) continue;

      // '가입' 또는 '정상' 키워드가 있거나 상태가 비어있지 않은 정상 건
      const isRegistered = statusVal.includes('가입') || statusVal.includes('정상') || statusVal === '';
      if (!isRegistered) continue;

      const memberNo = String(row[idxMemberNo] || '').trim();
      if (!memberNo) continue;

      // 관리대장 상에서 수기로 취소/해약 처리된 건도 배제
      if (manualCancelledMap.has(memberNo.toUpperCase())) continue;

      const memberName = String(row[idxMemberName] || '').trim();
      const rawContractDate = row[idxContractDate];
      const { dateStr, monthStr } = parseContractDate(rawContractDate);

      const rawBankCode = row[idxBankCode];
      const bankCode = formatBankCode(rawBankCode);
      const bankName = BANK_CODE_NAMES[bankCode] || '';

      const accountNo = String(row[idxAccountNo] || '').trim();
      const rawOwnerResNo = row[idxOwnerResNo];
      const ownerBirth6 = extractBirth6(rawOwnerResNo);

      if (monthStr) {
        monthSet.add(monthStr);
      }

      parsedList.push({
        id: `${memberNo}_${r}`,
        memberNo,
        contractDate: dateStr,
        monthStr,
        memberName,
        status: statusVal || '가입',
        payMethod: 'CMS',
        bankCode,
        bankName,
        accountNo,
        ownerBirth6,
        raw: row
      });
    }

    // 계약일자 내림차순 정렬
    parsedList.sort((a, b) => (b.contractDate || '').localeCompare(a.contractDate || ''));

    // 월 목록 정렬 (최신순)
    const sortedMonths = Array.from(monthSet).sort().reverse();

    return {
      records: parsedList,
      availableMonths: sortedMonths
    };
  }, [sheet1Rows, manualCancelledMap]);

  // 모달 오픈 시 최신 월을 기본 선택
  useEffect(() => {
    if (availableMonths.length > 0 && selectedMonth === 'ALL') {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths]);

  // 필터링 적용 (월 선택 & 검색어)
  const filteredRecords = useMemo(() => {
    return records.filter(item => {
      // 월 필터
      if (selectedMonth !== 'ALL' && item.monthStr !== selectedMonth) {
        return false;
      }
      // 검색어 필터
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.memberName.toLowerCase().includes(q);
        const matchMemNo = item.memberNo.toLowerCase().includes(q);
        const matchAcc = item.accountNo.includes(q);
        const matchBank = item.bankCode.includes(q) || item.bankName.toLowerCase().includes(q);
        const matchBirth = item.ownerBirth6.includes(q);
        return matchName || matchMemNo || matchAcc || matchBank || matchBirth;
      }
      return true;
    });
  }, [records, selectedMonth, searchQuery]);

  // 엑셀 다운로드
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    const exportData = filteredRecords.map((item, idx) => ({
      순번: idx + 1,
      계약일자: item.contractDate,
      회원명: item.memberName,
      회원번호: item.memberNo,
      '예금주 생년월일(6자리)': item.ownerBirth6,
      은행코드: item.bankCode,
      은행명: item.bankName,
      계좌번호: item.accountNo,
      수납방법: item.payMethod,
      상태: item.status
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CMS등록리스트');

    const fileName = `CMS_등록대상_${selectedMonth === 'ALL' ? '전체' : selectedMonth}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-6xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
      >
        {/* 헤더 */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 text-white flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <CreditCard size={22} className="text-blue-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight text-white">CMS 등록 대장</h3>
                <span className="px-2 py-0.5 bg-blue-500/40 text-blue-100 rounded-full text-[11px] font-bold border border-blue-400/30">
                  시트1 자동 연동
                </span>
              </div>
              <p className="text-xs text-blue-100/80 mt-0.5">
                수납방법이 CMS이며 가입 상태인 건들의 회원번호, 생년월일, 은행코드, 계좌번호를 원클릭으로 복사하여 등록할 수 있습니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl text-white/80 hover:text-white transition-all cursor-pointer"
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 필터 및 통계 바 */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* 월 선택 필터 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
              <Calendar size={14} className="text-blue-600" />
              계약월 선택:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedMonth('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedMonth === 'ALL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                }`}
              >
                전체 ({records.length})
              </button>
              {availableMonths.map(month => {
                const count = records.filter(r => r.monthStr === month).length;
                return (
                  <button
                    key={month}
                    type="button"
                    onClick={() => setSelectedMonth(month)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedMonth === month
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                    }`}
                  >
                    {month} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* 검색 및 액션 버튼 */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="회원명, 회원번호, 계좌 검색..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-56"
              />
            </div>
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="엑셀 다운로드"
            >
              <Download size={13} />
              <span>엑셀 다운</span>
            </button>
          </div>
        </div>

        {/* 안내 배너 */}
        <div className="px-6 py-2 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-blue-600 shrink-0" />
            <span>
              <strong className="font-bold text-blue-800">💡 원클릭 복사 팁:</strong> 회원번호, 생년월일(6자리), 은행코드, 계좌번호를 클릭하면 전산에 바로 붙여넣을 수 있도록 클립보드에 즉시 복사됩니다.
            </span>
          </div>
          <span className="text-[11px] font-bold text-blue-700 shrink-0">
            총 {filteredRecords.length}건
          </span>
        </div>

        {/* 메인 테이블 본문 */}
        <div className="flex-1 overflow-auto p-6 bg-slate-100/50">
          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-500">
              <RefreshCw size={28} className="animate-spin text-blue-600" />
              <p className="text-sm font-semibold">시트1에서 CMS 대상자 데이터를 불러오는 중입니다...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-300 p-8">
              <AlertCircle size={36} className="text-slate-300" />
              <p className="text-sm font-bold text-slate-600">선택된 조건에 해당하는 CMS 등록 건이 없습니다.</p>
              <p className="text-xs text-slate-400">시트1의 T열(수납방법)이 "CMS"이고 회원상태가 "가입"인 데이터를 확인해 주세요.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 select-none">
                    <th className="py-3 px-3.5 text-center w-12">No</th>
                    <th className="py-3 px-3 w-28">C. 계약일자</th>
                    <th className="py-3 px-3 w-24">F. 회원명</th>
                    <th className="py-3 px-3 w-32">
                      <div className="flex items-center gap-1">
                        <span>B. 회원번호</span>
                        <Copy size={11} className="text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-3 w-32">
                      <div className="flex items-center gap-1">
                        <span>AA. 생년월일(6자리)</span>
                        <Copy size={11} className="text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-3 w-28">
                      <div className="flex items-center gap-1">
                        <span>W. 은행코드</span>
                        <Copy size={11} className="text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <span>Y. 계좌번호</span>
                        <Copy size={11} className="text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-3 w-20 text-center">전체복사</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {filteredRecords.map((item, idx) => {
                    const memNoKey = `mem_${item.id}`;
                    const birthKey = `birth_${item.id}`;
                    const bankKey = `bank_${item.id}`;
                    const accKey = `acc_${item.id}`;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-blue-50/40 transition-colors group"
                      >
                        {/* No */}
                        <td className="py-2.5 px-3.5 text-center text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>

                        {/* C열 계약일자 */}
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          {item.contractDate || '-'}
                        </td>

                        {/* F열 회원명 */}
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {item.memberName || '-'}
                        </td>

                        {/* B열 회원번호 (원클릭 복사) */}
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => handleCopy(item.memberNo, '회원번호', memNoKey)}
                            className={`px-2 py-1 rounded-md font-mono font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                              copiedKey === memNoKey
                                ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300'
                                : 'bg-slate-100 text-slate-800 hover:bg-blue-100 hover:text-blue-900'
                            }`}
                            title="클릭하여 회원번호 복사"
                          >
                            {copiedKey === memNoKey ? (
                              <Check size={12} className="text-emerald-600 shrink-0" />
                            ) : (
                              <Copy size={11} className="text-slate-400 group-hover:text-blue-600 shrink-0" />
                            )}
                            <span className="truncate">{item.memberNo}</span>
                          </button>
                        </td>

                        {/* AA열 예금주주민번호(생년월일 6자리) (원클릭 복사) */}
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => handleCopy(item.ownerBirth6, '생년월일', birthKey)}
                            className={`px-2 py-1 rounded-md font-mono font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                              copiedKey === birthKey
                                ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300'
                                : 'bg-purple-50 text-purple-900 hover:bg-purple-100'
                            }`}
                            title="클릭하여 생년월일(6자리) 복사"
                          >
                            {copiedKey === birthKey ? (
                              <Check size={12} className="text-emerald-600 shrink-0" />
                            ) : (
                              <Copy size={11} className="text-purple-400 group-hover:text-purple-700 shrink-0" />
                            )}
                            <span>{item.ownerBirth6 || '-'}</span>
                          </button>
                        </td>

                        {/* W열 은행코드 (3자리 패딩 포맷) (원클릭 복사) */}
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => handleCopy(item.bankCode, '은행코드', bankKey)}
                            className={`px-2 py-1 rounded-md font-mono font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                              copiedKey === bankKey
                                ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300'
                                : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                            }`}
                            title={`클릭하여 은행코드(${item.bankCode}) 복사${item.bankName ? ` [${item.bankName}]` : ''}`}
                          >
                            {copiedKey === bankKey ? (
                              <Check size={12} className="text-emerald-600 shrink-0" />
                            ) : (
                              <Copy size={11} className="text-amber-500 group-hover:text-amber-800 shrink-0" />
                            )}
                            <span>{item.bankCode || '-'}</span>
                            {item.bankName && (
                              <span className="text-[10px] font-normal text-amber-700/80">
                                ({item.bankName})
                              </span>
                            )}
                          </button>
                        </td>

                        {/* Y열 계좌번호 (원클릭 복사) */}
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => handleCopy(item.accountNo, '계좌번호', accKey)}
                            className={`px-2.5 py-1 rounded-md font-mono font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                              copiedKey === accKey
                                ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300'
                                : 'bg-blue-50/80 text-blue-900 hover:bg-blue-100 hover:text-blue-950'
                            }`}
                            title="클릭하여 계좌번호 복사"
                          >
                            {copiedKey === accKey ? (
                              <Check size={12} className="text-emerald-600 shrink-0" />
                            ) : (
                              <Copy size={11} className="text-blue-400 group-hover:text-blue-700 shrink-0" />
                            )}
                            <span className="tracking-wide">{item.accountNo || '-'}</span>
                          </button>
                        </td>

                        {/* 전체 복사 버튼 */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleCopyRow(item)}
                            className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded text-[11px] font-semibold transition-all border border-slate-200 cursor-pointer"
                            title="이름, 회원번호, 은행코드, 계좌, 생년월일을 탭으로 구분하여 한번에 복사"
                          >
                            전체복사
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 하단 푸터 */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span>
              선택된 월: <strong className="text-blue-600">{selectedMonth === 'ALL' ? '전체' : selectedMonth}</strong>
            </span>
            <span>•</span>
            <span>
              조회 건수: <strong className="text-slate-900">{filteredRecords.length}</strong> / 전체 {records.length}건
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            닫기
          </button>
        </div>

        {/* 토스트 알림 */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="fixed bottom-6 right-6 z-[120] px-4 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl shadow-xl flex items-center gap-2 border border-slate-700"
            >
              <Check size={14} className="text-emerald-400" />
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

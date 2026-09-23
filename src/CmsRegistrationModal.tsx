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
  ChevronRight,
  ChevronLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
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
  bankCode: string;        // W열 (Index 22) 은행코드 (011/012 정밀 검증 및 3자리 포맷팅)
  rawBankCode: string;     // 원본 은행코드 (전산 원시값)
  bankName: string;        // 은행명 (은행코드 기반 친절 매핑)
  isNhAutoCorrected: boolean; // 전산 011에서 계좌번호 검증을 통해 012로 자동 보정되었는지 여부
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

// 농협 계좌번호 기반 011(농협은행) vs 012(지역농·축협) 정밀 자동 검증/판별 헬퍼
export const verifyAndCorrectNhBankCode = (
  inputBankCode: string,
  accountNo: string
): { correctedCode: string; bankName: string; isAutoCorrected: boolean } => {
  const code = (inputBankCode || '').replace(/[^0-9]/g, '').padStart(3, '0');

  // 농협(011 또는 012)이 아닌 다른 은행은 그대로 반환
  if (code !== '011' && code !== '012') {
    return {
      correctedCode: code,
      bankName: BANK_CODE_NAMES[code] || '',
      isAutoCorrected: false
    };
  }

  const rawAcc = String(accountNo || '').trim();
  const cleanAcc = rawAcc.replace(/[^0-9]/g, '');

  let detected: '011' | '012' | null = null;

  // 1. 하이픈 기준 과목코드 탐색 (-51-, -52-, -56- 등)
  if (rawAcc.includes('-')) {
    const parts = rawAcc.split('-');
    // 구계좌 3-2-6 구조 (중앙회): parts[1] === '01' | '02' | '12'
    // 구계좌 6-2-6 구조 (지역농협): parts[1] === '51' | '52' | '56'
    if (parts.length >= 2) {
      const subjectCode = parts[1].trim();
      if (['51', '52', '56', '53', '54', '55'].includes(subjectCode)) {
        detected = '012';
      } else if (['01', '02', '12', '03', '04'].includes(subjectCode)) {
        detected = '011';
      }
    }
  }

  // 2. 신계좌 (13자리 계좌): 앞 3자리로 판별
  if (!detected) {
    // 351, 352, 356 등 35X번대 = 지역농·축협(012)
    if (/^35[0-9]/.test(cleanAcc)) {
      detected = '012';
    } 
    // 301, 302, 312 등 30X, 31X번대 = 농협은행(중앙회, 011)
    else if (/^3[0-1][0-9]/.test(cleanAcc)) {
      detected = '011';
    }
  }

  // 3. 구계좌 (숫자 자릿수 기반 과목코드 추출)
  if (!detected) {
    if (cleanAcc.length === 11) {
      // 3자리(지점) + 2자리(과목) + 6자리(일련)
      const sub = cleanAcc.substring(3, 5);
      if (['51', '52', '56', '53', '54', '55'].includes(sub)) detected = '012';
      else if (['01', '02', '12', '03', '04'].includes(sub)) detected = '011';
    } else if (cleanAcc.length === 14) {
      // 6자리(지점) + 2자리(과목) + 6자리(일련)
      const sub = cleanAcc.substring(6, 8);
      if (['51', '52', '56', '53', '54', '55'].includes(sub)) detected = '012';
      else if (['01', '02', '12', '03', '04'].includes(sub)) detected = '011';
    }
  }

  // 4. 문자열 내 과목코드 부분 패턴 검색 (-51-, -52-, -56-)
  if (!detected) {
    if (/-51-|-52-|-56-/.test(rawAcc)) {
      detected = '012';
    } else if (/-01-|-02-|-12-/.test(rawAcc)) {
      detected = '011';
    }
  }

  const finalCode = detected || code;
  const isAutoCorrected = finalCode !== code;

  return {
    correctedCode: finalCode,
    bankName: finalCode === '012' ? '지역농·축협' : (finalCode === '011' ? '농협은행' : (BANK_CODE_NAMES[finalCode] || '')),
    isAutoCorrected
  };
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

// 계좌번호 선행 0 누락 방어 및 자동 복원 헬퍼 (국민 004, 우체국 071, 하나 081 등)
const normalizeAccountNumber = (rawAcc: any, bankCode: string, bankName?: string): string => {
  if (!rawAcc) return '';
  const str = String(rawAcc).trim();

  // 13자리 순수 숫자인 경우 주요 은행의 14자리 신계좌 앞자리 0 누락 자동 복원
  if (/^[0-9]{13}$/.test(str)) {
    // 국민은행(004): 신계좌 14자리 (예: 08950104336789)
    if (bankCode === '004' || bankCode === '4' || bankName?.includes('국민')) {
      return '0' + str;
    }
    // 우체국(071): 신계좌 14자리
    if (bankCode === '071' || bankCode === '71' || bankName?.includes('우체국')) {
      return '0' + str;
    }
    // 하나은행(081): 신계좌 14자리
    if (bankCode === '081' || bankCode === '81' || bankName?.includes('하나')) {
      return '0' + str;
    }
  }

  return str;
};

// 계약일자 정규화 (YYYY-MM-DD 및 YYYY-MM 추출)
const parseContractDate = (val: any): { dateStr: string; monthStr: string } => {
  if (!val) return { dateStr: '', monthStr: '' };
  const str = String(val).trim();
  if (!str) return { dateStr: '', monthStr: '' };

  // 1. YYYY-MM-DD 또는 YYYY.MM.DD 포맷 (예: '2001-09-26', '2026-09-22', '2026.09.22')
  const ymdDashMatch = str.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);
  if (ymdDashMatch) {
    const yyyy = ymdDashMatch[1];
    const mm = ymdDashMatch[2].padStart(2, '0');
    const dd = ymdDashMatch[3].padStart(2, '0');
    return {
      dateStr: `${yyyy}-${mm}-${dd}`,
      monthStr: `${yyyy}-${mm}`
    };
  }

  // 2. 슬래시(/) 포맷 (예: '2/26/26', '9/22/26', '2026/09/22', '26/09/22')
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const p0 = parseInt(parts[0], 10);
      if (p0 > 12) {
        // 첫 번째 숫자가 12 초과이면 Y/M/D (예: '2026/09/22', '26/09/22')
        const yyyy = parts[0].length === 2 ? `20${parts[0]}` : parts[0];
        const mm = parts[1].padStart(2, '0');
        const dd = parts[2].padStart(2, '0');
        return {
          dateStr: `${yyyy}-${mm}-${dd}`,
          monthStr: `${yyyy}-${mm}`
        };
      }
      // 미국식 M/D/YY (전산 엑셀 표준, 예: '2/26/26' -> 2026년 2월 26일, '9/22/26' -> 2026년 9월 22일)
      const rawYear = parts[2];
      const yyyy = rawYear.length === 2 ? `20${rawYear}` : rawYear;
      const mm = parts[0].padStart(2, '0');
      const dd = parts[1].padStart(2, '0');
      return {
        dateStr: `${yyyy}-${mm}-${dd}`,
        monthStr: `${yyyy}-${mm}`
      };
    }
  }

  // 3. 하이픈 2자리 연도 (예: '26-09-22', '26.09.22')
  const ymdShortMatch = str.match(/^(\d{2})[-.](\d{1,2})[-.](\d{1,2})/);
  if (ymdShortMatch) {
    const yyyy = `20${ymdShortMatch[1]}`;
    const mm = ymdShortMatch[2].padStart(2, '0');
    const dd = ymdShortMatch[3].padStart(2, '0');
    return {
      dateStr: `${yyyy}-${mm}-${dd}`,
      monthStr: `${yyyy}-${mm}`
    };
  }

  // 4. 순수 숫자 8자리 (YYYYMMDD) (예: '20260922')
  const digits = str.replace(/[^0-9]/g, '');
  if (digits.length === 8) {
    const yyyy = digits.substring(0, 4);
    const mm = digits.substring(4, 6);
    const dd = digits.substring(6, 8);
    return {
      dateStr: `${yyyy}-${mm}-${dd}`,
      monthStr: `${yyyy}-${mm}`
    };
  }

  // 5. 순수 숫자 6자리 (YYMMDD) (예: '260922')
  if (digits.length === 6) {
    const yyyy = `20${digits.substring(0, 2)}`;
    const mm = digits.substring(2, 4);
    const dd = digits.substring(4, 6);
    return {
      dateStr: `${yyyy}-${mm}-${dd}`,
      monthStr: `${yyyy}-${mm}`
    };
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
  const [monthInput, setMonthInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 정렬 상태: 계약일자 또는 회원번호, 내림차순(desc) 또는 오름차순(asc)
  const [sortField, setSortField] = useState<'contractDate' | 'memberNo'>('contractDate');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const handleToggleSort = (field: 'contractDate' | 'memberNo') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc'); // 새로운 필드 클릭 시 기본 최신순/내림차순
    }
  };

  // 시트1 데이터 로드 함수
  const fetchSheet1Data = async () => {
    setIsLoading(true);
    try {
      const timestamp = Date.now();
      const res = await fetch(`/api/sheets/sheetData?sheetName=시트1&fresh=true&t=${timestamp}`);
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

  useEffect(() => {
    if (!isOpen) return;
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
    
    // 유연한 열 인덱스 탐색 헬퍼 (공백 무시 및 포함 검색, 실패 시 기본 인덱스 사용)
    const findCol = (names: string[], defaultIdx: number) => {
      for (const name of names) {
        const cleanTarget = name.replace(/\s+/g, '');
        const found = headers.findIndex(h => h.replace(/\s+/g, '').includes(cleanTarget));
        if (found !== -1) return found;
      }
      return defaultIdx;
    };

    // B=1, C=2, F=5, I=8, T=19, W=22, Y=24, AA=26
    const idxMemberNo = findCol(['회원번호'], 1);
    const idxContractDate = findCol(['계약일자'], 2);
    const idxMemberName = findCol(['회원명'], 5);
    const idxStatus = findCol(['회원상태', '계약상태'], 8);
    const idxPayMethod = findCol(['수납방법', '결제방법'], 19);
    const idxBankCode = findCol(['은행코드'], 22);
    const idxAccountNo = findCol(['계좌번호'], 24);
    const idxOwnerResNo = findCol(['예금주주민번호', '예금주주민등록번호', '주민등록번호'], 26);

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

      const rawBankCode = formatBankCode(row[idxBankCode]);
      const rawAccountNo = String(row[idxAccountNo] || '').trim();

      // 🌟 [농협 011/012 정밀 검증] 전산에서 모두 011로 접수되는 문제 자동 보정
      const { correctedCode: bankCode, bankName, isAutoCorrected: isNhAutoCorrected } = verifyAndCorrectNhBankCode(
        rawBankCode,
        rawAccountNo
      );

      // 🌟 [계좌번호 선행 0 누락 정밀 복원] 국민(004)/우체국(071)/하나(081) 13자리 계좌 등
      const accountNo = normalizeAccountNumber(rawAccountNo, bankCode, bankName);

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
        rawBankCode,
        bankName,
        isNhAutoCorrected,
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
    if (availableMonths.length > 0 && (selectedMonth === 'ALL' || !monthInput)) {
      setSelectedMonth(availableMonths[0]);
      setMonthInput(availableMonths[0]);
    }
  }, [availableMonths]);

  // 현재 선택된 월의 availableMonths 인덱스
  const currentMonthIdx = useMemo(() => {
    if (selectedMonth === 'ALL') return -1;
    const target = (monthInput || selectedMonth).trim();
    return availableMonths.findIndex(m => m === target || m.replace('-', '') === target.replace(/[^0-9]/g, ''));
  }, [selectedMonth, monthInput, availableMonths]);

  // 이전 달 (과거 방향)
  const handlePrevMonth = () => {
    if (availableMonths.length === 0) return;
    if (selectedMonth === 'ALL' || currentMonthIdx === -1) {
      setSelectedMonth(availableMonths[0]);
      setMonthInput(availableMonths[0]);
      return;
    }
    if (currentMonthIdx < availableMonths.length - 1) {
      const nextTarget = availableMonths[currentMonthIdx + 1];
      setSelectedMonth(nextTarget);
      setMonthInput(nextTarget);
    }
  };

  // 다음 달 (최신 방향)
  const handleNextMonth = () => {
    if (availableMonths.length === 0) return;
    if (selectedMonth === 'ALL' || currentMonthIdx === -1) {
      setSelectedMonth(availableMonths[0]);
      setMonthInput(availableMonths[0]);
      return;
    }
    if (currentMonthIdx > 0) {
      const nextTarget = availableMonths[currentMonthIdx - 1];
      setSelectedMonth(nextTarget);
      setMonthInput(nextTarget);
    }
  };

  // 필터링 적용 (월 선택/직접입력 & 검색어) 및 정렬(계약일자, 회원번호 내림차순/올림차순)
  const filteredRecords = useMemo(() => {
    const filtered = records.filter(item => {
      // 월 필터
      if (selectedMonth !== 'ALL') {
        const cleanInput = (monthInput || selectedMonth).trim().replace(/[^0-9]/g, '');
        if (cleanInput.length === 6) {
          // YYYYMM 형태 (예: 202609)
          const itemCleanMonth = (item.monthStr || '').replace(/[^0-9]/g, '');
          if (itemCleanMonth !== cleanInput) return false;
        } else if (cleanInput.length === 4) {
          // YYMM 또는 YYYY 형태
          const itemCleanMonth = (item.monthStr || '').replace(/[^0-9]/g, '');
          const itemCleanDate = (item.contractDate || '').replace(/[^0-9]/g, '');
          if (!itemCleanMonth.includes(cleanInput) && !itemCleanDate.includes(cleanInput)) return false;
        } else if (cleanInput.length > 0) {
          const itemCleanMonth = (item.monthStr || '').replace(/[^0-9]/g, '');
          const itemCleanDate = (item.contractDate || '').replace(/[^0-9]/g, '');
          if (!itemCleanMonth.includes(cleanInput) && !itemCleanDate.includes(cleanInput)) return false;
        } else if (selectedMonth) {
          if (item.monthStr !== selectedMonth) return false;
        }
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

    // 🌟 계약일자, 회원번호 내림차순/올림차순 정렬 (자연수 정렬 포함)
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'contractDate') {
        cmp = (a.contractDate || '').localeCompare(b.contractDate || '');
        if (cmp === 0) {
          cmp = (a.memberNo || '').localeCompare(b.memberNo || '', undefined, { numeric: true });
        }
      } else {
        // memberNo 기준
        cmp = (a.memberNo || '').localeCompare(b.memberNo || '', undefined, { numeric: true });
        if (cmp === 0) {
          cmp = (a.contractDate || '').localeCompare(b.contractDate || '');
        }
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [records, selectedMonth, monthInput, searchQuery, sortField, sortOrder]);

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
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={fetchSheet1Data}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
              title="구글 시트 '시트1' 데이터를 즉시 새로고침합니다"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              <span>새로고침</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl text-white/80 hover:text-white transition-all cursor-pointer"
              title="닫기"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 필터 및 통계 바 */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* 계약월 입력 및 선택 필터 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Calendar size={14} className="text-blue-600" />
              계약월:
            </span>

            {/* 전체 보기 버튼 */}
            <button
              type="button"
              onClick={() => {
                setSelectedMonth('ALL');
                setMonthInput('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedMonth === 'ALL'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              전체 ({records.length})
            </button>

            {/* 이전 달 / 다음 달 & 월 직접 입력/선택 바 */}
            <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden shadow-2xs focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
              <button
                type="button"
                onClick={handlePrevMonth}
                disabled={currentMonthIdx >= availableMonths.length - 1 || selectedMonth === 'ALL'}
                className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                title="이전 달 이동 (과거)"
              >
                <ChevronLeft size={14} />
              </button>

              <input
                type="text"
                list="cms-available-months"
                value={monthInput}
                onChange={e => {
                  const val = e.target.value;
                  setMonthInput(val);
                  if (!val.trim()) {
                    setSelectedMonth('ALL');
                  } else {
                    const norm = val.replace(/[^0-9]/g, '');
                    if (norm.length === 6) {
                      setSelectedMonth(`${norm.substring(0, 4)}-${norm.substring(4, 6)}`);
                    } else if (norm.length === 4) {
                      setSelectedMonth(`20${norm.substring(0, 2)}-${norm.substring(2, 4)}`);
                    } else {
                      setSelectedMonth(val.trim());
                    }
                  }
                }}
                placeholder="YYYY-MM (예: 2026-09)"
                className="w-28 px-2 py-1 text-xs text-center font-bold text-slate-800 focus:outline-none placeholder-slate-400"
              />

              <datalist id="cms-available-months">
                {availableMonths.map(m => (
                  <option key={m} value={m}>
                    {m} ({records.filter(r => r.monthStr === m).length}건)
                  </option>
                ))}
              </datalist>

              <button
                type="button"
                onClick={handleNextMonth}
                disabled={currentMonthIdx <= 0 || selectedMonth === 'ALL'}
                className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                title="다음 달 이동 (최신)"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* 최신월 바로가기 버튼 */}
            {availableMonths.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const latest = availableMonths[0];
                  setSelectedMonth(latest);
                  setMonthInput(latest);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedMonth === availableMonths[0] && monthInput === availableMonths[0]
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200'
                }`}
              >
                최신월 ({availableMonths[0]})
              </button>
            )}

            {/* 선택 월 건수 배지 */}
            {selectedMonth !== 'ALL' && (
              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-md border border-blue-200">
                {filteredRecords.length}건
              </span>
            )}
          </div>

          {/* 검색 및 액션 버튼 */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 🌟 정렬 선택 버튼 (계약일자 / 회원번호, 내림차순 / 올림차순) */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => handleToggleSort('contractDate')}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  sortField === 'contractDate'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
                title="계약일자 기준 정렬 (클릭 시 내림차순/올림차순 토글)"
              >
                <span>계약일자</span>
                {sortField === 'contractDate' ? (
                  sortOrder === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />
                ) : (
                  <ArrowUpDown size={11} className="opacity-40" />
                )}
                <span className="text-[9px] opacity-80">({sortField === 'contractDate' ? (sortOrder === 'desc' ? '내림' : '올림') : '정렬'})</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleSort('memberNo')}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  sortField === 'memberNo'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
                title="회원번호 기준 정렬 (클릭 시 내림차순/올림차순 토글)"
              >
                <span>회원번호</span>
                {sortField === 'memberNo' ? (
                  sortOrder === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />
                ) : (
                  <ArrowUpDown size={11} className="opacity-40" />
                )}
                <span className="text-[9px] opacity-80">({sortField === 'memberNo' ? (sortOrder === 'desc' ? '내림' : '올림') : '정렬'})</span>
              </button>
            </div>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="회원명, 회원번호, 계좌 검색..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 sm:w-52"
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
        <div className="px-6 py-2 bg-blue-50/70 border-b border-blue-100 flex flex-wrap items-center justify-between gap-2 text-xs text-blue-900">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-blue-600 shrink-0" />
              <span>
                <strong className="font-bold text-blue-800">💡 원클릭 복사:</strong> 셀 클릭 시 즉시 복사됩니다.
              </span>
            </div>
            <span className="text-blue-300 hidden sm:inline">|</span>
            <div className="flex items-center gap-1.5 text-[11px] text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
              <span className="font-bold">🌾 농협 자동판별:</span>
              <span>계좌번호(신계좌 35X, 구계좌 5X 등)를 분석하여 011(농협은행)과 012(지역농협)를 자동 판별하여 제공합니다.</span>
            </div>
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
                    <th
                      onClick={() => handleToggleSort('contractDate')}
                      className="py-3 px-3 w-28 cursor-pointer hover:bg-slate-200/80 transition-colors select-none group"
                      title="클릭 시 계약일자 내림차순/올림차순 정렬"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>계약일자</span>
                        {sortField === 'contractDate' ? (
                          sortOrder === 'desc' ? (
                            <ArrowDown size={13} className="text-blue-600 font-bold" />
                          ) : (
                            <ArrowUp size={13} className="text-blue-600 font-bold" />
                          )
                        ) : (
                          <ArrowUpDown size={12} className="text-slate-400 group-hover:text-slate-600 transition-colors opacity-60" />
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-3 w-24">회원명</th>
                    <th
                      onClick={() => handleToggleSort('memberNo')}
                      className="py-3 px-3 w-32 cursor-pointer hover:bg-slate-200/80 transition-colors select-none group"
                      title="클릭 시 회원번호 내림차순/올림차순 정렬"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span>회원번호</span>
                          {sortField === 'memberNo' ? (
                            sortOrder === 'desc' ? (
                              <ArrowDown size={13} className="text-blue-600 font-bold" />
                            ) : (
                              <ArrowUp size={13} className="text-blue-600 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-400 group-hover:text-slate-600 transition-colors opacity-60" />
                          )}
                        </div>
                        <Copy size={11} className="text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-3 w-32">
                      <div className="flex items-center gap-1">
                        <span>생년월일(6자리)</span>
                        <Copy size={11} className="text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-3 w-28">
                      <div className="flex items-center gap-1">
                        <span>은행코드</span>
                        <Copy size={11} className="text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <span>계좌번호</span>
                        <Copy size={11} className="text-slate-400" />
                      </div>
                    </th>
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

                        {/* W열 은행코드 (3자리 패딩 포맷 및 011/012 정밀 자동 검증) (원클릭 복사) */}
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => handleCopy(item.bankCode, '은행코드', bankKey)}
                            className={`px-2.5 py-1 rounded-md font-mono font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                              copiedKey === bankKey
                                ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300'
                                : 'bg-slate-100 text-slate-800 hover:bg-blue-100 hover:text-blue-900'
                            }`}
                            title={`클릭하여 은행코드(${item.bankCode}) 복사`}
                          >
                            {copiedKey === bankKey ? (
                              <Check size={12} className="text-emerald-600 shrink-0" />
                            ) : (
                              <Copy size={11} className="text-slate-400 group-hover:text-blue-600 shrink-0" />
                            )}
                            <span>{item.bankCode || '-'}</span>
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

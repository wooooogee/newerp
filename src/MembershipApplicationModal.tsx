import React, { useState, useMemo, useEffect } from 'react';
import { X, Download, Search, Calendar, RefreshCw, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// @ts-ignore
const XLSX = (window as any).XLSX;

interface ERPDataItem {
  uniqueKey?: string;
  contractDate?: string;
  memNo?: string;
  memName?: string;
  resNo?: string;
  phone?: string;
  prodName?: string;
  rentalProd?: string;
  rentalNo?: string;
  deliveryStatus?: string;
  deliveryDate?: string;
  payDate?: string;
  hq?: string;
  branch?: string;
  empName?: string;
  empCode?: string;
  status?: string;
  address?: string;
  raw?: any[];
  [key: string]: any;
}

interface MembershipApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ERPDataItem[];
}

export interface MembershipRecord {
  id: string | number;
  contractDate: string;
  monthStr: string;      // YYYY-MM
  memName: string;       // 1. 이름
  birthDate: string;     // 2. 생년월일 (6자리)
  phone: string;         // 3. 연락처
  address: string;       // 4. 주소 (우편번호 제거)
  prodName: string;      // 5. 상품
  accountCount: string;  // 6. 구좌수
  rentalProd: string;    // 7. 제품명
  hq: string;            // 8. 영업자소속 (지사명)
  empName: string;       // 9. 영업자성명
  empPhone: string;      // 10. 영업자연락처
  memNo: string;
  raw?: any[];
}

export const MembershipApplicationModal: React.FC<MembershipApplicationModalProps> = ({ isOpen, onClose, data }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sheet1List, setSheet1List] = useState<any[]>([]);
  const [empList, setEmpList] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<string>('all');

  // 데이터 로딩: 시트1 & 사원리스트
  const fetchData = async () => {
    setLoading(true);
    try {
      const timestamp = Date.now();
      const [sheet1Res, empRes] = await Promise.all([
        fetch(`/api/sheets/sheetData?sheetName=시트1&t=${timestamp}`),
        fetch(`/api/sheets/sheetData?sheetName=사원리스트&t=${timestamp}`)
      ]);

      if (sheet1Res.ok) {
        const sheet1Data = await sheet1Res.json();
        if (Array.isArray(sheet1Data) && sheet1Data.length > 0) {
          setSheet1List(sheet1Data.slice(1));
        }
      }

      if (empRes.ok) {
        const empData = await empRes.json();
        if (Array.isArray(empData) && empData.length > 1) {
          setEmpList(empData.slice(1));
        }
      }
    } catch (err) {
      console.error('Failed to fetch membership data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  // 행(row)에서 전화번호(01X-XXXX-XXXX) 찾아내는 유틸리티 함수
  const findPhoneInRow = (row: any[]): string => {
    if (!Array.isArray(row)) return '';
    for (let i = 0; i < row.length; i++) {
      const cell = row[i];
      if (cell) {
        const str = String(cell).trim();
        if (/^01[016789]-?\d{3,4}-?\d{4}$/.test(str)) {
          return str;
        }
      }
    }
    return '';
  };

  // 주소 앞 (000-00) 우편번호 제거 유틸리티 함수
  const cleanAddressStr = (addr: string): string => {
    if (!addr) return '-';
    let cleaned = addr.replace(/^[\(\[]\d{3,5}-?\d{0,3}[\)\]]\s*/, '').trim();
    if (!cleaned || cleaned === '-') return '-';
    return cleaned;
  };

  // 생년월일 6자리 표기 유틸리티 함수 (예: 640420)
  const formatBirthDate6 = (str: string): string => {
    if (!str) return '-';
    const cleaned = str.replace(/[^0-9]/g, '');
    if (cleaned.length >= 8 && (cleaned.startsWith('19') || cleaned.startsWith('20'))) {
      return cleaned.substring(2, 8); // 19640420 -> 640420
    }
    if (cleaned.length >= 6) {
      return cleaned.substring(0, 6); // 640420-1... -> 640420
    }
    return str;
  };

  // 구좌수 추출 유틸리티 함수
  const extractAccountCount = (rentalProdStr: string, prodNameStr: string, rawRow: any[] = []): string => {
    const combinedStr = `${rentalProdStr} ${prodNameStr} ${rawRow.join(' ')}`;
    const match = combinedStr.match(/(\d+)\s*구좌/);
    if (match) {
      return `${match[1]}`;
    }
    return '1';
  };

  // raw 배열에서 주소 문자열을 찾아내는 탐색 함수
  const findAddressInRaw = (raw: any[]): string => {
    if (!Array.isArray(raw)) return '';

    // 1순위: AT열(45), AV열(47)
    const at = String(raw[45] || '').trim();
    if (at && at.length > 5) return at;
    const av = String(raw[47] || '').trim();
    if (av && av.length > 5) return av;

    // 2순위: raw 전체 셀 중 주소 키워드 탐색
    const keywords = ['특별시', '광역시', '특별자치시', '특별자치도', '시 ', '구 ', '군 ', '동 ', '읍 ', '면 ', '로 ', '길 ', '아파트', '빌라', '타워'];
    for (let i = 10; i < raw.length; i++) {
      const cell = String(raw[i] || '').trim();
      if (cell.length >= 8 && keywords.some(k => cell.includes(k))) {
        if (!cell.includes('http') && !cell.includes('@') && !/^\d{4}[-.]/.test(cell)) {
          return cell;
        }
      }
    }
    return '';
  };

  // 사원리스트(empList) 기반 사원코드/사원명 전화번호 맵 구축
  const { empCodePhoneMap, empNamePhoneMap } = useMemo(() => {
    const codeMap = new Map<string, string>();
    const nameMap = new Map<string, string>();

    empList.forEach(emp => {
      if (Array.isArray(emp)) {
        const code = String(emp[1] || '').trim().toUpperCase();
        const name1 = String(emp[2] || '').trim();
        const name2 = String(emp[3] || '').trim();
        const name = name1 || name2;

        let phone = findPhoneInRow(emp);
        if (!phone) {
          phone = String(emp[11] || emp[10] || emp[12] || '').trim();
        }

        if (phone && /^01[016789]/.test(phone)) {
          if (code) codeMap.set(code, phone);
          if (name) nameMap.set(name, phone);
        }
      }
    });

    return { empCodePhoneMap: codeMap, empNamePhoneMap: nameMap };
  }, [empList]);

  // 시트1 (sheet1List) 기반 주소 3중 매핑 (회원번호 / 이름+생년월일 / 이름+핸드폰)
  const { sheet1MemNoAddrMap, sheet1NameBirthAddrMap, sheet1NamePhoneAddrMap, sheet1EmpPhoneMap } = useMemo(() => {
    const memNoMap = new Map<string, string>();
    const nameBirthMap = new Map<string, string>();
    const namePhoneMap = new Map<string, string>();
    const phoneMap = new Map<string, string>();

    sheet1List.forEach(raw => {
      if (!Array.isArray(raw)) return;

      const addr = findAddressInRaw(raw);
      const cleanedAddr = cleanAddressStr(addr);

      // 회원명 (F열 Index 5 or D열 Index 3)
      const memName = String(raw[5] || raw[3] || '').trim().toLowerCase().replace(/\s+/g, '');
      // 주민번호 (H열 Index 7 or E열 Index 4)
      const resNo = String(raw[7] || raw[4] || '').trim();
      const birth6 = formatBirthDate6(resNo);
      // 핸드폰 (AB열 Index 27 or F열 Index 5)
      const phone = String(raw[27] || raw[5] || '').replace(/[^0-9]/g, '');

      // 회원번호
      let memNo = '';
      for (let i = 1; i <= 4; i++) {
        const str = String(raw[i] || '').trim().toUpperCase();
        if (str && str.length >= 5 && str !== 'UNDEFINED' && str !== 'NULL') {
          if (/^[A-Z0-9]+$/.test(str) && !/^\d+$/.test(str)) {
            memNo = str;
            if (cleanedAddr && cleanedAddr !== '-') {
              memNoMap.set(str, cleanedAddr);
            }
            break;
          }
        }
      }

      if (cleanedAddr && cleanedAddr !== '-') {
        if (memName && birth6 && birth6 !== '-') {
          nameBirthMap.set(`${memName}_${birth6}`, cleanedAddr);
        }
        if (memName && phone) {
          namePhoneMap.set(`${memName}_${phone}`, cleanedAddr);
        }
      }

      // 영업자연락처
      const empCode = String(raw[39] || '').trim().toUpperCase();
      const empName = String(raw[10] || '').trim();
      let empPhone = empCodePhoneMap.get(empCode) || empNamePhoneMap.get(empName) || '';
      if (!empPhone) {
        empPhone = findPhoneInRow(raw);
      }

      if (memNo && empPhone) {
        phoneMap.set(memNo, empPhone);
      }
    });

    return { 
      sheet1MemNoAddrMap: memNoMap, 
      sheet1NameBirthAddrMap: nameBirthMap, 
      sheet1NamePhoneAddrMap: namePhoneMap, 
      sheet1EmpPhoneMap: phoneMap 
    };
  }, [sheet1List, empCodePhoneMap, empNamePhoneMap]);

  // 회원상태가 '가입' 인 레코드만 정제 & 단일 고유화
  const records: MembershipRecord[] = useMemo(() => {
    const list: MembershipRecord[] = [];
    const seenKeys = new Set<string>();

    data.forEach((item, idx) => {
      // 회원상태가 '가입' 인 항목만 필터링
      const status = String(item.status || item.raw?.[1] || '가입').trim();
      if (status !== '가입' && status !== '') {
        return; // 가입이 아니면 Skip
      }

      const memNo = String(item.memNo || '').trim();
      const memNoUpper = memNo.toUpperCase();
      const memName = (item.memName || '').trim();

      const prodName = (item.prodName || '').trim() || '-';
      const rentalProd = (item.rentalProd || '').trim() || '-';

      // 단일 고유화 Key: 회원명 + 상조상품 + 렌탈제품명
      const cleanName = memName.toLowerCase().replace(/\s+/g, '');
      const cleanProd = prodName.toLowerCase().replace(/\s+/g, '');
      const cleanRental = rentalProd.toLowerCase().replace(/\s+/g, '');

      const dedupKey = `${cleanName}_${cleanProd}_${cleanRental}`;

      if (seenKeys.has(dedupKey)) {
        return; // 동일 회원 및 렌탈제품 조합은 1회만 표출!
      }
      seenKeys.add(dedupKey);

      const contractDate = item.contractDate || '';
      let monthStr = '미상';
      if (contractDate) {
        const m = contractDate.match(/^(\d{4})[-./]?(\d{2})/);
        if (m) monthStr = `${m[1]}-${m[2]}`;
      }

      const birthDate = formatBirthDate6(item.resNo || '');
      const phone = item.phone || '-';
      const cleanPhoneDigits = (phone || '').replace(/[^0-9]/g, '');

      // 주소 Multi-tier Fallback 매핑
      const rawAddr = sheet1MemNoAddrMap.get(memNoUpper) || 
                    sheet1NameBirthAddrMap.get(`${cleanName}_${birthDate}`) || 
                    sheet1NamePhoneAddrMap.get(`${cleanName}_${cleanPhoneDigits}`) || 
                    item.address || '';
      const address = cleanAddressStr(rawAddr);

      // 구좌수 (숫자만)
      const accountCount = extractAccountCount(rentalProd, prodName, item.raw || []);

      // 영업자소속: 지사명 (branch) 우선
      const branchName = (item.branch || '').trim();
      const hqName = (item.hq || '').trim();
      let hq = branchName;
      if (!hq || hq === '가입' || hq === '해약' || hq === '취소' || hq === '접수' || hq === '진행') {
        hq = hqName;
      }
      if (!hq || hq === '가입' || hq === '해약' || hq === '취소' || hq === '접수' || hq === '진행') {
        hq = '-';
      }

      // 영업자성명
      const empName = item.empName || '-';

      // 영업자연락처
      const empCodeUpper = String(item.empCode || '').trim().toUpperCase();
      let empPhone = sheet1EmpPhoneMap.get(memNoUpper) || 
                        empCodePhoneMap.get(empCodeUpper) || 
                        empNamePhoneMap.get(empName) || '';

      if (!empPhone && Array.isArray(item.raw)) {
        for (let i = 0; i < item.raw.length; i++) {
          const str = String(item.raw[i] || '').trim();
          if (/^01[016789]-?\d{3,4}-?\d{4}$/.test(str) && str !== phone) {
            empPhone = str;
            break;
          }
        }
      }

      list.push({
        id: item.uniqueKey || `rec-${idx}`,
        contractDate,
        monthStr,
        memName: memName || '-',
        birthDate,
        phone,
        address,
        prodName,
        accountCount,
        rentalProd,
        hq,
        empName,
        empPhone: empPhone || '-',
        memNo
      });
    });

    return list;
  }, [data, sheet1MemNoAddrMap, sheet1NameBirthAddrMap, sheet1NamePhoneAddrMap, sheet1EmpPhoneMap, empCodePhoneMap, empNamePhoneMap]);

  // 존재하는 전체 월 리스트 (내림차순 정렬)
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.monthStr && r.monthStr !== '미상') {
        set.add(r.monthStr);
      }
    });
    return Array.from(set).sort().reverse();
  }, [records]);

  // 기본 세팅: 현재월(YYYY-MM) 자동 선택 세팅
  useEffect(() => {
    if (isOpen && availableMonths.length > 0) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const currentYearMonth = `${year}-${month}`; // 예: "2026-07"

      if (availableMonths.includes(currentYearMonth)) {
        setSelectedMonth(currentYearMonth);
      } else {
        setSelectedMonth(availableMonths[0]);
      }
    }
  }, [isOpen, availableMonths]);

  // 존재하는 상품 목록 (오름차순 정렬)
  const availableProducts = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.prodName && r.prodName !== '-') {
        set.add(r.prodName);
      }
    });
    return Array.from(set).sort();
  }, [records]);

  // 필터링 및 월별 정렬 처리된 데이터
  const filteredAndSortedRecords = useMemo(() => {
    let result = [...records];

    if (selectedMonth !== 'all') {
      result = result.filter(r => r.monthStr === selectedMonth);
    }

    if (selectedProduct !== 'all') {
      result = result.filter(r => r.prodName === selectedProduct);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter(r => 
        r.memName.toLowerCase().includes(term) ||
        r.empName.toLowerCase().includes(term)
      );
    }

    result.sort((a, b) => {
      if (b.monthStr !== a.monthStr) {
        return b.monthStr.localeCompare(a.monthStr);
      }
      return a.memName.localeCompare(b.memName, 'ko');
    });

    return result;
  }, [records, selectedMonth, selectedProduct, searchTerm]);

  // 엑셀 내보내기 (연번 A열 삭제, 구좌수 숫자만)
  const handleExportExcel = () => {
    if (!filteredAndSortedRecords || filteredAndSortedRecords.length === 0) {
      alert('출력할 데이터가 없습니다.');
      return;
    }

    const excelRows = filteredAndSortedRecords.map((item) => {
      const countNum = parseInt(String(item.accountCount || '1').replace(/[^0-9]/g, ''), 10) || 1;

      return {
        '이름': item.memName,
        '생년월일': item.birthDate,
        '연락처': item.phone,
        '주소': item.address,
        '상품': item.prodName,
        '구좌수': countNum, // 숫자만
        '제품명': item.rentalProd,
        '영업자소속': item.hq,
        '영업자성명': item.empName,
        '영업자연락처': item.empPhone
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    
    const colWidths = [
      { wch: 12 }, // 이름
      { wch: 10 }, // 생년월일 (6자리)
      { wch: 15 }, // 연락처
      { wch: 45 }, // 주소
      { wch: 24 }, // 상품
      { wch: 8 },  // 구좌수 (숫자만)
      { wch: 32 }, // 제품명
      { wch: 20 }, // 영업자소속 (지사명)
      { wch: 12 }, // 영업자성명
      { wch: 15 }  // 영업자연락처
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '회원가입신청서');

    const fileName = `회원가입신청서_대장_${selectedMonth === 'all' ? '전체' : selectedMonth}_${new Date().toISOString().substring(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden border border-slate-200"
        >
          {/* Top Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center text-white shadow-sm font-bold text-lg">
                📝
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">회원가입신청서 대장</h2>
                <p className="text-xs text-slate-500">
                  가입 회원 정보 및 영업자 지사·연락처 명단 관리 (총 {filteredAndSortedRecords.length}건)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                title="데이터 새로고침"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                새로고침
              </button>

              <button
                onClick={handleExportExcel}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all"
              >
                <Download className="w-4 h-4" />
                엑셀 다운로드
              </button>

              <button
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* 이름 검색창 */}
              <div className="relative min-w-[220px] max-w-sm flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="회원 이름 또는 영업자 성명 검색..."
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 월별 필터 드롭다운 (기본 세팅: 현재월) */}
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-600" />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white cursor-pointer"
                >
                  <option value="all">월 전체보기 ({records.length}건)</option>
                  {availableMonths.map(m => (
                    <option key={m} value={m}>
                      {m}월 ({records.filter(r => r.monthStr === m).length}건)
                    </option>
                  ))}
                </select>
              </div>

              {/* 상품별 필터 드롭다운 */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-purple-600" />
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white cursor-pointer max-w-[200px] truncate"
                >
                  <option value="all">상품 전체보기</option>
                  {availableProducts.map(prod => (
                    <option key={prod} value={prod}>
                      {prod} ({records.filter(r => r.prodName === prod).length}건)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 필터 적용 건수 정보 */}
            <div className="text-xs text-slate-500 font-medium">
              조회 결과: <span className="font-bold text-purple-700">{filteredAndSortedRecords.length}</span> 건
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto bg-slate-50/30">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-500 font-medium">회원가입신청서 데이터를 불러오는 중입니다...</p>
                </div>
              </div>
            ) : filteredAndSortedRecords.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-slate-400 font-medium">선택된 조건의 '가입' 회원 신청서 데이터가 없습니다.</p>
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-slate-100/90 sticky top-0 z-10 border-b border-slate-200 backdrop-blur-xs">
                  <tr>
                    <th className="p-3 font-bold text-purple-900 bg-purple-100/60 w-28">이름</th>
                    <th className="p-3 font-bold text-slate-700 w-28 text-center">생년월일</th>
                    <th className="p-3 font-bold text-slate-700 w-36">연락처</th>
                    <th className="p-3 font-bold text-slate-700 min-w-[260px]">주소</th>
                    <th className="p-3 font-bold text-slate-700 w-44">상품</th>
                    <th className="p-3 font-bold text-slate-700 w-16 text-center">구좌수</th>
                    <th className="p-3 font-bold text-slate-700 w-52">제품명</th>
                    <th className="p-3 font-bold text-slate-700 w-36">영업자소속</th>
                    <th className="p-3 font-bold text-slate-700 w-28">영업자성명</th>
                    <th className="p-3 font-bold text-slate-700 w-36">영업자연락처</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 bg-white">
                  {filteredAndSortedRecords.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-purple-50/40 transition-colors group"
                    >
                      <td className="p-3 font-bold text-purple-900 bg-purple-50/30 whitespace-nowrap group-hover:bg-purple-100/50">
                        {item.memName}
                      </td>
                      <td className="p-3 text-center text-slate-700 whitespace-nowrap font-mono">{item.birthDate}</td>
                      <td className="p-3 text-slate-700 whitespace-nowrap font-mono">{item.phone}</td>
                      <td className="p-3 text-slate-600 max-w-[320px] truncate" title={item.address}>
                        {item.address}
                      </td>
                      <td className="p-3 text-slate-800 font-medium whitespace-nowrap">{item.prodName}</td>
                      <td className="p-3 text-center font-bold text-purple-700 whitespace-nowrap">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[11px]">
                          {String(item.accountCount || '1').replace(/[^0-9]/g, '') || '1'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 whitespace-nowrap max-w-[240px] truncate" title={item.rentalProd}>
                        {item.rentalProd}
                      </td>
                      <td className="p-3 text-slate-700 whitespace-nowrap font-medium">{item.hq}</td>
                      <td className="p-3 text-slate-800 font-semibold whitespace-nowrap">{item.empName}</td>
                      <td className="p-3 text-slate-700 whitespace-nowrap font-mono text-[11px]">{item.empPhone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer Bar */}
          <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
            <div>
              선택 월: <span className="font-bold text-slate-700">{selectedMonth === 'all' ? '전체' : `${selectedMonth}월`}</span> | 
              선택 상품: <span className="font-bold text-slate-700">{selectedProduct === 'all' ? '전체' : selectedProduct}</span> | 
              가입 회원 총 <span className="font-bold text-purple-700">{filteredAndSortedRecords.length}</span> 건 표시 중
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-200 transition-colors"
            >
              닫기
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

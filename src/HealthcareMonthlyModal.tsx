import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Calendar, Search, AlertCircle, CheckCircle2, Filter, Clock, ShieldCheck, Layers } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ERPDataItem {
  memNo: string;
  prodName: string;
  hcRegDate: string;
  raw: any[];
  [key: string]: any;
}

interface HealthcareMonthlyModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ERPDataItem[];
  onRowClick?: (item: ERPDataItem) => void;
}

const mapProductCode = (rawProdName: string) => {
  const prodName = String(rawProdName || '').replace(/\s+/g, '').toUpperCase();
  if (prodName.includes('하이브리드698')) return 'A070';
  if (prodName.includes('라이즈498')) return 'A071';
  if (prodName.includes('프리미엄540')) return 'A072';
  if (prodName.includes('헬스케어실버') || prodName.includes('실버')) return 'A073';
  if (prodName.includes('좋은건강크루즈') || prodName.includes('크루즈')) return 'A074';
  if (prodName.includes('헬스케어골드') || prodName.includes('골드')) return 'A075';
  if (prodName.includes('올인원') || prodName.includes('ALLINONE') || prodName.includes('ALL-IN-ONE')) return 'A077';
  if (prodName.includes('헬스케어580') || prodName.includes('580')) return 'A081';
  return '';
};

const parseResidentNumber = (qColumn: string) => {
  if (!qColumn) return { birthdate: '', gender: '' };
  
  const cleaned = String(qColumn).replace(/[^0-9]/g, '');
  
  // Format: YYYYMMDDG (length 9)
  if (cleaned.length === 9) {
    const yyyymmdd = cleaned.substring(0, 8);
    const g = cleaned.substring(8, 9);
    const gender = (g === '1' || g === '3' || g === '5' || g === '7' || g === '9') ? '1' : '2';
    return { birthdate: yyyymmdd, gender };
  }
  
  // Format usually YYMMDD-GXXXXXX or YYMMDDGXXXXXX
  if (cleaned.length >= 13) {
    const yymmdd = cleaned.substring(0, 6);
    const g = cleaned.substring(6, 7);
    
    let prefix = '19';
    if (g === '3' || g === '4' || g === '7' || g === '8') prefix = '20';
    else if (g === '9' || g === '0') prefix = '18';
    
    const gender = (g === '1' || g === '3' || g === '5' || g === '7' || g === '9') ? '1' : '2';
    
    return {
      birthdate: `${prefix}${yymmdd}`,
      gender
    };
  }

  // Fallback for YYYYMMDD
  if (cleaned.length === 8) {
    return { birthdate: cleaned, gender: '' };
  }

  return { birthdate: qColumn, gender: '' };
};

// 서비스시작일 기준 +3년 만기일 계산
const addYears = (dateStr: string, years: number = 3): string => {
  if (!dateStr || dateStr.trim() === '' || dateStr === '미등록') return '-';
  const clean = dateStr.replace(/[./]/g, '-').trim();
  const match = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return '-';
  const y = parseInt(match[1], 10) + years;
  const m = match[2].padStart(2, '0');
  const d = match[3].padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const HealthcareMonthlyModal: React.FC<HealthcareMonthlyModalProps> = ({
  isOpen,
  onClose,
  data,
  onRowClick
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | '580' | '3years' | 'overdue'>('all');
  const [productFilter, setProductFilter] = useState<string>('all');

  // 오늘 날짜 기준 (3년 경과 여부 판단용)
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // 1. 헬스케어 등록 대상자 전체 추출 (회원상태가 '가입'인 건만 대상)
  const allHealthcareList = useMemo(() => {
    return data
      .filter(item => {
        // 1) 회원상태가 '가입'인 값만 필터링
        const status = String(item.status || item.raw?.[1] || '').trim();
        if (status !== '가입') return false;

        const prodName = String(item.prodName || item.raw?.[6] || '');
        const normProd = prodName.replace(/\s+/g, '');
        const sCol = String(item.hcRegDate || item.raw?.[18] || '').trim(); // S열: 헬스케어등록일

        // 2) 서비스 시작일(S열 헬스케어등록일) 날짜 값이 있는 거만 표기
        if (!sCol || sCol === '미등록' || sCol === '-' || sCol === '') return false;

        // 3) 더좋은헬스케어580 또는 헬스케어 등록 상품
        const is580 = normProd.includes('580') || normProd.includes('헬스케어580');
        const code = mapProductCode(prodName);
        if (is580 || code) return true;

        return true;
      })
      .map((item, index) => {
        const pColumn = item.raw?.[15] || ''; // 피보험자명
        const qColumn = item.raw?.[16] || ''; // 주민번호 앞7자리
        const rColumn = item.raw?.[17] || ''; // 연락처
        const sColumn = String(item.hcRegDate || item.raw?.[18] || '').trim(); // S열: 헬스케어등록일
        const uColumn = item.raw?.[20] || ''; // 연체수
        const wColumn = item.raw?.[22] || ''; // 최종 납입일
        
        const { birthdate, gender } = parseResidentNumber(qColumn);

        // 연체수 파싱
        const overdueRaw = String(uColumn).trim();
        const overdueNum = parseInt(overdueRaw.replace(/[^0-9]/g, ''), 10);
        const overdueCount = isNaN(overdueNum) ? 0 : overdueNum;

        // 상품 정보
        const rawProd = item.prodName || item.raw?.[6] || '';
        const prodCode = mapProductCode(rawProd);
        const is580 = String(rawProd).replace(/\s+/g, '').includes('580');

        // 서비스시작일은 관리대장 시트 S열(헬스케어 등록일) 기준
        const serviceStart = (sColumn && sColumn !== '미등록' && sColumn !== '-') 
          ? sColumn.replace(/[./]/g, '-') 
          : '-';
          
        // 계약종료일: 580은 '월납', 그 외 상품은 서비스시작일 기준 3년 만기일
        const contractEnd = is580 ? '월납' : addYears(serviceStart, 3);
        
        // 3년 경과 여부 (오늘 날짜 >= 3년 만기일)
        const is3YearsPassed = !is580 && contractEnd !== '-' && contractEnd <= todayStr;

        // 월납 대상 구분 (580은 '월납', 그 외는 3년 경과 여부)
        let monthlyCategory: '월납' | '3년경과월납' | '3년제공중' = '3년제공중';
        if (is580) {
          monthlyCategory = '월납';
        } else if (is3YearsPassed) {
          monthlyCategory = '3년경과월납';
        } else {
          monthlyCategory = '3년제공중';
        }

        return {
          index: index + 1,
          rawItem: item,
          memNo: item.memNo || item.raw?.[2] || '',
          prodCode: prodCode || (is580 ? 'A081' : '-'),
          prodName: rawProd,
          insuredName: pColumn || item.raw?.[3] || '',
          birthdate,
          gender,
          phone: rColumn || item.phone || '',
          contractStart: serviceStart,
          contractEnd,
          serviceStart,
          customerStatus: '01',
          overdueCount,
          overdueRaw,
          lastPaymentDate: String(wColumn || '').trim(),
          is580,
          is3YearsPassed,
          monthlyCategory
        };
      });
  }, [data, todayStr]);

  // 통계 계산
  const totalCount = allHealthcareList.length;
  const count580 = useMemo(() => allHealthcareList.filter(i => i.is580).length, [allHealthcareList]);
  const count3YearsPassed = useMemo(() => allHealthcareList.filter(i => i.is3YearsPassed).length, [allHealthcareList]);
  const countOverdue = useMemo(() => allHealthcareList.filter(i => i.overdueCount > 0).length, [allHealthcareList]);

  // 고유 상품 목록
  const uniqueProducts = useMemo(() => {
    return Array.from(new Set(allHealthcareList.map(i => i.prodName))).filter(Boolean);
  }, [allHealthcareList]);

  // 2. 탭, 상품, 검색어 필터링 적용
  const filteredList = useMemo(() => {
    return allHealthcareList.filter(item => {
      // 탭 필터
      if (tabFilter === '580' && !item.is580) return false;
      if (tabFilter === '3years' && !item.is3YearsPassed) return false;
      if (tabFilter === 'overdue' && item.overdueCount <= 0) return false;

      // 상품 필터
      if (productFilter !== 'all' && item.prodName !== productFilter) return false;

      // 검색어 필터
      if (!searchTerm.trim()) return true;
      const term = searchTerm.trim().toLowerCase();
      return (
        item.memNo.toLowerCase().includes(term) ||
        item.insuredName.toLowerCase().includes(term) ||
        item.phone.toLowerCase().includes(term) ||
        item.prodName.toLowerCase().includes(term) ||
        item.lastPaymentDate.toLowerCase().includes(term) ||
        item.serviceStart.toLowerCase().includes(term)
      );
    });
  }, [allHealthcareList, tabFilter, productFilter, searchTerm]);

  // 엑셀 다운로드
  const handleExport = () => {
    const exportData = filteredList.map((item, idx) => ({
      '순번': idx + 1,
      '고객가입코드': item.memNo,
      '가입상품코드': item.prodCode,
      '가입상품명': item.prodName,
      '피보험자명': item.insuredName,
      '생년월일(YYYYMMDD)': item.birthdate,
      '성별(남:1, 여:2)': item.gender,
      '휴대폰번호': item.phone,
      '계약시작일': item.contractStart,
      '계약종료일(3년만기)': item.contractEnd,
      '서비스시작일': item.serviceStart,
      '고객상태코드(회원:01, 탈퇴:02)': item.customerStatus,
      '월납구분': item.monthlyCategory === '월납' ? '월납' : (item.monthlyCategory === '3년경과월납' ? '3년경과 월납대상' : '3년제공중(만기후 월납)'),
      '연체수': item.overdueCount > 0 ? item.overdueCount : (item.overdueRaw || '0'),
      '최종납입일': item.lastPaymentDate
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '헬스케어_월납대상자');

    const colWidths = [
      { wch: 6 },  // 순번
      { wch: 15 }, // 고객가입코드
      { wch: 14 }, // 가입상품코드
      { wch: 22 }, // 가입상품명
      { wch: 12 }, // 피보험자명
      { wch: 18 }, // 생년월일
      { wch: 16 }, // 성별
      { wch: 15 }, // 휴대폰번호
      { wch: 14 }, // 계약시작일
      { wch: 18 }, // 계약종료일
      { wch: 14 }, // 서비스시작일
      { wch: 24 }, // 고객상태코드
      { wch: 20 }, // 월납구분
      { wch: 12 }, // 연체수
      { wch: 16 }, // 최종납입일
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `헬스케어_월납대상자_${tabFilter}_${todayStr}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-[98vw] 2xl:max-w-[1650px] h-[93vh] flex flex-col overflow-hidden border border-slate-200"
        >
          {/* 헤더 */}
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-purple-50 via-slate-50 to-white">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-600 text-white rounded-xl shadow-md shadow-purple-200">
                <Calendar size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">
                    월납 대상자
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                    더좋은헬스케어580 & 3년 경과 대상자
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  더좋은헬스케어580(월납) 및 서비스시작일 달 이후 3년 경과 후 월납으로 진행되는 모든 헬스케어 가입자 통합 명단입니다.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="닫기"
            >
              <X size={22} />
            </button>
          </div>

          {/* 서브 바: 탭 필터, 상품 선택, 검색창, 엑셀 다운로드 */}
          <div className="px-6 py-3 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3">
            {/* 좌측: 주요 탭 필터 */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-1 bg-slate-100 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setTabFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    tabFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers size={13} className="text-purple-600" />
                  전체 명단 ({totalCount}명)
                </button>
                <button
                  onClick={() => setTabFilter('580')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    tabFilter === '580'
                      ? 'bg-purple-600 text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:text-purple-700'
                  }`}
                >
                  <ShieldCheck size={13} />
                  더좋은헬스케어580 (월납) ({count580}명)
                </button>
                <button
                  onClick={() => setTabFilter('3years')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    tabFilter === '3years'
                      ? 'bg-indigo-600 text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:text-indigo-700'
                  }`}
                  title="서비스시작일 기준 3년이 경과하여 월납 대상이 된 회원"
                >
                  <Clock size={13} />
                  3년 경과 월납대상 ({count3YearsPassed}명)
                </button>
                <button
                  onClick={() => setTabFilter('overdue')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    tabFilter === 'overdue'
                      ? 'bg-red-600 text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:text-red-700'
                  }`}
                >
                  <AlertCircle size={13} />
                  연체 1회이상 ({countOverdue}명)
                </button>
              </div>

              {/* 상품 선택 셀렉트 박스 */}
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              >
                <option value="all">모든 가입상품</option>
                {uniqueProducts.map((p, i) => (
                  <option key={i} value={p}>{p}</option>
                ))}
              </select>

              {(tabFilter !== 'all' || productFilter !== 'all') && (
                <span className="text-xs text-slate-400 font-medium ml-1">
                  (조회 결과: <strong className="text-purple-700">{filteredList.length}</strong>명)
                </span>
              )}
            </div>

            {/* 우측: 검색창 & 엑셀 다운로드 버튼 */}
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="고객명, 번호, 연락처, 날짜 검색..."
                  className="w-56 sm:w-64 pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ×
                  </button>
                )}
              </div>

              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-200 cursor-pointer"
              >
                <Download size={14} />
                <span>엑셀 다운로드</span>
              </button>
            </div>
          </div>

          {/* 비즈니스 규칙 안내 배너 */}
          <div className="px-6 py-2.5 bg-amber-50/70 border-b border-amber-100 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span>
                <strong>진행 기준:</strong> <strong>더좋은헬스케어580</strong>은 월납으로 진행되며, <strong>그 외 헬스케어 등록 상품</strong>은 서비스시작일(S열) 달 이후 <strong>3년 경과(계약종료일) 시점부터 월납으로 진행</strong>됩니다.
                연체수가 1회 이상인 회원은 <span className="text-red-600 font-bold bg-red-100/80 px-1.5 py-0.5 rounded border border-red-200">빨간색</span>으로 강조 표시됩니다.
              </span>
            </div>
            <span className="text-slate-400 text-[11px]">
              * 행을 클릭하면 해당 회원의 상세 정보/기록을 바로 확인할 수 있습니다.
            </span>
          </div>

          {/* 테이블 본문 */}
          <div className="flex-1 overflow-auto bg-slate-50 p-4 sm:p-6">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-2.5 py-3 text-[11px] whitespace-nowrap text-center w-12">순번</th>
                      <th className="px-2.5 py-3 text-[11px] whitespace-nowrap">고객가입코드</th>
                      <th className="px-2.5 py-3 text-[11px] whitespace-nowrap text-center">상품코드</th>
                      <th className="px-3 py-3 text-[11px] whitespace-nowrap">가입상품명</th>
                      <th className="px-2.5 py-3 text-[11px] whitespace-nowrap font-bold text-slate-800">피보험자명</th>
                      <th className="px-2.5 py-3 text-[11px] whitespace-nowrap">생년월일</th>
                      <th className="px-2.5 py-3 text-[11px] whitespace-nowrap text-center">성별</th>
                      <th className="px-2.5 py-3 text-[11px] whitespace-nowrap">휴대폰번호</th>
                      <th className="px-2.5 py-3 text-[11px] whitespace-nowrap text-center">서비스시작일</th>
                      <th className="px-2.5 py-3 text-[11px] whitespace-nowrap text-center">계약종료일(3년만기)</th>
                      <th className="px-3 py-3 text-[11px] whitespace-nowrap text-center bg-purple-50/70 border-x border-purple-100 text-purple-900 font-bold">
                        월납 구분 / 상태
                      </th>
                      <th className="px-3 py-3 text-[11px] whitespace-nowrap text-center bg-red-50/70 border-r border-red-100 text-red-900 font-bold">
                        연체수
                      </th>
                      <th className="px-3 py-3 text-[11px] whitespace-nowrap text-center bg-blue-50/70 border-r border-blue-100 text-blue-900 font-bold">
                        최종 납입일
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredList.length > 0 ? (
                      filteredList.map((item, idx) => {
                        const isOverdue = item.overdueCount > 0;
                        return (
                          <tr
                            key={idx}
                            className={`transition-colors cursor-pointer ${
                              isOverdue
                                ? 'bg-red-50/30 hover:bg-red-50/60'
                                : 'hover:bg-slate-50'
                            }`}
                            onClick={() => onRowClick && onRowClick(item.rawItem)}
                          >
                            <td className="px-2.5 py-2.5 text-[11px] whitespace-nowrap text-center text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="px-2.5 py-2.5 text-[11px] whitespace-nowrap font-semibold text-slate-800">
                              {item.memNo}
                            </td>
                            <td className="px-2.5 py-2.5 text-[11px] whitespace-nowrap text-center text-slate-600 font-mono">
                              {item.prodCode}
                            </td>
                            <td className="px-3 py-2.5 text-[11px] whitespace-nowrap font-medium text-slate-800">
                              {item.is580 ? (
                                <span className="text-purple-700 font-bold">{item.prodName}</span>
                              ) : (
                                item.prodName
                              )}
                            </td>
                            <td className="px-2.5 py-2.5 text-[11px] whitespace-nowrap font-bold text-slate-900">
                              {item.insuredName}
                            </td>
                            <td className="px-2.5 py-2.5 text-[11px] whitespace-nowrap text-slate-600 font-mono">
                              {item.birthdate}
                            </td>
                            <td className="px-2.5 py-2.5 text-[11px] whitespace-nowrap text-center text-slate-600">
                              {item.gender === '1' ? (
                                <span className="text-blue-600 font-bold">남(1)</span>
                              ) : item.gender === '2' ? (
                                <span className="text-pink-600 font-bold">여(2)</span>
                              ) : (
                                item.gender || '-'
                              )}
                            </td>
                            <td className="px-2.5 py-2.5 text-[11px] whitespace-nowrap text-slate-600 font-mono">
                              {item.phone}
                            </td>
                            <td className="px-2.5 py-2.5 text-[11px] whitespace-nowrap text-center text-slate-700 font-mono font-medium">
                              {item.serviceStart || '-'}
                            </td>
                            <td className="px-2.5 py-2.5 text-[11px] whitespace-nowrap text-center text-slate-600 font-mono">
                              {item.contractEnd}
                            </td>

                            {/* 월납 구분 / 상태 */}
                            <td className="px-3 py-2.5 text-[11px] whitespace-nowrap text-center border-x border-slate-100">
                              {item.monthlyCategory === '월납' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  월납
                                </span>
                              ) : item.monthlyCategory === '3년경과월납' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  3년경과 월납대상
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  3년제공중 ({item.contractEnd} 만기)
                                </span>
                              )}
                            </td>

                            {/* 연체수 (1 이상이면 빨간색 강조) */}
                            <td className="px-3 py-2.5 text-[11px] whitespace-nowrap text-center border-r border-slate-100">
                              {isOverdue ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-300 shadow-2xs">
                                  <AlertCircle size={12} className="text-red-600" />
                                  {item.overdueCount}회 연체
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  정상 (0)
                                </span>
                              )}
                            </td>

                            {/* 최종 납입일 */}
                            <td className="px-3 py-2.5 text-[11px] whitespace-nowrap text-center text-slate-700 font-mono font-medium border-r border-slate-100">
                              {item.lastPaymentDate || '-'}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={13} className="px-4 py-16 text-center text-slate-500">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Filter size={32} className="text-slate-300" />
                            <p className="text-sm font-semibold text-slate-700">
                              {searchTerm || tabFilter !== 'all' || productFilter !== 'all'
                                ? '조건에 일치하는 대상자가 없습니다.'
                                : '헬스케어 가입자 데이터가 없습니다.'}
                            </p>
                            {(searchTerm || tabFilter !== 'all' || productFilter !== 'all') && (
                              <button
                                onClick={() => {
                                  setSearchTerm('');
                                  setTabFilter('all');
                                  setProductFilter('all');
                                }}
                                className="text-xs text-purple-600 hover:underline cursor-pointer"
                              >
                                필터 및 검색어 초기화
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

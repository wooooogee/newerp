import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ERPDataItem {
  memNo: string;
  prodName: string;
  hcRegDate: string;
  raw: any[];
  [key: string]: any;
}

interface HealthcareModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ERPDataItem[];
  initialFilter?: { type: 'date' | 'month', value: string } | null;
  onRowClick?: (item: ERPDataItem) => void;
  onOpenCalendar?: () => void;
}

const mapProductCode = (prodName: string) => {
  if (prodName.includes('하이브리드698')) return 'A070';
  if (prodName.includes('라이즈498')) return 'A071';
  if (prodName.includes('프리미엄540')) return 'A072';
  if (prodName.includes('헬스케어실버')) return 'A073';
  if (prodName.includes('좋은건강크루즈')) return 'A074';
  if (prodName.includes('헬스케어골드')) return 'A075';
  if (prodName.includes('헬스케어올인원') || prodName.includes('굿라이프헬스케어올인원')) return 'A077';
  if (prodName.includes('헬스케어580')) return 'A081';
  return '';
};

const parseResidentNumber = (qColumn: string) => {
  if (!qColumn) return { birthdate: '', gender: '' };
  
  const cleaned = qColumn.replace(/[^0-9]/g, '');
  
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

export const HealthcareModal: React.FC<HealthcareModalProps> = ({ isOpen, onClose, data, initialFilter, onRowClick, onOpenCalendar }) => {
  const [filterMonth, setFilterMonth] = useState<string>(''); // YYYY-MM
  const [filterDate, setFilterDate] = useState<string>(''); // YYYY-MM-DD

  React.useEffect(() => {
    if (initialFilter && isOpen) {
      if (initialFilter.type === 'date') {
        setFilterDate(initialFilter.value.replace(/\./g, '-'));
        setFilterMonth('');
      } else if (initialFilter.type === 'month') {
        setFilterMonth(initialFilter.value.replace(/\./g, '-'));
        setFilterDate('');
      }
    }
  }, [initialFilter, isOpen]);

  const filteredData = useMemo(() => {
    return data
      .filter(item => {
        const hcRegDate = (item.hcRegDate || '').trim();
        if (!hcRegDate) return false;

        // Convert hcRegDate to YYYY-MM-DD for comparison if it's in YYYY.MM.DD
        const formattedRegDate = hcRegDate.replace(/\./g, '-');

        if (filterDate) {
          return formattedRegDate.startsWith(filterDate);
        }
        if (filterMonth) {
          return formattedRegDate.startsWith(filterMonth);
        }
        return true;
      })
      .map((item, index) => {
        const pColumn = item.raw[15] || '';
        const qColumn = item.raw[16] || '';
        const rColumn = item.raw[17] || '';
        
        const { birthdate, gender } = parseResidentNumber(qColumn);

        return {
          index: index + 1,
          rawItem: item,
          memNo: item.memNo,
          prodCode: mapProductCode(item.prodName),
          prodName: item.prodName,
          insuredName: pColumn,
          birthdate,
          gender,
          phone: rColumn,
          contractStart: '',
          contractEnd: '',
          serviceStart: item.hcRegDate,
          customerStatus: '01'
        };
      });
  }, [data, filterMonth, filterDate, initialFilter]);

  const totalCount = filteredData.length;
  const summaryByProduct = filteredData.reduce((acc, curr) => {
    const key = `${curr.prodCode || '기타'}(${curr.prodName})`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleExport = () => {
    const exportData = filteredData.map(item => ({
      '순번': item.index,
      '고객가입코드': item.memNo,
      '가입상품코드': item.prodCode,
      '가입상품명': item.prodName,
      '피보험자명': item.insuredName,
      '생년월일(YYYYMMDD)': item.birthdate,
      '성별(남:1, 여:2)': item.gender,
      '휴대폰번호': item.phone,
      '계약시작일': item.contractStart,
      '계약종료일': item.contractEnd,
      '서비스시작일': item.serviceStart,
      '고객상태코드(회원:01, 탈퇴:02)': item.customerStatus
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "헬스케어_명단");
    
    // Auto-adjust column width (basic approximation)
    const colWidths = [
      { wch: 6 },  // 순번
      { wch: 15 }, // 고객가입코드
      { wch: 15 }, // 가입상품코드
      { wch: 25 }, // 가입상품명
      { wch: 12 }, // 피보험자명
      { wch: 18 }, // 생년월일
      { wch: 18 }, // 성별
      { wch: 15 }, // 휴대폰번호
      { wch: 12 }, // 계약시작일
      { wch: 12 }, // 계약종료일
      { wch: 12 }, // 서비스시작일
      { wch: 25 }, // 고객상태코드
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `헬스케어_명단_${filterDate || filterMonth || '전체'}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="text-pink-500" size={24} />
                헬스케어 명단 조회
              </h2>
              <p className="text-sm text-slate-500 mt-1">S열 헬스케어등록일 기준으로 조회 및 엑셀 다운로드가 가능합니다.</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-4 border-b border-slate-100 flex items-center gap-4 bg-white">
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center gap-2">
                 <span className="text-sm font-bold text-slate-800 bg-slate-100 px-3 py-1 rounded-full">
                    선택 범위: {initialFilter ? initialFilter.value : '전체'}
                 </span>
                 <button 
                   onClick={() => { 
                     if(onOpenCalendar) onOpenCalendar(); 
                     onClose(); 
                   }} 
                   className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-full text-[12px] font-semibold transition-all shadow-sm"
                 >
                    🗓️ 날짜 다시 선택
                 </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[13px] ml-1">
                <span className="font-black text-green-600 bg-green-50 px-2 py-0.5 rounded text-[12px]">총 {totalCount}명</span>
                {Object.keys(summaryByProduct).length > 0 && <span className="text-slate-300">|</span>}
                {Object.entries(summaryByProduct).map(([key, count], i) => (
                   <span key={i} className="text-slate-600 font-medium text-[12px] bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                     {key}: <span className="font-bold text-slate-900">{count}명</span>
                   </span>
                ))}
              </div>
            </div>
            <div className="shrink-0 flex items-end">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors shadow-sm text-sm font-medium"
              >
                <Download size={16} />
                엑셀 다운로드
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-slate-50 p-6">
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-2 py-2 text-[11px] whitespace-nowrap text-center">순번</th>
                      <th className="px-2 py-2 text-[11px] whitespace-nowrap">고객가입코드</th>
                      <th className="px-2 py-2 text-[11px] whitespace-nowrap">가입상품코드</th>
                      <th className="px-2 py-2 text-[11px] whitespace-nowrap">가입상품명</th>
                      <th className="px-2 py-2 text-[11px] whitespace-nowrap">피보험자명</th>
                      <th className="px-2 py-2 text-[11px] whitespace-nowrap">생년월일(YYYYMMDD)</th>
                      <th className="px-2 py-2 text-[11px] whitespace-nowrap text-center">성별(남:1, 여:2)</th>
                      <th className="px-2 py-2 text-[11px] whitespace-nowrap">휴대폰번호</th>
                      <th className="px-2 py-2 text-[11px] whitespace-nowrap">계약시작일</th>
                      <th className="px-2 py-2 text-[11px] whitespace-nowrap">계약종료일</th>
                      <th className="px-2 py-2 text-[11px] whitespace-nowrap">서비스시작일</th>
                      <th className="px-2 py-2 text-[11px] whitespace-nowrap text-center">고객상태코드(회원:01, 탈퇴:02)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredData.length > 0 ? (
                      filteredData.map((item) => (
                        <tr 
                          key={item.index} 
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => onRowClick && onRowClick(item.rawItem)}
                        >
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap text-center text-slate-500">{item.index}</td>
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap font-medium text-slate-700">{item.memNo}</td>
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap text-slate-600">{item.prodCode}</td>
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap text-slate-600">{item.prodName}</td>
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap text-slate-600">{item.insuredName}</td>
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap text-slate-600">{item.birthdate}</td>
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap text-center text-slate-600">{item.gender}</td>
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap text-slate-600">{item.phone}</td>
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap text-slate-400">{item.contractStart || '-'}</td>
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap text-slate-400">{item.contractEnd || '-'}</td>
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap text-slate-600">{item.serviceStart}</td>
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap text-center text-slate-600">{item.customerStatus}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={12} className="px-4 py-12 text-center text-slate-500">
                          조건에 맞는 헬스케어 명단이 없습니다.
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

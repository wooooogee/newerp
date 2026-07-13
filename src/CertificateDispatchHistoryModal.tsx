import React, { useState, useMemo, useEffect } from 'react';
import { X, Download, Search, FileText, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// @ts-ignore
const XLSX = (window as any).XLSX;

interface CertificateDispatchHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CertificateDispatchHistoryModal: React.FC<CertificateDispatchHistoryModalProps> = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sheets/sheetData?sheetName=증서발송리스트');
      if (response.ok) {
        const data = await response.json();
        if (data.length > 1) {
          setHistoryList(data.slice(1)); // Skip headers
        } else {
          setHistoryList([]);
        }
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen]);

  // Mapped items
  const mappedList = useMemo(() => {
    return historyList.map((raw, idx) => {
      return {
        id: idx,
        date: String(raw[0] || ''),       // 발송날짜
        type: String(raw[1] || ''),       // 구분 (우편/알림톡)
        memName: String(raw[2] || ''),    // 회원명
        phone: String(raw[4] || ''),      // 휴대폰번호
        memNo1: String(raw[6] || ''),     // *회원번호1
        birthDate: String(raw[7] || ''),   // *생년월일
        contractDate: String(raw[8] || ''),// *가입일자
        prodName: String(raw[9] || ''),   // *가입상품
        monthlyPay1: String(raw[10] || ''),// *월불입금1
        monthlyPay2: String(raw[11] || ''),// *월불입금2
        zipCode: String(raw[12] || ''),    // 우편번호
        address: String(raw[13] || ''),    // *주소
        empName: String(raw[14] || ''),    // *담당자
        empPhone: String(raw[15] || ''),   // *담당자전화번호
        memNo2: String(raw[16] || ''),     // 회원번호2
        memNo3: String(raw[17] || '')      // 회원번호3
      };
    });
  }, [historyList]);

  // Available months of dispatches
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    mappedList.forEach(item => {
      if (item.date) {
        const m = item.date.match(/^(\d{4})[-./]?(\d{2})/);
        if (m) months.add(`${m[1]}-${m[2]}`);
      }
    });
    return Array.from(months).sort().reverse();
  }, [mappedList]);

  // Set latest month as default
  useEffect(() => {
    if (availableMonths.length > 0 && selectedMonth === 'all') {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths]);

  // Filtered list
  const filteredData = useMemo(() => {
    let result = mappedList;

    // Filter by Month
    if (selectedMonth !== 'all') {
      result = result.filter(item => {
        if (!item.date) return false;
        const m = item.date.match(/^(\d{4})[-./]?(\d{2})/);
        return m ? `${m[1]}-${m[2]}` === selectedMonth : false;
      });
    }

    // Filter by Type
    if (selectedType !== 'all') {
      result = result.filter(item => item.type === selectedType);
    }

    // Filter by search term
    if (!searchTerm) return result;
    const term = searchTerm.toLowerCase();
    return result.filter(item => {
      return (
        item.memName.toLowerCase().includes(term) ||
        item.phone.toLowerCase().includes(term) ||
        item.prodName.toLowerCase().includes(term) ||
        item.empName.toLowerCase().includes(term) ||
        item.memNo1.toLowerCase().includes(term)
      );
    });
  }, [mappedList, selectedMonth, selectedType, searchTerm]);

  const handleExportExcel = () => {
    const excelData = filteredData.map(item => {
      return {
        '발송날짜': item.date,
        '구분': item.type,
        '회원명': item.memName,
        '공란': '',
        '휴대폰번호': item.phone,
        '*회원명': item.memName,
        '*회원번호1': item.memNo1,
        '*생년월일': item.birthDate,
        '*가입일자': item.contractDate,
        '*가입상품': item.prodName,
        '*월불입금1': item.monthlyPay1,
        '*월불입금2': item.monthlyPay2,
        '우편번호': item.zipCode,
        '*주소': item.address,
        '*담당자': item.empName,
        '*담당자전화번호': item.empPhone,
        '회원번호2': item.memNo2,
        '회원번호3': item.memNo3
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "증서발송이력");
    XLSX.writeFile(workbook, `증서발송이력_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 bg-white shrink-0">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                  <Calendar size={20} className="sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">증서발송이력</h2>
                  <p className="text-[11px] sm:text-xs font-medium text-slate-400 mt-0.5">
                    총 <span className="text-emerald-600 font-bold">{filteredData.length}</span>건의 발송 이력
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={handleExportExcel}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-[13px] font-bold transition-colors"
                >
                  <Download size={16} />
                  엑셀 다운로드
                </button>
                <button
                  onClick={onClose}
                  className="p-2 sm:p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50">
              {/* Filters */}
              <div className="p-4 sm:p-5 border-b border-slate-100 bg-white shrink-0">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="회원명, 휴대폰번호, 상품명, 담당자 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div className="sm:w-48">
                    <select
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    >
                      <option value="all">전체 구분 (알림톡/우편)</option>
                      <option value="알림톡">알림톡</option>
                      <option value="우편">우편</option>
                    </select>
                  </div>
                  <div className="sm:w-48">
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    >
                      <option value="all">전체 발송월</option>
                      {availableMonths.map(m => (
                        <option key={m} value={m}>{m.replace('-', '년 ')}월</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto p-4 sm:p-5">
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
                  </div>
                ) : filteredData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                    <FileText size={48} className="opacity-20" />
                    <p className="text-[13px] font-medium">발송 이력이 없습니다.</p>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">발송날짜</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">구분</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">회원명</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">휴대폰번호</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">*회원번호1</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">*생년월일</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">*가입일자</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">*가입상품</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">*월불입금1</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">*월불입금2</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">우편번호</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap w-[300px]">*주소</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">*담당자</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">*담당자전화번호</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">회원번호2</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">회원번호3</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredData.slice(0, 200).map((item, idx) => {
                            return (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap font-medium">{item.date}</td>
                                <td className="p-3 text-[12px] whitespace-nowrap">
                                  <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                                    item.type === '우편' 
                                      ? 'bg-amber-50 text-amber-600 border border-amber-200' 
                                      : 'bg-blue-50 text-blue-600 border border-blue-200'
                                  }`}>
                                    {item.type}
                                  </span>
                                </td>
                                <td className="p-3 text-[12px] font-bold text-slate-800 whitespace-nowrap">{item.memName}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{item.phone}</td>
                                <td className="p-3 text-[12px] font-mono text-slate-600 whitespace-nowrap">{item.memNo1}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{item.birthDate}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{item.contractDate}</td>
                                <td className="p-3 text-[12px] text-slate-700 truncate max-w-[150px] whitespace-nowrap" title={item.prodName}>{item.prodName}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{item.monthlyPay1}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{item.monthlyPay2}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{item.zipCode}</td>
                                <td className="p-3 text-[12px] text-slate-600 truncate max-w-[300px] whitespace-nowrap" title={item.address}>{item.address}</td>
                                <td className="p-3 text-[12px] text-slate-800 font-medium whitespace-nowrap">{item.empName}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{item.empPhone}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{item.memNo2 || ''}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{item.memNo3 || ''}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {filteredData.length > 200 && (
                      <div className="p-3 text-center text-[12px] font-medium text-slate-500 bg-slate-50 border-t border-slate-200">
                        화면에는 최대 200건만 표시됩니다. 엑셀 다운로드를 통해 전체 데이터를 확인하세요.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

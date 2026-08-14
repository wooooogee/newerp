import React, { useState, useMemo, useEffect } from 'react';
import { X, Download, Search, FileText, Calendar, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { printCertificatesPdf } from './certificatePdfPrinter';

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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // 필터 또는 검색어 변경 시 선택 초기화
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchTerm, selectedMonth, selectedType]);

  // 개별 선택 토글
  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };


  // 우편 증서 PDF 인쇄 핸들러
  const handlePrintCertificates = () => {
    const selectedItems = mappedList.filter(item => selectedIds.has(item.id));
    if (selectedItems.length === 0) {
      alert('인쇄할 항목을 선택해 주세요.');
      return;
    }
    printCertificatesPdf(selectedItems);
  };

  // 라벨 인쇄 팝업 창 생성 및 인쇄 호출
  const handlePrintLabels = () => {
    const selectedItems = mappedList.filter(item => selectedIds.has(item.id));
    if (selectedItems.length === 0) return;

    const printWindow = window.open('', '_blank', 'width=850,height=900');
    if (!printWindow) {
      alert('팝업 차단이 설정되어 있습니다. 팝업을 허용해 주세요.');
      return;
    }

    const itemsPerPage = 10;
    let pagesHtml = '';

    for (let i = 0; i < selectedItems.length; i += itemsPerPage) {
      const pageItems = selectedItems.slice(i, i + itemsPerPage);
      let cellsHtml = '';

      for (let j = 0; j < 10; j++) {
        const item = pageItems[j];
        if (item) {
          cellsHtml += `
            <div class="label-cell">
              <div class="label-header">받는 사람</div>
              <div class="label-address">${item.address || ''}</div>
              <div class="label-footer">
                <div class="label-phone">${item.phone || ''}</div>
                <div class="label-name">${item.memName || ''}</div>
              </div>
            </div>
          `;
        } else {
          cellsHtml += `<div class="label-cell empty"></div>`;
        }
      }

      pagesHtml += `<div class="label-page">${cellsHtml}</div>`;
    }

    const htmlContent = `
      <html>
        <head>
          <title>라벨 인쇄</title>
          <style>
            @page {
              size: A4;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
              background: #fff;
              -webkit-print-color-adjust: exact;
            }
            .label-page {
              width: 210mm;
              height: 297mm;
              box-sizing: border-box;
              padding-top: 11mm;
              padding-bottom: 11mm;
              padding-left: 5.9mm;
              padding-right: 5.9mm;
              display: grid;
              grid-template-columns: repeat(2, 99.1mm);
              grid-template-rows: repeat(5, 55mm);
              column-gap: 4mm;
              row-gap: 0mm;
              page-break-after: always;
            }
            .label-page:last-child {
              page-break-after: avoid;
            }
            .label-cell {
              border: 1px solid #444;
              box-sizing: border-box;
              padding: 5mm 6mm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow: hidden;
            }
            .label-cell.empty {
              border: 1px solid #444;
              visibility: visible;
            }
            .label-header {
              font-size: 13pt;
              font-weight: bold;
              color: #000;
              border-bottom: 1.5px solid #000;
              padding-bottom: 1.5mm;
              margin-bottom: 3.5mm;
              text-align: left;
            }
            .label-address {
              font-size: 11.5pt;
              line-height: 1.55;
              color: #000;
              word-break: break-all;
              flex-grow: 1;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
              margin-bottom: 2mm;
              text-align: left;
            }
            .label-footer {
              text-align: right;
              margin-top: auto;
            }
            .label-phone {
              font-size: 10pt;
              color: #000;
              margin-bottom: 1mm;
              font-family: monospace;
            }
            .label-name {
              font-size: 12.5pt;
              font-weight: bold;
              color: #000;
            }
            
            @media screen {
              body {
                background: #f0f0f0;
                padding: 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 20px;
              }
              .label-page {
                background: white;
                box-shadow: 0 4px 10px rgba(0,0,0,0.15);
                border-radius: 4px;
              }
              .print-btn-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 1000;
              }
              .print-btn {
                background: #10b981;
                color: white;
                border: none;
                padding: 12px 24px;
                font-size: 14px;
                font-weight: bold;
                border-radius: 8px;
                cursor: pointer;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              }
            }
            @media print {
              .print-btn-container {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-btn-container">
            <button class="print-btn" onclick="window.print()">인쇄하기 (Print)</button>
          </div>
          ${pagesHtml}
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 300);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

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
        memNo3: String(raw[17] || ''),     // 회원번호3
        memNo4: String(raw[18] || '')      // 회원번호4
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

  // 필터링된 항목 중 우편 대상들
  const postItemsInFiltered = useMemo(() => {
    return filteredData.filter(item => item.type === '우편');
  }, [filteredData]);

  // 우편 대상들 전체 선택 여부
  const isAllSelected = useMemo(() => {
    if (postItemsInFiltered.length === 0) return false;
    return postItemsInFiltered.every(item => selectedIds.has(item.id));
  }, [postItemsInFiltered, selectedIds]);

  // 전체 선택 토글
  const handleToggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (isAllSelected) {
        postItemsInFiltered.forEach(item => next.delete(item.id));
      } else {
        postItemsInFiltered.forEach(item => next.add(item.id));
      }
      return next;
    });
  };

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
                  onClick={handlePrintCertificates}
                  disabled={selectedIds.size === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-bold transition-all ${
                    selectedIds.size === 0 
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                      : 'bg-amber-600 text-white hover:bg-amber-500 shadow-md shadow-amber-600/20'
                  }`}
                >
                  <Printer size={16} />
                  우편증서 PDF 출력 ({selectedIds.size}건)
                </button>
                <button
                  onClick={handlePrintLabels}
                  disabled={selectedIds.size === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-bold transition-colors ${
                    selectedIds.size === 0 
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                      : 'bg-blue-600 text-white hover:bg-blue-500 shadow-md shadow-blue-500/10'
                  }`}
                >
                  <FileText size={16} />
                  라벨 인쇄 ({selectedIds.size}건)
                </button>
                <button
                  onClick={handleExportExcel}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-[13px] font-bold transition-colors border border-emerald-200"
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
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap w-[40px] text-center">
                              {postItemsInFiltered.length > 0 && (
                                <input
                                  type="checkbox"
                                  checked={isAllSelected}
                                  onChange={handleToggleSelectAll}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4 align-middle"
                                />
                              )}
                            </th>
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
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap text-center">개별출력</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredData.slice(0, 200).map((item, idx) => {
                            const isPost = item.type === '우편';
                            const isSelected = selectedIds.has(item.id);
                            return (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                <td className="p-3 text-center whitespace-nowrap w-[40px]">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleToggleSelect(item.id)}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4 align-middle"
                                  />
                                </td>
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
                                <td className="p-3 text-center whitespace-nowrap">
                                  <button
                                    onClick={() => printCertificatesPdf([item])}
                                    className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-md text-[11px] font-bold transition-colors flex items-center gap-1 mx-auto"
                                    title="해당 회원만 단독 PDF 출력"
                                  >
                                    <Printer size={12} />
                                    출력
                                  </button>
                                </td>
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

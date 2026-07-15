import React, { useState, useMemo, useEffect } from 'react';
import { X, Calendar, Download, Search, FileText, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MultiSelectDropdown } from './MultiSelectDropdown';
// @ts-ignore
const XLSX = (window as any).XLSX;

interface CertificateDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[]; // ERPDataItem[]
}

export const CertificateDispatchModal: React.FC<CertificateDispatchModalProps> = ({ isOpen, onClose, data }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sheet1List, setSheet1List] = useState<any[]>([]);
  const [empList, setEmpList] = useState<any[]>([]);
  const [paymentList, setPaymentList] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isConsolidated, setIsConsolidated] = useState<boolean>(true);
  const [filterFirstPayNotDate, setFilterFirstPayNotDate] = useState<boolean>(false);
  const [filterCertNotSent, setFilterCertNotSent] = useState<boolean>(true);
  const [filterWorkAddressPost, setFilterWorkAddressPost] = useState<boolean>(false);

  // Fetch '사원리스트' and '월불입금' data when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchAdditionalData = async () => {
        setLoading(true);
        try {
          const [sheet1Res, empRes, payRes] = await Promise.all([
            fetch('/api/sheets/sheetData?sheetName=시트1'),
            fetch('/api/sheets/sheetData?sheetName=사원리스트'),
            fetch('/api/sheets/sheetData?sheetName=월불입금')
          ]);
          
          if (sheet1Res.ok) {
            const sheet1Data = await sheet1Res.json();
            const rows = sheet1Data.slice(1);
            setSheet1List(rows); // Skip header
            
            // 관리대장 데이터(data)를 회원번호 기준으로 가입상태 맵 생성 (대소문자 무시)
            const maintenanceStatusMap = new Map<string, string>();
            data.forEach(item => {
              if (item.memNo) {
                maintenanceStatusMap.set(String(item.memNo).trim().toUpperCase(), String(item.status || '').trim());
              }
            });

            // 최근월 찾아서 기본 선택
            const months = new Set<string>();
            rows.forEach((raw: any) => {
              const memNo = String(raw[1] || '').trim().toUpperCase();
              // 관리대장 시트에 없는 경우 가입상태를 빈값으로 취급하여 제외
              const status = maintenanceStatusMap.get(memNo) || '';

              if (status === '가입') {
                const cDate = String(raw[2] || '');
                if (cDate) {
                  const m = cDate.match(/^(\d{4})[-./]?(\d{2})/);
                  if (m) months.add(`${m[1]}-${m[2]}`);
                }
              }
            });
            const sortedMonths = Array.from(months).sort().reverse();
            if (sortedMonths.length > 0) {
              setSelectedMonth(sortedMonths[0]);
            }
          }
          if (empRes.ok) {
            const empData = await empRes.json();
            setEmpList(empData.slice(1)); // Skip header
          }
          if (payRes.ok) {
            const payData = await payRes.json();
            setPaymentList(payData.slice(1)); // Skip header
          }
        } catch (error) {
          console.error('Failed to load additional sheet data:', error);
        } finally {
          setLoading(false);
        }
      };
      
      fetchAdditionalData();
    }
  }, [isOpen, data]);

  // Combine data
  const combinedData = useMemo(() => {
    // 관리대장 데이터(data)를 회원번호 기준으로 가입상태 맵 생성 (대소문자 무시)
    const maintenanceStatusMap = new Map<string, string>();
    data.forEach(item => {
      if (item.memNo) {
        maintenanceStatusMap.set(String(item.memNo).trim().toUpperCase(), String(item.status || '').trim());
      }
    });

    return sheet1List
      .map((raw, idx) => {
        const memNo = String(raw[1] || '').trim();
        const memNoKey = memNo.toUpperCase();
        // 관리대장 시트의 가입상태를 가져오고, 없으면 '' 처리 (시트1의 기존 값 raw[8]은 무시하여 엄격 매칭)
        const status = maintenanceStatusMap.get(memNoKey) || '';

        const hq = String(raw[38] || '');         // AM(38): 본부명
        const empCode = String(raw[39] || '');    // AN(39): 사원코드
        const empName = String(raw[10] || '');    // K(10): 사원명
        const contractDate = String(raw[2] || ''); // C(2): 계약일자
        const memName = String(raw[5] || '');     // F(5): 회원명
        const resNo = String(raw[7] || '');       // H(7): 주민등록번호
        const prodName = String(raw[11] || '');   // L(11): 상품명
        const firstPayDate = String(raw[20] || '');// U(20): 최초납입일
        let zipCode = String(raw[44] || '');      // AS(44): 우편번호
        const address = String(raw[45] || '');    // AT(45): 주소
        const workAddress = String(raw[47] || '');// AV(47): 직장주소
        const cert = String(raw[49] || '');       // AX(49): 증서
        const deliveryType = String(raw[58] || '');// BG(58): 배송구분
        const rentalNo = String(raw[59] || '');   // BH(59): 렌탈계약번호

        // 우편번호 '-' 제거 로직
        if (zipCode.includes('-')) {
          zipCode = zipCode.replace(/-/g, '');
        }

        // 사원연락처 (사원리스트 B열(1) === AN열 사원코드 일 때 L열(11) 추출)
        let empPhone = '';
        if (empCode && empList.length > 0) {
          const emp = empList.find(e => e[1] === empCode);
          if (emp) {
            empPhone = String(emp[11] || '');
          }
        }

        // 월불입금1, 월불입금2 (월불입금 A열(0) === L열(11) 상품명 일 때 E열(4), F열(5) 추출)
        let monthlyPay1 = '';
        let monthlyPay2 = '';
        if (prodName && paymentList.length > 0) {
          const payment = paymentList.find(p => p[0] === prodName);
          if (payment) {
            monthlyPay1 = String(payment[4] || '');
            monthlyPay2 = String(payment[5] || '');
          }
        }

        // 생년월일 추출 로직 (주민등록번호 앞 6자리 활용)
        let birthDate = '';
        if (resNo && resNo.length >= 6) {
          const prefix = resNo.substring(0, 6);
          const yearStr = prefix.substring(0, 2);
          const yearNum = parseInt(yearStr, 10);
          const fullYear = yearNum <= 24 ? `20${yearStr}` : `19${yearStr}`;
          birthDate = `${fullYear}${prefix.substring(2, 6)}`;
        }

        // 휴대폰번호: AB열(27)
        const phone = String(raw[27] || '');

        return {
          id: idx,
          extracted: {
            status, contractDate, memNo, memName, resNo, prodName, firstPayDate,
            hq, empCode, empName, zipCode, address, workAddress, cert, deliveryType, rentalNo,
            empPhone, monthlyPay1, monthlyPay2, birthDate, phone
          }
        };
      })
      .filter(item => item.extracted.status === '가입');
  }, [sheet1List, empList, paymentList, data]);

  // 계약일자 월 목록 추출 (YYYY-MM)
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    combinedData.forEach(item => {
      const cDate = item.extracted.contractDate;
      if (cDate) {
        const m = cDate.match(/^(\d{4})[-./]?(\d{2})/);
        if (m) months.add(`${m[1]}-${m[2]}`);
      }
    });
    return Array.from(months).sort().reverse();
  }, [combinedData]);

  // 가입상품 목록 추출
  const uniqueProducts = useMemo(() => {
    const products = new Set<string>();
    combinedData.forEach(item => {
      if (item.extracted.prodName) {
        products.add(item.extracted.prodName);
      }
    });
    return Array.from(products).sort();
  }, [combinedData]);

  const filteredData = useMemo(() => {
    let result = combinedData;

    if (selectedMonth !== 'all') {
      result = result.filter(item => {
        const cDate = item.extracted.contractDate;
        if (!cDate) return false;
        const m = cDate.match(/^(\d{4})[-./]?(\d{2})/);
        return m ? `${m[1]}-${m[2]}` === selectedMonth : false;
      });
    }

    if (selectedProducts.length > 0) {
      result = result.filter(item => selectedProducts.includes(item.extracted.prodName));
    }

    if (filterFirstPayNotDate) {
      result = result.filter(item => {
        const val = String(item.extracted.firstPayDate || '').trim();
        const isDate = /^\d{4}[-./]?\d{2}[-./]?\d{2}/.test(val);
        return !isDate;
      });
    }

    if (filterCertNotSent) {
      result = result.filter(item => {
        const val = String(item.extracted.cert || '').trim();
        return val === '미발송';
      });
    }

    if (filterWorkAddressPost) {
      result = result.filter(item => {
        const val = String(item.extracted.workAddress || '').trim();
        return val === '우편';
      });
    }

    if (!searchTerm) return result;
    const term = searchTerm.toLowerCase();
    return result.filter(item => {
      const ext = item.extracted;
      const searchString = `${ext.memName} ${ext.memNo} ${ext.empName} ${ext.rentalNo}`.toLowerCase();
      return searchString.includes(term);
    });
  }, [combinedData, selectedMonth, selectedProducts, filterFirstPayNotDate, filterCertNotSent, filterWorkAddressPost, searchTerm]);

  const processedData = useMemo(() => {
    let result = filteredData;

    if (isConsolidated) {
      const groups = new Map<string, typeof filteredData>();
      result.forEach(item => {
        const ext = item.extracted;
        const key = `${ext.memName}_${ext.phone}_${ext.prodName}`;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(item);
      });

      result = Array.from(groups.values()).map(group => {
        const base = { ...group[0] };
        base.extracted = { ...base.extracted };
        const uniqueNos = Array.from(new Set(group.map(item => item.extracted.memNo).filter(Boolean)));
        base.extracted.memNo = uniqueNos[0] || '';
        base.extracted.rentalNo2 = uniqueNos[1] || '';
        base.extracted.rentalNo3 = uniqueNos[2] || '';
        return base;
      });
    } else {
      result = result.map(item => {
        const base = { ...item };
        base.extracted = { ...base.extracted, rentalNo2: '', rentalNo3: '' };
        return base;
      });
    }

    // 가입상품 정렬 및 회원번호 개수 정렬 (3개 -> 2개 -> 1개 순)
    return [...result].sort((a, b) => {
      const prodA = a.extracted.prodName || '';
      const prodB = b.extracted.prodName || '';
      if (prodA !== prodB) {
        return prodA.localeCompare(prodB);
      }
      const getScore = (item: any) => {
        if (item.extracted.rentalNo3) return 3;
        if (item.extracted.rentalNo2) return 2;
        return 1;
      };
      return getScore(b) - getScore(a);
    });
  }, [filteredData, isConsolidated]);

  const [saving, setSaving] = useState(false);

  const handleSaveDispatch = async () => {
    if (processedData.length === 0) {
      await (window as any).customAlert('저장할 데이터가 없습니다.');
      return;
    }

    if (!await (window as any).customConfirm(`현재 필터링 및 통합된 ${processedData.length}건의 데이터를 구글 시트 '증서발송리스트'에 저장하시겠습니까?`, '증서 발송 저장')) {
      return;
    }

    setSaving(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const rows = processedData.map(item => {
        const ext = item.extracted;
        const isPost = String(ext.workAddress || '').trim() === '우편';
        const type = isPost ? '우편' : '알림톡';

        return [
          todayStr,
          type,
          ext.memName || '',
          '',
          ext.phone || '',
          ext.memName || '',
          ext.memNo || '',
          ext.birthDate || '',
          ext.contractDate || '',
          ext.prodName || '',
          ext.monthlyPay1 || '',
          ext.monthlyPay2 || '',
          ext.zipCode || '',
          ext.address || '',
          ext.empName || '',
          ext.empPhone || '',
          ext.rentalNo2 || '',
          ext.rentalNo3 || ''
        ];
      });

      const response = await fetch('/api/sheets/saveCertificateDispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows })
      });

      if (response.ok) {
        await (window as any).customAlert('증서발송리스트에 성공적으로 저장되었습니다!', '저장 완료');
      } else {
        const err = await response.json();
        await (window as any).customAlert(`저장 실패: ${err.error || '알 수 없는 오류'}`, '오류 발생');
      }
    } catch (error) {
      console.error(error);
      await (window as any).customAlert('저장 중 네트워크 오류가 발생했습니다.', '오류 발생');
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = () => {
    const excelData = processedData.map(item => {
      const ext = item.extracted;
      return {
        '회원명': ext.memName,
        '공란': '',
        '휴대폰번호': ext.phone,
        '*회원명': ext.memName,
        '*회원번호1': ext.memNo,
        '*생년월일': ext.birthDate,
        '*가입일자': ext.contractDate,
        '*가입상품': ext.prodName,
        '*월불입금1': ext.monthlyPay1,
        '*월불입금2': ext.monthlyPay2,
        '우편번호': ext.zipCode,
        '*주소': ext.address,
        '*담당자': ext.empName,
        '*담당자전화번호': ext.empPhone,
        '회원번호2': ext.rentalNo2 || '',
        '회원번호3': ext.rentalNo3 || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "증서발송대장");
    XLSX.writeFile(workbook, `증서발송대장_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                  <FileText size={20} className="sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">증서발송대장</h2>
                  <p className="text-[11px] sm:text-xs font-medium text-slate-400 mt-0.5">
                    총 <span className="text-blue-600 font-bold">{processedData.length}</span>건의 데이터
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={handleSaveDispatch}
                  disabled={saving}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-400 rounded-lg text-[13px] font-bold transition-colors"
                >
                  <Save size={16} />
                  {saving ? '저장 중...' : '발송저장'}
                </button>
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
                      placeholder="회원명, 회원번호, 사원명 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div className="sm:w-56 flex items-center">
                    <MultiSelectDropdown
                      label="가입상품"
                      options={uniqueProducts}
                      selectedOptions={selectedProducts}
                      onChange={setSelectedProducts}
                      className="w-full relative flex items-center justify-between gap-1.5 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors"
                      displayClassName="flex items-center justify-between w-full"
                    />
                  </div>
                  <div className="sm:w-48">
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    >
                      <option value="all">전체 월</option>
                      {availableMonths.map(m => (
                        <option key={m} value={m}>{m.replace('-', '년 ')}월</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 px-3">
                    <input
                      type="checkbox"
                      id="consolidate-check"
                      checked={isConsolidated}
                      onChange={(e) => setIsConsolidated(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="consolidate-check" className="text-[13px] font-medium text-slate-700 cursor-pointer select-none whitespace-nowrap">
                      동일 회원 통합
                    </label>
                  </div>
                  <div className="flex items-center gap-2 px-3">
                    <input
                      type="checkbox"
                      id="firstpay-notdate-check"
                      checked={filterFirstPayNotDate}
                      onChange={(e) => setFilterFirstPayNotDate(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="firstpay-notdate-check" className="text-[13px] font-medium text-slate-700 cursor-pointer select-none whitespace-nowrap">
                      초회납 미납
                    </label>
                  </div>
                  <div className="flex items-center gap-2 px-3">
                    <input
                      type="checkbox"
                      id="cert-notsent-check"
                      checked={filterCertNotSent}
                      onChange={(e) => setFilterCertNotSent(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="cert-notsent-check" className="text-[13px] font-medium text-slate-700 cursor-pointer select-none whitespace-nowrap">
                      증서 미발송
                    </label>
                  </div>
                  <div className="flex items-center gap-2 px-3">
                    <input
                      type="checkbox"
                      id="workaddress-post-check"
                      checked={filterWorkAddressPost}
                      onChange={(e) => setFilterWorkAddressPost(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="workaddress-post-check" className="text-[13px] font-medium text-slate-700 cursor-pointer select-none whitespace-nowrap">
                      우편
                    </label>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto p-4 sm:p-5">
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                  </div>
                ) : processedData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                    <FileText size={48} className="opacity-20" />
                    <p className="text-[13px] font-medium">검색 결과가 없습니다.</p>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">회원명</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">공란</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">휴대폰번호</th>
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap">*회원명</th>
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
                          {processedData.slice(0, 100).map((item, idx) => {
                            const ext = item.extracted;
                            return (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                <td className="p-3 text-[12px] font-bold text-slate-800 whitespace-nowrap">{ext.memName}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap"></td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{ext.phone}</td>
                                <td className="p-3 text-[12px] font-bold text-slate-800 whitespace-nowrap">{ext.memName}</td>
                                <td className="p-3 text-[12px] font-mono text-slate-600 whitespace-nowrap">{ext.memNo}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{ext.birthDate}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{ext.contractDate}</td>
                                <td className="p-3 text-[12px] text-slate-700 truncate max-w-[150px] whitespace-nowrap" title={ext.prodName}>{ext.prodName}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{ext.monthlyPay1}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{ext.monthlyPay2}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{ext.zipCode}</td>
                                <td className="p-3 text-[12px] text-slate-600 truncate max-w-[300px] whitespace-nowrap" title={ext.address}>{ext.address}</td>
                                <td className="p-3 text-[12px] text-slate-800 font-medium whitespace-nowrap">{ext.empName}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{ext.empPhone}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{ext.rentalNo2 || ''}</td>
                                <td className="p-3 text-[12px] text-slate-600 whitespace-nowrap">{ext.rentalNo3 || ''}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {processedData.length > 100 && (
                      <div className="p-3 text-center text-[12px] font-medium text-slate-500 bg-slate-50 border-t border-slate-200">
                        화면에는 최대 100건만 표시됩니다. 엑셀 다운로드를 통해 전체 데이터를 확인하세요.
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

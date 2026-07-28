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
  const [certFilterType, setCertFilterType] = useState<'notSent' | 'sent' | 'all'>('notSent');
  const [filterWorkAddressPost, setFilterWorkAddressPost] = useState<boolean>(false);
  const [filterPostNotSent, setFilterPostNotSent] = useState<boolean>(false);
  const [dispatchedHistoryNos, setDispatchedHistoryNos] = useState<Set<string>>(new Set());

  // Fetch '사원리스트', '월불입금', '증서발송리스트' data when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchAdditionalData = async () => {
        setLoading(true);
        try {
          const timestamp = Date.now();
          const [sheet1Res, empRes, payRes, historyRes] = await Promise.all([
            fetch(`/api/sheets/sheetData?sheetName=시트1&t=${timestamp}`),
            fetch(`/api/sheets/sheetData?sheetName=사원리스트&t=${timestamp}`),
            fetch(`/api/sheets/sheetData?sheetName=월불입금&t=${timestamp}`),
            fetch(`/api/sheets/sheetData?sheetName=증서발송리스트&t=${timestamp}`)
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
          if (historyRes.ok) {
            const historyData = await historyRes.json();
            const nos = new Set<string>();
            if (historyData && historyData.length > 0) {
              const headerRow = historyData[0] || [];
              // 헤더에서 '회원번호' 단어가 포함된 모든 열의 인덱스를 수집 (*회원번호1, 회원번호2, 회원번호3 등)
              const memNoIndices: number[] = [];
              headerRow.forEach((h: any, idx: number) => {
                const title = String(h || '').trim();
                if (title.includes('회원번호')) {
                  memNoIndices.push(idx);
                }
              });

              // 헤더를 못 찾은 경우 기본값 6(G열), 16(Q열), 17(R열) fallback
              if (memNoIndices.length === 0) {
                memNoIndices.push(6, 16, 17);
              }

              historyData.slice(1).forEach((raw: any) => {
                memNoIndices.forEach(colIdx => {
                  const memNo = String(raw[colIdx] || '').trim().toUpperCase();
                  if (memNo && memNo !== 'UNDEFINED' && memNo !== 'NULL') {
                    nos.add(memNo);
                  }
                });
              });
            }
            setDispatchedHistoryNos(nos);
          }
        } catch (error) {
          console.error('Failed to load additional sheet data:', error);
        } finally {
          setLoading(false);
        }
      };
      
      fetchAdditionalData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
    } else {
      result = result.filter(item => {
        const val = String(item.extracted.firstPayDate || '').trim();
        const isDate = /^\d{4}[-./]?\d{2}[-./]?\d{2}/.test(val);
        return isDate;
      });
    }

    // 1. "우편 미발송만" 필터 활성화 시 (최우선 강제 조건)
    if (filterPostNotSent) {
      result = result.filter(item => {
        const cleanMemNo = String(item.extracted.memNo || '').trim().toUpperCase();
        const isPost = String(item.extracted.workAddress || '').trim() === '우편';
        const isSavedInHistory = cleanMemNo && cleanMemNo !== 'UNDEFINED' && cleanMemNo !== 'NULL' && dispatchedHistoryNos.has(cleanMemNo);
        return isPost && !isSavedInHistory;
      });
    } else {
      // 2. 일반 / 우편 필터링 기본 체계 작동
      result = result.filter(item => {
        const cleanMemNo = String(item.extracted.memNo || '').trim().toUpperCase();
        const isSavedInHistory = cleanMemNo && cleanMemNo !== 'UNDEFINED' && cleanMemNo !== 'NULL' && dispatchedHistoryNos.has(cleanMemNo);
        const certVal = String(item.extracted.cert || '').trim();

        if (filterWorkAddressPost) {
          // 우편 모드 상태인 경우 -> 구글시트 '증서발송리스트'에 저장(포함)되었는지 여부로 판단
          if (certFilterType === 'notSent') {
            return !isSavedInHistory;
          } else if (certFilterType === 'sent') {
            return isSavedInHistory;
          } else {
            return true;
          }
        } else {
          // 일반 모드 상태인 경우 -> 시트1 AX열(cert) 값이 '미발송'인지 여부로 판단
          if (certFilterType === 'notSent') {
            return certVal === '미발송';
          } else if (certFilterType === 'sent') {
            return certVal !== '미발송';
          } else {
            return true;
          }
        }
      });

      // 우편 배송 조건 강제
      if (filterWorkAddressPost) {
        result = result.filter(item => String(item.extracted.workAddress || '').trim() === '우편');
      }
    }

    if (!searchTerm) return result;
    const term = searchTerm.toLowerCase();
    return result.filter(item => {
      const ext = item.extracted;
      const searchString = `${ext.memName} ${ext.memNo} ${ext.empName} ${ext.rentalNo}`.toLowerCase();
      return searchString.includes(term);
    });
  }, [combinedData, selectedMonth, selectedProducts, filterFirstPayNotDate, certFilterType, filterWorkAddressPost, filterPostNotSent, searchTerm]);

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

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // 필터나 검색어가 바뀔 때 선택 초기화
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchTerm, selectedMonth, selectedProducts, isConsolidated, filterFirstPayNotDate, certFilterType, filterWorkAddressPost, filterPostNotSent]);

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

  const postItemsInProcessed = useMemo(() => {
    return processedData.filter(item => String(item.extracted.workAddress || '').trim() === '우편');
  }, [processedData]);

  const isAllSelected = useMemo(() => {
    if (postItemsInProcessed.length === 0) return false;
    return postItemsInProcessed.every(item => selectedIds.has(item.id));
  }, [postItemsInProcessed, selectedIds]);

  const handleToggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (isAllSelected) {
        postItemsInProcessed.forEach(item => next.delete(item.id));
      } else {
        postItemsInProcessed.forEach(item => next.add(item.id));
      }
      return next;
    });
  };

  const [labelStartPos, setLabelStartPos] = useState<number>(1);

  const handlePrintLabels = () => {
    const selectedItems = combinedData.filter(item => selectedIds.has(item.id) && String(item.extracted.workAddress || '').trim() === '우편');
    if (selectedItems.length === 0) return;

    const printWindow = window.open('', '_blank', 'width=850,height=900');
    if (!printWindow) {
      alert('팝업 차단이 설정되어 있습니다. 팝업을 허용해 주세요.');
      return;
    }

    const itemsPerPage = 16;
    let pagesHtml = '';

    // 시작 위치(1~16)에 따라 첫 페이지의 앞 빈칸 개수 계산 (0-indexed offset)
    const offset = Math.max(0, Math.min(15, labelStartPos - 1));
    
    // 전체 라벨 슬롯 배열 구성 (첫 페이지 offset 빈 공간 + 데이터 + 나머지 빈 공간)
    const totalSlots: (any | null)[] = [];
    for (let i = 0; i < offset; i++) {
      totalSlots.push(null);
    }
    selectedItems.forEach(item => totalSlots.push(item));

    for (let i = 0; i < totalSlots.length; i += itemsPerPage) {
      const pageItems = totalSlots.slice(i, i + itemsPerPage);
      let cellsHtml = '';

      for (let j = 0; j < 16; j++) {
        const item = pageItems[j];
        if (item) {
          const ext = item.extracted;
          cellsHtml += `
            <div class="label-cell">
              <div class="label-row-top">
                <span class="label-header">받는 사람</span>
                <span class="label-zip">${ext.zipCode || ''}</span>
              </div>
              <div class="label-address">${ext.address || ''}</div>
              <div class="label-footer">
                <span class="label-phone">${ext.phone || ''}</span>
                <span class="label-name">${ext.memName || ''} <small>귀하</small></span>
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
          <title>라벨 인쇄 (99.1 x 33.9mm / 16칸)</title>
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
              padding-top: 14mm;
              padding-bottom: 10mm;
              padding-left: 2.9mm;
              padding-right: 8.9mm;
              display: grid;
              grid-template-columns: repeat(2, 99.1mm);
              grid-template-rows: repeat(8, 33.9mm);
              column-gap: 4.0mm;
              row-gap: 0mm;
              page-break-after: always;
            }
            .label-page:last-child {
              page-break-after: avoid;
            }
            .label-cell {
              box-sizing: border-box;
              padding: 3mm 4mm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow: hidden;
            }
            .label-cell.empty {
              visibility: hidden;
            }
            .label-row-top {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 1px solid #999;
              padding-bottom: 1mm;
              margin-bottom: 1mm;
            }
            .label-header {
              font-size: 9.5pt;
              font-weight: bold;
              color: #333;
            }
            .label-zip {
              font-size: 10pt;
              font-weight: bold;
              color: #000;
              letter-spacing: 0.5px;
            }
            .label-address {
              font-size: 10pt;
              line-height: 1.35;
              color: #000;
              word-break: break-all;
              flex-grow: 1;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
              margin-bottom: 1mm;
              text-align: left;
            }
            .label-footer {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              margin-top: auto;
            }
            .label-phone {
              font-size: 9pt;
              color: #444;
              font-family: monospace;
            }
            .label-name {
              font-size: 11pt;
              font-weight: bold;
              color: #000;
            }
            .label-name small {
              font-size: 9pt;
              font-weight: normal;
              color: #333;
              margin-left: 2px;
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
              .label-cell {
                border: 1px dashed #ccc;
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
              .label-cell {
                border: none;
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

  const [saving, setSaving] = useState(false);

  const handleSaveDispatch = async () => {
    // 체크박스로 선택된 데이터 중 "우편" 발송 건만 필터링하여 저장
    const targetData = processedData.filter(item => 
      selectedIds.has(item.id) && String(item.extracted.workAddress || '').trim() === '우편'
    );

    if (targetData.length === 0) {
      await (window as any).customAlert('선택된 우편 발송 대상이 없습니다. 수령지가 우편인 대상을 선택해 주세요.', '알림');
      return;
    }

    if (!await (window as any).customConfirm(`현재 선택된 우편 발송 대상 ${targetData.length}건의 데이터를 구글 시트 '증서발송리스트'에 우편발송 저장하시겠습니까?`, '우편 발송 저장')) {
      return;
    }

    setSaving(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const rows = targetData.map(item => {
        const ext = item.extracted;
        const type = '우편'; // 항상 우편 발송 건만 필터링하여 저장하므로 고정

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
        // 로컬 상태에 새로 저장된 회원번호들을 추가해 즉시 음영 반영
        setDispatchedHistoryNos(prev => {
          const next = new Set(prev);
          targetData.forEach(item => {
            const ext = item.extracted;
            [ext.memNo, ext.rentalNo2, ext.rentalNo3].forEach(no => {
              const cleanNo = String(no || '').trim().toUpperCase();
              if (cleanNo && cleanNo !== 'UNDEFINED' && cleanNo !== 'NULL') {
                next.add(cleanNo);
              }
            });
          });
          setSelectedIds(new Set());
          return next;
        });
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
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700">
                  <span className="text-slate-400 font-medium">시작 위치:</span>
                  <select
                    value={labelStartPos}
                    onChange={(e) => setLabelStartPos(Number(e.target.value))}
                    className="bg-transparent font-bold text-blue-600 focus:outline-none cursor-pointer"
                  >
                    {Array.from({ length: 16 }, (_, index) => index + 1).map((num) => (
                      <option key={num} value={num}>
                        {num}번 ({Math.ceil(num / 2)}줄 {num % 2 === 1 ? '좌' : '우'})
                      </option>
                    ))}
                  </select>
                </div>

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
                  onClick={handleSaveDispatch}
                  disabled={saving || selectedIds.size === 0}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-400 rounded-lg text-[13px] font-bold transition-colors border border-blue-200"
                >
                  <Save size={16} />
                  {saving ? '저장 중...' : '우편발송저장'}
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
                    <span className="text-[13px] font-medium text-slate-700 select-none whitespace-nowrap">증서 구분:</span>
                    <select
                      value={certFilterType}
                      onChange={(e) => setCertFilterType(e.target.value as any)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-[13px] font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer shadow-sm"
                    >
                      <option value="notSent">미발송</option>
                      <option value="sent">발송완료</option>
                      <option value="all">전체</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 px-3 border-l border-slate-200 pl-4">
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
                  <div className="flex items-center gap-2 px-3 border-l border-slate-200 pl-4">
                    <input
                      type="checkbox"
                      id="post-notsent-check"
                      checked={filterPostNotSent}
                      onChange={(e) => setFilterPostNotSent(e.target.checked)}
                      className="w-4 h-4 text-rose-600 border-slate-300 rounded focus:ring-rose-500 cursor-pointer"
                    />
                    <label htmlFor="post-notsent-check" className="text-[13px] font-bold text-rose-600 cursor-pointer select-none whitespace-nowrap">
                      우편 미발송만
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
                            <th className="p-3 text-[11px] font-bold text-slate-500 whitespace-nowrap w-[40px] text-center">
                              {postItemsInProcessed.length > 0 && (
                                <input
                                  type="checkbox"
                                  checked={isAllSelected}
                                  onChange={handleToggleSelectAll}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4 align-middle"
                                />
                              )}
                            </th>
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
                            const cleanMemNo = String(ext.memNo || '').trim().toUpperCase();
                            const isPost = String(ext.workAddress || '').trim() === '우편';
                            const isSavedInHistory = cleanMemNo && cleanMemNo !== 'UNDEFINED' && cleanMemNo !== 'NULL' && dispatchedHistoryNos.has(cleanMemNo);
                            const certVal = String(ext.cert || '').trim();

                            // 우편인 건은 구글시트 발송이력에 있는 경우, 일반 건은 AX열(cert)에 발송처리가 기록된 경우 발송 완료로 판단 (공백 제외)
                            const isDispatched = isPost ? isSavedInHistory : (certVal !== '미발송' && certVal !== '');
                            return (
                              <tr key={idx} className={`border-b border-slate-100 transition-colors ${
                                isDispatched 
                                  ? 'bg-amber-50/60 hover:bg-amber-100/60' 
                                  : 'hover:bg-slate-50/50'
                              }`}>
                                <td className="p-3 text-center whitespace-nowrap w-[40px]">
                                  {String(ext.workAddress || '').trim() === '우편' ? (
                                    <input
                                      type="checkbox"
                                      checked={selectedIds.has(item.id)}
                                      onChange={() => handleToggleSelect(item.id)}
                                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4 align-middle"
                                    />
                                  ) : (
                                    <span className="text-[10px] text-slate-300 font-semibold select-none">-</span>
                                  )}
                                </td>
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
